# THE ONE APP — 팀원 온보딩 (Claude Code 로 같이 고치기)

이 저장소는 THE ONE CORP 의 주문 · 수금 · 재고 앱(PWA)입니다. 여러 사람이 각자 Claude Code 세션으로 같은 저장소를 고치고, 관리자가 PR 을 승인해 머지하면 GitHub Pages 로 배포됩니다. **세션을 시작하면 `CLAUDE.md` 가 먼저 읽히고, 그 규칙이 전부입니다.** 이 문서는 처음 한 번 읽는 안내입니다.

## 1. 준비 (처음 한 번)
1. GitHub 에서 저장소 협력자 초대를 수락합니다 (`theonecorp/the-one-app`).
2. claude.ai → Code 에서 클라우드 환경을 만들고 이 저장소를 고릅니다. **팀 공용 환경에는 비밀값을 넣지 않습니다** — 서비스 계정 키(`FIREBASE_*`)는 관리자 개인 환경에만 있고, 키가 없는 세션은 라이브 데이터에 쓰지 않습니다. 시험은 메모리 데이터(`test/seed.js`)로 돌아 라이브 자료가 필요 없습니다.
3. 관리자에게 GitHub 아이디를 알려 주세요 — `.github/CODEOWNERS` 의 담당 영역 줄에 들어가면 그 파일이 바뀌는 PR 에 리뷰 요청이 자동으로 옵니다.

## 2. 내 영역
`CLAUDE.md` 의 「팀 · 담당 영역」 표에서 내 역할의 파일을 확인합니다. 영역 밖 파일을 고쳐야 하면 최소한으로만 고치고 PR 설명 맨 위에 `영역 밖 변경: 파일 — 이유` 를 적습니다. 공용 뼈대(`ui.js` `style.js` `main.js` `db.js` `i18n.js` `sw.js` `index.html` `build.sh` `firestore.rules` `.github/` `tools/`)를 크게 바꾸는 일은 관리자에게 넘깁니다.

## 3. 변경 한 번의 순서 (세션에 이렇게 말하면 됩니다)
1. `sh tools/sync-main.sh` — 최신 main 을 먼저 합칩니다 (버전 · app.js · i18n.json 충돌을 알아서 풀어 줌).
2. `src/` 를 고치고 `sh build.sh` — app.js 를 다시 빌드합니다 (`npx esbuild` 를 직접 쓰지 않음).
3. 새 기능 · 고친 버그마다 **새 시험** `test/tNNN.js`(다음 번호) 를 같이 만들고 `node test/index.js` 로 `test/INDEX.md` 를 갱신합니다. 있던 기능을 바꾸기 전에는 `test/INDEX.md` 에서 그 기능의 시험을 먼저 읽습니다.
4. 새 UI 문구는 `node tools/i18n.js add '한글' 'English' 'Português'` 로 EN · PT 를 넣습니다.
5. 푸시 전 `sh test/run-par.sh` (전체 시험, 약 7분) — 하나라도 ❌ 이면 고칠 때까지 푸시하지 않습니다.
6. 브랜치 → 푸시 → PR. **main 에 직접 푸시하지 않습니다.** 자기 영역 파일만 바뀐 PR 은 GitHub Actions `check` 가 초록이 된 것을 확인한 뒤 직접 squash 머지해도 됩니다. 영역 밖 · 공용 뼈대 · 규칙 · `.github/` · `tools/` 가 바뀌었으면 관리자 승인을 기다립니다. 규칙 · Apps Script 배포가 필요하면 PR 설명에 `배포 필요: …` 를 적습니다.

## 4. 하지 않는 것
- 비밀값(키 · 토큰 · 비밀번호)을 채팅 · 코드 · 커밋에 넣지 않습니다.
- 가져오기 · 일괄 저장에서 문서를 통째로 바꾸지 않습니다 (`merge` · `update` 로 적은 칸만). 사용자(`users`) 문서는 가져오기가 절대 덮어쓰지 않습니다.
- UI 문구에 사람 이름을 쓰지 않습니다. 커밋 · 코드에 모델 이름을 넣지 않습니다.

## 5. 어디에 무엇이 있나 (요약)
`src/main.js` 로그인 · 역할 · 메뉴 · 라우터 · `src/db.js` DB 한 겹 · `src/catalog.js` 아이템 · 분류 · 사진 색인 · `src/items.js` 아이템 화면 · `src/itembulk.js` 일괄 등록 · 삭제 · `src/stock.js` 재고 · `src/ship.js` `src/pickup.js` `src/track.js` UPS · 픽업 · 배송 · `src/orders.js` 주문 · `src/admin.js` 관리 · 가져오기 · `test/` Playwright 시험 (`test/INDEX.md` 기능 등록부). 자세한 것은 `CLAUDE.md`.

---

# THE ONE APP — Integração de novos membros (trabalhar junto com o Claude Code)

Este repositório é o app (PWA) de pedidos · cobrança · estoque da THE ONE CORP. Várias pessoas alteram o mesmo repositório, cada uma na sua própria sessão do Claude Code; o PR passa pelo `check` (GitHub Actions) e, ao ser mesclado em `main`, é publicado automaticamente no GitHub Pages. **Ao iniciar uma sessão, o `CLAUDE.md` é lido primeiro e as regras dele valem para tudo.** Este documento é só a orientação inicial.

## 1. Preparação (uma vez)
1. Aceite o convite de colaborador no GitHub (`theonecorp/the-one-app`). O e-mail joao@theonefl.com precisa estar confirmado na sua conta do GitHub para que os pedidos de revisão (CODEOWNERS) cheguem até você.
2. Em claude.ai → Code, conecte sua conta do GitHub (https://claude.ai/connect-github), crie um ambiente na nuvem e escolha este repositório. **Nunca coloque segredos no ambiente** — a chave de serviço (`FIREBASE_*`) existe só no ambiente pessoal do administrador; uma sessão sem a chave não grava nos dados reais. Os testes rodam com dados em memória (`test/seed.js`), sem precisar dos dados reais.
3. Sua área está na tabela "팀 · 담당 영역" do `CLAUDE.md` (estoque · UPS · retirada · envio · itens · fluxo de expedição: `src/stock.js` `src/ship.js` `src/pickup.js` `src/track.js` `src/items.js` `src/catalog.js` `src/scan.js` `src/fulfill.js` `src/flow.js` `apps-script/UPS.gs`).

## 2. Minha área
Altere arquivos fora da sua área só o mínimo necessário e escreva no topo da descrição do PR `영역 밖 변경: arquivo — motivo`. Mudanças grandes na base comum (`ui.js` `style.js` `main.js` `db.js` `i18n.js` `sw.js` `index.html` `build.sh` `firestore.rules` `.github/` `tools/`) ficam com o administrador.

## 3. Ordem de uma alteração (basta dizer isto à sessão)
1. `sh tools/sync-main.sh` — primeiro traga o `main` mais recente (resolve sozinho os conflitos de versão · app.js · i18n.json).
2. Altere `src/` e rode `sh build.sh` — reconstrói o app.js (não use `npx esbuild` direto).
3. Toda função nova ou bug corrigido vem com **um teste novo** `test/tNNN.js` (próximo número); depois `node test/index.js` atualiza o `test/INDEX.md`. Antes de mudar algo que já existe, leia o teste daquela função no `test/INDEX.md`.
4. Texto novo de interface: `node tools/i18n.js add '한글' 'English' 'Português'` para incluir EN · PT.
5. Antes de enviar: `sh test/run-par.sh` (todos os testes, ~7 min) — com qualquer ❌ não envie até corrigir.
6. Branch → push → PR. **Nunca faça push direto em `main`.** Um PR que só altera arquivos da sua área pode ser mesclado por você (squash) depois que o `check` do GitHub Actions ficar verde. Se mexeu fora da área, na base comum, nas regras, em `.github/` ou `tools/`, espere a aprovação do administrador. Se precisar publicar regras ou Apps Script, escreva `배포 필요: …` na descrição do PR.

## 4. O que não fazer
- Não coloque segredos (chaves · tokens · senhas) no chat, no código ou em commits.
- Importações e gravações em lote não substituem documentos inteiros (use `merge` · `update`, só os campos). Documentos de usuários (`users`) nunca são sobrescritos por importação.
- Não use nomes de pessoas nos textos da interface. Não coloque nomes de modelos em commits ou código.

## 5. Onde está cada coisa (resumo)
`src/main.js` login · papéis · menu · roteador · `src/db.js` camada do banco · `src/catalog.js` itens · categorias · índice de fotos · `src/items.js` tela de itens · `src/itembulk.js` cadastro · exclusão em lote · `src/stock.js` estoque · `src/ship.js` `src/pickup.js` `src/track.js` UPS · retirada · rastreio · `src/orders.js` pedidos · `src/admin.js` administração · importação · `test/` testes Playwright (`test/INDEX.md` é o registro de funções). Detalhes no `CLAUDE.md`.

---
**English (short):** Read `CLAUDE.md` first — it is the rulebook. Work only in your area (see the team table), never put secrets in chat/code, add a test (`test/tNNN.js`) with every change, run `sh tools/sync-main.sh` before you start and `sh test/run-par.sh` before you push, then open a PR. Never push to `main`. A PR that only touches your own area may be squash-merged by you once the `check` workflow is green; anything outside your area waits for the admin.
