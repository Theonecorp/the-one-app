/* v0.8.244 시험 — 📭 공장 메일 다리: 엑셀 없는 메일은 공장 인보이스처럼 보일 때만 "엑셀이 없습니다" 경고 (2026-11-14 관리자: Google 보안 알림 같은 메일에도 경고가 떴음)
 *   ① 제목 · 본문에 INVOICE · 发票 · PACKING 등이 없고 처음 보는 주소 → 경고 없이 건너뜀 (기록만)
 *   ② 제목에 INVOICE → 경고 · ③ 본문에 发票 → 경고 · ④ 예전에 공장 인보이스를 보낸 주소(inbound.mailFrom) → 제목이 달라도 경고
 *   (apps-script/Code.gs + InboundParse.gs 를 vm 으로 — 진짜 Apps Script 와 같은 코드) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const errs = [], log = (...a) => console.log(...a);
const NOTES = [], LOGS = [];
const C = { console, JSON, Date, Math, String, Number, Array, Object, RegExp, Set, Error, Buffer, Logger: { log: s => LOGS.push(String(s)) },
  Utilities: { formatDate: () => '2026' }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) } };
vm.createContext(C);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../apps-script/InboundParse.gs'), 'utf8'), C);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../apps-script/Code.gs'), 'utf8'), C);
const KNOWN = ['Factory <sales@jrj.cn>'];
C.inboundNotify_ = (kind, subject) => NOTES.push(kind + ':' + subject);
C.query_ = (col, field, val) => col === 'inbound' && field === 'mailFrom' && KNOWN.includes(val) ? [{ id: 'X', mailFrom: val }] : [];
const msg = (subj, from, body) => ({ getSubject: () => subj, getFrom: () => from, getPlainBody: () => body || '', getDate: () => new Date('2026-11-14T10:00:00Z'), getAttachments: () => [] });
const run = m => { NOTES.length = 0; const n = C.inboundMessage_(m, {}); return { n, notes: NOTES.slice() }; };
let r = run(msg('Security alert', 'Google <no-reply@accounts.google.com>', 'A new sign-in on Windows'));
log('①', JSON.stringify(r), LOGS.slice(-1)); if (r.notes.length || r.n !== 0) errs.push('① non-invoice mail without Excel: no warning'); if (!LOGS.some(l => /건너뜀/.test(l))) errs.push('① ... but logged');
r = run(msg('Jinruijia invoice', 'Someone <x@y.com>', 'see attached')); log('②', JSON.stringify(r)); if (r.notes.length !== 1 || !/엑셀이 없습니다/.test(r.notes[0])) errs.push('② INVOICE in the subject → warning');
r = run(msg('Re: order', 'Someone <x@y.com>', '附件是发票')); log('③', JSON.stringify(r)); if (r.notes.length !== 1) errs.push('③ 发票 in the body → warning');
r = run(msg('Hello', 'Factory <sales@jrj.cn>', 'hi')); log('④', JSON.stringify(r)); if (r.notes.length !== 1) errs.push('④ known factory sender → warning even without invoice words');
console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
