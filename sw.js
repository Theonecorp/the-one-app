/* THE ONE — 인터넷이 없어도 앱이 열리게 화면 파일만 폰에 보관 (데이터는 Firestore 가 따로 보관)
 *  · index.html / app.js : 먼저 인터넷에서 새로 받고, 안 되면 보관본
 *  · Firebase SDK (gstatic, 버전 고정) · 아이콘 : 보관본 먼저 */
const CACHE = 'theone-shell-v156';
const IMG = 'theone-img-v1', IMG_MAX = 6000; let IMG_N = 0;   /* 정리는 100장마다 한 번만 (매번 전체 목록을 세면 느려짐) */   /* 📷 아이템 사진 썸네일 (드라이브 · Shopify) — 본 것부터 보관, 오프라인에서도 보임 */
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './logo.png', './logo-96.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
/* 🔔 폰 알림을 누르면 앱으로 (열려 있으면 그 창, 없으면 새로) */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs.find(x => 'focus' in x); if (c) { c.navigate(url).catch(() => {}); return c.focus(); } return self.clients.openWindow(url); }));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const sdk = url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0;
  const img = (url.hostname === 'drive.google.com' && url.pathname === '/thumbnail') || /googleusercontent\.com$/.test(url.hostname) || url.hostname === 'cdn.shopify.com';
  if (img) {   /* 사진: 폰에 있으면 바로, 없으면 받아서 보관 (너무 많아지면 오래된 것부터 지움) */
    e.respondWith(caches.open(IMG).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); if (++IMG_N % 100 === 0) c.keys().then(ks => { if (ks.length > IMG_MAX) ks.slice(0, ks.length - IMG_MAX).forEach(k => c.delete(k)); }); } return res; }))).catch(() => caches.match(req)));
    return;
  }
  if (!same && !sdk) return;   // Firestore · 로그인 등은 건드리지 않음
  if (sdk || /\.(png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
    return;
  }
  /* ?v= 붙은 파일(app.js · i18n.json)은 버전마다 주소가 달라서 — 폰에 있으면 바로 (인터넷 안 기다림) */
  if (/[?&]v=/.test(url.search)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })));
    return;
  }
  /* index.html 등 — ⚡ 폰에 있는 것으로 바로 열고(인터넷을 기다리지 않음), 뒤에서 새로 받아 보관 → 다음에 열 때 새 버전.
   *   새 버전은 앱이 위에 🔄 띠로도 알림 (checkUpdate). 처음(보관본 없음)이면 인터넷으로 */
  const net = fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; });
  const cached = () => caches.match(req).then(hit => hit || caches.match(url.pathname.endsWith('/') ? './index.html' : req, { ignoreSearch: true }));
  /* 앱이 "새로 받아라"(cache: reload · no-store · no-cache)고 한 것 — 🔄 업데이트 띠 · 새 버전 확인 — 은 인터넷 먼저, 받은 것을 보관 (안 되면 보관본) */
  if (req.cache === 'reload' || req.cache === 'no-store' || req.cache === 'no-cache') { e.respondWith(net.then(res => res.ok ? res : cached().then(hit => hit || res)).catch(() => cached())); return; }
  e.respondWith(cached().then(hit => { if (hit) { e.waitUntil(net.catch(() => {})); return hit; } return net; }).catch(() => net));
});
