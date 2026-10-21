/* ============================================================
 *  아이템 카탈로그 — 7천여 개를 매번 읽지 않도록 묶음(문서 몇 개)으로 저장하고 폰에 보관
 *  catalog/meta = { ver, count, chunks, cats:[[g,l1,l2,l3]...], updatedAt, by }
 *  catalog/c0..cN = { j: JSON [[code, desc, price, srp, barcode, group, l1, l2, l3, photo, hide, loc], ...] }
 *    loc = 창고 통로 · 위치 (예: A-03-2). 비어 있으면 분류 기본 위치(settings.app.catLoc)를 씀 → 픽킹 리스트를 통로 순으로
 *    hide = 1 이면 '숨김' — 목록에는 있지만 세일즈맨 주문 화면(분류 · 검색 · ✨)에 안 보임 (단종 · 재입고 지연). 이전 시스템의 "레벨 비워두기" 역할
 *  catalog/sets = { j: JSON { SETCODE: { n: 이름, k: [[code, qty], ...] } } }  ← 세트 · 인서트 구성 (meta.setsVer)
 *  ver 가 바뀔 때만 다시 받습니다 (📦 아이템 올리기 때 바뀜)
 * ============================================================ */
import { num, R2 } from './ui.js';

const IDB_NAME = 'theone', IDB_STORE = 'kv', IDB_KEY = 'catalog.v1';
const CHUNK_BYTES = 700000;   // Firestore 문서 한도(1MB)보다 넉넉히 작게

/* ---------- 폰 보관 (IndexedDB — localStorage 는 5MB 한도라 부족) ---------- */
function idb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) { try { const db = await idb(); return await new Promise(res => { const q = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function idbSet(key, v) { try { const db = await idb(); await new Promise(res => { const t = db.transaction(IDB_STORE, 'readwrite'); t.objectStore(IDB_STORE).put(v, key); t.oncomplete = res; t.onerror = res; }); } catch (e) {} }

/* ---------- 읽기 ---------- */
let CAT = null;   // { ver, items, byCode, byBar, cats, tree }
export function catalog() { return CAT; }

/* ---------- 분류 순서 규칙: 📌 위에 고정 → ABC → 📌 아래에 고정 (설정 settings.app.catPins) ---------- */
let PINS = { top: [], bottom: [] };
const pinKey = s => String(s || '').trim().toUpperCase();
export function pins() { return PINS; }
/* ---------- 📍 창고 위치 — 아이템 loc 이 없으면 분류 기본 위치 (Level 1 › 2 › 3 중 가장 자세한 것) ---------- */
let LOCS = {};   // { 'L1': 'A', 'L1\u0001L2': 'A-03', … }
export const locKey = path => path.filter(Boolean).join('\u0001');
export function catLocs() { return LOCS; }
export function setLocs(m) { LOCS = m || {}; }
/** 아이템(또는 코드)의 위치 — 자기 위치 → L1›L2›L3 → L1›L2 → L1 */
export function locOf(x) { if (typeof x === 'string') x = CAT && CAT.byCode[x]; if (!x) return ''; if (x.loc) return x.loc; for (let n = 3; n >= 1; n--) { const v = LOCS[locKey([x.l1, x.l2, x.l3].slice(0, n))]; if (v) return v; } return ''; }
/** 통로 이름 — 'A-03-2' → 'A', '12.4' → '12' */
export const aisleOf = loc => String(loc || '').split(/[-.\s/]/)[0] || '';
/** 픽킹 순서: 위치 있는 것 통로 · 선반 순(자연 정렬) → 위치 없는 것 코드 순 */
export function pickSort(a, b) { const x = locOf(a.c), y = locOf(b.c); if (!x !== !y) return x ? -1 : 1; return COLL.compare(x, y) || COLL.compare(a.c, b.c); }
export function setPins(p) {
  PINS = { top: ((p && p.top) || []).map(String), bottom: ((p && p.bottom) || []).map(String) };
  if (CAT) { sortTree(CAT.tree); sortTree(CAT.tree1); }
}
/* 이전 시스템에서 쓰던 앞글자 규칙 (세일즈맨이 익숙한 순서):
 *   ""  → 맨 앞 (SET ORDER"")   "  → 그 다음 (디스플레이 · 인서트)   보통 이름 → 주얼리 ABC
 *   [   → 그 외 제품 ([NEXONE] [PERFUME] …)   < * z → 맨 뒤 (<GIFT> *SUPPLY* zCREDIT) */
export function prefixRank(name) {
  const s = String(name || '').trim();
  if (s.startsWith('""') || s.endsWith('""')) return 0;
  if (s.startsWith('"')) return 1;
  if (s.startsWith('[')) return 3;
  if (/^[<*#]/.test(s) || /^zz?[A-Z]/.test(s)) return 4;
  return 2;
}
/** Level 1 이름 → Group (인보이스 종류): "" " → Set & Display(W) · [ < * z → Other(P) · 보통 이름 → Jewelry(A) */
export function familyOf(l1) { const r = prefixRank(l1); return r <= 1 ? 'Set & Display' : r === 2 ? 'Jewelry' : 'Other'; }
/** 깨끗한 이름 — 화면에 보일 때는 "" [ ] < > 를 뗌 */
export function cleanName(name) { return String(name || '').replace(/^""|""$/g, '').replace(/^["\[<*]+|["\]>*]+$/g, '').replace(/^zz?(?=[A-Z])/, '').trim() || String(name || ''); }
const COLL = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
function rank(name) { const k = pinKey(name); const t = PINS.top.findIndex(x => pinKey(x) === k); if (t >= 0) return [0, t]; const b = PINS.bottom.findIndex(x => pinKey(x) === k); if (b >= 0) return [2, b]; return [1, prefixRank(name)]; }
function sortTree(node) {
  node.kids.sort((a, b) => { const x = rank(a.name), y = rank(b.name); return x[0] - y[0] || x[1] - y[1] || COLL.compare(a.cn || (a.cn = cleanName(a.name)), b.cn || (b.cn = cleanName(b.name))); });
  node.kids.forEach(sortTree);
}
/* ---------- ✨ 자주 나가는 아이템 (catalog/pop = 이전 시스템 아이템별 판매 수량에서 올림) ---------- */
let POP = [];   // [code, qty] 많이 나간 순
export function popularCodes() { return POP; }
async function loadPop(S) {
  try { const d = await S.DB.get('catalog', 'pop'); if (d && d.j) { POP = JSON.parse(d.j); await idbSet(IDB_KEY + '.pop', POP); return; } } catch (e) {}
  if (!POP.length) { const c = await idbGet(IDB_KEY + '.pop'); if (Array.isArray(c)) POP = c; }
}
/* ---------- 사진 규칙: 아이템 코드와 맞는 사진만 ----------
 *   1) 드라이브 item_picture 에 코드 이름으로 있는 사진 (data/photo-index.json, 설정 photoDrive 켠 뒤) — 세트 · 인서트는 Gallery 의 세트 사진
 *   2) 시트 Photo 칸 — 여러 아이템이 같은 URL 을 쓰는데 골드 · 실버가 섞여 있으면, URL 에 코드가 들어 있는 아이템만 씀
 *   3) 세트는 구성품 사진을 빌려 쓰지 않음 */
let PHX = null, DRIVE_ON = false, DRIVE_BAD = 0, DRIVE_OK = 0;
const ALT = {};   // 드라이브 사진 id → 시트(Shopify) 사진 — 드라이브가 막히면 이걸로 바꿔 보여 줌
/** 드라이브 사진 상태 — 'ok'(열림) · 'blocked'(로그인 요구로 막힘) · ''(아직 모름) */
export function driveState() { return DRIVE_BAD >= 3 && DRIVE_OK === 0 ? 'blocked' : DRIVE_OK ? 'ok' : ''; }
const driveIdOf = src => { const m = String(src || '').match(/drive\.google\.com\/thumbnail\?id=([\w-]+)/) || String(src || '').match(/googleusercontent\.com\/d\/([\w-]+)/); return m ? m[1] : ''; };
/* 드라이브 사진이 안 열리면(회사 계정 전용 공유 → 로그인 페이지로 돌아감) 같은 아이템의 Shopify 사진으로 바꿈.
 *  3장 이상 연달아 막히면 이번 접속 동안은 처음부터 Shopify 사진을 먼저 씀 */
if (typeof document !== 'undefined') {
  document.addEventListener('error', e => { const img = e.target; if (!img || img.tagName !== 'IMG') return; const id = driveIdOf(img.src); if (!id) return; DRIVE_BAD++; const alt = ALT[id]; if (alt && !img.dataset.alt) { e.stopPropagation(); img.dataset.alt = '1'; img.src = thumb(alt, 300); } if (DRIVE_BAD === 3 && !DRIVE_OK && CAT) fixPhotos(CAT); }, true);
  document.addEventListener('load', e => { const img = e.target; if (img && img.tagName === 'IMG' && driveIdOf(img.src)) DRIVE_OK++; }, true);
}   // { pic: {code: driveId}, gal: {code: driveId} }
export function photoIndex() { return PHX; }
export const driveUrl = (id, w) => 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (w || 400);
async function loadPhotoIndex() {
  if (PHX) return;
  try { const r = await fetch('data/photo-index.json'); if (r.ok) { PHX = await r.json(); await idbSet(IDB_KEY + '.phx', PHX); } } catch (e) {}
  if (!PHX) { const c = await idbGet(IDB_KEY + '.phx'); if (c && c.pic) PHX = c; }
  if (PHX && CAT) fixPhotos(CAT);
}
const colorOf = d => { d = String(d || '').toUpperCase(); const g = /GOLD/.test(d), s = /SILVER|SLV|RHODIUM/.test(d); return g && !s ? 'G' : s && !g ? 'S' : ''; };
const codeInUrl = (c, u) => { const U = String(u || '').toUpperCase(), i = U.lastIndexOf('/'); const f = U.substring(i + 1).split('?')[0]; return f.startsWith(c.toUpperCase() + '.') || f.startsWith(c.toUpperCase() + '_') || f.startsWith(c.toUpperCase() + '-'); };
export function fixPhotos(C) {
  const grp = {};
  C.items.forEach(x => { if (x.ph0 == null) x.ph0 = x.virt ? '' : (x.ph || ''); if (x.ph0) (grp[x.ph0] = grp[x.ph0] || new Set()).add(colorOf(x.d)); });
  let dropped = 0, drive = 0;
  C.items.forEach(x => {
    const conflict = x.ph0 && grp[x.ph0].has('G') && grp[x.ph0].has('S');
    const sheet = x.ph0 && (!conflict || codeInUrl(x.c, x.ph0)) ? x.ph0 : '';
    if (x.ph0 && !sheet) dropped++;
    let d = '';
    if (DRIVE_ON && PHX) { const id = PHX.pic[x.c] || PHX.gal[x.c] || (x.old && (PHX.pic[x.old] || PHX.gal[x.old])); if (id) { d = driveUrl(id); drive++; if (sheet) ALT[id] = sheet; } }
    x.ph = driveState() === 'blocked' ? (sheet || d) : (d || sheet);
  });
  C.photoStat = { dropped, drive };
  return C.photoStat;
}
/** 이 가게가 최근에 산 것(hist: code → [[d,q,p]…]) 먼저, 그 다음 전체에서 많이 나가는 순 — path 안의 것만 */
export function popularItems(path, start, hist, limit) {
  if (!CAT) return [];
  const inPath = x => { if (!path || !path.length) return true; const L = levelsOf(x, start); return path.every((p, i) => L[i] === p); };
  const out = [], seen = {};
  const push = c => { const it = CAT.byCode[c]; if (!it || it.h || seen[it.c] || !inPath(it)) return; seen[it.c] = 1; out.push(it); };
  if (hist) Object.keys(hist).sort((a, b) => (hist[b][0] && hist[b][0][0] || '') < (hist[a][0] && hist[a][0][0] || '') ? -1 : 1).forEach(push);
  const nStore = out.length;
  for (const r of POP) { if (out.length >= (limit || 300)) break; push(r[0]); }
  out.nStore = nStore;
  return out;
}

export async function loadCatalog(S, force) {
  if (S && S.settings && S.settings.catPins) setPins(S.settings.catPins);
  if (S && S.settings) setLocs(S.settings.catLoc);
  if (!POP.length || force) loadPop(S);
  DRIVE_ON = !!(S && S.settings && S.settings.photoDrive);
  loadPhotoIndex();
  let meta = null;
  try { meta = await S.DB.get('catalog', 'meta'); }
  catch (e) {   /* 인터넷이 안 되면 폰에 보관한 목록으로 */
    if (CAT) return CAT;
    const c = await idbGet(IDB_KEY); if (c && Array.isArray(c.rows)) { CAT = index(c); return CAT; }
    throw e;
  }
  if (!meta || !meta.ver) { CAT = index({ ver: '', rows: [], cats: [] }); return CAT; }
  const sv = meta.setsVer || '';
  if (CAT && CAT.ver === meta.ver && CAT.setsVer === sv && !force) return CAT;
  const cached = force ? null : await idbGet(IDB_KEY);
  if (cached && cached.ver === meta.ver && Array.isArray(cached.rows)) {
    if ((cached.setsVer || '') !== sv) { cached.sets = await readSets(S); cached.setsVer = sv; await idbSet(IDB_KEY, cached); }
    CAT = index(cached); return CAT;
  }
  const rows = [];
  for (let i = 0; i < (meta.chunks || 0); i++) {
    const c = await S.DB.get('catalog', 'c' + i);
    if (c && c.j) JSON.parse(c.j).forEach(r => rows.push(r));
  }
  const pack = { ver: meta.ver, rows, cats: unpackCats(meta), updatedAt: meta.updatedAt || '', sets: await readSets(S), setsVer: sv };
  await idbSet(IDB_KEY, pack);
  CAT = index(pack);
  return CAT;
}

async function readSets(S) { try { const d = await S.DB.get('catalog', 'sets'); return d && d.j ? JSON.parse(d.j) : {}; } catch (e) { return {}; } }
export const SET_GROUP = '🧩 세트 · 인서트';
export const SET_L1 = 'SET ORDER""', NO_L1 = '*NO LEVEL*';
/** 분류 없는 세트를 SET ORDER 안 어디에 — 구성품이 바디주얼리면 BODY JEWELRY, 아니면 코드 앞부분 (C4-EB01 → C4) */
function setKind(x, byCode) {
  const L = {}; (x.k || []).forEach(k => { const c = byCode[k[0]]; if (c && c.l1) L[c.l1] = (L[c.l1] || 0) + 1; });
  const top = Object.keys(L).sort((a, b) => L[b] - L[a])[0] || '';
  if (/BODY/i.test(top) || /^(BD|BJ)/i.test(x.c)) return 'BODY JEWELRY';
  const pre = String(x.c).split(/[-_ ]/)[0];
  return pre && pre !== x.c ? pre.toUpperCase() : (top ? cleanName(top) : 'SETS');
}
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function index(pack) {
  const items = pack.rows.map((r, i) => ({ c: r[0], d: r[1], p: r[2], s: r[3], b: r[4], g: r[5], l1: r[6], l2: r[7], l3: r[8], ph: r[9], h: !!r[10], loc: r[11] || '', _i: i, _n: norm(r[0]) + ' ' + String(r[1] || '').toUpperCase() }));
  const byCode = {}, byBar = {}, byNorm = {};
  items.forEach(x => { byCode[x.c] = x; if (x.b) byBar[x.b] = byBar[x.b] || x; const n = norm(x.c); if (!byNorm[n]) byNorm[n] = x; });
  /* 세트: 아이템 목록에 있으면 그 아이템에 구성을 붙이고, 없으면 세트 아이템을 새로 만듦 (가격 = 구성품 합) */
  const sets = pack.sets || {};
  Object.keys(sets).forEach(code => {
    const st = sets[code], k = (st.k || []).filter(x => x[0] && x[1] > 0);
    if (!k.length) return;
    let it = byCode[code];
    const oldIt = st.old && st.old !== code ? byCode[st.old] : null;   // 기존 코드 아이템 (FLSIDE01) → 새 세트 코드로 대체
    if (!it) {
      const p = st.p || (oldIt && oldIt.p) || R2(k.reduce((a, x) => a + (byCode[x[0]] ? byCode[x[0]].p : 0) * x[1], 0));
      const ph = (oldIt && oldIt.ph) || '';   // 세트는 자기 사진만 (구성품 사진을 빌리지 않음)
      it = { c: code, d: st.n || (oldIt && oldIt.d) || code, p, s: (oldIt && oldIt.s) || 0, b: (oldIt && oldIt.b) || '', g: oldIt ? oldIt.g : SET_GROUP, l1: oldIt ? oldIt.l1 : '', l2: oldIt ? oldIt.l2 : '', l3: oldIt ? oldIt.l3 : '', ph, h: !!(oldIt && oldIt.h), _i: items.length, _n: norm(code) + ' ' + norm(st.old) + ' ' + String(st.n || '').toUpperCase(), virt: true };
      items.push(it); byCode[code] = it; byNorm[norm(code)] = byNorm[norm(code)] || it;
    }
    it.k = k; it.kn = st.n || ''; it.kst = st.st || '';
    if (st.old && st.old !== code) { it.old = st.old; if (oldIt) { oldIt.gone = true; if (oldIt.b && byBar[oldIt.b] === oldIt) byBar[oldIt.b] = it; } byCode[st.old] = it; byNorm[norm(st.old)] = it; }
  });
  for (let i = items.length - 1; i >= 0; i--) if (items[i].gone) items.splice(i, 1);
  /* Level 1 이 빈 보이는 아이템도 주문 화면 분류에 나오게 — 세트(세트북에서 새로 생긴 코드)는 "🧩 SETS", 그 밖은 맨 뒤 "NO LEVEL"
   *  (화면용 lv1 · lv2 · lv3 만 채움 — 저장된 l1 · 인보이스 종류는 그대로) */
  const setL1 = (items.find(x => x.l1 && /SET ORDER/i.test(x.l1)) || {}).l1 || SET_L1;
  items.forEach(x => {
    x.lv1 = x.l1 || (x.h ? '' : x.virt ? setL1 : NO_L1); x.lv2 = x.l2; x.lv3 = x.l3;
    if (x.virt && !x.l1 && !x.h) { x.lv2 = setKind(x, byCode); x.lv3 = ''; }   // 세트북 세트 → SET ORDER › C4 · BODY JEWELRY …
  });
  items.sort((a, b) => COLL.compare(a.c, b.c));   // 분류 안에서는 코드 순 (Collator — localeCompare 보다 20배 빠름)
  /* 카테고리 트리: 📌 위 고정 → ABC → 📌 아래 고정 (sortTree)
   *  tree  = Group → Level 1 → Level 2 → Level 3   (4단계)
   *  tree1 = Level 1 → Level 2 → Level 3            (SBMGo 처럼 큰 품목부터, 기본) */
  const mk = () => ({ kids: [], map: {}, n: 0, nh: 0 });
  const tree = mk(), tree1 = mk(), treeA = mk();   // tree · tree1 = 주문 화면(숨김 제외) · treeA = 관리용 4단계(숨김 포함, nh = 숨김 수)
  const add = (root, path) => {
    let node = root;
    path.forEach(name => {
      if (!name) return;
      if (!node.map[name]) { const n = { name, kids: [], map: {}, n: 0, nh: 0 }; node.map[name] = n; node.kids.push(n); }
      node = node.map[name];
    });
  };
  (pack.cats || []).forEach(p => { add(tree, p); add(tree1, p.slice(1)); add(treeA, p); });
  const count = (root, path, hid) => { let node = root; if (hid) node.nh++; else node.n++; path.forEach(name => { if (!name) return; node = node.map[name]; if (hid) node.nh++; else node.n++; }); };
  items.forEach(x => {
    const P = [x.g, x.lv1, x.lv2, x.lv3];
    add(treeA, P); count(treeA, P, x.h);
    if (x.h) return;
    add(tree, P); count(tree, P); add(tree1, P.slice(1)); count(tree1, P.slice(1));
  });
  const prune = n => { n.kids = n.kids.filter(k => k.n > 0); n.kids.forEach(prune); };
  const pruneA = n => { n.kids = n.kids.filter(k => k.n + k.nh > 0); n.kids.forEach(pruneA); };
  prune(tree); prune(tree1); pruneA(treeA); sortTree(tree); sortTree(tree1); sortTree(treeA);
  const vis = items.filter(x => !x.h);
  const tmp = { items }; fixPhotos(tmp);
  return { photoStat: tmp.photoStat, ver: pack.ver, setsVer: pack.setsVer || '', updatedAt: pack.updatedAt, items, vis, byCode, byBar, byNorm, tree, tree1, treeA, sets, rows: pack.rows, cats: pack.cats || [] };
}
/** 주문 화면이 어느 단계부터 보이나 — 'l1'(기본, SBMGo 처럼 ANKLET · EARRING …) 또는 'g'(Jewelry · Beauty … 부터) */
export function catStart(S) { return S && S.settings && S.settings.catStart === 'g' ? 'g' : 'l1'; }
export function treeFor(S) { return catStart(S) === 'g' ? CAT.tree : CAT.tree1; }
export function levelsOf(x, start) { const V = x.lv1 == null ? [x.l1, x.l2, x.l3] : [x.lv1, x.lv2, x.lv3]; return start === 'g' ? [x.g].concat(V) : V; }

/** 코드 · 바코드가 정확히 맞는 것 (스캐너 입력) */
export function exactItem(q) {
  if (!CAT) return null; q = String(q || '').trim(); if (!q) return null;
  return CAT.byCode[q.toUpperCase()] || CAT.byBar[q] || (/^\d{11}$/.test(q) ? CAT.byBar['0' + q] : null) || CAT.byNorm[norm(q)] || null;
}
/** 검색 — 띄어쓰기로 나눈 단어가 모두 들어 있는 것 (코드 · 설명), 정확히 맞는 코드가 먼저. 숨김 아이템은 all 일 때만 (관리 화면) */
export function searchItems(q, path, limit, start, all) {
  if (!CAT) return [];
  limit = limit || 80;
  let pool = all ? CAT.items : CAT.vis;
  if (path && path.length) pool = pool.filter(x => { const L = levelsOf(x, start); return path.every((p, i) => L[i] === p); });
  const words = String(q || '').toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return pool.slice(0, limit);
  const out = [], ex = exactItem(q);
  if (ex && pool.includes(ex)) out.push(ex);
  const nw = words.map(w => ({ w, n: norm(w) }));
  for (const x of pool) {
    if (out.length >= limit) break;
    if (x === ex) continue;
    if (nw.every(({ w, n }) => x._n.includes(w) || (n && x._n.includes(n)))) out.push(x);
  }
  return out;
}
/** 사진 — Shopify 사진은 작은 크기로 받아 빨리 뜨게 */
export function thumb(url, w) {
  if (!url) return '';
  if (/drive\.google\.com\/thumbnail/.test(url)) return url.replace(/&sz=w\d+/, '&sz=w' + (w || 160));
  if (/cdn\.shopify\.com/.test(url)) return url + (url.includes('?') ? '&' : '?') + 'width=' + (w || 160);
  return url;
}

/* ---------- 올리기 (관리) — THE ONE Item Master 를 엑셀로 받은 파일 ---------- */
/**
 * Items 탭: Code, Description, Price, Barcode, Group, Level 1, Level 2, Level 3, Photo, SRP, Hide(x = 숨김 — 목록에 두되 주문 화면에 안 보임) …
 * Categories 탭: Group, Level 1, Level 2, Level 3 (행 순서 = 보이는 순서)
 * 머리글 이름으로 열을 찾으므로 열 순서가 바뀌어도 됩니다.
 */
export function parseItemMaster(items, cats) {
  if (!items || items.length < 2) throw new Error('Items 탭을 찾지 못했습니다');
  const hr = items[0].map(h => String(h || '').trim().toLowerCase());
  const col = (re) => hr.findIndex(h => re.test(h));
  const ix = { c: col(/^code$/), d: col(/^description$/), p: col(/^price$/), b: col(/^barcode$/), g: col(/^group$/), l1: col(/^level\s*1$/), l2: col(/^level\s*2$/), l3: col(/^level\s*3$/), ph: col(/^photo$/), s: col(/^srp$/), h: col(/^hide$/), loc: col(/^(location|loc|bin|aisle|위치|통로)$/) };
  if (ix.c < 0 || ix.d < 0 || ix.p < 0) throw new Error('Items 탭 머리글(Code, Description, Price)을 찾지 못했습니다');
  const v = (r, k) => ix[k] < 0 ? '' : r[ix[k]];
  const str = x => String(x == null ? '' : x).trim();
  const rows = [], seen = {}, dup = [], noPrice = [], barSeen = {}, dupBar = [];
  let hidden = 0;
  for (let i = 1; i < items.length; i++) {
    const r = items[i]; if (!r) continue;
    const code = str(v(r, 'c')).toUpperCase(); if (!code) continue;
    const hide = /^(x|y|yes|true|hide|1|숨김)$/i.test(str(v(r, 'h'))); if (hide) hidden++;
    if (seen[code]) { dup.push(code); continue; }
    seen[code] = 1;
    let bar = str(v(r, 'b')).replace(/\.0+$/, ''); if (/^\d{11}$/.test(bar)) bar = '0' + bar;
    if (bar) { if (barSeen[bar]) dupBar.push(code + '=' + barSeen[bar]); else barSeen[bar] = code; }
    const price = R2(num(v(r, 'p'))); if (!price) noPrice.push(code);
    let ph = str(v(r, 'ph')).split(/\s+/)[0] || ''; if (!/^https?:\/\//i.test(ph)) ph = '';
    rows.push([code, str(v(r, 'd')), price, R2(num(v(r, 's'))) || 0, bar, str(v(r, 'g')), str(v(r, 'l1')), str(v(r, 'l2')), str(v(r, 'l3')), ph, hide ? 1 : 0, str(v(r, 'loc')).toUpperCase()]);
  }
  const catRows = [];
  if (cats && cats.length > 1) {
    const ch = cats[0].map(h => String(h || '').trim().toLowerCase());
    const ci = [/^group$/, /^level\s*1$/, /^level\s*2$/, /^level\s*3$/].map(re => ch.findIndex(h => re.test(h)));
    if (ci[0] >= 0) for (let i = 1; i < cats.length; i++) { const r = cats[i] || []; const p = ci.map(j => j < 0 ? '' : str(r[j])); if (p[0]) catRows.push(p); }
  }
  return { rows, cats: catRows, hidden, dup, noPrice, dupBar, photos: rows.filter(r => r[9]).length };
}
/** 묶음으로 나눠 저장 → meta 의 ver 를 바꿔 모든 폰이 새로 받게 함 */
export async function publishCatalog(S, parsed) {
  const chunks = []; let cur = [], size = 0;
  parsed.rows.forEach(r => { const s = JSON.stringify(r).length + 1; if (size + s > CHUNK_BYTES && cur.length) { chunks.push(cur); cur = []; size = 0; } cur.push(r); size += s; });
  if (cur.length) chunks.push(cur);
  const old = await S.DB.get('catalog', 'meta');
  const ver = String(Date.now());
  const ops = chunks.map((c, i) => ({ op: 'set', col: 'catalog', id: 'c' + i, data: { j: JSON.stringify(c), n: c.length, ver } }));
  for (let i = chunks.length; i < ((old && old.chunks) || 0); i++) ops.push({ op: 'del', col: 'catalog', id: 'c' + i });
  /* 묶음을 먼저 쓰고 meta 를 마지막에 — 중간에 끊겨도 폰은 옛 버전을 그대로 씀 */
  for (const o of ops) await S.DB.batch([o]);
  await S.DB.set('catalog', 'meta', { ver, count: parsed.rows.length, chunks: chunks.length, cats: parsed.cats.map(p => p.join('\u0001')), setsVer: (old && old.setsVer) || '', updatedAt: new Date().toISOString(), by: (S.user && S.user.email) || '' });
  return { ver, chunks: chunks.length };
}
/* Firestore 는 배열 안의 배열을 못 담으므로 cats 는 문자열로 저장 → 읽을 때 풀기 */
export function unpackCats(meta) { return (meta.cats || []).map(s => Array.isArray(s) ? s : String(s).split('\u0001')); }

/* ---------- 세트 구성 저장 (관리) ---------- */
/** sets: { CODE: { n, k:[[c,q]] } } 전체를 저장하고 setsVer 를 바꿔 모든 폰이 다시 받게 함 */
export async function publishSets(S, sets) {
  const j = JSON.stringify(sets);
  if (j.length > 900000) throw new Error('세트가 너무 많습니다 (' + Math.round(j.length / 1000) + 'KB) — 나눠 저장 기능이 필요합니다');
  const ver = String(Date.now());
  await S.DB.set('catalog', 'sets', { j, n: Object.keys(sets).length, ver, updatedAt: new Date().toISOString(), by: (S.user && S.user.email) || '' });
  const meta = (await S.DB.get('catalog', 'meta')) || { ver: '', count: 0, chunks: 0, cats: [] };
  await S.DB.set('catalog', 'meta', Object.assign(meta, { setsVer: ver }));
  return ver;
}
/**
 * 세트 엑셀 읽기 — SET_MASTER_코드변경_구성.xlsx 그대로, 또는 SET · CODE · QTY 세 칸짜리 아무 시트
 *  구성 줄: "세트 구성" 탭 (세트 코드 (새) · 아이템 코드 · 수량 · … · 기존 세트 코드)
 *  이름 · 가격: "세트 목록" 탭 (새 코드 · 기존 코드 · 새 디스크립션 · 리스트 가격) — 있으면
 *  which: 'new' = 새 세트 코드 (FI-OCRX) · 'old' = 기존 코드 (FLSIDE01, 지금 Item Master 와 같음)
 */
export function parseSetBook(compRows, listRows, which) {
  if (!compRows || compRows.length < 2) throw new Error('세트 구성 시트를 찾지 못했습니다');
  const hdr = r => r.map(h => String(h || '').replace(/\s+/g, ' ').trim().toUpperCase());
  const pick = (hr, res) => { for (const re of res) { const j = hr.findIndex(h => re.test(h)); if (j >= 0) return j; } return -1; };
  const hr = hdr(compRows[0]);
  const iNew = pick(hr, [/^세트 코드 \(새\)/, /^세트 코드$/, /^SET( CODE)?$/, /^SET/, /^PARENT/]);
  const iOld = pick(hr, [/^기존 세트/, /^OLD SET/]);
  const iC = pick(hr, [/^아이템 코드/, /^ITEM( CODE)?$/, /^ITEM/, /^COMPONENT/, /^CODE$/]);
  const iQ = pick(hr, [/^수량/, /^QTY/, /^QUANTITY/]);
  const iS = which === 'old' && iOld >= 0 ? iOld : iNew;
  if (iS < 0 || iC < 0) throw new Error('머리글에 세트 코드와 아이템 코드가 있어야 합니다');
  /* 세트 목록: 이름 · 리스트 가격 */
  const info = {};
  if (listRows && listRows.length > 1) {
    const lh = hdr(listRows[0]);
    const lNew = pick(lh, [/^새 코드/, /^NEW CODE/]), lOld = pick(lh, [/^기존 코드/, /^OLD CODE/]);
    const lName = which === 'old' ? pick(lh, [/^기존 디스크립션/, /^새 디스크립션/]) : pick(lh, [/^새 디스크립션/, /^기존 디스크립션/]);
    const lPrice = pick(lh, [/^리스트 가격/, /^LIST/, /^PRICE/]), lState = pick(lh, [/^구성 상태/]);
    const lk = which === 'old' && lOld >= 0 ? lOld : lNew;
    if (lk >= 0) for (let i = 1; i < listRows.length; i++) {
      const r = listRows[i] || [], k = String(r[lk] || '').trim().toUpperCase(); if (!k) continue;
      info[k] = { n: lName >= 0 ? String(r[lName] || '').trim() : '', p: lPrice >= 0 ? R2(num(r[lPrice])) : 0, st: lState >= 0 ? String(r[lState] || '').trim() : '', old: lOld >= 0 ? String(r[lOld] || '').trim().toUpperCase() : '' };
    }
  }
  const out = {}; let n = 0;
  for (let i = 1; i < compRows.length; i++) {
    const r = compRows[i] || []; const sc = String(r[iS] || '').trim().toUpperCase(), c = String(r[iC] || '').trim().toUpperCase(); if (!sc || !c) continue;
    const q = iQ < 0 ? 1 : (Math.max(0, Math.floor(num(r[iQ]))) || 1);
    const st = out[sc] = out[sc] || { n: '', k: [] };
    const ex = st.k.find(x => x[0] === c); if (ex) ex[1] += q; else st.k.push([c, q]); n++;
  }
  Object.keys(out).forEach(k => { const x = info[k]; if (x) { if (x.n) out[k].n = x.n; if (x.p) out[k].p = x.p; if (x.st) out[k].st = x.st; if (x.old && which !== 'old') out[k].old = x.old; } });
  return { sets: out, lines: n, named: Object.keys(out).filter(k => out[k].n).length };
}

/* ============================================================
 *  분류 · 아이템 일괄 변경 (관리) — SBM 의 "레벨 정리 · 디스크립션 변경 · 코드 변경 · 일괄 업데이트" 파일 역할
 *  rows 한 줄 = [code, desc, price, srp, barcode, group, l1, l2, l3, photo]
 * ============================================================ */
const COL = { c: 0, d: 1, p: 2, s: 3, b: 4, g: 5, l1: 6, l2: 7, l3: 8, ph: 9, h: 10, loc: 11 };
/** 위치 일괄 — codes 의 아이템 위치를 loc 로 (빈 값 = 분류 기본 위치 따름) */
export function setLoc(rows, codes, loc) { const set = new Set(codes.map(c => String(c).toUpperCase())); let k = 0; rows.forEach(r => { if (set.has(r[0])) { while (r.length < 11) r.push(r.length === 10 ? 0 : ''); r[11] = loc; k++; } }); return k; }
/** 숨김 · 보임 일괄 — codes 의 아이템을 on(true=숨김) 으로. 돌려주는 값: 바뀐 수 */
export function setHidden(rows, codes, on) { const want = on ? 1 : 0, set = new Set(codes.map(c => String(c).toUpperCase())); let k = 0; rows.forEach(r => { if (set.has(r[0]) && (r[10] ? 1 : 0) !== want) { r[10] = want; k++; } }); return k; }
/** 아이템 분류 일괄 바꾸기 — codes 를 to = [g, l1, l2, l3] 로 */
/** 세트북에서 생긴 세트(아이템 목록에 줄이 없음)에 분류를 주려면 목록에 줄을 만들어 둠 — 구성은 세트북 그대로 붙음 */
function virtRow(code) { const it = CAT && CAT.byCode[code]; if (!it || !it.virt || it.c !== code) return null; return [code, it.kn || it.d || code, it.p || 0, it.s || 0, it.b || '', '', '', '', '', it.ph || '', 0, '']; }
export function setLevels(rows, cats, codes, to) { const set = new Set(codes.map(c => String(c).toUpperCase())); const have = new Set(rows.map(r => r[0])); set.forEach(c => { if (!have.has(c)) { const r = virtRow(c); if (r) rows.push(r); } }); let k = 0; rows.forEach(r => { if (set.has(r[0])) { for (let i = 0; i < 4; i++) r[5 + i] = to[i] || ''; k++; } }); ensureCats(rows, cats); return k; }
/** 지금 목록을 바꿔서 다시 올림 — fn(rows, cats, sets) 가 바꾸고 요약을 돌려줌 */
export async function editCatalog(S, fn) {
  if (!CAT) await loadCatalog(S);
  const rows = CAT.rows.map(r => r.slice()), cats = CAT.cats.map(p => p.slice()), sets = JSON.parse(JSON.stringify(CAT.sets || {}));
  const before = JSON.stringify(sets);
  const sum = fn(rows, cats, sets) || {};
  await publishCatalog(S, { rows, cats });
  if (JSON.stringify(sets) !== before) await publishSets(S, sets);
  await loadCatalog(S, true);
  return sum;
}
/** 분류 이름 바꾸기 — level: 'g'|'l1'|'l2'|'l3', under: 상위 경로 (start 기준이 아니라 전체 4단계 기준의 앞부분) */
export function renameCat(rows, cats, level, under, from, to) {
  const li = COL[level], n = { g: 0, l1: 1, l2: 2, l3: 3 }[level]; let k = 0;
  const fits = (arr) => under.every((u, i) => !u || arr[i] === u);
  rows.forEach(r => { if (r[li] === from && fits(r.slice(5, 5 + n))) { r[li] = to; k++; } });
  cats.forEach(p => { if (p[n] === from && fits(p.slice(0, n))) p[n] = to; });
  return k;
}
/** 분류 순서 바꾸기 — 같은 상위 안에서 name 을 dir(-1 위 / +1 아래) 로 */
export function moveCat(cats, n, under, name, dir) {
  const fits = p => under.every((u, i) => !u || p[i] === u);
  const order = []; cats.forEach(p => { if (fits(p) && p[n] && !order.includes(p[n])) order.push(p[n]); });
  const i = order.indexOf(name); if (i < 0) return false; const j = i + dir; if (j < 0 || j >= order.length) return false;
  order.splice(i, 1); order.splice(j, 0, name);
  /* cats 를 그 순서대로 다시 배열 (해당 상위 안의 줄만) */
  const mine = cats.filter(fits), rest = cats.filter(p => !fits(p));
  mine.sort((a, b) => order.indexOf(a[n]) - order.indexOf(b[n]));
  cats.length = 0; rest.forEach(p => cats.push(p)); mine.forEach(p => cats.push(p));
  return true;
}
/** 분류 목록에 없는 경로를 아이템에서 모아 cats 에 추가 (순서 편집이 되게) */
/** 분류를 통째로 다른 상위로 옮김 — n: 1(Level 1 → 다른 Group) 2(Level 2 → 다른 Level 1) 3(Level 3 → 다른 L1›L2). 돌려주는 값: 바뀐 아이템 수 */
export function moveCatTo(rows, cats, n, under, name, newUnder) {
  const fits = arr => under.every((u, i) => !u || arr[i] === u);
  let k = 0;
  rows.forEach(r => { const L = r.slice(5, 9); if (L[n] === name && fits(L)) { for (let i = 0; i < n; i++) r[5 + i] = newUnder[i] || ''; k++; } });
  cats.forEach(p => { if (p[n] === name && fits(p)) for (let i = 0; i < n; i++) p[i] = newUnder[i] || ''; });
  return k;
}
export function ensureCats(rows, cats) {
  const seen = {}; cats.forEach(p => { seen[p.join('\u0001')] = 1; });
  rows.forEach(r => { const p = [r[5], r[6], r[7], r[8]]; for (let n = 1; n <= 4; n++) { const q = p.slice(0, n); while (q.length < 4) q.push(''); const k = q.join('\u0001'); if (!seen[k]) { seen[k] = 1; cats.push(q); } } });
}
/**
 * 일괄 변경 엑셀 — 머리글로 열을 찾음 (있는 열만 바꿈):
 *   Code(코드, 필수) · NewCode(새 코드) · Description · Price · SRP · Barcode · Group · Level 1 · Level 2 · Level 3 · Photo · Delete(삭제: x)
 *   Tree_업데이트 / TreeUpdate 탭 (Code, Group, Level 1~3) 도 그대로 됨
 */
export function parseBulkSheet(aoa, opts) {
  if (!aoa || aoa.length < 2) throw new Error('시트가 비어 있습니다');
  const hr = aoa[0].map(h => String(h || '').trim().toLowerCase());
  const f = res => hr.findIndex(h => res.some(re => re.test(h)));
  const ix = { c: f([/^code$/, /^item ?code$/, /^item ?#?$/, /^코드$/, /^아이템 ?코드$/, /^sku$/]), nc: f([/^new ?code$/, /^새 ?코드$/, /^code2$/]), d: f([/^description$/, /^desc$/, /^디스크립션$/, /^설명$/, /^name$/]),
    p: f([/^price$/, /^가격$/, /^wholesale/]), s: f([/^srp$/, /^retail$/]), b: f([/^barcode$/, /^upc$/, /^바코드$/]), g: f([/^group$/, /^그룹$/]), l1: f([/^level ?1$/, /^l1$/]), l2: f([/^level ?2$/, /^l2$/]), l3: f([/^level ?3$/, /^l3$/]),
    ph: f([/^photo$/, /^image$/, /^사진$/]), del: f([/^delete$/, /^삭제$/, /^remove$/]), loc: f([/^location$/, /^loc$/, /^bin$/, /^aisle$/, /^위치$/, /^통로$/]), h: f([/^hide$/, /^hidden$/, /^숨김$/, /^show$/, /^visible$/]),
    /* SBM 의 GROUP_NAME_CHANGE 파일: CURRENT GROUP NAME · NEW GROUP NAME → Level 3 (새 이름이 비어 있으면 현재 이름) */
    gN: f([/^new group ?name$/, /^new group$/]), gC: f([/^current group ?name$/, /^group ?name$/, /^current group$/]) };
  if (ix.c < 0) throw new Error('Code(코드) 열을 찾지 못했습니다');
  const has = Object.keys(ix).filter(k => k !== 'c' && ix[k] >= 0);
  if (ix.gN >= 0 || ix.gC >= 0) { if (!has.includes('l3')) has.push('l3'); }
  if (!has.length) throw new Error('바꿀 열이 없습니다 (Description · Price · Level 1 · NewCode …)');
  const str = v => String(v == null ? '' : v).trim();
  const out = [], broken = [], fixed = [];
  /* 이전 시스템 내보내기(LEVEL_1_AND_2 · GROUP_NAME_CHANGE)에서 칸 안에 줄바꿈 · 탭이 섞여 깨진 줄 —
   *   'L1\tL2\r\ncode2\tL1\r\ncode3\t\t…' 꼴. 첫 조각은 이 줄의 값, 그 뒤 줄들은 "코드 \t 값" 으로 살려서 따로 패치를 만듦 */
  const sbmLevel = ix.l1 >= 0 && ix.g < 0 && ix.d < 0, sbmGroup = ix.gC >= 0 && ix.l1 < 0;
  /* 이전 시스템 LEVEL_1_AND_2: LEVEL 1 이 비어 있는 줄 = 세일즈맨에게 안 보이는 아이템 → 숨김, 있으면 보임 (옛 시스템과 같은 뜻) */
  const blankHides = sbmLevel && !(opts && opts.keepBlank);
  const hideCol = ix.h >= 0 && /show|visible/.test(hr[ix.h]);   // Show 열이면 뜻이 반대
  const rowsIn = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = (aoa[i] || []).slice(); const code = str(r[ix.c]).toUpperCase(); if (!code) continue;
    const bad = r.findIndex(v => /[\n\t]/.test(String(v == null ? '' : v)));
    if (bad < 0) { rowsIn.push(r); continue; }
    if (!(sbmLevel || sbmGroup)) { broken.push(code); continue; }
    const lines = String(r[bad]).replace(/_x000D_/g, '').split(/\r?\n/);
    const first = lines[0].split('\t'), last = str(r[bad + 1]);
    const me = r.slice(); me[bad] = str(first[0]); if (sbmLevel) me[bad + 1] = str(first[1] || ''); rowsIn.push(me); fixed.push(code);
    lines.slice(1).forEach((ln, j) => {
      const p = ln.split('\t'), c2 = str(p[0]).toUpperCase(); if (!c2) return;
      const x = []; x[ix.c] = c2;
      if (sbmLevel) { x[ix.l1] = str(p[1] || ''); x[ix.l2] = j === lines.length - 2 && str(p[1]) ? last : str(p[2] || ''); }
      else { x[ix.gC] = str(p[1] || ''); }
      rowsIn.push(x); fixed.push(c2);
    });
  }
  for (const r of rowsIn) {
    const code = str(r[ix.c]).toUpperCase(); if (!code) continue;
    const pt = { code, set: {} };
    has.forEach(k => {
      if (k === 'gN' || k === 'gC') return;
      if (k === 'l3' && ix.l3 < 0) { const nv = ix.gN >= 0 ? str(r[ix.gN]) : '', cv = ix.gC >= 0 ? str(r[ix.gC]) : ''; if (nv || cv) pt.set.l3 = nv || cv; return; }
      const v = r[ix[k]]; if (v === undefined || v === null || String(v).trim() === '') return;   // 빈 칸은 "그대로"
      if (k === 'nc') pt.nc = str(v).toUpperCase();
      else if (k === 'del') pt.del = /^(x|y|yes|true|1|삭제)$/i.test(str(v));
      else if (k === 'h') { const yes = /^(x|y|yes|true|1|숨김|hide|hidden)$/i.test(str(v)), no = /^(n|no|false|0|보임|show|visible)$/i.test(str(v)); if (yes || no) pt.set.h = (hideCol ? no : yes) ? 1 : 0; }
      else if (k === 'p' || k === 's') pt.set[k] = R2(num(v));
      else if (k === 'b') { let bb = str(v).replace(/\.0+$/, ''); if (/^\d{11}$/.test(bb)) bb = '0' + bb; pt.set.b = bb; }
      else pt.set[k] = k === 'ph' ? str(v).split(/\s+/)[0] : k === 'loc' ? str(v).toUpperCase() : str(v);
    });
    /* Level 1 만 주고 Group 이 없는 파일 (이전 시스템 LEVEL_1_AND_2) — Group 은 앞글자 규칙으로 (Jewelry · Other · Set & Display = A · P · W) */
    if (pt.set.l1 && ix.g < 0) pt.set.g = familyOf(pt.set.l1);
    if (blankHides) pt.set.h = pt.set.l1 ? 0 : 1;
    if (Object.keys(pt.set).length || pt.nc || pt.del) out.push(pt);
  }
  const cols = has.filter(k => k !== 'gN' && k !== 'gC'); if (blankHides && !cols.includes('h')) cols.push('h');
  return { patches: out, cols, broken, fixed, blankHides };
}
/**
 * 📍 창고 위치 파일 — 재고 사이트(통로 · Corredor) 내보내기나 아무 표에서 "코드 + 통로" 두 칸만 읽음.
 *   가격 · 설명 같은 다른 칸은 일부러 무시 (재고 사이트 값으로 덮어쓰지 않게). 머리글은 위 10줄 안에서 찾음
 *   통로 숫자는 두 자리로 (0 → 00, 7 → 07) — 엑셀이 앞 0 을 지우므로
 */
export function parseLocSheet(aoa) {
  const isCode = h => /^(code|item ?code|item|sku|c[oó]digo|c[oó]d\.?|product ?code|상품 ?코드|아이템 ?코드|코드)$/i.test(h);
  const isLoc = h => /^(corredor|aisle|location|loc|bin|통로|위치|창고 ?위치|localiza[cç][aã]o)$/i.test(h);
  let hi = -1, ci = -1, li = -1;
  for (let i = 0; i < Math.min(10, aoa.length); i++) { const h = (aoa[i] || []).map(x => String(x == null ? '' : x).trim()); const c = h.findIndex(isCode), l = h.findIndex(isLoc); if (c >= 0 && l >= 0) { hi = i; ci = c; li = l; break; } }
  if (hi < 0) throw new Error('머리글에서 "코드"(Code · Código · 상품 코드) 칸과 "통로"(Corredor · Aisle · Location) 칸을 찾지 못했습니다');
  const fix = v => { if (v == null) return ''; if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100) return String(v).padStart(2, '0'); const s = String(v).trim().toUpperCase(); return /^\d$/.test(s) ? '0' + s : s; };
  const patches = [], seen = {}; let blank = 0;
  for (let i = hi + 1; i < aoa.length; i++) { const r = aoa[i] || []; const code = String(r[ci] == null ? '' : r[ci]).trim().toUpperCase(); if (!code || seen[code]) continue; seen[code] = 1; const loc = fix(r[li]); if (!loc) { blank++; continue; } patches.push({ code, set: { loc } }); }
  return { patches, blank, cols: ['loc'] };
}
/** 위치가 들어간 아이템으로 분류 기본 위치 추천 — Level 1 › 2 (없으면 Level 1) 안에서 한 통로가 70% 이상이면 그 통로 */
export function suggestCatLocs(rows) {
  const by = {}; rows.forEach(r => { const loc = r[11]; if (!loc) return; const a = aisleOf(loc); [[r[6]], [r[6], r[7]]].forEach(p => { if (!p[p.length - 1]) return; const k = locKey(p); (by[k] = by[k] || {})[a] = (by[k][a] || 0) + 1; }); });
  const out = {}; Object.keys(by).forEach(k => { const m = by[k], tot = Object.values(m).reduce((x, y) => x + y, 0), best = Object.keys(m).sort((x, y) => m[y] - m[x])[0]; if (tot >= 3 && m[best] / tot >= 0.7) out[k] = best; });
  return out;
}
/** 패치 적용 — rows 와 sets 를 바꾸고 요약 돌려줌 */
export function applyBulk(rows, cats, sets, patches) {
  const at = {}; rows.forEach((r, i) => { at[r[0]] = i; });
  const sum = { changed: 0, renamed: 0, deleted: 0, added: 0, hidden: 0, shown: 0, missing: [], dupNew: [] };
  const del = {};
  patches.forEach(pt => {
    let i = at[pt.code];
    if (i == null) {
      /* 없는 코드 — 디스크립션 · 가격이 다 있으면 새 아이템으로 추가 */
      if (pt.set.d && pt.set.p != null) { const r = [pt.code, pt.set.d, pt.set.p, pt.set.s || 0, pt.set.b || '', pt.set.g || '', pt.set.l1 || '', pt.set.l2 || '', pt.set.l3 || '', pt.set.ph || '', pt.set.h ? 1 : 0, pt.set.loc || '']; rows.push(r); at[pt.code] = rows.length - 1; sum.added++; return; }
      /* 세트북 세트 — Level 1 을 줄 때만 줄을 만듦 (빈 Level 1 = 숨김 뜻이라 그대로 두면 세트가 사라지지 않게) */
      const vr = pt.set.l1 ? virtRow(pt.code) : null;
      if (!vr) { if (!(CAT && CAT.byCode[pt.code] && CAT.byCode[pt.code].virt)) sum.missing.push(pt.code); return; }
      rows.push(vr); i = at[pt.code] = rows.length - 1; sum.sets = (sum.sets || 0) + 1;
    }
    const r = rows[i];
    if (pt.del) { del[pt.code] = 1; sum.deleted++; return; }
    let ch = false;
    Object.keys(pt.set).forEach(k => { const j = COL[k]; if (j == null) return; const cur = k === 'h' ? (r[j] ? 1 : 0) : r[j]; if (cur !== pt.set[k]) { r[j] = pt.set[k]; ch = true; if (k === 'h') { if (pt.set[k]) sum.hidden++; else sum.shown++; } } });
    if (pt.nc && pt.nc !== pt.code) {
      if (at[pt.nc] != null) { sum.dupNew.push(pt.code + '→' + pt.nc); }
      else {
        r[0] = pt.nc; at[pt.nc] = i; delete at[pt.code]; sum.renamed++; ch = true;
        Object.keys(sets).forEach(sc => { (sets[sc].k || []).forEach(x => { if (x[0] === pt.code) x[0] = pt.nc; }); if (sc === pt.code) { sets[pt.nc] = sets[sc]; delete sets[sc]; } });
      }
    }
    if (ch) sum.changed++;
  });
  if (sum.deleted) for (let i = rows.length - 1; i >= 0; i--) if (del[rows[i][0]]) rows.splice(i, 1);
  ensureCats(rows, cats);
  return sum;
}
/** 지금 아이템 전체를 CSV 로 (엑셀에서 고쳐서 다시 올리는 용) */
/** 이전 시스템 편의 파일 모양으로 내려받기 — LEVEL_1_AND_2 (ITEM CODE · LEVEL 1 · LEVEL 2) / GROUP_NAME_CHANGE (ITEM CODE · CURRENT GROUP NAME · NEW GROUP NAME) */
export function sbmLevelRows() { return [['ITEM CODE', 'LEVEL 1', 'LEVEL 2']].concat(CAT.items.map(x => x.h ? [x.c, '', ''] : [x.c, x.l1 || '', x.l2 || ''])); }   // 숨김은 옛 시스템처럼 레벨을 비워서 내보냄
export function sbmGroupRows() { return [['ITEM CODE', 'CURRENT GROUP NAME', 'NEW GROUP NAME']].concat(CAT.items.filter(x => !x.virt).map(x => [x.c, x.l3 || '', ''])); }
export function catalogCsv() {
  const q = s => { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['Code', 'NewCode', 'Description', 'Price', 'SRP', 'Barcode', 'Group', 'Level 1', 'Level 2', 'Level 3', 'Photo', 'Hide', 'Location', 'Delete'];
  const lines = [head].concat((CAT ? CAT.rows : []).map(r => [r[0], '', r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10] ? 'x' : '', r[11] || '', '']));
  return '﻿' + lines.map(r => r.map(q).join(',')).join('\r\n');
}
