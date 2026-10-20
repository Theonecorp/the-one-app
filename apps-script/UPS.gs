/**
 * THE ONE — UPS 라벨 만들기 (구글 Apps Script)
 *
 * 하는 일: 앱에서 🚚 출고 → "UPS 라벨" 을 누르면 Firestore shipq/{주문ID} 에 요청이 생김(st:'wait').
 *          이 스크립트가 1분마다 그걸 UPS Shipping API 로 보내 라벨(GIF) · 트래킹 번호 · 요금을 받아 같은 문서에 적음(st:'done').
 *          앱은 그걸 보고 라벨을 인쇄하고 주문에 트래킹을 붙임. 실패하면 st:'error' + 이유.
 *          취소(void)도 같은 방식 — 앱에서 라벨 취소 → st:'void' → UPS 에 취소 요청 → st:'voided'.
 *
 * 설치 (한 번만, luke@theonefl.com):
 *   1. script.google.com → 새 프로젝트 "THE ONE UPS" → 이 내용을 Code.gs 에 붙여넣기 → 저장
 *   2. ⚙️ 프로젝트 설정 → 맨 아래 "스크립트 속성" → 속성 추가 (값은 채팅 · 메일에 쓰지 마세요):
 *        UPS_CLIENT_ID      = UPS My Apps 의 Client ID
 *        UPS_CLIENT_SECRET  = UPS My Apps 의 Client Secret
 *        UPS_ACCOUNT        = UPS 배송 계정 번호 (6자리, 예: Y9620E)
 *        UPS_ENV            = test   (처음엔 test = UPS 시험 서버, 가짜 라벨 · 요금 안 나감. 확인 뒤 live 로 바꿈)
 *   3. 함수 목록에서 setup 고르고 ▶ 실행 → 권한 허용 → 로그에 "UPS 연결 OK" 가 나오면 끝
 *      (1분마다 도는 트리거가 생깁니다)
 *
 * 보내는 곳(창고 주소)은 앱 관리 → ⚙️ 설정 → 🚚 UPS 출고 에서 정합니다 (Firestore settings/app.ups).
 */
const PROJECT = 'the-one-app-ff40e';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const SHIP_FROM_DEFAULT = { name: 'THE ONE CORP', attn: 'SHIPPING', phone: '4078787274', addr1: '4265 CHURCH STREET', addr2: 'UNIT 1009', city: 'SANFORD', state: 'FL', zip: '32771' };

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('run').timeBased().everyMinutes(1).create();
  const tok = upsToken_();
  Logger.log('UPS 연결 OK (' + env_() + ') · 토큰 받음 ' + String(tok).substring(0, 6) + '… · Firestore ' + (fsGet_('settings', 'app') ? 'OK' : '읽기 실패'));
}
/** 시험: 앱 없이 라벨 하나 만들어 보기 (test 환경에서만) */
function testLabel() {
  if (env_() !== 'test') throw new Error('UPS_ENV 가 test 일 때만 시험합니다');
  const r = ship_({ to: { name: 'TEST STORE', attn: 'TEST', phone: '4078787274', addr1: '1 MAIN ST', city: 'ORLANDO', state: 'FL', zip: '32801' }, svc: '03', boxes: [{ w: 5 }], ref: 'TEST' }, settingsFrom_());
  Logger.log('시험 라벨 OK — 트래킹 ' + r.labels.map(x => x.trk).join(', ') + ' · 요금 $' + r.charge);
}

function run() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  try {
    const from = settingsFrom_();
    fsQuery_('shipq', 'st', 'wait', 10).forEach(q => {
      try {
        fsPatch_('shipq', q._id, { st: 'working', at: iso_() });
        const r = ship_(q, from);
        fsPatch_('shipq', q._id, { st: 'done', at: iso_(), env: env_(), shipId: r.shipId, charge: r.charge, track: r.labels.map(x => x.trk).join(' '), labels: r.labels, err: '' });
      } catch (e) { fsPatch_('shipq', q._id, { st: 'error', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
    });
    fsQuery_('shipq', 'st', 'void', 10).forEach(q => {
      try { voidShip_(q.shipId); fsPatch_('shipq', q._id, { st: 'voided', at: iso_(), err: '' }); }
      catch (e) { fsPatch_('shipq', q._id, { st: 'voiderr', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
    });
  } finally { lock.releaseLock(); }
}

/* ---------- UPS ---------- */
function env_() { return String(prop_('UPS_ENV') || 'test').toLowerCase() === 'live' ? 'live' : 'test'; }
function base_() { return env_() === 'live' ? 'https://onlinetools.ups.com' : 'https://wwwcie.ups.com'; }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function upsToken_() {
  const c = CacheService.getScriptCache(), k = 'tok_' + env_(), hit = c.get(k); if (hit) return hit;
  const id = prop_('UPS_CLIENT_ID'), sec = prop_('UPS_CLIENT_SECRET'), acct = prop_('UPS_ACCOUNT');
  if (!id || !sec || !acct) throw new Error('스크립트 속성에 UPS_CLIENT_ID · UPS_CLIENT_SECRET · UPS_ACCOUNT 를 넣어 주세요');
  const res = UrlFetchApp.fetch(base_() + '/security/v1/oauth/token', { method: 'post', payload: 'grant_type=client_credentials', contentType: 'application/x-www-form-urlencoded',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + sec), 'x-merchant-id': acct }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('UPS 로그인 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300));
  const j = JSON.parse(res.getContentText());
  c.put(k, j.access_token, Math.max(60, Math.min(21000, Number(j.expires_in || 3600) - 120)));
  return j.access_token;
}
function upsFetch_(path, method, body) {
  const res = UrlFetchApp.fetch(base_() + path, { method, contentType: 'application/json', payload: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: 'Bearer ' + upsToken_(), transId: Utilities.getUuid().substring(0, 32), transactionSrc: 'THEONEAPP' }, muteHttpExceptions: true });
  const txt = res.getContentText(), code = res.getResponseCode();
  let j = {}; try { j = JSON.parse(txt); } catch (e) {}
  if (code !== 200) { const er = j.response && j.response.errors ? j.response.errors.map(x => x.code + ' ' + x.message).join(' / ') : txt.substring(0, 300); throw new Error('UPS ' + code + ': ' + er); }
  return j;
}
const clip_ = (s, n) => String(s || '').toUpperCase().replace(/[^A-Z0-9 #&\-.,'\/]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, n);
const phone_ = s => String(s || '').replace(/\D/g, '').slice(-10) || '0000000000';
function addr_(a) { return { AddressLine: [clip_(a.addr1, 35), clip_(a.addr2, 35)].filter(Boolean), City: clip_(a.city, 30), StateProvinceCode: clip_(a.state, 2), PostalCode: String(a.zip || '').replace(/[^0-9-]/g, '').substring(0, 10), CountryCode: 'US' }; }
function ship_(q, from) {
  const acct = prop_('UPS_ACCOUNT'), to = q.to || {};
  if (!to.addr1 || !to.city || !to.state || !to.zip) throw new Error('받는 주소가 부족합니다 (주소 · 도시 · 주 · ZIP)');
  const boxes = (q.boxes && q.boxes.length ? q.boxes : [{ w: 5 }]).slice(0, 20);
  const ref = clip_(q.ref, 35);
  const body = { ShipmentRequest: { Request: { RequestOption: 'nonvalidate', TransactionReference: { CustomerContext: ref } },
    Shipment: {
      Description: 'JEWELRY & ACCESSORIES',
      Shipper: { Name: clip_(from.name, 35), AttentionName: clip_(from.attn || from.name, 35), Phone: { Number: phone_(from.phone) }, ShipperNumber: acct, Address: addr_(from) },
      ShipFrom: { Name: clip_(from.name, 35), AttentionName: clip_(from.attn || from.name, 35), Phone: { Number: phone_(from.phone) }, Address: addr_(from) },
      ShipTo: { Name: clip_(to.name, 35), AttentionName: clip_(to.attn || to.name, 35), Phone: { Number: phone_(to.phone) }, Address: addr_(to) },
      PaymentInformation: { ShipmentCharge: [{ Type: '01', BillShipper: { AccountNumber: acct } }] },
      Service: { Code: String(q.svc || '03') },
      Package: boxes.map((b, i) => ({ Description: 'BOX ' + (i + 1), Packaging: { Code: '02' },
        PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: String(Math.max(1, Math.ceil(Number(b.w) || 1))) },
        ReferenceNumber: ref ? [{ Value: ref }] : undefined }))
    },
    LabelSpecification: { LabelImageFormat: { Code: 'GIF' }, HTTPUserAgent: 'Mozilla/4.5' } } };
  const j = upsFetch_('/api/shipments/v2403/ship', 'post', body);
  const R = j.ShipmentResponse.ShipmentResults, pk = [].concat(R.PackageResults || []);
  const charge = Number(((R.ShipmentCharges || {}).TotalCharges || {}).MonetaryValue || 0);
  return { shipId: R.ShipmentIdentificationNumber, charge, labels: pk.map(p => ({ trk: p.TrackingNumber, img: (p.ShippingLabel || {}).GraphicImage || '' })) };
}
function voidShip_(shipId) { if (!shipId) throw new Error('취소할 출고 번호가 없습니다'); upsFetch_('/api/shipments/v2403/void/cancel/' + encodeURIComponent(shipId), 'delete'); }

/* ---------- 보내는 곳 (앱 설정 settings/app.ups.from) ---------- */
function settingsFrom_() { const s = fsGet_('settings', 'app') || {}; return Object.assign({}, SHIP_FROM_DEFAULT, (s.ups && s.ups.from) || {}); }

/* ---------- Firestore REST (설치한 계정 권한) ---------- */
function fsHeaders_() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT }; }
function fsGet_(col, id) { const r = UrlFetchApp.fetch(FS + '/' + col + '/' + encodeURIComponent(id), { headers: fsHeaders_(), muteHttpExceptions: true }); return r.getResponseCode() === 200 ? fromDoc_(JSON.parse(r.getContentText())) : null; }
function fsQuery_(col, field, val, limit) {
  const body = { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: val } } }, limit } };
  const r = UrlFetchApp.fetch(FS + ':runQuery', { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), headers: fsHeaders_(), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Firestore 읽기 실패 ' + r.getResponseCode() + ': ' + r.getContentText().substring(0, 200));
  return JSON.parse(r.getContentText()).filter(x => x.document).map(x => fromDoc_(x.document));
}
function fsPatch_(col, id, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&'), fields = {};
  Object.keys(data).forEach(k => { fields[k] = toVal_(data[k]); });
  const r = UrlFetchApp.fetch(FS + '/' + col + '/' + encodeURIComponent(id) + '?' + mask, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields }), headers: fsHeaders_(), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Firestore 쓰기 실패 ' + r.getResponseCode());
}
function fromDoc_(d) { const o = fromFields_(d.fields || {}); o._id = String(d.name || '').split('/').pop(); return o; }
function fromFields_(f) { const o = {}; Object.keys(f).forEach(k => { o[k] = fromVal_(f[k]); }); return o; }
function fromVal_(v) { if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue; if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null; if ('timestampValue' in v) return v.timestampValue; if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromVal_); if ('mapValue' in v) return fromFields_(v.mapValue.fields || {}); return null; }
function toVal_(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toVal_) } };
  if (typeof x === 'object') { const f = {}; Object.keys(x).forEach(k => { f[k] = toVal_(x[k]); }); return { mapValue: { fields: f } }; }
  if (typeof x === 'number') return { doubleValue: x }; if (typeof x === 'boolean') return { booleanValue: x };
  return { stringValue: String(x) };
}
function iso_() { return new Date().toISOString(); }
