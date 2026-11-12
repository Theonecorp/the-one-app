/* v0.8.200 시험 — 🔎 아이템 코드 칸 자동완성 · 가까운 순 검색 (2026-11-12 관리자: "인보이스 수정 때 아이템 추가 칸이 잘 안 보이고 · 코드를 넣어도 안 들어가고 선택 옵션도 없음 · CV 를 누르면 CV 로 시작하는 아이템이 매칭 순서로 나온 뒤 선택")
 *   ① 인보이스 수정 ＋ 아이템 추가: 코드 칸이 넓게 보임(250px 넘음) · 'AHG11' 을 치면 목록이 뜨고 맨 위가 AHG11… 로 시작 · ↓ Enter 로 고르면 바로 줄이 더해짐
 *   ② 목록을 손가락(마우스)으로 눌러도 더해짐 · 정확한 코드 + Enter 는 예전처럼 바로 더해짐
 *   ③ 검색 순서: 'G1' → 코드가 G1 로 시작하는 것(G100X)이 코드 안에 G1 이 있는 것(AHG1…)보다 먼저 · 같은 급은 번호 순
 *   ④ 주문 처리 ＋ 아이템 추가 창(aCode)에도 같은 목록 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8905', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 1000, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { Object.assign(s.orders[0], { st: window.__T221ST || 'picked', cfOk: true, picker: 'luke@theonefl.com', pickerName: 'L' }); const c0 = s.catalog.find(x => x.id === 'c0'), rows = JSON.parse(c0.j); rows.push(['G100X', 'GOLD RANK TEST', 3, 0, '', 'Jewelry', 'EARRING', 'TEST', 'TEST', '']); c0.j = JSON.stringify(rows); s.catalog[0].ver = 'T221'; c0.ver = 'T221'; }; });
  await pg.goto('http://127.0.0.1:8905/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mInv', { timeout: 8000 });
  await pg.click('#mInv'); await pg.waitForSelector('#ivOk'); await pg.click('#ivOk'); await pg.waitForTimeout(1800); if (await pg.$('#prt.on')) await pg.click('#prtClose');
  const no = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.invoices).find(v => v.orderId === 'O261014-AAAA').no);
  await pg.evaluate(() => { location.hash = '#/order/x'; }); await pg.waitForTimeout(200); await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; });
  await pg.waitForSelector('[data-mie]', { timeout: 8000 }); await pg.click('[data-mie="' + no + '"]'); await pg.waitForSelector('#ieOk', { timeout: 6000 });
  /* ① */
  const w = await pg.$eval('#ieAdd', x => x.getBoundingClientRect().width); log('① code box width:', Math.round(w)); if (w < 250) errs.push('① code box is wide enough to see');
  const n0 = await pg.$$eval('[data-ieq]', E => E.length);
  await pg.click('#ieAdd'); await pg.keyboard.type('AHG11'); await pg.waitForSelector('.sugbox .sugrow', { timeout: 3000 }).catch(() => errs.push('① list appears'));
  const rows = await pg.$$eval('.sugbox .sugrow b', B => B.map(b => b.textContent)); log('① list:', rows.slice(0, 5).join(' '));
  if (!rows.length || !/^AHG11/.test(rows[0])) errs.push('① top of list starts with AHG11');
  await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  const n1 = await pg.$$eval('[data-ieq]', E => E.length), c1 = await pg.$$eval('#mbox .ietbl td b', B => B.map(b => b.textContent)); log('① lines after pick:', n1, c1.slice(-1)[0]);
  if (n1 !== n0 + 1 || c1.slice(-1)[0] !== rows[1]) errs.push('① ↓ Enter adds the 2nd suggestion as a line');
  /* ② */
  await pg.click('#ieAdd'); await pg.keyboard.type('EB10'); await pg.waitForSelector('.sugbox .sugrow'); const first = await pg.$eval('.sugbox .sugrow b', b => b.textContent);
  await pg.click('.sugbox .sugrow'); await pg.waitForTimeout(300); const c2 = await pg.$$eval('#mbox .ietbl td b', B => B.map(b => b.textContent)); log('② tap pick:', first, '→', c2.slice(-1)[0]);
  if (c2.slice(-1)[0] !== first) errs.push('② tapping a suggestion adds it');
  await pg.fill('#ieAdd', 'AHG105'); await pg.press('#ieAdd', 'Enter'); await pg.waitForTimeout(300); const c3 = await pg.$$eval('#mbox .ietbl td b', B => B.map(b => b.textContent)); log('② exact Enter:', c3.slice(-1)[0]);
  if (c3.slice(-1)[0] !== 'AHG105') errs.push('② exact code + Enter still adds directly');
  /* ③ */
  await pg.fill('#ieAdd', ''); await pg.click('#ieAdd'); await pg.keyboard.type('G1'); await pg.waitForSelector('.sugbox .sugrow'); await pg.waitForTimeout(200);
  const order = await pg.$$eval('.sugbox .sugrow b', B => B.map(b => b.textContent)); log('③ G1:', order.join(' '));
  if (order[0] !== 'G100X') errs.push('③ code starting with G1 (G100X) comes first');
  const ahg = order.filter(c => /^AHG/.test(c)); if (!ahg.length || ahg.join() !== ahg.slice().sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join()) errs.push('③ same rank in code number order');
  await pg.keyboard.press('Escape');
  await pg.click('#ieX').catch(() => {}); await pg.waitForTimeout(300);
  /* ④ */
  const p4 = await (await br.newContext({ viewport: { width: 1000, height: 1000 } })).newPage(); p4.on('pageerror', e => errs.push(e.message)); p4.on('dialog', d => d.accept());
  await p4.addInitScript(() => { window.__T221ST = 'pick'; window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; });
  await p4.addInitScript(() => { const f = window.__AFTER_SEED__; window.__AFTER_SEED__ = s => { if (f) f(s); Object.assign(s.orders[0], { st: 'pick', cfOk: true, picker: 'luke@theonefl.com', pickerName: 'L' }); }; });
  await p4.goto('http://127.0.0.1:8905/test/demo.html'); await p4.waitForSelector('#nav button', { state: 'attached' });
  await p4.evaluate(() => { location.hash = '#/order/O261014-AAAA'; });
  if (await p4.waitForSelector('#mAdd', { timeout: 8000 }).catch(() => null)) { await p4.click('#mAdd'); await p4.waitForSelector('#aCode'); await p4.click('#aCode'); await p4.keyboard.type('AHG11'); await p4.waitForSelector('.sugbox .sugrow', { timeout: 3000 }).catch(() => errs.push('④ list in the office add-item window'));
    const r4 = await p4.$$eval('.sugbox .sugrow b', B => B.map(b => b.textContent)); log('④ aCode list:', r4.slice(0, 3).join(' ')); if (!r4.length || !/^AHG11/.test(r4[0])) errs.push('④ aCode suggestions start with AHG11'); }
  else errs.push('④ office add-item button');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
