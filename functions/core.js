/* ============================================================
 *  📷 사진으로 라벨 읽기 — 옛 WMS 의 Supabase Edge Function "ler-etiqueta" 를 Firebase 로 옮긴 순수 로직
 *    이 파일은 아무 패키지도 가져오지 않는다 (SDK · Firebase 는 index.js 가 deps 로 넣어 줌) → test/t242.js 가 functions/node_modules 없이 돈다
 *    lerEtiquetaCore({ auth, data }, { db, anthropic, now, cfg, HttpsError, erros, formato })
 *      auth  = 콜러블 request.auth ({ uid, token }) · data = { imagem(base64), mime }
 *      db    = firebase-admin Firestore (collection/doc/get/where/count/add 만 씀)
 *      anthropic = Anthropic 클라이언트 (키가 없으면 null) · formato = zodOutputFormat(스키마)
 *      cfg   = { chave(있는지만 봄), modelo } · erros = SDK 오류 클래스들 · now() = Date
 *    순서는 옛 함수와 같음: 키 → 로그인 → 활성 사용자 → 하루 한도 → 사진 → AI 읽기 → 정리 → 사용 기록(iaUso) → 결과
 *    오류는 HttpsError(상태, 글, { erro: '<옛 코드>', ... }) — 앱은 details.erro 로 옛 문구를 고름
 * ============================================================ */

/** 옛 함수의 시스템 지시 — 글자 하나 바꾸지 않음 */
export const INSTRUCAO = `Voce le etiquetas de caixas de um estoque de joias.

Na foto pode haver uma etiqueta ou varias. Para cada etiqueta que aparecer, extraia:
- "codigo": o codigo do produto (ex.: CWRS03, HXR 01 L, PIXG15, TNG02). Copie exatamente como esta impresso, incluindo letras finais de tamanho como L ou S.
- "quantidade": o numero de pecas daquela caixa. Costuma vir perto de QTY, QTD, PCS, PECAS ou UNITS.
- "confianca": "alta" quando o texto esta nitido e sem duvida, "media" quando da para ler mas ha risco, "baixa" quando esta borrado, cortado ou ambiguo.

Regras:
- Nunca invente. Se nao conseguir ler o codigo, use "" no campo. Se nao achar a quantidade, use null.
- Nao confunda o codigo do produto com codigo de rastreio (rastreio e longo, comeca com 1Z ou tem muitos digitos seguidos).
- Se o mesmo codigo aparecer duas vezes na mesma etiqueta, devolva uma linha so.
- Responda somente com o JSON, sem texto antes ou depois.

Formato:
{"itens":[{"codigo":"CWRS03","quantidade":250,"confianca":"alta"}],"observacao":""}

Use "observacao" apenas se algo atrapalhou a leitura (foto escura, cortada, etiqueta amassada). Deixe "" quando estiver tudo certo.`;

export const TEXTO_USUARIO = 'Leia esta etiqueta e devolva o JSON.';
export const RECURSO = 'ler-etiqueta';
export const MODELO_PADRAO = 'claude-haiku-5-5';
export const LIMITE_PADRAO = 300;
export const MAX_BYTES = 5 * 1024 * 1024;   // base64 — o site ja manda a foto comprimida (1568 px, JPEG .78)
export const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** firestore.rules isAdminEmail() — o mesmo endereco fixo */
export const ADMIN_EMAIL = 'luke@theonefl.com';
/** preco por milhao de tokens (prompts ate 100K), so para registrar o gasto estimado — como o PRECO do codigo antigo */
export const PRECO = {
  'claude-haiku-5-5': { in: 0.10, out: 0.50 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
};

/** 옛 오류 코드 → 콜러블 상태 */
const STATUS = {
  sem_chave: 'failed-precondition',
  sem_login: 'unauthenticated',
  sem_permissao: 'permission-denied',
  limite_diario: 'resource-exhausted',
  sem_imagem: 'invalid-argument',
  imagem_grande: 'invalid-argument',
  formato_invalido: 'invalid-argument',
  falha_rede: 'unavailable',
  chave_invalida: 'internal',
  sem_credito: 'resource-exhausted',
  muitas_chamadas: 'resource-exhausted',
  falha_api: 'internal',
};

/** HttpsError 가 안 들어왔을 때(시험) 같은 모양 */
class ErroLocal extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; this.name = 'HttpsError'; }
}

export function custoDe(modelo, tin, tout) {
  const p = PRECO[modelo] || PRECO[MODELO_PADRAO];
  return (tin / 1e6) * p.in + (tout / 1e6) * p.out;
}

/** 옛 정리 그대로: 코드 trim · 대문자 · 40자 · 수량 양의 정수 아니면 null · 확신 alta|media|baixa (그 밖은 media) · 코드도 수량도 없는 줄은 버림 */
export function normalizar(lido) {
  if (!lido || !Array.isArray(lido.itens)) return [];
  return lido.itens.map(i => {
    const q = Number(i && i.quantidade);
    const c = String(i && i.confianca);
    return {
      codigo: String((i && i.codigo) == null ? '' : i.codigo).trim().toUpperCase().slice(0, 40),
      quantidade: i && i.quantidade != null && i.quantidade !== '' && Number.isFinite(q) && q > 0 ? Math.round(q) : null,
      confianca: ['alta', 'media', 'baixa'].includes(c) ? c : 'media',
    };
  }).filter(i => i.codigo || i.quantidade);
}

/** firestore.rules signedIn() — Google 로그인 · 이메일 확인 */
function emailDe(auth) {
  const tk = auth && auth.token;
  if (!tk || !tk.email || tk.email_verified !== true) return '';
  if (tk.firebase && tk.firebase.sign_in_provider && tk.firebase.sign_in_provider !== 'google.com') return '';
  return String(tk.email).toLowerCase();
}

/** SDK 오류 → 옛 코드 (구체적인 것부터) */
export function codigoDoErro(e, erros) {
  const E = erros || {};
  const eh = C => typeof C === 'function' && e instanceof C;
  if (eh(E.AuthenticationError) || eh(E.PermissionDeniedError)) return 'chave_invalida';
  if (eh(E.RateLimitError)) return 'muitas_chamadas';
  if (eh(E.BadRequestError) && /credit|balance/i.test(String(e && e.message || ''))) return 'sem_credito';
  if (eh(E.APIConnectionError)) return 'falha_rede';
  return 'falha_api';
}

export async function lerEtiquetaCore(req, deps) {
  const { db, anthropic, cfg = {}, formato = null, erros = {} } = deps;
  const now = deps.now || (() => new Date());
  const HttpsError = deps.HttpsError || ErroLocal;
  const falha = (erro, extra) => new HttpsError(STATUS[erro] || 'internal', erro, Object.assign({ erro }, extra || {}));
  const modelo = cfg.modelo || MODELO_PADRAO;

  // 0. a chave mora no Secret Manager (ANTHROPIC_API_KEY), nunca no navegador
  if (!cfg.chave || !anthropic) throw falha('sem_chave');

  // 1. so usuario de verdade, logado e ativo, pode gastar credito (= registered() do firestore.rules)
  const auth = req && req.auth;
  const email = emailDe(auth);
  if (!email) throw falha('sem_login');
  if (email !== ADMIN_EMAIL) {
    const u = await db.collection('users').doc(email).get();
    if (!u.exists || (u.data() || {}).active === false) throw falha('sem_permissao');
  }

  // 2. teto diario por usuario (dia em UTC, como o codigo antigo)
  let limite = LIMITE_PADRAO;
  try {
    const s = await db.collection('settings').doc('app').get();
    const v = s.exists ? Number((s.data() || {}).iaLimiteDia) : NaN;
    if (Number.isFinite(v) && v >= 0) limite = v;
  } catch (e) { /* sem config: padrao */ }
  const agora = now();
  const dia = agora.toISOString().slice(0, 10);
  const cont = await db.collection('iaUso').where('email', '==', email).where('dia', '==', dia).where('recurso', '==', RECURSO).count().get();
  const usados = Number(cont.data().count) || 0;
  if (usados >= limite) throw falha('limite_diario', { limite });

  // 3. a foto
  const data = (req && req.data) || {};
  const imagem = String(data.imagem == null ? '' : data.imagem);
  const mime = String(data.mime == null || data.mime === '' ? 'image/jpeg' : data.mime);
  if (!imagem) throw falha('sem_imagem');
  if (imagem.length > MAX_BYTES) throw falha('imagem_grande');
  if (!MIMES.includes(mime)) throw falha('formato_invalido', { mime });

  const registrar = async doc => {
    try {
      await db.collection('iaUso').add(Object.assign({ email, dia, recurso: RECURSO, at: agora.toISOString(), tokensIn: 0, tokensOut: 0, custoUsd: 0, itensLidos: 0, erro: null, modelo }, doc));
    } catch (e) { console.error('iaUso: nao gravou', e && e.message); }
  };

  // 4. AI 읽기 (Anthropic API)
  let r;
  try {
    r = await anthropic.messages.parse({
      model: modelo,
      max_tokens: 4000,
      system: INSTRUCAO,
      output_config: { effort: 'low', format: formato },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: imagem } },
          { type: 'text', text: TEXTO_USUARIO },
        ],
      }],
    });
  } catch (e) {
    const ehApi = typeof erros.APIError === 'function' && e instanceof erros.APIError;
    const ehSdk = typeof erros.AnthropicError === 'function' && e instanceof erros.AnthropicError;
    if (ehSdk && !ehApi) {
      // a resposta veio, mas nao deu para ler o JSON (recusa em texto, saida cortada): nada lido, como o antigo
      console.warn('saida ilegivel', e && e.message);
      r = { stop_reason: 'ilegivel', parsed_output: null, usage: null };
    } else {
      const erro = codigoDoErro(e, erros);
      console.error('anthropic', erro, e && e.status, String(e && e.message || e).slice(0, 600));
      await registrar({ erro });
      throw falha(erro, e && e.status ? { http: e.status } : null);
    }
  }

  const tin = Number(r && r.usage && r.usage.input_tokens) || 0;
  const tout = Number(r && r.usage && r.usage.output_tokens) || 0;
  const custo = custoDe(modelo, tin, tout);
  const lido = r && r.stop_reason !== 'refusal' ? r.parsed_output || null : null;
  const itens = normalizar(lido);

  await registrar({ tokensIn: tin, tokensOut: tout, custoUsd: Number(custo.toFixed(6)), itensLidos: itens.length, erro: itens.length ? null : 'nada_lido' });
  console.log(`lidos ${itens.length} item(ns), ${tin}+${tout} tokens, ~US$ ${custo.toFixed(5)}`);

  return {
    ok: true,
    itens,
    observacao: String(lido && lido.observacao != null ? lido.observacao : '').slice(0, 300),
    custo_usd: Number(custo.toFixed(5)),
    restante_hoje: Math.max(limite - usados - 1, 0),
  };
}
