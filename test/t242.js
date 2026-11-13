/* v0.8.201 시험 — 📷 사진으로 라벨 읽기 서버(functions/core.js · Cloud Function lerEtiqueta)의 로직 — 브라우저 · 네트워크 · functions/node_modules 없이 (가짜 db · 가짜 Anthropic · 가짜 시계)
 *   ① 키 없음 → sem_chave · 로그인 없음 / 이메일 미확인 / Google 아님 → sem_login(unauthenticated) · users 문서 없음 / active:false → sem_permissao(permission-denied) · 관리자 이메일(규칙 isAdminEmail)은 문서 없이 통과
 *   ② 하루 한도: settings/app.iaLimiteDia 2 · 오늘(UTC) 같은 사람 2번 → limite_diario(resource-exhausted, limite 2) · 어제 · 다른 사람 · 다른 기능 기록은 안 셈 · 한도 칸이 없으면 300
 *   ③ 사진: 없음 → sem_imagem · 5MB 넘음 → imagem_grande · image/bmp → formato_invalido (모두 invalid-argument)
 *   ④ 정상: AI 요청 모양(모델 · max_tokens 4000 · 시스템 지시 · effort low · 형식 · 이미지 base64 + 글, temperature 등 없음) · 정리(' cwrs03 '→CWRS03 · '250'→250 · 0→null · 모르는 확신→media · 빈 줄 버림 · 40자)
 *        · iaUso 한 줄(email 소문자 · dia · recurso · tokens · custoUsd = 토큰 × 가격표 · itensLidos · erro null · modelo) · 돌려준 값(ok · observacao · custo_usd · restante_hoje)
 *   ⑤ 거절(stop_reason refusal) · 읽을 수 없는 출력(SDK 파싱 오류) → ok + 빈 itens · iaUso erro nada_lido
 *   ⑥ SDK 오류 클래스 → 옛 코드: 인증 · 권한 → chave_invalida · 429 → muitas_chamadas · 400 credit/balance → sem_credito (그 밖 400 → falha_api) · 연결 → falha_rede(unavailable) · 그 밖 → falha_api — iaUso 에도 erro
 *   ⑦ core.js 는 아무것도 import 하지 않음 · index.js 는 v2 onCall(비밀 ANTHROPIC_API_KEY · us-central1 · 256MiB · 60초 · 최대 5) · 모델은 ANTHROPIC_MODELO */
const path = require('path'), fs = require('fs');
(async () => {
  const errs = [], log = (...a) => console.log(...a), ok = (c, m) => { if (!c) errs.push(m); };
  const core = await import(require('url').pathToFileURL(path.resolve(__dirname, '../functions/core.js')).href);
  const { lerEtiquetaCore, INSTRUCAO, PRECO } = core;

  /* 가짜 Anthropic 오류 클래스 (SDK 와 같은 상속: AnthropicError → APIError → 나머지) */
  class AnthropicError extends Error {}
  class APIError extends AnthropicError { constructor(status, msg) { super(msg); this.status = status; } }
  class BadRequestError extends APIError {} class AuthenticationError extends APIError {} class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {} class APIConnectionError extends APIError { constructor(msg) { super(undefined, msg); } }
  const erros = { AnthropicError, APIError, BadRequestError, AuthenticationError, PermissionDeniedError, RateLimitError, APIConnectionError };

  /* 가짜 Firestore — collection().doc().get() · where()...count().get() · add() */
  const fakeDb = (o) => {
    const added = [];
    const coll = name => {
      const query = filters => ({
        where: (f, op, v) => query(filters.concat([[f, op, v]])),
        count: () => ({ get: async () => ({ data: () => ({ count: (name === 'iaUso' ? (o.usos || []).concat(added) : []).filter(d => filters.every(([f, , v]) => d[f] === v)).length }) }) }),
      });
      return Object.assign(query([]), {
        doc: id => ({ get: async () => { const src = name === 'users' ? o.users || {} : name === 'settings' ? o.settings || {} : {}; const v = src[id]; return { exists: v !== undefined, data: () => v }; } }),
        add: async d => { if (name !== 'iaUso') throw new Error('add ' + name); added.push(d); return { id: 'X' + added.length }; },
      });
    };
    return { collection: coll, added };
  };
  const NOW = new Date('2026-11-12T23:30:00Z');
  const tok = (email, extra) => ({ uid: 'u1', token: Object.assign({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }, extra || {}) });
  const IMG = 'QUJD'.repeat(100), FORMATO = { type: 'json_schema', schema: {}, parse: () => null };
  const resp = (po, extra) => Object.assign({ stop_reason: 'end_turn', parsed_output: po, usage: { input_tokens: 1000, output_tokens: 200 } }, extra || {});
  const mkAnth = r => { const calls = []; return { calls, messages: { parse: async p => { calls.push(p); if (r instanceof Error) throw r; return r; } } }; };
  const deps = (o) => Object.assign({ db: fakeDb({ users: { 'joe@x.com': { role: 'manager' } } }), anthropic: mkAnth(resp({ itens: [{ codigo: 'A1', quantidade: 1, confianca: 'alta' }], observacao: '' })), now: () => NOW, cfg: { chave: true }, formato: FORMATO, erros }, o || {});
  const run = async (req, d) => { try { return { r: await lerEtiquetaCore(req, d) }; } catch (e) { return { e }; } };
  const exp = (x, code, erro, m) => { ok(x.e && x.e.code === code && x.e.details && x.e.details.erro === erro, m + ' → ' + code + '/' + erro + ' :: ' + (x.e ? x.e.code + '/' + JSON.stringify(x.e.details) : 'no error')); };

  /* ① */
  exp(await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps({ cfg: { chave: false } })), 'failed-precondition', 'sem_chave', '① no key');
  exp(await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps({ anthropic: null })), 'failed-precondition', 'sem_chave', '① no client');
  exp(await run({ auth: null, data: { imagem: IMG } }, deps()), 'unauthenticated', 'sem_login', '① no auth');
  exp(await run({ auth: tok('joe@x.com', { email_verified: false }), data: { imagem: IMG } }, deps()), 'unauthenticated', 'sem_login', '① unverified email');
  exp(await run({ auth: tok('joe@x.com', { firebase: { sign_in_provider: 'password' } }), data: { imagem: IMG } }, deps()), 'unauthenticated', 'sem_login', '① not Google sign-in');
  exp(await run({ auth: tok('ann@x.com'), data: { imagem: IMG } }, deps()), 'permission-denied', 'sem_permissao', '① no users doc');
  exp(await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps({ db: fakeDb({ users: { 'joe@x.com': { active: false } } }) })), 'permission-denied', 'sem_permissao', '① inactive user');
  let x = await run({ auth: tok('Luke@TheOneFL.com'), data: { imagem: IMG } }, deps({ db: fakeDb({}) })); ok(x.r && x.r.ok, '① admin email passes without a users doc :: ' + (x.e && x.e.message));
  x = await run({ auth: tok('Joe@X.com'), data: { imagem: IMG } }, deps()); ok(x.r && x.r.ok, '① active user (email case-insensitive) passes');
  log('① auth ok');
  /* ② */
  const uso = (email, dia, recurso) => ({ email, dia, recurso: recurso || 'ler-etiqueta' });
  let db = fakeDb({ users: { 'joe@x.com': {} }, settings: { app: { iaLimiteDia: 2 } }, usos: [uso('joe@x.com', '2026-11-12'), uso('joe@x.com', '2026-11-12'), uso('joe@x.com', '2026-11-11'), uso('ann@x.com', '2026-11-12'), uso('joe@x.com', '2026-11-12', 'outro')] });
  x = await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps({ db })); exp(x, 'resource-exhausted', 'limite_diario', '② 2 of 2 today');
  ok(x.e && x.e.details.limite === 2, '② details.limite 2'); ok(db.added.length === 0, '② refused call is not logged');
  db = fakeDb({ users: { 'joe@x.com': {} }, settings: { app: { iaLimiteDia: 3 } }, usos: [uso('joe@x.com', '2026-11-12'), uso('joe@x.com', '2026-11-12')] });
  x = await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps({ db })); ok(x.r && x.r.restante_hoje === 0, '② 3rd of 3 allowed · restante_hoje 0 :: ' + JSON.stringify(x.r));
  x = await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps({ db })); exp(x, 'resource-exhausted', 'limite_diario', '② the 4th (logged 3rd counts)');
  x = await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps()); ok(x.r && x.r.restante_hoje === 299, '② default limit 300 → restante 299 :: ' + (x.r && x.r.restante_hoje));
  /* ③ */
  exp(await run({ auth: tok('joe@x.com'), data: {} }, deps()), 'invalid-argument', 'sem_imagem', '③ no image');
  exp(await run({ auth: tok('joe@x.com'), data: { imagem: 'A'.repeat(5 * 1024 * 1024 + 1) } }, deps()), 'invalid-argument', 'imagem_grande', '③ image > 5 MB');
  x = await run({ auth: tok('joe@x.com'), data: { imagem: IMG, mime: 'image/bmp' } }, deps()); exp(x, 'invalid-argument', 'formato_invalido', '③ bad mime'); ok(x.e && x.e.details.mime === 'image/bmp', '③ details.mime');
  for (const m of ['image/png', 'image/webp', 'image/gif']) { x = await run({ auth: tok('joe@x.com'), data: { imagem: IMG, mime: m } }, deps()); ok(x.r && x.r.ok, '③ ' + m + ' accepted'); }
  log('②③ limit · image ok');
  /* ④ */
  const an = mkAnth(resp({ itens: [{ codigo: ' cwrs03 ', quantidade: '250', confianca: 'alta' }, { codigo: 'tng02', quantidade: 0, confianca: 'xx' }, { codigo: '', quantidade: null, confianca: 'baixa' }, { codigo: 'hxr 01 l', quantidade: 12.6, confianca: 'baixa' }, { codigo: 'X'.repeat(50), quantidade: -3, confianca: 'media' }], observacao: 'foto escura' }));
  db = fakeDb({ users: { 'joe@x.com': {} } });
  x = await run({ auth: tok('Joe@X.com'), data: { imagem: IMG, mime: 'image/jpeg' } }, deps({ db, anthropic: an }));
  log('④ result:', JSON.stringify(x.r));
  const p = an.calls[0] || {};
  ok(p.model === 'claude-haiku-5-5' && p.max_tokens === 4000 && p.system === INSTRUCAO, '④ model · max_tokens · system');
  ok(p.output_config && p.output_config.effort === 'low' && p.output_config.format === FORMATO, '④ output_config effort low + format');
  ok(!('temperature' in p) && !('top_p' in p) && !('top_k' in p) && !('thinking' in p) && !JSON.stringify(p).includes('budget_tokens'), '④ no sampling params / budget_tokens');
  const ct = p.messages && p.messages[0] && p.messages[0].content || [];
  ok(p.messages.length === 1 && p.messages[0].role === 'user' && ct[0].type === 'image' && ct[0].source.type === 'base64' && ct[0].source.media_type === 'image/jpeg' && ct[0].source.data === IMG && ct[1].type === 'text' && ct[1].text === 'Leia esta etiqueta e devolva o JSON.', '④ content image + text');
  const it = x.r ? x.r.itens : [];
  ok(JSON.stringify(it) === JSON.stringify([{ codigo: 'CWRS03', quantidade: 250, confianca: 'alta' }, { codigo: 'TNG02', quantidade: null, confianca: 'media' }, { codigo: 'HXR 01 L', quantidade: 13, confianca: 'baixa' }, { codigo: 'X'.repeat(40), quantidade: null, confianca: 'media' }]), '④ normalized items :: ' + JSON.stringify(it));
  ok(x.r && x.r.ok === true && x.r.observacao === 'foto escura' && x.r.restante_hoje === 299, '④ ok · observacao · restante_hoje');
  const custo = 1000 / 1e6 * 0.10 + 200 / 1e6 * 0.50;
  ok(x.r && x.r.custo_usd === Number(custo.toFixed(5)), '④ custo_usd ' + custo + ' :: ' + (x.r && x.r.custo_usd));
  ok(db.added.length === 1, '④ one iaUso doc :: ' + db.added.length);
  const u = db.added[0] || {}; log('④ iaUso:', JSON.stringify(u));
  ok(u.email === 'joe@x.com' && u.dia === '2026-11-12' && u.recurso === 'ler-etiqueta' && u.at === NOW.toISOString() && u.tokensIn === 1000 && u.tokensOut === 200 && u.custoUsd === Number(custo.toFixed(6)) && u.itensLidos === 4 && u.erro === null && u.modelo === 'claude-haiku-5-5', '④ iaUso fields');
  db = fakeDb({ users: { 'joe@x.com': {} } });
  const an2 = mkAnth(resp({ itens: [{ codigo: 'A', quantidade: 1, confianca: 'alta' }], observacao: '' }, { usage: { input_tokens: 2000, output_tokens: 100 } }));
  x = await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps({ db, anthropic: an2, cfg: { chave: true, modelo: 'claude-sonnet-5-5' } }));
  ok(an2.calls[0].model === 'claude-sonnet-5-5' && db.added[0].modelo === 'claude-sonnet-5-5' && db.added[0].custoUsd === Number((2000 / 1e6 * 2 + 100 / 1e6 * 10).toFixed(6)), '④ model override + its price');
  ok(an2.calls[0].messages[0].content[0].source.media_type === 'image/jpeg', '④ mime defaults to image/jpeg');
  ok(PRECO['claude-haiku-5-5'].in === 0.10 && PRECO['claude-haiku-5-5'].out === 0.50 && PRECO['claude-haiku-4-5'].in === 1 && PRECO['claude-sonnet-5-5'].out === 10, '④ price table');
  /* ⑤ */
  for (const [nome, r] of [['refusal', resp(null, { stop_reason: 'refusal' })], ['refusal with output', resp({ itens: [{ codigo: 'A', quantidade: 1, confianca: 'alta' }], observacao: '' }, { stop_reason: 'refusal' })], ['null parsed_output', resp(null)], ['empty itens', resp({ itens: [], observacao: 'cortada' })], ['unparseable output (SDK parse error)', new AnthropicError('Failed to parse structured output')]]) {
    db = fakeDb({ users: { 'joe@x.com': {} } });
    x = await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps({ db, anthropic: mkAnth(r) }));
    ok(x.r && x.r.ok === true && Array.isArray(x.r.itens) && x.r.itens.length === 0, '⑤ ' + nome + ' → ok + empty itens :: ' + JSON.stringify(x.r || (x.e && x.e.details)));
    ok(db.added.length === 1 && db.added[0].erro === 'nada_lido' && db.added[0].itensLidos === 0, '⑤ ' + nome + ' → iaUso nada_lido');
  }
  log('④⑤ call · normalize · log ok');
  /* ⑥ */
  const casos = [[new AuthenticationError(401, 'invalid x-api-key'), 'internal', 'chave_invalida'], [new PermissionDeniedError(403, 'forbidden'), 'internal', 'chave_invalida'], [new RateLimitError(429, 'rate limited'), 'resource-exhausted', 'muitas_chamadas'],
    [new BadRequestError(400, 'Your credit balance is too low to access the Anthropic API.'), 'resource-exhausted', 'sem_credito'], [new BadRequestError(400, 'image could not be processed'), 'internal', 'falha_api'],
    [new APIConnectionError('Connection error.'), 'unavailable', 'falha_rede'], [new APIError(529, 'overloaded'), 'internal', 'falha_api'], [new TypeError('boom'), 'internal', 'falha_api']];
  for (const [er, code, erro] of casos) {
    db = fakeDb({ users: { 'joe@x.com': {} } });
    x = await run({ auth: tok('joe@x.com'), data: { imagem: IMG } }, deps({ db, anthropic: mkAnth(er) }));
    exp(x, code, erro, '⑥ ' + er.constructor.name + ' ' + (er.message || ''));
    ok(db.added.length === 1 && db.added[0].erro === erro, '⑥ ' + er.constructor.name + ' logged with erro ' + erro);
  }
  log('⑥ error mapping ok');
  /* ⑦ */
  const src = fs.readFileSync(path.resolve(__dirname, '../functions/core.js'), 'utf8'), idx = fs.readFileSync(path.resolve(__dirname, '../functions/index.js'), 'utf8');
  ok(!/^\s*import\s/m.test(src) && !/require\(/.test(src), '⑦ core.js imports nothing');
  ok(/onCall\(\{\s*secrets:\s*\[ANTHROPIC_API_KEY\],\s*region:\s*'us-central1',\s*memory:\s*'256MiB',\s*timeoutSeconds:\s*60,\s*maxInstances:\s*5\s*\}/.test(idx) && /defineSecret\('ANTHROPIC_API_KEY'\)/.test(idx) && /from 'firebase-functions\/v2\/https'/.test(idx), '⑦ index.js onCall options + secret');
  ok(/process\.env\.ANTHROPIC_MODELO \|\| MODELO_PADRAO/.test(idx) && core.MODELO_PADRAO === 'claude-haiku-5-5', '⑦ model from ANTHROPIC_MODELO, default Haiku 5.5');
  ok(/messages\.parse\(/.test(src) && /zodOutputFormat\(Leitura\)/.test(idx), '⑦ messages.parse + zodOutputFormat');
  ok(INSTRUCAO.startsWith('Voce le etiquetas de caixas de um estoque de joias.') && INSTRUCAO.includes('Nao confunda o codigo do produto com codigo de rastreio') && INSTRUCAO.endsWith('Deixe "" quando estiver tudo certo.'), '⑦ INSTRUCAO is the old prompt');
  ok(!/sk-ant-/.test(src + idx), '⑦ no key in code');
  log(errs.length ? 'FAIL' : 'PASS'); if (errs.length) console.log(errs);
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
