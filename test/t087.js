/* v0.8.109 시험 — 📈 매출 탭 현금 흐름 표(Statement Deposit · statement expense · checks · service fee · Monthly profit)와 은행 요약 연결: PDF 저장 → 표 칸 채움 · 표 숫자 → 🏦 은행 탭 월별 요약 · 홈 현금 흐름 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const errs = [], log = (...a) => console.log(...a);
  const B = await import('../src/bank.js');
  /* 가짜 DB 로 upsertCashRows */
  const store = { 'sales/2026': { id: '2026', year: 2026, rows: [{ label: 'TOTAL SALES', grp: 'total', m: Array(12).fill(100) }, { label: 'Statement Deposit', grp: 'cash', m: [799544.38, 804321.98, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { label: 'statement expense', grp: 'cash', m: [-622678.69, -762091.04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { label: 'checks', grp: 'cash', m: [-161854.59, -177935.51, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { label: 'service fee', grp: 'cash', m: [-509.8, -469.12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { label: 'Monthly profit', grp: 'cash', m: [14501.3, -136173.69, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }] } };
  const db = { get: async (c, id) => store[c + '/' + id] || null, set: async (c, id, d) => { store[c + '/' + id] = d; } };
  const rows = await B.upsertCashRows(db, '2026-10', { in: 212900.55, out: 190968.57, checks: 18400, fee: 45 });
  const g = l => rows.find(r => r.label === l).m[9]; log('oct cells:', g('Statement Deposit'), g('statement expense'), g('checks'), g('service fee'), g('Monthly profit'));
  if (g('Statement Deposit') !== 212900.55 || g('checks') !== -18400 || g('service fee') !== -45 || g('statement expense') !== -172523.57 || g('Monthly profit') !== 21931.98) errs.push('cash row cells for October');
  if (rows.find(r => r.label === 'Statement Deposit').m[0] !== 799544.38 || rows.find(r => r.label === 'TOTAL SALES').m[0] !== 100) errs.push('other cells must stay');
  const sheet = B.cashFromSheet(store['sales/2026']); log('from sheet:', sheet.map(x => x.ym + ':' + x.in + '/' + x.out).join(' '));
  if (sheet.length !== 3 || sheet[0].ym !== '2026-01' || sheet[0].in !== 799544.38 || sheet[0].out !== 785043.08 || sheet[2].ym !== '2026-10') errs.push('cashFromSheet should expose the months with numbers');
  /* 화면: 시트 숫자만 있을 때 홈 현금 흐름 · 🏦 은행 탭 */
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8824', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const y = new Date().getFullYear(), mi = new Date().getMonth();
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { const m = k => { const a = Array(12).fill(0); a[o.mi] = k; return a; }; s.sales = [{ id: String(o.y), year: o.y, rows: [{ label: 'Statement Deposit', grp: 'cash', m: m(50000) }, { label: 'statement expense', grp: 'cash', m: m(-30000) }, { label: 'checks', grp: 'cash', m: m(-5000) }, { label: 'service fee', grp: 'cash', m: m(-25) }, { label: 'Monthly profit', grp: 'cash', m: m(14975) }] }]; }; }, { y, mi });
  await pg.goto('http://127.0.0.1:8824/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.waitForSelector('[data-og="now"]', { timeout: 10000 }); const dash = (await pg.textContent('[data-og="now"]')).replace(/\s+/g, ' '); log('dash:', dash.slice(-200));
  if (!/은행 실제/.test(dash) || !/\$50,000\.00/.test(dash) || !/\$35,025\.00/.test(dash) || !/✏️/.test(dash)) errs.push('dashboard should use the sales-sheet cash rows (marked ✏️)');
  await pg.evaluate(() => { location.hash = '#/mg/bank'; }); await pg.waitForTimeout(1500); const tab = (await pg.textContent('#mgBody')).replace(/\s+/g, ' '); log('tab:', tab.slice(0, 220));
  if (!/월별 명세서 요약/.test(tab) || !/✏️ 시트/.test(tab) || !/\$50,000\.00/.test(tab) || !/\$35,025\.00/.test(tab)) errs.push('bank tab should list the sheet month');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
