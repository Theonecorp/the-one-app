/* v0.8.194 시험 — 📦 Notes UPS: 옛 WMS 의 Notes UPS 화면 — 박스를 재서 6×4 라벨(가게마다 1/N) · 가게별 대기 줄 · Shipping UPS 에서 그 가게 박스를 골라 함께 출고 · Notes Display 완료 → Notes UPS
 *   ① #/notesups: 숫자 4개 (대기 3 · 가게 2) · 대기 줄이 가게별 (3001 = 2박스, 1111 = 1박스)
 *   ② 새 박스: 가게 3001 → 2박스 → 무게 · 길이 · 너비 · 높이 Enter 로 저장 → "지난 박스 크기" → 마지막 박스에서 라벨 4장(그 가게 대기 전부) · 4/4
 *   ③ 고치기(무게) · 취소 → 대기 줄에서 빠짐
 *   ④ Shipping UPS: 3001 → Notes 박스 3개 보임 · A = 모두 넣기 → 라벨 요청(shipq)에 박스 3개(무게 그대로) · UPS 끝나면 박스 shipped · trk
 *   ⑤ Notes Display: 예전 displays 의 완료(done) 요청은 notasDisplay 로 옮겨져 "Concluir" → 단위마다 박스(상품 이름 · 무게) · 라벨에 전체 수 없음 (v0.8.214 옛 WMS 흐름)
 *   (v0.8.214: 화면이 옛 WMS 그대로 바뀌어 선택자만 맞춤 — 대기 줄 tr[data-nota] · 몇 박스 data-act=nu-qtd · 고치기 #nuEdP · 빼기 확인 #esPergSim) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8909', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `const n = new Date().toISOString(), y = new Date(Date.now() - 86400000).toISOString();
    s.upsnotes = [
      { id: 'NU1', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', w: 12, l: 16, wd: 12, h: 10, st: 'open', src: 'notes', at: n, by: 'luke@theonefl.com' },
      { id: 'NU2', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', w: 9, l: 16, wd: 12, h: 10, st: 'open', src: 'notes', at: n, by: 'luke@theonefl.com' },
      { id: 'NU3', acct: '1111', store: 'ALI B/S # 1', w: 5, l: 10, wd: 10, h: 10, st: 'open', src: 'notes', at: n, by: 'luke@theonefl.com' },
      { id: 'NU4', acct: '1111', store: 'ALI B/S # 1', w: 4, l: 10, wd: 10, h: 10, st: 'shipped', shippedAt: n, src: 'notes', at: y, by: 'luke@theonefl.com' },
      { id: 'NU5', acct: '1111', store: 'ALI B/S # 1', w: 4, l: 10, wd: 10, h: 10, st: 'x', src: 'notes', at: n, by: 'luke@theonefl.com' }];
    s.displays = [{ id: 'DS9', acct: '1111', store: 'ALI B/S # 1', st: 'done', items: [{ n: 'LD STACKABLE', q: 2, w: 15, l: 22, wd: 15, h: 15, ok: true }], createdAt: n }];`;
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 950 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o); }, SEED);
  await pg.goto('http://127.0.0.1:8909/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const store = c => pg.evaluate(c => Object.values(window.__MOCK_STORE__[c] || {}), c);
  const printed = async () => { await pg.waitForSelector('#prt.on', { timeout: 8000 }); const P = await pg.$$eval('#prtbody .nulp', L => L.map(x => ({ cx: x.querySelector('.etqn-cx').textContent, conta: x.querySelector('.etqn-conta').textContent, prod: (x.querySelector('.etqn-prod') || {}).textContent || '', med: x.querySelector('.etqn-med').textContent }))); await pg.click('#prtClose'); await pg.waitForTimeout(200); return P; };
  try {
    /* ① */
    await pg.evaluate(() => { location.hash = '#/notesups'; }); await pg.waitForSelector('.sb.nu-raiz tr[data-nota]', { timeout: 8000 }).catch(() => errs.push('① queue shows'));
    const K = await pg.$$eval('.sb .nu-kpis .fin-kpi', L => L.map(k => k.querySelector('.lbl').textContent + '=' + k.querySelector('b').textContent)); log('① cards:', K.join(' | '));
    if (K.length !== 4 || !/=3$/.test(K[3]) || !/=1$/.test(K[2])) errs.push('① 4 cards · waiting 3 · shipped today 1');
    const G = await pg.$$eval('.sb.nu-raiz tr.nu-grupo', L => L.map(r => r.textContent)); log('① groups:', G.length);
    if (G.length !== 2 || (await pg.$$('.sb.nu-raiz tr[data-nota]')).length !== 3) errs.push('① grouped per store · 3 rows');
    /* ② */
    await pg.click('.sb [data-act="nu-novo"]'); await pg.waitForSelector('#nuBusca');
    await pg.fill('#nuBusca', '3001'); await pg.press('#nuBusca', 'Enter'); await pg.waitForSelector('[data-act="nu-qtd"][data-n="2"]');
    await pg.click('[data-act="nu-qtd"][data-n="2"]'); await pg.waitForSelector('#nuP');
    for (const v of ['10', '18', '14', '12']) { await pg.keyboard.type(v); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
    await pg.waitForSelector('.nu-passo.ok', { timeout: 6000 }).catch(() => errs.push('② box 1 saved'));
    if ((await pg.$$('#prt.on')).length) errs.push('② no print before the last box');
    await pg.click('[data-act="nu-ultima"]'); await pg.waitForTimeout(200);
    const pre = await pg.evaluate(() => [document.getElementById('nuC').value, document.getElementById('nuP').value]); if (pre[0] !== '18' || pre[1] !== '') errs.push('② last size copied, weight empty');
    await pg.keyboard.type('7'); for (let i = 0; i < 4; i++) { await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
    const P = await printed(); log('② labels:', JSON.stringify(P.map(x => x.cx)));
    if (P.length !== 4 || P[3].cx !== '4/4' || P[0].conta !== '3001') errs.push('② 4 labels for store 3001, last 4/4');
    if ((await store('upsnotes')).filter(x => x.acct === '3001' && x.st === 'open').length !== 4) errs.push('② 4 open boxes for 3001');
    /* ③ */
    await pg.click('.sb tr[data-nota="NU1"] [data-act="nu-ed"]'); await pg.waitForSelector('#nuEdP'); await pg.fill('#nuEdP', '13.5'); await pg.click('#nuEdOk'); await pg.waitForTimeout(400);
    if ((await store('upsnotes')).find(x => x.id === 'NU1').w !== 13.5) errs.push('③ weight edited');
    await pg.click('.sb tr[data-nota="NU2"] [data-act="nu-excluir"]'); await pg.waitForSelector('#esPergSim'); await pg.click('#esPergSim'); await pg.waitForTimeout(400);
    if ((await store('upsnotes')).find(x => x.id === 'NU2').st !== 'x' || (await pg.$('.sb tr[data-nota="NU2"]'))) errs.push('③ cancelled box leaves the queue');
    /* ④ */
    await pg.evaluate(() => { location.hash = '#/balcao'; }); await pg.waitForSelector('#sbBusca'); await pg.fill('#sbBusca', '3001'); await pg.press('#sbBusca', 'Enter');
    await pg.waitForSelector('.sb [data-sb-nota]', { timeout: 8000 }).catch(() => errs.push('④ notes boxes listed'));
    log('④ notes:', (await pg.$$('.sb [data-sb-nota]')).length);
    if ((await pg.$$('.sb [data-sb-nota]')).length !== 3) errs.push('④ 3 notes boxes for 3001');
    await pg.evaluate(() => document.activeElement && document.activeElement.blur()); await pg.keyboard.press('a'); await pg.waitForTimeout(300);
    if ((await pg.$$('.sb [data-sb-nota]:checked')).length !== 3) errs.push('④ A marks all');
    await pg.evaluate(() => document.activeElement && document.activeElement.blur()); await pg.click('.sb [data-act="sb-finalizar"]');
    await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.shipq || {}).some(q => q.st === 'wait'), null, { timeout: 8000 }).catch(() => errs.push('④ label request'));
    const W = await pg.evaluate(() => { const e = Object.entries(window.__MOCK_STORE__.shipq).find(([, q]) => q.st === 'wait'); return Object.assign({ _id: e[0] }, e[1]); }); log('④ boxes:', JSON.stringify(W.boxes.map(b => b.w)));
    if (W.boxes.length !== 3 || W.boxes[0].w !== 13.5) errs.push('④ shipq has the 3 notes boxes');
    await pg.evaluate(id => Object.assign(window.__MOCK_STORE__.shipq[id], { st: 'done', track: '1ZNOTE01 1ZNOTE02 1ZNOTE03', charge: 30, labels: [] }), W._id);
    await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.upsnotes).filter(n => n.st === 'shipped' && n.acct === '3001').length === 3, null, { timeout: 15000 }).catch(() => errs.push('④ notes boxes shipped'));
    const sh = (await store('upsnotes')).find(x => x.id === 'NU1'); if (!sh || sh.shipId !== W._id || !/1ZNOTE01/.test(sh.trk || '')) errs.push('④ shipId and tracking on the box');
    /* ⑤ */
    await pg.evaluate(() => { location.hash = '#/displays'; }); await pg.waitForSelector('[data-nd-loja="1111"] [data-act="nd-concluir"]', { timeout: 8000 }).catch(() => errs.push('⑤ Concluir button'));
    await pg.click('[data-nd-loja="1111"] [data-act="nd-concluir"]'); await pg.waitForSelector('#esPergSim'); await pg.click('#esPergSim'); const P5 = await printed(); log('⑤ labels:', JSON.stringify(P5));
    if (P5.length !== 2 || /\//.test(P5[0].cx) || !/LD STACKABLE/.test(P5[0].prod)) errs.push('⑤ 2 labels with product, no total');
    await pg.waitForTimeout(400);
    const D = (await store('displays')).find(x => x.id === 'DS9'), NB = (await store('upsnotes')).filter(x => (x.ndIds || []).indexOf('NDL-DS9-0') >= 0);
    if (!D || D.st !== 'migr' || NB.length !== 2 || NB[0].w !== 15) errs.push('⑤ legacy display → notasDisplay → 2 boxes 15 lb');
  } catch (e) { errs.push('crash: ' + e.message); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
