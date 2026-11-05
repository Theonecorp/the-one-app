/* v0.8.165 시험 — ☁️ 사진 공개(apps-script/SharePhotos.gs)는 바탕 색인(data/photo-index.json)과 Firestore catalog/photoIndex 를 합쳐서 봄 (가짜 드라이브 · Firestore 위에서, 브라우저 없음)
 *   ① 두 색인의 사진을 합쳐(겹침 한 번) 아직 비공개인 것만 "링크가 있는 모든 사용자" 로 바꿈 — item_picture 에 코드 이름으로만 넣은 사진(Firestore 색인에만 있음)도 공개됨
 *   ② Firestore 를 못 읽으면(403) 로그에 매니페스트 안내를 적고 바탕 색인만으로 계속
 *   ③ 바탕 색인을 못 읽어도 Firestore 색인만으로 계속
 *   ④ 전부 공개돼 있으면 아무것도 바꾸지 않고 이어 하기 트리거도 만들지 않음 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const code = fs.readFileSync(path.resolve(__dirname, '../apps-script/SharePhotos.gs'), 'utf8');
const errs = [], log = (...a) => console.log(...a);
let BASE, FS, PUBLIC, SHARED, LOGS, TRIGGERS;
const reset = o => { BASE = { pic: { A: 'id1', B: 'id2' }, gal: { G: 'id3' } }; FS = { pic: { A: 'id1', C: 'id4' }, gal: { H: 'id5' } }; PUBLIC = ['id1']; SHARED = []; LOGS = []; TRIGGERS = 0; Object.assign(ctxState, { baseFail: false, fsCode: 200 }, o || {}); };
const ctxState = {};
const resp = (c, t) => ({ getResponseCode: () => c, getContentText: () => t });
const fsDoc = () => JSON.stringify({ fields: { pic: { mapValue: { fields: Object.fromEntries(Object.entries(FS.pic).map(([k, v]) => [k, { stringValue: v }])) } }, gal: { mapValue: { fields: Object.fromEntries(Object.entries(FS.gal).map(([k, v]) => [k, { stringValue: v }])) } }, n: { integerValue: '3' } } });
const ctx = {
  console, JSON, Date, Math, String, Number, Array, Object, RegExp, Set, Error, encodeURIComponent,
  Logger: { log: m => LOGS.push(String(m)) },
  DriveApp: { getRootFolder: () => ({}) },
  ScriptApp: { getOAuthToken: () => 'oauth', getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ after: () => ({ create: () => { TRIGGERS++; } }), everyDays: () => ({ atHour: () => ({ create: () => {} }) }) }) }) },
  Utilities: { sleep: () => {} },
  UrlFetchApp: {
    fetch: (url, o) => {
      if (/github\.io\/the-one-app\/data\/photo-index\.json/.test(url)) { if (ctxState.baseFail) throw new Error('DNS error'); return resp(200, JSON.stringify(BASE)); }
      if (/firestore\.googleapis\.com/.test(url)) {
        if (!o || !o.headers || o.headers.Authorization !== 'Bearer oauth') return resp(401, '{"error":{"message":"no auth"}}');
        return ctxState.fsCode === 200 ? resp(200, fsDoc()) : resp(ctxState.fsCode, '{"error":{"message":"PERMISSION_DENIED"}}');
      }
      throw new Error('unexpected fetch ' + url);
    },
    fetchAll: reqs => reqs.map(r => {
      const m = String(r.url).match(/lh3\.googleusercontent\.com\/d\/([\w-]+)=w20/);
      if (m) return resp(PUBLIC.includes(m[1]) ? 200 : 302, '');
      const p = String(r.url).match(/drive\/v3\/files\/([\w-]+)\/permissions/);
      if (p) { const b = JSON.parse(r.payload); if (b.role !== 'reader' || b.type !== 'anyone') return resp(400, '{"error":{"message":"bad body"}}'); SHARED.push(p[1]); PUBLIC.push(p[1]); return resp(200, '{"id":"x"}'); }
      return resp(500, 'unexpected ' + r.url);
    })
  }
};
vm.createContext(ctx); vm.runInContext(code, ctx);
const sorted = a => a.slice().sort().join(',');

reset(); ctx.run(); log('① both:', sorted(SHARED), '| triggers', TRIGGERS, '|', LOGS.find(l => /색인:/.test(l)));
if (sorted(SHARED) !== 'id2,id3,id4,id5') errs.push('① union of base + Firestore index, already-public id1 skipped — got ' + sorted(SHARED));
if (TRIGGERS) errs.push('① everything done in one pass → no resume trigger');
if (!LOGS.some(l => /바탕 3장/.test(l) && /Firestore 3장/.test(l) && /사진 5장/.test(l))) errs.push('① log should count base 3 · Firestore 3 · 5 unique');

reset({ fsCode: 403 }); ctx.run(); log('② fs 403:', sorted(SHARED), '|', LOGS.find(l => /Firestore 색인 읽기 실패/.test(l)).substring(0, 60));
if (sorted(SHARED) !== 'id2,id3') errs.push('② Firestore unreadable → base index only — got ' + sorted(SHARED));
if (!LOGS.some(l => /Firestore 색인 읽기 실패 403/.test(l) && /SharePhotos\.appsscript\.json/.test(l))) errs.push('② 403 must log the manifest hint');

reset({ baseFail: true }); ctx.run(); log('③ base down:', sorted(SHARED));
if (sorted(SHARED) !== 'id4,id5') errs.push('③ base index unreachable → Firestore index only — got ' + sorted(SHARED));

reset({ baseFail: true, fsCode: 403 }); let threw = ''; try { ctx.run(); } catch (e) { threw = e.message; } log('③-2 both down:', threw.substring(0, 40));
if (!/색인을 하나도/.test(threw) || SHARED.length) errs.push('③-2 neither index readable → stop with an error, share nothing');

reset(); PUBLIC = ['id1', 'id2', 'id3', 'id4', 'id5']; ctx.run(); log('④ all public:', SHARED.length, '| triggers', TRIGGERS, '|', LOGS[LOGS.length - 1]);
if (SHARED.length || TRIGGERS || !LOGS.some(l => /모두 공개/.test(l))) errs.push('④ all public → nothing changed, "모두 공개" logged, no resume trigger');

if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
console.log('PASS');
