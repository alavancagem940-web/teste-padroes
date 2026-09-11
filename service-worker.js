const CACHE = "esportes-virtuais-mobile-v29-startup";
const CACHE_ESCUDOS = "vai-na-fe-escudos-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./app-core-v29.js?v=20260911-startup-v29",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== CACHE_ESCUDOS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function navigationFast(request) {
  const cache = await caches.open(CACHE);
  const cached = (await cache.match(request)) || (await cache.match("./index.html"));
  const network = fetch(request, { cache: "no-store" }).then(response => {
    if (response && response.ok) cache.put("./index.html", response.clone());
    return response;
  });
  if (!cached) return network;
  // Não deixa uma rede lenta segurar a abertura. Atualiza o HTML em segundo plano.
  const timeout = new Promise(resolve => setTimeout(() => resolve(cached), 700));
  try { return await Promise.race([network, timeout]); }
  catch (_) { return cached; }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (/\/escudos\/cache\/\d+\.png$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_ESCUDOS);
      const salvo = await cache.match(event.request, { ignoreSearch: true });
      if (salvo) return salvo;
      return new Response("", { status: 404, statusText: "Escudo ainda não salvo" });
    })());
    return;
  }

  if (event.request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(navigationFast(event.request));
    return;
  }

  if (url.pathname.endsWith("/app-core-v29.js") || url.pathname.endsWith(".png") || url.pathname.endsWith("manifest.json")) {
    event.respondWith(cacheFirst(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
