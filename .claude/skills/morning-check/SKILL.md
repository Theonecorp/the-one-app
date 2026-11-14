---
name: morning-check
description: 🌅 아침 점검 — 매일 새벽 5시(플로리다) 예약 작업이 부르고, 관리자가 "점검해줘" 할 때도 쓴다. 라이브가 main 과 같은지 · 열린 PR 과 빨간 check · 하루 넘게 밀린 주문 · 백업 · 할 일 장부를 읽기만 해서 한 화면으로 보고한다. 아무것도 고치지 않는다.
---

# /morning-check — 아침 점검 (읽기만)

**고치지 않는다.** 머지 · 배포 · 자료 수정 · 댓글 · 메시지 보내기 모두 하지 않는다. 볼 것이 있으면 보고에 "관리자가 할 일" 로만 적는다.

1. 저장소가 없으면 `git clone` 후 그 폴더에서. `git fetch -q origin main && git checkout -q -B main origin/main` (비교 기준을 main 으로).
2. `node tools/live-status.mjs` — 앱 · 권한 규칙 · 서버 함수가 main 과 같은지.
3. `node .claude/skills/morning-check/morning.mjs` — 하루 넘게 밀린 주문 · 마지막 백업 · inbound 오류.
4. 열린 PR: `gh api 'repos/Theonecorp/the-one-app/pulls?state=open' --jq '.[] | "\(.number) \(.draft) \(.user.login) \(.title) \(.head.sha)"'` → PR 마다
   `gh api repos/Theonecorp/the-one-app/commits/SHA/check-runs --jq '.check_runs[] | "\(.name) \(.conclusion)"'` 로 빨간 check · 3일 넘게 열린 PR 표시.
5. `ops/TODO.md` 의 **⏳ 관리자 결정 대기** · **🔧 저장소 밖 반영 필요** 칸을 그대로 옮겨 적는다 (오래된 것 먼저).
6. 보고 — 10줄 안팎, 한국어:
   ```
   🌅 THE ONE 아침 점검 (날짜)
   ✅/⚠️ 라이브: 앱 vX · 규칙 · 함수
   ✅/⚠️ 주문: 밀린 N건 (단계별) · 가장 오래된 것
   ✅/⚠️ 백업: 시각 · 문서 수
   ✅/⚠️ PR: 열린 N개 · 빨간 check #N · 오래된 #N
   📋 관리자 할 일: (TODO 장부에서 3~5개)
   ```
   전부 ✅ 면 한 줄 "✅ 이상 없음 · 관리자 할 일 N개".

예약 작업: 매일 04:53 (America/New_York) 새 세션 · 폰 알림. 바꾸려면 관리자 세션에서 "아침 점검 시간 바꿔줘".
