/* ============================================================
 *  📥 상품 받기 (#/recebimento) — 옛 THE ONE CORP WMS 의 "Produtos recebidos" 화면을 그대로 (레이아웃 · 글 · 동작)
 *    목록: 숫자 칸(30일 REC · 줄 · 개수 · 열린 REC) · 한 칸 검색(REC 번호 · 상품 코드 · 트래킹) · 걸러보기(출처 · 통로 · 운송사 · 날짜)
 *          REC 표(번호 · 날짜 · 출처 · 운송사 · 줄 · 개수 · 상자 · 상태 · 닫기/다시 열기/버리기) · 줄을 펴면 요약 · 쪽 넘기기 · 새 REC
 *    REC 쪽: 머리(상태 · 인보이스 · PDF · 닫기) · 숫자 칸(보낸 상자 · 받은 상자 · 남은 상자 · 코드 · 진행) · 상자(트래킹) 띠
 *          상품 넣기(검색 · 스캔 → 수량 · 재고/피킹 나누기 · 출처 · 통로 · 트래킹(앞의 것 쓰기) · 사진) · 받은 줄 표(검색 · 재고 안 들어간 것만 · 고르기 → 다른 REC 로 · 확인 요청 · PDF)
 *          오른쪽: 들어온 것(코드별 · 도착순) · 자세히 · 줄을 펴면 상품 카드(받은 기록 · 판매 · 움직임)
 *  자료 (옛 표 → 새 컬렉션 — 칸 이름은 옛 칸을 camelCase 로)
 *    cargas/{id}       = { id, numero:'REC-000001', fornecedor, transportadora, rastreio, qtdPallets, dataChegada, status: recebida|fechada|cancelada, observacao,
 *                          criadoPor, criadoPorNome, criadoEm, atualizadoEm, caixasEnviadas, caixasRecebidas, caixasManual,
 *                          temInvoice, invoiceNome, invoiceEm, invoicePor, fechadoPor, fechadoPorNome, fechadoEm, inbound, inboundNo }
 *        번호는 counters/rec 의 n (옛 cargas.numero 와 같은 모양) · inbound = 🚢 입고 예정(inbound/{id}) 에서 만든 REC 이면 그 문서 id
 *    recebimentos/{id} = { id, cargaId, cargaNumero, code, nome, qtd, barcode, origem, corredor, transportadora, rastreio, usuario, usuarioNome, criadoEm, foto,
 *                          estoqueConfirmado, estoqueQtd, estoqueConfirmadoEm, estoqueConfirmadoPor, estoqueConfirmadoPorNome, estoqueEtiquetas:[codigo], pickingQtd }
 *        재고에 넣기 = etq.js entrada (상자 라벨 · stock.js moveStock 'recv' · origem 'recebimento' · ref = 이 줄 id) — 같은 batch 에서 estoqueConfirmado 를 씀
 *        한 번만: 넣기 전에 이 줄을 다시 읽어 estoqueConfirmado 면 거절 (옛 rpc_entrada_com_etiqueta 의 ja_confirmado)
 *    recebFotos/{id}   = { id, data(작은 JPEG dataURL — catalog.shrinkImage), em, por } — 줄의 foto 는 이 id (같은 사진을 여러 줄이 씀: "앞의 사진")
 *    cargaInvoice/{id} = { id(=carga id), nome, tipo, data(dataURL ≤ 700KB), em, por } — 관리자 · 오너만 (옛 invoices 버킷 + 비밀번호)
 *    확인 요청 = produtos.js 의 pedirRechecagem → rechecagem { origem:'recebimento', origemRef: carga id }
 *  권한: 세일즈맨 = 보기만 · 재고 담당(can items) = 넣기 · 고치기 · 옮기기 · 닫기 · 확인 요청 · 관리자 · 오너(옛 GERENTE) = 다시 열기 · 버리기 · 줄 삭제 · 인보이스 · 상자 수 손으로
 *    옛 앱의 비밀번호(관리자 비밀번호 · 트래킹 없는 입고 허가 코드)는 "관리자 · 오너가 확인" 으로 바꿈 (비밀 코드를 앱에 둘 곳이 없음)
 *  옮기지 않음: 사진으로 라벨 읽기(AI) · 다스 단위(새 카탈로그에 단위 칸 없음) · Recebido x Vendido 보고서 · 팔레트
 * ============================================================ */
import { $, esc, toast, Router, busy, debounce, printOpen, today } from './ui.js';
import { openScanner } from './scan.js';
import { can, isTop } from './main.js';
import { editCatalog, shrinkImage } from './catalog.js';
import { suppliers, supLabel, minOf } from './stock.js';
import { invoicesBetween } from './invoicing.js';
import { newId } from './db.js';
import * as E from './etq.js';
import { L3 } from './balcao.js';
import { pedirRechecagem } from './produtos.js';
import { PM_DOC_CSS } from './produtos-css.js';
import { D as DP } from './produtos-txt.js';
import { RC_CSS, RC_MAIS } from './recebidos-css.js';
import { D } from './recebidos-txt.js';

const { svg, numFmt, dataBR, horaCurta, corrFmt, CORREDORES, quem } = E;
const ICO = Object.assign({}, E.ICO, {
  clipe: '<path d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  repetir: '<polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/>',
  casa: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/>',
  link: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  foto: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  venda: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'
});
/** 문구 — 이 화면의 사전(recebidos-txt) → 상품 사전(produtos-txt) → 재고 사전(estoque-txt) */
const sub = (s, v) => { if (v) Object.keys(v).forEach(n => { s = s.split('{' + n + '}').join(String(v[n])); }); return s; };
const t = (k, v) => { const x = D[k] || DP[k]; return x ? sub(L3(x[0], x[1], x[2]), v) : E.t(k, v); };
const te = (k, v) => { const x = D[k] || DP[k]; return x ? sub(x[1], v) : sub(E.te(k), v); };

let S = null;
export function register(state) {
  S = state; E.init(state); Router.on('recebimento', page);
  Router.up.recebimento = () => { if (E.modalAberto()) { E.fecharModal(); return true; } if (RC.expand) { RC.expand = ''; render(); return true; } return false; };
  Router.upHas.recebimento = () => !!RC.expand;
}

/* ---------- 권한 (옛 podeEditarReceb · GERENTE) ---------- */
const vd = () => S.role === 'salesman';
const mexe = () => !vd() && can('items');
const ger = () => isTop();
const negado = () => toast(t('somente_gerente'), 'bad');

/* ---------- 상태 (옛 S.r* · S.rec*) ---------- */
const RC = { pag: 'lista', consulta: '', fOrigem: '', fCorr: '', fTransp: '', fDe: '', fAte: '', porPag: 10, pag2: 1, aberto: '', sel: {},
  caixa: '', busca: '', semEntrada: false, aba: 'codigo', expand: '', rxAba: 'rec', caixasForm: '',
  prod: '', rBusca: '', qtd: 1, distCampo: '', distEst: 0, distPick: 0, corr: null, rast: '', foto: '', liberado: false, vazioOk: '', mvBusca: '' };
const ORIGEM_OUTROS = 'OUTROS', ORIGENS = ['#CHINA1', '#CHINA2', '#CHINA3', ORIGEM_OUTROS], TRANSPORTADORAS = ['FEDEX', 'UPS', 'DHL', 'PALLET'], POR_PAG = [10, 25, 50];
const mob = () => window.innerWidth <= 760;
const now = () => new Date().toISOString();

/* ============================================================
 *  DADOS (옛 carregarCargas · carregarCargaItens · v_cargas · v_recebimentos)
 * ============================================================ */
let CG = null, RB = [], BYC = {}, LIDO = 0, VENDAS = null, FOTOS = {};
async function carregar(force) {
  await E.produtos(force);
  try { CG = await S.DB.list('cargas', { order: ['criadoEm', 'desc'], limit: 500 }); } catch (e) { CG = await S.DB.list('cargas'); }
  try { RB = await S.DB.list('recebimentos', { order: ['criadoEm', 'desc'], limit: 5000 }); } catch (e) { RB = await S.DB.list('recebimentos'); }
  indexar(); LIDO = Date.now();
}
function indexar() {
  BYC = {}; RB.forEach(x => { (BYC[x.cargaId] = BYC[x.cargaId] || []).push(x); });
  Object.keys(BYC).forEach(k => BYC[k].sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))));
  CG.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
}
const itens = id => BYC[id] || [];
const recPorId = id => (CG || []).find(c => String(c.id) === String(id)) || null;
const recebPorId = id => RB.find(x => String(x.id) === String(id)) || null;
const fechada = c => String(c && c.status || '') === 'fechada';
const cancelada = c => String(c && c.status || '') === 'cancelada';
const abertas = () => (CG || []).filter(c => !fechada(c) && !cancelada(c));
const pecasDe = L => L.reduce((a, x) => a + (Number(x.qtd) || 0), 0);
/** 옛 rast_norm — 띄어쓰기 · 문장부호 없이 */
const rastNorm = v => String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const rastCurto = c => { c = String(c || ''); return c.length > 10 ? '…' + c.slice(-6) : c; };
/** 옛 caixas_lidas — 이 REC 에 넣은 트래킹(서로 다른) 수 */
const caixasLidas = c => new Set(itens(c.id).map(x => rastNorm(x.rastreio)).filter(Boolean)).size;
const caixasRec = c => c.caixasManual ? Number(c.caixasRecebidas) || 0 : caixasLidas(c);
const caixasPend = c => Math.max((Number(c.caixasEnviadas) || 0) - caixasRec(c), 0);
const juntos = (L, k) => Array.from(new Set(L.map(x => String(x[k] || '').trim()).filter(Boolean))).sort().join(', ');
const entrou = x => !!x.estoqueConfirmado || (Number(x.pickingQtd) || 0) >= (Number(x.qtd) || 0);

/* ---------- 트래킹 (옛 rastreioValido · transpDoRastreio · transpDoRecebimento · urlRastreio) ---------- */
const DHL_RASTREIO = /^(2[0-9]{9,11}|JD[0-9A-Z]{8,26})$/;
const rastreioValido = v => { const e = String(v == null ? '' : v).trim().toUpperCase().replace(/[\s-]/g, ''); return /^1Z[0-9A-Z]{16}$/.test(e) || /^[0-9]{12}$/.test(e) || DHL_RASTREIO.test(e); };
const rastreioBloqueia = v => { const e = String(v == null ? '' : v).trim(); return !!e && !rastreioValido(e); };
const transpDoRastreio = v => { const e = String(v == null ? '' : v).trim().toUpperCase().replace(/[\s-]/g, ''); return e ? (e.indexOf('1Z') === 0 ? 'UPS' : DHL_RASTREIO.test(e) ? 'DHL' : 'FEDEX') : ''; };
const transpDoRecebimento = v => transpDoRastreio(v) || 'PALLET';
function urlRastreio(tp, r) {
  const a = String(r == null ? '' : r).trim(); if (!a) return ''; const o = String(tp || '').toUpperCase(), q = encodeURIComponent(a);
  return o.indexOf('FEDEX') >= 0 ? 'https://www.fedex.com/fedextrack/?trknbr=' + q : o.indexOf('UPS') >= 0 ? 'https://www.ups.com/track?loc=en_US&requester=ST&tracknum=' + q : o.indexOf('DHL') >= 0 ? 'https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=' + q : '';
}
const ultRast = () => { try { return localStorage.getItem('ultimoRastreio') || ''; } catch (e) { return ''; } };
const ultRastSalvar = v => { v = String(v || '').trim(); if (v) try { localStorage.setItem('ultimoRastreio', v); } catch (e) {} };
const ultFoto = () => { try { return localStorage.getItem('ultimaFotoReceb') || ''; } catch (e) { return ''; } };
const ultFotoSalvar = v => { if (v) try { localStorage.setItem('ultimaFotoReceb', v); } catch (e) {} };

/** 옛 origensLista — 고정 출처 + 공급업체 + 받은 줄 · REC 에 나온 것 · OUTROS 는 맨 끝 */
function origensLista() {
  const v = new Set(); const por = x => { x = String(x == null ? '' : x).trim(); if (x) v.add(x); };
  ORIGENS.forEach(por); suppliers().forEach(f => por(supLabel(f.code))); RB.forEach(r => por(r.origem)); (CG || []).forEach(c => por(c.fornecedor));
  const L = Array.from(v).filter(x => x !== ORIGEM_OUTROS).sort(); L.push(ORIGEM_OUTROS); return L;
}
const origemDoProduto = p => { const e = String(p && p.fornecedor || '').trim(); return e && origensLista().indexOf(e) >= 0 ? e : ''; };

/* ============================================================
 *  TELA (옛 telaRecebimento)
 * ============================================================ */
async function page(arg) {
  E.injetarCss(); injetarCss();
  const a = arg ? decodeURIComponent(String(arg)) : '', novo = a || 'lista';
  if (novo !== RC.pag) Object.assign(RC, { pag: novo, caixa: '', busca: '', sel: {}, expand: '', semEntrada: false, caixasForm: '', aberto: '' });
  if (!CG) $('page').innerHTML = '<div class="sb rc-raiz"><div id="conteudo" class="rc-tela"><div class="placeholder">' + esc(t('carregando')) + '</div></div></div>';
  try { await carregar(!CG || Date.now() - LIDO > 30000); } catch (e) { CG = CG || []; toast(String(e.message || e), 'bad'); }
  if (location.hash.indexOf('#/recebimento') !== 0) return;
  render();
}
function injetarCss() { if (document.getElementById('rcCss')) return; const st = document.createElement('style'); st.id = 'rcCss'; st.textContent = RC_CSS + RC_MAIS + PM_DOC_CSS; document.head.appendChild(st); }
const recPagina = () => RC.pag === 'lista' ? null : recPorId(RC.pag);
function render() {
  if (location.hash.indexOf('#/recebimento') !== 0) return;
  const c = recPagina();
  if (RC.pag !== 'lista' && !c) RC.pag = 'lista';
  const html = c ? telaRec(c) : telaLista();
  const ae = document.activeElement, foco = ae && ae.id && $('page').contains(ae) && ae.tagName === 'INPUT' ? { id: ae.id, pos: ae.selectionStart } : null;
  $('page').innerHTML = '<div class="sb rc-raiz"><div id="conteudo" class="rc-tela">' + html + '</div></div>';
  if (foco) { const n = $(foco.id); if (n && n.tagName === 'INPUT' && !n.disabled) { try { n.focus(); if (foco.pos != null && n.setSelectionRange) n.setSelectionRange(foco.pos, foco.pos); } catch (e) {} } }
  ligar();
}
function recebBuscaHTML() {
  const q = RC.consulta;
  return '<div class="panel rb-busca"><div class="tb-search grande">' + svg(ICO.busca, 16) + '<input type="search" id="rConsulta" autocomplete="off" placeholder="' + esc(t('r_busca_tudo_ph')) + '" value="' + esc(q) + '">' +
    '<button type="button" class="scan-in" data-scan="consulta" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 17) + '</button>' +
    (q ? '<button type="button" class="scan-in rb-x" data-act="limpar-filtros-receb" title="' + esc(t('limpar_filtros')) + '">' + svg(ICO.x, 16) + '</button>' : '') +
    '</div><div class="rb-dica">' + esc(t('r_busca_tudo_dica')) + '</div></div>';
}
function cargaAbasHTML(atual) {
  return '<div class="cg-abas">' + abertas().map(c => { const env = Number(c.caixasEnviadas) || 0, p = caixasPend(c);
    return '<button type="button" class="cg-aba' + (atual && c.id === atual.id ? ' on' : '') + '" data-cg-ir="' + esc(c.id) + '">' + esc(c.numero) + (env ? '<i>' + caixasRec(c) + '/' + env + '</i>' : '') + (p ? '<b class="cg-aba-pend" title="' + esc(t('cx_pendentes')) + '">' + p + '</b>' : '') + '</button>'; }).join('') +
    (mexe() ? '<button type="button" class="cg-aba nova" data-act="cg-nova">' + svg(ICO.mais, 13) + ' ' + esc(t('cg_nova')) + '</button>' : '') + '</div>';
}
/** 클립 — 관리자 · 오너만 (옛 invBotaoCargaHTML) */
function invBotaoHTML(c) {
  if (!ger() || !c) return '';
  const tem = !!c.temInvoice;
  return '<button type="button" class="btn-inv ' + (tem ? 'inv-tem' : 'inv-nao') + '" data-act="' + (tem ? 'inv-ver' : 'inv-add') + '" data-cg-id="' + esc(c.id) + '" title="' + esc(tem ? t('inv_abrir_tit') + (c.invoiceNome ? ' — ' + c.invoiceNome : '') : t('inv_anexar')) + '">' + svg(ICO.clipe, 14) + '</button>';
}
function kpi(ico, cor, valor, rot, s, attr) {
  const tag = attr ? 'button' : 'div';
  return '<' + tag + ' class="rec-kpi' + (attr ? ' clic' : '') + '"' + (attr ? ' type="button" ' + attr : '') + '><div class="rec-kpi-ico ' + cor + '">' + svg(ico, 18) + '</div><div><b>' + esc(valor) + '</b><span>' + esc(rot) + (s ? '<br>' + esc(s) : '') + '</span></div></' + tag + '>';
}
function finKpi(ico, cor, v, rot, s) { return '<div class="fin-kpi"><div class="fin-kpi-ico ' + cor + '">' + svg(ico, 19) + '</div><div class="fin-kpi-c"><span class="lbl">' + esc(rot) + '</span><b>' + esc(v) + '</b><span class="sub">' + esc(s || '') + '</span></div></div>'; }

/* ---------- 상자 수 (옛 caixasFormHTML — 보낸 상자는 적고, 받은 상자는 트래킹 수) ---------- */
function caixasFormHTML(c) {
  const precisa = !Number(c.caixasEnviadas) && !Number(c.caixasRecebidas), aberto = RC.caixasForm === c.id;
  if (!mexe() || fechada(c) || cancelada(c) || (!precisa && !aberto)) return '';
  const manual = !!c.caixasManual;
  return '<div class="cx-form"><span class="cx-form-tit">' + esc(t('cx_pergunta')) + '</span><label>' + esc(t('cx_enviadas')) + '<input id="cxEnv" type="number" min="0" max="9999" inputmode="numeric" value="' + esc(c.caixasEnviadas == null ? '' : c.caixasEnviadas) + '"></label>' +
    '<span class="cx-rec-auto"><span class="cx-rec-lbl">' + esc(t('cx_recebidas')) + '</span><b id="cxRecLido">' + caixasRec(c) + '</b><i>' + esc(t(manual ? 'cx_manual' : 'cx_auto')) + '</i></span>' +
    '<button type="button" class="btn sm primary" data-act="cg-caixas-salvar" data-cg-id="' + esc(c.id) + '">' + esc(t('salvar')) + '</button>' +
    (ger() ? '<button type="button" class="btn sm" data-act="cg-caixas-corrigir" data-cg-id="' + esc(c.id) + '">' + svg(ICO.lock, 13) + ' ' + esc(t('cx_corrigir')) + '</button>' : '') +
    (ger() && manual ? '<button type="button" class="btn sm" data-act="cg-caixas-auto" data-cg-id="' + esc(c.id) + '">' + esc(t('cx_voltar_auto')) + '</button>' : '') +
    (aberto && !precisa ? '<button type="button" class="btn sm" data-act="cg-caixas-fechar">' + esc(t('cancelar')) + '</button>' : '') +
    '<span class="cx-form-dica">' + esc(t('cx_dica')) + (manual ? '' : ' (' + caixasLidas(c) + ')') + '</span></div>';
}

/* ============================================================
 *  REC 쪽 (옛 recDetCabecaHTML · recLancarHTML · recDetTabelaHTML · recDetLadoHTML)
 * ============================================================ */
function telaRec(c) {
  const L = itens(c.id);
  return '<input type="file" id="rInvoiceLinha" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" style="display:none">' + cabecaHTML(c, L) +
    '<div class="rec-pag"><div class="rec-pag-col">' + (mexe() && !fechada(c) && !cancelada(c) ? lancarHTML() : '') + tabelaRecHTML(c) + '</div>' + ladoHTML(c, L) + '</div>';
}
function cabecaHTML(c, L) {
  const fc = fechada(c), env = Number(c.caixasEnviadas) || 0, rec = caixasRec(c), pend = caixasPend(c), pecas = pecasDe(L), codigos = agruparPorCodigo(L).length, pc = env > 0 ? Math.min(rec / env * 100, 100) : 0;
  const meta = [dataBR(c.dataChegada || c.criadoEm)];
  if (c.fornecedor) meta.push(t('r_origem') + ': ' + c.fornecedor);
  if (c.transportadora) meta.push(t('r_transp') + ': ' + c.transportadora);
  if (c.inboundNo) meta.push('🚢 ' + c.inboundNo);
  if (c.criadoPorNome) meta.push(t('cg_aberto_por') + ' ' + c.criadoPorNome);
  if (c.fechadoPorNome) meta.push(t('cg_fechado_por') + ' ' + c.fechadoPorNome + (c.fechadoEm ? ' · ' + dataBR(c.fechadoEm) : ''));
  const stCls = fc ? 'ok' : cancelada(c) ? 'cancel' : 'abre', stTxt = fc ? 'cg_st_fechada' : cancelada(c) ? 'cg_st_cancelada' : 'cg_st_aberta';
  let h = recebBuscaHTML() + cargaAbasHTML(c) +
    '<div class="rec-crumb"><button type="button" class="rec-voltar" data-act="rec-lista">' + svg(ICO.esq, 16) + ' ' + esc(t('voltar')) + '</button><button type="button" data-act="rec-lista">' + esc(t('receb_titulo')) + '</button>' + svg(ICO.dir, 12) + '<b>' + esc(c.numero || t('cg_sem_numero')) + '</b></div>' +
    '<div class="rec-cabeca"><div class="rec-cab-esq"><div class="rec-h1l"><h1>' + esc(c.numero || t('cg_sem_numero')) + '</h1><span class="rec-st ' + stCls + '">' + esc(t(stTxt)) + '</span></div><div class="rec-cab-meta">' + esc(meta.join('  ·  ')) + '</div></div>' +
    '<div class="rec-cab-bts">' + invBotaoHTML(c) + (L.length ? '<button type="button" class="btn" data-act="cg-pdf" data-cg-id="' + esc(c.id) + '">' + svg(ICO.print, 15) + ' ' + esc(t('cg_pdf')) + '</button>' : '') + descartarBtnHTML(c, L.length) +
    (fc && ger() ? '<button type="button" class="btn" data-act="rec-reabrir" data-rec="' + esc(c.id) + '">' + svg(ICO.repetir, 15) + ' ' + esc(t('cg_reabrir')) + '</button>' : '') +
    (fc || cancelada(c) || !mexe() ? '' : '<button type="button" class="btn primary" data-act="cg-fechar" data-cg-id="' + esc(c.id) + '"' + (pend ? ' disabled' : '') + '>' + svg(ICO.check, 15) + ' ' + esc(pend ? t('cg_travado_cx', { n: pend }) : t('cg_fechar')) + '</button>') + '</div></div>';
  const podeCx = mexe() && !fc && !cancelada(c);
  h += '<div class="rec-kpis">' + kpi(ICO.caixa, '', env ? numFmt(env) : '—', t('rec_kpi_enviadas'), podeCx ? t('rec_kpi_mudar') : '', podeCx ? 'data-act="cg-caixas" data-cg-id="' + esc(c.id) + '"' : '') +
    kpi(ICO.check, 'g', numFmt(rec), t('rec_kpi_recebidas'), t(c.caixasManual ? 'cx_manual' : 'cx_auto')) + kpi(ICO.ajuda, pend ? 'a' : '', numFmt(pend), t('rec_kpi_pendentes'), '') +
    kpi(ICO.prod, '', numFmt(codigos), t('rec_kpi_codigos'), t('rec_kpi_lancamentos', { n: numFmt(L.length) })) +
    '<div class="rec-kpi prog"><div class="rec-kpi-top"><b>' + (env > 0 ? pc.toFixed(1).replace('.', ',') + '%' : '—') + '</b><span>' + esc(env > 0 ? rec + ' / ' + env + ' ' + t('cx_caixas') : t('cx_sem_enviadas')) + '</span></div><div class="rec-barra' + (pend ? ' pend' : '') + '"><i style="width:' + pc + '%"></i></div><span class="rec-kpi-pe">' + esc(t('rec_kpi_pecas', { n: numFmt(pecas) })) + '</span></div></div>' + caixasFormHTML(c);
  const cx = caixasDe(L);
  if (cx.length || pend) {
    h += '<div class="rec-legenda">' + esc(t('rec_faixa_caixas')) + '</div><div class="rec-caixas"><button type="button" class="rec-cx' + (RC.caixa ? '' : ' on') + '" data-act="rec-caixa" data-cx=""><b>' + esc(t('rec_todas_caixas')) + '</b><span>' + esc(t('rec_cx_resumo', { c: cx.filter(x => x.chave !== '@sem').length, i: L.length })) + '</span></button>' +
      cx.map(x => { const sem = x.chave === '@sem'; return '<button type="button" class="rec-cx' + (RC.caixa === x.chave ? ' on' : '') + '" data-act="rec-caixa" data-cx="' + esc(x.chave) + '"><b>' + esc(sem ? t('rec_sem_codigo') : rastCurto(x.codigo)) + '</b><span><i class="rec-pt' + (sem ? ' a' : '') + '"></i>' + esc(t(x.itens === 1 ? 'rec_cx_item' : 'rec_cx_itens', { i: x.itens, p: numFmt(x.pecas) })) + '</span></button>'; }).join('') +
      (pend ? '<div class="rec-cx falta">' + svg(ICO.mais, 13) + ' ' + esc(t('rec_cx_faltam', { n: pend })) + '</div>' : '') + '</div>';
  }
  return h + semEntradaHTML(c, L);
}
/** 상자 = 이 REC 에 넣은 트래킹 하나 (옛 recCaixasDe) */
function caixasDe(L) { const m = {}, o = []; L.slice().reverse().forEach(x => { const cod = String(x.rastreio || '').trim(), k = cod.toUpperCase() || '@sem'; if (!m[k]) { m[k] = { chave: k, codigo: cod, itens: 0, pecas: 0 }; o.push(m[k]); } m[k].itens++; m[k].pecas += Number(x.qtd) || 0; }); return o; }
/** 닫은 REC 인데 재고에 안 들어간 줄 (옛 recSemEntradaHTML) */
function semEntradaHTML(c, L) {
  if (!fechada(c)) return ''; const f = L.filter(x => !entrou(x)); if (!f.length) return '';
  return '<div class="aviso alerta rec-sem-entrada">' + svg(ICO.ajuda, 16) + '<div><b>' + esc(t('rec_sem_ent_tit')) + '</b> ' + esc(t('rec_sem_ent', { n: f.length, p: numFmt(pecasDe(f)) })) + '</div><button type="button" class="btn sm" data-act="rec-so-sem-entrada">' + esc(t(RC.semEntrada ? 'rec_sem_ent_todos' : 'rec_sem_ent_ver')) + '</button></div>';
}
function descartarBtnHTML(c, n) {
  if (!ger() || fechada(c) || cancelada(c)) return '';
  return '<button type="button" class="btn perigo-leve" data-act="rec-descartar" data-rec="' + esc(c.id) + '">' + svg(ICO.x, 14) + ' ' + esc(t(n ? 'rec_cancelar' : 'rec_excluir')) + '</button>';
}

/* ---------- 상품 넣기 (옛 recLancarHTML · recDistHTML) ---------- */
const prodSel = () => RC.prod ? E.prod(RC.prod) : null;
function achadosHTML(a) {
  if (a) return '<div class="sel-prod">' + svg(ICO.prod, 18) + '<div><b>' + esc(a.nome) + '</b><span>' + esc(a.barcode || '') + (a.descricao ? (a.barcode ? ' · ' : '') + esc(a.descricao) : '') + ' · ' + esc(t('c_qtd')) + ': ' + a.qtd + '</span></div><button type="button" class="btn sm" data-act="receb-trocar">' + esc(t('r_trocar')) + '</button></div>';
  const o = E.buscaProdutos(RC.rBusca);
  if (RC.rBusca && !o.length) return '<div class="aviso" style="margin:0 17px 16px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('r_nada_encontrado')) + '</div></div>';
  if (o.length) return '<div class="achados"><h4>' + esc(t('r_escolha_lista')) + (o.length > 1 ? ' <span class="achados-n">' + o.length + '</span>' : '') + '</h4>' + o.map(e => '<button type="button" class="achado" data-pick="' + esc(e.id) + '"><b>' + esc(e.nome) + '</b><span>' + esc(e.barcode || '') + (e.descricao ? (e.barcode ? ' · ' : '') + esc(e.descricao) : '') + ' · ' + esc(t('c_qtd')) + ': ' + e.qtd + (e.corredor ? ' · ' + esc(corrFmt(e.corredor)) : '') + '</span></button>').join('') + '</div>';
  return '<div class="aviso" style="margin:0 17px 16px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('r_digite')) + '</div></div>';
}
const qtdAtual = () => { const c = $('rQtd'); return Math.max(0, Math.floor(Number(c ? c.value : RC.qtd || 1) || 0)); };
function distEstoque(q) {
  if (RC.distCampo === 'picking') return Math.max(0, q - Math.min(q, Math.max(0, Number(RC.distPick) || 0)));
  return RC.distCampo === 'estoque' ? Math.min(q, Math.max(0, Number(RC.distEst) || 0)) : q;
}
function distHTML(p) {
  const q = qtdAtual(), est = distEstoque(q), pick = q - est, ed = RC.distCampo === 'picking';
  const cartao = (id, ico, rot, val, calc, pe) => '<div class="r-dist-cx' + (calc ? ' calc' : '') + (pe ? ' pick' : '') + '"><div class="r-dist-cab">' + svg(ico, 15) + '<span>' + esc(rot) + '</span></div><div class="r-dist-n"><input id="' + id + '" type="number" inputmode="numeric" min="0" max="' + q + '" value="' + val + '"><em>' + esc(t('r_dist_un')) + '</em></div><div class="r-dist-pe">' + (calc ? '<span class="r-dist-auto">' + esc(t('r_dist_auto')) + '</span>' : esc(pe ? t('r_dist_nao_entra') : t('r_dist_saldo') + ': ' + numFmt((Number(p && p.qtd) || 0) + val))) + '</div></div>';
  return '<div class="field r-dist" style="grid-column:1/-1"><label>' + esc(t('r_dist_tit')) + '</label><div class="r-dist-par">' + cartao('rDestEstoque', ICO.casa, t('r_dest_estoque'), est, ed, false) + '<div class="r-dist-mais">+</div>' + cartao('rDestPicking', ICO.caixa, t('r_dest_picking'), pick, !ed, true) + '</div><div class="r-dist-conta" id="rDistConta"></div></div>';
}
function fotoHTML() {
  const f = RC.foto, src = f && FOTOS[f];
  return '<div class="field" style="grid-column:1/-1"><label>' + esc(t('r_foto')) + '</label><div class="foto-linha"><input type="file" id="rFoto" accept="image/jpeg,image/png,image/webp" capture="environment" style="display:none"><input type="file" id="rFotoGaleria" accept="image/jpeg,image/png,image/webp" style="display:none">' +
    '<button type="button" class="btn sm" data-act="foto-escolher">' + svg(ICO.foto, 15) + ' ' + esc(t('r_foto_tirar')) + '</button><button type="button" class="btn sm" data-act="foto-galeria">' + svg(ICO.imagem, 15) + ' ' + esc(t('ia_galeria')) + '</button>' +
    (ultFoto() ? '<button type="button" class="btn sm" data-act="foto-anterior">' + svg(ICO.repetir, 15) + ' ' + esc(t('r_foto_anterior')) + '</button>' : '') + (f ? '<button type="button" class="btn sm danger" data-act="foto-limpar">' + esc(t('r_foto_remover')) + '</button>' : '') +
    '</div><div class="foto-previa" id="rFotoPrevia">' + (f ? (src ? '<img src="' + esc(src) + '" alt="">' : '') + '<span class="foto-ok">' + svg(ICO.check, 13) + ' ' + esc(t('r_foto_pronta')) + '</span>' : '<span class="foto-vazia">' + esc(t('r_foto_nenhuma')) + '</span>') + '</div><div class="hint">' + esc(t('r_foto_hint')) + '</div></div>';
}
function lancarHTML() {
  const a = prodSel();
  let h = '<div class="card-rec"><div class="card-rec-tit">' + esc(t('rec_lancar')) + '<span>' + esc(t('rec_lancar_sub')) + '</span></div><div class="panel"><div class="form-grid"><div class="field" style="grid-column:1/-1"><label>' + esc(t('r_buscar')) + '</label><div class="campo-scan"><input id="rBusca" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="' + esc(t('r_buscar_ph')) + '" value="' + esc(RC.rBusca) + '"' + (a ? ' disabled' : '') + '><button type="button" class="scan-btn" data-scan="receb" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 18) + '</button></div></div></div>';
  h += '<div id="rBuscaRes">' + achadosHTML(a) + '</div>';
  if (!a) return h + '</div></div>';
  const corrAt = RC.corr != null ? RC.corr : String(a.corredor || '').toUpperCase(), orig = origemDoProduto(a), corrs = CORREDORES.concat(corrAt && CORREDORES.indexOf(corrAt) < 0 ? [corrAt] : []);
  h += '<div class="passo2"><div class="passo-tit">' + esc(t('r_passo2')) + '</div><div class="form-grid"><div class="field"><label>' + esc(t('r_qtd')) + '</label><input id="rQtd" type="number" inputmode="numeric" min="1" value="' + esc(String(RC.qtd == null ? 1 : RC.qtd)) + '"></div>' + distHTML(a) +
    '<div class="field"><label>' + esc(t('r_origem')) + '</label><select id="rOrigem" disabled class="campo-auto"><option value="">' + esc(t('r_origem_nenhuma')) + '</option>' + origensLista().map(o => '<option value="' + esc(o) + '"' + (orig === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select><div class="hint">' + esc(t('r_origem_auto')) + '</div></div>' +
    '<div class="field"><label>' + esc(t('r_corredor')) + '</label><select id="rCorredor"><option value="">' + esc(t('r_corredor_nenhum')) + '</option>' + corrs.map(o => '<option value="' + esc(o) + '"' + (corrAt === o ? ' selected' : '') + '>' + esc(corrFmt(o)) + '</option>').join('') + '</select></div>' +
    '<div class="field" style="grid-column:1/-1"><label>' + esc(t('r_rastreio')) + '</label><div class="campo-scan"><input id="rRastreio" autocomplete="off" placeholder="' + esc(t('r_rastreio_ph')) + '" value="' + esc(RC.rast) + '"><button type="button" class="scan-btn" data-scan="rastreio" title="' + esc(t('sc_abrir')) + '">' + svg(ICO.scan, 18) + '</button>' + (ultRast() ? '<button type="button" class="btn sm" data-act="rastreio-usar-anterior" title="' + esc(ultRast()) + '">' + esc(t('r_rastreio_usar_anterior')) + '</button>' : '') + '</div><div class="hint">' + esc(t('r_rastreio_opcional')) + '</div></div>' +
    fotoHTML() + '</div><div class="form-acoes"><button class="btn" data-act="receb-limpar">' + esc(t('r_limpar')) + '</button><button class="btn primary" data-act="receb-salvar">' + esc(t('r_registrar')) + '</button></div></div>';
  return h + '</div></div>';
}

/* ---------- 받은 줄 표 (옛 recDetTabelaHTML · recebTabelaHTML) ---------- */
function itemBate(x, txt, cod) {
  const p = E.prod(x.code) || {};
  if ([x.code, x.nome, p.descricao, x.barcode, x.corredor].join(' ').toLowerCase().indexOf(txt) >= 0) return true;
  return !!cod && E.normCod(x.code).indexOf(cod) >= 0;
}
function visiveis(L) {
  const txt = RC.busca.trim().toLowerCase(), cod = E.normCod(RC.busca);
  if (RC.caixa) L = L.filter(x => (String(x.rastreio || '').trim().toUpperCase() || '@sem') === RC.caixa);
  if (txt) L = L.filter(x => itemBate(x, txt, cod));
  if (RC.semEntrada) L = L.filter(x => !entrou(x));
  return L;
}
function tabelaRecHTML(c) {
  const todos = itens(c.id), L = visiveis(todos), cont = L.length === todos.length ? numFmt(todos.length) : numFmt(L.length) + ' ' + t('de') + ' ' + numFmt(todos.length);
  return '<div class="card-rec"><div class="tbl-topo"><div class="card-rec-tit" style="padding:0;border:0">' + esc(t('rec_itens')) + '<span id="recCont">' + esc(cont) + '</span></div>' +
    '<div class="tb-search rec-busca">' + svg(ICO.busca, 15) + '<input type="search" id="recBusca" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="' + esc(t('rec_busca_ph')) + '" value="' + esc(RC.busca) + '"></div>' + barraSelHTML() + '</div>' +
    '<div id="recRes">' + (L.length ? linhasHTML(L, c.id) : '<div class="empty">' + esc(t(RC.busca.trim() ? 'rec_busca_vazia' : 'r_sem')) + '</div>') + '</div></div>';
}
function linhasHTML(L, recId) {
  const todos = L.length > 0 && L.every(x => RC.sel[x.id]), ed = mexe(), n = ed ? 11 : 10;
  let r = '<div class="tbl-scroll"><table class="rec-itens"><thead><tr>' + (vd() ? '' : '<th class="chk"><input type="checkbox" data-act="rtodos" data-rec="' + esc(recId || '') + '"' + (todos ? ' checked' : '') + '></th>') + '<th class="rn" style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">#</th><th>' + esc(t('c_nome')) + '</th><th class="num">' + esc(t('qtd')) + '</th><th>' + esc(t('r_origem')) + '</th><th>' + esc(t('r_corredor')) + '</th><th>' + esc(t('r_transp')) + '</th><th>' + esc(t('r_rastreio')) + '</th><th>' + esc(t('responsavel')) + '</th><th>' + esc(t('data')) + '</th>' + (ed ? '<th></th>' : '') + '</tr></thead><tbody>';
  L.forEach((o, i) => {
    const u = urlRastreio(o.transportadora, o.rastreio), s = RC.expand === o.id;
    r += '<tr class="clic' + (s ? ' sel tr-aberta' : '') + (RC.sel[o.id] ? ' sel' : '') + '" data-receb-linha="' + esc(o.id) + '">' + (vd() ? '' : '<td class="chk"><input type="checkbox" data-rmarcar="' + esc(o.id) + '"' + (RC.sel[o.id] ? ' checked' : '') + '></td>') + '<td class="rn" style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">' + (i + 1) + '</td>' +
      '<td class="principal"><b>' + esc(o.code) + '</b>' + (!entrou(o) ? '<span class="tag-sem-ent" title="' + esc(t('rec_sem_ent_dica')) + '">' + esc(t('rec_sem_ent_tag')) + '</span>' : '') + '</td><td class="num" data-l="' + esc(t('qtd')) + '"><b>+' + o.qtd + '</b>' + pickChipHTML(o) + '</td><td data-l="' + esc(t('r_origem')) + '">' + esc(o.origem || '—') + '</td><td data-l="' + esc(t('r_corredor')) + '">' + esc(o.corredor || '—') + '</td><td data-l="' + esc(t('r_transp')) + '">' + esc(o.transportadora || '—') + '</td>' +
      '<td data-l="' + esc(t('r_rastreio')) + '" style="font-variant-numeric:tabular-nums">' + (u ? '<a class="rastreio" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(t('r_rastrear')) + '">' + esc(o.rastreio) + ' ' + svg(ICO.link, 12) + '</a>' : esc(o.rastreio || '—')) + '</td><td data-l="' + esc(t('responsavel')) + '">' + esc(o.usuarioNome || o.usuario || '') + '</td><td data-l="' + esc(t('data')) + '" style="color:var(--muted)">' + esc(dataBR(o.criadoEm)) + '</td>' +
      (ed ? '<td class="acoes" style="text-align:right;white-space:nowrap"><button class="btn sm" data-receb-edit="' + esc(o.id) + '">' + esc(t('editar')) + '</button></td>' : '') + '</tr>';
    if (s) r += expandHTML(o, n);
  });
  return r + '</tbody></table></div>';
}
function pickChipHTML(r) { const n = Number(r && r.pickingQtd) || 0; return n ? '<span class="pick-chip" title="' + esc(t('r_pick_hint')) + '">' + esc(t('r_pick_box', { n })) + '</span>' : ''; }
const nSel = () => Object.keys(RC.sel).length;
function barraSelHTML() {
  const n = nSel();
  return '<div class="bulkbar' + (n ? '' : ' bulkbar-calma') + '">' + (n ? '<span>' + n + ' ' + esc(t('selecionados')) + '</span>' : '<span>' + esc(t('rc_pdf_dica')) + '</span>') +
    '<button class="btn sm" data-act="receb-pdf">' + svg(ICO.print, 13) + ' ' + esc(n ? t('pdf_btn_sel') : t('pdf_btn_tudo')) + '</button>' +
    (n && mexe() ? '<button class="btn sm" data-act="receb-mover">' + svg(ICO.troca, 13) + ' ' + esc(t('mv_btn')) + '</button>' : '') +
    (n && mexe() ? '<button class="btn sm" data-act="receb-conferir">' + svg(ICO.busca, 13) + ' ' + esc(t('rc_enviar_btn')) + '</button>' : '') +
    (n ? '<button class="btn sm" style="margin-left:auto" data-act="receb-limpar-sel">' + esc(t('limpar_sel')) + '</button>' : '') + '</div>';
}

/* ---------- 줄을 펴면: 상품 카드 (옛 recebExpandHTML — 받은 기록 · 판매 · 움직임) ---------- */
let MOVS = {};
function expandHTML(o, cols) {
  const p = E.prod(o.code), recs = RB.filter(x => x.code === o.code), u = urlRastreio(o.transportadora, o.rastreio), c = recPorId(o.cargaId);
  let h = '<tr class="receb-expand-row"><td colspan="' + cols + '"><div class="receb-expand rx"><div class="rx-main">';
  h += '<div class="rx-card rx-cab"><div class="rx-cab-top"><h2>' + esc(o.code) + '</h2>' + (p ? '<span class="badge ' + (E.SIT_CLS[p.situacao] || 'ok') + '">' + esc(t(E.SIT_TXT[p.situacao] || 'st_ok')) + '</span>' : '') + '</div><div class="rx-chips"><span class="rx-chip forte">+' + numFmt(o.qtd) + ' ' + esc(t('rc_recebidos')) + '</span>' +
    (o.origem ? '<span class="rx-chip">' + esc(o.origem) + '</span>' : '') + (o.corredor ? '<span class="rx-chip">' + esc(corrFmt(o.corredor)) + '</span>' : '') + (o.transportadora ? '<span class="rx-chip">' + esc(o.transportadora) + '</span>' : '') +
    (o.rastreio ? (u ? '<a class="rx-chip rastreio" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(o.rastreio) + ' ' + svg(ICO.link, 12) + '</a>' : '<span class="rx-chip">' + esc(o.rastreio) + '</span>') : '') + '</div><div class="rx-nome">' + esc((p && p.descricao) || o.nome || '') + '</div></div>';
  if (p) h += '<div class="rx-card"><h3 class="rx-h3">' + esc(t('rx_visao')) + '</h3><div class="rx-vgs">' + rxCartao(ICO.prod, t('rx_estoque'), numFmt(p.qtd) + ' ' + t('un_curto'), t('rx_estoque_sub'), 'verde') + rxCartao(ICO.ajuste, t('c_min'), numFmt(minOf(o.code)) + ' ' + t('un_curto'), t('rx_min_sub'), 'azul') + rxCartao(ICO.pin, t('r_corredor'), p.corredor ? corrFmt(p.corredor) : '—', t('rx_corr_sub'), 'roxo') + rxCartao(ICO.rel, t('rx_ultimo'), recs[0] ? dataBR(recs[0].criadoEm) : '—', '', 'azul') + '</div></div>';
  h += '<div class="rx-card"><h3 class="rx-h3">' + esc(t('rx_vendas')) + '</h3>' + (ger() ? vendasHTML(o.code) : '<div class="aviso" style="margin:0">' + svg(ICO.ajuda, 14) + '<div>' + esc(t('rc_so_gerente')) + '</div></div>') + '</div>';
  h += '<div class="rx-card"><div class="rx-abas">' + [['rec', 'rx_ab_rec'], ['ven', 'rx_ab_ven'], ['mov', 'rx_ab_mov']].filter(a => a[0] !== 'ven' || ger()).map(a => '<button type="button" class="rx-aba' + (RC.rxAba === a[0] ? ' on' : '') + '" data-act="rx-aba" data-aba="' + a[0] + '">' + esc(t(a[1])) + '</button>').join('') + '</div>' + rxAbaHTML(o.code, recs) + '</div></div>';
  const foto = o.foto && FOTOS[o.foto];
  if (o.foto && !FOTOS[o.foto]) carregarFoto(o.foto);
  h += '<aside class="rx-lado"><div class="rx-card"><h3 class="rx-h3">' + esc(t('rx_det_tit')) + '</h3><div class="rx-det">' +
    [[t('rx_rec_num'), esc(o.cargaNumero || (c && c.numero) || '—')], [t('rx_aberto'), esc(dataBR(o.criadoEm)) + (o.usuarioNome ? ' · ' + esc(o.usuarioNome) : '')], [t('r_origem'), esc(o.origem || '—')], [t('r_transp'), esc(o.transportadora || '—')], [t('r_corredor'), esc(o.corredor ? corrFmt(o.corredor) : '—')], [t('qtd'), '+' + numFmt(o.qtd)],
      [t('r_dest_estoque'), o.estoqueConfirmado ? numFmt(o.estoqueQtd) + (o.estoqueEtiquetas && o.estoqueEtiquetas.length ? ' · ' + esc(o.estoqueEtiquetas.join(', ')) : '') : '<i class="rec-vazio">' + esc(t('rec_sem_ent_tag')) + '</i>'],
      [t('r_dest_picking'), o.pickingQtd == null ? '—' : numFmt(o.pickingQtd)], [t('rx_invoice'), c && c.temInvoice ? esc(c.invoiceNome || t('rx_tem_invoice')) : esc(t('rx_sem_invoice'))]].map(l => '<div class="rx-det-l"><span>' + esc(l[0]) + '</span><b>' + l[1] + '</b></div>').join('') + '</div>' +
    (foto ? '<a class="rx-foto" href="' + esc(foto) + '" target="_blank" rel="noopener"><img src="' + esc(foto) + '" alt=""></a>' : '') +
    (mexe() && !o.estoqueConfirmado && c && !cancelada(c) ? '<button type="button" class="btn primary cheio" style="margin-top:12px" data-act="rec-entrada" data-id="' + esc(o.id) + '">' + svg(ICO.entra, 15) + ' ' + esc(t('rc_dar_entrada')) + '</button>' : '') +
    (mexe() ? '<button type="button" class="btn cheio" style="margin-top:8px" data-receb-edit="' + esc(o.id) + '">' + svg(ICO.ajuste, 15) + ' ' + esc(t('r_editar_tit')) + '</button>' : '') + '</div></aside>';
  return h + '</div></td></tr>';
}
function rxCartao(ico, rot, val, s, cor) { return '<div class="rx-vg"><span class="rx-vg-ico ' + (cor || '') + '">' + svg(ico, 18) + '</span><div><span class="rx-vg-rot">' + esc(rot) + '</span><b class="rx-vg-val">' + esc(val) + '</b><span class="rx-vg-sub">' + esc(s) + '</span></div></div>'; }
/** 최근 12달 판매 — 인보이스 줄에서 (관리자 · 오너만, 옛 PODE_VENDAS) */
function serie(code, n) {
  const out = [], d = new Date(); for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1), ym = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); out.push({ ym, rotulo: x.toLocaleDateString(undefined, { month: 'short' }), completo: x.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), total: (VENDAS && VENDAS[code] && VENDAS[code][ym]) || 0 }); }
  return out;
}
let VENDAS_PEDIU = false;
async function carregarVendas() {
  if (VENDAS_PEDIU) return; VENDAS_PEDIU = true; const m = {};
  const d = new Date(), de = new Date(d.getFullYear(), d.getMonth() - 11, 1), from = de.getFullYear() + '-' + String(de.getMonth() + 1).padStart(2, '0') + '-01';
  try { (await invoicesBetween(S, from, today())).filter(x => x.st !== 'x').forEach(v => (v.lines || []).forEach(l => { const ym = String(v.d || '').slice(0, 7), c = String(l.c || '').toUpperCase(); m[c] = m[c] || {}; m[c][ym] = (m[c][ym] || 0) + (Number(l.q) || 0); })); } catch (e) {}
  VENDAS = m; render();
}
function vendasHTML(code) {
  if (!VENDAS) { carregarVendas(); return '<div class="placeholder">' + esc(t('carregando')) + '</div>'; }
  const s = serie(code, 3), tot = s.reduce((a, x) => a + x.total, 0); if (!tot) return '<div class="graf-vazio">' + esc(t('rc_sem3')) + '</div>';
  let mx = s[0], mn = s[0]; s.forEach(x => { if (x.total > mx.total) mx = x; if (x.total < mn.total) mn = x; });
  return '<div class="rx-vend">' + barrasHTML(s) + '<div class="rx-vend-nums">' + rxCartao(ICO.venda, t('rc_total3'), numFmt(tot) + ' ' + t('un_curto'), '', 'verde') + rxCartao(ICO.ajuste, t('rc_media3'), numFmt(Math.round(tot / s.length)) + ' ' + t('un_curto'), '', 'azul') + rxCartao(ICO.dir, t('rx_mais'), String(mx.rotulo).toUpperCase() + ' (' + numFmt(mx.total) + ')', '', 'verde') + rxCartao(ICO.down, t('rx_menos'), String(mn.rotulo).toUpperCase() + ' (' + numFmt(mn.total) + ')', '', 'vermelho') + '</div></div>';
}
function barrasHTML(s) {
  let mx = 0; s.forEach(m => { if (m.total > mx) mx = m.total; });
  let topo = 10, passo = 5; if (mx > 0) { const alvo = mx / 6, ex = Math.pow(10, Math.floor(Math.log(alvo) / Math.LN10)), n = alvo / ex; passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * ex; topo = Math.ceil(mx / passo) * passo; }
  const X0 = 38, X1 = 358, Y0 = 18, Y1 = 132, fx = (X1 - X0) / s.length; let g = '';
  for (let v = 0; v <= topo + 0.001; v += passo) { const y = Y1 - v / topo * (Y1 - Y0); g += '<line class="rx-grade' + (v === 0 ? ' base' : '') + '" x1="' + X0 + '" y1="' + y + '" x2="' + X1 + '" y2="' + y + '"/><text class="rx-esc" x="' + (X0 - 8) + '" y="' + (y + 3.5) + '">' + numFmt(v) + '</text>'; }
  return '<div class="rx-graf"><svg viewBox="0 0 366 158">' + g + s.map((m, i) => { const al = Math.max(2, Math.round(m.total / topo * (Y1 - Y0))), x = X0 + i * fx + fx * 0.26, w = fx * 0.48; return '<rect class="rx-b" x="' + x + '" y="' + (Y1 - al) + '" width="' + w + '" height="' + al + '" rx="3"/><text class="rx-b-v" x="' + (x + w / 2) + '" y="' + (Y1 - al - 6) + '">' + numFmt(m.total) + '</text><text class="rx-b-m" x="' + (x + w / 2) + '" y="150">' + esc(String(m.rotulo).toUpperCase()) + '</text>'; }).join('') + '</svg></div>';
}
function rxAbaHTML(code, recs) {
  const a = RC.rxAba === 'ven' && !ger() ? 'rec' : RC.rxAba;
  if (a === 'ven') {
    if (!VENDAS) { carregarVendas(); return '<div class="placeholder">' + esc(t('carregando')) + '</div>'; }
    const L = serie(code, 12).filter(m => m.total > 0); if (!L.length) return '<div class="graf-vazio">' + esc(t('rc_sem3')) + '</div>';
    return '<div class="tbl-scroll"><table><thead><tr><th>' + esc(t('rx_mes')) + '</th><th class="num">' + esc(t('qtd')) + '</th></tr></thead><tbody>' + L.map(m => '<tr><td>' + esc(m.completo) + '</td><td class="num"><b>' + numFmt(m.total) + '</b></td></tr>').join('') + '</tbody></table></div>';
  }
  if (a === 'mov') {
    const M = MOVS[code]; if (!M) { carregarMovs(code); return '<div class="placeholder">' + esc(t('carregando')) + '</div>'; }
    if (!M.length) return '<div class="graf-vazio">' + esc(t('sem_mov')) + '</div>';
    return '<div class="tbl-scroll"><table><thead><tr><th>' + esc(t('data')) + '</th><th>' + esc(t('tipo')) + '</th><th>' + esc(t('responsavel')) + '</th><th>' + esc(t('motivo')) + '</th><th class="num">' + esc(t('qtd')) + '</th></tr></thead><tbody>' +
      M.map(m => { const q = Number(m.delta) || 0; return '<tr><td>' + esc(dataBR(m.at)) + '</td><td><span class="mov-tag mov-tag-' + (q > 0 ? 'entrada' : 'saida') + '">' + esc(t(q > 0 ? 'mm_entrada' : 'mm_saida')) + '</span></td><td>' + esc(m.byName || m.by || '—') + '</td><td>' + esc(m.note || '—') + '</td><td class="num" style="color:' + (q > 0 ? 'var(--green)' : 'var(--red)') + '"><b>' + (q > 0 ? '+' : '') + numFmt(q) + '</b></td></tr>'; }).join('') + '</tbody></table></div>';
  }
  if (!recs.length) return '<div class="graf-vazio">' + esc(t('vazio')) + '</div>';
  return '<div class="tbl-scroll"><table><thead><tr><th>' + esc(t('data')) + '</th><th>' + esc(t('rx_rec_num')) + '</th><th class="num">' + esc(t('qtd')) + '</th><th>' + esc(t('r_origem')) + '</th><th>' + esc(t('r_transp')) + '</th><th>' + esc(t('responsavel')) + '</th></tr></thead><tbody>' +
    recs.map(x => '<tr><td>' + esc(dataBR(x.criadoEm)) + '</td><td><b>' + esc(x.cargaNumero || '—') + '</b></td><td class="num"><b>+' + numFmt(x.qtd) + '</b>' + pickChipHTML(x) + '</td><td>' + esc(x.origem || '—') + '</td><td>' + esc(x.transportadora || '—') + '</td><td>' + esc(x.usuarioNome || '—') + '</td></tr>').join('') + '</tbody></table></div>';
}
async function carregarMovs(code) { MOVS[code] = MOVS[code] || null; if (MOVS['@' + code]) return; MOVS['@' + code] = 1; let L = []; try { L = (await S.DB.list('stockLog', { where: [['code', '==', code]] })).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30); } catch (e) {} MOVS[code] = L; delete MOVS['@' + code]; render(); }
async function carregarFoto(id) { if (FOTOS[id] !== undefined) return; FOTOS[id] = ''; try { const d = await S.DB.get('recebFotos', id); FOTOS[id] = d && d.data || ''; } catch (e) {} if (FOTOS[id]) render(); }

/* ---------- 오른쪽 (옛 recDetLadoHTML) ---------- */
function ladoHTML(c, L) {
  const porCod = RC.aba !== 'chegada'; let linhas = '';
  if (porCod) {
    const g = agruparPorCodigo(L).slice().sort((x, y) => y.qtd - x.qtd);
    linhas = g.slice(0, 8).map(x => linhaResumo(x.codigo, t(x.n === 1 ? 'rec_um_lanc' : 'rec_n_lanc', { n: x.n }) + (x.corredor.length ? ' · ' + corrFmt(x.corredor[0]) : ''), numFmt(x.qtd))).join('');
    if (!g.length) linhas = '<div class="empty">' + esc(t('r_sem')) + '</div>'; else if (g.length > 8) linhas += '<div class="rec-ver">' + esc(t('rec_ver_codigos', { n: g.length })) + '</div>';
  } else { const u = L.slice(0, 8); linhas = u.length ? u.map(x => linhaResumo(x.code, horaCurta(x.criadoEm) + (x.corredor ? ' · ' + corrFmt(x.corredor) : ''), '+' + numFmt(x.qtd))).join('') : '<div class="empty">' + esc(t('r_sem')) + '</div>'; }
  let det = [[t('cg_numero'), esc(c.numero || t('cg_sem_numero'))], [t('cg_aberto_em'), esc(dataBR(c.criadoEm) + (c.criadoPorNome ? ' · ' + c.criadoPorNome : ''))], [t('r_origem'), esc(c.fornecedor || juntos(L, 'origem') || '—')], [t('r_transp'), esc(c.transportadora || juntos(L, 'transportadora') || '—')]];
  if (c.inboundNo) det.push(['🚢 ' + t('rc_inbound'), esc(c.inboundNo)]);
  if (fechada(c)) det.push([t('cg_fechado_por'), c.fechadoPorNome ? esc(c.fechadoPorNome + (c.fechadoEm ? ' · ' + dataBR(c.fechadoEm) : '')) : '<i class="rec-vazio">—</i>']);
  const p = caixasPend(c);
  det = det.concat([[t('rec_det_caixas'), caixasRec(c) + ' / ' + (Number(c.caixasEnviadas) || 0) + (p ? ' <span class="chip-a">' + esc(t('cx_faltam_n', { n: p })) + '</span>' : '')], [t('inv_campo'), c.temInvoice ? esc(c.invoiceNome || t('inv_abrir_tit')) : '<i class="rec-vazio">' + esc(t('inv_nenhuma')) + '</i>'], [t('cg_obs'), c.observacao ? esc(c.observacao) : '<i class="rec-vazio">—</i>']]);
  return '<div class="rec-pag-lado"><div class="card-rec"><div class="card-rec-tit">' + esc(t('rec_ja_entrou')) + '</div><div class="rec-abas"><button type="button" class="rec-aba' + (porCod ? ' on' : '') + '" data-act="rec-aba" data-aba="codigo">' + esc(t('rec_por_codigo')) + '</button><button type="button" class="rec-aba' + (porCod ? '' : ' on') + '" data-act="rec-aba" data-aba="chegada">' + esc(t('rec_por_chegada')) + '</button></div>' + linhas + '</div>' +
    '<div class="card-rec"><div class="card-rec-tit">' + esc(t('rec_detalhes')) + '</div><div class="rec-det">' + det.map(l => '<div class="rec-det-l"><span>' + esc(l[0]) + '</span><b>' + l[1] + '</b></div>').join('') + '</div></div></div>';
}
const linhaResumo = (tit, s, v) => '<div class="rec-lr"><div class="rec-lr-b">' + svg(ICO.check, 13) + '</div><div class="rec-lr-i"><b>' + esc(tit) + '</b><span>' + esc(s) + '</span></div><em>' + esc(v) + '</em></div>';
/** 코드별로 합침 (옛 agruparPorCodigo) */
function agruparPorCodigo(L) {
  const m = {}, o = [];
  L.forEach(r => { const cod = r.code || '—'; let g = m[cod]; if (!g) { g = m[cod] = { codigo: cod, qtd: 0, n: 0, cs: {}, os: {}, ts: {}, rs: {}, recs: {}, ultimo: r.criadoEm, ref: r }; o.push(g); }
    g.qtd += Number(r.qtd) || 0; g.n++; const cr = String(r.corredor || '').toUpperCase(); if (cr) g.cs[cr] = 1; if (r.origem) g.os[String(r.origem).trim()] = 1; if (r.transportadora) g.ts[String(r.transportadora).toUpperCase()] = 1; if (r.rastreio) g.rs[String(r.rastreio).toUpperCase()] = 1; if (r.cargaNumero) g.recs[r.cargaNumero] = 1; if (String(r.criadoEm) > String(g.ultimo)) g.ultimo = r.criadoEm; });
  o.forEach(g => { g.corredor = Object.keys(g.cs).sort(); g.origem = Object.keys(g.os).sort(); g.transp = Object.keys(g.ts).sort(); g.rastreio = Object.keys(g.rs).sort(); g.rec = Object.keys(g.recs).sort(); });
  return o.sort((a, b) => a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0);
}

/* ============================================================
 *  목록 (옛 recsKpisHTML · recsListaHTML · recLinhaHTML · recResumoHTML)
 * ============================================================ */
const temFiltro = () => !!(RC.consulta.trim() || RC.fOrigem || RC.fCorr || RC.fTransp || RC.fDe || RC.fAte);
function itensFiltrados() {
  const e = RC.consulta.trim().toLowerCase(), cod = E.normCod(RC.consulta);
  return RB.filter(x => {
    if (RC.fOrigem && String(x.origem || '') !== RC.fOrigem) return false;
    if (RC.fCorr && String(x.corredor || '').toUpperCase() !== RC.fCorr) return false;
    if (RC.fTransp && String(x.transportadora || '') !== RC.fTransp) return false;
    const d = String(x.criadoEm || '').slice(0, 10); if ((RC.fDe && d < RC.fDe) || (RC.fAte && d > RC.fAte)) return false;
    if (e && [x.code, x.nome, x.barcode, x.rastreio, x.cargaNumero, x.usuarioNome].join(' ').toLowerCase().indexOf(e) < 0 && !(cod && E.normCod(x.code).indexOf(cod) >= 0) && rastNorm(x.rastreio).indexOf(rastNorm(e)) < 0) return false;
    return true;
  });
}
function listaAtual() { const L = itensFiltrados(); return temFiltro() ? L : L.slice(0, 30); }
function recsFiltrados() {
  if (!temFiltro()) return CG.slice();
  const vistos = {}; itensFiltrados().forEach(x => { vistos[x.cargaId] = 1; });
  const q = RC.consulta.trim().toLowerCase();
  CG.forEach(c => {
    if (q && !RC.fOrigem && !RC.fCorr && !RC.fTransp && String(c.numero || '').toLowerCase().indexOf(q) >= 0) vistos[c.id] = 1;
    if (RC.fOrigem && !q && !RC.fCorr && String(c.fornecedor || '') === RC.fOrigem) { if (RC.fTransp && String(c.transportadora || '') !== RC.fTransp) return; const d = String(c.dataChegada || c.criadoEm || '').slice(0, 10); if ((RC.fDe && d < RC.fDe) || (RC.fAte && d > RC.fAte)) return; vistos[c.id] = 1; }
  });
  return CG.filter(c => vistos[c.id]);
}
function kpisHTML() {
  const corte = new Date(Date.now() - 2592e6).toISOString(), novos = CG.filter(c => String(c.criadoEm || '') >= corte && !cancelada(c)), its = novos.reduce((a, c) => a + itens(c.id).length, 0), pc = novos.reduce((a, c) => a + pecasDe(itens(c.id)), 0), ab = abertas().length;
  return '<div class="fin-kpis hist-kpis">' + finKpi(ICO.caixa, '', numFmt(novos.length), t('rl_kpi_recs'), t('rl_30d')) + finKpi(ICO.prod, '', numFmt(its), t('rl_kpi_itens'), t('rl_30d')) + finKpi(ICO.entra, 'g', numFmt(pc), t('rl_kpi_pecas'), t('rl_30d')) + finKpi(ICO.troca, ab ? 'a' : '', numFmt(ab), t('rl_kpi_abertos'), t('rl_kpi_abertos_sub')) + '</div>';
}
function telaLista() {
  const sel = (id, on, todos, ops, fmt) => '<select class="flt ' + (on ? 'on' : '') + '" id="' + id + '"><option value="">' + esc(todos) + '</option>' + ops.map(o => '<option value="' + esc(o) + '"' + (on === o ? ' selected' : '') + '>' + esc(fmt ? fmt(o) : o) + '</option>').join('') + '</select>';
  return '<input type="file" id="rInvoiceLinha" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" style="display:none">' +
    '<div class="page-head"><div><h1>' + esc(t('receb_titulo')) + '</h1><p>' + esc(t('receb_sub')) + '</p></div><div class="actions">' + (mexe() ? '<button class="btn primary" type="button" data-act="cg-nova">' + svg(ICO.mais, 14) + ' ' + esc(t('cg_nova')) + '</button>' : '') + '</div></div>' +
    kpisHTML() + recebBuscaHTML() + '<div class="page-head" style="margin-top:22px"><div><h1 style="font-size:16px">' + esc(t('r_recs')) + '</h1></div></div><div class="panel"><div class="toolbar">' +
    sel('rfOrigem', RC.fOrigem, t('r_todas_origens'), origensLista()) + sel('rfCorr', RC.fCorr, t('r_todos_corr'), CORREDORES, corrFmt) + sel('rfTransp', RC.fTransp, t('r_todas_transp'), TRANSPORTADORAS) +
    '<div class="filtro-data"><label>' + esc(t('r_de')) + '</label><input type="date" id="rfDe" value="' + esc(RC.fDe) + '"><label>' + esc(t('r_ate')) + '</label><input type="date" id="rfAte" value="' + esc(RC.fAte) + '"></div>' +
    (temFiltro() ? '<button class="btn sm" data-act="limpar-filtros-receb">' + svg(ICO.x, 13) + ' ' + esc(t('limpar_filtros')) + '</button>' : '') + '</div>' + barraSelHTML() + '<div id="rlRes">' + listaHTML() + '</div></div>';
}
function listaHTML() {
  const L = recsFiltrados(), pp = Number(RC.porPag) || 10, nPag = Math.ceil(L.length / pp) || 1;
  RC.pag2 = Math.max(1, Math.min(Number(RC.pag2) || 1, nPag));
  const de = (RC.pag2 - 1) * pp, pag = L.slice(de, de + pp);
  if (!L.length) return '<div class="empty" style="margin:16px">' + esc(t(temFiltro() ? 'r_nada_filtro' : 'r_sem')) + '</div>';
  const all = listaAtual(), todos = all.length > 0 && all.every(x => RC.sel[x.id]);
  return '<div class="tbl-scroll"><table class="rec-tbl"><thead><tr><th class="rn">#</th>' + (vd() ? '<th class="chk"></th>' : '<th class="chk"><input type="checkbox" data-act="rtodos"' + (todos ? ' checked' : '') + '></th>') + '<th></th><th>' + esc(t('rl_col_rec')) + '</th><th>' + esc(t('data')) + '</th><th>' + esc(t('rl_col_origem')) + '</th><th>' + esc(t('r_transp')) + '</th><th class="num">' + esc(t('cg_itens')) + '</th><th class="num">' + esc(t('cg_pecas')) + '</th><th class="num">' + esc(t('cx_caixas')) + '</th><th>' + esc(t('h_col_status')) + '</th><th class="rec-nums"></th><th class="num">' + esc(t('acoes')) + '</th></tr></thead><tbody>' +
    pag.map((c, i) => linhaRecHTML(c, de + i + 1)).join('') + '</tbody></table></div>' + paginacaoHTML(L.length, nPag, de, pag.length);
}
function linhaRecHTML(c, n) {
  const ab = RC.aberto === c.id, fc = fechada(c), L = temFiltro() ? itensFiltrados().filter(x => x.cargaId === c.id) : itens(c.id), Lt = itens(c.id), env = Number(c.caixasEnviadas) || 0, rec = caixasRec(c), pend = caixasPend(c);
  const st = '<span class="rec-st ' + (fc ? 'ok' : cancelada(c) ? 'cancel' : 'abre') + '">' + esc(t(fc ? 'cg_st_fechada' : cancelada(c) ? 'cg_st_cancelada' : 'cg_st_aberta')) + '</span>', chip = env ? '<span class="chip-fin ' + (pend ? 'a' : 'g') + '">' + rec + ' / ' + env + ' ' + esc(t('cx_caixas')) + '</span>' : '<span class="fin-vazio">—</span>';
  return '<tr class="rec-l' + (ab ? ' aberta' : '') + (fc || cancelada(c) ? '' : ' rec-aberta') + '" data-rec="' + esc(c.id) + '"><td class="rn">' + n + '</td>' +
    '<td class="chk">' + (vd() ? '' : '<input type="checkbox" data-rec-marcar="' + esc(c.id) + '"' + (Lt.length ? '' : ' disabled title="' + esc(t('rl_sem_itens_sel')) + '"') + (L.length && L.every(x => RC.sel[x.id]) ? ' checked' : '') + '>') + '</td>' +
    '<td class="rec-seta-td"><button type="button" class="rec-seta-bt" data-act="rec-abrir" data-rec="' + esc(c.id) + '" title="' + esc(t('rl_expandir')) + '">' + svg(ICO.dir, 13) + '</button></td>' +
    '<td class="principal">' + (Lt.length ? '<button type="button" class="rec-pdf-bt" data-act="cg-pdf" data-cg-id="' + esc(c.id) + '" title="' + esc(t('cg_pdf')) + '">' + svg(ICO.print, 13) + '</button>' : '<span class="rec-pdf-vazio"></span>') + '<button type="button" class="rec-link" data-act="rec-pagina" data-rec="' + esc(c.id) + '">' + esc(c.numero || t('cg_sem_numero')) + '</button>' + st.replace('class="rec-st ', 'class="rec-st rec-st-mob ') + '<button type="button" class="rec-seta-mob" data-act="rec-abrir" data-rec="' + esc(c.id) + '" title="' + esc(t('rl_expandir')) + '">' + svg(ICO.dir, 16) + '</button></td>' +
    '<td data-l="' + esc(t('data')) + '">' + esc(dataBR(c.dataChegada || c.criadoEm)) + '</td><td data-l="' + esc(t('r_origem')) + '">' + esc(c.fornecedor || juntos(Lt, 'origem') || '—') + '</td><td data-l="' + esc(t('r_transp')) + '">' + esc(c.transportadora || juntos(Lt, 'transportadora') || '—') + '</td>' +
    '<td class="num" data-l="' + esc(t('cg_itens')) + '">' + numFmt(Lt.length) + ' ' + esc(t('cg_itens')) + '</td><td class="num" data-l="' + esc(t('cg_pecas')) + '">' + numFmt(pecasDe(Lt)) + ' ' + esc(t('cg_pecas')) + '</td><td class="num" data-l="' + esc(t('cx_caixas')) + '">' + chip + '</td><td data-l="' + esc(t('h_col_status')) + '">' + st + '</td>' +
    '<td class="rec-nums">' + numFmt(Lt.length) + ' ' + esc(t('cg_itens')) + '<i>·</i>' + numFmt(pecasDe(Lt)) + ' ' + esc(t('cg_pecas')) + '<i>·</i>' + chip + '</td><td class="num acoes">' + acoesHTML(c) + '</td></tr>' +
    (ab ? '<tr class="rec-exp"><td colspan="13">' + resumoHTML(c) + '</td></tr>' : '');
}
function acoesHTML(c) {
  let h = invBotaoHTML(c); if (cancelada(c)) return h;
  if (fechada(c)) { if (ger()) h += '<button type="button" class="btn-acao reabrir" data-act="rec-reabrir" data-rec="' + esc(c.id) + '" title="' + esc(t('cg_reabrir_tit')) + '">' + svg(ICO.repetir, 14) + '</button>'; }
  else { if (mexe()) h += '<button type="button" class="btn-acao fechar" data-act="cg-fechar" data-cg-id="' + esc(c.id) + '" title="' + esc(t('cg_fechar')) + '">' + svg(ICO.check, 14) + '</button>'; if (ger()) h += '<button type="button" class="btn-acao perigo" data-act="rec-descartar" data-rec="' + esc(c.id) + '" title="' + esc(t(itens(c.id).length ? 'rec_cancelar' : 'rec_excluir')) + '">' + svg(ICO.x, 14) + '</button>'; }
  return h;
}
function resumoHTML(c) {
  const L = itens(c.id), cs = []; L.forEach(x => { const k = String(x.corredor || '').toUpperCase(); if (k && cs.indexOf(k) < 0) cs.push(k); });
  const topo = agruparPorCodigo(L).slice().sort((a, b) => b.qtd - a.qtd), tres = topo.slice(0, 3), resto = topo.length - tres.length, campo = (r, v) => '<div class="rec-exp-l"><span>' + esc(r) + '</span><b>' + esc(v) + '</b></div>';
  return '<div class="rec-exp-g"><div class="rec-exp-c"><div class="rec-exp-tit">' + svg(ICO.caixa, 15) + esc(t('rl_resumo')) + '<button type="button" class="btn sm" data-act="rec-pagina" data-rec="' + esc(c.id) + '">' + esc(t('rl_ver_tudo')) + '</button></div><div class="rec-exp-campos">' +
    campo(t('responsavel'), c.criadoPorNome || '—') + campo(t('r_corredor'), cs.length ? (cs.length > 2 ? t('rl_n_corredores', { n: cs.length }) : cs.map(corrFmt).join(', ')) : '—') + campo(t('cg_obs'), c.observacao || '—') + '</div></div>' +
    '<div class="rec-exp-c"><div class="rec-exp-tit">' + svg(ICO.prod, 15) + esc(t('rl_principais')) + (topo.length > 3 ? '<button type="button" class="rec-link" data-act="rec-pagina" data-rec="' + esc(c.id) + '">' + esc(t('rl_ver_todos', { n: topo.length })) + '</button>' : '') + '</div>' +
    (tres.length ? '<table class="rec-exp-tbl"><thead><tr><th>' + esc(t('h_col_familia')) + '</th><th>' + esc(t('f_desc')) + '</th><th class="num">' + esc(t('rl_qtde')) + '</th></tr></thead><tbody>' + tres.map(g => '<tr><td><b>' + esc(g.codigo) + '</b></td><td>' + esc((E.prod(g.codigo) || {}).descricao || g.ref.nome || '—') + '</td><td class="num"><b>+' + numFmt(g.qtd) + '</b></td></tr>').join('') + '</tbody></table>' + (resto > 0 ? '<div class="rec-exp-mais">' + esc(t('rl_mais_n', { n: resto })) + '</div>' : '') : '<div class="empty">' + esc(t('r_sem')) + '</div>') + '</div></div>';
}
function paginacaoHTML(total, nPag, de, n) {
  let b = '';
  if (nPag > 1) for (let i = 1; i <= nPag; i++) { if (i === 1 || i === nPag || Math.abs(i - RC.pag2) <= 1) b += i === RC.pag2 ? '<b>' + i + '</b>' : '<button type="button" data-act="rec-pag" data-pag="' + i + '">' + i + '</button>'; else if (Math.abs(i - RC.pag2) === 2) b += '<i>…</i>'; }
  return '<div class="hist-pag"><span>' + esc(t('rl_pag_de', { a: total ? de + 1 : 0, b: de + n, t: total })) + '</span>' + (nPag > 1 ? '<div class="bts"><button type="button" data-act="rec-pag" data-pag="' + Math.max(1, RC.pag2 - 1) + '"' + (RC.pag2 === 1 ? ' disabled' : '') + '>‹</button>' + b + '<button type="button" data-act="rec-pag" data-pag="' + Math.min(nPag, RC.pag2 + 1) + '"' + (RC.pag2 === nPag ? ' disabled' : '') + '>›</button></div>' : '') +
    '<select class="flt rec-porpag" id="recPorPag">' + POR_PAG.map(x => '<option value="' + x + '"' + (Number(RC.porPag) === x ? ' selected' : '') + '>' + esc(t('rl_por_pag', { n: x })) + '</option>').join('') + '</select></div>';
}

/* ============================================================
 *  ligar · clique
 * ============================================================ */
function ligar() {
  const raiz = document.querySelector('#page .sb.rc-raiz'); if (!raiz) return;
  raiz.onclick = clique;
  const rb = $('recBusca'); if (rb) rb.oninput = debounce(() => { RC.busca = rb.value; atualizarItensRec(); }, 200);
  const d = $('rBusca');
  if (d && !d.disabled) {
    d.oninput = () => { RC.rBusca = d.value; const r = $('rBuscaRes'); if (r) r.innerHTML = achadosHTML(null); };
    d.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const L = E.buscaProdutos(d.value); if (L.length) escolherProduto(L[0].id); else toast(t('r_nada_encontrado'), 'bad'); } };
  }
  ligarDist();
  document.querySelectorAll('#page .rc-raiz .receb-expand').forEach(x => { const sc = x.closest('.tbl-scroll'); if (sc && sc.clientWidth) x.style.width = (sc.clientWidth - 2) + 'px'; });   // 펼친 카드 = 보이는 칸 너비
  const ra = $('rRastreio'); if (ra) ra.oninput = () => { const l = rastNorm(ra.value); if (ra.value !== l) { const fim = ra.selectionStart === ra.value.length; ra.value = l; if (fim) ra.setSelectionRange(l.length, l.length); } RC.rast = ra.value; };
  const cr = $('rCorredor'); if (cr) cr.onchange = () => { RC.corr = cr.value; };
  ['rFoto', 'rFotoGaleria'].forEach(id => { const f = $(id); if (f) f.onchange = ev => { const a = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (a) fotoEnviar(a); }; });
  const inv = $('rInvoiceLinha'); if (inv) inv.onchange = ev => { const a = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (a && INV_ALVO) invEnviar(INV_ALVO, a); };
  const u = $('rConsulta'); if (u) u.oninput = debounce(() => { RC.consulta = u.value; RC.pag2 = 1; if (RC.pag !== 'lista') return Router.go('recebimento'); atualizarLista(); }, 300);
  [['rfOrigem', 'fOrigem'], ['rfCorr', 'fCorr'], ['rfTransp', 'fTransp'], ['rfDe', 'fDe'], ['rfAte', 'fAte']].forEach(x => { const el = $(x[0]); if (el) el.onchange = () => { RC[x[1]] = el.value; RC.pag2 = 1; render(); }; });
  const pp = $('recPorPag'); if (pp) { pp.onclick = e => e.stopPropagation(); pp.onchange = () => { RC.porPag = Number(pp.value) || 10; RC.pag2 = 1; RC.aberto = ''; render(); }; }
}
/** 검색할 때는 결과만 바꿈 (옛 atualizarItensRec — 칸은 그대로라 폰 키보드가 닫히지 않음) */
function atualizarItensRec() {
  const c = recPagina(), alvo = $('recRes'); if (!c || !alvo) return render();
  const m = document.createElement('div'); m.innerHTML = tabelaRecHTML(c);
  alvo.replaceWith(m.querySelector('#recRes')); const a = $('recCont'), b = m.querySelector('#recCont'); if (a && b) a.textContent = b.textContent;
}
function atualizarLista() { const alvo = $('rlRes'); if (!alvo) return render(); alvo.innerHTML = listaHTML(); }
/* ---------- 재고 / 피킹 나누기 (옛 ligarRecDist — 한쪽을 고치면 다른 쪽이 따라감) ---------- */
function distPintar() {
  const q = qtdAtual(), est = distEstoque(q), pick = q - est, e = $('rDestEstoque'), p = $('rDestPicking'), c = $('rDistConta'); if (!e || !p) return;
  if (document.activeElement !== e) e.value = est; if (document.activeElement !== p) p.value = pick; e.max = q; p.max = q;
  const cxE = e.closest('.r-dist-cx'), cxP = p.closest('.r-dist-cx');
  if (cxE && cxP) {
    const calcE = RC.distCampo === 'picking'; cxE.classList.toggle('calc', calcE); cxP.classList.toggle('calc', !calcE);
    const pe = cxE.querySelector('.r-dist-pe'), pp = cxP.querySelector('.r-dist-pe');
    if (pe) pe.innerHTML = calcE ? '<span class="r-dist-auto">' + esc(t('r_dist_auto')) + '</span>' : esc(t('r_dist_saldo') + ': ' + numFmt((Number((prodSel() || {}).qtd) || 0) + est));
    if (pp) pp.innerHTML = calcE ? esc(t('r_dist_nao_entra')) : '<span class="r-dist-auto">' + esc(t('r_dist_auto')) + '</span>';
  }
  if (c) c.textContent = t('r_dist_conta', { n: numFmt(est + pick), t: numFmt(q) });
}
function ligarDist() {
  const e = $('rDestEstoque'), p = $('rDestPicking'), q = $('rQtd'); if (!e || !p) return;
  const edita = (qual, campo) => () => { const tot = qtdAtual(), v = Math.max(0, Math.min(tot, Math.floor(Number(campo.value) || 0))); RC.distCampo = qual; if (qual === 'estoque') RC.distEst = v; else RC.distPick = v; if (String(v) !== String(campo.value)) campo.value = v; distPintar(); };
  e.oninput = edita('estoque', e); p.oninput = edita('picking', p);
  if (q) { q.oninput = () => { RC.qtd = q.value; distPintar(); }; q.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); receberSalvar(); } }; }
  distPintar();
}
function distZerar() { Object.assign(RC, { distCampo: '', distEst: 0, distPick: 0, qtd: 1, corr: null, rast: '' }); }
function escolherProduto(id) {
  distZerar(); RC.liberado = false; RC.prod = String(id); RC.rBusca = ''; render();
  const a = $('rQtd'); if (a) { a.focus(); try { a.select(); } catch (e) {} }
  const o = prodSel(); if (o) toast(t('sc_achado') + ' ' + o.nome, 'good');
}
function aoBipar(qual, code) {
  if (qual === 'rastreio') { RC.rast = rastNorm(code); const i = $('rRastreio'); if (i) i.value = RC.rast; return; }
  if (qual === 'consulta') { RC.consulta = code; RC.pag2 = 1; if (RC.pag !== 'lista') return Router.go('recebimento'); return render(); }
  const v = E.prodDoQr(code) || code, ex = E.buscaProdutos(v);
  if (ex.length) return escolherProduto(ex[0].id);
  toast(t('r_nada_encontrado') + ' ' + v, 'bad');
}
async function clique(e) {
  const c = s => e.target.closest(s); let b;
  if ((b = c('[data-rec-marcar]'))) { e.stopPropagation(); const id = b.dataset.recMarcar, L = temFiltro() ? itensFiltrados().filter(x => x.cargaId === id) : itens(id); L.forEach(x => { if (b.checked) RC.sel[x.id] = 1; else delete RC.sel[x.id]; }); return render(); }
  if ((b = c('[data-rmarcar]'))) { e.stopPropagation(); if (b.checked) RC.sel[b.dataset.rmarcar] = 1; else delete RC.sel[b.dataset.rmarcar]; return render(); }
  if ((b = c('[data-pick]'))) return escolherProduto(b.dataset.pick);
  if ((b = c('[data-cg-ir]'))) { RC.caixasForm = ''; return Router.go('recebimento', b.dataset.cgIr); }
  if ((b = c('[data-scan]'))) { const q = b.dataset.scan; return openScanner(code => aoBipar(q, code), { title: t('sc_abrir') }); }
  if ((b = c('[data-receb-edit]'))) { e.stopPropagation(); return modalEditar(b.dataset.recebEdit); }
  if ((b = c('[data-act]'))) {
    const a = b.dataset.act, id = b.dataset.cgId || b.dataset.rec;
    if (a === 'rtodos') { const L = b.dataset.rec ? visiveis(itens(b.dataset.rec)) : listaAtual(); L.forEach(x => { if (b.checked) RC.sel[x.id] = 1; else delete RC.sel[x.id]; }); return render(); }
    e.stopPropagation();
    switch (a) {
      case 'cg-nova': return mexe() ? recNovo() : negado();
      case 'cg-pdf': return pdfCarga(id);
      case 'cg-fechar': return recFechar(id);
      case 'cg-caixas': RC.caixasForm = id; return render();
      case 'cg-caixas-fechar': RC.caixasForm = ''; return render();
      case 'cg-caixas-salvar': { const v = parseInt(($('cxEnv') || {}).value, 10); return caixasGravar(id, isNaN(v) ? 0 : v, null); }
      case 'cg-caixas-corrigir': return caixasCorrigir(id);
      case 'cg-caixas-auto': { const v = parseInt(($('cxEnv') || {}).value, 10), cg = recPorId(id); return caixasGravar(id, isNaN(v) ? Number(cg && cg.caixasEnviadas) || 0 : v, null); }
      case 'inv-add': if (!ger()) return negado(); INV_ALVO = id; { const f = $('rInvoiceLinha'); if (f) f.click(); } return;
      case 'inv-ver': return invAbrir(id);
      case 'rec-lista': return Router.go('recebimento');
      case 'rec-pagina': return Router.go('recebimento', id);
      case 'rec-abrir': RC.aberto = RC.aberto === id ? '' : id; return render();
      case 'rec-pag': RC.pag2 = Number(b.dataset.pag) || 1; RC.aberto = ''; return render();
      case 'rec-caixa': RC.caixa = b.dataset.cx || ''; RC.sel = {}; return render();
      case 'rec-aba': RC.aba = b.dataset.aba || 'codigo'; return render();
      case 'rec-so-sem-entrada': RC.semEntrada = !RC.semEntrada; return render();
      case 'rec-descartar': return recDescartar(id);
      case 'rec-reabrir': return recReabrir(id);
      case 'rec-entrada': return entradaDaLinha(b.dataset.id);
      case 'rx-aba': RC.rxAba = b.dataset.aba; return render();
      case 'limpar-filtros-receb': Object.assign(RC, { consulta: '', fOrigem: '', fCorr: '', fTransp: '', fDe: '', fAte: '', sel: {}, pag2: 1 }); return render();
      case 'receb-limpar-sel': RC.sel = {}; return render();
      case 'receb-pdf': return pdfRecebimentos();
      case 'receb-mover': return moverAbrir();
      case 'receb-conferir': return conferir();
      case 'receb-trocar': RC.prod = ''; RC.rBusca = ''; distZerar(); render(); { const x = $('rBusca'); if (x) x.focus(); } return;
      case 'receb-limpar': RC.prod = ''; RC.rBusca = ''; RC.foto = ''; distZerar(); render(); { const x = $('rBusca'); if (x) x.focus(); } return;
      case 'receb-salvar': return receberSalvar();
      case 'rastreio-usar-anterior': { RC.rast = ultRast(); const i = $('rRastreio'); if (i) i.value = RC.rast; return; }
      case 'foto-escolher': { const f = $('rFoto'); if (f) f.click(); return; }
      case 'foto-galeria': { const f = $('rFotoGaleria'); if (f) f.click(); return; }
      case 'foto-anterior': RC.foto = ultFoto(); if (RC.foto) carregarFoto(RC.foto); toast(t('r_foto_reaproveitada'), 'good'); return render();
      case 'foto-limpar': RC.foto = ''; return render();
    }
    return;
  }
  if ((b = c('[data-receb-linha]'))) { if (c('a,button,input')) return; if (String(window.getSelection && window.getSelection())) return; RC.expand = RC.expand === b.dataset.recebLinha ? '' : b.dataset.recebLinha; render(); Router.refreshBack && Router.refreshBack(); }
}

/* ============================================================
 *  REC 만들기 · 닫기 · 다시 열기 · 버리기 · 상자 수 (옛 rpc_recebimento_novo · rpc_carga_status · rpc_carga_reabrir · rpc_carga_excluir · rpc_carga_caixas)
 * ============================================================ */
async function recNovo() {
  let ib = []; try { ib = (await S.DB.list('inbound')).filter(x => x.st === 'coming' || x.st === 'checking').filter(x => !(CG || []).some(c => c.inbound === x.id && !cancelada(c))); } catch (e) {}
  if (!ib.length) return recCriar(null);
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('cg_nova')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><button type="button" class="btn primary grande" style="width:100%;margin-bottom:12px" data-novo="">' + svg(ICO.mais, 15) + ' ' + esc(t('rc_novo_branco')) + '</button><div class="hint" style="margin:0 0 8px">' + esc(t('rc_novo_inbound')) + '</div><div class="mv-lista">' +
    ib.map(x => '<button type="button" class="mv-rec" data-novo="' + esc(x.id) + '"><b>🚢 ' + esc(x.no || x.id) + '</b><span>' + esc([x.factory, x.eta || x.d, numFmt(x.qty || 0) + ' ' + t('cg_pecas')].filter(Boolean).join('  ·  ')) + '</span>' + svg(ICO.dir, 15) + '</button>').join('') + '</div></div><div class="modal-foot"><button class="btn" style="margin-left:auto" data-act="fechar-modal">' + esc(t('cancelar')) + '</button></div>', 'rc-m');
  w.addEventListener('click', ev => { const b = ev.target.closest('[data-novo]'); if (!b) return; E.fecharModal(); recCriar(b.dataset.novo ? ib.find(x => x.id === b.dataset.novo) : null); });
}
async function recCriar(ib) {
  busy(true);
  try {
    const n = await S.DB.seq('rec', 'n', 1), numero = 'REC-' + String(n).padStart(6, '0'), id = newId('CG'), ts = now();
    const doc = { id, numero, fornecedor: ib ? (ib.fromCode ? supLabel(ib.fromCode) : ib.factory || '') : '', transportadora: '', rastreio: '', qtdPallets: 0, dataChegada: today(), status: 'recebida', observacao: '', criadoPor: S.user.email, criadoPorNome: quem(), criadoEm: ts, atualizadoEm: ts,
      caixasEnviadas: ib && Number(ib.boxes) ? Number(ib.boxes) : null, caixasRecebidas: 0, caixasManual: false, temInvoice: false, inbound: ib ? ib.id : '', inboundNo: ib ? ib.no || '' : '' };
    await S.DB.set('cargas', id, doc); CG.unshift(doc); indexar();
    toast(t('cg_criada') + ' ' + numero, 'good'); RC.caixasForm = id; busy(false); Router.go('recebimento', id);
  } catch (e) { busy(false); toast(String(e.message || e), 'bad'); }
}
async function caixasGravar(id, env, rec) {
  const c = recPorId(id); if (!c || !mexe()) return;
  if (fechada(c) || cancelada(c)) return toast(L3(c.numero + ' 은 닫혔습니다. 다시 연 뒤 상자를 고치세요.', c.numero + ' is closed. Reopen it before changing the boxes.', 'O recebimento está ' + c.status + '. Reabra antes de mudar as caixas.'), 'bad');
  if (env < 0 || (rec != null && rec < 0) || env > 9999 || (rec != null && rec > 9999)) return toast(L3('상자 수가 맞지 않습니다.', 'Invalid box count.', 'Quantidade de caixas inválida.'), 'bad');
  if (rec != null && !ger()) return negado();
  const patch = rec == null ? { caixasEnviadas: env || null, caixasManual: false, caixasRecebidas: caixasLidas(c), atualizadoEm: now() } : { caixasEnviadas: env || null, caixasManual: true, caixasRecebidas: rec, atualizadoEm: now() };
  try { await S.DB.update('cargas', id, patch); Object.assign(c, patch); } catch (e) { return toast(String(e.message || e), 'bad'); }
  if (env && caixasRec(c) > env) toast(t('cx_mais_que_enviadas'), 'bad');
  RC.caixasForm = ''; render();
}
async function caixasCorrigir(id) {
  if (!ger()) return negado(); const c = recPorId(id); if (!c) return;
  const v = parseInt(($('cxEnv') || {}).value, 10), env = isNaN(v) ? Number(c.caixasEnviadas) || 0 : v;
  const r = await E.pergunta({ cls: 'rc-m', campo: true, titulo: t('cx_corrigir_tit'), texto: t('cx_corrigir_txt', { n: caixasLidas(c) }), campoPh: t('cx_corrigir_ph'), sim: t('continuar'), nao: t('cancelar') }); if (!r) return;
  const n = parseInt(r.campo, 10); if (isNaN(n) || n < 0 || n > 9999) return toast(t('cx_corrigir_inv'), 'bad');
  const r2 = await E.pergunta({ cls: 'rc-m', perigo: true, titulo: t('cx_corrigir_tit'), texto: t('cx_recebidas') + ': ' + n, sim: t('salvar'), nao: t('cancelar') }); if (!r2) return;
  caixasGravar(id, env, n);
}
async function recFechar(id) {
  const c = recPorId(id); if (!c || !mexe()) return;
  const p = caixasPend(c); if (p) return toast(t('cg_travado_txt', { n: p, e: c.caixasEnviadas }), 'bad');
  const r = await E.pergunta({ cls: 'rc-m', titulo: t('cg_fechar_tit'), texto: t('cg_fechar_txt', { n: c.numero, i: itens(c.id).length }), sim: t('cg_fechar'), nao: t('cancelar') }); if (!r) return;
  busy(true);
  try {
    const ts = now(), patch = { status: 'fechada', atualizadoEm: ts, fechadoPor: S.user.email, fechadoPorNome: quem(), fechadoEm: ts };
    const pk = await pickingAuto(c), ops = [{ op: 'update', col: 'cargas', id, data: patch }].concat(pk.ops);
    await S.DB.batch(ops); Object.assign(c, patch); pk.ops.forEach(o => { const x = recebPorId(o.id); if (x) Object.assign(x, o.data); });
    toast(t('cg_fechado', { n: c.numero }), 'good');
    if (pk.linhas) toast(t('cg_fechado_picking', { n: numFmt(pk.linhas), q: numFmt(pk.pecas) }), 'good');
    RC.sel = {}; busy(false);
    if (RC.pag !== 'lista') return Router.go('recebimento');
    render();
  } catch (e) { busy(false); toast(String(e.message || e), 'bad'); }
}
/** 닫을 때: 받았는데 재고로 안 들어간 것 = 피킹 박스로 (옛 rec_picking_auto_calc 를 이 REC 안에서만 —
 *  REC 를 연 뒤 같은 상품이 다른 길(📦 재고 입고 등)로 들어온 수만큼은 재고로 들어간 것으로 봄) */
async function pickingAuto(c) {
  const L = itens(c.id).filter(x => !x.estoqueConfirmado && (Number(x.pickingQtd) || 0) < (Number(x.qtd) || 0)), ops = []; let linhas = 0, pecas = 0;
  const porCod = {}; L.forEach(x => { (porCod[x.code] = porCod[x.code] || []).push(x); });
  for (const code of Object.keys(porCod)) {
    let outros = 0; try { outros = (await S.DB.list('stockLog', { where: [['code', '==', code]] })).filter(m => Number(m.delta) > 0 && m.kind === 'recv' && m.origem !== 'recebimento' && !m.estornadoPor && String(m.at) >= String(c.criadoEm)).reduce((a, m) => a + Number(m.delta), 0); } catch (e) {}
    porCod[code].slice().sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm))).forEach(x => {
      const pk = Number(x.pickingQtd) || 0; let need = (Number(x.qtd) || 0) - pk; const take = Math.min(outros, need); outros -= take; need -= take;
      if (need > 0) { ops.push({ op: 'update', col: 'recebimentos', id: x.id, data: { pickingQtd: pk + need, pickingAuto: true } }); linhas++; pecas += need; }
    });
  }
  return { ops, linhas, pecas };
}
async function recReabrir(id) {
  if (!ger()) return negado(); const c = recPorId(id); if (!c) return;
  if (!fechada(c)) return toast(L3(c.numero + ' 은 닫혀 있지 않습니다.', c.numero + ' is not closed.', 'O ' + c.numero + ' não está fechado — não há o que reabrir.'), 'bad');
  const r = await E.pergunta({ cls: 'rc-m', perigo: true, titulo: t('cg_reabrir_tit'), texto: t('cg_reabrir_txt', { n: c.numero || '' }), sim: t('cg_reabrir'), nao: t('cancelar') }); if (!r) return;
  const patch = { status: 'recebida', atualizadoEm: now(), fechadoPor: '', fechadoPorNome: '', fechadoEm: '', reabertoPor: S.user.email, reabertoEm: now() };
  try { await S.DB.update('cargas', id, patch); Object.assign(c, patch); toast(t('cg_reaberto', { n: c.numero || '' }), 'good'); } catch (e) { return toast(String(e.message || e), 'bad'); }
  render();
}
async function recDescartar(id) {
  if (!ger()) return negado(); const c = recPorId(id); if (!c) return;
  const n = itens(id).length, num = c.numero || t('cg_sem_numero');
  if (fechada(c)) return toast(L3(num + ' 은 이미 닫혔습니다.', num + ' is already closed.', 'O ' + num + ' já está fechado. Um recebimento fechado não pode mais ser excluído.'), 'bad');
  const r = await E.pergunta({ cls: 'rc-m', perigo: true, titulo: t(n ? 'rec_cancelar_tit' : 'rec_excluir_tit', { n: num }), texto: n ? t('rec_cancelar_txt', { i: numFmt(n) }) : t('rec_excluir_txt'), sim: t(n ? 'rec_cancelar' : 'rec_excluir'), nao: t('cancelar') }); if (!r) return;
  try {
    if (!n) { await S.DB.del('cargas', id); CG = CG.filter(x => x.id !== id); toast(t('rec_excluido', { n: num }), 'good'); }
    else { const patch = { status: 'cancelada', atualizadoEm: now(), canceladoPor: S.user.email, canceladoEm: now() }; await S.DB.update('cargas', id, patch); Object.assign(c, patch); toast(t('rec_cancelado', { n: num }), 'good'); }
  } catch (e) { return toast(String(e.message || e), 'bad'); }
  RC.sel = {}; if (RC.pag !== 'lista') return Router.go('recebimento'); render();
}

/* ---------- 인보이스 (옛 rpc_carga_invoice — 관리자 · 오너만 · 파일은 cargaInvoice 문서에) ---------- */
let INV_ALVO = null;
function invEnviar(id, arq) {
  if (!ger()) return negado();
  if (arq.size > 700000) return toast(t('rc_inv_grande'), 'bad');
  const fr = new FileReader();
  fr.onload = async () => {
    busy(true);
    try {
      const ts = now(); await S.DB.set('cargaInvoice', id, { nome: arq.name || 'invoice', tipo: arq.type || '', data: fr.result, em: ts, por: S.user.email });
      const patch = { temInvoice: true, invoiceNome: arq.name || 'invoice', invoiceEm: ts, invoicePor: S.user.email }; await S.DB.update('cargas', id, patch); Object.assign(recPorId(id) || {}, patch);
      toast(t('inv_anexada'), 'good');
    } catch (e) { toast(String(e.message || e), 'bad'); }
    busy(false); render();
  };
  fr.onerror = () => toast(t('inv_erro'), 'bad'); fr.readAsDataURL(arq);
}
async function invAbrir(id) {
  if (!ger()) return negado();
  const r = await E.pergunta({ cls: 'rc-m', titulo: t('inv_abrir_tit'), texto: t('inv_abrir_txt'), sim: t('inv_abrir_sim'), nao: t('cancelar') }); if (!r) return;
  let d = null; try { d = await S.DB.get('cargaInvoice', id); } catch (e) {}
  if (!d || !d.data) return toast(t('inv_sem'), 'bad');
  try { const bl = await (await fetch(d.data)).blob(); window.open(URL.createObjectURL(bl), '_blank', 'noopener'); } catch (e) { toast(t('inv_erro'), 'bad'); }
}

/* ---------- 사진 (catalog.shrinkImage — 작은 JPEG 를 recebFotos 문서에 · 다른 화면과 같이 저장소 없이) ---------- */
async function fotoEnviar(f) {
  if (/heic|heif/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '')) return toast(t('ia_erro_heic'), 'bad');
  toast(t('r_foto_enviando'));
  try { const d = await shrinkImage(f, 900, 120000), id = newId('FT'); await S.DB.set('recebFotos', id, { data: d, em: now(), por: S.user.email }); FOTOS[id] = d; RC.foto = id; ultFotoSalvar(id); toast(t('r_foto_ok'), 'good'); }
  catch (e) { toast(t('r_foto_erro'), 'bad'); }
  render();
}

/* ============================================================
 *  상품 넣기 (옛 receberSalvar · rpc_receber · rpc_receb_picking · perguntarEtiquetaExistente · rpc_entrada_com_etiqueta)
 * ============================================================ */
async function receberSalvar(confirmar) {
  const c = recPagina(), a = prodSel(); if (!c) return;
  if (!a) return toast(t('r_sem_produto'), 'bad');
  if (fechada(c) || cancelada(c)) return toast(L3('닫힌 REC 입니다. 다시 연 뒤 넣으세요.', 'This REC is closed. Reopen it before adding products.', 'O recebimento está ' + c.status + '. Reabra antes de lançar produtos.'), 'bad');
  if (!String(a.barcode || '').trim()) return pedirBarcode(a, () => receberSalvar(confirmar));
  if (a.situacao === 'empty' && RC.vazioOk !== a.id) {
    const r = await E.pergunta({ cls: 'rc-m', perigo: true, titulo: t('r_alerta_vazio_tit'), texto: (a.nome || '') + ' — ' + t('r_alerta_vazio_txt'), sim: t('r_alerta_vazio_ok'), nao: t('cancelar') }); if (!r) return;
    RC.vazioOk = a.id;
  }
  const o = qtdAtual(); if (o <= 0) return toast(t('r_qtd_inv'), 'bad');
  const est = Math.max(0, Math.min(o, distEstoque(o))), pick = o - est;
  if (est + pick !== o) return toast(t('r_dist_nao_fecha', { n: numFmt(Math.abs(o - est - pick)) }), 'bad');
  const rast = rastNorm($('rRastreio') ? $('rRastreio').value : RC.rast);
  if (rastreioBloqueia(rast) && !RC.liberado) {
    /* 옛 앱은 허가 코드(비밀)를 물었음 — 새 앱은 관리자 · 오너가 확인 */
    if (!ger()) return toast(t('r_rastreio_bloq_txt') + ' ' + t('rc_lib_ger'), 'bad');
    const r = await E.pergunta({ cls: 'rc-m', perigo: true, titulo: t('r_rastreio_invalido_tit'), texto: t('r_rastreio_bloq_txt'), sim: t('r_rastreio_liberar'), nao: t('cancelar') }); if (!r) return;
    RC.liberado = true;
  }
  const orig = $('rOrigem') ? $('rOrigem').value : origemDoProduto(a), corr = $('rCorredor') ? $('rCorredor').value : (RC.corr || a.corredor || '');
  if (!confirmar) { const u = itens(c.id).find(x => x.code === a.id); if (u) return modalDup(u, a); }
  const id = newId('RB'), ts = now();
  const doc = { id, cargaId: c.id, cargaNumero: c.numero, code: a.id, nome: a.descricao || a.nome, qtd: o, barcode: a.barcode || '', origem: orig || '', corredor: String(corr || '').toUpperCase(), transportadora: transpDoRecebimento(rast), rastreio: rast, usuario: S.user.email, usuarioNome: quem(), criadoEm: ts, foto: RC.foto || '',
    estoqueConfirmado: false, estoqueQtd: 0, estoqueConfirmadoEm: '', estoqueConfirmadoPor: '', estoqueConfirmadoPorNome: '', estoqueEtiquetas: [], pickingQtd: pick > 0 ? pick : null };
  busy(true);
  try {
    const ops = [{ op: 'set', col: 'recebimentos', id, data: doc }];
    if (!c.caixasManual) ops.push({ op: 'update', col: 'cargas', id: c.id, data: { atualizadoEm: ts, caixasRecebidas: new Set(itens(c.id).map(x => rastNorm(x.rastreio)).concat([rast]).filter(Boolean)).size } });
    await S.DB.batch(ops);
    if (corr && String(corr).toUpperCase() !== String(a.corredor || '').toUpperCase()) { try { await E.definirCorredor([a.id], String(corr).toUpperCase()); } catch (e) {} }   // 옛 rpc_receber 가 produtos.corredor 를 고침
  } catch (e) { busy(false); return toast(String(e.message || e), 'bad'); }
  busy(false);
  RB.unshift(doc); indexar(); ultRastSalvar(rast); if (RC.foto) ultFotoSalvar(RC.foto);
  Object.assign(RC, { liberado: false, foto: '', prod: '', rBusca: '' }); distZerar();
  toast(t('r_ok_dist', { e: numFmt(est), p: numFmt(pick) }), 'good');
  render();
  if (est > 0) await entrarEstoque(doc, est);
}
/** 옛 pedirBarcode — 바코드 없는 상품: 여기서 바로 넣고 계속 (카탈로그 b 칸) */
async function pedirBarcode(p, depois) {
  const r = await E.pergunta({ cls: 'rc-m', campo: true, titulo: t('bc_pedir_tit'), texto: (p.nome || '') + ' — ' + t('bc_pedir_txt'), campoPh: t('bc_pedir_ph'), sim: t('bc_pedir_ok'), nao: t('cancelar') }); if (!r) return;
  const cod = String(r.campo || '').trim(); if (!cod) return toast(t('bc_pedir_vazio'), 'bad');
  const dup = (await E.produtos()).find(x => x.barcode === cod && x.id !== p.id); if (dup) return toast(L3('바코드 ' + cod + ' 는 이미 ' + dup.id + ' 에 있습니다.', 'Barcode ' + cod + ' already belongs to ' + dup.id + '.', 'O código ' + cod + ' já é do produto ' + dup.id + '.'), 'bad');
  busy(true);
  try { await editCatalog(S, rows => { const rw = rows.find(x => x[0] === p.id); if (rw) rw[4] = cod; return 1; }); p.barcode = cod; toast(t('bc_pedir_gravado') + ' ' + cod, 'good'); } catch (e) { busy(false); return toast(String(e.message || e), 'bad'); }
  busy(false); depois();
}
function modalDup(u, a) {
  const hrs = Math.round((Date.now() - new Date(u.criadoEm).getTime()) / 36e5 * 10) / 10;
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('receb_dup_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="cs-perg"><div class="cs-perg-txt">' + svg(ICO.ajuda, 18) + ' <b>' + esc(a.nome || '') + '</b></div><div style="font-size:13.6px;color:#7a4a00">' + esc(t('receb_dup_txt')) + '</div></div>' +
    '<div class="etq-info" style="padding:0"><div class="bloco"><span>' + esc(t('receb_dup_qtd')) + '</span><b>+' + esc(String(u.qtd)) + '</b></div><div class="bloco txt"><span>' + esc(t('receb_dup_quando')) + '</span><b>' + esc(dataBR(u.criadoEm)) + '</b></div><div class="bloco txt"><span>' + esc(t('receb_dup_quem')) + '</span><b>' + esc(u.usuarioNome || '—') + '</b></div><div class="bloco"><span>' + esc(t('receb_dup_ha')) + '</span><b>' + esc(String(hrs)) + esc(t('receb_dup_horas')) + '</b></div></div></div>' +
    '<div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('receb_dup_nao')) + '</button><button class="btn perigo" id="rcDupSim">' + esc(t('receb_dup_sim')) + '</button></div>', 'rc-m');
  w.querySelector('#rcDupSim').onclick = () => { E.fecharModal(); receberSalvar(true); };
}
/** 줄 → 재고 (옛 perguntarEtiquetaExistente → modalEscolherEtiqueta → rpc_entrada_com_etiqueta / rpc_entrada_etiqueta_existente) */
async function entrarEstoque(x, q) {
  let d = null; try { if (S.DB.fresh) S.DB.fresh('recebimentos'); d = await S.DB.get('recebimentos', x.id); } catch (e) {}
  if (d && d.estoqueConfirmado) { toast(jaConfMsg(d), 'bad'); Object.assign(x, d); return render(); }   // 상자를 고르기 전에도 한 번 (다른 기기에서 이미 넣었으면)
  let L = []; try { L = (await E.listarEtiquetas(x.code)).filter(e => e.ativa); } catch (e) {}
  if (!L.length) return confirmarEntrada(x.id, q, '', false);
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('ent_vincular_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p style="margin:0 0 14px;color:var(--muted)">' + esc(t('ent_vincular_sub')) + '</p><div class="achados">' +
    L.map(e => '<button type="button" class="achado" data-act="ent-vincular" data-cod="' + esc(e.codigo) + '"><b>' + esc(e.codigo) + '</b><span>' + esc(t('r_corredor')) + ': ' + esc(e.corredor ? corrFmt(e.corredor) : '—') + ' · ' + esc(t('etq_restante')) + ': ' + e.qtd_restante + '</span></button>').join('') +
    '</div><button type="button" class="btn primary grande" style="width:100%;margin-top:10px" data-act="ent-nova-etiqueta">' + esc(t('ent_nova_etiqueta')) + '</button></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button></div>', 'rc-m');
  w.addEventListener('click', ev => { const b = ev.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'ent-vincular') { E.fecharModal(); confirmarEntrada(x.id, q, b.dataset.cod, false); } else if (b.dataset.act === 'ent-nova-etiqueta') { E.fecharModal(); confirmarEntrada(x.id, q, '', false); } });
}
const jaConfMsg = d => t('ent_ja_conf', { quem: [d.estoqueConfirmadoPorNome || d.estoqueConfirmadoPor || '', d.estoqueConfirmadoEm ? dataBR(d.estoqueConfirmadoEm) + ' ' + horaCurta(d.estoqueConfirmadoEm) : ''].filter(Boolean).join(' · ') || t('ent_ja_conf_antigo'), qtd: numFmt(d.estoqueQtd || 0) });
/** 재고 넣기 — 한 번만 (옛 ja_confirmado): 이 줄을 다시 읽고, 라벨 · stock · stockLog · 이 줄 표시를 한 batch 로 */
export async function confirmarEntrada(recId, q, existente, confirmar) {
  if (!mexe()) return negado();
  let x = null; try { if (S.DB.fresh) S.DB.fresh('recebimentos'); x = await S.DB.get('recebimentos', recId); } catch (e) {}   // 기억해 둔 읽기(15초) 말고 지금 문서
  if (!x) return toast(L3('받은 줄을 찾지 못했습니다.', 'Receipt line not found.', 'Lançamento de recebimento não encontrado.'), 'bad');
  if (x.estoqueConfirmado) { toast(jaConfMsg(x), 'bad'); Object.assign(recebPorId(recId) || {}, x); return render(); }
  q = Math.floor(Number(q) || 0); if (q <= 0) return toast(t('r_qtd_inv'), 'bad');
  await E.produtos();
  let d;
  try {
    d = await E.entrada(x.code, q, { confirmar: !!confirmar, existente: existente || null, motivo: t('mov_entrou') + ' · ' + (x.cargaNumero || ''), origem: 'recebimento', ref: recId,
      marcar: cods => [{ op: 'update', col: 'recebimentos', id: recId, data: { estoqueConfirmado: true, estoqueQtd: q, estoqueConfirmadoEm: now(), estoqueConfirmadoPor: S.user.email, estoqueConfirmadoPorNome: quem(), estoqueEtiquetas: cods } }] });
  } catch (e) { return toast(String(e.message || e), 'bad'); }
  if (d.aviso === 'entrada_recente') {
    const r = await E.pergunta({ cls: 'rc-m', perigo: true, titulo: t('ent_dup_tit'), texto: t('ent_dup_txt'), sim: t('ent_dup_sim'), nao: t('ent_dup_nao') });
    if (r) return confirmarEntrada(recId, q, existente, true);
    return;
  }
  Object.assign(recebPorId(recId) || {}, { estoqueConfirmado: true, estoqueQtd: q, estoqueConfirmadoEm: now(), estoqueConfirmadoPor: S.user.email, estoqueConfirmadoPorNome: quem(), estoqueEtiquetas: d.codigos });
  delete MOVS[x.code]; render();
  const lista = d.existente ? [{ codigo: d.codigo, sku: d.sku, nome: d.nome, barcode: d.barcode, corredor: d.corredor, qtd_inicial: d.qtd_inicial, qtd_restante: d.qtd_restante }] : d.codigos.map(cd => ({ codigo: cd, sku: d.sku, nome: d.nome, barcode: d.barcode, corredor: d.corredor, qtd_inicial: d.qtd, qtd_restante: d.qtd, criado_em: d.criado_em }));
  E.escolherTamanho(lista, { saldo: d.saldo, qtd: q });
}
/** 아직 재고에 안 들어간 줄 → 재고 (받은 수 − 피킹 박스) */
function entradaDaLinha(id) {
  const x = recebPorId(id); if (!x) return;
  if (x.estoqueConfirmado) return toast(jaConfMsg(x), 'bad');
  const q = Math.max(0, (Number(x.qtd) || 0) - (Number(x.pickingQtd) || 0));
  if (!q) return toast(L3('피킹 박스로 다 갔습니다 — 재고에 넣을 수가 없습니다.', 'Everything went to the picking box — nothing to put into stock.', 'Tudo foi para a picking box — não há o que somar ao estoque.'), 'bad');
  entrarEstoque(x, q);
}

/* ---------- 줄 고치기 · 지우기 (옛 modalRecebimento · rpc_editar_recebimento · rpc_excluir_recebimento · rpc_receb_picking) ---------- */
function modalEditar(id) {
  if (!mexe()) return negado();
  const a = recebPorId(id); if (!a) return toast(t('r_nao_achado'), 'bad');
  const c = recPorId(a.cargaId), corr = String(a.corredor || '').toUpperCase(), corrs = CORREDORES.concat(corr && CORREDORES.indexOf(corr) < 0 ? [corr] : []);
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('r_editar_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="sel-prod" style="margin:0 0 12px">' + svg(ICO.prod, 18) + '<div><b>' + esc(a.code) + '</b><span>' + esc(dataBR(a.criadoEm)) + ' · ' + esc(a.usuarioNome || '') + (c ? ' · ' + esc(c.numero) : '') + '</span></div></div><div class="grid2">' +
    '<div class="field"><label>' + esc(t('r_qtd')) + '</label><input id="reQtd" type="number" inputmode="numeric" min="1" value="' + esc(String(a.qtd)) + '"></div>' +
    '<div class="field"><label>' + esc(t('r_origem')) + '</label><select id="reOrigem" disabled class="campo-auto"><option value="">' + esc(t('r_origem_nenhuma')) + '</option>' + origensLista().map(o => '<option value="' + esc(o) + '"' + ((a.origem || origemDoProduto(E.prod(a.code))) === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>' + esc(t('r_corredor')) + '</label><select id="reCorredor"><option value="">' + esc(t('r_corredor_nenhum')) + '</option>' + corrs.map(o => '<option value="' + esc(o) + '"' + (corr === o ? ' selected' : '') + '>' + esc(corrFmt(o)) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>' + esc(t('r_dest_picking')) + '</label><input id="rePicking" type="number" inputmode="numeric" min="0" max="' + esc(String(a.qtd)) + '" value="' + esc(a.pickingQtd == null ? '' : String(a.pickingQtd)) + '" placeholder="0"><div class="hint">' + esc(t('r_pick_hint')) + '</div></div>' +
    '<div class="field full"><label>' + esc(t('r_rastreio')) + '</label><input id="reRastreio" autocomplete="off" value="' + esc(a.rastreio || '') + '"></div></div></div>' +
    '<div class="modal-foot">' + (ger() ? '<button class="btn danger" id="reExcluir">' + esc(t('r_excluir')) + '</button>' : '') + '<button class="btn" style="margin-left:auto" data-act="fechar-modal">' + esc(t('cancelar')) + '</button><button class="btn primary" id="reSalvar">' + esc(t('salvar')) + '</button></div>', 'rc-m');
  w.querySelector('#reSalvar').onclick = () => salvarEdicao(a, w);
  const ex = w.querySelector('#reExcluir'); if (ex) ex.onclick = () => excluirLinha(a);
}
async function salvarEdicao(e, w) {
  const $w = id => w.querySelector('#' + id);   // 이 창 안의 칸만 읽음
  const q = Number($w('reQtd').value) || 0; if (q <= 0) return toast(t('r_qtd_inv'), 'bad');
  const orig = $w('reOrigem').value, corr = $w('reCorredor').value, rast = rastNorm($w('reRastreio').value), pkS = String($w('rePicking').value).trim(), pk = pkS === '' ? null : Number(pkS);
  if (pk != null && (!isFinite(pk) || pk < 0 || pk > q)) { $w('rePicking').focus(); return toast(t('r_dest_passou', { n: q }), 'bad'); }
  let sync = false;
  if (e.estoqueConfirmado && q !== Number(e.qtd)) {
    const n = q - Number(e.qtd), p = E.prod(e.code), saldo = p ? Number(p.qtd) || 0 : null;
    const r = await E.pergunta({ cls: 'rc-m', titulo: t('r_edit_tit', { id: e.id, produto: e.code }), texto: saldo == null ? t('r_edit_txt', { de: Number(e.qtd), para: q }) : t('r_edit_txt_saldo', { de: Number(e.qtd), para: q, mantem: saldo, fica: Math.max(saldo + n, 0) }),
      html: '<label class="rc-sync"><input type="checkbox" id="rcSync"> ' + esc(t(n > 0 ? 'r_edit_e_estoque_mais' : 'r_edit_e_estoque_menos', { qtd: Math.abs(n) })) + '</label>', ler: m => !!(m.querySelector('#rcSync') || {}).checked, sim: t('salvar'), nao: t('cancelar') });
    if (!r) return; sync = !!r.extra;
  }
  E.fecharModal(); busy(true);
  try {
    const patch = { qtd: q, origem: orig, corredor: String(corr || '').toUpperCase(), transportadora: transpDoRecebimento(rast), rastreio: rast, pickingQtd: pk };
    if (sync) { const d = q - Number(e.qtd); await acertarEtiqueta(e, d, 'Ajuste por edição do recebimento ' + (e.cargaNumero || '')); patch.estoqueQtd = Math.max((Number(e.estoqueQtd) || 0) + d, 0); }
    await S.DB.update('recebimentos', e.id, patch); Object.assign(e, patch); indexar();
    toast(sync ? t('r_editado_estoque') + ' ' + numFmt((E.prod(e.code) || {}).qtd) : t('r_editado'), 'good');
  } catch (x) { toast(String(x.message || x), 'bad'); }
  busy(false); render();
}
/** 재고까지 맞춤 — 이 줄이 만든 라벨이 하나이고 아직 살아 있을 때만 (옛 C5 · C6 규칙: 안 되면 쓰기 전에 거절) */
async function acertarEtiqueta(e, d, motivo) {
  const cods = e.estoqueEtiquetas || [];
  if (!cods.length) throw new Error(L3('이 줄이 만든 라벨을 모릅니다 — 📦 재고에서 라벨로 고치세요.', 'This line does not know which label it created — fix it through the label in Stock.', 'Este recebimento não guarda qual etiqueta ele gerou. Acerte a quantidade pela própria etiqueta, na aba Estoque.'));
  if (cods.length > 1) throw new Error(L3('라벨이 ' + cods.length + ' 장입니다 — 상자마다 고치세요.', 'This line created ' + cods.length + ' labels — fix box by box.', 'Este recebimento gerou ' + cods.length + ' etiquetas, uma por caixa. Acerte caixa a caixa pela etiqueta, na aba Estoque.'));
  const cod = cods[0], etq = await S.DB.get('etiquetas', cod);
  if (!etq) throw new Error(L3('라벨 ' + cod + ' 이 없습니다.', 'Label ' + cod + ' no longer exists.', 'A etiqueta ' + cod + ' deste recebimento não existe mais. Acerte o saldo por um ajuste de estoque com motivo.'));
  if (!etq.ativa) throw new Error(L3('라벨 ' + cod + ' 은 닫혔습니다 (상자가 나감).', 'Label ' + cod + ' is closed — the box left the shelf.', 'A etiqueta ' + cod + ' já foi encerrada — essa caixa saiu da prateleira. Acerte o saldo por um ajuste de estoque com motivo, à vista.'));
  const rest = Number(etq.qtdRestante) || 0, ini = Number(etq.qtdInicial) || 0;
  if (rest + d < 0 || ini + d < 0) throw new Error(L3('라벨 ' + cod + ' 에 ' + rest + ' 개뿐입니다.', 'Label ' + cod + ' only has ' + rest + '.', 'A etiqueta ' + cod + ' tem ' + rest + ' un e a correção pede tirar ' + Math.abs(d) + ' — o resto já saiu da caixa. Acerte o saldo por um ajuste de estoque com motivo.'));
  await E.produtos();
  await E.editarQtd(cod, rest + d, motivo, 'Receiving Correction');
  if (rest + d > 0) await S.DB.update('etiquetas', cod, { qtdInicial: ini + d });
}
async function excluirLinha(e) {
  if (!ger()) return negado();
  let sync = false;
  if (e.estoqueConfirmado) {
    const q = Number(e.estoqueQtd == null ? e.qtd : e.estoqueQtd) || 0, p = E.prod(e.code), saldo = p ? Number(p.qtd) || 0 : null;
    const r = await E.pergunta({ cls: 'rc-m', perigo: true, titulo: t('r_excl_tit', { id: e.id, produto: e.code }), texto: saldo == null ? t('r_excl_txt', { qtd: q }) : t('r_excl_txt_saldo', { qtd: q, mantem: saldo, fica: Math.max(saldo - q, 0) }),
      html: '<label class="rc-sync"><input type="checkbox" id="rcSync"> ' + esc(t('r_excl_e_estoque', { qtd: q })) + '</label>', ler: m => !!(m.querySelector('#rcSync') || {}).checked, sim: t('r_excluir'), nao: t('cancelar') });
    if (!r) return; sync = !!r.extra;
  } else { const r = await E.pergunta({ cls: 'rc-m', perigo: true, titulo: t('r_excluir'), texto: t('r_conf_excluir'), sim: t('r_excluir'), nao: t('cancelar') }); if (!r) return; }
  E.fecharModal(); busy(true);
  try {
    if (sync) await acertarEtiqueta(e, -(Number(e.estoqueQtd == null ? e.qtd : e.estoqueQtd) || 0), 'Estorno por exclusão do recebimento ' + (e.cargaNumero || ''));
    await S.DB.del('recebimentos', e.id); RB = RB.filter(x => x.id !== e.id); delete RC.sel[e.id]; if (RC.expand === e.id) RC.expand = ''; indexar();
    toast(sync ? t('r_excluido_estoque') + ' ' + numFmt((E.prod(e.code) || {}).qtd) : t('r_excluido'), 'good');
  } catch (x) { toast(String(x.message || x), 'bad'); }
  busy(false); render();
}

/* ---------- 다른 REC 로 옮기기 (옛 moverRecAbrir · rpc_recebimentos_mover — 열린 REC 만) ---------- */
function movAbertos() { const at = recPagina(); return (CG || []).filter(c => !fechada(c) && !cancelada(c) && !(at && c.id === at.id)); }
function movListaHTML() {
  const q = RC.mvBusca.trim().toLowerCase(), L = movAbertos().filter(c => !q || String(c.numero || '').toLowerCase().indexOf(q) >= 0);
  if (!L.length) return '<div class="mv-vazio">' + svg(ICO.caixa, 30) + '<b>' + esc(t(q ? 'r_nada_encontrado' : 'mv_vazio')) + '</b><span>' + esc(t(q ? 'mv_vazio_busca' : 'mv_vazio_sub')) + '</span></div>';
  return '<div class="mv-lista">' + L.map(c => '<button type="button" class="mv-rec" data-mv-destino="' + esc(c.id) + '"><b>' + esc(c.numero || t('cg_sem_numero')) + '</b><span>' + esc([c.dataChegada ? dataBR(c.dataChegada) : '', t('mv_tem_itens', { n: numFmt(itens(c.id).length) })].filter(Boolean).join('  ·  ')) + '</span>' + svg(ICO.dir, 15) + '</button>').join('') + '</div>';
}
function moverAbrir() {
  const ids = Object.keys(RC.sel); if (!ids.length) return toast(t('mv_sem_selecao'), 'bad'); if (!mexe()) return negado();
  RC.mvBusca = '';
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('mv_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><div class="aviso" style="margin:0 0 13px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('mv_sub', { n: numFmt(ids.length) })) + '</div></div>' +
    '<div class="campo-scan" style="margin-bottom:12px"><input id="mvBusca" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="' + esc(t('mv_busca')) + '" value=""></div><div id="mvLista">' + movListaHTML() + '</div><div class="hint" style="margin-top:11px">' + esc(t('mv_so_abertos')) + '</div></div>' +
    '<div class="modal-foot"><button class="btn" style="margin-left:auto" data-act="fechar-modal">' + esc(t('cancelar')) + '</button></div>', 'rc-m');
  const bi = w.querySelector('#mvBusca'); bi.oninput = () => { RC.mvBusca = bi.value; w.querySelector('#mvLista').innerHTML = movListaHTML(); }; setTimeout(() => { try { bi.focus(); } catch (e) {} }, 60);
  w.addEventListener('click', ev => { const b = ev.target.closest('[data-mv-destino]'); if (b) { E.fecharModal(); moverFazer(ids, b.dataset.mvDestino); } });
}
async function moverFazer(ids, destId) {
  const dest = recPorId(destId); if (!dest) return toast(L3('옮길 REC 가 없습니다.', 'Destination REC not found.', 'Recebimento de destino nao encontrado.'), 'bad');
  if (fechada(dest) || cancelada(dest)) return toast(L3(dest.numero + ' 은 닫혔습니다.', dest.numero + ' is closed.', 'O ' + dest.numero + ' ja esta fechado e nao recebe item novo.'), 'bad');
  const L = ids.map(recebPorId).filter(Boolean); if (!L.length) return toast(L3('고른 줄이 없습니다.', 'Nothing selected.', 'Nenhum lancamento selecionado.'), 'bad');
  const fech = L.filter(x => fechada(recPorId(x.cargaId)));
  if (fech.length) return toast(L3('닫힌 REC 의 줄이 ' + fech.length + ' 개 있습니다 — 다시 연 뒤 옮기세요.', fech.length + ' line(s) are in a closed REC — reopen it first.', 'Ha ' + fech.length + ' lancamento(s) em recebimento ja fechado (' + Array.from(new Set(fech.map(x => x.cargaNumero))).join(', ') + '). Reabra antes de mover.'), 'bad');
  const mover = L.filter(x => x.cargaId !== dest.id), ja = L.length - mover.length, de = Array.from(new Set(mover.map(x => x.cargaId))), ts = now();
  const ops = mover.map(x => ({ op: 'update', col: 'recebimentos', id: x.id, data: { cargaId: dest.id, cargaNumero: dest.numero, movidoDe: x.cargaNumero || '', movidoEm: ts, movidoPor: S.user.email } }));
  busy(true);
  try {
    await S.DB.batch(ops); mover.forEach(x => Object.assign(x, { cargaId: dest.id, cargaNumero: dest.numero })); indexar();
    const cx = de.concat([dest.id]).map(recPorId).filter(c => c && !c.caixasManual).map(c => ({ op: 'update', col: 'cargas', id: c.id, data: { caixasRecebidas: caixasLidas(c), atualizadoEm: ts } }));
    if (cx.length) await S.DB.batch(cx);
    toast(t('mv_ok', { n: numFmt(mover.length), rec: dest.numero }) + (ja ? '  ' + t('mv_ja', { n: numFmt(ja) }) : ''), 'good');
  } catch (e) { toast(String(e.message || e), 'bad'); }
  busy(false); RC.sel = {}; render();
}

/* ---------- 확인 요청 (옛 receb-conferir → rpc_solicitar_rechecagem · origem recebimento) ---------- */
function conferir() {
  if (!mexe()) return negado();
  const ref = {}; Object.keys(RC.sel).map(recebPorId).filter(Boolean).forEach(x => { if (!ref[x.code]) ref[x.code] = x.cargaId; });
  const codes = Object.keys(ref); if (!codes.length) return toast(t('rc_enviar_nenhum'), 'bad');
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('cs_recheca_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p style="margin:0 0 12px">' + esc(codes.join(', ')) + ' — ' + esc(t('cs_recheca_txt')) + '</p><div class="pm-rc-bts">' +
    [['saldo', 'cs_recheca_saldo'], ['misturado', 'cs_recheca_misturado'], ['nao_encontrado', 'cs_recheca_sumiu']].map(m => '<button type="button" class="btn primary" data-rc="' + m[0] + '">' + esc(t(m[1])) + '</button>').join('') + '</div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button></div>', 'rc-m');
  w.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-rc]'); if (!b) return; E.fecharModal(); busy(true); let n = 0;
    try { for (const c of codes) { await pedirRechecagem(c, b.dataset.rc, 'recebimento', ref[c]); n++; } } catch (x) { toast(String(x.message || x), 'bad'); }
    busy(false); RC.sel = {}; toast(n + ' ' + t('rc_enviar_btn').toLowerCase(), 'good'); render();
  });
}

/* ============================================================
 *  PDF (옛 pdfCarga · pdfRecebimentos — 영어 · 코드별로 합침)
 * ============================================================ */
const dataEN = v => { if (!v) return ''; const d = new Date(String(v).length === 10 ? v + 'T12:00:00' : v); return isNaN(d) ? String(v) : d.toLocaleDateString('en-US'); };
const juntarValores = (L, mx) => !L || !L.length ? '—' : L.slice(0, mx || 2).join(', ') + (L.length > (mx || 2) ? ' (+' + (L.length - (mx || 2)) + ')' : '');
function nomeProduto(r) { const cod = String(r.code || '').toUpperCase(), d = String((E.prod(r.code) || {}).descricao || r.nome || '').trim(); return d && d.toUpperCase() !== cod ? d : ''; }
function docTopo(tipo, metas) { return '<div class="doc-print"><div class="doc-topo"><div><div class="doc-marca">' + esc(te('marca_longa')) + '</div><div class="doc-tipo">' + esc(tipo) + '</div></div><div class="doc-meta">' + metas.map(m => '<div><span>' + esc(m[0]) + '</span><b>' + esc(m[1]) + '</b></div>').join('') + '</div></div>'; }
function pdfCarga(id) {
  const c = recPorId(id); if (!c) return; const L = itens(id); if (!L.length) return toast(te('pdf_vazio'), 'bad');
  const ag = new Date(), pecas = pecasDe(L);
  let h = docTopo(te('cg_pdf_titulo'), [[te('cg_numero'), c.numero], [te('pdf_data'), ag.toLocaleDateString('en-US') + ' ' + horaCurta(ag.toISOString())], [te('pdf_por'), quem()]]);
  const tps = new Set(), rs = []; if (c.transportadora) tps.add(String(c.transportadora).toUpperCase()); if (c.rastreio) rs.push(String(c.rastreio).toUpperCase());
  L.forEach(r => { if (r.transportadora) tps.add(String(r.transportadora).toUpperCase()); const x = String(r.rastreio || '').toUpperCase(); if (x && rs.indexOf(x) < 0) rs.push(x); });
  h += '<div class="doc-sub">' + esc(te('cg_fornecedor')) + ': <b>' + esc(c.fornecedor || '—') + '</b> · ' + esc(te('cg_data')) + ': ' + esc(dataEN(c.dataChegada)) + '</div>';
  h += '<div class="doc-rast"><div><span>' + esc(te('r_transp')) + '</span><b>' + esc(tps.size ? Array.from(tps).sort().join(' / ') : '—') + '</b></div><div class="doc-rast-cod"><span>' + esc(te('r_rastreio')) + (rs.length > 1 ? ' (' + rs.length + ')' : '') + '</span><b>' + esc(rs.length ? rs.slice(0, 4).join(', ') + (rs.length > 4 ? '  (+' + (rs.length - 4) + ')' : '') : te('pdf_sem_rastreio')) + '</b></div></div>';
  const env = Number(c.caixasEnviadas) || 0, rec = caixasRec(c), pend = Math.max(env - rec, 0);
  if (env || rec) { h += '<div class="doc-caixas"><div><span>' + esc(te('cx_enviadas_doc')) + '</span><b>' + (env || '—') + '</b></div><div><span>' + esc(te('cx_recebidas_doc')) + '</span><b>' + rec + '</b></div><div class="' + (pend ? 'pend' : '') + '"><span>' + esc(te('cx_pendentes_doc')) + '</span><b>' + pend + '</b></div></div>'; if (pend) h += '<div class="doc-aviso-cx">' + esc(te('cx_aviso_doc', { n: pend })) + '</div>'; }
  const G = agruparPorCodigo(L), un = te('un_curto');
  h += '<table class="doc-tbl"><thead><tr><th class="rn">#</th><th>' + esc(te('c_nome')) + '</th><th class="num" style="width:13%">' + esc(te('qtd')) + '</th><th class="meio" style="width:16%">' + esc(te('r_corredor')) + '</th><th style="width:16%">' + esc(te('data')) + '</th></tr></thead><tbody>' +
    G.map((g, i) => { const nm = nomeProduto(g.ref); return '<tr><td class="rn">' + (i + 1) + '</td><td>' + esc(g.codigo) + (nm ? '<br><small class="doc-nome">' + esc(nm) + '</small>' : '') + (g.n > 1 ? '<br><small>' + esc(te('pdf_lancamentos', { n: g.n })) + '</small>' : '') + '</td><td class="num">+' + numFmt(g.qtd) + ' ' + esc(un) + '</td><td class="meio">' + esc(g.corredor.length ? g.corredor.map(corrFmt).join(', ') : '—') + '</td><td>' + esc(dataEN(g.ultimo)) + '</td></tr>'; }).join('') +
    '</tbody><tfoot><tr><td></td><td><b>' + esc(te('pdf_total')) + ' (' + G.length + ' ' + esc(te('pdf_codigos')) + (G.length === L.length ? '' : ', ' + L.length + ' ' + esc(te('cg_itens'))) + ')</b></td><td class="num"><b>' + numFmt(pecas) + ' ' + esc(un) + '</b></td><td colspan="2"></td></tr></tfoot></table>';
  printOpen(h + '<div class="doc-pe">' + esc(te('marca_longa')) + ' · ' + esc(te('pdf_rodape')) + '</div></div>');
}
function pdfRecebimentos() {
  const n = nSel(), L = n ? RB.filter(r => RC.sel[r.id]) : (RC.pag !== 'lista' && recPagina() ? visiveis(itens(RC.pag)) : listaAtual());
  if (!L.length) return toast(te('pdf_vazio'), 'bad');
  const ag = new Date(), ref = ag.toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(ag.getHours()).padStart(2, '0') + String(ag.getMinutes()).padStart(2, '0'), f = [];
  if (RC.consulta.trim()) f.push(te('busca') + ': ' + RC.consulta.trim()); if (RC.fOrigem) f.push(te('r_origem') + ': ' + RC.fOrigem); if (RC.fCorr) f.push(te('r_corredor') + ': ' + corrFmt(RC.fCorr)); if (RC.fTransp) f.push(te('r_transp') + ': ' + RC.fTransp); if (RC.fDe || RC.fAte) f.push(te('data') + ': ' + (RC.fDe || '…') + ' — ' + (RC.fAte || '…'));
  let h = docTopo(te('pdf_receb_titulo'), [[te('pdf_ref'), ref], [te('pdf_data'), ag.toLocaleDateString('en-US') + ' ' + horaCurta(ag.toISOString())], [te('pdf_por'), quem()]]);
  h += '<div class="doc-sub">' + esc(n ? te('pdf_selecao') : te('pdf_filtro_atual')) + ' · ' + L.length + ' ' + esc(te('pdf_receb_linhas')) + (f.length ? '<div class="doc-flt">' + esc(f.join('  ·  ')) + '</div>' : '') + '</div>';
  const G = agruparPorCodigo(L), un = te('un_curto');
  h += '<table class="doc-tbl"><thead><tr><th class="rn">#</th><th>' + esc(te('c_nome')) + '</th><th class="num" style="width:8%">' + esc(te('qtd')) + '</th><th style="width:12%">' + esc(te('r_origem')) + '</th><th class="meio" style="width:9%">' + esc(te('r_corredor')) + '</th><th style="width:10%">' + esc(te('r_transp')) + '</th><th style="width:14%">' + esc(te('r_rastreio')) + '</th><th style="width:11%">' + esc(te('data')) + '</th></tr></thead><tbody>' +
    G.map((g, i) => { const nm = nomeProduto(g.ref), pr = []; if (g.n > 1) pr.push(te('pdf_lancamentos', { n: g.n })); if (g.rec.length) pr.push(juntarValores(g.rec, 3)); return '<tr><td class="rn">' + (i + 1) + '</td><td>' + esc(g.codigo) + (nm ? '<br><small class="doc-nome">' + esc(nm) + '</small>' : '') + (pr.length ? '<br><small>' + esc(pr.join(' · ')) + '</small>' : '') + '</td><td class="num">+' + numFmt(g.qtd) + ' ' + esc(un) + '</td><td>' + esc(juntarValores(g.origem, 2)) + '</td><td class="meio">' + esc(g.corredor.length ? juntarValores(g.corredor.map(corrFmt), 2) : '—') + '</td><td>' + esc(juntarValores(g.transp, 2)) + '</td><td>' + esc(juntarValores(g.rastreio, 1)) + '</td><td>' + esc(dataEN(g.ultimo)) + '</td></tr>'; }).join('') +
    '</tbody><tfoot><tr><td></td><td><b>' + esc(te('pdf_total')) + ' (' + G.length + ' ' + esc(te('pdf_codigos')) + (G.length === L.length ? '' : ', ' + L.length + ' ' + esc(te('pdf_receb_linhas'))) + ')</b></td><td class="num"><b>' + numFmt(pecasDe(L)) + ' ' + esc(un) + '</b></td><td colspan="5"></td></tr></tfoot></table>';
  printOpen(h + '<div class="doc-pe">' + esc(te('marca_longa')) + ' · ' + esc(te('pdf_rodape')) + '</div></div>');
}
