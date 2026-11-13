/* ============================================================
 *  🏷 상자 라벨(etiquetas) 공용 — 📦 재고(estoque.js) 와 🏷 라벨 출력(etiquetas.js) 이 같이 씀
 *  옛 THE ONE CORP WMS 의 Supabase RPC 가 하던 일을 Firestore 에서 그대로:
 *    rpc_entrada_com_etiqueta · rpc_entrada_etiquetas_iguais · rpc_entrada_etiqueta_existente (입고 → 상자 라벨)
 *    rpc_baixar_etiquetas_lote (상자에서 출고) · rpc_ajustar_estoque (라벨 없는 재고) · rpc_editar_qtd_etiqueta · rpc_excluir_etiqueta
 *    rpc_somar_etiquetas2 (합치기) · rpc_dividir_etiqueta (나누기) · rpc_estornar_movimentacao · rpc_estorno_pedir · rpc_estorno_resolver
 *  컬렉션
 *    etiquetas/{codigo} = { codigo, code, nome, barcode, corredor, qtdInicial, qtdRestante, ativa, criadoEm, criadoPor, encerradoEm, encerradoPor }
 *        codigo = 8자리 (옛 novo_codigo_etiqueta 와 같은 글자: 0 · 1 · I · O 없음) · 상자 하나 = 라벨 하나
 *    etqEventos/{id}    = { codigo, code, tipo: criada|entrada|baixa|qtd_editada|encerrada|excluida|somada|dividida, detalhe, por, porNome, em }
 *    estornos/{id}      = { movId, code, delta, etq, motivo, motivoTipo, por, porNome, em, status: aberto|aprovado|recusado, resposta, resolvidoPor, resolvidoEm }
 *    stock/{code}.qty 와 stockLog 는 stock.js 의 moveStock 으로 (applyMoves 와 같은 모양 + etq · origem)
 *    reposicao/{id} (🔁 채울 상품) — 상자에서 꺼내거나(출고 · 상자 수량 줄이기 · 상자 삭제) 들어오면(입고 · + 조정 · + 실사) 그 상품의 열린 요청을 같은 batch 로 닫음 (옛 DB 트리거 trg_resolver_reposicao · rpc_baixar_etiqueta*)
 *  인쇄는 옛 앱의 인쇄 에이전트 대신 브라우저 인쇄 (printOpen) — 라벨 크기마다 @page (estoque-css.js ES_PRT_CSS)
 * ============================================================ */
import { $, esc, toast, printOpen, closeModal } from './ui.js';
import { isTop, can } from './main.js';
import { catalog, loadCatalog, locOf, aisleOf, levelsOf, thumb, exactItem, searchItems, editCatalog, setLoc } from './catalog.js';
import { stockAll, moveStock, minOf, supLabel } from './stock.js';
import { barcodeSvg, loadJsBarcode } from './catpage.js';
import { newId } from './db.js';
import { svg as svg0, css as sbCss, L3 } from './balcao.js';
import { ES_CSS, ES_PRT_CSS, ES_MAIS, ES_PRT_MAIS } from './estoque-css.js';
import { D } from './estoque-txt.js';

let S = null;
export function init(state) { S = state; }

/* ---------- 문구 (옛 앱의 t · ti · te) ---------- */
export const t = (k, v) => { const x = D[k]; if (!x) return k; let s = L3(x[0], x[1], x[2]); if (v) Object.keys(v).forEach(n => { s = s.split('{' + n + '}').join(String(v[n])); }); return s; };
export const te = k => { const x = D[k]; return x ? x[1] : k; };   // 라벨은 늘 영어 (옛 앱 te)
export const numFmt = n => (Number(n) || 0).toLocaleString('en-US');   // 옛 앱과 같이 en-US 고정
export const dataBR = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(); };
export const horaCurta = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
export const quem = () => (S.me && S.me.name) || S.user.name || String(S.user.email || '').split('@')[0];

/* ---------- 아이콘 (옛 앱 ICO) ---------- */
export const ICO = {
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  pontos: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  filtro: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  painel: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 7h8V3h-8zM3 21h8v-4H3z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  setaV: '<path d="M12 3v18M8.5 6.5 12 3l3.5 3.5M8.5 17.5 12 21l3.5-3.5"/>',
  prod: '<path d="M20 7 12 3 4 7v10l8 4 8-4z"/><path d="m4 7 8 4 8-4M12 21V11"/>',
  ajuste: '<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="12" r="2.4"/><circle cx="15" cy="18" r="2.4"/>',
  rel: '<path d="M3 3v18h18"/><path d="m7 14 3.5-4 3 3L20 6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  busca: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.7" y2="16.7"/>',
  copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  mais: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  esq: '<polyline points="15 18 9 12 15 6"/>',
  dir: '<polyline points="9 18 15 12 9 6"/>',
  caixa: '<path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><path d="M10 12h4"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13.5" y1="8" x2="13.5" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/>',
  troca: '<path d="M3 9a9 9 0 0 1 14.5-4.5L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 15a9 9 0 0 1-14.5 4.5L3 16"/><polyline points="3 21 3 16 8 16"/>',
  entra: '<path d="M12 3v9"/><polyline points="8 8 12 12 16 8"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
  sai2: '<path d="M12 12V3"/><polyline points="8 7 12 3 16 7"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
  imagem: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-5-5L5 21"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  etiq: '<path d="M20.6 13.4 12 22l-9-9V3h10z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  cubo: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7l8.7 5 8.7-5"/><path d="M12 22V12"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  camadas: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/>',
  print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'
};
export const svg = svg0;
export function injetarCss() { sbCss(); if (!document.getElementById('esCss')) { const st = document.createElement('style'); st.id = 'esCss'; st.textContent = ES_CSS + ES_MAIS + ES_PRT_CSS + ES_PRT_MAIS; document.head.appendChild(st); } }

/* ---------- 권한 (옛 앱 podeMexerEstoque · GERENTE) ---------- */
export const podeMexer = () => can('items');
export const gerente = () => isTop();

/* ---------- 통로 (옛 CORREDORES · corrFmt · ordemCorr) ---------- */
export const corrFmt = v => { v = String(v || '').toUpperCase().trim(); if (!v) return v; const m = v.match(/^(\d+)([A-E]?)$/); if (!m) return v; return (m[1].length === 1 ? '0' + m[1] : m[1]) + m[2]; };
export const CORREDORES = (() => { const L = ['00']; for (let e = 1; e <= 23; e++) { L.push(corrFmt(e + 'A'), corrFmt(e + 'B')); if (e === 4) L.push('04C', '04D', '04E'); } L.push('WAREHOUSE01', 'WAREHOUSE02', 'WAREHOUSE03', 'WAREHOUSE04'); return L; })();
/** 아이템의 통로 = 위치(📍 locOf)의 앞부분 (7A-3 → 07A) — items.js 의 aisleOf 와 같음 */
export const corrDe = loc => { const a = aisleOf(loc); return a ? corrFmt(a) : ''; };
export const ordemCorr = c => { const e = String(c || '').toUpperCase(); if (e === '00') return -1; const a = e.match(/^(\d{1,2})([A-E])$/); return a ? 2 * Number(a[1]) + (a[2] === 'B' ? 1 : a[2] === 'A' ? 0 : 0.5) : 9999; };
export const familiaCodigo = s => { const m = String(s || '').trim().match(/^(.*?)[\s\-_.]*([0-9]+)$/); if (!m) return ''; const o = m[1].trim(); return o && /[A-Za-z]/.test(o) ? o : ''; };
export const normCod = s => (String(s == null ? '' : s).toUpperCase().replace(/[^0-9A-Z]/g, '').match(/[0-9]+|[A-Z]+/g) || []).map(x => /^[0-9]$/.test(x) ? '0' + x : x).join('');
export const codEtq = s => String(s == null ? '' : s).trim().toUpperCase().replace(/([A-Z])(?=[0-9])/g, '$1 ').replace(/([0-9])(?=[A-Z])/g, '$1 ');

/* ---------- 상품 (옛 DADOS.produtos) — 카탈로그 + 재고 ---------- */
let PRODS = null, BYID = {}, PRODS_AT = 0;
export async function produtos(force) {
  if (PRODS && !force && Date.now() - PRODS_AT < 60000) return PRODS;
  await loadCatalog(S);
  const C = catalog(); let qtd = {}, vaz = {};
  try { qtd = await stockAll(force); } catch (e) {}
  try { (await S.DB.list('stock', { where: [['vazia', '==', true]] })).forEach(r => { vaz[r.code || r.id] = true; }); } catch (e) {}
  PRODS = (C ? C.items : []).filter(x => !x.virt && !x.h).map(x => { const loc = locOf(x); const L = levelsOf(x, 'l1'); return { id: x.c, sku: x.c, nome: x.c, descricao: x.d || '', barcode: x.b || '', loc, corredor: corrDe(loc), qtd: Number(qtd[x.c]) || 0, vazia: !!vaz[x.c], categoria: L[0] || '', fornecedor: x.sup ? supLabel(x.sup) : '', foto: x.ph || '', ativo: true }; });
  BYID = {}; PRODS.forEach(p => { BYID[p.id] = p; p.situacao = situacao(p); });
  PRODS_AT = Date.now();
  return PRODS;
}
export const prod = id => BYID[String(id || '').toUpperCase()] || BYID[id] || null;
export function situacao(p) { if (p.vazia) return 'empty'; const q = Number(p.qtd) || 0; if (!q) return 'picking'; if (q < minOf(p.id)) return 'baixo'; return 'ok'; }
export const SIT_CLS = { ok: 'ok', baixo: 'low', alto: 'high', picking: 'pick', empty: 'vazia' };
export const SIT_TXT = { ok: 'st_ok', baixo: 'st_baixo', alto: 'st_alto', picking: 'st_picking', empty: 'st_empty' };
/** 바뀐 재고를 화면 보관값에 바로 반영 (다시 읽지 않고) */
export function notarSaldo(code, qty) { const p = prod(code); if (p) { p.qtd = qty; if (qty > 0) p.vazia = false; p.situacao = situacao(p); } }
export function notarCorredor(codes, loc) { codes.forEach(c => { const p = prod(c); if (p) { p.loc = loc; p.corredor = corrDe(loc); } }); }
/** 옛 buscaProdutos — 코드 · 바코드 · 설명 */
export function buscaProdutos(q) {
  q = String(q || '').trim(); if (!q) return [];
  const cod = etqCodigo(q); if (cod) return [];
  const ex = exactItem(q); const out = [];
  if (ex && prod(ex.c)) out.push(prod(ex.c));
  searchItems(q, null, 40).forEach(x => { const p = prod(x.c); if (p && out.indexOf(p) < 0) out.push(p); });
  return out.slice(0, 30);
}
/** 상자 QR (?e=XXXXXXXX) 이나 코드 8자리 → 라벨 코드 (옛 etqCodigo — 앱이 만든 QR 만) */
export function etqCodigo(v) { const m = String(v || '').match(/[?&]e=([0-9A-Za-z]{8})(?:[&#]|$)/); return m ? m[1].toUpperCase() : ''; }
export function prodDoQr(v) { const m = String(v || '').match(/[?&]p=([^&#]+)/); return m ? decodeURIComponent(m[1]) : ''; }
export function fotoHTML(p, n) { const u = p && p.foto ? thumb(p.foto, 120) : ''; return u ? '<img src="' + esc(u) + '" alt="" loading="lazy" style="width:' + n + 'px;height:' + n + 'px;object-fit:cover;border-radius:6px">' : svg(ICO.prod, Math.round(n * 0.55)); }
export function miniProdutoHTML(p, n) { const u = p && p.foto ? thumb(p.foto, 120) : ''; return '<span class="pfoto' + (u ? '' : ' vazia') + '" style="width:' + n + 'px;height:' + n + 'px">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy" width="' + n + '" height="' + n + '">' : svg(ICO.imagem, Math.round(n * 0.5))) + '</span>'; }

/* ============================================================
 *  DADOS — etiquetas
 * ============================================================ */
const now = () => new Date().toISOString();
const ALFA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
/** 옛 novo_codigo_etiqueta — 8글자, 이미 있으면 다시 */
export async function novoCodigo(usados) {
  for (let k = 0; k < 50; k++) {
    let c = ''; for (let i = 0; i < 8; i++) c += ALFA[Math.floor(Math.random() * ALFA.length)];
    if (usados && usados.has(c)) continue;
    let tem = null; try { tem = await S.DB.get('etiquetas', c); } catch (e) {}
    if (!tem) { if (usados) usados.add(c); return c; }
  }
  throw new Error('codigo');
}
/** 옛 rpc_listar_etiquetas_produto — 살아 있는 것 먼저, 새것 먼저 */
export async function listarEtiquetas(code) {
  const L = await S.DB.list('etiquetas', { where: [['code', '==', String(code).toUpperCase()]] });
  return L.map(norm).sort((a, b) => (b.ativa - a.ativa) || String(b.criado_em).localeCompare(String(a.criado_em))).slice(0, 100);
}
export async function lerEtiqueta(codigo) { const d = await S.DB.get('etiquetas', String(codigo || '').toUpperCase()); return d ? norm(d) : null; }
/** Firestore 문서 → 옛 앱의 모양 (codigo · sku · nome_produto · qtd_inicial · qtd_restante · criado_em …) */
function norm(d) { return { codigo: d.codigo || d.id, sku: d.code, produto_id: d.code, nome: d.nome || d.code, nome_produto: d.nome || d.code, barcode: d.barcode || '', corredor: d.corredor || '', qtd_inicial: Number(d.qtdInicial) || 0, qtd_restante: Number(d.qtdRestante) || 0, ativa: !!d.ativa, criado_em: d.criadoEm || '', encerrado_em: d.encerradoEm || '' }; }
function etqDoc(codigo, p, q) { return { codigo, code: p.id, nome: p.descricao || p.nome, barcode: p.barcode || '', corredor: p.corredor || '', qtdInicial: q, qtdRestante: q, ativa: true, criadoEm: now(), criadoPor: S.user.email, encerradoEm: '', encerradoPor: '' }; }
function evento(codigo, code, tipo, detalhe) { return { op: 'set', col: 'etqEventos', id: newId('EV'), data: { codigo, code, tipo, detalhe: detalhe || {}, por: S.user.email, porNome: quem(), em: now() } }; }
const fecha = q => q > 0 ? { ativa: true, encerradoEm: '', encerradoPor: '' } : { ativa: false, encerradoEm: now(), encerradoPor: S.user.email };
function exigir() { if (!podeMexer()) throw new Error(L3('재고 담당만 할 수 있습니다.', 'Only stock staff can do this.', 'Só quem mexe no estoque pode fazer isso.')); }
/** 🔁 그 상품의 열린 채우기 요청을 닫는 batch 줄 (옛: 라벨 출고 · 입고가 요청을 닫음) — como: 'baixa' | 'entrada' */
async function repFecha(code, como) {
  let L = []; try { if (S.DB.fresh) S.DB.fresh('reposicao'); L = await S.DB.list('reposicao', { where: [['code', '==', String(code).toUpperCase()]] }); } catch (e) { return []; }
  return L.filter(x => x.status === 'aberta' || x.status === 'iniciada').map(x => ({ op: 'update', col: 'reposicao', id: x.id, data: { status: 'resolvida', resolvidaEm: now(), resolvidaPor: S.user.email, resolvidaPorNome: quem(), resolvidaComo: como } }));
}

/** 옛 aviso entrada_recente — 같은 상품이 24시간 안에 들어온 적이 있으면 묻기 */
export async function entradaRecente(code) {
  let L = []; try { L = await S.DB.list('stockLog', { where: [['code', '==', code]] }); } catch (e) { return null; }
  const desde = Date.now() - 864e5;
  const u = L.filter(x => Number(x.delta) > 0 && x.kind === 'recv' && new Date(x.at).getTime() > desde && !x.estornadoPor).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  if (!u) return null;
  return { aviso: 'entrada_recente', ultima: u.at, ultima_qtd: u.delta, ultima_usuario: u.byName || u.by || '—', horas: Math.round((Date.now() - new Date(u.at).getTime()) / 36e5 * 10) / 10, nome: code };
}
/** 입고 — n 개의 새 상자(각 q) 또는 이미 있는 상자(existente)에 더함. 옛 rpc_entrada_com_etiqueta · rpc_entrada_etiquetas_iguais · rpc_entrada_etiqueta_existente
 *  o.origem · o.ref: stockLog 의 origem · ref (기본 'estoque' · 라벨 코드) · o.marcar(codigos) → 같은 batch 에 더할 문서 (📥 상품 받기의 받은 줄 표시) */
export async function entrada(code, q, o) {
  exigir(); o = o || {}; q = Math.floor(Number(q) || 0); const n = Math.max(1, Math.floor(Number(o.n) || 1));
  if (q <= 0) throw new Error(t('r_qtd_inv'));
  if (n > 50) throw new Error(t('es_etq_n_max'));
  const p = prod(code); if (!p) throw new Error(t('r_sem_produto'));
  if (!o.confirmar) { const r = await entradaRecente(p.id); if (r) return r; }
  const motivo = o.motivo || t('es_entrada');
  if (o.existente) {
    const e = await S.DB.get('etiquetas', o.existente); if (!e || e.code !== p.id) throw new Error(L3('다른 상품의 라벨입니다.', 'That label belongs to another product.', 'Essa etiqueta pertence a outro produto.'));
    if (!e.ativa) throw new Error(L3('이미 닫힌 라벨입니다.', 'That label is already closed.', 'Essa etiqueta já foi encerrada.'));
    const para = (Number(e.qtdRestante) || 0) + q, ini = (Number(e.qtdInicial) || 0) + q;
    const r = await moveStock([{ c: p.id, delta: q, etq: e.codigo || o.existente }], 'recv', o.ref || o.existente, motivo, { vazia: true, origem: o.origem || 'estoque', extra: [{ op: 'update', col: 'etiquetas', id: o.existente, data: { qtdInicial: ini, qtdRestante: para } }, evento(o.existente, p.id, 'entrada', { qtd_somada: q, de: para - q, para })].concat(o.marcar ? o.marcar([o.existente]) : [], await repFecha(p.id, 'entrada')) });
    notarSaldo(p.id, r.saldo[p.id]);
    return { saldo: r.saldo[p.id], codigo: o.existente, codigos: [o.existente], qtd: q, qtd_inicial: ini, qtd_restante: para, sku: p.id, nome: p.descricao, barcode: p.barcode, corredor: p.corredor, existente: true };
  }
  const usados = new Set(), cods = [];
  for (let i = 0; i < n; i++) cods.push(await novoCodigo(usados));
  const extra = [];
  cods.forEach((c, i) => { extra.push({ op: 'set', col: 'etiquetas', id: c, data: etqDoc(c, p, q) }); extra.push(evento(c, p.id, 'criada', Object.assign({ qtd_inicial: q, corredor: p.corredor }, n > 1 ? { lote: (i + 1) + '/' + n } : {}))); });
  if (o.marcar) o.marcar(cods).forEach(x => extra.push(x));   // 📥 상품 받기: 받은 줄 표시를 같은 batch 로
  (await repFecha(p.id, 'entrada')).forEach(x => extra.push(x));
  const r = await moveStock(cods.map((c, i) => ({ c: p.id, delta: q, etq: c, note: n > 1 ? 'etiqueta ' + (i + 1) + '/' + n : '' })), 'recv', o.ref || cods[0], motivo, { vazia: true, origem: o.origem || 'estoque', extra });
  notarSaldo(p.id, r.saldo[p.id]);
  return { saldo: r.saldo[p.id], codigo: cods[0], codigos: cods, etiquetas: n, qtd: q, total: n * q, sku: p.id, nome: p.descricao, barcode: p.barcode, corredor: p.corredor, criado_em: now() };
}
/** 상자에서 출고 — itens [{codigo, qtd}] + semEtq(라벨 없는 재고에서 빼는 수). 옛 rpc_baixar_etiquetas_lote: 창고에서 하는 일이라 모자라면 있는 만큼 (parcial) */
export async function baixarLote(code, itens, semEtq, motivo) {
  exigir(); const p = prod(code); if (!p) throw new Error(t('r_sem_produto'));
  const extra = [], moves = [], seen = new Set();
  for (const it of itens) {
    const cod = String(it.codigo || '').toUpperCase(), q = Math.floor(Number(it.qtd) || 0);
    if (seen.has(cod)) throw new Error(L3('같은 라벨이 두 번 있습니다.', 'The same label appears twice.', 'A mesma etiqueta aparece mais de uma vez na lista.')); seen.add(cod);
    if (q <= 0) continue;
    const e = await S.DB.get('etiquetas', cod); if (!e) throw new Error(L3('라벨 ' + cod + ' 이 없습니다.', 'Label ' + cod + ' not found.', 'Etiqueta ' + cod + ' não encontrada.'));
    if (e.code !== p.id) throw new Error(L3('라벨이 모두 같은 상품이 아닙니다.', 'The labels are not all from the same product.', 'As etiquetas não são todas do mesmo produto.'));
    const tem = Number(e.qtdRestante) || 0;
    if (!e.ativa || tem <= 0) throw new Error(L3('라벨 ' + cod + ' 은 이미 다 나갔습니다.', 'Label ' + cod + ' is already used up.', 'A etiqueta ' + cod + ' já foi totalmente baixada e não vale mais.'));
    if (q > tem) throw new Error(L3('라벨 ' + cod + ' 에는 ' + tem + ' 개만 있습니다.', 'Label ' + cod + ' only has ' + tem + '.', 'A etiqueta ' + cod + ' só tem ' + tem + ' unidade(s) disponível(is).'));
    const resta = tem - q;
    extra.push({ op: 'update', col: 'etiquetas', id: cod, data: Object.assign({ qtdRestante: resta }, fecha(resta)) });
    extra.push(evento(cod, p.id, 'baixa', { qtd: q, de: tem, para: resta }));
    if (!resta) extra.push(evento(cod, p.id, 'encerrada', { motivo: 'baixa' }));
    moves.push({ c: p.id, delta: -q, etq: cod, note: 'etiqueta ' + cod });
  }
  if (semEtq > 0) moves.push({ c: p.id, delta: -Math.floor(semEtq), note: L3('라벨 없는 재고', 'unlabeled stock', 'saldo sem etiqueta') });
  if (!moves.length) throw new Error(t('r_qtd_inv'));
  (await repFecha(p.id, 'baixa')).forEach(x => extra.push(x));
  const r = await moveStock(moves, 'out', moves[0].etq || '', motivo || t('es_saida_motivo'), { partial: true, origem: 'estoque', extra });
  notarSaldo(p.id, r.saldo[p.id]);
  return { baixado: r.pedido, aplicado: r.aplicado, parcial: r.partial, saldo_produto: r.saldo[p.id] };
}
/** 옛 rpc_editar_qtd_etiqueta — 상자 수량 고치기 (이유 필수 · 책상에서 하는 일이라 재고가 모자라면 거절) */
export async function editarQtd(codigo, para, motivo, tipo) {
  exigir(); if (!String(motivo || '').trim()) throw new Error(L3('고치는 이유를 적으세요.', 'Type the reason for the correction.', 'Informe o motivo da correção da caixa.'));
  para = Math.floor(Number(para)); if (!(para >= 0)) throw new Error(t('r_qtd_inv'));
  const e = await S.DB.get('etiquetas', codigo); if (!e) throw new Error(L3('라벨이 없습니다.', 'Label not found.', 'Etiqueta não encontrada.'));
  const de = Number(e.qtdRestante) || 0, delta = para - de;
  const extra = [{ op: 'update', col: 'etiquetas', id: codigo, data: Object.assign({ qtdRestante: para }, fecha(para)) }, evento(codigo, e.code, 'qtd_editada', { de, para, motivo: motivo, motivo_tipo: tipo || 'Other' })];
  if (!para && e.ativa) extra.push(evento(codigo, e.code, 'encerrada', { motivo: 'quantidade zerada na edicao' }));
  if (!delta) { await S.DB.batch(extra); return { saldo: (prod(e.code) || {}).qtd }; }
  if (delta < 0) (await repFecha(e.code, 'baixa')).forEach(x => extra.push(x));   // 손으로 꺼냄 = 출고와 같음 (옛 5FQ) · 늘리는 고침은 닫지 않음
  const r = await moveStock([{ c: e.code, delta, etq: codigo }], 'adj', codigo, L3('상자 수량 수정', 'Box correction', 'Ajuste da caixa/etiqueta') + ' ' + codigo + ' · ' + motivo, { origem: 'estoque', extra, log: { motivoTipo: tipo || 'Other' } });
  notarSaldo(e.code, r.saldo[e.code]);
  return { saldo: r.saldo[e.code] };
}
/** 옛 rpc_excluir_etiqueta — 관리자만 (task) · 남은 수량은 재고에서 빠짐(있는 만큼) · 문서는 지우고 기록(etqEventos)은 남김 */
export async function excluirEtiqueta(codigo, motivo, tipo) {
  exigir(); if (!gerente()) throw new Error(L3('관리자만 삭제할 수 있습니다.', 'Only a manager can delete.', 'Só a gerência pode excluir.'));
  if (!String(motivo || '').trim()) throw new Error(L3('삭제 이유를 적으세요.', 'Type the reason.', 'Informe o motivo da exclusão da caixa.'));
  const e = await S.DB.get('etiquetas', codigo); if (!e) throw new Error(L3('라벨이 없습니다.', 'Label not found.', 'Etiqueta não encontrada.'));
  const q = Number(e.qtdRestante) || 0;
  const extra = [evento(codigo, e.code, 'excluida', { qtd_restante: q, motivo, motivo_tipo: tipo || 'Other', doc: e }), { op: 'del', col: 'etiquetas', id: codigo }];
  if (q > 0) (await repFecha(e.code, 'baixa')).forEach(x => extra.push(x));
  if (q > 0) { const r = await moveStock([{ c: e.code, delta: -q, etq: codigo }], 'adj', codigo, L3('상자 삭제', 'Box deleted', 'Exclusão da caixa/etiqueta') + ' ' + codigo + ' · ' + motivo, { partial: true, origem: 'estoque', extra }); notarSaldo(e.code, r.saldo[e.code]); return { saldo: r.saldo[e.code] }; }
  await S.DB.batch(extra); return { saldo: (prod(e.code) || {}).qtd };
}
/** 옛 rpc_somar_etiquetas2 — 상품 재고는 그대로, 상자 사이에서만 옮김 · manter = 남길 라벨 (없으면 새 라벨) */
export async function somar(codigos, manter) {
  exigir(); const cods = Array.from(new Set(codigos.map(c => String(c).toUpperCase())));
  if (cods.length < 2) throw new Error(t('etqw_somar_min'));
  if (manter && cods.indexOf(manter) < 0) throw new Error('manter');
  let code = null, total = 0, de = 0, corr = '', ref = null; const antigas = [];
  for (const c of cods) {
    const e = await S.DB.get('etiquetas', c); if (!e) throw new Error(c);
    if (!e.ativa || !(Number(e.qtdRestante) > 0)) throw new Error(L3('라벨 ' + c + ' 은 이미 나갔습니다.', 'Label ' + c + ' is already used up.', 'A etiqueta ' + c + ' já foi baixada e não pode ser somada.'));
    if (code && code !== e.code) throw new Error(L3('같은 상품의 라벨만 합칠 수 있습니다.', 'Only labels of the same product can be merged.', 'Só dá para somar etiquetas do mesmo produto.'));
    code = e.code; ref = ref || e; total += Number(e.qtdRestante) || 0;
    if (c === manter) { de = Number(e.qtdRestante) || 0; corr = e.corredor || ''; } else antigas.push({ codigo: c, qtd: Number(e.qtdRestante) || 0 });
  }
  const p = prod(code) || { id: code, descricao: ref.nome, barcode: ref.barcode, corredor: ref.corredor };
  const ops = []; let dest = manter;
  if (!manter) { dest = await novoCodigo(); const d = etqDoc(dest, p, total); d.corredor = ref.corredor || p.corredor || ''; ops.push({ op: 'set', col: 'etiquetas', id: dest, data: d }, evento(dest, code, 'criada', { qtd_inicial: total, somada_de: antigas })); }
  else ops.push({ op: 'update', col: 'etiquetas', id: dest, data: { qtdInicial: total, qtdRestante: total } }, evento(dest, code, 'qtd_editada', { de, para: total, motivo: 'Caixas somadas', somada_de: antigas }));
  antigas.forEach(x => { ops.push({ op: 'update', col: 'etiquetas', id: x.codigo, data: Object.assign({ qtdRestante: 0 }, fecha(0)) }, evento(x.codigo, code, 'encerrada', { motivo: 'Somada em ' + dest, qtd: x.qtd })); });
  await S.DB.batch(ops);
  return { codigo: dest, mantida: !!manter, qtd: total, antigas };
}
/** 옛 rpc_dividir_etiqueta — o.qtd (새 상자로 옮길 수) · o.partes (똑같이 N 개) · o.porCaixa (상자마다 N) 중 하나. 원래 라벨이 남은 것을 가짐 */
export async function dividir(codigo, o) {
  exigir(); const e = await S.DB.get('etiquetas', codigo); if (!e) throw new Error(codigo);
  const saldo = Number(e.qtdRestante) || 0;
  if (!e.ativa || saldo <= 0) throw new Error(L3('이미 나간 라벨은 나눌 수 없습니다.', 'This label is used up and cannot be divided.', 'Esta etiqueta já foi baixada e não pode ser dividida.'));
  if (saldo < 2) throw new Error(t('etqw_div_uma_un'));
  let novas = [], fica, partes;
  if (o.qtd != null) { const v = Math.floor(o.qtd); if (v <= 0 || v >= saldo) throw new Error(t('etqw_div_erro_maior', { n: numFmt(saldo) })); novas = [v]; fica = saldo - v; partes = 2; }
  else if (o.porCaixa != null) { const v = Math.floor(o.porCaixa); if (v <= 0 || v >= saldo) throw new Error(t('etqw_div_erro_maior', { n: numFmt(saldo) })); partes = Math.ceil(saldo / v); if (partes > 20) throw new Error(t('etqw_div_erro_20')); fica = saldo - (partes - 1) * v; for (let i = 1; i < partes; i++) novas.push(v); }
  else { partes = Math.floor(o.partes); if (partes < 2) throw new Error(t('etqw_div_erro_2')); if (partes > saldo) throw new Error(t('etqw_div_erro_maior', { n: numFmt(saldo) })); if (partes > 20) throw new Error(t('etqw_div_erro_20')); const b = Math.floor(saldo / partes); fica = b + (saldo - b * partes); for (let i = 1; i < partes; i++) novas.push(b); }
  const p = prod(e.code) || { id: e.code, descricao: e.nome, barcode: e.barcode, corredor: e.corredor }, usados = new Set([codigo]), ops = [], feitas = [];
  for (const q of novas) { const c = await novoCodigo(usados); const d = etqDoc(c, p, q); d.corredor = e.corredor || ''; d.nome = e.nome || d.nome; ops.push({ op: 'set', col: 'etiquetas', id: c, data: d }, evento(c, e.code, 'criada', { qtd_inicial: q, corredor: e.corredor || '', dividida_de: codigo })); feitas.push({ codigo: c, qtd: q }); }
  ops.push({ op: 'update', col: 'etiquetas', id: codigo, data: { qtdRestante: fica, qtdInicial: fica } }, evento(codigo, e.code, 'dividida', { partes, fica, codigos_filhos: feitas.map(x => x.codigo) }));
  await S.DB.batch(ops);
  return { codigo, partes, fica, novas: feitas };
}
/** 라벨 없는 재고 ± (옛 rpc_ajustar_estoque — 책상에서: 모자라면 거절) */
export async function ajusteDireto(code, delta, motivo) {
  exigir(); const extra = delta > 0 ? await repFecha(code, 'entrada') : [];
  const r = await moveStock([{ c: code, delta }], delta > 0 ? 'recv' : 'out', '', motivo || t('es_saida_motivo'), { origem: 'estoque', vazia: delta > 0, extra });
  notarSaldo(code, r.saldo[code]); return { saldo: r.saldo[code] };
}
/** 통로 옮기기 — items.js 의 📍 위치 바꾸기와 같은 길 (editCatalog + setLoc) */
export async function definirCorredor(codes, corr) {
  exigir(); await editCatalog(S, rows => setLoc(rows, codes, corr)); notarCorredor(codes, corr);
}

/** 🔎 확인(옛 rpc_rechecagem_resolver) — 센 수량을 재고에 (stockLog kind 'count' · 이유 Physical Count)
 *  o.caixas [{codigo, qtd}] = 상자마다 센 수 (+ o.nova 상자 밖 낱개 → 새 상자) · 재고 = 합 / 아니면 o.qtd = 라벨 없는 재고의 센 수
 *  o.fechar(결과) → 같은 batch 에 넣을 요청 닫기 줄 · 상자는 다시 읽어 확인 (다른 상품 · 닫힘 · 세는 동안 들어온 상자는 거절) */
export async function conferir(code, o) {
  exigir(); code = String(code).toUpperCase(); const p = prod(code) || { id: code, descricao: code, barcode: '', corredor: '' };
  if (S.DB.fresh) { S.DB.fresh('stock'); S.DB.fresh('etiquetas'); }
  const st = await S.DB.get('stock', code), antes = st ? Number(st.qty) || 0 : 0, ops = [];
  let depois, mudou = 0, nova = Math.floor(Number(o.nova) || 0), novaCod = '';
  if (nova < 0) throw new Error(t('r_qtd_inv'));
  if (o.caixas) {
    const vistos = []; let soma = 0;
    for (const c of o.caixas) {
      const cod = String(c.codigo || '').toUpperCase(), q = Math.floor(Number(c.qtd));
      if (!cod || vistos.indexOf(cod) >= 0) throw new Error(L3('같은 라벨이 두 번 있습니다.', 'The same label appears twice.', 'A caixa ' + cod + ' veio duas vezes.'));
      if (!(q >= 0)) throw new Error(L3('수량이 맞지 않습니다: ' + cod, 'Invalid quantity: ' + cod, 'Quantidade inválida na caixa ' + cod + '.'));
      const e = await S.DB.get('etiquetas', cod);
      if (!e) throw new Error(L3('라벨 ' + cod + ' 이 없습니다.', 'Label ' + cod + ' not found.', 'A caixa ' + cod + ' não existe.'));
      if (e.code !== code) throw new Error(L3('다른 상품의 라벨입니다: ' + cod, 'Label ' + cod + ' belongs to another product.', 'A caixa ' + cod + ' é de outro produto.'));
      if (!e.ativa) throw new Error(L3('라벨 ' + cod + ' 은 이미 닫혔습니다. 다시 여세요.', 'Label ' + cod + ' was closed. Open the count again.', 'A caixa ' + cod + ' já foi encerrada. Abra a conferência de novo.'));
      vistos.push(cod); soma += q; const de = Number(e.qtdRestante) || 0;
      if (q !== de) { mudou++; ops.push({ op: 'update', col: 'etiquetas', id: cod, data: Object.assign({ qtdRestante: q }, fecha(q)) }, evento(cod, code, 'qtd_editada', { de, para: q, motivo: o.motivo || 'Conferência', motivo_tipo: 'Physical Count' })); if (!q) ops.push(evento(cod, code, 'encerrada', { motivo: 'zerada na conferência' })); }
    }
    const faltou = (await S.DB.list('etiquetas', { where: [['code', '==', code]] })).filter(e => e.ativa && vistos.indexOf(e.codigo || e.id) < 0).map(e => e.codigo || e.id);
    if (faltou.length) throw new Error(L3('세는 동안 상자 ' + faltou.join(', ') + ' 이 들어왔습니다. 닫고 다시 여세요.', 'Box ' + faltou.join(', ') + ' came in while you were counting. Close and open the count again.', 'A caixa ' + faltou.join(', ') + ' entrou enquanto você conferia. Feche e abra a conferência de novo.'));
    if (nova > 0) { novaCod = await novoCodigo(new Set(vistos)); const d = etqDoc(novaCod, p, nova); ops.push({ op: 'set', col: 'etiquetas', id: novaCod, data: d }, evento(novaCod, code, 'criada', { qtd_inicial: nova, corredor: p.corredor || '', motivo: 'achada fora de caixa na conferência' })); }
    depois = soma + nova;
  } else {
    if (nova) throw new Error(L3('상자 밖 낱개는 상자별 확인에서만.', 'Loose pieces only in a box-by-box count.', 'Peças fora de caixa só entram na conferência por caixa.'));
    depois = Math.floor(Number(o.qtd)); if (!(depois >= 0)) throw new Error(t('r_qtd_inv'));
  }
  const delta = depois - antes, ajustado = !!(delta || mudou || nova || o.mudouOutro);
  if (delta > 0) (await repFecha(code, 'entrada')).forEach(x => ops.push(x));   // + 실사 = 들어온 것 (옛 트리거: Entrada)
  const res = { antes, depois, delta, ajustado, caixasAlteradas: mudou, novaEtiqueta: novaCod };
  if (o.fechar) ops.push(o.fechar({ resultado: ajustado ? 'ajustado' : 'confirmado', qtdAntes: antes, contado: depois, ajuste: delta, caixasAlteradas: mudou, novaEtiqueta: novaCod }));
  if (delta) { const r = await moveStock([{ c: code, delta }], 'count', o.ref || '', o.motivo || 'Conferência', { origem: 'conferencia', vazia: delta > 0, extra: ops, log: { motivoTipo: 'Physical Count', contado: depois } }); notarSaldo(code, r.saldo[code]); res.depois = r.saldo[code]; }
  else if (ops.length) await S.DB.batch(ops);
  return res;
}

/* ---------- 내 움직임 · 되돌리기(estorno) ---------- */
/** 최근 움직임 200 줄에서 내 것만 (Firestore 복합 색인 없이) */
export async function minhasMovs(max) {
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  let L = []; try { L = await S.DB.list('stockLog', { where: [['at', '>=', desde]], order: ['at', 'desc'], limit: 300 }); } catch (e) { L = await S.DB.list('stockLog', { where: [['by', '==', S.user.email]] }); }
  return L.filter(x => x.by === S.user.email).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, max || 20);
}
/** 옛 rpc_estornar_movimentacao — 관리자는 언제나 · 담당자는 내 것 48시간 안 · 아니면 'estorno_outro' · 'estorno_prazo' 로 거절 (화면이 요청을 권함) */
export async function estornar(movId, motivo, tipo, aprovado) {
  exigir(); motivo = String(motivo || '').trim(); if (!motivo) throw new Error(L3('이유를 적으세요.', 'Type the reason.', 'Informe o motivo do estorno.'));
  const m = await S.DB.get('stockLog', movId); if (!m) throw new Error('mov');
  if (!gerente() && !aprovado) {
    if (m.by !== S.user.email) { const e = new Error(L3('다른 사람이 입력한 움직임입니다.', 'This movement was recorded by someone else.', 'Esta movimentação foi lançada por outra pessoa.')); e.detail = 'estorno_outro'; throw e; }
    if (Date.now() - new Date(m.at).getTime() > 48 * 36e5) { const e = new Error(L3('48시간이 지났습니다.', 'More than 48 hours have passed.', 'Passou de 48 horas do lançamento.')); e.detail = 'estorno_prazo'; throw e; }
  }
  if (!Number(m.delta)) throw new Error(L3('수량이 바뀌지 않은 움직임입니다.', 'This movement did not change stock.', 'Esta movimentação não mexeu em saldo.'));
  if (m.estornadoPor) throw new Error(L3('이미 되돌린 움직임입니다.', 'Already reversed.', 'A movimentação já foi estornada.'));
  if (m.estorna) throw new Error(L3('되돌림을 다시 되돌릴 수 없습니다.', 'A reversal cannot be reversed.', 'Esta movimentação já é um estorno.'));
  const extra = [];
  if (m.etq) {
    const e = await S.DB.get('etiquetas', m.etq);
    if (!e) throw new Error(L3('이 움직임의 라벨 ' + m.etq + ' 이 더 이상 없습니다. 이유를 적고 조정하세요.', 'Label ' + m.etq + ' no longer exists. Use an adjustment with a reason.', 'A etiqueta ' + m.etq + ' desta movimentação não existe mais. Use um ajuste com motivo.'));
    const de = Number(e.qtdRestante) || 0, para = de - Number(m.delta);
    if (para < 0) throw new Error(L3('라벨 ' + m.etq + ' 에 ' + de + ' 개뿐입니다 — 상자가 그 뒤에 바뀌었습니다.', 'Label ' + m.etq + ' has ' + de + ' — the box changed since.', 'A etiqueta ' + m.etq + ' tem ' + de + ' un — a caixa mudou desde esta movimentação.'));
    extra.push({ op: 'update', col: 'etiquetas', id: m.etq, data: Object.assign({ qtdRestante: para }, fecha(para)) }, evento(m.etq, m.code, 'qtd_editada', { de, para, motivo: motivo + ' · estorno', movId }));
  }
  const id = movId;
  const r = await moveStock([{ c: m.code, delta: -Number(m.delta), etq: m.etq || '', log: { estorna: id, motivoTipo: tipo || 'Data Correction' } }], 'est', id, motivo + ' · ' + L3('되돌림', 'reversal', 'estorno da movimentação'), { origem: 'estoque', extra });
  const novo = r.rows[0] && r.rows[0].id;
  await S.DB.update('stockLog', id, { estornadoPor: novo || 'x' });
  notarSaldo(m.code, r.saldo[m.code]);
  return { saldo: r.saldo[m.code], movimentacao_id: novo };
}
export async function estornoPedir(movId, motivo, tipo) {
  motivo = String(motivo || '').trim(); if (!motivo) throw new Error(L3('이유를 적으세요.', 'Type the reason.', 'Informe o motivo do pedido de estorno.'));
  const m = await S.DB.get('stockLog', movId); if (!m) throw new Error('mov');
  if (m.estornadoPor) throw new Error(L3('이미 되돌린 움직임입니다.', 'Already reversed.', 'A movimentação já foi estornada.'));
  const ab = await S.DB.list('estornos', { where: [['movId', '==', movId]] });
  if (ab.some(x => x.status === 'aberto')) throw new Error(L3('이미 열린 요청이 있습니다.', 'There is already an open request.', 'Já existe um pedido aberto para esta movimentação.'));
  const id = newId('ES');
  await S.DB.set('estornos', id, { movId, code: m.code, delta: Number(m.delta) || 0, etq: m.etq || '', motivo, motivoTipo: tipo || 'Other', por: S.user.email, porNome: quem(), em: now(), status: 'aberto' });
  return { id };
}
export async function estornoFila() { try { return (await S.DB.list('estornos', { where: [['status', '==', 'aberto']] })).sort((a, b) => String(a.em).localeCompare(String(b.em))); } catch (e) { return []; } }
export async function estornoResolver(id, aprovar, resposta) {
  if (!gerente()) throw new Error(L3('관리자만 할 수 있습니다.', 'Managers only.', 'Só a gerência.'));
  const s = await S.DB.get('estornos', id); if (!s || s.status !== 'aberto') throw new Error(L3('이미 처리된 요청입니다.', 'Already resolved.', 'O pedido já foi resolvido.'));
  let mov = '';
  if (aprovar) { const r = await estornar(s.movId, s.motivo, s.motivoTipo, true); mov = r.movimentacao_id || ''; }
  await S.DB.update('estornos', id, { status: aprovar ? 'aprovado' : 'recusado', resposta: String(resposta || '').trim(), resolvidoPor: S.user.email, resolvidoEm: now(), estornoMov: mov });
}

/* ============================================================
 *  ETIQUETAS — desenho (옛 etiquetaHTML · etiquetaEstoque3HTML · etiquetaPickingHTML · etiquetaPicking64HTML)
 * ============================================================ */
let QR_P = null;
export function loadQr() { if (window.qrcode) return Promise.resolve(); if (QR_P) return QR_P; QR_P = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = res; s.onerror = () => { QR_P = null; rej(new Error('qr')); }; document.head.appendChild(s); }); return QR_P; }
export async function prepararImpressao() { try { await Promise.all([loadQr(), loadJsBarcode()]); } catch (e) {} }
export function qrSVG(v) { try { const q = window.qrcode(0, 'M'); q.addData(String(v)); q.make(); return q.createSvgTag({ cellSize: 4, margin: 1, scalable: true }); } catch (e) { return '<div class="etq-erro">' + esc(String(v)) + '</div>'; } }
const base = () => { try { return location.origin + location.pathname; } catch (e) { return ''; } };
export const etqLink = cod => base() + '?e=' + cod;
export const linkProduto = p => base() + '?p=' + encodeURIComponent(p.sku || p.nome || p.id);
const nomeEtq = x => String(x && (x.nome || x.nome_produto) || '').trim() || String(x && x.sku || x.codigo || '');
const skuEtq = x => String(x && (x.sku || x.produto_id) || '').trim() || nomeEtq(x);
const nomeLongoEtq = x => { const n = nomeEtq(x), c = skuEtq(x); return normCod(n) === normCod(c) ? '' : n; };
const codigoProdutoEtq = x => codEtq(skuEtq(x));
const etqQtdHTML = (x, cls) => { const n = x && (x.qtd_restante != null ? x.qtd_restante : x.qtd_inicial != null ? x.qtd_inicial : x.qtd); return n == null || n === '' ? '' : '<span class="' + cls + '">' + esc(te('etq_qtd_rot')) + ' <b>' + esc(numFmt(n)) + '</b></span>'; };
const descEtq = p => { const d = String(p && p.descricao || '').trim(); if (d) return d; const n = String(p && p.nome || '').trim(), c = String(p && p.sku || '').trim(); return n && normCod(n) !== normCod(c) ? n : ''; };
const barras = (v, h, fs) => barcodeSvg(v, { h, w: h > 60 ? 3 : 2, fs, text: true });
/** 상자 라벨 6×4 (QR ?e=) */
export function etiquetaHTML(x) {
  return '<div class="etqc" data-qr="' + esc(etqLink(x.codigo)) + '"><div class="etqc-esq"><div class="etqc-qr">' + qrSVG(etqLink(x.codigo)) + '</div><div class="etqc-track">' + esc(te('etq_codigo')) + ': ' + esc(x.codigo || '') + '</div></div><div class="etqc-dir"><div class="etqc-topo"><span>' + esc(te('marca')) + '</span><span>' + esc(te('etq_criada_em')) + ' ' + esc(dataBR(x.criado_em || now())) + '</span></div><div class="etqc-cod"><span>' + esc(codigoProdutoEtq(x)) + '</span></div><div class="etqc-nome">' + esc(nomeLongoEtq(x) || codigoProdutoEtq(x)) + '</div><div class="etqc-rod"><span class="etqc-bc">' + esc(x.barcode || '') + '</span>' + etqQtdHTML(x, 'etqc-qtd') + '</div></div></div>';
}
/** 상자 라벨 3×1.5 (QR ?e=) */
export function etiquetaEstoque3HTML(x) {
  const nome = nomeLongoEtq(x);
  return '<div class="etq3" data-qr="' + esc(etqLink(x.codigo)) + '"><div class="etq3-qr">' + qrSVG(etqLink(x.codigo)) + '</div><div class="etq3-dir"><div class="etq3-cod"><span>' + esc(codigoProdutoEtq(x)) + '</span></div>' + (nome ? '<div class="etq3-desc">' + esc(nome) + '</div>' : '') + '<div class="etq3-rot">' + esc(te('etq_codigo')) + ' ' + esc(x.codigo || '') + etqQtdHTML(x, 'etq3-qtd') + '</div></div></div>';
}
/** 피킹 박스 라벨 3×1.5 (바코드 + QR ?p= — 조회만) */
export function etiquetaPickingHTML(p) {
  const bc = barras(p.barcode, 34, 9), desc = descEtq(p);
  return '<div class="etq3 pick" data-qr="' + esc(linkProduto(p)) + '"><div class="etq3-esq"><div class="etq3-qr">' + qrSVG(linkProduto(p)) + '</div></div><div class="etq3-dir"><div class="etq3-cod"><span>' + esc(codEtq(p.sku || p.nome || '')) + '</span></div>' + (desc ? '<div class="etq3-desc">' + esc(desc) + '</div>' : '') + '<div class="etq3-bc">' + (bc || '<div class="etq3-nobc">' + esc(te('etp_sem_barcode')) + '</div>') + '</div></div></div>';
}
/** 피킹 박스 라벨 6×4 · 4.25×4 */
export function etiquetaPicking64HTML(p, p44) {
  const corr = corrFmt(p.corredor || ''), bc = barras(p.barcode, 110, 17);
  return '<div class="etqp pick' + (p44 ? ' p44' : '') + '" data-qr="' + esc(linkProduto(p)) + '"><div class="etqp-esq"><div class="etqp-topo">' + esc(te('marca')) + '</div><div class="etqp-bc">' + (bc || '<div class="etqp-nobc">' + esc(te('etp_sem_barcode')) + '</div>') + '</div><div class="etqp-cod"><span>' + esc(codEtq(p.sku || p.nome || '')) + '</span></div><div class="etqp-desc">' + esc(descEtq(p)) + '</div></div><div class="etqp-dir"><div class="etqp-qr">' + qrSVG(linkProduto(p)) + '</div>' + (corr ? '<div class="etqp-corr">' + esc(te('r_corredor')) + '<br><b>' + esc(corr) + '</b></div>' : '') + '</div></div>';
}
/** 옛 ajustarEtiquetas — 코드 글자를 칸에 맞게 줄임 (보이는 상태에서) */
export function ajustarEtiquetas(root) {
  (root || document).querySelectorAll('.etqp-cod, .etqc-cod, .etq3-cod').forEach(c => {
    const s = c.firstChild; if (!s || !s.style || !c.clientWidth) return;
    let a = c.classList.contains('etqc-cod') ? 92 : c.classList.contains('etq3-cod') ? (c.closest('.pick') ? 64 : 78) : 112;
    s.style.fontSize = a + 'px';
    for (let o = 0; a > 13 && o++ < 150 && (s.scrollWidth > c.clientWidth + 1 || s.scrollHeight > c.clientHeight + 1);) { a -= 2; s.style.fontSize = a + 'px'; }
  });
}
/** 인쇄 — 옛 앱의 인쇄 에이전트 대신 브라우저 인쇄. 크기는 CSS @page (etq64 · etq3 · etq44) */
export async function imprimirLabels(html) {
  await prepararImpressao(); injetarCss();
  printOpen('<div class="etq-lote">' + html() + '</div>');
  requestAnimationFrame(() => ajustarEtiquetas($('prtbody')));
}
/** 상자 라벨 묶음 — tam '64' | '3' */
export function imprimirCaixas(lista, tam) { return imprimirLabels(() => lista.map(String(tam) === '3' ? etiquetaEstoque3HTML : etiquetaHTML).join('')); }

/* ---------- 마지막 크기 (옛 etqTamUltimo — 이 기기에) ---------- */
export const etqTamUltimo = () => { try { return localStorage.getItem('theone.etqTam') === '3' ? '3' : '64'; } catch (e) { return '64'; } };
export const etqTamGuardar = v => { try { localStorage.setItem('theone.etqTam', String(v) === '3' ? '3' : '64'); } catch (e) {} };

/* ============================================================
 *  창 (옛 abrirModal · modalCard) — .sb 안에 .modal.show > .modal-card
 * ============================================================ */
export function abrirModal(html, cls) {
  fecharModal(); injetarCss();
  const w = document.createElement('div'); w.className = 'sb es-mw'; w.style.cssText = 'position:fixed;inset:0;z-index:180;padding:0;margin:0;min-height:0;background:transparent';
  w.innerHTML = '<div class="modal show' + (cls ? ' ' + cls : '') + '"><div class="modal-card" id="esModalCard">' + html + '</div></div>';
  document.body.appendChild(w);
  w.addEventListener('click', e => { if (e.target.closest('[data-act="fechar-modal"]')) fecharModal(); });
  return w;
}
export function fecharModal() { document.querySelectorAll('.es-mw').forEach(x => x.remove()); }
export const modalAberto = () => !!document.querySelector('.es-mw');
const MOTIVOS = [['Physical Count', 'Contagem física', 'Physical count', '실사'], ['Damage', 'Avaria', 'Damage', '파손'], ['Loss', 'Perda', 'Loss', '분실'], ['Found Inventory', 'Achado no estoque', 'Found inventory', '찾음'], ['Receiving Correction', 'Correção de recebimento', 'Receiving correction', '입고 정정'], ['Data Correction', 'Correção de digitação', 'Data correction', '입력 정정'], ['Other', 'Outro', 'Other', '기타']];
/** 옛 pedirMotivoEtiqueta — 이유 종류 + 글 (둘 다 필수) */
export function pedirMotivo(cfg) {
  return new Promise(res => {
    const w = abrirModal('<div class="modal-head"><h2>' + esc(cfg.titulo) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body">' + (cfg.texto ? '<p style="margin:0 0 12px">' + esc(cfg.texto) + '</p>' : '') +
      '<div class="field"><label>' + esc(L3('이유 종류', 'Reason type', 'Tipo de motivo')) + '</label><select class="flt" id="esMotTipo" style="width:100%">' + MOTIVOS.map(m => '<option value="' + m[0] + '"' + (m[0] === (cfg.tipo || 'Other') ? ' selected' : '') + '>' + esc(L3(m[3], m[2], m[1])) + '</option>').join('') + '</select></div>' +
      '<div class="field" style="margin-top:10px"><label>' + esc(L3('이유', 'Reason', 'Motivo')) + '</label><input id="esMot" autocomplete="off" style="width:100%"></div></div>' +
      '<div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button><button class="btn ' + (cfg.perigo ? 'perigo danger' : 'primary') + '" id="esMotOk">' + esc(cfg.sim || t('salvar')) + '</button></div>');
    const inp = w.querySelector('#esMot'); try { inp.focus(); } catch (e) {}
    const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return toast(L3('이유를 적으세요.', 'Type the reason.', 'Informe o motivo.'), 'bad'); } const tp = w.querySelector('#esMotTipo').value; fecharModal(); res({ motivo: v, tipo: tp }); };
    w.querySelector('#esMotOk').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    w.addEventListener('click', e => { if (e.target.closest('[data-act="fechar-modal"]')) res(null); });
  });
}
/** 옛 pergunta() — 예 / 아니요 (+ html) */
export function pergunta(cfg) {
  return new Promise(res => {
    const w = abrirModal('<div class="modal-head"><h2>' + esc(cfg.titulo) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body">' + (cfg.texto ? '<p style="margin:0 0 10px">' + esc(cfg.texto) + '</p>' : '') + (cfg.html || '') + (cfg.campo ? '<input id="esPergCampo" autocomplete="off" style="width:100%" placeholder="' + esc(cfg.campoPh || '') + '">' : '') + '</div>' +
      '<div class="modal-foot"><button class="btn" data-act="fechar-modal" id="esPergNao">' + esc(cfg.nao || t('cancelar')) + '</button><button class="btn ' + (cfg.perigo ? 'perigo danger' : 'primary') + '" id="esPergSim">' + esc(cfg.sim || 'OK') + '</button></div>', cfg.cls);
    w.querySelector('#esPergSim').onclick = () => { const c = w.querySelector('#esPergCampo'); const extra = cfg.ler ? cfg.ler(w) : null; fecharModal(); res({ ok: true, campo: c ? c.value : '', extra }); };
    w.addEventListener('click', e => { if (e.target.closest('[data-act="fechar-modal"]')) res(null); });
  });
}

/* ============================================================
 *  QUAL TAMANHO (옛 escolherTamanhoEtqEstoque) — 입고 뒤에는 초록 영수증 + "인쇄하지 않고 닫기"
 * ============================================================ */
export async function escolherTamanho(lista, entrada) {
  lista = (lista || []).filter(Boolean); if (!lista.length) return;
  await prepararImpressao();
  const ult = etqTamUltimo(), n = lista.length;
  const recibo = entrada && entrada.saldo != null ? '<div class="aviso gravado" style="margin:0 0 14px">' + svg(ICO.check, 17) + '<div><b>' + esc(t('es_ok_e') + ' ' + numFmt(entrada.saldo)) + '</b>' + esc(entrada.qtd ? t('etq_ent_entrou', { n: numFmt(entrada.qtd) }) : t('etq_ent_gravada')) + '</div></div>' : '';
  const w = abrirModal('<div class="modal-head"><h2>' + esc(t('etq_tam_tit')) + '</h2><button class="x" data-act="' + (recibo ? 'etq-tam-fechar' : 'fechar-modal') + '">' + svg(ICO.x, 17) + '</button></div>' +
    '<div class="modal-body">' + recibo + '<div class="aviso" style="margin:0 0 14px">' + svg(ICO.ajuda, 16) + '<div>' + esc(n > 1 ? t('etq_tam_n', { n: numFmt(n) }) : t('etq_tam_uma')) + '</div></div>' +
    (n === 1 ? '<div class="etq-previa etq-previa-min">' + etiquetaHTML(lista[0]) + '</div>' : '') +
    '<div class="etq-tam-ops"><button type="button" class="btn etq-tam-op' + (ult === '64' ? ' on' : '') + '" data-act="etq-tam-est-64">' + svg(ICO.etiq, 20) + '<b>' + esc(t('etq_tam_64')) + '</b><span>' + esc(t('etq_tam_64_sub')) + '</span></button>' +
    '<button type="button" class="btn etq-tam-op' + (ult === '3' ? ' on' : '') + '" data-act="etq-tam-est-3">' + svg(ICO.etiq, 20) + '<b>' + esc(t('etq_tam_3')) + '</b><span>' + esc(t('etq_tam_est3_sub')) + '</span></button></div>' +
    '<div class="hint" style="margin-top:11px">' + esc(t('etq_tam_dica')) + '</div></div>' +
    '<div class="modal-foot"><button class="btn" style="margin-left:auto" data-act="' + (recibo ? 'etq-tam-fechar' : 'fechar-modal') + '">' + esc(recibo ? t('etq_sem_imprimir') : t('cancelar')) + '</button></div>');
  requestAnimationFrame(() => ajustarEtiquetas(w));
  return new Promise(res => {
    w.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
      if (a === 'etq-tam-fechar') { fecharModal(); toast(t('es_ok_e') + ' ' + numFmt(entrada.saldo) + ' · ' + t('etq_nao_impressa'), 'good'); return res(null); }
      if (a === 'fechar-modal') return res(null);
      if (a === 'etq-tam-est-64' || a === 'etq-tam-est-3') { const tam = a === 'etq-tam-est-3' ? '3' : '64'; etqTamGuardar(tam); fecharModal(); imprimirCaixas(lista, tam); res(tam); }
    });
  });
}
