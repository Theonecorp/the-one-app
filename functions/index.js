/* ============================================================
 *  Firebase Cloud Functions — 옛 WMS 의 Supabase Edge Function "ler-etiqueta" 자리
 *    lerEtiqueta (콜러블, us-central1): 📥 상품 받기의 "사진으로 라벨 읽기" — 상자 라벨 사진 → 코드 · 수량
 *    키는 Secret Manager 의 ANTHROPIC_API_KEY (관리자가 firebase-tools 로 한 번 넣음 · functions/README.md) — 코드 · 저장소 · 앱에는 없음
 *    모델은 환경 변수 ANTHROPIC_MODELO 로 바꿀 수 있음 (없으면 core.js 의 기본값)
 *    로직은 전부 core.js (시험 test/t221.js) — 여기서는 SDK · Firestore · HttpsError 를 넣어 줄 뿐
 * ============================================================ */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { lerEtiquetaCore, MODELO_PADRAO } from './core.js';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
initializeApp();

/** 옛 함수가 돌려받던 JSON 모양 그대로 — {itens:[{codigo,quantidade,confianca}],observacao} */
const Leitura = z.object({
  itens: z.array(z.object({
    codigo: z.string(),
    quantidade: z.number().nullable(),
    confianca: z.enum(['alta', 'media', 'baixa']),
  })),
  observacao: z.string(),
});
const FORMATO = zodOutputFormat(Leitura);
const ERROS = {
  AnthropicError: Anthropic.AnthropicError,
  APIError: Anthropic.APIError,
  AuthenticationError: Anthropic.AuthenticationError,
  PermissionDeniedError: Anthropic.PermissionDeniedError,
  RateLimitError: Anthropic.RateLimitError,
  BadRequestError: Anthropic.BadRequestError,
  APIConnectionError: Anthropic.APIConnectionError,
};

export const lerEtiqueta = onCall({ secrets: [ANTHROPIC_API_KEY], region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 5 }, async request => {
  let chave = '';
  try { chave = ANTHROPIC_API_KEY.value() || ''; } catch (e) { chave = ''; }
  const anthropic = chave ? new Anthropic({ apiKey: chave }) : null;
  return lerEtiquetaCore({ auth: request.auth, data: request.data }, {
    db: getFirestore(),
    anthropic,
    now: () => new Date(),
    cfg: { chave: !!chave, modelo: process.env.ANTHROPIC_MODELO || MODELO_PADRAO },
    formato: FORMATO,
    erros: ERROS,
    HttpsError,
  });
});
