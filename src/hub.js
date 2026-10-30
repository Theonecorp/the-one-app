/* ============================================================
 *  🗂 묶음 메뉴 (담당자) — 아래 메뉴는 큰 묶음 몇 개만, 누르면 그 안의 세부 화면 타일
 *    hub/money 💵 수금 · 크레딧 · 체크   hub/look 📚 조회 (인보이스 · 거래처 · 배송 · 카탈로그)   hub/wh 📦 재고 · 아이템
 *  세부 화면에서 ‹ 뒤로 · 폰 뒤로가기 = 이 묶음 (Router.parent)
 * ============================================================ */
import { $, esc, Router, bi, bt } from './ui.js';
import { can } from './main.js';

let S = null;
export function register(state) { S = state; Router.on('hub', page); }

/** 묶음 → [route, 아이콘, 한글, 영어, 설명(한), 설명(영), 보이는 조건] */
export const HUBS = {
  money: { icon: '💵', ko: '수금', en: 'Payments', items: [
    ['verify', '💵', '수금 확인', 'Payments', '세일즈맨 수금 · 체크 수령 · 접수 확인', 'field payments · checks received', () => can('verify')],
    ['cod', '💳', 'COD · 카드', 'COD · Card', 'COD · 카드 입력 · 승인번호', 'COD · card entry', () => can('cod')],
    ['ach', '🏦', 'ACH', 'ACH', 'ACH 셋업 · 인출 · NSF', 'ACH setup · draws', () => can('ach')],
    ['bounce', '↩️', '체크 관리', 'Checks', '바운스 · 날짜 변경 · 홀드', 'bounced · date change · hold', () => can('verify') || can('cod')],
    ['credit', '↩', '크레딧 확인', 'Credits', '세일즈맨이 준 크레딧 확인 · VOID', 'credits given by salesmen', () => can('invoice') || can('verify')]
  ] },
  look: { icon: '📚', ko: '조회', en: 'Lookup', items: [
    ['invs', '📄', '인보이스', 'Invoices', '날짜별 · 가게별 · 번호', 'by date · store · number', () => true],
    ['stores', '🏬', '거래처', 'Customers', '가게 창 · 미수금 · 지도', 'store window · A/R · map', () => true],
    ['track', '🚚', '배송 조회', 'Tracking', '박스 · 트래킹 · 받은 날', 'boxes · tracking', () => true],
    ['cat', '📒', '카탈로그 · 바코드', 'Catalog · Barcodes', '사진 · 라벨 · 엑셀', 'photos · labels', () => true]
  ] },
  wh: { icon: '📦', ko: '재고', en: 'Inventory', items: [
    ['stock', '📦', '재고', 'Inventory', '조회 · 입고(팩킹 리스트) · 실사', 'find · receive · count', () => can('items')],
    ['items', '🏷', '아이템 · 위치', 'Items · Locations', '찾기 · 📍 통로 · 등록', 'find · aisle · add', () => can('items')],
    ['track', '🚚', '배송 조회', 'Tracking', '박스 · 트래킹', 'boxes · tracking', () => can('ship')]
  ] }
};
/** 이 묶음에서 지금 사람이 쓸 수 있는 칸 */
export const hubItems = k => (HUBS[k] ? HUBS[k].items.filter(x => { try { return x[6](); } catch (e) { return false; } }) : []);

function page(arg) {
  const k = HUBS[arg] ? arg : 'look', H = HUBS[k], L = hubItems(k);
  $('page').innerHTML = '<div class="card" style="padding:12px 14px 8px"><h2 style="margin:0">' + H.icon + ' ' + bi(H.ko, H.en) + '</h2></div>' +
    '<div class="hgrid hubgrid">' + L.map(x => '<button class="htile" data-hub="' + esc(x[0]) + '"><span class="hi">' + x[1] + '</span><b>' + bi(x[2], x[3]) + '</b><small>' + bt(x[4], x[5]) + '</small></button>').join('') + '</div>' +
    (L.length ? '' : '<div class="card"><div class="none">' + bt('이 일에는 볼 화면이 없습니다', 'Nothing here for this job') + '</div></div>');
  document.querySelectorAll('[data-hub]').forEach(b => b.onclick = () => Router.go(b.dataset.hub));
}
