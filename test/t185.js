/* v0.8.184 시험 — 📎 inbound@ 메일 첨부 가려 읽기 + 📨 공장 명세서를 경영 장부와 대조 (2026-11-11 관리자: "다른 엑셀 · 밸런스 파일도 구별" · "Status 나 Account 파일은 경영 자료와 비교")
 *   ① classifyFile: 인보이스 · 패킹리스트 → invoice / 장부 머리글 · 对账单 · STATEMENT · ACCOUNT → statement / STATUS · 进度 → status / 그 밖 → other
 *   ② compareStatement: 파일 BALANCE ↔ 앱 잔액(파일 마지막 날짜까지) · 파일에만 · 앱에만 있는 줄 · 날짜만 다른 줄 · 파일 기간 밖 줄은 안 셈
 *   ③ 메일 하나 (인보이스 + 패킹리스트 + 명세서 + 진행표) → 입고 예정 한 건(박스 번호는 패킹리스트에서) · 명세서는 입고에 안 넣고
 *      공장 문서 mailDocs 에 대조 결과 · 관리자에게만 메일(오피스 알림 대기열에는 금액 없음) · 진행표도 관리자에게만
 *   ④ 번호 · 단가 · INVOICE 제목이 모두 없는 코드 표 → 🔎 확인 대기 + 이유
 *   ⑤ 앱: 경영 → 🏭 공장에 📨 카드 (⚠️ 장부와 다름 · 파일에만 있는 줄) · 확인 대기 화면에 🔎 이유 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), vm = require('vm');
const fmtTz = (d, tz, f) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value])); if (f === 'yyyy-MM-dd') return p.year + '-' + p.month + '-' + p.day; if (f === 'yyyy') return p.year; if (f === 'H') return String(Number(p.hour)); return p.year + '-' + p.month + '-' + p.day; };
(async () => {
  const errs = [], log = (...a) => console.log(...a), root = path.resolve(__dirname, '..');
  const IP = await import(path.join(root, 'src/inbound-parse.js')), FS = await import(path.join(root, 'src/facstmt.js'));
  const CAT = { AHG100: { c: 'AHG100', d: 'HOOP 100', p: 2.5 }, AHG105: { c: 'AHG105', d: 'HOOP 105', p: 3 } };
  const INV = [['COMMERCIAL INVOICE'], ['Shipper', '', '', '', 'Invoice No: SX-7001'], ['SHENGXING YIWU'], ['ITEM NO', 'PRICE', 'QTY', 'TOTAL'], ['AHG100', 1.5, 50, 75], ['AHG105', 2, 30, 60]];
  const PACK = [['SX PACKING LIST'], ['箱数', 'ITEM NO', 'QTY'], ['1#', 'AHG100', 50], ['2#', 'AHG105', 30]];
  const STMT = [['SHENGXING YIWU', '', '', '', '', 'TOTAL', 1100], ['', '', '', '', '', 'DEPOSIT', 600], ['', '', '', '', '', 'BALANCE', 500], ['Date', 'ITEM', 'FREIGHT', 'Amount', 'PAID DATE', 'DEPOSIT MONEY'],
    ['2026-09-01', 300, 0, 300, '2026-09-20', 300], ['2026-10-01', 400, 0, 400, '2026-10-25', 300], ['2026-11-01', 400, 0, 400, '', '']];
  const STATUS = [['SX 生产进度 STATUS'], ['ITEM NO', 'QTY', '进度'], ['AHG100', 500, '50%']];
  const ORDER = [['NO', 'ITEM NO', 'QTY'], [1, 'AHG100', 10], [2, 'AHG105', 20]];
  const parse = rows => IP.parseFactoryInvoice(rows, CAT, 2026);
  /* ① */
  const K = (name, rows, ledger) => IP.classifyFile({ name, sheets: [{ name: 'Sheet1', rows }], inv: parse(rows), ledger: !!ledger }).kind;
  const k1 = [K('SX-7001 invoice.xlsx', INV), K('packing.xlsx', PACK), K('SX 对账单.xlsx', STMT, true), K('Account 2026.xlsx', [['ACCOUNT STATEMENT'], ['note']]), K('status.xlsx', STATUS), K('photo list.xlsx', [['hello']]), K('balance.xlsx', INV), K('SX-7002.xlsx', [['INVOICE', '', '订单号: PO-55'], ['Invoice No: SX-7002']].concat(INV.slice(3)))];
  log('① kinds:', k1.join(' '));
  if (k1.join() !== 'invoice,invoice,statement,statement,status,other,statement,invoice') errs.push('① invoice · packing → invoice, ledger/对账单/ACCOUNT/balance name → statement, STATUS/进度 → status, else other · 订单号 in an invoice header stays invoice (got ' + k1.join() + ')');
  /* ② */
  const P = FS.parseFactoryStatement([{ name: '2026', rows: STMT }]);
  const app = { inv: [{ d: '2026-08-01', amt: 999, type: '인보이스' }, { d: '2026-09-01', amt: 300, type: '인보이스' }, { d: '2026-10-03', amt: 400, type: '인보이스' }, { d: '2026-10-15', amt: 77, type: '인보이스' }, { d: '2026-11-20', amt: 50, type: '인보이스' }],
    pay: [{ d: '2026-08-15', amt: 999 }, { d: '2026-09-20', amt: 300 }] };
  const C = FS.compareStatement(P, app);
  log('② cmp:', JSON.stringify({ from: C.from, to: C.to, fileBal: C.fileBal, appBalAt: C.appBalAt, appBal: C.appBal, diff: C.diff, invF: C.inv.onlyFile.map(x => x.d), invA: C.inv.onlyApp.map(x => x.d), mv: C.inv.moved.map(x => x.fileD + '>' + x.appD), payF: C.pay.onlyFile.map(x => x.d), ok: C.ok }));
  if (C.from !== '2026-09-01' || C.to !== '2026-11-01' || C.fileBal !== 500 || C.appBalAt !== 477 || C.appBal !== 527 || C.diff !== 23) errs.push('② balances: file 500 vs app 477 up to 11/01 (app now 527) → diff 23');
  if (C.inv.onlyFile.map(x => x.d).join() !== '2026-11-01' || C.inv.onlyApp.map(x => x.d).join() !== '2026-10-15' || C.inv.moved.length !== 1 || C.inv.moved[0].appD !== '2026-10-03') errs.push('② rows: 11/01 only in file · 10/15 only in app · 10/01 vs 10/03 date differs · 08/01 (before the file) and 11/20 (after) not counted');
  if (C.pay.onlyFile.map(x => x.d).join() !== '2026-10-25' || C.pay.onlyApp.length || C.ok) errs.push('② payment 10/25 only in file · not ok');
  if (!FS.compareStatement(P, { inv: [{ d: '2026-09-01', amt: 300 }, { d: '2026-10-01', amt: 400 }, { d: '2026-11-01', amt: 400 }], pay: [{ d: '2026-09-20', amt: 300 }, { d: '2026-10-25', amt: 300 }] }).ok) errs.push('② identical ledger → ok');
  /* ③ ④ Apps Script */
  const gs = fs.readFileSync(path.join(root, 'apps-script/InboundParse.gs'), 'utf8'), code = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
  if (!/var FacStmt = \(function/.test(gs) || !gs.includes('function compareStatement')) errs.push('③ InboundParse.gs carries facstmt.js as FacStmt (run sh build.sh)');
  const run = (msgs, store0) => {
    const store = Object.assign({ inbound: {}, inboundCost: {}, notifyq: {}, factories: { SX: { code: 'SX', name: 'SHENGXING YIWU', active: true } }, factoryInvoices: {}, factoryPayments: {} }, store0 || {}), mails = [], saved = [];
    const ctx = { console, Date, JSON, Math, Number, String, Object, Array, Logger: { log: () => {} }, Utilities: { formatDate: fmtTz, parseCsv: t => t.split('\n').map(l => l.split(',')), newBlob: () => ({ getBytes: () => [] }) },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) }, MailApp: { sendEmail: o => mails.push(o) },
      GmailApp: { search: () => msgs.length ? [{ getMessages: () => msgs, addLabel: () => {} }] : [], getUserLabelByName: () => ({}), createUserLabel: () => ({}) } };
    vm.createContext(ctx); vm.runInContext(gs + '\n' + code, ctx);
    ctx.inboundCatalog_ = () => CAT; ctx.inboundBook_ = att => [{ name: 'Sheet1', rows: att.aoa }]; ctx.today_ = () => '2026-11-11';
    ctx.inboundSaveFile_ = (att, sub) => { saved.push(sub + '/' + att.getName()); return 'https://drive.google.com/file/d/X' + saved.length; };
    const docs = col => Object.entries(store[col] || {}).map(([id, d]) => Object.assign({ _id: id }, d));
    ctx.query_ = (col, f, v) => docs(col).filter(d => String(d[f]) === String(v)); ctx.listAll_ = col => docs(col);
    ctx.patch_ = (col, id, d) => { store[col] = store[col] || {}; store[col][id] = Object.assign({}, store[col][id] || {}, d); };
    const n = ctx.inboundMailRun_(); return { n, store, mails, saved };
  };
  const mail = (subj, atts) => ({ getSubject: () => subj, getFrom: () => 'Shengxing <sx@163.com>', getDate: () => new Date('2026-11-11T10:00:00Z'), getPlainBody: () => '', getAttachments: () => atts.map(a => ({ getName: () => a.name, aoa: a.aoa })) });
  const ledger0 = { factoryInvoices: { a: { f: 'SX', d: '2026-09-01', amt: 300, type: '인보이스' }, b: { f: 'SX', d: '2026-10-01', amt: 400, type: '인보이스' } }, factoryPayments: { c: { f: 'SX', d: '2026-09-20', amt: 300 } } };
  let R = run([mail('INVOICE SX-7001 - SHENGXING - 2026-11-10', [{ name: 'PACKING LIST.xlsx', aoa: PACK }, { name: 'SX-7001.xlsx', aoa: INV }, { name: 'SX 对账单 2026.xlsx', aoa: STMT }, { name: 'production status.xlsx', aoa: STATUS }])], ledger0);
  const ib = Object.values(R.store.inbound), sx = R.store.factories.SX, md0 = (sx.mailDocs || [])[0] || {}, nq = Object.values(R.store.notifyq);
  log('③ inbound:', ib.length, ib[0] && JSON.stringify({ st: ib[0].st, file: ib[0].file, bx: ib[0].lines.map(l => l.c + ':' + (l.bx || []).map(b => b.b + '=' + b.q).join('/')) }));
  log('③ mailDocs:', (sx.mailDocs || []).map(d => d.kind + ':' + d.file).join(' | '), '· cmp diff', md0.cmp && md0.cmp.diff, '· mails', R.mails.map(m => m.to + ' ' + m.subject).join(' | '), '· saved', R.saved.join(', '), '· notifyq', nq.map(x => x.kind).join());
  if (R.n !== 1 || ib.length !== 1 || ib[0].st !== 'coming' || !/SX-7001\.xlsx \+ PACKING LIST\.xlsx/.test(ib[0].file) || ib[0].lines.map(l => l.c + ':' + (l.bx || []).map(b => b.b + '=' + b.q).join('/')).join() !== 'AHG100:1#=50,AHG105:2#=30') errs.push('③ invoice + packing list → one inbound (coming) with box numbers from the packing list');
  if (!sx.mailDocs || sx.mailDocs.length !== 2 || md0.kind !== 'status' || sx.mailDocs[1].kind !== 'statement' || !sx.mailDocs[1].cmp || sx.mailDocs[1].cmp.diff !== 100) errs.push('③ statement + status recorded on the factory (newest first) with the ledger comparison');
  const st = (sx.mailDocs || []).find(d => d.kind === 'statement') || {};
  if (!st.cmp || st.cmp.fileBal !== 500 || st.cmp.appBalAt !== 400 || st.cmp.inv.onlyFile.map(x => x.d).join() !== '2026-11-01' || st.cmp.pay.onlyFile.map(x => x.d).join() !== '2026-10-25' || !/drive\.google\.com/.test(st.url)) errs.push('③ comparison: file 500 vs app 400 · 11/01 invoice and 10/25 payment only in the file · Drive link kept');
  if (R.mails.length !== 2 || R.mails.some(m => m.to !== 'luke@theonefl.com') || !R.mails.some(m => /📄 명세서 — SHENGXING YIWU \(SX\) ⚠️ 장부와 다름 \$100\.00/.test(m.subject)) || !R.mails.some(m => /📋 진행표/.test(m.subject))) errs.push('③ statement and status mailed to the admin only (subject shows the difference)');
  if (nq.length !== 1 || nq[0].kind !== 'inbound' || nq.some(x => /\$|BALANCE|잔액/.test(x.text + x.subject))) errs.push('③ only the inbound notice goes to the staff queue — no factory money in it');
  if (R.saved.length !== 2 || !R.saved.every(x => /^SX\//.test(x))) errs.push('③ statement and status files kept in Drive under the factory code');
  /* 같은 출고 (패킹리스트가 단가 없이 같은 코드 · 수량) — 순서가 바뀌어도 단가 있는 쪽이 바탕 */
  const R2 = run([mail('INVOICE SX-7001', [{ name: 'a.xlsx', aoa: PACK }, { name: 'b.xlsx', aoa: INV }])]);
  const ib2 = Object.values(R2.store.inbound), ic2 = Object.values(R2.store.inboundCost);
  if (ib2.length !== 1 || !ic2[0] || ic2[0].amt !== 135) errs.push('③ same shipment in two files → one inbound, prices from the invoice ($135)');
  /* ④ */
  const R3 = run([mail('hello', [{ name: 'list.xlsx', aoa: ORDER }])]); const ib3 = Object.values(R3.store.inbound)[0], nq3 = Object.values(R3.store.notifyq);
  log('④ unsure:', ib3 && ib3.st, ib3 && ib3.why && ib3.why.slice(0, 30), nq3.map(x => x.kind).join());
  if (!ib3 || ib3.st !== 'review' || !/확실하지 않음/.test(ib3.why) || nq3[0].kind !== 'inboundReview' || nq3[0].toGroup) errs.push('④ no number · no price · no INVOICE → review with the reason (office/admin only)');
  const R4 = run([mail('INVOICE 1', [{ name: 'list.xlsx', aoa: ORDER }])]); if (Object.values(R4.store.inbound)[0].st !== 'coming') errs.push('④ INVOICE in the subject → registered as usual');
  /* ⑤ 앱 */
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8853', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const pg = await (await br.newContext({ viewport: { width: 1000, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const seedD = JSON.stringify({ fac: Object.assign({ id: 'SX' }, sx), inv: Object.values(ledger0.factoryInvoices).map((x, i) => Object.assign({ id: 'FI' + i }, x)), pay: Object.values(ledger0.factoryPayments).map((x, i) => Object.assign({ id: 'FP' + i }, x)), ib: ib3, ic: Object.values(R3.store.inboundCost)[0] });
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { const D = JSON.parse(o); s.factories = [D.fac]; s.factoryInvoices = D.inv; s.factoryPayments = D.pay; s.inbound = [D.ib]; s.inboundCost = [D.ic]; }; }, seedD);
  await pg.goto('http://127.0.0.1:8853/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/mg/fac'; }); await pg.waitForSelector('#facMail', { timeout: 10000 }).catch(() => errs.push('⑤ 경영 → 🏭 공장 shows the 📨 card'));
  const card = (await pg.textContent('#facMail').catch(() => '')).replace(/\s+/g, ' '); log('⑤ card:', card.slice(0, 260));
  if (!/📄 명세서/.test(card) || !/⚠️ 장부와 다름 \$100\.00/.test(card) || !/파일 BALANCE \$500\.00/.test(card) || !/파일에만 있는 인보이스 1/.test(card) || !/📋 진행표/.test(card) || !await pg.$('#facMail a[href*="drive.google.com"]')) errs.push('⑤ card: statement (⚠️ $100 · file 500 · 1 invoice only in file · Drive link) and status');
  await pg.evaluate(() => { location.hash = '#/stock/inb'; }); await pg.waitForSelector('[data-ib]', { timeout: 8000 }); await pg.click('[data-ib]');
  await pg.waitForSelector('#ibWhy', { timeout: 5000 }).catch(() => errs.push('⑤ review shows why it is unsure'));
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
