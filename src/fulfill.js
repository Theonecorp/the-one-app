/* ============================================================
 *  주문 처리 (매니저) — 이전 시스템의 Sales Order → Sales Invoice 흐름
 *    ① 들어온 주문 확인 (가격 수정 · 할인 변경 표시) → 🖨 픽킹 인보이스 인쇄 = 픽킹 시작
 *    ② 픽킹 결과 입력 (실제 담은 수량 · 줄 추가/수정 · 메모) → 모자란 것은 백오더
 *    ③ 🧾 인보이스 확정 → 종류(A · P · W …)별 세일즈 인보이스 번호 발행 · 인쇄
 *    ④ 백오더는 매니저가 골라서 새 주문으로 만들거나 닫음
 *  backorders/{orderId} = { id, order, acct, store, sm, d, lines:[{c,d,q,p,lp,t}], qty, amt, st:'open'|'used'|'closed', newOrders:[], createdAt }
 * ============================================================ */
import { creditType as CRT } from './credit.js';
import { timelineHtml } from './flow.js';
import { reqText, reqCount } from './reqs.js';
import { narrow, crow, cgrp } from './ui.js';
import { $, esc, money, R2, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, sel, sortBy, printOpen, debounce, bi, bt, hasWords, localDay, pickDates, sortInv, invParts, itabs, footBtns } from './ui.js';
import { jobOf, can, jobCan } from './main.js';
import { loadCatalog, catalog, exactItem, locOf, aisleOf, pickSort, prefixRank, cleanName, productLine, isDiscL1 } from './catalog.js';
import { invTypes, typeOfItem, acctDisc, splitByType, priceDiff, nextInvoiceNo, invoiceHtml, company, docHead, invView, setInvView, dropInvCache, monthsOf, bumpSalesM, invoicesBetween, getInvoice, invByDigits } from './invoicing.js';
import { storeInfo } from './store.js';
import { stTag, cfTag, goOrder, openEditor, orderDoc, typeSummary, recentYms, canEdit, fillStrip, sendStamp, soStamp, takeSo, smShow, payTag } from './orders.js';
import { bumpAccountsVer, storeForm } from './mgr.js';
import { storeSheet, invDetail } from './store.js';
import { searchAccounts, sortStores } from './accounts.js';
import { fillPinned } from './notes.js';
import * as Ship from './ship.js';
import * as Pickup from './pickup.js';
import * as SH from './sorthead.js';
import { itemSuggest } from './suggest.js';
import { stockOut, stockBack } from './stock.js';

let S = null;
const DT = () => invTypes(S)[0].c;   // 기본 인보이스 종류
export function register(state) { S = state; Ship.register(state); Pickup.register(state); }
const acctOf = a => (S.accounts.byCode ? S.accounts.byCode[a] : null);
/** 인보이스 인쇄 — AR 에이징(가게 창 자료)과 회사 정보를 붙여서 */
export async function printInvoices(invs, acc) {
  let ar = null; try { const i = await storeInfo(invs[0].acct, true); ar = i && i.asOf ? { asOf: i.asOf, bk: i.bk, bal: i.bal } : null; } catch (e) {}
  try { await loadCatalog(S); } catch (e) {}
  const v = invView(S), co0 = company(S); if (!v.paper) v.paper = co0.paper || 'letter';
  const paint = () => {
    const bar = '<div class="noprint ivopts"><span>' + bi('용지', 'Paper') + '</span>' + [['letter', 'Letter 8½×11'], ['a4', 'A4']].map(x => '<button class="' + (v.paper === x[0] ? 'on' : '') + '" data-ivpp="' + x[0] + '">' + x[1] + '</button>').join('') + '<span>' + bi('정렬', 'Sort') + '</span>' + [['group', '분류별 묶음', 'By line'], ['abc', '코드 ABC', 'Code A→Z'], ['order', '주문 순서', 'Order entry']].map(x => '<button class="' + (v.sort === x[0] ? 'on' : '') + '" data-ivs="' + x[0] + '">' + x[1] + ' <span class="en">' + x[2] + '</span></button>').join('') +
      '<span>' + bi('세트', 'Sets') + '</span>' + [['open', '구성품 펼침', 'Show contents'], ['closed', '세트 한 줄', 'One line']].map(x => '<button class="' + (v.kits === x[0] ? 'on' : '') + '" data-ivk="' + x[0] + '">' + x[1] + ' <span class="en">' + x[2] + '</span></button>').join('') + '</div>';
    const co = Object.assign({}, co0, { paper: v.paper });
    printOpen('<style>@page{size:' + (v.paper === 'a4' ? 'A4' : 'letter') + ';margin:.4in}</style>' + bar + invs.map(x => invoiceHtml(x, acc, { co, ar, view: v })).join(''), invs.length === 1 ? 'Invoice-' + (invs[0].no || '') : 'Invoices-' + (invs[0].store || invs[0].acct || ''));
    document.querySelectorAll('[data-ivpp]').forEach(b => b.onclick = () => { v.paper = b.dataset.ivpp; setInvView(v); paint(); });
    document.querySelectorAll('[data-ivs]').forEach(b => b.onclick = () => { v.sort = b.dataset.ivs; setInvView(v); paint(); });
    document.querySelectorAll('[data-ivk]').forEach(b => b.onclick = () => { v.kits = b.dataset.ivk; setInvView(v); paint(); });
  };
  paint();
}
const typeName = c => { const t = invTypes(S).find(x => x.c === c); return t ? t.n : c; };

/* ============================================================
 *  주문 처리 화면
 * ============================================================ */
/** 🗄 단종 상품 줄의 인보이스 종류 바로잡기 — v0.8.196 전에는 단종 폴더의 주얼리가 그 외(P)로 잡혔음. 인보이스 전 주문만 · W(사무실이 고른 것)는 그대로 */
export function fixDiscT(o, lines) {
  const C = catalog(); if (!C || /^(done|shipped|x|dlv)$/.test(String((o && o.st) || ''))) return lines;
  lines.forEach(l => { const it = C.byCode[l.c]; if (!it || !isDiscL1(it.l1) || l.t === 'W') return; const t = typeOfItem(S, it); if (t && t !== l.t) l.t = t; });
  return lines;
}
export function manage(o, lines) {
  lines = fixDiscT(o, lines.map(l => Object.assign({}, l, l.t ? {} : { t: DT() })));   // 종류 없는 옛 줄은 기본 종류(A)로
  const picking = o.st === 'pick' || o.st === 'ok' || o.st === 'picked';   // 픽킹 수량을 만질 수 있는 상태 (픽킹 완료 뒤에도 사무실이 고칠 수 있음)
  if (picking) lines.forEach(l => { if (l.pq == null) l.pq = l.q; });
  const acc = acctOf(o.acct), ad = acctDisc(acc);
  const pd = priceDiff(lines, 'q');
  let h = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">' + esc(o.no) + ' ' + stTag(o.st) + '</h2>' +
    '<div style="font-size:18px;font-weight:800;margin-top:6px">' + esc(o.store) + '</div>' +
    '<div class="muted">' + esc([o.acct, o.shipTo ? [o.shipTo.addr, o.shipTo.city, o.shipTo.state].filter(Boolean).join(', ') + ' (이 주문만)' : acc ? [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : ''].filter(Boolean).join(' · ')) + (acc && acc.terms ? ' · ' + esc(acc.terms) : '') + '</div>' +
    (o.storeChg && o.storeChg.length ? '<div class="muted" style="font-size:12px">🏬 가게 변경 ' + o.storeChg.length + '번 · 마지막: ' + esc(o.storeChg[o.storeChg.length - 1].from.store) + ' → ' + esc(o.storeChg[o.storeChg.length - 1].to.store) + ' (' + esc(String(o.storeChg[o.storeChg.length - 1].by).split('@')[0]) + ')</div>' : '') +
    '<div class="muted">' + smShow(o) + payTag(o) + ' · ' + esc(o.d) + (o.sentAt ? ' · 들어옴 ' + esc(o.sentAt.substring(5, 16).replace('T', ' ')) : '') + (o.pickAt ? ' · 픽킹 ' + esc(o.pickAt.substring(5, 16).replace('T', ' ')) + (o.pickerName ? ' 👷 ' + esc(o.pickerName) : '') : '') + (o.pickDoneAt ? ' · 픽킹 완료 ' + esc(o.pickDoneAt.substring(5, 16).replace('T', ' ')) : '') + (o.shipAt ? ' · 출고 ' + esc(o.shipAt.substring(5, 16).replace('T', ' ')) + (o.track ? ' 🚚 ' + esc(o.track) : '') : '') + '</div>' + cfTag(o) + '</div>' +
    '<button class="b-ghost b-sm" id="mMsg" title="' + esc(bt('세일즈맨에게 메시지', 'Message the salesman')) + '">💬</button><button class="b-ghost b-sm" id="mBack">‹ ' + bi('목록', 'List') + '</button></div>' +
    (acc && acc.note ? '<div class="alert a-blu">🏬 ' + esc(acc.note) + '</div>' : '') + '<div id="mNotes"></div>' +
    (o.cfIssueOpen ? '<div class="alert a-red">⚠️ ' + bi('세일즈맨이 이 주문에 문제가 있다고 알렸습니다', 'The salesman flagged this order') + ': <b>' + esc(o.cfIssue || '') + '</b> <span class="muted">' + esc(String(o.cfIssueAt || '').substring(5, 16).replace('T', ' ')) + '</span><div class="btns" style="justify-content:flex-start;margin-top:6px"><button class="b-ghost b-sm" id="mIssueOk">✅ ' + bt('해결', 'Resolved') + '</button></div></div>' : '') + (o.cfReq && !o.cfOk && o.cfNote ? '<div class="alert a-amb">❓ ' + bt('세일즈맨에게 물어본 것', 'Asked the salesman') + ': ' + esc(o.cfNote) + '</div>' : '') +
    (o.st === 'x' ? cancelledBox(o) : '') +
    (reqCount(o.req) ? '<div class="alert a-amb">🎁 <b>' + bi('인서트 · 디스플레이 요청', 'Insert · display request') + '</b>: <b>' + reqText(o.req, false, o.reqNote) + '</b> — ' + bt('같이 포장', 'pack together') + '</div>' : '') +
    (o.memo ? '<div class="alert a-blu">📝 ' + esc(o.memo) + '</div>' : '') +
    (S.role !== 'salesman' ? imemoBox(o) : '') +
    '<div id="mSum"></div>' +
    (S.role !== 'salesman' ? timelineHtml(o) : '');
  /* 가격 수정 · 할인 변경 — 매니저가 꼭 봐야 하는 것 */
  if (pd.n) h += '<div class="alert a-amb">💲 세일즈맨 가격 수정 <b>' + pd.n + '줄</b> · 목록가 ' + money(pd.list) + ' → ' + money(pd.real) + ' (<b>' + (pd.diff >= 0 ? '+' : '') + money(pd.diff) + ', ' + pd.pct + '%</b>) <button class="b-ghost b-sm" id="mShowP">줄 보기</button></div>';
  const dk = {}; Object.keys(ad).concat(Object.keys(o.disc || {})).forEach(k => { dk[k] = 1; });
  const dchg = Object.keys(dk).filter(k => Number((o.disc || {})[k] || 0) !== Number(ad[k] || 0));
  if (dchg.length) h += '<div class="alert a-amb">🏷 할인 변경: ' + dchg.map(k => '<b>' + esc(k) + '</b> 주문 ' + ((o.disc || {})[k] || 0) + '% · 가게 기본 ' + (ad[k] || 0) + '%').join(' · ') +
    (o.acct && can('invoice') ? ' <button class="b-ghost b-sm" id="mDiscSave">이 할인을 가게 기본으로 · set as store default</button>' : '') + '</div>';
  h += '<div id="mTypes"></div></div>';
  /* 버튼 */
  /* 픽킹·팩킹 담당은 픽킹까지만 — 인보이스 확정 · 주문 취소 · 할인 저장은 인보이스 · 오피스 담당이 */
  const J = jobOf(), canInv = can('invoice');
  const B = [];
  const isPicker = o.picker === S.user.email;
  if (o.st === 'draft') B.push('<button class="b-green" id="mSend">📤 ' + bi('접수로 보내기', 'Submit order') + '</button>');
  if (o.st === 'sent') B.push((can('assign') ? '<button class="b-blue" id="mAssign">👷 ' + bi('작업 배정', 'Assign Picker') + '</button>' : '') + (can('pick') ? '<button class="b-ghost" id="mPick">🖨 ' + bi('직접 작업 시작', 'Start Myself') + '</button>' : ''));
  if (o.st === 'pick' || o.st === 'ok') B.push('<button class="b-ghost" id="mPickSave">💾 ' + bi('작업 저장', 'Save Progress') + '</button><button class="b-green" id="mPickDone">✅ ' + bi('작업 완료', 'Complete Picking') + '</button>');
  if (o.st === 'picked') B.push('<button class="b-ghost" id="mPickSave">💾 ' + bi('수량 저장', 'Save') + '</button>' + (canInv ? '<button class="b-green" id="mInv">🧾 ' + bi('인보이스 발행', 'Issue invoice') + '</button>' : '<span class="muted" style="align-self:center">' + bi('인보이스 발행은 사무실에서 합니다', 'Office issues the invoice') + '</span>'));
  if (o.st === 'sent' && !o.cfOk) B.push('<button class="b-ghost" id="mCfOk">👍 ' + bi('확인 완료로 (전화 등)', 'Mark confirmed') + '</button>');
  if (o.pay === 'ACH' && (o.st === 'done' || o.st === 'packed' || o.st === 'dlv' || o.st === 'shipped') && o.invs && o.invs.length && can('invoice')) B.push(o.achId ? '<span class="tag t-b" style="align-self:center">🏦 ACH ' + bt('입력됨', 'entered') + '</span>' : '<button class="b-blue" id="mAch">🏦 ' + bi('ACH 입력', 'Enter ACH') + '</button>');
  if (o.st === 'done' && can('ship')) B.push('<button class="b-green" id="mShip">🚚 ' + bi('포장 · UPS 라벨', 'Pack · UPS label') + '</button><button class="b-ghost" id="mShipOld">✍️ ' + bi('트래킹 직접 입력 · 다른 운송', 'Manual tracking · other carrier') + '</button>');   /* 🚚 = 🏪 카운터 · ✍️ = 예전 출고 창 (v0.8.209) */
  /* 🚗 UPS 가 아니라 세일즈맨 · 다른 직원이 가져가거나 손님이 픽업 — 딜리버리 대기로 (UPS 출고 목록에서 빠짐) */
  if (o.st === 'done' && (can('ship') || can('invoice'))) B.push('<button class="b-ghost" id="mDlv">🚗 ' + bi('딜리버리로 (UPS 아님)', 'Delivery (not UPS)') + '</button>');
  if (o.st === 'dlv') B.push('<div class="alert a-amb" style="flex-basis:100%;margin:0">🚗 ' + bi('딜리버리 대기', 'Awaiting delivery') + ' — <b>' + esc(DLVK[o.dlvKind] ? bt(DLVK[o.dlvKind][0], DLVK[o.dlvKind][1]) : '') + (o.dlvBy ? ' · ' + esc(o.dlvBy) : '') + '</b>' + (o.dlvNote ? ' · 📝 ' + esc(o.dlvNote) : '') + ' <span class="muted">' + esc(String(o.dlvAt || '').substring(5, 16).replace('T', ' ')) + '</span></div>' +
    (can('ship') || can('invoice') ? '<button class="b-green" id="mDlvDone">✅ ' + bi('배달 완료', 'Delivered') + '</button><button class="b-ghost" id="mDlvEdit">✏️ ' + bi('누가 · 메모', 'Who · note') + '</button>' : ''));
  if (o.st === 'packed') B.push('<button class="b-blue" id="mPickup">📮 ' + bi('UPS 픽업 화면', 'UPS pickup') + '</button>' + (can('ship') ? '<button class="b-ghost" id="mShip">🚚 ' + bi('라벨 · 박스 보기', 'Labels · boxes') + '</button>' : ''));
  h += '<div class="card"><div class="btns" style="margin-top:0;flex-wrap:wrap">' +
    (picking ? '<button class="b-ghost b-sm" id="mPickPrint">🖨 ' + bi('픽킹 인보이스', 'Picking list') + '</button>' + (lines.some(l => l.kit && l.kit.length) ? '<button class="b-ghost b-sm' + (pickKits() ? ' on' : '') + '" id="mPkKits" title="' + esc(bt('세트의 구성품까지 픽킹 리스트에 보이기 (기본은 세트 한 줄만)', 'Show set components on the picking list (default: one line per set)')) + '">🧩 ' + (pickKits() ? bi('구성품 숨기기', 'Hide components') : bi('구성품 보기', 'Show components')) + '</button>' : '') : '') +
    (o.acct ? '<button class="b-ghost b-sm" id="mStoreI">📋 ' + bi('가게 기록', 'Store') + '</button>' : '') +
    (o.st !== 'x' && (can('invoice') || can('newOrder')) ? '<button class="b-ghost b-sm" id="mDisp">🖼 Notes Display <span id="mDispN"></span></button>' : '') +
    (o.st !== 'x' && canInv ? '<button class="b-ghost b-sm" id="mStoreChg">🏬 ' + bi('가게 바꾸기', 'Change store') + '</button>' : '') +
    (canEdit(o) && canInv ? '<button class="b-ghost b-sm" id="mEdit">✏️ ' + bi('주문 수정', 'Edit') + '</button>' : '') +
    (picking && canInv ? '<button class="b-ghost b-sm" id="mDisc">🏷 ' + bi('할인 바꾸기', 'Change discount') + '</button>' : '') +
    (!canEdit(o) && o.st !== 'x' && o.invs && o.invs.length && can('void') ? o.invs.map(no => '<button class="b-ghost b-sm" data-mie="' + esc(no) + '">✏️ ' + bi('인보이스 수정', 'Edit invoice') + ' ' + esc(no) + '</button>').join('') : '') +
    (can('assign') && (o.st === 'pick' || o.st === 'ok') ? '<button class="b-ghost b-sm" id="mUnpick">↩️ ' + bi('신규 주문으로 되돌리기', 'Return to New Orders') + '</button><button class="b-ghost b-sm" id="mReassign">👷 ' + bi('작업자 변경', 'Reassign Picker') + '</button>' : '') +
    (o.st === 'picked' ? '<button class="b-ghost b-sm" id="mRepick">↩️ ' + bi('출고 작업으로 되돌리기', 'Return to Fulfillment') + '</button>' : '') +
    (o.st === 'packed' || o.st === 'dlv' ? '<button class="b-ghost b-sm" id="mUnship">↩️ ' + bi('포장 대기로 되돌리기', 'Back to packing') + '</button>' : '') +
    (o.st === 'shipped' && o.shipVia !== 'INVOICE' ? '<button class="b-ghost b-sm" id="mUnship">↩️ ' + bi('출고 취소', 'Undo shipping') + '</button>' + (can('ship') || can('track') ? '<button class="b-ghost b-sm" id="mTrk">📦 Shipping History</button>' : '') : '') +
    ((o.st === 'sent' || o.st === 'pick' || o.st === 'ok') && !o.cfOk ? '<button class="b-ghost b-sm" id="mCfReq">❓ ' + bi(o.cfReq ? '확인 다시 요청' : '세일즈맨 확인 요청', 'Ask salesman') + '</button>' : '') +
    '<button class="b-ghost b-sm" id="mAsk">💬 ' + bi('구글 챗으로 묻기', 'Ask on Google Chat') + '</button>' + ((S.settings && S.settings.chatUrl) ? '<button class="b-ghost b-sm" id="mChat">💬 ' + bi('챗 열기', 'Open Chat') + '</button>' : '') +
    (o.st === 'done' || o.st === 'shipped' ? '<button class="b-ghost b-sm" id="mInvPrint">🖨 ' + bi('인보이스 인쇄', 'Print invoice') + '</button>' : '') +
    ((o.st === 'done' || o.st === 'shipped') && can('void') ? '<button class="b-ghost b-sm" id="mVoid" style="color:#991b1b">🚫 ' + bi('인보이스 VOID', 'Void invoice') + '</button>' : '') +
    '<button class="b-ghost b-sm" id="mCsv">⬇️ CSV</button>' +
    (o.st !== 'done' && o.st !== 'shipped' && o.st !== 'x' && canInv ? '<button class="b-ghost b-sm" id="mCancel" style="color:#991b1b">✕ ' + bi('주문 취소', 'Cancel order') + '</button>' : '') +
    '</div>' + (B.length ? '<div class="btns">' + B.join('') + '</div>' : '') +
    (o.st === 'done' || o.st === 'shipped' ? '<div class="sumbox">🧾 인보이스: ' + (o.invs || []).map(n => '<a href="#/order/inv:' + esc(n) + '"><b>' + esc(n) + '</b></a>').join(' · ') + (o.bo ? ' · ⏳ <a href="#/order/bo:' + esc(o.bo) + '">백오더 있음</a>' : '') + '</div>' : '') + '</div>';
  /* 줄 */
  h += '<div class="card"><h2>' + (picking ? '📦 ' + bi('픽킹 결과 — 실제로 담은 수량', 'Picked qty') : bi('아이템', 'Items')) + ' ' + lines.length + '</h2>' +
    (picking ? '<div class="muted">줄의 버튼을 <b>한 번</b> 두드리면 ✓ 통과(주문 수량), <b>다시</b> 두드리면 ⏳ 백오더(0), 일부만 담았으면 <b>✎ 수량</b>. 코드를 스캔하면 1개씩 올라갑니다. <span class="en">Tap once = picked as ordered, tap again = backorder, ✎ for a partial qty.</span></div><div class="btns" style="flex-wrap:wrap"><button class="b-ghost b-sm" id="mAllQ">✓ ' + bi('모두 통과', 'All picked') + '</button><button class="b-ghost b-sm" id="mAllZ">⏳ ' + bi('모두 백오더', 'All backorder') + '</button><button class="b-ghost b-sm" id="mAdd">＋ ' + bi('아이템 추가', 'Add item') + '</button></div>' : '') +
    '<input id="mFind" placeholder="이 주문 안에서 찾기 · 스캔 / Find in this order · scan" autocomplete="off" style="margin:8px 0 6px"><div class="chips" style="margin:0 0 6px"><button class="on" data-mf="all">' + bi('전체', 'All') + '</button>' + (picking ? '<button data-mf="u">○ ' + bi('미확인만', 'Unchecked') + '</button><button data-mf="bo">⏳ ' + bi('백오더만', 'Backorder only') + '</button>' : '') + '<button data-mf="p">' + bi('가격 수정만', 'Price changed') + '</button></div><div id="mLines"></div></div>';
  if (B.length) h += footBtns(B.join(''));   // ⤵ 줄 목록 아래에도 같은 단추 — 끝까지 내려간 뒤 바로 💾 작업 저장 · ✅ 작업 완료 · 🧾 발행
  $('page').innerHTML = h;

  fillPinned('mNotes', o.acct);
  let MF = 'all';
  const sumNow = () => { $('mSum').innerHTML = (picking ? '<div class="muted" style="margin-top:8px">🧾 픽킹한 수량 기준 — 확정하면 종류마다 인보이스가 따로 나옵니다 <span class="en">Based on picked qty; one invoice per type on confirm</span></div>' : '<div class="muted" style="margin-top:8px">🧾 주문 수량 기준 미리보기 — 픽킹 후 확정 <span class="en">Preview by ordered qty; split after picking</span></div>') + typeSummary(splitByType(lines, o.disc, picking ? 'pq' : 'q')) + (picking ? boLine() : ''); };
  /* 🏷 인보이스 종류 — 사무실 판단: 줄마다 바꾸거나 전체를 한 종류로. 픽킹 중이 아니면 바로 저장 */
  const typeBar = () => {
    const box = $('mTypes'); if (!box) return;
    if (!office) { box.innerHTML = ''; return; }
    const cnt = {}; lines.forEach(l => { const t = l.t || DT(); cnt[t] = (cnt[t] || 0) + 1; });
    const w = types.find(t => t.comm === 'W');
    box.innerHTML = '<div class="alert a-blu tybar">🏷 <b>' + bt('인보이스 종류', 'Invoice type') + '</b> ' + types.map(t => '<span class="tag ' + (cnt[t.c] ? (t.c === (w && w.c) ? 't-a' : 't-k') : 't-g') + '">' + esc(t.c) + ' ' + (cnt[t.c] || 0) + bt('줄', '') + '</span>').join(' ') +
      '<span class="muted" style="font-size:12px;display:block;margin:4px 0">' + bt('W(디스플레이 · 세트, 커미션 제한)는 자동 분류가 아니라 사무실이 주문을 보고 판단합니다. 줄마다 코드 옆에서 바꾸거나, 아래로 전체를 한 번에.', 'W (display & set, limited commission) is decided by the office, not automatically. Change per line next to the code, or the whole order below.') + '</span>' +
      '<div class="btns" style="justify-content:flex-start;margin-top:4px;flex-wrap:wrap">' + types.map(t => '<button type="button" class="b-ghost b-sm" data-tall="' + esc(t.c) + '"' + (cnt[t.c] === lines.length ? ' disabled' : '') + '>' + bt('모두 ', 'All ') + esc(t.c) + '</button>').join('') + '</div></div>';
    box.querySelectorAll('[data-tall]').forEach(b => b.onclick = async () => { const t = b.dataset.tall, n = lines.filter(l => (l.t || DT()) !== t).length; if (!(await confirmBox(bt(n + '줄 전부 인보이스 종류 ' + t + ' 으로 바꿀까요?', 'Set all ' + n + ' lines to invoice type ' + t + '?'), t))) return; lines.forEach(l => { l.t = t; }); typeChanged(true); });
  };
  const typeChanged = async (repaint) => {
    sumNow(); typeBar(); if (repaint) paint();
    if (picking) { dirty = true; return; }   // 픽킹 중엔 💾 작업 저장으로 같이
    busy(true); try { await saveLines(); toast('🏷 ' + bt('인보이스 종류 저장', 'Invoice type saved'), 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
  };
  const boLine = () => { const b = lines.filter(l => (l.pq || 0) < l.q), u = lines.filter(l => !l.ok); return (u.length ? '<div class="alert a-amb">○ 아직 두드리지 않은 줄 <b>' + u.length + '</b> / ' + lines.length + ' <span class="en">not yet checked</span></div>' : '') + (b.length ? '<div class="alert a-red">⏳ 백오더 ' + b.length + '줄 · ' + b.reduce((a, l) => a + l.q - (l.pq || 0), 0) + '개</div>' : u.length ? '' : '<div class="alert a-grn">✓ 모두 픽킹됨</div>'); };
  const types = invTypes(S), office = canInv && S.role !== 'salesman' && (o.st === 'sent' || o.st === 'mine' || picking);   // 접수 · 배정 · 픽킹 · 픽킹 완료 — 발행 전까지   // 🏷 인보이스 종류(A · P · W)는 사무실이 접수 ~ 발행 전까지 주문을 보고 판단해서 바꿈
  /* 픽킹 입력은 두드려서: 처음 한 번 = ✓ 통과(주문 수량), 다시 = ⏳ 백오더(0), 다시 = ✓ … · ✎ 수량 으로 일부만 담았을 때 숫자 입력 */
  const pkBtn = l => { const pq = l.pq || 0, st = !l.ok ? 'u' : pq >= l.q ? 'ok' : pq === 0 ? 'bo' : 'part'; const ic = st === 'u' ? '○' : st === 'ok' ? '✓' : st === 'bo' ? '⏳' : '◐'; return '<button class="pkb ' + st + '" data-pkt="' + l._i + '">' + ic + ' <b>' + pq + '</b><span>/' + l.q + '</span></button><button class="b-ghost pkq" data-pkq="' + l._i + '">✎ ' + bi('수량', 'Qty') + '</button>'; };
  const paint = () => {
    const q = $('mFind').value.trim().toUpperCase();
    let rows = lines.map((l, i) => Object.assign({ _i: i }, l));
    if (picking) rows.sort(pickSortGrouped);   // 픽킹 중에는 종류 → 분류 → 창고 통로 순 (인쇄와 같게)
    if (q) rows = rows.filter(l => hasWords(l.c + ' ' + l.d, q));
    if (MF === 'bo') rows = rows.filter(l => (l.pq || 0) < l.q);
    if (MF === 'u') rows = rows.filter(l => !l.ok);
    if (MF === 'p') rows = rows.filter(l => l.lp != null && Math.abs(l.lp - l.p) > 0.0001);
    let lastG = null;
    $('mLines').innerHTML = '<table class="pk"><tr><th>코드</th><th class="r">주문</th>' + (picking ? '<th class="r">픽</th>' : '') + '<th class="r">가격</th><th class="r">금액</th></tr>' + rows.slice(0, 2500).map(l => {
      const chg = l.lp != null && Math.abs(l.lp - l.p) > 0.0001, bo = picking && l.ok && (l.pq || 0) < l.q;
      let sep = ''; if (picking && !q) { const g = pickGroup(l); if (g.key !== lastG) { lastG = g.key; sep = '<tr class="pkg"><td colspan="5">' + esc(aisleLabel(g)) + '</td></tr>'; } }
      const qq = picking ? (l.pq || 0) : l.q;
      const loc = picking ? locOf(l.c) : '';
      return sep + '<tr class="' + (bo ? 'bo' : '') + (picking && l.ok && !bo ? ' okd' : '') + '"><td>' + (loc ? '<span class="loc">📍' + esc(loc) + '</span> ' : '') + '<b>' + esc(l.c) + '</b> ' + (office ? sel('', types.map(t => [t.c, t.c]), l.t || DT(), 'class="tsel" data-t="' + l._i + '"') : '<span class="tag t-g">' + esc(l.t || DT()) + '</span>') +
        '<div class="muted" style="font-size:11.5px">' + esc(l.d) + '</div>' + (l.kit ? '<div class="muted" style="font-size:11px">🧩 ' + (!picking ? l.kit.map(k => esc(k.c) + '×' + k.q).join(', ') : '<span class="pkcomp">' + l.kit.map(k => esc(k.c) + '×' + k.q).join(', ') + '</span><span class="pksum">' + bt('세트', 'Set') + ' · ' + l.kit.length + bt('가지', ' items') + '</span>') + (picking ? ' <button class="b-ghost b-sm" data-brk="' + l._i + '" style="padding:2px 7px">세트 풀기</button>' : '') + '</div>' : '') + (picking ? '<input class="sm" data-note="' + l._i + '" value="' + esc(l.note || '') + '" placeholder="메모" style="margin-top:3px;padding:4px 7px;font-size:12px">' : (l.note ? '<div class="muted">📝 ' + esc(l.note) + '</div>' : '')) + '</td>' +
        '<td class="r"><b>' + l.q + '</b></td>' +
        (picking ? '<td class="r pkc">' + pkBtn(l) + '</td>' : '') +
        '<td class="r">' + money(l.p) + (chg ? '<div class="muted" style="text-decoration:line-through">' + money(l.lp) + '</div>' : '') + '</td>' +
        '<td class="r">' + money(qq * l.p) + '</td></tr>';
    }).join('') + '</table>' + (rows.length ? '' : '<div class="none">없음</div>');
    /* 두드리기: ○ 미확인 → ✓ 통과 → ⏳ 백오더 → ✓ … (줄만 다시 그림) */
    const redraw = i => { const tr = document.querySelector('[data-pkt="' + i + '"]'); if (!tr) return paint(); const l = Object.assign({ _i: i }, lines[i]); const td = tr.closest('td'); td.innerHTML = pkBtn(l); bindPk(td); const row = td.closest('tr'); const bo = l.ok && (l.pq || 0) < l.q; row.classList.toggle('bo', bo); row.classList.toggle('okd', !!l.ok && !bo); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} };
    const bindPk = root => {
      root.querySelectorAll('[data-pkt]').forEach(b => b.onclick = () => { const l = lines[+b.dataset.pkt]; if (!l.ok) { l.ok = true; l.pq = l.q; } else if ((l.pq || 0) >= l.q) l.pq = 0; else l.pq = l.q; dirty = true; sumNow(); redraw(+b.dataset.pkt); });
      root.querySelectorAll('[data-pkq]').forEach(b => b.onclick = () => { const i = +b.dataset.pkq, l = lines[i];
        openModal('<h2>✎ ' + esc(l.c) + '</h2><div class="muted">' + esc(l.d) + ' · 주문 <b>' + l.q + '</b></div><div class="fg" style="margin-top:8px"><label>' + bi('실제 담은 수량', 'Picked qty') + '</label><input id="pqIn" type="number" inputmode="numeric" min="0" value="' + (l.pq == null ? l.q : l.pq) + '" style="font-size:26px;font-weight:800;text-align:center"></div><div class="chips">' + [0, Math.floor(l.q / 2), l.q].filter((v, k, a) => a.indexOf(v) === k).map(v => '<button data-pqv="' + v + '">' + v + (v === l.q ? ' ✓' : v === 0 ? ' ⏳' : '') + '</button>').join('') + '</div><div class="btns"><button class="b-ghost" id="pqX">취소</button><button class="b-blue" id="pqOk">확인</button></div>');
        const done = v => { l.pq = Math.max(0, Math.floor(Number(v) || 0)); l.ok = true; dirty = true; closeModal(); sumNow(); redraw(i); };
        document.querySelectorAll('[data-pqv]').forEach(x => x.onclick = () => done(x.dataset.pqv)); $('pqX').onclick = closeModal; $('pqOk').onclick = () => done($('pqIn').value); $('pqIn').onkeydown = e => { if (e.key === 'Enter') done($('pqIn').value); };
        setTimeout(() => { const e = $('pqIn'); if (e) { e.focus(); e.select(); } }, 50); });
    };
    bindPk($('mLines'));
    document.querySelectorAll('[data-t]').forEach(s => s.onchange = () => { lines[+s.dataset.t].t = s.value; typeChanged(); });
    document.querySelectorAll('[data-brk]').forEach(b => b.onclick = async () => {
      const i = +b.dataset.brk, l = lines[i];
      if (!(await confirmBox(l.c + ' 세트를 구성품 ' + l.kit.length + '종으로 풀까요? (구성품을 따로 픽킹 · 인보이스, 가격은 구성품 목록가)', '풀기'))) return;
      try { await loadCatalog(S); } catch (e) {}
      const C = catalog(), add = l.kit.map(k => { const it = C && C.byCode[k.c]; return { c: k.c, d: it ? it.d : k.c, q: k.q * l.q, pq: k.q * (l.pq == null ? l.q : l.pq), p: it ? it.p : 0, lp: it ? it.p : 0, t: it ? typeOfItem(S, it) : (l.t || DT()), note: '세트 ' + l.c + ' 풀음' }; });
      lines.splice(i, 1, ...add); dirty = true; sumNow(); paint();
    });
    document.querySelectorAll('[data-note]').forEach(inp => inp.onchange = () => { const v = inp.value.trim(); if (v) lines[+inp.dataset.note].note = v; else delete lines[+inp.dataset.note].note; dirty = true; });
  };
  let dirty = false;
  sumNow(); paint(); typeBar();
  if (picking && !catalog()) loadCatalog(S).then(() => { if ($('mLines')) paint(); }).catch(() => {});   // 분류 구분줄(종류 → 분류 순)은 카탈로그가 있어야 — 아직 없으면 읽은 뒤 다시 그림
  $('mFind').oninput = debounce(paint, 150);
  $('mFind').onkeydown = e => { if (e.key !== 'Enter' || !picking) return; e.preventDefault(); const v = $('mFind').value.trim().toUpperCase(); const i = lines.findIndex(l => l.c === v || (catalog() && exactItem(v) && exactItem(v).c === l.c)); if (i < 0) return toast('이 주문에 없는 코드입니다', 'bad'); lines[i].pq = (lines[i].ok ? (lines[i].pq || 0) : 0) + 1; lines[i].ok = true; dirty = true; $('mFind').value = ''; sumNow(); paint(); toast(lines[i].c + ' 픽 ' + lines[i].pq + ' / ' + lines[i].q, 'good'); };
  document.querySelectorAll('[data-mf]').forEach(b => b.onclick = () => { MF = b.dataset.mf; document.querySelectorAll('[data-mf]').forEach(x => x.classList.toggle('on', x === b)); paint(); });
  if ($('mMsg')) $('mMsg').onclick = async () => { const M = await import('./msg.js'); M.compose({ to: 'sm:' + o.sm, ref: { kind: 'order', id: o.id, label: o.no + ' · ' + o.store } }); };
  $('mBack').onclick = () => { if (dirty && !confirm('픽킹 결과를 저장하지 않았습니다. 그래도 나갈까요?')) return; Router.go('order'); };
  if ($('mShowP')) $('mShowP').onclick = () => { MF = 'p'; document.querySelectorAll('[data-mf]').forEach(x => x.classList.toggle('on', x.dataset.mf === 'p')); paint(); $('mLines').scrollIntoView({ behavior: 'smooth' }); };
  if ($('mDiscSave')) $('mDiscSave').onclick = async () => {
    if (!(await confirmBox(o.store + ' 기본 할인을 ' + (Object.keys(o.disc || {}).map(k => k + ' ' + o.disc[k] + '%').join(', ') || '없음') + ' 으로 바꿀까요? 다음 주문부터 자동으로 들어갑니다.', '저장'))) return;
    busy(true); try { await S.DB.update('accounts', o.acct, { disc: Object.assign({}, o.disc || {}) }); await bumpAccountsVer(); await S.DB.update('orders', o.id, { discChg: false }); toast('가게 기본 할인 저장', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
  };
  if ($('mAllQ')) $('mAllQ').onclick = () => { lines.forEach(l => { l.pq = l.q; l.ok = true; }); dirty = true; sumNow(); paint(); };
  if ($('mAllZ')) $('mAllZ').onclick = () => { lines.forEach(l => { l.pq = 0; l.ok = true; }); dirty = true; sumNow(); paint(); };
  if ($('mAdd')) $('mAdd').onclick = async () => {
    try { await loadCatalog(S); } catch (e) {}
    openModal('<h2>＋ 아이템 추가</h2><div class="fg"><label>코드 · 바코드</label><input id="aCode" autocomplete="off" style="text-transform:uppercase"></div><div class="two"><div class="fg"><label>수량</label><input id="aQ" type="number" inputmode="numeric" value="1"></div><div class="fg"><label>가격 (비우면 목록가)</label><input id="aP" type="number" step="0.01" inputmode="decimal"></div></div><div class="btns"><button class="b-ghost" id="aX">닫기</button><button class="b-blue" id="aOk">추가</button></div>');
    $('aX').onclick = closeModal; setTimeout(() => { const e = $('aCode'); if (e) e.focus(); }, 50);
    itemSuggest($('aCode'), () => { const q = $('aQ'); if (q) { q.focus(); q.select(); } });   // 🔎 코드 일부 → 목록에서 고름 (v0.8.200)
    $('aOk').onclick = () => {
      const it = exactItem($('aCode').value); if (!it) return toast('목록에 없는 코드입니다', 'bad');
      const q = Math.max(1, Math.floor(Number($('aQ').value) || 1)), p = $('aP').value ? R2($('aP').value) : it.p;
      const ex = lines.find(l => l.c === it.c);
      if (ex) { ex.q += q; ex.pq = (ex.pq || 0) + q; ex.ok = true; } else lines.push({ c: it.c, d: it.d, q, pq: q, ok: true, p, lp: it.p, t: typeOfItem(S, it), note: '사무실 추가' });
      dirty = true; closeModal(); sumNow(); paint();
    };
  };
  const saveLines = async (patch) => {
    const doc = orderDoc(Object.assign({}, o, { updatedAt: new Date().toISOString() }, patch || {}), lines, o.disc);
    await S.DB.batch([{ op: 'set', col: 'orders', id: o.id, data: doc }, { op: 'set', col: 'orderLines', id: o.id, data: { sm: o.sm, lines } }]);
  };
  if ($('mPick')) $('mPick').onclick = async () => {
    busy(true);
    try { const now = new Date().toISOString(); await S.DB.update('orders', o.id, { st: 'pick', picker: S.user.email, pickerName: S.user.name || S.user.email.split('@')[0], pickAt: now, pickBy: S.user.email, updatedAt: now }); o.st = 'pick'; o.pickAt = now; o.picker = S.user.email; o.pickerName = S.user.name || ''; manage(o, lines); printPicking(o, lines); }
    catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  if ($('mSend')) $('mSend').onclick = async () => { if (!(await confirmBox(o.store + ' — ' + lines.length + '줄 · ' + money(o.amt) + ' 주문을 들어온 주문으로 보낼까요?', '보내기'))) return; busy(true); try { const sx = await soStamp(o); await S.DB.update('orders', o.id, Object.assign(sendStamp(o), sx || {})); toast('보냈습니다 📤' + (sx ? ' ' + sx.no : ''), 'good'); Router.markSaved('order'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mAssign')) $('mAssign').onclick = () => assignPicker([o], () => goOrder(o.id));
  if ($('mReassign')) $('mReassign').onclick = () => assignPicker([o], () => goOrder(o.id));
  if ($('mIMemo')) $('mIMemo').onclick = () => imemoForm(o);
  /* 🏷 픽킹 중 · 검수 대기에서 종류별 할인 % 바꾸기 — 이 주문만 (가게 기본은 그대로 · 위 "가게 기본으로" 단추로 따로) · 지금 픽킹 수량도 같이 저장 (2026-11-12 관리자) */
  if ($('mDisc')) $('mDisc').onclick = () => {
    const T = [...new Set(lines.map(l => l.t || DT()))], ad = acctDisc(acctOf(o.acct));
    openModal('<h2>🏷 ' + bi('할인 바꾸기', 'Change discount') + ' — ' + esc(o.store) + '</h2><div class="muted">' + bt('이 주문에만 적용됩니다. 인보이스를 확정할 때 이 할인으로 나갑니다.', 'This order only. The invoice is issued with this discount.') + '</div>' +
      T.map(t => '<div class="fg" style="display:flex;align-items:center;gap:8px;margin-top:8px"><label style="flex:1;margin:0"><b>' + esc(t) + '</b> ' + esc(typeName(t)) + (ad[t] ? ' <span class="muted">(' + bt('가게 기본', 'store default') + ' ' + ad[t] + '%)</span>' : '') + '</label><input type="number" inputmode="decimal" min="0" max="100" step="0.5" data-mdc="' + esc(t) + '" value="' + ((o.disc || {})[t] || '') + '" placeholder="0" style="width:90px;text-align:right"> %</div>').join('') +
      '<div class="btns"><button class="b-ghost" id="mdX">' + bi('닫기', 'Close') + '</button><button class="b-blue" id="mdOk">' + bi('저장', 'Save') + '</button></div>');
    $('mdX').onclick = closeModal;
    $('mdOk').onclick = async () => {
      const d = Object.assign({}, o.disc || {}); document.querySelectorAll('[data-mdc]').forEach(x => { const v = Math.max(0, Math.min(100, Number(x.value) || 0)); if (v) d[x.dataset.mdc] = v; else delete d[x.dataset.mdc]; });
      closeModal(); busy(true);
      try { o.disc = d; await saveLines({ disc: d }); toast('🏷 ' + bt('할인 저장', 'Discount saved'), 'good'); manage(o, lines); }
      catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  document.querySelectorAll('[data-mie]').forEach(b => b.onclick = async () => { const x = await S.DB.get('invoices', b.dataset.mie); if (!x) return toast(bt('인보이스를 찾지 못했습니다', 'Invoice not found'), 'bad'); const IE = await import('./invedit.js'); IE.setState(S); IE.editInvoice(x, () => { closeModal(); goOrder(o.id); }); });   /* ✏️ 발행된 인보이스 직접 고치기 (v0.8.189) */
  if ($('mAch')) $('mAch').onclick = async () => { const A = await import('./ach.js'); const L = (await Promise.all(o.invs.map(no => S.DB.get('invoices', no)))).filter(Boolean); A.startFor(L, o.id); };
  if ($('mPickDone')) $('mPickDone').onclick = async () => {
    const pk = await choosePicker(o); if (!pk) return;   // 👷 실제로 피킹한 사람 (2026-11-12 오피스: "피킹 끝난 후 피킹한 사람을 선택할 수 있게")
    const b = lines.filter(l => (l.pq || 0) < l.q), n = b.reduce((a, l) => a + l.q - (l.pq || 0), 0), u = lines.filter(l => !l.ok).length;
    if (!(await confirmBox('작업 완료로 넘길까요? (검수 대기)' + (u ? '\n○ 두드리지 않은 줄 ' + u + '개는 주문 수량대로 담은 것으로 처리합니다.' : '') + (b.length ? '\n⏳ 부족(백오더) ' + b.length + '줄 · ' + n + '개는 사무실이 확인 뒤 백오더로 남깁니다.' : '\n✓ 전부 픽킹됨') + '\n사무실 확인 → 인보이스 발행으로 넘어갑니다.', '픽킹 완료'))) return;
    busy(true); try { await saveLines({ st: 'picked', pickDoneAt: new Date().toISOString(), pickDoneBy: S.user.email, pickedBy: pk.email, pickedByName: pk.name }); dirty = false; toast('✅ 작업 완료 — 검수 대기 · Ready for Review', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
  };
  if ($('mRepick')) $('mRepick').onclick = async () => { busy(true); try { await saveLines({ st: 'pick' }); toast('출고 작업으로 되돌림 · Back to Fulfillment'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  /* ❓ 자세한 확인 요청 (질문 적기) — 세일즈맨 앱에 소리 · 띠, 이메일 · 구글 챗 (notify.js) */
  if ($('mCfReq')) $('mCfReq').onclick = async () => { const N = await import('./notify.js'); N.askForm(o, 'cfreq', () => goOrder(o.id)); };
  if ($('mAsk')) $('mAsk').onclick = async () => { const N = await import('./notify.js'); N.askForm(o, 'ask'); };
  if ($('mChat')) $('mChat').onclick = async () => { const N = await import('./notify.js'); window.open(N.chatUrl(), '_blank', 'noopener'); };
  if ($('mIssueOk')) $('mIssueOk').onclick = async () => { busy(true); try { await S.DB.update('orders', o.id, { cfIssueOpen: false, cfIssueDoneAt: new Date().toISOString(), cfIssueDoneBy: S.user.email }); toast('✅ ' + bt('해결로 표시했습니다', 'Marked resolved'), 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mShip')) $('mShip').onclick = () => toCounter(o, () => shipModal(o));
  if ($('mShipOld')) $('mShipOld').onclick = () => shipModal(o);
  if ($('mDlv')) $('mDlv').onclick = () => dlvModal(o);
  if ($('mDlvEdit')) $('mDlvEdit').onclick = () => dlvModal(o);
  if ($('mDlvDone')) $('mDlvDone').onclick = () => dlvDone(o);
  if ($('mPickup')) $('mPickup').onclick = () => { Router.go('order'); setTimeout(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'packed' })), 0); };
  if ($('mCfOk')) $('mCfOk').onclick = async () => { if (!(await confirmBox(bt('세일즈맨 확인 완료로 바꿀까요? (전화 · 문자로 확인한 경우)', 'Mark as confirmed by the salesman?'), '👍'))) return; busy(true); try { const now = new Date().toISOString(); await S.DB.update('orders', o.id, { cfReq: true, cfOk: true, cfAt: now, cfBy: S.user.email, cfHow: 'staff' }); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mTrk')) $('mTrk').onclick = () => Router.go('track', o.no);   // → Shipping History 에서 이 주문 찾기 (track.js)
  if ($('mUnship')) $('mUnship').onclick = async () => { const back = o.st === 'shipped' && o.pickupId ? 'packed' : o.st === 'shipped' && o.dlvAt ? 'dlv' : 'done'; if (!(await confirmBox(back === 'packed' ? bt('UPS 인계를 취소할까요? (픽업 대기로 돌아감)', 'Undo handover? (back to awaiting pickup)') : bt('포장 · 출고를 취소할까요? (포장 대기로 돌아감)', 'Undo packing/shipping? (back to packing)'), bt('되돌리기', 'Undo')))) return; busy(true); try { await S.DB.update('orders', o.id, Object.assign({ st: back, updatedAt: new Date().toISOString() }, back === 'packed' ? { pickupId: '' } : {})); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mPickPrint')) $('mPickPrint').onclick = () => printPicking(o, lines);
  document.body.classList.toggle('pkkits', pickKits());
  if ($('mPkKits')) $('mPkKits').onclick = () => { const on = !pickKits(); try { localStorage.setItem(PKITS_KEY, on ? '1' : '0'); } catch (e) {} document.body.classList.toggle('pkkits', on); const b = $('mPkKits'); b.classList.toggle('on', on); b.innerHTML = '🧩 ' + (on ? bi('구성품 숨기기', 'Hide components') : bi('구성품 보기', 'Show components')); };   // 화면을 다시 그리지 않음 (저장 안 한 픽킹 수량이 안 날아가게)
  if ($('mPickSave')) $('mPickSave').onclick = async () => { busy(true); try { await saveLines(); dirty = false; toast('픽킹 저장', 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mUnpick')) $('mUnpick').onclick = async () => { busy(true); try { await saveLines({ st: 'sent' }); toast('들어온 주문으로 되돌림'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mStoreI')) $('mStoreI').onclick = () => storeSheet(o.acct);
  /* 🖼 이 주문으로 새 디스플레이가 나가야 하면 — 가게 · 요청한 디스플레이(o.req) 를 채워 디스플레이 출고 목록에 */
  if ($('mDisp')) { import('./displays.js').then(D => { D.countForOrder(o.id).then(n => { if (n && $('mDispN')) $('mDispN').textContent = '(' + n + ')'; }); $('mDisp').onclick = () => D.form({ acct: o.acct || '', store: o.store, sm: o.sm, req: o.req || null, reqNote: o.reqNote || null, orderId: o.id, orderNo: o.no, after: () => { D.countForOrder(o.id).then(n => { if ($('mDispN')) $('mDispN').textContent = n ? '(' + n + ')' : ''; }); } }); }); }
  if ($('mStoreChg')) $('mStoreChg').onclick = () => { if (dirty && !confirm('픽킹 결과를 저장하지 않았습니다. 그래도 가게를 바꿀까요? (픽킹 입력은 사라집니다)')) return; changeStore(o, () => goOrder(o.id)); };
  if ($('mEdit')) $('mEdit').onclick = () => { if (dirty && !confirm('픽킹 결과를 저장하지 않았습니다. 그래도 수정 화면으로 갈까요?')) return; openEditor(o, null, lines); };
  if ($('mCsv')) $('mCsv').onclick = () => csv(o, lines);
  if ($('mCancel')) $('mCancel').onclick = () => cancelAsk(o);
  if ($('mInvPrint')) $('mInvPrint').onclick = async () => { busy(true); try { const invs = []; for (const n of (o.invs || [])) { const x = await getInvoice(S, n); if (x) invs.push(x); } if (invs.length) await printInvoices(invs, acctOf(o.acct)); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mInv')) $('mInv').onclick = () => confirmInvoice(o, lines);
  if ($('mVoid')) $('mVoid').onclick = async () => { busy(true); const invs = []; try { for (const n of (o.invs || [])) { const x = await getInvoice(S, n); if (x) invs.push(x); } } catch (e) {} busy(false); voidModal(invs, () => goOrder(o.id)); };
}

/* ============================================================
 *  🏬 가게 바꾸기 — 주문을 보낸 뒤 · 픽킹 중 · 인보이스 발행 뒤에도
 *    ① 다른 거래처(계정)로 옮기기  ② 이 주문 · 인보이스에 찍힐 이름 · 주소만 고치기(거래처 기록은 그대로)
 *    ③ 거래처 기록 자체 고치기(모든 주문에 적용 — 거래처 화면)
 *  바꾸기 전에 꼭 "전 → 후" 확인 팝업. 주문 · 주문 줄 · 인보이스 · 백오더를 함께 바꾸고 변경 기록(storeChg)을 남김
 *  세일즈맨: 자기 주문이 저장 · 접수 상태일 때만 ① (담당은 그대로)
 * ============================================================ */
export function changeStore(o, done) {
  const staff = S.role !== 'salesman';
  const cur = acctOf(o.acct), invN = (o.invs || []).length;
  const base = o.shipTo || (cur ? { store: o.store, addr: cur.addr || '', city: cur.city || '', state: cur.state || '', zip: cur.zip || '' } : { store: o.store, addr: '', city: '', state: '', zip: '' });
  let tgt = null, mode = 'acct';
  const curTxt = '<b>' + esc(o.store) + '</b> <span class="muted">' + esc(o.acct || '신규') + ' · ' + esc(o.sm) + '</span>' + (cur || o.shipTo ? '<div class="muted">' + esc([base.addr, base.city, base.state, base.zip].filter(Boolean).join(', ')) + '</div>' : '');
  openModal('<h2>🏬 ' + bi('가게 바꾸기', 'Change store') + ' — ' + esc(o.no) + '</h2><div class="sumbox">지금 · now: ' + curTxt + '</div>' +
    (invN ? '<div class="alert a-amb">🧾 인보이스 ' + invN + '장(' + esc(o.invs.join(', ')) + ')도 같이 바뀝니다.</div>' : '') +
    (staff ? '<div class="seg" style="margin-top:8px"><button class="on" data-cm="acct">🔁 ' + bi('다른 거래처로', 'Other account') + '</button><button data-cm="name">✏️ ' + bi('이름 · 주소만', 'Name · address') + '</button></div>' : '') +
    '<div id="csBody"></div><div class="btns"><button class="b-ghost" id="csX">취소</button><button class="b-blue" id="csOk" disabled>바꾸기…</button></div>');
  const body = () => {
    if (mode === 'acct') {
      $('csBody').innerHTML = '<div class="fg" style="margin-top:8px"><label>' + bi('새 거래처 찾기', 'Find account') + '</label><input id="csQ" placeholder="가게 이름 · 계정코드 · 도시 · 전화" autocomplete="off"></div><div id="csHits"></div><div id="csSel"></div>' +
        (staff ? '<div class="hint">거래처 기록 자체(주소 · 전화 · 담당)를 고치려면: <a href="#" id="csEditAcct">🏬 이 거래처 정보 고치기</a> (이 가게의 모든 주문에 적용)</div>' : '');
      const hits = () => { const q = $('csQ').value; const L = searchAccounts(S.accounts, q, 8).filter(a => a.acct !== o.acct); $('csHits').innerHTML = L.map(a => '<div class="pr tap" data-cs="' + esc(a.acct) + '"><div class="ct"><b>' + esc(a.store) + '</b><small>' + esc(a.acct) + ' · ' + esc([a.city, a.state].filter(Boolean).join(', ')) + ' · ' + esc(a.sm || '—') + '</small></div></div>').join('') || (q ? '<div class="none">없음</div>' : '');
        $('csHits').querySelectorAll('[data-cs]').forEach(el => el.onclick = () => { tgt = acctOf(el.dataset.cs); $('csHits').innerHTML = ''; $('csQ').value = '';
          const smDiff = staff && tgt.sm && String(tgt.sm).toUpperCase() !== String(o.sm).toUpperCase();
          $('csSel').innerHTML = '<div class="sumbox">→ 새 거래처: <b>' + esc(tgt.store) + '</b> <span class="muted">' + esc(tgt.acct) + ' · 담당 ' + esc(tgt.sm || '—') + '</span><div class="muted">' + esc([tgt.addr, tgt.city, tgt.state, tgt.zip].filter(Boolean).join(', ')) + '</div></div>' +
            (smDiff ? '<label class="pick" id="csSm" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>담당 세일즈맨도 ' + esc(tgt.sm) + ' 로 바꾸기</b><small>끄면 이 주문은 ' + esc(o.sm) + ' 주문으로 남습니다 (커미션 · 매출 집계 기준)</small></span></label>' : '');
          if ($('csSm')) $('csSm').onclick = () => $('csSm').classList.toggle('on');
          $('csOk').disabled = false; }); };
      $('csQ').oninput = debounce(hits, 120); setTimeout(() => { if ($('csQ')) $('csQ').focus(); }, 50);
      if ($('csEditAcct')) $('csEditAcct').onclick = e => { e.preventDefault(); if (!cur) return toast('계정코드가 없는 주문입니다', 'bad'); closeModal(); storeForm(cur); };
    } else {
      const f = (id, lab, v) => '<div class="fg"><label>' + lab + '</label><input id="' + id + '" value="' + esc(v || '') + '"></div>';
      $('csBody').innerHTML = '<div class="muted" style="margin-top:8px">이 주문과 인보이스에 찍히는 이름 · 주소만 바뀝니다. 거래처 기록과 다른 주문은 그대로입니다.</div>' + f('csN', '가게 이름 · Store name', base.store) + f('csA', '주소 · Address', base.addr) + '<div class="two">' + f('csC', 'City', base.city) + f('csS', 'State', base.state) + '</div>' + f('csZ', 'ZIP', base.zip) +
        (o.shipTo ? '<div class="btns" style="justify-content:flex-start"><button class="b-ghost b-sm" id="csReset">↩️ 거래처 기록대로 되돌리기</button></div>' : '');
      $('csOk').disabled = false;
      if ($('csReset')) $('csReset').onclick = () => apply({ reset: true });
    }
  };
  document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { mode = b.dataset.cm; tgt = null; $('csOk').disabled = true; document.querySelectorAll('[data-cm]').forEach(x => x.classList.toggle('on', x === b)); body(); });
  $('csX').onclick = closeModal;
  const apply = async (opt) => {
    opt = opt || {};
    let patch, after;
    if (opt.reset) { patch = { shipTo: null, store: cur ? cur.store : o.store }; after = (cur ? cur.store : o.store) + ' (거래처 기록대로)'; }
    else if (mode === 'acct') {
      if (!tgt) return toast('새 거래처를 고르세요', 'bad');
      const smTo = $('csSm') && $('csSm').classList.contains('on') ? String(tgt.sm).toUpperCase() : o.sm;
      patch = { acct: tgt.acct, store: tgt.store, shipTo: null, sm: smTo };
      after = tgt.store + ' (' + tgt.acct + ')' + (smTo !== o.sm ? ' · 담당 ' + o.sm + ' → ' + smTo : '');
    } else {
      const v = { store: $('csN').value.trim(), addr: $('csA').value.trim(), city: $('csC').value.trim(), state: $('csS').value.trim().toUpperCase(), zip: $('csZ').value.trim() };
      if (!v.store) return toast('가게 이름을 넣어 주세요', 'bad');
      patch = { store: v.store, shipTo: v };
      after = v.store + ' · ' + [v.addr, v.city, v.state, v.zip].filter(Boolean).join(', ') + ' (이 주문만)';
    }
    if (!(await confirmBox('가게를 바꿀까요? / Change the store?\n\n전 · before: ' + o.store + ' (' + (o.acct || '신규') + ')\n후 · after: ' + after + (invN ? '\n\n🧾 인보이스 ' + invN + '장도 같이 바뀝니다: ' + o.invs.join(', ') : '') + (mode === 'acct' && !opt.reset ? '\n할인율은 이 주문에 넣은 그대로 둡니다.' : ''), '바꾸기'))) return;
    closeModal(); busy(true);
    try {
      const now = new Date().toISOString(), smChg = patch.sm && patch.sm !== o.sm;
      const hist = (o.storeChg || []).concat([{ at: now, by: S.user.email, from: { acct: o.acct || '', store: o.store, sm: o.sm }, to: { acct: patch.acct || o.acct || '', store: patch.store, sm: patch.sm || o.sm }, kind: opt.reset ? 'reset' : mode }]);
      const op = Object.assign({}, patch, { storeChg: hist, updatedAt: now });
      const ops = [{ op: 'update', col: 'orders', id: o.id, data: op }];
      if (smChg) ops.push({ op: 'update', col: 'orderLines', id: o.id, data: { sm: patch.sm } });
      const invs = [];
      if (staff) {
        for (const n of (o.invs || [])) { const x = await getInvoice(S, n); if (!x) continue; invs.push(x); const ip = { store: patch.store, shipTo: patch.shipTo === undefined ? (x.shipTo || null) : patch.shipTo, updatedAt: now }; if (patch.acct) ip.acct = patch.acct; if (smChg) ip.sm = patch.sm; ops.push({ op: 'update', col: 'invoices', id: x.id || n, data: ip }); }
        if (o.bo) { const b = await S.DB.get('backorders', o.id).catch(() => null); if (b) ops.push({ op: 'update', col: 'backorders', id: o.id, data: Object.assign({ store: patch.store }, patch.acct ? { acct: patch.acct } : {}, smChg ? { sm: patch.sm } : {}) }); }
      }
      await S.DB.batch(ops);
      if (invs.length) { dropInvCache(); if (smChg) { await bumpSalesM(S, invs, -1); await bumpSalesM(S, invs.map(x => Object.assign({}, x, { sm: patch.sm })), 1); } }
      toast('🏬 바꿨습니다 → ' + patch.store, 'good');
      if (done) done();
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  $('csOk').onclick = () => apply();
  body();
}

/* ============================================================
 *  🚚 포장 · 출고 — UPS 라벨 (apps-script/UPS.gs 가 shipq/{주문ID} 를 1분마다 처리) 또는 다른 운송 · 직접 입력
 *   shipq = { orderId, no, st: wait → working → done | error · void → voided, svc, boxes:[{w}], to:{…}, ref, labels:[{trk,img}], track, charge, shipId }
 * ============================================================ */
export function upsTo(o) {
  const a = acctOf(o.acct) || {}, t = o.shipTo || {}, T = o.shipTo ? t : a;
  return { name: t.store || o.store || a.store || '', attn: t.store || o.store || '', phone: a.tel || '', addr1: T.addr || '', addr2: T.addr2 || '', city: T.city || '', state: T.state || '', zip: T.zip || '' };
}
export const adrKey = a => String((a.addr1 || a.addr || '') + ' ' + String(a.zip || '').substring(0, 5)).toUpperCase().replace(/\bSTREET\b/g, 'ST').replace(/\bAVENUE\b/g, 'AVE').replace(/\bROAD\b/g, 'RD').replace(/\bBOULEVARD\b/g, 'BLVD').replace(/\bDRIVE\b/g, 'DR').replace(/\bSUITE\b/g, 'STE').replace(/[^A-Z0-9]/g, '');
/** 📍 받는 주소 저장 — toAcct: 거래처 기록(모든 주문에 적용) · 아니면 이 주문(과 인보이스)만 */
export async function saveShipAddr(o, v, toAcct) {
  const now = new Date().toISOString(), ops = [];
  let shipTo = null;
  if (toAcct) {
    const acc = acctOf(o.acct); if (!acc) throw new Error('계정코드가 없는 주문입니다 — "이 주문만" 을 쓰세요');
    await S.DB.update('accounts', acc.acct, { addr: v.addr1, addr2: v.addr2 || '', city: v.city, state: v.state, zip: v.zip, updatedAt: now, addrBy: S.user.email });
    await bumpAccountsVer();
  } else shipTo = { store: v.name || o.store, addr: v.addr1, addr2: v.addr2 || '', city: v.city, state: v.state, zip: v.zip };
  ops.push({ op: 'update', col: 'orders', id: o.id, data: { shipTo, updatedAt: now } });
  for (const n of (o.invs || [])) ops.push({ op: 'update', col: 'invoices', id: n, data: { shipTo, updatedAt: now } });
  await S.DB.batch(ops); if ((o.invs || []).length) dropInvCache();
  o.shipTo = shipTo;
}
/** UPS 주소 확인 요청 → UPS.gs 가 1분 안에 shipq/{id} 에 결과를 적음 (st: av → avdone · averr) */
export async function upsValidate(to, orderId) {
  const id = 'AV-' + (orderId || 'x') + '-' + Date.now().toString(36);
  await S.DB.set('shipq', id, { st: 'av', kind: 'av', to, orderId: orderId || '', by: S.user.email, createdAt: new Date().toISOString() });
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 3000)); let x = null; try { x = await S.DB.get('shipq', id); } catch (e) {} if (x && x.st === 'avdone') return Object.assign({}, x, { st: 'done' }); if (x && x.st === 'averr') return { st: 'error', err: x.err }; if (!$('upAvBox')) return null; }
  return { st: 'error', err: '응답이 없습니다 — UPS 스크립트(UPS.gs)를 새 버전으로 바꾸고 setup 을 실행했는지 확인하세요' };
}
export function printLabels(q) {
  printOpen('<style>@page{size:4in 6in;margin:0}.lbl{width:4in;height:6in;display:flex;align-items:center;justify-content:center;overflow:hidden;page-break-after:always;break-after:page}.lbl img{width:6in;height:4in;transform:rotate(90deg)}</style>' +
    (q.labels || []).map(l => '<div class="lbl"><img src="data:image/gif;base64,' + l.img + '" alt="' + esc(l.trk) + '"></div>').join(''));
}
/** 🚚 출고 창 — ship.js (UPS 프로그램처럼 자세히) */
export function shipModal(o, after) { return Ship.shipModal(o, after); }
/** 🚚 출고 — 인보이스 뒤 UPS 출고는 🏪 Shipping UPS 카운터 하나로 (v0.8.209 · 2026-11-12 관리자: "인보이스 발행 뒤 겹치는 UPS 단계를 조의 화면으로 통합")
 *   카운터는 거래처 주소로만 라벨을 만들므로, 다른 주소(shipTo)로 가는 주문 · 이미 라벨 요청이 있는 주문은 예전 출고 창 (취소 · 다시 인쇄) */
async function toCounter(o, old) {
  if (!o || o.shipTo || !o.acct) return old();
  let q = null; try { q = await S.DB.get('shipq', o.id); } catch (e) {}
  if (q && q.st !== 'voided') return old();
  const M = await import('./balcao.js'); M.abrirPedido(o);
}

/* ============================================================
 *  🚚 UPS 출고 탭 — 인보이스가 나와 포장을 기다리는 주문을 한 화면에서 바로 UPS 라벨로
 *    · 라벨 대기 (인보이스 발행 · 포장 대기) — 주소 확인 · 라벨 만들기 · 인쇄 · 출고 완료
 *    · 최근 출고 (3일) — 트래킹 · 라벨 다시 인쇄
 *    · 주소 차이 — UPS 출고 기록(다른 프로그램 포함)의 받는 주소가 거래처 주소와 다르면 바로 고치기
 * ============================================================ */
const qTag = q => !q ? '' : q.st === 'done' ? ' <span class="tag t-k">🏷 라벨 ' + (q.labels || []).length + '</span>' : q.st === 'wait' || q.st === 'working' ? ' <span class="tag t-b">⏳ 라벨 만드는 중</span>' : q.st === 'error' ? ' <span class="tag t-r">UPS 오류</span>' : q.st === 'voided' ? ' <span class="tag t-g">라벨 취소됨</span>' : '';
async function upsPage(LF, head) {
  $('page').innerHTML = head + '<div class="load">읽는 중…</div>';
  const t = today();
  let wait = [], recent = [], logs = [], qs = {}, err = '';
  try {
    [wait, recent] = await Promise.all([S.DB.list('orders', { where: [['st', '==', 'done']] }), S.DB.list('orders', { where: [['d', '>=', addD(t, -45)]] })]);
    recent = recent.filter(o => o.st === 'shipped' && o.shipAt && localDay(o.shipAt) >= addD(t, -2));
    if (LF.sm) { wait = wait.filter(o => o.sm === LF.sm); recent = recent.filter(o => o.sm === LF.sm); }
    await Promise.all(wait.concat(recent).map(o => S.DB.get('shipq', o.id).then(q => { if (q) qs[o.id] = q; }).catch(() => {})));
    try { logs = await S.DB.list('upsLog', { where: [['d', '>=', addD(t, -30)]] }); } catch (e) {}
  } catch (e) { err = String(e.code || e.message); }
  if (!$('page')) return;
  wait = sortBy(wait, o => o.doneAt || o.updatedAt || '');
  recent = sortBy(recent, o => o.shipAt || '', true);
  const adr = o => { const a = upsTo(o); return [a.addr1, a.city, a.state, a.zip].filter(Boolean).join(', '); };
  const row = (o, isWait) => { const q = qs[o.id], a = upsTo(o), bad = !a.addr1 || !a.zip;
    return '<div class="pr"><div class="ct tap" data-uo="' + esc(o.id) + '"><b>' + esc(o.store) + qTag(q) + (o.shipTo ? ' <span class="tag t-c">' + bt('다른 주소', 'Other address') + '</span>' : '') + '</b><small>' + esc((o.invs || []).join(', ') || o.no) + ' · ' + esc(o.sm) + ' · ' + money(o.amt) + '</small><small class="' + (bad ? 'warn' : '') + '">📍 ' + esc(adr(o) || '주소 없음 · no address') + '</small>' + (!isWait && o.track ? '<small>🚚 ' + esc(o.track) + (o.deliveredAt ? ' · ✅ ' + esc(md(o.deliveredAt)) : '') + '</small>' : '') + '</div>' +
      (isWait ? '<button class="b-green b-sm" data-us="' + esc(o.id) + '">🚚 ' + bi('출고', 'Ship') + '</button>' : q && q.st === 'done' ? '<button class="b-ghost b-sm" data-ul="' + esc(o.id) + '">🖨 ' + bi('라벨', 'Label') + '</button>' : '') + '</div>'; };
  let h = err ? '<div class="alert a-red">' + esc(err) + '</div>' : '';
  h += '<div class="card"><h2>🚚 ' + bi('라벨 대기 — 인보이스 발행 · 포장 대기', 'To ship — invoiced, awaiting packing') + ' ' + wait.length + '건</h2><div class="muted">' + bi('<b>🚚 출고</b>를 누르면 주소 확인 → UPS 라벨 → 인쇄 → 출고 완료까지 한 창에서 합니다. 주소는 그 창에서 이 주문만 바꾸거나 거래처 주소를 고칠 수 있습니다.', 'Tap Ship to check the address, create the UPS label, print and mark shipped.') + '</div>' +
    (wait.length ? wait.map(o => row(o, true)).join('') : '<div class="none">' + bt('포장 대기 주문이 없습니다', 'Nothing waiting') + '</div>') + '</div>';
  h += '<div class="card"><h2>📬 ' + bi('최근 출고 (3일)', 'Recently shipped (3 days)') + ' ' + recent.length + '건</h2>' + (recent.length ? recent.map(o => row(o, false)).join('') : '<div class="none">' + bt('없음', 'None') + '</div>') + '</div>';
  h += '<div class="btns" style="justify-content:flex-start"><button class="b-ghost" id="upTrk">📦 Shipping History</button></div><div id="upDiff"></div>';
  $('page').innerHTML = head + h;
  bindListHead(LF, head);
  const all = wait.concat(recent), byId = id => all.find(o => o.id === id);
  document.querySelectorAll('[data-uo]').forEach(el => el.onclick = () => Router.go('order', el.dataset.uo));
  document.querySelectorAll('[data-us]').forEach(b => b.onclick = () => { const o = byId(b.dataset.us); toCounter(o, () => shipModal(o, () => upsPage(LF, head))); });
  document.querySelectorAll('[data-ul]').forEach(b => b.onclick = () => printLabels(qs[b.dataset.ul]));
  if ($('upTrk')) $('upTrk').onclick = () => Router.go('track');
  addrDiffs(logs, () => upsPage(LF, head));
}
function bindListHead(LF, head) {
  document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') LF.list = false; else LF.st = b.dataset.lf; Router.go('order'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  document.querySelectorAll('[data-lg]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('theone:stage', { detail: b.dataset.lg })));
  if ($('lfSm')) $('lfSm').onchange = () => { LF.sm = $('lfSm').value; pageLists(LF, head); };
  fillStrip();
}
/** 📮 UPS 기록 주소 ≠ 거래처 주소 — UPS 출고 기록(직원 앱 등에서 찍은 것 포함)에 적힌 받는 주소가 거래처 기록과 다르면 한 번에 고치기 */
function addrDiffs(logs, refresh) {
  const box = $('upDiff'); if (!box) return;
  const by = {};
  logs.forEach(l => { if (!l.acct || !l.addr1 || l.addrOk) return; const a = acctOf(l.acct); if (!a || adrKey(l) === adrKey(a)) return; if (!by[l.acct] || (l.d || '') > (by[l.acct].d || '')) by[l.acct] = l; });
  const L = Object.values(by); if (!L.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="card" style="border:2px solid #fde68a"><h2>📮 ' + bi('UPS 기록과 거래처 주소가 다릅니다', 'UPS address differs from customer record') + ' ' + L.length + '</h2><div class="muted">' + bi('UPS 로 실제 보낸 주소(다른 프로그램에서 찍은 라벨 포함)와 앱의 거래처 주소가 다른 가게입니다. 맞는 쪽을 고르세요.', 'Shipments on the UPS account went to a different address than the customer record.') + '</div>' +
    L.map(l => { const a = acctOf(l.acct); return '<div class="sumbox" style="font-size:13px"><b>' + esc(a.store) + '</b> <span class="muted">' + esc(a.acct) + '</span><br>UPS (' + esc(md(l.d)) + '): <b>' + esc([l.addr1, l.addr2, l.city, l.state, l.zip].filter(Boolean).join(', ')) + '</b><br>' + bt('거래처', 'Record') + ': ' + esc([a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ') || '—') +
      '<div class="btns" style="flex-wrap:wrap"><button class="b-blue b-sm" data-adu="' + esc(l.acct) + '">🏬 ' + bi('거래처 주소를 UPS 주소로', 'Use the UPS address') + '</button><button class="b-ghost b-sm" data-adn="' + esc(l.acct) + '">' + bi('거래처 주소가 맞음', 'Record is right') + '</button></div></div>'; }).join('') + '</div>';
  const mark = async acct => { const ops = logs.filter(l => l.acct === acct && l.trk).map(l => ({ op: 'update', col: 'upsLog', id: String(l.id || l.trk.split(' ')[0]), data: { addrOk: true } })); if (ops.length) await S.DB.batch(ops); };
  box.querySelectorAll('[data-adu]').forEach(b => b.onclick = async () => { const l = by[b.dataset.adu], a = acctOf(l.acct);
    if (!(await confirmBox(a.store + ' 거래처 주소를 바꿀까요?\n전: ' + [a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ') + '\n후: ' + [l.addr1, l.addr2, l.city, l.state, l.zip].filter(Boolean).join(', '), '바꾸기'))) return;
    busy(true); try { await S.DB.update('accounts', a.acct, { addr: String(l.addr1).toUpperCase(), addr2: String(l.addr2 || '').toUpperCase(), city: String(l.city).toUpperCase(), state: String(l.state).toUpperCase(), zip: String(l.zip).substring(0, 5), updatedAt: new Date().toISOString(), addrBy: 'UPS ' + S.user.email }); await bumpAccountsVer(); await mark(l.acct); toast('🏬 ' + a.store + ' — ' + bt('주소 바꿈', 'address updated'), 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); refresh(); });
  box.querySelectorAll('[data-adn]').forEach(b => b.onclick = async () => { busy(true); try { await mark(b.dataset.adn); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); refresh(); });
}

async function printPicking(o, lines) {
  try { await loadCatalog(S); } catch (e) {}   // 세트 구성품 · 단종 상품 종류 바로잡기 (v0.8.196)
  printOpen(pickingHtml(o, lines));
}
/* ---------- 🧭 픽킹 순서 규칙 (2026-11-12 관리자: "픽킹하는 사람이 헷갈리지 않게 — 통로별로(통로 순서 = 동선), 같은 종류끼리 ABC 1234, CVEG 01~16 다음에 CVNG") · v0.8.190 ----------
 *   ① 📍 통로 순서 = 걷는 순서: 00 → 01A → 01B → 02A … → 20A → WAREHOUSE01 … → 위치 없음은 맨 끝
 *   ② 같은 통로 안에서는 코드의 앞 글자(종류)끼리 ABC 순: AHG → CVEG → CVNG …
 *   ③ 같은 종류 안에서는 번호 순: CVEG01 → CVEG02 … → CVEG16 (종류가 섞이지 않음) */
const COLLP = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/** 코드 → [종류(뒤 숫자 뺀 앞부분), 번호] — CVEG01 → ['CVEG', 1] · 18KCNG06 → ['18KCNG', 6] · AHG100 → ['AHG', 100] */
export function codeFam(c) { const m = String(c || '').toUpperCase().match(/^(.*?)(\d+)$/); return m && m[1] ? [m[1], Number(m[2])] : [String(c || '').toUpperCase(), -1]; }
/** 🧩 세트 · 인서트 오더 줄 — 구성품이 있거나 분류가 SET ORDER 묶음(prefixRank ≤ 1) → 픽킹 리스트 맨 위 한 묶음 (2026-11-12 관리자) */
const isSetLine = l => { if (l.kit && l.kit.length) return true; const C = catalog(), it = C && C.byCode[l.c]; return !!(it && prefixRank(it.l1 || it.g || '') <= 1); };
function pickGroup(l) { if (isSetLine(l)) return { set: true, aisle: 'SET', loc: locOf(l.c), key: '\u0000SET', fam: codeFam(l.c)[0] }; const loc = locOf(l.c), a = loc ? aisleOf(loc) : ''; return { aisle: a, loc, key: a || '\uffff', fam: codeFam(l.c)[0] }; }
/** 🧩 픽킹 때 세트 구성품 보기 — 기본은 숨김 (세트 한 줄만) · 필요하면 주문 화면의 "🧩 구성품 보기" 를 켬 (이 기기에 기억) */
const PKITS_KEY = 'theone.pick.kits';
export const pickKits = () => { try { return localStorage.getItem(PKITS_KEY) === '1'; } catch (e) { return false; } };
export function pickSortGrouped(a, b) {
  const A = pickGroup(a), B = pickGroup(b), fa = codeFam(a.c), fb = codeFam(b.c);
  if (!!A.set !== !!B.set) return A.set ? -1 : 1;   // 🧩 세트 · 인서트 오더는 늘 맨 위
  if (!A.aisle !== !B.aisle) return A.aisle ? -1 : 1;   // 위치 없는 아이템은 맨 끝
  return COLLP.compare(A.aisle, B.aisle) || COLLP.compare(fa[0], fb[0]) || (fa[1] - fb[1]) || COLLP.compare(a.c, b.c);
}
const aisleLabel = g => g.set ? '🧩 ' + bt('세트 · 인서트 오더', 'SET · INSERT ORDER') : g.aisle ? '📍 ' + bt('통로', 'AISLE') + ' ' + g.aisle : '❔ ' + bt('위치 없음', 'NO LOCATION');
export const PICK_RULE = '🧩 SET · INSERT ORDER first  ·  📍 AISLE 00 → 01A → 01B → … → WAREHOUSE → NO LOCATION  ·  same code letters together A→Z  ·  numbers 1→9 (CVEG01…CVEG16, then CVNG)';
/** 💍 / 🧴 픽킹 리스트를 주얼리 · 그 외 제품 두 장으로 (2026-11-12 관리자: "주얼리랑 그외 제품이랑 두 개가 따로따로") — 그 외 = 커미션 P 종류 · v0.8.196
 *   주얼리 = A · W(세트 · 디스플레이) 등 나머지 · 한 종류만 있으면 한 장 (머리에 어느 쪽인지 표시) */
export function pickParts(o, lines) {
  const L = fixDiscT(o, lines.map(l => Object.assign({}, l)));
  const other = new Set(invTypes(S).filter(t => t.comm === 'P' || t.c === 'P').map(t => t.c)), isO = l => other.has(l.t || DT());
  const J = L.filter(l => !isO(l)), P = L.filter(isO);
  return [['JEWELRY', J], ['OTHER PRODUCTS', P]].filter(x => x[1].length);
}
export function pickingHtml(o, lines) {
  const parts = pickParts(o, lines);
  if (!parts.length) return pickingPart(o, lines, '', '');
  return parts.map((p, i) => pickingPart(o, p[1], p[0], parts.length > 1 ? (i + 1) + ' / ' + parts.length : '')).join('');
}
function pickingPart(o, lines, part, pg) {
  const acc = acctOf(o.acct);
  const showKits = pickKits();   // 🧩 구성품 줄은 옵션 (기본 숨김)
  const rows = lines.slice().sort(pickSortGrouped);   // 🧭 📍 통로(동선) → 코드 앞 글자 ABC → 번호
  let lastK = null, lastF = null;
  /* 통로가 바뀔 때마다 굵은 머리 줄 (몇 줄 · 몇 개) · 같은 통로 안에서 종류(코드 앞 글자)가 바뀌면 가는 선 */
  const aisleRow = l => { const g = pickGroup(l); let h = ''; if (g.key !== lastK) { lastK = g.key; lastF = g.fam; const n = rows.filter(x => pickGroup(x).key === g.key); h += '<tr class="pktype"><td colspan="8">' + esc(g.set ? 'SET · INSERT ORDER' : g.aisle ? 'AISLE ' + g.aisle : 'NO LOCATION') + ' · ' + n.length + (n.length === 1 ? ' line · ' : ' lines · ') + n.reduce((a, x) => a + x.q, 0) + ' pcs</td></tr>'; } else if (g.fam !== lastF) { lastF = g.fam; h += '<tr class="pkfam"><td colspan="8"></td></tr>'; } return h; };
  /* 🖨 한 장에 머리 → 바로 아래 표 (예전엔 머리 칸이 인보이스용 "다음 장으로 넘김" 을 가져가 첫 장에 머리만 나오고 표는 둘째 장부터였음)
   *   표 머리는 장마다 다시 · 줄은 장 사이에서 안 잘림 · 용지는 인보이스 설정(Letter / A4) · 여러 장 묶어 찍으면 주문마다 새 장 */
  const paper = ((invView(S).paper || company(S).paper) === 'a4') ? 'A4' : 'letter';   // 인보이스 인쇄와 같은 용지
  return ('<style>@page{size:' + paper + ';margin:.4in}</style><div class="pk"><div class="iv pkhd">' + docHead(company(S), 'PICKING LIST', [['Date', o.d.substring(5, 7) + '/' + o.d.substring(8, 10) + '/' + o.d.substring(2, 4)], ['S.O. No.', o.no]]) +
    '<div class="meta">' + (part ? '<span class="pkpart">' + (part === 'JEWELRY' ? '💍 ' : '🧴 ') + esc(part) + (pg ? ' <span>· ' + esc(pg) + '</span>' : '') + '</span> ' : '') + '<b class="docnm">' + esc(o.store) + '</b> (' + esc(o.acct || '신규') + ')' + (o.shipTo || acc ? ' · ' + esc([(o.shipTo || acc).addr, (o.shipTo || acc).city, (o.shipTo || acc).state, (o.shipTo || acc).zip].filter(Boolean).join(', ')) : '') +
    '<br>Rep. ' + esc(o.smFor || o.sm) + (o.pickerName ? ' · PICKER: <b>' + esc(o.pickerName) + '</b>' : '') + ' · printed ' + esc(new Date().toLocaleString('en-US')) + (o.memo ? '<br><b>MEMO:</b> ' + esc(o.memo) : '') + (reqCount(o.req) ? '<br><b>DISPLAY / INSERT REQUEST:</b> ' + esc(reqText(o.req, true, o.reqNote)) : '') + '</div><div class="pkrule">' + esc(PICK_RULE) + '</div></div>' +
    '<table class="pktbl"><thead><tr><th style="width:26px">#</th><th style="width:100px">LOC</th><th style="width:82px">CODE</th><th>DESCRIPTION</th><th style="width:40px">TYPE</th><th class="r" style="width:52px">ORDER</th><th class="r" style="width:56px">PICKED</th><th style="width:70px">NOTE</th></tr></thead><tbody>' +
    rows.map((l, i) => aisleRow(l) + '<tr><td>' + (i + 1) + '</td><td class="pkloc"><b>' + esc(locOf(l.c)) + '</b></td><td><b>' + esc(l.c) + '</b>' + (l.kit ? ' 🧩' : '') + '</td><td>' + esc(l.d) + '</td><td>' + esc(l.t || DT()) + '</td><td class="r"><b>' + l.q + '</b></td><td></td><td>' + esc(l.note || '') + '</td></tr>' +
      (l.kit && showKits ? l.kit.map(k => { const it = catalog() && catalog().byCode[k.c]; return '<tr style="color:#444"><td></td><td>' + esc(locOf(k.c)) + '</td><td style="padding-left:18px">└ ' + esc(k.c) + '</td><td>' + esc(it ? it.d : '') + '</td><td></td><td class="r">' + (k.q * l.q) + '</td><td></td><td>' + k.q + ' × ' + l.q + '</td></tr>'; }).join('') : '')).join('') +
    '<tr class="fin"><td colspan="5">' + rows.length + ' lines</td><td class="r">' + rows.reduce((a, l) => a + l.q, 0) + '</td><td></td><td></td></tr></tbody></table>' +
    '<div class="sig"><div>Picked by</div><div>Checked by</div><div>Date</div></div></div>');
}
function csv(o, lines) {
  const q = s => { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const out = [['Type', 'Code', 'Description', 'Qty', 'Picked', 'Price', 'ListPrice', 'Amount', 'Note']].concat(lines.map(l => [l.t || DT(), l.c, l.d, l.q, l.pq == null ? '' : l.pq, l.p.toFixed(2), l.lp != null ? Number(l.lp).toFixed(2) : '', ((l.pq == null ? l.q : l.pq) * l.p).toFixed(2), l.note || '']));
  const blob = new Blob(['﻿' + out.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.no + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---- 🚗 딜리버리 — UPS 라벨 없이 세일즈맨 · 다른 직원이 가져가거나 손님이 픽업 (v0.8.178) ----
 *  done → dlv(딜리버리 대기: dlvKind sm | staff | pickup · dlvBy · dlvNote · dlvAt) → 배달 완료 → shipped(shipVia DELIVERY | PICKUP · deliveredAt · receivedBy) */
const DLVK = { sm: ['세일즈맨이 배달', 'Salesman delivers'], staff: ['직원이 배달', 'Staff delivers'], pickup: ['손님 픽업', 'Customer pickup'] };
function dlvModal(o) {
  const memo = String(o.memo || '');
  const F = { kind: o.dlvKind || (/customer pickup|픽업/i.test(memo) ? 'pickup' : /salesman deliver|세일즈맨 직접 배달/i.test(memo) ? 'sm' : 'sm'), by: o.dlvBy || '', note: o.dlvNote || '' };
  const defBy = k => k === 'sm' ? (o.sm || '') : k === 'pickup' ? (o.store || '') : '';
  if (!F.by) F.by = defBy(F.kind);
  const paint = () => {
    openModal('<h2>🚗 ' + bi('딜리버리로', 'Delivery') + ' — ' + esc(o.store || '') + '</h2><div class="muted">' + bt('UPS 라벨 없이 나가는 주문 — 딜리버리 대기에 두었다가, 가져가면 ✅ 배달 완료. UPS 출고 목록에서는 빠집니다.', 'Goes out without a UPS label — waits in Awaiting delivery until marked ✅ Delivered. Leaves the UPS list.') + '</div>' +
      (memo ? '<div class="alert a-blu" style="margin-top:8px">📝 ' + esc(memo) + '</div>' : '') +
      '<div class="seg" style="margin-top:8px">' + Object.keys(DLVK).map(k => '<button class="' + (F.kind === k ? 'on' : '') + '" data-dk="' + k + '">' + (k === 'sm' ? '🧑‍💼 ' : k === 'staff' ? '👷 ' : '🏬 ') + bt(DLVK[k][0], DLVK[k][1]) + '</button>').join('') + '</div>' +
      '<div class="fg" style="margin-top:8px"><label>' + (F.kind === 'pickup' ? bt('누가 가져가나 (가게 · 사람)', 'Who picks up') : bt('누가 배달하나', 'Who delivers')) + '</label><input id="dkBy" value="' + esc(F.by) + '" placeholder="' + esc(F.kind === 'sm' ? bt('세일즈맨 코드', 'Salesman code') : bt('이름', 'Name')) + '"></div>' +
      '<div class="fg"><label>' + bt('메모 (선택)', 'Note (optional)') + '</label><input id="dkNote" value="' + esc(F.note) + '" placeholder="' + esc(bt('예: 금요일 방문 때 · 박스 2개', 'e.g. Friday visit · 2 boxes')) + '"></div>' +
      '<div class="btns"><button class="b-ghost" id="dkX">' + bt('닫기', 'Close') + '</button><button class="b-blue" id="dkOk">🚗 ' + bi('딜리버리 대기로', 'Set awaiting delivery') + '</button></div>');
    document.querySelectorAll('[data-dk]').forEach(b => b.onclick = () => { const was = F.kind; F.note = $('dkNote').value; const cur = $('dkBy').value.trim(); F.kind = b.dataset.dk; if (!cur || cur === defBy(was)) F.by = defBy(F.kind); else F.by = cur; paint(); });
    $('dkX').onclick = closeModal;
    $('dkOk').onclick = async () => {
      const by = $('dkBy').value.trim(), note = $('dkNote').value.trim(); if (!by) return toast(bt('누가 배달하는지 적으세요', 'Who delivers?'), 'bad');
      const now = new Date().toISOString(); busy(true);
      try {
        await S.DB.update('orders', o.id, { st: 'dlv', dlvKind: F.kind, dlvBy: by, dlvNote: note, dlvAt: o.dlvAt && o.st === 'dlv' ? o.dlvAt : now, dlvSetBy: S.user.email, shipVia: F.kind === 'pickup' ? 'PICKUP' : 'DELIVERY', updatedAt: now });
        /* 🧑‍💼 세일즈맨이 배달하면 그 세일즈맨 앱에 알림 (메일 · 단톡방 없이) */
        if (F.kind === 'sm' && o.sm) { try { const M = await import('./msg.js'); await M.sendMsg({ to: 'sm:' + String(by || o.sm).toUpperCase(), toLabel: by || o.sm, text: '🚗 ' + bt('배달할 주문', 'Order to deliver') + ': ' + (o.store || '') + ' · ' + (o.no || '') + ((o.invs || []).length ? ' · ' + o.invs.join(', ') : '') + (note ? '\n📝 ' + note : ''), ref: { kind: 'order', id: o.id, label: (o.no || '') + ' · ' + (o.store || '') }, quiet: true }); } catch (e) {} }
        closeModal(); toast('🚗 ' + bt('딜리버리 대기로', 'Awaiting delivery'), 'good'); goOrder(o.id);
      } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  paint();
}
function dlvDone(o) {
  openModal('<h2>✅ ' + bi('배달 완료', 'Delivered') + ' — ' + esc(o.store || '') + '</h2><div class="muted">' + esc(DLVK[o.dlvKind] ? bt(DLVK[o.dlvKind][0], DLVK[o.dlvKind][1]) : '') + (o.dlvBy ? ' · ' + esc(o.dlvBy) : '') + '</div>' +
    '<div class="two" style="margin-top:8px"><div class="fg"><label>' + bt('배달한 날', 'Delivered on') + '</label><input type="date" id="ddD" value="' + esc(today()) + '"></div><div class="fg"><label>' + bt('받은 사람 (선택)', 'Received by (optional)') + '</label><input id="ddR" placeholder="' + esc(bt('가게에서 받은 사람', 'Who received it')) + '"></div></div>' +
    '<div class="btns"><button class="b-ghost" id="ddX">' + bt('닫기', 'Close') + '</button><button class="b-green" id="ddOk">✅ ' + bi('배달 완료 → 출고 완료', 'Delivered → Shipped') + '</button></div>');
  $('ddX').onclick = closeModal;
  $('ddOk').onclick = async () => {
    const d = $('ddD').value || today(), now = new Date().toISOString(), at = d === today() ? now : d + 'T12:00:00.000Z'; busy(true);
    try { await S.DB.update('orders', o.id, { st: 'shipped', shipAt: at, shipBy: S.user.email, shipVia: o.dlvKind === 'pickup' ? 'PICKUP' : 'DELIVERY', deliveredAt: at, deliveredBy: o.dlvBy || '', receivedBy: $('ddR').value.trim(), updatedAt: now }); closeModal(); toast('✅ ' + bt('배달 완료 · 출고 완료', 'Delivered · shipped'), 'good'); goOrder(o.id); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/* ---- 🧾 인보이스 확정 ---- */
async function confirmInvoice(o, lines) {
  if (/^N\d{6}-/.test(String(o.acct || ''))) { const NA = await import('./newacct.js'); toast('🆕 ' + bt('신규 거래처라 아직 코드가 없습니다 — 코드를 먼저 붙여 주세요', 'New account has no code yet — assign the code first'), 'bad'); if (NA.canAssign()) NA.pendingModal(() => goOrder(o.id)); return; }
  try { await loadCatalog(S); } catch (e) {}
  fixDiscT(o, lines);   // 🗄 단종 주얼리는 A (목록이 늦게 읽혔을 때도) · v0.8.196
  const groups = Object.values(splitByType(lines, o.disc, 'pq')).filter(g => g.qty > 0);
  const bo = lines.filter(l => (l.pq || 0) < l.q).map(l => Object.assign({ c: l.c, d: l.d, q: l.q - (l.pq || 0), p: l.p, lp: l.lp != null ? l.lp : l.p, t: l.t || DT() }, l.kit ? { kit: l.kit } : {}));
  if (!groups.length) return toast('픽킹된 수량이 없습니다 — 주문을 취소하거나 수량을 넣으세요', 'bad');
  const types = invTypes(S);
  openModal('<h2>🧾 인보이스 확정 — ' + esc(o.store) + '</h2><div class="muted">종류별로 인보이스 번호가 하나씩 나옵니다. 확정하면 고칠 수 없습니다 (취소 후 다시).</div>' +
    '<table style="margin-top:8px"><tr><th>종류</th><th class="r">수량</th><th class="r">금액</th><th class="r">할인</th><th class="r">합계</th></tr>' + groups.map(g => '<tr><td>' + sel('', types.map(t => [t.c, t.c]), g.t, 'class="tsel" data-ivt="' + esc(g.t) + '" title="' + esc(bt('이 묶음 전체를 다른 종류로', 'Move this group to another type')) + '"') + ' ' + esc(typeName(g.t)) + '</td><td class="r">' + g.qty + '</td><td class="r">' + money(g.sub) + '</td><td class="r"><input type="number" inputmode="decimal" min="0" max="100" step="0.5" data-ivd="' + esc(g.t) + '" value="' + (g.disc || 0) + '" style="width:64px;text-align:right;padding:6px 8px;font-weight:800" title="' + esc(bt('이 종류의 할인 % — 이 주문에만', 'Discount % for this type — this order only')) + '">%</td><td class="r"><b>' + money(g.total) + '</b></td></tr>').join('') + '</table>' +
    '<div class="muted" style="margin-top:4px">🏷 ' + bt('할인 % 는 종류마다 바로 고칠 수 있습니다 — 이 주문의 인보이스에만 적용되고 가게 기본 할인은 그대로입니다', 'Discount % can be changed per type here — applies to this order only; the store default stays') + '</div>' +
    (bo.length ? '<div class="alert a-amb">⏳ 백오더 ' + bo.length + '줄 · ' + bo.reduce((a, l) => a + l.q, 0) + '개 — 백오더 목록에 남겨 두고 나중에 결정합니다</div>' : '') +
    /* 🚚 운임(Freight) — 인보이스 금액(Amount Due · 잔액)에 더함 · 매출 · 커미션(total)에는 안 들어감 (옛 시스템 Freight 칸과 같은 자리 inv.ship) · 2026-11-12 관리자 */
    '<div class="fg" style="margin-top:8px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><div style="flex:1;min-width:140px"><label>🚚 ' + bi('운임', 'Freight') + ' <span class="muted" style="font-weight:400">$</span></label><input id="ivFrt" type="number" inputmode="decimal" min="0" step="0.01" value="' + (o.freight ? Number(o.freight).toFixed(2) : '') + '" placeholder="0.00"></div>' +
    (groups.length > 1 ? '<div style="flex:1;min-width:140px"><label>' + bt('운임을 넣을 인보이스', 'Add freight to') + '</label>' + sel('ivFrtT', groups.map(g => [g.t, g.t + ' · ' + typeName(g.t)]), o.freightT && groups.some(g => g.t === o.freightT) ? o.freightT : groups[0].t) + '</div>' : '') + '</div>' +
    '<div class="fg" style="margin-top:8px"><label>인보이스 메모 (선택)</label><input id="ivMemo" value="' + esc(o.memo || '') + '"></div>' +
    '<div class="btns"><button class="b-ghost" id="ivX">닫기</button><button class="b-green" id="ivOk">확정 · 인쇄</button></div>');
  $('ivX').onclick = closeModal;
  /* 🏷 묶음의 종류 바꾸기 (예: W 로 잡힌 줄을 A 로) — 줄의 종류를 바꾸고 창을 다시 그림 · 확정 때 같이 저장 */
  const keepFrt = () => { const f = $('ivFrt'); if (f) o.freight = Math.max(0, Number(f.value) || 0); const t = $('ivFrtT'); if (t) o.freightT = t.value; };
  document.querySelectorAll('[data-ivt]').forEach(x => x.onchange = () => { keepFrt(); const from = x.dataset.ivt, to = x.value; if (from === to) return; lines.forEach(l => { if ((l.t || DT()) === from) l.t = to; }); closeModal(); confirmInvoice(o, lines); });
  /* 🏷 종류별 할인 바꾸기 — o.disc 에 적고 창을 다시 그림 · 확정 때 주문(disc · discChg) 과 인보이스(disc) 에 같이 저장 */
  document.querySelectorAll('[data-ivd]').forEach(x => x.onchange = () => { keepFrt(); const t = x.dataset.ivd, v = Math.max(0, Math.min(100, Number(x.value) || 0)); o.disc = Object.assign({}, o.disc || {}); if (v) o.disc[t] = v; else delete o.disc[t]; o.discChg = true; closeModal(); confirmInvoice(o, lines); });
  $('ivOk').onclick = async () => {
    const memo = $('ivMemo').value.trim(); keepFrt(); const frt = R2(o.freight || 0), frtT = groups.length > 1 && $('ivFrtT') ? $('ivFrtT').value : groups[0].t; closeModal(); busy(true);
    try {
      const fresh = await S.DB.get('orders', o.id);
      if (fresh && (fresh.st === 'done' || fresh.st === 'shipped' || fresh.st === 'x')) throw new Error('이미 처리된 주문입니다 (' + fresh.st + ')');
      const now = new Date().toISOString(), d = today(), acc = acctOf(o.acct), invs = [], ops = [];
      for (const g of groups) {
        const t = types.find(x => x.c === g.t) || { c: g.t, start: 1, pad: 5 };
        const no = await nextInvoiceNo(S, t);
        const C = catalog();
        const inv = { no, t: g.t, order: o.no, orderId: o.id, acct: o.acct || '', store: o.store, shipTo: o.shipTo || null, sm: o.smFor || o.sm, d, ym: ym(d), lines: g.lines.map(l => { const it = C && C.byCode[l.c]; return Object.assign({ c: l.c, d: l.d, q: l.q, p: l.p, lp: l.lp != null ? l.lp : l.p, g: it ? productLine(it) : '' }, l.kit ? { kit: l.kit } : {}); }),
          qty: g.qty, sub: g.sub, list: g.list, disc: g.disc, total: g.total, ship: g.t === frtT ? frt : 0, bal: R2(g.total + (g.t === frtT ? frt : 0)), terms: (acc && acc.terms) || '', st: 'open', memo, req: o.req || null, reqNote: o.reqNote || null, createdBy: S.user.email, createdAt: now,
          imemo: o.imemo || '', pickedBy: o.pickedByName || o.pickerName || '', pay: o.pay || '' };   // 💳 COD · ACH — 인보이스 Terms 칸에 같이 찍힘   // 🔒 내부 메모 · 👷 피킹한 사람 — 사무실 기록 (손님 인보이스 인쇄에는 안 나옴)
        invs.push(inv); ops.push({ op: 'set', col: 'invoices', id: no, data: inv });
      }
      if (bo.length) ops.push({ op: 'set', col: 'backorders', id: o.id, data: { order: o.no, orderId: o.id, acct: o.acct || '', store: o.store, sm: o.sm, d, lines: bo, qty: bo.reduce((a, l) => a + l.q, 0), amt: R2(bo.reduce((a, l) => a + l.q * l.p, 0)), st: 'open', newOrders: [], createdAt: now } });
      const doc = orderDoc(Object.assign({}, o, { st: 'shipped', shipAt: now, shipBy: S.user.email, shipVia: 'INVOICE', invs: invs.map(x => x.no), doneAt: now, doneBy: S.user.email, bo: bo.length ? o.id : '', updatedAt: now }), lines, o.disc);
      doc.amt = R2(invs.reduce((a, x) => a + x.total, 0));
      ops.push({ op: 'set', col: 'orders', id: o.id, data: doc }, { op: 'set', col: 'orderLines', id: o.id, data: { sm: o.sm, lines } });
      const wake = acc && acc.inactive;   // 💤 비활성 거래처에 다시 인보이스 → 자동으로 활성
      if (wake) ops.push({ op: 'update', col: 'accounts', id: acc.acct, data: { inactive: false, reactAt: now, reactBy: 'invoice ' + invs.map(x => x.no).join(' ') } });
      await S.DB.batch(ops); dropInvCache(monthsOf(invs)); bumpSalesM(S, invs, 1); stockOut(invs);   // 📦 재고에서 빼기 (세트는 구성품으로)
      if (wake) { try { await bumpAccountsVer(); } catch (e) {} }
      toast('인보이스 ' + invs.map(x => x.no).join(', '), 'good');
      busy(false);
      await printInvoices(invs, acc);
      Router.markSaved('order'); goOrder(o.id);   // ‹ 뒤로 = 주문 첫 화면 (인보이스 발행 전 확인 화면으로 안 감)
    } catch (e) { busy(false); toast('실패: ' + (e.code || e.message), 'bad'); }
  };
}

/* ============================================================
 *  백오더 · 인보이스 목록
 * ============================================================ */
export async function pageLists(LF, head) {
  if (LF.st === 'inv') return invBrowser(LF, head);
  if (LF.st === 'ups') return upsPage(LF, head);
  if (LF.st === 'packed') return Pickup.pickupPage(LF, head, () => pageLists(LF, head));
  $('page').innerHTML = head + '<div class="load">읽는 중…</div>';
  let rows = [];
  try { rows = await S.DB.list('backorders', { where: [['st', '==', 'open']] }); }
  catch (e) { $('page').innerHTML = head + '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return bind(); }
  if (LF.sm) rows = rows.filter(r => r.sm === LF.sm);
  rows = sortBy(rows, r => r.createdAt || '', true);
  $('page').innerHTML = head + '<div class="card"><h2>⏳ ' + bi('백오더', 'Backorders') + ' ' + rows.length + '건 · ' + money(rows.reduce((a, r) => a + (r.amt || 0), 0)) + '</h2><div class="muted">물건이 들어오면 골라서 새 주문으로 만들거나, 필요 없으면 닫으세요. <span class="en">When stock arrives, make a new order from selected lines, or close.</span></div>' +
    (rows.length ? rows.map(r => '<div class="pr tap" data-go="bo:' + esc(r.id) + '"><div class="ct"><b>' + esc(r.store) + '</b><small>' + esc(md(r.d)) + ' · ' + esc(r.sm) + ' · ' + esc(r.order) + '</small></div><div class="pa"><b>' + money(r.amt) + '</b><small>' + r.lines.length + '줄 · ' + r.qty + '개</small></div></div>').join('') : '<div class="none">' + bt('백오더가 없습니다', 'No backorders') + '</div>') + '</div>';
  bind(); fillStrip();
  function bind() {
    document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') LF.list = false; else LF.st = b.dataset.lf; Router.go('order'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    document.querySelectorAll('[data-lg]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('theone:stage', { detail: b.dataset.lg })));   // 위 단계 단추(📥 접수 · 📦 출고 · ✅ 완료 · ⏳ 기타) — bindListHead 와 같게 (백오더 · 인보이스 목록에서 안 눌리던 것)
    if ($('lfSm')) $('lfSm').onchange = () => { LF.sm = $('lfSm').value; pageLists(LF, head); };
    if ($('oNew')) $('oNew').onclick = () => Router.go('order', 'new');
    document.querySelectorAll('#page [data-go]').forEach(el => el.onclick = () => Router.go('order', el.dataset.go));
  }
}

/* ============================================================
 *  📄 인보이스 찾기 — 이전 시스템 "Sales Invoice List" 를 폰에 맞게
 *    · 기간 (오늘 · 어제 · 이번 주 · 이번 달 · 지난 달 · 직접) 으로 보고, 날짜별로 묶어서 하루치가 한눈에
 *    · 가게 이름 · 어카운트 번호를 치면 그 가게 인보이스 전부 (기간 상관없이)
 *    · 인보이스 번호 · 주문 번호로도 바로 찾기, 종류 (G J H D R) · 세일즈맨 거르기, CSV
 * ============================================================ */
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function dayLabel(d) { if (!d || d.length < 10) return d || ''; const x = new Date(d + 'T12:00:00'); const t = today(); return (d === t ? '오늘 Today · ' : d === addD(t, -1) ? '어제 Yesterday · ' : '') + Number(d.substring(5, 7)) + '월 ' + Number(d.substring(8, 10)) + '일 (' + WD[x.getDay()] + ')'; }
function addD(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function addMonths(d, n) { const x = new Date(d.substring(0, 7) + '-01T12:00:00'); x.setMonth(x.getMonth() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-01'; }
export function monthEnd(d) { const y = Number(d.substring(0, 4)), m = Number(d.substring(5, 7)); return d.substring(0, 7) + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); }
/* ---------- 🔒 내부 메모 (사무실 전용 — 손님 인보이스에는 안 찍힘) · 👷 실제로 피킹한 사람 (2026-11-12 오피스 요청 · v0.8.189) ---------- */
function imemoBox(o) {
  const pk = o.pickedByName ? '<div class="muted" style="margin-top:3px">👷 ' + bt('피킹한 사람', 'Picked by') + ': <b>' + esc(o.pickedByName) + '</b></div>' : '';
  return '<div class="alert imemo" style="background:#f5f3ff;border-color:#c4b5fd;color:#3b0764"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>🔒 <b>' + bi('내부 메모', 'Internal memo') + '</b> <small class="muted">' + bt('사무실만 · 인보이스에 안 찍힘', 'office only · not printed') + '</small></span><button class="b-ghost b-sm" id="mIMemo">✏️ ' + (o.imemo ? bi('고치기', 'Edit') : bi('쓰기', 'Write')) + '</button></div>' +
    (o.imemo ? '<div id="mIMemoT" style="white-space:pre-wrap;margin-top:4px;font-weight:600">' + esc(o.imemo) + '</div><div class="muted" style="font-size:11.5px">' + esc(String(o.imemoBy || '').split('@')[0]) + ' · ' + esc(String(o.imemoAt || '').substring(5, 16).replace('T', ' ')) + '</div>' : '') + pk + '</div>';
}
function imemoForm(o) {
  openModal('<h2>🔒 ' + bi('내부 메모', 'Internal memo') + ' — ' + esc(o.store) + '</h2><div class="muted">' + bt('사무실 · 창고끼리 보는 메모입니다. 손님 인보이스에는 찍히지 않고, 발행된 인보이스의 사무실 기록에 같이 남습니다.', 'Seen by office and warehouse only. Not printed on the customer invoice; kept with the issued invoice.') + '</div>' +
    '<textarea id="imT" rows="4" style="width:100%;margin-top:8px;font-size:15px">' + esc(o.imemo || '') + '</textarea><div class="btns"><button class="b-ghost" id="imX">' + bi('닫기', 'Close') + '</button><button class="b-blue" id="imOk">' + bi('저장', 'Save') + '</button></div>');
  $('imX').onclick = closeModal;
  $('imOk').onclick = async () => {
    const v = $('imT').value.trim(); closeModal(); busy(true);
    try { const now = new Date().toISOString(); await S.DB.update('orders', o.id, { imemo: v, imemoAt: now, imemoBy: S.user.email }); if (o.invs && o.invs.length) await S.DB.batch(o.invs.map(no => ({ op: 'update', col: 'invoices', id: no, data: { imemo: v } }))); toast('🔒 ' + bt('저장', 'Saved'), 'good'); goOrder(o.id); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 👷 작업 완료 때 — 실제로 피킹한 사람 고르기 (기본 = 배정된 사람). 고른 { email, name } 또는 null */
async function choosePicker(o) {
  const opts = await assignOpts(); const def = o.pickedBy || o.picker || S.user.email;
  if (!opts.some(p => p.email === def) && o.picker) opts.unshift({ email: o.picker, name: o.pickerName || o.picker.split('@')[0], pick: true });
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; res(v); };
    openModal('<h2>👷 ' + bi('누가 피킹했나요?', 'Who picked this?') + '</h2><div class="muted">' + esc(o.store) + ' · ' + esc(o.no) + ' — ' + bt('배정된 사람과 다르면 바꿔 주세요', 'change it if someone else picked') + '</div>' +
      '<div id="cpL" style="margin-top:10px">' + opts.map((p, i) => '<button type="button" class="pick' + (p.email === def ? ' on' : '') + '" data-cpk="' + i + '" style="width:100%;text-align:left;background:#fff"><span class="ck">✓</span><span class="pm"><b>' + (p.pick ? '👷 ' : '🧑‍💼 ') + esc(p.name) + '</b>' + (p.email === o.picker ? '<small>' + bt('배정된 사람', 'assigned') + '</small>' : '') + '</span></button>').join('') + '</div>' +
      '<div class="btns"><button type="button" class="b-ghost" id="cpX">' + bi('닫기', 'Close') + '</button><button type="button" class="b-green" id="cpOk">✅ ' + bi('다음', 'Next') + '</button></div>', { onClose: () => fin(null) });
    let cur = Math.max(0, opts.findIndex(p => p.email === def));
    document.querySelectorAll('[data-cpk]').forEach(b => b.onclick = () => { cur = Number(b.dataset.cpk); document.querySelectorAll('[data-cpk]').forEach(x => x.classList.toggle('on', x === b)); });
    $('cpX').onclick = closeModal;
    $('cpOk').onclick = () => { const p = opts[cur]; fin({ email: p.email, name: p.name }); closeModal(); };
  });
}
/** 픽킹 담당 직원 — 사용자 중 일(job)이 픽킹인 사람 (관리 → 사용자에서 등록) */
let PICKERS = null;
export async function pickers() {
  if (PICKERS) return PICKERS;
  /* 순서: 창고 직원(pick1 · pick2 …) → 오피스 · 인보이스 담당(EUNJI · EUNJU · BEA …) → 창고 매니저, 같은 묶음 안은 이름 순 (숫자 순서로) */
  const rank = u => u.job === 'pick' ? 0 : u.job === 'whmgr' ? 2 : 1, coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  try { PICKERS = (await S.DB.list('users', {})).filter(u => u.active !== false && u.role === 'manager' && [u.job || 'office'].concat(Array.isArray(u.job2) ? u.job2 : []).some(j => jobCan(j, 'pick'))).map(u => ({ email: u.email || u.id, name: u.name || (u.email || u.id).split('@')[0], job: u.job || 'office', pick: u.job === 'pick' || u.job === 'whmgr', rank: rank(u) })).sort((a, b) => a.rank - b.rank || coll.compare(a.name, b.name)); }
  catch (e) { PICKERS = []; }
  return PICKERS;
}
/** 할당 창에 보일 사람 목록 — 창고 직원(pick1~) → 오피스 · 인보이스 담당 → 창고 매니저, 나는 맨 뒤 (목록에 이미 있으면 그 자리 그대로) */
export async function assignOpts() {
  const list = await pickers(), me = S.user.email;
  if (list.some(p => p.email === me)) return list.map(p => Object.assign({}, p, { me: p.email === me }));
  return list.concat([{ email: me, name: S.user.name || me.split('@')[0], pick: false, rank: 9, me: true }]);
}
/** 주문들을 픽킹 직원에게 할당 (접수 → 픽킹 중) — 팝업에서 사람을 고름. 창고 직원(pick1~4)이 먼저 · 지금 맡은 건수 표시. 픽킹 인보이스 인쇄는 선택 */
export async function assignPicker(orders, done) {
  const crs = orders.filter(o => o.kind === 'credit'); if (crs.length) { orders = orders.filter(o => o.kind !== 'credit'); toast('↩ ' + bt('크레딧', 'Credit') + ' ' + crs.length + bt('건은 픽킹이 없습니다 — 열어서 크레딧 확정', ' are credits — open them to confirm'), orders.length ? '' : 'bad'); if (!orders.length) return; }   // v0.8.187
  const noCf = orders.filter(o => !o.cfOk);   // 순서: 세일즈맨 확인 → 픽킹 배정
  if (noCf.length && !(await confirmBox('❓ ' + noCf.length + bt('건은 아직 세일즈맨 확인 전입니다. 그래도 픽킹에 배정할까요?', ' orders are not confirmed by the salesman yet. Assign anyway?'), bt('그래도 배정', 'Assign anyway')))) return;
  const opts = await assignOpts(), me = S.user.email;
  if (!opts.length) return toast(bt('할당할 직원이 없습니다 — 관리 → 사용자에서 일을 "창고 직원" 으로 등록하세요', 'No pickers — register users with the Warehouse Staff job'), 'bad');
  /* 지금 맡고 있는 건수 (픽킹 중 · 확정 대기) — 일을 고르게 나눠 주기 위해 */
  const load = {}; try { (await S.DB.list('orders', { where: [['st', 'in', ['pick', 'ok']]] })).forEach(o => { if (o.picker) load[o.picker] = (load[o.picker] || 0) + 1; }); } catch (e) {}
  const one = orders.length === 1 ? orders[0] : null;
  const cur = one && one.picker ? one.picker : '';
  let sel = Math.max(0, opts.findIndex(p => p.email !== cur));   // 작업자 변경이면 지금 사람 말고 첫 사람
  const who = p => (p.me ? '🙋 ' : p.pick ? '👷 ' : '🧑‍💼 ') + esc(p.name) + (p.me ? ' <small>(' + bt('나', 'me') + ')</small>' : '');
  openModal('<h2>👷 ' + bi('누가 픽킹할까요?', 'Who picks this?') + ' <span class="muted" style="font-weight:600">— ' + orders.length + bt('건', '') + ' · ' + money(orders.reduce((a, o) => a + (o.amt || 0), 0)) + '</span></h2>' +
    '<div class="pkgrid">' + opts.map((p, i) => '<button type="button" class="' + (i === sel ? 'on' : '') + (p.email === cur ? ' cur' : '') + '" data-pk="' + i + '"><b>' + who(p) + '</b><small>' + (p.email === cur ? bt('지금 맡은 사람', 'current picker') : (load[p.email] || 0) + bt('건 진행 중', ' in progress')) + '</small></button>').join('') + '</div>' +
    '<div class="muted" style="font-size:12px;margin-top:6px">' + bi('고른 직원 앱의 "내 배정 작업" 에 들어갑니다. 창고 직원은 관리 → 사용자에서 일을 "창고 직원" 으로.', 'Goes to that person\'s "My assignments". Register warehouse staff under Admin → Users.') + '</div>' +
    '<div style="max-height:26vh;overflow:auto;margin-top:8px;font-size:13px">' + orders.map(o => '<div>' + esc(o.store) + ' <span class="muted">' + esc(o.sm) + ' · ' + esc(o.no) + ' · ' + money(o.amt) + '</span></div>').join('') + '</div>' +
    '<label class="pick on" style="margin-top:8px"><input type="checkbox" id="pkPrint" class="ck-big" checked><span class="pm"><b>🖨 ' + bi('픽킹 인보이스도 인쇄', 'Also print picking lists') + '</b></span></label>' +
    '<div class="btns"><button class="b-ghost" id="pkX">' + bt('취소', 'Cancel') + '</button>' + (one ? '<button class="b-ghost" id="pkOpen">📄 ' + bt('주문 열기', 'Open order') + '</button>' : '') + '<button class="b-blue" id="pkOk">👷 ' + bt('할당', 'Assign') + '</button></div>');
  document.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => { sel = +b.dataset.pk; document.querySelectorAll('[data-pk]').forEach(x => x.classList.toggle('on', x === b)); });
  $('pkX').onclick = closeModal;
  if ($('pkOpen')) $('pkOpen').onclick = () => { closeModal(); goOrder(one.id); };
  $('pkOk').onclick = async () => {
    const p = opts[sel], now = new Date().toISOString(), pr = $('pkPrint').checked; closeModal(); busy(true);
    try {
      await S.DB.batch(orders.map(o => ({ op: 'update', col: 'orders', id: o.id, data: { st: 'pick', picker: p.email, pickerName: p.name, pickAt: now, pickBy: me, updatedAt: now } })));
      toast('👷 ' + p.name + ' ← ' + (one ? one.store : orders.length + bt('건', ' orders')), 'good');
      if (pr) { try { await loadCatalog(S); } catch (e) {} const all = []; for (const o of orders) { const L = await S.DB.get('orderLines', o.id); all.push(pickingHtml(Object.assign({}, o, { st: 'pick', pickerName: p.name }), (L && L.lines) || [])); } printOpen(all.join('')); }
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false); if (done) done();
  };
}
export const PERIODS = [['today', '오늘', 'Today'], ['yday', '어제', 'Yesterday'], ['week', '이번 주', 'This week'], ['lastw', '지난 주', 'Last week'], ['month', '이번 달', 'This month'], ['lastm', '지난 달', 'Last month'], ['quarter', '이번 분기', 'Quarter'], ['year', '올해', 'This year'], ['lasty', '작년', 'Last year'], ['custom', '기간 직접', 'Custom']];
/** 달력의 빠른 선택 목록 */
export function quickRanges() { return PERIODS.filter(c => c[0] !== 'custom').map(c => { const r = periodRange(c[0]); return [c[1], r[0], r[1]]; }); }
export function periodRange(p, from, to) {
  const t = today(), y = Number(t.substring(0, 4)), m = Number(t.substring(5, 7));
  const mon = (yy, mm) => yy + '-' + String(mm).padStart(2, '0'), wd = (new Date(t + 'T12:00:00').getDay() + 6) % 7;   // 월요일 시작
  if (p === 'today') return [t, t];
  if (p === 'yday') return [addD(t, -1), addD(t, -1)];
  if (p === 'week') return [addD(t, -wd), t];
  if (p === 'lastw') return [addD(t, -wd - 7), addD(t, -wd - 1)];
  if (p === 'month') return [t.substring(0, 8) + '01', t];
  if (p === 'lastm') { const f = addD(t.substring(0, 8) + '01', -1); return [f.substring(0, 8) + '01', f]; }
  if (p === 'quarter') { const qm = Math.floor((m - 1) / 3) * 3 + 1; return [mon(y, qm) + '-01', t]; }
  if (p === 'year') return [y + '-01-01', t];
  if (p === 'lasty') return [(y - 1) + '-01-01', (y - 1) + '-12-31'];
  if (p === '2m') return [addD(t, -60), t];
  return [from || addD(t, -7), to || t];
}
export async function invBrowser(LF, head) {
  LF.ip = LF.ip || 'month'; LF.iq = LF.iq || ''; LF.it = LF.it || ''; LF.im = LF.im || 'acct'; LF.srt = LF.srt || { k: '', desc: false };   // ↕ 머리글 정렬 (v0.8.190)
  const types = invTypes(S);
  let q = LF.iq.trim();
  /* 🔢 숫자만 쳤을 때 (43350) — A · P · W · CM 중 그 번호로 있는 인보이스: 하나면 바로, 여럿이면 골라서 */
  let digitInv = []; if (/^\d{5,6}$/.test(q)) { try { digitInv = await invByDigits(S, q); } catch (e) {} if (digitInv.length === 1) q = digitInv[0].no; }
  /* 인보이스 번호 · 주문 번호 모양이면 번호로 바로 찾기 */
  const isNo = /^[A-Z]{1,2}-?\d{3,}$/i.test(q) || /^O\d{6}-/i.test(q);   // A42497 · P-007803 · O261022-… · SA-000123(주문)
  /* 🏬 거래처별(기본): 전체 거래처 목록 → 검색으로 거르기 → 가게를 누르면 그 가게 인보이스 전부 · 📅 기간별: 예전처럼 */
  const byAcct = LF.im === 'acct';
  let accs = [], acc = null;
  if (byAcct) acc = LF.iacct ? (S.accounts.byCode || {})[LF.iacct] || null : null;
  else { accs = q && !isNo ? searchAccounts(S.accounts, q, 6) : []; acc = accs.length === 1 || (accs.length && accs[0].acct === q) ? accs[0] : null; }
  const [from, to] = periodRange(LF.ip, LF.ifrom, LF.ito);
  const modeSeg = itabs([['acct', '🏬', '거래처별', 'By customer'], ['date', '📅', '기간별', 'By date'], ['sm', '👤', '세일즈맨별', 'By salesman'], ['geo', '🏙', '지역별', 'By region'], ['type', '🏷', '종류별', 'By type']], byAcct ? 'acct' : (LF.im || 'date'), 'im');   // 기간 안의 인보이스를 어떻게 묶어 볼지 (v0.8.138)
  if (byAcct && !acc && !isNo) return acctList(LF, head, modeSeg);
  const top = '<div class="card" style="padding-bottom:8px">' + modeSeg + (byAcct && acc ? '<button class="b-ghost b-sm" id="iqBackA" style="margin-bottom:6px">‹ ' + bi('거래처 목록', 'All customers') + '</button>' : '') +
    (byAcct && acc ? '' : '<div style="display:flex;gap:6px"><input id="iqQ" placeholder="가게 이름 · 어카운트 # · 인보이스 # · 주문 # / Store · Acct · Invoice · Order" value="' + esc(LF.iq) + '" autocomplete="off" style="flex:1">' + (LF.iq ? '<button class="b-ghost b-sm" id="iqX">✕</button>' : '') + '</div>') +
    (accs.length > 1 && !acc ? '<div class="chips">' + accs.map(a => '<button data-iqa="' + esc(a.acct) + '">' + esc(a.acct) + ' ' + esc(a.store) + '</button>').join('') + '</div>' : '') +
    (digitInv.length > 1 ? '<div class="chips"><span class="muted" style="align-self:center">📄 ' + bt('이 번호의 인보이스', 'Invoices with this number') + ':</span>' + digitInv.map(c => '<button data-iqa="' + esc(c.no) + '">' + esc(c.no) + ' · ' + esc(c.inv.store || '') + '</button>').join('') + '</div>' : '') +
    (acc || byAcct ? '' : '<div class="chips">' + PERIODS.filter(c => c[0] !== 'custom').map(c => '<button class="' + (LF.ip === c[0] ? 'on' : '') + '" data-ip="' + c[0] + '">' + c[1] + ' <span class="en">' + c[2] + '</span></button>').join('') + '<button class="' + (LF.ip === 'custom' ? 'on' : '') + '" id="iCal">📅 ' + esc(md(from) + (from !== to ? ' ~ ' + md(to) : '')) + '</button></div>') +
    '<div class="chips" style="margin-top:4px"><button class="' + (LF.it ? '' : 'on') + '" data-it="">' + bi('종류 전체', 'All types') + '</button>' + types.map(t => '<button class="' + (LF.it === t.c ? 'on' : '') + '" data-it="' + esc(t.c) + '">' + esc(t.c) + ' ' + esc(t.n) + '</button>').join('') + (types.some(t => t.c === CRT().c) ? '' : '<button class="' + (LF.it === CRT().c ? 'on' : '') + '" data-it="' + esc(CRT().c) + '">↩ ' + esc(CRT().c) + ' ' + bi('크레딧', 'Credits') + '</button>') + '<button class="' + (LF.ivoid ? 'on' : '') + '" data-ivoid="1">VOID ' + bi('포함', 'incl.') + '</button></div></div>';
  $('page').innerHTML = head + top + '<div id="iList"><div class="load">읽는 중…</div></div>';
  bind(); fillStrip();
  let rows = [], err = '';
  try {
    if (acc) rows = await S.DB.list('invoices', { where: [['acct', '==', acc.acct]] });
    else if (isNo) { const x = await getInvoice(S, q); rows = x ? [x] : await S.DB.list('invoices', { where: [['order', '==', q.toUpperCase()]] }); }
    else rows = await invoicesBetween(S, from, to);
  } catch (e) { err = String(e.code || e.message); }
  /* 📊 전체 몇 장 있는지 (올해 · 작년 · 그 전) — 가져오기가 됐는지 바로 보이게. 기간에 없으면 최근 200장으로 */
  let cnt = null, latest = false;
  if (!acc && !isNo) {
    try { const y = Number(today().substring(0, 4)); const [c0, c1, c2] = await Promise.all([S.DB.count('invoices', { where: [['d', '>=', y + '-01-01']] }), S.DB.count('invoices', { where: [['d', '>=', (y - 1) + '-01-01'], ['d', '<', y + '-01-01']] }), S.DB.count('invoices', { where: [['d', '<', (y - 1) + '-01-01']] })]); cnt = { y, c0, c1, c2, all: c0 + c1 + c2 }; } catch (e) {}
    if (!rows.length && !q && cnt && cnt.all) { try { rows = await S.DB.list('invoices', { where: [['d', '<=', to]], order: ['d', 'desc'], limit: 200 }); latest = true; } catch (e) {} }
  }
  if (!$('iList')) return;
  if (LF.sm) rows = rows.filter(r => r.sm === LF.sm);
  if (LF.it) rows = rows.filter(r => r.t === LF.it);
  if (!LF.ivoid) rows = rows.filter(r => r.st !== 'x');
  if (q && !acc && !isNo) { const qq = q.toUpperCase(); rows = rows.filter(r => String(r.store || '').toUpperCase().includes(qq) || String(r.no).includes(qq) || String(r.order || '').includes(qq) || String(r.acct || '') === qq); }
  rows = sortInv(rows, r => r.no, false);   // 하루 안에서는 인보이스 번호 순
  /* 묶음 — 📅 날짜별(기본 · 최근 날이 위, ↕ 로 반대) · 👤 세일즈맨별 · 🏙 지역별(주 › 도시 칩으로 좁힘) · 🏷 종류별(A · P · W). 거래처 · 번호로 볼 때는 날짜별 */
  const gm = acc || isNo || byAcct ? 'date' : (LF.im || 'date');
  const accOf = r => (S.accounts.byCode && S.accounts.byCode[r.acct]) || null, stOf = r => { const a = accOf(r); return String((a && a.state) || '').toUpperCase() || '—'; }, ctOf = r => { const a = accOf(r); return String((a && a.city) || '').toUpperCase() || '—'; };
  let geoChips = '';
  if (gm === 'geo') {
    const byS = {}; rows.forEach(r => { const k = stOf(r); byS[k] = (byS[k] || 0) + 1; }); if (LF.ist && !byS[LF.ist]) LF.ist = '';
    geoChips = '<div class="chips" style="margin:0 0 6px"><button class="' + (LF.ist ? '' : 'on') + '" data-ist="">' + bi('전체', 'All') + ' ' + rows.length + '</button>' + Object.keys(byS).sort().map(k => '<button class="' + (LF.ist === k ? 'on' : '') + '" data-ist="' + esc(k) + '">' + esc(k) + ' <span class="en">' + byS[k] + '</span></button>').join('') + '</div>';
    if (LF.ist) { rows = rows.filter(r => stOf(r) === LF.ist); const byC = {}; rows.forEach(r => { const k = ctOf(r); byC[k] = (byC[k] || 0) + 1; }); if (LF.ict && !byC[LF.ict]) LF.ict = '';
      geoChips += '<div class="chips" style="margin:0 0 6px"><button class="' + (LF.ict ? '' : 'on') + '" data-ict="">' + bi('전체', 'All') + ' ' + rows.length + '</button>' + Object.keys(byC).sort().map(k => '<button class="' + (LF.ict === k ? 'on' : '') + '" data-ict="' + esc(k) + '">' + esc(k) + ' <span class="en">' + byC[k] + '</span></button>').join('') + '</div>';
      if (LF.ict) rows = rows.filter(r => ctOf(r) === LF.ict); }
  }
  const live = rows.filter(r => r.st !== 'x'), tot = live.reduce((a, r) => a + (r.total || 0), 0), bal = live.reduce((a, r) => a + (r.bal != null ? r.bal : r.total || 0), 0);
  const keyOf = gm === 'sm' ? r => r.sm || '—' : gm === 'type' ? r => r.t || invParts(r.no)[0] : gm === 'geo' ? (LF.ist ? ctOf : stOf) : r => String(r.d || '').substring(0, 10) || '—';
  const labelOf = gm === 'sm' ? k => '👤 ' + esc(k) : gm === 'type' ? k => '🏷 ' + esc(k) + ' ' + esc((types.find(t => t.c === k) || {}).n || '') : gm === 'geo' ? k => '🏙 ' + esc(k) : k => '📅 ' + esc(dayLabel(k));
  const days = {}; rows.forEach(r => { const k = keyOf(r); (days[k] = days[k] || []).push(r); });
  const dayKeys = Object.keys(days).sort(); if (gm === 'date' && !LF.idesc) dayKeys.reverse();
  let h = geoChips;
  if (err) h += '<div class="alert a-red">' + esc(err) + '</div>';
  if (cnt) h += (cnt.all ? '<div class="muted" style="margin:0 0 8px;font-size:12.5px">📊 ' + bt('전체 인보이스', 'All invoices') + ' <b>' + cnt.all.toLocaleString() + '</b>' + bt('장', '') + ' · ' + cnt.y + ' ' + cnt.c0.toLocaleString() + ' · ' + (cnt.y - 1) + ' ' + cnt.c1.toLocaleString() + ' · ' + bt('그 전', 'earlier') + ' ' + cnt.c2.toLocaleString() + '</div>' : '<div class="alert a-amb">📄 ' + bt('인보이스가 아직 하나도 없습니다 — ⚙️ 관리 → 가져오기에서 이전 시스템 인보이스 목록(sales_invoice)을 올리면 여기 · 가게 창 · 세일즈맨 앱에 모두 보입니다.', 'No invoices yet — import the legacy invoice list (sales_invoice) under Admin → Import; they then show here, in store windows and in the salesman app.') + '</div>');
  if (latest) h += '<div class="alert a-blu">📅 ' + bt('이 기간(' + md(from) + ' ~ ' + md(to) + ')에는 인보이스가 없어 가장 최근 200장을 보여 줍니다 — 위 기간 버튼으로 바꾸세요.', 'No invoices in this period — showing the latest 200. Change the period above.') + '</div>';
  if (acc) h += '<div class="card" style="border:2px solid #bfdbfe"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><b style="font-size:17px">' + esc(acc.store) + '</b><div class="muted">' + esc(acc.acct) + (acc.sm ? ' · ' + esc(acc.sm) : '') + (acc.terms ? ' · ' + esc(acc.terms) : '') + (acc.tel ? ' · ' + esc(acc.tel) : '') + '</div></div><button class="b-ghost b-sm" id="iAcc">📋 ' + bi('가게 창', 'Store') + '</button></div></div>';
  h += '<div class="card"><div class="kpi"><div><b>' + live.length + '</b><span>인보이스 Invoices</span></div><div><b>' + money(tot) + '</b><span>합계 Total</span></div><div><b>' + money(bal) + '</b><span>미수 Balance</span></div><div><b>' + new Set(rows.map(r => r.d)).size + '</b><span>날짜 Days</span></div></div>' +
    '<div class="muted" style="margin:8px 0 4px">' + (acc ? '이 가게 인보이스 전부' : isNo ? '번호로 찾음' : latest ? bt('가장 최근 200장', 'Latest 200') : esc(md(from)) + ' ~ ' + esc(md(to))) + (rows.length ? ' · <a id="iCsv" href="#">⬇️ CSV</a>' : '') + (rows.length > 1 ? ' · <a id="iSort" href="#">' + (LF.idesc ? bt('오래된 날부터 ↑', 'Oldest day first ↑') : bt('최근 날부터 ↓', 'Newest day first ↓')) + '</a>' : '') + '</div>' +
    (rows.length && LF.srt.k ? iTbl(SH.sortRows(rows, LF.srt).map(r => invRow(r)).join(''), LF.srt) : rows.length ? iTbl(dayKeys.map(d => { const L = days[d], lv = L.filter(r => r.st !== 'x'); const gl = '<div class="gline"><b>' + labelOf(d) + '</b><span>' + lv.length + '건 · ' + money(lv.reduce((a, r) => a + (r.total || 0), 0)) + '</span></div>'; return (narrow() ? cgrp(gl) : '<tr class="grp"><td colspan="11">' + gl + '</td></tr>') + L.map(r => invRow(r)).join(''); }).join(''), LF.srt) : '<div class="none">' + (q ? '맞는 인보이스가 없습니다' : '이 기간에 인보이스가 없습니다') + '</div>') + '</div>';
  $('iList').innerHTML = h;
  /* 인보이스를 누르면 인보이스 · AR 잔액 · 수금을 한 화면에 (가게 창 · 미수금과 같은 화면) */
  document.querySelectorAll('#iList [data-go]').forEach(el => el.onclick = () => { const g = el.dataset.go; if (g.indexOf('inv:') === 0) invDetail(g.substring(4)); else Router.go('order', g); });
  if (isNo && !rows.length && $('iList')) { $('iList').insertAdjacentHTML('afterbegin', '<div class="card"><button class="b-blue" id="iArFind">🔎 ' + bt('AR(미수금)에서 이 번호 찾기', 'Look up this number in A/R') + '</button></div>'); $('iArFind').onclick = () => invDetail(q.toUpperCase()); }
  if ($('iAcc')) $('iAcc').onclick = () => storeSheet(acc.acct, null, 'invh');
  if ($('iSort')) $('iSort').onclick = e => { e.preventDefault(); LF.idesc = !LF.idesc; invBrowser(LF, head); };
  SH.bindSort($('iList'), LF.srt, () => invBrowser(LF, head));
  document.querySelectorAll('#iList [data-ist]').forEach(b => b.onclick = () => { LF.ist = b.dataset.ist; LF.ict = ''; invBrowser(LF, head); });
  document.querySelectorAll('#iList [data-ict]').forEach(b => b.onclick = () => { LF.ict = b.dataset.ict; invBrowser(LF, head); });
  if ($('iCsv')) $('iCsv').onclick = e => { e.preventDefault();
    const csv = [['Invoice', 'Date', 'Type', 'Acct', 'Store', 'SalesRep', 'Terms', 'Order', 'Qty', 'Sub', 'Disc%', 'Total', 'Balance', 'Status']].concat(rows.map(r => [r.no, r.d, r.t, r.acct, r.store, r.sm, r.terms || '', r.order, r.qty, r.sub, r.disc || 0, r.total, r.bal != null ? r.bal : r.total, r.st === 'x' ? 'VOID' : 'open'])).map(a => a.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'invoices-' + (acc ? acc.acct : from + '_' + to) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  function bind() {
    document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') LF.list = false; else LF.st = b.dataset.lf; Router.go('order'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    document.querySelectorAll('[data-lg]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('theone:stage', { detail: b.dataset.lg })));   // 위 단계 단추(📥 접수 · 📦 출고 · ✅ 완료 · ⏳ 기타) — bindListHead 와 같게 (백오더 · 인보이스 목록에서 안 눌리던 것)
    if ($('lfSm')) $('lfSm').onchange = () => { LF.sm = $('lfSm').value; invBrowser(LF, head); };
    if ($('oNew')) $('oNew').onclick = () => Router.go('order', 'new');
    const inp = $('iqQ');
    if (inp) inp.oninput = debounce(() => { if (!$('iqQ')) return; LF.iq = $('iqQ').value; const pos = inp.selectionStart; invBrowser(LF, head).then(() => { const n = $('iqQ'); if (n && document.activeElement !== n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }); }, 350);
    if (inp) inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); LF.iq = inp.value; invBrowser(LF, head); } };
    if ($('iqX')) $('iqX').onclick = () => { LF.iq = ''; invBrowser(LF, head); };
    document.querySelectorAll('[data-iqa]').forEach(b => b.onclick = () => { LF.iq = b.dataset.iqa; invBrowser(LF, head); });
    document.querySelectorAll('[data-ip]').forEach(b => b.onclick = () => { LF.ip = b.dataset.ip; invBrowser(LF, head); });
    document.querySelectorAll('[data-it]').forEach(b => b.onclick = () => { LF.it = b.dataset.it; invBrowser(LF, head); });
    const vb = document.querySelector('[data-ivoid]'); if (vb) vb.onclick = () => { LF.ivoid = !LF.ivoid; invBrowser(LF, head); };
    if ($('iCal')) $('iCal').onclick = async () => { const r = await pickDates({ from, to, quick: quickRanges() }); if (!r) return; LF.ip = 'custom'; LF.ifrom = r[0]; LF.ito = r[1]; invBrowser(LF, head); };
    if ($('iqBackA')) $('iqBackA').onclick = () => { LF.iacct = ''; invBrowser(LF, head); };
    document.querySelectorAll('[data-im]').forEach(b => b.onclick = () => { LF.im = b.dataset.im; LF.iacct = ''; LF.iq = ''; LF.ist = ''; LF.ict = ''; invBrowser(LF, head); });
  }
}
/** 🏬 거래처별 인보이스 — 전체 거래처를 이름순으로, 치는 대로 걸러짐. 인보이스 번호를 치면 Enter 로 바로 찾기 */
function acctList(LF, head, modeSeg) {
  $('page').innerHTML = head + '<div class="card" style="padding-bottom:8px">' + modeSeg + '<input id="iqQ" placeholder="가게 이름 · 어카운트 # · 도시 · 인보이스 # / Store · Acct · City · Invoice" value="' + esc(LF.iq) + '" autocomplete="off"></div><div class="card"><div id="iaList"></div></div>';
  bindListHead(LF, head);
  let lim = 300;
  const paint = () => {
    const q = LF.iq.trim(), hits = q ? searchAccounts(S.accounts, q, 100000) : sortStores(S.accounts.filter(a => !a.inactive)), show = hits.slice(0, lim);   // 💤 비활성은 검색할 때만 (맨 뒤)
    const isNo = /^[A-Z]{1,2}-?\d{3,}$/i.test(q) || /^O\d{6}-/i.test(q);   // A42497 · P-007803 · O261022-… · SA-000123(주문)
    $('iaList').innerHTML = (isNo ? '<button class="b-blue" id="iaNo" style="margin-bottom:8px">🔎 ' + bi('인보이스 · 주문 번호로 찾기', 'Find by number') + ': ' + esc(q.toUpperCase()) + '</button>' : '') +
      '<div class="muted" style="margin:0 0 6px">' + (q ? bt('찾음', 'Found') : bt('전체 거래처 · 이름순', 'All customers · by name')) + ' ' + hits.length.toLocaleString() + ' — ' + bt('가게를 누르면 인보이스 전부', 'tap a store for its invoices') + '</div>' +
      (show.length ? show.map(a => '<div class="pr tap" data-ia="' + esc(a.acct) + '"><div class="ct"><b>' + esc(a.store) + (a.inactive ? ' <span class="tag t-g">💤</span>' : '') + '</b><small>' + esc(a.acct) + ' · ' + esc([a.city, a.state].filter(Boolean).join(', ')) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.terms ? ' · ' + esc(a.terms) : '') + '</small></div><div class="pa">›</div></div>').join('') : '<div class="none">없음 · no match</div>') +
      (hits.length > show.length ? '<button class="b-ghost" id="iaMore" style="margin-top:8px">' + bt('더 보기', 'More') + ' (' + (hits.length - show.length).toLocaleString() + ')</button>' : '');
    $('iaList').querySelectorAll('[data-ia]').forEach(el => el.onclick = () => { LF.iacct = el.dataset.ia; invBrowser(LF, head); });
    if ($('iaMore')) $('iaMore').onclick = () => { lim += 300; paint(); };
    if ($('iaNo')) $('iaNo').onclick = () => invBrowser(LF, head);
  };
  $('iqQ').oninput = debounce(() => { LF.iq = $('iqQ').value; lim = 300; paint(); }, 150);
  $('iqQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); LF.iq = $('iqQ').value; const q = LF.iq.trim(); if (/^[A-Z]{1,2}\d{3,}$/i.test(q) || /^O\d{6}-/i.test(q)) invBrowser(LF, head); } };
  document.querySelectorAll('[data-im]').forEach(b => b.onclick = () => { LF.im = b.dataset.im; LF.iacct = ''; LF.iq = ''; invBrowser(LF, head); });
  paint();
  if (!('ontouchstart' in window)) $('iqQ').focus();
}
/* 📊 인보이스 표 — 번호 · 종류 · 날짜 · 거래처 · 세일즈맨 · 주문 · 수량 · 합계 · 잔액 · 상태. 줄을 누르면 인보이스 */
/** 인보이스 표 — srt 를 주면 머리글을 눌러 정렬 (인보이스 # · 날짜 · 거래처 · 세일즈맨 · 합계 · 잔액, v0.8.190) · 폰은 정렬 칩 줄 */
export function iTbl(rowsHtml, srt) {
  if (narrow()) return (srt ? SH.chipsBar(srt) : '') + '<div class="crows itbl">' + rowsHtml + '</div>';
  const H = (k, lab, cls, st) => srt ? SH.th(k, lab, srt, cls, st) : '<th' + (cls ? ' class="' + cls + '"' : '') + (st ? ' style="' + st + '"' : '') + '>' + lab + '</th>';
  return '<div class="dtw"><table class="dt itbl"><thead><tr>' + H('no', bt('인보이스', 'Invoice'), '', 'width:124px') + H('d', bt('날짜', 'Date'), '', 'width:58px') + H('acct', bt('계정 #', 'Cust #'), 'hs', 'width:62px') + H('store', bt('거래처', 'Customer')) + H('sm', bt('세일즈맨', 'Rep'), 'hs', 'width:84px') + H('terms', bt('조건', 'Terms'), 'hs', 'width:70px') + H('order', bt('주문', 'S.O. #'), 'hs', 'width:112px') + H('qty', bt('수량', 'Qty'), 'r hs', 'width:56px') + H('total', bt('합계', 'Total'), 'r', 'width:88px') + H('bal', bt('잔액', 'Balance'), 'r', 'width:88px') + '<th style="width:60px">' + bt('상태', 'Status') + '</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
}
function invRow(r) {
  const amt = R2((r.total || 0) + (Number(r.ship) || 0));   // 🚚 운임 포함 금액
  const bal = r.bal != null ? r.bal : amt, paid = r.st !== 'x' && Math.abs(bal) < 0.005;
  const stTg = r.st === 'x' ? '<span class="tag t-r">VOID</span>' : paid ? '<span class="tag t-k">' + bt('완납', 'Paid') + '</span>' : bal < amt - 0.005 ? '<span class="tag t-c">' + bt('부분', 'Partial') + '</span>' : '<span class="tag t-f">' + bt('미결', 'Open') + '</span>';
  if (narrow()) return crow({ attr: ' data-go="inv:' + esc(r.no) + '"', cls: 'tap' + (r.st === 'x' ? ' dim' : ''), title: esc(r.store) + ' <span class="tag t-g">' + esc(r.t || '') + '</span>' + (r.terms ? ' <span class="tag t-f">' + esc(r.terms) + '</span>' : ''),
    sub: esc(r.no) + ' · ' + esc(md(r.d)) + (r.sm ? ' · ' + esc(r.sm) : '') + (r.acct ? ' · ' + esc(r.acct) : ''), sub2: (r.order ? esc(r.order) + ' · ' : '') + (r.qty || 0) + bt('개', ' pcs') + (r.disc ? ' · ' + r.disc + '%' : ''),
    badge: stTg, num: money(amt), numLab: r.st === 'x' ? '' : (bal > 0.005 ? '<span class="warn">' + bt('잔액', 'bal') + ' ' + money(bal) + '</span>' : '') });
  return '<tr class="tap' + (r.st === 'x' ? ' dim' : '') + '" data-go="inv:' + esc(r.no) + '"><td><b>' + esc(r.no) + '</b> <span class="tag t-g">' + esc(r.t || '') + '</span>' + (r.src === 'legacy' ? ' <span class="tag t-c">' + bt('이전', 'Legacy') + '</span>' : '') + '</td><td>' + esc(md(r.d)) + '</td><td class="hs sub0">' + esc(r.acct || '') + '</td><td class="wrap" style="min-width:140px"><b style="font-weight:600">' + esc(r.store) + '</b></td><td class="hs">' + (r.sm ? '<span class="tag t-x">' + esc(r.sm) + '</span>' : '') + '</td><td class="hs">' + (r.terms ? '<span class="tag t-f">' + esc(r.terms) + '</span>' : '') + '</td><td class="hs sub0">' + esc(r.order || '') + (r.disc ? ' · ' + r.disc + '%' : '') + '</td><td class="r hs sub0">' + (r.qty || 0) + '</td><td class="r"><b>' + money(amt) + '</b>' + (r.ship ? '<div class="muted" style="font-size:11px">🚚 ' + money(r.ship) + '</div>' : '') + '</td><td class="r' + (bal > 0.005 ? ' warn' : '') + '">' + (r.st === 'x' ? '' : money(bal)) + '</td><td>' + (r.st === 'x' ? '<span class="tag t-r">VOID</span>' : paid ? '<span class="tag t-k">' + bt('완납', 'Paid') + '</span>' : bal < amt - 0.005 ? '<span class="tag t-c">' + bt('부분', 'Partial') + '</span>' : '<span class="tag t-f">' + bt('미결', 'Open') + '</span>') + '</td></tr>';
}

export async function openBackorder(id) {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  const b = await S.DB.get('backorders', id);
  if (!b) { $('page').innerHTML = '<div class="card"><div class="none">백오더를 찾지 못했습니다</div></div>'; return; }
  const pick = b.lines.map(() => true);
  const paint = () => {
    $('page').innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between"><div><h2 style="margin:0">⏳ 백오더 — ' + esc(b.order) + ' ' + (b.st === 'open' ? '<span class="tag t-c">대기</span>' : '<span class="tag t-g">' + (b.st === 'used' ? '처리됨' : '닫힘') + '</span>') + '</h2><div style="font-size:17px;font-weight:800;margin-top:6px">' + esc(b.store) + '</div><div class="muted">' + esc(b.sm) + ' · ' + esc(b.d) + (b.newOrders && b.newOrders.length ? ' · 새 주문 ' + esc(b.newOrders.join(', ')) : '') + '</div></div><button class="b-ghost b-sm" id="bBack">‹ 목록</button></div></div>' +
      '<div class="card"><h2>' + b.lines.length + '줄 — 새 주문에 넣을 줄을 고르세요</h2>' + b.lines.map((l, i) => '<label class="pick ' + (pick[i] ? 'on' : '') + '" data-bi="' + i + '"><span class="ck">✓</span><span class="pm"><b>' + esc(l.c) + ' × ' + l.q + '</b><small>' + esc(l.d) + ' · ' + money(l.p) + ' · ' + esc(l.t || DT()) + '</small></span></label>').join('') +
      (b.st === 'open' ? '<div class="btns"><button class="b-ghost" id="bClose">백오더 닫기</button><button class="b-blue" id="bMake">고른 줄로 새 주문</button></div>' : '') + '</div>';
    $('bBack').onclick = () => Router.go('order');
    document.querySelectorAll('[data-bi]').forEach(el => el.onclick = e => { e.preventDefault(); pick[+el.dataset.bi] = !pick[+el.dataset.bi]; paint(); });
    if ($('bClose')) $('bClose').onclick = async () => { if (!(await confirmBox('이 백오더를 닫을까요? (보내지 않음)', '닫기'))) return; busy(true); try { await S.DB.update('backorders', id, { st: 'closed', closedAt: new Date().toISOString(), closedBy: S.user.email }); toast('닫았습니다'); Router.go('order'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
    if ($('bMake')) $('bMake').onclick = async () => {
      const sel = b.lines.filter((_, i) => pick[i]); if (!sel.length) return toast('줄을 고르세요', 'bad');
      const rest = b.lines.filter((_, i) => !pick[i]);
      busy(true);
      try {
        const now = new Date().toISOString(), d = today(), oid = 'O' + d.replace(/-/g, '').substring(2) + '-B' + Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0'), no = await takeSo();   // 🔢 백오더 새 주문도 바로 SA 번호 (문서 id 는 예전 모양)
        const acc = acctOf(b.acct);
        const doc = orderDoc({ id: oid, no, d, ym: ym(d), sm: b.sm, acct: b.acct, store: b.store, st: 'sent', memo: '백오더 (' + b.order + ')', createdBy: S.user.email, createdAt: now, updatedAt: now, sentAt: now, fromBo: id }, sel, acctDisc(acc));
        await S.DB.batch([{ op: 'set', col: 'orders', id: oid, data: doc }, { op: 'set', col: 'orderLines', id: oid, data: { sm: b.sm, lines: sel } },
          { op: 'update', col: 'backorders', id, data: { lines: rest.length ? rest : b.lines, st: rest.length ? 'open' : 'used', newOrders: (b.newOrders || []).concat([no]), qty: rest.reduce((a, l) => a + l.q, 0), amt: R2(rest.reduce((a, l) => a + l.q * l.p, 0)), updatedAt: now } }]);
        toast('새 주문 ' + no + ' (들어온 주문에 있음)', 'good'); goOrder(oid);
      } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  paint();
}

export async function openInvoice(no) {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  const x = await getInvoice(S, no);
  if (!x) { $('page').innerHTML = '<div class="card"><div class="none">인보이스를 찾지 못했습니다</div></div>'; return; }
  if (x.src === 'legacy' && !(x.lines || []).length) return legacyInvoice(x);
  if (x.src === 'credit') return Router.go('credit', encodeURIComponent(x.no));   /* ↩ 크레딧 메모는 크레딧 화면(확인 · VOID · 할인 백 · 인쇄)으로 */
  $('page').innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between"><div><h2 style="margin:0">📄 ' + esc(x.no) + (x.st === 'x' ? ' <span class="tag t-r">VOID</span>' : '') + '</h2><div style="font-size:17px;font-weight:800;margin-top:6px">' + esc(x.store) + '</div><div class="muted">' + esc(x.sm) + ' · ' + esc(x.d) + ' · 주문 <a href="#/order/' + esc(x.orderId) + '">' + esc(x.order) + '</a></div></div><button class="b-ghost b-sm" id="iBack">‹ ' + bi('목록', 'List') + '</button></div>' +
    '<div class="kpi"><div><b>' + x.qty + '</b><span>수량</span></div><div><b>' + money(x.sub) + '</b><span>금액</span></div><div><b>' + (x.disc ? x.disc + '%' : '—') + '</b><span>할인</span></div><div><b>' + money(x.total) + '</b><span>합계</span></div></div>' +
    '<div class="btns"><button class="b-blue" id="iPrint">🖨 ' + bi('인쇄', 'Print') + '</button>' + (can('void') && x.st !== 'x' ? '<button class="b-ghost" id="iVoid" style="color:#991b1b">🚫 VOID</button>' : '') + '</div>' + (x.st === 'x' ? '<div class="alert a-red">🚫 VOID · ' + esc(String(x.voidAt || '').substring(0, 10)) + ' · ' + esc(String(x.voidBy || '').split('@')[0]) + (x.voidReason ? ' — ' + esc(x.voidReason) : '') + '</div>' : '') + '</div>' +
    '<div class="card"><table><tr><th>코드</th><th class="r">수량</th><th class="r">가격</th><th class="r">금액</th></tr>' + x.lines.map(l => '<tr><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d) + '</div></td><td class="r">' + l.q + '</td><td class="r">' + money(l.p) + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') + '</table></div>';
  $('iBack').onclick = () => Router.go('order');
  $('iPrint').onclick = () => printInvoices([x], acctOf(x.acct));
  if ($('iVoid')) $('iVoid').onclick = () => voidModal([x], () => openInvoice(no));
}

/** 이전 시스템(SmartBee)에서 가져온 인보이스 — 품목 줄은 없고 합계 · 잔액 · 조건만 */
function legacyInvoice(x) {
  const bal = x.bal != null ? x.bal : null, paid = bal != null ? R2((x.total || 0) - bal) : null;
  $('page').innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">📄 ' + esc(x.no) + ' <span class="tag t-g">' + esc(x.t || '') + '</span> <span class="tag t-c">' + bt('이전 시스템', 'Legacy') + '</span></h2>' +
    '<div style="font-size:17px;font-weight:800;margin-top:6px">' + esc(x.store) + ' <span class="muted" style="font-weight:400">' + esc(x.acct || '') + '</span></div>' +
    '<div class="muted">' + esc(x.sm || '') + ' · ' + esc(x.d) + (x.terms ? ' · ' + esc(x.terms) : '') + (x.shipVia ? ' · ' + esc(x.shipVia) : '') + (x.order ? ' · ' + bt('주문', 'Order') + ' ' + esc(x.order) : '') + '</div></div>' +
    '<button class="b-ghost b-sm" id="iBack">‹ ' + bi('목록', 'List') + '</button></div>' +
    '<div class="kpi" style="margin-top:10px"><div><b>' + money(x.sub || x.total) + '</b><span>' + bt('금액', 'Amount') + '</span></div><div><b>' + (x.discAmt ? '−' + money(x.discAmt) : '—') + '</b><span>' + bt('할인', 'Discount') + '</span></div><div><b>' + money(x.total) + '</b><span>' + bt('합계', 'Total') + '</span></div>' +
    '<div><b' + (bal > 0.005 ? ' style="color:#b91c1c"' : '') + '>' + (bal == null ? '—' : money(bal)) + '</b><span>' + bt('잔액', 'Balance') + '</span></div></div>' +
    (x.ship ? '<div class="muted">' + bt('배송비', 'Freight') + ' ' + money(x.ship) + '</div>' : '') +
    '<div class="alert a-blu" style="margin-top:8px">' + bt('이전 시스템(SmartBee)에서 가져온 인보이스입니다 — 품목 줄은 SmartBee 에 있습니다. 잔액은 가져올 때 기준이고, 지금 미수금은 AR 기준입니다.', 'Imported from SmartBee — line items are in SmartBee. Balance is as of import; current A/R comes from the AR upload.') + (paid != null && paid > 0.005 && bal > 0.005 ? '<br>' + bt('가져올 때까지 받은 돈', 'Paid by import') + ' ' + money(paid) : '') + '</div>' +
    '<div class="btns"><button class="b-ghost" id="iStore">🏬 ' + bi('가게 창', 'Store') + '</button></div></div>';
  $('iBack').onclick = () => Router.go('order');
  $('iStore').onclick = () => storeSheet(x.acct);
}

/* ---- ✕ 주문 취소 — 사유를 꼭 적고 한 번 더 확인 (잘못 눌러 바로 취소되는 일 방지) · 세일즈맨에게 사유와 함께 알림 ---- */
const CANCEL_WHY = [['가게가 주문 취소', 'Store cancelled'], ['중복 주문', 'Duplicate order'], ['세일즈맨 요청', 'Salesman asked'], ['재고 없음 · 출고 불가', 'Out of stock'], ['잘못 넣은 주문', 'Entered by mistake']];
export function cancelledBox(o) {
  return '<div class="alert a-red">✕ <b>' + bi('취소된 주문', 'Cancelled order') + '</b>' + (o.cancelWhy ? ' — ' + bi('사유', 'Reason') + ': <b>' + esc(o.cancelWhy) + '</b>' : '') + '<div class="muted" style="font-size:12px;margin-top:2px">' + esc(String(o.cancelBy || '').split('@')[0]) + (o.cancelAt ? ' · ' + esc(String(o.cancelAt).substring(0, 16).replace('T', ' ')) : '') + '</div></div>';
}
/** ✕ 주문 취소 — 담당자: 세일즈맨에게 알림 · 세일즈맨(self): 작업 시작 전 자기 주문, 사무실에 알림 */
export async function cancelAsk(o, self) {
  openModal('<h2 style="color:#991b1b">✕ ' + bi('주문 취소', 'Cancel order') + '</h2>' +
    '<div class="sumbox"><b>' + esc(o.no || o.id) + '</b> · ' + esc(o.store) + '<br><span class="muted">' + esc(o.sm || '') + ' · ' + esc(o.d || '') + ' · ' + (o.qty || 0) + bi('개', ' pcs') + ' · ' + money(o.amt || 0) + '</span></div>' +
    '<div class="alert a-amb">' + (self ? bi('취소하면 사무실 작업 목록에서 빠지고 되돌릴 수 없습니다. 사무실에 사유와 함께 알림이 갑니다. 다시 필요하면 새 주문으로 넣으세요.', 'Cancelling removes the order from the office work list and cannot be undone. The office is notified. Enter a new order if needed again.') : bi('취소하면 이 주문은 작업 목록에서 빠지고 되돌릴 수 없습니다. 세일즈맨에게 사유와 함께 알림이 갑니다.', 'Cancelling removes this order from the work list and cannot be undone. The salesman is notified with the reason.')) + '</div>' +
    '<div class="fg"><label>' + bi('취소 사유 (필수)', 'Reason (required)') + '</label><div class="chips" style="margin:0 0 6px">' + CANCEL_WHY.map(w => '<button data-cxw="' + esc(w[0]) + '">' + bi(w[0], w[1]) + '</button>').join('') + '</div><input id="cxWhy" placeholder="' + esc(bi('사유를 적으세요', 'Type the reason')) + '" autocomplete="off"></div>' +
    '<div class="btns"><button class="b-ghost" id="cxX">' + bi('돌아가기', 'Back') + '</button><button class="b-red" id="cxGo" disabled>✕ ' + bi('이 주문을 취소합니다', 'Cancel this order') + '</button></div>');
  const chk = () => { $('cxGo').disabled = !$('cxWhy').value.trim(); };
  document.querySelectorAll('[data-cxw]').forEach(b => b.onclick = () => { $('cxWhy').value = b.dataset.cxw; document.querySelectorAll('[data-cxw]').forEach(x => x.classList.toggle('on', x === b)); chk(); });
  $('cxWhy').oninput = chk; $('cxX').onclick = closeModal;
  $('cxGo').onclick = async () => {
    const why = $('cxWhy').value.trim(); if (!why) return;
    if (!(await confirmBox(bt('정말 취소할까요?', 'Really cancel?') + '\n' + (o.no || o.id) + ' · ' + o.store + '\n' + bt('사유', 'Reason') + ': ' + why, '✕ ' + bt('취소 확정', 'Confirm cancel')))) return;
    busy(true);
    try {
      const now = new Date().toISOString();
      await S.DB.update('orders', o.id, Object.assign({ st: 'x', updatedAt: now, cancelBy: S.user.email, cancelWhy: why, cancelAt: now }, self ? { cancelSelf: true } : {}));
      if (o.st !== 'draft') try { const N = await import('./notify.js'); await N.queue(Object.assign({ kind: 'cancel', chat: true, orderId: o.id, subject: '[THE ONE] ✕ 주문 취소 — ' + o.store + (self ? ' (' + o.sm + ')' : ''), text: '✕ 주문 취소 ' + (self ? '(세일즈맨) ' + o.sm : '→ ' + o.sm) + ' · ' + o.store + ' (' + (o.no || o.id) + ', ' + money(o.amt || 0) + ')\n사유: ' + why, url: N.appUrl('order/' + o.id) }, self ? { toStaff: true } : { toSm: o.sm })); } catch (e) {}
      closeModal(); toast(bt('취소했습니다', 'Cancelled') + ' — ' + why); goOrder(o.id);
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}

/* ============================================================
 *  🚫 인보이스 VOID — 잘못 만든 · 중복 · 가게가 틀린 인보이스 (오피스 매니저 · 인보이스 담당 · 관리자만)
 *    번호는 다시 쓰지 않음 (VOID 로 남음). 이유를 꼭 남김. 매출 집계에서 빠짐
 *    주문의 인보이스가 모두 VOID 되면 주문을: ↩️ 검수 대기로 되돌려 다시 발행 · ✕ 주문 취소 · 그대로 둠
 * ============================================================ */
const VOID_WHY = [['중복 인보이스', 'Duplicate'], ['잘못 발행 (수량 · 가격 · 종류)', 'Wrong qty / price / type'], ['가게 · 주소 잘못', 'Wrong store / address'], ['주문 취소', 'Order cancelled']];
export async function voidModal(invs, done) {
  if (!can('void')) return toast('VOID 는 오피스 매니저 · 인보이스 담당 · 관리자만 할 수 있습니다', 'bad');
  invs = invs.filter(x => x && x.st !== 'x'); if (!invs.length) return toast('VOID 할 인보이스가 없습니다', 'bad');
  let o = null; const oid = invs[0].orderId; if (oid) { try { o = await S.DB.get('orders', oid); } catch (e) {} }
  const pick = invs.map(() => true);
  let why = '', what = 'redo';
  const paint = () => {
    const sel1 = invs.filter((_, i) => pick[i]), left = o ? (o.invs || []).filter(n => !sel1.some(x => x.no === n)) : [];
    let liveLeft = left.length;   // 남는 인보이스 (이미 VOID 된 것은 아래에서 빼고 셈)
    if (o && o.voidedInvs) liveLeft = left.filter(n => !o.voidedInvs.includes(n)).length;
    const allGone = o && liveLeft === 0, paid = sel1.filter(x => x.bal != null && Math.abs(x.bal - x.total) > 0.005);
    $('mbox').innerHTML = '<h2>🚫 ' + bi('인보이스 VOID', 'Void invoice') + '</h2><div class="muted">' + bi('VOID 한 번호는 다시 쓰지 않고 VOID 로 남습니다. 매출 · 미수 집계에서 빠집니다.', 'The number stays as VOID and is never reused.') + '</div>' +
      invs.map((x, i) => '<label class="pick ' + (pick[i] ? 'on' : '') + '" data-vi="' + i + '" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>' + esc(x.no) + ' · ' + money(x.total) + '</b><small>' + esc(x.store) + ' · ' + esc(x.d) + ' · ' + esc(x.t || '') + '</small></span></label>').join('') +
      (paid.length ? '<div class="alert a-amb">💵 ' + paid.map(x => esc(x.no)).join(', ') + ' — ' + bt('이미 수금이 들어간 인보이스입니다. 수금 기록은 따로 정리하세요.', 'Payments were already applied — fix them separately.') + '</div>' : '') +
      '<div class="fg" style="margin-top:8px"><label>' + bi('이유 (꼭)', 'Reason (required)') + '</label><div class="chips" style="flex-wrap:wrap">' + VOID_WHY.map(w => '<button class="' + (why === w[0] ? 'on' : '') + '" data-vw="' + esc(w[0]) + '">' + w[0] + ' <span class="en">' + w[1] + '</span></button>').join('') + '</div><input id="vwTxt" placeholder="' + esc(bt('직접 쓰기 · 메모', 'Other / note')) + '" value="' + esc(VOID_WHY.some(w => w[0] === why) ? '' : why) + '"></div>' +
      (allGone ? '<div class="fg"><label>' + bi('주문 ' + o.no + ' 은 어떻게 할까요?', 'What about the order?') + '</label><div class="seg" style="flex-wrap:wrap">' + [['redo', '↩️ ' + bi('검수 대기로 — 다시 발행', 'Back to review — re-issue')], ['cancel', '✕ ' + bi('주문 취소', 'Cancel order')], ['keep', bi('그대로', 'Leave as is')]].map(c => '<button class="' + (what === c[0] ? 'on' : '') + '" data-vo="' + c[0] + '">' + c[1] + '</button>').join('') + '</div></div>' : '') +
      '<div class="btns"><button class="b-ghost" id="vX">' + bt('닫기', 'Close') + '</button><button class="b-red" id="vOk">🚫 VOID ' + sel1.length + '</button></div>';
    document.querySelectorAll('[data-vi]').forEach(el => el.onclick = e => { e.preventDefault(); pick[+el.dataset.vi] = !pick[+el.dataset.vi]; paint(); });
    document.querySelectorAll('[data-vw]').forEach(b => b.onclick = () => { why = b.dataset.vw; paint(); });
    document.querySelectorAll('[data-vo]').forEach(b => b.onclick = () => { what = b.dataset.vo; paint(); });
    $('vwTxt').oninput = () => { why = $('vwTxt').value; };
    $('vX').onclick = closeModal;
    $('vOk').onclick = async () => {
      const L = invs.filter((_, i) => pick[i]); if (!L.length) return toast('인보이스를 고르세요', 'bad');
      const reason = ($('vwTxt').value.trim() || why).trim(); if (!reason) return toast('VOID 이유를 고르거나 쓰세요', 'bad');
      const act = allGone ? what : 'keep';
      if (!(await confirmBox(L.map(x => x.no).join(', ') + ' — VOID?\n' + reason + (allGone ? '\n' + ({ redo: '주문 → 검수 대기 (다시 발행)', cancel: '주문 취소', keep: '주문은 그대로' })[act] : ''), 'VOID'))) return paint();
      busy(true);
      try {
        const now = new Date().toISOString(), ops = L.map(x => ({ op: 'update', col: 'invoices', id: x.no, data: { st: 'x', bal: 0, voidAt: now, voidBy: S.user.email, voidReason: reason } }));
        if (o) {
          const vd = (o.voidedInvs || []).concat(L.map(x => x.no)), p = { voidedInvs: vd, updatedAt: now };
          if (act === 'redo') Object.assign(p, { st: 'picked', invs: [], doneAt: null, bo: '' });
          if (act === 'cancel') Object.assign(p, { st: 'x', cancelBy: S.user.email, cancelWhy: reason, cancelAt: now });
          ops.push({ op: 'update', col: 'orders', id: o.id, data: p });
          if ((act === 'redo' || act === 'cancel') && o.bo) { const b = await S.DB.get('backorders', o.id).catch(() => null); if (b && b.st === 'open') ops.push(act === 'redo' ? { op: 'del', col: 'backorders', id: o.id } : { op: 'update', col: 'backorders', id: o.id, data: { st: 'closed', closedAt: now, closedBy: S.user.email } }); }
        }
        await S.DB.batch(ops); dropInvCache(monthsOf(L)); await bumpSalesM(S, L, -1); stockBack(L);   // 📦 재고 되돌리기
        toast('🚫 VOID ' + L.map(x => x.no).join(', ') + (act === 'redo' ? ' — 주문이 검수 대기로 돌아갔습니다' : ''), 'good');
        closeModal(); if (done) done(act, o);
      } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  openModal(''); paint();
}
