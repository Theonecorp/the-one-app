/* v0.8.115 시험 — 🔢 숫자 패드(폰에서 수량 칸 → 팝업 · 키보드 막음) · 창은 ✕ 로만 닫힘(바깥 터치 무시 · 코너 ✕) · 뒤로가기(back)는 창만 닫고 화면 유지 · 세트 구성품 창 뒤 뒤로가기 후에도 화면 멈춤 없음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8831', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage(); const wait = ms => pg.waitForTimeout(ms); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; localStorage.setItem('theone.numpad', '1'); });   // v0.8.120: 패드는 켠 사람만
  await pg.goto('http://127.0.0.1:8831/test/demo.html#/home'); await pg.waitForSelector('#nav button');
  const coarse = await pg.evaluate(() => matchMedia('(pointer: coarse)').matches); log('coarse pointer:', coarse); if (!coarse) errs.push('test context should emulate a touch device');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', '1271'); await pg.waitForSelector('[data-ac="1271"]'); await pg.tap('[data-ac="1271"]'); await pg.waitForTimeout(1200);
  if (await pg.$('#modal.on')) { await pg.tap('#modal .mclose'); await pg.waitForTimeout(300); }
  /* 🔢 숫자 패드 — 목록 보기의 수량 칸 */
  await pg.tap('#eVM'); await pg.waitForTimeout(300); await pg.fill('#eQ1', 'AHG10'); await pg.waitForTimeout(500);
  await pg.waitForSelector('[data-qi="AHG100"]', { timeout: 5000 }).catch(() => errs.push('list qty input missing'));
  await pg.tap('[data-qi="AHG100"]'); await pg.waitForSelector('.npad', { timeout: 3000 }).catch(() => errs.push('number pad should open on a qty field'));
  const im = await pg.$eval('[data-qi="AHG100"]', e => e.getAttribute('inputmode')); log('inputmode while pad:', im); if (im !== 'none') errs.push('keyboard should be suppressed (inputmode none)');
  await pg.$eval('.npad [data-np="2"]', e => e.click()); await pg.$eval('.npad [data-np="4"]', e => e.click()); log('pad shows:', await pg.textContent('#npV')); await pg.$eval('.npad [data-np="ok"]', e => e.click()); await pg.waitForTimeout(400);
  const q = await pg.$eval('[data-qi="AHG100"]', e => e.value), im2 = await pg.$eval('[data-qi="AHG100"]', e => e.getAttribute('inputmode')); log('qty after pad:', q, 'inputmode after:', im2);
  if (q !== '24') errs.push('pad OK should set the quantity'); if (im2 === 'none') errs.push('inputmode should be restored'); if (await pg.$('.npad')) errs.push('pad should close on OK');
  const n = await pg.textContent('#eN'); if (n.trim() !== '1') errs.push('line count should update via change event, got ' + n);
  /* 빠른 수량 칩 */
  await pg.tap('[data-qi="AHG101"]'); await pg.waitForSelector('.npad'); await pg.$eval('.npad [data-npq="12"]', e => e.click()); await pg.waitForTimeout(300); if ((await pg.$eval('[data-qi="AHG101"]', e => e.value)) !== '12') errs.push('quick chip should set 12');
  /* ⌨ 키보드로 — 그 칸은 패드 없이 */
  await pg.tap('[data-qi="AHG100"]'); await pg.waitForSelector('.npad'); await pg.$eval('.npad [data-np="kb"]', e => e.click()); await pg.waitForTimeout(300); if (await pg.$('.npad')) errs.push('keyboard button should close the pad'); if (!(await pg.$eval('[data-qi="AHG100"]', e => e.dataset.nopad))) errs.push('field should be marked nopad');
  /* 창: 바깥 터치로 안 닫힘 · 코너 ✕ 로 닫힘 */
  await pg.tap('#eStoreI'); await pg.waitForSelector('#modal.on #ssStmt', { timeout: 6000 }).catch(() => errs.push('store sheet missing'));
  if (!(await pg.$('#modal.on'))) errs.push('corner close button missing');
  await pg.mouse.click(10, 10); await pg.waitForTimeout(300); if (!(await pg.$('#modal.on'))) errs.push('tapping outside should NOT close the modal');
  const hash0 = await pg.evaluate(() => location.hash);
  /* 뒤로가기 → 창만 닫힘, 화면 그대로 */
  await pg.goBack(); await pg.waitForTimeout(500);
  const afterBack = await pg.evaluate(() => ({ open: document.getElementById('modal').classList.contains('on'), hash: location.hash, editor: !!document.getElementById('eQ1') })); log('after back:', JSON.stringify(afterBack));
  if (afterBack.open) errs.push('back should close the modal'); if (afterBack.hash !== hash0) errs.push('back should keep the screen (hash)'); if (!afterBack.editor) errs.push('editor should still be there');
  await pg.tap('#eStoreI'); await pg.waitForSelector('#modal.on'); await pg.tap('#modal .mclose'); await pg.waitForTimeout(300); if (await pg.$('#modal.on')) errs.push('corner ✕ should close the modal');
  /* 세트 구성품 창 → 뒤로가기 → 화면 살아 있음 */
  await pg.fill('#eQ1', 'C4-EB01'); await pg.waitForTimeout(500); await pg.tap('#eVM'); await pg.waitForTimeout(300);
  const kit = await pg.$('[data-gc="C4-EB01"] .gkit'); if (kit) { await kit.tap(); await pg.waitForSelector('#kAll', { timeout: 4000 }).catch(() => errs.push('kit sheet missing')); } else errs.push('kit card missing');
  await pg.goBack(); await pg.waitForTimeout(600);
  const alive = await pg.evaluate(() => ({ open: document.getElementById('modal').classList.contains('on'), busy: document.getElementById('busy').classList.contains('on'), ovr: !!document.querySelector('.ovr'), hash: location.hash, editor: !!document.getElementById('eQ1') })); log('after kit back:', JSON.stringify(alive));
  if (alive.open || alive.busy || alive.ovr || !alive.editor) errs.push('screen should be usable after back from the kit sheet');
  await pg.fill('#eQ1', 'AHG10'); await pg.waitForTimeout(400); await pg.tap('[data-gc="AHG105"]').catch(() => errs.push('cannot tap a card after back — frozen?')); await pg.waitForTimeout(300);
  /* 창 없이 뒤로가기 → 빈 칸 소비 후 실제 뒤로 (홈) */
  await pg.goBack(); await pg.waitForTimeout(900); const h2 = await pg.evaluate(() => location.hash); log('second back:', h2); if (h2 === hash0) errs.push('back with no modal should leave the screen');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
