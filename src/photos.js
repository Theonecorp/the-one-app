/* ============================================================
 *  📷 사진 작업대 — 디자인 · 카탈로그 담당이 아이템 사진을 한눈에 보고 바로 고치는 화면
 *    큰 사진 카드 격자 · 걸러보기(사진 없음 · 앱 사진 · 드라이브 · 시트 · 안 씀) · 분류 · 검색
 *    카드에서 바로: 📷 올리기(폰 카메라 · 파일) · 🚫 이 사진 안 쓰기 · ↩ 원래대로 · ✏️ 아이템 열기
 *    저장은 즉시 (itemPhotos — catalog.js setItemPhoto), 카드가 제자리에서 바뀜 → 다음 카드로
 * ============================================================ */
import { $, esc, toast, busy, Router, debounce, bi, bt } from './ui.js';
import { loadCatalog, catalog, thumb, setItemPhoto, setItemPhotosBulk, itemByFileName, shrinkImage, photoOv, cleanName, catStart, treeFor, levelsOf } from './catalog.js';
import { openModal, closeModal } from './ui.js';
import { can } from './main.js';

let S = null;
const PF = { mode: 'noph', q: '', path: [], page: 60 };
export function register(state) { S = state; Router.on('photos', page); }
const ok = () => S.role === 'admin' || S.role === 'owner' || (S.role === 'manager' && (can('catalog') || can('items')));
const SRC = { app: ['📱', '앱 사진', 'App'], drive: ['☁️', '드라이브', 'Drive'], sheet: ['📄', '시트', 'Sheet'], none: ['🚫', '안 씀', 'Off'], '': ['📷✕', '없음', 'None'] };

async function page(arg) {
  if (!ok()) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('담당자 · 관리자만 쓰는 화면입니다', 'Staff / admins only') + '</div></div>'; return; }
  let bulk = false; if (arg === 'bulk') { bulk = true; arg = ''; }
  if (arg) { PF.mode = arg.split(':')[0] || 'noph'; PF.path = arg.indexOf(':') > 0 ? decodeURIComponent(arg.substring(arg.indexOf(':') + 1)).split('/').filter(Boolean) : []; }
  $('page').innerHTML = '<div class="load">' + bt('아이템 읽는 중…', 'Loading items…') + '</div>';
  try { await loadCatalog(S); } catch (e) { if (!catalog()) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; } }
  PF.page = 60; paint();
  if (bulk && canBulk()) bulkModal();
}
/** 📁 일괄 등록은 디자인 · 카탈로그 담당 (관리자 포함) 만 */
const canBulk = () => S.role === 'admin' || S.role === 'owner' || can('catalog');
function pool() {
  const C = catalog(); let L = C.items.filter(x => !x.h);
  if (PF.path.length) L = L.filter(x => { const V = levelsOf(x, catStart(S)); return PF.path.every((p, i) => V[i] === p); });
  if (PF.mode === 'noph') L = L.filter(x => !x.ph); else if (PF.mode !== 'all') L = L.filter(x => (x.phSrc || '') === PF.mode);
  const q = PF.q.trim().toUpperCase(); if (q) { const w = q.split(/\s+/); L = L.filter(x => w.every(k => (x.c + ' ' + x.d).toUpperCase().includes(k))); }
  return L;
}
function paint() {
  const C = catalog(), vis = C.items.filter(x => !x.h);
  const n = k => vis.filter(x => k === 'noph' ? !x.ph : k === 'all' ? true : (x.phSrc || '') === k).length;
  let node = treeFor(S), under = []; for (const p of PF.path) { if (node.map[p]) { node = node.map[p]; under.push(p); } else break; } PF.path = under;
  const crumbs = '<div class="chips crumbs">' + (under.length ? '<button class="up" data-pp="' + (under.length - 1) + '">‹ ' + bi('상위', 'Up') + '</button>' : '') + '<button class="' + (under.length ? '' : 'on') + '" data-pp="0">' + bi('전체', 'All') + '</button>' + under.map((p, i) => '<button class="' + (i === under.length - 1 ? 'on' : '') + '" data-pp="' + (i + 1) + '">' + esc(cleanName(p)) + '</button>').join('') + '</div>' +
    (node.kids.length ? '<div class="chips" style="margin-top:4px">' + node.kids.map(k => { const miss = k.n ? vis.filter(x => { const V = levelsOf(x, catStart(S)); return under.every((p, i) => V[i] === p) && V[under.length] === k.name && !x.ph; }).length : 0; return '<button data-pk="' + esc(k.name) + '">' + esc(cleanName(k.name)) + ' <span class="en">' + (PF.mode === 'noph' ? miss : k.n) + '</span></button>'; }).join('') + '</div>' : '');
  $('page').innerHTML = '<div class="card" style="padding:12px 14px"><h2 style="margin:0 0 6px">📷 ' + bi('사진 작업대', 'Photo workbench') + ' <span class="muted" style="font-weight:400;font-size:12px">' + bt('보이는 아이템', 'visible items') + ' ' + vis.length.toLocaleString() + '</span></h2>' +
    '<div class="muted" style="font-size:12.5px">' + bt('카드의 📷 를 누르면 바로 사진을 찍거나 고를 수 있고, 저장되면 카드가 제자리에서 바뀝니다. 잘못 붙은 사진은 🚫, 되돌리려면 ↩. 찍은 사진은 ☁️ 구글 드라이브(item_picture)에 코드 이름으로도 자동 저장됩니다.', 'Tap 📷 on a card to shoot or pick a photo — it saves right away. 🚫 turns a wrong photo off, ↩ restores. Photos are also saved to Google Drive (item_picture) under the item code.') + '</div><div class="muted" id="phDrive" style="font-size:12px"></div>' +
    '<div class="seg" style="margin-top:8px;flex-wrap:wrap">' + [['noph', '📷✕ ' + bt('사진 없음', 'No photo')], ['all', bt('전체', 'All')], ['app', '📱 ' + bt('앱 사진', 'App')], ['drive', '☁️ ' + bt('드라이브', 'Drive')], ['sheet', '📄 ' + bt('시트', 'Sheet')], ['none', '🚫 ' + bt('안 씀', 'Off')]].map(m => '<button class="' + (PF.mode === m[0] ? 'on' : '') + '" data-pm="' + m[0] + '">' + m[1] + ' <span class="en">' + n(m[0]).toLocaleString() + '</span></button>').join('') + '</div>' +
    '<input id="phQ" placeholder="' + esc(bt('코드 · 이름', 'Code · name')) + '" value="' + esc(PF.q) + '" autocomplete="off" autocapitalize="characters" style="margin-top:8px">' + crumbs +
    (canBulk() ? '<div class="btns" style="justify-content:flex-start;margin-top:8px"><button class="b-blue b-sm" id="phBulk">📁 ' + bt('사진 일괄 등록', 'Bulk photo upload') + '</button><span class="muted" style="font-size:12px">' + bt('파일 이름 = 아이템 코드 (예: AHG100.jpg)', 'file name = item code (e.g. AHG100.jpg)') + '</span></div>' : '') + '</div>' +
    '<div class="card"><div class="muted" id="phN"></div><div class="phgrid" id="phGrid"></div><div id="phMore"></div></div>';
  document.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { PF.mode = b.dataset.pm; PF.page = 60; paint(); });
  if ($('phBulk')) $('phBulk').onclick = bulkModal;
  /* ☁️ 드라이브 저장 상태 — 대기 · 실패 */
  (async () => { try { const w = await S.DB.count('photoUploads', { where: [['drive', '==', 'wait']] }), f = await S.DB.count('photoUploads', { where: [['drive', '==', 'error']] }); const el = $('phDrive'); if (el) el.innerHTML = (w ? '☁️ ' + bt('드라이브 저장 대기', 'Waiting for Drive') + ' <b>' + w + '</b>' + bt('장 (5분 안에 올라감)', ' (uploads within 5 min)') : '☁️ ' + bt('드라이브 저장 대기 없음', 'Nothing waiting for Drive')) + (f ? ' · <span class="warn">' + bt('실패', 'failed') + ' ' + f + '</span>' : ''); } catch (e) {} })();
  document.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => { PF.path = PF.path.slice(0, Number(b.dataset.pp)); PF.page = 60; paint(); });
  document.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => { PF.path = PF.path.concat([b.dataset.pk]); PF.page = 60; paint(); });
  $('phQ').oninput = debounce(() => { PF.q = $('phQ').value; PF.page = 60; grid(); }, 150);
  grid();
}
function card(x) {
  const s = SRC[x.phSrc || ''] || SRC[''], ov = photoOv(x.c);
  return '<div class="phcard' + (x.ph ? '' : ' miss') + '" data-pc="' + esc(x.c) + '"><div class="phimg">' + (x.ph ? '<img src="' + esc(thumb(x.ph, 300)) + '" loading="lazy" alt="">' : '<span>📷✕<br><small>' + bt('사진 없음', 'no photo') + '</small></span>') + '<span class="phsrc">' + s[0] + ' ' + bt(s[1], s[2]) + '</span></div>' +
    '<div class="pht"><b>' + esc(x.c) + '</b><small>' + esc(x.kn || x.d || '') + '</small></div>' +
    '<div class="phb"><label class="b-blue b-sm" title="' + esc(bt('사진 올리기', 'Upload')) + '">📷<input type="file" accept="image/*" data-pf="' + esc(x.c) + '" style="display:none"></label>' +
    (x.ph && x.phSrc !== 'none' ? '<button class="b-ghost b-sm" data-pn="' + esc(x.c) + '" title="' + esc(bt('이 사진 안 쓰기', "Don't use")) + '">🚫</button>' : '') + (ov ? '<button class="b-ghost b-sm" data-pr="' + esc(x.c) + '" title="' + esc(bt('원래대로', 'Restore')) + '">↩</button>' : '') +
    '<button class="b-ghost b-sm" data-pe="' + esc(x.c) + '" title="' + esc(bt('아이템 열기', 'Open item')) + '">✏️</button></div></div>';
}
function grid() {
  const L = pool(), show = L.slice(0, PF.page), g = $('phGrid'); if (!g) return;
  $('phN').textContent = L.length.toLocaleString() + bt('개', ' items') + (PF.mode === 'noph' ? ' — ' + bt('사진이 없는 아이템', 'without a photo') : '');
  g.innerHTML = show.length ? show.map(card).join('') : '<div class="none" style="grid-column:1/-1">' + (PF.mode === 'noph' ? '✅ ' + bt('이 조건에 사진 없는 아이템이 없습니다', 'No items without a photo here') : bt('맞는 아이템이 없습니다', 'No items')) + '</div>';
  $('phMore').innerHTML = L.length > show.length ? '<button class="b-ghost" id="phMoreB" style="margin-top:8px">' + bt('더 보기', 'More') + ' (' + (L.length - show.length).toLocaleString() + ')</button>' : '';
  if ($('phMoreB')) $('phMoreB').onclick = () => { PF.page += 60; grid(); };
  bind(g);
}
function bind(g) {
  const C = catalog();
  const redraw = c => { const el = g.querySelector('[data-pc="' + CSS.escape(c) + '"]'); const x = C.byCode[c]; if (!el || !x) return; if (PF.mode === 'noph' && x.ph) { el.classList.add('done'); setTimeout(() => { el.remove(); $('phN').textContent = pool().length.toLocaleString() + bt('개', ' items') + ' — ' + bt('사진이 없는 아이템', 'without a photo'); }, 700); } else { el.outerHTML = card(x); bind(g); } };
  const go = async (c, o, msg) => { busy(true); try { await setItemPhoto(S, c, o); toast('📷 ' + c + ' — ' + msg, 'good'); redraw(c); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  g.querySelectorAll('[data-pf]').forEach(inp => inp.onchange = async () => { const f = inp.files[0]; if (!f) return; busy(true); let data = ''; try { data = await shrinkImage(f); } catch (e) { busy(false); return toast(e.message, 'bad'); } busy(false); await go(inp.dataset.pf, { data, file: f }, bt('올림 · ☁️ 드라이브에도 저장', 'uploaded · also to Drive')); });
  g.querySelectorAll('[data-pn]').forEach(b => b.onclick = () => go(b.dataset.pn, { none: true }, bt('안 씀', 'off')));
  g.querySelectorAll('[data-pr]').forEach(b => b.onclick = () => go(b.dataset.pr, { clear: true }, bt('원래대로', 'restored')));
  g.querySelectorAll('[data-pe]').forEach(b => b.onclick = async () => { const { openItem } = await import('./items.js'); openItem(b.dataset.pe, () => redraw(b.dataset.pe)); });
  g.querySelectorAll('.phimg img').forEach(im => im.onclick = () => { const x = C.byCode[im.closest('[data-pc]').dataset.pc]; if (x && x.ph) window.open(thumb(x.ph, 1200), '_blank', 'noopener'); });
}

/* ---------- 📁 사진 일괄 등록 — 여러 파일(또는 폴더)을 고르면 파일 이름으로 아이템을 찾아 한 번에 저장 ---------- */
let BK = null;   // { rows: [{ code, it, file, dup }], bad: [file names] }
function bulkModal() {
  BK = null;
  openModal('<h2>📁 ' + bi('사진 일괄 등록', 'Bulk photo upload') + '</h2>' +
    '<div class="muted">' + bt('사진 파일 이름을 아이템 코드로 두고 (예: AHG100.jpg · AHG100 (1).jpg · AHG100_front.jpg) 여러 장을 한 번에 고르세요. 폴더째로도 됩니다. 같은 코드가 여러 장이면 첫 장만 씁니다.', 'Name each photo with its item code (e.g. AHG100.jpg, AHG100 (1).jpg, AHG100_front.jpg) and pick many at once, or a whole folder. With several photos per code the first one is used.') + '</div>' +
    '<div class="btns" style="justify-content:flex-start;margin-top:8px"><label class="b-blue">🖼 ' + bi('사진 여러 장 고르기', 'Pick photos') + '<input type="file" id="bkF" accept="image/*" multiple style="display:none"></label><label class="b-ghost">📂 ' + bi('폴더 고르기', 'Pick a folder') + '<input type="file" id="bkD" accept="image/*" multiple webkitdirectory style="display:none"></label></div>' +
    '<div id="bkBody"></div><div class="btns"><button class="b-ghost" id="bkX">' + bt('닫기', 'Close') + '</button><button class="b-green" id="bkGo" disabled>⬆️ ' + bt('올리기', 'Upload') + '</button></div>');
  $('bkX').onclick = closeModal;
  const pick = inp => { const files = Array.from(inp.files || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name)); if (!files.length) return toast(bt('사진 파일이 없습니다', 'No image files'), 'bad'); scanFiles(files); };
  $('bkF').onchange = () => pick($('bkF')); $('bkD').onchange = () => pick($('bkD'));
  $('bkGo').onclick = bulkGo;
}
function scanFiles(files) {
  const seen = {}, rows = [], bad = [];
  files.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })).forEach(f => {
    const it = itemByFileName(f.name); if (!it) { bad.push(f.name); return; }
    const dup = !!seen[it.c]; seen[it.c] = true; rows.push({ code: it.c, it, file: f, dup });
  });
  BK = { rows, bad };
  const use = rows.filter(r => !r.dup), has = use.filter(r => r.it.ph).length;
  $('bkBody').innerHTML = '<div class="kpi" style="margin-top:8px"><div><b>' + files.length + '</b><span>' + bt('파일', 'files') + '</span></div><div><b class="ok">' + use.length + '</b><span>' + bt('아이템 맞음', 'matched') + '</span></div><div><b class="' + (bad.length ? 'warn' : '') + '">' + bad.length + '</b><span>' + bt('코드 못 찾음', 'no match') + '</span></div></div>' +
    (has ? '<div class="alert a-amb">⚠️ ' + has + bt('개는 이미 사진이 있습니다 — 새 사진으로 바뀝니다', ' already have a photo — they will be replaced') + '</div>' : '') +
    (rows.some(r => r.dup) ? '<div class="muted">' + bt('같은 코드 여러 장', 'duplicates skipped') + ': ' + rows.filter(r => r.dup).length + '</div>' : '') +
    '<div class="dtw" style="max-height:40vh;overflow:auto;margin-top:6px"><table class="dt"><thead><tr><th>' + bt('코드', 'Code') + '</th><th>' + bt('이름', 'Description') + '</th><th>' + bt('파일', 'File') + '</th></tr></thead><tbody>' +
    use.slice(0, 400).map(r => '<tr data-bkr="' + esc(r.code) + '"><td class="ct"><b>' + esc(r.code) + '</b>' + (r.it.ph ? ' <span class="tag t-g">🔄</span>' : '') + '</td><td class="wrap">' + esc(r.it.d || '') + '</td><td class="sub0">' + esc(r.file.name) + '</td></tr>').join('') +
    bad.slice(0, 200).map(n => '<tr class="hid"><td class="warn">✕</td><td class="muted">' + bt('코드 못 찾음', 'no matching item') + '</td><td class="sub0">' + esc(n) + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div id="bkProg" class="muted" style="margin-top:6px"></div>';
  $('bkGo').disabled = !use.length; $('bkGo').textContent = '⬆️ ' + bt('올리기', 'Upload') + ' ' + use.length;
}
async function bulkGo() {
  if (!BK) return; const use = BK.rows.filter(r => !r.dup); if (!use.length) return;
  $('bkGo').disabled = true; $('bkX').disabled = true; const prog = $('bkProg');
  const list = [], fail = [];
  for (let i = 0; i < use.length; i++) {
    const r = use[i]; if (prog) prog.textContent = '🖼 ' + bt('줄이는 중', 'Resizing') + ' ' + (i + 1) + ' / ' + use.length + ' — ' + r.code;
    try { list.push({ code: r.code, data: await shrinkImage(r.file), file: r.file }); } catch (e) { fail.push(r.code + ' (' + (e.message || e) + ')'); }
  }
  let n = 0;
  try { n = await setItemPhotosBulk(S, list, (i, t, c) => { if (prog) prog.textContent = '⬆️ ' + bt('저장 중', 'Saving') + ' ' + (i + 1) + ' / ' + t + ' — ' + c; }); }
  catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); $('bkGo').disabled = false; $('bkX').disabled = false; return; }
  closeModal(); toast('📁 ' + n + bt('개 아이템 사진 등록', ' item photos saved') + (fail.length ? ' · ✕ ' + fail.length : ''), fail.length ? 'bad' : 'good');
  if (fail.length) console.warn('bulk photo fail', fail);
  BK = null; PF.page = 60; paint();
}
