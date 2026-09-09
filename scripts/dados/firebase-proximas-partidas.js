"use strict";

/*
 * CAMADA DE TESTE — PRÓXIMAS PARTIDAS NO MESMO FIREBASE
 *
 * O núcleo continua usando:
 *   /historico_compartilhado  -> somente resultados finalizados
 *   /memoria_mercados_v1      -> memória dos mercados
 *
 * Esta camada de teste lê, no MESMO Realtime Database:
 *   /proximas_partidas        -> agenda/equipes ainda sem resultado
 *
 * Nenhum dado de /proximas_partidas é enviado ao histórico como resultado.
 */
const TesteProximasPartidas = {
  CHAVE_CONFIG: "vai_na_fe_proximas_partidas_teste_v2",
  CHAVE_AGENDA_CACHE: "vai_na_fe_agenda_coletor_base_zerada_v1",
  PADRAO: { caminhoPartidas: "proximas_partidas" },
  TIMEOUT_MS: 4500,
  INTERVALO_MS: 2500,
  _partidas: new Map(),
  _partidasRemotas: new Map(),
  _status: "aguardando",
  _erro: "",
  _carregando: false,
  _timer: null,
  _assinaturaDados: "",
  _ultimaAtualizacaoRemota: 0,

  firebasePrincipal() {
    return (typeof Sincronizacao !== "undefined" && Sincronizacao.DATABASE_URL)
      ? String(Sincronizacao.DATABASE_URL).replace(/\/$/, "")
      : "";
  },

  config() {
    try {
      const salvo = JSON.parse(localStorage.getItem(this.CHAVE_CONFIG) || "null");
      return { ...this.PADRAO, ...(salvo || {}) };
    } catch (_) {
      return { ...this.PADRAO };
    }
  },

  salvarCaminho(caminhoPartidas) {
    const caminho = String(caminhoPartidas || this.PADRAO.caminhoPartidas)
      .trim().replace(/^\/+|\/+$/g, "") || this.PADRAO.caminhoPartidas;
    localStorage.setItem(this.CHAVE_CONFIG, JSON.stringify({ caminhoPartidas: caminho }));
    this._partidas.clear();
    this._status = "aguardando";
    this._erro = "";
    this.carregarAgora();
    return true;
  },

  configurada() {
    return /^https:\/\/[^\s]+$/.test(this.firebasePrincipal()) && Boolean(this.config().caminhoPartidas);
  },

  status() {
    return {
      estado: this._status,
      erro: this._erro,
      configurada: this.configurada(),
      quantidade: this._partidas.size,
      caminho: this.config().caminhoPartidas
    };
  },

  _emitir() {
    window.dispatchEvent(new CustomEvent("vai-na-fe:proximas-partidas-atualizada"));
  },

  async _fetchJSON(url) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.TIMEOUT_MS) : null;
    try {
      const r = await fetch(url, { cache: "no-store", ...(ctrl ? { signal: ctrl.signal } : {}) });
      if (!r.ok) throw new Error(`Firebase HTTP ${r.status}`);
      return await r.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  _url() {
    const base = this.firebasePrincipal();
    const path = this.config().caminhoPartidas;
    return `${base}/${path}.json`;
  },

  _primeiro(obj, chaves, fallback = "") {
    for (const k of chaves) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return fallback;
  },

  _valorCaminho(obj, caminhos, fallback = "") {
    for (const caminho of caminhos) {
      let atual = obj;
      for (const parte of caminho.split(".")) atual = atual?.[parte];
      if (atual !== undefined && atual !== null && String(atual).trim() !== "") return atual;
    }
    return fallback;
  },

  _nomeTime(raw, lado) {
    const casa = lado === "casa";
    const simples = casa
      ? ["mandante", "casa", "home", "timeCasa", "homeTeam", "equipeCasa", "teamHome"]
      : ["visitante", "fora", "away", "timeFora", "awayTeam", "equipeFora", "teamAway"];
    const v = this._primeiro(raw, simples, "");
    if (v && typeof v !== "object") return String(v);
    const caminhos = casa
      ? ["mandante.nome", "casa.nome", "home.name", "home.nome", "homeTeam.name", "timeCasa.nome", "teams.home.name"]
      : ["visitante.nome", "fora.nome", "away.name", "away.nome", "awayTeam.name", "timeFora.nome", "teams.away.name"];
    return String(this._valorCaminho(raw, caminhos, ""));
  },

  _logoTime(raw, lado) {
    const casa = lado === "casa";
    const simples = casa
      ? ["escudoMandante", "escudoCasa", "homeLogo", "logoHome", "logoCasa"]
      : ["escudoVisitante", "escudoFora", "awayLogo", "logoAway", "logoFora"];
    const v = this._primeiro(raw, simples, "");
    if (v && typeof v !== "object") return String(v);
    const caminhos = casa
      ? ["mandante.logo", "casa.logo", "home.logo", "homeTeam.logo", "timeCasa.logo", "teams.home.logo"]
      : ["visitante.logo", "fora.logo", "away.logo", "awayTeam.logo", "timeFora.logo", "teams.away.logo"];
    return String(this._valorCaminho(raw, caminhos, ""));
  },

  _normalizarSugestoes(raw) {
    const lista = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
    return lista.map((x, i) => ({
      mercado: String(this._primeiro(x, ["mercado", "nome", "pick", "titulo"], `Entrada ${i + 1}`)),
      mercadoCompleto: String(this._primeiro(x, ["mercadoCompleto", "mercado_completo", "nomeMercado", "nome_mercado"], "")),
      rotuloCompleto: String(this._primeiro(x, ["rotuloCompleto", "rotulo_completo", "label"], "")),
      descricao: String(this._primeiro(x, ["descricao", "detalhe", "subtitulo", "motivo"], "")),
      confianca: Number(this._primeiro(x, ["confianca", "probabilidade", "percentual", "prob"], NaN)),
      principal: Boolean(this._primeiro(x, ["principal", "destaque"], i === 0))
    })).slice(0, 6);
  },

  _normalizarConfrontos(raw) {
    const lista = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
    return lista.map(x => ({
      data: String(this._primeiro(x, ["data", "date"], "")),
      placar: String(this._primeiro(x, ["placar", "score", "resultado"], "")),
      vencedor: String(this._primeiro(x, ["vencedor", "winner"], ""))
    })).filter(x => x.data || x.placar || x.vencedor).slice(0, 5);
  },

  _parecePartida(raw, chave = "") {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const campos = [
      "horario", "hora", "kickoff", "mandante", "casa", "home", "timeCasa", "homeTeam",
      "visitante", "fora", "away", "timeFora", "awayTeam", "liga", "campeonato", "status"
    ];
    return campos.some(k => raw[k] !== undefined) || /(?:^|_)(?:[01]\d|2[0-3])[-:][0-5]\d(?:$|_)/.test(String(chave));
  },

  _normalizarPartida(raw, chave = "", dataBase = "") {
    if (!raw || typeof raw !== "object") return null;

    let horario = String(this._primeiro(raw, ["horario", "hora", "kickoff", "inicio", "time"], ""));
    if (!/^\d{2}:\d{2}$/.test(horario)) {
      const achou = String(chave).match(/(?:^|_)((?:[01]\d|2[0-3]))[-:]([0-5]\d)(?:$|_)/);
      if (achou) horario = `${achou[1]}:${achou[2]}`;
    }
    if (!/^\d{2}:\d{2}$/.test(horario)) return null;

    let data = String(this._primeiro(raw, ["data", "dataPartida", "date", "dia"], dataBase));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      const achouData = String(chave).match(/(20\d{2}-\d{2}-\d{2})/);
      if (achouData) data = achouData[1];
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) && typeof RelogioPartidas !== "undefined") {
      try { data = RelogioPartidas.agora().data; } catch (_) {}
    }

    const status = String(this._primeiro(raw, ["status", "situacao", "estado"], "agendada")).trim().toLowerCase();
    const mandante = this._nomeTime(raw, "casa");
    const visitante = this._nomeTime(raw, "fora");

    return {
      id: String(this._primeiro(raw, ["id", "fixtureId", "partidaId", "gameId"], chave || `${data}|${horario}`)),
      data,
      horario,
      status,
      ordem: Number.isFinite(Number(this._primeiro(raw, ["ordem", "order", "posicao", "position"], NaN)))
        ? Number(this._primeiro(raw, ["ordem", "order", "posicao", "position"], NaN))
        : null,
      liga: String(this._primeiro(raw, ["liga", "campeonato", "competicao", "competition", "league"], "Inglês Doméstico (Esportes Virtuais)")),
      mandante,
      visitante,
      escudoMandante: this._logoTime(raw, "casa"),
      escudoVisitante: this._logoTime(raw, "fora"),
      analise: String(this._primeiro(raw, ["analise", "analysis", "resumo"], "")),
      sugestoes: this._normalizarSugestoes(this._primeiro(raw, ["sugestoes", "entradas", "picks"], [])),
      confrontoDireto: this._normalizarConfrontos(this._primeiro(raw, ["confrontoDireto", "h2h", "confrontos"], [])),
      _origem: "proximas_partidas"
    };
  },

  _lerAgendaCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.CHAVE_AGENDA_CACHE) || "{}");
      if (!raw || typeof raw !== "object") return new Map();
      const mapa = new Map();
      for (const [chave, p] of Object.entries(raw)) {
        if (!p || typeof p !== "object" || !p.data || !p.horario) continue;
        mapa.set(chave, p);
      }
      return mapa;
    } catch (_) {
      return new Map();
    }
  },

  _salvarAgendaCache(mapa) {
    try {
      const itens = [...mapa.entries()]
        .filter(([, p]) => p && p.data && p.horario)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-500);
      localStorage.setItem(this.CHAVE_AGENDA_CACHE, JSON.stringify(Object.fromEntries(itens)));
    } catch (_) {}
  },

  _absorver(bruto) {
    const novo = new Map();
    const visitar = (valor, chave = "", dataBase = "", profundidade = 0) => {
      if (!valor || profundidade > 6) return;
      if (Array.isArray(valor)) {
        valor.forEach((v, i) => visitar(v, String(i), dataBase, profundidade + 1));
        return;
      }
      if (typeof valor !== "object") return;

      let dataLocal = dataBase;
      const matchData = String(chave).match(/20\d{2}-\d{2}-\d{2}/);
      if (matchData) dataLocal = matchData[0];

      if (this._parecePartida(valor, chave)) {
        const p = this._normalizarPartida(valor, chave, dataLocal);
        if (p?.data && p?.horario) novo.set(`${p.data}|${p.horario}`, p);
        return;
      }

      for (const [k, v] of Object.entries(valor)) visitar(v, k, dataLocal, profundidade + 1);
    };

    visitar(bruto);

    // O Firebase do coletor já informa qual é a partida ATUAL e a ordem das
    // próximas. Não usamos mais o relógio/resultados do site para decidir qual
    // linha deve aparecer. Isso impede a agenda de "parar" quando passa um
    // tempo sem chegar placar novo no histórico.
    // Uma resposta válida do Firebase é a fonte de verdade da agenda atual.
    // Se vier vazia, isso significa que NÃO há próximas partidas cadastradas.
    // Erro de rede não passa por _absorver(), então não confundimos "vazio" com falha.
    this._partidasRemotas = novo;
    this._ultimaAtualizacaoRemota = Date.now();

    // Mantém uma memória local da agenda vista pelo coletor. Uma resposta vazia
    // ou momentaneamente incompleta nunca apaga partidas já conhecidas.
    const agenda = this._lerAgendaCache();
    for (const [chave, p] of novo.entries()) {
      const anterior = agenda.get(chave) || {};
      agenda.set(chave, { ...anterior, ...p, _vistoEm: Date.now() });
    }
    this._salvarAgendaCache(agenda);

    // Consulta por horário/data pode usar tanto o snapshot atual quanto o cache.
    const uniao = new Map(agenda);
    for (const [chave, p] of novo.entries()) uniao.set(chave, p);
    this._partidas = uniao;

    // Guarda os times que o coletor já mostrou para que, quando o placar
    // chegar no histórico, a tela consiga montar a mesma linha com equipes e escudos.
    try {
      const chaveCache = "vai_na_fe_partidas_coletadas_base_zerada_v1";
      const cache = JSON.parse(localStorage.getItem(chaveCache) || "{}");
      for (const [chave, p] of novo.entries()) {
        cache[chave] = {
          data: p.data, horario: p.horario, liga: p.liga,
          mandante: p.mandante, visitante: p.visitante,
          escudoMandante: p.escudoMandante, escudoVisitante: p.escudoVisitante,
          ordem: p.ordem, status: p.status
        };
      }
      const entradas = Object.entries(cache).sort((a,b) => a[0].localeCompare(b[0])).slice(-500);
      localStorage.setItem(chaveCache, JSON.stringify(Object.fromEntries(entradas)));
    } catch (_) {}

    const assinaturaNova = JSON.stringify([...novo.entries()].map(([chave, p]) => [
      chave, p.ordem, p.status, p.liga, p.mandante, p.visitante,
      p.escudoMandante, p.escudoVisitante,
      p.analise, p.sugestoes, p.confrontoDireto
    ]));
    const mudou = assinaturaNova !== this._assinaturaDados;
    this._assinaturaDados = assinaturaNova;
    return mudou;
  },

  _statusFinal(status) {
    return ["finalizada", "finalizado", "encerrada", "encerrado", "finished", "final", "fim"].includes(String(status || "").toLowerCase());
  },

  snapshot() {
    return [...this._partidas.values()];
  },

  obterPartida(slot) {
    if (!slot?.data || !slot?.horario) return null;
    return this._partidas.get(`${slot.data}|${slot.horario}`) || null;
  },

  _paraSlot(p) {
    const [hora, minuto] = String(p.horario || "00:00").split(":").map(Number);
    return { data: p.data, horario: p.horario, hora, minuto, timeZone: "Europe/London", _meta: p };
  },

  proximas(limite = 5) {
    // A grade NÃO cria horários e NÃO reaproveita agenda antiga.
    // Ela usa somente o snapshot atual do Firebase e ainda descarta qualquer
    // registro cujo horário já passou no relógio oficial Europe/London.
    // Isso evita que 02:12, 02:15 etc. reapareçam horas depois só porque o
    // coletor deixou esses nós antigos em /proximas_partidas.
    const remotas = [...this._partidasRemotas.values()].filter(p => !this._statusFinal(p.status));
    if (!remotas.length) return [];

    let chaveMinima = "";
    try {
      if (typeof RelogioPartidas !== "undefined" && RelogioPartidas.partidaAtual) {
        const atual = RelogioPartidas.partidaAtual();
        if (atual?.data && atual?.horario) chaveMinima = `${atual.data}|${atual.horario}`;
      }
    } catch (_) {}

    if (!chaveMinima) {
      try {
        const agora = new Date();
        const data = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
        }).format(agora);
        const partes = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false
        }).formatToParts(agora);
        const vals = Object.fromEntries(partes.map(x => [x.type, x.value]));
        chaveMinima = `${data}|${vals.hour}:${vals.minute}`;
      } catch (_) {}
    }

    const validas = remotas.filter(p => {
      if (!p?.data || !p?.horario) return false;
      if (!chaveMinima) return true;
      return `${p.data}|${p.horario}` >= chaveMinima;
    });
    if (!validas.length) return [];

    // Depois de remover as vencidas, respeita a ordem do coletor apenas entre
    // as partidas que ainda são atuais/futuras.
    const temOrdem = validas.some(p => Number.isFinite(Number(p.ordem)));
    const ordenadas = [...validas].sort((a, b) => {
      const chaveA = `${a.data}|${a.horario}`;
      const chaveB = `${b.data}|${b.horario}`;
      if (chaveA !== chaveB) return chaveA.localeCompare(chaveB);
      if (temOrdem) {
        const ao = Number.isFinite(Number(a.ordem)) ? Number(a.ordem) : 9999;
        const bo = Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : 9999;
        if (ao !== bo) return ao - bo;
      }
      return 0;
    });

    return ordenadas.slice(0, limite).map(p => this._paraSlot(p));
  },

  async carregarAgora() {
    if (!this.configurada() || this._carregando) return false;
    this._carregando = true;
    this._status = "carregando";
    this._erro = "";
    let deveEmitir = false;
    try {
      const bruto = await this._fetchJSON(this._url());
      const mudou = this._absorver(bruto);
      deveEmitir = mudou || this._status !== "online";
      this._status = "online";
      return true;
    } catch (e) {
      deveEmitir = this._status !== "erro" || this._erro !== String(e?.message || e);
      this._status = "erro";
      this._erro = String(e?.message || e);
      console.warn("Próximas partidas indisponíveis no Firebase de teste:", e);
      return false;
    } finally {
      this._carregando = false;
      if (deveEmitir) this._emitir();
    }
  },

  iniciar() {
    if (!this.configurada()) {
      this._status = "nao-configurado";
      this._emitir();
      return false;
    }
    this.carregarAgora();
    if (!this._timer) this._timer = setInterval(() => this.carregarAgora(), this.INTERVALO_MS);
    return true;
  },

  parar() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
};
