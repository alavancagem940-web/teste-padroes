"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  // Entrega o primeiro frame ao Safari antes de iniciar leituras e cálculos.
  setTimeout(() => {
  try {
    if (
      typeof Historico === "undefined" ||
      typeof Interface === "undefined" ||
      typeof MemoriaConsolidada === "undefined"
    ) {
      throw new Error("Modulos principais ou memoria consolidada nao encontrados.");
    }

    const baseMemoria = MemoriaConsolidada.criarBase();
    Historico.iniciar();
    Historico.carregarDados(baseMemoria, false, { baseQuantidade: baseMemoria.length });
    Historico.definirBaseEstudo(baseMemoria.length);

    if (typeof Aprendizado !== "undefined") {
      Aprendizado.iniciar(MemoriaConsolidada.aprendizadoInicial);
    }

    // Carrega o histórico real já salvo no aparelho. Isso é apenas cache de tela;
    // a partida atual só vira OFICIAL depois que a carga remota completa terminar.
    const salvos = typeof Armazenamento !== "undefined" ? Armazenamento.obterDados() : [];
    const locaisRecentes = (Array.isArray(salvos) ? salvos : [])
      .filter(item =>
        item && typeof item === "object" && item.fonte === "ao-vivo" && item.placar &&
        item._temporal?.data && item._temporal?.horario && item.mandante && item.visitante
      )
      .sort((a,b) => `${a._temporal.data}|${a._temporal.horario}`.localeCompare(`${b._temporal.data}|${b._temporal.horario}`))
      .slice(-500);
    if (locaisRecentes.length) Historico.importarResultadosAoVivo(locaisRecentes, false);

    Historico.definirBaseEstudo(baseMemoria.length);
    Historico.persistir();

    // IMPORTANTE: nunca reconstruímos centenas de previsões históricas na thread
    // principal durante a abertura. Esse replay era o principal responsável pelos
    // congelamentos longos no Safari/iPhone. A memória V4 vem pronta do Firebase/
    // localStorage; resultados NOVOS são aprendidos um por vez depois, sem backlog.
    const agendarAprendizadoRecente = (quantidadeNova = 1) => {
      if (typeof Aprendizado === "undefined" || !Aprendizado.aprenderIndice) return;
      if (Aprendizado._aprendendoRecente) return;
      const resultados = Historico.obterTodos();
      const limite = Math.max(1, Math.min(3, Number(quantidadeNova) || 1));
      const indices = [];
      for (let i = resultados.length - 1; i > 0 && indices.length < limite; i--) {
        const chave = Aprendizado._chaveResultado?.(resultados[i]);
        if (chave && !Aprendizado._processados?.has(chave)) indices.unshift(i);
      }
      if (!indices.length) return;

      Aprendizado._aprendendoRecente = true;
      let pos = 0;
      const concluir = () => {
        Aprendizado._aprendendoRecente = false;
        try { Aprendizado._salvarLocal?.(); } catch (_) {}
        try {
          if (typeof Sincronizacao !== "undefined" && Sincronizacao.publicarMemoriaAprendizado) {
            Sincronizacao.publicarMemoriaAprendizado(Aprendizado.exportar());
          }
        } catch (_) {}
        if (typeof Interface !== "undefined") Interface.atualizar();
      };
      const passo = () => {
        if (pos >= indices.length) return concluir();
        try {
          Aprendizado.aprenderIndice(resultados, indices[pos], { persistir:false });
        } catch (e) {
          console.warn("Falha ao aprender resultado recente:", e);
        }
        pos++;
        if (pos < indices.length) setTimeout(passo, 700);
        else concluir();
      };
      // Dá prioridade à interação e à pintura da tela; aprende depois.
      setTimeout(passo, 1200);
    };

    window.__VAI_NA_FE_BASE_PRONTA__ = false;
    Interface.iniciar();
    console.log("Painel aberto com", Historico.obterQuantidadeComHorario(), "resultado(s) em cache.");

    if (typeof Sincronizacao !== "undefined" && Sincronizacao.configurada()) {
      Sincronizacao.observar(lista => {
        const adicionados = Historico.importarResultadosAoVivo(lista, true);
        const timesEnriquecidos = Number(Historico._ultimoEnriquecimentoTimes || 0);
        if (adicionados) agendarAprendizadoRecente(adicionados);
        if ((adicionados || timesEnriquecidos) && typeof Interface !== "undefined") {
          Interface.atualizar();
        }
      });

      (async () => {
        try {
          await Sincronizacao.limparMemoriasAntigasRemotasUmaVez();

          // Usa a memória individual pronta. Se a rede falhar, mantém a cópia local;
          // em hipótese nenhuma faz replay de centenas de jogos na abertura.
          try {
            const remota = await Sincronizacao.obterMemoriaAprendizado();
            if (remota && typeof Aprendizado !== "undefined") Aprendizado.importar(remota);
          } catch (_) {}

          const listaCompleta = await Sincronizacao.obterHistoricoCompleto();
          Historico.importarResultadosAoVivo(listaCompleta || [], true);
          window.__VAI_NA_FE_BASE_PRONTA__ = true;
          if (typeof Interface !== "undefined") Interface.atualizar();
          Sincronizacao.iniciar();
        } catch (e) {
          console.warn("Historico completo indisponivel; usando cache local:", e);
          window.__VAI_NA_FE_BASE_PRONTA__ = true;
          if (typeof Interface !== "undefined") Interface.atualizar();
          Sincronizacao.iniciar();
        }
      })();
    } else {
      window.__VAI_NA_FE_BASE_PRONTA__ = true;
      if (typeof Interface !== "undefined") Interface.atualizar();
    }

    // Compatibilidade com o registro antigo; não recalcula mercados aqui.
    if (
      typeof PalpitesRegistrados !== "undefined" &&
      typeof RelogioPartidas !== "undefined"
    ) {
      const atual = RelogioPartidas.partidaAtual();
      const temResultado = Historico.temResultadoNoHorario(atual);
      const temPalpite = PalpitesRegistrados.obterParaPartida(atual);
      const ultimoPalpite = PalpitesRegistrados.obterUltimo();
      if (!temResultado && !temPalpite && ultimoPalpite?.palpites) {
        PalpitesRegistrados.registrarParaPartida(atual, ultimoPalpite.palpites, "reabertura-app");
      }
    }
  } catch (erro) {
    console.error("Erro ao iniciar o aplicativo:", erro);
    if (app) {
      app.innerHTML = `<div style="max-width:720px;margin:30px auto;padding:18px;border:1px solid #e6b8b8;background:#fff5f5;font-family:Arial,sans-serif"><h2 style="margin-top:0;color:#9b1c1c">Nao foi possivel abrir o painel</h2><p>Atualize a pagina. Se continuar, publique novamente todos os arquivos desta versao.</p><small>${String(erro?.message || erro)}</small></div>`;
    }
  }
  }, 0);
});
