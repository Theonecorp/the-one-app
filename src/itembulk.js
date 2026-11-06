/* ============================================================
 *  📋 아이템 일괄 등록 · 🗑 일괄 삭제 — 이전 프로그램(SmartBee "Item Group")처럼 엑셀에서 미리 만든 표를 붙여 넣기만 하면 등록
 *    ① 붙여넣기: 첫 줄이 머리글이면 이름으로 열을 찾고(Code · Description · Price · SRP · Barcode · Level 1·2·3 · Location · Hide),
 *       SmartBee 열 이름(Item No · Description · Unit Price · Price · PLine · Category1 · Group · Barcode)도 그대로 됨.
 *       머리글이 없으면 Code · Description · Price · SRP · Barcode · Level 1 · Level 2 · Level 3 · Location 순서로 읽음.
 *       없는 코드 + Description + Price = 새 아이템 · 있는 코드 = 적은 칸만 바꿈 (빈 칸은 그대로)
 *    ② 삭제: 찾아서 체크 → 🗑 선택 삭제 (또는 🙈 숨김) — 인보이스 · 주문 기록은 그대로, 아이템 목록에서만 빠짐
 *  (ui) #/items/bulk  — 담당자 · 관리자
 * ============================================================ */
import { $, esc, money, toast, busy, confirmBox, Router, debounce, bi, bt, pageHead } from './ui.js';
import { loadCatalog, catalog, editCatalog, parseBulkSheet, applyBulk, searchItems, cleanName } from './catalog.js';

let S = null, TAB = 'add', TXT = '', DQ = '', DL1 = '', SEL = new Set();
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
    '<div class="seg big"><button class="' + (TAB === 'add' ? 'on' : '') + '" data-ib="add">📋 ' + bi('붙여넣기 등록', 'Paste & add') + '</button><button class="' + (TAB === 'del' ? 'on' : '') + '" data-ib="del">🗑 ' + bi('일괄 삭제', 'Bulk delete') + '</button></div><div id="ibBody"></div>';
  $('page').innerHTML = h;
  $('ibBack').onclick = () => Router.go('items');
  document.querySelectorAll('[data-ib]').forEach(b => b.onclick = () => { TAB = b.dataset.ib; page(); });
  if (TAB === 'add') paintAdd(); else paintDel();
}

/* ---------- ① 붙여넣기 등록 ---------- */
function paintAdd() {
  $('ibBody').innerHTML = '<div class="card"><h2>📋 ' + bi('엑셀에서 복사해 붙여 넣기', 'Paste rows copied from Excel') + '</h2>' +
    '<div class="muted">' + bt('첫 줄이 머리글이면 이름으로 열을 찾습니다: Code · Description · Price · SRP · Barcode · Level 1 · Level 2 · Level 3 · Location · Hide. SmartBee 열 이름(Item No · Description · Unit Price · Price · PLine · Category1 · Group · Barcode)도 그대로 됩니다. 머리글이 없으면 Code · Description · Price · SRP · Barcode · Level 1 · Level 2 · Level 3 · Location 순서로 읽습니다.', 'If the first row is a header, columns are matched by name (Code · Description · Price · SRP · Barcode · Level 1 · 2 · 3 · Location · Hide); SmartBee headers work too. Without a header the columns are read in that order.') + '<br>' +
    bt('없는 코드에 Description 과 Price 가 있으면 새 아이템, 있는 코드는 적은 칸만 바뀝니다 (빈 칸은 그대로). Level 1 만 주면 Group(A · P · W)은 앞글자 규칙으로 정해집니다.', 'Unknown codes with a description and price become new items; existing codes only get the cells you give.') + '</div>' +
    '<textarea id="ibTxt" rows="8" style="width:100%;margin-top:8px;font-family:ui-monospace,monospace;font-size:12.5px" placeholder="Code\tDescription\tPrice\tSRP\tBarcode\tLevel 1\tLevel 2\tLevel 3\nHAT-CH-BK\tHANDMADE RUFFLE CROCHET HATS - BLACK (12PC/PACK)\t120\t\t\t[NX] HAT\tHAT\tCROCHET HAT">' + esc(TXT) + '</textarea>' +
    '<div class="btns" style="justify-content:flex-start"><button class="b-ghost b-sm" id="ibClr">✕ ' + bt('지우기', 'Clear') + '</button></div><div id="ibPrev"></div></div>';
  const run = () => { TXT = $('ibTxt').value; preview(); };
  $('ibTxt').oninput = debounce(run, 250); $('ibTxt').onpaste = () => setTimeout(run, 50);
  $('ibClr').onclick = () => { TXT = ''; $('ibTxt').value = ''; $('ibPrev').innerHTML = ''; };
  if (TXT) preview();
}
function preview() {
  const out = $('ibPrev'); if (!out) return;
  const P = parsePaste(TXT); if (!P.aoa.length || P.aoa.length < 2) { out.innerHTML = TXT.trim() ? '<div class="alert a-amb">' + bt('줄이 없습니다 — 머리글 아래에 아이템 줄을 붙여 넣으세요', 'No item rows') + '</div>' : ''; return; }
  let r; try { r = parseBulkSheet(P.aoa); } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; return; }
  const rows = catalog().rows.map(x => x.slice()), cats = catalog().cats.map(x => x.slice()), sets = JSON.parse(JSON.stringify(catalog().sets || {}));
  const byCode = {}; catalog().rows.forEach(x => { byCode[x[0]] = x; });
  const sum = applyBulk(rows, cats, sets, r.patches), tot = sum.added + sum.changed + sum.deleted;   /* changed = 있는 아이템이 바뀐 수 · added = 새 아이템 */
  const lab = { nc: '코드 변경', d: 'Description', p: 'Price', s: 'SRP', b: 'Barcode', g: 'Group', l1: 'Level 1', l2: 'Level 2', l3: 'Level 3', ph: 'Photo', h: '숨김', loc: 'Location', del: '삭제' };
  const noPrice = r.patches.filter(p => !byCode[p.code] && (p.set.p == null || !p.set.d)).map(p => p.code);
  const tr = r.patches.slice(0, 300).map(p => { const ex = byCode[p.code]; const kind = ex ? (p.del ? '🗑' : '✏️') : (p.set.d && p.set.p != null ? '🆕' : '⚠️');
    return '<tr class="' + (kind === '⚠️' ? 'warn' : '') + '"><td>' + kind + '</td><td><b>' + esc(p.code) + '</b></td><td>' + esc(p.set.d || (ex ? ex[1] : '')) + '</td><td class="r">' + (p.set.p != null ? money(p.set.p) : ex ? money(ex[2]) : '') + '</td><td class="r">' + (p.set.s != null ? money(p.set.s) : '') + '</td><td>' + esc(p.set.b || '') + '</td><td>' + esc([p.set.l1, p.set.l2, p.set.l3].filter(Boolean).map(cleanName).join(' › ')) + '</td><td>' + esc(p.set.loc || '') + '</td></tr>'; }).join('');
  out.innerHTML = '<div class="alert a-blu" id="ibSum">' + (P.smartbee ? 'SmartBee ' + bt('머리글로 읽음', 'headers') + ' · ' : P.headerGiven ? bt('머리글로 읽음', 'by header') + ' · ' : bt('머리글 없음 — 기본 순서', 'no header — default order') + ' · ') + r.patches.length.toLocaleString() + bt('줄', ' rows') + ' · ' + bt('열', 'columns') + ': ' + r.cols.map(k => lab[k] || k).join(', ') +
    '<br><b>🆕 ' + bt('새 아이템', 'new') + ' ' + sum.added.toLocaleString() + ' · ✏️ ' + bt('바뀌는 아이템', 'changed') + ' ' + sum.changed.toLocaleString() + '</b>' + (sum.renamed ? ' · ' + bt('코드 변경', 'renamed') + ' ' + sum.renamed : '') + (sum.deleted ? ' · 🗑 ' + sum.deleted : '') + '</div>' +
    (noPrice.length ? '<div class="alert a-amb">⚠️ ' + bt('목록에 없는 코드인데 Description 또는 Price 가 없어 넣지 못함', 'unknown codes without description or price are skipped') + ' ' + noPrice.length + ': ' + esc(noPrice.slice(0, 10).join(', ')) + '</div>' : '') +
    (sum.dupNew.length ? '<div class="alert a-red">' + bt('새 코드가 이미 있음', 'new code already exists') + ': ' + esc(sum.dupNew.slice(0, 10).join(', ')) + '</div>' : '') +
    '<div style="overflow:auto;max-height:420px;margin-top:6px"><table class="dt" style="font-size:12px"><tr><th></th><th>Code</th><th>Description</th><th class="r">Price</th><th class="r">SRP</th><th>Barcode</th><th>' + bt('분류', 'Category') + '</th><th>' + bt('위치', 'Loc') + '</th></tr>' + tr + '</table>' + (r.patches.length > 300 ? '<div class="muted">… ' + (r.patches.length - 300) + bt('줄 더', ' more') + '</div>' : '') + '</div>' +
    (tot ? '<button class="b-blue" id="ibGo" style="margin-top:10px;padding:14px;width:100%">✅ ' + bi('등록 · 적용', 'Add · apply') + ' (' + tot.toLocaleString() + ')</button>' : '<div class="none">' + bt('바뀌는 것이 없습니다', 'Nothing to change') + '</div>');
  if ($('ibGo')) $('ibGo').onclick = async () => {
    if (!(await confirmBox(bt('새 아이템 ', 'New ') + sum.added + bt(' · 바꾸는 아이템 ', ' · changed ') + sum.changed + '\n' + bt('적용할까요? 모든 폰이 새 목록을 받습니다.', 'Apply? Every phone gets the new list.'), bt('적용', 'Apply')))) return;
    busy(true);
    try { const res = await editCatalog(S, (rw, ct, st) => applyBulk(rw, ct, st, r.patches)); toast('✅ ' + bt('새 아이템 ', 'new ') + res.added + ' · ' + bt('바꿈 ', 'changed ') + res.changed, 'good'); TXT = ''; page(); }
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
