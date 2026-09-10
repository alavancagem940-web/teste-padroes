"use strict";

/*
 * FIREBASE LEVE
 *
 * A abertura e as atualizacoes consultam somente os 10 resultados recentes.
 * Cada novo resultado continua sendo enviado individualmente e imediatamente.
 * A memoria individual (mercado + lado) fica em um caminho separado e compacto.
 */
const Sincronizacao = {
  DATABASE_URL: "https://projeto-padroes-default-rtdb.firebaseio.com",
  CAMINHO: "historico_compartilhado",
  CAMINHO_MEMORIA: "memoria_mercados_v4_individuais",
  CAMINHOS_MEMORIA_ANTIGA: ["memoria_mercados_v1", "memoria_mercados_v2_base_zerada"],
  LIMITE_RESULTADOS: 10,
  LIMITE_BASE_APRENDIZADO: 500,
  INTERVALO_MS: 2000,
  TIMEOUT_MS: 4500,
  _timer: null,
  _rodando: false,
  _listeners: new Set(),
  _chavesEntreguesSessao: new Set(),
  _filaEnvio: new Map(),
  _memoriaPublicando: false,
  _memoriaPendente: null,

  configurada() {
    return /^https:\/\/[^\s]+$/.test(String(this.DATABASE_URL || "").trim());
  },

  _baseUrl() {
    return String(this.DATABASE_URL || "").replace(/\/$/, "");
  },

  _url() {
    return `${this._baseUrl()}/${this.CAMINHO}.json`;
  },

  _urlRecentes(limite = this.LIMITE_RESULTADOS) {
    const n = Math.max(1, Math.min(1000, Number(limite) || this.LIMITE_RESULTADOS));
    return `${this._url()}?orderBy=%22%24key%22&limitToLast=${n}`;
  },

  _urlMemoria() {
    return `${this._baseUrl()}/${this.CAMINHO_MEMORIA}.json`;
  },

  _chave(r) {
    const t = r?._temporal;
    return t?.data && t?.horario ? `${t.data}|${t.horario}` : null;
  },

  _idFirebase(r) {
    const chave = this._chave(r);
    if (!chave) return null;
    return chave.replace(/\|/g, "_").replace(/:/g, "-").replace(/[.#$\[\]\/]/g, "_");
  },

  _urlRegistro(r) {
    const id = this._idFirebase(r);
    return id ? `${this._baseUrl()}/${this.CAMINHO}/${encodeURIComponent(id)}.json` : null;
  },

  _normalizar(r) {
    if (!r?.placar || !r?._temporal?.data || !r?._temporal?.horario) return null;
    const m = String(r.placar).trim().toLowerCase().match(/^(\d+)x(\d+)$/);
    if (!m) return null;
    const casa = Number(m[1]), fora = Number(m[2]);
    if (!Number.isFinite(casa) || !Number.isFinite(fora)) return null;

    // A IA Coletora nova pode enviar mandante/visitante junto do resultado.
    // A versão anterior do site descartava esses campos aqui, então a aba
    // "Últimas entradas" recebia o placar, mas perdia os nomes dos times.
    const texto = (valor) => {
      if (valor === undefined || valor === null) return "";
      if (typeof valor === "object") return String(valor.nome ?? valor.name ?? valor.time ?? "").trim();
      return String(valor).trim();
    };
    const primeiro = (...valores) => {
      for (const v of valores) {
        const t = texto(v);
        if (t) return t;
      }
      return "";
    };
    const mandante = primeiro(r.mandante, r.casa, r.home, r.timeCasa, r.homeTeam, r.equipeCasa, r.teams?.home);
    const visitante = primeiro(r.visitante, r.fora, r.away, r.timeFora, r.awayTeam, r.equipeFora, r.teams?.away);
    const escudoMandante = primeiro(r.escudoMandante, r.escudoCasa, r.homeLogo, r.logoHome, r.logoCasa, r.mandante?.logo, r.home?.logo, r.teams?.home?.logo);
    const escudoVisitante = primeiro(r.escudoVisitante, r.escudoFora, r.awayLogo, r.logoAway, r.logoFora, r.visitante?.logo, r.away?.logo, r.teams?.away?.logo);
    const liga = primeiro(r.liga, r.competicao, r.campeonato, r.league, r.competition);

    // BASE LIMPA: resultado sem os DOIS times nao entra no historico,
    // nao treina mercado e nao participa de confronto direto.
    if (!mandante || !visitante) return null;

    return {
      id: this._idFirebase(r),
      placar: `${casa}x${fora}`,
      golsCasa: casa,
      golsFora: fora,
      totalGols: casa + fora,
      data: typeof r.data === "string" && r.data ? r.data : new Date().toISOString(),
      _temporal: {
        data: r._temporal.data,
        horario: r._temporal.horario,
        hora: r._temporal.hora,
        minuto: r._temporal.minuto,
        slot3: r._temporal.slot3,
        timeZone: r._temporal.timeZone || "Europe/London"
      },
      fonte: "ao-vivo",
      ...(mandante ? { mandante } : {}),
      ...(visitante ? { visitante } : {}),
      ...(escudoMandante ? { escudoMandante } : {}),
      ...(escudoVisitante ? { escudoVisitante } : {}),
      ...(liga ? { liga } : {}),
      timesConfirmados: Boolean(mandante && visitante)
    };
  },

  _listaUnica(lista, limite = this.LIMITE_RESULTADOS) {
    const mapa = new Map();
    for (const bruto of (lista || [])) {
      const r = this._normalizar(bruto);
      const chave = this._chave(r);
      if (r && chave) mapa.set(chave, r);
    }
    const n = Math.max(1, Math.min(1000, Number(limite) || this.LIMITE_RESULTADOS));
    return [...mapa.values()]
      .sort((a, b) => this._chave(a).localeCompare(this._chave(b)))
      .slice(-n);
  },

  async _fetch(url, opcoes = {}) {
    const controle = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controle ? setTimeout(() => controle.abort(), this.TIMEOUT_MS) : null;
    try {
      const resposta = await fetch(url, {
        cache: "no-store",
        ...opcoes,
        ...(controle ? { signal: controle.signal } : {})
      });
      if (!resposta.ok) throw new Error(`Banco remoto HTTP ${resposta.status}`);
      return resposta;
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  async obterUltimos(limite = this.LIMITE_RESULTADOS) {
    if (!this.configurada()) return [];
    const resposta = await this._fetch(this._urlRecentes(limite));
    const dados = await resposta.json();
    if (!dados) return [];
    return this._listaUnica(Array.isArray(dados) ? dados : Object.values(dados), limite);
  },

  // Na abertura baixa a BASE LIMPA completa (ate 500 resultados) para
  // reconstruir aprendizado e H2H. Depois o polling continua leve, com 10.
  async obterHistoricoCompleto() {
    return this.obterUltimos(this.LIMITE_BASE_APRENDIZADO);
  },

  async _putRegistro(r) {
    const url = this._urlRegistro(r);
    if (!url) return false;
    await this._fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r)
    });
    return true;
  },

  async publicarResultado(resultado) {
    const r = this._normalizar(resultado);
    const chave = this._chave(r);
    if (!r || !chave) return false;
    this._filaEnvio.set(chave, r);
    this._chavesEntreguesSessao.add(chave);
    this.sincronizarAgora();
    return true;
  },

  async sincronizarAgora() {
    if (!this.configurada() || this._rodando) return false;
    this._rodando = true;
    try {
      // PUT por horario e idempotente. Nao precisamos baixar a base inteira
      // para descobrir se o resultado ja existe.
      for (const [chave, local] of [...this._filaEnvio.entries()]) {
        await this._putRegistro(local);
        this._filaEnvio.delete(chave);
      }

      const recentes = await this.obterUltimos(this.LIMITE_RESULTADOS);
      const novos = recentes.filter(r => {
        const chave = this._chave(r);
        return Boolean(chave && !this._chavesEntreguesSessao.has(chave));
      });
      if (novos.length) {
        for (const r of novos) this._chavesEntreguesSessao.add(this._chave(r));
        for (const fn of this._listeners) {
          try { fn(novos); } catch (e) { console.error(e); }
        }
      }
      return true;
    } catch (e) {
      console.warn("Sincronizacao leve indisponivel:", e);
      return false;
    } finally {
      this._rodando = false;
    }
  },

  async limparMemoriasAntigasRemotasUmaVez() {
    if (!this.configurada()) return false;
    const marcador = "vai_na_fe_memorias_antigas_remotas_limpas_h2h10_v1";
    try {
      if (localStorage.getItem(marcador) === "ok") return true;
    } catch (_) {}
    let tudoOk = true;
    for (const caminho of this.CAMINHOS_MEMORIA_ANTIGA || []) {
      try {
        await this._fetch(`${this._baseUrl()}/${caminho}.json`, { method: "DELETE" });
      } catch (e) {
        tudoOk = false;
        console.warn(`Nao foi possivel limpar /${caminho}:`, e);
      }
    }
    if (tudoOk) {
      try { localStorage.setItem(marcador, "ok"); } catch (_) {}
    }
    return tudoOk;
  },

  observar(fn) {
    if (typeof fn === "function") this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  iniciar() {
    if (!this.configurada() || this._timer) return false;
    this._chavesEntreguesSessao = new Set();
    this._filaEnvio = new Map();
    // Nao aguarda a rede: a tela ja esta pronta quando isto comeca.
    this.sincronizarAgora();
    this._timer = setInterval(() => this.sincronizarAgora(), this.INTERVALO_MS);
    return true;
  },

  parar() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },

  async obterMemoriaAprendizado() {
    if (!this.configurada()) return null;
    try {
      const resposta = await this._fetch(this._urlMemoria());
      return await resposta.json();
    } catch (e) {
      console.warn("Memoria remota indisponivel; usando memoria embutida/local.");
      return null;
    }
  },

  publicarMemoriaAprendizado(pacote) {
    if (!this.configurada() || !pacote) return false;
    this._memoriaPendente = pacote;
    if (this._memoriaPublicando) return true;
    this._memoriaPublicando = true;
    setTimeout(async () => {
      let atual = null;
      try {
        while (this._memoriaPendente) {
          atual = this._memoriaPendente;
          this._memoriaPendente = null;
          await this._fetch(this._urlMemoria(), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(atual)
          });
        }
      } catch (e) {
        // Se nao chegou uma memoria mais nova durante a tentativa, conserva o
        // pacote atual para o proximo ciclo. Nenhum aprendizado se perde.
        if (!this._memoriaPendente && atual) {
          this._memoriaPendente = atual;
        }
        console.warn("Memoria dos mercados sera reenviada depois:", e);
      } finally {
        this._memoriaPublicando = false;
      }
    }, 250);
    return true;
  }
};
