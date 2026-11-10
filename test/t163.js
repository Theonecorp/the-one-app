/* v0.8.174 시험 — 🖼 Notes Display 손질 · 🧩 인서트 요청에 "어떤 것" 설명
 *   ① 세일즈맨 메모 탭: C13 Insert 를 올리면 설명 칸(data-rqn) + 🧩 세트 고르기 → SET ORDER 분류의 아이템을 고르면 "코드 이름" 이 들어감 · 주문에 reqNote 로 저장 · 받침(LD 등)은 설명 칸 없음
 *   ② 사무실 주문 창: 요청 줄에 설명이 같이 보임 · 🖼 Notes Display 를 열면 종류 · 개수 · 설명이 상품 줄로 미리 채워짐(직접 입력) · 저장하면 items[].note
 *   ③ 새 요청 칸: 고객 입력칸이 넓고 ＋ 고객 등록 단추는 좁음 · 상품 목록에 설정 상품 · ✏️ 직접 입력 · 카탈로그 디스플레이 · 세트 묶음 · 카탈로그 아이템을 고르면 c(코드) 가 남음
 *   ④ 창고: ⏸ 보류(이유) → 보류 KPI · 카드 · ▶ 다시 진행 → 대기 · 준비 시작 → ↩ 대기로 → 다시 시작 → ⚠️ 문제 기록이 카드에 남음 · 완료 뒤 ↩ 다시 준비 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8828', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = "const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j); rows.forEach(r => { if (r[0] === 'FLSIDE52') { r[5] = 'Set & Display'; r[6] = 'SET ORDER\"\"'; r[7] = 'FLOOR'; r[8] = 'BODY J'; } }); c0.j = JSON.stringify(rows); const meta = s.catalog.find(x => x.id === 'meta'); meta.cats = meta.cats.concat(['Set & Display\\u0001SET ORDER\"\"\\u0001FLOOR\\u0001BODY J']);";
  const mk = async (email, job, seed, w) => {
    const pg = await (await br.newContext({ viewport: { width: w || 430, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', (o.job ? 'let u = s.users.find(x => x.id === "' + o.email + '"); if (!u) { u = { id: "' + o.email + '", email: "' + o.email + '", name: "X", active: true }; s.users.push(u); } u.role = "manager"; u.job = "' + o.job + '";' : '') + o.seed); }, { email, job, seed: SEED + (seed || '') });
    await pg.goto('http://127.0.0.1:8828/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300); return pg;
  };
  /* ① 세일즈맨 */
  const sm = await mk('brandon@x.com', '');
  await sm.evaluate(() => { location.hash = '#/order/new'; }); await sm.waitForSelector('#eStoreQ'); await sm.fill('#eStoreQ', 'ali'); await sm.waitForTimeout(250); await sm.click('#eStoreHits [data-ac]'); await sm.waitForTimeout(900); if (await sm.$('#modal.on')) { await sm.click('#modal .mclose'); await sm.waitForTimeout(200); }
  await sm.fill('#eQ1', 'AHG100'); await sm.waitForTimeout(500); await sm.click('#eRes [data-gc="AHG100"], #eRes tr[data-frow="AHG100"] td.ct'); await sm.waitForTimeout(300);
  await sm.click('[data-ev="memo"]'); await sm.waitForTimeout(400);
  if (await sm.$('[data-rqn="C13"]')) errs.push('① no note box before the count is raised');
  await sm.click('[data-rqp="C13"]'); await sm.waitForTimeout(300); await sm.click('[data-rqp="LD"]'); await sm.waitForTimeout(300);
  if (!(await sm.$('[data-rqn="C13"]'))) errs.push('① C13 Insert ×1 shows a "which one" note box'); if (await sm.$('[data-rqn="LD"]')) errs.push('① LD (a display base) needs no note box');
  await sm.fill('[data-rqn="C13"]', 'ANKLET 13'); await sm.waitForTimeout(200);
  await sm.click('[data-rqset="C13"]'); await sm.waitForSelector('#rsQ'); await sm.fill('#rsQ', 'FLSIDE'); await sm.waitForTimeout(200); const hits = await sm.$$eval('#rsHits [data-rsc]', e => e.map(x => x.dataset.rsc)); log('① set hits:', hits.join(' '));
  if (!hits.includes('FLSIDE52')) errs.push('① set picker lists SET ORDER items'); else { await sm.click('#rsHits [data-rsc="FLSIDE52"]'); await sm.waitForTimeout(400); }
  const note = await sm.$eval('[data-rqn="C13"]', e => e.value).catch(() => ''); log('① note:', note);
  if (!/ANKLET 13 \/ FLSIDE52 FL INT #52/.test(note)) errs.push('① picking a set appends "code name" to the note (got ' + note + ')');
  const sum = await sm.$eval('#eBody .alert.a-amb', e => e.textContent).catch(() => ''); if (!/C13 Insert ×1 \(ANKLET 13 \/ FLSIDE52/.test(sum)) errs.push('① request summary shows the note (got ' + sum.slice(0, 80) + ')');
  await sm.click('#eDraft'); await sm.waitForTimeout(300); if (await sm.$('#cfOk')) await sm.click('#cfOk'); await sm.waitForTimeout(1200);
  const saved = await sm.evaluate(() => { const O = window.__MOCK_STORE__.orders || {}; const k = Object.keys(O).pop(); return k ? { id: k, req: O[k].req, reqNote: O[k].reqNote } : null; }); log('① saved:', JSON.stringify(saved));
  if (!saved || !saved.req || saved.req.C13 !== 1 || !saved.reqNote || !/ANKLET 13 \/ FLSIDE52/.test(saved.reqNote.C13 || '')) errs.push('① order saves req + reqNote');
  if (saved && saved.reqNote && saved.reqNote.LD) errs.push('① empty notes are dropped');
  await sm.context().close();
  /* ② 사무실 — 주문 창 · Notes Display 미리 채움 (주문은 시드로: 보낸 주문 + 요청 + 설명) */
  const OSEED = "s.orders[0].req = { C13: 1, LD: 2 }; s.orders[0].reqNote = { C13: 'ANKLET 13 / FLSIDE52 FL INT #52 - BODY J - CHIN (66PC)' };";
  const of = await mk('office@theonefl.com', 'invoice', OSEED, 1600);
  await of.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await of.waitForSelector('#mDisp', { timeout: 8000 }).catch(() => errs.push('② order screen should have 🖼 Notes Display'));
  const alert = await of.$$eval('#page .alert', e => e.map(x => x.textContent).join(' | ')); if (!/C13 Insert ×1 \(ANKLET 13 \/ FLSIDE52/.test(alert)) errs.push('② office order screen shows the insert note (got ' + alert.slice(0, 120) + ')');
  if (await of.$('#mDisp')) {
    await of.click('#mDisp'); await of.waitForSelector('#dvSave', { timeout: 4000 }); await of.waitForTimeout(300);
    const pre = await of.evaluate(() => [...document.querySelectorAll('[data-dvi]')].map(s => ({ v: s.value, c: (document.querySelector('[data-dvc="' + s.dataset.dvi + '"]') || {}).value, n: (document.querySelector('[data-dvn="' + s.dataset.dvi + '"]') || {}).value, q: (document.querySelector('[data-dvq="' + s.dataset.dvi + '"]') || {}).value }))); log('② prefilled:', JSON.stringify(pre));
    const c13 = pre.find(x => x.c === 'C13 Insert'), ld = pre.find(x => x.c === 'LD');
    if (!c13 || c13.v !== '__custom__' || !/ANKLET 13/.test(c13.n) || c13.q !== '1' || !ld || ld.q !== '2') errs.push('② Notes Display is prefilled with the requested kinds, counts and notes');
    /* ③ 칸 비율 · 상품 목록 */
    const w = await of.evaluate(() => ({ store: document.getElementById('dvStore').getBoundingClientRect().width, btn: document.getElementById('dvNewAcct').getBoundingClientRect().width, groups: [...document.querySelectorAll('[data-dvi="0"] optgroup')].length, cat: !!document.querySelector('[data-dvi="0"] option[value="c:FLSIDE52"]') })); log('③ widths:', JSON.stringify(w));
    if (w.store < w.btn * 3) errs.push('③ customer input is wide and the New-customer button narrow (' + w.store + ' vs ' + w.btn + ')');
    if (w.groups !== 3 || !w.cat) errs.push('③ item list has 3 groups incl. the catalog set FLSIDE52');
    await of.selectOption('[data-dvi="1"]', 'c:FLSIDE52'); await of.waitForTimeout(100);
    await of.click('#dvSave'); await of.waitForTimeout(900);
    const D = await of.evaluate(() => Object.values(window.__MOCK_STORE__.displays || {})); log('② saved:', JSON.stringify(D.map(d => ({ st: d.st, items: d.items }))));
    const d0 = D[0] || {}, i0 = (d0.items || []).find(x => x.n === 'C13 Insert') || {}, i1 = (d0.items || []).find(x => x.c === 'FLSIDE52') || {};
    if (D.length !== 1 || !i0.custom || !/ANKLET 13/.test(i0.note || '') || i0.q !== 1) errs.push('② saved display keeps the custom insert with its note');
    if (!i1.c || !/BODY J - CHIN/.test(i1.n) || i1.q !== 2) errs.push('③ catalog item saved with code + name');
  }
  await of.context().close();
  /* ④ 창고 매니저 */
  const DSEED = 's.displays = [{ id: "DS1", acct: "1111", store: "ALI B/S # 1", sm: "BRANDON", items: [{ n: "C13 Insert", q: 1, custom: true, note: "ANKLET 13" }], qty: 1, due: "2026-11-10", st: "open", createdBy: "office@theonefl.com", createdByName: "EunJi", createdAt: "2026-11-09T10:00:00Z" }];';
  const wh = await mk('joao@theonefl.com', 'whmgr', DSEED, 1200);
  await wh.evaluate(() => { location.hash = '#/displays'; }); await wh.waitForSelector('[data-dv="DS1"]', { timeout: 8000 }); await wh.waitForTimeout(200);
  const kpi = () => wh.$$eval('.dvk b', e => e.map(x => x.textContent));
  const st = () => wh.evaluate(() => (window.__MOCK_STORE__.displays.DS1 || {}).st);
  await wh.click('[data-dvhold="DS1"]'); await wh.waitForSelector('#atT'); await wh.fill('#atT', '물건 없음'); await wh.click('#atOk'); await wh.waitForTimeout(600);
  let k = await kpi(); log('④ after hold: st', await st(), 'kpi', k.join('/'));
  if ((await st()) !== 'hold' || k[2] !== '1' || !(await wh.$('.dvcard.hold [data-dvresume="DS1"]'))) errs.push('④ hold: state, KPI 보류 1, card with Resume');
  const tag = await wh.$eval('[data-dv="DS1"] .dvhd', e => e.textContent); if (!/보류.*물건 없음/.test(tag)) errs.push('④ hold reason on the card');
  const msg = await wh.evaluate(() => Object.values(window.__MOCK_STORE__.msgs || {}).filter(m => m.to === 'u:office@theonefl.com').length); if (!msg) errs.push('④ the office requester gets an in-app message on hold');
  await wh.click('[data-dvresume="DS1"]'); await wh.waitForTimeout(600); if ((await st()) !== 'open') errs.push('④ resume → open');
  await wh.click('[data-dvgo="DS1"]'); await wh.waitForTimeout(600); if ((await st()) !== 'prep') errs.push('④ start → prep');
  await wh.click('[data-dvback="DS1"]'); await wh.waitForTimeout(300); if (await wh.$('#cfOk')) await wh.click('#cfOk'); await wh.waitForTimeout(600); if ((await st()) !== 'open') errs.push('④ undo start → open');
  await wh.click('[data-dvlog="DS1"]'); await wh.waitForSelector('#atT'); await wh.fill('#atT', '수량 부족 1'); await wh.click('#atOk'); await wh.waitForTimeout(600);
  const lg = await wh.$eval('[data-dv="DS1"] .dvlog', e => e.textContent).catch(() => ''); log('④ log:', lg); if (!/수량 부족 1/.test(lg)) errs.push('④ logged issue shows on the card');
  await wh.click('[data-dvgo="DS1"]'); await wh.waitForTimeout(600); await wh.click('label.ckw:has([data-dvok="DS1|0"])'); await wh.waitForTimeout(600); await wh.click('[data-dvdone="DS1"]'); await wh.waitForTimeout(900); if (await wh.$('#modal.on')) { await wh.click('#modal .mclose'); await wh.waitForTimeout(300); }
  if ((await st()) !== 'done') errs.push('④ done'); else { await wh.waitForSelector('[data-dvredo="DS1"]', { timeout: 4000 }).catch(() => errs.push('④ Redo button after done')); if (await wh.$('[data-dvredo="DS1"]')) { await wh.click('[data-dvredo="DS1"]'); await wh.waitForTimeout(300); if (await wh.$('#cfOk')) await wh.click('#cfOk'); await wh.waitForTimeout(600); if ((await st()) !== 'prep') errs.push('④ redo → prep'); } }
  const logN = await wh.evaluate(() => ((window.__MOCK_STORE__.displays.DS1 || {}).log || []).length); log('④ log entries:', logN); if (logN < 4) errs.push('④ every step is logged');
  await wh.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
