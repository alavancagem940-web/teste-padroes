import { cached } from '../utils/cache.js';

const BASE = 'https://v3.football.api-sports.io';
const RAPID_BASE = 'https://api-football-v1.p.rapidapi.com/v3';

const quotaState = {
  minuteLimit: null,
  minuteRemaining: null,
  dailyLimit: null,
  dailyRemaining: null,
  retryAfter: null,
  updatedAt: 0
};

function headerNumber(response, name) {
  const raw = response?.headers?.get?.(name);
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function updateQuota(response) {
  if (!response) return;
  quotaState.minuteLimit = headerNumber(response, 'x-ratelimit-limit') ?? quotaState.minuteLimit;
  quotaState.minuteRemaining = headerNumber(response, 'x-ratelimit-remaining') ?? quotaState.minuteRemaining;
  quotaState.dailyLimit = headerNumber(response, 'x-ratelimit-requests-limit') ?? quotaState.dailyLimit;
  quotaState.dailyRemaining = headerNumber(response, 'x-ratelimit-requests-remaining') ?? quotaState.dailyRemaining;
  quotaState.retryAfter = headerNumber(response, 'retry-after');
  quotaState.updatedAt = Date.now();
}

export function getApiFootballQuota() {
  return { ...quotaState };
}

export const API_FOOTBALL_LEAGUES = {
  39: 'Premier League', 40: 'Championship', 45: 'FA Cup', 48: 'EFL Cup', 528: 'Community Shield',
  140: 'La Liga', 141: 'La Liga 2', 143: 'Copa del Rey', 556: 'Supercopa da Espanha',
  135: 'Serie A', 136: 'Serie B Italiana', 137: 'Coppa Italia', 547: 'Supercoppa Italiana',
  78: 'Bundesliga', 79: '2. Bundesliga', 81: 'DFB Pokal', 529: 'Supercopa da Alemanha',
  61: 'Ligue 1', 62: 'Ligue 2', 66: 'Coupe de France', 526: 'Trophée des Champions',
  71: 'Brasileirão Série A', 72: 'Brasileirão Série B', 73: 'Copa do Brasil',
  179: 'Scottish Premiership', 181: 'Scottish Cup',
  94: 'Primeira Liga', 96: 'Taça de Portugal',
  88: 'Eredivisie', 90: 'KNVB Beker',
  203: 'Süper Lig', 206: 'Türkiye Kupası',
  307: 'Saudi Pro League'
};

function apiKey() {
  const key = String(process.env.API_FOOTBALL_KEY || '').trim();
  if (!key) throw new Error('API_FOOTBALL_KEY não configurada. Adicione a chave da API-Football nas variáveis de ambiente.');
  return key;
}

function buildUrl(base, pathname, params = {}) {
  const url = new URL(`${base}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchApi(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    const body = await response.json().catch(() => null);
    return { response, body };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`API-Football demorou mais de ${Math.round(timeoutMs/1000)}s para responder.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function apiErrorText(body) {
  return body?.errors && Object.keys(body.errors).length ? JSON.stringify(body.errors) : '';
}

async function request(pathname, params = {}) {
  const key = apiKey();
  const timeoutMs = Math.max(3000, Math.min(20000, Number(process.env.API_FOOTBALL_TIMEOUT_MS || 8000)));

  // Primeiro tenta a autenticação direta da API-Sports, usada pelo projeto desde a versão funcional.
  let { response, body } = await fetchApi(
    buildUrl(BASE, pathname, params),
    { 'x-apisports-key': key, 'accept': 'application/json' },
    timeoutMs
  );
  updateQuota(response);

  // Algumas contas/chaves antigas foram criadas pelo RapidAPI. Nesse caso a API direta responde
  // "Missing application key" mesmo com a variável configurada. Fazemos um único fallback
  // automático usando a mesma chave no endpoint RapidAPI, sem exigir outra configuração no Render.
  let raw = apiErrorText(body);
  if (/missing application key|invalid application key/i.test(raw)) {
    const retry = await fetchApi(
      buildUrl(RAPID_BASE, pathname, params),
      {
        'x-rapidapi-key': key,
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
        'accept': 'application/json'
      },
      timeoutMs
    );
    response = retry.response;
    body = retry.body;
    updateQuota(response);
    raw = apiErrorText(body);
  }

  if (response.status === 429) {
    const wait = quotaState.retryAfter;
    const error = new Error(wait
      ? `API-Football atingiu o limite de requisições. Aguarde cerca de ${wait}s e tente novamente.`
      : 'API-Football atingiu o limite de requisições por minuto. O app reduziu as chamadas; aguarde a renovação da janela e tente novamente.');
    error.code = 'API_FOOTBALL_RATE_LIMIT';
    error.retryAfter = wait;
    throw error;
  }
  if (!response.ok) throw new Error(`API-Football respondeu ${response.status}.`);
  if (raw) {
    if (/suspend/i.test(raw)) throw new Error('API-Football: conta suspensa. Reative a conta no painel da API-Sports ou troque API_FOOTBALL_KEY no Render.');
    if (/limit|request/i.test(raw)) throw new Error('API-Football: limite de requisições atingido no plano atual. Tente novamente após a renovação da cota.');
    if (/missing application key|invalid application key/i.test(raw)) throw new Error('API-Football não aceitou a chave configurada. Confirme no painel da API-Sports/RapidAPI se a chave está ativa e copie novamente para API_FOOTBALL_KEY no Render.');
    throw new Error(`API-Football: ${raw}`);
  }
  return body;
}

function num(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function statObject(teamStatBlock) {
  const result = {};
  for (const item of teamStatBlock?.statistics || []) result[item.type] = num(item.value);
  return result;
}

function normalizePlayers(groups = []) {
  const players = [];
  for (const group of groups || []) {
    for (const row of group.players || []) {
      const s = row.statistics?.[0] || {};
      players.push({
        id: row.player?.id,
        name: row.player?.name || '',
        teamId: group.team?.id,
        teamName: group.team?.name || '',
        minutes: num(s.games?.minutes),
        position: s.games?.position || '',
        shots: num(s.shots?.total),
        shotsOnTarget: num(s.shots?.on),
        goals: num(s.goals?.total),
        assists: num(s.goals?.assists),
        saves: num(s.goals?.saves),
        foulsCommitted: num(s.fouls?.committed),
        foulsDrawn: num(s.fouls?.drawn),
        yellow: num(s.cards?.yellow),
        red: num(s.cards?.red)
      });
    }
  }
  return players;
}

export function normalizeFixture(raw, playerOverride = null) {
  const statistics = raw.statistics || [];
  const homeId = raw.teams?.home?.id;
  const awayId = raw.teams?.away?.id;
  const homeBlock = statistics.find(x => x.team?.id === homeId);
  const awayBlock = statistics.find(x => x.team?.id === awayId);
  const homeStats = statObject(homeBlock);
  const awayStats = statObject(awayBlock);
  const players = normalizePlayers(playerOverride || raw.players || []);
  return {
    fixtureId: raw.fixture?.id,
    date: raw.fixture?.date,
    status: raw.fixture?.status?.short || 'NS',
    statusLong: raw.fixture?.status?.long || '',
    elapsed: raw.fixture?.status?.elapsed ?? null,
    league: {
      id: raw.league?.id,
      name: raw.league?.name || API_FOOTBALL_LEAGUES[raw.league?.id] || '',
      country: raw.league?.country || '',
      logo: raw.league?.logo || '',
      round: raw.league?.round || ''
    },
    home: { id: homeId, name: raw.teams?.home?.name || '', logo: raw.teams?.home?.logo || '' },
    away: { id: awayId, name: raw.teams?.away?.name || '', logo: raw.teams?.away?.logo || '' },
    goals: { home: num(raw.goals?.home), away: num(raw.goals?.away) },
    stats: {
      home: {
        shots: homeStats['Total Shots'] || 0,
        shotsOnTarget: homeStats['Shots on Goal'] || 0,
        corners: homeStats['Corner Kicks'] || 0,
        fouls: homeStats['Fouls'] || 0,
        yellow: homeStats['Yellow Cards'] || 0,
        red: homeStats['Red Cards'] || 0,
        saves: homeStats['Goalkeeper Saves'] || 0
      },
      away: {
        shots: awayStats['Total Shots'] || 0,
        shotsOnTarget: awayStats['Shots on Goal'] || 0,
        corners: awayStats['Corner Kicks'] || 0,
        fouls: awayStats['Fouls'] || 0,
        yellow: awayStats['Yellow Cards'] || 0,
        red: awayStats['Red Cards'] || 0,
        saves: awayStats['Goalkeeper Saves'] || 0
      }
    },
    players,
    events: (raw.events || []).map(e => ({
      elapsed: e.time?.elapsed,
      extra: e.time?.extra,
      teamId: e.team?.id,
      teamName: e.team?.name || '',
      player: e.player?.name || '',
      type: e.type || '',
      detail: e.detail || ''
    }))
  };
}

export async function getFixturesForDate(date, options = {}) {
  const ttl = Number(process.env.FIXTURES_CACHE_SECONDS || 300) * 1000;
  const allCompetitions = Boolean(options?.allCompetitions);
  return cached(`api-football:date:${date}:${allCompetitions ? 'all' : 'supported'}`, ttl, async () => {
    const body = await request('/fixtures', { date, timezone: 'America/Sao_Paulo' });
    const rows = body.response || [];
    const selected = allCompetitions
      ? rows
      : rows.filter(f => Object.prototype.hasOwnProperty.call(API_FOOTBALL_LEAGUES, Number(f.league?.id)));
    return selected.map(f => normalizeFixture(f));
  });
}

export async function getTeamRecentForm(teamId, last = 8) {
  const n = Math.max(4, Math.min(12, Number(last || 8)));
  const ttl = Number(process.env.TEAM_FORM_CACHE_SECONDS || 1800) * 1000;
  return cached(`api-football:team-form:${teamId}:${n}`, ttl, async () => {
    const body = await request('/fixtures', { team: teamId, last: n, timezone: 'America/Sao_Paulo' });
    const finished = new Set(['FT','AET','PEN']);
    const rows = (body.response || []).filter(r => finished.has(String(r.fixture?.status?.short || '').toUpperCase()));
    let games = 0, points = 0, goalsFor = 0, goalsAgainst = 0;
    for (const r of rows) {
      const home = Number(r.teams?.home?.id) === Number(teamId);
      const away = Number(r.teams?.away?.id) === Number(teamId);
      if (!home && !away) continue;
      const gf = num(home ? r.goals?.home : r.goals?.away);
      const ga = num(home ? r.goals?.away : r.goals?.home);
      games += 1; goalsFor += gf; goalsAgainst += ga;
      points += gf > ga ? 3 : gf === ga ? 1 : 0;
    }
    return {
      teamId:Number(teamId), games,
      ppg: games ? points / games : null,
      goalsForPerGame: games ? goalsFor / games : null,
      goalsAgainstPerGame: games ? goalsAgainst / games : null,
      goalDiffPerGame: games ? (goalsFor - goalsAgainst) / games : null
    };
  });
}

export async function getFixturePlayers(fixtureId) {
  const seconds = Number(process.env.LIVE_PLAYER_REFRESH_SECONDS || 180);
  return cached(`api-football:players:${fixtureId}`, seconds * 1000, async () => {
    const body = await request('/fixtures/players', { fixture: fixtureId });
    return body.response || [];
  });
}

export async function getLiveSnapshots(ids, playerFixtureIds = []) {
  if (!ids.length) return [];
  if (ids.length > 20) throw new Error('O acompanhamento aceita no máximo 20 jogos por atualização.');
  const normalizedIds = [...new Set(ids.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  const normalizedPlayers = [...new Set(playerFixtureIds.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  const snapshotTtl = Math.max(20, Math.min(60, Number(process.env.LIVE_SNAPSHOT_CACHE_SECONDS || 30))) * 1000;
  const cacheKey = `api-football:live:${normalizedIds.join('-')}:players:${normalizedPlayers.join('-')}`;
  return cached(cacheKey, snapshotTtl, async () => {
    const body = await request('/fixtures', { ids: normalizedIds.join('-'), timezone: 'America/Sao_Paulo' });
    const playerSet = new Set(normalizedPlayers);
    const playerData = new Map();
    await Promise.all((body.response || []).map(async raw => {
      const id = Number(raw.fixture?.id);
      if (!playerSet.has(id) || (raw.players && raw.players.length)) return;
      try { playerData.set(id, await getFixturePlayers(id)); } catch { /* dados de jogador podem não ter cobertura */ }
    }));
    return (body.response || []).map(raw => normalizeFixture(raw, playerData.get(Number(raw.fixture?.id)) || null));
  });
}

function per90(total, minutes) {
  const m = Number(minutes || 0);
  return m > 0 ? Number(total || 0) * 90 / m : 0;
}

function normalizeSeasonPlayers(body, teamId, leagueId) {
  const rows = [];
  for (const row of body?.response || []) {
    const stats = (row.statistics || []).find(s => Number(s.league?.id) === Number(leagueId)) || row.statistics?.[0];
    if (!stats) continue;
    const minutes = num(stats.games?.minutes);
    const appearances = num(stats.games?.appearences);
    const starts = num(stats.games?.lineups);
    const shots = num(stats.shots?.total);
    const sot = num(stats.shots?.on);
    const goals = num(stats.goals?.total);
    const saves = num(stats.goals?.saves);
    const foulsCommitted = num(stats.fouls?.committed);
    const foulsDrawn = num(stats.fouls?.drawn);
    const yellow = num(stats.cards?.yellow);
    const red = num(stats.cards?.red);
    rows.push({
      id: row.player?.id,
      name: row.player?.name || '',
      teamId: Number(teamId),
      teamName: stats.team?.name || '',
      position: stats.games?.position || '',
      appearances,
      starts,
      minutes,
      shotsPer90: per90(shots, minutes),
      sotPer90: per90(sot, minutes),
      goalsPer90: per90(goals, minutes),
      savesPer90: per90(saves, minutes),
      foulsCommittedPer90: per90(foulsCommitted, minutes),
      foulsDrawnPer90: per90(foulsDrawn, minutes),
      cardsPer90: per90(yellow + red, minutes)
    });
  }
  return rows;
}

export async function getTeamPlayerSeasonStats(teamId, leagueId, season) {
  const seconds = Number(process.env.PLAYER_STATS_CACHE_SECONDS || 21600);
  return cached(`api-football:player-season:${teamId}:${leagueId}:${season}`, seconds * 1000, async () => {
    // Uma página por time para preservar a cota gratuita. O app exibe a amostra principal retornada pela API.
    const body = await request('/players', { team: teamId, league: leagueId, season, page: 1 });
    return normalizeSeasonPlayers(body, teamId, leagueId);
  });
}
