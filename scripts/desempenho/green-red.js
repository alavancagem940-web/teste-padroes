"use strict";

const GreenRed = {
  _cache: { assinatura: null, avaliacoes: new Map() },

  _valorReal(k, alvo) {
    if (!alvo) return null;
    if (k === "exato") return alvo.placar || null;
    if (k === "gols") return String(Math.min(5, Number(alvo.totalGols)));
    if (k === "r12") return alvo.golsCasa > alvo.golsFora ? "1" : (alvo.golsCasa === alvo.golsFora ? "X" : "2");
    if (k === "bm") return alvo.golsCasa > 0 && alvo.golsFora > 0 ? "SIM" : "NÃO";
    const linha = ({ou05:0.5, under05:0.5, ou15:1.5, ou25:2.5, ou35:3.5, over35:3.5})[k];
    if (linha == null) return null;
    return Number(alvo.totalGols) > linha ? "MAIS" : "MENOS";
  },

  _rotularAvaliacao(alvo) {
    const chaves = ["exato","gols","r12","bm","ou05","under05","ou15","ou25","ou35","over35"];
    return Object.fromEntries(chaves.map(k => [k, this._valorReal(k, alvo)]));
  },

  _assinatura(r) {
    return r.map(x => `${x.id || ""}:${x.placar || ""}`).join("|");
  },

  _prepararCache(r) {
    const assinatura = this._assinatura(r);

    if (this._cache.assinatura !== assinatura) {
      const anteriorAssinatura = this._cache.assinatura || "";

      const somenteAppend =
        anteriorAssinatura &&
        assinatura.startsWith(anteriorAssinatura) &&
        (
          assinatura.length === anteriorAssinatura.length ||
          assinatura.charAt(anteriorAssinatura.length) === "|"
        );

      if (!somenteAppend) {
        this._cache.avaliacoes.clear();
      }

      this._cache.assinatura = assinatura;
    }
  },

  _inicioContagem(r) {
    // O histórico/backup inteiro é somente BASE DE ESTUDO.
    // Os indicadores GREEN/RED da sessão atual começam zerados.
    // Os 3 primeiros resultados novos servem apenas para formar o contexto.
    // A primeira previsão é feita para o 4º resultado novo; portanto,
    // a primeira avaliação possível é o índice base + 3.
    const base = Number(Historico?.obterQuantidadeBaseEstudo?.() ?? 0);
    if (!Number.isFinite(base) || base < 0) return 1;
    return Math.min(r.length, base + 3);
  },

  avaliarPalpiteRegistrado(alvo, registro) {
    if (!alvo || !registro?.palpites) return null;
    const p = registro.palpites;
    const res = { previsoes: {}, valoresPrevistos: {}, reais: this._rotularAvaliacao(alvo) };
    const ativo = k => p[k] && p[k].valor != null;

    if (ativo("exato")) {
      res.exato = p.exato.valor === alvo.placar;
      res.previsoes.exato = p.exato.valor;
      res.valoresPrevistos.exato = p.exato.valor;
    }
    if (ativo("gols")) {
      const previsto = Number(p.gols.valor);
      res.gols = previsto === 5 ? alvo.totalGols >= 5 : previsto === alvo.totalGols;
      res.previsoes.gols = p.gols.valor;
      res.valoresPrevistos.gols = String(p.gols.valor);
    }
    if (ativo("r12")) {
      const v = p.r12.valor;
      res.r12 = (v === "1" && alvo.golsCasa > alvo.golsFora) ||
        (v === "X" && alvo.golsCasa === alvo.golsFora) ||
        (v === "2" && alvo.golsCasa < alvo.golsFora);
      res.previsoes.r12 = typeof MercadoResultado1X2 !== "undefined" ? MercadoResultado1X2.rotulo(v) : v;
      res.valoresPrevistos.r12 = v;
    }
    if (ativo("bm")) {
      const v = p.bm.valor === "SIM";
      res.bm = v === (alvo.golsCasa > 0 && alvo.golsFora > 0);
      res.previsoes.bm = p.bm.valor;
      res.valoresPrevistos.bm = p.bm.valor;
    }
    for (const [k, linha] of [["ou05",0.5],["under05",0.5],["ou15",1.5],["ou25",2.5],["ou35",3.5],["over35",3.5]]) {
      if (!ativo(k)) continue;
      const v = p[k].valor;
      res[k] = v === "MAIS" ? alvo.totalGols > linha : alvo.totalGols < linha;
      res.previsoes[k] = v === "MAIS" ? `Mais de ${linha}` : `Menos de ${linha}`;
      res.valoresPrevistos[k] = v;
    }
    return res;
  },

  avaliarPrevisao(resultados, indice) {
    if (!Array.isArray(resultados) || indice <= 0 || indice >= resultados.length) {
      return null;
    }

    const alvo = resultados[indice];
    const m = Previsoes.gerar(resultados.slice(0, indice)).mercados;
    const ativo = k => m[k]?.ativo && m[k]?.palpite;
    const res = { previsoes: {}, valoresPrevistos: {}, reais: this._rotularAvaliacao(alvo) };

    if (ativo("exato")) {
      res.exato = m.exato.palpite.valor === alvo.placar;
      res.previsoes.exato = m.exato.palpite.valor;
      res.valoresPrevistos.exato = m.exato.palpite.valor;
    }

    if (ativo("gols")) {
      const previstoGols = Number(m.gols.palpite.valor);
      res.gols = previstoGols === 5 ? alvo.totalGols >= 5 : previstoGols === alvo.totalGols;
      res.previsoes.gols = m.gols.palpite.valor;
      res.valoresPrevistos.gols = String(m.gols.palpite.valor);
    }

    if (ativo("r12")) {
      const v = m.r12.palpite.valor;
      res.r12 = (v === "1" && alvo.golsCasa > alvo.golsFora) ||
        (v === "X" && alvo.golsCasa === alvo.golsFora) ||
        (v === "2" && alvo.golsCasa < alvo.golsFora);
      res.previsoes.r12 = MercadoResultado1X2.rotulo(v);
      res.valoresPrevistos.r12 = v;
    }

    if (ativo("bm")) {
      const v = m.bm.palpite.valor === "SIM";
      res.bm = v === (alvo.golsCasa > 0 && alvo.golsFora > 0);
      res.previsoes.bm = m.bm.palpite.valor;
      res.valoresPrevistos.bm = m.bm.palpite.valor;
    }

    for (const [k, linha] of [["ou05",0.5],["under05",0.5],["ou15",1.5],["ou25",2.5],["ou35",3.5],["over35",3.5]]) {
      if (!ativo(k)) continue;
      const v = m[k].palpite.valor;
      res[k] = v === "MAIS" ? alvo.totalGols > linha : alvo.totalGols < linha;
      res.previsoes[k] = v === "MAIS" ? `Mais de ${linha}` : `Menos de ${linha}`;
      res.valoresPrevistos[k] = v;
    }

    return res;
  },

  _avaliacaoCache(r, indice) {
    this._prepararCache(r);

    if (!this._cache.avaliacoes.has(indice)) {
      this._cache.avaliacoes.set(indice, this.avaliarPrevisao(r, indice));
    }

    return this._cache.avaliacoes.get(indice);
  },

  resumo(r) {
    const chaves = [
      "exato", "ou05", "under05", "ou15", "ou25",
      "ou35", "over35", "bm", "r12", "gols"
    ];

    const vazio = () => ({
      atual: 0,
      tipo: null,
      greens: 0,
      reds: 0,
      totalGreens: 0,
      totalReds: 0,
      historico: []
    });

    if (!Array.isArray(r) || r.length < 2) {
      this._prepararCache(Array.isArray(r) ? r : []);
      return {
        anterior: null,
        sequencias: Object.fromEntries(chaves.map(k => [k, vazio()]))
      };
    }

    this._prepararCache(r);

    const historicos = Object.fromEntries(chaves.map(k => [k, []]));
    // Desempenho individual por resultado. Isso evita mascarar um mercado
    // forte em um lado e fraco no outro (ex.: Under bom, Over quase nunca chamado).
    const individuais = Object.fromEntries(chaves.map(k => [k, {}]));
    const garantir = (k, valor) => {
      if (valor == null) return null;
      const chave = String(valor);
      if (!individuais[k][chave]) individuais[k][chave] = {
        valor: chave, ocorrencias: 0, chamadas: 0, greens: 0, reds: 0, historico: []
      };
      return individuais[k][chave];
    };
    const categoriasFixas = {
      gols:["0","1","2","3","4","5"],
      r12:["1","X","2"],
      bm:["SIM","NÃO"],
      ou05:["MAIS","MENOS"], under05:["MAIS","MENOS"],
      ou15:["MAIS","MENOS"], ou25:["MAIS","MENOS"],
      ou35:["MENOS","MAIS"], over35:["MAIS","MENOS"]
    };
    for (const [k, valores] of Object.entries(categoriasFixas)) {
      for (const valor of valores) garantir(k, valor);
    }
    const inicio = this._inicioContagem(r);
    let anterior = null;

    for (let i = inicio; i < r.length; i++) {
      if (i <= 0) continue;

      let avaliacao = null;
      const alvo = r[i];
      const registrado = (typeof PalpitesRegistrados !== "undefined" && alvo?._temporal)
        ? PalpitesRegistrados.obterParaPartida(alvo._temporal)
        : null;
      avaliacao = registrado
        ? this.avaliarPalpiteRegistrado(alvo, registrado)
        : this._avaliacaoCache(r, i);

      if (i === r.length - 1) {
        anterior = avaliacao;
      }

      if (!avaliacao) continue;

      // Denominador da captura: quantas vezes cada resultado realmente ocorreu,
      // mesmo quando o mercado decidiu aguardar e não chamar.
      for (const k of chaves) {
        const real = avaliacao.reais?.[k] ?? this._valorReal(k, alvo);
        const itemReal = garantir(k, real);
        if (itemReal) itemReal.ocorrencias++;
      }

      for (const k of chaves) {
        if (typeof avaliacao[k] === "boolean") {
          const status = avaliacao[k] ? "GREEN" : "RED";
          historicos[k].push(status);
          const previsto = avaliacao.valoresPrevistos?.[k];
          const item = garantir(k, previsto);
          if (item) {
            item.chamadas++;
            item.historico.push(status);
            if (status === "GREEN") item.greens++; else item.reds++;
          }
        }
      }
    }

    if (r.length <= inicio) {
      anterior = null;
    }

    const sequencias = {};

    for (const k of chaves) {
      const h = historicos[k];
      const tipo = h.at(-1) || null;

      let atual = 0;
      for (let i = h.length - 1; i >= 0 && h[i] === tipo; i--) {
        atual++;
      }

      const totalGreens = h.filter(x => x === "GREEN").length;
      const totalReds = h.filter(x => x === "RED").length;

      sequencias[k] = {
        atual,
        tipo,
        greens: tipo === "GREEN" ? atual : 0,
        reds: tipo === "RED" ? atual : 0,
        totalGreens,
        totalReds,
        historico: h
      };

      const porResultado = {};
      const totalAvaliado = Object.values(individuais[k] || {}).reduce((soma,item)=>soma+(item.ocorrencias||0),0);
      for (const [valor, item] of Object.entries(individuais[k] || {})) {
        const chamadas = item.chamadas || 0;
        const ocorrencias = item.ocorrencias || 0;
        porResultado[valor] = {
          ...item,
          taxaChamada: totalAvaliado ? chamadas * 100 / totalAvaliado : 0,
          acerto: chamadas ? item.greens * 100 / chamadas : 0,
          captura: ocorrencias ? item.greens * 100 / ocorrencias : 0
        };
      }
      sequencias[k].porResultado = porResultado;

      // Compatibilidade com a tela antiga do especialista U0.5.
      if (k === "under05") {
        sequencias[k].porLado = {
          MAIS: porResultado.MAIS || {greens:0,reds:0,chamadas:0,ocorrencias:0,acerto:0,captura:0,historico:[]},
          MENOS: porResultado.MENOS || {greens:0,reds:0,chamadas:0,ocorrencias:0,acerto:0,captura:0,historico:[]}
        };
      }
    }


    return { anterior, sequencias, inicioContagem: inicio };
  },

  anterior(r) {
    return this.resumo(r).anterior;
  },

  obterSequenciaMercado(r, k) {
    return this.resumo(r).sequencias[k] || {
      atual: 0, tipo: null, greens: 0, reds: 0, historico: []
    };
  },

  obterSequenciasMercados(r) {
    return this.resumo(r).sequencias;
  },

  obterSequencia(r) {
    const s = this.obterSequenciaMercado(r, "exato");
    return {
      atual: s.atual,
      tipo: s.tipo,
      greensConsecutivos: s.greens,
      redsConsecutivos: s.reds,
      historico: s.historico
    };
  }
};
