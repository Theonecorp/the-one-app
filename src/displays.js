/* ============================================================
 *  🖼 Notes Display — 빈 디스플레이(Empty Display) 출고 · 직원 앱의 "Notes Display" 와 같은 흐름
 *    ① 새 요청: 인보이스 · 사무실 담당이 가게 · 디스플레이 상품(종류 × 개수) · 나갈 날짜 · 메모 (주문 창에서 열면 가게가 채워짐)
 *    ② 준비 대기 → 창고가 [준비 시작] → 상품마다 ☑ → [완료] → 단위(개)마다 UPS 박스 한 개 (상품의 무게 · 크기 그대로) → 🚚 UPS 라벨
 *    화면: 대기 · 준비 중 · 완료(24시간) 숫자 + 새 요청 · 두 칸 (준비 대기 | 완료 — 최근 24시간, 취소됨 포함)
 *  displays/{id} = { id, acct, store, sm, items:[{ n, q, w, l, wd, h, ok }], qty, due, note, orderId, orderNo,
 *                    st: 'open' | 'prep' | 'hold' | 'done' | 'shipped' | 'x', prepAt, prepBy, doneAt, doneBy, shippedAt, track, shipVia, boxes,
 *                    holdAt, holdBy, holdNote(보류 이유 — 물건 없음 · 확인 필요), log:[{ at, by, text }] (⚠️ 문제 · 메모 기록 · 되돌림)
 *    상품(items[].n)은 ⚙️ 설정 상품(무게 · 크기 있음) · 카탈로그의 디스플레이 · 세트(c: 코드) · 직접 입력(특별 제작, note 로 설명) — v0.8.174
 *                    createdBy, createdByName, createdAt, updatedAt, cancelAt, cancelBy }
 *  디스플레이 상품 목록(무게 lb · 상자 크기 in)은 settings/app.displayItems — 관리자가 화면의 ⚙️ 에서 고침 (없으면 아래 기본값)
 *  UPS 라벨은 ship.js 출고 창을 { col: 'displays', boxSpec } 로 열어 박스마다 무게 · 크기가 들어가고 트래킹이 이 문서에 붙음 (주문 문서는 안 건드림)
 * ============================================================ */
import { $, esc, toast, busy, openModal, closeModal, confirmBox, Router, today, md, daysBetween, bi, bt, sortBy } from './ui.js';
import { can } from './main.js';
import { newId } from './db.js';
import { searchAccounts } from './accounts.js';
import { reqText, reqLabel, reqClean, reqNoteClean } from './reqs.js';
import { loadCatalog, catalog } from './catalog.js';
import * as Msg from './msg.js';

let S = null;
export function register(state) { S = state; Router.on('displays', page); }
/** 요청 적기 · 고치기: 인보이스 · 주문 넣는 담당 · 관리자 / 준비 · 완료 · UPS: 출고 담당(ship)도 */
export const canWrite = () => can('invoice') || can('newOrder');
export const canShip = () => can('ship') || canWrite();
const me = () => String((S.user && S.user.email) || '').toLowerCase();
const myName = () => (S.me && S.me.name) || (S.user && S.user.name) || me();
/* 직원 앱과 같은 기본 상품 — [이름, 무게 lb, 길이, 폭, 높이 in] */
export const DEF_ITEMS = [{ n: 'BASE - 2 TIER (LONG)', w: 30, l: 15, wd: 15, h: 26 }, { n: 'BASE - 3 TIER (SHORT)', w: 19, l: 15, wd: 15, h: 13 }, { n: 'LD STACKABLE', w: 15, l: 22, wd: 15, h: 15 }];
export const catalogItems = () => { const L = S && S.settings && Array.isArray(S.settings.displayItems) && S.settings.displayItems.length ? S.settings.displayItems : DEF_ITEMS; return L.filter(x => x && x.n); };
const boxesOf = d => (d.items || []).reduce((a, x) => a + (Number(x.q) || 0), 0);
const specTxt = x => (x.w ? x.w + ' lb' : '') + (x.l && x.wd && x.h ? ' · ' + x.l + '×' + x.wd + '×' + x.h + ' in' : '');
/** "BASE - 2 TIER (LONG) ×2 · LD STACKABLE ×4" */
export const dispText = d => (d.items || []).map(x => x.n + ' ×' + x.q).join(' · ');
const fmtDay = s => { s = String(s || '').substring(0, 10); return s ? s.substring(8, 10) + ' ' + Number(s.substring(5, 7)) + bt('월', '/') + ' ' + s.substring(0, 4) : ''; };
const dueTag = d => {
  if (!d.due) return '<span class="dvdate">' + bt('날짜 미정', 'No date') + '</span>';
  const n = daysBetween(today(), d.due), w = n < 0 ? ' late' : n === 0 ? ' today' : '';
  return '<span class="dvdate' + w + '">' + bt('날짜', 'Date') + ' ' + esc(fmtDay(d.due)) + (n === 0 ? ' · ' + bt('오늘', 'Today') : n < 0 ? ' · ⚠️ ' + (-n) + bt('일 지남', 'd late') : ' · D-' + n) + '</span>';
};
const in24 = iso => iso && Date.now() - new Date(iso).getTime() < 86400000;

async function page(arg) {
  if (!canShip() && S.role !== 'admin') { $('page').innerHTML = '<div class="card"><div class="none">' + bt('사무실 · 창고 담당만 쓰는 화면입니다', 'For office and warehouse staff') + '</div></div>'; return; }
  await list(arg === 'new');
}

/* ---------- 화면 ---------- */
let NEWOPEN = false;
async function list(openNew) {
  const box = $('page'); if (!box.querySelector('#dvWrap')) box.innerHTML = '<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>';
  let L = []; try { L = await S.DB.list('displays'); } catch (e) { box.innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  if (openNew) NEWOPEN = true;
  const wait = sortBy(L.filter(d => d.st === 'open' || d.st === 'prep' || d.st === 'hold'), d => (d.st === 'prep' ? '0' : d.st === 'open' ? '1' : '2') + (d.due || '9999') + (d.createdAt || ''));
  const done = sortBy(L.filter(d => (d.st === 'done') || ((d.st === 'shipped') && in24(d.shippedAt || d.doneAt)) || (d.st === 'x' && in24(d.cancelAt))), d => d.st === 'done' ? '1' + (d.doneAt || '') : '0' + (d.shippedAt || d.cancelAt || ''), true);
  const nOpen = L.filter(d => d.st === 'open'), nPrep = L.filter(d => d.st === 'prep'), nHold = L.filter(d => d.st === 'hold'), n24 = L.filter(d => (d.st === 'done' || d.st === 'shipped') && in24(d.doneAt || d.shippedAt));
  const kpi = (ic, cls, ko, en, n, sub) => '<div class="dvk ' + cls + '"><span class="dvki">' + ic + '</span><div><small>' + bi(ko, en) + '</small><b>' + n + '</b>' + (sub != null ? '<small>' + sub + ' ' + bt('박스', 'boxes') + '</small>' : '') + '</div></div>';
  const item = (d, x, i, live) => '<div class="dvit' + (x.ok ? ' ok' : '') + '">' + (live ? '<label class="ckw"><input type="checkbox" class="ck-big" data-dvok="' + esc(d.id) + '|' + i + '"' + (x.ok ? ' checked' : '') + (d.st === 'prep' ? '' : ' disabled') + '></label>' : '') + '<div><b>' + (x.c ? '<span class="tag t-k">' + esc(x.c) + '</span> ' : x.custom ? '✏️ ' : '') + esc(x.n) + ' ×' + (Number(x.q) || 0) + '</b><small>' + esc(specTxt(x)) + (x.note ? (specTxt(x) ? ' · ' : '') + '📝 ' + esc(x.note) : '') + '</small></div></div>';
  const card = d => {
    const live = d.st === 'open' || d.st === 'prep' || d.st === 'hold', allOk = (d.items || []).length && (d.items || []).every(x => x.ok);
    const logs = (d.log || []).slice(-3);
    return '<div class="dvcard' + (d.st === 'prep' ? ' prep' : '') + (d.st === 'hold' ? ' hold' : '') + (d.st === 'x' ? ' dim' : '') + '" data-dv="' + esc(d.id) + '">' +
      '<div class="dvhd"><b>' + esc(d.store || '') + (d.acct ? ' · ' + esc(d.acct) : '') + '</b>' + (d.st === 'x' ? '<span class="tag t-r">' + bt('취소됨', 'Cancelled') + '</span>' : d.st === 'shipped' ? '<span class="tag t-g">🚚 ' + bt('출고됨', 'Shipped') + '</span>' : d.st === 'done' ? '<span class="tag t-a">📦 ' + bt('UPS 대기', 'Awaiting UPS') + '</span>' : d.st === 'prep' ? '<span class="tag t-b">' + bt('준비 중', 'Preparing') + '</span>' : d.st === 'hold' ? '<span class="tag t-a">⏸ ' + bt('보류', 'On hold') + (d.holdNote ? ' · ' + esc(d.holdNote) : '') + '</span>' : '') + '</div>' +
      '<div class="muted dvsub">' + bt('상품', 'Items') + ' ' + (d.items || []).length + bt('개', '') + ' · ' + bt('박스', 'Boxes') + ' ' + boxesOf(d) + bt('개', '') + '</div>' +
      '<div class="dvrow"><div class="dvits">' + (d.items || []).map((x, i) => item(d, x, i, live && canShip())).join('') + '</div>' +
      '<div class="dvbtn">' + (d.st === 'open' && canShip() ? '<button class="b-blue b-sm" data-dvgo="' + esc(d.id) + '">' + bi('준비 시작', 'Start') + '</button>' : '') +
      (d.st === 'prep' && canShip() ? '<button class="b-green b-sm" data-dvdone="' + esc(d.id) + '"' + (allOk ? '' : ' disabled title="' + esc(bt('상품을 모두 ☑ 한 뒤', 'Tick every item first')) + '"') + '>' + bi('완료', 'Done') + '</button>' : '') +
      /* ⏸ 보류(물건 없음 · 확인 필요) · ↩ 되돌리기(잘못 시작 → 대기) · ▶ 다시 진행 · ↩ 다시 준비(완료 취소) · ⚠️ 문제 기록 — 중간에 잘못되거나 막혔을 때 (v0.8.174) */
      ((d.st === 'open' || d.st === 'prep') && canShip() ? '<button class="b-ghost b-sm" data-dvhold="' + esc(d.id) + '">⏸ ' + bt('보류', 'Hold') + '</button>' : '') +
      (d.st === 'prep' && canShip() ? '<button class="b-ghost b-sm" data-dvback="' + esc(d.id) + '" title="' + esc(bt('준비를 취소하고 대기로', 'Undo start — back to waiting')) + '">↩ ' + bt('대기로', 'Undo') + '</button>' : '') +
      (d.st === 'hold' && canShip() ? '<button class="b-blue b-sm" data-dvresume="' + esc(d.id) + '">▶ ' + bt('다시 진행', 'Resume') + '</button>' : '') +
      (d.st === 'done' && canShip() ? '<button class="b-ghost b-sm" data-dvredo="' + esc(d.id) + '" title="' + esc(bt('완료를 취소하고 다시 준비', 'Undo done — prepare again')) + '">↩ ' + bt('다시 준비', 'Redo') + '</button>' : '') +
      ((live || d.st === 'done') && canShip() ? '<button class="b-ghost b-sm" data-dvlog="' + esc(d.id) + '">⚠️ ' + bt('문제 기록', 'Log issue') + '</button>' : '') +
      ((d.st === 'done' || d.st === 'shipped') && canShip() ? '<button class="b-green b-sm" data-dvu="' + esc(d.id) + '">🚚 ' + bi(d.st === 'done' ? 'UPS 라벨' : '라벨 · 트래킹', d.st === 'done' ? 'UPS label' : 'Labels · tracking') + '</button>' : '') +
      (live && canWrite() ? '<button class="b-ghost b-sm" data-dve="' + esc(d.id) + '">✏️</button>' : '') +
      (live && canWrite() ? '<button class="b-ghost b-sm" data-dvx="' + esc(d.id) + '" style="color:#b91c1c">' + bt('취소', 'Cancel') + '</button>' : '') + '</div></div>' +
      (live ? dueTag(d) : '') + (d.note ? '<div class="dvnote">📝 ' + esc(d.note) + '</div>' : '') +
      (logs.length ? '<div class="dvlog">' + logs.map(l => '<div>' + esc(String(l.at || '').substring(5, 16).replace('T', ' ')) + ' ' + esc(String(l.byName || l.by || '').toUpperCase()) + ' — ' + esc(l.text) + '</div>').join('') + '</div>' : '') +
      '<div class="muted dvby">' + esc(String(d.createdByName || d.createdBy || '').toUpperCase()) + ' · ' + esc(fmtDay(d.createdAt)) + (d.orderNo ? ' · 🔗 <a href="#/order/' + esc(d.orderId) + '">' + esc(d.orderNo) + '</a>' : '') +
      (d.st === 'prep' && d.prepByName ? ' · ' + bt('준비', 'prep') + ' ' + esc(d.prepByName) : '') + (d.track ? ' · ' + esc(d.track) : '') + '</div></div>';
  };
  box.innerHTML = '<div id="dvWrap"><div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><div><h2 style="margin:0">Notes Display <span class="tag t-a">UPS</span></h2><div class="muted" style="margin-top:4px">' + bt('Empty Display 를 등록하고 준비한 뒤 완료하세요. 단위(개)마다 UPS 박스 한 개가 됩니다.', 'Register empty displays, prepare them, then complete. Each unit becomes one UPS box.') + '</div></div>' +
    (S.role === 'admin' ? '<button class="b-ghost b-sm" id="dvCfg">⚙️ ' + bi('상품 · 무게 · 크기', 'Items · weight · size') + '</button>' : '') + '</div>' +
    '<div class="dvkpi">' + kpi('🕒', 'k1', '대기', 'Waiting', nOpen.length, nOpen.reduce((a, d) => a + boxesOf(d), 0)) + kpi('🗃', 'k2', '준비 중', 'Preparing', nPrep.length, nPrep.reduce((a, d) => a + boxesOf(d), 0)) + kpi('⏸', 'k4', '보류', 'On hold', nHold.length, nHold.reduce((a, d) => a + boxesOf(d), 0)) + kpi('✓', 'k3', '완료 24시간', 'Done 24h', n24.length, null) +
    (canWrite() ? '<button class="dvnew" id="dvNew"><span>🗃</span><b>' + bi('새 요청', 'New request') + '</b></button>' : '') + '</div></div>' +
    '<div id="dvForm"></div>' +
    '<div class="dvcols"><div class="card"><h2 class="dvh"><i class="dot">●</i> ' + bi('준비 대기', 'To prepare') + ' <span class="dvn">' + wait.length + '</span></h2><div class="muted" style="margin:-4px 0 8px">' + bt('시작하고 박스를 준비한 뒤 완료하면 UPS 로 갑니다.', 'Start, prepare the boxes and complete — then it goes to UPS.') + '</div>' + (wait.length ? wait.map(card).join('') : '<div class="none">' + bt('준비할 디스플레이가 없습니다', 'Nothing to prepare') + '</div>') + '</div>' +
    '<div class="card"><h2 class="dvh done"><i class="dot">●</i> ' + bi('완료 (최근 24시간)', 'Done (last 24h)') + ' <span class="dvn">' + done.length + '</span></h2>' + (done.length ? done.map(card).join('') : '<div class="none">' + bt('없음', 'None') + '</div>') + '</div></div></div>';
  if (NEWOPEN) form({}, true);
  if ($('dvNew')) $('dvNew').onclick = () => { NEWOPEN = true; form({}, true); };
  if ($('dvCfg')) $('dvCfg').onclick = cfg;
  const upd = async (id, patch, msg) => { try { await S.DB.update('displays', id, Object.assign(patch, { updatedAt: new Date().toISOString() })); if (msg) toast(msg, 'good'); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } list(); };
  box.querySelectorAll('[data-dvgo]').forEach(b => b.onclick = () => upd(b.dataset.dvgo, { st: 'prep', prepAt: new Date().toISOString(), prepBy: me(), prepByName: myName() }, bt('준비 시작', 'Started')));
  const logOf = (d, text) => (d.log || []).concat([{ at: new Date().toISOString(), by: me(), byName: myName(), text }]).slice(-20);
  const tell = (d, text) => { try { Msg.sendMsg({ to: 'u:' + (d.createdBy || ''), toLabel: d.createdByName || d.createdBy || '', text: '🖼 Notes Display ' + d.store + ' — ' + text, ref: { id: 'displays', label: '🖼 Notes Display' }, quiet: true }); } catch (e) {} };   // 요청한 사무실 담당에게 (앱 안 메시지)
  box.querySelectorAll('[data-dvhold]').forEach(b => b.onclick = async () => { const d = L.find(x => x.id === b.dataset.dvhold); if (!d) return; const why = await askText('⏸ ' + bi('보류', 'Hold'), bt('이유 — 예: 물건 없음 · 사무실 확인 필요 · 상품 잘못됨', 'Reason — e.g. out of stock · need office to confirm · wrong item')); if (why == null) return; tell(d, '⏸ ' + bt('보류', 'on hold') + ': ' + why); upd(d.id, { st: 'hold', holdAt: new Date().toISOString(), holdBy: me(), holdNote: why, log: logOf(d, '⏸ ' + bt('보류', 'Hold') + ': ' + why) }, bt('보류했습니다', 'On hold')); });
  box.querySelectorAll('[data-dvresume]').forEach(b => b.onclick = () => { const d = L.find(x => x.id === b.dataset.dvresume); if (!d) return; upd(d.id, { st: 'open', holdNote: '', log: logOf(d, '▶ ' + bt('다시 진행', 'Resumed')) }, bt('다시 진행', 'Resumed')); });
  box.querySelectorAll('[data-dvback]').forEach(b => b.onclick = async () => { const d = L.find(x => x.id === b.dataset.dvback); if (!d) return; if (!(await confirmBox(bt('준비를 취소하고 대기로 되돌릴까요? (☑ 표시는 지워집니다)', 'Undo the start and return to waiting? Ticks are cleared.'), '↩'))) return; upd(d.id, { st: 'open', items: (d.items || []).map(x => Object.assign({}, x, { ok: false })), log: logOf(d, '↩ ' + bt('대기로 되돌림', 'Back to waiting')) }, bt('대기로 되돌렸습니다', 'Back to waiting')); });
  box.querySelectorAll('[data-dvredo]').forEach(b => b.onclick = async () => { const d = L.find(x => x.id === b.dataset.dvredo); if (!d) return; if (!(await confirmBox(bt('완료를 취소하고 다시 준비할까요?', 'Undo done and prepare again?'), '↩'))) return; upd(d.id, { st: 'prep', items: (d.items || []).map(x => Object.assign({}, x, { ok: false })), log: logOf(d, '↩ ' + bt('완료 취소 · 다시 준비', 'Done undone — preparing again')) }, bt('다시 준비', 'Preparing again')); });
  box.querySelectorAll('[data-dvlog]').forEach(b => b.onclick = async () => { const d = L.find(x => x.id === b.dataset.dvlog); if (!d) return; const t = await askText('⚠️ ' + bi('문제 기록', 'Log an issue'), bt('무엇이 잘못됐나 — 예: 상품 1개 파손 · 수량 부족 · 주소 확인 필요', 'What went wrong — e.g. 1 damaged · short qty · check address')); if (!t) return; tell(d, '⚠️ ' + t); upd(d.id, { log: logOf(d, '⚠️ ' + t) }, bt('기록했습니다', 'Logged')); });
  box.querySelectorAll('[data-dvok]').forEach(c => c.onchange = () => { const [id, i] = c.dataset.dvok.split('|'), d = L.find(x => x.id === id); if (!d) return; const items = (d.items || []).map((x, k) => k === Number(i) ? Object.assign({}, x, { ok: c.checked }) : x); upd(id, { items }); });
  box.querySelectorAll('[data-dvdone]').forEach(b => b.onclick = async () => {
    const d = L.find(x => x.id === b.dataset.dvdone); if (!d) return;
    await upd(d.id, { st: 'done', doneAt: new Date().toISOString(), doneBy: me(), doneByName: myName(), boxes: boxesOf(d) }, '✅ ' + bt('완료 — UPS 라벨을 만드세요', 'Done — make the UPS label'));
    ups(Object.assign({}, d, { st: 'done' }));
  });
  box.querySelectorAll('[data-dvu]').forEach(b => b.onclick = () => { const d = L.find(x => x.id === b.dataset.dvu); if (d) ups(d); });
  box.querySelectorAll('[data-dve]').forEach(b => b.onclick = () => { NEWOPEN = false; form(L.find(d => d.id === b.dataset.dve) || {}, false); });
  box.querySelectorAll('[data-dvx]').forEach(b => b.onclick = async () => {
    const d = L.find(x => x.id === b.dataset.dvx); if (!d) return;
    if (!(await confirmBox(bt('이 요청을 취소할까요?', 'Cancel this request?') + '\n' + d.store + ' · ' + dispText(d), bt('취소하기', 'Cancel it')))) return;
    upd(d.id, { st: 'x', cancelAt: new Date().toISOString(), cancelBy: me() }, bt('취소했습니다', 'Cancelled'));
  });
}
/** 🚚 UPS — 단위마다 박스 한 개 (상품의 무게 · 크기) */
async function ups(d) {
  const Ship = await import('./ship.js');
  const boxSpec = []; (d.items || []).forEach(x => { for (let i = 0; i < (Number(x.q) || 0); i++) boxSpec.push({ w: Number(x.w) || '', l: Number(x.l) || '', wd: Number(x.wd) || '', h: Number(x.h) || '', ref2: String(x.n).substring(0, 35) }); });
  Ship.shipModal({ id: d.id, col: 'displays', no: 'NOTES DISPLAY', acct: d.acct || '', store: d.store, sm: d.sm || '', invs: [], st: d.st, boxSpec, desc: 'DISPLAY FIXTURES', shipTo: d.shipTo || null }, () => list());
}

/* ---------- 새 요청 · 고치기 (화면 위 칸 — 직원 앱처럼) ---------- */
/** pre: 고칠 문서 또는 { acct, store, sm, orderId, orderNo, req } (주문에서 열 때) · inline: 목록 위 칸으로 (아니면 창) */
export async function form(pre, inline) {
  pre = pre || {};
  const host = inline && $('dvForm');
  const F = { id: pre.id || '', acct: pre.acct || '', store: pre.store || '', sm: pre.sm || '', items: (pre.items || []).map(x => Object.assign({}, x)), due: pre.due || '', note: pre.note || '', orderId: pre.orderId || '', orderNo: pre.orderNo || '' };
  /* 주문에서 열면 세일즈맨이 요청한 종류 · 개수 · 설명("어떤 것")이 상품 줄로 미리 들어옴 — 사무실은 보고 고치기만 */
  if (!F.items.length && !F.id) { const rq = reqClean(pre.req), rn = reqNoteClean(pre.reqNote) || {}; if (rq) Object.keys(rq).forEach(k => F.items.push({ n: reqLabel(k, true), q: rq[k], note: rn[k] || '', custom: true })); }
  if (!F.items.length) F.items.push({ n: '', q: 1 });
  const C = catalogItems();
  /* 카탈로그의 디스플레이 · 세트 · 인서트 (Set & Display 묶음 · [DISPLAYS …] 분류) — 전체에서 고를 수 있게 */
  try { await loadCatalog(S); } catch (e) {}
  const K = catalog() ? catalog().items.filter(it => !it.h && (/SET|DISPLAY/i.test(it.g || '') || /SET ORDER|DISPLAY/i.test(it.l1 || ''))) : [];
  const CUSTOM = '__custom__';
  const optFor = x => '<option value="">' + bt('— 상품 —', '— item —') + '</option><optgroup label="' + esc(bt('디스플레이 (무게 · 크기 있음)', 'Displays (weight · size)')) + '">' + C.map(c => '<option value="' + esc(c.n) + '"' + (!x.c && !x.custom && c.n === x.n ? ' selected' : '') + '>' + esc(c.n) + ' · ' + esc(specTxt(c)) + '</option>').join('') + '</optgroup>' +
    '<optgroup label="' + esc(bt('✏️ 직접 입력 · 특별 제작', '✏️ Custom / special build')) + '"><option value="' + CUSTOM + '"' + (x.custom ? ' selected' : '') + '>✏️ ' + esc(bt('직접 입력 (아래에 이름 · 설명)', 'Type it in (name · note below)')) + '</option></optgroup>' +
    (K.length ? '<optgroup label="' + esc(bt('카탈로그 디스플레이 · 세트 · 인서트', 'Catalog displays · sets · inserts')) + ' (' + K.length + ')">' + K.map(it => '<option value="c:' + esc(it.c) + '"' + (x.c === it.c ? ' selected' : '') + '>' + esc(it.c) + ' · ' + esc(it.d) + '</option>').join('') + '</optgroup>' : '');
  const html = () => '<div class="dvform"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">' + (F.id ? bi('요청 고치기', 'Edit request') : bi('새 요청', 'New request')) + '</h2><button type="button" class="b-ghost b-sm" id="dvX">✕ ' + bt('닫기', 'Close') + '</button></div>' +
    (F.orderNo ? '<div class="alert a-blu" style="margin:8px 0 0">🔗 ' + bt('주문', 'Order') + ' <b>' + esc(F.orderNo) + '</b>' + (pre.req && reqText(pre.req) ? ' · ' + bt('요청', 'requested') + ': ' + esc(reqText(pre.req)) : '') + '</div>' : '') +
    '<div class="fg" style="margin-top:8px"><label>' + bt('고객', 'Customer') + '</label><div class="dvcust"><input id="dvStore" value="' + esc(F.store ? (F.acct ? F.acct + ' ' : '') + F.store : '') + '" autocomplete="off" placeholder="' + esc(bt('이름, 주소 또는 계정 번호', 'Name, address or account #')) + '"><button type="button" class="b-ghost" id="dvNewAcct">＋ ' + bt('고객 등록', 'New customer') + '</button></div><div id="dvHits" class="hits" style="display:none"></div></div>' +
    '<div class="fg"><label>' + bt('디스플레이 상품 · 개수', 'Display items · qty') + ' <span class="muted">' + bt('— 설정 상품 · 카탈로그 전체 · 직접 입력(특별 제작)', '— configured · whole catalog · custom') + '</span></label><div id="dvItems">' + F.items.map((x, i) => '<div class="dvirow"><select data-dvi="' + i + '">' + optFor(x) + '</select><input type="number" inputmode="numeric" min="1" data-dvq="' + i + '" value="' + esc(x.q || 1) + '" style="width:76px;text-align:right;font-weight:800"><button type="button" class="b-ghost b-sm" data-dvdel="' + i + '">✕</button></div>' +
      '<div class="dvirow dvsub2"><input data-dvc="' + i + '" value="' + esc(x.custom ? x.n : '') + '" placeholder="' + esc(bt('✏️ 직접 입력 — 이름 (예: C13 Insert 앵클렛용)', '✏️ Custom — name (e.g. C13 insert for anklets)')) + '"' + (x.custom ? '' : ' style="display:none"') + '><input data-dvn="' + i + '" value="' + esc(x.note || '') + '" placeholder="' + esc(bt('설명 · 어떤 것 (예: 앵클렛 13" · 세트 코드 · 특별 제작 내용)', 'Note · which one (e.g. anklet 13" · set code · special build)')) + '"></div>').join('') + '</div><button type="button" class="b-ghost b-sm" id="dvAdd">＋ ' + bt('상품 추가', 'Add item') + '</button></div>' +
    '<div class="two"><div class="fg"><label>' + bt('나갈 날짜', 'Ship date') + '</label><input type="date" id="dvDue" value="' + esc(F.due || today()) + '"></div><div class="fg"><label>' + bt('메모', 'Note') + '</label><input id="dvNote" value="' + esc(F.note) + '" placeholder="' + esc(bt('창고에 전할 말', 'Note for the warehouse')) + '"></div></div>' +
    '<div class="btns"><button type="button" class="b-blue" id="dvSave">💾 ' + bt('저장', 'Save') + '</button></div></div>';
  const keep = () => { F.items = Array.from(document.querySelectorAll('[data-dvi]')).map(s => { const i = s.dataset.dvi, q = Math.max(1, Math.floor(Number(document.querySelector('[data-dvq="' + i + '"]').value) || 1)), note = (document.querySelector('[data-dvn="' + i + '"]') || {}).value || '', cv = (document.querySelector('[data-dvc="' + i + '"]') || {}).value || '';
    if (s.value === CUSTOM) return { n: cv.trim(), q, note, custom: true };
    if (s.value.indexOf('c:') === 0) { const it = catalog() && catalog().byCode[s.value.substring(2)]; return { n: it ? it.d : s.value.substring(2), c: s.value.substring(2), q, note }; }
    return { n: s.value, q, note }; }); F.due = $('dvDue').value; F.note = $('dvNote').value; };
  const close = () => { NEWOPEN = false; if (host) host.innerHTML = ''; else closeModal(); };
  const paint = () => {
    if (host) { host.innerHTML = '<div class="card">' + html() + '</div>'; } else openModal(html());
    $('dvX').onclick = close;
    $('dvAdd').onclick = () => { keep(); F.items.push({ n: '', q: 1 }); paint(); };
    document.querySelectorAll('[data-dvi]').forEach(s => s.onchange = () => { const c = document.querySelector('[data-dvc="' + s.dataset.dvi + '"]'); if (c) { c.style.display = s.value === CUSTOM ? '' : 'none'; if (s.value === CUSTOM) c.focus(); } });
    document.querySelectorAll('[data-dvdel]').forEach(b => b.onclick = () => { keep(); F.items.splice(Number(b.dataset.dvdel), 1); if (!F.items.length) F.items.push({ n: '', q: 1 }); paint(); });
    $('dvNewAcct').onclick = async () => { keep(); const NA = await import('./newacct.js'); NA.newAcctForm($('dvStore').value.trim(), a => { F.acct = a.acct; F.store = a.store; F.sm = a.sm || F.sm; paint(); }); };
    const hits = $('dvHits');
    $('dvStore').oninput = () => {
      F.acct = ''; F.store = $('dvStore').value.trim();
      const R = S.accounts && S.accounts.byCode ? searchAccounts(S.accounts, $('dvStore').value, 8) : [];
      hits.style.display = R.length ? '' : 'none';
      hits.innerHTML = R.map(a => '<div data-dva="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b> <span class="muted">' + esc(a.acct) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.city ? ' · ' + esc(a.city) : '') + '</span></div>').join('');
      hits.querySelectorAll('[data-dva]').forEach(el => el.onclick = () => { const a = S.accounts.byCode[el.dataset.dva]; F.acct = a.acct; F.store = a.store; F.sm = a.sm || F.sm; $('dvStore').value = a.acct + ' ' + a.store; hits.style.display = 'none'; });
    };
    $('dvSave').onclick = async () => {
      keep();
      const items = F.items.filter(x => x.n).map(x => { const c = !x.c && !x.custom ? (C.find(y => y.n === x.n) || {}) : {}; const o = { n: x.n, q: x.q, w: c.w || 0, l: c.l || 0, wd: c.wd || 0, h: c.h || 0, ok: false }; if (x.c) o.c = x.c; if (x.custom) o.custom = true; if (x.note && x.note.trim()) o.note = x.note.trim(); return o; });
      if (F.items.some(x => x.custom && !x.n)) return toast(bt('직접 입력 상품의 이름을 적으세요', 'Type a name for the custom item'), 'bad');
      if (!F.store) return toast(bt('고객을 고르세요', 'Pick the customer'), 'bad');
      if (!items.length) return toast(bt('디스플레이 상품을 고르세요', 'Pick the display items'), 'bad');
      if (!F.due) return toast(bt('나갈 날짜를 넣으세요', 'Enter the ship date'), 'bad');
      const now = new Date().toISOString(), id = F.id || newId('DS');
      const doc = { id, acct: F.acct, store: F.store, sm: F.sm, items, due: F.due, note: F.note.trim(), orderId: F.orderId, orderNo: F.orderNo, updatedAt: now };
      doc.qty = boxesOf(doc);
      busy(true);
      try {
        if (F.id) await S.DB.update('displays', id, doc);
        else {
          await S.DB.set('displays', id, Object.assign(doc, { st: 'open', createdBy: me(), createdByName: myName(), createdAt: now }));
          /* 창고에 🔔 — 앱 안 알림 + 팝업 (메일 · 챗 없음) */
          try { await Msg.sendMsg({ to: 'g:wh', toLabel: bt('창고', 'Warehouse'), text: '🖼 Notes Display: ' + doc.store + ' — ' + dispText(doc) + ' · ' + bt('박스', 'boxes') + ' ' + doc.qty + ' · 📅 ' + md(doc.due) + (doc.note ? '\n📝 ' + doc.note : ''), ref: { id: 'displays', label: '🖼 Notes Display' }, quiet: true }); } catch (e) {}
        }
        close(); toast('💾 ' + bt('저장했습니다', 'Saved'), 'good');
        if (location.hash.indexOf('#/displays') === 0) list(); else if (pre.after) pre.after();
      } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  paint();
}
/** 글 한 줄 묻기 — 취소하면 null */
function askText(title, ph) {
  return new Promise(res => {
    openModal('<h2>' + title + '</h2><textarea id="atT" rows="3" placeholder="' + esc(ph) + '" style="margin-top:8px"></textarea><div class="btns"><button type="button" class="b-ghost" id="atX">' + bt('취소', 'Cancel') + '</button><button type="button" class="b-blue" id="atOk">' + bt('저장', 'Save') + '</button></div>');
    let done = false; const fin = v => { if (done) return; done = true; closeModal(); res(v); };
    $('atX').onclick = () => fin(null); $('atOk').onclick = () => { const v = $('atT').value.trim(); if (!v) return toast(bt('내용을 적으세요', 'Type something'), 'bad'); fin(v); };
    $('modal')._onClose = () => fin(null); setTimeout(() => $('atT') && $('atT').focus(), 50);
  });
}
/* ---------- ⚙️ 상품 · 무게 · 크기 (관리자) ---------- */
function cfg() {
  let L = catalogItems().map(x => Object.assign({}, x));
  const paint = () => {
    openModal('<h2>⚙️ ' + bi('디스플레이 상품 · 무게 · 크기', 'Display items · weight · size') + '</h2><div class="muted">' + bt('UPS 박스 한 개 = 상품 한 개. 무게(lb)와 상자 크기(in)가 UPS 라벨에 그대로 들어갑니다.', 'One UPS box per unit — weight (lb) and box size (in) go onto the label.') + '</div>' +
      '<table style="margin-top:8px"><tr><th>' + bt('이름', 'Name') + '</th><th>lb</th><th>L</th><th>W</th><th>H</th><th></th></tr>' + L.map((x, i) => '<tr><td><input data-cn="' + i + '" value="' + esc(x.n) + '"></td>' + ['w', 'l', 'wd', 'h'].map(k => '<td><input type="number" inputmode="decimal" data-c' + k + '="' + i + '" value="' + esc(x[k] || '') + '" style="width:58px"></td>').join('') + '<td><button class="b-ghost b-sm" data-cdel="' + i + '">✕</button></td></tr>').join('') + '</table>' +
      '<div class="btns"><button class="b-ghost" id="cAdd">＋ ' + bt('상품', 'Item') + '</button><button class="b-ghost" id="cX">' + bt('닫기', 'Close') + '</button><button class="b-blue" id="cSave">💾 ' + bt('저장', 'Save') + '</button></div>');
    const keep = () => { L = L.map((x, i) => ({ n: ($('mbox').querySelector('[data-cn="' + i + '"]') || {}).value || '', w: Number(($('mbox').querySelector('[data-cw="' + i + '"]') || {}).value) || 0, l: Number(($('mbox').querySelector('[data-cl="' + i + '"]') || {}).value) || 0, wd: Number(($('mbox').querySelector('[data-cwd="' + i + '"]') || {}).value) || 0, h: Number(($('mbox').querySelector('[data-ch="' + i + '"]') || {}).value) || 0 })); };
    $('cX').onclick = closeModal; $('cAdd').onclick = () => { keep(); L.push({ n: '', w: 0, l: 0, wd: 0, h: 0 }); paint(); };
    document.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => { keep(); L.splice(Number(b.dataset.cdel), 1); paint(); });
    $('cSave').onclick = async () => { keep(); const items = L.filter(x => x.n.trim()).map(x => Object.assign(x, { n: x.n.trim().toUpperCase() })); busy(true); try { await S.DB.batch([{ op: 'merge', col: 'settings', id: 'app', data: { displayItems: items, updatedAt: new Date().toISOString() } }]); S.settings.displayItems = items; closeModal(); toast('💾 ' + bt('저장했습니다', 'Saved'), 'good'); list(); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  };
  paint();
}
/** 주문에서 — 그 주문의 Notes Display 요청 수 (단추에 숫자) */
export async function countForOrder(orderId) { try { return (await S.DB.list('displays', { where: [['orderId', '==', orderId]] })).filter(d => d.st !== 'x').length; } catch (e) { return 0; } }
