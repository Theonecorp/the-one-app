/* v0.8.108 시험 — 📄 은행 PDF 명세서: 글자 줄 → 요약(기초 · 입금 · 출금 · 기말) · 거래 줄(구역별 부호 · 발행 체크) · 월 · 월별 요약 표 · 홈 현금 흐름 PDF 요약 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const errs = [], log = (...a) => console.log(...a);
  const B = await import('../src/bank.js');
  const lines = ['JPMorgan Chase Bank, N.A.', 'October 01, 2026 through October 31, 2026', 'Account Number: 000000123456789', 'CHECKING SUMMARY', 'Beginning Balance $41,250.10', 'Deposits and Additions 212,900.55', 'Checks Paid - 18,400.00', 'ATM & Debit Card Withdrawals - 1,215.40', 'Electronic Withdrawals - 171,308.17', 'Fees - 45.00', 'Ending Balance $63,182.08',
    'DEPOSITS AND ADDITIONS', 'DATE DESCRIPTION AMOUNT', '10/02 Remote Online Deposit 1 12,500.00', '10/05 Zelle Payment From ALI BEAUTY 1,200.00', '10/15 Orig CO Name:Square Inc Orig ID:123 Desc Date:101526 CO Entry Descr:261015P2 880.40', 'Total Deposits and Additions $212,900.55',
    'CHECKS PAID', 'CHECK NO. DATE AMOUNT', '1042 ^ 10/07 1,200.00', '1043 * 10/12 17,200.00', 'Total Checks Paid $18,400.00',
    'ELECTRONIC WITHDRAWALS', 'DATE DESCRIPTION AMOUNT', '10/04 Chips Credit Via: Bank Of China/0326 B/O: Shengxing Yiwu 48,867.29', '10/06 UPS Billing Center 315.20', '10/08 IRS USATAXPYMT 1,200.00', 'Total Electronic Withdrawals $171,308.17',
    'FEES', '10/31 Monthly Service Fee 45.00', 'Total Fees $45.00', 'DAILY ENDING BALANCE', '10/02 53,750.10'];
  const P = B.parseBankText(lines, 'chase_oct.pdf'); log('pdf:', P.ym, P.from, P.to, P.begin, P.in, P.out, P.end, P.how, 'rows', P.rows.length, P.rows.map(r => r.amt + ':' + r.cat).join(','));
  if (P.ym !== '2026-10' || P.from !== '2026-10-01' || P.to !== '2026-10-31') errs.push('period');
  if (P.begin !== 41250.1 || P.in !== 212900.55 || P.out !== 190968.57 || P.end !== 63182.08) errs.push('summary totals (begin/in/out/end)');
  if (P.rows.length !== 9) errs.push('should read 9 transaction rows');
  const cats = P.rows.map(r => r.cat).join(','); if (cats !== 'dep,zelle,card,checkout,checkout,factory,ship,tax,fee') errs.push('row categories: ' + cats);
  if (!P.rows.every(r => (r.amt > 0) === (r.cat === 'dep' || r.cat === 'zelle' || r.cat === 'card'))) errs.push('signs by section');
  if (P.warn.length !== 2) errs.push('row sums ≠ summary should warn twice (partial rows)');
  const Q = B.parseBankText(['Some Bank', 'Statement Period 09/01/2026 - 09/30/2026', 'Previous Balance 1,000.00', 'Total Deposits and Credits 5,000.00', 'Total Withdrawals and Debits 3,500.00', 'New Balance 2,500.00']); log('q:', Q.ym, Q.in, Q.out, Q.begin, Q.end, Q.how);
  if (Q.ym !== '2026-09' || Q.in !== 5000 || Q.out !== 3500 || Q.begin !== 1000 || Q.end !== 2500 || Q.how !== 'summary') errs.push('summary-only statement');
  if (B.parseBankText(['hello', 'world']).how !== 'none') errs.push('no-data detection');
  /* 화면 — bankM 만 있을 때 */
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8823', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const ym = new Date().toISOString().substring(0, 7);
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { s.bankM = [{ id: o.ym, ym: o.ym, begin: 41250.1, in: 212900.55, out: 190968.57, end: 63182.08, from: o.ym + '-01', to: o.ym + '-31', rows: 0 }]; }; }, { ym });
  await pg.goto('http://127.0.0.1:8823/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.waitForSelector('[data-og="now"]', { timeout: 10000 }); const dash = (await pg.textContent('[data-og="now"]')).replace(/\s+/g, ' ');
  if (!/은행 실제/.test(dash) || !/\$212,900\.55/.test(dash) || !/\$190,968\.57/.test(dash) || !/월별 요약 10월/.test(dash)) errs.push('dashboard should show PDF monthly summary: ' + dash.slice(-200));
  await pg.evaluate(() => { location.hash = '#/mg/bank'; }); await pg.waitForTimeout(1500); const tab = (await pg.textContent('#mgBody')).replace(/\s+/g, ' ');
  if (!/월별 명세서 요약/.test(tab) || !/\$212,900\.55/.test(tab) || !/\$63,182\.08/.test(tab) || !/월별 요약만/.test(tab)) errs.push('bank tab should show the monthly summary table: ' + tab.slice(0, 200));
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
