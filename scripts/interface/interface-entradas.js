"use strict";

/*
 * ALTERAÇÃO VISUAL DE TESTE
 * - Mantém o nome VAI NA FÉ VIRTUAL.
 * - Altera somente a página Entradas para aproximar o layout da referência.
 * - Lê /proximas_partidas no MESMO Firebase do núcleo.
 * - /historico_compartilhado continua exclusivo para resultados finalizados.
 * - Sem dados reais de equipes, mostra "Aguardando configurações".
 */
(function () {
  if (typeof Interface === "undefined") return;

  const AGUARDA = "Aguardando configurações";
  const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const pct = v => num(v) !== null ? `${Math.round(Number(v))}%` : "—";
  const odd = v => num(v) !== null ? Number(v).toFixed(2) : "—";

  const originalIniciar = Interface.iniciar.bind(Interface);
  const originalRender = Interface._renderModerno.bind(Interface);
  const originalAtualizarEntradas = Interface.atualizar.bind(Interface);
  const originalEventosPagina = Interface._eventosPaginaModerna.bind(Interface);
  const originalEstilos = Interface._estilosModernos.bind(Interface);
  const originalConfig = Interface._pagina_configuracoes.bind(Interface);

  Interface._partidaSelecionadaTeste = null;
  Interface._resultadoSelecionadoTeste = null;
  Interface._CHAVE_SUGESTOES_HISTORICAS_TESTE = "vai_na_fe_sugestoes_oficiais_v27";
  Interface._MARCADOR_SUGESTOES_V27 = "vai_na_fe_sugestoes_oficiais_v27_iniciado";
  Interface._assinaturaOficialAtualTeste = "";
  Interface._ultimaPartidaAtualOficialTeste = null;
  Interface._cacheSugestoesPartidaTeste = new Map();

  Interface.iniciar = function () {
    // A V27 começa uma trilha NOVA de sugestões oficiais. Registros antigos das
    // versões que salvavam prévias ou recalculavam palpites após o jogo são ignoradas para
    // não contaminar GREEN/RED. Histórico e aprendizado NÃO são apagados.
    try {
      if (localStorage.getItem(this._MARCADOR_SUGESTOES_V27) !== "ok") {
        [
          "vai_na_fe_sugestoes_historicas_individuais_v21",
          "vai_na_fe_sugestoes_historicas_imutaveis_v25",
          "vai_na_fe_sugestoes_salvas_v26"
        ].forEach(k => localStorage.removeItem(k));
        localStorage.setItem(this._MARCADOR_SUGESTOES_V27, "ok");
      }
    } catch (_) {}
    originalIniciar();
    if (typeof TesteProximasPartidas !== "undefined") TesteProximasPartidas.iniciar();
  };

  // Evita repetir o processamento pesado do painel quando nada relevante mudou.
  // Relógio e agenda continuam atualizando de forma leve por seus próprios eventos.
  Interface._ultimaAssinaturaAtualizacaoPesadaTeste = "";
  Interface._assinaturaAtualizacaoPesadaTeste = function () {
    const r = typeof Historico !== "undefined" && Historico.obterUltimo ? Historico.obterUltimo() : null;
    const qtd = typeof Historico !== "undefined" && Historico.obterQuantidade ? Historico.obterQuantidade() : 0;
    const aprendidos = typeof Aprendizado !== "undefined" ? Number(Aprendizado._processados?.size || 0) : 0;
    return `${qtd}|${r?.id||""}|${r?._temporal?.data||""}|${r?._temporal?.horario||""}|${r?.placar||""}|a${aprendidos}`;
  };

  Interface.atualizar = function () {
    const assinatura = this._assinaturaAtualizacaoPesadaTeste();
    let retorno;
    if (assinatura !== this._ultimaAssinaturaAtualizacaoPesadaTeste) {
      this._ultimaAssinaturaAtualizacaoPesadaTeste = assinatura;
      retorno = originalAtualizarEntradas();
      // Só verifica promoção para OFICIAL quando algo relevante mudou. A agenda
      // também dispara sua própria verificação no evento específico abaixo.
      try { if (typeof this._garantirSugestaoOficialAtualTeste === "function") this._garantirSugestaoOficialAtualTeste(); } catch (_) {}
    } else {
      try {
        const agora = typeof RelogioPartidas !== "undefined" ? RelogioPartidas.agora() : null;
        const atual = typeof RelogioPartidas !== "undefined" ? RelogioPartidas.partidaAtual() : null;
        const proxima = typeof RelogioPartidas !== "undefined" ? RelogioPartidas.proximaPartida() : null;
        if (typeof this._atualizarRelogioModerno === "function") this._atualizarRelogioModerno({agora,atual,proxima});
      } catch (_) {}
    }
    return retorno;
  };

  // OTIMIZAÇÃO SEGURA SOBRE A V22 FUNCIONAL:
  // não monta a página inteira a cada segundo. A assinatura só muda quando
  // histórico, agenda, seleção ou aprendizado COMPLETO mudam. Nenhum resultado
  // é cortado e a origem dos dados continua exatamente a mesma da V22.
  Interface._ultimaAssinaturaEntradasTeste = "";
  Interface._ultimaPaginaRenderizadaTeste = null;
  Interface._assinaturaRenderEntradasTeste = function () {
    const r = typeof Historico !== "undefined" && Historico.obterUltimo ? Historico.obterUltimo() : null;
    const qtd = typeof Historico !== "undefined" && Historico.obterQuantidade ? Historico.obterQuantidade() : 0;
    const prox = typeof TesteProximasPartidas !== "undefined" ? String(TesteProximasPartidas._assinaturaDados || "") : "";
    const aprendidos = typeof Aprendizado !== "undefined" ? Number(Aprendizado._processados?.size || 0) : 0;
    return `${qtd}|${r?.id||""}|${r?._temporal?.data||""}|${r?._temporal?.horario||""}|${r?.placar||""}|${prox}|${this._partidaSelecionadaTeste||""}|${this._resultadoSelecionadoTeste||""}|a${aprendidos}`;
  };

  Interface._renderModerno = function () {
    if (this._paginaModerna === "entradas") {
      const content = document.getElementById("ia-content");
      const assinatura = this._assinaturaRenderEntradasTeste();
      if (this._ultimaPaginaRenderizadaTeste === "entradas" && this._ultimaAssinaturaEntradasTeste === assinatura && content && content.childNodes.length) {
        try {
          const agora = typeof RelogioPartidas !== "undefined" ? RelogioPartidas.agora() : null;
          const atual = typeof RelogioPartidas !== "undefined" ? RelogioPartidas.partidaAtual() : null;
          const proxima = typeof RelogioPartidas !== "undefined" ? RelogioPartidas.proximaPartida() : null;
          if (typeof this._atualizarRelogioModerno === "function") this._atualizarRelogioModerno({agora,atual,proxima});
        } catch (_) {}
        return;
      }
      this._ultimaAssinaturaEntradasTeste = assinatura;
    }

    originalRender();
    this._ultimaPaginaRenderizadaTeste = this._paginaModerna;

    if (this._paginaModerna === "entradas") {
      const sub = document.getElementById("ia-page-subtitle");
      if (sub) sub.textContent = "Veja as melhores oportunidades de entrada com base na análise dos padrões e no histórico.";
    }
  };

  Interface._slotsEntradasTeste = function () {
    // Nada é inventado aqui. A grade mostra exclusivamente o que estiver
    // cadastrado AGORA em /proximas_partidas pelo coletor.
    if (typeof TesteProximasPartidas === "undefined") return [];
    return TesteProximasPartidas.proximas(5);
  };

  Interface._metaPartidaTeste = function (slot) {
    if (slot?._meta) return slot._meta;
    return (typeof TesteProximasPartidas !== "undefined") ? TesteProximasPartidas.obterPartida(slot) : null;
  };

  Interface._rotuloPickTeste = function (pick) {
    if (!pick) return AGUARDA;
    if (typeof ConsultorEntradas !== "undefined" && ConsultorEntradas._rotuloPick && pick.k) {
      try { return ConsultorEntradas._rotuloPick(pick); } catch (_) {}
    }
    return String(pick.mercado || pick.nome || pick.valor || AGUARDA);
  };

  // Na tela de Entradas, cada LADO aparece como mercado individual.
  // Ex.: "Mais de 1.5" e "Menos de 1.5" nunca aparecem como um único O/U.
  Interface._rotuloEntradaMercadoTeste = function (k, mercado) {
    if (!(mercado?.ativo && mercado?.palpite)) return AGUARDA;
    const valor = String(mercado.palpite.valor ?? "").trim().toUpperCase();
    if (k === "ou15") return valor === "MAIS" ? "Mais de 1.5" : "Menos de 1.5";
    if (k === "ou25") return valor === "MAIS" ? "Mais de 2.5" : "Menos de 2.5";
    if (k === "ou35") return valor === "MAIS" ? "Mais de 3.5" : "Menos de 3.5";
    if (k === "over35") return "Mais de 3.5";
    if (k === "under05") return "Menos de 0.5";
    if (k === "ou05") return valor === "MAIS" ? "Mais de 0.5" : "Menos de 0.5";
    if (k === "bm") return valor === "SIM" ? "Ambos Marcam — SIM" : "Ambos Marcam — NÃO";
    if (k === "r12") return valor === "1" ? "Mandante vence" : valor === "2" ? "Visitante vence" : "Empate";
    if (k === "gols") return `Total de Gols — ${valor === "5" ? "5+" : valor} gols`;
    if (k === "exato") return `Placar Exato — ${String(mercado.palpite.valor ?? "")}`;
    return this._rotuloMercado(k, mercado) || String(mercado.palpite.valor ?? AGUARDA);
  };

  // O Over 0.5 continua sendo calculado pelos especialistas, mas não pode
  // aparecer como sugestão de entrada porque a odd costuma ser baixa demais.
  // Under 0.5 continua liberado normalmente.
  Interface._tituloIndividualSugestaoTeste = function (s) {
    if (!s) return AGUARDA;
    const k = String(s.k || s.mercado || "");
    const valor = s.valor ?? s.palpite?.valor ?? "";
    if (k) {
      const titulo = this._rotuloEntradaMercadoTeste(k, {ativo:true, palpite:{valor}});
      if (titulo && titulo !== AGUARDA) return titulo;
    }
    return String(s.titulo || s.nome || AGUARDA);
  };

  Interface._ehOver05SugestaoTeste = function (s) {
    if (!s) return false;
    const k = String(s.mercado ?? s.k ?? "").trim();
    const valor = String(s.valor ?? s.palpite?.valor ?? "").trim().toUpperCase();
    if ((k === "ou05" || k === "under05") && valor === "MAIS") return true;
    const titulo = String(s.titulo ?? s.rotuloCompleto ?? s.mercadoCompleto ?? s.mercadoNome ?? s.nome ?? "")
      .toLowerCase().replace(/,/g, ".");
    return /(?:mais\s+de\s+0\.5|over\s+0\.5)/i.test(titulo);
  };

  Interface._ehUnder35FixoSugestaoTeste = function (s) {
    if (!s) return false;
    const k = String(s.mercado ?? s.k ?? "").trim();
    const valor = String(s.valor ?? s.palpite?.valor ?? "").trim().toUpperCase();
    // Só o UNDER 3.5 fica fora. OVER 3.5 continua liberado normalmente.
    if (k === "ou35" && valor === "MENOS") return true;
    const titulo = String(s.titulo ?? s.rotuloCompleto ?? s.mercadoCompleto ?? s.mercadoNome ?? s.nome ?? "")
      .toLowerCase().replace(/,/g, ".");
    return /(?:menos\s+de\s+3\.5|under\s+3\.5)/i.test(titulo);
  };

  Interface._filtrarSugestoesTeste = function (lista) {
    return (Array.isArray(lista) ? lista : []).filter(x =>
      !this._ehOver05SugestaoTeste(x) && !this._ehUnder35FixoSugestaoTeste(x)
    );
  };

  Interface._under35FixoTeste = function (d) {
    const m = d?.mercados?.ou35 || null;
    const valor = String(m?.palpite?.valor ?? "").toUpperCase();
    const ativo = Boolean(m?.ativo && m?.palpite && valor === "MENOS" && !m?.bloqueado);
    const confianca = ativo ? (num(m?.palpite?.percentual) ?? 0) : null;
    let descricao = "Fica sempre visível e não ocupa nenhuma das 3 sugestões.";
    if (ativo) descricao = `Sinal ativo para Menos de 3.5${confianca !== null ? ` · confiança ${Math.round(confianca)}%` : ""}.`;
    else if (m?.bloqueado && m?.motivoBloqueio) descricao = `Sem chamada agora · ${m.motivoBloqueio}.`;
    else descricao = "Sem chamada agora · o especialista U3.5 permanece visível e aguarda um contexto melhor.";
    return { ativo, titulo:"Menos de 3.5", confianca, descricao, status: ativo ? "ACIONADO" : "SEM CHAMADA" };
  };

  Interface._sugestoesEntradasTeste = function (d, meta) {
    // PRIMEIRO tenta a nova camada contextual. Ela não inventa times: só entra
    // em ação quando já existem resultados anteriores associados pelo coletor.
    // Enquanto a amostra ainda é pequena, o comportamento antigo é preservado.
    try {
      if (typeof AnaliseContextualTimes !== "undefined" && meta?.mandante && meta?.visitante) {
        const contextual = AnaliseContextualTimes.analisar(d.resultados || [], meta, d.mercados || {});
        this._ultimaAnaliseContextualTeste = contextual;

        // H2H não bloqueia mais a análise; contextual só fica indisponível
        // quando faltam dados básicos (ex.: times associados).
        if (!contextual?.disponivel) return [];

        if (contextual.candidatos?.length) {
          const candidatos = contextual.candidatos.map((x, i) => ({
            titulo: x.titulo,
            descricao: x.descricao,
            confianca: x.confianca,
            principal: i === 0,
            contextual: true,
            mercado: x.k,
            k: x.k,
            valor: x.valor,
            media: x.media,
            ganho: x.ganho,
            qualidade: x.qualidade,
            taxaHistorica: x.taxaHistorica,
            amostraHistorica: x.amostraHistorica,
            taxaAjustada: x.taxaAjustada,
            vantagemHistorica: x.vantagemHistorica,
            idIndividual: x.idIndividual,
            forca: x.forca,
            score: x.score
          }));
          candidatos.sort((a,b) =>
            (Number(b.score)||0)-(Number(a.score)||0) ||
            (Number(b.taxaAjustada)||0)-(Number(a.taxaAjustada)||0) ||
            (Number(b.confianca)||0)-(Number(a.confianca)||0)
          );
          return this._filtrarSugestoesTeste(candidatos).slice(0, 3).map((x, i) => ({...x, principal:i === 0}));
        }
        return [];
      } else {
        this._ultimaAnaliseContextualTeste = null;
        return [];
      }
    } catch (e) {
      this._ultimaAnaliseContextualTeste = {disponivel:false, erro:String(e?.message || e)};
      return [];
    }

    if (Array.isArray(meta?.sugestoes) && meta.sugestoes.length) {
      const lista = meta.sugestoes.map((x, i) => ({
        titulo: x.rotuloCompleto || x.mercadoCompleto || x.mercado || x.nome || `Entrada ${i + 1}`,
        descricao: x.descricao || "",
        confianca: x.confianca,
        principal: x.principal || i === 0,
        mercado: x.k || x.mercadoId || x.mercado || "",
        k: x.k || x.mercadoId || "",
        valor: x.valor ?? x.palpite ?? x.resultado ?? ""
      }));
      return this._filtrarSugestoesTeste(lista).slice(0, 3).map((x, i) => ({...x, principal:i === 0}));
    }

    try {
      if (typeof ConsultorEntradas !== "undefined") {
        const estado = JSON.parse(localStorage.getItem(ConsultorEntradas.CHAVE_ESTADO) || "null");
        const rec = estado?.recomendacao;
        if (rec?.picks?.length && Number(rec.baseQtd) === Number(d.resultados?.length)) {
          const lista = rec.picks.map((x, i) => ({
            titulo: this._rotuloPickTeste(x),
            descricao: x.motivo || "",
            confianca: x.prob,
            principal: i === 0,
            mercado: x.k || "",
            k: x.k || "",
            valor: x.valor ?? ""
          }));
          return this._filtrarSugestoesTeste(lista).slice(0, 3).map((x, i) => ({...x, principal:i === 0}));
        }
      }
    } catch (_) {}

    const lista = Object.entries(d.mercados || {})
      .filter(([, x]) => x?.ativo && x?.palpite)
      .sort((a, b) => (Number(b[1].palpite.percentual) || 0) - (Number(a[1].palpite.percentual) || 0))
      .map(([k, x], i) => ({
        titulo: this._rotuloEntradaMercadoTeste(k, x),
        descricao: "Entrada indicada pela análise dos padrões e do histórico.",
        confianca: x.palpite.percentual,
        principal: i === 0,
        mercado: k,
        k,
        valor: x.palpite.valor
      }));
    return this._filtrarSugestoesTeste(lista).slice(0, 3).map((x, i) => ({...x, principal:i === 0}));
  };

  // Cache por partida/histórico: tocar novamente na mesma partida não recalcula
  // toda a análise contextual. O cache é invalidado automaticamente quando entra
  // resultado novo, muda o aprendizado ou muda a leitura-base dos mercados.
  const _sugestoesEntradasSemCacheV27 = Interface._sugestoesEntradasTeste.bind(Interface);
  Interface._sugestoesEntradasTeste = function (d, meta) {
    const resultados = d?.resultados || [];
    const ultimo = resultados.at(-1);
    const aprendidos = typeof Aprendizado !== "undefined" ? Number(Aprendizado._processados?.size || 0) : 0;
    const mercSig = Object.entries(d?.mercados || {}).map(([k,m]) => `${k}:${m?.ativo?1:0}:${m?.palpite?.valor??""}:${Math.round(Number(m?.palpite?.percentual)||0)}`).join("|");
    const chave = `${resultados.length}|${ultimo?._temporal?.data||""}|${ultimo?._temporal?.horario||""}|${ultimo?.placar||""}|a${aprendidos}|${meta?.data||""}|${meta?.horario||""}|${meta?.mandante||""}|${meta?.visitante||""}|${mercSig}`;
    const cache = this._cacheSugestoesPartidaTeste || (this._cacheSugestoesPartidaTeste = new Map());
    if (cache.has(chave)) {
      const salvo = cache.get(chave);
      this._ultimaAnaliseContextualTeste = salvo.contexto || null;
      return salvo.sugestoes.map(x => ({...x}));
    }
    const sugestoes = _sugestoesEntradasSemCacheV27(d, meta) || [];
    cache.set(chave, { sugestoes:sugestoes.map(x=>({...x})), contexto:this._ultimaAnaliseContextualTeste ? {...this._ultimaAnaliseContextualTeste} : null });
    if (cache.size > 30) cache.delete(cache.keys().next().value);
    return sugestoes;
  };

  Interface._lerSnapshotsSugestoesTeste = function () {
    try { return JSON.parse(localStorage.getItem(this._CHAVE_SUGESTOES_HISTORICAS_TESTE) || "{}") || {}; }
    catch (_) { return {}; }
  };

  Interface._temResultadoDoSlotTeste = function (resultados, slot) {
    return (resultados || []).some(r => {
      const dataResultado = r?._temporal?.data || r?.dataPartida || r?.data || "";
      const horarioResultado = r?._temporal?.horario || r?.horario || "";
      if (String(horarioResultado) !== String(slot?.horario || "")) return false;
      return !dataResultado || !slot?.data || String(dataResultado) === String(slot.data);
    });
  };

  Interface._obterSnapshotSugestoesTeste = function (slot) {
    if (!slot?.data || !slot?.horario) return null;
    const mapa = this._lerSnapshotsSugestoesTeste();
    return mapa[`${slot.data}|${slot.horario}`] || null;
  };

  // REGRA V28:
  // - Jogos futuros: apenas PRÉVIA, nunca são gravados.
  // - Primeiro jogo da fila: as 3 sugestões viram OFICIAIS e são gravadas UMA vez.
  // - Depois de gravadas, nunca são alteradas. O resultado apenas marca GREEN/RED.
  Interface._salvarSugestaoOficialTeste = function (slot, meta, sugestoes, baseQtd, analise = "") {
    if (!slot?.data || !slot?.horario) return null;
    const mapa = this._lerSnapshotsSugestoesTeste();
    const chave = `${slot.data}|${slot.horario}`;
    if (mapa[chave]?.sugestoes?.length) return mapa[chave];

    const lista = this._filtrarSugestoesTeste(sugestoes).slice(0, 3).map((x, i) => ({
      titulo: this._tituloIndividualSugestaoTeste(x),
      descricao: x.descricao || "",
      confianca: num(x.confianca),
      principal: i === 0,
      mercado: x.mercado || x.k || "",
      k: x.k || x.mercado || "",
      valor: x.valor ?? "",
      forca: x.forca || ""
    }));
    if (!lista.length) return null;

    const registro = {
      versao:"v28-oficial", status:"oficial", imutavel:true,
      data:slot.data, horario:slot.horario, oficialEm:new Date().toISOString(),
      baseQtd:Number(baseQtd)||0, mandante:meta?.mandante||"", visitante:meta?.visitante||"",
      liga:meta?.liga||"Inglês Doméstico (Esportes Virtuais)",
      analise:String(analise || ""), sugestoes:lista
    };
    mapa[chave] = registro;
    const entradas = Object.entries(mapa).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    const limitado = Object.fromEntries(entradas.slice(-500));
    try { localStorage.setItem(this._CHAVE_SUGESTOES_HISTORICAS_TESTE, JSON.stringify(limitado)); } catch (_) {}
    return registro;
  };

  Interface._partidaAtualOficialTeste = function (slots, resultados) {
    for (const slot of (Array.isArray(slots) ? slots : [])) {
      if (!this._temResultadoDoSlotTeste(resultados, slot)) return slot;
    }
    return null;
  };

  Interface._garantirSugestaoOficialAtualTeste = function (dados = null, slots = null) {
    if (window.__VAI_NA_FE_BASE_PRONTA__ !== true) return null;
    if (typeof this._dadosModernos !== "function") return null;
    const d = dados || this._dadosModernos();
    const listaSlots = Array.isArray(slots) ? slots : this._slotsEntradasTeste(d);
    const atual = this._partidaAtualOficialTeste(listaSlots, d.resultados || []);
    if (!atual) return null;

    // Se a primeira partida mudou durante esta sessão, só promovemos a nova
    // para OFICIAL depois que o resultado da anterior realmente chegou ao
    // histórico. Isso evita congelar o jogo seguinte com uma prévia calculada
    // alguns segundos antes do placar anterior entrar no Firebase/local.
    const chaveAtual = `${atual.data}|${atual.horario}`;
    const anterior = this._ultimaPartidaAtualOficialTeste;
    if (anterior && anterior.chave !== chaveAtual) {
      const anteriorFinalizada = this._temResultadoDoSlotTeste(d.resultados || [], anterior.slot);
      if (!anteriorFinalizada) return null;
    }
    this._ultimaPartidaAtualOficialTeste = { chave:chaveAtual, slot:{ data:atual.data, horario:atual.horario } };

    const existente = this._obterSnapshotSugestoesTeste(atual);
    if (existente?.sugestoes?.length) return existente;

    const meta = this._metaPartidaTeste(atual);
    if (!meta?.mandante || !meta?.visitante) return null;
    const ultimo = (d.resultados || []).at(-1);
    const aprendidos = typeof Aprendizado !== "undefined" ? Number(Aprendizado._processados?.size || 0) : 0;
    const assinatura = `${atual.data}|${atual.horario}|${d.resultados?.length||0}|${ultimo?._temporal?.data||""}|${ultimo?._temporal?.horario||""}|${ultimo?.placar||""}|a${aprendidos}`;
    if (assinatura === this._assinaturaOficialAtualTeste) return null;
    this._assinaturaOficialAtualTeste = assinatura;

    const sugestoes = this._sugestoesEntradasTeste(d, meta);
    if (!Array.isArray(sugestoes) || !sugestoes.length) return null;
    const ctx = this._ultimaAnaliseContextualTeste;
    return this._salvarSugestaoOficialTeste(atual, meta, sugestoes, d.resultados?.length || 0, ctx?.leituraConfronto || ctx?.resumo || "");
  };

  Interface._chaveResultadoTeste = function (r, indice = -1) {
    const data = r?._temporal?.data || r?.dataPartida || r?.data || "";
    const horario = r?._temporal?.horario || r?.horario || "";
    return `${data}|${horario}|${indice}`;
  };

  Interface._sugestoesDePalpitesRegistradosTeste = function (registro) {
    const palpites = registro?.palpites || {};
    const lista = Object.entries(palpites).map(([k, p]) => ({
      titulo: this._rotuloEntradaMercadoTeste(k, {ativo:true, palpite:p}),
      descricao: "Palpite registrado antes do resultado.",
      confianca: Number(p?.percentual) || 0,
      principal: false,
      mercado: k,
      k,
      valor: p?.valor
    })).sort((a,b) => Number(b.confianca || 0) - Number(a.confianca || 0));
    return this._filtrarSugestoesTeste(lista).slice(0, 3).map((x,i)=>({...x,principal:i===0}));
  };

  Interface._sugestoesHistoricasResultadoTeste = function (d, r, indice, meta) {
    const slot = {
      data:r?._temporal?.data || r?.dataPartida || r?.data || "",
      horario:r?._temporal?.horario || r?.horario || "",
      timeZone:r?._temporal?.timeZone || "Europe/London"
    };
    const registro = this._obterSnapshotSugestoesTeste(slot);
    if (registro?.status === "oficial" && registro?.sugestoes?.length) {
      return {
        sugestoes:this._filtrarSugestoesTeste(registro.sugestoes).slice(0,3),
        origem:"Sugestões oficiais salvas quando esta partida chegou à vez",
        analise:registro.analise || ""
      };
    }
    // Nunca recalcula um palpite depois do placar. Se não houve registro oficial,
    // a tela assume isso claramente em vez de trocar mercado retroativamente.
    return {
      sugestoes:[],
      origem:"Sem sugestão oficial salva para esta partida",
      analise:"O sistema não recalcula sugestões depois do resultado. GREEN/RED existe somente para sugestões que foram salvas como oficiais antes do placar final."
    };
  };

  Interface._avaliarSugestaoResultadoTeste = function (s, r) {
    if (!s || !r) return null;
    const k = String(s.k || s.mercado || "");
    const valor = String(s.valor ?? "").toUpperCase();
    let casa = Number(r.golsCasa), fora = Number(r.golsFora), total = Number(r.totalGols);
    if (!Number.isFinite(casa) || !Number.isFinite(fora)) {
      const m = String(r.placar || "").match(/^(\d+)\s*x\s*(\d+)$/i);
      if (m) { casa = Number(m[1]); fora = Number(m[2]); total = casa + fora; }
    }
    if (!Number.isFinite(casa) || !Number.isFinite(fora) || !Number.isFinite(total)) return null;
    if (k === "exato") return String(s.valor) === String(r.placar);
    if (k === "gols") return Number(s.valor) === 5 ? total >= 5 : Number(s.valor) === total;
    if (k === "r12") return (valor === "1" && casa > fora) || (valor === "X" && casa === fora) || (valor === "2" && casa < fora);
    if (k === "bm") return (valor === "SIM") === (casa > 0 && fora > 0);
    const linha = ({ou05:0.5,under05:0.5,ou15:1.5,ou25:2.5,ou35:3.5,over35:3.5})[k];
    if (linha != null) return valor === "MAIS" ? total > linha : valor === "MENOS" ? total < linha : null;
    return null;
  };

  // Escudos: usa SOMENTE o catálogo/IDs e as mesmas fontes de imagem
  // definidos no projeto IA COLETORA enviado pelo usuário. Nenhuma outra
  // lógica daquele projeto foi importada.
  Interface._escudoIdTeste = function (nome) {
    const n = String(nome || "").trim().toLowerCase();
    const mapa = [
      [/^arsenal$|^arsenal fc$|^islington$/, 42],
      [/^aston$|^aston villa$|^aston vila$/, 66],
      [/^bournemouth$|^afc bournemouth$/, 35],
      [/^brentford$|^brentford fc$/, 55],
      [/^brighton$|^brighton fc$|^brighton & hove albion$/, 51],
      [/^burnley$|^burnley fc$/, 44],
      [/^chelsea$|^chelsea fc$/, 49],
      [/^city$|^manchester city$|^man city$/, 50],
      [/^crystal palace$|^palace$|^crystal palace fc$/, 52],
      [/^everton$|^everton fc$/, 45],
      [/^fulham$|^fulham fc$/, 36],
      [/^leeds$|^leeds fc$|^leeds united$/, 63],
      [/^leicester$|^leicester city$/, 46],
      [/^liverpool$|^liverpool fc$/, 40],
      [/^newcastle$|^newcastle united$/, 34],
      [/^norwich$|^norwich city$|^norwich city fc$/, 71],
      [/^nottingham$|^nottingham forest$/, 65],
      [/^southampton$|^southampton fc$/, 41],
      [/^tottenham$|^tottenham hotspur$|^spurs$/, 47],
      [/^united$|^man utd$|^manchester utd$|^manchester united$/, 33],
      [/^watford$|^watford fc$/, 38],
      [/^west ham$|^west ham fc$|^west ham united$/, 48],
      [/^wolves$|^wolverhampton$|^wolverhampton wanderers$/, 39]
    ];
    for (const [rx, id] of mapa) if (rx.test(n)) return id;
    return null;
  };

  Interface._fontesEscudoFixasTeste = new Map();

  Interface._fontesEscudoTeste = function (nome) {
    const id = this._escudoIdTeste(nome);
    if (!id) return [];
    const cachePronto = typeof TesteEscudosCache !== "undefined" && TesteEscudosCache.tem(id);
    if (this._fontesEscudoFixasTeste.has(id)) {
      const fixas = [...this._fontesEscudoFixasTeste.get(id)];
      return cachePronto ? [TesteEscudosCache.url(id), ...fixas.filter(x => x !== TesteEscudosCache.url(id))] : fixas;
    }

    // Estes são os PNGs que realmente existem fisicamente dentro da pasta
    // teste/escudos. Para os demais NÃO tentamos arquivo local inexistente,
    // evitando o ícone de arquivo quebrado/piscando.
    const idsLocais = new Set([42, 44, 47, 48, 49, 50, 52, 63, 71]);
    const fontes = [];
    if (idsLocais.has(id)) fontes.push(`./escudos/${id}.png`);

    const n = String(nome || "").trim().toLowerCase();
    if (/^watford$|^watford fc$/.test(n)) {
      fontes.push(
        "https://assets.footylogos.com/logos/watford/watford-logo-footylogos.png",
        "https://media.api-sports.io/football/teams/38.png"
      );
    } else if (/^crystal palace$|^palace$|^crystal palace fc$/.test(n)) {
      fontes.push(
        "https://assets.football-logos.cc/logos/england/1500x1500/crystal-palace.e3552a3a.png",
        "https://assets.footylogos.com/logos/crystal-palace/crystal-palace-logo-footylogos.png",
        "https://media.api-sports.io/football/teams/52.png"
      );
    } else if (/^norwich$|^norwich city$|^norwich city fc$/.test(n)) {
      fontes.push(
        "https://www.footylogos.com/downloads/logo/norwich-city-logo-footylogos.png",
        "https://media.api-sports.io/football/teams/71.png"
      );
    } else {
      fontes.push(`https://media.api-sports.io/football/teams/${id}.png`);
    }

    const unicas = [...new Set(fontes)];
    this._fontesEscudoFixasTeste.set(id, unicas);
    return cachePronto ? [TesteEscudosCache.url(id), ...unicas.filter(x => x !== TesteEscudosCache.url(id))] : [...unicas];
  };

  Interface._trocarFonteEscudoTeste = function (img) {
    if (!img) return;
    let fontes = [];
    try { fontes = JSON.parse(decodeURIComponent(img.dataset.fontes || "%5B%5D")); } catch (_) {}
    if (fontes.length) {
      const proxima = fontes.shift();
      img.dataset.fontes = encodeURIComponent(JSON.stringify(fontes));
      img.src = proxima;
      return;
    }
    const cls = img.className || "teste-team-logo";
    const span = document.createElement("span");
    span.className = `${cls} teste-team-missing`;
    span.textContent = "?";
    img.replaceWith(span);
  };

  Interface._brasaoTeste = function (_url, nome, lado, mini = false) {
    const fontes = this._fontesEscudoTeste(nome);
    const classe = `teste-team-logo${mini ? " mini" : ""}`;
    if (!fontes.length) return `<span class="${classe} teste-team-missing">?</span>`;
    const primeira = fontes.shift();
    const restantes = encodeURIComponent(JSON.stringify(fontes));
    const id = this._escudoIdTeste(nome);
    return `<img class="${classe}" src="${esc(primeira)}" data-fontes="${esc(restantes)}" alt="${esc(nome || lado)}" loading="eager" decoding="async" onload="if(window.TesteEscudosCache)TesteEscudosCache.salvarVisto(this,${Number(id) || 0})" onerror="Interface._trocarFonteEscudoTeste(this)">`;
  };

  Interface._nomePartidaTeste = function (meta) {
    if (meta?.mandante && meta?.visitante) return `<span class="teste-team-inline">${this._brasaoTeste(meta?.escudoMandante, meta.mandante, "Mandante", true)}<strong>${esc(meta.mandante)}</strong></span><span class="teste-x">x</span><span class="teste-team-inline">${this._brasaoTeste(meta?.escudoVisitante, meta.visitante, "Visitante", true)}<strong>${esc(meta.visitante)}</strong></span>`;
    return `<span class="teste-await-inline">${AGUARDA}</span>`;
  };

  Interface._metaResultadoTeste = function (r) {
    const data = r?._temporal?.data || r?.dataPartida || "";
    const horario = r?._temporal?.horario || r?.horario || "";
    if (!horario) return null;

    // Primeiro usa os próprios times gravados junto do resultado no Firebase.
    // Isso permite montar "Últimas entradas" mesmo depois de limpar o
    // navegador ou abrir o painel quando aquela partida já saiu da agenda.
    const mandanteDireto = String(r?.mandante ?? r?.casa ?? r?.home?.name ?? r?.home ?? r?.timeCasa ?? "").trim();
    const visitanteDireto = String(r?.visitante ?? r?.fora ?? r?.away?.name ?? r?.away ?? r?.timeFora ?? "").trim();
    if (mandanteDireto && visitanteDireto) {
      return {
        data, horario,
        liga: r?.liga || r?.competicao || "Inglês Doméstico (Esportes Virtuais)",
        mandante: mandanteDireto,
        visitante: visitanteDireto,
        escudoMandante: r?.escudoMandante || r?.escudoCasa || r?.homeLogo || r?.home?.logo || "",
        escudoVisitante: r?.escudoVisitante || r?.escudoFora || r?.awayLogo || r?.away?.logo || "",
        _origem: "historico_compartilhado"
      };
    }

    const candidatos = [];

    try {
      if (typeof TesteProximasPartidas !== "undefined") {
        if (data) {
          const atual = TesteProximasPartidas.obterPartida({ data, horario });
          if (atual) return atual;
        }
        const snap = typeof TesteProximasPartidas.snapshot === "function"
          ? TesteProximasPartidas.snapshot()
          : [];
        if (Array.isArray(snap)) candidatos.push(...snap);
      }
    } catch (_) {}

    try {
      const cache = JSON.parse(localStorage.getItem("vai_na_fe_partidas_coletadas_base_zerada_v1") || "{}");
      candidatos.push(...Object.values(cache || {}));
      if (data && cache[`${data}|${horario}`]) return cache[`${data}|${horario}`];
    } catch (_) {}

    const limpos = candidatos.filter(x => x && x.horario && x.mandante && x.visitante);
    const iguais = limpos.filter(x => String(x.horario) === String(horario));
    if (!iguais.length) return null;

    const alvoData = data ? Date.parse(`${data}T00:00:00`) : NaN;
    iguais.sort((a, b) => {
      const aMesmoDia = data && a.data === data ? 0 : 1;
      const bMesmoDia = data && b.data === data ? 0 : 1;
      if (aMesmoDia !== bMesmoDia) return aMesmoDia - bMesmoDia;

      const aTempo = a.data ? Date.parse(`${a.data}T00:00:00`) : NaN;
      const bTempo = b.data ? Date.parse(`${b.data}T00:00:00`) : NaN;
      const aDiff = Number.isFinite(alvoData) && Number.isFinite(aTempo) ? Math.abs(aTempo - alvoData) : Number.MAX_SAFE_INTEGER;
      const bDiff = Number.isFinite(alvoData) && Number.isFinite(bTempo) ? Math.abs(bTempo - alvoData) : Number.MAX_SAFE_INTEGER;
      if (aDiff !== bDiff) return aDiff - bDiff;

      return `${b.data || ""}|${b.horario || ""}`.localeCompare(`${a.data || ""}|${a.horario || ""}`);
    });

    return iguais[0] || null;
  };

  Interface._nomeCompletoTimeTeste = function (nome) {
    const bruto = String(nome || "").trim();
    if (!bruto) return "—";
    let n = bruto.toLowerCase();
    try {
      if (typeof AnaliseContextualTimes !== "undefined" && typeof AnaliseContextualTimes._normTime === "function")
        n = AnaliseContextualTimes._normTime(bruto);
    } catch (_) {}
    const nomes = {
      "arsenal":"Arsenal", "aston villa":"Aston Villa", "bournemouth":"Bournemouth",
      "brentford":"Brentford", "brighton":"Brighton", "burnley":"Burnley",
      "chelsea":"Chelsea", "manchester city":"Manchester City", "crystal palace":"Crystal Palace",
      "everton":"Everton", "fulham":"Fulham", "leeds":"Leeds", "leicester":"Leicester",
      "liverpool":"Liverpool", "newcastle":"Newcastle", "norwich":"Norwich",
      "nottingham":"Nottingham Forest", "southampton":"Southampton", "tottenham":"Tottenham",
      "manchester united":"Manchester United", "watford":"Watford", "west ham":"West Ham",
      "wolverhampton":"Wolverhampton"
    };
    return nomes[n] || bruto;
  };

  Interface._confrontosDiretosHistoricoTeste = function (resultados, meta, limite = 10) {
    if (!meta?.mandante || !meta?.visitante) return [];
    const norm = nome => {
      try {
        if (typeof AnaliseContextualTimes !== "undefined" && typeof AnaliseContextualTimes._normTime === "function")
          return AnaliseContextualTimes._normTime(nome);
      } catch (_) {}
      return String(nome || "").trim().toLowerCase();
    };
    const a = norm(meta.mandante), b = norm(meta.visitante);
    const lista = (resultados || []).filter(r => {
      if (!r?.mandante || !r?.visitante || !r?.placar) return false;
      const x = norm(r.mandante), y = norm(r.visitante);
      return (x === a && y === b) || (x === b && y === a);
    }).sort((x,y) => {
      const kx = `${x?._temporal?.data || x?.data || ""}|${x?._temporal?.horario || x?.horario || ""}`;
      const ky = `${y?._temporal?.data || y?.data || ""}|${y?._temporal?.horario || y?.horario || ""}`;
      return ky.localeCompare(kx);
    });
    const n = Math.max(1, Number(limite) || 10);
    return lista.slice(0, n);
  };

  Interface._temMinimoConfrontosTeste = function () {
    // Compatibilidade com versões anteriores: H2H não bloqueia mais sugestões.
    return true;
  };

  Interface._ultimosDosTimesTeste = function (resultados, meta, limite = 5) {
    if (!meta?.mandante || !meta?.visitante) return [];
    const norm = nome => {
      try { return AnaliseContextualTimes._normTime(nome); } catch (_) { return String(nome || "").trim().toLowerCase(); }
    };
    const a = norm(meta.mandante), b = norm(meta.visitante);
    return (resultados || []).filter(r => {
      const x = norm(r?.mandante), y = norm(r?.visitante);
      return r?.placar && (x === a || y === a || x === b || y === b);
    }).slice(-Math.max(1, Number(limite) || 5)).reverse();
  };

  Interface._ultimosCasaVisitanteTeste = function (resultados, meta, limite = 10) {
    if (!meta?.mandante || !meta?.visitante) return { casa: [], visitante: [] };
    const norm = nome => {
      try { return AnaliseContextualTimes._normTime(nome); } catch (_) { return String(nome || "").trim().toLowerCase(); }
    };
    const casaAlvo = norm(meta.mandante);
    const visitanteAlvo = norm(meta.visitante);
    const validos = (resultados || []).filter(r => r?.placar && r?.mandante && r?.visitante);
    const n = Math.max(1, Number(limite) || 10);
    return {
      // Forma do mandante somente quando ele realmente jogou em casa.
      casa: validos.filter(r => norm(r.mandante) === casaAlvo).slice(-n).reverse(),
      // Forma do visitante somente quando ele realmente jogou fora.
      visitante: validos.filter(r => norm(r.visitante) === visitanteAlvo).slice(-n).reverse()
    };
  };

  Interface._htmlUltimosCasaVisitanteTeste = function (lista, timeAlvo, lado) {
    const itens = Array.isArray(lista) ? lista : [];
    const alvo = this._nomeCompletoTimeTeste(timeAlvo || "");
    if (!itens.length) return `<div class="teste-form-empty">Nenhum jogo anterior de ${esc(alvo || "este time")} nesta condição.</div>`;
    const norm = nome => {
      try { return AnaliseContextualTimes._normTime(nome); } catch (_) { return String(nome || "").trim().toLowerCase(); }
    };
    const alvoNorm = norm(timeAlvo);
    return itens.map(r => {
      const mandante = this._nomeCompletoTimeTeste(r?.mandante);
      const visitante = this._nomeCompletoTimeTeste(r?.visitante);
      const m = String(r?.placar || "").match(/^(\d+)\s*x\s*(\d+)$/i);
      const placar = m ? `${m[1]} x ${m[2]}` : String(r?.placar || "—");
      const data = r?._temporal?.data || r?.data || r?.dataPartida || "";
      const hora = r?._temporal?.horario || r?.horario || "";
      const casaAlvo = norm(r?.mandante) === alvoNorm;
      const foraAlvo = norm(r?.visitante) === alvoNorm;
      return `<div class="teste-form-row ${esc(lado || "")}">
        <span class="teste-form-time casa ${casaAlvo ? "alvo" : ""}">${esc(mandante || "—")}</span>
        <b class="teste-form-score">${esc(placar)}</b>
        <span class="teste-form-time fora ${foraAlvo ? "alvo" : ""}">${esc(visitante || "—")}</span>
        <small>${esc([data, hora].filter(Boolean).join(" · "))}</small>
      </div>`;
    }).join("");
  };

  Interface._htmlConfrontosTeste = function (lista) {
    const total = Array.isArray(lista) ? lista.length : 0;
    const nivel = total === 0 ? "SEM PESO H2H" : total <= 2 ? "PESO LEVE" : total <= 5 ? "PESO MÉDIO" : "PESO FORTE";
    const cab = `<div class="teste-h2h-progresso"><b>${total} confronto${total === 1 ? "" : "s"}</b><span>${nivel}</span></div>`;
    if (!total) return `${cab}<div class="teste-h2h-row vazio"><span>Nenhum confronto anterior entre estes times. A IA usa os outros fatores normalmente.</span></div>`;
    const linhas = lista.map(x => {
      const casa = this._nomeCompletoTimeTeste(x?.mandante);
      const fora = this._nomeCompletoTimeTeste(x?.visitante);
      const m = String(x?.placar || "").match(/^(\d+)\s*x\s*(\d+)$/i);
      const placar = m ? `${m[1]} x ${m[2]}` : String(x?.placar || "—");
      const data = x?._temporal?.data || x?.data || "";
      const hora = x?._temporal?.horario || x?.horario || "";
      return `<div class="teste-h2h-row">
        <span class="teste-h2h-time casa">${esc(casa)}</span>
        <b class="teste-h2h-score">${esc(placar)}</b>
        <span class="teste-h2h-time fora">${esc(fora)}</span>
        <small>${esc([data,hora].filter(Boolean).join(" · "))}</small>
      </div>`;
    }).join("");
    return cab + linhas;
  };

  Interface._ultimasEntradasTeste = function (d) {
    const resultados = (d.resultados || [])
      .map((r, indice) => ({r, indice}))
      .filter(x => x.r?.placar && x.r?._temporal?.horario)
      .slice(-5).reverse();
    if (!resultados.length) return `<div class="teste-empty">${AGUARDA}</div>`;

    return resultados.map(({r, indice}) => {
      const meta = this._metaResultadoTeste(r);
      const horario = r?._temporal?.horario || "--:--";
      const placar = r?.placar || "—";
      const chave = this._chaveResultadoTeste(r, indice);
      const selecionado = chave === this._resultadoSelecionadoTeste;
      const partida = meta?.mandante && meta?.visitante
        ? `<span class="teste-team-inline">${this._brasaoTeste(meta.escudoMandante, meta.mandante, "Mandante", true)}<strong>${esc(meta.mandante)}</strong></span><span class="teste-result-score">${esc(placar)}</span><span class="teste-team-inline">${this._brasaoTeste(meta.escudoVisitante, meta.visitante, "Visitante", true)}<strong>${esc(meta.visitante)}</strong></span>`
        : `<span class="teste-result-await">Times ainda não associados pelo coletor</span><span class="teste-result-score">${esc(placar)}</span>`;

      return `<button class="teste-match-row teste-result-row ${selecionado ? "selecionado" : ""}" data-teste-resultado="${esc(chave)}">
        <div class="teste-row-time"><span>REGISTRADA</span><b>${esc(horario)}</b></div>
        <div class="teste-league"><i>⚽</i><small>${esc(meta?.liga || "Inglês Doméstico (Esportes Virtuais)")}</small></div>
        <div class="teste-result-match">${partida}</div>
        <em class="teste-status neutro">VER ANÁLISE</em>
      </button>`;
    }).join("");
  };

  Interface._detalhesResultadoHistoricoTeste = function (d, r, indice) {
    const meta = this._metaResultadoTeste(r) || {};
    const horario = r?._temporal?.horario || r?.horario || "--:--";
    const data = r?._temporal?.data || r?.dataPartida || r?.data || "";
    const mandante = meta?.mandante || AGUARDA;
    const visitante = meta?.visitante || AGUARDA;
    const anteriores = (d.resultados || []).slice(0, Math.max(0, indice));
    const h2h = this._confrontosDiretosHistoricoTeste(anteriores, meta, 10);
    const hist = this._sugestoesHistoricasResultadoTeste(d, r, indice, meta);
    const sugestoes = hist.sugestoes || [];
    const principal = sugestoes[0] || null;
    const sugestoesHtml = sugestoes.length ? sugestoes.map((s, i) => {
      const acertou = this._avaliarSugestaoResultadoTeste(s, r);
      const status = acertou === true ? `<em class="teste-status green">GREEN</em>` : acertou === false ? `<em class="teste-status red">RED</em>` : `<em class="teste-status neutro">REGISTRADA</em>`;
      return `<div class="teste-suggestion-row">
        <span class="teste-suggestion-number">${i + 1}</span>
        <div><b>${esc(this._tituloIndividualSugestaoTeste(s))}</b>${s.descricao ? `<small>${esc(s.descricao)}</small>` : ""}</div>
        <div class="teste-conf"><small>CONFIANÇA</small><b>${pct(s.confianca)}</b></div>
        ${status}
      </div>`;
    }).join("") : `<div class="teste-empty">Nenhuma sugestão registrada para esta partida.</div>`;

    const forma = this._ultimosCasaVisitanteTeste(anteriores, meta, 10);
    const casaHtml = this._htmlUltimosCasaVisitanteTeste(forma.casa, mandante, "casa");
    const visitanteHtml = this._htmlUltimosCasaVisitanteTeste(forma.visitante, visitante, "visitante");
    const h2hHtml = this._htmlConfrontosTeste(h2h);

    return `<section class="ia-card teste-panel teste-details">
      <div class="teste-detail-head"><h2>DETALHES DA ENTRADA</h2><span>PARTIDA REGISTRADA</span></div>
      <div class="teste-league-title">⚽ ${esc(meta?.liga || "Inglês Doméstico (Esportes Virtuais)")}</div>
      <div class="teste-match-hero">
        <div class="teste-team teste-team-side">${this._brasaoTeste(meta?.escudoMandante, mandante, "Mandante")}<b>${esc(mandante)}</b></div>
        <div class="teste-kickoff"><b>${esc(r?.placar || "—")}</b><small>${esc(data)} · ${esc(horario)}</small><span>FINAL</span></div>
        <div class="teste-team teste-team-side">${this._brasaoTeste(meta?.escudoVisitante, visitante, "Visitante")}<b>${esc(visitante)}</b></div>
      </div>
      <div class="teste-best-market">
        <div class="teste-best-title"><span>▥</span><div><small>MERCADO MAIS INDICADO NAQUELE JOGO</small><b>${esc(principal ? this._tituloIndividualSugestaoTeste(principal) : AGUARDA)}</b><p>${esc(principal?.descricao || hist.origem || "Sem sugestão registrada.")}</p></div></div>
        <div class="teste-best-metrics"><div><small>CONFIANÇA</small><b>${pct(principal?.confianca)}</b></div></div>
      </div>
      <div class="teste-section-title">SUGESTÕES DOS ESPECIALISTAS NAQUELE JOGO (${sugestoes.length})</div>
      <div class="teste-suggestion-list">${sugestoesHtml}</div>
      <div class="teste-analysis"><b>▤ REGISTRO DA ANÁLISE</b><p>${esc(hist.analise || hist.origem || "Sugestões anteriores ao resultado.")}</p><small>${esc(hist.origem || "")}</small></div>
      <div class="teste-bottom-details teste-bottom-form">
        <div class="teste-form-box"><div class="teste-form-head"><h3>ÚLTIMOS JOGOS CASA</h3><b>${esc(this._nomeCompletoTimeTeste(mandante))}</b><span>${forma.casa.length}/10</span></div><div class="teste-form-list">${casaHtml}</div></div>
        <div class="teste-form-box"><div class="teste-form-head"><h3>ÚLTIMOS JOGOS VISITANTE</h3><b>${esc(this._nomeCompletoTimeTeste(visitante))}</b><span>${forma.visitante.length}/10</span></div><div class="teste-form-list">${visitanteHtml}</div></div>
        <div class="teste-h2h-box"><h3>CONFRONTO DIRETO</h3><div class="teste-h2h">${h2hHtml}</div></div>
      </div>
    </section>`;
  };

  Interface._pagina_entradas = function (d) {
    const slots = this._slotsEntradasTeste(d);
    // Somente a primeira partida da fila pode virar OFICIAL. As demais
    // continuam como prévias dinâmicas e nunca são gravadas.
    this._garantirSugestaoOficialAtualTeste(d, slots);

    const resultadosComIndice = (d.resultados || []).map((r, indice) => ({r, indice}));
    const historicoSelecionado = this._resultadoSelecionadoTeste
      ? resultadosComIndice.find(x => this._chaveResultadoTeste(x.r, x.indice) === this._resultadoSelecionadoTeste)
      : null;
    if (this._resultadoSelecionadoTeste && !historicoSelecionado) this._resultadoSelecionadoTeste = null;

    const painelUltimas = `<div class="ia-card teste-panel teste-last-panel">
      <div class="teste-panel-head"><div><h2>◷ ÚLTIMAS ENTRADAS</h2><p>Partidas já registradas com horário, times, escudos e placar. Clique para rever as sugestões daquele jogo.</p></div><span>⌄</span></div>
      <div>${this._ultimasEntradasTeste(d)}</div>
    </div>`;

    if (!slots.length) {
      const detalhes = historicoSelecionado
        ? this._detalhesResultadoHistoricoTeste(d, historicoSelecionado.r, historicoSelecionado.indice)
        : `<section class="ia-card teste-panel teste-details teste-details-empty"><div class="teste-detail-head"><h2>DETALHES DA ENTRADA</h2><span>SEM PARTIDA</span></div><div class="teste-no-selection"><b>Nenhuma partida selecionada</b><small>Você também pode clicar em uma das últimas entradas para rever as sugestões daquele jogo.</small></div></section>`;
      return `<div class="teste-entradas-grid">
        <section class="teste-left-column">
          <div class="ia-card teste-panel teste-suggestions-panel">
            <div class="teste-panel-head"><div><h2>★ SUGESTÕES DE ENTRADA</h2><p>Próximas partidas em ordem de horário. Clique em uma para ver a análise completa.</p></div><span>⌄</span></div>
            <div class="teste-no-upcoming"><b>Nenhuma próxima partida registrada</b><small>O coletor ainda não cadastrou uma nova partida em /proximas_partidas.</small></div>
          </div>
          ${painelUltimas}
        </section>
        ${detalhes}
      </div>`;
    }

    const selecionadaExiste = slots.some(s => `${s.data}|${s.horario}` === this._partidaSelecionadaTeste);
    if (!selecionadaExiste) this._partidaSelecionadaTeste = `${slots[0].data}|${slots[0].horario}`;
    const slotSelecionado = slots.find(s => `${s.data}|${s.horario}` === this._partidaSelecionadaTeste) || slots[0];
    const metaSelecionado = this._metaPartidaTeste(slotSelecionado);

    const slotOficial = this._partidaAtualOficialTeste(slots, d.resultados || []);
    const chaveOficial = slotOficial ? `${slotOficial.data}|${slotOficial.horario}` : "";
    const chaveSelecionada = `${slotSelecionado.data}|${slotSelecionado.horario}`;
    const registroOficialSelecionado = chaveSelecionada === chaveOficial
      ? this._obterSnapshotSugestoesTeste(slotSelecionado)
      : null;

    // A selecionada sempre pode ser analisada agora. Se for FUTURA, este valor é
    // apenas uma PRÉVIA e pode mudar a cada novo resultado. Se a partida atual já
    // tem sugestões oficiais salvas, NÃO recalculamos nada para ela: mostramos o
    // registro imutável e poupamos processamento.
    const selecionadaEhOficial = Boolean(
      chaveSelecionada === chaveOficial &&
      registroOficialSelecionado?.status === "oficial" &&
      registroOficialSelecionado?.sugestoes?.length
    );
    const sugestoesCalculadas = selecionadaEhOficial ? [] : this._sugestoesEntradasTeste(d, metaSelecionado);
    const contextoCalculadoSelecionado = selecionadaEhOficial ? null : this._ultimaAnaliseContextualTeste;
    const sugestoes = selecionadaEhOficial
      ? this._filtrarSugestoesTeste(registroOficialSelecionado.sugestoes).slice(0,3)
      : this._filtrarSugestoesTeste(sugestoesCalculadas).slice(0,3);
    const principal = sugestoes[0] || null;

    const lista = slots.map((slot, i) => {
      const meta = this._metaPartidaTeste(slot);
      const chave = `${slot.data}|${slot.horario}`;
      const labels = ["PARTIDA ATUAL", "PRÓXIMA PARTIDA", "DAQUI A 2 JOGOS", "DAQUI A 3 JOGOS", "DAQUI A 4 JOGOS"];
      const ehOficial = chave === chaveOficial;
      const registro = ehOficial ? this._obterSnapshotSugestoesTeste(slot) : null;
      const selecionado = !this._resultadoSelecionadoTeste && chave === this._partidaSelecionadaTeste;
      const qtd = registro?.sugestoes?.length
        ? this._filtrarSugestoesTeste(registro.sugestoes).slice(0,3).length
        : (selecionado ? sugestoes.length : null);
      const rotuloContagem = ehOficial && registro?.sugestoes?.length
        ? "oficiais"
        : (selecionado ? "prévia" : "prévia");
      return `<button class="teste-match-row ${selecionado ? "selecionado" : ""}" data-teste-partida="${esc(chave)}">
        <div class="teste-row-time"><span>${labels[i] || "PRÓXIMO JOGO"}</span><b>${esc(slot.horario)}</b></div>
        <div class="teste-league"><i>⚽</i><small>${esc(meta?.liga || "Inglês Doméstico (Esportes Virtuais)")}</small></div>
        <div class="teste-teams-line">${this._nomePartidaTeste(meta)}</div>
        <div class="teste-count"><b>${qtd == null ? "—" : qtd}</b><small>${rotuloContagem}</small></div>
        <span class="teste-chevron">›</span>
      </button>`;
    }).join("");

    let detalhes;
    if (historicoSelecionado) {
      detalhes = this._detalhesResultadoHistoricoTeste(d, historicoSelecionado.r, historicoSelecionado.indice);
    } else {
      const mandante = metaSelecionado?.mandante || AGUARDA;
      const visitante = metaSelecionado?.visitante || AGUARDA;
      const ctxAtual = contextoCalculadoSelecionado || this._ultimaAnaliseContextualTeste;
      const h2h = this._confrontosDiretosHistoricoTeste(d.resultados || [], metaSelecionado, 10);
      const analise = (selecionadaEhOficial ? registroOficialSelecionado?.analise : "") ||
        (ctxAtual?.disponivel
          ? (ctxAtual.leituraConfronto || ctxAtual.resumo)
          : (metaSelecionado?.analise || principal?.descricao || "Calculando o contexto do confronto com os dados disponíveis; H2H é apenas um dos pesos."));
      const estadoSugestao = selecionadaEhOficial ? "OFICIAL — SALVA PARA ESTE JOGO" : "PRÉVIA — PODE MUDAR";
      const tituloSugestoes = selecionadaEhOficial ? "3 SUGESTÕES OFICIAIS" : "3 SUGESTÕES — PRÉVIA DINÂMICA";
      const forma = this._ultimosCasaVisitanteTeste(d.resultados || [], metaSelecionado, 10);
      const under35Fixo = this._under35FixoTeste(d);
      const under35FixoHtml = `<div class="teste-under35-fixo ${under35Fixo.ativo ? "ativo" : "silencioso"}"><div><small>U3.5 FIXO · FORA DAS 3 SUGESTÕES</small><b>${esc(under35Fixo.titulo)}</b><p>${esc(under35Fixo.descricao)}</p></div><div class="teste-under35-status"><span>${esc(under35Fixo.status)}</span><b>${under35Fixo.ativo ? pct(under35Fixo.confianca) : "—"}</b></div></div>`;
      const sugestoesHtml = sugestoes.length ? sugestoes.map((s, i) => `<div class="teste-suggestion-row">
        <span class="teste-suggestion-number">${i + 1}</span>
        <div><b>${esc(this._tituloIndividualSugestaoTeste(s))}</b>${s.descricao ? `<small>${esc(s.descricao)}</small>` : ""}</div>
        <div class="teste-conf"><small>CONFIANÇA</small><b>${pct(s.confianca)}</b></div>
        <em class="${s.principal ? "principal" : "alternativa"}">${s.principal ? "PRINCIPAL" : "ALTERNATIVA"}${s.forca ? ` · ${esc(s.forca)}` : ""}</em>
      </div>`).join("") : `<div class="teste-empty">${AGUARDA}</div>`;
      const casaHtml = this._htmlUltimosCasaVisitanteTeste(forma.casa, mandante, "casa");
      const visitanteHtml = this._htmlUltimosCasaVisitanteTeste(forma.visitante, visitante, "visitante");
      const h2hHtml = this._htmlConfrontosTeste(h2h);

      detalhes = `<section class="ia-card teste-panel teste-details">
        <div class="teste-detail-head"><h2>DETALHES DA ENTRADA</h2><span>${esc(estadoSugestao)}</span></div>
        <div class="teste-league-title">⚽ ${esc(metaSelecionado?.liga || "Inglês Doméstico (Esportes Virtuais)")}</div>
        <div class="teste-match-hero">
          <div class="teste-team teste-team-side">${this._brasaoTeste(metaSelecionado?.escudoMandante, mandante, "Mandante")}<b>${esc(mandante)}</b></div>
          <div class="teste-kickoff"><b>${esc(slotSelecionado.horario)}</b><small>${esc(slotSelecionado.data)}</small><span>×</span></div>
          <div class="teste-team teste-team-side">${this._brasaoTeste(metaSelecionado?.escudoVisitante, visitante, "Visitante")}<b>${esc(visitante)}</b></div>
        </div>
        <div class="teste-best-market">
          <div class="teste-best-title"><span>▥</span><div><small>MERCADO MAIS INDICADO (IA)</small><b>${esc(principal ? this._tituloIndividualSugestaoTeste(principal) : AGUARDA)}</b><p>${esc(principal?.descricao || "Calculando o melhor mercado da base limpa. O confronto direto entra como peso, sem bloquear a análise.")}</p></div></div>
          <div class="teste-best-metrics"><div><small>CONFIANÇA</small><b>${pct(principal?.confianca)}</b></div></div>
        </div>
        ${under35FixoHtml}
        <div class="teste-section-title">${esc(tituloSugestoes)} (${sugestoes.length})</div>
        <div class="teste-suggestion-list">${sugestoesHtml}</div>
        <div class="teste-analysis"><b>▤ ANÁLISE DA IA</b><p>${esc(analise)}</p></div>
        <div class="teste-bottom-details teste-bottom-form">
          <div class="teste-form-box"><div class="teste-form-head"><h3>ÚLTIMOS JOGOS CASA</h3><b>${esc(this._nomeCompletoTimeTeste(mandante))}</b><span>${forma.casa.length}/10</span></div><div class="teste-form-list">${casaHtml}</div></div>
          <div class="teste-form-box"><div class="teste-form-head"><h3>ÚLTIMOS JOGOS VISITANTE</h3><b>${esc(this._nomeCompletoTimeTeste(visitante))}</b><span>${forma.visitante.length}/10</span></div><div class="teste-form-list">${visitanteHtml}</div></div>
          <div class="teste-h2h-box"><h3>CONFRONTO DIRETO</h3><div class="teste-h2h">${h2hHtml}</div></div>
        </div>
      </section>`;
    }

    return `<div class="teste-entradas-grid">
      <section class="teste-left-column">
        <div class="ia-card teste-panel teste-suggestions-panel">
          <div class="teste-panel-head"><div><h2>★ SUGESTÕES DE ENTRADA</h2><p>Próximas partidas em ordem de horário. Clique em uma para ver a análise completa.</p></div><span>⌄</span></div>
          <div class="teste-match-list">${lista}</div>
        </div>
        ${painelUltimas}
      </section>
      ${detalhes}
    </div>`;
  };

  Interface._pagina_configuracoes = function (d) {
    const base = originalConfig(d);
    const cfg = typeof TesteProximasPartidas !== "undefined" ? TesteProximasPartidas.config() : {caminhoPartidas:"proximas_partidas"};
    const st = typeof TesteProximasPartidas !== "undefined" ? TesteProximasPartidas.status() : {estado:"indisponivel",erro:"",quantidade:0};
    const principal = typeof TesteProximasPartidas !== "undefined" ? TesteProximasPartidas.firebasePrincipal() : "";
    return `${base}<section class="ia-setting teste-firebase-setting"><div><span>◉</span><div><h2>Próximas partidas — mesmo Firebase</h2><p>O histórico continua em /historico_compartilhado. Esta camada lê somente a agenda do programa e nunca transforma esses dados em resultado.</p></div></div><div>
      <label>Firebase atual <b class="teste-url-readonly">${esc(principal || "Não identificado")}</b></label>
      <label>Caminho das próximas partidas <input id="teste-proximas-path" type="text" value="${esc(cfg.caminhoPartidas)}"></label>
      <button id="teste-proximas-save" class="ia-outline-btn">Salvar caminho no modo teste</button>
      <small class="teste-fb-status ${esc(st.estado)}">Status: ${esc(st.estado)} · ${Number(st.quantidade || 0)} partida(s) lida(s)${st.erro ? ` · ${esc(st.erro)}` : ""}</small>
    </div></section>`;
  };

  Interface._eventosPaginaModerna = function () {
    originalEventosPagina();
    document.querySelectorAll("[data-teste-partida]").forEach(btn => {
      btn.onclick = () => {
        this._resultadoSelecionadoTeste = null;
        this._partidaSelecionadaTeste = btn.dataset.testePartida;
        this._renderModerno();
      };
    });
    document.querySelectorAll("[data-teste-resultado]").forEach(btn => {
      btn.onclick = () => {
        this._resultadoSelecionadoTeste = btn.dataset.testeResultado;
        this._renderModerno();
      };
    });
    const save = document.getElementById("teste-proximas-save");
    if (save && typeof TesteProximasPartidas !== "undefined") {
      save.onclick = () => {
        const path = document.getElementById("teste-proximas-path")?.value || "proximas_partidas";
        TesteProximasPartidas.salvarCaminho(path);
        TesteProximasPartidas.iniciar();
        this._renderModerno();
      };
    }
  };

  Interface._estilosModernos = function () {
    originalEstilos();
    if (document.getElementById("teste-entradas-css")) return;
    const st = document.createElement("style");
    st.id = "teste-entradas-css";
    st.textContent = `
      .teste-entradas-grid{display:grid;grid-template-columns:minmax(560px,1.06fr) minmax(500px,.94fr);gap:12px;align-items:start}
      .teste-left-column{display:grid;gap:12px}.teste-panel{padding:0;overflow:hidden;border-radius:9px}.teste-panel-head{min-height:46px;display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #152945;background:linear-gradient(180deg,#08152a,#06101f)}
      .teste-panel-head h2{margin:0!important;font-size:14px!important}.teste-panel-head p{margin:2px 0 0;color:#8f9bb2;font-size:10px}.teste-panel-head>span{font-size:20px;color:#aab5c9}.teste-match-list{padding:6px}
      .teste-match-row{width:100%;display:grid;grid-template-columns:88px 145px minmax(180px,1fr) 58px 14px;gap:8px;align-items:center;text-align:left;color:#edf2ff;background:#071326;border:1px solid #183154;border-radius:6px;padding:5px 8px;margin:4px 0;cursor:pointer;min-height:47px}
      .teste-match-row:hover{border-color:#4e1e8f}.teste-match-row.selecionado{background:linear-gradient(90deg,#32105d,#101630);border:1px solid #b900ff;box-shadow:0 0 0 1px rgba(185,0,255,.15)}
      .teste-row-time{display:flex;flex-direction:column;gap:1px}.teste-row-time span{font-size:8px;font-weight:800;color:#69b8ff;background:#063e75;border-radius:2px;padding:2px 4px;width:max-content}.teste-match-row.selecionado .teste-row-time span{background:#8300cb;color:#fff}.teste-row-time b{font-size:15px}
      .teste-league{display:flex;gap:6px;align-items:center;min-width:0}.teste-league i{font-style:normal;color:#ff00f5}.teste-league small{font-size:9px;color:#bec7d8;line-height:1.1}.teste-teams-line{font-size:11px;font-weight:700;display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden}.teste-team-inline{display:inline-flex;align-items:center;gap:5px;min-width:0}.teste-team-inline strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:125px}.teste-x{margin:0 3px;color:#92a2ba;flex:0 0 auto}.teste-await-inline{font-weight:600;color:#9a84b8}
      .teste-count{height:38px;border:1px solid #1b3d66;background:#082247;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center}.teste-count b{font-size:17px;color:#b9ceff}.teste-count small{font-size:8px;color:#7ca6d7}.teste-chevron{font-size:20px;color:#8cb6ef}
      .teste-last-panel{min-height:165px}.teste-result-row{grid-template-columns:88px 145px minmax(250px,1fr) 82px;cursor:pointer}.teste-result-row:hover{border-color:#7d2fc4}.teste-result-row .teste-row-time span{background:#063e75;color:#69b8ff}.teste-result-match{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;overflow:hidden}.teste-result-score{font-size:13px;color:#fff;white-space:nowrap;padding:3px 7px;border-radius:4px;background:#0a1d35;border:1px solid #1a3a61}.teste-result-await{font-size:9px;color:#8f9bb2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.teste-status{font-style:normal;font-size:9px;padding:5px;border-radius:4px;text-align:center}.teste-status.green{color:#23ef9b;background:#064f38;border:1px solid #078b5d}.teste-status.red{color:#ff6575;background:#53101c;border:1px solid #8e1c2c}.teste-status.neutro{color:#91a8c7;background:#0c223c;border:1px solid #244769}
      .teste-details{padding:10px;min-height:535px}.teste-detail-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #142842;padding:0 0 8px}.teste-detail-head h2{margin:0!important;font-size:13px!important}.teste-detail-head span{font-size:8px;padding:4px 7px;border-radius:3px;background:#5d157a;color:#f5c8ff}.teste-league-title{text-align:center;color:#a8b4c9;font-size:9px;padding:8px 0 3px}
      .teste-match-hero{display:grid;grid-template-columns:1fr 110px 1fr;align-items:center;gap:8px;padding:2px 0 9px}.teste-team{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}.teste-team.teste-team-side{flex-direction:row;justify-content:center;gap:8px}.teste-team b{font-size:11px;max-width:140px;overflow-wrap:anywhere}.teste-team-logo{width:42px;height:42px;object-fit:contain;flex:0 0 auto}.teste-team-logo.mini{width:20px;height:20px}.teste-team-missing{display:inline-grid;place-items:center;border-radius:50%;border:1px solid #28415f;background:#0a1728;color:#91a8c7;font-size:8px;font-weight:800}.teste-kickoff{text-align:center;display:flex;flex-direction:column;align-items:center}.teste-kickoff b{font-size:22px}.teste-kickoff small{font-size:8px;color:#8fa0bc}.teste-kickoff span{font-size:11px;color:#6d7e9b;margin-top:2px}
      .teste-best-market{display:grid;grid-template-columns:1fr 155px;gap:10px;border:1px solid #0d4a39;background:linear-gradient(90deg,#042d24,#071929);border-radius:6px;padding:8px 10px}.teste-best-title{display:flex;gap:10px;align-items:center}.teste-best-title>span{font-size:25px;color:#00df94}.teste-best-title small{display:block;color:#aab8ca;font-size:8px}.teste-best-title b{display:block;font-size:15px;margin-top:2px}.teste-best-title p{margin:2px 0 0;color:#9ab1b8;font-size:8px}.teste-best-metrics{display:grid;grid-template-columns:1fr;align-items:center}.teste-best-metrics div{text-align:center;border-left:1px solid #14523f}.teste-best-metrics small{display:block;font-size:7px;color:#93a5b8}.teste-best-metrics b{font-size:16px}
      .teste-under35-fixo{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-top:8px;padding:8px 10px;border:1px solid #24445f;border-radius:6px;background:#071829}.teste-under35-fixo.ativo{border-color:#0b7652;background:#05261f}.teste-under35-fixo>div:first-child{min-width:0}.teste-under35-fixo small{display:block;font-size:7px;color:#8fa6be}.teste-under35-fixo b{display:block;font-size:12px;margin-top:2px}.teste-under35-fixo p{margin:2px 0 0;font-size:8px;color:#8fa6be}.teste-under35-status{text-align:right;min-width:72px}.teste-under35-status span{display:block;font-size:7px;color:#7eb6e8}.teste-under35-fixo.ativo .teste-under35-status span{color:#58e6ad}.teste-under35-status b{font-size:13px}.teste-section-title{font-size:9px;font-weight:800;margin:9px 0 4px;color:#cbd5e6}.teste-suggestion-list{border-top:1px solid #14253c}.teste-suggestion-row{display:grid;grid-template-columns:26px minmax(220px,1fr) 70px 108px;gap:7px;align-items:center;padding:7px 5px;border-bottom:1px solid #14253c}.teste-suggestion-number{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#0d2749;color:#c3d8ff;font-size:9px}.teste-suggestion-row>div:nth-child(2){display:flex;flex-direction:column}.teste-suggestion-row>div:nth-child(2) b{font-size:10px}.teste-suggestion-row>div:nth-child(2) small{font-size:8px;color:#8293ae}.teste-conf{text-align:center}.teste-conf small{display:block;font-size:6px;color:#7f90aa}.teste-conf b{font-size:11px}.teste-suggestion-row em{font-style:normal;font-size:7px;text-align:center;padding:4px;border-radius:3px}.teste-suggestion-row em.principal{color:#63ffbc;background:#064f38;border:1px solid #0c865e}.teste-suggestion-row em.alternativa{color:#72bcff;background:#082d52;border:1px solid #0c5793}
      .teste-analysis{border:1px solid #8422bd;background:linear-gradient(90deg,#22083b,#10091f);border-radius:6px;padding:8px 10px;margin-top:8px}.teste-analysis b{font-size:9px;color:#fb3cff}.teste-analysis p{font-size:9px;line-height:1.45;color:#c7b9da;margin:4px 0 0}.teste-bottom-details{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px}.teste-bottom-details>div{border:1px solid #172943;border-radius:6px;padding:7px}.teste-bottom-details h3{font-size:8px;margin:0 0 6px}.teste-recent-scores{display:flex;gap:4px;flex-wrap:wrap}.teste-score-chip{font-size:9px;font-weight:800;padding:5px 8px;border-radius:4px;background:#0b3d28;color:#70ff9d;border:1px solid #155c3c}.teste-bottom-form .teste-h2h-box{grid-column:1/-1}.teste-form-head{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center;margin-bottom:5px}.teste-form-head h3{grid-column:1/-1;margin-bottom:2px!important}.teste-form-head b{font-size:9px;color:#e7effc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.teste-form-head span{font-size:7px;font-weight:900;color:#8da2bb;border:1px solid #223752;border-radius:999px;padding:2px 5px}.teste-form-list{display:grid;gap:2px}.teste-form-row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:6px;padding:5px 1px;border-bottom:1px solid #14243a}.teste-form-row:last-child{border-bottom:0}.teste-form-time{font-size:7px;font-weight:700;color:#aebed1;white-space:normal;line-height:1.2}.teste-form-time.casa{text-align:right}.teste-form-time.fora{text-align:left}.teste-form-time.alvo{color:#eef7ff;font-weight:900}.teste-form-score{min-width:38px;text-align:center;font-size:8px;color:#78f6ac}.teste-form-row small{grid-column:1/-1;text-align:center;color:#60758e;font-size:6px;margin-top:-2px}.teste-form-empty{font-size:7px;color:#8e7aa9;padding:6px 1px;line-height:1.35}.teste-h2h{display:grid;gap:3px}.teste-h2h-row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:7px;font-size:8px;padding:6px 2px;border-bottom:1px solid #172943}.teste-h2h-row .teste-h2h-time{font-weight:800;color:#d7e5f7;white-space:normal}.teste-h2h-row .teste-h2h-time.casa{text-align:right}.teste-h2h-row .teste-h2h-time.fora{text-align:left}.teste-h2h-row .teste-h2h-score{min-width:42px;text-align:center;color:#78f6ac;font-size:9px}.teste-h2h-row small{grid-column:1/-1;text-align:center;color:#647991;font-size:6px;margin-top:-2px}.teste-h2h-row.vazio{grid-template-columns:1fr;color:#8e7aa9}.teste-h2h-row.vazio span{text-align:left}.teste-empty{text-align:center;color:#8f7aa9;padding:14px}
      .teste-no-upcoming,.teste-no-selection{min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-align:center;color:#b9c7da;padding:22px}.teste-no-upcoming b,.teste-no-selection b{font-size:14px;color:#d8e4f5}.teste-no-upcoming small,.teste-no-selection small{font-size:9px;color:#7f91aa}.teste-details-empty{min-height:300px}
      .teste-firebase-setting input{background:#061326;color:white;border:1px solid #16528c;border-radius:5px;padding:7px;min-width:260px}.teste-url-readonly{font-size:9px;max-width:360px;overflow-wrap:anywhere;text-align:right}.teste-fb-status{display:block;padding:8px;color:#9eb0c7}.teste-fb-status.online{color:#24e999}.teste-fb-status.erro{color:#ff6371}
      .teste-h2h-progresso{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 7px;margin-bottom:5px;border:1px solid #27405c;border-radius:6px;background:#07101e}.teste-h2h-progresso b{color:#c9f7e3;font-size:11px}.teste-h2h-progresso span{font-size:8px;color:#8ea5bd;text-transform:uppercase;letter-spacing:.4px}
      @media(max-width:1180px){.teste-entradas-grid{grid-template-columns:1fr}.teste-details{min-height:auto}.teste-match-row{grid-template-columns:86px 135px minmax(160px,1fr) 56px 12px}.teste-result-row{grid-template-columns:86px 135px minmax(250px,1fr) 82px}}
      @media(max-width:760px){.teste-match-row{grid-template-columns:72px 1fr 48px 12px}.teste-league{display:none}.teste-teams-line{font-size:10px}.teste-team-inline strong{max-width:80px}.teste-count{height:34px}.teste-match-hero{grid-template-columns:1fr 82px 1fr}.teste-team.teste-team-side{flex-direction:column;gap:4px}.teste-best-market{grid-template-columns:1fr}.teste-best-metrics{border-top:1px solid #14523f;padding-top:6px}.teste-best-metrics div:first-child{border-left:0}.teste-suggestion-row{grid-template-columns:24px 1fr 48px}.teste-suggestion-row em{grid-column:2/-1}.teste-bottom-details{grid-template-columns:1fr}.teste-result-row{grid-template-columns:72px 1fr 72px}.teste-result-row .teste-league{display:none}.teste-result-match{justify-content:flex-start}.teste-result-score{font-size:11px;padding:2px 5px}}
    `;
    document.head.appendChild(st);
  };

  window.addEventListener("vai-na-fe:proximas-partidas-atualizada", () => {
    // Uma mudança na agenda pode fazer a próxima partida virar a PARTIDA ATUAL.
    // Só nesse instante tentamos salvar as sugestões oficiais. Jogos futuros
    // continuam sendo prévias e não são gravados.
    if (typeof Interface !== "undefined" && typeof Interface._garantirSugestaoOficialAtualTeste === "function") {
      try { Interface._garantirSugestaoOficialAtualTeste(); } catch (_) {}
    }
    if (typeof Interface !== "undefined" && Interface._paginaModerna === "entradas") Interface._renderModerno();
    if (typeof Interface !== "undefined" && Interface._paginaModerna === "configuracoes") Interface._renderModerno();
  });
})();
