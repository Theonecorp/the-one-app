/* v0.8.116 시험 — 🧾 정산 ✓: 줄을 누르면 화면을 다시 읽지 않고 그 줄만 바뀜 · 스크롤 유지 · 저장은 뒤에서 (DB 반영) · 전부 ✓ 도 같은 방식 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8835', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 700 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  /* BRANDON 에게 정산 줄을 많이 — 스크롤이 생기도록 */
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = s => { const base = s.entries.find(e => e.sm === 'BRANDON' && e.pays && e.pays.length); const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); }; for (let i = 0; i < 25; i++) { const e = JSON.parse(JSON.stringify(base)); e.id = 'TT' + i; e.d = day(i % 10); e.ym = e.d.slice(0, 7); e.v = false; e.vbad = false; e.settled = ''; e.sb = true; e.store = 'TEST STORE ' + i; e.pays = [{ m: 'CASH', amt: 100 + i }]; e.invs = [{ no: 'A2' + String(i).padStart(4, '0'), amt: 100 + i, t: 'A' }]; e.total = 100 + i; e.invTotal = 100 + i; s.entries.push(e); } }; });
  await pg.goto('http://127.0.0.1:8835/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForSelector('#pSm', { timeout: 8000 }); await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForSelector('[data-pl]', { timeout: 8000 }).catch(() => errs.push('settlement lines missing'));
  const n0 = await pg.$$eval('[data-pl]', e => e.length); log('lines:', n0); if (n0 < 3) errs.push('expected settlement lines');
  /* 아래로 스크롤해서 뒤쪽 줄을 ✓ */
  const target = await pg.$$eval('[data-pl].pend', e => e[e.length - 1].dataset.pl); log('target:', target);
  await pg.evaluate(t => { document.querySelector('[data-pl="' + t + '"]').scrollIntoView({ block: 'center' }); }, target); await pg.waitForTimeout(300);
  const y0 = await pg.evaluate(() => window.scrollY); log('scrollY before:', y0); if (y0 < 300) errs.push('page should be scrolled down for this test');
  /* 다시 읽기 감지 — pOut 의 "읽는 중" 이 나오면 전체 재로딩 */
  await pg.evaluate(() => { window.__reloads = 0; const mo = new MutationObserver(() => { if (/읽는 중/.test(document.getElementById('page').textContent)) window.__reloads++; }); mo.observe(document.getElementById('page'), { childList: true, subtree: true }); });
  const t0 = Date.now(); await pg.click('[data-pl="' + target + '"]'); await pg.waitForFunction(t => { const el = document.querySelector('[data-pl="' + t + '"]'); return el && el.classList.contains('ok'); }, target, { timeout: 3000 }).catch(() => errs.push('tapped line should turn ✓ quickly')); const dt = Date.now() - t0;
  await pg.waitForTimeout(400);
  const after = await pg.evaluate(t => ({ y: window.scrollY, reloads: window.__reloads, cls: document.querySelector('[data-pl="' + t + '"]').className, mk: document.querySelector('[data-pl="' + t + '"] .mk').textContent, head: document.querElementById ? '' : (document.querySelector('#pOut .heroSub:nth-of-type(2)') || {}).textContent }), target); log('after tap:', JSON.stringify(after), 'ms:', dt);
  if (after.reloads) errs.push('tapping ✓ should not reload the page'); if (Math.abs(after.y - y0) > 40) errs.push('scroll position should stay (was ' + y0 + ', now ' + after.y + ')'); if (!/ok/.test(after.cls) || after.mk.trim() !== '✓') errs.push('line should show ✓');
  const id = target.split('|')[1]; const db = await pg.evaluate(i => { const S = window.__MOCK_STORE__; const e = (S.entries && S.entries[i]) || (S.cod && S.cod[i]); return e && { v: e.v, vAt: e.vAt, keys: Object.keys(S.entries || {}).slice(0, 5) }; }, id); log('db:', JSON.stringify(db)); if (!db || db.v !== true) errs.push('✓ should be saved to the entry');
  const sum = await pg.evaluate(() => (document.querySelector('#pOut .card .heroSub + .paybar + .heroSub') || document.querySelectorAll('#pOut .heroSub')[1]).textContent.replace(/\s+/g, ' ')); log('summary:', sum); if (!/확인 [1-9]/.test(sum)) errs.push('summary should count confirmed lines');
  log('modal after first tap:', await pg.evaluate(() => document.getElementById('modal').className + ' | ' + document.getElementById('mbox').textContent.replace(/\s+/g, ' ').slice(0, 120)));
  /* 두 번째 줄도 — 연속으로 빨리 */
  const t2 = await pg.$$eval('[data-pl].pend', e => e.length ? e[0].dataset.pl : ''); if (t2) { await pg.click('[data-pl="' + t2 + '"]'); await pg.waitForTimeout(500); const ok2 = await pg.evaluate(t => document.querySelector('[data-pl="' + t + '"]').classList.contains('ok'), t2); if (!ok2) errs.push('second tap should also work in place'); }
  /* 전부 ✓ */
  await pg.click('#pAll'); await pg.waitForTimeout(1200); const all = await pg.$$eval('[data-pl].ok', e => e.length); log('all ok:', all); const badN = await pg.$$eval('[data-pl].bad', e => e.length); if (all + badN !== n0) errs.push('전부 ✓ should mark every non-problem line'); if (await pg.evaluate(() => window.__reloads)) errs.push('전부 ✓ should not reload the page either');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
