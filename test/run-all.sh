#!/bin/sh
# 전체 시험 — test/t*.js 를 순서대로 돈다. 결과: 이름 PASS/FAIL/ERR 초
#   SHARD=1/4 처럼 주면 그 조각만 (CI 가 4개로 나눠 병렬로 돈다) · test/known-fail.txt 에 있는 시험은 실패해도 전체 결과를 깨지 않음(경고만)
#   PW_CHROME=크롬 경로 를 주면 그 크롬으로, 없으면 playwright 기본 크롬
cd "$(dirname "$0")/.." || exit 2
mkdir -p test/out   # 시험이 스크린샷을 여기에 둠 (gitignore 라 CI 에는 없음)
idx=${SHARD%%/*}; n=${SHARD##*/}; [ -z "$SHARD" ] && idx=1 && n=1
i=0; fail=0; warn=0; total=0
for f in test/t[0-9]*.js; do   # t040.js … (trunc_scan.js · dbg.js · shot.js 같은 도구는 제외)
  i=$((i+1)); [ $(( (i-1) % n + 1 )) -ne "$idx" ] && continue
  name=$(basename "$f" .js); total=$((total+1)); s=$(date +%s)
  tmp=$(mktemp)
  # 시험마다 자기 프로세스 묶음(setsid)으로 돌리고, 끝나면 그 묶음만 정리 — 시험이 중간에 죽어 남은 시험용 웹서버도 같이.
  # (예전엔 pkill 로 모든 시험 서버를 지워, 여러 조각을 한 기계에서 동시에 돌리면 다른 조각의 서버까지 죽었음)
  setsid timeout 300 node "$f" > "$tmp" 2>&1 &
  p=$!; wait $p; code=$?
  kill -- -"$p" 2>/dev/null
  out=$(cat "$tmp"); rm -f "$tmp"
  st=$(printf '%s\n' "$out" | grep -E '^(PASS|FAIL)' | tail -1 | cut -c1-4)
  # 옛 시험(t04x~t05x)은 PASS 를 찍지 않고 끝남 → 오류 없이 끝나면(종료 0) 통과, 예외로 죽으면(종료 ≠0) 실패
  [ -z "$st" ] && { [ $code -eq 0 ] && st=PASS || st="ERR($code)"; }
  [ "$st" = PASS ] && [ $code -ne 0 ] && st="ERR($code)"
  t=$(( $(date +%s) - s ))
  if [ "$st" = PASS ]; then echo "✅ $name PASS ${t}s"
  elif grep -qx "$name" test/known-fail.txt 2>/dev/null; then warn=$((warn+1)); echo "⚠️ $name $st ${t}s (known-fail — 고치면 known-fail.txt 에서 빼세요)"
  # 실패하면 시험이 찍은 줄 위주로 (Playwright 재시도 기록은 뺌)
  else fail=$((fail+1)); echo "❌ $name $st ${t}s"; printf '%s\n' "$out" | grep -v -E '\[2m|^\s+(- |[0-9]+ × |log: \[|\],?$|.+(waiting for|retrying|scrolling|element is|attempting|locator resolved|intercepts pointer).*$)' | tail -60 | sed 's/^/     /'; fi
done
echo "— shard $idx/$n: $total tests · failed $fail · known-fail $warn"
[ $fail -eq 0 ]
