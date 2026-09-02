const CACHE = 'bilhete-plus-v5.6.7-internal-bands';
const APP_SHELL = ['/', '/index.html', '/style.css?v=5.6.7', '/app.js?v=5.6.7', '/manifest.webmanifest'];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      // Nunca grave 404/5xx no cache. Isso evita o PWA ficar preso em "Not Found".
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        return (await caches.match('/index.html')) || (await caches.match('/'));
      }
      return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});
