"use strict";

/*
 * ESPECIALISTA OVER 3.5 — DISTÂNCIA DESDE O ÚLTIMO OVER
 *
 * Este mercado ignora placar exato e trabalha SOMENTE com a série binária:
 *   MAIS  = 4 ou mais gols (Over 3.5)
 *   MENOS = 0 a 3 gols     (Under 3.5)
 *
 * Gatilhos obtidos no teste fora da amostra:
 *   - exatamente 5 MENOS consecutivos desde o último MAIS;
 *   - de 10 a 13 MENOS consecutivos desde o último MAIS.
 *
 * A sequência exata de O/U é usada apenas como confirmação informativa;
 * ela NÃO dispara entrada sozinha.
 */
const MercadoOver35 = {
  nome: "Especialista O3.5",
  ALVO: "MAIS",
  METODO: "o35-distancia-desde-ultimo-over-v1",

  transformar(r) {
    const g = Number(r?.totalGols);
    return Number.isFinite(g) && g >= 4 ? "MAIS" : "MENOS";
  },

  rotulo(v) {
    return v === "MAIS" ? "Mais de 3.5" : "Menos de 3.5";
  },

  _ehPlacar(x) {
    const p = typeof x === "string" ? x : x?.placar;
    return typeof p === "string" && /^\d+x\d+$/i.test(p.trim());
  },

  _labelBruto(x) {
    if (!this._ehPlacar(x)) return null;
    const p = typeof x === "string" ? x : x.placar;
    const [a, b] = p.toLowerCase().split("x").map(Number);
    return a + b >= 4 ? "MAIS" : "MENOS";
  },

  _minutosTemporal(t) {
    if (!t?.data || !t?.horario) return null;
    const [h, m] = String(t.horario).split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const dia = Date.parse(`${t.data}T00:00:00Z`);
    if (!Number.isFinite(dia)) return null;
    return Math.floor(dia / 60000) + h * 60 + m;
  },

  /*
   * Reconstrói a parte do backup com PAUSAS quando for possível, sem olhar
   * resultados futuros durante o backtest. Para resultados ao-vivo, qualquer
   * salto maior que 3 minutos cria uma QUEBRA (PAUSA/VAZIO/sessão diferente).
   */
  _serieComQuebras(resultados) {
    const lista = Array.isArray(resultados) ? resultados : [];
    const serie = [];

    const backupResultados = lista.filter(r => r?.fonte !== "ao-vivo");
    const aoVivo = lista.filter(r => r?.fonte === "ao-vivo");

    let usouBackupBruto = false;
    try {
      if (typeof Historico !== "undefined" && typeof Historico.obterDadosBrutos === "function" && backupResultados.length) {
        const bruto = Historico.obterDadosBrutos();
        const placaresEsperados = backupResultados.map(r => r?.placar).filter(Boolean);
        const placaresBruto = [];
        const prefixo = [];

        for (const item of bruto) {
          if (item === "PAUSA") {
            prefixo.push("QUEBRA");
            continue;
          }
          if (!this._ehPlacar(item)) continue;
          const p = typeof item === "string" ? item : item.placar;
          placaresBruto.push(p);
          prefixo.push(this._labelBruto(item));
          if (placaresBruto.length >= placaresEsperados.length) break;
        }

        const confere = placaresBruto.length === placaresEsperados.length &&
          placaresBruto.every((p, i) => p === placaresEsperados[i]);

        if (confere) {
          while (prefixo[0] === "QUEBRA") prefixo.shift();
          while (prefixo.at(-1) === "QUEBRA") prefixo.pop();
          serie.push(...prefixo);
          usouBackupBruto = true;
        }
      }
    } catch (_) {}

    if (!usouBackupBruto) {
      for (const r of backupResultados) serie.push(this.transformar(r));
    }

    let anteriorMin = null;
    for (const r of aoVivo) {
      const atualMin = this._minutosTemporal(r?._temporal);
      if (anteriorMin !== null && atualMin !== null && atualMin - anteriorMin > 3) {
        if (serie.at(-1) !== "QUEBRA") serie.push("QUEBRA");
      }
      serie.push(this.transformar(r));
      anteriorMin = atualMin;
    }

    while (serie[0] === "QUEBRA") serie.shift();
    while (serie.at(-1) === "QUEBRA") serie.pop();
    return serie;
  },

  _corridaAtual(serie) {
    let corrida = 0;
    for (let i = serie.length - 1; i >= 0; i--) {
      const v = serie[i];
      if (v === "QUEBRA" || v === "MAIS") break;
      if (v === "MENOS") corrida++;
    }
    return corrida;
  },

  _faixa(corrida) {
    if (corrida === 5) return "5";
    if (corrida >= 10 && corrida <= 13) return "10-13";
    return null;
  },

  _estatisticasPorFaixa(serie) {
    const faixas = {
      "5": { total: 0, over: 0 },
      "10-13": { total: 0, over: 0 }
    };
    let corrida = 0;

    for (const valor of serie) {
      if (valor === "QUEBRA") {
        corrida = 0;
        continue;
      }

      const faixa = this._faixa(corrida);
      if (faixa) {
        faixas[faixa].total++;
        if (valor === "MAIS") faixas[faixa].over++;
      }

      corrida = valor === "MAIS" ? 0 : corrida + 1;
    }

    for (const x of Object.values(faixas)) {
      x.taxa = x.total ? x.over / x.total : 0;
    }
    return faixas;
  },

  _confirmacaoSequencia(serie, tamanho = 3) {
    const limpa = [];
    for (let i = serie.length - 1; i >= 0 && limpa.length < tamanho; i--) {
      if (serie[i] === "QUEBRA") break;
      limpa.unshift(serie[i]);
    }
    if (limpa.length < 2) return { contexto: limpa, total: 0, over: 0, taxa: 0 };

    let total = 0, over = 0;
    for (let i = 0; i + limpa.length < serie.length; i++) {
      let ok = true;
      for (let j = 0; j < limpa.length; j++) {
        if (serie[i + j] !== limpa[j]) { ok = false; break; }
      }
      if (!ok) continue;
      const prox = serie[i + limpa.length];
      if (prox === "QUEBRA") continue;
      total++;
      if (prox === "MAIS") over++;
    }
    return { contexto: limpa, total, over, taxa: total ? over / total : 0 };
  },

  analisar(resultados) {
    const base = Array.isArray(resultados) ? resultados : [];
    const alvos = base.map(r => this.transformar(r));
    const frequenciasHistorico = typeof Padroes !== "undefined"
      ? Padroes.frequencias(alvos, ["MAIS", "MENOS"])
      : { lista: [] };

    if (base.length < 12) {
      return {
        ativo: false,
        especialista: true,
        independente: true,
        palpite: null,
        padrao: { encontrado: false, contexto: [], tamanho: 0, ocorrencias: [], amostra: [], percentual: 0, qualificado: false },
        frequencias: frequenciasHistorico,
        frequenciasHistorico,
        evidencias: [],
        corridaUnder: 0,
        faixaAtual: null,
        metodo: this.METODO
      };
    }

    const serie = this._serieComQuebras(base);
    const corrida = this._corridaAtual(serie);
    const faixa = this._faixa(corrida);
    const stats = this._estatisticasPorFaixa(serie);
    const confirmacao = this._confirmacaoSequencia(serie, 3);
    const escolhido = faixa ? stats[faixa] : null;

    // Regra operacional do teste: O3.5 é chamado SOMENTE nas distâncias
    // 5 e 10–13 desde o último Over 3.5. Fora delas, aguarda.
    const chamado = Boolean(faixa);
    const taxaFaixa = escolhido?.taxa || 0;
    const percentual = Number((taxaFaixa * 100).toFixed(1));

    const amostra = escolhido
      ? Array(escolhido.over).fill("MAIS").concat(Array(escolhido.total - escolhido.over).fill("MENOS"))
      : [];
    const frequencias = typeof Padroes !== "undefined"
      ? Padroes.frequencias(amostra, ["MAIS", "MENOS"])
      : frequenciasHistorico;

    const ocorrencias = escolhido
      ? Array.from({ length: escolhido.total }, (_, i) => ({ indice: i, proximoIndice: i + 1 }))
      : [];

    return {
      ativo: chamado,
      especialista: true,
      independente: true,
      palpite: chamado ? {
        valor: "MAIS",
        quantidade: escolhido?.over || 0,
        percentual
      } : null,
      padrao: chamado ? {
        encontrado: true,
        contexto: [`${corrida} U3.5 consecutivos`],
        tamanho: corrida,
        ocorrencias,
        amostra,
        percentual,
        qualificado: true,
        faixa,
        corridaUnder: corrida,
        confirmacaoSequencia: confirmacao
      } : {
        encontrado: false,
        contexto: [`${corrida} U3.5 consecutivos`],
        tamanho: corrida,
        ocorrencias: [],
        amostra: [],
        percentual: 0,
        qualificado: false,
        faixa: null,
        corridaUnder: corrida,
        confirmacaoSequencia: confirmacao
      },
      frequencias,
      frequenciasHistorico,
      evidencias: [
        { faixa: "5", ...stats["5"] },
        { faixa: "10-13", ...stats["10-13"] },
        { tipo: "confirmacao-sequencia", ...confirmacao }
      ],
      corridaUnder: corrida,
      faixaAtual: faixa,
      metodo: this.METODO
    };
  }
};
