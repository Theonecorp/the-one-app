/* THE ONE — 인터넷이 없어도 앱이 열리게 화면 파일만 폰에 보관 (데이터는 Firestore 가 따로 보관)
 *  · index.html / app.js : 먼저 인터넷에서 새로 받고, 안 되면 보관본
 *  · Firebase SDK (gstatic, 버전 고정) · 아이콘 : 보관본 먼저 */
const CACHE = 'theone-shell-v86';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './logo.png', './logo-96.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const sdk = url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0;
  if (!same && !sdk) return;   // Firestore · 로그인 · 사진 등은 건드리지 않음
  if (sdk || /\.(png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
    return;
  }
  /* ?v= 붙은 파일(app.js · i18n.json)은 버전마다 주소가 달라서 — 폰에 있으면 바로 (인터넷 안 기다림) */
  if (/[?&]v=/.test(url.search)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })));
    return;
  }
  /* index.html 등 — 인터넷 먼저, 3초 넘게 걸리면 폰에 있는 것으로 (새 버전은 다음에 열 때) */
  const net = fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; });
  const cached = () => caches.match(req).then(hit => hit || caches.match(url.pathname.endsWith('/') ? './index.html' : req, { ignoreSearch: true }));
  e.respondWith(Promise.race([net, new Promise(r => setTimeout(r, 3000)).then(() => cached().then(h => h || net))]).catch(() => cached()));
});
