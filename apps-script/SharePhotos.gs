/**
 * THE ONE — 앱이 쓰는 사진만 "링크가 있는 모든 사용자 · 뷰어" 로 (파일은 그 자리 그대로, 옮기지 않음)
 *
 * 왜: 앱(github.io)은 회사 로그인으로 드라이브 사진을 못 읽음 → 사진마다 링크 공개가 필요.
 *     파일 위치 · 이름은 그대로 → 지금 쓰는 프로그램(item_picture 경로) 영향 없음.
 *
 * v3: 구글이 공유 변경을 빠르게 많이 하면 막음(속도 제한) → 10장씩 천천히, 막히면 다시 시도.
 *     이미 공개된 사진은 건너뜀. 다 끝날 때까지 1분마다 스스로 이어서 돌고, 끝나면 멈춤.
 *
 * 실행 (luke@theonefl.com):
 *   1. script.google.com → THE ONE Photos → Code.gs 내용을 이걸로 전부 바꾸기 → 저장
 *   2. 함수 목록에서 run 고르고 ▶ 실행 — 끝날 때까지 1분마다 자동으로 이어 합니다 (창 닫아도 됨)
 *      실행 기록(☰ 왼쪽 메뉴)의 로그에 "남은 사진 ○장" 이 줄어들다가 "✅ 모두 공개" 가 나오면 끝
 *   3. (선택) daily 실행 → 매일 새벽, 새로 생긴 사진도 자동 공개
 */
const INDEX_URL = 'https://theonecorp.github.io/the-one-app/data/photo-index.json';
const LIMIT_MS = 4.5 * 60 * 1000;

function run() {
  DriveApp.getRootFolder();   // 드라이브 권한(scope)을 요청하게 하는 줄 — 지우지 마세요
  const t0 = Date.now();
  const idx = JSON.parse(UrlFetchApp.fetch(INDEX_URL + '?t=' + Date.now()).getContentText());
  const ids = Array.from(new Set(Object.values(idx.pic || {}).concat(Object.values(idx.gal || {}))));

  /* ① 로그인 없이 열리는지 먼저 확인 — 이미 공개된 건 건너뜀 (302 = 로그인 화면으로 보냄 = 아직 비공개) */
  const todo = [];
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    UrlFetchApp.fetchAll(part.map(id => ({ url: 'https://lh3.googleusercontent.com/d/' + id + '=w20', followRedirects: false, muteHttpExceptions: true })))
      .forEach((res, j) => { if (res.getResponseCode() !== 200) todo.push(part[j]); });
  }
  Logger.log('앱 사진 ' + ids.length + '장 중 아직 비공개 ' + todo.length + '장');
  if (!todo.length) { stopResume_(); Logger.log('✅ 모두 공개 — 끝'); return; }

  /* ② 10장씩 천천히 공유 추가, 속도 제한(403 · 429)이면 쉬었다가 다시 */
  const token = ScriptApp.getOAuthToken();
  let ok = 0, wait = 1000; const errs = {}, queue = todo.slice();
  while (queue.length && Date.now() - t0 < LIMIT_MS) {
    const part = queue.splice(0, 10);
    const res = UrlFetchApp.fetchAll(part.map(id => ({
      url: 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id',
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ role: 'reader', type: 'anyone' }),
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
    })));
    let limited = 0;
    res.forEach((r, j) => {
      const c = r.getResponseCode();
      if (c === 200) { ok++; return; }
      const msg = (r.getContentText().match(/"message":\s*"([^"]+)/) || [])[1] || '';
      if (c === 429 || (c === 403 && /rate|limit|quota/i.test(msg))) { limited++; queue.push(part[j]); return; }   // 나중에 다시
      const k = c + ' ' + msg.substring(0, 120); errs[k] = (errs[k] || 0) + 1;
    });
    wait = limited ? Math.min(wait * 2, 30000) : Math.max(1000, wait / 2);
    Utilities.sleep(wait);
  }
  const left = queue.length;
  Logger.log('이번에 공개로 바꿈 ' + ok + '장 · 남은 사진 ' + left + '장');
  Object.keys(errs).forEach(k => Logger.log('  바꿀 수 없음: ' + k + ' × ' + errs[k] + ' (지워졌거나 권한 없는 파일)'));
  if (left) { resumeLater_(); Logger.log('⏳ 1분 뒤 자동으로 이어 합니다'); }
  else { stopResume_(); Logger.log('✅ 모두 공개 — 끝'); }
}
/** 매일 새벽 4시 새 사진도 공개 (선택) — 한 번 실행하면 등록됨 */
function daily() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyRun').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyRun').timeBased().everyDays(1).atHour(4).create();
  Logger.log('매일 새벽 4시에 새 사진을 공개로 바꿉니다');
}
function dailyRun() { run(); }
/* 이어 하기용 1회 트리거 (handler = run). 매일 트리거(dailyRun)는 건드리지 않음 */
function resumeLater_() { stopResume_(); ScriptApp.newTrigger('run').timeBased().after(60 * 1000).create(); }
function stopResume_() { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() !== 'dailyRun').forEach(t => ScriptApp.deleteTrigger(t)); }
/** 예전 버전이 남긴 트리거 정리 — 필요하면 한 번 실행 */
function stopOld() { stopResume_(); Logger.log('예전 트리거 정리 끝'); }
