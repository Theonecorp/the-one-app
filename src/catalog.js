/* ============================================================
 *  아이템 카탈로그 — 7천여 개를 매번 읽지 않도록 묶음(문서 몇 개)으로 저장하고 폰에 보관
 *  catalog/meta = { ver, count, chunks, cats:[[g,l1,l2,l3]...], updatedAt, by }
 *  catalog/c0..cN = { j: JSON [[code, desc, price, srp, barcode, group, l1, l2, l3, photo], ...] }
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

export async function loadCatalog(S, force) {
  const meta = await S.DB.get('catalog', 'meta');
  if (!meta || !meta.ver) { CAT = index({ ver: '', rows: [], cats: [] }); return CAT; }
  if (CAT && CAT.ver === meta.ver && !force) return CAT;
  const cached = force ? null : await idbGet(IDB_KEY);
  if (cached && cached.ver === meta.ver && Array.isArray(cached.rows)) { CAT = index(cached); return CAT; }
  const rows = [];
  for (let i = 0; i < (meta.chunks || 0); i++) {
    const c = await S.DB.get('catalog', 'c' + i);
    if (c && c.j) JSON.parse(c.j).forEach(r => rows.push(r));
  }
  const pack = { ver: meta.ver, rows, cats: unpackCats(meta), updatedAt: meta.updatedAt || '' };
  await idbSet(IDB_KEY, pack);
  CAT = index(pack);
  return CAT;
}

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function index(pack) {
  const items = pack.rows.map((r, i) => ({ c: r[0], d: r[1], p: r[2], s: r[3], b: r[4], g: r[5], l1: r[6], l2: r[7], l3: r[8], ph: r[9], _i: i, _n: norm(r[0]) + ' ' + String(r[1] || '').toUpperCase() }));
  const byCode = {}, byBar = {}, byNorm = {};
  items.forEach(x => { byCode[x.c] = x; if (x.b) byBar[x.b] = byBar[x.b] || x; const n = norm(x.c); if (!byNorm[n]) byNorm[n] = x; });
  /* 카테고리 트리: 시트의 Categories 순서를 따르고, 거기 없는 것은 뒤에 붙임 */
  const tree = { kids: [], map: {} };
  const add = (path) => {
    let node = tree;
    path.forEach(name => {
      if (!name) return;
      if (!node.map[name]) { const n = { name, kids: [], map: {}, n: 0 }; node.map[name] = n; node.kids.push(n); }
      node = node.map[name];
    });
  };
  (pack.cats || []).forEach(p => add(p));
  items.forEach(x => {
    add([x.g, x.l1, x.l2, x.l3]);
    let node = tree; [x.g, x.l1, x.l2, x.l3].forEach(name => { if (!name) return; node = node.map[name]; node.n++; });
  });
  const prune = n => { n.kids = n.kids.filter(k => k.n > 0); n.kids.forEach(prune); };
  prune(tree);
  return { ver: pack.ver, updatedAt: pack.updatedAt, items, byCode, byBar, byNorm, tree };
}

/** 코드 · 바코드가 정확히 맞는 것 (스캐너 입력) */
export function exactItem(q) {
  if (!CAT) return null; q = String(q || '').trim(); if (!q) return null;
  return CAT.byCode[q.toUpperCase()] || CAT.byBar[q] || (/^\d{11}$/.test(q) ? CAT.byBar['0' + q] : null) || CAT.byNorm[norm(q)] || null;
}
/** 검색 — 띄어쓰기로 나눈 단어가 모두 들어 있는 것 (코드 · 설명), 정확히 맞는 코드가 먼저 */
export function searchItems(q, path, limit) {
  if (!CAT) return [];
  limit = limit || 80;
  let pool = CAT.items;
  if (path && path.length) pool = pool.filter(x => path.every((p, i) => [x.g, x.l1, x.l2, x.l3][i] === p));
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
  if (/cdn\.shopify\.com/.test(url)) return url + (url.includes('?') ? '&' : '?') + 'width=' + (w || 160);
  return url;
}

/* ---------- 올리기 (관리) — THE ONE Item Master 를 엑셀로 받은 파일 ---------- */
/**
 * Items 탭: Code, Description, Price, Barcode, Group, Level 1, Level 2, Level 3, Photo, SRP, Hide …
 * Categories 탭: Group, Level 1, Level 2, Level 3 (행 순서 = 보이는 순서)
 * 머리글 이름으로 열을 찾으므로 열 순서가 바뀌어도 됩니다.
 */
export function parseItemMaster(items, cats) {
  if (!items || items.length < 2) throw new Error('Items 탭을 찾지 못했습니다');
  const hr = items[0].map(h => String(h || '').trim().toLowerCase());
  const col = (re) => hr.findIndex(h => re.test(h));
  const ix = { c: col(/^code$/), d: col(/^description$/), p: col(/^price$/), b: col(/^barcode$/), g: col(/^group$/), l1: col(/^level\s*1$/), l2: col(/^level\s*2$/), l3: col(/^level\s*3$/), ph: col(/^photo$/), s: col(/^srp$/), h: col(/^hide$/) };
  if (ix.c < 0 || ix.d < 0 || ix.p < 0) throw new Error('Items 탭 머리글(Code, Description, Price)을 찾지 못했습니다');
  const v = (r, k) => ix[k] < 0 ? '' : r[ix[k]];
  const str = x => String(x == null ? '' : x).trim();
  const rows = [], seen = {}, dup = [], noPrice = [], barSeen = {}, dupBar = [];
  let hidden = 0;
  for (let i = 1; i < items.length; i++) {
    const r = items[i]; if (!r) continue;
    const code = str(v(r, 'c')).toUpperCase(); if (!code) continue;
    if (/^x$/i.test(str(v(r, 'h'))) || /^(y|yes|true|hide)$/i.test(str(v(r, 'h')))) { hidden++; continue; }
    if (seen[code]) { dup.push(code); continue; }
    seen[code] = 1;
    let bar = str(v(r, 'b')).replace(/\.0+$/, ''); if (/^\d{11}$/.test(bar)) bar = '0' + bar;
    if (bar) { if (barSeen[bar]) dupBar.push(code + '=' + barSeen[bar]); else barSeen[bar] = code; }
    const price = R2(num(v(r, 'p'))); if (!price) noPrice.push(code);
    let ph = str(v(r, 'ph')).split(/\s+/)[0] || ''; if (!/^https?:\/\//i.test(ph)) ph = '';
    rows.push([code, str(v(r, 'd')), price, R2(num(v(r, 's'))) || 0, bar, str(v(r, 'g')), str(v(r, 'l1')), str(v(r, 'l2')), str(v(r, 'l3')), ph]);
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
  await S.DB.set('catalog', 'meta', { ver, count: parsed.rows.length, chunks: chunks.length, cats: parsed.cats.map(p => p.join('\u0001')), updatedAt: new Date().toISOString(), by: (S.user && S.user.email) || '' });
  return { ver, chunks: chunks.length };
}
/* Firestore 는 배열 안의 배열을 못 담으므로 cats 는 문자열로 저장 → 읽을 때 풀기 */
export function unpackCats(meta) { return (meta.cats || []).map(s => Array.isArray(s) ? s : String(s).split('\u0001')); }
