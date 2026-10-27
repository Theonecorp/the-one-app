/* ============================================================
 *  🧭 주문 흐름 감독 — 관리자 · 매니저가 출고 전 모든 주문이 지금 어디서, 누구 손에, 얼마나 머물러 있는지 한 화면에
 *    단계: 📥 신규 → ❓ 세일즈맨 확인 → 👍 배정 대기 → 📦 출고 작업(👷 누구) → ✅ 검수 · 인보이스 대기 → 🧾 포장 대기 → 📮 픽업 대기 → 📬 출고
 *    사람별: 지금 맡은 작업 · 가장 오래된 것 · 오늘 한 일 (픽킹 완료 · 인보이스 · 포장 · 출고)
 *    오래 머문 주문은 ⚠️ 빨갛게 (단계마다 기준 시간) — 1분마다 새로 읽음
 *  주문 화면(manage)에도 같은 흐름 기록(timelineHtml)을 보여 줌
 * ============================================================ */
import { $, esc, money, toast, Router, debounce, bi, bt, localDay, today, addDays, sortBy } from './ui.js';
import { can, jobOf } from './main.js';
import { goOrder } from './orders.js';
import * as Fulfill from './fulfill.js';

let S = null, TIMER = 0;
const F = { stage: '', who: '', sm: '', q: '', late: false };
const NAMES = {};
/* 단계: key · 아이콘 · 이름 · 영어 · 이 주문이 이 단계인가 · 이 단계에 들어온 때 · 지연 기준(시간) */
export const STAGES = [
  ['new', '📥', '신규 확인', 'New', o => o.st === 'sent' && !o.cfReq && !o.cfOk, o => o.sentAt, 4],
  ['cfw', '❓', '세일즈맨 확인 대기', 'Awaiting salesman', o => o.st === 'sent' && o.cfReq && !o.cfOk, o => o.cfReqAt || o.sentAt, 24],
  ['cfok', '👍', '배정 대기', 'To assign', o => o.st === 'sent' && o.cfOk, o => o.cfAt || o.sentAt, 4],
  ['pick', '📦', '출고 작업', 'Picking', o => o.st === 'pick' || o.st === 'ok', o => o.pickAt, 4],
  ['picked', '✅', '검수 · 인보이스 대기', 'Review · Invoice', o => o.st === 'picked', o => o.pickDoneAt || o.pickAt, 3],
  ['done', '🧾', '포장 대기', 'To pack', o => o.st === 'done', o => o.doneAt, 24],
  ['packed', '📮', 'UPS 픽업 대기', 'Awaiting pickup', o => o.st === 'packed', o => o.packAt, 30],
  ['shipped', '📬', '오늘 출고', 'Shipped today', o => o.st === 'shipped', o => o.shipAt, 0]
];
const stageOf = o => STAGES.find(s => s[4](o));
/** 이 주문이 지금 단계에 얼마나 머물렀나 — 주문 목록 줄의 ⏱ 표시 · 밀린 주문 (orders.js)
 *  { key, since, ms, t: '5시간' · '2일째', late: 단계 기준 넘음, day: 하루(24시간) 넘음 } */
export function stageAge(o) {
  const st = stageOf(o); if (!st || st[0] === 'shipped') return null;
  const since = st[5](o) || o.updatedAt || o.createdAt; if (!since) return null;
  const ms = Math.max(0, Date.now() - new Date(since).getTime()), m = Math.round(ms / 60000);
  return { key: st[0], since, ms, t: m < 60 ? m + bt('분', 'm') : m < 1440 ? Math.floor(m / 60) + bt('시간', 'h') : Math.floor(m / 1440) + bt('일째', 'd'), late: !!(st[6] && ms > st[6] * 3600000), day: ms > 86400000 };
}
const LIVE = ['sent', 'pick', 'ok', 'picked', 'done', 'packed'];

export function register(state) {
  S = state; Router.on('flow', page);
  loadNames();
}
export const canFlow = () => S && (S.role === 'admin' || S.role === 'owner' || (S.role === 'manager' && can('flow')));

/** 이메일 → 이름 (사용자 목록) */
async function loadNames() {
  if (Object.keys(NAMES).length || !S || S.role === 'salesman') return;
  try { (await S.DB.list('users', {})).forEach(u => { const e = u.email || u.id; if (e) NAMES[e] = u.name || e.split('@')[0]; }); } catch (e) { /* 이름 없으면 이메일 앞부분 */ }
}
const nameOf = e => e ? (NAMES[e] || String(e).split('@')[0]) : '';
const ownerName = (o, k) => k === 'pick' ? (o.pickerName || nameOf(o.picker)) : k === 'cfw' ? '🧑‍💼 ' + (o.sm || '') : '';
function age(iso) {
  if (!iso) return { ms: 0, t: '' };
  const ms = Date.now() - new Date(iso).getTime(), m = Math.max(0, Math.round(ms / 60000));
  return { ms, t: m < 60 ? m + '분' : m < 48 * 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : Math.floor(m / 1440) + '일' };
}
const hm = iso => { if (!iso) return ''; const d = new Date(iso); return (localDay(iso) === today() ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/** 흐름 기록 — 누가 언제 무엇을 (주문 화면 · 감독 화면 공용) */
export function flowSteps(o) {
  const L = [];
  if (o.sentAt) L.push(['📤', '접수', 'Received', o.sentAt, o.sm]);
  if (o.cfReqAt) L.push(['❓', '확인 요청', 'Asked salesman', o.cfReqAt, nameOf(o.cfReqBy)]);
  if (o.cfOk) L.push(['👍', '확인 완료', 'Confirmed', o.cfAt, o.cfHow === 'staff' ? nameOf(o.cfBy) + ' (대신)' : o.sm]);
  if (o.pickAt) L.push(['👷', '배정 → ' + (o.pickerName || nameOf(o.picker)), 'Assigned', o.pickAt, nameOf(o.pickBy)]);
  if (o.pickDoneAt) L.push(['✅', '작업 완료', 'Picked', o.pickDoneAt, nameOf(o.pickDoneBy)]);
  if (o.doneAt) L.push(['🧾', '인보이스', 'Invoiced', o.doneAt, nameOf(o.doneBy)]);
  if (o.packAt) L.push(['📦', '포장 · 라벨', 'Packed', o.packAt, nameOf(o.packBy)]);
  if (o.shipAt) L.push(['📬', '출고', 'Shipped', o.shipAt, nameOf(o.shipBy) + (o.pickupId ? ' · 🚚 ' + o.pickupId : '')]);
  return L;
}
export function timelineHtml(o) {
  loadNames();
  const L = flowSteps(o); if (!L.length) return '';
  const st = stageOf(o), a = st ? age(st[5](o)) : null, late = st && st[6] && a && a.ms > st[6] * 3600000;
  return '<div class="flowtl">' + L.map(x => '<span class="fs"><b>' + x[0] + ' ' + esc(x[1]) + '</b><small>' + esc(hm(x[3])) + (x[4] ? ' · ' + esc(x[4]) : '') + '</small></span>').join('<i>›</i>') +
    (st && st[0] !== 'shipped' && a && a.t ? '<span class="fs now' + (late ? ' late' : '') + '"><b>' + st[1] + ' ' + esc(st[2]) + '</b><small>⏱ ' + esc(a.t) + (late ? ' ⚠️' : '') + '</small></span>' : '') + '</div>';
}

async function page() {
  clearInterval(TIMER);
  if (!canFlow()) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('관리자 · 매니저만 보는 화면입니다', 'Managers only') + '</div></div>'; return; }
  $('page').innerHTML = '<div class="load">' + bt('주문 흐름 읽는 중…', 'Loading order flow…') + '</div>';
  await loadNames();
  await paint();
  TIMER = setInterval(() => { if (location.hash.replace(/^#\/?/, '').split('/')[0] !== 'flow') return clearInterval(TIMER); if (!document.getElementById('modal').classList.contains('on')) paint(true); }, 60000);
}

async function load() {
  const [live, recent] = await Promise.all([
    S.DB.list('orders', { where: [['st', 'in', LIVE]] }),
    S.DB.list('orders', { where: [['d', '>=', addDays(today(), -10)]] })]);
  const by = {}; live.concat(recent).forEach(o => { by[o.id] = o; });
  return Object.values(by).filter(o => o.st !== 'x' && o.st !== 'draft');
}

async function paint(quiet) {
  let all;
  try { all = await load(); } catch (e) { if (!quiet) $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  if (location.hash.replace(/^#\/?/, '').split('/')[0] !== 'flow') return;
  const t = today();
  const live = all.filter(o => LIVE.includes(o.st)), shippedT = all.filter(o => o.st === 'shipped' && localDay(o.shipAt) === t);
  const board = live.concat(shippedT).map(o => { const st = stageOf(o), a = age(st ? st[5](o) : ''); return { o, st, a, late: !!(st && st[6] && a.ms > st[6] * 3600000) }; });
  /* 사람별 — 지금 맡은 작업 + 오늘 한 일 */
  const P = {};
  const pp = e => (P[e] = P[e] || { e, now: [], pk: 0, inv: 0, pack: 0, ship: 0, as: 0 });
  board.forEach(x => { if (x.st && x.st[0] === 'pick' && x.o.picker) pp(x.o.picker).now.push(x); });
  all.forEach(o => {
    if (o.pickDoneBy && localDay(o.pickDoneAt) === t) pp(o.pickDoneBy).pk++;
    if (o.doneBy && localDay(o.doneAt) === t) pp(o.doneBy).inv++;
    if (o.packBy && localDay(o.packAt) === t) pp(o.packBy).pack++;
    if (o.shipBy && localDay(o.shipAt) === t) pp(o.shipBy).ship++;
    if (o.pickBy && localDay(o.pickAt) === t) pp(o.pickBy).as++;
  });
  const people = sortBy(Object.values(P), p => p.now.length * 1000 + p.pk + p.inv + p.pack + p.ship, true);
  const sms = Array.from(new Set(board.map(x => x.o.sm).filter(Boolean))).sort();
  /* 걸러 보기 */
  const qq = F.q.trim().toUpperCase();
  const shown = board.filter(x => (!F.stage || (x.st && x.st[0] === F.stage)) && (!F.sm || x.o.sm === F.sm) && (!F.late || x.late) &&
    (!F.who || x.o.picker === F.who || [x.o.pickDoneBy, x.o.doneBy, x.o.packBy, x.o.shipBy, x.o.pickBy].includes(F.who)) &&
    (!qq || [x.o.store, x.o.no, x.o.acct, x.o.sm, x.o.pickerName].some(v => String(v || '').toUpperCase().includes(qq))));
  const nLate = board.filter(x => x.late).length;
  const strip = STAGES.map(s => { const L = board.filter(x => x.st === s), lt = L.filter(x => x.late).length; return '<button class="fstage' + (F.stage === s[0] ? ' on' : '') + (lt ? ' haslate' : '') + '" data-fs="' + s[0] + '"><span>' + s[1] + '</span><b>' + L.length + '</b><small>' + esc(s[2]) + '</small>' + (lt ? '<em>⚠️ ' + lt + '</em>' : '') + '</button>'; }).join('');
  const ppl = people.length ? people.map(p => { const old = p.now.reduce((m, x) => Math.max(m, x.a.ms), 0), lt = p.now.some(x => x.late);
    return '<button class="fperson' + (F.who === p.e ? ' on' : '') + '" data-fw="' + esc(p.e) + '"><b>👷 ' + esc(nameOf(p.e)) + '</b><small>' + (p.now.length ? '<span' + (lt ? ' class="warn"' : '') + '>' + bt('작업 중', 'Working') + ' ' + p.now.length + bt('건', '') + ' · ⏱ ' + esc(age(new Date(Date.now() - old).toISOString()).t) + (lt ? ' ⚠️' : '') + '</span>' : bt('맡은 작업 없음', 'Nothing assigned')) + '</small>' +
      '<small>' + bt('오늘', 'Today') + ': ' + [p.as ? '👷→ ' + p.as : '', p.pk ? '✅ ' + p.pk : '', p.inv ? '🧾 ' + p.inv : '', p.pack ? '📦 ' + p.pack : '', p.ship ? '📬 ' + p.ship : ''].filter(Boolean).join(' · ') + '</small></button>'; }).join('') : '<div class="muted">' + bt('아직 배정 · 처리 기록이 없습니다', 'No activity yet') + '</div>';
  const groups = STAGES.map(s => { const L = sortBy(shown.filter(x => x.st === s), x => x.a.ms, true); if (!L.length) return '';
    return '<div class="fgroup"><h3>' + s[1] + ' ' + esc(s[2]) + ' <span class="muted">' + L.length + bt('건', '') + ' · ' + money(L.reduce((a, x) => a + (x.o.amt || 0), 0)) + '</span></h3>' + L.map(row).join('') + '</div>'; }).join('');
  const prevY = window.scrollY;
  $('page').innerHTML = '<div class="card"><h2 style="display:flex;justify-content:space-between;align-items:center;gap:8px">🧭 ' + bi('주문 흐름 감독', 'Order flow') + '<button class="b-ghost b-sm" id="flR">↻ ' + bt('새로고침', 'Refresh') + '</button></h2>' +
    '<div class="muted">' + bt('출고 전 모든 주문이 지금 어느 단계에서 누구 손에 있는지, 얼마나 머물렀는지 봅니다. 오래 머문 주문은 ⚠️. 1분마다 자동으로 새로 읽습니다.', 'Every open order: stage, who has it, and how long. ⚠️ = late. Auto-refresh every minute.') + ' <span class="muted">· ' + esc(hm(new Date().toISOString())) + '</span></div>' +
    '<div class="fstrip">' + strip + '</div>' +
    (nLate ? '<button class="alert a-red" id="flLate" style="width:100%;text-align:left;border:0;cursor:pointer">⚠️ ' + bt('오래 머문 주문', 'Late orders') + ' <b>' + nLate + '</b>' + bt('건', '') + ' — ' + (F.late ? bt('전체 보기', 'show all') : bt('이것만 보기', 'show only these')) + '</button>' : '') + '</div>' +
    '<div class="card"><h2>👷 ' + bi('사람별 현황', 'By person') + '</h2><div class="fpeople">' + ppl + '</div></div>' +
    '<div class="card"><div style="display:flex;gap:6px;flex-wrap:wrap"><input id="flQ" placeholder="' + esc(bt('가게 · 주문번호 · 세일즈맨 · 직원', 'Store · order # · salesman · staff')) + '" value="' + esc(F.q) + '" style="flex:1;min-width:160px">' +
    '<select id="flSm" style="flex:0 0 auto;width:auto"><option value="">' + bt('세일즈맨 전체', 'All salesmen') + '</option>' + sms.map(s => '<option' + (F.sm === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' +
    (F.stage || F.who || F.sm || F.late || F.q ? '<div class="chips" style="margin-top:6px">' + [F.stage ? STAGES.find(s => s[0] === F.stage)[2] : '', F.who ? '👷 ' + nameOf(F.who) : '', F.sm ? '🧑‍💼 ' + F.sm : '', F.late ? '⚠️' : ''].filter(Boolean).map(x => '<span class="tag t-b">' + esc(x) + '</span>').join(' ') + ' <button class="b-ghost b-sm" id="flClr">✕ ' + bt('거르기 풀기', 'Clear filters') + '</button></div>' : '') +
    '<div class="muted" style="margin-top:6px">' + shown.length + bt('건', ' orders') + ' · ' + money(shown.reduce((a, x) => a + (x.o.amt || 0), 0)) + '</div>' +
    (groups || '<div class="none">' + bt('해당하는 주문이 없습니다', 'No orders') + '</div>') + '</div>';
  if (quiet) window.scrollTo(0, prevY);
  Router.refreshBack();
  $('flR').onclick = () => paint();
  document.querySelectorAll('[data-fs]').forEach(b => b.onclick = () => { F.stage = F.stage === b.dataset.fs ? '' : b.dataset.fs; paint(); });
  document.querySelectorAll('[data-fw]').forEach(b => b.onclick = () => { F.who = F.who === b.dataset.fw ? '' : b.dataset.fw; paint(); });
  if ($('flLate')) $('flLate').onclick = () => { F.late = !F.late; paint(); };
  if ($('flClr')) $('flClr').onclick = () => { Object.assign(F, { stage: '', who: '', sm: '', q: '', late: false }); paint(); };
  $('flSm').onchange = () => { F.sm = $('flSm').value; paint(); };
  $('flQ').oninput = debounce(() => { F.q = $('flQ').value; paint().then(() => { const q = $('flQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 300);
  document.querySelectorAll('[data-fo]').forEach(el => el.onclick = e => { if (e.target.closest('[data-fa]')) return; Router.backTo = { name: 'order', hash: '#/flow' }; goOrder(el.dataset.fo); });
  document.querySelectorAll('[data-fa]').forEach(b => b.onclick = e => { e.stopPropagation(); const x = board.find(y => y.o.id === b.dataset.fa); if (x) Fulfill.assignPicker([x.o], () => paint()); });
}

function row(x) {
  const o = x.o, k = x.st ? x.st[0] : '', own = ownerName(o, k);
  const canAs = can('assign') && ['new', 'cfok', 'pick'].includes(k);
  return '<div class="frow tap' + (x.late ? ' late' : '') + '" data-fo="' + esc(o.id) + '">' +
    '<div class="frh"><div><b>' + esc(o.store || '') + '</b> <span class="muted">' + esc(o.no || '') + ' · 🧑‍💼 ' + esc(o.sm || '') + ' · ' + money(o.amt || 0) + (o.boxes ? ' · 📦' + o.boxes : '') + '</span></div>' +
    '<div class="fage">' + (k !== 'shipped' && x.a.t ? '⏱ ' + esc(x.a.t) + (x.late ? ' ⚠️' : '') : '') + '</div></div>' +
    (own ? '<div class="fown">' + (k === 'pick' ? '👷 ' : '') + esc(own) + (k === 'pick' && o.pickBy ? ' <span class="muted">(' + bt('배정', 'by') + ' ' + esc(nameOf(o.pickBy)) + ')</span>' : '') + '</div>' : '') +
    timelineHtml(o) +
    (canAs ? '<div style="margin-top:6px"><button class="b-ghost b-sm" data-fa="' + esc(o.id) + '">👷 ' + (k === 'pick' ? bt('재배정', 'Reassign') : bt('배정', 'Assign')) + '</button></div>' : '') + '</div>';
}
