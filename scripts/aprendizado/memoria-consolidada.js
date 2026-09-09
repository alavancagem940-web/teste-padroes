"use strict";

/*
 * BASE ZERADA — 2026-09-08
 *
 * A versão de teste não carrega nenhum placar, aprendizado ou backup antigo.
 * O histórico passa a nascer vazio e é preenchido somente pelos novos
 * resultados recebidos do Firebase (/historico_compartilhado).
 */
const MemoriaConsolidada = {
  versao: "2026-09-09-BASE-LIMPA-H2H10-V2",
  quantidade: 0,
  placares: "",
  aprendizadoInicial: {},
  criarBase() { return []; }
};
