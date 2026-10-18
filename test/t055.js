/* v0.8.16 시험 — 수금 확인 (SmartBee 없이): 세일즈맨별 묶음 · 📬 체크 맞추기 → 수령 ✓ · ① 접수 확인 → 앱 인보이스 입금 반영 · 📚 가게 기록 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8783', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
  const shot = n => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  const txt = async sel => ((await pg.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: '회계' }; window.__AFTER_SEED__ = s => { s.invoices = (s.invoices || []).concat([{ id: 'A10021', no: 'A10021', t: 'A', d: '2026-10-01', ym: '2026-10', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', order: 'O1', qty: 5, sub: 1500, disc: 0, total: 1500, bal: 1500, st: 'open', lines: [] }]); }; });
  await pg.goto('http://127.0.0.1:8783/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/verify'; }); await pg.waitForSelector('#ckNo'); await shot('e0_verify');
  log('kpi:', (await txt('.kpi')).slice(0, 160));
  log('groups:', await pg.$$eval('.smgrp', e => e.map(x => x.querySelector('.iday').textContent.replace(/\s+/g, ' ').trim().slice(0, 60))));
  if (!(await pg.$('.smgrp'))) errs.push('no salesman groups');
  /* 📬 체크 맞추기: 2201 (E2 · sb 됨 · rc 안 됨) */
  await pg.fill('#ckNo', '2201'); await pg.press('#ckNo', 'Enter'); await pg.waitForSelector('[data-ckrc]'); log('match:', (await txt('#ckOut')).slice(0, 120));
  await pg.click('[data-ckrc]'); await pg.waitForTimeout(800);
  const e2 = await pg.evaluate(() => window.__MOCK_STORE__.entries.E2); log('E2 after:', e2.rc, e2.rcAt); if (!e2.rc) errs.push('check match did not set rc');
  /* 없는 번호 */
  await pg.fill('#ckNo', '999999'); await pg.press('#ckNo', 'Enter'); await pg.waitForTimeout(500); log('no match:', (await txt('#ckOut')).slice(0, 60));
  /* ① 접수 확인 → 인보이스 A10021 잔액 1500 → 0 */
  await pg.click('[data-vid="E1"]'); await pg.waitForSelector('#pkSb'); await pg.click('#pkSb'); await pg.click('#vSave'); await pg.waitForTimeout(900);
  const inv = await pg.evaluate(() => window.__MOCK_STORE__.invoices.A10021); log('A10021 after review:', inv.bal, inv.pays); if (inv.bal !== 0) errs.push('invoice not posted');
  /* 되돌리기 (① 된 건은 '전체' 에서) */
  await pg.click('[data-vf="all"]'); await pg.waitForTimeout(500); await pg.click('[data-vid="E1"]'); await pg.waitForSelector('#pkSb'); await pg.click('#pkSb'); await pg.click('#vSave'); await pg.waitForTimeout(900);
  log('A10021 after undo:', await pg.evaluate(() => window.__MOCK_STORE__.invoices.A10021.bal));
  /* 📚 가게 기록 */
  await pg.fill('#vfQ', 'ali b/s'); await pg.waitForTimeout(700); await pg.waitForSelector('[data-vacc]'); await pg.click('[data-vacc]'); await pg.waitForSelector('#shX'); log('history:', (await txt('#mbox')).slice(0, 200)); await shot('e1_history');
  if (!/정산 완료/.test(await txt('#mbox'))) errs.push('history should include settled rows');
  await pg.click('#shX');
  /* 세일즈맨 화면 라벨 */
  log('errors:', errs.length ? errs : 'none'); await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
