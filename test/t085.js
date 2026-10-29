/* v0.8.107 시험 — 🏦 은행 명세서: 파서(금액 한 열 · 입금/출금 두 열 · 날짜 형식 · 분류 규칙 · 같은 줄 id) · 경영 → 은행 탭(월 · 분류 · 앱 대조 · 분류 바꾸기) · 오너 홈 현금 흐름 은행 줄 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const errs = [], log = (...a) => console.log(...a);
  const B = await import('../src/bank.js');
  /* 체이스식: Details · Posting Date · Description · Amount · Type · Balance */
  const chase = [['Details', 'Posting Date', 'Description', 'Amount', 'Type', 'Balance', 'Check or Slip #'], ['CREDIT', '10/03/2026', 'REMOTE ONLINE DEPOSIT #          1', '12500.00', 'ACH_CREDIT', '52000.00', ''], ['DEBIT', '10/04/2026', 'CHIPS CREDIT VIA: BANK OF CHINA/0326 B/O: SHENGXING YIWU', '-48867.29', 'WIRE_OUTGOING', '3132.71', ''], ['CREDIT', '10/05/2026', 'Zelle payment from ALI BEAUTY', '1200.00', 'QUICKPAY_CREDIT', '4332.71', ''], ['DEBIT', '10/06/2026', 'UPS BILLING CENTER', '-315.20', 'ACH_DEBIT', '4017.51', ''], ['DEBIT', '10/07/2026', 'RETURNED ITEM CHARGEBACK', '-2400.00', 'MISC_DEBIT', '1617.51', ''], ['DEBIT', '10/08/2026', 'ORLANDO WAREHOUSE LLC', '-3500.00', 'ACH_DEBIT', '-1882.49', '']];
  const P = B.parseBank(chase, 'chase.csv'); log('chase:', P.rows.length, P.in, P.out, P.bal, P.rows.map(r => r.cat).join(','));
  if (P.rows.length !== 6 || P.in !== 13700 || P.out !== 55082.49 || P.bal !== -1882.49) errs.push('chase totals');
  if (P.rows.map(r => r.cat).join(',') !== 'dep,factory,zelle,ship,bounce,other') errs.push('chase categories (unknown payee → other)');
  if (P.rows[0].d !== '2026-10-03' || !/^BK20261003-/.test(P.rows[0].id)) errs.push('date · id');
  /* 두 열식: Date · Description · Debit · Credit · Balance (한국식 날짜 포함) */
  const two = [['Statement for account 1234'], [], ['Date', 'Description', 'Debit', 'Credit', 'Balance'], ['2026-10-02', 'MOBILE DEPOSIT', '', '3,250.00', '10,000.00'], ['2026-10-02', 'SQUARE INC 261002', '', '880.40', '10,880.40'], ['2026-10-03', 'ADP PAYROLL FEES', '45.00', '', '10,835.40'], ['2026-10-03', 'IRS USATAXPYMT', '(1,200.00)', '', '9,635.40'], ['2026-10-04', 'ONLINE TRANSFER TO SAVINGS', '5,000.00', '', '4,635.40']];
  const Q = B.parseBank(two, 'two.xlsx'); log('two:', Q.rows.map(r => r.d + ' ' + r.amt + ' ' + r.cat).join(' | '));
  if (Q.rows.length !== 5 || Q.in !== 4130.4 || Q.out !== 6245 || Q.rows.map(r => r.cat).join(',') !== 'dep,card,payroll,tax,xfer') errs.push('two-column parse/categories');
  if (!B.looksLikeBank(two) || B.looksLikeBank([['Date', '', 'ITEM', 'FREIGHT', '', 'Amount', '', 'PAID DATE', 'DEPOSIT MONEY']])) errs.push('looksLikeBank should not match a factory statement');
  const P2 = B.parseBank(chase, 'again.csv'); if (P2.rows[1].id !== P.rows[1].id) errs.push('same row must give the same id on re-upload');
  /* 화면 */
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8822', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const T = new Date().toISOString().substring(0, 10), ym = T.substring(0, 7);
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { s.bank = [{ id: 'BK1', d: o.ym + '-03', ym: o.ym, desc: 'REMOTE ONLINE DEPOSIT', amt: 1500, bal: 9000, cat: 'dep' }, { id: 'BK2', d: o.ym + '-04', ym: o.ym, desc: 'WIRE OUT SHENGXING', amt: -4000, bal: 5000, cat: 'factory' }, { id: 'BK3', d: o.ym + '-05', ym: o.ym, desc: 'MYSTERY VENDOR 8812', amt: -250, bal: 4750, cat: 'other' }]; }; }, { ym });
  await pg.goto('http://127.0.0.1:8822/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.waitForSelector('[data-og="now"]', { timeout: 10000 }); const dash = (await pg.textContent('[data-og="now"]')).replace(/\s+/g, ' '); log('dash cash:', dash.slice(-260));
  if (!/은행 실제/.test(dash) || !/\$1,500\.00/.test(dash) || !/\$4,250\.00/.test(dash) || !/잔액 \$4,750\.00/.test(dash) || !/1줄 분류 전/.test(dash)) errs.push('dashboard should show bank in/out/balance/uncategorized');
  await pg.evaluate(() => { location.hash = '#/mg/bank'; }); await pg.waitForSelector('select[id^="bc_"]', { timeout: 10000 }).catch(() => errs.push('bank tab list missing'));
  const tab = (await pg.textContent('#mgBody')).replace(/\s+/g, ' '); log('bank tab:', tab.slice(0, 200));
  if (!/입금 \$1,500\.00/.test(tab) || !/출금 \$4,250\.00/.test(tab) || !/공장 송금/.test(tab) || !/앱 기록과 대조/.test(tab)) errs.push('bank tab totals · compare');
  const dep = (tab.match(/체크 · 현금 입금[^✓]*?\$([\d,\.]+)/) || [])[1]; log('app dep col:', dep);
  await pg.selectOption('#bc_BK3', 'rent'); await pg.waitForSelector('#cfOk', { timeout: 3000 }); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const after = await pg.evaluate(() => [window.__MOCK_STORE__.bank.BK3.cat, window.__MOCK_STORE__.bank.BK3.manual, (window.__MOCK_STORE__.settings.app.bankRules || []).map(r => r.kw + '>' + r.cat).join()]); log('after rule:', after);
  if (after[0] !== 'rent' || after[1] !== true || !/MYSTERY VENDOR>rent/.test(after[2])) errs.push('manual category should save and add a rule');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
