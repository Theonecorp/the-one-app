/* v0.8.166 시험 — tools/deploy-rules.js: firestore.rules 를 규칙 API 로 올리는 도구 (가짜 OAuth · 규칙 API 위에서, 브라우저 없음)
 *   ① 환경 변수에서 서비스 계정 읽기 (JSON 통째 · 이메일+키 두 가지) · 없으면 null
 *   ② 서명된 JWT 로 토큰 → 검사(:test) → 규칙 세트(rulesets) → cloud.firestore 릴리스 교체, 올린 내용 = 파일 그대로
 *   ③ 검사에서 ERROR 가 나오면 올리지 않고 멈춤 · --check 는 검사만 */
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const D = require(path.resolve(__dirname, '../tools/deploy-rules.js'));
const errs = [], log = (...a) => console.log(...a);
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
/* ① */
const c1 = D.credsFrom({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@x.iam', private_key: pem, project_id: 'proj-a' }) });
const c2 = D.credsFrom({ FIREBASE_CLIENT_EMAIL: 'sa2@x.iam', FIREBASE_PRIVATE_KEY: pem.replace(/\n/g, '\\n') });
log('① creds:', c1 && [c1.email, c1.project], c2 && [c2.email, c2.project, c2.key.includes('\n')]);
if (!c1 || c1.email !== 'sa@x.iam' || c1.project !== 'proj-a') errs.push('① JSON service account');
if (!c2 || c2.email !== 'sa2@x.iam' || c2.project !== D.DEFAULT_PROJECT || !c2.key.includes('\n')) errs.push('① email + key (escaped newlines restored, default project)');
if (D.credsFrom({}) !== null) errs.push('① no variables → null');
/* ② 가짜 API */
const calls = []; let failTest = false;
const fakeFetch = async (url, o) => {
  calls.push({ url, method: o.method, body: o.body, auth: (o.headers || {}).authorization });
  const ok = j => ({ ok: true, status: 200, json: async () => j });
  if (url.includes('oauth2.googleapis.com/token')) {
    const jwt = decodeURIComponent(o.body.split('assertion=')[1]), [h, b, s] = jwt.split('.');
    const verified = crypto.verify('RSA-SHA256', Buffer.from(h + '.' + b), publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
    const claims = JSON.parse(Buffer.from(b, 'base64').toString());
    calls[calls.length - 1].jwt = { verified, iss: claims.iss, scope: claims.scope, aud: claims.aud };
    return ok({ access_token: 'tok-1' });
  }
  if (url.endsWith(':test')) return ok({ issues: failTest ? [{ severity: 'ERROR', description: 'Unexpected token', sourcePosition: { line: 3 } }] : [{ severity: 'WARNING', description: 'unused function' }] });
  if (url.endsWith('/rulesets')) return ok({ name: 'projects/proj-a/rulesets/abc123' });
  if (url.endsWith('/releases/cloud.firestore')) return ok({ name: 'projects/proj-a/releases/cloud.firestore', rulesetName: JSON.parse(o.body).release.rulesetName });
  return { ok: false, status: 404, json: async () => ({}) };
};
const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
(async () => {
  const out = await D.deploy(rules, c1, fakeFetch, {});
  log('② calls:', calls.map(c => c.method + ' ' + c.url.replace(/^https:\/\//, '').slice(0, 60)));
  const tokenCall = calls[0]; if (!tokenCall || !tokenCall.jwt || !tokenCall.jwt.verified || tokenCall.jwt.iss !== 'sa@x.iam' || !/firebase/.test(tokenCall.jwt.scope) || tokenCall.jwt.aud !== 'https://oauth2.googleapis.com/token') errs.push('② signed JWT for the service account');
  const test = calls.find(c => c.url.endsWith(':test')), rs = calls.find(c => c.url.endsWith('/rulesets')), rel = calls.find(c => c.url.endsWith('/releases/cloud.firestore'));
  if (!test || !rs || !rel) errs.push('② test → rulesets → release');
  if (rs && JSON.parse(rs.body).source.files[0].content !== rules) errs.push('② uploaded content must be the repo firestore.rules verbatim');
  if (rs && !/projects\/proj-a\//.test(rs.url)) errs.push('② uses the credential\'s project');
  if (rel && (rel.method !== 'PATCH' || JSON.parse(rel.body).release.rulesetName !== 'projects/proj-a/rulesets/abc123')) errs.push('② release points at the new ruleset');
  if (calls.slice(1).some(c => c.auth !== 'Bearer tok-1')) errs.push('② API calls carry the token');
  if (out.rulesetName !== 'projects/proj-a/rulesets/abc123' || out.issues.length !== 1) errs.push('② result reports ruleset + warnings');
  /* --check */
  calls.length = 0; const chk = await D.deploy(rules, c1, fakeFetch, { checkOnly: true });
  if (calls.some(c => c.url.endsWith('/rulesets') || c.url.endsWith('/releases/cloud.firestore')) || chk.rulesetName) errs.push('③ --check must not create a ruleset or release');
  /* ③ ERROR → 멈춤 */
  calls.length = 0; failTest = true; let msg = ''; try { await D.deploy(rules, c1, fakeFetch, {}); } catch (e) { msg = e.message; }
  log('③ error path:', msg.split('\n')[0], '| calls after test:', calls.filter(c => !c.url.includes('oauth2') && !c.url.endsWith(':test')).length);
  if (!/규칙 오류 1건/.test(msg) || !/3: Unexpected token/.test(msg) || calls.some(c => c.url.endsWith('/rulesets'))) errs.push('③ a rules error stops before uploading and names the line');
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})();
