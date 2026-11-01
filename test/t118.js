/* v0.8.154 시험 — 🏷 아이템 줄을 누르면 먼저 보기 창(재고 · 위치 · 바코드) → ✏️ 수정 을 눌러야 편집 창
 *   폰(터치)에서는 편집 창이 열려도 키보드가 바로 올라오지 않음(포커스 없음) · 키보드가 올라오면(body.kb) 팝업이 보이는 영역 위쪽에 붙음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8873', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  /* 터치 기기처럼 */
  const ctx = await br.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8873/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(500);
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itList [data-it]', { timeout: 8000 }); await pg.waitForTimeout(600);
  /* 줄 누르기 → 보기 창 */
  await pg.tap('#itList [data-it="AHG100"] .ct'); await pg.waitForSelector('#modal.on', { timeout: 5000 }); await pg.waitForTimeout(500);
  const sheet = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); log('sheet:', sheet.slice(0, 100));
  if (await pg.$('#fD')) errs.push('row tap should open the view sheet, not the edit form'); if (!(await pg.$('#isEd'))) errs.push('view sheet should have an edit button'); if (!/AHG100/.test(sheet) || !/재고|On hand|Stock/.test(sheet)) errs.push('sheet should show code and stock');
  const focused0 = await pg.evaluate(() => document.activeElement && document.activeElement.tagName); log('focused on open:', focused0); if (focused0 === 'INPUT' || focused0 === 'TEXTAREA') errs.push('nothing should be focused when the sheet opens on a phone');
  /* ✏️ → 편집 창, 포커스 없음 */
  await pg.tap('#isEd'); await pg.waitForSelector('#fD', { timeout: 5000 }); await pg.waitForTimeout(300);
  const focused1 = await pg.evaluate(() => document.activeElement && document.activeElement.id); log('focused in form:', focused1); if (focused1 === 'fD' || focused1 === 'fC') errs.push('edit form must not auto-focus on touch devices');
  const code = await pg.$eval('#fC', e => e.value); if (code !== 'AHG100') errs.push('edit form should carry the item code');
  /* 키보드가 올라온 상태(body.kb)에서는 팝업이 위에 붙고 높이가 보이는 영역 안 */
  await pg.evaluate(() => { document.documentElement.style.setProperty('--vvh', '420px'); document.documentElement.style.setProperty('--vvt', '0px'); document.body.classList.add('kb'); });
  await pg.waitForTimeout(200);
  const m = await pg.evaluate(() => { const mo = document.getElementById('modal'), bx = document.querySelector('#modal .box'); const cs = getComputedStyle(mo), r = bx.getBoundingClientRect(); return { align: cs.alignItems, h: Math.round(parseFloat(cs.height)), top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
  log('modal with keyboard:', m); if (m.align !== 'flex-start') errs.push('popup should align to the top while the keyboard is up'); if (m.h !== 420 || m.bottom > 420) errs.push('popup should fit inside the visible area above the keyboard');
  await pg.evaluate(() => document.body.classList.remove('kb'));
  /* 수정 저장 → 목록 반영 */
  await pg.fill('#fD', 'ALUMINUM HOOP GOLD 100 EDITED'); await pg.tap('#fOk'); await pg.waitForTimeout(1500);
  const row = (await pg.textContent('#itList [data-it="AHG100"]')).replace(/\s+/g, ' '); log('row after save:', row.slice(0, 80)); if (!/EDITED/.test(row)) errs.push('list should repaint with the edited description');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'item_sheet_first.png') });
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
