/* v0.8.69 시험 — 🔄 새 버전 띠 (서버 index.html 버전이 다르면 위에 띠, 같으면 없음) · 세일즈맨 메뉴에 홈 · 세일 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8788', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [];
  for (const [ver, want] of [['9.9.9', true], [null, false]]) {
    const pg = await br.newPage({ viewport: { width: 430, height: 900 } }); pg.on('pageerror', e => errs.push(e.message));
    if (ver) await pg.route(/index\.html\?u=/, r => r.fulfill({ contentType: 'text/html', body: '<script src="app.js?v=' + ver + '"></script>' }));
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'B' }; window.__UPD_TEST__ = true; });
    await pg.goto('http://127.0.0.1:8788/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(5500);
    const bar = await pg.$('#updBar'); console.log(ver, 'bar:', bar ? await bar.textContent() : null);
    if (!!bar !== want) errs.push('update bar expected ' + want + ' for ' + ver);
    const nav = await pg.$$eval('#nav button', b => b.map(x => x.textContent).join('|')); if (!/홈/.test(nav) || !/세일/.test(nav)) errs.push('salesman nav missing home/sale: ' + nav);
    await pg.close();
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
