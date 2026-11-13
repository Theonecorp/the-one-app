/* ============================================================
 *  📦 상품 (#/produtos) — 옛 THE ONE CORP WMS 의 "Produtos" 화면을 그대로 (레이아웃 · 글 · 동작)
 *    컴퓨터: 숫자 칸(누르면 걸러보기) · 머리 단추 · 검색/스캔 · 여러 개 고르는 걸러보기(분류 · 통로 · 공급업체 · 상태) · 열 고르기
 *            정렬 표(# · 선택 · 상자 다 씀 · 사진 · 열들) · 한 쪽 수 · 쪽 넘기기 · 선택 막대(라벨 · 바코드 · 빈 상자 · 확인 요청 · 내보내기 · PDF · 삭제)
 *            줄을 누르면 오른쪽 서랍 — 기본 / 공급 / 움직임 · 수정 · 사용/중지 · 삭제 · 재고 조정 · 바코드 만들기 · 라벨 다시 인쇄 · 확인 요청
 *    폰(≤760px): 분류 → 코드 묶음(familia) → 상품 카드 (사진 · 칩) — 검색 · 걸러보기를 쓰면 표
 *  자료를 어디서 읽고 쓰나 (옛 앱의 표 → 새 앱)
 *    상품 마스터 = 카탈로그(catalog.js) — 코드 c · 설명 d · 가격 p · 바코드 b · 분류 g/l1 · 위치 loc · 공급업체 sup · 숨김 h(= 옛 ativo 의 반대)
 *        고치기는 items.js 와 같은 길: editCatalog(S, rows => …) — 창고(whmgr · pick 처럼 newOrder · invoice · catalog 가 없는 일)는 위치(통로)만
 *        옛 nome = 코드 (옛 앱 4천여 상품의 관례) · 옛 categoria = Level 1 · 옛 corredor = 위치의 통로 부분 (estoque 와 같음)
 *    재고 = stock/{code}: qty · min(부족 기준, 옛 앱처럼 화면에서는 못 고침) · vazia(상자 다 씀 — 재고 0 일 때만 · 입고가 지움)
 *        재고 조정은 etq.js (상자 라벨이 있으면 그 상자로, 없으면 라벨 없는 재고) → stock.js moveStock → stockLog
 *    옛 앱에만 있던 칸 (새 앱에 자리가 없어 새로 만듦)
 *        prodExtra/{code} = { peso, comp, larg, alt, max, at, by }  — 배송 박스 무게 · 크기(옛 envio_*) · 많음 기준(옛 "alto")
 *        prodCusto/{code} = { custo, at, by }                      — 원가 (관리자 · 오너만 읽고 씀 — inboundCost 처럼 따로)
 *    확인 요청(옛 rpc_solicitar_rechecagem) = rechecagem/{id} = { id, code, motivo: saldo|misturado|nao_encontrado, origem, origemRef, por, porNome, em, status:'aberta' }
 *        같은 상품의 열린 요청이 있으면 새로 만들지 않고 그것을 고침 (옛 앱과 같음)
 *    채우기 요청 reposicao/{id} — 서랍의 요청 카드(repor.js reporCardHTML · 옛 Consulta 의 cs2-repor) 로 만들고 · 🔁 채울 상품(#/repor) 에서 처리 · 움직임 탭에 보임
 *  권한: 세일즈맨 = 보기만 · 재고 담당(can items) = 상자 · 조정 · 확인 요청 · 라벨 · 고치기(창고는 위치만) · 원가 · 가치 · 내보내기 = 관리자 · 오너 · 삭제 = 관리자 (items.js 와 같음, 재고가 남은 상품은 거절)
 *  옮기지 않음: 변형(variacoes) 보기 · 사진 여러 장 · 판매 제한 · 가져오기 화면(📋 일괄 등록 #/items/bulk 로) · 사진 일괄(#/photos 로)
 * ============================================================ */
import { $, esc, toast, Router, busy, debounce, printOpen, R2, num, money } from './ui.js';
import { openScanner } from './scan.js';
import { can, isTop } from './main.js';
import { catalog, loadCatalog, locOf, levelsOf, thumb, exactItem, editCatalog, ensureCats, setHidden, setLoc } from './catalog.js';
import { stockAll, minOf, supLabel, supSelect, supValue, supBind } from './stock.js';
import { newId } from './db.js';
import * as E from './etq.js';
import { L3 } from './balcao.js';
import { reposAbertas, reporCardHTML, pedirReposicaoPopup, injetarCssRepor } from './repor.js';
import { PM_CSS, PM_MAIS, PM_DOC_CSS } from './produtos-css.js';
import { D } from './produtos-txt.js';

const { svg, numFmt, dataBR, horaCurta, corrFmt, CORREDORES, ordemCorr, quem } = E;
const ICO = Object.assign({}, E.ICO, {
  cxCheia: '<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="m4 8.5 8 4.5 8-4.5M12 13v7"/>',
  cxVazia: '<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="m4 8.5 8 4.5 8-4.5"/><path d="M5 19.5 19 5.2"/>',
  chave: '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-2.4-.4-.4-2.4z"/>'
});
/** 문구 — 이 화면의 사전(produtos-txt) 먼저, 없으면 재고 사전(estoque-txt) */
const t = (k, v) => { const x = D[k]; if (!x) return E.t(k, v); let s = L3(x[0], x[1], x[2]); if (v) Object.keys(v).forEach(n => { s = s.split('{' + n + '}').join(String(v[n])); }); return s; };
const te = k => { const x = D[k]; return x ? x[1] : E.te(k); };

let S = null;
export function register(state) {
  S = state; E.init(state); Router.on('produtos', page);
  Router.up.produtos = () => { if (PM.drawer) { fecharDrawer(); return true; } if (PM.nav.length) { PM.nav = PM.nav.slice(0, -1); render(); return true; } return false; };
  Router.upHas.produtos = () => !!(PM.drawer || PM.nav.length);
}

/* ---------- 권한 (옛 vd · podeMexerEstoque · GERENTE · podeVerValor) ---------- */
const vd = () => S.role === 'salesman';
const mexe = () => !vd() && can('items');
const isAdmin = () => S.role === 'admin' || !!(S.me && S.me.role === 'admin');
/** items.js 의 locOnly — 창고 매니저 · 창고 직원은 위치만 */
const locOnly = () => S.role !== 'admin' && !can('newOrder') && !can('invoice') && !can('catalog');
const edita = () => mexe() && !locOnly();
const ger = () => isTop();
const podeExcluir = () => isAdmin();

/* ---------- 상태 (옛 S.*) ---------- */
const PM = { busca: '', cat: [], local: [], forn: [], sit: [], ordem: 'nome', dir: 1, pag: 1, porPag: null, sel: {}, mfAberto: '', mfBusca: '', pop: false, filtros: false,
  nav: [], navBusca: '', navLista: false, drawer: '', aba: 'geral', mov: null, movPediu: '', caixas: null };
const POR_PAG_OPCOES = [10, 15, 20, 30, 0], PP_PADRAO = 15, PP_CH = 'theone.prodPorPag';
const COLS = [{ k: 'nome', rot: 'c_nome', fixa: 1 }, { k: 'qtd', rot: 'c_qtd', num: 1 }, { k: 'situacao', rot: 'c_sit' }, { k: 'descricao', rot: 'c_desc' }, { k: 'corredor', rot: 'r_corredor' }, { k: 'categoria', rot: 'c_cat' }, { k: 'barcode', rot: 'r_barcode' }, { k: 'minimo', rot: 'c_min', num: 1 }, { k: 'fornecedor', rot: 'c_forn' }, { k: 'custo', rot: 'c_custo', num: 1, ger: 1 }, { k: 'preco', rot: 'c_preco', num: 1 }, { k: 'valor_estoque', rot: 'c_valor', num: 1, ger: 1 }];
const PADRAO = ['nome', 'descricao', 'qtd', 'corredor', 'categoria', 'barcode', 'custo', 'preco', 'situacao'];
let visiveis = PADRAO.slice();
const SIT_CLS = { ok: 'ok', baixo: 'low', alto: 'high', picking: 'pick', empty: 'vazia', inativo: 'off' };
const SIT_TXT = { sempreco: 'st_sem_preco', ok: 'st_ok', baixo: 'st_baixo', alto: 'st_alto', picking: 'st_picking', empty: 'st_empty', inativo: 'st_inativo' };
const colsAtivas = () => COLS.filter(c => visiveis.indexOf(c.k) >= 0 && (!c.ger || ger()));
const mob = () => window.innerWidth <= 760;
const vlr = n => n == null ? '—' : money(n);   // ui.money — 👁 금액 숨기기를 따름 (예전 toLocaleString 과 같은 $1,234.50)
const ini = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const rot = v => String(v == null ? '' : v);
/** 옛 gvFamilia — 코드 앞 글자 묶음 (V- · N_ · 14K 같은 앞말은 뺌) */
const gvFamilia = sku => String(sku == null ? '' : sku).trim().replace(/^(V-|N_|\d+K)/i, '').replace(/[^A-Za-z].*$/, '').toUpperCase();
const fArr = v => Array.isArray(v) ? v.filter(x => x !== '' && x != null) : (v ? [v] : []);
const fBate = (v, val) => { const a = fArr(v); return !a.length || a.indexOf(val) >= 0; };
const fTem = k => fArr(PM[k]).length > 0;

/* ============================================================
 *  DADOS (옛 carregar · DADOS.produtos)
 * ============================================================ */
let PR = [], BY = {}, EXTRA = {}, CUSTO = {}, VAZ = {}, QTD = {}, LIDO = 0;
async function carregar(force) {
  await loadCatalog(S, !!force);
  try { QTD = await stockAll(force); } catch (e) { QTD = {}; }
  VAZ = {}; try { (await S.DB.list('stock', { where: [['vazia', '==', true]] })).forEach(r => { VAZ[r.code || r.id] = true; }); } catch (e) {}
  EXTRA = {}; try { (await S.DB.list('prodExtra')).forEach(r => { EXTRA[r.id] = r; }); } catch (e) {}
  CUSTO = {}; if (ger()) { try { (await S.DB.list('prodCusto')).forEach(r => { CUSTO[r.id] = r; }); } catch (e) {} }
  montar(); LIDO = Date.now();
}
function montar() {
  const C = catalog(); BY = {};
  PR = (C ? C.items : []).filter(x => !x.virt).map(x => {
    const loc = locOf(x), L = levelsOf(x, 'l1'), ex = EXTRA[x.c] || {}, cu = CUSTO[x.c], q = Number(QTD[x.c]) || 0;
    const p = { id: x.c, sku: x.c, nome: x.c, descricao: x.d || '', barcode: x.b || '', loc, corredor: E.corrDe(loc), categoria: L[0] || '', grupo: x.g || '', fornecedor: x.sup ? supLabel(x.sup) : '', sup: x.sup || '',
      qtd: q, minimo: minOf(x.c), caixa_vazia: !!VAZ[x.c], preco: Number(x.p) || 0, ativo: !x.h, foto: x.ph || '', ex, custo: cu && cu.custo != null && cu.custo !== '' ? Number(cu.custo) || 0 : null };
    p.sem_preco = !(p.preco > 0);
    p.valor_estoque = p.custo == null ? null : R2(p.custo * q);
    p.margem = p.custo != null && p.preco > 0 ? Math.round((p.preco - p.custo) / p.preco * 1000) / 10 : null;
    p.situacao = situacao(p); BY[p.id] = p; return p;
  });
}
/** 옛 v_produtos.situacao — inativo · empty · picking(재고 0) · baixo(기준 아래) · alto(prodExtra.max 위) · ok */
function situacao(p) {
  if (!p.ativo) return 'inativo'; if (p.caixa_vazia) return 'empty';
  const q = Number(p.qtd) || 0; if (!q) return 'picking'; if (q < (Number(p.minimo) || 0)) return 'baixo';
  const mx = Number(p.ex && p.ex.max) || 0; if (mx && q > mx) return 'alto'; return 'ok';
}
const prodPorId = id => BY[String(id || '').toUpperCase()] || BY[id] || null;
function resumo() {
  const a = { ativos: 0, inativos: 0, baixo: 0, alto: 0, picking: 0, vazias: 0, unidades: 0, valor_total: 0 };
  PR.forEach(p => { if (!p.ativo) { a.inativos++; return; } a.ativos++; a.unidades += p.qtd; if (p.situacao === 'baixo') a.baixo++; if (p.situacao === 'alto') a.alto++; if (p.situacao === 'picking') a.picking++; if (p.caixa_vazia) a.vazias++; if (p.valor_estoque) a.valor_total += p.valor_estoque; });
  return a;
}
function sitUma(p, s) { if (!s) return true; if (s === 'sempreco') return p.sem_preco; if (s === 'inativo') return !p.ativo; if (s === 'ok') return p.ativo && p.situacao === 'ok'; return p.situacao === s; }
const situacaoBate = (p, sit) => { const a = fArr(sit); return !a.length || a.some(s => sitUma(p, s)); };
function prodBateBusca(e, q, cod) {
  if (!q) return true;
  if ([e.nome, e.sku, e.barcode, e.descricao, e.categoria, e.fornecedor, e.corredor, e.loc].join(' ').toLowerCase().indexOf(q) >= 0) return true;
  return !!cod && E.normCod(e.sku).indexOf(cod) >= 0;
}
/** 옛 lista() — 걸러보기 + 정렬 (숫자는 숫자로, 글은 numeric) */
function lista() {
  const q = PM.busca.trim().toLowerCase(), cod = E.normCod(PM.busca);
  const L = PR.filter(e => fBate(PM.cat, e.categoria) && fBate(PM.local, String(e.corredor || '').toUpperCase()) && fBate(PM.forn, e.fornecedor) && situacaoBate(e, PM.sit) && prodBateBusca(e, q, cod));
  const k = PM.ordem, d = PM.dir;
  return L.sort((x, y) => { const a = x[k], b = y[k]; return typeof a === 'number' || typeof b === 'number' ? ((a || 0) - (b || 0)) * d : String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'pt-BR', { numeric: true }) * d; });
}
const porPag = () => { if (PM.porPag != null) return PM.porPag; let v = PP_PADRAO; try { const s = localStorage.getItem(PP_CH); if (s !== null && POR_PAG_OPCOES.indexOf(Number(s)) >= 0) v = Number(s); } catch (e) {} return (PM.porPag = v); };
function paginar(L, tam) { const n = Number(tam) > 0 ? Number(tam) : Math.max(L.length, 1), tp = Math.max(1, Math.ceil(L.length / n)); if (PM.pag > tp) PM.pag = tp; if (PM.pag < 1) PM.pag = 1; const de = (PM.pag - 1) * n; return { pag: L.slice(de, de + n), totalPag: tp, de }; }
const nSel = () => Object.keys(PM.sel).length;

/* ============================================================
 *  TELA (옛 telaProdutos)
 * ============================================================ */
async function page(arg) {
  E.injetarCss(); injetarCss();
  if (arg) { const a = decodeURIComponent(String(arg)); if (a === 'novo') setTimeout(() => modalProduto(null), 300); else if (a.indexOf('p/') === 0) PM.busca = a.slice(2); else PM.busca = a; PM.pag = 1; }
  if (!PR.length) $('page').innerHTML = '<div class="sb pm-raiz"><div id="conteudo"><div class="placeholder">' + esc(t('carregando')) + '</div></div></div>';
  try { await carregar(Date.now() - LIDO > 60000); } catch (e) { toast(String(e.message || e), 'bad'); }
  if (location.hash.indexOf('#/produtos') !== 0) return;
  render();
}
function injetarCss() { if (document.getElementById('pmCss')) return; const st = document.createElement('style'); st.id = 'pmCss'; st.textContent = PM_CSS + PM_MAIS + PM_DOC_CSS; document.head.appendChild(st); }
function render() {
  if (location.hash.indexOf('#/produtos') !== 0) return;
  const html = (mob() && !PM.busca && !fTem('cat') && !fTem('local') && !PM.navLista) ? telaCel() : telaProdutos();
  const ae = document.activeElement, foco = ae && ae.id && $('page').contains(ae) ? { id: ae.id, pos: ae.selectionStart } : null;
  $('page').innerHTML = '<div class="sb pm-raiz"><div id="conteudo" class="pm-tela">' + html + '</div></div>';
  if (foco) { const n = $(foco.id); if (n && n.tagName === 'INPUT') { try { n.focus(); if (foco.pos != null && n.setSelectionRange) n.setSelectionRange(foco.pos, foco.pos); } catch (e) {} } }
  ligar();
  if (PM.drawer) pintarDrawer();
}
function tile(l, v, cls, s, sit) {
  const dentro = '<div class="lbl">' + esc(l) + '</div><div class="val ' + (cls || '') + '">' + esc(v == null ? '—' : v) + '</div><div class="sub">' + esc(s) + '</div>';
  return sit ? '<button type="button" class="tile clic" data-tile-sit="' + esc(sit) + '">' + dentro + '</button>' : '<div class="tile">' + dentro + '</div>';
}
function multiFiltro(id, chave, rotulo, ops) {
  const sel = fArr(PM[chave]), aberto = PM.mfAberto === id, q = aberto ? String(PM.mfBusca || '').trim().toLowerCase() : '';
  let rotSel = '';
  if (sel.length === 1) { const a = ops.find(o => o.v === sel[0]); rotSel = a ? a.r : sel[0]; } else if (sel.length > 1) rotSel = sel.length + ' ' + t('mf_escolhidos');
  const vis = q ? ops.filter(o => String(o.r).toLowerCase().indexOf(q) >= 0 || String(o.v).toLowerCase().indexOf(q) >= 0) : ops;
  let h = '<div class="mf' + (aberto ? ' aberto' : '') + '" data-mfbox="' + esc(id) + '"><button type="button" class="mf-bt' + (sel.length ? ' on' : '') + '" data-mf="' + esc(id) + '"><span>' + esc(sel.length ? rotSel : rotulo) + '</span>' + (sel.length > 1 ? '<i class="mf-n">' + sel.length + '</i>' : '') + '<b class="mf-seta"></b></button>';
  if (aberto) {
    h += '<div class="mf-pop">' + (ops.length > 8 ? '<div class="mf-busca"><input type="search" id="mfBuscaIn" autocomplete="off" placeholder="' + esc(t('mf_buscar')) + '" value="' + esc(PM.mfBusca || '') + '"></div>' : '') +
      '<div class="mf-lista" id="mfLista">' + mfListaHTML(vis, sel, chave) + '</div>' +
      '<div class="mf-pe"><button type="button" class="btn sm" data-act="mf-limpar" data-mfk="' + esc(chave) + '">' + esc(t('mf_limpar')) + '</button><button type="button" class="btn sm primary" data-act="mf-fechar">' + esc(t('mf_ok')) + '</button></div></div>';
  }
  return h + '</div>';
}
const mfListaHTML = (vis, sel, chave) => vis.length ? vis.map(o => '<label><input type="checkbox" data-mfv="' + esc(o.v) + '" data-mfk="' + esc(chave) + '"' + (sel.indexOf(o.v) >= 0 ? ' checked' : '') + '> <span>' + esc(o.r) + '</span></label>').join('') : '<div class="mf-nada">' + esc(t('mf_nada')) + '</div>';
const MF = {
  fCat: () => ({ chave: 'cat', rot: t('cat_todas'), ops: Array.from(new Set(PR.map(p => p.categoria).filter(Boolean))).sort().map(c => ({ v: c, r: c })) }),
  fLocal: () => ({ chave: 'local', rot: t('corr_todos'), ops: CORREDORES.concat(Array.from(new Set(PR.map(p => p.corredor).filter(c => c && CORREDORES.indexOf(c) < 0))).sort()).map(c => ({ v: c, r: corrFmt(c) })) }),
  fForn: () => ({ chave: 'forn', rot: t('forn_todos'), ops: Array.from(new Set(PR.map(p => p.fornecedor).filter(Boolean))).sort().map(c => ({ v: c, r: c })) }),
  fSit: () => ({ chave: 'sit', rot: t('sit_todas'), ops: [['ok', 'st_ok'], ['baixo', 'st_baixo'], ['alto', 'st_alto'], ['picking', 'st_picking'], ['empty', 'st_empty'], ['sempreco', 'st_sem_preco'], ['inativo', 'sit_inativos']].map(x => ({ v: x[0], r: t(x[1]) })) })
};
const mfHTML = id => { const m = MF[id](); return multiFiltro(id, m.chave, m.rot, m.ops); };
const pmFiltrosN = () => ['cat', 'local', 'forn', 'sit'].filter(fTem).length;
const pmFiltrosBtn = () => { const n = pmFiltrosN(); return '<button type="button" class="pm-filtros' + (PM.filtros ? ' on' : '') + '" data-act="pm-filtros"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg> ' + esc(t('pm_filtros')) + (n ? '<span class="pm-badge">' + n + '</span>' : '') + '</button>'; };
const pmSitCls = p => { const q = Number(p.qtd) || 0, m = Number(p.minimo) || 0; return q <= 0 ? 's-zero' : (m && q < m) || p.situacao === 'baixo' ? 's-baixo' : p.situacao === 'alto' ? 's-alto' : ''; };
const sitInfoBtn = s => '<button type="button" class="badge sit-info" data-act="sit-info" data-sit="' + esc(s || 'ok') + '" title="' + esc(t('sit_info_titulo')) + '">?</button>';
const btnCopiar = v => v ? '<button type="button" class="btn-copiar" data-copiar="' + esc(v) + '" title="' + esc(t('copiar')) + '">' + svg(ICO.copiar, 13) + '</button>' : '';
const celulaNum = v => numFmt(v) + ' <i class="und-un">' + esc(t('un_curto')) + '</i>';
const miniFoto = (p, n) => E.miniProdutoHTML(p, n);
function celula(e, c) {
  const o = ' data-l="' + esc(t(c.rot)) + '"';
  switch (c.k) {
    case 'nome': { const cod = e.sku, des = String(e.descricao || '').trim(), sub = E.normCod(des) === E.normCod(cod) ? '' : des, m = [e.corredor ? corrFmt(e.corredor) : '', e.categoria].filter(Boolean).join(' · ');
      return '<td class="principal"' + o + '><div class="cell-name"><div class="thumb">' + esc(ini(cod)) + '</div><div class="txt"><b>' + esc(cod) + '</b>' + (sub ? '<span class="cell-cod">' + esc(sub) + '</span>' : '') + (m ? '<span class="cell-mob">' + esc(m) + '</span>' : '') + '</div>' + btnCopiar(cod) + '</div></td>'; }
    case 'descricao': return '<td' + o + ' style="color:#5a6672">' + esc(e.descricao || '—') + '</td>';
    case 'categoria': return '<td' + o + '><span class="tag">' + esc(rot(e.categoria) || '—') + '</span></td>';
    case 'qtd': return '<td class="num"' + o + '><b class="saldo-tip">' + celulaNum(e.qtd) + '</b></td>';
    case 'minimo': return '<td class="num"' + o + ' style="color:var(--muted)"><span class="min-calc">' + numFmt(e.minimo) + '</span></td>';
    case 'corredor': return '<td' + o + '><span class="tag">' + esc(e.corredor ? corrFmt(e.corredor) : '—') + '</span></td>';
    case 'barcode': return '<td' + o + ' style="color:#5a6672;font-variant-numeric:tabular-nums">' + esc(e.barcode || '—') + '</td>';
    case 'fornecedor': return '<td' + o + ' style="color:#5a6672">' + esc(e.fornecedor || '—') + '</td>';
    case 'custo': return '<td class="num"' + o + ' style="color:#5a6672">' + vlr(e.custo) + '</td>';
    case 'preco': return '<td class="num"' + o + '><b>' + vlr(e.preco) + '</b></td>';
    case 'valor_estoque': return '<td class="num"' + o + '>' + vlr(e.valor_estoque) + '</td>';
    case 'situacao': return '<td' + o + '><span class="badge ' + (SIT_CLS[e.situacao] || 'ok') + '">' + esc(t(SIT_TXT[e.situacao] || 'st_ok')) + '</span>' + sitInfoBtn(e.situacao) + '</td>';
  }
  return '<td' + o + '>—</td>';
}
function popColunas() {
  return '<div class="pop" id="popCols"><h4>' + esc(t('colunas')) + '</h4>' + COLS.filter(c => !c.ger || ger()).map(c => '<label><input type="checkbox" data-col="' + c.k + '"' + (visiveis.indexOf(c.k) >= 0 ? ' checked' : '') + (c.fixa ? ' disabled' : '') + '> ' + esc(t(c.rot)) + '</label>').join('') + '<div class="foot"><button class="btn sm" data-act="reset-cols">' + esc(t('restaurar')) + '</button></div></div>';
}
function telaProdutos() {
  const e = lista(), a = resumo(), o = colsAtivas(), r = paginar(e, porPag()), i = r.pag, filtro = PM.busca || fTem('cat') || fTem('local') || fTem('forn') || fTem('sit');
  let n = '<div class="tiles pm-tiles">' + tile(t('tile_ativos'), numFmt(a.ativos), '', numFmt(a.inativos) + ' ' + t('tile_inativos'), '') + tile(t('st_baixo'), numFmt(a.baixo), 'warn', t('tile_baixo_sub'), 'baixo') + tile(t('st_alto'), numFmt(a.alto), 'high', t('tile_alto_sub'), 'alto') + tile(t('st_picking'), numFmt(a.picking), '', t('tile_sem_sub'), 'picking') + tile(t('st_empty'), numFmt(a.vazias), '', t('tile_vazias_sub'), 'empty') +
    (ger() ? tile(t('tile_valor'), vlr(a.valor_total), '', t('tile_valor_sub')) : tile(t('tile_unid'), numFmt(a.unidades), '', t('tile_unid_sub'))) + '</div>';
  n += '<div class="page-head"><div><h1>' + esc(t('produtos')) + '</h1><p>' + e.length + ' ' + esc(t('de')) + ' ' + PR.length + ' ' + esc(t('contagem')) + (filtro ? ' • ' + esc(t('filtro_ativo')) : '') + '</p></div><div class="actions">' +
    (ger() ? (podeExcluir() ? '<button class="btn" data-act="prod-importar">' + svg(ICO.down, 15) + ' ' + esc(t('p_importar')) + '</button>' : '') + '<button class="btn" data-act="exportar">' + svg(ICO.down, 15) + ' ' + esc(t('exportar')) + '</button>' : '<button class="btn" data-act="negado" title="' + esc(t('somente_gerente')) + '">' + svg(ICO.lock, 15) + ' ' + esc(t('exportar')) + '</button>') +
    '<button class="btn" data-act="pdf">' + svg(ICO.print, 15) + ' ' + esc(t('pdf_btn')) + '</button>' +
    (mexe() ? '<button class="btn" data-act="lf-abrir">' + svg(ICO.imagem, 15) + ' ' + esc(t('lf_botao')) + '</button>' : '') +
    (edita() ? '<button class="btn primary" data-act="novo">' + svg(ICO.mais, 15) + ' ' + esc(t('cad_produto')) + '</button><button class="btn" data-act="novo-qtd" title="' + esc(t('cad_receb_dica')) + '">' + svg(ICO.caixa, 15) + ' ' + esc(t('cad_receb')) + '</button>' : '') + '</div></div>';
  n += '<div class="panel"><div class="toolbar' + (PM.filtros ? ' pm-abertos' : '') + '"><div class="tb-search">' + svg(ICO.busca, 15) + '<input type="search" id="fBusca" placeholder="' + esc(t('busca_tabela')) + '" value="' + esc(PM.busca) + '" autocomplete="off"><button type="button" class="scan-in" data-scan="tabela" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 16) + '</button></div>' + pmFiltrosBtn() +
    mfHTML('fCat') + mfHTML('fLocal') + mfHTML('fForn') + mfHTML('fSit') + '<button class="btn sm" id="pmLimpar" data-act="limpar-filtros"' + (filtro ? '' : ' hidden') + '>' + svg(ICO.x, 13) + ' ' + esc(t('limpar_filtros')) + '</button>' +
    '<div class="right"><button class="tool-icon ' + (PM.pop ? 'on' : '') + '" data-act="pop" title="' + esc(t('colunas')) + '">' + svg(ICO.chave, 16) + '</button>' + (PM.pop ? popColunas() : '') + '</div></div>';
  const sitAt = fArr(PM.sit).length === 1 ? fArr(PM.sit)[0] : '';
  n += (mob() ? '<div class="pn-volta pn-volta-lista"><button type="button" data-pn-familias="1">' + svg(ICO.esq, 16) + ' ' + esc(t('pn_familias')) + '</button></div>' : '') +
    '<div class="pm-chips fl-abas">' + pmFiltrosBtn() + [['', 'pm_chip_todas'], ['ok', 'st_ok'], ['empty', 'st_empty'], ['baixo', 'st_baixo'], ['sempreco', 'st_sem_preco']].map(c => '<button type="button" class="fl-aba' + ((c[0] ? sitAt === c[0] : !fArr(PM.sit).length) ? ' on' : '') + '" data-pm-sit="' + c[0] + '">' + esc(t(c[1])) + '</button>').join('') + '</div>';
  n += '<div id="pmRes">';
  if (nSel() > 0 && !vd()) n += '<div class="bulkbar"><span>' + nSel() + ' ' + esc(t('selecionados')) + '</span><button class="btn sm" data-act="etq-lote">' + svg(ICO.print, 13) + ' ' + esc(t('etp_lote')) + '</button>' +
    (mexe() ? '<button class="btn sm" data-act="vazia-lote">' + svg(ICO.caixa, 13) + ' ' + esc(t('esvaziar_sel')) + '</button>' : '') + (edita() ? '<button class="btn sm" data-act="bar-lote">' + svg(ICO.prod, 13) + ' ' + esc(t('bar_gerar')) + '</button>' : '') +
    '<button class="btn sm" data-act="pdf-sel">' + svg(ICO.print, 13) + ' ' + esc(t('pdf_btn')) + '</button>' + (mexe() ? '<button class="btn sm" data-act="conf-lote">' + svg(ICO.busca, 13) + ' ' + esc(t('rc_enviar_btn')) + '</button>' : '') +
    (ger() ? '<button class="btn sm" data-act="exportar-sel">' + esc(t('exportar')) + '</button>' : '') +
    (podeExcluir() ? '<button class="btn sm danger" data-act="excluir-lote">' + esc(t('excluir_sel')) + '</button>' : '<button class="btn sm" data-act="negado">' + svg(ICO.lock, 13) + ' ' + esc(t('excluir_sel')) + '</button>') +
    '<button class="btn sm" style="margin-left:auto" data-act="limpar-sel">' + esc(t('limpar_sel')) + '</button></div>';
  const todos = i.length > 0 && i.every(p => PM.sel[p.id]);
  n += '<div class="tbl-scroll"><table class="tbl-compacta"><thead><tr><th class="rn">#</th>' + (vd() ? '' : '<th class="chk"><input type="checkbox" data-act="todos"' + (todos ? ' checked' : '') + '></th>') + '<th class="etq-cel">' + esc(t('cx_acabou')) + '</th><th class="pm-foto-cel">' + esc(t('pf_col')) + '</th><th class="pm-saldo-cel"></th>' +
    o.map(c => { const s = PM.ordem === c.k; return '<th class="sortable ' + (c.num ? 'num' : '') + ' ' + (s ? 'sorted' : '') + '" data-ord="' + c.k + '">' + esc(t(c.rot)) + '<span class="arw">' + (s ? (PM.dir === 1 ? '▲' : '▼') : '▲') + '</span></th>'; }).join('') + '</tr></thead><tbody>';
  if (!i.length) n += '<tr><td colspan="' + (o.length + 5) + '"><div class="empty">' + svg(ICO.prod, 40) + '<b>' + esc(t('vazio')) + '</b><div>' + esc(t('vazio_sub')) + '</div><div style="margin-top:14px"><button class="btn" data-act="limpar-filtros">' + esc(t('limpar_filtros')) + '</button></div></div></td></tr>';
  else i.forEach((e, k) => {
    const vz = '<span class="btn-etq btn-vazia' + (e.caixa_vazia ? ' on' : '') + '"' + (mexe() ? '' : ' style="pointer-events:none"') + '>' + svg(e.caixa_vazia ? ICO.cxVazia : ICO.cxCheia, 16) + '</span>';
    n += '<tr class="clic pm-l ' + pmSitCls(e) + ' ' + (PM.sel[e.id] ? 'sel' : '') + (e.ativo ? '' : ' pm-inativo') + '" data-abrir="' + esc(e.id) + '"><td class="rn">' + (r.de + k + 1) + '</td>' + (vd() ? '' : '<td class="chk"><input type="checkbox" data-marcar="' + esc(e.id) + '"' + (PM.sel[e.id] ? ' checked' : '') + '></td>') +
      '<td class="etq-cel" data-l="' + esc(t('cx_acabou')) + '">' + (mexe() ? '<button type="button" class="btn-etq btn-vazia' + (e.caixa_vazia ? ' on' : '') + '" data-act="vazia-linha" data-pid="' + esc(e.id) + '" title="' + esc(t(e.caixa_vazia ? 'cs_desmarcar' : 'cs_marcar')) + '">' + svg(e.caixa_vazia ? ICO.cxVazia : ICO.cxCheia, 16) + '</button>' : vz) + '</td>' +
      '<td class="pm-foto-cel">' + miniFoto(e, 38) + '</td><td class="pm-saldo-cel"><b>' + celulaNum(e.qtd) + '</b></td>' + o.map(c => celula(e, c)).join('') + '</tr>';
  });
  const d = e.length ? r.de + 1 : 0, l = r.de + i.length;
  n += '</tbody></table></div><div class="footbar"><span>' + esc(t('mostrando')) + ' ' + d + '–' + l + ' ' + esc(t('de')) + ' ' + e.length + ' ' + esc(t('contagem')) + '</span>' +
    '<select class="flt fb-porpag" id="prodPorPag" title="' + esc(t('mostrando')) + '">' + POR_PAG_OPCOES.map(x => '<option value="' + x + '"' + (porPag() === x ? ' selected' : '') + '>' + esc(x ? t('rl_por_pag', { n: x }) : t('pp_todos', { n: numFmt(e.length) })) + '</option>').join('') + '</select>' +
    (r.totalPag > 1 ? '<div class="pager"><button type="button" class="btn sm" data-act="ant"' + (PM.pag <= 1 ? ' disabled' : '') + '>' + svg(ICO.esq, 14) + '</button><span>' + esc(t('pagina')) + ' ' + PM.pag + ' ' + esc(t('de')) + ' ' + r.totalPag + '</span><button type="button" class="btn sm" data-act="prox"' + (PM.pag >= r.totalPag ? ' disabled' : '') + '>' + svg(ICO.dir, 14) + '</button></div>' : '') + '</div></div></div>';
  return n;
}

/* ---------- 폰: 분류 → 코드 묶음 → 상품 (옛 telaProdutosCel) ---------- */
const pnProdutos = () => PR.filter(p => p.ativo);
function pnGrupos(L, chave) { const m = {}, ord = []; L.forEach(e => { const k = chave(e) || ''; if (!m[k]) { m[k] = { k, n: 0, foto: '' }; ord.push(k); } m[k].n++; if (!m[k].foto && e.foto) m[k].foto = e.foto; }); return ord.map(k => m[k]).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k)); }
const pnCartao = (g, r, sub, attr) => '<button type="button" class="pn-card"' + attr + '><div class="pn-foto">' + (g.foto ? '<img src="' + esc(thumb(g.foto, 240)) + '" alt="" loading="lazy">' : svg(ICO.prod, 30)) + '</div><div class="pn-card-tx"><b>' + esc(r) + '</b><span>' + esc(sub) + '</span></div>' + svg(ICO.dir, 18) + '</button>';
function pnProdCard(e) {
  const cod = e.sku, des = String(e.descricao || '').trim(), l2 = E.normCod(des) === E.normCod(cod) ? '' : des;
  return '<button type="button" class="pn-card pn-prod" data-abrir="' + esc(e.id) + '"><div class="pn-foto">' + (e.foto ? '<img src="' + esc(thumb(e.foto, 240)) + '" alt="" loading="lazy">' : svg(ICO.prod, 30)) + '</div><div class="pn-prod-tx"><b>' + esc(cod) + '</b>' + (l2 ? '<span>' + esc(l2) + '</span>' : '') +
    '<em>' + esc(e.corredor ? t('pn_corredor') + ' ' + corrFmt(e.corredor) : t('pn_sem_corredor')) + ' · ' + esc(t('pn_estoque_ctl')) + ': <i class="' + pmSitCls(e) + '">' + numFmt(e.qtd) + ' UN</i></em></div></button>';
}
const PN_MAX = 60;
const pnBuscaLista = v => { const q = String(v || '').trim().toLowerCase(), cod = E.normCod(v); return pnProdutos().filter(e => prodBateBusca(e, q, cod)).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true })); };
function pnBuscaRes(v) {
  const L = pnBuscaLista(v); let h = '<div class="pn-sub pn-busca-n">' + esc(t('pn_n_produtos', { n: numFmt(L.length) })) + '</div>';
  if (!L.length) return h + '<div class="panel"><div class="graf-vazio">' + esc(t('pn_nada')) + '</div></div>';
  h += '<div class="pn-grid pn-grid-prod">' + L.slice(0, PN_MAX).map(pnProdCard).join('') + '</div>';
  if (L.length > PN_MAX) h += '<button type="button" class="btn pn-busca-todos" data-pn-ver-busca="1">' + esc(t('pn_busca_lista', { n: numFmt(L.length) })) + '</button>';
  return h;
}
const pnNota = () => '<div class="es-fam-nota pn-nota">' + svg(ICO.ajuda, 20) + '<div><b>' + esc(t('pn_nota_t')) + '</b><span>' + esc(t('pn_nota')) + '</span></div></div>';
function pnCamada0(grupos) {
  return '<div class="pn-acoes"><button type="button" class="pn-acao p" data-scan="tabela">' + svg(ICO.scan, 24) + '<div><b>' + esc(t('pn_scan')) + '</b><span>' + esc(t('pn_scan_sub')) + '</span></div>' + svg(ICO.dir, 16) + '</button>' +
    '<button type="button" class="pn-acao" data-pn-mapa="1">' + svg(ICO.pin, 24) + '<div><b>' + esc(t('pn_mapa')) + '</b><span>' + esc(t('pn_mapa_sub')) + '</span></div>' + svg(ICO.dir, 16) + '</button></div>' +
    '<div class="pn-sec"><h2>' + esc(t('pn_familias')) + '</h2><button type="button" class="pn-link" data-pn-lista="1">' + esc(t('pn_ver_todas')) + ' ' + svg(ICO.dir, 14) + '</button></div>' +
    '<div class="pn-grid">' + grupos.map(g => pnCartao(g, g.k || t('e_outros'), t('pn_n_produtos', { n: numFmt(g.n) }), ' data-pn-cat="' + esc(g.k) + '"')).join('') + '</div>' + pnNota();
}
function telaCel() {
  const nav = PM.nav, cat = nav[0], fam = nav[1], todos = pnProdutos(); let h = '';
  if (cat == null) {
    h += '<div class="pn-head"><h1>' + esc(t('produtos')) + '</h1><p>' + esc(t('pn_sub')) + '</p></div>' +
      '<div class="pn-busca"><span class="pn-busca-ico">' + svg(ICO.busca, 20) + '</span><input type="search" id="pmNavBusca" placeholder="' + esc(t('pn_busca_ph')) + '" value="' + esc(PM.navBusca) + '" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="scan-in" data-scan="tabela" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 20) + '</button></div>' +
      '<div id="pnCorpo">' + (PM.navBusca.trim() ? pnBuscaRes(PM.navBusca) : pnCamada0(pnGrupos(todos, e => e.categoria))) + '</div>';
    return h;
  }
  let L = todos.filter(e => e.categoria === cat);
  const fams = pnGrupos(L, e => gvFamilia(e.sku)), nivel = fams.length > 1 && !fam, rc = cat || t('e_outros');
  h += '<div class="pn-volta"><button type="button" data-pn-volta="1">' + svg(ICO.esq, 16) + ' ' + esc(fam ? rc : t('produtos')) + '</button><h1>' + esc(fam || rc) + '</h1></div>';
  if (nivel) return h + '<div class="pn-sec"><h2>' + esc(t('pn_linhas') + ' ' + rc) + '</h2><span>' + esc(t('pn_n_linhas', { n: fams.length })) + '</span></div><div class="pn-grid">' + fams.map(g => pnCartao(g, g.k || '—', t('pn_n_produtos', { n: numFmt(g.n) }), ' data-pn-fam="' + esc(g.k) + '"')).join('') + '</div>' + pnNota();
  if (fam) L = L.filter(e => gvFamilia(e.sku) === fam);
  L = L.filter(e => situacaoBate(e, PM.sit) && fBate(PM.forn, e.fornecedor)).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  const nf = fArr(PM.sit).length + fArr(PM.forn).length;
  h += '<div class="pn-sec"><h2>' + esc(t('pn_produtos_de') + ' ' + (fam || rc)) + '</h2><button type="button" class="btn sm pn-filtros" data-pn-filtros="1">' + svg(ICO.filtro, 14) + ' ' + esc(nf ? t('pn_filtros_n', { n: nf }) : t('pn_filtros')) + '</button></div>' +
    '<div class="pn-sub">' + esc(t('pn_n_produtos', { n: numFmt(L.length) })) + '</div>' +
    (L.length ? '<div class="pn-grid pn-grid-prod">' + L.map(pnProdCard).join('') + '</div>' : '<div class="panel"><div class="graf-vazio">' + esc(t('pn_nada')) + '</div></div>') + pnNota();
  return h;
}
function pnRepintarCorpo() { const c = $('pnCorpo'); if (!c) return; c.innerHTML = PM.navBusca.trim() ? pnBuscaRes(PM.navBusca) : pnCamada0(pnGrupos(pnProdutos(), e => e.categoria)); }

/* ---------- ligar ---------- */
function ligar() {
  const raiz = document.querySelector('#page .sb.pm-raiz'); if (!raiz) return;
  raiz.onclick = clique;
  const b = $('fBusca'); if (b) b.oninput = debounce(() => { PM.busca = b.value; PM.pag = 1; atualizarRes(); }, 220);
  const mf = $('mfBuscaIn'); if (mf) { mf.oninput = debounce(() => { PM.mfBusca = mf.value; const m = MF[PM.mfAberto](), q = PM.mfBusca.trim().toLowerCase(); $('mfLista').innerHTML = mfListaHTML(q ? m.ops.filter(o => String(o.r).toLowerCase().indexOf(q) >= 0) : m.ops, fArr(PM[m.chave]), m.chave); }, 180); setTimeout(() => { try { mf.focus(); } catch (e) {} }, 10); }
  const pp = $('prodPorPag'); if (pp) { pp.onclick = e => e.stopPropagation(); pp.onchange = () => { PM.porPag = Number(pp.value); try { localStorage.setItem(PP_CH, String(PM.porPag)); } catch (e) {} PM.pag = 1; render(); }; }
  const nb = $('pmNavBusca'); if (nb) {
    nb.oninput = debounce(() => {
      const v = nb.value, cod = E.normCod(v); PM.navBusca = v;
      if (!v.trim()) return pnRepintarCorpo();
      const ex = cod ? pnProdutos().filter(e => E.normCod(e.sku) === cod || String(e.barcode || '') === v.trim()) : [];
      if (ex.length === 1) { nb.value = ''; PM.navBusca = ''; pnRepintarCorpo(); return abrirProduto(ex[0].id); }
      pnRepintarCorpo();
    }, 320);
  }
}
/** 검색할 때 표만 바꿈 (옛 atualizarResultadosProdutos — 입력 칸은 그대로라 키보드가 닫히지 않음) */
function atualizarRes() {
  const alvo = $('pmRes'); if (!alvo) return render();
  const m = document.createElement('div'); m.innerHTML = telaProdutos();
  const novo = m.querySelector('#pmRes'); if (!novo) return render();
  alvo.replaceWith(novo);
  const pv = document.querySelector('#conteudo .page-head p'), pn = m.querySelector('.page-head p'); if (pv && pn) pv.textContent = pn.textContent;
  const lim = $('pmLimpar'), ln = m.querySelector('#pmLimpar'); if (lim) lim.hidden = !ln || ln.hidden;
  ligar();
}
const negado = () => toast(t('somente_gerente'), 'bad');
async function clique(e) {
  const c = s => e.target.closest(s); let b;
  if ((b = c('[data-copiar]'))) { e.stopPropagation(); try { await navigator.clipboard.writeText(b.dataset.copiar); toast(t('copiado') + ' ' + b.dataset.copiar, 'good'); } catch (x) {} return; }
  if ((b = c('[data-mfv]'))) { e.stopPropagation(); const k = b.dataset.mfk, v = b.dataset.mfv, a = fArr(PM[k]).slice(), i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); PM[k] = a; PM.pag = 1; return render(); }
  if (c('.mf-pop') && !c('[data-act]')) return;
  if ((b = c('[data-mf]'))) { e.stopPropagation(); PM.mfAberto = PM.mfAberto === b.dataset.mf ? '' : b.dataset.mf; PM.mfBusca = ''; return render(); }
  if ((b = c('[data-col]'))) { const k = b.dataset.col; if (b.checked) { if (visiveis.indexOf(k) < 0) visiveis.push(k); } else visiveis = visiveis.filter(x => x !== k); return render(); }
  if (c('.pop') && !c('[data-act]')) return;
  if ((b = c('[data-tile-sit]'))) { PM.sit = [b.dataset.tileSit]; PM.pag = 1; PM.navLista = true; return render(); }
  if ((b = c('[data-pm-sit]'))) { const v = b.dataset.pmSit; PM.sit = v ? [v] : []; PM.pag = 1; E.fecharModal(); return render(); }
  if (c('[data-pn-familias]')) { Object.assign(PM, { navLista: false, busca: '', cat: [], local: [], pag: 1 }); return render(); }
  if ((b = c('[data-pn-cat]'))) { PM.nav = [b.dataset.pnCat]; render(); window.scrollTo(0, 0); return; }
  if ((b = c('[data-pn-fam]'))) { PM.nav = [PM.nav[0], b.dataset.pnFam]; render(); window.scrollTo(0, 0); return; }
  if (c('[data-pn-volta]')) { PM.nav = PM.nav.slice(0, -1); PM.sit = []; PM.forn = []; render(); window.scrollTo(0, 0); return; }
  if (c('[data-pn-lista]')) { PM.navLista = true; return render(); }
  if (c('[data-pn-mapa]')) return Router.go('estoque');
  if (c('[data-pn-ver-busca]')) { PM.busca = PM.navBusca; PM.navBusca = ''; PM.pag = 1; return render(); }
  if (c('[data-pn-filtros]')) return folhaFiltros();
  if ((b = c('[data-scan]'))) return openScanner(code => aoBipar(code), { title: t('sc_abrir') });
  if ((b = c('[data-ord]'))) { const k = b.dataset.ord; if (PM.ordem === k) PM.dir = -PM.dir; else { PM.ordem = k; PM.dir = 1; } return render(); }
  if ((b = c('[data-marcar]'))) { e.stopPropagation(); if (b.checked) PM.sel[b.dataset.marcar] = 1; else delete PM.sel[b.dataset.marcar]; return render(); }
  if ((b = c('[data-act]'))) {
    const a = b.dataset.act;
    if (a === 'todos') { paginar(lista(), porPag()).pag.forEach(p => { if (b.checked) PM.sel[p.id] = 1; else delete PM.sel[p.id]; }); return render(); }
    e.stopPropagation();
    switch (a) {
      case 'negado': return negado();
      case 'vazia-linha': return vaziaLinha(b.dataset.pid);
      case 'mf-fechar': PM.mfAberto = ''; PM.mfBusca = ''; return render();
      case 'mf-limpar': PM[b.dataset.mfk] = []; PM.pag = 1; return render();
      case 'pm-filtros': PM.filtros = !PM.filtros; return render();
      case 'pop': PM.pop = !PM.pop; return render();
      case 'reset-cols': visiveis = PADRAO.slice(); PM.pop = false; return render();
      case 'limpar-filtros': Object.assign(PM, { busca: '', cat: [], local: [], forn: [], sit: [], mfAberto: '', mfBusca: '', pag: 1 }); return render();
      case 'limpar-sel': PM.sel = {}; return render();
      case 'ant': PM.pag--; return render();
      case 'prox': PM.pag++; return render();
      case 'sit-info': return sitInfo(b.dataset.sit);
      case 'exportar': return ger() ? exportar(false) : negado();
      case 'exportar-sel': return ger() ? exportar(true) : negado();
      case 'prod-importar': return podeExcluir() ? Router.go('items', 'bulk') : negado();
      case 'pdf': return pdfProdutos(false);
      case 'pdf-sel': return pdfProdutos(true);
      case 'lf-abrir': return Router.go('photos');
      case 'novo': return modalProduto(null);
      case 'novo-qtd': return modalProduto(null, true);
      case 'etq-lote': return etiquetasLote(Object.keys(PM.sel));
      case 'vazia-lote': return vaziaLote();
      case 'bar-lote': return gerarBarcode(Object.keys(PM.sel));
      case 'conf-lote': return conferirLote(Object.keys(PM.sel), () => { PM.sel = {}; });
      case 'excluir-lote': return podeExcluir() ? excluirLote(Object.keys(PM.sel)) : negado();
    }
    return acaoDrawer(a, b);
  }
  if (c('.mf.aberto') == null && PM.mfAberto && !c('.mf')) { PM.mfAberto = ''; render(); }
  if ((b = c('[data-abrir]'))) { if (String(window.getSelection && window.getSelection()) ) return; return abrirProduto(b.dataset.abrir); }
}
function aoBipar(code) {
  const cod = E.etqCodigo(code); if (cod) return Router.go('etiquetas', cod);
  const v = E.prodDoQr(code) || code, ex = exactItem(v);
  if (ex && prodPorId(ex.c)) return abrirProduto(ex.c);
  PM.busca = v; PM.pag = 1; PM.navLista = true; render();
}
function folhaFiltros() {
  const at = fArr(PM.sit);
  E.abrirModal('<div class="modal-head"><h2>' + esc(t('pn_filtros')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="pn-folha-chips fl-abas">' +
    [['', 'pm_chip_todas'], ['ok', 'st_ok'], ['empty', 'st_empty'], ['baixo', 'st_baixo'], ['sempreco', 'st_sem_preco']].map(x => '<button type="button" class="fl-aba' + ((x[0] ? at.length === 1 && at[0] === x[0] : !at.length) ? ' on' : '') + '" data-pm-sit="' + x[0] + '">' + esc(t(x[1])) + '</button>').join('') + '</div></div>')
    .addEventListener('click', clique);
}
function sitInfo(s) {
  E.pergunta({ titulo: t('sit_info_titulo'), html: '<div class="rows">' + ['ok', 'baixo', 'alto', 'picking', 'empty', 'sempreco', 'inativo'].map(k => '<div class="row"><span class="k"><span class="badge ' + (SIT_CLS[k] || 'pick') + '">' + esc(t(SIT_TXT[k])) + '</span></span><span class="v"' + (k === s ? ' style="font-weight:700"' : '') + '>' + esc(t('st_desc_' + (k === 'sempreco' ? 'sem_preco' : k))) + '</span></div>').join('') + '</div>', sim: 'OK' });
}

/* ============================================================
 *  상자 다 씀 (옛 rpc_marcar_caixa_vazia — 재고 0 일 때만 · 기록 한 줄)
 * ============================================================ */
async function gravarVazia(p, marcar) {
  if (marcar && Number(p.qtd) !== 0) throw new Error(t('cs_so_zerado', { n: numFmt(p.qtd) }));
  const now = new Date().toISOString(), q = Number(p.qtd) || 0;
  await S.DB.batch([{ op: 'merge', col: 'stock', id: p.id, data: { code: p.id, vazia: !!marcar, vaziaEm: now, vaziaPor: S.user.email } },
    { op: 'set', col: 'stockLog', id: newId('L'), data: { code: p.id, d: now.substring(0, 10), delta: 0, before: q, after: q, kind: 'adj', ref: '', note: marcar ? 'Caixa marcada como vazia' : 'Caixa deixou de estar vazia', origem: 'produtos', by: S.user.email, byName: quem(), at: now } }]);
  p.caixa_vazia = !!marcar; VAZ[p.id] = !!marcar; if (!marcar) delete VAZ[p.id]; p.situacao = situacao(p);
}
async function vaziaLinha(id) {
  const p = prodPorId(id); if (!p || !mexe()) return;
  const marcar = !p.caixa_vazia;
  const r = await E.pergunta({ titulo: t(marcar ? 'cs_marcar_tit' : 'cs_desmarcar_tit'), texto: t(marcar ? 'cs_marcar_txt' : 'cs_desmarcar_txt') + ' ' + p.sku, sim: t(marcar ? 'cs_marcar' : 'cs_desmarcar'), nao: t('cancelar') });
  if (!r) return;
  try { await gravarVazia(p, marcar); toast(marcar ? t('cs_marcada') + ' ' + p.sku : t('cs_desmarcada'), 'good'); } catch (x) { return toast(String(x.message || x), 'bad'); }
  render();
}
async function vaziaLote() {
  const ids = Object.keys(PM.sel); if (!ids.length) return;
  const r = await E.pergunta({ titulo: t('esvaziar_sel'), texto: t('conf_esvaziar_lote') + ' (' + ids.length + ')', sim: t('esvaziar_sel'), nao: t('cancelar') }); if (!r) return;
  let feitos = 0, erros = 0; busy(true);
  for (const id of ids) { const p = prodPorId(id); try { if (!p) throw new Error(id); await gravarVazia(p, true); feitos++; } catch (x) { erros++; } }
  busy(false);
  toast(erros ? feitos + ' ' + t('caixas_esvaziadas') + ' · ' + erros + ' ' + t('cx_erros') : feitos + ' ' + t('caixas_esvaziadas'), erros ? 'bad' : 'good');
  PM.sel = {}; render();
}

/* ============================================================
 *  확인 요청 (옛 conferirLotePopup → rpc_solicitar_rechecagem) — rechecagem/{id}
 * ============================================================ */
async function conferirLote(ids, fim, origem) {
  ids = (ids || []).filter((x, i, a) => x && a.indexOf(x) === i);
  if (!ids.length) return toast(t('rc_enviar_nenhum'), 'bad');
  if (!mexe()) return negado();
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('cs_recheca_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p style="margin:0 0 12px">' + esc(ids.join(', ')) + ' — ' + esc(t('cs_recheca_txt')) + '</p><div class="pm-rc-bts">' +
    [['saldo', 'cs_recheca_saldo'], ['misturado', 'cs_recheca_misturado'], ['nao_encontrado', 'cs_recheca_sumiu']].map(m => '<button type="button" class="btn primary" data-rc="' + m[0] + '">' + esc(t(m[1])) + '</button>').join('') + '</div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button></div>');
  w.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-rc]'); if (!b) return;
    E.fecharModal(); busy(true); let feitos = 0;
    try { for (const id of ids) { await pedirRechecagem(id, b.dataset.rc, origem || 'produtos', ''); feitos++; } } catch (x) { toast(String(x.message || x), 'bad'); }
    busy(false); if (fim) fim();
    toast(feitos + ' ' + t('rc_enviar_btn').toLowerCase(), 'good');
    render(); if (PM.drawer) { PM.movPediu = ''; pintarDrawer(); }
  });
}
/** 하나 — 같은 상품의 열린 요청이 있으면 그것을 고침 (옛 RPC 와 같음) */
export async function pedirRechecagem(code, motivo, origem, origemRef) {
  if (['saldo', 'misturado', 'nao_encontrado'].indexOf(motivo) < 0) throw new Error('motivo');
  const now = new Date().toISOString(), base = { motivo, origem: origem || '', origemRef: origemRef || '', por: S.user.email, porNome: quem(), em: now };
  let ab = []; try { ab = (await S.DB.list('rechecagem', { where: [['code', '==', code]] })).filter(x => x.status === 'aberta'); } catch (e) {}
  if (ab.length) { await S.DB.update('rechecagem', ab[0].id, base); return ab[0].id; }
  const id = newId('RC'); await S.DB.set('rechecagem', id, Object.assign({ id, code, status: 'aberta' }, base)); return id;
}

/* ============================================================
 *  바코드 만들기 (옛 rpc_gerar_barcode — TOC + 6자리 · 이미 있는 상품은 건너뜀 · 덮어쓰지 않음)
 * ============================================================ */
function proxBarcode(rows, usados) { let mx = 0; rows.forEach(r => { const m = String(r[4] || '').match(/^TOC(\d{6})$/); if (m) mx = Math.max(mx, Number(m[1])); }); usados.forEach(v => { const m = v.match(/^TOC(\d{6})$/); if (m) mx = Math.max(mx, Number(m[1])); }); return 'TOC' + String(mx + 1).padStart(6, '0'); }
async function gerarBarcode(ids) {
  if (!edita()) return negado();
  const alvo = (ids || []).filter(id => { const p = prodPorId(id); return p && !String(p.barcode || '').trim(); });
  if (!alvo.length) return toast(t('bar_ja_tem'), 'bad');
  const r = await E.pergunta({ titulo: t('bar_gerar'), texto: t('bar_confirmar', { n: numFmt(alvo.length) }), sim: t('bar_gerar'), nao: t('cancelar') }); if (!r) return;
  busy(true);
  try {
    const n = await editCatalog(S, rows => { const set = new Set(alvo), us = []; let k = 0; rows.forEach(rw => { if (set.has(rw[0]) && !String(rw[4] || '').trim()) { const v = proxBarcode(rows, us); us.push(v); rw[4] = v; k++; } }); return k; });
    toast(t('bar_gerados', { n: numFmt(Number(n) || 0) }), 'good'); PM.sel = {}; montar();
  } catch (x) { toast(String(x.message || x), 'bad'); }
  busy(false); render();
}

/* ============================================================
 *  삭제 (items.js 와 같은 길 — 카탈로그에서 뺌 · 세트도) · 재고가 남은 상품은 거절 (옛 rpc_excluir_produtos)
 * ============================================================ */
async function excluirLote(ids, um) {
  if (!podeExcluir() || !ids.length) return negado();
  const r = await E.pergunta({ perigo: true, titulo: t(um ? 'excluir' : 'excluir_sel'), texto: um ? t('conf_excluir') + ' — ' + ids[0] : t('conf_excluir_lote') + ' (' + ids.length + ')', sim: t(um ? 'excluir' : 'excluir_sel'), nao: t('cancelar') }); if (!r) return;
  const com = ids.map(prodPorId).filter(p => p && Number(p.qtd) !== 0), sai = ids.filter(id => !com.some(p => p.id === id));
  if (com.length) toast(t('exc_com_saldo', { n: com.length }) + ' — ' + com.slice(0, 3).map(p => p.sku + ' (' + numFmt(p.qtd) + ')').join(', '), 'bad');
  if (!sai.length) return;
  busy(true);
  try {
    await editCatalog(S, (rows, cats, sets) => { const set = new Set(sai); for (let i = rows.length - 1; i >= 0; i--) if (set.has(rows[i][0])) rows.splice(i, 1); sai.forEach(c => { if (sets[c]) delete sets[c]; }); return sai.length; });
    toast(um ? t('prod_excluido') : sai.length + ' ' + t('prod_excluidos'), 'good');
    sai.forEach(id => delete PM.sel[id]); if (sai.indexOf(PM.drawer) >= 0) fecharDrawer(); montar();
  } catch (x) { toast(String(x.message || x), 'bad'); }
  busy(false); render();
}

/* ============================================================
 *  내보내기 · PDF (옛 exportar · pdfProdutos)
 * ============================================================ */
function exportar(soSel) {
  const cols = colsAtivas(), L = lista().filter(p => !soSel || PM.sel[p.id]);
  const csv = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const linhas = [cols.map(c => csv(t(c.rot))).concat([csv(t('h_col_unidade'))]).join(';')];
  L.forEach(p => linhas.push(cols.map(c => csv(c.k === 'situacao' ? t(SIT_TXT[p.situacao]) : p[c.k])).concat([t('un_curto')]).join(';')));
  const u = URL.createObjectURL(new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
  a.href = u; a.download = 'products.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000);
  toast(L.length + ' ' + t('linhas_exp'), 'good');
}
function pdfProdutos(soSel) {
  const L = lista().filter(p => !soSel || PM.sel[p.id]); if (!L.length) return toast(te('pdf_vazio'), 'bad');
  const ag = new Date(), ref = ag.toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(ag.getHours()).padStart(2, '0') + String(ag.getMinutes()).padStart(2, '0');
  const flt = [fArr(PM.cat).join(', '), fArr(PM.local).map(corrFmt).join(', '), fArr(PM.forn).join(', '), fArr(PM.sit).map(s => te(SIT_TXT[s] || s)).join(', '), PM.busca].filter(Boolean).join(' · ');
  let un = 0; L.forEach(p => { un += Number(p.qtd) || 0; });
  let h = '<div class="doc-print"><div class="doc-topo"><div><div class="doc-marca">' + esc(te('marca_longa')) + '</div><div class="doc-tipo">' + esc(te('pdf_titulo')) + '</div></div><div class="doc-meta"><div><span>' + esc(te('pdf_ref')) + '</span><b>' + esc(ref) + '</b></div><div><span>' + esc(te('pdf_data')) + '</span><b>' + esc(ag.toLocaleDateString('en-US') + ' ' + horaCurta(ag.toISOString())) + '</b></div><div><span>' + esc(te('pdf_por')) + '</span><b>' + esc(quem()) + '</b></div></div></div>';
  h += '<div class="doc-sub">' + esc(soSel ? te('pdf_selecao') : te('pdf_filtro_atual')) + ' · ' + L.length + ' ' + esc(te('contagem')) + (flt ? '<div class="doc-flt">' + esc(flt) + '</div>' : '') + '</div>';
  h += '<table class="doc-tbl"><thead><tr><th class="rn">#</th><th style="width:13%">' + esc(te('c_sku')) + '</th><th>' + esc(te('c_nome')) + '</th><th style="width:16%">' + esc(te('c_cat')) + '</th><th class="meio" style="width:10%">' + esc(te('r_corredor')) + '</th><th class="num" style="width:9%">' + esc(te('c_qtd')) + '</th></tr></thead><tbody>' +
    L.map((p, i) => '<tr><td class="rn">' + (i + 1) + '</td><td>' + esc(p.sku) + '</td><td>' + esc(p.nome) + (p.descricao ? '<br><small>' + esc(p.descricao) + '</small>' : '') + '</td><td>' + esc(p.categoria || '—') + '</td><td class="meio">' + esc(corrFmt(p.corredor) || '—') + '</td><td class="num">' + (Number(p.qtd) || 0) + '</td></tr>').join('') +
    '</tbody><tfoot><tr><td></td><td colspan="3"><b>' + esc(te('pdf_total')) + '</b></td><td></td><td class="num"><b>' + un + '</b></td></tr></tfoot></table><div class="doc-pe">' + esc(te('marca_longa')) + ' · ' + esc(te('pdf_rodape')) + '</div></div>';
  printOpen(h);
}

/* ============================================================
 *  피킹 라벨 묶음 (옛 etq-lote → escolherTamanhoPicking) — etq.js 의 피킹 라벨
 * ============================================================ */
async function etiquetasLote(ids, uma) {
  const L = (ids || []).map(prodPorId).filter(Boolean); if (!L.length) return;
  await E.prepararImpressao();
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('etq_tam_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="aviso" style="margin:0 0 14px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('etqw_tipo_picking')) + ' · ' + esc(L.length === 1 ? L[0].sku : t('etq_tam_n', { n: numFmt(L.length) })) + '</div></div>' +
    '<div class="etq-tam-ops">' + [['64', 'etqw_tam_64', 'etqw_tam_64_s'], ['3', 'etqw_tam_3', 'etqw_tam_3_s'], ['44', 'etqw_tam_44', 'etqw_tam_44_s']].map(x => '<button type="button" class="btn etq-tam-op" data-pk-tam="' + x[0] + '">' + svg(ICO.etiq, 20) + '<b>' + esc(t(x[1])) + '</b><span>' + esc(t(x[2])) + '</span></button>').join('') + '</div></div>' +
    '<div class="modal-foot"><button class="btn" style="margin-left:auto" data-act="fechar-modal">' + esc(t('cancelar')) + '</button></div>');
  w.addEventListener('click', ev => {
    const b = ev.target.closest('[data-pk-tam]'); if (!b) return; const tam = b.dataset.pkTam; E.fecharModal();
    E.imprimirLabels(() => L.map(p => tam === '3' ? E.etiquetaPickingHTML(p) : E.etiquetaPicking64HTML(p, tam === '44')).join(''));
  });
}

/* ============================================================
 *  서랍 (옛 abrirProduto · pintarDrawer)
 * ============================================================ */
function abrirProduto(id) { const p = prodPorId(id); if (!p) return; Object.assign(PM, { drawer: p.id, aba: 'geral', mov: null, movPediu: '', caixas: null }); pintarDrawer(); Router.refreshBack && Router.refreshBack(); }
function fecharDrawer() { PM.drawer = ''; document.querySelectorAll('.pm-dw').forEach(x => x.remove()); }
const linha = (k, v) => '<div class="row"><span class="k">' + esc(k) + '</span><span class="v">' + v + '</span></div>';
function pvCls(p) { const q = Number(p.qtd) || 0, m = Number(p.minimo) || 0; return q <= 0 ? 'zero' : (m && q < m) || p.situacao === 'baixo' ? 'baixo' : p.situacao === 'alto' ? 'alto' : ''; }
function pvHero(p) {
  const cls = pvCls(p), q = Number(p.qtd) || 0, m = Number(p.minimo) || 0, sit = '<span class="pv-sit ' + cls + '">' + esc(t(SIT_TXT[p.situacao] || 'st_ok')) + sitInfoBtn(p.situacao) + '</span>';
  let h = '<div class="pv-hero ' + cls + '"><div class="pv-n saldo-tip">' + numFmt(q) + '<i>' + esc(t('un_curto')) + '</i></div><div class="pv-rot">' + esc(t('c_qtd')) + '</div>';
  h += m ? '<div class="pv-bar ' + cls + '"><i style="width:' + (Math.max(Math.min(q / (2 * m), 1), 0) * 100).toFixed(1) + '%"></i><span class="pv-min" style="left:50%"></span></div><div class="pv-leg"><span>' + esc(t('minimo')) + ' ' + numFmt(m) + '</span>' + sit + '</div>' : '<div class="pv-leg pv-leg-so">' + sit + '</div>';
  return h + '</div><div class="pv-tri"><div><b>' + numFmt(q) + '<i>' + esc(t('un_curto')) + '</i></b><span>' + esc(t('c_disp')) + '</span></div><div><b>0<i>' + esc(t('un_curto')) + '</i></b><span>' + esc(t('reservado')) + '</span></div><div><b class="min-calc">' + numFmt(m) + '</b><span>' + esc(t('minimo')) + '</span></div></div>';
}
function caixasHTML(p) {
  const L = PM.caixas;
  if (L == null) return '<div class="sec"><h3>' + esc(t('pm_caixas')) + '</h3><div class="caixas-painel"><div class="caixas-vazio">' + esc(t('carregando')) + '</div></div></div>';
  const vivas = L.filter(x => x.ativa);
  return '<div class="sec"><h3>' + esc(t('pm_caixas')) + ' <span class="badge">' + vivas.length + '</span></h3><div class="caixas-painel">' + (vivas.length ? vivas.map(e => '<div class="caixa-item" data-caixa="' + esc(e.codigo) + '"><div class="cx-qr">' + E.qrSVG(E.etqLink(e.codigo)) + '</div><div class="cx-info"><div class="cx-cod">' + esc(e.codigo) + '</div><div class="cx-meta">' + esc(t('r_corredor')) + ': ' + esc(e.corredor ? corrFmt(e.corredor) : '—') + ' · ' + esc(t('etq_inicial')) + ': ' + e.qtd_inicial + '</div></div><div class="cx-edit"><b>' + e.qtd_restante + '</b></div>' +
    (vd() ? '' : '<button type="button" class="btn-etq" data-act="cx-reimprimir" data-cod="' + esc(e.codigo) + '" title="' + esc(t('etq_reimprimir')) + '">' + svg(ICO.print, 15) + '</button>') + '</div>').join('') : '<div class="caixas-vazio">' + esc(t('e_caixas_vazio')) + '</div>') + '</div></div>';
}
function movLinhas() {
  const out = [];
  (PM.mov && PM.mov.log || []).forEach(m => { const d = Number(m.delta) || 0; out.push({ em: m.at, tipo: d > 0 ? 'entrada' : d < 0 ? 'saida' : 'ajuste', rot: d > 0 ? t('mm_entrada') : d < 0 ? t('mm_saida') : t('mov_ajuste'), quem: m.byName || m.by, motivo: m.note || '', qtd: d }); });
  (PM.mov && PM.mov.rep || []).forEach(r => { out.push({ em: r.em, tipo: 'reposicao', rot: t('mov_rep_pedida'), quem: r.porNome || r.por, motivo: r.iniciadaEm ? '' : t('mov_rep_aguarda'), qtd: null }); if (r.iniciadaEm) out.push({ em: r.iniciadaEm, tipo: 'reposicao', rot: t('mov_rep_aceita'), quem: r.iniciadaPorNome || r.iniciadaPor, motivo: t('mov_rep_andamento'), qtd: null }); });
  (PM.mov && PM.mov.rc || []).forEach(r => { out.push({ em: r.em, tipo: 'reposicao', rot: t('rc_enviar_btn'), quem: r.porNome || r.por, motivo: t({ saldo: 'cs_recheca_saldo', misturado: 'cs_recheca_misturado', nao_encontrado: 'cs_recheca_sumiu' }[r.motivo] || 'cs_recheca_saldo'), qtd: null }); });
  return out.sort((x, y) => String(y.em || '').localeCompare(String(x.em || '')));
}
function movLinhaHTML(l, i) {
  const neutro = l.tipo === 'reposicao' || l.tipo === 'ajuste', cor = neutro ? 'var(--muted)' : l.qtd > 0 ? 'var(--green)' : 'var(--red)';
  return '<tr class="mov-l mov-' + l.tipo + '"><td class="rn" style="text-align:right">' + (i + 1) + '</td><td>' + esc(dataBR(l.em)) + '</td><td><span class="mov-tag mov-tag-' + l.tipo + '">' + esc(l.rot) + '</span></td><td>' + esc(l.quem || '—') + '</td><td>' + esc(l.motivo || '—') + '</td><td style="text-align:right;font-weight:600;color:' + cor + '">' + (l.qtd == null ? '—' : (!neutro && l.qtd > 0 ? '+' : '') + numFmt(l.qtd)) + '</td></tr>';
}
async function carregarMov(code) {
  PM.movPediu = code; const r = { log: [], rep: [], rc: [] };
  try { r.log = (await S.DB.list('stockLog', { where: [['code', '==', code]] })).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 50); } catch (e) {}
  try { r.rep = (await S.DB.list('reposicao', { where: [['code', '==', code]] })).filter(x => x.status === 'aberta' || x.status === 'iniciada'); } catch (e) {}
  try { r.rc = (await S.DB.list('rechecagem', { where: [['code', '==', code]] })).filter(x => x.status === 'aberta'); } catch (e) {}
  if (PM.drawer !== code) return; PM.mov = r; pintarDrawer();
}
async function carregarCaixasDr(code) {
  let L = []; try { L = await E.listarEtiquetas(code); } catch (e) {}
  try { await E.loadQr(); } catch (e) {}
  try { injetarCssRepor(); await reposAbertas(); } catch (e) {}
  if (PM.drawer !== code) return; PM.caixas = L; pintarDrawer();
}
function pintarDrawer() {
  const a = prodPorId(PM.drawer); if (!a) return fecharDrawer();
  let corpo;
  if (PM.aba === 'geral') {
    corpo = '<div class="sec pf-sec pm-foto-hero">' + (a.foto ? '<img src="' + esc(thumb(a.foto, 600)) + '" alt="" loading="lazy">' : '<div class="pm-foto-vazia">' + svg(ICO.imagem, 34) + '<span>' + esc(t('pm_sem_foto')) + '</span></div>') + '</div>' + pvHero(a) + (reporCardHTML(a) ? '<div class="sec rp-cs">' + reporCardHTML(a) + '</div>' : '') + caixasHTML(a) +
      '<div class="sec"><h3>' + esc(t('detalhes')) + '</h3><div class="rows">' + linha(t('r_barcode'), esc(a.barcode || '—')) + linha(t('c_cat'), esc([a.grupo, a.categoria].filter(Boolean).join(' › ') || '—')) + linha(t('r_corredor'), '<span class="tag">' + esc(a.corredor ? corrFmt(a.corredor) : '—') + '</span>' + (a.loc && a.loc !== a.corredor ? ' <span style="color:var(--muted)">' + esc(a.loc) + '</span>' : '')) + linha(t('c_forn'), esc(a.fornecedor || '—')) +
      (a.ex.peso || a.ex.comp ? linha(t('f_envio_tit'), esc([a.ex.peso ? a.ex.peso + ' lb' : '', a.ex.comp ? [a.ex.comp, a.ex.larg, a.ex.alt].map(x => x || '—').join(' × ') + ' in' : ''].filter(Boolean).join(' · '))) : '') + '</div></div>' +
      '<div class="sec"><h3>' + esc(t('precos')) + '</h3><div class="rows">' + linha(t('c_preco'), vlr(a.preco)) + (ger() ? linha(t('custo_unit'), vlr(a.custo)) + linha(t('margem'), (a.margem == null ? 0 : a.margem) + '%') + linha(t('valor_total'), vlr(a.valor_estoque)) : '') + '</div>' + (ger() ? '' : '<div class="locked">' + svg(ICO.lock, 15) + ' ' + esc(t('bloq_custos')) + '</div>') + '</div>';
  } else if (PM.aba === 'forn') {
    corpo = '<div class="sec"><h3>' + esc(t('fornecimento')) + '</h3><div class="rows">' + linha(t('forn_princ'), esc(a.fornecedor || '—')) + linha(t('cod_forn'), esc(a.sku) + '-F1') + (ger() ? linha(t('ultimo_custo'), vlr(a.custo)) : '') + '</div>' + (ger() ? '' : '<div class="locked">' + svg(ICO.lock, 15) + ' ' + esc(t('bloq_compra')) + '</div>') + '</div>';
  } else {
    const L = movLinhas();
    corpo = '<div class="sec"><h3>' + esc(t('mov_titulo')) + '</h3><div class="rows"><table class="mini mov-tbl"><thead><tr><th class="rn" style="text-align:right">#</th><th>' + esc(t('data')) + '</th><th>' + esc(t('tipo')) + '</th><th>' + esc(t('responsavel')) + '</th><th>' + esc(t('motivo')) + '</th><th style="text-align:right">' + esc(t('qtd')) + '</th></tr></thead><tbody>' +
      (PM.mov == null ? '<tr><td colspan="6" style="color:var(--muted)">' + esc(t('carregando')) + '</td></tr>' : !L.length ? '<tr><td colspan="6" style="color:var(--muted)">' + esc(t('sem_mov')) + '</td></tr>' : L.map(movLinhaHTML).join('')) + '</tbody></table></div></div>';
  }
  const acoes = (mexe() ? '<button class="btn" data-act="editar-produto">' + esc(t('editar')) + '</button><button class="btn" data-act="ajustar">' + svg(ICO.ajuste, 15) + ' ' + esc(t('ajustar')) + '</button>' + (edita() && !String(a.barcode || '').trim() ? '<button class="btn" data-act="bar-gerar">' + svg(ICO.prod, 15) + ' ' + esc(t('bar_gerar')) + '</button>' : '') : '') +
    (vd() ? '' : '<button class="btn" data-act="etq-produto">' + svg(ICO.print, 15) + ' ' + esc(t('etp_imprimir')) + '</button>') + (mexe() ? '<button class="btn" data-act="conf-um">' + svg(ICO.busca, 15) + ' ' + esc(t('rc_enviar_btn')) + '</button>' : '') +
    (edita() ? '<button class="btn" data-act="toggle-ativo">' + esc(t(a.ativo ? 'pm_desativar' : 'pm_reativar')) + '</button>' : '') +
    (vd() ? '' : podeExcluir() ? '<button class="btn danger" data-act="excluir">' + esc(t('excluir')) + '</button>' : '<button class="btn" data-act="negado">' + svg(ICO.lock, 14) + ' ' + esc(t('excluir')) + '</button>');
  const html = '<div class="dr-head"><div class="dr-top">' + (a.foto ? '<div class="thumb thumb-foto"><img src="' + esc(thumb(a.foto, 120)) + '" alt="" width="46" height="46"></div>' : '<div class="thumb">' + esc(ini(a.nome)) + '</div>') + '<div><h2>' + esc(a.nome) + btnCopiar(a.sku) + '</h2><div class="meta">' + esc(a.sku) + ' • ' + esc(a.categoria || '—') + ' • ' + esc(a.descricao) + (a.ativo ? '' : ' • ' + esc(t('st_inativo'))) + '</div></div><button class="x" data-act="fechar-drawer">' + svg(ICO.x, 17) + '</button></div>' +
    '<div class="dr-actions">' + acoes + '</div><div class="tabs">' + [['geral', 'aba_geral'], ['forn', 'aba_forn'], ['mov', 'aba_mov']].map(x => '<button class="tab ' + (PM.aba === x[0] ? 'active' : '') + '" data-act="aba" data-aba="' + x[0] + '">' + esc(t(x[1])) + '</button>').join('') + '</div></div><div class="dr-body">' + corpo + '</div>';
  let w = document.querySelector('.pm-dw');
  if (!w) {
    w = document.createElement('div'); w.className = 'sb pm-raiz pm-dw'; w.style.cssText = 'position:fixed;inset:0;z-index:170;padding:0;margin:0;min-height:0;background:transparent';   // pm-raiz: 서랍도 상품 CSS(.sb.pm-raiz …) 를 받게 (body 아래라 #page 의 pm-raiz 밖)
    w.innerHTML = '<div class="scrim show" data-act="fechar-drawer"></div><div class="drawer show" id="pmDrawer"></div>';
    w.addEventListener('click', clique); document.body.appendChild(w);
  }
  $('pmDrawer').innerHTML = html;
  if (PM.aba === 'geral' && PM.caixas == null && PM.movPediu !== 'cx:' + a.id) { PM.movPediu = 'cx:' + a.id; carregarCaixasDr(a.id); }
  if (PM.aba === 'mov' && PM.mov == null && PM.movPediu !== a.id) carregarMov(a.id);
}
async function acaoDrawer(a, b) {
  const p = prodPorId(PM.drawer);
  if (a === 'fechar-drawer') return fecharDrawer();
  if (a === 'fechar-modal') return E.fecharModal();
  if (!p) return;
  if (a === 'aba') { PM.aba = b.dataset.aba; PM.movPediu = PM.aba === 'mov' ? '' : PM.movPediu; if (PM.aba === 'mov') PM.mov = null; return pintarDrawer(); }
  if (a === 'editar-produto') return modalProduto(p);
  if (a === 'ajustar') return ajustar(p);
  if (a === 'bar-gerar') return gerarBarcode([p.id]);
  if (a === 'etq-produto') return etiquetasLote([p.id], true);
  if (a === 'conf-um') return conferirLote([p.id]);
  if (a === 'cs-repor') return pedirReposicaoPopup(p.id, () => { PM.mov = null; PM.movPediu = ''; pintarDrawer(); });
  if (a === 'toggle-ativo') return toggleAtivo(p);
  if (a === 'excluir') return excluirLote([p.id], true);
  if (a === 'cx-reimprimir') { const r = (PM.caixas || []).find(x => x.codigo === b.dataset.cod); if (r) E.escolherTamanho([r]); }
}
async function toggleAtivo(p) {
  if (!edita()) return negado();
  busy(true);
  try { await editCatalog(S, rows => setHidden(rows, [p.id], p.ativo)); toast(t(p.ativo ? 'prod_desativado' : 'prod_reativado'), 'good'); montar(); } catch (x) { toast(String(x.message || x), 'bad'); }
  busy(false); render();
}

/* ---------- 재고 조정 (옛 ajustar — 상자 라벨로: + 는 새 상자 또는 고른 상자, − 는 상자에서 · 라벨이 없으면 라벨 없는 재고) ---------- */
const AJ_TIPOS = ['Physical Count', 'Damage', 'Loss', 'Found Inventory', 'Receiving Correction', 'Data Correction', 'Other'];
function ajustar(p) {
  if (!mexe()) return negado();
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('ajustar')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="sel-prod" style="margin:0 0 14px">' + svg(ICO.prod, 18) + '<div><b>' + esc(p.nome) + '</b><span>' + esc(t('ajuste_saldo_atual')) + ': ' + p.qtd + '</span></div></div><div class="aviso" style="margin:0 0 14px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('ajuste_perg')) + '</div></div>' +
    '<div class="grid2"><div class="field full"><label>' + esc(t('ajuste_qtd_label')) + '</label><input id="ajQtd" type="number" inputmode="numeric" placeholder="10, -3…"></div><div class="field full"><label>' + esc(t('aj_tipo_label')) + '</label><select id="ajTipo">' + AJ_TIPOS.map(x => '<option value="' + x + '">' + esc(t('aj_tipo_' + x.toLowerCase().replace(/ /g, '_'))) + '</option>').join('') + '</select></div><div class="field full"><label>' + esc(t('ajuste_motivo')) + ' *</label><input id="ajMotivo" autocomplete="off" placeholder="' + esc(t('aj_motivo_ph')) + '"></div></div></div>' +
    '<div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button><button class="btn primary" id="ajOk">' + esc(t('ajustar')) + '</button></div>');
  setTimeout(() => { const x = w.querySelector('#ajQtd'); if (x) x.focus(); }, 40);
  w.querySelector('#ajOk').onclick = async () => {
    const d = parseInt(String(w.querySelector('#ajQtd').value).trim(), 10), mot = w.querySelector('#ajMotivo').value.trim(), tipo = w.querySelector('#ajTipo').value || 'Other';
    if (!d) return toast(t('ajuste_inv'), 'bad');
    if (!mot) { w.querySelector('#ajMotivo').focus(); return toast(t('aj_motivo_obrig'), 'bad'); }
    E.fecharModal(); await ajustarAplicar(p, d, mot, tipo);
  };
}
async function ajustarAplicar(p, d, mot, tipo) {
  let cx = []; try { cx = (await E.listarEtiquetas(p.id)).filter(x => x.ativa); } catch (e) {}
  await E.produtos(true);
  const temProd = !!E.prod(p.id);
  const fim = async (r, msg) => { toast(msg || t('ajuste_ok'), 'good'); QTD[p.id] = r && r.saldo != null ? r.saldo : QTD[p.id]; p.qtd = Number(QTD[p.id]) || 0; if (p.qtd > 0) { p.caixa_vazia = false; delete VAZ[p.id]; } p.situacao = situacao(p); PM.caixas = null; PM.mov = null; PM.movPediu = ''; render(); };
  try {
    if (d > 0) {
      if (!temProd) { const r = await E.ajusteDireto(p.id, d, mot); return fim(r); }
      let alvo = null;
      if (cx.length) { alvo = await escolherCaixa(cx, t('pm_aj_mais'), true); if (alvo === false) return; }
      const r = await E.entrada(p.id, d, { confirmar: true, motivo: mot + ' · ' + tipo, existente: alvo || undefined });
      await fim({ saldo: r.saldo });
      const lista = r.existente ? [{ codigo: r.codigo, sku: r.sku, nome: r.nome, barcode: r.barcode, corredor: r.corredor, qtd_inicial: r.qtd_inicial, qtd_restante: r.qtd_restante }] : r.codigos.map(c => ({ codigo: c, sku: r.sku, nome: r.nome, barcode: r.barcode, corredor: r.corredor, qtd_inicial: r.qtd, qtd_restante: r.qtd, criado_em: r.criado_em }));
      return E.escolherTamanho(lista, { saldo: r.saldo, qtd: d });
    }
    if (!cx.length) { const r = await E.ajusteDireto(p.id, d, mot); return fim(r); }
    const cod = cx.length === 1 ? cx[0].codigo : await escolherCaixa(cx, t('es_ajuste_escolha_etq'), false); if (!cod) return;
    const e = cx.find(x => x.codigo === cod), r = await E.editarQtd(cod, Math.max(0, (e ? e.qtd_restante : 0) + d), mot, tipo);
    return fim(r);
  } catch (x) { toast(String(x.message || x), 'bad'); }
}
/** 상자 고르기 — nova = "새 상자" 단추도 (null) · 닫으면 false */
function escolherCaixa(cx, texto, nova) {
  return new Promise(res => {
    const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('ajuste_titulo')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p style="margin:0 0 14px;color:var(--muted)">' + esc(texto) + '</p><div class="achados">' +
      cx.map(e => '<button type="button" class="achado" data-aj-cx="' + esc(e.codigo) + '"><b>' + esc(e.codigo) + '</b><span>' + esc(t('r_corredor')) + ': ' + esc(e.corredor ? corrFmt(e.corredor) : '—') + ' · ' + esc(t('etq_restante')) + ': ' + e.qtd_restante + '</span></button>').join('') +
      (nova ? '<button type="button" class="achado" data-aj-cx=""><b>' + esc(t('pm_nova_caixa')) + '</b></button>' : '') + '</div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button></div>');
    w.addEventListener('click', ev => { const b = ev.target.closest('[data-aj-cx]'); if (b) { E.fecharModal(); return res(b.dataset.ajCx || null); } if (ev.target.closest('[data-act="fechar-modal"]')) res(false); });
  });
}

/* ============================================================
 *  상품 등록 · 수정 (옛 modalProduto · salvarProduto) — 카탈로그는 items.js 와 같은 editCatalog
 * ============================================================ */
function catOps() { const m = {}; PR.forEach(p => { if (p.categoria) m[p.grupo + '\u0001' + p.categoria] = [p.grupo, p.categoria]; }); return Object.values(m).sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0])); }
function modalProduto(e, comQtd) {
  if (e ? !mexe() : !edita()) return negado();
  const o = e || {}, so = !!e && locOnly(), ex = (e && e.ex) || {}, dis = so ? ' disabled style="background:#f4f6f8;color:var(--muted-2)"' : '';
  const cats = catOps(), catAt = e ? e.grupo + '\u0001' + e.categoria : '', corrAt = e ? e.corredor : '';
  const corrs = CORREDORES.concat(corrAt && CORREDORES.indexOf(corrAt) < 0 ? [corrAt] : []);
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t(e ? 'editar_produto' : comQtd ? 'cad_produto' : 'add_produtos')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="grid2">' +
    '<div class="field full"><label>' + esc(t('f_sku')) + '</label><input id="pSku" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase" placeholder="' + esc(t('f_sku_ph')) + '" value="' + esc(o.sku || '') + '"' + (e ? ' readonly style="background:#f4f6f8"' : '') + '>' + (e ? '' : '<div class="hint">' + esc(t('f_sku_hint')) + '</div>') + '</div>' +
    '<div class="field full"><label>' + esc(t('f_desc')) + '</label><input id="pDesc" value="' + esc(o.descricao || '') + '"' + dis + '></div>' +
    '<div class="field full"><label>' + esc(t('r_barcode')) + '</label><div class="campo-scan"><input id="pBarcode" autocomplete="off" placeholder="' + esc(t('f_barcode_ph')) + '" value="' + esc(o.barcode || '') + '"' + dis + '>' + (so ? '' : '<button type="button" class="scan-btn" data-pscan="1" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 18) + '</button><button type="button" class="scan-btn bar-btn" data-pbar="1" title="' + esc(t('bar_gerar')) + '">' + svg(ICO.prod, 18) + '</button>') + '</div><div class="hint">' + esc(t('bar_dica')) + '</div></div>' +
    '<div class="field"><label>' + esc(t('c_cat')) + '</label><select id="pCat"' + dis + '>' + (e ? '' : '<option value="">—</option>') + cats.map(c => { const k = c[0] + '\u0001' + c[1]; return '<option value="' + esc(k) + '"' + (k === catAt ? ' selected' : '') + '>' + esc(c[1] + (c[0] ? ' (' + c[0] + ')' : '')) + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label>' + esc(t('r_corredor')) + '</label><select id="pCorredor"><option value="">' + esc(t('r_corredor_nenhum')) + '</option>' + corrs.map(c => '<option value="' + esc(c) + '"' + (c === corrAt ? ' selected' : '') + '>' + esc(corrFmt(c)) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>' + esc(t('f_min')) + '</label><input id="pMin" type="number" value="' + (e ? e.minimo : minOf('')) + '" disabled style="background:#f4f6f8;color:var(--muted-2)"><div class="hint">' + esc(t('f_min_hint')) + '</div></div>' +
    (ger() ? '<div class="field"><label>' + esc(t('f_custo')) + '</label><input id="pCusto" type="number" inputmode="decimal" step="0.01" min="0" value="' + (o.custo == null ? '' : o.custo) + '"' + dis + '></div>' : '<div class="field"><label>' + esc(t('c_custo')) + '</label><input value="' + esc(t('f_custo_restrito')) + '" disabled style="background:#f4f6f8;color:var(--muted-2)"><div class="hint">' + esc(t('f_custo_hint')) + '</div></div>') +
    '<div class="field"><label>' + esc(t('f_preco')) + '</label><input id="pPreco" type="number" inputmode="decimal" step="0.01" min="0" value="' + (o.preco == null ? '' : o.preco) + '"' + dis + '></div>' +
    '<div class="field full"><label>' + esc(t('c_forn')) + '</label>' + supSelect('pForn', o.sup || '') + '</div>' +
    (comQtd ? '<div class="field full"><div class="aviso" style="margin:0">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('pm_receb_aviso')) + '</div></div></div>' : '<div class="field full"><label>' + esc(t('f_envio_tit')) + '</label><div class="hint">' + esc(t('f_envio_hint')) + '</div><div class="p-envio">' + [['pEnvP', 'f_envio_peso', ex.peso], ['pEnvC', 'f_envio_c', ex.comp], ['pEnvL', 'f_envio_l', ex.larg], ['pEnvA', 'f_envio_a', ex.alt]].map(f => '<label class="p-envio-c"><span>' + esc(t(f[1])) + '</span><input id="' + f[0] + '" type="number" inputmode="decimal" step="0.01" min="0" value="' + (f[2] == null ? '' : esc(f[2])) + '"' + dis + '></label>').join('') + '</div></div>') +
    '</div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button><button class="btn primary" id="pSalvar">' + esc(t(e ? 'salvar_alt' : 'criar_produto')) + '</button></div>');
  supBind('pForn'); if (so) { const f = w.querySelector('#pForn'); if (f) { f.disabled = true; f.style.background = '#f4f6f8'; } }
  setTimeout(() => { const x = w.querySelector(e ? (so ? '#pCorredor' : '#pDesc') : '#pSku'); if (x) x.focus(); }, 40);
  w.addEventListener('click', ev => {
    if (ev.target.closest('[data-pscan]')) openScanner(code => { const i = $('pBarcode'); if (i) i.value = code; }, { title: t('sc_abrir') });
    if (ev.target.closest('[data-pbar]')) { const i = $('pBarcode'); if (String(i.value || '').trim()) return toast(t('bar_ja_tem'), 'bad'); const C = catalog(); i.value = proxBarcode(C ? C.rows : [], []); toast(t('bar_no_campo', { cod: i.value }), 'good'); }
  });
  w.querySelector('#pSalvar').onclick = () => salvarProduto(e, comQtd, so, w);
}
async function salvarProduto(e, comQtd, so, w) {
  const $ = id => (w && w.querySelector('#' + id)) || document.getElementById(id);   // 이 창 안의 칸만 읽음 (같은 id 가 다른 곳에 있어도)
  const corr = $('pCorredor').value;
  const locNovo = e && corr === e.corredor ? e.loc : corr;   // 같은 통로면 선반 · 칸까지 적힌 위치를 그대로
  if (so) { E.fecharModal(); busy(true); try { await editCatalog(S, rows => setLoc(rows, [e.id], locNovo)); toast(t('prod_atualizado'), 'good'); montar(); } catch (x) { toast(String(x.message || x), 'bad'); } busy(false); return render(); }
  const v = { c: $('pSku').value.trim().toUpperCase(), d: $('pDesc').value.trim(), b: $('pBarcode').value.trim().replace(/\.0+$/, ''), p: R2(num($('pPreco').value)), cat: $('pCat').value, sup: supValue('pForn') };
  if (!v.c) return toast(t('f_sku_ph'), 'bad');
  if (!/^[A-Z0-9][A-Z0-9\-_.\/ ]{0,29}$/.test(v.c)) return toast(L3('코드는 영문 · 숫자 · - _ . / 만 (30자 이내)', 'Code: letters, digits, - _ . / only (30 max)', 'Código: letras, números, - _ . / (até 30)'), 'bad');
  if (!v.d) return toast(t('informe_nome'), 'bad');
  if (!(v.p > 0)) return toast(L3('도매가를 넣어 주세요', 'Enter the price', 'Informe o preço de venda'), 'bad');
  const C = catalog();
  if (!e) { try { await loadCatalog(S, true); } catch (x) {} if ((catalog() || C).byCode[v.c]) return toast(L3('이미 있는 코드입니다', 'This code already exists', 'Este código já existe') + ' — ' + v.c, 'bad'); }
  if (v.b) { const dup = (catalog() || C).items.find(i => i.b === v.b && i.c !== v.c); if (dup) { const r = await E.pergunta({ titulo: t('r_barcode'), texto: L3('바코드 ' + v.b + ' 는 ' + dup.c + ' 에도 있습니다. 그래도 저장할까요?', 'Barcode ' + v.b + ' is also on ' + dup.c + '. Save anyway?', 'O código de barras ' + v.b + ' já está em ' + dup.c + '. Salvar mesmo assim?'), sim: t('salvar'), nao: t('cancelar') }); if (!r) return; } }
  const cat = v.cat ? v.cat.split('\u0001') : null;
  const env = ['pEnvP', 'pEnvC', 'pEnvL', 'pEnvA'].map(id => { const x = $(id); const s = x ? String(x.value).trim() : ''; return s === '' ? null : Number(s); });
  const custo = ger() && $('pCusto') ? String($('pCusto').value).trim() : null;
  E.fecharModal(); busy(true);
  try {
    await editCatalog(S, (rows, cats) => {
      const i = rows.findIndex(r => r[0] === v.c);
      if (!e) { if (i >= 0) throw new Error(L3('이미 있는 코드입니다', 'This code already exists', 'Este código já existe') + ' — ' + v.c); rows.push([v.c, v.d, v.p, 0, v.b, cat ? cat[0] : '', cat ? cat[1] : '', '', '', '', 0, locNovo || '', v.sup]); }
      else if (i >= 0) {
        const r = rows[i]; while (r.length < 13) r.push(r.length === 10 ? 0 : '');
        r[1] = v.d; r[2] = v.p; r[4] = v.b; r[12] = v.sup; if (corr !== e.corredor) r[11] = locNovo;
        if (cat && (cat[0] !== (r[5] || '') || cat[1] !== (r[6] || ''))) { r[5] = cat[0]; r[6] = cat[1]; r[7] = ''; r[8] = ''; }
      }
      ensureCats(rows, cats); return 1;
    });
    const ops = [], now = new Date().toISOString(), tinha = e && (e.ex.peso != null || e.ex.comp != null);
    if (env.some(x => x != null) || tinha) ops.push({ op: 'merge', col: 'prodExtra', id: v.c, data: { peso: env[0], comp: env[1], larg: env[2], alt: env[3], at: now, by: S.user.email } });
    if (custo != null && (custo !== '' || (e && e.custo != null))) ops.push({ op: 'merge', col: 'prodCusto', id: v.c, data: { custo: custo === '' ? null : R2(Number(custo)), at: now, by: S.user.email } });
    if (ops.length) await S.DB.batch(ops);
    toast(t(e ? 'prod_atualizado' : 'prod_criado'), 'good');
    await carregar(false);
  } catch (x) { busy(false); return toast(String(x.message || x), 'bad'); }
  busy(false);
  if (comQtd) { await E.produtos(true); fecharDrawer(); return Router.go('estoque', 'entrada/' + v.c); }
  render();
}
