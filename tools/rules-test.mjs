/* 🔐 Firestore 규칙 시험 — firebaserules projects:test (배포하지 않고 규칙만 돌려 봄 · 데이터를 읽거나 쓰지 않음)
 *   node tools/rules-test.mjs [firestore.rules]   — 서비스 계정(FIREBASE_*)이 있는 관리자 환경에서만. 없으면 건너뜀
 *   get() · exists() 는 아래 대역 문서로. 세일즈맨 크레딧(번호표 읽기 · CM +1 · 크레딧 만들기)을 확인 (v0.8.185 — 세일즈맨 크레딧 permission denied) */
import crypto from 'node:crypto'; import fs from 'node:fs';
const rulesFile = process.argv[2] || 'firestore.rules';
if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) { console.log('SKIP — FIREBASE_* 없음 (관리자 환경에서만)'); process.exit(0); }
const b64u = s => Buffer.from(s).toString('base64url'), now = Math.floor(Date.now() / 1000), key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
const hdr = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), pay = b64u(JSON.stringify({ iss: process.env.FIREBASE_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 }));
const sig = crypto.sign('RSA-SHA256', Buffer.from(hdr + '.' + pay), key).toString('base64url');
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + hdr + '.' + pay + '.' + sig })).json()).access_token;
const P = process.env.FIREBASE_PROJECT_ID, D = '/databases/(default)/documents';
const EMAIL = 'sm-test@example.com', user = { role: 'salesman', sm: 'BRANDON', active: true };
/* get() / exists() 대역 — 이 사용자 문서 · 가게 · 설정 · 번호표 */
const docs = { ['/databases/(default)/documents/users/' + EMAIL]: user, '/databases/(default)/documents/accounts/1111': { sm: 'BRANDON' }, '/databases/(default)/documents/settings/app': { creditMax: 10000 }, '/databases/(default)/documents/counters/inv2': { CM: 5, A: 43122 } };
const functionMocks = [];
Object.entries(docs).forEach(([p, d]) => { functionMocks.push({ function: 'get', args: [{ exactValue: p }], result: { value: { data: d } } }); functionMocks.push({ function: 'exists', args: [{ exactValue: p }], result: { value: true } }); });
functionMocks.push({ function: 'exists', args: [{ anyValue: {} }], result: { value: false } });
const auth = { uid: 'u1', token: { email: EMAIL, email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
const cases = [
  { name: '세일즈맨이 번호표(counters/inv2) 읽기', expectation: 'ALLOW', request: { auth, path: D + '/counters/inv2', method: 'get' } },
  { name: '세일즈맨이 CM 칸 +1', expectation: 'ALLOW', request: { auth, path: D + '/counters/inv2', method: 'update', resource: { data: { CM: 6, A: 43122 } } }, resource: { data: { CM: 5, A: 43122 } } },
  { name: '세일즈맨이 A 칸 바꾸기', expectation: 'DENY', request: { auth, path: D + '/counters/inv2', method: 'update', resource: { data: { CM: 5, A: 1 } } }, resource: { data: { CM: 5, A: 43122 } } },
  { name: '세일즈맨이 다른 번호표(counters/x) 읽기', expectation: 'DENY', request: { auth, path: D + '/counters/x', method: 'get' } },
  // 🔢 v0.8.227 세일즈 오더 번호 SA-000001 — counters/so 의 n 을 +1 만
  { name: '세일즈맨이 주문 번호표(counters/so) 읽기', expectation: 'ALLOW', request: { auth, path: D + '/counters/so', method: 'get' } },
  { name: '세일즈맨이 so.n +1', expectation: 'ALLOW', request: { auth, path: D + '/counters/so', method: 'update', resource: { data: { n: 8 } } }, resource: { data: { n: 7 } } },
  { name: '세일즈맨이 so.n 되돌리기', expectation: 'DENY', request: { auth, path: D + '/counters/so', method: 'update', resource: { data: { n: 3 } } }, resource: { data: { n: 7 } } },
  { name: '세일즈맨이 so 첫 번호 (n=2)', expectation: 'ALLOW', request: { auth, path: D + '/counters/so', method: 'create', resource: { data: { n: 2 } } } },
  { name: '세일즈맨이 so 를 아무 값으로 만들기', expectation: 'DENY', request: { auth, path: D + '/counters/so', method: 'create', resource: { data: { n: 500 } } } },
  { name: '세일즈맨이 남의 주문 읽기', expectation: 'DENY', request: { auth, path: D + '/orders/O261113-ZZZZ', method: 'get' }, resource: { data: { sm: 'ALEX' } } },
  { name: '세일즈맨 크레딧 만들기 (자기 가게)', expectation: 'ALLOW', request: { auth, path: D + '/invoices/CM-000006', method: 'create', resource: { data: { src: 'credit', sm: 'BRANDON', total: -50, reviewed: false, createdBy: EMAIL, acct: '1111' } } } },
];
const body = { source: { files: [{ name: 'firestore.rules', content: fs.readFileSync(rulesFile, 'utf8') }] }, testSuite: { testCases: cases.map(c => ({ expectation: c.expectation, request: c.request, resource: c.resource, functionMocks })) } };
const r = await fetch('https://firebaserules.googleapis.com/v1/projects/' + P + ':test', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const j = await r.json(); if (r.status !== 200) { console.log(r.status, JSON.stringify(j).slice(0, 800)); process.exit(1); }
let bad = 0; (j.testResults || []).forEach((t, i) => { if (t.state !== 'SUCCESS') bad++; console.log((t.state === 'SUCCESS' ? '✅' : '❌'), cases[i].name, '— 기대', cases[i].expectation, t.state === 'SUCCESS' ? '' : JSON.stringify(t.debugMessages || t.errorPosition || t).slice(0, 300)); });
console.log(bad ? 'FAIL' : 'PASS'); process.exit(bad ? 1 : 0);
