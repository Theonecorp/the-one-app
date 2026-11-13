/* v0.8.229 시험 — 🧮 발주 계획 (projeto estoque 의 Planejamento de Compras): 끝난 달 평균 · 재고 0 인 날 빼기(12개월과 비교) · 세트는 구성품 · 오는 중(보낸 발주서) · 상태 · 살 수량
 *   📋 제안: 상태 카드가 거르기 · 수량 고치기(제안 ↺) · 고르기 · 왜 이 수량? · CSV  🏭 공장별: 공장 없는 아이템은 빠지고 경고 · 초안 발주서 공장마다 하나 · 같은 번호로 다시 눌러도 두 벌 안 생김
 *   🧾 발주서: 보냄 → 오는 중으로 계산 · 받은 수량(주문보다 많으면 거부) · 다 받음 · 취소 규칙 · 세일즈맨은 못 봄
 *   🔐 권한: 오피스 매니저 = 보기 · 공장 설정 저장 / 창고 매니저 = 보기 · 설정 잠김 / 다른 담당자 · 세일즈맨 = 못 봄 · firestore.rules 도 같은 사람만 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8964', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], fails = [], log = (...a) => console.log(...a);
  const noToast = () => pg.waitForFunction(() => !document.getElementById('toast').classList.contains('on'));   // 알림(toast)이 아래 단추를 가리는 동안은 기다림
  const ok = (cond, name) => { log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fails.push(name); };

  /* 끝난 달 3개 · 12개 — 화면과 같은 규칙 (UTC) */
  const t = new Date(), Y = t.getUTCFullYear(), M = t.getUTCMonth();
  const mday = (back, day) => new Date(Date.UTC(Y, M - back, day)).toISOString().substring(0, 10);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
  const W3 = [mday(3, 1), new Date(Date.UTC(Y, M, 1) - 864e5).toISOString().substring(0, 10)], W12 = [mday(12, 1), W3[1]];
  const D3 = days(W3[0], W3[1]), D12 = days(W12[0], W12[1]);

  const seed = (s, a) => {
    const rows = JSON.parse(s.catalog[1].j);
    const sup = { AHG100: 'JD', AHG101: 'JD', AHG105: 'RM', AHG110: 'RM' };
    rows.forEach(r => { if (sup[r[0]]) { r[11] = r[11] || ''; r[12] = sup[r[0]]; } });
    s.catalog[1].j = JSON.stringify(rows); s.catalog[0].ver = 'T1P'; s.catalog[1].ver = 'T1P';
    s.settings[0].suppliers = [{ code: 'JD', name: 'ZHEJIANG JUDA', alias: 'China 1' }, { code: 'RM', name: 'QINGDAO RUMINO', alias: 'China 2' }];
    s.settings[0].planParams = { RM: { lead: 30, seg: 15, cyc: 30 } };
    s.stock = (s.stock || []).concat([{ id: 'AHG100', code: 'AHG100', qty: 100 }, { id: 'AHG101', code: 'AHG101', qty: 2000 }, { id: 'AHG102', code: 'AHG102', qty: 0 }, { id: 'AHG105', code: 'AHG105', qty: 0 }, { id: 'AHG110', code: 'AHG110', qty: 5 }]);
    const inv = (no, d, lines) => ({ id: no, no, t: 'A', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', d, ym: d.substring(0, 7), lines, total: 1, st: 'open' });
    const L = [];
    for (let b = 1; b <= 3; b++) {
      L.push(inv('A9' + b + '00', a.mday(b, 10), [{ c: 'AHG100', d: '', q: 300, p: 1 }, { c: 'AHG101', d: '', q: 30, p: 1 }, { c: 'AHG102', d: '', q: 60, p: 1 }]));
      L.push(inv('A9' + b + '01', a.mday(b, 12), [{ c: 'FI-TEST01', d: 'SET', q: 2, p: 1, kit: [{ c: 'AHG110', q: 6 }] }]));
    }
    L.push(inv('A9999', a.mday(1, 15), [{ c: 'AHG100', d: '', q: 999, p: 1 }])); L[L.length - 1].st = 'x';   // VOID — 세지 않음
    for (let b = 4; b <= 12; b++) L.push(inv('A98' + b, a.mday(b, 10), [{ c: 'AHG105', d: '', q: 200, p: 1 }]));
    L.push(inv('A9750', a.mday(3, 5), [{ c: 'AHG105', d: '', q: 10, p: 1 }]));
    s.invoices = (s.invoices || []).concat(L);
    /* AHG105: 창 시작 6일째에 0 이 되어 지금까지 0 — 재고 0 인 날이 많음 */
    const z = a.mday(3, 6);
    s.stockLog = (s.stockLog || []).concat([{ id: 'LZ1', code: 'AHG105', d: z, at: z + 'T12:00:00Z', delta: -10, before: 10, after: 0, kind: 'inv', ref: 'A9750' }]);
  };
  const pg = await br.newPage({ viewport: { width: 1280, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(([f, a]) => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; const A = { mday: new Function('back', 'day', a) }; const F = new Function('s', 'a', f); window.__AFTER_SEED__ = s => F(s, A);   /* 함수는 미리 만듦 — 페이지의 CSP(unsafe-eval 금지)가 켜지기 전에 */ },
    ['(' + seed.toString() + ')(s, a)', 'const t=new Date();return new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()-back,day)).toISOString().substring(0,10);']);
  await pg.goto('http://127.0.0.1:8964/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });

  log('▶ 메뉴: 📦 재고 · 💼 경영 묶음에 🧮 발주 계획');
  await pg.evaluate(() => { location.hash = '#/hub/wh'; }); await pg.waitForTimeout(500);
  ok(await pg.$('[data-go="plan"], [href="#/plan"], [data-r="plan"]') !== null || /발주 계획/.test(await pg.textContent('#page')), '재고 묶음에 발주 계획 칸');

  log('▶ 📋 제안 — 계산');
  await pg.evaluate(() => { location.hash = '#/plan'; }); await pg.waitForSelector('.pl-cards', { timeout: 15000 });
  const row = async c => pg.evaluate(c => { const el = document.querySelector('[data-plc="' + c + '"]'); if (!el) return null; return { st: el.querySelector('.pl-st').className, q: Number(el.querySelector('[data-plq]').value), meta: el.querySelector('.pl-meta').textContent }; }, c);
  const exp = (sold, dd, qty, lead, seg, cyc, tr) => { const avg = sold / dd; return Math.ceil(Math.max(avg * (lead + cyc) + avg * seg - (qty + (tr || 0)), 0)); };
  let r100 = await row('AHG100');
  ok(r100 && /pl-buy_now/.test(r100.st), 'AHG100 지금 사기 (재고 100, 월 300)');
  ok(r100 && r100.q === exp(900, D3, 100, 60, 30, 60), 'AHG100 살 수량 = 평균 × (60+60) + 안전 30일 − 100 = ' + exp(900, D3, 100, 60, 30, 60) + ' (화면 ' + (r100 && r100.q) + ') — VOID 인보이스 999개는 안 셈');
  const r102 = await row('AHG102');
  ok(r102 && /pl-buy_now/.test(r102.st) && r102.q === exp(180, D3, 0, 60, 30, 60), 'AHG102 (공장 없음 · 기본 설정) 살 수량');
  const r110 = await row('AHG110');
  ok(r110 && r110.q === exp(36, D3, 5, 30, 15, 30), '세트 FI-TEST01 ×2 → 구성품 AHG110 6×2 씩 · 공장 RM 설정(30/15/30) — ' + (r110 && r110.q));
  const r105 = await row('AHG105');
  const zero105 = D3 - 5, exp105 = Math.ceil((1800 + 10) / D12 * (30 + 30 + 15));
  ok(r105 && r105.q === exp105, 'AHG105 재고 0 인 날(' + zero105 + '일)이 있어 12개월 평균 사용 → ' + exp105 + ' (화면 ' + (r105 && r105.q) + ')');
  ok(!(await row('AHG101')), 'AHG101 (재고 2000 · 과다) 은 "사야 할 것만" 에서 안 보임');

  log('▶ 상태 카드 = 거르기');
  await pg.click('[data-plst="excess"]'); await pg.waitForTimeout(200);
  const r101 = await row('AHG101');
  ok(r101 && /pl-excess/.test(r101.st), '과다 카드 → AHG101 과다');
  ok(await pg.$$eval('[data-plc]', els => els.length) === await pg.$eval('[data-plst="excess"] b', b => Number(b.textContent.replace(/,/g, ''))), '카드 숫자 = 목록 줄 수');
  await pg.click('[data-plst="excess"]'); await pg.waitForTimeout(200);

  log('▶ 왜 이 수량?');
  await pg.click('[data-plc="AHG105"] .pl-main'); await pg.waitForSelector('.pl-why');
  const why = await pg.textContent('#mbox');
  ok(/12/.test(why) && /재고 0 인 날|Days out of stock/.test(why), '설명에 재고 0 · 12개월 평균');
  ok(await pg.$$eval('.pl-bc', e => e.length) === 12, '12개월 막대');
  await pg.click('#plWhyX');

  log('▶ 수량 고치기 · 고르기');
  await pg.fill('[data-plq="AHG100"]', '5000'); await pg.press('[data-plq="AHG100"]', 'Tab'); await pg.waitForTimeout(200);
  ok(await pg.$eval('[data-plq="AHG100"]', i => i.classList.contains('ed') && i.value === '5000'), '고친 수량은 표시(주황)');
  ok(/제안|sugg/.test(await pg.textContent('[data-plreset="AHG100"]')), '제안 수량 ↺ 보임');
  ok(await pg.$eval('[data-plsel="AHG100"]', c => c.checked), '고치면 자동으로 고름');
  await pg.check('[data-plsel="AHG110"]'); await pg.check('[data-plsel="AHG102"]'); await pg.waitForTimeout(150);
  ok(/3/.test(await pg.textContent('#plBar')), '아래 막대: 3개 고름');

  log('▶ 🏭 공장별');
  await pg.click('#plGo'); await pg.waitForSelector('#plMake');
  const sup = await pg.textContent('#plBody');
  ok(/China 1|JUDA/.test(sup) && /China 2|RUMINO/.test(sup), '공장 둘');
  ok(/공장이 없는|No supplier/.test(sup) && /AHG102/.test(sup), '공장 없는 AHG102 는 따로 · 경고');
  ok(/2 ?개 발주서|2 POs/.test(sup), '발주서 2개 예정');
  log('▶ 중간에 끊김 → 다시 누르면 빠진 것만 (두 벌 안 생김)');
  /* 두 번째 발주서를 쓰는 순간 한 번 실패하게 — 와이파이가 끊겨 응답을 못 받은 것과 같음 */
  await pg.evaluate(() => { let fail = true; window.__MOCK_STORE__.purchaseOrders = new Proxy({}, { set(t, k, v) { if (fail && Object.keys(t).length === 1) { fail = false; throw new Error('network'); } t[k] = v; return true; } }); });
  await pg.click('#plMake'); await pg.waitForTimeout(150); await pg.click('#cfOk'); await pg.waitForTimeout(800);
  ok((await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.purchaseOrders).length)) === 1, '끊김: 1개만 만들어짐');
  ok(/다시 누르면|press again/.test(await pg.textContent('#toast')), '끊김 알림: 다시 누르면 빠진 것만');
  ok(!!(await pg.$('#plMake')), '고른 것 그대로 · 공장별 화면에 남음');
  await noToast(); await pg.click('#plMake'); await pg.waitForTimeout(150); await pg.click('#cfOk'); await pg.waitForTimeout(800);
  let POS = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.purchaseOrders || {}));
  ok(POS.length === 2 && POS.every(p => p.st === 'draft'), '초안 발주서 2개');
  const jd = POS.find(p => p.sup === 'JD');
  ok(jd && jd.lines.length === 1 && jd.lines[0].c === 'AHG100' && jd.lines[0].q === 5000, 'JD 발주서 = AHG100 5000 (고친 수량)');
  ok(POS.every(p => /^PO-\d{4}-\d{6}$/.test(p.no)) && POS[0].no !== POS[1].no, '번호 PO-YYYY-NNNNNN · 겹치지 않음');
  ok(!POS.some(p => p.lines.some(l => l.c === 'AHG102')), '공장 없는 아이템은 발주서에 없음');

  ok(new Set(POS.map(p => p.key)).size === 1, '두 번 누른 것이 같은 번호(key) — 처음 것을 다시 만들지 않음');

  log('▶ 🧾 발주서: 보냄 → 오는 중');
  ok(/PO-/.test(await pg.textContent('#plBody')), '만든 뒤 발주서 탭으로');
  await pg.evaluate(id => document.querySelector('[data-plopen="' + id + '"]').click(), jd.id); await pg.waitForSelector('#poSend');
  await pg.click('#poSend'); await pg.waitForTimeout(500);
  ok((await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id].st, jd.id)) === 'sent', '보냄');
  await pg.click('[data-pl="list"]'); await pg.waitForSelector('.pl-cards');
  await pg.click('[data-plst="transit"]'); await pg.waitForTimeout(200);
  const tr100 = await row('AHG100');
  ok(tr100 && /🚢 5,?000/.test(tr100.meta), 'AHG100 오는 중 5000');
  ok(tr100 && /pl-transit|pl-ok|pl-excess/.test(tr100.st), 'AHG100 이제 사지 않아도 됨 (' + (tr100 && tr100.st) + ')');
  await pg.click('[data-plst="transit"]');

  log('▶ 받은 수량');
  await pg.click('[data-pl="po"]'); await pg.waitForSelector('[data-plpo]');
  await pg.click('[data-plpo="all"]'); await pg.waitForTimeout(200);
  await pg.evaluate(id => document.querySelector('[data-plopen="' + id + '"]').click(), jd.id); await pg.waitForSelector('#poRecv');
  await pg.fill('.pl-rq', '6000'); await noToast(); await pg.click('#poRecv'); await pg.waitForTimeout(300);
  ok((await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id].lines[0].qr, jd.id)) === 0, '주문보다 많이 받음 → 거부');
  await pg.fill('.pl-rq', '2000'); await noToast(); await pg.click('#poRecv'); await pg.waitForTimeout(500);   // 앞의 거부 알림(toast)이 단추 위에 떠 있는 동안은 기다림
  let P1 = await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id], jd.id);
  ok(P1.st === 'partial' && P1.lines[0].qr === 2000, '일부 받음 2000');
  ok((await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG100.qty)) === 100, '재고는 안 바뀜 (입고는 📦 재고 › 📥 입고)');
  await pg.evaluate(id => document.querySelector('[data-plopen="' + id + '"]').click(), jd.id); await pg.waitForSelector('#poRecv');
  ok(!(await pg.$('#poCancel')), '받은 것이 있으면 취소 단추 없음');
  await pg.click('#poAll'); await noToast(); await pg.click('#poRecv'); await pg.waitForTimeout(500);
  ok((await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id].st, jd.id)) === 'recv', '다 왔음 → 다 받음');

  log('▶ 초안 취소');
  const rm = POS.find(p => p.sup === 'RM');
  await pg.evaluate(id => document.querySelector('[data-plopen="' + id + '"]').click(), rm.id); await pg.waitForSelector('#poCancel');
  await pg.click('#poCancel'); await pg.waitForTimeout(150); await pg.click('#cfOk'); await pg.waitForTimeout(500);
  ok((await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id].st, rm.id)) === 'x', '초안 취소');

  log('▶ ⚙️ 공장 설정 — 1~365 만');
  await pg.click('#plPar'); await pg.waitForSelector('[data-plp="JD"]');
  await pg.fill('[data-plp="JD"] [data-k="lead"]', '0'); await noToast(); await pg.click('#plParOk'); await pg.waitForTimeout(200);
  ok(!(await pg.evaluate(() => (window.__MOCK_STORE__.settings.app.planParams || {}).JD)), '0 일은 거부 · 저장 안 됨');
  await pg.fill('[data-plp="JD"] [data-k="lead"]', '90'); await noToast(); await pg.click('#plParOk'); await pg.waitForTimeout(800);
  ok((await pg.evaluate(() => window.__MOCK_STORE__.settings.app.planParams.JD.lead)) === 90, '리드타임 90 저장');
  ok((await pg.evaluate(() => window.__MOCK_STORE__.settings.app.planParams.RM.lead)) === 30, '다른 공장 설정은 그대로');

  log('▶ 📱 폰 화면 — 옆으로 밀리지 않음');
  await pg.setViewportSize({ width: 390, height: 900 }); await pg.click('[data-pl="list"]'); await pg.waitForSelector('.pl-cards'); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '가로 스크롤 없음');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'plan_phone.png') });

  log('▶ 세일즈맨은 못 봄');
  const p2 = await br.newPage({ viewport: { width: 430, height: 900 } }); p2.on('pageerror', e => errs.push(e.message));
  await p2.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' }; });
  await p2.goto('http://127.0.0.1:8964/test/demo.html'); await p2.waitForSelector('#nav button');
  await p2.evaluate(() => { location.hash = '#/plan'; }); await p2.waitForTimeout(800);
  ok(!(await p2.$('.pl-cards')), '세일즈맨: 발주 계획 화면 안 열림');

  log('▶ 담당자 일별 — 오피스 매니저: 보고 · 공장 설정 저장 / 창고 매니저: 보고 · 설정은 못 바꿈 / 창고 직원 · 회계: 못 봄');
  const asJob = async (job) => {
    const p = await br.newPage({ viewport: { width: 1280, height: 1000 } }); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(([f, a, j]) => { window.__MOCK_USER__ = { email: 'job@x.com', name: 'J' }; const A = { mday: new Function('back', 'day', a) };
      const F = new Function('s', 'a', f); window.__AFTER_SEED__ = s => { F(s, A); s.users.push({ id: 'job@x.com', email: 'job@x.com', name: 'J', role: 'manager', job: j, active: true }); }; },
      ['(' + seed.toString() + ')(s, a)', 'const t=new Date();return new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()-back,day)).toISOString().substring(0,10);', job]);
    await p.goto('http://127.0.0.1:8964/test/demo.html'); await p.waitForSelector('#nav button', { state: 'attached' });
    await p.evaluate(() => { location.hash = '#/hub/wh'; }); await p.waitForTimeout(500);
    const tile = /발주 계획|Purchase planning/.test(await p.textContent('#page'));
    await p.evaluate(() => { location.hash = '#/plan'; }); await p.waitForTimeout(1200);
    return { p, tile, open: !!(await p.$('#plPar')) };
  };
  const off = await asJob('office');
  ok(off.tile && off.open, '오피스 매니저: 재고 묶음에 칸 · 화면 열림');
  await off.p.click('#plPar'); await off.p.waitForSelector('[data-plp="JD"]');
  ok(!!(await off.p.$('#plParOk')), '오피스 매니저: 공장 설정 저장 단추 있음');
  await off.p.fill('[data-plp="JD"] [data-k="lead"]', '45'); await off.p.click('#plParOk'); await off.p.waitForTimeout(800);
  ok((await off.p.evaluate(() => (window.__MOCK_STORE__.settings.app.planParams.JD || {}).lead)) === 45, '오피스 매니저: 공장 설정 저장됨');
  await off.p.close();
  const whm = await asJob('whmgr');
  ok(whm.tile && whm.open, '창고 매니저: 재고 묶음에 칸 · 화면 열림');
  await whm.p.click('#plPar'); await whm.p.waitForSelector('[data-plp="JD"]');
  ok(!(await whm.p.$('#plParOk')) && (await whm.p.$eval('[data-plp="JD"] [data-k="lead"]', e => e.disabled)), '창고 매니저: 공장 설정은 보기만 (저장 단추 없음 · 칸 잠김)');
  await whm.p.close();
  for (const j of ['pick', 'acct', 'catalog', 'invoice', 'pickinv']) {
    const x = await asJob(j); ok(!x.tile && !x.open, j + ': 발주 계획 칸 · 화면 없음'); await x.p.close();
  }

  log('▶ firestore.rules 가 화면과 같은 사람만 허락');
  const RULES = require('fs').readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
  const poLine = (RULES.match(/match \/purchaseOrders\/\{id\}[^\n]*/) || [''])[0];
  ok(/staffJob\(\['office', 'whmgr'\]\)/.test(poLine) && !/isStaff\(\)|itemJob\(\)/.test(poLine),'발주서: 관리자 · 오너 · 오피스 매니저 · 창고 매니저만 (다른 담당자 X)');
  ok(/staffJob\(\['office'\]\) && request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['planParams', 'updatedAt'\]\)/.test(RULES), '설정: 오피스 매니저는 planParams 만 고칠 수 있음');

  ok(!errs.length, '페이지 오류 없음 ' + JSON.stringify(errs.slice(0, 3)));
  await br.close(); srv.kill();
  console.log(fails.length ? 'FAIL ' + fails.length + ': ' + fails.join(' | ') : 'PASS t270');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
