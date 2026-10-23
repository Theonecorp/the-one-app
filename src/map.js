/* ============================================================
 *  🗺 거래처 지도 — Leaflet + OpenStreetMap (무료 · 키 없음). 길찾기 · 크게 보기는 구글 지도로
 *    가게 좌표(accounts.lat · lng)는 apps-script/UPS.gs 의 geoSync 가 주소로 찾아 넣음 (1시간마다 새 · 바뀐 주소만)
 *    좌표가 아직 없는 가게도 바로 보이게: ZIP 가운데 자리(data/zip.txt, Census ZCTA)에 흐린 점으로 (대략 위치)
 *    담당자 · 관리자: 📍 정확한 위치 찾기 — 폰 · PC 브라우저에서 바로 Census 로 주소를 찾아 accounts 에 저장 (Apps Script 필요 없음)
 *    점을 누르면: 가게 · 주소 · 📌 노트 → 📋 가게 창 · 📝 노트 남기기 · 🧭 길찾기(구글 지도)
 *    📍 내 위치: 지금 있는 곳에서 가까운 가게 순서 목록
 * ============================================================ */
import { $, esc, toast, bt, bi } from './ui.js';
import { storeSheet } from './store.js';
import * as Notes from './notes.js';

let LP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (LP) return LP;
  LP = new Promise((res, rej) => {
    const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(c);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = () => { const C = window.L.Canvas && window.L.Canvas.prototype, f = C && C._redraw; if (f) C._redraw = function () { if (this._ctx) return f.apply(this, arguments); };   /* 지도를 다시 그릴 때 지운 캔버스에 늦게 오는 그리기 무시 */ res(window.L); }; s.onerror = () => { LP = null; rej(new Error('지도를 불러오지 못했습니다 (인터넷 확인)')); }; document.head.appendChild(s);
  });
  return LP;
}
const PAL = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569', '#0d9488', '#9333ea'];
export const smColor = (sm, all) => { const i = all.indexOf(sm); return i < 0 ? '#64748b' : PAL[i % PAL.length]; };
const miles = (a, b) => { const R = 3958.8, r = x => x * Math.PI / 180, dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

let RT = 0, MAP = null, ME = null, ZIP = null, ZP = null, GEO = null;
/** ZIP → [lat, lng] (data/zip.txt: "zip,lat,lng;…") */
function loadZip() {
  if (ZIP) return Promise.resolve(ZIP);
  if (ZP) return ZP;
  ZP = fetch('data/zip.txt?v=1').then(r => { if (!r.ok) throw new Error('zip'); return r.text(); }).then(t => {
    const m = {}; t.split(';').forEach(x => { const p = x.split(','); if (p.length === 3) m[p[0].padStart(5, '0')] = [Number(p[1]), Number(p[2])]; });
    return (ZIP = m);
  }).catch(() => { ZP = null; return {}; });
  return ZP;
}
const zip5 = a => String(a.zip || '').replace(/\D/g, '').substring(0, 5).padStart(5, '0');
/* 같은 ZIP 가게가 한 점에 겹치지 않게 — 계정번호로 정해지는 작은 흩뿌림 (~0.5 mi) */
const jit = (s, k) => { let h = k * 7919; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return ((h >>> 0) % 1000 / 1000 - 0.5) * 0.014; };
const hasXY = a => Number(a.lat) && Number(a.lng);
/** 정확한 좌표, 없으면 ZIP 가운데 (대략) — [lat, lng, 대략?] 또는 null */
function where(a, Z) {
  if (hasXY(a)) return [Number(a.lat), Number(a.lng), false];
  const z = Z && Z[zip5(a)]; if (!z) return null;
  return [z[0] + jit(String(a.acct), 1), z[1] + jit(String(a.acct), 2), true];
}
/** 좌표 작업(geoSync) 상태 — settings/app.geo (UPS.gs 가 실행할 때마다 적음) */
export function geoStatus(S) {
  if (!S || S.role === 'salesman') return '';
  const g = S.settings && S.settings.geo;
  if (!g) return '';   // Apps Script 를 안 돌려도 됨 — 지도 위 📍 정확한 위치 찾기 버튼으로 브라우저에서 찾음
  const at = String(g.at || '').replace('T', ' ').substring(5, 16);
  return '<div class="muted" style="margin-top:4px">🗺 geoSync ' + esc(at) + ' · ' + bt('좌표 있음', 'located') + ' ' + (g.have || 0).toLocaleString() + ' / ' + (g.total || 0).toLocaleString() +
    (g.bad ? ' · ' + bt('주소로 못 찾음', 'not found') + ' ' + g.bad : '') + (g.noAddr ? ' · ' + bt('주소 없음', 'no address') + ' ' + g.noAddr : '') +
    (g.stop ? ' · <span class="warn">' + bt('이어서 하는 중', 'continuing') + ' (' + esc(g.stop) + ', ' + bt('남은 곳', 'left') + ' ' + (g.left || 0) + ')</span>' : '') + (g.err ? '<br><span class="warn">' + esc(g.err) + '</span>' : '') + '</div>';
}
/** el 안에 지도 그리기 — list: 보여 줄 거래처, sms: 색 정하는 세일즈맨 순서 */
export async function renderMap(el, list, sms, S) {
  const box = $(el); if (!box) return;
  const tk = ++RT; let L, Z;
  try { [L, Z] = await Promise.all([loadLeaflet(), loadZip()]); } catch (e) { box.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; return; }
  if (!$(el) || tk !== RT) return;
  const P = list.map(a => [a, where(a, Z)]).filter(x => x[1]);
  const exact = P.filter(x => !x[1][2]).length, approx = P.length - exact, none = list.length - P.length;
  const need = list.filter(a => !hasXY(a) && (a.addr || a.zip));
  const info = $('mapInfo');
  if (info) {
    info.innerHTML = '<b>' + P.length + ' / ' + list.length + '</b> ' + bt('곳 지도에 표시', 'stores on the map') +
      ' · ● ' + bt('정확', 'exact') + ' ' + exact + (approx ? ' · ◌ ' + bt('ZIP 대략 위치', 'approx. by ZIP') + ' ' + approx : '') + (none ? ' · <span class="warn">' + bt('위치 모름', 'unknown') + ' ' + none + '</span>' : '') +
      (S && S.role !== 'salesman' && need.length ? '<div class="btns" style="justify-content:flex-start;margin-top:6px"><button class="b-blue b-sm" id="geoGo" style="width:auto">📍 ' + bt('주소로 정확한 위치 찾기', 'Find exact locations from address') + ' (' + need.length + bt('곳', '') + ')</button></div><div class="muted" id="geoMsg">' + bt('이 화면에서 바로 찾아 저장합니다 — Apps Script 없이. 한 번 저장하면 모든 폰에 보입니다.', 'Runs right here, no Apps Script needed. Saved for every phone.') + '</div>' : '') + geoStatus(S);
    if ($('geoGo')) $('geoGo').onclick = () => GEO ? (GEO.stop = true) : geoRun(need, S, () => renderMap(el, list, sms, S));
  }
  if (MAP) { try { MAP.remove(); } catch (e) {} MAP = null; }
  MAP = L.map(box, { preferCanvas: true, zoomControl: true }).setView([28.3, -81.5], 7); window.__theoneMap = MAP;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(MAP);
  const pts = [];
  P.forEach(([a, w]) => {
    const ll = [w[0], w[1]]; pts.push(ll);
    const c = smColor(String(a.sm || '').toUpperCase(), sms);
    const m = L.circleMarker(ll, w[2] ? { radius: 6, color: c, weight: 2, fillColor: '#fff', fillOpacity: 0.7 } : { radius: 7, color: '#fff', weight: 1.5, fillColor: c, fillOpacity: 0.9 }).addTo(MAP);
    m.bindPopup(() => popupHtml(a, w[2]), { maxWidth: 260 });
    m.on('popupopen', () => fillNotes(a, S));
  });
  if (pts.length) MAP.fitBounds(pts, { padding: [24, 24], maxZoom: 14 });
  /* 팝업 안 버튼 */
  box.addEventListener('click', e => {
    const t = e.target.closest('[data-mps],[data-mpn]'); if (!t) return;
    e.preventDefault();
    if (t.dataset.mps) storeSheet(t.dataset.mps);
    else Notes.noteForm(t.dataset.mpn, null, () => { toast('📝 ' + bt('저장', 'Saved'), 'good'); });
  });
  setTimeout(() => { if (MAP) MAP.invalidateSize(); }, 200);
}

/* ---------- 📍 브라우저에서 바로 주소 → 좌표 (Census, 무료 · 키 없음, JSONP) ---------- */
const geoQ = a => [a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ') + ', USA';
let JN = 0;
function census(q) {
  return new Promise(res => {
    const cb = '__geo' + (++JN), s = document.createElement('script');
    const done = v => { clearTimeout(t); delete window[cb]; s.remove(); res(v); };
    const t = setTimeout(() => done(null), 15000);
    window[cb] = d => { const m = d && d.result && d.result.addressMatches && d.result.addressMatches[0]; done(m ? [Number(m.coordinates.y), Number(m.coordinates.x)] : null); };
    s.onerror = () => done(null);
    s.src = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=' + encodeURIComponent(q) + '&benchmark=Public_AR_Current&format=jsonp&callback=' + cb;
    document.head.appendChild(s);
  });
}
async function geoOne(a) {
  let r = await census(geoQ(a));
  /* STE · SUITE · # 같은 뒷부분이 있으면 빼고 한 번 더 */
  if (!r && a.addr) { const s = String(a.addr).replace(/\s*(#|STE\.?|SUITE|UNIT|APT|BLDG|SPC|SP)\s*[\w-]*.*$/i, '').trim(); if (s && s !== a.addr) r = await census(geoQ(Object.assign({}, a, { addr: s }))); }
  return r;
}
async function geoRun(need, S, done) {
  GEO = { stop: false }; const me = GEO;
  const msg = t => { const m = $('geoMsg'); if (m) m.innerHTML = t; }, btn = $('geoGo');
  if (btn) btn.textContent = '⏹ ' + bt('멈추기', 'Stop');
  let i = 0, ok = 0, bad = 0, buf = [];
  const flush = async () => { if (!buf.length) return; const b = buf; buf = []; try { await S.DB.batch(b); } catch (e) { toast(bt('저장 실패', 'Save failed') + ': ' + (e.code || e.message), 'bad'); me.stop = true; } };
  const work = async () => {
    while (!me.stop && i < need.length) {
      const a = need[i++], r = await geoOne(a), now = new Date().toISOString();
      if (r) { ok++; a.lat = r[0]; a.lng = r[1]; buf.push({ op: 'update', col: 'accounts', id: a.acct, data: { lat: r[0], lng: r[1], geoQ: geoQ(a), geoSrc: 'census-web', geoAt: now, geoErr: '' } }); }
      else { bad++; buf.push({ op: 'update', col: 'accounts', id: a.acct, data: { geoQ: geoQ(a), geoErr: 'census-web: no match', geoAt: now } }); }
      msg('📍 ' + (ok + bad) + ' / ' + need.length + ' · ✅ ' + ok + ' · ✕ ' + bad + ' <span class="muted">(' + bt('다른 화면으로 가면 멈춥니다', 'leaving this screen stops it') + ')</span>');
      if (buf.length >= 25) await flush();
      if (!$('geoMsg')) me.stop = true;
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  await flush();
  GEO = null;
  if (ok) { try { const { bumpAccountsVer } = await import('./mgr.js'); await bumpAccountsVer(); } catch (e) {} }
  toast('📍 ' + bt('정확한 위치', 'Located') + ' ' + ok + (bad ? ' · ' + bt('못 찾음', 'not found') + ' ' + bad : ''), ok ? 'good' : '');
  if ($('geoMsg')) done();
}
function popupHtml(a, approx) {
  return '<div class="mpop"><b>' + esc(a.store) + '</b>' + (approx ? '<div class="warn" style="font-size:12px">◌ ' + bt('ZIP 대략 위치', 'Approx. location (ZIP)') + '</div>' : '') + '<div class="muted">' + esc(a.acct) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.tel ? ' · ' + esc(a.tel) : '') + '</div><div>' + esc([a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ')) + '</div><div id="mpn-' + esc(a.acct) + '"></div>' +
    '<div class="mpb"><a href="#" data-mps="' + esc(a.acct) + '">📋 ' + bt('가게 창', 'Store') + '</a><a href="#" data-mpn="' + esc(a.acct) + '">📝 ' + bt('노트', 'Note') + '</a><a href="' + esc(Notes.gmapUrl(a, true)) + '" target="_blank" rel="noopener">🧭 ' + bt('길찾기', 'Directions') + '</a></div></div>';
}
async function fillNotes(a) {
  const L = await Notes.loadNotes(a.acct); const el = document.getElementById('mpn-' + a.acct); if (!el) return;
  const top = L.filter(n => n.pin || n.kind === 'warn').slice(0, 2);
  el.innerHTML = (top.length ? Notes.notesHtml(top, { limit: 2 }) : '') + (L.length > top.length ? '<div class="muted" style="font-size:12px">📝 ' + bt('노트', 'Notes') + ' ' + L.length + '</div>' : '');
}
/** 📍 내 위치 — 지도에 표시하고 가까운 가게 순서 목록 */
export function nearMe(list, outEl) {
  if (!navigator.geolocation) return toast(bt('이 기기는 위치를 쓸 수 없습니다', 'Location not available'), 'bad');
  toast('📍 ' + bt('위치 찾는 중…', 'Finding your location…'));
  navigator.geolocation.getCurrentPosition(p => {
    const me = [p.coords.latitude, p.coords.longitude];
    if (MAP && window.L) { if (ME) ME.remove(); ME = window.L.circleMarker(me, { radius: 9, color: '#fff', weight: 3, fillColor: '#0ea5e9', fillOpacity: 1 }).addTo(MAP).bindTooltip(bt('내 위치', 'You are here')); MAP.setView(me, 12); }
    const near = list.map(a => ({ a, w: where(a, ZIP) })).filter(x => x.w).map(x => ({ a: x.a, d: miles(me, x.w) })).sort((x, y) => x.d - y.d).slice(0, 15);
    const out = $(outEl); if (!out) return;
    out.innerHTML = '<h2 style="margin:10px 0 4px">📍 ' + bi('가까운 가게', 'Nearby stores') + '</h2>' + near.map(x => '<div class="pr"><div class="ct tap" data-nst="' + esc(x.a.acct) + '"><b>' + esc(x.a.store) + '</b><small>' + x.d.toFixed(1) + ' mi · ' + esc([x.a.addr, x.a.city].filter(Boolean).join(', ')) + (x.a.sm ? ' · ' + esc(x.a.sm) : '') + '</small></div><a class="b-ghost b-sm lnk" href="' + esc(Notes.gmapUrl(x.a, true)) + '" target="_blank" rel="noopener">🧭</a></div>').join('');
    out.querySelectorAll('[data-nst]').forEach(el => el.onclick = () => storeSheet(el.dataset.nst));
  }, e => toast(bt('위치를 못 찾았습니다 — 브라우저 위치 권한을 허용하세요', 'Could not get location — allow location access') + ' (' + e.message + ')', 'bad'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}
