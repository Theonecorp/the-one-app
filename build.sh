#!/bin/sh
# 앱 빌드 — src/*.js → app.js (Firebase SDK 는 gstatic 에서 받으므로 외부로 둠)
npx esbuild src/main.js --bundle --format=esm --outfile=app.js --target=es2019 "--external:https://*" --minify-whitespace --legal-comments=none
