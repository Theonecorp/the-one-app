/* ============================================================
 *  THE ONE 앱 — 진입점: 로그인 → 역할 → 메뉴
 * ============================================================ */
import { connect, MOCK, newId } from './db.js';
import { $, esc, toast, busy, Router, openModal, closeModal, printClose, today, bt } from './ui.js';
import { CSS } from './style.js';
import * as Sales from './sales.js';
import * as Collect from './collect.js';
import * as Ach from './ach.js';
import * as Mg from './mg.js';
import * as Mgr from './mgr.js';
import * as Boss from './boss.js';
import * as Admin from './admin.js';
import * as Orders from './orders.js';
import * as Items from './items.js';
import * as CatPage from './catpage.js';
import * as Track from './track.js';
import * as Reports from './reports.js';
import { loadAccounts } from './accounts.js';
import { setInvTypeMap } from './comm.js';
import { invTypes } from './invoicing.js';
import { initLang, LANG, LANGS, setLang } from './i18n.js';

export const VER = 'v0.8.52';
export const S = { user: null, me: null, role: '', sms: [], smByCode: {}, accounts: [], settings: {}, DB: null, AUTH: null };
const ADMIN_EMAILS = ['luke@theonefl.com'];

/* 화면 메뉴 — 역할(role) 과 담당자의 일(job) 에 따라 다름. 글씨는 한글 · 영문 병기
 *   salesman  세일즈맨: 세일즈 관련만
 *   manager   담당자 — job: office 오피스(기본) · invoice 인보이스 · pick 픽킹·팩킹 · acct 어카운팅
 *   admin     관리자: 전부 */
const NAV = {
  salesman: [['home', '🏠', '홈', 'Home'], ['order', '🛒', '주문', 'Orders'], ['entry', '✍️', '수금 입력', 'Payment'], ['stores', '🏬', '거래처', 'Customers'], ['cat', '📒', '카탈로그', 'Catalog'], ['ar', '💰', '미수금', 'A/R'], ['mycomm', '🧾', '정산서', 'Commission'], ['mine', '📋', '내 기록', 'My Log']],
  office:   [['order', '🛒', '주문', 'Orders'], ['verify', '💵', '수금 확인', 'Payments'], ['cod', '💳', 'COD·카드', 'COD · Card'], ['ach', '🏦', 'ACH', 'ACH'], ['items', '🏷', '아이템', 'Items'], ['stores', '🏬', '거래처', 'Customers']],
  acct:     [['verify', '💵', '수금 확인', 'Payments'], ['cod', '💳', 'COD·카드', 'COD · Card'], ['ach', '🏦', 'ACH', 'ACH'], ['order', '🧾', '인보이스', 'Invoices'], ['stores', '🏬', '거래처', 'Customers']],
  pickinv:  [['order', '📦', '주문·출고', 'Fulfillment'], ['items', '🏷', '아이템·위치', 'Items'], ['stores', '🏬', '거래처', 'Customers']],
  invoice:  [['order', '🧾', '주문·인보이스', 'Orders'], ['verify', '💵', '수금 확인', 'Payments'], ['stores', '🏬', '거래처', 'Customers']],
  whmgr:    [['order', '📦', '창고 작업', 'Warehouse'], ['items', '🏷', '재고·위치', 'Inventory'], ['stores', '🏬', '거래처', 'Customers']],
  pick:     [['order', '📦', '내 작업', 'My Work'], ['items', '🏷', '재고·위치', 'Inventory'], ['stores', '🏬', '거래처', 'Customers']],
  admin:    [['now', '📈', '현황', 'Today'], ['order', '🛒', '주문', 'Orders'], ['pay', '🧾', '정산', 'Payroll'], ['bossar', '💰', '미수금', 'A/R'], ['mg', '🏭', '경영', 'Business'], ['admin', '⚙️', '관리', 'Admin']]
};
NAV.manager = NAV.office;
/* 담당자(manager)의 일 — 메뉴 · 버튼이 달라짐. 데이터 권한(Firestore 규칙)은 담당자 모두 같음, 관리자(루크)는 전부 */
export const JOBS = [['office', '오피스 매니저', 'Office Manager'], ['acct', '회계 담당', 'Accounting'], ['pickinv', '출고 · 인보이스', 'Fulfillment & Invoicing'], ['invoice', '인보이스 담당', 'Invoicing'], ['whmgr', '창고 매니저', 'Warehouse Manager'], ['pick', '창고 직원', 'Warehouse Staff']];
/** 일별 할 수 있는 것 — newOrder 주문 만들기 · invoice 인보이스 발행 · 주문 수정/취소 · 가게 바꾸기 · assign 작업 배정 · pick 피킹 입력 · ship 포장 · 출고(UPS)
 *  · verify 수금 확인 · cod COD·카드 · ach ACH · items 아이템 · 재고 위치 · bo 백오더 */
export const CAN = {
  office:  ['newOrder', 'invoice', 'void', 'assign', 'pick', 'ship', 'verify', 'cod', 'ach', 'items', 'bo'],
  acct:    ['verify', 'cod', 'ach', 'invLookup'],
  pickinv: ['invoice', 'void', 'assign', 'pick', 'ship', 'items', 'bo'],
  invoice: ['newOrder', 'invoice', 'void', 'verify', 'bo'],
  whmgr:   ['assign', 'pick', 'ship', 'items', 'bo'],
  pick:    ['pick', 'ship', 'items']
};
export const jobCan = (job, cap) => (CAN[job] || CAN.office).includes(cap);
/** 지금 사용자가 이걸 할 수 있나 — 관리자는 전부, 세일즈맨은 없음 */
export function can(cap) { if (S.role === 'admin') return true; if (S.role !== 'manager') return false; return jobCan(jobOf(), cap); }
/** 지금 화면의 일 — 담당자는 사용자 기록의 job (없으면 office), 그 외는 역할 그대로 */
export function jobOf() { if (S.role !== 'manager') return S.role; const j = S.me && S.me.job; return JOBS.some(x => x[0] === j) ? j : 'office'; }
export function jobLabel(j) { const x = JOBS.find(k => k[0] === j); return x ? x[1] + ' ' + x[2] : j; }
/* 주문는 관리 → 📦 아이템에서 "주문 켜기" 전까지 관리자에게만 보임 */
/* 주문가 켜지면 세일즈맨은 🏠 홈(큰 버튼) 이 첫 화면, 꺼져 있으면 예전처럼 수금 입력부터 */
function navFor(r) {
  const on = S.settings.ordersOn || (S.me && S.me.role === 'admin');
  const key = r === 'manager' ? jobOf() : r;
  let items = (NAV[key] || NAV.office).filter(x => (x[0] !== 'order' && x[0] !== 'home') || on);
  if (r === 'salesman') items = items.filter(x => on ? x[0] !== 'mine' : true);   // 홈이 있으면 내 기록은 홈 안의 버튼으로
  if (!items.length) items = [['stores', '🏬', '거래처', 'Stores']];
  return items;
}

function shell() {
  document.head.insertAdjacentHTML('beforeend', '<style>' + CSS + '</style>');
  document.body.innerHTML =
    '<header><button class="hb" id="hBack" title="뒤로">‹</button><img src="logo-96.png" alt="" class="hlogo"><h1 id="hTitle">THE ONE</h1><div class="hr"><span id="hNet" title="인터넷 연결"></span><span id="hWho"></span><button class="hb hlang" id="hLang" translate="no" title="Language">🌐 ' + LANG.toUpperCase() + '</button><button class="hb" id="hMenu" title="메뉴">☰</button></div></header>' +
    '<div class="wrap" id="page"><div class="load">불러오는 중…</div></div>' +
    '<nav id="nav"></nav>' +
    '<div id="busy"><div class="spin"></div></div><div id="topbar"></div>' +
    '<div id="toast"></div>' +
    '<div id="modal"><div class="box" id="mbox"></div></div>' +
    '<div id="prt"><div id="prtbar"><button onclick="window.print()">🖨 인쇄 / PDF</button><button id="prtClose">닫기</button></div><div id="prtbody"></div></div>';
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  /* ⏳ 서버에서 읽는 동안 화면 맨 위에 진행 막대 (0.15초 넘게 걸릴 때만) */
  let tbT = 0; window.addEventListener('dbbusy', e => { const n = e.detail, tb = $('topbar'); if (!tb) return; clearTimeout(tbT); if (n > 0) tbT = setTimeout(() => tb.classList.add('on'), 150); else tb.classList.remove('on'); });
  $('prtClose').onclick = printClose;
  $('hMenu').onclick = userMenu;
  /* 🌐 언어 — 앱 위쪽 버튼으로 바로 (이 폰 · 컴퓨터에 저장, 로그인한 사람과 상관없이) */
  $('hLang').onclick = () => { openModal('<h2 translate="no">🌐 Language · 언어 · Idioma</h2><div class="langpick" translate="no">' + LANGS.map(l => '<button class="' + (LANG === l[0] ? 'b-blue' : 'b-ghost') + '" data-lang="' + l[0] + '">' + ({ ko: '🇰🇷 ', en: '🇺🇸 ', pt: '🇧🇷 ' })[l[0]] + l[1] + '</button>').join('') + '</div>');
    document.querySelectorAll('#mbox [data-lang]').forEach(b => b.onclick = () => { closeModal(); if (b.dataset.lang !== LANG) setLang(b.dataset.lang); }); };
  $('hBack').onclick = () => Router.back();
  const net = () => { const d = $('hNet'); if (d) { d.classList.toggle('off', navigator.onLine === false); d.title = navigator.onLine === false ? '오프라인 — 저장한 것은 폰에 보관됩니다' : '온라인'; } };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
}

function loginScreen(msg) {
  $('nav').innerHTML = ''; $('hWho').textContent = '';
  $('page').innerHTML = '<div class="card login"><div class="logo"><img src="logo.png" alt="ONE"></div><h1>THE ONE</h1><p>회사 구글 계정으로 로그인하세요<br><span class="en">Sign in with your company Google account</span></p>' +
    '<button class="b-blue" id="btnLogin">Google 로 로그인 · Sign in with Google</button>' + (msg ? '<div class="alert a-red" style="margin-top:12px">' + esc(msg) + '</div>' : '') +
    '<div class="seg" style="margin-top:16px">' + LANGS.map(l => '<button class="' + (LANG === l[0] ? 'on' : '') + '" data-lang="' + l[0] + '" translate="no">' + l[1] + '</button>').join('') + '</div>' +
    '<p class="muted" style="margin-top:18px">' + VER + '</p></div>';
  document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { if (b.dataset.lang !== LANG) setLang(b.dataset.lang); });
  $('btnLogin').onclick = async () => { try { await S.AUTH.signIn(); } catch (e) { loginScreen(e.code + ' — ' + e.message); } };
}
function waitScreen(email) {
  $('nav').innerHTML = '';
  $('page').innerHTML = '<div class="card login"><div class="logo">⏳</div><h1>등록 대기 <span class="en">Not registered yet</span></h1><p>' + esc(email) + ' 계정은 아직 앱에 등록되지 않았습니다.<br>루크에게 등록을 요청해 주세요.<br><span class="en">This account is not registered. Please ask Luke.</span></p>' +
    '<button class="b-ghost" id="btnOut">로그아웃 Sign out</button></div>';
  $('btnOut').onclick = () => S.AUTH.signOut();
}
function userMenu() {
  if (!S.user) return;
  const isAdm = S.me && S.me.role === 'admin';
  const roles = isAdm ? ['admin', 'manager', 'salesman'] : [];
  openMenu('<h2>' + esc(S.user.name || S.user.email) + '</h2><p class="muted">' + esc(S.user.email) + ' · ' + (S.role === 'manager' ? jobLabel(jobOf()) : roleLabel(S.role)) + ' · ' + VER + '</p>' +
    (roles.length ? '<div class="fg"><label>화면 보기 (관리자) <span class="en">Preview as</span></label><div class="seg">' + roles.map(r => '<button class="' + (S.role === r ? 'on' : '') + '" data-r="' + r + '">' + roleLabel(r) + '</button>').join('') + '</div>' +
      (S.role === 'manager' ? '<div class="seg">' + JOBS.map(j => '<button class="' + (jobOf() === j[0] ? 'on' : '') + '" data-j="' + j[0] + '">' + j[1] + ' <span class="en">' + j[2] + '</span></button>').join('') + '</div>' : '') + '</div>' : '') +
    '<div class="fg"><label>🌐 언어 · Language · Idioma</label><div class="seg">' + LANGS.map(l => '<button class="' + (LANG === l[0] ? 'on' : '') + '" data-lang="' + l[0] + '" translate="no">' + l[1] + '</button>').join('') + '</div></div>' +
    '<div class="btns"><button class="b-ghost" id="mOut">로그아웃 <span class="en">Sign out</span></button><button class="b-blue" id="mReload">새로고침 <span class="en">Reload</span></button></div>' +
    (isApp() ? '' : '<button class="b-blue b-sm" id="mInst" style="margin-top:10px">📲 ' + bt('앱으로 설치 (홈 화면)', 'Install as app') + '</button>') +
    '<button class="b-ghost b-sm" id="mDiag" style="margin-top:10px">🔎 연결 · 권한 점검 <span class="en">Check connection</span></button><div id="diagOut"></div>');
  $('mDiag').onclick = diag;
  if ($('mInst')) $('mInst').onclick = () => { closeModal(); doInstall(); };
  document.querySelectorAll('#mbox [data-lang]').forEach(b => b.onclick = () => { if (b.dataset.lang !== LANG) setLang(b.dataset.lang); });
  document.querySelectorAll('#mbox [data-r]').forEach(b => b.onclick = () => { switchRole(b.dataset.r); closeModal(); });
  document.querySelectorAll('#mbox [data-j]').forEach(b => b.onclick = () => { S.me.job = b.dataset.j; switchRole('manager'); closeModal(); });
  $('mOut').onclick = () => { closeModal(); S.AUTH.signOut(); };
  $('mReload').onclick = () => location.reload();
}
/** 어떤 자료를 읽을 수 있는지 하나씩 시험 — 권한 오류 원인 찾기용 */
async function diag() {
  const out = $('diagOut'); out.innerHTML = '<div class="load">점검 중…</div>';
  const me = S.me || {};
  const rows = ['앱 ' + VER + ' · 로그인 <b>' + esc(S.user.email) + '</b>', '사용자 기록: 역할 ' + esc(String(me.role)) + ' · 활성 ' + esc(String(me.active)) + ' · 세일즈맨 코드 ' + esc(String(me.sm || '-')) + ' · 일 ' + esc(String(me.job || '-'))];
  const tests = [['사용자 (내 것)', () => S.DB.get('users', S.user.email)], ['설정', () => S.DB.get('settings', 'app')], ['세일즈맨', () => S.DB.list('salesmen', { limit: 1 })],
    ['거래처', () => S.DB.list('accounts', { limit: 1 })], ['아이템', () => S.DB.get('catalog', 'meta')], ['주문', () => S.DB.list('orders', S.role === 'salesman' ? { where: [['sm', '==', me.sm || '-']], limit: 1 } : { limit: 1 })]];
  for (const [n, f] of tests) { try { await f(); rows.push('✅ ' + n); } catch (e) { rows.push('❌ ' + n + ' — ' + esc(e.code || e.message)); } }
  out.innerHTML = '<div class="sumbox" style="line-height:1.8">' + rows.join('<br>') + '</div>';
  /* 📊 자료 건수 — 서버에 실제로 뭐가 들어 있나 (관리자 · 담당자) */
  if (S.role === 'salesman') return;
  const ym0 = today().substring(0, 7), d1 = new Date(); d1.setMonth(d1.getMonth() - 1); const ym1 = d1.getFullYear() + '-' + String(d1.getMonth() + 1).padStart(2, '0');
  const cnt = async (col, q) => { try { const r = await S.DB.list(col, q || {}); return r.length; } catch (e) { return '❌ ' + (e.code || e.message); } };
  const L = [];
  L.push('거래처 accounts: <b>' + ((S.accounts && S.accounts.length) || 0) + '</b> (버전 ' + esc(String(S.settings.accountsVer || '없음')) + ')');
  L.push('세일즈맨 salesmen: <b>' + (S.sms || []).length + '</b> — ' + esc((S.sms || []).map(x => x.code).join(', ')));
  L.push('수금 entries ' + ym0 + ': <b>' + await cnt('entries', { where: [['ym', '==', ym0]] }) + '</b> · ' + ym1 + ': <b>' + await cnt('entries', { where: [['ym', '==', ym1]] }) + '</b>');
  L.push('COD·카드·ACH cod ' + ym0 + ': <b>' + await cnt('cod', { where: [['ym', '==', ym0]] }) + '</b> · ' + ym1 + ': <b>' + await cnt('cod', { where: [['ym', '==', ym1]] }) + '</b>');
  try { const ar = await S.DB.get('ar', '_all'); L.push('미수금 ar/_all: ' + (ar ? '<b>' + (ar.n || 0) + '곳 · $' + Math.round(ar.total || 0).toLocaleString() + '</b> · 기준일 ' + esc(ar.asOf || '?') + ' · 올린 날 ' + esc(String(ar.uploadedAt || '').substring(0, 10)) : '<b class="warn">없음</b>')); } catch (e) { L.push('미수금 ar/_all: ❌ ' + esc(e.code || e.message)); }
  const arDocs = await (async () => { try { return (await S.DB.list('ar')).map(d => d.id + '(' + (d.n || 0) + ')').join(' '); } catch (e) { return '❌ ' + (e.code || e.message); } })();
  L.push('세일즈맨별 ar 문서: ' + esc(arDocs || '없음'));
  L.push('주문 orders: <b>' + await cnt('orders', { where: [['ym', 'in', [ym0, ym1]]] }) + '</b> (최근 2달) · 인보이스 invoices: <b>' + await cnt('invoices', { where: [['ym', 'in', [ym0, ym1]]] }) + '</b> (최근 2달)');
  L.push('정산 settlements: <b>' + await cnt('settlements') + '</b> · 공제 deductions: <b>' + await cnt('deductions') + '</b>');
  try { const m = await S.DB.get('catalog', 'meta'); L.push('아이템 catalog: ' + (m ? '<b>' + (m.count || 0) + '개</b> · ' + esc(String(m.updatedAt || '').substring(0, 10)) : '<b class="warn">없음</b>')); } catch (e) {}
  if (S.role === 'admin') { L.push('공장 인보이스: <b>' + await cnt('factoryInvoices') + '</b> · 송금: <b>' + await cnt('factoryPayments') + '</b> · 1099: <b>' + await cnt('pay1099') + '</b> · 보너스 적립: <b>' + await cnt('bonusAcc') + '</b>'); }
  out.insertAdjacentHTML('beforeend', '<div class="sumbox" style="line-height:1.8;margin-top:8px"><b>📊 서버 자료 건수</b><br>' + L.join('<br>') + '</div>');
}
function openMenu(h) { openModal(h); }
/* 📲 앱으로 설치 — 안드로이드 크롬이 "설치 가능" 하다고 알려 주면 그 신호를 받아 두었다가 버튼으로 (홈 화면에서 크롬 없이 앱처럼 열림) */
let INSTALL = null;
const isApp = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL = e; installBar(); });
window.addEventListener('appinstalled', () => { INSTALL = null; const b = document.getElementById('instBar'); if (b) b.remove(); toast('📲 ' + bt('앱으로 설치했습니다 — 홈 화면의 THE ONE 아이콘으로 여세요', 'Installed — open THE ONE from your home screen'), 'good'); });
async function doInstall() {
  if (INSTALL) { INSTALL.prompt(); try { await INSTALL.userChoice; } catch (e) {} INSTALL = null; const b = document.getElementById('instBar'); if (b) b.remove(); return; }
  openModal('<h2>📲 ' + bt('앱으로 설치', 'Install the app') + '</h2><div class="muted" style="line-height:1.7">' + bt('안드로이드: 크롬에서 이 주소를 연 뒤 오른쪽 위 ⋮ → <b>앱 설치</b> (또는 홈 화면에 추가 → <b>설치</b>). 카카오톡 · 문자 안의 브라우저가 아니라 <b>크롬</b>에서 열어야 합니다. 예전에 만든 아이콘은 지우고 다시 설치하세요.<br>아이폰: 사파리 → 공유 ⬆️ → <b>홈 화면에 추가</b>.', 'Android: open this page in Chrome → ⋮ → Install app. iPhone: Safari → Share → Add to Home Screen.') + '</div><div class="btns"><button class="b-blue" id="inX">' + bt('확인', 'OK') + '</button></div>');
  $('inX').onclick = closeModal;
}
function installBar() {
  if (isApp() || !INSTALL || document.getElementById('instBar')) return;
  try { const t = Number(localStorage.getItem('theone.instHide') || 0); if (Date.now() - t < 3 * 86400000) return; } catch (e) {}
  const d = document.createElement('div'); d.id = 'instBar';
  d.innerHTML = '<span>📲 ' + bt('THE ONE 을 앱으로 설치 — 크롬 없이 바로 열려요', 'Install THE ONE as an app') + '</span><button id="instGo">' + bt('설치', 'Install') + '</button><button id="instNo">✕</button>';
  document.body.appendChild(d);
  $('instGo').onclick = doInstall;
  $('instNo').onclick = () => { d.remove(); try { localStorage.setItem('theone.instHide', String(Date.now())); } catch (e) {} };
}
export function roleLabel(r) { return { admin: '관리자 Admin', manager: '담당자 Staff', salesman: '세일즈맨 Salesman' }[r] || r; }

function switchRole(r) {
  S.role = r;
  Router.stack = [];   // 새 역할의 첫 화면이 뒤로가기의 끝
  paintNav();
  Router.go(navFor(r)[0][0]);
}
/* 아래 메뉴의 실제 높이를 CSS 변수로 — 고정 바(.sticky) 와 본문 여백이 메뉴에 가리지 않게 */
function navH() { const n = $('nav'); const h = n && getComputedStyle(n).position === 'fixed' ? n.offsetHeight : 0; document.documentElement.style.setProperty('--navh', h + 'px'); const hd = document.querySelector('header'); if (hd) document.documentElement.style.setProperty('--hdr', hd.offsetHeight + 'px'); }
window.addEventListener('resize', () => setTimeout(navH, 50));
/* 아래로 내리면 위 고정 메뉴(주문 상태 아이콘)는 글씨를 접고 아이콘만 — 화면을 덜 가림 */
window.addEventListener('scroll', () => { const y = window.scrollY, was = document.body.classList.contains('oscr'), on = was ? y > 60 : y > 160; if (document.body.classList.contains('oscr') !== on) document.body.classList.toggle('oscr', on); }, { passive: true });
function paintNav() {
  const items = navFor(S.role);
  Router.home = items.length ? items[0][0] : '';
  $('nav').innerHTML = items.map(x => '<button data-go="' + x[0] + '"><span class="i">' + x[1] + '</span>' + x[2] + '<span class="en">' + (x[3] || '') + '</span></button>').join('');
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => Router.go(b.dataset.go));
  navH();
  $('hWho').textContent = S.me && S.me.sm && S.role === 'salesman' ? S.me.sm : (S.me && S.me.sm ? S.me.sm + ' · ' : '') + (S.role === 'manager' ? (JOBS.find(j => j[0] === jobOf()) || ['', ''])[1] : roleLabel(S.role).split(' ')[0]);
}

async function afterLogin(user) {
  S.user = user;
  const email = user.email;
  let me = null;
  try { me = await S.DB.get('users', email); } catch (e) { loginScreen('데이터베이스를 읽지 못했습니다 (' + (e.code || e.message) + ')'); return; }
  if (!me && ADMIN_EMAILS.includes(email)) {
    me = { id: email, email, name: user.name, role: 'admin', active: true, createdAt: today() };
    try { await S.DB.set('users', email, me); } catch (e) { loginScreen('관리자 기록을 만들지 못했습니다: ' + e.message); return; }
  }
  if (!me || me.active === false) { waitScreen(email); return; }
  /* 옛 버전이 만든 관리자 기록에 active 가 없으면 규칙의 "등록된 사용자" 검사에 걸림 → 채워 둠 */
  if (ADMIN_EMAILS.includes(email) && (me.active !== true || me.role !== 'admin')) {
    try { await S.DB.update('users', email, { active: true, role: 'admin' }); me.active = true; me.role = 'admin'; } catch (e) {}
  }
  S.me = me; S.role = me.role || 'salesman';
  busy(true);
  try {
    const [sms, st] = await Promise.all([S.DB.list('salesmen', { order: ['code', 'asc'] }), S.DB.get('settings', 'app')]);   // 동시에 읽기
    S.sms = sms; S.smByCode = {}; S.sms.forEach(x => { S.smByCode[x.code] = x; });
    S.settings = st || {};
    setInvTypeMap(invTypes(S));
    S.accounts = await loadAccounts(S);
  } catch (e) { toast('기본 자료를 읽지 못했습니다: ' + (e.code || e.message), 'bad'); }
  busy(false);
  paintNav();
  const valid = navFor(S.role).some(x => location.hash.indexOf('#/' + x[0]) === 0) || location.hash.indexOf('#/entry') === 0 || location.hash.indexOf('#/mine') === 0 || location.hash.indexOf('#/hist') === 0 || location.hash.indexOf('#/find') === 0 || location.hash.indexOf('#/items') === 0 || location.hash.indexOf('#/cat') === 0 || location.hash.indexOf('#/track') === 0 || location.hash.indexOf('#/stores') === 0 || location.hash.indexOf('#/reports') === 0 || location.hash.indexOf('#/arup') === 0;
  if (!valid) location.hash = '#/' + navFor(S.role)[0][0];
  Router.stack = [];
  if (!ROUTER_ON) { ROUTER_ON = true; Router.start(); } else Router.start();
}
let ROUTER_ON = false;
/* 🔒 자동 로그아웃 — 설정 idleMin(분) 동안 아무 조작이 없으면 로그아웃 (폰을 잃어버렸을 때 대비) */
let LAST_ACT = Date.now();
['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, () => { LAST_ACT = Date.now(); }, { passive: true }));
setInterval(() => { const m = Number(S && S.settings && S.settings.idleMin) || 0; if (m > 0 && S && S.user && Date.now() - LAST_ACT > m * 60000) { S.AUTH.signOut(); toast('🔒 ' + m + '분 동안 사용하지 않아 로그아웃했습니다 · Signed out after inactivity'); } }, 30000);

async function boot() {
  shell();
  const [{ DB, AUTH }] = await Promise.all([connect(), initLang(VER)]);
  S.DB = DB; S.AUTH = AUTH;
  Sales.register(S); Collect.register(S); Ach.register(S); Mgr.register(S); Boss.register(S); Mg.register(S); Admin.register(S); Orders.register(S); Items.register(S); CatPage.register(S); Track.register(S); Reports.register(S);
  Router.on('', () => {});
  AUTH.onChange(u => {
    if (!u) { S.user = null; S.me = null; loginScreen(''); return; }
    afterLogin(u);
  });
}
boot();
