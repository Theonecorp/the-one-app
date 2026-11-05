/* i18n.json 도구 — 번역 사전을 "한 줄에 한 문구" 로 (여러 사람이 동시에 문구를 더해도 git 충돌이 거의 안 나게)
 *   node tools/i18n.js fmt                         i18n.json 을 정렬 · 한 줄에 하나로 다시 씀 (build.sh 가 매번 부름)
 *   node tools/i18n.js check                       형식이 맞는지만 (CI) — 틀리면 종료 코드 1
 *   node tools/i18n.js merge3 <base> <ours> <theirs> <out>
 *                                                  세 파일을 문구 단위로 합침: 이 브랜치가 바꾼 문구는 이 브랜치 것, 아니면 main 것 (tools/sync-main.sh 가 씀)
 *   node tools/i18n.js add '한글' 'English' 'Português'   문구 하나 넣기 (p: 버튼 · 메뉴처럼 통째인 문구)
 * 앱(src/i18n.js)은 JSON 으로 읽으므로 줄바꿈 · 순서는 동작에 영향 없음 */
const fs = require('fs'), path = require('path');
const FILE = path.resolve(__dirname, '..', 'i18n.json');
const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const isMap = v => v && typeof v === 'object' && !Array.isArray(v);
const keys = o => Object.keys(o).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
function fmt(j) {
  const top = keys(j).map(k => {
    if (!isMap(j[k])) return JSON.stringify(k) + ':' + JSON.stringify(j[k]);
    const ks = keys(j[k]);
    return JSON.stringify(k) + ':{' + (ks.length ? '\n' + ks.map(x => JSON.stringify(x) + ':' + JSON.stringify(j[k][x])).join(',\n') + '\n' : '') + '}';
  });
  return '{\n' + top.join(',\n') + '\n}\n';
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function merge3(base, ours, theirs) {
  const out = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
    const B = base[k], O = ours[k], T = theirs[k];
    if (isMap(O) || isMap(T)) {
      const b = isMap(B) ? B : {}, o = isMap(O) ? O : {}, t = isMap(T) ? T : {}, m = {};
      for (const x of new Set([...Object.keys(b), ...Object.keys(o), ...Object.keys(t)])) {
        const oc = !same(o[x], b[x]);            // 이 브랜치가 바꾼(넣은 · 지운) 문구인가
        const v = oc ? o[x] : t[x];
        if (v !== undefined) m[x] = v;
      }
      out[k] = m;
    } else { const v = !same(O, B) ? O : T; if (v !== undefined) out[k] = v; }
  }
  return out;
}
const [cmd, ...a] = process.argv.slice(2);
if (cmd === 'fmt') { const s = fmt(load(FILE)); if (fs.readFileSync(FILE, 'utf8') !== s) fs.writeFileSync(FILE, s); }
else if (cmd === 'check') { const s = fs.readFileSync(FILE, 'utf8'); if (s !== fmt(JSON.parse(s))) { console.error('i18n.json 형식이 다릅니다 — node tools/i18n.js fmt (sh build.sh 가 해 줌) 후 커밋하세요'); process.exit(1); } console.log('i18n.json OK'); }
else if (cmd === 'merge3') { const [b, o, t, out] = a; const rd = f => { try { return load(f); } catch (e) { return {}; } }; fs.writeFileSync(out, fmt(merge3(rd(b), rd(o), rd(t)))); }
else if (cmd === 'add') { const [ko, en, pt] = a; if (!ko || !en) { console.error("사용법: node tools/i18n.js add '한글' 'English' 'Português'"); process.exit(2); } const j = load(FILE); j.p = j.p || {}; j.p[ko] = [en, pt || '']; fs.writeFileSync(FILE, fmt(j)); console.log('+ ' + ko + ' → ' + en + ' / ' + (pt || '(pt 없음)')); }
else { console.error('사용법: node tools/i18n.js fmt | check | merge3 base ours theirs out | add ko en pt'); process.exit(2); }
