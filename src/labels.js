/* ============================================================
 *  🏷 라벨 인쇄 — 🎨 디자인 · 카탈로그 담당 (관리자 포함) 전용
 *    크기 4~5가지: 1.5×1" 작은 아이템 라벨 · 2×1" 라벨 프린터 · 3×1.5" 선반 · 상자 · 4×6" 큰 상자 (코드 · 이름 · 📍 통로 · 큰 바코드) · Avery 5160 (레터 30장)
 *    프린터는 브라우저 인쇄 창에서 고릅니다 — 라벨 프린터(Zebra · Dymo)는 용지를 라벨 크기로 두면 한 장에 하나씩 나옵니다
 *    #/labels : 전체 아이템 표 → 체크 → 🖨  (카탈로그 · 아이템 창의 🏷 단추도 여기 labelPrint 로)
 * ============================================================ */
import { $, esc, money, toast, busy, openModal, closeModal, Router, printOpen, debounce, bi, bt, dtable, bindDtable, pageHead } from './ui.js';
import { loadCatalog, catalog, searchItems, thumb, cleanName, catStart, locOf, levelsOf } from './catalog.js';
import { barcodeSvg, loadJsBarcode } from './catpage.js';
import { can } from './main.js';

let S = null;
const LB = { q: '', lim: 300, sel: new Set(), aisle: '' };
export function register(state) { S = state; Router.on('labels', page); Router.upHas.labels = () => !!(LB.q || LB.aisle); }
const ok = () => S.role === 'admin' || S.role === 'owner' || can('catalog');

/** 라벨 크기 — [키, 크기, 설명(한), 설명(영), @page, 큰 글씨?] */
export const SIZES = [
  ['small', '1.5 × 1"', '아이템에 붙이는 작은 라벨', 'small item sticker', 'size:1.5in 1in;margin:0'],
  ['2x1', '2 × 1"', '라벨 프린터 (Zebra · Dymo)', 'label printer', 'size:2in 1in;margin:0'],
  ['3x15', '3 × 1.5"', '선반 · 상자', 'shelf · box', 'size:3in 1.5in;margin:0'],
  ['4x6', '4 × 6"', '큰 상자 · 통로 — 코드 · 이름 · 📍 · 큰 바코드', 'big box · aisle — code · name · 📍 · large barcode', 'size:4in 6in;margin:0'],
  ['5160', 'Avery 5160', '2⅝ × 1" · 레터 한 장에 30개', '30 per letter sheet', 'size:letter;margin:0']
];
const barOf = (it, useCode) => it.b || (useCode ? it.c : '');
const PREF_KEY = 'theone.lbl';
const prefGet = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || 'null') || {}; } catch (e) { return {}; } };
const prefPut = o => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ size: o.size, srp: o.srp, price: o.price, loc: o.loc, useCode: o.useCode })); } catch (e) {} };

/** 라벨 인쇄 창 — items: 카탈로그 아이템들 ({c, d, p, s, b, loc}) */
export function labelPrint(items) {
  if (!ok()) return toast(bt('라벨 인쇄는 디자인 · 카탈로그 담당만 할 수 있습니다', 'Labels: Design & Catalog staff only'), 'bad');
  const o = Object.assign({ size: '3x15', n: 1, price: false, srp: true, loc: true, useCode: true }, prefGet());
  if (!SIZES.some(z => z[0] === o.size)) o.size = '3x15';
  const paint = () => {
    $('mbox').innerHTML = '<h2>🏷 ' + bi('라벨 인쇄', 'Print labels') + ' — ' + items.length + bt('개 아이템', ' items') + '</h2>' +
      '<div class="fg"><label>' + bi('라벨 크기', 'Label size') + '</label><div class="lsizes">' + SIZES.map(z => '<button type="button" class="' + (o.size === z[0] ? 'on' : '') + '" data-lz="' + z[0] + '" translate="no"><b>' + z[1] + '</b><small>' + bt(z[2], z[3]) + '</small></button>').join('') + '</div></div>' +
      '<div class="fg"><label>' + bi('아이템마다 몇 장', 'Copies per item') + '</label><input id="lN" type="number" min="1" max="100" inputmode="numeric" value="' + o.n + '" style="width:100px"></div>' +
      [['srp', 'SRP'], ['price', bi('도매가', 'Price')], ['loc', '📍 ' + bi('위치 (통로)', 'Location (aisle)')], ['useCode', bi('바코드 없으면 아이템 코드로', 'Use item code when no barcode')]].map(x => '<label class="pick ' + (o[x[0]] ? 'on' : '') + '" data-lo="' + x[0] + '" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>' + x[1] + '</b></span></label>').join('') +
      (items.some(x => !x.b) ? '<div class="muted" style="margin-top:6px">' + bt('바코드 없는 아이템', 'Items without barcode') + ': ' + items.filter(x => !x.b).length + '</div>' : '') +
      '<div class="hint">🖨 ' + bt('프린터는 인쇄 창에서 고릅니다. 라벨 프린터는 용지 크기를 라벨 크기로 두세요.', 'Pick the printer in the print dialog. On a label printer set the paper size to the label size.') + '</div>' +
      '<div class="btns"><button class="b-ghost" id="lX">' + bt('닫기', 'Close') + '</button><button class="b-blue" id="lGo">🖨 ' + bt('보기 · 인쇄', 'Preview · print') + '</button></div>';
    document.querySelectorAll('[data-lz]').forEach(b => b.onclick = () => { o.size = b.dataset.lz; o.n = Number($('lN').value) || 1; paint(); });
    document.querySelectorAll('[data-lo]').forEach(el => el.onclick = e => { e.preventDefault(); o.n = Number($('lN').value) || 1; o[el.dataset.lo] = !o[el.dataset.lo]; paint(); });
    $('lX').onclick = closeModal;
    $('lGo').onclick = async () => {
      o.n = Math.max(1, Math.min(100, Math.floor(Number($('lN').value) || 1))); prefPut(o); closeModal(); busy(true);
      try { await loadJsBarcode(); } catch (e) { busy(false); return toast(e.message, 'bad'); }
      busy(false);
      const L = []; items.forEach(it => { const v = barOf(it, o.useCode); if (!v) return; for (let i = 0; i < o.n; i++) L.push(it); });
      if (!L.length) return toast(bt('뽑을 바코드가 없습니다', 'No barcodes to print'), 'bad');
      printOpen(labelsHtml(L, o));
    };
  };
  openModal(''); paint();
}
/** 라벨 HTML — 크기별 글자 · 바코드 크기 */
export function labelsHtml(L, o) {
  const z = SIZES.find(x => x[0] === o.size) || SIZES[2], big = o.size === '4x6', mid = o.size === '3x15';
  const bc = { small: { h: 22, w: 1.1, fs: 9 }, '2x1': { h: 26, w: 1.3, fs: 10 }, '3x15': { h: 40, w: 1.8, fs: 12 }, '4x6': { h: 110, w: 3.2, fs: 22 }, '5160': { h: 26, w: 1.3, fs: 10 } }[o.size] || { h: 30, w: 1.4, fs: 10 };
  const dmax = big ? 120 : mid ? 70 : 34;
  return '<style>@page{' + z[4] + '}</style><div class="lbls s' + o.size + '" translate="no">' + L.map(it => {
    const loc = o.loc ? locOf(it) : '';
    return '<div class="lb"><div class="lt"><b>' + esc(it.c) + '</b>' + (o.srp && it.s ? '<span>SRP ' + money(it.s) + '</span>' : '') + (o.price ? '<span>' + money(it.p) + '</span>' : '') + (loc && !big ? '<span class="lloc">📍' + esc(loc) + '</span>' : '') + '</div>' +
      '<div class="ld">' + esc(String(it.d || '').substring(0, dmax)) + '</div>' +
      (big ? '<div class="lloc">' + (loc ? '📍 ' + esc(loc) : '&nbsp;') + '</div>' : '') +
      '<div class="lbc">' + barcodeSvg(barOf(it, o.useCode), bc) + '</div></div>';
  }).join('') + '</div>';
}

/* ---------- #/labels 화면 — 전체 아이템 표 · 검색 · 통로 · 체크 → 인쇄 ---------- */
async function page(arg) {
  if (!ok()) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('디자인 · 카탈로그 담당 · 관리자만 쓰는 화면입니다', 'Design & Catalog staff / admins only') + '</div></div>'; return; }
  $('page').innerHTML = '<div class="load">' + bt('아이템 읽는 중…', 'Loading items…') + '</div>';
  try { await loadCatalog(S); } catch (e) { if (!catalog()) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; } }
  if (arg) { LB.q = decodeURIComponent(arg); LB.sel = new Set(); }
  LB.lim = 300; paint();
  loadJsBarcode().catch(() => {});
}
const aisleOf = it => { const l = locOf(it); const m = /^(\d+)/.exec(String(l || '')); return m ? m[1] : (l || ''); };
function pool() {
  const C = catalog(), q = LB.q.trim();
  let L = q ? searchItems(q, [], 100000, catStart(S), true) : C.items.slice();
  if (LB.aisle) L = L.filter(x => aisleOf(x) === LB.aisle);
  return L;
}
function paint() {
  const C = catalog(), L = pool();
  const aisles = {}; C.items.forEach(x => { const a = aisleOf(x); if (a) aisles[a] = (aisles[a] || 0) + 1; });
  const akeys = Object.keys(aisles).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  $('page').innerHTML = pageHead('🏷 ' + bi('라벨 인쇄', 'Print labels'), bt('아이템을 체크하고 🖨 — 크기는 1.5×1" · 2×1" · 3×1.5" · 4×6" · Avery 5160', 'Check items, then 🖨 — sizes 1.5×1", 2×1", 3×1.5", 4×6", Avery 5160'),
      '<button class="b-ghost b-sm" id="lbAll">☑ ' + bt('보이는 것 전부', 'All shown') + '</button>') +
    '<div class="card" style="padding:10px 12px"><input id="lbQ" placeholder="' + esc(bt('코드 · 이름 · 바코드로 찾기', 'Search code · name · barcode')) + '" value="' + esc(LB.q) + '" autocomplete="off" autocapitalize="characters">' +
    (akeys.length ? '<div class="chips" style="margin-top:8px"><button class="' + (LB.aisle ? '' : 'on') + '" data-la="">' + bt('전체 통로', 'All aisles') + '</button>' + akeys.map(a => '<button class="' + (LB.aisle === a ? 'on' : '') + '" data-la="' + esc(a) + '">📍 ' + esc(a) + ' <small>' + aisles[a] + '</small></button>').join('') + '</div>' : '') +
    '<div class="muted" style="margin-top:6px" id="lbN"></div><div id="lbList"></div><div id="lbMore"></div></div>' +
    '<div class="savebar" id="lbBar" style="display:none"></div>';
  $('lbQ').oninput = debounce(() => { LB.q = $('lbQ').value; LB.lim = 300; list(); }, 150);
  $('lbQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('lbQ').blur(); } };
  document.querySelectorAll('[data-la]').forEach(b => b.onclick = () => { LB.aisle = b.dataset.la; LB.lim = 300; paint(); });
  $('lbAll').onclick = () => { const P = pool(); const all = P.every(x => LB.sel.has(x.c)); P.forEach(x => { if (all) LB.sel.delete(x.c); else LB.sel.add(x.c); }); list(); };
  list();
}
const COLS = () => [
  { h: '☐', f: r => '<span class="ckw"><input type="checkbox" class="ck-big" data-lc="' + esc(r.c) + '"' + (LB.sel.has(r.c) ? ' checked' : '') + '></span>', w: '34px' },
  { h: '', f: r => r.ph ? '<img class="thumb" src="' + esc(thumb(r.ph, 80)) + '" loading="lazy" alt="">' : '<span class="thumb noph">📷</span>', w: '40px' },
  { h: bt('코드', 'Code'), k: 'c', f: r => '<b>' + esc(r.c) + '</b>' + (r.h ? ' <span class="tag t-g">🙈</span>' : ''), cls: 'ct' },
  { h: bt('이름', 'Description'), k: 'd', f: r => esc(r.d || ''), cls: 'wrap' },
  { h: '📍', k: 'loc', sort: r => locOf(r), f: r => esc(locOf(r) || '—') },
  { h: bt('바코드', 'Barcode'), k: 'b', f: r => r.b ? '<span class="sub0">' + esc(r.b) + '</span>' : '<span class="muted">' + bt('코드로', 'code') + '</span>', sm: false },
  { h: 'SRP', k: 's', cls: 'r', f: r => r.s ? money(r.s) : '—', sm: false },
  { h: bt('분류', 'Category'), sort: r => levelsOf(r, catStart(S)).filter(Boolean).join(' › '), f: r => esc(levelsOf(r, catStart(S)).filter(Boolean).map(cleanName).join(' › ')), sm: false }
];
function list() {
  const L = pool(), show = L.slice(0, LB.lim), el = $('lbList'); if (!el) return;
  $('lbN').textContent = L.length.toLocaleString() + bt('개', ' items') + (LB.sel.size ? ' · ✓ ' + LB.sel.size : '');
  el.innerHTML = dtable('labels', COLS(), show, { rowAttr: r => ' data-lr="' + esc(r.c) + '"', rowCls: r => 'tap' + (LB.sel.has(r.c) ? ' on' : ''), empty: bt('맞는 아이템이 없습니다', 'No matching items') });
  $('lbMore').innerHTML = L.length > show.length ? '<button class="b-ghost" id="lbMoreB" style="margin-top:8px">' + bt('더 보기', 'More') + ' (' + (L.length - show.length).toLocaleString() + ')</button>' : '';
  if ($('lbMoreB')) $('lbMoreB').onclick = () => { LB.lim += 300; list(); };
  bindDtable(el, list);
  el.querySelectorAll('[data-lr]').forEach(tr => tr.onclick = e => { if (e.target.closest('[data-dts]')) return; const c = tr.dataset.lr; if (LB.sel.has(c)) LB.sel.delete(c); else LB.sel.add(c); const ck = tr.querySelector('[data-lc]'); if (ck) ck.checked = LB.sel.has(c); tr.classList.toggle('on', LB.sel.has(c)); bar(); });
  bar();
}
function bar() {
  const b = $('lbBar'); if (!b) return; const n = LB.sel.size; b.style.display = n ? '' : 'none'; if (!n) return;
  $('lbN').textContent = pool().length.toLocaleString() + bt('개', ' items') + ' · ✓ ' + n;
  b.innerHTML = '<b>' + n.toLocaleString() + ' ' + bt('개 선택', 'selected') + '</b><span style="flex:1"></span><button class="b-ghost b-sm" id="lbClr">✕</button><button class="b-blue b-sm" id="lbGo">🖨 ' + bt('라벨 인쇄', 'Print labels') + '</button>';
  $('lbClr').onclick = () => { LB.sel = new Set(); list(); };
  $('lbGo').onclick = () => labelPrint(Array.from(LB.sel).map(c => catalog().byCode[c]).filter(Boolean));
}
