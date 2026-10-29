/* ============================================================
 *  📷 사진 작업대 — 디자인 · 카탈로그 담당이 아이템 사진을 한눈에 보고 바로 고치는 화면
 *    큰 사진 카드 격자 · 걸러보기(사진 없음 · 앱 사진 · 드라이브 · 시트 · 안 씀) · 분류 · 검색
 *    카드에서 바로: 📷 올리기(폰 카메라 · 파일) · 🚫 이 사진 안 쓰기 · ↩ 원래대로 · ✏️ 아이템 열기
 *    저장은 즉시 (itemPhotos — catalog.js setItemPhoto), 카드가 제자리에서 바뀜 → 다음 카드로
 * ============================================================ */
import { $, esc, toast, busy, Router, debounce, bi, bt } from './ui.js';
import { loadCatalog, catalog, thumb, setItemPhoto, shrinkImage, photoOv, cleanName, catStart, treeFor, levelsOf } from './catalog.js';
import { can } from './main.js';

let S = null;
const PF = { mode: 'noph', q: '', path: [], page: 60 };
export function register(state) { S = state; Router.on('photos', page); }
const ok = () => S.role === 'admin' || S.role === 'owner' || (S.role === 'manager' && (can('catalog') || can('items')));
const SRC = { app: ['📱', '앱 사진', 'App'], drive: ['☁️', '드라이브', 'Drive'], sheet: ['📄', '시트', 'Sheet'], none: ['🚫', '안 씀', 'Off'], '': ['📷✕', '없음', 'None'] };

async function page(arg) {
  if (!ok()) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('담당자 · 관리자만 쓰는 화면입니다', 'Staff / admins only') + '</div></div>'; return; }
  if (arg) { PF.mode = arg.split(':')[0] || 'noph'; PF.path = arg.indexOf(':') > 0 ? decodeURIComponent(arg.substring(arg.indexOf(':') + 1)).split('/').filter(Boolean) : []; }
  $('page').innerHTML = '<div class="load">' + bt('아이템 읽는 중…', 'Loading items…') + '</div>';
  try { await loadCatalog(S); } catch (e) { if (!catalog()) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; } }
  PF.page = 60; paint();
}
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
    '<input id="phQ" placeholder="' + esc(bt('코드 · 이름', 'Code · name')) + '" value="' + esc(PF.q) + '" autocomplete="off" autocapitalize="characters" style="margin-top:8px">' + crumbs + '</div>' +
    '<div class="card"><div class="muted" id="phN"></div><div class="phgrid" id="phGrid"></div><div id="phMore"></div></div>';
  document.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { PF.mode = b.dataset.pm; PF.page = 60; paint(); });
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
