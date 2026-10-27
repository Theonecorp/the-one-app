/* v0.8.74 시험 — 🏦 ACH 옛 앱 v20 규칙: 셋업 ☑ 한 건은 인출일이 지나도 "예약됨" (지연 아님) · 지연 = 셋업 안 했는데 인출일 지남 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8794', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [];
  const pg = await br.newPage({ viewport: { width: 430, height: 900 } }); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
    const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().substring(0, 10); };
    const mk = (id, setup, drawOn) => ({ id, acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', amt: 100, terms: 'ACH 30', invDate: d(-30), drawOn, setup, st: setup ? 'SETUP' : 'WAIT', open: true, lines: [{ no: 'A' + id, amt: 100 }], createdAt: d(-30) });
    window.__AFTER_SEED__ = s => { s.ach = [mk('X1', true, d(-1)), mk('X2', false, d(-1)), mk('X3', false, d(5))]; }; });
  await pg.goto('http://127.0.0.1:8794/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/ach/job'; }); await pg.waitForTimeout(1500);
  const seg = (await pg.textContent('#page')).replace(/\s+/g, ' '); console.log(seg.slice(0, 200));
  if (!/지연 1/.test(seg)) errs.push('late should be 1 (only not-setup past date)');
  if (!/예약됨 1/.test(seg)) errs.push('setup past date should be in 예약됨');
  if (!/셋업 필요 1/.test(seg)) errs.push('need should be 1');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
