/* ============================================================
 *  🎁 인서트 · 디스플레이 요청 — 세일즈맨이 주문할 때 같이 요청 (C4 · C13 인서트 · 플로어 · 월 디스플레이)
 *    orders.req = { C4: 2, WALL: 1 } → 주문 목록 · 주문 창 · 출고 화면 · 피킹 리스트 · 인보이스(DISPLAY / INSERT REQUEST 줄)에 나옴
 * ============================================================ */
import { bt } from './ui.js';

/** [코드, 한글, 영어] */
export const REQ_KINDS = [['C4', 'C4 인서트', 'C4 Insert'], ['C13', 'C13 인서트', 'C13 Insert'], ['FLOOR', '플로어 디스플레이', 'Floor Display'], ['WALL', '월 디스플레이', 'Wall Display']];
/** 0 이하 · 모르는 키는 빼고 { 코드: 수량 } — 하나도 없으면 null */
export function reqClean(r) { const o = {}; REQ_KINDS.forEach(k => { const n = Math.floor(Number((r || {})[k[0]]) || 0); if (n > 0) o[k[0]] = n; }); return Object.keys(o).length ? o : null; }
/** "C4 인서트 ×2 · 월 디스플레이 ×1" (en: 영어만 — 인쇄 문서용) */
export function reqText(r, en) { r = reqClean(r); if (!r) return ''; return REQ_KINDS.filter(k => r[k[0]]).map(k => (en ? k[2] : bt(k[1], k[2])) + ' ×' + r[k[0]]).join(' · '); }
export const reqCount = r => { r = reqClean(r); return r ? Object.values(r).reduce((a, b) => a + b, 0) : 0; };
