/* ============================================================
 *  🖼 디스플레이 출고 — 새 디스플레이가 나가야 하는 주문을 따로 챙기는 목록
 *    ① 인보이스 · 사무실 담당: 주문을 확인하면서 (또는 따로) 가게 · 디스플레이 종류와 개수 · 나갈 날짜 · 메모를 적음
 *    ② 창고: 목록에서 나갈 날짜 순으로 보고 ✓ 준비 표시 → 🚚 UPS 라벨 (앱의 UPS 창 그대로) → 출고됨
 *  displays/{id} = { id, acct, store, sm, kinds:{ FLOOR:1, WALL:2, C4:… }, other, otherN, qty, due, note, orderId, orderNo,
 *                    st: 'open' | 'ready' | 'shipped' | 'x', readyAt, readyBy, shippedAt, shippedBy, track, shipVia, boxes,
 *                    createdBy, createdByName, createdAt, updatedAt }
 *  UPS 라벨은 ship.js 의 출고 창을 { col: 'displays' } 로 열어 이 문서에 트래킹이 붙음 (주문 문서는 건드리지 않음)
 * ============================================================ */
import { $, esc, toast, busy, openModal, closeModal, confirmBox, Router, today, md, daysBetween, bi, bt, sortBy } from './ui.js';
import { can } from './main.js';
import { newId } from './db.js';
import { searchAccounts } from './accounts.js';
import { REQ_KINDS, reqClean } from './reqs.js';
import * as Msg from './msg.js';

let S = null;
const V = { tab: 'todo' };
export function register(state) { S = state; Router.on('displays', page); }
/** 적기 · 고치기: 인보이스 · 주문 넣는 담당 · 관리자 / 준비 ✓ · UPS: 출고 담당(ship) 도 */
export const canWrite = () => can('invoice') || can('newOrder');
export const canShip = () => can('ship') || canWrite();
const me = () => String((S.user && S.user.email) || '').toLowerCase();
const myName = () => (S.me && S.me.name) || (S.user && S.user.name) || me();

/** "플로어 디스플레이 ×1 · 월 디스플레이 ×2 · 기타 이름 ×1" (en: 영어만) */
export function dispText(d, en) {
  const k = d.kinds || {}, out = REQ_KINDS.filter(x => k[x[0]]).map(x => (en ? x[2] : bt(x[1], x[2])) + ' ×' + k[x[0]]);
  if (d.other && d.otherN) out.push(d.other + ' ×' + d.otherN);
  return out.join(' · ');
}
const qtyOf = d => Object.values(d.kinds || {}).reduce((a, b) => a + (Number(b) || 0), 0) + (d.other ? Number(d.otherN) || 0 : 0);
const dueTag = d => {
  if (!d.due) return '<span class="tag t-g">' + bt('날짜 미정', 'No date') + '</span>';
  if (d.st === 'shipped') return '<span class="tag t-g">📅 ' + esc(md(d.due)) + '</span>';
  const n = daysBetween(today(), d.due);
  return n < 0 ? '<span class="tag t-r">⚠️ ' + esc(md(d.due)) + ' · ' + (-n) + bt('일 지남', 'd late') + '</span>' : n === 0 ? '<span class="tag t-a">📅 ' + bt('오늘', 'Today') + '</span>' : '<span class="tag ' + (n <= 3 ? 't-a' : 't-k') + '">📅 ' + esc(md(d.due)) + ' · D-' + n + '</span>';
};
const ST = { open: ['📋', '예정', 'Planned'], ready: ['✅', '준비됨', 'Ready'], shipped: ['🚚', '출고됨', 'Shipped'], x: ['✕', '취소', 'Cancelled'] };

async function page(arg) {
  if (!canShip() && S.role !== 'admin') { $('page').innerHTML = '<div class="card"><div class="none">' + bt('사무실 · 창고 담당만 쓰는 화면입니다', 'For office and warehouse staff') + '</div></div>'; return; }
  if (arg === 'new') { await list(); return form({}); }
  return list();
}

/* ---------- 목록 ---------- */
async function list() {
  const box = $('page'); box.innerHTML = '<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>';
  let L = []; try { L = await S.DB.list('displays'); } catch (e) { box.innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  const todo = sortBy(L.filter(d => d.st === 'open' || d.st === 'ready'), d => (d.due || '9999') + (d.createdAt || '')), shipped = sortBy(L.filter(d => d.st === 'shipped'), d => d.shippedAt || '', true);
  const late = todo.filter(d => d.due && d.due < today()).length, week = todo.filter(d => d.due && daysBetween(today(), d.due) <= 7).length, ready = todo.filter(d => d.st === 'ready').length;
  const rows = V.tab === 'shipped' ? shipped.slice(0, 200) : V.tab === 'all' ? sortBy(L, d => d.createdAt || '', true) : todo;
  const tab = (k, ko, en, n) => '<button class="' + (V.tab === k ? 'on' : '') + '" data-dvt="' + k + '">' + bi(ko, en) + ' <b>' + n + '</b></button>';
  const row = d => {
    const [ic, ko, en] = ST[d.st] || ST.open, act = d.st === 'open' || d.st === 'ready';
    return '<div class="card dsp' + (d.st === 'ready' ? ' rdy' : '') + (d.st === 'x' ? ' dim' : '') + '" data-dv="' + esc(d.id) + '"><div style="display:flex;gap:10px;align-items:flex-start">' +
      (act && canShip() ? '<label class="ckw" title="' + esc(bt('준비 완료 표시', 'Mark ready')) + '"><input type="checkbox" class="ck-big" data-dvr="' + esc(d.id) + '"' + (d.st === 'ready' ? ' checked' : '') + '></label>' : '<span style="font-size:22px;line-height:1">' + ic + '</span>') +
      '<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b style="font-size:15.5px">' + esc(d.store || '') + (d.acct ? ' <span class="code">' + esc(d.acct) + '</span>' : '') + '</b>' + dueTag(d) + '</div>' +
      '<div style="font-size:14.5px;font-weight:700;margin:4px 0">🖼 ' + esc(dispText(d)) + ' <span class="muted" style="font-weight:600">· ' + bt('총', 'total') + ' ' + qtyOf(d) + '</span></div>' +
      (d.note ? '<div class="muted" style="font-size:13px">📝 ' + esc(d.note) + '</div>' : '') +
      '<div class="muted" style="font-size:12px;margin-top:3px">' + esc(ko) + ' · ' + (d.sm ? esc(d.sm) + ' · ' : '') + (d.orderNo ? '🔗 <a href="#/order/' + esc(d.orderId) + '">' + esc(d.orderNo) + '</a> · ' : '') + bt('적은 사람', 'by') + ' ' + esc(d.createdByName || d.createdBy || '') +
      (d.st === 'ready' && d.readyBy ? ' · ✅ ' + esc(d.readyByName || d.readyBy) + ' ' + esc(md(String(d.readyAt || '').substring(0, 10))) : '') +
      (d.st === 'shipped' ? ' · 🚚 ' + esc(md(String(d.shippedAt || '').substring(0, 10))) + (d.track ? ' · ' + esc(d.track) : '') : '') + '</div>' +
      '<div class="btns" style="justify-content:flex-start;margin-top:6px;flex-wrap:wrap">' +
      (act && canShip() ? '<button class="b-green b-sm" data-dvu="' + esc(d.id) + '">🚚 ' + bi('UPS 라벨 · 출고', 'UPS label · ship') + '</button>' : '') +
      (canWrite() && d.st !== 'shipped' ? '<button class="b-ghost b-sm" data-dve="' + esc(d.id) + '">✏️ ' + bi('고치기', 'Edit') + '</button>' : '') +
      (canWrite() && act ? '<button class="b-ghost b-sm" data-dvx="' + esc(d.id) + '" style="color:#991b1b">✕ ' + bi('취소', 'Cancel') + '</button>' : '') +
      (d.st === 'shipped' && canShip() ? '<button class="b-ghost b-sm" data-dvu="' + esc(d.id) + '">📦 ' + bi('라벨 · 트래킹', 'Labels · tracking') + '</button>' : '') +
      '</div></div></div></div>';
  };
  box.innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="margin:0">🖼 ' + bi('디스플레이 출고', 'Display shipments') + '</h2>' +
    (canWrite() ? '<button class="b-blue" id="dvNew">＋ ' + bi('새 디스플레이', 'New display') + '</button>' : '') + '</div>' +
    '<div class="muted" style="margin-top:4px">' + bt('새 디스플레이가 나가야 하는 가게 — 인보이스 · 사무실 담당이 적고, 창고가 나갈 날짜 순으로 ✓ 준비 → 🚚 UPS 라벨로 보냅니다.', 'Stores that need a new display — the office writes it down, the warehouse marks it ready and ships it with a UPS label, by date.') + '</div>' +
    '<div class="kpi" style="margin-top:10px"><div><b' + (late ? ' class="warn"' : '') + '>' + late + '</b><span>⚠️ ' + bt('날짜 지남', 'Late') + '</span></div><div><b>' + week + '</b><span>📅 ' + bt('7일 안', 'Within 7 days') + '</span></div><div><b>' + ready + '</b><span>✅ ' + bt('준비됨', 'Ready') + '</span></div><div><b>' + todo.length + '</b><span>📋 ' + bt('나갈 것', 'To ship') + '</span></div></div>' +
    '<div class="chips" style="margin-top:8px">' + tab('todo', '나갈 것', 'To ship', todo.length) + tab('shipped', '출고됨', 'Shipped', shipped.length) + tab('all', '전체', 'All', L.length) + '</div></div>' +
    (rows.length ? rows.map(row).join('') : '<div class="card"><div class="none">' + (V.tab === 'todo' ? bt('나갈 디스플레이가 없습니다', 'Nothing to ship') : bt('없음', 'None')) + '</div></div>');
  if ($('dvNew')) $('dvNew').onclick = () => form({});
  box.querySelectorAll('[data-dvt]').forEach(b => b.onclick = () => { V.tab = b.dataset.dvt; list(); });
  box.querySelectorAll('[data-dvr]').forEach(c => c.onchange = async () => {
    const id = c.dataset.dvr, on = c.checked, now = new Date().toISOString();
    try { await S.DB.update('displays', id, on ? { st: 'ready', readyAt: now, readyBy: me(), readyByName: myName(), updatedAt: now } : { st: 'open', readyAt: '', readyBy: '', readyByName: '', updatedAt: now }); toast(on ? '✅ ' + bt('준비됨', 'Ready') : bt('예정으로', 'Back to planned'), 'good'); }
    catch (e) { c.checked = !on; toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); return; }
    list();
  });
  box.querySelectorAll('[data-dve]').forEach(b => b.onclick = () => form(L.find(d => d.id === b.dataset.dve) || {}));
  box.querySelectorAll('[data-dvx]').forEach(b => b.onclick = async () => {
    const d = L.find(x => x.id === b.dataset.dvx); if (!d) return;
    if (!(await confirmBox(bt('이 디스플레이 출고를 취소할까요?', 'Cancel this display shipment?') + '\n' + d.store + ' · ' + dispText(d), bt('취소하기', 'Cancel it')))) return;
    try { await S.DB.update('displays', d.id, { st: 'x', cancelBy: me(), cancelAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); toast('✕ ' + bt('취소했습니다', 'Cancelled'), 'good'); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    list();
  });
  box.querySelectorAll('[data-dvu]').forEach(b => b.onclick = async () => {
    const d = L.find(x => x.id === b.dataset.dvu); if (!d) return;
    const Ship = await import('./ship.js');
    Ship.shipModal({ id: d.id, col: 'displays', no: 'DISPLAY', acct: d.acct || '', store: d.store, sm: d.sm || '', invs: [], st: d.st, boxes: Math.max(1, qtyOf(d)), shipTo: d.shipTo || null }, () => list());
  });
}

/* ---------- 적기 · 고치기 ---------- */
/** pre: 고칠 문서 또는 { acct, store, sm, kinds, orderId, orderNo } (주문에서 열 때) */
export function form(pre) {
  pre = pre || {};
  const F = { id: pre.id || '', acct: pre.acct || '', store: pre.store || '', sm: pre.sm || '', kinds: Object.assign({}, pre.kinds || {}), other: pre.other || '', otherN: pre.otherN || '', due: pre.due || '', note: pre.note || '', orderId: pre.orderId || '', orderNo: pre.orderNo || '' };
  const kindIn = k => '<div class="fg" style="margin:0"><label>' + esc(bt(k[1], k[2])) + '</label><input type="number" inputmode="numeric" min="0" data-dk="' + k[0] + '" value="' + esc(F.kinds[k[0]] || '') + '" placeholder="0" style="text-align:right;font-weight:800"></div>';
  openModal('<h2>🖼 ' + (F.id ? bi('디스플레이 출고 고치기', 'Edit display shipment') : bi('새 디스플레이 출고', 'New display shipment')) + '</h2>' +
    (F.orderNo ? '<div class="alert a-blu" style="margin:0 0 8px">🔗 ' + bt('주문', 'Order') + ' <b>' + esc(F.orderNo) + '</b></div>' : '') +
    '<div class="fg"><label>🏬 ' + bt('가게 (계정 코드 · 이름)', 'Store (account # · name)') + '</label><input id="dvStore" value="' + esc(F.store ? (F.acct ? F.acct + ' ' : '') + F.store : '') + '" autocomplete="off" placeholder="' + esc(bt('예: 1111 · ALI B/S', 'e.g. 1111 · ALI B/S')) + '"><div id="dvHits" class="hits" style="display:none"></div></div>' +
    '<div class="fg"><label>🖼 ' + bt('디스플레이 · 개수', 'Displays · how many') + '</label><div class="two">' + REQ_KINDS.map(kindIn).join('') + '</div>' +
    '<div class="two" style="margin-top:6px"><div class="fg" style="margin:0"><label>' + bt('기타 디스플레이 이름', 'Other display') + '</label><input id="dvOther" value="' + esc(F.other) + '" placeholder="' + esc(bt('예: 카운터 회전 랙', 'e.g. counter spinner')) + '"></div><div class="fg" style="margin:0"><label>' + bt('개수', 'Qty') + '</label><input type="number" inputmode="numeric" min="0" id="dvOtherN" value="' + esc(F.otherN) + '" placeholder="0" style="text-align:right;font-weight:800"></div></div></div>' +
    '<div class="fg"><label>📅 ' + bt('나갈 예정 날짜', 'Expected ship date') + '</label><input type="date" id="dvDue" value="' + esc(F.due) + '"></div>' +
    '<div class="fg"><label>📝 ' + bt('메모 (창고에 전할 말)', 'Note for the warehouse') + '</label><textarea id="dvNote" rows="2" placeholder="' + esc(bt('예: 2단 월 디스플레이 · 주문 물건과 같이 / 따로', 'e.g. 2-tier wall display · ship with / separate from the order')) + '">' + esc(F.note) + '</textarea></div>' +
    '<div class="btns"><button type="button" class="b-ghost" id="dvX">' + bt('닫기', 'Close') + '</button><button type="button" class="b-blue" id="dvSave">💾 ' + bt('저장', 'Save') + '</button></div>');
  $('dvX').onclick = closeModal;
  const hits = $('dvHits');
  $('dvStore').oninput = () => {
    F.acct = ''; F.store = $('dvStore').value.trim();
    const L = S.accounts && S.accounts.byCode ? searchAccounts(S.accounts, $('dvStore').value, 8) : [];
    hits.style.display = L.length ? '' : 'none';
    hits.innerHTML = L.map(a => '<div data-dva="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b> <span class="muted">' + esc(a.acct) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.city ? ' · ' + esc(a.city) : '') + '</span></div>').join('');
    hits.querySelectorAll('[data-dva]').forEach(el => el.onclick = () => { const a = S.accounts.byCode[el.dataset.dva]; F.acct = a.acct; F.store = a.store; F.sm = a.sm || F.sm; $('dvStore').value = a.acct + ' ' + a.store; hits.style.display = 'none'; });
  };
  $('dvSave').onclick = async () => {
    const kinds = reqClean(Object.fromEntries(Array.from(document.querySelectorAll('[data-dk]')).map(i => [i.dataset.dk, i.value]))) || {};
    const other = $('dvOther').value.trim(), otherN = Math.max(0, Math.floor(Number($('dvOtherN').value) || 0)), due = $('dvDue').value, note = $('dvNote').value.trim();
    if (!F.store) return toast(bt('가게를 고르세요', 'Pick the store'), 'bad');
    if (!Object.keys(kinds).length && !(other && otherN)) return toast(bt('디스플레이 개수를 넣으세요', 'Enter how many displays'), 'bad');
    if (!due) return toast(bt('나갈 예정 날짜를 넣으세요', 'Enter the expected ship date'), 'bad');
    const now = new Date().toISOString(), id = F.id || newId('DS');
    const doc = { id, acct: F.acct, store: F.store, sm: F.sm, kinds, other: otherN ? other : '', otherN: other ? otherN : 0, due, note, orderId: F.orderId, orderNo: F.orderNo, updatedAt: now };
    doc.qty = qtyOf(doc);
    busy(true);
    try {
      if (F.id) await S.DB.update('displays', id, doc);
      else {
        await S.DB.set('displays', id, Object.assign(doc, { st: 'open', createdBy: me(), createdByName: myName(), createdAt: now }));
        /* 창고에 🔔 — 앱 안 알림 (이메일 · 챗은 보내지 않음) */
        try { await Msg.sendMsg({ to: 'g:wh', toLabel: bt('창고', 'Warehouse'), text: '🖼 ' + bt('새 디스플레이 출고', 'New display shipment') + ': ' + doc.store + ' — ' + dispText(doc) + ' · 📅 ' + md(due) + (note ? '\n📝 ' + note : ''), ref: { id: 'displays', label: '🖼 ' + bt('디스플레이 출고', 'Display shipments') }, quiet: true }); } catch (e) {}
      }
      closeModal(); toast('💾 ' + bt('저장했습니다', 'Saved'), 'good');
      if (location.hash.indexOf('#/displays') === 0) list(); else if (pre.after) pre.after();
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 주문에서 — 그 주문의 디스플레이 출고 기록 수 (단추에 숫자) */
export async function countForOrder(orderId) { try { return (await S.DB.list('displays', { where: [['orderId', '==', orderId]] })).filter(d => d.st !== 'x').length; } catch (e) { return 0; } }
