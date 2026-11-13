/* ============================================================
 *  📥 공장 메일 받은편지 다리 — inbound@theonefl.com 계정에서 돌리는 작은 스크립트 (v0.8.227)
 *
 *  왜: 공장 인보이스는 inbound@ 메일함에 오는데, 앱에 넣는 스크립트(THE ONE Mail · Code.gs)는 관리자 계정에서 돎.
 *      관리자 메일함으로 전달하면 다른 메일과 섞여 찾기 어려움 → 전달하지 않고,
 *      inbound@ 가 새 메일을 드라이브 폴더 "THE ONE 공장 메일 받은편지 (inbound)" 에 한 통씩(JSON) 넣고,
 *      관리자 스크립트가 5분마다 그 폴더를 읽어 입고 예정으로 넣음 (Code.gs inboundRelayRun_).
 *      메일은 inbound@ 에만 남고 관리자 메일함에는 아무것도 오지 않음. Firestore 권한도 inbound@ 에 줄 필요 없음.
 *
 *  설치 (한 번만 — inbound@theonefl.com 으로 로그인한 브라우저에서):
 *   1) https://script.google.com → 새 프로젝트 → 이름 "THE ONE Inbound" → 이 파일 내용을 통째로 붙여 넣고 저장
 *   2) 위 함수 고르는 칸에서 relaySetup → ▶ 실행 → 권한 허용 (Gmail · 드라이브)
 *      → 폴더를 만들고 관리자(RELAY_SHARE)에게 편집 권한으로 공유 · 5분마다 relayRun 트리거 · 지금 한 번 실행
 *   3) 끝. 실행 기록(왼쪽 ☰ → 실행)에서 "📥 보냄 N통" 확인
 *
 *  메일에는 라벨 "THE ONE/앱으로 보냄" 이 붙고 다시 보내지 않음. 최근 30일 받은편지함만 봄.
 * ============================================================ */
const RELAY_FOLDER = 'THE ONE 공장 메일 받은편지 (inbound)';
const RELAY_LABEL = 'THE ONE/앱으로 보냄';
const RELAY_SHARE = 'luke@theonefl.com';   // 관리자 계정 (THE ONE Mail 스크립트 주인) — 폴더 편집 권한
const RELAY_ATT = /\.(xlsx|xls|csv)$/i;    // 앱이 읽는 첨부 — 그 밖의 첨부는 이름만 적음

function relayFolder_() {
  const it = DriveApp.getFoldersByName(RELAY_FOLDER);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(RELAY_FOLDER);
  try { if (!f.getEditors().some(u => u.getEmail() === RELAY_SHARE)) f.addEditor(RELAY_SHARE); } catch (e) { Logger.log('공유 실패: ' + e.message); }
  return f;
}
/** 한 번만 — 폴더 · 공유 · 5분 트리거 · 지금 한 번 */
function relaySetup() {
  relayFolder_();
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'relayRun') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('relayRun').timeBased().everyMinutes(5).create();
  relayRun();
}
/** 5분마다 — 새 메일을 폴더에 한 통씩 */
function relayRun() {
  const threads = GmailApp.search('in:inbox -label:"' + RELAY_LABEL + '" newer_than:30d', 0, 20);
  if (!threads.length) { Logger.log('📥 새 메일 없음'); return 0; }
  const folder = relayFolder_(), label = GmailApp.getUserLabelByName(RELAY_LABEL) || GmailApp.createUserLabel(RELAY_LABEL);
  let n = 0;
  threads.forEach(th => {
    th.getMessages().forEach(m => {
      const name = 'msg-' + m.getId() + '.json';
      if (folder.getFilesByName(name).hasNext()) return;   // 이미 보냄
      const all = m.getAttachments();
      const doc = { v: 1, id: m.getId(), subject: m.getSubject() || '', from: m.getFrom() || '', to: m.getTo() || '', date: m.getDate().toISOString(), body: m.getPlainBody() || '',
        atts: all.filter(a => RELAY_ATT.test(a.getName())).map(a => ({ name: a.getName(), type: a.getContentType(), b64: Utilities.base64Encode(a.getBytes()) })),
        other: all.filter(a => !RELAY_ATT.test(a.getName())).map(a => a.getName()) };
      folder.createFile(name, JSON.stringify(doc), 'application/json'); n++;
    });
    th.addLabel(label);
  });
  Logger.log('📥 보냄 ' + n + '통');
  return n;
}
