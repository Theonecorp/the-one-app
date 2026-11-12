/* v0.8.192 시험 — 🔢 버전은 src/ver.js 에만 · 🔒 큰 틀 파일은 CODEOWNERS 로 관리자 승인 (2026-11-12 관리자: "joao 가 머지 · 배포를 해도 앱의 큰 틀만 안 바뀌게")
 *   ① src/ver.js 의 VER = index.html app.js?v= · sw.js CACHE 번호가 있음 · tools/version.js show 가 같은 값
 *   ② src/main.js 에는 버전 글자가 없음 (버전만 바뀌는 배포가 잠긴 main.js 를 건드리지 않게) · ver.js 에서 가져옴
 *   ③ CODEOWNERS: 큰 틀(main.js · db.js · firestore.rules · .github · tools · build.sh · package · CLAUDE.md · .claude) = 관리자 · 그 밖(화면 · ver.js · index.html · sw.js · app.js)은 주인 없음 */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const R = path.resolve(__dirname, '..'), rd = f => fs.readFileSync(path.join(R, f), 'utf8'), errs = [], log = (...a) => console.log(...a);
/* ① */
const ver = (rd('src/ver.js').match(/export const VER = 'v([0-9.]+)'/) || [])[1], idx = (rd('index.html').match(/app\.js\?v=([0-9.]+)/) || [])[1], sw = (rd('sw.js').match(/theone-shell-v(\d+)/) || [])[1];
const show = execSync('node tools/version.js show', { cwd: R, encoding: 'utf8' }).trim(); log('① ver.js', ver, '· index.html', idx, '· sw', sw, '|', show);
if (!ver || ver !== idx || !sw || !show.includes('VER v' + ver)) errs.push('① version lives in src/ver.js and matches index.html');
/* ② */
const main = rd('src/main.js'); if (/export const VER = '/.test(main) || !/import \{ VER \} from '\.\/ver\.js'/.test(main)) errs.push('② main.js imports VER from ver.js and has no version literal');
/* ③ */
const own = {}; rd('.github/CODEOWNERS').split('\n').forEach(l => { const t = l.trim(); if (!t || t[0] === '#') return; const [p, ...o] = t.split(/\s+/); own[p] = o; });
log('③ owners:', JSON.stringify(own));
['/src/main.js', '/src/db.js', '/firestore.rules', '/.github/', '/tools/', '/build.sh', '/package.json', '/package-lock.json', '/CLAUDE.md', '/.claude/'].forEach(p => { if (!own[p] || own[p].join() !== '@Theonecorp') errs.push('③ core file locked to the admin: ' + p); });
if (own['*'] && own['*'].length) errs.push('③ no default owner — other files merge without approval');
['/src/ver.js', '/index.html', '/sw.js', '/app.js', '/src/fulfill.js', '/src/orders.js'].forEach(p => { if (own[p]) errs.push('③ not locked: ' + p); });
console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
