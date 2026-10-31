/* ============================================================
 *  📦 재고 — 창고 직원 · 창고 매니저 · 오피스 · 관리자
 *    · 조회: 코드 · 이름 · 바코드로 찾아 지금 재고(on hand) · 📍 위치 · 최근 움직임
 *    · 입고: 중국에서 들어온 팩킹 리스트(엑셀 · CSV: 코드 + 수량)를 올리면 아이템마다 자동으로 더해짐 — 손으로도 한 줄씩
 *    · 조정: 실사(세어 본 수량으로 맞춤) · ± 조정(이유)
 *    · 자동: 인보이스 발행 → 그 수량만큼 빠짐(세트는 구성품으로) · VOID → 되돌아옴
 *  stock/{code}    = { code, qty, at, by }                                   ← 지금 재고
 *  stockLog/{id}   = { code, d, delta, after, kind: recv|adj|count|inv|void, ref, note, by, at }
 *  receipts/{id}   = { id, d, from, file, n, qty, lines:[{c, q, d}], note, by, at }   ← 입고 한 건
 * ============================================================ */
import { $, esc, money, toast, busy, openModal, closeModal, confirmBox, Router, debounce, bi, bt, today, md, sortBy, itabs } from './ui.js';
import { loadCatalog, catalog, searchItems, exactItem, locOf } from './catalog.js';
import { can } from './main.js';
import { openScanner } from './scan.js';
import { newId } from './db.js';

let S = null;
const ST = { tab: 'find', q: '', recv: [], from: '', file: '', note: '' };
export function register(state) { S = state; Router.on('stock', page); }
const isStaff = () => S.role !== 'salesman';
const who = () => (S.me && S.me.name) || S.user.name || String(S.user.email || '').split('@')[0];

/* ---------- 재고 읽기 · 바꾸기 ---------- */
const STOCK = {};   // code → doc (화면 동안 보관)
export async function stockOf(codes) {
  const need = codes.filter(c => !(c in STOCK));
  for (let i = 0; i < need.length; i += 20) await Promise.all(need.slice(i, i + 20).map(async c => { try { STOCK[c] = await S.DB.get('stock', c); } catch (e) { STOCK[c] = null; } }));
  const out = {}; codes.forEach(c => { out[c] = STOCK[c] ? Number(STOCK[c].qty) || 0 : 0; });
  return out;
}
/** 📦 전체 재고 한 번에 (아이템 목록 · 걸러보기용) — 5분 보관 */
let ALL = null, ALL_AT = 0;
export async function stockAll(force) {
  if (!force && ALL && Date.now() - ALL_AT < 300000) return ALL;
  const rows = await S.DB.list('stock'); const m = {}; rows.forEach(r => { m[r.code || r.id] = Number(r.qty) || 0; STOCK[r.code || r.id] = r; }); ALL = m; ALL_AT = Date.now(); return m;
}
export function dropStockCache() { ALL = null; Object.keys(STOCK).forEach(k => { delete STOCK[k]; }); }
/** 움직임 적용 — moves: [{ c, delta, note? }] (같은 코드는 합침). kind: recv · adj · count · inv · void. count 면 delta 대신 to(세어 본 수량) */
export async function applyMoves(moves, kind, ref, note) {
  const by = {}; moves.forEach(m => { const c = String(m.c || '').toUpperCase(); if (!c) return; by[c] = by[c] || { c, delta: 0, to: null, note: m.note || '' }; if (m.to != null) by[c].to = Number(m.to) || 0; else by[c].delta += Number(m.delta) || 0; });
  const codes = Object.keys(by); if (!codes.length) return 0;
  const cur = await stockOf(codes);
  const now = new Date().toISOString(), d = today(), ops = [];
  codes.forEach(c => {
    const m = by[c], before = cur[c], after = m.to != null ? m.to : before + m.delta, delta = after - before;
    if (!delta && m.to == null) return;
    ops.push({ op: 'set', col: 'stock', id: c, data: { code: c, qty: after, at: now, by: S.user.email } });
    ops.push({ op: 'set', col: 'stockLog', id: newId('L'), data: { code: c, d, delta, before, after, kind, ref: ref || '', note: (note || '') + (m.note ? (note ? ' · ' : '') + m.note : ''), by: S.user.email, byName: who(), at: now } });
    STOCK[c] = { code: c, qty: after, at: now };
  });
  if (ops.length) await S.DB.batch(ops);
  return ops.length / 2;
}
/** 인보이스 줄 → 재고 움직임 (세트는 구성품으로, pq 가 있으면 픽킹 수량) */
export function movesOfLines(lines, sign) {
  const out = [];
  (lines || []).forEach(l => {
    const q = Number(l.q) || 0; if (!q) return;
    if (l.kit && l.kit.length) l.kit.forEach(k => out.push({ c: k.c, delta: sign * q * (Number(k.q) || 0) }));
    else out.push({ c: l.c, delta: sign * q });
  });
  return out;
}
/** 인보이스 발행 뒤 — 그 수량만큼 빼기 (실패해도 인보이스는 그대로, 로그에만) */
export async function stockOut(invs) { try { for (const v of invs) await applyMoves(movesOfLines(v.lines, -1), 'inv', v.no, bt('인보이스 발행', 'Invoice issued')); } catch (e) { console.warn('stock out', e); } }
/** VOID 뒤 — 되돌리기 */
export async function stockBack(invs) { try { for (const v of invs) if (v.lines && v.lines.length) await applyMoves(movesOfLines(v.lines, 1), 'void', v.no, 'VOID'); } catch (e) { console.warn('stock back', e); } }

/* ---------- 팩킹 리스트 읽기 — 코드 + 수량 두 칸만 (머리글이 있으면 그걸로, 없으면 코드 모양인 칸 · 숫자 칸) ---------- */
export function parsePacking(aoa, byCode) {
  const rows = (aoa || []).filter(r => r && r.some(v => String(v == null ? '' : v).trim() !== ''));
  if (!rows.length) return { lines: [], unknown: [], hdr: null };
  const S_ = v => String(v == null ? '' : v).trim();
  const CODE_H = /^(item\s*)?(code|sku|item\s*(#|no|number)?|style|model|품번|코드|货号|型号|款号|编号)\b/i, QTY_H = /^(qty|quantity|pcs|pieces|total\s*(qty|pcs)|수량|개수|数量|件数|总数)/i;
  let hi = -1, ci = -1, qi = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const h = rows[r].map(S_); const c = h.findIndex(x => CODE_H.test(x)), q = h.findIndex(x => QTY_H.test(x));
    if (c >= 0 && q >= 0) { hi = r; ci = c; qi = q; break; }
  }
  if (hi < 0) {
    /* 머리글 없음 — 코드 모양(목록에 있는 코드) 칸과 그 오른쪽 숫자 칸 */
    const sample = rows.slice(0, 30), W = Math.max(...sample.map(r => r.length));
    let best = -1, bestN = 0;
    for (let c = 0; c < W; c++) { const n = sample.filter(r => byCode && byCode[S_(r[c]).toUpperCase()]).length; if (n > bestN) { bestN = n; best = c; } }
    if (best < 0) return { lines: [], unknown: [], hdr: null, err: bt('코드 칸을 못 찾았습니다 — 머리글(Code · Qty)을 넣거나 첫 칸이 코드인 표로 올리세요', 'Could not find the code column — add a Code · Qty header') };
    ci = best;
    const qCands = []; for (let c = 0; c < W; c++) { if (c === ci) continue; const n = sample.filter(r => S_(r[c]) !== '' && isFinite(Number(S_(r[c]).replace(/,/g, '')))).length; qCands.push([c, n, c > ci ? 0 : 1]); }
    qCands.sort((a, b) => b[1] - a[1] || a[2] - b[2] || a[0] - b[0]); qi = qCands.length ? qCands[0][0] : -1;
    if (qi < 0) return { lines: [], unknown: [], hdr: null, err: bt('수량 칸을 못 찾았습니다', 'Could not find the quantity column') };
  }
  const by = {}, unknown = [], order = [];
  rows.slice(hi + 1).forEach(r => {
    const raw = S_(r[ci]); if (!raw) return;
    const q = Math.round(Number(S_(r[qi]).replace(/,/g, '')) || 0); if (!q) return;
    const it = byCode ? (byCode[raw.toUpperCase()] || null) : null;
    const code = it ? it.c : raw.toUpperCase();
    if (!it) { if (!unknown.includes(code)) unknown.push(code); }
    if (!by[code]) { by[code] = { c: code, q: 0, d: it ? it.d : '', ok: !!it }; order.push(code); }
    by[code].q += q;
  });
  return { lines: order.map(c => by[c]), unknown, hdr: hi >= 0 ? { code: S_(rows[hi][ci]), qty: S_(rows[hi][qi]) } : null };
}

/* ---------- 화면 ---------- */
async function page(arg) {
  if (!isStaff() || !can('items')) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('재고는 창고 · 오피스 담당자가 봅니다', 'Inventory is for warehouse and office staff') + '</div></div>'; return; }
  if (arg && ['find', 'recv', 'log', 'low'].includes(arg)) ST.tab = arg; else if (arg) { ST.tab = 'find'; ST.q = decodeURIComponent(arg); }   // 아이템 코드로 열면 조회 탭에서 그 코드
  try { await loadCatalog(S); } catch (e) {}
  const T = [['find', '🔍', '조회', 'Find'], ['recv', '📥', '입고', 'Receive'], ['log', '📋', '기록', 'History'], ['low', '⚠️', '부족', 'Low']];
  $('page').innerHTML = '<div class="card" style="padding:12px 14px 8px"><h2 style="margin:0">📦 ' + bi('재고', 'Inventory') + '</h2>' + itabs(T, ST.tab, 'sk') + '</div><div id="skBody"></div>';
  document.querySelectorAll('[data-sk]').forEach(b => b.onclick = () => { ST.tab = b.dataset.sk; page(); });
  if (ST.tab === 'recv') return paintRecv();
  if (ST.tab === 'log') return paintLog();
  if (ST.tab === 'low') return paintLow();
  return paintFind();
}
const itemRow = (it, qty, extra) => '<div class="pr tap" data-sti="' + esc(it.c) + '"><div class="ct"><b>' + esc(it.c) + (locOf(it) ? ' <span class="loc">📍' + esc(locOf(it)) + '</span>' : '') + '</b><small>' + esc(it.d || '') + (extra ? ' · ' + extra : '') + '</small></div><div class="pa"><b' + (qty <= 0 ? ' class="warn"' : '') + '>' + (qty == null ? '—' : qty.toLocaleString()) + '</b><small>' + bt('재고', 'on hand') + '</small></div></div>';

/* 🔍 조회 */
async function paintFind() {
  const box = $('skBody');
  box.innerHTML = '<div class="card"><div style="display:flex;gap:6px"><input id="skQ" placeholder="' + esc(bt('코드 · 이름 · 바코드 (스캔)', 'Code · name · barcode (scan)')) + '" value="' + esc(ST.q) + '" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:0"><button type="button" class="b-ghost ib" id="skScan" title="' + esc(bt('바코드 스캔', 'Scan')) + '">📷</button></div><div class="muted" style="margin-top:6px">' + bt('아이템을 누르면 재고 기록 · ✏️ 조정(실사 · ±)', 'Tap an item for its history and ✏️ adjust (count · ±)') + '</div><div id="skRes" style="margin-top:8px"></div></div>';
  if ($('skScan')) $('skScan').onclick = () => openScanner(code => { const it = exactItem(code); $('skQ').value = it ? it.c : code; paint(); });
  const paint = async () => {
    const q = $('skQ').value.trim(); ST.q = q; const res = $('skRes'); if (!res) return;
    /* 전체 아이템이 기본 (코드 순) · 치는 대로 걸러짐 — 📊 표: 코드 · 이름 · 📍 통로 · 📦 재고 · 가격 */
    const C = catalog(), ex = q ? exactItem(q) : null;
    const hits = q ? (ex ? [ex] : []).concat((searchItems(q, [], 100000, undefined, true) || []).filter(x => !ex || x.c !== ex.c)) : C.items.filter(x => !x.virt);
    if (!hits.length) { res.innerHTML = '<div class="none">' + bt('없음', 'No match') + '</div>'; return; }
    if (!ST.all) { res.innerHTML = '<div class="load">…</div>'; try { ST.all = await stockAll(); } catch (e) { ST.all = {}; } if ($('skQ').value.trim() !== q) return; }
    const st = ST.all, lim = ST.lim || 200, show = hits.slice(0, lim), nIn = hits.filter(x => (st[x.c] || 0) > 0).length;
    res.innerHTML = '<div class="muted" style="margin:0 0 6px">' + hits.length.toLocaleString() + bt('개', ' items') + ' · 📦 ' + bt('재고 있음', 'in stock') + ' ' + nIn.toLocaleString() + '</div>' +
      '<div class="dtw"><table class="dt"><thead><tr><th>' + bt('코드', 'Code') + '</th><th>' + bt('이름', 'Name') + '</th><th>📍 ' + bt('통로', 'Aisle') + '</th><th class="r">📦 ' + bt('재고', 'Stock') + '</th><th class="r hs">' + bt('가격', 'Price') + '</th></tr></thead><tbody>' +
      show.map(it => { const n = st[it.c] || 0; return '<tr class="tap' + (it.h ? ' hid' : '') + '" data-sti="' + esc(it.c) + '"><td><b>' + esc(it.c) + '</b>' + (it.h ? ' 🙈' : '') + '</td><td class="wrap" style="min-width:150px">' + esc(it.d || '') + '</td><td>' + (locOf(it) ? '<span class="loc">' + esc(locOf(it)) + '</span>' : '<span class="muted">—</span>') + '</td><td class="r">' + (n > 0 ? '<span class="stk' + (n < 12 ? ' slow' : '') + '">' + n.toLocaleString() + '</span>' : '<span class="stk s0">' + bt('없음', 'out') + '</span>') + '</td><td class="r hs">' + (it.p ? money(it.p) : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      (hits.length > show.length ? '<button class="b-ghost" id="skMore" style="margin-top:8px">' + bt('더 보기', 'More') + ' (' + (hits.length - show.length).toLocaleString() + ')</button>' : '');
    res.querySelectorAll('[data-sti]').forEach(el => el.onclick = () => itemSheet(el.dataset.sti, () => { ST.all = null; paint(); }));
    if ($('skMore')) $('skMore').onclick = () => { ST.lim = lim + 200; paint(); };
  };
  $('skQ').oninput = debounce(() => { ST.lim = 200; paint(); }, 200); $('skQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const ex = exactItem($('skQ').value.trim()); if (ex) itemSheet(ex.c, paint); } };
  paint(); if (!('ontouchstart' in window)) $('skQ').focus();
}
/** 아이템 한 장 — 재고 · 위치 · 최근 움직임 · ✏️ 실사 / ± 조정 */
export async function itemSheet(code, done) {
  const it = catalog().byCode[code] || { c: code, d: '' };
  openModal('<div class="load">…</div>');
  const st = await stockOf([code]); let log = [];
  try { log = sortBy(await S.DB.list('stockLog', { where: [['code', '==', code]] }), x => x.at || '', true).slice(0, 30); } catch (e) {}
  const K = { recv: '📥 ' + bt('입고', 'Received'), adj: '✏️ ' + bt('조정', 'Adjust'), count: '🔢 ' + bt('실사', 'Count'), inv: '🧾 ' + bt('인보이스', 'Invoice'), void: '↩️ VOID' };
  $('mbox').innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">' + esc(it.c) + '</h2><div class="muted">' + esc(it.d || '') + (locOf(it) ? ' · 📍 ' + esc(locOf(it)) : '') + (it.p ? ' · ' + money(it.p) : '') + '</div></div><button class="b-ghost b-sm xin" id="skX">✕</button></div>' +
    '<div class="kpi" style="margin-top:10px"><div><b' + (st[code] <= 0 ? ' class="warn"' : '') + '>' + st[code].toLocaleString() + '</b><span>' + bt('지금 재고', 'On hand') + '</span></div><div><b>' + (STOCK[code] && STOCK[code].at ? esc(md(STOCK[code].at.substring(0, 10))) : '—') + '</b><span>' + bt('마지막 변동', 'Last change') + '</span></div></div>' +
    '<div class="two" style="margin-top:10px"><div class="fg"><label>🔢 ' + bt('실사 — 세어 본 수량', 'Count — qty on shelf') + '</label><input type="number" inputmode="numeric" id="skCnt" placeholder="' + st[code] + '"></div><div class="fg"><label>± ' + bt('조정 (예: -3 · 12)', 'Adjust (e.g. -3 · 12)') + '</label><input type="number" inputmode="numeric" id="skAdj" placeholder="0"></div></div>' +
    '<div class="fg"><label>' + bt('이유 · 메모', 'Reason · note') + '</label><input id="skWhy" placeholder="' + esc(bt('예: 파손 · 분실 · 세어 봄 · 샘플', 'e.g. damaged · lost · counted · sample')) + '"></div>' +
    '<div class="btns" style="margin-top:4px"><button class="b-blue" id="skSave">💾 ' + bt('저장', 'Save') + '</button></div>' +
    '<h2 style="font-size:14px;margin-top:12px">📋 ' + bt('최근 움직임', 'Recent moves') + '</h2>' + (log.length ? '<table><tr><th>' + bt('날짜', 'Date') + '</th><th>' + bt('종류', 'Kind') + '</th><th class="r">±</th><th class="r">' + bt('재고', 'After') + '</th><th>' + bt('메모', 'Note') + '</th></tr>' + log.map(x => '<tr><td>' + esc(md(x.d)) + '</td><td>' + (K[x.kind] || esc(x.kind)) + (x.ref ? ' <span class="muted">' + esc(x.ref) + '</span>' : '') + '</td><td class="r"><b' + (x.delta < 0 ? ' class="warn"' : '') + '>' + (x.delta > 0 ? '+' : '') + x.delta + '</b></td><td class="r">' + x.after + '</td><td class="muted" style="font-size:11px">' + esc(x.note || '') + (x.byName ? ' · ' + esc(x.byName) : '') + '</td></tr>').join('') + '</table>' : '<div class="none">' + bt('기록 없음', 'No moves yet') + '</div>');
  $('skX').onclick = closeModal;
  $('skSave').onclick = async () => {
    const cnt = $('skCnt').value.trim(), adj = Number($('skAdj').value) || 0, why = $('skWhy').value.trim();
    if (cnt === '' && !adj) return toast(bt('실사 수량이나 ± 조정을 넣으세요', 'Enter a count or an adjustment'), 'bad');
    if (!why && adj) return toast(bt('조정 이유를 적어 주세요', 'Give a reason'), 'bad');
    busy(true);
    try { await applyMoves(cnt !== '' ? [{ c: code, to: Number(cnt) }] : [{ c: code, delta: adj }], cnt !== '' ? 'count' : 'adj', '', why || bt('실사', 'Count')); toast('💾 ' + code + ' → ' + STOCK[code].qty, 'good'); closeModal(); if (done) done(); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}

/* 📥 입고 — 팩킹 리스트 파일 또는 손으로 */
function paintRecv() {
  const box = $('skBody'), L = ST.recv, tot = L.reduce((a, l) => a + l.q, 0), bad = L.filter(l => !l.ok);
  box.innerHTML = '<div class="card"><h2 style="font-size:15px">📥 ' + bi('들어온 물건 — 팩킹 리스트', 'Incoming — packing list') + '</h2><div class="muted">' + bt('중국 공장 팩킹 리스트(엑셀 · CSV)를 올리면 코드 + 수량 두 칸만 읽어 아이템마다 더합니다. 손으로는 아래 코드 · 수량으로 한 줄씩. 다 맞으면 💾 입고 저장.', 'Upload the factory packing list (xlsx · csv); only the code and quantity columns are read. Or add lines by hand below. Then 💾 Save receipt.') + '</div>' +
    '<div class="two" style="margin-top:8px"><div class="fg"><label>' + bt('날짜', 'Date') + '</label><input type="date" id="rvD" value="' + esc(ST.d || today()) + '"></div><div class="fg"><label>' + bt('어디서 (공장 · 컨테이너)', 'From (factory · container)') + '</label><input id="rvFrom" value="' + esc(ST.from) + '" placeholder="e.g. SHENGXING · CNTR 2026-10"></div></div>' +
    '<div class="fg"><label>📎 ' + bt('팩킹 리스트 파일', 'Packing list file') + '</label><input type="file" id="rvFile" accept=".xlsx,.xls,.csv,.txt"></div>' +
    '<div class="fg"><label>✍️ ' + bt('손으로 — 코드 (스캔) → 수량 → Enter', 'By hand — code (scan) → qty → Enter') + '</label><div style="display:flex;gap:6px"><input id="rvC" placeholder="' + esc(bt('코드 · 바코드', 'Code · barcode')) + '" autocomplete="off" autocapitalize="characters" style="flex:2"><input id="rvQ" type="number" inputmode="numeric" placeholder="' + esc(bt('수량', 'Qty')) + '" style="flex:1"><button class="b-ghost" id="rvAdd">＋</button></div></div>' +
    '<div id="rvOut"></div></div>' +
    '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:15px;margin:0">' + bt('입고 목록', 'Lines') + ' ' + L.length + bt('줄 · ', ' · ') + tot.toLocaleString() + bt('개', ' pcs') + '</h2>' + (L.length ? '<button class="b-ghost b-sm" id="rvClr">🗑 ' + bt('비우기', 'Clear') + '</button>' : '') + '</div>' +
    (bad.length ? '<div class="alert a-amb">⚠️ ' + bt('목록에 없는 코드', 'Unknown codes') + ' ' + bad.length + ': ' + esc(bad.map(l => l.c).slice(0, 10).join(', ')) + ' — ' + bt('저장하면 재고 코드로 그대로 들어갑니다. 틀린 코드는 ✕ 로 빼세요.', 'They are saved under that code as is; remove typos with ✕.') + '</div>' : '') +
    (L.length ? '<table><tr><th>' + bt('코드', 'Code') + '</th><th>' + bt('이름', 'Name') + '</th><th class="r">' + bt('수량', 'Qty') + '</th><th></th></tr>' + L.map((l, i) => '<tr' + (l.ok ? '' : ' style="background:#fef2f2"') + '><td><b>' + esc(l.c) + '</b></td><td class="muted" style="font-size:11.5px">' + esc(l.d || (l.ok ? '' : bt('목록에 없음', 'unknown'))) + '</td><td class="r"><input type="number" inputmode="numeric" class="sm" data-rvq="' + i + '" value="' + l.q + '" style="width:70px;text-align:right"></td><td><button class="b-ghost b-sm" data-rvx="' + i + '">✕</button></td></tr>').join('') + '</table>' : '<div class="none">' + bt('파일을 올리거나 코드를 치세요', 'Upload a file or type a code') + '</div>') +
    (L.length ? '<div class="fg" style="margin-top:8px"><label>' + bt('메모', 'Note') + '</label><input id="rvNote" value="' + esc(ST.note) + '"></div><div class="btns"><button class="b-green" id="rvSave">💾 ' + bt('입고 저장', 'Save receipt') + ' — ' + tot.toLocaleString() + bt('개', ' pcs') + '</button></div>' : '') + '</div>';
  const keep = () => { ST.d = $('rvD').value; ST.from = $('rvFrom').value; if ($('rvNote')) ST.note = $('rvNote').value; };
  $('rvD').onchange = keep; $('rvFrom').oninput = keep; if ($('rvNote')) $('rvNote').oninput = keep;
  $('rvFile').onchange = async () => {
    const f = $('rvFile').files[0]; if (!f) return; const out = $('rvOut'); out.innerHTML = '<div class="muted">' + bt('읽는 중…', 'Reading…') + '</div>'; busy(true);
    try {
      let aoa = [];
      if (/\.(csv|txt)$/i.test(f.name)) { const tx = (await f.text()).replace(/^﻿/, ''); const dl = (tx.split(/\r?\n/)[0] || '').includes('\t') ? '\t' : (tx.split(/\r?\n/)[0] || '').includes(';') ? ';' : ','; aoa = tx.split(/\r?\n/).map(r => r.split(dl).map(x => x.replace(/^"|"$/g, '').trim())); }
      else { const A = await import('./admin.js'); const { XLSX, wb } = await A.readBook(f); aoa = []; wb.SheetNames.forEach(n => { const t = A.aoa(XLSX, wb, n); if (t) aoa = aoa.concat(t, [[]]); }); }
      const P = parsePacking(aoa, catalog().byCode);
      if (P.err) { out.innerHTML = '<div class="alert a-red">' + esc(P.err) + '</div>'; busy(false); return; }
      P.lines.forEach(l => { const ex = ST.recv.find(x => x.c === l.c); if (ex) ex.q += l.q; else ST.recv.push(l); });
      ST.file = f.name; keep();
      toast('📎 ' + f.name + ' — ' + P.lines.length + bt('줄', ' lines') + (P.hdr ? ' (' + P.hdr.code + ' · ' + P.hdr.qty + ')' : ''), 'good');
      paintRecv();
    } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; }
    busy(false);
  };
  const add = () => { const raw = $('rvC').value.trim(), q = Math.round(Number($('rvQ').value) || 0); if (!raw) return; if (!q) { $('rvQ').focus(); return toast(bt('수량을 넣으세요', 'Enter the quantity'), 'bad'); } const it = exactItem(raw); const c = it ? it.c : raw.toUpperCase(); const ex = ST.recv.find(x => x.c === c); if (ex) ex.q += q; else ST.recv.push({ c, q, d: it ? it.d : '', ok: !!it }); keep(); paintRecv(); setTimeout(() => { if ($('rvC')) $('rvC').focus(); }, 30); };
  $('rvAdd').onclick = add; $('rvQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }; $('rvC').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('rvQ').focus(); $('rvQ').select(); } };
  box.querySelectorAll('[data-rvq]').forEach(i => i.onchange = () => { ST.recv[+i.dataset.rvq].q = Math.round(Number(i.value) || 0); keep(); paintRecv(); });
  box.querySelectorAll('[data-rvx]').forEach(b => b.onclick = () => { ST.recv.splice(+b.dataset.rvx, 1); keep(); paintRecv(); });
  if ($('rvClr')) $('rvClr').onclick = () => { ST.recv = []; ST.file = ''; paintRecv(); };
  if ($('rvSave')) $('rvSave').onclick = async () => {
    keep(); const Ls = ST.recv.filter(l => l.q > 0); if (!Ls.length) return;
    if (!(await confirmBox('📥 ' + Ls.length + bt('줄 · ', ' lines · ') + Ls.reduce((a, l) => a + l.q, 0).toLocaleString() + bt('개를 재고에 더할까요?', ' pcs — add to inventory?') + (ST.from ? '\n' + ST.from : ''), bt('입고 저장', 'Save')))) return;
    busy(true);
    try {
      const id = newId('R'), now = new Date().toISOString(), d = ST.d || today();
      await S.DB.set('receipts', id, { id, d, from: ST.from || '', file: ST.file || '', n: Ls.length, qty: Ls.reduce((a, l) => a + l.q, 0), lines: Ls.map(l => ({ c: l.c, q: l.q, d: l.d || '' })), note: ST.note || '', by: S.user.email, byName: who(), at: now });
      await applyMoves(Ls.map(l => ({ c: l.c, delta: l.q })), 'recv', id, (ST.from ? ST.from : bt('입고', 'Receipt')) + (ST.file ? ' · ' + ST.file : ''));
      toast('📥 ' + Ls.length + bt('줄 입고 — 재고에 더했습니다', ' lines received'), 'good');
      ST.recv = []; ST.file = ''; ST.from = ''; ST.note = ''; ST.tab = 'log'; page();
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}

/* 📋 기록 — 입고 건 · 최근 움직임 */
async function paintLog() {
  const box = $('skBody'); box.innerHTML = '<div class="load">…</div>';
  let R = [], L = [];
  try { R = sortBy(await S.DB.list('receipts', { order: ['at', 'desc'], limit: 50 }), x => x.at || '', true); } catch (e) { try { R = sortBy(await S.DB.list('receipts'), x => x.at || '', true).slice(0, 50); } catch (x) {} }
  try { L = sortBy(await S.DB.list('stockLog', { order: ['at', 'desc'], limit: 150 }), x => x.at || '', true); } catch (e) { try { L = sortBy(await S.DB.list('stockLog'), x => x.at || '', true).slice(0, 150); } catch (x) {} }
  const K = { recv: '📥', adj: '✏️', count: '🔢', inv: '🧾', void: '↩️' };
  box.innerHTML = '<div class="card"><h2 style="font-size:15px">📥 ' + bi('입고 기록', 'Receipts') + ' ' + R.length + '</h2>' + (R.length ? R.map(r => '<div class="pr tap" data-rcp="' + esc(r.id) + '"><div class="ct"><b>' + esc(md(r.d)) + ' · ' + esc(r.from || bt('입고', 'Receipt')) + '</b><small>' + (r.file ? '📎 ' + esc(r.file) + ' · ' : '') + esc(r.byName || '') + (r.note ? ' · ' + esc(r.note) : '') + '</small></div><div class="pa"><b>' + Number(r.qty || 0).toLocaleString() + '</b><small>' + r.n + bt('줄', ' lines') + '</small></div></div>').join('') : '<div class="none">' + bt('입고 기록 없음', 'No receipts yet') + '</div>') + '</div>' +
    '<div class="card"><h2 style="font-size:15px">📋 ' + bi('최근 움직임', 'Recent moves') + '</h2>' + (L.length ? '<table><tr><th>' + bt('날짜', 'Date') + '</th><th>' + bt('코드', 'Code') + '</th><th class="r">±</th><th class="r">' + bt('재고', 'After') + '</th><th>' + bt('메모', 'Note') + '</th></tr>' + L.map(x => '<tr class="tap" data-sti="' + esc(x.code) + '"><td>' + esc(md(x.d)) + '</td><td><b>' + esc(x.code) + '</b></td><td class="r"><b' + (x.delta < 0 ? ' class="warn"' : '') + '>' + (K[x.kind] || '') + ' ' + (x.delta > 0 ? '+' : '') + x.delta + '</b></td><td class="r">' + x.after + '</td><td class="muted" style="font-size:11px">' + esc(x.ref || '') + (x.note ? ' · ' + esc(x.note) : '') + (x.byName ? ' · ' + esc(x.byName) : '') + '</td></tr>').join('') + '</table>' : '<div class="none">' + bt('움직임 없음', 'No moves yet') + '</div>') + '</div>';
  box.querySelectorAll('[data-sti]').forEach(el => el.onclick = () => itemSheet(el.dataset.sti, paintLog));
  box.querySelectorAll('[data-rcp]').forEach(el => el.onclick = () => { const r = R.find(x => x.id === el.dataset.rcp); if (!r) return; openModal('<h2>📥 ' + esc(md(r.d)) + ' · ' + esc(r.from || '') + '</h2><div class="muted">' + (r.file ? '📎 ' + esc(r.file) + ' · ' : '') + esc(r.byName || '') + ' · ' + r.n + bt('줄', ' lines') + ' · ' + Number(r.qty || 0).toLocaleString() + bt('개', ' pcs') + (r.note ? '<br>📝 ' + esc(r.note) : '') + '</div><div style="max-height:50vh;overflow:auto;margin-top:8px"><table><tr><th>' + bt('코드', 'Code') + '</th><th>' + bt('이름', 'Name') + '</th><th class="r">' + bt('수량', 'Qty') + '</th></tr>' + (r.lines || []).map(l => '<tr><td><b>' + esc(l.c) + '</b></td><td class="muted" style="font-size:11.5px">' + esc(l.d || '') + '</td><td class="r">' + l.q + '</td></tr>').join('') + '</table></div><div class="btns"><button class="b-ghost" id="rcX">' + bt('닫기', 'Close') + '</button></div>'); $('rcX').onclick = closeModal; });
}

/* ⚠️ 부족 — 재고 0 이하 */
async function paintLow() {
  const box = $('skBody'); box.innerHTML = '<div class="load">…</div>';
  let L = []; try { L = (await S.DB.list('stock')).filter(x => Number(x.qty) <= 0); } catch (e) {}
  L = sortBy(L, x => Number(x.qty) || 0);
  const C = catalog().byCode;
  box.innerHTML = '<div class="card"><h2 style="font-size:15px">⚠️ ' + bi('재고 0 이하', 'Out of stock or negative') + ' ' + L.length + '</h2><div class="muted">' + bt('인보이스로 나간 수량이 입고보다 많으면 마이너스가 됩니다 — 실사해서 맞추세요.', 'Negative means more was invoiced than received — count and fix.') + '</div>' + (L.length ? L.slice(0, 300).map(x => itemRow(C[x.code] || { c: x.code, d: '' }, Number(x.qty) || 0)).join('') : '<div class="none">' + bt('없음', 'None') + '</div>') + '</div>';
  box.querySelectorAll('[data-sti]').forEach(el => el.onclick = () => itemSheet(el.dataset.sti, paintLow));
}
