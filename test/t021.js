const { chromium } = require('/home/claude/node_modules/playwright');
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(u => { window.__MOCK_USER__ = u; }, { email: 'luke@theonefl.com', name: 'Luke Hur' });
  await pg.goto('http://127.0.0.1:8766/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/admin/users'; }); await pg.waitForTimeout(500);
  await pg.click('#uNew'); await pg.waitForTimeout(200);
  await pg.fill('#uEmail', 'daniel@gmail.com'); await pg.fill('#uName', 'Daniel'); await pg.fill('#uSm', 'zz new');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'u_form.png') });
  await pg.click('#uSave'); await pg.waitForTimeout(600);
  const t = await pg.textContent('#toast'); console.log('toast:', t);
  await pg.click('#uNew'); await pg.waitForTimeout(200);
  await pg.fill('#uEmail', 'kevin@gmail.com'); await pg.fill('#uName', 'Kevin Park'); await pg.click('#uSave'); await pg.waitForTimeout(600);
  console.log('toast2:', await pg.textContent('#toast'));
  const body = await pg.textContent('#adminBody'); console.log('has ZZ NEW tag:', /ZZ NEW/.test(body), 'KEVIN:', /KEVIN/.test(body));
  await pg.evaluate(() => { location.hash = '#/admin/sms'; }); await pg.waitForTimeout(500);
  const hasBase = await pg.$('#sBase'); console.log('base btn:', !!hasBase);
  if (hasBase) { await pg.click('#sBase'); await pg.waitForTimeout(200); await pg.click('#cfOk'); await pg.waitForTimeout(800); }
  console.log('after:', await pg.textContent('#adminBody h2'), 'btn gone:', !(await pg.$('#sBase')));
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'sms.png'), fullPage: true });
  console.log('errors', errs); await br.close(); srv.kill();
})();
