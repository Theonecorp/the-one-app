/* ============================================================
 *  주문 처리 (매니저) — 이전 시스템의 Sales Order → Sales Invoice 흐름
 *    ① 들어온 주문 확인 (가격 수정 · 할인 변경 표시) → 🖨 픽킹 인보이스 인쇄 = 픽킹 시작
 *    ② 픽킹 결과 입력 (실제 담은 수량 · 줄 추가/수정 · 메모) → 모자란 것은 백오더
 *    ③ 🧾 인보이스 확정 → 종류(A · P · W …)별 세일즈 인보이스 번호 발행 · 인쇄
 *    ④ 백오더는 매니저가 골라서 새 주문로 만들거나 닫음
 *  backorders/{orderId} = { id, order, acct, store, sm, d, lines:[{c,d,q,p,lp,t}], qty, amt, st:'open'|'used'|'closed', newOrders:[], createdAt }
 * ============================================================ */
import { $, esc, money, R2, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, sel, sortBy, printOpen, debounce, bi, bt, hasWords } from './ui.js';
import { jobOf } from './main.js';
import { loadCatalog, catalog, exactItem } from './catalog.js';
import { invTypes, typeOfItem, acctDisc, splitByType, priceDiff, nextInvoiceNo, invoiceHtml, company, docHead, invView, setInvView, dropInvCache, bumpSalesM } from './invoicing.js';
import { storeInfo } from './store.js';
import { stTag, cfTag, goOrder, openEditor, orderDoc, typeSummary, recentYms, canEdit, fillStrip } from './orders.js';
import { bumpAccountsVer } from './mgr.js';
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
    '<div class="muted">' + esc([o.acct, acc ? [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : ''].filter(Boolean).join(' · ')) + (acc && acc.terms ? ' · ' + esc(acc.terms) : '') + '</div>' +
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
    (o.acct && jobOf() !== 'pick' ? ' <button class="b-ghost b-sm" id="mDiscSave">이 할인을 가게 기본으로 · set as store default</button>' : '') + '</div>';
  h += '</div>';
  /* 버튼 */
  /* 픽킹·팩킹 담당은 픽킹까지만 — 인보이스 확정 · 주문 취소 · 할인 저장은 인보이스 · 오피스 담당이 */
  const J = jobOf(), canInv = J !== 'pick';
  const B = [];
  const isPicker = o.picker === S.user.email;
  if (o.st === 'draft') B.push('<button class="b-green" id="mSend">📤 ' + bi('접수로 보내기', 'Submit order') + '</button>');
  if (o.st === 'sent') B.push('<button class="b-blue" id="mAssign">👷 ' + bi('픽킹 할당', 'Assign picking') + '</button><button class="b-ghost" id="mPick">🖨 ' + bi('내가 픽킹 시작', 'I pick this') + '</button>');
  if (o.st === 'pick' || o.st === 'ok') B.push('<button class="b-ghost" id="mPickSave">💾 ' + bi('픽킹 저장', 'Save') + '</button><button class="b-green" id="mPickDone">✅ ' + bi('픽킹 완료', 'Picking done') + '</button>');
  if (o.st === 'picked') B.push('<button class="b-ghost" id="mPickSave">💾 ' + bi('수량 저장', 'Save') + '</button>' + (canInv ? '<button class="b-green" id="mInv">🧾 ' + bi('인보이스 발행', 'Issue invoice') + '</button>' : '<span class="muted" style="align-self:center">' + bi('인보이스 발행은 사무실에서 합니다', 'Office issues the invoice') + '</span>'));
  if (o.st === 'done') B.push('<button class="b-green" id="mShip">🚚 ' + bi('포장 · 출고 완료', 'Packed & shipped') + '</button>');
  h += '<div class="card"><div class="btns" style="margin-top:0;flex-wrap:wrap">' +
    (picking ? '<button class="b-ghost b-sm" id="mPickPrint">🖨 ' + bi('픽킹 인보이스', 'Picking list') + '</button>' : '') +
    (o.acct ? '<button class="b-ghost b-sm" id="mStoreI">📋 ' + bi('가게 기록', 'Store') + '</button>' : '') +
    (canEdit(o) && canInv ? '<button class="b-ghost b-sm" id="mEdit">✏️ ' + bi('주문 수정', 'Edit') + '</button>' : '') +
    (o.st === 'pick' || o.st === 'ok' ? '<button class="b-ghost b-sm" id="mUnpick">↩️ ' + bi('접수로 되돌리기', 'Back to received') + '</button><button class="b-ghost b-sm" id="mReassign">👷 ' + bi('담당 바꾸기', 'Reassign') + '</button>' : '') +
    (o.st === 'picked' ? '<button class="b-ghost b-sm" id="mRepick">↩️ ' + bi('다시 픽킹으로', 'Back to picking') + '</button>' : '') +
    (o.st === 'shipped' ? '<button class="b-ghost b-sm" id="mUnship">↩️ ' + bi('출고 취소', 'Undo shipping') + '</button>' : '') +
    ((o.st === 'sent' || o.st === 'pick' || o.st === 'ok') && !o.cfOk ? '<button class="b-ghost b-sm" id="mCfReq">❓ ' + bi(o.cfReq ? '확인 다시 요청' : '세일즈맨 확인 요청', 'Ask salesman') + '</button>' : '') +
    (o.st === 'done' || o.st === 'shipped' ? '<button class="b-ghost b-sm" id="mInvPrint">🖨 ' + bi('인보이스 인쇄', 'Print invoice') + '</button>' : '') +
    '<button class="b-ghost b-sm" id="mCsv">⬇️ CSV</button>' +
    (o.st !== 'done' && o.st !== 'shipped' && o.st !== 'x' && canInv ? '<button class="b-ghost b-sm" id="mCancel" style="color:#991b1b">✕ ' + bi('주문 취소', 'Cancel order') + '</button>' : '') +
    '</div>' + (B.length ? '<div class="btns">' + B.join('') + '</div>' : '') +
    (o.st === 'done' || o.st === 'shipped' ? '<div class="sumbox">🧾 인보이스: ' + (o.invs || []).map(n => '<a href="#/order/inv:' + esc(n) + '"><b>' + esc(n) + '</b></a>').join(' · ') + (o.bo ? ' · ⏳ <a href="#/order/bo:' + esc(o.bo) + '">백오더 있음</a>' : '') + '</div>' : '') + '</div>';
  /* 줄 */
  h += '<div class="card"><h2>' + (picking ? '📦 ' + bi('픽킹 결과 — 실제로 담은 수량', 'Picked qty') : bi('아이템', 'Items')) + ' ' + lines.length + '</h2>' +
    (picking ? '<div class="muted">픽 칸에 실제 담은 수량을 넣으세요. 주문보다 적으면 백오더가 됩니다. <span class="en">Enter the quantity actually picked; less than ordered becomes a backorder.</span></div><div class="btns" style="flex-wrap:wrap"><button class="b-ghost b-sm" id="mAllQ">' + bi('모두 주문 수량으로', 'All as ordered') + '</button><button class="b-ghost b-sm" id="mAllZ">' + bi('모두 0 으로', 'All zero') + '</button><button class="b-ghost b-sm" id="mAdd">＋ ' + bi('아이템 추가', 'Add item') + '</button></div>' : '') +
    '<input id="mFind" placeholder="이 주문 안에서 찾기 · 스캔 / Find in this order · scan" autocomplete="off" style="margin:8px 0 6px"><div class="chips" style="margin:0 0 6px"><button class="on" data-mf="all">' + bi('전체', 'All') + '</button>' + (picking ? '<button data-mf="bo">' + bi('백오더만', 'Backorder only') + '</button>' : '') + '<button data-mf="p">' + bi('가격 수정만', 'Price changed') + '</button></div><div id="mLines"></div></div>';
  $('page').innerHTML = h;

  let MF = 'all';
  const sumNow = () => { $('mSum').innerHTML = (picking ? '<div class="muted" style="margin-top:8px">🧾 픽킹한 수량 기준 — 확정하면 종류마다 인보이스가 따로 나옵니다 <span class="en">Based on picked qty; one invoice per type on confirm</span></div>' : '<div class="muted" style="margin-top:8px">🧾 주문 수량 기준 미리보기 — 픽킹 후 확정 <span class="en">Preview by ordered qty; split after picking</span></div>') + typeSummary(splitByType(lines, o.disc, picking ? 'pq' : 'q')) + (picking ? boLine() : ''); };
  const boLine = () => { const b = lines.filter(l => (l.pq || 0) < l.q); return b.length ? '<div class="alert a-red">⏳ 백오더 ' + b.length + '줄 · ' + b.reduce((a, l) => a + l.q - (l.pq || 0), 0) + '개</div>' : '<div class="alert a-grn">✓ 모두 픽킹됨</div>'; };
  const types = invTypes(S);
  const paint = () => {
    const q = $('mFind').value.trim().toUpperCase();
    let rows = lines.map((l, i) => Object.assign({ _i: i }, l));
    if (q) rows = rows.filter(l => hasWords(l.c + ' ' + l.d, q));
    if (MF === 'bo') rows = rows.filter(l => (l.pq || 0) < l.q);
    if (MF === 'p') rows = rows.filter(l => l.lp != null && Math.abs(l.lp - l.p) > 0.0001);
    $('mLines').innerHTML = '<table class="pk"><tr><th>코드</th><th class="r">주문</th>' + (picking ? '<th class="r">픽</th>' : '') + '<th class="r">가격</th><th class="r">금액</th></tr>' + rows.slice(0, 2500).map(l => {
      const chg = l.lp != null && Math.abs(l.lp - l.p) > 0.0001, bo = picking && (l.pq || 0) < l.q;
      const qq = picking ? (l.pq || 0) : l.q;
      return '<tr class="' + (bo ? 'bo' : '') + '"><td><b>' + esc(l.c) + '</b> ' + (picking ? sel('', types.map(t => [t.c, t.c]), l.t || DT(), 'class="tsel" data-t="' + l._i + '"') : '<span class="tag t-g">' + esc(l.t || DT()) + '</span>') +
        '<div class="muted" style="font-size:11.5px">' + esc(l.d) + '</div>' + (l.kit ? '<div class="muted" style="font-size:11px">🧩 ' + l.kit.map(k => esc(k.c) + '×' + k.q).join(', ') + (picking ? ' <button class="b-ghost b-sm" data-brk="' + l._i + '" style="padding:2px 7px">세트 풀기</button>' : '') + '</div>' : '') + (picking ? '<input class="sm" data-note="' + l._i + '" value="' + esc(l.note || '') + '" placeholder="메모" style="margin-top:3px;padding:4px 7px;font-size:12px">' : (l.note ? '<div class="muted">📝 ' + esc(l.note) + '</div>' : '')) + '</td>' +
        '<td class="r"><b>' + l.q + '</b></td>' +
        (picking ? '<td class="r"><input class="sm pq" type="number" inputmode="numeric" min="0" data-pq="' + l._i + '" value="' + (l.pq || 0) + '"></td>' : '') +
        '<td class="r">' + (picking ? '<input class="sm pin' + (chg ? ' chg' : '') + '" type="number" step="0.01" inputmode="decimal" data-pp="' + l._i + '" value="' + l.p + '">' : money(l.p)) + (chg ? '<div class="muted" style="text-decoration:line-through">' + money(l.lp) + '</div>' : '') + '</td>' +
        '<td class="r">' + money(qq * l.p) + '</td></tr>';
    }).join('') + '</table>' + (rows.length ? '' : '<div class="none">없음</div>');
    document.querySelectorAll('[data-pq]').forEach(inp => { inp.onfocus = () => inp.select(); inp.onchange = () => { lines[+inp.dataset.pq].pq = Math.max(0, Math.floor(Number(inp.value) || 0)); dirty = true; sumNow(); inp.closest('tr').classList.toggle('bo', lines[+inp.dataset.pq].pq < lines[+inp.dataset.pq].q); }; });
    document.querySelectorAll('[data-pp]').forEach(inp => inp.onchange = () => { lines[+inp.dataset.pp].p = R2(inp.value); dirty = true; setTimeout(() => { if ($('mLines')) { sumNow(); paint(); } }, 0); });
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
  $('mFind').onkeydown = e => { if (e.key !== 'Enter' || !picking) return; e.preventDefault(); const v = $('mFind').value.trim().toUpperCase(); const i = lines.findIndex(l => l.c === v || (catalog() && exactItem(v) && exactItem(v).c === l.c)); if (i < 0) return toast('이 주문에 없는 코드입니다', 'bad'); lines[i].pq = (lines[i].pq || 0) + 1; dirty = true; $('mFind').value = ''; sumNow(); paint(); toast(lines[i].c + ' 픽 ' + lines[i].pq + ' / ' + lines[i].q, 'good'); };
  document.querySelectorAll('[data-mf]').forEach(b => b.onclick = () => { MF = b.dataset.mf; document.querySelectorAll('[data-mf]').forEach(x => x.classList.toggle('on', x === b)); paint(); });
  $('mBack').onclick = () => { if (dirty && !confirm('픽킹 결과를 저장하지 않았습니다. 그래도 나갈까요?')) return; Router.go('order'); };
  if ($('mShowP')) $('mShowP').onclick = () => { MF = 'p'; document.querySelectorAll('[data-mf]').forEach(x => x.classList.toggle('on', x.dataset.mf === 'p')); paint(); $('mLines').scrollIntoView({ behavior: 'smooth' }); };
  if ($('mDiscSave')) $('mDiscSave').onclick = async () => {
    if (!(await confirmBox(o.store + ' 기본 할인을 ' + (Object.keys(o.disc || {}).map(k => k + ' ' + o.disc[k] + '%').join(', ') || '없음') + ' 으로 바꿀까요? 다음 주문부터 자동으로 들어갑니다.', '저장'))) return;
    busy(true); try { await S.DB.update('accounts', o.acct, { disc: Object.assign({}, o.disc || {}) }); await bumpAccountsVer(); await S.DB.update('orders', o.id, { discChg: false }); toast('가게 기본 할인 저장', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
  };
  if ($('mAllQ')) $('mAllQ').onclick = () => { lines.forEach(l => { l.pq = l.q; }); dirty = true; sumNow(); paint(); };
  if ($('mAllZ')) $('mAllZ').onclick = () => { lines.forEach(l => { l.pq = 0; }); dirty = true; sumNow(); paint(); };
  if ($('mAdd')) $('mAdd').onclick = async () => {
    try { await loadCatalog(S); } catch (e) {}
    openModal('<h2>＋ 아이템 추가</h2><div class="fg"><label>코드 · 바코드</label><input id="aCode" autocomplete="off" style="text-transform:uppercase"></div><div class="two"><div class="fg"><label>수량</label><input id="aQ" type="number" inputmode="numeric" value="1"></div><div class="fg"><label>가격 (비우면 목록가)</label><input id="aP" type="number" step="0.01" inputmode="decimal"></div></div><div class="btns"><button class="b-ghost" id="aX">닫기</button><button class="b-blue" id="aOk">추가</button></div>');
    $('aX').onclick = closeModal; setTimeout(() => $('aCode').focus(), 50);
    $('aOk').onclick = () => {
      const it = exactItem($('aCode').value); if (!it) return toast('목록에 없는 코드입니다', 'bad');
      const q = Math.max(1, Math.floor(Number($('aQ').value) || 1)), p = $('aP').value ? R2($('aP').value) : it.p;
      const ex = lines.find(l => l.c === it.c);
      if (ex) { ex.q += q; ex.pq = (ex.pq || 0) + q; } else lines.push({ c: it.c, d: it.d, q, pq: q, p, lp: it.p, t: typeOfItem(S, it), note: '사무실 추가' });
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
    const b = lines.filter(l => (l.pq || 0) < l.q), n = b.reduce((a, l) => a + l.q - (l.pq || 0), 0);
    if (!(await confirmBox('픽킹 완료로 넘길까요?' + (b.length ? '\n⏳ 부족(백오더) ' + b.length + '줄 · ' + n + '개는 사무실이 확인 뒤 백오더로 남깁니다.' : '\n✓ 전부 픽킹됨') + '\n사무실 확인 → 인보이스 발행으로 넘어갑니다.', '픽킹 완료'))) return;
    busy(true); try { await saveLines({ st: 'picked', pickDoneAt: new Date().toISOString(), pickDoneBy: S.user.email }); dirty = false; toast('✅ 픽킹 완료 — 사무실 확인 대기', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
  };
  if ($('mRepick')) $('mRepick').onclick = async () => { busy(true); try { await saveLines({ st: 'pick' }); toast('다시 픽킹 중'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mCfReq')) $('mCfReq').onclick = async () => { if (!(await confirmBox(o.sm + ' 에게 이 주문 내용 확인을 요청할까요? 세일즈맨 앱 홈에 "확인 요청" 으로 뜹니다.', '요청'))) return; busy(true); try { await S.DB.update('orders', o.id, { cfReq: true, cfReqAt: new Date().toISOString(), cfReqBy: S.user.email, cfOk: false }); toast('확인 요청 보냄', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mShip')) $('mShip').onclick = () => {
    openModal('<h2>🚚 ' + bi('포장 · 출고 완료', 'Packed & shipped') + '</h2><div class="muted">' + esc(o.store) + ' · ' + (o.invs || []).join(', ') + '</div><div class="two" style="margin-top:8px"><div class="fg"><label>' + bi('운송', 'Carrier') + '</label>' + sel('shVia', [['UPS', 'UPS'], ['FEDEX', 'FedEx'], ['USPS', 'USPS'], ['PICKUP', '픽업 · Pickup'], ['DELIVERY', '직접 배달 · Delivery']], o.shipVia || 'UPS') + '</div><div class="fg"><label>' + bi('박스 수', 'Boxes') + '</label><input id="shBox" type="number" inputmode="numeric" value="' + (o.boxes || 1) + '"></div></div>' +
      '<div class="fg"><label>' + bi('추적 번호 (UPS 라벨에서 · 선택)', 'Tracking # (optional)') + '</label><input id="shTrack" value="' + esc(o.track || '') + '" autocomplete="off"></div>' +
      '<div class="btns"><button class="b-ghost" id="shX">취소</button><button class="b-green" id="shOk">출고 완료</button></div>');
    $('shX').onclick = closeModal;
    $('shOk').onclick = async () => { const d = { st: 'shipped', shipAt: new Date().toISOString(), shipBy: S.user.email, shipVia: $('shVia').value, boxes: Math.max(1, Number($('shBox').value) || 1), track: $('shTrack').value.trim(), updatedAt: new Date().toISOString() }; closeModal(); busy(true); try { await S.DB.update('orders', o.id, d); toast('🚚 출고 완료', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  };
  if ($('mUnship')) $('mUnship').onclick = async () => { if (!(await confirmBox('출고 완료를 취소할까요? (포장 대기로 돌아감)', '취소'))) return; busy(true); try { await S.DB.update('orders', o.id, { st: 'done', updatedAt: new Date().toISOString() }); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mPickPrint')) $('mPickPrint').onclick = () => printPicking(o, lines);
  if ($('mPickSave')) $('mPickSave').onclick = async () => { busy(true); try { await saveLines(); dirty = false; toast('픽킹 저장', 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mUnpick')) $('mUnpick').onclick = async () => { busy(true); try { await saveLines({ st: 'sent' }); toast('들어온 주문로 되돌림'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mStoreI')) $('mStoreI').onclick = () => storeSheet(o.acct);
  if ($('mEdit')) $('mEdit').onclick = () => { if (dirty && !confirm('픽킹 결과를 저장하지 않았습니다. 그래도 수정 화면으로 갈까요?')) return; openEditor(o, null, lines); };
  if ($('mCsv')) $('mCsv').onclick = () => csv(o, lines);
  if ($('mCancel')) $('mCancel').onclick = async () => { if (!(await confirmBox('이 주문를 취소할까요?', '주문 취소'))) return; busy(true); try { await S.DB.update('orders', o.id, { st: 'x', updatedAt: new Date().toISOString(), cancelBy: S.user.email }); toast('취소했습니다'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mInvPrint')) $('mInvPrint').onclick = async () => { busy(true); try { const invs = []; for (const n of (o.invs || [])) { const x = await S.DB.get('invoices', n); if (x) invs.push(x); } if (invs.length) await printInvoices(invs, acctOf(o.acct)); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('mInv')) $('mInv').onclick = () => confirmInvoice(o, lines);
}

async function printPicking(o, lines) {
  if (lines.some(l => l.kit)) { try { await loadCatalog(S); } catch (e) {} }
  printOpen(pickingHtml(o, lines));
}
export function pickingHtml(o, lines) {
  const acc = acctOf(o.acct);
  const rows = sortBy(lines, l => l.c);
  return ('<div class="iv" style="min-height:0">' + docHead(company(S), 'PICKING LIST', [['Date', o.d.substring(5, 7) + '/' + o.d.substring(8, 10) + '/' + o.d.substring(2, 4)], ['S.O. No.', o.no]]) +
    '<div class="meta"><b>' + esc(o.store) + '</b> (' + esc(o.acct || '신규') + ')' + (acc ? ' · ' + esc([acc.addr, acc.city, acc.state, acc.zip].filter(Boolean).join(', ')) : '') +
    '<br>Rep. ' + esc(o.sm) + (o.pickerName ? ' · PICKER: <b>' + esc(o.pickerName) + '</b>' : '') + ' · printed ' + esc(new Date().toLocaleString('en-US')) + (o.memo ? '<br><b>MEMO:</b> ' + esc(o.memo) : '') + '</div></div>' +
    '<table><tr><th>#</th><th>CODE</th><th>DESCRIPTION</th><th>TYPE</th><th class="r">ORDER</th><th class="r">PICKED</th><th>NOTE</th></tr>' +
    rows.map((l, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + esc(l.c) + '</b>' + (l.kit ? ' 🧩' : '') + '</td><td>' + esc(l.d) + '</td><td>' + esc(l.t || DT()) + '</td><td class="r"><b>' + l.q + '</b></td><td style="min-width:60px"></td><td style="min-width:90px">' + esc(l.note || '') + '</td></tr>' +
      (l.kit ? l.kit.map(k => { const it = catalog() && catalog().byCode[k.c]; return '<tr style="color:#444"><td></td><td style="padding-left:18px">└ ' + esc(k.c) + '</td><td>' + esc(it ? it.d : '') + '</td><td></td><td class="r">' + (k.q * l.q) + '</td><td></td><td>' + k.q + ' × ' + l.q + '</td></tr>'; }).join('') : '')).join('') +
    '<tr class="fin"><td colspan="4">' + rows.length + ' lines</td><td class="r">' + rows.reduce((a, l) => a + l.q, 0) + '</td><td></td><td></td></tr></table>' +
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
        const inv = { no, t: g.t, order: o.no, orderId: o.id, acct: o.acct || '', store: o.store, sm: o.sm, d, ym: ym(d), lines: g.lines.map(l => { const it = C && C.byCode[l.c]; return Object.assign({ c: l.c, d: l.d, q: l.q, p: l.p, lp: l.lp != null ? l.lp : l.p, g: it ? (it.l1 || it.g || '') : '' }, l.kit ? { kit: l.kit } : {}); }),
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
  try { PICKERS = (await S.DB.list('users', {})).filter(u => u.active !== false && (u.job === 'pick' || u.role === 'manager')).map(u => ({ email: u.email || u.id, name: u.name || (u.email || u.id).split('@')[0], pick: u.job === 'pick' })).sort((a, b) => (a.pick === b.pick ? 0 : a.pick ? -1 : 1)); }
  catch (e) { PICKERS = []; }
  return PICKERS;
}
/** 주문들을 픽킹 직원에게 할당 (접수 → 픽킹 중). 직원을 고르면 그 직원 앱의 "내 픽킹" 에 뜸. 픽킹 인보이스 인쇄는 선택 */
export async function assignPicker(orders, done) {
  const list = await pickers(), me = S.user.email;
  const opts = [{ email: me, name: (S.user.name || me.split('@')[0]) + ' (나 · me)', pick: true }].concat(list.filter(p => p.email !== me));
  openModal('<h2>👷 ' + bi('픽킹 할당', 'Assign picking') + ' — ' + orders.length + '건 · ' + money(orders.reduce((a, o) => a + (o.amt || 0), 0)) + '</h2>' +
    '<div class="muted">' + bi('직원을 고르면 그 직원 앱의 "내 픽킹" 목록에 들어갑니다. 픽킹 직원은 관리 → 사용자에서 일을 "픽킹 · 팩킹" 으로 등록하세요.', 'The orders appear in that person\'s "My picking" list.') + '</div>' +
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
  LF.ip = LF.ip || 'month'; LF.iq = LF.iq || ''; LF.it = LF.it || '';
  const types = invTypes(S);
  const q = LF.iq.trim();
  /* 가게로 찾나? (어카운트 번호 · 가게 이름) — 인보이스 번호 · 주문 번호 모양이면 아님 */
  const isNo = /^[A-Z]{1,2}\d{3,}$/i.test(q) || /^O\d{6}-/i.test(q);
  const accs = q && !isNo ? searchAccounts(S.accounts, q, 6) : [];
  const acc = accs.length === 1 || (accs.length && accs[0].acct === q) ? accs[0] : null;
  const [from, to] = periodRange(LF.ip, LF.ifrom, LF.ito);
  const top = '<div class="card" style="padding-bottom:8px"><div style="display:flex;gap:6px"><input id="iqQ" placeholder="가게 이름 · 어카운트 # · 인보이스 # · 주문 # / Store · Acct · Invoice · Order" value="' + esc(LF.iq) + '" autocomplete="off" style="flex:1">' + (LF.iq ? '<button class="b-ghost b-sm" id="iqX">✕</button>' : '') + '</div>' +
    (accs.length > 1 && !acc ? '<div class="chips">' + accs.map(a => '<button data-iqa="' + esc(a.acct) + '">' + esc(a.acct) + ' ' + esc(a.store) + '</button>').join('') + '</div>' : '') +
    (acc ? '' : '<div class="chips">' + PERIODS.map(c => '<button class="' + (LF.ip === c[0] ? 'on' : '') + '" data-ip="' + c[0] + '">' + c[1] + ' <span class="en">' + c[2] + '</span></button>').join('') + '</div>' +
      (LF.ip === 'custom' ? '<div class="two" style="margin:6px 0"><input type="date" id="iFrom" value="' + esc(from) + '"><input type="date" id="iTo" value="' + esc(to) + '"></div>' : '')) +
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
    inp.oninput = debounce(() => { if (!$('iqQ')) return; LF.iq = $('iqQ').value; const pos = inp.selectionStart; invBrowser(LF, head).then(() => { const n = $('iqQ'); if (n && document.activeElement !== n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }); }, 350);
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); LF.iq = inp.value; invBrowser(LF, head); } };
    if ($('iqX')) $('iqX').onclick = () => { LF.iq = ''; invBrowser(LF, head); };
    document.querySelectorAll('[data-iqa]').forEach(b => b.onclick = () => { LF.iq = b.dataset.iqa; invBrowser(LF, head); });
    document.querySelectorAll('[data-ip]').forEach(b => b.onclick = () => { LF.ip = b.dataset.ip; invBrowser(LF, head); });
    document.querySelectorAll('[data-it]').forEach(b => b.onclick = () => { LF.it = b.dataset.it; invBrowser(LF, head); });
    const vb = document.querySelector('[data-ivoid]'); if (vb) vb.onclick = () => { LF.ivoid = !LF.ivoid; invBrowser(LF, head); };
    if ($('iFrom')) { $('iFrom').onchange = () => { LF.ifrom = $('iFrom').value; invBrowser(LF, head); }; $('iTo').onchange = () => { LF.ito = $('iTo').value; invBrowser(LF, head); }; }
  }
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
    '<div class="btns"><button class="b-blue" id="iPrint">🖨 ' + bi('인쇄', 'Print') + '</button>' + (S.me && S.me.role === 'admin' && x.st !== 'x' ? '<button class="b-ghost" id="iVoid" style="color:#991b1b">VOID</button>' : '') + '</div></div>' +
    '<div class="card"><table><tr><th>코드</th><th class="r">수량</th><th class="r">가격</th><th class="r">금액</th></tr>' + x.lines.map(l => '<tr><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d) + '</div></td><td class="r">' + l.q + '</td><td class="r">' + money(l.p) + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') + '</table></div>';
  $('iBack').onclick = () => Router.go('order');
  $('iPrint').onclick = () => printInvoices([x], acctOf(x.acct));
  if ($('iVoid')) $('iVoid').onclick = async () => { if (!(await confirmBox(x.no + ' 인보이스를 VOID 할까요? 번호는 다시 쓰지 않습니다.', 'VOID'))) return; busy(true); try { await S.DB.update('invoices', no, { st: 'x', bal: 0, voidAt: new Date().toISOString(), voidBy: S.user.email }); dropInvCache(); await bumpSalesM(S, [x], -1); toast('VOID'); openInvoice(no); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
}
