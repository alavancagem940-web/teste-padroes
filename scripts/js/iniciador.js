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

    // A memoria treinada esta dentro do proprio site. Nao existe espera por
    // Firebase nem releitura de backup para os mercados lembrarem o que sabem.
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
        item._temporal?.horario
      )
      .sort((a, b) =>
        `${a._temporal.data}|${a._temporal.horario}`.localeCompare(
          `${b._temporal.data}|${b._temporal.horario}`
        )
      )
      .slice(-10);
    if (locaisRecentes.length) {
      Historico.importarResultadosAoVivo(locaisRecentes, false);
    }

    Historico.definirBaseEstudo(baseMemoria.length);
    Historico.persistir();

    // A tela abre ANTES de qualquer consulta remota.
    Interface.iniciar();
    console.log(
      "Painel aberto com memoria permanente e",
      Historico.obterQuantidadeComHorario(),
      "resultado(s) recente(s)."
    );

    if (typeof Sincronizacao !== "undefined" && Sincronizacao.configurada()) {
      Sincronizacao.observar(lista => {
        const adicionados = Historico.importarResultadosAoVivo(lista, true);
        if (adicionados && typeof Aprendizado !== "undefined") {
          Aprendizado.aprenderPendentes(Historico.obterTodos());
        }
        if (adicionados && typeof Interface !== "undefined") {
          Interface.atualizar();
        }
      });
      Sincronizacao.iniciar();

      // Atualiza a memoria em segundo plano. Se a rede falhar, a memoria
      // embutida/local continua pronta e o site permanece aberto.
      Sincronizacao.obterMemoriaAprendizado().then(remota => {
        if (
          remota &&
          typeof Aprendizado !== "undefined" &&
          Aprendizado.importar(remota)
        ) {
          Interface.atualizar();
        }
      }).catch(() => {});
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
