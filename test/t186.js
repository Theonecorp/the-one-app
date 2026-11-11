/* v0.8.184 시험 — 📨 공장마다 다른 명세서 모양 읽기 (관리자가 보낸 실제 파일 4개 모양 — 숫자는 시험용) · 장부 대조 · 공장 찾기
 *   ① account (JUDA "The One Corp ACCOUNT"): 올해 칸 + 옆 지난 해 칸 → 올해 칸만 · 전년 미수금 = 이월 · TOTAL 줄 BALANCE · 입금
 *   ② kr (RUMINO · JINRUIJIA "결재내역서"): NO + TOTAL = 선적 (날짜는 "MM/DD Shipping 완료", 운임은 shipping fee $) · 입금일자 · 맨 끝 "까지총남은금액" = 잔액 · 아래 요약 표의 입금은 두 번 안 셈
 *   ③ status (SHENGXING "ORDER STATUS"): PO 표의 IN PROGRESS = 진행 중 주문 · PAYMENT · AS/OS 선적(SHIPPING DATE & FEE) · 처음 BALANCE = 이월 · 마지막 BALANCE = 잔액 · 금액 숫자를 날짜로 보지 않음
 *   ④ 대조: 이월 전 앱 잔액 · 금액 같고 날짜 60일 안 = 날짜 다름 · 잔액 날짜 = "까지" 날짜
 *   ⑤ 공장 찾기: 파일 이름에 붙은 이름(THE_ONErumino) · 보낸 사람 · 전에 같은 주소가 보낸 인보이스의 공장
 *   ⑥ 메일: ORDER STATUS → 📋 진행표로 분류되지만 장부와 대조 · 진행 중 주문이 메일에 */
const path = require('path'), fs = require('fs'), vm = require('vm');
(async () => {
  const errs = [], log = (...a) => console.log(...a), root = path.resolve(__dirname, '..');
  const FS = await import(path.join(root, 'src/facstmt.js')), IP = await import(path.join(root, 'src/inbound-parse.js'));
  /* ① account */
  const ACC = [['', 'The One Corp  ACCOUNT', '', '', '', '', '', '', '', '', '', 'The One Corp  ACCOUNT'],
    ['', 'DATE', '물품금액', '운임비', 'SHIPPING \nAMOUNT', 'SHIP VIA', 'SHIP NO.', 'DATE', '입금 \nAMOUNT', 'BALANCE', '', 'DATE', '물품금액', '운임비', 'SHIPPING \nAMOUNT', 'SHIP VIA', 'SHIP NO.', 'DATE', '입금 \nAMOUNT', 'BALANCE'],
    ['', 'TOTAL:', 1000, 100, 2100, '', '', '', 600, 1500, '', 'TOTAL:', 5000, 0, 5000, '', '', '', 4000, 1000],
    ['', '2026-01-01', '', '', 1000, '', '전년 미수금', '', '', '', '', '2025-03-01', 5000, 0, 5000, 'UPS', '1Z1', '2025-04-01', 4000],
    ['', '2026-01-05', 600, 50, 650, 'UPS', '1ZAAA', '2026-01-20', 600],
    ['', '2026-02-10', 400, 50, 450, 'FEDEX', '8878 1']];
  const A = FS.parseAnyStatement([{ name: 'ACCOUNT', rows: ACC }]);
  log('① account:', A.fmt, JSON.stringify(A.sheets[0].hdr), A.inv.map(x => x.type + ' ' + x.d + ' ' + x.amt).join(' | '), '· pay', A.pay.map(x => x.d + ' ' + x.amt).join());
  if (A.fmt !== 'account' || A.sheets[0].hdr.balance !== 1500 || A.inv.length !== 3 || A.inv[0].type !== '이월' || A.inv[1].frt !== 50 || A.pay.length !== 1 || A.pay[0].amt !== 600 || A.inv.some(x => x.d < '2026')) errs.push('① account: this year block only · 전년 미수금 → 이월 · balance from TOTAL row · deposits');
  /* ② kr */
  const KR = [['THE ONE 결재내역서 ( 2026년2월24일현재)'], ['주문내역', '', '', '', '', '', '', '', '입금내역', '', '', '비고'], ['NO', 'ITEM', '주문수량', '주문금액', '', '', '', 'TOTAL', '입금일자', '입금금액', '입금내용'],
    [1, 'RUMINO MICRO PAVE', '100 PAIR', 900, '', '', 900, 1000, '2026-01-22', 700, '', '01/22 Shipping 완료'], ['', 'shipping fee', '', '￥690/$100'],
    [2, 'RUMINO HALO', '50 PAIR', 450, '', '', 450, 500, '', '', '', '01/26 Shipping 완료'], ['', 'shipping fee', '', '￥345/$50'],
    ['', '', '', '', '', '', '', 1500, '', 700], [], ['', '', '', '', '', '', '', '', '', '입금일자', '입금금액'], ['', '2026/01/01까지총남은금액', '', '', '', '', 0, '', '', '2026-01-22', 700],
    ['', 'TOTAL', '', '', '', '', 1500, '', '', 'TOTAL', 700], ['', '2026/02/24까지총남은금액', '', '', '', '', '$1,500.00-$700.00=$800.00']];
  const K = FS.parseAnyStatement([{ name: 'Sheet1', rows: KR }]);
  log('② kr:', K.fmt, JSON.stringify(K.sheets[0].hdr), K.inv.map(x => x.d + ' ' + x.amt + ' (운임 ' + x.frt + ')').join(' | '), '· pay', K.pay.map(x => x.d + ' ' + x.amt).join());
  if (K.fmt !== 'kr' || K.sheets[0].hdr.balance !== 800 || K.sheets[0].hdr.asOf !== '2026-02-24' || K.inv.map(x => x.d + ':' + x.amt + ':' + x.frt).join() !== '2026-01-22:1000:100,2026-01-26:500:50' || K.pay.length !== 1) errs.push('② kr: 2 shipments (date from "Shipping 완료", freight from $) · 1 deposit (summary table not counted twice) · balance $800 as of 2/24');
  /* ③ status */
  const ST = [['', 'THE ONE ORDER STATUS 20260923'], ['', 'PO/      NO', 'ITEM', 'PO DATE', 'AMOUNT', 'REMARK'], ['', '#90', 'NOSE CLIP', 20260606, 4414.93, 'IN PROGRESS'], ['', '#91', 'NOSE PIN', 20260606, 17011.09, 'SHIPPED/AIR'], ['', '#92', 'CUFF', 20260606, 0, 'CANCELLED'],
    ['', '', '', '', 21426.02], [], ['', '', '', 'BALANCE', '', 5000], ['PAYMENT', '', '', 20260108, '', 2000], ['', '', '', 'BALANCE', '', 3000],
    ['SHIPPING  NO', 'PO/      NO', 'ITEM', 'PO DATE', 'ACTUAL     AMOUNT', 'TOTAL', 'SHIPPING INFO'], ['', '', '', '', '', '', 'TRACKING NO', 'CBM'],
    ['AS38', '#51', 'ANKLET', 20251106, 45000, 45300, 'FEDEX'], ['', 'SHIPPING DATE & FEE', '', 20260110, 300, '', '887809244980'], ['', '', '', 'BALANCE', '', 48300]];
  const T = FS.parseAnyStatement([{ name: '  YM STATUS ', rows: ST }]);
  log('③ status:', T.fmt, JSON.stringify(T.sheets[0].hdr), T.inv.map(x => x.type + ' ' + x.d + ' ' + x.amt + '/' + x.frt).join(' | '), '· pay', T.pay.map(x => x.d + ' ' + x.amt).join(), '· open', T.open.map(x => x.po).join());
  if (T.fmt !== 'status' || T.sheets[0].hdr.balance !== 48300 || T.inv.map(x => x.type + ':' + x.d + ':' + x.amt).join() !== '이월:2026-01-08:5000,인보이스:2026-01-10:45300' || T.inv[1].frt !== 300 || T.pay.map(x => x.d + ':' + x.amt).join() !== '2026-01-08:2000' || T.open.map(x => x.po).join() !== '#90') errs.push('③ status: opening balance → 이월 · AS38 $45,300 on 1/10 (fee 300, amount 45000 not read as a date) · payment 1/8 · balance 48,300 · open PO #90 only');
  /* ④ 대조 */
  const C = FS.compareStatement(K, { inv: [{ d: '2026-01-22', amt: 1000 }, { d: '2026-03-10', amt: 500 }], pay: [{ d: '2026-01-22', amt: 700 }] });
  log('④ kr cmp:', JSON.stringify({ to: C.to, fileBal: C.fileBal, appBalAt: C.appBalAt, diff: C.diff, moved: C.inv.moved, ok: C.ok }));
  if (C.to !== '2026-02-24' || C.appBalAt !== 300 || C.diff !== 500 || C.inv.moved.length !== 1 || C.inv.moved[0].appD !== '2026-03-10' || C.inv.onlyFile.length) errs.push('④ balance as of "까지" date (app 300 vs file 800) · 1/26 vs 3/10 same amount within 60 days → date differs');
  const C2 = FS.compareStatement(A, { inv: [{ d: '2025-06-01', amt: 990 }, { d: '2026-01-05', amt: 650 }], pay: [] });
  log('④ account cmp fwd:', JSON.stringify(C2.fwd), 'onlyApp', C2.inv.onlyApp.length);
  if (!C2.fwd || C2.fwd.file !== 1000 || C2.fwd.app !== 990 || C2.fwd.diff !== 10 || C2.inv.onlyApp.length) errs.push('④ 이월 compared with the app balance before it (1000 vs 990) · app rows before the 이월 not listed as "only in app"');
  /* ⑤ 공장 찾기 */
  const facs = [{ code: 'JD', name: 'ZHEJIANG JUDA SUPPLY CHAIN' }, { code: 'RM', name: 'QINGDAO RUMINO' }, { code: 'QJC', name: 'QINGDAO JINRUIJIA CRAFT' }, { code: 'SX', name: 'SHENGXING YIWU' }];
  const g = t => (FS.guessFactory(t, facs) || {}).code || '-';
  const gg = [g('THE_ONErumino______2026.01.22.xlsx'), g('THE ONE(jinruijia)체인결재내역서'), g('Juda <acc@judasupply.cn> STATEMENT ONE ACCOUNT.xls'), g('THE ONE ORDER STATUS'), g('QINGDAO')];
  log('⑤ guess:', gg.join(' '));
  if (gg.join() !== 'RM,QJC,JD,-,-') errs.push('⑤ factory from glued file names · sender · not from generic words (QINGDAO alone) (got ' + gg.join() + ')');
  /* 분류 — ORDER STATUS 는 진행표지만 장부가 있으면 대조 */
  const kST = IP.classifyFile({ name: 'THE ONE STATUS 20260923.xlsx', sheets: [{ name: 'YM STATUS', rows: ST }], inv: { err: 'nocode' }, ledger: FS.looksLikeAnyStatement([{ name: 'YM STATUS', rows: ST }]) });
  const kAC = IP.classifyFile({ name: 'ONE ACCOUNT.xls', sheets: [{ name: 'ACCOUNT', rows: ACC }], inv: { err: 'nocode' }, ledger: FS.looksLikeAnyStatement([{ name: 'ACCOUNT', rows: ACC }]) });
  if (kST.kind !== 'status' || kAC.kind !== 'statement') errs.push('⑥ ORDER STATUS → status (with ledger) · ACCOUNT → statement');
  /* ⑥ 메일 — 전에 같은 주소가 보낸 인보이스로 공장 찾기 + 진행 중 주문 */
  const gs = fs.readFileSync(path.join(root, 'apps-script/InboundParse.gs'), 'utf8'), code = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
  const store = { inbound: { IB1: { factory: 'SHENGXING YIWU', mailFrom: 'Lily <lily@163.com>', st: 'done', no: 'ONE#77' } }, inboundCost: {}, notifyq: {}, factories: { SX: { code: 'SX', name: 'SHENGXING YIWU', active: true }, RM: { code: 'RM', name: 'QINGDAO RUMINO', active: true } },
    factoryInvoices: { a: { f: 'SX', d: '2026-01-10', amt: 45300, type: '인보이스' } }, factoryPayments: { b: { f: 'SX', d: '2026-01-08', amt: 2000 } } }, mails = [];
  const ctx = { console, Date, JSON, Math, Number, String, Object, Array, Logger: { log: () => {} }, Utilities: { formatDate: () => '2026', newBlob: () => ({ getBytes: () => [] }) }, MailApp: { sendEmail: o => mails.push(o) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    GmailApp: { search: () => [{ getMessages: () => [{ getSubject: () => 'STATUS - 2026-09-23', getFrom: () => 'Lily <lily@163.com>', getDate: () => new Date('2026-11-11T10:00:00Z'), getPlainBody: () => '', getAttachments: () => [{ getName: () => 'THE ONE STATUS 20260923.xlsx', aoa: ST }] }], addLabel: () => {} }], getUserLabelByName: () => ({}), createUserLabel: () => ({}) } };
  vm.createContext(ctx); vm.runInContext(gs + '\n' + code, ctx);
  ctx.inboundCatalog_ = () => ({}); ctx.inboundBook_ = att => [{ name: 'YM STATUS', rows: att.aoa }]; ctx.inboundSaveFile_ = () => 'https://drive.google.com/file/d/S';
  const docs = col => Object.entries(store[col] || {}).map(([id, d]) => Object.assign({ _id: id }, d));
  ctx.query_ = (col, f, v) => docs(col).filter(d => String(d[f]) === String(v)); ctx.listAll_ = col => docs(col);
  ctx.patch_ = (col, id, d) => { store[col] = store[col] || {}; store[col][id] = Object.assign({}, store[col][id] || {}, d); };
  const n = ctx.inboundMailRun_(), md0 = (store.factories.SX.mailDocs || [])[0] || {};
  log('⑥ mail:', n, md0.kind, md0.cmp && JSON.stringify({ fmt: md0.cmp.fmt, diff: md0.cmp.diff, open: (md0.cmp.open || []).length, fwd: md0.cmp.fwd }), '·', mails.map(m => m.subject).join(' | '));
  if (n !== 0 || Object.keys(store.inbound).length !== 1 || md0.kind !== 'status' || !md0.cmp || md0.cmp.fmt !== 'status' || md0.cmp.diff !== 5000 || (md0.cmp.open || []).length !== 1) errs.push('⑥ ORDER STATUS mail → no inbound · SX found from the sender\'s earlier invoice · compared (file 48,300 vs app 43,300) · 1 open PO kept');
  if (mails.length !== 1 || !/📋 진행표 — SHENGXING YIWU \(SX\) ⚠️ 장부와 다름 \$5,000\.00/.test(mails[0].subject) || !/아직 안 보낸 주문/.test(mails[0].htmlBody) || !/#90/.test(mails[0].htmlBody)) errs.push('⑥ admin mail: status with the difference and the open PO list');
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
