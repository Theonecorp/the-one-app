/* v0.8.214 시험 — 🚚 apps-script/UPS.gs 의 카운터 블록 (옛 ups-etiqueta · ups-cotar · ups-ambiente · ups-cancelar 와 맞춘 것) — 브라우저 없이 node 로
 *   UPS.gs 를 vm 에 올리고 UrlFetchApp · 속성 · Firestore 를 흉내 (진짜 UPS · Firestore 는 부르지 않음)
 *   ① 라벨 요청: fmt ZPL → LabelImageFormat ZPL + 4×6 · GIF 는 원래 그대로 · PDF · 협상 요금 표시 · 주소 2 를 35자 안이면 한 줄로 (이미 들어 있으면 빼기)
 *   ② 라벨 응답: 라벨마다 fmt · 공시 요금 · 청구 무게 · 협상 여부 → run 이 done 에 같이 적음
 *   ③ 라벨은 나왔는데 done 적기가 실패 → error 에 orphan · 트래킹 · 라벨
 *   ④ 요금: Shoptimeintransit → 도착일 · 영업일 · 협상 · 토요일 줄 빼기 · 싼 순 / 안 되면 Shop(rates_) 으로
 *   ⑤ env 일: { env, cred, defined } — 비밀값은 돌려주지 않음 · run 이 st:'env' 를 처리
 *   ⑥ void: 이미 취소됨(190117) 은 성공 · 다른 오류는 그대로 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const errs = [], log = (...a) => console.log(...a);
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'UPS.gs'), 'utf8');
function load(props, fetchFn) {
  const patches = [];
  const ctx = {
    console, JSON, Date, Math, String, Number, Object, Array, RegExp, Error,
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] == null ? null : props[k], getProperties: () => Object.assign({}, props) }) },
    CacheService: { getScriptCache: () => ({ get: () => 'TOKEN', put: () => {}, remove: () => {} }) },
    Utilities: { getUuid: () => 'u-u-i-d', base64Encode: s => Buffer.from(s).toString('base64'), formatDate: () => '20261112' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: { getOAuthToken: () => 'x' },
    UrlFetchApp: { fetch: (url, o) => fetchFn(url, o) },
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;this.__p = ' + JSON.stringify(null) + ';', ctx);
  ctx.fsPatch_ = (col, id, data) => { patches.push({ col, id, data }); };
  ctx.fsGet_ = (col, id) => col === 'settings' && id === 'app' ? { ups: { labelFmt: props.__fmt || '' } } : null;
  return { ctx, patches };
}
const resp = (code, j) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(j) });
const SHIP_OK = { ShipmentResponse: { ShipmentResults: { ShipmentIdentificationNumber: '1ZLEAD', NegotiatedRateCharges: { TotalCharge: { MonetaryValue: '18.40' } }, ShipmentCharges: { TotalCharges: { MonetaryValue: '25.10' } }, BillingWeight: { Weight: '7' },
  PackageResults: [{ TrackingNumber: '1ZLEAD', ShippingLabel: { GraphicImage: 'XlhBXkZP' } }, { TrackingNumber: '1ZBOX2', ShippingLabel: { GraphicImage: 'XlhBXkZP' } }] } } };
const PROPS = { UPS_CLIENT_ID: 'id', UPS_CLIENT_SECRET: 'sec', UPS_ACCOUNT: 'Y9620E', UPS_ENV: 'test' };
const Q = { to: { name: 'BEAUTY', attn: 'BEAUTY', phone: '4075550000', addr1: '13531 MONTFORT DR', addr2: 'STE 105', city: 'ORLANDO', state: 'FL', zip: '32801' }, svc: '03', boxes: [{ w: 5, l: 10, wd: 8, h: 6 }, { w: 3 }], ref: '#3001 BEAUTY' };

/* ① ② */
let body = null;
let { ctx, patches } = load(PROPS, (url, o) => { if (/\/ship$/.test(url)) { body = JSON.parse(o.payload); return resp(200, SHIP_OK); } return resp(404, {}); });
const r = ctx.ship_(Object.assign({}, Q, { fmt: 'ZPL' }), ctx.settingsFrom_());
const LS = body.ShipmentRequest.LabelSpecification, SH = body.ShipmentRequest.Shipment;
log('① label spec:', JSON.stringify(LS), '· ship-to lines:', JSON.stringify(SH.ShipTo.Address.AddressLine));
if (LS.LabelImageFormat.Code !== 'ZPL' || !LS.LabelStockSize || LS.LabelStockSize.Height !== '6' || LS.LabelStockSize.Width !== '4') errs.push('① ZPL with 4×6 stock');
if (!SH.ShipmentRatingOptions || !('NegotiatedRatesIndicator' in SH.ShipmentRatingOptions)) errs.push('① negotiated rates asked on the label');
if (JSON.stringify(SH.ShipTo.Address.AddressLine) !== JSON.stringify(['13531 MONTFORT DR STE 105'])) errs.push('① suite on the street line');
if (JSON.stringify(SH.ShipFrom.Address.AddressLine) !== JSON.stringify(['4265 CHURCH STREET', 'UNIT 1009'])) errs.push('① sender lines untouched');
log('② result:', JSON.stringify({ charge: r.charge, list: r.list, neg: r.neg, billW: r.billW, fmts: r.labels.map(l => l.fmt) }));
if (r.charge !== 18.4 || r.list !== 25.1 || r.neg !== true || r.billW !== 7 || r.labels.some(l => l.fmt !== 'ZPL')) errs.push('② negotiated charge · list · billing weight · fmt per label');
const gif = ctx.suLabelSpec_({ fmt: 'GIF' }); if (JSON.stringify(gif) !== JSON.stringify({ LabelImageFormat: { Code: 'GIF' }, HTTPUserAgent: 'Mozilla/4.5' })) errs.push('① GIF request unchanged');
if (ctx.suLabelSpec_({ fmt: 'PDF' }).LabelImageFormat.Code !== 'PDF') errs.push('① PDF');
if (ctx.suLabelSpec_({ fmt: 'XYZ' }).LabelImageFormat.Code !== 'GIF') errs.push('① unknown format → GIF');
({ ctx } = load(Object.assign({ __fmt: 'pdf' }, PROPS), () => resp(404, {}))); if (ctx.suFmt_({}) !== 'PDF') errs.push('① format from settings/app.ups.labelFmt');
const sx = ctx.suShipExtra_({ ShipTo: { Address: { AddressLine: ['1 MAIN ST STE 5', 'STE 5'] } } }); if (JSON.stringify(sx.ShipTo.Address.AddressLine) !== JSON.stringify(['1 MAIN ST STE 5'])) errs.push('① suite already in the street is not repeated');
const long = ctx.suShipExtra_({ ShipTo: { Address: { AddressLine: ['12345 VERY LONG BOULEVARD NAME WEST', 'BUILDING 7'] } } }); if (long.ShipTo.Address.AddressLine.length !== 2) errs.push('① over 35 chars stays on two lines');

/* run: done 에 더하는 칸 · ③ orphan */
({ ctx, patches } = load(PROPS, (url, o) => /\/ship$/.test(url) ? resp(200, SHIP_OK) : resp(404, {})));
ctx.fsQueryIn_ = (col, f, vals) => { if (vals.indexOf('env') < 0) errs.push('⑤ run asks for env jobs'); return [Object.assign({ _id: 'X1', st: 'wait', fmt: 'ZPL' }, Q)]; };

ctx.saveShipments_ = () => {};
ctx.run();
const done = patches.find(p => p.data.st === 'done'); log('② done patch:', JSON.stringify(done && { list: done.data.list, neg: done.data.neg, billW: done.data.billW, fmt: done.data.fmt, track: done.data.track }));
if (!done || done.data.list !== 25.1 || done.data.billW !== 7 || done.data.fmt !== 'ZPL' || done.data.track !== '1ZLEAD 1ZBOX2') errs.push('② run writes list · billW · fmt with done');
({ ctx, patches } = load(PROPS, (url, o) => /\/ship$/.test(url) ? resp(200, SHIP_OK) : resp(404, {})));
ctx.fsQueryIn_ = () => [Object.assign({ _id: 'X2', st: 'wait' }, Q)];
ctx.settingsFrom_ = () => ({});
ctx.saveShipments_ = () => {};
ctx.fsPatch_ = (col, id, data) => { patches.push({ col, id, data }); if (data.st === 'done') throw new Error('Firestore 쓰기 실패 500'); };
ctx.run();
const orf = patches.find(p => p.data.st === 'error'); log('③ error patch:', JSON.stringify(orf && { orphan: orf.data.orphan, track: orf.data.track, n: (orf.data.labels || []).length, err: orf.data.err }));
if (!orf || orf.data.orphan !== true || orf.data.track !== '1ZLEAD 1ZBOX2' || (orf.data.labels || []).length !== 2) errs.push('③ orphan label kept on the error');
({ ctx, patches } = load(PROPS, () => resp(400, { response: { errors: [{ code: '120100', message: 'Missing street' }] } })));
ctx.fsQueryIn_ = () => [Object.assign({ _id: 'X3', st: 'wait' }, Q)]; ctx.settingsFrom_ = () => ({});
ctx.run();
const e3 = patches.find(p => p.data.st === 'error'); if (!e3 || e3.data.orphan || e3.data.track) errs.push('③ plain UPS refusal is not an orphan');

/* ④ */
const RATE = { RateResponse: { RatedShipment: [
  { Service: { Code: '03' }, TotalCharges: { MonetaryValue: '30.00' }, NegotiatedRateCharges: { TotalCharge: { MonetaryValue: '21.60' } }, BillingWeight: { Weight: '9' }, TimeInTransit: { ServiceSummary: { EstimatedArrival: { BusinessDaysInTransit: '2', Arrival: { Date: '20261116' } } } } },
  { Service: { Code: '03' }, TotalCharges: { MonetaryValue: '31.00' }, NegotiatedRateCharges: { TotalCharge: { MonetaryValue: '22.69' } }, TimeInTransit: { ServiceSummary: { SaturdayDelivery: '1', EstimatedArrival: { BusinessDaysInTransit: '1', Arrival: { Date: '20261114' } } } } },
  { Service: { Code: '12' }, TotalCharges: { MonetaryValue: '40.60' }, TimeInTransit: { ServiceSummary: { EstimatedArrival: { BusinessDaysInTransit: '3', Arrival: { Date: '20261117' } } } } }] } };
let rateUrls = [];
({ ctx, patches } = load(PROPS, (url, o) => { rateUrls.push(url); if (/Shoptimeintransit$/.test(url)) { const b = JSON.parse(o.payload); if (!b.RateRequest.Shipment.DeliveryTimeInformation || b.RateRequest.Shipment.DeliveryTimeInformation.Pickup.Date !== '20261112') errs.push('④ pickup date sent'); return resp(200, RATE); } return resp(404, {}); }));
const R = ctx.suRates_(Q, {}); log('④ rates:', JSON.stringify(R));
if (R.length !== 2 || R[0].svc !== '03' || R[0].total !== 21.6 || R[0].list !== 30 || R[0].days !== '2' || R[0].arrive !== '2026-11-16' || R[0].neg !== true || R[0].billW !== 9 || R[0].name !== 'UPS Ground') errs.push('④ Ground: negotiated · arrival · days · billing weight (Saturday line dropped)');
if (!R[1] || R[1].svc !== '12' || R[1].neg !== false || R[1].total !== 40.6) errs.push('④ 3 Day Select: published rate');
rateUrls = [];
({ ctx } = load(PROPS, (url) => { rateUrls.push(url); if (/Shoptimeintransit$/.test(url)) return resp(401, { response: { errors: [{ code: '250002', message: 'Invalid Authentication Information.' }] } }); if (/\/Shop$/.test(url)) return resp(200, { RateResponse: { RatedShipment: [{ Service: { Code: '03' }, TotalCharges: { MonetaryValue: '30.00' }, GuaranteedDelivery: { BusinessDaysInTransit: '2' } }] } }); return resp(404, {}); }));
const R2 = ctx.suRates_(Q, {}); log('④ fallback:', JSON.stringify(R2), rateUrls.map(u => u.split('/').pop()).join(' → '));
if (R2.length !== 1 || R2[0].total !== 30 || R2[0].days !== '2' || !/\/Shop$/.test(rateUrls[rateUrls.length - 1])) errs.push('④ falls back to Shop');

/* ⑤ */
({ ctx, patches } = load(PROPS, () => resp(404, {})));
const env = ctx.suEnvJob_(); log('⑤ env:', JSON.stringify(env));
if (env.st !== 'envdone' || env.env !== 'test' || env.cred !== true || env.defined !== true || JSON.stringify(env).includes('sec')) errs.push('⑤ env job: env · cred · defined, no secrets');
({ ctx, patches } = load({ UPS_ENV: 'live' }, () => resp(404, {})));
const env2 = ctx.suEnvJob_(); if (env2.env !== 'live' || env2.cred !== false) errs.push('⑤ live without keys → cred false');
ctx.fsQueryIn_ = () => [{ _id: 'ENV1', st: 'env' }];
ctx.run(); const ep = patches.find(p => p.id === 'ENV1'); if (!ep || ep.data.st !== 'envdone' || ep.data.env !== 'live') errs.push('⑤ run answers the env job');
/* ⑥ */
({ ctx } = load(PROPS, () => resp(400, { response: { errors: [{ code: '190117', message: 'The shipment has already been voided.' }] } })));
try { ctx.suVoidOk_('1ZLEAD'); } catch (e) { errs.push('⑥ already voided counts as voided :: ' + e.message); }
({ ctx } = load(PROPS, () => resp(400, { response: { errors: [{ code: '190101', message: 'Void period has expired.' }] } })));
let threw = false; try { ctx.suVoidOk_('1ZLEAD'); } catch (e) { threw = /190101/.test(e.message); } if (!threw) errs.push('⑥ other void errors still fail');

console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
