/**
 * THE ONE — 💾 매일 밤 회사 구글 드라이브로 자동 백업 (구글 Apps Script)
 *
 * 하는 일: 앱 데이터(Firestore — 주문 · 인보이스 · 수금 · 거래처 · 아이템 · 미수금 · 정산 · 사용자 …)를
 *          매일 새벽 2시에 전부 읽어 드라이브 "THE ONE 백업/2026-10-24/" 폴더에 컬렉션별 파일(.json.gz)로 저장.
 *          · 30일 치 매일 백업 + 매달 1일 백업은 12달 보관 (그보다 오래된 것은 휴지통으로)
 *          · 마친 시각 · 문서 수 · 폴더 링크를 Firestore settings/app.backup 에 적음 → 앱 관리 화면에 "💾 마지막 백업" 으로 보임
 *          · 6분 실행 한도에 걸리면 이어서 하기를 1분 뒤로 걸어 끝까지 함
 *          · 수금 리포트(reports)의 체크 사진은 용량이 커서 빼고 저장 (사진은 이미 메일로 감) — photosN 에 장 수만 남김
 *
 * 설치 (한 번만, luke@theonefl.com — 회사 드라이브 주인 계정으로):
 *   1. script.google.com → 새 프로젝트 "THE ONE 백업" → 이 내용을 Code.gs 에 붙여넣기 → 저장
 *   2. ⚙️ 프로젝트 설정 → "appsscript.json 매니페스트 파일 표시" 켜기 → 편집기의 appsscript.json 에 Backup.appsscript.json 내용 붙여넣기
 *   3. 함수 목록에서 setup 고르고 ▶ 실행 → 권한 허용 → 첫 백업을 바로 하고, 매일 새벽 2시 트리거가 생김
 *   4. 되살리기가 필요하면 관리자에게 — 파일은 그냥 JSON 이라 엑셀 · 다른 프로그램으로도 열 수 있음
 *      (.gz 는 7-Zip · 맥 기본 압축 풀기로 열림)
 */
const PROJECT = 'the-one-app-ff40e';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const ROOT_NAME = 'THE ONE 백업';
const KEEP_DAYS = 30, KEEP_MONTHS = 12;
const PART = 3000;             // 파일 하나에 문서 몇 개까지
const LIMIT_MS = 4.5 * 60000;  // 이만큼 넘으면 저장하고 1분 뒤 이어서

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  const t = ScriptApp.newTrigger('backupNow').timeBased().atHour(2).everyDays(1).inTimezone('America/New_York').create();
  PropertiesService.getScriptProperties().setProperty('BK_DAILY', t.getUniqueId());
  PropertiesService.getScriptProperties().deleteProperty('BK_STATE');
  backupNow();
  Logger.log('매일 새벽 2시 백업 트리거를 만들었습니다');
}

/** 매일 백업 (트리거) — 새로 시작하거나, 하다 만 것을 이어서 */
function backupNow() {
  const P = PropertiesService.getScriptProperties(), t0 = Date.now();
  let st = JSON.parse(P.getProperty('BK_STATE') || 'null');
  const today = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  const fresh = !st || !st.cont;
  if (fresh) st = { day: today, colls: listCollections_(), i: 0, page: '', part: 0, docs: 0, counts: {}, startedAt: new Date().toISOString() };
  const dayFolder = folder_(root_(), st.day);
  /* 같은 날 다시 처음부터 하면 그날 폴더를 비우고 */
  if (fresh) { const fi = dayFolder.getFiles(); while (fi.hasNext()) fi.next().setTrashed(true); }
  let rows = [];
  const flush = coll => {
    if (!rows.length) return;
    st.part++;
    const blob = Utilities.gzip(Utilities.newBlob(JSON.stringify(rows), 'application/json', coll + '.' + ('000' + st.part).slice(-4) + '.json'));
    dayFolder.createFile(blob.setName(coll + '.' + ('000' + st.part).slice(-4) + '.json.gz'));
    rows = [];
  };
  try {
    while (st.i < st.colls.length) {
      const coll = st.colls[st.i];
      const url = FS + '/' + encodeURIComponent(coll) + '?pageSize=300' + (st.page ? '&pageToken=' + encodeURIComponent(st.page) : '');
      const r = fetch_(url), docs = r.documents || [];
      docs.forEach(d => { const o = plain_({ mapValue: { fields: d.fields || {} } }); o._id = d.name.split('/').pop(); o._updated = d.updateTime;
        if (coll === 'reports' && o.photos) { o.photosN = o.photos.length; delete o.photos; }
        rows.push(o); });
      st.docs += docs.length; st.counts[coll] = (st.counts[coll] || 0) + docs.length;
      st.page = r.nextPageToken || '';
      if (rows.length >= PART || !st.page) flush(coll);
      if (!st.page) { st.i++; st.part = 0; }
      if (Date.now() - t0 > LIMIT_MS) {   // 6분 한도 전에 멈추고 이어서
        flush(coll); st.cont = true; P.setProperty('BK_STATE', JSON.stringify(st));
        ScriptApp.newTrigger('backupNow').timeBased().after(60 * 1000).create();
        return;
      }
    }
    /* 다 함 — 목록 파일 · 기록 · 오래된 것 정리 */
    dayFolder.createFile('_목록.json', JSON.stringify({ project: PROJECT, day: st.day, startedAt: st.startedAt, endedAt: new Date().toISOString(), docs: st.docs, counts: st.counts }, null, 1), 'application/json');
    P.deleteProperty('BK_STATE'); cleanTriggers_();
    prune_();
    writeStatus_({ at: new Date().toISOString(), day: st.day, docs: st.docs, colls: st.colls.length, url: dayFolder.getUrl(), ok: true, err: '' });
    Logger.log('💾 백업 끝: ' + st.docs + '개 문서, ' + st.colls.length + '개 컬렉션 → ' + dayFolder.getUrl());
  } catch (e) {
    /* 실패하면 다음 번에 처음부터 (반쯤 된 파일은 그때 지움) */
    P.deleteProperty('BK_STATE'); cleanTriggers_();
    writeStatus_({ at: new Date().toISOString(), day: st.day, ok: false, err: String(e.message || e).substring(0, 300) });
    throw e;
  }
}

/* ---------- Firestore ---------- */
function headers_() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT }; }
function fetch_(url, opt) {
  for (let k = 0; k < 4; k++) {
    const r = UrlFetchApp.fetch(url, Object.assign({ headers: headers_(), muteHttpExceptions: true }, opt || {}));
    const c = r.getResponseCode();
    if (c === 200) return JSON.parse(r.getContentText() || '{}');
    if (c === 429 || c >= 500) { Utilities.sleep(2000 * (k + 1)); continue; }
    throw new Error('Firestore ' + c + ': ' + r.getContentText().substring(0, 200));
  }
  throw new Error('Firestore 응답 없음 (여러 번 시도)');
}
function listCollections_() {
  let ids = [], token = '';
  do {
    const r = fetch_(FS + ':listCollectionIds', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ pageSize: 300, pageToken: token || undefined }) });
    ids = ids.concat(r.collectionIds || []); token = r.nextPageToken || '';
  } while (token);
  return ids.sort();
}
/** Firestore 값 → 보통 JSON */
function plain_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain_);
  if ('mapValue' in v) { const o = {}, f = v.mapValue.fields || {}; Object.keys(f).forEach(k => { o[k] = plain_(f[k]); }); return o; }
  return null;
}
/** settings/app.backup 에 결과 적기 (앱 관리 화면에 표시) */
function writeStatus_(b) {
  const fields = {}; Object.keys(b).forEach(k => { const x = b[k]; fields[k] = typeof x === 'number' ? { integerValue: String(x) } : typeof x === 'boolean' ? { booleanValue: x } : { stringValue: String(x == null ? '' : x) }; });
  try { fetch_(FS + '/settings/app?updateMask.fieldPaths=backup', { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields: { backup: { mapValue: { fields } } } }) }); }
  catch (e) { Logger.log('상태 기록 실패: ' + e.message); }
}

/* ---------- 드라이브 ---------- */
function root_() {
  const P = PropertiesService.getScriptProperties(), id = P.getProperty('BK_ROOT');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const it = DriveApp.getFoldersByName(ROOT_NAME), f = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME);
  P.setProperty('BK_ROOT', f.getId()); return f;
}
function folder_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
/** 30일 넘은 매일 백업은 지우고, 매달 1일 것은 12달 보관 */
function prune_() {
  const now = new Date(), it = root_().getFolders();
  while (it.hasNext()) {
    const f = it.next(), m = f.getName().match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), age = (now - d) / 86400000;
    const monthly = m[3] === '01';
    if ((!monthly && age > KEEP_DAYS) || (monthly && age > KEEP_MONTHS * 31)) f.setTrashed(true);
  }
}
function cleanTriggers_() { ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'backupNow' && t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK && !isDaily_(t)) ScriptApp.deleteTrigger(t); }); }
/* 이어서 하기용(1번만 도는) 트리거와 매일 트리거 구별 — setup 이 매일 트리거 id 를 기억해 둠 */
function isDaily_(t) { return t.getUniqueId() === PropertiesService.getScriptProperties().getProperty('BK_DAILY'); }
