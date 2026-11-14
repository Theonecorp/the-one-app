---
name: merge-deploy
description: 관리자가 "머지" · "배포" · "머지하고 배포" 라고 했을 때 — 열린 PR 을 오래된 것부터 검토 · squash 머지하고 main 을 배포한 뒤 라이브가 main 과 같은지 확인한다 (CLAUDE.md 「머지 · 배포 위임」).
---

# /merge-deploy — 머지 · 배포 위임 (2026-11-12 관리자 결정)

다시 묻지 않고 판단해서 한다. 단 아래 "멈춤" 에 걸리면 머지하지 않고 이유를 보고한다.

## 1. 대상
관리자가 가리킨 PR, 없으면 열린 PR 전부(초안 제외) · 오래된 것부터.

## 2. PR 마다 검토 (모두 맞아야 머지)
1. 머리 커밋의 `check` 5개 전부 초록 · mergeable. **빨간 check 는 절대 머지 안 함.**
2. diff 를 읽는다:
   - 비밀값(키 · 토큰 · 비밀번호) · UI 의 사람 이름 · 모델 이름이 없다.
   - 있던 기능을 바꿨으면 그 기능 시험(`test/INDEX.md`)도 맞게 고쳐졌다 · 새 기능 · 고친 버그에는 새 시험이 있다.
   - 가져오기 · 일괄 저장이 문서를 통째로 덮어쓰지 않는다 (`users` 는 절대).
3. PR 브랜치를 받아 `node tools/impact.mjs origin/main` — **⚠️ 먼저 볼 것** 이 PR 안에서 처리됐는지 본다:
   통째 덮어쓰기 경고에 대한 대책 · 📱 폰 저장 자료의 옛 모양 시험 · 규칙이 바뀌었으면 옛 앱 쓰기도 받는 rules-test 케이스.
   처리 안 됐으면 머지하지 않고 PR 에 무엇이 빠졌는지 보고 (댓글은 관리자가 원할 때만).
4. **멈춤 — 머지하지 않고 관리자에게 묻는다**: 권한을 넓힘(규칙 allow 확대 · 관리자 판별 변경) · 배포나 CI 를 끔 · 데이터를 지움.
   `firestore.rules` · `.github/` · `tools/` · 영역 밖 · 공용 뼈대 변경은 특히 꼼꼼히.

## 3. 머지
`gh api -X PUT repos/Theonecorp/the-one-app/pulls/N/merge -f merge_method=squash`.
여러 PR 이면 하나 머지할 때마다 다음 PR 을 `sh tools/sync-main.sh` 로 다시 맞추고 check 초록을 기다린 뒤 머지 (버전 · app.js 충돌 방지).

## 4. 배포
1. `git fetch origin main && git checkout -B main origin/main && sh build.sh` → `git status` 가 깨끗해야 함 (app.js 가 src 와 같음).
2. `node tools/fbhost.mjs . apply` (`FIREBASE_*` 없는 세션은 머지까지만 · "배포 필요" 를 남김).
3. `firestore.rules` 가 바뀌었으면 `node tools/deploy-rules.js` · `functions/` 가 바뀌었으면 함수 배포 (`functions/README.md`) · `apps-script/*` 는 "Apps Script 반영 필요: 파일 · 할 일".
4. `node tools/live-status.mjs` — 앱 · 규칙 · 함수가 전부 main 과 같은지.

## 5. 보고 (짧게)
머지한 PR · 건너뛴 PR(이유) · 배포한 버전 · 라이브 상태 · 남은 할 일 · 직원이 할 일(앱 다시 열기 등).
