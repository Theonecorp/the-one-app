/* v0.8.164 시험 — Apps Script 알림 길 (apps-script/Code.gs 의 notifyRun_ 를 가짜 메일 · 챗 · Firestore · FCM 위에서 돌림, 브라우저 없음)
 *   ① 세일즈맨에게 → 그 세일즈맨 개인 방에만 (단톡방 CHAT_WEBHOOK 으로 가지 않음) · 메일 · 팝업
 *   ② 개인 방이 없는 세일즈맨 → 챗 없음 (단톡방으로 새지 않음) · 'no personal room'
 *   ③ 한 사람에게(toUser · noMail) → 메일 없음 · 그 사람 방 · 그 사람 기기 팝업
 *   ④ 팝업만(pushOnly · 창고) → 메일 · 챗 없음 · 창고 사람들 기기만
 *   ⑤ 사무실(toStaff) → 담당자 메일 · 사무실 방 · 사무실 사람들 팝업 (보낸 사람 제외)
 *   ⑥ 받는 사람 직접(to: 재고 부족) → 그 메일들 · 그 사람들 팝업 · 없어진 기기(FCM 404)는 지움 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const code = fs.readFileSync(path.resolve(__dirname, '../apps-script/Code.gs'), 'utf8');
const errs = [], log = (...a) => console.log(...a);
const PROPS = { CHAT_WEBHOOK: 'https://chat/shared', CHAT_WEBHOOK_OFFICE: 'https://chat/office', CHAT_WEBHOOK_BRANDON: 'https://chat/brandon', CHAT_WEBHOOK_U_WH: 'https://chat/wh', CHAT_WEBHOOK_WH: 'https://chat/warehouse' };
const USERS = [
  { _id: 'brandon@x.com', email: 'brandon@x.com', role: 'salesman', sm: 'BRANDON' }, { _id: 'kevin@x.com', email: 'kevin@x.com', role: 'salesman', sm: 'KEVIN' },
  { _id: 'boss@x.com', email: 'boss@x.com', role: 'admin' }, { _id: 'office@x.com', email: 'office@x.com', role: 'manager', job: 'office' },
  { _id: 'wh@x.com', email: 'wh@x.com', role: 'manager', job: 'whmgr' }, { _id: 'pick@x.com', email: 'pick@x.com', role: 'manager', job: 'pick' }, { _id: 'gone@x.com', email: 'gone@x.com', role: 'manager', job: 'office', active: false }];
let TOKENS, Q, MAIL, POSTS, PATCH, DELS;
const reset = () => { TOKENS = USERS.filter(u => u.active !== false).map(u => ({ _id: 'T_' + u.email, email: u.email, token: 'tok-' + u.email })); TOKENS.push({ _id: 'T_dead', email: 'office@x.com', token: 'tok-dead' }); MAIL = []; POSTS = []; PATCH = {}; DELS = []; };
const ctx = {
  console, JSON, Date, Math, String, Number, Array, Object, RegExp, Set, Error, encodeURIComponent,
  Logger: { log: () => {} }, Session: { getActiveUser: () => ({ getEmail: () => 'boss@x.com' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => PROPS[k] || null, setProperty: () => {}, getProperties: () => PROPS, deleteProperty: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ScriptApp: { getOAuthToken: () => 'oauth', getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }) },
  MailApp: { sendEmail: o => MAIL.push(o) },
  UrlFetchApp: { fetch: (url, o) => {
    if (/fcm\.googleapis\.com/.test(url)) { const m = JSON.parse(o.payload).message; POSTS.push({ kind: 'push', token: m.token, data: m.webpush.data }); return m.token === 'tok-dead' ? { getResponseCode: () => 404, getContentText: () => 'UNREGISTERED' } : { getResponseCode: () => 200, getContentText: () => '{}' }; }
    POSTS.push({ kind: 'chat', url, text: JSON.parse(o.payload).text }); return { getResponseCode: () => 200, getContentText: () => '{}' }; } },
  Utilities: { formatDate: () => '2026-11-05' }, AdminDirectory: { Users: { get: () => ({ id: '' }) } }
};
vm.createContext(ctx); vm.runInContext(code, ctx);
/* Firestore 대신 */
vm.runInContext('query_ = (col, field, val) => col === "notifyq" ? __Q().filter(n => n[field] === val) : col === "users" ? __U().filter(u => u[field] === val) : col === "pushTokens" ? __T().filter(t => t[field] === val) : []; getDoc_ = (c, id) => c === "settings" ? { reportTo: "check@x.com" } : null; patch_ = (c, id, d) => __P(c, id, d); listAll_ = c => c === "users" ? __U() : []; delDoc_ = (c, id) => __D(c, id); chatId_ = () => "";', ctx);
ctx.__Q = () => Q; ctx.__U = () => USERS; ctx.__T = () => TOKENS; ctx.__P = (c, id, d) => { PATCH[id] = d; }; ctx.__D = (c, id) => { DELS.push(id); TOKENS = TOKENS.filter(t => t._id !== id); };
const run = (n) => { reset(); Q = [Object.assign({ _id: 'N1', st: 'wait', by: 'boss@x.com', subject: '[THE ONE] test', text: 'hello' }, n)]; ctx.notifyRun_(); return { mail: MAIL.map(m => m.to).join(','), chats: POSTS.filter(p => p.kind === 'chat').map(p => p.url), push: POSTS.filter(p => p.kind === 'push').map(p => p.token.replace('tok-', '')).sort(), st: PATCH.N1 || {} }; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let r;
r = run({ kind: 'cfreq', toSm: 'BRANDON', chat: true }); log('① salesman:', JSON.stringify(r));
if (r.mail !== 'brandon@x.com' || !eq(r.chats, ['https://chat/brandon']) || !eq(r.push, ['brandon@x.com'])) errs.push('① salesman → personal room only + mail + pop-up');
r = run({ kind: 'cfreq', toSm: 'KEVIN', chat: true }); log('② no room:', JSON.stringify(r));
if (r.chats.length || r.st.chat !== 'no personal room' || !eq(r.push, ['kevin@x.com'])) errs.push('② salesman without a personal room must not post to the shared room');
r = run({ kind: 'msg', toUser: 'wh@x.com', noMail: true, chat: true }); log('③ one person:', JSON.stringify(r));
if (r.mail || !eq(r.chats, ['https://chat/wh']) || !eq(r.push, ['wh@x.com'])) errs.push('③ one person → no mail, their room, their devices');
r = run({ kind: 'msg', toGroup: 'g:wh', pushOnly: true, chat: true }); log('④ pop-up only:', JSON.stringify(r));
if (r.mail || r.chats.length || !eq(r.push, ['pick@x.com', 'wh@x.com'])) errs.push('④ pushOnly to warehouse → only warehouse devices');
r = run({ kind: 'credit', toStaff: true, chat: true }); log('⑤ office:', JSON.stringify(r));
if (r.mail !== 'check@x.com' || !eq(r.chats, ['https://chat/office']) || !eq(r.push, ['dead', 'office@x.com'])) errs.push('⑤ office → staff mail, office room, office devices (not the sender, not inactive users)');
if (!DELS.includes('T_dead')) errs.push('⑥ a device FCM no longer knows (404) should be removed');
r = run({ kind: 'lowstock', to: ['office@x.com', 'boss@x.com'], chat: true }); log('⑥ direct list:', JSON.stringify(r));
if (r.mail !== 'office@x.com,boss@x.com' || !eq(r.push, ['dead', 'office@x.com'])) errs.push('⑥ explicit recipients → their mail and pop-ups (sender excluded)');
if (r.st.st !== 'sent') errs.push('queue entries should be marked sent');
r = run({ kind: 'msg', toGroup: 'g:sales', chat: true }); log('⑦ all salesmen:', JSON.stringify(r));
if (!eq(r.chats, ['https://chat/brandon']) || r.chats.includes('https://chat/shared')) errs.push('⑦ all salesmen → each personal room, never the shared room');
if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
console.log('PASS');
