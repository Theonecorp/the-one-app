/* ============================================================
 *  거래처 한눈에 — SBMGo 의 "Invoices and Payment" 창
 *    미수금(AR) · 에이징 · 지난 주문 · 수금 기록, 그리고 아이템별 "이 가게가 최근에 산 기록"
 *  세일즈맨은 자기 가게(자기 sm 의 AR · 수금)만, 담당자는 가게 담당 세일즈맨 기준으로 봅니다
 * ============================================================ */
import { $, esc, money, R2, num, md, toast, busy, openModal, closeModal, confirmBox, sortBy, daysBetween, today, bi, bt, printOpen, sortInv, invNo, sel } from './ui.js';
import { company, docHead, termDays, getInvoice, dropInvCache, rebuildSalesM } from './invoicing.js';
import { searchAccounts } from './accounts.js';
import { can } from './main.js';
import { recentYms, stTag } from './orders.js';
import * as Notes from './notes.js';
import { shipmentsOf, shipmentsHtml, bindShipments, openStore } from './track.js';
import { acctAccess, requestAccess, untilTxt } from './access.js';

let S = null;
export function register(state) { S = state; Notes.register(state); }
const CACHE = {};   // acct → { at, ar, orders, pays, hist }
export function dropStoreCache(acct) { if (acct) delete CACHE[acct]; else Object.keys(CACHE).forEach(k => { delete CACHE[k]; }); }   // 인보이스 · 수금을 새로 넣은 뒤
const BK = ['기한 전 Current', '1-30', '31-60', '61-90', '90+'];
const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');

/** 가게 자료 읽기 (10분 보관) — 인터넷이 없으면 Firestore 오프라인 사본에서 */
export async function storeInfo(acct, force) {
  const c = CACHE[acct];
  if (c && !force && Date.now() - c.at < 600000) { if (!(c.access && c.access.k === 'none') || (await acctAccess(acct)).k === 'none') return c; }   // 그사이 허락을 받았으면 새로 읽음
  const a = S.accounts.byCode ? S.accounts.byCode[acct] : null;
  const sm = isStaff() ? String((a && a.sm) || mySm() || '').toUpperCase() : mySm();
  const out = { at: Date.now(), acct, sm, ar: null, invs: [], bk: [0, 0, 0, 0, 0], bal: 0, asOf: '', orders: [], pays: [], hist: {}, invHist: [], err: '' };
  const wh = [['acct', '==', acct]]; if (!isStaff()) wh.push(['sm', '==', mySm()]);
  /* 인보이스는 가게 기준 — 내 담당 가게 · 관리자가 허락한 가게는 다른 세일즈맨이 발행한 것까지 전부 (firestore.rules ownAcct · granted) */
  const acc = await acctAccess(acct); out.access = acc;
  const whInv = acc.k === 'none' ? wh : [['acct', '==', acct]];
  try {
    const [arDoc, orders, pays] = await Promise.all([
      sm ? S.DB.get('ar', sm).catch(() => null) : null,
      S.DB.list('orders', { where: wh }).catch(() => []),
      S.DB.list('entries', { where: wh.concat([['ym', 'in', recentYms(6)]]) }).catch(() => [])
    ]);
    /* AR — 기준일 이후 내가 받은 돈을 빼서 지금 잔액으로 */
    let st = arDoc && arDoc.stores ? arDoc.stores.find(s => s.acct === acct) : null;
    let arUse = arDoc;
    /* 담당자: 거래처의 담당 세일즈맨과 AR 의 세일즈맨이 다르면 다른 AR 문서도 찾아봄 */
    if (!st && isStaff()) { try { const all = await S.DB.list('ar'); for (const d of all) { const x = (d.stores || []).find(s => s.acct === acct); if (x) { st = x; arUse = d; out.sm = d.id; break; } } } catch (e) {} }
    if (arUse && arUse.stores) {
      out.asOf = arUse.asOf || '';
      if (st) {
        const paid = {};
        pays.forEach(e => { if (e.void || e.repl || e.bounced || e.d <= out.asOf) return; (e.invs || []).forEach(v => { const k = v.no; paid[k] = R2((paid[k] || 0) + num(v.amt)); }); });
        out.invs = (st.invs || []).map(v => { const p = paid[v.inv] || 0; return { no: v.inv, d: v.d, amt: v.amt, paid: p, bal: R2(v.bal - p), pdd: v.pdd || 0, bk: v.bk || 0 }; }).sort((x, y) => x.d < y.d ? 1 : -1);
        out.invs.forEach(v => { out.bal += v.bal; if (v.bal > 0.005) out.bk[Math.max(0, Math.min(4, v.bk))] += v.bal; });
        out.bal = R2(out.bal); out.bk = out.bk.map(R2);
      }
    }
    /* 앱에서 확정한 인보이스 — AR 에 아직 없는 것은 미결 목록에 더함 */
    try {
      const app = await S.DB.list('invoices', { where: whInv.concat([['st', '==', 'open']]) });
      const have = {}; out.invs.forEach(v => { have[v.no] = 1; });
      const paidApp = {}; pays.forEach(e => { if (e.void || e.repl || e.bounced) return; (e.invs || []).forEach(v => { paidApp[v.no] = R2((paidApp[v.no] || 0) + num(v.amt)); }); });
      app.forEach(x => { if (have[x.no] || x.src === 'legacy') return;   // 이전 시스템 인보이스의 잔액은 AR 이 기준 (AR 에 없으면 받은 것)
      const pays0 = x.pays || {}, p = pays.filter(e => !e.void && !e.repl && !e.bounced && !(e.id in pays0)).reduce((a, e) => a + (e.invs || []).filter(v => v.no === x.no).reduce((b, v) => b + num(v.amt), 0), 0), bal = R2((x.bal != null ? x.bal : x.total) - p) /* bal 에는 확인된 수금이 이미 빠짐 → 확인 전 수금만 */, pdd = Math.max(0, daysBetween(x.d, today()) - 30), bk = pdd <= 0 ? 0 : pdd <= 30 ? 1 : pdd <= 60 ? 2 : pdd <= 90 ? 3 : 4; out.invs.push({ hold: x.hold || '',  no: x.no, d: x.d, amt: x.total, paid: p, bal, pdd, bk, app: true }); if (bal > 0.005) { out.bal = R2(out.bal + bal); out.bk[bk] = R2(out.bk[bk] + bal); } });
      out.invs.sort((x, y) => x.d < y.d ? 1 : -1);
    } catch (e) {}
    /* 인보이스 기록 — 이전 시스템에서 가져온 것 + 앱 발행, 최근 60장 (받은 것 포함) */
    try { let allInv = await S.DB.list('invoices', { where: whInv });
      /* 계정코드로 하나도 없으면 — 이전 시스템 인보이스가 다른 코드 모양으로 들어왔을 수 있으니 가게 이름으로도 (담당자만: 세일즈맨 규칙은 가게 코드 기준) */
      if (!allInv.length && isStaff() && a && a.store) { try { const byName = await S.DB.list('invoices', { where: [['store', '==', a.store]] }); if (byName.length) { allInv = byName; out.invByName = true; } } catch (e) {} }
      out.invHist = sortBy(allInv.filter(x => x.st !== 'x'), x => x.d + x.no, true).slice(0, 60); out.invHistN = allInv.length; out.invHistAmt = R2(allInv.filter(x => x.st !== 'x' && x.d >= today().substring(0, 4) + '-01-01').reduce((a, x) => a + (x.total || 0), 0)); } catch (e) {}
    out.orders = sortBy(orders.filter(o => o.st !== 'x'), o => o.d + (o.createdAt || ''), true).slice(0, 30);
    out.pays = sortBy(pays.filter(e => !e.void), e => e.d + (e.createdAt || ''), true).slice(0, 30);
    /* 아이템별 최근 구매 — 최근 주문 8건의 줄을 읽음 (인보이스 확정된 것 우선) */
    const recent = out.orders.filter(o => o.st === 'done' || o.st === 'pick' || o.st === 'ok' || o.st === 'sent').slice(0, 8);
    const Ls = await Promise.all(recent.map(o => S.DB.get('orderLines', o.id).catch(() => null)));
    Ls.forEach((L, i) => { if (!L || !L.lines) return; const d = recent[i].d; L.lines.forEach(l => { const q = l.pq != null && recent[i].st === 'done' ? l.pq : l.q; if (!q) return; (out.hist[l.c] = out.hist[l.c] || []).push([d, q, l.p]); }); });
  } catch (e) { out.err = String(e.code || e.message); }
  CACHE[acct] = out;
  return out;
}
/* ============================================================
 *  손님용 스테이트먼트 — 미결 인보이스 · 크레딧 · 에이징 · 최근 입금 · 총 미수 (세일즈맨 · 담당자 모두 인쇄 가능)
 * ============================================================ */
const n2 = v => { v = Number(v) || 0; const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (v < 0 ? '-' : '') + s; };
const fD = d => { d = String(d || ''); return d.length >= 10 ? d.substring(5, 7) + '/' + d.substring(8, 10) + '/' + d.substring(2, 4) : d; };
export function statementHtml(acct, info) {
  const a = S.accounts.byCode ? S.accounts.byCode[acct] : null, co = company(S), t = today();
  const open = info.invs.filter(v => Math.abs(v.bal) > 0.005).slice().sort((x, y) => x.d < y.d ? -1 : 1);
  const terms = (a && a.terms) || 'N30', td = termDays(terms);
  const addr = a ? [a.addr, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')].filter(Boolean) : [];
  const pays = (info.pays || []).slice(0, 12);
  return '<div class="iv">' + docHead(co, 'STATEMENT', [['Date', fD(t)], ['Acct. No.', acct]]) +
    '<div class="ivparties"><div class="ivp"><b>TO :</b><div>' + esc(a ? a.store : acct) + '</div>' + addr.map(x => '<div>' + esc(x) + '</div>').join('') + (a && a.tel ? '<div>Phone : ' + esc(a.tel) + '</div>' : '') + '</div>' +
    '<div class="ivp" style="text-align:right"><b>Terms :</b> ' + esc(terms) + '<br><b>Rep. :</b> ' + esc(info.sm || (a && a.sm) || '') + (info.asOf ? '<br><span style="font-size:10px;color:#555">Balances as of ' + esc(fD(info.asOf)) + ' plus payments received since</span>' : '') + '</div></div>' +
    '<table class="ivlines"><thead><tr><th>Date</th><th>Invoice</th><th>Due</th><th class="r">Amount</th><th class="r">Paid</th><th class="r">Balance</th><th class="r">Days past due</th></tr></thead><tbody>' +
    (open.length ? open.map(v => { const due = v.d ? new Date(new Date(v.d + 'T12:00:00').getTime() + td * 86400000) : null, dueS = due ? due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0') : ''; const pdd = v.pdd || (dueS ? Math.max(0, daysBetween(dueS, t)) : 0);
      return '<tr' + (v.bal < 0 ? ' style="color:#15803d"' : pdd > 60 ? ' style="font-weight:700"' : '') + '><td>' + esc(fD(v.d)) + '</td><td><b>' + esc(v.no) + '</b></td><td>' + esc(fD(dueS)) + '</td><td class="r">' + n2(v.amt) + '</td><td class="r">' + n2(v.paid || 0) + '</td><td class="r">' + n2(v.bal) + '</td><td class="r">' + (v.bal < 0 ? 'CREDIT' : pdd > 0 ? pdd : '') + '</td></tr>'; }).join('') : '<tr><td colspan="7" style="text-align:center;padding:14px">No open balance — thank you!</td></tr>') +
    '</tbody></table>' +
    '<div class="ivar"><div class="ivart">Aging Summary</div><table><tr><th>Current</th><th>1-30</th><th>31-60</th><th>61-90</th><th>Over 90</th><th>Total Due</th></tr><tr>' + info.bk.map(v => '<td>' + n2(v) + '</td>').join('') + '<td><b>' + n2(info.bal) + '</b></td></tr></table></div>' +
    (pays.length ? '<div style="margin-top:12px"><div class="ivart">Recent payments received</div><table class="ivlines"><thead><tr><th>Date</th><th>Method</th><th>Applied to</th><th class="r">Amount</th></tr></thead><tbody>' + pays.map(e => '<tr><td>' + esc(fD(e.d)) + '</td><td>' + esc((e.pays || []).map(p => p.m === 'CHECK' ? 'Check #' + p.ref : p.m).join(', ') || e.method || '') + '</td><td>' + esc((e.invs || []).map(v => v.no).filter(Boolean).join(', ')) + '</td><td class="r">' + n2(e.total != null ? e.total : e.amt) + '</td></tr>').join('') + '</tbody></table></div>' : '') +
    '<div class="ivfoot" style="margin-top:14px"><div class="ivthx">Please remit payment to:<br><b>' + esc(co.name) + '</b><br>' + esc(co.addr1) + '<br>' + esc(co.addr2) + '<br>Phone. ' + esc(co.tel) + '<br><br>' + esc(co.thanks || '') + '</div><table class="ivtot"><tr><td>Open invoices</td><td class="r">' + open.filter(v => v.bal > 0).length + '</td></tr><tr><td>Credits</td><td class="r">' + n2(open.filter(v => v.bal < 0).reduce((s, v) => s + v.bal, 0)) + '</td></tr><tr class="ivT"><td>TOTAL DUE</td><td class="r">' + n2(info.bal) + '</td></tr></table></div>' +
    '<div class="ivpg">Statement · ' + esc(acct) + ' · printed ' + esc(new Date().toLocaleString('en-US')) + '</div></div>';
}
/** "10/07(3) 07/28(3)" — 최근 3번 */
export function histText(info, code) { const h = info && info.hist[code]; if (!h || !h.length) return ''; return h.slice(0, 3).map(x => md(x[0]) + '(' + x[1] + ')').join(' '); }
export function lastPrice(info, code) { const h = info && info.hist[code]; return h && h.length ? h[0][2] : null; }

/** 인보이스 탭 — 인보이스 기록(이전 시스템 + 앱) 과 AR 미결을 번호로 합침. 상태는 AR 이 기준 (AR 에 있으면 미결, 기준일 전 것이 AR 에 없으면 완납) */
function invhHtml(info) {
  const ar = {}; (info.invs || []).forEach(v => { ar[invNo(v.no)] = v; });
  const rows = (info.invHist || []).map(x => ({ x, v: ar[invNo(x.no)] }));
  const have = {}; rows.forEach(r => { have[invNo(r.x.no)] = 1; });
  (info.invs || []).forEach(v => { if (!have[invNo(v.no)]) rows.push({ x: { no: v.no, d: v.d, total: v.amt, t: String(v.no).charAt(0), arOnly: true }, v }); });
  rows.splice(0, rows.length, ...sortInv(rows, r => r.x.no, false));   // 인보이스 번호 순 (종류별)
  if (!rows.length) return '<div class="none">인보이스 기록 없음 · No invoices</div>';
  const st = r => { const x = r.x, v = r.v;
    if (v) return Math.abs(v.bal) > 0.005 ? '<span class="warn">' + (v.bal < 0 ? bt('크레딧', 'Credit') : bt('미결', 'Open')) + ' ' + money(v.bal) + '</span>' : bt('완납', 'Paid');
    if (x.src !== 'legacy' && x.st === 'open') return '<span class="warn">' + bt('미결 (앱)', 'Open (app)') + '</span>';
    if (info.asOf && x.d <= info.asOf) return bt('완납', 'Paid');
    return info.asOf ? bt('AR 기준일 뒤 발행', 'after AR date') : ((x.bal || 0) > 0.005 ? '<span class="warn">' + bt('미결', 'Open') + ' ' + money(x.bal) + '</span>' : bt('완납', 'Paid')); };
  return '<div class="muted" style="margin:4px 0 6px">' + bt('올해 매출', 'This year') + ' <b>' + money(info.invHistAmt || 0) + '</b> · ' + bt('전체', 'All') + ' ' + (info.invHistN || 0) + bt('장', '') + (info.invHistN > 60 ? ' (' + bt('최근 60장', 'latest 60') + ')' : '') + ' · ' + bt('미결 · 완납은 AR 기준', 'open/paid from A/R') + (info.asOf ? ' ' + esc(info.asOf) : '') + '</div>' +
    rows.map(r => { const x = r.x; return '<div class="pr tap" data-si="' + esc(x.no) + '"><div class="ct"><b>' + esc(x.no) + ' <span class="tag t-g">' + esc(x.t || '') + '</span>' + (x.arOnly ? ' <span class="tag t-c">AR</span>' : x.src === 'legacy' ? '' : ' <span class="tag t-b">' + bt('앱', 'App') + '</span>') + '</b><small>' + esc(md(x.d)) + (x.sm ? ' · ' + esc(x.sm) : '') + (x.terms ? ' · ' + esc(x.terms) : '') + (x.order ? ' · ' + esc(x.order) : '') + '</small></div><div class="pa"><b>' + money(x.total) + '</b><small>' + st(r) + '</small></div></div>'; }).join('');
}
/** 📄 인보이스 한 장 — 인보이스(앱 · 이전 시스템) + AR 잔액 + 이 인보이스에 넣은 수금, 한 화면에. back 이 있으면 ‹ 로 돌아감 */
export async function invDetail(no, acct, back) {
  if (!back) openModal('<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>', { wide: true }); else $('mbox').innerHTML = '<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>';
  let x = null, denied = false;
  no = invNo(no);
  try { x = await getInvoice(S, no); } catch (e) { denied = /permission/i.test(String(e.code || e.message)); }
  acct = acct || (x && x.acct) || '';
  if (!acct && !x && !isStaff()) { /* 내 AR 에서 찾기 */ try { const ar = await S.DB.get('ar', mySm()); const st = ar && (ar.stores || []).find(s => (s.invs || []).some(v => invNo(v.inv) === no)); if (st) acct = st.acct; } catch (e) {} }
  if (!acct && !x && isStaff()) { try { for (const d of await S.DB.list('ar')) { const st = (d.stores || []).find(s => (s.invs || []).some(v => invNo(v.inv) === no)); if (st) { acct = st.acct; break; } } } catch (e) {} }
  const a = acct && S.accounts.byCode ? S.accounts.byCode[acct] : null;
  const info = acct ? await storeInfo(acct) : null;
  const v = info ? (info.invs || []).find(z => invNo(z.no) === no) : null;
  const pays = info ? (info.pays || []).filter(e => (e.invs || []).some(y => invNo(y.no) === no)) : [];
  const box = $('mbox'); if (!box) return;
  if (!x && !v) {
    box.innerHTML = '<h2>📄 ' + esc(no) + '</h2>' + (denied || (info && info.access && info.access.k === 'none')
      ? '<div class="alert a-amb">🔒 ' + bt('다른 세일즈맨 담당 인보이스입니다 — 관리자 허락이 있어야 볼 수 있습니다', 'Another salesman\'s invoice — admin approval needed') + '</div><div class="btns"><button class="b-ghost" id="idX">‹</button><button class="b-blue" id="idReq">🔐 ' + bt('조회 요청', 'Request access') + '</button></div>'
      : '<div class="none">' + bt('인보이스를 찾지 못했습니다 — 번호를 확인하세요', 'Invoice not found') + '</div><div class="btns"><button class="b-ghost" id="idX">‹</button></div>');
    $('idX').onclick = () => back ? back() : closeModal();
    if ($('idReq')) $('idReq').onclick = () => requestAccess({ acct, no });
    return;
  }
  const legacy = x && x.src === 'legacy', lines = (x && x.lines) || [];
  const total = x ? x.total : v.amt, d = x ? x.d : v.d;
  const arTxt = v ? (Math.abs(v.bal) < 0.005 ? bt('완납', 'Paid') : money(v.bal)) : info && info.asOf && d <= info.asOf ? bt('완납 (AR 에 없음)', 'Paid (not in A/R)') : x && x.src !== 'legacy' && x.st === 'open' ? money(x.bal != null ? x.bal : x.total) : '—';
  box.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">📄 ' + esc(no) + ' <span class="tag t-g">' + esc((x && x.t) || String(no).charAt(0)) + '</span>' + (legacy ? ' <span class="tag t-c">' + bt('이전 시스템', 'Legacy') + '</span>' : x ? ' <span class="tag t-b">' + bt('앱', 'App') + '</span>' : ' <span class="tag t-c">AR</span>') + (x && x.st === 'x' ? ' <span class="tag t-r">VOID</span>' : '') + '</h2>' +
    '<div class="tap" id="idStore" style="font-size:17px;font-weight:800;margin-top:6px">🏬 ' + esc((a && a.store) || (x && x.store) || acct) + ' <span class="muted" style="font-weight:400">' + esc(acct) + ' ›</span></div>' +
    '<div class="muted">' + esc([x && x.sm, d, x && x.terms, x && x.shipVia, x && x.order ? bt('주문', 'Order') + ' ' + x.order : ''].filter(Boolean).join(' · ')) + '</div></div><button class="b-ghost b-sm" id="idX">' + (back ? '‹' : '✕') + '</button></div>' +
    '<div class="kpi" style="margin-top:10px"><div><b>' + money(total) + '</b><span>' + bt('합계', 'Total') + '</span></div><div><b' + (v && v.bal > 0.005 ? ' style="color:#b91c1c"' : '') + '>' + arTxt + '</b><span>' + bt('지금 잔액', 'Balance now') + '</span></div>' +
    '<div><b>' + (v && v.pdd > 0 ? v.pdd + bt('일', 'd') : '—') + '</b><span>' + bt('지난 날', 'Past due') + '</span></div><div><b>' + pays.length + '</b><span>' + bt('수금', 'Payments') + '</span></div></div>' +
    (info && info.asOf ? '<div class="muted">' + bt('잔액은 AR 기준일', 'Balance from A/R as of') + ' ' + esc(info.asOf) + bt(' + 그 뒤 받은 돈', ' + payments since') + '</div>' : '') +
    (pays.length ? '<div class="sumbox"><b>💵 ' + bt('이 인보이스에 넣은 수금', 'Payments applied') + '</b>' + pays.map(e => { const y = (e.invs || []).find(z => z.no === no); return '<div class="muted">' + esc(e.d) + ' · ' + esc((e.pays || []).map(p => p.m === 'CHECK' ? '#' + p.ref : p.m).join(', ')) + ' · ' + esc(e.sm || '') + ' — <b>' + money(y ? y.amt : 0) + '</b></div>'; }).join('') + '</div>' : '') +
    (lines.length ? '<div style="max-height:40vh;overflow:auto"><table><tr><th>' + bt('코드', 'Code') + '</th><th class="r">' + bt('수량', 'Qty') + '</th><th class="r">' + bt('가격', 'Price') + '</th><th class="r">' + bt('금액', 'Amount') + '</th></tr>' + lines.map(l => '<tr><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d || '') + '</div></td><td class="r">' + l.q + '</td><td class="r">' + money(l.p) + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') + '</table></div>'
      : '<div class="muted" style="margin-top:6px">' + (legacy ? bt('이전 시스템(SmartBee) 인보이스 — 품목 줄은 SmartBee 에 있습니다', 'SmartBee invoice — line items are in SmartBee') : !x ? bt('AR 에만 있는 인보이스 — 인보이스 목록을 올리면 자세히 보입니다', 'Only in A/R — upload the invoice list for details') : '') + '</div>') +
    (!a && acct ? '<div class="alert a-amb">⚠️ ' + bt('거래처 목록에 없는 계정코드입니다', 'This account code is not in the customer list') + ' (' + esc(acct) + ') — ' + bt('✏️ 수정에서 가게를 다시 연결하세요', 'relink the store with ✏️ Edit') + '</div>' : !acct && x ? '<div class="alert a-amb">⚠️ ' + bt('이 인보이스에 가게(계정코드)가 없습니다 — ✏️ 수정에서 연결하세요', 'This invoice has no store — link one with ✏️ Edit') + '</div>' : '') +
    '<div class="btns" style="flex-wrap:wrap"><button class="b-ghost" id="idStore2">🏬 ' + bi('가게 창', 'Store') + '</button>' + (x && lines.length ? '<button class="b-blue" id="idPrint">🖨 ' + bi('인쇄', 'Print') + '</button>' : '') +
    (x && isStaff() && can('void') ? (legacy || !x.orderId ? '<button class="b-ghost" id="idEdit">✏️ ' + bi('수정', 'Edit') + '</button><button class="b-ghost" id="idDel" style="color:#991b1b">🗑 ' + bi('지우기', 'Delete') + '</button>' : '<button class="b-ghost" id="idOrder">📦 ' + bi('주문 열기 (VOID · 다시 발행)', 'Open order (void · reissue)') + '</button>') : '') + '</div>';
  $('idX').onclick = () => back ? back() : closeModal();
  const toStore = () => storeSheet(acct, null, 'invh');
  $('idStore').onclick = toStore; $('idStore2').onclick = toStore;
  if ($('idPrint')) $('idPrint').onclick = async () => { const { printInvoices } = await import('./fulfill.js'); printInvoices([x], a); };
  if ($('idOrder')) $('idOrder').onclick = () => { closeModal(); location.hash = '#/order/' + encodeURIComponent(x.orderId); };
  if ($('idEdit')) $('idEdit').onclick = () => invEditForm(x, () => invDetail(no, '', back));
  if ($('idDel')) $('idDel').onclick = async () => {
    if (!(await confirmBox('🗑 ' + no + ' · ' + (x.store || acct) + ' · ' + money(x.total) + '\n' + bt('이 인보이스를 지울까요? (이전 시스템 인보이스 — 월별 매출 요약도 다시 계산합니다)', 'Delete this invoice? Monthly sales summary is recalculated.'), bt('지우기', 'Delete')))) return;
    busy(true); try { await S.DB.del('invoices', x.id || no); dropInvCache(); dropStoreCache(); try { await rebuildSalesM(S, [x.ym || String(x.d || '').substring(0, 7)]); } catch (e) {} toast('🗑 ' + no, 'good'); closeModal(); if (back) back(); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** ✏️ 인보이스 수정 (담당자 · 이전 시스템 인보이스) — 날짜 · 가게(계정코드) · 세일즈맨 · 합계 · 잔액 · 메모. 앱에서 발행한 인보이스는 VOID → 다시 발행 */
export function invEditForm(x, done) {
  const types = (S.settings && S.settings.invTypes) || [];
  let acct = x.acct || '';
  const pick = () => { const a = S.accounts.byCode ? S.accounts.byCode[acct] : null; return a ? a.store + ' <span class="muted">' + a.acct + (a.sm ? ' · ' + a.sm : '') + '</span>' : (acct ? '<span class="warn">' + esc(acct) + ' — ' + bt('거래처 목록에 없음', 'not in customers') + '</span>' : '<span class="muted">' + bt('가게를 고르세요', 'Pick a store') + '</span>'); };
  openModal('<h2>✏️ ' + esc(x.no) + '</h2>' +
    '<div class="fg"><label>🏬 ' + bt('가게', 'Store') + '</label><div id="ieStore" style="font-weight:800">' + pick() + '</div><input id="ieQ" placeholder="' + esc(bt('가게 이름 · 계정코드로 찾기', 'Search store · acct #')) + '" autocomplete="off" style="margin-top:4px"><div class="hits" id="ieHits" style="display:none"></div></div>' +
    '<div class="two"><div class="fg"><label>' + bt('날짜', 'Date') + '</label><input type="date" id="ieD" value="' + esc(x.d || '') + '"></div><div class="fg"><label>' + bt('세일즈맨', 'Salesman') + '</label>' + sel('ieSm', [['', '—']].concat((S.sms || []).map(s => [s.code, s.code])), x.sm || '') + '</div></div>' +
    '<div class="two"><div class="fg"><label>' + bt('합계', 'Total') + '</label><input type="number" step="0.01" id="ieT" value="' + (x.total != null ? x.total : '') + '"></div><div class="fg"><label>' + bt('잔액 (미수)', 'Balance') + '</label><input type="number" step="0.01" id="ieB" value="' + (x.bal != null ? x.bal : '') + '"></div></div>' +
    '<div class="fg"><label>' + bt('메모', 'Memo') + '</label><input id="ieM" value="' + esc(x.memo || '') + '"></div>' +
    '<div class="btns"><button class="b-ghost" id="ieX">' + bt('취소', 'Cancel') + '</button><button class="b-blue" id="ieOk">💾 ' + bt('저장', 'Save') + '</button></div>');
  $('ieX').onclick = () => { closeModal(); if (done) done(); };
  const q = $('ieQ'), box = $('ieHits');
  q.oninput = () => { const v = q.value.trim(); if (!v) { box.style.display = 'none'; return; } const hits = searchAccounts(S.accounts, v, 8); box.innerHTML = hits.map(h => '<div class="hit" data-iea="' + esc(h.acct) + '"><b>' + esc(h.store) + '</b> <span class="muted">' + esc(h.acct) + ' · ' + esc([h.city, h.state].filter(Boolean).join(', ')) + (h.sm ? ' · ' + esc(h.sm) : '') + '</span></div>').join('') || '<div class="hit muted">' + bt('없음', 'No match') + '</div>'; box.style.display = 'block'; box.querySelectorAll('[data-iea]').forEach(el => el.onclick = () => { acct = el.dataset.iea; const a = S.accounts.byCode[acct]; if (a && a.sm && !$('ieSm').value) $('ieSm').value = String(a.sm).toUpperCase(); $('ieStore').innerHTML = pick(); q.value = ''; box.style.display = 'none'; }); };
  $('ieOk').onclick = async () => {
    const a = S.accounts.byCode ? S.accounts.byCode[acct] : null, d = $('ieD').value, total = R2($('ieT').value), bal = $('ieB').value === '' ? null : R2($('ieB').value);
    if (!d) return toast(bt('날짜를 넣어 주세요', 'Enter the date'), 'bad');
    const patch = { acct, store: a ? a.store : (x.store || ''), sm: $('ieSm').value, d, ym: d.substring(0, 7), total, memo: $('ieM').value.trim(), editAt: new Date().toISOString(), editBy: S.user.email };
    if (bal != null) { patch.bal = bal; patch.st = bal > 0.005 ? 'open' : 'paid'; }
    busy(true);
    try { await S.DB.update('invoices', x.id || x.no, patch); dropInvCache(); dropStoreCache(); try { await rebuildSalesM(S, Array.from(new Set([x.ym, patch.ym].filter(Boolean)))); } catch (e) {} toast('💾 ' + x.no, 'good'); closeModal(); if (done) done(); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}

/** 가게 창 열기 */
export async function storeSheet(acct, onPick, opt0) {
  const a = S.accounts.byCode ? S.accounts.byCode[acct] : null;
  openModal('<h2>' + esc(a ? a.store : acct) + '</h2><div class="load">읽는 중…</div>');
  const [info, notes0, ships] = await Promise.all([storeInfo(acct), Notes.loadNotes(acct), shipmentsOf(acct)]);
  let notes = notes0;
  const live = info.invs.filter(v => v.bal > 0.005), credits = info.invs.filter(v => v.bal < -0.005);
  const stale = info.asOf ? daysBetween(info.asOf, today()) : 0;
  let tab = 'inv';
  const paint = () => {
    let body = '';
    if (tab === 'inv') body = live.length || credits.length ?
      live.concat(credits).map(v => '<div class="pr tap" data-si="' + esc(v.no) + '"' + (v.bk >= 3 ? ' style="background:#fef2f2;border-radius:10px;padding-left:8px;padding-right:8px"' : '') + '><span class="tb" style="flex:0 0 34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;background:' + (v.bal < 0 ? '#15803d' : v.bk >= 3 ? '#b91c1c' : v.bk >= 1 ? '#b45309' : '#64748b') + '">' + esc(String(v.no).charAt(0)) + '</span>' + (v.hold ? '<span class="tag t-r" style="margin-right:6px">↩️ ' + bt('바운스 홀드', 'Bounce hold') + '</span>' : '') + '<div class="ct"><b>' + esc(v.no) + (v.app ? ' <span class="tag t-b">앱</span>' : '') + '</b><small>' + esc(md(v.d)) + (v.pdd > 0 ? ' · ' + v.pdd + '일 지남 overdue' : ' · 기한 전') + ' · ' + money(v.amt) + '</small></div><div class="pa"><b>' + money(v.bal) + '</b><small>' + (v.bal < 0 ? '크레딧' : '잔액 due') + '</small></div></div>').join('') : '<div class="none">미결 인보이스 없음 · No open invoices' + (info.asOf ? '' : ' (AR 아직 안 올라옴 · AR not uploaded yet)') + '</div>';
    else if (tab === 'invh') body = invhHtml(info);
    else if (tab === 'ord') body = info.orders.length ? info.orders.map(o => '<div class="pr tap" data-so="' + esc(o.id) + '"><div class="ct"><b>' + esc(o.no) + ' ' + stTag(o.st) + '</b><small>' + esc(o.d) + ' · ' + esc(o.sm) + (o.invs && o.invs.length ? ' · ' + esc(o.invs.join(', ')) : '') + (o.memo ? ' · ' + esc(o.memo) : '') + '</small></div><div class="pa"><b>' + money(o.amt) + '</b><small>' + (o.n || 0) + '줄 · ' + (o.qty || 0) + '개</small></div></div>').join('') : '<div class="none">앱으로 넣은 주문가 아직 없습니다 · No app orders yet</div>';
    else if (tab === 'ship') body = '<div class="btns" style="margin:4px 0 6px;justify-content:flex-start"><button class="b-ghost b-sm" id="ssTrk">🚚 ' + bi('배송 조회 화면', 'Tracking page') + '</button></div>' + shipmentsHtml(ships.slice().sort((x, y) => String(y.shipDate || '').localeCompare(String(x.shipDate || '')) || (x.box || 0) - (y.box || 0)).slice(0, 80));
    else if (tab === 'note') body = '<button class="b-blue b-sm" id="ssNoteAdd" style="margin:4px 0 8px">📝 ' + bi('노트 남기기', 'Add note') + '</button>' + Notes.notesHtml(notes, { edit: true });
    else body = info.pays.length ? info.pays.map(e => '<div class="pr"><div class="ct"><b>' + esc((e.pays || []).map(p => p.m === 'CHECK' ? '#' + p.ref : p.m).join(', ') || '수금') + '</b><small>' + esc(e.d) + ' · ' + esc(e.sm) + (e.invs && e.invs.length ? ' · ' + esc(e.invs.map(v => v.no).filter(Boolean).join(', ')) : '') + '</small></div><div class="pa"><b>' + money(e.total) + '</b><small>' + (e.settled ? '정산됨' : e.v ? '확인' : e.sb ? '입력' : '') + '</small></div></div>').join('') : '<div class="none">최근 6개월 수금 기록 없음 · No payments in 6 months</div>';
    $('mbox').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><h2 style="margin:0">' + esc(a ? a.store : acct) + '</h2><div class="muted">' + esc(acct) + (a ? ' · ' + esc([a.addr, a.city, a.state].filter(Boolean).join(', ')) + (a.tel ? ' · ' + esc(a.tel) : '') + (a.terms ? ' · ' + esc(a.terms) : '') + (a.sm ? ' · ' + esc(a.sm) : '') : '') + '</div>' + (a && a.note ? '<div class="alert a-blu" style="margin-top:6px">📝 ' + esc(a.note) + '</div>' : '') +
'</div><button class="b-ghost b-sm" id="ssX">✕</button></div>' +
      (a ? '<div class="btns" style="margin-top:6px;justify-content:flex-start;flex-wrap:wrap"><a class="b-ghost b-sm lnk" href="' + esc(Notes.gmapUrl(a)) + '" target="_blank" rel="noopener">🗺 ' + bi('구글 지도', 'Google Maps') + '</a><a class="b-ghost b-sm lnk" href="' + esc(Notes.gmapUrl(a, true)) + '" target="_blank" rel="noopener">🧭 ' + bi('길찾기', 'Directions') + '</a>' + (a.tel ? '<a class="b-ghost b-sm lnk" href="tel:' + esc(String(a.tel).replace(/[^0-9+]/g, '')) + '">📞 ' + bi('전화', 'Call') + '</a>' : '') + '</div>' : '') +
      (tab !== 'note' && notes.some(n => n.pin) ? '<div style="margin-top:6px">' + Notes.notesHtml(notes.filter(n => n.pin), { limit: 3 }) + '</div>' : '') + '' +
      '<div class="kpi" style="grid-template-columns:repeat(5,1fr);margin-top:10px">' + info.bk.map((v, i) => '<div' + (i >= 3 && v > 0.005 ? ' style="background:#fef2f2"' : '') + '><b style="font-size:12px">' + money(v) + '</b><span>' + BK[i] + '</span></div>').join('') + '</div>' +
      '<div class="sumbox" style="display:flex;justify-content:space-between"><span>' + bi('미수금 합계', 'Balance due') + (info.asOf ? ' <span class="muted">기준 as of ' + esc(info.asOf) + (stale > 10 ? ' (' + stale + '일 전)' : '') + '</span>' : '') + '</span><b class="' + (info.bal > 0.005 ? 'warn' : 'ok') + '">' + money(info.bal) + '</b></div>' +
      (info.err ? '<div class="alert a-amb">일부를 읽지 못했습니다 (' + esc(info.err) + ')</div>' : '') +
      (info.access && info.access.k === 'none' ? '<div class="alert a-amb">🔒 ' + bt('다른 세일즈맨 담당 가게입니다', 'Another salesman\'s store') + (info.access.owner ? ' (' + esc(info.access.owner) + ')' : '') + ' — ' + bt('내가 발행한 것만 보입니다', 'only your own invoices show') + ' <button class="b-ghost b-sm" id="ssReq">🔐 ' + bt('전체 조회 요청', 'Request access') + '</button></div>' : '') +
      (info.access && info.access.k === 'grant' ? '<div class="alert a-grn">✅ ' + bt('관리자 허락으로 조회 중', 'Viewing with admin approval') + ' ~' + esc(untilTxt(info.access.until)) + '</div>' : '') +
      '<div class="seg" style="flex-wrap:wrap">' + [['inv', bi('미결', 'Open') + ' ' + live.length], ['invh', bi('인보이스', 'Invoices') + ' ' + (info.invHistN || 0)], ['ord', bi('주문', 'Orders') + ' ' + info.orders.length], ['pay', bi('수금', 'Payments') + ' ' + info.pays.length], ['ship', '🚚 ' + bi('배송', 'Shipments') + ' ' + ships.length], ['note', '📝 ' + bi('노트', 'Notes') + ' ' + notes.length]].map(t => '<button class="' + (tab === t[0] ? 'on' : '') + '" data-ss="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div style="max-height:45vh;overflow:auto">' + body + '</div>' +
      '<div class="btns"><button class="b-ghost" id="ssStmt">🖨 ' + bi('손님용 스테이트먼트', 'Customer statement') + '</button>' + (onPick ? '<button class="b-blue" id="ssPick">' + bi('이 가게로 주문', 'Order for this store') + '</button>' : '') + '</div>';
    $('ssX').onclick = closeModal;
    $('ssStmt').onclick = () => printOpen(statementHtml(acct, info));
    document.querySelectorAll('[data-ss]').forEach(b => b.onclick = () => { tab = b.dataset.ss; paint(); });
    document.querySelectorAll('[data-so]').forEach(el => el.onclick = () => { closeModal(); location.hash = '#/order/' + encodeURIComponent(el.dataset.so); });
    document.querySelectorAll('[data-si]').forEach(el => el.onclick = () => invDetail(el.dataset.si, acct, paint));
    if ($('ssReq')) $('ssReq').onclick = () => requestAccess({ acct });
    if ($('ssPick')) $('ssPick').onclick = () => { closeModal(); onPick(acct); };
    const back = L => { notes = L; tab = 'note'; openModal(''); paint(); };
    if ($('ssNoteAdd')) $('ssNoteAdd').onclick = () => Notes.noteForm(acct, null, back);
    Notes.bindNoteEdits($('mbox'), acct, notes, back);
    if (tab === 'ship') bindShipments($('mbox'), ships);
    if ($('ssTrk')) $('ssTrk').onclick = () => { closeModal(); openStore(acct); };
  };
  if (opt0 === 'note' || opt0 === 'ship' || opt0 === 'invh') tab = opt0;
  paint();
  return info;
}
