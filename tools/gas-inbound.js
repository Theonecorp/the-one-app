/* src/inbound-parse.js → apps-script/InboundParse.gs (build.sh 가 매번)
 *  앱과 Apps Script(메일 자동 등록)가 같은 규칙으로 공장 인보이스를 읽게 — import/export 만 떼고 그대로 옮김.
 *  Apps Script 에서는 이 파일을 Code.gs 옆에 "InboundParse.gs" 로 붙여 넣음 (전역 함수라 Code.gs 에서 바로 부름) */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'inbound-parse.js'), 'utf8');
const body = src.replace(/^import .*$/gm, '').replace(/^export\s+(?=(const|function|let)\b)/gm, '');
if (/^\s*(export|import)\s/m.test(body)) { console.error('gas-inbound: export/import 가 남았습니다'); process.exit(1); }
const out = '/* ⚠️ 자동 생성 — 고치지 마세요. 원본: src/inbound-parse.js (tools/gas-inbound.js 가 build.sh 때 만듦)\n *  Apps Script 프로젝트(THE ONE Mail)에 Code.gs 옆 "InboundParse.gs" 로 통째로 붙여 넣습니다. */\n' + body;
const dst = path.join(root, 'apps-script', 'InboundParse.gs');
if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== out) fs.writeFileSync(dst, out);
