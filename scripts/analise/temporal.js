"use strict";

/*
 * APRENDIZADO TEMPORAL CONTÍNUO
 *
 * O horário deixa de ser apenas separador de sessão e passa a produzir sinais
 * para cada mercado. A camada observa:
 * - horário exato e faixas de 3/15/30/60/120 minutos;
 * - período do dia e dia da semana;
 * - minutos desde o último resultado registrado;
 * - quantidade de slots de 3 minutos sem resultado;
 * - ritmo recente (média dos últimos intervalos) e aceleração/desaceleração;
 * - último resultado daquele mercado e tamanho da repetição atual;
 * - tempo desde a última ocorrência de cada lado possível do mercado.
 *
 * A sessão é contínua: intervalos sem registro são DADOS, não quebras.
 * O temporal pode bloquear uma entrada apenas quando existe evidência forte,
 * com boa amostra e tendência CONTRÁRIA ao palpite principal.
 */
const AnaliseTemporal = {
  MIN_AMOSTRA_EXIBIR: 30,
  MIN_AMOSTRA_FILTRO: 80,
  MIN_SINAL: 6,
  MIN_SINAL_FORTE: 10,
  PCT_SINAL_FORTE: 62,
  MIN_VETO: 12,
  PCT_VETO: 72,
  _cache: new Map(),

  _minutosAbsolutos(t) {
    if (!t?.data || !t?.horario) return null;
    const [h, m] = String(t.horario).split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const dia = Date.parse(`${t.data}T00:00:00Z`);
    if (!Number.isFinite(dia)) return null;
    return Math.floor(dia / 60000) + h * 60 + m;
  },

  _chaveTemporal(r) {
    const t = r?._temporal;
    return t?.data && t?.horario ? `${t.data}|${t.horario}` : null;
  },

  _ordenar(resultados) {
    return (resultados || [])
      .filter(r => this._chaveTemporal(r))
      .slice()
      .sort((a, b) => this._chaveTemporal(a).localeCompare(this._chaveTemporal(b)));
  },

  _valoresMercado(k) {
    if (k === "r12") return ["1", "X", "2"];
    if (k === "bm") return ["SIM", "NÃO"];
    if (k === "gols") return ["0", "1", "2", "3", "4", "5"];
    if (["ou05", "under05", "ou15", "ou25", "ou35", "over35"].includes(k)) return ["MAIS", "MENOS"];
    return [];
  },

  _resultadoMercado(r, k) {
    const g = Number(r?.totalGols);
    if (!Number.isFinite(g)) return null;
    if (k === "ou05" || k === "under05") return g > 0 ? "MAIS" : "MENOS";
    if (k === "ou15") return g > 1 ? "MAIS" : "MENOS";
    if (k === "ou25") return g > 2 ? "MAIS" : "MENOS";
    if (k === "ou35" || k === "over35") return g > 3 ? "MAIS" : "MENOS";
    if (k === "gols") return String(Math.min(5, g));
    if (k === "exato") return r?.placar || null;
    if (k === "bm") return r.golsCasa > 0 && r.golsFora > 0 ? "SIM" : "NÃO";
    if (k === "r12") return r.golsCasa > r.golsFora ? "1" : r.golsCasa < r.golsFora ? "2" : "X";
    return null;
  },

  _faixaGap(min) {
    if (!Number.isFinite(min)) return "SEM_ANTERIOR";
    if (min <= 3) return "3";
    if (min <= 6) return "4-6";
    if (min <= 9) return "7-9";
    if (min <= 15) return "10-15";
    if (min <= 30) return "16-30";
    if (min <= 60) return "31-60";
    return "61+";
  },

  _faixaSlots(n) {
    if (!Number.isFinite(n) || n <= 0) return "0";
    if (n === 1) return "1";
    if (n <= 3) return "2-3";
    if (n <= 6) return "4-6";
    if (n <= 10) return "7-10";
    return "11+";
  },

  _faixaRitmo(media) {
    if (!Number.isFinite(media)) return "SEM_RITMO";
    if (media <= 3.5) return "CONTINUO";
    if (media <= 6.5) return "RAPIDO";
    if (media <= 12) return "MODERADO";
    if (media <= 30) return "LENTO";
    return "MUITO_LENTO";
  },

  _chavesHorario(t) {
    if (!t?.data || !t?.horario) return {};
    const [h, m] = String(t.horario).split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return {};
    const minuto = h * 60 + m;
    const periodo = h < 6 ? "MADRUGADA" : h < 12 ? "MANHÃ" : h < 18 ? "TARDE" : "NOITE";
    const diaSemana = new Date(`${t.data}T12:00:00Z`).getUTCDay();
    const faixa = (n) => Math.floor(minuto / n) * n;
    return {
      exato: `EXATO:${t.horario}`,
      slot3: `3MIN:${String(Math.floor(minuto / 3) * 3).padStart(4, "0")}`,
      faixa15: `15MIN:${String(faixa(15)).padStart(4, "0")}`,
      faixa30: `30MIN:${String(faixa(30)).padStart(4, "0")}`,
      faixa60: `1H:${String(faixa(60)).padStart(4, "0")}`,
      faixa120: `2H:${String(faixa(120)).padStart(4, "0")}`,
      minutoHora: `MINUTO_HORA:${String(Math.floor(m / 15) * 15).padStart(2, "0")}`,
      periodo: `PERIODO:${periodo}`,
      semana: `SEMANA:${diaSemana}`
    };
  },

  _contexto(anteriores, k, alvoTemporal) {
    const lista = this._ordenar(anteriores);
    const horario = this._chavesHorario(alvoTemporal);
    const alvoMin = this._minutosAbsolutos(alvoTemporal);
    const ultimo = lista.at(-1) || null;
    const ultimoMin = ultimo ? this._minutosAbsolutos(ultimo._temporal) : null;
    const gapMin = Number.isFinite(alvoMin) && Number.isFinite(ultimoMin) ? Math.max(0, alvoMin - ultimoMin) : null;
    const slotsSemResultado = Number.isFinite(gapMin) ? Math.max(0, Math.floor(gapMin / 3) - 1) : 0;

    const gaps = [];
    for (let i = Math.max(1, lista.length - 6); i < lista.length; i++) {
      const a = this._minutosAbsolutos(lista[i - 1]?._temporal);
      const b = this._minutosAbsolutos(lista[i]?._temporal);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) gaps.push(b - a);
    }
    const ultimos5 = gaps.slice(-5);
    const mediaGap5 = ultimos5.length ? ultimos5.reduce((s, n) => s + n, 0) / ultimos5.length : null;
    const mediaAnterior = ultimos5.length > 1 ? ultimos5.slice(0, -1).reduce((s, n) => s + n, 0) / (ultimos5.length - 1) : null;
    let tendenciaRitmo = "SEM_TENDENCIA";
    if (Number.isFinite(gapMin) && Number.isFinite(mediaAnterior) && mediaAnterior > 0) {
      if (gapMin >= mediaAnterior * 1.5) tendenciaRitmo = "DESACELEROU";
      else if (gapMin <= mediaAnterior * 0.7) tendenciaRitmo = "ACELEROU";
      else tendenciaRitmo = "ESTAVEL";
    }

    const ultimoValor = ultimo ? this._resultadoMercado(ultimo, k) : null;
    let corrida = 0;
    if (ultimoValor != null) {
      for (let i = lista.length - 1; i >= 0; i--) {
        if (this._resultadoMercado(lista[i], k) !== ultimoValor) break;
        corrida++;
      }
    }

    const ausencia = {};
    for (const valor of this._valoresMercado(k)) {
      let achou = null;
      for (let i = lista.length - 1; i >= 0; i--) {
        if (this._resultadoMercado(lista[i], k) === valor) {
          achou = this._minutosAbsolutos(lista[i]._temporal);
          break;
        }
      }
      ausencia[valor] = Number.isFinite(alvoMin) && Number.isFinite(achou) ? Math.max(0, alvoMin - achou) : null;
    }

    const chaves = {
      ...horario,
      gap: `GAP:${this._faixaGap(gapMin)}`,
      slotsVazios: `SLOTS_SEM_RESULTADO:${this._faixaSlots(slotsSemResultado)}`,
      ritmo5: `RITMO5:${this._faixaRitmo(mediaGap5)}`,
      tendenciaRitmo: `TENDENCIA_RITMO:${tendenciaRitmo}`,
      ultimoValor: ultimoValor == null ? null : `ULTIMO:${ultimoValor}`,
      corrida: ultimoValor == null ? null : `CORRIDA:${ultimoValor}:${Math.min(corrida, 6)}${corrida > 6 ? "+" : ""}`
    };
    for (const [valor, min] of Object.entries(ausencia)) {
      chaves[`ausencia_${valor}`] = `AUSENCIA:${valor}:${this._faixaGap(min)}`;
    }

    return { chaves, gapMin, slotsSemResultado, mediaGap5, tendenciaRitmo, ultimoValor, corrida, ausencia };
  },

  _assinatura(resultados, k) {
    const lista = this._ordenar(resultados);
    const u = lista.at(-1);
    return `${k}|${lista.length}|${u ? this._chaveTemporal(u) : "-"}|${u?.placar || "-"}`;
  },

  _construirGrupos(resultados, k) {
    const assinatura = this._assinatura(resultados, k);
    if (this._cache.has(assinatura)) return this._cache.get(assinatura);

    const lista = this._ordenar(resultados);
    const grupos = {};
    for (let i = 1; i < lista.length; i++) {
      const alvo = lista[i];
      const valor = this._resultadoMercado(alvo, k);
      if (valor == null) continue;
      const ctx = this._contexto(lista.slice(0, i), k, alvo._temporal);
      for (const [tipo, chave] of Object.entries(ctx.chaves)) {
        if (!chave) continue;
        const g = grupos[chave] || (grupos[chave] = { tipo, chave, total: 0, contagem: {} });
        g.total++;
        g.contagem[valor] = (g.contagem[valor] || 0) + 1;
      }
    }

    const pacote = { assinatura, lista, grupos };
    this._cache.set(assinatura, pacote);
    // Evita crescimento infinito se o app ficar aberto por muitos dias.
    if (this._cache.size > 60) this._cache.delete(this._cache.keys().next().value);
    return pacote;
  },

  _pesoTipo(tipo) {
    if (String(tipo).startsWith("ausencia_")) return 1.30;
    if (["gap", "slotsVazios", "ritmo5", "tendenciaRitmo", "corrida"].includes(tipo)) return 1.22;
    if (tipo === "ultimoValor") return 1.12;
    if (["faixa15", "faixa30", "faixa60"].includes(tipo)) return 1.08;
    if (tipo === "exato" || tipo === "slot3") return 0.96;
    return 1;
  },

  analisar(resultados, k, proximo) {
    const base = Array.isArray(resultados) ? resultados : [];
    const timestamped = this._ordenar(base);
    const faltam = Math.max(0, this.MIN_AMOSTRA_EXIBIR - timestamped.length);
    const contexto = this._contexto(timestamped, k, proximo?._temporal || proximo);

    if (timestamped.length < this.MIN_AMOSTRA_EXIBIR) {
      return {
        disponivel: false,
        amostra: timestamped.length,
        faltam,
        modo: "coletando",
        contexto,
        sinais: [],
        forte: null,
        texto: `🕐 Temporal coletando dados: ${timestamped.length}/${this.MIN_AMOSTRA_EXIBIR} resultados com horário. ${Number.isFinite(contexto.gapMin) ? `Último registro há ${contexto.gapMin} min · ${contexto.slotsSemResultado} slot(s) sem resultado.` : ""}`.trim()
      };
    }

    const { grupos } = this._construirGrupos(timestamped, k);
    const sinais = [];
    for (const [tipo, chave] of Object.entries(contexto.chaves)) {
      if (!chave) continue;
      const g = grupos[chave];
      if (!g || g.total < this.MIN_SINAL) continue;
      const lista = Object.entries(g.contagem)
        .map(([valor, n]) => ({ valor, n, percentual: n / g.total * 100 }))
        .sort((a, b) => b.n - a.n);
      const top = lista[0];
      if (!top) continue;
      const confianca = top.percentual * Math.log2(g.total + 1) * this._pesoTipo(tipo);
      sinais.push({ tipo, chave, tendencia: top.valor, percentual: top.percentual, amostra: g.total, confianca });
    }

    sinais.sort((a, b) => b.confianca - a.confianca || b.percentual - a.percentual || b.amostra - a.amostra);
    const fortes = sinais.filter(x => x.amostra >= this.MIN_SINAL_FORTE && x.percentual >= this.PCT_SINAL_FORTE);

    // Consenso: evita confiar em um único recorte isolado. Soma confiança por lado.
    const consenso = {};
    for (const s of sinais.slice(0, 12)) {
      const peso = (s.percentual / 100) * Math.log2(s.amostra + 1) * this._pesoTipo(s.tipo);
      consenso[s.tendencia] = (consenso[s.tendencia] || 0) + peso;
    }
    const ranking = Object.entries(consenso).sort((a, b) => b[1] - a[1]);
    const consensoTop = ranking[0]?.[0] || null;
    const forte = fortes.find(s => s.tendencia === consensoTop) || fortes[0] || null;

    const partes = [];
    if (Number.isFinite(contexto.gapMin)) partes.push(`último resultado há ${contexto.gapMin} min`);
    partes.push(`${contexto.slotsSemResultado} slot(s) sem resultado`);
    if (Number.isFinite(contexto.mediaGap5)) partes.push(`ritmo médio ${contexto.mediaGap5.toFixed(1)} min`);
    if (contexto.tendenciaRitmo !== "SEM_TENDENCIA") partes.push(contexto.tendenciaRitmo.toLowerCase());

    return {
      disponivel: true,
      amostra: timestamped.length,
      faltamFiltro: Math.max(0, this.MIN_AMOSTRA_FILTRO - timestamped.length),
      modo: timestamped.length >= this.MIN_AMOSTRA_FILTRO ? "ativo" : "observacao",
      contexto,
      sinais,
      fortes,
      forte,
      consenso: ranking,
      texto: forte
        ? `🕐 Temporal: ${forte.tendencia} em destaque (${forte.percentual.toFixed(1)}% / ${forte.amostra} casos) · ${partes.join(" · ")}.`
        : `🕐 Temporal sem consenso forte · ${partes.join(" · ")}.`
    };
  },

  _aplicarFiltro(m, temporal) {
    if (!m || !temporal) return m;
    m.temporal = temporal;
    if (!(m.ativo && m.palpite) || !temporal.disponivel || !temporal.forte) return m;

    const previsto = String(m.palpite.valor);
    const forte = temporal.forte;
    const apoia = String(forte.tendencia) === previsto;
    temporal.acao = apoia ? "apoia" : "contraria";

    const podeVetar = temporal.amostra >= this.MIN_AMOSTRA_FILTRO &&
      forte.amostra >= this.MIN_VETO && forte.percentual >= this.PCT_VETO;

    if (!apoia && podeVetar) {
      m.palpiteAntesTemporal = { ...m.palpite };
      m.bloqueadoTemporal = true;
      m.motivoBloqueioTemporal = `Temporal contrário: ${forte.tendencia} ${forte.percentual.toFixed(1)}% em ${forte.amostra} casos`;
      m.palpite = null;
      m.ativo = false;
      temporal.acao = "veto";
      temporal.texto += " ⛔ Filtro temporal evitou esta entrada.";
    } else if (apoia) {
      temporal.texto += " ✅ Horário/ritmo apoiam o palpite principal.";
    }
    return m;
  },

  anexar(resultados, mercados, proximo) {
    for (const [k, m] of Object.entries(mercados || {})) {
      const temporal = this.analisar(resultados, k, proximo);
      this._aplicarFiltro(m, temporal);
    }
    return mercados;
  }
};
