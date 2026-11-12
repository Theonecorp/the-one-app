/* ============================================================
 *  ↕ 표 머리글을 눌러 정렬 (옛 프로그램처럼 — 2026-11-12 관리자: "인보이스 번호 제목을 누르면 인보이스 순서로,
 *     Customer 를 누르면 커스토머 이름으로, Sales Rep 을 누르면 세일즈맨으로")
 *    같은 머리글을 다시 누르면 반대 순서 · 세 번째는 원래 묶음(날짜별 등)으로 돌아감
 *    폰(좁은 화면)은 표 머리글이 없어서 같은 내용을 "정렬" 칩 줄로
 * ============================================================ */
import { esc, bi, bt, sortInv } from './ui.js';

export const SORTS = { no: ['인보이스 #', 'Invoice #'], d: ['날짜', 'Date'], acct: ['계정 #', 'Cust #'], store: ['거래처', 'Customer'], sm: ['세일즈맨', 'Rep'], terms: ['조건', 'Terms'], order: ['주문 #', 'S.O. #'], qty: ['수량', 'Qty'], total: ['합계', 'Total'], bal: ['잔액', 'Balance'] };
/** 폰 칩 줄에 보일 칸 (전부 나열하면 길어서) */
export const PHONE = ['no', 'd', 'store', 'sm', 'terms', 'total', 'bal'];
const COLL = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const balOf = r => r.bal != null ? r.bal : (r.total || 0);
/** srt = { k, desc } — k 가 비면 그대로 */
export function sortRows(rows, srt) {
  if (!srt || !srt.k) return rows;
  const byNo = sortInv(rows.slice(), r => r.no, false), pos = new Map(byNo.map((r, i) => [r, i]));
  const tie = (a, b) => pos.get(a) - pos.get(b);
  const cmp = { no: tie, d: (a, b) => String(a.d || '').localeCompare(String(b.d || '')) || tie(a, b), store: (a, b) => COLL.compare(String(a.store || ''), String(b.store || '')) || tie(a, b), sm: (a, b) => COLL.compare(String(a.sm || ''), String(b.sm || '')) || COLL.compare(String(a.store || ''), String(b.store || '')) || tie(a, b), acct: (a, b) => COLL.compare(String(a.acct || ''), String(b.acct || '')) || tie(a, b), terms: (a, b) => COLL.compare(String(a.terms || ''), String(b.terms || '')) || COLL.compare(String(a.store || ''), String(b.store || '')) || tie(a, b), order: (a, b) => COLL.compare(String(a.order || ''), String(b.order || '')) || tie(a, b), qty: (a, b) => (a.qty || 0) - (b.qty || 0) || tie(a, b), total: (a, b) => (a.total || 0) - (b.total || 0) || tie(a, b), bal: (a, b) => balOf(a) - balOf(b) || tie(a, b) }[srt.k] || tie;
  const out = rows.slice().sort(cmp); if (srt.desc) out.reverse(); return out;
}
const arrow = (srt, k) => srt && srt.k === k ? (srt.desc ? ' ▼' : ' ▲') : '';
/** 머리글 한 칸 — 누를 수 있게 (k 가 SORTS 에 없으면 그냥 칸) · cls 는 원래 칸의 class (r · hs) · style 은 너비 */
export function th(k, label, srt, cls, style) {
  const st = style ? ' style="' + style + '"' : '';
  if (!SORTS[k]) return '<th' + (cls ? ' class="' + cls + '"' : '') + st + '>' + label + '</th>';
  return '<th class="sortable' + (cls ? ' ' + cls : '') + (srt && srt.k === k ? ' on' : '') + '"' + st + ' data-isort="' + k + '" title="' + esc(bt('눌러서 정렬', 'Tap to sort')) + '">' + label + '<span class="sarr">' + arrow(srt, k) + '</span></th>';
}
/** 폰: 정렬 칩 줄 */
export function chipsBar(srt, keys) {
  return '<div class="chips sortchips" style="margin:2px 0 6px"><span class="muted" style="align-self:center;font-size:12px">↕ ' + bt('정렬', 'Sort') + '</span>' + (keys || PHONE).map(k => '<button type="button" class="' + (srt && srt.k === k ? 'on' : '') + '" data-isort="' + k + '">' + bi(SORTS[k][0], SORTS[k][1]) + arrow(srt, k) + '</button>').join('') + (srt && srt.k ? '<button type="button" data-isort="">✕ ' + bt('묶음으로', 'Grouped') + '</button>' : '') + '</div>';
}
/** 누르면: 다른 칸 → 그 칸 오름차순 · 같은 칸 → 내림차순 · 한 번 더 → 정렬 끔(원래 묶음). 숫자 칸(합계 · 잔액 · 날짜)은 큰 것부터 시작 */
export function bindSort(root, srt, redraw) {
  (root || document).querySelectorAll('[data-isort]').forEach(el => el.onclick = e => {
    e.preventDefault(); e.stopPropagation(); const k = el.dataset.isort, bigFirst = k === 'total' || k === 'bal' || k === 'd' || k === 'qty';
    if (!k) { srt.k = ''; srt.desc = false; }
    else if (srt.k !== k) { srt.k = k; srt.desc = bigFirst; }
    else if (srt.desc !== bigFirst) { srt.k = ''; srt.desc = false; }
    else srt.desc = !srt.desc;
    redraw();
  });
}
