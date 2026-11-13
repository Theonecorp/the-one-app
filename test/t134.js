/* v0.8.166 시험 — 💵 수금 확인 · 🧾 세일즈맨 정산의 거래처 줄은 오래된 수금이 위, 가장 최근 것이 맨 아래 (들어온 순서대로 처리)
 *   ① 수금 확인 👤 세일즈맨별: 묶음 안의 줄이 날짜 오름차순 (같은 날은 넣은 순서)
 *   ② 수금 확인 📅 날짜별: 날짜 묶음이 오래된 날부터 · 📁 정산 완료 도 같은 순서
 *   ③ 🧾 세일즈맨 정산: 날짜 묶음과 줄이 오래된 날부터 (바뀌지 않았는지 지킴) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8886', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  const seed = `const base = s.entries.find(e => e.sm === 'BRANDON' && e.pays && e.pays.length); const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(x)); };
    s.entries = s.entries.filter(e => e.sm !== 'BRANDON');
    for (let i = 0; i < 12; i++) { const e = JSON.parse(JSON.stringify(base)); e.id = 'OL' + i; e.d = day([7, 0, 3, 7, 1, 0, 5, 3, 2, 9, 0, 4][i]); e.ym = e.d.slice(0, 7); e.createdAt = e.d + 'T10:' + String(10 + i).padStart(2, '0') + ':00Z'; e.v = false; e.settled = i >= 10 ? 'SET1' : ''; e.sb = i >= 10 || !(i === 1 || i === 4); e.rc = e.sb;   /* 1 · 4 는 접수 확인 대기, 나머지는 수령 완료(정산 화면에 보임) */ e.env = ''; e.mismatch = ''; e.store = 'OSTORE ' + i; e.pays = [{ m: 'CHECK', ref: String(8100 + i), amt: 50 + i }]; e.refs = [String(8100 + i)]; e.invs = []; e.total = 50 + i; s.entries.push(e); }`;
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { seed });
  await pg.goto('http://127.0.0.1:8886/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const asc = a => a.every((x, i) => !i || a[i - 1] <= x);
  const keys = () => pg.evaluate(() => Array.from(document.querySelectorAll('#page .pr[data-vid]')).map(el => el.dataset.vid).filter(id => /^OL/.test(id)).map(id => { const e = window.__MOCK_STORE__.entries[id]; return e.d + ' ' + (e.createdAt || ''); }));
  /* ① 세일즈맨별 (기본) — 전체 보기(접수 확인 대기 + 수령 대기 전부) */
  await pg.evaluate(() => { location.hash = '#/verify'; }); await pg.waitForSelector('[data-vid="OL1"]', { timeout: 8000 });   // 기본 필터 = ① 접수 확인 대기 → 1 · 4 만 보임
  await pg.click('[data-vf="all"]'); await pg.waitForTimeout(300);
  let k = await keys(); log('① by salesman:', k.map(x => x.slice(5, 10)).join(' '));
  if (k.length !== 10) errs.push('① 10 open rows expected, got ' + k.length); if (!asc(k)) errs.push('① rows must be oldest first (date, then entry order)');
  /* ② 날짜별 */
  await pg.click('[data-vg="day"]'); await pg.waitForSelector('.dayhd', { timeout: 5000 });
  let days = await pg.evaluate(() => Array.from(document.querySelectorAll('#page .card')).filter(c => c.querySelector('.dayhd') && c.querySelector('.pr[data-vid^="OL"]')).map(c => window.__MOCK_STORE__.entries[c.querySelector('.pr[data-vid^="OL"]').dataset.vid].d));
  k = await keys(); log('② by day:', days.join(' '));
  if (days.length < 5 || !asc(days)) errs.push('② day groups must run oldest → newest'); if (!asc(k)) errs.push('② rows across day groups must be oldest first');
  /* 📁 정산 완료 */
  await pg.click('[data-vf="done"]'); await pg.waitForTimeout(300); k = await keys(); log('② settled:', k.map(x => x.slice(5, 10)).join(' '));
  if (k.length !== 2 || !asc(k)) errs.push('② settled list must also be oldest first');
  /* ③ 🧾 세일즈맨 정산 */
  await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForSelector('#pSm', { timeout: 8000 }); await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForSelector('[data-pl]', { timeout: 8000 }).catch(() => errs.push('③ settlement lines missing'));
  const pl = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-pl]')).map(el => el.dataset.pl).filter(x => /^f\|OL/.test(x)).map(x => { const e = window.__MOCK_STORE__.entries[x.split('|')[1]]; return e.d + ' ' + (e.createdAt || ''); }));
  log('③ settlement:', pl.map(x => x.slice(5, 10)).join(' '));
  if (pl.length < 3) errs.push('③ expected received (② 수령) lines in the settlement — got ' + pl.length); if (!asc(pl)) errs.push('③ settlement lines must be oldest first');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
