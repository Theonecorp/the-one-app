/* ============================================================
 *  거래처 한눈에 — SBMGo 의 "Invoices and Payment" 창
 *    미수금(AR) · 에이징 · 지난 주문 · 수금 기록, 그리고 아이템별 "이 가게가 최근에 산 기록"
 *  세일즈맨은 자기 가게(자기 sm 의 AR · 수금)만, 담당자는 가게 담당 세일즈맨 기준으로 봅니다
 * ============================================================ */
import { $, esc, money, R2, num, md, toast, openModal, closeModal, sortBy, daysBetween, today, bi, bt, printOpen } from './ui.js';
import { company, docHead, termDays } from './invoicing.js';
import { recentYms, stTag } from './orders.js';
import * as Notes from './notes.js';
import { shipmentsOf, shipmentsHtml, bindShipments, openStore } from './track.js';

let S = null;
export function register(state) { S = state; Notes.register(state); }
const CACHE = {};   // acct → { at, ar, orders, pays, hist }
const BK = ['기한 전 Current', '1-30', '31-60', '61-90', '90+'];
const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');

/** 가게 자료 읽기 (10분 보관) — 인터넷이 없으면 Firestore 오프라인 사본에서 */
export async function storeInfo(acct, force) {
  const c = CACHE[acct]; if (c && !force && Date.now() - c.at < 600000) return c;
  const a = S.accounts.byCode ? S.accounts.byCode[acct] : null;
  const sm = isStaff() ? String((a && a.sm) || mySm() || '').toUpperCase() : mySm();
  const out = { at: Date.now(), acct, sm, ar: null, invs: [], bk: [0, 0, 0, 0, 0], bal: 0, asOf: '', orders: [], pays: [], hist: {}, invHist: [], err: '' };
  const wh = [['acct', '==', acct]]; if (!isStaff()) wh.push(['sm', '==', mySm()]);
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
        pays.forEach(e => { if (e.void || e.repl || e.d <= out.asOf) return; (e.invs || []).forEach(v => { const k = v.no; paid[k] = R2((paid[k] || 0) + num(v.amt)); }); });
        out.invs = (st.invs || []).map(v => { const p = paid[v.inv] || 0; return { no: v.inv, d: v.d, amt: v.amt, paid: p, bal: R2(v.bal - p), pdd: v.pdd || 0, bk: v.bk || 0 }; }).sort((x, y) => x.d < y.d ? 1 : -1);
        out.invs.forEach(v => { out.bal += v.bal; if (v.bal > 0.005) out.bk[Math.max(0, Math.min(4, v.bk))] += v.bal; });
        out.bal = R2(out.bal); out.bk = out.bk.map(R2);
      }
    }
    /* 앱에서 확정한 인보이스 — AR 에 아직 없는 것은 미결 목록에 더함 */
    try {
      const app = await S.DB.list('invoices', { where: wh.concat([['st', '==', 'open']]) });
      const have = {}; out.invs.forEach(v => { have[v.no] = 1; });
      const paidApp = {}; pays.forEach(e => { if (e.void || e.repl) return; (e.invs || []).forEach(v => { paidApp[v.no] = R2((paidApp[v.no] || 0) + num(v.amt)); }); });
      app.forEach(x => { if (have[x.no] || x.src === 'legacy') return;   // 이전 시스템 인보이스의 잔액은 AR 이 기준 (AR 에 없으면 받은 것)
      const p = paidApp[x.no] || 0, bal = R2((x.bal != null ? x.bal : x.total) - p), pdd = Math.max(0, daysBetween(x.d, today()) - 30), bk = pdd <= 0 ? 0 : pdd <= 30 ? 1 : pdd <= 60 ? 2 : pdd <= 90 ? 3 : 4; out.invs.push({ no: x.no, d: x.d, amt: x.total, paid: p, bal, pdd, bk, app: true }); if (bal > 0.005) { out.bal = R2(out.bal + bal); out.bk[bk] = R2(out.bk[bk] + bal); } });
      out.invs.sort((x, y) => x.d < y.d ? 1 : -1);
    } catch (e) {}
    /* 인보이스 기록 — 이전 시스템에서 가져온 것 + 앱 발행, 최근 60장 (받은 것 포함) */
    try { const allInv = await S.DB.list('invoices', { where: wh }); out.invHist = sortBy(allInv.filter(x => x.st !== 'x'), x => x.d + x.no, true).slice(0, 60); out.invHistN = allInv.length; out.invHistAmt = R2(allInv.filter(x => x.st !== 'x' && x.d >= today().substring(0, 4) + '-01-01').reduce((a, x) => a + (x.total || 0), 0)); } catch (e) {}
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
      live.concat(credits).map(v => '<div class="pr"' + (v.bk >= 3 ? ' style="background:#fef2f2;border-radius:10px;padding-left:8px;padding-right:8px"' : '') + '><span class="tb" style="flex:0 0 34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;background:' + (v.bal < 0 ? '#15803d' : v.bk >= 3 ? '#b91c1c' : v.bk >= 1 ? '#b45309' : '#64748b') + '">' + esc(String(v.no).charAt(0)) + '</span><div class="ct"><b>' + esc(v.no) + (v.app ? ' <span class="tag t-b">앱</span>' : '') + '</b><small>' + esc(md(v.d)) + (v.pdd > 0 ? ' · ' + v.pdd + '일 지남 overdue' : ' · 기한 전') + ' · ' + money(v.amt) + '</small></div><div class="pa"><b>' + money(v.bal) + '</b><small>' + (v.bal < 0 ? '크레딧' : '잔액 due') + '</small></div></div>').join('') : '<div class="none">미결 인보이스 없음 · No open invoices' + (info.asOf ? '' : ' (AR 아직 안 올라옴 · AR not uploaded yet)') + '</div>';
    else if (tab === 'invh') body = (info.invHist && info.invHist.length) ? '<div class="muted" style="margin:4px 0 6px">올해 매출 <b>' + money(info.invHistAmt || 0) + '</b> · 전체 ' + (info.invHistN || 0) + '장 (최근 60장 표시)</div>' + info.invHist.map(x => '<div class="pr tap" data-si="' + esc(x.no) + '"><div class="ct"><b>' + esc(x.no) + ' <span class="tag t-g">' + esc(x.t || '') + '</span>' + (x.src === 'legacy' ? '' : ' <span class="tag t-b">앱</span>') + '</b><small>' + esc(md(x.d)) + (x.sm ? ' · ' + esc(x.sm) : '') + (x.terms ? ' · ' + esc(x.terms) : '') + (x.order ? ' · ' + esc(x.order) : '') + '</small></div><div class="pa"><b>' + money(x.total) + '</b><small>' + ((x.bal || 0) > 0.005 ? '<span class="warn">미결 ' + money(x.bal) + '</span>' : '완납 · paid') + '</small></div></div>').join('') : '<div class="none">인보이스 기록 없음 · No invoices</div>';
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
      '<div class="seg" style="flex-wrap:wrap">' + [['inv', bi('미결', 'Open') + ' ' + live.length], ['invh', bi('인보이스', 'Invoices') + ' ' + (info.invHistN || 0)], ['ord', bi('주문', 'Orders') + ' ' + info.orders.length], ['pay', bi('수금', 'Payments') + ' ' + info.pays.length], ['ship', '🚚 ' + bi('배송', 'Shipments') + ' ' + ships.length], ['note', '📝 ' + bi('노트', 'Notes') + ' ' + notes.length]].map(t => '<button class="' + (tab === t[0] ? 'on' : '') + '" data-ss="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div style="max-height:45vh;overflow:auto">' + body + '</div>' +
      '<div class="btns"><button class="b-ghost" id="ssStmt">🖨 ' + bi('손님용 스테이트먼트', 'Customer statement') + '</button>' + (onPick ? '<button class="b-blue" id="ssPick">' + bi('이 가게로 주문', 'Order for this store') + '</button>' : '') + '</div>';
    $('ssX').onclick = closeModal;
    $('ssStmt').onclick = () => printOpen(statementHtml(acct, info));
    document.querySelectorAll('[data-ss]').forEach(b => b.onclick = () => { tab = b.dataset.ss; paint(); });
    document.querySelectorAll('[data-so]').forEach(el => el.onclick = () => { closeModal(); location.hash = '#/order/' + encodeURIComponent(el.dataset.so); });
    document.querySelectorAll('[data-si]').forEach(el => el.onclick = () => { closeModal(); location.hash = '#/order/inv:' + encodeURIComponent(el.dataset.si); });
    if ($('ssPick')) $('ssPick').onclick = () => { closeModal(); onPick(acct); };
    const back = L => { notes = L; tab = 'note'; openModal(''); paint(); };
    if ($('ssNoteAdd')) $('ssNoteAdd').onclick = () => Notes.noteForm(acct, null, back);
    Notes.bindNoteEdits($('mbox'), acct, notes, back);
    if (tab === 'ship') bindShipments($('mbox'), ships);
    if ($('ssTrk')) $('ssTrk').onclick = () => { closeModal(); openStore(acct); };
  };
  if (opt0 === 'note' || opt0 === 'ship') tab = opt0;
  paint();
  return info;
}
