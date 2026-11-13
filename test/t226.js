/* v0.8.204 시험 — 🕘 날짜는 이 기기(플로리다) 기준: 저녁 7시(EST) 넘어도 "오늘" 이 내일로 바뀌지 않음 (UTC 로 자르던 곳 · 시험 자료 seed)
 *   브라우저 시계를 밤 11시 30분(EST) 으로 놓고: ui.today() · seed 의 오늘 · 메시지 "오늘" 판정 · 카탈로그 오늘이 모두 같은 날 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8911', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  try {
    const ctx = await br.newContext({ timezoneId: 'America/New_York', viewport: { width: 430, height: 900 } });
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.clock.install({ time: new Date('2026-11-12T23:30:00-05:00') });   // 밤 11시 30분 EST = UTC 로는 이미 11/13
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
    await pg.goto('http://127.0.0.1:8911/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached', timeout: 10000 });
    const R = await pg.evaluate(async () => { const U = await import('/src/ui.js'); const s = window.__MOCK_SEED__; return { today: U.today(), local: U.localDay(new Date()), seedT: (s.entries || []).map(e => e.d).sort().pop(), utc: new Date().toISOString().substring(0, 10) }; });
    log('dates:', JSON.stringify(R));
    if (R.today !== '2026-11-12' || R.local !== '2026-11-12') errs.push('today() must be the Florida date, not UTC: ' + R.today);
    if (R.utc !== '2026-11-13') errs.push('test clock setup: UTC should already be the next day');
    if (R.seedT && R.seedT > '2026-11-12') errs.push('seed data must not be dated tomorrow: ' + R.seedT);
  } catch (e) { errs.push('crash: ' + e.message); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL ' + JSON.stringify(errs) : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
