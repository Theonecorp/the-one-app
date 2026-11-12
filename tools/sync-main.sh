#!/bin/sh
# 최신 main 합치기 — 여러 사람이 동시에 작업해도 "버전 세 곳 · app.js · i18n.json" 때문에 충돌 나지 않게
#   sh tools/sync-main.sh
#   ① 이 브랜치의 버전 세 곳 · app.js · i18n.json 을 잠깐 main 값으로 맞춰 커밋 (양쪽이 같은 값 → 그 자리는 충돌 없음)
#   ② origin/main 머지 — 여기서 나는 충돌은 진짜 src 충돌뿐 (손으로 풀고 다시 실행)
#   ③ i18n.json 은 문구 단위로 합침(이 브랜치가 넣은 문구 + main 의 문구) · app.js 다시 빌드
#   ④ 이 브랜치에 main 과 다른 src 가 있으면 버전을 "main 다음 번호" 로 올림
cd "$(dirname "$0")/.." || exit 2
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "❌ 커밋하지 않은 변경이 있습니다 — 먼저 커밋하세요"; exit 1; fi
if [ -f .git/MERGE_HEAD ]; then echo "❌ 머지가 진행 중입니다 — 충돌을 풀고 git commit 한 뒤 다시 실행하세요"; exit 1; fi
git fetch -q origin main || exit 1
if git merge-base --is-ancestor origin/main HEAD; then
  echo "이미 최신 main 이 들어 있습니다"
else
  TMP=$(mktemp -d); BASE=$(git merge-base HEAD origin/main)
  git show "$BASE:i18n.json" > "$TMP/base.json" 2>/dev/null || echo '{}' > "$TMP/base.json"
  cp i18n.json "$TMP/ours.json"
  # ① 생성물 · 버전 자리를 main 값으로
  git show origin/main:app.js > app.js
  git show origin/main:i18n.json > i18n.json
  node tools/version.js match origin/main >/dev/null || exit 1
  git add app.js i18n.json src/ver.js index.html sw.js 2>/dev/null || git add app.js i18n.json index.html sw.js
  git diff --cached --quiet || git commit -q -m "sync: 버전 · app.js · i18n.json 을 main 값으로 맞춤 (머지 준비)"
  # ② 머지
  if ! git merge --no-edit -q origin/main; then
    echo "❌ src 충돌 — 아래 파일을 손으로 풀고 git add · git commit 한 뒤 다시 실행하세요:"; git diff --name-only --diff-filter=U | sed 's/^/   /'
    echo "   (이 브랜치의 번역 문구는 .git/sync-ours-i18n.json 에 보관했습니다 — 다시 실행하면 자동으로 다시 넣습니다)"
    cp "$TMP/ours.json" .git/sync-ours-i18n.json; cp "$TMP/base.json" .git/sync-base-i18n.json; exit 1
  fi
  # ③ 번역 합치기
  node tools/i18n.js merge3 "$TMP/base.json" "$TMP/ours.json" i18n.json i18n.json || exit 1
  rm -rf "$TMP"
fi
# 지난번에 src 충돌로 멈췄다면 그때 보관한 이 브랜치의 번역 문구를 다시 넣음
if [ -f .git/sync-ours-i18n.json ]; then node tools/i18n.js merge3 .git/sync-base-i18n.json .git/sync-ours-i18n.json i18n.json i18n.json && rm -f .git/sync-ours-i18n.json .git/sync-base-i18n.json; fi
# ④ 버전 · 빌드
if git diff --quiet origin/main -- src; then node tools/version.js match origin/main >/dev/null
else
  MAINV=$( (git show origin/main:src/ver.js 2>/dev/null || git show origin/main:src/main.js) | grep -o "export const VER = 'v[0-9.]*'" | grep -o '[0-9][0-9.]*')
  CURV=$(grep -o "export const VER = 'v[0-9.]*'" src/ver.js | grep -o '[0-9][0-9.]*')
  [ "$CURV" = "$MAINV" ] && node tools/version.js bump origin/main
fi
sh build.sh || exit 1
git add app.js i18n.json src/ver.js index.html sw.js
git diff --cached --quiet || git commit -q -m "sync: main 합친 뒤 다시 빌드 · $(node tools/version.js show)"
echo "✅ main 합치기 끝 — $(node tools/version.js show)"
