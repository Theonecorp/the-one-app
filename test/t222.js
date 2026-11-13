/* v0.8.201 시험 — 🖥 정산서 데스크탑 표 · 이 날 전부 한 번 더 → 해제 (2026-11-12 관리자: "엑셀처럼 타이틀을 위에 두고 빈 공간 없이 가게 코드 · 가게 이름 · 체크 넘버 · 입금일(색으로 구별) · 금액 · 이 날 전부를 한 번 더 누르면 해제")
 *   ① 넓은 화면: 정산 줄 위에 제목 줄(# · 계정 · 가게 · 방법 · 체크 # · 받은 날 · 입금일 · 구역 · 금액 · 상태)이 칸으로 · 줄도 같은 칸(그리드)
 *   ② 입금일이 미래(선일자)면 주황 · 지났으면 초록
 *   ③ ✓ 이 날 전부 → 그날 줄이 모두 ✓ → 그 자리에 ↺ 이 날 해제 → 누르면 그날 ✓ 가 모두 풀림
 *   ④ 폰(좁은 화면)은 예전 카드 모양 그대로 (제목 줄 없음) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8907', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const fut = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(Date.now() + 9 * 864e5))), past = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(Date.now() - 1 * 864e5)));
  const open = async w => { const pg = await (await br.newContext({ viewport: { width: w, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { const d = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(Date.now() - 3 * 864e5))); const mk = (id, dep, amt) => ({ id, d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'DEP TEST ' + id, addr: '', pays: [{ m: 'CHECK', ref: id, amt, dep, mob: false }], invs: [{ no: 'A1' + id, t: 'A', amt }], total: amt, invTotal: amt, sb: true, rc: true, v: false, vn: '', settled: '', void: false, createdBy: 'brandon@x.com', createdAt: d, rep: true }); s.entries.push(mk('7701', o.fut, 100), mk('7702', o.past, 200)); }; }, { fut, past });
    await pg.goto('http://127.0.0.1:8907/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForSelector('#pOut .card', { timeout: 8000 });
    const from = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(Date.now() - 20 * 864e5))), to = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date()));
    await pg.fill('#pFrom', from); await pg.dispatchEvent('#pFrom', 'change'); await pg.waitForTimeout(300); await pg.fill('#pTo', to); await pg.dispatchEvent('#pTo', 'change'); await pg.waitForTimeout(300);
    await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForSelector('.pr.pl'); await pg.waitForTimeout(500); return pg; };
  /* ① ② */
  const pg = await open(1400);
  const hd = await pg.evaluate(() => { const h = document.querySelector('.plhd'); return h ? { disp: getComputedStyle(h).display, cols: getComputedStyle(h).gridTemplateColumns.split(' ').length, txt: [...h.children].map(x => x.textContent.trim()).filter(Boolean).join(' | ') } : null; });
  log('① head:', JSON.stringify(hd));
  if (!hd || hd.disp !== 'grid' || hd.cols !== 10 || !/계정.*가게.*방법.*받은 날.*입금일.*구역.*금액.*상태/.test(hd.txt)) errs.push('① title row with 10 grid columns');
  const rowCols = await pg.$eval('.pr.pl.plr', r => getComputedStyle(r).gridTemplateColumns.split(' ').length).catch(() => 0); if (rowCols !== 10) errs.push('① rows use the same 10 columns');
  const pills = await pg.$$eval('.deppill', P => P.map(p => p.className + ':' + p.textContent)); log('② deposit pills:', pills.join(' '));
  if (!pills.some(p => /fut/.test(p) && p.includes(fut.substring(5)))) errs.push('② future deposit date is orange (fut)');
  if (!pills.some(p => /\bok\b/.test(p) && p.includes(past.substring(5)))) errs.push('② past deposit date is green (ok)');
  /* ③ */
  const day = await pg.$eval('[data-dayall]', b => b.dataset.dayall).catch(() => '');
  const stOf = d => pg.evaluate(d => { const M = window.__MOCK_STORE__; return [...Object.values(M.entries || {}), ...Object.values(M.cod || {})].filter(x => x.sm === 'BRANDON' && x.d === d && !x.void).map(x => !!x.v); }, d);
  log('③ day:', day, 'before:', JSON.stringify(await stOf(day)));
  await pg.click('[data-dayall="' + day + '"]'); await pg.waitForTimeout(700);
  const on = await stOf(day); log('③ after ✓ day:', JSON.stringify(on)); if (!on.length || on.some(v => !v)) errs.push('③ day all ticked');
  const off = await pg.$('[data-dayoff="' + day + '"]'); if (!off) errs.push('③ ↺ untick-day button appears'); else { await off.click(); await pg.waitForTimeout(700); const o2 = await stOf(day); log('③ after ↺:', JSON.stringify(o2)); if (o2.some(v => v)) errs.push('③ ↺ unticks the day'); }
  if (!(await pg.$('[data-dayall="' + day + '"]'))) errs.push('③ ✓ day button comes back');
  /* ④ */
  const ph = await open(430);
  if (await ph.$('.plhd')) errs.push('④ phone has no title row');
  if (await ph.$('.pr.pl.plr')) errs.push('④ phone keeps card rows');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
