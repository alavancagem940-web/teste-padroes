"use strict";

/*
 * HISTÓRICO ATUAL COMPARTILHADO — FIREBASE REALTIME DATABASE
 *
 * REGRA DE SEGURANÇA DE ENVIO:
 * - O sincronizador NUNCA varre o localStorage para decidir o que enviar.
 * - Somente um resultado passado explicitamente para publicarResultado(r)
 *   pode ser gravado no Firebase.
 *
 * Isso impede que placares antigos/locais reapareçam quando o usuário usa
 * "Resultado de outro horário".
 */
const Sincronizacao = {
  DATABASE_URL: "https://projeto-padroes-default-rtdb.firebaseio.com",
  CAMINHO: "historico_compartilhado",
  INTERVALO_MS: 2000,
  _timer: null,
  _rodando: false,
  _listeners: new Set(),
  _chavesConhecidasAoAbrir: new Set(),
  _chavesEntreguesSessao: new Set(),
  _filaEnvio: new Map(),
  _inicioSessaoMs: 0,
  _baselineRemotoPronto: false,

  configurada() {
    return /^https:\/\/[^\s]+$/.test(String(this.DATABASE_URL || "").trim());
  },

  _baseUrl() {
    return String(this.DATABASE_URL || "").replace(/\/$/, "");
  },

  _url() {
    return `${this._baseUrl()}/${this.CAMINHO}.json`;
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
    if (!id) return null;
    return `${this._baseUrl()}/${this.CAMINHO}/${encodeURIComponent(id)}.json`;
  },

  _normalizar(r) {
    if (!r?.placar || !r?._temporal?.data || !r?._temporal?.horario) return null;
    const m = String(r.placar).trim().toLowerCase().match(/^(\d+)x(\d+)$/);
    if (!m) return null;
    const casa = Number(m[1]);
    const fora = Number(m[2]);
    if (!Number.isFinite(casa) || !Number.isFinite(fora)) return null;

    return {
      id: this._idFirebase(r),
      placar: `${casa}x${fora}`,
      golsCasa: casa,
      golsFora: fora,
      totalGols: casa + fora,
      data: (typeof r.data === "string" && r.data) ? r.data : new Date().toISOString(),
      _temporal: {
        data: r._temporal.data,
        horario: r._temporal.horario,
        hora: r._temporal.hora,
        minuto: r._temporal.minuto,
        slot3: r._temporal.slot3,
        timeZone: r._temporal.timeZone || "Europe/London"
      },
      fonte: "ao-vivo"
    };
  },

  _listaUnica(lista) {
    const mapa = new Map();
    for (const bruto of (lista || [])) {
      const r = this._normalizar(bruto);
      const chave = this._chave(r);
      if (r && chave && !mapa.has(chave)) mapa.set(chave, r);
    }
    return [...mapa.values()].sort((a, b) => this._chave(a).localeCompare(this._chave(b)));
  },

  _foiCriadoNestaSessao(r) {
    const ms = Date.parse(r?.data || "");
    return Number.isFinite(ms) && this._inicioSessaoMs > 0 && ms >= this._inicioSessaoMs;
  },

  async _get() {
    if (!this.configurada()) return [];
    const res = await fetch(this._url(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Banco remoto HTTP ${res.status}`);
    const dados = await res.json();
    if (!dados) return [];
    return Array.isArray(dados) ? dados : Object.values(dados);
  },

  // Leitura do histórico persistente para reconstruir a BASE DE APRENDIZADO
  // na abertura. Não transforma esses registros em resultados da sessão atual.
  async obterHistoricoCompleto() {
    if (!this.configurada()) return [];
    return this._listaUnica(await this._get());
  },

  async _putRegistro(r) {
    const url = this._urlRegistro(r);
    if (!url) return false;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r)
    });
    if (!res.ok) throw new Error(`Banco remoto HTTP ${res.status}`);
    return true;
  },

  /*
   * ÚNICA porta de saída para novos resultados.
   * Recebe o objeto que acabou de ser criado pelo Historico.adicionar().
   * Nenhum outro placar do navegador é incluído automaticamente.
   */
  async publicarResultado(resultado) {
    const r = this._normalizar(resultado);
    const chave = this._chave(r);
    if (!r || !chave) return false;

    this._filaEnvio.set(chave, r);
    // Ele já foi inserido localmente pela Interface. Evita reimportá-lo quando
    // o Firebase devolver o mesmo registro no próximo GET.
    this._chavesEntreguesSessao.add(chave);
    await this.sincronizarAgora();
    return true;
  },

  async sincronizarAgora() {
    if (!this.configurada() || this._rodando) return false;
    this._rodando = true;

    try {
      const remotoAntes = this._listaUnica(await this._get());

      // Se a primeira leitura na abertura falhou, tudo que for antigo vira
      // baseline assim que a conexão voltar. Isso não alimenta a fila de envio.
      if (!this._baselineRemotoPronto) {
        for (const r of remotoAntes) {
          if (!this._foiCriadoNestaSessao(r)) {
            const chave = this._chave(r);
            if (chave) this._chavesConhecidasAoAbrir.add(chave);
          }
        }
        this._baselineRemotoPronto = true;
      }

      const mapaRemoto = new Map(remotoAntes.map(r => [this._chave(r), r]));

      // IMPORTANTE: percorre SOMENTE a fila explícita. Nunca localStorage.
      for (const [chave, local] of [...this._filaEnvio.entries()]) {
        if (!mapaRemoto.has(chave)) {
          await this._putRegistro(local);
          mapaRemoto.set(chave, local);
        }
        // Existindo ou tendo acabado de ser enviado, não precisa ficar na fila.
        this._filaEnvio.delete(chave);
      }

      const remotoDepois = this._listaUnica(await this._get());
      const novosParaInterface = remotoDepois.filter(r => {
        const chave = this._chave(r);
        if (!chave) return false;
        if (this._chavesConhecidasAoAbrir.has(chave)) return false;
        if (this._chavesEntreguesSessao.has(chave)) return false;
        // Se houver timestamp, só aceita registros criados após a abertura.
        // Registros sem timestamp não são tratados como novos.
        return this._foiCriadoNestaSessao(r);
      });

      if (novosParaInterface.length) {
        for (const r of novosParaInterface) {
          this._chavesEntreguesSessao.add(this._chave(r));
        }
        for (const fn of this._listeners) {
          try { fn(novosParaInterface); } catch (e) { console.error(e); }
        }
      }
      return true;
    } catch (e) {
      console.warn("Sincronização compartilhada indisponível:", e);
      return false;
    } finally {
      this._rodando = false;
    }
  },

  observar(fn) {
    if (typeof fn === "function") this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  async iniciar() {
    if (!this.configurada() || this._timer) return false;

    this._inicioSessaoMs = Date.now();
    this._chavesConhecidasAoAbrir = new Set();
    this._chavesEntreguesSessao = new Set();
    this._filaEnvio = new Map();
    this._baselineRemotoPronto = false;

    try {
      const existentes = this._listaUnica(await this._get());
      for (const r of existentes) {
        const chave = this._chave(r);
        if (chave) this._chavesConhecidasAoAbrir.add(chave);
      }
      this._baselineRemotoPronto = true;
    } catch (e) {
      console.warn("Não foi possível preparar o histórico da sessão:", e);
    }

    this._timer = setInterval(() => this.sincronizarAgora(), this.INTERVALO_MS);
    return true;
  },

  parar() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
};
