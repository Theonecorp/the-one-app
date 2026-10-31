/* ============================================================
 *  📒 카탈로그 · 바코드 — 세일즈맨이 가게에서 아이템을 보여 주고, 바코드를 뽑아 주는 화면 (아이템 목록과 같은 자료)
 *    · 분류(Level 1 › 2 › 3)로 내려가거나 검색 · 📷 카메라로 바코드 스캔 → 그 아이템
 *    · 여러 개 체크 → 🖨 카탈로그(사진 · 가격 · SRP · 바코드) · 🏷 바코드 라벨 · ⬇️ 엑셀(가게 POS 등록용) · 🛒 작성 중 주문에 담기
 *    · 숨김(🙈) 아이템은 안 보임 — 세일즈맨 주문 화면과 같음
 *  바코드 그림: JsBarcode (12자리 UPC-A · 13자리 EAN-13 · 8자리 EAN-8 · 그 외 CODE128, 바코드가 없으면 아이템 코드로)
 * ============================================================ */
import { $, esc, money, toast, busy, openModal, closeModal, Router, debounce, bi, bt, printOpen, today, itabs } from './ui.js';
import { loadCatalog, catalog, searchItems, exactItem, thumb, cleanName, treeFor, levelsOf, catStart, locOf } from './catalog.js';
import { stockOf } from './stock.js';
import { addToWip } from './orders.js';

let S = null;
const CP = { path: [], q: '', view: 'grid', lim: 60, sel: new Set() };
export function register(state) {
  S = state; Router.on('cat', page);
  Router.up.cat = arg => { if (arg) return false; if (CP.path.length) { CP.path.pop(); CP.lim = 60; paint(); return true; } if (CP.q) { CP.q = ''; paint(); return true; } return false; };
  Router.upHas.cat = () => !!(CP.path.length || CP.q);
}
const loadScript = (src, test) => test() ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('불러오지 못했습니다 (인터넷 확인)')); document.head.appendChild(s); });
export const loadJsBarcode = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js', () => !!window.JsBarcode);
export const loadScanner = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js', () => !!window.Html5Qrcode);
const loadXlsx = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => !!window.XLSX);

async function page(arg) {
  $('page').innerHTML = '<div class="load">' + bt('아이템 목록 준비 중…', 'Loading items…') + '</div>';
  try { await loadCatalog(S); } catch (e) { if (!catalog()) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; } }
  if (arg) { const it = exactItem(arg); if (it) { paint(); return itemSheet(it); } CP.q = arg; }
  paint();
  loadJsBarcode().catch(() => {});
}
const levels = x => levelsOf(x, catStart(S));
function current() {
  const C = catalog(), q = CP.q.trim();
  let L = q ? searchItems(q, CP.path, 100000, catStart(S), true) : C.vis;   // 검색은 숨김(🙈 단종 · 재입고 지연)도 포함 — 조회는 누구나, 주문은 담당자만
  if (!q && CP.path.length) L = L.filter(x => { const P = levels(x); return CP.path.every((p, i) => P[i] === p); });
  return L;
}
function paint() {
  const C = catalog();
  let node = treeFor(S); const under = [];
  for (const p of CP.path) { if (node.map[p]) { node = node.map[p]; under.push(p); } else break; }
  CP.path = under;
  const crumbs = '<div class="chips crumbs" style="margin-top:8px">' + (under.length ? '<button class="up" data-cpp="' + (under.length - 1) + '">‹ ' + bi('상위', 'Up') + '</button>' : '') + '<button class="' + (under.length ? '' : 'on') + '" data-cpp="0">' + bi('전체', 'All') + '</button>' + under.map((p, i) => '<button class="' + (i === under.length - 1 ? 'on' : '') + '" data-cpp="' + (i + 1) + '">' + esc(cleanName(p)) + '</button>').join('') + '</div>';
  const kids = CP.q.trim() ? [] : node.kids;
  $('page').innerHTML = '<div class="card"><h2>📒 ' + bi('아이템 · 카탈로그', 'Items · Catalog') + ' <span class="muted" style="font-weight:400;font-size:12px">' + C.vis.length.toLocaleString() + '</span></h2>' +
    '<div class="muted">' + bi('코드 · 이름 · 바코드로 찾고, 누르면 사진 · 가격 · 분류 · 바코드 · 📦 재고 · 📍 위치가 보입니다. 체크해서 카탈로그 인쇄 · 라벨 · 엑셀 · 주문 담기. 📷 로 바코드를 찍어도 됩니다.', 'Search by code, name or barcode; tap for photo, price, category, barcode, stock and location. Check items to print a catalog, labels, export or add to an order. 📷 scans a barcode.') + '</div>' +
    '<div style="display:flex;gap:6px;margin-top:10px"><input id="cpQ" placeholder="' + esc(bt('코드 · 이름 · 바코드', 'Code · name · barcode')) + '" value="' + esc(CP.q) + '" autocomplete="off" autocapitalize="characters" style="flex:1"><button class="b-blue" id="cpScan" style="flex:0 0 auto;width:auto">📷 ' + bi('스캔', 'Scan') + '</button></div>' +
    itabs([['grid', '🖼', '사진', 'Photos'], ['list', '☰', '목록', 'List']], CP.view, 'cpv') +
    crumbs + (kids.length ? '<div class="chips itcats">' + kids.map(k => '<button data-cpk="' + esc(k.name) + '">' + esc(cleanName(k.name)) + ' <span class="en">' + k.n + '</span></button>').join('') + '</div>' : '') + '</div>' +
    '<div class="card"><div id="cpList"></div></div><div class="bulkbar" id="cpBulk" style="display:none"></div>';
  Router.refreshBack();
  document.querySelectorAll('[data-cpp]').forEach(b => b.onclick = () => { CP.path = CP.path.slice(0, +b.dataset.cpp); CP.lim = 60; paint(); });
  document.querySelectorAll('[data-cpk]').forEach(b => b.onclick = () => { CP.path = CP.path.concat([b.dataset.cpk]); CP.lim = 60; paint(); });
  document.querySelectorAll('[data-cpv]').forEach(b => b.onclick = () => { CP.view = b.dataset.cpv; paint(); });
  $('cpQ').oninput = debounce(() => { CP.q = $('cpQ').value; CP.lim = 60; list(); }, 200);
  $('cpQ').onkeydown = e => { if (e.key === 'Enter') { const it = exactItem($('cpQ').value); if (it) { e.preventDefault(); itemSheet(it); } } };
  $('cpScan').onclick = scan;
  list();
}
function list() {
  const all = current(), show = all.slice(0, CP.lim), showList = true;   // 분류를 안 골라도 전체 아이템이 바로 (코드 순) — v0.8.139
  const head = '<div class="muted" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><span>' + (showList ? all.length.toLocaleString() + ' ' + bt('개', 'items') : bt('분류를 고르거나 검색하세요', 'Pick a category or search')) + '</span>' +
    (showList && all.length ? '<label class="tap" style="display:flex;align-items:center;gap:4px;white-space:nowrap"><input type="checkbox" id="cpAll" ' + (all.every(x => CP.sel.has(x.c)) ? 'checked' : '') + '> ' + bi('모두 선택', 'Select all') + ' ' + Math.min(all.length, 1000).toLocaleString() + '</label>' : '') + '</div>';
  $('cpList').innerHTML = head + (showList ? (show.length ? (CP.view === 'grid' ? '<div class="cpgrid">' + show.map(card).join('') + '</div>' : '<div class="dtw"><table class="dt">' + TH() + '<tbody>' + show.map(row).join('') + '</tbody></table></div>') + (all.length > show.length ? '<button class="b-ghost" id="cpMore" style="margin-top:8px">' + bt('더 보기', 'More') + ' (' + (all.length - show.length).toLocaleString() + ')</button>' : '') : '<div class="none">' + bt('맞는 아이템이 없습니다', 'No matching items') + '</div>') : '');
  $('cpList').querySelectorAll('[data-cpi]').forEach(el => el.onclick = () => itemSheet(catalog().byCode[el.dataset.cpi]));
  $('cpList').querySelectorAll('[data-cpc]').forEach(ck => { ck.onclick = e => e.stopPropagation(); ck.onchange = () => { if (ck.checked) CP.sel.add(ck.dataset.cpc); else CP.sel.delete(ck.dataset.cpc); bulk(); }; });
  if ($('cpAll')) $('cpAll').onchange = () => { const on = $('cpAll').checked; all.slice(0, 1000).forEach(x => { if (on) CP.sel.add(x.c); else CP.sel.delete(x.c); }); list(); };
  if ($('cpMore')) $('cpMore').onclick = () => { CP.lim += 60; list(); };
  bulk();
}
const ck = it => '<input type="checkbox" class="cpck" data-cpc="' + esc(it.c) + '" ' + (CP.sel.has(it.c) ? 'checked' : '') + '>';
function card(it) {
  return '<div class="cpcard tap' + (it.h ? ' hid' : '') + '" data-cpi="' + esc(it.c) + '">' + ck(it) + '<div class="cpph">' + (it.ph ? '<img src="' + esc(thumb(it.ph, 300)) + '" loading="lazy" alt="">' : '<span>📦</span>') + '</div><b>' + esc(it.c) + (it.k ? ' 🧩' : '') + (it.h ? ' 🙈' : '') + '</b><small>' + esc(it.d) + '</small><div class="cppr"><b>' + money(it.p) + '</b>' + (it.s ? '<span>SRP ' + money(it.s) + '</span>' : '') + '</div></div>';
}
/* 📊 목록 보기 — 표 (☐ · 사진 · 코드 · 설명 · 가격 · SRP · 바코드) · 줄을 누르면 아이템 창 */
const TH = () => '<thead><tr><th style="width:28px"></th><th style="width:44px"></th><th>' + bt('코드', 'Code') + '</th><th>' + bt('설명', 'Description') + '</th><th class="r">' + bt('가격', 'Price') + '</th><th class="r hs">SRP</th><th class="hs">' + bt('바코드', 'Barcode') + '</th></tr></thead>';
function row(it) {
  return '<tr class="tap' + (it.h ? ' hid' : '') + '" data-cpi="' + esc(it.c) + '"><td>' + ck(it) + '</td><td>' + (it.ph ? '<img class="thumb" src="' + esc(thumb(it.ph, 80)) + '" loading="lazy" alt="">' : '<span class="noph">📦</span>') + '</td><td class="ct"><b>' + esc(it.c) + '</b>' + (it.k ? ' 🧩' : '') + (it.h ? ' <span class="tag t-g">🙈</span>' : '') + '</td><td class="wrap" style="min-width:150px">' + esc(it.d) + '</td><td class="r"><b>' + money(it.p) + '</b></td><td class="r hs sub0">' + (it.s ? money(it.s) : '') + '</td><td class="hs sub0">' + esc(it.b || '') + '</td></tr>';
}
function rowOld(it) {
  return '<div class="pr' + (it.h ? ' hid' : '') + '"><span style="margin-right:8px">' + ck(it) + '</span>' + (it.ph ? '<img src="' + esc(thumb(it.ph, 80)) + '" loading="lazy" style="width:40px;height:40px;object-fit:cover;border-radius:8px;margin-right:8px" alt="">' : '') + '<div class="ct tap" data-cpi="' + esc(it.c) + '"><b>' + esc(it.c) + (it.k ? ' 🧩' : '') + (it.h ? ' <span class="tag t-g">🙈 ' + bt('숨김', 'hidden') + '</span>' : '') + '</b><small>' + esc(it.d) + '</small><small>' + (it.b ? '▮▯ ' + esc(it.b) : '<span class="muted">' + bt('바코드 없음', 'no barcode') + '</span>') + '</small></div><div class="pa"><b>' + money(it.p) + '</b>' + (it.s ? '<small>SRP ' + money(it.s) + '</small>' : '') + '</div></div>';
}
function bulk() {
  const bar = $('cpBulk'); if (!bar) return;
  const n = CP.sel.size; bar.style.display = n ? '' : 'none'; if (!n) return;
  bar.innerHTML = '<b>' + n.toLocaleString() + ' ' + bt('개 선택', 'selected') + '</b><button class="b-ghost b-sm" id="cbCat">🖨 ' + bt('카탈로그', 'Catalog') + '</button><button class="b-ghost b-sm" id="cbLbl">🏷 ' + bt('바코드 라벨', 'Barcode labels') + '</button><button class="b-ghost b-sm" id="cbXls">⬇️ ' + bt('엑셀', 'Excel') + '</button><button class="b-blue b-sm" id="cbOrd">🛒 ' + bt('주문에 담기', 'Add to order') + '</button><button class="b-ghost b-sm" id="cbClr">✕</button>';
  const items = () => Array.from(CP.sel).map(c => catalog().byCode[c]).filter(Boolean);
  $('cbCat').onclick = () => catalogPrint(items());
  $('cbLbl').onclick = () => labelPrint(items());
  $('cbXls').onclick = () => exportXlsx(items());
  $('cbOrd').onclick = () => toOrder(items().map(x => x.c));
  $('cbClr').onclick = () => { CP.sel.clear(); list(); };
}
function toOrder(codes) {
  const n = addToWip(codes);
  toast('🛒 ' + n + ' ' + bt('개를 작성 중 주문에 담았습니다 — 수량은 주문 화면에서', 'added to your draft order — set quantities there'), 'good');
  CP.sel.clear(); closeModal(); Router.go('order', 'new');
}

/* ---------- 바코드 그림 ---------- */
const fmtOf = v => /^\d{12}$/.test(v) ? 'UPC' : /^\d{13}$/.test(v) ? 'EAN13' : /^\d{8}$/.test(v) ? 'EAN8' : 'CODE128';
/** 바코드 SVG 글자 — 바코드가 없거나 숫자 검사가 틀리면 CODE128 로 */
export function barcodeSvg(value, o) {
  o = o || {}; value = String(value || '').trim(); if (!value || !window.JsBarcode) return '';
  const mk = fmt => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); let ok = true; try { window.JsBarcode(el, value, { format: fmt, height: o.h || 40, width: o.w || 1.6, fontSize: o.fs || 13, margin: 0, displayValue: o.text !== false, valid: v => { ok = v; } }); } catch (e) { ok = false; } return ok ? el.outerHTML : ''; };
  return mk(fmtOf(value)) || mk('CODE128');
}
const barOf = (it, useCode) => it.b || (useCode ? it.c : '');

/* ---------- 아이템 한 개 ---------- */
async function itemSheet(it) {
  if (!it) return;
  try { await loadJsBarcode(); } catch (e) {}
  const P = levels(it).filter(Boolean).map(cleanName).join(' › '), loc = locOf(it), staff = S.role !== 'salesman';
  openModal('<h2 style="margin:0 36px 0 0">' + esc(it.c) + (it.k ? ' 🧩' : '') + (it.h ? ' <span class="tag t-g">🙈 ' + bt('숨김 · 주문 불가', 'hidden · not orderable') + '</span>' : '') + '</h2>' +
    (it.ph ? '<img src="' + esc(thumb(it.ph, 700)) + '" alt="" style="width:100%;max-height:40vh;object-fit:contain;border-radius:12px;background:#f8fafc;margin-top:8px">' : '') +
    '<div style="font-weight:700;margin-top:8px;font-size:15px">' + esc(it.d) + '</div><div class="muted">' + esc(P || '—') + '</div>' +
    '<div class="kpi" style="grid-template-columns:1fr 1fr 1fr;margin-top:8px"><div><b>' + money(it.p) + '</b><span>' + bt('도매가', 'Price') + '</span></div><div><b>' + (it.s ? money(it.s) : '—') + '</b><span>SRP</span></div><div><b id="isStk">…</b><span>📦 ' + bt('재고', 'In stock') + '</span></div></div>' +
    '<div class="muted" style="margin-top:6px;display:flex;gap:10px;flex-wrap:wrap"><span>📍 ' + bt('위치', 'Location') + ' <b>' + esc(loc || '—') + '</b></span><span>🏷 ' + bt('바코드', 'Barcode') + ' <b>' + esc(it.b || '—') + '</b></span></div>' +
    (it.k ? '<div class="muted" style="margin-top:6px">🧩 ' + bt('세트 구성', 'Set contents') + ': ' + it.k.map(k => esc(k[0]) + ' × ' + k[1]).join(', ') + '</div>' : '') +
    '<div class="cpbar">' + (barcodeSvg(barOf(it, false), { h: 60, w: 2 }) || '<span class="muted">' + bt('등록된 바코드가 없습니다 — 라벨은 아이템 코드로 뽑습니다', 'No barcode — labels use the item code') + '</span>') + '</div>' +
    '<div class="btns" style="flex-wrap:wrap">' + (it.h && !staff ? '' : '<button class="b-blue" id="isOrd">🛒 ' + bi('주문에 담기', 'Add to order') + '</button>') + '<button class="b-ghost" id="isLbl">🏷 ' + bi('라벨', 'Label') + '</button>' + (staff ? '<button class="b-ghost" id="isEd">✏️ ' + bi('수정', 'Edit') + '</button><button class="b-ghost" id="isStock">📦 ' + bi('재고 기록', 'Stock log') + '</button>' : '') + '</div>');
  /* 📦 지금 재고 — stock/{code} (누구나 읽음) */
  stockOf([it.c]).then(m => { const e = $('isStk'); if (e) { const n = m[it.c] || 0; e.textContent = n.toLocaleString(); e.style.color = n > 0 ? '#15803d' : '#b91c1c'; } }).catch(() => { const e = $('isStk'); if (e) e.textContent = '—'; });
  if ($('isOrd')) $('isOrd').onclick = () => toOrder([it.c]);
  $('isLbl').onclick = () => { closeModal(); labelPrint([it]); };
  if ($('isEd')) $('isEd').onclick = () => { closeModal(); Router.go('items', it.c); };
  if ($('isStock')) $('isStock').onclick = () => { closeModal(); Router.go('stock', it.c); };
}

/* ---------- 📷 스캔 ---------- */
async function scan() {
  openModal('<h2>📷 ' + bi('바코드 스캔', 'Scan barcode') + '</h2><div id="scanBox" style="width:100%;min-height:240px;border-radius:12px;overflow:hidden;background:#0f172a"></div><div class="muted" style="margin-top:6px">' + bt('바코드를 네모 안에 맞추세요', 'Fit the barcode in the box') + '</div><div class="btns"><button class="b-ghost" id="scX">' + bt('닫기', 'Close') + '</button></div>');
  let sc = null, done = false;
  const stop = async () => { if (sc) { try { await sc.stop(); } catch (e) {} try { sc.clear(); } catch (e) {} sc = null; } };
  $('scX').onclick = async () => { await stop(); closeModal(); };
  try {
    await loadScanner();
    const H = window.Html5QrcodeSupportedFormats || {};
    sc = new window.Html5Qrcode('scanBox', { formatsToSupport: [H.UPC_A, H.UPC_E, H.EAN_13, H.EAN_8, H.CODE_128, H.CODE_39, H.QR_CODE].filter(x => x != null), experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false });
    await sc.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 130 } }, async text => {
      if (done) return; done = true; await stop();
      const it = exactItem(text);
      if (it) { if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) {} itemSheet(it); }
      else { closeModal(); CP.q = text; paint(); toast(bt('목록에 없는 바코드입니다', 'Barcode not in the catalog') + ': ' + text, 'bad'); }
    }, () => {});
  } catch (e) { await stop(); if ($('scanBox')) $('scanBox').outerHTML = '<div class="alert a-red">' + esc(bt('카메라를 쓸 수 없습니다 — 브라우저 카메라 권한을 허용하세요', 'Camera not available — allow camera access')) + ' (' + esc(e.message || e) + ')</div>'; }
}

/* ---------- 🖨 카탈로그 ---------- */
function catalogPrint(items) {
  const o = { price: true, srp: true, bar: true, title: '' };
  openModal('<h2>🖨 ' + bi('카탈로그 인쇄', 'Print catalog') + ' — ' + items.length + '</h2>' +
    '<div class="fg"><label>' + bi('제목 (가게 이름 등, 선택)', 'Title (store name etc., optional)') + '</label><input id="cpT" value=""></div>' +
    [['price', bi('도매가', 'Price')], ['srp', 'SRP'], ['bar', bi('바코드', 'Barcode')]].map(x => '<label class="pick on" data-cpo="' + x[0] + '" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>' + x[1] + '</b></span></label>').join('') +
    '<div class="btns"><button class="b-ghost" id="cpX">' + bt('닫기', 'Close') + '</button><button class="b-blue" id="cpGo">🖨 ' + bt('보기 · 인쇄', 'Preview · print') + '</button></div>');
  document.querySelectorAll('[data-cpo]').forEach(el => el.onclick = e => { e.preventDefault(); o[el.dataset.cpo] = !o[el.dataset.cpo]; el.classList.toggle('on', o[el.dataset.cpo]); });
  $('cpX').onclick = closeModal;
  $('cpGo').onclick = async () => {
    o.title = $('cpT').value.trim(); closeModal(); busy(true);
    try { if (o.bar) await loadJsBarcode(); } catch (e) {}
    busy(false);
    const co = (S.settings && S.settings.co && S.settings.co.name) || 'THE ONE CORP';
    printOpen('<div class="cpprint" translate="no"><div class="cphd"><b>' + esc(co) + '</b>' + (o.title ? ' — ' + esc(o.title) : '') + '<span>' + esc(today()) + ' · ' + items.length + ' items</span></div><div class="cpg">' +
      items.map(it => '<div class="cpi">' + (it.ph ? '<img src="' + esc(thumb(it.ph, 400)) + '" alt="">' : '<div class="noph">No photo</div>') + '<b>' + esc(it.c) + '</b><small>' + esc(it.d) + '</small>' +
        (o.price || o.srp ? '<div class="pp">' + (o.price ? '<b>' + money(it.p) + '</b>' : '') + (o.srp && it.s ? '<span>SRP ' + money(it.s) + '</span>' : '') + '</div>' : '') + (o.bar && it.b ? '<div class="bc">' + barcodeSvg(it.b, { h: 28, w: 1.2, fs: 10 }) + '</div>' : '') + '</div>').join('') + '</div></div>');
  };
}

/* ---------- 🏷 바코드 라벨 ---------- */
const SIZES = [['5160', 'Avery 5160 · 2⅝ × 1" (30/sheet)'], ['2x1', '2 × 1" ' + 'label printer (Zebra · Dymo)'], ['shelf', '3 × 1¼" shelf tag']];
function labelPrint(items) {
  const o = { size: '5160', n: 1, price: false, srp: true, useCode: true };
  const paint = () => {
    $('mbox').innerHTML = '<h2>🏷 ' + bi('바코드 라벨', 'Barcode labels') + ' — ' + items.length + '</h2>' +
      '<div class="fg"><label>' + bi('라벨 크기', 'Label size') + '</label><div class="seg" style="flex-wrap:wrap">' + SIZES.map(z => '<button class="' + (o.size === z[0] ? 'on' : '') + '" data-lz="' + z[0] + '" translate="no">' + z[1] + '</button>').join('') + '</div></div>' +
      '<div class="fg"><label>' + bi('아이템마다 몇 장', 'Copies per item') + '</label><input id="lN" type="number" min="1" max="100" inputmode="numeric" value="' + o.n + '" style="width:100px"></div>' +
      [['srp', 'SRP'], ['price', bi('도매가', 'Price')], ['useCode', bi('바코드 없으면 아이템 코드로', 'Use item code when no barcode')]].map(x => '<label class="pick ' + (o[x[0]] ? 'on' : '') + '" data-lo="' + x[0] + '" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>' + x[1] + '</b></span></label>').join('') +
      (items.some(x => !x.b) ? '<div class="muted" style="margin-top:6px">' + bt('바코드 없는 아이템', 'Items without barcode') + ': ' + items.filter(x => !x.b).length + '</div>' : '') +
      '<div class="btns"><button class="b-ghost" id="lX">' + bt('닫기', 'Close') + '</button><button class="b-blue" id="lGo">🖨 ' + bt('보기 · 인쇄', 'Preview · print') + '</button></div>';
    document.querySelectorAll('[data-lz]').forEach(b => b.onclick = () => { o.size = b.dataset.lz; o.n = Number($('lN').value) || 1; paint(); });
    document.querySelectorAll('[data-lo]').forEach(el => el.onclick = e => { e.preventDefault(); o.n = Number($('lN').value) || 1; o[el.dataset.lo] = !o[el.dataset.lo]; paint(); });
    $('lX').onclick = closeModal;
    $('lGo').onclick = async () => {
      o.n = Math.max(1, Math.min(100, Math.floor(Number($('lN').value) || 1))); closeModal(); busy(true);
      try { await loadJsBarcode(); } catch (e) { busy(false); return toast(e.message, 'bad'); }
      busy(false);
      const L = []; items.forEach(it => { const v = barOf(it, o.useCode); if (!v) return; for (let i = 0; i < o.n; i++) L.push(it); });
      if (!L.length) return toast(bt('뽑을 바코드가 없습니다', 'No barcodes to print'), 'bad');
      const big = o.size === 'shelf';
      printOpen('<style>@page{' + ({ '5160': 'size:letter;margin:0', '2x1': 'size:2in 1in;margin:0', shelf: 'size:letter;margin:.4in' })[o.size] + '}</style><div class="lbls s' + o.size + '" translate="no">' + L.map(it => '<div class="lb"><div class="lt"><b>' + esc(it.c) + '</b>' + (o.srp && it.s ? '<span>SRP ' + money(it.s) + '</span>' : '') + (o.price ? '<span>' + money(it.p) + '</span>' : '') + '</div><div class="ld">' + esc(String(it.d || '').substring(0, big ? 60 : 34)) + '</div><div class="lbc">' + barcodeSvg(barOf(it, o.useCode), { h: big ? 34 : 26, w: big ? 1.6 : 1.3, fs: 10 }) + '</div></div>').join('') + '</div>');
    };
  };
  openModal(''); paint();
}

/* ---------- ⬇️ 엑셀 (가게 POS 등록용) ---------- */
async function exportXlsx(items) {
  const head = ['Item Code', 'Description', 'Barcode', 'Price', 'SRP', 'Level 1', 'Level 2', 'Level 3', 'Photo'];
  const rows = items.map(it => [it.c, it.d, it.b || '', it.p, it.s || '', cleanName(it.l1 || ''), cleanName(it.l2 || ''), cleanName(it.l3 || ''), it.ph || '']);
  const name = 'THEONE-items-' + today().replace(/-/g, '');
  busy(true);
  try {
    await loadXlsx();
    const ws = window.XLSX.utils.aoa_to_sheet([head].concat(rows));
    rows.forEach((r, i) => { const c = ws[window.XLSX.utils.encode_cell({ r: i + 1, c: 2 })]; if (c) { c.t = 's'; c.v = String(r[2]); } });   // 바코드는 글자로 (앞의 0 · 지수 표기 방지)
    ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 30 }];
    const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, 'Items');
    window.XLSX.writeFile(wb, name + '.xlsx');
  } catch (e) {
    /* 엑셀 라이브러리가 안 되면 CSV */
    const q = s => { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const blob = new Blob(['﻿' + [head].concat(rows.map(r => r.map((v, i) => i === 2 && v ? '="' + v + '"' : v))).map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  busy(false);
  toast('⬇️ ' + items.length + ' ' + bt('개 내보냄', 'exported'), 'good');
}
