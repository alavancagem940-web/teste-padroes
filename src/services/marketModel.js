import { deriveExpectedGoals } from './advancedMarkets.js';

function pickCaseInsensitive(obj, wanted) {
  const pair = Object.entries(obj || {}).find(([name]) => name.toLowerCase() === wanted.toLowerCase());
  return pair?.[1];
}

function resultProbabilities(game, oddsSummary) {
  const h2h = oddsSummary.consensus?.h2h || {};
  const home = pickCaseInsensitive(h2h, game.home_team) ?? 0;
  const away = pickCaseInsensitive(h2h, game.away_team) ?? 0;
  const draw = pickCaseInsensitive(h2h, 'Draw') ?? pickCaseInsensitive(h2h, 'Empate') ?? 0;
  const total = home + draw + away;
  return total ? { home: home/total, draw: draw/total, away: away/total } : { home: .34, draw: .32, away: .34 };
}

function totalsProbabilities(oddsSummary) {
  const totals = oddsSummary.consensus?.totals_2_5 || {};
  let over25 = 0, under25 = 0;
  for (const [name,p] of Object.entries(totals)) {
    if (name.toLowerCase().startsWith('over')) over25 = p;
    if (name.toLowerCase().startsWith('under')) under25 = p;
  }
  const total = over25 + under25;
  return total ? { over25: over25/total, under25: under25/total } : { over25: .51, under25: .49 };
}

export function analyzeMarketGame(game, oddsSummary, leagueKey, leagueLabel) {
  const r = resultProbabilities(game, oddsSummary);
  const t = totalsProbabilities(oddsSummary);
  const expectedGoals = deriveExpectedGoals({ ...r, ...t });
  const btts = (1 - Math.exp(-expectedGoals.home)) * (1 - Math.exp(-expectedGoals.away));
  return {
    mode: 'market-consensus',
    probabilitySource: 'Consenso das odds + modelo de distribuição',
    leagueKey,
    leagueLabel,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    kickoff: game.commence_time,
    sample: { bookmakers: oddsSummary.bookmakers.length },
    expectedGoals,
    likelyScores: [],
    probabilities: {
      ...r,
      ...t,
      btts,
      noBtts: 1 - btts
    }
  };
}
