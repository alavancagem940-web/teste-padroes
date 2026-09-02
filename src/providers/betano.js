/**
 * Adaptador reservado para Betano Brasil.
 *
 * Não implementamos scraping de site/app aqui. Quando houver um feed/API
 * autorizado ou fornecedor licenciado com odds da Betano Brasil, implemente
 * a leitura neste módulo e converta o retorno para o formato interno:
 *
 * {
 *   homeTeam, awayTeam, commenceTime,
 *   markets: {
 *     h2h: { home, draw, away },
 *     totals25: { over, under }
 *   }
 * }
 */
export async function getBetanoBrazilOdds() {
  return [];
}
