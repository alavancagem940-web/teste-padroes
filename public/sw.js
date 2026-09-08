const CACHE = 'bilhete-plus-v5-7-3-jogadores-publicos';
const APP_SHELL = ['/', '/index.html', '/style.css?v=5.7.3', '/app.js?v=5.7.3', '/manifest.webmanifest'];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;

  // CSS/JS/manifest: cache-first para o layout nunca abrir "pelado" enquanto o Render acorda.
  if (/\.(css|js|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then(cached => {
      if (cached) {
        event.waitUntil(fetch(req).then(r => r.ok ? caches.open(CACHE).then(c => c.put(req, r.clone())) : null).catch(()=>{}));
        return cached;
      }
      return fetch(req).then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(req, r.clone()));
        return r;
      });
    }));
    return;
  }

  // Navegação: tenta rede rapidamente e cai no shell salvo. Ao mesmo tempo,
  // mantém um health em segundo plano para acordar o Render mesmo quando a página
  // abriu do cache do PWA.
  if (req.mode === 'navigate') {
    event.waitUntil(fetch('/api/health', { cache:'no-store' }).catch(()=>null));
    event.respondWith((async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const r = await fetch(req, { signal:controller.signal });
        if (r.ok) caches.open(CACHE).then(c => c.put('/index.html', r.clone()));
        return r;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || new Response('Offline', {status:503});
      } finally { clearTimeout(timer); }
    })());
    return;
  }

  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
