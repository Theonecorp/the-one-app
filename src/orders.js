/* ============================================================
 *  주문 — 세일즈맨 (폰 · 아이패드, 인터넷 없어도 됨)
 *    가게 고르기 → 아이템 담기 (가격 · 수량 · 할인 수정 가능) → 저장/보내기
 *    저장하면 먼저 폰의 "보낼 함"에 넣고, 인터넷이 되면 회사로 보냄 → 보낸 뒤에야 보낼 함에서 지움 (주문가 사라지지 않게)
 *  매니저 처리(픽킹 → 인보이스 확정 → 백오더)는 fulfill.js
 *
 *  orders/{id}     = { id, no, d, ym, sm, acct, store, st, n, qty, amt, list, pdiff, pdn, disc:{A:20}, discChg, memo,
 *                      createdBy, createdAt, updatedAt, sentAt, pickAt, pickBy, invs:[], doneAt, doneBy, bo }   ← 목록용
 *  orderLines/{id} = { sm, lines:[{c, d, q, p, lp, t, pq?, note?}] }   (lp = 목록가, t = 인보이스 종류, pq = 픽킹 수량)
 *  st: draft(임시저장) → sent(보냄) → pick(픽킹 중) → done(인보이스 확정) · x(취소)
 * ============================================================ */
import { $, esc, money, R2, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, sel, sortBy, debounce, bi, bt, hasWords, addDays, daysBetween, localDay, sum, groupBy, pickDates } from './ui.js';
import { searchAccounts, accountLabel } from './accounts.js';
import { loadCatalog, catalog, searchItems, popularItems, exactItem, thumb, catStart, treeFor, cleanName } from './catalog.js';
import { jobOf } from './main.js';
import { invTypes, typeOfItem, acctDisc, splitByType, priceDiff, salesRows, invCount } from './invoicing.js';
import * as Fulfill from './fulfill.js';
import * as Store from './store.js';

let S = null;
const DT = () => invTypes(S)[0].c;   // 기본 인보이스 종류
export function register(state) {
  S = state; Router.on('order', pageOrder); Router.on('home', pageHome); Fulfill.register(state); Store.register(state);
  /* 인터넷이 다시 되면 · 앱을 다시 열면 보낼 함을 비움 */
  window.addEventListener('online', () => syncOutbox(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncOutbox(true); });
}

/* 주문 상태 흐름: draft(저장됨) → sent(접수) → pick(픽킹 중 · picker 할당) → picked(픽킹 완료 · 사무실 확인 대기) → done(인보이스 발행 · 포장 대기) → shipped(출고 완료) · x(취소) */
export const ST = { draft: ['임시 저장', 'Draft', 't-g'], sent: ['주문 접수', 'Received', 't-b'], ok: ['출고 작업', 'In Fulfillment', 't-c'], pick: ['출고 작업', 'In Fulfillment', 't-c'], picked: ['검수 대기', 'Ready for Review', 't-a'], done: ['인보이스 발행', 'Invoiced', 't-k'], shipped: ['출고 완료', 'Shipped', 't-g'], x: ['취소', 'Cancelled', 't-r'], local: ['전송 대기', 'Pending Upload', 't-r'] };
export const stName = st => { const x = ST[st] || ST.draft; return x[0] + ' · ' + x[1]; };
export const stTag = st => { const x = ST[st] || ST.draft; return '<span class="tag ' + x[2] + '" title="' + x[1] + '">' + x[0] + '</span>'; };
const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');
const OUT_KEY = 'theone.outbox.v1';
/* 작성 중 주문는 로그인한 사람별로 보관 (한 기기를 여럿이 쓸 때 섞이지 않게) */
const WIP_KEY_ = 'theone.order.wip', wipKey = () => WIP_KEY_ + '.' + ((S && S.user && S.user.email) || '');
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
/** 보낼 함의 주문를 회사로 — 성공한 것만 지움. 돌려주는 값: { sent, left } */
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
  if (!quiet || sent) { if (sent) toast('📤 주문 ' + sent + '건 보냄' + (left ? ' · 남은 ' + left + '건' : ''), 'good'); }
  if (sent && location.hash === '#/order' && !O) pageOrder('');
  return { sent, left };
}

/* ============================================================
 *  🏠 홈 (세일즈맨) — SBMGo 시작 화면처럼 큰 버튼
 * ============================================================ */
async function pageHome() {
  const name = (S.user && (S.user.name || S.user.email)) || '';
  const out = outboxList().filter(x => x.o.sm === mySm()).length;
  const tile = (go, icon, label, sub, cls) => '<button class="htile ' + (cls || '') + '" data-hg="' + go + '"><span class="hi">' + icon + '</span><b>' + label + '</b><small id="hs-' + go.replace(/[^a-z]/g, '') + '">' + (sub || '') + '</small></button>';
  $('page').innerHTML = '<div class="card" style="text-align:center"><img src="logo.png" alt="" style="width:64px;height:64px"><div style="font-weight:800;font-size:17px;margin-top:4px">' + esc(name) + '</div><div class="muted">' + esc(mySm()) + ' · ' + (navigator.onLine === false ? '<span class="warn">오프라인 Offline</span>' : '<span class="ok">온라인 Online</span>') + (out ? ' · <span class="warn">📤 안 보낸 주문 ' + out + '건</span>' : '') + '</div></div>' +
    '<div class="hgrid">' + tile('order/new', '🛒', bi('새 주문', 'New order'), '가게 고르고 담기 · pick a store', 'blue') + tile('order', '📤', bi('보낼 주문', 'To send'), '읽는 중…', 'green') + tile('order', '📋', bi('내 주문', 'My orders'), '최근 2달 · last 2 months') + tile('order', '❓', bi('확인 요청', 'To confirm'), '읽는 중…', 'amber') + tile('stores', '🏬', bi('거래처', 'Customers'), '가게 정보 · 미수금 · 기록') + tile('entry/new', '✍️', bi('수금 입력', 'Payment'), '체크 · 캐쉬 · check / cash') + tile('ar', '💰', bi('미수금', 'A/R'), '내 가게 AR · my stores') + tile('mycomm', '🧾', bi('정산서', 'Commission'), '커미션 statement') + '</div>' +
    '<button class="b-ghost" id="hMine" style="margin-top:4px">📋 ' + bi('내 수금 기록', 'My payment log') + '</button>';
  document.querySelectorAll('[data-hg]').forEach(b => b.onclick = () => { const [r, a] = b.dataset.hg.split('/'); if (a) Router.go(r, a); else Router.go(r); });
  $('hMine').onclick = () => Router.go('mine');
  try {
    const rows = await S.DB.list('orders', { where: [['sm', '==', mySm()], ['ym', 'in', recentYms(2)]] });
    const d = rows.filter(o => o.st === 'draft').length + out, sent = rows.filter(o => o.st === 'sent').length;
    const cf = rows.filter(o => o.cfReq && !o.cfOk && o.st !== 'x').length;
    const el = document.querySelectorAll('#hs-order'); if (el[0]) el[0].textContent = d ? d + '건 대기 중 · waiting' : '보낼 것 없음 · nothing to send'; if (el[1]) el[1].textContent = rows.length + '건 · 회사 처리 중 in office ' + sent; if (el[2]) { el[2].innerHTML = cf ? '<b style="color:#b45309">' + cf + '건 — 사무실이 기다립니다</b>' : '없음 · none'; }
  } catch (e) { const el = $('hs-order'); if (el) el.textContent = '—'; }
}

/* ============================================================
 *  목록
 * ============================================================ */
let LF = { st: 'sent', sm: '' };
let PK = [];   // 👷 빠른 할당용 픽킹 직원 목록 (나 먼저) · LF.qp = 고른 직원 email
/** 다른 화면(관리자 현황)에서 주문 목록을 바로 열기 — st: sent · pick · picked · done · shipped · bo · inv · all, 기간은 선택 */
export function openList(st, from, to) { LF.init = true; LF.list = true; LF.st = st; if (from) { LF.hp = 'custom'; LF.hfrom = from; LF.hto = to; LF.ip = 'custom'; LF.ifrom = from; LF.ito = to; } if (location.hash === '#/order') pageOrder(''); else Router.go('order'); }
async function pageOrder(arg) {
  if (arg === 'new') return openEditor(null, readWip());
  if (arg && arg.indexOf('bo:') === 0) return Fulfill.openBackorder(arg.substring(3));
  if (arg && arg.indexOf('inv:') === 0) return Fulfill.openInvoice(arg.substring(4));
  if (arg) return openOrder(arg);
  if (!isStaff() && !mySm()) { $('page').innerHTML = '<div class="card"><div class="none">이 계정에 세일즈맨 코드가 연결돼 있지 않습니다.</div></div>'; return; }
  O = null;
  if (isStaff() && !LF.init) { LF.init = true; const j = jobOf(); if (j === 'invoice') LF.st = 'pick'; else if (j === 'acct') LF.st = 'inv'; }
  if (isStaff() && !LF.list) return staffHome();
  if (isStaff() && !chipsFor().some(c => c[0] === LF.st)) LF.st = chipsFor()[0][0];
  if (isStaff() && (LF.st === 'bo' || LF.st === 'inv')) return Fulfill.pageLists(LF, listHead());
  $('page').innerHTML = listHead() + '<div class="load">주문 읽는 중…</div>';
  bindHead();
  syncOutbox(true);
  if (isStaff() && LF.st === 'sent' && jobOf() !== 'acct') { try { const me = S.user.email, L = await Fulfill.pickers(); PK = [{ email: me, name: (S.user.name || me.split('@')[0]), me: true, pick: true }].concat(L.filter(p => p.email !== me)); } catch (e) { PK = []; } if (!LF.qp || !PK.some(p => p.email === LF.qp)) LF.qp = S.user.email; }
  let rows = [], err = '';
  try {
    if (isStaff()) {
      if (LF.st === 'all' || LF.st === 'done' || LF.st === 'x') {
        const [from, to] = Fulfill.periodRange(LF.hp || 'today', LF.hfrom, LF.hto);
        rows = await S.DB.list('orders', { where: [['d', '>=', addDays(from, -7)], ['d', '<=', to]] });
        const inR = iso => { const d = localDay(iso); return d >= from && d <= to; };
        rows = rows.filter(o => LF.st === 'done' ? (o.doneAt ? inR(o.doneAt) : o.d >= from && o.d <= to) : (o.d >= from && o.d <= to));
        if (LF.st === 'all') rows = rows.filter(o => o.st !== 'draft');
      } else if (LF.st === 'shipped') {
        const [from, to] = Fulfill.periodRange(LF.hp || 'today', LF.hfrom, LF.hto);
        rows = (await S.DB.list('orders', { where: [['d', '>=', addDays(from, -30)], ['d', '<=', to]] })).filter(o => o.st === 'shipped' && o.shipAt && localDay(o.shipAt) >= from && localDay(o.shipAt) <= to);
      } else if (LF.st === 'mine') rows = (await S.DB.list('orders', { where: [['st', 'in', ['pick', 'ok']]] })).filter(o => o.picker === S.user.email);
      else rows = await S.DB.list('orders', { where: [['st', 'in', LF.st === 'pick' ? ['pick', 'ok'] : [LF.st]]] });
      if (LF.st !== 'all' && LF.st !== 'mine' && LF.st !== 'shipped') rows = rows.filter(o => LF.st === 'pick' ? (o.st === 'pick' || o.st === 'ok') : o.st === LF.st);
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
  if (wip) h += '<div class="alert a-amb tap" id="oWip" style="margin:0 0 12px">✏️ 작성 중인 주문 — ' + esc(wip.store || '가게 미선택') + ' · ' + wip.lines.length + '줄 <b>이어서 하기 ›</b></div>';
  if (out.length) h += '<div class="card" style="border:2px solid #fecaca"><h2>📤 아직 회사로 안 간 주문 ' + out.length + '건</h2><div class="muted">폰에 안전하게 저장돼 있습니다. 인터넷이 되면 자동으로 보내고, 아래 버튼으로 바로 보낼 수도 있습니다.</div>' +
    out.map(x => orderRow(x.o, true, x.err)).join('') + '<button class="b-blue" id="oSync" style="margin-top:8px">📤 지금 모두 보내기</button></div>';
  if (err) h += '<div class="alert a-amb">회사 기록을 읽지 못했습니다 (' + esc(err) + ') — 인터넷이 안 되면 폰에 저장된 것만 보입니다.</div>';
  const cfs = isStaff() ? [] : rows.filter(o => o.cfReq && !o.cfOk && o.st !== 'x');
  if (cfs.length) h += '<div class="card" style="border:2px solid #fde68a"><h2>❓ ' + bi('사무실에서 확인 요청한 주문', 'Office asks you to confirm') + ' ' + cfs.length + '건</h2><div class="muted">열어서 내용이 맞으면 <b>✅ 맞습니다</b>, 아니면 <b>✏️ 수정</b>. <span class="en">Open each order and confirm or edit.</span></div>' + cfs.map(o => orderRow(o)).join('') + '</div>';
  const drafts = isStaff() ? (LF.st === 'draft' ? rows : []) : rows.filter(o => o.st === 'draft');
  if (isStaff() && LF.st === 'draft') rows = [];   // 아래 목록에 또 나오지 않게
  if (drafts.length) h += '<div class="card" style="border:2px solid #bfdbfe"><h2>✅ ' + bi('주문 확인 · 보낼 주문', 'Review & send') + ' ' + drafts.length + '건 · ' + money(drafts.reduce((a, o) => a + (o.amt || 0), 0)) + '</h2><div class="muted">저장해 둔 주문입니다. <b>열기</b>로 내용을 확인한 뒤, 체크한 것을 한 번에 회사로 보냅니다 (보낸 뒤에도 픽킹 시작 전까지는 고칠 수 있습니다). <span class="en">Open to review, then send the checked orders.</span></div>' +
    drafts.map(o => '<label class="pick on" style="margin-top:6px"><input type="checkbox" class="ck-big" data-sd="' + esc(o.id) + '" checked><span class="pm"><b>' + esc(o.store) + '</b><small>' + esc(md(o.d)) + ' · ' + esc(o.no) + ' · ' + (o.n || 0) + '줄 · ' + money(o.amt) + '</small></span><button class="b-ghost b-sm" data-oid="' + esc(o.id) + '">열기</button></label>').join('') +
    '<button class="b-green" id="oSendAll" style="margin-top:10px;padding:15px">📤 체크한 주문 회사로 보내기</button></div>';
  const tot = rows.reduce((a, o) => a + (o.amt || 0), 0);
  const chip = CHIPS.find(c => c[0] === LF.st);
  const bulk = isStaff() && (LF.st === 'sent' || LF.st === 'pick' || LF.st === 'mine') && rows.length;
  if (bulk) h += '<div class="card" style="padding:10px 14px"><div class="chips" style="margin:0"><button class="' + (LF.grp !== 'day' ? 'on' : '') + '" data-grp="sm">👤 ' + bi('세일즈맨별', 'By salesman') + '</button><button class="' + (LF.grp === 'day' ? 'on' : '') + '" data-grp="day">📅 ' + bi('날짜별', 'By day') + '</button><button data-ckall="1">☑ ' + bi('모두 선택', 'Select all') + '</button><button data-ckall="0">☐ ' + bi('선택 해제', 'Clear') + '</button></div>' +
    (LF.st === 'sent' && PK.length ? '<div class="qasg"><span>👷 ' + bi('빠른 할당', 'Quick assign') + '</span><div class="chips" style="margin:0">' + PK.map(p => '<button class="' + (LF.qp === p.email ? 'on' : '') + '" data-qp="' + esc(p.email) + '">' + (p.me ? '🙋 ' : p.pick ? '👷 ' : '🧑‍💼 ') + esc(p.name) + (p.me ? ' (나)' : '') + '</button>').join('') + '</div><div class="muted" style="font-size:12px">' + bi('직원을 고른 뒤 주문 줄의 <b>👷 할당</b> 을 누르면 바로 그 직원 픽킹으로 넘어갑니다 (확인창 없음). 여러 건은 체크 → 픽킹 할당(인쇄 선택)', 'Pick a person, then tap 👷 on an order to assign it instantly. For many: check → Assign picking') + '</div></div>' : '') +
    '<div id="bulkBar" class="muted" style="margin-top:6px">' + bi('주문을 체크한 뒤 → 작업 배정 또는 세일즈맨 확인 요청', 'Check orders, then assign picking or ask the salesman to confirm') + '</div><div class="btns" style="margin-top:6px;flex-wrap:wrap">' + (jobOf() !== 'acct' ? '<button class="b-blue b-sm" id="bkAssign">👷 ' + bi('작업 배정', 'Assign Picker') + '</button>' : '') + (LF.st === 'sent' ? '<button class="b-ghost b-sm" id="bkCf">❓ ' + bi('세일즈맨 확인 요청', 'Ask salesman to confirm') + '</button>' : '') + '</div></div>';
  h += '<div class="card"><h2>' + (isStaff() ? (chip ? chip[1] + ' <span class="en">' + chip[2] + '</span> · ' : '') : bi('내 주문', 'My orders') + ' ') + rows.length + '건 · ' + money(tot) + (isStaff() ? '' : ' <span class="muted">(최근 2달 · last 2 months)</span>') + '</h2>' + (rows.length ? dayGroups(rows) : '<div class="none">' + bt('주문가 없습니다', 'No orders') + '</div>') + '</div>';
  $('page').innerHTML = listHead() + h;
  bindHead(); fillStrip();
  const picked = () => Array.from(document.querySelectorAll('[data-ck]:checked')).map(x => x.dataset.ck);
  document.querySelectorAll('[data-grp]').forEach(b => b.onclick = () => { LF.grp = b.dataset.grp; pageOrder(''); });
  document.querySelectorAll('[data-ckall]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-ck]').forEach(c => { c.checked = b.dataset.ckall === '1'; }); });
  document.querySelectorAll('[data-ck]').forEach(c => c.onclick = e => e.stopPropagation());
  document.querySelectorAll('[data-smhd]').forEach(el => el.onclick = () => { const g = el.parentElement; g.classList.toggle('fold'); });
  document.querySelectorAll('[data-qp]').forEach(b => b.onclick = () => { LF.qp = b.dataset.qp; document.querySelectorAll('[data-qp]').forEach(x => x.classList.toggle('on', x === b)); });
  document.querySelectorAll('[data-qa]').forEach(b => b.onclick = async e => {
    e.stopPropagation(); const o = rows.find(x => x.id === b.dataset.qa), p = PK.find(x => x.email === LF.qp); if (!o || !p) return;
    b.disabled = true; b.textContent = '…';
    try { const now = new Date().toISOString(); await S.DB.update('orders', o.id, { st: 'pick', picker: p.email, pickerName: p.name, pickAt: now, pickBy: S.user.email, updatedAt: now }); toast('👷 ' + p.name + ' ← ' + o.store, 'good'); const row = b.closest('[data-oid]'); if (row) { row.style.transition = 'opacity .25s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 260); } }
    catch (e2) { b.disabled = false; b.textContent = '👷 할당'; toast('실패: ' + (e2.code || e2.message), 'bad'); }
  });
  if ($('bkAssign')) $('bkAssign').onclick = () => { const ids = picked(); if (!ids.length) return toast('주문를 체크하세요', 'bad'); Fulfill.assignPicker(rows.filter(o => ids.includes(o.id)), () => pageOrder('')); };
  if ($('bkCf')) $('bkCf').onclick = async () => { const ids = picked(); if (!ids.length) return toast('주문를 체크하세요', 'bad'); if (!(await confirmBox(ids.length + '건을 세일즈맨에게 확인 요청할까요? 세일즈맨 앱 홈에 "확인 요청" 으로 뜹니다.', '요청'))) return; busy(true); try { const now = new Date().toISOString(); await S.DB.batch(ids.map(id => ({ op: 'update', col: 'orders', id, data: { cfReq: true, cfReqAt: now, cfReqBy: S.user.email, cfOk: false } }))); toast('확인 요청 ' + ids.length + '건', 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); pageOrder(''); };
  if ($('oWip')) $('oWip').onclick = () => openEditor(null, wip);
  if ($('oSync')) $('oSync').onclick = async () => { busy(true); const r = await syncOutbox(false); busy(false); if (!r.sent) toast(navigator.onLine === false ? '인터넷이 안 됩니다 — 폰에 그대로 있습니다' : '보내지 못했습니다 — 잠시 뒤 다시', 'bad'); pageOrder(''); };
  document.querySelectorAll('[data-oid]').forEach(el => el.onclick = e => { e.preventDefault(); e.stopPropagation(); Router.go('order', el.dataset.oid); });
  if ($('oSendAll')) $('oSendAll').onclick = async () => {
    const ids = Array.from(document.querySelectorAll('[data-sd]:checked')).map(x => x.dataset.sd); if (!ids.length) return toast('보낼 주문를 체크하세요', 'bad');
    if (!(await confirmBox(ids.length + '건을 회사로 보낼까요?', '보내기'))) return;
    busy(true);
    try {
      const now = new Date().toISOString();
      for (const id of ids) { const o = drafts.find(x => x.id === id); if (!o) continue; const L = await S.DB.get('orderLines', id); putOut(Object.assign({}, o, { st: 'sent', sentAt: now, updatedAt: now }), (L && L.lines) || []); }
      const r = await syncOutbox(true);
      toast(r.left ? '📱 ' + r.left + '건은 인터넷이 되면 자동으로 보냅니다' : '📤 ' + ids.length + '건 보냈습니다', r.left ? '' : 'good');
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false); pageOrder('');
  };
}
/* 담당자의 일(job) 에 따라 보이는 칩이 다름 — 픽킹: 들어온 주문 · 픽킹 중 · 백오더 / 인보이스: 픽킹 중(확정 대기) · 완료 · 인보이스 찾기 · 백오더 */
const CHIPS = [['mine', '👷 내 배정 작업', 'My Assignments'], ['sent', '📥 신규 주문', 'New Orders'], ['pick', '📦 출고 작업', 'In Fulfillment'], ['picked', '✅ 검수 대기', 'Ready for Review'], ['done', '🧾 인보이스 발행 · 포장 대기', 'Invoiced · Awaiting Packing'], ['shipped', '🚚 출고 완료', 'Shipped'], ['bo', '⏳ 백오더', 'Backorders'], ['inv', '📄 인보이스 조회', 'Invoice Lookup'], ['draft', '💾 임시 저장', 'Drafts'], ['x', '✕ 취소', 'Cancelled'], ['all', '📋 전체 주문', 'All Orders']];
const JOB_CHIPS = { pick: ['mine', 'sent', 'pick', 'picked', 'bo'], invoice: ['picked', 'pick', 'sent', 'done', 'shipped', 'inv', 'bo', 'draft', 'all'], acct: ['inv', 'done', 'shipped', 'bo', 'all'] };
const LIVE_ST = ['sent', 'pick', 'ok', 'picked', 'done'];   // 아직 끝나지 않은 주문 (출고 전)
export function chipsFor() { const j = jobOf(); const keys = JOB_CHIPS[j]; return keys ? keys.map(k => CHIPS.find(c => c[0] === k)) : CHIPS; }
export function statusStrip() { return '<div class="kpi strip" id="oStrip" style="margin:0 0 10px"><div><b>…</b><span>📥 신규 주문 · New</span></div><div><b>…</b><span>📦 출고 작업 · In Fulfillment</span></div><div><b>…</b><span>✅ 검수 대기 · Review</span></div><div><b>…</b><span>🧾 포장 대기 · Packing</span></div></div>'; }
export async function fillStrip() {
  const el = $('oStrip'); if (!el) return;
  try {
    const live = await S.DB.list('orders', { where: [['st', 'in', LIVE_ST]] });
    if (!$('oStrip')) return;
    const b = el.querySelectorAll('b');
    b[0].textContent = live.filter(o => o.st === 'sent').length; b[1].textContent = live.filter(o => o.st === 'pick' || o.st === 'ok').length; b[2].textContent = live.filter(o => o.st === 'picked').length; b[3].textContent = live.filter(o => o.st === 'done').length;
    el.querySelectorAll('div').forEach((d, i) => { d.onclick = () => { LF.st = ['sent', 'pick', 'picked', 'done'][i]; LF.list = true; if (i === 3) LF.hp = 'year'; pageOrder(''); }; d.classList.add('tap'); });
  } catch (e) { el.querySelectorAll('b').forEach(x => { x.textContent = '—'; }); }
}
/* 담당자 · 관리자의 주문 첫 화면 — 세일즈맨 홈처럼 큰 버튼 (건수는 읽은 뒤 채움) */
async function staffHome() {
  const j = jobOf();
  LF.hp = LF.hp || 'today';
  const [from, to] = Fulfill.periodRange(LF.hp, LF.hfrom, LF.hto), days = Math.max(1, daysBetween(from, to) + 1);
  const pf = addDays(from, -days), pt = addDays(from, -1);   // 바로 앞 같은 길이 기간 (비교용)
  const plabel = Fulfill.PERIODS.find(p => p[0] === LF.hp), ptxt = LF.hp === 'custom' || !plabel ? md(from) + ' ~ ' + md(to) : plabel[1] + (days > 1 ? ' (' + md(from) + ' ~ ' + md(to) + ')' : ' ' + md(from));
  const tile = (go, icon, label, sub, cls) => '<button class="htile ' + (cls || '') + '" data-hg="' + go + '"><span class="hi">' + icon + '</span><b>' + label + '</b><small id="ht-' + go.replace(/[^a-z]/g, '') + '">' + (sub || '') + '</small></button>';
  const MAIN = ['today', 'week', 'month', 'quarter', 'year'];
  const chips = '<div class="chips" style="margin:0 0 8px">' + Fulfill.PERIODS.filter(c => MAIN.includes(c[0])).map(c => '<button class="' + (LF.hp === c[0] ? 'on' : '') + '" data-hp="' + c[0] + '">' + c[1] + ' <span class="en">' + c[2] + '</span></button>').join('') + '<button class="' + (MAIN.includes(LF.hp) ? '' : 'on') + '" id="hCal">📅 ' + bi('날짜 선택', 'Pick dates') + '</button></div>' +
    '<div class="two" style="margin:0 0 8px;grid-template-columns:auto 1fr auto;align-items:center;gap:6px"><button class="b-ghost b-sm" id="hPrev" title="앞 기간">◀</button><div style="text-align:center;font-weight:800">' + esc(ptxt) + '</div><button class="b-ghost b-sm" id="hNext" title="다음 기간">▶</button></div>';
  /* 일 타일 — 기간에 따라 숫자가 바뀜 (들어온 · 인보이스 완료 · 매출), 지금 상태 (픽킹 중 · 백오더) */
  const T = [];
  if (j === 'pick') T.push(tile('mine', '👷', bi('내 배정 작업', 'My Assignments'), '읽는 중…', 'blue'));
  if (j !== 'acct') T.push(tile('sent', '📥', bi('신규 주문', 'New Orders'), '읽는 중…', j === 'pick' ? '' : 'blue'), tile('pick', '📦', bi('출고 작업', 'In Fulfillment'), '읽는 중…'));
  if (j !== 'acct') T.push(tile('picked', '✅', bi('작업 완료 · 검수 대기', 'Ready for Review'), '읽는 중…'));
  if (j !== 'pick') T.push(tile('done', '🧾', bi('인보이스 발행 · 포장 대기', 'Invoiced · Awaiting Packing'), '읽는 중…'));
  T.push(tile('shipped', '🚚', bi('출고 완료', 'Shipped'), '읽는 중…'));
  if (j !== 'acct') T.push(tile('bo', '⏳', bi('백오더', 'Backorders'), '읽는 중…'));
  const A = [];
  if (j !== 'pick' && j !== 'acct') A.push(tile('new', '🛒', bi('새 주문', 'New order'), '가게 고르고 담기', 'blue'));
  if (j !== 'pick') A.push(tile('inv', '📄', bi('인보이스 조회', 'Invoices'), '가게 · 날짜 · 번호'));
  A.push(tile('stores', '🏬', bi('거래처', 'Customers'), '가게 창 · 미수금'));
  if (j !== 'pick') A.push(tile('verify', '💵', bi('수금 확인', 'Payments'), '세일즈맨 수금 확인'));
  if (j !== 'pick') A.push(tile('items', '🏷', bi('아이템', 'Items'), '등록 · 가격 · 분류'));
  A.push(tile('all', '📋', bi('전체 주문', 'All orders'), ptxt));
  /* 담당자 홈 = 주문 처리 먼저 (접수 · 픽킹 · 인보이스 · 포장), 바로가기, 매출은 맨 아래 */
  $('page').innerHTML = '<div class="card" style="padding:12px 14px 6px"><h2 style="margin:0 0 8px">📦 ' + bi('주문 처리', 'Order processing') + ' — ' + esc(ptxt) + '</h2>' + chips + '</div>' +
    '<div class="hgrid">' + T.join('') + '</div><div class="hgrid">' + A.join('') + '</div>' +
    '<div class="card" id="hSales"><h2>📈 ' + bi('매출 (인보이스 기준)', 'Sales (invoiced)') + '</h2><div class="load">읽는 중…</div></div>';
  document.querySelectorAll('[data-hp]').forEach(b => b.onclick = () => { LF.hp = b.dataset.hp; staffHome(); });
  /* ◀ ▶ — 같은 길이만큼 앞뒤로 (달 단위 기간은 달로) */
  const shift = dir => { const isMonth = from.endsWith('-01') && (to === today() || to === Fulfill.monthEnd(from)); if (LF.hp === 'month' || LF.hp === 'lastm' || (LF.hp === 'custom' && isMonth && daysBetween(from, to) >= 27)) { const f = Fulfill.addMonths(from, dir); LF.hfrom = f; LF.hto = Fulfill.monthEnd(f); } else { LF.hfrom = addDays(from, dir * days); LF.hto = addDays(to, dir * days); } LF.hp = 'custom'; staffHome(); };
  $('hPrev').onclick = () => shift(-1); $('hNext').onclick = () => shift(1);
  $('hCal').onclick = async () => { const r = await pickDates({ from, to, quick: Fulfill.quickRanges() }); if (!r) return; LF.hp = 'custom'; LF.hfrom = r[0]; LF.hto = r[1]; staffHome(); };
  document.querySelectorAll('[data-hg]').forEach(b => b.onclick = () => {
    const k = b.dataset.hg;
    if (k === 'new') { if (readWip() && !confirm('작성 중인 주문가 있습니다. 버리고 새로 시작할까요?')) return; clearWip(); return Router.go('order', 'new'); }
    if (k === 'stores' || k === 'verify' || k === 'items') return Router.go(k);
    if (k === 'inv' || k === 'shipped') { LF.ip = LF.hp; LF.ifrom = from; LF.ito = to; }
    LF.st = k; LF.list = true; pageOrder('');
  });
  try {
    const [live, bo, ords, inv, pinv] = await Promise.all([
      S.DB.list('orders', { where: [['st', 'in', LIVE_ST]] }), S.DB.list('backorders', { where: [['st', '==', 'open']] }),
      S.DB.list('orders', { where: [['d', '>=', addDays(from, -7)], ['d', '<=', to]] }),
      salesRows(S, from, to), days <= 92 ? salesRows(S, pf, pt) : Promise.resolve(null)]);
    if (!$('hSales')) return;
    const inR = iso => { const d = localDay(iso); return d >= from && d <= to; };
    const sentIn = ords.filter(o => o.sentAt && o.st !== 'draft' && o.st !== 'x' && inR(o.sentAt)), doneIn = ords.filter(o => (o.st === 'done' || o.st === 'shipped') && o.doneAt && inR(o.doneAt)), shipIn = ords.filter(o => o.st === 'shipped' && o.shipAt && inR(o.shipAt));
    const wait = live.filter(o => o.st === 'sent'), pk = live.filter(o => o.st === 'pick' || o.st === 'ok'), pkd = live.filter(o => o.st === 'picked'), topack = live.filter(o => o.st === 'done'), mine = pk.filter(o => o.picker === S.user.email);
    const put = (id, v) => { const el = $('ht-' + id); if (el) el.innerHTML = v; };
    const nm = (L, f) => L.length ? L.length + '건 · ' + money(L.reduce((a, o) => a + (f ? f(o) : o.amt || 0), 0)) : '없음 · none';
    put('mine', nm(mine));
    put('sent', nm(sentIn) + (wait.length ? '<br><b style="color:#b91c1c">작업 배정 대기 · Unassigned ' + wait.length + '건</b>' : '<br>대기 없음 · none waiting'));
    put('pick', nm(pk) + (wait.filter(o => o.cfReq && !o.cfOk).length + pk.filter(o => o.cfReq && !o.cfOk).length ? '<br>❓ 세일즈맨 확인 대기 ' + (wait.filter(o => o.cfReq && !o.cfOk).length + pk.filter(o => o.cfReq && !o.cfOk).length) + '건' : ''));
    put('picked', nm(pkd));
    put('done', nm(doneIn) + (topack.length ? '<br><b style="color:#b45309">포장 대기 ' + topack.length + '건</b>' : ''));
    put('shipped', nm(shipIn));
    put('bo', bo.length ? bo.length + '건 · ' + money(bo.reduce((a, r) => a + (r.amt || 0), 0)) : '없음 · none');
    /* 매출 */
    const iv = inv.filter(x => x.st !== 'x'), tot = sum(iv, x => x.total || 0), pcs = iv.reduce((a, x) => a + (x.qty || 0), 0);
    const pv = pinv ? sum(pinv.filter(x => x.st !== 'x'), x => x.total || 0) : null;
    const types = invTypes(S), isJ = t => { const x = types.find(z => z.c === t); return x ? (x.comm === 'A' || x.comm === 'W') : t !== 'P'; };
    const byT = groupBy(iv, x => isJ(x.t) ? '💍 주얼리 · Jewelry' : '🧴 그 외 제품 · Other'), bySm = sortBy(Object.entries(groupBy(iv, x => x.sm || '—')).map(([sm, L]) => ({ sm, n: invCount(L), amt: sum(L, x => x.total || 0) })), x => x.amt, true);
    const mx = Math.max(1, ...bySm.map(x => x.amt));
    let bars = '';
    if (days > 1) {
      const byMonth = days > 62, keyOf = d => byMonth ? d.substring(0, 7) : d, keys = [];
      for (let d = from; d <= to; d = addDays(d, 1)) { const k = keyOf(d); if (keys[keys.length - 1] !== k) keys.push(k); }
      const m = groupBy(iv, x => keyOf(x.d)), vals = keys.map(k => sum(m[k] || [], x => x.total || 0)), bm = Math.max(1, ...vals);
      bars = '<div class="bars" style="height:70px">' + keys.map((k, i) => '<div class="b" style="flex:1;background:#3b82f6;height:' + Math.max(2, Math.round(vals[i] / bm * 100)) + '%" data-v="' + esc(k + ' ' + money(vals[i])) + '" title="' + esc(k + ' ' + money(vals[i])) + '"></div>').join('') + '</div><div class="muted" style="display:flex;justify-content:space-between;font-size:11px"><span>' + esc(keys[0]) + '</span><span>' + esc(keys[keys.length - 1]) + '</span></div>';
    }
    $('hSales').innerHTML = '<h2>📈 ' + bi('매출 (인보이스 기준)', 'Sales (invoiced)') + ' · ' + esc(ptxt) + '</h2><div class="hero">' + money(tot) + '</div><div class="heroSub">' + invCount(iv) + '건 · ' + pcs.toLocaleString() + ' pcs' +
      (pv != null ? ' · 바로 앞 기간 ' + money(pv) + ' <b class="' + (tot >= pv ? 'ok' : 'warn') + '">' + (pv ? ((tot - pv) / pv * 100 >= 0 ? '+' : '') + Math.round((tot - pv) / pv * 100) + '%' : '') + '</b>' : '') + '</div>' +
      '<div class="kpi" style="grid-template-columns:1fr 1fr;margin-top:8px">' + Object.keys(byT).sort().map(t => '<div class="tap" data-ivt="' + (t.includes('Jewelry') ? 'J' : 'O') + '"><b>' + money(sum(byT[t], x => x.total || 0)) + '</b><span>' + esc(t) + ' · ' + invCount(byT[t]) + '건</span></div>').join('') + '</div>' + bars +
      (bySm.length ? '<table style="margin-top:8px;font-size:13px"><tr><th>세일즈맨</th><th class="r">건</th><th class="r">매출</th></tr>' + bySm.map(x => '<tr class="tap" data-ivsm="' + esc(x.sm) + '"><td><b>' + esc(x.sm) + '</b><div class="paybar" style="margin-top:3px"><i style="width:' + Math.round(x.amt / mx * 100) + '%;background:#3b82f6"></i></div></td><td class="r">' + x.n + '</td><td class="r"><b>' + money(x.amt) + '</b></td></tr>').join('') + '</table>' : '<div class="none">이 기간에 인보이스가 없습니다</div>') +
      (days > 92 ? '<div class="hint">긴 기간은 인보이스를 많이 읽어 느릴 수 있습니다</div>' : '');
    document.querySelectorAll('[data-ivt]').forEach(b => b.onclick = () => { LF.ip = LF.hp; LF.ifrom = from; LF.ito = to; LF.it = b.dataset.ivt === 'J' ? (types.find(z => z.comm === 'A') || types[0]).c : ''; LF.st = 'inv'; LF.list = true; pageOrder(''); });
    document.querySelectorAll('[data-ivsm]').forEach(b => b.onclick = () => { LF.ip = LF.hp; LF.ifrom = from; LF.ito = to; LF.sm = b.dataset.ivsm; LF.st = 'inv'; LF.list = true; pageOrder(''); });
  } catch (e) { if ($('hSales')) $('hSales').innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; }
}
function listHead() {
  if (!isStaff()) return '<button class="b-blue" id="oNew" style="margin-bottom:12px;padding:15px">＋ ' + bi('새 주문', 'New order') + '</button>';
  const j = jobOf();
  const pr = Fulfill.periodRange(LF.hp || 'today', LF.hfrom, LF.hto);
  const per = (LF.st === 'all' || LF.st === 'done' || LF.st === 'x' || LF.st === 'shipped') ? '<div class="chips" style="margin-top:0">' + Fulfill.PERIODS.filter(c => ['today', 'week', 'month', 'quarter', 'year'].includes(c[0])).map(c => '<button class="' + ((LF.hp || 'today') === c[0] ? 'on' : '') + '" data-hp2="' + c[0] + '">' + c[1] + '</button>').join('') + '<button class="' + (['today', 'week', 'month', 'quarter', 'year'].includes(LF.hp || 'today') ? '' : 'on') + '" id="hCal2">📅 ' + esc(md(pr[0]) + (pr[0] !== pr[1] ? ' ~ ' + md(pr[1]) : '')) + '</button></div>' : '';
  /* 위쪽 메뉴(상태 칩 · 기간)는 화면 위에 고정 — 아래로 내려가도 바로 다른 목록으로 */
  const chip = (k, ic, ko, en, on) => '<button class="' + (on ? 'on' : '') + '" data-lf="' + k + '"><span class="ci">' + ic + '</span>' + ko + ' <span class="en">' + en + '</span></button>';
  return statusStrip() + '<div class="ohead"><div class="chips ochips">' + chip('home', '🏠', '홈', 'Home', false) + chipsFor().map(c => { const i = c[1].indexOf(' '); return chip(c[0], c[1].substring(0, i), c[1].substring(i + 1), c[2], LF.st === c[0]); }).join('') + '</div>' + per + '</div>' +
    '<div class="two" style="margin-bottom:10px">' + sel('lfSm', [['', '세일즈맨 전체 · All salesmen']].concat(S.sms.map(s => [s.code, s.code])), LF.sm) + (j === 'pick' ? '<span></span>' : '<button class="b-blue" id="oNew">＋ ' + bi('주문 만들기', 'New order') + '</button>') + '</div>';
}
function bindHead() {
  { const row = document.querySelector('.ochips'), on = row && row.querySelector('.on'); if (on) row.scrollLeft = Math.max(0, on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2); }   // 고른 칩이 보이게
  document.querySelectorAll('[data-hp2]').forEach(b => b.onclick = () => { LF.hp = b.dataset.hp2; pageOrder(''); });
  if ($('hCal2')) $('hCal2').onclick = async () => { const pr = Fulfill.periodRange(LF.hp || 'today', LF.hfrom, LF.hto), r = await pickDates({ from: pr[0], to: pr[1], quick: Fulfill.quickRanges() }); if (!r) return; LF.hp = 'custom'; LF.hfrom = r[0]; LF.hto = r[1]; pageOrder(''); };
  if ($('oNew')) $('oNew').onclick = () => { if (readWip() && !confirm('작성 중인 주문가 있습니다. 버리고 새로 시작할까요?')) return; clearWip(); Router.go('order', 'new'); };
  document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') { LF.list = false; return pageOrder(''); } LF.st = b.dataset.lf; pageOrder(''); });
  if ($('lfSm')) $('lfSm').onchange = () => { LF.sm = $('lfSm').value; pageOrder(''); };
}
/** 날짜별로 묶어서 — 하루치가 한눈에 (담당자 화면) */
function dayGroups(rows) {
  if (!isStaff()) return rows.map(o => orderRow(o)).join('');
  const ck = (LF.st === 'sent' || LF.st === 'pick' || LF.st === 'mine');
  if (LF.grp !== 'day' && (LF.st === 'sent' || LF.st === 'pick' || LF.st === 'picked' || LF.st === 'mine')) {
    const by = {}; rows.forEach(o => { const k = o.sm || '—'; (by[k] = by[k] || []).push(o); });
    return Object.keys(by).sort().map(sm => { const L = by[sm], cf = L.filter(o => o.cfReq && !o.cfOk).length; return '<div class="smgrp"><div class="iday tap" data-smhd="' + esc(sm) + '" style="background:#e0e7ff"><b>👤 ' + esc(sm) + '</b><span>' + L.length + '건 · ' + money(L.reduce((a, o) => a + (o.amt || 0), 0)) + (cf ? ' · <span class="warn">확인 대기 ' + cf + '</span>' : '') + ' ▾</span></div><div class="smbody">' + L.map(o => orderRow(o, false, '', ck)).join('') + '</div></div>'; }).join('');
  }
  const days = {}; rows.forEach(o => { const k = (o.st === 'sent' && o.sentAt ? o.sentAt : o.updatedAt || o.createdAt || o.d).substring(0, 10); (days[k] = days[k] || []).push(o); });
  return Object.keys(days).sort().reverse().map(d => { const L = days[d]; return '<div class="iday"><b>' + esc(dayLbl(d)) + '</b><span>' + L.length + '건 · ' + money(L.reduce((a, o) => a + (o.amt || 0), 0)) + '</span></div>' + L.map(o => orderRow(o, false, '', ck)).join(''); }).join('');
}
const WDK = ['일', '월', '화', '수', '목', '금', '토'];
function dayLbl(d) { const t = today(); const x = new Date(d + 'T12:00:00'); return (d === t ? '오늘 Today · ' : '') + Number(d.substring(5, 7)) + '/' + Number(d.substring(8, 10)) + ' (' + WDK[x.getDay()] + ')'; }
export const cfTag = o => o.cfOk ? ' <span class="tag t-k" title="Confirmed by salesman">✅ 세일즈맨 확인</span>' : o.cfReq ? ' <span class="tag t-c" title="Waiting for salesman">❓ 확인 대기</span>' : '';
function orderRow(o, local, err, ck) {
  const flags = (o.pdn ? ' <span class="tag t-c">가격 ' + o.pdn + '줄</span>' : '') + (o.discChg ? ' <span class="tag t-a">할인 변경</span>' : '') + (isStaff() ? cfTag(o) : (o.cfReq && !o.cfOk ? ' <span class="tag t-c">❓ 확인 요청</span>' : o.cfOk ? ' <span class="tag t-k">✅ 확인함</span>' : ''));
  const who = o.pickerName || o.picker ? ' · 👷 ' + esc(o.pickerName || String(o.picker).split('@')[0]) : '';
  return '<div class="pr tap" data-oid="' + esc(o.id) + '">' + (ck ? '<input type="checkbox" class="ck-big" data-ck="' + esc(o.id) + '" style="margin-right:8px">' : '') + '<div class="ct"><b>' + esc(o.store || '-') + ' ' + stTag(local ? 'local' : o.st) + flags + '</b><small>' + esc(md(o.d)) + ' · ' + esc(o.sm) + ' · ' + esc(o.no) + who + (o.invs && o.invs.length ? ' · ' + esc(o.invs.join(', ')) : '') + (o.track ? ' · 🚚 ' + esc(o.track) : '') + '</small>' + (err ? '<small class="warn">' + esc(err) + '</small>' : '') + '</div><div class="pa"><b>' + money(o.amt) + '</b><small>' + (o.n || 0) + '줄 · ' + (o.qty || 0) + '개</small></div>' + (ck && o.st === 'sent' && PK.length && LF.st === 'sent' ? '<button class="b-blue b-sm qa" data-qa="' + esc(o.id) + '">👷 ' + bi('할당', 'Assign') + '</button>' : '') + '</div>';
}

/* ============================================================
 *  주문 열기 — 세일즈맨은 보기, 매니저는 처리 화면
 * ============================================================ */
async function openOrder(id) {
  const local = readOut()[id];
  if (local) return viewOrder(local.o, local.lines, true);
  $('page').innerHTML = '<div class="load">주문 여는 중…</div>';
  let o, L;
  try { [o, L] = await Promise.all([S.DB.get('orders', id), S.DB.get('orderLines', id)]); }
  catch (e) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  if (!o) { $('page').innerHTML = '<div class="card"><div class="none">주문를 찾지 못했습니다</div></div>'; return; }
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
    (local ? '<div class="alert a-red">📤 아직 회사로 안 갔습니다 — 폰에 저장돼 있습니다</div>' : '') +
    (o.cfReq && !o.cfOk ? '<div class="alert a-amb">❓ ' + bi('사무실에서 이 주문 내용이 맞는지 확인을 요청했습니다. 아래 아이템을 보고 맞으면 ✅, 아니면 ✏️ 수정.', 'The office asks you to confirm this order.') + '</div>' : o.cfOk ? '<div class="alert a-grn">✅ ' + bi('확인한 주문', 'Confirmed') + ' ' + esc(String(o.cfAt || '').substring(0, 16).replace('T', ' ')) + '</div>' : '') + '</div>';
  const B = [];
  if (o.acct) B.push('<button class="b-ghost" id="oStoreI">📋 가게 기록</button>');
  if (canEdit(o)) B.push('<button class="b-ghost" id="oEdit">✏️ 수정</button>');
  if (!local && canEdit(o)) B.push('<button class="b-ghost" id="oStoreChg">🏬 ' + bi('가게 바꾸기', 'Change store') + '</button>');
  if (local) B.push('<button class="b-blue" id="oSyncOne">📤 지금 보내기</button>');
  if (local && readOut()[o.id] && readOut()[o.id].err) B.push('<button class="b-ghost" id="oDropLocal" style="color:#991b1b">🗑 이 기록 지우기</button>');
  else if (o.st === 'draft' && o.sm === mySm()) B.push('<button class="b-blue" id="oSend">📤 회사로 보내기</button>');
  if (!local && o.cfReq && !o.cfOk && o.sm === mySm() && o.st !== 'x') B.push('<button class="b-green" id="oCfOk">✅ ' + bi('맞습니다 · 확인', 'Confirm') + '</button>');
  if (B.length) h += '<div class="card"><div class="btns" style="margin-top:0">' + B.join('') + '</div></div>';
  h += '<div class="card"><h2>아이템 ' + lines.length + '줄</h2><input id="oFind" placeholder="이 주문 안에서 찾기" autocomplete="off" style="margin-bottom:6px"><div id="oLines"></div></div>';
  $('page').innerHTML = h;
  const paint = () => {
    const q = $('oFind').value.trim().toUpperCase();
    const rows = q ? lines.filter(l => hasWords(l.c + ' ' + l.d, q)) : lines;
    $('oLines').innerHTML = '<table><tr><th>코드</th><th class="r">수량</th><th class="r">가격</th><th class="r">금액</th></tr>' + rows.slice(0, 2000).map(l =>
      '<tr><td><b>' + esc(l.c) + '</b> <span class="tag t-g">' + esc(l.t || DT()) + '</span><div class="muted" style="font-size:11.5px">' + esc(l.d) + '</div></td><td class="r"><b>' + l.q + '</b>' + (l.pq != null && l.pq !== l.q ? '<div class="muted">픽 ' + l.pq + '</div>' : '') + '</td><td class="r">' + money(l.p) + (l.lp != null && l.lp !== l.p ? '<div class="muted" style="text-decoration:line-through">' + money(l.lp) + '</div>' : '') + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') + '</table>';
  };
  paint(); $('oFind').oninput = debounce(paint, 150);
  $('oBack').onclick = () => Router.go('order');
  if ($('oEdit')) $('oEdit').onclick = () => openEditor(o, null, lines);
  if ($('oStoreChg')) $('oStoreChg').onclick = () => Fulfill.changeStore(o, () => goOrder(o.id));
  if ($('oCfOk')) $('oCfOk').onclick = async () => { busy(true); try { await S.DB.update('orders', o.id, { cfOk: true, cfAt: new Date().toISOString(), cfBy: S.user.email }); toast('✅ 확인했습니다 — 사무실에 표시됩니다', 'good'); goOrder(o.id); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('oStoreI')) $('oStoreI').onclick = () => Store.storeSheet(o.acct);
  if ($('oDropLocal')) $('oDropLocal').onclick = async () => { if (!(await confirmBox('회사로 못 간 이 주문를 폰에서 지울까요? (' + readOut()[o.id].err + ')', '지우기'))) return; const b = readOut(); delete b[o.id]; writeOut(b); Router.go('order'); };
  if ($('oSyncOne')) $('oSyncOne').onclick = async () => { busy(true); const r = await syncOutbox(false); busy(false); if (!r.sent) toast('인터넷이 안 됩니다 — 폰에 그대로 있습니다', 'bad'); else goOrder(o.id); };
  if ($('oSend')) $('oSend').onclick = async () => { const ol = Object.assign({}, o, { st: 'sent', sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); putOut(ol, lines); await syncOutbox(false); goOrder(o.id); };
}
/** 종류별 합계 · 할인 표 */
export function typeSummary(by) {
  const g = Object.values(by); if (!g.length) return '';
  const names = {}; invTypes(S).forEach(t => { names[t.c] = t.n; });
  const tot = g.reduce((a, x) => a + x.total, 0);
  return '<div style="margin-top:8px">' + g.map(x => '<div class="trow"><span class="tb ' + esc(x.t) + '">' + esc(x.t) + '</span><div class="tx"><b>' + esc(names[x.t] || x.t) + '</b><small>' + x.qty + '개 · ' + money(x.sub) + (x.disc ? ' · 할인 ' + x.disc + '% (−' + money(x.sub - x.total) + ')' : '') + '</small></div><span class="ta">' + money(x.total) + '</span></div>').join('') +
    (g.length > 1 ? '<div class="trow sum"><div class="tx"><b>합계 Total</b><small>' + g.reduce((a, x) => a + x.qty, 0) + '개 · 인보이스 ' + g.length + '장</small></div><span class="ta">' + money(tot) + '</span></div>' : '') + '</div>';
}

/* ============================================================
 *  주문 작성 · 수정
 * ============================================================ */
let O = null;   // { id, no, st, sm, acct, store, memo, disc, lines:[{c,d,q,p,lp,t}], view, q, path, createdAt, createdBy, d, pick? }
let IDX = {};
function readWip() { try { const w = JSON.parse(localStorage.getItem(wipKey()) || 'null'); return w && Array.isArray(w.lines) ? w : null; } catch (e) { return null; } }
function clearWip() { try { localStorage.removeItem(wipKey()); } catch (e) {} }
function flushWip() { if (!O) return; try { localStorage.setItem(wipKey(), JSON.stringify(O)); } catch (e) {} }
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
  let h = '<div class="card">' + (O.id ? '<div class="alert a-amb" style="margin:0 0 10px">✏️ ' + esc(O.no) + ' 수정 중 ' + stTag(O.st) + '</div>' : '') + '<h2>' + bi('가게', 'Store') + '</h2>';
  if (O.store) h += '<div class="pick on"><div class="pm"><b>' + esc(O.store) + '</b><small>' + esc(acc ? acc.acct + ' · ' + [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : (O.acct || '계정 없음')) + '</small>' + (acc && acc.note ? '<small>📝 ' + esc(acc.note) + '</small>' : '') + '<small id="eStoreBal"></small></div>' + (O.acct ? '<button class="b-ghost b-sm" id="eStoreI">📋 미수금 · 기록</button>' : '') + '<button class="b-ghost b-sm" id="eStoreX">바꾸기</button></div>';
  else h += '<input id="eStoreQ" placeholder="가게 이름 · 계정코드 · 도시 / Store name · Acct # · City" autocomplete="off"><div class="hits" id="eStoreHits" style="display:none"></div>';
  if (isStaff()) h += '<div class="fg" style="margin-top:8px"><label>세일즈맨 <span class="en">Salesman</span></label>' + sel('eSm', [['', '— 선택 — select —']].concat(S.sms.map(s => [s.code, s.code])), O.sm) + '</div>';
  h += '</div>';
  h += '<div class="seg big"><button class="' + (O.view === 'add' ? 'on' : '') + '" data-ev="add">🛒 ' + bi('주문', 'Order') + '</button><button class="' + (O.view === 'cart' ? 'on' : '') + '" data-ev="cart">✅ ' + bi('주문 확인', 'Review') + ' <span class="cnt" id="eCnt">' + t.n + '</span></button><button class="' + (O.view === 'memo' ? 'on' : '') + '" data-ev="memo">📝 ' + bi('메모', 'Memo') + (O.memo ? ' <span class="cnt">1</span>' : '') + '</button></div>';
  h += '<div id="eBody"></div>';
  const isSentEdit = O.st && O.st !== 'draft';
  /* 아래 고정 바: 가게 이름 · 지금까지 금액(크게) · 종류별(A/P/W) 소계 · 저장
   *  세일즈맨은 저장만 — 하루 치를 주문 목록의 "보낼 주문"에서 한 번에 보냄 (수정 · 추가는 보내기 전까지 자유) */
  h += '<div class="sticky">' + (O.view === 'add' ? '<div id="eQuick"></div>' : '') +
    '<div class="tbar"><div class="tl"><b>' + esc(O.store || '가게를 고르세요') + '</b><small><span id="eN">' + t.n + '</span> lines · <span id="eQ">' + t.qty + '</span> pcs · <span id="eTm">' + typeMini(t.by) + '</span></small></div><div class="ta" id="eA">' + money(t.amt) + '</div></div>' +
    '<div class="btns" style="margin-top:6px">' +
    (!isSentEdit ? '<button class="b-ghost" id="eClose" style="flex:0 0 96px">' + bi('닫기', 'Close') + '</button><button class="b-green" id="eDraft" style="flex:1 1 auto;min-width:0">💾 ' + bi('저장', 'Save') + '</button>' :
      '<button class="b-ghost" id="eQuit">' + bi('닫기', 'Close') + '</button><button class="b-green" id="eSave">💾 ' + bi('저장', 'Save') + '</button>') + '</div></div>';
  $('page').innerHTML = h;
  if ($('eStoreX')) $('eStoreX').onclick = async () => { if (O.lines.length && !(await confirmBox('가게를 바꿀까요? 담은 아이템 ' + O.lines.length + '줄은 그대로 두고 가게만 바뀝니다 (할인은 새 가게 기본으로). / Change store?', '바꾸기'))) return; O.store = ''; O.acct = ''; INFO = null; saveWip(); paintEditor(); };
  if ($('eStoreI')) $('eStoreI').onclick = () => Store.storeSheet(O.acct);
  if (O.acct) loadInfo(O.acct);
  if ($('eStoreQ')) {
    const q = $('eStoreQ'), box = $('eStoreHits');
    q.oninput = () => {
      if (!q.value.trim()) { box.style.display = 'none'; return; }
      const mine = isStaff() ? S.accounts : S.accounts;
      const hits = searchAccounts(mine, q.value, 150);
      box.innerHTML = (hits.total ? '<div class="muted" style="padding:6px 11px;font-size:12px;border-bottom:1px solid var(--line)">' + hits.total + '곳 · ' + (hits.total > hits.length ? hits.length + '곳까지 표시 — 더 자세히 치세요' : '가게를 누르세요 · tap a store') + '</div>' : '') + hits.map(a => '<div data-ac="' + esc(a.acct) + '" style="display:flex;align-items:center;gap:8px"><div style="flex:1;min-width:0"><b>' + esc(accountLabel(a)) + '</b><small>' + esc(a.acct + ' · ' + [a.addr, a.city].filter(Boolean).join(', ') + (a.sm ? ' · ' + a.sm : '')) + '</small></div><button class="b-ghost b-sm" data-ai="' + esc(a.acct) + '">📋</button></div>').join('') || '<div class="muted">찾는 가게가 없습니다</div>';
      box.style.display = 'block'; if (!hits.length) box.innerHTML = '<div class="muted" style="padding:10px">맞는 가게가 없습니다 · no match</div>';
      box.querySelectorAll('[data-ac]').forEach(el => el.onclick = () => pickStore(el.dataset.ac));
      box.querySelectorAll('[data-ai]').forEach(el => el.onclick = e => { e.stopPropagation(); Store.storeSheet(el.dataset.ai, c => pickStore(c, true)); });
    };
  }
  async function pickStore(code, seen) {
        const a = S.accounts.byCode[code]; if (!a) return; O.acct = a.acct; O.store = a.store;
        if (isStaff() && !O.sm && a.sm) O.sm = String(a.sm).toUpperCase();
        O.disc = acctDisc(a);   // 가게 기본 할인으로 시작
        saveWip(); paintEditor();
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
        toast('✓ ' + a.store + ' 선택 · selected', 'good');
        /* 고르자마자 가게 기록 — 받을 돈이 있으면 창으로 보여 주고, 없으면 그냥 넘어감 */
        try {
          const info = await Store.storeInfo(a.acct);
          if (!O || O.acct !== a.acct || seen) return;   // 가게 창에서 "이 가게로 주문" 를 눌러 온 경우는 이미 봤으니 다시 안 띄움
          const over = info.bk[3] + info.bk[4];
          if (info.bal > 0.005) { await Store.storeSheet(a.acct); toast((over > 0.005 ? '⚠️ 60일 넘은 미수 ' + money(over) + ' · ' : '') + '미수금 ' + money(info.bal) + ' — 수금도 챙겨 주세요', over > 0.005 ? 'bad' : ''); }
        } catch (e) {}
  }
  if ($('eSm')) $('eSm').onchange = () => { O.sm = $('eSm').value; saveWip(); };
  document.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { O.view = b.dataset.ev; saveWip(); paintEditor(); });
  if ($('eDraft')) $('eDraft').onclick = () => saveOrder('draft');
  if ($('eClose')) $('eClose').onclick = async () => { if (!(await confirmBox('저장하지 않고 닫을까요? 작성 중인 내용은 폰에 남아 있어 주문 목록에서 이어서 할 수 있습니다. / Close without saving?', '닫기 Close'))) return; saveWip(); Router.go('order'); };
  if ($('eSave')) $('eSave').onclick = () => saveOrder(O.st);
  if ($('eQuit')) $('eQuit').onclick = async () => { if (await confirmBox('저장하지 않고 닫을까요?', '닫기')) { const id = O.id; O = null; clearWip(); if (id) goOrder(id); else Router.go('order'); } };
  if (O.view === 'add') paintAdd(); else if (O.view === 'memo') paintMemo(); else paintCart();
}
/* 📝 메모 탭 — 배송 · 특이사항 · 할인 요청 + 주문 요약 */
function paintMemo() {
  const t = totals(), acc = O.acct && S.accounts.byCode ? S.accounts.byCode[O.acct] : null;
  $('eBody').innerHTML = '<div class="card"><h2>📝 ' + bi('메모', 'Memo') + '</h2><div class="muted">배송 방법 · 특이사항 · 할인 요청 등 사무실에 전할 말 <span class="en">Shipping, special requests, discount asks</span></div>' +
    '<textarea id="eMemo" rows="4" placeholder="예: UPS 로 보내 주세요 / 금요일 전 도착 / 디스플레이 같이" style="margin-top:8px">' + esc(O.memo || '') + '</textarea>' +
    '<div class="chips" style="margin-top:8px">' + ['UPS 배송', '픽업 (가게에서 가져감)', '세일즈맨 직접 배달', '급함 — 먼저 처리', '디스플레이 같이 보내기'].map(x => '<button data-mq="' + esc(x) + '">+ ' + esc(x) + '</button>').join('') + '</div></div>' +
    '<div class="card"><h2>' + bi('주문 요약', 'Summary') + '</h2><div class="pr"><div class="ct"><b>' + esc(O.store || '가게 미선택') + '</b><small>' + esc(acc ? acc.acct + ' · ' + [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : '') + '</small></div></div>' +
    '<div class="kpi"><div><b>' + t.n + '</b><span>줄 lines</span></div><div><b>' + t.qty + '</b><span>수량 pcs</span></div><div><b>' + money(t.amt) + '</b><span>금액 total</span></div><div><b>' + esc(O.sm || '-') + '</b><span>세일즈맨</span></div></div>' + typeSummary(t.by) + '</div>';
  const ta = $('eMemo'); ta.oninput = () => { O.memo = ta.value; saveWip(); };
  document.querySelectorAll('[data-mq]').forEach(b => b.onclick = () => { const v = b.dataset.mq; if ((O.memo || '').includes(v)) return; O.memo = (O.memo ? O.memo.trim() + ' / ' : '') + v; ta.value = O.memo; saveWip(); });
}
function typeMini(by) { const g = Object.values(by || {}); return g.length ? g.map(x => x.t + ' ' + money(x.total)).join(' · ') : ''; }
function refreshTotals() {
  const t = totals();
  if ($('eN')) { $('eN').textContent = t.n; $('eQ').textContent = t.qty; $('eA').textContent = money(t.amt); $('eCnt').textContent = t.n; if ($('eTm')) $('eTm').textContent = typeMini(t.by); }
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
  const el = $('eStoreBal'); if (el) el.innerHTML = (INFO.asOf ? '미수금 <b class="' + (INFO.bal > 0.005 ? 'warn' : 'ok') + '">' + money(INFO.bal) + '</b>' + (INFO.bk[3] + INFO.bk[4] > 0.005 ? ' · 60일+ <b class="warn">' + money(INFO.bk[3] + INFO.bk[4]) + '</b>' : '') : '') + (INFO.orders.length ? ' · 최근 주문 ' + esc(md(INFO.orders[0].d)) + ' ' + money(INFO.orders[0].amt) : '');
  if (O.view === 'add' && VM === 'list') paintResults();
}
/* 빠른 수량 — 마지막에 만진 아이템에 1 · 2 · 3 · 6 · 12 · 24 · 36 · 0 */
let FOCUS = '';
const QUICK = [1, 2, 3, 6, 12, 0];
/* 프리셋(PRE): 수량 버튼을 누르면 켜진 채로 남아, 그 다음부터 카드를 누를 때마다 그 수량이 들어감 (처음 누르면 = 프리셋, 다시 누르면 + 프리셋). 같은 버튼을 다시 누르면 끔. 0 = 고른 아이템 지우기 */
let PRE = (() => { try { return Number(localStorage.getItem('theone.order.pre')) || 0; } catch (e) { return 0; } })();
function setPre(n) { PRE = n; try { localStorage.setItem('theone.order.pre', String(n)); } catch (e) {} document.querySelectorAll('[data-qk]').forEach(b => b.classList.toggle('on', Number(b.dataset.qk) === PRE && PRE > 0)); const w = $('qbarWho'); if (w && !FOCUS) w.textContent = PRE ? '프리셋 ' + PRE + '개 — 카드를 누르면 ' + PRE + '개씩' : '수량 버튼을 누르면 프리셋'; }
function tapQty(c) { const cur = IDX[c] ? IDX[c].q : 0; return PRE > 0 ? (cur ? cur + PRE : PRE) : cur + 1; }
function quickBar() { return '<div class="qbar" id="qbar"><span id="qbarWho">' + (FOCUS ? esc(FOCUS) : PRE ? '프리셋 ' + PRE + '개 — 카드를 누르면 ' + PRE + '개씩' : '수량 버튼을 누르면 프리셋') + '</span>' + QUICK.map(n => '<button data-qk="' + n + '" class="' + (n && n === PRE ? 'on' : '') + '">' + (n ? n : '✕') + '</button>').join('') + '</div>'; }
function setFocus(c) { FOCUS = c; const w = $('qbarWho'); if (w) w.textContent = c + (IDX[c] ? ' · ' + IDX[c].q + '개' : ''); }
function bindQuick(root) {
  root.querySelectorAll('[data-qk]').forEach(b => b.onclick = () => {
    const k = Number(b.dataset.qk);
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    if (k > 0) { setPre(k === PRE ? 0 : k); if (!FOCUS) return; }
    else if (!FOCUS) return setPre(0);
    const n = setQty(FOCUS, k); setFocus(FOCUS);
    const inp = document.querySelector('[data-qi="' + CSS.escape(FOCUS) + '"]'); if (inp) { inp.value = n || ''; markRow($('eRes') || $('eCart'), FOCUS, n); }
    refreshCard(FOCUS);
  });
}

/* ---- 담기: 사진 카드(누르면 1개) · 목록 · 검색 · 스캔 · 카테고리 ---- */
const VM_KEY = 'theone.order.view';
let VM = (() => { try { return localStorage.getItem(VM_KEY) || 'grid'; } catch (e) { return 'grid'; } })();
let PAGE = 60, LAST = [];
function paintAdd() {
  const T = treeFor(S);
  let node = T; O.path.forEach(p => { node = (node && node.map[p]) || null; });
  if (!node) { O.path = []; node = T; }
  const crumbs = '<div class="chips crumbs">' + (O.path.length ? '<button class="up" data-cp="' + (O.path.length - 1) + '">‹ ' + bi('상위', 'Up') + '</button>' : '') + '<button class="' + (O.path.length ? '' : 'on') + '" data-cp="0">' + bi('전체', 'All') + '</button>' + O.path.map((p, i) => '<button class="' + (i === O.path.length - 1 ? 'on' : '') + '" data-cp="' + (i + 1) + '">' + esc(cleanName(p)) + '</button>').join('') + '</div>';
  const popN = popularItems(O.path, catStart(S), INFO && INFO.hist, 300).length;
  const popTile = popN ? '<button class="pop' + (O.pop ? ' on' : '') + '" data-pop="1"><b>✨ 자주 나가는 <span class="en">Popular</span></b><span>' + (INFO && Object.keys(INFO.hist).length ? '이 가게 최근 구매 + 많이 나가는 순 · recent + best sellers' : '많이 나가는 순 · best sellers') + ' · ' + popN + '</span></button>' : '';
  const kids = node.kids.length || popTile ? '<div class="cats">' + popTile + node.kids.map(k => '<button data-ck="' + esc(k.name) + '"><b>' + esc(cleanName(k.name)) + '</b><span>' + k.n + '</span></button>').join('') + '</div>' : '';
  /* 검색 + 분류 경로는 카드 밖 sticky — 아래로 아무리 내려가도 맨 위에 붙어 있어 바로 상위로 돌아감 */
  $('eBody').innerHTML = '<div class="ordtop"><div style="display:flex;gap:6px"><input id="eQ1" placeholder="코드 · 이름 · 바코드 / Code · Name · Barcode" autocomplete="off" autocapitalize="characters" enterkeyhint="done" value="' + esc(O.q) + '" style="flex:1">' +
    '<button class="b-ghost ib" id="eVM" title="보기 바꾸기">' + (VM === 'grid' ? '☰' : '▦') + '</button><button class="b-ghost ib" id="eShow" title="손님 보기">🖼</button></div>' + crumbs + '</div>' +
    '<div class="card">' + kids + '<div id="eRes"></div></div>';
  const sb = $('eQuick'); if (sb) { sb.innerHTML = quickBar(); bindQuick(sb); }
  const q = $('eQ1');
  const run = () => { if (!O || !$('eQ1')) return; O.q = q.value; PAGE = 60; paintResults(); };
  q.oninput = debounce(run, 160);
  q.onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const it = exactItem(q.value);
    if (it && it.h && !isStaff()) { toast('🙈 지금은 주문할 수 없는 아이템입니다 (단종 · 재입고 지연) — 담당자에게 문의 · Not available', 'bad'); return; }
    if (it) { if (it.h) toast('🙈 숨김 아이템을 담았습니다 (담당자 전용)'); const n = setQty(it.c, tapQty(it.c)); toast(it.c + ' → ' + n + '개', 'good'); q.value = ''; O.q = ''; paintResults(); }
    else { run(); toast('정확히 맞는 코드가 없습니다 — 아래에서 고르세요', 'bad'); }
  };
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { O.path = O.path.slice(0, Number(b.dataset.cp)); O.pop = false; O.all = false; PAGE = 60; paintAdd(); });
  document.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { O.path = O.path.concat([b.dataset.ck]); O.pop = false; O.all = false; PAGE = 60; paintAdd(); });
  const pt = document.querySelector('[data-pop]'); if (pt) pt.onclick = () => { O.pop = !O.pop; PAGE = 60; paintAdd(); };
  $('eVM').onclick = () => { VM = VM === 'grid' ? 'list' : 'grid'; try { localStorage.setItem(VM_KEY, VM); } catch (e) {} paintAdd(); };
  $('eShow').onclick = () => showMode(LAST, 0);
  paintResults();
  if (!('ontouchstart' in window)) q.focus();
}
function itemRow(it) {
  const cur = IDX[it.c] ? IDX[it.c].q : 0;
  const t = typeOfItem(S, it), dc = Number((O.disc || {})[t]) || 0, hist = Store.histText(INFO, it.c), lp = Store.lastPrice(INFO, it.c);
  return '<div class="pr irow' + (cur ? ' v' : '') + (FOCUS === it.c ? ' foc' : '') + '" data-row="' + esc(it.c) + '" data-frow="' + esc(it.c) + '">' +
    (it.ph ? '<img src="' + esc(thumb(it.ph)) + '" loading="lazy" alt="" class="ith" data-big="' + esc(it.c) + '" onerror="this.removeAttribute(\'src\')">' : '<div class="ith" data-big="' + esc(it.c) + '"></div>') +
    '<div class="ct"><b>' + esc(it.c) + (it.k ? ' <span class="tag t-a" data-kit="' + esc(it.c) + '">🧩 세트 ' + it.k.length + '종 · 구성 보기</span>' : '') + '</b><small class="desc">' + esc(it.k ? (it.kn || it.d) : it.d) + '</small>' + (it.k ? '<small>' + esc(kitLine(it)) + '</small>' : '') +
    '<small><b>' + money(it.p) + '</b>' + (dc ? ' → 할인가 ' + money(it.p * (1 - dc / 100)) : '') + (lp != null && Math.abs(lp - it.p) > 0.001 ? ' · 지난번 ' + money(lp) : '') + (it.s ? ' · SRP ' + money(it.s) : '') + '</small>' +
    (hist ? '<small class="hist">🕘 ' + esc(hist) + '</small>' : '') + '</div>' +
    qtyBox(it.c, cur) + '</div>';
}
/** 사진 카드 — 누르면 1개 담김, 숫자를 누르면 수량 입력, − 로 빼기 */
/** 세트 사진이 없을 때 — 구성품 사진 4장 모자이크 (세트라는 표시와 함께) */
function kitMosaic(it) {
  const C = catalog(); const ph = it.k.map(x => C.byCode[x[0]]).filter(x => x && x.ph).slice(0, 4);
  if (!ph.length) return '<span>🧩 ' + esc(it.c.substring(0, 8)) + '</span>';
  return '<div class="mosaic m' + ph.length + '">' + ph.map(x => '<img src="' + esc(thumb(x.ph, 160)) + '" loading="lazy" alt="" onerror="this.style.visibility=\'hidden\'">').join('') + '</div>';
}
/** 세트 구성 한 줄 — "14KCHN01×6 · 14KCHN02×6 · …" */
function kitLine(it) { return it.k.slice(0, 3).map(x => x[0] + '×' + x[1]).join(' · ') + (it.k.length > 3 ? ' 외 ' + (it.k.length - 3) + '종' : ''); }
function itemCard(it) {
  const cur = IDX[it.c] ? IDX[it.c].q : 0;
  const name = it.k ? (it.kn || it.d) : it.d;
  return '<div class="gcard' + (cur ? ' on' : '') + (it.k ? ' kit' : '') + '" data-gc="' + esc(it.c) + '" data-ph="' + esc(it.ph || '') + '">' +
    '<div class="gimg">' + (it.ph ? '<img src="' + esc(thumb(it.ph, 300)) + '" loading="lazy" alt="" onerror="this.outerHTML=\'<span>' + esc(it.c.substring(0, 6)) + '</span>\'">' : it.k ? kitMosaic(it) : '<span>' + esc(it.c.substring(0, 6)) + '</span>') + '</div>' +
    (it.k ? '<span class="gkit" data-kit="' + esc(it.c) + '">🧩 세트 ' + it.k.length + '종 · 구성 보기</span>' : '') +
    '<span class="gq" data-gq="' + esc(it.c) + '">' + (cur || '') + '</span>' + (cur ? '<button class="gm" data-gm="' + esc(it.c) + '">−</button>' : '') +
    '<div class="gt"><b>' + esc(it.c) + '</b><small>' + esc(name) + '</small>' + (it.k ? '<em>' + esc(kitLine(it)) + '</em>' : '') + '<span>' + money(it.p) + '</span></div></div>';
}
const qtyBox = (c, v) => '<div class="qty"><button data-dq="' + esc(c) + '" data-d="-1">−</button><input type="number" inputmode="numeric" min="0" data-qi="' + esc(c) + '" value="' + (v || '') + '" placeholder="0"><button data-dq="' + esc(c) + '" data-d="1">＋</button></div>';
function paintResults() {
  if (!O || !$('eRes')) return;
  const pop = O.pop && !O.q;
  /* 분류를 끝까지(하위가 없을 때까지) 누르기 전에는 아이템을 펼치지 않음 — 검색 · ✨ · "모두 보기" 는 예외 */
  const T = treeFor(S); let nd = T; O.path.forEach(p => { nd = (nd && nd.map[p]) || null; });
  const branch = nd && nd.kids.length > 0;
  if (!pop && !O.q && branch && !O.all) {
    $('eRes').innerHTML = '<div class="muted" style="margin:8px 0;text-align:center">' + (O.path.length ? '분류를 하나 더 고르거나 <button class="b-ghost b-sm" id="eAll">이 분류 전체 ' + nd.n.toLocaleString() + '개 보기</button>' : '위에서 분류를 고르거나 코드 · 이름으로 검색하세요 <span class="en">Pick a category or search</span>') + '</div>';
    if ($('eAll')) $('eAll').onclick = () => { O.all = true; paintResults(); };
    LAST = [];
    return;
  }
  const all = pop ? popularItems(O.path, catStart(S), INFO && INFO.hist, 300) : searchItems(O.q, O.path, 5000, catStart(S));
  LAST = all;
  const res = all.slice(0, PAGE);
  const head = '<div class="muted" style="margin:6px 0">' + (pop ? '✨ ' + (all.nStore ? '이 가게가 최근에 산 ' + all.nStore + '개 먼저, 그 다음 ' : '') + '많이 나가는 순 · ' + all.length + '개' : O.q || O.path.length ? all.length.toLocaleString() + '개 (코드 순)' : '전체 ' + catalog().items.length.toLocaleString() + '개 — 카테고리를 고르거나 검색하세요 <span class="en">Pick a category or search</span>') + '</div>';
  $('eRes').innerHTML = head + (res.length ? (VM === 'grid' ? '<div class="grid">' + res.map(itemCard).join('') + '</div>' : res.map(itemRow).join('')) +
    (all.length > res.length ? '<button class="b-ghost" id="eMore" style="margin-top:8px">더 보기 (' + (all.length - res.length).toLocaleString() + '개 남음)</button>' : '') : '<div class="none">' + bt('찾는 아이템이 없습니다', 'No items found') + (isStaff() && O.q ? '<br><a href="#/items/' + encodeURIComponent(O.q.trim()) + '">🏷 ＋ 새 아이템으로 등록 · Register as new item</a>' : '') + '</div>');
  const root = $('eRes');
  bindQty(root);
  if ($('eMore')) $('eMore').onclick = () => { PAGE += 60; paintResults(); };
  root.querySelectorAll('[data-big]').forEach(el => el.onclick = () => { const i = LAST.findIndex(x => x.c === el.dataset.big); showMode(LAST, Math.max(0, i)); });
  /* 목록 보기에서 줄(이름 · 사진)을 누르면 카드처럼 담김 (프리셋 적용) */
  root.querySelectorAll('[data-frow] .ct').forEach(el => el.onclick = () => { const r = el.closest('[data-frow]'), c = r.dataset.frow; root.querySelectorAll('.foc').forEach(x => x.classList.remove('foc')); r.classList.add('foc'); const n = setQty(c, tapQty(c)); const inp = root.querySelector('[data-qi="' + CSS.escape(c) + '"]'); if (inp) inp.value = n || ''; markRow(root, c, n); setFocus(c); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} });
  root.querySelectorAll('[data-kit]').forEach(el => el.onclick = e => { e.stopPropagation(); kitSheet(catalog().byCode[el.dataset.kit]); });
  root.querySelectorAll('[data-gm]').forEach(b => b.onclick = e => { e.stopPropagation(); const c = b.dataset.gm; setQty(c, (IDX[c] ? IDX[c].q : 0) - 1); refreshCard(c); });
  root.querySelectorAll('[data-gq]').forEach(b => b.onclick = e => { if (!b.textContent) return; e.stopPropagation(); qtyPad(b.dataset.gq); });
  root.querySelectorAll('[data-gc]').forEach(el => {
    let t = null, long = false;
    el.addEventListener('pointerdown', () => { long = false; t = setTimeout(() => { long = true; qtyPad(el.dataset.gc); }, 550); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
    el.onclick = () => { if (long) return; const c = el.dataset.gc; setQty(c, tapQty(c)); refreshCard(c); setFocus(c); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
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
    '<div class="chips" style="justify-content:center">' + [1, 2, 3, 6, 12, 24].map(n => '<button data-qp="' + n + '" style="min-width:48px;font-size:15px">' + n + '</button>').join('') + '</div><div class="muted" style="text-align:center">그 밖의 수량은 위 칸에 직접 입력 · or type a quantity</div>' +
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
  openModal('<h2>🧩 ' + esc(it.c) + '</h2><div style="font-weight:800;font-size:16px">' + esc(it.kn || it.d) + '</div><div class="muted">' + money(it.p) + ' · ' + it.k.length + '종 ' + pcs + '개' + (it.old ? ' · 기존 코드 ' + esc(it.old) : '') + (it.kst ? ' · ' + esc(it.kst) : '') + '</div>' +
    '<div class="kitg">' + it.k.map(x => { const c = C.byCode[x[0]]; return '<div><div class="gimg">' + (c && c.ph ? '<img src="' + esc(thumb(c.ph, 200)) + '" loading="lazy">' : '<span>' + esc(x[0]) + '</span>') + '</div><b>' + esc(x[0]) + ' × ' + x[1] + '</b><small>' + esc(c ? c.d : '목록에 없음') + '</small></div>'; }).join('') + '</div>' +
    '<div class="btns"><button class="b-ghost" id="kAll">풀어서 하나씩 담기</button><button class="b-blue" id="kSet">세트로 1개 담기</button></div>');
  $('kSet').onclick = () => { setQty(it.c, (IDX[it.c] ? IDX[it.c].q : 0) + 1); closeModal(); if (O.view === 'add') paintResults(); toast(it.c + ' 세트 담음', 'good'); };
  $('kAll').onclick = () => { addKitItems(it, 1); closeModal(); if (O.view === 'add') paintResults(); toast(it.k.length + '종 담음 — 주문에서 수량을 고칠 수 있습니다', 'good'); };
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
    const d = Number(b.dataset.d), cur = IDX[c] ? IDX[c].q : 0;
    const n = setQty(c, d > 0 ? tapQty(c) : cur - 1);   // ＋ 는 프리셋(있으면) 만큼, − 는 1개
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    if (inp) inp.value = n || ''; markRow(root, c, n); setFocus(c);
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
    '<div class="alert a-blu" style="margin:0 0 8px">💾 ' + bi('다 담았으면 아래 저장. 보내기는 주문 목록의 "주문 확인 · 보낼 주문"에서 확인한 뒤 한 번에.', 'Save when done; send from "Review & send" in the order list.') + '</div><div class="muted" style="margin-top:8px">🧾 ' + bi('인보이스 미리보기 — 픽킹이 끝난 뒤 확정할 때 종류(A · P · W)별로 따로 번호가 납니다', 'Invoice preview — split into A / P / W after picking') + '</div><div id="eTypes"></div>' + (O.lines.length > 15 ? '<input id="eF" placeholder="주문 안에서 찾기" autocomplete="off" style="margin:8px 0 6px">' : '') + '<div id="eCart"></div>' +
    (O.memo ? '<div class="alert a-blu" style="margin-top:10px">📝 ' + esc(O.memo) + '</div>' : '') + '</div>';
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
  if ($('eMemo')) $('eMemo').oninput = () => { O.memo = $('eMemo').value; saveWip(); };
}

/** 주문 문서 만들기 (목록용 요약 포함) */
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
  if (st === 'sent' && O.st === 'draft' && !(await confirmBox(O.store + ' — ' + O.lines.length + '줄 · ' + money(t.amt) + ' 주문를 보낼까요? / Send this order?', '보내기 Send'))) return;
  if (st !== 'sent' && !(await confirmBox(O.store + ' — ' + O.lines.length + '줄 · ' + t.qty + '개 · ' + money(t.amt) + '\n저장할까요? (보내기는 주문 목록의 "보낼 주문"에서) / Save this order?', '저장 Save'))) return;
  const now = new Date().toISOString();
  if (!O.id) { O.no = newNo(); O.id = O.no; }
  const base = { id: O.id, no: O.no, d: O.d || today(), ym: ym(O.d || today()), sm: O.sm, acct: O.acct || '', store: O.store, st, memo: O.memo || '', updatedAt: now,
    createdBy: O.createdBy || S.user.email, createdAt: O.createdAt || now, catVer: catalog().ver || '' };
  if (st === 'sent') base.sentAt = O.sentAt || now;
  const lines = O.lines.map(l => { const x = { c: l.c, d: l.d, q: l.q, p: l.p, lp: l.lp != null ? l.lp : l.p, t: l.t || DT() }; if (l.pq != null) x.pq = l.pq; if (l.note) x.note = l.note; if (l.kit) x.kit = l.kit; return x; });
  /* 매니저가 이미 처리 중인 주문 — 상태 · 픽킹 기록은 그대로 두고 바로 저장 */
  if (isStaff() && O.st !== 'draft' && O.st !== 'sent') {
    busy(true);
    try {
      const old = await S.DB.get('orders', O.id); if (old && !canEdit(old)) throw new Error('이미 인보이스가 확정된 주문입니다');
      const doc = orderDoc(Object.assign({}, old || {}, base, { st: old ? old.st : st }), lines, O.disc);
      await S.DB.batch([{ op: 'set', col: 'orders', id: O.id, data: doc }, { op: 'set', col: 'orderLines', id: O.id, data: { sm: O.sm, lines } }]);
      const id = O.id; O = null; clearWip(); toast('저장했습니다', 'good'); goOrder(id);
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false); return;
  }
  /* 세일즈맨 · 새 주문 — 폰의 보낼 함에 먼저 넣고(사라지지 않게) 전송 */
  try { putOut(orderDoc(base, lines, O.disc), lines); } catch (e) { return toast(e.message, 'bad'); }
  const id = O.id; O = null; clearWip();
  busy(true); const r = await syncOutbox(true); busy(false);
  const left = !!readOut()[id];
  toast(left ? '📱 폰에 저장했습니다 — 인터넷이 되면 자동으로 보냅니다' : (st === 'sent' ? '보냈습니다 📤' : '저장했습니다 — 수정 · 추가는 보내기 전까지 자유, 하루 치는 "보낼 주문"에서 한 번에 보냅니다'), left ? '' : 'good');
  /* 저장 뒤에는 주문 목록의 "주문 확인 · 보낼 주문" 로 — 거기서 받은 주문를 훑어보고 회사로 보냄 */
  if (isStaff()) { LF.list = true; LF.st = 'draft'; }
  Router.go('order');
}
