/* 시험 목록 → test/INDEX.md — 각 시험 첫 줄(버전 · 무엇을 지키는지). 새 시험을 만들면 `node test/index.js` 로 다시 만들어 커밋 */
const fs = require('fs'), path = require('path');
const dir = __dirname, files = fs.readdirSync(dir).filter(f => /^t\d+\.js$/.test(f)).sort();
const rows = files.map(f => { const first = fs.readFileSync(path.join(dir, f), 'utf8').split('\n')[0].replace(/^\/\*\s*/, '').replace(/\s*\*\/.*$/, '').trim(); const m = first.match(/^(v[\d.]+)\s*(?:시험)?\s*[—-]?\s*(.*)$/); return { t: f.replace('.js', ''), v: m ? m[1] : '', what: (m ? m[2] : first) || first }; });
const md = ['# 시험 목록 (기능 등록부)', '', '앱의 기능은 여기 적힌 시험이 지킵니다. **기능을 바꾸거나 없애기 전에 그 기능의 시험을 먼저 읽고, 바꾼 뒤 그 시험(과 이웃 시험)을 돌리세요.** 새 기능은 새 시험(다음 번호)과 함께 들어옵니다.', '', '돌리기: `node test/t118.js` (하나) · `sh test/run-all.sh` (전부) · 자동: PR 마다 GitHub Actions `check`', '', '| 시험 | 버전 | 지키는 것 |', '|---|---|---|'].concat(rows.map(r => '| ' + r.t + ' | ' + r.v + ' | ' + r.what.replace(/\|/g, '·') + ' |'));
fs.writeFileSync(path.join(dir, 'INDEX.md'), md.join('\n') + '\n');
console.log(rows.length + ' tests → test/INDEX.md');
