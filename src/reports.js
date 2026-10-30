/* ============================================================
 *  📊 리포트 (관리자) — 기간을 고르면 인보이스(발행 기준)와 수금을 읽어
 *    아이템별 · 손님별 · 세일즈맨별로 묶어 보여 주고, CSV 로 내려받거나 인쇄
 *  자료: invoices (st != 'x', lines 포함) · entries · cod (수금, void 아닌 것)
 * ============================================================ */
import { $, esc, money, num, R2, today, md, toast, busy, openModal, closeModal, Router, sel, sum, sortBy, groupBy, printOpen, debounce, bi, hasWords, addDays, daysBetween, localDay, pickDates, itabs } from './ui.js';
import { PERIODS, periodRange, addMonths, monthEnd, quickRanges } from './fulfill.js';
import { invTypes, lineTotal, company, docHead, invoicesBetween } from './invoicing.js';
import { catalog, loadCatalog, cleanName } from './catalog.js';

let S = null, R = { p: 'month', from: '', to: '', tab: 'item', sm: '', q: '', sort: 'amt' }, D = null;
export function register(state) { S = state; Router.on('reports', page); }
const isAdmin = () => S.role === 'admin' || S.role === 'owner';   // 오너도 관리자급

async function page() {
  if (!isAdmin()) { $('page').innerHTML = '<div class="card"><div class="none">관리자 화면입니다</div></div>'; return; }
  const [from, to] = periodRange(R.p, R.from, R.to), days = daysBetween(from, to) + 1;
  const pl = PERIODS.find(x => x[0] === R.p), ptxt = R.p === 'custom' || !pl ? md(from) + ' ~ ' + md(to) : pl[1] + (days > 1 ? ' (' + md(from) + ' ~ ' + md(to) + ')' : ' ' + md(from));
  const MAIN = ['today', 'week', 'month', 'quarter', 'year'];
  $('page').innerHTML = '<div class="card" style="padding:12px 14px 6px"><h2 style="margin:0 0 8px">📊 ' + bi('리포트', 'Reports') + ' — ' + esc(ptxt) + '</h2>' +
    '<div class="chips" style="margin:0 0 8px">' + PERIODS.filter(c => MAIN.includes(c[0])).map(c => '<button class="' + (R.p === c[0] ? 'on' : '') + '" data-rp="' + c[0] + '">' + c[1] + ' <span class="en">' + c[2] + '</span></button>').join('') + '<button class="' + (MAIN.includes(R.p) ? '' : 'on') + '" id="rCal">📅 ' + bi('날짜 선택', 'Pick dates') + '</button></div>' +
    '<div class="two" style="margin:0 0 8px;grid-template-columns:auto 1fr auto;align-items:center;gap:6px"><button class="b-ghost b-sm" id="rPrev">◀</button><div style="text-align:center;font-weight:800">' + esc(ptxt) + '</div><button class="b-ghost b-sm" id="rNext">▶</button></div></div>' +
    '<div class="card">' + itabs([['item', '🏷', '아이템별', 'By item'], ['cust', '🏬', '손님별', 'By customer'], ['sm', '👤', '세일즈맨별', 'By salesman']], R.tab, 'rt') +
    '<div class="two">' + sel('rSm', [['', '세일즈맨 전체 · All']].concat(S.sms.map(s => [s.code, s.code])), R.sm) + '<input id="rQ" placeholder="찾기 · search" value="' + esc(R.q) + '" autocomplete="off"></div>' +
    '<div id="rBody"><div class="load">읽는 중…</div></div></div>';
  document.querySelectorAll('[data-rp]').forEach(b => b.onclick = () => { R.p = b.dataset.rp; D = null; page(); });
  document.querySelectorAll('[data-rt]').forEach(b => b.onclick = () => { R.tab = b.dataset.rt; paint(); });
  $('rSm').onchange = () => { R.sm = $('rSm').value; paint(); };
  $('rQ').oninput = debounce(() => { R.q = $('rQ').value.trim(); paint(); }, 300);
  const shift = dir => { if (R.p === 'month' || R.p === 'lastm' || (R.p === 'custom' && from.endsWith('-01') && to === monthEnd(from))) { const f = addMonths(from, dir); R.from = f; R.to = monthEnd(f); } else { R.from = addDays(from, dir * days); R.to = addDays(to, dir * days); } R.p = 'custom'; D = null; page(); };
  $('rPrev').onclick = () => shift(-1); $('rNext').onclick = () => shift(1);
  $('rCal').onclick = async () => { const r = await pickDates({ from, to, quick: quickRanges() }); if (!r) return; R.p = 'custom'; R.from = r[0]; R.to = r[1]; D = null; page(); };
  await load(from, to);
  paint();
}
async function load(from, to) {
  if (D && D.from === from && D.to === to) return;
  try { await loadCatalog(S); } catch (e) {}
  const [inv, ents, cods] = await Promise.all([
    invoicesBetween(S, from, to),
    S.DB.list('entries', { where: [['d', '>=', from], ['d', '<=', to]] }).catch(() => []),
    S.DB.list('cod', { where: [['d', '>=', from], ['d', '<=', to]] }).catch(() => [])]);
  D = { from, to, inv: inv.filter(x => x.st !== 'x'), pays: ents.filter(e => !e.void && !e.repl).map(e => ({ d: e.d, sm: e.sm, acct: e.acct, store: e.store, amt: e.total })).concat(cods.filter(c => !c.void).map(c => ({ d: c.d, sm: c.sm, acct: c.acct, store: c.store, amt: c.amt }))) };
}
function rowsFor() {
  const types = invTypes(S), isJ = t => { const x = types.find(z => z.c === t); return x ? (x.comm === 'A' || x.comm === 'W') : t !== 'P'; };
  let inv = D.inv, pays = D.pays;
  if (R.sm) { inv = inv.filter(x => x.sm === R.sm); pays = pays.filter(p => p.sm === R.sm); }
  const C = catalog();
  if (R.tab === 'item') {
    const m = {};
    inv.forEach(x => (x.lines || []).forEach(l => { const k = l.c; const r = m[k] = m[k] || { code: l.c, desc: l.d, grp: l.g || (C && C.byCode[l.c] ? (C.byCode[l.c].l1 || C.byCode[l.c].g) : ''), qty: 0, amt: 0, list: 0, n: 0, custs: {} }; r.qty += l.q; r.amt = R2(r.amt + lineTotal(l.q, l.p, x.disc)); r.list = R2(r.list + l.q * (l.lp != null ? l.lp : l.p)); r.n++; r.custs[x.acct || x.store] = 1; }));
    let rows = Object.values(m).map(r => Object.assign(r, { nc: Object.keys(r.custs).length }));
    if (R.q) rows = rows.filter(r => hasWords(r.code + ' ' + r.desc + ' ' + r.grp, R.q));
    rows = sortBy(rows, r => R.sort === 'qty' ? r.qty : R.sort === 'code' ? r.code : r.amt, R.sort !== 'code');
    return { rows, cols: [['code', '코드 Code'], ['desc', '이름 Description'], ['grp', '분류 Line'], ['qty', '수량 Qty', 'r'], ['amt', '매출 Sales', 'r$'], ['n', '인보이스 Inv', 'r'], ['nc', '손님 Cust', 'r']], tot: { qty: rows.reduce((a, r) => a + r.qty, 0), amt: sum(rows, r => r.amt), n: inv.length } };
  }
  if (R.tab === 'cust') {
    const m = {};
    inv.forEach(x => { const k = x.acct || x.store; const r = m[k] = m[k] || { acct: x.acct || '', store: x.store, sm: x.sm, n: 0, qty: 0, amt: 0, bal: 0, paid: 0, last: '' }; r.n++; r.qty += x.qty || 0; r.amt = R2(r.amt + (x.total || 0)); r.bal = R2(r.bal + (x.bal != null ? x.bal : x.total || 0)); if (x.d > r.last) r.last = x.d; });
    pays.forEach(p => { const k = p.acct || p.store; const r = m[k] = m[k] || { acct: p.acct || '', store: p.store, sm: p.sm, n: 0, qty: 0, amt: 0, bal: 0, paid: 0, last: '' }; r.paid = R2(r.paid + (p.amt || 0)); });
    let rows = Object.values(m);
    if (R.q) rows = rows.filter(r => hasWords(r.store + ' ' + r.acct + ' ' + r.sm, R.q));
    rows = sortBy(rows, r => R.sort === 'paid' ? r.paid : R.sort === 'store' ? r.store : r.amt, R.sort !== 'store');
    return { rows, cols: [['store', '가게 Customer'], ['acct', '계정 Acct'], ['sm', '담당 Rep'], ['n', '인보이스 Inv', 'r'], ['qty', '수량 Qty', 'r'], ['amt', '매출 Sales', 'r$'], ['paid', '수금 Paid', 'r$'], ['bal', '미결 Open', 'r$'], ['last', '마지막 Last']], tot: { amt: sum(rows, r => r.amt), paid: sum(rows, r => r.paid), bal: sum(rows, r => r.bal), n: inv.length } };
  }
  const m = {};
  inv.forEach(x => { const r = m[x.sm || '—'] = m[x.sm || '—'] || { sm: x.sm || '—', n: 0, custs: {}, qty: 0, jew: 0, oth: 0, amt: 0, paid: 0 }; r.n++; r.custs[x.acct || x.store] = 1; r.qty += x.qty || 0; r.amt = R2(r.amt + (x.total || 0)); if (isJ(x.t)) r.jew = R2(r.jew + (x.total || 0)); else r.oth = R2(r.oth + (x.total || 0)); });
  pays.forEach(p => { const r = m[p.sm || '—'] = m[p.sm || '—'] || { sm: p.sm || '—', n: 0, custs: {}, qty: 0, jew: 0, oth: 0, amt: 0, paid: 0 }; r.paid = R2(r.paid + (p.amt || 0)); });
  let rows = sortBy(Object.values(m).map(r => Object.assign(r, { nc: Object.keys(r.custs).length, avg: r.n ? R2(r.amt / r.n) : 0 })), r => r.amt, true);
  if (R.q) rows = rows.filter(r => hasWords(r.sm, R.q));
  return { rows, cols: [['sm', '세일즈맨 Salesman'], ['n', '인보이스 Inv', 'r'], ['nc', '손님 Cust', 'r'], ['qty', '수량 Qty', 'r'], ['jew', '주얼리 Jewelry', 'r$'], ['oth', '그 외 Other', 'r$'], ['amt', '매출 Sales', 'r$'], ['avg', '평균 Avg/inv', 'r$'], ['paid', '수금 Paid', 'r$']], tot: { amt: sum(rows, r => r.amt), paid: sum(rows, r => r.paid), jew: sum(rows, r => r.jew), oth: sum(rows, r => r.oth), n: inv.length } };
}
function fmt(v, c) { if (c[2] === 'r$') return money(v || 0); if (c[2] === 'r') return (v || 0).toLocaleString(); return c[0] === 'last' ? (v ? md(v) : '') : esc(c[0] === 'grp' ? cleanName(v) : String(v == null ? '' : v)); }
function paint() {
  const el = $('rBody'); if (!el || !D) return;
  const { rows, cols, tot } = rowsFor();
  const sorts = R.tab === 'item' ? [['amt', '매출순'], ['qty', '수량순'], ['code', '코드순']] : R.tab === 'cust' ? [['amt', '매출순'], ['paid', '수금순'], ['store', '이름순']] : [['amt', '매출순']];
  el.innerHTML = '<div class="kpi" style="margin-top:10px"><div><b>' + money(tot.amt) + '</b><span>매출 Sales</span></div><div><b>' + tot.n + '</b><span>인보이스 Invoices</span></div><div><b>' + rows.length.toLocaleString() + '</b><span>' + (R.tab === 'item' ? '아이템 Items' : R.tab === 'cust' ? '손님 Customers' : '세일즈맨 Reps') + '</span></div><div><b>' + (tot.paid != null ? money(tot.paid) : (tot.qty || 0).toLocaleString()) + '</b><span>' + (tot.paid != null ? '수금 Paid' : '수량 Qty') + '</span></div></div>' +
    '<div class="chips" style="margin:8px 0">' + sorts.map(s => '<button class="' + (R.sort === s[0] ? 'on' : '') + '" data-rs="' + s[0] + '">' + s[1] + '</button>').join('') + '<button id="rCsv">⬇️ CSV</button><button id="rPrint">🖨 ' + bi('인쇄', 'Print') + '</button></div>' +
    '<div style="overflow:auto"><table style="font-size:12.5px;white-space:nowrap"><tr>' + cols.map(c => '<th class="' + (c[2] ? 'r' : '') + '">' + c[1] + '</th>').join('') + '</tr>' + rows.slice(0, 400).map(r => '<tr>' + cols.map(c => '<td class="' + (c[2] ? 'r' : '') + '"' + (c[0] === 'desc' || c[0] === 'store' ? ' style="white-space:normal;min-width:140px"' : '') + '>' + fmt(r[c[0]], c) + '</td>').join('') + '</tr>').join('') + '</table></div>' + (rows.length > 400 ? '<div class="hint">400줄까지만 표시 — 전체는 CSV</div>' : '') + (!rows.length ? '<div class="none">이 기간에 자료가 없습니다</div>' : '');
  document.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { R.sort = b.dataset.rs; paint(); });
  $('rCsv').onclick = () => { const csv = [cols.map(c => c[1])].concat(rows.map(r => cols.map(c => r[c[0]] == null ? '' : r[c[0]]))).map(a => a.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n'); const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'report-' + R.tab + '-' + D.from + '_' + D.to + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  $('rPrint').onclick = () => { const co = company(S); printOpen('<div class="iv" style="min-height:0">' + docHead(co, 'SALES REPORT', [['Period', md(D.from) + ' ~ ' + md(D.to)], ['By', R.tab === 'item' ? 'Item' : R.tab === 'cust' ? 'Customer' : 'Salesman']]) + (R.sm ? '<div class="meta">Salesman: <b>' + esc(R.sm) + '</b></div>' : '') + '<table class="ivlines"><thead><tr>' + cols.map(c => '<th class="' + (c[2] ? 'r' : '') + '">' + c[1] + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + cols.map(c => '<td class="' + (c[2] ? 'r' : '') + '">' + fmt(r[c[0]], c) + '</td>').join('') + '</tr>').join('') + '<tr class="ivT"><td colspan="' + (cols.length - 1) + '" class="r">TOTAL — ' + tot.n + ' invoices</td><td class="r">' + money(tot.amt) + '</td></tr></tbody></table><div class="ivpg">printed ' + esc(new Date().toLocaleString('en-US')) + '</div></div>'); };
}
