/* ============================================================
 *  📦 Notes UPS — 옛 THE ONE CORP WMS 의 Notes UPS 화면 (레이아웃 · 키보드 · 6×4 라벨)
 *    박스를 먼저 재서 라벨을 붙여 두고(가게마다 1/N), Shipping UPS 카운터에서 그 가게 박스를 골라 한 번에 UPS 라벨
 *    화면: 오늘 숫자 4개 · [새 박스] (가게 → 몇 박스 → 박스마다 무게 · 길이 · 너비 · 높이, Enter 로 다음 칸) · 대기 줄(가게별) · 기록(기간)
 *  upsnotes/{id} = { id, acct, store, sm, w, l, wd, h, prod(디스플레이 이름 — Notes Display 에서 온 박스), dispId, src:'notes'|'display',
 *                    st: 'open' | 'shipped' | 'x', at, by, byName, shippedAt, shipId(adhoc id), trk, cancelAt, cancelBy }
 *  N/T 는 저장하지 않고 인쇄할 때 그 가게의 대기 줄 순서로 매김 (박스가 늘면 전부 다시 인쇄 — 옛 앱과 같음)
 * ============================================================ */
import { $, esc, toast, confirmBox, today, addDays, Router, printOpen, openModal, closeModal } from './ui.js';
import { newId } from './db.js';
import { can } from './main.js';
import { searchAccounts } from './accounts.js';
import { ICO, svg, css, L3, num1 } from './balcao.js';
import { NU_CSS, ETQN_CSS } from './notesups-css.js';
import { LANG } from './i18n.js';

let S = null;
const N = { novo: false, cli: '', busca: '', qtd: 0, feitas: 0, cx: {}, ult: null, per: 'hoje', fila: null, hist: null, histChave: '', sel: {} };
export const _N = N;   // 시험용
export function register(state) { S = state; Router.on('notesups', page); }

const me = () => String((S.user && S.user.email) || '').toLowerCase();
const myName = () => (S.me && S.me.name) || (S.user && S.user.name) || me();
const acctOf = c => (S.accounts && S.accounts.byCode ? S.accounts.byCode[c] : null);
const dia = iso => { if (!iso) return ''; const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const hora = iso => { if (!iso) return ''; const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const medTxt = n => num1(n.l) + '×' + num1(n.wd) + '×' + num1(n.h);
const ordem = (a, b) => String(a.at || '').localeCompare(String(b.at || '')) || String(a.id).localeCompare(String(b.id));
function cssNu() { css(); if (document.getElementById('nuCss')) return; const st = document.createElement('style'); st.id = 'nuCss'; st.textContent = NU_CSS; document.head.appendChild(st); }

/* ---------- 데이터 ---------- */
/** 대기 줄 (아직 안 나간 박스) */
export async function filaAberta() { const L = await S.DB.list('upsnotes', { where: [['st', '==', 'open']] }); return L.sort(ordem); }
/** 한 가게의 대기 박스 — Shipping UPS 카운터가 씀 */
export async function abertasDe(acct) { return (await filaAberta()).filter(n => n.acct === acct); }
async function carregarFila() { try { N.fila = await filaAberta(); } catch (e) { N.fila = []; N.erro = String(e.code || e.message); } }
function periodo() { const h = today(); return N.per === 'ontem' ? { de: addDays(h, -1), ate: addDays(h, -1) } : N.per === '7' ? { de: addDays(h, -6), ate: h } : N.per === '30' ? { de: addDays(h, -29), ate: h } : { de: h, ate: h }; }
async function carregarHist() {
  const de7 = addDays(today(), -30), chave = de7;
  if (N.hist && N.histChave === chave) return;
  try { N.hist = (await S.DB.list('upsnotes', { where: [['at', '>=', de7 + 'T00:00:00']] })).sort(ordem).reverse(); N.histChave = chave; } catch (e) { N.hist = []; }
}

/* ---------- 라벨 ---------- */
export function etiquetaHTML(n) {
  const a = acctOf(n.acct) || {}, end = [a.addr, a.addr2, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')].filter(x => String(x || '').trim());
  return '<div class="etqn"><div class="etqn-topo"><span>THE ONE CORP</span><span>' + esc(dia(n.at) || today()) + '</span></div>' +
    (n.prod ? '<div class="etqn-cp"><div class="etqn-conta">' + esc(n.acct || '—') + '</div><div class="etqn-prod">' + esc(n.prod) + '</div></div>' : '<div class="etqn-conta">' + esc(n.acct || '—') + '</div>') +
    '<div class="etqn-loja">' + esc(n.store || a.store || '') + '</div>' + (end.length ? '<div class="etqn-end">' + end.map(esc).join('<br>') + '</div>' : '') +
    '<div class="etqn-rod"><span class="etqn-cx">' + esc(String(n.cxN || 1)) + (n.semTotal ? '' : '/' + esc(String(n.cxT || 1))) + '</span><span class="etqn-med"><b>' + esc(num1(n.w)) + ' lb</b><i>' + esc(medTxt(n)) + ' in</i></span></div></div>';
}
/** 번호 매기기 — 그 가게 대기 줄에서의 순서 (fila 가 없으면 받은 목록 안에서) */
function numerar(lista, fila) {
  return lista.map(n => { const da = (fila || lista).filter(x => x.acct === n.acct && x.st !== 'x' && x.st !== 'shipped').sort(ordem), i = da.findIndex(x => x.id === n.id); return Object.assign({}, n, { cxN: i < 0 ? 1 : i + 1, cxT: Math.max(da.length, 1) }); });
}
export function imprimirNotas(lista, fila, semTotal) {
  const L = numerar((lista || []).filter(Boolean), fila).map(n => semTotal ? Object.assign(n, { semTotal: true }) : n); if (!L.length) return;
  printOpen('<style>' + ETQN_CSS + '</style>' + L.map(n => '<div class="nulp">' + etiquetaHTML(n) + '</div>').join(''));
}
async function imprimirLoja(acct) { await carregarFila(); imprimirNotas(N.fila.filter(n => n.acct === acct), N.fila); }

/* ---------- 화면 ---------- */
let TIQUE = null;
function relogio() { const d = new Date(); return '<div class="nu-relogio" id="nuRelogio"><b>' + hora(d.toISOString()) + '</b>' + esc(d.toLocaleDateString(LANG === 'pt' ? 'pt-BR' : LANG === 'en' ? 'en-US' : 'ko-KR', { weekday: 'long', day: 'numeric', month: 'long' })) + '</div>'; }
function kpi(ico, cor, valor, rot, sub) { return '<div class="fin-kpi nu-kpi"><div class="fin-kpi-ico ' + cor + '">' + svg(ico, 19) + '</div><div class="fin-kpi-c"><span class="lbl">' + esc(rot) + '</span><b>' + esc(valor) + '</b><span class="sub"><i class="nu-delta n">' + esc(sub) + '</i></span></div></div>'; }
function kpisHTML() {
  const h = today(), o = addDays(h, -1), H = N.hist || [], fila = N.fila || [];
  const de = d => H.filter(n => n.st !== 'x' && dia(n.at) === d), saiu = d => H.filter(n => n.st === 'shipped' && dia(n.shippedAt) === d);
  const peso = L => L.reduce((s, n) => s + (Number(n.w) || 0), 0), lojas = new Set(fila.map(n => n.acct)).size;
  return '<div class="nu-kpis">' + kpi(ICO.caixa, 'azul', String(de(h).length), L3('오늘 박스', 'Boxes today', 'Caixas hoje'), L3('어제 ', 'Yesterday ', 'Ontem ') + de(o).length) +
    kpi(ICO.peso, 'verde', num1(peso(de(h))) + ' lb', L3('오늘 무게', 'Weight today', 'Peso hoje'), L3('어제 ', 'Yesterday ', 'Ontem ') + num1(peso(de(o))) + ' lb') +
    kpi(ICO.sai2, 'roxo', String(saiu(h).length), L3('오늘 출고', 'Shipped today', 'Despachadas hoje'), L3('어제 ', 'Yesterday ', 'Ontem ') + saiu(o).length) +
    kpi(ICO.relogio, 'ambar', String(fila.length), L3('대기', 'Waiting', 'Esperando'), L3('가게 ', 'Stores ', 'Lojas ') + lojas) + '</div>';
}
function buscaHTML() {
  const q = String(N.busca || '').trim(); if (!q) return '<div id="nuBuscaRes"></div>';
  const L = searchAccounts(S.accounts || [], q, 12).filter(a => !a.inactive);
  return '<div id="nuBuscaRes">' + (L.length ? '<div class="ups-achados">' + L.map((a, i) => '<button type="button" class="ups-cli' + (i ? '' : ' primeiro') + '" data-nu-cli="' + esc(a.acct) + '"><b>' + esc(a.store || '') + '</b><span class="ups-conta">#' + esc(a.acct) + '</span>' + (a.city ? '<span class="ups-tem">' + esc(a.city + (a.state ? ', ' + a.state : '')) + '</span>' : '') + '</button>').join('') + '</div>' : '<div class="graf-vazio">' + L3('찾는 가게가 없습니다', 'No store found', 'Nenhuma loja encontrada') + '</div>') + '</div>';
}
const campo = (id, rot, val, ico, ph) => '<div class="field"><label>' + (ico ? '<span class="ups-campo-ico">' + svg(ico, 16) + '</span>' : '') + rot + '</label><input id="' + id + '" type="number" inputmode="decimal" min="0" step="0.1"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' value="' + esc(String(val == null ? '' : val)) + '"></div>';
function lancarHTML() {
  if (!N.cli) return '<div class="panel ups-painel nu-lancar"><div class="nu-lancar-head"><h3 class="ups-h3">' + L3('새 박스', 'New box', 'Nova caixa') + '</h3><button type="button" class="btn sm" data-act="nu-fechar">' + svg(ICO.x, 14) + ' ' + L3('닫기', 'Close', 'Fechar') + '</button></div>' +
    '<div class="ups-passo"><label class="ups-lbl">' + L3('가게 계정 · 이름', 'Store account or name', 'Conta ou nome da loja') + '</label><div class="ups-busca-l"><input id="nuBusca" class="ups-busca" autocomplete="off" spellcheck="false" placeholder="' + esc(L3('계정 번호 또는 가게 이름', 'Account number or store name', 'Número da conta ou nome da loja')) + '" value="' + esc(N.busca) + '"></div></div>' + buscaHTML() + '</div>';
  const a = acctOf(N.cli) || { acct: N.cli, store: '' }, end = [a.addr, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')].filter(x => String(x || '').trim()).join(' · ');
  let h = '<div class="panel ups-painel nu-lancar"><div class="nu-lancar-head"><div><h3 class="ups-h3">' + esc(a.store || '') + ' <span class="ups-cli-pilula">#' + esc(a.acct) + '</span></h3><small class="muted">' + esc(end) + '</small></div><button type="button" class="btn sm" data-act="nu-trocar">' + svg(ICO.troca, 14) + ' ' + L3('가게 바꾸기', 'Change store', 'Trocar loja') + '</button></div>';
  if (!N.qtd) return h + '<label class="ups-lbl">' + L3('몇 박스?', 'How many boxes?', 'Quantas caixas?') + '</label><div class="nu-qtd">' + [1, 2, 3, 4, 5, 6].map(n => '<button type="button" class="nu-qtd-b" data-nu-qtd="' + n + '">' + n + '</button>').join('') + '<input id="nuQtd" type="number" inputmode="numeric" min="1" max="99" placeholder="#"><button type="button" class="btn primary" data-act="nu-qtd-ok">' + L3('계속', 'Continue', 'Continuar') + '</button></div></div>';
  h += '<div class="nu-passos">' + Array.from({ length: N.qtd }, (_, i) => '<span class="nu-passo' + (i < N.feitas ? ' feito' : i === N.feitas ? ' atual' : '') + '">' + (i + 1) + '</span>').join('') + '</div>' +
    '<div class="ups-card-head su-card-head"><i class="su-num">' + (N.feitas + 1) + '</i><div><b>' + L3('박스 ' + (N.feitas + 1) + ' / ' + N.qtd, 'Box ' + (N.feitas + 1) + ' of ' + N.qtd, 'Caixa ' + (N.feitas + 1) + ' de ' + N.qtd) + '</b><span>' + L3('잰 그대로 넣으세요', 'Enter as measured', 'Digite como mediu') + '</span></div>' +
    (N.ult ? '<button type="button" class="btn sm" data-act="nu-ultima">' + svg(ICO.repetir, 14) + ' ' + L3('지난 박스 크기 쓰기', 'Use last box size', 'Usar medidas da última caixa') + '</button>' : '') + '</div>' +
    '<div class="su-dims-row"><div class="su-peso-grupo"><div class="su-grupo-rot">' + L3('무게', 'Weight', 'Peso') + '</div><div class="su-peso-campo">' + campo('nuP', ' ', N.cx.w, ICO.peso, 'Ex: 12.5') + '<span class="su-peso-un">lb</span></div></div>' +
    '<div class="su-dims-grupo"><div class="su-grupo-rot">' + L3('크기 (인치)', 'Size (in)', 'Medidas (in)') + '</div><div class="su-dims-3">' + campo('nuC', L3('길이', 'Length', 'Comprimento'), N.cx.l, ICO.setaH, 'Ex: 10') + campo('nuL', L3('너비', 'Width', 'Largura'), N.cx.wd, ICO.setaH, 'Ex: 8') + campo('nuA', L3('높이', 'Height', 'Altura'), N.cx.h, ICO.setaV, 'Ex: 6') + '</div></div></div>' +
    '<div class="su-cx-bts"><div class="nu-enter">' + L3('Enter 로 다음 칸 · 높이에서 Enter = 박스 저장 · 마지막 박스에서 라벨 인쇄', 'Enter = next field · Enter on height saves · labels print after the last box', 'Enter = próximo campo · Enter na altura salva · etiquetas saem na última caixa') + '</div><button type="button" class="btn primary" data-act="nu-salvar">' + svg(ICO.mais, 15) + ' ' + L3('박스 저장', 'Save box', 'Salvar caixa') + '</button></div></div>';
  return h;
}
function filaHTML() {
  const F = N.fila || [];
  if (!F.length) return '<div class="graf-vazio">' + L3('기다리는 박스가 없습니다', 'No boxes waiting', 'Nenhuma caixa esperando') + '</div>';
  const grupos = {}; F.forEach(n => { (grupos[n.acct] = grupos[n.acct] || []).push(n); });
  const nSel = Object.keys(N.sel).filter(k => N.sel[k]).length;
  let h = '<div class="nu-sel-bar"><button type="button" class="btn" data-act="nu-imp-sel"' + (nSel ? '' : ' disabled') + '>' + svg(ICO.print, 15) + ' ' + L3('고른 것 인쇄', 'Print selected', 'Imprimir selecionadas') + ' (' + nSel + ')</button><button type="button" class="btn" data-act="nu-imp-todas">' + svg(ICO.print, 15) + ' ' + L3('전부 인쇄', 'Print all', 'Imprimir todas') + '</button></div>';
  h += '<div class="tbl-scroll"><table class="nu-tbl"><thead><tr><th style="width:34px"></th><th>#</th><th class="num">' + L3('무게', 'Weight', 'Peso') + '</th><th class="num">C×L×A (in)</th><th class="nu-mob-x">' + L3('넣은 사람', 'By', 'Por') + '</th><th></th></tr></thead><tbody>';
  Object.keys(grupos).forEach(acct => {
    const G = grupos[acct], a = acctOf(acct) || {}, peso = G.reduce((s, n) => s + (Number(n.w) || 0), 0);
    h += '<tr class="nu-grupo"><td colspan="6"><div class="nu-g-l"><b>' + esc(G[0].store || a.store || '') + '</b><span class="ups-cli-pilula">#' + esc(acct) + '</span><small>' + L3(G.length + '박스 · ' + num1(peso) + ' lb', G.length + ' box(es) · ' + num1(peso) + ' lb', G.length + ' caixa(s) · ' + num1(peso) + ' lb') + '</small><button type="button" class="btn sm" data-nu-imp-loja="' + esc(acct) + '">' + svg(ICO.print, 14) + ' ' + L3(G.length + '장 인쇄', 'Print ' + G.length + ' label(s)', 'Imprimir as ' + G.length + ' etiquetas') + '</button></div></td></tr>';
    G.forEach((n, i) => { h += '<tr data-nota="' + esc(n.id) + '"><td><input type="checkbox" data-nu-sel="' + esc(n.id) + '"' + (N.sel[n.id] ? ' checked' : '') + '></td><td><span class="nu-cxn">' + (i + 1) + '/' + G.length + '</span>' + (n.prod ? '<span class="nu-prod">' + esc(n.prod) + '</span>' : '') + '</td><td class="num">' + num1(n.w) + ' lb</td><td class="num">' + esc(medTxt(n)) + '</td><td class="nu-mob-x">' + esc(String(n.byName || n.by || '').split('@')[0]) + ' · ' + esc(hora(n.at)) + '</td>' +
      '<td><div class="nu-acoes"><button type="button" class="btn-etq" data-nu-imp="' + esc(n.id) + '" title="' + esc(L3('다시 인쇄', 'Reprint', 'Reimprimir')) + '">' + svg(ICO.print, 15) + '</button><button type="button" class="btn-etq" data-nu-ed="' + esc(n.id) + '" title="' + esc(L3('고치기', 'Edit', 'Corrigir')) + '">' + svg(ICO.lapis, 15) + '</button><button type="button" class="btn-etq" data-nu-x="' + esc(n.id) + '" title="' + esc(L3('취소', 'Cancel', 'Cancelar')) + '">' + svg(ICO.x, 15) + '</button></div></td></tr>'; });
  });
  return h + '</tbody></table></div>';
}
function histHTML() {
  if (!N.hist) return '<div class="graf-vazio">' + L3('읽는 중…', 'Loading…', 'Carregando…') + '</div>';
  const p = periodo(), L = N.hist.filter(n => { const d = dia(n.at); return d >= p.de && d <= p.ate; });
  const chips = [['hoje', L3('오늘', 'Today', 'Hoje')], ['ontem', L3('어제', 'Yesterday', 'Ontem')], ['7', L3('7일', '7 days', '7 dias')], ['30', L3('30일', '30 days', '30 dias')]];
  const vivas = L.filter(n => n.st !== 'x');
  let h = '<div class="nu-hist-top"><div class="nu-chips">' + chips.map(c => '<button type="button" class="nu-chip' + (N.per === c[0] ? ' on' : '') + '" data-nu-per="' + c[0] + '">' + c[1] + '</button>').join('') + '</div></div>' +
    '<div class="nu-hist-tot"><span>' + L3('박스', 'Boxes', 'Caixas') + '<b>' + vivas.length + '</b></span><span>' + L3('무게', 'Weight', 'Peso') + '<b>' + num1(vivas.reduce((s, n) => s + (Number(n.w) || 0), 0)) + ' lb</b></span><span>' + L3('출고', 'Shipped', 'Despachadas') + '<b>' + L.filter(n => n.st === 'shipped').length + '</b></span><span>' + L3('취소', 'Cancelled', 'Canceladas') + '<b>' + L.filter(n => n.st === 'x').length + '</b></span></div>';
  if (!L.length) return h + '<div class="graf-vazio">' + L3('이 기간에 박스가 없습니다', 'No boxes in this period', 'Nenhuma caixa no período') + '</div>';
  const st = n => n.st === 'shipped' ? '<span class="nu-st ok">' + L3('출고', 'Shipped', 'Despachada') + '</span>' + (n.trk ? ' <small>' + esc(n.trk) + '</small>' : '') : n.st === 'x' ? '<span class="nu-st x">' + L3('취소', 'Cancelled', 'Cancelada') + '</span>' : '<span class="nu-st">' + L3('대기', 'Waiting', 'Esperando') + '</span>';
  return h + '<div class="tbl-scroll"><table class="nu-tbl"><thead><tr><th>' + L3('날짜', 'Date', 'Data') + '</th><th>' + L3('가게', 'Store', 'Loja') + '</th><th class="num">' + L3('무게', 'Weight', 'Peso') + '</th><th class="num nu-mob-x">C×L×A</th><th>' + L3('상태', 'Status', 'Status') + '</th><th></th></tr></thead><tbody>' +
    L.map(n => '<tr><td>' + esc(dia(n.at)) + ' ' + esc(hora(n.at)) + '</td><td><b>' + esc(n.store || '') + '</b> <small class="muted">#' + esc(n.acct) + '</small>' + (n.prod ? '<span class="nu-prod">' + esc(n.prod) + '</span>' : '') + '</td><td class="num">' + num1(n.w) + '</td><td class="num nu-mob-x">' + esc(medTxt(n)) + '</td><td>' + st(n) + '</td><td>' + (n.st !== 'x' ? '<div class="nu-acoes"><button type="button" class="btn-etq" data-nu-imp-h="' + esc(n.id) + '" title="' + esc(L3('다시 인쇄', 'Reprint', 'Reimprimir')) + '">' + svg(ICO.print, 15) + '</button></div>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
}
export async function page() {
  cssNu();
  if (!can('ship')) { $('page').innerHTML = '<div class="sb"><div class="page-head"><div><h1>Notes UPS</h1><p>' + L3('출고 권한이 없습니다', 'No shipping permission', 'Sem permissão de expedição') + '</p></div></div></div>'; return; }
  if (!N.fila) await carregarFila();
  if (!N.hist) await carregarHist();
  const foco = document.activeElement && /^nu[PCLA]$/.test(document.activeElement.id) ? document.activeElement.id : null;
  $('page').innerHTML = '<div class="sb"><div class="su-migalha">' + L3('대시보드', 'Dashboard', 'Painel') + ' <span>›</span> ' + L3('출고', 'Shipping', 'Expedição') + ' <span>›</span> Notes UPS</div>' +
    '<div class="page-head"><div><h1>Notes UPS<span class="nu-selo">UPS</span></h1><p>' + L3('박스를 재서 라벨을 붙이고 · Shipping UPS 에서 한 번에 보냅니다', 'Measure and label boxes · ship them together in Shipping UPS', 'Meça e etiquete as caixas · despache juntas no Shipping UPS') + '</p></div><div class="nu-head-dir">' + relogio() +
    (N.novo || N.cli ? '' : '<button type="button" class="btn primary" data-act="nu-novo">' + svg(ICO.mais, 15) + ' ' + L3('새 박스', 'New box', 'Nova caixa') + '</button>') + '</div></div>' +
    kpisHTML() + (N.novo || N.cli ? lancarHTML() : '') +
    '<div class="panel ups-painel"><div class="ups-fila-head"><h3 class="ups-h3">' + L3('대기 줄', 'Queue', 'Fila') + ' · ' + (N.fila || []).length + '</h3></div><div id="nuFila">' + filaHTML() + '</div></div>' +
    '<div class="panel ups-painel"><div class="ups-fila-head"><h3 class="ups-h3">' + L3('기록', 'History', 'Histórico') + '</h3></div><div id="nuHist">' + histHTML() + '</div></div></div>';
  ligar(foco);
  if (!TIQUE) TIQUE = setInterval(() => { const el = $('nuRelogio'); if (el) el.outerHTML = relogio(); }, 30000);
}
function ligar(foco) {
  const on = (sel, f) => document.querySelectorAll('.sb ' + sel).forEach(b => b.onclick = () => f(b));
  on('[data-act="nu-novo"]', () => { N.novo = true; page().then(() => $('nuBusca') && $('nuBusca').focus()); });
  on('[data-act="nu-fechar"]', () => { N.novo = false; N.busca = ''; page(); });
  on('[data-act="nu-trocar"]', () => trocar());
  const inp = $('nuBusca');
  if (inp) { inp.oninput = () => { N.busca = inp.value; $('nuBuscaRes').outerHTML = buscaHTML(); ligarAchados(); }; inp.onkeydown = e => { if (e.key === 'Enter') { const f = document.querySelector('.sb [data-nu-cli]'); if (f) f.click(); } }; ligarAchados(); }
  on('[data-nu-qtd]', b => { N.qtd = +b.dataset.nuQtd; N.feitas = 0; N.cx = {}; page().then(() => $('nuP') && $('nuP').focus()); });
  on('[data-act="nu-qtd-ok"]', () => { const v = Math.floor(Number(($('nuQtd') || {}).value)); if (!(v >= 1 && v <= 99)) return toast(L3('박스 수를 넣으세요 (1~99)', 'Enter the number of boxes (1–99)', 'Digite a quantidade de caixas (1–99)'), 'bad'); N.qtd = v; N.feitas = 0; N.cx = {}; page().then(() => $('nuP') && $('nuP').focus()); });
  if ($('nuQtd')) $('nuQtd').onkeydown = e => { if (e.key === 'Enter') { const b = document.querySelector('.sb [data-act="nu-qtd-ok"]'); if (b) b.click(); } };
  const ids = ['nuP', 'nuC', 'nuL', 'nuA'], k = { nuP: 'w', nuC: 'l', nuL: 'wd', nuA: 'h' };
  ids.forEach((id, i) => { const el = $(id); if (!el) return; el.oninput = () => { N.cx[k[id]] = el.value; };
    el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (i < 3) { $(ids[i + 1]).focus(); $(ids[i + 1]).select(); } else salvar(); } }; });
  on('[data-act="nu-salvar"]', () => salvar());
  on('[data-act="nu-ultima"]', () => { if (!N.ult) return; N.cx = { w: '', l: N.ult.l, wd: N.ult.wd, h: N.ult.h }; page().then(() => $('nuP') && $('nuP').focus()); });
  document.querySelectorAll('.sb [data-nu-sel]').forEach(c => c.onchange = () => { N.sel[c.dataset.nuSel] = c.checked; const b = document.querySelector('.sb [data-act="nu-imp-sel"]'), n = Object.keys(N.sel).filter(x => N.sel[x]).length; if (b) { b.disabled = !n; b.lastChild.textContent = ' ' + L3('고른 것 인쇄', 'Print selected', 'Imprimir selecionadas') + ' (' + n + ')'; } });
  on('[data-act="nu-imp-sel"]', () => imprimirNotas((N.fila || []).filter(n => N.sel[n.id]), N.fila));
  on('[data-act="nu-imp-todas"]', () => imprimirNotas(N.fila || [], N.fila));
  on('[data-nu-imp-loja]', b => imprimirLoja(b.dataset.nuImpLoja));
  on('[data-nu-imp]', b => imprimirNotas([(N.fila || []).find(n => n.id === b.dataset.nuImp)], N.fila));
  on('[data-nu-imp-h]', b => { const n = (N.hist || []).find(x => x.id === b.dataset.nuImpH); if (!n) return; if (n.st === 'open') imprimirNotas([n], N.fila); else imprimirNotas([Object.assign({}, n, { st: 'open' })], null, true); });
  on('[data-nu-ed]', b => editar((N.fila || []).find(n => n.id === b.dataset.nuEd)));
  on('[data-nu-x]', b => cancelar((N.fila || []).find(n => n.id === b.dataset.nuX)));
  on('[data-nu-per]', b => { N.per = b.dataset.nuPer; $('nuHist').innerHTML = histHTML(); ligar(); });
  if (foco && $(foco)) setTimeout(() => { try { $(foco).focus(); } catch (e) {} }, 0);
}
function ligarAchados() { document.querySelectorAll('.sb [data-nu-cli]').forEach(b => b.onclick = () => { N.cli = b.dataset.nuCli; N.busca = ''; N.qtd = 0; N.feitas = 0; N.cx = {}; N.ult = null; page().then(() => { const q = $('nuQtd'); if (q) q.focus(); }); }); }
/** 가게를 바꾸거나 닫으면 지금까지 저장한 박스 라벨을 인쇄 (라벨 없는 박스는 아무도 못 보냄) */
async function trocar() { const cli = N.cli, feitas = N.feitas, total = N.qtd; N.cli = ''; N.qtd = 0; N.feitas = 0; N.cx = {}; N.ult = null; N.novo = true; if (cli && feitas && feitas < total) await imprimirLoja(cli); page(); }

async function salvar() {
  const c = N.cx;
  if (!(Number(c.w) > 0)) { toast(L3('무게를 넣으세요', 'Enter the weight', 'Digite o peso'), 'bad'); return $('nuP') && $('nuP').focus(); }
  if (!(Number(c.l) > 0 && Number(c.wd) > 0 && Number(c.h) > 0)) { toast(L3('길이 · 너비 · 높이를 넣으세요', 'Enter length, width and height', 'Digite comprimento, largura e altura'), 'bad'); return $('nuC') && $('nuC').focus(); }
  const a = acctOf(N.cli) || { acct: N.cli }, id = newId('NU'), now = new Date().toISOString();
  const doc = { id, acct: a.acct, store: a.store || '', sm: a.sm || '', w: Number(c.w), l: Number(c.l), wd: Number(c.wd), h: Number(c.h), prod: '', dispId: '', src: 'notes', st: 'open', at: now, by: me(), byName: myName() };
  try { await S.DB.set('upsnotes', id, doc); } catch (e) { return toast(L3('저장 실패', 'Save failed', 'Falhou') + ': ' + (e.code || e.message), 'bad'); }
  N.ult = { l: doc.l, wd: doc.wd, h: doc.h }; N.feitas++; N.cx = {}; N.hist = null;
  if (N.feitas >= N.qtd) {
    const cli = N.cli; N.qtd = 0; N.feitas = 0; N.ult = null;
    await imprimirLoja(cli);
    toast('✅ ' + L3('박스 저장 · 라벨 인쇄', 'Boxes saved · labels printed', 'Caixas salvas · etiquetas impressas'), 'good');
    await carregarHist(); return page();   // 가게는 그대로 — 다음 묶음을 바로
  }
  await carregarFila(); page().then(() => $('nuP') && $('nuP').focus());
}
function editar(n) {
  if (!n) return;
  openModal('<h2>' + esc(L3('박스 고치기', 'Edit box', 'Corrigir caixa')) + '</h2><div class="muted">' + esc((n.store || '') + ' #' + n.acct) + '</div><div class="two" style="margin-top:8px">' +
    [['nuEw', 'lb', n.w], ['nuEl', 'L', n.l], ['nuEwd', 'W', n.wd], ['nuEh', 'H', n.h]].map(x => '<div class="fg"><label>' + x[1] + '</label><input id="' + x[0] + '" type="number" inputmode="decimal" value="' + esc(String(x[2] || '')) + '"></div>').join('') +
    '</div><div class="btns"><button type="button" class="b-ghost" id="nuEx">' + L3('닫기', 'Close', 'Fechar') + '</button><button type="button" class="b-blue" id="nuEok">💾 ' + L3('저장', 'Save', 'Salvar') + '</button></div>');
  $('nuEx').onclick = closeModal;
  $('nuEok').onclick = async () => {
    const v = { w: Number($('nuEw').value), l: Number($('nuEl').value), wd: Number($('nuEwd').value), h: Number($('nuEh').value) };
    if (!(v.w > 0 && v.l > 0 && v.wd > 0 && v.h > 0)) return toast(L3('무게와 크기를 모두 넣으세요', 'Fill weight and size', 'Preencha peso e medidas'), 'bad');
    try { await S.DB.update('upsnotes', n.id, Object.assign(v, { editAt: new Date().toISOString(), editBy: me() })); } catch (e) { return toast(L3('실패', 'Failed', 'Falhou') + ': ' + (e.code || e.message), 'bad'); }
    closeModal(); toast(L3('고쳤습니다', 'Updated', 'Corrigida'), 'good'); await carregarFila(); N.hist = null; await carregarHist(); page();
  };
}
async function cancelar(n) {
  if (!n) return;
  if (!(await confirmBox(L3('이 박스를 취소할까요?', 'Cancel this box?', 'Cancelar esta caixa?') + '\n' + (n.store || '') + ' · ' + num1(n.w) + ' lb', L3('취소하기', 'Cancel it', 'Cancelar')))) return;
  try { await S.DB.update('upsnotes', n.id, { st: 'x', cancelAt: new Date().toISOString(), cancelBy: me() }); } catch (e) { return toast(L3('실패', 'Failed', 'Falhou') + ': ' + (e.code || e.message), 'bad'); }
  delete N.sel[n.id]; toast(L3('취소했습니다', 'Cancelled', 'Cancelada'), 'good'); await carregarFila(); N.hist = null; await carregarHist(); page();
}

/* ---------- 다른 화면이 쓰는 것 ---------- */
/** Notes Display 완료 → 단위(개)마다 박스 한 개 (상품의 무게 · 크기) · 라벨은 전체 수 없이 */
export async function deDisplay(d) {
  const now = new Date().toISOString(), docs = [];
  (d.items || []).forEach(x => { for (let i = 0; i < (Number(x.q) || 0); i++) docs.push({ acct: d.acct || '', store: d.store || '', sm: d.sm || '', w: Number(x.w) || 0, l: Number(x.l) || 0, wd: Number(x.wd) || 0, h: Number(x.h) || 0, prod: String(x.n || '').substring(0, 40), dispId: d.id, src: 'display', st: 'open', at: now, by: me(), byName: myName() }); });
  const falta = docs.find(x => !(x.w > 0 && x.l > 0 && x.wd > 0 && x.h > 0));
  if (falta) throw new Error(L3('무게 · 크기가 없는 상품: ' + falta.prod, 'No weight/size for: ' + falta.prod, 'Sem peso/medida: ' + falta.prod));
  for (const x of docs) { x.id = newId('NU'); await S.DB.set('upsnotes', x.id, x); }
  N.fila = null; N.hist = null;
  imprimirNotas(docs, null, true);
  return docs.map(x => x.id);
}
/** Shipping UPS 가 라벨을 만든 뒤 — 박스를 "출고" 로 (Notes Display 에서 온 것은 그 요청도) */
export async function marcarEnviadas(ids, adhocId, trk) {
  const now = new Date().toISOString(), disp = {};
  for (const id of ids || []) { try { const n = await S.DB.get('upsnotes', id); await S.DB.update('upsnotes', id, { st: 'shipped', shippedAt: now, shippedBy: me(), shipId: adhocId, trk: trk || '' }); if (n && n.dispId) disp[n.dispId] = 1; } catch (e) {} }
  for (const d of Object.keys(disp)) { try { await S.DB.update('displays', d, { st: 'shipped', shippedAt: now, track: trk || '', shipVia: 'UPS', updatedAt: now }); } catch (e) {} }
  N.fila = null; N.hist = null;
}
/** Shipping History 에서 void → 박스를 다시 대기 줄로 */
export async function devolver(adhocId) {
  let L = []; try { L = await S.DB.list('upsnotes', { where: [['shipId', '==', adhocId]] }); } catch (e) { return 0; }
  for (const n of L) { try { await S.DB.update('upsnotes', n.id, { st: 'open', shipId: '', trk: '', shippedAt: '', voidAt: new Date().toISOString() }); if (n.dispId) await S.DB.update('displays', n.dispId, { st: 'notes', track: '', updatedAt: new Date().toISOString() }); } catch (e) {} }
  N.fila = null; N.hist = null; return L.length;
}
