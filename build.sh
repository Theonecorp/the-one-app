#!/bin/sh
# 앱 빌드 — src/*.js → app.js (Firebase SDK 는 gstatic 에서 받으므로 외부로 둠)
# esbuild 는 package-lock 에 고정된 버전(node_modules)만 쓴다 — 세션마다 다른 버전으로 빌드하면 app.js 가 매번 달라져 머지 충돌과 CI 불일치가 난다
cd "$(dirname "$0")" || exit 1
[ -x node_modules/.bin/esbuild ] || npm ci --silent --no-audit --no-fund || exit 1
node_modules/.bin/esbuild src/main.js --bundle --format=esm --outfile=app.js --target=es2019 "--external:https://*" --minify --legal-comments=none
# 🚢 공장 인보이스 읽기 — 앱과 같은 코드로 Apps Script 용 파일을 만듦 (apps-script/InboundParse.gs)
node tools/gas-inbound.js || exit 1
# 번역 사전을 한 줄에 한 문구로 정리 (동시 작업 때 git 충돌을 막음 · tools/i18n.js)
node tools/i18n.js fmt
