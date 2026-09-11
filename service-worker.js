const CACHE = "esportes-virtuais-mobile-v27-previa-oficial-performance";
const CACHE_ESCUDOS = "vai-na-fe-escudos-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./escudos-cache.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/aprendizado/memoria-consolidada.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/dados/armazenamento.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/dados/sincronizacao.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/historico/historico.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/analise/calculos.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/resultado-1x2.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/ambos-marcam.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/over-under-0.5.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/under-0.5.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/over-under-1.5.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/over-under-2.5.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/over-under-3.5.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/over-3.5.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/placar-exato.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/mercados/gols-exatos.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/analise/padroes.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/analise/relogio-partidas.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/analise/temporal.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/analise/previsoes.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/desempenho/green-red.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/aprendizado/aprendizado.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/estrategia/consultor-entradas.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/desempenho/palpites-registrados.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/interface/interface.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/interface/interface-moderna.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/dados/firebase-proximas-partidas.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/analise/analise-contextual-times.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/interface/interface-entradas.js?v=20260911-previa-oficial-performance-v27",
  "./scripts/js/iniciador.js?v=20260911-previa-oficial-performance-v27"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== CACHE_ESCUDOS).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Escudos salvos dinamicamente pelo núcleo.
  if (/\/escudos\/cache\/\d+\.png$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_ESCUDOS);
      const salvo = await cache.match(event.request, { ignoreSearch: true });
      if (salvo) return salvo;
      return new Response("", { status: 404, statusText: "Escudo ainda não salvo" });
    })());
    return;
  }

  const ehArquivoAtualizavel =
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith(".js");

  if (ehArquivoAtualizavel) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(response => {
          if (response && response.ok) {
            const copia = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copia));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
