function clean(value='') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isWomensFixture(fixture) {
  if (!fixture) return false;
  if (fixture.isWomensFootball === true) return true;
  const gender = clean(fixture?.gender || fixture?.league?.gender || fixture?.strGender || '');
  if (/^(female|women|womens|feminino|feminina)$/.test(gender)) return true;
  const text = clean(`${fixture?.league?.name || ''} ${fixture?.seasonSlug || ''} ${fixture?.espnScope || ''}`);
  return /(?:women|womens|woman|female|feminino|feminina|femenino|femenina|femeni|femminile|frauen|liga f|wsl|division 1 feminine|d1 feminine|nwsl)/.test(text);
}

export function excludedFromFavoriteMarket(fixture) {
  const leagueName = clean(fixture?.league?.name);
  const seasonSlug = clean(fixture?.seasonSlug);
  const country = clean(fixture?.league?.country);
  const scope = clean(fixture?.espnScope);
  const competitionText = `${leagueName} ${seasonSlug} ${scope}`.trim();

  // Competições internacionais que já eram excluídas do Mercado dos Favoritos.
  if (country === 'world') return true;
  if (/champions league|libertadores|sudamericana|sul americana/.test(competitionText)) return true;

  // O Mercado dos Favoritos é voltado a futebol profissional de clubes. A busca
  // ampla da ESPN também pode devolver NCAA, ligas universitárias, base/reservas
  // e competições explicitamente amadoras; essas partidas não devem alimentar
  // os bilhetes automáticos.
  const nonProfessionalCompetition = /\b(?:ncaa|college|collegiate|university soccer|amateur|academy|development league|reserve(?:s)?|youth|under[ -]?(?:17|18|19|20|21|23)|u[ -]?(?:17|18|19|20|21|23))\b/;
  if (nonProfessionalCompetition.test(competitionText)) return true;

  // Alguns feeds universitários dos EUA chegam com rótulo genérico, mas deixam
  // a natureza da competição explícita no país + nome/slug. Não bloqueamos clubes
  // profissionais que apenas contenham "University/Universidad" no nome do time.
  const usCollegeContext = /united states|usa|u s a|us/.test(country) && /\b(?:college|collegiate|university)\b/.test(competitionText);
  if (usCollegeContext) return true;

  return false;
}

export function favoriteFixtureEligible(fixture) {
  if (!fixture || excludedFromFavoriteMarket(fixture)) return false;
  return Boolean(fixture.home?.name && fixture.away?.name && fixture.date);
}
