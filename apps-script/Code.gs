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
        const subject = '[Daily Collection] ' + (r.sm || '') + ' — ' + (r.d || '') + ' (' + (r.n || (r.rows || []).length) + '건 / ' + money_(total) + ')';
        const atts = (r.photos || []).map((p, i) => dataUrlBlob_(p, (r.sm || 'SM') + '_' + (r.d || '') + '_check' + (i + 1))).filter(Boolean);
        MailApp.sendEmail({ to: to.join(','), subject, htmlBody: reportHtml(r), name: FROM_NAME, replyTo: REPLY_TO, attachments: atts });
        patch_('reports', r._id, { mail: 'sent', mailAt: new Date().toISOString(), mailTo: to.join(', ') });
      } catch (e) {
        patch_('reports', r._id, { mail: 'error', mailErr: String(e && e.message || e).substring(0, 300), mailAt: new Date().toISOString() });
      }
    });
  } finally { lock.releaseLock(); }
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
function toVal_(x) { if (x === null || x === undefined) return { nullValue: null }; if (typeof x === 'number') return { doubleValue: x }; if (typeof x === 'boolean') return { booleanValue: x }; return { stringValue: String(x) }; }

/* ---------- 작은 도구 ---------- */
function dataUrlBlob_(s, name) { const m = String(s || '').match(/^data:([^;]+);base64,(.+)$/); if (!m) return null; const ext = m[1].indexOf('png') >= 0 ? '.png' : '.jpg'; return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + ext); }
function isEmail_(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '')); }
function money_(n) { n = Number(n) || 0; return (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function today_() { return Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd'); }
