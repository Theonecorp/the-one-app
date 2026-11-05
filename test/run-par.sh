#!/bin/sh
# 전체 시험을 CI 처럼 4조각 동시에 (약 6~8분) — 푸시 전에 반드시. 하나라도 ❌ 이면 푸시하지 않는다 (CI 실패 메일이 관리자에게 감)
cd "$(dirname "$0")/.." || exit 2
out=$(mktemp -d); fail=0
for i in 1 2 3 4; do SHARD=$i/4 sh test/run-all.sh > "$out/$i.txt" 2>&1 & done; wait
for i in 1 2 3 4; do tail -1 "$out/$i.txt"; grep -q "failed 0" "$out/$i.txt" || fail=1; done
grep -h -A15 "^❌" "$out"/*.txt
[ $fail -eq 0 ] && echo "✅ 전체 통과 — 푸시해도 됨" || echo "❌ 실패 있음 — 고친 뒤 다시"
exit $fail
