/* ============================================================
 *  인보이스 종류 · 할인 · 번호 · 인쇄 — 오더(세일즈맨)와 오더 처리(매니저)가 같이 씀
 *  settings/app.invTypes = [{ c:'A', n:'일반', start:41600, pad:5, match:'' }, { c:'P', n:'EDGE & KEY', match:'EDGE BOOSTER, KEY' }, …]
 *    match: 아이템의 Group · Level 1~3 이름이나 "코드:EB" (코드 앞글자) 중 하나라도 맞으면 그 종류. 안 맞으면 첫 종류(A).
 *  accounts/{acct}.disc = { A: 20, W: 10 }  ← 거래처 기본 할인 % (종류별)
 *  invoices/{no} = { no, t, order, acct, store, sm, d, ym, lines:[{c,d,q,p,lp}], sub, disc, total, bal, terms, st:'open'|'x', memo, createdBy, createdAt }
 * ============================================================ */
import { esc, money, R2 } from './ui.js';

export const INV_DEFAULT = [
  { c: 'A', n: '일반', start: 50001, pad: 5, match: '' },
  { c: 'P', n: 'P 인보이스', start: 9001, pad: 6, match: '' },
  { c: 'W', n: 'W 인보이스', start: 1, pad: 5, match: '' }
];
export function invTypes(S) {
  const t = (S.settings && Array.isArray(S.settings.invTypes) && S.settings.invTypes.length) ? S.settings.invTypes : INV_DEFAULT;
  return t.map(x => Object.assign({ n: x.c, start: 1, pad: 5, match: '' }, x, { c: String(x.c).toUpperCase() }));
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
    const t = l.t || 'A';
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
export function fmtNo(t, n) { return t.c + String(n).padStart(Number(t.pad) || 0, '0'); }
export async function nextInvoiceNo(S, t) { const n = await S.DB.seq('inv', t.c, t.start || 1); return fmtNo(t, n); }

/** 세일즈 인보이스 인쇄 html */
export function invoiceHtml(inv, acc) {
  const rows = inv.lines.slice().sort((a, b) => a.c < b.c ? -1 : 1);
  return '<div style="page-break-after:always"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>THE ONE</h1><div class="meta">Wholesale</div></div>' +
    '<div style="text-align:right"><h1>INVOICE ' + esc(inv.no) + '</h1><div class="meta">' + esc(inv.d) + (inv.terms ? ' · ' + esc(inv.terms) : '') + '<br>Order ' + esc(inv.order) + ' · Sales ' + esc(inv.sm) + '</div></div></div>' +
    '<div class="meta"><b>BILL TO:</b> ' + esc(inv.store) + ' (' + esc(inv.acct || '') + ')' + (acc ? '<br>' + esc([acc.addr, acc.city, acc.state, acc.zip].filter(Boolean).join(', ')) + (acc.tel ? ' · ' + esc(acc.tel) : '') : '') + '</div>' +
    '<table><tr><th>#</th><th>CODE</th><th>DESCRIPTION</th><th class="r">QTY</th><th class="r">PRICE</th><th class="r">AMOUNT</th></tr>' +
    rows.map((l, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + esc(l.c) + '</b></td><td>' + esc(l.d) + '</td><td class="r">' + l.q + '</td><td class="r">' + money(l.p) + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') +
    '<tr><td colspan="5" class="r">SUBTOTAL (' + rows.reduce((a, l) => a + l.q, 0) + ' pcs)</td><td class="r">' + money(inv.sub) + '</td></tr>' +
    (inv.disc ? '<tr><td colspan="5" class="r">DISCOUNT ' + inv.disc + '%</td><td class="r">−' + money(inv.sub - inv.total) + '</td></tr>' : '') +
    '<tr class="fin"><td colspan="5" class="r">TOTAL</td><td class="r">' + money(inv.total) + '</td></tr></table>' +
    (inv.memo ? '<div class="meta" style="margin-top:8px">Memo: ' + esc(inv.memo) + '</div>' : '') +
    '<div class="sig"><div>Received by</div><div>Date</div></div></div>';
}
