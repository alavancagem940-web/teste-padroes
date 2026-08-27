"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (typeof Historico === "undefined" || typeof Interface === "undefined") {
      throw new Error("Módulos principais não encontrados.");
    }

    // O backup é carregado diretamente pelo script backup.js.
    // Isso permite abrir o projeto localmente (file://) sem depender de fetch.
    const backupAtual = (typeof Backup !== "undefined" && Array.isArray(Backup)) ? Backup : null;
    if (!backupAtual) {
      throw new Error("Backup não carregado. Verifique scripts/backup/backup.js.");
    }

    if (!Array.isArray(backupAtual)) {
      throw new Error("O backup carregado não contém uma lista válida de resultados.");
    }

    globalThis.Backup = backupAtual;

    Historico.iniciar();

    // O BACKUP é exclusivamente base de aprendizado.
    // O histórico atual é reconstruído separadamente a partir dos resultados ao-vivo locais
    // e, quando configurado, do banco compartilhado.
    const VERSAO_BACKUP = "2026-08-27-SESSAO-CONTINUA-TEMPORAL-FIREBASE-V1";
    const versaoLocal = localStorage.getItem("esportes_virtuais_backup_versao");
    const salvo = typeof Armazenamento !== "undefined" ? Armazenamento.obterDados() : [];

    // Ao trocar de versão, metadados antigos de horários não devem contaminar a sessão.
    if (versaoLocal !== VERSAO_BACKUP && typeof Armazenamento !== "undefined") {
      Armazenamento.salvarMetadadosTemporais([]);
      Armazenamento.salvarHorariosSemDados([]);
    }
    localStorage.setItem("esportes_virtuais_backup_versao", VERSAO_BACKUP);

    // Marcadores PAUSA de backups antigos são ignorados. A base de estudo conta
    // somente placares válidos; a sessão temporal real será contínua.
    const quantidadeBackupValida = backupAtual.filter(item => {
      const placar = typeof item === "string" ? item : item?.placar;
      return placar !== "PAUSA" && typeof placar === "string" && /^\d+x\d+$/i.test(placar.trim());
    }).length;

    Historico.carregarDados(backupAtual, false, {baseQuantidade: quantidadeBackupValida});
    Historico.definirBaseEstudo(quantidadeBackupValida);

    // Resultados de sessões anteriores continuam sendo aprendizado. Primeiro usa
    // o que existe localmente como fallback; depois mescla o Firebase.
    const locaisAnteriores = Array.isArray(salvo) ? salvo.filter(item =>
      item && typeof item === "object" && item.fonte === "ao-vivo" && item.placar &&
      item._temporal?.data && item._temporal?.horario
    ) : [];
    if (locaisAnteriores.length) Historico.importarResultadosAoVivo(locaisAnteriores, false);

    let remotosAnteriores = [];
    if (typeof Sincronizacao !== "undefined" && Sincronizacao.configurada()) {
      try {
        remotosAnteriores = await Sincronizacao.obterHistoricoCompleto();
        if (remotosAnteriores.length) Historico.importarResultadosAoVivo(remotosAnteriores, false);
      } catch (e) {
        console.warn("Firebase indisponível na abertura; usando histórico local como base:", e);
      }
    }

    // A base fixa continua sendo apenas o BACKUP. Todos os resultados reais com
    // horário permanecem na sequência contínua, inclusive os recuperados do
    // Firebase em outro dispositivo. Assim a contagem temporal nunca zera.
    Historico.definirBaseEstudo(quantidadeBackupValida);
    if (typeof Historico.persistir === "function") Historico.persistir();
    localStorage.setItem("esportes_virtuais_base_estudo_qtd", String(quantidadeBackupValida));

    // Banco compartilhado: novos resultados de qualquer dispositivo entram na
    // mesma sequência temporal contínua e são persistidos localmente como cache.
    if (typeof Sincronizacao !== "undefined" && Sincronizacao.configurada()) {
      Sincronizacao.observar(lista => {
        Historico.importarResultadosAoVivo(lista, true);
        if (typeof Interface !== "undefined" && Interface.atualizar) Interface.atualizar();
      });
      await Sincronizacao.iniciar();
    }

    // Se o app foi fechado durante uma partida, o último palpite salvo é
    // associado uma única vez ao horário da partida que estiver rolando na
    // abertura. O palpite não é recalculado para essa partida.
    if (typeof PalpitesRegistrados !== "undefined" && typeof RelogioPartidas !== "undefined") {
      const atual = RelogioPartidas.partidaAtual();
      const temResultado = Historico.temResultadoNoHorario(atual);
      const temPalpite = PalpitesRegistrados.obterParaPartida(atual);
      const ultimoPalpite = PalpitesRegistrados.obterUltimo();
      if (!temResultado && !temPalpite && ultimoPalpite?.palpites) {
        PalpitesRegistrados.registrarParaPartida(atual, ultimoPalpite.palpites, "reabertura-app");
        console.log("Último palpite associado à partida atual:", atual.horario);
      }
    }

    console.log("Resultados carregados:", Historico.obterQuantidade());
    console.log("Sequências encerradas:", Historico.obterQuantidadeSequencias());

    Interface.iniciar();
  } catch (erro) {
    console.error("Erro ao iniciar o aplicativo:", erro);
  }
});
