"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  try {
    if (
      typeof Historico === "undefined" ||
      typeof Interface === "undefined" ||
      typeof MemoriaConsolidada === "undefined"
    ) {
      throw new Error("Modulos principais ou memoria consolidada nao encontrados.");
    }

    // Esta versão de teste nasce com base vazia. Não há backup embutido nem
    // memória antiga: somente resultados novos do Firebase passam a alimentar o histórico.
    const baseMemoria = MemoriaConsolidada.criarBase();
    Historico.iniciar();
    Historico.carregarDados(baseMemoria, false, {
      baseQuantidade: baseMemoria.length
    });
    Historico.definirBaseEstudo(baseMemoria.length);

    if (typeof Aprendizado !== "undefined") {
      Aprendizado.iniciar(MemoriaConsolidada.aprendizadoInicial);
    }

    // O cache local guarda somente resultados reais. Carregamos no maximo os
    // 10 recentes para a tela nascer preenchida sem reconstruir o historico.
    const salvos = typeof Armazenamento !== "undefined"
      ? Armazenamento.obterDados()
      : [];
    const locaisRecentes = (Array.isArray(salvos) ? salvos : [])
      .filter(item =>
        item &&
        typeof item === "object" &&
        item.fonte === "ao-vivo" &&
        item.placar &&
        item._temporal?.data &&
        item._temporal?.horario &&
        item.mandante &&
        item.visitante
      )
      .sort((a, b) =>
        `${a._temporal.data}|${a._temporal.horario}`.localeCompare(
          `${b._temporal.data}|${b._temporal.horario}`
        )
      )
      .slice(-20);
    if (locaisRecentes.length) {
      Historico.importarResultadosAoVivo(locaisRecentes, false);
    }

    Historico.definirBaseEstudo(baseMemoria.length);
    Historico.persistir();

    // A tela abre ANTES de qualquer consulta remota.
    Interface.iniciar();
    console.log(
      "Painel aberto com base zerada e",
      Historico.obterQuantidadeComHorario(),
      "resultado(s) recente(s)."
    );

    if (typeof Sincronizacao !== "undefined" && Sincronizacao.configurada()) {
      Sincronizacao.observar(lista => {
        const adicionados = Historico.importarResultadosAoVivo(lista, true);
        const timesEnriquecidos = Number(Historico._ultimoEnriquecimentoTimes || 0);
        if (adicionados && typeof Aprendizado !== "undefined") {
          Aprendizado.aprenderPendentes(Historico.obterTodos());
        }
        // Mesmo quando o placar já estava no cache local, uma leitura nova do
        // Firebase pode completar mandante/visitante. Nesse caso a interface
        // também precisa redesenhar a linha sem contar um novo resultado.
        if ((adicionados || timesEnriquecidos) && typeof Interface !== "undefined") {
          Interface.atualizar();
        }
      });
      // Primeiro limpa as memórias derivadas antigas e reconstrói a base completa.
      // Só depois liga o polling de 10 resultados; assim nenhum snapshot de entrada
      // nasce antes de o ranking dos mercados terminar de aprender a base limpa.
      (async () => {
        try {
          await Sincronizacao.limparMemoriasAntigasRemotasUmaVez();

          // A V4 separa cada mercado/lado. Se já existir em outro dispositivo,
          // pode ser importada sem misturar a memória agregada antiga.
          try {
            const remota = await Sincronizacao.obterMemoriaAprendizado();
            if (remota && typeof Aprendizado !== "undefined") Aprendizado.importar(remota);
          } catch (_) {}

          const listaCompleta = await Sincronizacao.obterHistoricoCompleto();
          Historico.importarResultadosAoVivo(listaCompleta || [], true);

          const finalizar = () => {
            if (typeof Interface !== "undefined") Interface.atualizar();
            Sincronizacao.iniciar();
          };
          if (typeof Aprendizado !== "undefined") {
            const iniciou = Aprendizado.aprenderPendentes(Historico.obterTodos(), finalizar);
            if (!iniciou) finalizar();
          } else {
            finalizar();
          }
        } catch (e) {
          console.warn("Base limpa completa indisponivel:", e);
          Sincronizacao.iniciar();
        }
      })();
    }

    // Mantem o palpite da partida atual quando o navegador e reaberto.
    if (
      typeof PalpitesRegistrados !== "undefined" &&
      typeof RelogioPartidas !== "undefined"
    ) {
      const atual = RelogioPartidas.partidaAtual();
      const temResultado = Historico.temResultadoNoHorario(atual);
      const temPalpite = PalpitesRegistrados.obterParaPartida(atual);
      const ultimoPalpite = PalpitesRegistrados.obterUltimo();
      if (!temResultado && !temPalpite && ultimoPalpite?.palpites) {
        PalpitesRegistrados.registrarParaPartida(
          atual,
          ultimoPalpite.palpites,
          "reabertura-app"
        );
      }
    }
  } catch (erro) {
    console.error("Erro ao iniciar o aplicativo:", erro);
    if (app) {
      app.innerHTML = `
        <div style="max-width:720px;margin:30px auto;padding:18px;border:1px solid #e6b8b8;background:#fff5f5;font-family:Arial,sans-serif">
          <h2 style="margin-top:0;color:#9b1c1c">Nao foi possivel abrir o painel</h2>
          <p>Atualize a pagina com <b>Ctrl + F5</b>. Se continuar, publique novamente todos os arquivos desta versao.</p>
          <small>${String(erro?.message || erro)}</small>
        </div>`;
    }
  }
});
