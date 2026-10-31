/* v0.8.112 시험 — 관리자 메뉴에 📄 인보이스 · 🏬 거래처 · 인보이스 탭 날짜별 묶음 · 인보이스 상세 ✏️ 수정(가게 다시 연결) · 🗑 지우기 · 가져오기 파서(Invoice 열 우선 · customer # 필수) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8827', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8827/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const now = new Date(), y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  /* 잘못 들어간 이전 시스템 인보이스 흉내 — 번호에 글자 없음 · 가게 코드 없음 */
  const seed = "s.invoices = (s.invoices || []).concat(" + JSON.stringify([
    { id: '12071', no: '12071', t: '1', d: y + '-' + m + '-02', ym: y + '-' + m, acct: '', store: '', sm: '', total: 150, bal: 0, st: 'paid', src: 'legacy', lines: [] },
    { id: 'A43001', no: 'A43001', t: 'A', d: y + '-' + m + '-02', ym: y + '-' + m, acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', total: 180, bal: 0, st: 'paid', src: 'legacy', lines: [] },
    { id: 'P08700', no: 'P08700', t: 'P', d: y + '-' + m + '-03', ym: y + '-' + m, acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', total: 60, bal: 60, st: 'open', src: 'legacy', lines: [] },
    { id: 'A-043200', no: 'A-043200', t: 'A', d: y + '-' + m + '-05', ym: y + '-' + m, acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', total: 80, bal: 80, st: 'open', orderId: 'O261014-AAAA', lines: [{ c: 'AHG100', d: 'x', q: 1, p: 80 }] }]) + ");";
  let pg = await mk('luke@theonefl.com', seed);
  /* 메뉴 */
  const nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); log('nav:', nav.join(' '));
  if (!nav.includes('hub/look')) errs.push('admin nav should have the lookup group');   // v0.8.135: 📚 조회 묶음 (인보이스 · 거래처)
  /* 📄 인보이스 탭 — 날짜별 묶음 */
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#iList .kpi', { timeout: 8000 }).catch(() => errs.push('invoice tab missing')); await pg.waitForTimeout(500);
  let t = await txt(pg, '#iList'); log('tab:', t.slice(0, 220));
  const heads = await pg.$$eval('#iList tr.grp .gline b', e => e.map(x => x.textContent)); log('day heads:', heads);
  if (!heads.length || !heads.every(h => /📅/.test(h))) errs.push('invoice tab should group by date'); if (heads.length !== 3) errs.push('three day groups expected');
  if (!/12071/.test(t) || !/A43001/.test(t)) errs.push('both invoices should be listed');
  /* 상세 — 가게 연결 안 된 인보이스: 경고 + ✏️ 수정으로 가게 연결 */
  await pg.click('[data-go="inv:12071"]'); await pg.waitForSelector('#idEdit', { timeout: 6000 }).catch(() => errs.push('edit button missing on legacy invoice'));
  t = await txt(pg, '#mbox'); log('detail:', t.slice(0, 200)); if (!/가게\(계정코드\)가 없습니다/.test(t)) errs.push('detail should warn about missing store');
  await pg.click('#idEdit'); await pg.waitForSelector('#ieQ'); await pg.fill('#ieQ', 'BEAUTY 4U'); await pg.waitForTimeout(300); await pg.click('[data-iea="1271"]'); await pg.waitForTimeout(200);
  log('picked:', await txt(pg, '#ieStore'), 'sm:', await pg.inputValue('#ieSm')); if ((await pg.inputValue('#ieSm')) !== 'BRANDON') errs.push('picking the store should fill its salesman');
  await pg.fill('#ieM', '가게 다시 연결'); await pg.click('#ieOk'); await pg.waitForTimeout(1200);
  let inv = await pg.evaluate(() => window.__MOCK_STORE__.invoices['12071']); log('after edit:', inv.acct, inv.store, inv.sm, inv.memo);
  if (inv.acct !== '1271' || inv.store !== 'BEAUTY 4U' || inv.sm !== 'BRANDON' || inv.memo !== '가게 다시 연결') errs.push('edit should relink the store');
  t = await txt(pg, '#mbox'); if (!/BEAUTY 4U/.test(t)) errs.push('detail should now show the store'); if (/가게\(계정코드\)가 없습니다/.test(t)) errs.push('warning should be gone');
  /* 🗑 지우기 */
  await pg.click('#idDel'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  inv = await pg.evaluate(() => window.__MOCK_STORE__.invoices['12071']); if (inv) errs.push('delete should remove the invoice');
  /* 앱 발행 인보이스(orderId 있음)는 수정 대신 주문 열기 */
  await pg.waitForSelector('[data-go="inv:A-043200"]', { timeout: 8000 }).catch(() => errs.push('app invoice row missing'));
  await pg.click('[data-go="inv:A-043200"]'); await pg.waitForSelector('#idStore2', { timeout: 6000 });
  if (await pg.$('#idEdit')) errs.push('app-issued invoice should not offer edit'); if (!(await pg.$('#idOrder'))) errs.push('app-issued invoice should offer open order');
  await pg.click('#idX').catch(() => {}); await pg.waitForTimeout(200);
  /* 🧹 관리 → 가져오기 점검 + 이전 시스템 인보이스 지우기 */
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#invChkGo', { timeout: 8000, state: 'attached' }).catch(() => errs.push('import check button missing'));
  if (await pg.$('#invChkGo')) {
    await pg.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; })); await pg.waitForTimeout(200);
    await pg.click('#invChkGo'); await pg.waitForTimeout(800); t = await txt(pg, '#invChkOut'); log('check:', t.slice(0, 200));
    if (!/전체 3/.test(t) || !/이전 시스템 2/.test(t) || !/앱 발행 1/.test(t)) errs.push('check should count 3 invoices, 2 imported, 1 app');
    await pg.click('#invWipe'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
    const left = await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.invoices)); log('left:', left);
    if (left.includes('A43001') || left.includes('P08700') || !left.includes('A-043200')) errs.push('wipe should delete imported invoices only');
  }
  /* 파서 — Invoice 열 우선 · customer # 필수 */
  const P = await pg.evaluate(async () => { const M = await import('/src/admin.js'); const aoa = [['Trans #', 'Invoice', 'Trans Date', 'Customer #', 'Customer Name', 'Sales Rep', 'Total'], [12071, 'A43001', '10/02/2026', '1271', 'BEAUTY 4U', 'BRANDON', 180], [12072, 'P-008700', '10/03/2026', '3001', 'BEAUTY EXCHANGE', 'ALEX', 60]]; const r = M.parseInvoiceList(aoa, ''); let err = ''; try { M.parseInvoiceList([['Invoice', 'Trans Date', 'Total'], ['A1', '10/02/2026', 1]], ''); } catch (e) { err = e.message; } return { nos: r.rows.map(x => x.no), accts: r.rows.map(x => x.acct), cols: r.cols, noLetter: r.noLetter, err }; });
  log('parser:', JSON.stringify(P));
  if (P.nos.join() !== 'A-043001,P-008700' && P.nos.join() !== 'A43001,P-008700') errs.push('parser should read the Invoice column, not Trans #'); if (P.accts.join() !== '1271,3001') errs.push('parser should read customer #'); if (!/customer/.test(P.err)) errs.push('parser should refuse a file without customer #');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
