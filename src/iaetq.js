/* ============================================================
 *  📷 사진으로 라벨 읽기 (📥 상품 받기 · 넣기 칸) — 옛 WMS 의 "Ler etiqueta por foto" 를 그대로
 *    옛 campoLerEtiquetaHTML · fotoHeic · fotoParaBase64 · iaErroTxt · iaEnviarFoto · iaPrepararSelecao · modalLeituraEtiqueta
 *       · modalLeituraRastreio · iaReceberLote · perguntarEntradaLote · iaEntradaLote · feedbackOverlay
 *    흐름: 사진(카메라 · 갤러리) → 1568px JPEG(.78) → Cloud Function lerEtiqueta (db.js callFn · 서버 functions/core.js)
 *          → 결과 창(상품과 맞는 줄만 고를 수 있음 · 수량 고치기) → 트래킹 창(앞의 트래킹 · 스캔) → 빈 상자 확인 · 트래킹 허가
 *          → 지금 연 REC 에 고른 줄마다 받은 줄 하나 (recebidos.js 의 gravarLinha — 손으로 넣기와 같은 쓰기)
 *          → 초록 화면 → "재고에도 넣을까요?" → 줄마다 새 상자 라벨 (recebidos.js 의 entrarLinha) → 라벨 크기 고르기
 *    상태 · 쓰기 길은 recebidos.js 가 init(ctx) 로 넘겨 줌 (서로 import 하지 않음)
 * ============================================================ */
import { $, esc, toast } from './ui.js';
import { callFn } from './db.js';
import { openScanner } from './scan.js';
import * as E from './etq.js';
import { L3 } from './balcao.js';

let C = null;   // recebidos.js 의 도구 { t, RC, ICO, recPagina, fechada, cancelada, gravarLinha, entrarLinha, rastreioLiberado, rastNorm, ultRast, ultRastSalvar, ultFotoSalvar, origemDoProduto, render }
export function init(ctx) { C = ctx; }
const t = (k, v) => C.t(k, v);
const svg = (p, n) => E.svg(p, n);
const ICO_COMPRA = '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>';

/* ---------- CSS (옛 .ia-* · .fb-tela · .fb-over 를 이 화면 · 이 화면의 창 · 이 화면의 덮개(.sb.rc-fb) 안으로만) ---------- */
const R = '.sb.rc-raiz ', M = '.sb.es-mw .rc-m ', F = '.sb.rc-fb ';
const both = (sel, body) => sel.split(',').map(s => R + s.trim() + ',' + M + s.trim()).join(',') + '{' + body + '}';
const IA_CSS = [
  both('.ia-campo', 'display:flex;align-items:center;gap:10px;flex-wrap:wrap'),
  both('.ia-campo .hint', 'font-size:11.8px;color:var(--muted);flex:1;min-width:160px'),
  both('.ia-btn', 'gap:7px'),
  both('.ia-lista', 'border:1px solid var(--border);border-radius:var(--radius);overflow:hidden'),
  both('.ia-lin', 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #eef1f3;background:#fff'),
  both('.ia-lin:last-child', 'border-bottom:none'),
  both('.ia-lin.sem-prod', 'background:#fbfcfd;opacity:.75'),
  both('.ia-marca', 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer'),
  both('.ia-lin.sem-prod .ia-marca', 'cursor:default'),
  both('.ia-marca input[type=checkbox]', 'width:18px;height:18px;flex:none;accent-color:var(--accent)'),
  both('.ia-vazio', 'width:18px;flex:none'),
  both('.ia-txt', 'min-width:0'),
  both('.ia-txt b', 'display:block;font-family:"Courier New",monospace;font-size:13.4px'),
  both('.ia-txt>span', 'display:block;font-size:11.8px;color:var(--muted);overflow:hidden;text-overflow:ellipsis'),
  both('.ia-lin .badge', 'flex:none'),
  both('.ia-qtd-in', 'width:78px;flex:none;padding:6px 8px;text-align:center;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums'),
  both('.ia-nao', 'color:var(--red)'),
  '@media(max-width:700px){' + both('.ia-lin', 'flex-wrap:wrap') + both('.ia-marca', 'flex:1 1 100%') + both('.ia-qtd-in', 'margin-left:auto') + '}',
  F + '.fb-spin{width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;animation:.62s linear infinite fbgira;flex:none;opacity:.85}',
  F + '.fb-spin.grande{width:46px;height:46px;border-width:4px;opacity:1}',
  '@keyframes fbgira{to{transform:rotate(360deg)}}',
  F + '.fb-tela{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .18s ease-out;cursor:pointer;-webkit-tap-highlight-color:transparent}',
  F + '.fb-tela.on{opacity:1}',
  F + '.fb-tela.ok{background:linear-gradient(160deg,#12b76a 0,#0a7d47 100%)}',
  F + '.fb-tela.erro{background:linear-gradient(160deg,#e5342f 0,#a3121c 100%)}',
  F + '.fb-tela.carregando{background:linear-gradient(160deg,#1f4e8c 0,#12325c 100%);cursor:default}',
  F + '.fb-tela-in{text-align:center;color:#fff;transform:scale(.92);transition:transform .26s cubic-bezier(.2, .9, .3, 1.3);max-width:560px}',
  F + '.fb-tela.on .fb-tela-in{transform:none}',
  F + '.fb-tela .fb-check-svg{width:120px;height:120px;margin:0 auto 22px;display:block}',
  F + '.fb-check-c{fill:none;stroke-dasharray:152;stroke-dashoffset:152;animation:.48s cubic-bezier(.65,0,.45,1) forwards fbcirc}',
  F + '.fb-check-p{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:48;stroke-dashoffset:48;animation:.34s cubic-bezier(.65,0,.45,1) .42s forwards fbrisco}',
  F + '.fb-tela .fb-check-svg .fb-check-c{stroke:rgba(255,255,255,.55);stroke-width:2}',
  F + '.fb-tela .fb-check-svg .fb-check-p{stroke:#fff;stroke-width:4.2}',
  '@keyframes fbcirc{to{stroke-dashoffset:0}}@keyframes fbrisco{to{stroke-dashoffset:0}}',
  F + '.fb-tela-msg{font-size:30px;font-weight:700;letter-spacing:-.4px;line-height:1.2}',
  F + '.fb-tela-sub{margin-top:12px;font-size:15.5px;line-height:1.5;color:rgba(255,255,255,.88);word-break:break-word}',
  F + '.fb-tela-toque{margin-top:26px;font-size:13.5px;letter-spacing:.4px;text-transform:uppercase;color:rgba(255,255,255,.72);animation:1.8s ease-in-out infinite fbpulsa}',
  '@keyframes fbpulsa{0%,100%{opacity:.55}50%{opacity:1}}',
  '@media(max-width:700px){' + F + '.fb-tela .fb-check-svg{width:92px;height:92px;margin-bottom:18px}' + F + '.fb-tela-msg{font-size:24px}' + F + '.fb-tela-sub{font-size:14px}}',
  '@media(prefers-reduced-motion:reduce){' + F + '.fb-tela,' + F + '.fb-tela-in{transition:none}' + F + '.fb-tela-in{transform:none}' + F + '.fb-tela-toque{animation:none;opacity:.85}' + F + '.fb-spin{animation-duration:1.6s}' + F + '.fb-check-c,' + F + '.fb-check-p{animation-duration:.01s;animation-delay:0s}}'
].join('');
function injetarCss() { if (document.getElementById('iaCss')) return; const st = document.createElement('style'); st.id = 'iaCss'; st.textContent = IA_CSS; document.head.appendChild(st); }

/* ---------- 단추 (옛 campoLerEtiquetaHTML — 넣기 칸의 검색 바로 아래) ---------- */
export function campoHTML() {
  injetarCss();
  return '<div class="field ia-campo" style="grid-column:1/-1"><input type="file" id="iaFoto" accept="image/*" capture="environment" style="display:none"><input type="file" id="iaGaleria" accept="image/*" style="display:none">' +
    '<button type="button" class="btn ia-btn" data-ia-foto="1">' + svg(C.ICO.foto, 16) + ' ' + esc(t('ia_ler_foto')) + '</button><button type="button" class="btn ia-btn" data-ia-galeria="1">' + svg(E.ICO.imagem, 16) + ' ' + esc(t('ia_galeria')) + '</button><span class="hint">' + esc(t('ia_ler_foto_dica')) + '</span></div>';
}
/** recebidos.js 의 ligar() 가 부름 — 고른 파일 → 읽기 */
export function ligar() {
  ['iaFoto', 'iaGaleria'].forEach(id => { const f = $(id); if (f) f.onchange = ev => { const a = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (a) enviarFoto(a); }; });
}

/* ---------- 덮개 (옛 feedbackOverlay — 읽는 중 · 저장 중은 파란 화면, 끝나면 초록 화면을 눌러야 넘어감) ---------- */
const ICO_CHECK = '<svg class="fb-check-svg" viewBox="0 0 52 52"><circle class="fb-check-c" cx="26" cy="26" r="23"/><path class="fb-check-p" d="M15 27l8 8 15-16"/></svg>';
export function overlay(msg, sub, o) {
  o = o || {}; injetarCss(); E.injetarCss();
  const w = document.createElement('div'); w.className = 'sb rc-fb'; w.style.cssText = 'padding:0;margin:0;min-height:0;background:transparent';
  w.innerHTML = '<div class="fb-tela ok' + (o.carregando ? ' carregando' : '') + '" role="status" aria-live="assertive"><div class="fb-tela-in">' + (o.carregando ? '<span class="fb-spin grande"></span>' : ICO_CHECK) +
    '<div class="fb-tela-msg">' + esc(msg) + '</div>' + (sub ? '<div class="fb-tela-sub">' + esc(sub) + '</div>' : '') + (o.carregando ? '' : '<div class="fb-tela-toque">' + esc(t('fb_toque')) + '</div>') + '</div></div>';
  document.body.appendChild(w);
  const tela = w.firstChild; requestAnimationFrame(() => tela.classList.add('on'));
  let feito = false;
  const fechar = () => { if (feito) return; feito = true; tela.classList.remove('on'); setTimeout(() => w.remove(), 240); };
  if (!o.carregando) tela.addEventListener('click', () => { fechar(); if (o.aoFechar) o.aoFechar(); });
  return fechar;
}

/* ---------- 사진 (옛 fotoHeic · fotoParaBase64) ---------- */
/** HEIC(아이폰 기본)는 브라우저가 열지 못함 — 캔버스 · 전송 전부 안 되므로 미리 알려 줌 */
export function fotoHeic(f) {
  const nome = String(f && f.name || '').toLowerCase(), tipo = String(f && f.type || '').toLowerCase();
  return /\.hei[cf]$/.test(nome) || tipo.indexOf('heic') >= 0 || tipo.indexOf('heif') >= 0;
}
/** 긴 변 1568px · JPEG .78 → (base64, 'image/jpeg') · 실패면 (null) — 1568 은 읽기 쪽이 다시 줄이지 않는 가장 큰 크기 (옛 주석: 1280 이면 50줄 패킹 라벨이 겨우 읽힘) */
export function fotoParaBase64(arq, cb) {
  try {
    const fr = new FileReader();
    fr.onload = ev => {
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.width, h = img.height; const r = Math.min(1, 1568 / Math.max(w, h));
          w = Math.round(w * r); h = Math.round(h * r);
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
          const s = cv.toDataURL('image/jpeg', 0.78);
          cb(s.slice(s.indexOf(',') + 1), 'image/jpeg');
        } catch (e) { cb(null); }
      };
      img.onerror = () => cb(null);
      img.src = ev.target.result;
    };
    fr.onerror = () => cb(null);
    fr.readAsDataURL(arq);
  } catch (e) { cb(null); }
}
/** 서버 오류 코드 → 옛 문구 (옛 iaErroTxt) */
export function erroTxt(e) {
  return t({ sem_chave: 'ia_erro_sem_chave', chave_invalida: 'ia_erro_sem_chave', sem_credito: 'ia_erro_sem_credito', limite_diario: 'ia_erro_limite', muitas_chamadas: 'ia_erro_ocupado',
    sem_login: 'ia_erro_login', sem_permissao: 'ia_erro_login', imagem_grande: 'ia_erro_foto', formato_invalido: 'ia_erro_foto', sem_imagem: 'ia_erro_foto' }[e] || 'ia_erro_geral');
}

/* ---------- 읽기 (옛 iaEnviarFoto) ---------- */
let LEITURA = null, SEL = null, VAZIO_OK = false, RAST = null;
function enviarFoto(arq) {
  if (!arq) return;
  if (fotoHeic(arq)) return toast(t('ia_erro_heic'), 'bad');
  const fechar = overlay(t('ia_lendo'), t('ia_lendo_sub'), { carregando: true });
  fotoParaBase64(arq, async (imagem, mime) => {
    if (!imagem) { fechar(); return toast(t('ia_erro_foto'), 'bad'); }
    let o = null;
    try { o = await callFn('lerEtiqueta', { imagem, mime }); }
    catch (e) { fechar(); const erro = e && e.details && e.details.erro; return toast(erro ? erroTxt(erro) : t('ia_erro_geral'), 'bad'); }
    fechar();
    if (o && o.erro) return toast(erroTxt(o.erro), 'bad');
    if (!(o && o.itens && o.itens.length)) return toast(t('ia_nada_lido'), 'bad');
    LEITURA = o; SEL = null; RAST = null;   // 새 사진 = 새 고르기 (옛 앱은 앞의 고르기가 남아 있을 수 있었음)
    try { PRODS_CACHE = await E.produtos(); } catch (e) { PRODS_CACHE = PRODS_CACHE || []; }
    modalLeitura();
  });
}

/* ---------- 상품 찾기 (옛 acharPorCodigo · COD_CONF · acharPorCodigoFoto) ---------- */
let PRODS_CACHE = null;   // E.produtos() — 읽기 직후에 받아 둠
const lista = () => PRODS_CACHE || [];
function acharPorCodigo(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase(); if (!e) return null;
  const a = lista(), o = a.filter(x => String(x.barcode || '').trim().toLowerCase() === e)[0]; if (o) return o;
  const r = E.normCod(v);
  return r && (a.filter(x => E.normCod(x.sku) === r)[0] || a.filter(x => E.normCod(x.nome) === r)[0]) || null;
}
/* 사진으로 읽으면 비슷한 글자와 숫자가 바뀜(0↔O, 1↔I). 양쪽(읽은 코드와 등록된 것)을 같은 규칙으로 바꿔 비교 — 두 단계:
   먼저 O→0 · I/L→1 만, 그다음 S→5 · B→8 · Z→2 · G→6 도. 상품 하나만 맞을 때만 씀 — 둘 이상이면 "등록되지 않은 코드" (고르면 짐작이 됨) */
const COD_CONF = [
  [[/O/g, '0'], [/[IL]/g, '1']],
  [[/O/g, '0'], [/[IL]/g, '1'], [/S/g, '5'], [/B/g, '8'], [/Z/g, '2'], [/G/g, '6']]
];
function codConfChave(v, nivel) { let s = String(v == null ? '' : v).toUpperCase().replace(/[^0-9A-Z]/g, ''); COD_CONF[nivel].forEach(r => { s = s.replace(r[0], r[1]); }); return E.normCod(s); }
export function acharPorCodigoFoto(v) {
  const p = acharPorCodigo(v); if (p) return p;
  const a = lista();
  for (let n = 0; n < COD_CONF.length; n++) {
    const k = codConfChave(v, n); if (!k) continue;
    const achados = a.filter(x => codConfChave(x.sku, n) === k || (x.barcode && codConfChave(x.barcode, n) === k));
    if (achados.length === 1) return achados[0];
    if (achados.length > 1) return null;
  }
  return null;
}
const ehCaixaVazia = p => !!(p && (p.vazia || p.situacao === 'empty'));
const chipVaziaHTML = () => ' <span class="pdz-chip pdz-vm">' + esc(t('ins_caixa_vazia')) + '</span>';

/* ---------- 고르기 (옛 iaPrepararSelecao · iaSelecionados · iaAtualizarRodape) ---------- */
function prepararSelecao() {
  VAZIO_OK = false; SEL = {};
  (LEITURA && LEITURA.itens || []).forEach((it, i) => { const p = it.codigo ? acharPorCodigoFoto(it.codigo) : null; SEL[i] = { prod: p, marcado: !!(p && it.quantidade > 0), qtd: it.quantidade || 1 }; });
}
const selecionados = () => Object.keys(SEL || {}).filter(k => SEL[k].marcado && SEL[k].prod && Number(SEL[k].qtd) > 0).map(k => SEL[k]);
function atualizarRodape() { const L = selecionados(), b = $('iaContinuar'); if (b) { b.disabled = !L.length; b.innerHTML = esc(t('ia_continuar', { n: L.length })); } }

/* ---------- 결과 창 (옛 modalLeituraEtiqueta) ---------- */
function modalLeitura() {
  const e = LEITURA; if (!e) return;
  if (!SEL || !Object.keys(SEL).length) prepararSelecao();
  const linhas = e.itens.map((it, i) => {
    const o = SEL[i] || {}, r = o.prod, cls = it.confianca === 'baixa' ? 'out' : it.confianca === 'media' ? 'low' : 'ok';
    const lidoComo = r && it.codigo && E.normCod(r.sku) !== E.normCod(it.codigo) && String(r.barcode || '').trim().toLowerCase() !== String(it.codigo).trim().toLowerCase();
    return '<div class="ia-lin' + (r ? '' : ' sem-prod') + '" data-ia-i="' + i + '"><label class="ia-marca">' + (r ? '<input type="checkbox" data-ia-chk="' + i + '"' + (o.marcado ? ' checked' : '') + '>' : '<span class="ia-vazio"></span>') +
      '<span class="ia-txt"><b>' + (lidoComo ? esc(r.sku) + ' <small class="ia-lido">' + esc(t('ia_lido_como', { c: it.codigo })) + '</small>' : esc(it.codigo || t('ia_sem_codigo'))) + '</b><span>' +
      (r ? esc(r.descricao || r.nome) + ' · ' + esc(t('es_saldo_atual')) + ': ' + r.qtd + (ehCaixaVazia(r) ? chipVaziaHTML() : '') : '<span class="ia-nao">' + esc(t(it.codigo ? 'ia_nao_encontrado' : 'ia_sem_codigo_sub')) + '</span>') + '</span></span></label>' +
      '<span class="badge ' + cls + '">' + esc(t('ia_conf_' + it.confianca)) + '</span>' +
      (r ? '<input class="ia-qtd-in" type="number" inputmode="numeric" min="1" value="' + esc(String(o.qtd || 1)) + '" data-ia-qtd="' + i + '" aria-label="' + esc(t('qtd')) + '">' : '') + '</div>';
  }).join('');
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('ia_titulo')) + '</h2><button class="x" data-act="fechar-modal">' + svg(E.ICO.x, 17) + '</button></div><div class="modal-body"><div class="aviso" style="margin:0 0 12px">' + svg(E.ICO.ajuda, 16) + '<div>' + esc(t('ia_confira')) + '</div></div>' +
    (e.observacao ? '<div class="aviso ia-obs" style="margin:0 0 12px">' + svg(E.ICO.ajuda, 16) + '<div>' + esc(e.observacao) + '</div></div>' : '') +
    '<div class="ia-lista">' + linhas + '</div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button><button class="btn primary" id="iaContinuar" data-ia-cont="1"></button></div>', 'rc-m ia-m');
  w.addEventListener('change', ev => { const c = ev.target.closest('[data-ia-chk]'); if (c && SEL && SEL[c.dataset.iaChk]) { SEL[c.dataset.iaChk].marcado = !!c.checked; atualizarRodape(); } });
  w.addEventListener('input', ev => { const q = ev.target.closest('[data-ia-qtd]'); if (q && SEL && SEL[q.dataset.iaQtd]) { SEL[q.dataset.iaQtd].qtd = Math.max(0, Number(q.value) || 0); atualizarRodape(); } });
  w.addEventListener('click', ev => { if (ev.target.closest('[data-ia-cont]')) { ev.stopPropagation(); modalRastreio(); } });
  atualizarRodape();
}

/* ---------- 트래킹 창 (옛 modalLeituraRastreio — 앞의 트래킹을 미리 넣고 스캔도) ---------- */
function modalRastreio() {
  const L = selecionados(); if (!L.length) return;
  const pecas = L.reduce((s, x) => s + (Number(x.qtd) || 0), 0), pre = RAST != null ? RAST : C.ultRast();
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('ia_rastreio_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(E.ICO.x, 17) + '</button></div><div class="modal-body"><div class="aviso" style="margin:0 0 12px">' + svg(ICO_COMPRA, 16) + '<div>' + esc(t('ia_resumo', { n: L.length, p: pecas })) + '</div></div>' +
    '<div class="form-grid"><div class="field" style="grid-column:1/-1"><label>' + esc(t('r_rastreio')) + '</label><div class="campo-scan"><input id="iaRastreio" autocomplete="off" placeholder="' + esc(t('r_rastreio_ph')) + '" value="' + esc(pre || '') + '"><button type="button" class="scan-btn" data-ia-scan="1" title="' + esc(t('sc_abrir')) + '">' + svg(E.ICO.scan, 18) + '</button></div><div class="hint">' + esc(t('ia_rastreio_hint')) + '</div></div></div></div>' +
    '<div class="modal-foot"><button class="btn" data-ia-voltar="1">' + esc(t('voltar')) + '</button><button class="btn primary" data-ia-confirmar="1">' + esc(t('ia_confirmar')) + '</button></div>', 'rc-m ia-m');
  const inp = w.querySelector('#iaRastreio');
  if (inp) { inp.oninput = () => { RAST = inp.value; }; inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); receberLote(); } }; inp.focus(); try { inp.select(); } catch (e) {} }
  w.addEventListener('click', ev => {
    if (ev.target.closest('[data-ia-voltar]')) { ev.stopPropagation(); RAST = inp ? inp.value : RAST; return modalLeitura(); }
    if (ev.target.closest('[data-ia-confirmar]')) { ev.stopPropagation(); return receberLote(); }
    if (ev.target.closest('[data-ia-scan]')) { ev.stopPropagation(); return openScanner(code => { const i = $('iaRastreio'); if (i) { i.value = String(code || '').trim(); RAST = i.value; toast(t('r_rastreio') + ': ' + i.value, 'good'); } }, { title: t('sc_abrir') }); }
  });
}

/* ---------- 받기 (옛 iaReceberLote — 빈 상자 확인 · 트래킹 허가 · 줄마다 받은 줄 · 일부 실패 · 초록 화면 · 재고에도?) ---------- */
async function receberLote() {
  const L = selecionados(); if (!L.length) return;
  const c = C.recPagina();
  if (!c || C.fechada(c) || C.cancelada(c)) { E.fecharModal(); return toast(L3('닫힌 REC 입니다. 다시 연 뒤 넣으세요.', 'This REC is closed. Reopen it before adding products.', 'O recebimento está ' + (c ? c.status : '') + '. Reabra antes de lançar produtos.'), 'bad'); }
  const i = $('iaRastreio'); if (i) RAST = i.value;
  const rast = C.rastNorm(RAST != null ? RAST : '');
  /* 손으로 넣을 때(receberSalvar)와 같은 빨간 확인 — 같은 일에 다른 경고를 두면 둘 다 안 읽게 됨 */
  const vz = L.filter(x => ehCaixaVazia(x.prod));
  if (vz.length && !VAZIO_OK) {
    const r = await E.pergunta({ cls: 'rc-m', perigo: true, titulo: t('r_alerta_vazio_tit'), texto: vz.map(x => x.prod.nome).join(', ') + ' — ' + t('r_alerta_vazio_txt'), sim: t('r_alerta_vazio_ok'), nao: t('cancelar') });
    if (!r) return modalRastreio();
    VAZIO_OK = true;
  }
  if (!(await C.rastreioLiberado(rast))) { if (!$('iaRastreio')) modalRastreio(); return; }
  E.fecharModal();
  const fechar = overlay(t('ia_gravando'), t('ia_gravando_sub', { n: L.length }), { carregando: true });
  const ok = [], falhou = [], foto = C.RC.foto || '';
  for (const x of L) {
    const p = x.prod, q = Number(x.qtd) || 0;
    try { const d = await C.gravarLinha(c, p, { qtd: q, pick: 0, orig: C.origemDoProduto(p) || '', corr: p.corredor || '', rast, foto }); ok.push({ prod: p, qtd: q, recebimentoId: d.id }); }
    catch (e) { falhou.push(p.nome); }
  }
  fechar();
  C.RC.liberado = false; if (rast) C.ultRastSalvar(rast); if (foto) C.ultFotoSalvar(foto);
  Object.assign(C.RC, { foto: '', prod: '', rBusca: '' }); LEITURA = null; SEL = null; RAST = null; VAZIO_OK = false;
  C.render();
  if (falhou.length) return toast(t('ia_lote_parcial', { n: ok.length, e: falhou.length }), 'bad');
  overlay(t('ia_lote_ok'), t('ia_lote_ok_sub', { n: ok.length }), { aoFechar: () => perguntarEntradaLote(ok) });
}
/** 옛 perguntarEntradaLote — 받은 것을 재고에도 (줄마다 새 상자 라벨) */
async function perguntarEntradaLote(L) {
  if (!L || !L.length) return;
  const r = await E.pergunta({ cls: 'rc-m', titulo: t('r_perg_estoque_tit'), texto: t('ia_entrada_txt', { n: L.length }), sim: t('r_perg_estoque_sim'), nao: t('r_perg_estoque_nao') });
  if (r) entradaLote(L);
}
/** 옛 iaEntradaLote — 이미 넣은 줄은 건너뛰되 조용히 넘어가지 않음 (ia_lote_ja_conf) */
async function entradaLote(L) {
  const fechar = overlay(t('ia_entrada_gravando'), '', { carregando: true });
  const etqs = []; let ja = 0;
  for (const x of L) {
    try { const r = await C.entrarLinha(x.recebimentoId, x.qtd, null, true); if (r.ja) ja++; else if (r.lista) r.lista.forEach(e => etqs.push(e)); } catch (e) {}
  }
  fechar(); C.render();
  if (ja) toast(t('ia_lote_ja_conf', { n: E.numFmt(ja) }), 'bad');
  if (!etqs.length) return toast(t('ia_erro_geral'), 'bad');
  overlay(t('ia_entrada_ok'), t('ia_entrada_ok_sub', { n: etqs.length }), { aoFechar: () => E.escolherTamanho(etqs) });
}
