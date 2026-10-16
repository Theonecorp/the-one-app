/* ============================================================
 *  인보이스 종류 · 할인 · 번호 · 인쇄 — 오더(세일즈맨)와 오더 처리(매니저)가 같이 씀
 *  settings/app.invTypes = [{ c:'G', n:'일반', comm:'A', match:'' }, { c:'H', n:'헤어', comm:'P', match:'EDGE BOOSTER, 코드:EB' }, …]
 *    match: 아이템의 Group · Level 1~3 이름이나 "코드:EB" (코드 앞글자) 중 하나라도 맞으면 그 종류. 안 맞으면 첫 종류(A).
 *  accounts/{acct}.disc = { A: 20, W: 10 }  ← 거래처 기본 할인 % (종류별)
 *  invoices/{no} = { no, t, order, acct, store, sm, d, ym, lines:[{c,d,q,p,lp}], sub, disc, total, bal, terms, st:'open'|'x', memo, createdBy, createdAt }
 * ============================================================ */
import { esc, money, R2, addDays } from './ui.js';
import { catalog } from './catalog.js';

/* 새로 시작하는 인보이스 종류 (2026-10) — 영문 한 글자 + 다섯 자리 번호, 99999 를 넘으면 다음 단계 (J99999 → JA00001 → JB00001 …)
 *  comm: 커미션 계산 때 어느 칸으로 셀지 (A 기본 · P · W) */
export const INV_DEFAULT = [
  { c: 'G', n: '일반', comm: 'A', match: '' },
  { c: 'J', n: '주얼리', comm: 'A', match: 'Jewelry, Body & Nose' },
  { c: 'H', n: '뷰티 · 헤어', comm: 'P', match: 'Beauty' },
  { c: 'D', n: '세트 · 인서트 · 디스플레이', comm: 'W', match: 'Set Orders & Displays, 🧩 세트 · 인서트' },
  { c: 'R', n: '반품 · 크레딧', comm: 'CM', match: '' }
];
export const NUM_DIGITS = 5, NUM_MAX = 99999;
const LEVELS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // I · O 는 숫자와 헷갈려서 뺌
export function invTypes(S) {
  const t = (S.settings && Array.isArray(S.settings.invTypes) && S.settings.invTypes.length) ? S.settings.invTypes : INV_DEFAULT;
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
  Object.values(by).forEach(g => { g.sub = R2(g.sub); g.list = R2(g.list); g.disc = Number((disc || {})[g.t]) || 0; g.discAmt = R2(g.sub * g.disc / 100); g.total = R2(g.sub - g.discAmt); });
  return by;
}
/** 가격 바뀐 정도 (목록가 대비) */
export function priceDiff(lines, useQ) {
  let list = 0, real = 0, n = 0;
  lines.forEach(l => { const q = useQ === 'pq' ? (l.pq == null ? l.q : l.pq) : l.q; if (l.lp == null || !q) return; list += q * l.lp; real += q * l.p; if (Math.abs(l.lp - l.p) > 0.0001) n++; });
  return { list: R2(list), real: R2(real), diff: R2(real - list), n, pct: list ? R2((real - list) / list * 100) : 0 };
}
/** n 번째 인보이스 번호 — 1 → G00001 · 99999 → G99999 · 100000 → GA00001 · … */
export function fmtNo(t, n) {
  n = Math.max(1, Math.floor(Number(n) || 1));
  const lv = Math.floor((n - 1) / NUM_MAX), k = ((n - 1) % NUM_MAX) + 1;
  return t.c + (lv ? LEVELS[lv - 1] || ('Z' + lv) : '') + String(k).padStart(NUM_DIGITS, '0');
}
export async function nextInvoiceNo(S, t) { const n = await S.DB.seq('inv2', t.c, 1); return fmtNo(t, n); }

/* ---------- 회사 정보 (관리 → 설정) ---------- */
export const CO_DEFAULT = { name: 'THE ONE CORP', addr1: '4265 CHURCH STREET, UNIT 1009', addr2: 'SANFORD, FL 32771', tel: '(407) 878 - 7274', thanks: 'Thank You For Your Business !' };
export function company(S) { return Object.assign({}, CO_DEFAULT, (S && S.settings && S.settings.co) || {}); }
/** 조건에서 일수 — N30 → 30 · ACH60 → 60 · COD → 0 · 없으면 30 */
export function termDays(terms) { const t = String(terms || '').toUpperCase(); if (/COD|CASH/.test(t)) return 0; const m = t.match(/(\d{1,3})/); return m ? Number(m[1]) : 30; }
const fmtD = d => { d = String(d || ''); return d.length >= 10 ? d.substring(5, 7) + '/' + d.substring(8, 10) + '/' + d.substring(2, 4) : d; };
const n2 = v => { v = Number(v) || 0; const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (v < 0 ? '-' : '') + (Math.abs(v) < 1 ? s.replace(/^0/, '') : s); };

/** 문서 머리 — 회사 · 제목 · 날짜/번호 상자 (인보이스 · 픽킹 공용) */
export function docHead(co, title, boxes) {
  return '<div class="ivh"><div style="display:flex;align-items:center"><img src="logo.png" class="ivlogo" alt=""><div><div class="ivco">' + esc(co.name) + '</div><div class="ivad">' + esc(co.addr1) + '<br>' + esc(co.addr2) + '<br>Phone. ' + esc(co.tel) + '</div></div></div>' +
    '<div style="text-align:right"><div class="ivt">' + esc(title) + '</div><table class="ivbox"><tr>' + boxes.map(b => '<th>' + esc(b[0]) + '</th>').join('') + '</tr><tr>' + boxes.map(b => '<td>' + esc(b[1]) + '</td>').join('') + '</tr></table></div></div>';
}
/**
 * 세일즈 인보이스 — SmartBee 양식: BILL TO/SHIP TO · Acct/Terms/Rep/Ship/Via/S.O./Due · 품목 (DC % · DC Price) · 분류별 소계 · AR 에이징 · 합계
 *  opt = { co, ar: { asOf, bk:[5], bal }, shipVia, rep }
 */
export function invoiceHtml(inv, acc, opt) {
  opt = opt || {}; const co = opt.co || CO_DEFAULT;
  const C = catalog();
  const grpOf = l => { if (l.g) return l.g; const it = C && C.byCode[l.c]; return it ? (it.l1 || it.g || '') : ''; };
  const rows = inv.lines.slice().sort((a, b) => (grpOf(a) + a.c) < (grpOf(b) + b.c) ? -1 : 1);
  const dc = Number(inv.disc) || 0, f = 1 - dc / 100;
  const addr = acc ? [acc.addr, [acc.city, acc.state].filter(Boolean).join(', ') + (acc.zip ? ' ' + acc.zip : '')].filter(Boolean) : [];
  const party = (t) => '<div class="ivp"><b>' + t + ' :</b><div>' + esc(inv.store) + '</div>' + addr.map(x => '<div>' + esc(x) + '</div>').join('') + (t === 'BILL TO' ? '<div>Phone : ' + esc((acc && acc.tel) || '') + '</div>' : '') + '</div>';
  const terms = inv.terms || (acc && acc.terms) || 'N30';
  const due = addDays(inv.d, termDays(terms));
  /* 품목 — 분류별 소계 */
  let body = '', cur = null, gq = 0, gl = 0, gd = 0, gt = 0, tq = 0;
  const flush = () => { if (cur === null) return; body += '<tr class="ivsub"><td colspan="4" class="r">' + esc(cur || '기타') + ' Sub Total:</td><td class="r">' + n2(gl) + '</td><td></td><td class="r">' + n2(gt - gl) + '</td><td class="r">' + n2(gt) + '</td></tr>'; gq = gl = gd = gt = 0; };
  rows.forEach(l => {
    const g = grpOf(l); if (g !== cur) { flush(); cur = g; }
    const dp = R2(l.p * f), lt = R2(l.q * dp); gq += l.q; gl += l.q * l.p; gt += lt; tq += l.q;
    body += '<tr><td><b>' + esc(l.c) + '</b></td><td class="r">' + l.q + '</td><td>' + esc(l.d) + (l.kit ? '<div class="ivkit">' + l.kit.map(k => esc(k.c) + '×' + k.q).join(', ') + '</div>' : '') + '</td><td class="r">' + n2(l.p) + '</td><td class="r">' + (dc ? dc + '%' : '%') + '</td><td class="r">' + n2(dp) + '</td><td class="r">' + n2(lt) + '</td></tr>';
  });
  flush();
  const ar = opt.ar;
  const arBox = ar && ar.asOf ? '<div class="ivar"><div class="ivart">AR balance Aging As Of ' + esc(fmtD(ar.asOf)) + '</div><table><tr><th>0-30</th><th>31-60</th><th>61-90</th><th>Over 90</th><th>Total</th></tr><tr><td>' + n2(ar.bk[0] + ar.bk[1]) + '</td><td>' + n2(ar.bk[2]) + '</td><td>' + n2(ar.bk[3]) + '</td><td>' + n2(ar.bk[4]) + '</td><td><b>' + n2(ar.bal) + '</b></td></tr></table></div>' : '';
  const discAmt = R2(inv.sub - inv.total);
  return '<div class="iv">' + docHead(co, 'INVOICE', [['Date', fmtD(inv.d)], ['Invoice No.', inv.no]]) +
    '<div class="ivparties">' + party('BILL TO') + party('SHIP TO') + '</div>' +
    '<table class="ivinfo"><tr><th>Acct. No.</th><th>Terms</th><th>Rep.</th><th>Ship</th><th>Ship Via</th><th>S.O. No.</th><th>Due Date</th></tr>' +
    '<tr><td>' + esc(inv.acct || '') + '</td><td>' + esc(terms) + '</td><td>' + esc(opt.rep || inv.sm || '') + '</td><td>' + esc(fmtD(inv.d)) + '</td><td>' + esc(opt.shipVia || inv.shipVia || 'UPS') + '</td><td>' + esc(inv.order || '') + '</td><td>' + esc(fmtD(due)) + '</td></tr></table>' +
    '<table class="ivlines"><thead><tr><th>Item</th><th class="r">Qty</th><th>Description</th><th class="r">Price</th><th class="r">DC %</th><th class="r">DC Price</th><th class="r">Total</th></tr></thead><tbody>' + body + '</tbody></table>' +
    arBox +
    '<div class="ivfoot"><div class="ivthx">' + esc(co.thanks || '') + (inv.memo ? '<br>' + esc(inv.memo) : '') + '<div class="ivpcs">' + rows.length + ' lines · ' + tq + ' pcs</div></div>' +
    '<table class="ivtot"><tr><td>Sub Total</td><td class="r">' + n2(inv.sub) + '</td></tr><tr><td>Discount' + (dc ? ' ' + dc + '%' : '') + '</td><td class="r">' + n2(-discAmt) + '</td></tr><tr><td>S &amp; H</td><td class="r">' + n2(inv.ship || 0) + '</td></tr><tr class="ivT"><td>Total</td><td class="r">' + n2(inv.total + (Number(inv.ship) || 0)) + '</td></tr></table></div>' +
    '<div class="ivpg">' + esc(inv.no) + ' · printed ' + esc(new Date().toLocaleString('en-US')) + '</div></div>';
}
