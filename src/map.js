/* ============================================================
 *  🗺 거래처 지도 — Leaflet + OpenStreetMap (무료 · 키 없음). 길찾기 · 크게 보기는 구글 지도로
 *    가게 좌표(accounts.lat · lng)는 apps-script/UPS.gs 의 geoSync 가 주소로 찾아 넣음 (1시간마다 새 · 바뀐 주소만)
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
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = () => res(window.L); s.onerror = () => { LP = null; rej(new Error('지도를 불러오지 못했습니다 (인터넷 확인)')); }; document.head.appendChild(s);
  });
  return LP;
}
const PAL = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569', '#0d9488', '#9333ea'];
export const smColor = (sm, all) => { const i = all.indexOf(sm); return i < 0 ? '#64748b' : PAL[i % PAL.length]; };
const miles = (a, b) => { const R = 3958.8, r = x => x * Math.PI / 180, dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

let MAP = null, ME = null;
/** 좌표 작업(geoSync) 상태 — settings/app.geo (UPS.gs 가 실행할 때마다 적음) */
export function geoStatus(S) {
  if (!S || S.role === 'salesman') return '';
  const g = S.settings && S.settings.geo;
  if (!g) return '<div class="alert a-amb" style="margin-top:6px">🗺 ' + bt('좌표 작업 기록이 없습니다 — Apps Script(UPS.gs)를 새 코드로 바꾸고 geoForce 를 한 번 실행해 주세요', 'No geocoding run recorded yet — update UPS.gs and run geoForce once') + '</div>';
  const at = String(g.at || '').replace('T', ' ').substring(5, 16);
  return '<div class="muted" style="margin-top:4px">🗺 geoSync ' + esc(at) + ' · ' + bt('좌표 있음', 'located') + ' ' + (g.have || 0).toLocaleString() + ' / ' + (g.total || 0).toLocaleString() +
    (g.bad ? ' · ' + bt('주소로 못 찾음', 'not found') + ' ' + g.bad : '') + (g.noAddr ? ' · ' + bt('주소 없음', 'no address') + ' ' + g.noAddr : '') +
    (g.stop ? ' · <span class="warn">' + bt('이어서 하는 중', 'continuing') + ' (' + esc(g.stop) + ', ' + bt('남은 곳', 'left') + ' ' + (g.left || 0) + ')</span>' : '') + (g.err ? '<br><span class="warn">' + esc(g.err) + '</span>' : '') + '</div>';
}
/** el 안에 지도 그리기 — list: 보여 줄 거래처, sms: 색 정하는 세일즈맨 순서 */
export async function renderMap(el, list, sms, S) {
  const box = $(el); if (!box) return;
  const withXY = list.filter(a => Number(a.lat) && Number(a.lng)), noXY = list.length - withXY.length;
  const info = $('mapInfo');
  if (info) info.innerHTML = withXY.length + ' / ' + list.length + ' ' + bt('곳 지도에 표시', 'stores on the map') + (noXY ? ' · <span class="warn">' + bt('좌표 없는 가게', 'no location yet') + ' ' + noXY + '</span> <span class="muted">(' + bt('주소로 자동으로 찾아 넣습니다 — 관리자 UPS 스크립트 geoSync', 'filled in automatically from the address') + ')</span>' : '') + geoStatus(S);
  let L;
  try { L = await loadLeaflet(); } catch (e) { box.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; return; }
  if (!$(el)) return;
  if (MAP) { try { MAP.remove(); } catch (e) {} MAP = null; }
  MAP = L.map(box, { preferCanvas: true, zoomControl: true }).setView([28.3, -81.5], 7); window.__theoneMap = MAP;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(MAP);
  const pts = [];
  withXY.forEach(a => {
    const ll = [Number(a.lat), Number(a.lng)]; pts.push(ll);
    const m = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 1.5, fillColor: smColor(String(a.sm || '').toUpperCase(), sms), fillOpacity: 0.9 }).addTo(MAP);
    m.bindPopup(() => popupHtml(a), { maxWidth: 260 });
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
function popupHtml(a) {
  return '<div class="mpop"><b>' + esc(a.store) + '</b><div class="muted">' + esc(a.acct) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.tel ? ' · ' + esc(a.tel) : '') + '</div><div>' + esc([a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ')) + '</div><div id="mpn-' + esc(a.acct) + '"></div>' +
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
    const near = list.filter(a => Number(a.lat) && Number(a.lng)).map(a => ({ a, d: miles(me, [Number(a.lat), Number(a.lng)]) })).sort((x, y) => x.d - y.d).slice(0, 15);
    const out = $(outEl); if (!out) return;
    out.innerHTML = '<h2 style="margin:10px 0 4px">📍 ' + bi('가까운 가게', 'Nearby stores') + '</h2>' + near.map(x => '<div class="pr"><div class="ct tap" data-nst="' + esc(x.a.acct) + '"><b>' + esc(x.a.store) + '</b><small>' + x.d.toFixed(1) + ' mi · ' + esc([x.a.addr, x.a.city].filter(Boolean).join(', ')) + (x.a.sm ? ' · ' + esc(x.a.sm) : '') + '</small></div><a class="b-ghost b-sm lnk" href="' + esc(Notes.gmapUrl(x.a, true)) + '" target="_blank" rel="noopener">🧭</a></div>').join('');
    out.querySelectorAll('[data-nst]').forEach(el => el.onclick = () => storeSheet(el.dataset.nst));
  }, e => toast(bt('위치를 못 찾았습니다 — 브라우저 위치 권한을 허용하세요', 'Could not get location — allow location access') + ' (' + e.message + ')', 'bad'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}
