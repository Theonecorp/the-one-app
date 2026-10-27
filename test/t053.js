/* v0.8.12 시험 — 경영 📥 과거 데이터 가져오기 (SEED_DATA 붙여넣기 → 공장/1099/보너스/배분표/대상) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
const SEED = 'var SEED_DATA = ' + JSON.stringify({ fac: [{ code: 'SX', name: 'SHENGXING YIWU' }, { code: 'JD', name: 'ZHEJIANG JUDA' }],
  inv: [{ f: 'SX', d: '2025-01-03', item: 1000, frt: 100, amt: 1100, type: '인보이스', note: '', src: '2025' }, { f: 'SX', d: '2025-01-24', item: -50, frt: 0, amt: -50, type: '크레딧', note: 'CREDIT', src: '2025' }, { f: 'JD', d: '2025-01-05', item: 5000, frt: 0, amt: 5000, type: '이월', note: '', src: '2025' }],
  pay: [{ f: 'SX', d: '2025-01-10', amt: 600, note: '', src: '2025' }, { f: 'JD', d: '2025-01-22', amt: 2000, note: '', src: '2025' }],
  p1099: [{ d: '2025-01-07', who: 'SOO', co: 'MORO CORP', amt: 9994.29, note: '', src: '2025' }, { d: '2026-01-15', who: 'KAEL', co: '', amt: 6000, note: '', src: '2026' }],
  bonus: [{ d: '2026-05-13', sm: 'ALEX', amt: 352.09, note: '' }],
  split: [{ grp: 'A', name: 'EUNJI', pct: 45, share: 50 }, { grp: 'B', name: 'JOE', pct: 20, share: 50 }],
  payees: { SOO: 'MORO CORP', KAEL: 'SJW INTERNATIONAL' }, payeeKinds: { SOO: { kind: '커미션', cycle: '', officePct: 0, active: true }, KAEL: { kind: '고정', cycle: '반월', officePct: 3.5, active: true } } }) + ';';
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8776', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 1100, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
  const shot = n => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  const txt = async sel => ((await pg.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' }; });
  await pg.goto('http://127.0.0.1:8776/test/demo.html'); await pg.waitForSelector('#nav button');
  /* v0.8.20: 가져오기는 관리 → 📥 가져오기 */
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#f4', { state: 'attached' }); /* v0.8.78: 파일 칸은 접힌 칸 안 (자동 인식) */ await pg.evaluate(() => { document.querySelectorAll('details').forEach(d => { d.open = true; }); }); await pg.waitForSelector('#seedPaste');
  const cnt = () => pg.evaluate(() => { const S = window.__MOCK_STORE__; return [S.factoryInvoices, S.factoryPayments, S.pay1099, S.bonusAcc, S.payees, S.factories].map(c => Object.keys(c || {}).length).join('/'); });
  log('before:', await cnt());
  await pg.click('#seedPaste'); await pg.waitForSelector('#seedTxt'); await pg.fill('#seedTxt', SEED); await pg.click('#sOk'); await pg.waitForSelector('#sGo');
  const pv = await txt('#mbox'); log('preview:', pv.slice(0, 400)); await shot('c0_seed_preview');
  if (!/3 줄/.test(pv) || !/2 명/.test(pv)) errs.push('preview counts wrong');
  await pg.click('#sGo'); await pg.waitForTimeout(1200);
  const c1 = await cnt(); log('after 1st:', c1); if (c1.indexOf('3/2/2/1/') !== 0) errs.push('import counts wrong: ' + c1);
  /* 두 번 넣어도 같은 수 */
  await pg.click('#seedPaste'); await pg.waitForSelector('#seedTxt'); await pg.fill('#seedTxt', SEED); await pg.click('#sOk'); await pg.waitForSelector('#sGo'); log('re-import:', (await txt('#mbox')).slice(0, 120)); await pg.click('#sGo'); await pg.waitForTimeout(1000);
  const c2 = await cnt(); log('after 2nd:', c2); if (c2 !== c1) errs.push('re-import duplicated rows');
  /* 경영 → 공장 잔액 */
  await pg.evaluate(() => { location.hash = '#/mg'; }); await pg.waitForSelector('#mgBody .card'); await pg.waitForTimeout(500);
  const home = await txt('#mgBody'); log('mg home:', home.slice(0, 200)); if (!/\$3,450\.00/.test(home)) errs.push('factory balance wrong');
  await pg.click('[data-go="fac"]'); await pg.waitForTimeout(500); log('fac:', (await txt('#mgBody')).slice(0, 200)); await shot('c2_fac');
  /* 1099 탭 */
  await pg.evaluate(() => { document.querySelector('.ctabs button[data-t="p99"], [data-tab="p99"]')?.click(); }); await pg.waitForTimeout(500);
  log('errors:', errs.length ? errs : 'none'); await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
