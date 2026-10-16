/* ============================================================
 *  오더 — 세일즈맨 (폰 · 아이패드, 인터넷 없어도 됨)
 *    가게 고르기 → 아이템 담기 (가격 · 수량 · 할인 수정 가능) → 저장/보내기
 *    저장하면 먼저 폰의 "보낼 함"에 넣고, 인터넷이 되면 회사로 보냄 → 보낸 뒤에야 보낼 함에서 지움 (오더가 사라지지 않게)
 *  매니저 처리(픽킹 → 인보이스 확정 → 백오더)는 fulfill.js
 *
 *  orders/{id}     = { id, no, d, ym, sm, acct, store, st, n, qty, amt, list, pdiff, pdn, disc:{A:20}, discChg, memo,
 *                      createdBy, createdAt, updatedAt, sentAt, pickAt, pickBy, invs:[], doneAt, doneBy, bo }   ← 목록용
 *  orderLines/{id} = { sm, lines:[{c, d, q, p, lp, t, pq?, note?}] }   (lp = 목록가, t = 인보이스 종류, pq = 픽킹 수량)
 *  st: draft(임시저장) → sent(보냄) → pick(픽킹 중) → done(인보이스 확정) · x(취소)
 * ============================================================ */
import { $, esc, money, R2, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, sel, sortBy, debounce } from './ui.js';
import { searchAccounts, accountLabel } from './accounts.js';
import { loadCatalog, catalog, searchItems, exactItem, thumb } from './catalog.js';
import { invTypes, typeOfItem, acctDisc, splitByType, priceDiff } from './invoicing.js';
import * as Fulfill from './fulfill.js';
import * as Store from './store.js';

let S = null;
const DT = () => invTypes(S)[0].c;   // 기본 인보이스 종류
export function register(state) {
  S = state; Router.on('order', pageOrder); Fulfill.register(state); Store.register(state);
  /* 인터넷이 다시 되면 · 앱을 다시 열면 보낼 함을 비움 */
  window.addEventListener('online', () => syncOutbox(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncOutbox(true); });
}

export const ST = { draft: ['임시저장', 't-g'], sent: ['들어옴', 't-b'], ok: ['픽킹 중', 't-c'], pick: ['픽킹 중', 't-c'], done: ['인보이스 완료', 't-k'], x: ['취소', 't-r'], local: ['📤 전송 대기', 't-r'] };
export const stTag = st => '<span class="tag ' + (ST[st] || ST.draft)[1] + '">' + (ST[st] || ST.draft)[0] + '</span>';
const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');
const WIP_KEY = 'theone.order.wip', OUT_KEY = 'theone.outbox.v1';
export function recentYms(n) { const out = [], d = new Date(); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; }
function newNo() { const d = today().replace(/-/g, '').substring(2); return 'O' + d + '-' + Math.floor(Math.random() * 1679616).toString(36).toUpperCase().padStart(4, '0'); }
/** 같은 주소면 hashchange 가 안 생기므로 직접 엶 */
export function goOrder(id) { if (location.hash === '#/order/' + encodeURIComponent(id)) pageOrder(id); else Router.go('order', id); }
export const canEdit = o => isStaff() ? (o.st !== 'done' && o.st !== 'x') : (o.sm === mySm() && (o.st === 'draft' || o.st === 'sent' || o.st === 'local'));

/* ============================================================
 *  보낼 함 (outbox) — 폰에 저장 → 인터넷 되면 전송
 * ============================================================ */
function readOut() { try { return JSON.parse(localStorage.getItem(OUT_KEY) || '{}') || {}; } catch (e) { return {}; } }
function writeOut(m) { try { localStorage.setItem(OUT_KEY, JSON.stringify(m)); return true; } catch (e) { return false; } }
export function outboxList() { return Object.values(readOut()); }
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
let SYNCING = false;
/** 보낼 함의 오더를 회사로 — 성공한 것만 지움. 돌려주는 값: { sent, left } */
export async function syncOutbox(quiet) {
  if (SYNCING || !S || !S.DB) return { sent: 0, left: outboxList().length };
  const box = readOut(), ids = Object.keys(box);
  if (!ids.length) return { sent: 0, left: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { sent: 0, left: ids.length };
  SYNCING = true; let sent = 0;
  for (const id of ids) {
    const x = box[id];
    try {
      await withTimeout(S.DB.batch([{ op: 'set', col: 'orders', id, data: x.o }, { op: 'set', col: 'orderLines', id, data: { sm: x.o.sm, lines: x.lines } }]), 20000);
      const now = readOut(); if (now[id] && now[id].at === x.at) { delete now[id]; writeOut(now); } sent++;
    } catch (e) {
      if (/permission/i.test(String(e.code || e.message))) { const now = readOut(); if (now[id]) { now[id].err = String(e.code || e.message); writeOut(now); } }
    }
  }
  SYNCING = false;
  const left = outboxList().length;
  if (!quiet || sent) { if (sent) toast('📤 오더 ' + sent + '건 보냄' + (left ? ' · 남은 ' + left + '건' : ''), 'good'); }
  if (sent && location.hash === '#/order' && !O) pageOrder('');
  return { sent, left };
}

/* ============================================================
 *  목록
 * ============================================================ */
let LF = { st: 'sent', sm: '' };
async function pageOrder(arg) {
  if (arg === 'new') return openEditor(null, readWip());
  if (arg && arg.indexOf('bo:') === 0) return Fulfill.openBackorder(arg.substring(3));
  if (arg && arg.indexOf('inv:') === 0) return Fulfill.openInvoice(arg.substring(4));
  if (arg) return openOrder(arg);
  if (!isStaff() && !mySm()) { $('page').innerHTML = '<div class="card"><div class="none">이 계정에 세일즈맨 코드가 연결돼 있지 않습니다.</div></div>'; return; }
  O = null;
  if (isStaff() && (LF.st === 'bo' || LF.st === 'inv')) return Fulfill.pageLists(LF, listHead());
  $('page').innerHTML = listHead() + '<div class="load">오더 읽는 중…</div>';
  bindHead();
  syncOutbox(true);
  let rows = [], err = '';
  try {
    if (isStaff()) {
      if (LF.st === 'all' || LF.st === 'done' || LF.st === 'x') rows = await S.DB.list('orders', { where: [['ym', 'in', recentYms(2)]] });
      else rows = await S.DB.list('orders', { where: [['st', 'in', LF.st === 'pick' ? ['pick', 'ok'] : [LF.st]]] });
      if (LF.st !== 'all') rows = rows.filter(o => LF.st === 'pick' ? (o.st === 'pick' || o.st === 'ok') : o.st === LF.st);
      if (LF.sm) rows = rows.filter(o => o.sm === LF.sm);
    } else rows = await S.DB.list('orders', { where: [['sm', '==', mySm()], ['ym', 'in', recentYms(2)]] });
  } catch (e) { err = String(e.code || e.message); }
  /* 보낼 함에 있는 것 (아직 회사에 안 간 것) 을 위에 */
  const out = outboxList().filter(x => isStaff() || x.o.sm === mySm());
  const outIds = {}; out.forEach(x => { outIds[x.o.id] = 1; });
  rows = rows.filter(o => !outIds[o.id]);
  rows = sortBy(rows, o => o.updatedAt || o.createdAt || '', true);
  const wip = readWip();
  let h = '';
  if (wip) h += '<div class="alert a-amb tap" id="oWip" style="margin:0 0 12px">✏️ 작성 중인 오더 — ' + esc(wip.store || '가게 미선택') + ' · ' + wip.lines.length + '줄 <b>이어서 하기 ›</b></div>';
  if (out.length) h += '<div class="card" style="border:2px solid #fecaca"><h2>📤 아직 회사로 안 간 오더 ' + out.length + '건</h2><div class="muted">폰에 안전하게 저장돼 있습니다. 인터넷이 되면 자동으로 보내고, 아래 버튼으로 바로 보낼 수도 있습니다.</div>' +
    out.map(x => orderRow(x.o, true, x.err)).join('') + '<button class="b-blue" id="oSync" style="margin-top:8px">📤 지금 모두 보내기</button></div>';
  if (err) h += '<div class="alert a-amb">회사 기록을 읽지 못했습니다 (' + esc(err) + ') — 인터넷이 안 되면 폰에 저장된 것만 보입니다.</div>';
  const tot = rows.reduce((a, o) => a + (o.amt || 0), 0);
  h += '<div class="card"><h2>' + (isStaff() ? '' : '내 ') + '오더 ' + rows.length + '건 · ' + money(tot) + (isStaff() ? '' : ' <span class="muted">(최근 2달)</span>') + '</h2>' + (rows.length ? rows.map(o => orderRow(o)).join('') : '<div class="none">오더가 없습니다</div>') + '</div>';
  $('page').innerHTML = listHead() + h;
  bindHead();
  if ($('oWip')) $('oWip').onclick = () => openEditor(null, wip);
  if ($('oSync')) $('oSync').onclick = async () => { busy(true); const r = await syncOutbox(false); busy(false); if (!r.sent) toast(navigator.onLine === false ? '인터넷이 안 됩니다 — 폰에 그대로 있습니다' : '보내지 못했습니다 — 잠시 뒤 다시', 'bad'); pageOrder(''); };
  document.querySelectorAll('[data-oid]').forEach(el => el.onclick = () => Router.go('order', el.dataset.oid));
}
function listHead() {
  if (!isStaff()) return '<button class="b-blue" id="oNew" style="margin-bottom:12px;padding:15px">＋ 새 오더</button>';
  return '<div class="chips">' + [['sent', '📥 들어온 오더'], ['pick', '📦 픽킹 중'], ['done', '🧾 인보이스 완료'], ['bo', '⏳ 백오더'], ['inv', '📄 인보이스'], ['draft', '임시저장'], ['x', '취소'], ['all', '전체 (2달)']].map(c => '<button class="' + (LF.st === c[0] ? 'on' : '') + '" data-lf="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
    '<div class="two" style="margin-bottom:10px">' + sel('lfSm', [['', '세일즈맨 전체']].concat(S.sms.map(s => [s.code, s.code])), LF.sm) + '<button class="b-blue" id="oNew">＋ 오더 만들기</button></div>';
}
function bindHead() {
  if ($('oNew')) $('oNew').onclick = () => { if (readWip() && !confirm('작성 중인 오더가 있습니다. 버리고 새로 시작할까요?')) return; clearWip(); Router.go('order', 'new'); };
  document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { LF.st = b.dataset.lf; pageOrder(''); });
  if ($('lfSm')) $('lfSm').onchange = () => { LF.sm = $('lfSm').value; pageOrder(''); };
}
function orderRow(o, local, err) {
  const flags = (o.pdn ? ' <span class="tag t-c">가격 ' + o.pdn + '줄</span>' : '') + (o.discChg ? ' <span class="tag t-a">할인 변경</span>' : '');
  return '<div class="pr tap" data-oid="' + esc(o.id) + '"><div class="ct"><b>' + esc(o.store || '-') + ' ' + stTag(local ? 'local' : o.st) + flags + '</b><small>' + esc(md(o.d)) + ' · ' + esc(o.sm) + ' · ' + esc(o.no) + (o.invs && o.invs.length ? ' · ' + esc(o.invs.join(', ')) : '') + '</small>' + (err ? '<small class="warn">' + esc(err) + '</small>' : '') + '</div><div class="pa"><b>' + money(o.amt) + '</b><small>' + (o.n || 0) + '줄 · ' + (o.qty || 0) + '개</small></div></div>';
}

/* ============================================================
 *  오더 열기 — 세일즈맨은 보기, 매니저는 처리 화면
 * ============================================================ */
async function openOrder(id) {
  const local = readOut()[id];
  if (local) return viewOrder(local.o, local.lines, true);
  $('page').innerHTML = '<div class="load">오더 여는 중…</div>';
  let o, L;
  try { [o, L] = await Promise.all([S.DB.get('orders', id), S.DB.get('orderLines', id)]); }
  catch (e) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  if (!o) { $('page').innerHTML = '<div class="card"><div class="none">오더를 찾지 못했습니다</div></div>'; return; }
  const lines = (L && L.lines) || [];
  if (isStaff()) return Fulfill.manage(o, lines);
  viewOrder(o, lines, false);
}
function viewOrder(o, lines, local) {
  const acc = S.accounts.byCode ? S.accounts.byCode[o.acct] : null;
  const by = splitByType(lines, o.disc, 'q'), pd = priceDiff(lines, 'q');
  let h = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">' + esc(o.no) + ' ' + stTag(local ? 'local' : o.st) + '</h2>' +
    '<div style="font-size:17px;font-weight:800;margin-top:6px">' + esc(o.store) + '</div><div class="muted">' + esc([o.acct, acc ? [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : ''].filter(Boolean).join(' · ')) + '</div><div class="muted">' + esc(o.sm) + ' · ' + esc(o.d) + '</div></div>' +
    '<button class="b-ghost b-sm" id="oBack">‹ 목록</button></div>' + typeSummary(by) +
    (pd.n ? '<div class="alert a-amb">가격 수정 ' + pd.n + '줄 · 목록가 대비 ' + (pd.diff >= 0 ? '+' : '') + money(pd.diff) + ' (' + pd.pct + '%)</div>' : '') +
    (o.memo ? '<div class="alert a-blu">📝 ' + esc(o.memo) + '</div>' : '') +
    (local ? '<div class="alert a-red">📤 아직 회사로 안 갔습니다 — 폰에 저장돼 있습니다</div>' : '') + '</div>';
  const B = [];
  if (o.acct) B.push('<button class="b-ghost" id="oStoreI">📋 가게 기록</button>');
  if (canEdit(o)) B.push('<button class="b-ghost" id="oEdit">✏️ 수정</button>');
  if (local) B.push('<button class="b-blue" id="oSyncOne">📤 지금 보내기</button>');
  if (local && readOut()[o.id] && readOut()[o.id].err) B.push('<button class="b-ghost" id="oDropLocal" style="color:#991b1b">🗑 이 기록 지우기</button>');
  else if (o.st === 'draft' && o.sm === mySm()) B.push('<button class="b-blue" id="oSend">📤 회사로 보내기</button>');
  if (B.length) h += '<div class="card"><div class="btns" style="margin-top:0">' + B.join('') + '</div></div>';
  h += '<div class="card"><h2>아이템 ' + lines.length + '줄</h2><input id="oFind" placeholder="이 오더 안에서 찾기" autocomplete="off" style="margin-bottom:6px"><div id="oLines"></div></div>';
  $('page').innerHTML = h;
  const paint = () => {
    const q = $('oFind').value.trim().toUpperCase();
    const rows = q ? lines.filter(l => (l.c + ' ' + l.d).toUpperCase().includes(q)) : lines;
    $('oLines').innerHTML = '<table><tr><th>코드</th><th class="r">수량</th><th class="r">가격</th><th class="r">금액</th></tr>' + rows.slice(0, 2000).map(l =>
      '<tr><td><b>' + esc(l.c) + '</b> <span class="tag t-g">' + esc(l.t || DT()) + '</span><div class="muted" style="font-size:11.5px">' + esc(l.d) + '</div></td><td class="r"><b>' + l.q + '</b>' + (l.pq != null && l.pq !== l.q ? '<div class="muted">픽 ' + l.pq + '</div>' : '') + '</td><td class="r">' + money(l.p) + (l.lp != null && l.lp !== l.p ? '<div class="muted" style="text-decoration:line-through">' + money(l.lp) + '</div>' : '') + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') + '</table>';
  };
  paint(); $('oFind').oninput = debounce(paint, 150);
  $('oBack').onclick = () => Router.go('order');
  if ($('oEdit')) $('oEdit').onclick = () => openEditor(o, null, lines);
  if ($('oStoreI')) $('oStoreI').onclick = () => Store.storeSheet(o.acct);
  if ($('oDropLocal')) $('oDropLocal').onclick = async () => { if (!(await confirmBox('회사로 못 간 이 오더를 폰에서 지울까요? (' + readOut()[o.id].err + ')', '지우기'))) return; const b = readOut(); delete b[o.id]; writeOut(b); Router.go('order'); };
  if ($('oSyncOne')) $('oSyncOne').onclick = async () => { busy(true); const r = await syncOutbox(false); busy(false); if (!r.sent) toast('인터넷이 안 됩니다 — 폰에 그대로 있습니다', 'bad'); else goOrder(o.id); };
  if ($('oSend')) $('oSend').onclick = async () => { const ol = Object.assign({}, o, { st: 'sent', sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); putOut(ol, lines); await syncOutbox(false); goOrder(o.id); };
}
/** 종류별 합계 · 할인 표 */
export function typeSummary(by) {
  const g = Object.values(by); if (!g.length) return '';
  const names = {}; invTypes(S).forEach(t => { names[t.c] = t.n; });
  const tot = g.reduce((a, x) => a + x.total, 0);
  return '<table style="margin-top:10px"><tr><th>종류</th><th class="r">수량</th><th class="r">금액</th><th class="r">할인</th><th class="r">합계</th></tr>' +
    g.map(x => '<tr><td><b>' + esc(x.t) + '</b> <span class="muted">' + esc(names[x.t] || '') + '</span></td><td class="r">' + x.qty + '</td><td class="r">' + money(x.sub) + '</td><td class="r">' + (x.disc ? x.disc + '%' : '—') + '</td><td class="r"><b>' + money(x.total) + '</b></td></tr>').join('') +
    (g.length > 1 ? '<tr><td colspan="4"><b>합계</b></td><td class="r"><b>' + money(tot) + '</b></td></tr>' : '') + '</table>';
}

/* ============================================================
 *  오더 작성 · 수정
 * ============================================================ */
let O = null;   // { id, no, st, sm, acct, store, memo, disc, lines:[{c,d,q,p,lp,t}], view, q, path, createdAt, createdBy, d, pick? }
let IDX = {};
function readWip() { try { const w = JSON.parse(localStorage.getItem(WIP_KEY) || 'null'); return w && Array.isArray(w.lines) ? w : null; } catch (e) { return null; } }
function clearWip() { try { localStorage.removeItem(WIP_KEY); } catch (e) {} }
function flushWip() { if (!O) return; try { localStorage.setItem(WIP_KEY, JSON.stringify(O)); } catch (e) {} }
const saveWip = debounce(flushWip, 400);
if (typeof window !== 'undefined') { window.addEventListener('pagehide', flushWip); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushWip(); }); }
function reindex() { IDX = {}; O.lines.forEach(l => { IDX[l.c] = l; }); }
function accDiscOf() { return acctDisc(O.acct && S.accounts.byCode ? S.accounts.byCode[O.acct] : null); }

export async function openEditor(order, wip, lines) {
  if (!order && !wip && !isStaff() && !mySm()) return toast('세일즈맨 코드가 없습니다', 'bad');
  $('page').innerHTML = '<div class="load">아이템 목록 준비 중… (처음 한 번은 조금 걸립니다)</div>';
  try { await loadCatalog(S); } catch (e) { if (!catalog()) { $('page').innerHTML = '<div class="card"><div class="alert a-red">아이템 목록을 읽지 못했습니다: ' + esc(e.code || e.message) + '</div></div>'; return; } }
  if (!catalog().items.length) { $('page').innerHTML = '<div class="card"><div class="none">아직 아이템 목록이 없습니다.<br>관리 → 📦 아이템에서 Item Master 를 올려 주세요.</div></div>'; return; }
  if (wip) O = wip;
  else if (order) {
    if (!lines) { const L = await S.DB.get('orderLines', order.id); lines = (L && L.lines) || []; }
    O = { id: order.id, no: order.no, st: order.st, sm: order.sm, acct: order.acct, store: order.store, memo: order.memo || '', disc: Object.assign({}, order.disc || {}), lines: lines.map(l => Object.assign({}, l)), createdAt: order.createdAt, createdBy: order.createdBy, d: order.d, sentAt: order.sentAt || '' };
  } else O = { id: '', no: '', st: 'draft', sm: isStaff() ? '' : mySm(), acct: '', store: '', memo: '', disc: {}, lines: [], d: today() };
  O.disc = O.disc || {};
  O.view = O.view || (O.lines.length ? 'cart' : 'add'); O.q = ''; O.path = O.path || [];
  INFO = null; FOCUS = '';
  reindex(); saveWip();
  paintEditor();
}
function totals() { const by = splitByType(O.lines, O.disc, 'q'); let qty = 0, amt = 0; Object.values(by).forEach(g => { qty += g.qty; amt += g.total; }); return { n: O.lines.length, qty, amt: R2(amt), by }; }

function paintEditor() {
  const t = totals();
  const acc = O.acct && S.accounts.byCode ? S.accounts.byCode[O.acct] : null;
  let h = '<div class="card">' + (O.id ? '<div class="alert a-amb" style="margin:0 0 10px">✏️ ' + esc(O.no) + ' 수정 중 ' + stTag(O.st) + '</div>' : '') + '<h2>가게</h2>';
  if (O.store) h += '<div class="pick on"><div class="pm"><b>' + esc(O.store) + '</b><small>' + esc(acc ? acc.acct + ' · ' + [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : (O.acct || '계정 없음')) + '</small>' + (acc && acc.note ? '<small>📝 ' + esc(acc.note) + '</small>' : '') + '<small id="eStoreBal"></small></div>' + (O.acct ? '<button class="b-ghost b-sm" id="eStoreI">📋 미수금 · 기록</button>' : '') + '<button class="b-ghost b-sm" id="eStoreX">바꾸기</button></div>';
  else h += '<input id="eStoreQ" placeholder="가게 이름 · 계정코드 · 도시" autocomplete="off"><div class="hits" id="eStoreHits" style="display:none"></div>';
  if (isStaff()) h += '<div class="fg" style="margin-top:8px"><label>세일즈맨</label>' + sel('eSm', [['', '— 선택 —']].concat(S.sms.map(s => [s.code, s.code])), O.sm) + '</div>';
  h += '</div>';
  h += '<div class="seg"><button class="' + (O.view === 'add' ? 'on' : '') + '" data-ev="add">🔍 아이템 담기</button><button class="' + (O.view === 'cart' ? 'on' : '') + '" data-ev="cart">🧾 오더 <span id="eCnt">' + t.n + '</span>줄</button></div>';
  h += '<div id="eBody"></div>';
  const isSentEdit = O.st && O.st !== 'draft';
  h += '<div class="sticky">' + (O.view === 'add' ? '<div id="eQuick"></div>' : '') + '<div class="sumbox" style="margin:0 0 8px;display:flex;justify-content:space-between"><span><b id="eN">' + t.n + '</b>줄 · 수량 <b id="eQ">' + t.qty + '</b></span><b id="eA">' + money(t.amt) + '</b></div><div class="btns" style="margin-top:0">' +
    (!isSentEdit ? '<button class="b-ghost" id="eDraft">💾 임시저장</button><button class="b-green" id="eSend">📤 보내기</button>' : '<button class="b-ghost" id="eQuit">닫기</button><button class="b-green" id="eSave">💾 저장</button>') + '</div></div>';
  $('page').innerHTML = h;
  if ($('eStoreX')) $('eStoreX').onclick = () => { O.store = ''; O.acct = ''; INFO = null; saveWip(); paintEditor(); };
  if ($('eStoreI')) $('eStoreI').onclick = () => Store.storeSheet(O.acct);
  if (O.acct) loadInfo(O.acct);
  if ($('eStoreQ')) {
    const q = $('eStoreQ'), box = $('eStoreHits');
    q.oninput = () => {
      if (!q.value.trim()) { box.style.display = 'none'; return; }
      const mine = isStaff() ? S.accounts : S.accounts;
      const hits = searchAccounts(mine, q.value, 12);
      box.innerHTML = hits.map(a => '<div data-ac="' + esc(a.acct) + '" style="display:flex;align-items:center;gap:8px"><div style="flex:1;min-width:0"><b>' + esc(accountLabel(a)) + '</b><small>' + esc(a.acct + ' · ' + [a.addr, a.city].filter(Boolean).join(', ') + (a.sm ? ' · ' + a.sm : '')) + '</small></div><button class="b-ghost b-sm" data-ai="' + esc(a.acct) + '">📋</button></div>').join('') || '<div class="muted">찾는 가게가 없습니다</div>';
      box.style.display = 'block';
      box.querySelectorAll('[data-ac]').forEach(el => el.onclick = () => pickStore(el.dataset.ac));
      box.querySelectorAll('[data-ai]').forEach(el => el.onclick = e => { e.stopPropagation(); Store.storeSheet(el.dataset.ai, pickStore); });
    };
  }
  function pickStore(code) {
        const a = S.accounts.byCode[code]; if (!a) return; O.acct = a.acct; O.store = a.store;
        if (isStaff() && !O.sm && a.sm) O.sm = String(a.sm).toUpperCase();
        O.disc = acctDisc(a);   // 가게 기본 할인으로 시작
        saveWip(); paintEditor();
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
  else if (it) {
    const l = { c: it.c, d: it.d, q, p: it.p, lp: it.p, t: typeOfItem(S, it) };
    if (it.k) l.kit = it.k.map(x => ({ c: x[0], q: x[1] }));   // 세트: 구성품을 같이 저장 (픽킹 · 재고용)
    O.lines.push(l); IDX[code] = l;
  }
  saveWip(); refreshTotals();
  return IDX[code] ? IDX[code].q : 0;
}
/** 세트를 풀어서 구성품을 하나씩 담기 */
function addKitItems(setIt, times) {
  (setIt.k || []).forEach(x => { const c = catalog().byCode[x[0]]; if (c) setQty(c.c, (IDX[c.c] ? IDX[c.c].q : 0) + x[1] * (times || 1)); });
}

/* 가게 자료 (미수금 · 최근 구매) — 담기 화면의 "최근" 표시와 잔액 한 줄에 씀 */
let INFO = null;
async function loadInfo(acct) {
  try { const i = await Store.storeInfo(acct); if (!O || O.acct !== acct) return; INFO = i; } catch (e) { return; }
  const el = $('eStoreBal'); if (el) el.innerHTML = (INFO.asOf ? '미수금 <b class="' + (INFO.bal > 0.005 ? 'warn' : 'ok') + '">' + money(INFO.bal) + '</b>' + (INFO.bk[3] + INFO.bk[4] > 0.005 ? ' · 60일+ <b class="warn">' + money(INFO.bk[3] + INFO.bk[4]) + '</b>' : '') : '') + (INFO.orders.length ? ' · 최근 오더 ' + esc(md(INFO.orders[0].d)) + ' ' + money(INFO.orders[0].amt) : '');
  if (O.view === 'add' && VM === 'list') paintResults();
}
/* 빠른 수량 — 마지막에 만진 아이템에 1 · 2 · 3 · 6 · 12 · 24 · 36 · 0 */
let FOCUS = '';
const QUICK = [1, 2, 3, 6, 12, 24, 36, 0];
function quickBar() { return '<div class="qbar" id="qbar"><span id="qbarWho">' + (FOCUS ? esc(FOCUS) : '아이템을 고르고 수량을 누르세요') + '</span>' + QUICK.map(n => '<button data-qk="' + n + '">' + n + '</button>').join('') + '</div>'; }
function setFocus(c) { FOCUS = c; const w = $('qbarWho'); if (w) w.textContent = c + (IDX[c] ? ' · ' + IDX[c].q + '개' : ''); }
function bindQuick(root) {
  root.querySelectorAll('[data-qk]').forEach(b => b.onclick = () => {
    if (!FOCUS) return toast('먼저 아이템을 누르세요', 'bad');
    const n = setQty(FOCUS, Number(b.dataset.qk)); setFocus(FOCUS);
    const inp = document.querySelector('[data-qi="' + CSS.escape(FOCUS) + '"]'); if (inp) { inp.value = n || ''; markRow($('eRes') || $('eCart'), FOCUS, n); }
    refreshCard(FOCUS);
  });
}

/* ---- 담기: 사진 카드(누르면 1개) · 목록 · 검색 · 스캔 · 카테고리 ---- */
const VM_KEY = 'theone.order.view';
let VM = (() => { try { return localStorage.getItem(VM_KEY) || 'grid'; } catch (e) { return 'grid'; } })();
let PAGE = 60, LAST = [];
function paintAdd() {
  const T = catalog().tree;
  let node = T; O.path.forEach(p => { node = (node && node.map[p]) || null; });
  if (!node) { O.path = []; node = T; }
  const crumbs = '<div class="chips" style="margin-top:8px"><button class="' + (O.path.length ? '' : 'on') + '" data-cp="0">전체</button>' + O.path.map((p, i) => '<button class="' + (i === O.path.length - 1 ? 'on' : '') + '" data-cp="' + (i + 1) + '">' + esc(p) + '</button>').join('') + '</div>';
  const kids = node.kids.length ? '<div class="cats">' + node.kids.map(k => '<button data-ck="' + esc(k.name) + '"><b>' + esc(k.name) + '</b><span>' + k.n + '</span></button>').join('') + '</div>' : '';
  $('eBody').innerHTML = '<div class="card"><div style="display:flex;gap:6px"><input id="eQ1" placeholder="코드 · 이름 · 바코드 (스캐너는 여기에)" autocomplete="off" autocapitalize="characters" enterkeyhint="done" value="' + esc(O.q) + '" style="flex:1">' +
    '<button class="b-ghost b-sm" id="eVM" title="보기 바꾸기" style="font-size:18px">' + (VM === 'grid' ? '☰' : '▦') + '</button><button class="b-ghost b-sm" id="eShow" title="손님 보기" style="font-size:18px">🖼</button></div>' +
    crumbs + kids + '<div id="eRes"></div></div>';
  const sb = $('eQuick'); if (sb) { sb.innerHTML = quickBar(); bindQuick(sb); }
  const q = $('eQ1');
  const run = () => { O.q = q.value; PAGE = 60; paintResults(); };
  q.oninput = debounce(run, 160);
  q.onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const it = exactItem(q.value);
    if (it) { const n = setQty(it.c, (IDX[it.c] ? IDX[it.c].q : 0) + 1); toast(it.c + ' → ' + n + '개', 'good'); q.value = ''; O.q = ''; paintResults(); }
    else { run(); toast('정확히 맞는 코드가 없습니다 — 아래에서 고르세요', 'bad'); }
  };
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { O.path = O.path.slice(0, Number(b.dataset.cp)); PAGE = 60; paintAdd(); });
  document.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { O.path = O.path.concat([b.dataset.ck]); PAGE = 60; paintAdd(); });
  $('eVM').onclick = () => { VM = VM === 'grid' ? 'list' : 'grid'; try { localStorage.setItem(VM_KEY, VM); } catch (e) {} paintAdd(); };
  $('eShow').onclick = () => showMode(LAST, 0);
  paintResults();
  if (!('ontouchstart' in window)) q.focus();
}
function itemRow(it) {
  const cur = IDX[it.c] ? IDX[it.c].q : 0;
  const t = typeOfItem(S, it), dc = Number((O.disc || {})[t]) || 0, hist = Store.histText(INFO, it.c), lp = Store.lastPrice(INFO, it.c);
  return '<div class="pr irow' + (cur ? ' v' : '') + (FOCUS === it.c ? ' foc' : '') + '" data-row="' + esc(it.c) + '" data-frow="' + esc(it.c) + '">' +
    (it.ph ? '<img src="' + esc(thumb(it.ph)) + '" loading="lazy" alt="" class="ith" data-big="' + esc(it.c) + '">' : '<div class="ith" data-big="' + esc(it.c) + '"></div>') +
    '<div class="ct"><b>' + esc(it.c) + (it.k ? ' <span class="tag t-a" data-kit="' + esc(it.c) + '">🧩 ' + it.k.length + '종</span>' : '') + '</b><small>' + esc(it.d) + '</small>' +
    '<small><b>' + money(it.p) + '</b>' + (dc ? ' → 할인가 ' + money(it.p * (1 - dc / 100)) : '') + (lp != null && Math.abs(lp - it.p) > 0.001 ? ' · 지난번 ' + money(lp) : '') + (it.s ? ' · SRP ' + money(it.s) : '') + '</small>' +
    (hist ? '<small class="hist">🕘 ' + esc(hist) + '</small>' : '') + '</div>' +
    qtyBox(it.c, cur) + '</div>';
}
/** 사진 카드 — 누르면 1개 담김, 숫자를 누르면 수량 입력, − 로 빼기 */
function itemCard(it) {
  const cur = IDX[it.c] ? IDX[it.c].q : 0;
  return '<div class="gcard' + (cur ? ' on' : '') + '" data-gc="' + esc(it.c) + '">' +
    '<div class="gimg">' + (it.ph ? '<img src="' + esc(thumb(it.ph, 300)) + '" loading="lazy" alt="">' : '<span>' + esc(it.c.substring(0, 6)) + '</span>') + '</div>' +
    (it.k ? '<span class="gkit" data-kit="' + esc(it.c) + '">🧩 ' + it.k.length + '종</span>' : '') +
    '<span class="gq" data-gq="' + esc(it.c) + '">' + (cur || '') + '</span>' + (cur ? '<button class="gm" data-gm="' + esc(it.c) + '">−</button>' : '') +
    '<div class="gt"><b>' + esc(it.c) + '</b><small>' + esc(it.d) + '</small><span>' + money(it.p) + '</span></div></div>';
}
const qtyBox = (c, v) => '<div class="qty"><button data-dq="' + esc(c) + '" data-d="-1">−</button><input type="number" inputmode="numeric" min="0" data-qi="' + esc(c) + '" value="' + (v || '') + '" placeholder="0"><button data-dq="' + esc(c) + '" data-d="1">＋</button></div>';
function paintResults() {
  if (!O || !$('eRes')) return;
  const all = searchItems(O.q, O.path, 5000);
  LAST = all;
  const res = all.slice(0, PAGE);
  const head = '<div class="muted" style="margin:6px 0">' + (O.q || O.path.length ? all.length.toLocaleString() + '개' : '전체 ' + catalog().items.length.toLocaleString() + '개 — 카테고리를 고르거나 검색하세요') + '</div>';
  $('eRes').innerHTML = head + (res.length ? (VM === 'grid' ? '<div class="grid">' + res.map(itemCard).join('') + '</div>' : res.map(itemRow).join('')) +
    (all.length > res.length ? '<button class="b-ghost" id="eMore" style="margin-top:8px">더 보기 (' + (all.length - res.length).toLocaleString() + '개 남음)</button>' : '') : '<div class="none">찾는 아이템이 없습니다</div>');
  const root = $('eRes');
  bindQty(root);
  if ($('eMore')) $('eMore').onclick = () => { PAGE += 60; paintResults(); };
  root.querySelectorAll('[data-big]').forEach(el => el.onclick = () => { const i = LAST.findIndex(x => x.c === el.dataset.big); showMode(LAST, Math.max(0, i)); });
  root.querySelectorAll('[data-frow] .ct').forEach(el => el.onclick = () => { const r = el.closest('[data-frow]'); root.querySelectorAll('.foc').forEach(x => x.classList.remove('foc')); r.classList.add('foc'); setFocus(r.dataset.frow); });
  root.querySelectorAll('[data-kit]').forEach(el => el.onclick = e => { e.stopPropagation(); kitSheet(catalog().byCode[el.dataset.kit]); });
  root.querySelectorAll('[data-gm]').forEach(b => b.onclick = e => { e.stopPropagation(); const c = b.dataset.gm; setQty(c, (IDX[c] ? IDX[c].q : 0) - 1); refreshCard(c); });
  root.querySelectorAll('[data-gq]').forEach(b => b.onclick = e => { if (!b.textContent) return; e.stopPropagation(); qtyPad(b.dataset.gq); });
  root.querySelectorAll('[data-gc]').forEach(el => {
    let t = null, long = false;
    el.addEventListener('pointerdown', () => { long = false; t = setTimeout(() => { long = true; qtyPad(el.dataset.gc); }, 550); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
    el.onclick = () => { if (long) return; const c = el.dataset.gc; setQty(c, (IDX[c] ? IDX[c].q : 0) + 1); refreshCard(c); setFocus(c); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
    el.oncontextmenu = e => e.preventDefault();
  });
}
function refreshCard(c) {
  const el = document.querySelector('[data-gc="' + CSS.escape(c) + '"]'); if (!el) return;
  const n = IDX[c] ? IDX[c].q : 0;
  el.classList.toggle('on', !!n);
  el.querySelector('[data-gq]').textContent = n || '';
  let m = el.querySelector('[data-gm]');
  if (n && !m) { m = document.createElement('button'); m.className = 'gm'; m.dataset.gm = c; m.textContent = '−'; m.onclick = e => { e.stopPropagation(); setQty(c, (IDX[c] ? IDX[c].q : 0) - 1); refreshCard(c); }; el.appendChild(m); }
  if (!n && m) m.remove();
}
/** 수량 직접 입력 */
function qtyPad(c) {
  const it = catalog().byCode[c]; if (!it) return;
  const cur = IDX[c] ? IDX[c].q : 0;
  openModal('<h2>' + esc(it.c) + '</h2><div class="muted">' + esc(it.d) + ' · ' + money(it.p) + '</div>' +
    '<div class="qty" style="justify-content:center;margin:14px 0"><button id="qpM" style="width:56px;height:56px">−</button><input id="qpV" type="number" inputmode="numeric" min="0" value="' + cur + '" style="width:110px;font-size:26px"><button id="qpP" style="width:56px;height:56px">＋</button></div>' +
    '<div class="chips" style="justify-content:center">' + [6, 12, 24, 36, 48, 72, 144].map(n => '<button data-qp="' + n + '">' + n + '</button>').join('') + '</div>' +
    '<div class="btns"><button class="b-ghost" id="qpX">닫기</button><button class="b-blue" id="qpOk">확인</button></div>');
  const v = $('qpV'); setTimeout(() => { v.focus(); v.select(); }, 50);
  $('qpM').onclick = () => { v.value = Math.max(0, (Number(v.value) || 0) - 1); };
  $('qpP').onclick = () => { v.value = (Number(v.value) || 0) + 1; };
  document.querySelectorAll('[data-qp]').forEach(b => b.onclick = () => { v.value = b.dataset.qp; });
  const ok = () => { setQty(c, v.value); closeModal(); if (O.view === 'add') refreshCard(c); else paintCart(); };
  $('qpOk').onclick = ok; v.onkeydown = e => { if (e.key === 'Enter') ok(); };
  $('qpX').onclick = closeModal;
}
/** 세트 구성 보기 — 세트로 담기 / 풀어서 담기 */
function kitSheet(it) {
  if (!it || !it.k) return;
  const C = catalog();
  const pcs = it.k.reduce((a, x) => a + x[1], 0);
  openModal('<h2>🧩 ' + esc(it.c) + '</h2><div class="muted">' + esc(it.d) + ' · ' + money(it.p) + ' · ' + it.k.length + '종 ' + pcs + '개' + (it.old ? ' · 기존 ' + esc(it.old) : '') + '</div>' +
    '<div class="kitg">' + it.k.map(x => { const c = C.byCode[x[0]]; return '<div><div class="gimg">' + (c && c.ph ? '<img src="' + esc(thumb(c.ph, 200)) + '" loading="lazy">' : '<span>' + esc(x[0]) + '</span>') + '</div><b>' + esc(x[0]) + ' × ' + x[1] + '</b><small>' + esc(c ? c.d : '목록에 없음') + '</small></div>'; }).join('') + '</div>' +
    '<div class="btns"><button class="b-ghost" id="kAll">풀어서 하나씩 담기</button><button class="b-blue" id="kSet">세트로 1개 담기</button></div>');
  $('kSet').onclick = () => { setQty(it.c, (IDX[it.c] ? IDX[it.c].q : 0) + 1); closeModal(); if (O.view === 'add') paintResults(); toast(it.c + ' 세트 담음', 'good'); };
  $('kAll').onclick = () => { addKitItems(it, 1); closeModal(); if (O.view === 'add') paintResults(); toast(it.k.length + '종 담음 — 오더에서 수량을 고칠 수 있습니다', 'good'); };
}
/** 🖼 손님 보기 — 사진 크게, 넘기며 보기 (가격 가리기 가능) */
let SHOW_PRICE = true;
function showMode(list, i) {
  list = (list || []).filter(x => x.ph || x.k); if (!list.length) return toast('사진이 있는 아이템이 없습니다', 'bad');
  i = Math.min(Math.max(0, i || 0), list.length - 1);
  let v = document.getElementById('viewer'); if (!v) { v = document.createElement('div'); v.id = 'viewer'; document.body.appendChild(v); }
  const C = catalog();
  const draw = () => {
    const it = list[i], cur = IDX[it.c] ? IDX[it.c].q : 0;
    const ph = it.ph || ((it.k || []).map(x => C.byCode[x[0]]).find(x => x && x.ph) || {}).ph || '';
    v.innerHTML = '<div class="vtop"><span>' + (i + 1) + ' / ' + list.length + '</span><button id="vP">' + (SHOW_PRICE ? '가격 숨기기' : '가격 보이기') + '</button><button id="vX">✕</button></div>' +
      '<div class="vimg"><button class="vnav" id="vL">‹</button>' + (ph ? '<img src="' + esc(thumb(ph, 1000)) + '">' : '') + '<button class="vnav" id="vR">›</button></div>' +
      '<div class="vinfo"><b>' + esc(it.c) + '</b><div>' + esc(it.d) + '</div>' + (SHOW_PRICE ? '<div class="vprice">' + money(it.p) + (it.s ? ' <small>SRP ' + money(it.s) + '</small>' : '') + '</div>' : (it.s ? '<div class="vprice">SRP ' + money(it.s) + '</div>' : '')) +
      (it.k ? '<div class="vkit">🧩 ' + it.k.length + '종 ' + it.k.reduce((a, x) => a + x[1], 0) + '개</div>' : '') +
      '<div class="btns"><button class="b-ghost" id="vM">−</button><button class="b-blue" id="vA">담기 ＋1' + (cur ? ' (지금 ' + cur + ')' : '') + '</button></div></div>';
    $('vX').onclick = () => { v.remove(); if (O && O.view === 'add') paintResults(); };
    $('vP').onclick = () => { SHOW_PRICE = !SHOW_PRICE; draw(); };
    $('vL').onclick = () => { i = (i - 1 + list.length) % list.length; draw(); };
    $('vR').onclick = () => { i = (i + 1) % list.length; draw(); };
    $('vA').onclick = () => { setQty(it.c, cur + 1); draw(); };
    $('vM').onclick = () => { setQty(it.c, cur - 1); draw(); };
  };
  let sx = 0; v.ontouchstart = e => { sx = e.touches[0].clientX; }; v.ontouchend = e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) { i = (i + (dx < 0 ? 1 : -1) + list.length) % list.length; draw(); } };
  draw();
}
function bindQty(root) {
  root.querySelectorAll('[data-dq]').forEach(b => b.onclick = () => {
    const c = b.dataset.dq, inp = root.querySelector('[data-qi="' + CSS.escape(c) + '"]');
    const n = setQty(c, (IDX[c] ? IDX[c].q : 0) + Number(b.dataset.d));
    if (inp) inp.value = n || ''; markRow(root, c, n);
  });
  root.querySelectorAll('[data-qi]').forEach(inp => {
    inp.onchange = () => { const n = setQty(inp.dataset.qi, inp.value); inp.value = n || ''; markRow(root, inp.dataset.qi, n); };
    inp.onfocus = () => { inp.select(); setFocus(inp.dataset.qi); root.querySelectorAll('.foc').forEach(x => x.classList.remove('foc')); const r = inp.closest('[data-row]'); if (r) r.classList.add('foc'); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); const q = $('eQ1'); if (q) q.focus(); } };
  });
}
function markRow(root, c, n) {
  const row = root.querySelector('[data-row="' + CSS.escape(c) + '"]'); if (!row) return;
  if (O.view === 'cart' && !n) { row.remove(); return; }
  row.classList.toggle('v', !!n);
  if (O.view === 'cart') { const l = IDX[c]; const a = row.querySelector('.lamt'); if (a && l) a.textContent = money(l.q * l.p); }
}

/* ---- 담은 것: 수량 · 가격 · 할인 ---- */
function paintCart() {
  const types = invTypes(S), used = {}; O.lines.forEach(l => { used[l.t || DT()] = 1; });
  const ad = accDiscOf();
  const discRows = types.filter(t => used[t.c] || O.disc[t.c] || ad[t.c]).map(t => {
    const v = O.disc[t.c] || '', base = ad[t.c] || 0, chg = Number(v || 0) !== Number(base);
    return '<div class="fg" style="margin:0"><label>' + esc(t.c) + ' ' + esc(t.n) + ' 할인 %' + (base ? ' <span class="muted">(가게 기본 ' + base + '%)</span>' : '') + (chg ? ' <span class="tag t-a">변경</span>' : '') + '</label><input type="number" inputmode="decimal" min="0" max="100" data-disc="' + esc(t.c) + '" value="' + esc(v) + '" placeholder="0"></div>';
  }).join('');
  $('eBody').innerHTML = '<div class="card">' + (discRows ? '<h2>할인</h2><div class="two">' + discRows + '</div><div class="muted" style="margin:6px 0 10px">가게 기본 할인이 먼저 들어갑니다. 바꾸면 매니저가 확인할 때 표시됩니다.</div>' : '') +
    '<div id="eTypes"></div>' + (O.lines.length > 15 ? '<input id="eF" placeholder="오더 안에서 찾기" autocomplete="off" style="margin:8px 0 6px">' : '') + '<div id="eCart"></div>' +
    '<div class="fg" style="margin-top:10px"><label>메모 (배송 · 특이사항 · 할인 요청)</label><textarea id="eMemo" rows="2">' + esc(O.memo || '') + '</textarea></div></div>';
  const paintTypes = () => { if (O && $('eTypes')) $('eTypes').innerHTML = typeSummary(totals().by); };
  const paint = () => {
    const f = $('eF') ? $('eF').value.trim().toUpperCase() : '';
    const rows = O.lines.slice().reverse().filter(l => !f || (l.c + ' ' + l.d).toUpperCase().includes(f));
    $('eCart').innerHTML = rows.length ? rows.map(l => {
      const chg = l.lp != null && Math.abs(l.lp - l.p) > 0.0001;
      return '<div class="pr irow v" data-row="' + esc(l.c) + '"><div class="ct"><b>' + esc(l.c) + ' <span class="tag t-g">' + esc(l.t || DT()) + '</span>' + (l.kit ? ' <span class="tag t-a" data-kitl="' + esc(l.c) + '">🧩 ' + l.kit.length + '종</span>' : '') + '</b><small>' + esc(l.d) + '</small>' +
        '<small>$ <input class="sm pin' + (chg ? ' chg' : '') + '" type="number" step="0.01" inputmode="decimal" data-pi="' + esc(l.c) + '" value="' + l.p + '">' + (chg ? ' <span class="tag t-c">목록 ' + money(l.lp) + '</span>' : '') + ' · <b class="lamt">' + money(l.q * l.p) + '</b></small></div>' +
        qtyBox(l.c, l.q) + '</div>';
    }).join('') : '<div class="none">아직 담은 아이템이 없습니다 — 🔍 아이템 담기</div>';
    bindQty($('eCart'));
    $('eCart').querySelectorAll('[data-kitl]').forEach(el => el.onclick = () => { const it = catalog().byCode[el.dataset.kitl]; if (it && it.k) kitSheet(it); else { const l = IDX[el.dataset.kitl]; openModal('<h2>🧩 ' + esc(l.c) + '</h2>' + l.kit.map(x => '<div>' + esc(x.c) + ' × ' + x.q + '</div>').join('') + '<div class="btns"><button class="b-ghost" onclick="document.getElementById(\'modal\').classList.remove(\'on\')">닫기</button></div>'); } });
    $('eCart').querySelectorAll('[data-pi]').forEach(inp => inp.onchange = () => { const l = IDX[inp.dataset.pi]; if (!l) return; l.p = R2(inp.value); inp.value = l.p; saveWip(); refreshTotals(); setTimeout(() => { if (O && $('eCart')) { paintTypes(); paint(); } }, 0); });
    $('eCart').querySelectorAll('[data-qi],[data-dq]').forEach(el => el.addEventListener(el.dataset.qi ? 'change' : 'click', () => setTimeout(paintTypes, 0)));
  };
  paint(); paintTypes();
  if ($('eF')) $('eF').oninput = debounce(paint, 150);
  document.querySelectorAll('[data-disc]').forEach(inp => inp.onchange = () => { const v = Math.max(0, Math.min(100, Number(inp.value) || 0)); if (v) O.disc[inp.dataset.disc] = v; else delete O.disc[inp.dataset.disc]; saveWip(); refreshTotals(); setTimeout(() => { if (O && O.view === 'cart' && $('eCart')) paintCart(); }, 0); });
  $('eMemo').oninput = () => { O.memo = $('eMemo').value; saveWip(); };
}

/** 오더 문서 만들기 (목록용 요약 포함) */
export function orderDoc(base, lines, disc, extra) {
  const by = splitByType(lines, disc, 'q'), pd = priceDiff(lines, 'q');
  let qty = 0, amt = 0; Object.values(by).forEach(g => { qty += g.qty; amt += g.total; });
  const ad = acctDisc(S.accounts.byCode ? S.accounts.byCode[base.acct] : null);
  const keys = {}; Object.keys(ad).concat(Object.keys(disc || {})).forEach(k => { keys[k] = 1; });
  const discChg = Object.keys(keys).some(k => Number((disc || {})[k] || 0) !== Number(ad[k] || 0));
  return Object.assign({}, base, { n: lines.length, qty, amt: R2(amt), list: pd.list, pdiff: pd.diff, pdn: pd.n, disc: disc || {}, discChg }, extra || {});
}
function putOut(o, lines) {
  const box = readOut(); box[o.id] = { o, lines, at: Date.now() };
  if (!writeOut(box)) throw new Error('폰 저장 공간이 부족합니다');
}

async function saveOrder(st) {
  if (!O.store) return toast('가게를 고르세요', 'bad');
  if (!O.sm) return toast('세일즈맨을 고르세요', 'bad');
  if (!O.lines.length) return toast('아이템을 담으세요', 'bad');
  const t = totals();
  if (st === 'sent' && O.st === 'draft' && !(await confirmBox(O.store + ' — ' + O.lines.length + '줄 · ' + money(t.amt) + ' 오더를 보낼까요?', '보내기'))) return;
  const now = new Date().toISOString();
  if (!O.id) { O.no = newNo(); O.id = O.no; }
  const base = { id: O.id, no: O.no, d: O.d || today(), ym: ym(O.d || today()), sm: O.sm, acct: O.acct || '', store: O.store, st, memo: O.memo || '', updatedAt: now,
    createdBy: O.createdBy || S.user.email, createdAt: O.createdAt || now, catVer: catalog().ver || '' };
  if (st === 'sent') base.sentAt = O.sentAt || now;
  const lines = O.lines.map(l => { const x = { c: l.c, d: l.d, q: l.q, p: l.p, lp: l.lp != null ? l.lp : l.p, t: l.t || DT() }; if (l.pq != null) x.pq = l.pq; if (l.note) x.note = l.note; if (l.kit) x.kit = l.kit; return x; });
  /* 매니저가 이미 처리 중인 오더 — 상태 · 픽킹 기록은 그대로 두고 바로 저장 */
  if (isStaff() && O.st !== 'draft' && O.st !== 'sent') {
    busy(true);
    try {
      const old = await S.DB.get('orders', O.id); if (old && !canEdit(old)) throw new Error('이미 인보이스가 확정된 오더입니다');
      const doc = orderDoc(Object.assign({}, old || {}, base, { st: old ? old.st : st }), lines, O.disc);
      await S.DB.batch([{ op: 'set', col: 'orders', id: O.id, data: doc }, { op: 'set', col: 'orderLines', id: O.id, data: { sm: O.sm, lines } }]);
      const id = O.id; O = null; clearWip(); toast('저장했습니다', 'good'); goOrder(id);
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false); return;
  }
  /* 세일즈맨 · 새 오더 — 폰의 보낼 함에 먼저 넣고(사라지지 않게) 전송 */
  try { putOut(orderDoc(base, lines, O.disc), lines); } catch (e) { return toast(e.message, 'bad'); }
  const id = O.id; O = null; clearWip();
  busy(true); const r = await syncOutbox(true); busy(false);
  const left = !!readOut()[id];
  toast(left ? '📱 폰에 저장했습니다 — 인터넷이 되면 자동으로 보냅니다' : (st === 'sent' ? '보냈습니다 📤' : '저장했습니다'), left ? '' : 'good');
  goOrder(id);
}
