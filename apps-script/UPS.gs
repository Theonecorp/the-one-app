/**
 * THE ONE — UPS 라벨 만들기 (구글 Apps Script)
 *
 * 하는 일: 앱에서 🚚 출고 → "UPS 라벨" 을 누르면 Firestore shipq/{주문ID} 에 요청이 생김(st:'wait').
 *          이 스크립트가 1분마다 그걸 UPS Shipping API 로 보내 라벨(GIF) · 트래킹 번호 · 요금을 받아 같은 문서에 적음(st:'done').
 *          앱은 그걸 보고 라벨을 인쇄하고 주문에 트래킹을 붙임. 실패하면 st:'error' + 이유.
 *          취소(void)도 같은 방식 — 앱에서 라벨 취소 → st:'void' → UPS 에 취소 요청 → st:'voided'.
 *          🗺 가게 지도: geoSync 가 1시간마다 거래처 주소를 구글 지도(Apps Script Maps)로 좌표(lat · lng)로 바꿔 accounts 에 넣음 — 새 · 바뀐 주소만.
 *          주소 확인: 앱에서 "✅ UPS 주소 확인" → shipq/{id} (st:'av') → UPS Address Validation API → 추천 주소(cands) 를 적음(st:'avdone').
 *          요금 보기: st:'rate' → UPS Rating(Shop) API → 서비스별 요금(rates) (st:'ratedone').
 *          배송 조회: st:'trk' → UPS Tracking API → 상태 · 스캔 기록(res) (st:'trkdone') + shipments/{트래킹} 갱신.
 *          반품 라벨: st:'ret' → UPS Shipping API (ReturnService 9) → 라벨(labels) (st:'retdone') + shipments/{트래킹}(ret:true). 취소는 같은 void.
 *          반품 라벨 메일: st:'mail' (job = 반품 shipq 문서) → MailApp 으로 라벨(PDF · GIF) 첨부 (st:'maildone' | 'mailerr') — 매니페스트에 script.send_mail 권한 필요
 *          📦 shipments/{트래킹} = 박스 한 개: { trk, orderId, no, acct, store, sm, invs:[이 박스의 인보이스], box, boxes, w, dims, svc, shipDate, status, events, delivered, deliveredAt, receivedBy, trkSt:'open'|'done' }
 *             라벨을 만들 때 · Quantum View 로 다른 프로그램 출고를 받을 때 생기고, trackSync 가 3시간마다 배달 안 된 것을 조회함.
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
 *        UPS_TRACK_ENV      = (선택) 배송 조회 서버. 비우면 live — 라벨이 test 여도 실제 운송장을 조회함(돈 안 듦). test 로 두면 시험 서버만
 *   3. 함수 목록에서 setup 고르고 ▶ 실행 → 권한 허용 → 로그에 "UPS 연결 OK" 가 나오면 끝
 *   4. 잘 되는지 모르겠으면 status 를 실행 — 어느 서버를 쓰는지 · 로그인이 되는지 로그에 나옴
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
  ScriptApp.newTrigger('trackSync').timeBased().everyHours(3).create(); Logger.log('📦 배송 조회 — 3시간마다 배달 안 된 박스를 UPS 에서 조회합니다');
  if (prop_('UPS_QV_NAME')) { ScriptApp.newTrigger('qvSync').timeBased().everyHours(1).create(); Logger.log('Quantum View 구독 "' + prop_('UPS_QV_NAME') + '" — 1시간마다 출고 · 배달 기록을 받아옵니다'); }
  const tok = upsToken_();
  const r = UrlFetchApp.fetch(FS + '/settings/app', { headers: fsHeaders_(), muteHttpExceptions: true }), c = r.getResponseCode();
  Logger.log('UPS 연결 OK (' + env_() + ') · 토큰 받음 ' + String(tok).substring(0, 6) + '…');
  Logger.log(c === 200 ? 'Firestore OK' : 'Firestore 읽기 실패 ' + c + ': ' + r.getContentText().substring(0, 900) +
    (c === 403 || c === 401 ? '\n→ ⚙️ 프로젝트 설정에서 "appsscript.json 매니페스트 파일 표시" 를 켜고 UPS.appsscript.json 내용을 붙여넣은 뒤 setup 을 다시 실행해 권한을 허용하세요' : ''));
}
/** 진단: 함수 목록에서 status 를 골라 ▶ 실행 → 로그에 어느 서버(test/live)를 쓰는지 · 속성이 들어 있는지 · 트리거 · UPS 로그인이 되는지 */
function status() {
  const P = PropertiesService.getScriptProperties().getProperties(), keys = Object.keys(P);
  Logger.log('라벨 서버: ' + env_() + ' (UPS_ENV=' + JSON.stringify(P.UPS_ENV === undefined ? null : P.UPS_ENV) + ') · 조회 서버: ' + trackEnv_());
  Logger.log('속성: ' + ['UPS_CLIENT_ID', 'UPS_CLIENT_SECRET', 'UPS_ACCOUNT', 'UPS_ENV', 'UPS_QV_NAME', 'UPS_TRACK_ENV'].map(k => k + (P[k] ? ' ✓' : ' ✗')).join(' · ') + (keys.filter(k => !/^UPS_/.test(k)).length ? ' · 그 외: ' + keys.filter(k => !/^UPS_/.test(k)).join(', ') : ''));
  Logger.log('트리거: ' + (ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).join(', ') || '없음 — setup 을 실행하세요'));
  ['test', 'live'].forEach(e => { try { CacheService.getScriptCache().remove('tok_' + e); upsToken_(e); Logger.log('UPS ' + e + ' 로그인 OK'); } catch (x) { Logger.log('UPS ' + e + ' 로그인 실패: ' + String(x.message).substring(0, 200) + (e === 'live' ? ' → UPS 개발자 포털에서 이 앱에 Production 권한을 추가해야 실제 라벨 · 조회가 됩니다' : '')); } });
  try { const r = track_('1ZXXXXXXXXXXXXXXXX'); Logger.log('시험 조회 OK (' + r.env + '): ' + r.status); } catch (x) { Logger.log('시험 조회 실패: ' + String(x.message).substring(0, 200)); }
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
    try { jobs = fsQueryIn_('shipq', 'st', ['wait', 'void', 'av', 'rate', 'trk', 'ret', 'mail'].concat(SU_EXTRA_ST_), 20); }   // ↩ ret · mail = 반품 (Shipping History) · 🏪 SU_EXTRA_ST_ = 카운터가 더한 일 (아래 블록)
    catch (e) { if (/ 429/.test(String(e.message))) { Logger.log('Firestore 하루 무료 한도 초과 — 한도가 다시 차면(밤 12시 태평양 시간) 저절로 이어집니다'); return; } throw e; }
    if (!jobs.length) return;
    const from = jobs.some(q => q.st === 'wait' || q.st === 'rate' || q.st === 'ret') ? settingsFrom_() : null;
    jobs.forEach(q => {
      if (q.st === 'wait') {
        let r = null;   // 🏪 라벨이 나온 뒤 적기가 실패하면 그 라벨(트래킹)을 error 에 같이 남김 — suOrphan_
        try {
          fsPatch_('shipq', q._id, { st: 'working', at: iso_() });
          r = ship_(q, from);
          fsPatch_('shipq', q._id, Object.assign({ st: 'done', at: iso_(), env: env_(), shipId: r.shipId, charge: r.charge, track: r.labels.map(x => x.trk).join(' '), labels: r.labels, err: '' }, suDoneExtra_(r)));
          saveShipments_(q, r);
        } catch (e) { fsPatch_('shipq', q._id, Object.assign({ st: 'error', at: iso_(), err: String(e && e.message || e).substring(0, 500) }, suOrphan_(r))); }
      } else if (q.st === 'void') {
        try { suVoidOk_(q.shipId); fsPatch_('shipq', q._id, { st: 'voided', at: iso_(), err: '' }); String(q.track || '').split(/\s+/).filter(Boolean).forEach(t => { try { fsPatch_('shipments', t, { voided: true, voidAt: iso_(), status: 'Voided', trkSt: 'done' }); } catch (e) {} }); }
        catch (e) { fsPatch_('shipq', q._id, { st: 'voiderr', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
      } else if (q.st === 'rate') {
        try { fsPatch_('shipq', q._id, { st: 'ratedone', at: iso_(), err: '', env: env_(), rates: suRates_(q, from) }); }   // 🏪 suRates_ = 도착일 · 협상 요금 (아래)
        catch (e) { fsPatch_('shipq', q._id, { st: 'rateerr', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
      } else if (q.st === 'trk') {
        const res = {};
        [].concat(q.trks || []).slice(0, 25).forEach(t => { try { res[t] = track_(t); updShipment_(t, res[t]); } catch (e) { res[t] = { err: String(e && e.message || e).substring(0, 200) }; } });
        fsPatch_('shipq', q._id, { st: 'trkdone', at: iso_(), res });
      } else if (q.st === 'ret') {
        /* ↩ 반품 라벨 (Shipping History → UPS 반품 만들기) — 손님 주소 → 우리 창고, 회사 계정으로 */
        try {
          fsPatch_('shipq', q._id, { st: 'working', at: iso_() });
          const r = shipReturn_(q, from);
          fsPatch_('shipq', q._id, { st: 'retdone', at: iso_(), env: env_(), shipId: r.shipId, charge: r.charge, list: r.list, track: r.labels.map(x => x.trk).join(' '), labels: r.labels, err: '' });
          saveReturn_(q, r);
        } catch (e) { fsPatch_('shipq', q._id, { st: 'reterr', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
      } else if (q.st === 'mail') {
        /* ✉️ 반품 라벨을 손님에게 메일로 (제목 · 글은 여기서 고정 — 앱은 받는 주소만) */
        try { const r = mailReturn_(q); fsPatch_('shipq', q._id, { st: 'maildone', at: iso_(), para: r.para, err: '' }); }
        catch (e) { fsPatch_('shipq', q._id, { st: 'mailerr', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
      } else if (q.st === 'env') {   // 🏪 지금 어느 UPS 서버인지 · 키가 있는지 (UPS 에 묻지 않음)
        try { fsPatch_('shipq', q._id, suEnvJob_()); } catch (e) {}
      } else if (q.st === 'av') {
        try { fsPatch_('shipq', q._id, Object.assign({ st: 'avdone', at: iso_(), err: '' }, xav_(q.to || {}))); }
        catch (e) { fsPatch_('shipq', q._id, { st: 'averr', at: iso_(), err: String(e && e.message || e).substring(0, 500) }); }
      }
    });
  } finally { lock.releaseLock(); }
}

/* ---------- UPS ---------- */
function env_() { return String(prop_('UPS_ENV') || 'test').trim().toLowerCase() === 'live' ? 'live' : 'test'; }
function base_(env) { return (env || env_()) === 'live' ? 'https://onlinetools.ups.com' : 'https://wwwcie.ups.com'; }
/** 📦 배송 조회는 돈이 안 들고 읽기만 하므로 라벨이 시험(test)이어도 실제 서버(live)에 묻는다 — 스크립트 속성 UPS_TRACK_ENV=test 로 끌 수 있음 */
function trackEnv_() { return String(prop_('UPS_TRACK_ENV') || 'live').trim().toLowerCase() === 'test' ? 'test' : 'live'; }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function upsToken_(env) {
  env = env || env_();
  const c = CacheService.getScriptCache(), k = 'tok_' + env, hit = c.get(k); if (hit) return hit;
  const id = prop_('UPS_CLIENT_ID'), sec = prop_('UPS_CLIENT_SECRET'), acct = prop_('UPS_ACCOUNT');
  if (!id || !sec || !acct) throw new Error('스크립트 속성에 UPS_CLIENT_ID · UPS_CLIENT_SECRET · UPS_ACCOUNT 를 넣어 주세요');
  const res = UrlFetchApp.fetch(base_(env) + '/security/v1/oauth/token', { method: 'post', payload: 'grant_type=client_credentials', contentType: 'application/x-www-form-urlencoded',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + sec), 'x-merchant-id': acct }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('UPS 로그인 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300));
  const j = JSON.parse(res.getContentText());
  c.put(k, j.access_token, Math.max(60, Math.min(21000, Number(j.expires_in || 3600) - 120)));
  return j.access_token;
}
function upsFetch_(path, method, body, env) {
  const res = UrlFetchApp.fetch(base_(env) + path, { method, contentType: 'application/json', payload: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: 'Bearer ' + upsToken_(env), transId: Utilities.getUuid().substring(0, 32), transactionSrc: 'THEONEAPP' }, muteHttpExceptions: true });
  const txt = res.getContentText(), code = res.getResponseCode();
  let j = {}; try { j = JSON.parse(txt); } catch (e) {}
  if (code !== 200) { const er = j.response && j.response.errors ? j.response.errors.map(x => x.code + ' ' + x.message).join(' / ') : txt.substring(0, 300); throw new Error('UPS ' + code + ': ' + er); }
  return j;
}
const clip_ = (s, n) => String(s || '').toUpperCase().replace(/[^A-Z0-9 #&\-.,'\/]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, n);
const phone_ = s => String(s || '').replace(/\D/g, '').slice(-10) || '0000000000';
function addr_(a) { return { AddressLine: [clip_(a.addr1, 35), clip_(a.addr2, 35)].filter(Boolean), City: clip_(a.city, 30), StateProvinceCode: clip_(a.state, 2), PostalCode: String(a.zip || '').replace(/[^0-9-]/g, '').substring(0, 10), CountryCode: 'US' }; }
/* UPS 서비스 이름 (요금 비교 · 기록용) */
const SVC_ = { '03': 'UPS Ground', '12': 'UPS 3 Day Select', '02': 'UPS 2nd Day Air', '59': 'UPS 2nd Day Air A.M.', '13': 'UPS Next Day Air Saver', '01': 'UPS Next Day Air', '14': 'UPS Next Day Air Early' };
/** 앱의 출고 입력 → UPS Shipment (라벨 · 요금 공통). q = { to:{name, attn, phone, email, addr1, addr2, addr3, city, state, zip, res}, fromX, svc, boxes:[{w, l, wd, h, pkg, val, ref1, ref2, invs}], opt:{sat, sig, notify}, bill:{type, acct, zip}, ref, desc } */
function shipment_(q, from, rate) {
  const acct = prop_('UPS_ACCOUNT'), to = q.to || {}, f = Object.assign({}, from, q.fromX || {});
  if (!to.addr1 || !to.city || !to.state || !to.zip) throw new Error('받는 주소가 부족합니다 (주소 · 도시 · 주 · ZIP)');
  const opt = q.opt || {}, bill = q.bill || {};
  const toAddr = addr_(to); if (to.addr3) toAddr.AddressLine.push(clip_(to.addr3, 35)); if (to.res) toAddr.ResidentialAddressIndicator = '';
  const party = (x, ad) => ({ Name: clip_(x.name, 35), AttentionName: clip_(x.attn || x.name, 35), Phone: { Number: phone_(x.phone) }, Address: ad });
  const charge = bill.type === 'rcv' && bill.acct ? { Type: '01', BillReceiver: { AccountNumber: clip_(bill.acct, 10), Address: { PostalCode: String(bill.zip || to.zip).substring(0, 10) } } }
    : bill.type === 'third' && bill.acct ? { Type: '01', BillThirdParty: { AccountNumber: clip_(bill.acct, 10), Address: { PostalCode: String(bill.zip || '').substring(0, 10), CountryCode: 'US' } } }
    : { Type: '01', BillShipper: { AccountNumber: acct } };
  const pk = (q.boxes && q.boxes.length ? q.boxes : [{ w: 5 }]).slice(0, 50).map((b, i) => {
    const o = {}; o[rate ? 'PackagingType' : 'Packaging'] = { Code: String(b.pkg || '02') };
    if (!rate) o.Description = 'BOX ' + (i + 1);
    o.PackageWeight = { UnitOfMeasurement: { Code: 'LBS' }, Weight: String(Math.max(1, Math.ceil(Number(b.w) || 1))) };
    if (Number(b.l) && Number(b.wd) && Number(b.h)) o.Dimensions = { UnitOfMeasurement: { Code: 'IN' }, Length: String(Math.ceil(b.l)), Width: String(Math.ceil(b.wd)), Height: String(Math.ceil(b.h)) };
    const so = {};
    if (Number(b.val) > 0) so.DeclaredValue = { CurrencyCode: 'USD', MonetaryValue: String(Math.round(Number(b.val))) };
    if (opt.sig === 'sig' || opt.sig === 'adult') so.DeliveryConfirmation = { DCISType: opt.sig === 'adult' ? '3' : '2' };
    /* 💵 COD (Collect on Delivery) — 미국은 박스 단위. 금액 전부를 첫 박스에 (옛 앱과 같음) · 0 = 체크 · 캐셔스 체크 · 머니 오더 (스크립트 속성 UPS_COD_FUNDS 로 8 가능) */
    if (!rate && i === 0 && q.cod && Number(q.cod.valor) > 0) so.COD = { CODFundsCode: String(prop_('UPS_COD_FUNDS') || '0'), CODAmount: { CurrencyCode: 'USD', MonetaryValue: Number(q.cod.valor).toFixed(2) } };
    if (Object.keys(so).length) o.PackageServiceOptions = so;
    if (!rate) { const refs = [b.ref1 || (b.invs || []).join(' ') || q.ref, b.ref2].map(x => clip_(x, 35)).filter(Boolean); if (refs.length) o.ReferenceNumber = refs.map(v => ({ Value: v })); }
    return o;
  });
  const sh = {
    Description: clip_(q.desc || 'JEWELRY & ACCESSORIES', 50),
    Shipper: Object.assign(party(f, addr_(f)), { ShipperNumber: acct }),
    ShipFrom: party(f, addr_(f)),
    ShipTo: party(to, toAddr),
    Service: { Code: String(q.svc || '03') },
    Package: pk
  };
  if (to.email && !rate) sh.ShipTo.EMailAddress = String(to.email).substring(0, 50);
  const sso = {};
  if (opt.sat) sso.SaturdayDeliveryIndicator = '';
  if (opt.notify && to.email && !rate) sso.Notification = [{ NotificationCode: '6', EMail: { EMailAddress: [String(to.email)] } }];
  if (Object.keys(sso).length) sh.ShipmentServiceOptions = sso;
  if (rate) { sh.PaymentDetails = { ShipmentCharge: [charge] }; sh.ShipmentRatingOptions = { NegotiatedRatesIndicator: '' }; }
  else sh.PaymentInformation = { ShipmentCharge: [charge] };
  return sh;
}
function ship_(q, from) {
  const ref = clip_(q.ref, 35);
  const body = { ShipmentRequest: { Request: { RequestOption: 'nonvalidate', TransactionReference: { CustomerContext: ref } }, Shipment: suShipExtra_(shipment_(q, from, false)),
    LabelSpecification: suLabelSpec_(q) } };   // 🏪 라벨 형식 (GIF · ZPL · PDF) · 협상 요금 · 주소 한 줄 — 아래 블록
  const j = upsFetch_('/api/shipments/v2403/ship', 'post', body);
  const R = j.ShipmentResponse.ShipmentResults, pk = [].concat(R.PackageResults || []);
  const neg = Number((((R.NegotiatedRateCharges || {}).TotalCharge) || {}).MonetaryValue || 0);
  const charge = neg || Number(((R.ShipmentCharges || {}).TotalCharges || {}).MonetaryValue || 0);
  return Object.assign({ shipId: R.ShipmentIdentificationNumber, charge, labels: pk.map(p => ({ trk: p.TrackingNumber, img: (p.ShippingLabel || {}).GraphicImage || '', fmt: suFmt_(q) })) }, suShipMeta_(R));
}
/** 💲 서비스별 요금 (Shop) — [{ svc, name, total, list, days }] 싼 순 */
function rates_(q, from) {
  const j = upsFetch_('/api/rating/v2403/Shop', 'post', { RateRequest: { Request: { RequestOption: 'Shop' }, Shipment: shipment_(q, from, true) } });
  return [].concat(((j.RateResponse || {}).RatedShipment) || []).map(r => {
    const list = Number(((r.TotalCharges || {}).MonetaryValue) || 0), neg = Number((((r.NegotiatedRateCharges || {}).TotalCharge) || {}).MonetaryValue || 0);
    const code = String((r.Service || {}).Code || '');
    return { svc: code, name: SVC_[code] || ('UPS ' + code), total: neg || list, list, days: String(((r.GuaranteedDelivery || {}).BusinessDaysInTransit) || '') };
  }).sort((a, b) => a.total - b.total);
}
/** 📦 라벨이 나오면 박스마다 shipments/{트래킹} 기록 — 어느 인보이스가 어느 박스로 나갔는지 */
function saveShipments_(q, r) {
  const boxes = q.boxes || [], n = r.labels.length, d = iso_().substring(0, 10);
  r.labels.forEach((l, i) => { const b = boxes[i] || {}; try { fsPatch_('shipments', l.trk, { shipId: r.shipId || '', lead: (r.labels[0] || {}).trk || '', cost: i === 0 ? (Number(r.charge) || 0) : 0, cod: i === 0 && q.cod && Number(q.cod.valor) > 0 ? Number(q.cod.valor) : 0, adhocId: q.adhocId || '', trk: l.trk, orderId: q.orderId || '', no: q.no || '', acct: q.acct || '', store: q.store || '', sm: q.sm || '', invs: (b.invs && b.invs.length ? b.invs : (q.invs || [])), box: i + 1, boxes: n, w: Number(b.w) || 0, dims: [b.l, b.wd, b.h].filter(Number).join('×'), svc: String(q.svc || '03'), svcName: SVC_[String(q.svc || '03')] || '', shipDate: d, to: [q.to && q.to.addr1, q.to && q.to.city, q.to && q.to.state, q.to && q.to.zip].filter(Boolean).join(', '), by: q.by || '', src: 'app', env: env_(), status: 'Label created', trkSt: 'open', delivered: false, at: iso_() }); } catch (e) {} });
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
/* ============================================================
 *  ↩ UPS 반품 라벨 (옛 ups-retorno · ReturnService 9 = Print Return Label) — 한 번에 박스 하나 · 라벨 하나
 *    Shipper = 우리(돈 내는 계정) · ShipFrom = 손님(박스가 나오는 곳 — 반품에선 꼭 있어야 함) · ShipTo = 우리 창고(ATTN RETURNS)
 *    q = { to:{name, attn, phone, addr1, addr2, city, state, zip}, box:{w, l, wd, h}, svc, desc, shp, acct, store, sm, retDe, retDeShp, by }
 * ============================================================ */
function retShipment_(q, from, acct) {
  const to = q.to || {}, b = q.box || {}, f = Object.assign({}, from || {});
  if (!to.addr1 || !to.city || !to.state || !to.zip) throw new Error('손님 주소가 부족합니다 (주소 · 도시 · 주 · ZIP)');
  const desc = clip_(q.desc || 'JEWELRY', 35);
  if (!desc) throw new Error('반품 내용을 적어 주세요');
  if (!(Number(b.w) > 0) || !(Number(b.l) > 0 && Number(b.wd) > 0 && Number(b.h) > 0)) throw new Error('무게 · 치수가 잘못되었습니다');
  const party = (x, ad) => ({ Name: clip_(x.name, 35), AttentionName: clip_(x.attn || x.name, 35), Phone: { Number: phone_(x.phone) }, Address: ad });
  return {
    Description: desc,
    ReturnService: { Code: '9' },
    Shipper: Object.assign(party(f, addr_(f)), { ShipperNumber: acct }),
    ShipFrom: party(to, addr_(to)),
    ShipTo: Object.assign(party(f, addr_(f)), { AttentionName: 'RETURNS' }),
    PaymentInformation: { ShipmentCharge: [{ Type: '01', BillShipper: { AccountNumber: acct } }] },
    Service: { Code: String(q.svc || '03') },
    ShipmentRatingOptions: { NegotiatedRatesIndicator: '' },
    Package: [{ Description: desc, Packaging: { Code: '02' },
      Dimensions: { UnitOfMeasurement: { Code: 'IN' }, Length: String(Math.ceil(b.l)), Width: String(Math.ceil(b.wd)), Height: String(Math.ceil(b.h)) },
      PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: String(Math.max(1, Math.ceil(Number(b.w)))) } }]
  };
}
function shipReturn_(q, from) {
  const body = { ShipmentRequest: { Request: { RequestOption: 'nonvalidate', TransactionReference: { CustomerContext: clip_('RETURN ' + (q.shp || q.acct || ''), 35) } }, Shipment: retShipment_(q, from, prop_('UPS_ACCOUNT')),
    LabelSpecification: { LabelImageFormat: { Code: 'GIF' }, HTTPUserAgent: 'Mozilla/4.5' } } };
  const j = upsFetch_('/api/shipments/v2403/ship', 'post', body);
  const R = j.ShipmentResponse.ShipmentResults, pk = [].concat(R.PackageResults || []);
  const neg = Number((((R.NegotiatedRateCharges || {}).TotalCharge) || {}).MonetaryValue || 0), list = Number(((R.ShipmentCharges || {}).TotalCharges || {}).MonetaryValue || 0);
  return { shipId: R.ShipmentIdentificationNumber, charge: neg || list, list, billW: Number(((R.BillingWeight || {}).Weight) || 0), labels: pk.map(p => ({ trk: p.TrackingNumber, img: (p.ShippingLabel || {}).GraphicImage || '' })) };
}
/** 반품 라벨이 나오면 shipments/{트래킹} — ret:true · retJob(이 shipq 문서: 다시 인쇄 · 취소) · retDe(원래 출고) */
function saveReturn_(q, r) {
  const b = q.box || {}, to = q.to || {}, svc = String(q.svc || '03');
  r.labels.forEach((l, i) => { try { fsPatch_('shipments', l.trk, { shipId: r.shipId || '', lead: (r.labels[0] || {}).trk || '', cost: i === 0 ? (Number(r.charge) || 0) : 0, list: i === 0 ? (Number(r.list) || 0) : 0, dw: Number(r.billW) || 0, cod: 0, adhocId: '', retJob: q._id, ret: true, retDe: q.retDe || '', retDeShp: q.retDeShp || '', retDesc: q.desc || '', shp: q.shp || '', carrier: 'UPS', trk: l.trk, orderId: '', no: q.shp || '', acct: q.acct || '', store: q.store || '', sm: q.sm || '', invs: [], box: i + 1, boxes: r.labels.length, w: Number(b.w) || 0, dims: [b.l, b.wd, b.h].filter(Number).join('×'), svc, svcName: SVC_[svc] || '', shipDate: iso_().substring(0, 10), to: [to.addr1, to.city, to.state, to.zip].filter(Boolean).join(', '), city: to.city || '', state: to.state || '', zip: to.zip || '', by: q.by || '', src: 'app', env: env_(), status: 'Label created', trkSt: 'open', delivered: false, at: iso_() }); } catch (e) {} });
}
/** 받는 주소 정리 — 쉼표 · 세미콜론 · 빈칸으로 나눔, 같은 주소는 한 번, 틀린 주소는 따로 (옛 emailsLimpar) */
function emailsLimpar_(lista) {
  const vistos = {}, bons = [], ruins = [];
  [].concat(lista || []).join(',').split(/[,;\s]+/).filter(Boolean).forEach(e => { if (!/^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/.test(e)) { ruins.push(e); return; } const k = e.toLowerCase(); if (!vistos[k]) { vistos[k] = 1; bons.push(e); } });
  return { bons, ruins };
}
/** 메일 본문 (영어 — 손님은 미국) · 제목 · 글은 고정 */
function retMailHtml_(trks) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222"><p><b>UPS RETURN LABEL</b></p><p>Tracking: ' + trks.join(', ') + '</p><ol>' +
    '<li>Print the attached label at actual size (100%). Do not scale it to fit.</li><li>Tape it flat on the box. Cover or remove any old labels.</li><li>Drop the box at any UPS location, or hand it to a UPS driver.</li></ol><p>Shipping is paid by THE ONE CORP.</p></div>';
}
function mailReturn_(q) {
  const v = emailsLimpar_(q.emails);
  if (v.ruins.length) throw new Error('잘못된 이메일: ' + v.ruins.join(', '));
  if (!v.bons.length) throw new Error('이메일이 없습니다');
  if (v.bons.length > 10) throw new Error('한 번에 최대 10개');
  const job = fsGet_('shipq', q.job || '');
  if (!job || job.kind !== 'ret' || job.st !== 'retdone') throw new Error('반품 라벨이 아닙니다');   /* 이 길로는 반품 라벨만 — 아무 메일이나 보내는 통로가 되지 않게 */
  const L = [].concat(job.labels || []).filter(l => l && l.img);
  if (!L.length) throw new Error('저장된 라벨이 없습니다');
  const atts = L.map(l => Utilities.newBlob(Utilities.base64Decode(l.img), 'image/gif', 'UPS-RETURN-' + l.trk + '.gif'));
  try {   /* 일반 프린터용 PDF (라벨 4×6 in 실제 크기) — 안 되면 GIF 만 */
    const html = '<html><body style="margin:0">' + L.map(l => '<div style="page-break-after:always;padding:36px"><img src="data:image/gif;base64,' + l.img + '" style="width:4in;height:6in"><p style="font-family:Arial;font-size:11px">UPS RETURN LABEL · Tracking ' + l.trk + ' · Print at 100%</p></div>').join('') + '</body></html>';
    atts.unshift(Utilities.newBlob(html, 'text/html', 'label.html').getAs('application/pdf').setName('UPS-RETURN-' + L[0].trk + '.pdf'));
  } catch (e) {}
  MailApp.sendEmail({ to: v.bons.join(','), subject: 'UPS Return Label — THE ONE CORP · ' + L.map(l => l.trk).join(', '), htmlBody: retMailHtml_(L.map(l => l.trk)), name: 'THE ONE CORP', attachments: atts });
  return { para: v.bons.join(', ') };
}
function voidShip_(shipId) { if (!shipId) throw new Error('취소할 출고 번호가 없습니다'); upsFetch_('/api/shipments/v2403/void/cancel/' + encodeURIComponent(shipId), 'delete'); }

/* ============================================================
 *  📡 Quantum View — 회사 UPS 계정으로 나간 모든 출고(어느 프로그램에서 찍었든) · 배달 기록을 받아 앱 주문에 붙임
 *   ups.com 에서 Quantum View 구독(Outbound)을 만들고 그 이름을 스크립트 속성 UPS_QV_NAME 에 넣으면 1시간마다 돎.
 *   · 출고(Manifest): 참조 번호에 인보이스(A41921 · P-008312) · 주문 번호가 있으면 그 주문, 없으면 받는 가게 이름 + 날짜로 찾음
 *     → 주문에 트래킹 추가, "인보이스 발행 · 포장 대기" 였으면 "📮 픽업 대기" 로 (UPS 트럭에 넘기는 것은 앱의 📮 UPS 픽업에서)
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
  /* 📦 박스 기록 — 다른 프로그램(직원 앱)에서 찍은 출고도 가게 · 인보이스별 배송 조회에 나오게 */
  const invTok = []; refs.forEach(r => String(r).toUpperCase().split(/[\s,;\/]+/).forEach(t => { if (/^[A-Z]{1,3}-?\d{3,7}$/.test(t) && invTok.indexOf(t) < 0) invTok.push(t); }));
  let acct = o.acct || '', sm = o.sm || '', st0 = o.store || store;
  if (!acct && invTok.length) { const iv = fsGet_('invoices', invTok[0]); if (iv) { acct = iv.acct || ''; sm = iv.sm || ''; st0 = iv.store || st0; } }
  trks.forEach((t, i) => { const ex = fsGet_('shipments', t); if (ex && ex.src === 'app') return; fsPatchDoc_('shipments', t, { trk: t, orderId: orderId || '', no: o.no || '', acct, store: st0, sm, invs: invTok.length ? invTok : (o.invs || []), box: i + 1, boxes: trks.length, w: Number(((pk[i] || {}).PackageWeight || {}).Weight || 0), svc: (m.Service || {}).Code || '', svcName: SVC_[(m.Service || {}).Code] || '', shipDate: d, to: [L[0], a.City, a.StateProvinceCode, a.PostalCode].filter(Boolean).join(', '), src: 'qv', status: 'Shipped', trkSt: 'open', delivered: false, at: iso_() }); });
  if (!orderId) return false;
  const have = String(o.track || '').split(/\s+/).filter(Boolean), add = trks.filter(t => have.indexOf(t) < 0);
  const patch = { updatedAt: iso_() };
  if (add.length) { patch.track = have.concat(add).join(' '); patch.shipVia = 'UPS'; patch.boxes = have.length + add.length; }
  if (o.st === 'done') { patch.st = 'packed'; patch.packAt = iso_(); patch.packBy = 'UPS 기록 (자동)'; }   // 다른 프로그램 라벨 → 📮 픽업 대기 (트럭 인계는 앱에서)
  if (Object.keys(patch).length > 1) fsPatchDoc_('orders', orderId, patch);
  return true;
}
function qvDelivery_(d) {
  const t = d.TrackingNumber; if (!t) return;
  const log = fsGet_('upsLog', t), when = String(d.Date || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
  fsPatchDoc_('upsLog', t, { delivered: when || iso_().substring(0, 10), deliveredTo: String(d.DeliveryLocation && d.DeliveryLocation.SignedForByName || '') });
  if (log && log.orderId) fsPatchDoc_('orders', log.orderId, { deliveredAt: when || iso_().substring(0, 10) });
  try { if (fsGet_('shipments', t)) fsPatchDoc_('shipments', t, { delivered: true, deliveredAt: when || iso_().substring(0, 10), status: 'Delivered', trkSt: 'done' }); } catch (e) {}
}
/* ============================================================
 *  📦 배송 조회 (UPS Tracking API) — track_ 한 개, updShipment_ 기록 갱신, trackSync 3시간마다 배달 안 된 것
 * ============================================================ */
const ymd_ = s => String(s || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
const hm_ = s => String(s || '').replace(/^(\d{2})(\d{2}).*/, '$1:$2');
function track_(trk) {
  /* 실제 서버에 묻고, 시험 라벨(1ZXXXXXXXXXXXXXXXX)이거나 실제 서버 권한이 없으면 시험 서버로 */
  const path = '/api/track/v1/details/' + encodeURIComponent(trk) + '?locale=en_US&returnSignature=false';
  let j, used = 'live';
  if (trackEnv_() === 'test' || /^1ZX{16}$/.test(trk)) { used = 'test'; j = upsFetch_(path, 'get', null, 'test'); }
  else { try { j = upsFetch_(path, 'get', null, 'live'); } catch (e) { if (env_() === 'test' && /UPS 40[13]|로그인 실패/.test(String(e.message))) { try { used = 'test'; j = upsFetch_(path, 'get', null, 'test'); } catch (e2) { throw new Error(String(e.message) + ' — UPS 개발자 앱에 Production 권한이 없으면 실제 운송장은 조회할 수 없습니다'); } } else throw e; } }
  const sh = (((j.trackResponse || {}).shipment) || [])[0] || {}, k = [].concat(sh.package || [])[0] || {};
  if (!k.trackingNumber && sh.warnings) throw new Error([].concat(sh.warnings).map(w => w.message).join(' / ') || '조회 결과 없음');
  const ev = [].concat(k.activity || []).map(a => { const ad = ((a.location || {}).address) || {}, st = a.status || {}; return { d: ymd_(a.date), t: hm_(a.time), st: st.type || '', desc: st.description || '', loc: [ad.city, ad.stateProvince, ad.country].filter(Boolean).join(', ') }; });
  const cur = k.currentStatus || {}, dd = [].concat(k.deliveryDate || []), del = dd.find(x => x.type === 'DEL'), sdd = dd.find(x => x.type === 'SDD' || x.type === 'RDD');
  const delivered = (ev[0] && ev[0].st === 'D') || /delivered/i.test(cur.description || '');
  return { status: cur.description || (ev[0] || {}).desc || '', code: cur.code || '', delivered, deliveredAt: delivered ? (del ? ymd_(del.date) : (ev[0] || {}).d || '') : '', eta: !delivered && sdd ? ymd_(sdd.date) : '', receivedBy: ((k.deliveryInformation || {}).receivedBy) || '', dlvLoc: ((k.deliveryInformation || {}).location) || '', events: ev.slice(0, 40), svcName: ((k.service || {}).description) || '', w: Number(((k.weight || {}).weight) || 0) || undefined, env: used, at: iso_() };
}
/** 조회 결과를 shipments 기록에 (있을 때만) · 배달되면 주문에도 */
function updShipment_(trk, r) {
  if (!r || r.err) return;
  const old = fsGet_('shipments', trk); if (!old) return;
  const p = { status: r.status, events: r.events, delivered: !!r.delivered, deliveredAt: r.deliveredAt || '', eta: r.eta || '', receivedBy: r.receivedBy || '', dlvLoc: r.dlvLoc || '', trkAt: r.at, trkSt: r.delivered ? 'done' : 'open' };
  fsPatch_('shipments', trk, p);
  if (r.delivered && old.orderId) { try { fsPatch_('orders', old.orderId, { deliveredAt: r.deliveredAt || iso_().substring(0, 10) }); } catch (e) {} }
}
/** 3시간마다 — 배달 안 된 박스만 조회 (30일 지난 것은 그만) */
function trackSync() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  try {
    let L = []; try { L = fsQuery_('shipments', 'trkSt', 'open', 150); } catch (e) { if (/ 429/.test(String(e.message))) { Logger.log('Firestore 한도 초과 — 다음에'); return; } throw e; }
    const old = iso_().substring(0, 10), t0 = Date.now(); let n = 0, dl = 0;
    L.forEach(x => {
      if (Date.now() - t0 > 5 * 60 * 1000) return;
      if (x.shipDate && (new Date(old) - new Date(x.shipDate)) / 86400000 > 30) { fsPatch_('shipments', x._id, { trkSt: 'old' }); return; }
      try { const r = track_(x._id); updShipment_(x._id, r); n++; if (r.delivered) dl++; } catch (e) {}
    });
    Logger.log('📦 배송 조회 ' + n + '개 · 배달 완료 ' + dl);
  } finally { lock.releaseLock(); }
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
/** 🗺 지도 좌표 — 처음부터 다시: "바뀐 거래처 없음 — 건너뜀" 이 나와도 전부 확인하고, 좌표가 없는 가게(전에 못 찾은 곳 포함)를 다시 찾음 */
function geoForce() { PropertiesService.getScriptProperties().deleteProperty('GEO_DONE'); geoRun_(true); }
function geoSync() { geoRun_(false); }   // 6시간마다 (트리거) — 새 · 바뀐 주소만
function geoRun_(force) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  const t0 = Date.now();
  try {
    /* 거래처가 바뀌지 않았으면 읽지 않음 (Firestore 읽기 아끼기) — settings/app.accountsVer 를 지난번과 비교 */
    const P = PropertiesService.getScriptProperties(), st = fsGet_('settings', 'app') || {}, ver = String(st.accountsVer || '');
    if (!force && P.getProperty('GEO_DONE') === '1' && P.getProperty('GEO_VER') === ver) { Logger.log('🗺 바뀐 거래처 없음 — 건너뜀 (처음부터 다시 하려면 geoForce 실행)'); return; }
    const all = fsListAll_('accounts'), todo = all.filter(a => { const q = geoQ_(a); return q && (a.geoQ !== q || (force && !(Number(a.lat) && Number(a.lng)))); });
    Logger.log('🗺 거래처 ' + all.length + '곳 · 좌표 찾을 곳 ' + todo.length);
    let ok = 0, bad = 0, stop = ''; const errs = {};
    const save = (a, r) => { const q = geoQ_(a); try { if (r.lat != null) { fsPatch_('accounts', a._id, { lat: r.lat, lng: r.lng, geoQ: q, geoErr: '', geoSrc: r.src, geoAt: iso_() }); ok++; } else { fsPatch_('accounts', a._id, { geoQ: q, geoErr: r.err, lat: null, lng: null }); errs[r.err] = (errs[r.err] || 0) + 1; bad++; } } catch (e) { errs[String(e.message)] = (errs[String(e.message)] || 0) + 1; } };
    /* ① Census 일괄 (1,000곳 15초쯤) 먼저 전부 → ② 못 찾은 곳만 구글로 한 곳씩 (Census 한 곳씩 다시 묻지 않음 — 일괄이 이미 못 찾은 주소) */
    const left = [];
    for (let i = 0; i < todo.length; i += 1000) {
      if (Date.now() - t0 > 4 * 60 * 1000) { stop = '시간 (4분)'; break; }
      const part = todo.slice(i, i + 1000);
      let hit = {}; try { hit = censusBatch_(part); } catch (e) { errs[String(e.message)] = 1; }
      for (const a of part) { if (hit[a._id]) save(a, { lat: hit[a._id][0], lng: hit[a._id][1], src: 'census' }); else left.push(a); }
    }
    for (const a of left) {
      if (stop) break;
      if (Date.now() - t0 > 4.5 * 60 * 1000) { stop = '시간 (4분 30초)'; break; }
      const r = googleGeo_(a);
      if (r.quota) { stop = '구글 하루 한도'; break; }
      save(a, r);
    }
    /* 찾은 게 있으면 멈췄어도 버전을 올림 — 폰들이 지금까지 찾은 좌표를 바로 받게 (전에는 다 끝나야 올려서 오래 걸리면 지도가 빈 채로 남았음) */
    let v = ver;
    if (ok || bad || P.getProperty('GEO_PENDING') === '1') v = String(Date.now());
    const tset = new Set(todo), have = all.filter(a => Number(a.lat) && Number(a.lng) && !tset.has(a)).length + ok, noAddr = all.filter(a => !geoQ_(a)).length;
    const geo = { at: iso_(), total: all.length, have, noAddr, ok, bad, left: stop ? todo.length - ok - bad : 0, stop, err: Object.keys(errs).slice(0, 3).map(k => k + ' ×' + errs[k]).join(' · ') };
    fsPatch_('settings', 'app', v !== ver ? { accountsVer: v, geo } : { geo });
    P.setProperties({ GEO_VER: v, GEO_DONE: stop ? '0' : '1', GEO_PENDING: '0' });
    Logger.log('🗺 찾음 ' + ok + ' · 못 찾음 ' + bad + ' · 좌표 있는 가게 ' + have + '/' + all.length + (stop ? ' · 멈춤(' + stop + ') — 다음 실행 때 이어서' : ' · 끝'));
    Object.keys(errs).slice(0, 5).forEach(k => Logger.log('  이유: ' + k + ' × ' + errs[k]));
  } catch (e) { if (/ 429/.test(String(e.message))) { Logger.log('🗺 Firestore 하루 무료 한도 초과 — 한도가 다시 차면 다음 실행 때 이어서 합니다'); return; } Logger.log('🗺 geoSync 오류: ' + (e && e.message || e)); throw e; }
  finally { lock.releaseLock(); }
}
/** 구글 Maps (Apps Script) 로 한 곳 — Census 일괄이 못 찾은 주소용 */
function googleGeo_(a) {
  const one = [a.addr, a.city, a.state, a.zip].map(x => String(x || '').trim()).filter(Boolean).join(', ');
  try {
    const g = Maps.newGeocoder().setRegion('us').geocode(one + ', USA');
    if (g && g.status === 'OK' && g.results && g.results.length) { const l = g.results[0].geometry.location; return { lat: l.lat, lng: l.lng, src: 'google' }; }
    return { err: String((g && g.status) || 'NOT_FOUND') };
  } catch (e) { return { err: String(e && e.message || e).substring(0, 120), quota: /too many|quota|limit/i.test(String(e && e.message)) }; }
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

/* ============================================================
 *  🏪 Shipping UPS 카운터 — 옛 WMS 의 서버 함수(ups-etiqueta · ups-cotar · ups-ambiente · ups-cancelar)와 맞춘 것
 *    (이 블록만 더함 · 위의 run · ship_ 에는 이 함수들을 부르는 한 줄씩만)
 *    · env 일 (shipq st:'env' → 'envdone' { env, cred, defined }) — 옛 ups-ambiente: UPS 에 묻지 않고 test/live 와 키가 있는지만
 *    · 라벨 형식 q.fmt (없으면 settings/app.ups.labelFmt, 없으면 GIF) — 옛 ups-etiqueta 처럼 ZPL(4×6) · PDF 도. 앱은 GIF 는 인쇄, ZPL · PDF 는 내려받기
 *    · 라벨에 협상 요금 요청 (NegotiatedRatesIndicator) · 공시 요금 · 청구 무게(BillingWeight) 도 적음 — 화면 · 기록의 운임이 청구서와 같게
 *    · 받는 주소: 주소 2(STE 105)를 35자 안이면 거리 줄 뒤에 한 줄로 (옛 v17 — UPS 라벨은 2번째 줄을 위에 찍어 아무도 못 봄)
 *    · 요금: Shoptimeintransit(도착일 · 영업일) 먼저, 안 되면 원래 Shop(rates_) · 토요일 배달 줄은 뺌 (라벨이 토요일을 안 고르면 화면 값 ≠ 청구 값)
 *    · void: UPS 가 "이미 취소됨(190117)" 이면 성공으로 (옛 ups-cancelar v5)
 *    · 라벨은 나왔는데 shipq 에 적지 못하면 error 에 트래킹 · 라벨을 같이 (orphan) — 앱이 "다시 누르지 말고 트래킹을 적어 두세요" 창
 * ============================================================ */
const SU_EXTRA_ST_ = ['env'];
const SU_FMTS_ = ['GIF', 'ZPL', 'PDF'];
/** 라벨 형식 — 요청의 fmt → 설정 settings/app.ups.labelFmt → GIF (한 번 정하면 q.fmt 에 둠) */
function suFmt_(q) {
  q = q || {};
  let f = String(q.fmt || '').toUpperCase();
  if (SU_FMTS_.indexOf(f) < 0) { try { const s = fsGet_('settings', 'app') || {}; f = String((s.ups && s.ups.labelFmt) || '').toUpperCase(); } catch (e) { f = ''; } }
  q.fmt = SU_FMTS_.indexOf(f) < 0 ? 'GIF' : f;
  return q.fmt;
}
/** LabelSpecification — GIF 는 원래와 똑같이 · ZPL 은 4×6 감열지 · PDF 는 그대로 (옛 ups-etiqueta 와 같음) */
function suLabelSpec_(q) {
  const f = suFmt_(q);
  if (f === 'ZPL') return { LabelImageFormat: { Code: 'ZPL' }, LabelStockSize: { Height: '6', Width: '4' } };
  if (f === 'PDF') return { LabelImageFormat: { Code: 'PDF' } };
  return { LabelImageFormat: { Code: 'GIF' }, HTTPUserAgent: 'Mozilla/4.5' };
}
/** 라벨 요청에 더하는 것 — 협상 요금 · 받는 주소 2 를 한 줄로 */
function suShipExtra_(sh) {
  sh.ShipmentRatingOptions = { NegotiatedRatesIndicator: '' };
  const A = sh.ShipTo && sh.ShipTo.Address, L = A && A.AddressLine;
  if (L && L.length === 2) {
    const rua = String(L[0] || ''), comp = String(L[1] || '');
    if (rua && comp && rua.indexOf(comp) >= 0) A.AddressLine = [rua];
    else if (rua && comp && (rua + ' ' + comp).length <= 35) A.AddressLine = [rua + ' ' + comp];
  }
  return sh;
}
/** 라벨 응답에서 공시 요금 · 청구 무게 · 협상 여부 */
function suShipMeta_(R) {
  const neg = Number((((R.NegotiatedRateCharges || {}).TotalCharge) || {}).MonetaryValue || 0), list = Number(((R.ShipmentCharges || {}).TotalCharges || {}).MonetaryValue || 0);
  return { list: list || 0, neg: !!neg, billW: Number((R.BillingWeight || {}).Weight || 0) || 0 };
}
function suDoneExtra_(r) { return { list: r.list || 0, neg: !!r.neg, billW: r.billW || 0, fmt: ((r.labels || [])[0] || {}).fmt || 'GIF' }; }
/** 라벨은 UPS 에 생겼는데 그 뒤가 실패 — 트래킹 · 라벨을 error 에 남김 (r 이 없으면 빈 것) */
function suOrphan_(r) { return r && r.labels && r.labels.length ? { orphan: true, env: env_(), shipId: r.shipId || '', charge: r.charge || 0, track: r.labels.map(x => x.trk).join(' '), labels: r.labels } : {}; }
function suVoidOk_(shipId) { try { voidShip_(shipId); } catch (e) { if (/190117|already\s+voided/i.test(String(e && e.message || e))) return; throw e; } }
/** env 일 — 옛 ups-ambiente (UPS 에 묻지 않음 · 비밀값은 돌려주지 않음) */
function suEnvJob_() {
  const P = PropertiesService.getScriptProperties().getProperties();
  return { st: 'envdone', at: iso_(), err: '', env: env_(), defined: P.UPS_ENV != null && String(P.UPS_ENV).trim() !== '', cred: !!(P.UPS_CLIENT_ID && P.UPS_CLIENT_SECRET && P.UPS_ACCOUNT) };
}
/** 오늘 (플로리다) YYYYMMDD — 도착일은 이날 픽업 기준 */
function suPickupDay_() { return Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMdd'); }
/** 요금 + 도착일 — Shoptimeintransit 가 안 되면(앱에 Time in Transit 권한 없음 등) 원래 rates_ */
function suRates_(q, from) {
  try {
    const sh = shipment_(q, from, true);
    sh.DeliveryTimeInformation = { PackageBillType: '03', Pickup: { Date: suPickupDay_() } };
    const L = suRatesParse_(upsFetch_('/api/rating/v2403/Shoptimeintransit', 'post', { RateRequest: { Request: { RequestOption: 'Shoptimeintransit' }, Shipment: sh } }));
    if (L.length) return L;
  } catch (e) { Logger.log('Shoptimeintransit 안 됨 → Shop: ' + String(e && e.message || e).substring(0, 200)); }
  return rates_(q, from);
}
const suYmd_ = s => /^\d{8}$/.test(String(s || '')) ? String(s).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : '';
/** RateResponse → [{ svc, name, total, list, days, arrive, neg, billW }] 싼 순 · 토요일 도착 줄은 뺌 (순수 함수 — 시험 t260u) */
function suRatesParse_(j) {
  const sat = d => { if (!d) return false; const p = d.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() === 6; };
  return [].concat(((j && j.RateResponse) || {}).RatedShipment || []).map(r => {
    const code = String((r.Service || {}).Code || ''), list = Number(((r.TotalCharges || {}).MonetaryValue) || 0), neg = Number((((r.NegotiatedRateCharges || {}).TotalCharge) || {}).MonetaryValue || 0);
    const t = (r.TimeInTransit || {}).ServiceSummary || {}, ea = t.EstimatedArrival || {}, arrive = suYmd_((ea.Arrival || {}).Date);
    const days = String(ea.BusinessDaysInTransit || ((r.GuaranteedDelivery || {}).BusinessDaysInTransit) || '');
    return { svc: code, name: SVC_[code] || ('UPS ' + code), total: neg || list, list, days, arrive, neg: !!neg, billW: Number((r.BillingWeight || {}).Weight || 0) || 0, sat: String(t.SaturdayDelivery || '') === '1' || sat(arrive) };
  }).filter(x => !x.sat).map(x => { delete x.sat; return x; }).sort((a, b) => a.total - b.total);
}
