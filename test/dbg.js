const { chromium } = require('/home/claude/node_modules/playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--disable-background-networking'] });
  const pg = await br.newPage({ viewport: { width: 430, height: 900 } });
  pg.on('pageerror', e => console.log('PAGEERR', e.message)); pg.on('console', m => console.log('CONSOLE', m.type(), m.text()));
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  await pg.goto('http://127.0.0.1:8766/test/demo.html', { timeout: 15000 }); await pg.waitForTimeout(800);
  console.log('html:', (await pg.content()).substring(0, 600));
  const has = await pg.$('#btnLogin'); console.log('login btn', !!has);
  if (has) { await pg.click('#btnLogin'); await pg.waitForTimeout(800); console.log('after login:', (await pg.$eval('#page', e => e.innerText)).substring(0, 300)); }
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'dbg.png') });
  await br.close(); srv.kill();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
