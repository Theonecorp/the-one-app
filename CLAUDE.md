# THE ONE APP — 작업 규칙 (모든 세션이 먼저 읽는 파일)

THE ONE CORP 의 주문 · 수금 · 재고 PWA. 소스는 `src/`, 빌드 결과물 `app.js` 를 함께 커밋해 GitHub Pages(main) 로 배포됩니다.
Firebase 프로젝트 `the-one-app-ff40e` (Firestore 규칙 `firestore.rules`). 보고 · 커밋 설명은 한국어, UI 문구는 KO/EN/PT (`i18n.json`).

## 절대 지킬 것
- **있던 기능을 없애거나 바꾸기 전에 `test/INDEX.md` 에서 그 기능의 시험을 찾아 읽는다.** 기능마다 시험이 있고, 시험이 기능의 명세다. 요약만 보고 다시 짜지 않는다.
- 새 기능 · 고친 버그는 **새 시험(다음 번호 `test/tNNN.js`)과 함께** 들어온다. 시험 첫 줄은 `/* vX.Y.Z 시험 — 무엇을 지키는지 */`. 만든 뒤 `node test/index.js` 로 `test/INDEX.md` 갱신.
- 가져오기 · 일괄 저장은 **문서를 통째로 바꾸지 않는다**: 이미 있는 문서는 `op: 'merge'`(DB.batch) 또는 `DB.update` 로 적은 칸만 바꾼다. 사용자(`users`) 문서는 가져오기가 절대 덮어쓰지 않는다 (관리자 역할이 지워졌던 사고: v0.8.158).
- 비밀값(키 · 토큰 · 비밀번호)은 채팅 · 코드 · 커밋에 넣지 않는다. 서비스 계정 키는 클라우드 환경 변수(`FIREBASE_*`), 챗 웹훅은 Apps Script 스크립트 속성에만.
- UI 문구에 사람 이름을 쓰지 않는다 (관리자 · 담당자 · 회계 담당 · 세일즈맨). 커밋 · 코드에 모델 이름을 넣지 않는다.
- main 에 직접 푸시하지 않는다. 브랜치 → PR → `check` 워크플로 초록 → squash 머지.

## 변경 한 번의 순서
1. `git fetch origin main && git merge origin/main` — **먼저 최신 main 을 합친다** (다른 세션의 변경을 잃지 않기 위해).
2. `src/` 수정 → `sh build.sh` (app.js 다시 빌드. src 를 고쳤으면 반드시).
3. 버전 세 곳을 같이 올린다: `src/main.js` 의 `VER`, `index.html` 의 `app.js?v=`, `sw.js` 의 `CACHE` 이름(`theone-shell-vNNN`). 하나라도 빠지면 폰이 옛 앱을 계속 쓴다.
4. 새 UI 문구가 있으면 `i18n.json` 에 EN · PT 를 넣는다.
5. 시험: 새 시험 + 관련 시험 `node test/tNNN.js`. 전부는 `sh test/run-all.sh` (약 40분, CI 는 4조각 병렬).
6. 커밋 → 푸시 → PR → GitHub Actions `check` 가 ① app.js 가 src 와 같은지 ② 버전 세 곳 ③ 시험 전부를 확인 → 머지.
7. **머지 뒤 main 을 다시 받아 `sh build.sh` 를 한 번 더** — 두 브랜치의 src 가 합쳐졌으면 app.js 도 다시 빌드돼야 한다 (충돌을 한쪽으로 풀면 상대 기능이 빠진 app.js 가 배포되는 사고의 원인).

## 되돌리기
- 어느 버전으로든: `git log --oneline` 에서 `vX.Y.Z` 커밋을 찾아 `git revert` (버전 세 곳은 다시 올림). 데이터는 매일 새벽 2시 드라이브 "THE ONE 백업" (30일 + 월 1일 12달, `apps-script/Backup.gs`).

## 어디에 무엇이 있나
- `src/main.js` 로그인 · 역할(관리자 `ADMIN_EMAILS` · 오너 · 담당자 job · 세일즈맨) · 서랍 메뉴 · 모드 바꾸기 · 라우터
- `src/db.js` Firestore/메모리 DB 한 겹 (`DB.get/list/set/update/del/batch`, 시험은 `window.__MOCK__` 메모리) · `src/catalog.js` 아이템 · 분류 · 사진 색인 · `src/orders.js` 주문 · `src/admin.js` 관리 · 가져오기 · `src/mgr.js` 담당자 · `src/store.js` 가게 창
- `firestore.rules` 권한 (배포는 Firebase 콘솔 또는 규칙 API) · `apps-script/` 메일 · 사진 색인 · 백업 · UPS
- `data/photo-index.json` 드라이브 사진 색인(앱 바탕) — `SharePhotos.gs` 가 이 파일의 사진을 링크 공개로 바꿈
- `test/` Playwright 시험 (`test/demo.html` + `test/seed.js` 메모리 데이터로 로그인 없이 돈다) · `test/INDEX.md` 기능 등록부
