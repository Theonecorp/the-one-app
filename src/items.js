/* ============================================================
 *  🏷 아이템 관리 — 담당자 · 관리자가 전체 목록을 훑어보며 찾고 · 고치고 · 숨기고 · 옮김
 *    분류 단계(Group › Level 1 › 2 › 3)로 내려가며 보거나, 검색하거나, 👁 보임 / 🙈 숨김 으로 걸러 봄
 *    여러 개를 체크해서 한 번에: 숨기기 · 보이기 · 분류 옮기기 · 삭제
 *    숨김(hide) = 목록엔 있지만 세일즈맨 주문 화면(분류 · 검색 · ✨)에 안 보임 — 단종 · 재입고 지연 때 (이전 시스템의 "레벨 비워두기")
 *    엑셀(Item Master) 전체 올리기는 관리 → 📦 아이템. 저장하면 카탈로그를 다시 발행해 모든 폰이 새 목록을 받음
 *  행 모양: [code, desc, price, srp, barcode, group, l1, l2, l3, photo, hide]
 * ============================================================ */
import { $, esc, money, num, R2, toast, busy, openModal, closeModal, confirmBox, Router, debounce, bi, bt } from './ui.js';
import { loadCatalog, catalog, searchItems, editCatalog, ensureCats, cleanName, thumb, setHidden, setLevels, setLoc, locOf, aisleOf, NO_L1, setItemPhoto, shrinkImage, photoOv } from './catalog.js';
import { typeOfItem, invTypes } from './invoicing.js';
import { can } from './main.js';
import { levelTool } from './lvtool.js';

let S = null;
/* 화면 상태 — 탭을 오가도 유지 */
const IT = { mode: 'all', path: [], q: '', page: 100, sel: new Set(), aisle: '', showA: false };
const COLL = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export function register(state) {
  S = state; Router.on('items', page);
  /* ‹ 뒤로: 분류 한 단계 위로 · 통로 거르기 풀기 */
  Router.up.items = arg => { if (arg) return false; if (IT.path.length) { IT.path.pop(); IT.page = 100; paint(); return true; } if (IT.aisle) { IT.aisle = ''; paint(); return true; } return false; };
  Router.upHas.items = () => !!(IT.path.length || IT.aisle);
}
const isStaff = () => S.role !== 'salesman';
const isAdmin = () => S.role === 'admin';
/** 창고 매니저 · 창고 직원 — 아이템은 찾아보고 📍 위치만 바꿈 (가격 · 이름 · 숨김 · 등록은 오피스 · 인보이스 쪽) */
const locOnly = () => S.role !== 'admin' && !can('newOrder') && !can('invoice') && !can('catalog');
const LV = ['Group', 'Level 1', 'Level 2', 'Level 3'];
const pathOf = x => [x.g, x.l1, x.l2, x.l3];
const inPath = (x, path) => { const L = x.lv1 == null ? [x.g, x.l1, x.l2, x.l3] : [x.g, x.lv1, x.lv2, x.lv3]; return path.every((p, i) => L[i] === p); };   // 분류 트리와 같게 (Level 1 빈 것 = NO LEVEL · 세트 = SET ORDER)

async function page(arg) {
  if (!isStaff()) { $('page').innerHTML = '<div class="card"><div class="none">담당자 · 관리자만 쓰는 화면입니다</div></div>'; return; }
  if (arg === 'noph' || String(arg || '').indexOf('noph:') === 0) { IT.q = ''; IT.mode = 'noph'; IT.path = arg.length > 5 ? decodeURIComponent(arg.substring(5)).split('/').filter(Boolean) : []; }   // 📷 사진 없는 아이템 (분류 경로)
  else if (arg) { IT.q = decodeURIComponent(arg); IT.path = []; }
  $('page').innerHTML = '<div class="load">아이템 목록 읽는 중…</div>';
  try { await loadCatalog(S); } catch (e) { if (!catalog()) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; } }
  IT.page = 100; paint();
}

/** 지금 조건(분류 경로 · 걸러보기 · 검색)에 맞는 아이템 — 코드 순 */
function current() {
  const C = catalog();
  const qU = IT.q.trim().toUpperCase();
  let list = qU ? searchItems(IT.q, [], 100000, 'g', true) : C.items;
  /* 위치로도 찾기 — "A-03" 이라고 치면 그 위치로 시작하는 아이템도 */
  if (qU && !/\s/.test(qU)) { const have = new Set(list.map(x => x.c)), byLoc = C.items.filter(x => !have.has(x.c) && locOf(x).toUpperCase().startsWith(qU)); if (byLoc.length) list = list.concat(byLoc); }
  if (IT.aisle) list = list.filter(x => (aisleOf(locOf(x)) || '—') === IT.aisle).sort((a, b) => COLL.compare(locOf(a), locOf(b)) || COLL.compare(a.c, b.c));
  if (IT.path.length) list = list.filter(x => inPath(x, IT.path));
  if (IT.mode === 'vis') list = list.filter(x => !x.h); else if (IT.mode === 'hid') list = list.filter(x => x.h); else if (IT.mode === 'noph') list = list.filter(x => !x.ph && !x.h);   // 📷 사진 없음 (숨김 제외)
  return list;
}

function paint() {
  const C = catalog();
  const nAll = C.items.filter(x => !x.virt).length, nHid = C.items.filter(x => x.h && !x.virt).length, nNoPh = C.items.filter(x => !x.ph && !x.h).length;
  let node = C.treeA; const under = [];
  for (const p of IT.path) { if (node.map[p]) { node = node.map[p]; under.push(p); } else break; }
  IT.path = under;
  const depth = under.length;
  const crumbs = '<div class="chips crumbs" style="margin-top:8px">' + (depth ? '<button class="up" data-ip="' + (depth - 1) + '">‹ ' + bi('상위', 'Up') + '</button>' : '') + '<button class="' + (depth ? '' : 'on') + '" data-ip="0">' + bi('전체', 'All') + '</button>' + under.map((p, i) => '<button class="' + (i === depth - 1 ? 'on' : '') + '" data-ip="' + (i + 1) + '">' + esc(cleanName(p)) + '</button>').join('') + '</div>';
  const kids = node.kids.filter(k => IT.mode === 'hid' ? k.nh > 0 : IT.mode === 'vis' || IT.mode === 'noph' ? k.n > 0 : true);
  const tiles = kids.length ? '<div class="muted" style="margin:6px 0 2px">' + esc(LV[depth]) + ' · ' + kids.length + '개 분류</div><div class="chips itcats">' + kids.map(k => '<button data-ik="' + esc(k.name) + '">' + esc(cleanName(k.name)) + ' <span class="en">' + (IT.mode === 'hid' ? k.nh : IT.mode === 'vis' ? k.n : k.n + k.nh) + (k.nh && IT.mode === 'all' ? ' · 🙈' + k.nh : '') + '</span></button>').join('') + '</div>' : '';
  $('page').innerHTML = '<div class="card"><h2>🏷 ' + bi('아이템 관리', 'Items') + ' <span class="muted" style="font-weight:400;font-size:12px">' + nAll.toLocaleString() + '개 · 👁 보임 ' + (nAll - nHid).toLocaleString() + ' · 🙈 숨김 ' + nHid.toLocaleString() + '</span></h2>' +
    '<div class="muted">분류를 눌러 내려가거나 검색해서 전체를 훑어보세요. 체크해서 여러 개를 한 번에 <b>숨기기 · 보이기 · 분류 옮기기 · 삭제</b>. 🙈 숨김 아이템은 목록엔 있지만 세일즈맨 주문 화면에 안 나옵니다 (단종 · 재입고 지연). 저장하면 모든 폰에 반영됩니다.</div>' +
    (locOnly() ? '' : '<button class="b-ghost" id="itLv" style="margin-top:8px">📥 ' + bi('레벨 · 그룹 일괄 변경 (엑셀)', 'Level · Group bulk update (Excel)') + '</button>') +
    '<div style="display:flex;gap:6px;margin-top:10px"><input id="itQ" placeholder="코드 · 이름 · 바코드 · 위치 / Code · Name · Barcode · Location" value="' + esc(IT.q) + '" autocomplete="off" autocapitalize="characters" style="flex:1">' + (locOnly() ? '' : '<button class="b-blue" id="itNew" style="flex:0 0 auto;width:auto;white-space:nowrap">＋ ' + bi('새 아이템', 'New') + '</button>') + '</div>' +
    '<div class="seg" style="margin-top:8px">' + [['all', '전체 ' + nAll.toLocaleString()], ['vis', '👁 보임 ' + (nAll - nHid).toLocaleString()], ['hid', '🙈 숨김 ' + nHid.toLocaleString()], ['noph', '📷✕ ' + bt('사진 없음', 'No photo') + ' ' + nNoPh.toLocaleString()]].map(m => '<button class="' + (IT.mode === m[0] ? 'on' : '') + '" data-im="' + m[0] + '">' + m[1] + '</button>').join('') + '</div>' +
    crumbs + tiles + aisleRow(C) + '</div>' +
    '<div class="card"><div id="itList"></div></div>' + (isAdmin() ? '<div id="itSbm"></div>' : '') +
    '<div class="bulkbar" id="itBulk" style="display:none"></div>';
  Router.refreshBack();
  if ($('itLv')) $('itLv').onclick = () => levelTool(S, paint);
  document.querySelectorAll('[data-im]').forEach(b => b.onclick = () => { IT.mode = b.dataset.im; IT.page = 100; paint(); });
  document.querySelectorAll('[data-ip]').forEach(b => b.onclick = () => { IT.path = IT.path.slice(0, Number(b.dataset.ip)); IT.page = 100; paint(); });
  document.querySelectorAll('[data-ia]').forEach(b => b.onclick = () => { IT.aisle = IT.aisle === b.dataset.ia ? '' : b.dataset.ia; IT.page = 100; paint(); });
  if ($('itAisT')) $('itAisT').onclick = () => { IT.showA = !IT.showA; paint(); };
  document.querySelectorAll('[data-ik]').forEach(b => b.onclick = () => { IT.path = IT.path.concat([b.dataset.ik]); IT.page = 100; paint(); });
  $('itQ').oninput = debounce(() => { IT.q = $('itQ').value; IT.page = 100; list(); }, 150);
  if ($('itNew')) $('itNew').onclick = () => form(null, IT.q.trim().toUpperCase());
  list();
  if (isAdmin()) sbmCard();
}

/** 📍 통로별로 보기 — 통로를 누르면 그 통로 아이템만 위치 순으로 */
function aisleRow(C) {
  const m = {}; C.items.forEach(x => { if (x.virt) return; const a = aisleOf(locOf(x)) || '—'; m[a] = (m[a] || 0) + 1; });
  const keys = Object.keys(m).filter(k => k !== '—').sort(COLL.compare); if (m['—']) keys.push('—');
  if (!keys.length || (keys.length === 1 && keys[0] === '—')) return '';
  const open = IT.showA || IT.aisle;
  return '<div style="margin-top:8px"><button class="b-ghost b-sm" id="itAisT">📍 ' + bi('통로별 보기', 'By aisle') + ' ' + (IT.aisle ? '· <b>' + esc(IT.aisle === '—' ? bt('위치 없음', 'No location') : IT.aisle) + '</b>' : '(' + keys.filter(k => k !== '—').length + ')') + ' ' + (open ? '▴' : '▾') + '</button>' +
    (open ? '<div class="chips">' + keys.map(k => '<button class="' + (IT.aisle === k ? 'on' : '') + '" data-ia="' + esc(k) + '">' + (k === '—' ? bt('위치 없음', 'No location') : esc(k)) + ' <span class="en">' + m[k] + '</span></button>').join('') + '</div>' : '') + '</div>';
}
function list() {
  const C = catalog(), all = current(), res = all.slice(0, IT.page), q = IT.q.trim();
  const showList = q || IT.path.length || IT.mode !== 'all' || IT.aisle;
  const head = '<div class="muted" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><span>' + (showList ? all.length.toLocaleString() + (IT.aisle ? '개 (위치 순)' : '개 (코드 순)') : '전체 ' + all.length.toLocaleString() + '개 — 분류를 고르거나 검색하면 목록이 나옵니다') + '</span>' +
    (showList && all.length ? '<label class="tap" style="display:flex;align-items:center;gap:4px;white-space:nowrap;flex:0 0 auto"><input type="checkbox" id="itAll" ' + (all.length && all.every(x => IT.sel.has(x.c)) ? 'checked' : '') + '> ' + bi('모두 선택', 'All') + ' ' + Math.min(all.length, 2000).toLocaleString() + '</label>' : '') + '</div>';
  $('itList').innerHTML = head + (showList ? (res.length ? res.map(row).join('') + (all.length > res.length ? '<button class="b-ghost" id="itMore" style="margin-top:8px">더 보기 (' + (all.length - res.length).toLocaleString() + '개 남음)</button>' : '') :
    '<div class="none">맞는 아이템이 없습니다' + (q ? ' — <a href="#" id="itMk">＋ "' + esc(q.toUpperCase()) + '" 로 새 아이템 등록</a>' : '') + '</div>') : '');
  $('itList').querySelectorAll('[data-it]').forEach(el => el.onclick = () => form(C.byCode[el.dataset.it]));
  $('itList').querySelectorAll('[data-ic]').forEach(ck => ck.onchange = () => { if (ck.checked) IT.sel.add(ck.dataset.ic); else IT.sel.delete(ck.dataset.ic); bulk(); });
  $('itList').querySelectorAll('[data-ih]').forEach(b => b.onclick = e => { e.stopPropagation(); applyHidden([b.dataset.ih], b.dataset.on === '1'); });
  if ($('itAll')) $('itAll').onchange = () => { const on = $('itAll').checked; all.slice(0, 2000).forEach(x => { if (on) IT.sel.add(x.c); else IT.sel.delete(x.c); }); list(); };
  if ($('itMore')) $('itMore').onclick = () => { IT.page += 100; list(); };
  if ($('itMk')) $('itMk').onclick = e => { e.preventDefault(); form(null, q.toUpperCase()); };
  bulk();
}
function row(it) {
  return '<div class="pr irow' + (it.h ? ' hid' : '') + '"><input type="checkbox" data-ic="' + esc(it.c) + '" ' + (IT.sel.has(it.c) ? 'checked' : '') + ' style="width:20px;height:20px;margin-right:8px;flex:0 0 auto">' +
    (it.ph ? '<img src="' + esc(thumb(it.ph, 80)) + '" loading="lazy" style="width:40px;height:40px;object-fit:cover;border-radius:8px;margin-right:8px" alt="">' : '<span class="noph" title="' + esc(bt('사진 없음', 'No photo')) + '">📷✕</span>') +
    '<div class="ct tap" data-it="' + esc(it.c) + '"><b>' + esc(it.c) + (it.k ? ' <span class="tag t-a">🧩 세트</span>' : '') + (it.h ? ' <span class="tag t-x">🙈 숨김</span>' : '') + (locOf(it) ? ' <span class="loc"' + (it.loc ? '' : ' style="background:#64748b" title="분류 기본 위치"') + '>📍' + esc(locOf(it)) + '</span>' : '') + '</b><small>' + esc(it.d) + '</small><small>' + esc(pathOf(it).filter(Boolean).map(cleanName).join(' › ') || '분류 없음') + (it.b ? ' · ' + esc(it.b) : '') + '</small></div>' +
    '<div class="pa"><b>' + money(it.p) + '</b>' + (it.s ? '<small>SRP ' + money(it.s) + '</small>' : '') + '</div>' +
    (it.virt || locOnly() ? '' : '<button class="b-ghost b-sm" data-ih="' + esc(it.c) + '" data-on="' + (it.h ? '0' : '1') + '" title="' + (it.h ? '보이기' : '숨기기') + '" style="margin-left:6px">' + (it.h ? '👁' : '🙈') + '</button>') + '</div>';
}
/** 아래 고정 — 선택한 것들에 한 번에 */
function bulk() {
  const bar = $('itBulk'); if (!bar) return;
  const n = IT.sel.size;
  bar.style.display = n ? '' : 'none';
  if (!n) return;
  bar.innerHTML = '<b>' + n.toLocaleString() + '개 선택</b>' + (locOnly() ? '' : '<button class="b-ghost b-sm" id="bkHide">🙈 숨기기</button><button class="b-ghost b-sm" id="bkShow">👁 보이기</button><button class="b-ghost b-sm" id="bkMove">➡️ 분류 옮기기</button>') + '<button class="b-ghost b-sm" id="bkLoc">📍 위치</button>' + (isAdmin() ? '<button class="b-ghost b-sm" id="bkDel" style="color:#991b1b">🗑 삭제</button>' : '') + '<button class="b-ghost b-sm" id="bkClr">✕ 선택 해제</button>';
  if ($('bkHide')) $('bkHide').onclick = () => applyHidden(Array.from(IT.sel), true);
  $('bkLoc').onclick = () => { const codes = Array.from(IT.sel), C = catalog(), now = (C.byCode[codes[0]] || {}).loc || '';
    openModal('<h2>📍 ' + codes.length + '개 창고 위치</h2><div class="muted">통로-선반-칸 처럼 적으세요 (예: <b>A-03-2</b>, <b>12-4</b>). 픽킹 리스트가 이 순서로 정렬됩니다. 비우면 분류 기본 위치(관리 → 🗂 분류 → 📍)를 따릅니다.</div><div class="fg" style="margin-top:8px"><input id="lcIn" value="' + esc(now) + '" autocapitalize="characters" style="text-transform:uppercase;font-size:20px;font-weight:800;text-align:center" placeholder="A-03-2"></div><div class="btns"><button class="b-ghost" id="lcX">취소</button><button class="b-blue" id="lcOk">저장</button></div>');
    $('lcX').onclick = closeModal; setTimeout(() => $('lcIn') && $('lcIn').focus(), 50);
    $('lcOk').onclick = async () => { const v = $('lcIn').value.trim().toUpperCase(); closeModal(); await save(rows => setLoc(rows, codes, v), n => n + '개 위치 ' + (v || '비움 (분류 기본)')); IT.sel.clear(); }; };
  if ($('bkShow')) $('bkShow').onclick = () => applyHidden(Array.from(IT.sel), false);
  if ($('bkMove')) $('bkMove').onclick = () => moveForm(Array.from(IT.sel));
  if ($('bkDel')) $('bkDel').onclick = async () => {
    const codes = Array.from(IT.sel);
    if (!(await confirmBox(codes.length + '개 아이템을 목록에서 뺄까요? 지난 주문 · 인보이스 기록은 그대로 남습니다. 다시 팔 수도 있는 아이템이면 삭제 대신 🙈 숨기기를 쓰세요.', '삭제'))) return;
    await save(async (rows, cats, sets) => { const set = new Set(codes); for (let i = rows.length - 1; i >= 0; i--) if (set.has(rows[i][0])) rows.splice(i, 1); codes.forEach(c => { if (sets[c]) delete sets[c]; }); return codes.length; }, n => n + '개 삭제');
    IT.sel.clear();
  };
  $('bkClr').onclick = () => { IT.sel.clear(); list(); };
}
async function applyHidden(codes, on) {
  await save((rows) => setHidden(rows, codes, on), n => n + '개 ' + (on ? '숨김 — 세일즈맨 주문 화면에서 빠집니다' : '보임 — 주문 화면에 다시 나옵니다'));
}
/** 저장 공통 — 카탈로그 다시 발행 → 모든 폰 반영 */
async function save(fn, msg) {
  busy(true);
  try { const n = await editCatalog(S, fn); toast((msg ? msg(Number(n) || 0) : '저장') + ' · 모든 폰에 반영됩니다', 'good'); paint(); }
  catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
  busy(false);
}

/** 분류 선택 — 기존 이름 중에서 고르거나 새로 치기 */
function catPick(id, label, names, val) {
  return '<div class="fg"><label>' + label + '</label><input id="' + id + '" list="' + id + 'L" value="' + esc(val || '') + '" autocomplete="off" placeholder="고르거나 새로 입력"><datalist id="' + id + 'L">' + names.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></div>';
}
function levelLists() {
  const C = catalog(), uniq = arr => Array.from(new Set(arr.filter(Boolean))).sort();
  return {
    groups: uniq(C.cats.map(p => p[0]).concat(C.items.map(i => i.g))),
    l1s: g => uniq(C.cats.filter(p => !g || p[0] === g).map(p => p[1]).concat(C.items.filter(i => !g || i.g === g).map(i => i.l1))),
    l2s: (g, l1) => uniq(C.cats.filter(p => (!g || p[0] === g) && (!l1 || p[1] === l1)).map(p => p[2]).concat(C.items.filter(i => (!g || i.g === g) && (!l1 || i.l1 === l1)).map(i => i.l2))),
    l3s: (g, l1, l2) => uniq(C.cats.filter(p => (!g || p[0] === g) && (!l1 || p[1] === l1) && (!l2 || p[2] === l2)).map(p => p[3]).concat(C.items.filter(i => (!g || i.g === g) && (!l1 || i.l1 === l1) && (!l2 || i.l2 === l2)).map(i => i.l3)))
  };
}
function bindLevelLists(ids) {
  const L = levelLists();
  const cur = () => ids.map(id => $(id).value.trim());
  const refresh = () => { const v = cur(); const fill = (id, arr) => { const dl = $(id + 'L'); if (dl) dl.innerHTML = arr.map(n => '<option value="' + esc(n) + '">').join(''); }; fill(ids[1], L.l1s(v[0])); fill(ids[2], L.l2s(v[0], v[1])); fill(ids[3], L.l3s(v[0], v[1], v[2])); };
  ids.slice(0, 3).forEach(id => $(id).onchange = refresh);
  return L;
}
/** 여러 개를 다른 분류로 — 지금 보고 있는 분류가 기본값 */
function moveForm(codes) {
  const C = catalog(), L = levelLists(), first = C.byCode[codes[0]] || {};
  const d = (IT.path.length ? IT.path.concat(['', '', '', '']).slice(0, 4) : pathOf(first)).map(v => v === NO_L1 ? '' : v);
  openModal('<h2>➡️ ' + codes.length + '개 분류 옮기기</h2><div class="muted">' + esc(codes.slice(0, 6).join(', ')) + (codes.length > 6 ? ' 외 ' + (codes.length - 6) + '개' : '') + '</div>' +
    '<div class="two" style="margin-top:8px">' + catPick('mG', '그룹 <span class="en">Group</span>', L.groups, d[0]) + catPick('mL1', 'Level 1', L.l1s(d[0]), d[1]) + '</div>' +
    '<div class="two">' + catPick('mL2', 'Level 2', L.l2s(d[0], d[1]), d[2]) + catPick('mL3', 'Level 3', L.l3s(d[0], d[1], d[2]), d[3]) + '</div>' +
    '<div class="hint">Level 3 까지 다 채우지 않아도 됩니다. 새 이름을 치면 새 분류가 생깁니다.</div>' +
    '<div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-blue" id="mOk">옮기기</button></div>');
  bindLevelLists(['mG', 'mL1', 'mL2', 'mL3']);
  $('mX').onclick = closeModal;
  $('mOk').onclick = async () => {
    const to = ['mG', 'mL1', 'mL2', 'mL3'].map(id => $(id).value.trim());
    if (!to[0] && !to[1]) return toast('Group 또는 Level 1 은 넣어 주세요', 'bad');
    closeModal();
    await save((rows, cats) => setLevels(rows, cats, codes, to), n => n + '개 → ' + to.filter(Boolean).map(cleanName).join(' › '));
    IT.sel.clear();
  };
}

/** 하나 등록 · 수정 */
function form(it, newCode) {
  const C = catalog(), isNew = !it;
  const x = it || { c: newCode || '', d: '', p: '', s: '', b: '', g: IT.path[0] || '', l1: IT.path[1] || '', l2: IT.path[2] || '', l3: IT.path[3] || '', ph: '', h: false };
  const L = levelLists();
  openModal('<h2>' + (isNew ? '＋ ' + bi('새 아이템', 'New item') : '✏️ ' + esc(x.c)) + '</h2>' +
    (x.k ? '<div class="alert a-amb">🧩 세트 아이템 — 구성은 관리 → 📦 아이템 → 세트 구성에서 고칩니다. 여기서는 이름 · 가격 · 분류만.</div>' : '') +
    '<div class="two"><div class="fg"><label>코드 <span class="en">Code</span> *</label><input id="fC" value="' + esc(x.c) + '" ' + (isNew ? '' : 'readonly style="background:#f1f5f9"') + ' autocapitalize="characters" style="text-transform:uppercase"></div><div class="fg"><label>바코드 <span class="en">Barcode</span></label><input id="fB" value="' + esc(x.b || '') + '" inputmode="numeric"></div></div>' +
    '<div class="fg"><label>이름 · 설명 <span class="en">Description</span> *</label><input id="fD" value="' + esc(x.d) + '"></div>' +
    '<div class="two"><div class="fg"><label>도매가 <span class="en">Price</span> * $</label><input id="fP" value="' + esc(x.p === '' ? '' : x.p) + '" inputmode="decimal" style="font-weight:800;text-align:right"></div><div class="fg"><label>소비자가 <span class="en">SRP</span> $</label><input id="fS" value="' + esc(x.s || '') + '" inputmode="decimal" style="text-align:right"></div></div>' +
    '<div class="two">' + catPick('fG', '그룹 <span class="en">Group</span>', L.groups, x.g) + catPick('fL1', 'Level 1', L.l1s(x.g), x.l1) + '</div>' +
    '<div class="two">' + catPick('fL2', 'Level 2', L.l2s(x.g, x.l1), x.l2) + catPick('fL3', 'Level 3', L.l3s(x.g, x.l1, x.l2), x.l3) + '</div>' +
    '<div class="two"><div class="fg"><label>📍 창고 위치 <span class="en">Location</span></label><input id="fLoc" value="' + esc(x.loc || '') + '" placeholder="' + esc(it ? (locOf(Object.assign({}, x, { loc: '' })) || 'A-03-2') : 'A-03-2') + '" autocapitalize="characters" style="text-transform:uppercase"></div><div class="fg"><label>사진 주소 <span class="en">Photo URL</span></label><input id="fPh" value="' + esc(x.phSrc === 'app' || x.phSrc === 'none' ? (x.ph0 || '') : (x.ph || '')) + '" placeholder="https://…"></div></div>' +
    (isNew ? '' : '<div class="phbox" id="fPhBox"></div>') +
    (x.virt ? '' : '<label class="pick ' + (x.h ? '' : 'on') + '" id="fVis"><span class="ck">✓</span><span class="pm"><b>👁 세일즈맨 주문 화면에 보이기 <span class="en">Visible to salesmen</span></b><small>끄면 🙈 숨김 — 목록 · 기록엔 남고 주문 분류 · 검색에서만 빠집니다 (단종 · 재입고 지연)</small></span></label>') +
    '<div class="sumbox" id="fType"></div>' +
    '<div class="btns">' + (isNew ? '' : '<button class="b-ghost" id="fDel" style="color:#991b1b">🗑 삭제</button>') + '<button class="b-ghost" id="fX">취소</button><button class="b-blue" id="fOk">' + (isNew ? '등록' : '저장') + '</button></div>');
  let vis = !x.h;
  /* 📷 사진 — 지금 사진 · 어디서 온 것인지 · 올리기(폰 카메라 · 파일) · 안 쓰기 · 원래대로 */
  const paintPh = () => {
    const box = $('fPhBox'); if (!box) return;
    const cur = C.byCode[x.c] || x, src = cur.phSrc || '', ov = photoOv(x.c);
    const lab = { app: bt('앱에서 올린 사진', 'Uploaded in app'), drive: bt('드라이브 item_picture', 'Drive item_picture'), sheet: bt('시트 Photo 칸', 'Sheet Photo column'), none: bt('사진 안 씀 (앱에서 끔)', 'Photo turned off in app') }[src] || bt('사진 없음', 'No photo');
    box.innerHTML = '<div style="display:flex;gap:10px;align-items:center">' + (cur.ph ? '<img src="' + esc(thumb(cur.ph, 240)) + '" style="width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid var(--line)" alt="">' : '<div class="noph big">📷✕</div>') +
      '<div style="flex:1;min-width:0"><b>📷 ' + bt('사진', 'Photo') + '</b><div class="muted" style="font-size:12px">' + lab + '</div><div class="btns" style="justify-content:flex-start;margin-top:6px;flex-wrap:wrap"><label class="b-blue b-sm" style="margin:0;cursor:pointer">📷 ' + bt('사진 올리기', 'Upload photo') + '<input type="file" id="fPhFile" accept="image/*" style="display:none"></label>' +
      (cur.ph && src !== 'none' ? '<button type="button" class="b-ghost b-sm" id="fPhNone">🚫 ' + bt('이 사진 안 쓰기', 'Don\'t use this photo') + '</button>' : '') + (ov ? '<button type="button" class="b-ghost b-sm" id="fPhClear">↩ ' + bt('원래 사진으로', 'Back to original') + '</button>' : '') + '</div></div></div>';
    const go = async (o, msg) => { busy(true); try { await setItemPhoto(S, x.c, o); toast('📷 ' + x.c + ' — ' + msg, 'good'); paintPh(); list(); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
    $('fPhFile').onchange = async () => { const f = $('fPhFile').files[0]; if (!f) return; busy(true); let data = ''; try { data = await shrinkImage(f); } catch (e) { busy(false); return toast(e.message, 'bad'); } busy(false); await go({ data }, bt('사진 올림', 'photo uploaded')); };
    if ($('fPhNone')) $('fPhNone').onclick = () => go({ none: true }, bt('사진 안 씀', 'photo off'));
    if ($('fPhClear')) $('fPhClear').onclick = () => go({ clear: true }, bt('원래 사진으로', 'back to original'));
  };
  paintPh();
  if (locOnly()) {   /* 창고: 위치 칸만 고칠 수 있음 */
    document.querySelectorAll('#mbox input, #mbox select').forEach(el => { if (el.id !== 'fLoc') { el.readOnly = true; el.disabled = el.tagName === 'SELECT'; el.style.background = '#f1f5f9'; } });
    if ($('fDel')) $('fDel').remove(); if ($('fVis')) $('fVis').style.pointerEvents = 'none';
    $('fOk').textContent = '📍 위치 저장';
  }
  if ($('fVis')) $('fVis').onclick = () => { vis = !vis; $('fVis').classList.toggle('on', vis); };
  const cur = () => ({ c: $('fC').value.trim().toUpperCase(), d: $('fD').value.trim(), p: R2(num($('fP').value)), s: R2(num($('fS').value)) || 0, b: $('fB').value.trim().replace(/\.0+$/, ''), g: $('fG').value.trim(), l1: $('fL1').value.trim(), l2: $('fL2').value.trim(), l3: $('fL3').value.trim(), ph: $('fPh').value.trim() });
  const showType = () => { const v = cur(); const t = typeOfItem(S, v), tt = invTypes(S).find(z => z.c === t); $('fType').innerHTML = '🧾 인보이스 종류: <b>' + esc(t) + '</b> ' + esc(tt ? tt.n : '') + ' <span class="muted">(분류 이름으로 자동 결정 · 관리 → 설정 → 인보이스 종류)</span>' + (v.g || v.l1 ? '' : '<br><span class="warn">분류가 없으면 주문 화면의 분류 버튼에서 찾을 수 없고 검색으로만 나옵니다</span>'); };
  ['fG', 'fL1', 'fL2', 'fL3'].forEach(id => $(id).oninput = showType);
  bindLevelLists(['fG', 'fL1', 'fL2', 'fL3']);
  showType();
  $('fX').onclick = closeModal;
  if ($('fDel')) $('fDel').onclick = async () => {
    if (!(await confirmBox(x.c + ' 아이템을 목록에서 뺄까요? 지난 주문 · 인보이스 기록은 그대로 남습니다. 다시 팔 수도 있으면 삭제 대신 🙈 숨기기를 쓰세요. / Remove this item from the catalog?', '삭제'))) return;
    closeModal();
    await save((rows, cats, sets) => { const i = rows.findIndex(r => r[0] === x.c); if (i >= 0) rows.splice(i, 1); if (sets[x.c]) delete sets[x.c]; return 1; }, () => x.c + ' 삭제');
  };
  $('fOk').onclick = async () => {
    if (locOnly()) { const lv = ($('fLoc') ? $('fLoc').value : '').trim().toUpperCase(); closeModal(); IT.q = x.c; await save(rows => setLoc(rows, [x.c], lv), n => x.c + ' 위치 ' + (lv || '비움 (분류 기본)')); return; }
    const v = cur();
    if (!v.c) return toast('코드를 넣어 주세요', 'bad');
    if (!/^[A-Z0-9][A-Z0-9\-_.\/ ]{0,29}$/.test(v.c)) return toast('코드는 영문 · 숫자 · - _ . / 만 (30자 이내)', 'bad');
    if (!v.d) return toast('이름을 넣어 주세요', 'bad');
    if (!(v.p > 0)) return toast('도매가를 넣어 주세요', 'bad');
    if (isNew && C.byCode[v.c]) return toast('이미 있는 코드입니다 — 찾아서 수정하세요', 'bad');
    if (v.b) { const dup = C.items.find(i => i.b === v.b && i.c !== v.c); if (dup && !(await confirmBox('바코드 ' + v.b + ' 는 ' + dup.c + ' 에도 있습니다. 그래도 저장할까요?', '저장'))) return; }
    if (v.ph && !/^https?:\/\//i.test(v.ph)) return toast('사진 주소는 https:// 로 시작해야 합니다', 'bad');
    const locV = $('fLoc') ? $('fLoc').value.trim().toUpperCase() : (x.loc || '');
    closeModal();
    IT.q = v.c;
    await save((rows, cats) => {
      const row = [v.c, v.d, v.p, v.s, v.b, v.g, v.l1, v.l2, v.l3, v.ph, vis ? 0 : 1, locV];
      const i = rows.findIndex(r => r[0] === v.c); if (i >= 0) rows[i] = row; else rows.push(row);
      ensureCats(rows, cats); return 1;
    }, () => (isNew ? '등록 — ' : '저장 — ') + v.c + (vis ? '' : ' (🙈 숨김)'));
  };
  setTimeout(() => $(isNew && !newCode ? 'fC' : 'fD').focus(), 50);
}

/* ---- 🗂 이전 시스템 숨김 기록 — LEVEL_1_AND_2 에서 레벨을 비워 둔 코드 (data/sbm-hidden.json) 와 지금 목록을 맞춤 (관리자) ---- */
let SBM = null;
async function sbmCard() {
  const box = $('itSbm'); if (!box) return;
  if (!SBM) { try { const r = await fetch('data/sbm-hidden.json'); SBM = r.ok ? await r.json() : []; } catch (e) { SBM = []; } }
  const C = catalog(), set = new Set(SBM);
  const inCat = C.items.filter(x => !x.virt && set.has(x.c)), todo = inCat.filter(x => !x.h);
  box.innerHTML = '<div class="card"><details' + (todo.length ? ' open' : '') + '><summary><b>🗂 이전 시스템 숨김 기록과 맞추기</b> <span class="muted">— LEVEL_1_AND_2 에서 레벨을 비워 둔 ' + SBM.length.toLocaleString() + '개 중 지금 목록에 있는 ' + inCat.length + '개' + (todo.length ? ' · <span class="warn">아직 보이는 ' + todo.length + '개</span>' : ' · 모두 숨김 ✓') + '</span></summary>' +
    '<div class="muted" style="margin-top:6px">이전 시스템에서 세일즈맨에게 안 보이게 레벨을 비워 둔 아이템입니다. 목록에 없는 나머지는 Item Master 에 없는 코드(이미 뺀 단종품)라 그대로 둡니다. 앞으로는 이 화면의 🙈 버튼이나 관리 → 🗂 분류 → LEVEL_1_AND_2 파일(LEVEL 1 빈 줄 = 숨김)로 관리하세요.</div>' +
    (todo.length ? '<div style="margin-top:6px">' + todo.slice(0, 40).map(x => '<span class="tag t-x" style="margin:2px">' + esc(x.c) + '</span>').join('') + (todo.length > 40 ? ' <span class="muted">외 ' + (todo.length - 40) + '개</span>' : '') + '</div><div class="btns" style="justify-content:flex-start"><button class="b-blue" id="sbmGo">🙈 이 ' + todo.length + '개 숨기기</button></div>' : '') + '</details></div>';
  if ($('sbmGo')) $('sbmGo').onclick = () => applyHidden(todo.map(x => x.c), true);
}
