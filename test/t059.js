/* ⑤ 이전 시스템 인보이스 목록 가져오기 (파일 경로 인자, 없으면 건너뜀) → 현황 매출 · 리포트 · 가게 창 인보이스 탭 · 인보이스 조회 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
const FILE = process.argv[2]; if (!FILE || !fs.existsSync(FILE)) { console.log('skip: no file'); process.exit(0); }
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8790', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 900, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' }; window.__AFTER_SEED__ = s => { s.invoices = []; }; });
  await pg.goto('http://127.0.0.1:8790/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#f5');
  await pg.fill('#f5From', '2026-01-01'); await pg.setInputFiles('#f5', FILE); await pg.waitForSelector('#invGo', { timeout: 120000 });
  log('preview:', (await pg.textContent('#invOut')).replace(/\s+/g, ' ').slice(0, 300));
  const t0 = Date.now(); await pg.click('#invGo'); await pg.waitForSelector('#invOut .a-grn, #invOut .a-red', { timeout: 600000 }); log('import took', Math.round((Date.now() - t0) / 1000), 's:', (await pg.textContent('#invOut .a-grn, #invOut .a-red')).replace(/\s+/g, ' ').slice(0, 120));
  const n = await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.invoices).length); log('invoices in store:', n); if (n < 11000) errs.push('too few invoices');
  await pg.evaluate(() => { location.hash = '#/now'; }); await pg.waitForSelector('#estBox .hero, #estBox .none', { timeout: 60000 }); await pg.click('[data-np="year"]'); await pg.waitForTimeout(2500);
  log('now year:', (await pg.textContent('#page')).replace(/\s+/g, ' ').slice(0, 330));
  if (!/\$10,9\d\d,\d{3}/.test(await pg.textContent('#page'))) errs.push('year sales not ~10.96M');
  await pg.evaluate(() => { location.hash = '#/reports'; }); await pg.waitForSelector('#rBody table', { timeout: 60000 }); await pg.click('[data-rp="year"]'); await pg.waitForSelector('#rBody table', { timeout: 60000 }); await pg.waitForTimeout(800); await pg.click('[data-rt="sm"]'); await pg.waitForTimeout(500);
  log('report sm year:', (await pg.textContent('#rBody')).replace(/\s+/g, ' ').slice(0, 300));
  /* 가게 창 인보이스 탭 */
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForSelector('#stQ'); await pg.fill('#stQ', '1111'); await pg.waitForTimeout(500); await pg.click('[data-st]'); await pg.waitForSelector('[data-ss="invh"]'); await pg.click('[data-ss="invh"]'); await pg.waitForTimeout(300);
  log('store invh:', (await pg.textContent('#mbox')).replace(/\s+/g, ' ').slice(0, 300)); await pg.click('#modal .mclose');
  /* 인보이스 조회 (이번 달) */
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('.htile', { timeout: 60000 }); await pg.click('[data-hg="inv"]'); await pg.waitForSelector('#iList .kpi', { timeout: 60000 }); log('inv browser:', (await pg.textContent('#iList .kpi')).replace(/\s+/g, ' ').slice(0, 160));
  log('errors:', errs.length ? errs : 'none'); await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
