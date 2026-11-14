/* 🌅 아침 점검 — 읽기만 (아무것도 바꾸지 않음) · /morning-check 와 매일 새벽 예약 작업이 부름
 *   node .claude/skills/morning-check/morning.mjs   — 서비스 계정(FIREBASE_*) 있는 관리자 환경에서만
 *   ① 하루(24시간) 넘게 한 단계에 머문 주문 (단계별 건수 · 가장 오래된 것)  ② 마지막 드라이브 백업 (settings/app.backup)
 *   ③ inbound 공장 메일 다리 실패 (settings/app 의 inbound 기록이 있으면)
 *   단계 · 들어온 때는 src/flow.js STAGES 와 같은 기준 — 단, 여기서는 달력 시간(주말 포함)이라 월요일엔 많아 보일 수 있음 */
import crypto from 'node:crypto';
if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) { console.log('SKIP — FIREBASE_* 없음 (관리자 환경에서만)'); process.exit(0); }
const b64u = s => Buffer.from(s).toString('base64url'), now = Math.floor(Date.now() / 1000), key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
const hdr = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), pay = b64u(JSON.stringify({ iss: process.env.FIREBASE_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 }));
const sig = crypto.sign('RSA-SHA256', Buffer.from(hdr + '.' + pay), key).toString('base64url');
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + hdr + '.' + pay + '.' + sig })).json()).access_token;
const base = `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`, H = { authorization: 'Bearer ' + tok, 'content-type': 'application/json' };
const un = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? +v.integerValue : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : 'timestampValue' in v ? v.timestampValue : 'nullValue' in v ? null
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, un(x)])) : 'arrayValue' in v ? (v.arrayValue.values || []).map(un) : null;
const doc = d => Object.assign({ id: d.name.split('/').pop() }, un({ mapValue: { fields: d.fields || {} } }));
const out = ['# 🌅 아침 점검 (' + new Date().toLocaleString('ko-KR', { timeZone: 'America/New_York' }) + ' 플로리다)'];
let bad = 0;

/* ① 밀린 주문 */
const q = await fetch(base + ':runQuery', { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'orders' }], where: { fieldFilter: { field: { fieldPath: 'st' }, op: 'IN', value: { arrayValue: { values: ['sent', 'pick', 'ok', 'picked'].map(s => ({ stringValue: s })) } } } } } }) });
if (!q.ok) { bad++; out.push('- ❓ 주문: 읽지 못함 — ' + q.status); }
else {
  const rows = (await q.json()).filter(r => r.document).map(r => doc(r.document));
  const ST = [['신규 확인', o => o.st === 'sent' && !o.cfReq && !o.cfOk, o => o.sentAt], ['세일즈맨 확인 대기', o => o.st === 'sent' && o.cfReq && !o.cfOk, o => o.cfReqAt || o.sentAt],
    ['배정 대기', o => o.st === 'sent' && o.cfOk, o => o.cfAt || o.sentAt], ['출고 작업', o => o.st === 'pick' || o.st === 'ok', o => o.pickAt], ['검수 · 인보이스 대기', o => o.st === 'picked', o => o.pickDoneAt || o.pickAt]];
  const old = []; rows.forEach(o => { const s = ST.find(x => x[1](o)); if (!s) return; const since = s[2](o) || o.updatedAt || o.createdAt; if (since && Date.now() - Date.parse(since) > 864e5) old.push({ s: s[0], since, o }); });
  if (!old.length) out.push('- ✅ 밀린 주문 없음 (진행 중 ' + rows.length + '건)');
  else { bad++; old.sort((a, b) => a.since < b.since ? -1 : 1); const by = {}; old.forEach(x => { by[x.s] = (by[x.s] || 0) + 1; });
    out.push('- ⚠️ 하루 넘게 밀린 주문 ' + old.length + '건 (진행 중 ' + rows.length + '건 중) — ' + Object.entries(by).map(([k, n]) => k + ' ' + n).join(' · '));
    old.slice(0, 5).forEach(x => out.push('    - ' + (x.o.no || x.o.id) + ' · ' + (x.o.store || '') + ' · ' + x.s + ' · ' + Math.floor((Date.now() - Date.parse(x.since)) / 864e5) + '일째')); }
}

/* ② 백업 · ③ inbound */
const sr = await fetch(base + '/settings/app', { headers: H });
if (!sr.ok) { bad++; out.push('- ❓ settings/app: 읽지 못함 — ' + sr.status); }
else {
  const s = doc(await sr.json()), b = s.backup || {}, at = b.at || b.endAt || b.doneAt || b.finishedAt || '';
  const age = at ? (Date.now() - Date.parse(at)) / 36e5 : 1e9;
  if (age < 30) out.push('- ✅ 백업: ' + String(at).slice(0, 16).replace('T', ' ') + ' UTC' + (b.docs || b.n ? ' · 문서 ' + (b.docs || b.n) : ''));
  else { bad++; out.push('- ⚠️ 백업: 30시간 넘게 없음 (마지막 ' + (at ? String(at).slice(0, 16).replace('T', ' ') + ' UTC' : '기록 없음') + ') — apps-script/Backup.gs 트리거 확인'); }
  const ib = s.inbound || s.inboundRelay;
  if (ib && (ib.err || ib.lastErr)) { bad++; out.push('- ⚠️ inbound: ' + String(ib.err || ib.lastErr).slice(0, 160)); }
}
console.log(out.join('\n')); console.log(bad ? '\n⚠️ 볼 것 ' + bad + '가지' : '\n✅ 이상 없음');
