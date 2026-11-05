/* firestore.rules 배포 — Firebase 규칙 API (관리자 환경에서만: 서비스 계정이 환경 변수에 있어야 함)
 *   node tools/deploy-rules.js            저장소의 firestore.rules 를 the-one-app-ff40e 에 올림 (문법 검사 → 규칙 세트 만들기 → cloud.firestore 릴리스 교체)
 *   node tools/deploy-rules.js --check    문법 검사만 (올리지 않음)
 * 자격 증명 (둘 중 하나, 채팅 · 코드에 넣지 않음 — 클라우드 환경 변수에만):
 *   FIREBASE_SERVICE_ACCOUNT   서비스 계정 JSON 전체 (client_email · private_key · project_id)
 *   FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (+ FIREBASE_PROJECT_ID, 없으면 the-one-app-ff40e)
 * 서비스 계정에는 "Firebase Rules 관리자"(roles/firebaserules.admin) 역할이 있어야 함. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DEFAULT_PROJECT = 'the-one-app-ff40e';
const b64u = b => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** 환경 변수에서 서비스 계정 읽기 — 없으면 null (값은 밖으로 내보내지 않음) */
function credsFrom(env) {
  if (env.FIREBASE_SERVICE_ACCOUNT) { try { const j = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); if (j.client_email && j.private_key) return { email: j.client_email, key: j.private_key, project: j.project_id || env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT }; } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT 가 JSON 이 아닙니다'); } }
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) return { email: env.FIREBASE_CLIENT_EMAIL, key: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), project: env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT };
  return null;
}
/** 서비스 계정 JWT → 액세스 토큰 (OAuth2 jwt-bearer) */
async function accessToken(c, fetchImpl, now) {
  const iat = Math.floor((now || Date.now()) / 1000);
  const hdr = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), body = b64u(JSON.stringify({ iss: c.email, scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const sig = b64u(crypto.sign('RSA-SHA256', Buffer.from(hdr + '.' + body), c.key));
  const r = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + hdr + '.' + body + '.' + sig });
  const j = await r.json(); if (!r.ok || !j.access_token) throw new Error('토큰 실패 ' + r.status + ': ' + JSON.stringify(j).substring(0, 200));
  return j.access_token;
}
/** 규칙 올리기 — opts: { checkOnly } · 결과 { issues, rulesetName, releaseName } */
async function deploy(rulesText, c, fetchImpl, opts) {
  const tok = await accessToken(c, fetchImpl), H = { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, base = 'https://firebaserules.googleapis.com/v1/projects/' + c.project;
  const src = { files: [{ name: 'firestore.rules', content: rulesText }] };
  /* ① 문법 · 의미 검사 */
  const t = await fetchImpl(base + ':test', { method: 'POST', headers: H, body: JSON.stringify({ source: src }) }); const tj = await t.json();
  if (!t.ok) throw new Error('검사 실패 ' + t.status + ': ' + JSON.stringify(tj).substring(0, 300));
  const issues = (tj.issues || []).filter(i => i.severity === 'ERROR');
  if (issues.length) throw new Error('규칙 오류 ' + issues.length + '건:\n' + issues.map(i => '  ' + (i.sourcePosition ? i.sourcePosition.line + ': ' : '') + i.description).join('\n'));
  if (opts && opts.checkOnly) return { issues: tj.issues || [], rulesetName: '', releaseName: '' };
  /* ② 규칙 세트 만들기 → ③ cloud.firestore 릴리스를 그 세트로 */
  const r = await fetchImpl(base + '/rulesets', { method: 'POST', headers: H, body: JSON.stringify({ source: src }) }); const rj = await r.json();
  if (!r.ok || !rj.name) throw new Error('규칙 세트 실패 ' + r.status + ': ' + JSON.stringify(rj).substring(0, 300));
  const relName = 'projects/' + c.project + '/releases/cloud.firestore';
  const u = await fetchImpl(base + '/releases/cloud.firestore', { method: 'PATCH', headers: H, body: JSON.stringify({ release: { name: relName, rulesetName: rj.name } }) }); const uj = await u.json();
  if (!u.ok) throw new Error('릴리스 실패 ' + u.status + ': ' + JSON.stringify(uj).substring(0, 300));
  return { issues: tj.issues || [], rulesetName: rj.name, releaseName: uj.name || relName };
}
module.exports = { credsFrom, accessToken, deploy, DEFAULT_PROJECT };

if (require.main === module) {
  (async () => {
    const checkOnly = process.argv.includes('--check');
    const c = credsFrom(process.env);
    if (!c) { console.error('❌ 서비스 계정이 없습니다 — 관리자 클라우드 환경 변수 FIREBASE_SERVICE_ACCOUNT (또는 FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) 가 있는 세션에서 실행하세요'); process.exit(2); }
    const rules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
    try {
      const out = await deploy(rules, c, fetch, { checkOnly });
      const warn = out.issues.filter(i => i.severity !== 'ERROR'); if (warn.length) console.log('⚠️ 경고 ' + warn.length + '건: ' + warn.map(i => i.description).join(' · '));
      console.log(checkOnly ? '✅ 문법 OK (올리지 않음) · ' + c.project : '✅ 배포 완료 · ' + c.project + ' · ' + out.rulesetName.split('/').pop() + ' · ' + rules.split('\n').length + '줄');
    } catch (e) { console.error('❌ ' + e.message); process.exit(1); }
  })();
}
