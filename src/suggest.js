/* ============================================================
 *  🔎 입력 칸 자동완성 — 아이템 코드 칸에 글자를 치면 맞는 아이템이 목록으로 떠서 고름 (v0.8.200)
 *    2026-11-12 관리자: "아이템 코드를 검색하면 비슷한 코드가 검색되어 선택하게 · CV 를 누르면 CV 로 시작하는 아이템이 매칭 순서로"
 *    · 순서는 searchItems 의 가까운 순 (코드가 그 글자로 시작 > 코드 안에 > 설명)
 *    · ↑ ↓ 로 고르고 Enter · 마우스 · 손가락으로 누르기 · Esc 닫기
 *    · Enter 를 바로 치면: 정확히 맞는 코드 → 그것, 아니면 목록 맨 위
 *    · 목록은 body 에 붙는 떠 있는 상자 (모달 안에서도 잘리지 않게)
 * ============================================================ */
import { esc, money, bt, debounce } from './ui.js';
import { searchItems, exactItem } from './catalog.js';

let BOX = null, OWNER = null;
function box() {
  if (BOX) return BOX;
  BOX = document.createElement('div'); BOX.className = 'sugbox'; BOX.style.display = 'none';
  document.body.appendChild(BOX);
  const hide = () => close();
  window.addEventListener('resize', hide); window.addEventListener('hashchange', hide);
  document.addEventListener('scroll', e => { if (BOX && BOX.style.display !== 'none' && !BOX.contains(e.target)) close(); }, true);
  return BOX;
}
function close() { if (BOX) { BOX.style.display = 'none'; BOX.innerHTML = ''; } OWNER = null; }
function place(inp) {
  const r = inp.getBoundingClientRect(), b = box(), below = window.innerHeight - r.bottom, up = below < 220 && r.top > below;
  b.style.left = Math.max(4, r.left) + 'px'; b.style.width = Math.max(r.width, 280) + 'px';
  if (up) { b.style.top = ''; b.style.bottom = (window.innerHeight - r.top + 2) + 'px'; b.style.maxHeight = Math.min(360, r.top - 8) + 'px'; }
  else { b.style.bottom = ''; b.style.top = (r.bottom + 2) + 'px'; b.style.maxHeight = Math.min(360, below - 8) + 'px'; }
}
/** 아이템 자동완성 — onPick(it) · opt.all(숨김 포함, 기본 true) · opt.limit(기본 12) */
export function itemSuggest(inp, onPick, opt) {
  if (!inp) return;
  opt = Object.assign({ all: true, limit: 12 }, opt || {});
  let L = [], at = -1;
  inp.setAttribute('autocomplete', 'off'); inp.setAttribute('role', 'combobox');
  const paint = () => {
    const b = box();
    if (!L.length) { close(); return; }
    OWNER = inp; place(inp); b.style.display = '';
    b.innerHTML = L.map((it, i) => '<div class="sugrow' + (i === at ? ' on' : '') + '" data-sg="' + i + '"><b>' + esc(it.c) + '</b>' + (it.h ? ' <span class="tag" title="' + esc(bt('숨김 (단종 · 재입고 지연)', 'Hidden')) + '">🙈</span>' : '') + '<span class="sugd">' + esc(it.d || '') + '</span><span class="sugp">' + money(it.p) + '</span></div>').join('');
    b.querySelectorAll('[data-sg]').forEach(el => { el.onmousedown = e => { e.preventDefault(); pick(L[Number(el.dataset.sg)]); }; });
  };
  const run = () => { const q = inp.value.trim(); if (!q) { L = []; close(); return; } L = searchItems(q, null, opt.limit, undefined, opt.all); at = L.length ? 0 : -1; paint(); };
  const pick = it => { if (!it) return; inp.value = it.c; L = []; close(); onPick(it); };
  inp.addEventListener('input', debounce(run, 120));
  inp.addEventListener('focus', () => { if (inp.value.trim()) run(); });
  inp.addEventListener('blur', () => setTimeout(() => { if (OWNER === inp) close(); }, 150));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!L.length) return; e.preventDefault(); at = (at + (e.key === 'ArrowDown' ? 1 : -1) + L.length) % L.length; paint(); return; }
    if (e.key === 'Escape') { if (OWNER === inp) { e.preventDefault(); close(); } return; }
    if (e.key === 'Enter') {
      const q = inp.value.trim(); if (!q) return;
      const ex = exactItem(q), sel = OWNER === inp && L.length && at >= 0 ? L[at] : null;
      if (ex && (!sel || sel === ex)) { close(); return; }   // 정확히 맞는 코드 → 화면의 원래 Enter 동작(바로 넣기)
      e.preventDefault(); e.stopImmediatePropagation();
      if (sel) return pick(sel);
      const R = searchItems(q, null, 1, undefined, opt.all); if (R.length) return pick(R[0]);
      if (opt.onMiss) opt.onMiss(q);
    }
  }, true);
}
