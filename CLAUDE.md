# THE ONE APP — 작업 규칙 (모든 세션이 먼저 읽는 파일)

THE ONE CORP 의 주문 · 수금 · 재고 PWA. 소스는 `src/`, 빌드 결과물 `app.js` 를 함께 커밋해 GitHub Pages(main) 로 배포됩니다.
Firebase 프로젝트 `the-one-app-ff40e` (Firestore 규칙 `firestore.rules`). 보고 · 커밋 설명은 한국어, UI 문구는 KO/EN/PT (`i18n.json`).

## 절대 지킬 것
- **있던 기능을 없애거나 바꾸기 전에 `test/INDEX.md` 에서 그 기능의 시험을 찾아 읽는다.** 기능마다 시험이 있고, 시험이 기능의 명세다. 요약만 보고 다시 짜지 않는다.
- 새 기능 · 고친 버그는 **새 시험(다음 번호 `test/tNNN.js`)과 함께** 들어온다. 시험 첫 줄은 `/* vX.Y.Z 시험 — 무엇을 지키는지 */`. 만든 뒤 `node test/index.js` 로 `test/INDEX.md` 갱신.
- 가져오기 · 일괄 저장은 **문서를 통째로 바꾸지 않는다**: 이미 있는 문서는 `op: 'merge'`(DB.batch) 또는 `DB.update` 로 적은 칸만 바꾼다. 사용자(`users`) 문서는 가져오기가 절대 덮어쓰지 않는다 (관리자 역할이 지워졌던 사고: v0.8.158).
- 비밀값(키 · 토큰 · 비밀번호)은 채팅 · 코드 · 커밋에 넣지 않는다. 서비스 계정 키는 클라우드 환경 변수(`FIREBASE_*`), 챗 웹훅은 Apps Script 스크립트 속성에만.
- UI 문구에 사람 이름을 쓰지 않는다 (관리자 · 담당자 · 회계 담당 · 세일즈맨). 커밋 · 코드에 모델 이름을 넣지 않는다.
- main 에 직접 푸시하지 않는다. 브랜치 → PR → `check` 워크플로 초록 → squash 머지. **`check` 가 빨간 PR 은 누구도 머지하지 않는다** (앱이 깨진 채 전 직원 폰에 배포됨).

## 팀 · 담당 영역 (관리자 · 디자인 담당 · 창고 매니저)
여러 사람이 각자 Claude 세션으로 같은 저장소를 고친다. 요청한 사람의 역할을 먼저 확인하고 그 영역 안에서 고친다.

| 역할 | 영역 | 주 파일 |
|---|---|---|
| 관리자 | 전체 · 공용 뼈대 · 배포 · 데이터 | 전부. 특히 `ui.js` `style.js` `main.js` `db.js` `i18n.js` `sw.js` `index.html` `build.sh` `firestore.rules` `.github/` `tools/` |
| 디자인 담당 | 사진 · 라벨 · 카탈로그 화면 · 분류 일괄 변경 | `src/photos.js` `src/labels.js` `src/catpage.js` `src/lvtool.js` `apps-script/SharePhotos.gs` `data/photo-index.json` |
| 창고 매니저 | 재고 · UPS · 픽업 · 배송 · 아이템 · 출고 흐름 | `src/stock.js` `src/ship.js` `src/pickup.js` `src/track.js` `src/items.js` `src/catalog.js` `src/scan.js` `src/fulfill.js` `src/flow.js` `apps-script/UPS.gs` |

- 담당은 `.github/CODEOWNERS` 와 같다 — 그 파일이 바뀌는 PR 에는 담당자에게 리뷰 요청이 자동으로 간다. 관리자는 모든 파일의 담당(최종 승인).
- **영역 밖 파일**을 고쳐야 하면 최소한으로만 고치고 PR 설명 맨 위에 `영역 밖 변경: 파일 — 이유` 를 적는다. 공용 뼈대(위 표의 관리자 파일)를 크게 바꾸는 일은 관리자에게 넘긴다.
- **머지**: 자기 영역 파일만 바뀐 PR 은 `check` 초록을 확인한 뒤 담당자가 직접 squash 머지해도 된다 (2026-11-06 부터 — main 보호 규칙은 PR 필수 · check 통과 필수, 승인은 없음). 영역 밖 파일 · 공용 뼈대 · `firestore.rules` · `.github/` · `tools/` 가 바뀐 PR 은 관리자 승인 뒤에 머지한다. 머지 뒤 main 을 다시 받아 `sh build.sh` 로 app.js 가 같은지 확인한다.
- **저장소 밖 반영은 관리자만**: `firestore.rules` 배포, `apps-script/*` 를 Apps Script 에 붙여 넣고 배포, 라이브 Firestore 데이터 일괄 수정. 서비스 계정 키(`FIREBASE_*`)는 관리자 개인 클라우드 환경에만 있다. 다른 담당의 PR 은 설명에 `배포 필요: …` 로 적고 관리자가 반영한다.
- **팀 공용 클라우드 환경에는 비밀값을 넣지 않는다** — 공용 환경의 변수는 모든 멤버의 세션이 읽는다. `FIREBASE_*` 가 없는 세션은 라이브 Firestore 에 쓰지 않는다.
- **동시 작업**: 같은 날 여러 PR 이 열린다. 푸시 전마다 `sh tools/sync-main.sh` (최신 main 합치기 · 버전을 main 다음 번호로 · app.js 다시 빌드 · 번역 문구 합치기). PR 이 머지되기 전에 main 이 또 움직였으면 다시 실행.

## 변경 한 번의 순서
1. `sh tools/sync-main.sh` — **먼저 최신 main 을 합친다** (다른 세션의 변경을 잃지 않기 위해). 버전 세 곳 · app.js · i18n.json 은 이 스크립트가 충돌 없이 처리하고, 남는 충돌은 진짜 src 충돌뿐이다.
2. `src/` 수정 → `sh build.sh` (app.js 다시 빌드. src 를 고쳤으면 반드시). build.sh 는 package-lock 에 고정된 esbuild(node_modules)만 쓴다 — `npx esbuild` 를 직접 부르지 않는다 (버전이 다르면 app.js 가 통째로 달라져 CI 가 막는다).
3. 버전 세 곳을 같이 올린다: `src/main.js` 의 `VER`, `index.html` 의 `app.js?v=`, `sw.js` 의 `CACHE` 이름(`theone-shell-vNNN`). 하나라도 빠지면 폰이 옛 앱을 계속 쓴다. 손으로 고치지 말고 `node tools/version.js bump origin/main` (main 다음 번호) — `sh tools/sync-main.sh` 도 src 가 바뀐 브랜치면 알아서 올린다.
4. 새 UI 문구가 있으면 `i18n.json` 에 EN · PT 를 넣는다: `node tools/i18n.js add '한글' 'English' 'Português'` 또는 i18n.json 에 한 줄 추가. i18n.json 은 **한 줄에 한 문구 · 정렬** 형식이고 `sh build.sh` 가 매번 정리한다 (CI 가 형식을 확인).
5. 시험: 새 시험 + 관련 시험 `node test/tNNN.js`. **푸시 전에는 반드시 `sh test/run-par.sh`(전체 시험 4조각 동시, 약 7분)로 전부 통과를 확인한다.** 하나라도 ❌ 이면 고칠 때까지 푸시하지 않는다 — PR 의 CI 실패는 관리자에게 메일로 간다. 화면을 바꿨으면 그 화면을 쓰는 옛 시험도 같이 고친다.
6. 커밋 → 푸시 → PR → GitHub Actions `check` 가 ① app.js 가 src 와 같은지 ② 버전 세 곳 ③ 시험 전부를 확인 → 머지.
7. **머지 뒤 main 을 다시 받아 `sh build.sh` 를 한 번 더** — 두 브랜치의 src 가 합쳐졌으면 app.js 도 다시 빌드돼야 한다 (충돌을 한쪽으로 풀면 상대 기능이 빠진 app.js 가 배포되는 사고의 원인).

## GitHub 이 막혔을 때 (2026-11 계정 정지 때 겪은 일)
- 앱 배포는 Firebase Hosting(https://app.theonefl.com · `node tools/fbhost.mjs . apply` · 서비스 계정 `FIREBASE_*` 가 있는 관리자 환경에서만) 이라 GitHub 과 무관하게 올릴 수 있다. GitHub Pages 는 예비.
- 코드 거울: GitLab https://gitlab.com/theonecorp-group/the-one-app — `sh tools/mirror.sh` 로 푸시 (환경 변수 `GITLAB_TOKEN`). GitHub 이 돌아오면 그대로 origin 에 푸시 → PR → check → 머지.
- 세션이 끝나기 전에 `git bundle create … --all` 로 번들을 남겨 두면 커밋을 잃지 않는다.

## 되돌리기
- 어느 버전으로든: `git log --oneline` 에서 `vX.Y.Z` 커밋을 찾아 `git revert` (버전 세 곳은 다시 올림). 데이터는 매일 새벽 2시 드라이브 "THE ONE 백업" (30일 + 월 1일 12달, `apps-script/Backup.gs`).

## 어디에 무엇이 있나
- `src/main.js` 로그인 · 역할(관리자 `ADMIN_EMAILS` · 오너 · 담당자 job · 세일즈맨) · 서랍 메뉴 · 모드 바꾸기 · 라우터
- `src/db.js` Firestore/메모리 DB 한 겹 (`DB.get/list/set/update/del/batch`, 시험은 `window.__MOCK__` 메모리) · `src/catalog.js` 아이템 · 분류 · 사진 색인 · `src/orders.js` 주문 · `src/admin.js` 관리 · 가져오기 · `src/mgr.js` 담당자 · `src/store.js` 가게 창
- `firestore.rules` 권한 — 배포는 `node tools/deploy-rules.js` (서비스 계정 `FIREBASE_SERVICE_ACCOUNT` 또는 `FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY` 가 있는 관리자 환경에서 · `--check` 는 문법만) 또는 Firebase 콘솔 · `apps-script/` 메일 · 사진 색인 · 백업 · UPS
- `data/photo-index.json` 드라이브 사진 색인(앱 바탕) — `SharePhotos.gs` 가 이 파일과 Firestore `catalog/photoIndex`(Code.gs 가 한 시간마다 item_picture 를 훑어 씀)의 사진을 링크 공개로 바꿈
- `test/` Playwright 시험 (`test/demo.html` + `test/seed.js` 메모리 데이터로 로그인 없이 돈다) · `test/INDEX.md` 기능 등록부
