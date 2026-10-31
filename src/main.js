/* ============================================================
 *  THE ONE 앱 — 진입점: 로그인 → 역할 → 메뉴
 * ============================================================ */
import { connect, MOCK, newId } from './db.js';
import { $, esc, toast, busy, Router, openModal, closeModal, printClose, today, bt, numPadOn, setNumPad, goHash } from './ui.js';
import { CSS } from './style.js';
import * as Sales from './sales.js';
import * as Collect from './collect.js';
import * as Ach from './ach.js';
import * as Mg from './mg.js';
import * as Mgr from './mgr.js';
import * as Boss from './boss.js';
import * as Admin from './admin.js';
import * as Orders from './orders.js';
import * as NewAcct from './newacct.js';
import * as Notify from './notify.js';
import * as Photos from './photos.js';
import * as Envelope from './envelope.js';
import * as Credit from './credit.js';
import * as Bounce from './bounce.js';
import * as Offline from './offline.js';
import * as OwnHome from './ownhome.js';
import * as Bank from './bank.js';
import * as Items from './items.js';
import * as Stock from './stock.js';
import * as Hub from './hub.js';
import * as MySales from './mysales.js';
import * as CatPage from './catpage.js';
import * as Track from './track.js';
import * as Reports from './reports.js';
import * as Flow from './flow.js';
import * as Invlook from './invlook.js';
import * as Access from './access.js';
import { loadAccounts } from './accounts.js';
import { setInvTypeMap } from './comm.js';
import { invTypes } from './invoicing.js';
import { initLang, LANG, LANGS, setLang } from './i18n.js';

export const VER = 'v0.8.141';
export const S = { user: null, me: null, role: '', sms: [], smByCode: {}, accounts: [], settings: {}, DB: null, AUTH: null };
const ADMIN_EMAILS = ['luke@theonefl.com'];

/* 화면 메뉴 — 역할(role) 과 담당자의 일(job) 에 따라 다름. 글씨는 한글 · 영문 병기
 *   salesman  세일즈맨: 세일즈 관련만
 *   manager   담당자 — job: office 오피스(기본) · invoice 인보이스 · pick 픽킹·팩킹 · acct 어카운팅
 *   admin     관리자: 전부 */
/* 맨 앞 4개는 모든 역할이 같음: 🏠 홈 · 🛒 세일 · 📄 인보이스 · 🏬 거래처 — 그 뒤에 역할 · 일마다 필요한 것 */
const SALE = ['order', '🛒', '세일', 'Sales'], INVS = ['invs', '📄', '인보이스', 'Invoices'], STORES = ['stores', '🏬', '거래처', 'Customers'];
const HOME_STAFF = ['shome', '🏠', '홈', 'Home'], HOME_TOP = ['now', '🏠', '홈', 'Home'];
const HUB_MONEY = ['hub/money', '💵', '수금', 'Collections'], HUB_LOOK = ['hub/look', '📚', '조회', 'Lookup'], HUB_WH = ['hub/wh', '📦', '재고', 'Inventory'];
const HUB_SMONEY = ['hub/smoney', '💵', '수금', 'Collections'], HUB_SLOOK = ['hub/slook', '📚', '조회', 'Lookup'], HUB_BIZ = ['hub/biz', '💼', '경영', 'Business'];
const NAV = {
  /* 세일즈맨 (v0.8.135) — 🏠 홈 · 🛒 세일 · 💵 수금(입력 · 내역 · 체크 보내기 · 기록 · 미수금 · 체크 관리) · 🏬 거래처 · 📚 조회(인보이스 · 카탈로그 · 내 매출 · 배송) */
  salesman: [['home', '🏠', '홈', 'Home'], SALE, HUB_SMONEY, STORES, HUB_SLOOK],
  /* 담당자 — 큰 묶음만 (🗂 hub.js): 💵 수금 · 📚 조회 · 📦 재고 — 누르면 그 안의 세부 화면 (v0.8.125) */
  office:   [HOME_STAFF, SALE, HUB_MONEY, HUB_LOOK, HUB_WH],
  acct:     [['verify', '🏠', '홈', 'Home'], HUB_MONEY, HUB_LOOK],   // 회계: 홈 = 수금 확인
  pickinv:  [HOME_STAFF, SALE, HUB_LOOK, HUB_WH],
  invoice:  [HOME_STAFF, SALE, HUB_LOOK, HUB_WH],   // 인보이스 담당: 수금은 안 봄 (오피스 매니저 · 회계 담당만) — 인보이스 · 조회 · 재고 (v0.8.137)
  whmgr:    [HOME_STAFF, SALE, HUB_WH, HUB_LOOK],   // 창고 매니저: 재고 · 출고 중심
  pick:     [HOME_STAFF, SALE, HUB_WH, HUB_LOOK],
  catalog:  [['catmg', '🏠', '홈', 'Home'], ['items', '🏷', '아이템', 'Items'], ['photos', '📷', '사진', 'Photos'], ['catmg/tree', '🗂', '분류', 'Categories'], ['cat', '📒', '카탈로그', 'Catalog']],   // 🎨 디자인 · 카탈로그 담당: 아이템 · 사진 · 분류 · 카탈로그만 (주문 · 수금 없음)
  /* 오너 · 관리자 (v0.8.135) — 🏠 홈(대시보드) · 📚 조회(인보이스 · 거래처 · 배송 · 카탈로그) · 💼 경영(매출 · 경영 · 정산 · 미수금 · 수금 현황 · 리포트) · (관리자) 📦 재고 · ⚙️ 관리 */
  owner:    [['own', '🏠', '홈', 'Home'], HUB_LOOK, HUB_BIZ],   // 오너: 경영 숫자만 (세일 · 인보이스 · 거래처는 🚗 세일즈 모드에서) · 홈 = 경영 대시보드
  admin:    [['own', '🏠', '홈', 'Home'], HUB_LOOK, HUB_BIZ, HUB_WH, ['admin', '⚙️', '관리', 'Admin']]   // 관리자: 오너와 같은 대시보드 + 정산 · 관리 · 🔁 모드(오너 · 담당자 · 세일즈) — 미수금 · 수금은 홈 칸에서
};
NAV.manager = NAV.office;
/* 담당자(manager)의 일 — 메뉴 · 버튼이 달라짐. 데이터 권한(Firestore 규칙)은 담당자 모두 같음, 관리자는 전부 */
export const JOBS = [['office', '오피스 매니저', 'Office Manager'], ['acct', '회계 담당', 'Accounting'], ['pickinv', '출고 · 인보이스', 'Fulfillment & Invoicing'], ['invoice', '인보이스 담당', 'Invoicing'], ['whmgr', '창고 매니저', 'Warehouse Manager'], ['pick', '창고 직원', 'Warehouse Staff'], ['catalog', '디자인 · 카탈로그', 'Design & Catalog']];
/** 일별 할 수 있는 것 — flow 🧭 전체 주문 흐름 감독 · newOrder 주문 만들기 · invoice 인보이스 발행 · 주문 수정/취소 · 가게 바꾸기 · assign 작업 배정 · pick 피킹 입력 · ship 포장 · 출고(UPS)
 *  · verify 수금 확인 · cod COD·카드 · ach ACH · items 아이템 · 재고 위치 · bo 백오더 */
export const CAN = {
  office:  ['flow', 'newOrder', 'invoice', 'void', 'assign', 'pick', 'ship', 'verify', 'cod', 'ach', 'items', 'bo'],
  acct:    ['verify', 'cod', 'ach', 'invLookup'],
  pickinv: ['flow', 'invoice', 'void', 'assign', 'pick', 'ship', 'items', 'bo'],
  invoice: ['newOrder', 'invoice', 'void', 'items', 'bo'],
  whmgr:   ['flow', 'assign', 'pick', 'ship', 'items', 'bo'],
  pick:    ['pick', 'ship', 'items'],
  catalog: ['items', 'catalog']   // 🎨 디자인 · 카탈로그 담당: 아이템 · 분류 · 사진 · 세트 · 바코드 (주문 · 수금은 안 봄)
};
export const jobCan = (job, cap) => (CAN[job] || CAN.office).includes(cap);
/** 지금 사용자가 이걸 할 수 있나 — 관리자는 전부, 세일즈맨은 없음 */
/** 관리자급 — 관리자 · 오너 (데이터는 둘 다 전부, 화면은 오너가 현황 · 경영 위주) */
export const isTop = () => S.role === 'admin' || S.role === 'owner';
/** 이 사람이 볼 수 있는 화면 — 관리자: 전부 (관리 · 오너 · 담당 · 세일즈) · 오너 / 담당자: 자기 역할 + 사용자 등록에서 준 추가 역할 · 세일즈맨: 세일즈 */
export function viewsOf(me) {
  me = me || {}; const r = me.role || 'salesman', ex = Array.isArray(me.extra) ? me.extra : [];
  if (r === 'admin') return ['admin', 'owner', 'manager', 'salesman'];
  const v = [r]; ['manager', 'salesman'].forEach(x => { if (x !== r && (ex.includes(x) || (x === 'salesman' && r === 'owner' && me.sm)) && (x !== 'salesman' || me.sm)) v.push(x); });   // 오너는 세일즈맨 코드만 있으면 세일즈 모드도
  return r === 'salesman' ? ['salesman'] : v;
}
const VIEW_KEY = () => 'theone.view.' + ((S.user && S.user.email) || '');
export function can(cap) { if (S.role === 'admin' || S.role === 'owner') return true; if (S.role !== 'manager') return false; return jobCan(jobOf(), cap); }
/** 지금 화면의 일 — 담당자는 사용자 기록의 job (없으면 office), 그 외는 역할 그대로 */
export function jobOf() { if (S.role !== 'manager') return S.role; const j = S.me && S.me.job; return JOBS.some(x => x[0] === j) ? j : 'office'; }
export function jobLabel(j) { const x = JOBS.find(k => k[0] === j); return x ? x[1] + ' ' + x[2] : j; }
/* 홈 · 세일 · 인보이스 · 거래처는 모든 역할에 늘 고정 (예전 시험용 "주문 탭 보이기" 스위치는 없앰) */
function navFor(r) {
  const key = r === 'manager' ? jobOf() : r;
  let items = (NAV[key] || NAV.office).slice();
  if (r === 'salesman') items = items.filter(x => x[0] !== 'mine');   // 내 기록은 홈 안의 버튼으로
  if (!items.length) items = [['stores', '🏬', '거래처', 'Stores']];
  /* 🔁 모드 탭 — 여러 화면을 쓰는 사람(오너 겸 세일즈 등)은 아래 메뉴에서 바로 바꿈 */
  const vs = viewsOf(S.me || {}), base = (S.me && S.me.role) || r;
  if (base === 'admin') items.push(['view/menu', '🔁', '모드', 'Mode']);   // 관리자: 오너 · 담당자(일 선택) · 세일즈 모드 고르기 창
  else if (r !== 'salesman' && vs.includes('salesman')) items.push(['view/salesman', '🚗', '세일즈 모드', 'Sales mode']);
  else if (r === 'salesman' && base !== 'salesman' && vs.includes(base)) items.push(['view/' + base, base === 'owner' ? '🏭' : base === 'admin' ? '⚙️' : '🧑‍💼', base === 'owner' ? '경영 모드' : base === 'admin' ? '관리 모드' : '담당 모드', base === 'owner' ? 'Business' : base === 'admin' ? 'Admin' : 'Staff']);
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
  /* 창은 ✕ · 닫기 버튼으로만 닫힘 (바깥을 눌러도 안 닫힘 — 실수로 닫히는 것 방지, v0.8.115) */
  /* ⏳ 서버에서 읽는 동안 화면 맨 위에 진행 막대 (0.15초 넘게 걸릴 때만) */
  /* 처리 안 된 오류가 나도 화면이 막힌 채 남지 않게 — 동그라미를 풀고 알림 */
  window.addEventListener('unhandledrejection', e => { const r = e.reason, b = $('busy'); console.error(r); if (b && b.classList.contains('on')) { busy(false); toast('오류: ' + String((r && (r.code || r.message)) || r).slice(0, 120), 'bad'); } });
  window.addEventListener('error', e => { if (e.target && e.target !== window) return; busy(false); });
  /* 큰 버튼(저장 · 적용 · 보내기 …) 두 번 빨리 누르면 한 번만 — 같은 일이 겹쳐 돌다 화면이 꼬이는 것 막기 (수량 +/- 같은 작은 버튼은 그대로) */
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button.b-blue,button.b-red,button.b-green,button.b-amb,#nav button'); if (!b) return; const t = Date.now(); if (b._tap && t - b._tap < 450) { e.stopImmediatePropagation(); e.preventDefault(); return; } b._tap = t; }, true);
  let tbT = 0; window.addEventListener('dbbusy', e => { const n = e.detail, tb = $('topbar'); if (!tb) return; clearTimeout(tbT); if (n > 0) tbT = setTimeout(() => tb.classList.add('on'), 150); else tb.classList.remove('on'); });
  $('prtClose').onclick = printClose;
  $('hMenu').onclick = userMenu;
  /* 🌐 언어 — 앱 위쪽 버튼으로 바로 (이 폰 · 컴퓨터에 저장, 로그인한 사람과 상관없이) */
  $('hLang').onclick = () => { openModal('<h2 translate="no">🌐 Language · 언어 · Idioma</h2><div class="langpick" translate="no">' + LANGS.map(l => '<button class="' + (LANG === l[0] ? 'b-blue' : 'b-ghost') + '" data-lang="' + l[0] + '">' + ({ ko: '🇰🇷 ', en: '🇺🇸 ', pt: '🇧🇷 ' })[l[0]] + l[1] + '</button>').join('') + '</div>');
    document.querySelectorAll('#mbox [data-lang]').forEach(b => b.onclick = () => { closeModal(); if (b.dataset.lang !== LANG) setLang(b.dataset.lang); }); };
  $('hBack').onclick = () => Router.back();
  /* 🟢 온라인 · 🔴 오프라인 + 📤 아직 회사로 안 올라간 것 (주문 보낼 함 · 수금 등 폰 보관함) — 누르면 설명 · 지금 보내기 */
  const net = () => {
    const d = $('hNet'); if (!d) return;
    const off = navigator.onLine === false, n = Orders.outboxList().length, wait = n + (S.DB && S.DB.pending ? 1 : 0);
    d.className = 'netpill' + (off ? ' off' : '') + (wait ? ' wait' : '');
    d.innerHTML = '<i></i>' + (off ? bt('오프라인', 'Offline') : bt('온라인', 'Online')) + (wait ? ' · 📤' + (n || '') : '');
    document.body.classList.toggle('isoff', off);
  };
  window.addEventListener('online', net); window.addEventListener('offline', net); window.addEventListener('theone:net', net); net();
  $('hNet').onclick = () => {
    const off = navigator.onLine === false, n = Orders.outboxList().length, pend = S.DB && S.DB.pending;
    openModal('<h2>' + (off ? '🔴 ' + bt('오프라인', 'Offline') : '🟢 ' + bt('온라인', 'Online')) + '</h2><div class="muted" style="line-height:1.7">' +
      (off ? bt('인터넷이 안 됩니다. 주문 · 수금은 그대로 입력하세요 — 폰에 저장했다가 인터넷이 되면 자동으로 회사로 올라갑니다. 다시 입력하지 마세요.', 'No internet. Keep entering orders and payments — they are saved on this phone and upload automatically when online. Don\'t re-enter.') : bt('회사 서버와 연결되어 있습니다.', 'Connected to the company server.')) + '<br>' +
      (n ? '📤 ' + bt('아직 안 보낸 주문', 'Orders waiting to send') + ': <b>' + n + '</b><br>' : '') + (pend ? '📤 ' + bt('올라가는 중인 수금 · 기록이 있습니다', 'Payments / records still uploading') + '<br>' : '') +
      (!n && !pend ? '✅ ' + bt('폰에 남은 것 없음 — 모두 회사에 올라갔습니다', 'Nothing waiting — everything is uploaded') + '<br>' : '<b class="warn">' + bt('다 올라가기 전에는 로그아웃 · 앱 데이터 삭제를 하지 마세요.', 'Don\'t sign out or clear app data until everything is uploaded.') + '</b>') +
      '</div><div id="netOff" style="margin-top:8px"></div><div class="btns">' + (n && !off ? '<button class="b-blue" id="netSend">📤 ' + bt('지금 보내기', 'Send now') + '</button>' : '') + '<button class="b-ghost" id="netX">' + bt('닫기', 'Close') + '</button></div>');
    $('netX').onclick = closeModal; Offline.homeCard($('netOff'), false);
    if ($('netSend')) $('netSend').onclick = async () => { busy(true); await Orders.syncOutbox(false); busy(false); closeModal(); net(); };
  };
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
  $('page').innerHTML = '<div class="card login"><div class="logo">⏳</div><h1>등록 대기 <span class="en">Not registered yet</span></h1><p>' + esc(email) + ' 계정은 아직 앱에 등록되지 않았습니다.<br>관리자에게 등록을 요청해 주세요.<br><span class="en">This account is not registered. Please ask the administrator.</span></p>' +
    '<button class="b-ghost" id="btnOut">로그아웃 Sign out</button></div>';
  $('btnOut').onclick = () => S.AUTH.signOut();
}
function userMenu() {
  if (!S.user) return;
  const isAdm = S.me && S.me.role === 'admin';
  const vs = viewsOf(S.me), roles = vs.length > 1 ? vs : [];
  openMenu('<h2>' + esc(S.user.name || S.user.email) + '</h2><p class="muted">' + esc(S.user.email) + ' · ' + (S.role === 'manager' ? jobLabel(jobOf()) : roleLabel(S.role)) + ' · ' + VER + '</p>' +
    (roles.length ? '<div class="fg"><label>화면 바꾸기 <span class="en">Switch view</span></label><div class="seg">' + roles.map(r => '<button class="' + (S.role === r ? 'on' : '') + '" data-r="' + r + '">' + roleLabel(r) + '</button>').join('') + '</div>' +
      (S.role === 'manager' && isAdm ? '<div class="seg">' + JOBS.map(j => '<button class="' + (jobOf() === j[0] ? 'on' : '') + '" data-j="' + j[0] + '">' + j[1] + ' <span class="en">' + j[2] + '</span></button>').join('') + '</div>' : '') + '</div>' : '') +
    '<div class="fg"><label>🌐 언어 · Language · Idioma</label><div class="seg">' + LANGS.map(l => '<button class="' + (LANG === l[0] ? 'on' : '') + '" data-lang="' + l[0] + '" translate="no">' + l[1] + '</button>').join('') + '</div></div>' +
    '<div class="fg"><label>🔢 ' + bt('숫자 입력', 'Number entry') + '</label><div class="seg"><button class="' + (numPadOn() ? 'on' : '') + '" data-np="1">' + bt('팝업 패드 (작은 숫자판)', 'Popup pad') + '</button><button class="' + (numPadOn() ? '' : 'on') + '" data-np="0">' + bt('폰 키보드', 'Phone keyboard') + '</button></div></div>' +
    '<div class="btns"><button class="b-ghost" id="mOut">로그아웃 <span class="en">Sign out</span></button><button class="b-blue" id="mReload">새로고침 <span class="en">Reload</span></button></div>' +
    (isApp() ? '' : '<button class="b-blue b-sm" id="mInst" style="margin-top:10px">📲 ' + bt('앱으로 설치 (홈 화면)', 'Install as app') + '</button>') +
    '<button class="b-ghost b-sm" id="mDiag" style="margin-top:10px">🔎 연결 · 권한 점검 <span class="en">Check connection</span></button><div id="diagOut"></div>');
  $('mDiag').onclick = diag;
  document.querySelectorAll('#mbox [data-np]').forEach(b => b.onclick = () => { setNumPad(b.dataset.np === '1'); toast(b.dataset.np === '1' ? '🔢 ' + bt('숫자 칸을 누르면 팝업 패드가 뜹니다', 'Number fields open a pad') : '⌨ ' + bt('폰 키보드를 씁니다', 'Using the phone keyboard'), 'good'); userMenu(); });
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
  const sec = k => PERF[k] != null ? (PERF[k] / 1000).toFixed(1) + 's' : '—';
  const res = (performance.getEntriesByType('resource') || []).find(r => /app\.js/.test(r.name)), con = navigator.connection || {};
  const rows = ['앱 ' + VER + ' · 로그인 <b>' + esc(S.user.email) + '</b>',
    '⏱ 로딩: 로그인 확인 ' + sec('auth') + ' → 내 기록 ' + sec('me') + ' → 설정 · 세일즈맨 ' + sec('base') + ' → 거래처 ' + sec('acc') + ' → 첫 화면 <b>' + sec('first') + '</b>' + (res ? ' · app.js ' + (res.transferSize === 0 ? '폰 보관본' : Math.round(res.transferSize / 1024) + 'KB 내려받음') + ' ' + Math.round(res.duration) + 'ms' : '') + (con.effectiveType ? ' · 연결 ' + esc(con.effectiveType) + (con.downlink ? ' ' + con.downlink + 'Mb' : '') + (con.saveData ? ' · 데이터 절약' : '') : '') + ' · 서비스워커 ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? '켜짐' : '꺼짐'), '사용자 기록: 역할 ' + esc(String(me.role)) + ' · 활성 ' + esc(String(me.active)) + ' · 세일즈맨 코드 ' + esc(String(me.sm || '-')) + ' · 일 ' + esc(String(me.job || '-'))];
  const tests = [['사용자 (내 것)', () => S.DB.get('users', S.user.email)], ['설정', () => S.DB.get('settings', 'app')], ['세일즈맨', () => S.DB.list('salesmen', { limit: 1 })],
    ['거래처', () => S.DB.list('accounts', { limit: 1 })], ['아이템', () => S.DB.get('catalog', 'meta')], ['주문', () => S.DB.list('orders', S.role === 'salesman' ? { where: [['sm', '==', me.sm || '-']], limit: 1 } : { limit: 1 })]];
  /* 역할별로 화면이 실제로 읽는 자료 — 하나라도 ❌ 면 그 화면이 비거나 멈춤 (대개 Firestore 규칙 게시가 안 된 것) */
  const ym0 = today().substring(0, 7), smq = me.sm || '-';
  const STAFF = [['수금 entries', () => S.DB.list('entries', { where: [['ym', '==', ym0]], limit: 1 })], ['COD·카드 cod', () => S.DB.list('cod', { where: [['ym', '==', ym0]], limit: 1 })], ['미수금 ar', () => S.DB.list('ar', { limit: 1 })], ['인보이스 invoices', () => S.DB.list('invoices', { limit: 1 })],
    ['봉투 envelopes', () => S.DB.list('envelopes', { limit: 1 })], ['바운스 bounces', () => S.DB.list('bounces', { limit: 1 })], ['체크 요청 checkReq', () => S.DB.list('checkReq', { limit: 1 })], ['알림 notifyq', () => S.DB.list('notifyq', { limit: 1 })], ['사진 itemPhotos', () => S.DB.list('itemPhotos', { limit: 1 })], ['카운터 counters', () => S.DB.get('counters', 'inv2')], ['조회 요청 invReq', () => S.DB.list('invReq', { limit: 1 })]];
  const TOP = [['정산 settlements', () => S.DB.list('settlements', { limit: 1 })], ['공제 deductions', () => S.DB.list('deductions', { limit: 1 })], ['공장 factories', () => S.DB.list('factories', { limit: 1 })], ['공장 인보이스 factoryInvoices', () => S.DB.list('factoryInvoices', { limit: 1 })], ['공장 송금 factoryPayments', () => S.DB.list('factoryPayments', { limit: 1 })],
    ['1099 pay1099', () => S.DB.list('pay1099', { limit: 1 })], ['1099 대상 payees', () => S.DB.list('payees', { limit: 1 })], ['보너스 bonusAcc', () => S.DB.list('bonusAcc', { limit: 1 })], ['보너스 배분 bonusDist', () => S.DB.list('bonusDist', { limit: 1 })], ['매출 sales', () => S.DB.list('sales', { limit: 1 })], ['ACH ach', () => S.DB.list('ach', { limit: 1 })], ['사용자 전체 users', () => S.DB.list('users', { limit: 1 })]];
  const SALES = [['내 수금 entries', () => S.DB.list('entries', { where: [['sm', '==', smq]], limit: 1 })], ['내 미수금 ar', () => S.DB.get('ar', smq)], ['내 인보이스 invoices', () => S.DB.list('invoices', { where: [['sm', '==', smq]], limit: 1 })], ['내 봉투 envelopes', () => S.DB.list('envelopes', { where: [['sm', '==', smq]], limit: 1 })], ['내 바운스 bounces', () => S.DB.list('bounces', { where: [['sm', '==', smq]], limit: 1 })], ['내 체크 요청 checkReq', () => S.DB.list('checkReq', { where: [['sm', '==', smq]], limit: 1 })], ['사진 itemPhotos', () => S.DB.list('itemPhotos', { limit: 1 })]];
  const more = S.role === 'salesman' ? SALES : STAFF.concat(S.role === 'admin' || S.role === 'owner' ? TOP : []);
  let bad = 0;
  for (const [n, f] of tests.concat(more)) { try { await f(); rows.push('✅ ' + n); } catch (e) { bad++; rows.push('❌ <b>' + n + '</b> — ' + esc(e.code || e.message)); } }
  if (bad) rows.push('<br><b class="warn">❌ ' + bad + '개 자료를 읽지 못합니다.</b> 대개 Firestore 규칙이 최신으로 게시되지 않은 것입니다 — 관리자가 Firebase 콘솔 → Firestore → 규칙에 최신 firestore.rules 를 게시해 주세요. 역할이 틀렸으면 관리 → 사용자에서 역할을 확인하세요.');
  else rows.push('<br>✅ 이 역할의 화면이 읽는 자료를 모두 읽을 수 있습니다. 그래도 화면이 비면 새로고침(🔄) 하고, 계속되면 어느 메뉴인지 알려 주세요.');
  out.innerHTML = '<div class="sumbox" style="line-height:1.8">' + rows.join('<br>') + '</div>';
  /* 📊 자료 건수 — 서버에 실제로 뭐가 들어 있나 (관리자 · 담당자) */
  if (S.role === 'salesman') return;
  const d1 = new Date(); d1.setMonth(d1.getMonth() - 1); const ym1 = d1.getFullYear() + '-' + String(d1.getMonth() + 1).padStart(2, '0');
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
export function roleLabel(r) { return { owner: '오너 Owner', admin: '관리자 Admin', manager: '담당자 Staff', salesman: '세일즈맨 Salesman' }[r] || r; }

function switchRole(r) {
  if (!viewsOf(S.me).includes(r)) return;
  S.role = r; try { localStorage.setItem(VIEW_KEY(), r); } catch (e) {}
  Router.stack = [];   // 새 역할의 첫 화면이 뒤로가기의 끝
  paintNav(); Notify.start();
  Router.go(navFor(r)[0][0]);
}
/* 아래 메뉴의 실제 높이를 CSS 변수로 — 고정 바(.sticky) 와 본문 여백이 메뉴에 가리지 않게 */
function navH() {
  const n = $('nav'), cs = n && getComputedStyle(n);
  if (cs && cs.display === 'none') return;   // 키보드 모드(body.kb)로 숨긴 동안 재면 0 이 되어 키보드가 내려간 뒤 고정 바가 메뉴를 덮음 — 그때는 지난 값 유지
  let h = cs && cs.position === 'fixed' && cs.flexDirection !== 'column' ? n.offsetHeight : 0;   // 넓은 화면의 왼쪽 세로 메뉴는 0 (아래 여백 없음)
  if (h > 140) h = 140;   // 잘못 잰 큰 값(세로 메뉴 · 겹침)으로 고정 바가 공중에 뜨지 않게
  document.documentElement.style.setProperty('--navh', h + 'px');
  const pg = $('page'); if (pg && pg.clientWidth) document.documentElement.style.setProperty('--cw', pg.clientWidth + 'px');   /* 📐 본문 너비 — 타일 칸 수는 화면이 아니라 본문 너비로 (왼쪽 메뉴가 있는 컴퓨터에서도 줄지 않게) */ const hd = document.querySelector('header'); if (hd) document.documentElement.style.setProperty('--hdr', hd.offsetHeight + 'px'); }
window.addEventListener('resize', () => setTimeout(navH, 50));
/* 위 고정 메뉴(주문 상태 아이콘) 작게 · 크게 — 버튼으로만 (스크롤에 따라 저절로 접고 펴면 메뉴 높이가 바뀌어 아이폰에서 목록이 튕김) */
try { if (localStorage.getItem('theone.ocompact') === '1') document.body.classList.add('oscr'); } catch (e) {}
function paintNav() {
  const items = navFor(S.role);
  Router.home = items.length ? items[0][0] : '';
  $('nav').innerHTML = items.map(x => '<button data-go="' + x[0] + '"><span class="i">' + x[1] + '</span>' + x[2] + '<span class="en">' + (x[3] || '') + '</span></button>').join('');
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { const g = b.dataset.go, [r, a] = g.split('/'); if (g === 'view/menu') return userMenu(); Router.navTap = r; if (location.hash === '#/' + g) { const f = Router.routes[r]; if (f) f(a || ''); } else if (a) Router.go(r, a); else Router.go(g); });   // 같은 탭을 다시 누르면 그 탭 첫 화면
  /* 🗂 묶음 안의 화면 — ‹ 뒤로 · 폰 뒤로가기는 그 묶음으로, 아래 메뉴도 그 묶음이 켜짐 */
  Router.parent = {}; items.filter(x => /^hub\//.test(x[0])).forEach(x => Hub.hubItems(x[0].split('/')[1]).forEach(c => { const r = c[0].split('/')[0]; if (!items.some(y => y[0] === c[0] || y[0] === r)) Router.parent[r] = x[0]; }));
  navH();
  $('hWho').textContent = S.me && S.me.sm && S.role === 'salesman' ? S.me.sm : (S.me && S.me.sm ? S.me.sm + ' · ' : '') + (S.role === 'manager' ? (JOBS.find(j => j[0] === jobOf()) || ['', ''])[1] : roleLabel(S.role).split(' ')[0]);
  const multi = viewsOf(S.me).length > 1, hw = $('hWho'); if (hw) { if (multi) hw.textContent += ' ▾'; hw.style.cursor = multi ? 'pointer' : ''; hw.onclick = multi ? userMenu : null; }   // 여러 화면 쓰는 사람은 이름을 눌러 바로 바꿈
}

/* ⏱ 로딩 시간 기록 — 🔎 연결 · 권한 점검에 보임 (어느 단계가 느린지) */
const PERF = { t0: performance.now() };
const mark = k => { PERF[k] = Math.round(performance.now()); };
/* ⚡ 빠른 시작 — 지난번에 받은 내 기록 · 설정 · 세일즈맨을 폰에 두고(theone.boot.<email>) 켤 때 바로 씀 → 서버 왕복 2번을 기다리지 않음.
 *   서버에서 새로 받은 것은 뒤에서 확인해 바뀐 것만 반영 (역할 · 일 · 거래처 버전 · 비활성) */
const BOOT_KEY = e => 'theone.boot.' + String(e || '').toLowerCase();
const bootSave = (email, me, sms, st) => { try { localStorage.setItem(BOOT_KEY(email), JSON.stringify({ me, sms, settings: st, at: Date.now() })); } catch (e) {} };
const bootLoad = email => { try { const j = JSON.parse(localStorage.getItem(BOOT_KEY(email)) || 'null'); return j && j.me && j.me.active !== false && Array.isArray(j.sms) && j.settings ? j : null; } catch (e) { return null; } };
function applyBase(sms, st) { S.sms = sms || []; S.smByCode = {}; S.sms.forEach(x => { S.smByCode[x.code] = x; }); S.settings = st || {}; setInvTypeMap(invTypes(S)); }
async function afterLogin(user) {
  mark('auth'); S.user = user;
  const email = user.email, snap = bootLoad(email);
  const meP = S.DB.get('users', email);
  let me = null;
  if (snap) me = snap.me;
  else {
    try { me = await meP; } catch (e) { loginScreen('데이터베이스를 읽지 못했습니다 (' + (e.code || e.message) + ')'); return; }
    if (!me && ADMIN_EMAILS.includes(email)) {
      me = { id: email, email, name: user.name, role: 'admin', active: true, createdAt: today() };
      try { await S.DB.set('users', email, me); } catch (e) { loginScreen('관리자 기록을 만들지 못했습니다: ' + e.message); return; }
    }
    if (!me || me.active === false) { waitScreen(email); return; }
    /* 옛 버전이 만든 관리자 기록에 active 가 없으면 규칙의 "등록된 사용자" 검사에 걸림 → 채워 둠 */
    if (ADMIN_EMAILS.includes(email) && (me.active !== true || me.role !== 'admin')) {
      try { await S.DB.update('users', email, { active: true, role: 'admin' }); me.active = true; me.role = 'admin'; } catch (e) {}
    }
  }
  mark('me'); S.me = me; S.role = me.role || 'salesman';
  /* 여러 화면을 쓰는 사람 (관리자 · 추가 역할) — 이 폰에서 마지막으로 본 화면으로 */
  try { const v = localStorage.getItem(VIEW_KEY()); if (v && viewsOf(me).includes(v)) S.role = v; } catch (e) {}
  const baseP = Promise.all([S.DB.list('salesmen', { order: ['code', 'asc'] }), S.DB.get('settings', 'app')]);
  if (snap) {
    applyBase(snap.sms, snap.settings); mark('base');
    try { S.accounts = await loadAccounts(S); } catch (e) { S.accounts = []; S.accounts.byCode = {}; } mark('acc');
  } else {
    busy(true);
    try { const [sms, st] = await baseP; applyBase(sms, st); mark('base'); S.accounts = await loadAccounts(S); mark('acc'); bootSave(email, me, sms, st); }
    catch (e) { toast('기본 자료를 읽지 못했습니다: ' + (e.code || e.message), 'bad'); }
    busy(false);
  }
  paintNav();
  setTimeout(() => Notify.start(), snap ? 1500 : 0);   // 🔔 확인 요청 · 주문 문제 실시간 알림 (빠른 시작이면 첫 화면 뒤에)
  const valid = navFor(S.role).some(x => location.hash.indexOf('#/' + x[0]) === 0) || location.hash.indexOf('#/entry') === 0 || location.hash.indexOf('#/mine') === 0 || location.hash.indexOf('#/hist') === 0 || location.hash.indexOf('#/find') === 0 || location.hash.indexOf('#/items') === 0 || location.hash.indexOf('#/cat') === 0 || location.hash.indexOf('#/track') === 0 || location.hash.indexOf('#/stores') === 0 || location.hash.indexOf('#/reports') === 0 || location.hash.indexOf('#/arup') === 0;
  if (!valid) goHash('#/' + navFor(S.role)[0][0]);
  Router.stack = [];
  if (!ROUTER_ON) { ROUTER_ON = true; Router.start(); } else Router.start();
  /* 빠른 시작이었으면 — 서버 것과 비교해 바뀐 것만 반영 */
  if (snap) {
    Promise.all([meP, baseP]).then(async ([m2, [sms2, st2]]) => {
      if (!m2 || m2.active === false) { waitScreen(email); return; }
      bootSave(email, m2, sms2, st2);
      const roleChg = m2.role !== snap.me.role || (m2.job || '') !== (snap.me.job || '') || (m2.sm || '') !== (snap.me.sm || '') || JSON.stringify(m2.views || m2.extra || null) !== JSON.stringify(snap.me.views || snap.me.extra || null);
      const accChg = String((st2 || {}).accountsVer || '0') !== String((snap.settings || {}).accountsVer || '0');
      S.me = m2; applyBase(sms2, st2);
      if (accChg) { try { S.accounts = await loadAccounts(S); } catch (e) {} }
      if (roleChg) { if (!viewsOf(m2).includes(S.role)) S.role = m2.role || 'salesman'; paintNav(); const f = Router.routes[Router.cur]; if (f) f(location.hash.replace(/^#\/?/, '').split('/')[1] || ''); }
    }).catch(() => { /* 인터넷 없음 — 폰에 있는 것으로 계속 */ });
  }
  setTimeout(() => { const poll = setInterval(() => { const p = $('page'); if (p && p.textContent.length > 120 && !/읽는 중|Loading/.test(p.textContent.slice(0, 60))) { mark('first'); clearInterval(poll); } }, 200); setTimeout(() => clearInterval(poll), 30000); }, 0);
}
let ROUTER_ON = false;
/* 🔒 자동 로그아웃 — 설정 idleMin(분) 동안 아무 조작이 없으면 로그아웃 (폰을 잃어버렸을 때 대비) */
let LAST_ACT = Date.now();
['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, () => { LAST_ACT = Date.now(); }, { passive: true }));
setInterval(() => { const m = Number(S && S.settings && S.settings.idleMin) || 0; if (m > 0 && S && S.user && Date.now() - LAST_ACT > m * 60000) { S.AUTH.signOut(); toast('🔒 ' + m + '분 동안 사용하지 않아 로그아웃했습니다 · Signed out after inactivity'); } }, 30000);

/* 🔄 새 버전 확인 — 폰에 저장된 옛 화면을 계속 쓰지 않게: 켤 때 · 다시 화면에 나올 때 · 30분마다 서버의 index.html 버전과 비교
 *    다르면 위에 띠 → 누르면 새 화면을 받아 다시 엶 (입력 중이던 주문은 flushWip 로 남음) */
let UPD_AT = 0;
async function checkUpdate() {
  if ((MOCK && !window.__UPD_TEST__) || Date.now() - UPD_AT < 60000 || document.getElementById('updBar')) return;
  UPD_AT = Date.now();
  try {
    const t = await (await fetch('index.html?u=' + Date.now(), { cache: 'no-store' })).text();
    const m = t.match(/app\.js\?v=([\d.]+)/); if (!m || 'v' + m[1] === VER) return;
    const b = document.createElement('button'); b.id = 'updBar'; b.className = 'updbar';
    b.innerHTML = '🔄 ' + bt('새 버전이 있습니다', 'New version available') + ' (v' + esc(m[1]) + ') — <u>' + bt('눌러서 업데이트', 'tap to update') + '</u>';
    /* 새 index.html · 앱 파일을 인터넷에서 받아 보관(서비스 워커가 reload 요청은 인터넷 먼저) → 새 서비스 워커가 있으면 자리 잡을 때까지(최대 4초) 기다린 뒤 다시 엶 — 전에는 보관본을 그대로 다시 열어 띠가 계속 남았음 */
    b.onclick = async () => { b.textContent = '🔄 …'; try { await fetch('index.html', { cache: 'reload' }); await fetch('./', { cache: 'reload' }); const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (r) { await r.update(); if (r.installing || r.waiting) await new Promise(res => { const t = setTimeout(res, 4000); navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); res(); }, { once: true }); }); } } catch (e) {} location.reload(); };
    document.body.appendChild(b);
  } catch (e) { /* 인터넷 없음 — 다음에 */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
setInterval(checkUpdate, 30 * 60000);

async function boot() {
  shell();
  setTimeout(checkUpdate, 4000);
  const [{ DB, AUTH }] = await Promise.all([connect(), initLang(VER)]);
  S.DB = DB; S.AUTH = AUTH;
  Router.on('view', a => switchRole(a));   /* 아래 메뉴 🚗 세일즈 모드 · 🏭 경영 모드 */
  Sales.register(S); NewAcct.register(S); Notify.register(S); Photos.register(S); Envelope.register(S); Credit.register(S); Bounce.register(S); Offline.register(S); OwnHome.register(S); Bank.register(S); Stock.register(S); Hub.register(S); MySales.register(S); Collect.register(S); Ach.register(S); Mgr.register(S); Boss.register(S); Mg.register(S); Admin.register(S); Orders.register(S); Items.register(S); CatPage.register(S); Track.register(S); Reports.register(S); Flow.register(S); Access.register(S); Invlook.register(S);
  Router.on('', () => {});
  AUTH.onChange(u => {
    if (!u) { S.user = null; S.me = null; loginScreen(''); return; }
    afterLogin(u);
  });
}
boot();
