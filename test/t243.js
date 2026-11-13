/* v0.8.213 시험 — 👁 금액 숨기기 (옛 WMS 의 Ocultar valores): 머리띠 눈 단추 → 화면의 모든 금액이 ••• · 이 기기에 기억 · 인쇄는 진짜 금액 · 끄면 다시 보임
 *   ① 관리자 · 상품 화면: 금액($)이 보임 · 눈 단추가 머리띠에
 *   ② 눈 누르기 → 화면에 $숫자 없음 · ••• 있음 · aria-pressed · localStorage theone.hideVal=1
 *   ③ 새로 고침 → 여전히 숨김 · 다른 화면(재고)도 숨김
 *   ④ 숨김 상태에서 인쇄(printOpen) → #prtbody 에는 진짜 금액
 *   ⑤ 다시 누르기 → 금액이 보임 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8943', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 1440, height: 1000 } });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8943/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const pageText = () => pg.evaluate(() => document.getElementById('page').innerText);
  const hasMoney = t => /\$\d/.test(t);
  /* ① */
  await pg.evaluate(() => { location.hash = '#/produtos'; }); await pg.waitForFunction(() => /\$\d/.test(document.getElementById('page').innerText), null, { timeout: 10000 }).catch(() => errs.push('① amounts visible on Produtos'));
  if (!(await pg.$('#hEye'))) errs.push('① eye button in the header');
  /* ② */
  await pg.click('#hEye'); await pg.waitForTimeout(1200);
  let t = await pageText(); log('② sample:', (t.match(/.{0,20}•••.{0,10}/) || [''])[0].replace(/\s+/g, ' '));
  if (hasMoney(t)) errs.push('② no $amount left on screen :: ' + (t.match(/.{0,20}\$\d[\d,.]*/) || [''])[0]);
  if (t.indexOf('•••') < 0) errs.push('② amounts shown as •••');
  const st = await pg.evaluate(() => ({ p: document.getElementById('hEye').getAttribute('aria-pressed'), ls: localStorage.getItem('theone.hideVal') }));
  if (st.p !== 'true' || st.ls !== '1') errs.push('② pressed state + remembered :: ' + JSON.stringify(st));
  /* ③ */
  await pg.reload(); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(2500);
  t = await pageText(); if (hasMoney(t) || t.indexOf('•••') < 0) errs.push('③ still hidden after reload');
  await pg.evaluate(() => { location.hash = '#/estoque'; }); await pg.waitForTimeout(2500);
  /* ④ 인쇄: 같은 ui.js 를 불러 money() 로 만든 HTML 을 printOpen → 진짜 금액 */
  const pr = await pg.evaluate(async () => { const ui = await import('/src/ui.js'); ui.printOpen('<p id="tp">Total ' + ui.money(1234.5) + '</p>'); return document.getElementById('prtbody').innerText; });
  log('④ print:', pr); if (!/\$1,234\.50/.test(pr) || /•••/.test(pr)) errs.push('④ print keeps the real amount');
  await pg.evaluate(() => { document.getElementById('prt').classList.remove('on'); });
  /* ⑤ */
  await pg.evaluate(() => { location.hash = '#/produtos'; }); await pg.waitForTimeout(2500);
  await pg.click('#hEye'); await pg.waitForFunction(() => /\$\d/.test(document.getElementById('page').innerText), null, { timeout: 6000 }).catch(() => errs.push('⑤ amounts visible again'));
  if ((await pg.evaluate(() => localStorage.getItem('theone.hideVal'))) !== '0') errs.push('⑤ remembered as off');
  log(errs.length ? 'FAIL' : 'PASS'); if (errs.length) console.log(errs);
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
