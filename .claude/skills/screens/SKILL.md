---
name: screens
description: 📸 역할별(관리자 · 오너 · 오피스 · 창고 매니저 · 픽킹 · 세일즈맨 · 디자인) 화면을 폰(430px) · 데스크탑(1440px)으로 찍어 보여준다. 고치기 전 · 후 비교도. 화면 · UX 요청을 받았을 때, 고친 화면을 관리자에게 보여줄 때 쓴다. 시험 자료(test/demo.html)라 실제 고객 자료는 나오지 않는다.
---

# /screens — 역할별 화면 사진

1. 찍기: `node .claude/skills/screens/shot.cjs <나갈 폴더> <화면 해시> [역할,…] [폭,…]`
   - 예: `node .claude/skills/screens/shot.cjs $SCRATCH/after '#/order' office,whmgr,salesman 430,1440`
   - 역할: `admin` `owner` `salesman` 또는 담당자 job(`office` `whmgr` `pick` `catalog` `itemmgr` …) · 기본 admin,office,salesman · 폭 기본 430,1440
   - 해시 다음에 `>선택자` 를 붙이면 그 단추를 누른 뒤 찍는다: `'#/order>[data-hg="pick"]'`
   - 파일: `<역할>-<폭>.png` (deviceScaleFactor 2)
2. **전 · 후 비교**: `git worktree add $SCRATCH/base origin/main` (커밋된 app.js 그대로) → 같은 명령을 `SCREENS_ROOT=$SCRATCH/base` 로 → 끝나면 `git worktree remove $SCRATCH/base`.
3. 보여주기: 관리자에게 보낼 사진만 `SendUserFile` (같은 역할 전 · 후를 나란히, 많으면 4장 이내로 고름). 내가 확인만 할 때는 Read 로 보고 보내지 않는다.
4. 시험 대신이 아니다 — 모양을 확인한 뒤 바뀐 동작은 `test/tNNN.js` 로 지킨다.
