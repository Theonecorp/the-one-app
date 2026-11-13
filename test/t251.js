/* v0.8.214 시험 — ↩ UPS.gs 반품 라벨 · 반품 라벨 메일 (브라우저 없이 node 로): retShipment_ 의 UPS 요청 모양(ReturnService 9 · ShipFrom = 손님 · ShipTo = 우리 RETURNS · 회사 계정)
 *   · run() 이 shipq st 'ret' → 'retdone'(labels · track · charge) + shipments/{트래킹}(ret:true · retJob · retDe · shp) · st 'mail' → MailApp(라벨 첨부) → 'maildone'
 *   · 반품 라벨이 아닌 job 으로는 메일을 보내지 않음 · 틀린 주소는 mailerr · 기존 종류(wait · void · rate · trk · av) 그대로 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const errs = [], log = (...a) => console.log(...a);
const src = fs.readFileSync(path.resolve(__dirname, '../apps-script/UPS.gs'), 'utf8');
const ctx = { console, Logger: { log: () => {} }, PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ UPS_ACCOUNT: 'A1B2C3', UPS_ENV: 'test' })[k] || null }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) } };
vm.createContext(ctx); vm.runInContext(src, ctx);
const from = { name: 'THE ONE CORP', attn: 'SHIPPING', phone: '4078787274', addr1: '4265 CHURCH STREET', addr2: 'UNIT 1009', city: 'SANFORD', state: 'FL', zip: '32771' };
const q = { _id: 'RET-3001-x', st: 'ret', kind: 'ret', shp: 'SHP-2026-000015', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', by: 'luke@theonefl.com', svc: '03', desc: 'Damaged chains',
  to: { name: 'BEAUTY EXCHANGE ORLANDO', attn: 'BEAUTY EXCHANGE ORLANDO', phone: '(407) 555-0101', addr1: '77 ORANGE AVE', addr2: '', city: 'ORLANDO', state: 'FL', zip: '32801' }, box: { w: 9.2, l: 14, wd: 10, h: 8 }, retDe: 'XBAL1|2026-11-12', retDeShp: 'SHP-2026-000010' };
try {
  /* ① 요청 모양 */
  const sh = ctx.retShipment_(q, from, 'A1B2C3');
  log('① ReturnService', JSON.stringify(sh.ReturnService), '· ShipFrom', sh.ShipFrom.Address.City, '· ShipTo', sh.ShipTo.AttentionName, sh.ShipTo.Address.City);
  if (!sh.ReturnService || sh.ReturnService.Code !== '9') errs.push('① ReturnService 9 (print return label)');
  if (sh.ShipFrom.Name !== 'BEAUTY EXCHANGE ORLANDO' || sh.ShipFrom.Address.PostalCode !== '32801' || sh.ShipFrom.Phone.Number !== '4075550101') errs.push('① ShipFrom = customer');
  if (sh.ShipTo.AttentionName !== 'RETURNS' || sh.ShipTo.Address.City !== 'SANFORD') errs.push('① ShipTo = our warehouse (RETURNS)');
  if (sh.Shipper.ShipperNumber !== 'A1B2C3' || sh.PaymentInformation.ShipmentCharge[0].BillShipper.AccountNumber !== 'A1B2C3') errs.push('① billed to company account');
  const pk = sh.Package[0]; if (pk.Description !== 'DAMAGED CHAINS' || pk.PackageWeight.Weight !== '10' || pk.Dimensions.Length !== '14' || pk.Packaging.Code !== '02') errs.push('① package (description · weight rounded up · dims)');
  if (sh.Service.Code !== '03') errs.push('① service');
  let thrown = ''; try { ctx.retShipment_(Object.assign({}, q, { to: { name: 'X' } }), from, 'A'); } catch (e) { thrown = e.message; } if (!thrown) errs.push('① refuses incomplete customer address');
  thrown = ''; try { ctx.retShipment_(Object.assign({}, q, { box: { w: 0, l: 1, wd: 1, h: 1 } }), from, 'A'); } catch (e) { thrown = e.message; } if (!thrown) errs.push('① refuses zero weight');
  /* ② 이메일 정리 */
  const v = ctx.emailsLimpar_(['a@x.com, B@X.com; a@x.com', 'bad', 'c@y.co']); log('② emails', JSON.stringify(v));
  if (v.bons.join() !== 'a@x.com,B@X.com,c@y.co' || v.ruins.join() !== 'bad') errs.push('② email cleanup (dedupe · invalid apart)');
  /* ③ run() — ret */
  const patches = [], DOCS = {}, mails = [];
  ctx.fsQueryIn_ = (c, f, vals) => { if (vals.indexOf('ret') < 0 || vals.indexOf('mail') < 0 || ['wait', 'void', 'av', 'rate', 'trk'].some(x => vals.indexOf(x) < 0)) errs.push('③ query keeps old kinds and adds ret · mail'); return JOBS.splice(0); };
  ctx.fsPatch_ = (c, id, d) => { patches.push([c, id, d]); DOCS[c + '/' + id] = Object.assign(DOCS[c + '/' + id] || {}, d); };
  ctx.fsGet_ = (c, id) => c === 'settings' ? { ups: { from } } : DOCS[c + '/' + id] ? Object.assign({ _id: id }, DOCS[c + '/' + id]) : null;
  let body = null;
  ctx.upsFetch_ = (p, m, b) => { body = { p, b }; return { ShipmentResponse: { ShipmentResults: { ShipmentIdentificationNumber: '1ZRET0002', NegotiatedRateCharges: { TotalCharge: { MonetaryValue: '11.25' } }, ShipmentCharges: { TotalCharges: { MonetaryValue: '19.80' } }, BillingWeight: { Weight: '10' }, PackageResults: { TrackingNumber: '1ZRET0002', ShippingLabel: { GraphicImage: 'R0lGODlh' } } } } }; };
  let JOBS = [Object.assign({}, q)]; DOCS['shipq/RET-3001-x'] = Object.assign({}, q);
  ctx.run();
  const sq = DOCS['shipq/RET-3001-x'], sp = DOCS['shipments/1ZRET0002'];
  log('③ shipq', sq.st, sq.track, sq.charge, '· shipment', sp && JSON.stringify({ ret: sp.ret, retJob: sp.retJob, retDe: sp.retDe, shp: sp.shp, cost: sp.cost, list: sp.list, trkSt: sp.trkSt, sm: sp.sm }));
  if (!body || body.p !== '/api/shipments/v2403/ship' || body.b.ShipmentRequest.Shipment.ReturnService.Code !== '9' || body.b.ShipmentRequest.LabelSpecification.LabelImageFormat.Code !== 'GIF') errs.push('③ calls the UPS ship API with a return shipment (GIF label)');
  if (sq.st !== 'retdone' || sq.track !== '1ZRET0002' || sq.charge !== 11.25 || sq.shipId !== '1ZRET0002' || !sq.labels || sq.labels[0].img !== 'R0lGODlh') errs.push('③ shipq retdone with label · tracking · negotiated charge · shipId (void)');
  if (!sp || sp.ret !== true || sp.retJob !== 'RET-3001-x' || sp.retDe !== 'XBAL1|2026-11-12' || sp.shp !== 'SHP-2026-000015' || sp.cost !== 11.25 || sp.list !== 19.8 || sp.trkSt !== 'open' || sp.carrier !== 'UPS' || sp.dims !== '14×10×8') errs.push('③ shipments/{tracking} return record');
  /* ④ ret 실패 */
  ctx.upsFetch_ = () => { throw new Error('UPS 400: 120100 Missing ShipFrom'); };
  JOBS = [Object.assign({}, q, { _id: 'RET-bad' })]; ctx.run();
  if (DOCS['shipq/RET-bad'].st !== 'reterr' || !/ShipFrom/.test(DOCS['shipq/RET-bad'].err)) errs.push('④ UPS refusal → reterr with reason');
  /* ⑤ mail */
  ctx.Utilities = { base64Decode: s => [1, 2, 3], newBlob: (d, t, n) => ({ t, n, getAs: () => ({ setName: x => ({ t: 'application/pdf', n: x }) }) }) };
  ctx.MailApp = { sendEmail: o => mails.push(o) };
  JOBS = [{ _id: 'MAIL-1', st: 'mail', kind: 'retmail', job: 'RET-3001-x', emails: ['store@beauty.com', 'owner@beauty.com'] }]; ctx.run();
  log('⑤ mail', DOCS['shipq/MAIL-1'].st, mails[0] && mails[0].to, mails[0] && mails[0].attachments.map(a => a.n).join(','));
  if (DOCS['shipq/MAIL-1'].st !== 'maildone' || !mails[0] || mails[0].to !== 'store@beauty.com,owner@beauty.com' || !/1ZRET0002/.test(mails[0].subject) || !mails[0].attachments.some(a => /\.pdf$/.test(a.n)) || !mails[0].attachments.some(a => a.n === 'UPS-RETURN-1ZRET0002.gif')) errs.push('⑤ mail sent with PDF + GIF label to both addresses');
  JOBS = [{ _id: 'MAIL-2', st: 'mail', job: 'XBAL1', emails: ['a@b.com'] }]; DOCS['shipq/XBAL1'] = { kind: '', st: 'done', labels: [{ trk: '1Z', img: 'x' }] }; ctx.run();
  if (DOCS['shipq/MAIL-2'].st !== 'mailerr' || mails.length !== 1) errs.push('⑤ no mail for a job that is not a return label');
  JOBS = [{ _id: 'MAIL-3', st: 'mail', job: 'RET-3001-x', emails: ['nope'] }]; ctx.run();
  if (DOCS['shipq/MAIL-3'].st !== 'mailerr' || mails.length !== 1) errs.push('⑤ invalid address → mailerr');
} catch (e) { errs.push('THROW ' + e.stack); }
if (errs.length) { console.log('❌', errs.join('\n❌ ')); process.exit(1); } else console.log('✅ t251 UPS.gs return label + mail');
