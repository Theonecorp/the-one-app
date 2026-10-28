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
 * 🔔 앱 알림(notifyq): 주문 확인 요청 · 주문 문제 · 문의를 이메일로, 스크립트 속성 CHAT_WEBHOOK 이 있으면 구글 챗 스페이스에도 (5분마다 같이)
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
  run();
  Logger.log('설치 완료 — 5분마다 Daily Report 를 보냅니다');
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
    try { photoIndexRun_(); } catch (e) { Logger.log('사진 색인 실패: ' + e.message); }
    let list = [];
    try { list = query_('reports', 'mail', 'wait', 20); }
    catch (e) { if (/ 429/.test(String(e.message))) { Logger.log('Firestore 하루 무료 한도 초과 — 한도가 다시 차면 이어서 보냅니다'); return; } throw e; }
    if (!list.length) return;   // 보낼 것이 없으면 설정도 안 읽음 (읽기 아끼기)
    const settings = getDoc_('settings', 'app') || {};
    const cc = String(settings.reportTo || DEFAULT_TO).split(/[,;\s]+/).filter(isEmail_);
    list.forEach(r => {
      try {
        const to = [];
        if (isEmail_(r.by)) to.push(r.by);
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
  const list = query_('notifyq', 'st', 'wait', 30);
  if (!list.length) return;
  const settings = getDoc_('settings', 'app') || {};
  const staff = String(settings.reportTo || DEFAULT_TO).split(/[,;\s]+/).filter(isEmail_);
  const props = PropertiesService.getScriptProperties();
  const hookOf = sm => (sm && props.getProperty('CHAT_WEBHOOK_' + String(sm).toUpperCase().replace(/[^A-Z0-9]/g, '_'))) || props.getProperty('CHAT_WEBHOOK');   // 세일즈맨 전용 방이 있으면 거기로, 없으면 공용 방
  list.forEach(n => {
    try {
      const to = [];
      if (n.toSm) query_('users', 'sm', String(n.toSm), 5).forEach(u => { const e = u.email || u._id; if (isEmail_(e) && to.indexOf(e) < 0) to.push(e); });
      if (n.toStaff) staff.forEach(e => { if (to.indexOf(e) < 0) to.push(e); });
      const lines = String(n.text || '').split('\n');
      if (to.length) MailApp.sendEmail({ to: to.join(','), subject: n.subject || '[THE ONE] 알림', name: 'THE ONE', replyTo: isEmail_(n.by) ? n.by : REPLY_TO,
        htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px">' + lines.map(esc_).join('<br>') + (n.byName || n.by ? '<p style="color:#64748b;font-size:13px">— ' + esc_(n.byName || n.by) + '</p>' : '') +
          (n.url ? '<p><a href="' + esc_(n.url) + '" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">앱에서 열기 · Open in app</a></p>' : '') + '</div>' });
      let chat = '';
      const hook = hookOf(n.toSm);
      if (n.chat && hook) {
        /* 받는 세일즈맨을 @멘션 — 구글 챗이 그 사람 폰에 알림을 보냄 (앱이 닫혀 있어도) */
        const mention = to.filter(e => n.toSm).map(chatId_).filter(Boolean).map(id => '<users/' + id + '>').join(' ');
        const r = UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ text: (mention ? mention + ' ' : '') + String(n.text || '') + (n.byName ? '\n— ' + n.byName : '') + (n.url ? '\n' + n.url : '') }), muteHttpExceptions: true });
        chat = r.getResponseCode() === 200 ? 'ok' : 'error ' + r.getResponseCode();
      }
      patch_('notifyq', n._id, { st: 'sent', sentAt: new Date().toISOString(), mailTo: to.join(', '), chat: chat || (n.chat ? 'no webhook' : '') });
    } catch (e) {
      patch_('notifyq', n._id, { st: 'error', err: String(e && e.message || e).substring(0, 300), sentAt: new Date().toISOString() });
    }
  });
}

/* ---------- 📦 체크 봉투 미도착 — 보낸 지 LATE_DAYS 지나도 도착 확인이 안 된 봉투는 세일즈맨 · 담당자에게 한 번 알림 (봉투에 lateAt 기록) ---------- */
const LATE_DAYS = 14;
function envelopesLate_() {
  if (new Date().getMinutes() >= 10) return;   // 1시간에 한 번만 (5분 트리거 중 첫 번)
  const list = query_('envelopes', 'st', 'sent', 50), cut = new Date(Date.now() - LATE_DAYS * 86400000).toISOString();
  const late = list.filter(e => !e.lateAt && String(e.sentAt || '') < cut);
  if (!late.length) return;
  const settings = getDoc_('settings', 'app') || {}, staff = String(settings.reportTo || DEFAULT_TO).split(/[,;\s]+/).filter(isEmail_);
  const props = PropertiesService.getScriptProperties();
  late.forEach(e => {
    try {
      const to = []; query_('users', 'sm', String(e.sm), 5).forEach(u => { const m = u.email || u._id; if (isEmail_(m) && to.indexOf(m) < 0) to.push(m); }); staff.forEach(m => { if (to.indexOf(m) < 0) to.push(m); });
      const got = Object.keys(e.got || {}).length, days = Math.floor((Date.now() - new Date(e.sentAt).getTime()) / 86400000);
      const text = '⚠️ 체크 봉투 미도착 — ' + e.sm + ' · ' + e._id + ' · ' + (e.sentAt || '').substring(0, 10) + ' 보냄 (' + days + '일 전) · ' + (e.n || 0) + '장 ' + money_(e.total) + (got ? ' · 도착 ' + got + '/' + (e.n || 0) : ' · 아직 한 장도 도착 확인 안 됨') + (e.trk ? '\n추적: ' + e.trk : '') + '\n세일즈맨: 보낸 날짜 · 추적 번호를 확인해 주세요. 담당자: 우편물을 확인하고 앱 → 수금 확인 → 📦 봉투에서 맞춰 주세요.';
      if (to.length) MailApp.sendEmail({ to: to.join(','), subject: '[THE ONE] ⚠️ 체크 봉투 미도착 — ' + e.sm + ' ' + e._id, name: 'THE ONE', replyTo: REPLY_TO, htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px">' + text.split('\n').map(esc_).join('<br>') + '</div>' });
      const hook = (props.getProperty('CHAT_WEBHOOK_' + String(e.sm).toUpperCase().replace(/[^A-Z0-9]/g, '_'))) || props.getProperty('CHAT_WEBHOOK');
      if (hook) { const id = to.length ? chatId_(to[0]) : ''; UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ text: (id ? '<users/' + id + '> ' : '') + text }), muteHttpExceptions: true }); }
      patch_('envelopes', e._id, { lateAt: new Date().toISOString(), lateTo: to.join(', ') });
    } catch (x) { Logger.log('봉투 알림 실패 ' + e._id + ': ' + x.message); }
  });
}

/** 이메일 → 구글 사용자 ID (챗 @멘션용). Admin Directory 로 한 번 찾고 스크립트 속성에 기억. 못 찾으면 '' (멘션 없이 올림) */
/* ---------- 📷 드라이브 사진 색인 — 한 시간마다 item_picture · Gallery 폴더의 파일 이름(코드)을 Firestore catalog/photoIndex 에 써 둠 ----------
 *   앱은 이 색인으로 코드와 같은 이름의 사진을 자동으로 붙임 (사진 주소를 손으로 적을 필요 없음).
 *   폴더 이름: item_picture (아이템 사진) · Gallery (세트 · 인서트 사진). 스크립트 속성 PHOTO_FOLDER_ID / GALLERY_FOLDER_ID 를 넣으면 그 폴더를 씀.
 *   사진은 "링크가 있는 모든 사용자" 로 공유된 폴더에 있어야 폰에서 보입니다. */
function photoIndexRun_() {
  const P = PropertiesService.getScriptProperties(), last = Number(P.getProperty('PHOTO_IDX_AT') || 0);
  if (Date.now() - last < 55 * 60 * 1000) return;
  P.setProperty('PHOTO_IDX_AT', String(Date.now()));
  const folder_ = (prop, name) => { const id = P.getProperty(prop); if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} } const it = DriveApp.getFoldersByName(name); return it.hasNext() ? it.next() : null; };
  const scan_ = (folder, out) => { if (!folder) return 0; let n = 0; const walk = f => { const files = f.getFiles(); while (files.hasNext()) { const x = files.next(); const nm = String(x.getName() || ''); if (!/\.(jpe?g|png|webp|gif|heic)$/i.test(nm)) continue; const code = nm.replace(/\.[^.]+$/, '').trim().toUpperCase(); if (!code || out[code]) continue; out[code] = x.getId(); n++; } const subs = f.getFolders(); while (subs.hasNext()) walk(subs.next()); }; walk(folder); return n; };
  const pic = {}, gal = {};
  const n1 = scan_(folder_('PHOTO_FOLDER_ID', 'item_picture'), pic), n2 = scan_(folder_('GALLERY_FOLDER_ID', 'Gallery'), gal);
  if (!n1 && !n2) { Logger.log('사진 폴더(item_picture · Gallery)를 찾지 못했습니다'); return; }
  const at = new Date().toISOString();
  patch_('catalog', 'photoIndex', { pic, gal, n: n1 + n2, at });
  Logger.log('사진 색인: item_picture ' + n1 + ' · Gallery ' + n2);
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
function patch_(col, id, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const fields = {}; Object.keys(data).forEach(k => { fields[k] = toVal_(data[k]); });
  UrlFetchApp.fetch(BASE + '/' + col + '/' + encodeURIComponent(id) + '?' + mask, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields }), headers: headers_(), muteHttpExceptions: true });
}
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
