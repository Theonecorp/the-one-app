/* ============================================================
 *  📋 아이템 일괄 등록 · 🗑 일괄 삭제 — 엑셀처럼 칸(셀)에 쭉 적거나, 엑셀에서 복사한 표를 아무 칸에나 붙여 넣으면 등록 (v0.8.172: 한 칸 textarea → 셀 격자)
 *    ① 셀 격자: 열은 Code · Description · Price · SRP · Barcode · Level 1 · 2 · 3 · Location (코드 · 이름 · 도매가는 필수). Enter = 아래 칸, 마지막 줄에 적으면 줄이 늘어남.
 *       붙여넣기: 첫 줄이 머리글이면 이름으로 열을 찾아 0열부터 채우고(SmartBee 열 이름 Item No · Unit Price · PLine · Category1 · Group 도 됨),
 *       머리글이 없으면 붙여 넣은 칸부터 순서대로 채움. 줄마다 상태 표시: 🆕 새 아이템 · ✏️ 있는 코드(적은 칸만 바뀜 · 지금 값은 흐리게) · ⚠️ 이름 · 가격 없음
 *       없는 코드 + Description + Price = 새 아이템 · 있는 코드 = 적은 칸만 바꿈 (빈 칸은 그대로)
 *    ② 삭제: 찾아서 체크 → 🗑 선택 삭제 (또는 🙈 숨김) — 인보이스 · 주문 기록은 그대로, 아이템 목록에서만 빠짐
 *  (ui) #/items/bulk  — 담당자 · 관리자
 * ============================================================ */
import { $, esc, money, toast, busy, confirmBox, Router, debounce, bi, bt, pageHead } from './ui.js';
import { loadCatalog, catalog, editCatalog, parseBulkSheet, applyBulk, searchItems, cleanName } from './catalog.js';

let S = null, TAB = 'add', DQ = '', DL1 = '', SEL = new Set();
export function register(state) { S = state; }

/* SmartBee 열 이름 → 앱 열 이름 (parseBulkSheet 가 아는 이름으로) */
const SB_MAP = [[/^item\s*(no\.?|number|#)$/i, 'Code'], [/^unit\s*price$/i, 'Price'], [/^pline$/i, 'Level 1'], [/^category\s*1$/i, 'Level 2'], [/^price\s*group$/i, ''], [/^u\/?m$/i, ''], [/^qty$/i, ''], [/^group$/i, 'Level 3'], [/^price$/i, 'SRP']];
const DEFAULT_HDR = ['Code', 'Description', 'Price', 'SRP', 'Barcode', 'Level 1', 'Level 2', 'Level 3', 'Location'];
const KNOWN = /^(code|item\s*code|item\s*#?|sku|new\s*code|description|desc|name|price|srp|retail|barcode|upc|group|level\s*[123]|l[123]|photo|image|hide|hidden|show|visible|delete|remove|location|loc|bin|aisle|코드|아이템\s*코드|디스크립션|설명|가격|바코드|그룹|사진|숨김|삭제|위치|통로|item\s*no\.?|unit\s*price|pline|category\s*1|price\s*group|u\/?m|qty)$/i;
/** 붙여 넣은 글 → 2차원 표 (탭 · 쉼표 · 세미콜론) + 머리글 정리. SmartBee 머리글이면 바꿔 읽음 */
export function parsePaste(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return { aoa: [], smartbee: false, headerGiven: false };
  const dl = lines[0].includes('\t') ? '\t' : (lines[0].split(',').length > lines[0].split(';').length ? ',' : ';');
  const cells = l => l.split(dl).map(c => c.trim().replace(/^"(.*)"$/, '$1'));
  const first = cells(lines[0]);
  const headerGiven = first.filter(Boolean).length >= 2 && first.filter(Boolean).every(h => KNOWN.test(h));
  const smartbee = headerGiven && first.some(h => /^(item\s*no\.?|pline|category\s*1|unit\s*price)$/i.test(h));
  let hdr = headerGiven ? first.map(h => { if (!smartbee) return h; const m = SB_MAP.find(x => x[0].test(h)); return m ? m[1] : h; }) : DEFAULT_HDR.slice();
  const body = (headerGiven ? lines.slice(1) : lines).map(cells);
  return { aoa: [hdr].concat(body), smartbee, headerGiven, hdr };
}

export async function page(arg) {
  if (arg === 'del') TAB = 'del'; else if (arg === 'add') TAB = 'add';
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  try { await loadCatalog(S); } catch (e) {}
  const C = catalog(); if (!C) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + bt('아이템 목록을 읽지 못했습니다', 'Could not load items') + '</div></div>'; return; }
  let h = pageHead('📋 ' + bi('아이템 일괄 등록 · 삭제', 'Bulk add · delete'), C.rows.length.toLocaleString() + bt('개 아이템', ' items'), '<button class="b-ghost" id="ibBack">‹ ' + bi('아이템', 'Items') + '</button>') +
    '<div class="seg big"><button class="' + (TAB === 'add' ? 'on' : '') + '" data-ib="add">📋 ' + bi('셀 입력 등록', 'Grid add') + '</button><button class="' + (TAB === 'del' ? 'on' : '') + '" data-ib="del">🗑 ' + bi('일괄 삭제', 'Bulk delete') + '</button></div><div id="ibBody"></div>';
  $('page').innerHTML = h;
  $('ibBack').onclick = () => Router.go('items');
  document.querySelectorAll('[data-ib]').forEach(b => b.onclick = () => { TAB = b.dataset.ib; page(); });
  if (TAB === 'add') paintAdd(); else paintDel();
}

/* ---------- ① 셀 격자 등록 ---------- */
/* 격자 열 — [키, 머리글(parseBulkSheet 가 아는 이름), 한글 설명, 너비 클래스, 카탈로그 행 index] */
const GCOLS = [['c', 'Code', '코드', 'c-c', 0], ['d', 'Description', '이름 · 설명', 'c-d', 1], ['p', 'Price', '도매가', 'c-p', 2], ['s', 'SRP', '소비자가', 'c-p', 3], ['b', 'Barcode', '바코드', 'c-b', 4], ['l1', 'Level 1', '', 'c-l', 6], ['l2', 'Level 2', '', 'c-l', 7], ['l3', 'Level 3', '', 'c-l', 8], ['loc', 'Location', '위치', 'c-loc', 11]];
const NC = GCOLS.length, MIN_ROWS = 8;
let ROWS = [], NOTE = '';   // 격자 값 (탭을 오가도 유지) · 마지막 붙여넣기 설명
const blank = () => GCOLS.map(() => '');
const filled = r => r.some(v => String(v).trim());
function ensureRows(n) { while (ROWS.length < n) ROWS.push(blank()); }
const rowHtml = i => '<tr data-ir="' + i + '"><td class="n">' + (i + 1) + '</td><td class="st"></td>' + GCOLS.map((c, j) => '<td class="' + c[3] + '"><input data-r="' + i + '" data-c="' + j + '" value="' + esc(ROWS[i][j]) + '"' + (c[0] === 'l1' ? ' list="ibDl1"' : c[0] === 'l2' ? ' list="ibDl2"' : c[0] === 'l3' ? ' list="ibDl3"' : '') + (c[0] === 'p' || c[0] === 's' ? ' inputmode="decimal"' : c[0] === 'b' ? ' inputmode="numeric"' : '') + ' autocomplete="off" spellcheck="false"></td>').join('') + '<td><button type="button" class="ibx" data-ibx="' + i + '" title="' + esc(bt('줄 지우기', 'Remove row')) + '">✕</button></td></tr>';
function renderRows() { const tb = $('ibRows'); if (tb) tb.innerHTML = ROWS.map((r, i) => rowHtml(i)).join(''); }
const focusCell = (r, c) => { const el = document.querySelector('#ibGrid input[data-r="' + r + '"][data-c="' + c + '"]'); if (el) { el.focus(); try { el.select(); } catch (e) {} } };
const firstEmptyRow = () => { const i = ROWS.findIndex(r => !filled(r)); return i < 0 ? ROWS.length : i; };

function paintAdd() {
  if (!ROWS.length) ensureRows(MIN_ROWS);
  const C = catalog(), uniq = i => Array.from(new Set(C.rows.map(x => x[i]).filter(Boolean))).sort();
  const dl = (id, L) => '<datalist id="' + id + '">' + L.map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>';
  $('ibBody').innerHTML = '<div class="card"><h2>📋 ' + bi('엑셀처럼 칸에 적어 등록', 'Fill the cells like a spreadsheet') + '</h2>' +
    '<div class="muted">' + bt('코드 · 이름 · 도매가는 꼭, 나머지는 비워도 됩니다. Enter 는 아래 칸, 마지막 줄에 적으면 줄이 늘어납니다. 엑셀에서 복사해 아무 칸에나 붙여 넣으면 여러 줄이 한 번에 채워집니다 (첫 줄이 머리글이면 이름으로 열을 찾고, SmartBee 머리글도 됩니다).', 'Code, description and price are required; the rest may stay empty. Enter moves down; typing on the last row adds one. Paste rows copied from Excel into any cell to fill many rows at once (a header row maps columns by name; SmartBee headers work too).') + '<br>' +
    bt('있는 코드를 적으면 ✏️ 그 아이템의 적은 칸만 바뀝니다 (빈 칸은 그대로 — 지금 값이 흐리게 보임). Level 1 만 주면 Group(A · P · W)은 앞글자 규칙으로 정해집니다.', 'An existing code ✏️ changes only the cells you fill (empty = keep; current values show faintly). With only Level 1 the Group is set by the first-letter rule.') + '</div>' +
    '<div class="btns" style="justify-content:flex-start;margin-top:8px;flex-wrap:wrap"><button class="b-ghost b-sm" id="ibPaste">📋 ' + bt('클립보드에서 붙여넣기', 'Paste from clipboard') + '</button><button class="b-ghost b-sm" id="ibAdd">＋ 10' + bt('줄', ' rows') + '</button><button class="b-ghost b-sm" id="ibClr">✕ ' + bt('모두 지우기', 'Clear all') + '</button></div>' +
    '<div class="ibwrap"><table class="ibgrid" id="ibGrid"><thead><tr><th>#</th><th></th>' + GCOLS.map(c => '<th class="' + c[3] + '">' + esc(c[1]) + (c[0] === 'c' || c[0] === 'd' || c[0] === 'p' ? ' *' : '') + (c[2] ? '<small>' + esc(c[2]) + '</small>' : '') + '</th>').join('') + '<th></th></tr></thead><tbody id="ibRows"></tbody></table></div>' +
    dl('ibDl1', uniq(6)) + dl('ibDl2', uniq(7)) + dl('ibDl3', uniq(8)) + '<div id="ibPrev"></div></div>';
  renderRows();
  const schedule = debounce(preview, 250), g = $('ibGrid');
  g.oninput = e => { const el = e.target; if (!el.dataset || el.dataset.r == null) return; const r = +el.dataset.r; ROWS[r][+el.dataset.c] = el.value; if (r === ROWS.length - 1 && el.value) { ensureRows(ROWS.length + 1); $('ibRows').insertAdjacentHTML('beforeend', rowHtml(ROWS.length - 1)); } schedule(); };
  g.onkeydown = e => { const el = e.target; if (!el.dataset || el.dataset.r == null) return; const r = +el.dataset.r, c = +el.dataset.c;
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && !el.list)) { e.preventDefault(); if (r === ROWS.length - 1) { ensureRows(ROWS.length + 1); $('ibRows').insertAdjacentHTML('beforeend', rowHtml(ROWS.length - 1)); } focusCell(r + 1, c); }
    else if (e.key === 'ArrowUp' && !el.list && r > 0) { e.preventDefault(); focusCell(r - 1, c); } };
  g.onpaste = e => { const el = e.target; if (!el.dataset || el.dataset.r == null) return; const t = ((e.clipboardData || window.clipboardData) && (e.clipboardData || window.clipboardData).getData('text/plain')) || ''; if (!/[\t\n]/.test(t)) return; e.preventDefault(); fillFrom(t, +el.dataset.r, +el.dataset.c); };
  g.onclick = e => { const b = e.target.closest('[data-ibx]'); if (!b) return; ROWS.splice(+b.dataset.ibx, 1); ensureRows(MIN_ROWS); renderRows(); preview(); };
  $('ibAdd').onclick = () => { ensureRows(ROWS.length + 10); renderRows(); preview(); };
  $('ibClr').onclick = () => { ROWS = []; NOTE = ''; ensureRows(MIN_ROWS); renderRows(); preview(); };
  $('ibPaste').onclick = async () => { let t = ''; try { t = await navigator.clipboard.readText(); } catch (e) {} if (!t || !t.trim()) return toast(bt('클립보드를 읽지 못했습니다 — 칸을 누르고 Ctrl+V 로 붙여 넣으세요', 'Could not read the clipboard — click a cell and press Ctrl+V'), 'bad'); fillFrom(t, firstEmptyRow(), 0); };
  preview();
}
/** 붙여 넣은 표를 (r0, c0) 부터 채움 — 머리글이 있으면 이름으로 열을 찾아 0열부터, 없으면 그 칸부터 순서대로. 채운 줄 수를 돌려줌 */
export function fillFrom(text, r0, c0) {
  const P = parsePaste(text); if (!P.aoa.length || P.aoa.length < 2) return 0;
  let grid;
  if (P.headerGiven) {
    let r; try { r = parseBulkSheet(P.aoa); } catch (e) { toast(e.message, 'bad'); return 0; }
    grid = r.patches.map(p => GCOLS.map(c => c[0] === 'c' ? p.code : p.set[c[0]] == null ? '' : String(p.set[c[0]]))); c0 = 0;
    NOTE = (P.smartbee ? 'SmartBee ' : '') + bt('머리글로 읽음', 'read by header');
  } else { grid = P.aoa.slice(1).map(row => row.slice(0, NC - c0)); NOTE = bt('머리글 없음 — 붙여 넣은 칸부터 순서대로', 'no header — in cell order from the pasted cell'); }
  ensureRows(r0 + grid.length + 1);
  grid.forEach((vals, i) => vals.forEach((v, j) => { if (c0 + j < NC) ROWS[r0 + i][c0 + j] = String(v == null ? '' : v).trim(); }));
  renderRows(); preview(); toast('📋 ' + grid.length + bt('줄 붙여넣음', ' rows pasted'), 'good'); return grid.length;
}
/** 격자 → parseBulkSheet 표 (코드 있는 줄만) */
const toAoa = () => [GCOLS.map(c => c[1])].concat(ROWS.filter(r => String(r[0]).trim()).map(r => r.map(v => String(v).trim())));
function preview() {
  const out = $('ibPrev'); if (!out) return;
  const C = catalog(), byCode = {}; C.rows.forEach(x => { byCode[x[0]] = x; });
  const aoa = toAoa();
  let r = null, err = '';
  if (aoa.length > 1) { try { r = parseBulkSheet(aoa); } catch (e) { err = e.message; } }
  const kind = {}; (r ? r.patches : []).forEach(p => { if (!kind[p.code]) kind[p.code] = byCode[p.code] ? '✏️' : (p.set.d && p.set.p != null ? '🆕' : '⚠️'); });
  const cnt = {}; ROWS.forEach(row => { const c = String(row[0]).trim().toUpperCase(); if (c) cnt[c] = (cnt[c] || 0) + 1; });   /* 같은 코드가 여러 줄 (빈 줄도 셈) */
  /* 줄마다 상태 · 있는 코드는 지금 값을 흐리게 */
  document.querySelectorAll('#ibRows tr').forEach(tr => {
    const i = +tr.dataset.ir, row = ROWS[i] || blank(), code = String(row[0]).trim().toUpperCase(), ex = code ? byCode[code] : null, st = tr.querySelector('.st');
    tr.querySelectorAll('input[data-c]').forEach(el => { const c = GCOLS[+el.dataset.c]; el.placeholder = ex && c[0] !== 'c' ? String(ex[c[4]] == null ? '' : ex[c[4]]) : ''; });
    const k = code && kind[code] ? kind[code] : (code && byCode[code] ? '✏️' : '');
    tr.className = k === '🆕' ? 'new' : k === '✏️' ? 'chg' : k === '⚠️' ? 'warn' : ''; st.textContent = k + (code && cnt[code] > 1 ? '‼' : '');
  });
  if (err) { out.innerHTML = '<div class="alert a-red">' + esc(err) + '</div>'; return; }
  if (!r) { out.innerHTML = NOTE ? '<div class="alert a-blu" id="ibSum">' + NOTE + '</div>' : ''; return; }
  const rows = C.rows.map(x => x.slice()), cats = C.cats.map(x => x.slice()), sets = JSON.parse(JSON.stringify(C.sets || {}));
  const sum = applyBulk(rows, cats, sets, r.patches), tot = sum.added + sum.changed + sum.deleted;   /* changed = 있는 아이템이 바뀐 수 · added = 새 아이템 */
  const noPrice = r.patches.filter(p => !byCode[p.code] && (p.set.p == null || !p.set.d)).map(p => p.code);
  const dupIn = Object.keys(cnt).filter(c => cnt[c] > 1);
  out.innerHTML = '<div class="alert a-blu" id="ibSum">' + (NOTE ? NOTE + ' · ' : '') + r.patches.length.toLocaleString() + bt('줄', ' rows') +
    '<br><b>🆕 ' + bt('새 아이템', 'new') + ' ' + sum.added.toLocaleString() + ' · ✏️ ' + bt('바뀌는 아이템', 'changed') + ' ' + sum.changed.toLocaleString() + '</b>' + (sum.renamed ? ' · ' + bt('코드 변경', 'renamed') + ' ' + sum.renamed : '') + (sum.deleted ? ' · 🗑 ' + sum.deleted : '') + '</div>' +
    (noPrice.length ? '<div class="alert a-amb">⚠️ ' + bt('목록에 없는 코드인데 Description 또는 Price 가 없어 넣지 못함', 'unknown codes without description or price are skipped') + ' ' + noPrice.length + ': ' + esc(noPrice.slice(0, 10).join(', ')) + '</div>' : '') +
    (dupIn.length ? '<div class="alert a-amb">‼ ' + bt('같은 코드가 여러 줄에 있음 — 아래 줄이 위 줄을 덮어씁니다', 'the same code is on several rows — the lower row wins') + ': ' + esc(dupIn.slice(0, 10).join(', ')) + '</div>' : '') +
    (sum.dupNew.length ? '<div class="alert a-red">' + bt('새 코드가 이미 있음', 'new code already exists') + ': ' + esc(sum.dupNew.slice(0, 10).join(', ')) + '</div>' : '') +
    (tot ? '<button class="b-blue" id="ibGo" style="margin-top:10px;padding:14px;width:100%">✅ ' + bi('등록 · 적용', 'Add · apply') + ' (' + tot.toLocaleString() + ')</button>' : '<div class="none">' + bt('바뀌는 것이 없습니다', 'Nothing to change') + '</div>');
  if ($('ibGo')) $('ibGo').onclick = async () => {
    if (!(await confirmBox(bt('새 아이템 ', 'New ') + sum.added + bt(' · 바꾸는 아이템 ', ' · changed ') + sum.changed + '\n' + bt('적용할까요? 모든 폰이 새 목록을 받습니다.', 'Apply? Every phone gets the new list.'), bt('적용', 'Apply')))) return;
    busy(true);
    try { const res = await editCatalog(S, (rw, ct, st) => applyBulk(rw, ct, st, r.patches)); toast('✅ ' + bt('새 아이템 ', 'new ') + res.added + ' · ' + bt('바꿈 ', 'changed ') + res.changed, 'good'); ROWS = []; NOTE = ''; page(); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}

/* ---------- ② 일괄 삭제 ---------- */
function paintDel() {
  const C = catalog(), l1s = Array.from(new Set(C.rows.map(x => x[6]).filter(Boolean))).sort();
  $('ibBody').innerHTML = '<div class="card"><h2>🗑 ' + bi('일괄 삭제', 'Bulk delete') + '</h2><div class="muted">' + bt('찾아서 체크한 뒤 🗑 선택 삭제. 아이템 목록에서만 빠지고 인보이스 · 주문 기록은 그대로입니다. 단종이지만 기록용으로 두려면 🙈 숨김을 쓰세요.', 'Search, tick, then delete. Only the item list changes; invoices and orders keep their lines. Use hide for discontinued items you want to keep.') + '</div>' +
    '<div class="two" style="margin-top:8px"><input id="ibQ" value="' + esc(DQ) + '" placeholder="' + esc(bt('코드 · 이름 · 바코드 (코드 앞부분만 쳐도 됨)', 'code · name · barcode')) + '" autocomplete="off"><select id="ibL1"><option value="">' + bt('— Level 1 전체 —', '— all Level 1 —') + '</option>' + l1s.map(l => '<option value="' + esc(l) + '"' + (DL1 === l ? ' selected' : '') + '>' + esc(cleanName(l)) + '</option>').join('') + '</select></div>' +
    '<div id="ibList"></div><div class="bulkbar" id="ibBar" style="display:none"></div></div>';
  $('ibQ').oninput = debounce(() => { DQ = $('ibQ').value; listDel(); }, 200); $('ibL1').onchange = () => { DL1 = $('ibL1').value; listDel(); };
  listDel();
}
function matches() {
  const C = catalog(), q = DQ.trim().toUpperCase();
  let L = C.rows.filter(x => !DL1 || x[6] === DL1);
  if (q) L = L.filter(x => String(x[0]).toUpperCase().startsWith(q) || String(x[1]).toUpperCase().includes(q) || String(x[4] || '') === q);
  return L.slice(0, 500);
}
function listDel() {
  const L = matches(), box = $('ibList'); if (!box) return;
  if (!DQ.trim() && !DL1) { box.innerHTML = '<div class="none">' + bt('코드 · 이름으로 찾거나 Level 1 을 고르세요', 'Search or pick a Level 1') + '</div>'; paintBar(); return; }
  box.innerHTML = (L.length ? '<div class="btns" style="justify-content:flex-start;margin:6px 0"><button class="b-ghost b-sm" id="ibAll">☑ ' + bt('보이는 것 전체 선택', 'Select all shown') + ' (' + L.length + ')</button><button class="b-ghost b-sm" id="ibNone">☐ ' + bt('선택 해제', 'Clear') + '</button></div>' : '<div class="none">' + bt('없음', 'none') + '</div>') +
    L.map(x => '<label class="pr tap" style="gap:8px;align-items:center"><input type="checkbox" data-ibk="' + esc(x[0]) + '"' + (SEL.has(x[0]) ? ' checked' : '') + ' style="width:22px;height:22px"><div class="ct"><b>' + esc(x[0]) + (x[10] ? ' <span class="tag t-g">🙈</span>' : '') + '</b><small>' + esc(x[1]) + ' · ' + money(x[2]) + (x[4] ? ' · ' + esc(x[4]) : '') + ' · ' + esc([x[6], x[7], x[8]].filter(Boolean).map(cleanName).join(' › ')) + '</small></div></label>').join('');
  box.querySelectorAll('[data-ibk]').forEach(c => c.onchange = () => { if (c.checked) SEL.add(c.dataset.ibk); else SEL.delete(c.dataset.ibk); paintBar(); });
  if ($('ibAll')) $('ibAll').onclick = () => { L.forEach(x => SEL.add(x[0])); listDel(); };
  if ($('ibNone')) $('ibNone').onclick = () => { SEL.clear(); listDel(); };
  paintBar();
}
function paintBar() {
  const bar = $('ibBar'); if (!bar) return; const n = SEL.size;
  if (!n) { bar.style.display = 'none'; return; }
  bar.style.display = ''; bar.innerHTML = '<b>☑ ' + n + bt('개 선택', ' selected') + '</b><button class="b-ghost b-sm" id="ibHide">🙈 ' + bt('숨김으로', 'Hide') + '</button><button class="b-red b-sm" id="ibDel">🗑 ' + bt('선택 삭제', 'Delete selected') + '</button>';
  const codes = () => Array.from(SEL);
  $('ibDel').onclick = async () => { const L = codes(); if (!(await confirmBox('🗑 ' + L.length + bt('개 아이템을 목록에서 지울까요?', ' items — delete from the list?') + '\n' + L.slice(0, 8).join(', ') + (L.length > 8 ? ' …' : '') + '\n' + bt('인보이스 · 주문 기록은 그대로입니다. 되돌리려면 다시 등록해야 합니다.', 'Invoices and orders keep their lines. Undo means adding them again.'), bt('삭제', 'Delete')))) return;
    busy(true); try { const res = await editCatalog(S, (rw, ct, st) => applyBulk(rw, ct, st, L.map(code => ({ code, set: {}, del: true })))); toast('🗑 ' + res.deleted + bt('개 삭제', ' deleted'), 'good'); SEL.clear(); page(); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  $('ibHide').onclick = async () => { const L = codes(); busy(true); try { const res = await editCatalog(S, (rw, ct, st) => applyBulk(rw, ct, st, L.map(code => ({ code, set: { h: 1 } })))); toast('🙈 ' + L.length + bt('개 숨김', ' hidden'), 'good'); SEL.clear(); page(); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
}
