/* ============================================================
 *  💬 메시지 · 🔔 알림 — 앱 안에서 사무실 ↔ 세일즈맨 ↔ 창고가 짧은 메시지를 주고받음
 *    msgs/{id} = { id, from, fromName, fromRole, to, toLabel, text, ref:{kind,id,label}?, at, reads:{emailKey: iso} }
 *      to: 'u:email' (한 사람) · 'sm:CODE' (세일즈맨) · 'g:office' (사무실) · 'g:wh' (창고) · 'g:sales' (세일즈맨 전체) · 'g:all' (모두)
 *    받는 쪽: 앱이 열려 있으면 바로 (실시간 · 소리 · 토스트 · 폰 알림 · 🔔 숫자), 닫혀 있으면 notifyq → Apps Script 가 이메일 · 구글 챗
 *    읽음: 🔔 창을 열면 보이는 메시지에 reads[me] 가 찍힘 (보낸 사람은 누가 읽었는지 봄)
 * ============================================================ */
import { $, esc, toast, busy, openModal, closeModal, Router, bi, bt, md, goHash, debounce, localDay, today } from './ui.js';
import { newId } from './db.js';
import { jobOf, isTop } from './main.js';
import * as Notify from './notify.js';

let S = null, STOP = [], INBOX = [], SENT = [], FIRST = true, OPEN = false;
export function register(state) { S = state; }
const me = () => String((S.user && S.user.email) || '').toLowerCase();
const myName = () => (S.me && S.me.name) || (S.user && S.user.name) || me();
const mySm = () => String((S.me && S.me.sm) || '').toUpperCase();
const rkey = e => String(e || '').toLowerCase().replace(/\./g, ',');
const WH_JOBS = ['whmgr', 'pick', 'pickinv'];
/** 내가 받는 주소들 — 규칙(firestore.rules)과 같은 계산 */
export function myTargets() {
  const T = ['g:all', 'u:' + me()], r = S.me && S.me.role;
  if (r === 'salesman') { T.push('g:sales'); if (mySm()) T.push('sm:' + mySm()); }
  else if (r === 'admin' || r === 'owner') T.push('g:office', 'g:wh', 'g:staff');
  else if (r === 'manager') { const J = [S.me.job || 'office'].concat(Array.isArray(S.me.job2) ? S.me.job2 : []); T.push('g:staff'); if (J.some(j => WH_JOBS.includes(j))) T.push('g:wh'); if (J.some(j => j !== 'whmgr' && j !== 'pick')) T.push('g:office'); }   // 👥 같이 하는 일(job2)도
  return T.slice(0, 10);
}
const GROUPS = () => [['g:office', '🏢 ' + bt('사무실', 'Office')], ['g:wh', '📦 ' + bt('창고', 'Warehouse')], ['g:sales', '🚗 ' + bt('세일즈맨 전체', 'All salesmen')], ['g:all', '📣 ' + bt('모두', 'Everyone')]];
export function labelOf(to) {
  if (!to) return '';
  if (to.indexOf('sm:') === 0) { const c = to.substring(3), s = S.smByCode && S.smByCode[c]; return '🧑‍💼 ' + (s && s.name ? s.name + ' (' + c + ')' : c); }
  if (to.indexOf('u:') === 0) return '👤 ' + to.substring(2);
  const g = GROUPS().find(x => x[0] === to); return g ? g[1] : to;
}
const unread = () => INBOX.filter(m => m.from !== me() && !(m.reads && m.reads[rkey(me())]));

/* ---------- 실시간 ---------- */
export function start() {
  STOP.forEach(f => { try { f(); } catch (e) {} }); STOP = []; INBOX = []; SENT = []; FIRST = true;
  if (!S || !S.DB || !S.DB.watch || !S.user) return;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  STOP.push(S.DB.watch('msgs', { where: [['to', 'in', myTargets()], ['at', '>=', since]] }, rows => {
    const old = new Set(INBOX.map(m => m.id)); INBOX = rows.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const fresh = FIRST ? [] : INBOX.filter(m => !old.has(m.id) && m.from !== me());
    FIRST = false; paintBadge();
    if (fresh.length) { Notify.beep(); const m = fresh[0]; toast('💬 ' + esc(m.fromName || m.from) + ': ' + esc(String(m.text || '').slice(0, 60)), 'good'); Notify.phone('💬 ' + (m.fromName || m.from), String(m.text || '').slice(0, 120), Notify.appUrl('msg'), 'theone-msg'); if (OPEN) paintPanel(); }
  }));
  STOP.push(S.DB.watch('msgs', { where: [['from', '==', me()], ['at', '>=', since]] }, rows => { SENT = rows.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))); if (OPEN) paintPanel(); }));
}
function paintBadge() {
  const n = unread().length, b = $('hBell'); if (!b) return;
  let s = b.querySelector('.hbadge'); if (n && !s) { s = document.createElement('span'); s.className = 'hbadge'; b.appendChild(s); }
  if (s) { if (n) s.textContent = n > 9 ? '9+' : n; else s.remove(); }
  b.classList.toggle('on', n > 0);
}

/* ---------- 🔔 알림 창 ---------- */
export function openPanel() {
  OPEN = true;
  openModal('<div id="msgPanel"></div>');
  const mo = $('modal'); const obs = new MutationObserver(() => { if (!mo.classList.contains('on')) { OPEN = false; obs.disconnect(); } }); obs.observe(mo, { attributes: true, attributeFilter: ['class'] });
  paintPanel(); markRead();
}
function paintPanel() {
  const box = $('msgPanel'); if (!box) return;
  const all = INBOX.concat(SENT.filter(s => !INBOX.some(m => m.id === s.id))).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);
  const when = iso => { const d = new Date(iso); const t = d.toTimeString().substring(0, 5); const dd = localDay(iso); return dd === today() ? t : md(dd) + ' ' + t; };
  box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h2 style="margin:0">🔔 ' + bi('알림 · 메시지', 'Notifications') + '</h2><button type="button" class="b-blue b-sm" id="msgNew">💬 ' + bt('새 메시지', 'New message') + '</button></div>' +
    (all.length ? '<div class="mlist">' + all.map(m => {
      const mine = m.from === me(), un = !mine && !(m.reads && m.reads[rkey(me())]);
      const readers = mine ? Object.keys(m.reads || {}).length : 0;
      return '<div class="mrow' + (un ? ' un' : '') + (mine ? ' mine' : '') + '" data-mid="' + esc(m.id) + '"><div class="mh"><b>' + (mine ? bt('나', 'Me') + ' → ' + esc(m.toLabel || labelOf(m.to)) : esc(m.fromName || m.from) + ' <small>→ ' + esc(m.toLabel || labelOf(m.to)) + '</small>') + '</b><small>' + esc(when(m.at)) + '</small></div><div class="mt">' + esc(m.text || '') + '</div>' +
        (m.ref && m.ref.id ? '<button type="button" class="mref" data-mref="' + esc(m.ref.kind + ':' + m.ref.id) + '">' + ({ order: '🧾', inv: '📄', acct: '🏬' }[m.ref.kind] || '🔗') + ' ' + esc(m.ref.label || m.ref.id) + ' ›</button>' : '') +
        '<div class="mact">' + (mine ? '<small class="muted">' + (readers ? '✓ ' + bt('읽음', 'read') + ' ' + readers : bt('아직 안 읽음', 'unread')) + '</small>' : '<button type="button" class="b-ghost b-sm" data-mrep="' + esc(m.id) + '">↩ ' + bt('답장', 'Reply') + '</button>') + '</div></div>';
    }).join('') + '</div>' : '<div class="none">' + bt('아직 메시지가 없습니다', 'No messages yet') + '</div>') +
    Notify.blockedHtml() +
    '<div class="btns"><button type="button" class="b-ghost" id="msgX">' + bt('닫기', 'Close') + '</button></div>';
  $('msgX').onclick = closeModal; $('msgNew').onclick = () => compose({});
  box.querySelectorAll('[data-mref]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.mref.split(':'); closeModal(); if (k === 'order') Router.go('order', id); else if (k === 'inv') Router.go('order', 'inv:' + id); else if (k === 'acct') Router.go('stores', id); });
  box.querySelectorAll('[data-mrep]').forEach(b => b.onclick = () => { const m = INBOX.find(x => x.id === b.dataset.mrep); if (!m) return; compose({ to: m.fromRole === 'salesman' && m.fromSm ? 'sm:' + m.fromSm : 'u:' + m.from, toLabel: (m.fromName || m.from), ref: m.ref || null, quote: m.text }); });
}
async function markRead() {
  const k = rkey(me()), list = unread().slice(0, 30); if (!list.length) return;
  for (const m of list) { try { const reads = Object.assign({}, m.reads || {}); reads[k] = new Date().toISOString(); await S.DB.update('msgs', m.id, { reads }); m.reads = reads; } catch (e) {} }
  paintBadge();
}

/* ---------- 💬 보내기 ---------- */
/** 받을 수 있는 곳 — 역할에 따라 */
/* 👤 사람 한 명에게 — 담당자 · 관리자는 다른 직원(세일즈맨 제외)을 골라 보냄 (그 사람 기기 팝업 + 개인 방). 세일즈맨은 사용자 목록을 못 읽어 묶음만 */
let PEOPLE = null;
async function loadPeople() { if (PEOPLE || !S.me || S.me.role === 'salesman') return; try { PEOPLE = (await S.DB.list('users')).filter(u => u.active !== false && u.role !== 'salesman' && String(u.email || u.id || '').toLowerCase() !== me()).map(u => { const e = String(u.email || u.id).toLowerCase(); return ['u:' + e, '👤 ' + (u.name || e.split('@')[0])]; }).sort((a, b) => a[1].localeCompare(b[1])); } catch (e) { PEOPLE = []; } }
function targets() {
  const r = S.me && S.me.role, L = [];
  if (r === 'salesman') { L.push(['g:office', '🏢 ' + bt('사무실', 'Office')], ['g:wh', '📦 ' + bt('창고', 'Warehouse')]); }
  else {
    L.push(['g:office', '🏢 ' + bt('사무실', 'Office')], ['g:wh', '📦 ' + bt('창고', 'Warehouse')], ['g:sales', '🚗 ' + bt('세일즈맨 전체', 'All salesmen')]);
    (S.sms || []).filter(x => x.active !== false).forEach(x => L.push(['sm:' + x.code, '🧑‍💼 ' + (x.name ? x.name + ' (' + x.code + ')' : x.code)]));
    if (isTop()) L.push(['g:all', '📣 ' + bt('모두', 'Everyone')]);
    (PEOPLE || []).forEach(p => L.push(p));
  }
  return L;
}
/** opt: { to, toLabel, ref:{kind,id,label}, quote, text } */
export async function compose(opt) {
  await loadPeople();
  opt = opt || {}; const T = targets(); let to = opt.to || (T[0] && T[0][0]) || '';
  if (to && !T.some(x => x[0] === to)) T.unshift([to, opt.toLabel ? '👤 ' + opt.toLabel : labelOf(to)]);
  openModal('<h2>💬 ' + bi('메시지 보내기', 'Send a message') + '</h2>' +
    '<div class="fg"><label>' + bt('받는 곳', 'To') + '</label><div class="chips" id="msgTo">' + T.map(x => '<button type="button" class="' + (x[0] === to ? 'on' : '') + '" data-mto="' + esc(x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>' +
    (opt.ref && opt.ref.id ? '<div class="alert a-blu" style="margin:0 0 8px">🔗 ' + esc(opt.ref.label || opt.ref.id) + '</div>' : '') +
    (opt.quote ? '<div class="muted" style="font-size:12.5px;border-left:3px solid var(--line);padding-left:8px;margin-bottom:8px">' + esc(String(opt.quote).slice(0, 160)) + '</div>' : '') +
    '<div class="fg"><label>' + bt('내용', 'Message') + '</label><textarea id="msgText" rows="3" placeholder="' + esc(bt('예: 1111 ALI 주문 오늘 꼭 나가야 해요 / 샘플 3개 같이 보내 주세요', 'e.g. 1111 ALI must ship today / add 3 samples')) + '">' + esc(opt.text || '') + '</textarea></div>' +
    '<div class="chips">' + [bt('확인 부탁드립니다', 'Please check'), bt('오늘 꼭 나가야 합니다', 'Must ship today'), bt('전화 주세요', 'Please call me'), bt('처리했습니다 ✅', 'Done ✅')].map(q => '<button type="button" data-mq="' + esc(q) + '">+ ' + esc(q) + '</button>').join('') + '</div>' +
    '<div class="muted" style="font-size:12px;margin-top:6px">' + bt('받는 사람 앱이 열려 있으면 바로 울리고, 닫혀 있으면 이메일 · 구글 챗으로도 갑니다.', 'Rings in the app if it is open; otherwise goes by email and Google Chat too.') + '</div>' +
    '<div class="btns"><button type="button" class="b-ghost" id="msgC">' + bt('닫기', 'Close') + '</button><button type="button" class="b-blue" id="msgSend">📤 ' + bt('보내기', 'Send') + '</button></div>');
  document.querySelectorAll('[data-mto]').forEach(b => b.onclick = () => { to = b.dataset.mto; document.querySelectorAll('[data-mto]').forEach(x => x.classList.toggle('on', x.dataset.mto === to)); });
  document.querySelectorAll('[data-mq]').forEach(b => b.onclick = () => { const t = $('msgText'); t.value = (t.value.trim() ? t.value.trim() + ' ' : '') + b.dataset.mq; t.focus(); });
  $('msgC').onclick = closeModal;
  $('msgSend').onclick = async () => {
    const text = $('msgText').value.trim(); if (!text) return toast(bt('내용을 적어 주세요', 'Write a message'), 'bad'); if (!to) return toast(bt('받는 곳을 고르세요', 'Pick a recipient'), 'bad');
    busy(true);
    try { await sendMsg({ to, toLabel: (T.find(x => x[0] === to) || [])[1] || labelOf(to), text, ref: opt.ref || null }); closeModal(); toast('📤 ' + bt('보냈습니다', 'Sent'), 'good'); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  if (!('ontouchstart' in window)) setTimeout(() => { const t = $('msgText'); if (t) t.focus(); }, 50);
}
export async function sendMsg(m) {
  const id = newId('M'), at = new Date().toISOString();
  const doc = { id, from: me(), fromName: myName(), fromRole: (S.me && S.me.role) || '', fromSm: mySm() || '', to: m.to, toLabel: String(m.toLabel || '').replace(/^[^\w가-힣]+/, '').trim(), text: m.text, ref: m.ref || null, at, reads: {} };
  await S.DB.set('msgs', id, doc);
  /* 닫혀 있는 폰에도 — 이메일 · 구글 챗 (세일즈맨 → toSm · 사무실/창고/모두 → toStaff) */
  const n = { kind: 'msg', subject: '[THE ONE] 💬 ' + myName() + ': ' + m.text.slice(0, 40), text: m.text + (m.ref && m.ref.label ? '\n🔗 ' + m.ref.label : ''), url: Notify.appUrl('msg'), chat: true };
  if (m.to.indexOf('sm:') === 0) n.toSm = m.to.substring(3);
  else if (m.to.indexOf('u:') === 0) { n.toUser = m.to.substring(2); n.noMail = true; }   // 한 사람에게: 그 사람 기기 팝업 + 개인 방 (메일 없음)
  else { n.toGroup = m.to; n.toStaff = m.to !== 'g:sales' && m.to !== 'g:wh'; }   // 그룹: 그 그룹 사람들 기기 팝업 · 사무실 방 · (사무실이면) 담당자 메일
  if (m.quiet) { n.pushOnly = true; delete n.toStaff; }   // quiet: 팝업만 — 메일 · 챗은 부르는 쪽이 따로 (예: 📦 재고 부족 → stockAlertTo)
  Notify.queue(n).catch(() => {});
  return doc;
}
/** 라우트 #/msg — 알림 창 열기 (폰 알림 · 이메일 링크에서) */
export function page() { Router.go(Router.home || 'home'); setTimeout(openPanel, 200); }
