import { cached } from '../utils/cache.js';
import { sameTeam } from '../utils/names.js';

const BASE = 'https://api.the-odds-api.com/v4';

export const LEAGUES = {
  brasileirao: { label: 'Brasileirão Série A', sport: 'soccer_brazil_campeonato', tier: 1 },
  'brasileirao-b': { label: 'Brasileirão Série B', sport: 'soccer_brazil_serie_b', tier: 2 },
  'premier-league': { label: 'Premier League', sport: 'soccer_epl', tier: 1 },
  championship: { label: 'Championship', sport: 'soccer_efl_champ', tier: 2 },
  'la-liga': { label: 'La Liga', sport: 'soccer_spain_la_liga', tier: 1 },
  'la-liga-2': { label: 'La Liga 2', sport: 'soccer_spain_segunda_division', tier: 2 },
  'serie-a': { label: 'Serie A', sport: 'soccer_italy_serie_a', tier: 1 },
  'serie-b-italy': { label: 'Serie B Italiana', sport: 'soccer_italy_serie_b', tier: 2 },
  bundesliga: { label: 'Bundesliga', sport: 'soccer_germany_bundesliga', tier: 1 },
  'bundesliga-2': { label: '2. Bundesliga', sport: 'soccer_germany_bundesliga2', tier: 2 },
  'ligue-1': { label: 'Ligue 1', sport: 'soccer_france_ligue_one', tier: 1 },
  'ligue-2': { label: 'Ligue 2', sport: 'soccer_france_ligue_two', tier: 2 },
  'saudi-pro-league': { label: 'Saudi Pro League', sport: 'soccer_saudi_arabia_pro_league', tier: 1 }
};

export const MAJOR_FIVE = ['premier-league', 'la-liga', 'serie-a', 'bundesliga', 'ligue-1'];
export const MAJOR_SECOND = ['brasileirao-b', 'championship', 'la-liga-2', 'serie-b-italy', 'bundesliga-2', 'ligue-2'];

function apiKey() {
  const k = process.env.ODDS_API_KEY;
  if (!k) throw new Error('ODDS_API_KEY não configurada no arquivo .env');
  return k;
}

async function fetchTimed(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { signal:controller.signal }); }
  catch (error) {
    if (error?.name === 'AbortError') throw new Error(`The Odds API demorou mais de ${Math.round(timeoutMs/1000)}s para responder.`);
    throw error;
  } finally { clearTimeout(timer); }
}

export async function getLeagueOdds(leagueKey) {
  const league = LEAGUES[leagueKey];
  if (!league) throw new Error(`Liga desconhecida: ${leagueKey}`);
  const ttl = Number(process.env.CACHE_TTL_SECONDS || 300) * 1000;
  const regions = process.env.ODDS_REGIONS || 'eu,uk';
  const markets = process.env.ODDS_MARKETS || 'h2h,totals';
  const url = `${BASE}/sports/${league.sport}/odds/?apiKey=${encodeURIComponent(apiKey())}&regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(markets)}&oddsFormat=decimal&dateFormat=iso`;
  return cached(`odds:${league.sport}:${regions}:${markets}`, ttl, async () => {
    const res = await fetchTimed(url);
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 && /OUT_OF_USAGE_CREDITS|quota|usage limit/i.test(body)) {
        const error = new Error('A cota da The Odds API acabou. As análises com odds ficam pausadas até a cota ser renovada ou uma nova chave com créditos ser configurada no Render.');
        error.code = 'ODDS_QUOTA_EXHAUSTED';
        throw error;
      }
      const error = new Error(`The Odds API indisponível (${res.status}). Verifique a chave e o painel da API.`);
      error.code = 'ODDS_API_ERROR';
      throw error;
    }
    return res.json();
  });
}


export async function getLeagueEvents(leagueKey) {
  const league = LEAGUES[leagueKey];
  if (!league) throw new Error(`Liga desconhecida: ${leagueKey}`);
  const ttl = 60 * 1000;
  const url = `${BASE}/sports/${league.sport}/events?apiKey=${encodeURIComponent(apiKey())}&dateFormat=iso`;
  return cached(`events:${league.sport}`, ttl, async () => {
    const res = await fetchTimed(url);
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 && /OUT_OF_USAGE_CREDITS|quota|usage limit/i.test(body)) {
        const error = new Error('A cota da The Odds API acabou. O modo alternativo de partidas/placar também fica indisponível até a renovação da cota.');
        error.code = 'ODDS_QUOTA_EXHAUSTED';
        throw error;
      }
      throw new Error(`The Odds API indisponível para eventos (${res.status}).`);
    }
    return res.json();
  });
}

export async function getLeagueScores(leagueKey) {
  const league = LEAGUES[leagueKey];
  if (!league) throw new Error(`Liga desconhecida: ${leagueKey}`);
  const ttl = Math.max(30, Number(process.env.ODDS_SCORE_CACHE_SECONDS || 60)) * 1000;
  const url = `${BASE}/sports/${league.sport}/scores?apiKey=${encodeURIComponent(apiKey())}&dateFormat=iso`;
  return cached(`scores:${league.sport}`, ttl, async () => {
    const res = await fetchTimed(url);
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 && /OUT_OF_USAGE_CREDITS|quota|usage limit/i.test(body)) {
        const error = new Error('A cota da The Odds API acabou. O acompanhamento por placar alternativo fica pausado até a renovação da cota.');
        error.code = 'ODDS_QUOTA_EXHAUSTED';
        throw error;
      }
      throw new Error(`The Odds API indisponível para placares (${res.status}).`);
    }
    return res.json();
  });
}

export function normalizeOddsEvent(event, leagueKey) {
  const league = LEAGUES[leagueKey];
  return {
    fixtureId: `odds~${leagueKey}~${event.id}`,
    provider: 'odds',
    eventId: event.id,
    leagueKey,
    date: event.commence_time,
    status: 'NS',
    statusLong: 'Agendado',
    elapsed: null,
    league: { id: null, name: league?.label || event.sport_title || leagueKey, round: '' },
    home: { id: null, name: event.home_team || '', logo: '' },
    away: { id: null, name: event.away_team || '', logo: '' },
    goals: { home: 0, away: 0 },
    stats: { home: {}, away: {} },
    players: [],
    events: [],
    hasDetailedStats: false
  };
}

export function normalizeOddsScore(event, leagueKey) {
  const base = normalizeOddsEvent(event, leagueKey);
  const scoreMap = new Map((event.scores || []).map(row => [row.name, Number(row.score || 0)]));
  const hasScore = Array.isArray(event.scores) && event.scores.length > 0;
  return {
    ...base,
    status: event.completed ? 'FT' : (hasScore ? 'LIVE' : 'NS'),
    statusLong: event.completed ? 'Finalizado' : (hasScore ? 'Ao vivo' : 'Agendado'),
    goals: {
      home: scoreMap.get(event.home_team) ?? 0,
      away: scoreMap.get(event.away_team) ?? 0
    }
  };
}

export async function getBrasileiraoOdds() {
  return getLeagueOdds('brasileirao');
}

export function findOddsGame(home, away, games) {
  return games.find(g => sameTeam(g.home_team, home) && sameTeam(g.away_team, away)) ||
         games.find(g => sameTeam(g.home_team, away) && sameTeam(g.away_team, home));
}

export function summarizeOdds(game) {
  if (!game) return { bookmakers: [], best: {}, consensus: {} };
  const rows = [];
  for (const book of game.bookmakers || []) {
    for (const market of book.markets || []) {
      if (market.key === 'h2h') {
        for (const outcome of market.outcomes || []) {
          rows.push({ bookmaker: book.title, market: 'h2h', name: outcome.name, price: outcome.price });
        }
      }
      if (market.key === 'totals') {
        for (const outcome of market.outcomes || []) {
          if (Number(outcome.point) === 2.5) {
            rows.push({ bookmaker: book.title, market: 'totals_2_5', name: outcome.name, price: outcome.price, point: outcome.point });
          }
        }
      }
    }
  }

  const best = {};
  for (const r of rows) {
    const key = `${r.market}:${r.name}`;
    if (!best[key] || r.price > best[key].price) best[key] = r;
  }

  const byMarket = {};
  for (const r of rows) {
    byMarket[r.market] ??= {};
    byMarket[r.market][r.name] ??= [];
    byMarket[r.market][r.name].push(r.price);
  }
  const consensus = {};
  for (const [market, selections] of Object.entries(byMarket)) {
    const raw = {};
    let total = 0;
    for (const [name, prices] of Object.entries(selections)) {
      const sorted = [...prices].sort((a,b) => a-b);
      const n = sorted.length;
      const median = n % 2 ? sorted[(n-1)/2] : (sorted[n/2-1] + sorted[n/2]) / 2;
      raw[name] = 1 / median;
      total += raw[name];
    }
    consensus[market] = Object.fromEntries(Object.entries(raw).map(([name,p]) => [name, total ? p / total : p]));
  }

  return { bookmakers: [...new Set(rows.map(r => r.bookmaker))], best, consensus };
}
