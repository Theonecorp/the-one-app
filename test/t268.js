/* v0.8.228 시험 — 📥 inbound@ 메일을 관리자 메일함으로 전달하지 않고 앱으로 (2026-11-13 관리자: "inbound 는 이메일을 읽을 수 있게 · luke 메일에는 많은 파일이 와서 구별하기 쉽지 않아 — 다른 방법")
 *   ① inbound@ 계정의 InboundRelay.gs: 받은편지함 새 메일 → 드라이브 폴더에 msg-<id>.json 한 통씩 (제목 · 보낸 사람 · 본문 · 엑셀/CSV 첨부 내용) · 라벨 · 관리자에게 폴더 편집 공유
 *   ② 다시 돌려도 같은 메일은 다시 넣지 않음
 *   ③ 관리자 스크립트(Code.gs inboundMailRun_): 폴더의 새 JSON → 메일과 똑같이 inboundMessage_ (첨부 바이트 · 이름 · 제목 · 본문 · 날짜 그대로) → 읽은 파일은 done
 *   ④ 다음 5분에는 done 파일을 다시 읽지 않음 · 관리자 메일함 검색(to:inbound@)도 그대로 돎
 *   ⑤ (v0.8.241) 읽다 실패하면 err1 · err2 … 로 두고 다시 시도 (전에는 실패해도 done — Drive API 를 켠 뒤에도 다시 안 읽던 것) · inboundRelayRetry 로 모두 다시 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const errs = [], log = (...a) => console.log(...a);
/* 가짜 드라이브 (두 스크립트가 같은 폴더를 봄) */
const FILES = [], EDITORS = [];
const mkFile = (name, body) => { const f = { name, body, desc: '', getName: () => name, getDescription: () => f.desc, setDescription: d => { f.desc = d; }, getBlob: () => ({ getDataAsString: () => body }) }; FILES.push(f); return f; };
const iter = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
const FOLDER = { getEditors: () => EDITORS.map(e => ({ getEmail: () => e })), addEditor: e => EDITORS.push(e), getFilesByName: n => iter(FILES.filter(f => f.name === n)), createFile: (n, b) => mkFile(n, b),
  searchFiles: q => iter(FILES.filter(f => /msg-/.test(f.name))) };
let folderMade = 0;
const DriveApp = { getFoldersByName: () => iter(folderMade ? [FOLDER] : []), createFolder: () => { folderMade = 1; return FOLDER; }, searchFolders: q => iter(folderMade && /THE ONE 공장 메일 받은편지 \(inbound\)/.test(q) ? [FOLDER] : []) };
const Utilities = { base64Encode: b => Buffer.from(b).toString('base64'), base64Decode: s => Array.from(Buffer.from(s, 'base64')), formatDate: () => '2026',
  newBlob: (bytes, type, name) => ({ getName: () => name, getContentType: () => type, getBytes: () => bytes, getDataAsString: () => Buffer.from(bytes).toString('utf8'), copyBlob() { return this; } }) };
const csv = 'ITEM NO,QTY,PRICE\nAHG100,10,1.5\n';
const att = (name, s) => ({ getName: () => name, getContentType: () => 'text/csv', getBytes: () => Array.from(Buffer.from(s)) });
const M1 = { getId: () => 'm1', getSubject: () => 'INVOICE SX#80', getFrom: () => 'factory@cn.com', getTo: () => 'inbound@theonefl.com', getDate: () => new Date('2026-11-12T10:00:00Z'), getPlainBody: () => 'INVOICE NO: SX80\nCARTONS: 4', getAttachments: () => [att('sx80.csv', csv), att('photo.jpg', 'x')] };
let LABELED = 0, SEARCH_Q = [];
let MADE = []; const GmailApp = { search: q => { SEARCH_Q.push(q); return /inbox/.test(q) ? [{ getMessages: () => [M1], addLabel: () => { LABELED++; } }] : []; }, getUserLabelByName: () => null, createLabel: n => { MADE.push(n); return {}; } };   /* 라벨이 아직 없는 새 계정 — 진짜 Apps Script 에는 createLabel 만 있음 (createUserLabel 은 없어 TypeError 이던 것, v0.8.241) */
const base = { console, JSON, Date, Math, String, Number, Array, Object, RegExp, Set, Error, Buffer, Logger: { log: () => {} }, DriveApp, GmailApp, Utilities,
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) } };
/* ① ② */
const R = Object.assign({}, base); vm.createContext(R); vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../apps-script/InboundRelay.gs'), 'utf8'), R);
R.relaySetup(); R.relayRun();
log('① files:', FILES.map(f => f.name).join(), 'editors:', EDITORS.join(), 'labeled:', LABELED);
const doc = FILES[0] ? JSON.parse(FILES[0].body) : {};
if (FILES.length !== 1 || FILES[0].name !== 'msg-m1.json') errs.push('①② one JSON per message, not repeated');
if (doc.subject !== 'INVOICE SX#80' || doc.from !== 'factory@cn.com' || !/CARTONS: 4/.test(doc.body) || (doc.atts || []).length !== 1 || doc.atts[0].name !== 'sx80.csv' || (doc.other || []).join() !== 'photo.jpg') errs.push('① message fields + only xlsx/csv attachment contents');
if (EDITORS.join() !== 'luke@theonefl.com') errs.push('① folder shared with the admin account');
if (!MADE.includes('THE ONE/앱으로 보냄')) errs.push('① label created with GmailApp.createLabel on a fresh inbound@ account');
/* ③ ④ */
const C = Object.assign({}, base); vm.createContext(C); vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../apps-script/Code.gs'), 'utf8'), C);
const GOT = []; C.inboundMessage_ = (m, by) => { GOT.push({ subj: m.getSubject(), from: m.getFrom(), body: m.getPlainBody(), date: m.getDate().toISOString(), atts: m.getAttachments().map(a => a.getName() + ':' + a.getDataAsString()), by: Object.keys(by).join() }); return 1; };
C.inboundCatalog_ = () => ({ AHG100: { c: 'AHG100' } }); SEARCH_Q = [];
const n1 = C.inboundMailRun_(), n2 = C.inboundMailRun_();
log('③ got:', JSON.stringify(GOT), 'n:', n1, n2, 'desc:', FILES[0] && FILES[0].desc, 'gmail q:', SEARCH_Q.length);
if (GOT.length !== 1 || GOT[0].subj !== 'INVOICE SX#80' || GOT[0].atts.join() !== 'sx80.csv:' + csv || GOT[0].date !== '2026-11-12T10:00:00.000Z' || GOT[0].by !== 'AHG100') errs.push('③ relay JSON read like the mail (attachment bytes · subject · date · catalog)');
if (n1 !== 1 || n2 !== 0 || FILES[0].desc !== 'done') errs.push('④ processed file marked done and not read again');
if (!SEARCH_Q.some(q => /^to:inbound@theonefl\.com/.test(q))) errs.push('④ admin mailbox search still runs');
/* ⑤ v0.8.241: 읽다 실패(예: Drive API 꺼짐 403)하면 "처리함"으로 표시하지 않고 다시 시도 (err1 → err2 → err3 뒤 건너뜀) · inboundRelayRetry 로 모두 다시 */
FILES.push(...[]); const f2 = mkFile('msg-m2.json', JSON.stringify(Object.assign({}, doc, { id: 'm2', subject: 'INVOICE FAIL' })));
let failNow = true; const SEEN2 = []; C.inboundMessage_ = m => { SEEN2.push(m.getSubject()); if (failNow && m.getSubject() === 'INVOICE FAIL') throw new Error('엑셀 변환 실패 403'); return 1; };
C.inboundNotify_ = () => {}; C.inboundMailRun_(); const d1 = f2.desc; C.inboundMailRun_(); const d2 = f2.desc;
failNow = false; C.inboundMailRun_(); const d3 = f2.desc;
log('⑤ retry:', d1, d2, d3); if (d1 !== 'err1' || d2 !== 'err2' || d3 !== 'done') errs.push('⑤ failed mail is retried (err1 → err2 → done), not marked done on failure');
const before = SEEN2.length; C.inboundRelayRetry(); log('⑤ retry-all re-read:', SEEN2.length - before); if (SEEN2.length - before !== 2) errs.push('⑤ inboundRelayRetry re-reads every relay mail');
console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
