/* ============================================================
 *  🧾 발주서 (#/pocompra) — 옛 THE ONE CORP WMS 의 "Pedidos de Compra" 화면을 그대로 (telaPedidosCompra · pco*)
 *    목록 (상태 칩 · 번호 · 공장 · 안에 든 상품 찾기) → 서랍: 보냄으로 표시 · 받은 수량(누적) · 고치기(이력 남김) · 취소 · PDF
 *    보냄으로 표시하면 설정에 "자동" 이 켜져 있을 때 발주서 PDF 를 메일로 (옛 pcmEnviarPedido)
 *  옛 Supabase RPC 를 Firestore 에서 그대로 (이 파일 아래 "자료"):
 *    rpc_pedido_compra_gerar(p_itens, p_chave) → gerarPedidos  — 공장마다 하나 · 같은 chave 면 이미 만든 것을 돌려줌 (repetido)
 *    rpc_pedido_compra_enviar · _receber · _cancelar · _editar → enviar · receber · cancelar · editar
 *  purchaseOrders/{id} = { id, numero:'PC-2026-000001', fornecedor_id(공장 코드), fornecedor, status: rascunho|enviado|recebido_parcial|recebido|cancelado,
 *                          observacao, criado_por, criado_por_nome, criado_em, enviado_em, enviado_por_nome, previsao_em, recebido_em, cancelado_em, cancelado_por,
 *                          chave_geracao, itens:[{ id, produto_id, sku, nome, qtd_recomendada, qtd, qtd_recebida, unidade, un_por_caixa,
 *                                                  removido_em, removido_por, removido_por_nome, removido_motivo }],
 *                          eventos:[{ id, tipo: editado|item_removido|item_qtd, dados, motivo, usuario_nome, criado_em }] }
 *    · 번호 = PC-연도-6자리 (counters/po.n — 해마다 다시 시작하지 않음, 옛 pedido_compra_numero_seq 와 같게)
 *    · 받음(qtd_recebida)은 "지금까지 모두" — 재고는 바꾸지 않음 (입고는 📦 재고 / 📥 상품 받기)
 *    · 고친 줄은 지우지 않고 removido_* 로 표시 (기록) — 합계 · 오는 중 · PDF 에서만 빠짐 (pcoVivos)
 *  poCusto/{poId} = { c: { [itemId]: 단가 } }  — 단가는 원가(prodCusto)처럼 관리자 · 오너만 (옛 custo_unit). 만든 사람이 원가를 못 보면 빈칸
 *  planCfg/mail = { emails, assunto, texto, auto:'1'|'0' } — 옛 compras_config (⚙️ 설정의 메일 칸)
 *  메일: notifyq { kind:'poMail', to:[...], subject, text, atts:[{ name, type, b64 }] } → apps-script/Code.gs (첨부 지원 — Apps Script 반영 필요)
 * ============================================================ */
import { $, esc, Router, printOpen } from './ui.js';
import { newId } from './db.js';
import * as B from './plan-base.js';

const { t, ti, te, tie, tiu, numFmt, brl, dataBR, dataEN, horaCurta, ICO, svg, pcuSigla, pcuCaixa, pcuSiglaConj, pcuQtd, pcuNumHTML, pcuSufHTML, pcpCmpSku, pcoVivos, pcoBadge, aviso } = B;
let S = null;
export function register(state) {
  S = state; B.init(state); Router.on('pocompra', page);
  Router.up.pocompra = () => { if (B.drawerAberto()) { fecharPO(); return true; } return false; };
  Router.upHas.pocompra = () => B.drawerAberto();
}
export const PCO_ST = ['rascunho', 'enviado', 'recebido_parcial', 'recebido', 'cancelado'];
const PO = { st: '', busca: '', sel: null, ed: false, edRm: {}, edMot: '', edQtd: {} };
let LISTA = null, ERRO = null, CUSTOS = {}, PCO_BUSCA_T = null;

/* ============================================================
 *  자료 (옛 RPC · 뷰)
 * ============================================================ */
const agora = () => new Date().toISOString();
const quemNome = () => B.quem();
/** 옛 v_pedidos_compra 의 계산 칸 */
export function derivar(p, custos) {
  const vivos = pcoVivos(p.itens), c = (custos || {})[p.id] || null;
  const o = Object.assign({}, p);
  o.n_itens = vivos.length; o.pecas = vivos.reduce((a, i) => a + (Number(i.qtd) || 0), 0); o.pecas_recebidas = vivos.reduce((a, i) => a + (Number(i.qtd_recebida) || 0), 0);
  o.n_removidos = (p.itens || []).length - vivos.length;
  o.itens = (p.itens || []).map(i => { const cu = c && c[i.id] != null ? Number(c[i.id]) : null; return Object.assign({}, i, { custo_unit: cu, subtotal: cu == null ? 0 : Math.round((Number(i.qtd) || 0) * cu * 100) / 100 }); });
  o.total = pcoVivos(o.itens).reduce((a, i) => a + i.subtotal, 0);
  return o;
}
export async function listarPOs() {
  const L = await S.DB.list('purchaseOrders');
  CUSTOS = {};
  if (B.custoVisivel()) { try { (await S.DB.list('poCusto')).forEach(r => { CUSTOS[r.id] = r.c || {}; }); } catch (e) {} }
  return L.map(p => derivar(p, CUSTOS)).sort((a, b) => String(b.criado_em || '').localeCompare(String(a.criado_em || '')));
}
const pecaErro = msg => { const e = new Error(msg); e.pco = true; return e; };
async function lerPO(id) { const p = await S.DB.get('purchaseOrders', id); if (!p) throw pecaErro(t('pco_erro_acao')); return p; }
const supId = c => String(c || '').replace(/[^A-Za-z0-9]/g, '') || 'X';

/** 옛 rpc_pedido_compra_gerar (+ _criar) — itens: [{ produto_id, qtd, qtd_recomendada }] · prod(id) → 계획 줄 (공장 · 이름 · 단위 · 원가) */
export async function gerarPedidos(itens, chave, prod, custoOk) {
  if (!chave) throw pecaErro('Chave da geracao ausente.');
  if (!Array.isArray(itens) || !itens.length) throw pecaErro('Nenhum item para o pedido.');
  const vistos = {}; itens.forEach(x => { if (vistos[x.produto_id]) throw pecaErro('Produto repetido na lista.'); vistos[x.produto_id] = 1; });
  if (itens.some(x => !(Number(x.qtd) > 0) || Math.round(x.qtd) !== Number(x.qtd))) throw pecaErro('Quantidade precisa ser maior que zero.');
  const L = itens.map(x => { const r = prod(x.produto_id); if (!r) throw pecaErro('Produto nao encontrado.'); return { x, r }; });
  const sem = L.filter(o => !o.r.fornecedor_id).map(o => o.r.sku).sort();
  const grupos = {}; L.filter(o => o.r.fornecedor_id).forEach(o => { (grupos[o.r.fornecedor_id] = grupos[o.r.fornecedor_id] || []).push(o); });
  const ks = Object.keys(grupos).sort((a, b) => String(B.fornNome(a)).localeCompare(String(B.fornNome(b))));
  if (!ks.length) throw pecaErro('Nenhum dos produtos tem fornecedor cadastrado.');
  const out = []; let todosVelhos = true;
  for (const f of ks) {
    const id = 'PC_' + chave + '_' + supId(f);
    let doc = null; try { doc = await S.DB.get('purchaseOrders', id); } catch (e) {}
    if (!doc) {
      todosVelhos = false;
      const n = await S.DB.seq('po', 'n', 1), yr = new Date().getFullYear();
      const its = grupos[f].map((o, i) => ({ id: i + 1, produto_id: o.r.produto_id, sku: o.r.sku, nome: o.r.nome, qtd_recomendada: Math.max(Number(o.x.qtd_recomendada) || 0, 0), qtd: Number(o.x.qtd), qtd_recebida: 0, unidade: o.r.unidade || 'un', un_por_caixa: Number(o.r.un_por_caixa) || 1 }));
      doc = { id, numero: 'PC-' + yr + '-' + String(n).padStart(6, '0'), fornecedor_id: f, fornecedor: B.fornNome(f), status: 'rascunho', observacao: '', criado_por: S.user.email, criado_por_nome: quemNome(), criado_em: agora(), chave_geracao: chave, itens: its, eventos: [] };
      const c = {}; if (custoOk) grupos[f].forEach((o, i) => { if (Number(o.r.custo) > 0) c[i + 1] = Number(o.r.custo); });
      const ops = [{ op: 'set', col: 'purchaseOrders', id, data: doc }];
      if (Object.keys(c).length) ops.push({ op: 'set', col: 'poCusto', id, data: { c, at: agora(), by: S.user.email } });
      await S.DB.batch(ops);
      if (Object.keys(c).length) CUSTOS[id] = c;
    }
    const d = derivar(doc, CUSTOS);
    out.push({ id, numero: d.numero, fornecedor_id: f, fornecedor: d.fornecedor, n_itens: d.n_itens, pecas: d.pecas, total: d.total });
  }
  LISTA = null;
  return { pedidos: out, sem_fornecedor: sem, ignorados: sem.length, repetido: todosVelhos };
}
/** 옛 rpc_pedido_compra_enviar — 초안만 · 도착 예상 = 오늘 + 공장 리드타임 */
export async function enviar(id) {
  const p = await lerPO(id);
  if (p.status !== 'rascunho') throw pecaErro('So um pedido em rascunho pode ser enviado (este esta ' + p.status + ').');
  if (!pcoVivos(p.itens).length) throw pecaErro('Pedido sem itens.');
  const d = new Date(); d.setDate(d.getDate() + B.parOf(p.fornecedor_id).lead);
  const patch = { status: 'enviado', enviado_em: agora(), enviado_por: S.user.email, enviado_por_nome: quemNome(), previsao_em: B.ymdLocal(d) };
  await S.DB.update('purchaseOrders', id, patch);
  return Object.assign({ id, numero: p.numero }, patch);
}
/** 옛 rpc_pedido_compra_receber — itens: [{ item_id, qtd_recebida }] (지금까지 모두 받은 수량) */
export async function receber(id, its) {
  const p = await lerPO(id);
  if (!['enviado', 'recebido_parcial'].includes(p.status)) throw pecaErro('So um pedido enviado pode receber (este esta ' + p.status + ').');
  const itens = (p.itens || []).map(i => Object.assign({}, i));
  (its || []).forEach(x => { const it = itens.find(i => i.id === Number(x.item_id)); if (!it) throw pecaErro('Item ' + x.item_id + ' nao pertence a este pedido.'); const q = Number(x.qtd_recebida); if (!(q >= 0 && q <= it.qtd)) throw pecaErro('Quantidade recebida do item ' + x.item_id + ' fora do pedido (0 a ' + it.qtd + ').'); it.qtd_recebida = q; });
  const v = pcoVivos(itens), pecas = v.reduce((a, i) => a + i.qtd, 0), rec = v.reduce((a, i) => a + (i.qtd_recebida || 0), 0);
  const patch = { itens, status: rec >= pecas ? 'recebido' : 'recebido_parcial', recebido_em: rec >= pecas ? agora() : null };
  await S.DB.update('purchaseOrders', id, patch);
  return { id, numero: p.numero, status: patch.status, pecas, pecas_recebidas: rec };
}
/** 옛 rpc_pedido_compra_cancelar — 초안 · 보냄(받은 것 0) 만 */
export async function cancelar(id) {
  const p = await lerPO(id), rec = pcoVivos(p.itens).reduce((a, i) => a + (i.qtd_recebida || 0), 0);
  if (!['rascunho', 'enviado'].includes(p.status) || rec > 0) throw pecaErro('Este pedido nao pode mais ser cancelado (' + p.status + ' / ' + rec + ' pecas recebidas).');
  await S.DB.update('purchaseOrders', id, { status: 'cancelado', cancelado_em: agora(), cancelado_por: S.user.email });
  return { id, numero: p.numero, status: 'cancelado' };
}
/** 옛 rpc_pedido_compra_editar — itens: [{ item_id, qtd }] · [{ item_id, remover:true }] · 보낸 발주서는 이유 필수 · 줄은 지우지 않고 표시 */
export async function editar(id, its, motivo) {
  const p = await lerPO(id);
  if (!['rascunho', 'enviado'].includes(p.status)) throw pecaErro('So rascunho ou enviado pode ser editado (este esta ' + p.status + ').');
  motivo = String(motivo || '').trim();
  if (p.status === 'enviado' && !motivo) throw pecaErro(t('pco_ed_motivo_obrig'));
  const itens = (p.itens || []).map(i => Object.assign({}, i)), ev = (p.eventos || []).slice(), quando = agora(), nome = quemNome();
  let nRm = 0, nQ = 0, seqEv = ev.reduce((a, e) => Math.max(a, Number(e.id) || 0), 0);
  const novo = (tipo, dados) => ({ id: ++seqEv, tipo, dados, motivo: motivo || null, usuario_nome: nome, criado_em: quando });
  (its || []).forEach(x => {
    const it = itens.find(i => i.id === Number(x.item_id)); if (!it) throw pecaErro('Item ' + x.item_id + ' nao pertence a este pedido.');
    if (it.removido_em) throw pecaErro('Item ' + it.sku + ' ja foi removido.');
    if (x.remover) {
      if ((it.qtd_recebida || 0) > 0) throw pecaErro('Item ' + it.sku + ' ja tem pecas recebidas.');
      it.removido_em = quando; it.removido_por = S.user.email; it.removido_por_nome = nome; it.removido_motivo = motivo || null; nRm++;
      ev.push(novo('item_removido', { sku: it.sku, nome: it.nome, qtd: it.qtd, unidade: it.unidade || 'un' }));
    } else {
      const q = Number(x.qtd); if (!(q > 0) || Math.round(q) !== q) throw pecaErro(t('pco_ed_qtd_invalida'));
      if (q < (it.qtd_recebida || 0)) throw pecaErro('Quantidade abaixo do ja recebido (' + it.qtd_recebida + ').');
      if (q !== it.qtd) { ev.push(novo('item_qtd', { sku: it.sku, nome: it.nome, de: it.qtd, para: q, unidade: it.unidade || 'un' })); it.qtd = q; nQ++; }
    }
  });
  if (!pcoVivos(itens).length) throw pecaErro(t('pco_ed_tudo'));
  if (!nRm && !nQ) throw pecaErro(t('pco_ed_nada'));
  ev.push(novo('editado', { removidos: nRm, alterados: nQ }));
  await S.DB.update('purchaseOrders', id, { itens, eventos: ev });
  return { id, numero: p.numero, removidos: nRm, alterados: nQ };
}

/* ---------- ⚙️ 메일 설정 (옛 compras_config) · 마지막 발송 ---------- */
let CFG = null, ENVIOS = null;
export async function cfgCarregar(force) {
  if (CFG && !force) return CFG;
  try { CFG = (await S.DB.get('planCfg', 'mail')) || {}; } catch (e) { CFG = {}; }
  try { ENVIOS = (await S.DB.list('notifyq', { where: [['kind', '==', 'poMail']] })).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))); } catch (e) { ENVIOS = []; }
  return CFG;
}
export const cfgAtual = () => CFG || {};
export const enviosAtuais = () => ENVIOS || [];
export async function cfgSalvar(c) { await S.DB.set('planCfg', 'mail', Object.assign({}, c, { at: agora(), by: S.user.email })); CFG = c; }
export function pcmLerEmails(txt) { const bons = [], ruins = []; String(txt || '').split(/[,;\s]+/).forEach(x => { x = x.trim(); if (!x) return; (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x) ? bons : ruins).push(x); }); return { bons, ruins }; }
export function pcmUltimoHTML() {
  const u = (ENVIOS || [])[0];
  if (!u) return '<div class="pcm-ult">' + esc(t('pcm_nunca')) + '</div>';
  const quando = B.dataCurtaHora(u.sentAt || u.at), n = (Array.isArray(u.to) ? u.to : String(u.to || '').split(',')).filter(x => String(x).trim()).length;
  if (u.st === 'wait') return '<div class="pcm-ult">' + esc(t('pcm_fila', { d: quando, n })) + '</div>';
  const ok = u.st === 'sent';
  return '<div class="pcm-ult' + (ok ? '' : ' ruim') + '">' + esc(ok ? ti('pcm_ultimo', { d: quando, n }) : ti('pcm_ultimo_erro', { d: quando, e: u.err || u.skipWhy || '' })) + '</div>';
}

/* ============================================================
 *  화면 (옛 telaPedidosCompra)
 * ============================================================ */
const ehAqui = () => location.hash.indexOf('#/pocompra') === 0;
async function page(arg) {
  B.injetarCss();
  if (arg && /^PC_/.test(String(arg))) PO.sel = String(arg);
  render();
  if (B.canPlan()) carregar(true);   // 들어올 때마다 새로 (다른 사람이 바꾼 상태 · 계획에서 막 만든 발주서)
}
async function carregar(force) {
  if (force) ERRO = null;
  cfgCarregar(true);
  try { LISTA = await listarPOs(); ERRO = null; } catch (e) { ERRO = String(e && e.message || e); }
  if (ehAqui()) { render(); if (PO.sel) pintarDrawer(); }
}
export function invalidar() { LISTA = null; }
function cab() { return '<div class="page-head"><div class="pcp-ico">' + svg(ICO.caixa, 20) + '</div><div><h1>' + esc(t('nav_pedidoscompra')) + '</h1><p>' + esc(t('pco_l_sub')) + '</p></div></div>'; }
function render() {
  if (!ehAqui()) return;
  const raiz = h => { $('page').innerHTML = '<div class="sb pcp-raiz"><div id="conteudo" class="pco-tela">' + h + '</div></div>'; };
  if (!B.canPlan()) return raiz(cab() + '<div class="placeholder">' + svg(ICO.lock, 40) + '<b>' + esc(t('pcp_restrito')) + '</b></div>');
  if (ERRO) { raiz(cab() + '<div class="pcp-erro">' + svg(ICO.sai2, 18) + '<div><b>' + esc(t('pco_l_erro')) + '</b><div class="pcp-erro-det">' + esc(ERRO) + '</div></div><button type="button" class="btn sm" data-act="pco-tentar">' + esc(t('pcp_tentar')) + '</button></div>'); return ligar(); }
  if (!LISTA) return raiz(cab() + '<div class="placeholder">' + esc(t('carregando')) + '</div>');
  const L = LISTA, qn = buscaNorm(), hits = qn ? achados(qn) : null;
  const base = qn ? L.filter(p => casa(p, qn, hits)) : L;
  const cont = {}; base.forEach(p => { cont[p.status] = (cont[p.status] || 0) + 1; });
  const lista = PO.st ? base.filter(p => p.status === PO.st) : base;
  let h = cab() + '<div class="nu-chips pco-chips"><button type="button" class="nu-chip' + (PO.st ? '' : ' on') + '" data-pco-st="">' + esc(t('pco_st_todos')) + ' (' + base.length + ')</button>' + PCO_ST.map(s => '<button type="button" class="nu-chip' + (PO.st === s ? ' on' : '') + '" data-pco-st="' + s + '">' + esc(t('pco_st_' + s)) + ' (' + (cont[s] || 0) + ')</button>').join('') + '</div>';
  if (!L.length) h += '<div class="placeholder">' + svg(ICO.caixa, 40) + '<b>' + esc(t('pco_l_vazio')) + '</b><span>' + esc(t('pco_l_vazio_sub')) + '</span></div>';
  else {
    h += '<div class="panel"><div class="toolbar pco-barra"><div class="tb-search">' + svg(ICO.busca, 15) + '<input type="search" id="pcoBusca" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="' + esc(t('pco_busca_ph')) + '" value="' + esc(PO.busca || '') + '"></div>' +
      (qn ? '<span class="pco-bres">' + esc(tiu('pco_busca_res', { n: numFmt(base.length), t: numFmt(L.length), q: qn })) + '</span>' : '') + '</div>';
    if (!lista.length) h += '<div class="placeholder">' + svg(ICO.busca, 40) + '<b>' + esc(t('pco_busca_vazio')) + '</b><span>' + esc(t('pco_busca_vazio_sub')) + '</span></div>';
    else h += '<div class="tbl-scroll"><table class="sem-resize pco-lista"><thead><tr><th>' + [t('pco_c_num'), t('pco_c_forn'), t('pco_c_status'), t('pco_c_itens'), t('pco_c_pecas'), t('pco_c_rec'), t('pco_c_valor'), t('pco_c_criado'), t('pco_c_prev')].map(esc).join('</th><th>') + '</th></tr></thead><tbody>' +
      lista.map(p => { const ach = hits && hits[p.id];
        return '<tr class="clic" data-pco="' + esc(p.id) + '"><td class="principal"><b>' + esc(p.numero) + '</b><span class="pco-m-forn">' + esc(p.fornecedor) + '</span>' + pcoBadge(p.status) + '</td><td>' + esc(p.fornecedor) + '</td><td>' + pcoBadge(p.status) + '</td><td class="num">' + numFmt(p.n_itens) + '</td><td class="num pco-m" data-l="' + esc(t('pco_c_pecas')) + '">' + numFmt(p.pecas) + '</td><td class="num pco-m" data-l="' + esc(t('pco_c_rec')) + '">' + numFmt(p.pecas_recebidas) + '</td><td class="num">' + (Number(p.total) > 0 ? esc(brl(Number(p.total))) : '—') + '</td><td>' + esc(dataBR(p.criado_em)) + '</td><td>' + (p.previsao_em ? esc(dataBR(p.previsao_em + 'T12:00:00')) : '—') + '</td></tr>' +
          (ach && ach.length ? hitsHTML(p, ach, qn) : ''); }).join('') + '</tbody></table></div>';
    h += '</div>';
  }
  const ae = document.activeElement, foco = ae && ae.id === 'pcoBusca' ? ae.selectionStart : null;
  raiz(h);
  if (foco != null && $('pcoBusca')) { const i = $('pcoBusca'); i.focus(); try { i.setSelectionRange(foco, foco); } catch (e) {} }
  ligar();
}
/* 옛 pcoBuscar — 번호 · 공장은 목록에서, 상품(SKU · 이름)은 발주서 안의 줄에서 (여기서는 줄이 문서 안에 있어 바로) */
const buscaNorm = () => String(PO.busca || '').trim().replace(/[,()%*]/g, ' ').trim();
function achados(qn) { const q = qn.toLowerCase(), por = {}; (LISTA || []).forEach(p => (p.itens || []).forEach(it => { if (String(it.sku || '').toLowerCase().indexOf(q) >= 0 || String(it.nome || '').toLowerCase().indexOf(q) >= 0) (por[p.id] = por[p.id] || []).push(it); })); return por; }
function casa(p, qn, hits) { const q = qn.toLowerCase(); if (String(p.numero || '').toLowerCase().indexOf(q) >= 0) return true; if (String(p.fornecedor || '').toLowerCase().indexOf(q) >= 0) return true; return !!(hits && hits[p.id]); }
function marcar(txt, qn) { const s = String(txt || ''), i = s.toLowerCase().indexOf(qn.toLowerCase()); if (i < 0) return esc(s); return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + qn.length)) + '</mark>' + esc(s.slice(i + qn.length)); }
function hitsHTML(p, itens, qn) {
  const teto = 10, mais = itens.length - teto;
  return '<tr class="pco-hitrow" data-pco="' + esc(p.id) + '"><td colspan="9"><div class="pco-hits"><b>' + esc(t('pco_busca_itens')) + '</b>' +
    itens.slice(0, teto).map(it => { const nome = String(it.nome || '').trim(), sku = String(it.sku || '').trim(); return '<span class="pco-hit"><u>' + marcar(sku, qn) + '</u>' + (nome && nome !== sku ? marcar(nome, qn) : '') + '<i>' + esc(pcuQtd(it, it.qtd)) + '</i></span>'; }).join('') + (mais > 0 ? '<span class="pco-hit">+' + mais + '</span>' : '') + '</div></td></tr>';
}
function ligar() {
  const c = $('conteudo'); if (!c) return;
  c.querySelectorAll('[data-pco-st]').forEach(b => b.addEventListener('click', () => { PO.st = b.getAttribute('data-pco-st'); render(); }));
  c.querySelectorAll('tr[data-pco]').forEach(tr => tr.addEventListener('click', () => abrir(tr.getAttribute('data-pco'))));
  const tn = c.querySelector('[data-act="pco-tentar"]'); if (tn) tn.addEventListener('click', () => carregar(true));
  const bs = $('pcoBusca');
  if (bs) { bs.addEventListener('input', e => { PO.busca = e.target.value; if (PCO_BUSCA_T) clearTimeout(PCO_BUSCA_T); PCO_BUSCA_T = setTimeout(render, 300); }); bs.addEventListener('keydown', e => { if (e.key === 'Enter') { if (PCO_BUSCA_T) clearTimeout(PCO_BUSCA_T); render(); } }); }
}

/* ---------- 서랍 (옛 pcoAbrir · pcoPintarDrawer) ---------- */
export function abrir(id) { PO.sel = id; edReset(); PO.edQtd = {}; pintarDrawer(); }
function fecharPO() { edReset(); PO.sel = null; B.drawerFechar(); }
const edReset = () => { PO.ed = false; PO.edRm = {}; PO.edMot = ''; };
function edGuardar() { const d = $('pcpDrawer'); if (!d) return; const m = d.querySelector('#pcoEdMotivo'); if (m) PO.edMot = m.value; const q = {}; d.querySelectorAll('.pco-eq').forEach(i => { q[i.getAttribute('data-item')] = i.value; }); PO.edQtd = q; }
function evTexto(e) {
  const dd = e.dados || {}, un = dd.unidade && dd.unidade !== 'un' ? ' ' + dd.unidade : '';
  if (e.tipo === 'item_removido') return ti('pco_ev_removido', { s: dd.sku || '—', q: numFmt(dd.qtd || 0) + un });
  if (e.tipo === 'item_qtd') return ti('pco_ev_qtd', { s: dd.sku || '—', de: numFmt(dd.de || 0) + un, para: numFmt(dd.para || 0) + un });
  return t('pco_hist_pedido') + ' · ' + ti('pco_ev_resumo', { r: numFmt(dd.removidos || 0), a: numFmt(dd.alterados || 0) });
}
function histHTML(p) {
  const evs = (p.eventos || []).slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)) || (b.id - a.id));
  if (!evs.length) return '';
  return '<div class="pcp-sec pco-hist"><h4>' + esc(t('pco_hist_tit')) + '</h4>' + evs.map(e => '<div class="pco-ev pco-ev-' + esc(e.tipo) + '">' + svg(e.tipo === 'item_removido' ? ICO.x : ICO.lapis, 13) + '<div><b>' + esc(evTexto(e)) + '</b>' +
    (e.motivo && e.tipo === 'editado' ? '<i class="pco-ev-mot">' + esc(e.motivo) + '</i>' : '') + '<span class="pco-ev-quem">' + esc(e.usuario_nome || '—') + ' · ' + esc(dataBR(e.criado_em)) + ' ' + esc(horaCurta(e.criado_em)) + '</span></div></div>').join('') + '</div>';
}
function pintarDrawer() {
  if (!PO.sel) return;
  const p = (LISTA || []).find(x => x.id === PO.sel); if (!p) return;
  const itens = (p.itens || []).slice().sort((a, b) => (a.removido_em ? 1 : 0) - (b.removido_em ? 1 : 0) || pcpCmpSku(a.sku, b.sku));
  const podeRec = p.status === 'enviado' || p.status === 'recebido_parcial', podeEd = p.status === 'rascunho' || p.status === 'enviado', ed = !!PO.ed && podeEd;
  const vivos = pcoVivos(itens), marcados = PO.edRm || {};
  const kv = (l, v) => v ? '<span class="pco-kv"><span>' + esc(l) + '</span> ' + esc(v) + '</span>' : '';
  let corpo = '<div class="pco-meta">' + kv(t('pco_d_criado_por'), (p.criado_por_nome || '—') + ' · ' + dataBR(p.criado_em)) + kv(t('pco_d_enviado_em'), p.enviado_em && dataBR(p.enviado_em)) + kv(t('pco_c_prev'), p.previsao_em && dataBR(p.previsao_em + 'T12:00:00')) + kv(t('pco_d_recebido_em'), p.recebido_em && dataBR(p.recebido_em)) + kv(t('pco_d_cancelado_em'), p.cancelado_em && dataBR(p.cancelado_em)) + '</div>';
  if (p.n_removidos > 0 && !ed) corpo += '<div class="pco-nota pco-nota-rm">' + esc(ti('pco_ed_removidos_n', { n: numFmt(p.n_removidos) })) + '</div>';
  corpo += '<div class="pcp-sec"><h4>' + esc(t('pco_d_itens')) + ' · ' + esc(tiu('pco_d_pecas_de', { r: numFmt(p.pecas_recebidas), p: numFmt(p.pecas), u: pcuSiglaConj(vivos) })) + '</h4>';
  if (ed && p.status === 'enviado') corpo += '<div class="pco-aviso pco-ed-aviso">' + svg(ICO.alerta, 15) + '<div>' + esc(t('pco_ed_aviso')) + '</div></div>';
  corpo += '<table class="pco-tbl pco-itens' + (ed ? ' pco-ed' : '') + '"><thead><tr><th>' + esc(t('pcp_c_prod')) + '</th><th>SKU</th><th class="num">' + esc(t('pco_recom')) + '</th><th class="num">' + esc(t('pco_pedido')) + '</th><th class="num">' + esc(t('pco_d_rec_col')) + '</th><th class="num">' + esc(t('pco_custo')) + '</th><th class="num">' + esc(t('pco_total')) + '</th></tr></thead><tbody>' +
    itens.map(it => {
      const fora = !!it.removido_em, vai = !fora && ed && !!marcados[it.id], risca = fora || vai;
      const qtdCel = ed && !fora ? '<input type="number" min="1" inputmode="numeric" class="pco-q pco-eq" data-item="' + it.id + '" value="' + esc(String(PO.edQtd[it.id] != null ? PO.edQtd[it.id] : it.qtd)) + '"' + (vai ? ' disabled' : '') + '>' + pcuSufHTML(it) : '<b>' + pcuNumHTML(it, it.qtd) + '</b>';
      const recCel = podeRec && !fora && !ed ? '<input type="number" min="0" max="' + it.qtd + '" inputmode="numeric" class="pco-q pco-rq" data-item="' + it.id + '" data-max="' + it.qtd + '" value="' + (it.qtd_recebida || 0) + '">' + pcuSufHTML(it) : pcuNumHTML(it, it.qtd_recebida || 0);
      const bt = ed && !fora ? '<button type="button" class="pco-x' + (vai ? ' on' : '') + '" data-pco-rm="' + it.id + '" title="' + esc(t(vai ? 'pco_ed_repor' : 'pco_ed_tirar')) + '" aria-label="' + esc(t(vai ? 'pco_ed_repor' : 'pco_ed_tirar')) + '">' + svg(vai ? ICO.repetir : ICO.x, 12) + '</button>' : '';
      const marca = fora ? '<small class="pco-rm-nota">' + esc(t('pco_ed_removida')) + ' · ' + esc(it.removido_por_nome || '—') + ' · ' + esc(dataBR(it.removido_em)) + (it.removido_motivo ? ' · ' + esc(it.removido_motivo) : '') + '</small>' : (vai ? '<small class="pco-rm-nota">' + esc(t('pco_ed_vai_sair')) + '</small>' : '');
      return '<tr data-item="' + it.id + '" class="' + (fora ? 'pco-rm' : (vai ? 'pco-vai' : '')) + '"><td>' + bt + '<span' + (risca ? ' class="pco-risca"' : '') + '>' + esc(it.nome || '') + '</span>' + marca + '</td><td><span class="pcp-sku' + (risca ? ' pco-risca' : '') + '">' + esc(it.sku || '') + '</span></td><td class="num">' + pcuNumHTML(it, it.qtd_recomendada) + '</td><td class="num">' + qtdCel + '</td><td class="num">' + recCel + '</td><td class="num">' + (it.custo_unit == null ? '—' : esc(brl(it.custo_unit))) + '</td><td class="num">' + (Number(it.subtotal) > 0 ? esc(brl(it.subtotal)) : '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
  if (ed) corpo += '<div class="pco-ed-mot"><label for="pcoEdMotivo">' + esc(t('pco_ed_motivo_lbl')) + (p.status === 'enviado' ? ' *' : '') + '</label><textarea id="pcoEdMotivo" rows="2" placeholder="' + esc(t('pco_ed_motivo_ph')) + '">' + esc(PO.edMot || '') + '</textarea></div>';
  corpo += '</div>';
  if (!ed) corpo += histHTML(p);
  let acoes = '';
  if (ed) acoes += '<button type="button" class="btn primary" data-act="pco-ed-salvar">' + svg(ICO.check, 15) + ' ' + esc(t('pco_ed_salvar')) + '</button><button type="button" class="btn" data-act="pco-ed-sair">' + esc(t('pco_ed_sair')) + '</button>';
  else {
    if (p.status === 'rascunho') acoes += '<button type="button" class="btn primary" data-act="pco-enviar">' + svg(ICO.dir, 15) + ' ' + esc(t('pco_d_enviar')) + '</button>';
    if (podeRec) acoes += '<button type="button" class="btn" data-act="pco-tudo">' + esc(t('pco_d_rec_tudo')) + '</button><button type="button" class="btn primary" data-act="pco-receber">' + svg(ICO.check, 15) + ' ' + esc(t('pco_d_rec_salvar')) + '</button>';
    if (podeEd) acoes += '<button type="button" class="btn" data-act="pco-editar">' + svg(ICO.lapis, 15) + ' ' + esc(t('pco_d_editar')) + '</button>';
    if (p.status === 'rascunho' || (p.status === 'enviado' && !(p.pecas_recebidas > 0))) acoes += '<button type="button" class="btn danger" data-act="pco-cancelar">' + esc(t('pco_d_cancelar')) + '</button>';
    acoes += '<button type="button" class="btn" data-act="pco-pdf">' + svg(ICO.print, 15) + ' ' + esc(t('pcx_exp_pdf')) + '</button>';
  }
  if (podeRec && !ed) corpo += '<div class="pco-nota">' + esc(t('pco_d_rec_nota')) + '</div>';
  const d = B.drawerAbrir('<div class="dr-head"><div class="dr-top"><div class="thumb pcp-thumb pcp-dr-thumb">' + svg(ICO.caixa, 18) + '</div><div><h2>' + esc(p.numero) + '</h2><div class="meta">' + esc(p.fornecedor) + ' · ' + pcoBadge(p.status) + '</div></div><button class="x" data-act="fechar-drawer" aria-label="' + esc(t('pcp_d_fechar')) + '">' + svg(ICO.x, 17) + '</button></div>' + (acoes ? '<div class="dr-actions">' + acoes + '</div>' : '') + '</div><div class="dr-body">' + corpo + '</div>',
    e => { if (e.target.closest('[data-act="fechar-drawer"]')) fecharPO(); });
  const q = s => d.querySelector(s);
  if (q('[data-act="pco-pdf"]')) q('[data-act="pco-pdf"]').onclick = () => pcoPdf(p, itens);
  if (q('[data-act="pco-enviar"]')) q('[data-act="pco-enviar"]').onclick = () => B.pergunta({ titulo: t('pco_d_enviar'), texto: t('pco_d_enviar_perg'), sim: t('pco_d_enviar'), nao: t('pco_cancelar'), onSim: () => { acao(() => enviar(p.id), 'pco_ok_enviado', dd => pcmEnviarPedido(p, itens, dd)); } });
  if (q('[data-act="pco-cancelar"]')) q('[data-act="pco-cancelar"]').onclick = () => B.pergunta({ titulo: t('pco_d_cancelar'), texto: t('pco_d_cancelar_perg'), perigo: true, sim: t('pco_d_cancelar'), nao: t('pco_cancelar'), onSim: () => { acao(() => cancelar(p.id), 'pco_ok_cancelado'); } });
  if (q('[data-act="pco-tudo"]')) q('[data-act="pco-tudo"]').onclick = () => { d.querySelectorAll('.pco-rq').forEach(i => { i.value = i.getAttribute('data-max'); }); validarRec(); };
  d.querySelectorAll('.pco-rq').forEach(i => i.addEventListener('input', validarRec));
  if (q('[data-act="pco-receber"]')) q('[data-act="pco-receber"]').onclick = () => {
    if (!validarRec()) return;
    const its = Array.from(d.querySelectorAll('.pco-rq')).map(i => ({ item_id: Number(i.getAttribute('data-item')), qtd_recebida: parseInt(i.value, 10) || 0 }));
    acao(() => receber(p.id, its), 'pco_ok_recebido');
  };
  if (q('[data-act="pco-editar"]')) q('[data-act="pco-editar"]').onclick = () => { PO.ed = true; PO.edRm = {}; PO.edMot = ''; PO.edQtd = {}; pintarDrawer(); };
  if (q('[data-act="pco-ed-sair"]')) q('[data-act="pco-ed-sair"]').onclick = () => { edReset(); PO.edQtd = {}; pintarDrawer(); };
  d.querySelectorAll('[data-pco-rm]').forEach(b => b.addEventListener('click', () => { const id = Number(b.getAttribute('data-pco-rm')); edGuardar(); if (PO.edRm[id]) delete PO.edRm[id]; else PO.edRm[id] = true; pintarDrawer(); }));
  if (q('[data-act="pco-ed-salvar"]')) q('[data-act="pco-ed-salvar"]').onclick = () => edSalvar(p, vivos);
}
function edSalvar(p, vivos) {
  const d = $('pcpDrawer'); edGuardar();
  const motivo = (PO.edMot || '').trim(), marcados = PO.edRm || {}, its = []; let nRm = 0, ruim = false;
  vivos.forEach(it => {
    if (marcados[it.id]) { its.push({ item_id: it.id, remover: true }); nRm++; return; }
    const i = d.querySelector('.pco-eq[data-item="' + it.id + '"]'); if (!i) return;
    const q = parseInt(i.value, 10); if (!(q > 0)) { ruim = true; return; }
    if (q !== it.qtd) its.push({ item_id: it.id, qtd: q });
  });
  if (ruim) return aviso(t('pco_ed_qtd_invalida'), true);
  if (nRm >= vivos.length) return aviso(t('pco_ed_tudo'), true);
  if (!its.length) { aviso(t('pco_ed_nada'), true); edReset(); return pintarDrawer(); }
  if (p.status === 'enviado' && !motivo) { aviso(t('pco_ed_motivo_obrig'), true); const m = d.querySelector('#pcoEdMotivo'); if (m) m.focus(); return; }
  const grava = () => { edReset(); PO.edQtd = {}; acao(() => editar(p.id, its, motivo || null), 'pco_ed_ok'); };
  if (nRm > 0) B.pergunta({ titulo: t('pco_d_editar'), texto: ti('pco_ed_conf', { n: numFmt(nRm) }), perigo: true, sim: t('pco_ed_salvar'), nao: t('pco_cancelar'), onSim: grava }); else grava();
}
function validarRec() {
  let ok = true; const d = $('pcpDrawer');
  d.querySelectorAll('.pco-rq').forEach(i => { const v = parseInt(i.value, 10), m = Number(i.getAttribute('data-max')), bad = !(v >= 0 && v <= m); i.classList.toggle('bad', bad); if (bad) ok = false; });
  const b = d.querySelector('[data-act="pco-receber"]'); if (b) b.disabled = !ok; return ok;
}
/** 옛 pcoAcao — 저장 → 알림 → 목록 · 서랍 다시 · 그 뒤에만 depois (메일은 저장이 된 뒤에만) */
async function acao(fn, okKey, depois) {
  let r; try { r = await fn(); } catch (e) { return aviso(String(e && e.message || e) || t('pco_erro_acao'), true); }
  aviso(t(okKey));
  try { const P = await import('./plan.js'); P.invalidar(); } catch (e) {}
  await carregar(true);   // 목록 · 열린 서랍(PO.sel) 다시
  if (depois) depois(r || {});
}

/* ---------- 📄 발주서 PDF (옛 pcoQtdTxt · pcoDocDados · pcoPdf · pcoCelHTML) — 늘 영어 · A4 ---------- */
function pcoQtdTxt(it, q) { const n = Number(q) || 0, cx = pcuCaixa(it, n, te); return pcuQtd(it, n, te) + (cx ? '\n' + cx : ''); }
function emissor() {
  const c = (S.settings && S.settings.ups && S.settings.ups.from) || {}, linhas = [], cid = [];
  if (c.addr1) linhas.push(c.addr1); if (c.addr2) linhas.push(c.addr2);
  if (c.city) cid.push(c.city); if (c.state || c.zip) cid.push([c.state, c.zip].filter(Boolean).join(' '));
  if (cid.length) linhas.push(cid.join(', ') + (c.country ? ', ' + c.country : ''));
  if (c.phone) { const d = String(c.phone).replace(/\D/g, ''); linhas.push(te('pco_pdf_fone') + ': ' + (d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : c.phone)); }
  return { nome: c.name || te('marca_longa'), linhas };
}
export function pcoDocDados(p, itens) {
  itens = pcoVivos(itens);
  let pecas = 0, valor = 0, temValor = false; const recebidas = Number(p.pecas_recebidas) || 0;
  itens.forEach(it => { pecas += Number(it.qtd) || 0; if (Number(it.subtotal) > 0) { valor += Number(it.subtotal); temValor = true; } });
  const cols = [['#', null], [te('pcp_c_prod'), 'nome'], ['SKU', 'sku'], [te('pco_pdf_qtd'), 'qtd', 1]];
  if (recebidas > 0) cols.push([te('pco_d_rec_col'), 'qtd_recebida', 1]);
  cols.push([te('pco_custo'), 'custo_unit', 1], [te('pco_total'), 'subtotal', 1]);
  const num = []; cols.forEach((c, i) => { if (c[2]) num.push(i); });
  const em = emissor();
  const campos = [[te('pco_pdf_po'), p.numero], [te('pco_c_status'), te('pco_st_' + p.status)], [te('pco_pdf_data'), dataEN(p.criado_em)]];
  const nota = [];
  if (p.criado_por_nome) nota.push(te('pco_pdf_por') + ' ' + p.criado_por_nome);
  if (p.enviado_em) nota.push(te('pco_d_enviado_em') + ' ' + dataEN(p.enviado_em));
  if (p.recebido_em) nota.push(te('pco_d_recebido_em') + ' ' + dataEN(p.recebido_em));
  if (p.cancelado_em) nota.push(te('pco_d_cancelado_em') + ' ' + dataEN(p.cancelado_em));
  const und = pcuSiglaConj(itens, te);
  return {
    ref: p.numero, fornecedor: p.fornecedor || '', num, emissor: em, titulo: te('pco_pdf_tipo'), selo: te('pco_pdf_selo'), campos,
    blocos: [{ rotulo: te('pco_c_forn'), forte: p.fornecedor || '—' }, { rotulo: te('pco_pdf_shipto'), forte: em.nome, linhas: em.linhas.slice(0, 2) }, { rotulo: te('pco_pdf_notas'), linhas: [te('pco_pdf_nota_padrao')].concat(p.observacao ? [p.observacao] : []) }],
    nota: nota.join(' · '), subtitulo: te('pco_pdf_itens'), subtitulo2: tie('pco_pdf_prods', { n: numFmt(itens.length) }), rodape: te('marca_longa') + ' · ' + te('pdf_rodape'), arquivo: 'purchase-order-' + p.numero,
    cabecalho: cols.map(c => c[0]),
    linhas: itens.map((it, i) => cols.map(c => { if (c[1] === null) return String(i + 1); if (c[1] === 'qtd' || c[1] === 'qtd_recebida') return pcoQtdTxt(it, it[c[1]] || 0); if (c[1] === 'custo_unit') return it.custo_unit == null ? '—' : brl(it.custo_unit); if (c[1] === 'subtotal') return Number(it.subtotal) > 0 ? brl(it.subtotal) : '—'; return String(it[c[1]] || ''); })),
    total: cols.map((c, i) => { if (i === 1) return te('pdf_total'); if (c[1] === 'qtd') return (numFmt(pecas) + ' ' + und).trim(); if (c[1] === 'qtd_recebida') return (numFmt(recebidas) + ' ' + und).trim(); if (c[1] === 'subtotal') return temValor ? brl(valor) : '—'; if (c[1] === 'custo_unit') return '—'; return ''; })
  };
}
const celHTML = (celula, forte) => { const parte = String(celula).split('\n'), topo = esc(parte[0]); return (forte ? '<b>' + topo + '</b>' : topo) + (parte[1] ? '<small>' + esc(parte[1]) + '</small>' : ''); };
export function pcoDocHTML(d) {
  const cls = i => i === 0 ? 'rn' : d.num.indexOf(i) >= 0 ? 'num' : '';
  return '<div class="doc-print po-doc pa4"><div class="po-topo"><div class="po-de"><b>' + esc(d.emissor.nome) + '</b>' + d.emissor.linhas.map(l => '<span>' + esc(l) + '</span>').join('') + '</div>' +
    '<div class="po-meio"><div class="po-tit">' + esc(d.titulo) + '</div><div class="po-selo">' + esc(d.selo) + '</div></div>' +
    '<div class="po-ident">' + d.campos.map((c, i) => '<div><span>' + esc(c[0]) + '</span>' + (i === 1 ? '<i class="po-st">' + esc(c[1]) + '</i>' : '<b>' + esc(c[1]) + '</b>') + '</div>').join('') + '</div></div>' +
    '<div class="po-faixa">' + d.blocos.map(b => '<div><span>' + esc(b.rotulo) + '</span>' + (b.forte ? '<b>' + esc(b.forte) + '</b>' : '') + (b.linhas || []).map(l => '<i>' + esc(l) + '</i>').join('') + '</div>').join('') + '</div>' +
    (d.nota ? '<div class="po-nota">' + esc(d.nota) + '</div>' : '') +
    '<div class="po-sub"><b>' + esc(d.subtitulo) + '</b><span>· ' + esc(d.subtitulo2) + '</span></div>' +
    '<table class="doc-tbl po-tbl"><thead><tr>' + d.cabecalho.map((c, i) => '<th class="' + cls(i) + '">' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
    d.linhas.map(l => '<tr>' + l.map((c, i) => '<td class="' + cls(i) + '">' + celHTML(c, i === 3) + '</td>').join('') + '</tr>').join('') +
    '</tbody><tfoot><tr>' + d.total.map((c, i) => '<td class="' + cls(i) + '">' + (c ? '<b>' + esc(c) + '</b>' : '') + '</td>').join('') + '</tr></tfoot></table>' +
    '<div class="doc-pe">' + esc(d.rodape) + '</div></div>';
}
function pcoPdf(p, itens) { B.injetarCss(); const d = pcoDocDados(p, itens); printOpen(pcoDocHTML(d), d.arquivo); }

/* ---------- ✉️ 보냄으로 표시하면 발주서를 메일로 (옛 pcmEnviarPedido) — notifyq + 첨부(PDF) ---------- */
async function pdfBase64(html, nome) {
  const src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  if (!window.html2pdf) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('html2pdf')); document.head.appendChild(s); });
  const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-10000px;top:0;width:7.47in;background:#fff';
  const pb = document.createElement('div'); pb.id = 'prtbody'; pb.className = 'prtpdf'; pb.style.cssText = 'padding:0;margin:0;max-width:none;width:7.47in'; pb.innerHTML = html;
  box.appendChild(pb); document.body.appendChild(box);
  try {
    const blob = await window.html2pdf().set({ margin: 0.4, filename: nome + '.pdf', image: { type: 'jpeg', quality: 0.9 }, html2canvas: { scale: 1.5, backgroundColor: '#fff' }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] } }).from(pb).outputPdf('blob');
    const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  } finally { box.remove(); }
}
export async function pcmEnviarPedido(p, itens, dados) {
  if (!p || !itens || !itens.length) return;
  const c = await cfgCarregar(true), para = pcmLerEmails(c.emails).bons;
  if (String(c.auto) !== '1' || !para.length) return;
  const pe = Object.assign({}, p, { status: (dados && dados.status) || 'enviado', enviado_em: (dados && dados.enviado_em) || agora() });
  if (dados && dados.previsao_em) pe.previsao_em = dados.previsao_em;
  const d = pcoDocDados(pe, itens);
  aviso(t('pcm_enviando'));
  let b64 = '';
  try { b64 = await pdfBase64(pcoDocHTML(d), d.arquivo); } catch (e) { return aviso(t('pcm_pdf_erro'), true); }
  if (b64.length > 900000) return aviso(t('pcm_pdf_grande'), true);
  /* 제목 틀 (옛 enviar-relatorio-compras): {fornecedor} · {pedido} — 틀에 칸이 없으면 끝에 번호 */
  const limpo = x => String(x == null ? '' : x).replace(/[\r\n\t]+/g, ' ').trim();
  const forn = limpo(d.fornecedor).slice(0, 60), ped = limpo(d.ref).slice(0, 40), molde = limpo(c.assunto) || 'Purchase order';
  const subject = (molde.indexOf('{') >= 0 ? molde.replace(/\{fornecedor\}/g, forn).replace(/\{pedido\}/g, ped) : molde + (ped ? ' · ' + ped : '')).replace(/\s{2,}/g, ' ').trim().slice(0, 200);
  try {
    const id = newId('N');
    await S.DB.set('notifyq', id, { id, kind: 'poMail', st: 'wait', by: String(S.user.email || '').toLowerCase(), byName: quemNome(), at: agora(), to: para, subject, text: String(c.texto || '') || ' ', noPush: true, ref: p.id, n_linhas: d.linhas.length,
      atts: [{ name: d.arquivo.replace(/[^A-Za-z0-9._-]/g, '') + '.pdf', type: 'application/pdf', b64 }] });
    ENVIOS = null; aviso(ti('pcm_ok', { n: para.length }));
  } catch (e) { aviso(String(e && e.message || e) || t('pcm_erro'), true); }
}
