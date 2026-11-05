/* v0.8.165 시험 — ⑤ 이전 시스템 sales_invoice.xlsx 가져오기: 머리글 오타 "CUSOMTER #" 도 고객 번호 열로 읽음 (INVOICE · DATE · CUSOMTER # · CUSTOMER NAME · SALES REP · TERM · SHIP TO · SHIP VIA · TOTAL · SALES ORDER)
 *   ① 2026-11 내보내기 머리글 그대로 → 거부하지 않고 번호 · 날짜 · 고객 번호 · 가게 · 세일즈맨 · 조건 · 운송 · 합계 · 주문 번호를 읽음 ("CUSTOMER NAME" 을 고객 번호로 잘못 잡지 않음)
 *   ② 예전 모양(Customer # · cusomer 3)도 그대로 · 고객 번호 열이 아예 없으면 여전히 거부 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8885', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 1100, height: 900 } });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8885/test/demo.html'); await pg.waitForSelector('#nav button');
  const P = await pg.evaluate(async () => {
    const M = await import('/src/admin.js');
    const legacy = [['INVOICE ', 'DATE', 'CUSOMTER #', 'CUSTOMER NAME', 'SALES REP', 'TERM', 'SHIP TO', 'SHIP VIA', 'TOTAL', 'SALES ORDER'],
      ['A43152', '10/19/2026', 1355, 'BEAUTY EXCHANGE # 15 (FL) 21535', 'DANIEL', 'N30', 'BEAUTY EXCHANGE # 15 (FL) 21535', 'UPS', 1700.4, 'S52736'],
      ['P-008748', '10/20/2026', 4919, 'UPTOWN BEAUTY #8', 'ANDREW', 'NT', 'UPTOWN BEAUTY #8', '', 1998.75, 'S52770'],
      ['A43154', '10/19/2026', 4974, '5 STAR BEAUTY (213) LA', 'KAEL', 'N30', '5 STAR BEAUTY (213) LA', 'UPS', -708.5, 'S52807'],
      [null, null, null, null, null, null, null, null, null, null]];
    const r = M.parseInvoiceList(legacy, '');
    const old1 = M.parseInvoiceList([['Trans #', 'Invoice', 'Trans Date', 'Customer #', 'Customer Name', 'Sales Rep', 'Total'], [12071, 'A43001', '10/02/2026', '1271', 'BEAUTY 4U', 'BRANDON', 180]], '');
    const old2 = M.parseInvoiceList([['trans 3', 'trans date', 'cusomer 3', 'name', 'rep', 'total'], ['A43002', '10/02/2026', '1272', 'BEAUTY 4U 2', 'ALEX', 90]], '');
    let err = ''; try { M.parseInvoiceList([['INVOICE', 'DATE', 'CUSTOMER NAME', 'SALES REP', 'TOTAL'], ['A1', '10/02/2026', 'SOME STORE', 'ACE', 1]], ''); } catch (e) { err = e.message; }
    return { cols: r.cols, rows: r.rows.map(x => [x.no, x.d, x.acct, x.store, x.sm, x.terms, x.shipVia, x.total, x.order, x.t]), noLetter: r.noLetter, skipped: r.skipped, old1: old1.rows.map(x => x.acct), old2: old2.rows.map(x => x.acct), err };
  });
  log('cols:', JSON.stringify(P.cols)); log('rows:', JSON.stringify(P.rows)); log('old:', P.old1.join(), P.old2.join(), '| no-acct err:', P.err.substring(0, 30));
  if (P.cols.acct !== 'CUSOMTER #') errs.push('① "CUSOMTER #" must be read as the customer # column (got ' + P.cols.acct + ')');
  if (P.cols.store !== 'CUSTOMER NAME' || P.cols.no !== 'INVOICE' || P.cols.so !== 'SALES ORDER') errs.push('① store = CUSTOMER NAME · no = INVOICE · so = SALES ORDER');
  if (P.rows.length !== 3 || P.rows.map(x => x[2]).join() !== '1355,4919,4974') errs.push('① three invoices with customer codes 1355 · 4919 · 4974 (empty tail row skipped)');
  const a = P.rows[0];
  if (!/^A-?0*43152$/.test(a[0]) || a[1] !== '2026-10-19' || a[3] !== 'BEAUTY EXCHANGE # 15 (FL) 21535' || a[4] !== 'DANIEL' || a[5] !== 'N30' || a[6] !== 'UPS' || a[7] !== 1700.4 || a[8] !== 'S52736' || a[9] !== 'A') errs.push('① first row: no · date · store · rep · terms · ship via · total · sales order · type');
  if (P.rows[2][7] !== -708.5) errs.push('① credit (negative total) kept as is');
  if (P.noLetter) errs.push('① all numbers carry a type letter');
  if (P.old1.join() !== '1271' || P.old2.join() !== '1272') errs.push('② older header shapes (Customer # · cusomer 3) still work');
  if (!/customer|고객/.test(P.err)) errs.push('② a file with no customer # column is still refused');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
