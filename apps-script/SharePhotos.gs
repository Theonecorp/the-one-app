/**
 * THE ONE — 아이템 · 세트 사진을 "링크가 있는 모든 사용자 · 뷰어" 로 (파일은 그 자리 그대로)
 *
 * 왜: 앱(github.io)은 회사 로그인으로 드라이브 사진을 못 읽음 → 사진마다 링크 공개가 필요.
 *     공유 드라이브 맨 위(루트)는 폴더째 공개할 수 없고, 드라이브 화면은 한 번에 50개씩만 바뀜.
 *     이 스크립트는 파일을 옮기거나 이름을 바꾸지 않고 공유 설정만 바꿈 → 지금 쓰는 프로그램(item_picture 경로)은 그대로.
 *
 * 설치 (한 번만, luke@theonefl.com):
 *   1. script.google.com → 새 프로젝트 → 이름 "THE ONE Photos" → 이 내용을 Code.gs 에 붙여넣기
 *   2. 함수 목록에서 shareAll 고르고 ▶ 실행 → 권한 허용 (드라이브)
 *      · 5분마다 끊어서 이어 합니다 — 끝날 때까지 자동으로 1분 뒤 다시 돌고, 다 끝나면 스스로 멈춤
 *      · 실행 로그(보기 → 로그)에 드라이브별 "바꿈 · 이미 공개 · 건너뜀" 수가 나옵니다
 *   3. (선택) daily 실행 → 매일 새로 넣은 사진도 자동 공개
 */
const DRIVES = {
  '0AMfb0x3MT-Y9Uk9PVA': '아이템 사진 (item_picture)',
  '0AOMX-PS2qpa7Uk9PVA': '세트 사진 ①',
  '0AGJJPI2TJkDqUk9PVA': '세트 사진 ②'
};
const LIMIT_MS = 5 * 60 * 1000;   // Apps Script 한 번 실행 한도(6분)보다 조금 짧게

function shareAll() {
  const P = PropertiesService.getScriptProperties(), t0 = Date.now();
  const ids = Object.keys(DRIVES);
  let di = Number(P.getProperty('di') || 0);
  const stat = JSON.parse(P.getProperty('stat') || '{}');
  while (di < ids.length) {
    const id = ids[di], key = 'tok_' + id;
    const tok = P.getProperty(key);
    const files = tok ? DriveApp.continueFileIterator(tok) : DriveApp.getFolderById(id).getFiles();
    const s = stat[id] = stat[id] || { changed: 0, already: 0, skipped: 0, failed: 0 };
    walk_(files, s);
    if (Date.now() - t0 > LIMIT_MS) {   // 시간 다 됨 → 이어서 할 자리 저장, 1분 뒤 다시
      P.setProperty(key, files.getContinuationToken()); P.setProperty('di', String(di)); P.setProperty('stat', JSON.stringify(stat));
      resumeLater_(); log_(stat, false); return;
    }
    P.deleteProperty(key); di++;
  }
  P.deleteProperty('di'); P.deleteProperty('stat'); clearResume_();
  log_(stat, true);

  function walk_(files, s) {
    while (files.hasNext()) {
      if (Date.now() - t0 > LIMIT_MS) return;
      const f = files.next();
      if (String(f.getMimeType()).indexOf('image/') !== 0) { s.skipped++; continue; }
      try {
        if (f.getSharingAccess() === DriveApp.Access.ANYONE_WITH_LINK) { s.already++; continue; }
        f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); s.changed++;
      } catch (e) { s.failed++; if (s.failed <= 3) Logger.log('실패 ' + f.getName() + ': ' + e.message); }
    }
  }
}
/** 매일 새벽 새로 들어온 사진도 공개 (선택) — 한 번 실행하면 등록됨 */
function daily() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyRun').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyRun').timeBased().everyDays(1).atHour(4).create();
  Logger.log('매일 새벽 4시에 새 사진을 공개로 바꿉니다');
}
function dailyRun() { shareAll(); }
/* 이어 하기용 1회 트리거 (handler = shareAll). 매일 트리거(dailyRun)는 건드리지 않음 */
function resumeLater_() { clearResume_(); ScriptApp.newTrigger('shareAll').timeBased().after(60 * 1000).create(); }
function clearResume_() { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'shareAll').forEach(t => ScriptApp.deleteTrigger(t)); }
function log_(stat, done) {
  Object.keys(stat).forEach(id => { const s = stat[id]; Logger.log((DRIVES[id] || id) + ' — 바꿈 ' + s.changed + ' · 이미 공개 ' + s.already + ' · 사진 아님 ' + s.skipped + ' · 실패 ' + s.failed); });
  Logger.log(done ? '✅ 끝 — 모든 사진이 링크 공개입니다' : '⏳ 시간 한도 — 1분 뒤 자동으로 이어서 합니다');
}
