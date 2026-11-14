---
name: live-status
description: 지금 직원들이 쓰는 앱 · 권한 규칙 · 서버 함수가 main 과 같은지 확인 — "배포됐어?" · "지금 몇 버전이야?" · 오류 신고 첫 확인 · 배포 직후 확인에 쓴다. 읽기만 한다.
---

# /live-status — 라이브가 main 과 같은가

1. `git fetch -q origin main` — 비교 기준(이 폴더의 `src/ver.js` · `firestore.rules`)이 main 이어야 뜻이 맞다. 작업 브랜치에 있으면 결과의 "이 폴더" 는 그 브랜치 값이라는 점을 감안한다.
2. `node tools/live-status.mjs` — 서비스 계정(`FIREBASE_*`) 있는 관리자 환경에서만 결과가 나온다 (없으면 SKIP).
3. 결과 읽기:
   - **앱 버전이 다름** → main 이 배포 전이면 관리자 세션은 `/merge-deploy` 4단계 · 다른 세션은 "배포 필요" 보고.
   - **권한 규칙이 다름** → main 의 규칙이 반영 안 됨. 반영(`node tools/deploy-rules.js`)은 관리자에게 먼저 묻는다.
   - **서버 함수 배포 안 됨 · ACTIVE 아님** → `functions/README.md` 의 배포 순서 · 실패 메시지를 보고.
4. 직원 폰은 앱을 **다시 열 때까지 옛 버전**이다. 배포가 맞는데 직원 화면이 옛 모습이면 앱을 완전히 닫았다 다시 열도록 안내.
5. 보고: 세 줄(앱 · 규칙 · 함수) + 할 일.
