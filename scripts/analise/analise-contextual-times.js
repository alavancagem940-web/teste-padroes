"use strict";

/*
 * TESTE — INTELIGÊNCIA CONTEXTUAL POR PARTIDA
 *
 * Usa SOMENTE dados que o próprio projeto já possui/coleta:
 * - mandante e visitante;
 * - últimos 10 jogos do mandante em casa (peso maior);
 * - últimos 10 jogos do visitante fora (peso maior);
 * - histórico completo de casa/fora (peso menor);
 * - confronto direto (qualquer mando e mesmo mando);
 * - momento recente das equipes;
 * - horário/faixas próximas;
 * - previsão sequencial já calculada pelo núcleo.
 *
 * A distribuição geral atua como prior. Recortes pequenos são encolhidos em
 * direção à média para evitar "100%" enganoso com 2 ou 3 ocorrências.
 * Cada mercado aprende a confiabilidade relativa das fontes no próprio
 * histórico associado a times. Se ainda não houver amostra suficiente, a
 * camada contextual não substitui a análise existente.
 */
const AnaliseContextualTimes = {
  MIN_RESULTADOS_COM_TIMES: 10,
  // H2H não é trava: entra apenas como mais uma evidência, com peso proporcional à amostra.
  MIN_CONFRONTOS_PARA_SUGERIR: 0,
  MIN_FONTE: 3,
  PRIOR_PADRAO: 12,
  JANELA_MOMENTO: 20,
  JANELA_FORMA_CONDICAO: 10,
  _cacheConfiabilidade: new Map(),
  _cacheHistoricoAssociado: { assinatura:"", hist:[] },
  _cacheRecortes: new Map(),
  _cachePrefixos: new Map(),
  _cacheAnalises: new Map(),

  _normTime(nome) {
    const n = String(nome || "").trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
    const aliases = {
      "islington": "arsenal", "arsenal fc": "arsenal",
      "aston": "aston villa", "aston vila": "aston villa",
      "man city": "manchester city", "city": "manchester city",
      "manchester utd": "manchester united", "man utd": "manchester united", "united": "manchester united",
      "palace": "crystal palace", "crystal palace fc": "crystal palace",
      "spurs": "tottenham", "tottenham hotspur": "tottenham",
      "wolves": "wolverhampton", "wolverhampton wanderers": "wolverhampton",
      "west ham united": "west ham", "norwich city": "norwich",
      "nottingham forest": "nottingham", "newcastle united": "newcastle",
      "leeds united": "leeds", "leicester city": "leicester",
      "brighton hove albion": "brighton", "afc bournemouth": "bournemouth"
    };
    return aliases[n] || n;
  },

  _minuto(horario) {
    const m = String(horario || "").match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  },

  _distMinuto(a, b) {
    const x = this._minuto(a), y = this._minuto(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Infinity;
    const d = Math.abs(x - y);
    return Math.min(d, 1440 - d);
  },

  _placar(v) {
    const m = String(v?.placar ?? v ?? "").trim().toLowerCase().match(/^(\d+)\s*x\s*(\d+)$/);
    if (!m) return null;
    const casa = Number(m[1]), fora = Number(m[2]);
    return { casa, fora, total: casa + fora, placar: `${casa}x${fora}` };
  },

  _valorMercado(item, k) {
    const p = this._placar(item);
    if (!p) return null;
    if (k === "exato") return p.placar;
    if (k === "gols") return String(Math.min(5, p.total));
    if (k === "r12") return p.casa > p.fora ? "1" : p.casa < p.fora ? "2" : "X";
    if (k === "bm") return p.casa > 0 && p.fora > 0 ? "SIM" : "NÃO";
    if (k === "ou05" || k === "under05") return p.total > 0 ? "MAIS" : "MENOS";
    if (k === "ou15") return p.total > 1 ? "MAIS" : "MENOS";
    if (k === "ou25") return p.total > 2 ? "MAIS" : "MENOS";
    if (k === "ou35" || k === "over35") return p.total > 3 ? "MAIS" : "MENOS";
    return null;
  },

  _opcoes(k, base) {
    if (k === "r12") return ["1", "X", "2"];
    if (k === "bm") return ["SIM", "NÃO"];
    if (k === "gols") return ["0", "1", "2", "3", "4", "5"];
    if (k === "under05") return ["MENOS"];
    if (k === "over35") return ["MAIS"];
    if (["ou05", "ou15", "ou25", "ou35"].includes(k)) return ["MAIS", "MENOS"];
    if (k === "exato") {
      const freq = {};
      for (const x of base || []) {
        const v = this._valorMercado(x, k);
        if (v) freq[v] = (freq[v] || 0) + 1;
      }
      return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,12).map(x=>x[0]);
    }
    return [];
  },

  _mapaMetas() {
    const mapa = new Map();
    try {
      const cache = JSON.parse(localStorage.getItem("vai_na_fe_partidas_coletadas_base_zerada_v1") || "{}");
      for (const p of Object.values(cache || {})) {
        if (p?.data && p?.horario && p?.mandante && p?.visitante) mapa.set(`${p.data}|${p.horario}`, p);
      }
    } catch (_) {}
    try {
      const snap = typeof TesteProximasPartidas !== "undefined" && typeof TesteProximasPartidas.snapshot === "function"
        ? TesteProximasPartidas.snapshot() : [];
      for (const p of snap || []) {
        if (p?.data && p?.horario && p?.mandante && p?.visitante) mapa.set(`${p.data}|${p.horario}`, p);
      }
    } catch (_) {}
    return mapa;
  },

  _fingerprintResultados(resultados) {
    const lista = Array.isArray(resultados) ? resultados : [];
    let h = 2166136261 >>> 0;
    const add = (txt) => {
      const s = String(txt ?? "");
      for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    };
    add(lista.length);
    for (const r of lista) {
      add(r?._temporal?.data || r?.data || "");
      add(r?._temporal?.horario || r?.horario || "");
      add(r?.placar || "");
      add(r?.mandante || "");
      add(r?.visitante || "");
    }
    return `${lista.length}|${h.toString(36)}`;
  },

  _historicoAssociado(resultados) {
    const assinaturaBruta = this._fingerprintResultados(resultados);
    if (this._cacheHistoricoAssociado.assinatura === assinaturaBruta) return this._cacheHistoricoAssociado.hist;
    const metas = this._mapaMetas();
    const out = [];
    for (const r of resultados || []) {
      const data = r?._temporal?.data || r?.data || "";
      const horario = r?._temporal?.horario || r?.horario || "";
      const direto = (r?.mandante && r?.visitante) ? {
        data, horario,
        mandante: r.mandante, visitante: r.visitante,
        escudoMandante: r.escudoMandante || "",
        escudoVisitante: r.escudoVisitante || "",
        liga: r.liga || "Inglês Doméstico (Esportes Virtuais)",
        _origem: "historico_compartilhado"
      } : null;
      const meta = direto || metas.get(`${data}|${horario}`);
      if (!meta?.mandante || !meta?.visitante || !this._placar(r)) continue;
      out.push({
        ...r,
        _ctxData: data,
        _ctxHorario: horario,
        _ctxMandante: this._normTime(meta.mandante),
        _ctxVisitante: this._normTime(meta.visitante),
        _ctxMeta: meta
      });
    }
    this._cacheHistoricoAssociado = { assinatura:assinaturaBruta, hist:out };
    // Histórico mudou: resultados dependentes dele deixam de ser válidos.
    this._cacheRecortes.clear();
    this._cachePrefixos.clear();
    this._cacheAnalises.clear();
    return out;
  },

  _taxa(amostra, k, valor, priorP, prior = this.PRIOR_PADRAO) {
    const lista = amostra || [];
    let ok = 0, n = 0;
    for (const x of lista) {
      const v = this._valorMercado(x, k);
      if (v == null) continue;
      n++;
      if (String(v) === String(valor)) ok++;
    }
    const p0 = Number.isFinite(priorP) ? priorP : 0.5;
    return { n, bruta: n ? ok / n : p0, p: (ok + prior * p0) / (n + prior) };
  },

  _recortes(hist, meta) {
    const mandante = this._normTime(meta?.mandante);
    const visitante = this._normTime(meta?.visitante);
    const horario = meta?.horario || "";
    // Separa forma recente específica da condição e histórico amplo.
    // A forma recente (últimos 10) recebe peso maior na previsão; o histórico
    // completo continua participando como contexto de longo prazo, com peso menor.
    const homeHistorico = hist.filter(x => x._ctxMandante === mandante);
    const awayHistorico = hist.filter(x => x._ctxVisitante === visitante);
    const homeRecente = homeHistorico.slice(-this.JANELA_FORMA_CONDICAO);
    const awayRecente = awayHistorico.slice(-this.JANELA_FORMA_CONDICAO);
    const h2hMesmo = hist.filter(x => x._ctxMandante === mandante && x._ctxVisitante === visitante);
    const h2h = hist.filter(x =>
      (x._ctxMandante === mandante && x._ctxVisitante === visitante) ||
      (x._ctxMandante === visitante && x._ctxVisitante === mandante));
    const momento = hist.filter(x =>
      x._ctxMandante === mandante || x._ctxVisitante === mandante ||
      x._ctxMandante === visitante || x._ctxVisitante === visitante).slice(-this.JANELA_MOMENTO);
    const horario9 = hist.filter(x => this._distMinuto(x._ctxHorario, horario) <= 9);
    const horario30 = hist.filter(x => this._distMinuto(x._ctxHorario, horario) <= 30);
    const mesmaHora = hist.filter(x => String(x._ctxHorario || "").slice(0,2) === String(horario).slice(0,2));
    return {
      geral:hist,
      mandanteRecente:homeRecente, visitanteRecente:awayRecente,
      mandanteHistorico:homeHistorico, visitanteHistorico:awayHistorico,
      // aliases mantidos apenas por compatibilidade com qualquer extensão antiga
      mandante:homeHistorico, visitante:awayHistorico,
      h2h, h2hMesmo, momento, horario9, horario30, mesmaHora
    };
  },

  _recortesCacheados(hist, meta) {
    const chave = `${this._assinatura(hist)}|${this._normTime(meta?.mandante)}|${this._normTime(meta?.visitante)}|${meta?.horario || ""}`;
    const salvo = this._cacheRecortes.get(chave);
    if (salvo) return salvo;
    const rec = this._recortes(hist, meta);
    this._cacheRecortes.set(chave, rec);
    if (this._cacheRecortes.size > 480) this._cacheRecortes.delete(this._cacheRecortes.keys().next().value);
    return rec;
  },

  _prefixoTaxa(hist, k, valor) {
    const chave = `${this._assinatura(hist)}|${k}|${String(valor)}`;
    const salvo = this._cachePrefixos.get(chave);
    if (salvo) return salvo;
    const ok = new Uint16Array(hist.length + 1);
    const n = new Uint16Array(hist.length + 1);
    for (let i=0;i<hist.length;i++) {
      const v = this._valorMercado(hist[i], k);
      ok[i+1] = ok[i];
      n[i+1] = n[i];
      if (v != null) { n[i+1]++; if (String(v) === String(valor)) ok[i+1]++; }
    }
    const out = {ok,n};
    this._cachePrefixos.set(chave,out);
    if (this._cachePrefixos.size > 160) this._cachePrefixos.delete(this._cachePrefixos.keys().next().value);
    return out;
  },

  _h2hFirebase(meta) {
    const out = [];
    for (const x of meta?.confrontoDireto || []) {
      const p = this._placar(x?.placar || x?.resultado || x);
      if (p) out.push({ placar:p.placar, golsCasa:p.casa, golsFora:p.fora, totalGols:p.total });
    }
    return out;
  },

  _assinatura(hist) {
    const p = hist?.[0], u = hist?.at(-1);
    return `${hist.length}|${p?._ctxData || ""}|${p?._ctxHorario || ""}|${u?._ctxData || ""}|${u?._ctxHorario || ""}|${u?.placar || ""}`;
  },

  _confiabilidade(hist, k, valor, recorteNome) {
    // Aprende a confiabilidade do recorte PARA ESTE LADO específico.
    // Ex.: um recorte pode ajudar MAIS 1.5 e atrapalhar MENOS 1.5;
    // uma coisa não herda a reputação da outra.
    const chave = `${this._assinatura(hist)}|${k}|${String(valor)}|${recorteNome}`;
    if (this._cacheConfiabilidade.has(chave)) return this._cacheConfiabilidade.get(chave);
    if (hist.length < 60) return 1;

    const inicio = Math.max(30, hist.length - 350);
    const prefixo = this._prefixoTaxa(hist, k, valor);
    let ganhos = 0, perdas = 0, usados = 0;
    for (let i = inicio; i < hist.length; i += 2) {
      const anteriores = hist.slice(0, i);
      const alvo = hist[i];
      const meta = alvo?._ctxMeta;
      if (!meta) continue;
      const rec = this._recortesCacheados(anteriores, meta)[recorteNome] || [];
      const minimoFonte = (recorteNome === "h2h" || recorteNome === "h2hMesmo") ? 1 : this.MIN_FONTE;
      if (rec.length < minimoFonte) continue;
      const real = this._valorMercado(alvo, k);
      if (real == null) continue;

      const nBase = prefixo.n[i] || 0;
      const baseP = nBase ? (prefixo.ok[i] / nBase) : 0.5;
      const fonte = this._taxa(rec, k, valor, baseP);
      const desvio = fonte.p - baseP;
      if (Math.abs(desvio) < 0.02) continue;

      usados++;
      const aconteceu = String(real) === String(valor);
      const direcaoAcertou = desvio > 0 ? aconteceu : !aconteceu;
      if (direcaoAcertou) ganhos++; else perdas++;
    }

    let mult = 1;
    if (usados >= 12) {
      const taxa = ganhos / Math.max(1, ganhos + perdas);
      mult = Math.max(0.72, Math.min(1.28, 0.82 + taxa * 0.42));
    }
    this._cacheConfiabilidade.set(chave, mult);
    if (this._cacheConfiabilidade.size > 800) this._cacheConfiabilidade.delete(this._cacheConfiabilidade.keys().next().value);
    return mult;
  },

  _pesoFonte(nome, n, confiabilidade) {
    const base = {
      // Forma recente na condição específica é deliberadamente a fonte mais
      // valorizada entre casa/fora. O histórico amplo funciona como estabilizador.
      mandanteRecente:1.85, visitanteRecente:1.85,
      mandanteHistorico:0.62, visitanteHistorico:0.62,
      mandante:0.62, visitante:0.62,
      h2h:1.35, h2hMesmo:1.55,
      momento:1.15, horario9:1.10, horario30:0.92, mesmaHora:0.82,
      h2hFirebase:1.30, sequencia:1.05
    }[nome] || 1;
    const qualidade = n > 0 ? n / (n + this.PRIOR_PADRAO) : 0;
    return base * qualidade * (Number.isFinite(confiabilidade) ? confiabilidade : 1);
  },

  _idIndividual(k, valor) {
    return `${String(k || "")}:${String(valor ?? "")}`;
  },

  _podeVirarSugestao(k, valor) {
    const v = String(valor ?? "").toUpperCase();
    // O0.5 continua apenas como cálculo interno.
    if (k === "ou05") return false;
    // U3.5 continua fixo/separado e NÃO disputa as 3 sugestões.
    // O3.5 disputa normalmente pelo especialista dedicado over35.
    if (k === "ou35") return false;
    if (k === "under05") return v === "MENOS";
    if (k === "over35") return v === "MAIS";
    return true;
  },

  _forcaSinal(edge, vantagemAprendida, qualidade, amostraAprendida, pContexto, taxaAprendida) {
    const fatorAmostra = Math.min(1, Math.max(0, Number(amostraAprendida) || 0) / 20);
    const sinal = (Number(edge) || 0) * 100 + (Number(vantagemAprendida) || 0) * 100 * 0.60 * fatorAmostra;
    const seguranca = Math.max(Number(pContexto) || 0, fatorAmostra ? (Number(taxaAprendida) || 0) : 0);
    // Um placar exato de 10% pode ter grande vantagem relativa, mas não vira
    // "FORTE" só por isso: força também exige chance absoluta razoável.
    if (sinal >= 8 && qualidade >= 0.18 && seguranca >= 0.45) return "FORTE";
    if (sinal >= 4 && seguranca >= 0.35) return "BOA";
    return "MODERADA";
  },

  _rotulo(k, valor) {
    const v = String(valor ?? "").toUpperCase();
    if (k === "bm") return v === "SIM" ? "Ambos Marcam — SIM" : "Ambos Marcam — NÃO";
    if (k === "r12") return v === "1" ? "Mandante vence" : v === "2" ? "Visitante vence" : "Empate";
    if (k === "gols") return `Total de Gols — ${v === "5" ? "5+ gols" : `${valor} gols`}`;
    if (k === "exato") return `Placar Exato — ${valor}`;
    if (k === "ou15") return v === "MAIS" ? "Mais de 1.5" : "Menos de 1.5";
    if (k === "ou25") return v === "MAIS" ? "Mais de 2.5" : "Menos de 2.5";
    if (k === "ou35") return v === "MAIS" ? "Mais de 3.5" : "Menos de 3.5";
    if (k === "over35") return "Mais de 3.5";
    if (k === "under05") return "Menos de 0.5";
    if (k === "ou05") return v === "MAIS" ? "Mais de 0.5" : "Menos de 0.5";
    return `${k} — ${valor}`;
  },

  analisar(resultados, meta, mercadosBase = {}) {
    const hist = this._historicoAssociado(resultados);
    if (!meta?.mandante || !meta?.visitante) {
      return { disponivel:false, motivo:"times", amostra:hist.length, confrontos:0, faltamConfrontos:this.MIN_CONFRONTOS_PARA_SUGERIR, candidatos:[], mercados:{} };
    }

    const recortes = this._recortesCacheados(hist, meta);
    const mercadosSig = Object.entries(mercadosBase || {}).map(([k,m]) => `${k}:${m?.ativo?1:0}:${m?.palpite?.valor ?? ""}:${Math.round(Number(m?.palpite?.percentual)||0)}`).join("|");
    const geracaoAprendizado = (typeof Aprendizado !== "undefined" ? Number(Aprendizado._geracao || 0) : 0);
    const chaveAnalise = `${this._assinatura(hist)}|${this._normTime(meta.mandante)}|${this._normTime(meta.visitante)}|${meta?.data || ""}|${meta?.horario || ""}|${mercadosSig}|g${geracaoAprendizado}`;
    const analiseSalva = this._cacheAnalises.get(chaveAnalise);
    if (analiseSalva) return analiseSalva;

    const confrontosVistos = recortes.h2h.length;
    // SEM TRAVA H2H:
    // 0 confrontos = H2H não pesa.
    // 1+ confrontos = H2H participa gradualmente; o próprio _pesoFonte()
    // encolhe amostras pequenas por n/(n+PRIOR_PADRAO).
    const h2hFirebase = this._h2hFirebase(meta);
    const mercados = {};
    const candidatos = [];
    const chaves = ["exato","gols","r12","bm","ou05","under05","ou15","ou25","ou35","over35"];

    for (const k of chaves) {
      const opcoes = this._opcoes(k, hist);
      if (!opcoes.length) continue;
      const avaliados = [];

      for (const valor of opcoes) {
        // Cada opção é avaliada e aprendida como mercado individual.
        // A taxa do lado oposto nunca entra aqui.
        const global = this._taxa(hist, k, valor, 0.5, 0);
        let soma = global.p;
        let peso = 1;
        const evidencias = [];

        for (const nome of ["mandanteRecente","visitanteRecente","mandanteHistorico","visitanteHistorico","h2h","h2hMesmo","momento","horario9","horario30","mesmaHora"]) {
          const amostra = recortes[nome] || [];
          const minimoFonte = (nome === "h2h" || nome === "h2hMesmo") ? 1 : this.MIN_FONTE;
          if (amostra.length < minimoFonte) continue;
          const t = this._taxa(amostra, k, valor, global.p);
          const rel = this._confiabilidade(hist, k, valor, nome);
          const w = this._pesoFonte(nome, t.n, rel);
          if (w <= 0) continue;
          soma += t.p * w;
          peso += w;
          evidencias.push({nome,n:t.n,p:t.p,w,rel});
        }

        if (h2hFirebase.length >= 1) {
          const t = this._taxa(h2hFirebase,k,valor,global.p,8);
          const w = this._pesoFonte("h2hFirebase",t.n,1);
          soma += t.p*w;
          peso += w;
          evidencias.push({nome:"h2hFirebase",n:t.n,p:t.p,w,rel:1});
        }

        const base = mercadosBase?.[k];
        if (base?.ativo && base?.palpite && String(base.palpite.valor) === String(valor)) {
          const pBase = Math.max(0, Math.min(1, Number(base.palpite.percentual || 0)/100));
          if (pBase > 0) {
            const w = 0.85;
            soma += pBase*w;
            peso += w;
            evidencias.push({nome:"sequencia",n:Math.max(3,Math.round((resultados||[]).length/20)),p:pBase,w,rel:1});
          }
        }

        const p = soma / peso;
        const edge = p - global.p;
        const qualidade = Math.min(1, evidencias.reduce((s,e)=>s+Math.min(e.n,30),0)/120);
        const desempenho = (typeof Aprendizado !== "undefined" && typeof Aprendizado.estatisticaMercado === "function")
          ? Aprendizado.estatisticaMercado(k, valor)
          : {amostra:0,taxa:0,taxaAjustada:50};
        const taxaAprendida = (Number(desempenho.taxaAjustada) || 50) / 100;
        const vantagemAprendida = desempenho.amostra >= 3 ? taxaAprendida - global.p : 0;
        const fatorAmostra = Math.min(1, Math.max(0, Number(desempenho.amostra) || 0) / 20);
        const qualidadeHistorica = desempenho.amostra >= 3
          ? Math.max(0, Math.min(1, (taxaAprendida - 0.35) / 0.30))
          : 0;
        const segurancaIndividual = desempenho.amostra >= 3 ? Math.max(p, taxaAprendida) : p;
        const penalidadeBaixa = Math.max(0, 0.35 - segurancaIndividual) * 0.55;

        // IMPORTANTE: a frequência bruta NÃO dá pontos no ranking.
        // O que vale é estar mais forte NESTE JOGO do que a própria taxa-base.
        // A taxa individual só ajuda se também tiver qualidade absoluta; assim
        // um placar exato raro não sobe ao Top 3 só por dobrar de 7% para 14%.
        const score = 0.50
          + Math.max(-0.20, Math.min(0.30, edge)) * 1.35
          + Math.max(-0.25, Math.min(0.25, vantagemAprendida)) * 0.65 * fatorAmostra * qualidadeHistorica
          + qualidade * 0.06
          - penalidadeBaixa;
        const forca = this._forcaSinal(edge, vantagemAprendida, qualidade, desempenho.amostra, p, taxaAprendida);

        avaliados.push({
          valor,p,global:global.p,edge,qualidade,score,evidencias,forca,
          desempenho, vantagemAprendida, idIndividual:this._idIndividual(k,valor)
        });
      }

      avaliados.sort((a,b)=>
        b.score-a.score ||
        b.edge-a.edge ||
        (Number(b.desempenho?.taxaAjustada)||0)-(Number(a.desempenho?.taxaAjustada)||0) ||
        b.p-a.p
      );
      const melhor = avaliados[0];
      if (!melhor) continue;
      mercados[k] = { k, melhor, opcoes:avaliados };

      // ou05 e ou35 continuam calculados para os painéis, porém não disputam
      // as sugestões: O0.5 fica fora; U3.5 é fixo; O3.5 vem por over35.
      if (!this._podeVirarSugestao(k, melhor.valor)) continue;

      const fortes = melhor.evidencias
        .filter(e=>e.p > melhor.global + 0.02)
        .sort((a,b)=>b.w-a.w).slice(0,3);
      const nomes = {mandanteRecente:"últimos 10 do mandante em casa",visitanteRecente:"últimos 10 do visitante fora",mandanteHistorico:"histórico completo do mandante em casa",visitanteHistorico:"histórico completo do visitante fora",h2h:"H2H",h2hMesmo:"H2H mesmo mando",momento:"momento recente",horario9:"faixa ±9 min",horario30:"faixa ±30 min",mesmaHora:"mesma hora",h2hFirebase:"confrontos diretos",sequencia:"sequência atual"};
      const apoio = fortes.length ? fortes.map(e=>`${nomes[e.nome]||e.nome} ${Math.round(e.p*100)}%/${e.n}`).join(" · ") : "sem recorte dominante";
      const desempenho = melhor.desempenho || {amostra:0,taxa:0,taxaAjustada:50};
      const vantagemPp = melhor.edge * 100;
      const histPp = melhor.vantagemAprendida * 100;

      candidatos.push({
        k, valor:melhor.valor, titulo:this._rotulo(k,melhor.valor),
        idIndividual:melhor.idIndividual, forca:melhor.forca,
        confianca:melhor.p*100, media:melhor.global*100, ganho:vantagemPp,
        qualidade:melhor.qualidade*100, score:melhor.score,
        taxaHistorica:desempenho.taxa, amostraHistorica:desempenho.amostra, taxaAjustada:desempenho.taxaAjustada,
        vantagemHistorica:histPp,
        descricao:`${melhor.forca}: base ${Math.round(melhor.global*100)}% → contexto ${Math.round(melhor.p*100)}% (${vantagemPp>=0?"+":""}${vantagemPp.toFixed(1)} p.p.) · ${desempenho.amostra ? `este lado acertou ${desempenho.taxa.toFixed(1)}% em ${desempenho.amostra} chamada(s)` : "este lado ainda formando amostra"} · H2H ${confrontosVistos ? `${confrontosVistos}` : "0"} · ${apoio}.`
      });
    }

    candidatos.sort((a,b)=>
      b.score-a.score ||
      b.ganho-a.ganho ||
      (Number(b.taxaAjustada)||0)-(Number(a.taxaAjustada)||0) ||
      b.confianca-a.confianca
    );
    const saida = {
      disponivel:true, amostra:hist.length, confrontos:confrontosVistos, faltamConfrontos:0, candidatos, mercados,
      resumo:`IA ativa: cada lado é independente. A frequência normal do mercado não dá prioridade sozinha; o ranking procura vantagem sobre a própria taxa-base. Últimos 10 casa/fora têm peso maior, histórico amplo peso menor, e H2H, momento, horário, sequência e acerto individual completam a leitura em ${hist.length} resultados.`
    };
    this._cacheAnalises.set(chaveAnalise, saida);
    if (this._cacheAnalises.size > 90) this._cacheAnalises.delete(this._cacheAnalises.keys().next().value);
    return saida;
  }
};

if (typeof window !== "undefined") window.AnaliseContextualTimes = AnaliseContextualTimes;
