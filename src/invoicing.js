/* ============================================================
 *  인보이스 종류 · 할인 · 번호 · 인쇄 — 주문(세일즈맨)와 주문 처리(매니저)가 같이 씀
 *  settings/app.invTypes = [{ c:'G', n:'일반', comm:'A', match:'' }, { c:'H', n:'헤어', comm:'P', match:'EDGE BOOSTER, 코드:EB' }, …]
 *    match: 아이템의 Group · Level 1~3 이름이나 "코드:EB" (코드 앞글자) 중 하나라도 맞으면 그 종류. 안 맞으면 첫 종류(A).
 *  accounts/{acct}.disc = { A: 20, W: 10 }  ← 거래처 기본 할인 % (종류별)
 *  invoices/{no} = { no, t, order, acct, store, sm, d, ym, lines:[{c,d,q,p,lp}], sub, disc, total, bal, terms, st:'open'|'x', memo, createdBy, createdAt }
 * ============================================================ */
import { esc, money, R2, addDays, invNoOld } from './ui.js';
import { catalog } from './catalog.js';

/* 새로 시작하는 인보이스 종류 (2026-10) — 영문 한 글자 + 다섯 자리 번호, 99999 를 넘으면 다음 단계 (J99999 → JA00001 → JB00001 …)
 *  comm: 커미션 계산 때 어느 칸으로 셀지 (A 기본 · P · W) */
/* 이전 시스템과 같은 A · P · W — A 주얼리, P 그 외 제품, W 디스플레이 · 세트 주문.
 *  번호는 이전 시스템 마지막 번호(2026-10-16: A43106 · P-008748 · W00611) 다음부터 (관리 → 설정에서 바꿀 수 있음) */
export const INV_DEFAULT = [
  { c: 'A', n: '주얼리 Jewelry', comm: 'A', match: 'Jewelry', start: 43107 },
  { c: 'P', n: '그 외 제품 Other', comm: 'P', match: 'Other, Beauty, Hair', start: 8749 },
  { c: 'W', n: '주얼리 · 디스플레이/세트 (커미션 제한) Jewelry display & set', comm: 'W', match: 'Set & Display, Set Orders & Displays, 🧩 세트 · 인서트', start: 612 }
];
const OLD_DEFAULT = 'G,J,H,D,R';   // v0.6.x 임시 종류 — 저장돼 있어도 무시
export const NUM_DIGITS = 6, NUM_MAX = 999999;
const LEVELS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // I · O 는 숫자와 헷갈려서 뺌
export function invTypes(S) {
  let t = (S.settings && Array.isArray(S.settings.invTypes) && S.settings.invTypes.length) ? S.settings.invTypes : INV_DEFAULT;
  if (t !== INV_DEFAULT && t.map(x => x.c).join(',') === OLD_DEFAULT) t = INV_DEFAULT;
  return t.map(x => Object.assign({ n: x.c, comm: 'A', match: '' }, x, { c: String(x.c).toUpperCase() }));
}
/** 아이템 → 인보이스 종류 */
export function typeOfItem(S, it) {
  const types = invTypes(S);
  if (!it) return types[0].c;
  const names = [it.g, it.l1, it.l2, it.l3].map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
  const code = String(it.c || '').toUpperCase();
  for (const t of types.slice(1).concat(types.slice(0, 1))) {
    const terms = String(t.match || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
    for (const m of terms) {
      const pm = m.match(/^(코드|CODE)\s*:\s*(.+)$/);
      if (pm ? code.startsWith(pm[2].trim()) : names.includes(m)) return t.c;
    }
  }
  return types[0].c;
}
/** 거래처 기본 할인 (종류별 %) */
export function acctDisc(acc) { const d = (acc && acc.disc) || {}; const o = {}; Object.keys(d).forEach(k => { const v = Number(d[k]); if (v) o[k.toUpperCase()] = v; }); return o; }

/**
 * 줄 → 종류별 합계
 * lines: [{c,d,q,p,lp,t,pq?}] · disc: {A:20} · useQ: 'q'(주문 수량) | 'pq'(픽킹 수량)
 */
export function splitByType(lines, disc, useQ) {
  const by = {};
  lines.forEach(l => {
    const q = useQ === 'pq' ? (l.pq == null ? l.q : l.pq) : l.q; if (!q) return;
    const t = l.t || 'G';
    const g = by[t] = by[t] || { t, lines: [], sub: 0, list: 0, qty: 0 };
    g.lines.push(Object.assign({}, l, { q })); g.sub += q * l.p; g.list += q * (l.lp != null ? l.lp : l.p); g.qty += q;
  });
  /* 합계는 인쇄되는 줄 금액(할인가를 센트로 반올림 × 수량)의 합 — 그래야 인보이스의 줄 합과 Total 이 1센트도 안 틀림 */
  Object.values(by).forEach(g => { g.sub = R2(g.sub); g.list = R2(g.list); g.disc = Number((disc || {})[g.t]) || 0; g.total = R2(g.lines.reduce((a, l) => a + lineTotal(l.q, l.p, g.disc), 0)); g.discAmt = R2(g.sub - g.total); });
  return by;
}
/** 줄 하나의 할인가 · 금액 — 인보이스 인쇄와 합계 계산이 같은 식을 씀 */
export function dcPrice(p, dc) { return R2(Number(p) * (1 - (Number(dc) || 0) / 100)); }
export function lineTotal(q, p, dc) { return R2((Number(q) || 0) * dcPrice(p, dc)); }
/* ---------- 인보이스 보기 방식 (설정 기본값 + 인쇄할 때 바꿀 수 있음) ----------
 *  sort: 'group' 분류별로 묶고 소계 (기본) · 'abc' 코드 ABC 순 · 'order' 주문에 담은 순서
 *  kits: 'open' 세트 구성품을 아래에 풀어서 (기본 — 손님이 상자 열고 하나씩 맞춰 보기 좋음) · 'closed' 세트 한 줄만 */
export const INV_VIEW_DEFAULT = { sort: 'group', kits: 'open' };
export function invView(S) {
  let v = Object.assign({}, INV_VIEW_DEFAULT, (S && S.settings && S.settings.invView) || {});
  try { const l = JSON.parse(localStorage.getItem('theone.invView') || 'null'); if (l) v = Object.assign(v, l); } catch (e) {}
  return v;
}
export function setInvView(v) { try { localStorage.setItem('theone.invView', JSON.stringify(v)); } catch (e) {} }
/** 가격 바뀐 정도 (목록가 대비) */
export function priceDiff(lines, useQ) {
  let list = 0, real = 0, n = 0;
  lines.forEach(l => { const q = useQ === 'pq' ? (l.pq == null ? l.q : l.pq) : l.q; if (l.lp == null || !q) return; list += q * l.lp; real += q * l.p; if (Math.abs(l.lp - l.p) > 0.0001) n++; });
  return { list: R2(list), real: R2(real), diff: R2(real - list), n, pct: list ? R2((real - list) / list * 100) : 0 };
}
/** n 번째 인보이스 번호 — 1 → A-000001 · 999999 → A-999999 · 1000000 → AA-000001 · 1999998 → AA-999999 → AB-000001 … (I · O 는 건너뜀) */
export function fmtNo(t, n) {
  n = Math.max(1, Math.floor(Number(n) || 1));
  const lv = Math.floor((n - 1) / NUM_MAX), k = ((n - 1) % NUM_MAX) + 1;
  return t.c + (lv ? LEVELS[lv - 1] || ('Z' + lv) : '') + '-' + String(k).padStart(NUM_DIGITS, '0');
}
/* ---------- 인보이스 읽기 캐시 — 달 단위로 한 번만 읽고 기간은 메모리에서 거름 (읽기 횟수 · 비용 절약) ---------- */
const INV_M = new Map();   // 'YYYY-MM' → rows (st != 'x' 포함 전부)
let INV_AT = 0;
export function dropInvCache() { INV_M.clear(); INV_AT = 0; }
export async function invoicesBetween(S, from, to) {
  if (Date.now() - INV_AT > 15 * 60000) { INV_M.clear(); INV_AT = Date.now(); }   // 15분마다 새로
  const months = []; let m = from.substring(0, 7); while (m <= to.substring(0, 7)) { months.push(m); const y = Number(m.substring(0, 4)), mm = Number(m.substring(5, 7)); m = (mm === 12 ? (y + 1) + '-01' : y + '-' + String(mm + 1).padStart(2, '0')); }
  const miss = months.filter(k => !INV_M.has(k));
  if (miss.length) {
    /* 연속된 달은 한 번에 */
    const first = miss[0], last = miss[miss.length - 1];
    const rows = await S.DB.list('invoices', { where: [['d', '>=', first + '-01'], ['d', '<=', last + '-31']] });
    miss.forEach(k => INV_M.set(k, []));
    rows.forEach(r => { const k = String(r.d || '').substring(0, 7); if (INV_M.has(k)) INV_M.get(k).push(r); });
  }
  const out = []; months.forEach(k => (INV_M.get(k) || []).forEach(r => { if (r.d >= from && r.d <= to) out.push(r); }));
  return out;
}
/* ---------- 월별 매출 요약 salesM/{ym} — 긴 기간(분기 · 올해)은 인보이스 수천 장 대신 요약 12건만 읽음 ----------
 *  { ym, n, qty, total, bySm: { SM: { T: { n, qty, total } } }, byDay: { 'DD': total }, updatedAt }
 *  발행(+1) · 취소(−1) · 가져오기(다시 계산) 때 갱신. 문서가 없으면 그 달은 원본을 읽고 요약을 만들어 저장함 */
const SM_M = new Map();
export function dropSalesM() { SM_M.clear(); }
/** 매출 아이템 구분 (회사 매출 시트와 같게) — 주얼리 분류는 모두 JEWELRY 한 줄, 그 외 제품([EDGE BOOSTER] · [PERFUME] · <GIFT> …)은 제품 이름별 */
export function itemKey(l1) {
  const s = String(l1 || '').trim(); if (!s) return '(기타)';
  if (/SHIP|UPS|FEDEX|FREIGHT/i.test(s)) return 'SHIPPING';
  if (/^[\[<*#]/.test(s) || /^zz?[A-Z]/.test(s)) return s.replace(/^[\[<*#]+|[\]>*]+$/g, '').replace(/^zz?(?=[A-Z])/, '').trim().toUpperCase() || s;
  return 'JEWELRY';
}
let ACCS = null;   // 거래처 (주 State 찾기) — 요약을 만드는 곳에서 S.accounts 로 채움
const stateOf = acct => { const a = ACCS && ACCS.byCode ? ACCS.byCode[acct] : null; return String((a && a.state) || '').toUpperCase().trim() || '—'; };
function mAdd(doc, x, sign) {
  if (!x || x.st === 'x') return;
  const t = x.t || 'A', sm = x.sm || '—', dd = String(x.d || '').substring(8, 10) || '00', tot = R2((x.total || 0) * sign), q = (x.qty || 0) * sign;
  doc.n += sign; doc.qty += q; doc.total = R2(doc.total + tot);
  const s = doc.bySm[sm] = doc.bySm[sm] || {}; const b = s[t] = s[t] || { n: 0, qty: 0, total: 0 }; b.n += sign; b.qty += q; b.total = R2(b.total + tot);
  doc.byDay[dd] = R2((doc.byDay[dd] || 0) + tot);
  doc.byState = doc.byState || {}; const st = stateOf(x.acct); doc.byState[st] = R2((doc.byState[st] || 0) + tot);
  /* 아이템(품목 = Level 1)별 — 줄 금액을 인보이스 합계에 맞춰 나눔 (할인 · 배송비 반영). 줄이 없는 이전 시스템 인보이스는 "(A)" 처럼 종류로 */
  doc.byItem = doc.byItem || {};
  const L = (x.lines || []).filter(l => l && l.q && l.p), base = L.reduce((a, l) => a + l.q * l.p, 0);
  if (L.length && base > 0) { const f = (x.total || 0) / base; L.forEach(l => { const g = itemKey(l.g); doc.byItem[g] = R2((doc.byItem[g] || 0) + l.q * l.p * f * sign); }); }
  else { const g = t === 'P' ? '(P)' : 'JEWELRY'; doc.byItem[g] = R2((doc.byItem[g] || 0) + tot); }   // 줄 없는 이전 시스템 인보이스: A · W = 주얼리, P = 그 외 (어느 제품인지 모름)
}
export function buildSalesM(ym, rows) { const doc = { id: ym, ym, n: 0, qty: 0, total: 0, bySm: {}, byDay: {}, byState: {}, byItem: {}, v: 4, updatedAt: new Date().toISOString() }; rows.forEach(x => mAdd(doc, x, 1)); return doc; }
/** 한 달 매출 요약 — 있으면 읽고, 없거나 옛 모양(주별 없음)이면 인보이스에서 새로 계산해 저장 (관리자 · 담당자) */
export async function salesMonth(S, k) {
  ACCS = S.accounts;
  let doc = SM_M.get(k);
  if (!doc) { try { doc = await S.DB.get('salesM', k); } catch (e) { doc = null; } }
  if (!doc || doc.v !== 4) {
    const y = Number(k.substring(0, 4)), mm = Number(k.substring(5, 7)), last = k + '-' + String(new Date(y, mm, 0).getDate()).padStart(2, '0');
    doc = buildSalesM(k, await invoicesBetween(S, k + '-01', last));
    if (S.role !== 'salesman') { try { await S.DB.set('salesM', k, doc); } catch (e) {} }
  }
  SM_M.set(k, doc); return doc;
}
/** 요약 문서 → 대시보드가 쓰는 가짜 인보이스 줄 (세일즈맨 × 종류 하나씩, cnt 에 장수) */
function expandM(doc) {
  const out = [];
  Object.keys(doc.bySm || {}).forEach(sm => Object.keys(doc.bySm[sm]).forEach(t => { const b = doc.bySm[sm][t]; out.push({ no: 'SUM-' + doc.ym + '-' + sm + '-' + t, d: doc.ym + '-15', ym: doc.ym, sm, t, total: b.total, qty: b.qty, cnt: b.n, st: 'open', src: 'sum', byDay: doc.byDay }); }));
  return out;
}
export const invCount = rows => rows.reduce((a, x) => a + (x.cnt || 1), 0);
/** 기간의 매출 줄 — 꽉 찬 달은 요약, 걸치는 달은 원본 */
export async function salesRows(S, from, to) {
  ACCS = S.accounts;
  const months = []; let m = from.substring(0, 7); while (m <= to.substring(0, 7)) { months.push(m); const y = Number(m.substring(0, 4)), mm = Number(m.substring(5, 7)); m = (mm === 12 ? (y + 1) + '-01' : y + '-' + String(mm + 1).padStart(2, '0')); }
  const last = k => { const y = Number(k.substring(0, 4)), mm = Number(k.substring(5, 7)); return k + '-' + String(new Date(y, mm, 0).getDate()).padStart(2, '0'); };
  const out = [];
  for (const k of months) {
    const full = from <= k + '-01' && to >= last(k);
    if (!full) { (await invoicesBetween(S, k + '-01' < from ? from : k + '-01', last(k) > to ? to : last(k))).forEach(x => out.push(x)); continue; }
    let doc = SM_M.get(k);
    if (!doc) { try { doc = await S.DB.get('salesM', k); } catch (e) { doc = null; } }
    if (!doc) { const rows = await invoicesBetween(S, k + '-01', last(k)); doc = buildSalesM(k, rows); if (S.role !== 'salesman') { try { await S.DB.set('salesM', k, doc); } catch (e) {} } }
    SM_M.set(k, doc); expandM(doc).forEach(x => out.push(x));
  }
  return out;
}
/** 발행 · 취소 때 그 달 요약 갱신 (요약이 아직 없으면 그냥 둠 — 처음 볼 때 만들어짐) */
export async function bumpSalesM(S, invs, sign) {
  ACCS = S.accounts;
  const by = {}; (invs || []).forEach(x => { const k = String(x.d || '').substring(0, 7); if (k) (by[k] = by[k] || []).push(x); });
  for (const k of Object.keys(by)) { try { const doc = await S.DB.get('salesM', k); if (!doc) continue; by[k].forEach(x => mAdd(doc, x, sign)); doc.updatedAt = new Date().toISOString(); await S.DB.set('salesM', k, doc); } catch (e) {} }
  dropSalesM();
}
/** 가져오기 뒤 — 그 달들을 원본에서 다시 계산 */
export async function rebuildSalesM(S, months) {
  ACCS = S.accounts;
  dropInvCache(); dropSalesM();
  const last = k => { const y = Number(k.substring(0, 4)), mm = Number(k.substring(5, 7)); return k + '-' + String(new Date(y, mm, 0).getDate()).padStart(2, '0'); };
  const uniq = Array.from(new Set(months)).sort(); if (!uniq.length) return 0;
  const rows = await invoicesBetween(S, uniq[0] + '-01', last(uniq[uniq.length - 1]));
  const by = {}; rows.forEach(x => { const k = String(x.d || '').substring(0, 7); (by[k] = by[k] || []).push(x); });
  for (const k of uniq) await S.DB.set('salesM', k, buildSalesM(k, by[k] || []));
  return uniq.length;
}
/** 인보이스 한 장 읽기 — 새 형식(A-043350)으로 먼저, 없으면 형식 통일 전 모양(A43350 …)으로 */
export async function getInvoice(S, no) { for (const k of invNoOld(no)) { const x = await S.DB.get('invoices', k); if (x) return x; } return null; }
export async function nextInvoiceNo(S, t) { const n = await S.DB.seq('inv2', t.c, t.start || 1); return fmtNo(t, n); }

/* ---------- 회사 정보 (관리 → 설정) ---------- */
/* 인보이스 꼬리말(footer) — 보통 도매 인보이스에 들어가는 조건들. 관리 → 설정에서 고침. paper: letter(8.5×11) · a4, sig: 수령 서명 줄 */
export const FOOTER_DEFAULT = 'Please make checks payable to THE ONE CORP and write the invoice number on your check.\nPayment is due by the Due Date above. Past-due balances are subject to a 1.5% monthly finance charge (18% APR).\nReturned checks are subject to a $35 NSF fee.\nPlease check your merchandise upon receipt. Claims for shortages or damages must be reported within 7 days. No returns without prior authorization.\nAll merchandise remains the property of THE ONE CORP until paid in full.';
export const CO_DEFAULT = { name: 'THE ONE CORP', addr1: '4265 CHURCH STREET, UNIT 1009', addr2: 'SANFORD, FL 32771', tel: '(407) 878 - 7274', thanks: 'Thank You For Your Business !', footer: FOOTER_DEFAULT, paper: 'letter', sig: true };
export function company(S) { return Object.assign({}, CO_DEFAULT, (S && S.settings && S.settings.co) || {}); }
/** 조건에서 일수 — N30 → 30 · ACH60 → 60 · COD → 0 · 없으면 30 */
export function termDays(terms) { const t = String(terms || '').toUpperCase(); if (/COD|CASH/.test(t)) return 0; const m = t.match(/(\d{1,3})/); return m ? Number(m[1]) : 30; }
const fmtD = d => { d = String(d || ''); return d.length >= 10 ? d.substring(5, 7) + '/' + d.substring(8, 10) + '/' + d.substring(2, 4) : d; };
const n2 = v => { v = Number(v) || 0; const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (v < 0 ? '-' : '') + (Math.abs(v) < 1 && Math.abs(v) > 0 ? s.replace(/^0/, '') : s); };

/** 문서 머리 — 회사 · 제목 · 날짜/번호 상자 (인보이스 · 픽킹 공용) */
export function docHead(co, title, boxes) {
  return '<div class="ivh"><div style="display:flex;align-items:center"><img src="logo.png" class="ivlogo" alt=""><div><div class="ivco">' + esc(co.name) + '</div><div class="ivad">' + esc(co.addr1) + '<br>' + esc(co.addr2) + '<br>Phone. ' + esc(co.tel) + '</div></div></div>' +
    '<div style="text-align:right"><div class="ivt">' + esc(title) + '</div><table class="ivbox"><tr>' + boxes.map(b => '<th>' + esc(b[0]) + '</th>').join('') + '</tr><tr>' + boxes.map(b => '<td>' + esc(b[1]) + '</td>').join('') + '</tr></table></div></div>';
}
/**
 * 세일즈 인보이스 — 이전 양식: BILL TO/SHIP TO · Acct/Terms/Rep/Ship/Via/S.O./Due · 품목 (DC % · DC Price) · 분류별 소계 · AR 에이징 · 합계
 *  opt = { co, ar: { asOf, bk:[5], bal }, shipVia, rep }
 */
export function invoiceHtml(inv, acc, opt) {
  opt = opt || {}; const co = opt.co || CO_DEFAULT;
  const C = catalog(), view = Object.assign({}, INV_VIEW_DEFAULT, opt.view || {});
  const grpOf = l => { if (l.g) return l.g; const it = C && C.byCode[l.c]; return it ? (it.l1 || it.g || '') : ''; };
  const byGroup = view.sort === 'group';
  /* 손님 보기 순서 — 제품 라인(Level 1)별로 묶고, 그 안에서 세부 라인(Level 2 · 3) → 코드 순 */
  const subOf = l => { const it = C && C.byCode[l.c]; return it ? [it.l2 || '', it.l3 || ''].join('\u0001') : ''; };
  const COLL2 = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const rows = view.sort === 'order' ? inv.lines.slice() : view.sort === 'abc' ? inv.lines.slice().sort((a, b) => COLL2.compare(a.c, b.c)) : inv.lines.slice().sort((a, b) => COLL2.compare(grpOf(a), grpOf(b)) || COLL2.compare(subOf(a), subOf(b)) || COLL2.compare(a.c, b.c));
  const dc = Number(inv.disc) || 0;
  const A = inv.shipTo ? Object.assign({}, acc || {}, inv.shipTo) : acc;   // 🏬 이 주문만 고친 이름 · 주소가 있으면 그걸로
  const addr = A ? [A.addr, [A.city, A.state].filter(Boolean).join(', ') + (A.zip ? ' ' + A.zip : '')].filter(Boolean) : [];
  const party = (t) => '<div class="ivp"><b>' + t + ' :</b><div>' + esc(inv.store) + '</div>' + addr.map(x => '<div>' + esc(x) + '</div>').join('') + (t === 'BILL TO' ? '<div>Phone : ' + esc((acc && acc.tel) || '') + '</div>' : '') + '</div>';
  const terms = inv.terms || (acc && acc.terms) || 'N30';
  const due = addDays(inv.d, termDays(terms));
  /* 품목 — 분류별 소계 */
  let body = '', cur = null, gq = 0, gl = 0, gd = 0, gt = 0, tq = 0;
  const gName = g => String(g || '').replace(/^""|""$/g, '').replace(/^["\[<*]+|["\]>*]+$/g, '').trim() || 'OTHER';
  const flush = () => { if (cur === null || !byGroup) return; body += '<tr class="ivsub"><td colspan="4" class="r">' + esc(gName(cur)) + ' Sub Total:</td><td class="r">' + n2(gl) + '</td><td></td><td class="r">' + n2(gt - gl) + '</td><td class="r">' + n2(gt) + '</td></tr>'; gq = gl = gd = gt = 0; };
  let sumT = 0;
  rows.forEach(l => {
    const g = grpOf(l); if (byGroup && g !== cur) { flush(); cur = g; body += '<tr class="ivgh"><td colspan="7">' + esc(gName(g)) + '</td></tr>'; }
    const dp = dcPrice(l.p, dc), lt = lineTotal(l.q, l.p, dc); gq += l.q; gl += l.q * l.p; gt += lt; tq += l.q; sumT += lt;
    const kitOpen = l.kit && l.kit.length && view.kits !== 'closed';
    body += '<tr' + (kitOpen ? ' class="ivset"' : '') + '><td><b>' + esc(l.c) + '</b></td><td class="r">' + l.q + '</td><td>' + esc(l.d) + (l.kit && !kitOpen ? '<div class="ivkit">SET: ' + l.kit.map(k => esc(k.c) + '×' + k.q).join(', ') + '</div>' : '') + '</td><td class="r">' + n2(l.p) + '</td><td class="r">' + (dc ? dc + '%' : '%') + '</td><td class="r">' + n2(dp) + '</td><td class="r">' + n2(lt) + '</td></tr>';
    if (kitOpen) l.kit.forEach(k => { const it = C && C.byCode[k.c]; body += '<tr class="ivkitrow"><td>&nbsp;&nbsp;↳ ' + esc(k.c) + '</td><td class="r">' + (k.q * l.q) + '</td><td>' + esc(it ? it.d : '') + '</td><td class="r"></td><td></td><td class="r"></td><td class="r">incl.</td></tr>'; });
  });
  flush();
  sumT = R2(sumT);
  const ar = opt.ar;
  const arBox = ar && ar.asOf ? '<div class="ivar"><div class="ivart">AR balance Aging As Of ' + esc(fmtD(ar.asOf)) + '</div><table><tr><th>0-30</th><th>31-60</th><th>61-90</th><th>Over 90</th><th>Total</th></tr><tr><td>' + n2(ar.bk[0] + ar.bk[1]) + '</td><td>' + n2(ar.bk[2]) + '</td><td>' + n2(ar.bk[3]) + '</td><td>' + n2(ar.bk[4]) + '</td><td><b>' + n2(ar.bal) + '</b></td></tr></table></div>' : '';
  /* 합계는 인쇄된 줄의 합 — 저장된 total 과 1센트라도 다르면(옛 인보이스) 줄 합을 믿음 */
  const net = Math.abs(sumT - inv.total) > 0.005 ? sumT : inv.total, discAmt = R2(inv.sub - net);
  const footer = String(co.footer == null ? FOOTER_DEFAULT : co.footer).split(/\n/).map(x => x.trim()).filter(Boolean);
  return '<div class="iv' + (co.paper === 'a4' ? ' pa4' : '') + '">' + docHead(co, 'INVOICE', [['Date', fmtD(inv.d)], ['Invoice No.', inv.no]]) +
    '<div class="ivparties">' + party('BILL TO') + party('SHIP TO') + '</div>' +
    '<table class="ivinfo"><tr><th>Acct. No.</th><th>Terms</th><th>Rep.</th><th>Ship</th><th>Ship Via</th><th>S.O. No.</th><th>Due Date</th></tr>' +
    '<tr><td>' + esc(inv.acct || '') + '</td><td>' + esc(terms) + '</td><td>' + esc(opt.rep || inv.sm || '') + '</td><td>' + esc(fmtD(inv.d)) + '</td><td>' + esc(opt.shipVia || inv.shipVia || 'UPS') + '</td><td>' + esc(inv.order || '') + '</td><td>' + esc(fmtD(due)) + '</td></tr></table>' +
    '<table class="ivlines"><thead><tr><th>Item</th><th class="r">Qty</th><th>Description</th><th class="r">Price</th><th class="r">DC %</th><th class="r">DC Price</th><th class="r">Total</th></tr></thead><tbody>' + body + '</tbody></table>' +
    arBox +
    '<div class="ivfoot"><div class="ivthx">' + esc(co.thanks || '') + (inv.memo ? '<br>' + esc(inv.memo) : '') + '<div class="ivpcs">' + rows.length + ' lines · ' + tq + ' pcs' + (view.kits !== 'closed' && rows.some(l => l.kit && l.kit.length) ? ' · set contents listed under each set (incl.)' : '') + '</div></div>' +
    '<table class="ivtot"><tr><td>Sub Total</td><td class="r">' + n2(inv.sub) + '</td></tr><tr><td>Discount' + (dc ? ' ' + dc + '%' : '') + '</td><td class="r">' + n2(-discAmt) + '</td></tr><tr><td>S &amp; H</td><td class="r">' + n2(inv.ship || 0) + '</td></tr><tr class="ivT"><td>Total</td><td class="r">' + n2(net + (Number(inv.ship) || 0)) + '</td></tr></table></div>' +
    (footer.length ? '<div class="ivterms">' + footer.map(x => '<div>• ' + esc(x) + '</div>').join('') + '</div>' : '') +
    (co.sig !== false ? '<div class="ivsig"><div>Received by (print &amp; sign)</div><div>Date</div><div>Checked by</div></div>' : '') +
    '<div class="ivpg">' + esc(inv.no) + ' · printed ' + esc(new Date().toLocaleString('en-US')) + '</div></div>';
}
