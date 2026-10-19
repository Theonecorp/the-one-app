/* v0.8.21 시험 — ④ 수금 대시보드.xlsx 가져오기 (실제 파일은 저장소에 넣지 않음: 경로를 인자로, 없으면 건너뜀) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
const FILE = process.argv[2]; if (!FILE || !fs.existsSync(FILE)) { console.log('skip: no file'); process.exit(0); }
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8787', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 900, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' }; });
  await pg.goto('http://127.0.0.1:8787/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#f4');
  await pg.setInputFiles('#f4', FILE); await pg.waitForSelector('#bossGo', { timeout: 60000 });
  log('preview:', (await pg.textContent('#bossOut')).replace(/\s+/g, ' ').slice(0, 400));
  await pg.click('#bossGo'); await pg.waitForSelector('#bossOut .a-grn, #bossOut .a-red', { timeout: 120000 });
  log('result:', (await pg.textContent('#bossOut')).replace(/\s+/g, ' ').slice(0, 200));
  const c = await pg.evaluate(() => { const S = window.__MOCK_STORE__; const n = k => Object.keys(S[k] || {}).length; return { fac: n('factories'), inv: n('factoryInvoices'), pay: n('factoryPayments'), p99: n('pay1099'), payees: n('payees'), acc: n('bonusAcc'), dist: n('bonusDist'), ded: n('deductions'), split: (S.bonusSplit && S.bonusSplit.main && S.bonusSplit.main.rows.length) || 0 }; });
  log('counts:', c);
  await pg.evaluate(() => { location.hash = '#/mg'; }); await pg.waitForSelector('#mgBody .card'); await pg.waitForTimeout(800); log('mg:', (await pg.textContent('#mgBody')).replace(/\s+/g, ' ').slice(0, 400));
  await pg.click('[data-go="p99"]'); await pg.waitForTimeout(600); log('1099:', (await pg.textContent('#mgBody')).replace(/\s+/g, ' ').slice(0, 300));
  log('errors:', errs.length ? errs : 'none'); await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
