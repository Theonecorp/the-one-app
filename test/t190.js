/* v0.8.185 시험 — 💰 수금의 디파짓 날짜 (2026-11-11 관리자: "거래처 기록 · 수금 기록에서 받은 날짜 말고 디파짓이 되는 날짜도")
 *   ① 거래처 창 📒 인보이스 · 수금 표: 날짜 칸 = 받은 날 + 밑에 디파짓 날짜 (체크는 같은 날이어도) · 후일 수표는 🟠 후일 · ACH 같이 같은 날은 안 붙임
 *   ② 수금 기록 → 🔎 조회: 체크마다 "디파짓 Dep 날짜" · 후일 수표는 후일 디파짓 표시 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8858', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(d)); }, md = s => s.substring(5, 7) + '/' + s.substring(8, 10);
  const seed = `const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(d)); }; const ymOf = d => d.substring(0, 7);
    s.invoices = (s.invoices || []).concat([{ id: 'A10055', no: 'A10055', t: 'A', d: day(10), ym: ymOf(day(10)), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 5000, bal: 5000, st: 'open', lines: [] }]);
    s.entries.push({ id: 'EPDC', d: day(3), ym: ymOf(day(3)), sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', pays: [{ m: 'CHECK', ref: '5501', amt: 70, dep: day(-12), mob: false }], invs: [{ no: 'A10055', amt: 70 }], total: 70, void: false, rep: true });
    s.entries.push({ id: 'ESAME', d: day(5), ym: ymOf(day(5)), sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', pays: [{ m: 'CHECK', ref: '5400', amt: 30, dep: day(5), mob: false }], invs: [{ no: 'A10055', amt: 30 }], total: 30, void: false, rep: true });
    s.cod.push({ id: 'C9', d: day(6), ym: ymOf(day(6)), sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', method: 'ACH', ref: 'ACH-77', amt: 100, invs: [{ no: 'A10055', amt: 100 }], void: false });`;
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 950 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { seed });
  await pg.goto('http://127.0.0.1:8858/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300);
  /* ① 거래처 창 */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac="1111"]');
  await pg.waitForSelector('[data-ipi]', { timeout: 8000 }); await pg.waitForTimeout(300);
  const head = await pg.$eval('.ippays .iptbl tr', r => r.textContent.replace(/\s+/g, ' '));
  const P = await pg.$$eval('.ippays .iptbl tr', T => T.slice(1).map(r => [...r.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()).join('|')));
  log('① head:', head, '\n① rows:', JSON.stringify(P));
  if (!/받은 날 · 디파짓/.test(head)) errs.push('① the date column is "받은 날 · 디파짓"');
  const pdc = P.find(p => /#5501/.test(p)), same = P.find(p => /#5400/.test(p)), ach = P.find(p => /ACH-77/.test(p));
  if (!pdc || !new RegExp(md(day(3)) + '.*후일.*디파짓 ' + md(day(-12))).test(pdc)) errs.push('① post-dated check: received ' + md(day(3)) + ' · 🟠 후일 · deposit ' + md(day(-12)));
  if (!same || !new RegExp(md(day(5)) + '디파짓 ' + md(day(5))).test(same) || /후일/.test(same)) errs.push('① check deposited the same day still shows its deposit date, no 후일');
  if (!ach || /디파짓/.test(ach)) errs.push('① ACH (same day) has no extra deposit line');
  /* ② 수금 기록 → 조회 */
  await pg.evaluate(() => { location.hash = '#/hist'; }); await pg.waitForSelector('#hQ'); await pg.fill('#hQ', '1111'); await pg.click('#hGo'); await pg.waitForSelector('.hent', { timeout: 8000 });
  const H = await pg.$$eval('.hent', E => E.map(e => e.textContent.replace(/\s+/g, ' ')));
  log('② hist:', JSON.stringify(H.map(h => h.slice(0, 150))));
  const h1 = H.find(h => /#5501/.test(h)), h2 = H.find(h => /#5400/.test(h));
  if (!h1 || !new RegExp('후일 디파짓 Dep ' + day(-12)).test(h1)) errs.push('② history: post-dated check shows 후일 디파짓 Dep ' + day(-12));
  if (!h2 || !new RegExp('디파짓 Dep ' + day(5)).test(h2)) errs.push('② history: same-day check shows its deposit date');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
