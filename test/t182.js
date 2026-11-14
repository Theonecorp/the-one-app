/* v0.8.183 시험 — 🚢 공장 인보이스 메일 자동 등록 (inbound@theonefl.com → 입고 예정) (2026-11-11 관리자)
 *   ① apps-script/InboundParse.gs 는 src/inbound-parse.js 에서 만든 것 — 같은 줄들을 같게 읽음 (build.sh 로 늘 맞춤)
 *   ② 메일 하나 (모든 코드가 앱에 있음) → inbound 🚢 오는 중 + inboundCost(단가 · 본문의 송금 요청 · 금액 다름 표시) + 창고 · 오피스 알림 + 라벨
 *   ③ 모르는 코드가 있는 메일 → 🔎 확인 대기 (오피스 · 관리자 알림, ≈ 비슷한 코드) · 같은 번호 다시 → 건너뜀 · 제목 REVISED → 같은 문서를 새것으로 · 엑셀 없는 메일 → 알림 (v0.8.244: 인보이스처럼 보일 때만)
 *   ④ 앱: 확인 대기를 열어 코드를 고쳐 등록 → 오는 중 + 알림 · 창고는 확인 대기를 받을 수 없음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), vm = require('vm');
const fmtTz = (d, tz, f) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d).map(x => [x.type, x.value])); if (f === 'yyyy-MM-dd') return p.year + '-' + p.month + '-' + p.day; if (f === 'yyyy') return p.year; if (f === 'H') return String(Number(p.hour)); throw new Error('fmt ' + f); };
(async () => {
  const errs = [], log = (...a) => console.log(...a), root = path.resolve(__dirname, '..');
  const gs = fs.readFileSync(path.join(root, 'apps-script/InboundParse.gs'), 'utf8'), code = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
  /* ① 같은 코드 */
  const src = fs.readFileSync(path.join(root, 'src/inbound-parse.js'), 'utf8').replace(/^export\s+(?=(const|function|let)\b)/gm, '');
  if (!gs.includes(src.trim().slice(0, 4000))) errs.push('① InboundParse.gs is generated from src/inbound-parse.js (run sh build.sh)');
  const CAT = { AHG100: { c: 'AHG100', d: 'HOOP 100', p: 2.5 }, AHG105: { c: 'AHG105', d: 'HOOP 105', p: 3 }, OPCG07: { c: 'OPCG07', d: 'PIN CATCH 07', p: 3 }, HGDS01: { c: 'HGDS01', d: 'HOLLOW 01', p: 3 } };
  const INV = [['COMMERCIAL  INVOICE'], ['Shipper', '', '', '', 'Invoice No: JR-1111'], ['(회사명) Qingdao Jinruijia Crafts Co.,Ltd.', '', '', '', 'Date:11月11日'], ['MADE IN CHINA'], ['18K CHAIN'],
    ['ITEM ', 'ITEM NO', 'COLOR', 'PRICE/USD', 'QTY', 'TOTAL'], ['CHAIN', 'AHG100', 'GOLD', 1.41, 200, 282], ['', 'AHG-105', 'GOLD', '', 100, 141], ['TOTAL', '', '', '', '300 PCS', 423]];
  const INV2 = INV.map(r => r.slice()); INV2[1][4] = 'Invoice No: JR-2222'; INV2.splice(8, 0, ['', 'HG0S01', 'GOLD', 1, 50, 50]);
  /* ② ③ Apps Script — Gmail · Drive · Firestore 는 대역 */
  const run = (msgs) => {
    const store = { inbound: {}, inboundCost: {}, notifyq: {} }, labeled = [];
    const ctx = { console, Date, JSON, Math, Number, String, Object, Array, Logger: { log: () => {} }, Utilities: { formatDate: fmtTz, parseCsv: t => t.split('\n').map(l => l.split(',')), newBlob: () => ({ getBytes: () => [] }) },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
      GmailApp: { search: () => msgs.length ? [{ getMessages: () => msgs, addLabel: () => labeled.push(1) }] : [], getUserLabelByName: () => ({}), createLabel: () => ({}) } };
    vm.createContext(ctx); vm.runInContext(gs + '\n' + code, ctx);
    ctx.inboundCatalog_ = () => CAT; ctx.inboundAoa_ = att => att.aoa; ctx.inboundBook_ = att => [{ name: 'Sheet1', rows: att.aoa }]; ctx.today_ = () => '2026-11-11'; ctx.listAll_ = () => []; ctx.MailApp = { sendEmail: () => {} }; ctx.inboundSaveFile_ = () => '';
    ctx.query_ = (col, f, v) => Object.entries(store[col] || {}).map(([id, d]) => Object.assign({ _id: id }, d)).filter(d => String(d[f]) === String(v));
    ctx.patch_ = (col, id, d) => { store[col] = store[col] || {}; store[col][id] = Object.assign({}, store[col][id] || {}, d); };
    const n = ctx.inboundMailRun_(); return { n, store, labeled: labeled.length };
  };
  const mail = (subj, body, atts) => ({ getSubject: () => subj, getFrom: () => 'Jinruijia <jr@qq.com>', getDate: () => new Date('2026-11-11T10:00:00Z'), getPlainBody: () => body, getAttachments: () => atts.map(a => ({ getName: () => a.name, aoa: a.aoa })) });
  const BODY = 'INVOICE NO 发票号: JR-1111\nCURRENCY 币种: USD\nINVOICE AMOUNT 发票金额: 423\nFREIGHT 运费: 50\nPAYMENT REQUEST 请付款金额: USD 473.00\n';
  let R = run([mail('INVOICE JR-1111 - JINRUIJIA - 2026-11-11', BODY, [{ name: 'inv.xlsx', aoa: INV }])]);
  let ib = Object.values(R.store.inbound)[0], ic = Object.values(R.store.inboundCost)[0], nq = Object.values(R.store.notifyq);
  log('② inbound:', JSON.stringify({ n: R.n, st: ib && ib.st, no: ib && ib.no, f: ib && ib.factory, lines: ib && ib.lines.map(l => l.c + ':' + l.q + ('p' in l ? '@!' : '')).join(' '), src: ib && ib.src }));
  log('② cost:', JSON.stringify({ cur: ic && ic.cur, amt: ic && ic.amt, pay: ic && ic.pay, frt: ic && ic.frt, mis: ic && ic.amtMismatch }), '· notify:', nq.map(x => x.kind + ':' + (x.toGroup || 'staff')).join(), '· labeled', R.labeled);
  if (R.n !== 1 || !ib || ib.st !== 'coming' || ib.no !== 'JR-1111' || ib.factory !== 'Qingdao Jinruijia Crafts Co.,Ltd.' || ib.lines.map(l => l.c).join() !== 'AHG100,AHG105' || ib.lines.some(l => 'p' in l) || ib.src !== 'mail') errs.push('② all codes known → inbound "coming" (no prices in it), AHG-105 → AHG105');
  if (!ic || ic.cur !== 'USD' || ic.amt !== 423 || ic.pay !== 473 || ic.frt !== 50 || ic.amtMismatch) errs.push('② inboundCost: USD · 423 · payment request 473 from the body · freight 50 · amounts agree');
  if (nq.length !== 1 || nq[0].kind !== 'inbound' || nq[0].toGroup !== 'g:wh' || nq[0].by !== 'luke@theonefl.com' || R.labeled !== 1) errs.push('② warehouse + office notice queued (by the admin address) and the mail labeled');
  /* ③ 모르는 코드 · 다시 · REVISED · 엑셀 없음 */
  const store1 = R.store;
  R = run([mail('INVOICE JR-2222', 'INVOICE AMOUNT: 999', [{ name: 'inv2.xlsx', aoa: INV2 }])]);
  ib = Object.values(R.store.inbound)[0]; ic = Object.values(R.store.inboundCost)[0]; nq = Object.values(R.store.notifyq);
  log('③ review:', JSON.stringify({ st: ib.st, unk: ib.lines.filter(l => !l.ok).map(l => l.c + '≈' + l.sim) }), '· mis', ic.amtMismatch, '· notify', nq.map(x => x.kind + ':' + (x.toGroup || 'staff') + ':' + /HGDS01/.test(x.text)).join());
  if (ib.st !== 'review' || !ic.amtMismatch || nq[0].kind !== 'inboundReview' || nq[0].toGroup || !/≈HGDS01/.test(nq[0].text)) errs.push('③ unknown code → "review" + office/admin notice with ≈ suggestion · body amount ≠ Excel flagged');
  const twice = (() => { const st = { inbound: {}, inboundCost: {}, notifyq: {} }; const a = run([mail('INVOICE JR-1111', BODY, [{ name: 'a.xlsx', aoa: INV }]), mail('INVOICE JR-1111', BODY, [{ name: 'a.xlsx', aoa: INV }])]); return a; })();
  if (twice.n !== 1 || Object.keys(twice.store.inbound).length !== 1) errs.push('③ the same invoice twice → registered once');
  const rev = run([mail('INVOICE JR-2222', '', [{ name: 'v1.xlsx', aoa: INV2 }]), mail('INVOICE JR-2222 REVISED', '', [{ name: 'v2.xlsx', aoa: INV2.filter(r => r[1] !== 'HG0S01') }])]);
  const rv = Object.values(rev.store.inbound); log('③ revised:', rv.length, rv[0] && rv[0].st, rv[0] && rv[0].file);
  if (rv.length !== 1 || rv[0].file !== 'v2.xlsx' || rv[0].st !== 'coming') errs.push('③ REVISED replaces the pending one (now all codes known → coming)');
  const noX = run([mail('INVOICE SX#99', 'see attached pdf', [])]); const nx = Object.values(noX.store.notifyq);
  if (noX.n !== 0 || !nx.length || nx[0].kind !== 'inboundErr') errs.push('③ an invoice mail without Excel → error notice to office/admin');
  /* v0.8.244: 인보이스처럼 보이지 않는 메일(Google 보안 알림 등)은 경고 없이 건너뜀 (t286) */
  const noX2 = run([mail('hello', 'see you tomorrow', [])]); if (noX2.n !== 0 || Object.values(noX2.store.notifyq).length) errs.push('③ a non-invoice mail without Excel → no notice');
  /* ④ 앱 — 확인 대기 */
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8851', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const review = JSON.stringify({ inbound: Object.values(R.store.inbound).map(d => Object.assign({}, d, { lines: d.lines.map(l => l.c === 'HG0S01' ? Object.assign({}, l, { sim: 'AHG110' }) : l) })), inboundCost: Object.values(R.store.inboundCost) });
  const open = async (email, job) => { const pg = await (await br.newContext({ viewport: { width: 900, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = s => { if (o.job) { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'X', active: true }; s.users.push(u); } u.role = 'manager'; u.job = o.job; } const D = JSON.parse(o.store); s.inbound = D.inbound; s.inboundCost = D.inboundCost; }; }, { email, job, store: review });
    await pg.goto('http://127.0.0.1:8851/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.evaluate(() => { location.hash = '#/stock/inb'; }); await pg.waitForSelector('[data-ib]', { timeout: 8000 }); return pg; };
  const wh = await open('wh@x.com', 'whmgr');
  const lt = (await wh.textContent('#skBody')).replace(/\s+/g, ' '); if (!/확인 대기/.test(lt)) errs.push('④ list shows 🔎 to review');
  await wh.click('[data-ib]'); await wh.waitForTimeout(400); if (await wh.$('[data-q]') || await wh.$('#ibOk')) errs.push('④ warehouse cannot receive an invoice still to review');
  await wh.context().close();
  const of = await open('acct@theonefl.com', 'office');
  await of.click('[data-ib]'); await of.waitForSelector('#ibGo', { timeout: 8000 });
  const pv = (await of.textContent('#mbox')).replace(/\s+/g, ' '); log('④ office review:', pv.slice(0, 140)); if (!/메일로 들어옴/.test(pv) || /\$/.test(pv)) errs.push('④ office opens the review: came by email, no prices');
  await of.click('[data-ibsim]'); await of.waitForTimeout(300); await of.click('#ibGo'); await of.waitForTimeout(1200);
  const after = await of.evaluate(() => { const I = Object.values(window.__MOCK_STORE__.inbound)[0]; return { st: I.st, codes: I.lines.map(l => l.c + (l.ok ? '' : '✗')).join(' '), n: Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'inbound').length, ids: Object.keys(window.__MOCK_STORE__.inbound).length }; });
  log('④ registered:', JSON.stringify(after)); if (after.st !== 'coming' || /✗/.test(after.codes) || !/AHG110/.test(after.codes) || after.n !== 1 || after.ids !== 1) errs.push('④ fixing the code and registering turns the same doc into "coming" + notice');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
