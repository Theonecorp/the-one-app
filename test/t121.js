/* v0.8.157 시험 — 🏬 가게 창이 "읽는 중…" 에서 멈추지 않음
 *   읽는 동안 주소 · 전화 · 담당이 먼저 보임 · 6초 넘으면 🐢 느린 연결 안내 + ↻ 다시 시도 · 다 읽으면 정상 화면
 *   읽는 중에 창을 닫으면 나중에 다시 튀어나오지 않음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8876', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 420, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8876/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(500);
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForSelector('[data-st="1111"]', { timeout: 8000 }); await pg.waitForTimeout(300);
  /* 느린 인터넷: 읽기마다 3.5초 (가게 창은 두 단계 → 7초쯤) */
  await pg.evaluate(() => { window.__MOCK_DELAY__ = 3500; });
  await pg.click('[data-st="1111"]'); await pg.waitForSelector('#modal.on #ssLoad', { timeout: 3000 });
  const head = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); log('while loading:', head.slice(0, 120));
  if (!/ALI B\/S # 1/.test(head) || !/LIGHTHOUSE POINT/.test(head) || !/BRANDON/.test(head)) errs.push('address and salesman should show while loading');
  await pg.waitForSelector('#ssSlow', { timeout: 8000 }).catch(() => errs.push('slow-connection notice should appear after ~6s'));
  if (await pg.$('#ssRetry')) log('retry button shown'); else errs.push('retry button missing in the slow notice');
  await pg.waitForSelector('#modal .seg', { timeout: 15000 }).catch(() => errs.push('sheet should finish loading'));
  if (await pg.$('#ssSlow')) errs.push('slow notice should go away once loaded');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'store_slow.png') });
  await pg.click('#modal .mclose'); await pg.waitForTimeout(200);
  /* 읽는 중에 닫기 → 다시 안 튀어나옴 */
  await pg.evaluate(() => { window.__MOCK_DELAY__ = 2000; });
  await pg.click('[data-st="1271"]'); await pg.waitForSelector('#modal.on #ssLoad', { timeout: 3000 }); await pg.click('#modal .mclose'); await pg.waitForTimeout(5500);
  const open = await pg.$eval('#modal', m => m.classList.contains('on')); log('modal reopened after close during load:', open); if (open) errs.push('closing the sheet while loading must not reopen it later');
  await pg.evaluate(() => { window.__MOCK_DELAY__ = 0; });
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
