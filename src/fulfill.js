/* ============================================================
 *  주문 처리 (매니저) — 이전 시스템의 Sales Order → Sales Invoice 흐름
 *    ① 들어온 주문 확인 (가격 수정 · 할인 변경 표시) → 🖨 픽킹 인보이스 인쇄 = 픽킹 시작
 *    ② 픽킹 결과 입력 (실제 담은 수량 · 줄 추가/수정 · 메모) → 모자란 것은 백오더
 *    ③ 🧾 인보이스 확정 → 종류(A · P · W …)별 세일즈 인보이스 번호 발행 · 인쇄
 *    ④ 백오더는 매니저가 골라서 새 주문로 만들거나 닫음
 *  backorders/{orderId} = { id, order, acct, store, sm, d, lines:[{c,d,q,p,lp,t}], qty, amt, st:'open'|'used'|'closed', newOrders:[], createdAt }
 * ============================================================ */
import { $, esc, money, R2, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, sel, sortBy, printOpen, debounce, bi, bt, hasWords, localDay, pickDates } from './ui.js';
import { jobOf, can, jobCan } from './main.js';
import { loadCatalog, catalog, exactItem, locOf, aisleOf, pickSort } from './catalog.js';
import { invTypes, typeOfItem, acctDisc, splitByType, priceDiff, nextInvoiceNo, invoiceHtml, company, docHead, invView, setInvView, dropInvCache, bumpSalesM, invoicesBetween } from './invoicing.js';
import { storeInfo } from './store.js';
import { stTag, cfTag, goOrder, openEditor, orderDoc, typeSummary, recentYms, canEdit, fillStrip } from './orders.js';
import { bumpAccountsVer, storeForm } from './mgr.js';
import { storeSheet } from './store.js';
import { searchAccounts } from './accounts.js';

let S = null;
const DT = () => invTypes(S)[0].c;   // 기본 인보이스 종류
export function register(state) { S = state; }
const acctOf = a => (S.accounts.byCode ? S.accounts.byCode[a] : null);
/** 인보이스 인쇄 — AR 에이징(가게 창 자료)과 회사 정보를 붙여서 */
async function printInvoices(invs, acc) {
  let ar = null; try { const i = await storeInfo(invs[0].acct, true); ar = i && i.asOf ? { asOf: i.asOf, bk: i.bk, bal: i.bal } : null; } catch (e) {}
  try { await loadCatalog(S); } catch (e) {}
  const v = invView(S);
  const paint = () => {
    const bar = '<div class="noprint ivopts"><span>' + bi('정렬', 'Sort') + '</span>' + [['group', '분류별 묶음', 'By line'], ['abc', '코드 ABC', 'Code A→Z'], ['order', '주문 순서', 'Order entry']].map(x => '<button class="' + (v.sort === x[0] ? 'on' : '') + '" data-ivs="' + x[0] + '">' + x[1] + ' <span class="en">' + x[2] + '</span></button>').join('') +
      '<span>' + bi('세트', 'Sets') + '</span>' + [['open', '구성품 펼침', 'Show contents'], ['closed', '세트 한 줄', 'One line']].map(x => '<button class="' + (v.kits === x[0] ? 'on' : '') + '" data-ivk="' + x[0] + '">' + x[1] + ' <span class="en">' + x[2] + '</span></button>').join('') + '</div>';
    printOpen(bar + invs.map(x => invoiceHtml(x, acc, { co: company(S), ar, view: v })).join(''));
    document.querySelectorAll('[data-ivs]').forEach(b => b.onclick = () => { v.sort = b.dataset.ivs; setInvView(v); paint(); });
    document.querySelectorAll('[data-ivk]').forEach(b => b.onclick = () => { v.kits = b.dataset.ivk; setInvView(v); paint(); });
  };
  paint();
}
const typeName = c => { const t = invTypes(S).find(x => x.c === c); return t ? t.n : c; };

/* ============================================================
 *  주문 처리 화면
 * ============================================================ */
export function manage(o, lines) {
  lines = lines.map(l => Object.assign({}, l));
  const picking = o.st === 'pick' || o.st === 'ok' || o.st === 'picked';   // 픽킹 수량을 만질 수 있는 상태 (픽킹 완료 뒤에도 사무실이 고칠 수 있음)
  if (picking) lines.forEach(l => { if (l.pq == null) l.pq = l.q; });
  const acc = acctOf(o.acct), ad = acctDisc(acc);
  const pd = priceDiff(lines, 'q');
  let h = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">' + esc(o.no) + ' ' + stTag(o.st) + '</h2>' +
    '<div style="font-size:18px;font-weight:800;margin-top:6px">' + esc(o.store) + '</div>' +
    '<div class="muted">' + esc([o.acct, o.shipTo ? [o.shipTo.addr, o.shipTo.city, o.shipTo.state].filter(Boolean).join(', ') + ' (이 주문만)' : acc ? [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : ''].filter(Boolean).join(' · ')) + (acc && acc.terms ? ' · ' + esc(acc.terms) : '') + '</div>' +
    (o.storeChg && o.storeChg.length ? '<div class="muted" style="font-size:12px">🏬 가게 변경 ' + o.storeChg.length + '번 · 마지막: ' + esc(o.storeChg[o.storeChg.length - 1].from.store) + ' → ' + esc(o.storeChg[o.storeChg.length - 1].to.store) + ' (' + esc(String(o.storeChg[o.storeChg.length - 1].by).split('@')[0]) + ')</div>' : '') +
    '<div class="muted">' + esc(o.sm) + ' · ' + esc(o.d) + (o.sentAt ? ' · 들어옴 ' + esc(o.sentAt.substring(5, 16).replace('T', ' ')) : '') + (o.pickAt ? ' · 픽킹 ' + esc(o.pickAt.substring(5, 16).replace('T', ' ')) + (o.pickerName ? ' 👷 ' + esc(o.pickerName) : '') : '') + (o.pickDoneAt ? ' · 픽킹 완료 ' + esc(o.pickDoneAt.substring(5, 16).replace('T', ' ')) : '') + (o.shipAt ? ' · 출고 ' + esc(o.shipAt.substring(5, 16).replace('T', ' ')) + (o.track ? ' 🚚 ' + esc(o.track) : '') : '') + '</div>' + cfTag(o) + '</div>' +
    '<button class="b-ghost b-sm" id="mBack">‹ ' + bi('목록', 'List') + '</button></div>' +
    (acc && acc.note ? '<div class="alert a-blu">🏬 ' + esc(acc.note) + '</div>' : '') +
    (o.memo ? '<div class="alert a-blu">📝 ' + esc(o.memo) + '</div>' : '') +
    '<div id="mSum"></div>';
  /* 가격 수정 · 할인 변경 — 매니저가 꼭 봐야 하는 것 */
  if (pd.n) h += '<div class="alert a-amb">💲 세일즈맨 가격 수정 <b>' + pd.n + '줄</b> · 목록가 ' + money(pd.list) + ' → ' + money(pd.real) + ' (<b>' + (pd.diff >= 0 ? '+' : '') + money(pd.diff) + ', ' + pd.pct + '%</b>) <button class="b-ghost b-sm" id="mShowP">줄 보기</button></div>';
  const dk = {}; Object.keys(ad).concat(Object.keys(o.disc || {})).forEach(k => { dk[k] = 1; });
  const dchg = Object.keys(dk).filter(k => Number((o.disc || {})[k] || 0) !== Number(ad[k] || 0));
  if (dchg.length) h += '<div class="alert a-amb">🏷 할인 변경: ' + dchg.map(k => '<b>' + esc(k) + '</b> 주문 ' + ((o.disc || {})[k] || 0) + '% · 가게 기본 ' + (ad[k] || 0) + '%').join(' · ') +
    (o.acct && can('invoice') ? ' <button class="b-ghost b-sm" id="mDiscSave">이 할인을 가게 기본으로 · set as store default</button>' : '') + '</div>';
  h += '</div>';
  /* 버튼 */
  /* 픽킹·팩킹 담당은 픽킹까지만 — 인보이스 확정 · 주문 취소 · 할인 저장은 인보이스 · 오피스 담당이 */
  const J = jobOf(), canInv = can('invoice');
  const B = [];
  const isPicker = o.picker === S.user.email;
  if (o.st === 'draft') B.push('<button class="b-green" id="mSend">📤 ' + bi('접수로 보내기', 'Submit order') + '</button>');
  if (o.st === 'sent') B.push((can('assign') ? '<button class="b-blue" id="mAssign">👷 ' + bi('작업 배정', 'Assign Picker') + '</button>' : '') + (can('pick') ? '<button class="b-ghost" id="mPick">🖨 ' + bi('직접 작업 시작', 'Start Myself') + '</button>' : ''));
  if (o.st === 'pick' || o.st === 'ok') B.push('<button class="b-ghost" id="mPickSave">💾 ' + bi('작업 저장', 'Save Progress') + '</button><button class="b-green" id="mPickDone">✅ ' + bi('작업 완료', 'Complete Picking') + '</button>');
  if (o.st === 'picked') B.push('<button class="b-ghost" id="mPickSave">💾 ' + bi('수량 저장', 'Save') + '</button>' + (canInv ? '<button class="b-green" id="mInv">🧾 ' + bi('인보이스 발행', 'Issue invoice') + '</button>' : '<span class="muted" style="align-self:center">' + bi('인보이스 발행은 사무실에서 합니다', 'Office issues the invoice') + '</span>'));
  if (o.st === 'done' && can('ship')) B.push('<button class="b-green" id="mShip">🚚 ' + bi('포장 · 출고 완료', 'Packed & shipped') + '</button>');
  h += '<div class="card"><div class="btns" style="margin-top:0;flex-wrap:wrap">' +
    (picking ? '<button class="b-ghost b-sm" id="mPickPrint">🖨 ' + bi('픽킹 인보이스', 'Picking list') + '</button>' : '') +
    (o.acct ? '<button class="b-ghost b-sm" id="mStoreI">📋 ' + bi('가게 기록', 'Store') + '</button>' : '') +
    (o.st !== 'x' && canInv ? '<button class="b-ghost b-sm" id="mStoreChg">🏬 ' + bi('가게 바꾸기', 'Change store') + '</button>' : '') +
    (canEdit(o) && canInv ? '<button class="b-ghost b-sm" id="mEdit">✏️ ' + bi('주문 수정', 'Edit') + '</button>' : '') +
    (can('assign') && (o.st === 'pick' || o.st === 'ok') ? '<button class="b-ghost b-sm" id="mUnpick">↩️ ' + bi('신규 주문으로 되돌리기', 'Return to New Orders') + '</button><button class="b-ghost b-sm" id="mReassign">👷 ' + bi('작업자 변경', 'Reassign Picker') + '</button>' : '') +
    (o.st === 'picked' ? '<button class="b-ghost b-sm" id="mRepick">↩️ ' + bi('출고 작업으로 되돌리기', 'Return to Fulfillment') + '</button>' : '') +
    (o.st === 'shipped' ? '<button class="b-ghost b-sm" id="mUnship">↩️ ' + bi('출고 취소', 'Undo shipping') + '</button>' : '') +
    ((o.st === 'sent' || o.st === 'pick' || o.st === 'ok') && !o.cfOk ? '<button class="b-ghost b-sm" id="mCfReq">❓ ' + bi(o.cfReq ? '확인 다시 요청' : '세일즈맨 확인 요청', 'Ask salesman') + '</button>' : '') +
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
  $('page').innerHTML = h;

  let MF = 'all';
  const sumNow = () => { $('mSum').innerHTML = (picking ? '<div class="muted" style="margin-top:8px">🧾 픽킹한 수량 기준 — 확정하면 종류마다 인보이스가 따로 나옵니다 <span class="en">Based on picked qty; one invoice per type on confirm</span></div>' : '<div class="muted" style="margin-top:8px">🧾 주문 수량 기준 미리보기 — 픽킹 후 확정 <span class="en">Preview by ordered qty; split after picking</span></div>') + typeSummary(splitByType(lines, o.disc, picking ? 'pq' : 'q')) + (picking ? boLine() : ''); };
  const boLine = () => { const b = lines.filter(l => (l.pq || 0) < l.q), u = lines.filter(l => !l.ok); return (u.length ? '<div class="alert a-amb">○ 아직 두드리지 않은 줄 <b>' + u.length + '</b> / ' + lines.length + ' <span class="en">not yet checked</span></div>' : '') + (b.length ? '<div class="alert a-red">⏳ 백오더 ' + b.length + '줄 · ' + b.reduce((a, l) => a + l.q - (l.pq || 0), 0) + '개</div>' : u.length ? '' : '<div class="alert a-grn">✓ 모두 픽킹됨</div>'); };
  const types = invTypes(S), office = picking && o.st === 'picked' && canInv;   // 인보이스 종류는 사무실 확인 단계에서만 바꿈
  /* 픽킹 입력은 두드려서: 처음 한 번 = ✓ 통과(주문 수량), 다시 = ⏳ 백오더(0), 다시 = ✓ … · ✎ 수량 으로 일부만 담았을 때 숫자 입력 */
  const pkBtn = l => { const pq = l.pq || 0, st = !l.ok ? 'u' : pq >= l.q ? 'ok' : pq === 0 ? 'bo' : 'part'; const ic = st === 'u' ? '○' : st === 'ok' ? '✓' : st === 'bo' ? '⏳' : '◐'; return '<button class="pkb ' + st + '" data-pkt="' + l._i + '">' + ic + ' <b>' + pq + '</b><span>/' + l.q + '</span></button><button class="b-ghost pkq" data-pkq="' + l._i + '">✎ ' + bi('수량', 'Qty') + '</button>'; };
  const paint = () => {
    const q = $('mFind').value.trim().toUpperCase();
    let rows = lines.map((l, i) => Object.assign({ _i: i }, l));
    if (picking) rows.sort(pickSort);   // 픽킹 중에는 창고 통로 순
    if (q) rows = rows.filter(l => hasWords(l.c + ' ' + l.d, q));
    if (MF === 'bo') rows = rows.filter(l => (l.pq || 0) < l.q);
    if (MF === 'u') rows = rows.filter(l => !l.ok);
    if (MF === 'p') rows = rows.filter(l => l.lp != null && Math.abs(l.lp - l.p) > 0.0001);
    $('mLines').innerHTML = '<table class="pk"><tr><th>코드</th><th class="r">주문</th>' + (picking ? '<th class="r">픽</th>' : '') + '<th class="r">가격</th><th class="r">금액</th></tr>' + rows.slice(0, 2500).map(l => {
      const chg = l.lp != null && Math.abs(l.lp - l.p) > 0.0001, bo = picking && l.ok && (l.pq || 0) < l.q;
      const qq = picking ? (l.pq || 0) : l.q;
      const loc = picking ? locOf(l.c) : '';
      return '<tr class="' + (bo ? 'bo' : '') + (picking && l.ok && !bo ? ' okd' : '') + '"><td>' + (loc ? '<span class="loc">📍' + esc(loc) + '</span> ' : '') + '<b>' + esc(l.c) + '</b> ' + (office ? sel('', types.map(t => [t.c, t.c]), l.t || DT(), 'class="tsel" data-t="' + l._i + '"') : '<span class="tag t-g">' + esc(l.t || DT()) + '</span>') +
        '<div class="muted" style="font-size:11.5px">' + esc(l.d) + '</div>' + (l.kit ? '<div class="muted" style="font-size:11px">🧩 ' + l.kit.map(k => esc(k.c) + '×' + k.q).join(', ') + (picking ? ' <button class="b-ghost b-sm" data-brk="' + l._i + '" style="padding:2px 7px">세트 풀기</button>' : '') + '</div>' : '') + (picking ? '<input class="sm" data-note="' + l._i + '" value="' + esc(l.note || '') + '" placeholder="메모" style="margin-top:3px;padding:4px 7px;font-size:12px">' : (l.note ? '<div class="muted">📝 ' + esc(l.note) + '</div>' : '')) + '</td>' +
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
        setTimeout(() => { $('pqIn').focus(); $('pqIn').select(); }, 50); });
    };
    bindPk($('mLines'));
    document.querySelectorAll('[data-t]').forEach(s => s.onchange = () => { lines[+s.dataset.t].t = s.value; dirty = true; sumNow(); });
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
  sumNow(); paint();
  $('mFind').oninput = debounce(paint, 150);
  $('mFind').onkeydown = e => { if (e.key !== 'Enter' || !picking) return; e.preventDefault(); const v = $('mFind').value.trim().toUpperCase(); const i = lines.findIndex(l => l.c === v || (catalog() && exactItem(v) && exactItem(v).c === l.c)); if (i < 0) return toast('이 주문에 없는 코드입니다', 'bad'); lines[i].pq = (lines[i].ok ? (lines[i].pq || 0) : 0) + 1; lines[i].ok = true; dirty = true; $('mFind').value = ''; sumNow(); paint(); toast(lines[i].c + ' 픽 ' + lines[i].pq + ' / ' + lines[i].q, 'good'); };
  document.querySelectorAll('[data-mf]').forEach(b => b.onclick = () => { MF = b.dataset.mf; document.querySelectorAll('[data-mf]').forEach(x => x.classList.toggle('on', x === b)); paint(); });
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
    $('aX').onclick = closeModal; setTimeout(() => $('aCode').focus(), 50);
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
  if ($('mSend')) $('mSend').onclick = async () => { if (!(await confirmBox(o.store + ' — ' + lines.length + '줄 · ' + money(o.amt) + ' 주문를 들어온 주문로 보낼까요?', '보내기'))) return; busy(true); try { const now = new Date().toISOString(); await S.DB.update('orders', o.id, { st: 'sent', sentAt: now, updatedAt: now }); toast('보냈습니다 📤', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mAssign')) $('mAssign').onclick = () => assignPicker([o], () => goOrder(o.id));
  if ($('mReassign')) $('mReassign').onclick = () => assignPicker([o], () => goOrder(o.id));
  if ($('mPickDone')) $('mPickDone').onclick = async () => {
    const b = lines.filter(l => (l.pq || 0) < l.q), n = b.reduce((a, l) => a + l.q - (l.pq || 0), 0), u = lines.filter(l => !l.ok).length;
    if (!(await confirmBox('작업 완료로 넘길까요? (검수 대기)' + (u ? '\n○ 두드리지 않은 줄 ' + u + '개는 주문 수량대로 담은 것으로 처리합니다.' : '') + (b.length ? '\n⏳ 부족(백오더) ' + b.length + '줄 · ' + n + '개는 사무실이 확인 뒤 백오더로 남깁니다.' : '\n✓ 전부 픽킹됨') + '\n사무실 확인 → 인보이스 발행으로 넘어갑니다.', '픽킹 완료'))) return;
    busy(true); try { await saveLines({ st: 'picked', pickDoneAt: new Date().toISOString(), pickDoneBy: S.user.email }); dirty = false; toast('✅ 작업 완료 — 검수 대기 · Ready for Review', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
  };
  if ($('mRepick')) $('mRepick').onclick = async () => { busy(true); try { await saveLines({ st: 'pick' }); toast('출고 작업으로 되돌림 · Back to Fulfillment'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mCfReq')) $('mCfReq').onclick = async () => { if (!(await confirmBox(o.sm + ' 에게 이 주문 내용 확인을 요청할까요? 세일즈맨 앱 홈에 "확인 요청" 으로 뜹니다.', '요청'))) return; busy(true); try { await S.DB.update('orders', o.id, { cfReq: true, cfReqAt: new Date().toISOString(), cfReqBy: S.user.email, cfOk: false }); toast('확인 요청 보냄', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mShip')) $('mShip').onclick = () => shipModal(o);
  if ($('mUnship')) $('mUnship').onclick = async () => { if (!(await confirmBox('출고 완료를 취소할까요? (포장 대기로 돌아감)', '취소'))) return; busy(true); try { await S.DB.update('orders', o.id, { st: 'done', updatedAt: new Date().toISOString() }); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mPickPrint')) $('mPickPrint').onclick = () => printPicking(o, lines);
  if ($('mPickSave')) $('mPickSave').onclick = async () => { busy(true); try { await saveLines(); dirty = false; toast('픽킹 저장', 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mUnpick')) $('mUnpick').onclick = async () => { busy(true); try { await saveLines({ st: 'sent' }); toast('들어온 주문로 되돌림'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mStoreI')) $('mStoreI').onclick = () => storeSheet(o.acct);
  if ($('mStoreChg')) $('mStoreChg').onclick = () => { if (dirty && !confirm('픽킹 결과를 저장하지 않았습니다. 그래도 가게를 바꿀까요? (픽킹 입력은 사라집니다)')) return; changeStore(o, () => goOrder(o.id)); };
  if ($('mEdit')) $('mEdit').onclick = () => { if (dirty && !confirm('픽킹 결과를 저장하지 않았습니다. 그래도 수정 화면으로 갈까요?')) return; openEditor(o, null, lines); };
  if ($('mCsv')) $('mCsv').onclick = () => csv(o, lines);
  if ($('mCancel')) $('mCancel').onclick = async () => { if (!(await confirmBox('이 주문를 취소할까요?', '주문 취소'))) return; busy(true); try { await S.DB.update('orders', o.id, { st: 'x', updatedAt: new Date().toISOString(), cancelBy: S.user.email }); toast('취소했습니다'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mInvPrint')) $('mInvPrint').onclick = async () => { busy(true); try { const invs = []; for (const n of (o.invs || [])) { const x = await S.DB.get('invoices', n); if (x) invs.push(x); } if (invs.length) await printInvoices(invs, acctOf(o.acct)); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mInv')) $('mInv').onclick = () => confirmInvoice(o, lines);
  if ($('mVoid')) $('mVoid').onclick = async () => { busy(true); const invs = []; try { for (const n of (o.invs || [])) { const x = await S.DB.get('invoices', n); if (x) invs.push(x); } } catch (e) {} busy(false); voidModal(invs, () => goOrder(o.id)); };
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
        for (const n of (o.invs || [])) { const x = await S.DB.get('invoices', n); if (!x) continue; invs.push(x); const ip = { store: patch.store, shipTo: patch.shipTo === undefined ? (x.shipTo || null) : patch.shipTo, updatedAt: now }; if (patch.acct) ip.acct = patch.acct; if (smChg) ip.sm = patch.sm; ops.push({ op: 'update', col: 'invoices', id: n, data: ip }); }
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
const UPS_SVC = [['03', 'UPS Ground'], ['12', 'UPS 3 Day Select'], ['02', 'UPS 2nd Day Air'], ['01', 'UPS Next Day Air']];
function upsTo(o) {
  const a = acctOf(o.acct) || {}, t = o.shipTo || {}, T = o.shipTo ? t : a;
  return { name: t.store || o.store || a.store || '', attn: t.store || o.store || '', phone: a.tel || '', addr1: T.addr || '', addr2: T.addr2 || '', city: T.city || '', state: T.state || '', zip: T.zip || '' };
}
const adrKey = a => String((a.addr1 || a.addr || '') + ' ' + String(a.zip || '').substring(0, 5)).toUpperCase().replace(/\bSTREET\b/g, 'ST').replace(/\bAVENUE\b/g, 'AVE').replace(/\bROAD\b/g, 'RD').replace(/\bBOULEVARD\b/g, 'BLVD').replace(/\bDRIVE\b/g, 'DR').replace(/\bSUITE\b/g, 'STE').replace(/[^A-Z0-9]/g, '');
/** 📍 받는 주소 저장 — toAcct: 거래처 기록(모든 주문에 적용) · 아니면 이 주문(과 인보이스)만 */
async function saveShipAddr(o, v, toAcct) {
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
/** UPS 주소 확인 요청 → UPS.gs 가 1분 안에 upsAv/{id} 에 결과를 적음 */
async function upsValidate(to, orderId) {
  const id = (orderId || 'x') + '-' + Date.now().toString(36);
  await S.DB.set('upsAv', id, { st: 'wait', to, orderId: orderId || '', by: S.user.email, createdAt: new Date().toISOString() });
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 3000)); let x = null; try { x = await S.DB.get('upsAv', id); } catch (e) {} if (x && x.st !== 'wait' && x.st !== 'working') return x; if (!$('upAvBox')) return null; }
  return { st: 'error', err: '응답이 없습니다 — UPS 스크립트(UPS.gs)를 새 버전으로 바꾸고 setup 을 실행했는지 확인하세요' };
}
export function printLabels(q) {
  printOpen('<style>@page{size:4in 6in;margin:0}.lbl{width:4in;height:6in;display:flex;align-items:center;justify-content:center;overflow:hidden;page-break-after:always;break-after:page}.lbl img{width:6in;height:4in;transform:rotate(90deg)}</style>' +
    (q.labels || []).map(l => '<div class="lbl"><img src="data:image/gif;base64,' + l.img + '" alt="' + esc(l.trk) + '"></div>').join(''));
}
export async function shipModal(o, after) {
  const fin = () => { if (after) after(); else goOrder(o.id); };
  let q = null; try { q = await S.DB.get('shipq', o.id); } catch (e) {}
  const ups = (S.settings && S.settings.ups) || {}, defW = Number(ups.defW) || 5;
  let to = upsTo(o), edit = null, av = null, KW = null;
  const paint = () => {
    { const w = document.querySelectorAll('#mbox [data-upw]'); if (w.length) KW = Array.from(w).map(x => x.value); }
    const done = q && q.st === 'done', busyQ = q && (q.st === 'wait' || q.st === 'working'), voidQ = q && q.st === 'void';
    const upsBox = done ? '<div class="sumbox" style="background:#ecfdf5"><b>✅ UPS 라벨 ' + (q.labels || []).length + '장</b>' + (q.env === 'test' ? ' <span class="tag t-c">시험 라벨</span>' : '') + '<br>' + (q.labels || []).map(l => '📦 ' + esc(l.trk)).join('<br>') + (q.charge ? '<br>요금 ' + money(q.charge) : '') + '</div><div class="btns" style="margin-top:6px"><button class="b-blue" id="upPrint">🖨 ' + bi('라벨 인쇄', 'Print labels') + '</button><button class="b-ghost" id="upVoid" style="color:#991b1b">✕ ' + bi('라벨 취소', 'Void') + '</button></div>'
      : busyQ || voidQ ? '<div class="alert a-blu">⏳ ' + (voidQ ? 'UPS 라벨 취소 중' : 'UPS 라벨 만드는 중') + '… 1~2분 걸립니다 <span class="en">working</span></div>'
      : '<div class="fg"><label>' + bi('서비스', 'Service') + '</label>' + sel('upSvc', UPS_SVC, (q && q.svc) || ups.svc || '03') + '</div>' +
        '<div class="fg"><label>' + bi('박스 수 · 무게 (lb)', 'Boxes · weight (lb)') + '</label><div style="display:flex;gap:6px;align-items:center"><input id="upN" type="number" min="1" max="20" inputmode="numeric" value="' + ((q && q.boxes && q.boxes.length) || o.boxes || 1) + '" style="width:80px"><div id="upW" style="display:flex;gap:4px;flex-wrap:wrap;flex:1"></div></div></div>' +
        addrBlock() +
        (q && q.st === 'error' ? '<div class="alert a-red">UPS 오류: ' + esc(q.err || '') + '</div>' : '') + (q && q.st === 'voided' ? '<div class="muted">이전 라벨은 취소됐습니다 (' + esc(q.track || '') + ')</div>' : '') +
        '<button class="b-blue" id="upGo" style="margin-top:8px;padding:14px">📦 ' + bi('UPS 라벨 만들기', 'Create UPS label') + '</button>';
    $('mbox').innerHTML = '<h2>🚚 ' + bi('포장 · 출고', 'Pack & ship') + '</h2><div class="muted">' + esc(o.store) + ' · ' + esc((o.invs || []).join(', ') || o.no) + '</div>' +
      '<div class="card" style="margin:10px 0;padding:12px;border:2px solid #fde68a"><h2 style="margin:0 0 6px">UPS</h2>' + upsBox + '</div>' +
      '<div class="two"><div class="fg"><label>' + bi('운송', 'Carrier') + '</label>' + sel('shVia', [['UPS', 'UPS'], ['FEDEX', 'FedEx'], ['USPS', 'USPS'], ['PICKUP', '픽업 · Pickup'], ['DELIVERY', '직접 배달 · Delivery']], o.shipVia || 'UPS') + '</div><div class="fg"><label>' + bi('박스 수', 'Boxes') + '</label><input id="shBox" type="number" inputmode="numeric" value="' + ((done && q.labels.length) || o.boxes || 1) + '"></div></div>' +
      '<div class="fg"><label>' + bi('추적 번호', 'Tracking #') + '</label><input id="shTrack" value="' + esc((done && q.track) || o.track || '') + '" autocomplete="off"></div>' +
      '<div class="btns"><button class="b-ghost" id="shX">닫기</button><button class="b-green" id="shOk">' + bi('출고 완료', 'Mark shipped') + '</button></div>';
    const wbox = () => { const n = Math.max(1, Math.min(20, Number($('upN').value) || 1)), cur = document.querySelectorAll('[data-upw]').length ? Array.from(document.querySelectorAll('[data-upw]')).map(x => x.value) : (KW || []); $('upW').innerHTML = Array.from({ length: n }, (_, i) => '<input data-upw="' + i + '" type="number" inputmode="decimal" value="' + (cur[i] || (q && q.boxes && q.boxes[i] ? q.boxes[i].w : defW)) + '" style="width:64px" title="박스 ' + (i + 1) + ' lb">').join(''); };
    if ($('upN')) { wbox(); $('upN').oninput = wbox; }
    $('shX').onclick = () => { stop = true; closeModal(); };
    $('shOk').onclick = async () => { const d = { st: 'shipped', shipAt: new Date().toISOString(), shipBy: S.user.email, shipVia: $('shVia').value, boxes: Math.max(1, Number($('shBox').value) || 1), track: $('shTrack').value.trim(), updatedAt: new Date().toISOString() }; if (done && q.charge) d.shipCost = q.charge; stop = true; closeModal(); busy(true); try { await S.DB.update('orders', o.id, d); toast('🚚 출고 완료', 'good'); fin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
    if ($('upPrint')) $('upPrint').onclick = () => printLabels(q);
    bindAddr();
    if ($('upVoid')) $('upVoid').onclick = async () => { if (!(await confirmBox('UPS 라벨 ' + (q.labels || []).length + '장(' + (q.track || '') + ')을 취소할까요? 붙인 라벨은 버려 주세요.', '라벨 취소'))) return shipModal(o, after); try { await S.DB.update('shipq', o.id, { st: 'void', voidBy: S.user.email, voidAt: new Date().toISOString() }); q.st = 'void'; openModal(''); paint(); poll(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } };
    if ($('upGo')) $('upGo').onclick = async () => {
      if (!to.addr1 || !to.city || !to.state || !to.zip) return toast('받는 주소가 부족합니다', 'bad');
      const boxes = Array.from(document.querySelectorAll('[data-upw]')).map(x => ({ w: Math.max(1, Number(x.value) || defW) }));
      const svc = $('upSvc').value, svcName = (UPS_SVC.find(x => x[0] === svc) || [])[1];
      if (!(await confirmBox(svcName + ' · 박스 ' + boxes.length + '개 (' + boxes.map(b => b.w + 'lb').join(', ') + ')\n→ ' + to.name + ', ' + [to.addr1, to.city, to.state, to.zip].join(', ') + '\nUPS 라벨을 만들까요? 요금이 회사 UPS 계정으로 청구됩니다.', '라벨 만들기'))) return shipModal(o, after);
      const doc = { id: o.id, orderId: o.id, no: o.no, st: 'wait', svc, boxes, to, ref: ((o.invs || []).join(' ') || o.no).substring(0, 35), store: o.store, sm: o.sm, by: S.user.email, createdAt: new Date().toISOString() };
      try { await S.DB.set('shipq', o.id, doc); q = doc; openModal(''); paint(); poll(); } catch (e) { toast('실패: ' + (e.code || e.message) + (String(e.code || e.message).includes('permission') ? ' — Firestore 규칙에 shipq 를 게시해야 합니다' : ''), 'bad'); shipModal(o, after); }
    };
  };
  /* 📍 받는 주소 — 보기 · 바꾸기(이 주문만 / 거래처 기록) · UPS 주소 확인 */
  const addrBlock = () => {
    if (edit) { const f = (k, lab, w) => '<div class="fg" style="' + (w ? 'flex:' + w : '') + '"><label>' + lab + '</label><input data-ae="' + k + '" value="' + esc(edit[k] || '') + '"' + (k === 'state' ? ' maxlength="2" style="text-transform:uppercase"' : '') + '></div>';
      return '<div class="sumbox" style="font-size:13px"><b>✏️ ' + bi('받는 주소', 'Ship-to address') + '</b>' + f('name', bt('받는 이름', 'Name')) + f('addr1', bt('주소', 'Address')) + f('addr2', bt('주소 2 (Suite · Unit)', 'Address 2')) + '<div style="display:flex;gap:6px">' + f('city', 'City', 3) + f('state', 'State', 1) + f('zip', 'ZIP', 2) + '</div>' +
        '<div class="btns" style="flex-wrap:wrap"><button class="b-blue b-sm" id="aeOrd">📦 ' + bi('이 주문만 이 주소로', 'This order only') + '</button>' + (acctOf(o.acct) ? '<button class="b-ghost b-sm" id="aeAcc">🏬 ' + bi('거래처 주소도 바꾸기', 'Update customer record') + '</button>' : '') + '<button class="b-ghost b-sm" id="aeX">' + bt('취소', 'Cancel') + '</button></div></div>'; }
    const acc = acctOf(o.acct), diff = o.shipTo && acc && adrKey(o.shipTo) !== adrKey(acc);
    return '<div class="sumbox" style="font-size:13px">📍 <b>' + esc(to.name) + '</b>' + (o.shipTo ? ' <span class="tag t-c">' + bt('이 주문만 다른 주소', 'One-time address') + '</span>' : '') + '<br>' + esc([to.addr1, to.addr2, to.city, to.state, to.zip].filter(Boolean).join(', ')) + (to.phone ? ' · ' + esc(to.phone) : '') +
      (diff ? '<div class="muted">' + bt('거래처 기록', 'Customer record') + ': ' + esc([acc.addr, acc.city, acc.state, acc.zip].filter(Boolean).join(', ')) + '</div>' : '') +
      (!to.addr1 || !to.zip ? '<br><span class="warn">' + bt('주소가 비었습니다 — ✏️ 주소 바꾸기에서 넣으세요', 'Address missing — use Edit') + '</span>' : '') + '</div>' +
      '<div class="btns" style="margin-top:4px;flex-wrap:wrap"><button class="b-ghost b-sm" id="upEd">✏️ ' + bi('주소 바꾸기 · 새 주소', 'Edit · new address') + '</button>' + (o.shipTo && acc ? '<button class="b-ghost b-sm" id="upRs">↩️ ' + bi('거래처 주소로', 'Use customer address') + '</button>' : '') + '<button class="b-ghost b-sm" id="upAv">✅ ' + bi('UPS 주소 확인', 'Verify with UPS') + '</button></div><div id="upAvBox">' + avHtml() + '</div>';
  };
  const avHtml = () => {
    if (!av) return '';
    if (av.st === 'wait') return '<div class="alert a-blu">⏳ ' + bt('UPS 에 주소 확인 중… (최대 1분)', 'Asking UPS… (up to 1 min)') + '</div>';
    if (av.st === 'error') return '<div class="alert a-red">UPS: ' + esc(av.err || '') + '</div>';
    const same = (av.cands || []).some(c => adrKey(c) === adrKey(to));
    return (av.valid && same ? '<div class="alert a-grn">✅ ' + bt('UPS 확인 — 맞는 주소입니다', 'UPS: address is valid') + (av.cls ? ' · ' + esc(av.cls) : '') + '</div>' : av.none ? '<div class="alert a-red">⚠️ ' + bt('UPS 가 이 주소를 찾지 못했습니다 — 주소를 다시 확인하세요', 'UPS could not find this address') + '</div>' : '<div class="alert a-amb">📮 ' + bt('UPS 추천 주소 — 누르면 고치는 창에 들어갑니다', 'UPS suggests — tap to use') + '</div>') +
      (av.valid && same ? '' : (av.cands || []).map((c, i) => '<div class="pr tap" data-avc="' + i + '"><div class="ct"><b>' + esc([c.addr1, c.addr2].filter(Boolean).join(', ')) + '</b><small>' + esc(c.city + ', ' + c.state + ' ' + c.zip + (c.zip4 ? '-' + c.zip4 : '')) + (c.cls ? ' · ' + esc(c.cls) : '') + '</small></div><div class="pa">' + bt('쓰기', 'Use') + ' ›</div></div>').join(''));
  };
  const bindAddr = () => {
    const ed = v => { edit = Object.assign({ name: to.name, addr1: to.addr1, addr2: to.addr2, city: to.city, state: to.state, zip: to.zip }, v || {}); paint(); };
    if ($('upEd')) $('upEd').onclick = () => ed();
    document.querySelectorAll('[data-avc]').forEach(el => el.onclick = () => { const c = av.cands[+el.dataset.avc]; ed({ addr1: c.addr1, addr2: c.addr2, city: c.city, state: c.state, zip: c.zip }); });
    document.querySelectorAll('[data-ae]').forEach(inp => inp.oninput = () => { edit[inp.dataset.ae] = inp.value; });
    if ($('aeX')) $('aeX').onclick = () => { edit = null; paint(); };
    const save = async toAcct => {
      const v = {}; document.querySelectorAll('[data-ae]').forEach(inp => { v[inp.dataset.ae] = inp.value.trim().toUpperCase(); });
      if (!v.addr1 || !v.city || !v.state || !v.zip) return toast(bt('주소 · City · State · ZIP 을 모두 넣으세요', 'Fill address, city, state, ZIP'), 'bad');
      const acc = acctOf(o.acct);
      if (!(await confirmBox((toAcct ? '🏬 거래처 주소를 바꿀까요? (이 가게의 모든 주문에 적용)\n' : '📦 이 주문만 이 주소로 보낼까요? (거래처 기록은 그대로)\n') + (toAcct && acc ? '\n전: ' + [acc.addr, acc.city, acc.state, acc.zip].filter(Boolean).join(', ') : '') + '\n후: ' + [v.addr1, v.addr2, v.city, v.state, v.zip].filter(Boolean).join(', '), toAcct ? '거래처 주소 저장' : '이 주문에 저장'))) return shipModal(o, after);
      busy(true); try { await saveShipAddr(o, v, toAcct); toast('📍 ' + bt('주소 저장', 'Address saved'), 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
      openModal(''); edit = null; av = null; to = upsTo(o); paint();
    };
    if ($('aeOrd')) $('aeOrd').onclick = () => save(false);
    if ($('aeAcc')) $('aeAcc').onclick = () => save(true);
    if ($('upRs')) $('upRs').onclick = async () => { busy(true); try { const now = new Date().toISOString(); await S.DB.batch([{ op: 'update', col: 'orders', id: o.id, data: { shipTo: null, updatedAt: now } }].concat((o.invs || []).map(n => ({ op: 'update', col: 'invoices', id: n, data: { shipTo: null, updatedAt: now } })))); o.shipTo = null; to = upsTo(o); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); paint(); };
    if ($('upAv')) $('upAv').onclick = async () => { if (!to.addr1 || !to.zip) return toast(bt('주소가 비었습니다', 'Address missing'), 'bad'); av = { st: 'wait' }; $('upAvBox').innerHTML = avHtml(); try { av = await upsValidate(to, o.id); } catch (e) { av = { st: 'error', err: String(e.code || e.message) + (String(e.code || e.message).includes('permission') ? ' — Firestore 규칙에 upsAv 를 게시해야 합니다' : '') }; } if (av && $('upAvBox')) { $('upAvBox').innerHTML = avHtml(); bindAddr(); } };
  };
  let stop = false;
  const poll = async () => { for (let i = 0; i < 60 && !stop; i++) { await new Promise(r => setTimeout(r, 4000)); if (stop || !$('mbox')) return; let x = null; try { x = await S.DB.get('shipq', o.id); } catch (e) {} if (x && x.st !== q.st) { q = x; paint(); if (x.st === 'done') { try { await S.DB.update('orders', o.id, { track: x.track, shipVia: 'UPS', boxes: (x.labels || []).length, shipCost: x.charge || 0, updatedAt: new Date().toISOString() }); } catch (e) {} toast('✅ UPS 라벨 ' + (x.labels || []).length + '장 — 인쇄하세요', 'good'); printLabels(x); } return; } } };
  openModal(''); paint();
  if (q && (q.st === 'wait' || q.st === 'working' || q.st === 'void')) poll();
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
  h += '<div id="upDiff"></div>';
  $('page').innerHTML = head + h;
  bindListHead(LF, head);
  const all = wait.concat(recent), byId = id => all.find(o => o.id === id);
  document.querySelectorAll('[data-uo]').forEach(el => el.onclick = () => Router.go('order', el.dataset.uo));
  document.querySelectorAll('[data-us]').forEach(b => b.onclick = () => shipModal(byId(b.dataset.us), () => upsPage(LF, head)));
  document.querySelectorAll('[data-ul]').forEach(b => b.onclick = () => printLabels(qs[b.dataset.ul]));
  addrDiffs(logs, () => upsPage(LF, head));
}
function bindListHead(LF, head) {
  document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') LF.list = false; else LF.st = b.dataset.lf; Router.go('order'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
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
  if (lines.some(l => l.kit)) { try { await loadCatalog(S); } catch (e) {} }
  printOpen(pickingHtml(o, lines));
}
export function pickingHtml(o, lines) {
  const acc = acctOf(o.acct);
  const rows = lines.slice().sort(pickSort);   // 📍 통로 · 선반 순 — 위치 없는 것은 맨 뒤 코드 순
  let lastA = null;
  const aisleRow = l => { const a = aisleOf(locOf(l.c)) || ''; if (a === lastA) return ''; lastA = a; return '<tr class="pkaisle"><td colspan="8">' + (a ? '📍 AISLE ' + esc(a) : '📍 위치 미지정 · NO LOCATION') + '</td></tr>'; };
  return ('<div class="iv" style="min-height:0">' + docHead(company(S), 'PICKING LIST', [['Date', o.d.substring(5, 7) + '/' + o.d.substring(8, 10) + '/' + o.d.substring(2, 4)], ['S.O. No.', o.no]]) +
    '<div class="meta"><b>' + esc(o.store) + '</b> (' + esc(o.acct || '신규') + ')' + (o.shipTo || acc ? ' · ' + esc([(o.shipTo || acc).addr, (o.shipTo || acc).city, (o.shipTo || acc).state, (o.shipTo || acc).zip].filter(Boolean).join(', ')) : '') +
    '<br>Rep. ' + esc(o.sm) + (o.pickerName ? ' · PICKER: <b>' + esc(o.pickerName) + '</b>' : '') + ' · printed ' + esc(new Date().toLocaleString('en-US')) + (o.memo ? '<br><b>MEMO:</b> ' + esc(o.memo) : '') + '</div></div>' +
    '<table><tr><th>#</th><th>LOC</th><th>CODE</th><th>DESCRIPTION</th><th>TYPE</th><th class="r">ORDER</th><th class="r">PICKED</th><th>NOTE</th></tr>' +
    rows.map((l, i) => aisleRow(l) + '<tr><td>' + (i + 1) + '</td><td><b>' + esc(locOf(l.c)) + '</b></td><td><b>' + esc(l.c) + '</b>' + (l.kit ? ' 🧩' : '') + '</td><td>' + esc(l.d) + '</td><td>' + esc(l.t || DT()) + '</td><td class="r"><b>' + l.q + '</b></td><td style="min-width:60px"></td><td style="min-width:90px">' + esc(l.note || '') + '</td></tr>' +
      (l.kit ? l.kit.map(k => { const it = catalog() && catalog().byCode[k.c]; return '<tr style="color:#444"><td></td><td>' + esc(locOf(k.c)) + '</td><td style="padding-left:18px">└ ' + esc(k.c) + '</td><td>' + esc(it ? it.d : '') + '</td><td></td><td class="r">' + (k.q * l.q) + '</td><td></td><td>' + k.q + ' × ' + l.q + '</td></tr>'; }).join('') : '')).join('') +
    '<tr class="fin"><td colspan="5">' + rows.length + ' lines</td><td class="r">' + rows.reduce((a, l) => a + l.q, 0) + '</td><td></td><td></td></tr></table>' +
    '<div class="sig"><div>Picked by</div><div>Checked by</div><div>Date</div></div>');
}
function csv(o, lines) {
  const q = s => { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const out = [['Type', 'Code', 'Description', 'Qty', 'Picked', 'Price', 'ListPrice', 'Amount', 'Note']].concat(lines.map(l => [l.t || DT(), l.c, l.d, l.q, l.pq == null ? '' : l.pq, l.p.toFixed(2), l.lp != null ? Number(l.lp).toFixed(2) : '', ((l.pq == null ? l.q : l.pq) * l.p).toFixed(2), l.note || '']));
  const blob = new Blob(['﻿' + out.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.no + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---- 🧾 인보이스 확정 ---- */
async function confirmInvoice(o, lines) {
  try { await loadCatalog(S); } catch (e) {}
  const groups = Object.values(splitByType(lines, o.disc, 'pq')).filter(g => g.qty > 0);
  const bo = lines.filter(l => (l.pq || 0) < l.q).map(l => Object.assign({ c: l.c, d: l.d, q: l.q - (l.pq || 0), p: l.p, lp: l.lp != null ? l.lp : l.p, t: l.t || DT() }, l.kit ? { kit: l.kit } : {}));
  if (!groups.length) return toast('픽킹된 수량이 없습니다 — 주문를 취소하거나 수량을 넣으세요', 'bad');
  const types = invTypes(S);
  openModal('<h2>🧾 인보이스 확정 — ' + esc(o.store) + '</h2><div class="muted">종류별로 인보이스 번호가 하나씩 나옵니다. 확정하면 고칠 수 없습니다 (취소 후 다시).</div>' +
    '<table style="margin-top:8px"><tr><th>종류</th><th class="r">수량</th><th class="r">금액</th><th class="r">할인</th><th class="r">합계</th></tr>' + groups.map(g => '<tr><td><b>' + esc(g.t) + '</b> ' + esc(typeName(g.t)) + '</td><td class="r">' + g.qty + '</td><td class="r">' + money(g.sub) + '</td><td class="r">' + (g.disc ? g.disc + '%' : '—') + '</td><td class="r"><b>' + money(g.total) + '</b></td></tr>').join('') + '</table>' +
    (bo.length ? '<div class="alert a-amb">⏳ 백오더 ' + bo.length + '줄 · ' + bo.reduce((a, l) => a + l.q, 0) + '개 — 백오더 목록에 남겨 두고 나중에 결정합니다</div>' : '') +
    '<div class="fg" style="margin-top:8px"><label>인보이스 메모 (선택)</label><input id="ivMemo" value="' + esc(o.memo || '') + '"></div>' +
    '<div class="btns"><button class="b-ghost" id="ivX">닫기</button><button class="b-green" id="ivOk">확정 · 인쇄</button></div>');
  $('ivX').onclick = closeModal;
  $('ivOk').onclick = async () => {
    const memo = $('ivMemo').value.trim(); closeModal(); busy(true);
    try {
      const fresh = await S.DB.get('orders', o.id);
      if (fresh && (fresh.st === 'done' || fresh.st === 'x')) throw new Error('이미 처리된 주문입니다 (' + fresh.st + ')');
      const now = new Date().toISOString(), d = today(), acc = acctOf(o.acct), invs = [], ops = [];
      for (const g of groups) {
        const t = types.find(x => x.c === g.t) || { c: g.t, start: 1, pad: 5 };
        const no = await nextInvoiceNo(S, t);
        const C = catalog();
        const inv = { no, t: g.t, order: o.no, orderId: o.id, acct: o.acct || '', store: o.store, shipTo: o.shipTo || null, sm: o.sm, d, ym: ym(d), lines: g.lines.map(l => { const it = C && C.byCode[l.c]; return Object.assign({ c: l.c, d: l.d, q: l.q, p: l.p, lp: l.lp != null ? l.lp : l.p, g: it ? (it.l1 || it.g || '') : '' }, l.kit ? { kit: l.kit } : {}); }),
          qty: g.qty, sub: g.sub, list: g.list, disc: g.disc, total: g.total, bal: g.total, terms: (acc && acc.terms) || '', st: 'open', memo, createdBy: S.user.email, createdAt: now };
        invs.push(inv); ops.push({ op: 'set', col: 'invoices', id: no, data: inv });
      }
      if (bo.length) ops.push({ op: 'set', col: 'backorders', id: o.id, data: { order: o.no, orderId: o.id, acct: o.acct || '', store: o.store, sm: o.sm, d, lines: bo, qty: bo.reduce((a, l) => a + l.q, 0), amt: R2(bo.reduce((a, l) => a + l.q * l.p, 0)), st: 'open', newOrders: [], createdAt: now } });
      const doc = orderDoc(Object.assign({}, o, { st: 'done', invs: invs.map(x => x.no), doneAt: now, doneBy: S.user.email, bo: bo.length ? o.id : '', updatedAt: now }), lines, o.disc);
      doc.amt = R2(invs.reduce((a, x) => a + x.total, 0));
      ops.push({ op: 'set', col: 'orders', id: o.id, data: doc }, { op: 'set', col: 'orderLines', id: o.id, data: { sm: o.sm, lines } });
      await S.DB.batch(ops); dropInvCache(); bumpSalesM(S, invs, 1);
      toast('인보이스 ' + invs.map(x => x.no).join(', '), 'good');
      busy(false);
      await printInvoices(invs, acc);
      goOrder(o.id);
    } catch (e) { busy(false); toast('실패: ' + (e.code || e.message), 'bad'); }
  };
}

/* ============================================================
 *  백오더 · 인보이스 목록
 * ============================================================ */
export async function pageLists(LF, head) {
  if (LF.st === 'inv') return invBrowser(LF, head);
  if (LF.st === 'ups') return upsPage(LF, head);
  $('page').innerHTML = head + '<div class="load">읽는 중…</div>';
  let rows = [];
  try { rows = await S.DB.list('backorders', { where: [['st', '==', 'open']] }); }
  catch (e) { $('page').innerHTML = head + '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return bind(); }
  if (LF.sm) rows = rows.filter(r => r.sm === LF.sm);
  rows = sortBy(rows, r => r.createdAt || '', true);
  $('page').innerHTML = head + '<div class="card"><h2>⏳ ' + bi('백오더', 'Backorders') + ' ' + rows.length + '건 · ' + money(rows.reduce((a, r) => a + (r.amt || 0), 0)) + '</h2><div class="muted">물건이 들어오면 골라서 새 주문로 만들거나, 필요 없으면 닫으세요. <span class="en">When stock arrives, make a new order from selected lines, or close.</span></div>' +
    (rows.length ? rows.map(r => '<div class="pr tap" data-go="bo:' + esc(r.id) + '"><div class="ct"><b>' + esc(r.store) + '</b><small>' + esc(md(r.d)) + ' · ' + esc(r.sm) + ' · ' + esc(r.order) + '</small></div><div class="pa"><b>' + money(r.amt) + '</b><small>' + r.lines.length + '줄 · ' + r.qty + '개</small></div></div>').join('') : '<div class="none">' + bt('백오더가 없습니다', 'No backorders') + '</div>') + '</div>';
  bind(); fillStrip();
  function bind() {
    document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') LF.list = false; else LF.st = b.dataset.lf; Router.go('order'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
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
/** 픽킹 담당 직원 — 사용자 중 일(job)이 픽킹인 사람 (관리 → 사용자에서 등록) */
let PICKERS = null;
export async function pickers() {
  if (PICKERS) return PICKERS;
  try { PICKERS = (await S.DB.list('users', {})).filter(u => u.active !== false && u.role === 'manager' && jobCan(u.job || 'office', 'pick')).map(u => ({ email: u.email || u.id, name: u.name || (u.email || u.id).split('@')[0], pick: u.job === 'pick' || u.job === 'whmgr' })).sort((a, b) => (a.pick === b.pick ? 0 : a.pick ? -1 : 1)); }
  catch (e) { PICKERS = []; }
  return PICKERS;
}
/** 주문들을 픽킹 직원에게 할당 (접수 → 픽킹 중). 직원을 고르면 그 직원 앱의 "내 픽킹" 에 뜸. 픽킹 인보이스 인쇄는 선택 */
export async function assignPicker(orders, done) {
  const list = await pickers(), me = S.user.email;
  const opts = [{ email: me, name: (S.user.name || me.split('@')[0]) + ' (나 · me)', pick: true }].concat(list.filter(p => p.email !== me));
  openModal('<h2>👷 ' + bi('작업 배정', 'Assign Picker') + ' — ' + orders.length + '건 · ' + money(orders.reduce((a, o) => a + (o.amt || 0), 0)) + '</h2>' +
    '<div class="muted">' + bi('직원을 고르면 그 직원 앱의 "내 배정 작업" 목록에 들어갑니다. 픽킹 직원은 관리 → 사용자에서 일을 "픽킹 · 팩킹" 으로 등록하세요.', 'The orders appear in that person\'s "My picking" list.') + '</div>' +
    '<div class="chips" style="flex-wrap:wrap;margin-top:8px">' + opts.map((p, i) => '<button class="' + (i === 0 ? 'on' : '') + '" data-pk="' + i + '">' + (p.pick ? '👷 ' : '🧑‍💼 ') + esc(p.name) + '</button>').join('') + '</div>' +
    '<div style="max-height:30vh;overflow:auto;margin-top:8px;font-size:13px">' + orders.map(o => '<div>' + esc(o.store) + ' <span class="muted">' + esc(o.sm) + ' · ' + esc(o.no) + ' · ' + money(o.amt) + '</span></div>').join('') + '</div>' +
    '<label class="pick on" style="margin-top:8px"><input type="checkbox" id="pkPrint" class="ck-big" checked><span class="pm"><b>🖨 ' + bi('픽킹 인보이스도 인쇄', 'Also print picking lists') + '</b></span></label>' +
    '<div class="btns"><button class="b-ghost" id="pkX">취소</button><button class="b-blue" id="pkOk">할당</button></div>');
  let sel = 0; document.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => { sel = +b.dataset.pk; document.querySelectorAll('[data-pk]').forEach(x => x.classList.toggle('on', x === b)); });
  $('pkX').onclick = closeModal;
  $('pkOk').onclick = async () => {
    const p = opts[sel], now = new Date().toISOString(), pr = $('pkPrint').checked; closeModal(); busy(true);
    try {
      await S.DB.batch(orders.map(o => ({ op: 'update', col: 'orders', id: o.id, data: { st: 'pick', picker: p.email, pickerName: p.name.replace(/ \(나 · me\)$/, ''), pickAt: now, pickBy: me, updatedAt: now } })));
      toast('👷 ' + p.name + ' 에게 ' + orders.length + '건 할당', 'good');
      if (pr) { const all = []; for (const o of orders) { const L = await S.DB.get('orderLines', o.id); all.push(pickingHtml(Object.assign({}, o, { st: 'pick', pickerName: p.name }), (L && L.lines) || [])); } printOpen(all.join('')); }
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
  LF.ip = LF.ip || 'month'; LF.iq = LF.iq || ''; LF.it = LF.it || ''; LF.im = LF.im || 'acct';
  const types = invTypes(S);
  const q = LF.iq.trim();
  /* 인보이스 번호 · 주문 번호 모양이면 번호로 바로 찾기 */
  const isNo = /^[A-Z]{1,2}\d{3,}$/i.test(q) || /^O\d{6}-/i.test(q);
  /* 🏬 거래처별(기본): 전체 거래처 목록 → 검색으로 거르기 → 가게를 누르면 그 가게 인보이스 전부 · 📅 기간별: 예전처럼 */
  const byAcct = LF.im === 'acct';
  let accs = [], acc = null;
  if (byAcct) acc = LF.iacct ? (S.accounts.byCode || {})[LF.iacct] || null : null;
  else { accs = q && !isNo ? searchAccounts(S.accounts, q, 6) : []; acc = accs.length === 1 || (accs.length && accs[0].acct === q) ? accs[0] : null; }
  const [from, to] = periodRange(LF.ip, LF.ifrom, LF.ito);
  const modeSeg = '<div class="seg" style="margin-bottom:8px"><button class="' + (byAcct ? 'on' : '') + '" data-im="acct">🏬 ' + bi('거래처별', 'By customer') + '</button><button class="' + (byAcct ? '' : 'on') + '" data-im="date">📅 ' + bi('기간별', 'By date') + '</button></div>';
  if (byAcct && !acc && !isNo) return acctList(LF, head, modeSeg);
  const top = '<div class="card" style="padding-bottom:8px">' + modeSeg + (byAcct && acc ? '<button class="b-ghost b-sm" id="iqBackA" style="margin-bottom:6px">‹ ' + bi('거래처 목록', 'All customers') + '</button>' : '') +
    (byAcct && acc ? '' : '<div style="display:flex;gap:6px"><input id="iqQ" placeholder="가게 이름 · 어카운트 # · 인보이스 # · 주문 # / Store · Acct · Invoice · Order" value="' + esc(LF.iq) + '" autocomplete="off" style="flex:1">' + (LF.iq ? '<button class="b-ghost b-sm" id="iqX">✕</button>' : '') + '</div>') +
    (accs.length > 1 && !acc ? '<div class="chips">' + accs.map(a => '<button data-iqa="' + esc(a.acct) + '">' + esc(a.acct) + ' ' + esc(a.store) + '</button>').join('') + '</div>' : '') +
    (acc || byAcct ? '' : '<div class="chips">' + PERIODS.filter(c => c[0] !== 'custom').map(c => '<button class="' + (LF.ip === c[0] ? 'on' : '') + '" data-ip="' + c[0] + '">' + c[1] + ' <span class="en">' + c[2] + '</span></button>').join('') + '<button class="' + (LF.ip === 'custom' ? 'on' : '') + '" id="iCal">📅 ' + esc(md(from) + (from !== to ? ' ~ ' + md(to) : '')) + '</button></div>') +
    '<div class="chips" style="margin-top:4px"><button class="' + (LF.it ? '' : 'on') + '" data-it="">' + bi('종류 전체', 'All types') + '</button>' + types.map(t => '<button class="' + (LF.it === t.c ? 'on' : '') + '" data-it="' + esc(t.c) + '">' + esc(t.c) + ' ' + esc(t.n) + '</button>').join('') + '<button class="' + (LF.ivoid ? 'on' : '') + '" data-ivoid="1">VOID ' + bi('포함', 'incl.') + '</button></div></div>';
  $('page').innerHTML = head + top + '<div id="iList"><div class="load">읽는 중…</div></div>';
  bind(); fillStrip();
  let rows = [], err = '';
  try {
    if (acc) rows = await S.DB.list('invoices', { where: [['acct', '==', acc.acct]] });
    else if (isNo) { const x = await S.DB.get('invoices', q.toUpperCase()); rows = x ? [x] : await S.DB.list('invoices', { where: [['order', '==', q.toUpperCase()]] }); }
    else rows = await invoicesBetween(S, from, to);
  } catch (e) { err = String(e.code || e.message); }
  if (!$('iList')) return;
  if (LF.sm) rows = rows.filter(r => r.sm === LF.sm);
  if (LF.it) rows = rows.filter(r => r.t === LF.it);
  if (!LF.ivoid) rows = rows.filter(r => r.st !== 'x');
  if (q && !acc && !isNo) { const qq = q.toUpperCase(); rows = rows.filter(r => String(r.store || '').toUpperCase().includes(qq) || String(r.no).includes(qq) || String(r.order || '').includes(qq) || String(r.acct || '') === qq); }
  rows = sortBy(rows, r => r.d + ' ' + (r.createdAt || '') + ' ' + r.no, true);
  const live = rows.filter(r => r.st !== 'x'), tot = live.reduce((a, r) => a + (r.total || 0), 0), bal = live.reduce((a, r) => a + (r.bal != null ? r.bal : r.total || 0), 0);
  const days = {}; rows.forEach(r => { (days[r.d] = days[r.d] || []).push(r); });
  const dayKeys = Object.keys(days).sort().reverse();
  let h = '';
  if (err) h += '<div class="alert a-red">' + esc(err) + '</div>';
  if (acc) h += '<div class="card" style="border:2px solid #bfdbfe"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><b style="font-size:17px">' + esc(acc.store) + '</b><div class="muted">' + esc(acc.acct) + (acc.sm ? ' · ' + esc(acc.sm) : '') + (acc.terms ? ' · ' + esc(acc.terms) : '') + (acc.tel ? ' · ' + esc(acc.tel) : '') + '</div></div><button class="b-ghost b-sm" id="iAcc">📋 ' + bi('가게 창', 'Store') + '</button></div></div>';
  h += '<div class="card"><div class="kpi"><div><b>' + live.length + '</b><span>인보이스 Invoices</span></div><div><b>' + money(tot) + '</b><span>합계 Total</span></div><div><b>' + money(bal) + '</b><span>미수 Balance</span></div><div><b>' + dayKeys.length + '</b><span>날짜 Days</span></div></div>' +
    '<div class="muted" style="margin:8px 0 4px">' + (acc ? '이 가게 인보이스 전부' : isNo ? '번호로 찾음' : esc(md(from)) + ' ~ ' + esc(md(to))) + (rows.length ? ' · <a id="iCsv" href="#" onclick="return false">⬇️ CSV</a>' : '') + '</div>' +
    (rows.length ? dayKeys.map(d => { const L = days[d], lv = L.filter(r => r.st !== 'x'); return '<div class="iday"><b>' + esc(dayLabel(d)) + '</b><span>' + lv.length + '건 · ' + money(lv.reduce((a, r) => a + (r.total || 0), 0)) + '</span></div>' + L.map(r => invRow(r)).join(''); }).join('') : '<div class="none">' + (q ? '맞는 인보이스가 없습니다' : '이 기간에 인보이스가 없습니다') + '</div>') + '</div>';
  $('iList').innerHTML = h;
  document.querySelectorAll('#iList [data-go]').forEach(el => el.onclick = () => Router.go('order', el.dataset.go));
  if ($('iAcc')) $('iAcc').onclick = () => storeSheet(acc.acct);
  if ($('iCsv')) $('iCsv').onclick = () => {
    const csv = [['Invoice', 'Date', 'Type', 'Acct', 'Store', 'SalesRep', 'Terms', 'Order', 'Qty', 'Sub', 'Disc%', 'Total', 'Balance', 'Status']].concat(rows.map(r => [r.no, r.d, r.t, r.acct, r.store, r.sm, r.terms || '', r.order, r.qty, r.sub, r.disc || 0, r.total, r.bal != null ? r.bal : r.total, r.st === 'x' ? 'VOID' : 'open'])).map(a => a.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'invoices-' + (acc ? acc.acct : from + '_' + to) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  function bind() {
    document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') LF.list = false; else LF.st = b.dataset.lf; Router.go('order'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
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
    document.querySelectorAll('[data-im]').forEach(b => b.onclick = () => { LF.im = b.dataset.im; LF.iacct = ''; LF.iq = ''; invBrowser(LF, head); });
  }
}
/** 🏬 거래처별 인보이스 — 전체 거래처를 이름순으로, 치는 대로 걸러짐. 인보이스 번호를 치면 Enter 로 바로 찾기 */
function acctList(LF, head, modeSeg) {
  $('page').innerHTML = head + '<div class="card" style="padding-bottom:8px">' + modeSeg + '<input id="iqQ" placeholder="가게 이름 · 어카운트 # · 도시 · 인보이스 # / Store · Acct · City · Invoice" value="' + esc(LF.iq) + '" autocomplete="off"></div><div class="card"><div id="iaList"></div></div>';
  bindListHead(LF, head);
  let lim = 300;
  const paint = () => {
    const q = LF.iq.trim(), hits = q ? searchAccounts(S.accounts, q, 100000) : sortBy(S.accounts, a => a.store), show = hits.slice(0, lim);
    const isNo = /^[A-Z]{1,2}\d{3,}$/i.test(q) || /^O\d{6}-/i.test(q);
    $('iaList').innerHTML = (isNo ? '<button class="b-blue" id="iaNo" style="margin-bottom:8px">🔎 ' + bi('인보이스 · 주문 번호로 찾기', 'Find by number') + ': ' + esc(q.toUpperCase()) + '</button>' : '') +
      '<div class="muted" style="margin:0 0 6px">' + (q ? bt('찾음', 'Found') : bt('전체 거래처 · 이름순', 'All customers · by name')) + ' ' + hits.length.toLocaleString() + ' — ' + bt('가게를 누르면 인보이스 전부', 'tap a store for its invoices') + '</div>' +
      (show.length ? show.map(a => '<div class="pr tap" data-ia="' + esc(a.acct) + '"><div class="ct"><b>' + esc(a.store) + '</b><small>' + esc(a.acct) + ' · ' + esc([a.city, a.state].filter(Boolean).join(', ')) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.terms ? ' · ' + esc(a.terms) : '') + '</small></div><div class="pa">›</div></div>').join('') : '<div class="none">없음 · no match</div>') +
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
function invRow(r) {
  const bal = r.bal != null ? r.bal : r.total;
  return '<div class="pr tap" data-go="inv:' + esc(r.no) + '"><div class="ct"><b>' + esc(r.store) + ' <span class="muted" style="font-weight:400">' + esc(r.acct || '') + '</span></b><small><b>' + esc(r.no) + '</b> <span class="tag t-g">' + esc(r.t || '') + '</span>' + (r.st === 'x' ? ' <span class="tag t-r">VOID</span>' : '') + ' · ' + esc(r.sm) + (r.terms ? ' · ' + esc(r.terms) : '') + ' · ' + esc(r.order) + (r.disc ? ' · 할인 ' + r.disc + '%' : '') + '</small></div><div class="pa"><b>' + money(r.total) + '</b><small>' + r.qty + '개' + (r.st !== 'x' && Math.abs(bal - r.total) > 0.005 ? ' · 잔액 ' + money(bal) : '') + '</small></div></div>';
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
        const now = new Date().toISOString(), d = today(), no = 'O' + d.replace(/-/g, '').substring(2) + '-B' + Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
        const acc = acctOf(b.acct);
        const doc = orderDoc({ id: no, no, d, ym: ym(d), sm: b.sm, acct: b.acct, store: b.store, st: 'sent', memo: '백오더 (' + b.order + ')', createdBy: S.user.email, createdAt: now, updatedAt: now, sentAt: now, fromBo: id }, sel, acctDisc(acc));
        await S.DB.batch([{ op: 'set', col: 'orders', id: no, data: doc }, { op: 'set', col: 'orderLines', id: no, data: { sm: b.sm, lines: sel } },
          { op: 'update', col: 'backorders', id, data: { lines: rest.length ? rest : b.lines, st: rest.length ? 'open' : 'used', newOrders: (b.newOrders || []).concat([no]), qty: rest.reduce((a, l) => a + l.q, 0), amt: R2(rest.reduce((a, l) => a + l.q * l.p, 0)), updatedAt: now } }]);
        toast('새 주문 ' + no + ' (들어온 주문에 있음)', 'good'); goOrder(no);
      } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  paint();
}

export async function openInvoice(no) {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  const x = await S.DB.get('invoices', no);
  if (!x) { $('page').innerHTML = '<div class="card"><div class="none">인보이스를 찾지 못했습니다</div></div>'; return; }
  $('page').innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between"><div><h2 style="margin:0">📄 ' + esc(x.no) + (x.st === 'x' ? ' <span class="tag t-r">VOID</span>' : '') + '</h2><div style="font-size:17px;font-weight:800;margin-top:6px">' + esc(x.store) + '</div><div class="muted">' + esc(x.sm) + ' · ' + esc(x.d) + ' · 주문 <a href="#/order/' + esc(x.orderId) + '">' + esc(x.order) + '</a></div></div><button class="b-ghost b-sm" id="iBack">‹ ' + bi('목록', 'List') + '</button></div>' +
    '<div class="kpi"><div><b>' + x.qty + '</b><span>수량</span></div><div><b>' + money(x.sub) + '</b><span>금액</span></div><div><b>' + (x.disc ? x.disc + '%' : '—') + '</b><span>할인</span></div><div><b>' + money(x.total) + '</b><span>합계</span></div></div>' +
    '<div class="btns"><button class="b-blue" id="iPrint">🖨 ' + bi('인쇄', 'Print') + '</button>' + (can('void') && x.st !== 'x' ? '<button class="b-ghost" id="iVoid" style="color:#991b1b">🚫 VOID</button>' : '') + '</div>' + (x.st === 'x' ? '<div class="alert a-red">🚫 VOID · ' + esc(String(x.voidAt || '').substring(0, 10)) + ' · ' + esc(String(x.voidBy || '').split('@')[0]) + (x.voidReason ? ' — ' + esc(x.voidReason) : '') + '</div>' : '') + '</div>' +
    '<div class="card"><table><tr><th>코드</th><th class="r">수량</th><th class="r">가격</th><th class="r">금액</th></tr>' + x.lines.map(l => '<tr><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d) + '</div></td><td class="r">' + l.q + '</td><td class="r">' + money(l.p) + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') + '</table></div>';
  $('iBack').onclick = () => Router.go('order');
  $('iPrint').onclick = () => printInvoices([x], acctOf(x.acct));
  if ($('iVoid')) $('iVoid').onclick = () => voidModal([x], () => openInvoice(no));
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
          if (act === 'cancel') Object.assign(p, { st: 'x', cancelBy: S.user.email, cancelWhy: reason });
          ops.push({ op: 'update', col: 'orders', id: o.id, data: p });
          if ((act === 'redo' || act === 'cancel') && o.bo) { const b = await S.DB.get('backorders', o.id).catch(() => null); if (b && b.st === 'open') ops.push(act === 'redo' ? { op: 'del', col: 'backorders', id: o.id } : { op: 'update', col: 'backorders', id: o.id, data: { st: 'closed', closedAt: now, closedBy: S.user.email } }); }
        }
        await S.DB.batch(ops); dropInvCache(); await bumpSalesM(S, L, -1);
        toast('🚫 VOID ' + L.map(x => x.no).join(', ') + (act === 'redo' ? ' — 주문이 검수 대기로 돌아갔습니다' : ''), 'good');
        closeModal(); if (done) done(act, o);
      } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  openModal(''); paint();
}
