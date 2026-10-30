/* ============================================================
 *  🔔 주문 확인 · 알림
 *    · 세일즈맨 기본 확인 = 그날 보낸 주문 한 번에: 몇 건 · 어디 · 대략 금액 · 내가 보낸 것이 맞는지 → ✅ 모두 맞습니다 (cfOk, cfHow: 'day')
 *      맞지 않는 주문은 ⚠️ 문제 있음 → 메모 (cfIssue · cfIssueOpen) → 매니저에게 알림
 *    · 자세한 확인은 매니저가 주문을 처리하면서 ❓ 확인 요청 (질문 적기: cfNote) — 그 주문만 따로
 *    · 알림: 앱이 열려 있으면 바로 (실시간 보기 · 소리 · 진동 · 위 띠 · 아래 메뉴 숫자 · 폰 알림),
 *            이메일 · 구글 챗은 notifyq → apps-script/Code.gs 가 5분마다 보냄
 *  notifyq/{id} = { kind: cfreq|issue|ask, toSm, toStaff, subject, text, url, chat, st: 'wait', by, at }
 * ============================================================ */
import { $, esc, money, toast, busy, openModal, closeModal, confirmBox, bi, bt, today, localDay, md, Router, goHash } from './ui.js';
import { newId } from './db.js';

let S = null, STOP = [], SEEN = { req: -1, iss: -1 };
export function register(state) { S = state; }
const mySm = () => String((S.me && S.me.sm) || '').toUpperCase();
const isSales = () => S.role === 'salesman';
const ymOf = d => d.substring(0, 7);
const prevYm = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
export const appUrl = h => location.origin + location.pathname.replace(/test\/demo\.html$/, '') + '#/' + h;

/* ---------- 이메일 · 구글 챗 보내기 (Apps Script 가 5분마다) ---------- */
export async function queue(n) {
  try { const id = newId('N'); await S.DB.set('notifyq', id, Object.assign({ id, st: 'wait', by: String(S.user.email || '').toLowerCase(), byName: (S.me && S.me.name) || S.user.name || '', at: new Date().toISOString() }, n)); return true; }
  catch (e) { console.warn('notifyq', e); return false; }
}

/* ---------- 소리 · 진동 · 위 띠 · 폰 알림 ---------- */
let AC = null;
export function beep() {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = AC.currentTime;
    [[880, 0], [1175, 0.18], [880, 0.42], [1175, 0.6]].forEach(([f, d]) => { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.16); o.connect(g); g.connect(AC.destination); o.start(t0 + d); o.stop(t0 + d + 0.18); });
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([220, 120, 220]); } catch (e) {}
}
/* 처음 화면을 누를 때 소리 장치를 깨워 둠 (폰 브라우저는 사람이 누르기 전에는 소리를 막음) */
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} }, { once: true, passive: true });

function bar(id, html, onTap) {
  let b = document.getElementById(id);
  if (!html) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('button'); b.id = id; b.className = 'cfbar'; document.body.appendChild(b); }
  b.innerHTML = html; b.onclick = onTap;
}
function badge(n) {
  const btn = document.querySelector('#nav [data-go="order"]');
  if (btn) { let s = btn.querySelector('.nbadge'); if (n && !s) { s = document.createElement('span'); s.className = 'nbadge'; btn.appendChild(s); } if (s) { if (n) s.textContent = n; else s.remove(); } }
  document.title = (n ? '(' + n + ') ' : '') + 'THE ONE';
}
async function phone(title, body, url) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (r) r.showNotification(title, { body, tag: 'theone-' + title, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', data: { url } });
    else new Notification(title, { body, icon: 'icon-192.png' });
  } catch (e) {}
}
export const notifyState = () => !('Notification' in window) ? 'none' : Notification.permission;
export async function askPermission() {
  if (!('Notification' in window)) return toast(bt('이 기기는 알림을 쓸 수 없습니다 — 아이폰은 홈 화면에 앱으로 설치한 뒤 가능', 'Notifications not available — on iPhone, install the app to the home screen first'), 'bad');
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? '🔔 ' + bt('알림을 켰습니다', 'Notifications on') : bt('알림이 꺼져 있습니다 — 브라우저 설정에서 허용하세요', 'Notifications blocked — allow them in browser settings'), p === 'granted' ? 'good' : 'bad');
  return p;
}

/* ---------- 로그인 뒤: 실시간 보기 시작 ---------- */
export function start() {
  STOP.forEach(f => { try { f(); } catch (e) {} }); STOP = []; SEEN = { req: -1, iss: -1 };
  if (!S || !S.DB || !S.DB.watch) return;
  if (isSales() && mySm()) {
    /* 내 주문 (이번 달 · 지난달) — 사무실 확인 요청이 새로 오면 알림 */
    STOP.push(S.DB.watch('orders', { where: [['sm', '==', mySm()], ['ym', 'in', [ymOf(today()), prevYm()]]] }, rows => {
      const req = rows.filter(o => o.cfReq && !o.cfOk && o.st !== 'x'), day = dayPending(rows);
      const n = req.length + (day.length ? 1 : 0);
      badge(n);
      bar('cfBarS', req.length ? '❓ ' + bt('사무실 확인 요청', 'Office asks you to confirm') + ' <b>' + req.length + '</b>' + bt('건', '') + ' — <u>' + bt('보기', 'view') + '</u>' : '', () => { goHash('#/order/cf'); });
      if (SEEN.req >= 0 && req.length > SEEN.req) { beep(); toast('❓ ' + bt('사무실에서 주문 확인을 요청했습니다', 'The office asked you to confirm an order'), 'bad'); phone('❓ ' + bt('주문 확인 요청', 'Order check requested'), req.map(o => o.store).slice(0, 3).join(', '), appUrl('order/cf')); }
      SEEN.req = req.length;
    }));
  }
  if (!isSales()) {
    /* 매니저: 세일즈맨이 ⚠️ 문제 있음 / 확인 요청에 답하면 */
    STOP.push(S.DB.watch('orders', { where: [['cfIssueOpen', '==', true]] }, rows => {
      bar('cfBarM', rows.length ? '⚠️ ' + bt('세일즈맨이 알린 주문 문제', 'Salesman flagged orders') + ' <b>' + rows.length + '</b>' + bt('건', '') + ' — <u>' + bt('보기', 'view') + '</u>' : '', () => { goHash('#/order/' + rows[0].id); });
      if (SEEN.iss >= 0 && rows.length > SEEN.iss) { beep(); toast('⚠️ ' + bt('세일즈맨이 주문 문제를 알렸습니다', 'A salesman flagged an order'), 'bad'); phone('⚠️ ' + bt('주문 문제', 'Order issue'), rows.map(o => o.store + ' · ' + (o.cfIssue || '')).slice(0, 2).join(' / '), appUrl('order/' + rows[0].id)); }
      SEEN.iss = rows.length;
    }));
  }
}

/* ---------- 세일즈맨: 오늘 보낸 주문 한 번에 확인 ---------- */
/** 아직 확인 안 한 보낸 주문 (최근 4일) — 사무실이 따로 확인 요청한 것은 그 주문에서 */
function dayPending(rows) {
  const from = (() => { const d = new Date(); d.setDate(d.getDate() - 4); return localDay(d.toISOString()); })();
  return rows.filter(o => o.sentAt && !['draft', 'x', 'local'].includes(o.st) && !o.cfOk && !o.cfReq && !o.cfIssueOpen && localDay(o.sentAt) >= from)
    .sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
}
/** el 안에 "오늘 보낸 주문 확인" 카드 (없으면 비움) */
export async function dayCard(el) {
  if (!el || !isSales()) return;
  let rows = [];
  try { rows = await S.DB.list('orders', { where: [['sm', '==', mySm()], ['ym', 'in', [ymOf(today()), prevYm()]]] }); } catch (e) { el.innerHTML = ''; return; }
  const L = dayPending(rows), REQ = reqPending(rows);
  /* ❓ 사무실이 따로 확인 요청한 주문 — 검토 화면(아이템까지 전체)으로 */
  const reqBox = REQ.length ? '<div class="alert a-amb tap" id="dcReq" style="margin:0 0 10px;border:2px solid #f59e0b"><b>❓ ' + bt('사무실 확인 요청', 'The office asks you to confirm') + ' ' + REQ.length + bt('건', '') + ' · ' + money(REQ.reduce((a, o) => a + (Number(o.amt) || 0), 0)) + '</b><div class="muted" style="font-size:12.5px">' + esc(REQ.map(o => o.store).slice(0, 4).join(' · ')) + (REQ.length > 4 ? ' …' : '') + '</div><div style="margin-top:4px"><b>' + bt('전체 주문 보고 확인하기 ›', 'Review all orders ›') + '</b></div></div>' : '';
  let rq = $('reqCf'); if (!rq) { el.insertAdjacentHTML('beforebegin', '<div id="reqCf"></div>'); rq = $('reqCf'); }   // ❓ 카드는 📋 카드 위에 따로
  rq.innerHTML = reqBox; if ($('dcReq')) $('dcReq').onclick = () => Router.go('order', 'cf');
  if (!L.length) { el.innerHTML = ''; return; }
  const by = {}; L.forEach(o => { const d = localDay(o.sentAt); (by[d] = by[d] || []).push(o); });
  const tot = L.reduce((a, o) => a + (Number(o.amt) || 0), 0);
  el.innerHTML = '<div class="card" style="border:2px solid #93c5fd"><h2>📋 ' + bi('보낸 주문 확인', 'Confirm the orders you sent') + ' <span class="tag t-b">' + L.length + bt('건', '') + ' · ' + money(tot) + '</span></h2>' +
    '<div class="muted">' + bt('내가 보낸 주문이 맞는지만 보세요 — 몇 건 · 어느 가게 · 대략 금액. 맞으면 아래 ✅ 한 번. 아닌 주문은 ⚠️ 를 눌러 알려 주세요. 자세한 것은 사무실이 필요할 때 따로 물어봅니다.', 'Just check these are the orders you sent — how many, which stores, roughly how much. If right, tap ✅ once. Flag any wrong one with ⚠️. The office asks separately when it needs details.') + '</div>' +
    Object.keys(by).sort().map(d => { const X = by[d]; return '<div class="iday"><b>' + (d === today() ? bt('오늘', 'Today') + ' ' : '') + esc(md(d)) + '</b><span>' + X.length + bt('건', '') + ' · ' + money(X.reduce((a, o) => a + (Number(o.amt) || 0), 0)) + '</span></div>' +
      X.map(o => '<div class="pr"><div class="ct tap" data-dco="' + esc(o.id) + '"><b>' + esc(o.store || '') + '</b><small>' + esc(o.acct || '') + ' · ' + (o.n || 0) + bt('줄', ' lines') + ' · ' + (o.qty || 0) + bt('개', ' pcs') + ' · ' + esc(o.no || '') + '</small></div><div class="pa"><b>' + money(o.amt) + '</b><button class="b-ghost b-sm" data-dci="' + esc(o.id) + '" style="margin-top:4px">⚠️</button></div></div>').join(''); }).join('') +
    '<button class="b-green" id="dcAll" style="margin-top:10px;padding:14px">✅ ' + bt('모두 맞습니다', 'All correct') + ' (' + L.length + bt('건', '') + ' · ' + money(tot) + ')</button></div>';
  el.querySelectorAll('[data-dco]').forEach(x => x.onclick = () => { goHash('#/order/' + x.dataset.dco); });
  el.querySelectorAll('[data-dci]').forEach(x => x.onclick = () => issueForm(L.find(o => o.id === x.dataset.dci), () => dayCard(el)));
  $('dcAll').onclick = async () => {
    if (!(await confirmBox(bt(L.length + '건 · ' + money(tot) + ' — 모두 내가 보낸 주문이 맞습니까?', 'Confirm all ' + L.length + ' orders (' + money(tot) + ')?'), bt('✅ 맞습니다', '✅ Confirm')))) return;
    busy(true);
    try { const now = new Date().toISOString(); await S.DB.batch(L.map(o => ({ op: 'update', col: 'orders', id: o.id, data: { cfOk: true, cfAt: now, cfBy: S.user.email, cfHow: 'day' } }))); toast('✅ ' + L.length + bt('건 확인했습니다 — 사무실에 표시됩니다', ' confirmed — the office sees it'), 'good'); dayCard(el); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 사무실이 따로 확인 요청한 주문 (아직 답 전) */
const reqPending = rows => rows.filter(o => o.cfReq && !o.cfOk && o.st !== 'x' && o.st !== 'draft').sort((a, b) => String(a.cfReqAt || a.sentAt || '').localeCompare(String(b.cfReqAt || b.sentAt || '')));

/* ---------- 매니저 → 세일즈맨: ❓ 주문 확인 요청 (여러 건 · 세일즈맨별로 알림 한 번) ---------- */
/** orders[] 에 cfReq 를 걸고, 세일즈맨마다 알림(앱 · 이메일 · 구글 챗) 하나씩. note 는 모든 주문에 같은 질문 */
export async function requestConfirm(list, note) {
  const now = new Date().toISOString();
  await S.DB.batch(list.map(o => ({ op: 'update', col: 'orders', id: o.id, data: Object.assign({ cfReq: true, cfReqAt: now, cfReqBy: S.user.email, cfOk: false }, note ? { cfNote: note } : {}) })));
  const by = {}; list.forEach(o => { (by[o.sm || ''] = by[o.sm || ''] || []).push(o); });
  for (const sm of Object.keys(by)) {
    const L = by[sm], tot = L.reduce((a, o) => a + (Number(o.amt) || 0), 0);
    await queue({ kind: 'cfreq', toSm: sm, chat: true, orderId: L.length === 1 ? L[0].id : '', subject: '[THE ONE] ❓ 주문 확인 요청 ' + L.length + '건 — ' + sm,
      text: '❓ ' + sm + ' 주문 ' + L.length + '건 · ' + money(tot) + ' 확인 요청\n' + L.map(o => '· ' + o.store + ' (' + (o.no || o.id) + ', ' + money(o.amt) + ')').join('\n') + (note ? '\n' + note : '') + '\n앱에서 전체 주문을 보고 ✅ 확인해 주세요.', url: appUrl('order/cf') });
  }
}

/* ---------- 세일즈맨: ❓ 확인 요청 받은 주문 전체 검토 화면 (#/order/cf) ---------- */
/** 요청받은 주문을 아이템까지 한 화면에 — 주문마다 ✅ · ⚠️ · ✏️, 맨 아래 ✅ 전체 확인 */
export async function reviewPage() {
  const el = $('page'); if (!el) return;
  el.innerHTML = '<div class="load">' + bt('확인 요청 읽는 중…', 'Loading…') + '</div>';
  let rows = [];
  try { rows = await S.DB.list('orders', { where: [['sm', '==', mySm()], ['ym', 'in', [ymOf(today()), prevYm()]]] }); } catch (e) { el.innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  const REQ = reqPending(rows);
  const head = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h2 style="margin:0">❓ ' + bi('사무실 확인 요청', 'Office asks you to confirm') + ' <span class="tag t-a">' + REQ.length + bt('건', '') + '</span></h2><button class="b-ghost b-sm" id="rvBack">‹ ' + bt('홈', 'Home') + '</button></div>' +
    (REQ.length ? '<div class="muted" style="margin-top:6px">' + bt('사무실이 작업 배정 전에 이 주문들이 맞는지 묻습니다. 주문마다 가게 · 아이템 · 수량 · 가격을 보고, 전부 맞으면 맨 아래 ✅ 한 번. 다른 주문은 ⚠️ 로 알리거나 ✏️ 로 고치세요.', 'Before assigning picking, the office asks you to check these orders. Review store · items · qty · price. If all correct, tap ✅ once at the bottom; flag a wrong one with ⚠️ or fix it with ✏️.') + '</div>' : '<div class="none">' + bt('확인 요청이 없습니다', 'No pending requests') + '</div>') + '</div>';
  el.innerHTML = head + (REQ.length ? '<div id="rvList">' + REQ.map(o => '<div class="card" data-rvo="' + esc(o.id) + '"><div style="display:flex;justify-content:space-between;gap:8px"><div><b style="font-size:16px">' + esc(o.store) + '</b><div class="muted">' + esc([o.acct, o.no, md(o.d)].filter(Boolean).join(' · ')) + ' · ' + (o.n || 0) + bt('줄', ' lines') + ' · ' + (o.qty || 0) + bt('개', ' pcs') + '</div>' + (o.cfNote ? '<div class="alert a-amb" style="margin:6px 0 0">💬 ' + esc(o.cfNote) + '</div>' : '') + (o.memo ? '<div class="muted">📝 ' + esc(o.memo) + '</div>' : '') + '</div><div style="text-align:right"><b style="font-size:16px">' + money(o.amt) + '</b></div></div><div class="rvl muted" style="margin-top:6px">' + bt('아이템 읽는 중…', 'Loading items…') + '</div>' +
      '<div class="btns" style="margin-top:8px;flex-wrap:wrap"><button class="b-ghost b-sm" data-rve="' + esc(o.id) + '">✏️ ' + bt('수정', 'Edit') + '</button><button class="b-ghost b-sm" data-rvi="' + esc(o.id) + '">⚠️ ' + bt('문제 있음', 'Wrong') + '</button><button class="b-green b-sm" data-rvk="' + esc(o.id) + '">✅ ' + bt('이 주문 맞음', 'This one is right') + '</button></div></div>').join('') + '</div>' +
    '<button class="b-green" id="rvAll" style="padding:15px;margin-bottom:12px">✅ ' + bt('전체 ', 'All ') + REQ.length + bt('건 모두 맞습니다', ' orders are correct') + ' · ' + money(REQ.reduce((a, o) => a + (Number(o.amt) || 0), 0)) + '</button>' : '');
  $('rvBack').onclick = () => Router.go('home');
  if (!REQ.length) return;
  const ok = async L => {
    busy(true);
    try {
      const now = new Date().toISOString();
      await S.DB.batch(L.map(o => ({ op: 'update', col: 'orders', id: o.id, data: { cfOk: true, cfAt: now, cfBy: S.user.email, cfHow: 'req' } })));
      await queue({ kind: 'cfok', toStaff: true, chat: true, orderId: L.length === 1 ? L[0].id : '', subject: '[THE ONE] ✅ ' + mySm() + ' 주문 확인 ' + L.length + '건', text: '✅ ' + mySm() + ' 주문 ' + L.length + '건 확인 → 작업 배정 가능\n' + L.map(o => '· ' + o.store + ' (' + (o.no || o.id) + ', ' + money(o.amt) + ')').join('\n'), url: appUrl('order') });
      toast('✅ ' + L.length + bt('건 확인했습니다 — 사무실에 표시됩니다', ' confirmed — the office sees it'), 'good');
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false); reviewPage();
  };
  el.querySelectorAll('[data-rvk]').forEach(b => b.onclick = () => ok(REQ.filter(o => o.id === b.dataset.rvk)));
  el.querySelectorAll('[data-rve]').forEach(b => b.onclick = () => { goHash('#/order/' + b.dataset.rve); });
  el.querySelectorAll('[data-rvi]').forEach(b => b.onclick = () => issueForm(REQ.find(o => o.id === b.dataset.rvi), reviewPage));
  $('rvAll').onclick = async () => { if (!(await confirmBox(bt(REQ.length + '건 · ' + money(REQ.reduce((a, o) => a + (Number(o.amt) || 0), 0)) + ' — 전부 내가 보낸 주문이고 내용이 맞습니까?', 'Confirm all ' + REQ.length + ' orders?'), bt('✅ 모두 맞습니다', '✅ All correct')))) return; ok(REQ); };
  /* 아이템 줄 — 주문마다 (많으면 앞 40건까지) */
  for (const o of REQ.slice(0, 40)) {
    const box = el.querySelector('[data-rvo="' + o.id + '"] .rvl'); if (!box) continue;
    try {
      const L = await S.DB.get('orderLines', o.id), lines = (L && L.lines) || [];
      box.className = 'rvl';
      box.innerHTML = '<table class="pk"><tr><th>' + bt('코드', 'Code') + '</th><th class="r">' + bt('수량', 'Qty') + '</th><th class="r">' + bt('가격', 'Price') + '</th><th class="r">' + bt('금액', 'Amount') + '</th></tr>' + lines.slice(0, 400).map(l => '<tr><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d || '') + '</div></td><td class="r"><b>' + l.q + '</b></td><td class="r">' + money(l.p) + (l.lp != null && Math.abs(l.lp - l.p) > 0.0001 ? '<div class="muted" style="text-decoration:line-through">' + money(l.lp) + '</div>' : '') + '</td><td class="r">' + money(l.q * l.p) + '</td></tr>').join('') + '</table>' + (lines.length > 400 ? '<div class="muted">… ' + (lines.length - 400) + bt('줄 더', ' more') + '</div>' : '');
    } catch (e) { box.textContent = bt('아이템을 읽지 못했습니다', 'Could not load items'); }
  }
}
/** ⚠️ 이 주문에 문제가 있음 — 매니저에게 (앱 알림 + 이메일 · 구글 챗) */
export function issueForm(o, done) {
  if (!o) return;
  openModal('<h2>⚠️ ' + bi('주문에 문제가 있음', 'Something is wrong with this order') + '</h2><div class="muted"><b>' + esc(o.store) + '</b> · ' + esc(o.no || '') + ' · ' + money(o.amt) + '</div>' +
    '<div class="fg" style="margin-top:8px"><label>' + bi('무엇이 다른가요?', 'What is wrong?') + '</label><textarea id="isTx" rows="3" placeholder="' + esc(bt('예: 내가 보낸 주문이 아님 · 수량이 다름 · 가게가 다름', 'e.g. not my order · wrong quantity · wrong store')) + '"></textarea></div>' +
    '<div class="btns"><button class="b-ghost" id="isX">' + bt('취소', 'Cancel') + '</button><button class="b-red" id="isGo">⚠️ ' + bt('사무실에 알리기', 'Tell the office') + '</button></div>');
  $('isX').onclick = closeModal;
  $('isGo').onclick = async () => {
    const tx = $('isTx').value.trim(); if (!tx) return toast(bt('무엇이 다른지 적어 주세요', 'Describe the problem'), 'bad');
    busy(true);
    try {
      await S.DB.update('orders', o.id, { cfIssue: tx, cfIssueAt: new Date().toISOString(), cfIssueOpen: true });
      await queue({ kind: 'issue', toStaff: true, chat: true, orderId: o.id, subject: '[THE ONE] ⚠️ ' + o.sm + ' — ' + o.store + ' 주문 문제', text: '⚠️ ' + o.sm + ' · ' + o.store + ' (' + (o.no || o.id) + ', ' + money(o.amt) + ')\n' + tx, url: appUrl('order/' + o.id) });
      closeModal(); toast('⚠️ ' + bt('사무실에 알렸습니다', 'Sent to the office'), 'good'); if (done) done();
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}

/* ---------- 매니저: ❓ 자세한 확인 요청 (질문 적기) · 💬 구글 챗으로 묻기 ---------- */
export function askForm(o, kind, done) {
  const req = kind === 'cfreq';
  openModal('<h2>' + (req ? '❓ ' + bi('세일즈맨에게 확인 요청', 'Ask the salesman to confirm') : '💬 ' + bi('구글 챗으로 묻기', 'Ask on Google Chat')) + '</h2><div class="muted"><b>' + esc(o.store) + '</b> · ' + esc(o.no || '') + ' · 🧑‍💼 ' + esc(o.sm || '') + '</div>' +
    '<div class="fg" style="margin-top:8px"><label>' + (req ? bi('무엇을 확인해야 하나요? (선택)', 'What should they check? (optional)') : bi('물어볼 내용', 'Question')) + '</label><textarea id="akTx" rows="3" placeholder="' + esc(bt('예: AHG100 이 24개 맞나요? · 배송 주소 확인', 'e.g. Is AHG100 really 24? · check the ship-to')) + '"></textarea></div>' +
    '<div class="muted" style="font-size:12px">' + (req ? bt('세일즈맨 앱에 소리 · 위 띠로 바로 알리고, 이메일 · 구글 챗으로도 보냅니다 (5분 안).', 'Alerts the salesman in the app right away, plus email and Google Chat (within 5 min).') : bt('구글 챗 스페이스로 보냅니다 (5분 안). 담당 세일즈맨 · 직원들이 그 스페이스에서 봅니다.', 'Posts to the Google Chat space (within 5 min).')) + '</div>' +
    '<div class="btns"><button class="b-ghost" id="akX">' + bt('취소', 'Cancel') + '</button><button class="b-blue" id="akGo">' + (req ? '❓ ' + bt('요청', 'Ask') : '💬 ' + bt('보내기', 'Send')) + '</button></div>');
  $('akX').onclick = closeModal;
  $('akGo').onclick = async () => {
    const tx = $('akTx').value.trim(); if (!req && !tx) return toast(bt('물어볼 내용을 적어 주세요', 'Write your question'), 'bad');
    busy(true);
    try {
      if (req) await S.DB.update('orders', o.id, { cfReq: true, cfReqAt: new Date().toISOString(), cfReqBy: S.user.email, cfOk: false, cfNote: tx });
      await queue({ kind, toSm: o.sm, chat: true, orderId: o.id, subject: '[THE ONE] ' + (req ? '❓ 주문 확인 요청' : '💬 주문 문의') + ' — ' + o.store, text: (req ? '❓ 주문 확인 요청 → ' : '💬 문의 → ') + o.sm + ' · ' + o.store + ' (' + (o.no || o.id) + ')' + (tx ? '\n' + tx : ''), url: appUrl('order/' + o.id) });
      closeModal(); toast(req ? bt('확인 요청 보냄', 'Request sent') : '💬 ' + bt('보냈습니다', 'Sent'), 'good'); if (done) done();
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 구글 챗 스페이스 열기 링크 (관리 → 설정) */
export const chatUrl = () => (S.settings && S.settings.chatUrl) || '';
