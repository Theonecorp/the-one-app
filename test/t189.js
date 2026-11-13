/* v0.8.185 시험 — ↩ 세일즈맨 크레딧 permission denied (2026-11-11 관리자: "Brandon 이 세일즈 중에 크레딧 주려는데 permission denied")
 *   원인: 크레딧 번호(CM-…)는 counters/inv2 를 읽고 +1 하는 트랜잭션인데, 규칙이 세일즈맨에게 쓰기(CM +1)만 열고 읽기는 막음
 *   ① firestore.rules: counters 읽기 = 담당자 또는 세일즈맨(inv2 만) · 세일즈맨 쓰기는 inv2 의 CM 칸 +1 만 그대로
 *   ② (관리자 환경에서만) tools/rules-test.mjs — Firebase 규칙 시험 API 로 실제 판정: 읽기 · CM +1 · 크레딧 만들기 ALLOW, A 칸 · 다른 번호표 DENY */
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const errs = [], root = path.resolve(__dirname, '..');
const R = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const m = R.match(/match \/counters\/\{id\} \{[^]*?\n    \}/), blk = m ? m[0] : '';
if (!/allow read: if isStaff\(\) \|\| \(\(id == 'inv2' \|\| id == 'so'\) && registered\(\) && mySm\(\) != ''\);/.test(blk))   // v0.8.227: SA 주문 번호(so)도 errs.push('① salesmen can read counters/inv2 (needed to take the next CM number)');
if (/allow read: if isStaff\(\) \|\| registered\(\)\s*;/.test(blk) || /allow read: if true/.test(blk)) errs.push('① counters are not readable by everyone');
if (!/affectedKeys\(\)\.hasOnly\(\['CM'\]\)/.test(blk) || !/id == 'inv2'/.test(blk)) errs.push('① salesman write stays limited to inv2 · CM +1');
console.log('① counters block ok:', !errs.length);
/* ② */
let out = '';
try { out = execFileSync('node', [path.join(root, 'tools/rules-test.mjs'), path.join(root, 'firestore.rules')], { encoding: 'utf8', timeout: 60000 }); } catch (e) { out = (e.stdout || '') + (e.stderr || ''); if (!/SKIP/.test(out)) errs.push('② rules test: ' + out.trim().split('\n').slice(-6).join(' / ')); }
console.log('②', out.trim().split('\n').slice(-1)[0]);
console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
