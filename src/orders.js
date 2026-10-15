/* ============================================================
 *  오더 — 세일즈맨이 폰으로 아이템을 담아 보내고, 사무실이 확인 → SmartBee 입력 → 완료
 *  orders/{id}     = { id, no, d, ym, sm, acct, store, st, n, qty, amt, memo, inv,
 *                      createdBy, createdAt, updatedAt, sentAt, okBy, okAt, doneAt }   ← 목록용 (가벼움)
 *  orderLines/{id} = { sm, lines:[{c, d, q, p}] }                                       ← 줄 (1,000줄 넘어도 문서 하나)
 *  st: draft(임시저장) → sent(보냄) → ok(확인) → done(SmartBee 입력 완료) · x(취소)
 * ============================================================ */
import { $, esc, money, R2, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, sel, sortBy, printOpen, debounce } from './ui.js';
import { searchAccounts, accountLabel } from './accounts.js';
import { loadCatalog, catalog, searchItems, exactItem, thumb } from './catalog.js';

let S = null;
export function register(state) { S = state; Router.on('order', pageOrder); }

export const ST = { draft: ['임시저장', 't-g'], sent: ['보냄', 't-b'], ok: ['확인됨', 't-a'], done: ['완료', 't-k'], x: ['취소', 't-r'] };
const stTag = st => '<span class="tag ' + (ST[st] || ST.draft)[1] + '">' + (ST[st] || ST.draft)[0] + '</span>';
const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');
const WIP_KEY = 'theone.order.wip';
function recentYms(n) { const out = [], d = new Date(); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; }
function newNo() { const d = today().replace(/-/g, '').substring(2); return 'O' + d + '-' + Math.floor(Math.random() * 1679616).toString(36).toUpperCase().padStart(4, '0'); }
/** 같은 주소면 hashchange 가 안 생기므로 직접 엶 */
function goOrder(id) { if (location.hash === '#/order/' + encodeURIComponent(id)) openOrder(id); else Router.go('order', id); }
const canEdit = o => isStaff() ? o.st !== 'done' : (o.sm === mySm() && (o.st === 'draft' || o.st === 'sent'));

/* ============================================================
 *  목록
 * ============================================================ */
let LF = { st: 'sent', sm: '' };
async function pageOrder(arg) {
  if (arg === 'new') return openEditor(null, readWip());
  if (arg) return openOrder(arg);
  if (!isStaff() && !mySm()) { $('page').innerHTML = '<div class="card"><div class="none">이 계정에 세일즈맨 코드가 연결돼 있지 않습니다.</div></div>'; return; }
  $('page').innerHTML = '<div class="load">오더 읽는 중…</div>';
  let rows = [];
  try {
    if (isStaff()) {
      if (LF.st === 'all' || LF.st === 'done' || LF.st === 'x') rows = await S.DB.list('orders', { where: [['ym', 'in', recentYms(2)]] });
      else rows = await S.DB.list('orders', { where: [['st', '==', LF.st]] });
      if (LF.st !== 'all') rows = rows.filter(o => o.st === LF.st);
      if (LF.sm) rows = rows.filter(o => o.sm === LF.sm);
    } else rows = await S.DB.list('orders', { where: [['sm', '==', mySm()], ['ym', 'in', recentYms(2)]] });
  } catch (e) { $('page').innerHTML = '<div class="card"><div class="alert a-red">오더를 읽지 못했습니다: ' + esc(e.code || e.message) + '</div></div>'; return; }
  rows = sortBy(rows, o => o.updatedAt || o.createdAt || '', true);
  const wip = readWip();
  let h = '';
  if (isStaff()) {
    h += '<div class="chips">' + [['sent', '📥 들어온 오더'], ['ok', '✅ 확인됨'], ['done', '📗 완료'], ['draft', '임시저장'], ['x', '취소'], ['all', '전체 (2달)']].map(c => '<button class="' + (LF.st === c[0] ? 'on' : '') + '" data-lf="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
      '<div class="two" style="margin-bottom:10px">' + sel('lfSm', [['', '세일즈맨 전체']].concat(S.sms.map(s => [s.code, s.code])), LF.sm) + '<button class="b-blue" id="oNew">＋ 오더 만들기</button></div>';
  } else h += '<button class="b-blue" id="oNew" style="margin-bottom:12px">＋ 새 오더</button>';
  if (wip) h += '<div class="alert a-amb tap" id="oWip" style="margin:0 0 12px">✏️ 저장하지 않은 오더가 있습니다 — ' + esc(wip.store || '가게 미선택') + ' · ' + wip.lines.length + '줄 <b>이어서 하기 ›</b></div>';
  const tot = rows.reduce((a, o) => a + (o.amt || 0), 0);
  h += '<div class="card"><h2>오더 ' + rows.length + '건 · ' + money(tot) + '</h2>' + (rows.length ? rows.map(o =>
    '<div class="pr tap" data-oid="' + esc(o.id) + '"><div class="ct"><b>' + esc(o.store || '-') + ' ' + stTag(o.st) + '</b><small>' + esc(md(o.d)) + ' · ' + esc(o.sm) + ' · ' + esc(o.no) + (o.inv ? ' · ' + esc(o.inv) : '') + '</small></div><div class="pa"><b>' + money(o.amt) + '</b><small>' + (o.n || 0) + '줄 · ' + (o.qty || 0) + '개</small></div></div>').join('') : '<div class="none">오더가 없습니다</div>') + '</div>';
  $('page').innerHTML = h;
  $('oNew').onclick = () => { if (readWip() && !confirm('저장하지 않은 오더가 있습니다. 버리고 새로 시작할까요?')) return; clearWip(); Router.go('order', 'new'); };
  if ($('oWip')) $('oWip').onclick = () => openEditor(null, wip);
  document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { LF.st = b.dataset.lf; pageOrder(''); });
  if ($('lfSm')) $('lfSm').onchange = () => { LF.sm = $('lfSm').value; pageOrder(''); };
  document.querySelectorAll('[data-oid]').forEach(el => el.onclick = () => Router.go('order', el.dataset.oid));
}

/* ============================================================
 *  오더 보기 (사무실 처리 · 인쇄 · 엑셀)
 * ============================================================ */
async function openOrder(id) {
  $('page').innerHTML = '<div class="load">오더 여는 중…</div>';
  let o, L;
  try { [o, L] = await Promise.all([S.DB.get('orders', id), S.DB.get('orderLines', id)]); }
  catch (e) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  if (!o) { $('page').innerHTML = '<div class="card"><div class="none">오더를 찾지 못했습니다</div></div>'; return; }
  const lines = (L && L.lines) || [];
  const acc = S.accounts.byCode ? S.accounts.byCode[o.acct] : null;
  let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><h2 style="margin:0">' + esc(o.no) + ' ' + stTag(o.st) + '</h2>' +
    '<div style="font-size:17px;font-weight:800;margin-top:6px">' + esc(o.store) + '</div><div class="muted">' + esc([o.acct, acc ? [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : ''].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="muted">' + esc(o.sm) + ' · ' + esc(o.d) + (o.sentAt ? ' · 보냄 ' + esc(o.sentAt.substring(5, 16).replace('T', ' ')) : '') + (o.inv ? ' · SmartBee ' + esc(o.inv) : '') + '</div></div>' +
    '<button class="b-ghost b-sm" id="oBack">‹ 목록</button></div>' +
    '<div class="kpi"><div><b>' + lines.length + '</b><span>줄</span></div><div><b>' + lines.reduce((a, l) => a + l.q, 0) + '</b><span>수량</span></div><div style="grid-column:span 2"><b>' + money(o.amt) + '</b><span>합계</span></div></div>' +
    (o.memo ? '<div class="alert a-blu">📝 ' + esc(o.memo) + '</div>' : '') + '</div>';
  /* 버튼 */
  const B = [];
  if (canEdit(o)) B.push('<button class="b-ghost" id="oEdit">✏️ 수정</button>');
  if (!isStaff() && o.st === 'draft') B.push('<button class="b-blue" id="oSend">📤 보내기</button>');
  if (isStaff() && o.st === 'sent') B.push('<button class="b-blue" id="oOk">✅ 확인</button>');
  if (isStaff() && (o.st === 'sent' || o.st === 'ok')) B.push('<button class="b-green" id="oDone">📗 SmartBee 입력 완료</button>');
  h += '<div class="card"><div class="btns" style="margin-top:0;flex-wrap:wrap"><button class="b-ghost b-sm" id="oPrint">🖨 인쇄</button><button class="b-ghost b-sm" id="oCsv">⬇️ 엑셀(CSV)</button>' +
    (isStaff() && o.st !== 'draft' && o.st !== 'sent' ? '<button class="b-ghost b-sm" id="oBackSt">↩️ 단계 되돌리기</button>' : '') +
    ((isStaff() && o.st !== 'done' && o.st !== 'x') ? '<button class="b-ghost b-sm" id="oCancel" style="color:#991b1b">✕ 오더 취소</button>' : '') +
    ((o.st === 'draft' && (isStaff() || o.sm === mySm())) ? '<button class="b-ghost b-sm" id="oDel" style="color:#991b1b">🗑 삭제</button>' : '') +
    '</div>' + (B.length ? '<div class="btns">' + B.join('') + '</div>' : '') + '</div>';
  /* 줄 */
  h += '<div class="card"><h2>아이템 ' + lines.length + '줄</h2><input id="oFind" placeholder="이 오더 안에서 찾기" autocomplete="off" style="margin-bottom:6px"><div id="oLines"></div></div>';
  $('page').innerHTML = h;
  const paintLines = () => {
    const q = $('oFind').value.trim().toUpperCase();
    const rows = q ? lines.filter(l => (l.c + ' ' + l.d).toUpperCase().includes(q)) : lines;
    $('oLines').innerHTML = '<table><tr><th>코드</th><th class="r">수량</th><th class="r">가격</th><th class="r">금액</th></tr>' + rows.slice(0, 1500).map(l =>
      '<tr><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d) + '</div></td><td class="r"><b>' + l.q + '</b></td><td class="r">' + money(l.p) + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') + '</table>';
  };
  paintLines(); $('oFind').oninput = debounce(paintLines, 150);
  $('oBack').onclick = () => Router.go('order');
  $('oPrint').onclick = () => printOrder(o, lines);
  $('oCsv').onclick = () => csvOrder(o, lines);
  if ($('oEdit')) $('oEdit').onclick = () => openEditor(o, null, lines);
  const setSt = async (patch, msg) => { busy(true); try { await S.DB.update('orders', o.id, Object.assign({ updatedAt: new Date().toISOString() }, patch)); toast(msg, 'good'); openOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('oSend')) $('oSend').onclick = () => setSt({ st: 'sent', sentAt: new Date().toISOString() }, '보냈습니다');
  if ($('oOk')) $('oOk').onclick = () => setSt({ st: 'ok', okBy: S.user.email, okAt: new Date().toISOString() }, '확인');
  if ($('oDone')) $('oDone').onclick = () => {
    openModal('<h2>📗 SmartBee 입력 완료</h2><div class="muted">SmartBee 에서 만든 인보이스 번호를 적어 두면 나중에 찾기 쉽습니다 (여러 개면 쉼표).</div><div class="fg" style="margin-top:8px"><label>인보이스 #</label><input id="oInv" value="' + esc(o.inv || '') + '" placeholder="A41592" style="text-transform:uppercase"></div><div class="btns"><button class="b-ghost" id="oInvX">닫기</button><button class="b-green" id="oInvOk">완료로 표시</button></div>');
    $('oInvX').onclick = closeModal;
    $('oInvOk').onclick = () => { const inv = $('oInv').value.trim().toUpperCase(); closeModal(); setSt({ st: 'done', inv, doneAt: new Date().toISOString(), doneBy: S.user.email }, '완료'); };
  };
  if ($('oBackSt')) $('oBackSt').onclick = () => setSt({ st: o.st === 'done' ? 'ok' : 'sent' }, '되돌렸습니다');
  if ($('oCancel')) $('oCancel').onclick = async () => { if (await confirmBox('이 오더를 취소할까요?', '오더 취소')) setSt({ st: 'x' }, '취소했습니다'); };
  if ($('oDel')) $('oDel').onclick = async () => {
    if (!(await confirmBox('임시저장 오더를 지울까요?', '삭제'))) return;
    busy(true); try { await S.DB.batch([{ op: 'del', col: 'orderLines', id: o.id }, { op: 'del', col: 'orders', id: o.id }]); toast('지웠습니다'); Router.go('order'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
  };
}

function printOrder(o, lines) {
  const acc = S.accounts.byCode ? S.accounts.byCode[o.acct] : null;
  const rows = sortBy(lines, l => l.c);
  const qty = rows.reduce((a, l) => a + l.q, 0);
  printOpen('<h1>THE ONE — ORDER ' + esc(o.no) + '</h1><div class="meta"><b>' + esc(o.store) + '</b> (' + esc(o.acct || '신규') + ')' + (acc ? ' · ' + esc([acc.addr, acc.city, acc.state, acc.zip].filter(Boolean).join(', ')) : '') +
    '<br>세일즈맨 ' + esc(o.sm) + ' · ' + esc(o.d) + ' · ' + (ST[o.st] || ST.draft)[0] + (o.inv ? ' · INV ' + esc(o.inv) : '') + (o.memo ? '<br>메모: ' + esc(o.memo) : '') + '</div>' +
    '<table><tr><th>#</th><th>✓</th><th>CODE</th><th>DESCRIPTION</th><th class="r">QTY</th><th class="r">PRICE</th><th class="r">AMOUNT</th></tr>' +
    rows.map((l, i) => '<tr><td>' + (i + 1) + '</td><td></td><td><b>' + esc(l.c) + '</b></td><td>' + esc(l.d) + '</td><td class="r"><b>' + l.q + '</b></td><td class="r">' + money(l.p) + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') +
    '<tr class="fin"><td colspan="4">' + rows.length + ' lines</td><td class="r">' + qty + '</td><td></td><td class="r">' + money(o.amt) + '</td></tr></table>' +
    '<div class="sig"><div>Picked by</div><div>Checked by</div><div>Date</div></div>');
}
function csvOrder(o, lines) {
  const q = s => { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const out = [['Code', 'Description', 'Qty', 'Price', 'Amount']].concat(lines.map(l => [l.c, l.d, l.q, l.p.toFixed(2), (l.q * l.p).toFixed(2)]));
  const blob = new Blob(['﻿' + out.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = o.no + '_' + String(o.store || '').replace(/[^A-Za-z0-9]+/g, '_').substring(0, 30) + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ============================================================
 *  오더 작성 · 수정
 * ============================================================ */
let O = null;   // { id, no, st, sm, acct, store, memo, lines:[{c,d,q,p}], view, q, path, createdAt }
let IDX = {};   // code → line
function readWip() { try { const w = JSON.parse(localStorage.getItem(WIP_KEY) || 'null'); return w && Array.isArray(w.lines) ? w : null; } catch (e) { return null; } }
function clearWip() { try { localStorage.removeItem(WIP_KEY); } catch (e) {} }
function flushWip() { if (!O) return; try { localStorage.setItem(WIP_KEY, JSON.stringify(O)); } catch (e) {} }
const saveWip = debounce(flushWip, 400);
/* 앱을 닫거나 다른 앱으로 넘어갈 때 바로 저장 */
if (typeof window !== 'undefined') { window.addEventListener('pagehide', flushWip); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushWip(); }); }
function reindex() { IDX = {}; O.lines.forEach(l => { IDX[l.c] = l; }); }

async function openEditor(order, wip, lines) {
  if (!order && !wip && !isStaff() && !mySm()) return toast('세일즈맨 코드가 없습니다', 'bad');
  $('page').innerHTML = '<div class="load">아이템 목록 준비 중… (처음 한 번은 조금 걸립니다)</div>';
  try { await loadCatalog(S); } catch (e) { $('page').innerHTML = '<div class="card"><div class="alert a-red">아이템 목록을 읽지 못했습니다: ' + esc(e.code || e.message) + '</div></div>'; return; }
  if (!catalog().items.length) { $('page').innerHTML = '<div class="card"><div class="none">아직 아이템 목록이 없습니다.<br>관리 → 📦 아이템에서 Item Master 를 올려 주세요.</div></div>'; return; }
  if (wip) O = wip;
  else if (order) {
    if (!lines) { const L = await S.DB.get('orderLines', order.id); lines = (L && L.lines) || []; }
    O = { id: order.id, no: order.no, st: order.st, sm: order.sm, acct: order.acct, store: order.store, memo: order.memo || '', lines: lines.map(l => Object.assign({}, l)), createdAt: order.createdAt, createdBy: order.createdBy, d: order.d };
  } else O = { id: '', no: '', st: 'draft', sm: isStaff() ? '' : mySm(), acct: '', store: '', memo: '', lines: [], d: today() };
  O.view = O.view || (O.lines.length ? 'cart' : 'add'); O.q = ''; O.path = O.path || [];
  reindex(); saveWip();
  paintEditor();
}
function totals() { let qty = 0, amt = 0; O.lines.forEach(l => { qty += l.q; amt += l.q * l.p; }); return { n: O.lines.length, qty, amt: R2(amt) }; }

function paintEditor() {
  const t = totals();
  const acc = O.acct && S.accounts.byCode ? S.accounts.byCode[O.acct] : null;
  let h = '<div class="card">' + (O.id ? '<div class="alert a-amb" style="margin:0 0 10px">✏️ ' + esc(O.no) + ' 수정 중 ' + stTag(O.st) + '</div>' : '') + '<h2>가게</h2>';
  if (O.store) h += '<div class="pick on"><div class="pm"><b>' + esc(O.store) + '</b><small>' + esc(acc ? acc.acct + ' · ' + [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : (O.acct || '계정 없음')) + '</small></div><button class="b-ghost b-sm" id="eStoreX">바꾸기</button></div>';
  else h += '<input id="eStoreQ" placeholder="가게 이름 · 계정코드 · 도시" autocomplete="off"><div class="hits" id="eStoreHits" style="display:none"></div>';
  if (isStaff()) h += '<div class="fg" style="margin-top:8px"><label>세일즈맨</label>' + sel('eSm', [['', '— 선택 —']].concat(S.sms.map(s => [s.code, s.code])), O.sm) + '</div>';
  h += '</div>';
  h += '<div class="seg"><button class="' + (O.view === 'add' ? 'on' : '') + '" data-ev="add">🔍 아이템 담기</button><button class="' + (O.view === 'cart' ? 'on' : '') + '" data-ev="cart">🧾 오더 <span id="eCnt">' + t.n + '</span>줄</button></div>';
  h += '<div id="eBody"></div>';
  h += '<div class="sticky"><div class="sumbox" style="margin:0 0 8px;display:flex;justify-content:space-between"><span><b id="eN">' + t.n + '</b>줄 · 수량 <b id="eQ">' + t.qty + '</b></span><b id="eA">' + money(t.amt) + '</b></div><div class="btns" style="margin-top:0">' +
    (O.st === 'draft' ? '<button class="b-ghost" id="eDraft">💾 임시저장</button><button class="b-green" id="eSend">📤 보내기</button>' : '<button class="b-ghost" id="eQuit">닫기</button><button class="b-green" id="eSave">💾 저장</button>') + '</div></div>';
  $('page').innerHTML = h;
  /* 가게 */
  if ($('eStoreX')) $('eStoreX').onclick = () => { O.store = ''; O.acct = ''; saveWip(); paintEditor(); };
  if ($('eStoreQ')) {
    const q = $('eStoreQ'), box = $('eStoreHits');
    q.oninput = () => {
      const hits = searchAccounts(S.accounts, q.value, 12);
      if (!q.value.trim()) { box.style.display = 'none'; return; }
      box.innerHTML = hits.map(a => '<div data-ac="' + esc(a.acct) + '"><b>' + esc(accountLabel(a)) + '</b><small>' + esc(a.acct + ' · ' + [a.addr, a.city].filter(Boolean).join(', ') + (a.sm ? ' · ' + a.sm : '')) + '</small></div>').join('') || '<div class="muted">찾는 가게가 없습니다</div>';
      box.style.display = 'block';
      box.querySelectorAll('[data-ac]').forEach(el => el.onclick = () => { const a = S.accounts.byCode[el.dataset.ac]; O.acct = a.acct; O.store = a.store; if (isStaff() && !O.sm && a.sm) O.sm = String(a.sm).toUpperCase(); saveWip(); paintEditor(); });
    };
  }
  if ($('eSm')) $('eSm').onchange = () => { O.sm = $('eSm').value; saveWip(); };
  document.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { O.view = b.dataset.ev; saveWip(); paintEditor(); });
  if ($('eDraft')) $('eDraft').onclick = () => saveOrder('draft');
  if ($('eSend')) $('eSend').onclick = () => saveOrder('sent');
  if ($('eSave')) $('eSave').onclick = () => saveOrder(O.st);
  if ($('eQuit')) $('eQuit').onclick = async () => { if (await confirmBox('저장하지 않고 닫을까요?', '닫기')) { const id = O.id; O = null; clearWip(); if (id) goOrder(id); else Router.go('order'); } };
  if (O.view === 'add') paintAdd(); else paintCart();
}
function refreshTotals() {
  const t = totals();
  if ($('eN')) { $('eN').textContent = t.n; $('eQ').textContent = t.qty; $('eA').textContent = money(t.amt); $('eCnt').textContent = t.n; }
}
/** 수량 바꾸기 — 0 이면 줄 삭제 */
function setQty(code, q) {
  q = Math.max(0, Math.floor(Number(q) || 0));
  const it = catalog().byCode[code], cur = IDX[code];
  if (!q) { if (cur) { O.lines = O.lines.filter(l => l !== cur); delete IDX[code]; } }
  else if (cur) cur.q = q;
  else if (it) { const l = { c: it.c, d: it.d, q, p: it.p }; O.lines.push(l); IDX[code] = l; }
  saveWip(); refreshTotals();
  return IDX[code] ? IDX[code].q : 0;
}

/* ---- 담기: 검색 · 스캔 · 카테고리 ---- */
function paintAdd() {
  const T = catalog().tree;
  let node = T; O.path.forEach(p => { node = (node && node.map[p]) || null; });
  if (!node) { O.path = []; node = T; }
  const crumbs = '<div class="chips" style="margin-top:0"><button class="' + (O.path.length ? '' : 'on') + '" data-cp="0">전체</button>' + O.path.map((p, i) => '<button class="' + (i === O.path.length - 1 ? 'on' : '') + '" data-cp="' + (i + 1) + '">' + esc(p) + '</button>').join('') + '</div>';
  const kids = node.kids.length ? '<div class="chips">' + node.kids.map(k => '<button data-ck="' + esc(k.name) + '">' + esc(k.name) + ' <span class="muted">' + k.n + '</span></button>').join('') + '</div>' : '';
  $('eBody').innerHTML = '<div class="card"><input id="eQ1" placeholder="코드 · 이름 · 바코드 (스캐너는 여기에)" autocomplete="off" autocapitalize="characters" enterkeyhint="done" value="' + esc(O.q) + '">' +
    '<div class="muted" style="margin-top:4px">바코드나 코드를 정확히 넣고 엔터 → 1개 담김 (스캐너 그대로 사용)</div>' + crumbs + kids + '<div id="eRes"></div></div>';
  const q = $('eQ1');
  const run = () => { O.q = q.value; paintResults(); };
  q.oninput = debounce(run, 160);
  q.onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const it = exactItem(q.value);
    if (it) { const n = setQty(it.c, (IDX[it.c] ? IDX[it.c].q : 0) + 1); toast(it.c + ' → ' + n + '개', 'good'); q.value = ''; O.q = ''; paintResults(); }
    else { run(); toast('정확히 맞는 코드가 없습니다 — 아래에서 고르세요', 'bad'); }
  };
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { O.path = O.path.slice(0, Number(b.dataset.cp)); paintAdd(); });
  document.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { O.path = O.path.concat([b.dataset.ck]); paintAdd(); });
  paintResults();
  if (!('ontouchstart' in window)) q.focus();
}
function itemRow(it) {
  const cur = IDX[it.c] ? IDX[it.c].q : 0;
  return '<div class="pr irow' + (cur ? ' v' : '') + '" data-row="' + esc(it.c) + '">' +
    (it.ph ? '<img src="' + esc(thumb(it.ph)) + '" loading="lazy" alt="" class="ith">' : '<div class="ith"></div>') +
    '<div class="ct"><b>' + esc(it.c) + '</b><small>' + esc(it.d) + '</small><small>' + money(it.p) + (it.s ? ' · SRP ' + money(it.s) : '') + '</small></div>' +
    '<div class="qty"><button data-dq="' + esc(it.c) + '" data-d="-1">−</button><input type="number" inputmode="numeric" min="0" data-qi="' + esc(it.c) + '" value="' + (cur || '') + '" placeholder="0"><button data-dq="' + esc(it.c) + '" data-d="1">＋</button></div></div>';
}
function paintResults() {
  const res = searchItems(O.q, O.path, 80);
  const total = O.q || O.path.length ? '' : '<div class="muted" style="margin:6px 0">카테고리를 고르거나 검색하세요 (전체 ' + catalog().items.length.toLocaleString() + '개)</div>';
  $('eRes').innerHTML = total + (res.length ? res.map(itemRow).join('') + (res.length >= 80 ? '<div class="muted" style="text-align:center;padding:8px">80개까지 보여 줍니다 — 더 좁혀 찾으세요</div>' : '') : '<div class="none">찾는 아이템이 없습니다</div>');
  bindQty($('eRes'));
}
/** 수량 칸 · ± 버튼 (담기 · 오더 화면 공통) */
function bindQty(root) {
  root.querySelectorAll('[data-dq]').forEach(b => b.onclick = () => {
    const c = b.dataset.dq, inp = root.querySelector('[data-qi="' + CSS.escape(c) + '"]');
    const n = setQty(c, (IDX[c] ? IDX[c].q : 0) + Number(b.dataset.d));
    if (inp) inp.value = n || ''; markRow(root, c, n);
  });
  root.querySelectorAll('[data-qi]').forEach(inp => {
    inp.onchange = () => { const n = setQty(inp.dataset.qi, inp.value); inp.value = n || ''; markRow(root, inp.dataset.qi, n); };
    inp.onfocus = () => inp.select();
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); const q = $('eQ1'); if (q) q.focus(); } };
  });
}
function markRow(root, c, n) {
  const row = root.querySelector('[data-row="' + CSS.escape(c) + '"]'); if (!row) return;
  if (O.view === 'cart' && !n) { row.remove(); return; }
  row.classList.toggle('v', !!n);
  if (O.view === 'cart') { const l = IDX[c]; const a = row.querySelector('.lamt'); if (a && l) a.textContent = money(l.q * l.p); }
}

/* ---- 오더(담은 것) ---- */
function paintCart() {
  const staff = isStaff();
  $('eBody').innerHTML = '<div class="card">' + (O.lines.length > 15 ? '<input id="eF" placeholder="오더 안에서 찾기" autocomplete="off" style="margin-bottom:6px">' : '') + '<div id="eCart"></div>' +
    '<div class="fg" style="margin-top:10px"><label>메모 (배송 · 특이사항)</label><input id="eMemo" value="' + esc(O.memo || '') + '"></div></div>';
  const paint = () => {
    const f = $('eF') ? $('eF').value.trim().toUpperCase() : '';
    const rows = O.lines.slice().reverse().filter(l => !f || (l.c + ' ' + l.d).toUpperCase().includes(f));
    $('eCart').innerHTML = rows.length ? rows.map(l => {
      const it = catalog().byCode[l.c];
      const pchg = it && it.p !== l.p;
      return '<div class="pr irow v" data-row="' + esc(l.c) + '"><div class="ct"><b>' + esc(l.c) + (it ? '' : ' <span class="tag t-r">목록에 없음</span>') + '</b><small>' + esc(l.d) + '</small>' +
        '<small>' + (staff ? '$ <input class="sm pin" type="number" step="0.01" inputmode="decimal" data-pi="' + esc(l.c) + '" value="' + l.p + '">' : money(l.p)) + (pchg ? ' <span class="tag t-c">목록가 ' + money(it.p) + '</span>' : '') + ' · <b class="lamt">' + money(l.q * l.p) + '</b></small></div>' +
        '<div class="qty"><button data-dq="' + esc(l.c) + '" data-d="-1">−</button><input type="number" inputmode="numeric" min="0" data-qi="' + esc(l.c) + '" value="' + l.q + '"><button data-dq="' + esc(l.c) + '" data-d="1">＋</button></div></div>';
    }).join('') : '<div class="none">아직 담은 아이템이 없습니다 — 🔍 아이템 담기</div>';
    bindQty($('eCart'));
    $('eCart').querySelectorAll('[data-pi]').forEach(inp => inp.onchange = () => { const l = IDX[inp.dataset.pi]; if (!l) return; l.p = R2(inp.value); inp.value = l.p; saveWip(); refreshTotals(); markRow($('eCart'), l.c, l.q); });
  };
  paint();
  if ($('eF')) $('eF').oninput = debounce(paint, 150);
  $('eMemo').oninput = () => { O.memo = $('eMemo').value; saveWip(); };
}

async function saveOrder(st) {
  if (!O.store) return toast('가게를 고르세요', 'bad');
  if (!O.sm) return toast('세일즈맨을 고르세요', 'bad');
  if (!O.lines.length) return toast('아이템을 담으세요', 'bad');
  if (st === 'sent' && O.st === 'draft' && !(await confirmBox(O.store + ' — ' + O.lines.length + '줄 · ' + money(totals().amt) + ' 오더를 사무실로 보낼까요?', '보내기'))) return;
  const t = totals(), now = new Date().toISOString();
  const isNew = !O.id;
  if (isNew) { O.no = newNo(); O.id = O.no; }
  const doc = { no: O.no, d: O.d || today(), ym: ym(O.d || today()), sm: O.sm, acct: O.acct || '', store: O.store, st, n: t.n, qty: t.qty, amt: t.amt, memo: O.memo || '', updatedAt: now,
    createdBy: O.createdBy || S.user.email, createdAt: O.createdAt || now, catVer: catalog().ver || '' };
  if (st === 'sent' && O.st !== 'sent') doc.sentAt = now;
  busy(true);
  try {
    const old = isNew ? null : await S.DB.get('orders', O.id);
    if (old && !isNew) { ['sentAt', 'okBy', 'okAt', 'inv', 'doneAt', 'doneBy'].forEach(k => { if (old[k] && !doc[k]) doc[k] = old[k]; }); if (!canEdit(old)) throw new Error('이미 처리된 오더라 고칠 수 없습니다 (' + (ST[old.st] || ['?'])[0] + ')'); }
    await S.DB.batch([{ op: 'set', col: 'orders', id: O.id, data: doc }, { op: 'set', col: 'orderLines', id: O.id, data: { sm: O.sm, lines: O.lines.map(l => ({ c: l.c, d: l.d, q: l.q, p: l.p })) } }]);
    const id = O.id; O = null; clearWip();
    toast(st === 'sent' ? '보냈습니다 📤' : '저장했습니다', 'good');
    goOrder(id);
  } catch (e) { if (isNew) { O.id = ''; O.no = ''; } toast('실패: ' + (e.code || e.message), 'bad'); }
  busy(false);
}
