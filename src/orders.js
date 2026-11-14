/* ============================================================
 *  주문 — 세일즈맨 (폰 · 아이패드, 인터넷 없어도 됨)
 *    가게 고르기 → 아이템 담기 (가격 · 수량 · 할인 수정 가능) → 저장/보내기
 *    저장하면 먼저 폰의 "보낼 함"에 넣고, 인터넷이 되면 회사로 보냄 → 보낸 뒤에야 보낼 함에서 지움 (주문이 사라지지 않게)
 *  매니저 처리(픽킹 → 인보이스 확정 → 백오더)는 fulfill.js
 *
 *  orders/{id}     = { id, no, d, ym, sm, acct, store, st, n, qty, amt, list, pdiff, pdn, disc:{A:20}, discChg, memo,
 *                      createdBy, createdAt, updatedAt, sentAt, pickAt, pickBy, invs:[], doneAt, doneBy, bo }   ← 목록용
 *  orderLines/{id} = { sm, lines:[{c, d, q, p, lp, t, pq?, note?}] }   (lp = 목록가, t = 인보이스 종류, pq = 픽킹 수량)
 *  st: draft(임시저장) → sent(보냄) → pick(픽킹 중) → done(인보이스 확정) · x(취소)
 * ============================================================ */
import { $, esc, money, R2, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, sel, sortBy, debounce, bi, bt, hasWords, addDays, daysBetween, localDay, sum, groupBy, pickDates, guardSync, pageHead, narrow, crow, cgrp, footBtns } from './ui.js';
import { REQ_KINDS, reqClean, reqText, reqCount, reqLabel, reqNoteClean, reqNeedsNote } from './reqs.js';
import { searchAccounts, accountLabel, patchAccountCache } from './accounts.js';
import { loadCatalog, catalog, searchItems, newItems, exactItem, thumb, catStart, treeFor, cleanName, prefixRank } from './catalog.js';
import { jobOf, can, dockMark, myJobs, isOwner } from './main.js';
import { invTypes, typeOfItem, acctDisc, splitByType, priceDiff, salesRows, invCount, obWhole, obFix, obDisc } from './invoicing.js';
import * as Fulfill from './fulfill.js';
import * as Store from './store.js';
import * as Notes from './notes.js';
import { stageAge } from './flow.js';
import * as SH from './sorthead.js';
import { stockOf, stockAll, minOf } from './stock.js';
import * as Dash from './dash.js';
import { icon, stageIcon, routeIcon } from './icons.js';
import * as NewAcct from './newacct.js';
import * as Notify from './notify.js';

let S = null;
const DT = () => invTypes(S)[0].c;   // 기본 인보이스 종류
export function register(state) {
  /* 아래 메뉴: 🏠 홈 = 할 일 타일(현황 · 바로가기) · 🛒 세일 = 내 일의 첫 목록 (세일즈맨 앱과 같은 순서 — 홈은 보기, 세일은 작업) */
  S = state; Router.on('order', arg => { if (!arg && Router.navTap === 'order') { LF.init = true; LF.list = true; LF.st = firstList(); } Router.navTap = ''; return pageOrder(arg); });   // 아래 메뉴 🛒 세일 = 세일 처리 첫 화면
  Router.on('home', pageHome);
  /* 🏠 담당자 홈 = 내 일 목록 (창고 직원: 내 배정 작업 · 인보이스 담당: 검수 대기 · 출고/창고 매니저: 배정 대기 · 오피스: 신규 주문) */
  Router.on('shome', () => { LF.init = true; LF.list = false; return pageOrder(''); }); Fulfill.register(state); Store.register(state);
  /* ‹ 뒤로: 주문 목록(신규 · 출고 작업 …) → 주문 처리 첫 화면 */
  Router.up.order = arg => { if (!arg && isStaff() && LF.list) { LF.list = false; pageOrder(''); return true; } return false; };
  Router.upHas.order = () => isStaff() && !!LF.list;
  /* 인터넷이 다시 되면 · 앱을 다시 열면 보낼 함을 비움 */
  window.addEventListener('online', () => syncOutbox(true));
  /* 다른 화면에서 주문 목록의 칸 하나를 바로 열기 (예: 📮 UPS 픽업) */
  /* 위 메뉴 작게 · 크게 (어느 목록 화면이든) */
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-ocmp]'); if (!b) return; const on = document.body.classList.toggle('oscr'); try { localStorage.setItem('theone.ocompact', on ? '1' : '0'); } catch (x) {} b.querySelector('.ci').textContent = on ? '🔽' : '🔼'; b.querySelector('.cl').textContent = on ? bt('크게', 'Full') : bt('작게', 'Compact'); });
  window.addEventListener('theone:list', e => { LF.st = e.detail; LF.list = true; pageOrder(''); });
  window.addEventListener('theone:stage', e => { goStage(e.detail); pageOrder(''); });
  try { new MutationObserver(() => document.body.classList.toggle('omenu-on', !!document.querySelector('#page .omenu'))).observe($('page'), { childList: true }); } catch (e) {}   // 📌 왼쪽 기둥(담당자 주문 메뉴)이 있을 때만 본문을 오른쪽으로
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-orf]'); if (b && isStaff()) { LF.list = true; pageOrder(''); } });   // 🔄 새로 고침 — 지금 칸을 서버에서 다시 읽음 (어느 목록에서든)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncOutbox(true); });
}

/* 주문 상태 흐름: draft(저장됨) → sent(접수 — 화면에선 📥 신규 · ❓ 확인 대기(cfReq) · 👍 확인 완료(cfOk) 로 나눔) → … → done(인보이스 · 포장 대기) → packed(UPS 라벨 부착 · 픽업 대기) → shipped(UPS 트럭에 인계)
 *   🚗 dlv(딜리버리 대기 — UPS 가 아니라 세일즈맨 · 직원이 가져가거나 손님이 픽업) → shipped(배달 완료) · v0.8.178
 * 예전 설명: draft(저장됨) → sent(접수) → pick(픽킹 중 · picker 할당) → picked(픽킹 완료 · 사무실 확인 대기) → done(인보이스 발행 · 포장 대기) → shipped(출고 완료) · x(취소) */
export const ST = { draft: ['임시 저장', 'Draft', 't-g'], sent: ['주문 접수', 'Received', 't-b'], ok: ['출고 작업', 'In Fulfillment', 't-c'], pick: ['출고 작업', 'In Fulfillment', 't-c'], picked: ['검수 대기', 'Ready for Review', 't-a'], done: ['인보이스 발행', 'Invoiced', 't-k'], packed: ['픽업 대기', 'Awaiting Pickup', 't-c'], dlv: ['딜리버리 대기', 'Awaiting Delivery', 't-a'], shipped: ['완료', 'Completed', 't-g'], x: ['취소', 'Cancelled', 't-r'], local: ['전송 대기', 'Pending Upload', 't-r'] };
export const stName = st => { const x = ST[st] || ST.draft; return x[0] + ' · ' + x[1]; };
export const stTag = st => { const x = ST[st] || ST.draft; return '<span class="tag ' + x[2] + '" title="' + x[1] + '">' + x[0] + '</span>'; };
const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');
/** 주문의 세일즈맨을 골라 넣어야 하는 사람 — 담당자 · 관리자 모드, 또는 세일즈 모드인데 자기 세일즈맨 코드가 없는 관리자 (v0.8.172) */
const needSm = () => isStaff() || !mySm();
/** 👤 다른 세일즈맨 가게에 넣은 주문 — 쓴 사람(sm)은 그대로 두고(규칙 · 목록), 인보이스 · 커미션은 smFor 이름으로 (v0.8.188) */
export const smShow = o => esc(o.sm || '') + (o.smFor && o.smFor !== o.sm ? ' → <b>' + esc(o.smFor) + '</b>' : '');
const OUT_KEY = 'theone.outbox.v1';
/* 작성 중 주문은 로그인한 사람별로 보관 (한 기기를 여럿이 쓸 때 섞이지 않게) */
const WIP_KEY_ = 'theone.order.wip', wipKey = k => WIP_KEY_ + (k === 'credit' ? '.cr' : '') + '.' + ((S && S.user && S.user.email) || '');   // ↩ 크레딧 작성 중은 따로 (주문 작성 중과 섞이지 않게, v0.8.187)
const isCr = () => !!(O && O.kind === 'credit');
export function recentYms(n) { const out = [], d = new Date(); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; }
function newNo() { const d = today().replace(/-/g, '').substring(2); return 'O' + d + '-' + Math.floor(Math.random() * 1679616).toString(36).toUpperCase().padStart(4, '0'); }
/** 📤 보낼 때 붙이는 칸 — 주문 날짜(d · ym)는 보낸 날로, 처음 시작한 날이 다르면 d0 에 남김 (v0.8.174: 임시로 묵힌 주문이 옛 날짜로 접수되던 문제) */
/* 🔢 세일즈 오더 번호 SA-000001 … SA-999999 → SB-000001 … (회사로 보낼 때 정해짐 · counters/so.n 트랜잭션이라 동시에 보내도 겹치지 않음 · v0.8.227) */
export const SO_MAX = 999999;
export function soNo(n) { n = Math.max(1, Math.floor(Number(n) || 1)); const k = Math.floor((n - 1) / SO_MAX), r = ((n - 1) % SO_MAX) + 1; return 'S' + String.fromCharCode(65 + Math.min(k, 25)) + '-' + String(r).padStart(6, '0'); }
export const isSo = no => /^S[A-Z]-\d{6}$/.test(String(no || ''));
export async function takeSo() { return soNo(await S.DB.seq('so', 'n', 1)); }
/** 보낸 주문에 번호 붙이기 — 이미 SA 번호면 그대로 · 서버에 이미 붙어 있으면 그 번호 (다시 보내기 · 재시도에 새 번호를 쓰지 않게) · 크레딧은 CM 번호라 제외 */
/** 서버의 지금 주문 (없으면 null) — 세일즈맨은 아직 없는 주문을 규칙상 못 읽음(permission) = 새 주문 · 그 밖의 실패(인터넷)는 그대로 던짐 */
async function serverOrder(id) {
  try { return await S.DB.get('orders', id); }
  catch (e) { if (!/permission/i.test(String(e.code || e.message))) throw e; return null; }
}
/** 폰 보관함의 주문을 서버에 올릴 때 — 서버에만 있는 칸(사무실 확인 cfOk · cfHow · 요청 cfReq … · 만든 시각 등)은 그대로 이어 붙임
 *  (v0.8.236: 폰 주문에는 이 칸이 없어 통째로 덮으면 "칸을 지움"이 되고, 세일즈맨은 그 칸을 못 바꾸는 규칙(L4)에 막혀 permission-denied —
 *   임시 저장해 둔 주문을 사무실 · 세일즈맨이 "맞습니다"로 확인한 뒤 보내려 할 때) */
/* 세일즈맨이 못 바꾸는 칸 (firestore.rules smOrderUpdate L4 와 같은 목록 + 사무실 확인 표시) — 폰 값과 달라도 늘 서버 값으로 (v0.8.239:
 *   이미 회사에 들어간 주문이 폰 보관함에 남아 있으면 다시 올릴 때 "만든 시각(createdAt)" 등이 서버와 달라 계속 permission-denied 이던 것) */
const SM_LOCK = ['createdBy', 'createdAt', 'picker', 'pickerName', 'pickAt', 'pickBy', 'packAt', 'packBy', 'shipVia', 'track', 'boxes', 'shipCost', 'shipAt', 'shipBy', 'pickupId', 'invs',
  'cfReq', 'cfReqAt', 'cfReqBy', 'cfNote', 'cfHow', 'cfIssueDoneAt', 'cfIssueDoneBy', 'cfOk', 'cfAt', 'cfBy', 'cfIssue', 'cfIssueAt', 'cfIssueOpen'];
export function keepServer(o, cur) {
  if (!cur) return o;
  const out = Object.assign({}, o);
  Object.keys(cur).forEach(k => { if (k !== 'id' && out[k] === undefined) out[k] = cur[k]; });
  SM_LOCK.forEach(k => { if (k in cur) out[k] = cur[k]; else delete out[k]; });   // 잠긴 칸: 서버에 있으면 서버 값 · 없으면 폰도 넣지 않음
  return out;
}
export async function soStamp(o, cur0) {
  if (!o || isSo(o.no) || o.kind === 'credit') return null;
  const cur = cur0 !== undefined ? cur0 : await serverOrder(o.id);
  if (cur && isSo(cur.no)) return { no: cur.no, tmpNo: cur.tmpNo || o.no };
  if (cur && cur.st && cur.st !== 'draft') return null;   // 예전에 이미 보낸 주문(옛 O 번호)을 고쳐 저장 — 번호 그대로
  return { no: await takeSo(), tmpNo: o.no };
}
export function sendStamp(o) { const now = new Date().toISOString(), t = today(); const x = { st: 'sent', sentAt: now, updatedAt: now, d: t, ym: ym(t) }; if (o.d && o.d !== t && !o.d0) x.d0 = o.d; return x; }
/** 같은 주소면 hashchange 가 안 생기므로 직접 엶 */
export function goOrder(id) { if (location.hash === '#/order/' + encodeURIComponent(id)) pageOrder(id); else Router.go('order', id); }
/** 인보이스로 끝난 주문 (v0.8.226 — 인보이스 발행 = ✅ 완료, shipVia INVOICE) = 예전 done 과 같게: 주문 줄은 못 고치고 인보이스 수정 · VOID 로 */
export const invDone = o => o.st === 'done' || (o.st === 'shipped' && o.shipVia === 'INVOICE');
export const canEdit = o => isStaff() ? (!invDone(o) && o.st !== 'x') : (o.sm === mySm() && (o.st === 'draft' || o.st === 'sent' || o.st === 'local'));

/* ============================================================
 *  보낼 함 (outbox) — 폰에 저장 → 인터넷 되면 전송
 * ============================================================ */
function readOut() { try { return JSON.parse(localStorage.getItem(OUT_KEY) || '{}') || {}; } catch (e) { return {}; } }
function writeOut(m) { try { localStorage.setItem(OUT_KEY, JSON.stringify(m)); window.dispatchEvent(new Event('theone:net')); return true; } catch (e) { return false; } }
export function outboxList() { return Object.values(readOut()); }
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
let SYNCING = false;
/** 보낼 함의 주문을 회사로 — 성공한 것만 지움. 돌려주는 값: { sent, left } */
export async function syncOutbox(quiet) {
  if (SYNCING || !S || !S.DB) return { sent: 0, left: outboxList().length };
  const box = readOut(), ids = Object.keys(box);
  if (!ids.length) return { sent: 0, left: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { sent: 0, left: ids.length };
  SYNCING = true; let sent = 0;
  for (const id of ids) {
    const x = box[id];
    try {
      const cur = await withTimeout(serverOrder(id), 20000);   // 서버의 지금 주문 — 번호 확인 · 서버에만 있는 칸 이어 붙이기
      if (x.o.st && x.o.st !== 'draft' && !isSo(x.o.no)) {   /* 🔢 보내지는 순간 번호 — 먼저 폰 보관함에 적어 두고 올림 (올리다 끊겨도 다음에 같은 번호) */
        const sx = await withTimeout(soStamp(x.o, cur), 20000);
        if (sx) { Object.assign(x.o, sx); const b2 = readOut(); if (b2[id] && b2[id].at === x.at) { b2[id].o = x.o; writeOut(b2); } }
      }
      await withTimeout(S.DB.batch([{ op: 'set', col: 'orders', id, data: keepServer(x.o, cur) }, { op: 'set', col: 'orderLines', id, data: { sm: x.o.sm, lines: x.lines } }]), 20000);
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
/* 🏠 세일즈맨 홈 — 오늘 한눈에: 인사 · 숫자 4개 · ✅ 오늘 할 일 · 📝 오늘 플랜 · 바로 가기 (주문 작업 자체는 🛒 세일 탭) */
const PLAN_KEY = () => 'theone.plan.' + ((S.user && S.user.email) || '');
/* 📝 오늘 플랜 = 번호 목록 + ✓ 체크 (v0.8.242 · 2026-11-14 관리자: "번호순으로 · 체크해서 한 것과 안 한 것 구분")
 *   폰 저장 모양: { v: 2, items: [{ t, done }], at, text } — text 는 줄마다 한 항목 (옛 앱 버전이 읽는 칸이라 계속 같이 씀)
 *   옛 모양 { text, at } (v0.8.150 ~ 0.8.241 의 자유 글) 은 줄마다 한 항목으로 읽음 — 그대로 이어서 씀 */
const planGet = () => { let p = null; try { p = JSON.parse(localStorage.getItem(PLAN_KEY()) || 'null'); } catch (e) {} p = p || {};
  const items = Array.isArray(p.items) ? p.items.filter(x => x && String(x.t || '').trim()).map(x => ({ t: String(x.t), done: !!x.done })) : String(p.text || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean).map(t => ({ t, done: false }));
  return { items, at: p.at || '' }; };
const planPut = items => { try { const it = items.filter(x => String(x.t || '').trim()); localStorage.setItem(PLAN_KEY(), JSON.stringify({ v: 2, items: it, at: new Date().toISOString(), text: it.map(x => x.t).join('\n') })); } catch (e) {} };
/* 🎨 선 아이콘 (조의 디자인 v0.8.203 톤 — v0.8.242 화면 안쪽까지): 제목 앞 · 색 네모 안 */
const hic = n => icon(n, 20, 'hic'), tic = (n, c) => '<span class="tq ' + (c || '') + '">' + icon(n, 20) + '</span>';
const WD_KO = ['일', '월', '화', '수', '목', '금', '토'], WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** 📝 오늘 플랜 목록 — 1 2 3 번호 · ☐/☑ 체크(한 것은 줄 긋고 회색) · 글 바로 고치기 · ✕ 지우기 · 맨 아래 칸에 쓰고 Enter = 추가
 *  줄에서 Enter = 바로 아래 새 줄 · 빈 줄에서 ⌫ = 그 줄 지우기 · 바뀔 때마다 이 폰에 저장 */
function planBox(box, items) {
  if (!box) return;
  const save = () => { planPut(items); const at = $('dPlanAt'); if (at) at.textContent = bt('저장됨', 'saved') + ' ' + md(today()); cnt(); };
  const saveSoon = debounce(save, 300);
  const cnt = () => { const c = box.querySelector('.plcnt'), n = items.filter(x => String(x.t).trim()).length, d = items.filter(x => x.done && String(x.t).trim()).length; if (c) { c.textContent = n ? bt('완료', 'Done') + ' ' + d + ' / ' + n : ''; c.classList.toggle('all', !!n && d === n); } };
  const draw = focus => {
    box.innerHTML = '<ol class="pll">' + items.map((x, i) => '<li class="pli' + (x.done ? ' done' : '') + '"><span class="pn">' + (i + 1) + '</span>' +
      '<label class="pck" title="' + esc(bt('한 것 · 안 한 것', 'Done / not done')) + '"><input type="checkbox" data-pc="' + i + '"' + (x.done ? ' checked' : '') + '></label>' +
      '<input class="pt" data-pt="' + i + '" value="' + esc(x.t) + '" enterkeyhint="next">' +
      '<button type="button" class="px" data-px="' + i + '" title="' + esc(bt('지우기', 'Remove')) + '" aria-label="' + esc(bt('지우기', 'Remove')) + '">' + icon('x', 16) + '</button></li>').join('') + '</ol>' +
      '<div class="pladd"><span class="pn">' + (items.length + 1) + '</span><input id="dPlanNew" placeholder="' + esc(items.length ? bt('할 일 더하기 — 쓰고 Enter', 'Add a task — type and press Enter') : bt('예: 올랜도 3곳 방문 — 쓰고 Enter', 'e.g. visit 3 stores in Orlando — press Enter')) + '" enterkeyhint="done">' +
      '<button type="button" class="b-ghost b-sm" id="dPlanAdd">' + icon('plus', 16) + ' ' + bt('추가', 'Add') + '</button></div><div class="plcnt"></div>';
    cnt();
    box.querySelectorAll('[data-pc]').forEach(c => c.onchange = () => { items[+c.dataset.pc].done = c.checked; c.closest('li').classList.toggle('done', c.checked); save(); });
    box.querySelectorAll('[data-pt]').forEach(t => {
      const i = +t.dataset.pt;
      t.oninput = () => { items[i].t = t.value; saveSoon(); };
      t.onkeydown = e => {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); items[i].t = t.value; items.splice(i + 1, 0, { t: '', done: false }); draw(i + 1); }
        else if (e.key === 'Backspace' && !t.value) { e.preventDefault(); items.splice(i, 1); save(); draw(i > 0 ? i - 1 : 'new'); }
      };
      t.onblur = () => { if (items[i] && items[i].t === t.value) save(); };   // 빈 줄은 저장할 때 빠짐 (planPut)
    });
    box.querySelectorAll('[data-px]').forEach(b => b.onclick = () => { items.splice(+b.dataset.px, 1); save(); draw(); });
    const nw = $('dPlanNew'), add = () => { const v = nw.value.trim(); if (!v) return; items.push({ t: v, done: false }); save(); draw('new'); };
    nw.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } };
    $('dPlanAdd').onclick = add;
    if (focus === 'new') nw.focus(); else if (typeof focus === 'number') { const t = box.querySelector('[data-pt="' + focus + '"]'); if (t) t.focus(); }
  };
  draw();
}
async function pageHome() {
  const name = (S.user && (S.user.name || S.user.email)) || '', sm = mySm(), now = new Date(), hr = now.getHours();
  const hello = hr < 11 ? bt('좋은 아침이에요', 'Good morning') : hr < 17 ? bt('좋은 오후예요', 'Good afternoon') : bt('수고 많으셨어요', 'Good evening');
  const dateTxt = bt((now.getMonth() + 1) + '월 ' + now.getDate() + '일 (' + WD_KO[now.getDay()] + ')', WD_EN[now.getDay()] + ', ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()] + ' ' + now.getDate());
  const out = outboxList().filter(x => x.o.sm === sm);
  const kpi = (id, v, lab, go) => '<button type="button" class="dk" data-hg="' + go + '"><b id="' + id + '">' + v + '</b><span>' + lab + '</span></button>';
  const qa = (go, ic, lab, cls) => '<button type="button" class="qb ' + (cls || '') + '" data-hg="' + go + '"><span class="i">' + (icon(ic, 26) || ic) + '</span><b>' + lab + '</b></button>';
  const plan = planGet();
  $('page').innerHTML =
    '<div class="card dhead"><div><div class="muted">' + dateTxt + '</div><h1>' + hello + ', ' + esc(String(name).split(/\s+/)[0]) + '</h1><div class="muted">' + icon('car', 15) + ' ' + esc(sm) + ' · ' + (navigator.onLine === false ? '<span class="warn">' + bt('오프라인', 'Offline') + '</span>' : '<span class="ok">' + bt('온라인', 'Online') + '</span>') + (out.length ? ' · <span class="warn">📤 ' + bt('안 보낸 주문', 'unsent') + ' ' + out.length + '</span>' : '') + '</div></div><img src="logo.png" alt=""></div>' +
    '<div class="dkpi">' + kpi('dkSales', '…', bt('이번 달 매출', 'Sales this month'), 'mysales') + kpi('dkToday', '…', bt('오늘 주문', 'Orders today'), 'order') + kpi('dkSend', out.length ? out.length : '…', bt('보낼 주문', 'To send'), 'order') + kpi('dkAr', '…', bt('미수금', 'Receivables'), 'ar') + '</div>' +
    '<div class="card"><h2>' + hic('check') + ' ' + bi('오늘 할 일', 'Today') + '</h2><div id="dTodo" class="todo"><div class="muted">' + bt('읽는 중…', 'Loading…') + '</div></div></div>' +
    '<div class="card"><h2>' + hic('pen') + ' ' + bi('오늘 플랜', 'Today\'s plan') + ' <span class="muted" style="font-weight:400;font-size:12px" id="dPlanAt">' + (plan.at ? bt('마지막 수정', 'last edit') + ' ' + esc(md(plan.at.substring(0, 10))) : bt('이 폰에 저장됩니다', 'saved on this phone')) + '</span></h2>' +
    '<div id="dPlan" class="plan"></div></div>' +
    '<div class="card"><h2>' + hic('zap') + ' ' + bi('바로 가기', 'Quick actions') + '</h2><div class="qgrid">' + qa('order/new', 'cart', bi('새 주문', 'New order'), 'blue') + qa('entry/new', 'pen', bi('수금 입력', 'Payment')) + qa(isStaff() ? 'credit/new' : 'order/credit', 'undo', bi('크레딧 · 리턴', 'Credit')) + qa('stores', 'store', bi('가게 찾기', 'Stores')) + qa('cat', 'book', bi('카탈로그', 'Catalog')) + qa('mysales', 'trend', bi('내 매출', 'My sales')) + qa('mine', 'clipList', bi('수금 기록', 'Payment log')) + '</div></div>' +
    '<div id="dayCf"></div><div id="offCard"></div>' + Notify.blockedHtml();   /* 🔔 알림은 항상 켜짐 (v0.8.179) — 켜기 단추 없이 처음 누를 때 자동으로 물어봄 · 막혔으면 허용하는 법 */
  document.querySelectorAll('[data-hg]').forEach(b => b.onclick = () => { const [r, a] = b.dataset.hg.split('/'); if (a) Router.go(r, a); else Router.go(r); });
  planBox($('dPlan'), plan.items);
  Notify.dayCard($('dayCf')); import('./offline.js').then(O => O.homeCard($('offCard'), true));
  /* 숫자 — 폰에 둔 지난 값 먼저, 그 다음 새로 읽음 */
  try { const ms = JSON.parse(localStorage.getItem('theone.snap.mysales.' + sm) || 'null'), M = ms && ms.html && ms.html.M, k = M && Object.keys(M).sort().pop(); if (k && $('dkSales')) $('dkSales').textContent = money(M[k].tot || 0); } catch (e) {}
  const todo = [];
  try {
    const rows = await S.DB.list('orders', { where: [['sm', '==', sm], ['ym', 'in', recentYms(2)]] });
    const t = today(), outIds = new Set(out.map(x => x.o.id)), drafts = rows.filter(o => o.st === 'draft' && !outIds.has(o.id)).length + out.length,   /* 폰 보관함에 있는 주문은 서버 임시 저장과 겹쳐 세지 않음 (v0.8.233: 2건이 4건으로 보이던 것) */ todayN = rows.filter(o => o.d === t && o.st !== 'x').length + out.filter(x => x.o.d === t).length;
    const cf = rows.filter(o => o.cfReq && !o.cfOk && o.st !== 'x').length;
    if ($('dkToday')) $('dkToday').textContent = todayN; if ($('dkSend')) $('dkSend').textContent = drafts;
    if (drafts) todo.push(['order', 'send', bt('보낼 주문', 'Orders to send') + ' <b>' + drafts + '</b>' + bt('건', ''), bt('주문 확인 · 보낼 주문에서 한 번에', 'review and send together'), 'warn']);
    if (cf) todo.push(['order/cf', 'help', bt('사무실이 확인 요청한 주문', 'Office asks you to confirm') + ' <b>' + cf + '</b>' + bt('건', ''), bt('내용을 보고 ✅ 또는 ✏️', 'open and confirm or fix'), 'warn']);
    if ($('dkSales') && $('dkSales').textContent === '…') { const m = ym(t); const tot = R2(sum(rows.filter(o => o.ym === m && o.st !== 'x' && o.st !== 'draft'), o => o.amt || 0)); $('dkSales').textContent = money(tot); }
  } catch (e) { if ($('dkToday')) $('dkToday').textContent = '—'; }
  try { const ar = await S.DB.get('ar', sm); if ($('dkAr')) $('dkAr').textContent = ar ? money(ar.total || 0) : '—'; if (ar && ar.total > 0) todo.push(['ar', 'dollar', bt('미수금', 'Receivables') + ' <b>' + money(ar.total) + '</b> · ' + (ar.n || 0) + bt('곳', ' stores'), bt('기준일', 'as of') + ' ' + esc(md(String(ar.asOf || '').substring(0, 10))), '']); } catch (e) { if ($('dkAr')) $('dkAr').textContent = '—'; }
  try { const E = await S.DB.list('entries', { where: [['sm', '==', sm], ['d', '==', today()]] }); const n = E.length, amt = R2(sum(E, x => Number(x.amt) || 0)); if (n) todo.push(['mine', 'pen', bt('오늘 수금 입력', 'Payments entered today') + ' <b>' + n + '</b>' + bt('건', '') + ' · ' + money(amt), bt('퇴근 전 Daily Report 전송', 'send the daily report before you leave'), 'ok']); } catch (e) {}
  const box = $('dTodo'); if (!box) return;
  box.innerHTML = (todo.length ? todo.map(x => '<button type="button" class="trow ' + x[4] + '" data-hg="' + x[0] + '">' + tic(x[1], x[4] || 'b') + '<span class="t"><b>' + x[2] + '</b><small>' + x[3] + '</small></span><span class="chev">›</span></button>').join('') : '<div class="none">' + tic('check', 'ok') + ' ' + bt('밀린 일이 없습니다 — 새 주문을 시작하세요', 'Nothing pending — start a new order') + '</div>');
  box.querySelectorAll('[data-hg]').forEach(b => b.onclick = () => { const [r, a] = b.dataset.hg.split('/'); if (a) Router.go(r, a); else Router.go(r); });
}

/* ============================================================
 *  목록
 * ============================================================ */
let LF = { st: 'sent', sm: '', grp: 'day', osrt: { k: '', desc: false } };   /* osrt: ↕ 머리글 정렬 (v0.8.198) */   /* 담당자 목록 기본 = 📅 날짜별 (v0.8.174) */
/* 접수(sent) 를 세 칸으로 — 📥 신규(확인 요청 전) · ❓ 확인 대기(세일즈맨 답 기다림) · 👍 확인 완료(배정 대기) */
const NEWK = { sent: 1, cfw: 1, cfok: 1 };
const subOf = o => o.cfOk ? 'cfok' : o.cfReq ? 'cfw' : 'sent';
/* 👷 신규 · 확인 완료 목록에서는 주문을 누르면 바로 할당 팝업 (여러 건은 체크한 뒤 아무 줄이나 누르거나 [작업 배정]) */
/* 👷 줄을 누르면 바로 배정 팝업 — 세일즈맨 확인이 끝난 👍 배정 대기 탭에서만 (📥 신규는 먼저 ❓ 확인 요청 → 확인 뒤 배정) */
const assignMode = () => isStaff() && LF.st === 'cfok' && can('assign');
/* ❓ 확인 요청을 보낼 수 있는 주문 — 접수 상태이고 아직 세일즈맨 확인 전 */
const cfAble = o => o.st === 'sent' && !o.cfOk && !o.cfIssueOpen;
/** 📄 인보이스 탭 (담당자 · 관리자 · 오너) — 기간별(날짜 → 번호 순)이 기본, 거래처별 · 번호 · 종류 · 세일즈맨으로도 */
let INV_TAB = false;
export function invTab() {
  if (!INV_TAB) { INV_TAB = true; LF.im = 'date'; LF.ip = LF.ip || 'month'; }
  LF.st = 'inv';
  return Fulfill.invBrowser(LF, pageHead('📄 ' + bi('인보이스', 'Invoices'), bt('앱에서 발행한 것 + 이전 시스템에서 가져온 것 — 인보이스 번호 순 (종류별). 거래처는 이름 순. 거래처 · 번호 · 종류 · 세일즈맨으로 찾기', 'App + imported invoices by invoice number (per type); customers by name — search by customer, number, type, salesman')));
}
/** 다른 화면(관리자 현황)에서 주문 목록을 바로 열기 — st: sent · pick · picked · done · shipped · bo · inv · all, 기간은 선택 */
export function openList(st, from, to) { LF.init = true; LF.list = true; LF.st = st; if (from) { LF.hp = 'custom'; LF.hfrom = from; LF.hto = to; LF.ip = 'custom'; LF.ifrom = from; LF.ito = to; LF.im = 'date'; } if (location.hash === '#/order') pageOrder(''); else Router.go('order'); }
const firstList = () => ({ pick: 'mine', invoice: 'picked', whmgr: 'ups', pickinv: 'cfok', acct: 'inv' }[jobOf()] || 'sent');
async function pageOrder(arg) {
  if (arg === 'new') return openEditor(null, readWip());
  /* ↩ 크레딧 · 리턴 — 주문처럼 눌러 담고 보낼 주문에 같이 모였다가 주문과 같이 보냄, 사무실이 확인해 CM 발행 (v0.8.187) */
  if (arg === 'credit') return openEditor(null, readWip('credit') || newCredit());
  if (arg && arg.indexOf('credit:') === 0) return startCreditFor(decodeURIComponent(arg.substring(7)));
  if (arg === 'newitems') { WANT_NEW = true; return openEditor(null, readWip()); }   /* 🆕 새 아이템 알림을 누르면 — 새 주문의 🆕 새로 나온 목록으로 (v0.8.182) */
  if (arg && arg.indexOf('bo:') === 0) return Fulfill.openBackorder(arg.substring(3));
  if (arg && arg.indexOf('inv:') === 0) return Fulfill.openInvoice(arg.substring(4));
  if (arg === 'cf') { if (isStaff()) { LF.init = true; LF.list = true; LF.st = 'cfw'; return pageOrder(''); } return Notify.reviewPage(); }
  if (arg) return openOrder(arg);
  if (!isStaff() && !mySm()) { $('page').innerHTML = '<div class="card"><div class="none">이 계정에 세일즈맨 코드가 연결돼 있지 않습니다.</div></div>'; return; }
  O = null; Router.refreshBack();
  if (isStaff() && !LF.init) { LF.init = true; const j = jobOf(), first = { invoice: 'picked', acct: 'inv', pick: 'mine', whmgr: 'ups', pickinv: 'cfok' }[j]; if (first) LF.st = first; }
  if (isStaff() && !LF.list) return staffHome();
  if (isStaff() && !chipsFor().some(c => c[0] === LF.st)) LF.st = chipsFor()[0][0];
  if (isStaff()) setTimeout(() => { try { dockMark(); } catch (e) {} }, 0);   /* 🧭 고정 서랍의 주문 칸 표시 */
  if (isStaff() && (LF.st === 'bo' || LF.st === 'inv' || LF.st === 'ups' || LF.st === 'packed')) return Fulfill.pageLists(LF, listHead());
  $('page').innerHTML = listHead() + '<div class="load">주문 읽는 중…</div>';
  bindHead();
  syncOutbox(true);
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
      else rows = await S.DB.list('orders', { where: [['st', 'in', LF.st === 'pick' ? ['pick', 'ok'] : NEWK[LF.st] ? ['sent'] : [LF.st]]] });
      if (LF.st !== 'all' && LF.st !== 'mine' && LF.st !== 'shipped') rows = rows.filter(o => LF.st === 'pick' ? (o.st === 'pick' || o.st === 'ok') : NEWK[LF.st] ? (o.st === 'sent' && subOf(o) === LF.st) : o.st === LF.st);
      if (LF.sm) rows = rows.filter(o => o.sm === LF.sm);
    } else rows = await S.DB.list('orders', { where: [['sm', '==', mySm()], ['ym', 'in', recentYms(2)]] });
  } catch (e) { err = String(e.code || e.message); }
  /* 보낼 함에 있는 것 (아직 회사에 안 간 것) 을 위에 */
  const out = outboxList().filter(x => isStaff() || x.o.sm === mySm());
  const outIds = {}; out.forEach(x => { outIds[x.o.id] = 1; });
  rows = rows.filter(o => !outIds[o.id]);
  /* 아직 안 끝난 칸(신규 · 확인 대기 · 배정 대기 · 출고 작업 …)은 오래 기다린 주문이 맨 위 — 밀린 것을 놓치지 않게 */
  const oldFirst = isStaff() && (!!NEWK[LF.st] || OPEN_CH.includes(LF.st));
  if (oldFirst) {
    rows = sortBy(rows, o => { const a = stageAge(o); return a ? a.since : (o.sentAt || o.createdAt || ''); });
    var nOld = rows.filter(o => { const a = stageAge(o); return a && a.day; }).length;
    if (LF.old) rows = rows.filter(o => { const a = stageAge(o); return a && a.day; });
  } else { LF.old = false; rows = sortBy(rows, o => o.updatedAt || o.createdAt || '', true); }
  const wip = readWip();
  let h = '';
  if (wip) h += '<div class="alert a-amb tap" id="oWip" style="margin:0 0 12px">✏️ 작성 중인 주문 — ' + esc(wip.store || '가게 미선택') + ' · ' + wip.lines.length + '줄 <b>이어서 하기 ›</b></div>';
  if (out.length) h += '<div class="card" style="border:2px solid #fecaca"><h2>📤 아직 회사로 안 간 주문 ' + out.length + '건</h2><div class="muted">폰에 안전하게 저장돼 있습니다. 인터넷이 되면 자동으로 보내고, 아래 버튼으로 바로 보낼 수도 있습니다.</div>' +
    oTbl(out.map(x => orderRow(x.o, true, x.err)).join('')) + '<button class="b-blue" id="oSync" style="margin-top:8px">📤 지금 모두 보내기</button></div>';
  if (isStaff() && S.DB.cacheAt && Date.now() - S.DB.cacheAt < 3000) h += '<div class="alert a-amb" id="oStale">🐢 ' + bi('연결이 느려 <b>폰에 저장된 옛 목록</b>을 보여주고 있습니다 — 새 주문이 빠져 있을 수 있습니다.', 'Slow connection — showing the list saved on this phone; new orders may be missing.') + ' <button class="b-blue b-sm" data-orf="1" style="margin-left:6px">🔄 ' + bt('다시 읽기', 'Reload') + '</button></div>';   // 창고 매니저 폰에 새 주문 2건이 안 보였던 일 (v0.8.174)
  if (err) h += '<div class="alert a-amb">회사 기록을 읽지 못했습니다 (' + esc(err) + ') — 인터넷이 안 되면 폰에 저장된 것만 보입니다.</div>';
  if (!isStaff()) h += '<div id="dayCfL"></div>';
  const cfs = isStaff() ? [] : rows.filter(o => o.cfReq && !o.cfOk && o.st !== 'x');
  if (cfs.length) h += '<div class="card" style="border:2px solid #fde68a"><h2>❓ ' + bi('사무실에서 확인 요청한 주문', 'Office asks you to confirm') + ' ' + cfs.length + '건</h2><div class="muted">열어서 내용이 맞으면 <b>✅ 맞습니다</b>, 아니면 <b>✏️ 수정</b>. <span class="en">Open each order and confirm or edit.</span></div>' + oTbl(cfs.map(o => orderRow(o)).join('')) + '</div>';
  const drafts = isStaff() ? (LF.st === 'draft' ? rows : []) : rows.filter(o => o.st === 'draft');
  if (isStaff() && LF.st === 'draft') rows = [];   // 아래 목록에 또 나오지 않게
  if (drafts.length) h += '<div class="card" style="border:2px solid #bfdbfe"><h2>✅ ' + bi('주문 확인 · 보낼 주문', 'Review & send') + ' ' + drafts.length + '건 · ' + money(drafts.reduce((a, o) => a + (o.amt || 0), 0)) + '</h2><div class="muted">저장해 둔 주문입니다. <b>열기</b>로 내용을 확인한 뒤, 체크한 것을 한 번에 회사로 보냅니다 (보낸 뒤에도 픽킹 시작 전까지는 고칠 수 있습니다). <span class="en">Open to review, then send the checked orders.</span></div>' +
    drafts.map(o => '<label class="pick on" style="margin-top:6px"><input type="checkbox" class="ck-big" data-sd="' + esc(o.id) + '" checked><span class="pm"><b>' + (o.kind === 'credit' ? '<span class="tag crtag">↩ ' + bt('크레딧', 'Credit') + (o.cmNo ? ' ' + esc(o.cmNo) : '') + '</span> ' : '') + esc(o.store) + '</b><small>' + esc(md(o.d)) + ' · ' + esc(o.no) + ' · ' + (o.n || 0) + '줄 · ' + money(o.amt) + (o.why ? ' · ' + esc(o.why) : '') + '</small></span><button class="b-ghost b-sm" data-oid="' + esc(o.id) + '">열기</button></label>').join('') +
    '<button class="b-green" id="oSendAll" style="margin-top:10px;padding:15px">📤 체크한 주문 회사로 보내기</button></div>';
  if (isStaff() && NEWK[LF.st]) h += '<div id="naBanL"></div>';
  if (oldFirst && (nOld || LF.old)) h += '<button class="alert a-red oldbar" id="oOld">⚠️ ' + (LF.old ? bt('하루 넘게 밀린 주문만 보는 중', 'Showing only orders waiting 1+ day') + ' ' + rows.length + bt('건', '') + ' — <u>' + bt('전체 보기', 'Show all') + '</u>' : bt('하루 넘게 밀린 주문', 'Orders waiting 1+ day') + ' <b>' + nOld + '</b>' + bt('건', '') + ' — <u>' + bt('눌러서 밀린 것만 보기', 'tap to show only these') + '</u>') + '</button>';
  /* ✕ 세일즈맨 '내 주문': 취소된 주문은 따로 (v0.8.226 · 2026-11-13 세일즈맨 요청: "취소한 매장도 주문 넣은 매장과 구분 없이 떠서 헷갈림")
   *   기본은 접수된 주문만 · ✕ 취소된 주문 탭을 누르면 취소된 것만 (지우지는 않음 — 기록은 남김) */
  let myX = 0;
  if (!isStaff()) { const xs = rows.filter(o => o.st === 'x'); myX = xs.length; rows = LF.sx ? xs : rows.filter(o => o.st !== 'x'); }
  const tot = rows.reduce((a, o) => a + (o.amt || 0), 0);
  const chip = CHIPS.find(c => c[0] === LF.st);
  const bulk = isStaff() && (NEWK[LF.st] || LF.st === 'pick' || LF.st === 'mine') && rows.length;
  if (bulk) h += '<div class="card" style="padding:10px 14px"><div class="chips" style="margin:0"><button class="' + (LF.grp !== 'day' ? 'on' : '') + '" data-grp="sm">👤 ' + bi('세일즈맨별', 'By salesman') + '</button><button class="' + (LF.grp === 'day' ? 'on' : '') + '" data-grp="day">📅 ' + bi('날짜별', 'By day') + '</button><button data-ckall="1">☑ ' + bi('모두 선택', 'Select all') + '</button><button data-ckall="0">☐ ' + bi('선택 해제', 'Clear') + '</button><span class="tag t-b" id="ckN" style="align-self:center">0' + bt('건 선택', ' selected') + '</span></div>' +
    '<div id="bulkBar" class="muted" style="margin-top:6px">' + (assignMode() ? bi('세일즈맨이 확인한 주문입니다. 주문을 <b>누르면 바로 할당 팝업</b>이 뜹니다. 여러 건은 체크한 뒤 아무 줄이나 누르거나 👷 작업 배정. 주문 내용은 줄 끝 📄', 'Confirmed by the salesman. Tap an order to pick who handles it. For many: check them, then tap any row or 👷 Assign. 📄 opens the order') : LF.st === 'sent' ? bi('① 세일즈맨별로 주문이 맞는지 <b>❓ 확인 요청</b> → ② 세일즈맨이 전체를 보고 ✅ → ③ 👍 배정 대기 탭에서 작업 배정. 줄을 누르면 주문 내용이 열립니다.', '① Ask the salesman to confirm (per salesman) → ② the salesman reviews all and taps ✅ → ③ assign from the 👍 tab. Tap a row to open the order.') : bi('주문을 체크한 뒤 → 작업 배정 또는 세일즈맨 확인 요청', 'Check orders, then assign picking or ask the salesman to confirm')) + '</div><div class="btns" style="margin-top:6px;flex-wrap:wrap">' + (LF.st === 'sent' || LF.st === 'cfw' ? '<button class="' + (LF.st === 'sent' ? 'b-blue' : 'b-ghost') + ' b-sm" id="bkCf">❓ ' + bi(LF.st === 'cfw' ? '확인 다시 요청' : '세일즈맨 확인 요청', 'Ask salesman to confirm') + '</button><button class="b-ghost b-sm" id="bkCfOk">👍 ' + bi('확인 완료로 (전화 등)', 'Mark confirmed') + '</button>' : '') + (can('assign') ? '<button class="' + (LF.st === 'sent' || LF.st === 'cfw' ? 'b-ghost' : 'b-blue') + ' b-sm" id="bkAssign">👷 ' + bi('작업 배정', 'Assign Picker') + (LF.st === 'sent' || LF.st === 'cfw' ? ' <small>(' + bt('확인 없이', 'skip confirm') + ')</small>' : '') + '</button>' : '') + '</div></div>';
  h += '<div class="card"><h2>' + (isStaff() ? (chip ? stageIcon(chip[0], chip[1].split(' ')[0], 20) + ' ' + chip[1].substring(chip[1].indexOf(' ') + 1) + ' <span class="en">' + chip[2] + '</span> · ' : '') : bi('내 주문', 'My orders') + ' ') + rows.length + '건 · ' + money(tot) + (isStaff() ? '' : ' <span class="muted">(최근 2달 · last 2 months)</span>') + '</h2>' +
    (isStaff() ? '' : '<div class="chips" style="margin:0 0 8px"><button class="' + (LF.sx ? '' : 'on') + '" data-sx="0">📋 ' + bi('접수된 주문', 'Active orders') + '</button><button class="' + (LF.sx ? 'on' : '') + '" data-sx="1">✕ ' + bi('취소된 주문', 'Cancelled') + ' ' + myX + '</button></div>') +
    (rows.length ? dayGroups(rows) : '<div class="none">' + bt('주문이 없습니다', 'No orders') + '</div>') + '</div>';
  $('page').innerHTML = listHead() + h;
  bindHead(); fillStrip();
  { const M = document.querySelector('.ohead .omenu'), on = M && M.querySelector('[data-lf].on'); if (M && on) M.scrollLeft = Math.max(0, on.offsetLeft - M.clientWidth / 2 + on.offsetWidth / 2); }   // 위쪽 단계 탭 — 지금 칸이 보이게 옆으로
  SH.bindSort($('page'), LF.osrt, () => pageOrder(''));   // ↕ 머리글 정렬 (v0.8.198)
  if ($('dayCfL')) Notify.dayCard($('dayCfL'));
  if ($('oOld')) $('oOld').onclick = () => { LF.old = !LF.old; pageOrder(''); };
  document.querySelectorAll('[data-sx]').forEach(b => b.onclick = () => { LF.sx = b.dataset.sx === '1'; pageOrder(''); });
  NewAcct.pendingBanner($('naBanL'));
  const picked = () => Array.from(document.querySelectorAll('[data-ck]:checked')).map(x => x.dataset.ck);
  document.querySelectorAll('[data-grp]').forEach(b => b.onclick = () => { LF.grp = b.dataset.grp; pageOrder(''); });
  const ckN = () => { const n = picked().length, el = $('ckN'); if (el) { el.textContent = n + bt('건 선택', ' selected'); el.className = 'tag ' + (n ? 't-k' : 't-b'); } };
  document.querySelectorAll('[data-ckall]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-ck]').forEach(c => { c.checked = b.dataset.ckall === '1'; }); ckN(); });
  /* 체크 칸: 손가락 영역(44px)을 넓히고, 체크해도 줄이 열리지 않게 */
  document.querySelectorAll('[data-ckw]').forEach(w => { w.onclick = e => { e.stopPropagation(); if (e.target.tagName !== 'INPUT') { const c = w.querySelector('input'); c.checked = !c.checked; } ckN(); }; });
  document.querySelectorAll('[data-ck]').forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = ckN; });
  /* 👤 세일즈맨 묶음 머리의 ❓ — 그 세일즈맨의 확인 전 주문 전부를 한 번에 요청 */
  document.querySelectorAll('[data-smcf]').forEach(b => b.onclick = async e => { e.stopPropagation(); const L = rows.filter(o => o.sm === b.dataset.smcf && cfAble(o) && !(o.cfReq && LF.st === 'sent')); if (!L.length) return toast(bt('요청할 주문이 없습니다', 'Nothing to ask'), 'bad'); if (!(await confirmBox('❓ ' + b.dataset.smcf + ' — ' + L.length + bt('건 · ', ' orders · ') + money(L.reduce((a, o) => a + (o.amt || 0), 0)) + '\n' + bt('세일즈맨에게 이 주문들이 맞는지 한 번에 확인 요청할까요? 세일즈맨 앱에 전체 주문이 아이템까지 보이고 ✅ 한 번으로 확인합니다.', 'Ask the salesman to confirm these orders at once? They see every order with its items and confirm with one ✅.'), bt('요청', 'Ask')))) return; busy(true); try { await Notify.requestConfirm(L); toast('❓ ' + L.length + bt('건 확인 요청', ' asked'), 'good'); } catch (x) { toast('실패: ' + (x.code || x.message), 'bad'); } busy(false); pageOrder(''); });
  document.querySelectorAll('[data-smhd]').forEach(el => el.onclick = e => { if (e.target.closest('button')) return; el.classList.toggle('fold'); const k = el.dataset.smhd; el.closest('table, .crows').querySelectorAll('[data-sg="' + CSS.escape(k) + '"]').forEach(r => r.classList.toggle('hide', el.classList.contains('fold'))); });
  if ($('bkAssign')) $('bkAssign').onclick = () => { const ids = picked(); if (!ids.length) return toast('주문을 체크하세요', 'bad'); Fulfill.assignPicker(rows.filter(o => ids.includes(o.id)), () => pageOrder('')); };
  if ($('bkCf')) $('bkCf').onclick = async () => { const ids = picked(); if (!ids.length) return toast('주문을 체크하세요', 'bad'); if (!(await confirmBox(ids.length + bt('건을 세일즈맨에게 확인 요청할까요? 세일즈맨 앱에 주문 전체가 아이템까지 보이고 ✅ 한 번으로 확인합니다.', ' orders → ask the salesman to confirm? They see every order with its items.'), bt('요청', 'Ask')))) return; busy(true); try { await Notify.requestConfirm(rows.filter(o => ids.includes(o.id))); toast('❓ ' + bt('확인 요청 ', 'Asked ') + ids.length, 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); pageOrder(''); };
  if ($('bkCfOk')) $('bkCfOk').onclick = async () => { const ids = picked(); if (!ids.length) return toast('주문을 체크하세요', 'bad'); if (!(await confirmBox(ids.length + bt('건을 세일즈맨 확인 완료로 바꿀까요? (전화 · 문자로 확인한 경우)', ' orders → confirmed?'), '👍'))) return; busy(true); try { const now = new Date().toISOString(); await S.DB.batch(ids.map(id => ({ op: 'update', col: 'orders', id, data: { cfReq: true, cfOk: true, cfAt: now, cfBy: S.user.email, cfHow: 'staff' } }))); toast('👍 ' + ids.length, 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); pageOrder(''); };
  if ($('oWip')) $('oWip').onclick = () => openEditor(null, wip);
  if ($('oSync')) $('oSync').onclick = async () => { busy(true); const r = await syncOutbox(false); busy(false); if (!r.sent) toast(navigator.onLine === false ? '인터넷이 안 됩니다 — 폰에 그대로 있습니다' : '보내지 못했습니다 — 잠시 뒤 다시', 'bad'); pageOrder(''); };
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); Router.go('order', b.dataset.open); });
  document.querySelectorAll('[data-oid]').forEach(el => el.onclick = e => {
    e.preventDefault(); e.stopPropagation(); const id = el.dataset.oid, o = rows.find(x => x.id === id);
    if (!assignMode() || !o || o.st !== 'sent' || o.kind === 'credit') return Router.go('order', id);   // ↩ 크레딧은 픽킹이 없음 — 열어서 크레딧 확정
    /* 👷 누르면 할당 팝업 — 체크해 둔 주문이 있으면 그것들(누른 줄 포함)을 한꺼번에 */
    const ids = picked(); if (!ids.includes(id)) ids.push(id);
    Fulfill.assignPicker(rows.filter(x => ids.includes(x.id)), () => pageOrder(''));
  });
  if ($('oSendAll')) $('oSendAll').onclick = async () => {
    const ids = Array.from(document.querySelectorAll('[data-sd]:checked')).map(x => x.dataset.sd); if (!ids.length) return toast('보낼 주문을 체크하세요', 'bad');
    if (!(await confirmBox(ids.length + '건을 회사로 보낼까요?', '보내기'))) return;
    busy(true);
    try {
      const now = new Date().toISOString();
      for (const id of ids) { const o = drafts.find(x => x.id === id); if (!o) continue; const L = await S.DB.get('orderLines', id); putOut(Object.assign({}, o, sendStamp(o)), (L && L.lines) || []); }
      const r = await syncOutbox(true);
      toast(r.left ? '📱 ' + r.left + '건은 인터넷이 되면 자동으로 보냅니다' : '📤 ' + ids.length + '건 보냈습니다', r.left ? '' : 'good');
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false); pageOrder('');
  };
}
/* 담당자의 일(job) 에 따라 보이는 칩이 다름 — 픽킹: 들어온 주문 · 픽킹 중 · 백오더 / 인보이스: 픽킹 중(확정 대기) · 완료 · 인보이스 찾기 · 백오더 */
const CHIPS = [['mine', '👷 내 배정 작업', 'My Assignments'], ['sent', '📥 신규 주문', 'New Orders'], ['cfw', '❓ 확인 대기', 'Awaiting Salesman'], ['cfok', '👍 확인 완료 · 배정 대기', 'Confirmed · To Assign'], ['pick', '📦 출고 작업', 'In Fulfillment'], ['picked', '✅ 검수 대기', 'Ready for Review'], ['done', '🧾 인보이스 발행 · 포장 대기', 'Invoiced · Awaiting Packing'], ['ups', '🚚 UPS 출고', 'UPS Shipping'], ['packed', '📮 UPS 픽업', 'UPS Pickup'], ['dlv', '🚗 딜리버리 대기', 'Awaiting Delivery'], ['shipped', '✅ 완료', 'Completed'], ['bo', '⏳ 백오더', 'Backorders'], ['inv', '📄 인보이스 조회', 'Invoice Lookup'], ['draft', '💾 임시 저장', 'Drafts'], ['x', '✕ 취소', 'Cancelled'], ['all', '📋 전체 주문', 'All Orders']];
const JOB_CHIPS = { pick: ['mine', 'pick', 'picked', 'done', 'ups', 'packed', 'dlv', 'shipped', 'bo'], whmgr: ['ups', 'packed', 'dlv', 'done', 'shipped', 'bo', 'picked', 'pick', 'mine', 'cfok', 'sent', 'cfw', 'all'], pickinv: ['sent', 'cfw', 'cfok', 'mine', 'pick', 'picked', 'done', 'ups', 'packed', 'dlv', 'shipped', 'inv', 'bo', 'all'], invoice: ['sent', 'cfw', 'cfok', 'picked', 'pick', 'done', 'packed', 'dlv', 'shipped', 'inv', 'bo', 'draft', 'all'], acct: ['inv', 'done', 'packed', 'shipped', 'bo', 'all'] };
const LIVE_ST = ['sent', 'pick', 'ok', 'picked', 'done', 'packed', 'dlv'];
const STG = [['recv', '📥', '접수', 'Intake', ['sent', 'cfw', 'cfok', 'draft']], ['ship', '📦', '출고', 'Fulfill', ['mine', 'pick', 'picked', 'done', 'ups', 'packed', 'dlv']], ['fin', '✅', '완료 · 조회', 'Done', ['shipped', 'inv', 'all']], ['etc', '⏳', '기타', 'Other', ['bo', 'x']]];   // 주문 처리 단계 묶음
export const stageOfChip = st => (STG.find(g => g[4].includes(st)) || [])[0];
export function goStage(g) { const av = chipsFor(), G = STG.find(x => x[0] === g); const first = G && av.find(c => G[4].includes(c[0])); if (first) { LF.st = first[0]; LF.list = true; } }
const OPEN_CH = ['mine', 'pick', 'picked', 'done', 'packed', 'dlv'];   // 목록 칩 중 아직 안 끝난 일 (오래된 것이 위)   // 아직 끝나지 않은 주문 (출고 전)
/* 🚫 인보이스 뒤 단계 숨김 (2026-11-13 창고 매니저: 포장 대기 · UPS 출고 · UPS 픽업 · 딜리버리 대기는 이 앱에서 안 씀 — 인보이스 발행 = ✅ 완료, 다른 기능과 이을 때까지) */
export const HIDE_ST = ['done', 'ups', 'packed', 'dlv'];
export function chipsFor() { return chipsFor0().filter(c => !HIDE_ST.includes(c[0])); }
function chipsFor0() { const J = myJobs(); if (J.some(j => !JOB_CHIPS[j])) return CHIPS.filter(c => c[0] !== 'ups' || can('ship')); const keys = []; J.forEach(j => JOB_CHIPS[j].forEach(k => { if (!keys.includes(k)) keys.push(k); })); keys.sort((a, b) => CHIPS.findIndex(c => c[0] === a) - CHIPS.findIndex(c => c[0] === b)); return (keys.map(k => CHIPS.find(c => c[0] === k)).filter(Boolean)).filter(c => c[0] !== 'ups' || can('ship')); }
export function statusStrip() { const k = (ic, c, ko, en) => '<div>' + '<span class="tq ' + c + '">' + icon(ic, 20) + '</span><span class="kt"><span>' + ko + ' <span class="en">' + en + '</span></span><b>…</b></span></div>'; return '<div class="kpi strip ostrip2" id="oStrip" style="margin:0 0 10px">' + k('inbox', 'g', '신규 주문', 'New') + k('package', 'b', '출고 작업', 'In Fulfillment') + k('clipCheck', 'a', '검수 대기', 'Review') + '</div>'; }   /* 🎨 조의 대시보드 숫자 칸 모양 (v0.8.242) */   // 🚫 포장 · 픽업 대기 칸 뺌 (HIDE_ST)
export async function fillStrip() {
  const el = $('oStrip'); if (!el) return;
  try {
    const live = await S.DB.list('orders', { where: [['st', 'in', LIVE_ST]] });
    if (!$('oStrip')) return;
    const b = el.querySelectorAll('b');
    /* 🔢 위쪽 단계 탭의 건수 (v0.8.241 — 대시보드의 칸들이 목록 안에서도 보이게) */
    const me = S.user && S.user.email, CNT = { sent: live.filter(o => o.st === 'sent' && subOf(o) === 'sent').length, cfw: live.filter(o => o.st === 'sent' && subOf(o) === 'cfw').length, cfok: live.filter(o => o.st === 'sent' && subOf(o) === 'cfok').length,
      mine: live.filter(o => (o.st === 'pick' || o.st === 'ok') && o.picker === me).length, pick: live.filter(o => o.st === 'pick' || o.st === 'ok').length, picked: live.filter(o => o.st === 'picked').length, done: live.filter(o => o.st === 'done').length, packed: live.filter(o => o.st === 'packed').length };
    document.querySelectorAll('[data-lfn]').forEach(e => { const n = CNT[e.dataset.lfn]; e.textContent = n ? n : ''; e.classList.toggle('z', !n); });
    b[0].textContent = live.filter(o => o.st === 'sent').length; b[1].textContent = live.filter(o => o.st === 'pick' || o.st === 'ok').length; b[2].textContent = live.filter(o => o.st === 'picked').length; if (b[3]) b[3].textContent = live.filter(o => o.st === 'done').length; if (b[4]) b[4].textContent = live.filter(o => o.st === 'packed').length;
    el.querySelectorAll('div').forEach((d, i) => { d.onclick = () => { LF.st = ['sent', 'pick', 'picked', 'done', 'packed'][i]; LF.list = true; if (i === 3) LF.hp = 'year'; pageOrder(''); }; d.classList.add('tap'); });
  } catch (e) { el.querySelectorAll('b').forEach(x => { x.textContent = '—'; }); }
}
/* 담당자 · 관리자의 주문 첫 화면 — 세일즈맨 홈처럼 큰 버튼 (건수는 읽은 뒤 채움) */
async function staffHome() {
  const j = jobOf();
  LF.hp = LF.hp || 'today';
  const [from, to] = Fulfill.periodRange(LF.hp, LF.hfrom, LF.hto), days = Math.max(1, daysBetween(from, to) + 1);
  const pf = addDays(from, -days), pt = addDays(from, -1);   // 바로 앞 같은 길이 기간 (비교용)
  const plabel = Fulfill.PERIODS.find(p => p[0] === LF.hp), ptxt = LF.hp === 'custom' || !plabel ? md(from) + ' ~ ' + md(to) : plabel[1] + (days > 1 ? ' (' + md(from) + ' ~ ' + md(to) + ')' : ' ' + md(from));
  const tile = (go, icon, label, sub, cls) => '<button class="htile ' + (cls || '') + '" data-hg="' + go + '"><span class="hi">' + (stageIcon(go, '', 24) || routeIcon(go, icon, 24)) + '</span><b>' + label + '</b><small id="ht-' + go.replace(/[^a-z]/g, '') + '">' + (sub || '') + '</small></button>';
  const MAIN = ['today', 'week', 'month', 'quarter', 'year'];
  const chips = '<div class="chips" style="margin:0 0 8px">' + Fulfill.PERIODS.filter(c => MAIN.includes(c[0])).map(c => '<button class="' + (LF.hp === c[0] ? 'on' : '') + '" data-hp="' + c[0] + '">' + c[1] + ' <span class="en">' + c[2] + '</span></button>').join('') + '<button class="' + (MAIN.includes(LF.hp) ? '' : 'on') + '" id="hCal">' + icon('calendar', 16) + ' ' + bi('날짜 선택', 'Pick dates') + '</button></div>' +
    '<div class="two" style="margin:0 0 8px;grid-template-columns:auto 1fr auto;align-items:center;gap:6px"><button class="b-ghost b-sm" id="hPrev" title="앞 기간">' + icon('chevLeft', 18) + '</button><button class="b-ghost b-sm" id="hCalT" style="font-weight:800">' + icon('calendar', 16) + ' ' + esc(ptxt) + '</button><button class="b-ghost b-sm" id="hNext" title="다음 기간">' + icon('chevRight', 18) + '</button></div>';
  /* 일 타일 — 기간에 따라 숫자가 바뀜 (들어온 · 인보이스 완료 · 매출), 지금 상태 (픽킹 중 · 백오더) */
  const T = [];
  const W = can('pick') || can('assign') || can('invoice');   // 출고 흐름을 보는 일
  if (can('flow')) T.push('<button class="htile flowtile" data-hg="flow"><span class="hi">🧭</span><b>' + bi('주문 흐름 감독', 'Order flow') + '</b><small id="ht-flow">' + bt('단계 · 담당자 · 머문 시간 · 지연', 'stage · who · time · late') + '</small></button>');
  if (can('pick') && !can('invoice')) T.push(tile('mine', '👷', bi('내 배정 작업', 'My Assignments'), '읽는 중…', 'blue'));
  if (W) T.push(tile('sent', '📥', bi('신규 주문', 'New Orders'), '읽는 중…', can('assign') || can('invoice') ? 'blue' : ''), tile('cfw', '❓', bi('세일즈맨 확인 대기', 'Awaiting Salesman'), '읽는 중…', 'amber'), tile('cfok', '👍', bi('확인 완료 · 배정 대기', 'Confirmed · To Assign'), '읽는 중…'), tile('pick', '📦', bi('출고 작업', 'In Fulfillment'), '읽는 중…'));
  if (W) T.push(tile('picked', '✅', bi('작업 완료 · 검수 대기', 'Ready for Review'), '읽는 중…'));
  if (!HIDE_ST.includes('done') && (can('invoice') || can('ship') || can('invLookup'))) T.push(tile('done', '🧾', bi('인보이스 발행 · 포장 대기', 'Invoiced · Awaiting Packing'), '읽는 중…'));
  if (!HIDE_ST.includes('ups') && can('ship')) T.push(tile('ups', '🚚', bi('UPS 출고', 'UPS Shipping'), '읽는 중…', 'green'), tile('packed', '📮', bi('UPS 픽업 · 트럭 인계', 'UPS Pickup'), '읽는 중…'));
  if (!HIDE_ST.includes('dlv') && (can('ship') || can('invoice'))) T.push(tile('dlv', '🚗', bi('딜리버리 대기', 'Awaiting delivery'), '읽는 중…'));   /* UPS 가 아니라 세일즈맨 · 직원이 가져가는 주문 */
  T.push(tile('shipped', '✅', bi('완료', 'Completed'), '읽는 중…'));
  if (can('bo')) T.push(tile('bo', '⏳', bi('백오더', 'Backorders'), '읽는 중…'));
  if (can('ship') || can('invoice') || can('newOrder')) T.push(tile('displays', '🖼', 'Notes Display', '읽는 중…', 'amber'));
  if (can('ship')) T.push(tile('shiphist', '📦', 'Shipping History', bt('UPS 출고 기록 · 다시 인쇄 · 취소', 'UPS shipments · reprint · void')));
  if (can('ship')) T.push(tile('notesups', '🏷', 'Notes UPS', bt('박스를 재서 라벨 · 가게별 대기 줄', 'Measure and label boxes · queue per store')));
  if (can('ship')) T.push(tile('balcao', '🏪', 'Shipping UPS', bt('가게 → 박스 → 라벨 (옛 앱 화면)', 'store → boxes → label (classic screen)')));
  if (can('ship')) T.push(tile('adhoc', '➕', bi('주문 없이 UPS 라벨', 'Ad-hoc UPS label'), bt('가게 · 인보이스 없이 받는 곳만 적어 라벨', 'label with just an address')));
  const A = [];
  if (can('newOrder')) A.push(tile('new', '🛒', bi('새 주문', 'New order'), '가게 고르고 담기', 'blue'));
  if (can('invoice') || can('invLookup') || can('verify')) A.push(tile('inv', '📄', bi('인보이스 조회', 'Invoices'), '가게 · 날짜 · 번호'));
  A.push(tile('stores', '🏬', bi('거래처', 'Customers'), '가게 창 · 미수금'));
  if (can('verify')) A.push(tile('verify', '💵', bi('수금 확인', 'Payments'), '세일즈맨 수금 확인'));
  if (can('invoice') || can('verify')) A.push(tile('credit', '↩', bi('크레딧 확인', 'Credits'), bt('세일즈맨이 준 크레딧 · 확인 · VOID', 'credits given by salesmen'), 'amber'));
  if (can('verify')) A.push(tile('bounce', '↩️', bi('바운스 체크', 'Bounced checks'), bt('등록 · 세일즈맨 알림 · 해결', 'register · notify · clear'), 'amber'));
  if (can('items')) A.push(tile('items', '🏷', bi('아이템 · 재고 위치', 'Items · Inventory'), '찾기 · 위치 · 등록'));
  /* 🏷 오피스 · 인보이스 담당도 아이템을 바로 등록 — 홈에서 한 번에 (v0.8.172) */
  if (can('items')) A.push(tile('items/new', '＋', bi('아이템 등록', 'New item'), bt('코드 · 이름 · 가격 · 분류', 'code · name · price · category')), (S.me && S.me.role === 'admin' ? tile('items/bulk', '📋', bi('아이템 일괄 등록', 'Bulk add items'), bt('엑셀처럼 칸에 쭉 입력 · 붙여넣기', 'spreadsheet cells · paste')) : ''));
  A.push(tile('cat', '📒', bi('카탈로그 · 바코드', 'Catalog · Barcodes'), '사진 · 바코드 라벨 · 엑셀'));
  A.push(tile('all', '📋', bi('전체 주문', 'All orders'), ptxt));
  /* 담당자 홈 = 주문 처리 먼저 (접수 · 픽킹 · 인보이스 · 포장), 바로가기, 매출은 맨 아래 */
  /* 🏭 창고 매니저 — 주문 처리보다 재고 · UPS 출고 · 픽업 · 백오더가 먼저 (주문 처리 타일은 아래 작은 칸) */
  /* 🗂 큰 묶음 4개로 접어 둠 — 머리를 누르면 펼쳐져 세부 타일 (펼친 상태는 이 폰에 기억). 머리에는 핵심 숫자 */
  /* 🛒 세일 = 인보이스 발행까지 (접수 · 확인 · 배정 · 픽킹 · 검수) · 🚚 배송 = 그 뒤 (포장 대기 · UPS 라벨 · 픽업 · 출고 완료 · 백오더 · 디스플레이 · 주문 없이 라벨 · 배송 조회) — v0.8.166 */
  const GRP = [['sale', '🛒', '세일', 'Sales', ['flow', 'new', 'sent', 'cfw', 'cfok', 'mine', 'pick', 'picked', 'all']], ['ship', '🚚', '배송', 'Shipping', ['done', 'ups', 'balcao', 'shiphist', 'notesups', 'packed', 'dlv', 'shipped', 'bo', 'displays', 'adhoc', 'track']],
    ['money', '💵', '수금 · 크레딧', 'Payments', ['verify', 'credit', 'bounce']], ['look', '📚', '조회 · 자료', 'Lookup', ['inv', 'stores', 'cat', 'items', 'items/new', 'items/bulk']]];
  const allT = T.concat(A), keyOf = h => (h.match(/data-hg="([^"]+)"/) || [])[1];
  const OKEY = 'theone.hgrp.' + j; let openG = null; try { openG = JSON.parse(localStorage.getItem(OKEY) || 'null'); } catch (e) {}
  if (!Array.isArray(openG)) openG = [j === 'whmgr' ? 'ship' : j === 'acct' ? 'money' : 'sale'];   /* 창고 매니저는 🚚 배송, 회계는 💵, 그 밖(픽킹 담당 포함)은 🛒 세일 */
  if (openG.includes('recv')) openG = openG.map(g => g === 'recv' ? 'sale' : g);   /* 옛 이름(📥 주문 접수) 기억 → 세일 */
  let grids = GRP.map(g => { const tiles = allT.filter(h => g[4].includes(keyOf(h))); if (!tiles.length) return ''; return '<div class="hgrp' + (openG.includes(g[0]) ? ' open' : '') + '" data-grp="' + g[0] + '"><button class="hgh" data-ghd="' + g[0] + '"><span class="hgi">' + (icon({ sale: 'cart', ship: 'truck', money: 'wallet', look: 'book' }[g[0]], 22) || g[1]) + '</span><span class="hgt"><b>' + bi(g[2], g[3]) + '</b><small id="hg-' + g[0] + '">' + tiles.length + bt('개 화면', ' screens') + '</small></span><span class="hga">' + icon('chevDown', 18) + '</span></button><div class="hgrid">' + tiles.join('') + '</div></div>'; }).join('') +
    allT.filter(h => !GRP.some(g => g[4].includes(keyOf(h)))).join('');
  /* 🏠 v0.8.203 대시보드 — 머리(제목 · 기간) → 핵심 숫자 · 빠른 작업 · 할 일 · 출고 진행 · 매출 · 최근 주문 · 활동 (dash.js) → 아래에 전부 있던 화면 묶음 그대로 */
  /* 🏠 대시보드 (v0.8.217 · 2026-11-13 관리자): 창고 매니저 · 출고 · 인보이스 담당 = 창고 · 출고 대시보드 · 오피스 매니저 = 접수 · 주문 · 인보이스 대시보드
   *   매출은 오피스 매니저 · 오너 · 관리자만 (창고 · 출고 쪽에는 매출 칸 · 매출 상세 없음) */
  const showSales = isOwner() || myJobs().includes('office');
  const dctx = { can, ptxt, mode: j === 'office' ? 'office' : 'wh', sales: showSales };
  $('page').innerHTML = (matchMedia('(min-width:900px)').matches ? '<div class="ohead ohome">' + menuHtml(document.body.classList.contains('oscr'), true) + '</div>' : '') +
    '<div class="wd-hd" style="margin-bottom:12px"><div><h1>' + bt('대시보드', 'Dashboard') + '</h1><div class="sub">' + (j === 'office' ? bi('접수 · 주문 · 인보이스', 'Intake · orders · invoices') : j === 'whmgr' ? bi('창고', 'Warehouse') : bi('출고 · 인보이스', 'Fulfillment · invoicing')) + ' — ' + esc(ptxt) + '</div></div></div><div class="card" style="padding:10px 12px 4px">' + chips + '</div>' +
    '<div id="naBanH"></div><div id="hOld"></div>' + Dash.frame(dctx) + grids +
    (showSales ? '<details class="wd-det"><summary>' + icon('chart', 18) + bt('매출 상세 — 종류 · 세일즈맨별', 'Sales detail — by type · salesman') + '<span class="hga">' + icon('chevDown', 18) + '</span></summary><div class="card" id="hSales"><h2>📈 ' + bi('매출 (인보이스 기준)', 'Sales (invoiced)') + '</h2><div class="load">읽는 중…</div></div></details>' : '');
  document.querySelectorAll('[data-hp]').forEach(b => b.onclick = () => { LF.hp = b.dataset.hp; staffHome(); });
  document.querySelectorAll('.ohome [data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') return staffHome(); LF.st = b.dataset.lf; LF.list = true; pageOrder(''); });
  /* ◀ ▶ — 같은 길이만큼 앞뒤로 (달 단위 기간은 달로) */
  const shift = dir => { const isMonth = from.endsWith('-01') && (to === today() || to === Fulfill.monthEnd(from)); if (LF.hp === 'month' || LF.hp === 'lastm' || (LF.hp === 'custom' && isMonth && daysBetween(from, to) >= 27)) { const f = Fulfill.addMonths(from, dir); LF.hfrom = f; LF.hto = Fulfill.monthEnd(f); } else { LF.hfrom = addDays(from, dir * days); LF.hto = addDays(to, dir * days); } LF.hp = 'custom'; staffHome(); };
  $('hPrev').onclick = () => shift(-1); $('hNext').onclick = () => shift(1);
  $('hCalT').onclick = () => $('hCal').onclick();
  $('hCal').onclick = async () => { const r = await pickDates({ from, to, quick: Fulfill.quickRanges() }); if (!r) return; LF.hp = 'custom'; LF.hfrom = r[0]; LF.hto = r[1]; staffHome(); };
  document.querySelectorAll('[data-ghd]').forEach(b => b.onclick = () => { const g = b.closest('.hgrp'); g.classList.toggle('open'); const L = Array.from(document.querySelectorAll('.hgrp.open')).map(x => x.dataset.grp); try { localStorage.setItem(OKEY, JSON.stringify(L)); } catch (e) {} });
  document.querySelectorAll('[data-hg]').forEach(b => b.onclick = () => {
    const k = b.dataset.hg;
    if (k === 'adhoc') return import('./ship.js').then(M => M.adhocShip(() => staffHome()));   /* ➕ 주문 없이 UPS 라벨 */
    if (k.indexOf('/') > 0) { const [r, a] = k.split('/'); return Router.go(r, a); }   /* items/new · items/bulk 처럼 칸이 있는 화면 */
    if (k === 'new') { if (readWip() && !confirm('작성 중인 주문이 있습니다. 버리고 새로 시작할까요?')) return; clearWip(); return Router.go('order', 'new'); }
    if (k === 'stores' || k === 'verify' || k === 'items' || k === 'cat' || k === 'track' || k === 'flow' || k === 'credit' || k === 'bounce' || k === 'displays' || k === 'balcao' || k === 'shiphist' || k === 'notesups') return Router.go(k);
    if (k === 'inv' || k === 'shipped') { LF.ip = LF.hp; LF.ifrom = from; LF.ito = to; }
    if (k === 'inv') { LF.im = 'acct'; LF.iacct = ''; LF.iq = ''; }
    LF.st = k; LF.list = true; pageOrder('');
  });
  /* 🏠 대시보드 단추 — 원래 있던 화면 · 목록으로 (새 화면 없음) */
  const dOpen = k => {
    if (k === 'recv') return Router.go('recebimento');   /* 📥 입고 = 조의 상품 받기(REC) (v0.8.215) */
    if (k === 'inb') return Router.go('stock', k);
    if (k === 'low') return Router.go('stock', 'low');
    if (k === 'nobar') return Router.go('items', 'nobar');
    if (k === 'notesups' || k === 'cat' || k === 'displays' || k === 'stores' || k === 'credit') return Router.go(k);
    if (k === 'inv') { LF.ip = LF.hp; LF.ifrom = from; LF.ito = to; LF.im = 'date'; }
    if (k === 'new') { if (readWip() && !confirm('작성 중인 주문이 있습니다. 버리고 새로 시작할까요?')) return; clearWip(); return Router.go('order', 'new'); }
    if (k === 'shipped' || k === 'all') { LF.ip = LF.hp; LF.ifrom = from; LF.ito = to; }
    LF.st = k; LF.list = true; pageOrder('');
  };
  document.querySelectorAll('[data-wq]').forEach(b => b.onclick = () => dOpen(b.dataset.wq));
  document.querySelectorAll('[data-wk]').forEach(b => b.onclick = () => dOpen((dctx.mode === 'office' ? { in: 'sent', cf: 'cfw', rv: 'picked', iv: 'inv' } : { in: 'all', pick: 'pick', pack: 'done', ship: 'shipped' })[b.dataset.wk]));
  try {
    const [live, bo, ords, inv, pinv] = await Promise.all([
      S.DB.list('orders', { where: [['st', 'in', LIVE_ST]] }), S.DB.list('backorders', { where: [['st', '==', 'open']] }),
      S.DB.list('orders', { where: [['d', '>=', addDays(from, -7)], ['d', '<=', to]] }),
      dctx.sales ? salesRows(S, from, to) : Promise.resolve([]), dctx.sales && days <= 92 ? salesRows(S, pf, pt) : Promise.resolve(null)]);   /* 매출(인보이스)은 볼 수 있는 사람만 읽음 (v0.8.217) */
    if (!$('wdash') && !$('hSales')) return;
    const inR = iso => { const d = localDay(iso); return d >= from && d <= to; };
    const sentIn = ords.filter(o => o.sentAt && o.st !== 'draft' && o.st !== 'x' && inR(o.sentAt)), doneIn = ords.filter(o => (o.st === 'done' || o.st === 'shipped') && o.doneAt && inR(o.doneAt)), shipIn = ords.filter(o => o.st === 'shipped' && o.shipAt && inR(o.shipAt));
    const wait = live.filter(o => o.st === 'sent'), pk = live.filter(o => o.st === 'pick' || o.st === 'ok'), pkd = live.filter(o => o.st === 'picked'), topack = live.filter(o => o.st === 'done'), mine = pk.filter(o => o.picker === S.user.email);
    const put = (id, v) => { const el = $('ht-' + id); if (el) el.innerHTML = v; };
    if ($('ht-displays')) import('./displays.js').then(D => D.resumo()).then(r => { put('displays', r.lojas ? bt('대기', 'waiting') + ' ' + r.lojas + (r.atrasadas ? ' · <b class="warn">⚠️ ' + r.atrasadas + bt(' 지남', ' late') + '</b>' : '') : bt('없음', 'none')); }).catch(() => put('displays', ''));   // 🖼 Notes Display — 옛 WMS 흐름(notasDisplay · 가게 수)
    const nm = (L, f) => L.length ? L.length + '건 · ' + money(L.reduce((a, o) => a + (f ? f(o) : o.amt || 0), 0)) : '없음 · none';
    put('mine', nm(mine)); NewAcct.pendingBanner($('naBanH'));
    /* ⚠️ 하루 넘게 한 단계에 머문 주문 — 누르면 가장 오래된 주문이 있는 칸을 밀린 것만 */
    const olds = sortBy(live.map(o => ({ o, a: stageAge(o) })).filter(x => x.a && x.a.day), x => x.a.since), ob = $('hOld');
    if (ob && olds.length && !$('wdash')) {   // 대시보드가 있으면 띠 대신 할 일 칸의 첫 줄(#hOldB)
      const CH = { new: 'sent', cfw: 'cfw', cfok: 'cfok', pick: 'pick', picked: 'picked', done: 'done', packed: 'packed', dlv: 'dlv' };
      ob.innerHTML = '<button class="alert a-red oldbar" id="hOldB">⚠️ ' + bt('하루 넘게 밀린 주문', 'Orders waiting 1+ day') + ' <b>' + olds.length + '</b>' + bt('건', '') + ' · ' + bt('가장 오래된 것', 'oldest') + ' ' + esc(olds[0].o.store || '') + ' ⏱ ' + esc(olds[0].a.t) + ' — <u>' + bt('보기', 'view') + '</u></button>';
      $('hOldB').onclick = () => { LF.st = CH[olds[0].a.key] || 'sent'; LF.old = true; LF.list = true; pageOrder(''); };
    }
    /* 🏠 대시보드 숫자 (dash.js) — 같은 자료로 */
    Object.assign(dctx, { live, ords, bo, from, to, days, pf, pt, olds: olds.map(x => x.o), oldest: olds.length ? { store: olds[0].o.store || '', t: olds[0].a.t } : null, localDay,
      alert: k => { if (k === 'old') { const CH = { new: 'sent', cfw: 'cfw', cfok: 'cfok', pick: 'pick', picked: 'picked', done: 'done', packed: 'packed', dlv: 'dlv' }; LF.st = CH[olds[0].a.key] || 'sent'; LF.old = true; LF.list = true; return pageOrder(''); } if (k === 'ups' || k === 'bo') { LF.st = k; LF.list = true; return pageOrder(''); } dOpen(k); },
      openOrder: id => goOrder(id),
      lowStock: async () => { const m = await stockAll(false); await loadCatalog(S); const C = catalog(); const low = Object.keys(m).filter(c => { const q = Number(m[c]) || 0, it = C && C.byCode[c]; return it && !it.h && (q <= 0 || q < minOf(c)); }).length; const nobar = C ? (C.items || []).filter(x => !x.b && !x.virt && !x.h).length : 0; return { low, nobar }; },
      displaysLate: (can('ship') || can('invoice') || can('newOrder')) ? async () => (await (await import('./displays.js')).resumo()).atrasadas : null,
      recvLog: async () => (await S.DB.list('stockLog', { where: [['kind', '==', 'recv']], order: ['at', 'desc'], limit: 5 })) });
    Dash.fill(dctx);
    put('flow', bt('작업 중', 'working') + ' ' + pk.length + ' · 👷 ' + new Set(pk.map(o => o.picker).filter(Boolean)).size + bt('명', '') + ' · ' + bt('출고 전 전체', 'open') + ' ' + live.length);
    const nw = wait.filter(o => subOf(o) === 'sent'), cw = wait.filter(o => subOf(o) === 'cfw'), ck2 = wait.filter(o => subOf(o) === 'cfok'), pkd2 = live.filter(o => o.st === 'packed');
    put('sent', nm(sentIn) + (nw.length ? '<br><b style="color:#b91c1c">' + bt('확인할 신규', 'To review') + ' ' + nw.length + '</b>' : '<br>' + bt('대기 없음', 'none waiting')));
    put('cfw', cw.length ? '<b>' + cw.length + '</b> · ' + bt('세일즈맨 답 기다림', 'waiting for salesman') : bt('없음', 'none'));
    put('cfok', ck2.length ? '<b style="color:#b91c1c">' + ck2.length + ' ' + bt('배정 대기', 'to assign') + '</b>' : bt('없음', 'none'));
    { const dl = live.filter(o => o.st === 'dlv'), by = {}; dl.forEach(o => { const k = o.dlvBy || '?'; by[k] = (by[k] || 0) + 1; });
      put('dlv', dl.length ? '<b>' + dl.length + bt('건', ' orders') + '</b> · ' + esc(Object.keys(by).map(k => k + ' ' + by[k]).join(' · ')) : bt('없음', 'none')); }
    put('packed', pkd2.length ? '<b>' + pkd2.length + bt('건', ' orders') + ' · ' + pkd2.reduce((a, o) => a + (o.boxes || 1), 0) + ' ' + bt('박스', 'boxes') + '</b>' : bt('픽업 대기 없음', 'nothing waiting'));
    put('pick', nm(pk) + (wait.filter(o => o.cfReq && !o.cfOk).length + pk.filter(o => o.cfReq && !o.cfOk).length ? '<br>❓ 세일즈맨 확인 대기 ' + (wait.filter(o => o.cfReq && !o.cfOk).length + pk.filter(o => o.cfReq && !o.cfOk).length) + '건' : ''));
    put('picked', nm(pkd));
    put('done', nm(doneIn) + (topack.length ? '<br><b style="color:#b45309">포장 대기 ' + topack.length + '건</b>' : ''));
    put('shipped', nm(shipIn));
    put('ups', topack.length ? '<b>' + topack.length + '건 라벨 대기 · to ship</b>' : '대기 없음 · none waiting');
    put('bo', bo.length ? bo.length + '건 · ' + money(bo.reduce((a, r) => a + (r.amt || 0), 0)) : '없음 · none');
    /* 🗂 묶음 머리 숫자 — 접어 둬도 할 일이 보이게 */
    const gs = (id, parts) => { const el = $('hg-' + id); if (el) el.innerHTML = parts.filter(p => p[1]).map(p => p[0] + ' <b' + (p[2] ? ' style="color:#b91c1c"' : '') + '>' + p[1] + '</b>').join(' · ') || bt('대기 없음', 'nothing waiting'); };
    gs('sale', [[bt('신규', 'New'), nw.length, true], [bt('확인 대기', 'Awaiting'), cw.length], [bt('배정 대기', 'To assign'), ck2.length, true], [bt('작업 중', 'Picking'), pk.length], [bt('검수', 'Review'), pkd.length, true]]);
    gs('ship', [[bt('포장', 'Pack'), topack.length, true], [bt('픽업', 'Pickup'), pkd2.length], [bt('백오더', 'BO'), bo.length]]);
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
    if (!$('hSales')) return;   /* 매출 상세는 오피스 · 오너 · 관리자만 */
    $('hSales').innerHTML = '<h2>📈 ' + bi('매출 (인보이스 기준)', 'Sales (invoiced)') + ' · ' + esc(ptxt) + '</h2><div class="hero">' + money(tot) + '</div><div class="heroSub">' + invCount(iv) + '건 · ' + pcs.toLocaleString() + ' pcs' +
      (pv != null ? ' · 바로 앞 기간 ' + money(pv) + ' <b class="' + (tot >= pv ? 'ok' : 'warn') + '">' + (pv ? ((tot - pv) / pv * 100 >= 0 ? '+' : '') + Math.round((tot - pv) / pv * 100) + '%' : '') + '</b>' : '') + '</div>' +
      '<div class="kpi" style="grid-template-columns:1fr 1fr;margin-top:8px">' + Object.keys(byT).sort().map(t => '<div class="tap" data-ivt="' + (t.includes('Jewelry') ? 'J' : 'O') + '"><b>' + money(sum(byT[t], x => x.total || 0)) + '</b><span>' + esc(t) + ' · ' + invCount(byT[t]) + '건</span></div>').join('') + '</div>' + bars +
      (bySm.length ? '<table style="margin-top:8px;font-size:13px"><tr><th>세일즈맨</th><th class="r">건</th><th class="r">매출</th></tr>' + bySm.map(x => '<tr class="tap" data-ivsm="' + esc(x.sm) + '"><td><b>' + esc(x.sm) + '</b><div class="paybar" style="margin-top:3px"><i style="width:' + Math.round(x.amt / mx * 100) + '%;background:#3b82f6"></i></div></td><td class="r">' + x.n + '</td><td class="r"><b>' + money(x.amt) + '</b></td></tr>').join('') + '</table>' : '<div class="none">이 기간에 인보이스가 없습니다</div>') +
      (days > 92 ? '<div class="hint">긴 기간은 인보이스를 많이 읽어 느릴 수 있습니다</div>' : '');
    { const ser = days > 1 ? (() => { const m = groupBy(iv, x => x.d), out = []; for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push([md(d), sum(m[d] || [], x => x.total || 0)]); return out; })() : null;
      Dash.sales(dctx, tot, pv, ser, invCount(iv));
      if (days <= 1) salesRows(S, addDays(to, -13), to).then(R => { const m = groupBy(R.filter(x => x.st !== 'x'), x => x.d), out = []; for (let d = addDays(to, -13); d <= to; d = addDays(d, 1)) out.push([md(d), sum(m[d] || [], x => x.total || 0)]); Dash.sales(dctx, tot, pv, out, invCount(iv)); }).catch(() => {}); }
    document.querySelectorAll('[data-ivt]').forEach(b => b.onclick = () => { LF.im = 'date'; LF.ip = LF.hp; LF.ifrom = from; LF.ito = to; LF.it = b.dataset.ivt === 'J' ? (types.find(z => z.comm === 'A') || types[0]).c : ''; LF.st = 'inv'; LF.list = true; pageOrder(''); });
    document.querySelectorAll('[data-ivsm]').forEach(b => b.onclick = () => { LF.im = 'date'; LF.ip = LF.hp; LF.ifrom = from; LF.ito = to; LF.sm = b.dataset.ivsm; LF.st = 'inv'; LF.list = true; pageOrder(''); });
  } catch (e) { if ($('hSales')) $('hSales').innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; }
}
/* 📌 담당자 메뉴 — 접수 · 출고 · 완료 · 기타 묶음의 모든 칸이 항상 보임 (단계를 누를 때마다 생겼다 없어지지 않게 · v0.8.174).
 *   폰: 목록 위 고정 머리 · 컴퓨터(≥900px): 왼쪽 메뉴 아래에 세로로 고정 (style.js .omenu). 홈 화면(staffHome)에도 같은 메뉴 — 홈 칸이 켜짐.
 *   🔄 새로 고침 = 지금 칸을 다시 읽음 (연결이 느려 폰에 저장된 옛 목록이 먼저 보였을 때) */
/** 🧭 고정 서랍(데스크탑 왼쪽 메뉴)에 넣을 주문 메뉴 — 같은 칸(접수 · 출고 · 완료 · 기타). [[묶음, [[key, 아이콘, 한글, 영어]]]] (v0.8.181) */
/** 🧭 서랍 메뉴 설정(관리 › 메뉴)용 — 모든 주문 칸 (일에 상관없이 · 숨긴 단계 빼고) */
export function stageMenuAll() { return STG.map(g => [g, CHIPS.filter(c => g[4].includes(c[0]) && !HIDE_ST.includes(c[0])).map(c => { const i = c[1].indexOf(' '); return [c[0], c[1].substring(0, i), c[1].substring(i + 1), c[2]]; })]).filter(x => x[1].length); }
export function stageMenu() {
  if (!isStaff()) return [];
  const av = chipsFor(); return STG.map(g => [g, av.filter(c => g[4].includes(c[0])).map(c => { const i = c[1].indexOf(' '); return [c[0], c[1].substring(0, i), c[1].substring(i + 1), c[2]]; })]).filter(x => x[1].length);
}
/** 지금 켜진 주문 칸 — 서랍 표시용 ('' = 주문 화면이 아님) */
export function stageNow() { const h = location.hash; if (h === '#/shome' || ((h === '#/order' || h === '#/order/') && isStaff() && !LF.list)) return 'home'; return (h === '#/order' || h === '#/order/') && isStaff() ? LF.st : ''; }
/** 서랍에서 주문 칸 누르기 */
export function openStage(k) {
  LF.init = true;
  if (k === 'home') { LF.list = false; if (Router.home && Router.home !== 'shome') return Router.go(Router.home); if (location.hash === '#/shome') staffHome(); else Router.go('shome'); return; }   // 🏠 = 내 역할의 대시보드 (관리자 → 관리자 대시보드 · v0.8.243)
  LF.st = k; LF.list = true; if (location.hash === '#/order') pageOrder(''); else Router.go('order');
}
export function menuHtml(cmp, home) {
  const chip = (k, ic, ko, en, on) => '<button class="' + (on ? 'on' : '') + '" data-lf="' + k + '" title="' + esc(ko + ' · ' + en) + '"><span class="ci">' + stageIcon(k, ic, 17) + '</span><span class="cl">' + ko + ' <span class="en">' + en + '</span></span>' + (k === 'home' ? '' : '<b class="obn" data-lfn="' + k + '"></b>') + '</button>';   // 🔢 칸마다 건수 (fillStrip 이 채움 · v0.8.241)
  const chipOf = c => { const i = c[1].indexOf(' '); return chip(c[0], c[1].substring(0, i), c[1].substring(i + 1), c[2], !home && LF.st === c[0]); };
  const av = chipsFor(), groups = STG.map(g => [g, av.filter(c => g[4].includes(c[0]))]).filter(x => x[1].length);
  return '<div class="omenu"><div class="og otop"><div class="ochips">' + chip('home', '🏠', '홈', 'Home', !!home) + (home ? '' : '<button data-orf="1" title="' + esc('새로 고침 · Refresh') + '"><span class="ci">' + icon('refresh', 17) + '</span><span class="cl">새로 고침 <span class="en">Refresh</span></span></button>') +
    '<button data-ocmp="1" title="' + esc(bt('메뉴 작게 · 크게', 'Compact / full menu')) + '"><span class="ci">' + (cmp ? '🔽' : '🔼') + '</span><span class="cl">' + (cmp ? bt('크게', 'Full') : bt('작게', 'Compact')) + '</span></button></div></div>' +
    groups.map(([g, cs]) => '<div class="og" data-og="' + g[0] + '"><div class="ogl" title="' + esc(g[2] + ' · ' + g[3]) + '"><span class="ci">' + (icon({ recv: 'inbox', ship: 'package', fin: 'check', etc: 'hourglass' }[g[0]], 14) || g[1]) + '</span><span class="cl">' + g[2] + ' <span class="en">' + g[3] + '</span></span></div><div class="ochips">' + cs.map(chipOf).join('') + '</div></div>').join('') + '</div>';
}
function listHead() {
  if (!isStaff()) return pageHead('🛒 ' + bi('세일', 'Sales'), bt('새 주문 · 보낼 주문 · 사무실 확인 · 최근 주문', 'new order · to send · office confirmations · recent orders')) +
    '<div class="qgrid sale" style="margin-bottom:12px"><button type="button" class="qb blue" id="oNew"><span class="i">🛒</span><b>' + bi('새 주문', 'New order') + '</b></button><button type="button" class="qb" data-hg="' + (isStaff() ? 'credit/new' : 'order/credit') + '"><span class="i">↩</span><b>' + bi('크레딧 · 리턴', 'Credit') + '</b></button><button type="button" class="qb" data-hg="invs"><span class="i">📄</span><b>' + bi('인보이스', 'Invoices') + '</b></button><button type="button" class="qb" data-hg="mysales"><span class="i">📈</span><b>' + bi('내 매출', 'My sales') + '</b></button></div>';
  const j = jobOf();
  const pr = Fulfill.periodRange(LF.hp || 'today', LF.hfrom, LF.hto);
  const per = (LF.st === 'all' || LF.st === 'done' || LF.st === 'x' || LF.st === 'shipped') ? '<div class="chips" style="margin-top:0">' + Fulfill.PERIODS.filter(c => ['today', 'week', 'month', 'quarter', 'year'].includes(c[0])).map(c => '<button class="' + ((LF.hp || 'today') === c[0] ? 'on' : '') + '" data-hp2="' + c[0] + '">' + c[1] + '</button>').join('') + '<button class="' + (['today', 'week', 'month', 'quarter', 'year'].includes(LF.hp || 'today') ? '' : 'on') + '" id="hCal2">📅 ' + esc(md(pr[0]) + (pr[0] !== pr[1] ? ' ~ ' + md(pr[1]) : '')) + '</button></div>' : '';
  /* 위쪽 메뉴(상태 아이콘 · 기간)는 화면 위에 고정 — 아이콘은 옆으로 밀리지 않고 한눈에 다 보이는 격자 */
  const cmp = document.body.classList.contains('oscr');
  return statusStrip() + '<div class="ohead">' + menuHtml(cmp) + per + '</div>' +
    (j === 'pick' ? '' : '<div style="margin-bottom:10px">' + sel('lfSm', [['', '세일즈맨 전체 · All salesmen']].concat(S.sms.map(s => [s.code, s.code])), LF.sm) + '</div>');
}
function bindHead() {
  document.querySelectorAll('#page .qgrid.sale [data-hg]').forEach(b => b.onclick = () => { const [r, a] = b.dataset.hg.split('/'); if (a) Router.go(r, a); else Router.go(r); });
  document.querySelectorAll('[data-hp2]').forEach(b => b.onclick = () => { LF.hp = b.dataset.hp2; pageOrder(''); });
  if ($('hCal2')) $('hCal2').onclick = async () => { const pr = Fulfill.periodRange(LF.hp || 'today', LF.hfrom, LF.hto), r = await pickDates({ from: pr[0], to: pr[1], quick: Fulfill.quickRanges() }); if (!r) return; LF.hp = 'custom'; LF.hfrom = r[0]; LF.hto = r[1]; pageOrder(''); };
  if ($('oNew')) $('oNew').onclick = () => { if (readWip() && !confirm('작성 중인 주문이 있습니다. 버리고 새로 시작할까요?')) return; clearWip(); Router.go('order', 'new'); };
  document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') { LF.list = false; if (Router.home && Router.home !== 'shome') return Router.go(Router.home); return pageOrder(''); } LF.st = b.dataset.lf; pageOrder(''); });
  if ($('lfSm')) $('lfSm').onchange = () => { LF.sm = $('lfSm').value; pageOrder(''); };
}
/** 날짜별로 묶어서 — 하루치가 한눈에 (담당자 화면) */
function dayGroups(rows) {
  const ck = isStaff() && (NEWK[LF.st] || LF.st === 'pick' || LF.st === 'mine');
  /* ↕ 머리글(폰은 정렬 칩)을 누르면 묶음 없이 그 칸 순서로 · 세 번째 누르면 원래 묶음 (v0.8.198) */
  if (LF.osrt.k) { rows.forEach(o => { const a = isStaff() ? stageAge(o) : null; o._since = a ? a.since : (o.sentAt || o.createdAt || ''); }); return oTbl(SH.sortRows(rows, LF.osrt).map(o => orderRow(o, false, '', ck)).join(''), ck, LF.osrt); }
  if (!isStaff()) return oTbl(rows.map(o => orderRow(o)).join(''), false, LF.osrt);
  if (LF.grp !== 'day' && (NEWK[LF.st] || LF.st === 'pick' || LF.st === 'picked' || LF.st === 'mine')) {
    const by = {}; rows.forEach(o => { const k = o.sm || '—'; (by[k] = by[k] || []).push(o); });
    const nc = oCols(ck);
    return oTbl(Object.keys(by).sort().map(sm => { const L = by[sm], cf = L.filter(o => o.cfReq && !o.cfOk).length; const ask = LF.st === 'sent' && L.filter(o => cfAble(o) && !o.cfReq).length; return grpRow(nc, '<div class="gline"><b>👤 ' + esc(sm) + '</b><span>' + L.length + '건 · ' + money(L.reduce((a, o) => a + (o.amt || 0), 0)) + (cf ? ' · <span class="warn">확인 대기 ' + cf + '</span>' : '') + (ask ? ' <button type="button" class="b-blue b-sm" data-smcf="' + esc(sm) + '" style="margin-left:6px;padding:4px 9px">❓ ' + bt('전체 확인 요청', 'Ask to confirm') + ' ' + ask + '</button>' : '') + ' ▾</span></div>', ' data-smhd="' + esc(sm) + '"', 'tap') + L.map(o => orderRow(o, false, '', ck, sm)).join(''); }).join(''), ck);
  }
  const days = {}; rows.forEach(o => { const k = localDay(o.st === 'sent' && o.sentAt ? o.sentAt : o.updatedAt || o.createdAt || o.d); (days[k] = days[k] || []).push(o); });
  const asc = !!NEWK[LF.st] || OPEN_CH.includes(LF.st);   // 안 끝난 칸은 오래된 날짜가 위
  const nc = oCols(ck);
  return oTbl((asc ? Object.keys(days).sort() : Object.keys(days).sort().reverse()).map(d => { const L = days[d]; return grpRow(nc, '<div class="gline"><b>' + esc(dayLbl(d)) + '</b><span>' + L.length + '건 · ' + money(L.reduce((a, o) => a + (o.amt || 0), 0)) + '</span></div>') + L.map(o => orderRow(o, false, '', ck)).join(''); }).join(''), ck, LF.osrt);
}
const WDK = ['일', '월', '화', '수', '목', '금', '토'];
function dayLbl(d) { const t = today(); const x = new Date(d + 'T12:00:00'); return (d === t ? '오늘 Today · ' : '') + Number(d.substring(5, 7)) + '/' + Number(d.substring(8, 10)) + ' (' + WDK[x.getDay()] + ')'; }
export const cfTag = o => (o.cfIssueOpen ? ' <span class="tag t-r" title="' + esc(o.cfIssue || '') + '">⚠️ ' + bt('세일즈맨 문의', 'Salesman flagged') + '</span>' : '') + (o.cfOk ? ' <span class="tag t-k" title="Confirmed by salesman">✅ 세일즈맨 확인' + (o.cfHow === 'day' ? ' (' + bt('일괄', 'batch') + ')' : '') + '</span>' : o.cfReq ? ' <span class="tag t-c" title="Waiting for salesman">❓ 확인 대기</span>' : '');
/* 📊 주문 표 — ☐ · 가게(상태 · 표시) · 번호 · 날짜 · 세일즈맨 · 금액 · 줄/개 · 메모(담당 · 인보이스 · 트래킹 · 대기 시간) (· 📄) */
const oCols = ck => (ck ? 1 : 0) + 7 + (ck && assignMode() ? 1 : 0);
/** 묶음 머리 — 표에서는 tr.grp, 폰 카드에서는 .cgrp */
const grpRow = (nc, inner, attr, cls) => narrow() ? cgrp(inner, attr, cls) : '<tr class="grp ' + (cls || '') + '"' + (attr || '') + '><td colspan="' + nc + '">' + inner + '</td></tr>';
/* srt 가 있으면(주문 목록) 머리글을 눌러 정렬 — 가게 · 날짜 · 번호 · 세일즈맨 · 금액 · 줄 · 개 · 메모(⏱ 기다린 시간) · 폰은 정렬 칩 줄 (v0.8.198) */
function oTbl(rowsHtml, ck, srt) {
  const T = (k, label, cls, style) => srt ? SH.th(k, label, srt, cls, style) : '<th' + (cls ? ' class="' + cls + '"' : '') + (style ? ' style="' + style + '"' : '') + '>' + label + '</th>';
  if (narrow()) return (srt ? SH.chipsBar(srt, ['store', 'd', 'ono', 'sm', 'amt', 'wait']) : '') + '<div class="crows otbl">' + rowsHtml + '</div>';
  return '<div class="dtw"><table class="dt otbl"><thead><tr>' + (ck ? '<th style="width:30px"></th>' : '') + T('store', bt('가게', 'Store')) + T('d', bt('날짜', 'Date'), '', 'width:62px') + T('ono', bt('번호', 'No.'), '', 'width:118px') + T('sm', bt('세일즈맨', 'Rep'), 'hs', 'width:78px') + T('amt', bt('금액', 'Amount'), 'r', 'width:88px') + T('lines', bt('줄 · 개', 'Lines · pcs'), 'r hs', 'width:58px') + T('wait', bt('메모 · ⏱ 대기', 'Notes · ⏱ waiting')) + (ck && assignMode() ? '<th style="width:40px"></th>' : '') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
}
function orderRow(o, local, err, ck, sg) {
  const flags = payTag(o) + (o.kind === 'credit' ? ' <span class="tag crtag">↩ ' + bt('크레딧', 'Credit') + (o.cmNo ? ' ' + esc(o.cmNo) : '') + (o.why ? ' · ' + esc(o.why) : '') + '</span>' : '') + (NewAcct.isTemp(o.acct) ? ' <span class="tag t-b">🆕 ' + bt('신규 거래처', 'New account') + '</span>' : '') + (o.pdn ? ' <span class="tag t-c">가격 ' + o.pdn + '줄</span>' : '') + (o.discChg ? ' <span class="tag t-a">할인 변경</span>' : '') + (isStaff() ? cfTag(o) : (o.cfReq && !o.cfOk ? ' <span class="tag t-c">❓ 확인 요청</span>' : o.cfOk ? ' <span class="tag t-k">✅ 확인함</span>' : ''));
  const who = o.pickerName || o.picker ? '👷 ' + esc(o.pickerName || String(o.picker).split('@')[0]) : '';
  const ag = isStaff() && !local ? stageAge(o) : null, agT = ag ? ' <span class="tag agetag' + (ag.day ? ' old' : ag.late ? ' late' : '') + '" title="' + esc(bt('이 단계에서 기다린 시간', 'Waiting in this stage')) + '">⏱ ' + esc(ag.t) + '</span>' : '';
  const ty = isStaff() && o.ty ? Object.keys(o.ty).filter(k => k !== DT() && o.ty[k]).map(k => ' <span class="tag t-a" title="' + esc(bt('인보이스 종류 ', 'Invoice type ') + k) + '">🏷 ' + esc(k) + ' ' + o.ty[k] + '</span>').join('') : '';
  const notes = [(reqCount(o.req) ? '<b style="color:#b45309">🎁 ' + reqText(o.req, false, o.reqNote) + '</b>' : ''), who, (o.invs && o.invs.length ? '🧾 ' + esc(o.invs.join(', ')) : ''), (o.track ? '🚚 ' + esc(String(o.track).split(' ')[0]) + (String(o.track).includes(' ') ? ' +' + (String(o.track).split(' ').length - 1) : '') : ''), (o.deliveredAt ? '<b style="color:#15803d">✅ 배달 ' + esc(md(o.deliveredAt)) + '</b>' : ''), (o.memo ? '📝 ' + esc(String(o.memo).slice(0, 40)) : '')].filter(Boolean).join(' · ');
  const sga = sg ? ' data-sg="' + esc(sg) + '"' : '';
  if (narrow()) return crow({ attr: ' data-oid="' + esc(o.id) + '"' + sga, cls: 'tap' + (o.st === 'x' ? ' ox' : ''), ck: ck ? '<span class="ckw" data-ckw="' + esc(o.id) + '"><input type="checkbox" class="ck-big" data-ck="' + esc(o.id) + '"></span>' : '',
    title: esc(o.store || '-') + ' ' + stTag(local ? 'local' : o.st) + agT + flags + ty + (err ? '<div class="warn" style="font-size:11.5px">' + esc(err) + '</div>' : ''),
    sub: '<b>' + esc(md(o.d)) + '</b>' + (o.d0 ? ' <span class="muted" title="' + esc(bt('처음 담기 시작한 날', 'started on')) + '">(' + esc(md(o.d0)) + '~)</span>' : '') + ' · ' + esc(o.no) + (o.sm ? ' · ' + esc(o.sm) : '') + ' · ' + (o.n || 0) + bt('줄', ' ln') + ' ' + (o.qty || 0) + bt('개', ' pcs'), sub2: notes,
    num: money(o.amt), act: ck && assignMode() && o.st === 'sent' ? '<span class="cact"><button type="button" class="b-ghost b-sm qa" data-open="' + esc(o.id) + '">📄</button></span>' : '' });
  return '<tr class="tap' + (o.st === 'x' ? ' ox' : '') + '" data-oid="' + esc(o.id) + '"' + sga + '>' + (ck ? '<td><span class="ckw" data-ckw="' + esc(o.id) + '"><input type="checkbox" class="ck-big" data-ck="' + esc(o.id) + '"></span></td>' : '') +
    '<td class="ct wrap" style="min-width:150px"><b>' + esc(o.store || '-') + '</b> ' + stTag(local ? 'local' : o.st) + agT + flags + ty + (err ? '<div class="warn" style="font-size:11.5px">' + esc(err) + '</div>' : '') + '</td>' +
    '<td><b>' + esc(md(o.d)) + '</b>' + (o.d0 ? '<div class="muted" style="font-size:11px">' + esc(md(o.d0)) + '~</div>' : '') + '</td><td class="sub0">' + esc(o.no) + '</td><td class="hs">' + (o.sm ? '<span class="tag t-x">' + smShow(o) + '</span>' : '') + '</td>' +
    '<td class="r"><b>' + money(o.amt) + '</b></td><td class="r hs sub0">' + (o.n || 0) + ' · ' + (o.qty || 0) + '</td><td class="wrap sub0" style="min-width:120px">' + notes + '</td>' +
    (ck && assignMode() ? '<td>' + (o.st === 'sent' ? '<button type="button" class="b-ghost b-sm qa" data-open="' + esc(o.id) + '" title="' + esc(bt('주문 내용 보기', 'Open order')) + '">📄</button>' : '') + '</td>' : '') + '</tr>';
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
  if (!o) { $('page').innerHTML = '<div class="card"><div class="none">주문을 찾지 못했습니다</div></div>'; return; }
  const lines = (L && L.lines) || [];
  if (isStaff() && o.kind === 'credit') { const CM = await import('./credit.js'); return CM.reviewRequest(o, lines); }   /* ↩ 크레딧 요청 — 사무실이 확인해 CM 발행 (v0.8.187) */
  if (isStaff()) return Fulfill.manage(o, lines);
  viewOrder(o, lines, false);
}
function viewOrder(o, lines, local) {
  const acc = S.accounts.byCode ? S.accounts.byCode[o.acct] : null;
  const by = splitByType(lines, o.disc, 'q'), pd = priceDiff(lines, 'q');
  let h = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">' + esc(o.no) + ' ' + stTag(local ? 'local' : o.st) + '</h2>' +
    '<div style="font-size:17px;font-weight:800;margin-top:6px">' + esc(o.store) + '</div><div class="muted">' + esc([o.acct, acc ? [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : ''].filter(Boolean).join(' · ')) + '</div><div class="muted">' + smShow(o) + ' · ' + esc(o.d) + payTag(o) + '</div></div>' +
    '<button class="b-ghost b-sm" id="oBack">‹ 목록</button></div>' +
    (!local && !isStaff() ? stageBar(o) : '') +
    (o.smFor && o.smFor !== o.sm ? '<div class="alert a-amb">👤 ' + bi('다른 세일즈맨 가게 — 인보이스 이름', 'Another salesman\'s store — invoiced as') + ' <b>' + esc(o.smFor) + '</b> (' + bt('주문한 사람', 'ordered by') + ' ' + esc(o.sm) + ')</div>' : '') +
    typeSummary(by) +
    (pd.n ? '<div class="alert a-amb">가격 수정 ' + pd.n + '줄 · 목록가 대비 ' + (pd.diff >= 0 ? '+' : '') + money(pd.diff) + ' (' + pd.pct + '%)</div>' : '') +
    (o.st === 'x' ? '<div class="alert a-red">✕ <b>' + bi('취소된 주문', 'Cancelled order') + '</b>' + (o.cancelWhy ? ' — ' + bi('사유', 'Reason') + ': <b>' + esc(o.cancelWhy) + '</b>' : '') + (o.cancelAt ? ' <span class="muted">' + esc(String(o.cancelAt).substring(0, 16).replace('T', ' ')) + '</span>' : '') + '</div>' : '') +
    (reqCount(o.req) ? '<div class="alert a-amb">🎁 ' + bi('인서트 · 디스플레이 요청', 'Insert · display request') + ': <b>' + reqText(o.req, false, o.reqNote) + '</b></div>' : '') +
    (o.memo ? '<div class="alert a-blu">📝 ' + esc(o.memo) + '</div>' : '') +
    (o.kind === 'credit' ? '<div class="alert crban">↩ <b>' + bi('크레딧 요청', 'Credit request') + '</b>' + (o.why ? ' — ' + esc(o.why) : '') + ' · <b>−' + money(Math.abs(o.amt || 0)) + '</b><br>' + (o.cmNo ? '✅ ' + bt('사무실 확인 · 발행됨', 'Issued by the office') + ' <b>' + esc(o.cmNo) + '</b>' : o.st === 'x' ? '✕ ' + bt('사무실에서 취소', 'Cancelled by the office') : o.st === 'draft' ? bt('보낼 주문에서 주문과 같이 보내면 사무실이 확인합니다', 'Send it with your orders — the office checks it') : '⏳ ' + bt('사무실 확인 대기 — 확인되면 CM 번호가 나오고 가게 잔액에서 빠집니다', 'Waiting for the office — a CM is issued when checked')) + '</div>' : '') +
    (local ? '<div class="alert a-red">📤 아직 회사로 안 갔습니다 — 폰에 저장돼 있습니다</div>' : '') +
    (o.cfReq && !o.cfOk ? '<div class="alert a-amb">❓ ' + bi('사무실에서 이 주문 내용이 맞는지 확인을 요청했습니다. 아래 아이템을 보고 맞으면 ✅, 아니면 ✏️ 수정.', 'The office asks you to confirm this order.') + (o.cfNote ? '<div style="margin-top:6px;font-weight:800">💬 ' + esc(o.cfNote) + '</div>' : '') + '</div>' : o.cfOk ? '<div class="alert a-grn">✅ ' + bi('확인한 주문', 'Confirmed') + ' ' + esc(String(o.cfAt || '').substring(0, 16).replace('T', ' ')) + '</div>' : '') + '</div>';
  const B = [];
  if (o.acct) B.push('<button class="b-ghost" id="oStoreI">📋 가게 기록</button>');
  if (!local && !isStaff()) B.push('<button class="b-ghost" id="oMsg">💬 ' + bi('사무실에 문의', 'Ask the office') + '</button>');
  if (canEdit(o)) B.push('<button class="b-ghost" id="oEdit">✏️ 수정</button>');
  if (!local && canEdit(o)) B.push('<button class="b-ghost" id="oStoreChg">🏬 ' + bi('가게 바꾸기', 'Change store') + '</button>');
  if (local) B.push('<button class="b-blue" id="oSyncOne">📤 지금 보내기</button>');
  if (local && readOut()[o.id] && readOut()[o.id].err) B.push('<button class="b-ghost" id="oDropLocal" style="color:#991b1b">🗑 이 기록 지우기</button>');
  else if (o.st === 'draft' && o.sm === mySm()) B.push('<button class="b-blue" id="oSend">📤 회사로 보내기</button>');
  if (!local && o.cfReq && !o.cfOk && o.sm === mySm() && o.st !== 'x') B.push('<button class="b-green" id="oCfOk">✅ ' + bi('맞습니다 · 확인', 'Confirm') + '</button>');
  /* ✕ 세일즈맨 취소 — 폰에만 있는 주문은 지우기 · 임시/접수(작업 전)는 바로 취소 · 작업 시작 뒤에는 사무실에 취소 요청 */
  const mine = o.sm === mySm() || local;
  if (!local && mine && REQ_ST.includes(o.st) && !o.cfIssueOpen) B.push('<button class="b-blue" id="oReq">📣 ' + bi('사무실에 요청', 'Ask the office') + '</button>');   /* 🛑 홀드 · ✏️ 수정 · 🖼 디스플레이 추가 · 💬 기타 (v0.8.190) */
  if (mine && local && !(readOut()[o.id] && readOut()[o.id].err)) B.push('<button class="b-ghost" id="oCxLocal" style="color:#991b1b">✕ ' + bi('주문 취소', 'Cancel order') + '</button>');
  else if (!local && mine && (o.st === 'draft' || o.st === 'sent')) B.push('<button class="b-ghost" id="oCx" style="color:#991b1b">✕ ' + bi('주문 취소', 'Cancel order') + '</button>');
  else if (mine && ['pick', 'ok', 'picked'].includes(o.st) && !o.cfIssueOpen) B.push('<button class="b-ghost" id="oCxReq" style="color:#991b1b">✕ ' + bi('취소 요청 (작업 중)', 'Ask to cancel') + '</button>');
  else if (mine && ['pick', 'ok', 'picked'].includes(o.st) && o.cfIssueOpen) B.push('<span class="muted" style="align-self:center">⏳ ' + bi('사무실에 보낸 요청 처리 중', 'Request sent to the office') + '</span>');
  if (B.length) h += '<div class="card"><div class="btns" style="margin-top:0">' + B.join('') + '</div></div>';
  h += '<div class="card"><h2>아이템 ' + lines.length + '줄</h2><input id="oFind" placeholder="이 주문 안에서 찾기" autocomplete="off" style="margin-bottom:6px"><div id="oLines"></div></div>';
  if (B.length) h += footBtns(B.join(''));   // ⤵ 줄 목록 아래에도 같은 단추 (✅ 확인 · 📤 보내기)
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
  if ($('oReq')) $('oReq').onclick = () => smRequest(o);
  if ($('oMsg')) $('oMsg').onclick = async () => { const M = await import('./msg.js'); M.compose({ to: 'g:office', ref: { kind: 'order', id: o.id, label: o.no + ' · ' + o.store } }); };
  if ($('oCx')) $('oCx').onclick = () => Fulfill.cancelAsk(o, true);
  if ($('oCxLocal')) $('oCxLocal').onclick = async () => { if (!(await confirmBox(bt('아직 회사로 안 간 주문입니다. 폰에서 지울까요?', 'This order has not reached the office yet. Delete it from this phone?') + '\n' + (o.store || '') + ' · ' + money(o.amt || 0), '✕ ' + bt('지우기', 'Delete')))) return; const b = readOut(); delete b[o.id]; writeOut(b); toast(bt('지웠습니다', 'Deleted'), 'good'); Router.go('order'); };
  if ($('oCxReq')) $('oCxReq').onclick = () => cancelReq(o);
  if ($('oDropLocal')) $('oDropLocal').onclick = async () => { if (!(await confirmBox('회사로 못 간 이 주문을 폰에서 지울까요? (' + readOut()[o.id].err + ')', '지우기'))) return; const b = readOut(); delete b[o.id]; writeOut(b); Router.go('order'); };
  if ($('oSyncOne')) $('oSyncOne').onclick = async () => { busy(true); const r = await syncOutbox(false); busy(false); if (!r.sent) toast('인터넷이 안 됩니다 — 폰에 그대로 있습니다', 'bad'); else goOrder(o.id); };
  if ($('oSend')) $('oSend').onclick = async () => { const ol = Object.assign({}, o, sendStamp(o)); putOut(ol, lines); await syncOutbox(false); Router.markSaved('order'); goOrder(o.id); };
}
/* ---------- 📍 세일즈맨이 보는 주문 단계 · 📣 사무실에 요청 (2026-11-12 관리자: "오더를 보낸 뒤 오피스에서 작업 중이면 어느 단계인지 보고, 수정 · 홀드 · 디스플레이 추가 등을 메시지 · 노티스로") · v0.8.190 ---------- */
const REQ_ST = ['sent', 'ok', 'pick', 'picked', 'done', 'packed', 'dlv'];
const t5 = v => v ? esc(String(v).substring(5, 16).replace('T', ' ')) : '';
/** 단계 칸 아래 시간 — 오늘이면 시:분, 아니면 월/일 (칸이 좁아서) */
const stT = v => { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return localDay(d) === today() ? p(d.getHours()) + ':' + p(d.getMinutes()) : (d.getMonth() + 1) + '/' + d.getDate(); };
/** 단계 막대 — 📤 접수 → ❓ 확인 → 👷 픽킹 → 🔍 검수 → 🧾 인보이스 → 📦 포장 · 🚗 딜리버리 → 🚚 출고 · 지금 단계 · 그 단계에서 바꿀 수 있는 것 */
export function stageBar(o) {
  if (o.st === 'draft' || o.st === 'x') return '';
  const S7 = [['sent', '📤', '접수', 'Received', o.sentAt], ['cf', '❓', '확인', 'Confirmed', o.cfOk ? o.cfAt : ''], ['pick', '👷', '픽킹', 'Picking', o.pickAt], ['picked', '🔍', '검수', 'Review', o.pickDoneAt], ['done', '🧾', '인보이스', 'Invoiced', o.doneAt], ['pack', o.st === 'dlv' ? '🚗' : '📦', o.st === 'dlv' ? '딜리버리' : '포장', o.st === 'dlv' ? 'Delivery' : 'Packed', o.st === 'dlv' ? o.dlvAt : o.packAt], ['shipped', '🚚', '출고', 'Shipped', o.shipAt || o.dlvDoneAt]];
  const cur = { sent: o.cfOk ? 1 : 0, ok: 2, pick: 2, picked: 3, done: 4, packed: 5, dlv: 5, shipped: 6 }[o.st]; if (cur == null) return '';
  const hint = cur <= 1 ? bt('아직 창고 작업 전 — ✏️ 수정으로 바로 고칠 수 있습니다', 'Not started yet — edit it directly') : cur <= 3 ? bt('창고에서 작업 중 — 바꿀 것이 있으면 📣 사무실에 요청', 'Being picked — use 📣 Ask the office for changes') : cur === 4 ? bt('인보이스 발행됨 — 바꿀 것은 📣 요청 (사무실이 인보이스를 고침)', 'Invoiced — ask the office to edit the invoice') : bt('나가는 중 · 나감 — 바꿀 것은 📣 요청 또는 크레딧', 'Leaving or left — ask the office or give a credit');
  return '<div class="stagebar" id="oStage">' + S7.map((x, i) => '<div class="stg' + (i < cur ? ' done' : i === cur ? ' cur' : '') + '"><span class="i">' + (i < cur ? '✓' : x[1]) + '</span><b>' + bi(x[2], x[3]) + '</b>' + (x[4] && i <= cur ? '<small>' + stT(x[4]) + '</small>' : '') + '</div>').join('') + '</div>' +
    '<div class="muted" style="font-size:12.5px;margin-top:4px">📍 ' + hint + '</div>' +
    (o.cfIssue ? '<div class="alert ' + (o.cfIssueOpen ? 'a-amb' : 'a-grn') + '" style="margin-top:6px">' + (o.cfIssueOpen ? '⏳ ' + bt('사무실에 보낸 요청 — 확인 중', 'Request sent — office reviewing') : '✅ ' + bt('사무실이 처리함', 'Handled by the office') + ' ' + t5(o.cfIssueDoneAt)) + '<br><b>' + esc(o.cfIssue) + '</b> <span class="muted">' + t5(o.cfIssueAt) + '</span></div>' : '');
}
const REQ_KINDS2 = [['hold', '🛑', '홀드', 'Hold'], ['edit', '✏️', '수정', 'Change'], ['disp', '🖼', '디스플레이 추가', 'Add display'], ['etc', '💬', '기타', 'Other']];
/** 📣 사무실에 요청 — 종류 + 내용 → 주문의 ⚠️ 문제 알림 칸(cfIssue · 담당자 화면 빨간 띠 · ✅ 처리) + 사무실 알림(메일 · 챗) */
function smRequest(o) {
  let kind = 'hold';
  const paint = () => {
    $('mbox').innerHTML = '<h2>📣 ' + bi('사무실에 요청', 'Ask the office') + '</h2><div class="sumbox"><b>' + esc(o.no || o.id) + '</b> · ' + esc(o.store) + ' · ' + money(o.amt || 0) + ' · ' + stTag(o.st) + '</div>' +
      '<div class="chips" style="margin-top:8px">' + REQ_KINDS2.map(k => '<button type="button" class="' + (kind === k[0] ? 'on' : '') + '" data-rqk="' + k[0] + '">' + k[1] + ' ' + bi(k[2], k[3]) + '</button>').join('') + '</div>' +
      '<div class="fg" style="margin-top:8px"><label>' + bi('내용 (필수)', 'Details (required)') + '</label><textarea id="rqT" rows="3" placeholder="' + esc(kind === 'hold' ? bt('예: 가게가 돈 준비될 때까지 보내지 말아 주세요', 'e.g. hold until the store is ready to pay') : kind === 'edit' ? bt('예: AHG100 10개 → 20개 · CTE04 빼기', 'e.g. AHG100 10 → 20 · remove CTE04') : kind === 'disp' ? bt('예: C4 디스플레이 1개 같이', 'e.g. add one C4 display') : '') + '"></textarea></div>' +
      '<div class="btns"><button type="button" class="b-ghost" id="rqX">' + bi('닫기', 'Close') + '</button><button type="button" class="b-blue" id="rqGo">📣 ' + bi('보내기', 'Send') + '</button></div>';
    document.querySelectorAll('[data-rqk]').forEach(b => b.onclick = () => { const t = $('rqT').value; kind = b.dataset.rqk; paint(); $('rqT').value = t; });
    $('rqX').onclick = closeModal;
    $('rqGo').onclick = async () => {
      const txt = $('rqT').value.trim(); if (!txt) return toast(bt('내용을 적어 주세요', 'Write the details'), 'bad');
      const k = REQ_KINDS2.find(x => x[0] === kind), head = k[1] + ' ' + k[2] + ' ' + bt('요청', 'request');
      busy(true);
      try {
        const now = new Date().toISOString();
        await S.DB.update('orders', o.id, { cfIssue: k[1] + ' ' + k[2] + ' 요청: ' + txt, cfIssueAt: now, cfIssueOpen: true });
        try { await Notify.queue({ kind: 'smReq', toStaff: true, chat: true, orderId: o.id, subject: '[THE ONE] ' + k[1] + ' ' + k[2] + ' 요청 — ' + o.store + ' (' + o.sm + ')', text: k[1] + ' ' + k[2] + ' 요청 ' + o.sm + ' · ' + o.store + ' (' + (o.no || o.id) + ', ' + money(o.amt || 0) + ', ' + stName(o.st) + ')\n' + txt, url: Notify.appUrl('order/' + o.id) }); } catch (e) {}
        closeModal(); toast('📣 ' + head + ' — ' + bt('사무실에 보냈습니다', 'sent to the office'), 'good'); goOrder(o.id);
      } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  openModal(''); paint();
}
/** ✕ 작업이 시작된 주문 — 세일즈맨은 바로 못 지우고 사무실에 취소 요청 (⚠️ 문제 알림과 같은 칸 → 담당자 화면 빨간 띠 · 알림) */
function cancelReq(o) {
  openModal('<h2 style="color:#991b1b">✕ ' + bi('취소 요청', 'Ask to cancel') + '</h2><div class="sumbox"><b>' + esc(o.no || o.id) + '</b> · ' + esc(o.store) + ' · ' + money(o.amt || 0) + '</div>' +
    '<div class="alert a-amb">' + bi('창고에서 이미 작업 중이라 바로 취소할 수 없습니다. 사무실에 요청하면 담당자가 확인해 취소합니다.', 'The warehouse already started this order, so it cannot be cancelled directly. The office will review and cancel it.') + '</div>' +
    '<div class="fg"><label>' + bi('사유 (필수)', 'Reason (required)') + '</label><input id="crWhy" placeholder="' + esc(bt('예: 가게가 주문 취소 · 중복 주문 · 잘못 넣음', 'e.g. store cancelled · duplicate · entered by mistake')) + '" autocomplete="off"></div>' +
    '<div class="btns"><button class="b-ghost" id="crX">' + bt('돌아가기', 'Back') + '</button><button class="b-red" id="crGo">✕ ' + bt('사무실에 취소 요청', 'Ask the office') + '</button></div>');
  $('crX').onclick = closeModal;
  $('crGo').onclick = async () => {
    const why = $('crWhy').value.trim(); if (!why) return toast(bt('사유를 적어 주세요', 'Give a reason'), 'bad');
    busy(true);
    try { const now = new Date().toISOString(); await S.DB.update('orders', o.id, { cfIssue: '✕ 취소 요청: ' + why, cfIssueAt: now, cfIssueOpen: true }); await Notify.queue({ kind: 'cancelReq', toStaff: true, chat: true, orderId: o.id, subject: '[THE ONE] ✕ 취소 요청 — ' + o.store + ' (' + o.sm + ')', text: '✕ 취소 요청 ' + o.sm + ' · ' + o.store + ' (' + (o.no || o.id) + ', ' + money(o.amt || 0) + ')\n사유: ' + why, url: Notify.appUrl('order/' + o.id) }); closeModal(); toast('✕ ' + bt('사무실에 취소 요청을 보냈습니다', 'Cancel request sent'), 'good'); goOrder(o.id); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 종류별 합계 · 할인 표 */
export function typeSummary(by) {
  const g = Object.values(by); if (!g.length) return '';
  const names = {}; invTypes(S).forEach(t => { names[t.c] = t.n; }); names[OB] = names[OB] || bt('타사 제품 · 가격으로', 'Other brands · by price');
  const tot = g.reduce((a, x) => a + x.total, 0);
  return '<div style="margin-top:8px">' + g.map(x => '<div class="trow"><span class="tb ' + esc(x.t) + '">' + esc(x.t) + '</span><div class="tx"><b>' + esc(names[x.t] || x.t) + '</b><small>' + x.qty + '개 · ' + money(x.sub) + (x.disc ? ' · 할인 ' + x.disc + '% (−' + money(x.sub - x.total) + ')' : '') + '</small></div><span class="ta">' + money(x.total) + '</span></div>').join('') +
    (g.length > 1 ? '<div class="trow sum"><div class="tx"><b>합계 Total</b><small>' + g.reduce((a, x) => a + x.qty, 0) + '개 · 인보이스 ' + g.length + '장</small></div><span class="ta">' + money(tot) + '</span></div>' : '') + '</div>';
}

/* ============================================================
 *  주문 작성 · 수정
 * ============================================================ */
let O = null;   // { id, no, st, sm, acct, store, memo, disc, lines:[{c,d,q,p,lp,t}], view, q, path, createdAt, createdBy, d, pick? }
let IDX = {};
function readWip(k) { try { const w = JSON.parse(localStorage.getItem(wipKey(k)) || 'null'); return w && Array.isArray(w.lines) ? w : null; } catch (e) { return null; } }
function clearWip(k) { try { localStorage.removeItem(wipKey(k)); } catch (e) {} }
/** 📒 카탈로그에서 고른 아이템을 작성 중 주문에 담기 (없으면 새 주문, 이미 있으면 +1) — 담은 개수 */
export function addToWip(codes) {
  const C = catalog(); if (!C) return 0;
  const w = O || readWip() || { id: '', no: '', st: 'draft', sm: isStaff() ? '' : mySm(), acct: '', store: '', memo: '', req: {}, disc: {}, lines: [], d: today() };
  let n = 0;
  codes.forEach(code => { const it = C.byCode[code]; if (!it) return; const ex = w.lines.find(l => l.c === it.c); if (ex) ex.q += 1; else { const l = { c: it.c, d: it.d, q: 1, p: it.p, lp: it.p, t: typeOfItem(S, it) }; if (it.k) l.kit = it.k.map(x => ({ c: x[0], q: x[1] })); w.lines.push(l); } n++; });
  w.view = 'cart';
  if (w === O) { reindex(); flushWip(); } else try { localStorage.setItem(wipKey(), JSON.stringify(w)); } catch (e) {}
  return n;
}
/** 🛒 이 가게로 새 주문 (크레딧 화면의 "교환 물건 주문") — 작성 중 주문이 있으면 물어보고, 가게 · 할인 · 세일즈맨을 채워 주문 화면으로 */
export function startOrderFor(acct) {
  const a = S.accounts && S.accounts.byCode && S.accounts.byCode[acct]; if (!a) return Router.go('order', 'new');
  const w = readWip(); if (w && w.lines.length && w.acct !== a.acct && !confirm(bt('작성 중인 주문이 있습니다. 버리고 이 가게로 새로 시작할까요?', 'You have an order in progress. Discard it and start one for this store?'))) return;
  O = { id: '', no: '', st: 'draft', sm: isStaff() ? (a.sm ? String(a.sm).toUpperCase() : '') : mySm(), acct: a.acct, store: a.store, memo: '', req: {}, disc: acctDisc(a), lines: w && w.acct === a.acct ? w.lines : [], d: today(), view: 'add' };
  flushWip(); Router.go('order', 'new');
}
const newCredit = a => ({ kind: 'credit', why: '', id: '', no: '', st: 'draft', sm: isStaff() ? (a && a.sm ? String(a.sm).toUpperCase() : '') : mySm(), acct: a ? a.acct : '', store: a ? a.store : '', memo: '', req: {}, disc: a ? acctDisc(a) : {}, lines: [], d: today(), view: 'add' });
/** ↩ 이 가게로 크레딧 (주문 화면의 ↩ 크레딧) — 크레딧 작성 중이 다른 가게면 물어보고 새로 */
export function startCreditFor(acct) {
  const a = S.accounts && S.accounts.byCode && S.accounts.byCode[acct]; if (!a) return Router.go('order', 'credit');
  if (O && !isCr()) flushWip();   // 작성 중 주문은 폰에 그대로 (돌아오면 이어서)
  const w = readWip('credit'); if (w && w.lines.length && w.acct !== a.acct && !confirm(bt('작성 중인 크레딧이 있습니다. 버리고 이 가게로 새로 시작할까요?', 'You have a credit in progress. Discard it and start one for this store?'))) return Router.go('order', 'credit');
  O = w && w.acct === a.acct ? w : newCredit(a); flushWip(); Router.go('order', 'credit');
}
function flushWip() { if (!O) return; try { localStorage.setItem(wipKey(O.kind), JSON.stringify(O)); } catch (e) {} }
const saveWip = debounce(flushWip, 400);
if (typeof window !== 'undefined') { window.addEventListener('pagehide', flushWip); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushWip(); }); }
function reindex() { IDX = {}; O.lines.forEach(l => { IDX[l.c] = l; }); }
function accDiscOf() { return acctDisc(O.acct && S.accounts.byCode ? S.accounts.byCode[O.acct] : null); }

export async function openEditor(order, wip, lines) {
  if (!order && !wip && !isStaff() && !mySm() && !(S.me && S.me.role === 'admin')) return toast('세일즈맨 코드가 없습니다', 'bad');   /* 관리자는 세일즈 모드에서도 주문 — 세일즈맨은 가게 기본값 · 저장 때 고름 (v0.8.173) */
  $('page').innerHTML = '<div class="load">아이템 목록 준비 중… (처음 한 번은 조금 걸립니다)</div>';
  try { await loadCatalog(S); } catch (e) { if (!catalog()) { $('page').innerHTML = '<div class="card"><div class="alert a-red">아이템 목록을 읽지 못했습니다: ' + esc(e.code || e.message) + '</div></div>'; return; } }
  if (!catalog().items.length) { $('page').innerHTML = '<div class="card"><div class="none">아직 아이템 목록이 없습니다.<br>관리 → 📦 아이템에서 Item Master 를 올려 주세요.</div></div>'; return; }
  if (wip) O = wip;
  else if (order) {
    if (!lines) { const L = await S.DB.get('orderLines', order.id); lines = (L && L.lines) || []; }
    O = { id: order.id, no: order.no, st: order.st, sm: order.sm, smFor: order.smFor || '', pay: order.pay || '', acct: order.acct, store: order.store, memo: order.memo || '', req: Object.assign({}, order.req || {}), reqNote: Object.assign({}, order.reqNote || {}), disc: Object.assign({}, order.disc || {}), lines: lines.map(l => Object.assign({}, l)), createdAt: order.createdAt, createdBy: order.createdBy, d: order.d, sentAt: order.sentAt || '' };
  } else O = { id: '', no: '', st: 'draft', sm: isStaff() ? '' : mySm(), acct: '', store: '', memo: '', req: {}, disc: {}, lines: [], d: today() };
  if (order && order.kind === 'credit' && !wip) { O.kind = 'credit'; O.why = order.why || ''; }
  O.disc = O.disc || {};
  O.view = O.view || (O.lines.length ? 'cart' : 'add'); O.q = ''; O.path = O.path || [];
  INFO = null; FOCUS = '';
  if (WANT_NEW) { WANT_NEW = false; O.view = 'add'; O.path = []; O.nw = true; }
  reindex(); saveWip();
  paintEditor();
  if (!order && O.acct && O.smFor === undefined) askSmFor(S.accounts.byCode && S.accounts.byCode[O.acct]);   // 가게 창 · 크레딧 화면에서 "이 가게로" 시작한 경우
}
/** 👤 세일즈맨이 다른 세일즈맨 가게를 골랐을 때 한 번 묻기 — 그 세일즈맨 이름으로 할지, 내 이름으로 할지 (2026-11-12 관리자: "그 세일즈맨으로 그대로 오더를 넣을 건지 내 이름으로 넣을 건지"). 물었으면 true
 *  주문 문서의 sm 은 쓴 사람 그대로(규칙 · 내 목록 · 확인 요청), smFor 가 인보이스 · CM 의 세일즈맨 */
function askSmFor(a) {
  return new Promise(res => {
    const me = mySm(), other = a && a.sm ? String(a.sm).toUpperCase() : '';
    if (!O || needSm() || !me || !other || other === me) { if (O && O.smFor === undefined) { O.smFor = ''; saveWip(); } return res(false); }
    let done = false; const fin = v => { if (done) return; done = true; if (O) { O.smFor = v ? other : ''; saveWip(); paintEditor(); } res(true); };
    openModal('<h2>👤 ' + bi('다른 세일즈맨의 가게입니다', 'Another salesman\'s store') + '</h2><div class="muted" style="font-size:15px;line-height:1.45"><b>' + esc(a.store) + '</b> — ' + bt('담당', 'salesman') + ' <b>' + esc(other) + '</b><br>' + bt('이 주문을 누구 이름으로 넣을까요? (인보이스 · 커미션이 그 이름으로 갑니다)', 'Whose name goes on this order? (invoice and commission)') + '</div>' +
      '<div class="btns" style="flex-direction:column;align-items:stretch;margin-top:12px"><button type="button" class="b-blue" id="sfOther">👤 ' + esc(other) + ' ' + bi('이름으로', 'name') + '</button><button type="button" class="b-ghost" id="sfMe">🙋 ' + bi('내 이름으로', 'My name') + ' (' + esc(me) + ')</button></div>', { onClose: () => fin(false) });
    $('sfOther').onclick = () => { fin(true); closeModal(); };
    $('sfMe').onclick = () => { fin(false); closeModal(); };
  });
}
let WANT_NEW = false;
function totals() { crDisc(); const by = splitByType(O.lines, O.disc, 'q'); let qty = 0, amt = 0; Object.values(by).forEach(g => { qty += g.qty; amt += g.total; }); return { n: O.lines.filter(l => l.q > 0).length, qty, amt: R2(amt), by }; }

function paintEditor() {
  const t = totals();
  const acc = O.acct && S.accounts.byCode ? S.accounts.byCode[O.acct] : null;
  /* 위 고정 (SBMGo 처럼) — 가게 한 줄 · 주문 / 주문 확인 / 메모 · (담기 화면이면) 검색 + 분류 경로. 아래 내용만 움직임 */
  /* 🛒 아이템 담는 동안은 가게 칸을 한 줄로 접음(이름 · 코드 · 미수금 · 📋 · 바꾸기) — 위 고정 칸이 낮아져 목록이 더 보임. 주문 확인 · 메모에서는 펼침 */
  const slim = O.view === 'add' && !!O.store;
  let h = '<div class="ehead' + (slim ? ' slim' : '') + '" id="eHead"><div class="etop"><div class="erow">';
  if (O.store) h += '<div class="estore"><div class="es1"><b>' + (O.id ? '✏️ ' : '') + esc(O.store) + '</b><small>' + esc(acc ? acc.acct + (slim ? '' : ' · ' + [acc.city, acc.state].filter(Boolean).join(', ')) : (O.acct || '계정 없음')) + ' <span id="eStoreBal"></span></small><small id="eStoreHist"></small></div>' + (O.acct ? '<button class="b-ghost b-sm" id="eStoreI" title="' + esc(bt('이 가게 기록 — 인보이스 · 주문 · 수금 · 노트', 'Store history — invoices · orders · payments · notes')) + '">📋 ' + bt('기록', 'History') + '</button>' + (O.id || isCr() ? '' : '<button class="b-ghost b-sm" id="eStoreCr" title="' + esc(bt('이 가게에 크레딧 · 리턴 — 주문은 그대로 남음', 'Credit / return for this store — the order stays')) + '">↩ ' + bt('크레딧', 'Credit') + '</button>') : '') + '<button class="b-ghost b-sm" id="eStoreX">' + (slim ? '🔁' : bi('바꾸기', 'Change')) + '</button></div>';
  else h += '<div style="flex:1;min-width:0;position:relative"><input id="eStoreQ" placeholder="🏬 가게 이름 · 계정코드 · 도시 / Store name · Acct # · City" autocomplete="off"><div class="hits" id="eStoreHits" style="display:none"></div></div>';
  h += '</div><div class="etabs"><button class="' + (O.view === 'add' ? 'on' : '') + '" data-ev="add">' + (isCr() ? '↩ ' + bi('담기', 'Add') : '🛒 ' + bi('주문', 'Order')) + '</button><button class="' + (O.view === 'cart' ? 'on' : '') + '" data-ev="cart">✅ ' + (isCr() ? bi('크레딧 확인', 'Review') : bi('주문 확인', 'Review')) + ' <span class="cnt" id="eCnt">' + t.n + '</span></button><button class="' + (O.view === 'memo' ? 'on' : '') + '" data-ev="memo">' + (isCr() ? '📝 ' + bi('사유 · 메모', 'Reason') : '📝 ' + bi('메모', 'Memo')) + '<span id="eMdot">' + (O.memo || reqCount(O.req) || (isCr() && O.why) ? ' •' : '') + '</span></button></div></div><div id="eTop"></div></div>';
  /* 고정 칸 밖: 수정 중 표시 · 메모 · 고정 노트 · (담당자) 세일즈맨 */
  if (isCr()) h += '<div class="alert crban" id="eCrBan">↩ <b>' + bi('크레딧 · 리턴', 'Credit · Return') + '</b> — ' + bt('돌려받을 물건을 주문처럼 눌러 담으세요. 저장하면 보낼 주문에 주문과 같이 모이고, 보내면 사무실이 확인해 CM 번호를 발행합니다.', 'Tap the returned items like an order. Saved credits wait in Review & send with your orders; once sent, the office checks them and issues the CM.') + (O.why ? ' <span class="tag" style="background:#ffedd5;color:#9a3412">' + esc(O.why) + '</span>' : '') + '<div class="btns" style="justify-content:flex-start;margin:6px 0 0"><button type="button" class="b-ghost b-sm" id="eCrOther">🏷 ' + bt('타사 제품 · 가격으로', 'Other brands · by price') + ' · ✍️ ' + bt('직접', 'Manual') + '</button></div></div>';
  if (O.id) h += '<div class="alert a-amb" style="margin:0 0 8px">✏️ ' + esc(O.no) + ' 수정 중 ' + stTag(O.st) + '</div>';
  if (acc && acc.note) h += '<div class="alert a-blu" style="margin:0 0 8px">📝 ' + esc(acc.note) + '</div>';
  h += '<div id="eStoreNotes"></div>';
  if (needSm()) h += '<div class="fg" style="margin:0 0 8px"><label>세일즈맨 <span class="en">Salesman</span></label>' + sel('eSm', [['', '— 선택 — select —']].concat(S.sms.map(s => [s.code, s.code])), O.sm) + '</div>';
  h += '<div id="eBody"></div>';
  const isSentEdit = O.st && O.st !== 'draft';
  /* 아래 고정 바: 가게 이름 · 지금까지 금액(크게) · 종류별(A/P/W) 소계 · 저장
   *  세일즈맨은 저장만 — 하루 치를 주문 목록의 "보낼 주문"에서 한 번에 보냄 (수정 · 추가는 보내기 전까지 자유) */
  h += '<div class="sticky">' + (O.view === 'add' ? '<div id="eQuick"></div>' : '') +
    '<div class="tbar"><div class="tl"><b>' + esc(O.store || '가게를 고르세요') + '</b><small><span id="eN">' + t.n + '</span> lines · <span id="eQ">' + t.qty + '</span> pcs · <span id="eTm">' + typeMini(t.by) + '</span></small></div><div class="ta" id="eA"' + (isCr() ? ' style="color:#c2410c"' : '') + '>' + (isCr() ? '↩ −' : '') + money(t.amt) + '</div></div>' +
    '<div class="btns" style="margin-top:6px">' +
    '<button type="button" class="b-ghost ecancel" id="eCancel" title="' + esc(bt('주문 취소 — 담은 것 모두 지우기', 'Cancel order — clear everything')) + '">🗑</button>' +
    (!isSentEdit ? '<button class="b-ghost" id="eClose" style="flex:0 0 84px">' + bi('닫기', 'Close') + '</button><button class="b-green" id="eDraft" style="flex:1 1 auto;min-width:0">💾 ' + bi('저장', 'Save') + '</button>' :
      '<button class="b-ghost" id="eQuit">' + bi('닫기', 'Close') + '</button><button class="b-green" id="eSave">💾 ' + bi('저장', 'Save') + '</button>') + '</div></div>';
  $('page').innerHTML = h;
  eHeadH();
  if ($('eStoreX')) $('eStoreX').onclick = async () => { if (O.lines.length && !(await confirmBox('가게를 바꿀까요? 담은 아이템 ' + O.lines.length + '줄은 그대로 두고 가게만 바뀝니다 (할인은 새 가게 기본으로). / Change store?', '바꾸기'))) return; O.store = ''; O.acct = ''; INFO = null; saveWip(); paintEditor(); };
  if ($('eStoreI')) $('eStoreI').onclick = () => Store.storeSheet(O.acct, null, 'invh');
  if ($('eCrOther')) $('eCrOther').onclick = otherSheet;
  if ($('eStoreCr')) $('eStoreCr').onclick = () => { flushWip(); if (isStaff()) Router.go('credit', 'new:' + encodeURIComponent(O.acct)); else startCreditFor(O.acct); };   /* 세일즈맨: ↩ 크레딧도 주문처럼 (v0.8.187) · 담당자: 바로 발행하는 크레딧 화면 */   /* ↩ 같은 가게로 크레딧 — 작성 중 주문은 폰에 남아 돌아오면 이어서 */   // 📋 기록 — 인보이스 기록 탭부터 (담는 동안은 기록 줄이 숨어 이 버튼이 그 역할)
  if (O.acct) { loadInfo(O.acct); Notes.fillPinned('eStoreNotes', O.acct); }
  if ($('eStoreQ')) {
    const q = $('eStoreQ'), box = $('eStoreHits');
    q.oninput = () => {
      if (!q.value.trim()) { box.style.display = 'none'; return; }
      const mine = isStaff() ? S.accounts : S.accounts;
      const hits = searchAccounts(mine, q.value, 150);
      box.innerHTML = (hits.total ? '<div class="muted" style="padding:6px 11px;font-size:12px;border-bottom:1px solid var(--line)">' + hits.total + '곳 · ' + (hits.total > hits.length ? hits.length + '곳까지 표시 — 더 자세히 치세요' : '가게를 누르세요 · tap a store') + '</div>' : '') + hits.map(a => '<div data-ac="' + esc(a.acct) + '" style="display:flex;align-items:center;gap:8px"><div style="flex:1;min-width:0"><b>' + esc(accountLabel(a)) + '</b><small>' + esc(a.acct + ' · ' + [a.addr, a.city].filter(Boolean).join(', ') + (a.sm ? ' · ' + a.sm : '')) + '</small></div><button class="b-ghost b-sm" data-ai="' + esc(a.acct) + '">📋</button></div>').join('') || '<div class="muted">찾는 가게가 없습니다</div>';
      box.style.display = 'block'; if (!hits.length) box.innerHTML = '<div class="muted" style="padding:10px">맞는 가게가 없습니다 · no match</div>';
      box.insertAdjacentHTML('beforeend', '<div class="tap" id="eNewAcct" style="padding:11px;border-top:1px solid var(--line);color:#1d4ed8;font-weight:800">🆕 ' + bt('새 거래처 열기', 'Open a new account') + ' — ' + esc(q.value.trim().toUpperCase()) + '</div>');
      $('eNewAcct').onclick = () => { box.style.display = 'none'; NewAcct.newAcctForm(q.value.trim(), a => pickStore(a.acct)); };
      box.querySelectorAll('[data-ac]').forEach(el => el.onclick = () => pickStore(el.dataset.ac));
      box.querySelectorAll('[data-ai]').forEach(el => el.onclick = e => { e.stopPropagation(); Store.storeSheet(el.dataset.ai, c => pickStore(c, true)); });
    };
  }
  async function pickStore(code, seen) {
        const a = S.accounts.byCode[code]; if (!a) return; O.acct = a.acct; O.store = a.store;
        if (needSm()) O.sm = a.sm ? String(a.sm).toUpperCase() : '';   // 가게를 바꾸면 세일즈맨도 그 가게 기본값으로 (앞 가게 세일즈맨이 남지 않게 · v0.8.188)
        O.disc = acctDisc(a);   // 가게 기본 할인으로 시작
        O.smFor = '';
        saveWip(); paintEditor();
        if (await askSmFor(a)) return;   // 다른 세일즈맨 가게 — 누구 이름으로 할지 물은 뒤에는 가게 기록 창은 띄우지 않음
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
  if ($('eSm')) $('eSm').onchange = () => { O.sm = $('eSm').value; saveWip(); rememberSm(O.acct, O.sm); };
  document.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { if (O.view !== b.dataset.ev) { O.q = ''; dropFocus(); } O.view = b.dataset.ev; saveWip(); paintEditor(); });   // 탭을 바꾸면 검색어도 리셋 (2026-11-12 세일즈맨: 검색 뒤 다른 버튼을 눌러도 검색어가 남아 그것만 보이던 문제)
  if ($('eDraft')) $('eDraft').onclick = () => saveOrder('draft');
  if ($('eClose')) $('eClose').onclick = async () => { if (!(await confirmBox('저장하지 않고 닫을까요? 작성 중인 내용은 폰에 남아 있어 주문 목록에서 이어서 할 수 있습니다. / Close without saving?', '닫기 Close'))) return; saveWip(); Router.go('order'); };
  if ($('eSave')) $('eSave').onclick = () => saveOrder(O.st);
  if ($('eCancel')) $('eCancel').onclick = async () => {
    const editing = !!O.id;
    const msg = editing ? bt('이 주문의 변경을 취소할까요? 고친 내용은 버리고 저장된 주문으로 돌아갑니다.', 'Discard the changes to this order and go back to the saved order?') : bt('작성 중인 주문을 취소할까요? 담은 아이템 ' + totals().n + '줄이 모두 지워집니다.', 'Cancel this order? All ' + totals().n + ' lines will be cleared.');
    if (!(await confirmBox(msg, bt('🗑 주문 취소', '🗑 Cancel order')))) return;
    const id = O.id; O = null; clearWip(); toast(bt('주문을 취소했습니다', 'Order cancelled'), 'good'); if (id) goOrder(id); else Router.go('order');
  };
  if ($('eQuit')) $('eQuit').onclick = async () => { if (await confirmBox('저장하지 않고 닫을까요?', '닫기')) { const id = O.id; O = null; clearWip(); if (id) goOrder(id); else Router.go('order'); } };
  if (O.view === 'add') paintAdd(); else { if ($('eTop')) $('eTop').innerHTML = ''; if (O.view === 'memo') paintMemo(); else paintCart(); eHeadH(); paneTop(); setTimeout(eHeadH, 50); }
}
/** 위 고정 칸의 높이 — 검색 결과 위 여백 등에 CSS 변수로 */
/* 📐 주문 화면 세 칸 — 위(가게 · 탭 · 검색) 고정 · 아래(프리셋 · 합계 · 저장) 고정 · 가운데(#eBody)만 스크롤. 분류 · 검색을 눌러도 위아래는 그대로, 가운데만 바뀜 */
function eHeadH() {
  const e = $('eHead'); if (e) document.documentElement.style.setProperty('--eh', e.offsetHeight + 'px');
  const hd = document.querySelector('header'); if (hd) document.documentElement.style.setProperty('--ehdr', hd.offsetHeight + 'px');   // 주문 화면 위 고정 칸의 자리 (--hdr 은 다른 화면 머리띠 높이라 건드리지 않음 — 폰 주문 화면은 머리띠가 낮아짐, v0.8.231)
  const b = $('eBody'), st = $('page') && $('page').querySelector('.sticky'); if (!b || !O) return;
  const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const nav = document.body.classList.contains('kb') ? 0 : (parseFloat(getComputedStyle(document.body).getPropertyValue('--navh')) || 0);   // body 기준 (폰 주문 화면은 아래 메뉴를 숨겨 0)
  const h = vh - nav - (st ? st.offsetHeight : 0) - b.getBoundingClientRect().top - 6;
  if (h > 160) { b.classList.add('epane'); b.style.height = h + 'px'; } else { b.classList.remove('epane'); b.style.height = ''; }
}
const paneTop = () => { const b = $('eBody'); if (b) b.scrollTop = 0; };
if (typeof window !== 'undefined' && window.visualViewport) window.visualViewport.addEventListener('resize', () => setTimeout(eHeadH, 60));
if (typeof window !== 'undefined') window.addEventListener('resize', () => setTimeout(eHeadH, 60));
/** 🧩 세트 고르기 — SET ORDER 분류의 아이템(인서트 · 세트)을 찾아 설명 칸에 "코드 이름" 으로 넣음 */
function pickSet(key) {
  const C = catalog(); const all = C ? C.items.filter(it => /SET ORDER/.test(it.l1 || '') && !it.h) : [];
  const paint = q => {
    const Q = String(q || '').toUpperCase().trim(); const L = (Q ? all.filter(it => (it.c + ' ' + it.d + ' ' + it.l2 + ' ' + it.l3).toUpperCase().includes(Q)) : all).slice(0, 60);
    $('rsHits').innerHTML = L.length ? L.map(it => '<div data-rsc="' + esc(it.c) + '"><b>' + esc(it.c) + '</b> ' + esc(it.d) + ' <span class="muted">' + esc(cleanName(it.l2) + ' › ' + cleanName(it.l3)) + '</span></div>').join('') : '<div class="none">' + bt('없음', 'None') + '</div>';
    $('rsHits').querySelectorAll('[data-rsc]').forEach(el => el.onclick = () => { const it = C.byCode[el.dataset.rsc]; O.reqNote = O.reqNote || {}; const t = it.c + ' ' + it.d; O.reqNote[key] = (O.reqNote[key] ? O.reqNote[key].trim() + ' / ' : '') + t; saveWip(); closeModal(); paintMemo(); });
  };
  openModal('<h2>🧩 ' + bi('세트 · 인서트 고르기', 'Pick a set / insert') + ' — ' + esc(reqLabel(key)) + '</h2><div class="muted">' + bt('SET ORDER 분류의 세트 · 인서트 — 고르면 "어떤 것" 칸에 코드와 이름이 들어갑니다', 'Sets and inserts from SET ORDER — the code and name go into the note') + '</div><input id="rsQ" placeholder="' + esc(bt('코드 · 이름 · 분류 (예: ANKLET, 13", C2S13)', 'code · name · folder (e.g. ANKLET, 13", C2S13)')) + '" style="margin-top:8px" autocomplete="off"><div id="rsHits" class="hits" style="margin-top:6px"></div>');
  $('rsQ').oninput = () => paint($('rsQ').value); paint(''); setTimeout(() => $('rsQ') && $('rsQ').focus(), 50);
}
/* 📝 메모 탭 — 배송 · 특이사항 · 할인 요청 + 주문 요약 */
function paintMemo() {
  if (isCr()) return paintCrMemo();
  const t = totals(), acc = O.acct && S.accounts.byCode ? S.accounts.byCode[O.acct] : null;
  const rq = O.req || (O.req = {}), rn = O.reqNote || (O.reqNote = {});
  const reqCard = '<div class="card"><h2>🎁 ' + bi('인서트 · 디스플레이 요청', 'Insert · display request') + '</h2><div class="muted">' + bt('가게에 같이 보낼 인서트 · 디스플레이 — 출고 담당이 보고 인보이스에도 찍힙니다', 'Inserts and displays to ship with this order — warehouse sees it and it prints on the invoice') + '</div>' +
    '<div class="reqs">' + REQ_KINDS.map(k => '<div class="reqrow' + (rq[k[0]] > 0 ? ' on' : '') + (rq[k[0]] > 0 && reqNeedsNote(k[0]) ? ' wide' : '') + '"><b>' + reqLabel(k[0]) + '</b><span class="rqs"><button type="button" data-rqm="' + k[0] + '">−</button><span data-rqv="' + k[0] + '">' + (rq[k[0]] || 0) + '</span><button type="button" data-rqp="' + k[0] + '">＋</button></span>' +
      /* 🧩 인서트는 "어떤 것" 인지 — 세트 코드(SET ORDER 분류)를 골라 넣거나 글로 (앵클렛 · 팔찌 …) → 창고 · 인보이스 · Notes Display 에 같이 감 (v0.8.174) */
      (rq[k[0]] > 0 && reqNeedsNote(k[0]) ? '<div class="reqnote"><input data-rqn="' + k[0] + '" value="' + esc(rn[k[0]] || '') + '" placeholder="' + esc(bt('어떤 것? 예: 앵클렛 13" · 세트 코드', 'Which one? e.g. anklet 13" · set code')) + '"><button type="button" class="b-ghost b-sm" data-rqset="' + k[0] + '">🧩 ' + bt('세트 고르기', 'Pick set') + '</button></div>' : '') + '</div>').join('') + '</div>' +
    (reqCount(rq) ? '<div class="alert a-amb" style="margin-top:8px">🎁 ' + reqText(rq, false, rn) + '</div>' : '') + '</div>';
  /* 📝 메모가 맨 위 · 🎁 인서트 · 디스플레이는 그 아래 (v0.8.186 관리자: "메모가 제일 위에 · 디스플레이 선택을 밑으로") */
  $('eBody').innerHTML = '<div class="card"><h2>📝 ' + bi('메모', 'Memo') + '</h2><div class="muted">배송 방법 · 특이사항 · 할인 요청 등 사무실에 전할 말 <span class="en">Shipping, special requests, discount asks</span></div>' +
    '<textarea id="eMemo" rows="4" placeholder="예: UPS 로 보내 주세요 / 금요일 전 도착 / 디스플레이 같이" style="margin-top:8px">' + esc(O.memo || '') + '</textarea>' +
    '<div class="chips" style="margin-top:8px">' + MEMO_QUICK.map(x => '<button data-mq="' + esc(x[1]) + '">+ ' + esc(x[0]) + (x[0] !== x[1] ? ' <span class="en">' + esc(x[1]) + '</span>' : '') + '</button>').join('') + '</div>' + payChips() + '</div>' + reqCard +
    '<div class="card"><h2>' + bi('주문 요약', 'Summary') + '</h2><div class="pr"><div class="ct"><b>' + esc(O.store || '가게 미선택') + '</b><small>' + esc(acc ? acc.acct + ' · ' + [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : '') + '</small></div></div>' +
    '<div class="kpi"><div><b>' + t.n + '</b><span>줄 lines</span></div><div><b>' + t.qty + '</b><span>수량 pcs</span></div><div><b>' + money(t.amt) + '</b><span>금액 total</span></div><div' + (needSm() ? ' data-smk="1" style="cursor:pointer"' : '') + '><b id="eSmK"' + (needSm() && !O.sm ? ' class="warn"' : '') + '>' + esc(O.sm || (needSm() ? '선택 ✎' : '-')) + '</b><span>세일즈맨' + (needSm() && O.sm ? ' ✎' : '') + '</span></div></div>' + typeSummary(t.by) + '</div>';
  document.querySelectorAll('[data-smk]').forEach(el => el.onclick = async () => { if (await pickSm()) paintMemo(); });
  const ta = $('eMemo'); ta.oninput = () => { O.memo = ta.value; saveWip(); if ($('eMdot')) $('eMdot').textContent = O.memo || reqCount(O.req) ? ' •' : ''; };
  const bump = (k, d) => { O.req = O.req || {}; O.req[k] = Math.max(0, Math.min(99, (Number(O.req[k]) || 0) + d)); saveWip(); paintMemo(); if ($('eMdot')) $('eMdot').textContent = O.memo || reqCount(O.req) ? ' •' : ''; };
  document.querySelectorAll('[data-rqp]').forEach(b => b.onclick = () => bump(b.dataset.rqp, 1));
  document.querySelectorAll('[data-rqn]').forEach(i => i.oninput = () => { O.reqNote = O.reqNote || {}; O.reqNote[i.dataset.rqn] = i.value; saveWip(); });
  document.querySelectorAll('[data-rqset]').forEach(b => b.onclick = () => pickSet(b.dataset.rqset));
  document.querySelectorAll('[data-rqm]').forEach(b => b.onclick = () => bump(b.dataset.rqm, -1));
  document.querySelectorAll('[data-epay]').forEach(b => b.onclick = () => { O.pay = O.pay === b.dataset.epay ? '' : b.dataset.epay; saveWip(); document.querySelectorAll('[data-epay]').forEach(x => x.classList.toggle('on', x.dataset.epay === O.pay)); });
  document.querySelectorAll('[data-mq]').forEach(b => b.onclick = () => { const v = b.dataset.mq; if ((O.memo || '').includes(v)) return; O.memo = (O.memo ? O.memo.trim() + ' / ' : '') + v; ta.value = O.memo; saveWip(); });
}
function typeMini(by) { const g = Object.values(by || {}); return g.length ? g.map(x => x.t + ' ' + money(x.total)).join(' · ') : ''; }
function refreshTotals() {
  const t = totals();
  if ($('eN')) { $('eN').textContent = t.n; $('eQ').textContent = t.qty; $('eA').textContent = (isCr() ? '↩ −' : '') + money(t.amt); $('eCnt').textContent = t.n; if ($('eTm')) $('eTm').textContent = typeMini(t.by); }
}
/** 수량 바꾸기 — 0 이면 줄 삭제 */
function setQty(code, q) {
  q = Math.max(0, Math.floor(Number(q) || 0));
  const it = catalog().byCode[code], cur = IDX[code];
  if (!q) { if (cur) { if (O.view === 'cart') cur.q = 0; /* ✅ 주문 확인에서 0 은 줄을 지우지 않고 0 으로 둠 (다시 넣기 쉽게) — 저장 · 보내기 때 0 줄은 빠짐 */ else { O.lines = O.lines.filter(l => l !== cur); delete IDX[code]; } } }
  else if (cur) cur.q = q;
  else if (it) {
    const l = { c: it.c, d: it.d, q, p: O.pov && O.pov[it.c] != null ? O.pov[it.c] : it.p, lp: it.p, t: typeOfItem(S, it) };   /* 💲 같은 분류 가격 적용이 걸려 있으면 그 가격으로 담김 (v0.8.174) */
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
  if (O.view === 'add' && $('eRes') && LAST && LAST.length) paintResults();   // 🕘 지난 주문 · 지난번 가격이 줄 · 카드에 바로 보이게
  const el = $('eStoreBal'); if (el) el.innerHTML = (INFO.asOf ? '미수금 <b class="' + (INFO.bal > 0.005 ? 'warn' : 'ok') + '">' + money(INFO.bal) + '</b>' + (INFO.bk[3] + INFO.bk[4] > 0.005 ? ' · 60일+ <b class="warn">' + money(INFO.bk[3] + INFO.bk[4]) + '</b>' : '') : '') + (INFO.orders.length ? ' · 최근 주문 ' + esc(md(INFO.orders[0].d)) + ' ' + money(INFO.orders[0].amt) : '');
  /* 📋 한 줄 요약 — 최근 인보이스 3장(번호 · 날짜 · 금액) · 마지막 노트. 누르면 가게 창 인보이스 탭 */
  const eh = $('eStoreHist'); if (eh) {
    const inv = (INFO.invHist || []).slice(0, 3), n = INFO.invHistN || 0;
    let notes = []; try { notes = await Notes.loadNotes(acct); } catch (e) {}
    const last = notes && notes.length ? notes.slice().sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')))[0] : null;
    eh.innerHTML = (n ? '🧾 ' + n + bt('장', '') + ' · ' + inv.map(v => esc(v.no) + ' ' + esc(md(v.d)) + ' <b>' + money(v.total) + '</b>').join(' · ') : '🧾 ' + bt('인보이스 기록 없음', 'No invoices yet')) + (last ? '<br>📝 ' + esc(String(last.text || last.t || '').slice(0, 60)) : '');
    eh.className = 'tap'; eh.style.cursor = 'pointer'; eh.onclick = () => Store.storeSheet(acct, null, 'invh');
  }
  if (O.view === 'add') paintResults();   // 🕘 기록이 늦게 와도 목록 · 카드에 바로 (스크롤 그대로)
}
/* 빠른 수량 — 마지막에 만진 아이템에 1 · 2 · 3 · 6 · 12 · 24 · 36 · 0 */
let FOCUS = '';
const QUICK = [1, 2, 3, 6, 12, 0];
/* 프리셋(PRE): 수량 버튼을 누르면 켜진 채로 남아, 그 다음부터 카드를 누를 때마다 그 수량이 들어감 (처음 누르면 = 프리셋, 다시 누르면 + 프리셋). 같은 버튼을 다시 누르면 끔. 0 = 고른 아이템 지우기 */
let PRE = (() => { try { return Number(localStorage.getItem('theone.order.pre')) || 0; } catch (e) { return 0; } })();
function setPre(n) { PRE = n; try { localStorage.setItem('theone.order.pre', String(n)); } catch (e) {} document.querySelectorAll('[data-qk]').forEach(b => b.classList.toggle('on', Number(b.dataset.qk) === PRE && PRE > 0)); const w = $('qbarWho'); if (w && !FOCUS) w.textContent = PRE ? '프리셋 ' + PRE + '개 — 카드를 누르면 ' + PRE + '개씩' : '수량 버튼을 누르면 프리셋'; }
function tapQty(c) { const cur = IDX[c] ? IDX[c].q : 0; return PRE > 0 ? (cur ? cur + PRE : PRE) : cur + 1; }
/* 카드 · 줄을 눌러 담기 — 같은 아이템을 프리셋으로 두 번 · 세 번 누르면 tap 이 2 · 3 → 주황색 + ×2 로 표시 (실수로 여러 번 누른 것을 알아채게).
 * 수량을 직접 넣거나(숫자 창 · 빠른 수량 버튼) ＋/− 로 고치면 일부러 정한 것으로 보고 표시를 지움 */
/* 🎁 디스플레이 · 선물 · 소모품(설정 flexCats · 기본 'DISPLAYS, GIFT & SUPPLY' 1단계) 줄은 인보이스 종류를 따로 갖지 않고 주문의 나머지 줄을 따라감 —
 *   주얼리 주문이면 A 인보이스에, 그 외 제품 주문이면 P 인보이스에 같이 찍힘. 나머지 줄이 없으면 기본 종류(A). (v0.8.174) */
export function flexCats(S) { const v = S && S.settings && S.settings.flexCats; return (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(',') : ['DISPLAYS, GIFT & SUPPLY']).map(x => cleanName(String(x).trim()).toUpperCase()).filter(Boolean); }
export function isFlexItem(S, it) { return !!it && flexCats(S).includes(cleanName(it.l1 || '').toUpperCase()); }
export function flexTypes(lines) {
  const C = catalog(); if (!C) return lines;
  const flex = lines.filter(l => isFlexItem(S, C.byCode[l.c])); if (!flex.length) return lines;
  const cnt = {}; lines.forEach(l => { if (!isFlexItem(S, C.byCode[l.c])) cnt[l.t || DT()] = (cnt[l.t || DT()] || 0) + 1; });
  const best = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || (a === DT() ? -1 : b === DT() ? 1 : a.localeCompare(b)))[0] || DT();
  flex.forEach(l => { l.t = best; });
  return lines;
}
/* 🏷 타사 제품 리턴 — 우리 코드가 없는 물건은 가격대로 (v0.8.187 관리자: "타 회사 제품은 가격으로 정리 — 1.99 · 2.49 · 2.99 … 9.49 · 9.99 · … 39.99" · "특이사항은 크레딧을 수동으로")
 *   가격 단추를 누를 때마다 그 가격 줄 +1 (코드 OB-1.99 · 종류 OB) · ✍️ 직접 = 설명 · 단가 · 수량
 *   v0.8.198: 가격 단추 = 물건에 붙은 소매가 → 크레딧은 우리 판매가 (9.99 → 5.00) · 이 줄들도 할인 백(없으면 가게 기본 할인)을 뺌 ($5 · 10% → $4.50) */
const OB = 'OB';
export const OB_PRICES = (() => { const a = []; for (let v = 1.99; v < 10; v += 0.5) a.push(Math.round(v * 100) / 100); for (let v = 10.99; v < 40; v += 1) a.push(Math.round(v * 100) / 100); return a; })();
function obAdd(c, d, p, q, rp) { let l = IDX[c]; if (l) l.q += q; else { l = { c, d, q, p, lp: p, t: OB }; if (rp != null) l.rp = rp; O.lines.push(l); IDX[c] = l; } saveWip(); refreshTotals(); }
/* 💎 바디 주얼리는 소매가 ÷ 2 공식을 안 따름 (2026-11-12 관리자: "실제로는 $2 인데 판매가는 4.99 인 제품이 대부분") → 우리 판매가를 바로 누름
 *   단추 = 상품 목록의 BODY JEWELRY 판매가들 ($2.00 · $3.00 · $3.50 · $4.00 · $5.00 …) · 소매가가 적힌 상품이 있으면 옆에 (소매 $4.99) */
function bodyPrices() {
  const C = catalog(), m = {}; if (C) Object.values(C.byCode).forEach(it => { if (cleanName(it.l1 || '').toUpperCase() !== 'BODY JEWELRY') return; const p = Number(it.p) || 0; if (!(p > 0 && p < 20)) return; const k = p.toFixed(2), r = Number(it.s) || 0; m[k] = m[k] || {}; if (r > 0) m[k][r.toFixed(2)] = (m[k][r.toFixed(2)] || 0) + 1; });
  const ks = Object.keys(m).length ? Object.keys(m) : ['2.00', '3.00', '3.50', '4.00', '5.00'];
  return ks.map(Number).sort((a, b) => a - b).map(p => { const r = Object.entries(m[p.toFixed(2)] || {}).sort((a, b) => b[1] - a[1])[0]; return { p, r: r ? Number(r[0]) : (p === 2 ? 4.99 : null) }; });
}
function otherSheet() {
  const BODY = bodyPrices();
  const paint = () => {
    const bb = $('obBody');
    if (bb) { bb.innerHTML = BODY.map(x => { const c = 'OBB-' + x.p.toFixed(2), n = IDX[c] ? IDX[c].q : 0; return '<button type="button" class="' + (n ? 'on' : '') + '" data-obb="' + x.p.toFixed(2) + '">$' + x.p.toFixed(2) + (n ? ' <b>×' + n + '</b>' : '') + (x.r ? '<small class="obr">' + bt('소매', 'retail') + ' $' + x.r.toFixed(2) + '</small>' : '') + '</button>'; }).join('');
      bb.querySelectorAll('[data-obb]').forEach(b => b.onclick = () => { const v = Number(b.dataset.obb); obAdd('OBB-' + v.toFixed(2), 'BODY JEWELRY (OTHER BRAND)', v, 1); paint(); }); }
    const box = $('obGrid'); if (!box) return;
    box.innerHTML = OB_PRICES.map(v => { const c = 'OB-' + v.toFixed(2), n = IDX[c] ? IDX[c].q : 0; return '<button type="button" class="' + (n ? 'on' : '') + '" data-obp="' + v.toFixed(2) + '">$' + v.toFixed(2) + (n ? ' <b>×' + n + '</b>' : '') + '<small>→ ' + money(obWhole(v)) + '</small></button>'; }).join('');
    box.querySelectorAll('[data-obp]').forEach(b => b.onclick = () => { const v = Number(b.dataset.obp); obAdd('OB-' + v.toFixed(2), 'OTHER BRAND (RETAIL $' + v.toFixed(2) + ')', obWhole(v), 1, v); paint(); });
    /* 🧾 담은 것 — 맨 위에 줄마다 − 수량 + · 🗑 (v0.8.231 관리자: "누를 때마다 수량은 올라가는데 잘못 찍었을 때 수정이 어려움") */
    const sel = O.lines.filter(l => l.t === OB && l.q > 0);
    const lab = l => /^OB-/.test(l.c) ? bt('소매', 'Retail') + ' $' + Number(l.rp != null ? l.rp : l.c.slice(3)).toFixed(2) + ' → ' + money(l.p) : /^OBB-/.test(l.c) ? '💎 ' + bt('바디', 'Body') + ' ' + money(l.p) : '✍️ ' + esc(l.d) + ' · ' + money(l.p);
    $('obSel').innerHTML = sel.length ? sel.map(l => '<div class="obrow"><span class="obl">' + lab(l) + '</span><span class="qty"><button type="button" data-obm="' + esc(l.c) + '">−</button><input type="number" inputmode="numeric" min="0" data-obq="' + esc(l.c) + '" value="' + l.q + '"><button type="button" data-obpl="' + esc(l.c) + '">+</button></span><b class="oba">−' + money(R2(l.q * l.p)) + '</b><button type="button" class="obx" data-obx="' + esc(l.c) + '" title="' + esc(bt('지우기', 'Remove')) + '">🗑</button></div>').join('')
      : '<div class="muted" style="font-size:12.5px">' + bt('아직 없음 — 아래 가격을 누르면 여기에 담깁니다', 'Nothing yet — tap a price below') + '</div>';
    const setQ = (c, q) => { const l = IDX[c]; if (!l) return; l.q = Math.max(0, Math.floor(Number(q) || 0)); if (!l.q) { O.lines = O.lines.filter(x => x !== l); delete IDX[c]; } saveWip(); refreshTotals(); paint(); };
    $('obSel').querySelectorAll('[data-obm]').forEach(b => b.onclick = () => setQ(b.dataset.obm, (IDX[b.dataset.obm] || {}).q - 1));
    $('obSel').querySelectorAll('[data-obpl]').forEach(b => b.onclick = () => setQ(b.dataset.obpl, (IDX[b.dataset.obpl] || {}).q + 1));
    $('obSel').querySelectorAll('[data-obx]').forEach(b => b.onclick = () => setQ(b.dataset.obx, 0));
    $('obSel').querySelectorAll('[data-obq]').forEach(i => { i.onfocus = () => i.select(); i.onchange = () => setQ(i.dataset.obq, i.value); });
    const man = O.lines.filter(l => l.t === OB && /^MAN-/.test(l.c));
    $('obMan').innerHTML = man.length ? man.map(l => '<div>✍️ ' + esc(l.d) + ' · ' + l.q + ' × ' + money(l.p) + ' = <b>' + money(R2(l.q * l.p)) + '</b></div>').join('') : '';
    const ob = O.lines.filter(l => l.t === OB && l.q > 0); $('obTot').textContent = ob.length ? ob.reduce((a, l) => a + l.q, 0) + bt('개 · ', ' pcs · ') + '−' + money(R2(ob.reduce((a, l) => a + l.q * l.p, 0))) : '';
  };
  openModal('<h2>🏷 ' + bi('타사 제품 · 가격으로', 'Other brands · by price') + '</h2><div class="muted">' + bt('우리 코드가 없는 물건은 붙어 있는 소매가를 누르세요 — 누를 때마다 1개. 크레딧은 우리 판매가(→ 옆 금액, 예: $9.99 → $5.00)에서 할인 백(없으면 가게 기본 할인)을 뺀 금액입니다. 잘못 누르면 위 🧾 담은 것에서 − · 수량 · 🗑 로 바로 고치세요.', 'Tap the retail price on the item — one per tap. The credit is our selling price (→, e.g. $9.99 → $5.00) minus the discount back (or the store discount). Tapped wrong? Fix it right away in 🧾 Added above with − · qty · 🗑.') + '</div>' +
    '<div class="obsel"><b>🧾 ' + bt('담은 것 — 잘못 눌렀으면 − 또는 🗑', 'Added — fix with − or 🗑') + '</b><div id="obSel"></div></div>' +
    '<div class="obgrid" id="obGrid"></div>' +
    '<div class="card" style="margin:10px 0 0;padding:10px"><b>💎 ' + bt('바디 주얼리 — 우리 판매가를 바로 누르세요', 'Body jewelry — tap our selling price') + '</b><div class="muted" style="font-size:12px">' + bt('바디 주얼리는 소매가 ÷ 2 가 아닙니다 (예: 소매 $4.99 → 판매가 $2.00)', 'Body jewelry is not retail ÷ 2 (e.g. retail $4.99 → our price $2.00)') + '</div><div class="obgrid" id="obBody" style="max-height:none"></div></div>' +
    '<div class="card" style="margin:10px 0 0;padding:10px"><b>✍️ ' + bt('직접 입력 — 특이사항', 'Manual — special cases') + '</b><div class="two" style="margin-top:6px"><input id="obD" placeholder="' + esc(bt('설명 (예: 가발 리턴 · 가격 조정)', 'Description')) + '"><div style="display:flex;gap:6px"><input id="obP" type="number" step="0.01" inputmode="decimal" placeholder="' + esc(bt('판매가 $', 'Our price $')) + '" style="flex:1 1 0;min-width:0"><input id="obQ" type="number" inputmode="numeric" value="1" style="flex:0 0 64px;min-width:0"><button type="button" class="b-blue b-sm" id="obAdd" style="flex:0 0 auto;width:auto">＋</button></div></div><div id="obMan" class="muted" style="font-size:12.5px;margin-top:6px"></div></div>' +
    '<div class="btns"><span class="muted" id="obTot" style="align-self:center;flex:1"></span><button class="b-blue" id="obDone">' + bt('닫기', 'Done') + '</button></div>');
  $('obAdd').onclick = () => { const d = $('obD').value.trim(), p = R2($('obP').value), q = Math.max(1, Math.floor(Number($('obQ').value) || 1)); if (!d) return toast(bt('설명을 적으세요', 'Enter a description'), 'bad'); if (!(p > 0)) return toast(bt('단가를 적으세요', 'Enter the unit price'), 'bad'); obAdd('MAN-' + Date.now().toString(36).toUpperCase(), d, p, q); $('obD').value = ''; $('obP').value = ''; $('obQ').value = '1'; paint(); };
  $('obDone').onclick = () => { closeModal(); paintEditor(); };
  paint();
}
/* ↩ 크레딧 사유 · 메모 · 🏷 할인 백 (v0.8.187 — 크레딧 화면의 사유 · 할인 백을 주문 화면으로) */
const CR_WHY = [['대미지', 'Damaged'], ['오래된 물건 교환', 'Old stock exchange'], ['잘못 보낸 물건', 'Wrong item shipped'], ['가격 조정', 'Price adjustment'], ['기타', 'Other']];
const CR_DB = [0, 5, 10, 15, 20, 25, 30];
/** 🏷 할인 백 — 고르면 모든 종류에 그 % (기본 = 가게 기본 할인). 줄을 새로 담아도 저장 · 확인 때 다시 맞춤 */
function crDisc() {
  if (!isCr()) return;
  O.lines.forEach(obFix);   // 🏷 옛 OB 줄(소매가로 담김) → 판매가 (v0.8.198)
  if (O.dback == null) { O.disc = Object.assign({}, O.disc || {}); delete O.disc[OB]; const a = obDisc(O, DT()); if (a) O.disc[OB] = a; return; }   // 🏷 OB 줄은 가게 기본 할인(첫 종류)
  const ty = {}; O.lines.forEach(l => { ty[l.t || DT()] = 1; }); ty[DT()] = 1; Object.keys(O.disc || {}).forEach(k => { ty[k] = 1; }); O.disc = {}; Object.keys(ty).forEach(k => { O.disc[k] = O.dback; });   // 할인 백은 OB 줄까지 모든 줄 (v0.8.198)
}
function paintCrMemo() {
  crDisc();
  const t = totals(), acc = O.acct && S.accounts.byCode ? S.accounts.byCode[O.acct] : null, def = accDiscOf(), defT = Object.keys(def).length ? Object.keys(def).map(k => k + ' ' + def[k] + '%').join(' · ') : '0%';
  $('eBody').innerHTML = '<div class="card"><h2>↩ ' + bi('사유', 'Reason') + ' <span class="warn" style="font-size:12px">' + bt('필수', 'required') + '</span></h2><div class="chips" style="margin:6px 0 0">' + CR_WHY.map(w => '<button class="' + (O.why === w[0] ? 'on' : '') + '" data-ecw="' + esc(w[0]) + '">' + bi(w[0], w[1]) + '</button>').join('') + '</div>' +
    '<textarea id="eMemo" rows="3" placeholder="' + esc(bt('메모 (선택) — 어떤 물건 · 왜', 'Note (optional) — what · why')) + '" style="margin-top:10px">' + esc(O.memo || '') + '</textarea></div>' +
    '<div class="card"><h2>🏷 ' + bi('할인 백', 'Discount back') + '</h2><div class="muted">' + bt('그 물건이 할인해서 나갔으면 그 % — 모든 줄이 할인 뺀 가격으로 크레딧됩니다. 기본은 가게 기본 할인.', 'If the goods went out discounted, pick that % — every line is credited at the discounted price. Default is the store discount.') + '</div><div class="chips" style="margin:6px 0 0">' +
      '<button class="' + (O.dback == null ? 'on' : '') + '" data-ecd="">' + bt('가게 기본', 'Store default') + ' (' + esc(defT) + ')</button>' + CR_DB.map(v => '<button class="' + (O.dback === v ? 'on' : '') + '" data-ecd="' + v + '">' + v + '%</button>').join('') + '</div></div>' +
    '<div class="card"><h2>' + bi('크레딧 요약', 'Summary') + '</h2><div class="pr"><div class="ct"><b>' + esc(O.store || bt('가게 미선택', 'No store')) + '</b><small>' + esc(acc ? acc.acct + ' · ' + [acc.addr, acc.city, acc.state].filter(Boolean).join(', ') : '') + '</small></div></div>' +
    '<div class="kpi"><div><b>' + t.n + '</b><span>' + bt('줄', 'lines') + '</span></div><div><b>' + t.qty + '</b><span>' + bt('수량', 'pcs') + '</span></div><div><b style="color:#c2410c">−' + money(t.amt) + '</b><span>' + bt('크레딧', 'credit') + '</span></div><div><b>' + esc(O.why || '—') + '</b><span>' + bt('사유', 'reason') + '</span></div></div>' + typeSummary(t.by) +
    '<div class="hint">' + bt('저장하면 보낼 주문에 주문과 같이 모이고, 보내면 사무실이 확인해 CM 번호를 발행합니다 (그때 가게 잔액에서 빠짐).', 'Saved credits wait in Review & send; once sent, the office checks and issues the CM (the store balance drops then).') + '</div></div>';
  const dot = () => { if ($('eMdot')) $('eMdot').textContent = O.memo || O.why ? ' •' : ''; };
  document.querySelectorAll('[data-ecw]').forEach(b => b.onclick = () => { O.why = b.dataset.ecw; saveWip(); paintCrMemo(); dot(); const ban = $('eCrBan'); if (ban) { const tg = ban.querySelector('.tag'); if (tg) tg.textContent = O.why; else ban.insertAdjacentHTML('beforeend', ' <span class="tag" style="background:#ffedd5;color:#9a3412">' + esc(O.why) + '</span>'); } });
  document.querySelectorAll('[data-ecd]').forEach(b => b.onclick = () => { O.dback = b.dataset.ecd === '' ? null : Number(b.dataset.ecd); if (O.dback == null) O.disc = accDiscOf(); crDisc(); saveWip(); paintCrMemo(); refreshTotals(); });
  const ta = $('eMemo'); ta.oninput = () => { O.memo = ta.value; saveWip(); dot(); };
}
/* 📝 메모 빠른 단추 — 단추는 한글 · 영어로 보이고, 메모 칸에는 영어로 찍힘 (창고 · 사무실 · 인보이스 모두 영어로 읽으므로, v0.8.174) */
/** 💳 결제 방법 — COD · ACH (2026-11-12 오피스: "세일즈맨이 오더 때 메모에서 COD 인지 ACH 인지 넣는 칸 · 인보이스에도 ACH 라고 나오게 → 담당자가 보고 ACH 입력 → 회계 담당 셋업") · v0.8.189 */
export const PAYS = [['COD', '💵 COD'], ['ACH', '🏦 ACH']];
export const payTag = o => o && o.pay ? ' <span class="tag ' + (o.pay === 'ACH' ? 't-b' : 't-g') + '">' + (o.pay === 'ACH' ? '🏦' : '💵') + ' ' + esc(o.pay) + '</span>' : '';
function payChips() { return '<div style="margin-top:12px"><b>💳 ' + bi('결제 방법', 'Payment') + '</b> <span class="muted" style="font-size:12px">' + bt('인보이스에도 찍힘', 'prints on the invoice') + '</span><div class="chips" style="margin-top:6px">' + PAYS.map(p => '<button type="button" class="' + (O.pay === p[0] ? 'on' : '') + '" data-epay="' + p[0] + '">' + p[1] + '</button>').join('') + '</div></div>'; }
const MEMO_QUICK = [['UPS 배송', 'Ship by UPS'], ['픽업 (가게에서 가져감)', 'Customer pickup'], ['세일즈맨 직접 배달', 'Salesman delivers'], ['급함 — 먼저 처리', 'URGENT - process first'], ['디스플레이 같이 보내기', 'Send display together'], ['Shipping With Jewelry', 'Shipping With Jewelry'], ['No Cross', 'No Cross']];   // 영어 그대로 (v0.8.186 관리자)
function tapAdd(c) { const had = IDX[c] ? IDX[c].q : 0, n = setQty(c, tapQty(c)), l = IDX[c]; if (l) { if (PRE > 0 && had) l.tap = (l.tap || 1) + 1; else delete l.tap; saveWip(); } return n; }
function sure(c) { const l = IDX[c]; if (l && l.tap) { delete l.tap; saveWip(); } }
const multi = l => !!(l && l.tap >= 2);
/* 여러 번 눌린 횟수별 색 — 2번 주황 · 3번 빨강 · 4번 보라 · 5번 이상 검정 (카드 · 줄 · 담은 목록 태그 모두 같은 색) */
const tapCls = l => multi(l) ? ' multi m' + Math.min(l.tap, 5) : '';
function setTapCls(el, l) { el.classList.remove('multi', 'm2', 'm3', 'm4', 'm5'); if (multi(l)) el.classList.add('multi', 'm' + Math.min(l.tap, 5)); }
const tapTag = l => multi(l) ? ' <span class="tag tapx m' + Math.min(l.tap, 5) + '" title="' + esc(bt('같은 아이템을 ' + l.tap + '번 눌렀습니다 — 수량을 확인하세요', 'Tapped ' + l.tap + ' times — check the quantity')) + '">×' + l.tap + ' ' + bt('눌림', 'taps') + '</span>' : '';
function quickBar() { return '<div class="qbar" id="qbar"><span id="qbarWho">' + (FOCUS ? esc(FOCUS) : PRE ? '프리셋 ' + PRE + '개 — 카드를 누르면 ' + PRE + '개씩' : '수량 버튼을 누르면 프리셋') + '</span>' + QUICK.map(n => '<button data-qk="' + n + '" class="' + (n && n === PRE ? 'on' : '') + '">' + (n ? n : '✕') + '</button>').join('') + '</div>'; }
function setFocus(c) { FOCUS = c; const w = $('qbarWho'); if (w) w.textContent = c + (IDX[c] ? ' · ' + IDX[c].q + '개' : ''); }
/** 폴더 · 검색 · 탭을 바꾸면 "마지막에 누른 아이템" 을 잊음 — 다른 폴더에서 프리셋을 누르면 앞 폴더의 마지막 아이템 수량이 바뀌던 문제 (2026-11-12 세일즈맨 · v0.8.189) */
function dropFocus() { FOCUS = ''; const w = $('qbarWho'); if (w) w.textContent = PRE ? '프리셋 ' + PRE + '개 — 카드를 누르면 ' + PRE + '개씩' : '수량 버튼을 누르면 프리셋'; }
function bindQuick(root) {
  root.querySelectorAll('[data-qk]').forEach(b => b.onclick = () => {
    const k = Number(b.dataset.qk);
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    if (k > 0) { setPre(k === PRE ? 0 : k); if (!FOCUS) return; }
    else if (!FOCUS) return setPre(0);
    const n = setQty(FOCUS, k); sure(FOCUS); setFocus(FOCUS); refreshCard(FOCUS);
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
  const crumbs = '<div class="chips crumbs">' + (O.path.length ? '<button class="up" data-cp="' + (O.path.length - 1) + '">‹ ' + bi('상위', 'Up') + '</button>' : '') + '<button class="' + (O.path.length ? '' : 'on') + '" data-cp="0">' + bi('전체', 'All') + '</button>' + O.path.map((p, i) => '<button class="' + (i === O.path.length - 1 ? 'on' : '') + '" data-cp="' + (i + 1) + '">' + esc(p) + '</button>').join('') + '</div>';
  const newN = O.path.length ? 0 : newItems([], catStart(S), 30).length;   /* 🆕 새로 나온 — 1단계(전체)에서만 */
  const newTile = newN ? '<button class="newt' + (O.nw ? ' on' : '') + '" data-new="1"><b>🆕 새로 나온 <span class="en">New</span></b><span>' + bt('최근 30일에 등록', 'added in the last 30 days') + ' · ' + newN + '</span></button>' : '';
  const popTile = '';   /* ✨ 자주 나가는 묶음은 v0.8.174 에서 뺌 (모든 단계에 보여 번거로움) */
  const kindCls = n => { const r = prefixRank(n); return r <= 1 ? 'k-set' : r === 2 ? 'k-jew' : r === 3 ? 'k-oth' : r === 3.5 ? 'k-disp' : 'k-last'; };   /* 1단계 종류별 타일 색 (안쪽 단계는 1단계 색을 따라감) */
  const kids = node.kids.length || popTile || newTile ? '<div class="cats">' + newTile + popTile + node.kids.map(k => '<button class="' + (O.path.length ? kindCls(O.path[0]) : kindCls(k.name)) + '" data-ck="' + esc(k.name) + '"><b>' + esc(k.name) + '</b><span>' + k.n + '</span></button>').join('') + '</div>' : '';
  /* 검색 + 분류 경로는 카드 밖 sticky — 아래로 아무리 내려가도 맨 위에 붙어 있어 바로 상위로 돌아감 */
  $('eTop').innerHTML = '<div class="ordtop"><div style="display:flex;gap:6px"><input id="eQ1" placeholder="코드 · 이름 · 바코드 / Code · Name · Barcode" autocomplete="off" autocapitalize="characters" enterkeyhint="done" value="' + esc(O.q) + '" style="flex:1">' +
    '<button type="button" class="b-ghost ib" id="eQX" title="' + esc(bt('검색어 지우기', 'Clear search')) + '" style="' + (O.q ? '' : 'display:none') + '">✕</button><button class="b-ghost ib" id="eVM" title="보기 바꾸기">' + (VM === 'grid' ? '☰' : '▦') + '</button><button class="b-ghost ib" id="eShow" title="손님 보기">🖼</button></div>' + crumbs + '</div>';
  $('eBody').innerHTML = '<div class="card ecard">' + kids + '<div id="eRes"></div></div>';
  const sb = $('eQuick'); if (sb) { sb.innerHTML = quickBar(); bindQuick(sb); }
  eHeadH(); paneTop(); setTimeout(eHeadH, 50);
  const q = $('eQ1');
  const run = () => { if (!O || !$('eQ1')) return; if (O.q !== q.value) dropFocus(); O.q = q.value; PAGE = 60; paintResults(); paneTop(); };
  const cats = $('eBody').querySelector('.cats'); const showCats = () => { if (cats) cats.style.display = q.value.trim() ? 'none' : ''; const x = $('eQX'); if (x) x.style.display = q.value ? '' : 'none'; };   // 검색어가 있으면 분류 타일은 숨김 — 결과가 바로 위에 · ✕ 는 검색어가 있을 때만
  $('eQX').onclick = () => { q.value = ''; O.q = ''; PAGE = 60; dropFocus(); showCats(); paintResults(); paneTop(); q.focus(); };   /* ✕ 검색어 지우기 (v0.8.174) */
  showCats(); q.addEventListener('input', showCats);
  q.oninput = debounce(run, 160);
  q.onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const it = exactItem(q.value);
    if (it && it.h && !isStaff()) { toast('🙈 지금은 주문할 수 없는 아이템입니다 (단종 · 재입고 지연) — 담당자에게 문의 · Not available', 'bad'); return; }
    if (it) { if (it.h) toast('🙈 숨김 아이템을 담았습니다 (담당자 전용)'); const n = tapAdd(it.c); toast(it.c + ' → ' + n + '개', 'good'); q.value = ''; O.q = ''; paintResults(); }
    else { run(); toast('정확히 맞는 코드가 없습니다 — 아래에서 고르세요', 'bad'); }
  };
  /* 전체 · 분류 경로 · 분류 타일을 누르면 검색어도 지움 — 검색어가 남아 있으면 "전체" 를 눌러도 검색 결과만 보여 분류로 못 가던 문제 (v0.8.174) */
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { O.path = O.path.slice(0, Number(b.dataset.cp)); O.q = ''; O.pop = false; O.nw = false; O.all = false; PAGE = 60; dropFocus(); paintAdd(); });
  document.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { O.path = O.path.concat([b.dataset.ck]); O.q = ''; O.pop = false; O.nw = false; O.all = false; PAGE = 60; dropFocus(); paintAdd(); });
  const nt = document.querySelector('[data-new]'); if (nt) nt.onclick = () => { O.nw = !O.nw; O.pop = false; O.q = ''; PAGE = 60; dropFocus(); paintAdd(); };
  $('eVM').onclick = () => { VM = VM === 'grid' ? 'list' : 'grid'; try { localStorage.setItem(VM_KEY, VM); } catch (e) {} paintAdd(); };
  $('eShow').onclick = () => showMode(LAST, 0);
  paintResults();
  if (!('ontouchstart' in window)) q.focus();
}
/* ☰ 목록 보기 — 표 (사진 · 아이템 · 가격 · 📦 · 수량). 줄의 이름을 누르면 카드처럼 담김, 사진은 🔍 팝업 */
const LIST_TH = () => '<thead><tr><th style="width:40px"></th><th>' + bt('아이템', 'Item') + '</th><th style="width:60px">' + bt('가격', 'Price') + '</th><th style="width:110px">' + bt('수량', 'Qty') + '</th></tr></thead>';
function itemRow(it) {
  const cur = IDX[it.c] ? IDX[it.c].q : 0;
  const t = typeOfItem(S, it), dc = Number((O.disc || {})[t]) || 0, hist = Store.histText(INFO, it.c), lp = Store.lastPrice(INFO, it.c);
  return '<tr class="irow' + (cur ? ' v' : '') + tapCls(IDX[it.c]) + (FOCUS === it.c ? ' foc' : '') + '" data-row="' + esc(it.c) + '" data-frow="' + esc(it.c) + '">' +
    '<td class="pho">' + (it.ph ? '<img src="' + esc(thumb(it.ph)) + '" loading="lazy" alt="" class="ith" data-big="' + esc(it.c) + '" data-fb="">' : '<div class="ith"></div>') + '</td>' +
    '<td class="ct wrap"><b>' + esc(it.c) + (it.k ? ' <span class="tag t-a" data-kit="' + esc(it.c) + '">🧩 ' + it.k.length + '종</span>' : '') + '</b><div class="desc">' + esc(it.k ? (it.kn || it.d) : it.d) + '</div>' + (it.k ? '<small class="sub0">' + esc(kitLine(it)) + '</small>' : '') +
    '<small class="meta"><span class="stk" data-stk="' + esc(it.c) + '">📦 …</span>' + (it.s ? ' · SRP ' + money(it.s) : '') + (lp != null && Math.abs(lp - it.p) > 0.001 ? ' · ' + bt('지난번', 'last') + ' ' + money(lp) : '') + (dc ? ' · ' + dc + '% → ' + money(it.p * (1 - dc / 100)) : '') + '</small>' +
    (hist ? '<small class="hist">🕘 ' + esc(hist) + '</small>' : '') + '</td>' +
    '<td class="pc"><span data-pp="' + esc(it.c) + '">' + priceTxt(it, true) + '</span></td>' +
    '<td class="qc">' + qtyBox(it.c, cur) + '</td></tr>';
}
/** 📦 실재고 — 보이는 아이템만 읽어 와서 줄 · 카드에 채움 (0 이면 빨강 "없음", 적으면 주황). 못 읽어도 화면은 그대로 */
function fillStock(root, codes) {
  if (!codes.length) return;
  stockOf(codes).then(m => { root.querySelectorAll('[data-stk]').forEach(el => { const c = el.dataset.stk; if (!(c in m)) return; const n = m[c] || 0; const card = el.classList.contains('gstk'); el.textContent = card ? (n > 0 ? '📦' + (n > 999 ? '999+' : n) : '✕') : '📦 ' + (n > 0 ? n.toLocaleString() : bt('없음', 'out')); el.classList.toggle('s0', n <= 0); el.classList.toggle('slow', n > 0 && n < 12); }); })
    .catch(() => root.querySelectorAll('[data-stk]').forEach(el => { el.textContent = ''; }));
}
/** 🔍 사진 팝업 — 사진에 커서를 올리면 돋보기, 누르면 전체 화면이 아니라 작은 팝업 (바깥 · ✕ 누르면 닫힘) */
export function photoPop(c) {
  const it = catalog().byCode[c]; if (!it || !it.ph) return;
  let p = $('ppop'); if (!p) { p = document.createElement('div'); p.id = 'ppop'; document.body.appendChild(p); }
  const big = window.innerWidth >= 900 ? 1600 : 900;
  p.innerHTML = '<div class="ppbox"><div class="ppz"><img src="' + esc(thumb(it.ph, big)) + '" alt="" draggable="false"><div class="ppzb"><button type="button" data-pz="-" title="축소 · Zoom out">−</button><button type="button" class="ppzs" data-pz="0" title="원래 크기 · Reset">100%</button><button type="button" data-pz="+" title="확대 · Zoom in">＋</button></div></div><div class="ppt"><b>' + esc(it.c) + '</b> ' + esc(it.k ? (it.kn || it.d) : it.d) + ' <span class="muted">' + money(it.p) + (it.s ? ' · SRP ' + money(it.s) : '') + '</span></div><button type="button" class="mclose" id="ppX">✕</button></div>';
  p.classList.remove('zoomed'); p.classList.add('on'); p.onclick = e => { if (e.target === p || e.target.id === 'ppX') p.classList.remove('on'); };
  photoZoom(p);
}
/** 🔍 사진 확대 · 축소 · 이동 — 휠(컴퓨터) · 두 손가락(폰) · 두 번 누르기 · ＋ － 단추 · 확대한 뒤 끌어서 이동. 1배 ~ 8배 */
function photoZoom(p) {
  const box = p.querySelector('.ppz'), img = box.querySelector('img'), lab = box.querySelector('.ppzs'); const z = { s: 1, x: 0, y: 0 }; const PT = new Map(); let pinch = null, moved = false;
  const paint = () => { img.style.transform = z.s === 1 ? '' : 'translate(' + z.x + 'px,' + z.y + 'px) scale(' + z.s + ')'; p.classList.toggle('zoomed', z.s > 1); lab.textContent = Math.round(z.s * 100) + '%'; };
  const clamp = () => { const r = box.getBoundingClientRect(), w = img.offsetWidth * z.s, h = img.offsetHeight * z.s; const mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2); z.x = Math.min(mx, Math.max(-mx, z.x)); z.y = Math.min(my, Math.max(-my, z.y)); };
  /* 가리킨 점(cx, cy — 화면 좌표)이 제자리에 있도록 그 점을 중심으로 배율 바꿈 */
  const setS = (s, cx, cy) => { s = Math.min(8, Math.max(1, s)); const r = box.getBoundingClientRect(); const px = cx == null ? 0 : cx - (r.left + r.width / 2), py = cy == null ? 0 : cy - (r.top + r.height / 2); const k = s / z.s; z.x = px - (px - z.x) * k; z.y = py - (py - z.y) * k; z.s = s; if (s === 1) { z.x = 0; z.y = 0; } clamp(); paint(); };
  box.addEventListener('wheel', e => { e.preventDefault(); setS(z.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY); }, { passive: false });
  box.querySelectorAll('[data-pz]').forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.pz; setS(k === '+' ? z.s * 1.5 : k === '-' ? z.s / 1.5 : 1); });
  box.addEventListener('dblclick', e => { e.preventDefault(); setS(z.s > 1 ? 1 : 2.5, e.clientX, e.clientY); });
  box.addEventListener('pointerdown', e => { if (e.target.closest('[data-pz]')) return; PT.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; try { box.setPointerCapture(e.pointerId); } catch (x) {} if (PT.size === 2) { const [a, b] = [...PT.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: z.s }; } else if (z.s > 1) p.classList.add('drag'); });
  box.addEventListener('pointermove', e => { const q = PT.get(e.pointerId); if (!q) return; const dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY; if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    if (PT.size === 2 && pinch) { const [a, b] = [...PT.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); setS(pinch.s * d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); z.x += dx / 2; z.y += dy / 2; clamp(); paint(); }
    else if (z.s > 1) { z.x += dx; z.y += dy; clamp(); paint(); } });
  const up = e => { PT.delete(e.pointerId); if (PT.size < 2) pinch = null; if (!PT.size) p.classList.remove('drag'); };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('click', e => { e.stopPropagation(); });   // 사진을 눌러도 닫히지 않음 — 닫기는 ✕ 또는 바깥
  paint();
}
/** 사진 카드 — 누르면 1개 담김, 숫자를 누르면 수량 입력, − 로 빼기 */
/** 세트 사진이 없을 때 — 구성품 사진 4장 모자이크 (세트라는 표시와 함께) */
function kitMosaic(it) {
  const C = catalog(); const ph = it.k.map(x => C.byCode[x[0]]).filter(x => x && x.ph).slice(0, 4);
  if (!ph.length) return '<span>🧩 ' + esc(it.c.substring(0, 8)) + '</span>';
  return '<div class="mosaic m' + ph.length + '">' + ph.map(x => '<img src="' + esc(thumb(x.ph, 160)) + '" loading="lazy" alt="" data-fb="-">').join('') + '</div>';
}
/** 세트 구성 한 줄 — "14KCHN01×6 · 14KCHN02×6 · …" */
function kitLine(it) { return it.k.slice(0, 3).map(x => x[0] + '×' + x[1]).join(' · ') + (it.k.length > 3 ? ' 외 ' + (it.k.length - 3) + '종' : ''); }
function itemCard(it) {
  const cur = IDX[it.c] ? IDX[it.c].q : 0;
  const name = it.k ? (it.kn || it.d) : it.d;
  const ln = IDX[it.c], hl = Store.histLast(INFO, it.c);   // 🕘 이 가게에 마지막으로 나간 날·수량
  return '<div class="gcard' + (cur ? ' on' : '') + tapCls(ln) + (it.k ? ' kit' : '') + '" data-gc="' + esc(it.c) + '" data-ph="' + esc(it.ph || '') + '">' +
    '<div class="gimg">' + (it.ph ? '<img src="' + esc(thumb(it.ph, 300)) + '" loading="lazy" alt="" data-fb="' + esc(it.c) + '"><span class="gz" data-gz="' + esc(it.c) + '" title="' + esc(bt('사진 크게', 'Zoom photo')) + '">🔍</span>' : it.k ? kitMosaic(it) : '<span class="gcode">' + esc(it.c) + '</span>') + (hl ? '<span class="ghist" title="' + esc(Store.histText(INFO, it.c, 8)) + '">🕘 ' + esc(hl) + '</span>' : '') + '<span class="gstk" data-stk="' + esc(it.c) + '"></span></div>' +
    (it.k ? '<span class="gkit" data-kit="' + esc(it.c) + '">🧩 세트 ' + it.k.length + '종 · 구성 보기</span>' : '') +
    '<span class="gq" data-gq="' + esc(it.c) + '">' + (cur || '') + '</span>' + (multi(ln) ? '<span class="gtap" data-gt="' + esc(it.c) + '">×' + ln.tap + '</span>' : '') + (cur ? '<button class="gm" data-gm="' + esc(it.c) + '">−</button>' : '') +
    '<div class="gt"><b>' + esc(it.c) + '</b><small>' + esc(name) + '</small>' + (it.k ? '<em>' + esc(kitLine(it)) + '</em>' : '') + '<span class="gp" data-pp="' + esc(it.c) + '">' + priceTxt(it, true) + '</span></div></div>';
}
/** 담은 줄의 가격 (바꿨으면 그 가격 · 목록가 줄긋기) — ✎ 누르면 가격 · 수량 */
function priceTxt(it, plain) { const l = IDX[it.c], ov = !l && O && O.pov && O.pov[it.c] != null ? O.pov[it.c] : null, p = l ? l.p : ov != null ? ov : it.p, chg = Math.abs(p - it.p) > 0.0001; return (chg ? '<s>' + money(it.p) + '</s> ' : '') + '<b' + (chg ? ' class="chgp"' : '') + '>' + money(p) + '</b>' + (plain ? '' : '<i class="pen"> ✎</i>'); }
function refreshRowPrice(c) { const it = catalog().byCode[c]; if (!it) return; document.querySelectorAll('[data-pe="' + CSS.escape(c) + '"]').forEach(el => { el.innerHTML = priceTxt(it); }); document.querySelectorAll('[data-pp="' + CSS.escape(c) + '"]').forEach(el => { el.innerHTML = priceTxt(it, true); }); }
const qtyBox = (c, v) => '<div class="qty"><button data-dq="' + esc(c) + '" data-d="-1">−</button><input type="number" inputmode="numeric" min="0" data-qi="' + esc(c) + '" value="' + (v || '') + '" placeholder="0"><button data-dq="' + esc(c) + '" data-d="1">＋</button></div>';
function paintResults() {
  if (!O || !$('eRes')) return;
  const pop = false, nw = O.nw && !O.q;
  /* 분류를 끝까지(하위가 없을 때까지) 누르기 전에는 아이템을 펼치지 않음 — 검색 · ✨ · "모두 보기" 는 예외 */
  const T = treeFor(S); let nd = T; O.path.forEach(p => { nd = (nd && nd.map[p]) || null; });
  const branch = nd && nd.kids.length > 0;
  if (!pop && !nw && !O.q && branch && !O.all) {
    $('eRes').innerHTML = '<div class="muted" style="margin:8px 0;text-align:center">' + (O.path.length ? '분류를 하나 더 고르거나 <button class="b-ghost b-sm" id="eAll">이 분류 전체 ' + nd.n.toLocaleString() + '개 보기</button>' : '위에서 분류를 고르거나 코드 · 이름으로 검색하세요 <span class="en">Pick a category or search</span>') + '</div>';
    if ($('eAll')) $('eAll').onclick = () => { O.all = true; paintResults(); };
    LAST = [];
    return;
  }
  const all = nw ? newItems([], catStart(S), 30) : searchItems(O.q, O.path, 5000, catStart(S));
  LAST = all;
  const res = all.slice(0, PAGE);
  const head = '<div class="muted" style="margin:6px 0">' + (nw ? '🆕 ' + bt('최근 30일에 등록된 아이템', 'Items added in the last 30 days') + ' · ' + all.length + bt('개 (새 순)', ' (newest first)') : pop ? '✨ ' + (all.nStore ? '이 가게가 최근에 산 ' + all.nStore + '개 먼저, 그 다음 ' : '') + '많이 나가는 순 · ' + all.length + '개' : O.q || O.path.length ? all.length.toLocaleString() + '개 (코드 순)' : '전체 ' + catalog().items.length.toLocaleString() + '개 — 카테고리를 고르거나 검색하세요 <span class="en">Pick a category or search</span>') + '</div>';
  $('eRes').innerHTML = head + (res.length ? (VM === 'grid' ? '<div class="grid">' + res.map(itemCard).join('') + '</div>' : '<div class="dtw"><table class="dt olist">' + LIST_TH() + '<tbody>' + res.map(itemRow).join('') + '</tbody></table></div>') +
    (all.length > res.length ? '<button class="b-ghost" id="eMore" style="margin-top:8px">더 보기 (' + (all.length - res.length).toLocaleString() + '개 남음)</button>' : '') : '<div class="none">' + bt('찾는 아이템이 없습니다', 'No items found') + (isStaff() && O.q ? '<br><a href="#/items/' + encodeURIComponent(O.q.trim()) + '">🏷 ＋ 새 아이템으로 등록 · Register as new item</a>' : '') + '</div>');
  const root = $('eRes');
  bindQty(root);
  fillStock(root, res.map(x => x.c));
  if ($('eMore')) $('eMore').onclick = () => { PAGE += 60; paintResults(); };
  root.querySelectorAll('[data-big]').forEach(el => el.onclick = e => { e.stopPropagation(); photoPop(el.dataset.big); });
  root.querySelectorAll('[data-gz]').forEach(el => { el.onpointerdown = e => e.stopPropagation(); el.onclick = e => { e.stopPropagation(); e.preventDefault(); photoPop(el.dataset.gz); }; });
  /* 목록 보기에서 줄(이름 · 사진)을 누르면 카드처럼 담김 (프리셋 적용) */
  /* 목록 줄을 길게 누르면 수량 · 가격 창 (카드의 길게 누르기와 같음) */
  root.querySelectorAll('[data-frow] .ct, [data-frow] .pc').forEach(el => { let t = null; el.addEventListener('pointerdown', () => { clearTimeout(t); t = setTimeout(() => { el.dataset.long = '1'; qtyPad(el.closest('[data-frow]').dataset.frow); }, 550); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t))); });
  root.querySelectorAll('[data-frow] .pc').forEach(el => el.onclick = e => { e.stopPropagation(); if (el.dataset.long) { delete el.dataset.long; return; } qtyPad(el.closest('[data-frow]').dataset.frow, true); });   /* 💲 가격 칸을 누르면 바로 가격 수정 (SBM GO 의 Cust Price 칸처럼 · v0.8.174) */
  root.querySelectorAll('[data-frow] .ct').forEach(el => el.onclick = () => { if (el.dataset.long) { delete el.dataset.long; return; } const r = el.closest('[data-frow]'), c = r.dataset.frow; root.querySelectorAll('.foc').forEach(x => x.classList.remove('foc')); r.classList.add('foc'); const n = tapAdd(c); const inp = root.querySelector('[data-qi="' + CSS.escape(c) + '"]'); if (inp) inp.value = n || ''; markRow(root, c, n); setFocus(c); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} });
  root.querySelectorAll('[data-kit]').forEach(el => el.onclick = e => { e.stopPropagation(); kitSheet(catalog().byCode[el.dataset.kit]); });
  root.querySelectorAll('[data-gm]').forEach(b => b.onclick = e => { e.stopPropagation(); const c = b.dataset.gm; setQty(c, (IDX[c] ? IDX[c].q : 0) - 1); sure(c); refreshCard(c); });
  root.querySelectorAll('[data-pe]').forEach(b => b.onclick = e => { e.stopPropagation(); e.preventDefault(); qtyPad(b.dataset.pe, true); });
  root.querySelectorAll('[data-gq]').forEach(b => b.onclick = e => { if (!b.textContent) return; e.stopPropagation(); qtyPad(b.dataset.gq); });
  /* ×N 배지는 보기만 (탭은 카드로) — 수량 입력은 숫자 표시 · 길게 누르기 */
  root.querySelectorAll('[data-gc]').forEach(el => {
    let t = null, long = false;
    el.addEventListener('pointerdown', () => { long = false; t = setTimeout(() => { long = true; qtyPad(el.dataset.gc); }, 550); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
    el.onclick = () => { if (long) return; const c = el.dataset.gc; tapAdd(c); refreshCard(c); setFocus(c); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
    el.oncontextmenu = e => e.preventDefault();
  });
}
function refreshCard(c) {
  const el = document.querySelector('[data-gc="' + CSS.escape(c) + '"]'); if (!el) return;
  const n = IDX[c] ? IDX[c].q : 0;
  el.classList.toggle('on', !!n); setTapCls(el, IDX[c]);
  el.querySelector('[data-gq]').textContent = n || '';
  let x = el.querySelector('.gtap'); if (multi(IDX[c])) { if (!x) { x = document.createElement('span'); x.className = 'gtap'; x.dataset.gt = c; el.appendChild(x); } x.textContent = '×' + IDX[c].tap; } else if (x) x.remove();
  let m = el.querySelector('[data-gm]');
  if (n && !m) { m = document.createElement('button'); m.className = 'gm'; m.dataset.gm = c; m.textContent = '−'; m.onclick = e => { e.stopPropagation(); setQty(c, (IDX[c] ? IDX[c].q : 0) - 1); sure(c); refreshCard(c); }; el.appendChild(m); }
  if (!n && m) m.remove();
}
/** 가게 기본 세일즈맨을 고칠 수 있는 사람 — 규칙의 accounts 쓰기(opsJob)와 같음: 관리자 · 오너 · 담당자(아이템 전담 제외) */
const canSaveSm = () => { const r = S.me && S.me.role; if (r === 'admin' || r === 'owner') return true; if (r !== 'manager') return false; return ['office', 'acct', 'pickinv', 'invoice', 'whmgr', 'pick'].includes((S.me && S.me.job) || 'office'); };
/** 👤 기본 세일즈맨이 없는 가게에 고른 세일즈맨을 가게 기본값으로 저장 — 다음 주문부터 다시 묻지 않음 (2026-11-12 관리자: "가게 선택하면 또 세일즈맨 넣으라고 계속 나옴" · v0.8.188).
 *  sm 한 칸만 update · 이미 기본 세일즈맨이 있는 가게는 바꾸지 않음 (그 주문만 다른 세일즈맨) */
async function rememberSm(acct, sm) {
  if (!acct || !sm || !canSaveSm()) return;
  const a = S.accounts && S.accounts.byCode ? S.accounts.byCode[acct] : null; if (!a || String(a.sm || '').trim()) return;
  try { await S.DB.update('accounts', acct, { sm, smAt: new Date().toISOString(), smBy: S.user.email }); patchAccountCache(S, acct, { sm }); toast('👤 ' + (a.store || acct) + bt(' 기본 세일즈맨 → ', ' salesman → ') + sm, 'good'); } catch (e) {}
}
/** 👤 세일즈맨 고르기 창 (담당자) — 가게에 기본 세일즈맨이 없을 때 저장하면 뜸 · 요약의 세일즈맨 칸을 눌러도. 고른 코드 또는 null (v0.8.172) */
function pickSm() {
  return new Promise(res => {
    const L = (S.sms || []).filter(x => x.active !== false);
    if (!L.length) { toast(bt('등록된 세일즈맨이 없습니다 — 관리 → 사용자', 'No salesmen registered — Admin → Users'), 'bad'); return res(null); }
    let done = false; const fin = v => { if (done) return; done = true; res(v); };
    const acc = O.acct && S.accounts && S.accounts.byCode ? S.accounts.byCode[O.acct] : null, noDef = !!(acc && !String(acc.sm || '').trim() && canSaveSm());
    openModal('<h2>👤 ' + bi('세일즈맨을 고르세요', 'Pick a salesman') + '</h2><div class="muted">' + bt('이 주문의 세일즈맨 — 커미션 · 수금 · 리포트가 이 사람 앞으로 갑니다. 가게에 기본 세일즈맨이 없어 직접 고릅니다.', 'The salesman for this order — commission, payments and reports go to this person. This store has no default salesman.') + '</div>' +
      '<div id="smPick" style="margin-top:10px">' + L.map(x => '<button type="button" class="pick' + (O.sm === x.code ? ' on' : '') + '" data-smp="' + esc(x.code) + '" style="width:100%;text-align:left;background:#fff"><span class="ck">✓</span><span class="pm"><b>' + esc(x.code) + '</b><small>' + esc(x.name || '') + '</small></span></button>').join('') + '</div>' +
      (noDef ? '<label class="ckl" style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:14px"><input type="checkbox" id="smKeep" checked style="width:20px;height:20px"> ' + bi('이 가게의 기본 세일즈맨으로 저장 — 다음부터 묻지 않음', 'Save as this store\'s salesman — won\'t ask again') + '</label>' : '') +
      '<div class="btns"><button type="button" class="b-ghost" id="smPickX">' + bi('닫기', 'Close') + '</button></div>', { onClose: () => fin(null) });
    document.querySelectorAll('[data-smp]').forEach(b => b.onclick = () => { O.sm = b.dataset.smp; saveWip(); if ($('eSm')) $('eSm').value = O.sm; if ($('eSmK')) { $('eSmK').textContent = O.sm; $('eSmK').classList.remove('warn'); } if (!$('smKeep') || $('smKeep').checked) rememberSm(O.acct, O.sm); fin(O.sm); closeModal(); });
    $('smPickX').onclick = closeModal;
  });
}
/** 수량 직접 입력 */
function qtyPad(c, focusPrice) {
  const it = catalog().byCode[c]; if (!it) return;
  const cur = IDX[c] ? IDX[c].q : 0;
  /* 📂 같은 분류(Group › Level 1 › 2 › 3) · 같은 목록가 아이템 — 이전 프로그램처럼 한 번 바꾸면 같은 폴더의 같은 가격 아이템이 같이 바뀜 (v0.8.174) */
  const sib = catalog().items.filter(x => x.c !== it.c && !x.virt && !x.h && x.g === it.g && x.l1 === it.l1 && x.l2 === it.l2 && x.l3 === it.l3 && Math.abs(x.p - it.p) < 0.0001);
  const sibIn = sib.filter(x => IDX[x.c]).length, folder = it.l3 || it.l2 || it.l1 || it.g || '';
  const curP = IDX[c] ? IDX[c].p : (O.pov && O.pov[c] != null ? O.pov[c] : it.p);
  openModal('<h2>' + esc(it.c) + '</h2><div class="muted">' + esc(it.d) + ' · ' + money(it.p) + '</div>' +
    '<div class="qty" style="justify-content:center;margin:14px 0"><button id="qpM" style="width:56px;height:56px">−</button><input id="qpV" type="number" inputmode="numeric" min="0" value="' + cur + '" style="width:110px;font-size:26px"><button id="qpP" style="width:56px;height:56px">＋</button></div>' +
    '<div class="chips" style="justify-content:center">' + [1, 2, 3, 6, 12, 24].map(n => '<button data-qp="' + n + '" style="min-width:48px;font-size:15px">' + n + '</button>').join('') + '</div><div class="muted" style="text-align:center">그 밖의 수량은 위 칸에 직접 입력 · or type a quantity</div>' +
    '<div class="fg" style="margin-top:10px"><label>💲 ' + bi('가격', 'Price') + ' <span class="muted">(' + bt('목록', 'list') + ' ' + money(it.p) + (INFO && Store.lastPrice(INFO, c) != null ? ' · ' + bt('지난번', 'last') + ' ' + money(Store.lastPrice(INFO, c)) : '') + ')</span></label><div style="display:flex;gap:6px"><input id="qpPr" type="number" step="0.01" inputmode="decimal" value="' + curP + '" style="font-size:20px;font-weight:800"><button class="b-ghost b-sm" id="qpPrR" style="flex:0 0 auto;width:auto">' + bt('목록가로', 'Reset') + '</button></div></div>' +
    (sib.length ? '<label class="pick on" id="qpSib" style="margin-top:8px"><span class="ck">✓</span><span class="pm"><b>📂 ' + bt('같은 분류 · 같은 목록가 ', 'Same category · same list price: ') + sib.length + bt('개도 이 가격으로', ' more items get this price') + '</b><small>' + esc(folder) + ' · ' + bt('목록가', 'list') + ' ' + money(it.p) + ' — ' + bt('담긴 ', 'in this order ') + sibIn + bt('개는 바로, 나머지는 담을 때 이 가격', ' change now, the rest when added') + '</small></span></label>' : '') +
    '<div class="btns"><button class="b-ghost" id="qpX">닫기</button><button class="b-blue" id="qpOk">확인</button></div>');
  let sibOn = sib.length > 0; if ($('qpSib')) $('qpSib').onclick = () => { sibOn = !sibOn; $('qpSib').classList.toggle('on', sibOn); };
  const v = $('qpV'), pr = $('qpPr'); setTimeout(() => { const f = focusPrice ? pr : v; f.focus(); f.select(); }, 50);
  $('qpPrR').onclick = () => { pr.value = it.p; };
  $('qpM').onclick = () => { v.value = Math.max(0, (Number(v.value) || 0) - 1); };
  $('qpP').onclick = () => { v.value = (Number(v.value) || 0) + 1; };
  document.querySelectorAll('[data-qp]').forEach(b => b.onclick = () => { v.value = b.dataset.qp; });
  /* 가격만 고치러 왔는데 아직 안 담은 아이템이면 1개(프리셋)로 담고 가격 적용 */
  const ok = () => { let q = Math.max(0, Math.floor(Number(v.value) || 0)); const np = R2(pr.value); const pchg = pr.value !== '' && Math.abs(np - curP) > 0.0001; if (!q && pchg) q = tapQty(c) || 1; setQty(c, q); sure(c); if (IDX[c] && pr.value !== '') { IDX[c].p = np; }
    /* 📂 같은 분류 · 같은 목록가 아이템에도: 담긴 줄은 바로, 안 담긴 것은 담을 때 적용 (목록가로 되돌리면 적용도 지움) */
    let nSib = 0; if (pchg && sibOn && sib.length) { O.pov = O.pov || {}; const back = Math.abs(np - it.p) < 0.0001; sib.forEach(x => { if (IDX[x.c]) IDX[x.c].p = np; if (back) delete O.pov[x.c]; else O.pov[x.c] = np; nSib++; }); }
    if (pr.value !== '') { saveWip(); refreshTotals(); }
    closeModal(); if (O.view === 'add') { refreshCard(c); refreshRowPrice(c); sib.forEach(x => refreshRowPrice(x.c)); } else paintCart();
    if (nSib) toast('💲 ' + it.c + bt(' 외 ', ' and ') + nSib + bt('개 → ', ' more → ') + money(np), 'good'); };
  $('qpOk').onclick = ok; v.onkeydown = e => { if (e.key === 'Enter') ok(); }; pr.onkeydown = e => { if (e.key === 'Enter') ok(); };
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
  let v = document.getElementById('viewer'); if (!v) { v = document.createElement('div'); v.id = 'viewer'; document.body.appendChild(v); } setTimeout(guardSync, 0);
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
    const n = setQty(c, d > 0 ? cur + 1 : cur - 1); sure(c);   // ＋ · − 는 항상 1개씩 (프리셋은 카드 탭에만) — 일부러 고친 것이라 ×N 표시 지움
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    if (inp) inp.value = n || (O.view === 'cart' ? '0' : ''); markRow(root, c, n); setFocus(c);
  });
  root.querySelectorAll('[data-qi]').forEach(inp => {
    inp.onchange = () => { const n = setQty(inp.dataset.qi, inp.value); sure(inp.dataset.qi); inp.value = n || (O.view === 'cart' ? '0' : ''); markRow(root, inp.dataset.qi, n); };
    inp.onfocus = () => { inp.select(); setFocus(inp.dataset.qi); root.querySelectorAll('.foc').forEach(x => x.classList.remove('foc')); const r = inp.closest('[data-row]'); if (r) r.classList.add('foc'); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); const q = $('eQ1'); if (q) q.focus(); } };
  });
}
function markRow(root, c, n) {
  const row = root.querySelector('[data-row="' + CSS.escape(c) + '"]'); if (!row) return;
  row.classList.toggle('zero', O.view === 'cart' && !n);
  row.classList.toggle('v', !!n); setTapCls(row, IDX[c]);
  if (!multi(IDX[c])) { const t = row.querySelector('.tapx'); if (t) t.remove(); }
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
    (reqCount(O.req) ? '<div class="alert a-amb" style="margin-top:10px">🎁 ' + reqText(O.req, false, O.reqNote) + '</div>' : '') +
    (O.memo ? '<div class="alert a-blu" style="margin-top:10px">📝 ' + esc(O.memo) + '</div>' : '') + '</div>';
  const paintTypes = () => { if (O && $('eTypes')) $('eTypes').innerHTML = typeSummary(totals().by); };
  const paint = () => {
    const f = $('eF') ? $('eF').value.trim().toUpperCase() : '';
    const rows = O.lines.slice().reverse().filter(l => !f || (l.c + ' ' + l.d).toUpperCase().includes(f));
    $('eCart').innerHTML = rows.length ? rows.map(l => {
      const chg = l.lp != null && Math.abs(l.lp - l.p) > 0.0001;
      return '<div class="pr irow ' + (l.q ? 'v' : 'zero') + tapCls(l) + '" data-row="' + esc(l.c) + '"><div class="ct"><b>' + esc(l.c) + ' <span class="tag t-g">' + esc(l.t || DT()) + '</span>' + tapTag(l) + (l.kit ? ' <span class="tag t-a" data-kitl="' + esc(l.c) + '">🧩 ' + l.kit.length + '종</span>' : '') + '</b><small>' + esc(l.d) + '</small>' +
        '<small>$ <input class="sm pin' + (chg ? ' chg' : '') + '" type="number" step="0.01" inputmode="decimal" data-pi="' + esc(l.c) + '" value="' + l.p + '">' + (chg ? ' <span class="tag t-c">목록 ' + money(l.lp) + '</span>' : '') + ' · <b class="lamt">' + money(l.q * l.p) + '</b></small>' +
        (Store.histText(INFO, l.c) ? '<small class="hist">🕘 ' + esc(Store.histText(INFO, l.c)) + '</small>' : '') + '</div>' +
        qtyBox(l.c, l.q) + '<button type="button" class="b-ghost b-sm rmx" data-rm="' + esc(l.c) + '" title="' + esc(bt('이 줄 빼기', 'Remove line')) + '">✕</button></div>';
    }).join('') : '<div class="none">아직 담은 아이템이 없습니다 — 🔍 아이템 담기</div>';
    bindQty($('eCart'));
    $('eCart').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const c = b.dataset.rm, cur = IDX[c]; if (cur) { O.lines = O.lines.filter(l => l !== cur); delete IDX[c]; } saveWip(); refreshTotals(); paint(); paintTypes(); });
    $('eCart').querySelectorAll('[data-kitl]').forEach(el => el.onclick = () => { const it = catalog().byCode[el.dataset.kitl]; if (it && it.k) kitSheet(it); else { const l = IDX[el.dataset.kitl]; openModal('<h2>🧩 ' + esc(l.c) + '</h2>' + l.kit.map(x => '<div>' + esc(x.c) + ' × ' + x.q + '</div>').join('') + '<div class="btns"><button class="b-ghost" id="kitClose">닫기</button></div>'); $('kitClose').onclick = closeModal; } });
    $('eCart').querySelectorAll('[data-pi]').forEach(inp => inp.onchange = () => { const l = IDX[inp.dataset.pi]; if (!l) return; l.p = R2(inp.value); inp.value = l.p; saveWip(); refreshTotals(); setTimeout(() => { if (O && $('eCart')) { paintTypes(); paint(); } }, 0); });
    $('eCart').querySelectorAll('[data-qi],[data-dq]').forEach(el => el.addEventListener(el.dataset.qi ? 'change' : 'click', () => setTimeout(paintTypes, 0)));
  };
  paint(); paintTypes();
  if ($('eF')) $('eF').oninput = debounce(paint, 150);
  document.querySelectorAll('[data-disc]').forEach(inp => inp.onchange = () => { const v = Math.max(0, Math.min(100, Number(inp.value) || 0)); if (v) O.disc[inp.dataset.disc] = v; else delete O.disc[inp.dataset.disc]; saveWip(); refreshTotals(); setTimeout(() => { if (O && O.view === 'cart' && $('eCart')) paintCart(); }, 0); });
  if ($('eMemo')) $('eMemo').oninput = () => { O.memo = $('eMemo').value; saveWip(); };
}

/** 주문 문서 만들기 (목록용 요약 포함) */
/** ↩ 크레딧 요청 문서 — 금액 · 수량을 마이너스로 (주문 합계 · 하루 합계에서 빠지게) */
function crSign(d) { if (d && d.kind === 'credit') { d.amt = -Math.abs(d.amt || 0); d.qty = -Math.abs(d.qty || 0); if (d.list) d.list = -Math.abs(d.list); } return d; }
export function orderDoc(base, lines, disc, extra) {
  const by = splitByType(lines, disc, 'q'), pd = priceDiff(lines, 'q');
  let qty = 0, amt = 0; Object.values(by).forEach(g => { qty += g.qty; amt += g.total; });
  const ad = acctDisc(S.accounts.byCode ? S.accounts.byCode[base.acct] : null);
  const keys = {}; Object.keys(ad).concat(Object.keys(disc || {})).forEach(k => { keys[k] = 1; });
  const discChg = Object.keys(keys).some(k => Number((disc || {})[k] || 0) !== Number(ad[k] || 0));
  const ty = {}; lines.forEach(l => { const t = l.t || DT(); ty[t] = (ty[t] || 0) + 1; });   // 종류별 줄 수 (목록에 🏷 W 3 처럼)
  return Object.assign({}, base, { n: lines.length, qty, amt: R2(amt), list: pd.list, pdiff: pd.diff, pdn: pd.n, disc: disc || {}, discChg, ty }, extra || {});
}
function putOut(o, lines) {
  const box = readOut(); box[o.id] = { o, lines, at: Date.now() };
  if (!writeOut(box)) throw new Error('폰 저장 공간이 부족합니다');
}

async function saveOrder(st) {
  if (!O.store) return toast('가게를 고르세요', 'bad');
  if (!O.sm && needSm() && O.acct) {   /* 가게의 세일즈맨을 서버에서 다시 읽음 — 폰에 보관한 거래처 목록이 옛것이면 비어 있을 수 있어서 (v0.8.172) */
    try { const a = await S.DB.get('accounts', O.acct); const smv = a && a.sm ? String(a.sm).toUpperCase() : ''; if (smv) { O.sm = smv; saveWip(); if ($('eSm')) $('eSm').value = smv; toast('👤 ' + bt('가게의 세일즈맨', 'Store salesman') + ' ' + smv, 'good'); } } catch (e) {}
  }
  if (!O.sm) { if (!needSm()) return toast('세일즈맨을 고르세요', 'bad'); if (!(await pickSm())) return; }   /* 담당자: 가게에 기본 세일즈맨이 없으면 여기서 바로 고름 (v0.8.172 — 위 고정 머리 아래 선택 칸은 내리면 안 보여서) */
  if (!O.lines.some(l => l.q > 0)) return toast('아이템을 담으세요', 'bad');
  if (isCr()) {   /* ↩ 크레딧: 사유 필수 · 세일즈맨은 한 장 한도(settings.creditMax, 기본 10000) 안에서 */
    crDisc();
    if (!O.why) { O.view = 'memo'; paintEditor(); return toast(bt('크레딧 사유를 고르세요', 'Pick the credit reason'), 'bad'); }
    const cmx = S.settings && S.settings.creditMax != null && isFinite(Number(S.settings.creditMax)) ? Number(S.settings.creditMax) : 10000;
    if (!isStaff() && totals().amt > cmx) return toast(bt('크레딧 한 장 한도', 'Credit memo limit') + ' ' + money(cmx) + ' — ' + bt('넘는 금액은 사무실에 요청하세요', 'ask the office for larger credits'), 'bad');
  }
  const t = totals();
  if (st === 'sent' && O.st === 'draft' && !(await confirmBox(O.store + ' — ' + O.lines.length + '줄 · ' + money(t.amt) + ' 주문을 보낼까요? / Send this order?', '보내기 Send'))) return;
  const mt = O.lines.filter(multi);
  if (st !== 'sent' && !(await confirmBox((mt.length ? '⚠️ ' + bt('여러 번 눌린 아이템', 'Tapped several times') + ' ' + mt.length + bt('개 (색 표시 · ×N)', ' (colored · ×N)') + ': ' + mt.slice(0, 5).map(l => l.c + ' ' + l.q + bt('개', 'pcs') + ' ×' + l.tap).join(', ') + ' — ' + bt('수량을 확인하세요', 'check the quantities') + '\n\n' : '') + O.store + ' — ' + O.lines.length + '줄 · ' + t.qty + '개 · ' + money(t.amt) + '\n저장할까요? (보내기는 주문 목록의 "보낼 주문"에서) / Save this order?', '저장 Save'))) return;
  const now = new Date().toISOString();
  if (!O.id) { O.no = newNo(); O.id = O.no; }
  const base = { id: O.id, no: O.no, d: O.d || today(), ym: ym(O.d || today()), sm: O.sm, acct: O.acct || '', store: O.store, st, memo: O.memo || '', req: reqClean(O.req), reqNote: reqNoteClean(O.reqNote), updatedAt: now,
    createdBy: O.createdBy || S.user.email, createdAt: O.createdAt || now, catVer: catalog().ver || '' };
  if (isCr()) Object.assign(base, { kind: 'credit', why: O.why, dback: O.dback == null ? null : O.dback });
  if (O.smFor && O.smFor !== O.sm) base.smFor = O.smFor; else if (O.id) base.smFor = '';
  if (O.pay) base.pay = O.pay; else if (O.id) base.pay = '';
  if (st === 'sent') base.sentAt = O.sentAt || now;
  const lines = flexTypes(O.lines.filter(l => l.q > 0).map(l => { const x = { c: l.c, d: l.d, q: l.q, p: l.p, lp: l.lp != null ? l.lp : l.p, t: l.t || DT() }; if (l.pq != null) x.pq = l.pq; if (l.note) x.note = l.note; if (l.kit) x.kit = l.kit; return x; }));
  /* 매니저가 이미 처리 중인 주문 — 상태 · 픽킹 기록은 그대로 두고 바로 저장 */
  if (isStaff() && O.st !== 'draft' && O.st !== 'sent') {
    busy(true);
    try {
      const old = await S.DB.get('orders', O.id); if (old && !canEdit(old)) throw new Error('이미 인보이스가 확정된 주문입니다');
      const doc = crSign(orderDoc(Object.assign({}, old || {}, base, { st: old ? old.st : st }), lines, O.disc));
      await S.DB.batch([{ op: 'set', col: 'orders', id: O.id, data: doc }, { op: 'set', col: 'orderLines', id: O.id, data: { sm: O.sm, lines } }]);
      const id = O.id, kd = O.kind; O = null; clearWip(kd); toast('저장했습니다', 'good'); goOrder(id);
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false); return;
  }
  /* 세일즈맨 · 새 주문 — 폰의 보낼 함에 먼저 넣고(사라지지 않게) 전송 */
  try { putOut(crSign(orderDoc(base, lines, O.disc)), lines); } catch (e) { return toast(e.message, 'bad'); }
  const id = O.id, acct = base.acct, store = base.store, kd = O.kind; O = null; clearWip(kd);
  busy(true); const r = await syncOutbox(true); busy(false);
  const left = !!readOut()[id];
  if (kd === 'credit' && isStaff() && st === 'sent' && !left) { toast('↩ ' + bt('크레딧 요청을 고쳤습니다 — 확인 후 CM 발행', 'Credit request updated — review and issue the CM'), 'good'); return goOrder(id); }   // ✏️ 사무실이 확인 대기 크레딧을 고친 뒤 → 다시 확인 화면 (v0.8.227)
  if (kd === 'credit') { Router.markSaved('order'); toast(left ? '📱 ' + bt('폰에 저장했습니다 — 인터넷이 되면 자동으로 보냅니다', 'Saved on the phone') : '↩ ' + bt('크레딧 저장 — 보낼 주문에서 주문과 같이 보냅니다', 'Credit saved — send it with your orders'), left ? '' : 'good'); return Router.go(Router.home || 'order'); }
  toast(left ? '📱 폰에 저장했습니다 — 인터넷이 되면 자동으로 보냅니다' : (st === 'sent' ? '보냈습니다 📤' : '저장했습니다 — 수정 · 추가는 보내기 전까지 자유, 하루 치는 "보낼 주문"에서 한 번에 보냅니다'), left ? '' : 'good');
  /* 💵 그 가게에 받을 돈이 있으면 "수금할 것 있나요?" → 수금 입력으로 바로 (v0.8.185) */
  if (acct && await askCollect(acct, store)) return;
  /* 저장 · 보내기 뒤에는 홈으로 — ‹ 뒤로는 주문 첫 화면 (보내기 전 편집 화면으로 안 감) */
  Router.markSaved('order'); Router.go(Router.home || 'order');
}
/** 💵 주문 저장 뒤 — 가게 미수금(AR · 미결 인보이스)이 있으면 묻고, "수금 입력"을 누르면 그 가게가 골라진 수금 입력으로 (true = 넘어감)
 *   잔액을 3초 안에 못 읽으면(오프라인 등) 금액 없이 물음 · 잔액이 0 이면 묻지 않음 (v0.8.185 관리자: "오더 저장 뒤 그 가게의 수금할 것이 있는지 물어보고 수금으로 바로 연결") */
async function askCollect(acct, store) {
  let info = null; try { info = await Promise.race([Store.storeInfo(acct), new Promise(r => setTimeout(() => r(null), 3000))]); } catch (e) {}
  const bal = info && !info.err ? Number(info.bal) || 0 : null, nInv = info && info.invs ? info.invs.filter(v => v.bal > 0.005).length : 0;
  if (bal != null && bal <= 0.005) return false;
  return new Promise(res => {
    openModal('<h2>💵 ' + bi('이 가게에서 받은 수금이 있나요?', 'Any payment from this store?') + '</h2><div class="sumbox" style="margin:8px 0"><b>' + esc(store) + '</b> <span class="muted">' + esc(acct) + '</span>' +
      (bal != null ? '<div style="margin-top:4px">' + bt('미수금', 'Open balance') + ' <b class="warn" style="font-size:18px">' + money(bal) + '</b>' + (nInv ? ' · ' + bt('인보이스', 'invoices') + ' ' + nInv + bt('장', '') : '') + '</div>' : '') + '</div>' +
      '<div class="btns"><button class="b-ghost" id="acNo">' + bi('나중에', 'Later') + '</button><button class="b-green" id="acGo">💵 ' + bi('수금 입력', 'Enter payment') + '</button></div>');
    $('acNo').onclick = () => { closeModal(); res(false); };
    $('acGo').onclick = async () => { closeModal(); try { const C = await import('./collect.js'); C.newEntryFor(acct, store); res(true); } catch (e) { res(false); } };
  });
}
