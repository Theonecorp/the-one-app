/* ============================================================
 *  THE ONE 앱 — 진입점: 로그인 → 역할 → 메뉴
 * ============================================================ */
import { connect, MOCK, newId } from './db.js';
import { $, esc, toast, busy, Router, openModal, closeModal, printClose, printPdf, printFit, canShareFile, shareFile, today, bt, bi, numPadOn, setNumPad, goHash, debounce, money, HIDE_VAL, setHideVal, initHideVal } from './ui.js';
import { openScanner } from './scan.js';
import * as Msg from './msg.js';
import { searchAccounts } from './accounts.js';
import { loadCatalog, catalog, exactItem, searchItems, thumb } from './catalog.js';
import { storeSheet, invDetail } from './store.js';
import { CSS } from './style.js';
import * as Sales from './sales.js';
import * as Plan from './plan.js';   // 🧮 발주 계획
import * as Collect from './collect.js';
import * as Ach from './ach.js';
import * as BizDay from './bizday.js';
import * as Inbound from './inbound.js';
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
import * as Balcao from './balcao.js';
import * as ShipHist from './shiphist.js';
import * as NotesUps from './notesups.js';
import * as Inserts from './inserts.js';
import * as Estoque from './estoque.js';
import * as Etiquetas from './etiquetas.js';
import * as Produtos from './produtos.js';
import * as Recebidos from './recebidos.js';
import * as Repor from './repor.js';
import * as Reports from './reports.js';
import * as Flow from './flow.js';
import * as Invlook from './invlook.js';
import * as Access from './access.js';
import * as Labels from './labels.js';
import * as Displays from './displays.js';
import * as Push from './push.js';
import { loadAccounts } from './accounts.js';
import { setReqKinds } from './reqs.js';
import { setInvTypeMap } from './comm.js';
import { invTypes } from './invoicing.js';
import { initLang, LANG, LANGS, setLang } from './i18n.js';

import { icon, routeIcon, stageIcon } from './icons.js';
import { VER } from './ver.js';   // 🔢 버전은 src/ver.js (tools/version.js 가 올림)
export { VER };
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
  catalog:  [['catmg', '🏠', '홈', 'Home'], ['items', '🏷', '아이템', 'Items'], ['photos', '📷', '사진', 'Photos'], ['labels', '🖨', '라벨', 'Labels'], ['cat', '📒', '카탈로그', 'Catalog'], STORES],   // v0.8.219: 디자인도 🏬 거래처 (관리자 2026-11-13)
  /* 🏷 아이템 · 재고 관리 (v0.8.169) — 아이템 등록 · 분류 · 사진 · 세트 · 올리기 + 📦 재고 · 위치. 주문 흐름 · 수금 · 정산 · 경영은 안 봄 */
  /* 오너 · 관리자 (v0.8.135) — 🏠 홈(대시보드) · 📚 조회(인보이스 · 거래처 · 배송 · 카탈로그) · 💼 경영(매출 · 경영 · 정산 · 미수금 · 수금 현황 · 리포트) · (관리자) 📦 재고 · ⚙️ 관리 */
  owner:    [['own', '🏠', '홈', 'Home'], HUB_LOOK, HUB_BIZ, HUB_WH],   // v0.8.219: 오너도 📦 재고 (관리자 2026-11-13)   // 오너: 경영 숫자만 (세일 · 인보이스 · 거래처는 🚗 세일즈 모드에서) · 홈 = 경영 대시보드
  admin:    [['own', '🏠', '홈', 'Home'], HUB_LOOK, HUB_BIZ, HUB_WH, ['admin', '⚙️', '관리', 'Admin']]   // 관리자: 오너와 같은 대시보드 + 정산 · 관리 · 🔁 모드(오너 · 담당자 · 세일즈) — 미수금 · 수금은 홈 칸에서
};
NAV.manager = NAV.office;
/* 담당자(manager)의 일 — 메뉴 · 버튼이 달라짐. 데이터 권한(Firestore 규칙)은 담당자 모두 같음, 관리자는 전부 */
/* 👥 담당자 일 5가지 (v0.8.217 · 2026-11-13 관리자): 오피스 매니저 · 회계 · 창고 매니저 · 출고 · 인보이스 담당 · 디자인
 *   예전 '인보이스 담당(invoice)' · '창고 직원(pick)' 은 '출고 · 인보이스 담당(pickinv)' 하나로 — 사용자 문서는 그대로 두고 앱 · 규칙이 같은 일로 봄 (JOB_ALIAS) */
export const JOBS = [['office', '오피스 매니저', 'Office Manager'], ['acct', '회계 담당', 'Accounting'], ['whmgr', '창고 매니저', 'Warehouse Manager'], ['pickinv', '출고 · 인보이스 담당', 'Fulfillment & Invoicing'], ['catalog', '디자인', 'Design']];
export const JOB_ALIAS = { invoice: 'pickinv', pick: 'pickinv' };
const jobNorm = j => JOB_ALIAS[j] || j;
/** 일별 할 수 있는 것 — flow 🧭 전체 주문 흐름 감독 · newOrder 주문 만들기 · invoice 인보이스 발행 · 주문 수정/취소 · 가게 바꾸기 · assign 작업 배정 · pick 피킹 입력 · ship 포장 · 출고(UPS)
 *  · verify 수금 확인 · cod COD·카드 · ach ACH · items 아이템 · 재고 위치 · bo 백오더 */
export const CAN = {
  office:  ['flow', 'newOrder', 'invoice', 'void', 'assign', 'pick', 'ship', 'verify', 'cod', 'ach', 'items', 'bo', 'crApply'],   // crApply: ↩ 크레딧을 인보이스에 바로 적용 (오피스 매니저 · 관리자 · 오너만, v0.8.179)
  acct:    ['verify', 'cod', 'ach', 'invLookup'],
  pickinv: ['flow', 'newOrder', 'invoice', 'void', 'assign', 'pick', 'ship', 'items', 'bo'],   // v0.8.164: 출고 · 인보이스 담당도 주문 넣기
  invoice: ['newOrder', 'invoice', 'void', 'items', 'bo'],
  whmgr:   ['flow', 'assign', 'pick', 'ship', 'items', 'bo'],
  pick:    ['pick', 'ship', 'items'],
  catalog: ['items', 'catalog']   // 🎨 디자인 · 카탈로그 담당: 아이템 · 분류 · 사진 · 세트 · 바코드 (주문 · 수금은 안 봄)
};
export const jobCan = (job, cap) => (CAN[job] || CAN.office).includes(cap);
/** 지금 사용자가 이걸 할 수 있나 — 관리자는 전부, 세일즈맨은 없음 */
/** 관리자급 — 관리자 · 오너 (데이터는 둘 다 전부, 화면은 오너가 현황 · 경영 위주) */
export const isTop = () => S.role === 'admin' || S.role === 'owner';
/** 🔒 오너급 — 경영 · 현금 흐름 · 페이먼트(정산 · 공장 송금 · 은행 · 1099 · 보너스) 자료 (v0.8.217 · 2026-11-13 관리자: "직원에게 노출되면 안 되는 자료는 오너만 · 나도 관리자이면서 오너")
 *   지금 보는 화면(모드)과 상관없이 사람 기준: 오너 · 관리자(오너 겸) — 담당자 모드로 바꿔 봐도 관리자 본인은 열림 */
export const isOwner = () => !!S.me && (S.me.role === 'owner' || S.me.role === 'admin' || S.me.owner === true || ADMIN_EMAILS.includes(String((S.user && S.user.email) || '').toLowerCase()));
/** 이 사람이 볼 수 있는 화면 — 관리자: 전부 (관리 · 오너 · 담당 · 세일즈) · 오너 / 담당자: 자기 역할 + 사용자 등록에서 준 추가 역할 · 세일즈맨: 세일즈 */
export function viewsOf(me) {
  me = me || {}; const r = me.role || 'salesman', ex = Array.isArray(me.extra) ? me.extra : [];
  if (r === 'admin') return ['admin', 'owner', 'manager', 'salesman'];
  const v = [r]; ['manager', 'salesman'].forEach(x => { if (x !== r && (ex.includes(x) || (x === 'salesman' && r === 'owner' && me.sm)) && (x !== 'salesman' || me.sm)) v.push(x); });   // 오너는 세일즈맨 코드만 있으면 세일즈 모드도
  return r === 'salesman' ? ['salesman'] : v;
}
const VIEW_KEY = () => 'theone.view.' + ((S.user && S.user.email) || '');
export function can(cap) { if (S.role === 'admin' || S.role === 'owner') return true; if (S.role !== 'manager') return false; return myJobs().some(j => jobCan(j, cap)); }
/** 지금 화면의 일 — 담당자는 사용자 기록의 job (없으면 office), 그 외는 역할 그대로 */
export function jobOf() { if (S.role !== 'manager') return S.role; const j = jobNorm(S.me && S.me.job); return JOBS.some(x => x[0] === j) ? j : 'office'; }
export function jobLabel(j) { const x = JOBS.find(k => k[0] === jobNorm(j)); return x ? x[1] + ' ' + x[2] : j; }
/** 👥 한 사람의 일 전부 — 주된 일(users.job) + 같이 하는 일(users.job2 — 2026-11-12 관리자: "한 사람에게 일 두 개", 예: 창고 직원 + 출고 · 인보이스). 권한 · 메뉴 · 칩은 이것을 합쳐서 봄 */
export function myJobs() { if (S.role !== 'manager') return [S.role]; const p = jobOf(), ex = (S.me && Array.isArray(S.me.job2) ? S.me.job2 : []).map(jobNorm).filter(j => j !== p && JOBS.some(x => x[0] === j)); return [p].concat(ex.filter((j, i) => ex.indexOf(j) === i)); }
/* 홈 · 세일 · 인보이스 · 거래처는 모든 역할에 늘 고정 (예전 시험용 "주문 탭 보이기" 스위치는 없앰) */
function navFor(r) {
  const key = r === 'manager' ? jobOf() : r;
  let items = (NAV[key] || NAV.office).slice();
  if (r === 'manager') myJobs().slice(1).forEach(j => (NAV[j] || []).forEach(x => { if (!items.some(y => y[0] === x[0])) items.push(x); }));   // 👥 같이 하는 일의 메뉴도 (겹치는 것은 한 번)
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
    '<header><button class="hb" id="hBack" title="뒤로">' + icon('chevLeft', 22) + '</button><img src="logo-96.png" alt="" class="hlogo"><h1 id="hTitle">THE ONE</h1><div class="hr"><button class="hb hsearch" id="hSearch" title="검색 · Search">' + icon('search', 18) + '<span class="hsl">' + bt('가게 · 아이템 · 바코드 · 인보이스 검색', 'Search store, item, barcode or invoice') + '</span><kbd>⌘K</kbd></button><span id="hNet" title="인터넷 연결"></span><span id="hWho"></span><button class="hb" id="hScan" title="바코드 스캔 · Scan">' + icon('scan', 19) + '</button><button class="hb heye" id="hEye" type="button"></button><button class="hb" id="hBell" title="알림 · 메시지">' + icon('bell', 19) + '</button><button class="hb hlang" id="hLang" translate="no" title="Language">' + icon('globe', 16) + ' ' + LANG.toUpperCase() + '</button><button class="hb" id="hMenu" title="메뉴">' + icon('menu', 20) + '</button></div></header>' +
    '<div class="wrap" id="page"><div class="load">불러오는 중…</div></div>' +
    '<nav id="nav"></nav>' +
    '<div id="busy"><div class="spin"></div></div><div id="topbar"></div>' +
    '<div id="toast"></div>' +
    '<div id="modal"><div class="box" id="mbox"></div></div>' +
    '<div id="prt"><div id="prtbar"><button id="prtGo">🖨 ' + bt('인쇄', 'Print') + '</button><button id="prtPdf">📄 ' + bt('PDF 저장', 'Save PDF') + '</button><button id="prtShare" hidden>📤 ' + bt('PDF 보내기', 'Send PDF') + '</button><button id="prtClose">' + bt('닫기', 'Close') + '</button></div><div id="prtbody"></div></div>';
  /* 창은 ✕ · 닫기 버튼으로만 닫힘 (바깥을 눌러도 안 닫힘 — 실수로 닫히는 것 방지, v0.8.115) */
  /* ⏳ 서버에서 읽는 동안 화면 맨 위에 진행 막대 (0.15초 넘게 걸릴 때만) */
  /* 처리 안 된 오류가 나도 화면이 막힌 채 남지 않게 — 동그라미를 풀고 알림 */
  window.addEventListener('unhandledrejection', e => { const r = e.reason, b = $('busy'); console.error(r); if (b && b.classList.contains('on')) { busy(false); toast('오류: ' + String((r && (r.code || r.message)) || r).slice(0, 120), 'bad'); } });
  window.addEventListener('error', e => { if (e.target && e.target !== window) return; busy(false); });
  /* 큰 버튼(저장 · 적용 · 보내기 …) 두 번 빨리 누르면 한 번만 — 같은 일이 겹쳐 돌다 화면이 꼬이는 것 막기 (수량 +/- 같은 작은 버튼은 그대로) */
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button.b-blue,button.b-red,button.b-green,button.b-amb,#nav button'); if (!b) return; const t = Date.now(); if (b._tap && t - b._tap < 450) { e.stopImmediatePropagation(); e.preventDefault(); return; } b._tap = t; }, true);
  let tbT = 0; window.addEventListener('dbbusy', e => { const n = e.detail, tb = $('topbar'); if (!tb) return; clearTimeout(tbT); if (n > 0) tbT = setTimeout(() => tb.classList.add('on'), 150); else tb.classList.remove('on'); });
  $('prtClose').onclick = printClose; $('prtGo').onclick = () => window.print();
  /* 📄 PDF 저장 — 세일즈맨도 폰에서 인보이스 · 스테이트먼트를 파일로 (v0.8.223) */
  /* 📤 PDF 보내기 — 문자 · 메일 · 다른 앱으로 인보이스 PDF 파일만 (앱 주소는 같이 안 감 · 파일 공유가 되는 폰 · 태블릿에서만 보임) */
  if (canShareFile()) { $('prtShare').hidden = false; $('prtShare').onclick = async () => { let f = null; busy(true); try { f = await printPdf('file'); } catch (e) { toast(bt('PDF 실패', 'PDF failed') + ': ' + (e.message || e), 'bad'); } busy(false); if (f) { try { await shareFile(f); } catch (e) { toast(bt('보내기 실패', 'Send failed') + ': ' + (e.message || e), 'bad'); } } }; }
  $('prtPdf').onclick = async () => { busy(true); try { const n = await printPdf(); toast('📄 ' + n, 'good'); } catch (e) { toast(bt('PDF 실패', 'PDF failed') + ': ' + (e.message || e), 'bad'); } busy(false); };
  window.addEventListener('resize', () => { if ($('prt') && $('prt').classList.contains('on')) printFit(); });
  paintEye(); $('hEye').onclick = () => { setHideVal(!HIDE_VAL); paintEye(); toast(HIDE_VAL ? bt('금액 숨김', 'Amounts hidden') : bt('금액 표시됨', 'Amounts visible')); }; initHideVal();
  $('hMenu').onclick = userMenu; $('hSearch').onclick = () => globalSearch(); $('hScan').onclick = headerScan; $('hBell').onclick = () => Msg.openPanel();
  /* ⌘K · Ctrl+K — 어디서나 검색 (컴퓨터) */
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key).toLowerCase() === 'k' && S.user) { e.preventDefault(); if (!$('gsQ')) globalSearch(); } });
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
  NET_PAINT = net; window.addEventListener('online', net); window.addEventListener('offline', net); window.addEventListener('theone:net', net); net();
  window.addEventListener('theone:slow', () => toast('🐢 ' + bt('연결이 느려 폰에 저장된 자료를 먼저 보여줍니다', 'Slow connection — showing data saved on this phone first'), 'warn'));
  $('hNet').onclick = netSheet;
}
/** 📡 연결 · 보낼 함 창 — 위 알약(넓은 화면)과 ☰ 서랍 메뉴(폰에서는 알약이 숨겨짐)에서 염 */
let NET_PAINT = null;
export function netSheet() {
  { const net = () => { if (NET_PAINT) NET_PAINT(); };
    const off = navigator.onLine === false, n = Orders.outboxList().length, pend = S.DB && S.DB.pending;
    openModal('<h2>' + (off ? '🔴 ' + bt('오프라인', 'Offline') : '🟢 ' + bt('온라인', 'Online')) + '</h2><div class="muted" style="line-height:1.7">' +
      (off ? bt('인터넷이 안 됩니다. 주문 · 수금은 그대로 입력하세요 — 폰에 저장했다가 인터넷이 되면 자동으로 회사로 올라갑니다. 다시 입력하지 마세요.', 'No internet. Keep entering orders and payments — they are saved on this phone and upload automatically when online. Don\'t re-enter.') : bt('회사 서버와 연결되어 있습니다.', 'Connected to the company server.')) + '<br>' +
      (n ? '📤 ' + bt('아직 안 보낸 주문', 'Orders waiting to send') + ': <b>' + n + '</b><br>' : '') + (pend ? '📤 ' + bt('올라가는 중인 수금 · 기록이 있습니다', 'Payments / records still uploading') + '<br>' : '') +
      (!n && !pend ? '✅ ' + bt('폰에 남은 것 없음 — 모두 회사에 올라갔습니다', 'Nothing waiting — everything is uploaded') + '<br>' : '<b class="warn">' + bt('다 올라가기 전에는 로그아웃 · 앱 데이터 삭제를 하지 마세요.', 'Don\'t sign out or clear app data until everything is uploaded.') + '</b>') +
      '</div><div id="netOff" style="margin-top:8px"></div><div class="btns">' + (n && !off ? '<button class="b-blue" id="netSend">📤 ' + bt('지금 보내기', 'Send now') + '</button>' : '') + '<button class="b-ghost" id="netX">' + bt('닫기', 'Close') + '</button></div>');
    $('netX').onclick = closeModal; Offline.homeCard($('netOff'), false);
    if ($('netSend')) $('netSend').onclick = async () => { busy(true); await Orders.syncOutbox(false); busy(false); closeModal(); net(); };
  }
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
  $('btnOut').onclick = () => { Push.disable().finally(() => S.AUTH.signOut()); };   // 로그아웃 → 이 기기 팝업 등록도 지움
}
/* ☰ 서랍 메뉴 — 왼쪽에서 밀려 나오는 메뉴 (회사 · 역할별 묶음 화면 · 설정 · 사용자 · 언어). 아래 메뉴 "모드" · 헤더 ☰ · 이름 누르기 모두 여기로 */
/* 🧭 ☰ 서랍 — 폰 · 태블릿은 팝업, 데스크탑(1200px 이상)은 왼쪽에 고정(dock · 본문이 그만큼 오른쪽으로). ☰ 는 데스크탑에서 고정 켜기 · 끄기 (이 컴퓨터에 기억)
 *   서랍 내용은 한 곳(drawerRender)에서 만들고, 고정 상태에서는 닫기(close)가 아무것도 안 함 · 주소가 바뀌면 켜진 줄만 다시 칠함 (v0.8.175) */
/** 👁 머리띠의 금액 숨기기 단추 (옛 WMS btnOcultarValores) */
function paintEye() { const b = $('hEye'); if (!b) return; b.innerHTML = icon(HIDE_VAL ? 'eyeOff' : 'eye', 19); b.title = HIDE_VAL ? bt('금액 표시', 'Show amounts') : bt('금액 숨기기', 'Hide amounts'); b.setAttribute('aria-pressed', HIDE_VAL ? 'true' : 'false'); b.classList.toggle('on', HIDE_VAL); }
const DOCK_MQ = '(min-width:1200px)';
/* 🧭 서랍 묶음 (v0.8.203) — [키, 아이콘, 한글, 영어, 화면 주소들]. 여기에 없는 화면은 "기타" 묶음으로 (지우지 않음) */
/* 🧭 v0.8.214 — 옛 WMS 의 왼쪽 메뉴와 같은 묶음 · 같은 순서 (2026-11-13 창고 매니저 요청: "옛 시스템처럼 카테고리를 나눠서")
 *   메인 · 영업 · 피킹 · 출고 · 인서트 · 조회 · 재고 · 주문 · 재무 · 관리 — 묶음 이름은 옛 앱의 KR / EN / PT 그대로 (PT 는 i18n.json)
 *   묶음 안의 순서도 이 목록 순서 (옛 메뉴 순서 → 새 앱에만 있는 화면). 옛 앱에 없던 화면은 가장 가까운 묶음에 · 그래도 없으면 "기타" (빠지는 화면 없음) */
/* 👥 역할별 왼쪽 메뉴 묶음 (v0.8.219 · 2026-11-13 관리자)
 *   관리자: 전부 (관리 포함) · 오너: 메인 · 거래처 · 조회 · 재무 · 재고 · 관리(관리자 화면 빼고)
 *   오피스 매니저 · 창고 매니저 · 출고 · 인보이스: 메인 · 영업 · 피킹(주문 칸 · 완료 · 조회 포함) · 출고 · 인서트 · 조회 · 인보이스
 *   회계: 메인 · 재무(인보이스 포함) · 거래처 · 디자인: 메인 · 아이템 · 거래처 · 카탈로그
 *   ※ 메뉴는 보기 편하게 하는 것 — 중요 자료 잠금은 firestore.rules(isOwner) 와 아래 경영 화면 잠금(lockR)이 함 */
export const DPLAN = {
  owner: ['ov', 'sales:stores', 'look', 'ship:shiphist', 'fin', 'inv', 'mgmt'],
  office: ['ov', 'sales', 'sep', 'ship', 'ins', 'look', 'fin:invs'], whmgr: ['ov', 'sales', 'sep', 'ship', 'ins', 'look', 'inv', 'fin:invs'], pickinv: ['ov', 'sales', 'sep', 'ship', 'ins', 'look', 'fin:invs'],   // 📦 창고 매니저 서랍에 재고 묶음 (v0.8.233 · 2026-11-13 창고 매니저: 컴퓨터 왼쪽 메뉴에 재고 화면이 하나도 없었음)
  acct: ['ov', 'fin', 'sales:stores'],
  catalog: ['ov', 'inv:items,photos,labels', 'sales:stores', 'look:cat']
};
function drawerPlan() {
  if (S.role === 'owner') return DPLAN.owner;
  if (S.role !== 'manager') return null;   // 관리자 · 세일즈맨: 자기 메뉴 전부
  return [].concat(...myJobs().map(j => DPLAN[j] || DPLAN.office));
}
const DGRP = [
  ['ov', 'dashboard', '메인', 'Main', ['shome', 'own', 'home', 'catmg'], 'Principal'],
  ['sales', 'cart', '영업', 'Sales', ['order', 'stores', 'mysales'], 'Vendas'],
  ['sep', 'truck', '피킹', 'Picking', ['flow'], 'Separação'],
  ['ship', 'truck', '출고', 'Shipping', ['displays', 'notesups', 'balcao', 'shiphist'], 'Expedição'],   // 🚫 배송 조회(track) 화면 없앰 → Shipping History (2026-11-13 창고 매니저)
  ['ins', 'package', '인서트', 'Inserts', ['insert', 'inserts'], 'Inserts'],
  ['look', 'search', '조회', 'Lookup', ['cat', 'plan', 'pocompra'], 'Consulta'],   // 🧮 발주 계획 — 조회 묶음 (오피스 · 창고 매니저 서랍에 재고 묶음이 없어서, v0.8.219)
  ['inv', 'warehouse', '재고', 'Inventory', ['produtos', 'etiquetas', 'recebimento', 'estoque', 'repor', 'recheca', 'stock', 'items', 'labels', 'photos'], 'Estoque'],
  ['mov', 'layers', '주문', 'Orders', [], 'Movimentação'],
  ['fin', 'wallet', '재무', 'Finance', ['mg', 'mg/sales', 'invs', 'now', 'verify', 'entry', 'mine', 'send', 'hist', 'cod', 'ach', 'bounce', 'credit', 'ar', 'bossar', 'pay'], 'Financeiro'],
  ['mgmt', 'settings', '관리', 'Management', ['reports', 'admin'], 'Gestão']
];
/** 데스크탑 고정 서랍을 아이콘만 보이게 접었나 (이 컴퓨터에 기억) */
const railOn = () => { try { return localStorage.getItem('theone.rail') === '1'; } catch (e) { return false; } };
const dockPref = () => { try { return localStorage.getItem('theone.dock') !== '0'; } catch (e) { return true; } };
export const dockWanted = () => !!(S && S.user) && matchMedia(DOCK_MQ).matches;   // 🖥 컴퓨터에서는 늘 고정 (2026-11-13 창고 매니저: ☰ 로 껐다 켰다 하지 않게 — dockPref 는 더 안 씀)
export function dockDrawer() {
  const want = dockWanted(), d = $('drawer');
  document.body.classList.toggle('rail', want && railOn());
  if (!want) { if (d && d.classList.contains('dock')) { d.classList.remove('dock', 'on'); document.body.classList.remove('dock', 'drawer-on'); } else document.body.classList.remove('dock'); return; }
  if (d && d.classList.contains('dock') && d.classList.contains('on')) { dockMark(); return; }
  drawerRender(true);
}
/** 고정 서랍에서 지금 주소의 줄만 켜기 (다시 안 그림) */
export function dockMark() { const d = $('drawer'); if (!d || !d.classList.contains('dock')) return; const sNow = Orders.stageNow ? Orders.stageNow() : '';
  d.querySelectorAll('[data-dgo]').forEach(b => b.classList.toggle('on', !(sNow && sNow !== 'home') && location.hash.indexOf('#/' + b.dataset.dgo) === 0));
  d.querySelectorAll('[data-dlf]').forEach(b => b.classList.toggle('on', sNow === b.dataset.dlf)); }
function userMenu() {
  if (matchMedia(DOCK_MQ).matches) { dockDrawer(); return; }   // 🖥 컴퓨터: 서랍은 늘 고정 — ☰ 는 숨김 (theme.js), 눌려도 고정 그대로   // 데스크탑: ☰ = 고정 켜기 · 끄기 (끄면 이번엔 팝업으로 열어 줌)
  drawerRender(false);
}
function drawerRender(dock) {
  if (!S.user) return;
  const items = navFor(S.role).filter(x => !/^view\//.test(x[0]));
  const row = x => '<button type="button" data-dgo="' + esc(x[0]) + '"' + (location.hash.indexOf('#/' + x[0]) === 0 && !(sNow && sNow !== 'home') ? ' class="on"' : '') + ' title="' + esc(x[2] + (x[3] ? ' · ' + x[3] : '')) + '"><span class="i">' + routeIcon(x[0], x[1]) + '</span><span class="t">' + esc(x[2]) + '<small>' + esc(x[3] || '') + '</small></span></button>';
  /* 🧾 주문 칸 (담당자) — 주문 화면 안에 따로 있던 왼쪽 기둥 메뉴를 이 서랍 하나로 (고정 서랍이면 그 기둥은 숨김) */
  const stages = S.role !== 'salesman' && Orders.stageMenu ? Orders.stageMenu() : [], sNow = stages.length ? Orders.stageNow() : '';
  const srow = (k, ic, ko, en) => '<button type="button" data-dlf="' + esc(k) + '"' + (sNow === k ? ' class="on"' : '') + ' title="' + esc(ko + ' · ' + en) + '"><span class="i">' + stageIcon(k, ic) + '</span><span class="t">' + esc(ko) + '<small>' + esc(en) + '</small></span></button>';
  const ord = stages.length ? stages.map(([g, cs]) => '<div class="dsec dord"><small><span class="em">' + g[1] + '</span> ' + esc(g[2]) + ' · ' + esc(g[3]) + '</small>' + cs.map(c => srow(c[0], c[1], c[2], c[3])).join('') + '</div>').join('') : '';
  /* 한 화면은 한 번만 (배송 조회가 재고 · 조회 두 묶음에 다 있어도 서랍에는 처음 나온 곳에만) — v0.8.181 */
  const flat = [], seen = new Set();
  /* 🔒 경영 현황 · 매출 · 세일즈맨 정산 · 수금 현황 · 미수금 현황 · 오너 홈은 관리자 · 오너 메뉴에만 (v0.8.218 · 2026-11-13 관리자: "모든 역할에서 빼고 관리자와 오너만") */
  const TOP_ONLY = ['own', 'mg', 'mg/sales', 'pay', 'now', 'bossar'];
  items.forEach(x => { if (!/^hub\//.test(x[0])) { flat.push(x); seen.add(x[0]); } });
  items.forEach(x => { if (/^hub\//.test(x[0])) Hub.hubItems(x[0].split('/')[1]).forEach(c => { if (!seen.has(c[0])) { seen.add(c[0]); flat.push([c[0], c[1], c[2], c[3]]); } }); });
  if (!isOwner()) for (let i = flat.length - 1; i >= 0; i--) if (TOP_ONLY.includes(flat[i][0])) flat.splice(i, 1);
  /* 🧭 v0.8.203 묶음 — 개요 · 운영 · 재고 관리 · 수금 · 재무 · 거래처 · 관리 (+ 기타). 역할이 볼 수 있는 화면만, 묶음에 없는 화면은 기타로 (빠지는 화면 없음)
   *   묶음 머리를 누르면 접고 펼침 (이 기기에 기억) · 지금 화면이 든 묶음은 늘 펼침 */
  let fold = []; try { fold = JSON.parse(localStorage.getItem('theone.dfold') || '[]'); if (!Array.isArray(fold)) fold = []; } catch (e) {}
  const grpOf = r => (DGRP.find(g => g[4].includes(r)) || DGRP.find(g => g[4].includes(r.split('/')[0])) || ['etc'])[0];
  const onR = r => location.hash.indexOf('#/' + r) === 0;
  /* 👥 역할별 서랍 묶음 (v0.8.219 · 2026-11-13 관리자: "모두 같은 메뉴가 보이면 일에 효율적이지 못함") — DPLAN 에 없는 묶음은 안 보임 · '묶음:화면,화면' 은 그 화면만 */
  const plan = drawerPlan(), allow = {}; if (plan) plan.forEach(p => { const [g, l] = p.split(':'); allow[g] = l ? (allow[g] === true ? true : (allow[g] || []).concat(l.split(','))) : true; });
  if (plan) for (let i = flat.length - 1; i >= 0; i--) { const a = allow[grpOf(flat[i][0])]; if (!(a === true || (Array.isArray(a) && a.includes(flat[i][0])))) flat.splice(i, 1); }
  const secs = DGRP.concat([['etc', 'layers', '기타', 'Other', [], 'Outros']]).map(g => {
    const pos = r => { const k = g[4].indexOf(r); return k >= 0 ? k : g[4].indexOf(r.split('/')[0]) >= 0 ? g[4].indexOf(r.split('/')[0]) : 999; };
    const L = flat.filter(x => grpOf(x[0]) === g[0]).sort((a, b) => pos(a[0]) - pos(b[0])), withOrd = g[0] === 'sep' && ord && (!plan || allow.sep === true);   // 옛 메뉴 순서 · 주문 칸(.dord) = 피킹 묶음
    if (!L.length && !withOrd) return '';
    const live = L.some(x => onR(x[0])) || (withOrd && sNow && sNow !== 'home'), shut = fold.includes(g[0]) && !live;
    return '<div class="dsec dgrp' + (shut ? ' fold' : '') + '" data-dg="' + g[0] + '"><small class="dgh" data-dgh="' + g[0] + '" role="button" tabindex="0">' + (LANG === 'pt' && g[5] ? esc(g[5]) : bt(g[2], g[3])) + '<span class="dgc">' + icon('chevDown', 14) + '</span></small>' + L.map(row).join('') + (withOrd ? ord : '') + '</div>';
  }).join('');
  const main = '';
  /* ⚙️ 설정 — 서랍에는 한 줄만, 누르면 설정 화면(#/settings) — 서랍을 가볍게 (v0.8.205) */
  const settings = '<div class="dsec dset">' + row(['settings', '⚙️', bt('설정', 'Settings'), bt('화면 · 숫자 입력 · 알림 · 연결', 'View · numbers · alerts · connection')]) + '</div>';
  const name = S.user.name || S.user.email, ini = (String(name).replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).map(w => w[0]).join('').substring(0, 2) || '?').toUpperCase();   // 글자만 (괄호 · 숫자 · @ 는 빼고)
  let d = $('drawer'); if (!d) { d = document.createElement('div'); d.id = 'drawer'; document.body.appendChild(d); }
  d.innerHTML = '<div class="dback" id="dBack"></div><aside class="dpanel"><div class="dhead"><img src="logo-96.png" alt=""><b>THE ONE <em>CORP</em></b><button type="button" class="hb" id="dRail" title="' + esc(bt('메뉴 접기 · 펴기', 'Collapse menu')) + '">' + icon(railOn() ? 'panelOpen' : 'panelClose', 18) + '</button><button type="button" class="hb" id="dX">' + icon('x', 18) + '</button></div>' +
    '<div class="dbody">' + main + secs + settings + '</div>' +
    '<div class="dfoot"><div class="dav">' + esc(ini) + '</div><div class="dwho"><b>' + esc(name) + '</b><small>' + esc(S.role === 'manager' ? jobLabel(jobOf()) : roleLabel(S.role)) + ' · ' + VER + '</small></div><button type="button" class="hb" id="mOut" title="' + esc(bt('로그아웃', 'Sign out')) + '">' + icon('logout', 18) + '</button></div>' +
    '<div class="dlang seg" translate="no">' + LANGS.map(l => '<button type="button" class="' + (LANG === l[0] ? 'on' : '') + '" data-lang="' + l[0] + '">' + ({ ko: 'KR', en: 'EN', pt: 'PT' }[l[0]] || l[0].toUpperCase()) + '</button>').join('') + '</div></aside>';
  d.classList.toggle('dock', !!dock); d.classList.add('on'); document.body.classList.toggle('dock', !!dock); document.body.classList.toggle('drawer-on', !dock);
  const close = () => { if (d.classList.contains('dock')) return; d.classList.remove('on'); document.body.classList.remove('drawer-on'); };
  $('dBack').onclick = close; $('dX').onclick = close;
  $('dRail').onclick = () => { const on = !railOn(); try { localStorage.setItem('theone.rail', on ? '1' : '0'); } catch (e) {} document.body.classList.toggle('rail', on); $('dRail').innerHTML = icon(on ? 'panelOpen' : 'panelClose', 18); navH(); };
  d.querySelectorAll('[data-dgh]').forEach(h => h.onclick = h.onkeydown = e => { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; if (document.body.classList.contains('rail') && d.classList.contains('dock')) return; const g = h.closest('.dgrp'); g.classList.toggle('fold'); const L = Array.from(d.querySelectorAll('.dgrp.fold')).map(x => x.dataset.dg); try { localStorage.setItem('theone.dfold', JSON.stringify(L)); } catch (e2) {} });
  d.querySelectorAll('[data-dgo]').forEach(b => b.onclick = () => { close(); const g = b.dataset.dgo, [r, a] = g.split('/'); if (a) Router.go(r, a); else Router.go(g); });
  d.querySelectorAll('[data-dlf]').forEach(b => b.onclick = () => { close(); Orders.openStage(b.dataset.dlf); dockMark(); });
  d.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { if (b.dataset.lang !== LANG) setLang(b.dataset.lang); });
  $('mOut').onclick = () => { close(); Push.disable().finally(() => S.AUTH.signOut()); };
}
/* ⚙️ 설정 화면 (#/settings) — ☰ 서랍의 ⚙️ 설정 줄에서. 묶음: 화면 바꾸기 · 입력 · 알림 · 연결 · 이 기기. 버튼 id 는 예전 서랍 그대로 (v0.8.205) */
export function settingsPage() {
  if (!S.user) return;
  const isAdm = S.me && S.me.role === 'admin', vs = viewsOf(S.me), roles = vs.length > 1 ? vs : [];
  const nst = Notify.notifyState(), outN = Orders.outboxList().length, isOff = navigator.onLine === false;
  const seg = (arr, attr, cur, lab) => '<div class="seg stseg">' + arr.map(a => '<button type="button" class="' + (cur === a[0] ? 'on' : '') + '" data-' + attr + '="' + esc(a[0]) + '">' + lab(a) + '</button>').join('') + '</div>';
  const srow = (id, ic, t, sub, cls) => '<button type="button" class="strow' + (cls ? ' ' + cls : '') + '" id="' + id + '"><span class="i">' + ic + '</span><span class="t"><b>' + esc(t) + '</b><small>' + esc(sub) + '</small></span><span class="chev">' + icon('chevRight', 18) + '</span></button>';
  const info = (ic, t, sub) => '<div class="strow sthd"><span class="i">' + ic + '</span><span class="t"><b>' + esc(t) + '</b><small>' + esc(sub) + '</small></span></div>';
  const grp = (h, body) => body ? '<div class="stgrp"><div class="sth">' + esc(h) + '</div><div class="stbox">' + body + '</div></div>' : '';
  $('page').innerHTML = '<div class="stpage"><h2 class="sttitle">' + icon('settings', 22) + ' ' + bt('설정', 'Settings') + '</h2>' +
    grp(bt('화면 바꾸기', 'Switch view'), roles.length ? '<div class="stpad">' + seg(roles.map(r => [r]), 'r', S.role, x => roleLabel(x[0]).split(' ')[0]) + (S.role === 'manager' && isAdm ? seg(JOBS, 'j', jobOf(), x => x[1]) : '') + '</div>' : '') +
    grp(bt('입력 · 알림', 'Input · alerts'),
      info(icon('pen', 20), bt('숫자 입력', 'Number entry'), bt('수량 · 금액 칸', 'Qty · amount fields')) +
      '<div class="stpad">' + seg([['1', bt('팝업 패드', 'Pad')], ['0', bt('폰 키보드', 'Keyboard')]], 'np', numPadOn() ? '1' : '0', x => x[1]) + '</div>' +
      srow('mPush', icon('bell', 20), bt('알림', 'Notifications'), nst === 'granted' ? bt('팝업 알림 항상 켜짐', 'Pop-ups always on') : nst === 'denied' ? bt('알림 막힘 — 허용하는 법', 'Blocked — how to allow') : bt('알림 허용', 'Allow notifications'), nst === 'denied' ? 'warn' : '')) +
    (isAdm ? grp(bt('사용자', 'Users'), srow('stUserNew', icon('userCheck', 20), bt('사용자 만들기', 'Create user'), bt('구글 이메일 · 역할 · 일 · 세일즈맨 코드', 'Google email · role · job · salesman code')) + srow('stUsers', icon('users', 20), bt('사용자 관리', 'Manage users'), bt('목록 · 고치기 · 끄기 · 지우기', 'List · edit · disable · delete'))) : '') +
    grp(bt('연결', 'Connection'),
      srow('mNet', icon('globe', 20), bt('연결 · 보낼 함', 'Connection · outbox'), (isOff ? bt('오프라인', 'Offline') : bt('온라인', 'Online')) + (outN ? ' · 📤 ' + outN : ''), isOff || outN ? 'warn' : '') +
      srow('mDiag', icon('search', 20), bt('연결 점검', 'Check connection'), bt('안 될 때 원인 찾기', 'Find out what is wrong')) + '<div id="diagOut"></div>') +
    grp(bt('이 기기', 'This device'),
      (isApp() ? '' : srow('mInst', icon('packagePlus', 20), bt('앱으로 설치', 'Install app'), bt('홈 화면에 아이콘', 'Icon on the home screen'))) +
      srow('mReload', icon('refresh', 20), bt('새로고침', 'Reload'), bt('최신 버전 받기', 'Get the latest version'))) +
    '<p class="muted sttail">' + VER + '</p></div>';
  $('mDiag').onclick = diag;
  if ($('stUserNew')) $('stUserNew').onclick = () => Admin.userForm(null);   // 👤 설정에서 사용자 만들기 (관리자)
  if ($('stUsers')) $('stUsers').onclick = () => Router.go('admin', 'users');
  $('mNet').onclick = () => netSheet();
  $('mPush').onclick = async () => { const st = Notify.notifyState(); if (st === 'denied') return openModal('<h2>🔕 ' + bi('알림이 막혀 있습니다', 'Notifications are blocked') + '</h2>' + Notify.blockedHtml() + '<div class="btns"><button class="b-ghost" id="nbX">' + bt('닫기', 'Close') + '</button></div>'), $('nbX').onclick = closeModal; if (st !== 'granted') { await Notify.askPermission(); settingsPage(); return; } const ok = await Push.enable(true); toast(ok ? '🔔 ' + bt('이 기기에서 팝업을 받습니다', 'This device gets pop-ups') : bt('이 브라우저는 앱을 닫았을 때 팝업을 받을 수 없습니다 — 앱이 열려 있을 때만', 'This browser only shows pop-ups while the app is open'), ok ? 'good' : 'bad'); if (ok) { try { const r = await navigator.serviceWorker.getRegistration(); if (r) r.showNotification('🔔 THE ONE', { body: bt('팝업 알림이 이렇게 뜹니다', 'Pop-ups look like this'), tag: 'theone-test', icon: 'icon-192.png', data: { url: location.href, at: Date.now() } }); } catch (e) {} } };   // 시험 팝업은 화면이 보일 때도 띄움
  document.querySelectorAll('.stpage [data-np]').forEach(b => b.onclick = () => { setNumPad(b.dataset.np === '1'); toast(b.dataset.np === '1' ? '🔢 ' + bt('숫자 칸을 누르면 팝업 패드가 뜹니다', 'Number fields open a pad') : '⌨ ' + bt('폰 키보드를 씁니다', 'Using the phone keyboard'), 'good'); settingsPage(); });
  if ($('mInst')) $('mInst').onclick = () => doInstall();
  document.querySelectorAll('.stpage [data-r]').forEach(b => b.onclick = () => switchRole(b.dataset.r));
  document.querySelectorAll('.stpage [data-j]').forEach(b => b.onclick = () => { S.me.job = b.dataset.j; switchRole('manager'); });
  $('mReload').onclick = () => location.reload();
}
/* 🔁 모드만 고르는 작은 창 — 아래 메뉴 "모드" · 헤더의 이름 누르기 (전체 메뉴는 ☰ 서랍) */
export function modePicker() {
  if (!S.user) return;
  const isAdm = S.me && S.me.role === 'admin', vs = viewsOf(S.me);
  const ICON = { owner: '🏭', admin: '⚙️', manager: '🧑‍💼', salesman: '🚗' }, SUB = { owner: bt('경영 숫자 · 대시보드', 'business numbers'), admin: bt('관리 · 설정', 'admin · settings'), manager: bt('주문 · 출고 · 수금 처리', 'orders · fulfillment · payments'), salesman: bt('주문 · 수금 입력 · 내 가게', 'orders · payments · my stores') };
  openModal('<h2>🔁 ' + bi('모드 바꾸기', 'Switch mode') + '</h2><div class="muted">' + bt('지금', 'Now') + ': <b>' + esc(S.role === 'manager' ? jobLabel(jobOf()) : roleLabel(S.role)) + '</b></div>' +
    '<div class="modes">' + vs.map(r => '<button type="button" class="' + (S.role === r ? 'on' : '') + '" data-r="' + r + '"><span class="i">' + ICON[r] + '</span><span class="t"><b>' + esc(roleLabel(r).split(' ')[0]) + '</b><small>' + SUB[r] + '</small></span></button>').join('') + '</div>' +
    (isAdm ? '<div class="fg" style="margin-top:10px"><label>🧑‍💼 ' + bt('담당자 모드의 일', 'Staff job') + '</label><div class="seg" style="flex-wrap:wrap">' + JOBS.map(j => '<button type="button" class="' + (S.role === 'manager' && jobOf() === j[0] ? 'on' : '') + '" data-j="' + j[0] + '">' + j[1] + '</button>').join('') + '</div></div>' : '') +
    '<div class="btns"><button type="button" class="b-ghost" id="mpX">' + bt('닫기', 'Close') + '</button></div>');
  $('mpX').onclick = closeModal;
  document.querySelectorAll('#mbox [data-r]').forEach(b => b.onclick = () => { closeModal(); if (b.dataset.r !== S.role) switchRole(b.dataset.r); });
  document.querySelectorAll('#mbox [data-j]').forEach(b => b.onclick = () => { closeModal(); S.me.job = b.dataset.j; switchRole('manager'); });
}
export const closeDrawer = () => { const d = $('drawer'); if (d) d.classList.remove('on'); document.body.classList.remove('drawer-on'); };
/* 🔍 어디서나 검색 — 거래처 · 아이템 · 인보이스 번호를 한 칸에서 */
function globalSearch(pre) {
  openModal('<h2>🔍 ' + bi('검색', 'Search') + '</h2><input id="gsQ" placeholder="' + esc(bt('가게 이름 · 계정코드 · 아이템 코드 · 바코드 · 인보이스 #', 'Store · acct # · item code · barcode · invoice #')) + '" autocomplete="off" autocapitalize="characters" value="' + esc(typeof pre === 'string' ? pre : '') + '"><div id="gsRes" class="gsres"></div>');
  const q = $('gsQ'), res = $('gsRes');
  const run = async () => {
    const v = q.value.trim(); if (!v) { res.innerHTML = ''; return; }
    let h = '';
    const A = S.accounts && S.accounts.byCode ? searchAccounts(S.accounts, v, 6) : [];
    if (A.length) h += '<div class="gsh">🏬 ' + bt('거래처', 'Customers') + '</div>' + A.map(a => '<button type="button" class="gsr" data-gsa="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b><small>' + esc([a.acct, a.city, a.state, a.sm].filter(Boolean).join(' · ')) + '</small></button>').join('');
    try { await loadCatalog(S); } catch (e) {}
    const C = catalog(); let I = [];
    if (C) { const ex = exactItem(v); I = (ex ? [ex] : []).concat((searchItems(v, [], 6, undefined, true) || []).filter(x => !ex || x.c !== ex.c)).slice(0, 6); }
    if (I.length) h += '<div class="gsh">🏷 ' + bt('아이템', 'Items') + '</div>' + I.map(it => '<button type="button" class="gsr" data-gsi="' + esc(it.c) + '">' + (it.ph ? '<img src="' + esc(thumb(it.ph, 80)) + '" alt="">' : '<span class="noph">📷</span>') + '<span><b>' + esc(it.c) + '</b><small>' + esc(it.d || '') + ' · ' + money(it.p) + '</small></span></button>').join('');
    const m = /^([A-Za-z]{1,2})?-?(\d{4,7})$/.exec(v.replace(/\s+/g, ''));
    if (m) h += '<div class="gsh">📄 ' + bt('인보이스', 'Invoice') + '</div><button type="button" class="gsr" data-gsn="' + esc(v.replace(/\s+/g, '').toUpperCase()) + '"><b>' + esc(v.toUpperCase()) + '</b><small>' + bt('인보이스 번호로 열기', 'Open by invoice number') + '</small></button>';
    if (q.value.trim() !== v) return;
    res.innerHTML = h || '<div class="none">' + bt('맞는 것이 없습니다', 'No match') + '</div>';
    res.querySelectorAll('[data-gsa]').forEach(b => b.onclick = () => { closeModal(); storeSheet(b.dataset.gsa); });
    res.querySelectorAll('[data-gsi]').forEach(b => b.onclick = () => { closeModal(); Router.go('cat', b.dataset.gsi); });
    res.querySelectorAll('[data-gsn]').forEach(b => b.onclick = () => { closeModal(); invDetail(b.dataset.gsn); });
  };
  q.oninput = debounce(run, 150); q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const f = res.querySelector('.gsr'); if (f) f.click(); } };
  if (q.value) run(); else if (!('ontouchstart' in window)) setTimeout(() => q.focus(), 50);
}
/* 📷 헤더 스캔 — 아이템이면 아이템 창(재고 · 위치), 아니면 검색 창에 넣어 줌 */
function headerScan() {
  openScanner(async code => {
    try { await loadCatalog(S); } catch (e) {}
    const it = exactItem(code);
    if (it) { Router.go('cat', it.c); return; }
    toast(bt('목록에 없는 바코드입니다', 'Barcode not in the catalog') + ': ' + code, 'bad'); globalSearch(code);
  });
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
export function roleLabel(r) { return { owner: '오너 Owner', admin: '관리자·오너 Admin·Owner', manager: '담당자 Staff', salesman: '세일즈맨 Salesman' }[r] || r; }

function switchRole(r) {
  if (!viewsOf(S.me).includes(r)) return;
  S.role = r; try { localStorage.setItem(VIEW_KEY(), r); } catch (e) {}
  Router.stack = [];   // 새 역할의 첫 화면이 뒤로가기의 끝
  paintNav(); Notify.start(); Msg.start();
  Router.go(navFor(r)[0][0]);
}
/* 아래 메뉴의 실제 높이를 CSS 변수로 — 고정 바(.sticky) 와 본문 여백이 메뉴에 가리지 않게 */
function navH() {
  const n = $('nav'); if (n) { const hd = document.querySelector('header'), wide = matchMedia('(min-width:900px)').matches; if (wide && hd && n.parentNode !== hd) hd.insertBefore(n, hd.querySelector('.hr')); else if (!wide && n.parentNode !== document.body) document.body.appendChild(n); }   /* 🧭 넓은 화면: 메뉴 단추들을 머리띠 가운데로 (v0.8.174) */
  const cs = n && getComputedStyle(n);
  if (cs && cs.display === 'none') return;   // 키보드 모드(body.kb)로 숨긴 동안 재면 0 이 되어 키보드가 내려간 뒤 고정 바가 메뉴를 덮음 — 그때는 지난 값 유지
  let h = cs && cs.position === 'fixed' && cs.flexDirection !== 'column' ? n.offsetHeight : 0;   // 넓은 화면의 왼쪽 세로 메뉴는 0 (아래 여백 없음)
  if (h > 140) h = 140;   // 잘못 잰 큰 값(세로 메뉴 · 겹침)으로 고정 바가 공중에 뜨지 않게
  document.documentElement.style.setProperty('--navh', h + 'px');
  const pg = $('page'); if (pg && pg.clientWidth) document.documentElement.style.setProperty('--cw', pg.clientWidth + 'px');   /* 📐 본문 너비 — 타일 칸 수는 화면이 아니라 본문 너비로 (왼쪽 메뉴가 있는 컴퓨터에서도 줄지 않게) */ const hd = document.querySelector('header'); if (hd) document.documentElement.style.setProperty('--hdr', hd.offsetHeight + 'px'); }
window.addEventListener('resize', () => setTimeout(() => { navH(); dockDrawer(); }, 50));
window.addEventListener('hashchange', () => setTimeout(() => { dockMark(); paintTitle(); }, 0));
/** 🏷 머리띠 제목 = 지금 화면 이름 (메뉴 · 묶음에 적힌 이름 · 없으면 THE ONE) — v0.8.203 */
function paintTitle() {
  const t = $('hTitle'); if (!t || !S.user) return;
  const h = location.hash.replace(/^#\/?/, ''), r = h.split('/')[0];
  const L = []; navFor(S.role).forEach(x => { if (/^hub\//.test(x[0])) Hub.hubItems(x[0].split('/')[1]).forEach(c => L.push(c)); else L.push(x); });
  L.push(['settings', '⚙️', bt('설정', 'Settings'), '']);   // ⚙️ 설정 화면은 메뉴 밖 (서랍 아래 한 줄)
  const x = L.find(c => c[0] === h) || L.find(c => c[0] === r) || L.find(c => c[0].split('/')[0] === r);
  t.innerHTML = x && !/^view\//.test(x[0]) ? (x[0] === navFor(S.role)[0][0] ? bt('대시보드', 'Dashboard') : bi(esc(x[2]), esc(x[3] || ''))) : 'THE ONE';
}
/* 위 고정 메뉴(주문 상태 아이콘) 작게 · 크게 — 버튼으로만 (스크롤에 따라 저절로 접고 펴면 메뉴 높이가 바뀌어 아이폰에서 목록이 튕김) */
try { if (localStorage.getItem('theone.ocompact') === '1') document.body.classList.add('oscr'); } catch (e) {}
function paintNav() {
  const items = navFor(S.role);
  Router.home = items.length ? items[0][0] : '';
  $('nav').innerHTML = items.map(x => '<button data-go="' + x[0] + '"><span class="i">' + routeIcon(x[0], x[1], 22) + '</span>' + x[2] + '<span class="en">' + (x[3] || '') + '</span></button>').join('');
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { const g = b.dataset.go, [r, a] = g.split('/'); if (g === 'view/menu') return modePicker(); Router.navTap = r; if (location.hash === '#/' + g) { const f = Router.routes[r]; if (f) f(a || ''); } else if (a) Router.go(r, a); else Router.go(g); });   // 같은 탭을 다시 누르면 그 탭 첫 화면
  /* 🗂 묶음 안의 화면 — ‹ 뒤로 · 폰 뒤로가기는 그 묶음으로, 아래 메뉴도 그 묶음이 켜짐 */
  Router.parent = {}; items.filter(x => /^hub\//.test(x[0])).forEach(x => Hub.hubItems(x[0].split('/')[1]).forEach(c => { const r = c[0].split('/')[0]; if (!items.some(y => y[0] === c[0] || y[0] === r)) Router.parent[r] = x[0]; }));
  navH(); dockDrawer(); paintTitle();
  $('hWho').textContent = S.me && S.me.sm && S.role === 'salesman' ? S.me.sm : (S.me && S.me.sm ? S.me.sm + ' · ' : '') + (S.role === 'manager' ? myJobs().map(k => (JOBS.find(j => j[0] === k) || ['', ''])[1]).join(' + ') : roleLabel(S.role).split(' ')[0]);
  const multi = viewsOf(S.me).length > 1, hw = $('hWho'); if (hw) { if (multi) hw.textContent += ' ▾'; hw.style.cursor = multi ? 'pointer' : ''; hw.onclick = multi ? modePicker : null; }   // 여러 화면 쓰는 사람은 이름을 눌러 바로 바꿈
}

/* ⏱ 로딩 시간 기록 — 🔎 연결 · 권한 점검에 보임 (어느 단계가 느린지) */
const PERF = { t0: performance.now() };
const mark = k => { PERF[k] = Math.round(performance.now()); };
/* ⚡ 빠른 시작 — 지난번에 받은 내 기록 · 설정 · 세일즈맨을 폰에 두고(theone.boot.<email>) 켤 때 바로 씀 → 서버 왕복 2번을 기다리지 않음.
 *   서버에서 새로 받은 것은 뒤에서 확인해 바뀐 것만 반영 (역할 · 일 · 거래처 버전 · 비활성) */
const BOOT_KEY = e => 'theone.boot.' + String(e || '').toLowerCase();
const bootSave = (email, me, sms, st) => { try { localStorage.setItem(BOOT_KEY(email), JSON.stringify({ me, sms, settings: st, at: Date.now() })); } catch (e) {} };
const bootLoad = email => { try { const j = JSON.parse(localStorage.getItem(BOOT_KEY(email)) || 'null'); return j && j.me && j.me.active !== false && Array.isArray(j.sms) && j.settings ? j : null; } catch (e) { return null; } };
/* 관리자 기록 지키기 — 세일즈맨 가져오기 등이 관리자 사용자 문서를 role 'salesman' 으로 덮어썼거나 active 가 빠졋으면 로그인 때 되돌림
 *   (규칙: 관리자 이메일은 users 쓰기 허용). 빠른 시작(폰 캐시) 경로와 서버 경로 둘 다에서 돈다 — 캐시 경로에서 안 돌아 관리자 모드가 사라지던 문제 */
export async function healAdmin(email, me) {
  if (!ADMIN_EMAILS.includes(email) || (me.active === true && me.role === 'admin')) return false;
  const fix = { active: true, role: 'admin' };
  try { await S.DB.update('users', email, fix); } catch (e) { try { await S.DB.set('users', email, Object.assign({}, me, fix)); } catch (e2) { return false; } }
  Object.assign(me, fix); return true;
}
function applyBase(sms, st) { S.sms = sms || []; S.smByCode = {}; S.sms.forEach(x => { S.smByCode[x.code] = x; }); S.settings = st || {}; setInvTypeMap(invTypes(S)); setReqKinds(S.settings.reqKinds); }
async function afterLogin(user) {
  mark('auth'); S.user = user;
  const email = user.email, snap = bootLoad(email);
  const meP = S.DB.get('users', email);
  let me = null, healed = false;
  if (snap) me = snap.me;
  else {
    try { me = await meP; }
    catch (e) {
      /* 권한 오류면 토큰이 늦게 붙었을 수 있어 1.5초 뒤 한 번 더 — 그래도 안 되면 토큰 내용(로그인 방식 · 이메일 확인)을 같이 보여 줌 */
      let ok = false; if (String(e.code || '').includes('permission')) { await new Promise(r => setTimeout(r, 1500)); try { me = await S.DB.get('users', email); ok = true; } catch (e2) { e = e2; } }
      if (!ok) { const info = S.AUTH.claims ? await S.AUTH.claims() : ''; loginScreen('데이터베이스를 읽지 못했습니다 (' + (e.code || e.message) + ') · ' + email + (info ? ' · ' + info : '') + (String(e.code || '').includes('permission') ? ' — 이 화면을 찍어 관리자에게 보내 주세요' : '')); try { await S.AUTH.signOut(); } catch (e3) {} return; }
    }
    if (!me && ADMIN_EMAILS.includes(email)) {
      me = { id: email, email, name: user.name, role: 'admin', active: true, createdAt: today() };
      try { await S.DB.set('users', email, me); } catch (e) { loginScreen('관리자 기록을 만들지 못했습니다: ' + e.message); return; }
    }
    if (me) healed = await healAdmin(email, me);
    if (!me || me.active === false) { waitScreen(email); return; }
  }
  mark('me'); S.me = me; S.role = me.role || 'salesman';
  /* 여러 화면을 쓰는 사람 (관리자 · 추가 역할) — 이 폰에서 마지막으로 본 화면으로 (관리자 역할을 방금 되돌렸으면 관리자 화면으로) */
  if (healed) { try { localStorage.setItem(VIEW_KEY(), 'admin'); } catch (e) {} }
  else { try { const v = localStorage.getItem(VIEW_KEY()); if (v && viewsOf(me).includes(v)) S.role = v; } catch (e) {} }
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
  setTimeout(() => { Notify.start(); Msg.start(); }, snap ? 1500 : 0);
  setTimeout(() => { Notify.autoOn(); }, 4000);
  loadWatch();   /* ⏳ 15초 넘게 도는 "읽는 중" → 다시 연결 · 🔄 다시 시도 (v0.8.184) */
  Offline.autoStart();   /* 📦 세일즈맨: 인터넷이 되면 앱을 열 때마다 · 다시 연결될 때 · 돌아올 때 오프라인 자료를 자동 준비 (v0.8.181) */   /* 🔔 알림 항상 켜짐 — 허락됐으면 기기 등록, 아직이면 처음 누를 때 물어봄 (v0.8.179) */   // 📱💻 알림을 허락한 기기면 하루 한 번 등록 확인 (앱을 닫아도 팝업)   // 🔔 확인 요청 · 주문 문제 실시간 알림 (빠른 시작이면 첫 화면 뒤에)
  const valid = navFor(S.role).some(x => location.hash.indexOf('#/' + x[0]) === 0) || location.hash.indexOf('#/entry') === 0 || location.hash.indexOf('#/mine') === 0 || location.hash.indexOf('#/hist') === 0 || location.hash.indexOf('#/find') === 0 || location.hash.indexOf('#/items') === 0 || location.hash.indexOf('#/cat') === 0 || location.hash.indexOf('#/track') === 0 || location.hash.indexOf('#/balcao') === 0 || location.hash.indexOf('#/shiphist') === 0 || location.hash.indexOf('#/insert') === 0 || location.hash.indexOf('#/estoque') === 0 || location.hash.indexOf('#/produtos') === 0 || location.hash.indexOf('#/recebimento') === 0 || location.hash.indexOf('#/repor') === 0 || location.hash.indexOf('#/recheca') === 0 || location.hash.indexOf('#/etiquetas') === 0 || location.hash.indexOf('#/notesups') === 0 || location.hash.indexOf('#/stores') === 0 || location.hash.indexOf('#/reports') === 0 || location.hash.indexOf('#/arup') === 0;
  if (!valid) goHash('#/' + navFor(S.role)[0][0]);
  Router.stack = [];
  if (!ROUTER_ON) { ROUTER_ON = true; Router.start(); } else Router.start();
  /* 빠른 시작이었으면 — 서버 것과 비교해 바뀐 것만 반영 */
  if (snap) {
    Promise.all([meP, baseP]).then(async ([m2, [sms2, st2]]) => {
      const healed2 = m2 ? await healAdmin(email, m2) : false;   // 빠른 시작 경로에서도 관리자 역할이 지워졋으면 되돌림
      if (!m2 || m2.active === false) { waitScreen(email); return; }
      bootSave(email, m2, sms2, st2);
      if (healed2) { S.role = 'admin'; try { localStorage.setItem(VIEW_KEY(), 'admin'); } catch (e) {} }
      const roleChg = healed2 || m2.role !== snap.me.role || (m2.job || '') !== (snap.me.job || '') || JSON.stringify(m2.job2 || []) !== JSON.stringify(snap.me.job2 || []) || (m2.sm || '') !== (snap.me.sm || '') || JSON.stringify(m2.views || m2.extra || null) !== JSON.stringify(snap.me.views || snap.me.extra || null);
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
  if (!MOCK && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});   // 🔐 L5: index.html 의 인라인 스크립트 대신 여기서 (CSP 가 인라인을 막음)
  setTimeout(checkUpdate, 4000);
  const [{ DB, AUTH }] = await Promise.all([connect(), initLang(VER)]);
  S.DB = DB; S.AUTH = AUTH;
  Router.on('view', a => switchRole(a));   /* 아래 메뉴 🚗 세일즈 모드 · 🏭 경영 모드 */
  BizDay.register(S); Inbound.register(S); Sales.register(S); Plan.register(S); NewAcct.register(S); Notify.register(S); Photos.register(S); Envelope.register(S); Credit.register(S); Bounce.register(S); Offline.register(S); OwnHome.register(S); Bank.register(S); Stock.register(S); Hub.register(S); MySales.register(S); Collect.register(S); Ach.register(S); Mgr.register(S); Boss.register(S); Mg.register(S); Admin.register(S); Orders.register(S); Items.register(S); CatPage.register(S); Track.register(S); Balcao.register(S); ShipHist.register(S); Inserts.register(S); NotesUps.register(S); Reports.register(S); Flow.register(S); Access.register(S); Invlook.register(S); Labels.register(S); Displays.register(S); Push.register(S); Msg.register(S); Router.on('msg', Msg.page); Estoque.register(S); Etiquetas.register(S); Produtos.register(S); Recebidos.register(S); Repor.register(S);
  Router.on('settings', settingsPage);
  /* 🔒 경영 화면 잠금 (v0.8.217) — 경영 현황 · 매출 · 정산 · 미수금 현황 · 수금 현황 · 오너 홈은 오너 · 관리자만 (주소를 알아도). 판매 리포트는 오피스 매니저도 (매출은 보여도 됨) */
  const lockR = (name, ok) => { const f = Router.routes[name]; if (!f) return; Router.routes[name] = a => ok() ? f(a) : ($('page').innerHTML = '<div class="card"><div class="none">🔒 ' + bt('오너 · 관리자만 보는 화면입니다', 'Owners and admins only') + '</div></div>'); };
  ['own', 'mg', 'pay', 'bossar', 'now'].forEach(n => lockR(n, isOwner));
  lockR('reports', () => isOwner() || (S.role === 'manager' && myJobs().includes('office')));
  Router.on('', () => {});
  AUTH.onChange(u => {
    if (!u) { S.user = null; S.me = null; loginScreen(''); return; }
    afterLogin(u);
  });
}
boot();

/* ⏳ 멈춘 "읽는 중" 지킴이 (v0.8.184 — 입고 예정 · 주문 화면이 1분 넘게 안 열리던 일)
 *   화면의 .load 가 10초 넘게 그대로면 Firestore 연결을 다시 붙이고(DB.kick), 15초 넘으면 그 자리에 "🔄 다시 시도"(앱 새로 고침) 단추 */
let LW = null;
function loadWatch() {
  if (LW) return; const seen = new WeakMap();
  LW = setInterval(() => {
    document.querySelectorAll('.load').forEach(el => {
      if (!el.isConnected || el.offsetParent === null) return;
      const t0 = seen.get(el); if (!t0) { seen.set(el, Date.now()); return; }
      const ms = Date.now() - t0;
      if (ms > 10000 && !el.dataset.kicked) { el.dataset.kicked = '1'; try { S.DB && S.DB.kick && S.DB.kick('spinner'); } catch (e) {} }
      if (ms > 15000 && !el.querySelector('.lwRetry')) {
        const d = document.createElement('div'); d.className = 'lwRetry'; d.style.cssText = 'font-size:12.5px;font-weight:500';
        d.innerHTML = bt('인터넷이 느리거나 연결이 멈췄습니다', 'The connection is slow or stuck') + '<br><button class="b-blue b-sm" style="margin-top:8px">🔄 ' + bt('다시 시도', 'Try again') + '</button>';
        d.querySelector('button').onclick = () => { try { location.reload(); } catch (e) {} };
        el.appendChild(d);
      }
    });
  }, 2500);
}
