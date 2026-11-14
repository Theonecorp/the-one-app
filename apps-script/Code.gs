/**
 * THE ONE — Daily Collection Report 메일 보내기 (구글 Apps Script)
 *
 * 하는 일: 세일즈맨이 앱에서 "📧 Daily Report 전송" 을 누르면 Firestore reports 에 문서가 하나 생김(mail: 'wait').
 *          이 스크립트가 5분마다 그걸 찾아서 예전처럼 표 모양 이메일을 보냄 → 보낸 사람 + check@theonefl.com (설정의 담당자 알림 이메일)
 *          보낸 뒤 mail: 'sent' 로 표시. 실패하면 mail: 'error' + 이유 (관리 → 설정에서 보이고 다시 보내기 가능)
 *
 * 설치 (한 번만, luke@theonefl.com 으로):
 *   1. script.google.com → 새 프로젝트 → 이름 "THE ONE Mail"
 *   2. 이 파일 내용을 Code.gs 에 붙여넣기
 *   3. 프로젝트 설정(⚙️) → "appsscript.json 매니페스트 파일 표시" 켜기 → appsscript.json 에 같은 폴더의 appsscript.json 내용 붙여넣기
 *   4. 위 함수 목록에서 setup 고르고 ▶ 실행 → 권한 허용 (Firestore 읽기/쓰기 · 메일 보내기 · 트리거)
 *   5. testMail 실행 → 내 메일함에 시험 메일이 오면 끝
 *
 * ☁️ 사진 드라이브 저장(photoExportRun_): 앱에서 찍은 아이템 사진(photoUploads, drive: wait)을 공유 드라이브 item_picture 에 "코드.jpg" 로 올림 —
 *    같은 이름 파일이 있으면 그 파일 내용을 바꿈(링크 그대로) · 올린 뒤 사진 색인(catalog/photoIndex)에 바로 붙임 · 큐 문서의 사진 데이터는 지움
 *    스크립트 속성 PHOTO_UPLOAD_FOLDER_ID(기본: item_picture 공유 드라이브 루트). appsscript.json 의 drive 권한(쓰기) — setup 다시 ▶. testPhotoExport 로 바로 실행
 *
 * 💳 COD 시트 동기화(codSyncRun_): 구글시트 "THE ONE 수금 (SALES)" 의 COD 입력 탭을 5분마다 읽어 앱(Firestore cod)에 올림 — 사무실이 시트에 계속 적어도 앱 정산에 바로 보임.
 *    기본은 꺼짐(앱에서 직접 입력이 기준) — 시트를 계속 쓸 때만 스크립트 속성 COD_SYNC=on. COD_SHEET_ID(기본: 지금 쓰는 시트) · COD_TAB(기본 COD 입력). 시트 ID 칸이 비면 ID 를 만들어 시트에 써 둠(중복 없음). testCodSync 로 바로 실행.
 *    (appsscript.json 에 spreadsheets 권한 — setup 을 다시 ▶ 실행해 권한 허용)
 *
 * 🔔 앱 알림(notifyq): 1분마다 (notifyFast) — 받는 사람마다 ① 📱💻 팝업(웹 푸시: 앱을 닫아도 컴퓨터 · 폰에 뜸) ② 구글 챗 ③ 이메일
 *    · 세일즈맨에게 가는 것 → 그 세일즈맨 개인 방(CHAT_WEBHOOK_코드)에만. 개인 방이 없으면 챗은 보내지 않음 (단톡방으로 가지 않음)
 *    · 사무실 · 담당자에게 가는 것 → 사무실 방(CHAT_WEBHOOK_OFFICE, 없으면 CHAT_WEBHOOK)
 *    · 사람 한 명에게(💬 메시지) → 그 사람 개인 방(세일즈맨이면 CHAT_WEBHOOK_코드, 아니면 CHAT_WEBHOOK_U_아이디) + 팝업 (메일 없음)
 *    · 팝업은 앱에서 🔔 알림 켜기를 한 기기에 (pushTokens) — appsscript.json 의 firebase.messaging 권한 · setup 다시 ▶ 필요. testPush 로 내 기기에 시험
 *    (예전 설명) 앱 알림(notifyq): 주문 확인 요청 · 주문 문제 · 문의를 이메일로, 스크립트 속성 CHAT_WEBHOOK 이 있으면 구글 챗 스페이스에도 (5분마다 같이)
 *    세일즈맨에게 가는 것은 그 세일즈맨 전용 방(스크립트 속성 CHAT_WEBHOOK_BRANDON 처럼 코드별 웹훅)으로 — 다른 세일즈맨은 못 봄. 전용 방이 없으면 공용 방.
 *    방에서는 그 사람을 @멘션 → 구글 챗이 폰 알림을 보냄. 멘션에 쓰는 사용자 ID 는 Admin Directory 로 찾음
 *    (appsscript.json 에 AdminDirectory 서비스 · 권한 포함 — setup 을 다시 ▶ 실행해 권한 허용, testChat 으로 확인)
 *
 * 메일은 이 스크립트를 설치한 계정(luke@)에서 나갑니다. Workspace 하루 한도 1,500명 — 충분합니다.
 * Firestore 는 설치한 계정의 권한(프로젝트 소유자)으로 읽고 씁니다. 키 · 비밀번호를 어디에도 저장하지 않습니다.
 */
const PROJECT = 'the-one-app-ff40e';
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const FROM_NAME = 'THE ONE Collection Report';
const REPLY_TO = 'luke@theonefl.com';
const DEFAULT_TO = 'check@theonefl.com';

/** 5분마다 도는 트리거 만들기 (기존 것은 지움) — Firestore 무료 한도를 아끼려고 5분 */
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('run').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('notifyFast').timeBased().everyMinutes(1).create();   // 🔔 알림 · 팝업은 1분마다
  run();
  Logger.log('설치 완료 — 5분마다 Daily Report · 1분마다 알림 · 팝업');
}
/** 🔔 1분마다 — 알림 대기열만 (Daily Report · 사진 등은 5분마다 run) */
function notifyFast() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return;
  try { notifyRun_(); } catch (e) { Logger.log('알림 보내기 실패: ' + e.message); }
  finally { lock.releaseLock(); }
}

/** 시험 메일 — 나에게만 */
function testMail() {
  const me = Session.getActiveUser().getEmail();
  const html = reportHtml({ sm: 'TEST', d: today_(), rows: [{ store: 'TEST STORE', acct: '0000', addr: '1 MAIN ST, MIAMI, FL 33101', pay: 'CHECK', ref: '1234', amt: 100, invs: [{ no: 'A00001', amt: 100 }], memo: '시험 메일', rcv: today_(), dep: today_() }], total: 100, n: 1 });
  MailApp.sendEmail({ to: me, subject: '[Daily Collection] TEST — 시험 메일', htmlBody: html, name: FROM_NAME, replyTo: REPLY_TO });
  const s = getDoc_('settings', 'app');
  Logger.log('보냄 → ' + me + ' · Firestore 연결 ' + (s ? '정상 (담당자 알림: ' + (s.reportTo || DEFAULT_TO) + ')' : '실패 — 프로젝트 권한 확인'));
}

/** 대기 중인 리포트 보내기 */
function run() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    try { notifyRun_(); } catch (e) { Logger.log('알림 보내기 실패: ' + e.message); }
    try { envelopesLate_(); } catch (e) { Logger.log('봉투 미도착 확인 실패: ' + e.message); }
    try { remindUnsent_(); } catch (e) { Logger.log('안 보낸 주문 · 수금 알림 실패: ' + e.message); }
    try { newItemsRun_(); } catch (e) { Logger.log('새 아이템 알림 실패: ' + e.message); }
    try { inboundMailRun_(); } catch (e) { Logger.log('🚢 공장 인보이스 메일 실패: ' + e.message); }
    try { dailySummary_(); } catch (e) { Logger.log('일일 요약 메일 실패: ' + e.message); }
    try { photoIndexRun_(); } catch (e) { Logger.log('사진 색인 실패: ' + e.message); }
    try { codSyncRun_(); } catch (e) { Logger.log('COD 시트 동기화 실패: ' + e.message); }
    try { photoExportRun_(); } catch (e) { Logger.log('사진 드라이브 저장 실패: ' + e.message); }
    let list = [];
    try { list = query_('reports', 'mail', 'wait', 20); }
    catch (e) { if (/ 429/.test(String(e.message))) { Logger.log('Firestore 하루 무료 한도 초과 — 한도가 다시 차면 이어서 보냅니다'); return; } throw e; }
    if (!list.length) return;   // 보낼 것이 없으면 설정도 안 읽음 (읽기 아끼기)
    const settings = getDoc_('settings', 'app') || {};
    const cc = String(settings.reportTo || DEFAULT_TO).split(/[,;\s]+/).filter(isEmail_);
    let RU = null; const activeUsers = () => RU || (RU = listAll_('users').filter(u => u.active !== false).map(u => String(u.email || u._id || '').toLowerCase()));
    list.forEach(r => {
      try {
        /* 🔐 H2: 리포트의 by 는 등록된 사용자여야 보냄 — 남의 주소를 적어 체크 사진을 밖으로 빼내지 못하게 */
        const to = [];
        if (isEmail_(r.by) && activeUsers().indexOf(String(r.by).toLowerCase()) >= 0) to.push(String(r.by).toLowerCase());
        else if (isEmail_(r.by)) Logger.log('리포트 ' + r._id + ': by 가 등록된 사용자가 아님 — 사무실 주소로만 보냄');
        cc.forEach(x => { if (to.indexOf(x) < 0) to.push(x); });
        if (!to.length) throw new Error('받는 사람이 없습니다');
        const total = Number(r.total) || 0;
        const atts = (r.photos || []).map((p, i) => dataUrlBlob_(p, (r.sm || 'SM') + '_' + (r.d || '') + '_check' + (i + 1))).filter(Boolean);
        const bad = (r.photos || []).length - atts.length;   // 빈 사진 (폰 메모리 부족으로 "data:," 만 온 것)
        /* 사진만 (리포트는 이미 보냄) — 수금 앱 v81 과 같은 제목 */
        const subject = r.photoOnly ? '[Daily Collection] ' + (r.sm || '') + ' — ' + (r.d || '') + ' 체크 사진 ' + atts.length + '장 (추가)'
          : '[Daily Collection] ' + (r.sm || '') + ' — ' + (r.d || '') + ' (' + (r.n || (r.rows || []).length) + '건 / ' + money_(total) + ')';
        const html = r.photoOnly ? '<div style="font-family:Arial,Helvetica,sans-serif">' + esc_(r.sm || '') + ' · ' + esc_(r.d || '') + ' — 리포트를 보낸 뒤 추가로 보내는 체크 사진 ' + atts.length + '장입니다.' + (bad ? '<br><span style="color:#b91c1c">읽지 못한 사진 ' + bad + '장은 빠졌습니다.</span>' : '') + '</div>'
          : reportHtml(r) + (bad ? '<p style="color:#b91c1c">읽지 못한 체크 사진 ' + bad + '장은 빠졌습니다 — 다시 찍어 보내 주세요.</p>' : '');
        if (r.photoOnly && !atts.length) throw new Error('보낼 사진이 없습니다 (사진을 읽지 못함)');
        MailApp.sendEmail({ to: to.join(','), subject, htmlBody: html, name: FROM_NAME, replyTo: REPLY_TO, attachments: atts });
        patch_('reports', r._id, { mail: 'sent', mailAt: new Date().toISOString(), mailTo: to.join(', ') });
      } catch (e) {
        patch_('reports', r._id, { mail: 'error', mailErr: String(e && e.message || e).substring(0, 300), mailAt: new Date().toISOString() });
      }
    });
  } finally { lock.releaseLock(); }
}

/* ---------- 🔔 앱 알림 (notifyq) — 주문 확인 요청 · 세일즈맨이 알린 주문 문제 · 주문 문의 → 이메일 + 구글 챗 ----------
 *  받는 사람: toSm → 그 세일즈맨 코드의 사용자 이메일 · toStaff → 설정의 담당자 알림 이메일(reportTo)
 *  구글 챗: 스크립트 속성 CHAT_WEBHOOK (챗 스페이스 → 앱 및 통합 → 웹훅 추가 → 주소 복사) 이 있으면 그 스페이스에도 올림 */
function notifyRun_() {
  const list = query_('notifyq', 'st', 'wait', 60);
  if (!list.some(n => n.kind !== 'newItem')) return;
  const settings = getDoc_('settings', 'app') || {};
  const staff = String(settings.reportTo || DEFAULT_TO).split(/[,;\s]+/).filter(isEmail_);
  const props = PropertiesService.getScriptProperties();
  const hookKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const personal = sm => (sm && props.getProperty('CHAT_WEBHOOK_' + hookKey(sm))) || '';                       // 세일즈맨 개인 방 — 없으면 '' (단톡방으로 보내지 않음)
  const userRoom = u => (u && u.sm && personal(u.sm)) || (u && props.getProperty('CHAT_WEBHOOK_U_' + hookKey(String(u.email || u._id || '').split('@')[0]))) || '';
  const officeRoom = () => props.getProperty('CHAT_WEBHOOK_OFFICE') || props.getProperty('CHAT_WEBHOOK') || '';
  let USERS = null; const users = () => USERS || (USERS = listAll_('users').filter(u => u.active !== false));
  const emailOf = u => String(u.email || u._id || '').toLowerCase();
  /* 🔐 H1: 보낸 사람이 담당자(관리자 · 오너 · 매니저)가 아니면 받는 사람 직접 지정(to)은 무시, 링크는 앱 주소만, 한 사람이 한 번에 많이 보내면 뒤는 버림 */
  const isStaffUser = u => !!u && (u.role === 'admin' || u.role === 'owner' || u.role === 'manager');
  const senderOf = n => users().find(u => emailOf(u) === String(n.by || '').toLowerCase()) || null;
  const known = e => users().some(u => emailOf(u) === String(e || '').toLowerCase());
  const APP_URL = 'https://theonecorp.github.io/the-one-app/';
  const perSender = {};
  const group = g => users().filter(u => { const r = u.role, j = u.job || 'office';
    if (g === 'g:all') return true; if (g === 'g:sales') return r === 'salesman';
    if (g === 'g:wh') return r === 'manager' && (j === 'whmgr' || j === 'pick' || j === 'pickinv');
    return r === 'admin' || r === 'owner' || (r === 'manager' && j !== 'whmgr' && j !== 'pick' && j !== 'catalog'); }).map(emailOf);   // g:office · g:staff
  list.forEach(n => {
    if (n.kind === 'newItem') return;   // 🆕 새 아이템은 newItemsRun_ 이 묶어서 (10분 조용해지면 · 영업일 8–19시)
    try {
      const by = String(n.by || '').toLowerCase(), add = (L, e) => { e = String(e || '').trim().toLowerCase(); if (isEmail_(e) && L.indexOf(e) < 0) L.push(e); };
      const sender = senderOf(n), staffSender = isStaffUser(sender);
      perSender[by] = (perSender[by] || 0) + 1;
      if (!sender) { patch_('notifyq', n._id, { st: 'skip', skipWhy: 'unknown sender', at: new Date().toISOString() }); return; }   // 등록된 사용자가 아니면 보내지 않음
      if (perSender[by] > 10) { patch_('notifyq', n._id, { st: 'skip', skipWhy: 'too many', at: new Date().toISOString() }); return; }   // 한 번에 10건 넘게는 버림
      const toList = n.to ? (Array.isArray(n.to) ? n.to : String(n.to).split(/[,;\s]+/)).filter(e => staffSender || known(e)) : [];   // 담당자가 아니면 등록된 사용자 주소만
      const url = n.url && String(n.url).indexOf(APP_URL) === 0 ? String(n.url) : '';   // 앱 주소가 아닌 링크는 버림
      /* 받는 사람 */
      const smUsers = n.toSm ? query_('users', 'sm', String(n.toSm), 5) : [];
      const toUser = n.toUser ? (users().find(u => emailOf(u) === String(n.toUser).toLowerCase()) || { email: n.toUser }) : null;
      const mail = [];
      if (!n.pushOnly && !n.noMail) {
        smUsers.forEach(u => add(mail, u.email || u._id));
        if (n.toStaff) staff.forEach(e => add(mail, e));
        toList.forEach(e => add(mail, e));
      }
      const push = [];
      smUsers.forEach(u => add(push, u.email || u._id)); if (toUser && (staffSender || known(toUser.email || toUser._id))) add(push, toUser.email || toUser._id);
      if (!n.noPush) toList.forEach(e => add(push, e));   // 🧾 발주서 메일(noPush): 받는 사람은 공장 — 팝업 대상 아님
      if (n.toGroup) group(n.toGroup).forEach(e => add(push, e)); else if (n.toStaff) group('g:office').forEach(e => add(push, e));
      const pushTo = push.filter(e => e !== by);   // 보낸 사람 자신에게는 팝업 안 함
      const lines = String(n.text || '').split('\n');
      /* 📎 첨부 (🧾 발주서 PDF — plan 의 poMail: atts = [{ name, type, b64 }]) */
      const atts = (n.atts || []).map(x => Utilities.newBlob(Utilities.base64Decode(String(x.b64 || '')), x.type || 'application/octet-stream', x.name || 'file'));
      if (mail.length) MailApp.sendEmail({ to: mail.join(','), subject: n.subject || '[THE ONE] 알림', name: 'THE ONE', replyTo: isEmail_(n.by) ? n.by : REPLY_TO, attachments: atts,
        htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px">' + lines.map(esc_).join('<br>') + (n.byName || n.by ? '<p style="color:#64748b;font-size:13px">— ' + esc_(n.byName || n.by) + '</p>' : '') +
          (url ? '<p><a href="' + esc_(url) + '" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">앱에서 열기 · Open in app</a></p>' : '') + '</div>' });
      /* 구글 챗 — 세일즈맨: 개인 방만 · 한 사람: 그 사람 방 · 그 밖(사무실): 사무실 방 */
      let chat = '';
      if (n.chat && !n.pushOnly) {
        /* 방 고르기 — 창고(g:wh): CHAT_WEBHOOK_WH (없으면 사무실 방) · 세일즈맨 전체(g:sales): 세일즈맨마다 개인 방 · 모두(g:all): 개인 방들 + 사무실 방 */
        const salesRooms = () => users().filter(u => u.role === 'salesman' && u.sm).map(u => personal(u.sm)).filter(Boolean);
        const hooks = n.toSm ? [personal(n.toSm)] : toUser ? [userRoom(toUser)] : n.toGroup === 'g:wh' ? [props.getProperty('CHAT_WEBHOOK_WH') || officeRoom()] : n.toGroup === 'g:sales' ? salesRooms() : n.toGroup === 'g:all' ? salesRooms().concat([officeRoom()]) : [officeRoom()];
        const list2 = Array.from(new Set(hooks.filter(Boolean)));
        list2.forEach(hook => {
          const ids = (n.toSm ? smUsers.map(u => u.email || u._id) : toUser ? [toUser.email || toUser._id] : []).map(chatId_).filter(Boolean);
          const mention = ids.map(id => '<users/' + id + '>').join(' ');
          const r = UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ text: (mention ? mention + ' ' : '') + String(n.text || '') + (n.byName ? '\n— ' + n.byName : '') + (n.url ? '\n' + n.url : '') }), muteHttpExceptions: true });
          chat = (chat ? chat + ' · ' : '') + (r.getResponseCode() === 200 ? 'ok' : 'error ' + r.getResponseCode());
        });
        if (!list2.length) chat = n.toSm || toUser ? 'no personal room' : 'no room';
      }
      /* 📱💻 팝업 (웹 푸시) */
      let pushed = 0;
      try { pushed = pushTo_(pushTo, (n.subject || '').replace(/^\[THE ONE\]\s*/, '') || 'THE ONE', String(n.text || '').slice(0, 240), n.url || '', n.kind || 'msg'); } catch (e) { Logger.log('팝업 실패: ' + e.message); }
      patch_('notifyq', n._id, { st: 'sent', sentAt: new Date().toISOString(), mailTo: mail.join(', '), chat: chat || (n.chat && !n.pushOnly ? 'no webhook' : ''), push: pushed, pushTo: pushTo.join(', ') });
    } catch (e) {
      patch_('notifyq', n._id, { st: 'error', err: String(e && e.message || e).substring(0, 300), sentAt: new Date().toISOString() });
    }
  });
}
/** 📱💻 웹 푸시 — 그 사람들이 🔔 알림을 켠 기기(pushTokens) 마다 FCM 으로. 없어진 기기는 지움. 보낸 기기 수 */
function pushTo_(emails, title, body, url, tag) {
  if (!emails || !emails.length) return 0;
  let n = 0;
  emails.forEach(e => {
    query_('pushTokens', 'email', e, 10).forEach(t => {
      const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send', { method: 'post', contentType: 'application/json', headers: headers_(), muteHttpExceptions: true,
        payload: JSON.stringify({ message: { token: t.token, webpush: { headers: { Urgency: 'high', TTL: '86400' }, data: { title: String(title), body: String(body), url: String(url || ''), tag: 'theone-' + String(tag || 'msg') } } } }) });
      const c = r.getResponseCode(), txt = r.getContentText();
      if (c === 200) n++;
      else if (c === 404 || /UNREGISTERED|registration token is not a valid|NOT_FOUND/.test(txt)) delDoc_('pushTokens', t._id);   // 앱을 지웠거나 알림을 끈 기기
      else Logger.log('푸시 ' + c + ' ' + e + ': ' + txt.substring(0, 200));
    });
  });
  return n;
}
/** 시험 — 내 기기(앱에서 🔔 알림 켜기를 한 곳)에 팝업 하나 */
function testPush() {
  const me = Session.getActiveUser().getEmail();
  const n = pushTo_([me], 'THE ONE 알림 시험', '이 팝업이 보이면 웹 푸시가 됩니다 — ' + new Date().toLocaleTimeString(), '', 'test');
  Logger.log('팝업 보냄: ' + n + '대 (0 이면 앱에서 🔔 알림 켜기를 먼저 · appsscript.json 권한 · setup 다시 실행)');
}

/* ---------- ⏰ 안 보낸 주문 · 수금 — 세일즈맨 폰 · 컴퓨터에 팝업 (v0.8.179) ----------
 *  정한 시각(뉴욕 시간, 기본 11 · 15 · 18시, 영업일만 — 주말 · 휴일 빼고)마다 한 번: 1시간 넘게 그대로인
 *    📝 임시 저장 주문(orders.st = draft) · 💵 리포트로 안 보낸 수금(entries.rep = false · 담당자 확인 전)
 *  이 있는 세일즈맨에게 하나로 묶어 팝업. 시각은 settings/app.remindHours = [11, 15, 18] 로 바꿀 수 있음 (빈 배열이면 안 보냄)
 *  폰에만 있는 주문(인터넷이 없어 아직 못 올린 것)은 서버가 모름 — 앱을 열면 📡 보낼 함이 알려 줌 */
function remindUnsent_() {
  const tz = 'America/New_York', now = new Date(), h = Number(Utilities.formatDate(now, tz, 'H')), dow = Number(Utilities.formatDate(now, tz, 'u'));   // u: 1 월 … 7 일
  if (dow === 7) return;
  const props = PropertiesService.getScriptProperties(), key = Utilities.formatDate(now, tz, 'yyyy-MM-dd') + ' ' + h;
  if (dow === 6) return;   // 📅 영업일만 (토 · 일 · 휴일 빼고, v0.8.180)
  if (props.getProperty('REMIND_AT') === key) return;   // 이 시각에 이미 보냄 (5분 트리거가 여러 번 돌아도 한 번)
  if (Number(Utilities.formatDate(now, tz, 'm')) >= 15) return;   // 정각 뒤 15분 안에만 확인 (설정 읽기를 아낌)
  const settings = getDoc_('settings', 'app') || {};
  const hours = Array.isArray(settings.remindHours) ? settings.remindHours.map(Number) : [11, 15, 18];
  if (hours.indexOf(h) < 0) return;
  if (!biz_(settings).isBiz(Utilities.formatDate(now, tz, 'yyyy-MM-dd'))) return;
  props.setProperty('REMIND_AT', key);
  const cut = new Date(now.getTime() - 3600000).toISOString(), by = {};
  const add = (sm, k, x) => { sm = String(sm || '').toUpperCase(); if (!sm) return; (by[sm] = by[sm] || { o: [], e: [] })[k].push(x); };
  queryVal_('orders', 'st', { stringValue: 'draft' }, 300).forEach(o => { if (String(o.updatedAt || o.createdAt || '') < cut) add(o.sm, 'o', o); });
  queryVal_('entries', 'rep', { booleanValue: false }, 300).forEach(e => { if (!e.sb && !e.void && !e.repl && String(e.createdAt || '') < cut) add(e.sm, 'e', e); });
  Object.keys(by).forEach(sm => {
    try {
      const x = by[sm], to = query_('users', 'sm', sm, 5).filter(u => u.active !== false).map(u => String(u.email || u._id || '').toLowerCase()).filter(isEmail_);
      if (!to.length) return;
      const parts = [], amt = L => money_(L.reduce((a, y) => a + (Number(y.amt != null ? y.amt : y.total) || 0), 0));
      if (x.o.length) parts.push('📝 안 보낸 주문 ' + x.o.length + '건 ' + amt(x.o) + ' (' + x.o.map(o => o.store || '').filter(Boolean).slice(0, 3).join(', ') + (x.o.length > 3 ? ' …' : '') + ')');
      if (x.e.length) parts.push('💵 안 보낸 수금 ' + x.e.length + '건 ' + amt(x.e) + ' (' + x.e.map(e => e.store || '').filter(Boolean).slice(0, 3).join(', ') + (x.e.length > 3 ? ' …' : '') + ')');
      const title = x.o.length && x.e.length ? '⏰ 안 보낸 주문 · 수금이 있습니다' : x.o.length ? '⏰ 안 보낸 주문이 있습니다' : '⏰ 안 보낸 수금이 있습니다';
      const n = pushTo_(to, title, parts.join('\n') + '\n앱을 열어 보내 주세요 · Please send them in the app', x.o.length ? './#/order' : './#/mine', 'remind');
      Logger.log('⏰ ' + sm + ': 주문 ' + x.o.length + ' · 수금 ' + x.e.length + ' → 팝업 ' + n + '대');
    } catch (e) { Logger.log('⏰ ' + sm + ' 알림 실패: ' + e.message); }
  });
}
/** 시험 — 지금 시각과 상관없이 한 번 (기록만 지우고 바로 실행하려면 settings.remindHours 에 지금 시각을 넣거나 아래처럼) */
function testRemind() { PropertiesService.getScriptProperties().deleteProperty('REMIND_AT'); const h = Number(Utilities.formatDate(new Date(), 'America/New_York', 'H')); const s = getDoc_('settings', 'app') || {}; const keep = s.remindHours; patch_('settings', 'app', { remindHours: [h] }); try { remindUnsent_(); } finally { patch_('settings', 'app', { remindHours: Array.isArray(keep) ? keep : [11, 15, 18] }); PropertiesService.getScriptProperties().deleteProperty('REMIND_AT'); } }

/* ---------- 📅 영업일 — 앱(src/bizday.js)과 같은 규칙 (v0.8.180) ----------
 *  휴일 = 미국 연방 공휴일(주말이면 대체일) + settings.app.holidays − settings.app.workHolidays(회사가 일하는 공휴일) · 토 · 일 */
function biz_(settings) {
  const st = settings || getDoc_('settings', 'app') || {}, tz = 'America/New_York';
  const fmt = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const ymd = (y, m, d) => y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const dowOf = s => new Date(s + 'T12:00:00Z').getUTCDay();
  const nth = (y, m, dow, n) => { let c = 0; for (let d = 1; d <= 31; d++) { if (dowOf(ymd(y, m, d)) === dow && ++c === n) return ymd(y, m, d); } return ''; };
  const last = (y, m, dow) => { for (let d = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); d > 0; d--) if (dowOf(ymd(y, m, d)) === dow) return ymd(y, m, d); return ''; };
  const obs = (y, m, d) => { const w = dowOf(ymd(y, m, d)); const t = new Date(Date.UTC(y, m, d + (w === 6 ? -1 : w === 0 ? 1 : 0))); return ymd(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
  const H = {}, y0 = Number(fmt(new Date()).substring(0, 4));
  [y0 - 1, y0, y0 + 1].forEach(Y => [obs(Y, 0, 1), nth(Y, 0, 1, 3), nth(Y, 1, 1, 3), last(Y, 4, 1), obs(Y, 5, 19), obs(Y, 6, 4), nth(Y, 8, 1, 1), nth(Y, 9, 1, 2), obs(Y, 10, 11), nth(Y, 10, 4, 4), obs(Y, 11, 25)].forEach(d => { H[d] = 1; }));
  (st.holidays || []).forEach(d => { H[d] = 1; }); (st.workHolidays || []).forEach(d => { delete H[d]; });
  const isBiz = s => { s = String(s).substring(0, 10); const w = dowOf(s); return w !== 0 && w !== 6 && !H[s]; };
  const add = (s, n) => { const t = new Date(s + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().substring(0, 10); };
  const between = (a, b) => { let n = 0, d = a; for (let i = 0; i < 4000 && d < b; i++) { d = add(d, 1); if (isBiz(d)) n++; } return n; };
  const prevBiz = s => { let d = add(s, -1); for (let i = 0; i < 30 && !isBiz(d); i++) d = add(d, -1); return d; };
  /** 영업일에 든 시간만 (ms) — 하루 경계는 뉴욕 자정 */
  const ms = (fromIso, toMs) => { const t0 = new Date(fromIso).getTime(), t1 = toMs || Date.now(); if (!(t1 > t0)) return 0; let tot = 0, cur = t0;
    for (let i = 0; i < 4000 && cur < t1; i++) { const d = fmt(new Date(cur)), nd = add(d, 1), offs = Utilities.formatDate(new Date(nd + 'T12:00:00Z'), tz, 'XXX'), next = Math.min(t1, new Date(nd + 'T00:00:00' + offs).getTime());
      if (isBiz(d)) tot += next - cur; cur = next > cur ? next : cur + 3600000; }
    return tot; };
  return { H, isBiz, add, between, prevBiz, ms, day: iso => fmt(new Date(iso)) };
}

/* ---------- 🆕 새 아이템 알림 — 세일즈맨 폰 팝업 (v0.8.182) ----------
 *  앱이 아이템을 새로 등록하면 notifyq 에 kind 'newItem' (codes: [{ c, d, p }]) 을 남김 → 여기서 묶어 한 번에
 *  · 마지막 등록 뒤 10분 동안 더 없을 때 (하나씩 여러 개 등록해도 팝업 한 번) · 영업일 8–19시(뉴욕)에만 — 밤 · 주말 · 휴일에 등록한 것은 다음 영업일 아침
 *  · 받는 사람: 활성 세일즈맨 전부 · 누르면 앱의 새 주문 → 🆕 새로 나온 목록 */
function newItemsRun_(nowMs) {
  const L = queryVal_('notifyq', 'kind', { stringValue: 'newItem' }, 200).filter(n => n.st === 'wait');
  if (!L.length) return 0;
  const now = nowMs || Date.now(), last = L.reduce((a, n) => String(n.at || '') > a ? String(n.at || '') : a, '');
  if (now - new Date(last).getTime() < 10 * 60000) return 0;   // 아직 등록하는 중
  const tz = 'America/New_York', d = new Date(now), h = Number(Utilities.formatDate(d, tz, 'H'));
  if (h < 8 || h >= 19 || !biz_().isBiz(Utilities.formatDate(d, tz, 'yyyy-MM-dd'))) return 0;
  const seen = {}, codes = []; L.sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach(n => (n.codes || []).forEach(x => { if (x && x.c && !seen[x.c]) { seen[x.c] = 1; codes.push(x); } }));
  const to = listAll_('users').filter(u => u.active !== false && u.role === 'salesman').map(u => String(u.email || u._id || '').toLowerCase()).filter(isEmail_);
  let pushed = 0;
  if (codes.length && to.length) pushed = pushTo_(to, '🆕 새 아이템 ' + codes.length + '개 · New items', codes.slice(0, 6).map(x => x.c + ' ' + String(x.d || '').slice(0, 30) + (x.p ? ' ' + money_(x.p) : '')).join('\n') + (codes.length > 6 ? '\n… +' + (codes.length - 6) : ''), './#/order/newitems', 'newitem');
  const at = new Date(now).toISOString();
  L.forEach(n => patch_('notifyq', n._id, { st: 'sent', sentAt: at, push: pushed, pushTo: to.length + ' salesmen', merged: codes.length }));
  Logger.log('🆕 새 아이템 ' + codes.length + '개 → 세일즈맨 ' + to.length + '명 · 팝업 ' + pushed + '대');
  return codes.length;
}

/* ---------- 🚢 공장 인보이스 메일 → 앱 입고 예정 (v0.8.183) ----------
 *  공장이 inbound@theonefl.com 으로 인보이스 엑셀을 보내면 (이 스크립트 계정 받은편지함에 오도록 — 별칭 · 그룹 · 전달 중 하나)
 *  ① 첨부(xlsx · xls · csv)를 구글 시트로 바꿔 줄들을 읽고 → InboundParse.gs(앱과 같은 코드)로 공장 · 번호 · 날짜 · 코드 · 수량 · 단가 · 박스
 *  ② 메일 본문의 정해진 칸(INVOICE NO · SHIP DATE · TRACKING · CARTONS · CURRENCY · INVOICE AMOUNT · FREIGHT · PAYMENT REQUEST)도 읽음
 *  ③ 앱에 입고 예정으로: 모든 코드가 앱에 있고 공장을 알면 🚢 오는 중 (창고 · 오피스 팝업), 아니면 🔎 확인 대기 (오피스 · 관리자 팝업)
 *     단가 · 금액 · 송금 요청은 inboundCost (관리자만) — 본문 금액과 엑셀 합계가 다르면 표시
 *  ④ 메일에 라벨 "THE ONE/입고 처리" (다시 읽지 않음) · 같은 공장 같은 번호는 건너뜀 (제목에 REVISED 면 확인 대기 문서를 새것으로 바꿈)
 *  주소는 스크립트 속성 INBOUND_TO 로 바꿀 수 있음 (기본 inbound@theonefl.com) */
const INBOUND_TO_DEFAULT = 'inbound@theonefl.com', INBOUND_LABEL = 'THE ONE/입고 처리';
function inboundMailRun_() {
  const P = PropertiesService.getScriptProperties(), to = P.getProperty('INBOUND_TO') || INBOUND_TO_DEFAULT;
  let n = 0, byCode = null; const cat = () => byCode || (byCode = inboundCatalog_());
  try { n += inboundRelayRun_(cat); } catch (e) { Logger.log('📥 받은편지 폴더 실패: ' + e.message); }   // 📥 inbound@ 계정이 넣어 둔 메일 (InboundRelay.gs · v0.8.227)
  const threads = GmailApp.search('to:' + to + ' -label:"' + INBOUND_LABEL + '" newer_than:30d', 0, 10);
  if (!threads.length) return n;
  const label = GmailApp.getUserLabelByName(INBOUND_LABEL) || GmailApp.createLabel(INBOUND_LABEL);
  cat();
  threads.forEach(th => {
    th.getMessages().forEach(m => {
      try { n += inboundMessage_(m, byCode); } catch (e) { Logger.log('🚢 ' + m.getSubject() + ': ' + e.message); inboundNotify_('inboundErr', '⚠️ 공장 인보이스 메일을 읽지 못했습니다 — ' + m.getSubject(), m.getFrom() + '\n' + e.message, true); }
    });
    th.addLabel(label);
  });
  return n;
}
/* 📥 inbound@ 받은편지 폴더 (v0.8.227) — inbound@ 계정의 InboundRelay.gs 가 새 메일을 "THE ONE 공장 메일 받은편지 (inbound)" 폴더에 한 통씩(JSON) 넣음
 *   → 여기서 읽어 메일과 똑같이 inboundMessage_ 로 · 읽은 파일은 설명(description)에 done (다시 안 읽음) · 관리자 메일함으로 전달할 필요 없음 */
const INBOUND_RELAY_FOLDER = 'THE ONE 공장 메일 받은편지 (inbound)';
/** 폴더의 JSON 한 통 → 메일처럼 쓰는 모양 (inboundMessage_ 가 부르는 것만) */
function inboundRelayMsg_(doc) {
  const atts = (doc.atts || []).map(a => Utilities.newBlob(Utilities.base64Decode(a.b64), a.type || 'application/octet-stream', a.name));
  return { getAttachments: () => atts, getSubject: () => doc.subject || '', getFrom: () => doc.from || '', getPlainBody: () => doc.body || '', getDate: () => new Date(doc.date || Date.now()) };
}
function inboundRelayRun_(cat) {
  const folders = DriveApp.searchFolders('title = "' + INBOUND_RELAY_FOLDER + '" and trashed = false');
  let n = 0;
  while (folders.hasNext()) {
    const files = folders.next().searchFiles('title contains "msg-" and trashed = false');
    while (files.hasNext()) {
      const f = files.next(); if (f.getDescription() === 'done') continue;
      let doc = null; try { doc = JSON.parse(f.getBlob().getDataAsString()); } catch (e) { f.setDescription('done'); continue; }
      const m = inboundRelayMsg_(doc);
      try { n += inboundMessage_(m, cat()); } catch (e) { Logger.log('📥 ' + doc.subject + ': ' + e.message); inboundNotify_('inboundErr', '⚠️ 공장 인보이스 메일을 읽지 못했습니다 — ' + doc.subject, doc.from + '\n' + e.message, true); }
      f.setDescription('done');
    }
  }
  return n;
}
/** 카탈로그 → { 코드: { c, d, p } } (앱 parseFactoryInvoice 가 쓰는 모양) */
function inboundCatalog_() {
  const meta = getDoc_('catalog', 'meta') || {}, by = {};
  for (let i = 0; i < Number(meta.chunks || 0); i++) { const d = getDoc_('catalog', 'c' + i); if (d && d.j) JSON.parse(d.j).forEach(r => { by[String(r[0]).toUpperCase()] = { c: r[0], d: r[1], p: Number(r[2]) || 0 }; }); }
  return by;
}
/** 첨부 하나 → 줄들(aoa). xlsx · xls 는 구글 시트로 바꿔 읽고 지움 */
function inboundBook_(att) {
  const name = att.getName();
  if (/\.(csv|txt)$/i.test(name)) return [{ name: name, rows: Utilities.parseCsv(att.getDataAsString()) }];
  const meta = { name: 'inbound-tmp-' + name, mimeType: 'application/vnd.google-apps.spreadsheet' }, bd = 'xxinbound' + Date.now();
  const payload = Utilities.newBlob('--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + bd + '\r\nContent-Type: ' + att.getContentType() + '\r\n\r\n').getBytes().concat(att.getBytes()).concat(Utilities.newBlob('\r\n--' + bd + '--').getBytes());
  const r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'post', contentType: 'multipart/related; boundary=' + bd, payload: payload, headers: headers_(), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('엑셀 변환 실패 ' + r.getResponseCode() + ': ' + r.getContentText().substring(0, 200));
  const id = JSON.parse(r.getContentText()).id;
  try {
    return SpreadsheetApp.openById(id).getSheets().slice(0, 12).map(sh => ({ name: sh.getName(), rows: sh.getDataRange().getValues().map(row => row.map(x => x instanceof Date ? Utilities.formatDate(x, 'America/New_York', 'yyyy-MM-dd') : x)) }));
  } finally { UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id, { method: 'delete', headers: headers_(), muteHttpExceptions: true }); }
}
/** 첫 시트만 (예전 호출용) */
function inboundAoa_(att) { const b = inboundBook_(att); return b.length ? b[0].rows : []; }
/** 메일 본문의 정해진 칸 — "PAYMENT REQUEST 请付款金额: USD 26,732.89" 같은 줄 */
function inboundBody_(text) {
  const t = String(text || ''), get = re => { const m = t.match(re); return m ? String(m[1]).trim() : ''; }, money = v => Number(String(v || '').replace(/[^0-9.\-]/g, '')) || 0;
  return { no: get(/INVOICE\s*NO[^:：\n]*[:：]\s*([^\n]+)/i), d: get(/SHIP\s*DATE[^:：\n]*[:：]\s*([^\n]+)/i), trk: get(/TRACKING[^:：\n]*[:：]\s*([^\n]+)/i), ctn: money(get(/CARTONS?[^:：\n]*[:：]\s*([^\n]+)/i)),
    cur: /RMB|CNY|人民币/i.test(get(/CURRENCY[^:：\n]*[:：]\s*([^\n]+)/i)) ? 'CNY' : /USD|\$/i.test(get(/CURRENCY[^:：\n]*[:：]\s*([^\n]+)/i)) ? 'USD' : '',
    amt: money(get(/INVOICE\s*AMOUNT[^:：\n]*[:：]\s*([^\n]+)/i)), frt: money(get(/FREIGHT[^:：\n]*[:：]\s*([^\n]+)/i)), pay: money(get(/PAYMENT\s*REQUEST[^:：\n]*[:：]\s*([^\n]+)/i)) };
}
/** 메일 하나 → 첨부마다 무엇인지 가려서 (v0.8.184)
 *   · 인보이스 → 🚢 입고 예정 (같은 출고의 인보이스 + 패킹리스트는 한 건으로: 단가는 인보이스, 박스 번호는 패킹리스트)
 *   · 명세서(Statement · Account · 对账单) → 경영 → 🏭 공장 장부와 대조해 관리자에게만 메일 + 공장 문서(mailDocs)에 기록 · 입고 예정에는 안 넣음
 *   · 진행표(Status) · 그 밖 → 드라이브 "THE ONE 공장 메일"에 보관 + 관리자에게만 알림
 *   · 인보이스인지 확실하지 않으면(번호 · 단가 · 제목의 INVOICE 모두 없음) 🔎 확인 대기로
 *   돌려주는 값: 입고 예정으로 등록한 건수 */
function inboundMessage_(m, byCode) {
  const atts = m.getAttachments().filter(a => /\.(xlsx|xls|csv)$/i.test(a.getName()));
  const subj = m.getSubject() || '', from = m.getFrom() || '', B = inboundBody_(m.getPlainBody()), revised = /REVISED/i.test(subj);
  if (!atts.length) { inboundNotify_('inboundErr', '⚠️ 공장 메일에 엑셀이 없습니다 — ' + subj, from + '\n엑셀(.xlsx · .xls) 인보이스를 첨부해 다시 보내 달라고 해 주세요.', true); return 0; }
  const year = Number(Utilities.formatDate(m.getDate(), 'America/New_York', 'yyyy'));
  const top = book => book.slice(0, 3).map(sh => (sh.rows || []).slice(0, 6).map(r => (r || []).join(' ')).join(' ')).join(' ');
  const items = atts.map(att => {
    const book = inboundBook_(att); let R = null;
    for (let i = 0; i < book.length; i++) { const r = parseFactoryInvoice(book[i].rows, byCode, year); if (!r.err) { R = r; break; } if (!R) R = r; }
    R = R || { err: 'nocode', lines: [] };
    const ledger = FacStmt.looksLikeAnyStatement(book), K = classifyFile({ name: att.getName(), sheets: book, inv: R, ledger: ledger, subject: subj });
    return { att: att, name: att.getName(), book: book, R: R, kind: K.kind, why: K.why, priced: (R.lines || []).some(l => (l.p || 0) > 0), pack: PACK_RE.test(att.getName() + ' ' + top(book)) };
  });
  /* 명세서 · 진행표 · 그 밖 — 공장 금액이 들어 있을 수 있어 관리자에게만 */
  items.filter(x => x.kind !== 'invoice').forEach(x => {
    try { inboundFactoryFile_(m, x); } catch (e) { Logger.log('🏭 ' + x.name + ': ' + e.message); }
    if (x.kind === 'other' && (INV_RE.test(subj) || INV_RE.test(x.name))) inboundNotify_('inboundErr', '⚠️ 공장 인보이스를 읽지 못했습니다 — ' + x.name, from + ' · ' + subj + '\n' + x.why + ' — 앱 재고 → 🚢 입고 예정에서 파일로 직접 올려 주세요.', true);
  });
  /* 인보이스 — 같은 출고는 하나로 */
  const invs = items.filter(x => x.kind === 'invoice').sort((a, b) => (b.priced ? 1 : 0) - (a.priced ? 1 : 0)), main = [];
  invs.forEach(x => {
    const sig = invSig(x.R.lines), same = main.find(g => invSig(g.R.lines) === sig);
    const host = same || (x.pack && !x.priced ? (() => { const pr = invs.filter(y => y !== x && y.priced); return pr.length === 1 && x.R.lines.every(l => pr[0].R.lines.some(k => k.c === l.c)) ? pr[0] : null; })() : null);
    if (!host) { main.push(x); return; }
    host.R.lines.forEach(l => { if (!(l.bx && l.bx.length)) { const k = x.R.lines.find(y => y.c === l.c); if (k && k.bx && k.bx.length) { l.bx = k.bx; l.box = k.box; } } });
    host.R.boxes = host.R.boxes || x.R.boxes; host.R.trk = host.R.trk || x.R.trk; host.merged = (host.merged || []).concat([x.name]);
  });
  let n = 0;
  main.forEach(x => { if (inboundRegister_(m, x, B, revised)) n++; });
  return n;
}
/** 인보이스 하나 → inbound(창고용 · 단가 없음) + inboundCost(관리자만) + 알림. 등록하면 true */
function inboundRegister_(m, x, B, revised) {
  const subj = m.getSubject() || '', from = m.getFrom() || '', R = x.R, att = x.att;
  const factory = R.factory || String(from).replace(/<.*$/, '').replace(/"/g, '').trim() || String(from), no = R.no || B.no || (factory.split(/\s+/)[0].toUpperCase().slice(0, 10) + '-' + (R.d || B.d || today_()).replace(/-/g, ''));
  const dup = query_('inbound', 'no', no, 10).find(d => d.st !== 'x' && d.factory === factory);
  if (dup && !(revised && (dup.st === 'review' || dup.st === 'coming'))) { Logger.log('🚢 이미 있음: ' + no); return false; }
  const id = dup ? dup._id : 'IB' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase();
  const unknown = R.lines.filter(l => !l.ok), unsure = unsureInvoice(R, B, subj, x.name), st = unknown.length || unsure ? 'review' : 'coming', now = new Date().toISOString();
  const qty = R.lines.reduce((a, l) => a + l.q, 0), amt = Math.round(R.lines.reduce((a, l) => a + l.q * (l.p || 0), 0) * 100) / 100;
  const cur = B.cur || String(R.cur || 'USD').replace('?', '');
  patch_('inbound', id, { id: id, no: no, factory: factory, fromCode: '', d: R.d || dstrB_(B.d) || today_(), eta: '', file: att.getName() + (x.merged ? ' + ' + x.merged.join(' + ') : ''), src: 'mail', mailFrom: from, mailSubject: subj, st: st, why: unsure ? '인보이스인지 확실하지 않음 — 인보이스 번호 · 단가가 없고 메일 제목 · 파일 이름에 INVOICE 가 없습니다. 패킹리스트 · 주문표인지 확인하고 등록하세요.' : '', boxes: R.boxes || B.ctn || 0, trk: R.trk || B.trk || '',
    secs: R.secs.map(s => ({ n: s.n, q: s.q })), lines: R.lines.map(l => ({ c: l.c, raw: l.raw, d: l.d || '', q: l.q, sec: l.sec, ok: l.ok, rq: null, sim: l.sim || '', box: l.box || [], bx: (l.bx || []).map(b => ({ b: b.b, q: b.q, rq: null })) })), n: R.lines.length, qty: qty, by: 'mail:' + from, at: now, revisedAt: dup ? now : null });
  const p = {}, praw = {}; R.lines.forEach(l => { p[l.c] = l.p || 0; praw[l.raw || l.c] = l.p || 0; });
  patch_('inboundCost', id, { id: id, no: no, factory: factory, praw: praw, cur: cur, curGuess: !B.cur && /\?/.test(R.cur || ''), frt: R.frt || B.frt || 0, amt: amt, secs: R.secs.map(s => ({ n: s.n, amt: s.amt })), p: p, pay: B.pay || 0, bodyAmt: B.amt || 0, amtMismatch: !!(B.amt && Math.abs(B.amt - amt) > 1), at: now });
  const head = '🚢 ' + factory + ' · ' + no + ' · ' + R.lines.length + '종 ' + qty.toLocaleString() + '개' + (R.boxes ? ' · 📦 ' + R.boxes : '') + (x.merged ? ' · 패킹리스트 합침' : '');
  if (st === 'coming') inboundNotify_('inbound', '[THE ONE] 🚢 입고 예정 — ' + factory, head + ' — 오는 중 (메일로 자동 등록)', false);
  else inboundNotify_('inboundReview', '[THE ONE] 🔎 입고 예정 확인 대기 — ' + factory, head + (unknown.length ? '\n앱에 없는 코드 ' + unknown.length + ': ' + unknown.slice(0, 8).map(l => l.c + (l.sim ? '(≈' + l.sim + ')' : '')).join(', ') : '') + (unsure ? '\n인보이스인지 확실하지 않음 (번호 · 단가 · INVOICE 제목 없음)' : '') + '\n앱 재고 → 🚢 입고 예정에서 확인하고 등록하세요.', true);
  return true;
}
/** 🏭 명세서 · 진행표 · 그 밖 — 드라이브 보관 + (명세서면) 경영 장부와 대조 → 공장 문서 mailDocs(최근 10개) + 관리자에게만 메일 */
function inboundFactoryFile_(m, x) {
  const subj = m.getSubject() || '', from = m.getFrom() || '', fromName = String(from).replace(/<.*$/, '').replace(/"/g, '').trim(), now = new Date().toISOString();
  const facs = listAll_('factories').filter(f => f.active !== false);
  const P = x.kind === 'statement' || x.kind === 'status' ? FacStmt.parseAnyStatement(x.book) : null, ledger = !!(P && P.sheets.length);
  /* 어느 공장 — 파일 안 이름 → 보낸 사람 · 메일 제목 · 파일 이름 → 같은 주소가 전에 보낸 인보이스의 공장 */
  let fac = (P && P.name && FacStmt.matchFactory(P.name, facs)) || FacStmt.guessFactory(((P && P.name) || '') + ' ' + fromName + ' ' + subj + ' ' + x.name, facs) || null;
  if (!fac) { const prev = query_('inbound', 'mailFrom', from, 5).find(d => d.factory); if (prev) fac = FacStmt.guessFactory(prev.factory, facs); }
  let cmp = null;
  if (ledger && fac) cmp = FacStmt.compareStatement(P, { inv: query_('factoryInvoices', 'f', fac.code, 5000), pay: query_('factoryPayments', 'f', fac.code, 5000) });
  let url = ''; try { url = inboundSaveFile_(x.att, fac ? fac.code : '미확인'); } catch (e) { Logger.log('🏭 드라이브 보관 실패: ' + e.message); }
  const cut = L => (L || []).slice(0, 30);
  const small = cmp ? { fmt: cmp.fmt, from: cmp.from, to: cmp.to, fileBal: cmp.fileBal, appBal: cmp.appBal, appBalAt: cmp.appBalAt, diff: cmp.diff, ok: cmp.ok, fileInv: cmp.fileInv, filePay: cmp.filePay, fwd: cmp.fwd, open: cut(cmp.open),
    inv: { onlyFile: cut(cmp.inv.onlyFile), onlyApp: cut(cmp.inv.onlyApp), moved: cut(cmp.inv.moved) }, pay: { onlyFile: cut(cmp.pay.onlyFile), onlyApp: cut(cmp.pay.onlyApp), moved: cut(cmp.pay.moved) } } : null;
  const doc = { at: now, kind: x.kind, why: x.why, file: x.name, url: url, from: from, subject: subj, ledger: ledger, cmp: small };
  if (fac) patch_('factories', fac.code, { mailDocs: [doc].concat((fac.mailDocs || []).slice(0, 9)) });
  const KN = { statement: '📄 명세서', status: '📋 진행표', other: '📎 파일' }[x.kind] || '📎 파일', who = fac ? (fac.name || fac.code) + ' (' + fac.code + ')' : fromName || from;
  const m2 = v => money_(v), list = (t, L, f) => L.length ? '<p style="margin:8px 0 2px"><b>' + t + ' ' + L.length + '</b></p><ul style="margin:0;padding-left:18px">' + L.slice(0, 15).map(r => '<li>' + f(r) + '</li>').join('') + (L.length > 15 ? '<li>…</li>' : '') + '</ul>' : '';
  let body = '<p>' + esc_(who) + ' · <b>' + esc_(x.name) + '</b>' + (url ? ' · <a href="' + esc_(url) + '">드라이브에서 열기</a>' : '') + '<br><span style="color:#64748b">' + esc_(from) + ' · ' + esc_(subj) + ' · ' + esc_(x.why) + '</span></p>';
  if (cmp) {
    body += '<table style="border-collapse:collapse;font-size:14px"><tr><td style="padding:3px 10px 3px 0">공장 파일 BALANCE (' + esc_(cmp.to) + ')</td><td style="text-align:right"><b>' + m2(cmp.fileBal) + '</b></td></tr><tr><td style="padding:3px 10px 3px 0">앱 장부 잔액 (같은 날짜까지)</td><td style="text-align:right"><b>' + m2(cmp.appBalAt) + '</b></td></tr>' +
      '<tr><td style="padding:3px 10px 3px 0">차이 (파일 − 앱)</td><td style="text-align:right;color:' + (Math.abs(cmp.diff) < 0.011 ? '#15803d' : '#b91c1c') + '"><b>' + (Math.abs(cmp.diff) < 0.011 ? '✅ 같음' : m2(cmp.diff)) + '</b></td></tr><tr><td style="padding:3px 10px 3px 0;color:#64748b">앱 장부 지금 잔액</td><td style="text-align:right;color:#64748b">' + m2(cmp.appBal) + '</td></tr></table>' +
      '<p style="color:#64748b;font-size:13px">비교한 기간 ' + esc_(cmp.from) + ' ~ ' + esc_(cmp.to) + ' · 파일 인보이스 ' + m2(cmp.fileInv) + ' · 송금 ' + m2(cmp.filePay) + '</p>' +
      list('📄 파일에만 있는 인보이스', cmp.inv.onlyFile, r => esc_(r.d) + ' ' + m2(r.amt) + (r.note ? ' · ' + esc_(r.note) : '')) + list('📒 앱에만 있는 인보이스', cmp.inv.onlyApp, r => esc_(r.d) + ' ' + m2(r.amt)) +
      list('📄 파일에만 있는 송금', cmp.pay.onlyFile, r => esc_(r.d) + ' ' + m2(r.amt)) + list('📒 앱에만 있는 송금', cmp.pay.onlyApp, r => esc_(r.d) + ' ' + m2(r.amt)) +
      list('📅 금액은 같고 날짜만 다름', cmp.inv.moved.concat(cmp.pay.moved), r => m2(r.amt) + ' — 파일 ' + esc_(r.fileD) + ' · 앱 ' + esc_(r.appD)) +
      (cmp.fwd ? '<p style="font-size:14px">이월 (' + esc_(cmp.fwd.d) + ' 전 잔액): 파일 ' + m2(cmp.fwd.file) + ' · 앱 ' + m2(cmp.fwd.app) + (Math.abs(cmp.fwd.diff) < 0.011 ? ' ✅' : ' — <b style="color:#b91c1c">차이 ' + m2(cmp.fwd.diff) + '</b> (그 전 기간부터 다름)') + '</p>' : '') +
      list('🏭 아직 안 보낸 주문 (공장 진행표의 IN PROGRESS)', cmp.open || [], r => esc_(r.po) + ' ' + esc_(r.item) + ' · ' + esc_(r.d) + ' · ' + m2(r.amt)) +
      '<p style="font-size:13px">앱 <b>경영 → 🏭 공장</b>에 이 비교가 남아 있습니다. 파일대로 장부를 맞추려면 이 파일을 <b>관리 → 가져오기</b>에 올리세요 (🏭 공장 명세서).</p>';
  } else if (x.kind === 'statement' || (x.kind === 'status' && ledger)) body += '<p>' + (!fac ? '⚠️ 어느 공장인지 찾지 못했습니다 — 경영 → 🏭 공장의 이름과 맞지 않음. ' : '') + (!ledger ? '⚠️ 아는 장부 모양(Date · PAID DATE · DEPOSIT MONEY / ACCOUNT / 결재내역서 / ORDER STATUS)이 아니라 자동 비교를 못 했습니다. ' : '') + '파일을 열어 확인해 주세요.</p>';
  else body += '<p>입고 예정에는 넣지 않았습니다. ' + (x.kind === 'status' ? '생산 · 주문 진행표로 보입니다.' : '인보이스 모양(아이템 코드 · 수량)이 아닙니다.') + '</p>';
  const tag = cmp ? (Math.abs(cmp.diff) < 0.011 && cmp.ok ? ' ✅ 장부와 같음' : ' ⚠️ 장부와 다름 ' + m2(cmp.diff)) : '';
  MailApp.sendEmail({ to: REPLY_TO, subject: '[THE ONE] ' + KN + ' — ' + who + tag, name: 'THE ONE', replyTo: REPLY_TO, htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px">' + body + '</div>' });
}
/** 드라이브 "THE ONE 공장 메일/공장 코드" 에 첨부 원본 보관 → 링크 */
function inboundSaveFile_(att, sub) {
  const it = DriveApp.getFoldersByName('THE ONE 공장 메일'), root = it.hasNext() ? it.next() : DriveApp.createFolder('THE ONE 공장 메일');
  const it2 = root.getFoldersByName(sub), dir = it2.hasNext() ? it2.next() : root.createFolder(sub);
  return dir.createFile(att.copyBlob()).setName(Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd') + ' ' + att.getName()).getUrl();
}
function dstrB_(v) { const s = String(v || ''); const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : ''; }
/** 알림 — 앱 알림 대기열로 (팝업만). staffOnly: 오피스 · 관리자만, 아니면 창고 묶음 + 오피스 */
function inboundNotify_(kind, subject, text, staffOnly) {
  const id = 'N' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const n = { id: id, kind: kind, st: 'wait', by: REPLY_TO, byName: 'THE ONE 메일', at: new Date().toISOString(), pushOnly: true, toStaff: true, subject: subject, text: text, url: 'https://app.theonefl.com/#/stock/inb' };
  if (!staffOnly) n.toGroup = 'g:wh';
  patch_('notifyq', id, n);
}
/** 시험 — 받은편지함의 inbound 메일을 지금 한 번 (라벨이 붙은 것은 건너뜀) */
function testInboundMail() { const n = inboundMailRun_(); Logger.log('🚢 공장 인보이스 메일 → 입고 예정 ' + n + '건'); }

/* ---------- 📊 일일 요약 메일 — 영업일 아침 한 번, 관리자에게 (v0.8.180) ----------
 *  기간: 지난번 보낸 요약 다음 날 ~ 어제 (처음엔 지난 영업일부터 · 최대 7일)
 *  보내는 날: 영업일 · 주말 · 휴일 상관없이 매일 아침 확인 → 그 기간에 한 건이라도 들어왔으면(주문 · 인보이스 · 크레딧 · 수금 · COD/ACH/카드 · UPS · 출고 · 딜리버리) 보냄,
 *            아무것도 없으면 안 보냄 — 다음 날 요약이 그날까지 묶어서 보여 줌 (v0.8.184 관리자: "한 건이라도 들어온 게 있으면 보내고 없으면 안 보내게")
 *  ① 🛒 주문 · 매출 (새 주문 · 인보이스 · 이번 달 누적과 영업일 기준 예상)  ② 💵 수금 (세일즈맨 · 사무실 COD/ACH/카드)
 *  ③ 📦 출고 · UPS (박스 · 무게 · 운임 · 가게 · 딜리버리)  ④ ⚠️ 특이사항 (밀린 주문 · 안 보낸 주문/수금 · 확인 요청 · 바운스 · 크레딧 · 봉투 · 조용한 세일즈맨 · UPS 기록 · 메일 오류)
 *  받는 사람 settings.app.summaryTo (기본 관리자) · 시각 settings.app.summaryHour (뉴욕 시간, 기본 7) · 끄기: summaryHour = -1 · 시험: testSummary() (활동이 없어도 보냄 · 기록은 안 바꿈) */
function dailySummary_(force) {
  const tz = 'America/New_York', now = new Date(), td = Utilities.formatDate(now, tz, 'yyyy-MM-dd'), h = Number(Utilities.formatDate(now, tz, 'H'));
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('SUMMARY_AT') === td) return;
  const settings = getDoc_('settings', 'app') || {}, hour = settings.summaryHour != null ? Number(settings.summaryHour) : 7;
  if (!force && (hour < 0 || h < hour)) return;
  const B = biz_(settings), yest = B.add(td, -1), last = props.getProperty('SUMMARY_TO') || '';
  let from = last && last < yest ? B.add(last, 1) : B.prevBiz(td);
  if (from > yest) from = yest;
  if (from < B.add(td, -7)) from = B.add(td, -7);
  if (!force) props.setProperty('SUMMARY_AT', td);   // 하루 한 번만 확인 (5분마다 다시 계산하지 않게)
  const to = String(settings.summaryTo || REPLY_TO).split(/[,;\s]+/).filter(isEmail_);
  if (!to.length) return;
  const r = summaryData_(B, td, settings, from);
  if (!force && !r.data.any) { Logger.log('📊 요약 — ' + from + ' ~ ' + yest + ' 새로 들어온 것 없음 → 안 보냄 (다음 요약에 묶임)'); return; }
  MailApp.sendEmail({ to: (force && force.to) || to.join(','), subject: r.subject, htmlBody: r.html, name: 'THE ONE', replyTo: REPLY_TO });
  if (!force) props.setProperty('SUMMARY_TO', yest);
  Logger.log('📊 요약 메일 → ' + ((force && force.to) || to.join(',')) + ' · ' + r.subject);
}
function testSummary() { dailySummary_({ to: Session.getActiveUser().getEmail() }); }
function queryIn_(col, field, vals, limit) {
  const body = { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'IN', value: { arrayValue: { values: vals.map(v => ({ stringValue: v })) } } } }, limit: limit || 2000 } };
  const res = UrlFetchApp.fetch(BASE + ':runQuery', { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), headers: headers_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Firestore 읽기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300));
  return JSON.parse(res.getContentText()).filter(x => x.document).map(x => fromDoc_(x.document));
}
function queryGe_(col, field, val, limit) {
  const body = { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: val } } }, limit: limit || 2000 } };
  const res = UrlFetchApp.fetch(BASE + ':runQuery', { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), headers: headers_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Firestore 읽기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300));
  return JSON.parse(res.getContentText()).filter(x => x.document).map(x => fromDoc_(x.document));
}
/** 요약 계산 — 읽기만 함 (B: biz_(), td: 오늘 뉴욕 날짜) → { subject, html, data } */
function summaryData_(B, td, settings, from0) {
  const tz = 'America/New_York', to = B.add(td, -1), from = from0 && from0 <= to ? from0 : B.prevBiz(td), inP = d => d && d >= from && d <= to;
  const ym = td.substring(0, 7), pym = B.add(ym + '-01', -1).substring(0, 7), monthFirst = ym + '-01';
  const day = iso => iso ? (String(iso).length <= 10 ? String(iso) : B.day(iso)) : '';
  const n = v => Number(v) || 0, sumOf = (L, f) => L.reduce((a, x) => a + n(f(x)), 0);
  const safe = f => { try { return f(); } catch (e) { Logger.log('요약 읽기 실패: ' + e.message); return []; } };
  const orders = safe(() => queryIn_('orders', 'ym', [ym, pym]));
  const invs = safe(() => queryIn_('invoices', 'ym', [ym, pym])).filter(x => x.st !== 'x');
  const ents = safe(() => queryIn_('entries', 'ym', [ym, pym])).filter(e => !e.void && !e.repl);
  const cods = safe(() => queryIn_('cod', 'ym', [ym, pym])).filter(c => !c.void);
  const ships = safe(() => queryGe_('shipments', 'shipDate', B.add(from, -10))).filter(x => !x.voided);
  const sms = safe(() => listAll_('salesmen')).filter(x => x.active !== false);
  /* ① 주문 · 매출 */
  const newO = orders.filter(o => o.kind !== 'credit' && o.sentAt && o.st !== 'x' && o.st !== 'draft' && inP(day(o.sentAt)));   // ↩ 크레딧 요청(orders.kind credit, v0.8.187)은 주문이 아님 — 발행된 CM 은 인보이스 크레딧으로 잡힘
  const isCM = x => x.t === 'CM' || x.src === 'credit';
  const invP = invs.filter(x => inP(x.d) && !isCM(x)), crP = invs.filter(x => inP(x.d) && isCM(x));
  const invM = invs.filter(x => x.d >= monthFirst && x.d <= to && !isCM(x)), crM = invs.filter(x => x.d >= monthFirst && x.d <= to && isCM(x));
  const monthEnd = B.add(B.add(monthFirst, 32).substring(0, 7) + '-01', -1), bdDone = B.between(B.add(monthFirst, -1), to), bdAll = B.between(B.add(monthFirst, -1), monthEnd);
  const salesM = sumOf(invM, x => x.total) + sumOf(crM, x => x.total), pace = bdDone ? salesM / bdDone * bdAll : 0;
  const bySm = (L, amt) => { const m = {}; L.forEach(x => { const k = x.sm || '—'; m[k] = m[k] || { n: 0, a: 0 }; m[k].n++; m[k].a += n(amt(x)); }); return Object.keys(m).sort((a, b) => m[b].a - m[a].a).map(k => [k, m[k].n, m[k].a]); };
  /* ② 수금 */
  const entP = ents.filter(e => inP(e.d)), codP = cods.filter(c => inP(c.d));
  const byM = {}; entP.forEach(e => (e.pays || []).forEach(p => { const k = p.m || 'CHECK'; byM[k] = (byM[k] || 0) + n(p.amt); })); codP.forEach(c => { const k = c.method || 'COD'; byM[k] = (byM[k] || 0) + n(c.amt); });
  const colP = sumOf(entP, e => e.total) + sumOf(codP, c => c.amt), colM = sumOf(ents.filter(e => e.d >= monthFirst && e.d <= to), e => e.total) + sumOf(cods.filter(c => c.d >= monthFirst && c.d <= to), c => c.amt);
  /* ③ 출고 · UPS */
  const shipP = ships.filter(x => inP(x.shipDate)), pk = {}; shipP.forEach(x => { pk[x.shipId || x.lead || x.trk] = x; });
  const shipStores = {}; shipP.forEach(x => { shipStores[x.store || x.acct] = (shipStores[x.store || x.acct] || 0) + 1; });
  const bySvc = {}; shipP.forEach(x => { const k = x.svcName || x.svc || 'UPS'; bySvc[k] = (bySvc[k] || 0) + 1; });
  const shippedO = orders.filter(o => o.shipAt && inP(day(o.shipAt))), dlvDone = orders.filter(o => o.deliveredAt && inP(day(o.deliveredAt)));
  const lastShip = ships.reduce((a, x) => x.shipDate > a ? x.shipDate : a, '');
  /* ④ 특이사항 */
  const cut1h = new Date(Date.now() - 3600000).toISOString(), notes = [];
  const drafts = orders.filter(o => o.st === 'draft' && String(o.updatedAt || o.createdAt || '') < cut1h), unsent = ents.filter(e => e.rep === false && !e.sb && String(e.createdAt || '') < cut1h);
  if (drafts.length) notes.push('📝 안 보낸 주문 ' + drafts.length + '건 ' + money_(sumOf(drafts, o => o.amt)) + ' — ' + bySm(drafts, o => o.amt).map(x => x[0] + ' ' + x[1]).join(', '));
  if (unsent.length) notes.push('💵 리포트로 안 보낸 수금 ' + unsent.length + '건 ' + money_(sumOf(unsent, e => e.total)) + ' — ' + bySm(unsent, e => e.total).map(x => x[0] + ' ' + x[1]).join(', '));
  const STG = [['sent', '📥 신규 확인', o => o.cfOk ? (o.cfAt || o.sentAt) : o.cfReq ? (o.cfReqAt || o.sentAt) : o.sentAt], ['pick', '📦 출고 작업', o => o.pickAt], ['ok', '📦 출고 작업', o => o.pickAt], ['picked', '✅ 검수 · 인보이스', o => o.pickDoneAt || o.pickAt], ['done', '🧾 포장', o => o.doneAt], ['packed', '📮 UPS 픽업', o => o.packAt], ['dlv', '🚗 딜리버리', o => o.dlvAt]];
  const stuck = []; orders.forEach(o => { const g = STG.find(x => x[0] === o.st); if (!g) return; const since = g[2](o) || o.updatedAt; if (!since) return; const ms = B.ms(since); if (ms > 86400000) stuck.push({ o, g: g[1], d: Math.floor(ms / 86400000) }); });
  stuck.sort((a, b) => b.d - a.d);
  if (stuck.length) notes.push('⏱ 한 단계에 영업일 하루 넘게 머문 주문 ' + stuck.length + '건 — ' + stuck.slice(0, 8).map(x => (x.o.store || '') + ' (' + x.g + ' ' + x.d + '일째)').join(', ') + (stuck.length > 8 ? ' …' : ''));
  const cfw = orders.filter(o => o.st === 'sent' && o.cfReq && !o.cfOk), iss = orders.filter(o => o.cfIssueOpen);
  if (cfw.length) notes.push('❓ 세일즈맨 확인 대기 ' + cfw.length + '건 — ' + cfw.slice(0, 5).map(o => (o.sm || '') + ' ' + (o.store || '')).join(', '));
  if (iss.length) notes.push('⚠️ 세일즈맨이 알린 주문 문제 ' + iss.length + '건 — ' + iss.slice(0, 5).map(o => (o.store || '') + ': ' + (o.cfIssue || '')).join(' / '));
  const bnc = safe(() => listAll_('bounces')), bncP = bnc.filter(b => inP(b.d)), bncOpen = bnc.filter(b => (b.st || 'open') === 'open');
  if (bncP.length || bncOpen.length) notes.push('💸 바운스 체크 — 새로 ' + bncP.length + '건 ' + money_(sumOf(bncP, b => b.amt)) + ' · 미해결 ' + bncOpen.length + '건 ' + money_(sumOf(bncOpen, b => b.amt)));
  const crWait = invs.filter(x => isCM(x) && !x.reviewed);
  if (crP.length) notes.push('↩ 새 크레딧 ' + crP.length + '건 ' + money_(sumOf(crP, x => x.total)) + ' — ' + crP.slice(0, 5).map(x => (x.sm || '') + ' ' + (x.store || '') + ' ' + money_(x.total)).join(', '));
  if (crWait.length) notes.push('↩ 사무실 확인 안 한 크레딧 ' + crWait.length + '건 ' + money_(sumOf(crWait, x => x.total)));
  const envs = safe(() => query_('envelopes', 'st', 'sent', 100)).filter(e => e.sentAt && B.between(B.day(e.sentAt), td) >= LATE_DAYS);
  if (envs.length) notes.push('📦 체크 봉투 미도착 (영업일 ' + LATE_DAYS + '일+) ' + envs.length + '개 — ' + envs.slice(0, 5).map(e => e.sm + ' ' + money_(e.total)).join(', '));
  const lastBy = {}; ents.forEach(e => { if (!lastBy[e.sm] || e.d > lastBy[e.sm]) lastBy[e.sm] = e.d; });
  const quiet = sms.map(x => ({ sm: x.code || x._id, d: lastBy[x.code || x._id] || '' })).filter(x => x.d).map(x => Object.assign(x, { n: B.between(x.d, to) })).filter(x => x.n >= 3).sort((a, b) => b.n - a.n);   // 두 달 동안 한 건도 없는 코드(사무실 · 쉬는 사람)는 빼고
  if (quiet.length) notes.push('😶 영업일 3일 넘게 수금 입력이 없는 세일즈맨 — ' + quiet.map(x => x.sm + ' ' + x.n + '일 (마지막 ' + x.d.substring(5).replace('-', '/') + ')').join(', '));
  if (lastShip && B.between(lastShip, to) >= 2) notes.push('📮 UPS 출고 기록이 ' + lastShip + ' 뒤로 없습니다 (영업일 ' + B.between(lastShip, to) + '일) — UPS 라벨 · Quantum View 가져오기를 확인하세요');
  const big = newO.filter(o => n(o.amt) >= 5000);
  if (big.length) notes.push('💰 $5,000 넘는 주문 — ' + big.map(o => (o.sm || '') + ' ' + (o.store || '') + ' ' + money_(o.amt)).join(', '));
  const mailErr = safe(() => query_('reports', 'mail', 'error', 20)), nqErr = safe(() => query_('notifyq', 'st', 'error', 20));
  if (mailErr.length || nqErr.length) notes.push('✉️ 보내기 실패 — 수금 리포트 메일 ' + mailErr.length + '건 · 알림 ' + nqErr.length + '건 (Apps Script 실행 기록 확인)');
  /* 메일 */
  const fd = s => Number(s.substring(5, 7)) + '/' + Number(s.substring(8, 10)) + '(' + '일월화수목금토'.charAt(new Date(s + 'T12:00:00Z').getUTCDay()) + ')';
  const period = from === to ? fd(from) : fd(from) + ' ~ ' + fd(to);
  const th = 'style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px"', tdc = 'style="padding:4px 8px;border-bottom:1px solid #f1f5f9"', tdr = 'style="padding:4px 8px;border-bottom:1px solid #f1f5f9;text-align:right"';
  const tbl = (head, rows) => rows.length ? '<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:13px;margin:4px 0 10px"><tr>' + head.map((x, i) => '<th ' + th + (i ? ' align="right"' : '') + '>' + x + '</th>').join('') + '</tr>' + rows.map(r => '<tr>' + r.map((c, i) => '<td ' + (i ? tdr : tdc) + '>' + c + '</td>').join('') + '</tr>').join('') + '</table>' : '';
  const kpi = (L, v) => '<td style="padding:8px 12px;background:#f8fafc;border-radius:8px"><div style="font-size:12px;color:#64748b">' + L + '</div><div style="font-size:18px;font-weight:800">' + v + '</div></td>';
  const sec = (t, body) => '<h3 style="margin:18px 0 6px;font-size:16px">' + t + '</h3>' + body;
  const boxes = shipP.length, pkgN = Object.keys(pk).length;
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:680px">' +
    '<h2 style="margin:0">📊 THE ONE 일일 요약 — ' + esc_(period) + '</h2><div style="color:#64748b;font-size:13px">영업일 기준 (주말 · 휴일 빼고) · 이번 달 영업일 ' + bdDone + '/' + bdAll + '일 지남 · ' + esc_(td) + ' 아침</div>' +
    '<table style="border-spacing:6px;margin:8px -6px"><tr>' + kpi('새 주문', newO.length + '건 ' + money_(sumOf(newO, o => o.amt))) + kpi('인보이스 매출', money_(sumOf(invP, x => x.total))) + kpi('수금', money_(colP)) + kpi('📦 UPS 박스', boxes + '개') + '</tr></table>' +
    (notes.length ? sec('⚠️ 특이사항 · 확인할 것', '<ul style="margin:4px 0 0;padding-left:20px;font-size:14px;line-height:1.55">' + notes.map(x => '<li>' + esc_(x) + '</li>').join('') + '</ul>') : sec('⚠️ 특이사항', '<div style="color:#15803d">✅ 특별히 확인할 것이 없습니다</div>')) +
    sec('🛒 주문 · 매출', '<div style="font-size:14px">새로 들어온 주문 <b>' + newO.length + '건 ' + money_(sumOf(newO, o => o.amt)) + '</b> · 인보이스 <b>' + invP.length + '장 ' + money_(sumOf(invP, x => x.total)) + '</b>' + (crP.length ? ' · 크레딧 ' + crP.length + '장 ' + money_(sumOf(crP, x => x.total)) : '') + '<br>이번 달 매출(인보이스 − 크레딧) <b>' + money_(salesM) + '</b>' + (pace ? ' · 이 속도면 월말 약 <b>' + money_(pace) + '</b>' : '') + '</div>' +
      tbl(['세일즈맨', '새 주문', '금액'], bySm(newO, o => o.amt).map(x => [esc_(x[0]), x[1] + '건', money_(x[2])]))) +
    sec('💵 수금', '<div style="font-size:14px">합계 <b>' + money_(colP) + '</b> (세일즈맨 ' + entP.length + '건 ' + money_(sumOf(entP, e => e.total)) + ' · 사무실 COD/ACH/카드 ' + codP.length + '건 ' + money_(sumOf(codP, c => c.amt)) + ') · 이번 달 누적 <b>' + money_(colM) + '</b><br>' + Object.keys(byM).sort((a, b) => byM[b] - byM[a]).map(k => esc_(k) + ' ' + money_(byM[k])).join(' · ') + '</div>' +
      tbl(['세일즈맨', '수금', '금액'], bySm(entP, e => e.total).map(x => [esc_(x[0]), x[1] + '건', money_(x[2])]))) +
    sec('📦 출고 · UPS', '<div style="font-size:14px">UPS <b>' + boxes + '박스</b> (' + pkgN + '건 · ' + Object.keys(shipStores).length + '곳 · ' + Math.round(sumOf(shipP, x => x.w)) + ' lb' + (sumOf(shipP, x => x.cost) ? ' · 운임 ' + money_(sumOf(shipP, x => x.cost)) : '') + ')' + (Object.keys(bySvc).length ? ' — ' + Object.keys(bySvc).map(k => esc_(k) + ' ' + bySvc[k]).join(' · ') : '') +
      '<br>출고 끝난 주문 ' + shippedO.length + '건' + (dlvDone.length ? ' · 🚗 딜리버리 완료 ' + dlvDone.length + '건' : '') + (lastShip ? ' · UPS 기록 마지막 날짜 ' + esc_(lastShip) : '') + '</div>' +
      tbl(['가게', '박스'], Object.keys(shipStores).sort((a, b) => shipStores[b] - shipStores[a]).slice(0, 12).map(k => [esc_(k), shipStores[k]]))) +
    '<p style="color:#94a3b8;font-size:12px;margin-top:18px">THE ONE 앱 자동 요약 · 받는 사람 · 시각은 앱 관리 → 설정에서 바꿉니다</p></div>';
  const subject = '[THE ONE] 📊 일일 요약 ' + period + ' — 주문 ' + newO.length + '건 ' + money_(sumOf(newO, o => o.amt)) + ' · 수금 ' + money_(colP) + ' · UPS ' + boxes + '박스' + (notes.length ? ' · ⚠️ ' + notes.length : '');
  const any = !!(newO.length || invP.length || crP.length || entP.length || codP.length || shipP.length || shippedO.length || dlvDone.length);   // 그 기간에 한 건이라도 들어왔나 (특이사항만으로는 안 보냄)
  return { subject, html, data: { any, from, to, newO: newO.length, newAmt: sumOf(newO, o => o.amt), invN: invP.length, invAmt: sumOf(invP, x => x.total), col: colP, boxes, notes } };
}

/* ---------- 📦 체크 봉투 미도착 — 보낸 지 LATE_DAYS 지나도 도착 확인이 안 된 봉투는 세일즈맨 · 담당자에게 한 번 알림 (봉투에 lateAt 기록) ---------- */
const LATE_DAYS = 10;   // 영업일 10일 ≈ 2주 (v0.8.180 — 전엔 달력 14일)
function envelopesLate_() {
  if (new Date().getMinutes() >= 10) return;   // 1시간에 한 번만 (5분 트리거 중 첫 번)
  const list = query_('envelopes', 'st', 'sent', 50);
  if (!list.some(e => !e.lateAt)) return;
  const B = biz_(), td = today_();
  const late = list.filter(e => !e.lateAt && e.sentAt && B.between(B.day(e.sentAt), td) >= LATE_DAYS);
  if (!late.length) return;
  const settings = getDoc_('settings', 'app') || {}, staff = String(settings.reportTo || DEFAULT_TO).split(/[,;\s]+/).filter(isEmail_);
  const props = PropertiesService.getScriptProperties();
  late.forEach(e => {
    try {
      const to = []; query_('users', 'sm', String(e.sm), 5).forEach(u => { const m = u.email || u._id; if (isEmail_(m) && to.indexOf(m) < 0) to.push(m); }); staff.forEach(m => { if (to.indexOf(m) < 0) to.push(m); });
      const got = Object.keys(e.got || {}).length, days = Math.floor((Date.now() - new Date(e.sentAt).getTime()) / 86400000);
      const text = '⚠️ 체크 봉투 미도착 — ' + e.sm + ' · ' + e._id + ' · ' + (e.sentAt || '').substring(0, 10) + ' 보냄 (영업일 ' + B.between(B.day(e.sentAt), td) + '일 전) · ' + (e.n || 0) + '장 ' + money_(e.total) + (got ? ' · 도착 ' + got + '/' + (e.n || 0) : ' · 아직 한 장도 도착 확인 안 됨') + (e.trk ? '\n추적: ' + e.trk : '') + '\n세일즈맨: 보낸 날짜 · 추적 번호를 확인해 주세요. 담당자: 우편물을 확인하고 앱 → 수금 확인 → 📦 봉투에서 맞춰 주세요.';
      if (to.length) MailApp.sendEmail({ to: to.join(','), subject: '[THE ONE] ⚠️ 체크 봉투 미도착 — ' + e.sm + ' ' + e._id, name: 'THE ONE', replyTo: REPLY_TO, htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px">' + text.split('\n').map(esc_).join('<br>') + '</div>' });
      const hook = (props.getProperty('CHAT_WEBHOOK_' + String(e.sm).toUpperCase().replace(/[^A-Z0-9]/g, '_'))) || props.getProperty('CHAT_WEBHOOK');
      if (hook) { const id = to.length ? chatId_(to[0]) : ''; UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ text: (id ? '<users/' + id + '> ' : '') + text }), muteHttpExceptions: true }); }
      patch_('envelopes', e._id, { lateAt: new Date().toISOString(), lateTo: to.join(', ') });
    } catch (x) { Logger.log('봉투 알림 실패 ' + e._id + ': ' + x.message); }
  });
}

/** 이메일 → 구글 사용자 ID (챗 @멘션용). Admin Directory 로 한 번 찾고 스크립트 속성에 기억. 못 찾으면 '' (멘션 없이 올림) */
/* ---------- 📷 드라이브 사진 색인 — 한 시간마다 공유 드라이브 item_picture(아이템 사진) · Gallery(세트 · 인서트 사진)의 파일 이름(코드)을 Firestore catalog/photoIndex 에 써 둠 ----------
 *   앱은 이 색인으로 코드와 같은 이름의 사진을 자동으로 붙임 (사진 주소를 손으로 적을 필요 없음).
 *   사진은 공유 드라이브 "item_picture" 바로 아래에 있음 (드라이브 ID 0AMfb0x3MT-Y9Uk9PVA). 다른 폴더를 쓰려면 스크립트 속성 PHOTO_FOLDER_ID / GALLERY_FOLDER_ID 에 폴더(또는 공유 드라이브) ID.
 *   Drive API(REST) 로 읽음 — 공유 드라이브까지 포함 (supportsAllDrives). 폴더 안의 하위 폴더도 훑음. */
const PHOTO_DRIVE_DEFAULT = '0AMfb0x3MT-Y9Uk9PVA', GALLERY_DRIVE_DEFAULT = '';
function photoIndexRun_() {
  const P = PropertiesService.getScriptProperties(), last = Number(P.getProperty('PHOTO_IDX_AT') || 0);
  if (Date.now() - last < 55 * 60 * 1000) return;
  P.setProperty('PHOTO_IDX_AT', String(Date.now()));
  const pic = {}, gal = {};
  const n1 = driveScan_(P.getProperty('PHOTO_FOLDER_ID') || PHOTO_DRIVE_DEFAULT, pic), n2 = driveScan_(P.getProperty('GALLERY_FOLDER_ID') || GALLERY_DRIVE_DEFAULT, gal);
  if (!n1 && !n2) { Logger.log('사진 폴더에서 사진을 찾지 못했습니다 — PHOTO_FOLDER_ID 를 확인하세요'); return; }
  const at = new Date().toISOString();
  patch_('catalog', 'photoIndex', { pic, gal, n: n1 + n2, at });
  Logger.log('사진 색인: item_picture ' + n1 + ' · Gallery ' + n2);
}
/* 폴더(또는 공유 드라이브 루트) 안의 사진 파일을 하위 폴더까지 — out[코드] = 파일 ID. 같은 코드가 여럿이면 먼저 나온 것 */
function driveScan_(folderId, out) {
  if (!folderId) return 0;
  let n = 0; const todo = [folderId], seen = {};
  while (todo.length) {
    const fid = todo.shift(); if (seen[fid]) continue; seen[fid] = 1;
    let token = '';
    do {
      const q = encodeURIComponent("'" + fid + "' in parents and trashed = false");
      const url = 'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' + (token ? '&pageToken=' + token : '');
      const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) { Logger.log('Drive 읽기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200)); return n; }
      const j = JSON.parse(res.getContentText());
      (j.files || []).forEach(f => {
        if (f.mimeType === 'application/vnd.google-apps.folder') { todo.push(f.id); return; }
        if (!/^image\//.test(f.mimeType || '') && !/\.(jpe?g|png|webp|gif|heic)$/i.test(f.name || '')) return;
        const code = String(f.name || '').replace(/\.[^.]+$/, '').trim().toUpperCase(); if (!code || out[code]) return;
        out[code] = f.id; n++;
      });
      token = j.nextPageToken || '';
    } while (token);
  }
  return n;
}
function testPhotoIndex() { PropertiesService.getScriptProperties().deleteProperty('PHOTO_IDX_AT'); photoIndexRun_(); const d = getDoc_('catalog', 'photoIndex'); Logger.log(d ? '색인 ' + d.n + '개 · ' + d.at : '색인 없음'); }
function chatId_(email) {
  const P = PropertiesService.getScriptProperties(), k = 'CHATID_' + String(email).toLowerCase();
  const c = P.getProperty(k); if (c) return c === '-' ? '' : c;
  let id = '';
  try { id = String(AdminDirectory.Users.get(email, { fields: 'id' }).id || ''); } catch (e) { Logger.log('사용자 ID 못 찾음 ' + email + ': ' + e.message); }
  P.setProperty(k, id || '-'); return id;
}
/** 시험 — 세일즈맨 전용 방 전부에 한 줄씩 (CHAT_WEBHOOK_BRANDON 처럼 만든 뒤 실행) */
function testChatRooms() {
  const P = PropertiesService.getScriptProperties().getProperties(), keys = Object.keys(P).filter(k => k.indexOf('CHAT_WEBHOOK_') === 0).sort();
  if (!keys.length) { Logger.log('세일즈맨 전용 방(CHAT_WEBHOOK_코드)이 없습니다 — 공용 방(CHAT_WEBHOOK)만 씁니다'); return; }
  keys.forEach(k => { const r = UrlFetchApp.fetch(P[k], { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ text: '🔔 THE ONE 알림 시험 — ' + k.replace('CHAT_WEBHOOK_', '') + ' 방' }), muteHttpExceptions: true }); Logger.log(k + ' → ' + r.getResponseCode()); });
}
/** 시험 — 챗 스페이스에 나를 멘션해서 한 줄 (CHAT_WEBHOOK 설정 뒤 실행) */
function testChat() {
  const hook = PropertiesService.getScriptProperties().getProperty('CHAT_WEBHOOK');
  if (!hook) { Logger.log('스크립트 속성 CHAT_WEBHOOK 이 없습니다'); return; }
  const me = Session.getActiveUser().getEmail(), id = chatId_(me);
  const r = UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ text: (id ? '<users/' + id + '> ' : '') + '🔔 THE ONE 알림 시험 — ' + (id ? '멘션 OK' : '멘션 못 함 (Admin Directory 권한 확인)') }), muteHttpExceptions: true });
  Logger.log('챗 ' + r.getResponseCode() + ' · 내 ID ' + (id || '없음'));
}

/* ---------- 메일 본문 (예전 Daily Collection Report 와 같은 모양) ---------- */
function reportHtml(r) {
  const rows = r.rows || [];
  const sumBy = m => rows.filter(x => String(x.pay || '').toUpperCase().indexOf(m) >= 0).reduce((a, x) => a + (Number(x.amt) || 0), 0);
  const th = 'background:#1f2937;color:#fff;padding:8px 10px;text-align:left;font-size:13px;border:1px solid #1f2937';
  const td = 'padding:8px 10px;border:1px solid #e5e7eb;font-size:13px;vertical-align:middle';
  let h = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111">' +
    '<h1 style="font-size:26px;margin:0 0 4px">Daily Collection Report</h1>' +
    '<div style="font-size:18px;color:#555;margin-bottom:16px"><b>' + esc_(r.sm) + '</b> &nbsp;|&nbsp; ' + esc_(r.d) + ' &nbsp;|&nbsp; THE ONE</div>' +
    '<table style="border-collapse:collapse"><tr>' + ['#', 'Store', 'Acct #', 'Address', 'Pay', 'Check # / Ref', 'Amount', 'Invoice / Memo', 'Received', 'Deposit Date'].map(x => '<th style="' + th + '">' + x + '</th>').join('') + '</tr>';
  rows.forEach((x, i) => {
    const late = x.dep && x.rcv && x.dep !== x.rcv;
    h += '<tr><td style="' + td + '">' + (i + 1) + '</td><td style="' + td + '">' + esc_(x.store) + '</td><td style="' + td + '">' + esc_(x.acct) + '</td><td style="' + td + ';max-width:120px">' + esc_(x.addr) + '</td>' +
      '<td style="' + td + '">' + esc_(x.pay) + '</td><td style="' + td + '">' + esc_(x.ref) + '</td><td style="' + td + ';text-align:right">' + money_(x.amt) + '</td>' +
      '<td style="' + td + '">' + (x.invs || []).map(v => '<b>' + esc_(v.no) + '</b> ' + money_(v.amt)).join('<br>') + (x.memo ? '<div style="color:#666;font-size:12px;margin-top:4px">' + esc_(x.memo) + '</div>' : '') + '</td>' +
      '<td style="' + td + '">' + esc_(x.rcv) + '</td><td style="' + td + (late ? ';background:#bfdbfe;font-weight:700' : '') + '">' + esc_(x.dep || x.rcv) + '</td></tr>';
  });
  h += '<tr><td colspan="6" style="' + td + ';text-align:right;background:#e5e7eb;font-weight:700">TOTAL (' + rows.length + ' 건)</td><td style="' + td + ';text-align:right;background:#e5e7eb;font-weight:700">' + money_(r.total) + '</td><td colspan="3" style="' + td + ';background:#e5e7eb"></td></tr></table>' +
    '<div style="font-size:18px;color:#444;margin-top:16px">CHECK: <b>' + money_(sumBy('CHECK')) + '</b> &nbsp;&nbsp; ZELLE: <b>' + money_(sumBy('ZELLE')) + '</b> &nbsp;&nbsp; CASH: <b>' + money_(sumBy('CASH')) + '</b></div>' +
    ((r.photos || []).length ? '<div style="color:#666;margin-top:10px">📷 체크 사진 ' + r.photos.length + '장 첨부</div>' : '') + '</div>';
  return h;
}

/* ---------- Firestore REST (설치한 계정 권한) ---------- */
function headers_() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT }; }
function getDoc_(col, id) {
  const res = UrlFetchApp.fetch(BASE + '/' + col + '/' + encodeURIComponent(id), { headers: headers_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  return fromDoc_(JSON.parse(res.getContentText()));
}
function query_(col, field, val, limit) {
  const body = { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: val } } }, limit: limit || 20 } };
  const res = UrlFetchApp.fetch(BASE + ':runQuery', { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), headers: headers_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Firestore 읽기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300));
  return JSON.parse(res.getContentText()).filter(x => x.document).map(x => fromDoc_(x.document));
}
/** query_ 와 같지만 값의 종류를 직접 ({ stringValue } · { booleanValue }) */
function queryVal_(col, field, value, limit) {
  const body = { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: value } }, limit: limit || 20 } };
  const res = UrlFetchApp.fetch(BASE + ':runQuery', { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), headers: headers_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Firestore 읽기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300));
  return JSON.parse(res.getContentText()).filter(x => x.document).map(x => fromDoc_(x.document));
}
function patch_(col, id, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const fields = {}; Object.keys(data).forEach(k => { fields[k] = toVal_(data[k]); });
  UrlFetchApp.fetch(BASE + '/' + col + '/' + encodeURIComponent(id) + '?' + mask, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields }), headers: headers_(), muteHttpExceptions: true });
}
function listAll_(col) { let out = [], t = ''; do { const res = UrlFetchApp.fetch(BASE + '/' + col + '?pageSize=300' + (t ? '&pageToken=' + encodeURIComponent(t) : ''), { headers: headers_(), muteHttpExceptions: true }); if (res.getResponseCode() !== 200) break; const j = JSON.parse(res.getContentText()); (j.documents || []).forEach(d => out.push(fromDoc_(d))); t = j.nextPageToken || ''; } while (t); return out; }
function delDoc_(col, id) { UrlFetchApp.fetch(BASE + '/' + col + '/' + encodeURIComponent(id), { method: 'delete', headers: headers_(), muteHttpExceptions: true }); }
function fromDoc_(d) { const o = fromFields_(d.fields || {}); o._id = String(d.name || '').split('/').pop(); return o; }
function fromFields_(f) { const o = {}; Object.keys(f).forEach(k => { o[k] = fromVal_(f[k]); }); return o; }
function fromVal_(v) {
  if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null; if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromVal_); if ('mapValue' in v) return fromFields_(v.mapValue.fields || {}); return null;
}
function toVal_(x) { if (x === null || x === undefined) return { nullValue: null }; if (typeof x === 'number') return { doubleValue: x }; if (typeof x === 'boolean') return { booleanValue: x }; if (Array.isArray(x)) return { arrayValue: { values: x.map(toVal_) } }; if (typeof x === 'object') { const f = {}; Object.keys(x).forEach(k => { f[k] = toVal_(x[k]); }); return { mapValue: { fields: f } }; } return { stringValue: String(x) }; }

/* ---------- 작은 도구 ---------- */
function dataUrlBlob_(s, name) { const m = String(s || '').match(/^data:([^;]+);base64,(.+)$/); if (!m || m[2].length < 2000) return null; const ext = m[1].indexOf('png') >= 0 ? '.png' : '.jpg'; return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + ext); }
function isEmail_(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '')); }
function money_(n) { n = Number(n) || 0; return (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function today_() { return Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd'); }


/* ============================================================
 *  💳 COD · ACH · 카드 — 구글시트 COD 입력 탭 → 앱 (5분마다)
 *    시트 한 줄 = cod 문서 하나. ID 칸(없으면 만들어 시트에 써 둠)이 문서 ID 라 몇 번을 돌려도 중복 없음.
 *    바뀐 줄만 올림 (settings/codSync 에 줄별 해시 보관). 앱에서 정한 ✓ 확인(v) · 정산 완료(settled) · VOID 는 건드리지 않음.
 *    날짜는 2026-10-13 · 10/13/2026 · 10.13.2026 · 시트 날짜값 모두 읽고, 못 읽는 줄(예: 2026-10-120)은 건너뛰고 로그에 남김.
 * ============================================================ */
const COD_SHEET_DEFAULT = '1zX7VqiU-RqH54670RQgB93qpqQn_1zJGgrpFNCvw6kg', COD_TAB_DEFAULT = 'COD 입력';
function codSyncRun_() {
  const P = PropertiesService.getScriptProperties();
  if (P.getProperty('COD_SYNC') !== 'on') return;   // 기본은 꺼짐 — 앱에서 직접 입력하는 것이 기준. 시트를 계속 쓸 때만 속성 COD_SYNC=on
  const ss = SpreadsheetApp.openById(P.getProperty('COD_SHEET_ID') || COD_SHEET_DEFAULT);
  const sh = ss.getSheetByName(P.getProperty('COD_TAB') || COD_TAB_DEFAULT);
  if (!sh) { Logger.log('COD 동기화: 탭 "' + (P.getProperty('COD_TAB') || COD_TAB_DEFAULT) + '" 이 없습니다'); return; }
  const vals = sh.getDataRange().getValues(); if (vals.length < 2) return;
  const H = hdrIdx_(vals[0], { sm: /세일즈맨/, d: /날짜/, acct: /계정코드/, store: /가게/, method: /결제 방법/, ref: /참조/, amt: /^금액/, invA: /^A 인보이스/, amtA: /^A 금액/, invP: /^P 인보이스/, amtP: /^P 금액/, invCM: /^CM 인보이스/, amtCM: /^CM 금액/, invW: /^W 인보이스/, amtW: /^W 금액/, disc: /디스카운트/, note: /^메모/, id: /^ID$/ });
  if (H.sm < 0 || H.d < 0 || H.amt < 0) { Logger.log('COD 동기화: 머리글(세일즈맨 · 날짜 · 금액)을 못 찾았습니다'); return; }
  const state = getDoc_('settings', 'codSync') || {}, seen = state.rows || {}, next = {};
  let nNew = 0, nUpd = 0, nSkip = 0, nSame = 0; const bad = [];
  const now = new Date().toISOString();
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i], sm = String(r[H.sm] || '').trim().toUpperCase();
    if (!sm && !r[H.d] && !r[H.amt]) continue;   // 빈 줄
    const d = dstr_(r[H.d]);
    if (!sm || !d) { nSkip++; bad.push((i + 1) + '행: ' + (sm ? '날짜 "' + r[H.d] + '"' : '세일즈맨 없음')); continue; }
    const amt = Math.round(num_(r[H.amt]) * 100) / 100; if (!amt) { nSkip++; bad.push((i + 1) + '행: 금액 없음'); continue; }
    let id = String(r[H.id] || '').trim();
    if (!id) {   // ID 만들어 시트에 써 둠 — 그 뒤로는 이 줄이 이 문서
      id = 'S' + Utilities.formatDate(new Date(), 'America/New_York', 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      if (H.id >= 0) sh.getRange(i + 1, H.id + 1).setValue(id);
    }
    const invs = []; ['A', 'P', 'CM', 'W'].forEach(t => { const raw = String(r[H['inv' + t]] == null ? '' : r[H['inv' + t]]).trim(), a = Math.round(num_(r[H['amt' + t]]) * 100) / 100; if (!raw) return; raw.split(/[\s,]+/).filter(Boolean).forEach((x, j) => invs.push({ no: invNo_(x), t, amt: j === 0 ? a : 0 })); });
    const m0 = String(r[H.method] || 'COD').trim().toUpperCase(), method = /CARD|CREDIT/.test(m0) ? 'CREDIT CARD' : /ACH/.test(m0) ? 'ACH' : 'COD';
    const dsc = r[H.disc] === '' || r[H.disc] == null ? '' : (num_(r[H.disc]) <= 1 ? num_(r[H.disc]) * 100 : num_(r[H.disc]));
    const data = { id, d, ym: d.substring(0, 7), sm, acct: pad4_(r[H.acct]), store: String(r[H.store] || '').trim(), method, ref: String(r[H.ref] || '').trim(), amt, invs, disc: dsc, note: String(r[H.note] || '').trim(), src: 'sheet', sheetRow: i + 1, syncAt: now };
    const hash = JSON.stringify([data.d, data.sm, data.acct, data.store, data.method, data.ref, data.amt, data.invs, data.disc, data.note]);
    next[id] = hash;
    if (seen[id] === hash) { nSame++; continue; }
    const made = upsert_('cod', id, data, { v: false, vbad: false, vn: '', settled: '', void: false, createdBy: 'sheet', createdAt: now });
    if (made === 'new') nNew++; else nUpd++;
  }
  patch_('settings', 'codSync', { rows: next, at: now, n: Object.keys(next).length, nNew, nUpd, nSkip, bad: bad.slice(0, 50) });
  Logger.log('COD 동기화: 새로 ' + nNew + ' · 바뀜 ' + nUpd + ' · 같음 ' + nSame + ' · 건너뜀 ' + nSkip + (bad.length ? '\n' + bad.slice(0, 20).join('\n') : ''));
}
/** 바로 실행해 보기 — 실행 로그에 결과 */
function testCodSync() { PropertiesService.getScriptProperties().setProperty('COD_SYNC', 'on'); codSyncRun_(); const s = getDoc_('settings', 'codSync'); Logger.log(s ? '시트 줄 ' + s.n + ' · 새로 ' + s.nNew + ' · 바뀜 ' + s.nUpd + ' · 건너뜀 ' + s.nSkip + ' · ' + s.at : '결과 없음'); }
/** 있으면 시트 칸만 고치고(앱의 ✓ · 정산 · VOID 는 그대로), 없으면 기본값과 함께 새로 만듦 → 'new' | 'upd' */
function upsert_(col, id, data, defaults) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const fields = {}; Object.keys(data).forEach(k => { fields[k] = toVal_(data[k]); });
  const res = UrlFetchApp.fetch(BASE + '/' + col + '/' + encodeURIComponent(id) + '?' + mask + '&currentDocument.exists=true', { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields }), headers: headers_(), muteHttpExceptions: true });
  if (res.getResponseCode() === 200) return 'upd';
  if (res.getResponseCode() !== 404) throw new Error('Firestore 쓰기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200));
  const all = Object.assign({}, defaults || {}, data), f2 = {}; Object.keys(all).forEach(k => { f2[k] = toVal_(all[k]); });
  const res2 = UrlFetchApp.fetch(BASE + '/' + col + '/' + encodeURIComponent(id), { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields: f2 }), headers: headers_(), muteHttpExceptions: true });
  if (res2.getResponseCode() !== 200) throw new Error('Firestore 만들기 실패 ' + res2.getResponseCode() + ': ' + res2.getContentText().substring(0, 200));
  return 'new';
}
function hdrIdx_(row, want) { const out = {}; const h = (row || []).map(x => String(x == null ? '' : x).trim()); Object.keys(want).forEach(k => { out[k] = h.findIndex(x => want[k].test(x)); }); return out; }
function num_(v) { if (typeof v === 'number') return v; const s = String(v == null ? '' : v).replace(/[$,\s]/g, ''); if (!s) return 0; const n = Number(s.replace(/^\((.*)\)$/, '-$1')); return isFinite(n) ? n : 0; }
function pad4_(v) { const s = String(v == null ? '' : v).trim().replace(/\.0+$/, ''); return /^\d{1,3}$/.test(s) ? s.padStart(4, '0') : s; }
function invNo_(v) { const s = String(v || '').trim().toUpperCase().replace(/\s+/g, ''); const m = s.match(/^([A-Z]{1,2})-?(\d{1,6})$/); return m ? m[1] + '-' + m[2].padStart(6, '0') : s; }
/** 날짜 → yyyy-MM-dd (시트 날짜값 · 2026-10-13 · 10/13/2026 · 10.13.2026 · 10-13-26). 못 읽으면 '' */
function dstr_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'America/New_York', 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim(); if (!s) return '';
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/); if (m) return ok_(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/); if (m) return ok_(m[3].length === 2 ? '20' + m[3] : m[3], m[1], m[2]);
  return '';
}
function ok_(y, mo, d) { mo = Number(mo); d = Number(d); if (mo < 1 || mo > 12 || d < 1 || d > 31) return ''; return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }


/* ============================================================
 *  ☁️ 앱에서 찍은 아이템 사진 → 구글 드라이브 item_picture (5분마다, 한 번에 8장)
 *    photoUploads/{id} = { code, data(dataURL), mime, by, at, drive: wait|done|error, driveId, err }
 * ============================================================ */
const DRIVE_API = 'https://www.googleapis.com/drive/v3', DRIVE_UP = 'https://www.googleapis.com/upload/drive/v3';
function photoExportRun_() {
  let list = []; try { list = query_('photoUploads', 'drive', 'wait', 8); } catch (e) { Logger.log('photoUploads 읽기 실패: ' + e.message); return; }
  if (!list.length) return;
  const P = PropertiesService.getScriptProperties(), folder = P.getProperty('PHOTO_UPLOAD_FOLDER_ID') || P.getProperty('PHOTO_FOLDER_ID') || PHOTO_DRIVE_DEFAULT;
  const idx = {}; let nOk = 0;
  list.forEach(u => {
    const code = String(u.code || '').trim().toUpperCase(); if (!code) { patch_('photoUploads', u._id, { drive: 'error', err: '코드 없음' }); return; }
    try {
      const blob = dataUrlBlob_(u.data, code); if (!blob) throw new Error('사진 데이터가 없거나 너무 작음');
      const name = code + (blob.getContentType().indexOf('png') >= 0 ? '.png' : '.jpg');
      const found = driveFind_(name, folder);
      let fileId;
      if (found) { driveUpdate_(found, blob); fileId = found; }
      else fileId = driveCreate_(name, blob, folder);
      idx[code] = fileId; nOk++;
      patch_('photoUploads', u._id, { drive: 'done', driveId: fileId, driveAt: new Date().toISOString(), data: '' });
    } catch (e) { Logger.log('사진 올리기 실패 ' + code + ': ' + e.message); patch_('photoUploads', u._id, { drive: 'error', err: String(e.message).substring(0, 200) }); }
  });
  if (nOk) {
    /* 사진 색인에 바로 붙임 — pic.`코드` 만 갱신 (코드에 - 가 있을 수 있어 백틱) */
    const fields = {}, masks = []; Object.keys(idx).forEach(c => { fields[c] = idx[c]; masks.push('pic.`' + c.replace(/`/g, '') + '`'); });
    const body = { fields: { pic: { mapValue: { fields: Object.keys(fields).reduce((o, c) => { o[c] = { stringValue: fields[c] }; return o; }, {}) } }, at: { stringValue: new Date().toISOString() } } };
    const mask = masks.concat(['at']).map(m => 'updateMask.fieldPaths=' + encodeURIComponent(m)).join('&');
    UrlFetchApp.fetch(BASE + '/catalog/photoIndex?' + mask, { method: 'patch', contentType: 'application/json', payload: JSON.stringify(body), headers: headers_(), muteHttpExceptions: true });
    Logger.log('사진 드라이브 저장: ' + nOk + '장 (' + Object.keys(idx).join(', ') + ')');
  }
}
function testPhotoExport() { photoExportRun_(); Logger.log('photoExportRun_ 실행 — 위 로그 확인 (대기 중인 사진이 없으면 아무것도 안 나옵니다)'); }
/** 폴더(또는 공유 드라이브) 안에서 같은 이름 파일 찾기 → 파일 ID 또는 null */
function driveFind_(name, folderId) {
  const q = "name = '" + name.replace(/'/g, "\\'") + "' and trashed = false and '" + folderId + "' in parents";
  const res = UrlFetchApp.fetch(DRIVE_API + '/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=5', { headers: headers_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('드라이브 찾기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200));
  const f = (JSON.parse(res.getContentText()).files || [])[0]; return f ? f.id : null;
}
function driveCreate_(name, blob, folderId) {
  const boundary = 'theone' + Date.now();
  const meta = JSON.stringify({ name, parents: [folderId] });
  const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\nContent-Type: ' + blob.getContentType() + '\r\n\r\n';
  const tail = '\r\n--' + boundary + '--';
  const payload = Utilities.newBlob(head).getBytes().concat(blob.getBytes()).concat(Utilities.newBlob(tail).getBytes());
  const res = UrlFetchApp.fetch(DRIVE_UP + '/files?uploadType=multipart&supportsAllDrives=true&fields=id', { method: 'post', contentType: 'multipart/related; boundary=' + boundary, payload, headers: headers_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('드라이브 올리기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200));
  return JSON.parse(res.getContentText()).id;
}
function driveUpdate_(fileId, blob) {
  const res = UrlFetchApp.fetch(DRIVE_UP + '/files/' + fileId + '?uploadType=media&supportsAllDrives=true', { method: 'patch', contentType: blob.getContentType(), payload: blob.getBytes(), headers: headers_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('드라이브 바꾸기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200));
}
