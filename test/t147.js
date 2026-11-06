/* v0.8.170 시험 — 🔐 보안 1차 (Joao 점검 보고서 H1 · H2): 알림 대기열(notifyq)과 Daily Report 메일이 회사 이름으로 아무 주소에 나가지 않음 (apps-script/Code.gs 를 가짜 메일 · Firestore 위에서, 브라우저 없음)
 *   ① 세일즈맨이 만든 알림의 to(외부 주소) · 앱 밖 url 은 무시 — 등록된 사용자 주소와 앱 링크만 · 담당자가 만든 알림은 to 그대로
 *   ② 등록되지 않은 보낸 사람(by)의 알림은 보내지 않고 skip · 한 사람이 한 번에 10건 넘게 넣으면 뒤는 skip
 *   ③ Daily Report: by 가 등록된 사용자면 그 주소 + 사무실, 등록되지 않은 주소면 사무실에만 (체크 사진 유출 방지) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const code = fs.readFileSync(path.resolve(__dirname, '../apps-script/Code.gs'), 'utf8');
const errs = [], log = (...a) => console.log(...a);
const PROPS = { CHAT_WEBHOOK_OFFICE: 'https://chat/office', CHAT_WEBHOOK_BRANDON: 'https://chat/brandon' };
const USERS = [{ _id: 'brandon@x.com', email: 'brandon@x.com', role: 'salesman', sm: 'BRANDON' }, { _id: 'boss@x.com', email: 'boss@x.com', role: 'admin' }, { _id: 'office@x.com', email: 'office@x.com', role: 'manager', job: 'office' }];
let Q, R, MAIL, PATCH;
const reset = () => { Q = []; R = []; MAIL = []; PATCH = {}; };
const ctx = {
  console, JSON, Date, Math, String, Number, Array, Object, RegExp, Set, Error, encodeURIComponent,
  Logger: { log: () => {} }, Session: { getActiveUser: () => ({ getEmail: () => 'boss@x.com' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => PROPS[k] || null, setProperty: () => {}, getProperties: () => PROPS, deleteProperty: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ScriptApp: { getOAuthToken: () => 'oauth', getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }), everyHours: () => ({ create: () => {} }) }) }) },
  MailApp: { sendEmail: o => MAIL.push(o) }, Utilities: { formatDate: () => '2026-11-06', newBlob: () => null, base64Decode: () => [] }, AdminDirectory: { Users: { get: () => ({ id: '' }) } },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }), fetchAll: () => [] }
};
vm.createContext(ctx); vm.runInContext(code, ctx);
vm.runInContext('query_ = (col, field, val) => col === "notifyq" ? __Q().filter(n => n[field] === val) : col === "users" ? __U().filter(u => u[field] === val) : col === "reports" ? __R().filter(r => r[field] === val) : []; listAll_ = col => col === "users" ? __U() : []; getDoc_ = (c, id) => c === "settings" ? { reportTo: "check@x.com" } : null; patch_ = (c, id, d) => __P(c, id, d); del_ = () => {}; fsPatch_ = () => {}; photoExportRun_ = () => {}; photoIndexRun_ = () => {}; dataUrlBlob_ = () => ({ name: "x" }); reportHtml = () => "<p>r</p>";', ctx);
ctx.__Q = () => Q; ctx.__U = () => USERS; ctx.__R = () => R; ctx.__P = (c, id, d) => { PATCH[c + '/' + id] = Object.assign(PATCH[c + '/' + id] || {}, d); };
const mails = () => MAIL.map(m => m.to).join(' | ');
/* ① 세일즈맨: to · url 무시 */
reset(); Q = [{ _id: 'N1', st: 'wait', by: 'brandon@x.com', kind: 'ask', to: ['victim@outside.com', 'office@x.com'], url: 'https://evil.example/phish', subject: '[THE ONE] test', text: 'hello', toStaff: true }]; ctx.notifyRun_();
log('① salesman mail to:', mails(), '| body has evil link:', /evil\.example/.test((MAIL[0] || {}).htmlBody || ''));
if (!MAIL.length || /victim@outside\.com/.test(mails())) errs.push('① salesman-made notification must not mail outside addresses'); if (!/office@x\.com|check@x\.com/.test(mails())) errs.push('① staff recipients still get it');
if (/evil\.example/.test((MAIL[0] || {}).htmlBody || '')) errs.push('① non-app url must be dropped from the mail');
reset(); Q = [{ _id: 'N2', st: 'wait', by: 'boss@x.com', kind: 'msg', to: ['partner@outside.com'], url: 'https://theonecorp.github.io/the-one-app/#/order', subject: 's', text: 't' }]; ctx.notifyRun_();
log('① staff mail to:', mails(), '| app link kept:', /theonecorp\.github\.io/.test((MAIL[0] || {}).htmlBody || ''));
if (!/partner@outside\.com/.test(mails())) errs.push('① staff-made notification keeps explicit recipients'); if (!/theonecorp\.github\.io/.test((MAIL[0] || {}).htmlBody || '')) errs.push('① app url kept');
/* ② 모르는 보낸 사람 · 과다 */
reset(); Q = [{ _id: 'N3', st: 'wait', by: 'ghost@nowhere.com', kind: 'msg', toStaff: true, subject: 's', text: 't' }]; ctx.notifyRun_();
log('② unknown sender:', MAIL.length, PATCH['notifyq/N3'] && PATCH['notifyq/N3'].st); if (MAIL.length || !PATCH['notifyq/N3'] || PATCH['notifyq/N3'].st !== 'skip') errs.push('② unknown sender → nothing sent, marked skip');
reset(); Q = []; for (let i = 0; i < 13; i++) Q.push({ _id: 'F' + i, st: 'wait', by: 'brandon@x.com', kind: 'ask', toStaff: true, subject: 's', text: 't' }); ctx.notifyRun_();
const skipped = Object.keys(PATCH).filter(k => PATCH[k].st === 'skip').length; log('② flood: mails', MAIL.length, 'skipped', skipped); if (MAIL.length !== 10 || skipped !== 3) errs.push('② more than 10 from one sender in a batch are skipped (sent ' + MAIL.length + ', skipped ' + skipped + ')');
/* ③ 리포트 */
reset(); R = [{ _id: 'R1', mail: 'wait', by: 'brandon@x.com', sm: 'BRANDON', d: '2026-11-06', n: 1, total: 100, rows: [], photos: [] }, { _id: 'R2', mail: 'wait', by: 'thief@outside.com', sm: 'BRANDON', d: '2026-11-06', n: 1, total: 100, rows: [], photos: [] }]; ctx.run();
const r1 = MAIL.find(m => /brandon/.test(m.to)), r2 = MAIL.find(m => /thief/.test(m.to)); log('③ report mails:', mails());
if (!r1 || !/check@x\.com/.test(r1.to)) errs.push('③ own report → salesman + office'); if (r2) errs.push('③ report with an outside by must not go there'); if (!MAIL.some(m => m.to === 'check@x.com')) errs.push('③ outside-by report still reaches the office only');
if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
console.log('PASS');
