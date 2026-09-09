"use strict";

/*
 * Cache persistente dos escudos do núcleo oficial.
 * Em site estático/GitHub Pages o navegador não pode gravar novos PNGs
 * fisicamente no repositório. Por isso, os escudos remotos que carregarem
 * com sucesso ficam guardados no Cache Storage e passam a ser servidos por
 * uma URL virtual dentro de ./escudos/cache/<id>.png.
 */
window.TesteEscudosCache = {
  CACHE: "vai-na-fe-escudos-v1",
  PREFIXO: "vai_na_fe_escudo_visto_",

  iniciar() {
    // O service-worker principal do núcleo já trata ./escudos/cache/*.png.
    // Não registramos um segundo SW para não substituir o controlador do app.
    return true;
  },

  url(id) {
    return `./escudos/cache/${Number(id)}.png`;
  },

  tem(id) {
    try {
      return Boolean(navigator.serviceWorker?.controller) && localStorage.getItem(`${this.PREFIXO}${Number(id)}`) === "1";
    } catch (_) {
      return false;
    }
  },

  async salvarVisto(img, id) {
    id = Number(id);
    if (!img || !id || !("caches" in window)) return;

    const src = String(img.currentSrc || img.src || "");
    if (!src) return;

    // Se já veio do pacote local ou do próprio cache de escudos, não duplica.
    let url;
    try { url = new URL(src, location.href); } catch (_) { return; }
    if (url.origin === location.origin && /\/escudos\/(?:cache\/)?\d+\.png$/i.test(url.pathname)) return;

    try {
      const modo = url.origin === location.origin ? "same-origin" : "no-cors";
      const resposta = await fetch(url.href, { mode: modo, cache: "force-cache" });
      const cache = await caches.open(this.CACHE);
      const alvo = new Request(new URL(this.url(id), location.href).href, { method: "GET" });
      await cache.put(alvo, resposta.clone());
      localStorage.setItem(`${this.PREFIXO}${id}`, "1");
    } catch (_) {
      // Falha de cache não interfere na exibição normal do escudo.
    }
  }
};

TesteEscudosCache.iniciar();
