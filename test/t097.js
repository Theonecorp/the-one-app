/* v0.8.120 시험 (폰 화면) — 숫자 칸은 기본이 폰 키보드(패드 안 뜸) · 프리셋 카드 탭 1~5번 색 m2→m5 (×N 표시가 탭을 가로채지 않음) · 카드 − 와 목록 ＋/− 는 프리셋과 상관없이 1개씩 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8840', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; localStorage.setItem('theone.order.pre', '12'); });
  await pg.goto('http://127.0.0.1:8840/test/demo.html#/home'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', '1271'); await pg.waitForSelector('[data-ac="1271"]'); await pg.tap('[data-ac="1271"]'); await pg.waitForTimeout(1200);
  if (await pg.$('#modal.on')) { await pg.tap('#modal .mclose'); await pg.waitForTimeout(300); }
  await pg.fill('#eQ1', 'AHG100'); await pg.waitForTimeout(500);
  const card = () => pg.evaluate(() => { const el = document.querySelector('[data-gc="AHG100"]'); return { cls: el.className, q: el.querySelector('[data-gq]').textContent, x: (el.querySelector('.gtap') || {}).textContent || '' }; });
  const want = [['', '12'], ['m2', '24'], ['m3', '36'], ['m4', '48'], ['m5', '60']];
  for (let i = 0; i < 5; i++) {
    await pg.tap('[data-gc="AHG100"]'); await pg.waitForTimeout(450);
    const c = await card(); log('tap', i + 1, c.cls, c.q, c.x);
    if (await pg.$('#modal.on')) { errs.push('tap ' + (i + 1) + ' opened a popup instead of adding'); await pg.tap('#modal .mclose'); await pg.waitForTimeout(300); }
    if (c.q !== want[i][1]) errs.push('tap ' + (i + 1) + ' qty should be ' + want[i][1] + ', got ' + c.q);
    if (want[i][0] && !new RegExp('\\b' + want[i][0] + '\\b').test(c.cls)) errs.push('tap ' + (i + 1) + ' should color ' + want[i][0] + ', got ' + c.cls);
  }
  await pg.tap('[data-gm="AHG100"]'); await pg.waitForTimeout(300); let c = await card(); log('card −:', c.q, c.cls); if (c.q !== '59') errs.push('card − should subtract 1 (60→59), got ' + c.q); if (/multi/.test(c.cls)) errs.push('− should clear the ×N mark');
  /* 목록 보기 ＋ / − */
  await pg.tap('#eVM'); await pg.waitForTimeout(400);
  const qv = () => pg.$eval('[data-qi="AHG100"]', e => e.value);
  await pg.tap('[data-dq="AHG100"][data-d="1"]'); await pg.waitForTimeout(250); const p1 = await qv(); log('list ＋:', p1); if (p1 !== '60') errs.push('list ＋ should add 1 (59→60) even with a preset, got ' + p1);
  await pg.tap('[data-dq="AHG100"][data-d="-1"]'); await pg.waitForTimeout(250); const m1 = await qv(); log('list −:', m1); if (m1 !== '59') errs.push('list − should subtract 1, got ' + m1);
  /* 숫자 칸 — 기본은 폰 키보드 (패드 없음) */
  await pg.tap('[data-qi="AHG100"]'); await pg.waitForTimeout(400);
  const pad = await pg.$('.npad'), im = await pg.$eval('[data-qi="AHG100"]', e => e.getAttribute('inputmode')); log('pad:', !!pad, 'inputmode:', im);
  if (pad) errs.push('number pad should be off by default'); if (im === 'none') errs.push('keyboard should not be suppressed by default');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
