/* ============================================================
 *  📦 Notes UPS (#/notesups) — 옛 THE ONE CORP WMS 의 Notes UPS 화면을 그대로 (레이아웃 · 글 · 키보드 · 6×4 라벨)
 *    옛 앱에서 Notes UPS 와 Notes Display(#/displays — displays.js) 는 한 가족의 화면 — 머리(nuCabecalhoHTML) · 숫자 칸(nuKpi) ·
 *    가게 찾기 + 가게 카드(cartazLojaHTML) · 라벨 인쇄 · 박스 합치기(nuUnirCaixas) 를 같이 씀. 여기서 그 공용 조각을 내보내고 displays.js 가 가져다 씀
 *    화면: 머리(경로 · 시계) · 숫자 4개(오늘 박스 — 어제 대비 % · 오늘 무게 · 오늘 출고 · 대기 — 가게 수) + 폰 FAB
 *          [새 박스] → 가게 찾기(계정 · 이름 · 주소 · Enter = 첫 번째 · 고객 등록) → 왼쪽: 몇 박스 → 박스마다 무게 · 길이 · 너비 · 높이(Enter 로 다음 칸 · 높이에서 Enter = 저장)
 *                                                                         오른쪽: 가게 카드(주소 + UPS 주소 확인 · 계정 · 전화 · 담당) — 가게를 고르면 UPS 확인이 저절로
 *          대기 줄(가게별 · 고르기 · 고른 것 인쇄 · 박스 합치기 · ⋮ 전부 인쇄 · 대기 줄 CSV · 고르기 지우기 · 가게 라벨 전부 · 줄마다 다시 인쇄 · 보기 · 고치기 · 빼기)
 *          기록(오늘 · 어제 · 7일 · 30일 · 직접 기간 · 검색 · 가게 · 계정 · 사람 · 상태 · 7일 그래프(만든 것 · 나간 것) · 합계 · 8줄씩 쪽 · CSV)
 *  upsnotes/{id} = { id, acct, store, sm, w, l, wd, h, caixa(옛 notas_ups.caixa — 보통 비어 있음), obs,
 *                    prods:[{ c(코드), n(이름), q }] (옛 nota_ups_itens) · texto(옛 Outros 글) · prod(라벨 · 목록에 보이는 "이름 ×수" — 옛 produtos_nome),
 *                    ndIds:[notasDisplay id] (Notes Display 에서 만든 박스) · dispId(예전 displays 문서 — v0.8.194~ 의 박스) · src:'notes'|'display',
 *                    st: 'open' | 'shipped' | 'x', at, by, byName, shippedAt, shippedBy, shipId(adhoc id), trk,
 *                    cancelAt, cancelBy, cancelByName, mergedInto(합쳐져 취소된 박스 → 새 박스 id), editAt, editBy }
 *    N/T 는 저장하지 않고 인쇄할 때 그 가게의 대기 줄 순서로 매김 (박스가 늘면 그 가게 전부 다시 인쇄 — 옛 13/09 규칙)
 *    박스 합치기 = 옛 rpc_nota_ups_unir: 같은 가게 · 아직 대기인 박스 2개 이상 → 새 박스(무게 · 크기 직접) 하나 · 상품은 코드별로 합침 · 옛 박스는 취소(mergedInto)
 *                  · 그 박스를 만든 Notes Display 줄의 notaIds 도 새 박스로 바꿈 — 한 batch
 *  권한: 화면 = 출고(can ship) · 옛 podeMexerEstoque(합치기 · Notes Display 일) = 세일즈맨이 아니고 출고 · 인보이스 · 주문 넣기 중 하나 (firestore ordJob 과 같음)
 *        옛 GERENTE · GERENTE1(남이 시작한 Display 를 끝내기 · 놓기) = 관리자 · 오너 · 창고 매니저(whmgr)
 *  옮기지 않음: 옛 1in 여유(UPS_FOLGA — 옛 앱에서도 0) · 팔레트(delivery) 와 묶기(새 앱에 delivery 화면 없음) · 옛 "인쇄 대기열" 프린터 서버
 * ============================================================ */
import { $, esc, toast, today, addDays, Router, printOpen } from './ui.js';
import { newId } from './db.js';
import { can, isTop, myJobs } from './main.js';
import { searchAccounts } from './accounts.js';
import { ICO as BICO, svg, css as sbCss, L3, num1, verHTML, verificar, aplicarVer } from './balcao.js';
import * as E from './etq.js';
import { NU_CSS, NU_MAIS, ETQN_CSS } from './notesups-css.js';
import { D } from './notes-txt.js';
import { LANG } from './i18n.js';
import { filaExpedicao, paginaHTML, seloHTML as prtSeloHTML, ligarSelo as prtLigarSelo } from './prtq.js';

let S = null;
export function register(state) { S = state; E.init(state); Object.assign(ICO, E.ICO, BICO, ICO_MAIS); Router.on('notesups', page); }
/* 아이콘 — balcao.js · etq.js 의 것 + 몇 개 (모듈이 서로 가져오므로 화면을 등록할 때 채움) */
export const ICO = {};
const ICO_MAIS = Object.assign({}, {
  casa: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
  lixo: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  baixar: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>'
});
export { svg };
const sub = (s, v) => { if (v) Object.keys(v).forEach(n => { s = s.split('{' + n + '}').join(String(v[n])); }); return s; };
/** 문구 — 옛 앱의 t · ti (Notes 사전 → 재고 사전) */
export const t = (k, v) => { const x = D[k]; return x ? sub(L3(x[0], x[1], x[2]), v) : E.t(k, v); };
export const numFmt = n => E.numFmt(n), dataBR = s => E.dataBR(s), horaCurta = s => E.horaCurta(s), quem = () => E.quem();

/* ---------- 권한 (옛 podeMexerEstoque · GERENTE · GERENTE1) ---------- */
export const vd = () => S.role === 'salesman';
export const mexe = () => !vd() && (can('ship') || can('invoice') || can('newOrder'));
export const gerente = () => isTop() || (S.role === 'manager' && myJobs().indexOf('whmgr') >= 0);
export const eu = () => String((S.user && S.user.email) || '').toLowerCase();
const podeCadastrar = () => !vd() && (isTop() || can('newOrder') || can('invoice'));   // 옛 clPodeSalvar — 거래처를 만들 수 있는 사람
export const agora = () => new Date().toISOString();

/* ---------- 공용 상태 (옛 S.nu*) — Notes UPS 와 Notes Display 가 가게 고르기를 같이 씀 ---------- */
export const N = { fila: null, hist: null, histDe: '', histAte: '', buscando: '', cli: '', busca: '', novo: false, qtd: 0, feitas: [], cx: {}, ult: null, sel: {}, menu: false,
  aberta: '', per: 'hoje', de: '', ate: '', hBusca: '', hLoja: '', hConta: '', hResp: '', hSt: '', hPag: 1, extra: null, render: null, voo: false };
export const _N = N;   // 시험용
export function injetarCss() { E.injetarCss(); sbCss(); if (document.getElementById('nuCss')) return; const st = document.createElement('style'); st.id = 'nuCss'; st.textContent = NU_CSS + NU_MAIS; document.head.appendChild(st); }
export const acctOf = c => (S.accounts && S.accounts.byCode ? S.accounts.byCode[c] : null) || null;
const ordem = (a, b) => String(a.at || '').localeCompare(String(b.at || '')) || String(a.id).localeCompare(String(b.id));

/* ---------- 박스 → 옛 v_notas_ups 줄 모양 ---------- */
const prodsTxt = n => (n.prods || []).map(p => (p.n || p.c) + ' ×' + p.q).join(', ');
/** 박스의 상품 (옛 produtos_nome — 상품 "이름 ×수" + Outros 글) · prod 는 예전 박스(Notes Display 이전 판)의 이름 */
export const prodTxt = n => [((n.prods || []).length ? prodsTxt(n) : (n.prod || '')), n.texto || ''].filter(Boolean).join(', ');
export const nuStatus = n => n.st === 'x' ? 'cancelada' : n.st === 'shipped' ? 'despachada' : 'esperando';
const lojaDe = n => n.store || (acctOf(n.acct) || {}).store || '';
const quemFez = n => n.byName || String(n.by || '').split('@')[0] || '—';
/** 옛 nuPeso — 무게는 반올림하지 않음 (12.5 lb 가 13 이 되면 UPS 요금이 틀림) */
export const nuPeso = v => { const n = Number(v) || 0; return n % 1 ? (Math.round(n * 10) / 10).toLocaleString('en-US') : numFmt(n); };
/** 옛 upsMedidaTxt — "13×11×9 in" */
export const medidaTxt = (c, l, a) => (Number(c) > 0 && Number(l) > 0 && Number(a) > 0) ? num1(c) + '×' + num1(l) + '×' + num1(a) + ' in' : '';
const nuDataISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
/** 옛 nuDiaDe — 짐 싸는 사람의 날짜 (UTC 가 아님) */
export const diaDe = ts => { if (!ts) return ''; const d = new Date(ts); return isNaN(d) ? String(ts).slice(0, 10) : nuDataISO(d); };

/* ---------- 자료 ---------- */
/** 대기 줄 (아직 안 나간 박스) — Shipping UPS 도 씀 */
export async function filaAberta() { const L = await S.DB.list('upsnotes', { where: [['st', '==', 'open']] }); return L.sort(ordem); }
/** 한 가게의 대기 박스 — Shipping UPS 카운터가 씀 */
export async function abertasDe(acct) { return (await filaAberta()).filter(n => n.acct === acct); }
export async function carregarFila(fresh) { try { if (fresh && S.DB.fresh) S.DB.fresh('upsnotes'); N.fila = await filaAberta(); } catch (e) { N.fila = N.fila || []; } }
const daLoja = acct => (N.fila || []).filter(n => n.acct === acct).sort(ordem);
/** 옛 prodExtra(배송 박스 무게 · 크기) 읽기 — 한 번 읽고 기억 (상품 화면에서 고치면 다음에 화면을 열 때 새로) */
export async function carregarExtra(force) { if (N.extra && !force) return N.extra; const m = {}; try { if (S.DB.fresh) S.DB.fresh('prodExtra'); (await S.DB.list('prodExtra')).forEach(r => { m[r.id] = r; }); } catch (e) {} N.extra = m; return m; }
export const extraDe = code => (N.extra || {})[code] || null;

/* 옛 nuPeriodo · nuJanela — 기록은 고른 기간 + 지난 7일(그래프 · 어제 비교) 을 한 번에 */
function periodo() {
  const hoje = today(), p = N.per || 'hoje';
  if (p === 'ontem') { const o = addDays(hoje, -1); return { de: o, ate: o }; }
  if (p === '7') return { de: addDays(hoje, -6), ate: hoje };
  if (p === '30') return { de: addDays(hoje, -29), ate: hoje };
  if (p === 'pers') { const de = N.de || hoje, ate = N.ate || hoje; return de <= ate ? { de, ate } : { de: ate, ate: de }; }
  return { de: hoje, ate: hoje };
}
function janela() { const p = periodo(), hoje = today(), sete = addDays(hoje, -6); return { de: p.de < sete ? p.de : sete, ate: p.ate > hoje ? p.ate : hoje }; }
export async function carregarHist(force) {
  const j = janela(); if (!force && N.hist && N.histDe === j.de && N.histAte === j.ate) return;
  if (N.buscando === j.de + '|' + j.ate) return; N.buscando = j.de + '|' + j.ate;
  try { if (S.DB.fresh) S.DB.fresh('upsnotes'); N.hist = (await S.DB.list('upsnotes', { where: [['at', '>=', addDays(j.de, -1) + 'T00:00:00'], ['at', '<=', addDays(j.ate, 1) + 'T23:59:59.999']] })).sort(ordem).reverse(); }
  catch (e) { N.hist = []; }
  N.histDe = j.de; N.histAte = j.ate; N.buscando = '';
}

/* ====================  6×4 라벨 (옛 etiquetaNotaUpsHTML)  ==================== */
export function etiquetaHTML(n) {
  const a = acctOf(n.acct) || {}, end = [a.addr, a.addr2, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')].filter(x => String(x || '').trim()), pr = prodTxt(n);
  return '<div class="etqn"><div class="etqn-topo"><span>THE ONE CORP</span><span>' + esc(diaDe(n.at) || today()) + '</span></div>' +
    (pr ? '<div class="etqn-cp"><div class="etqn-conta">' + esc(n.acct || '—') + '</div><div class="etqn-prod">' + esc(pr.substring(0, 60)) + '</div></div>' : '<div class="etqn-conta">' + esc(n.acct || '—') + '</div>') +
    '<div class="etqn-loja">' + esc(n.store || a.store || '') + '</div>' + (end.length ? '<div class="etqn-end">' + end.map(esc).join('<br>') + '</div>' : '') +
    '<div class="etqn-rod"><span class="etqn-cx">' + esc(String(n.cxN || 1)) + (n.semTotal ? '' : '/' + esc(String(n.cxT || 1))) + '</span><span class="etqn-med"><b>' + esc(num1(n.w)) + ' lb</b><i>' + esc(medidaTxt(n.l, n.wd, n.h).replace(' in', '')) + ' in</i></span></div></div>';
}
/** 옛 nuNotaEtiqueta — 번호는 그 가게의 지금 대기 줄 순서 (fila 가 없으면 받은 목록 안에서) */
function numerar(lista, fila) {
  return lista.map(n => { const da = (fila || lista).filter(x => x.acct === n.acct && x.st !== 'x' && x.st !== 'shipped').sort(ordem), i = da.findIndex(x => x.id === n.id); return Object.assign({}, n, { cxN: i < 0 ? 1 : i + 1, cxT: Math.max(da.length, 1) }); });
}
export function imprimirNotas(lista, fila, semTotal) {
  const L = numerar((lista || []).filter(Boolean), fila).map(n => semTotal ? Object.assign(n, { semTotal: true }) : n); if (!L.length) return 0;
  imprimirFolhas(L);
  return L.length;
}
/** 🖨 출고 PC 에이전트가 켜져 있으면 대기열로 (옛 imprimirNotasUps → etqFilaExpedicao 'etiqueta_notes_ups' · 박스 하나 = 일 하나 · 제목 "가게 2/3"), 아니면 브라우저 인쇄 창 */
function imprimirFolhas(L) {
  if (filaExpedicao(L.map(n => ({ titulo: String(n.store || n.acct || '') + ' ' + (n.cxN || 1) + (n.semTotal ? '' : '/' + (n.cxT || 1)), html: paginaHTML(ETQN_CSS, ['<div class="nulp">' + etiquetaHTML(n) + '</div>'], 4, 6) })), 'etiqueta_notes_ups')) return;
  printOpen('<style>' + ETQN_CSS + '</style>' + L.map(n => '<div class="nulp">' + etiquetaHTML(n) + '</div>').join(''));
}
/** 옛 nuImprimirLoja — 그 가게 대기 줄 전부 (번호를 다시 매김) */
export async function imprimirLoja(acct) { await carregarFila(true); return imprimirNotas(daLoja(acct), N.fila); }
/** 옛 ndImprimirNovas — 방금 생긴 박스만 · 번호에 "전체" 없이 */
export function imprimirNovas(docs) { return imprimirNotas(docs, (N.fila || []).length ? N.fila : null, true); }
function reimprimir(id) {
  const n = (N.fila || []).find(x => x.id === id) || (N.hist || []).find(x => x.id === id);
  if (!n) return toast(t('nu_vazio'), 'bad');
  if (n.st === 'x') return toast(t('nu_excl_tit'), 'bad');
  if (n.st === 'open' && (N.fila || []).some(x => x.id === id)) return imprimirNotas([n], N.fila);
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(n.caixa || ''));   // 나간 박스는 처음 라벨의 "2/3" (caixa) — 없으면 번호만
  imprimirFolhas([Object.assign({}, n, m ? { cxN: +m[1], cxT: +m[2] } : { cxN: 1, semTotal: true })]);
}

/* ====================  머리 · 숫자 칸 (옛 nuCabecalhoHTML · nuKpi · nuDelta)  ==================== */
const locale = () => LANG === 'en' ? 'en-US' : LANG === 'pt' ? 'pt-BR' : 'ko-KR';
function relogioHTML() {
  const d = new Date(); let dl = '', hr = '';
  try { dl = d.toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { dl = nuDataISO(d); }
  try { hr = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); } catch (e) {}
  return '<div class="nu-relogio" id="nuRelogio"><b>' + esc(dl) + '</b><span>' + esc(hr) + '</span></div>';
}
let TIQUE = null;
export function ligarRelogio() { if (TIQUE) return; TIQUE = setInterval(() => { const el = $('nuRelogio'); if (el) el.outerHTML = relogioHTML(); else { clearInterval(TIQUE); TIQUE = null; } }, 30000); }
export function cabecalhoHTML(disp) {
  const tit = t(disp ? 'nav_notesdisplay' : 'nav_notesups');
  return '<div class="page-head nu-head"><div><h1>' + esc(tit) + '<span class="nu-selo">UPS</span></h1><p>' + esc(t(disp ? 'nd_sub' : 'nu_sub')) + '</p></div>' +
    '<div class="nu-head-dir"><div class="nu-migalha">' + svg(ICO.casa, 14) + '<span>' + esc(t('nav_painel')) + '</span><i>›</i><span>' + esc(t('grp_expedicao')) + '</span><i>›</i><b>' + esc(tit) + '</b></div>' + relogioHTML() + '</div></div>';
}
export function kpiHTML(ico, cor, valor, rotulo, sub) {
  const nCh = String(valor == null ? '' : valor).length, tam = nCh > 11 ? ' v-xl' : nCh > 8 ? ' v-l' : '';
  return '<div class="fin-kpi nu-kpi' + tam + '"><div class="fin-kpi-ico ' + cor + '">' + svg(ico, 19) + '</div><div class="fin-kpi-c"><span class="lbl">' + esc(rotulo) + '</span><b>' + esc(valor) + '</b><span class="sub">' + sub + '</span></div></div>';
}
function delta(hoje, ontem, un) {
  if (!ontem) return '<i class="nu-delta n">' + esc(t('nu_sem_ontem')) + '</i>';
  const pc = Math.round((hoje - ontem) / ontem * 100), cls = pc > 0 ? 'up' : pc < 0 ? 'dn' : 'n', seta = pc > 0 ? '↗' : pc < 0 ? '↘' : '—';
  return '<i class="nu-delta ' + cls + '">' + seta + ' ' + Math.abs(pc) + '%</i> ' + esc(t('nu_de_ontem', { n: numFmt(Math.round(ontem)) + (un || '') }));
}
function kpisHTML() {
  const hist = N.hist || [], fila = N.fila || [], hoje = today(), ontem = addDays(hoje, -1);
  const criadas = d => hist.filter(n => diaDe(n.at) === d && n.st !== 'x'), desp = d => hist.filter(n => n.st === 'shipped' && diaDe(n.shippedAt) === d), pesa = L => L.reduce((a, n) => a + (Number(n.w) || 0), 0);
  const ch = criadas(hoje), co = criadas(ontem), ph = pesa(ch), po = pesa(co), dh = desp(hoje).length, dob = desp(ontem).length, lojas = new Set(fila.map(n => n.acct)).size;
  return '<div class="nu-kpis">' + kpiHTML(ICO.caixa, '', numFmt(ch.length), t('nu_kpi_caixas'), delta(ch.length, co.length, '')) +
    kpiHTML(ICO.peso, 'x', numFmt(Math.round(ph)) + ' lb', t('nu_kpi_peso'), delta(ph, po, ' lb')) +
    kpiHTML(ICO.venda, 'g', numFmt(dh), t('nu_kpi_desp'), delta(dh, dob, '')) +
    kpiHTML(ICO.relogio, 'a', numFmt(fila.length), t('nu_kpi_esp'), '<i class="nu-delta n">' + esc(t('nu_lojas', { n: numFmt(lojas) })) + '</i>') +
    '<button type="button" class="nu-nova fab-cel" data-act="nu-novo">' + svg(ICO.caixa, 24) + '<span>' + esc(t('nu_novo')) + '</span></button></div>';
}

/* ====================  가게 찾기 · 가게 카드 (옛 nuBuscaResultadosHTML · cartazLojaHTML)  ==================== */
const achados = () => { const q = String(N.busca || '').trim(); return q ? searchAccounts(S.accounts || [], q, 12).filter(a => !a.inactive) : []; };
export function buscaResHTML() {
  const L = achados(); let h = '<div id="nuBuscaRes">';
  if (String(N.busca || '').trim()) h += L.length ? '<div class="ups-achados">' + L.map((a, i) => '<button type="button" class="ups-cli' + (i ? '' : ' primeiro') + '" data-act="nu-cli" data-id="' + esc(a.acct) + '"><b>' + esc(a.store || '') + '</b><span class="ups-conta">' + esc(a.acct || t('nu_sem_conta')) + '</span><span class="ups-end">' + esc([a.addr, a.city, a.state].filter(Boolean).join(', ')) + '</span></button>').join('') + '</div>'
    : '<div class="graf-vazio">' + esc(t('nu_ninguem')) + '</div>';
  return h + '</div>';
}
export function cartazHTML(a, cont) {
  const end = [a.addr, a.addr2, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')].filter(x => String(x || '').trim()), vazio = '<span class="ups-vazio">---</span>';
  const dado = (ico, rot, corpo) => '<div class="ups-dado"><span class="ups-dado-ico">' + svg(ico, 22) + '</span><div class="ups-dado-txt"><i>' + esc(rot) + '</i><b>' + corpo + '</b></div></div>';
  return '<div class="ups-cli-sel cartaz"><div class="ups-cartaz-head"><span class="ups-cli-cap">' + esc(t('nu_loja_sel')) + '</span><div class="ups-cartaz-bts"><button type="button" class="btn sm ups-trocar" data-act="nu-trocar">' + svg(ICO.troca, 15) + ' ' + esc(t('nu_trocar_loja')) + '</button></div></div>' +
    '<div class="ups-cartaz-corpo"><div class="ups-cli-id"><div class="ups-cli-nome">' + esc(a.store || '') + '</div><span class="ups-cli-pilula">' + esc(a.acct || t('nu_sem_conta')) + '</span>' +
    (cont ? '<div class="ups-cli-cx"><b>' + esc(numFmt(cont.n)) + '</b><i>' + esc(cont.rot) + '</i></div>' : '') + '</div>' +
    '<div class="ups-cli-dados">' + dado(ICO.pin, t('cl_end'), (end.length ? end.map(esc).join('<br>') : vazio) + '<div class="ups-ver">' + verHTML(a) + '</div>') +
    dado(ICO.predio, t('nu_conta_ups'), a.acct ? esc(a.acct) : vazio) + dado(ICO.tel, t('cl_tel'), a.tel ? esc(a.tel) : vazio) + dado(ICO.user, t('cl_contato'), a.contact ? esc(a.contact) : vazio) + '</div></div></div>';
}
/** 옛 suVerificarAuto — 고른 가게의 주소를 UPS 에 저절로 확인 (Shipping UPS 와 같은 길 · balcao.js 의 verificar) */
export function verificarAuto(a) { verificar(a, false, () => { const el = document.querySelector('#page .sb.nu-raiz .ups-ver'); if (el && N.cli === a.acct) el.innerHTML = verHTML(a); }); }
/** 가게 고르기 패널 (가게 없음) — 옛 nuLancarHTML 의 첫 부분 */
export function escolherLojaHTML(disp) {
  return '<div class="panel ups-painel nu-lancar"><div class="ups-fila-head"><h3 class="ups-h3">' + esc(t(disp ? 'nd_novo' : 'nu_novo')) + '</h3><button type="button" class="btn sm" data-act="nu-fechar-novo">' + svg(ICO.x, 14) + ' ' + esc(t('nu_fechar')) + '</button></div>' +
    '<div class="ups-passo"><label class="ups-lbl">' + esc(t('nu_cliente')) + '</label><div class="ups-busca-l"><input id="nuBusca" class="ups-busca" autocomplete="off" placeholder="' + esc(t('nu_busca_ph')) + '" value="' + esc(N.busca || '') + '">' +
    (podeCadastrar() ? '<button type="button" class="btn ups-cad" data-act="cl-novo">' + svg(ICO.mais, 15) + ' ' + esc(t('cl_cadastrar')) + '</button>' : '') + '</div></div>' + buscaResHTML() + '</div>';
}

/* ====================  새 박스 (옛 nuLancarHTML — Notes UPS 쪽)  ==================== */
const campo = (id, rot, val, ico, ph, k) => '<div class="field"><label>' + (ico ? '<span class="ups-campo-ico">' + svg(ico, 16) + '</span>' : '') + esc(rot) + '</label><input id="' + id + '" type="number" inputmode="decimal" min="0" step="0.1" data-nu-campo="' + k + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' value="' + esc(String(val == null ? '' : val)) + '"></div>';
function medirHTML() {
  const qtd = Number(N.qtd) || 0;
  if (!qtd) return '<div class="ups-card-head">' + svg(ICO.caixa, 26) + '<div><b>' + esc(t('nu_qtd_tit')) + '</b><span>' + esc(t('nu_qtd_sub')) + '</span></div></div>' +
    '<div class="nu-qtd-rapido">' + [1, 2, 3, 4, 5, 6].map(n => '<button type="button" class="nu-qtd-b" data-act="nu-qtd" data-n="' + n + '">' + n + '</button>').join('') + '</div>' +
    '<div class="ups-form2"><div class="field full"><label><span class="ups-campo-ico">' + svg(ICO.caixa, 16) + '</span>' + esc(t('nu_caixas_n')) + '</label><input id="nuQtd" type="number" inputmode="numeric" min="1" max="60" step="1" placeholder="' + esc(t('nu_qtd_ph')) + '" value=""></div></div>' +
    '<button type="button" class="btn primary grande cheio" data-act="nu-qtd-ok">' + esc(t('nu_qtd_seguir')) + ' ' + svg(ICO.dir, 16) + '</button>';
  const feitas = N.feitas.length, atual = feitas + 1, cx = N.cx || {};
  let passos = ''; for (let k = 1; k <= qtd; k++) passos += '<span class="nu-passo' + (k < atual ? ' ok' : k === atual ? ' agora' : '') + '">' + (k < atual ? svg(ICO.check, 13) : String(k)) + '</span>';
  return '<div class="ups-card-head">' + svg(ICO.caixa, 26) + '<div><b>' + esc(t('nu_cx_de', { i: atual, n: qtd })) + '</b><span>' + esc(t('nu_folga_dica')) + '</span></div>' +
    (N.ult && feitas ? '<button type="button" class="btn sm" data-act="nu-ultima">' + svg(ICO.repetir, 14) + ' ' + esc(t('su_ultima')) + '</button>' : '') +
    '<button type="button" class="btn sm nu-qtd-troca" data-act="nu-qtd-trocar">' + esc(t('nu_qtd_trocar')) + '</button></div>' +
    '<div class="nu-passos">' + passos + '</div>' +
    '<div class="su-dims-row"><div class="su-peso-grupo"><div class="su-grupo-rot">' + esc(t('nu_peso')) + '</div><div class="su-peso-campo">' + campo('nuP', ' ', cx.peso, ICO.peso, 'Ex: 12.5', 'peso') + '<span class="su-peso-un">lb</span></div></div>' +
    '<div class="su-dims-grupo"><div class="su-grupo-rot">' + esc(t('su_dim_grupo')) + '</div><div class="su-dims-3">' + campo('nuC', t('nu_comp'), cx.c, ICO.setaH, 'Ex: 10', 'c') + campo('nuL', t('nu_larg'), cx.l, ICO.setaH, 'Ex: 8', 'l') + campo('nuA', t('nu_alt'), cx.a, ICO.setaV, 'Ex: 6', 'a') + '</div></div></div>' +
    '<div class="ups-folga" id="nuFolga">' + esc(medidaTxt(cx.c, cx.l, cx.a)) + '</div>' +
    '<button type="button" class="btn primary grande cheio" data-act="nu-salvar">' + svg(atual >= qtd ? ICO.print : ICO.dir, 17) + ' ' + esc(atual >= qtd ? t('nu_salvar_n', { n: qtd }) : t('nu_seguir', { i: atual + 1, n: qtd })) + '</button>' +
    '<div class="nu-enter">' + esc(t('nu_enter_dica')) + '</div>';
}
/** 가게를 고른 뒤: 왼쪽 카드(miolo) + 오른쪽 가게 카드 — 옛 ups-topo */
export function lancarHTML(a, miolo, cont) { return '<div class="ups-topo"><div class="ups-card ups-card-cx">' + miolo + '</div>' + cartazHTML(a, cont) + '</div>'; }

/* ====================  대기 줄 (옛 nuFilaHTML)  ==================== */
const selIds = () => (N.fila || []).filter(n => N.sel[n.id]).map(n => n.id);
function filaHTML(cli, lista) {
  const sel = selIds();
  let h = '<div class="panel ups-painel"><div class="ups-fila-head"><h3 class="ups-h3">' + esc(cli ? t('nu_fila_do', { loja: cli.store || '' }) : t('nu_fila_n', { n: lista.length })) + '</h3>' +
    '<div class="nu-fila-bts"><button type="button" class="btn sm" data-act="nu-atualizar">' + svg(ICO.repetir, 15) + ' ' + esc(t('nu_atualizar')) + '</button>' +
    '<button type="button" class="btn sm" data-act="nu-imp-sel"' + (sel.length ? '' : ' disabled') + '>' + svg(ICO.print, 15) + ' ' + esc(t('nu_imprimir_sel')) + '</button>' +
    (mexe() ? '<button type="button" class="btn sm" data-act="nu-unir"' + (sel.length < 2 ? ' disabled' : '') + ' title="' + esc(t('nu_unir_dica')) + '">' + svg(ICO.caixa, 15) + ' ' + esc(t('nu_unir')) + '</button>' : '') +
    '<button type="button" class="btn sm ico" data-act="nu-menu" title="' + esc(t('acoes')) + '">' + svg(ICO.pontos, 16) + '</button>' +
    (N.menu ? '<div class="nu-menu"><button type="button" data-act="nu-imp-todas">' + svg(ICO.print, 15) + esc(t('nu_imprimir_todas')) + '</button><button type="button" data-act="nu-exp-fila">' + svg(ICO.baixar, 15) + esc(t('nu_exp_fila')) + '</button><button type="button" data-act="nu-limpar-sel">' + svg(ICO.x, 15) + esc(t('nu_limpar_sel')) + '</button></div>' : '') + '</div></div>';
  const todas = lista.length > 0 && sel.length === (N.fila || []).length;
  h += '<div class="tbl-scroll"><table><thead><tr><th class="chk"><input type="checkbox" data-act="nu-todos"' + (todas ? ' checked' : '') + '></th><th class="rn" style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">#</th>' +
    '<th>' + esc(t('nu_loja')) + '</th><th>' + esc(t('nu_conta')) + '</th><th>' + esc(t('nu_caixa')) + '</th><th class="num">' + esc(t('nu_peso')) + '</th><th>' + esc(t('nu_med_col')) + '</th><th>' + esc(t('responsavel')) + '</th><th>' + esc(t('data')) + '</th><th class="acoes" style="text-align:right">' + esc(t('acoes')) + '</th></tr></thead><tbody>';
  const grupos = [], por = {};
  lista.forEach(n => { const k = n.acct || '?'; if (!por[k]) { por[k] = { loja: lojaDe(n), conta: n.acct, itens: [] }; grupos.push(por[k]); } por[k].itens.push(n); });
  let i = 0;
  h += lista.length ? grupos.map(g => '<tr class="nu-grupo"><td colspan="10"><b>' + esc(g.loja || '—') + '</b><span class="nu-grupo-conta">' + esc(g.conta || '—') + '</span><span class="nu-grupo-n">' + esc(t('nu_grupo', { n: g.itens.length })) + '</span>' +
    '<button type="button" class="btn sm nu-grupo-imp" data-act="nu-imp-loja" data-cli="' + esc(g.conta || '') + '">' + svg(ICO.print, 14) + ' ' + esc(t('nu_imp_loja', { n: g.itens.length })) + '</button></td></tr>' +
    g.itens.map(n => { const id = esc(n.id), pr = prodTxt(n); return '<tr class="clic' + (N.aberta === n.id ? ' tr-aberta' : '') + '" data-nota="' + id + '"><td class="chk"><input type="checkbox" data-act="nu-marcar" data-id="' + id + '"' + (N.sel[n.id] ? ' checked' : '') + '></td><td class="rn" style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">' + (++i) + '</td>' +
      '<td class="principal"><b>' + esc(lojaDe(n)) + '</b>' + (pr ? '<small class="nu-prods-l">' + esc(pr) + '</small>' : '') + '</td><td data-l="' + esc(t('nu_conta')) + '" style="font-variant-numeric:tabular-nums">' + esc(n.acct || '—') + '</td>' +
      '<td data-l="' + esc(t('nu_caixa')) + '">' + esc(n.caixa || '—') + '</td><td class="num" data-l="' + esc(t('nu_peso')) + '">' + esc(nuPeso(n.w)) + '</td><td data-l="' + esc(t('nu_medida')) + '">' + esc(medidaTxt(n.l, n.wd, n.h)) + '</td>' +
      '<td data-l="' + esc(t('responsavel')) + '">' + esc(quemFez(n)) + '</td><td data-l="' + esc(t('data')) + '" style="color:var(--muted)">' + esc(dataBR(n.at)) + '</td>' +
      '<td class="acoes" style="text-align:right;white-space:nowrap"><button type="button" class="nu-acao" data-act="nu-imp" data-id="' + id + '" title="' + esc(t('nu_reimprimir')) + '">' + svg(ICO.print, 15) + '</button>' +
      '<button type="button" class="nu-acao" data-act="nu-ver" data-id="' + id + '" title="' + esc(t('nu_ver')) + '">' + svg(ICO.olho, 15) + '</button>' +
      '<button type="button" class="nu-acao" data-act="nu-ed" data-id="' + id + '" title="' + esc(t('nu_editar')) + '">' + svg(ICO.lapis, 15) + '</button>' +
      '<button type="button" class="nu-acao perigo" data-act="nu-excluir" data-id="' + id + '" title="' + esc(t('excluir')) + '">' + svg(ICO.lixo, 15) + '</button></td></tr>'; }).join('')).join('')
    : '<tr><td colspan="10"><div class="empty">' + svg(ICO.caixa, 40) + '<b>' + esc(t('nu_vazio')) + '</b></div></td></tr>';
  return h + '</tbody></table></div></div>';
}

/* ====================  기록 (옛 nuHistoricoHTML · nuFiltrosHTML · nuGraficoHTML · nuTotaisHTML · nuRegistrosHTML)  ==================== */
const doPeriodo = () => { const p = periodo(); return (N.hist || []).filter(n => { const d = diaDe(n.at); return d >= p.de && d <= p.ate; }); };
function filtrada() {
  const q = String(N.hBusca || '').trim().toLowerCase();
  return doPeriodo().filter(n => {
    if (N.hLoja && String(n.acct) !== String(N.hLoja)) return false;
    if (N.hConta && String(n.acct || '') !== String(N.hConta)) return false;
    if (N.hResp && quemFez(n) !== N.hResp) return false;
    if (N.hSt && nuStatus(n) !== N.hSt) return false;
    if (q && [lojaDe(n), n.acct, n.caixa, quemFez(n), n.trk].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
const opcoes = (id, rot, valor, ops, todos) => '<div class="field"><label>' + esc(rot) + '</label><select id="' + id + '"><option value="">' + esc(todos) + '</option>' + ops.map(o => '<option value="' + esc(o.v) + '"' + (String(valor || '') === String(o.v) ? ' selected' : '') + '>' + esc(o.r) + '</option>').join('') + '</select></div>';
function filtrosHTML() {
  const base = doPeriodo(), p = periodo(), lojas = [], contas = [], resps = [], vi = {};
  base.forEach(n => { if (!vi['L' + n.acct]) { vi['L' + n.acct] = 1; lojas.push({ v: String(n.acct), r: lojaDe(n) || '—' }); } if (n.acct && !vi['C' + n.acct]) { vi['C' + n.acct] = 1; contas.push({ v: n.acct, r: n.acct }); } const u = quemFez(n); if (u && !vi['U' + u]) { vi['U' + u] = 1; resps.push({ v: u, r: u }); } });
  const ord = a => a.sort((x, y) => String(x.r).localeCompare(String(y.r)));
  return '<div class="nu-filtros"><div class="field per"><label>' + esc(t('nu_periodo')) + '</label><div class="nu-per-campos"><input type="date" id="nuDe" value="' + esc(p.de) + '"><input type="date" id="nuAte" value="' + esc(p.ate) + '"></div></div>' +
    '<div class="field"><label>' + esc(t('nu_busca')) + '</label><input id="nuHBusca" autocomplete="off" placeholder="' + esc(t('nu_busca_hist_ph')) + '" value="' + esc(N.hBusca || '') + '"></div>' +
    opcoes('nuHLoja', t('nu_loja'), N.hLoja, ord(lojas), t('nu_todas')) + opcoes('nuHConta', t('nu_conta'), N.hConta, ord(contas), t('nu_todas')) + opcoes('nuHResp', t('responsavel'), N.hResp, ord(resps), t('nu_todos')) +
    opcoes('nuHSt', t('nu_hist_st'), N.hSt, [{ v: 'esperando', r: t('nu_st_esperando') }, { v: 'despachada', r: t('nu_st_despachada') }, { v: 'cancelada', r: t('nu_st_cancelada') }], t('nu_todos')) + '</div>';
}
/** 옛 rxEscala — 눈금 여섯 칸 */
function escala(max) { if (!(max > 0)) return { topo: 10, passo: 5 }; const alvo = max / 6, ex = Math.pow(10, Math.floor(Math.log(alvo) / Math.LN10)), n = alvo / ex, passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * ex; return { topo: Math.ceil(max / passo) * passo, passo }; }
function graficoHTML() {
  const hist = N.hist || [], hoje = today(), serie = []; let max = 0;
  for (let k = 6; k >= 0; k--) { const dia = addDays(hoje, -k), cri = hist.filter(n => diaDe(n.at) === dia && n.st !== 'x').length, des = hist.filter(n => n.st === 'shipped' && diaDe(n.shippedAt) === dia).length; max = Math.max(max, cri, des); serie.push({ rot: dia.slice(8) + '/' + dia.slice(5, 7), cri, des }); }
  const e = escala(max), topo = e.topo, X0 = 34, X1 = 412, Y0 = 14, Y1 = 158, faixa = (X1 - X0) / serie.length; let grade = '';
  for (let v = 0; v <= topo + 0.001; v += e.passo) { const y = Y1 - (v / topo) * (Y1 - Y0); grade += '<line class="g-grade" x1="' + X0 + '" y1="' + y.toFixed(1) + '" x2="' + X1 + '" y2="' + y.toFixed(1) + '"/><text class="g-esc" x="' + (X0 - 7) + '" y="' + (y + 3.5).toFixed(1) + '">' + numFmt(v) + '</text>'; }
  const barras = serie.map((m, i) => { const w = faixa * 0.28, x = X0 + i * faixa + faixa * 0.5 - w - 2, hc = Math.max(m.cri ? 2 : 0, Math.round(m.cri / topo * (Y1 - Y0))), hd = Math.max(m.des ? 2 : 0, Math.round(m.des / topo * (Y1 - Y0)));
    return '<rect class="g-cri" x="' + x.toFixed(1) + '" y="' + (Y1 - hc) + '" width="' + w.toFixed(1) + '" height="' + hc + '" rx="3"/><rect class="g-des" x="' + (x + w + 4).toFixed(1) + '" y="' + (Y1 - hd) + '" width="' + w.toFixed(1) + '" height="' + hd + '" rx="3"/><text class="g-rot" x="' + (X0 + i * faixa + faixa / 2).toFixed(1) + '" y="176">' + esc(m.rot) + '</text>'; }).join('');
  return '<div class="nu-graf"><svg viewBox="0 0 420 190" role="img" aria-label="' + esc(t('nu_uso_dia')) + '">' + grade + barras + '</svg></div><div class="nu-leg"><span><i></i>' + esc(t('nu_leg_criadas')) + '</span><span><i class="d"></i>' + esc(t('nu_leg_desp')) + '</span></div>';
}
function totaisHTML(L) {
  let peso = 0, desp = 0, canc = 0; L.forEach(n => { peso += Number(n.w) || 0; if (n.st === 'x') canc++; else if (n.st === 'shipped') desp++; });
  return '<div class="nu-hist-nums"><div class="lf-num"><b>' + numFmt(L.length) + '</b><span>' + esc(t('nu_tot_caixas')) + '</span></div><div class="lf-num"><b>' + numFmt(Math.round(peso)) + ' lb</b><span>' + esc(t('nu_tot_peso')) + '</span></div>' +
    '<div class="lf-num ok"><b>' + numFmt(desp) + '</b><span>' + esc(t('nu_tot_desp')) + '</span></div><div class="lf-num' + (canc ? ' ruim' : '') + '"><b>' + numFmt(canc) + '</b><span>' + esc(t('nu_tot_canc')) + '</span></div></div>';
}
const POR_PAG = 8;
const stHTML = n => { const st = nuStatus(n); return '<span class="badge ' + (st === 'despachada' ? 'ok' : st === 'cancelada' ? 'out' : 'av') + '">' + esc(t('nu_st_' + st)) + '</span>'; };
function registrosHTML(L) {
  const np = Math.ceil(L.length / POR_PAG) || 1; N.hPag = Math.max(1, Math.min(Number(N.hPag) || 1, np));
  const de = (N.hPag - 1) * POR_PAG, pag = L.slice(de, de + POR_PAG);
  let h = '<div class="nu-hcard"><h4>' + esc(t('nu_registros', { n: numFmt(L.length) })) + '</h4>';
  if (!L.length) return h + '<div class="graf-vazio">' + esc(t('nu_nada_filtro')) + '</div></div>';
  h += '<div class="tbl-scroll"><table><thead><tr><th class="rn" style="text-align:right">#</th><th>' + esc(t('nu_data_hora')) + '</th><th>' + esc(t('nu_loja')) + '</th><th>' + esc(t('nu_conta')) + '</th><th>' + esc(t('nu_caixa')) + '</th><th class="num">' + esc(t('nu_peso')) + '</th><th>' + esc(t('nu_med_col')) + '</th><th>' + esc(t('nu_hist_st')) + '</th><th>' + esc(t('responsavel')) + '</th><th class="acoes" style="text-align:right">' + esc(t('acoes')) + '</th></tr></thead><tbody>' +
    pag.map((x, i) => { const pr = prodTxt(x); return '<tr class="nu-h-l clic' + (N.aberta === x.id ? ' tr-aberta' : '') + '" data-hist="' + esc(x.id) + '"><td class="rn" style="text-align:right">' + (de + i + 1) + '</td><td data-l="' + esc(t('nu_data_hora')) + '" style="color:var(--muted)">' + esc(dataBR(x.at) + ' ' + horaCurta(x.at)) + '</td>' +
      '<td class="principal"><b>' + esc(lojaDe(x) || '—') + '</b>' + (pr ? '<small class="nu-prods-l">' + esc(pr) + '</small>' : '') + '</td><td data-l="' + esc(t('nu_conta')) + '" style="font-variant-numeric:tabular-nums">' + esc(x.acct || '—') + '</td><td data-l="' + esc(t('nu_caixa')) + '">' + esc(x.caixa || '—') + '</td>' +
      '<td class="num" data-l="' + esc(t('nu_peso')) + '">' + esc(nuPeso(x.w)) + '</td><td data-l="' + esc(t('nu_medida')) + '">' + esc(medidaTxt(x.l, x.wd, x.h)) + '</td><td data-l="' + esc(t('nu_hist_st')) + '">' + stHTML(x) + '</td><td data-l="' + esc(t('responsavel')) + '">' + esc(quemFez(x)) + '</td>' +
      '<td class="acoes" style="text-align:right;white-space:nowrap">' + (x.st === 'x' ? '' : '<button type="button" class="nu-acao" data-act="nu-imp" data-id="' + esc(x.id) + '" title="' + esc(t('nu_reimprimir')) + '">' + svg(ICO.print, 15) + '</button>') +
      '<button type="button" class="nu-acao" data-act="nu-ver" data-id="' + esc(x.id) + '" title="' + esc(t('nu_ver')) + '">' + svg(ICO.olho, 15) + '</button></td></tr>'; }).join('') + '</tbody></table></div>';
  let pg = '<div class="hist-pag nu-pag"><span>' + esc(t('nu_mostrando', { a: numFmt(L.length ? de + 1 : 0), b: numFmt(de + pag.length), t: numFmt(L.length) })) + '</span>';
  if (np > 1) { let bts = ''; const p = N.hPag; for (let k = 1; k <= np; k++) { if (k === 1 || k === np || Math.abs(k - p) <= 1) bts += k === p ? '<b>' + k + '</b>' : '<button type="button" data-act="nu-hpag" data-pag="' + k + '">' + k + '</button>'; else if (Math.abs(k - p) === 2) bts += '<i>…</i>'; }
    pg += '<div class="bts"><button type="button" data-act="nu-hpag" data-pag="' + Math.max(1, p - 1) + '"' + (p === 1 ? ' disabled' : '') + '>‹</button>' + bts + '<button type="button" data-act="nu-hpag" data-pag="' + Math.min(np, p + 1) + '"' + (p === np ? ' disabled' : '') + '>›</button></div>'; }
  return h + pg + '</div></div>';
}
function histPainelHTML() {
  const j = janela(), pronto = N.hist && N.histDe === j.de && N.histAte === j.ate;
  let h = '<div class="panel ups-painel nu-hist"><div class="nu-hist-cab"><div><h3 class="ups-h3">' + esc(t('nu_hist')) + '</h3><p>' + esc(t('nu_hist_sub')) + '</p></div><div class="nu-hist-bts"><button type="button" class="btn sm" data-act="nu-export">' + svg(ICO.baixar, 15) + ' ' + esc(t('nu_exportar')) + '</button>' +
    '<div class="nu-chips">' + [['hoje', t('nu_hoje')], ['ontem', t('nu_ontem')], ['7', t('nu_per_7')], ['30', t('nu_per_30')], ['pers', t('nu_per_pers')]].map(c => '<button type="button" class="nu-chip' + ((N.per || 'hoje') === c[0] ? ' on' : '') + '" data-act="nu-per" data-p="' + c[0] + '">' + esc(c[1]) + '</button>').join('') + '</div></div></div>';
  if (!pronto) { carregarHist().then(() => { if (location.hash.indexOf('#/notesups') === 0) render(); }); return h + '<div class="graf-vazio">' + esc(t('carregando')) + '</div></div>'; }
  const L = filtrada();
  return h + '<div id="nuHistCorpo">' + histCorpoHTML(L) + '</div></div>';
}
const histCorpoHTML = L => filtrosHTML() + '<div class="nu-hist-grid"><div class="nu-hcard"><h4>' + esc(t('nu_uso_dia')) + '</h4>' + graficoHTML() + totaisHTML(L) + '</div>' + registrosHTML(L) + '</div>';
/** 거르기는 아래 두 칸만 다시 그림 (검색 칸의 커서를 잃지 않게 — 옛 nuRepintarHist) */
function repintarHist() { const el = $('nuHistCorpo'); if (!el) return render(); const ae = document.activeElement, id = ae && ae.id, pos = ae && ae.selectionStart; el.innerHTML = histCorpoHTML(filtrada()); ligarHist(); if (id && $(id)) { const x = $(id); x.focus(); try { if (pos != null) x.setSelectionRange(pos, pos); } catch (e) {} } }
function csv(nome, cab, linhas) {
  const s = [cab].concat(linhas).map(l => l.map(c => { const v = String(c == null ? '' : c); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + s], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a'); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url);
  toast(t('nu_exp_ok', { n: numFmt(linhas.length) }), 'good');
}
function exportar() { const L = filtrada(); csv('notes-ups.csv', [t('data'), t('hora'), t('nu_loja'), t('nu_conta'), t('nu_caixa'), t('nu_peso'), t('nu_comp'), t('nu_larg'), t('nu_alt'), t('nu_hist_st'), t('responsavel'), t('nu_rastreio')], L.map(n => [dataBR(n.at), horaCurta(n.at), lojaDe(n), n.acct || '', n.caixa || '', n.w, n.l, n.wd, n.h, t('nu_st_' + nuStatus(n)), quemFez(n), n.trk || ''])); }
function exportarFila() { const L = N.fila || []; if (!L.length) return toast(t('nu_vazio'), 'bad'); csv('notes-ups-queue.csv', [t('nu_loja'), t('nu_conta'), t('nu_caixa'), t('nu_peso'), t('nu_comp'), t('nu_larg'), t('nu_alt'), t('responsavel'), t('data')], L.map(n => [lojaDe(n), n.acct || '', n.caixa || '', n.w, n.l, n.wd, n.h, quemFez(n), dataBR(n.at)])); }

/* ====================  TELA (옛 telaNotesUps)  ==================== */
export async function page() {
  injetarCss(); N.render = render;
  if (!can('ship')) { $('page').innerHTML = '<div class="sb nu-raiz"><div id="conteudo" class="nu-tela">' + cabecalhoHTML(false) + '<div class="aviso alerta">' + esc(L3('출고 권한이 없습니다', 'No shipping permission', 'Sem permissão de expedição')) + '</div></div></div>'; return; }
  if (!N.fila) { $('page').innerHTML = '<div class="sb nu-raiz"><div id="conteudo" class="nu-tela">' + cabecalhoHTML(false) + '<div class="placeholder">' + esc(t('carregando')) + '</div></div></div>'; await carregarFila(true); }
  else carregarFila(true).then(() => { if (location.hash.indexOf('#/notesups') === 0 && !ocupado()) render(); });
  if (location.hash.indexOf('#/notesups') !== 0) return;
  render();
}
/** 무엇을 적는 중이면 (창 · 입력) 다시 읽어도 화면을 그리지 않음 (옛 usuarioOcupado) */
export const ocupado = () => E.modalAberto() || (document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName));
export function render() {
  if (location.hash.indexOf('#/notesups') !== 0) return;
  const cli = N.cli ? acctOf(N.cli) || { acct: N.cli, store: '' } : null, lista = cli ? daLoja(cli.acct) : (N.fila || []);
  let h = cabecalhoHTML(false) + prtSeloHTML() + kpisHTML();
  if (N.novo || cli) h += cli ? lancarHTML(cli, medirHTML(), { n: lista.length, rot: t('nu_cx_loja') }) : escolherLojaHTML(false);
  h += filaHTML(cli, lista) + histPainelHTML();
  $('page').innerHTML = '<div class="sb nu-raiz"><div id="conteudo" class="nu-tela">' + h + '</div></div>';
  ligar(); prtLigarSelo(render);
  if (cli) verificarAuto(cli);
}
/** 입력 칸 · 공용 단추 묶기 — Notes Display 도 부름 */
export function ligarComum(raiz) {
  ligarRelogio();
  const b = $('nuBusca');
  if (b) {
    b.focus(); try { b.setSelectionRange(b.value.length, b.value.length); } catch (e) {}
    b.addEventListener('input', () => { N.busca = b.value; const r = $('nuBuscaRes'); if (r) r.outerHTML = buscaResHTML(); });
    b.addEventListener('keydown', ev => { if (ev.key !== 'Enter') return; ev.preventDefault(); const p = achados()[0]; if (p) escolherLoja(p.acct); else toast(t('nu_ninguem'), 'bad'); });
  }
  raiz.addEventListener('click', ev => { const el = ev.target.closest('[data-act="sb-ver"],[data-act="sb-ver-aplicar"]'); if (!el || !N.cli) return; const a = acctOf(N.cli); if (!a) return; ev.stopPropagation();
    if (el.dataset.act === 'sb-ver') verificar(a, true, () => { const v = document.querySelector('#page .sb.nu-raiz .ups-ver'); if (v) v.innerHTML = verHTML(a); });
    else aplicarVer(a).then(ok => { if (ok) N.render(); }); }, true);
}
export function escolherLoja(acct) { N.cli = acct; N.busca = ''; N.qtd = 0; N.feitas = []; N.cx = {}; N.render(); }
/** 공용 동작 (가게 고르기 · 바꾸기 · 새로 · 닫기 · 고객 등록) — 처리했으면 true */
export function acaoComum(a, el) {
  if (a === 'nu-cli') { escolherLoja(el.dataset.id); return true; }
  if (a === 'nu-novo') { N.novo = true; N.render(); return true; }
  if (a === 'nu-fechar-novo') { N.novo = false; N.busca = ''; N.render(); return true; }
  if (a === 'cl-novo') { import('./newacct.js').then(NA => NA.newAcctForm(String(N.busca || '').trim(), x => { if (x && x.acct) escolherLoja(x.acct); })); return true; }
  return false;
}
function ligar() {
  const raiz = document.querySelector('#page .sb.nu-raiz'); if (!raiz) return;
  ligarComum(raiz);
  const q = $('nuQtd'); if (q) q.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); qtdOk(); } });
  const ordemC = ['nuP', 'nuC', 'nuL', 'nuA'];
  ordemC.forEach((id, k) => { const el = $(id); if (!el) return;
    el.addEventListener('input', () => { N.cx[el.dataset.nuCampo] = el.value; const f = $('nuFolga'); if (f) f.textContent = medidaTxt(N.cx.c, N.cx.l, N.cx.a); });
    el.addEventListener('keydown', ev => { if (ev.key !== 'Enter') return; ev.preventDefault(); if (k < ordemC.length - 1) { const p = $(ordemC[k + 1]); if (p) p.focus(); return; } salvar(); }); });
  const pri = $('nuP'); if (pri && !$('nuBusca')) { try { pri.focus(); pri.select(); } catch (e) {} }
  ligarHist();
  raiz.addEventListener('click', clique);
  raiz.addEventListener('change', ev => { const c = ev.target.closest('input[type=checkbox][data-act]'); if (!c) return; marcar(c); });
}
function ligarHist() {
  const hb = $('nuHBusca'); if (hb) hb.addEventListener('input', () => { N.hBusca = hb.value; N.hPag = 1; repintarHist(); });
  [['nuHLoja', 'hLoja'], ['nuHConta', 'hConta'], ['nuHResp', 'hResp'], ['nuHSt', 'hSt']].forEach(([id, k]) => { const el = $(id); if (el) el.addEventListener('change', () => { N[k] = el.value; N.hPag = 1; repintarHist(); }); });
  ['nuDe', 'nuAte'].forEach(id => { const el = $(id); if (!el) return; el.addEventListener('change', () => { if (!el.value) return; const p = periodo(); N.per = 'pers'; N.de = id === 'nuDe' ? el.value : (N.de || p.de); N.ate = id === 'nuAte' ? el.value : (N.ate || p.ate); N.hPag = 1; carregarHist().then(render); }); });
}
function marcar(c) {
  const a = c.dataset.act;
  if (a === 'nu-marcar') { if (c.checked) N.sel[c.dataset.id] = 1; else delete N.sel[c.dataset.id]; return render(); }
  if (a === 'nu-todos') { const F = N.fila || []; N.sel = selIds().length === F.length ? {} : F.reduce((m, n) => { m[n.id] = 1; return m; }, {}); return render(); }
}
async function clique(ev) {
  const el = ev.target.closest('[data-act]');
  /* 폰: 줄(카드)을 누르면 펼쳐 계정 · 무게 · 단추가 보임 (옛 tr-aberta — 옛 화면은 이름만 보였음) */
  if (!el) { const tr = ev.target.closest('tr[data-nota],tr[data-hist]'); if (tr && window.innerWidth <= 760) { const k = tr.dataset.nota || tr.dataset.hist; N.aberta = N.aberta === k ? '' : k; document.querySelectorAll('#page .sb.nu-raiz tr.tr-aberta').forEach(x => x.classList.remove('tr-aberta')); if (N.aberta) tr.classList.add('tr-aberta'); } return; }
  if (el.tagName === 'INPUT') return;
  const a = el.dataset.act;
  if (acaoComum(a, el)) return;
  if (a === 'nu-trocar') { largarLote(true); N.cli = ''; N.busca = ''; N.novo = true; return render(); }
  if (a === 'nu-qtd') return qtdOk(el.dataset.n);
  if (a === 'nu-qtd-ok') return qtdOk();
  if (a === 'nu-qtd-trocar') return largarLote();
  if (a === 'nu-salvar') return salvar();
  if (a === 'nu-ultima') { const u = N.ult; if (u) N.cx = { peso: '', c: u.c, l: u.l, a: u.a }; return render(); }
  if (a === 'nu-atualizar') { await carregarFila(true); N.hist = null; await carregarHist(true); return render(); }
  if (a === 'nu-menu') { N.menu = !N.menu; return render(); }
  if (a === 'nu-imp-sel') { const ids = selIds(); if (!ids.length) return toast(t('nu_sel_nenhuma'), 'bad'); return imprimirNotas(N.fila.filter(n => ids.indexOf(n.id) >= 0), N.fila); }
  if (a === 'nu-imp-todas') { N.menu = false; render(); if (!(N.fila || []).length) return toast(t('nu_vazio'), 'bad'); return imprimirNotas(N.fila, N.fila); }
  if (a === 'nu-exp-fila') { N.menu = false; render(); return exportarFila(); }
  if (a === 'nu-limpar-sel') { N.sel = {}; N.menu = false; return render(); }
  if (a === 'nu-unir') return unirCaixas(selIds());
  if (a === 'nu-imp-loja') return imprimirLoja(el.dataset.cli);
  if (a === 'nu-imp') return reimprimir(el.dataset.id);
  if (a === 'nu-ver') return ver(el.dataset.id);
  if (a === 'nu-ed') return editar(el.dataset.id);
  if (a === 'nu-excluir') return excluir(el.dataset.id);
  if (a === 'nu-per') { N.per = el.dataset.p; N.hPag = 1; if (N.per === 'pers') { const p = periodo(); N.de = N.de || p.de; N.ate = N.ate || p.ate; } await carregarHist(); return render(); }
  if (a === 'nu-hpag') { N.hPag = Number(el.dataset.pag) || 1; return repintarHist(); }
  if (a === 'nu-export') return exportar();
}

/* ---------- 박스 넣기 (옛 nuQtdOk · nuSalvar · nuLargarLote) ---------- */
function qtdOk(n) {
  const q = n != null ? Number(n) : Number(($('nuQtd') || {}).value || 0);
  if (!(q >= 1 && q <= 60)) return toast(t('nu_qtd_inv'), 'bad');
  N.qtd = Math.floor(q); N.feitas = []; N.cx = {}; N.ult = null; render();
}
/** 묶음을 중간에 놓으면 지금까지 저장한 박스 라벨을 지금 인쇄 (라벨 없는 박스는 아무도 못 보냄) */
function largarLote(quieto) {
  const lote = N.feitas.length, loja = N.cli; N.qtd = 0; N.feitas = []; N.cx = {};
  if (!quieto) render();
  if (lote) imprimirLoja(loja).then(() => render());
}
async function salvar() {
  const cli = acctOf(N.cli); if (!cli) return toast(t('nu_escolha_cliente'), 'bad');
  const qtd = Number(N.qtd) || 0; if (!qtd) return toast(t('nu_qtd_inv'), 'bad');
  const c = N.cx || {}, peso = Number(c.peso), cc = Number(c.c), l = Number(c.l), al = Number(c.a);
  if (!(peso > 0)) { toast(t('nu_peso_inv'), 'bad'); const f = $('nuP'); if (f) f.focus(); return; }
  if (!(cc > 0 && l > 0 && al > 0)) { toast(t('nu_medida_inv'), 'bad'); const f = $('nuC'); if (f) f.focus(); return; }
  if (N.voo) return; N.voo = true;
  const id = newId('NU'), doc = { id, acct: cli.acct, store: cli.store || '', sm: cli.sm || '', w: peso, l: cc, wd: l, h: al, caixa: '', prods: [], texto: '', prod: '', src: 'notes', st: 'open', at: agora(), by: eu(), byName: quem() };
  try { await S.DB.set('upsnotes', id, doc); } catch (e) { N.voo = false; return toast(String(e.code || e.message), 'bad'); }
  N.voo = false; N.feitas.push(doc); N.hist = null;
  const feitas = N.feitas.length;
  if (feitas >= qtd) {
    const nLote = feitas, loja = cli.acct; N.qtd = 0; N.feitas = []; N.cx = {};
    N.cli = ''; N.busca = ''; N.novo = true;   // 묶음이 끝나면 가게 찾기가 저절로 (옛 06/09)
    const n = await imprimirLoja(loja); render();
    toast(n > nLote ? t('nu_ok_renum', { n: nLote, t: n }) : t('nu_ok_n', { n: n || nLote }), 'good');
    return;
  }
  N.cx = {}; N.ult = { c: c.c, l: c.l, a: c.a }; toast(t('nu_feita', { i: feitas, n: qtd }), 'good');
  await carregarFila(true); render();
}

/* ---------- 보기 · 고치기 · 빼기 (옛 nuVer · nuEditar · nuExcluir) ---------- */
const porId = id => (N.fila || []).find(x => x.id === id) || (N.hist || []).find(x => x.id === id) || null;
function aviso1(titulo, html, cls) {
  return new Promise(res => { const w = E.abrirModal('<div class="modal-head"><h2>' + esc(titulo) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body">' + html + '</div><div class="modal-foot"><button class="btn primary" data-act="fechar-modal" id="nuUmOk">' + esc(t('nu_fechar')) + '</button></div>', cls || 'nu-m');
    w.addEventListener('click', e => { if (e.target.closest('[data-act="fechar-modal"]')) res(); }); });
}
function ver(id) {
  const n = porId(id); if (!n) return;
  const l = (rot, val) => '<i>' + esc(rot) + '</i><b>' + val + '</b>';
  let h = '<div class="nu-det">' + l(t('nu_loja'), esc(lojaDe(n) || '—')) + l(t('nu_conta'), esc(n.acct || '—')) + l(t('nu_caixa'), esc(n.caixa || '—')) + l(t('nu_peso'), esc(nuPeso(n.w) + ' lb')) + l(t('nu_med_col'), esc(medidaTxt(n.l, n.wd, n.h))) +
    l(t('nu_hist_st'), stHTML(n)) + l(t('responsavel'), esc(quemFez(n))) + l(t('data'), esc(dataBR(n.at) + ' ' + horaCurta(n.at)));
  if (prodTxt(n)) h += l(L3('상품', 'Products', 'Produtos'), esc(prodTxt(n)));
  if (n.shippedAt) h += l(t('nu_desp_em'), esc(dataBR(n.shippedAt)));
  if (n.trk) h += l(t('nu_rastreio'), '<a class="rastreio" href="https://www.ups.com/track?tracknum=' + encodeURIComponent(String(n.trk).split(/\s+/)[0]) + '" target="_blank" rel="noopener noreferrer">' + esc(n.trk) + '</a>');
  if (n.st === 'x') h += l(t('nu_cancelada_por'), esc((n.cancelByName || String(n.cancelBy || '').split('@')[0] || '—') + ' · ' + dataBR(n.cancelAt)));
  if (n.obs) h += l(t('nu_obs'), esc(n.obs));
  aviso1(t('nu_det_tit'), h + '</div>');
}
function editar(id) {
  const n = porId(id); if (!n) return;
  if (n.st !== 'open') return toast(t('nu_excl_tit'), 'bad');
  const cp = (cid, rot, val) => '<div><label>' + esc(rot) + '</label><input id="' + cid + '" type="number" inputmode="decimal" min="0" step="0.1" value="' + esc(String(val == null ? '' : val)) + '"></div>';
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('nu_ed_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p style="margin:0 0 10px">' + esc(t('nu_ed_sub')) + '</p><div class="nu-ed-form">' +
    cp('nuEdP', t('nu_peso'), n.w) + cp('nuEdC', t('nu_comp'), n.l) + cp('nuEdL', t('nu_larg'), n.wd) + cp('nuEdA', t('nu_alt'), n.h) + '</div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(t('cancelar')) + '</button><button class="btn primary" id="nuEdOk">' + esc(t('salvar')) + '</button></div>', 'nu-m');
  const P = w.querySelector('#nuEdP'); if (P) { P.focus(); P.select(); }
  w.querySelector('#nuEdOk').onclick = async () => {
    const v = k => Number((w.querySelector('#' + k) || {}).value), peso = v('nuEdP'), c = v('nuEdC'), l = v('nuEdL'), a = v('nuEdA');
    if (!(peso > 0)) return toast(t('nu_peso_inv'), 'bad');
    if (!(c > 0 && l > 0 && a > 0)) return toast(t('nu_medida_inv'), 'bad');
    let x = null; try { if (S.DB.fresh) S.DB.fresh('upsnotes'); x = await S.DB.get('upsnotes', id); } catch (e) {}
    if (!x || x.st !== 'open') { E.fecharModal(); return toast(L3('박스를 찾을 수 없거나 이미 나갔습니다.', 'Box not found, or it already shipped.', 'Caixa não encontrada, ou já foi despachada.'), 'bad'); }
    try { await S.DB.update('upsnotes', id, { w: peso, l: c, wd: l, h: a, editAt: agora(), editBy: eu() }); } catch (e) { return toast(String(e.code || e.message), 'bad'); }
    E.fecharModal(); toast(t('nu_ed_ok'), 'good'); N.hist = null; await carregarFila(true); N.render();
  };
}
async function excluir(id) {
  const n = porId(id);
  const r = await E.pergunta({ titulo: t('nu_excl_tit'), texto: t('nu_excl_txt', { loja: (n && lojaDe(n)) || '', caixa: (n && n.caixa) || '—' }), sim: t('excluir'), nao: t('cancelar'), perigo: true, cls: 'nu-m' }); if (!r) return;
  let x = null; try { if (S.DB.fresh) S.DB.fresh('upsnotes'); x = await S.DB.get('upsnotes', id); } catch (e) {}
  if (!x || x.st !== 'open') return toast(L3('박스를 찾을 수 없거나 이미 나갔습니다.', 'Box not found, or it already shipped.', 'Caixa não encontrada, ou já foi despachada.'), 'bad');
  try { await S.DB.update('upsnotes', id, { st: 'x', cancelAt: agora(), cancelBy: eu(), cancelByName: quem() }); } catch (e) { return toast(String(e.code || e.message), 'bad'); }
  delete N.sel[id]; toast(t('nu_excluida'), 'good'); N.hist = null; await carregarFila(true); N.render();
}

/* ---------- 박스 합치기 (옛 nuUnirCaixas → rpc_nota_ups_unir) — Notes Display 의 완료 카드도 씀 ---------- */
export async function unirCaixas(ids, vals) {
  const cxs = (N.fila || []).filter(n => (ids || []).indexOf(n.id) >= 0);
  if (!mexe()) return;
  if (cxs.length < 2) return toast(t('nu_unir_min'), 'bad');
  if (cxs.some(n => n.acct !== cxs[0].acct)) return toast(t('nu_unir_loja'), 'bad');
  vals = vals || {};
  const peso = vals.peso != null ? vals.peso : cxs.reduce((a, n) => a + (Number(n.w) || 0), 0);
  const cp = (id, v, ph) => '<input id="' + id + '" type="number" inputmode="decimal" min="0" step="any" class="nd-unir-in" placeholder="' + esc(ph) + '" value="' + esc(v == null || v === '' ? '' : String(v)) + '">';
  const html = '<div class="nd-unir-corpo"><div class="nd-unir-lista nu-unir-lista">' + cxs.map(n => '<div class="nd-unir-l"><span><b>#' + esc(n.id) + ' · ' + esc(nuPeso(n.w)) + ' lb · ' + esc(medidaTxt(n.l, n.wd, n.h)) + '</b><small>' + esc(prodTxt(n) || '—') + '</small></span></div>').join('') + '</div>' +
    '<div class="nd-unir-campos"><label>' + esc(t('nd_unir_peso')) + cp('nuUP', peso ? Math.round(peso * 100) / 100 : '', 'lb') + '</label><label>' + esc(t('nd_unir_med')) + '<span class="nd-unir-3">' + cp('nuUC', vals.c, 'C') + cp('nuUL', vals.l, 'L') + cp('nuUA', vals.a, 'A') + '</span></label></div></div>';
  const r = await E.pergunta({ titulo: t('nu_unir_tit'), texto: t('nu_unir_txt', { n: cxs.length, loja: lojaDe(cxs[0]) }), html, sim: t('nu_unir'), nao: t('cancelar'), cls: 'nu-m',
    ler: w => ({ peso: Number((w.querySelector('#nuUP') || {}).value), c: Number((w.querySelector('#nuUC') || {}).value), l: Number((w.querySelector('#nuUL') || {}).value), a: Number((w.querySelector('#nuUA') || {}).value) }) });
  if (!r) return;
  const lido = r.extra;
  if (!(lido.peso > 0 && lido.c > 0 && lido.l > 0 && lido.a > 0)) { toast(t('nu_unir_inv'), 'bad'); return unirCaixas(ids, lido); }
  if (N.voo) return; N.voo = true;
  try {
    if (S.DB.fresh) S.DB.fresh('upsnotes');
    const atuais = []; for (const n of cxs) atuais.push(await S.DB.get('upsnotes', n.id));
    if (atuais.some(x => !x)) throw new Error(L3('박스 하나가 이제 없습니다.', 'One of the boxes no longer exists.', 'Uma das caixas não existe mais.'));
    if (atuais.some(x => x.st !== 'open')) throw new Error(L3('박스 하나가 이미 나갔거나 취소되었습니다.', 'One of the boxes already shipped or was cancelled.', 'Uma das caixas já foi despachada, está num delivery ou foi cancelada.'));
    const novo = await unirDocs(atuais, { w: lido.peso, l: lido.c, wd: lido.l, h: lido.a });
    atuais.forEach(n => { delete N.sel[n.id]; });
    N.voo = false; N.hist = null; await carregarFila(true); N.render();
    imprimirNovas([novo]); toast(t('nu_unir_ok'), 'good');
  } catch (e) { N.voo = false; toast(String(e.message || e), 'bad'); await carregarFila(true); N.render(); }
}
/** 박스 여럿 → 새 박스 하나 (한 batch) · 돌려줌: 새 박스 */
async function unirDocs(atuais, med) {
  const a0 = atuais[0], id = newId('NU'), pm = {}, prods = [], txt = [], nd = [], obs = [];
  atuais.slice().sort(ordem).forEach(n => { (n.prods || []).forEach(p => { if (pm[p.c]) pm[p.c].q += Number(p.q) || 0; else { pm[p.c] = { c: p.c, n: p.n, q: Number(p.q) || 0 }; prods.push(pm[p.c]); } }); if (!(n.prods || []).length && n.prod && !n.texto) txt.push(n.prod); if (n.texto) txt.push(n.texto); (n.ndIds || []).forEach(x => { if (nd.indexOf(x) < 0) nd.push(x); }); if (n.obs && obs.indexOf(n.obs) < 0) obs.push(n.obs); });
  const doc = { id, acct: a0.acct, store: a0.store || '', sm: a0.sm || '', w: med.w, l: med.l, wd: med.wd, h: med.h, caixa: '', prods, texto: txt.join(', '), prod: '', ndIds: nd, obs: obs.join(' · '), src: nd.length ? 'display' : 'notes', st: 'open', at: agora(), by: eu(), byName: quem(), unidas: atuais.map(n => n.id) };
  doc.prod = prodsTxt(doc);
  const ops = [{ op: 'set', col: 'upsnotes', id, data: doc }].concat(atuais.map(n => ({ op: 'update', col: 'upsnotes', id: n.id, data: { st: 'x', cancelAt: agora(), cancelBy: eu(), cancelByName: quem(), mergedInto: id } })));
  for (const x of nd) { try { const r = await S.DB.get('notasDisplay', x); if (r) { const old = atuais.map(n => n.id), L = (r.notaIds || []).filter(y => old.indexOf(y) < 0); L.push(id); ops.push({ op: 'update', col: 'notasDisplay', id: x, data: { notaIds: L } }); } } catch (e) {} }
  await S.DB.batch(ops);
  return doc;
}

/* ====================  다른 화면이 쓰는 것  ==================== */
/** 박스 여러 개 만들기 (Notes Display 완료 · 합치기) — docs 는 { acct, store, sm, w, l, wd, h, prods, texto, ndIds } · ops 를 같은 batch 에 같이 */
export function novaCaixa(o) {
  const id = newId('NU'), doc = Object.assign({ id, caixa: '', prods: [], texto: '', ndIds: [], src: 'display', st: 'open', at: agora(), by: eu(), byName: quem() }, o, { id });
  doc.prod = prodsTxt(doc); return doc;
}
/** Shipping UPS 가 라벨을 만든 뒤 — 박스를 "출고" 로 (예전 displays 에서 온 것은 그 요청도) */
export async function marcarEnviadas(ids, adhocId, trk) {
  const now = agora(), disp = {};
  for (const id of ids || []) { try { const n = await S.DB.get('upsnotes', id); await S.DB.update('upsnotes', id, { st: 'shipped', shippedAt: now, shippedBy: eu(), shipId: adhocId, trk: trk || '' }); if (n && n.dispId) disp[n.dispId] = 1; } catch (e) {} }
  for (const d of Object.keys(disp)) { try { await S.DB.update('displays', d, { st: 'shipped', shippedAt: now, track: trk || '', shipVia: 'UPS', updatedAt: now }); } catch (e) {} }
  N.fila = null; N.hist = null;
}
/** Shipping History 에서 void → 박스를 다시 대기 줄로 */
export async function devolver(adhocId) {
  let L = []; try { L = await S.DB.list('upsnotes', { where: [['shipId', '==', adhocId]] }); } catch (e) { return 0; }
  for (const n of L) { try { await S.DB.update('upsnotes', n.id, { st: 'open', shipId: '', trk: '', shippedAt: '', voidAt: agora() }); if (n.dispId) await S.DB.update('displays', n.dispId, { st: 'notes', track: '', updatedAt: agora() }); } catch (e) {} }
  N.fila = null; N.hist = null; return L.length;
}
