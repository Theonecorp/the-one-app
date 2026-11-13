/* v0.8.205 시험 — 🧾 정산: 한 줄 필터 · 🔍 검색을 눌러야 기간 · 📁 옛 정산 정리 (2026-11-13 관리자: "공간이 남는데 왜 두 줄 · 세일즈맨 고르고 기간 정한 뒤 검색 · 전에 정산했던 게 계속 반복돼서 나옴")
 *   ① 넓은 화면: 세일즈맨 · 시작일 · ~ · 끝일 · 🔍 검색이 한 줄
 *   ② 세일즈맨을 고르면 그 사람의 미정산 전체(기간 상관없이 · 60일 전 줄도)
 *   ③ 날짜만 바꾸면 목록이 안 바뀜 → 🔍 검색을 눌러야 그 기간
 *   ④ 📁 옛 정산 정리: 고른 날까지의 미정산 줄이 정산 끝남(settled = OLD-…) · 보관함에 src old 기록 · 그 뒤 줄은 그대로 · 미정산 전체에 다시 안 나옴 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8914', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ds = n => new Date(Date.now() - n * 864e5).toISOString().substring(0, 10);
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { const mk = (id, d, amt) => ({ id, d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'OLDTEST ' + id, addr: '', pays: [{ m: 'CHECK', ref: id, amt, dep: d, mob: false }], invs: [{ no: 'A1' + id, t: 'A', amt }], total: amt, invTotal: amt, sb: true, rc: true, v: false, vn: '', settled: '', void: false, createdBy: 'brandon@x.com', createdAt: d, rep: true }); s.entries.push(mk('8801', o.old1, 100), mk('8802', o.old2, 200), mk('8803', o.recent, 300)); }; }, { old1: ds(60), old2: ds(45), recent: ds(3) });
  await pg.goto('http://127.0.0.1:8914/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForSelector('#pGo', { timeout: 8000 }); await pg.waitForTimeout(400);
  /* ① */
  const tops = await pg.evaluate(() => ['#pSm', '#pFrom', '#pTo', '#pGo'].map(q => Math.round(document.querySelector(q).getBoundingClientRect().top)));
  log('① tops:', JSON.stringify(tops)); if (Math.max(...tops) - Math.min(...tops) > 6) errs.push('① salesman · dates · search on one line');
  /* ② */
  await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForSelector('.pr.pl'); await pg.waitForTimeout(500);
  let txt = await pg.textContent('#pOut'); log('② all unsettled has 8801/8803:', /OLDTEST 8801/.test(txt), /OLDTEST 8803/.test(txt));
  if (!/OLDTEST 8801/.test(txt) || !/OLDTEST 8803/.test(txt)) errs.push('② picking a salesman shows all unsettled lines');
  /* ③ */
  await pg.fill('#pFrom', ds(10)); await pg.dispatchEvent('#pFrom', 'change'); await pg.fill('#pTo', ds(0)); await pg.dispatchEvent('#pTo', 'change'); await pg.waitForTimeout(500);
  txt = await pg.textContent('#pOut'); if (!/OLDTEST 8801/.test(txt)) errs.push('③ changing dates alone does not reload');
  await pg.click('#pGo'); await pg.waitForTimeout(800); txt = await pg.textContent('#pOut'); log('③ after 🔍: 8801', /OLDTEST 8801/.test(txt), '8803', /OLDTEST 8803/.test(txt));
  if (/OLDTEST 8801/.test(txt) || !/OLDTEST 8803/.test(txt)) errs.push('③ 🔍 search applies the period');
  /* ④ */
  await pg.click('[data-pall]'); await pg.waitForSelector('#pOld'); await pg.waitForTimeout(400);
  await pg.click('#pOld'); await pg.waitForSelector('#olTo'); await pg.fill('#olTo', ds(30)); await pg.dispatchEvent('#olTo', 'change'); await pg.waitForTimeout(200);
  log('④ summary:', (await pg.textContent('#olSum')).replace(/\s+/g, ' ')); if (!/2건/.test(await pg.textContent('#olSum'))) errs.push('④ summary counts the 2 old lines');
  await pg.click('#olGo'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const st = await pg.evaluate(() => { const M = window.__MOCK_STORE__; return { e: ['8801', '8802', '8803'].map(id => M.entries[id].settled || ''), s: Object.values(M.settlements || {}).filter(x => x.src === 'old').map(x => x.sm + ':' + x.n) }; });
  log('④ settled:', JSON.stringify(st));
  if (!/^OLD-/.test(st.e[0]) || !/^OLD-/.test(st.e[1]) || st.e[2]) errs.push('④ only lines up to the day are closed');
  if (!st.s.includes('BRANDON:2')) errs.push('④ archive has an old-system record');
  txt = await pg.textContent('#pOut'); if (/OLDTEST 8801/.test(txt) || !/OLDTEST 8803/.test(txt)) errs.push('④ closed lines no longer come back');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
