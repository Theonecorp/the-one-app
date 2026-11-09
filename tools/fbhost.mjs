/* Firebase Hosting 배포 — node tools/fbhost.mjs . apply  (인자 apply 없으면 미리보기 · 서비스 계정 FIREBASE_PROJECT_ID · FIREBASE_CLIENT_EMAIL · FIREBASE_PRIVATE_KEY 가 있는 관리자 환경에서만 · 올리는 파일: index.html app.js sw.js manifest 아이콘 i18n.json data/*) */
/* Firebase Hosting 배포 (REST · CLI 없이) — node fbhost.mjs <폴더> [apply]  — apply 없으면 올릴 파일만 보여 줌 */
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const DIR = path.resolve(process.argv[2] || '.'), APPLY = process.argv.includes('apply');
const SITE = process.env.FIREBASE_PROJECT_ID;
const b64 = s => Buffer.from(s).toString('base64url');
const now = Math.floor(Date.now() / 1000); const key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
const hdr = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), pay = b64(JSON.stringify({ iss: process.env.FIREBASE_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
const sig = crypto.sign('RSA-SHA256', Buffer.from(hdr + '.' + pay), key).toString('base64url');
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${hdr}.${pay}.${sig}` })).json()).access_token;
const H = { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, API = 'https://firebasehosting.googleapis.com/v1beta1';
/* 올릴 파일: 앱이 쓰는 것만 (src · test · tools · 스크린샷 제외) */
const FILES = ['index.html', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'logo.png', 'logo-96.png', 'i18n.json'].filter(f => fs.existsSync(path.join(DIR, f))).concat(fs.existsSync(path.join(DIR, 'data')) ? fs.readdirSync(path.join(DIR, 'data')).filter(f => /\.(json|txt)$/.test(f)).map(f => 'data/' + f) : []);
const gz = {}, hashes = {};
for (const f of FILES) { const z = zlib.gzipSync(fs.readFileSync(path.join(DIR, f)), { level: 9 }); gz['/' + f] = z; hashes['/' + f] = crypto.createHash('sha256').update(z).digest('hex'); }
console.log('폴더', DIR, '· 파일', FILES.length, FILES.map(f => f + ' ' + Math.round(fs.statSync(path.join(DIR, f)).size / 1024) + 'KB').join(' · '));
const ver = (fs.readFileSync(path.join(DIR, 'src/main.js'), 'utf8').match(/VER = '([^']+)'/) || [])[1] || (fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').match(/app\.js\?v=([\d.]+)/) || [])[1];
console.log('앱 버전', ver);
if (!APPLY) { console.log('(미리보기 — apply 를 주면 실제로 올림)'); process.exit(0); }
const config = { headers: [
  { glob: '/index.html', headers: { 'Cache-Control': 'no-cache' } }, { glob: '/sw.js', headers: { 'Cache-Control': 'no-cache' } }, { glob: '/manifest.webmanifest', headers: { 'Cache-Control': 'no-cache' } },
  { glob: '/app.js', headers: { 'Cache-Control': 'public, max-age=600' } }, { glob: '/i18n.json', headers: { 'Cache-Control': 'public, max-age=600' } }, { glob: '/data/**', headers: { 'Cache-Control': 'public, max-age=600' } },
  { glob: '**/*.png', headers: { 'Cache-Control': 'public, max-age=86400' } } ], cleanUrls: false };
let r = await fetch(`${API}/sites/${SITE}/versions`, { method: 'POST', headers: H, body: JSON.stringify({ config, labels: { app: ver || '' } }) }); let v = await r.json(); if (!v.name) throw new Error('version ' + JSON.stringify(v).slice(0, 300));
console.log('버전 만듦', v.name);
r = await fetch(`${API}/${v.name}:populateFiles`, { method: 'POST', headers: H, body: JSON.stringify({ files: hashes }) }); const pf = await r.json(); if (!pf.uploadUrl) throw new Error('populate ' + JSON.stringify(pf).slice(0, 300));
const need = pf.uploadRequiredHashes || []; console.log('올릴 조각', need.length, '/', FILES.length);
for (const h of need) { const p = Object.keys(hashes).find(k => hashes[k] === h); const u = await fetch(pf.uploadUrl + '/' + h, { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/octet-stream' }, body: gz[p] }); if (!u.ok) throw new Error('upload ' + p + ' ' + u.status + ' ' + (await u.text()).slice(0, 200)); process.stdout.write('.'); }
console.log('\n올림');
r = await fetch(`${API}/${v.name}?updateMask=status`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'FINALIZED' }) }); const fin = await r.json(); if (fin.status !== 'FINALIZED') throw new Error('finalize ' + JSON.stringify(fin).slice(0, 300));
r = await fetch(`${API}/sites/${SITE}/releases?versionName=${v.name}`, { method: 'POST', headers: H, body: JSON.stringify({ message: 'v' + ver + ' ' + new Date().toISOString() }) }); const rel = await r.json(); if (!rel.name) throw new Error('release ' + JSON.stringify(rel).slice(0, 300));
console.log('배포 완료 →', 'https://' + SITE + '.web.app/', '(release', rel.name.split('/').pop() + ')');
