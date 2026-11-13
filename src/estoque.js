/* ============================================================
 *  📦 재고 (#/estoque) — 옛 THE ONE CORP WMS 의 "Estoque" 화면을 그대로 (레이아웃 · 글 · 동작)
 *    조회(consulta)  1단계 = 창고 지도 (통로 카드 · 색 = 상태 · 숫자 4칸 · 검색/스캔 · 지도/목록)
 *                    2단계 = 통로 하나 또는 전체 목록 (선택 · 사진 · 통로 · 이름 · 수량 · 상태 · 필터 · 통로 옮기기 · 줄을 열면 상자들)
 *                    폰: 위쪽 새 머리(검색 · 입고/출고 · 숫자 두 칸) · 통로 카드 한 줄 · 통로 안은 상품군 격자
 *    입고(entrada)   상품 찾기/스캔 → 수량 · 같은 라벨 N 장 → 이미 있는 상자에 더할지 묻기 → 24시간 안 중복 경고 → 상자 라벨 인쇄
 *    출고(saida)     어느 상자에서 몇 개씩 (제안 배분) → 상자 · 재고 차감
 *    내 최근 이동    다시 인쇄 · 자세히 · 되돌리기(48시간 · 내 것) / 아니면 요청 → 관리자가 승인 (조회 화면 위 대기 줄)
 *  입고 · 출고는 재고 담당(can items)만 — 세일즈맨은 조회만 (옛 앱: 영업 · 피킹은 조회 고정)
 *  옛 앱의 AI 사진 읽기(ler-etiqueta)는 옮기지 않음. 데이터 · 규칙은 etq.js
 * ============================================================ */
import { $, esc, toast, Router, busy, debounce } from './ui.js';
import { openScanner } from './scan.js';
import { itemSheet } from './stock.js';
import * as E from './etq.js';
import { L3 } from './balcao.js';
import { reposAbertas, reporCardHTML, pedirReposicaoPopup, injetarCssRepor } from './repor.js';

const { t, svg, ICO, numFmt, dataBR, horaCurta, corrFmt, CORREDORES, ordemCorr, familiaCodigo, podeMexer, gerente, prod, SIT_CLS, SIT_TXT } = E;
let S = null;
export function register(state) {
  S = state; E.init(state); Router.on('estoque', page);
  /* 피킹 라벨의 QR(?p=코드) → 조회 화면에서 그 상품 */
  try { const m = String(location.search || '').match(/[?&]p=([^&#]+)/); if (m) history.replaceState(null, '', location.pathname + '#/estoque/p/' + encodeURIComponent(decodeURIComponent(m[1]))); } catch (e) {}
}

/* ---------- 상태 (옛 S.es* 그대로) ---------- */
const ES = { modo: 'consulta', vista: 'mapa', ord: 'corr', corredor: '', busca: '', sit: '', cat: '', forn: '', sel: {}, expand: '', pag: 1,
  prod: '', pbusca: '', qtd: '', etqN: '', famVista: '', famBusca: '', famOrd: 'prods', lstOrd: '', corrSit: '', filtrosAb: false,
  mm: null, mmErro: false, mmTodas: false, etq: {}, fila: null };
const POR_PAG = 12, MM_CURTO = 3;
const mob = () => window.innerWidth <= 760;
const P = () => E.produtos();
let PR = [];   // 상품 목록 (그리는 동안)

async function page(arg) {
  E.injetarCss();
  if (arg) { const a = String(arg); if (a.indexOf('p/') === 0) Object.assign(ES, { modo: 'consulta', vista: 'lista', corredor: '', busca: decodeURIComponent(a.slice(2)), pag: 1 }); else if (a === 'entrada' || a === 'saida' || a === 'consulta') ES.modo = a; else if (decodeURIComponent(a).indexOf('entrada/') === 0) Object.assign(ES, { modo: 'entrada', prod: decodeURIComponent(a).slice(8).toUpperCase(), pbusca: '', qtd: '', etqN: '' }); }   // 📦 상품 → "등록 + 입고" 뒤 그 상품으로 바로 입고
  if (!PR.length) $('page').innerHTML = '<div class="sb est-tela"><div class="placeholder">' + esc(t('carregando')) + '</div></div>';
  try { PR = await P(); } catch (e) { toast(String(e.message || e), 'bad'); PR = []; }
  if (location.hash.indexOf('#/estoque') !== 0) return;
  render();
}
function render() {
  if (location.hash.indexOf('#/estoque') !== 0) return;
  if (!podeMexer()) ES.modo = 'consulta';
  if (ES.modo === 'entrada' || ES.modo === 'saida') return telaMov(ES.modo);
  telaConsulta();
}
const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>';
const tile = (l, v, cls, s) => '<div class="tile"><div class="lbl">' + esc(l) + '</div><div class="val ' + (cls || '') + '">' + esc(v == null ? '—' : v) + '</div><div class="sub">' + esc(s || '') + '</div></div>';

/* ---------- barra de modos (옛 barraModos) ---------- */
function barraModos(soMov) {
  const e = ES.modo || 'consulta';
  const modo = (k, cls, ico) => '<button type="button" class="modo' + cls + (k === e ? ' on' : '') + '" data-modo="' + k + '"><i class="modo-ico">' + svg(ico, 17) + '</i><span class="modo-tx">' + esc(t('es_' + k)) + '<small>' + esc(t('es_' + k + '_sub')) + '</small></span><span class="modo-curto">' + esc(t('es_' + k + '_c')) + '</span></button>';
  if (soMov) return podeMexer() ? '<div class="modos es-tmodos">' + modo('entrada', ' ent', ICO.entra) + modo('saida', ' sai', ICO.sai2) + '</div>' : '';
  return '<div class="modos">' + modo('consulta', '', ICO.busca) + (podeMexer() ? modo('entrada', ' ent', ICO.entra) + modo('saida', ' sai', ICO.sai2) : '') + '</div>';
}

/* ============================================================
 *  CONSULTA (옛 telaEstoque)
 * ============================================================ */
function corrResumo() {
  const m = {};
  PR.forEach(p => { const c = p.corredor; if (!c) return; const r = m[c] || (m[c] = { prods: 0, zer: 0, un: 0, fam: {} }); const q = Number(p.qtd) || 0, f = familiaCodigo(p.sku); r.prods++; r.un += q; if (!q) r.zer++; if (f) r.fam[f] = (r.fam[f] || 0) + 1; });
  return m;
}
const corrFams = r => Object.keys(r.fam || {}).sort((a, b) => r.fam[b] - r.fam[a] || a.localeCompare(b));
function corrFamsHTML(r) {
  const fs = corrFams(r), mostra = fs.slice(0, 6), resto = fs.length - mostra.length, restoM = fs.length - 2;
  if (!fs.length) return '<div class="corr-fams"><span class="corr-vazio">—</span></div>';
  return '<div class="corr-fams">' + mostra.map(f => '<span class="corr-fam">' + esc(f) + '</span>').join('') + (resto > 0 ? '<span class="corr-fam mais">+' + resto + '</span>' : '') + (restoM > 0 ? '<span class="corr-mais-m">+' + restoM + '</span>' : '') + '</div>';
}
function corrTitulo(cod, r) { const fs = corrFams(r); return cod + ' · ' + (r.prods === 1 ? t(r.zer ? 'e_ins_prod1_zer' : 'e_ins_prod1') : r.zer ? t('e_ins_prods_zer', { n: r.prods, z: r.zer }) : t('e_ins_prods', { n: r.prods })) + ' · ' + numFmt(r.un) + ' ' + t('un_curto') + (fs.length ? ' · ' + fs.join(' ') : ''); }
function corrListaOrdenada(res) {
  let L = CORREDORES.concat(Object.keys(res).filter(c => CORREDORES.indexOf(c) < 0).sort());
  if (ES.ord === 'un' || ES.ord === 'prod') { const ch = ES.ord === 'un' ? 'un' : 'prods'; L = L.slice().sort((a, b) => ((res[b] || {})[ch] || 0) - ((res[a] || {})[ch] || 0) || ordemCorr(a) - ordemCorr(b)); }
  return L;
}
function mapaCorredoresHTML(res) {
  let max = 1; Object.keys(res).forEach(c => { if (res[c].un > max) max = res[c].un; });
  return '<div class="corr-mapa">' + corrListaOrdenada(res).map(c => {
    const cod = corrFmt(c), lg = cod.length > 4 ? ' lg' : '', r = res[c];
    if (!r) return '<div class="corr-cel vazio"><span class="corr-pt n"></span><div class="corr-cod' + lg + '">' + esc(cod) + '</div><div class="corr-fams"><span class="corr-vazio">' + esc(t('e_nada')) + '</span></div><span class="corr-chev">' + svg(ICO.dir, 16) + '</span></div>';
    const pt = r.zer ? (r.zer === r.prods ? 'r' : 'a') : 'g';
    return '<button type="button" class="corr-cel' + (ES.corredor === c ? ' sel' : '') + '" data-corr-abrir="' + esc(c) + '" title="' + esc(corrTitulo(cod, r)) + '"><span class="corr-pt ' + pt + '"></span><div class="corr-cod' + lg + '">' + esc(cod) + '</div><span class="corr-n">' + esc(r.prods === 1 ? t('e_skus_1') : t('e_skus_n', { n: r.prods })) + '</span>' + corrFamsHTML(r) + '<span class="corr-chev">' + svg(ICO.dir, 16) + '</span></button>';
  }).join('') + '</div>';
}
const corrPt = r => r.zer ? (r.zer === r.prods ? 'r' : 'a') : 'g';
function listaEstoque() {
  const q = String(ES.busca || '').trim().toLowerCase();
  let L = PR.filter(p => {
    const a = p.corredor;
    if (ES.corredor === '__sem') { if (a) return false; } else if (ES.corredor && a !== ES.corredor) return false;
    if (ES.cat && p.categoria !== ES.cat) return false;
    if (ES.forn && p.fornecedor !== ES.forn) return false;
    const n = Number(p.qtd) || 0; if (ES.sit === 'saldo' && !n) return false; if (ES.sit === 'zero' && n) return false;
    return !(q && [p.nome, p.sku, p.barcode, p.loc, p.descricao].join(' ').toLowerCase().indexOf(q) < 0);
  });
  L.sort((x, y) => (ordemCorr(x.corredor) - ordemCorr(y.corredor)) || String(x.corredor).localeCompare(String(y.corredor)) || String(x.nome).localeCompare(String(y.nome)));
  const o = ES.corredor && ES.lstOrd;
  if (o === 'za') L.reverse(); else if (o === 'mais') L.sort((a, b) => b.qtd - a.qtd); else if (o === 'menos') L.sort((a, b) => a.qtd - b.qtd);
  return L;
}
function paginar(L) { const tp = Math.max(1, Math.ceil(L.length / POR_PAG)); if (ES.pag > tp) ES.pag = tp; return { pag: L.slice((ES.pag - 1) * POR_PAG, ES.pag * POR_PAG), totalPag: tp }; }
const paginacaoHTML = n => n <= 1 ? '' : '<div class="pager"><button type="button" class="btn sm" data-act="ant"' + (ES.pag <= 1 ? ' disabled' : '') + '>' + svg(ICO.esq, 14) + '</button><span>' + esc(t('pagina')) + ' ' + ES.pag + ' ' + esc(t('de')) + ' ' + n + '</span><button type="button" class="btn sm" data-act="prox"' + (ES.pag >= n ? ' disabled' : '') + '>' + svg(ICO.dir, 14) + '</button></div>';
const cats = () => Array.from(new Set(PR.map(p => p.categoria).filter(Boolean))).sort();
const forns = () => Array.from(new Set(PR.map(p => p.fornecedor).filter(Boolean))).sort();
const selN = () => Object.keys(ES.sel).filter(k => ES.sel[k]).length;
const sitBadge = p => '<span class="badge ' + (SIT_CLS[p.situacao] || 'ok') + '">' + esc(t(SIT_TXT[p.situacao] || 'st_ok')) + '</span>';

/* 폰 머리 (옛 esTopoCabHTML · esTopoCtlHTML) */
function esTopoCabHTML(usados, totProd, semCorr) {
  const num = (ico, l, v, s) => '<div class="es-tnum"><i>' + svg(ico, 20) + '</i><div><span>' + esc(l) + '</span><b>' + esc(v) + '</b><small>' + esc(s) + '</small></div></div>';
  return '<div class="es-tcab"><h1>' + esc(t('e_titulo')) + '</h1></div><div class="es-mtb es-tbusca"><div class="tb-search">' + svg(ICO.busca, 18) + '<input type="search" id="eBusca" placeholder="' + esc(t('es_tbusca')) + '" value="' + esc(ES.busca) + '"><button type="button" class="scan-in" data-scan="estoque" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 20) + '</button></div></div>' + barraModos(true) +
    '<div class="es-tnums">' + num(ICO.camadas, t('e_corredores'), usados + ' / ' + CORREDORES.length, t('e_ins_vazios', { n: Math.max(CORREDORES.length - usados, 0) })) + num(ICO.cubo, t('e_alocados'), numFmt(totProd), t('e_ins_em_corr', { n: usados })) + '</div>' +
    (semCorr ? '<button type="button" class="es-tsem" data-act="corr-sem">' + svg(ICO.alerta, 16) + '<span>' + esc(t('es_tsem', { n: numFmt(semCorr) })) + '</span><b>' + esc(t('e_alocar')) + '</b>' + svg(ICO.dir, 14) + '</button>' : '');
}
const esTopoCtlHTML = (mapa, filtros) => '<div class="es-tctl"><div class="es-tseg"><button type="button"' + (mapa ? ' class="on"' : ' data-act="corr-mapa"') + '>' + svg(ICO.painel, 18) + esc(t('e_ver_mapa')) + '</button><button type="button"' + (mapa ? ' data-act="corr-lista"' : ' class="on"') + '>' + svg(ICO.menu, 18) + esc(t('e_ver_lista')) + '</button></div>' + filtros + '</div>';
const esSelW = (rot, on, sel) => '<label class="es-tsel' + (on ? ' on' : '') + '"><span>' + esc(rot) + '</span>' + sel + '</label>';
const esTopoFiltrosMapa = () => '<div class="es-mtb-l2">' + esSelW(t('es_f_sit'), ES.corrSit, '<select class="flt" id="eCorrSit">' + opt('', t('es_f_todas'), ES.corrSit) + opt('uso', t('es_cs_f_uso'), ES.corrSit) + opt('aten', t('es_cs_f_aten'), ES.corrSit) + opt('vazio', t('es_cs_f_vazio'), ES.corrSit) + '</select>') + esSelW(t('es_f_ord'), ES.ord !== 'corr', '<select class="flt" id="eOrd">' + opt('corr', t('es_o_corr'), ES.ord) + opt('un', t('es_o_un'), ES.ord) + opt('prod', t('es_o_prod'), ES.ord) + '</select>') + '</div>';
function esTopoFiltrosLista(res, nSel) {
  const nExtra = (ES.cat ? 1 : 0) + (ES.forn ? 1 : 0), algum = ES.corredor || ES.busca || ES.sit || nExtra;
  return '<div class="es-mtb-l2">' + esSelW(t('es_f_corr'), ES.corredor, corrSelect('eCorredor', res, t('es_f_todos'))) + esSelW(t('es_f_sit'), ES.sit, '<select class="flt" id="eSit">' + opt('', t('es_f_todas'), ES.sit) + opt('saldo', t('es_f_saldo'), ES.sit) + opt('zero', t('es_f_zer'), ES.sit) + '</select>') +
    '<button type="button" class="es-tfbt' + (ES.filtrosAb || nExtra ? ' on' : '') + '" data-act="es-filtros-ab" title="' + esc(t('sh_filtros_bt')) + '">' + svg(ICO.ajuste, 18) + (nExtra ? '<i>' + nExtra + '</i>' : '') + '</button></div>' +
    (ES.filtrosAb ? '<div class="es-tfx">' + catSel() + fornSel() + '</div>' : '') +
    (algum ? '<button type="button" class="btn sm es-limpar" data-act="es-tlimpar">' + svg(ICO.x, 14) + ' ' + esc(t('limpar_filtros')) + '</button>' : '') +
    (nSel && podeMexer() ? '<div class="es-mtb-sel"><button class="btn sm primary" data-act="corr-mover">' + svg(ICO.troca, 13) + ' ' + esc(t('e_mover_sel')) + ' (' + nSel + ')</button></div>' : '');
}
const corrSelect = (id, res, todos) => '<select class="flt' + (ES.corredor ? ' on' : '') + '" id="' + id + '"><option value="">' + esc(todos) + '</option><option value="__sem"' + (ES.corredor === '__sem' ? ' selected' : '') + '>' + esc(t('e_sem')) + '</option>' + corrListaOrdenada(res).map(x => '<option value="' + esc(x) + '"' + (ES.corredor === x ? ' selected' : '') + '>' + esc(corrFmt(x)) + (res[x] ? ' (' + res[x].prods + ')' : '') + '</option>').join('') + '</select>';
const catSel = () => '<select class="flt' + (ES.cat ? ' on' : '') + '" id="eCat"><option value="">' + esc(t('cat_todas')) + '</option>' + cats().map(c => opt(c, c, ES.cat)).join('') + '</select>';
const fornSel = () => forns().length ? '<select class="flt' + (ES.forn ? ' on' : '') + '" id="eForn"><option value="">' + esc(t('forn_todos')) + '</option>' + forns().map(c => opt(c, c, ES.forn)).join('') + '</select>' : '';
function esMapaMobHTML(res) {
  const cs = ES.corrSit, fotos = {};
  PR.forEach(p => { if (!p.foto || !p.corredor || !(p.qtd > 0)) return; const l = fotos[p.corredor] || (fotos[p.corredor] = []); if (l.length < 3) l.push(p); });
  const L = corrListaOrdenada(res).filter(c => { const r = res[c]; return !cs || (cs === 'vazio' ? !r : cs === 'uso' ? !!r : !!(r && r.zer)); });
  if (!L.length) return '<div class="empty">' + svg(ICO.caixa, 40) + '<b>' + esc(t('e_vazio')) + '</b></div>';
  const SIT = { g: 'es_cs_ok', a: 'es_cs_parte', r: 'es_cs_zero' };
  return '<div class="es-ccs">' + L.map(c => {
    const cod = corrFmt(c), r = res[c];
    if (!r) return '<div class="es-cc vazio"><b class="es-cc-cod">' + esc(cod) + '</b><span class="es-cc-sit n">' + esc(t('es_cs_vazio')) + '</span></div>';
    const pt = corrPt(r), fs = corrFams(r), fm = fs.slice(0, 3), fl = fotos[c] || [];
    return '<button type="button" class="es-cc" data-corr-abrir="' + esc(c) + '" title="' + esc(corrTitulo(cod, r)) + '"><div class="es-cc-tx"><div class="es-cc-l1"><b class="es-cc-cod">' + esc(cod) + '</b><span class="es-cc-sit ' + pt + '">' + esc(t(SIT[pt])) + '</span></div><span class="es-cc-n">' + esc(t(r.prods === 1 ? 'es_cc_prod1' : 'es_cc_prods', { n: numFmt(r.prods) })) + (r.zer && r.zer < r.prods ? ' · <em>' + esc(t('es_cc_zer', { n: numFmt(r.zer) })) + '</em>' : '') + '</span>' +
      (fm.length ? '<span class="es-cc-fam">' + svg(ICO.pin, 13) + esc(fm.join(' · ')) + (fs.length > fm.length ? ' +' + (fs.length - fm.length) : '') + '</span>' : '') + '</div><div class="es-cc-dir">' + (fl.length ? '<div class="es-cc-fotos">' + fl.map(p => E.fotoHTML(p, 30)).join('') + '</div>' : '') + '<span class="es-cc-q">' + esc(t('es_cc_est')) + ': <b>' + numFmt(r.un) + '</b></span></div><span class="es-cc-chev">' + svg(ICO.dir, 18) + '</span></button>';
  }).join('') + '</div>';
}
/* 통로 안 상품군 격자 (폰 — 옛 esGradeHTML). 상품군 = 카탈로그 분류 1단계 */
function esFamilias() {
  const busca = String(ES.famBusca || '').trim().toLowerCase(), m = {}, ordem = [];
  PR.forEach(p => {
    if (!noCorredor(p)) return; const q = Number(p.qtd) || 0;
    if (ES.sit === 'saldo' && !q) return; if (ES.sit === 'zero' && q) return;
    const k = p.categoria || '__outros';
    if (!m[k]) { m[k] = { k, nome: k === '__outros' ? L3('기타', 'Other', 'Outros') : k, prods: 0, saldo: 0, zer: 0, un: 0, foto: null, bate: false }; ordem.push(k); }
    const f = m[k]; f.prods++; if (q) f.saldo++; else f.zer++; f.un += q; if (!f.foto && p.foto) f.foto = p;
    if (busca && !f.bate && [p.nome, p.sku, p.barcode, p.descricao].join(' ').toLowerCase().indexOf(busca) >= 0) f.bate = true;
  });
  let L = ordem.map(k => m[k]);
  if (busca) L = L.filter(f => f.bate || f.nome.toLowerCase().indexOf(busca) >= 0);
  const o = ES.famOrd || 'prods';
  return L.sort((a, b) => o === 'nome' ? a.nome.localeCompare(b.nome) : o === 'zer' ? b.zer - a.zer || b.prods - a.prods : b.prods - a.prods || a.nome.localeCompare(b.nome));
}
const noCorredor = p => ES.corredor === '__sem' ? !p.corredor : p.corredor === ES.corredor;
function esGradeHTML(rr, rotCorr) {
  const fams = esFamilias(), pz = rr.prods ? Math.round(100 * rr.zer / rr.prods) : 0, nf = new Set(PR.filter(noCorredor).map(p => p.categoria || '__outros')).size;
  let h = '<div class="panel es-fam-cab"><div class="es-fam-cab-l"><h2>' + esc(ES.corredor === '__sem' ? t('e_sem') : t('e_corr_pref') + ' ' + rotCorr) + '</h2><p>' + esc(t('e_fam_sub', { n: numFmt(rr.prods), f: nf })) + '</p><p class="es-fam-zer">' + esc(rr.zer ? t('e_fam_zer', { z: numFmt(rr.zer), p: pz }) : t('e_tudo_saldo')) + '</p></div><div class="es-fam-cod">' + esc(rotCorr) + '</div>' +
    '<div class="es-fam-kpis"><div><i class="a">' + svg(ICO.cubo, 18) + '</i><span>' + esc(t('e_mini_prod')) + '</span><b>' + numFmt(rr.prods) + '</b><small>' + esc(t('e_mini_prod_sub')) + '</small></div><div><i class="g">' + svg(ICO.camadas, 18) + '</i><span>' + esc(t('e_mini_un')) + '</span><b>' + numFmt(rr.un) + '</b><small>' + esc(t('e_mini_un_sub')) + '</small></div><div><i class="r">' + svg(ICO.alerta, 18) + '</i><span>' + esc(t('e_zerados')) + '</span><b>' + numFmt(rr.zer) + '</b><small>' + esc(t('e_mini_zer_sub', { p: pz })) + '</small></div></div></div>';
  h += '<div class="panel es-fam-tb"><div class="tb-search"><input type="search" id="esFamBusca" placeholder="' + esc(t('e_fam_busca')) + '" value="' + esc(ES.famBusca) + '"><button type="button" class="scan-in" data-scan="estoque" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 16) + '</button></div><div class="es-fam-ctl"><select class="flt" id="esFamOrd">' + opt('prods', t('e_fam_ord_prods'), ES.famOrd) + opt('nome', t('e_fam_ord_nome'), ES.famOrd) + opt('zer', t('e_fam_ord_zer'), ES.famOrd) + '</select><select class="flt' + (ES.sit ? ' on' : '') + '" id="eSit">' + opt('', t('e_sit_todas'), ES.sit) + opt('saldo', t('e_sit_saldo'), ES.sit) + opt('zero', t('e_sit_zerados'), ES.sit) + '</select>' +
    '<div class="corr-seg es-fam-seg"><button type="button" class="on" data-es-fam="grade">' + svg(ICO.painel, 15) + ' ' + esc(t('e_fam_ver_grade')) + '</button><button type="button" data-es-fam="lista">' + svg(ICO.menu, 15) + ' ' + esc(t('e_fam_ver_lista')) + '</button></div></div></div>';
  h += fams.length ? '<div class="es-fam-grid">' + fams.map(f => '<button type="button" class="es-fam" data-es-fam-abrir="' + esc(f.k) + '"><div class="es-fam-foto">' + (f.foto ? E.fotoHTML(f.foto, 56) : svg(ICO.prod, 22)) + '</div><div class="es-fam-tx"><b>' + esc(f.nome) + '</b><span>' + esc(t('e_fam_prod', { n: numFmt(f.prods) })) + '</span><em class="g">' + svg(ICO.cubo, 13) + ' ' + esc(t('e_fam_saldo', { n: numFmt(f.saldo) })) + '</em><em class="' + (f.zer ? 'r' : 'n') + '">' + svg(ICO.alerta, 13) + ' ' + esc(t('e_fam_zerados', { n: numFmt(f.zer) })) + '</em></div><span class="es-fam-chev">' + svg(ICO.dir, 16) + '</span></button>').join('') + '</div>' : '<div class="panel"><div class="graf-vazio">' + esc(t('e_fam_nada')) + '</div></div>';
  return h;
}
/* 줄을 열면 — 상자들 (옛 caixasPainelHTML) */
function caixasPainelHTML(lista, p) {
  const rep = lista ? reporCardHTML(p) : '';   // 🔁 채우기 요청 (옛 Consulta 의 cs2-repor 카드)
  const cs = rep ? '<div class="rp-cs">' + rep + '</div>' : '';
  let r = '';
  if (podeMexer()) {
    if (lista) {
      if (lista.length === 1) { const i = lista[0]; r = '<div class="ajuste-saldo"><div class="as-info"><span>' + esc(t('es_saldo_atual')) + '</span><b>' + p.qtd + ' ' + esc(t('un_curto')) + '</b></div><div class="as-aviso">' + esc(t('ajuste_etq_unica', { codigo: i.codigo })) + '</div><div class="as-campo"><input type="number" inputmode="numeric" placeholder="' + esc(t('ajuste_qtd_label')) + ' (10, -3…)" data-as-delta="' + esc(p.id) + '" data-as-etq="' + esc(i.codigo) + '"></div><button type="button" class="btn primary sm" data-act="as-aplicar" data-pid="' + esc(p.id) + '">' + esc(t('ajustar')) + '</button></div>'; }
      else if (lista.length) r = '<div class="ajuste-saldo"><div class="as-info"><span>' + esc(t('es_saldo_atual')) + '</span><b>' + p.qtd + ' ' + esc(t('un_curto')) + '</b></div><div class="as-aviso">' + esc(t('es_ajuste_escolha_etq')) + '</div><div class="as-campo"><select data-as-etq-sel="' + esc(p.id) + '">' + lista.map(e => '<option value="' + esc(e.codigo) + '">' + esc(e.codigo) + ' — ' + e.qtd_restante + ' ' + esc(t('un_curto')) + (e.ativa ? '' : ' (' + esc(t('etq_morta')) + ')') + '</option>').join('') + '</select></div><div class="as-campo"><input type="number" inputmode="numeric" placeholder="' + esc(t('ajuste_qtd_label')) + ' (10, -3…)" data-as-delta="' + esc(p.id) + '"></div><button type="button" class="btn primary sm" data-act="as-aplicar" data-pid="' + esc(p.id) + '">' + esc(t('ajustar')) + '</button></div>';
      else r = '<div class="ajuste-saldo"><div class="as-info"><span>' + esc(t('es_saldo_atual')) + '</span><b>' + p.qtd + ' ' + esc(t('un_curto')) + '</b></div><div class="as-aviso">' + esc(t('es_ajuste_sem_etq')) + '</div></div>';
    } else r = '<div class="ajuste-saldo"><div class="as-info"><span>' + esc(t('es_saldo_atual')) + '</span><b>' + p.qtd + ' ' + esc(t('un_curto')) + '</b></div></div>';
  }
  r = cs + r;
  if (!lista) return r + '<div class="caixas-painel"><div class="caixas-vazio">' + esc(t('carregando')) + '</div></div>';
  if (!lista.length) return r + '<div class="caixas-painel"><div class="caixas-vazio">' + esc(t('e_caixas_vazio')) + '</div></div>';
  return r + '<div class="caixas-painel">' + lista.map(e => '<div class="caixa-item' + (e.ativa ? '' : ' inativa') + '" data-caixa="' + esc(e.codigo) + '"><div class="cx-qr">' + E.qrSVG(E.etqLink(e.codigo)) + '</div><div class="cx-info"><div class="cx-cod">' + esc(e.codigo) + '</div><div class="cx-meta">' + esc(t('r_corredor')) + ': ' + esc(e.corredor ? corrFmt(e.corredor) : '—') + ' · ' + esc(t('etq_inicial')) + ': ' + e.qtd_inicial + '</div></div>' +
    (!podeMexer() ? '<div class="cx-edit"><b>' + e.qtd_restante + '</b></div>' : '<div class="cx-edit"><div class="linha-ajuste"><button type="button" class="mini menos" data-act="cx-menos" data-cod="' + esc(e.codigo) + '" title="' + esc(t('etq_qtd_parcial')) + '">−</button><input type="number" min="0" inputmode="numeric" value="' + e.qtd_restante + '" data-cx-qtd="' + esc(e.codigo) + '"><button type="button" class="mini" data-act="cx-mais" data-cod="' + esc(e.codigo) + '" title="' + esc(t('etq_qtd_add')) + '">+</button></div><button type="button" class="btn sm" data-act="cx-salvar" data-cod="' + esc(e.codigo) + '">' + esc(t('e_caixa_salvar')) + '</button>' + (gerente() ? '<button type="button" class="btn sm danger" data-act="cx-excluir" data-cod="' + esc(e.codigo) + '" title="' + esc(t('e_caixa_excluir')) + '">' + svg(ICO.x, 14) + '</button>' : '') + '</div>') +
    '<button type="button" class="btn-etq" data-act="cx-reimprimir" data-cod="' + esc(e.codigo) + '" data-pid="' + esc(p.id) + '" title="' + esc(t('etq_reimprimir')) + '">' + svg(ICO.print, 15) + '</button></div>').join('') + '</div>';
}
async function carregarCaixas(code, re) {
  try { ES.etq[code] = await E.listarEtiquetas(code); } catch (e) { ES.etq[code] = []; toast(String(e.message || e), 'bad'); }
  try { injetarCssRepor(); await reposAbertas(); } catch (e) {}
  try { await E.loadQr(); } catch (e) {}
  if (re !== false && ES.expand === code) render();
}

/* fila de estornos — só gerência (옛 estornoFilaHTML, que morava na Conciliação) */
function estornoFilaHTML() {
  const f = ES.fila; if (!gerente() || !f || !f.length) return '';
  return '<div class="panel est-fila"><h3>' + esc(t('est_fila_tit')) + ' <span class="badge low">' + f.length + '</span></h3>' + f.map(s => '<div class="est-p"><div class="est-p-c"><b>' + esc(s.code || '—') + '</b><span>' + esc(t('est_p_mov', { n: String(s.movId).slice(-6), q: numFmt(s.delta || 0) })) + '</span><em>' + esc(s.motivo) + ' · ' + esc(s.porNome || '—') + ' · ' + esc(dataBR(s.em)) + '</em></div><div class="est-p-a"><button class="btn primary sm" data-act="est-aprovar" data-id="' + esc(s.id) + '">' + esc(t('est_aprovar')) + '</button><button class="btn sm" data-act="est-recusar" data-id="' + esc(s.id) + '">' + esc(t('est_recusar')) + '</button></div></div>').join('') + '</div>';
}

function telaConsulta() {
  const res = corrResumo(), usados = Object.keys(res).length, semCorr = PR.filter(p => !p.corredor).length;
  let totProd = 0, totUn = 0; Object.keys(res).forEach(k => { totProd += res[k].prods; totUn += res[k].un; });
  if (gerente() && ES.fila == null) { ES.fila = []; E.estornoFila().then(f => { ES.fila = f; if (f.length) render(); }); }
  const cabecalho = '<div class="page-head"><div><h1>' + esc(t('e_titulo')) + '</h1><p>' + esc(t('e_sub')) + '</p></div></div>' + barraModos();
  const tilesTopo = '<div class="tiles">' + tile(t('e_corredores'), usados + ' / ' + CORREDORES.length, '', t('e_ins_vazios', { n: Math.max(CORREDORES.length - usados, 0) })) + tile(t('e_alocados'), numFmt(totProd), '', t('e_ins_em_corr', { n: usados })) + tile(t('e_un_dep'), numFmt(totUn) + ' ' + t('un_curto'), '', t('c_qtd')) +
    (semCorr ? '<button type="button" class="tile acao" data-act="corr-sem"><div class="lbl">' + esc(t('e_sem_corredor')) + '</div><div class="val warn">' + numFmt(semCorr) + '</div><div class="sub">' + esc(t('e_alocar')) + ' →</div></button>' : tile(t('e_sem_corredor'), 0, '', t('e_sem'))) + '</div>';
  /* --------- NIVEL 1: o mapa --------- */
  if (ES.vista !== 'lista' && !ES.corredor && !String(ES.busca || '').trim()) {
    if (mob()) { pintar('<div class="sb est-tela es-topo es-mob">' + estornoFilaHTML() + esTopoCabHTML(usados, totProd, semCorr) + '<div class="panel">' + esTopoCtlHTML(true, esTopoFiltrosMapa()) + esMapaMobHTML(res) + '</div></div>'); return; }
    pintar('<div class="sb est-tela">' + cabecalho + estornoFilaHTML() + tilesTopo + '<div class="panel"><div class="toolbar"><div class="tb-search">' + svg(ICO.busca, 15) + '<input type="search" id="eBusca" placeholder="' + esc(t('e_busca_dep')) + '" value=""><button type="button" class="scan-in" data-scan="estoque" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 16) + '</button></div>' +
      '<div class="corr-seg"><button type="button" class="on">' + esc(t('e_ver_mapa')) + '</button><button type="button" data-act="corr-lista">' + esc(t('e_ver_lista')) + '</button></div><select class="flt" id="eOrd">' + opt('corr', t('e_ord_corr'), ES.ord) + opt('un', t('e_ord_un'), ES.ord) + opt('prod', t('e_ord_prod'), ES.ord) + '</select></div>' + mapaCorredoresHTML(res) +
      '<div class="corr-leg"><span><i class="corr-pt g"></i>' + esc(t('e_leg_tudo')) + '</span><span><i class="corr-pt a"></i>' + esc(t('e_leg_parte')) + '</span><span><i class="corr-pt r"></i>' + esc(t('e_leg_zero')) + '</span><span><i class="corr-pt n"></i>' + esc(t('e_leg_vazio')) + '</span><span class="dir">' + esc(t('e_leg_barra')) + '</span></div></div></div>');
    return;
  }
  /* --------- NIVEL 2 (ou a lista corrida) --------- */
  const L = listaEstoque(), pg = paginar(L), o = pg.pag, dentro = !!ES.corredor, nSel = selN(), colChk = podeMexer(), colCorr = !dentro, nCols = (colChk ? 1 : 0) + 1 + (colCorr ? 1 : 0) + 5;
  let c = '';
  const grade = dentro && mob() && ES.famVista !== 'lista';
  let rr = null, rotCorr = '';
  if (dentro) {
    rotCorr = ES.corredor === '__sem' ? t('e_sem') : corrFmt(ES.corredor);
    rr = res[ES.corredor] || { prods: L.length, zer: L.filter(p => !p.qtd).length, un: L.reduce((x, p) => x + (Number(p.qtd) || 0), 0) };
    c += '<div class="rec-crumb"><button type="button" class="rec-voltar" data-act="corr-mapa">' + svg(ICO.esq, 16) + ' ' + esc(t('e_voltar_mapa')) + '</button><button type="button" data-act="corr-mapa">' + esc(t('e_titulo')) + '</button>' + svg(ICO.dir, 12) + '<b>' + esc(rotCorr) + '</b></div>';
    if (grade) { pintar('<div class="sb es-lista-tela es-mob">' + c + esGradeHTML(rr, rotCorr) + '</div>'); return; }
    if (mob()) c += '<div class="es-fam-volta"><button type="button" data-es-fam="grade">' + svg(ICO.esq, 15) + ' ' + esc(t('e_fam_ver_grade')) + '</button>' + (ES.cat ? '<b class="es-fam-nome">' + svg(ICO.cubo, 18) + esc(ES.cat) + '</b>' : '') + '</div>';
    c += '<div class="panel"><div class="corr-cab"><div><h2>' + esc(ES.corredor === '__sem' ? t('e_sem') : t('e_corr_pref') + ' ' + rotCorr) + '</h2><p>' + esc(rr.zer ? t('e_ins_zer_de', { z: rr.zer, n: rr.prods }) : t('e_tudo_saldo')) + '</p></div><div class="corr-mini"><div><div class="l">' + esc(t('e_mini_prod')) + '</div><div class="v">' + numFmt(rr.prods) + '</div></div><div><div class="l">' + esc(t('e_mini_un')) + '</div><div class="v">' + numFmt(rr.un) + '</div></div><div><div class="l">' + esc(t('e_zerados')) + '</div><div class="v">' + numFmt(rr.zer) + '</div></div></div></div>';
  } else c += mob() ? estornoFilaHTML() + esTopoCabHTML(usados, totProd, semCorr) + '<div class="panel">' : cabecalho + estornoFilaHTML() + tilesTopo + '<div class="panel">';
  if (mob()) {
    c += !dentro ? esTopoCtlHTML(false, esTopoFiltrosLista(res, nSel)) : '<div class="es-mtb"><div class="tb-search">' + svg(ICO.busca, 18) + '<input type="search" id="eBusca" placeholder="' + esc(t('e_busca_corr')) + '" value="' + esc(ES.busca) + '"><button type="button" class="scan-in" data-scan="estoque" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 18) + '</button></div><div class="es-mtb-l2"><label class="es-sit-w' + (ES.sit ? ' on' : '') + '">' + svg(ICO.filtro, 16) + '<select class="flt" id="eSit">' + opt('', t('e_sit_todas'), ES.sit) + opt('saldo', t('e_sit_saldo'), ES.sit) + opt('zero', t('e_sit_zerados'), ES.sit) + '</select></label>' + (ES.busca || ES.sit ? '<button class="btn sm es-limpar" data-act="corr-limpar">' + svg(ICO.x, 14) + ' ' + esc(t('limpar_filtros')) + '</button>' : '') + '<div class="es-vista"><button type="button" class="on" title="' + esc(t('e_ver_lista')) + '">' + svg(ICO.menu, 18) + '</button><button type="button" data-es-fam="grade" title="' + esc(t('e_fam_ver_grade')) + '">' + svg(ICO.painel, 18) + '</button></div></div>' + (nSel && podeMexer() ? '<div class="es-mtb-sel"><button class="btn sm primary" data-act="corr-mover">' + svg(ICO.troca, 13) + ' ' + esc(t('e_mover_sel')) + ' (' + nSel + ')</button></div>' : '') + '</div>';
    c += '<div class="es-lst-info"><span>' + esc(t(L.length === 1 ? 'es_lst_n1' : 'es_lst_n', { n: numFmt(L.length) })) + '</span><label class="es-ord-w">' + svg(ICO.setaV, 15) + '<select id="eLstOrd">' + opt('', t('es_ord_az'), ES.lstOrd) + opt('za', t('es_ord_za'), ES.lstOrd) + opt('mais', t('es_ord_mais'), ES.lstOrd) + opt('menos', t('es_ord_menos'), ES.lstOrd) + '</select></label></div>';
    c += '<div class="es-cards">' + (!L.length ? '<div class="empty">' + svg(ICO.caixa, 40) + '<b>' + esc(t('e_vazio')) + '</b></div>' : o.map((p, ix) => {
      const aberta = ES.expand === p.id, q = Number(p.qtd) || 0, cp = dentro ? ES.corredor : p.corredor, sub = (!cp || cp === '__sem' ? t('e_sem') : t('e_corr_pref') + ' ' + corrFmt(cp)) + (p.categoria ? ' · ' + p.categoria : '');
      return '<div class="es-card tr-toggle' + (colChk ? '' : ' sem-chk') + (aberta ? ' tr-aberta' : '') + (q ? '' : ' zero') + '" data-toggle-caixas="' + esc(p.id) + '">' + (colChk ? '<label class="es-card-chk"><input type="checkbox" data-corr-sel="' + esc(p.id) + '"' + (ES.sel[p.id] ? ' checked' : '') + '></label>' : '') + '<div class="es-card-n">' + ((ES.pag - 1) * POR_PAG + ix + 1) + '</div><div class="es-card-info"><b>' + esc(p.nome) + '</b><span>' + esc(sub) + '</span></div><div class="es-card-dir"><span class="es-card-sit badge ' + (SIT_CLS[p.situacao] || 'ok') + '"><i></i>' + esc(t(SIT_TXT[p.situacao] || 'st_ok')) + '</span><b>' + numFmt(q) + '</b><small>' + esc(t('es_und_un')) + '</small></div><span class="es-card-chev">' + svg(ICO.dir, 16) + '</span>' +
        (aberta ? '<div class="es-card-mais"><div class="es-card-acoes"><button type="button" class="btn sm" data-act="mov-linha" data-pid="' + esc(p.id) + '">' + svg(ICO.rel, 14) + ' ' + esc(t('aba_mov')) + '</button>' + (podeMexer() ? '<button type="button" class="btn sm" data-act="corr-mover1" data-pid="' + esc(p.id) + '">' + svg(ICO.troca, 14) + ' ' + esc(t('e_mudar')) + '</button>' : '') + '</div>' + caixasPainelHTML(ES.etq[p.id], p) + '</div>' : '') + '</div>';
    }).join('')) + '</div>';
  } else {
    c += '<div class="toolbar"><div class="tb-search">' + svg(ICO.busca, 15) + '<input type="search" id="eBusca" placeholder="' + esc(dentro ? t('e_busca_corr') : t('e_busca_dep')) + '" value="' + esc(ES.busca) + '"><button type="button" class="scan-in" data-scan="estoque" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 16) + '</button></div>' +
      (dentro ? '' : '<div class="corr-seg"><button type="button" data-act="corr-mapa">' + esc(t('e_ver_mapa')) + '</button><button type="button" class="on">' + esc(t('e_ver_lista')) + '</button></div>' + corrSelect('eCorredor', res, t('e_todos'))) +
      '<select class="flt' + (ES.sit ? ' on' : '') + '" id="eSit">' + opt('', t('e_sit_todas'), ES.sit) + opt('saldo', t('e_sit_saldo'), ES.sit) + opt('zero', t('e_sit_zerados'), ES.sit) + '</select>' + catSel() + fornSel() +
      (podeMexer() ? '<button class="btn sm' + (nSel ? ' primary' : '') + '" data-act="corr-mover"' + (nSel ? '' : ' disabled') + '>' + svg(ICO.troca, 13) + ' ' + esc(t('e_mover_sel')) + (nSel ? ' (' + nSel + ')' : '') + '</button>' : '') +
      ((dentro ? ES.busca || ES.sit || ES.cat || ES.forn : ES.corredor || ES.busca || ES.sit || ES.cat || ES.forn) ? '<button class="btn sm" data-act="' + (dentro ? 'corr-limpar' : 'es-tlimpar') + '">' + svg(ICO.x, 13) + ' ' + esc(t('limpar_filtros')) + '</button>' : '') +
      '</div><div class="tbl-scroll"><table class="tbl-compacta es-tab"><thead><tr>' + (colChk ? '<th class="chk-cel"><input type="checkbox" id="eTodos"' + (o.length && o.every(p => ES.sel[p.id]) ? ' checked' : '') + '></th>' : '') +
      '<th class="rn" style="text-align:right">#</th>' + (colCorr ? '<th>' + esc(t('r_corredor')) + '</th>' : '') + '<th class="pm-foto-cel">' + esc(t('pf_col')) + '</th><th>' + esc(t('c_nome')) + '</th><th class="num">' + esc(t('c_qtd')) + '</th><th>' + esc(t('c_sit')) + '</th><th class="etq-cel" style="text-align:right">' + esc(t('acoes')) + '</th></tr></thead><tbody>';
    if (!L.length) c += '<tr><td colspan="' + nCols + '"><div class="empty">' + svg(ICO.caixa, 40) + '<b>' + esc(t('e_vazio')) + '</b></div></td></tr>';
    else o.forEach((p, ix) => {
      const aberta = ES.expand === p.id;
      c += '<tr class="tr-toggle' + (aberta ? ' tr-aberta' : '') + '" data-toggle-caixas="' + esc(p.id) + '">' + (colChk ? '<td class="chk-cel"><input type="checkbox" data-corr-sel="' + esc(p.id) + '"' + (ES.sel[p.id] ? ' checked' : '') + '></td>' : '') +
        '<td class="rn" style="text-align:right">' + ((ES.pag - 1) * POR_PAG + ix + 1) + '</td>' + (colCorr ? '<td data-l="' + esc(t('r_corredor')) + '"><span class="tag">' + esc(p.corredor ? corrFmt(p.corredor) : '—') + '</span></td>' : '') +
        '<td class="pm-foto-cel">' + E.miniProdutoHTML(p, 38) + '</td><td class="principal"><b>' + esc(p.nome) + '</b>' + (p.descricao ? '<span class="es-desc">' + esc(p.descricao) + '</span>' : '') + '</td><td class="num" data-l="' + esc(t('c_qtd')) + '"><b>' + p.qtd + '</b></td><td data-l="' + esc(t('c_sit')) + '">' + sitBadge(p) + '</td>' +
        '<td class="etq-cel" data-l="' + esc(t('acoes')) + '"><div class="corr-acoes"><button type="button" class="btn-etq" data-act="mov-linha" data-pid="' + esc(p.id) + '" title="' + esc(t('aba_mov')) + '">' + svg(ICO.rel, 15) + '</button>' + (podeMexer() ? '<button type="button" class="btn-etq" data-act="corr-mover1" data-pid="' + esc(p.id) + '" title="' + esc(t('e_mudar')) + '">' + svg(ICO.troca, 15) + '</button>' : '') + '</div></td></tr>';
      if (aberta) c += '<tr class="lin-caixas"><td colspan="' + nCols + '">' + caixasPainelHTML(ES.etq[p.id], p) + '</td></tr>';
    });
    c += '</tbody></table></div>';
  }
  const d = L.length ? (ES.pag - 1) * POR_PAG + 1 : 0, l = Math.min(ES.pag * POR_PAG, L.length);
  c += '<div class="footbar"><span>' + esc(t('mostrando')) + ' ' + d + '–' + l + ' ' + esc(t('de')) + ' ' + L.length + ' ' + esc(t('contagem')) + '</span>' + paginacaoHTML(pg.totalPag) + '</div></div>';
  pintar('<div class="sb es-lista-tela' + (mob() ? ' es-mob' : '') + (mob() && !dentro ? ' es-topo' : '') + '">' + c + '</div>');
}

/* ---------- 그리기 + 입력 연결 ---------- */
function pintar(html) {
  const ae = document.activeElement, foco = ae && ae.id && $('page').contains(ae) ? { id: ae.id, pos: ae.selectionStart } : null;
  /* 옛 앱은 #conteudo 안에 .est-tela · .es-topo.es-mob 같은 칸이 한 겹 더 있음 — 옛 CSS(.es-topo .es-tnum …)가 그대로 맞게 .sb 안에 한 겹 */
  $('page').innerHTML = html.replace(/^<div class="sb ([^"]*)">/, '<div class="sb es-raiz"><div class="$1">') + '</div>';
  if (foco) { const n = $(foco.id); if (n && n.tagName === 'INPUT') { try { n.focus(); if (foco.pos != null && n.setSelectionRange) n.setSelectionRange(foco.pos, foco.pos); } catch (e) {} } }
  ligar();
}
const resetLista = () => { ES.pag = 1; };
function ligar() {
  const raiz = document.querySelector('#page .sb'); if (!raiz) return;
  raiz.onclick = clique;
  const b = $('eBusca'); if (b) b.oninput = debounce(() => { ES.busca = b.value; resetLista(); render(); }, 220);
  const ch = (id, f) => { const el = $(id); if (el) el.onchange = () => { f(el.value); render(); }; };
  ch('eOrd', v => { ES.ord = v; }); ch('eCorrSit', v => { ES.corrSit = v; }); ch('eCorredor', v => { ES.corredor = v; ES.sel = {}; resetLista(); });
  ch('eSit', v => { ES.sit = v; resetLista(); }); ch('eCat', v => { ES.cat = v; resetLista(); }); ch('eForn', v => { ES.forn = v; resetLista(); });
  ch('eLstOrd', v => { ES.lstOrd = v; resetLista(); }); ch('esFamOrd', v => { ES.famOrd = v; });
  const fb = $('esFamBusca'); if (fb) fb.oninput = debounce(() => { ES.famBusca = fb.value; render(); }, 200);
  raiz.querySelectorAll('[data-corr-sel]').forEach(el => { el.onclick = e => e.stopPropagation(); el.onchange = () => { if (el.checked) ES.sel[el.dataset.corrSel] = true; else delete ES.sel[el.dataset.corrSel]; render(); }; });
  const td = $('eTodos'); if (td) { td.onclick = e => e.stopPropagation(); td.onchange = () => { paginar(listaEstoque()).pag.forEach(p => { if (td.checked) ES.sel[p.id] = true; else delete ES.sel[p.id]; }); render(); }; }
  raiz.querySelectorAll('[data-as-delta]').forEach(el => { el.onclick = e => e.stopPropagation(); el.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ajusteSaldoInline(el.dataset.asDelta); } }; });
  raiz.querySelectorAll('[data-as-etq-sel],[data-cx-qtd]').forEach(el => { el.onclick = e => e.stopPropagation(); });
  if (ES.modo === 'entrada' || ES.modo === 'saida') ligarMov();
  if (raiz.querySelector('#mmPainel')) ligarMm();
}
async function clique(e) {
  const c = s => e.target.closest(s); let b;
  if ((b = c('[data-modo]'))) { ES.modo = b.dataset.modo; ES.prod = ''; ES.pbusca = ''; ES.qtd = ''; ES.etqN = ''; render(); const x = $('esBusca'); if (x) x.focus(); return; }
  if ((b = c('[data-scan]'))) return openScanner(code => aoBipar(code, b.dataset.scan), { title: t('sc_abrir') });
  if ((b = c('[data-corr-abrir]'))) { ES.corredor = b.dataset.corrAbrir; ES.pag = 1; ES.expand = ''; ES.sel = {}; render(); window.scrollTo(0, 0); return; }
  if (c('[data-act="corr-sem"]')) { ES.corredor = '__sem'; ES.pag = 1; ES.expand = ''; ES.sel = {}; render(); return; }
  if (c('[data-act="corr-lista"]')) { ES.vista = 'lista'; ES.pag = 1; return render(); }
  if (c('[data-act="corr-mapa"]')) { Object.assign(ES, { vista: 'mapa', corredor: '', busca: '', sit: '', expand: '', sel: {}, pag: 1 }); if (mob()) Object.assign(ES, { famVista: '', famBusca: '', cat: '' }); render(); window.scrollTo(0, 0); return; }
  if (c('[data-act="corr-limpar"]')) { ES.busca = ''; ES.sit = ''; ES.pag = 1; return render(); }
  if (c('[data-act="es-tlimpar"]')) { Object.assign(ES, { corredor: '', busca: '', sit: '', cat: '', forn: '', sel: {}, pag: 1 }); return render(); }
  if (c('[data-act="es-filtros-ab"]')) { ES.filtrosAb = !ES.filtrosAb; return render(); }
  if ((b = c('[data-es-fam-abrir]'))) { const k = b.dataset.esFamAbrir; ES.cat = k === '__outros' ? '' : k; ES.famVista = 'lista'; ES.pag = 1; return render(); }
  if ((b = c('[data-es-fam]'))) { ES.famVista = b.dataset.esFam; if (ES.famVista === 'grade') ES.cat = ''; ES.pag = 1; return render(); }
  if (c('[data-act="ant"]')) { ES.pag = Math.max(1, ES.pag - 1); return render(); }
  if (c('[data-act="prox"]')) { ES.pag++; return render(); }
  if (c('[data-act="corr-mover"]')) return moverCorredor(Object.keys(ES.sel).filter(k => ES.sel[k]));
  if ((b = c('[data-act="corr-mover1"]'))) { e.stopPropagation(); return moverCorredor([b.dataset.pid]); }
  if ((b = c('[data-act="mov-linha"]'))) { e.stopPropagation(); return itemSheet(b.dataset.pid); }
  if ((b = c('[data-act="cx-mais"],[data-act="cx-menos"]'))) { e.stopPropagation(); const i = document.querySelector('[data-cx-qtd="' + b.dataset.cod + '"]'); if (i) i.value = Math.max(0, (Number(i.value) || 0) + (b.dataset.act === 'cx-mais' ? 1 : -1)); return; }
  if ((b = c('[data-act="cx-salvar"]'))) { e.stopPropagation(); return cxSalvar(b.dataset.cod); }
  if ((b = c('[data-act="cx-excluir"]'))) { e.stopPropagation(); return cxExcluir(b.dataset.cod); }
  if ((b = c('[data-act="cx-reimprimir"]'))) { e.stopPropagation(); const r = (ES.etq[b.dataset.pid] || []).find(x => x.codigo === b.dataset.cod); if (r) E.escolherTamanho([r]); return; }
  if ((b = c('[data-act="cs-repor"]'))) { e.stopPropagation(); return pedirReposicaoPopup(b.dataset.pid, () => render()); }
  if ((b = c('[data-act="as-aplicar"]'))) { e.stopPropagation(); return ajusteSaldoInline(b.dataset.pid); }
  if ((b = c('[data-act="est-aprovar"],[data-act="est-recusar"]'))) return estornoResolver(b.dataset.id, b.dataset.act === 'est-aprovar');
  if ((b = c('[data-toggle-caixas]')) && !c('select,button,input,a,label')) { const id = b.dataset.toggleCaixas; if (ES.expand === id) { ES.expand = ''; return render(); } ES.expand = id; render(); return carregarCaixas(id); }
  /* entrada · saida */
  if ((b = c('[data-espick]'))) return escolherProduto(b.dataset.espick);
  if ((b = c('[data-er-pick]'))) return escolherProduto(b.dataset.erPick);
  if (c('[data-act="es-trocar"]') || c('[data-act="es-limpar"]')) { ES.prod = ''; ES.pbusca = ''; ES.qtd = ''; ES.etqN = ''; render(); const x = $('esBusca'); if (x) x.focus(); return; }
  if (c('[data-act="es-entrada"]')) return estoqueSalvar(1);
  if (c('[data-act="es-saida"]')) return estoqueSalvar(-1);
  if (c('[data-mm-todas]')) { ES.mmTodas = !ES.mmTodas; return render(); }
  if ((b = c('[data-act="mm-det"]'))) return mmDetalhes(b.dataset.mm);
  if ((b = c('[data-act="mm-etq"]'))) return mmImprimirEtq(b.dataset.mm);
  if ((b = c('[data-act="mm-prod"]'))) return escolherProduto(b.dataset.pid);
  if ((b = c('[data-act="mm-mov"]'))) return itemSheet(b.dataset.pid);
}
function aoBipar(code, onde) {
  const cod = E.etqCodigo(code), pq = E.prodDoQr(code);
  if (cod) { Router.go('etiquetas', cod); return; }   // 상자 QR → 라벨 화면에서 그 상자
  const v = pq || code;
  if (ES.modo === 'entrada' || ES.modo === 'saida') { const L = E.buscaProdutos(v); if (L.length) return escolherProduto(L[0].id); return toast(t('r_nada_encontrado') + ' ' + v, 'bad'); }
  if (onde === 'estoque' && $('esFamBusca')) { ES.famBusca = v; return render(); }
  ES.busca = v; ES.pag = 1; render();
}

/* ---------- mover corredor (옛 moverCorredor) ---------- */
async function moverCorredor(ids) {
  if (!ids || !ids.length || !podeMexer()) return;
  const atual = ES.corredor && ES.corredor !== '__sem' ? ES.corredor : '';
  const r = await E.pergunta({ titulo: t('e_mover_tit'), texto: t('e_ins_sel', { n: ids.length }), html: '<div class="perg-senha"><select id="pergCorr" class="flt" style="width:100%"><option value="">' + esc(t('e_sem')) + '</option>' + CORREDORES.map(c => '<option value="' + esc(c) + '"' + (c === atual ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>', sim: t('e_mover_sel'), nao: t('cancelar'), ler: w => w.querySelector('#pergCorr').value });
  if (!r) return;
  const destino = r.extra || '';
  busy(true);
  try { await E.definirCorredor(ids, destino); toast(t('e_ins_movidos', { n: ids.length, c: destino ? corrFmt(destino) : t('e_sem') }), 'good'); }
  catch (e) { toast(String(e.message || e), 'bad'); }
  busy(false); ES.sel = {}; PR = await P(); render();
}
/* ---------- caixas: editar · excluir · ajuste (옛 cx-salvar · cx-excluir · ajusteSaldoInline) ---------- */
async function cxSalvar(cod) {
  const i = document.querySelector('[data-cx-qtd="' + cod + '"]'), v = Number(i ? i.value : NaN);
  if (!(v >= 0)) return toast(t('r_qtd_inv'), 'bad');
  const m = await E.pedirMotivo({ titulo: t('etq_motivo_tit'), texto: t('etq_motivo_txt') + ' ' + cod }); if (!m) return;
  try { await E.editarQtd(cod, v, m.motivo, m.tipo); toast(t('e_caixa_atualizada'), 'good'); } catch (e) { return toast(String(e.message || e), 'bad'); }
  const id = ES.expand; await carregarCaixas(id, false); render();
}
async function cxExcluir(cod) {
  const m = await E.pedirMotivo({ perigo: true, titulo: t('e_caixa_excluir_tit'), texto: t('e_caixa_excluir_txt') + ' ' + cod, sim: t('excluir') }); if (!m) return;
  try { await E.excluirEtiqueta(cod, m.motivo, m.tipo); toast(t('e_caixa_excluida'), 'good'); } catch (e) { return toast(String(e.message || e), 'bad'); }
  const id = ES.expand; await carregarCaixas(id, false); render();
}
async function ajusteSaldoInline(pid) {
  const a = document.querySelector('[data-as-delta="' + pid + '"]'), r = parseInt(String(a ? a.value : '').trim(), 10);
  if (!r) return toast(t('ajuste_inv'), 'bad');
  let s = a ? a.dataset.asEtq : null; if (!s) { const n = document.querySelector('[data-as-etq-sel="' + pid + '"]'); if (n) s = n.value; }
  if (!s) return toast(t('es_sem_etiqueta_estoque'), 'bad');
  const cx = (ES.etq[pid] || []).find(x => x.codigo === s), novo = Math.max(0, (cx ? cx.qtd_restante : 0) + r);
  const m = await E.pedirMotivo({ titulo: t('etq_motivo_tit'), texto: t('etq_motivo_txt') + ' ' + s }); if (!m) return;
  try { const x = await E.editarQtd(s, novo, m.motivo, m.tipo); toast(t('ajuste_ok') + ' ' + x.saldo, 'good'); } catch (e) { return toast(String(e.message || e), 'bad'); }
  await carregarCaixas(pid, false); render();
}
async function estornoResolver(id, aprovar) {
  const r = await E.pergunta({ perigo: !aprovar, titulo: t(aprovar ? 'est_aprovar_tit' : 'est_recusar_tit'), texto: t(aprovar ? 'est_aprovar_txt' : 'est_recusar_txt'), campo: true, campoPh: t('est_resposta_ph'), sim: t(aprovar ? 'est_aprovar' : 'est_recusar'), nao: t('cancelar') });
  if (!r) return;
  try { await E.estornoResolver(id, aprovar, r.campo); toast(t(aprovar ? 'est_aprovado_ok' : 'est_recusado_ok'), 'good'); } catch (e) { return toast(String(e.message || e), 'bad'); }
  ES.fila = null; PR = await P(); render();
}

/* ============================================================
 *  ENTRADA / SAÍDA (옛 telaEstoqueMov)
 * ============================================================ */
const prodEstoque = () => ES.prod ? prod(ES.prod) : null;
function esCodNome(p) { const cod = String(p.sku || p.nome || ''), des = String(p.descricao || '').trim(); return { cod, nome: E.normCod(des) === E.normCod(cod) ? '' : des }; }
function esBuscaResultadosHTML(o, L) {
  let s = '<div id="esBuscaRes">';
  if (o) s += '<div class="sel-prod"><span class="sp-foto">' + E.fotoHTML(o, 30) + '</span>' + svg(ICO.prod, 18) + '<div class="sp-desk"><b>' + esc(o.nome) + '</b><span>' + esc(o.barcode || '') + (o.descricao ? (o.barcode ? ' · ' : '') + esc(o.descricao) : '') + (o.corredor ? ' · ' + esc(t('r_corredor')) + ' ' + esc(corrFmt(o.corredor)) : '') + ' · ' + esc(t('es_saldo_atual')) + ': ' + o.qtd + '</span></div>' +
    '<div class="sp-mob"><b>' + esc(esCodNome(o).cod) + '</b>' + (esCodNome(o).nome ? '<span class="sp-nome">' + esc(esCodNome(o).nome) + '</span>' : '') + (o.barcode ? '<span class="sp-bc">' + esc(o.barcode) + '</span>' : '') + '<span class="sp-ok">' + svg(ICO.check, 13) + ' ' + esc(t('es_achado_ok')) + '</span></div>' +
    '<button type="button" class="btn sm" data-act="es-trocar"><i class="bt-ico-mob">' + svg(ICO.troca, 18) + '</i><span class="lb-desk">' + esc(t('r_trocar')) + '</span></button>' +
    '<div class="sp-kpis"><div><i>' + svg(ICO.cubo, 16) + '</i><span>' + esc(t('es_estoque_atual')) + '</span><b>' + numFmt(o.qtd) + ' <small>' + esc(t('un_curto')) + '</small></b></div><div><i>' + svg(ICO.pin, 16) + '</i><span>' + esc(t('es_local')) + '</span><b>' + esc(o.corredor ? corrFmt(o.corredor) : '—') + '</b></div><div><i>' + svg(ICO.etiq, 16) + '</i><span>' + esc(t('es_categoria')) + '</span><b>' + esc(o.categoria || '—') + '</b></div></div></div>';
  else if (ES.pbusca && !L.length) s += '<div class="aviso" style="margin:0 17px 16px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('r_nada_encontrado')) + '</div></div>';
  else if (L.length) s += '<div class="achados"><h4>' + esc(L3('찾은 상품', 'Products found', 'Produtos encontrados')) + ' (' + L.length + ')</h4>' + L.map(p => '<button type="button" class="achado" data-espick="' + esc(p.id) + '"><b>' + esc(p.nome) + '</b><span>' + esc(p.barcode || '') + (p.descricao ? (p.barcode ? ' · ' : '') + esc(p.descricao) : '') + ' · ' + esc(t('es_saldo_atual')) + ': ' + p.qtd + (p.corredor ? ' · ' + esc(corrFmt(p.corredor)) : '') + '</span></button>').join('') + '</div>';
  else s += '<div class="aviso" style="margin:0 17px 16px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('r_digite')) + '</div></div>';
  return s + '</div>';
}
const esQtdValor = () => ES.qtd == null || ES.qtd === '' ? (mob() ? '' : '1') : String(ES.qtd);
const esQtdNum = () => { const i = $('esQtd'); return Number(i ? i.value : esQtdValor()) || 0; };
const esEtqNNum = () => { if (ES.modo !== 'entrada' || !prodEstoque()) return 1; const i = $('esEtqN'); return Math.floor(Number(i ? i.value : ES.etqN)) || 1; };
const esEtqNConta = () => { const n = esEtqNNum(), q = esQtdNum(); return n > 1 ? t('es_etq_n_conta', { n: numFmt(n), q: numFmt(q), t: numFmt(n * q) }) : t('es_etq_n_uma'); };
function esEtqNHTML(o, a) { if (!o || !a) return ''; const v = ES.etqN == null || ES.etqN === '' ? '1' : String(ES.etqN); return '<div class="field"><label>' + esc(t('es_etq_n_lbl')) + '</label><input id="esEtqN" type="number" inputmode="numeric" min="1" max="50" value="' + esc(v) + '"><div class="hint" id="esEtqConta">' + esc(esEtqNConta()) + '</div></div>'; }
/* 내 최근 이동 (옛 esMinhasMovsHTML) */
const mmTipo = m => Number(m.delta) >= 0 ? 'entrada' : 'saida';
function esMinhasMovsHTML() {
  const L = ES.mm, agora = Date.now(), nL = L ? L.length : 0, curto = !ES.mmTodas && nL > MM_CURTO;
  let h = '<div class="panel mm-painel' + (curto ? ' mm-curto' : '') + '" id="mmPainel"><div class="mm-cab"><div class="mm-ico">' + svg(ICO.relogio, 20) + '</div><div class="mm-cab-tx"><h3><span class="lb-desk">' + esc(t('mm_tit')) + '</span><span class="lb-mob">' + esc(t('mm_tit_mob')) + '</span></h3><p>' + esc(t('mm_sub')) + '</p></div>' +
    (nL > MM_CURTO ? '<button type="button" class="er-todos mm-todas" data-mm-todas="1">' + esc(ES.mmTodas ? t('mm_ver_menos') : t('mm_ver_todas', { n: numFmt(nL) })) + svg(ICO.dir, 14) + '</button>' : '') + '</div>';
  if (ES.mmErro) return h + '<div class="mm-vazio mm-erro">' + esc(t('mm_erro')) + '</div></div>';
  if (!L) return h + '<div class="mm-vazio">' + esc(t('carregando')) + '</div></div>';
  if (!L.length) return h + '<div class="mm-vazio">' + esc(t('mm_vazio')) + '</div></div>';
  return h + '<div class="mm-rolagem"><table class="mm-tbl"><thead><tr><th>' + esc(t('data')) + '</th><th>' + esc(t('tipo')) + '</th><th>' + esc(t('mm_produto')) + '</th><th>' + esc(t('mm_descricao')) + '</th><th class="num">' + esc(t('qtd')) + '</th><th class="num">' + esc(t('mm_estoque_atual')) + '</th><th class="mm-acoes"></th></tr></thead><tbody>' +
    L.map((m, i) => {
      const p = prod(m.code) || { id: m.code, sku: m.code, nome: m.code, descricao: '' }, tp = mmTipo(m), q = Number(m.delta) || 0, ultima = i === 0 && agora - new Date(m.at).getTime() < 12e4;
      return '<tr class="mm-l mm-' + tp + (ultima ? ' mm-ultima' : '') + '" data-mm="' + esc(m.id) + '"><td class="mm-data"><b>' + esc(dataBR(m.at)) + '</b><span>' + esc(horaCurta(m.at)) + '</span>' + (ultima ? '<i class="mm-selo">' + esc(t('mm_ultima')) + ' · ' + esc(t('mm_agora')) + '</i>' : '') + '</td>' +
        '<td class="mm-tipo"><span class="mov-tag mov-tag-' + tp + '">' + svg(tp === 'entrada' ? ICO.entra : ICO.sai2, 12) + ' ' + esc(t('mm_' + tp)) + '</span></td><td class="mm-prod"><div class="mm-prod-c">' + E.miniProdutoHTML(p, 34) + '<b>' + esc(p.sku || '—') + '</b></div></td><td class="mm-desc">' + esc(p.descricao || '') + '</td>' +
        '<td class="num mm-qtd"><b>' + (q > 0 ? '+' : '') + numFmt(q) + '</b></td><td class="num mm-saldo" data-l="' + esc(t('mm_estoque_atual')) + ':"><b>' + numFmt(m.after || 0) + '</b></td>' +
        '<td class="mm-acoes"><details class="es-menu mm-menu"><summary class="btn-etq" aria-label="' + esc(t('acoes')) + '">' + svg(ICO.pontos, 16) + '</summary><div class="nu-menu"><button type="button" data-act="mm-det" data-mm="' + esc(m.id) + '">' + svg(ICO.olho, 15) + ' ' + esc(t('mm_m_det')) + '</button><button type="button" data-act="mm-prod" data-pid="' + esc(m.code) + '">' + svg(ICO.prod, 15) + ' ' + esc(t('mm_m_prod')) + '</button><button type="button" data-act="mm-mov" data-pid="' + esc(m.code) + '">' + svg(ICO.rel, 15) + ' ' + esc(t('mm_m_mov')) + '</button>' + (m.etq && q > 0 ? '<button type="button" data-act="mm-etq" data-mm="' + esc(m.id) + '">' + svg(ICO.print, 15) + ' ' + esc(t('mm_m_etq')) + '</button>' : '') + '</div></details></td></tr>';
    }).join('') + '</tbody></table></div></div>';
}
function ligarMm() {
  const c = $('mmPainel'); if (!c) return;
  c.querySelectorAll('.mm-menu').forEach(d => d.addEventListener('toggle', () => {
    if (!d.open) return; c.querySelectorAll('.mm-menu[open]').forEach(o => { if (o !== d) o.open = false; });
    const r = d.querySelector('summary').getBoundingClientRect(), m = d.querySelector('.nu-menu');
    if (m) { m.style.position = 'fixed'; m.style.top = Math.min(r.bottom + 4, window.innerHeight - m.offsetHeight - 8) + 'px'; m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px'; m.style.right = 'auto'; }
  }));
}
async function mmCarregar() { try { ES.mm = await E.minhasMovs(20); ES.mmErro = false; } catch (e) { ES.mmErro = true; } const el = $('mmPainel'); if (el) { el.outerHTML = esMinhasMovsHTML(); ligarMm(); } const er = $('erPainel'); if (er) er.outerHTML = esRecentesHTML(); }
/* 최근 입고한 상품 (폰 · 옛 esRecentesHTML) — 내 최근 움직임에서 */
function esRecentesHTML() {
  const vistos = {}, L = (ES.mm || []).filter(m => Number(m.delta) > 0 && m.kind === 'recv').map(m => prod(m.code)).filter(p => p && !vistos[p.id] && (vistos[p.id] = 1));
  let h = '<div class="panel er-painel" id="erPainel"><div class="er-cab"><div class="mm-ico">' + svg(ICO.relogio, 20) + '</div><div class="er-cab-tx"><h3>' + esc(t('er_tit')) + '</h3><p>' + esc(t('er_sub')) + '</p></div></div>';
  if (L.length) return h + '<div class="er-fila">' + L.slice(0, 12).map(p => { const cn = esCodNome(p); return '<button type="button" class="er-card" data-er-pick="' + esc(p.id) + '"><span class="er-foto">' + E.fotoHTML(p, 22) + '</span><span class="er-tx"><b>' + esc(cn.cod) + '</b>' + (cn.nome ? '<span>' + esc(cn.nome) + '</span>' : '') + '</span></button>'; }).join('') + '</div></div>';
  if (!ES.mm) return h + '<div class="er-fila er-esqueleto"><i></i><i></i><i></i></div></div>';
  return h + '<div class="er-msg">' + esc(t('er_vazio')) + '</div></div>';
}
function telaMov(modo) {
  const a = modo === 'entrada', o = prodEstoque(), L = o ? [] : E.buscaProdutos(ES.pbusca);
  let s = '<div class="page-head"><div><h1>' + esc(t(a ? 'es_entrada' : 'es_saida')) + '</h1><p>' + esc(t(a ? 'es_sub_e' : 'es_sub_s')) + '</p></div></div>' + barraModos().replace('class="modos"', 'class="modos es-mov-modos"') + (a && mob() ? esRecentesHTML() : '') +
    '<div class="panel es-mov-panel"><div class="form-grid"><div class="field" style="grid-column:1/-1"><label>' + esc(t('r_buscar')) + '</label><div class="campo-scan"><input id="esBusca" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="' + esc(t('r_buscar_ph')) + '" value="' + esc(ES.pbusca) + '"' + (o ? ' disabled' : '') + '><button type="button" class="scan-btn" data-scan="estoque" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 18) + '</button></div></div></div>';
  s += esBuscaResultadosHTML(o, L);
  const n = o ? '' : ' disabled';
  s += '<div class="passo2' + (o ? '' : ' travado') + '"><div class="passo-tit">' + esc(t('es_passo2')) + '</div><div class="form-grid"><div class="field"><label for="esQtd"><span class="lb-desk">' + esc(t(a ? 'es_qtd_entrada' : 'es_qtd_saida')) + '</span><span class="lb-mob">' + esc(t('es_qtd_mob')) + '</span></label><div class="es-qtd-w"><input id="esQtd" type="number" inputmode="numeric" pattern="[0-9]*" min="1" step="1" enterkeyhint="done" placeholder="' + esc(t('es_qtd_ph')) + '" value="' + esc(esQtdValor()) + '"' + n + '><span class="es-qtd-un">' + esc(t('un_curto')) + '</span></div></div>' + esEtqNHTML(o, a) + '</div>' +
    '<div class="form-acoes"><button class="btn" data-act="es-limpar">' + esc(t('r_limpar')) + '</button><button class="btn primary es-confirma" data-act="' + (a ? 'es-entrada' : 'es-saida') + '"' + n + '><i class="bt-ico-mob">' + svg(a ? ICO.entra : ICO.sai2, 20) + '</i>' + esc(t(a ? 'es_confirmar_e' : 'es_confirmar_s')) + '</button></div></div></div>';
  s += esMinhasMovsHTML();
  pintar('<div class="sb es-mov-tela">' + s + '</div>');
  mmCarregar();
  if (!o && !('ontouchstart' in window)) setTimeout(() => { const c = $('esBusca'); if (c && !E.modalAberto() && document.activeElement !== c && !(document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName))) try { c.focus({ preventScroll: true }); } catch (e) {} }, 0);
}
function ligarMov() {
  const c = $('esBusca'), o = prodEstoque();
  if (c && !o) {
    c.oninput = () => { ES.pbusca = c.value; const alvo = $('esBuscaRes'); if (alvo) alvo.outerHTML = esBuscaResultadosHTML(null, E.buscaProdutos(ES.pbusca)); };
    c.onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const v = c.value, cod = E.etqCodigo(v); if (cod) return Router.go('etiquetas', cod); const L = E.buscaProdutos(E.prodDoQr(v) || v); if (L.length) escolherProduto(L[0].id); else toast(t('r_nada_encontrado'), 'bad'); };
  }
  const q = $('esQtd'), n = $('esEtqN'), d = $('esEtqConta');
  if (q) { q.oninput = () => { ES.qtd = q.value; if (d) d.textContent = esEtqNConta(); }; q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); estoqueSalvar(ES.modo === 'entrada' ? 1 : -1); } }; }
  if (n) { n.oninput = () => { ES.etqN = n.value; if (d) d.textContent = esEtqNConta(); }; n.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); estoqueSalvar(1); } }; }
}
function escolherProduto(id) {
  const p = prod(id); if (!p) return toast(t('r_nada_encontrado'), 'bad');
  if (ES.modo !== 'entrada' && ES.modo !== 'saida') ES.modo = podeMexer() ? 'entrada' : 'consulta';
  ES.prod = p.id; ES.pbusca = ''; ES.qtd = ''; ES.etqN = ''; E.fecharModal(); render();
  const a = $('esQtd'); if (a) { a.focus(); try { a.select(); } catch (e) {} }
  toast(t('sc_achado') + ' ' + p.nome);
}
const limparMov = () => { ES.prod = ''; ES.pbusca = ''; ES.qtd = ''; ES.etqN = ''; };
let ES_VAZIO_OK = null;
/** 옛 estoqueSalvar — e = +1 입고 · -1 출고 */
async function estoqueSalvar(e, confirmar, existente) {
  const r = prodEstoque(); if (!r) return toast(t('r_sem_produto'), 'bad');
  if (e > 0 && r.vazia && ES_VAZIO_OK !== r.id) {
    const ok = await E.pergunta({ perigo: true, titulo: t('r_alerta_vazio_tit'), texto: (r.nome || '') + ' — ' + t('r_alerta_vazio_txt'), sim: t('r_alerta_vazio_ok'), nao: t('cancelar') });
    if (!ok) return; ES_VAZIO_OK = r.id; return estoqueSalvar(e, confirmar, existente);
  }
  ES_VAZIO_OK = null;
  const i = esQtdNum(); if (i <= 0) return toast(t('r_qtd_inv'), 'bad');
  if (e < 0) { if (i > (Number(r.qtd) || 0)) return toast(t('es_sem_saldo'), 'bad'); return esSaida(r, i); }
  const nE = esEtqNNum(); if (nE < 1 || nE > 50) return toast(t('es_etq_n_max'), 'bad');
  /* 이미 있는 상자에 더할까? (옛 perguntarEtiquetaExistente · modalEscolherEtiqueta) */
  if (!confirmar && existente == null && nE <= 1) {
    let ativas = []; try { ativas = (await E.listarEtiquetas(r.id)).filter(x => x.ativa); } catch (x) {}
    if (ativas.length) return modalEscolherEtiqueta(r, i, ativas);
  }
  busy(true); let d;
  try { d = await E.entrada(r.id, i, { n: nE, confirmar: !!confirmar, existente: existente || null }); }
  catch (x) { busy(false); return toast(String(x.message || x), 'bad'); }
  busy(false);
  if (d.aviso === 'entrada_recente') return modalEntradaDup(d, existente);
  limparMov(); ES.etq = {}; render();
  const lista = d.codigos.map(c => ({ codigo: c, sku: d.sku, nome: d.nome, barcode: d.barcode, corredor: d.corredor, qtd_inicial: d.existente ? d.qtd_inicial : d.qtd, qtd_restante: d.existente ? d.qtd_restante : d.qtd, criado_em: d.criado_em }));
  E.escolherTamanho(lista, { saldo: d.saldo, qtd: d.codigos.length > 1 ? null : d.qtd });
}
function modalEscolherEtiqueta(r, qtd, L) {
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('ent_vincular_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p style="margin:0 0 14px;color:var(--muted)">' + esc(t('ent_vincular_sub')) + '</p><div class="achados">' + L.map(e => '<button type="button" class="achado" data-act="ent-vincular" data-cod="' + esc(e.codigo) + '"><b>' + esc(e.codigo) + '</b><span>' + esc(t('r_corredor')) + ': ' + esc(e.corredor ? corrFmt(e.corredor) : '—') + ' · ' + esc(t('etq_restante')) + ': ' + e.qtd_restante + '</span></button>').join('') + '</div><button type="button" class="btn primary grande" style="width:100%;margin-top:10px" data-act="ent-nova-etiqueta">' + esc(t('ent_nova_etiqueta')) + '</button></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button></div>');
  w.addEventListener('click', ev => { const b = ev.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'ent-vincular') { E.fecharModal(); estoqueSalvar(1, false, b.dataset.cod); } else if (b.dataset.act === 'ent-nova-etiqueta') { E.fecharModal(); estoqueSalvar(1, false, ''); } });
}
function modalEntradaDup(d, existente) {
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('ent_dup_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="cs-perg"><div class="cs-perg-txt">' + svg(ICO.ajuda, 18) + ' <b>' + esc(d.nome || '') + '</b></div><div style="font-size:13.6px;color:#7a4a00">' + esc(t('ent_dup_txt')) + '</div></div><div class="etq-info" style="padding:0"><div class="bloco"><span>' + esc(t('ent_dup_qtd')) + '</span><b>+' + esc(String(d.ultima_qtd)) + '</b></div><div class="bloco txt"><span>' + esc(t('ent_dup_quando')) + '</span><b>' + esc(dataBR(d.ultima)) + '</b></div><div class="bloco txt"><span>' + esc(t('ent_dup_quem')) + '</span><b>' + esc(d.ultima_usuario || '—') + '</b></div><div class="bloco"><span>' + esc(L3('지난 시간', 'Ago', 'Há')) + '</span><b>' + esc(String(d.horas)) + esc(t('ent_dup_horas')) + '</b></div></div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('ent_dup_nao')) + '</button><button class="btn perigo danger" data-act="ent-dup-sim">' + esc(t('ent_dup_sim')) + '</button></div>');
  w.addEventListener('click', ev => { if (ev.target.closest('[data-act="ent-dup-sim"]')) { E.fecharModal(); estoqueSalvar(1, true, existente); } });
}

/* ---------- SAÍDA: repartir entre as etiquetas (옛 esSaida · esEscolherEtiqueta) ---------- */
let ESB = null;
const SEM = '__sem';   // 라벨 없는 재고 (새 앱: 라벨 이전부터 있던 재고) — 옛 앱의 '직접(direto)' 상품처럼 바로 뺌
async function esSaida(p, qtd) {
  let L = []; try { L = (await E.listarEtiquetas(p.id)).filter(e => e.ativa && e.qtd_restante > 0); } catch (e) {}
  const totEtq = L.reduce((s, e) => s + e.qtd_restante, 0), sem = Math.max(0, (Number(p.qtd) || 0) - totEtq);
  const lista = L.slice(); if (sem > 0) lista.push({ codigo: SEM, qtd_restante: sem, sem: true });
  const tem = lista.reduce((s, e) => s + e.qtd_restante, 0);
  if (!lista.length) return toast(t('es_sem_etiqueta_ativa'), 'bad');
  if (tem < qtd) return toast(t('es_etq_total_curto', { n: numFmt(tem) }), 'bad');
  const aloc = {}; let falta = qtd; lista.forEach(e => { const pega = Math.max(0, Math.min(e.qtd_restante, falta)); aloc[e.codigo] = pega; falta -= pega; });
  ESB = { lista, prod: p, qtd, aloc };
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('es_etq_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="sel-prod" style="margin:0 0 12px">' + svg(ICO.prod, 18) + '<div><b>' + esc(E.codEtq(p.sku)) + '</b><span>' + esc(t('es_etq_sub', { n: numFmt(qtd) })) + '</span></div></div>' +
    '<div class="es-etqs">' + lista.map(e => { const v = aloc[e.codigo] || 0; return '<div class="es-etq' + (v > 0 ? ' usando' : '') + '" data-etq="' + esc(e.codigo) + '"><span class="es-etq-cod">' + esc(e.sem ? L3('라벨 없음', 'No label', 'Sem etiqueta') : e.codigo) + '</span><span class="es-etq-meta">' + esc(e.sem ? L3('라벨 없이 있던 재고', 'Stock without a box label', 'Saldo que ainda não tem etiqueta') : [e.corredor ? corrFmt(e.corredor) : '', e.criado_em ? dataBR(e.criado_em) : ''].filter(Boolean).join('  ·  ')) + '</span><span class="es-etq-qtd" title="' + esc(t('es_etq_disp')) + '">' + numFmt(e.qtd_restante) + '</span><input type="number" class="es-etq-in" inputmode="numeric" min="0" max="' + e.qtd_restante + '" value="' + v + '" data-rep="' + esc(e.codigo) + '"><button type="button" class="es-etq-tudo" data-act="es-etq-tudo" data-cod="' + esc(e.codigo) + '">' + esc(t('es_etq_tudo')) + '</button></div>'; }).join('') + '</div>' +
    '<div class="es-rep-pe"><div class="es-rep-conta" id="esRepConta"></div></div><div class="hint" style="margin-top:11px">' + esc(t('es_etq_dica')) + '</div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button><button class="btn primary" id="esRepOk" data-act="es-rep-ok">' + esc(t('es_etq_confirmar')) + '</button></div>');
  w.querySelectorAll('.es-etq-in').forEach(i => { i.addEventListener('input', () => { if (!ESB) return; const max = Number(i.max) || 0; ESB.aloc[i.dataset.rep] = Math.max(0, Math.min(max, Math.floor(Number(i.value) || 0))); repPintar(); }); i.addEventListener('blur', () => { if (ESB) { const v = Number(ESB.aloc[i.dataset.rep]) || 0; if (String(v) !== i.value) i.value = String(v); } }); });
  w.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]'); if (!b || !ESB) return;
    if (b.dataset.act === 'fechar-modal') { ESB = null; return; }
    if (b.dataset.act === 'es-etq-tudo') { const cod = b.dataset.cod, etq = ESB.lista.find(x => x.codigo === cod); const falta = ESB.qtd - somaAloc() + (Number(ESB.aloc[cod]) || 0); ESB.aloc[cod] = Math.max(0, Math.min(etq.qtd_restante, falta)); const i = w.querySelector('.es-etq-in[data-rep="' + cod + '"]'); if (i) i.value = String(ESB.aloc[cod]); repPintar(); }
    if (b.dataset.act === 'es-rep-ok') repConfirmar();
  });
  repPintar();
}
const somaAloc = () => Object.keys(ESB.aloc).reduce((s, k) => s + (Number(ESB.aloc[k]) || 0), 0);
function repPintar() {
  if (!ESB) return; const soma = somaAloc(), falta = ESB.qtd - soma, conta = $('esRepConta'), ok = $('esRepOk');
  if (conta) { conta.textContent = falta > 0 ? t('es_etq_falta', { n: numFmt(falta) }) : falta < 0 ? t('es_etq_passou', { n: numFmt(-falta) }) : t('es_etq_fecha', { n: numFmt(ESB.qtd) }); conta.className = 'es-rep-conta' + (falta === 0 ? ' ok' : falta < 0 ? ' passou' : ''); }
  if (ok) ok.disabled = falta !== 0;
  document.querySelectorAll('.es-mw .es-etq').forEach(el => el.classList.toggle('usando', (Number(ESB.aloc[el.dataset.etq]) || 0) > 0));
}
async function repConfirmar() {
  const c = ESB; if (!c) return E.fecharModal();
  if (somaAloc() !== c.qtd) return toast(t('es_etq_falta', { n: numFmt(c.qtd - somaAloc()) }), 'bad');
  const itens = Object.keys(c.aloc).filter(k => k !== SEM && c.aloc[k] > 0).map(k => ({ codigo: k, qtd: c.aloc[k] })), sem = c.aloc[SEM] || 0;
  ESB = null; E.fecharModal(); busy(true);
  let d; try { d = await E.baixarLote(c.prod.id, itens, sem, t('es_saida_motivo')); } catch (x) { busy(false); return toast(String(x.message || x), 'bad'); }
  busy(false);
  if (d.parcial) toast(t('es_baixa_parcial', { aplicado: numFmt(d.aplicado), pedido: numFmt(d.baixado), dif: numFmt(d.baixado - d.aplicado) }), 'bad'); else toast(t('etq_baixa_ok'), 'good');
  limparMov(); ES.etq = {}; render();
}

/* ---------- detalhes · reimprimir · estorno (옛 mmDetalhes · mmImprimirEtq · estornarPedir) ---------- */
function mmDetalhes(id) {
  const m = (ES.mm || []).find(x => x.id === id); if (!m) return;
  const p = prod(m.code) || { sku: m.code, descricao: '' }, tp = mmTipo(m), q = Number(m.delta) || 0, linha = (k, v) => '<div class="row"><span class="k">' + esc(k) + '</span><span class="v">' + v + '</span></div>';
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('mm_det_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="rows mm-det">' + linha(t('tipo'), '<span class="mov-tag mov-tag-' + tp + '">' + esc(t('mm_' + tp)) + '</span>') + linha(t('mm_produto'), esc(p.sku || '—')) + linha(t('mm_descricao'), esc(p.descricao || '—')) + linha(t('qtd'), '<b class="mm-q-' + tp + '">' + (q > 0 ? '+' : '') + numFmt(q) + '</b>') + linha(t('mm_antes'), m.before == null ? '—' : numFmt(m.before)) + linha(t('mm_depois'), numFmt(m.after || 0)) + linha(t('data'), esc(dataBR(m.at))) + linha(t('mm_hora'), esc(horaCurta(m.at))) + linha(t('mm_usuario'), esc(m.byName || m.by || '—')) + (m.etq ? linha(L3('라벨', 'Label', 'Etiqueta'), esc(m.etq)) : '') + (m.note ? linha(t('motivo'), esc(m.note)) : '') + (m.estornadoPor ? linha(L3('되돌림', 'Reversal', 'Estorno'), esc(L3('되돌렸음', 'reversed', 'estornada'))) : '') +
    '</div><p class="mm-nota">' + svg(ICO.lock, 13) + ' ' + esc(t('mm_nao_edita')) + '</p></div><div class="modal-foot">' + (podeMexer() && q !== 0 && !m.estornadoPor && !m.estorna ? '<button class="btn perigo danger" data-act="est-corrigir">' + esc(t('est_corrigir')) + '</button>' : '') + '<button class="btn" style="margin-left:auto" data-act="fechar-modal">' + esc(t('nu_fechar')) + '</button></div>');
  w.addEventListener('click', ev => { if (ev.target.closest('[data-act="est-corrigir"]')) estornarPedir(m.id); });
}
async function estornarPedir(movId) {
  const m = await E.pedirMotivo({ perigo: true, titulo: t('est_tit'), texto: t('est_txt'), sim: t('est_corrigir'), tipo: 'Data Correction' }); if (!m) return;
  try { await E.estornar(movId, m.motivo, m.tipo); toast(t('est_ok'), 'good'); PR = await P(); ES.etq = {}; return render(); }
  catch (x) {
    if (!x.detail) return toast(String(x.message || x), 'bad');
    const ok = await E.pergunta({ titulo: t('est_bloq_tit'), texto: (x.message || '') + ' ' + t('est_bloq_' + x.detail.replace('estorno_', '')), sim: t('est_pedir'), nao: t('cancelar') });
    if (!ok) return;
    try { await E.estornoPedir(movId, m.motivo, m.tipo); toast(t('est_pedido_ok'), 'good'); } catch (y) { toast(String(y.message || y), 'bad'); }
  }
}
async function mmImprimirEtq(id) {
  const m = (ES.mm || []).find(x => x.id === id); if (!m || !m.etq) return;
  const e = await E.lerEtiqueta(m.etq);
  if (!e) return toast(t('mm_etq_nada'), 'bad');
  if (!e.ativa || !(e.qtd_restante > 0)) return toast(t('mm_etq_encerrada'), 'bad');
  E.escolherTamanho([e]);
}
