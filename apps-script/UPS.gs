/**
 * THE ONE — UPS 라벨 만들기 (구글 Apps Script)
 *
 * 하는 일: 앱에서 🚚 출고 → "UPS 라벨" 을 누르면 Firestore shipq/{주문ID} 에 요청이 생김(st:'wait').
 *          이 스크립트가 1분마다 그걸 UPS Shipping API 로 보내 라벨(GIF) · 트래킹 번호 · 요금을 받아 같은 문서에 적음(st:'done').
 *          앱은 그걸 보고 라벨을 인쇄하고 주문에 트래킹을 붙임. 실패하면 st:'error' + 이유.
 *          취소(void)도 같은 방식 — 앱에서 라벨 취소 → st:'void' → UPS 에 취소 요청 → st:'voided'.
 *          🗺 가게 지도: geoSync 가 1시간마다 거래처 주소를 구글 지도(Apps Script Maps)로 좌표(lat · lng)로 바꿔 accounts 에 넣음 — 새 · 바뀐 주소만.
 *          주소 확인: 앱에서 "✅ UPS 주소 확인" → shipq/{id} (st:'av') → UPS Address Validation API → 추천 주소(cands) 를 적음(st:'avdone').
 *          Firestore 무료 한도(하루 읽기 5만)를 아끼려고 1분에 읽기 1번만 함.
 *
 * 설치 (한 번만, luke@theonefl.com):
 *   1. script.google.com → 새 프로젝트 "THE ONE UPS" → 이 내용을 Code.gs 에 붙여넣기 → 저장
 *   1-1. ⚙️ 프로젝트 설정 → "appsscript.json 매니페스트 파일 표시" 켜기 → 편집기의 appsscript.json 에 UPS.appsscript.json 내용 붙여넣기
 *        (Firestore 읽기 · 쓰기 권한 — 이게 없으면 "Firestore 읽기 실패")
 *   2. ⚙️ 프로젝트 설정 → 맨 아래 "스크립트 속성" → 속성 추가 (값은 채팅 · 메일에 쓰지 마세요):
 *        UPS_CLIENT_ID      = UPS My Apps 의 Client ID
 *        UPS_CLIENT_SECRET  = UPS My Apps 의 Client Secret
 *        UPS_ACCOUNT        = UPS 배송 계정 번호 (6자리, 예: Y9620E)
 *        UPS_ENV            = test   (처음엔 test = UPS 시험 서버, 가짜 라벨 · 요금 안 나감. 확인 뒤 live 로 바꿈)
 *        UPS_QV_NAME        = (선택) Quantum View 구독 이름 — 직원 앱 등 다른 곳에서 찍은 UPS 출고도 앱 주문에 붙이려면
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
  ScriptApp.newTrigger('geoSync').timeBased().everyHours(6).create(); Logger.log('🗺 가게 지도 좌표 — 6시간마다, 거래처가 바뀌었을 때만 새 · 바뀐 주소를 찾습니다 (처음 한 번은 지금 geoSync 를 직접 실행하면 빠릅니다)');
  if (prop_('UPS_QV_NAME')) { ScriptApp.newTrigger('qvSync').timeBased().everyHours(1).create(); Logger.log('Quantum View 구독 "' + prop_('UPS_QV_NAME') + '" — 1시간마다 출고 · 배달 기록을 받아옵니다'); }
  const tok = upsToken_();
  const r = UrlFetchApp.fetch(FS + '/settings/app', { headers: fsHeaders_(), muteHttpExceptions: true }), c = r.getResponseCode();
  Logger.log('UPS 연결 OK (' + env_() + ') · 토큰 받음 ' + String(tok).substring(0, 6) + '…');
  Logger.log(c === 200 ? 'Firestore OK' : 'Firestore 읽기 실패 ' + c + ': ' + r.getContentText().substring(0, 900) +
    (c === 403 || c === 401 ? '\n→ ⚙️ 프로젝트 설정에서 "appsscript.json 매니페스트 파일 표시" 를 켜고 UPS.appsscript.json 내용을 붙여넣은 뒤 setup 을 다시 실행해 권한을 허용하세요' : ''));
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
    /* 1분에 Firestore 읽기 1번만 — 라벨(wait) · 취소(void) · 주소 확인(av) 을 한 번에 찾음. 설정은 라벨이 있을 때만 */
    let jobs = [];
    try { jobs = fsQueryIn_('shipq', 'st', ['wait', 'void', 'av'], 20); }
    catch (e) { if (/ 429/.test(String(e.message))) { Logger.log('Firestore 하루 무료 한도 초과 — 한도가 다시 차면(밤 12시 태평양 시간) 저절로 이어집니다'); return; } throw e; }
    if (!jobs.length) return;
    const from = jobs.some(q => q.st === 'wait') ? settingsFrom_() : null;
    jobs.forEach(q => {
      if (q.st === 'wait') {
        try {
          fsPatch_('shipq', q._id, { st: 'working', at: iso_() });
          const r = ship_(q, from);
          fsPatch_('shipq', q._id, { st: 'done', at: iso_(), env: env_(), shipId: r.shipId, charge: r.charge, track: r.labels.map(x => x.trk).join(' '), labels: r.labels, err: '' });
        } catch (e) { fsPatch_('shipq', q._id, { st: 'error', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
      } else if (q.st === 'void') {
        try { voidShip_(q.shipId); fsPatch_('shipq', q._id, { st: 'voided', at: iso_(), err: '' }); }
        catch (e) { fsPatch_('shipq', q._id, { st: 'voiderr', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
      } else if (q.st === 'av') {
        try { fsPatch_('shipq', q._id, Object.assign({ st: 'avdone', at: iso_(), err: '' }, xav_(q.to || {}))); }
        catch (e) { fsPatch_('shipq', q._id, { st: 'averr', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
      }
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
/** 📍 주소 확인 (UPS Address Validation — Street Level). 돌려주는 값: { valid, ambiguous, none, cls, cands:[{addr1, addr2, city, state, zip, zip4}] }
 *  시험 서버(UPS_ENV=test)는 UPS 규정상 뉴욕(NY) · 캘리포니아(CA) 주소만 확인해 줍니다 — 실제 확인은 live 에서 */
function xav_(a) {
  const body = { XAVRequest: { AddressKeyFormat: { ConsigneeName: clip_(a.name, 35), AddressLine: [clip_(a.addr1, 35), clip_(a.addr2, 35)].filter(Boolean), PoliticalDivision2: clip_(a.city, 30), PoliticalDivision1: clip_(a.state, 2), PostcodePrimaryLow: String(a.zip || '').replace(/[^0-9]/g, '').substring(0, 5), CountryCode: 'US' } } };
  const j = upsFetch_('/api/addressvalidation/v2/3?maximumcandidatelistsize=5', 'post', body), R = j.XAVResponse || {};
  const cls = R.AddressClassification ? String(R.AddressClassification.Description || R.AddressClassification.Code || '') : '';
  const cands = [].concat(R.Candidate || []).map(c => { const k = c.AddressKeyFormat || {}, L = [].concat(k.AddressLine || []); return { addr1: L[0] || '', addr2: L[1] || '', city: k.PoliticalDivision2 || '', state: k.PoliticalDivision1 || '', zip: k.PostcodePrimaryLow || '', zip4: k.PostcodeExtendedLow || '', cls: c.AddressClassification ? String(c.AddressClassification.Description || '') : '' }; });
  return { valid: 'ValidAddressIndicator' in R, ambiguous: 'AmbiguousAddressIndicator' in R, none: 'NoCandidatesIndicator' in R, cls, cands };
}
function voidShip_(shipId) { if (!shipId) throw new Error('취소할 출고 번호가 없습니다'); upsFetch_('/api/shipments/v2403/void/cancel/' + encodeURIComponent(shipId), 'delete'); }

/* ============================================================
 *  📡 Quantum View — 회사 UPS 계정으로 나간 모든 출고(어느 프로그램에서 찍었든) · 배달 기록을 받아 앱 주문에 붙임
 *   ups.com 에서 Quantum View 구독(Outbound)을 만들고 그 이름을 스크립트 속성 UPS_QV_NAME 에 넣으면 1시간마다 돎.
 *   · 출고(Manifest): 참조 번호에 인보이스(A41921 · P-008312) · 주문 번호가 있으면 그 주문, 없으면 받는 가게 이름 + 날짜로 찾음
 *     → 주문에 트래킹 추가, "인보이스 발행 · 포장 대기" 였으면 "출고 완료" 로
 *   · 배달(Delivery): 그 트래킹의 주문에 배달 완료 표시
 *   · 기록은 upsLog/{트래킹} 에 (못 찾은 것도 — 관리 → 설정 → 🚚 UPS 에서 보임)
 * ============================================================ */
function qvSync() {
  const name = prop_('UPS_QV_NAME'); if (!name) { Logger.log('UPS_QV_NAME 이 없습니다'); return; }
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  try {
    let bookmark = '', n = 0, ship = 0, deliv = 0, matched = 0, guard = 0;
    do {
      const body = { QuantumViewRequest: { Request: { RequestAction: 'QVEvents', TransactionReference: { CustomerContext: 'THEONE' } }, SubscriptionRequest: [{ Name: name }] } };
      if (bookmark) body.QuantumViewRequest.Bookmark = bookmark;
      const j = upsFetch_(prop_('UPS_QV_PATH') || '/api/quantumview/v3/events', 'post', body);
      const R = j.QuantumViewResponse || {}, ev = R.QuantumViewEvents || {};
      [].concat(ev.SubscriptionEvents || []).forEach(se => [].concat(se.SubscriptionFile || []).forEach(f => {
        [].concat(f.Manifest || []).forEach(m => { n++; ship++; if (qvManifest_(m)) matched++; });
        [].concat(f.Delivery || []).forEach(d => { n++; deliv++; qvDelivery_(d); });
      }));
      bookmark = R.Bookmark || '';
    } while (bookmark && ++guard < 20);
    Logger.log('Quantum View — 출고 ' + ship + '건 (주문에 붙음 ' + matched + ') · 배달 ' + deliv + '건');
    fsPatchDoc_('settings', 'upsSync', { at: iso_(), ship, deliv, matched });
  } finally { lock.releaseLock(); }
}
const qvArr_ = x => [].concat(x || []);
function qvRefs_(m) { const out = []; qvArr_(m.ReferenceNumber).forEach(r => r && r.Value && out.push(String(r.Value))); qvArr_(m.Package).forEach(p => qvArr_(p.ReferenceNumber).forEach(r => r && r.Value && out.push(String(r.Value)))); return out; }
function qvManifest_(m) {
  const pk = qvArr_(m.Package), trks = pk.map(p => p.TrackingNumber).filter(Boolean); if (!trks.length) return false;
  const to = m.ShipTo || {}, a = to.Address || {}, refs = qvRefs_(m);
  const d = String(m.PickupDate || m.ScheduledDeliveryDate || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3') || iso_().substring(0, 10);
  const store = String(to.CompanyName || to.AttentionName || '').trim();
  const orderId = qvFindOrder_(refs, store, d);
  const o = orderId ? (fsGet_('orders', orderId) || {}) : {};
  const L = qvArr_(a.AddressLine);
  const log = { trk: trks.join(' '), refs: refs.join(' '), store, addr1: L[0] || '', addr2: L[1] || '', city: a.City || '', state: a.StateProvinceCode || '', zip: a.PostalCode || '', d, svc: (m.Service || {}).Code || '', boxes: trks.length, orderId: orderId || '', acct: o.acct || '', src: 'qv', at: iso_() };
  trks.forEach(t => fsPatchDoc_('upsLog', t, log));
  if (!orderId) return false;
  const have = String(o.track || '').split(/\s+/).filter(Boolean), add = trks.filter(t => have.indexOf(t) < 0);
  const patch = { updatedAt: iso_() };
  if (add.length) { patch.track = have.concat(add).join(' '); patch.shipVia = 'UPS'; patch.boxes = have.length + add.length; }
  if (o.st === 'done') { patch.st = 'shipped'; patch.shipAt = iso_(); patch.shipBy = 'UPS 기록 (자동)'; }
  if (Object.keys(patch).length > 1) fsPatchDoc_('orders', orderId, patch);
  return true;
}
function qvDelivery_(d) {
  const t = d.TrackingNumber; if (!t) return;
  const log = fsGet_('upsLog', t), when = String(d.Date || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
  fsPatchDoc_('upsLog', t, { delivered: when || iso_().substring(0, 10), deliveredTo: String(d.DeliveryLocation && d.DeliveryLocation.SignedForByName || '') });
  if (log && log.orderId) fsPatchDoc_('orders', log.orderId, { deliveredAt: when || iso_().substring(0, 10) });
}
/* ============================================================
 *  🗺 geoSync — 거래처 주소 → 좌표 (앱 거래처 → 🗺 지도). 주소가 바뀌면 다시 찾음 (geoQ = 찾을 때 쓴 주소)
 *    구글 하루 한도에 걸리면 멈췄다가 다음 시간에 이어서. 바뀐 게 있으면 settings/app.accountsVer 를 올려 폰들이 새로 받게
 * ============================================================ */
const geoQ_ = a => { const p = [a.addr, a.city, a.state, a.zip].map(x => String(x || '').trim()).filter(Boolean); return a.addr && p.length >= 3 ? p.join(', ') + ', USA' : ''; };
/** 주소 하나 → [lat, lng] — ① 미국 인구조사국 Census 지오코더 (무료 · 키 없음 · 한도 없음) ② 안 되면 구글 Maps (Apps Script) */
function geocode_(a) {
  const one = [a.addr, a.city, a.state, a.zip].map(x => String(x || '').trim()).filter(Boolean).join(', ');
  try {
    const r = UrlFetchApp.fetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(one), { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) { const m = ((JSON.parse(r.getContentText()).result || {}).addressMatches || [])[0]; if (m && m.coordinates) return { lat: m.coordinates.y, lng: m.coordinates.x, src: 'census' }; }
  } catch (e) {}
  try {
    const g = Maps.newGeocoder().setRegion('us').geocode(one + ', USA');
    if (g && g.status === 'OK' && g.results && g.results.length) { const l = g.results[0].geometry.location; return { lat: l.lat, lng: l.lng, src: 'google' }; }
    return { err: String((g && g.status) || 'NOT_FOUND') };
  } catch (e) { return { err: String(e && e.message || e).substring(0, 120), quota: /too many|quota|limit/i.test(String(e && e.message)) }; }
}
/** Census 일괄 — 한 번에 최대 1,000곳. 돌려주는 값: { acct: [lat, lng] } (못 찾은 곳은 없음) */
function censusBatch_(list) {
  const q = v => '"' + String(v || '').replace(/"/g, '').trim() + '"';
  const csv = list.map(a => [q(a._id), q(a.addr), q(a.city), q(a.state), q(String(a.zip || '').substring(0, 5))].join(',')).join('\n');
  const r = UrlFetchApp.fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'post', payload: { benchmark: 'Public_AR_Current', addressFile: Utilities.newBlob(csv, 'text/csv', 'addr.csv') }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Census ' + r.getResponseCode());
  const out = {};
  r.getContentText().split(/\r?\n/).forEach(line => {
    const c = (line.match(/"([^"]*)"/g) || []).map(x => x.replace(/"/g, ''));
    if (c.length >= 6 && c[2] === 'Match') { const xy = c[5].split(','); out[c[0]] = [Number(xy[1]), Number(xy[0])]; }
  });
  return out;
}
function geoSync() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  const t0 = Date.now();
  try {
    /* 거래처가 바뀌지 않았으면 읽지 않음 (Firestore 읽기 아끼기) — settings/app.accountsVer 를 지난번과 비교 */
    const P = PropertiesService.getScriptProperties(), st = fsGet_('settings', 'app') || {}, ver = String(st.accountsVer || '');
    if (P.getProperty('GEO_DONE') === '1' && P.getProperty('GEO_VER') === ver) { Logger.log('🗺 바뀐 거래처 없음 — 건너뜀'); return; }
    const all = fsListAll_('accounts'), todo = all.filter(a => { const q = geoQ_(a); return q && a.geoQ !== q; });
    Logger.log('🗺 거래처 ' + all.length + '곳 · 좌표 찾을 곳 ' + todo.length);
    let ok = 0, bad = 0, stop = ''; const errs = {};
    const save = (a, r) => { const q = geoQ_(a); try { if (r.lat != null) { fsPatch_('accounts', a._id, { lat: r.lat, lng: r.lng, geoQ: q, geoErr: '', geoSrc: r.src, geoAt: iso_() }); ok++; } else { fsPatch_('accounts', a._id, { geoQ: q, geoErr: r.err, lat: null, lng: null }); errs[r.err] = (errs[r.err] || 0) + 1; bad++; } } catch (e) { errs[String(e.message)] = (errs[String(e.message)] || 0) + 1; } };
    for (let i = 0; i < todo.length && !stop; i += 1000) {
      const part = todo.slice(i, i + 1000);
      let hit = {}; try { hit = censusBatch_(part); } catch (e) { errs[String(e.message)] = 1; }
      for (const a of part) {
        if (Date.now() - t0 > 5 * 60 * 1000) { stop = '시간 (5분)'; break; }
        if (hit[a._id]) { save(a, { lat: hit[a._id][0], lng: hit[a._id][1], src: 'census' }); continue; }
        const r = geocode_(a);   // Census 일괄에서 못 찾은 곳 — 한 곳씩 다시 (Census → 구글)
        if (r.quota) { stop = '구글 하루 한도'; break; }
        save(a, r);
      }
    }
    /* 다 끝났을 때만 버전을 올림 — 올리면 모든 폰이 거래처를 다시 받으므로 한 번만 */
    if (!stop) { let v = ver; if (ok || bad || P.getProperty('GEO_PENDING') === '1') { v = String(Date.now()); fsPatch_('settings', 'app', { accountsVer: v }); } P.setProperties({ GEO_VER: v, GEO_DONE: '1', GEO_PENDING: '0' }); }
    else P.setProperties({ GEO_DONE: '0', GEO_PENDING: (ok || bad || P.getProperty('GEO_PENDING') === '1') ? '1' : '0' });
    Logger.log('🗺 찾음 ' + ok + ' · 못 찾음 ' + bad + (stop ? ' · 멈춤(' + stop + ') — 다음 실행 때 이어서' : ' · 끝'));
    Object.keys(errs).slice(0, 5).forEach(k => Logger.log('  이유: ' + k + ' × ' + errs[k]));
  } catch (e) { if (/ 429/.test(String(e.message))) { Logger.log('🗺 Firestore 하루 무료 한도 초과 — 한도가 다시 차면 다음 실행 때 이어서 합니다'); return; } Logger.log('🗺 geoSync 오류: ' + (e && e.message || e)); throw e; }
  finally { lock.releaseLock(); }
}

/** 참조 번호 → 인보이스(invoices/{번호}.orderId) · 주문(orders/{번호}) · 없으면 받는 가게 이름 + 7일 안 "인보이스 발행" 주문 하나 */
function qvFindOrder_(refs, store, d) {
  for (const r of refs) for (const tok of String(r).toUpperCase().split(/[\s,;/]+/)) {
    if (!/^[A-Z]{1,3}-?\d{3,7}$|^O\d{6}/.test(tok)) continue;
    const inv = fsGet_('invoices', tok); if (inv && inv.orderId) return inv.orderId;
    const o = fsGet_('orders', tok); if (o) return tok;
  }
  if (!store) return '';
  const norm = x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cand = fsQuery_('orders', 'st', 'done', 300).filter(o => norm(o.store) === norm(store) || (norm(store).length > 6 && norm(o.store).indexOf(norm(store)) === 0));
  const near = cand.filter(o => Math.abs((new Date(o.d) - new Date(d)) / 86400000) <= 7);
  return near.length === 1 ? near[0]._id : '';
}
/** 없으면 만들고 있으면 고침 (PATCH + updateMask) */
function fsPatchDoc_(col, id, data) { fsPatch_(col, id, data); }

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
/** 컬렉션 전부 (300개씩) */
function fsListAll_(col) {
  const out = []; let tok = '';
  do {
    const r = UrlFetchApp.fetch(FS + '/' + col + '?pageSize=300' + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''), { headers: fsHeaders_(), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('Firestore 읽기 실패 ' + r.getResponseCode() + ': ' + r.getContentText().substring(0, 200));
    const j = JSON.parse(r.getContentText()); (j.documents || []).forEach(d => out.push(fromDoc_(d))); tok = j.nextPageToken || '';
  } while (tok);
  return out;
}
/** field IN [값들] — 여러 상태를 읽기 1번으로 */
function fsQueryIn_(col, field, vals, limit) {
  const body = { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'IN', value: { arrayValue: { values: vals.map(v => ({ stringValue: v })) } } } }, limit } };
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
