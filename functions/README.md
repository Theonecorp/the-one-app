# functions/ — Firebase Cloud Functions

📥 상품 받기(#/recebimento) 의 **「사진으로 라벨 읽기」** 가 부르는 서버 함수 `lerEtiqueta` 입니다.
옛 WMS(Supabase Edge Function `ler-etiqueta`) 를 그대로 옮겼습니다: 상자 라벨 사진 → 상품 코드 · 수량 · 확신.

- `index.js` — 함수 등록 (콜러블 · `us-central1` · 256MiB · 60초 · 최대 5개). 비밀값은 Secret Manager 의 `ANTHROPIC_API_KEY`.
- `core.js` — 로직 전부 (로그인 확인 · 하루 한도 · 사진 검사 · 읽기 · 정리 · 사용 기록). 시험은 `node test/t221.js` (이 폴더의 node_modules 없이 돔).
- 앱 쪽은 `src/iaetq.js` (단추 · 결과 창 · 트래킹 창 · 받은 줄 만들기) 와 `src/db.js` 의 `callFn()`.

**배포 전에는 앱에서 단추를 눌러도 "아직 켜지지 않았습니다" 문구만 나옵니다.** 아래 1~5 가 모두 끝나야 실제로 읽습니다.

## 관리자가 한 번만 하는 일

비밀값(키)은 **채팅 · 코드 · 커밋에 절대 넣지 않습니다.** 아래 3 번에서 터미널이 물을 때 관리자가 직접 붙여 넣습니다.

1. **Blaze 요금제** — Firebase 콘솔 › 프로젝트 `the-one-app-ff40e` › 사용량 및 결제 › 요금제를 Blaze 로. (Cloud Functions 와 Secret Manager 는 Blaze 에서만 됩니다. 결제 알림(예산)을 같이 걸어 두기를 권합니다.)
2. **로그인** — 저장소 폴더에서
   ```sh
   npx firebase-tools login
   ```
3. **키 넣기** — Anthropic 콘솔에서 만든 키를 물을 때 붙여 넣습니다 (화면에 보이지 않음 · Secret Manager 에만 저장).
   ```sh
   npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY --project the-one-app-ff40e
   ```
4. **올리기**
   ```sh
   (cd functions && npm ci)
   npx firebase-tools deploy --only functions:lerEtiqueta --project the-one-app-ff40e
   ```
   처음 올릴 때 Cloud Functions · Cloud Build · Artifact Registry · Secret Manager API 를 켜도 되냐고 물으면 "예".
5. **권한 규칙** — 이 브랜치의 `firestore.rules` (iaUso: 관리자 · 오너만 읽기, 아무도 쓰기 못함) 를 `node tools/deploy-rules.js` 로 반영.
6. 앱 배포 (`node tools/fbhost.mjs . apply`) — 새 app.js 와 index.html(CSP 에 `https://us-central1-the-one-app-ff40e.cloudfunctions.net` 추가) 가 올라가야 단추가 생깁니다.

키를 바꿀 때는 3 번을 다시 하고 4 번(올리기)을 다시 합니다.

## 하루 한도

사람마다 하루(UTC 날짜) 300 번이 기본입니다. 바꾸려면 Firestore `settings/app` 문서에 숫자 칸 `iaLimiteDia` 를 넣습니다 (예: `500`). 한도에 닿으면 앱에 "오늘 읽기 한도에 도달했습니다" 가 나옵니다.

## 사용량 · 비용 보기

함수가 부를 때마다 Firestore `iaUso` 에 한 줄씩 씁니다 (관리자 · 오너만 읽음):

| 칸 | 뜻 |
|---|---|
| `email` · `dia` · `recurso` | 누가 · 어느 날(UTC `YYYY-MM-DD`) · `ler-etiqueta` |
| `at` | 시각 (ISO) |
| `tokensIn` · `tokensOut` | 보낸 · 받은 토큰 수 |
| `custoUsd` | 추정 비용 (US$, `core.js` 의 `PRECO` 표로 계산 — 실제 청구는 Anthropic 콘솔) |
| `itensLidos` | 읽어 낸 줄 수 |
| `erro` | 없으면 `null` · 아무것도 못 읽었으면 `nada_lido` · 실패면 옛 코드(`chave_invalida` · `sem_credito` · `muitas_chamadas` · `falha_rede` · `falha_api`) |
| `modelo` | 쓴 모델 |

Firebase 콘솔 › Firestore › `iaUso` 에서 `dia` 로 걸러 보면 됩니다. 실제 청구 금액은 Anthropic 콘솔 › Usage.
함수 로그(실패 원인)는 `npx firebase-tools functions:log --only lerEtiqueta --project the-one-app-ff40e`.

## 모델 바꾸기

기본 모델은 `core.js` 의 `MODELO_PADRAO` 입니다. 코드를 고치지 않고 바꾸려면 `functions/.env` 에 한 줄 넣고 4 번(올리기)을 다시 합니다:

```
ANTHROPIC_MODELO=claude-sonnet-5-5
```

비용 추정이 맞으려면 그 모델이 `core.js` 의 `PRECO` 표에 있어야 합니다 (없으면 기본 모델 가격으로 계산).

## 오류 코드 (앱 문구와 짝)

`sem_chave`(키 없음) · `sem_login` · `sem_permissao`(비활성 사용자) · `limite_diario` · `sem_imagem` · `imagem_grande`(5MB 넘음) · `formato_invalido` · `falha_rede` · `chave_invalida` · `sem_credito` · `muitas_chamadas` · `falha_api`.
콜러블 오류의 `details.erro` 에 들어 있고, 앱은 옛 WMS 와 같은 문구로 보여 줍니다.
