/* 📥 한 번에 올리기 — 파일 여러 개 (경로 인자들, 없으면 건너뜀) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
const FILES = process.argv.slice(2).filter(f => fs.existsSync(f)); if (!FILES.length) { console.log('skip: no files'); process.exit(0); }
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8791', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 900, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' }; window.__AFTER_SEED__ = s => { s.entries = []; s.cod = []; s.accounts = []; s.ar = []; s.invoices = []; }; });
  await pg.goto('http://127.0.0.1:8791/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#fAll');
  await pg.fill('#allArD', '2026-10-17'); await pg.setInputFiles('#fAll', FILES);
  await pg.waitForFunction(() => /끝\./.test((document.getElementById('allLog') || {}).textContent || ''), null, { timeout: 900000 });
  log((await pg.textContent('#allOut')).replace(/\s+/g, ' ').slice(0, 1400));
  log('counts:', await pg.evaluate(() => { const S = window.__MOCK_STORE__; const n = k => Object.keys(S[k] || {}).length; return { entries: n('entries'), accounts: n('accounts'), ar: n('ar'), cod: n('cod'), invoices: n('invoices'), factoryInvoices: n('factoryInvoices'), pay1099: n('pay1099') }; }));
  log('errors:', errs.length ? errs : 'none'); await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
