/* v0.8.192 시험 — 🧩 픽킹: 세트 · 인서트 오더는 늘 맨 위 · 세트 구성품은 기본으로 안 보임 · "🧩 구성품 보기" 옵션으로 보임 (2026-11-12 관리자)
 *   ① 세트(FLSIDE52, 통로 20A — 통로로는 맨 뒤)가 픽킹 리스트 맨 위 "SET · INSERT ORDER" 묶음 → 그다음 통로 순서
 *   ② 기본: 인쇄에 구성품 줄(└) 없음 · 화면도 "세트 · 2가지" 만
 *   ③ 🧩 구성품 보기 → 화면에 구성품 코드 · 인쇄에 └ 줄 · 이 기기에 기억 (다시 열어도 켜짐) · 저장 안 한 픽킹 표시는 그대로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8878', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 1200, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => {
    const c0 = s.catalog.find(x => x.id === 'c0'), rows = JSON.parse(c0.j); rows.forEach(r => { if (r[0] === 'FLSIDE52') r[11] = '20A'; if (r[0] === 'AHG100') r[11] = '04B'; if (r[0] === 'AHG101') r[11] = '01A'; }); c0.j = JSON.stringify(rows);
    Object.assign(s.orders[0], { st: 'pick', picker: 'luke@theonefl.com', pickerName: 'L', cfOk: true });
    s.orderLines[0].lines = [{ c: 'AHG100', d: 'ITEM 0', q: 5, p: 2.5, t: 'A' }, { c: 'AHG101', d: 'ITEM 1', q: 3, p: 3, t: 'A' }, { c: 'FLSIDE52', d: 'FL INT #52', q: 1, p: 198, t: 'A', kit: [{ c: 'AHG100', q: 6 }, { c: 'AHG105', q: 6 }] }]; }; });
  await pg.goto('http://127.0.0.1:8878/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const openOrder = async () => { await pg.evaluate(() => { location.hash = '#/order/x'; }); await pg.waitForTimeout(200); await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mPickPrint', { timeout: 8000 }); await pg.waitForTimeout(400); };
  const printed = async () => { await pg.click('#mPickPrint'); await pg.waitForSelector('#prt.on'); await pg.waitForTimeout(300); const P = await pg.evaluate(() => { const b = document.getElementById('prtbody'); return { heads: [...b.querySelectorAll('tr.pktype')].map(x => x.textContent.trim()), codes: [...b.querySelectorAll('tbody tr:not(.pktype):not(.pkfam):not(.fin) td:nth-child(3)')].map(x => x.textContent.trim()) }; }); await pg.click('#prtClose'); await pg.waitForTimeout(200); return P; };
  await openOrder();
  /* ① ② */
  const P1 = await printed(); log('① ② print:', JSON.stringify(P1));
  if (!/SET · INSERT ORDER/.test(P1.heads[0] || '') || P1.codes[0].indexOf('FLSIDE52') !== 0) errs.push('① set on top under SET · INSERT ORDER');
  if (P1.codes.join(' ').replace(/ 🧩/g, '') !== 'FLSIDE52 AHG101 AHG100') errs.push('① then aisle order 01A → 04B');
  if (P1.codes.some(c => /└/.test(c))) errs.push('② no component rows by default');
  const scr1 = await pg.evaluate(() => { const c = document.querySelector('#mLines .pkcomp'), s = document.querySelector('#mLines .pksum'); return { comp: c ? getComputedStyle(c).display : 'none?', sum: s ? s.textContent : '' }; }); log('② screen:', JSON.stringify(scr1));
  if (scr1.comp !== 'none' || !/2/.test(scr1.sum)) errs.push('② screen shows only "set · 2 items"');
  /* ③ */
  await pg.click('[data-pkt="0"]').catch(() => {}); await pg.waitForTimeout(100);
  await pg.click('#mPkKits'); await pg.waitForTimeout(200);
  const scr2 = await pg.evaluate(() => { const c = document.querySelector('#mLines .pkcomp'); return { comp: c ? getComputedStyle(c).display : '', txt: c ? c.textContent : '', btn: document.getElementById('mPkKits').textContent, mem: localStorage.getItem('theone.pick.kits') }; }); log('③ after toggle:', JSON.stringify(scr2));
  if (scr2.comp === 'none' || !/AHG105×6/.test(scr2.txt) || scr2.mem !== '1') errs.push('③ toggle shows components and remembers it');
  const P2 = await printed(); log('③ print:', JSON.stringify(P2.codes)); if (P2.codes.filter(c => /└/.test(c)).length !== 2) errs.push('③ print has the two └ component rows');
  await openOrder(); const P3 = await printed(); if (P3.codes.filter(c => /└/.test(c)).length !== 2) errs.push('③ remembered after reopening');
  await pg.click('#mPkKits'); await pg.waitForTimeout(200); const P4 = await printed(); if (P4.codes.some(c => /└/.test(c))) errs.push('③ turning it off hides them again');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
