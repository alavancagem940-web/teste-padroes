"use strict";

/*
 * CONSULTOR DE ENTRADAS — módulo isolado.
 *
 * Ele SOMENTE lê o histórico e as previsões já geradas pelo aplicativo.
 * Não altera especialistas, padrões, GREEN/RED, aprendizado ou histórico.
 *
 * Estratégia:
 * - sem 1X2 e sem O/U 0.5;
 * - 2 entradas principais de R$ 1,00 pelos melhores valores estimados (EV);
 * - cada candidato precisa de pelo menos 40 casos históricos comparáveis;
 * - 3ª entrada de R$ 0,50, com preferência por Under 3.5;
 * - qualquer RED da recomendação => pula o jogo seguinte;
 * - odds abaixo são as referências usadas nos testes e ficam isoladas aqui.
 */
const ConsultorEntradas = {
  CHAVE_ESTADO: "esportes_virtuais_consultor_entradas_v2",
  EV_MINIMO: 0.08,
  MIN_AMOSTRA: 40,
  MIN_AMOSTRA_STREAK: 8,
  INICIO_MODELO: 100,
  CHAVE_MODELO: "esportes_virtuais_consultor_modelo_v2",
  MERCADOS_MODELO: ["bm", "ou15", "ou25", "over35"],

  ODDS: {
    bm: { "SIM": 2.30, "NÃO": 1.60 },
    ou15: { "MAIS": 1.55, "MENOS": 2.45 },
    ou25: { "MAIS": 2.80, "MENOS": 1.44 },
    ou35: { "MENOS": 1.12 },
    over35: { "MAIS": 6.00 }
  },

  NOMES: {
    bm: "Ambos Marcam",
    ou15: "Over / Under 1.5",
    ou25: "Over / Under 2.5",
    ou35: "Under 3.5",
    over35: "Over 3.5"
  },

  _modelo: {
    pronto: false,
    processando: false,
    qtd: 0,
    ultimoPlacar: null,
    base: new Map(),
    porStreak: new Map(),
    streakGreen: {}
  },

  _estadoPadrao() {
    return { recomendacao: null, pularAlvoQtd: null, ultimaAvaliacao: null };
  },

  _carregarEstado() {
    try {
      const bruto = localStorage.getItem(this.CHAVE_ESTADO);
      if (!bruto) return this._estadoPadrao();
      return { ...this._estadoPadrao(), ...(JSON.parse(bruto) || {}) };
    } catch (_) { return this._estadoPadrao(); }
  },

  _salvarEstado(estado) {
    try { localStorage.setItem(this.CHAVE_ESTADO, JSON.stringify(estado)); } catch (_) {}
  },

  _valorReal(k, alvo) {
    if (!alvo) return null;
    if (k === "bm") return alvo.golsCasa > 0 && alvo.golsFora > 0 ? "SIM" : "NÃO";
    if (k === "ou15") return Number(alvo.totalGols) > 1.5 ? "MAIS" : "MENOS";
    if (k === "ou25") return Number(alvo.totalGols) > 2.5 ? "MAIS" : "MENOS";
    if (k === "ou35") return Number(alvo.totalGols) < 3.5 ? "MENOS" : "MAIS";
    if (k === "over35") return Number(alvo.totalGols) > 3.5 ? "MAIS" : "MENOS";
    return null;
  },

  _avaliarPick(pick, alvo) {
    return !!pick && !!alvo && this._valorReal(pick.k, alvo) === String(pick.valor);
  },

  _processarRecomendacaoAnterior(resultados, estado) {
    const rec = estado.recomendacao;
    if (!rec?.picks?.length) return estado;
    const qtd = resultados.length;
    if (qtd < Number(rec.alvoQtd)) return estado;

    // Se houve importação e o histórico pulou mais de uma posição, não associa
    // o sinal a um placar arbitrário.
    if (qtd !== Number(rec.alvoQtd)) {
      estado.recomendacao = null;
      this._salvarEstado(estado);
      return estado;
    }

    const alvo = resultados.at(-1);
    const detalhes = rec.picks.map(pick => ({ ...pick, green: this._avaliarPick(pick, alvo) }));
    const teveRed = detalhes.some(x => x.green === false);
    estado.ultimaAvaliacao = { placar: alvo?.placar || "-", detalhes, teveRed, qtd };
    estado.recomendacao = null;
    if (teveRed) estado.pularAlvoQtd = qtd + 1;
    this._salvarEstado(estado);
    return estado;
  },

  _novoModelo() {
    this._modelo = {
      pronto: false,
      processando: false,
      qtd: 0,
      ultimoPlacar: null,
      base: new Map(),
      porStreak: new Map(),
      streakGreen: Object.fromEntries(this.MERCADOS_MODELO.map(k => [k, 0]))
    };
  },

  _salvarModeloCache() {
    if (!this._modelo.pronto) return;
    try {
      localStorage.setItem(this.CHAVE_MODELO, JSON.stringify({
        qtd: this._modelo.qtd,
        ultimoPlacar: this._modelo.ultimoPlacar,
        base: Array.from(this._modelo.base.entries()),
        porStreak: Array.from(this._modelo.porStreak.entries()),
        streakGreen: this._modelo.streakGreen
      }));
    } catch (_) {}
  },

  _restaurarModeloCache(resultados) {
    try {
      const bruto = localStorage.getItem(this.CHAVE_MODELO);
      if (!bruto) return false;
      const c = JSON.parse(bruto);
      const qtdAtual = resultados.length;
      const exato = Number(c.qtd) === qtdAtual && c.ultimoPlacar === (resultados.at(-1)?.placar || null);
      const appendUm = Number(c.qtd) + 1 === qtdAtual && c.ultimoPlacar === (resultados.at(-2)?.placar || null);
      if (!exato && !appendUm) return false;
      this._modelo = {
        pronto: true, processando: false, qtd: Number(c.qtd) || 0,
        ultimoPlacar: c.ultimoPlacar || null,
        base: new Map(Array.isArray(c.base) ? c.base : []),
        porStreak: new Map(Array.isArray(c.porStreak) ? c.porStreak : []),
        streakGreen: {
          ...Object.fromEntries(this.MERCADOS_MODELO.map(k => [k, 0])),
          ...(c.streakGreen || {})
        }
      };
      if (appendUm) {
        const av = GreenRed.avaliarPrevisao(resultados, qtdAtual - 1);
        this._absorverAvaliacao(av);
        this._modelo.qtd = qtdAtual;
        this._modelo.ultimoPlacar = resultados.at(-1)?.placar || null;
        this._salvarModeloCache();
      }
      return true;
    } catch (_) { return false; }
  },

  _somar(map, chave, green) {
    const atual = map.get(chave) || { n: 0, wins: 0 };
    atual.n++;
    if (green) atual.wins++;
    map.set(chave, atual);
  },

  _absorverAvaliacao(avaliacao) {
    if (!avaliacao) return;
    for (const k of this.MERCADOS_MODELO) {
      if (typeof avaliacao[k] !== "boolean") continue;
      const valor = avaliacao.valoresPrevistos?.[k];
      if (valor == null) continue;
      const green = Boolean(avaliacao[k]);
      const streakAntes = Math.min(4, Number(this._modelo.streakGreen[k]) || 0);
      const baseKey = `${k}|${String(valor)}`;
      const streakKey = `${baseKey}|${streakAntes}`;
      this._somar(this._modelo.base, baseKey, green);
      this._somar(this._modelo.porStreak, streakKey, green);
      this._modelo.streakGreen[k] = green ? streakAntes + 1 : 0;
    }
  },

  _finalizarModelo(resultados) {
    this._modelo.pronto = true;
    this._modelo.processando = false;
    this._modelo.qtd = resultados.length;
    this._modelo.ultimoPlacar = resultados.at(-1)?.placar || null;
    this._salvarModeloCache();
    if (typeof Interface !== "undefined" && Interface.atualizar) {
      setTimeout(() => Interface.atualizar(), 0);
    }
  },

  _construirModeloAssincrono(resultados) {
    this._novoModelo();
    this._modelo.processando = true;
    const fim = resultados.length;
    const inicio = fim > this.INICIO_MODELO ? this.INICIO_MODELO : 1;
    let i = inicio;

    const passo = () => {
      const limite = Math.min(fim, i + 8);
      try {
        for (; i < limite; i++) {
          const av = (typeof GreenRed !== "undefined" && GreenRed.avaliarPrevisao)
            ? GreenRed.avaliarPrevisao(resultados, i)
            : null;
          this._absorverAvaliacao(av);
        }
      } catch (e) {
        console.error("Erro no modelo do Consultor de Entradas:", e);
        this._modelo.processando = false;
        return;
      }
      if (i < fim) setTimeout(passo, 0);
      else this._finalizarModelo(resultados);
    };
    setTimeout(passo, 0);
  },

  _garantirModelo(resultados) {
    const qtd = resultados.length;
    const ultimo = resultados.at(-1)?.placar || null;

    if (this._modelo.processando) return false;

    if (!this._modelo.pronto) {
      if (this._restaurarModeloCache(resultados)) return true;
      this._construirModeloAssincrono(resultados);
      return false;
    }

    if (this._modelo.qtd === qtd && this._modelo.ultimoPlacar === ultimo) return true;

    // Caminho rápido: chegou exatamente um resultado novo. Atualiza o modelo
    // sem reconstruir toda a janela histórica.
    if (qtd === this._modelo.qtd + 1) {
      try {
        const av = GreenRed.avaliarPrevisao(resultados, qtd - 1);
        this._absorverAvaliacao(av);
        this._modelo.qtd = qtd;
        this._modelo.ultimoPlacar = ultimo;
        this._salvarModeloCache();
        return true;
      } catch (_) {
        this._construirModeloAssincrono(resultados);
        return false;
      }
    }

    // Importação, restauração ou alteração antiga: reconstrói somente o modelo
    // isolado, sem tocar no restante do aplicativo.
    this._construirModeloAssincrono(resultados);
    return false;
  },

  _estimativa(k, valor) {
    const streak = Math.min(4, Number(this._modelo.streakGreen[k]) || 0);
    const baseKey = `${k}|${String(valor)}`;
    const streakKey = `${baseKey}|${streak}`;
    const esp = this._modelo.porStreak.get(streakKey);
    const base = this._modelo.base.get(baseKey);
    const grupo = esp && esp.n >= this.MIN_AMOSTRA_STREAK ? esp : base;
    if (!grupo || grupo.n < this.MIN_AMOSTRA) return null;
    // Suavização Beta/Laplace usada nos testes para não supervalorizar amostras.
    const p = (grupo.wins + 2) / (grupo.n + 4);
    return { p, n: grupo.n, wins: grupo.wins, streak, usouStreak: grupo === esp };
  },

  _candidato(k, m) {
    if (!m?.ativo || !m?.palpite) return null;
    const valor = String(m.palpite.valor);
    const odd = Number(this.ODDS?.[k]?.[valor]);
    if (!Number.isFinite(odd) || odd <= 1) return null;
    const est = this._estimativa(k, valor);
    if (!est) return null;
    const ev = est.p * odd - 1;
    return {
      k, valor, odd, prob: est.p * 100, ev,
      amostra: est.n, wins: est.wins, streak: est.streak,
      usouStreak: est.usouStreak, stake: 1.00
    };
  },

  _recentesUnder35(resultados, n = 30) {
    const lista = (resultados || []).slice(-n);
    if (!lista.length) return { taxa: 0, corridaOver: 0, amostra: 0 };
    const greens = lista.filter(x => Number(x.totalGols) < 3.5).length;
    let corridaOver = 0;
    for (let i = lista.length - 1; i >= 0; i--) {
      if (Number(lista[i].totalGols) < 3.5) break;
      corridaOver++;
    }
    return { taxa: greens * 100 / lista.length, corridaOver, amostra: lista.length };
  },

  _terceiraEntrada(resultados, principais, mercados) {
    const under = this._recentesUnder35(resultados, 30);
    const usarUnder = under.amostra >= 10 && under.taxa >= 75 && under.corridaOver < 2;

    if (usarUnder) {
      return {
        k: "ou35", valor: "MENOS", odd: this.ODDS.ou35.MENOS,
        prob: under.taxa,
        ev: (under.taxa / 100) * this.ODDS.ou35.MENOS - 1,
        amostra: under.amostra, stake: 0.50, terceira: true,
        motivo: `Under 3.5 em ${under.taxa.toFixed(1)}% dos últimos ${under.amostra}`
      };
    }

    const usados = new Set(principais.map(x => `${x.k}|${x.valor}`));
    const alternativas = this.MERCADOS_MODELO
      .map(k => this._candidato(k, mercados[k]))
      .filter(Boolean)
      .filter(x => !usados.has(`${x.k}|${x.valor}`) && x.ev >= this.EV_MINIMO)
      .sort((a, b) => b.ev - a.ev || b.prob - a.prob);

    if (alternativas.length) {
      return {
        ...alternativas[0], stake: 0.50, terceira: true,
        motivo: "Under 3.5 sem confirmação forte; 3ª entrada foi para o próximo melhor valor"
      };
    }

    return {
      k: "ou35", valor: "MENOS", odd: this.ODDS.ou35.MENOS,
      prob: under.taxa,
      ev: (under.taxa / 100) * this.ODDS.ou35.MENOS - 1,
      amostra: under.amostra, stake: 0.50, terceira: true,
      motivo: "3ª entrada pequena em Under 3.5"
    };
  },

  analisar(resultados, mercados, liberado = true) {
    const estado = this._processarRecomendacaoAnterior(resultados, this._carregarEstado());
    const qtd = resultados.length;

    if (!liberado) {
      return { status: "AGUARDAR", motivo: "Aguardando os 3 resultados iniciais da sessão.", picks: [], estado };
    }

    if (estado.pularAlvoQtd != null) {
      if (qtd < Number(estado.pularAlvoQtd)) {
        return { status: "PULAR", motivo: "Cooldown: houve RED na última recomendação.", picks: [], estado };
      }
      estado.pularAlvoQtd = null;
      this._salvarEstado(estado);
    }

    if (estado.recomendacao && Number(estado.recomendacao.baseQtd) === qtd) {
      return { status: "ENTRAR", motivo: estado.recomendacao.motivo, picks: estado.recomendacao.picks, estado };
    }

    if (!this._garantirModelo(resultados)) {
      return {
        status: "AGUARDAR",
        motivo: `Preparando o modelo isolado com o histórico anterior (a partir do resultado ${this.INICIO_MODELO})…`,
        picks: [], estado, preparando: true
      };
    }

    const principais = this.MERCADOS_MODELO
      .map(k => this._candidato(k, mercados[k]))
      .filter(Boolean)
      .filter(x => x.ev >= this.EV_MINIMO)
      .sort((a, b) => b.ev - a.ev || b.prob - a.prob);

    if (principais.length < 2) {
      return {
        status: "AGUARDAR",
        motivo: `Só ${principais.length} mercado(s) passou/passaram no filtro de valor e amostra. Não força entrada.`,
        picks: [], candidatos: principais, estado
      };
    }

    const picks = [principais[0], principais[1]];
    picks.push(this._terceiraEntrada(resultados, picks, mercados));

    const rec = {
      baseQtd: qtd,
      alvoQtd: qtd + 1,
      criadoEm: Date.now(),
      motivo: "Dois melhores valores históricos + 3ª entrada pequena, preferindo Under 3.5.",
      picks
    };
    estado.recomendacao = rec;
    this._salvarEstado(estado);
    return { status: "ENTRAR", motivo: rec.motivo, picks, estado };
  },

  _rotuloPick(pick) {
    const nome = this.NOMES[pick.k] || pick.k;
    let lado = pick.valor;
    if (pick.k === "ou15") lado = pick.valor === "MAIS" ? "Mais de 1.5" : "Menos de 1.5";
    if (pick.k === "ou25") lado = pick.valor === "MAIS" ? "Mais de 2.5" : "Menos de 2.5";
    if (pick.k === "ou35") lado = "Menos de 3.5";
    if (pick.k === "over35") lado = "Mais de 3.5";
    return `${nome} — ${lado}`;
  },

  _htmlUltima(ultima) {
    if (!ultima?.detalhes?.length) return "";
    const itens = ultima.detalhes.map(x =>
      `<span class="consultor-mini ${x.green ? "consultor-green" : "consultor-red"}">${x.green ? "🟢" : "🔴"} ${this._rotuloPick(x)}</span>`
    ).join("");
    return `<div class="consultor-ultima"><b>Última recomendação:</b> ${ultima.placar} · ${itens}</div>`;
  },

  atualizar({ resultados = [], mercados = {}, liberado = true } = {}) {
    const el = document.getElementById("consultor-entradas");
    if (!el) return;
    const analise = this.analisar(resultados, mercados, liberado);
    const ultima = analise.estado?.ultimaAvaliacao;
    const horario = (typeof RelogioPartidas !== "undefined") ? RelogioPartidas.proximaPartida()?.horario : null;

    if (analise.status === "PULAR") {
      el.innerHTML = `<h2>🧭 Consultor de Entradas</h2>
        <div class="consultor-status consultor-pular">⏸ <b>PULAR O PRÓXIMO JOGO${horario ? ` (${horario})` : ""}</b></div>
        <p>${analise.motivo}</p>${this._htmlUltima(ultima)}
        <p class="consultor-nota">Módulo isolado: nada aqui modifica os especialistas do aplicativo.</p>`;
      return;
    }

    if (analise.status !== "ENTRAR") {
      const candidatos = (analise.candidatos || []).map(x =>
        `${this._rotuloPick(x)} · ${x.amostra} casos · EV ${(x.ev * 100).toFixed(1)}%`
      ).join(" · ");
      el.innerHTML = `<h2>🧭 Consultor de Entradas</h2>
        <div class="consultor-status consultor-aguardar">⚪ <b>${analise.preparando ? "PREPARANDO" : "AGUARDAR"}${horario ? ` · próximo jogo ${horario}` : ""}</b></div>
        <p>${analise.motivo}</p>${candidatos ? `<p class="consultor-candidatos">Passou no filtro: ${candidatos}</p>` : ""}
        ${this._htmlUltima(ultima)}
        <p class="consultor-nota">Módulo isolado: nada aqui modifica os especialistas do aplicativo.</p>`;
      return;
    }

    const cards = analise.picks.map((x, i) => {
      const ev = Number.isFinite(x.ev) ? `${x.ev >= 0 ? "+" : ""}${(x.ev * 100).toFixed(1)}%` : "—";
      const amostra = x.amostra ? ` · amostra <b>${x.amostra}</b>` : "";
      return `<div class="consultor-pick">
        <div class="consultor-pick-topo"><b>Entrada ${i + 1}</b><strong>R$ ${Number(x.stake).toFixed(2).replace(".", ",")}</strong></div>
        <div class="consultor-mercado">${this._rotuloPick(x)}</div>
        <div class="consultor-detalhe">Odd ref. <b>${Number(x.odd).toFixed(2)}</b> · confiança est. <b>${Number(x.prob).toFixed(1)}%</b>${amostra} · EV <b>${ev}</b></div>
        ${x.motivo ? `<div class="consultor-motivo">${x.motivo}</div>` : ""}
      </div>`;
    }).join("");

    el.innerHTML = `<h2>🧭 Consultor de Entradas</h2>
      <div class="consultor-status consultor-entrar">🟢 <b>ENTRAR${horario ? ` NO JOGO DAS ${horario}` : ""}</b></div>
      <div class="consultor-grid">${cards}</div>
      <p class="consultor-regra">Total sugerido: <b>R$ 2,50</b> · R$1 + R$1 + R$0,50 · se qualquer entrada der RED, o consultor pula o jogo seguinte.</p>
      ${this._htmlUltima(ultima)}
      <p class="consultor-nota">Odds de referência dos testes. Confira a odd real da casa antes de entrar. O consultor apenas recomenda; não altera o restante do app.</p>`;
  }
};
