/* ============================================================
 *  🗂 묶음 메뉴 (담당자) — 아래 메뉴는 큰 묶음 몇 개만, 누르면 그 안의 세부 화면 타일
 *    hub/money 💵 수금 · 크레딧 · 체크   hub/look 📚 조회 (인보이스 · 거래처 · 배송 · 카탈로그)   hub/wh 📦 재고 · 아이템
 *    칸의 8번째 값(있으면) = 숫자를 돌려주는 함수 → 칸 위에 빨간 숫자 (🔁 채울 상품 · 🔎 확인할 상품의 열린 요청)
 *  세부 화면에서 ‹ 뒤로 · 폰 뒤로가기 = 이 묶음 (Router.parent)
 * ============================================================ */
import { $, esc, Router, bi, bt } from './ui.js';
import { can, isOwner } from './main.js';
import { routeIcon } from './icons.js';

let S = null;
export function register(state) { S = state; Router.on('hub', page); }

/** 묶음 → [route, 아이콘, 한글, 영어, 설명(한), 설명(영), 보이는 조건] */
export const HUBS = {
  money: { icon: '💵', ko: '수금', en: 'Payments', items: [
    ['entry', '✍️', '수금 입력', 'Record a payment', '체크 · 캐쉬 · Zelle 받은 것 입력 (세일즈맨 고름)', 'checks · cash · Zelle received (pick the salesman)', () => can('verify') || can('cod')],   // 회계 담당 · 오피스 매니저도 직접 입력 (v0.8.202)
    ['verify', '💵', '수금 확인', 'Payments', '세일즈맨 수금 · 체크 수령 · 접수 확인', 'field payments · checks received', () => can('verify')],
    ['cod', '💳', 'COD · 카드', 'COD · Card', 'COD · 카드 입력 · 승인번호', 'COD · card entry', () => can('cod')],
    ['ach', '🏦', 'ACH', 'ACH', 'ACH 셋업 · 인출 · NSF', 'ACH setup · draws', () => can('ach')],
    ['bounce', '↩️', '체크 관리', 'Checks', '바운스 · 날짜 변경 · 홀드', 'bounced · date change · hold', () => can('verify') || can('cod')],
    ['credit', '↩', '크레딧 · 리턴', 'Credits', '크레딧 주기 · 세일즈맨 크레딧 확인 · VOID', 'give credit · review · void', () => can('invoice') || can('verify')]
  ] },
  look: { icon: '📚', ko: '조회', en: 'Lookup', items: [
    ['invs', '📄', '인보이스', 'Invoices', '날짜별 · 가게별 · 번호', 'by date · store · number', () => true],
    ['stores', '🏬', '거래처', 'Customers', '가게 창 · 미수금 · 지도', 'store window · A/R · map', () => true],
    ['track', '🚚', '배송 조회', 'Tracking', '박스 · 트래킹 · 받은 날', 'boxes · tracking', () => true],
    ['cat', '📒', '아이템 · 카탈로그', 'Items · Catalog', '검색 · 사진 · 재고 · 위치 · 라벨', 'search · photos · stock · location · labels', () => true]
  ] },
  /* 📦 재고 묶음 = 조의 화면(옛 WMS)으로 교체 (v0.8.215 · 2026-11-13 관리자: "중복 없애고 조가 만든 것으로 · 주문 흐름은 그대로") — 예전 📦 재고(#/stock) · 🏷 아이템(#/items) 화면은 주소로는 그대로 열림 (주문 화면 · 카탈로그 · 디자인 담당 메뉴가 씀) */
  wh: { icon: '📦', ko: '재고', en: 'Inventory', items: [
    ['estoque', '📦', '재고', 'Inventory', '통로 지도 · 입고 · 출고 · 상자 라벨 (옛 앱 화면)', 'aisle map · stock in · stock out · box labels (classic screen)', () => can('items')],
    ['repor', '🔁', '보충이 필요한 상품', 'Products to restock', '보충 요청 · 시작(한 사람만) · 지난달 판매로 수량 제안 (옛 앱 화면)', 'restock requests · start (one person) · quantity from last month\'s sales (classic screen)', () => can('items'), () => nOpen('reposicao', ['aberta', 'iniciada'])],
    ['recheca', '🔎', '재확인할 상품', 'Products to recheck', '수량 · 통로 확인 요청 · 상자마다 세기 (옛 앱 화면)', 'count · aisle recheck requests · count box by box (classic screen)', () => can('items'), () => nOpen('rechecagem', ['aberta'])],
    ['etiquetas', '🏷', '라벨 출력', 'Print labels', '상품의 상자 · 합치기 · 나누기 · 재고 / 피킹 라벨', 'product boxes · merge · divide · stock / picking labels', () => can('items')],
    ['produtos', '🏷', '상품', 'Products', '상품 목록 · 걸러보기 · 등록 · 수정 · 빈 상자 · 확인 요청 (옛 앱 화면)', 'product list · filters · add · edit · empty box · recheck (classic screen)', () => can('items')],
    ['recebimento', '📥', '상품 받기', 'Received products', 'REC 번호 · 들어온 상품 · 상자 수 · 재고 넣기 · 다른 REC 로 (옛 앱 화면)', 'REC numbers · items received · box count · into stock · move between RECs (classic screen)', () => can('items')],
    ['shiphist', '📦', 'Shipping History', 'Shipping History', 'UPS 출고 기록 · 다시 인쇄 · 취소', 'UPS shipments · reprint · void', () => can('ship') || can('track')],
    ['notesups', '🏷', 'Notes UPS', 'Notes UPS', '박스를 재서 라벨 · 가게별 대기 줄', 'Measure and label boxes · queue per store', () => can('ship')],
    ['balcao', '🏪', 'Shipping UPS', 'Shipping UPS', '가게 → 박스 → 라벨 (옛 앱 화면)', 'store → boxes → label (classic screen)', () => can('ship')],
    ['track', '🚚', '배송 조회', 'Tracking', '박스 · 트래킹 · 주문 없이 라벨', 'boxes · tracking · ad-hoc label', () => can('ship')],
    ['insert', '➕', '인서트 만들기', 'Create insert', '틀 · 훅 · 대체품 → 라벨 3가지 (옛 앱 화면)', 'template · hooks · substitutes → 3 labels (classic screen)', () => can('items')],
    ['inserts', '🧩', '완성된 인서트', 'Ready inserts', '바코드 · 구성 · 재고 있음 / 판매됨', 'barcode · composition · available / sold', () => can('items')],
    ['displays', '🖼', 'Notes Display', 'Notes Display', 'Empty Display 요청 · 준비 · UPS 박스', 'empty displays · prepare · UPS boxes', () => can('ship') || can('invoice') || can('newOrder')]
  ] },
  /* 🧑‍💼 세일즈맨 (v0.8.135) */
  smoney: { icon: '💵', ko: '수금', en: 'Collections', items: [
    ['entry', '✍️', '수금 입력', 'Record a payment', '체크 · 캐쉬 · Zelle 받은 것 입력', 'checks · cash · Zelle received', () => true],
    ['mine', '📋', '오늘 내역 · Daily Report', 'Today · Daily Report', '오늘 받은 것 · 리포트 전송', 'today\'s payments · send report', () => true],
    ['send', '📦', '체크 보내기', 'Send checks', '봉투로 묶어 회사로 · 빠진 것 확인', 'bundle and mail · missing checks', () => true],
    ['hist', '🗂', '수금 기록', 'Payment history', '가게 · 체크번호로 찾기', 'by store · check #', () => true],
    ['ar', '💰', '미수금', 'Accounts receivable', '내 가게 미수 · 에이징', 'my stores\' balances · aging', () => true],
    ['bounce', '↩️', '체크 관리', 'Check issues', '바운스 · 날짜 변경 · 홀드', 'bounced · date change · hold', () => true]
  ] },
  slook: { icon: '📚', ko: '조회', en: 'Lookup', items: [
    ['invs', '📄', '인보이스', 'Invoices', '내 인보이스 · 가게별', 'my invoices · by store', () => true],
    ['cat', '📒', '아이템 · 카탈로그', 'Items · Catalog', '검색 · 사진 · 가격 · 재고 · 손님 보기', 'search · photos · prices · stock', () => true],
    ['mysales', '📈', '내 매출', 'My sales', '이번 달 · 월별 · 가게별', 'this month · by month · by store', () => true],
    ['track', '🚚', '배송 조회', 'Tracking', '내 가게 박스 · 트래킹', 'boxes · tracking', () => true]
  ] },
  /* 👔 오너 · 관리자 (v0.8.135) */
  biz: { icon: '💼', ko: '경영', en: 'Business', items: [
    ['mg/sales', '📈', '매출', 'Sales', '월별 · 아이템별 · 세일즈맨별 · 연도 비교', 'monthly · by item · by salesman · YoY', () => true],
    ['mg', '🏭', '경영 현황', 'Business overview', '공장 · 은행 · 1099 · 보너스', 'factories · bank · 1099 · bonus', () => isOwner()],
    ['pay', '🧾', '세일즈맨 정산', 'Salesman settlement', '커미션 · 정산서 · 엑셀', 'commission · statements · Excel', () => isOwner()],   /* 🔒 관리자 · 오너만 (v0.8.218) */
    ['bossar', '💰', '미수금 현황', 'Receivables', '세일즈맨별 · 에이징 · 오래된 미수', 'by salesman · aging · overdue', () => true],
    ['now', '💵', '수금 현황', 'Collections status', '오늘 · 이번 주 · 세일즈맨별', 'today · this week · by salesman', () => true],
    ['reports', '📊', '판매 리포트', 'Sales reports', '아이템별 · 손님별 · 세일즈맨별 · CSV', 'by item · customer · salesman · CSV', () => true]
  ] }
};
/** 칸의 숫자 (열린 요청 수) — 개수만 읽음 */
const nOpen = (col, st) => S.DB.count ? S.DB.count(col, { where: [['status', 'in', st]] }) : S.DB.list(col, { where: [['status', 'in', st]] }).then(r => r.length);
/** 이 묶음에서 지금 사람이 쓸 수 있는 칸 */
export const hubItems = k => (HUBS[k] ? HUBS[k].items.filter(x => { try { return x[6](); } catch (e) { return false; } }) : []);

function page(arg) {
  const k = HUBS[arg] ? arg : 'look', H = HUBS[k], L = hubItems(k);
  $('page').innerHTML = '<div class="wd-hd" style="margin-bottom:12px"><div><h1>' + bi(H.ko, H.en) + '</h1></div></div>' +
    '<div class="hgrid hubgrid">' + L.map(x => '<button class="htile" data-hub="' + esc(x[0]) + '"><span class="hi">' + routeIcon(x[0], x[1], 26) + '</span><b>' + bi(x[2], x[3]) + '</b><small>' + bt(x[4], x[5]) + '</small></button>').join('') + '</div>' +
    (L.length ? '' : '<div class="card"><div class="none">' + bt('이 일에는 볼 화면이 없습니다', 'Nothing here for this job') + '</div></div>');
  document.querySelectorAll('[data-hub]').forEach(b => b.onclick = () => { const [r, a] = b.dataset.hub.split('/'); Router.go(r, a); });   // mg/sales 처럼 칸이 있는 화면도
  /* 열린 요청 수 — 칸 오른쪽 위 빨간 숫자 (옛 앱 메뉴의 숫자) */
  L.forEach(x => { if (!x[7]) return; Promise.resolve().then(x[7]).then(n => { const el = document.querySelector('[data-hub="' + x[0] + '"]'); if (!el || !(n > 0)) return; el.style.position = 'relative'; el.insertAdjacentHTML('beforeend', '<i class="hbadge" style="position:absolute;top:8px;right:8px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#d93025;color:#fff;font:700 12px/22px system-ui,sans-serif;font-style:normal">' + n + '</i>'); }).catch(() => {}); });
}
