/* 🔗 연결 지도 — 이 변경이 어디와 이어져 있는지 (2026-11-13 관리자: "변경할 때마다 기존 연결을 잃지 않게")
 *   node tools/impact.mjs [기준=origin/main]   — 기준과 지금 작업 폴더(커밋 안 한 것 포함)의 차이를 읽어 보고만 함 (아무것도 바꾸지 않음)
 *   뽑는 것: ① 바뀐 줄이 건드리는 Firestore 모음 · 그 모음의 권한 규칙 · 같은 모음에 쓰는 다른 파일
 *            ② ⚠️ 통째 덮어쓰기(set)가 칸 단위 규칙 · 다른 곳이 붙이는 칸과 부딪힐 위험 (v0.8.233~236 세일즈맨 주문 permission-denied 의 모양)
 *            ③ 폰에 저장되는 자료(localStorage 'theone.*') — 옛 버전 앱이 남긴 자료를 새 코드가 그대로 읽는지
 *            ④ 바뀐 함수를 부르는 곳 · ⑤ 같이 돌려야 할 시험 · ⑥ 규칙 · 서버 함수가 바뀌었으면 배포 · 옛 앱 호환 할 일
 *            ⑦ 앱 배포와 따로 도는 바깥 프로그램(Apps Script · 출고 PC 프린터 에이전트 · 서버 함수)이 같은 모음을 쓰는지 — 이들은 옛 모양을 계속 씀
 *   analyze() 는 순수 함수 (시험 t278) — 아래 CLI 가 git · 파일을 모아 넘김 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const COL_RE = /(?:\bcol\s*:\s*|\bDB\.(?:get|list|set|update|del|watch|count)\(\s*)['"]([A-Za-z][\w]*)['"]/g;
const KEY_RE = /['"](theone\.[\w.-]+)['"]/g;
const ROUTE_RE = /(?:#\/|Router\.go\(\s*['"])([a-z][\w-]*)/g;
const FN_DEF_RE = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;
const SET_RE = /\bop\s*:\s*['"]set['"]|\bDB\.set\(/;
const PART_RE = /\bop\s*:\s*['"](?:update|merge)['"]|\bDB\.update\(/;
const GENERIC = new Set(['init', 'render', 'load', 'save', 'page', 'main', 'open', 'close', 'show', 'hide', 'list', 'get', 'set', 'run', 'go']);

const all = (re, s) => { const out = []; re.lastIndex = 0; let m; while ((m = re.exec(s))) out.push(m[1] || m[2]); return out; };
const uniq = a => [...new Set(a.filter(Boolean))];

/** git diff --unified=0 → [{ file, sign:'+'|'-', line(새 파일 기준), text }] */
export function parseDiff(diff) {
  const rows = []; let file = null, nl = 0;
  for (const ln of String(diff || '').split('\n')) {
    if (ln.startsWith('+++ ')) { file = ln.slice(4).replace(/^b\//, ''); if (file === '/dev/null') file = null; continue; }
    if (ln.startsWith('--- ')) continue;
    const h = ln.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/); if (h) { nl = Number(h[1]); continue; }
    if (!file) continue;
    if (ln.startsWith('+')) { rows.push({ file, sign: '+', line: nl, text: ln.slice(1) }); nl++; }
    else if (ln.startsWith('-')) rows.push({ file, sign: '-', line: nl, text: ln.slice(1) });
  }
  return rows;
}

/** 줄 번호(1부터)를 감싸는 함수 이름 — 위로 올라가며 처음 만나는 함수 정의 */
export function enclosingFn(content, line) {
  const L = String(content || '').split('\n');
  for (let i = Math.min(line, L.length) - 1; i >= 0; i--) { const m = L[i].match(FN_DEF_RE); if (m) return m[1] || m[2]; }
  return null;
}

/** 함수 본문 — 정의 줄부터 다음 함수 정의 전까지 */
export function fnBody(content, name) {
  const L = String(content || '').split('\n'), i = L.findIndex(l => { const m = l.match(FN_DEF_RE); return m && (m[1] || m[2]) === name; });
  if (i < 0) return ''; let j = i + 1; while (j < L.length && !FN_DEF_RE.test(L[j])) j++;
  return L.slice(i, j).join('\n');
}

/** 규칙 파일에서 '{' 로 시작하는 덩어리 끝까지 */
function block(src, from) { let i = src.indexOf('{', from), d = 0; if (i < 0) return ''; const s = i; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(s, i + 1); } return src.slice(s); }
/** 모음 이름 → 그 모음 규칙(match 덩어리) · 부르는 규칙 함수 · 칸 단위 검사 여부 */
export function rulesFor(rules, col) {
  const m = new RegExp('match\\s+/' + col + '/\\{[^}]*\\}').exec(String(rules || ''));
  if (!m) return null;
  const body = block(rules, m.index + m[0].length),   /* 경로의 {id} 다음 덩어리부터 */ fns = uniq(all(/\b([A-Za-z_]\w*)\s*\(\s*\)/g, body)).filter(f => !['request', 'resource'].includes(f));
  const fnBodies = fns.map(f => { const i = rules.search(new RegExp('function\\s+' + f + '\\s*\\(')); return i < 0 ? '' : block(rules, i); }).join('\n');
  const fieldLevel = /affectedKeys|\.diff\(|hasOnly|hasAny/.test(body + fnBodies);
  const allow = (body.match(/allow[^;]*;/g) || []).map(s => s.replace(/\s+/g, ' ').trim());
  return { allow, fns, fieldLevel };
}

/**
 * @param o.diff   git diff --unified=0 텍스트
 * @param o.files  { 'src/x.js': 내용 } — 지금 작업 폴더의 src (· functions) 파일들
 * @param o.tests  { t123: 내용 } · o.testIndex { t123: '지키는 것' }
 * @param o.rules  firestore.rules 내용
 * @param o.external { 'apps-script/Code.gs': 내용 } — 앱과 따로 배포되는 바깥 프로그램
 */
export function analyze(o) {
  const rows = parseDiff(o.diff), files = o.files || {}, external = o.external || {}, tests = o.tests || {}, idx = o.testIndex || {}, rules = o.rules || '';
  const code = rows.filter(r => /^(src|functions)\/.*\.(m?js)$/.test(r.file) && !/^src\/.*-txt\.js$/.test(r.file));
  const changedFiles = uniq(rows.map(r => r.file));
  const text = code.map(r => r.text).join('\n');

  /* 바뀐 함수 */
  const fnsByFile = {}; code.forEach(r => { const f = enclosingFn(files[r.file], r.line); if (f) (fnsByFile[r.file] = fnsByFile[r.file] || new Set()).add(f); });
  const changedFns = uniq(Object.values(fnsByFile).flatMap(s => [...s]));

  /* 폰 저장 키 — 바뀐 줄에 바로 있거나, 바뀐 줄이 부르는 같은 파일의 함수(한 단계)가 키 상수를 쓰는 경우 */
  const keys = new Set(all(KEY_RE, text));
  Object.keys(fnsByFile).forEach(f => {
    const src = files[f] || '', consts = {}; src.split('\n').forEach(l => { const m = l.match(/(?:const|let)\s+([A-Z_][\w]*)\s*=\s*['"](theone\.[\w.-]+)['"]/); if (m) consts[m[1]] = m[2]; });
    const names = Object.keys(consts); if (!names.length) return;
    const helpers = {}; src.split('\n').forEach((l, i) => { names.forEach(n => { if (new RegExp('\\b' + n + '\\b').test(l) && !/(?:const|let)\s+[A-Z_]/.test(l)) { const fn = enclosingFn(src, i + 1); if (fn) (helpers[fn] = helpers[fn] || new Set()).add(consts[n]); } }); });
    const mine = code.filter(r => r.file === f).map(r => r.text).concat([...fnsByFile[f]].map(fn => fnBody(src, fn))).join('\n');   /* 바뀐 줄 + 바뀐 함수 본문 전체 */
    names.forEach(n => { if (new RegExp('\\b' + n + '\\b').test(mine)) keys.add(consts[n]); });
    Object.keys(helpers).forEach(h => { if (new RegExp('\\b' + h + '\\s*\\(').test(mine) || [...fnsByFile[f]].includes(h)) helpers[h].forEach(k => keys.add(k)); });
  });

  /* Firestore 모음 */
  /* 바뀐 규칙 줄이 속한 모음 (match /x/{id} — 위로 올라가며 처음 만나는 것) · 규칙만 바뀌어도 그 모음을 쓰는 앱 · 바깥 프로그램을 봄 */
  const RL = String(rules).split('\n'), ruleCols = rows.filter(r => r.file === 'firestore.rules').map(r => { for (let i = Math.min(r.line, RL.length) - 1; i >= 0; i--) { const m = RL[i].match(/match\s+\/(\w+)\/\{/); if (m) return m[1]; } return null; });
  const cols = uniq(all(COL_RE, text).concat(ruleCols));
  const writeLines = (col, re) => { const out = []; Object.keys(files).forEach(f => files[f].split('\n').forEach((l, i) => { if (re.test(l) && new RegExp('[\'"]' + col + '[\'"]').test(l)) out.push(f + ':' + (i + 1)); })); return out; };
  const colInfo = cols.map(col => {
    const r = rulesFor(rules, col), partial = writeLines(col, PART_RE), sets = writeLines(col, SET_RE);
    const setChanged = code.some(x => x.sign === '+' && SET_RE.test(x.text) && new RegExp('[\'"]' + col + '[\'"]').test(x.text));
    const risk = setChanged && ((r && r.fieldLevel) || partial.length)
      ? '통째 덮어쓰기(set) — ' + (r && r.fieldLevel ? '이 모음 규칙이 칸 단위로 막음(affectedKeys/diff). ' : '') + (partial.length ? '다른 곳이 칸만 붙이는 쓰기 ' + partial.length + '곳 → 서버에만 있는 칸을 지우게 됨. ' : '') + '서버 문서를 읽어 없는 칸을 이어 붙이거나(update/merge) 규칙 시뮬레이션으로 확인'
      : null;
    const ext = Object.keys(external).filter(f => new RegExp('[\'"/]' + col + '[\'"/]').test(external[f]));   /* 'orders' · "orders" · /orders/ */
    return { col, rules: r, partialWriters: partial, setWriters: sets, risk, external: ext };
  });

  /* 바뀐 함수를 부르는 곳 */
  const callers = {};
  changedFns.filter(f => f.length >= 4 && !GENERIC.has(f)).forEach(fn => {
    const re = new RegExp('\\b' + fn.replace(/\$/g, '\\$') + '\\b'), defRe = new RegExp('function\\s+' + fn + '\\b|(?:const|let)\\s+' + fn + '\\s*=');
    Object.keys(files).forEach(f => files[f].split('\n').forEach((l, i) => { if (re.test(l) && !defRe.test(l)) (callers[fn] = callers[fn] || []).push(f + ':' + (i + 1)); }));
  });

  /* 다른 파일이 같은 폰 저장 키를 씀 */
  const keyUsers = {}; [...keys].forEach(k => { Object.keys(files).forEach(f => { if (files[f].includes(k)) (keyUsers[k] = keyUsers[k] || []).push(f); }); });

  /* 같이 돌릴 시험 — 키 · 함수 3점, 화면 2점, 모음 1점 */
  const routes = uniq(all(ROUTE_RE, text));
  const sig = [...[...keys].map(k => [k, 3]), ...changedFns.filter(f => f.length >= 5 && !GENERIC.has(f)).map(f => [f, 3]), ...routes.map(r => ['#/' + r, 2]), ...cols.map(c => ["'" + c + "'", 1])];
  const scored = Object.keys(tests).map(t => { let s = 0; const hit = []; sig.forEach(([k, w]) => { if (tests[t].includes(k)) { s += w; hit.push(k); } }); return { t, s, hit, what: idx[t] || '' }; }).filter(x => x.s).sort((a, b) => b.s - a.s || a.t.localeCompare(b.t));

  const rulesChanged = changedFiles.includes('firestore.rules'), fnChanged = changedFiles.some(f => f.startsWith('functions/'));
  return { changedFiles, changedFns, cols: colInfo, keys: [...keys], keyUsers, callers, routes, tests: scored.slice(0, 15), testsMore: Math.max(scored.length - 15, 0), rulesChanged, fnChanged };
}

export function report(a) {
  const L = ['# 🔗 연결 지도', '', '바뀐 파일: ' + (a.changedFiles.join(' · ') || '없음')];
  if (a.changedFns.length) L.push('바뀐 함수: ' + a.changedFns.join(' · '));
  const risks = a.cols.filter(c => c.risk);
  L.push('', '## ⚠️ 먼저 볼 것');
  if (!risks.length && !a.keys.length && !a.rulesChanged && !a.fnChanged && !a.cols.some(c => c.external.length)) L.push('- 없음');
  risks.forEach(c => L.push('- **' + c.col + '**: ' + c.risk));
  a.cols.filter(c => c.external.length).forEach(c => L.push('- 🔌 **' + c.col + '** 를 앱 밖 프로그램도 씀: ' + c.external.join(' · ') + ' — 앱 배포로 같이 바뀌지 않음(옛 모양을 계속 씀). 칸 · 상태 이름을 바꾸거나 규칙을 좁히면 이쪽도 고치고 따로 반영 (Apps Script 붙여 넣기 · 출고 PC 에이전트 · 함수 배포)'));
  a.keys.forEach(k => L.push('- 📱 폰 저장 `' + k + '` — 직원 폰에는 옛 버전이 저장한 이 자료가 남아 있음. 새 코드가 옛 모양을 그대로 읽고 보내는지 시험으로 확인' + ((a.keyUsers[k] || []).length > 1 ? ' (같이 쓰는 파일: ' + a.keyUsers[k].join(' · ') + ')' : '')));
  if (a.rulesChanged) L.push('- 🔐 firestore.rules 바뀜 — 폰은 앱을 다시 열 때까지 **옛 앱**: 새 규칙이 옛 앱의 쓰기도 받아야 함 · `node tools/rules-test.mjs` 에 옛 모양 · 새 모양 둘 다 · 머지 뒤 `node tools/deploy-rules.js`');
  if (a.fnChanged) L.push('- ☁️ functions/ 바뀜 — 함수 배포 필요 (`functions/README.md`) · 옛 앱이 부르는 모양도 받아야 함');
  if (a.cols.length) {
    L.push('', '## Firestore 모음');
    a.cols.forEach(c => {
      L.push('- **' + c.col + '**' + (c.rules ? (c.rules.fieldLevel ? ' · 규칙이 칸 단위로 검사' : '') + (c.rules.fns.length ? ' · 규칙 함수 ' + c.rules.fns.join(', ') : '') : ' · ⚠️ 규칙에 match 없음 (기본 거부)'));
      if (c.rules) c.rules.allow.forEach(x => L.push('  - `' + x.slice(0, 220) + '`'));
      if (c.partialWriters.length) L.push('  - 칸만 바꾸는 곳 ' + c.partialWriters.length + ': ' + c.partialWriters.slice(0, 8).join(' · ') + (c.partialWriters.length > 8 ? ' …' : ''));
      if (c.setWriters.length) L.push('  - 통째 쓰는 곳 ' + c.setWriters.length + ': ' + c.setWriters.slice(0, 8).join(' · ') + (c.setWriters.length > 8 ? ' …' : ''));
    });
  }
  const cs = Object.keys(a.callers);
  if (cs.length) { L.push('', '## 바뀐 함수를 부르는 곳'); cs.forEach(f => L.push('- ' + f + ' ← ' + a.callers[f].slice(0, 10).join(' · ') + (a.callers[f].length > 10 ? ' …' : ''))); }
  L.push('', '## 같이 돌릴 시험');
  if (!a.tests.length) L.push('- 이어진 시험을 못 찾음 — 새 시험을 꼭 만들 것');
  a.tests.forEach(x => L.push('- `node test/' + x.t + '.js` — ' + x.what.slice(0, 90) + ' (' + x.hit.join(', ').slice(0, 80) + ')'));
  if (a.testsMore) L.push('- … 그 밖에 ' + a.testsMore + '개 (전체는 `sh test/run-par.sh`)');
  return L.join('\n');
}

/* ---------- CLI ---------- */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sh = c => execSync(c, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  const ref = process.argv[2] || 'origin/main', range = ref.includes('..');   /* A..B 를 주면 지난 변경(커밋 범위)을 봄 — 예: 사고 원인 되짚기 */
  let base = ref; if (!range) { try { base = sh('git merge-base ' + ref + ' HEAD').trim(); } catch (e) { /* 그대로 */ } }
  const diff = sh('git diff --unified=0 ' + (range ? ref.replace('..', ' ') : base) + ' -- src functions firestore.rules ":(exclude)functions/package-lock.json"');
  const untracked = range ? [] : sh('git ls-files --others --exclude-standard -- src functions').split('\n').filter(Boolean);
  const extra = untracked.map(f => '+++ b/' + f + '\n@@ -0,0 +1 @@\n' + fs.readFileSync(path.join(root, f), 'utf8').split('\n').map(l => '+' + l).join('\n')).join('\n');
  const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
  const files = {}; [...walk(path.join(root, 'src')), ...walk(path.join(root, 'functions'))].filter(f => /\.m?js$/.test(f)).forEach(f => { files[path.relative(root, f)] = fs.readFileSync(f, 'utf8'); });
  if (range) { const B = ref.split('..')[1] || 'HEAD'; parseDiff(diff).map(r => r.file).filter((f, i, a) => a.indexOf(f) === i && f in files).forEach(f => { try { files[f] = sh('git show ' + B + ':' + f); } catch (e) {} }); }   /* 줄 번호가 그때 파일과 맞게 */
  const tests = {}; fs.readdirSync(path.join(root, 'test')).filter(f => /^t\d+\.js$/.test(f)).forEach(f => { tests[f.replace('.js', '')] = fs.readFileSync(path.join(root, 'test', f), 'utf8'); });
  const testIndex = {}; try { fs.readFileSync(path.join(root, 'test/INDEX.md'), 'utf8').split('\n').forEach(l => { const m = l.match(/^\| (t\d+) \| [^|]* \| (.*) \|$/); if (m) testIndex[m[1]] = m[2]; }); } catch (e) {}
  const external = {}; [...walk(path.join(root, 'apps-script')), ...walk(path.join(root, 'agente-impressao')), ...walk(path.join(root, 'functions'))].filter(f => /\.(gs|m?js)$/.test(f)).forEach(f => { external[path.relative(root, f)] = fs.readFileSync(f, 'utf8'); });
  const rules = fs.existsSync(path.join(root, 'firestore.rules')) ? fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') : '';
  console.log(report(analyze({ diff: diff + '\n' + extra, files, tests, testIndex, rules, external })));
}
