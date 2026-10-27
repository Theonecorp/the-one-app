/* ============================================================
 *  🔔 주문 확인 · 알림
 *    · 세일즈맨 기본 확인 = 그날 보낸 주문 한 번에: 몇 건 · 어디 · 대략 금액 · 내가 보낸 것이 맞는지 → ✅ 모두 맞습니다 (cfOk, cfHow: 'day')
 *      맞지 않는 주문은 ⚠️ 문제 있음 → 메모 (cfIssue · cfIssueOpen) → 매니저에게 알림
 *    · 자세한 확인은 매니저가 주문을 처리하면서 ❓ 확인 요청 (질문 적기: cfNote) — 그 주문만 따로
 *    · 알림: 앱이 열려 있으면 바로 (실시간 보기 · 소리 · 진동 · 위 띠 · 아래 메뉴 숫자 · 폰 알림),
 *            이메일 · 구글 챗은 notifyq → apps-script/Code.gs 가 5분마다 보냄
 *  notifyq/{id} = { kind: cfreq|issue|ask, toSm, toStaff, subject, text, url, chat, st: 'wait', by, at }
 * ============================================================ */
import { $, esc, money, toast, busy, openModal, closeModal, confirmBox, bi, bt, today, localDay, md } from './ui.js';
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
      bar('cfBarS', req.length ? '❓ ' + bt('사무실 확인 요청', 'Office asks you to confirm') + ' <b>' + req.length + '</b>' + bt('건', '') + ' — <u>' + bt('보기', 'view') + '</u>' : '', () => { if (req.length === 1) location.hash = '#/order/' + req[0].id; else location.hash = '#/order'; });
      if (SEEN.req >= 0 && req.length > SEEN.req) { beep(); toast('❓ ' + bt('사무실에서 주문 확인을 요청했습니다', 'The office asked you to confirm an order'), 'bad'); phone('❓ ' + bt('주문 확인 요청', 'Order check requested'), req.map(o => o.store).slice(0, 3).join(', '), appUrl('order')); }
      SEEN.req = req.length;
    }));
  }
  if (!isSales()) {
    /* 매니저: 세일즈맨이 ⚠️ 문제 있음 / 확인 요청에 답하면 */
    STOP.push(S.DB.watch('orders', { where: [['cfIssueOpen', '==', true]] }, rows => {
      bar('cfBarM', rows.length ? '⚠️ ' + bt('세일즈맨이 알린 주문 문제', 'Salesman flagged orders') + ' <b>' + rows.length + '</b>' + bt('건', '') + ' — <u>' + bt('보기', 'view') + '</u>' : '', () => { location.hash = '#/order/' + rows[0].id; });
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
  const L = dayPending(rows); if (!L.length) { el.innerHTML = ''; return; }
  const by = {}; L.forEach(o => { const d = localDay(o.sentAt); (by[d] = by[d] || []).push(o); });
  const tot = L.reduce((a, o) => a + (Number(o.amt) || 0), 0);
  el.innerHTML = '<div class="card" style="border:2px solid #93c5fd"><h2>📋 ' + bi('보낸 주문 확인', 'Confirm the orders you sent') + ' <span class="tag t-b">' + L.length + bt('건', '') + ' · ' + money(tot) + '</span></h2>' +
    '<div class="muted">' + bt('내가 보낸 주문이 맞는지만 보세요 — 몇 건 · 어느 가게 · 대략 금액. 맞으면 아래 ✅ 한 번. 아닌 주문은 ⚠️ 를 눌러 알려 주세요. 자세한 것은 사무실이 필요할 때 따로 물어봅니다.', 'Just check these are the orders you sent — how many, which stores, roughly how much. If right, tap ✅ once. Flag any wrong one with ⚠️. The office asks separately when it needs details.') + '</div>' +
    Object.keys(by).sort().map(d => { const X = by[d]; return '<div class="iday"><b>' + (d === today() ? bt('오늘', 'Today') + ' ' : '') + esc(md(d)) + '</b><span>' + X.length + bt('건', '') + ' · ' + money(X.reduce((a, o) => a + (Number(o.amt) || 0), 0)) + '</span></div>' +
      X.map(o => '<div class="pr"><div class="ct tap" data-dco="' + esc(o.id) + '"><b>' + esc(o.store || '') + '</b><small>' + esc(o.acct || '') + ' · ' + (o.n || 0) + bt('줄', ' lines') + ' · ' + (o.qty || 0) + bt('개', ' pcs') + ' · ' + esc(o.no || '') + '</small></div><div class="pa"><b>' + money(o.amt) + '</b><button class="b-ghost b-sm" data-dci="' + esc(o.id) + '" style="margin-top:4px">⚠️</button></div></div>').join(''); }).join('') +
    '<button class="b-green" id="dcAll" style="margin-top:10px;padding:14px">✅ ' + bt('모두 맞습니다', 'All correct') + ' (' + L.length + bt('건', '') + ' · ' + money(tot) + ')</button></div>';
  el.querySelectorAll('[data-dco]').forEach(x => x.onclick = () => { location.hash = '#/order/' + x.dataset.dco; });
  el.querySelectorAll('[data-dci]').forEach(x => x.onclick = () => issueForm(L.find(o => o.id === x.dataset.dci), () => dayCard(el)));
  $('dcAll').onclick = async () => {
    if (!(await confirmBox(bt(L.length + '건 · ' + money(tot) + ' — 모두 내가 보낸 주문이 맞습니까?', 'Confirm all ' + L.length + ' orders (' + money(tot) + ')?'), bt('✅ 맞습니다', '✅ Confirm')))) return;
    busy(true);
    try { const now = new Date().toISOString(); await S.DB.batch(L.map(o => ({ op: 'update', col: 'orders', id: o.id, data: { cfOk: true, cfAt: now, cfBy: S.user.email, cfHow: 'day' } }))); toast('✅ ' + L.length + bt('건 확인했습니다 — 사무실에 표시됩니다', ' confirmed — the office sees it'), 'good'); dayCard(el); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
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
