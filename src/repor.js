/* ============================================================
 *  🔁 보충이 필요한 상품 (#/repor) · 🔎 재확인할 상품 (#/recheca) — 옛 THE ONE CORP WMS 의 "Produtos para repor" · "Produtos para conferir" 화면을 그대로 (레이아웃 · 글 · 동작)
 *    채우기(repor): "Aguardando reposição" 한 줄 목록 — 오래된 요청 먼저 · 상품 · 수량 · 통로 · 종류(vazio/acabando) · 요청한 사람 · 때
 *          시작(Iniciar) = 맡기 — 한 사람만 (먼저 누른 사람이 주인 · 늦은 사람은 누가 맡았는지 봄) · 맡은 줄은 "Iniciado por <이름>" · 지난달 판매 = 채울 수량 제안
 *          놓기(Liberar) = 주인 또는 관리자 · 취소(Cancelar) = 재고 담당 · 관리자 · 요청한 사람
 *          폰: 카드 (사진 · 코드 · 설명 · 통로 · 제안 수량 · 시작 단추) + 검색 · 칩(전부 · 대기 · 진행 중)
 *          요청은 상자에서 꺼내거나(출고 · 상자 수량을 줄임 · 상자 삭제) 들어오면(입고 · + 조정) 저절로 닫힘 — etq.js 의 쓰기들이 같은 batch 로 (옛 DB 트리거)
 *    확인(recheca): 열린 확인 요청 표 (# · 이름 · 통로 · 수량 · 이유 · 요청한 사람 · 날짜 · 출처 — REC 이면 📥 상품 받기의 그 REC 로)
 *          "Conferido" → 센 수량을 넣는 창: 라벨 상자가 있으면 상자마다 (+ 상자 밖 낱개 → 새 상자), 없으면 수량 + 통로 · 적용될 조정을 먼저 보여 줌
 *          확인 = etq.js conferir (stock.js moveStock kind 'count' · 상자 수량 · 새 상자 라벨) + 통로는 definirCorredor(editCatalog · setLoc) · 요청을 resolvida 로 (같은 batch)
 *  자료
 *    reposicao/{id}  = { id, code, tipo:'vazio'|'acabando', qtd(요청 때 재고), por, porNome, em, status:'aberta'|'iniciada'|'resolvida'|'cancelada',
 *                        iniciadaPor, iniciadaPorNome, iniciadaEm, resolvidaEm, resolvidaPor, resolvidaPorNome, resolvidaComo:'baixa'|'entrada',
 *                        canceladaEm, canceladaPor, canceladaPorNome, canceladaMotivo }
 *        상품 하나에 열린 요청은 하나 (옛 on conflict) — 다시 요청하면 그 문서의 tipo · por · em 만 바꿈 (맡은 사람은 그대로)
 *        맡기 = 지금 문서를 새로 읽고(15초 기억 말고) 비어 있을 때만 씀 · firestore.rules 가 다른 사람이 이미 맡은 문서를 덮어쓰지 못하게 막음
 *    rechecagem/{id} = { id, code, motivo, origem, origemRef, por, porNome, em, status:'aberta'|'resolvida',
 *                        resolvidaEm, resolvidaPor, resolvidaPorNome, resultado:'ajustado'|'confirmado', qtdAntes, contado, ajuste, corredorAntes, corredorDepois, caixasAlteradas, novaEtiqueta }
 *  권한: 세일즈맨 = 보기만 · 재고 담당(can items) = 요청 · 시작 · 취소 · 확인 · 관리자 · 오너 · 창고 매니저(옛 GERENTE · GERENTE1) = 남이 맡은 것 놓기
 *  옮기지 않음: 다스 단위(새 카탈로그에 단위 칸 없음) · REC 줄의 받은 수량 고치기(새 확인 요청은 REC 번호만 기억 — 줄을 모름) · 알림 종(push)
 * ============================================================ */
import { $, esc, toast, Router, busy } from './ui.js';
import { can, isTop, myJobs } from './main.js';
import { invoicesBetween } from './invoicing.js';
import { movesOfLines, minOf } from './stock.js';
import { newId } from './db.js';
import * as E from './etq.js';
import { L3 } from './balcao.js';
import { D as DP } from './produtos-txt.js';
import { D as DR } from './recebidos-txt.js';
import { RP_CSS, RP_MAIS, REP_IMG } from './repor-css.js';
import { D } from './repor-txt.js';

const { svg, numFmt, dataBR, horaCurta, corrFmt, CORREDORES, quem } = E;
const ICO = Object.assign({}, E.ICO, { setaCirc: '<path d="M5 12h13"/><path d="m12.5 6.5 5.5 5.5-5.5 5.5"/>' });
const sub = (s, v) => { if (v) Object.keys(v).forEach(n => { s = s.split('{' + n + '}').join(String(v[n])); }); return s; };
/** 문구 — 이 화면의 사전(repor-txt) → 상품 받기 → 상품 → 재고 사전 */
export const t = (k, v) => { const x = D[k] || DR[k] || DP[k]; return x ? sub(L3(x[0], x[1], x[2]), v) : E.t(k, v); };

let S = null;
export function register(state) {
  S = state; E.init(state);
  Router.on('repor', pageRepor); Router.on('recheca', pageRecheca);
  Router.up.repor = () => { if (E.modalAberto()) { E.fecharModal(); return true; } if (RP.menu) { RP.menu = ''; render(); return true; } return false; };
  Router.up.recheca = () => { if (E.modalAberto()) { E.fecharModal(); return true; } return false; };
}

/* ---------- 권한 (옛 podeMexerEstoque · GERENTE · GERENTE1) ---------- */
const vd = () => S.role === 'salesman';
const mexe = () => !vd() && can('items');
const gerRep = () => isTop() || (S.role === 'manager' && myJobs().indexOf('whmgr') >= 0);
const eu = () => S.user.email;
const mob = () => window.innerWidth <= 760;
const now = () => new Date().toISOString();
const emAndamento = x => x.status === 'iniciada' || !!x.iniciadaPor;
const aberto = x => x && (x.status === 'aberta' || x.status === 'iniciada');
const podeCancelar = x => !!x && (mexe() || gerRep() || (!!x.por && x.por === eu()));
const podeLiberar = x => emAndamento(x) && mexe() && (x.iniciadaPor === eu() || gerRep());
/** 사용자가 지금 무엇을 하는 중이면 (창 · 입력) 실시간 갱신이 화면을 다시 그리지 않음 (옛 usuarioOcupado) */
const ocupado = () => E.modalAberto() || (document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) && document.activeElement.id !== 'rpmBusca');
function injetarCss() { E.injetarCss(); if (document.getElementById('rpCss')) return; const st = document.createElement('style'); st.id = 'rpCss'; st.textContent = RP_CSS + RP_MAIS; document.head.appendChild(st); }

/* ============================================================
 *  요청 자료 (옛 v_reposicao · v_rechecagem)
 * ============================================================ */
const RP = { lista: null, erro: '', busca: '', buscaAb: false, filtro: '', filtroAb: false, menu: '' };
const RCK = { lista: null, erro: '', cargas: {} };
let PARAR = null;
async function lerRepor() {
  try { if (S.DB.fresh) S.DB.fresh('reposicao'); RP.lista = ordenar(await S.DB.list('reposicao', { where: [['status', 'in', ['aberta', 'iniciada']]] })); RP.erro = ''; }
  catch (e) { RP.erro = String(e.message || e); }   // 읽지 못한 것을 빈 목록처럼 보이지 않게 (옛 31/10/2026)
}
const ordenar = L => L.filter(aberto).sort((a, b) => String(a.em || '').localeCompare(String(b.em || '')));
/** 상품 하나의 열린 요청 (📦 재고 · 📦 상품 의 요청 카드) — code → 문서 */
let ABERTAS = null, ABERTAS_AT = 0;
export async function reposAbertas(force) {
  if (ABERTAS && !force && Date.now() - ABERTAS_AT < 15000) return ABERTAS;
  const m = {}; try { if (force && S.DB.fresh) S.DB.fresh('reposicao'); (await S.DB.list('reposicao', { where: [['status', 'in', ['aberta', 'iniciada']]] })).forEach(x => { m[x.code] = x; }); } catch (e) {}
  ABERTAS = m; ABERTAS_AT = Date.now(); return m;
}
export const reposAberta = code => (ABERTAS || {})[code] || null;
/** 실시간 (옛 realtime aoVivo) — 이 화면에 있는 동안만 · 나가면 멈춤 */
function vigiar(col, q, cb, rota) {
  if (PARAR) { PARAR(); PARAR = null; }
  if (!S.DB.watch) return;
  try { PARAR = S.DB.watch(col, q, rows => { if (location.hash.indexOf('#/' + rota) !== 0) { if (PARAR) { PARAR(); PARAR = null; } return; } cb(rows); }); } catch (e) { PARAR = null; }
}

/* ---------- 제안 수량 = 지난달 판매 (옛 repSug* — vendas 표 대신 인보이스 줄) ---------- */
const SUG = { mes: '', por: null, pedindo: false };
const mesPassado = () => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() - 1, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
const mesExtenso = ym => { const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1); return d.toLocaleDateString(L3('ko-KR', 'en-US', 'pt-BR'), { month: 'long', year: 'numeric' }); };
async function vendasMes() {
  if (SUG.por) return SUG.por;
  if (vd()) return null;   // 세일즈맨은 남의 인보이스를 읽지 않음
  const ym = mesPassado(), m = {};
  try { (await invoicesBetween(S, ym + '-01', ym + '-31')).filter(v => v.st !== 'x').forEach(v => movesOfLines(v.lines, 1).forEach(x => { const c = String(x.c || '').toUpperCase(); m[c] = (m[c] || 0) + (Number(x.delta) || 0); })); }
  catch (e) { return null; }
  SUG.mes = ym; SUG.por = m; return m;
}
const sugDe = code => SUG.por ? (SUG.por[code] || 0) : null;
function sugGarantir() {
  if (SUG.por || SUG.pedindo || vd()) return; SUG.pedindo = true;
  vendasMes().then(m => { SUG.pedindo = false; if (m && location.hash.indexOf('#/repor') === 0 && !ocupado()) render(); });
}
const sugTxt = x => { const q = sugDe(x.code); return q == null ? '' : t('rp_sug_linha', { q: numFmt(q), u: t('un_curto') }); };

/* ============================================================
 *  TELA — Produtos para repor (옛 telaReposicao · rpmTela)
 * ============================================================ */
async function pageRepor() {
  injetarCss();
  if (!RP.lista) $('page').innerHTML = '<div class="sb rp-raiz"><div id="conteudo" class="rp-tela">' + cabRepor() + '<div class="placeholder">' + esc(t('carregando')) + '</div></div></div>';
  try { await E.produtos(); } catch (e) {}
  await lerRepor();
  if (location.hash.indexOf('#/repor') !== 0) return;
  render();
  vigiar('reposicao', { where: [['status', 'in', ['aberta', 'iniciada']]] }, rows => { RP.lista = ordenar(rows); RP.erro = ''; if (!ocupado()) render(); }, 'repor');
}
const cabRepor = () => '<div class="page-head"><div><h1>' + esc(t('nav_repor')) + '</h1><p>' + esc(t('rp_sub')) + '</p></div></div>';
function render() {
  if (location.hash.indexOf('#/repor') !== 0) return;
  let h;
  if (mob()) h = rpmTela(!RP.lista && RP.erro);
  else if (!RP.lista && RP.erro) h = cabRepor() + '<div class="aviso erro">' + svg(ICO.alerta, 16) + '<div>' + esc(t('rpm_erro')) + '</div></div><p><button type="button" class="btn" data-act="rpm-denovo">' + esc(t('rpm_denovo')) + '</button></p>';
  else {
    const ag = RP.lista || [];
    h = cabRepor() + '<div class="rp-grade rp-grade-1"><section class="panel rp-sec rp-ag"><div class="rp-cab"><span class="rp-dot warn"></span><h2>' + esc(t('g_repor')) + '</h2><span class="rp-n">' + ag.length + '</span></div>' +
      '<p class="rp-sub">' + esc(t('rp_ag_sub')) + '</p>' + (ag.length ? ag.map(aguardaHTML).join('') : '<div class="rp-vazio">' + svg(ICO.entra, 32) + '<b>' + esc(t('rp_vazio')) + '</b></div>') + '</section></div>';
  }
  const ae = document.activeElement, foco = ae && ae.id === 'rpmBusca' ? ae.selectionStart : null;
  $('page').innerHTML = '<div class="sb rp-raiz"><div id="conteudo" class="rp-tela">' + h + '</div></div>';
  if (foco != null) { const n = $('rpmBusca'); if (n) { n.focus(); try { n.setSelectionRange(foco, foco); } catch (e) {} } }
  ligarRepor();
  if ((RP.lista || []).some(x => mob() || emAndamento(x))) sugGarantir();
}
const qtdTxt = x => { const p = E.prod(x.code); return numFmt(p ? p.qtd : x.qtd || 0) + ' ' + t('un_curto'); };
/** 맡은 사람 표시 (옛 repIniciadoHTML — 늘 그 사람의 이름, "나" 는 괄호로) */
function iniciadoHTML(x) {
  const meu = x.iniciadaPor === eu();
  return '<span class="rp-iniciado" title="' + esc(t('rp_iniciada_as', { h: horaCurta(x.iniciadaEm) })) + '">' + esc(t('rp_iniciado_por', { n: (x.iniciadaPorNome || '—') + (meu ? ' (' + t('rp_voce') + ')' : '') })) + '</span>';
}
function aguardaHTML(x) {
  const vz = x.tipo === 'vazio', em = emAndamento(x), p = E.prod(x.code);
  return '<div class="rp-item rp-ag-i' + (em ? ' rp-ag-em' : '') + '" data-rp="' + esc(x.id) + '"><div class="rp-info"><b>' + esc(x.code) + '</b>' +
    '<span class="rp-qtd">' + esc(qtdTxt(x)) + (p && p.corredor ? ' · ' + esc(corrFmt(p.corredor)) : '') + ' <span class="badge ' + (vz ? 'vazia' : 'low') + '">' + esc(t(vz ? 'rp_tipo_vazio' : 'rp_tipo_acabando')) + '</span></span>' +
    '<span class="rp-hora">' + esc((x.porNome || x.por || '—') + ' · ' + dataBR(x.em)) + '</span></div>' +
    '<div class="rp-acao">' + (em ? iniciadoHTML(x) + (sugTxt(x) ? '<span class="rp-sug-linha">' + esc(sugTxt(x)) + '</span>' : '') + (podeLiberar(x) ? '<button type="button" class="btn sm" data-act="rp-liberar" data-id="' + esc(x.id) + '">' + esc(t('rp_liberar')) + '</button>' : '')
      : mexe() ? '<button type="button" class="btn primary rp-ini" data-act="rp-iniciar" data-id="' + esc(x.id) + '">' + esc(t('rp_iniciar')) + '</button>' : '') +
    (podeCancelar(x) && mexe() ? '<button type="button" class="btn sm rp-canc" data-act="rp-cancelar" data-id="' + esc(x.id) + '">' + esc(t('rp_cancelar')) + '</button>' : '') + '</div></div>';
}

/* ---------- 폰 (옛 rpmTela · rpmCartaoHTML) ---------- */
const semAcento = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function rpmFiltrar(L) {
  const q = semAcento(RP.busca), f = RP.filtro;
  return L.filter(x => {
    if (f === 'pend' && emAndamento(x)) return false;
    if (f === 'em' && !emAndamento(x)) return false;
    if (!q) return true;
    const p = E.prod(x.code) || {};
    return semAcento([x.code, p.descricao, p.corredor, p.corredor ? corrFmt(p.corredor) : ''].join(' ')).indexOf(q) >= 0;
  });
}
const nomeCurto = n => { const p = String(n || '—').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.' : p[0]; };
const rpmDia = ts => { const d = new Date(ts); if (isNaN(d)) return ''; const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'); return L3(mm + '/' + dd, mm + '/' + dd, dd + '/' + mm); };
function rpmCartaoHTML(x) {
  const p = E.prod(x.code), em = emAndamento(x), desc = String(p && p.descricao || '').trim(), sug = sugDe(x.code), min = p ? Number(minOf(p.id)) || 0 : 0,
    podeLib = podeLiberar(x), podeCanc = podeCancelar(x) && mexe(), temMenu = podeLib || podeCanc, ab = temMenu && RP.menu === x.id, nome = String(x.iniciadaPorNome || '—').trim();
  return '<article class="rpm-card' + (em ? ' rpm-em' : '') + '" data-rp="' + esc(x.id) + '"><div class="rpm-top"><div class="rpm-foto">' + E.miniProdutoHTML(p, 52) + '</div>' +
    '<div class="rpm-info"><b class="rpm-sku">' + esc(x.code) + '</b>' + (desc ? '<span class="rpm-desc">' + esc(desc) + '</span>' : '') + (p && p.corredor ? '<span class="rpm-loc">' + svg(ICO.pin, 13) + esc(corrFmt(p.corredor)) + '</span>' : '') + '</div>' +
    '<div class="rpm-qtd" title="' + esc(t('rpm_sug')) + '"><b>' + (sug == null ? '…' : esc(numFmt(sug)) + ' <small>' + esc(t('un_curto')) + '</small>') + '</b>' + (min ? '<span class="rpm-min">' + esc(t('minimo_curto') + ' ' + numFmt(min)) + '</span>' : '') + '</div></div>' +
    '<div class="rpm-acoes">' + (em ? '<div class="rpm-st" title="' + esc(t('rp_iniciado_por', { n: nome })) + '"><span class="rpm-st-ic" aria-hidden="true"></span><span class="rpm-st-tx"><b>' + esc(t('rpm_em')) + '</b><span class="rpm-quem">' + esc(t('rp_iniciado_por', { n: nomeCurto(nome) })) + ' · ' + esc(t('rpm_quando', { d: rpmDia(x.iniciadaEm), h: horaCurta(x.iniciadaEm) })) + '</span></span></div>'
      : mexe() ? '<button type="button" class="rpm-ini" data-act="rp-iniciar" data-id="' + esc(x.id) + '">' + svg(ICO.cubo, 20) + '<span>' + esc(t('rpm_iniciar')) + '</span></button>' : '<span class="rpm-ag">' + esc(t('rpm_f_pend')) + '</span>') +
    (temMenu ? '<button type="button" class="rpm-menu' + (ab ? ' on' : '') + '" data-rpm-menu="' + esc(x.id) + '" aria-label="' + esc(t('rpm_mais')) + '" aria-expanded="' + (ab ? 'true' : 'false') + '">⋮</button>' : '') + '</div>' +
    (ab ? '<div class="rpm-mais">' + (podeLib ? '<button type="button" class="btn" data-act="rp-liberar" data-id="' + esc(x.id) + '">' + esc(t('rp_liberar')) + '</button>' : '') + (podeCanc ? '<button type="button" class="btn rpm-canc" data-act="rp-cancelar" data-id="' + esc(x.id) + '">' + esc(t('rp_cancelar')) + '</button>' : '') + '</div>' : '') + '</article>';
}
function rpmListaHTML() {
  const tudo = RP.lista || [], L = rpmFiltrar(tudo);
  if (!tudo.length) return '<div class="rpm-vazio">' + svg(ICO.entra, 32) + '<b>' + esc(t('rp_vazio')) + '</b></div>';
  if (!L.length) return '<div class="rpm-vazio"><b>' + esc(t('rpm_nada')) + '</b></div>';
  return '<div class="rpm-colunas"><span>' + esc(t('rpm_produto')) + '</span><span>' + esc(t('rpm_sug')) + '</span></div>' + L.map(rpmCartaoHTML).join('');
}
function rpmTela(erro) {
  const ag = RP.lista || [], pend = ag.filter(x => !emAndamento(x)).length, f = RP.filtro;
  return '<div class="rpm"><div class="rpm-cab"><button type="button" class="rpm-bt" data-act="rpm-volta" aria-label="' + esc(t('voltar')) + '">' + svg(ICO.esq, 20) + '</button>' +
    '<div class="rpm-tit"><h1>' + esc(t('g_repor')) + (erro ? '' : ' <span class="rpm-n">' + pend + '</span>') + '</h1><p>' + esc(t('g_repor_sub')) + '</p></div>' +
    '<button type="button" class="rpm-bt' + (RP.buscaAb || RP.busca ? ' on' : '') + '" data-act="rpm-busca-bt" aria-label="' + esc(t('rpm_busca_ph')) + '">' + svg(ICO.busca, 20) + '</button>' +
    '<button type="button" class="rpm-bt' + (RP.filtroAb || f ? ' on' : '') + '" data-act="rpm-filtro-bt" aria-label="' + esc(t('filtros')) + '">' + svg(ICO.filtro, 20) + '</button></div>' +
    (RP.buscaAb || RP.busca ? '<div class="rpm-busca"><input id="rpmBusca" type="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="' + esc(t('rpm_busca_ph')) + '" value="' + esc(RP.busca) + '"></div>' : '') +
    (RP.filtroAb || f ? '<div class="rpm-chips">' + [['', 'rpm_f_todos'], ['pend', 'rpm_f_pend'], ['em', 'rpm_f_em']].map(c => '<button type="button" class="rpm-chip' + (f === c[0] ? ' on' : '') + '" data-rpm-f="' + c[0] + '">' + esc(t(c[1])) + '</button>').join('') + '</div>' : '') +
    (erro ? '<div class="rpm-vazio rpm-erro">' + svg(ICO.alerta, 30) + '<b>' + esc(t('rpm_erro')) + '</b><button type="button" class="btn" data-act="rpm-denovo">' + esc(t('rpm_denovo')) + '</button></div>' : '<div id="rpmLista">' + rpmListaHTML() + '</div>') + '</div>';
}
function ligarRepor() {
  const raiz = document.querySelector('#page .sb.rp-raiz'); if (!raiz) return;
  raiz.addEventListener('click', cliqueRepor);
  const bi = $('rpmBusca'); if (bi) bi.addEventListener('input', () => { RP.busca = bi.value; const l = $('rpmLista'); if (l) l.innerHTML = rpmListaHTML(); });   // 글자마다 목록만 (키보드가 닫히지 않게)
}
async function cliqueRepor(ev) {
  const b = ev.target.closest('[data-act],[data-rpm-f],[data-rpm-menu]'); if (!b) return;
  if (b.dataset.rpmF != null) { RP.filtro = b.dataset.rpmF; return render(); }
  if (b.dataset.rpmMenu) { RP.menu = RP.menu === b.dataset.rpmMenu ? '' : b.dataset.rpmMenu; const l = $('rpmLista'); if (l) l.innerHTML = rpmListaHTML(); return; }
  const a = b.dataset.act;
  if (a === 'rpm-volta') return Router.go('hub', 'wh');
  if (a === 'rpm-busca-bt') { RP.buscaAb = !(RP.buscaAb || RP.busca); if (!RP.buscaAb) RP.busca = ''; render(); const i = $('rpmBusca'); if (i) i.focus(); return; }
  if (a === 'rpm-filtro-bt') { RP.filtroAb = !(RP.filtroAb || RP.filtro); if (!RP.filtroAb) RP.filtro = ''; return render(); }
  if (a === 'rpm-denovo') { RP.erro = ''; await lerRepor(); return render(); }
  if (a === 'rp-iniciar') return iniciar(b.dataset.id, b);
  if (a === 'rp-liberar') return liberar(b.dataset.id);
  if (a === 'rp-cancelar') return cancelar(b.dataset.id);
}

/* ---------- 한 버튼 창 (옛 pergunta umBotao) ---------- */
function aviso1(titulo, html) {
  return new Promise(res => {
    const w = E.abrirModal('<div class="modal-head"><h2>' + esc(titulo) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body">' + html + '</div><div class="modal-foot"><button class="btn primary" data-act="fechar-modal" id="rpEntendi">' + esc(t('rp_entendi')) + '</button></div>', 'rp-m');
    w.addEventListener('click', e => { if (e.target.closest('[data-act="fechar-modal"]')) res(); });
  });
}
async function lerUm(id) { try { if (S.DB.fresh) S.DB.fresh('reposicao'); return await S.DB.get('reposicao', id); } catch (e) { return null; } }   // 지금 문서 (15초 기억 말고)
const jaIniciadaTxt = x => t('rp_ja_iniciada', { n: x.iniciadaPorNome || '—', h: horaCurta(x.iniciadaEm) });
/** 시작 (옛 repIniciar → rpc_iniciar_reposicao) — 단추는 바로 잠김 · 화면은 DB 가 답한 대로 */
const VOO = {};
async function iniciar(id, bt) {
  if (!mexe() || VOO[id]) return; VOO[id] = 1;
  if (bt) { bt.disabled = true; const s = bt.querySelector('span'); (s || bt).textContent = t('rp_iniciando'); }
  let x = await lerUm(id), ok = false;
  try {
    if (!x || !aberto(x)) toast(t(x && x.status === 'resolvida' ? 'rp_concluida' : 'rp_sumiu'), 'bad');
    else if (x.iniciadaPor && x.iniciadaPor !== eu()) await aviso1(t('rp_ja_tit'), '<p style="margin:0">' + esc(jaIniciadaTxt(x)) + '</p>');
    else if (x.iniciadaPor === eu()) ok = true;   // 이미 내 것
    else {
      try { await S.DB.update('reposicao', id, { status: 'iniciada', iniciadaPor: eu(), iniciadaPorNome: quem(), iniciadaEm: now() }); ok = true; }
      catch (e) { const y = await lerUm(id); if (y && y.iniciadaPor && y.iniciadaPor !== eu()) await aviso1(t('rp_ja_tit'), '<p style="margin:0">' + esc(jaIniciadaTxt(y)) + '</p>'); else toast(t('rp_erro'), 'bad'); }   // 규칙이 막음 = 누가 먼저 맡음
    }
  } finally { delete VOO[id]; }
  await lerRepor(); ABERTAS = null; render();
  if (ok && x) { const m = await vendasMes(); mostrarSugestao(x, m ? { mes: SUG.mes, qtd: m[x.code] || 0 } : null); render(); }   // 제안은 주인이 정해진 뒤에만 (진 사람은 안 봄)
}
function mostrarSugestao(x, sg) {
  let h = '<div class="rp-sug">';
  if (sg) h += '<div class="rp-sug-n">' + esc(numFmt(sg.qtd)) + ' <small>' + esc(t('un_curto')) + '</small></div><div class="rp-sug-sub">' + esc(t(sg.qtd > 0 ? 'rp_sug_vendido' : 'rp_sug_zero', { m: mesExtenso(sg.mes) })) + '</div>';
  else h += '<div class="rp-sug-sub">' + esc(t('rp_sug_sem')) + '</div>';
  h += '<div class="rp-sug-aviso">' + svg(ICO.ajuda, 18) + '<div>' + esc(t('rp_sug_bom_senso')) + '</div></div></div>';
  return aviso1(t('rp_sug_tit', { s: x.code }), h);
}
/** 놓기 (옛 repLiberar → rpc_liberar_reposicao) — 주인 또는 관리자 */
async function liberar(id) {
  const x = (RP.lista || []).find(r => r.id === id) || {};
  const r = await E.pergunta({ titulo: t('rp_lib_tit'), texto: t('rp_lib_txt', { s: x.code || '' }), sim: t('rp_liberar'), nao: t('cancelar'), cls: 'rp-m' }); if (!r) return;
  const y = await lerUm(id);
  if (!y || !aberto(y)) toast(t('rp_sumiu'), 'bad');
  else if (!y.iniciadaPor) toast(t('rp_sumiu'), 'bad');
  else if (y.iniciadaPor !== eu() && !gerRep()) toast(t('rp_lib_nao'), 'bad');
  else { try { await S.DB.update('reposicao', id, { status: 'aberta', iniciadaPor: '', iniciadaPorNome: '', iniciadaEm: '' }); toast(t('rp_lib_ok'), 'good'); } catch (e) { toast(String(e.message || e), 'bad'); } }
  RP.menu = ''; await lerRepor(); ABERTAS = null; render();
}
/** 취소 (옛 repCancelar → rpc_cancelar_reposicao) — 재고를 건드리지 않고 닫음 · 이유는 고를 수 있음 */
async function cancelar(id) {
  const x = (RP.lista || []).find(r => r.id === id) || {};
  const r = await E.pergunta({ titulo: t('rp_cancelar_tit'), texto: t('rp_cancelar_txt', { s: x.code || '' }), perigo: true, campo: true, campoPh: t('rp_cancelar_ph'), sim: t('rp_cancelar_sim'), nao: t('voltar'), cls: 'rp-m' }); if (!r) return;
  const y = await lerUm(id);
  if (!y || !aberto(y)) toast(t('rp_sumiu'), 'bad');
  else if (!podeCancelar(y)) toast(t('rp_cancelar_nao'), 'bad');
  else { try { await S.DB.update('reposicao', id, { status: 'cancelada', resolvidaEm: now(), canceladaEm: now(), canceladaPor: eu(), canceladaPorNome: quem(), canceladaMotivo: String(r.campo || '').trim().slice(0, 200) }); toast(t('rp_cancelar_ok'), 'good'); } catch (e) { toast(String(e.message || e), 'bad'); } }
  RP.menu = ''; await lerRepor(); ABERTAS = null; render();
}

/* ============================================================
 *  요청 만들기 (옛 solicitarReposicaoPopup · enviarReposicao → rpc_solicitar_reposicao) — 📦 재고 · 📦 상품 에서
 * ============================================================ */
/** 요청 카드 (옛 csReporCardHTML) — 재고가 0 보다 많을 때만 · 이미 열린 요청이 있으면 단추 대신 안내 */
export function reporCardHTML(p) {
  if (!p || !(Number(p.qtd) > 0)) return '';
  const ab = reposAberta(p.id), fig = '<img class="cs2-fig" src="' + REP_IMG + '" alt="" aria-hidden="true">';
  if (ab) return '<div class="cs2-acao cs2-repor ja">' + fig + '<span class="cs2-repor-txt"><b>' + esc(t('cs_repor_ja')) + '</b><span>' + esc(emAndamento(ab) ? t('cs_repor_em_sub', { quem: ab.iniciadaPorNome || '—', h: horaCurta(ab.iniciadaEm) }) : t('cs_repor_ja_sub', { quem: ab.porNome || '—', quando: dataBR(ab.em) })) + '</span></span></div>';
  if (!mexe()) return '';
  return '<button type="button" class="cs2-acao cs2-repor" data-act="cs-repor" data-pid="' + esc(p.id) + '">' + fig + '<span class="cs2-repor-txt"><b>' + esc(t('cs_repor')) + '</b><span>' + esc(t('cs_repor_sub')) + '</span></span><span class="cs2-repor-seta">' + svg(ICO.setaCirc, 20) + '</span></button>';
}
/** 단추를 누르면 — 종류를 묻고(아직 재고가 있으면 "acabando" 만) 요청 → 화면 가득 확인 → 누르면 채울 상품 화면으로 */
export async function pedirReposicaoPopup(code, depois) {
  injetarCss();
  const p = E.prod(code); if (!p) return;
  if (!mexe()) return toast(t('somente_gerente'), 'bad');
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('cs_repor_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p style="margin:0 0 12px">' + esc((p.descricao || p.nome || '') + ' — ' + t('cs_repor_txt')) + '</p><div class="pm-rc-bts">' +
    '<button type="button" class="btn primary" data-rep-tipo="acabando">' + esc(t('cs_repor_acabando')) + '</button>' + (Number(p.qtd) === 0 ? '<button type="button" class="btn primary" data-rep-tipo="vazio">' + esc(t('cs_repor_vazio')) + '</button>' : '') +
    '</div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button></div>', 'rp-m');
  w.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-rep-tipo]'); if (!b) return;
    E.fecharModal(); busy(true);
    try { await pedirReposicao(code, b.dataset.repTipo); busy(false); reporConfirmado(); if (depois) depois(); }
    catch (x) { busy(false); toast(String(x.message || x), 'bad'); }
  });
}
/** 요청 하나 — 상품의 열린 요청이 있으면 그것을 고침 (맡은 사람은 그대로 · 옛 on conflict) */
export async function pedirReposicao(code, tipo) {
  if (!mexe()) throw new Error(t('somente_gerente'));
  if (['acabando', 'vazio'].indexOf(tipo) < 0) throw new Error('tipo');
  const p = E.prod(code); if (!p) throw new Error(t('r_sem_produto'));
  if (!(Number(p.qtd) > 0)) throw new Error(t('rp_so_saldo'));
  if (tipo === 'vazio' && Number(p.qtd) > 0) tipo = 'acabando';   // "vazio" 는 재고 0 일 때만 (옛 03/09/2026)
  const base = { tipo, qtd: Number(p.qtd) || 0, por: eu(), porNome: quem(), em: now() };
  let ab = []; try { if (S.DB.fresh) S.DB.fresh('reposicao'); ab = (await S.DB.list('reposicao', { where: [['code', '==', p.id]] })).filter(aberto); } catch (e) {}
  let id;
  if (ab.length) { id = ab[0].id; await S.DB.update('reposicao', id, base); }
  else { id = newId('RP'); await S.DB.set('reposicao', id, Object.assign({ id, code: p.id, status: 'aberta', iniciadaPor: '', iniciadaPorNome: '', iniciadaEm: '' }, base)); }
  ABERTAS = null; await reposAbertas(true); return id;
}
/** 옛 reporConfirmado — 2.2초 화면 가득 · 누르면 채울 상품 화면 */
function reporConfirmado() {
  let v = document.getElementById('reporOk'); if (!v) { v = document.createElement('div'); v.id = 'reporOk'; document.body.appendChild(v); }
  v.className = 'sb rp-ok-w rep-ok'; v.innerHTML = '<div class="rep-ok-card"><img class="cs2-fig" src="' + REP_IMG + '" alt="" aria-hidden="true"><div class="rep-ok-txt">' + esc(t('cs_repor_ok')) + '</div></div>';
  void v.offsetWidth; v.classList.add('show');
  const sair = () => { clearTimeout(reporConfirmado.tm); v.classList.remove('show'); setTimeout(() => { if (v.parentNode) v.parentNode.removeChild(v); }, 260); };
  v.onclick = () => { sair(); Router.go('repor'); };
  reporConfirmado.tm = setTimeout(sair, 2200);
}
export const injetarCssRepor = injetarCss;

/* ============================================================
 *  TELA — Produtos para conferir (옛 telaRechecagem)
 * ============================================================ */
const MOTIVOS = { saldo: 'rc_m_saldo', misturado: 'rc_m_misturado', nao_encontrado: 'rc_m_sumiu' };
const motivoTxt = m => t(MOTIVOS[m] || 'rc_m_saldo');
async function lerRecheca() {
  try { if (S.DB.fresh) S.DB.fresh('rechecagem'); RCK.lista = (await S.DB.list('rechecagem', { where: [['status', '==', 'aberta']] })).sort((a, b) => String(a.em || '').localeCompare(String(b.em || ''))); RCK.erro = ''; }
  catch (e) { RCK.erro = String(e.message || e); }
  await cargasDe(RCK.lista || []);
}
/** REC 번호 (출처 링크의 글) — origemRef 는 cargas 문서 id */
async function cargasDe(L) {
  for (const id of Array.from(new Set(L.filter(x => x.origem === 'recebimento' && x.origemRef).map(x => x.origemRef)))) {
    if (RCK.cargas[id]) continue; try { const c = await S.DB.get('cargas', id); RCK.cargas[id] = c ? c.numero || id : id; } catch (e) { RCK.cargas[id] = id; }
  }
}
async function pageRecheca() {
  injetarCss();
  if (!RCK.lista) $('page').innerHTML = '<div class="sb rp-raiz"><div id="conteudo" class="rp-tela">' + cabRecheca() + '<div class="placeholder">' + esc(t('carregando')) + '</div></div></div>';
  try { await E.produtos(); } catch (e) {}
  await lerRecheca();
  if (location.hash.indexOf('#/recheca') !== 0) return;
  renderRc();
  vigiar('rechecagem', { where: [['status', '==', 'aberta']] }, async rows => { RCK.lista = rows.sort((a, b) => String(a.em || '').localeCompare(String(b.em || ''))); await cargasDe(RCK.lista); if (!ocupado()) renderRc(); }, 'recheca');
}
const cabRecheca = () => '<div class="page-head"><div><h1>' + esc(t('nav_recheca')) + '</h1><p>' + esc(t('rc_sub')) + '</p></div></div>';
function origemHTML(x) {
  let r = x.origem ? esc(t('rc_or_' + x.origem)) : '—';
  if (x.origem === 'recebimento' && x.origemRef) r += ' · <a href="#/recebimento/' + esc(encodeURIComponent(x.origemRef)) + '" data-rc-rec="' + esc(x.origemRef) + '">' + esc(RCK.cargas[x.origemRef] || 'REC') + '</a>';
  return '<span class="rc-de">' + r + '</span>';   // 한 span 안에 (폰 카드에서 양 끝으로 벌어지지 않게)
}
function renderRc() {
  if (location.hash.indexOf('#/recheca') !== 0) return;
  const L = RCK.lista || [];
  let a = cabRecheca() + (RCK.erro && !RCK.lista ? '<div class="aviso erro">' + svg(ICO.alerta, 16) + '<div>' + esc(t('rpm_erro')) + '</div></div>' : '') +
    '<div class="panel"><div class="tbl-scroll"><table class="tbl-recheca"><thead><tr><th class="rn" style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">#</th><th>' + esc(t('c_nome')) + '</th><th>' + esc(t('r_corredor')) + '</th><th class="num">' + esc(t('c_qtd')) + '</th><th>' + esc(t('rc_motivo')) + '</th><th>' + esc(t('responsavel')) + '</th><th>' + esc(t('data')) + '</th><th>' + esc(t('rc_origem')) + '</th><th class="acoes"></th></tr></thead><tbody>';
  if (L.length) L.forEach((x, i) => {
    const p = E.prod(x.code) || {};
    a += '<tr data-recheca-linha="' + esc(x.id) + '"><td class="rn" style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">' + (i + 1) + '</td><td class="principal"><b>' + esc(x.code) + '</b></td>' +
      '<td data-l="' + esc(t('r_corredor')) + '">' + esc(p.corredor ? corrFmt(p.corredor) : '—') + '</td><td class="num" data-l="' + esc(t('c_qtd')) + '"><b>' + numFmt(p.qtd || 0) + '</b></td>' +
      '<td data-l="' + esc(t('rc_motivo')) + '"><span class="badge ' + (x.motivo === 'nao_encontrado' ? 'vazia' : 'low') + '">' + esc(motivoTxt(x.motivo)) + '</span></td>' +
      '<td data-l="' + esc(t('responsavel')) + '">' + esc(x.porNome || x.por || '—') + '</td><td data-l="' + esc(t('data')) + '" style="color:var(--muted)">' + esc(dataBR(x.em)) + '</td>' +
      '<td data-l="' + esc(t('rc_origem')) + '">' + origemHTML(x) + '</td><td class="acoes" style="text-align:right;white-space:nowrap">' + (mexe() ? '<button class="btn sm primary" data-act="rc-conferir-linha" data-id="' + esc(x.id) + '">' + esc(t('rc_conferido')) + '</button>' : '') + '</td></tr>';
  });
  else a += '<tr><td colspan="9"><div class="empty">' + svg(ICO.busca, 40) + '<b>' + esc(t('rc_vazio')) + '</b></div></td></tr>';
  a += '</tbody></table></div></div>';
  $('page').innerHTML = '<div class="sb rp-raiz rc-raiz2"><div id="conteudo" class="rp-tela">' + a + '</div></div>';
  document.querySelector('#page .sb.rp-raiz').addEventListener('click', ev => {
    const b = ev.target.closest('[data-act="rc-conferir-linha"]'); if (b) return conferir(b.dataset.id);
  });
}

/* ---------- Conferido (옛 rechecagemConferida · rcCfAbrir · rcCfAbrirCaixas) ---------- */
const corrOpts = corr => '<option value="">' + esc(t('r_corredor_nenhum')) + '</option>' + (corr && CORREDORES.indexOf(corr) < 0 ? [corr] : []).concat(CORREDORES).map(c => '<option value="' + esc(c) + '"' + (c === corr ? ' selected' : '') + '>' + esc(corrFmt(c)) + '</option>').join('');   // 목록에 없는 옛 통로도 남김 (그대로 확인하면 지워지지 않게)
async function conferir(id) {
  if (!mexe()) return;
  const x = (RCK.lista || []).find(r => r.id === id); if (!x) return;
  try { await E.produtos(true); } catch (e) {}
  let cx = []; try { if (S.DB.fresh) S.DB.fresh('etiquetas'); cx = (await E.listarEtiquetas(x.code)).filter(e => e.ativa); } catch (e) { return toast(String(e.message || e), 'bad'); }
  return cx.length ? abrirCaixas(x, cx) : abrirDireto(x);
}
function abrirDireto(x) {
  const p = E.prod(x.code) || { qtd: 0, corredor: '' }, qtd = Number(p.qtd) || 0, corr = p.corredor || '';
  const pr = E.pergunta({ titulo: t('rc_cf_tit'), texto: x.code + ' — ' + t('rc_cf_txt'), cls: 'rp-m', sim: t('rc_cf_ok'), nao: t('cancelar'),
    html: '<div class="rc-cf"><div class="rc-cf-sis">' + esc(t('rc_cf_sistema')) + ': <b>' + numFmt(qtd) + '</b> · ' + esc(corr ? corrFmt(corr) : '—') + '</div>' +
      '<div class="rc-cf-campos"><label>' + esc(t('rc_cf_qtd')) + '<input id="rcCfQtd" type="number" inputmode="numeric" min="0" value="' + qtd + '"></label><label>' + esc(t('rc_cf_corr')) + '<select id="rcCfCorr">' + corrOpts(corr) + '</select></label></div><div class="rc-cf-prev" id="rcCfPrev"></div></div>',
    ler: w => ({ q: w.querySelector('#rcCfQtd').value, c: w.querySelector('#rcCfCorr').value }) });
  const w = document.querySelector('.es-mw'), q = w.querySelector('#rcCfQtd'), c = w.querySelector('#rcCfCorr'), pv = w.querySelector('#rcCfPrev');
  const pintar = () => {
    const nv = String(q.value).trim() === '' ? qtd : Math.max(0, Math.floor(Number(q.value) || 0)), partes = [];
    if (nv !== qtd) partes.push(t('rc_cf_ajuste', { delta: (nv - qtd > 0 ? '+' : '') + numFmt(nv - qtd), antes: numFmt(qtd), depois: numFmt(nv) }));
    if ((c.value || '') !== corr) partes.push(t('r_corredor') + ': ' + (corr ? corrFmt(corr) : '—') + ' → ' + (c.value ? corrFmt(c.value) : '—'));
    pv.className = 'rc-cf-prev' + (partes.length ? ' muda' : ''); pv.textContent = partes.length ? partes.join(' · ') : t('rc_cf_igual');
  };
  q.addEventListener('input', pintar); c.addEventListener('change', pintar); pintar(); setTimeout(() => { try { q.focus(); q.select(); } catch (e) {} }, 30);
  pr.then(r => { if (!r) return; const v = r.extra, qv = String(v.q).trim() === '' ? qtd : Math.max(0, Math.floor(Number(v.q) || 0)); resolver(x, { qtd: qv, corredor: v.c, corrAntes: corr }); });
}
const numDe = inp => { const v = String(inp.value).trim(); return v === '' ? Number(inp.dataset.rcDe) || 0 : Math.max(0, Math.floor(Number(v) || 0)); };   // 비우면 = 시스템 값 · 음수는 0
function lerCaixas(w) {
  const caixas = [], mudou = []; let soma = 0; const n = w.querySelector('#rcCfNova'), nova = n && String(n.value).trim() !== '' ? Math.max(0, Math.floor(Number(n.value) || 0)) : 0;
  w.querySelectorAll('[data-rc-cx]').forEach(inp => { const cod = inp.dataset.rcCx, de = Number(inp.dataset.rcDe) || 0, para = numDe(inp); caixas.push({ codigo: cod, qtd: para }); soma += para; if (para !== de) mudou.push({ codigo: cod, de, para }); });
  return { caixas, mudou, nova, soma: soma + nova };
}
function abrirCaixas(x, caixas) {
  const p = E.prod(x.code) || { qtd: 0, corredor: '' }, qtd = Number(p.qtd) || 0, corr = p.corredor || '', lista = caixas.slice().sort((a, b) => String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
  const pr = E.pergunta({ titulo: t('rc_cf_tit'), texto: x.code + ' — ' + t('rc_cf_cx_txt'), cls: 'rp-m', sim: t('rc_cf_ok'), nao: t('cancelar'),
    html: '<div class="rc-cf rc-cf-porcx"><div class="rc-cf-sis">' + esc(t('rc_cf_sistema')) + ': <b>' + numFmt(qtd) + '</b> · ' + esc(corr ? corrFmt(corr) : '—') + '</div>' +
      '<div class="rc-cf-cx"><div class="rc-cf-cx-h"><b>' + esc(t('rc_cf_cx_tit')) + '</b> · ' + esc(t('rc_cf_cx_sub')) + '</div>' +
      lista.map(e => '<div class="rc-cf-cx-l" data-rc-cxl="' + esc(e.codigo) + '"><span><b>' + esc(e.codigo) + '</b> <small>' + esc(e.corredor ? corrFmt(e.corredor) : '') + '</small></span><small>' + esc(t('rc_cf_cx_sis')) + ' ' + numFmt(e.qtd_restante || 0) + '</small><input type="number" inputmode="numeric" min="0" data-rc-cx="' + esc(e.codigo) + '" data-rc-de="' + (Number(e.qtd_restante) || 0) + '" value="' + (Number(e.qtd_restante) || 0) + '"></div>').join('') +
      '<div class="rc-cf-cx-l rc-cf-cx-nova"><span>' + esc(t('rc_cf_nova')) + '</span><small></small><input type="number" inputmode="numeric" min="0" id="rcCfNova" value="0"></div></div>' +
      '<div class="rc-cf-campos"><label>' + esc(t('rc_cf_corr')) + '<select id="rcCfCorr">' + corrOpts(corr) + '</select></label></div><div class="rc-cf-prev" id="rcCfPrev"></div></div>',
    ler: w => Object.assign(lerCaixas(w), { c: w.querySelector('#rcCfCorr').value }) });
  const w = document.querySelector('.es-mw'), c = w.querySelector('#rcCfCorr'), pv = w.querySelector('#rcCfPrev');
  const pintar = () => {
    const l = lerCaixas(w), partes = [];
    l.mudou.forEach(m => partes.push(t('rc_cf_cx_prev', { c: m.codigo, a: numFmt(m.de), d: numFmt(m.para) })));
    if (l.nova > 0) partes.push(t('rc_cf_nova_prev', { n: numFmt(l.nova) }));
    if (l.soma !== qtd) partes.push(t('rc_cf_est_prev', { a: numFmt(qtd), d: numFmt(l.soma) }));
    if ((c.value || '') !== corr) partes.push(t('r_corredor') + ': ' + (corr ? corrFmt(corr) : '—') + ' → ' + (c.value ? corrFmt(c.value) : '—'));
    w.querySelectorAll('[data-rc-cxl]').forEach(row => { const inp = row.querySelector('[data-rc-cx]'); row.classList.toggle('muda', !!inp && numDe(inp) !== Number(inp.dataset.rcDe)); });
    pv.className = 'rc-cf-prev' + (partes.length ? ' muda' : ''); pv.textContent = partes.length ? partes.join(' · ') : t('rc_cf_igual');
  };
  w.querySelectorAll('.rc-cf-porcx input, .rc-cf-porcx select').forEach(el => { el.addEventListener('input', pintar); el.addEventListener('change', pintar); });
  pintar(); setTimeout(() => { const f = w.querySelector('[data-rc-cx]'); if (f) { try { f.focus(); f.select(); } catch (e) {} } }, 30);
  pr.then(r => { if (!r) return; const v = r.extra; resolver(x, { caixas: v.caixas, nova: v.nova, corredor: v.c, corrAntes: corr }); });
}
/** 확인 (옛 rpc_rechecagem_resolver) — 요청을 다시 읽어 이미 닫혔으면 거절 · 통로 먼저(새 상자가 그 통로에서 태어나게) · 수량 · 요청 닫기는 한 batch */
async function resolver(x, o) {
  busy(true);
  try {
    let d = null; try { if (S.DB.fresh) S.DB.fresh('rechecagem'); d = await S.DB.get('rechecagem', x.id); } catch (e) {}
    if (!d || d.status !== 'aberta') throw new Error(t('rc_ja_resolvido'));
    const corrNovo = String(o.corredor || '').trim(), mudaCorr = corrNovo !== (o.corrAntes || '');
    if (mudaCorr) await E.definirCorredor([x.code], corrNovo);
    const fecha = r => ({ op: 'update', col: 'rechecagem', id: x.id, data: Object.assign({ status: 'resolvida', resolvidaEm: now(), resolvidaPor: eu(), resolvidaPorNome: quem(), corredorAntes: o.corrAntes || '', corredorDepois: corrNovo }, r) });
    const r = await E.conferir(x.code, { qtd: o.qtd, caixas: o.caixas, nova: o.nova, ref: x.id, motivo: 'Conferência ' + x.id + ' (' + ({ saldo: 'saldo errado', misturado: 'produto misturado' }[x.motivo] || 'não encontrado') + ')', fechar: fecha, mudouOutro: mudaCorr });
    busy(false);
    toast(!r.ajustado && !mudaCorr ? t('rc_cf_feito_igual') : o.caixas ? t('rc_cf_cx_feito', { a: numFmt(r.antes), d: numFmt(r.depois), n: numFmt(r.caixasAlteradas) }) : t('rc_cf_feito_ajuste', { antes: numFmt(r.antes), depois: numFmt(r.depois) }), 'good');
    if (r.novaEtiqueta) { const e = await E.lerEtiqueta(r.novaEtiqueta); if (e) E.escolherTamanho([e]); }
  } catch (e) { busy(false); toast(String(e.message || e), 'bad'); }
  await lerRecheca(); renderRc();
}
