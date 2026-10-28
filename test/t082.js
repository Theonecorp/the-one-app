/* v0.8.98 시험 — 📦 오프라인 준비: 세일즈맨 홈 카드 · 지금 준비(자료 단계 진행) → 마지막 시각 저장 · 하루 넘으면 자동 · 네트 알약 창에도 카드 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8817', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; try { localStorage.removeItem('theone.offline.at'); } catch (e) {} });
  await pg.goto('http://127.0.0.1:8817/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.waitForSelector('#ofGo', { timeout: 8000 }).catch(() => errs.push('offline card missing on salesman home'));
  const t0 = (await pg.textContent('#offCard')).replace(/\s+/g, ' '); log('card:', t0.slice(0, 120));
  await pg.waitForTimeout(11000);   /* 아직 안 했으면 8초 뒤 자동 준비 */
  const at1 = await pg.evaluate(() => localStorage.getItem('theone.offline.at')); log('auto at:', at1); if (!at1) errs.push('stale → auto prepare should run and stamp the time');
  await pg.waitForFunction(() => /자료/.test((document.getElementById('offCard') || {}).textContent || '') && !/아직 안 함/.test(document.getElementById('offCard').textContent), null, { timeout: 15000 }).catch(() => errs.push('card should show last prepared time'));
  await pg.evaluate(() => localStorage.setItem('theone.offline.at', new Date(Date.now() - 48 * 3600000).toISOString()));
  await pg.click('#ofGo'); await pg.waitForTimeout(3000);
  const at2 = await pg.evaluate(() => localStorage.getItem('theone.offline.at')); if (!at2 || new Date(at2).getTime() < Date.now() - 60000) errs.push('manual prepare should refresh the stamp');
  await pg.waitForFunction(() => { const c = document.getElementById('offCard'); return c && /자료/.test(c.textContent) && !/48|2일 전|1일 전/.test(c.textContent); }, null, { timeout: 15000 }).catch(() => errs.push('card should refresh after manual prepare'));
  await pg.click('#hNet'); await pg.waitForSelector('#netOff'); await pg.waitForTimeout(300); if (!(await pg.$('#netOff #ofGo'))) errs.push('net pill modal should include the offline card');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
