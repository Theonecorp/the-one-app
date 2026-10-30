/* ============================================================
 *  거래처 한눈에 — SBMGo 의 "Invoices and Payment" 창
 *    미수금(AR) · 에이징 · 지난 주문 · 수금 기록, 그리고 아이템별 "이 가게가 최근에 산 기록"
 *  세일즈맨은 자기 가게(자기 sm 의 AR · 수금)만, 담당자는 가게 담당 세일즈맨 기준으로 봅니다
 * ============================================================ */
import { $, esc, money, R2, num, md, toast, busy, openModal, closeModal, confirmBox, sortBy, daysBetween, today, bi, bt, printOpen, sortInv, invNo, sel, goHash } from './ui.js';
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
    /* 🕘 아이템별 이 가게 구매 기록 — 주문 화면에 "9/16(3) · 7/20(6)" 로 보임
     *   ① 앱에서 발행한 인보이스 줄 (실제 나간 수량 · 가격) 전부   ② 아직 인보이스가 안 난 주문(접수 · 작업 중 · 확인)의 줄 — 최근 12건
     *   이전 시스템 인보이스는 줄이 없어 안 잡힘 (아이템별 판매 내역을 가져오면 들어옴) */
    const invL = (out.invHist || []).filter(x => x.lines && x.lines.length);
    invL.forEach(x => x.lines.forEach(l => { if (!l || !l.q) return; (out.hist[l.c] = out.hist[l.c] || []).push([x.d, l.q, l.p, x.no]); }));
    const recent = out.orders.filter(o => o.st === 'pick' || o.st === 'ok' || o.st === 'sent' || (o.st === 'done' && !invL.some(x => x.orderId === o.id || x.order === o.no || (o.invs || []).includes(x.no)))).slice(0, 12);
    const Ls = await Promise.all(recent.map(o => S.DB.get('orderLines', o.id).catch(() => null)));
    Ls.forEach((L, i) => { if (!L || !L.lines) return; const d = recent[i].d; L.lines.forEach(l => { const q = l.pq != null && recent[i].st === 'done' ? l.pq : l.q; if (!q) return; (out.hist[l.c] = out.hist[l.c] || []).push([d, q, l.p, '']); }); });
    /* 같은 날 여러 장은 합치고 · 최근 것부터 · 아이템마다 8건까지 */
    Object.keys(out.hist).forEach(c => { const by = {}; out.hist[c].forEach(h => { const k = h[0]; if (by[k]) { by[k][1] += h[1]; } else by[k] = h.slice(); }); out.hist[c] = Object.values(by).sort((x, y) => String(y[0]).localeCompare(String(x[0]))).slice(0, 8); });
  } catch (e) { out.err = String(e.code || e.message); }
  CACHE[acct] = out;
  return out;
}
/* ============================================================
 *  손님용 스테이트먼트 — 미결 인보이스 · 크레딧 · 에이징 · 최근 입금 · 총 미수 (세일즈맨 · 담당자 모두 인쇄 가능)
 * ============================================================ */
const n2 = v => { v = Number(v) || 0; const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (v < 0 ? '-' : '') + s; };
const fD = d => { d = String(d || ''); return d.length >= 10 ? d.substring(5, 7) + '/' + d.substring(8, 10) + '/' + d.substring(2, 4) : d; };
/** 손님용 스테이트먼트 — opt = { mode: open(미결 전체) | partial(부분 결제만) | all(기간 안 인보이스 전부), from, to, pays(입금 기록 넣기), invs(기간 인보이스 · 미리 읽은 것), payRows(기간 입금) } */
export function statementHtml(acct, info, opt) {
  opt = Object.assign({ mode: 'open', pays: true }, opt || {});
  const a = S.accounts.byCode ? S.accounts.byCode[acct] : null, co = company(S), t = today();
  const terms = (a && a.terms) || 'N30', td = termDays(terms);
  const addr = a ? [a.addr, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')].filter(Boolean) : [];
  const dueOf = d => { if (!d) return ''; const x = new Date(new Date(d + 'T12:00:00').getTime() + td * 86400000); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const inR = d => (!opt.from || d >= opt.from) && (!opt.to || d <= opt.to);
  /* 줄 — 미결(AR + 앱 발행) 은 지금 잔액, 기간 모드는 기간 안 인보이스 전부(받은 것은 잔액 0) */
  const openBy = {}; (info.invs || []).forEach(v => { openBy[invNo(v.no)] = v; });
  let rows;
  if (opt.mode === 'all') rows = (opt.invs || []).filter(x => x.st !== 'x' && inR(x.d)).map(x => { const v = openBy[invNo(x.no)]; const amt = v ? v.amt : (x.total || 0); const bal = v ? v.bal : (x.src !== 'legacy' && x.st === 'open' && !(info.asOf && x.d <= info.asOf) ? (x.bal != null ? x.bal : x.total) : 0); return { no: x.no, d: x.d, amt, bal, pdd: v ? v.pdd : 0 }; });
  else rows = (info.invs || []).filter(v => Math.abs(v.bal) > 0.005).map(v => ({ no: v.no, d: v.d, amt: v.amt, bal: v.bal, pdd: v.pdd }));
  if (opt.mode === 'partial') rows = rows.filter(v => v.bal > 0.005 && v.bal < v.amt - 0.005);
  if (opt.mode !== 'all' && (opt.from || opt.to)) rows = rows.filter(v => inR(v.d));
  rows.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : String(x.no).localeCompare(String(y.no)));
  const due = R2(rows.reduce((s, v) => s + v.bal, 0)), billed = R2(rows.reduce((s, v) => s + (v.amt || 0), 0)), paidSum = R2(billed - due);
  const pays = opt.pays ? (opt.payRows || (info.pays || []).slice(0, 12)) : [];
  const payTot = R2(pays.reduce((s, e) => s + num(e.total != null ? e.total : e.amt), 0));
  const title = opt.mode === 'partial' ? 'STATEMENT' : opt.mode === 'all' ? 'STATEMENT OF ACCOUNT' : 'STATEMENT';
  const sub = opt.mode === 'partial' ? 'PARTIALLY PAID INVOICES' : '';
  const period = opt.from || opt.to ? 'Period ' + fD(opt.from || '') + ' ~ ' + fD(opt.to || t) : '';
  const openN = rows.filter(v => v.bal > 0.005).length, credits = R2(rows.filter(v => v.bal < 0).reduce((s, v) => s + v.bal, 0));
  const tot = opt.mode === 'all' ? [['Invoiced', n2(billed)], ['Paid', n2(paidSum)], ['Balance (these invoices)', n2(due), 'T']].concat(Math.abs(due - info.bal) > 0.005 ? [['Total account due', n2(info.bal), 'D']] : [['Total account due', n2(info.bal), 'D']]) :
    opt.mode === 'partial' || opt.from || opt.to ? [['Invoices listed', String(rows.length)], ['Balance (these invoices)', n2(due), 'T'], ['TOTAL DUE', n2(info.bal), 'D']] :
    [['Open invoices', String(openN)], ['Credits', n2(credits)]].concat(opt.pays && pays.length ? [['Payments received', n2(payTot)]] : []).concat([['TOTAL DUE', '$' + n2(info.bal), 'D']]);
  return '<div class="iv ivstmt' + (co.paper === 'a4' ? ' pa4' : '') + '">' + docHead(co, title, [['Acct. No.', acct], ['Date', fD(t)], ['Terms', terms], ['Rep.', info.sm || (a && a.sm) || '']], sub) +
    '<div class="ivparties"><div class="ivp"><div class="ivlbl">Bill To</div><div class="ivpb"><div class="ivpn">' + esc(a ? a.store : acct) + '</div>' + addr.map(x => '<div>' + esc(x) + '</div>').join('') + (a && a.tel ? '<div>Tel : ' + esc(a.tel) + '</div>' : '') + '</div></div>' +
    '<div class="ivp"><div class="ivlbl">Statement Summary</div><div class="ivpb ivsum"><div><span>Statement date</span><b>' + esc(fD(t)) + '</b></div>' + (period ? '<div><span>Period</span><b>' + esc(period.replace(/^Period /, '')) + '</b></div>' : '') + '<div><span>Open invoices</span><b>' + openN + '</b></div><div><span>Total due</span><b>' + n2(info.bal) + '</b></div>' + (info.asOf ? '<div class="ivnote">Balances as of ' + esc(fD(info.asOf)) + ' plus payments received since</div>' : '') + '</div></div></div>' +
    '<table class="ivlines ivstl"><thead><tr><th>Date</th><th>Invoice</th><th>Due Date</th><th class="r">Days past due</th><th class="r">Amount</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead><tbody>' +
    (rows.length ? rows.map(v => { const dueS = dueOf(v.d), pdd = v.bal > 0.005 ? (v.pdd || (dueS ? Math.max(0, daysBetween(dueS, t)) : 0)) : 0, paid = R2((v.amt || 0) - v.bal);
      return '<tr' + (v.bal < 0 ? ' class="ivcr"' : pdd > 60 ? ' class="ivlate"' : '') + '><td>' + esc(fD(v.d)) + '</td><td class="ivno">' + esc(v.no) + '</td><td>' + esc(fD(dueS)) + '</td><td class="r">' + (v.bal < 0 ? 'CREDIT' : pdd > 0 ? pdd : '') + '</td><td class="r">' + n2(v.amt) + '</td><td class="r">' + (Math.abs(paid) > 0.005 ? n2(paid) : '') + '</td><td class="r">' + (Math.abs(v.bal) > 0.005 ? n2(v.bal) : 'PAID') + '</td></tr>'; }).join('') :
      '<tr><td colspan="7" class="ivempty">' + (opt.mode === 'partial' ? 'No partially paid invoices' : opt.mode === 'all' ? 'No invoices in this period' : 'No open balance — thank you!') + '</td></tr>') +
    '</tbody></table>' +
    (opt.mode === 'open' && !opt.from && !opt.to ? '<div class="ivar ivarw"><table><tr><th>Current</th><th>1-30 Days</th><th>31-60 Days</th><th>61-90 Days</th><th>Over 90 Days</th><th>Total Due</th></tr><tr>' + info.bk.map(v => '<td>' + n2(v) + '</td>').join('') + '<td><b>' + n2(info.bal) + '</b></td></tr></table><div class="ivart">Aging Summary · The aging period is based on the due date, not the invoice date.</div></div>' : '') +
    (opt.pays ? '<div class="ivsec"><div class="ivlbl">Payments received' + (period ? ' · ' + esc(period) : '') + '</div><table class="ivlines"><thead><tr><th>Date</th><th>Method</th><th>Applied to</th><th class="r">Amount</th></tr></thead><tbody>' + (pays.length ? pays.map(e => '<tr' + (e.bounced ? ' class="ivbad"' : '') + '><td>' + esc(fD(e.d)) + '</td><td>' + esc((e.pays || []).map(p => p.m === 'CHECK' ? 'Check #' + p.ref : p.m).join(', ') || ((e.method || '') + (e.ref ? ' ' + e.ref : ''))) + (e.bounced ? ' · RETURNED' : '') + '</td><td>' + esc((e.invs || []).map(v => v.no).filter(Boolean).join(', ')) + '</td><td class="r">' + n2(e.total != null ? e.total : e.amt) + '</td></tr>').join('') + '<tr class="ivsub"><td colspan="3" class="r">Total received</td><td class="r">' + n2(payTot) + '</td></tr>' : '<tr><td colspan="4" class="ivempty">No payments in this period</td></tr>') + '</tbody></table></div>' : '') +
    '<div class="ivfoot"><div class="ivfl"><div class="ivthx">' + esc(co.thanks || '') + '</div></div>' +   // 회사 정보는 머리에 있으니 Remit To 는 따로 안 둠 (수취인은 아래 결제 조건에)
    '<table class="ivtot">' + tot.map(r => '<tr' + (r[2] === 'T' ? ' class="ivT"' : r[2] === 'D' ? ' class="ivDue"' : '') + '><td>' + esc(r[0]) + '</td><td class="r">' + esc(r[1]) + '</td></tr>').join('') + '</table></div>' +
    '<div class="ivterms"><div><b>Payment Terms :</b> Payment is due by the Due Date of each invoice. Past-due balances are subject to a 1.5% monthly finance charge (18% APR). Please make checks payable to ' + esc(co.name) + ' and write the invoice number(s) on your check.</div><div>Kindly remit your payment upon receipt of this statement. Please disregard this statement if payment has already been made.</div></div>' +
    '<div class="ivpg"><span class="ivbc">' + esc(acct) + '</span><span>' + esc(a ? a.store : '') + '</span><span>Statement · printed ' + esc(new Date().toLocaleString('en-US')) + '</span></div></div>';
}
/** 🖨 스테이트먼트 옵션 — 종류(미결 · 부분 결제만 · 기간 안 전부) · 기간 · 입금 기록. 기간 입금은 현장 수금 + COD · ACH · 카드 */
let STO = { mode: 'open', p: 'all', from: '', to: '', pays: true };
export async function statementDialog(acct, info, back) {
  const t = today(), addM = (n) => { const d = new Date(t + 'T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
  const PR = { all: ['전체 기간', 'All time', '', ''], m1: ['최근 1달', 'Last month', addM(-1), t], m3: ['최근 3달', 'Last 3 months', addM(-3), t], m6: ['최근 6달', 'Last 6 months', addM(-6), t], y: ['올해', 'This year', t.slice(0, 4) + '-01-01', t] };
  const paint = () => {
    const [f, to] = STO.p === 'custom' ? [STO.from, STO.to] : PR[STO.p].slice(2);
    $('mbox').innerHTML = '<h2>🖨 ' + bi('손님용 스테이트먼트', 'Customer statement') + '</h2><div class="muted">' + esc((S.accounts.byCode && S.accounts.byCode[acct] || {}).store || acct) + '</div>' +
      '<div class="fg" style="margin-top:8px"><label>' + bt('무엇을', 'What') + '</label><div class="seg" style="flex-wrap:wrap">' + [['open', '미결 전체', 'Open balance'], ['partial', '부분 결제만', 'Partially paid'], ['all', '기간 안 인보이스 전부', 'All invoices in period']].map(m => '<button class="' + (STO.mode === m[0] ? 'on' : '') + '" data-stm="' + m[0] + '">' + bi(m[1], m[2]) + '</button>').join('') + '</div></div>' +
      '<div class="fg"><label>' + bt('기간 (인보이스 날짜 · 입금 날짜)', 'Period (invoice and payment dates)') + '</label><div class="chips" style="margin:0">' + Object.keys(PR).map(k => '<button class="' + (STO.p === k ? 'on' : '') + '" data-stp="' + k + '">' + bi(PR[k][0], PR[k][1]) + '</button>').join('') + '<button class="' + (STO.p === 'custom' ? 'on' : '') + '" data-stp="custom">📅 ' + bt('직접', 'Custom') + '</button></div>' +
      (STO.p === 'custom' ? '<div class="two" style="margin-top:6px"><input type="date" id="stF" value="' + esc(STO.from) + '"><input type="date" id="stT" value="' + esc(STO.to || t) + '"></div>' : (f ? '<div class="muted" style="font-size:12px;margin-top:4px">' + esc(f) + ' ~ ' + esc(to) + '</div>' : '')) + '</div>' +
      '<label class="pick on" style="margin-top:4px"><input type="checkbox" id="stPay" class="ck-big"' + (STO.pays ? ' checked' : '') + '><span class="pm"><b>💵 ' + bi('손님이 낸 입금 기록 같이', 'Include payments received') + '</b><small>' + bt('현장 수금(체크 · 캐쉬 · Zelle) + COD · ACH · 카드', 'Field + COD · ACH · card') + '</small></span></label>' +
      (STO.mode === 'all' && !f ? '<div class="alert a-amb">' + bt('기간 안 인보이스 전부는 기간을 고르세요 (전체 기간이면 인보이스가 아주 많을 수 있음)', 'Pick a period for “all invoices”') + '</div>' : '') +
      '<div class="btns"><button class="b-ghost" id="stBack">‹ ' + bt('가게 창', 'Store') + '</button><button class="b-blue" id="stGo">🖨 ' + bt('스테이트먼트 보기 · 인쇄', 'View · print') + '</button></div>';
    document.querySelectorAll('[data-stm]').forEach(b => b.onclick = () => { STO.mode = b.dataset.stm; if (STO.mode === 'all' && STO.p === 'all') STO.p = 'm3'; paint(); });
    document.querySelectorAll('[data-stp]').forEach(b => b.onclick = () => { STO.p = b.dataset.stp; if (STO.p === 'custom' && !STO.from) { STO.from = addM(-3); STO.to = t; } paint(); });
    if ($('stF')) { $('stF').onchange = () => { STO.from = $('stF').value; }; $('stT').onchange = () => { STO.to = $('stT').value; }; }
    $('stPay').onchange = () => { STO.pays = $('stPay').checked; };
    $('stBack').onclick = () => back ? back() : closeModal();
    $('stGo').onclick = async () => {
      const [from, to] = STO.p === 'custom' ? [STO.from, STO.to || t] : PR[STO.p].slice(2);
      busy(true);
      try {
        const sm = isStaff() ? '' : mySm(), wh = [['acct', '==', acct]].concat(sm ? [['sm', '==', sm]] : []);
        const inR = d => (!from || d >= from) && (!to || d <= to);
        let invs = null, payRows = null;
        if (STO.mode === 'all') invs = await S.DB.list('invoices', { where: info.access && info.access.k === 'none' ? wh : [['acct', '==', acct]] }).catch(() => []);
        if (STO.pays) {
          const [ents, cods] = await Promise.all([S.DB.list('entries', { where: wh }).catch(() => []), S.DB.list('cod', { where: wh }).catch(() => [])]);
          payRows = ents.filter(e => !e.void && !e.repl && inR(e.d)).concat(cods.filter(c => !c.void && inR(c.d)).map(c => Object.assign({}, c, { total: c.amt })));
          payRows.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0);
          if (!from && !to) payRows = payRows.slice(-30);   // 전체 기간이면 최근 30건
        }
        busy(false);
        printOpen(statementHtml(acct, info, { mode: STO.mode, from, to, pays: STO.pays, invs, payRows }));
      } catch (e) { busy(false); toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    };
  };
  paint();
}
/** "10/07(3) 07/28(3)" — 최근 3번 */
/** "9/16(3) · 7/20(6) · 5/02(12)" — 이 가게에 이 아이템이 나간 날(수량), 최근 n건 (기본 3) */
export function histText(info, code, n) { const h = info && info.hist[code]; if (!h || !h.length) return ''; return h.slice(0, n || 3).map(x => md(x[0]) + '(' + x[1] + ')').join(' · ') + (h.length > (n || 3) ? ' …' : ''); }
/** 카드용 한 토막 — 마지막으로 나간 날 · 수량 "9/16·3" (여러 번이면 +N) */
export function histLast(info, code) { const h = info && info.hist[code]; if (!h || !h.length) return ''; return md(h[0][0]) + '·' + h[0][1] + (h.length > 1 ? ' +' + (h.length - 1) : ''); }
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
  if ($('idOrder')) $('idOrder').onclick = () => { closeModal(); goHash('#/order/' + encodeURIComponent(x.orderId)); };
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
/** ✏️ 세일즈맨 — 가게 정보가 틀렸을 때 사무실에 고쳐 달라고 (이메일 · 챗 알림 + 가게 노트에 남김) */
function fixRequest(a, back) {
  openModal('<h2>✏️ ' + bi('정보 수정 요청', 'Request an edit') + ' — ' + esc(a.store) + '</h2><div class="muted">' + bt('바뀐 것만 적어 주세요. 사무실(담당자)이 확인하고 고칩니다.', 'Write only what changed. The office will update it.') + '</div>' +
    '<div class="fg"><label>' + bi('가게 이름', 'Store name') + '</label><input id="frStore" value="' + esc(a.store || '') + '" style="text-transform:uppercase"></div>' +
    '<div class="fg"><label>' + bi('주소', 'Address') + '</label><input id="frAddr" value="' + esc([a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ')) + '"></div>' +
    '<div class="fg"><label>' + bi('전화', 'Phone') + '</label><input id="frTel" value="' + esc(a.tel || '') + '"></div>' +
    '<div class="fg"><label>' + bi('메모 (그 밖에 바뀐 것)', 'Note (anything else)') + '</label><input id="frNote" placeholder="' + esc(bt('예: 주인 바뀜, 새 이메일 …', 'e.g. new owner, new email …')) + '"></div>' +
    '<div class="btns"><button class="b-ghost" id="frX">' + bt('취소', 'Cancel') + '</button><button class="b-blue" id="frOk">' + bt('요청 보내기', 'Send request') + '</button></div>');
  $('frX').onclick = () => back();
  $('frOk').onclick = async () => {
    const was = { store: a.store || '', addr: [a.addr, a.city, a.state, a.zip].filter(Boolean).join(', '), tel: a.tel || '' };
    const now = { store: $('frStore').value.trim().toUpperCase(), addr: $('frAddr').value.trim(), tel: $('frTel').value.trim() }, note = $('frNote').value.trim();
    const chg = Object.keys(now).filter(k => now[k] !== was[k]).map(k => ({ store: '가게 이름', addr: '주소', tel: '전화' })[k] + ': ' + (was[k] || '—') + ' → ' + (now[k] || '—'));
    if (note) chg.push('메모: ' + note);
    if (!chg.length) return toast(bt('바뀐 것이 없습니다', 'Nothing changed'), 'bad');
    busy(true);
    try {
      const N = await import('./notify.js');
      await N.queue({ kind: 'acctFix', chat: true, toStaff: true, acct: a.acct, subject: '[THE ONE] ✏️ 거래처 정보 수정 요청 — ' + a.store + ' (' + a.acct + ')', text: '✏️ ' + ((S.me && S.me.sm) || '') + ' — ' + a.store + ' (' + a.acct + ')\n' + chg.join('\n'), url: N.appUrl('stores') });
      try { await Notes.addNote(a.acct, '✏️ ' + bt('정보 수정 요청', 'Edit requested') + ' — ' + chg.join(' / ')); } catch (e) {}
      toast('📨 ' + bt('사무실에 보냈습니다', 'Sent to the office'), 'good'); back();
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
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
'</div><div style="display:flex;gap:6px;flex:0 0 auto">' + (a ? '<button class="b-ghost b-sm" id="ssEdit">✏️ ' + (isStaff() ? bi('정보 수정', 'Edit') : bi('수정 요청', 'Request edit')) + '</button>' : '') + '<button class="b-ghost b-sm" id="ssX">✕</button></div></div>' +
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
    /* ✏️ 가게 이름 · 주소 · 전화 · 담당 … — 담당자 · 관리자는 바로 고침, 세일즈맨은 사무실에 고쳐 달라고 요청 */
    if ($('ssEdit')) $('ssEdit').onclick = async () => {
      const again = () => storeSheet(acct, onPick, tab);
      if (isStaff()) { const M = await import('./mgr.js'); M.storeForm(S.accounts.byCode[acct] || a, () => { dropStoreCache(acct); again(); }); }
      else fixRequest(a, again);
    };
    $('ssStmt').onclick = () => statementDialog(acct, info, () => { openModal(''); paint(); });
    document.querySelectorAll('[data-ss]').forEach(b => b.onclick = () => { tab = b.dataset.ss; paint(); });
    document.querySelectorAll('[data-so]').forEach(el => el.onclick = () => { closeModal(); goHash('#/order/' + encodeURIComponent(el.dataset.so)); });
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
