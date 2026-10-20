/**
 * THE ONE — 앱이 쓰는 사진만 "링크가 있는 모든 사용자 · 뷰어" 로 (파일은 그 자리 그대로, 옮기지 않음)
 *
 * 왜: 앱(github.io)은 회사 로그인으로 드라이브 사진을 못 읽음 → 사진마다 링크 공개가 필요.
 *     공유 드라이브 맨 위는 폴더째 공개할 수 없고, 드라이브 화면은 한 번에 50개씩만 바뀜.
 *     이 스크립트는 앱의 사진 목록(photo-index.json, 약 2,600장)만 골라 50개씩 한꺼번에 공유 설정을 바꿈 → 1~3분.
 *     파일 위치 · 이름은 그대로 → 지금 쓰는 프로그램(item_picture 경로) 영향 없음.
 *
 * 설치 · 실행 (luke@theonefl.com):
 *   1. script.google.com → THE ONE Photos → Code.gs 내용을 이걸로 전부 바꾸기 → 저장
 *   2. 함수 목록에서 run 고르고 ▶ 실행 (처음이면 드라이브 권한 허용)
 *      → 로그에 "공개로 바꿈 ○ · 실패 ○" 가 나오면 끝
 *   3. (선택) daily 실행 → 매일 새벽, 새로 생긴 사진도 자동 공개
 */
const INDEX_URL = 'https://theonecorp.github.io/the-one-app/data/photo-index.json';
const BATCH = 50;

function run() {
  DriveApp.getRootFolder();   // 드라이브 권한(scope)을 요청하게 하는 줄 — 지우지 마세요
  const idx = JSON.parse(UrlFetchApp.fetch(INDEX_URL + '?t=' + Date.now()).getContentText());
  const ids = Array.from(new Set(Object.values(idx.pic || {}).concat(Object.values(idx.gal || {}))));
  const token = ScriptApp.getOAuthToken(), t0 = Date.now();
  let ok = 0, fail = 0; const errs = {};
  for (let i = 0; i < ids.length; i += BATCH) {
    const part = ids.slice(i, i + BATCH);
    const reqs = part.map(id => ({
      url: 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id',
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ role: 'reader', type: 'anyone' }),
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
    }));
    UrlFetchApp.fetchAll(reqs).forEach((res, j) => {
      const c = res.getResponseCode();
      if (c === 200) ok++;
      else { fail++; const m = (c + ' ' + (res.getContentText().match(/"message":\s*"([^"]+)/) || [])[1]).substring(0, 160); errs[m] = (errs[m] || 0) + 1; if (errs[m] === 1) Logger.log('실패 예: ' + part[j] + ' → ' + m); }
    });
    if (Date.now() - t0 > 5 * 60 * 1000) { Logger.log('⏳ 시간 한도 — ' + (i + BATCH) + '/' + ids.length + ' 까지 함. run 을 한 번 더 실행하세요 (이미 된 것은 그대로)'); break; }
  }
  Logger.log('사진 ' + ids.length + '장 — 공개로 바꿈(또는 이미 공개) ' + ok + ' · 실패 ' + fail);
  Object.keys(errs).forEach(m => Logger.log('  실패 이유: ' + m + ' × ' + errs[m]));
}
/** 매일 새벽 4시 새 사진도 공개 (선택) — 한 번 실행하면 등록됨 */
function daily() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));   // 예전 버전의 이어 하기 트리거까지 정리
  ScriptApp.newTrigger('run').timeBased().everyDays(1).atHour(4).create();
  Logger.log('매일 새벽 4시에 새 사진을 공개로 바꿉니다');
}
/** 예전 버전(shareAll)이 남긴 트리거 정리용 — 필요하면 한 번 실행 */
function stopOld() { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() !== 'run').forEach(t => ScriptApp.deleteTrigger(t)); Logger.log('예전 트리거 정리 끝'); }
