/* ============================================================
 *  🏷 라벨 출력 (#/etiquetas) — 옛 THE ONE CORP WMS 의 "Etiquetas" (인쇄 작업대 ETQW) 를 그대로
 *    1 상품 찾기/스캔 → 2 그 상품의 살아 있는 상자들 (코드 · 통로 · 수량 · 입고일 · 상자 N · 선택 · 걸러보기)
 *    3 (선택) 상자 합치기 · 나누기 (재고는 그대로, 상자 사이에서만) → 4 종류: 재고 상자(QR ?e=) · 피킹 박스(바코드 + QR ?p=)
 *    5 크기 (재고 6×4 · 3×1.5 / 피킹 6×4 · 3×1.5 · 4.25×4) → 미리보기 · 매수 → 인쇄
 *  옛 앱의 인쇄 에이전트 상태 · 프린터 설정은 옮기지 않음 — 브라우저 인쇄 (etq.js imprimirLabels)
 *  #/etiquetas/<상자코드> (상자 QR ?e=) → 그 상자의 상품을 열고 그 상자만 선택
 * ============================================================ */
import { $, esc, toast, Router, busy } from './ui.js';
import { openScanner } from './scan.js';
import * as E from './etq.js';
import { L3 } from './balcao.js';

const { t, svg, ICO, numFmt, dataBR, corrFmt, podeMexer, prod } = E;
let S = null;
export function register(state) {
  S = state; E.init(state); Router.on('etiquetas', page);
  /* 상자 라벨의 QR(?e=XXXXXXXX) 로 열면 → #/etiquetas/XXXXXXXX */
  try { const m = String(location.search || '').match(/[?&]e=([0-9A-Za-z]{8})(?:[&#]|$)/); if (m) history.replaceState(null, '', location.pathname + '#/etiquetas/' + m[1].toUpperCase()); } catch (e) {}
}

/* ---------- estado (옛 ETQW) ---------- */
const W = { prodId: '', busca: '', lista: null, carregando: false, sel: {}, filtro: '', tipo: 'estoque', tam: '', copias: 1, acao: null, divModo: 'nova', divValor: '', manter: '', ocupado: false };
const TAMANHOS = { '64': { tit: 'etqw_tam_64', sub: 'etqw_tam_64_s', desc: 'etqw_tam_64_d' }, '3': { tit: 'etqw_tam_3', sub: 'etqw_tam_3_s', desc: 'etqw_tam_3_d' }, '44': { tit: 'etqw_tam_44', sub: 'etqw_tam_44_s', desc: 'etqw_tam_44_d' } };
const TIPOS = {
  estoque: { ico: 'caixa', tit: 'etqw_tipo_estoque', desc: 'etqw_tipo_estoque_d', ordem: ['64', '3'], tamanhos: { '64': { monta: E.etiquetaHTML, w: 6, h: 4 }, '3': { monta: E.etiquetaEstoque3HTML, w: 3, h: 1.5 } }, item: (p, cx) => cx },
  picking: { ico: 'etiq', tit: 'etqw_tipo_picking', desc: 'etqw_tipo_picking_d', ordem: ['64', '3', '44'], tamanhos: { '64': { monta: x => E.etiquetaPicking64HTML(x), w: 6, h: 4 }, '3': { monta: E.etiquetaPickingHTML, w: 3, h: 1.5 }, '44': { monta: x => E.etiquetaPicking64HTML(x, true), w: 4.25, h: 4 } }, item: (p, cx) => Object.assign({}, p, { corredor: cx.corredor || p.corredor || '', codigo: cx.codigo }) }
};
const tipo = () => TIPOS[W.tipo] || TIPOS.estoque;
const tamAtual = () => { const ts = tipo().ordem; return ts.indexOf(W.tam) >= 0 ? W.tam : ts.indexOf(E.etqTamUltimo()) >= 0 ? E.etqTamUltimo() : ts[0]; };
const caixas = () => W.lista || [];
const selecionadas = () => caixas().filter(c => !!W.sel[c.codigo]);
const unidades = L => (L || []).reduce((a, c) => a + (Number(c.qtd_restante) || 0), 0);
const filtradas = () => { const f = String(W.filtro || '').trim().toUpperCase(); return f ? caixas().filter(c => c.codigo.toUpperCase().indexOf(f) >= 0 || corrFmt(c.corredor || '').toUpperCase().indexOf(f) >= 0) : caixas(); };
const prodSel = () => W.prodId ? prod(W.prodId) : null;

async function page(arg) {
  E.injetarCss();
  $('page').innerHTML = '<div class="sb etqw-tela"><div class="placeholder">' + esc(t('carregando')) + '</div></div>';
  try { await E.produtos(); } catch (e) {}
  E.prepararImpressao().then(() => { if (W.prodId) repintar(); });
  if (arg) { const cod = String(arg).toUpperCase(); const e = await E.lerEtiqueta(cod).catch(() => null); if (e) { await carregar(e.produto_id, [cod]); } else toast(t('r_nada_encontrado') + ' ' + cod, 'bad'); }
  if (location.hash.indexOf('#/etiquetas') !== 0) return;
  tela();
}
async function carregar(id, marcar) {
  if (!prod(id)) return;
  Object.assign(W, { prodId: prod(id).id, lista: null, sel: {}, filtro: '', acao: null, divValor: '', copias: 1, carregando: true });
  repintar();
  const pid = W.prodId; let L = [];
  try { L = await E.listarEtiquetas(pid); } catch (e) { toast(String(e.message || e), 'bad'); }
  if (W.prodId !== pid) return;
  W.carregando = false;
  W.lista = L.filter(c => c.ativa && c.qtd_restante > 0).sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
  W.lista.forEach((c, i) => { c.n = i + 1; if (!marcar || marcar.indexOf(c.codigo) >= 0) W.sel[c.codigo] = true; });
  repintar();
}

/* ---------- pedaços da tela (옛 etqw*HTML) ---------- */
function produtoHTML(p) {
  const cx = caixas();
  return '<div class="etqw-prod"><div class="etqw-prod-card">' + E.miniProdutoHTML(p, 86) + '<div class="etqw-prod-txt"><div class="etqw-prod-cod">' + esc(p.sku) + '</div><div class="etqw-prod-nome">' + esc(p.descricao || '') + '</div><dl class="etqw-prod-meta"><dt>SKU</dt><dd>' + esc(p.sku || '—') + '</dd><dt>' + esc(t('etqw_categoria')) + '</dt><dd>' + esc(p.categoria || '—') + '</dd><dt>' + esc(t('cg_fornecedor')) + '</dt><dd>' + esc(p.fornecedor || '—') + '</dd></dl></div></div>' +
    '<div class="etqw-prod-nums"><div class="etqw-num">' + svg(ICO.cubo, 22) + '<div><b>' + esc(t('etqw_un_total', { n: numFmt(p.qtd) })) + '</b><span>' + esc(t('etqw_un_total_s')) + '</span></div></div><div class="etqw-num">' + svg(ICO.etiq, 22) + '<div><b>' + esc(W.carregando ? '…' : t('etqw_cx_com_saldo', { n: numFmt(cx.length) })) + '</b><span>' + esc(t('etqw_cx_com_saldo_s')) + '</span></div></div></div></div>';
}
const linhaHTML = c => { const on = !!W.sel[c.codigo]; return '<tr class="etqw-cx' + (on ? ' on' : '') + '" data-cx="' + esc(c.codigo) + '"><td class="etqw-td-chk"><input type="checkbox" class="etqwChk" data-cx="' + esc(c.codigo) + '"' + (on ? ' checked' : '') + '></td><td class="etqw-td-id"><span class="etqw-id">' + svg(ICO.etiq, 14) + esc(c.codigo) + '</span></td><td class="etqw-td-loc" data-rot="' + esc(t('etqw_col_loc')) + '">' + esc(c.corredor ? corrFmt(c.corredor) : '—') + '</td><td class="etqw-td-saldo" data-rot="' + esc(t('etqw_col_saldo')) + '"><b>' + numFmt(c.qtd_restante) + '</b></td><td class="etqw-td-data" data-rot="' + esc(t('etqw_col_entrada')) + '">' + esc(c.criado_em ? dataBR(c.criado_em) : '—') + '</td><td class="etqw-td-n" data-rot="' + esc(t('etqw_col_caixa')) + '">' + esc(t('etqw_caixa_n', { n: c.n })) + '</td></tr>'; };
function tabelaHTML() {
  const todas = caixas(), vis = filtradas(), sel = selecionadas(), todasOn = vis.length > 0 && vis.every(c => !!W.sel[c.codigo]);
  let corpo;
  if (W.carregando) corpo = '<div class="etqw-vazio">' + esc(t('carregando')) + '</div>';
  else if (!todas.length) corpo = '<div class="etqw-vazio">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('etqw_sem_caixas')) + '</div></div>';
  else if (!vis.length) corpo = '<div class="etqw-vazio">' + esc(t('r_nada_encontrado')) + '</div>';
  else corpo = '<div class="etqw-tab-wrap"><table class="etqw-tab"><thead><tr><th class="etqw-td-chk"><input type="checkbox" id="etqwTodas"' + (todasOn ? ' checked' : '') + '></th><th>' + esc(t('etqw_col_id')) + '</th><th>' + esc(t('etqw_col_loc')) + '</th><th>' + esc(t('etqw_col_saldo')) + '</th><th>' + esc(t('etqw_col_entrada')) + '</th><th>' + esc(t('etqw_col_caixa')) + '</th></tr></thead><tbody>' + vis.map(linhaHTML).join('') + '</tbody></table></div>';
  return '<div class="panel etqw-panel" id="etqwTabela"><div class="etqw-h"><h3><span class="etqw-passo">2</span>' + esc(t('etqw_passo2')) + '</h3>' + (todas.length > 3 ? '<div class="etqw-filtro">' + svg(ICO.busca, 14) + '<input id="etqwFiltro" autocomplete="off" placeholder="' + esc(t('etqw_filtro_ph')) + '" value="' + esc(W.filtro) + '"></div>' : '') + '</div>' + corpo +
    (todas.length ? '<div class="etqw-selinfo"><b>' + esc(sel.length === 1 ? t('etqw_sel_1') : t('etqw_sel_n', { n: numFmt(sel.length) })) + '</b><i></i><b>' + esc(t('etqw_sel_un', { n: numFmt(unidades(sel)) })) + '</b></div>' : '') + '</div>';
}
function acoesHTML() {
  if (!podeMexer() || !caixas().length) return '';
  const a = W.acao;
  return '<div class="panel etqw-panel"><div class="etqw-h"><h3><span class="etqw-passo">3</span>' + esc(t('etqw_passo3')) + '</h3></div><p class="etqw-sub">' + esc(t('etqw_passo3_sub')) + '</p><div class="etqw-acoes"><button type="button" class="etqw-acao' + (a === 'somar' ? ' on' : '') + '" data-etqw-acao="somar"><span class="etqw-acao-ico">' + svg(ICO.mais, 20) + '</span><b>' + esc(t('etqw_somar')) + '</b><span>' + esc(t('etqw_somar_d')) + '</span></button><button type="button" class="etqw-acao' + (a === 'dividir' ? ' on' : '') + '" data-etqw-acao="dividir"><span class="etqw-acao-ico">' + svg(ICO.camadas, 20) + '</span><b>' + esc(t('etqw_dividir')) + '</b><span>' + esc(t('etqw_dividir_d')) + '</span></button></div>' + (a === 'somar' ? somarHTML() : a === 'dividir' ? dividirHTML() : '') + '</div>';
}
function somarFica(sel) { if (W.manter === '*') return ''; for (const c of sel) if (c.codigo === W.manter) return c.codigo; return sel.length ? sel[0].codigo : ''; }
function somarHTML() {
  const sel = selecionadas(), tot = unidades(sel);
  if (sel.length < 2) return '<div class="etqw-op"><h4>' + esc(t('etqw_somar_tit')) + '</h4><div class="aviso">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('etqw_somar_min')) + '</div></div></div>';
  const fica = somarFica(sel), nova = !fica;
  return '<div class="etqw-op"><h4>' + esc(t('etqw_somar_tit')) + '</h4><div class="etqw-op-fica">' + esc(t('etqw_somar_fica')) + '</div><div class="etqw-op-lista">' + sel.map(c => { const on = fica === c.codigo; return '<label class="etqw-op-item etqw-manter' + (on ? ' on' : '') + '"><input type="radio" name="etqwManter" value="' + esc(c.codigo) + '"' + (on ? ' checked' : '') + '><span>' + esc(t('etqw_caixa_n', { n: c.n })) + ' · <code>' + esc(c.codigo) + '</code>' + (on ? '<em class="etqw-fica-tag">' + esc(t('etqw_somar_manter')) + '</em>' : '') + '</span><b>' + numFmt(c.qtd_restante) + '</b></label>'; }).join('') +
    '<label class="etqw-op-item etqw-manter etqw-manter-nova' + (nova ? ' on' : '') + '"><input type="radio" name="etqwManter" value="*"' + (nova ? ' checked' : '') + '><span>' + esc(t('etqw_somar_nova_opc')) + '</span><b></b></label><div class="etqw-op-item total"><span>' + esc(t('etqw_total')) + '</span><b>' + esc(t('etqw_n_un', { n: numFmt(tot) })) + '</b></div></div>' +
    '<div class="aviso etqw-op-aviso">' + svg(ICO.ajuda, 16) + '<div>' + esc(nova ? t('etqw_somar_aviso', { n: numFmt(sel.length), un: numFmt(tot) }) : t(sel.length === 2 ? 'etqw_somar_aviso_manter1' : 'etqw_somar_aviso_manter', { codigo: fica, n: numFmt(sel.length - 1), un: numFmt(tot) })) + '</div></div>' +
    '<button type="button" class="btn primary" data-act="etqw-somar-ok"' + (W.ocupado ? ' disabled' : '') + '>' + svg(ICO.mais, 15) + ' ' + esc(nova ? t('etqw_somar_ok') : t('etqw_somar_ok_manter', { codigo: fica })) + '</button></div>';
}
function divCalc(c) {
  const saldo = Number(c.qtd_restante) || 0, v = Math.floor(Number(W.divValor) || 0); if (v <= 0) return null;
  let partes, fica; const novas = [];
  if (W.divModo === 'porcaixa') { if (v >= saldo) return { erro: t('etqw_div_erro_maior', { n: numFmt(saldo) }) }; partes = Math.ceil(saldo / v); if (partes > 20) return { erro: t('etqw_div_erro_20') }; fica = saldo - (partes - 1) * v; for (let i = 1; i < partes; i++) novas.push(v); }
  else if (W.divModo === 'nova') { if (v >= saldo) return { erro: t('etqw_div_erro_maior', { n: numFmt(saldo) }) }; partes = 2; fica = saldo - v; novas.push(v); }
  else { partes = v; if (partes < 2) return { erro: t('etqw_div_erro_2') }; if (partes > saldo) return { erro: t('etqw_div_erro_maior', { n: numFmt(saldo) }) }; if (partes > 20) return { erro: t('etqw_div_erro_20') }; const b = Math.floor(saldo / partes); fica = b + (saldo - b * partes); for (let j = 1; j < partes; j++) novas.push(b); }
  return { partes, fica, novas, saldo };
}
function dividirHTML() {
  const sel = selecionadas(); let corpo;
  if (sel.length !== 1) corpo = '<div class="aviso">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('etqw_div_uma')) + '</div></div>';
  else if (sel[0].qtd_restante < 2) corpo = '<div class="aviso">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('etqw_div_uma_un')) + '</div></div>';
  else {
    const c = sel[0], calc = divCalc(c), pc = W.divModo === 'porcaixa', fc = W.divModo === 'nova';
    corpo = '<div class="etqw-op-lista"><div class="etqw-op-item"><span><code>' + esc(c.codigo) + '</code> · ' + esc(t('etqw_caixa_n', { n: c.n })) + '</span><b>' + esc(t('etqw_saldo_atual', { n: numFmt(c.qtd_restante) })) + '</b></div></div><div class="etqw-div-modos"><button type="button" class="btn sm' + (fc ? ' on' : '') + '" data-etqw-divmodo="nova">' + esc(t('etqw_div_nova_modo')) + '</button><button type="button" class="btn sm' + (pc ? ' on' : '') + '" data-etqw-divmodo="porcaixa">' + esc(t('etqw_div_porcaixa')) + '</button><button type="button" class="btn sm' + (pc || fc ? '' : ' on') + '" data-etqw-divmodo="partes">' + esc(t('etqw_div_partes')) + '</button></div>' +
      '<label class="etqw-div-campo">' + esc(pc ? t('etqw_div_porcaixa_l') : fc ? t('etqw_div_nova_l') : t('etqw_div_partes_l')) + '<input id="etqwDivValor" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="' + esc(W.divValor) + '" placeholder="' + (pc || fc ? '50' : '2') + '"></label>';
    if (calc && calc.erro) corpo += '<div class="aviso etqw-op-aviso erro">' + svg(ICO.alerta, 16) + '<div>' + esc(calc.erro) + '</div></div>';
    else if (calc && fc) corpo += '<div class="etqw-div-desenho etqw-div-2"><div class="etqw-div-orig"><span>' + esc(t('etqw_div_original')) + '</span><b>' + numFmt(calc.saldo) + '</b></div><div class="etqw-div-seta">' + svg(ICO.setaV, 18) + '</div><div class="etqw-div-novas"><div class="etqw-div-nova orig"><span>' + esc(t('etqw_div_fica_atual')) + '</span><b>' + numFmt(calc.fica) + '</b><i>' + esc(c.codigo) + '</i></div><div class="etqw-div-nova"><span>' + esc(t('etqw_div_recebe_nova')) + '</span><b>' + numFmt(calc.novas[0]) + '</b><i>' + esc(t('etqw_div_nova')) + '</i></div></div></div>' +
      '<div class="aviso etqw-op-aviso">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('etqw_div_aviso_nova', { codigo: c.codigo, fica: numFmt(calc.fica), nova: numFmt(calc.novas[0]) })) + '</div></div><button type="button" class="btn primary" data-act="etqw-dividir-ok"' + (W.ocupado ? ' disabled' : '') + '>' + svg(ICO.camadas, 15) + ' ' + esc(t('etqw_dividir_ok_nova', { n: numFmt(calc.novas[0]) })) + '</button>';
    else if (calc) corpo += '<div class="etqw-div-desenho"><div class="etqw-div-orig"><span>' + esc(t('etqw_div_original')) + '</span><b>' + numFmt(calc.saldo) + '</b></div><div class="etqw-div-seta">' + svg(ICO.setaV, 18) + '</div><div class="etqw-div-novas"><div class="etqw-div-nova orig"><span>' + esc(t('etqw_caixa_n', { n: 1 })) + '</span><b>' + numFmt(calc.fica) + '</b><i>' + esc(c.codigo) + '</i></div>' + calc.novas.map((q, i) => '<div class="etqw-div-nova"><span>' + esc(t('etqw_caixa_n', { n: i + 2 })) + '</span><b>' + numFmt(q) + '</b><i>' + esc(t('etqw_div_nova')) + '</i></div>').join('') + '</div></div>' +
      '<div class="aviso etqw-op-aviso">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('etqw_div_aviso', { n: numFmt(calc.novas.length), fica: numFmt(calc.fica), total: numFmt(calc.partes) })) + '</div></div><button type="button" class="btn primary" data-act="etqw-dividir-ok"' + (W.ocupado ? ' disabled' : '') + '>' + svg(ICO.camadas, 15) + ' ' + esc(t('etqw_dividir_ok', { total: numFmt(calc.partes) })) + '</button>';
  }
  return '<div class="etqw-op"><h4>' + esc(t('etqw_dividir_tit')) + '</h4>' + corpo + '</div>';
}
const tipoHTML = () => '<div class="panel etqw-panel"><div class="etqw-h"><h3><span class="etqw-passo">4</span>' + esc(t('etqw_passo4')) + '</h3></div><div class="etqw-cards">' + Object.keys(TIPOS).map(k => { const m = TIPOS[k], on = k === W.tipo; return '<button type="button" class="etqw-card' + (on ? ' on' : '') + '" data-etqw-tipo="' + k + '"><span class="etqw-card-ico">' + svg(ICO[m.ico] || ICO.etiq, 22) + '</span><span class="etqw-card-chk">' + svg(ICO.check, 12) + '</span><b>' + esc(t(m.tit)) + '</b><span>' + esc(t(m.desc)) + '</span></button>'; }).join('') + '</div></div>';
const tamanhoHTML = () => { const at = tamAtual(); return '<div class="panel etqw-panel"><div class="etqw-h"><h3><span class="etqw-passo">5</span>' + esc(t('etqw_passo5')) + '</h3></div><div class="etqw-cards">' + tipo().ordem.map(k => { const m = TAMANHOS[k], on = k === at; return '<button type="button" class="etqw-card tam' + (on ? ' on' : '') + '" data-etqw-tam="' + k + '"><span class="etqw-card-ico"><i class="etqw-mini' + (k !== '3' ? ' g' : '') + '"></i></span><span class="etqw-card-chk">' + svg(ICO.check, 12) + '</span><b>' + esc(t(m.tit)) + '</b><span class="etqw-card-cm">' + esc(t(m.sub)) + '</span><span>' + esc(t(m.desc)) + '</span></button>'; }).join('') + '</div></div>'; };
function previaHTML(p) {
  const sel = selecionadas(), tp = tipo(), tam = tp.tamanhos[tamAtual()];
  const corpo = !p || !sel.length ? '<div class="etqw-previa-vazia">' + svg(ICO.etiq, 28) + '<div>' + esc(p ? t('etqw_previa_marque') : t('etqw_previa_busque')) + '</div></div>'
    : '<div class="etqw-previa" data-w="' + tam.w + '" data-h="' + tam.h + '"><div class="etqw-previa-in">' + tam.monta(tp.item(p, sel[0])) + '</div></div><div class="etqw-previa-leg">' + esc(t(TAMANHOS[tamAtual()].tit)) + ' · ' + esc(sel[0].codigo) + (sel.length > 1 ? ' · ' + esc(t('etqw_previa_mais', { n: numFmt(sel.length - 1) })) : '') + '</div>';
  return '<div class="panel etqw-panel etqw-lado-previa"><div class="etqw-h"><h3>' + esc(t('etqw_previa')) + '</h3></div>' + corpo + '</div>';
}
function resumoHTML(p) {
  const sel = selecionadas(), n = sel.length, cop = Math.max(1, Number(W.copias) || 1);
  return '<div class="panel etqw-panel etqw-lado-resumo"><div class="etqw-h"><h3>' + esc(t('etqw_resumo')) + '</h3></div><dl class="etqw-res"><dt>' + esc(t('etqw_res_prod')) + '</dt><dd>' + esc(p ? p.sku : '—') + '</dd><dt>' + esc(t('etqw_res_etq')) + '</dt><dd>' + numFmt(n) + '</dd><dt>' + esc(t('etqw_res_un')) + '</dt><dd>' + numFmt(unidades(sel)) + '</dd><dt>' + esc(t('etqw_res_tipo')) + '</dt><dd>' + esc(t(tipo().tit)) + '</dd><dt>' + esc(t('etqw_res_tam')) + '</dt><dd>' + esc(t(TAMANHOS[tamAtual()].tit)) + '</dd>' +
    '<dt>' + esc(t('etqw_res_copias')) + '</dt><dd><span class="etqw-cop"><button type="button" class="btn sm" data-etqw-cop="-1">' + svg('<path d="M5 12h14"/>', 13) + '</button><b>' + cop + '</b><button type="button" class="btn sm" data-etqw-cop="1">' + svg(ICO.mais, 13) + '</button></span></dd><dt>' + esc(t('etqw_res_pag')) + '</dt><dd>' + numFmt(n * cop) + '</dd></dl>' +
    '<button type="button" class="btn primary etqw-imprimir" data-act="etqw-imprimir"' + (n ? '' : ' disabled') + '>' + svg(ICO.print, 17) + ' ' + esc(n === 1 ? t('etqw_imprimir_1') : t('etqw_imprimir_n', { n: numFmt(n) })) + '</button></div>';
}
const barraHTML = () => { const sel = selecionadas(), n = sel.length; return '<div class="etqw-barra"><div class="etqw-barra-txt"><b>' + esc(n === 1 ? t('etqw_sel_1') : t('etqw_sel_n', { n: numFmt(n) })) + '</b><span>' + esc(t('etqw_sel_un', { n: numFmt(unidades(sel)) })) + '</span></div><button type="button" class="btn primary" data-act="etqw-imprimir"' + (n ? '' : ' disabled') + '>' + svg(ICO.print, 16) + ' ' + esc(n === 1 ? t('etqw_imprimir_1') : t('etqw_imprimir_n', { n: numFmt(n) })) + '</button></div>'; };
function areaHTML() { const p = prodSel(); if (!p) return '<div id="etqwArea"></div>'; return '<div id="etqwArea" class="etqw"><div class="etqw-esq">' + produtoHTML(p) + tabelaHTML() + acoesHTML() + tipoHTML() + tamanhoHTML() + '</div><div class="etqw-dir">' + previaHTML(p) + resumoHTML(p) + '</div>' + barraHTML() + '</div>'; }
function resultadosHTML() {
  const e = prodSel(), L = e ? [] : E.buscaProdutos(W.busca);
  let o = '<div id="etqTabRes">';
  if (!e) o += W.busca && !L.length ? '<div class="aviso" style="margin:0 17px 16px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('r_nada_encontrado')) + '</div></div>' : L.length ? '<div class="achados"><h4>' + esc(L3('찾은 상품', 'Products found', 'Produtos encontrados')) + ' (' + L.length + ')</h4>' + L.map(p => '<button type="button" class="achado" data-pick-etqtab="' + esc(p.id) + '"><b>' + esc(p.nome) + '</b><span>' + esc(p.barcode || '') + (p.descricao ? (p.barcode ? ' · ' : '') + esc(p.descricao) : '') + ' · ' + esc(t('c_qtd')) + ': ' + p.qtd + (p.corredor ? ' · ' + esc(corrFmt(p.corredor)) : '') + '</span></button>').join('') + '</div>' : '<div class="aviso" style="margin:0 17px 16px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('etqw_digite')) + '</div></div>';
  return o + '</div>';
}
function tela() {
  const e = prodSel();
  $('page').innerHTML = '<div class="sb etqw-tela"><div class="page-head etqw-head"><div class="etqw-head-ico">' + svg(ICO.print, 26) + '</div><div><h1>' + esc(t('etqw_titulo')) + '</h1><p>' + esc(t('etqw_sub')) + '</p></div></div>' +
    '<div class="panel etqw-panel etqw-busca"><div class="etqw-h"><h3><span class="etqw-passo">1</span>' + esc(t('etqw_passo1')) + '</h3></div><div class="campo-scan"><div class="etqw-campo">' + svg(ICO.busca, 17) + '<input id="etqTabBusca" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="' + esc(t('etqw_busca_ph')) + '" value="' + esc(e ? e.sku : W.busca) + '"' + (e ? ' readonly' : '') + '>' + (e ? '<button type="button" class="etqw-limpar" data-act="etqtab-trocar" title="' + esc(t('r_trocar')) + '">' + svg(ICO.x, 15) + '</button>' : '') + '</div><button type="button" class="scan-btn" data-scan="etiquetas-tab" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 18) + '</button></div>' + resultadosHTML() + '</div>' + areaHTML() + '</div>';
  const raiz = document.querySelector('#page .sb'); raiz.onclick = clique;
  const r = $('etqTabBusca');
  if (r && !e) { r.oninput = () => { W.busca = r.value; const a = $('etqTabRes'); if (a) a.outerHTML = resultadosHTML(); }; r.onkeydown = ev => { if (ev.key !== 'Enter') return; ev.preventDefault(); escolherTexto(r.value); }; setTimeout(() => { try { r.focus(); } catch (x) {} }, 50); }
  ligarArea();
}
function escolherTexto(v) {
  const cod = E.etqCodigo(v) || (/^[0-9A-Z]{8}$/.test(String(v).trim().toUpperCase()) && !E.buscaProdutos(v).length ? String(v).trim().toUpperCase() : '');
  if (cod) return E.lerEtiqueta(cod).then(x => { if (x) { W.busca = ''; carregar(x.produto_id, [cod]).then(tela); } else toast(t('r_nada_encontrado'), 'bad'); });
  const L = E.buscaProdutos(E.prodDoQr(v) || v);
  if (L.length) { W.busca = ''; carregar(L[0].id).then(tela); tela(); } else toast(t('r_nada_encontrado'), 'bad');
}
function repintar() { const alvo = $('etqwArea'); if (!alvo || location.hash.indexOf('#/etiquetas') !== 0) return; const m = document.createElement('div'); m.innerHTML = areaHTML(); alvo.replaceWith(m.firstChild); ligarArea(); }
function escalarPrevia() {
  const p = document.querySelector('#etqwArea .etqw-previa'); if (!p) return;
  const w = Number(p.dataset.w) * 96, h = Number(p.dataset.h) * 96, k = Math.min(1, (p.clientWidth - 2) / w), inner = p.querySelector('.etqw-previa-in');
  inner.style.width = w + 'px'; inner.style.height = h + 'px'; inner.style.transform = 'scale(' + k + ')'; inner.style.transformOrigin = 'top left'; p.style.height = Math.round(h * k) + 2 + 'px';
  E.ajustarEtiquetas(inner);
}
function ligarArea() {
  const area = $('etqwArea'); if (!area) return;
  const todas = $('etqwTodas'); if (todas) todas.onchange = () => { filtradas().forEach(c => { W.sel[c.codigo] = todas.checked; }); repintar(); };
  area.querySelectorAll('.etqwChk').forEach(ch => { ch.onchange = () => { W.sel[ch.dataset.cx] = ch.checked; repintar(); }; });
  const f = $('etqwFiltro'); if (f) f.oninput = () => { W.filtro = f.value; const pos = f.selectionStart, tb = $('etqwTabela'); const m = document.createElement('div'); m.innerHTML = tabelaHTML(); tb.replaceWith(m.firstChild); ligarArea(); const f2 = $('etqwFiltro'); if (f2) { f2.focus(); try { f2.setSelectionRange(pos, pos); } catch (e) {} } };
  const dv = $('etqwDivValor'); if (dv) { dv.oninput = () => { W.divValor = dv.value.replace(/\D/g, ''); const op = area.querySelector('.etqw-op'), pos = dv.selectionStart; const m = document.createElement('div'); m.innerHTML = dividirHTML(); op.replaceWith(m.firstChild); ligarArea(); const d2 = $('etqwDivValor'); if (d2) { d2.focus(); try { d2.setSelectionRange(pos, pos); } catch (e) {} } }; dv.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); dividirAgora(); } }; }
  area.querySelectorAll('input[name="etqwManter"]').forEach(r => { r.onchange = () => { if (r.checked) { W.manter = r.value; repintar(); } }; });
  escalarPrevia();
}
function clique(e) {
  const c = s => e.target.closest(s); let b;
  if ((b = c('[data-scan]'))) return openScanner(code => { if ($('etqTabBusca') && !prodSel()) escolherTexto(code); else { W.prodId = ''; tela(); escolherTexto(code); } }, { title: t('sc_abrir') });
  if ((b = c('[data-pick-etqtab]'))) { W.busca = ''; carregar(b.dataset.pickEtqtab); return tela(); }
  if (c('[data-act="etqtab-trocar"]')) { Object.assign(W, { prodId: '', busca: '', lista: null, sel: {}, acao: null }); return tela(); }
  if (c('.etqwChk') || c('#etqwTodas') || c('input[name="etqwManter"]') || c('#etqwFiltro') || c('#etqwDivValor')) return;
  if ((b = c('tr.etqw-cx'))) { const cod = b.dataset.cx; W.sel[cod] = !W.sel[cod]; return repintar(); }
  if ((b = c('[data-etqw-acao]'))) { const a = b.dataset.etqwAcao; W.acao = W.acao === a ? null : a; repintar(); const x = $('etqwDivValor'); if (x) x.focus(); return; }
  if ((b = c('[data-etqw-divmodo]'))) { W.divModo = b.dataset.etqwDivmodo; W.divValor = ''; repintar(); const x = $('etqwDivValor'); if (x) x.focus(); return; }
  if ((b = c('[data-etqw-tipo]'))) { W.tipo = b.dataset.etqwTipo; return repintar(); }
  if ((b = c('[data-etqw-tam]'))) { W.tam = b.dataset.etqwTam; if (W.tam !== '44') E.etqTamGuardar(W.tam); return repintar(); }
  if ((b = c('[data-etqw-cop]'))) { W.copias = Math.min(50, Math.max(1, (Number(W.copias) || 1) + Number(b.dataset.etqwCop))); return repintar(); }
  if (c('[data-act="etqw-somar-ok"]')) return somarAgora();
  if (c('[data-act="etqw-dividir-ok"]')) return dividirAgora();
  if (c('[data-act="etqw-imprimir"]')) return imprimir();
}
async function somarAgora() {
  const sel = selecionadas(); if (sel.length < 2 || W.ocupado) return;
  W.ocupado = true; repintar(); busy(true);
  try { const d = await E.somar(sel.map(c => c.codigo), somarFica(sel) || null); toast(t(d.mantida ? 'etqw_somar_feito_manter' : 'etqw_somar_feito', { n: numFmt(sel.length), codigo: d.codigo, un: numFmt(d.qtd) }), 'good'); W.acao = null; W.manter = ''; W.ocupado = false; busy(false); await carregar(W.prodId, [d.codigo]); }
  catch (e) { W.ocupado = false; busy(false); toast(String(e.message || e), 'bad'); repintar(); }
}
async function dividirAgora() {
  const sel = selecionadas(); if (sel.length !== 1 || W.ocupado) return;
  const c = sel[0], calc = divCalc(c); if (!calc || calc.erro) return;
  const v = Math.floor(Number(W.divValor) || 0), pc = W.divModo === 'porcaixa', fc = W.divModo === 'nova';
  W.ocupado = true; repintar(); busy(true);
  try { const d = await E.dividir(c.codigo, fc ? { qtd: v } : pc ? { porCaixa: v } : { partes: v }); toast(t('etqw_div_feito', { codigo: d.codigo, n: numFmt(d.novas.length), fica: numFmt(d.fica) }), 'good'); W.acao = null; W.divValor = ''; W.ocupado = false; busy(false); await carregar(W.prodId, [c.codigo].concat(d.novas.map(x => x.codigo))); }
  catch (e) { W.ocupado = false; busy(false); toast(String(e.message || e), 'bad'); repintar(); }
}
/** 옛 etqwImprimir — 한 번에. 인쇄 뒤 화면은 다음 상품 찾기로 (옛 etqwNovaBusca) */
async function imprimir() {
  const p = prodSel(), sel = selecionadas(); if (!p || !sel.length) return toast(t('etq_val_nenhuma_sel'), 'bad');
  const tp = tipo(), k = tamAtual(), tam = tp.tamanhos[k], cop = Math.max(1, Number(W.copias) || 1);
  if (W.tipo === 'estoque') E.etqTamGuardar(k);
  const itens = sel.map(c => tp.item(p, c));
  await E.imprimirLabels(() => { let h = ''; itens.forEach(x => { for (let i = 0; i < cop; i++) h += tam.monta(x); }); return h; });
  Object.assign(W, { prodId: '', busca: '', lista: null, sel: {}, acao: null });
  if (location.hash.indexOf('#/etiquetas') === 0) tela();
}
