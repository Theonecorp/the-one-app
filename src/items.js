/* ============================================================
 *  🏷 아이템 관리 — 담당자 · 관리자가 앱에서 아이템을 하나씩 등록 · 수정 · 삭제
 *    엑셀(Item Master) 전체 올리기는 관리 → 📦 아이템. 여기는 "오늘 새로 들어온 아이템 몇 개" 같은 일상 작업용.
 *    저장하면 카탈로그 전체를 다시 발행(publish)해서 모든 폰이 다음에 열 때 새 목록을 받음 (몇 초 걸림)
 *  행 모양: [code, desc, price, srp, barcode, group, l1, l2, l3, photo]
 * ============================================================ */
import { $, esc, money, num, R2, toast, busy, openModal, closeModal, confirmBox, Router, sel, debounce, bi } from './ui.js';
import { loadCatalog, catalog, searchItems, editCatalog, ensureCats, cleanName, thumb } from './catalog.js';
import { typeOfItem, invTypes } from './invoicing.js';

let S = null, Q = '';
export function register(state) { S = state; Router.on('items', page); }
const isStaff = () => S.role !== 'salesman';

async function page(arg) {
  if (!isStaff()) { $('page').innerHTML = '<div class="card"><div class="none">담당자 · 관리자만 쓰는 화면입니다</div></div>'; return; }
  if (arg) Q = arg;
  $('page').innerHTML = '<div class="load">아이템 목록 읽는 중…</div>';
  try { await loadCatalog(S); } catch (e) { if (!catalog()) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; } }
  paint();
}
function paint() {
  const C = catalog();
  $('page').innerHTML = '<div class="card"><h2>🏷 ' + bi('아이템 관리', 'Items') + ' <span class="muted" style="font-weight:400;font-size:12px">' + C.items.filter(x => !x.virt).length.toLocaleString() + '개</span></h2>' +
    '<div class="muted">새 아이템 등록 · 가격 · 이름 · 분류 수정 · 삭제. 저장하면 모든 폰의 주문 목록이 바뀝니다. 엑셀로 한꺼번에 올리기는 관리 → 📦 아이템.</div>' +
    '<div style="display:flex;gap:6px;margin-top:10px"><input id="itQ" placeholder="코드 · 이름 · 바코드 / Code · Name · Barcode" value="' + esc(Q) + '" autocomplete="off" autocapitalize="characters" style="flex:1"><button class="b-blue" id="itNew" style="flex:0 0 auto">＋ ' + bi('새 아이템', 'New') + '</button></div>' +
    '<div id="itList" style="margin-top:8px"></div></div>';
  const list = () => {
    const q = $('itQ').value.trim(); Q = q;
    const hits = q ? searchItems(q, [], 80) : [];
    $('itList').innerHTML = !q ? '<div class="none">코드나 이름으로 찾은 뒤 눌러서 고치세요 · 없는 코드는 ＋ 새 아이템</div>' :
      hits.length ? hits.map(it => '<div class="pr tap" data-it="' + esc(it.c) + '">' + (it.ph ? '<img src="' + esc(thumb(it.ph, 80)) + '" style="width:40px;height:40px;object-fit:cover;border-radius:8px;margin-right:8px" alt="">' : '') + '<div class="ct"><b>' + esc(it.c) + (it.k ? ' <span class="tag t-a">🧩 세트</span>' : '') + '</b><small>' + esc(it.d) + '</small><small>' + esc([it.g, it.l1, it.l2, it.l3].filter(Boolean).map(cleanName).join(' › ')) + (it.b ? ' · ' + esc(it.b) : '') + '</small></div><div class="pa"><b>' + money(it.p) + '</b>' + (it.s ? '<small>SRP ' + money(it.s) + '</small>' : '') + '</div></div>').join('') :
      '<div class="none">맞는 아이템이 없습니다 — <a href="#" id="itMk">＋ "' + esc(q.toUpperCase()) + '" 로 새 아이템 등록</a></div>';
    document.querySelectorAll('[data-it]').forEach(el => el.onclick = () => form(C.byCode[el.dataset.it]));
    if ($('itMk')) $('itMk').onclick = e => { e.preventDefault(); form(null, q.toUpperCase()); };
  };
  list();
  $('itQ').oninput = debounce(list, 150);
  $('itNew').onclick = () => form(null, '');
}

/** 분류 선택 — 기존 이름 중에서 고르거나 새로 치기 */
function catPick(id, label, names, val) {
  return '<div class="fg"><label>' + label + '</label><input id="' + id + '" list="' + id + 'L" value="' + esc(val || '') + '" autocomplete="off" placeholder="고르거나 새로 입력"><datalist id="' + id + 'L">' + names.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></div>';
}
function form(it, newCode) {
  const C = catalog(), isNew = !it;
  const x = it || { c: newCode || '', d: '', p: '', s: '', b: '', g: '', l1: '', l2: '', l3: '', ph: '' };
  const uniq = arr => Array.from(new Set(arr.filter(Boolean))).sort();
  const groups = uniq(C.cats.map(p => p[0]).concat(C.items.map(i => i.g)));
  const l1s = g => uniq(C.cats.filter(p => !g || p[0] === g).map(p => p[1]).concat(C.items.filter(i => !g || i.g === g).map(i => i.l1)));
  const l2s = (g, l1) => uniq(C.cats.filter(p => (!g || p[0] === g) && (!l1 || p[1] === l1)).map(p => p[2]).concat(C.items.filter(i => (!g || i.g === g) && (!l1 || i.l1 === l1)).map(i => i.l2)));
  const l3s = (g, l1, l2) => uniq(C.cats.filter(p => (!g || p[0] === g) && (!l1 || p[1] === l1) && (!l2 || p[2] === l2)).map(p => p[3]).concat(C.items.filter(i => (!g || i.g === g) && (!l1 || i.l1 === l1) && (!l2 || i.l2 === l2)).map(i => i.l3)));
  openModal('<h2>' + (isNew ? '＋ ' + bi('새 아이템', 'New item') : '✏️ ' + esc(x.c)) + '</h2>' +
    (x.k ? '<div class="alert a-amb">🧩 세트 아이템 — 구성은 관리 → 📦 아이템 → 세트 구성에서 고칩니다. 여기서는 이름 · 가격 · 분류만.</div>' : '') +
    '<div class="two"><div class="fg"><label>코드 <span class="en">Code</span> *</label><input id="fC" value="' + esc(x.c) + '" ' + (isNew ? '' : 'readonly style="background:#f1f5f9"') + ' autocapitalize="characters" style="text-transform:uppercase"></div><div class="fg"><label>바코드 <span class="en">Barcode</span></label><input id="fB" value="' + esc(x.b || '') + '" inputmode="numeric"></div></div>' +
    '<div class="fg"><label>이름 · 설명 <span class="en">Description</span> *</label><input id="fD" value="' + esc(x.d) + '"></div>' +
    '<div class="two"><div class="fg"><label>도매가 <span class="en">Price</span> * $</label><input id="fP" value="' + esc(x.p === '' ? '' : x.p) + '" inputmode="decimal" style="font-weight:800;text-align:right"></div><div class="fg"><label>소비자가 <span class="en">SRP</span> $</label><input id="fS" value="' + esc(x.s || '') + '" inputmode="decimal" style="text-align:right"></div></div>' +
    '<div class="two">' + catPick('fG', '그룹 <span class="en">Group</span>', groups, x.g) + catPick('fL1', 'Level 1', l1s(x.g), x.l1) + '</div>' +
    '<div class="two">' + catPick('fL2', 'Level 2', l2s(x.g, x.l1), x.l2) + catPick('fL3', 'Level 3', l3s(x.g, x.l1, x.l2), x.l3) + '</div>' +
    '<div class="fg"><label>사진 주소 <span class="en">Photo URL</span></label><input id="fPh" value="' + esc(x.ph || '') + '" placeholder="https://…"></div>' +
    '<div class="sumbox" id="fType"></div>' +
    '<div class="btns">' + (isNew ? '' : '<button class="b-ghost" id="fDel" style="color:#991b1b">🗑 삭제</button>') + '<button class="b-ghost" id="fX">취소</button><button class="b-blue" id="fOk">' + (isNew ? '등록' : '저장') + '</button></div>');
  const cur = () => ({ c: $('fC').value.trim().toUpperCase(), d: $('fD').value.trim(), p: R2(num($('fP').value)), s: R2(num($('fS').value)) || 0, b: $('fB').value.trim().replace(/\.0+$/, ''), g: $('fG').value.trim(), l1: $('fL1').value.trim(), l2: $('fL2').value.trim(), l3: $('fL3').value.trim(), ph: $('fPh').value.trim() });
  const showType = () => { const v = cur(); const t = typeOfItem(S, v), tt = invTypes(S).find(z => z.c === t); $('fType').innerHTML = '🧾 인보이스 종류: <b>' + esc(t) + '</b> ' + esc(tt ? tt.n : '') + ' <span class="muted">(분류 이름으로 자동 결정 · 관리 → 설정 → 인보이스 종류)</span>' + (v.g || v.l1 ? '' : '<br><span class="warn">분류가 없으면 주문 화면의 분류 버튼에서 찾을 수 없고 검색으로만 나옵니다</span>'); };
  ['fG', 'fL1', 'fL2', 'fL3'].forEach(id => $(id).oninput = showType);
  const refreshLists = () => { const v = cur(); const fill = (id, arr) => { const dl = $(id + 'L'); if (dl) dl.innerHTML = arr.map(n => '<option value="' + esc(n) + '">').join(''); }; fill('fL1', l1s(v.g)); fill('fL2', l2s(v.g, v.l1)); fill('fL3', l3s(v.g, v.l1, v.l2)); };
  ['fG', 'fL1', 'fL2'].forEach(id => $(id).onchange = refreshLists);
  showType();
  $('fX').onclick = closeModal;
  if ($('fDel')) $('fDel').onclick = async () => {
    if (!(await confirmBox(x.c + ' 아이템을 목록에서 뺄까요? 지난 주문 · 인보이스 기록은 그대로 남습니다. / Remove this item from the catalog?', '삭제'))) return;
    busy(true);
    try { await editCatalog(S, (rows, cats, sets) => { const i = rows.findIndex(r => r[0] === x.c); if (i >= 0) rows.splice(i, 1); if (sets[x.c]) delete sets[x.c]; }); closeModal(); toast(x.c + ' 삭제 — 모든 폰에 반영됩니다', 'good'); paint(); }
    catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  $('fOk').onclick = async () => {
    const v = cur();
    if (!v.c) return toast('코드를 넣어 주세요', 'bad');
    if (!/^[A-Z0-9][A-Z0-9\-_.\/ ]{0,29}$/.test(v.c)) return toast('코드는 영문 · 숫자 · - _ . / 만 (30자 이내)', 'bad');
    if (!v.d) return toast('이름을 넣어 주세요', 'bad');
    if (!(v.p > 0)) return toast('도매가를 넣어 주세요', 'bad');
    if (isNew && C.byCode[v.c]) return toast('이미 있는 코드입니다 — 찾아서 수정하세요', 'bad');
    if (v.b) { const dup = C.items.find(i => i.b === v.b && i.c !== v.c); if (dup && !(await confirmBox('바코드 ' + v.b + ' 는 ' + dup.c + ' 에도 있습니다. 그래도 저장할까요?', '저장'))) return; }
    if (v.ph && !/^https?:\/\//i.test(v.ph)) return toast('사진 주소는 https:// 로 시작해야 합니다', 'bad');
    busy(true);
    try {
      await editCatalog(S, (rows, cats) => {
        const row = [v.c, v.d, v.p, v.s, v.b, v.g, v.l1, v.l2, v.l3, v.ph];
        const i = rows.findIndex(r => r[0] === v.c); if (i >= 0) rows[i] = row; else rows.push(row);
        ensureCats(rows, cats);
      });
      closeModal(); toast((isNew ? '등록했습니다 — ' : '저장했습니다 — ') + v.c + ' · 모든 폰에 반영됩니다', 'good');
      Q = v.c; paint();
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  setTimeout(() => $(isNew && !newCode ? 'fC' : 'fD').focus(), 50);
}
