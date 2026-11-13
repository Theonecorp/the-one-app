/* ============================================================
 *  🧮 발주 계획 — Purchase planning (projeto estoque 의 Planejamento de Compras 를 옮겨 옴)
 *    누가: 관리자 · 오너 · 담당자(오피스 매니저 · 창고 매니저)
 *    무엇: 아이템마다 "지금 얼마나 사야 하나" — 팔린 속도 · 지금 재고 · 오는 중(발주) · 공장 리드타임으로 계산
 *    탭: 📋 제안 (계산 결과) · 🏭 공장별 (발주서 만들기) · 🧾 발주서 (보냄 · 받음 · 취소)
 *
 *  계산 (아이템마다 — projeto estoque 와 같은 규칙):
 *    창(window)      = 지난 N 개월 (끝난 달만 · 기본 3) — 이번 달은 아직 다 안 팔렸으니 빼야 평균이 낮게 안 나옴
 *    하루 평균       = 창 안에 판 수량 ÷ (창의 날수 − 재고 0 이었던 날수)
 *                      · 재고 0 인 날이 하루라도 있으면 지난 12개월 평균과 비교해 큰 쪽 — 물건이 없어 못 판 것을 "안 팔림"으로 읽지 않게
 *    리드타임 L      = 공장 설정 (기본 60일) · 안전 일수 = 공장 설정 (기본 30일) · 구매 주기 = 공장 설정 또는 "얼마 동안 쓸 만큼" (기본 60일)
 *    안전 재고       = 하루 평균 × 안전 일수
 *    재주문 점       = 하루 평균 × L + 안전 재고
 *    쓸 수 있는 것   = 지금 재고 + 오는 중(보낸 발주서에서 아직 안 받은 것)
 *    목표 재고       = 하루 평균 × (L + 주기) + 안전 재고
 *    살 수량         = max(목표 − 쓸 수 있는 것, 0) 을 올림
 *    상태            = 기록 없음(평균 0) · 오는 중 · 지금 사기(남은 날 < L) · 곧 사기(살 수량 > 0) · 과다(남은 날 > 180) · 괜찮음
 *
 *  purchaseOrders/{id} = { id, no:'PO-2026-000001', sup, st:'draft'|'sent'|'partial'|'recv'|'x', key, lines:[{c, d, q, qr}], n, qty, note,
 *                          by, byName, at, sentAt, recvAt, xAt, xBy }
 *    · 받음(qr)은 "지금까지 모두 받은 수량" — 재고는 바꾸지 않음. 재고는 언제나 📦 재고 › 📥 입고 로만 들어감
 *    · key = 한 번 "만들기" 누른 것의 번호 — 응답이 끊겨 다시 눌러도 같은 key 면 새로 만들지 않고 이미 만든 것을 돌려줌
 *  settings/app.planParams = { [공장 코드]: { lead, seg, cyc } }
 * ============================================================ */
import { $, esc, toast, busy, openModal, closeModal, confirmBox, Router, bi, bt, today, sortBy, itabs, num } from './ui.js';
import { loadCatalog, catalog } from './catalog.js';
import { S as MAIN, isTop, myJobs } from './main.js';
import { invoicesBetween } from './invoicing.js';
import * as Stock from './stock.js';
import { newId } from './db.js';

let S = null;
export function register(state) { S = state; Router.on('plan', page); }

/** 누가 쓰나 — 관리자 · 오너 · 오피스 매니저 · 창고 매니저 */
export const canPlan = () => { const s = S || MAIN; if (!s) return false; if (isTop()) return true; return s.role === 'manager' && myJobs().some(j => ['office', 'whmgr'].includes(j)); };   // 여러 일을 맡은 사람(job2)도

export const DEF = { lead: 60, seg: 30, cyc: 60 };
export const STATUS = [
  ['buy_now', '🔴', '지금 사기', 'Buy now'],
  ['buy_soon', '🟠', '곧 사기', 'Buy soon'],
  ['ok', '🟢', '괜찮음', 'Healthy'],
  ['excess', '🔵', '과다', 'Excess'],
  ['transit', '🚢', '오는 중', 'In transit'],
  ['nohist', '⚪', '판매 기록 없음', 'No sales history']
];
const ST_OF = k => STATUS.find(x => x[0] === k) || STATUS[2];
const PO_ST = { draft: ['📝', '초안', 'Draft'], sent: ['📤', '보냄', 'Sent'], partial: ['📦', '일부 받음', 'Partly received'], recv: ['✅', '다 받음', 'Received'], x: ['✖', '취소', 'Cancelled'] };
const OPEN_PO = ['sent', 'partial'];

const P = { tab: 'list', win: 3, cyc: '', sup: '', q: '', st: '', only: true, page: 1, sel: {}, edit: {}, po: 'open' };
let D = null;   // 계산 결과 캐시 { key, rows, byCode, at, pos }

/* ---------- 날짜 — 끝난 달만 ---------- */
const ymd = d => d.toISOString().substring(0, 10);
const firstOf = (y, m) => new Date(Date.UTC(y, m, 1));
/** 지난 n 개의 끝난 달 [from, to] (UTC 날짜 글) */
export function closedMonths(n, now) {
  const t = now ? new Date(now) : new Date(), y = t.getUTCFullYear(), m = t.getUTCMonth();
  const from = firstOf(y, m - n), to = new Date(firstOf(y, m).getTime() - 86400000);
  return [ymd(from), ymd(to)];
}
const daysIn = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

/* ---------- 재고 0 이었던 날 — stockLog 로 다시 그려 봄 ---------- */
/** logs: 이 아이템의 움직임(시간 순) · qtyNow: 지금 재고 · [from, to] 안에서 재고가 0 이하였던 날 수 */
export function zeroDays(logs, qtyNow, from, to) {
  const A = Date.parse(from), B = Date.parse(to) + 86400000;
  const L = (logs || []).filter(l => l && (l.at || l.d)).map(l => ({ t: Date.parse(l.at || (l.d + 'T12:00:00Z')), before: Number(l.before), after: Number(l.after) })).sort((a, b) => a.t - b.t);
  if (!L.length) return 0;   // 기록이 없으면 "모름" — 0 이었다고 지어내지 않음 (projeto estoque 와 같은 원칙: 기록된 것만)
  let zero = 0;
  /* 구간마다 재고 값이 정해져 있음: 첫 움직임 전 = before, 그 뒤 = after */
  const seg = []; let cur = isNaN(L[0].before) ? (isNaN(L[0].after) ? qtyNow : L[0].after) : L[0].before, t0 = -Infinity;
  L.forEach(l => { seg.push([t0, l.t, cur]); cur = isNaN(l.after) ? cur : l.after; t0 = l.t; });
  seg.push([t0, Infinity, cur]);
  seg.forEach(([s, e, q]) => { if (q > 0) return; const a = Math.max(s, A), b = Math.min(e, B); if (b > a) zero += (b - a) / 86400000; });
  return Math.min(daysIn(from, to), Math.round(zero));
}

/* ---------- 한 아이템 계산 — 화면 · 시험이 같은 함수를 씀 ---------- */
/** x = { sold, days, zero, sold12, days12, qty, transit, lead, seg, cyc } */
export function calc(x) {
  const daysOk = x.days - (x.zero || 0), m12 = x.days12 ? (x.sold12 || 0) / x.days12 : 0;
  const mWin = daysOk >= 1 ? (x.sold || 0) / daysOk : 0;
  const useYear = (x.zero || 0) >= 1 && (daysOk < 1 || m12 > mWin);   // 창 전체가 0 이면 12개월 평균
  const avg = useYear ? m12 : mWin;
  const avail = (x.qty || 0) + (x.transit || 0);
  const safety = avg * x.seg, reorder = avg * x.lead + safety, target = avg * (x.lead + x.cyc) + safety;
  const need = Math.max(target - avail, 0), buy = need > 0 ? Math.ceil(need) : 0;
  const cover = avg > 0 ? avail / avg : null;
  let st;
  if (avg <= 0) st = 'nohist';
  else if ((x.transit || 0) > 0 && need === 0 && target - (x.qty || 0) > 0) st = 'transit';
  else if (cover < x.lead) st = 'buy_now';
  else if (need > 0) st = 'buy_soon';
  else if (cover > 180) st = 'excess';
  else st = 'ok';
  const when = buy > 0 && avg > 0 ? Math.max(0, Math.floor((avail - reorder) / avg)) : null;
  return { avg, mWin, m12, useYear, avail, safety, reorder, target, need, buy, cover, st, when };
}

/* ---------- 자료 모으기 ---------- */
const params = () => (S.settings && S.settings.planParams) || {};
export const parOf = sup => { const p = params()[sup] || {}; return { lead: +p.lead || DEF.lead, seg: p.seg != null && p.seg !== '' ? +p.seg : DEF.seg, cyc: +p.cyc || DEF.cyc }; };
const supName = c => c ? Stock.supLabel(c) : bt('공장 없음', 'No supplier');

async function loadPOs() { try { return await S.DB.list('purchaseOrders'); } catch (e) { return []; } }

async function build(force) {
  const key = P.win + '|' + P.cyc;
  if (!force && D && D.key === key && Date.now() - D.at < 5 * 60000) return D;
  await loadCatalog(S);
  const C = catalog(), items = (C && C.items) || [];
  const [wf, wt] = closedMonths(P.win), [yf, yt] = closedMonths(12);
  const [stock, invs, pos, logs] = await Promise.all([
    Stock.stockAll(true).catch(() => ({})),
    invoicesBetween(S, yf, yt).catch(() => []),
    loadPOs(),
    S.DB.list('stockLog', { where: [['d', '>=', wf]] }).catch(() => [])
  ]);
  /* 판 수량 — 세트는 구성품으로 (재고에서 빠지는 것과 같게) */
  const sold = {}, sold12 = {}, monthly = {};
  invs.filter(v => v && v.st !== 'x' && !v.void).forEach(v => {
    const d = String(v.d || ''); if (!d) return;
    Stock.movesOfLines(v.lines, 1).forEach(m => {
      const c = String(m.c || '').toUpperCase(); if (!c) return;
      sold12[c] = (sold12[c] || 0) + m.delta;
      if (d >= wf && d <= wt) sold[c] = (sold[c] || 0) + m.delta;
      const k = d.substring(0, 7); monthly[c] = monthly[c] || {}; monthly[c][k] = (monthly[c][k] || 0) + m.delta;
    });
  });
  /* 오는 중 — 보낸 · 일부 받은 발주서에서 아직 안 받은 것 */
  const transit = {}, inPO = {};
  pos.forEach(p => (p.lines || []).forEach(l => {
    const c = String(l.c || '').toUpperCase();
    if (OPEN_PO.includes(p.st)) transit[c] = (transit[c] || 0) + Math.max(0, (+l.q || 0) - (+l.qr || 0));
    if (p.st === 'draft' || OPEN_PO.includes(p.st)) (inPO[c] = inPO[c] || []).push(p.no || p.id);
  }));
  const logBy = {}; logs.forEach(l => { const c = String(l.code || '').toUpperCase(); (logBy[c] = logBy[c] || []).push(l); });
  const days = daysIn(wf, wt), days12 = daysIn(yf, yt);
  const rows = [];
  const codes = new Set(items.filter(it => !it.h).map(it => it.c));
  Object.keys(sold12).forEach(c => codes.add(c));   // 숨긴 아이템이라도 팔렸으면 보임
  codes.forEach(c => {
    const it = C.byCode[c] || { c, d: '' }, qty = Number(stock[c]) || 0;
    const pr = parOf(it.sup), cyc = +P.cyc || pr.cyc;
    const zero = zeroDays(logBy[c], qty, wf, wt);
    const r = calc({ sold: sold[c] || 0, days, zero, sold12: sold12[c] || 0, days12, qty, transit: transit[c] || 0, lead: pr.lead, seg: pr.seg, cyc });
    rows.push(Object.assign({ c, d: it.d || '', sup: it.sup || '', ph: it.ph || '', qty, transit: transit[c] || 0, sold: sold[c] || 0, sold12: sold12[c] || 0, zero, days, lead: pr.lead, seg: pr.seg, cyc, inPO: inPO[c] || [], months: monthly[c] || {} }, r));
  });
  const byCode = {}; rows.forEach(r => { byCode[r.c] = r; });
  D = { key, rows, byCode, at: Date.now(), pos, win: [wf, wt], days };
  return D;
}
export const _build = build;   // 시험용

/* ---------- 걸러 보기 ---------- */
const qtyOf = r => P.edit[r.c] != null ? P.edit[r.c] : r.buy;
function filtered() {
  if (!D) return [];
  const q = P.q.trim().toUpperCase();
  return D.rows.filter(r => (!P.sup || (P.sup === '__none' ? !r.sup : r.sup === P.sup)) && (!P.st || r.st === P.st) && (!P.only || P.st || r.buy > 0) && (!q || r.c.indexOf(q) >= 0 || String(r.d).toUpperCase().indexOf(q) >= 0));
}

/* ---------- 화면 ---------- */
async function page(arg) {
  if (!canPlan()) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('발주 계획은 관리자 · 오피스 매니저 · 창고 매니저가 봅니다', 'Purchase planning is for admin, office and warehouse managers') + '</div></div>'; return; }
  if (arg && ['list', 'sup', 'po'].includes(arg)) P.tab = arg;
  const T = [['list', '📋', '살 것 제안', 'Suggestions'], ['sup', '🏭', '공장별 · 발주서 만들기', 'By supplier'], ['po', '🧾', '발주서', 'Purchase orders']];
  $('page').innerHTML = '<div class="card" style="padding:12px 14px 8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2 style="margin:0">🧮 ' + bi('발주 계획', 'Purchase planning') + '</h2><div style="display:flex;gap:6px"><button class="b-ghost b-sm" id="plHow">❓ ' + bt('계산 방법', 'How it works') + '</button><button class="b-ghost b-sm" id="plPar">⚙️ ' + bt('공장 설정', 'Supplier settings') + '</button></div></div>' + itabs(T, P.tab, 'pl') + '</div><div id="plBody"><div class="load">…</div></div>';
  document.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => { P.tab = b.dataset.pl; page(); });
  $('plHow').onclick = howItWorks; $('plPar').onclick = openParams;
  try { await build(); } catch (e) { $('plBody').innerHTML = '<div class="card"><div class="none">⚠️ ' + bt('계산을 못 했습니다', 'Could not calculate') + ' — ' + esc(e.message || e) + ' <button class="b-blue b-sm" id="plRetry">' + bt('다시', 'Retry') + '</button></div></div>'; $('plRetry').onclick = () => page(); return; }
  if (P.tab === 'sup') return paintSup();
  if (P.tab === 'po') return paintPO();
  return paintList();
}

function cardsHTML() {
  const cnt = {}; D.rows.forEach(r => { cnt[r.st] = (cnt[r.st] || 0) + 1; });
  const tr = D.rows.reduce((a, r) => a + r.transit, 0);
  return '<div class="pl-cards">' + STATUS.filter(s => s[0] !== 'nohist').map(s => '<button class="pl-card' + (P.st === s[0] ? ' on' : '') + '" data-plst="' + s[0] + '"><span class="pl-ci">' + s[1] + '</span><b>' + num(s[0] === 'transit' ? tr : (cnt[s[0]] || 0)) + '</b><small>' + s[2] + ' <span class="en">' + s[3] + (s[0] === 'transit' ? ' · ' + bt('개', 'pcs') : '') + '</span></small></button>').join('') + '</div>';
}

function filtersHTML() {
  const sups = Array.from(new Set(D.rows.map(r => r.sup).filter(Boolean))).sort();
  const o = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
  return '<div class="pl-filters">' +
    '<input id="plQ" placeholder="🔍 ' + esc(bt('코드 · 이름', 'Code · name')) + '" value="' + esc(P.q) + '" autocomplete="off" style="text-transform:uppercase">' +
    '<select id="plSup">' + o('', bt('모든 공장', 'All suppliers'), P.sup) + sups.map(s => o(s, supName(s), P.sup)).join('') + o('__none', bt('공장 없음', 'No supplier'), P.sup) + '</select>' +
    '<select id="plSt">' + o('', bt('모든 상태', 'All statuses'), P.st) + STATUS.map(s => o(s[0], s[1] + ' ' + bt(s[2], s[3]), P.st)).join('') + '</select>' +
    '<select id="plWin" title="' + esc(bt('평균을 낼 기간', 'Sales window')) + '">' + [3, 6, 12].map(n => o(n, n + ' ' + bt('개월 평균', 'months avg'), P.win)).join('') + '</select>' +
    '<select id="plCyc" title="' + esc(bt('얼마 동안 쓸 만큼 살까', 'Buy for how long')) + '">' + o('', bt('얼마 동안: 공장 설정', 'Buy for: supplier default'), P.cyc) + [30, 60, 90, 120, 180].map(n => o(n, bt('얼마 동안', 'Buy for') + ': ' + n + ' ' + bt('일 분량', 'days'), P.cyc)).join('') + '</select>' +
    '<label class="pl-only"><input type="checkbox" id="plOnly"' + (P.only ? ' checked' : '') + '> ' + bt('사야 할 것만', 'Only what needs buying') + '</label></div>';
}

const fmtCover = r => r.cover == null ? '—' : r.cover > 999 ? '999+' : String(Math.round(r.cover));
const fmtAvgM = r => (r.avg * 30).toFixed(r.avg * 30 >= 10 ? 0 : 1);

function paintList() {
  const L = filtered(), per = 60, shown = L.slice(0, per * P.page);
  const selN = Object.keys(P.sel).length, selQ = Object.keys(P.sel).reduce((a, c) => a + (D.byCode[c] ? qtyOf(D.byCode[c]) : 0), 0);
  const row = r => { const s = ST_OF(r.st), q = qtyOf(r), ed = P.edit[r.c] != null;
    return '<div class="pl-row" data-plc="' + esc(r.c) + '">' +
      '<input type="checkbox" class="pl-chk" data-plsel="' + esc(r.c) + '"' + (P.sel[r.c] ? ' checked' : '') + ' aria-label="select">' +
      '<div class="pl-main"><b>' + esc(r.c) + '</b> <span class="pl-st pl-' + r.st + '">' + s[1] + ' ' + s[2] + '</span><small>' + esc(String(r.d).slice(0, 48)) + '</small>' +
      '<small class="pl-meta">' + esc(supName(r.sup)) + ' · ' + bt('재고', 'on hand') + ' <b>' + num(r.qty) + '</b>' + (r.transit ? ' · 🚢 ' + num(r.transit) : '') + ' · ' + bt('월 평균', 'avg/mo') + ' ' + fmtAvgM(r) + ' · ' + bt('남은 날', 'days left') + ' ' + fmtCover(r) + (r.inPO.length ? ' · 🧾 ' + esc(r.inPO.join(', ')) : '') + '</small></div>' +
      '<div class="pl-q"><input class="pl-qi' + (ed ? ' ed' : '') + '" data-plq="' + esc(r.c) + '" value="' + q + '" inputmode="numeric" aria-label="qty">' + (ed ? '<small class="pl-sug" data-plreset="' + esc(r.c) + '">' + bt('제안', 'sugg.') + ' ' + num(r.buy) + ' ↺</small>' : '<small>' + bt('살 수량', 'to buy') + '</small>') + '</div></div>'; };
  $('plBody').innerHTML = '<div class="card">' + cardsHTML() + filtersHTML() + '</div>' +
    '<div class="card"><div class="pl-head"><b>' + num(L.length) + ' ' + bt('개 아이템', 'items') + ' · ' + num(L.reduce((a, r) => a + qtyOf(r), 0)) + ' ' + bt('개 살 것', 'pcs to buy') + '</b><span class="muted">' + bt('기간', 'window') + ' ' + esc(D.win[0]) + ' ~ ' + esc(D.win[1]) + '</span><span style="flex:1"></span><button class="b-ghost b-sm" id="plSelAll">☑ ' + bt('보이는 것 모두 고르기', 'Select all shown') + '</button><button class="b-ghost b-sm" id="plCsv">⬇️ CSV</button></div>' +
    (shown.length ? shown.map(row).join('') : '<div class="none">' + bt('조건에 맞는 아이템이 없습니다', 'No items match') + '</div>') +
    (L.length > shown.length ? '<button class="b-ghost" id="plMore" style="width:100%;margin-top:8px">' + bt('더 보기', 'Show more') + ' (' + num(L.length - shown.length) + ')</button>' : '') + '</div>' +
    (selN ? '<div class="pl-bar" id="plBar"><b>' + num(selN) + ' ' + bt('개 고름', 'selected') + ' · ' + num(selQ) + ' ' + bt('개', 'pcs') + '</b><button class="b-ghost b-sm" id="plClr">' + bt('지우기', 'Clear') + '</button><button class="b-blue" id="plGo">🏭 ' + bt('공장별로 보기 →', 'Group by supplier →') + '</button></div>' : '');
  bindList();
}
function bindList() {
  document.querySelectorAll('[data-plst]').forEach(b => b.onclick = () => { P.st = P.st === b.dataset.plst ? '' : b.dataset.plst; P.page = 1; paintList(); });
  const re = () => { P.page = 1; paintList(); };
  $('plSup').onchange = e => { P.sup = e.target.value; re(); };
  $('plSt').onchange = e => { P.st = e.target.value; re(); };
  $('plOnly').onchange = e => { P.only = e.target.checked; re(); };
  $('plWin').onchange = async e => { P.win = +e.target.value; busy(true); try { await build(true); } finally { busy(false); } re(); };
  $('plCyc').onchange = async e => { P.cyc = e.target.value; busy(true); try { await build(true); } finally { busy(false); } re(); };
  $('plQ').onkeydown = e => { if (e.key === 'Enter') { P.q = e.target.value; re(); } };
  $('plQ').onblur = e => { if (P.q !== e.target.value) { P.q = e.target.value; re(); } };
  if ($('plMore')) $('plMore').onclick = () => { P.page++; paintList(); };
  $('plSelAll').onclick = () => { filtered().filter(r => qtyOf(r) > 0).forEach(r => { P.sel[r.c] = 1; }); paintList(); };
  $('plCsv').onclick = exportCsv;
  if ($('plClr')) $('plClr').onclick = () => { P.sel = {}; paintList(); };
  if ($('plGo')) $('plGo').onclick = () => { P.tab = 'sup'; page(); };
  document.querySelectorAll('[data-plsel]').forEach(ch => { ch.onclick = e => e.stopPropagation(); ch.onchange = () => { if (ch.checked) P.sel[ch.dataset.plsel] = 1; else delete P.sel[ch.dataset.plsel]; paintList(); }; });
  document.querySelectorAll('[data-plq]').forEach(inp => {
    inp.onclick = e => e.stopPropagation();
    inp.onchange = () => { const c = inp.dataset.plq, r = D.byCode[c], v = inp.value.trim();
      if (v === '' || !r) { delete P.edit[c]; } else { const n = Math.floor(Number(v)); if (!(n >= 0)) { toast(bt('수량이 이상합니다', 'Invalid quantity'), 'bad'); inp.value = qtyOf(r); return; } if (n === r.buy) delete P.edit[c]; else P.edit[c] = n; if (n > 0) P.sel[c] = 1; }
      paintList(); };
  });
  document.querySelectorAll('[data-plreset]').forEach(el => el.onclick = e => { e.stopPropagation(); delete P.edit[el.dataset.plreset]; paintList(); });
  document.querySelectorAll('[data-plc]').forEach(el => el.onclick = () => why(el.dataset.plc));
}

/* ---------- 왜 이 수량? ---------- */
function why(c) {
  const r = D.byCode[c]; if (!r) return;
  const f = (n, d) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d });
  const ms = []; { const t = new Date(); for (let i = 12; i >= 1; i--) { const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1)); ms.push(d.toISOString().substring(0, 7)); } }
  const mx = Math.max(1, ...ms.map(k => r.months[k] || 0));
  const bars = '<div class="pl-bars">' + ms.map(k => '<div class="pl-bc" title="' + k + ': ' + (r.months[k] || 0) + '"><i style="height:' + Math.round(((r.months[k] || 0) / mx) * 100) + '%"></i><small>' + k.substring(5) + '</small></div>').join('') + '</div>';
  const s = ST_OF(r.st);
  const steps = [
    r.useYear
      ? bt('하루 평균', 'Daily average') + ' = <b>' + f(r.avg, 2) + '</b> — ' + bt('재고 0 인 날', 'Days out of stock') + ': ' + r.zero + '. ' + bt('그래서 12개월 평균을 씀', 'So the 12-month average is used') + ': ' + f(r.sold12, 0) + ' ÷ ' + Math.round(r.sold12 / Math.max(r.m12, 1e-9)) + ' ' + bt('일', 'days')
      : bt('하루 평균', 'Daily average') + ' = ' + f(r.sold, 0) + ' ÷ ' + (r.days - r.zero) + ' ' + bt('일', 'days') + (r.zero ? ' (' + bt('재고 0 인 날 뺌', 'out-of-stock days excluded') + ': ' + r.zero + ')' : '') + ' = <b>' + f(r.avg, 2) + '</b>',
    bt('리드타임 동안 나갈 것', 'Demand during lead time') + ' (' + r.lead + ' ' + bt('일', 'days') + ') = ' + f(r.avg * r.lead, 0),
    bt('안전 재고', 'Safety stock') + ' = ' + bt('하루 평균', 'avg') + ' × ' + r.seg + bt('일', ' days') + ' = ' + f(r.safety, 0),
    bt('목표 재고', 'Target stock') + ' = ' + bt('하루 평균', 'avg') + ' × (' + r.lead + ' + ' + r.cyc + bt('일', ' days') + ') + ' + bt('안전 재고', 'safety') + ' = <b>' + f(r.target, 0) + '</b>',
    bt('쓸 수 있는 것', 'Available') + ' = ' + bt('재고', 'on hand') + ' ' + num(r.qty) + ' + ' + bt('오는 중', 'in transit') + ' ' + num(r.transit) + ' = <b>' + num(r.avail) + '</b>',
    bt('살 수량', 'To buy') + ' = ' + bt('목표', 'target') + ' − ' + bt('쓸 수 있는 것', 'available') + ' = <b>' + num(r.buy) + '</b>' + (r.when != null ? ' · ' + (r.when === 0 ? bt('지금 주문해야 함', 'order now') : bt('주문까지 남은 날', 'days until ordering') + ': ' + r.when) : '')
  ];
  openModal('<h2>' + esc(r.c) + ' <span class="pl-st pl-' + r.st + '">' + s[1] + ' ' + s[2] + ' <span class="en">' + s[3] + '</span></span></h2><div class="muted">' + esc(r.d) + ' · ' + esc(supName(r.sup)) + '</div>' +
    '<h3 style="font-size:14px;margin:12px 0 4px">' + bt('왜 이 수량?', 'Why this quantity?') + '</h3><ol class="pl-why">' + steps.map(x => '<li>' + x + '</li>').join('') + '</ol>' +
    '<h3 style="font-size:14px;margin:12px 0 4px">' + bt('지난 12개월 판매', 'Sales, last 12 months') + '</h3>' + bars +
    (r.inPO.length ? '<div class="muted" style="margin-top:8px">🧾 ' + bt('이미 발주서에 있음', 'Already on a PO') + ': ' + esc(r.inPO.join(', ')) + '</div>' : '') +
    '<div class="btns"><button class="b-ghost" id="plWhyX">' + bt('닫기', 'Close') + '</button></div>');
  $('plWhyX').onclick = closeModal;
}

function howItWorks() {
  const L = [
    bt('평균은 지난 끝난 달들만 봅니다 (이번 달은 아직 다 안 팔렸으니 빼요).', 'The average uses closed months only (the current month is not over yet).'),
    bt('재고가 0 이었던 날은 빼고 평균을 냅니다 — 물건이 없어 못 판 것을 안 팔린 것으로 읽지 않게. 0 인 날이 있으면 12개월 평균과 비교해 큰 쪽을 씁니다.', 'Days with zero stock are excluded — no stock is not the same as no demand. If there were any, the 12-month average is used when higher.'),
    bt('세트는 구성품으로 셉니다 (재고에서 빠지는 것과 같게).', 'Sets are counted as their components (same as stock deduction).'),
    bt('안전 재고 = 하루 평균 × 안전 일수.', 'Safety stock = daily average × safety days.'),
    bt('목표 재고 = 하루 평균 × (리드타임 + 얼마 동안 쓸 만큼) + 안전 재고.', 'Target = daily average × (lead time + buy-for days) + safety stock.'),
    bt('쓸 수 있는 것 = 지금 재고 + 보낸 발주서에서 아직 안 받은 것.', 'Available = on hand + not-yet-received quantities on sent POs.'),
    bt('살 수량 = 목표 − 쓸 수 있는 것 (0 보다 작으면 0).', 'To buy = target − available (never below 0).'),
    bt('지금 사기: 남은 날이 리드타임보다 짧음 · 곧 사기: 목표 아래 · 과다: 180일 넘게 남음.', 'Buy now: days left < lead time · Buy soon: below target · Excess: more than 180 days left.'),
    bt('리드타임 · 안전 일수 · 주기는 ⚙️ 공장 설정에서 공장마다 바꿉니다.', 'Lead time, safety days and cycle are set per supplier in ⚙️ Supplier settings.')
  ];
  openModal('<h2>❓ ' + bi('계산 방법', 'How it works') + '</h2><ol class="pl-why">' + L.map(x => '<li>' + x + '</li>').join('') + '</ol><div class="btns"><button class="b-ghost" id="plHowX">' + bt('닫기', 'Close') + '</button></div>');
  $('plHowX').onclick = closeModal;
}

/* ---------- ⚙️ 공장 설정 ---------- */
function openParams() {
  const sups = Array.from(new Set([...Stock.suppliers().map(f => f.code), ...(D ? D.rows.map(r => r.sup) : [])].filter(Boolean))).sort();
  const can = isTop() || myJobs().includes('office');   // 규칙 staffJob(['office']) 과 같게 (job · job2)
  openModal('<h2>⚙️ ' + bi('공장 설정', 'Supplier settings') + '</h2><div class="muted">' + bt('리드타임: 주문해서 창고에 오기까지 · 안전: 늦어질 때를 위한 여유 · 주기: 한 번에 몇 일 쓸 만큼 살지. 비우면 기본', 'Lead time: order to warehouse · Safety: buffer for delays · Cycle: how many days each order covers. Empty = default') + ' ' + DEF.lead + ' / ' + DEF.seg + ' / ' + DEF.cyc + '</div>' +
    '<table class="pl-par"><tr><th>' + bt('공장', 'Supplier') + '</th><th>' + bt('리드타임', 'Lead') + '</th><th>' + bt('안전', 'Safety') + '</th><th>' + bt('주기', 'Cycle') + '</th></tr>' +
    (sups.length ? sups.map(s => { const p = params()[s] || {}; return '<tr data-plp="' + esc(s) + '"><td>' + esc(supName(s)) + '</td>' + ['lead', 'seg', 'cyc'].map(k => '<td><input data-k="' + k + '" value="' + esc(p[k] != null ? p[k] : '') + '" placeholder="' + DEF[k] + '" inputmode="numeric"' + (can ? '' : ' disabled') + '></td>').join('') + '</tr>'; }).join('') : '<tr><td colspan="4" class="none">' + bt('공장이 없습니다 — 아이템에 공급업체를 넣으세요', 'No suppliers — set one on the items') + '</td></tr>') + '</table>' +
    '<div class="btns"><button class="b-ghost" id="plParX">' + bt('닫기', 'Close') + '</button>' + (can && sups.length ? '<button class="b-blue" id="plParOk">💾 ' + bt('저장', 'Save') + '</button>' : '') + '</div>');
  $('plParX').onclick = closeModal;
  if ($('plParOk')) $('plParOk').onclick = async () => {
    const next = Object.assign({}, params()); let bad = '';
    document.querySelectorAll('[data-plp]').forEach(tr => { const s = tr.dataset.plp, o = {};
      tr.querySelectorAll('input').forEach(i => { const v = i.value.trim(); if (v === '') return; const n = Number(v); const min = i.dataset.k === 'seg' ? 0 : 1; if (!(Number.isInteger(n) && n >= min && n <= 365)) bad = s; else o[i.dataset.k] = n; });
      if (Object.keys(o).length) next[s] = o; else delete next[s]; });
    if (bad) { toast(bt('1 ~ 365 일로 넣으세요', 'Use 1 to 365 days') + ' — ' + supName(bad), 'bad'); return; }
    busy(true);
    try { await S.DB.batch([{ op: 'merge', col: 'settings', id: 'app', data: { planParams: next } }]); S.settings.planParams = next; closeModal(); toast('💾 ' + bt('저장했습니다 — 다시 계산', 'Saved — recalculating'), 'good'); D = null; page(); }
    catch (e) { toast(bt('저장 실패', 'Save failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}

/* ---------- 🏭 공장별 · 발주서 만들기 ---------- */
let GEN_KEY = null;   // 지금 화면의 "만들기" 번호 — 응답이 끊겨 다시 눌러도 같은 번호
function pickRows() {
  const ids = Object.keys(P.sel);
  const src = ids.length ? ids.map(c => D.byCode[c]).filter(Boolean) : D.rows.filter(r => r.buy > 0 && (!P.sup || r.sup === P.sup));
  return src.map(r => ({ r, q: qtyOf(r) }));
}
function paintSup() {
  const L = pickRows(), fromSel = Object.keys(P.sel).length > 0;
  const grp = {}; L.forEach(x => { const k = x.r.sup || ''; (grp[k] = grp[k] || []).push(x); });
  const keys = Object.keys(grp).filter(Boolean).sort((a, b) => String(supName(a)).localeCompare(String(supName(b))));
  const none = grp[''] || [];
  const bad = L.filter(x => x.r.sup && !(Number.isInteger(x.q) && x.q > 0));
  const box = s => { const xs = grp[s], pr = parOf(s), tot = xs.reduce((a, x) => a + (x.q || 0), 0);
    return '<div class="card"><div class="pl-head"><b>🏭 ' + esc(supName(s)) + '</b><span class="muted">' + xs.length + ' ' + bt('개 아이템', 'items') + ' · ' + num(tot) + ' ' + bt('개', 'pcs') + ' · ' + bt('리드타임', 'lead') + ' ' + pr.lead + bt('일', 'd') + ' · ' + bt('도착 예상', 'ETA') + ' ' + esc(addDaysIso(pr.lead)) + '</span></div>' +
      xs.map(x => '<div class="pl-srow"><b>' + esc(x.r.c) + '</b><small>' + esc(String(x.r.d).slice(0, 40)) + '</small>' + (x.r.inPO.length ? '<small class="pl-warn">🧾 ' + bt('이미 발주서', 'already on') + ' ' + esc(x.r.inPO.join(', ')) + '</small>' : '') + (x.q !== x.r.buy ? '<small class="pl-warn">✏️ ' + bt('제안', 'sugg.') + ' ' + num(x.r.buy) + '</small>' : '') + '<span class="pl-sq' + (Number.isInteger(x.q) && x.q > 0 ? '' : ' bad') + '">' + num(x.q || 0) + '</span></div>').join('') + '</div>'; };
  $('plBody').innerHTML = '<div class="card"><div class="muted">' + (fromSel ? bt('📋 제안 탭에서 고른 아이템', 'Items selected in Suggestions') + ' (' + Object.keys(P.sel).length + ')' : bt('고른 것이 없어 사야 할 것 모두를 보여 줍니다', 'Nothing selected — showing everything that needs buying') + (P.sup ? ' · ' + esc(supName(P.sup)) : '')) + '. ' + bt('수량은 📋 제안 탭에서 고칩니다.', 'Edit quantities in Suggestions.') + '</div>' +
    '<div class="pl-head" style="margin-top:8px"><b>' + keys.length + ' ' + bt('개 발주서가 만들어짐', 'POs will be created') + ' · ' + num(L.filter(x => x.r.sup).reduce((a, x) => a + (x.q || 0), 0)) + ' ' + bt('개', 'pcs') + '</b><span style="flex:1"></span><button class="b-blue" id="plMake"' + (keys.length && !bad.length ? '' : ' disabled') + '>🧾 ' + bt('초안 발주서 만들기', 'Create draft POs') + '</button></div>' +
    (bad.length ? '<div class="pl-err">⚠️ ' + bt('수량이 0 이거나 이상한 아이템', 'Items with zero or invalid quantity') + ': ' + esc(bad.map(x => x.r.c).slice(0, 8).join(', ')) + '</div>' : '') + '</div>' +
    (keys.length ? keys.map(box).join('') : '<div class="card"><div class="none">' + bt('발주할 것이 없습니다', 'Nothing to order') + '</div></div>') +
    (none.length ? '<div class="card pl-nosup"><b>⚠️ ' + bt('공장이 없는 아이템 — 발주서에 안 들어감', 'No supplier — not included in any PO') + ' (' + none.length + ')</b><div class="muted">' + bt('🏷 아이템 화면에서 공급업체를 넣으면 들어갑니다.', 'Set the supplier on the item to include it.') + '</div>' + none.slice(0, 40).map(x => '<div class="pl-srow"><b>' + esc(x.r.c) + '</b><small>' + esc(String(x.r.d).slice(0, 40)) + '</small><span class="pl-sq">' + num(x.q || 0) + '</span></div>').join('') + (none.length > 40 ? '<div class="muted">… +' + (none.length - 40) + '</div>' : '') + '</div>' : '');
  if ($('plMake')) $('plMake').onclick = () => makePOs(keys.map(s => ({ sup: s, lines: grp[s].map(x => ({ c: x.r.c, d: x.r.d, q: x.q, qr: 0 })) })));
}
const addDaysIso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().substring(0, 10); };

/** 발주서 만들기 — 공장마다 하나. 같은 key 로 다시 부르면 이미 만든 것을 그대로 돌려줌 (두 번 눌러도 두 벌 안 생김) */
export async function createPOs(groups, key) {
  const out = [], now = new Date().toISOString(), yr = now.substring(0, 4);
  for (const g of groups) {
    const id = 'PO_' + key + '_' + String(g.sup).replace(/[^A-Za-z0-9]/g, '');
    let ex = null; try { ex = await S.DB.get('purchaseOrders', id); } catch (e) {}
    if (ex) { out.push(Object.assign({ repeated: true }, ex)); continue; }
    const n = await S.DB.seq('po', yr, 1);
    const doc = { id, no: 'PO-' + yr + '-' + String(n).padStart(6, '0'), sup: g.sup, st: 'draft', key, lines: g.lines, n: g.lines.length, qty: g.lines.reduce((a, l) => a + l.q, 0), note: '', by: S.user.email, byName: (S.me && S.me.name) || S.user.email, at: now };
    await S.DB.set('purchaseOrders', id, doc);
    out.push(doc);
  }
  return out;
}
async function makePOs(groups) {
  if (!groups.length) return;
  if (!(await confirmBox(bt('초안 발주서를 만들까요?', 'Create draft POs?') + ' (' + groups.length + ')', bt('만들기', 'Create')))) return;
  GEN_KEY = GEN_KEY || newId('G');
  busy(true);
  try {
    const made = await createPOs(groups, GEN_KEY);
    GEN_KEY = null;
    groups.forEach(g => g.lines.forEach(l => { delete P.sel[l.c]; delete P.edit[l.c]; }));
    D = null; P.tab = 'po'; P.po = 'draft';
    toast('🧾 ' + made.map(m => m.no).join(', '), 'good');
    page();
  } catch (e) {
    toast(bt('발주서를 다 못 만들었을 수 있습니다 — 다시 누르면 빠진 것만 만듭니다', 'POs may be incomplete — press again; only missing ones will be created') + ' (' + (e.code || e.message) + ')', 'bad');
  }
  busy(false);
}

/* ---------- 🧾 발주서 ---------- */
async function paintPO() {
  const pos = sortBy(await loadPOs(), p => p.at || '').reverse();
  const F = [['open', '📂', bt('진행 중', 'Open')], ['draft', '📝', bt('초안', 'Draft')], ['sent', '📤', bt('보냄', 'Sent')], ['recv', '✅', bt('다 받음', 'Received')], ['x', '✖', bt('취소', 'Cancelled')], ['all', '🗂', bt('전부', 'All')]];
  const ok = p => P.po === 'all' ? true : P.po === 'open' ? ['draft', 'sent', 'partial'].includes(p.st) : P.po === 'sent' ? OPEN_PO.includes(p.st) : p.st === P.po;
  const L = pos.filter(ok);
  $('plBody').innerHTML = '<div class="card"><div class="pl-chips">' + F.map(f => '<button class="' + (P.po === f[0] ? 'on' : '') + '" data-plpo="' + f[0] + '">' + f[1] + ' ' + f[2] + ' <small>' + pos.filter(p => f[0] === 'all' || (f[0] === 'open' ? ['draft', 'sent', 'partial'].includes(p.st) : f[0] === 'sent' ? OPEN_PO.includes(p.st) : p.st === f[0])).length + '</small></button>').join('') + '</div></div>' +
    '<div class="card">' + (L.length ? L.map(p => { const s = PO_ST[p.st] || PO_ST.draft, rq = (p.lines || []).reduce((a, l) => a + (+l.qr || 0), 0);
      return '<div class="pl-row" data-plopen="' + esc(p.id) + '"><div class="pl-main"><b>' + esc(p.no) + '</b> <span class="pl-po pl-po-' + p.st + '">' + s[0] + ' ' + s[1] + ' <span class="en">' + s[2] + '</span></span><small>' + esc(supName(p.sup)) + ' · ' + (p.n || 0) + ' ' + bt('개 아이템', 'items') + ' · ' + num(p.qty || 0) + ' ' + bt('개', 'pcs') + (rq ? ' · ' + bt('받음', 'received') + ' ' + num(rq) : '') + '</small><small class="pl-meta">' + esc(String(p.at || '').substring(0, 10)) + ' · ' + esc(p.byName || '') + '</small></div></div>'; }).join('') : '<div class="none">' + bt('발주서가 없습니다 — 🏭 공장별 탭에서 만드세요', 'No purchase orders — create them in By supplier') + '</div>') + '</div>';
  document.querySelectorAll('[data-plpo]').forEach(b => b.onclick = () => { P.po = b.dataset.plpo; paintPO(); });
  document.querySelectorAll('[data-plopen]').forEach(el => el.onclick = () => openPO(pos.find(p => p.id === el.dataset.plopen)));
}

function openPO(p) {
  if (!p) return;
  const s = PO_ST[p.st] || PO_ST.draft, recvMode = OPEN_PO.includes(p.st), anyRecv = (p.lines || []).some(l => +l.qr > 0);
  const canCancel = p.st === 'draft' || (p.st === 'sent' && !anyRecv);
  openModal('<h2>🧾 ' + esc(p.no) + ' <span class="pl-po pl-po-' + p.st + '">' + s[0] + ' ' + s[1] + '</span></h2><div class="muted">' + esc(supName(p.sup)) + ' · ' + esc(String(p.at || '').substring(0, 10)) + ' · ' + esc(p.byName || '') + (p.sentAt ? ' · 📤 ' + esc(p.sentAt.substring(0, 10)) : '') + '</div>' +
    '<table class="pl-pot"><tr><th>' + bt('코드', 'Code') + '</th><th class="r">' + bt('주문', 'Ordered') + '</th><th class="r">' + bt('받음', 'Received') + '</th></tr>' +
    (p.lines || []).map((l, i) => '<tr><td><b>' + esc(l.c) + '</b><br><small>' + esc(String(l.d || '').slice(0, 36)) + '</small></td><td class="r">' + num(l.q) + '</td><td class="r">' + (recvMode ? '<input class="pl-rq" data-i="' + i + '" value="' + (+l.qr || 0) + '" inputmode="numeric">' : num(+l.qr || 0)) + '</td></tr>').join('') + '</table>' +
    (recvMode ? '<div class="muted">' + bt('받은 수량은 "지금까지 모두" 입니다. 재고는 바뀌지 않아요 — 물건은 📦 재고 › 📥 입고 로 넣으세요.', 'Received = total so far. Stock does not change here — receive goods in Inventory › Receive.') + '</div>' : '') +
    '<div class="btns"><button class="b-ghost" id="poX">' + bt('닫기', 'Close') + '</button>' +
    (canCancel ? '<button class="b-red" id="poCancel">✖ ' + bt('발주서 취소', 'Cancel PO') + '</button>' : '') +
    (p.st === 'draft' ? '<button class="b-blue" id="poSend">📤 ' + bt('공장에 보냄으로 표시', 'Mark as sent') + '</button>' : '') +
    (recvMode ? '<button class="b-ghost" id="poAll">' + bt('다 왔음', 'All arrived') + '</button><button class="b-blue" id="poRecv">📦 ' + bt('받은 수량 저장', 'Save received') + '</button>' : '') + '</div>');
  $('poX').onclick = closeModal;
  const save = async (patch, msg) => { busy(true); try { await S.DB.update('purchaseOrders', p.id, patch); closeModal(); toast(msg, 'good'); D = null; paintPO(); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('poSend')) $('poSend').onclick = () => save({ st: 'sent', sentAt: new Date().toISOString() }, '📤 ' + p.no + ' — ' + bt('이제 "오는 중"으로 계산됩니다', 'now counted as in transit'));
  if ($('poCancel')) $('poCancel').onclick = async () => { if (await confirmBox(bt('이 발주서를 취소할까요?', 'Cancel this PO?') + ' ' + p.no, bt('취소하기', 'Cancel PO'))) save({ st: 'x', xAt: new Date().toISOString(), xBy: S.user.email }, '✖ ' + p.no); else openPO(p); };
  if ($('poAll')) $('poAll').onclick = () => document.querySelectorAll('.pl-rq').forEach(i => { i.value = p.lines[+i.dataset.i].q; });
  if ($('poRecv')) $('poRecv').onclick = () => {
    const lines = p.lines.map(l => Object.assign({}, l)); let bad = '';
    document.querySelectorAll('.pl-rq').forEach(i => { const l = lines[+i.dataset.i], n = Number(i.value.trim() || 0); if (!(Number.isInteger(n) && n >= 0 && n <= l.q)) bad = l.c; else l.qr = n; });
    if (bad) { toast(bt('받은 수량은 0 ~ 주문 수량', 'Received must be 0 to ordered') + ' — ' + bad, 'bad'); return; }
    const all = lines.every(l => l.qr >= l.q), some = lines.some(l => l.qr > 0);
    save(Object.assign({ lines, st: all ? 'recv' : some ? 'partial' : 'sent' }, all ? { recvAt: new Date().toISOString() } : {}), '📦 ' + p.no + ' — ' + (all ? bt('다 받음', 'fully received') : bt('일부 받음', 'partly received')));
  };
}

/* ---------- ⬇️ CSV ---------- */
function exportCsv() {
  const L = filtered(); if (!L.length) { toast(bt('내려받을 것이 없습니다', 'Nothing to export'), 'bad'); return; }
  const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['Code', 'Description', 'Supplier', 'Status', 'On hand', 'In transit', 'Avg per month', 'Days left', 'Suggested', 'To buy', 'Lead', 'Safety', 'Cycle', 'Out-of-stock days', 'On PO'];
  const rows = L.map(r => [r.c, r.d, supName(r.sup), ST_OF(r.st)[3], r.qty, r.transit, fmtAvgM(r), fmtCover(r), r.buy, qtyOf(r), r.lead, r.seg, r.cyc, r.zero, r.inPO.join(' ')]);
  const csv = '﻿' + [head].concat(rows).map(r => r.map(q).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'purchase-plan-' + today() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
}

/* 시험용 — 상태 보기 */
export const _P = P;
