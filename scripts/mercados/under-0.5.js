"use strict";

/*
 * ESPECIALISTA O/U 0.5 — FOCO U0.5
 *
 * Regras principais:
 *  - olha SOMENTE a sequência binária O/U 0.5;
 *  - 0x0 = UNDER 0.5 (MENOS), qualquer outro placar = OVER 0.5 (MAIS);
 *  - depois da trava inicial da sessão, SEMPRE escolhe um lado (100% chamada);
 *  - o objetivo raro é U0.5: sinais de Under recebem prioridade, mas não há
 *    promessa de acerto; quando a evidência de Under não é suficiente, chama O;
 *  - padrões binários são evidência auxiliar, não ordem obrigatória.
 */
const MercadoUnder05 = {
  nome: "Especialista O/U 0.5 (foco U0.5)",

  transformar(r) {
    return Number(r?.totalGols) === 0 ? "MENOS" : "MAIS";
  },

  rotulo(v) {
    return v === "MENOS" ? "Under 0.5" : "Over 0.5";
  },

  _taxaUnder(serie, prior = 0.10, forcaPrior = 10) {
    const lista = Array.isArray(serie) ? serie : [];
    const n = lista.length;
    const u = lista.filter(v => v === "MENOS").length;
    return (u + prior * forcaPrior) / Math.max(1, n + forcaPrior);
  },

  _padroes(serie, contextoAtual, taxaBase) {
    const atual = Array.isArray(contextoAtual) ? contextoAtual : [];
    const candidatos = [];
    const max = Math.min(8, atual.length, Math.max(0, serie.length - 1));

    for (let tamanho = 1; tamanho <= max; tamanho++) {
      const contexto = atual.slice(-tamanho);
      const ocorrencias = Padroes.encontrarOcorrencias(serie, contexto);
      if (ocorrencias.length < 4) continue;

      const seguintes = ocorrencias.map(o => serie[o.proximoIndice]).filter(Boolean);
      const under = seguintes.filter(v => v === "MENOS").length;
      const total = seguintes.length;
      const taxaBruta = total ? under / total : taxaBase;
      // Suavização para um padrão curto/pequeno não dominar o especialista.
      const taxaSuavizada = (under + taxaBase * 12) / (total + 12);
      const peso = Math.pow(tamanho, 1.25) * Math.min(1, total / 12);

      candidatos.push({
        tamanho,
        contexto: [...contexto],
        ocorrencias,
        total,
        under,
        over: total - under,
        taxaBruta,
        taxaSuavizada,
        peso
      });
    }

    if (!candidatos.length) {
      return { taxa: taxaBase, melhor: null, candidatos: [] };
    }

    const somaPeso = candidatos.reduce((s, x) => s + x.peso, 0) || 1;
    const taxa = candidatos.reduce((s, x) => s + x.taxaSuavizada * x.peso, 0) / somaPeso;
    const melhor = [...candidatos].sort((a, b) =>
      b.tamanho - a.tamanho || b.total - a.total || b.taxaBruta - a.taxaBruta
    )[0];

    return { taxa, melhor, candidatos };
  },

  _taxaPorSequenciaOver(serie, contextoAtual, taxaBase) {
    const atual = Array.isArray(contextoAtual) ? contextoAtual : [];
    let corrida = 0;
    for (let i = atual.length - 1; i >= 0 && atual[i] === "MAIS"; i--) corrida++;

    const alvo = Math.min(corrida, 12);
    const seguintes = [];
    let run = 0;

    // Estuda somente O/U: qual foi o resultado depois de uma corrida de Over
    // do mesmo tamanho (12 representa 12 ou mais).
    for (const v of serie) {
      if (Math.min(run, 12) === alvo) seguintes.push(v);
      run = v === "MAIS" ? run + 1 : 0;
    }

    return {
      corrida,
      amostra: seguintes.length,
      taxa: seguintes.length
        ? this._taxaUnder(seguintes, taxaBase, 15)
        : taxaBase
    };
  },

  analisar(resultados, contextoAtual = resultados) {
    const base = Array.isArray(resultados) ? resultados : [];
    const atualBruto = Array.isArray(contextoAtual) ? contextoAtual : [];

    // A partir daqui, o especialista não enxerga placares: só MAIS/MENOS.
    const serie = base.map(r => this.transformar(r));
    const atual = atualBruto.map(r => this.transformar(r));

    const frequenciasHistorico = Padroes.frequencias(serie, ["MAIS", "MENOS"]);

    if (!serie.length) {
      return {
        ativo: false,
        sempreChama: true,
        focoUnder: true,
        palpite: null,
        probabilidades: { MAIS: 0, MENOS: 0 },
        alertaUnder: { nivel: "SEM DADOS", indice: 0 },
        padrao: { encontrado: false, contexto: [], tamanho: 0, ocorrencias: [], amostra: [], qualificado: false },
        frequencias: Padroes.frequencias([], ["MAIS", "MENOS"]),
        frequenciasHistorico,
        metodo: "especialista-ou05-binario-foco-under-v1"
      };
    }

    const taxaBase = this._taxaUnder(serie, 0.10, 10);
    const taxa30 = this._taxaUnder(serie.slice(-30), taxaBase, 8);
    const taxa80 = this._taxaUnder(serie.slice(-80), taxaBase, 12);
    const padroes = this._padroes(serie, atual, taxaBase);
    const corrida = this._taxaPorSequenciaOver(serie, atual, taxaBase);

    // Mistura análise estatística + padrões binários. O padrão pesa, porém
    // nunca é obedecido sozinho: ele apenas ajuda a decidir se vale elevar
    // o alerta do evento raro U0.5.
    let pUnder =
      taxaBase * 0.34 +
      taxa30 * 0.22 +
      taxa80 * 0.10 +
      padroes.taxa * 0.24 +
      corrida.taxa * 0.10;

    pUnder = Math.max(0.005, Math.min(0.45, pUnder));

    const melhor = padroes.melhor;
    const sinais = [
      taxa30 >= taxaBase * 1.20,
      padroes.taxa >= taxaBase * 1.20,
      corrida.taxa >= taxaBase * 1.25
    ].filter(Boolean).length;

    const padraoUnderForte = Boolean(
      melhor &&
      melhor.tamanho >= 3 &&
      melhor.total >= 8 &&
      melhor.taxaBruta >= Math.max(0.24, taxaBase * 2.00)
    );

    // Threshold assimétrico: Under é raro, então não exigimos >50% para
    // reconhecer um risco de U0.5. Mesmo assim pedimos evidências múltiplas
    // para não transformar o especialista em um gerador de Under aleatório.
    const limiteUnder = Math.max(0.16, taxaBase * 1.50);
    const escolherUnder =
      (padraoUnderForte && pUnder >= taxaBase * 1.20) ||
      (pUnder >= limiteUnder && sinais >= 3);
    const valor = escolherUnder ? "MENOS" : "MAIS";

    const pctUnder = Number((pUnder * 100).toFixed(1));
    const pctOver = Number((100 - pctUnder).toFixed(1));
    const riscoRelativo = taxaBase > 0 ? pUnder / taxaBase : 1;
    const indiceUnder = Number(Math.max(0, Math.min(100, 50 + (riscoRelativo - 1) * 80)).toFixed(0));
    const nivel = escolherUnder
      ? (padraoUnderForte ? "FORTE" : "ATIVO")
      : (riscoRelativo >= 1.10 ? "ATENÇÃO" : "BAIXO");

    const amostraPadrao = melhor
      ? Array(melhor.under).fill("MENOS").concat(Array(melhor.over).fill("MAIS"))
      : [];

    return {
      ativo: true,             // depois da trava dos 3 resultados, sempre chama
      sempreChama: true,
      focoUnder: true,
      palpite: {
        valor,
        // Probabilidade do lado escolhido, não uma promessa de acerto.
        percentual: valor === "MENOS" ? pctUnder : pctOver
      },
      probabilidades: { MAIS: pctOver, MENOS: pctUnder },
      alertaUnder: {
        nivel,
        indice: indiceUnder,
        sinais,
        taxaBase: Number((taxaBase * 100).toFixed(1)),
        taxa30: Number((taxa30 * 100).toFixed(1)),
        taxa80: Number((taxa80 * 100).toFixed(1)),
        taxaPadrao: Number((padroes.taxa * 100).toFixed(1)),
        taxaCorrida: Number((corrida.taxa * 100).toFixed(1)),
        corridaOver: corrida.corrida,
        amostraCorrida: corrida.amostra
      },
      padrao: melhor ? {
        encontrado: true,
        contexto: [...melhor.contexto],
        tamanho: melhor.tamanho,
        ocorrencias: melhor.ocorrencias,
        amostra: amostraPadrao,
        percentual: Number((melhor.taxaBruta * 100).toFixed(1)),
        taxaUnder: Number((melhor.taxaBruta * 100).toFixed(1)),
        qualificado: padraoUnderForte,
        apenasAuxiliar: true
      } : {
        encontrado: false,
        contexto: atual.slice(-Math.min(8, atual.length)),
        tamanho: 0,
        ocorrencias: [],
        amostra: [],
        percentual: 0,
        taxaUnder: 0,
        qualificado: false,
        apenasAuxiliar: true
      },
      frequencias: {
        total: 1000,
        mapa: { MAIS: Math.round(pctOver * 10), MENOS: Math.round(pctUnder * 10) },
        lista: [
          { valor: "MAIS", quantidade: Math.round(pctOver * 10), percentual: pctOver },
          { valor: "MENOS", quantidade: Math.round(pctUnder * 10), percentual: pctUnder }
        ].sort((a, b) => b.percentual - a.percentual)
      },
      frequenciasHistorico,
      evidencias: padroes.candidatos,
      metodo: "especialista-ou05-binario-foco-under-v1"
    };
  }
};
