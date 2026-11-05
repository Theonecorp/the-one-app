/* 버전 세 곳 — src/main.js 의 VER · index.html 의 app.js?v= · sw.js 의 CACHE(theone-shell-vNNN) 를 한꺼번에
 *   node tools/version.js show              지금 값
 *   node tools/version.js match <git ref>   그 ref(예: origin/main) 의 세 값으로 맞춤 (머지 전 충돌 막기)
 *   node tools/version.js bump [git ref]    그 ref(없으면 지금) 값에서 하나씩 올림 — VER 끝자리 +1 · CACHE 번호 +1
 * 여러 사람이 동시에 작업해도 버전은 "main 다음 번호" 하나로 정해지게 하려는 것 (tools/sync-main.sh 가 씀) */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const F = { main: 'src/main.js', idx: 'index.html', sw: 'sw.js' };
const RE = { main: /export const VER = 'v([0-9.]+)'/, idx: /app\.js\?v=([0-9.]+)/, sw: /const CACHE = 'theone-shell-v([0-9]+)'/ };
const read = (ref, f) => ref ? execSync('git show ' + ref + ':' + f, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }) : fs.readFileSync(path.join(ROOT, f), 'utf8');
const get = ref => { const o = {}; for (const k in F) { const m = read(ref, F[k]).match(RE[k]); if (!m) throw new Error(F[k] + ' 에서 버전을 못 찾음'); o[k] = m[1]; } return o; };
const put = v => {
  const sub = { main: s => s.replace(RE.main, "export const VER = 'v" + v.ver + "'"), idx: s => s.replace(/app\.js\?v=[0-9.]+/g, 'app.js?v=' + v.ver), sw: s => s.replace(RE.sw, "const CACHE = 'theone-shell-v" + v.shell + "'") };
  for (const k in F) { const p = path.join(ROOT, F[k]), s = fs.readFileSync(p, 'utf8'), t = sub[k](s); if (t !== s) fs.writeFileSync(p, t); }
};
const inc = ver => { const a = ver.split('.').map(Number); a[a.length - 1]++; return a.join('.'); };
const [cmd, ref] = process.argv.slice(2);
const cur = get(null);
if (cmd === 'show' || !cmd) { console.log('VER v' + cur.main + ' · index.html v' + cur.idx + ' · sw CACHE v' + cur.sw); }
else if (cmd === 'match') { const b = get(ref || 'origin/main'); put({ ver: b.main, shell: b.sw }); console.log('→ ' + (ref || 'origin/main') + ' 값으로: v' + b.main + ' · shell v' + b.sw); }
else if (cmd === 'bump') { const b = ref ? get(ref) : cur; const v = { ver: inc(b.main), shell: String(Number(b.sw) + 1) }; put(v); console.log('→ 올림: v' + v.ver + ' · shell v' + v.shell); }
else { console.error('사용법: node tools/version.js show | match <ref> | bump [ref]'); process.exit(2); }
