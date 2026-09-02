import { normalizeName } from '../utils/names.js';

const FACT = Array.from({length: 12}, (_, n) => n <= 1 ? 1 : null);
for (let i = 2; i < FACT.length; i++) FACT[i] = FACT[i-1] * i;

function poisson(k, lambda) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / FACT[k];
}

function resultScore(match) {
  const s = match?.score?.fullTime || {};
  const home = Number(s.home);
  const away = Number(s.away);
  return Number.isFinite(home) && Number.isFinite(away) ? { home, away } : null;
}

function teamStats(matches, teamName) {
  const key = normalizeName(teamName);
  const stats = {
    homeGames: 0, awayGames: 0,
    homeGF: 0, homeGA: 0,
    awayGF: 0, awayGA: 0,
    recent: []
  };

  const finished = matches
    .filter(m => m.status === 'FINISHED' && resultScore(m))
    .sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate));

  for (const m of finished) {
    const score = resultScore(m);
    const homeKey = normalizeName(m.homeTeam?.name);
    const awayKey = normalizeName(m.awayTeam?.name);
    if (homeKey === key) {
      stats.homeGames++;
      stats.homeGF += score.home;
      stats.homeGA += score.away;
      stats.recent.push({ gf: score.home, ga: score.away, venue: 'H', date: m.utcDate });
    } else if (awayKey === key) {
      stats.awayGames++;
      stats.awayGF += score.away;
      stats.awayGA += score.home;
      stats.recent.push({ gf: score.away, ga: score.home, venue: 'A', date: m.utcDate });
    }
  }
  stats.recent = stats.recent.slice(-8);
  return stats;
}

function leagueAverages(matches) {
  let games = 0, homeGoals = 0, awayGoals = 0;
  for (const m of matches) {
    if (m.status !== 'FINISHED') continue;
    const score = resultScore(m);
    if (!score) continue;
    games++;
    homeGoals += score.home;
    awayGoals += score.away;
  }
  return {
    games,
    home: games ? homeGoals / games : 1.35,
    away: games ? awayGoals / games : 1.05
  };
}

function shrink(rate, games, prior = 5) {
  // aproxima força relativa a 1.0 com amostra pequena
  return ((rate * games) + prior) / (games + prior);
}

function recentMultiplier(recent) {
  if (!recent.length) return 1;
  const avgGd = recent.reduce((s, r) => s + (r.gf - r.ga), 0) / recent.length;
  return Math.max(0.85, Math.min(1.15, 1 + avgGd * 0.035));
}

export function analyzeMatch(match, seasonMatches) {
  const homeName = match.homeTeam.name;
  const awayName = match.awayTeam.name;
  const league = leagueAverages(seasonMatches);
  const hs = teamStats(seasonMatches, homeName);
  const as = teamStats(seasonMatches, awayName);

  const hGF = hs.homeGames ? hs.homeGF / hs.homeGames : league.home;
  const hGA = hs.homeGames ? hs.homeGA / hs.homeGames : league.away;
  const aGF = as.awayGames ? as.awayGF / as.awayGames : league.away;
  const aGA = as.awayGames ? as.awayGA / as.awayGames : league.home;

  const homeAttack = shrink(hGF / Math.max(league.home, .01), hs.homeGames);
  const homeDefense = shrink(hGA / Math.max(league.away, .01), hs.homeGames);
  const awayAttack = shrink(aGF / Math.max(league.away, .01), as.awayGames);
  const awayDefense = shrink(aGA / Math.max(league.home, .01), as.awayGames);

  let lambdaHome = league.home * homeAttack * awayDefense * recentMultiplier(hs.recent);
  let lambdaAway = league.away * awayAttack * homeDefense * recentMultiplier(as.recent);
  lambdaHome = Math.max(0.25, Math.min(3.8, lambdaHome));
  lambdaAway = Math.max(0.20, Math.min(3.4, lambdaAway));

  let home = 0, draw = 0, away = 0, over25 = 0, btts = 0;
  const scorelines = [];
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = poisson(h, lambdaHome) * poisson(a, lambdaAway);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
      if (h + a >= 3) over25 += p;
      if (h > 0 && a > 0) btts += p;
      scorelines.push({ score: `${h}x${a}`, p });
    }
  }
  scorelines.sort((x,y) => y.p - x.p);

  const total = home + draw + away;
  home /= total; draw /= total; away /= total;
  const under25 = 1 - over25;

  return {
    homeTeam: homeName,
    awayTeam: awayName,
    kickoff: match.utcDate,
    sample: { leagueGames: league.games, homeGames: hs.homeGames, awayGames: as.awayGames },
    expectedGoals: { home: lambdaHome, away: lambdaAway, total: lambdaHome + lambdaAway },
    probabilities: {
      home,
      draw,
      away,
      over25,
      under25,
      btts,
      noBtts: 1 - btts
    },
    likelyScores: scorelines.slice(0, 5)
  };
}
