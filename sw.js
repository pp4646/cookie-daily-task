// Service Worker：讓 App 可以離線使用，並在改版時自動更新。
//
// 版本號由 js/app.js 註冊時以 ?v= 帶進來，所以 js/version.js 是唯一的版本來源。
// 只要 VERSION 一改，這支檔案的網址就變了，瀏覽器會抓到新的 Service Worker，
// 舊版快取會在 activate 時被清掉。

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `cookie-daily-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/parent.js',
  './js/store.js',
  './js/ui.js',
  './js/config.js',
  './js/version.js',
  './js/zhuyin.js',
  './js/zhuyin-data.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 個別加入，避免其中一個檔案失敗就整包裝不起來
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Firestore 的即時連線不能攔截
  if (url.hostname.endsWith('googleapis.com')) return;

  // Firebase SDK：先給快取、同時在背景更新
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 頁面導覽：優先用網路，離線時退回快取
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html').then((r) => r || fetch(request))),
    );
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });

  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await network) || new Response('離線中', { status: 503 });
}
