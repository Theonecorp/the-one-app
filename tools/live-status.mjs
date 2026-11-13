/* 📡 라이브 상태 — 지금 직원들이 쓰는 것이 main 과 같은가 (읽기만 · 아무것도 바꾸지 않음)
 *   node tools/live-status.mjs   — 서비스 계정(FIREBASE_*)이 있는 관리자 환경에서만. 없으면 건너뜀
 *   ① Hosting 마지막 배포 버전 ↔ src/ver.js  ② 서버 권한 규칙 ↔ firestore.rules (다르면 몇 줄)  ③ 서버 함수 상태 (functions/ 가 있으면)
 *   (2026-11-13 세일즈맨 주문 permission-denied 때 손으로 한 확인 — 고친 것이 이미 main · 서버에 있는지 먼저 보려고) */
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) { console.log('SKIP — FIREBASE_* 없음 (관리자 환경에서만)'); process.exit(0); }
const b64u = s => Buffer.from(s).toString('base64url'), now = Math.floor(Date.now() / 1000), key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
const hdr = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), pay = b64u(JSON.stringify({ iss: process.env.FIREBASE_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 }));
const sig = crypto.sign('RSA-SHA256', Buffer.from(hdr + '.' + pay), key).toString('base64url');
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + hdr + '.' + pay + '.' + sig })).json()).access_token;
const P = process.env.FIREBASE_PROJECT_ID, H = { authorization: 'Bearer ' + tok };
const get = async u => { try { const r = await fetch(u, { headers: H }); return { ok: r.ok, status: r.status, j: await r.json() }; } catch (e) { return { ok: false, status: 0, j: { error: { message: e.message } } }; } };
const short = r => (r.j && r.j.error && r.j.error.message || '').split('\n')[0].slice(0, 140);
let bad = 0; const out = ['# 📡 라이브 상태 (' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC)'];

/* ① 앱 */
const ver = (fs.readFileSync(path.join(root, 'src/ver.js'), 'utf8').match(/VER\s*=\s*'v?([\d.]+)'/) || [])[1];
const rel = await get(`https://firebasehosting.googleapis.com/v1beta1/sites/${P}/releases?pageSize=1`);
if (!rel.ok) { bad++; out.push('- ❓ 앱(Hosting): 읽지 못함 — ' + short(rel)); }
else { const r = (rel.j.releases || [])[0] || {}, live = (String(r.message || '').match(/v?v?([\d.]+\d)/) || [])[1];
  const same = live === ver; if (!same) bad++;
  out.push('- ' + (same ? '✅' : '⚠️') + ' 앱: 배포 v' + live + ' (' + String(r.releaseTime || '').slice(0, 16).replace('T', ' ') + ' UTC) · 이 폴더 v' + ver + (same ? '' : ' — 다름 (배포 전이거나 이 폴더가 main 이 아님)')); }

/* ② 권한 규칙 */
const rr = await get(`https://firebaserules.googleapis.com/v1/projects/${P}/releases/cloud.firestore`);
if (!rr.ok) { bad++; out.push('- ❓ 권한 규칙: 읽지 못함 — ' + short(rr)); }
else { const rs = await get(`https://firebaserules.googleapis.com/v1/${rr.j.rulesetName}`), live = rs.ok ? rs.j.source.files[0].content : '', mine = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  if (live === mine) out.push('- ✅ 권한 규칙: firestore.rules 와 같음 (반영 ' + String(rr.j.updateTime || '').slice(0, 16).replace('T', ' ') + ' UTC)');
  else { bad++; const a = new Set(live.split('\n')), b = new Set(mine.split('\n')); out.push('- ⚠️ 권한 규칙: 다름 — 서버에만 ' + [...a].filter(x => !b.has(x)).length + '줄 · 이 폴더에만 ' + [...b].filter(x => !a.has(x)).length + '줄 (반영 ' + String(rr.j.updateTime || '').slice(0, 16).replace('T', ' ') + ' UTC) → 머지된 규칙이면 `node tools/deploy-rules.js`'); } }

/* ③ 서버 함수 */
if (fs.existsSync(path.join(root, 'functions/index.js'))) {
  const want = [...fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8').matchAll(/export const (\w+)\s*=/g)].map(m => m[1]);
  const fl = await get(`https://cloudfunctions.googleapis.com/v2/projects/${P}/locations/-/functions`);
  if (!fl.ok) { bad++; out.push('- ❓ 서버 함수: 읽지 못함 — ' + short(fl)); }
  else { const have = {}; (fl.j.functions || []).forEach(f => { have[f.name.split('/').pop()] = f; });
    want.forEach(n => { const f = have[n]; if (!f) { bad++; out.push('- ⚠️ 서버 함수 ' + n + ': 배포 안 됨 (functions/README.md)'); } else { const ok = f.state === 'ACTIVE'; if (!ok) bad++; out.push('- ' + (ok ? '✅' : '⚠️') + ' 서버 함수 ' + n + ': ' + f.state + ' (' + String(f.updateTime || '').slice(0, 16).replace('T', ' ') + ' UTC)' + (ok ? '' : ' — ' + ((f.stateMessages || [])[0] || {}).message || '')); } }); }
}
console.log(out.join('\n')); console.log(bad ? '\n⚠️ 확인할 것 ' + bad + '가지' : '\n✅ 전부 main 과 같음');
