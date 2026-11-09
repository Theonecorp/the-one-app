/* ============================================================
 *  🎁 인서트 · 디스플레이 요청 — 세일즈맨이 주문할 때 같이 요청 (C4 · C13 스피너 · 인서트, BCB, LB, LD, Wall, Black · Bangle · Nose Ring 인서트 …)
 *    orders.req = { C4: 2, WALLS: 1 } → 주문 목록 · 주문 창 · 출고 화면 · 피킹 리스트 · 인보이스(DISPLAY / INSERT REQUEST 줄)에 나옴
 *    종류는 관리 → 설정 "인서트 · 디스플레이 종류" (settings/app.reqKinds, 한 줄에 하나 "키 | 이름") — 비우면 아래 기본 목록 (v0.8.172: 4종 → 창고 실제 종류 16종, 설정으로 추가)
 *    옛 주문의 FLOOR · WALL 키는 목록에서 빠져도 이름이 그대로 보임
 * ============================================================ */
import { bt } from './ui.js';

/** 기본 목록 [키, 이름] — 이름은 창고 · 인보이스에 찍히는 영어 표기 그대로 */
export const REQ_DEFAULT = [['C4SP', 'C4 Spinner'], ['C4', 'C4 Insert'], ['C13SP', 'C13 Spinner'], ['C13', 'C13 Insert'], ['BCBTOP', 'BCBTop'], ['BCBASE', 'BCBase'], ['LB1', 'LB1'], ['LB2', 'LB2'], ['LB3', 'LB3'], ['LD', 'LD'],
  ['WALLS', 'Wall Short'], ['WALLL', 'Wall Long'], ['BLKINS', 'Black Insert'], ['BANGLE', 'Bangle Insert'], ['NOSE', 'Nose Ring Insert'], ['BLKWIDE', 'Black Wide Insert']];
/** 이전 목록의 키 — 옛 주문 · 인보이스 표시용 */
const LEGACY = { FLOOR: 'Floor Display', WALL: 'Wall Display', C4: 'C4 Insert', C13: 'C13 Insert' };
/** [코드, 한글, 영어] — 지금 쓰는 목록 (설정으로 바뀜) */
export let REQ_KINDS = REQ_DEFAULT.map(k => [k[0], k[1], k[1]]);
const keyOf = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
/** 설정 글 "키 | 이름" 줄들 → [키, 이름] 목록 (키를 안 쓰면 이름에서 만듦 · 같은 키는 처음 것만) */
export function parseReqKinds(text) {
  const out = [], seen = {};
  String(text || '').replace(/\r/g, '').split('\n').forEach(ln => {
    ln = ln.trim(); if (!ln) return;
    const p = ln.split('|').map(x => x.trim());
    const name = p.length > 1 ? p.slice(1).join(' | ') : p[0], key = keyOf(p.length > 1 ? p[0] : name);
    if (!key || !name || seen[key]) return; seen[key] = 1; out.push([key, name]);
  });
  return out;
}
/** 설정값으로 목록 바꾸기 — 비어 있으면 기본 목록. 돌려주는 값: 쓰는 목록 */
export function setReqKinds(text) { const L = parseReqKinds(text); REQ_KINDS = (L.length ? L : REQ_DEFAULT).map(k => [k[0], k[1], k[1]]); return REQ_KINDS; }
export const reqKindsText = L => (L || REQ_DEFAULT).map(k => k[0] + ' | ' + k[1]).join('\n');
/** 이름 — 목록에 있으면 그 이름, 옛 키면 옛 이름, 아니면 키 그대로 */
export function reqLabel(key, en) { const k = REQ_KINDS.find(x => x[0] === key); if (k) return k[1] === k[2] || en ? k[2] : bt(k[1], k[2]); return LEGACY[key] || key; }
/** 0 이하는 빼고 { 코드: 수량 } — 모르는 키도 수량이 있으면 남김 (옛 주문) · 하나도 없으면 null */
export function reqClean(r) { const o = {}; Object.keys(r || {}).forEach(k => { if (!/^[A-Z0-9_]{1,16}$/.test(k)) return; const n = Math.floor(Number(r[k]) || 0); if (n > 0) o[k] = n; }); return Object.keys(o).length ? o : null; }
/** "C4 Insert ×2 · Wall Short ×1" — 목록 순서, 목록에 없는 옛 키는 뒤에 (en: 영어만 — 인쇄 문서용) */
export function reqText(r, en, notes) {
  r = reqClean(r); if (!r) return '';
  const keys = REQ_KINDS.map(k => k[0]).filter(k => r[k]).concat(Object.keys(r).filter(k => !REQ_KINDS.some(x => x[0] === k)));
  const N = reqNoteClean(notes);
  return keys.map(k => reqLabel(k, en) + ' ×' + r[k] + (N && N[k] ? ' (' + N[k] + ')' : '')).join(' · ');
}
/** 종류별 설명 — 어떤 인서트 · 세트인지 (세일즈맨이 적음 · 세트 코드 포함) · 빈 것은 빼고 · 하나도 없으면 null */
export function reqNoteClean(n) { const o = {}; Object.keys(n || {}).forEach(k => { if (!/^[A-Z0-9_]{1,16}$/.test(k)) return; const t = String(n[k] || '').trim().slice(0, 300); if (t) o[k] = t; }); return Object.keys(o).length ? o : null; }
/** 인서트처럼 "무엇을 채울지" 설명이 필요한 종류 — 디스플레이 받침(BCB · LB · LD · Wall)은 아님 */
export const reqNeedsNote = key => !/^(BCB|LB|LD|WALL)/.test(String(key || ''));
export const reqCount = r => { r = reqClean(r); return r ? Object.values(r).reduce((a, b) => a + b, 0) : 0; };
