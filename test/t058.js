/* 실제 시트 3개 가져오기 (파일 경로 인자: main sales comm — 없으면 건너뜀) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
const [MAIN, SALES, COMM] = process.argv.slice(2); if (!MAIN || !fs.existsSync(MAIN)) { console.log('skip: no file'); process.exit(0); }
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8788', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 900, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' }; window.__AFTER_SEED__ = s => { s.entries = []; s.cod = []; s.accounts = []; s.ar = []; }; });
  await pg.goto('http://127.0.0.1:8788/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#f1');
  const msgs = () => pg.$$eval('#impOut .alert', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 260)));
  const cnt = () => pg.evaluate(() => { const S = window.__MOCK_STORE__; const n = k => Object.keys(S[k] || {}).length; return { entries: n('entries'), accounts: n('accounts'), salesmen: n('salesmen'), users: n('users'), ar: n('ar'), cod: n('cod'), settlements: n('settlements') }; });
  await pg.fill('#impArD', '2026-10-17');
  await pg.setInputFiles('#f1', MAIN); await pg.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 180000 }); await pg.waitForTimeout(1500);
  log('① main:', await msgs()); log('counts:', await cnt());
  const arAll = await pg.evaluate(() => { const a = window.__MOCK_STORE__.ar && window.__MOCK_STORE__.ar._all; return a ? { asOf: a.asOf, total: a.total, n: a.n, unmatched: (a.unmatched || []).length, noSm: a.noSmAmt } : null; }); log('ar/_all:', arAll); log('entry sample:', await pg.evaluate(() => { const E = Object.values(window.__MOCK_STORE__.entries); const ym = {}; E.forEach(e => { ym[e.ym || '(없음)'] = (ym[e.ym || '(없음)'] || 0) + 1; }); return { ym, s: E.slice(0, 2).map(e => ({ id: e.id, d: e.d, ym: e.ym, sm: e.sm, total: e.total, sb: e.sb, rc: e.rc, v: e.v, settled: e.settled, pays: e.pays, invs: e.invs })) }; }));
  if (SALES && fs.existsSync(SALES)) { await pg.evaluate(() => { document.getElementById('impOut').innerHTML = ''; }); await pg.setInputFiles('#f2', SALES); await pg.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 180000 }); await pg.waitForTimeout(1000); log('② sales:', await msgs()); log('counts:', await cnt()); }
  if (COMM && fs.existsSync(COMM)) { await pg.evaluate(() => { document.getElementById('impOut').innerHTML = ''; }); await pg.setInputFiles('#f3', COMM); await pg.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 180000 }); await pg.waitForTimeout(1000); log('③ comm:', await msgs()); log('counts:', await cnt()); }
  /* 현황 · 미수금 화면이 뜨나 */
  await pg.evaluate(() => { location.hash = '#/now'; }); await pg.waitForSelector('#estBox .hero, #estBox .none', { timeout: 60000 }); log('now:', (await pg.textContent('#page')).replace(/\s+/g, ' ').slice(0, 420));
  await pg.evaluate(() => { location.hash = '#/bossar'; }); await pg.waitForTimeout(2500); log('ar page:', (await pg.textContent('#page')).replace(/\s+/g, ' ').slice(0, 300));
  log('errors:', errs.length ? errs : 'none'); await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
