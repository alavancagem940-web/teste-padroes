import { cached } from '../utils/cache.js';

const BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'BSA';

function token() {
  const t = process.env.FOOTBALL_DATA_TOKEN;
  if (!t) throw new Error('FOOTBALL_DATA_TOKEN não configurado no arquivo .env');
  return t;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'X-Auth-Token': token() } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Football-Data respondeu ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function getSeasonMatches(season = new Date().getFullYear()) {
  const ttl = Number(process.env.CACHE_TTL_SECONDS || 300) * 1000;
  const url = `${BASE}/competitions/${COMPETITION}/matches?season=${season}`;
  return cached(`fd:season:${season}`, ttl, async () => (await getJson(url)).matches || []);
}

export async function getMatchesForDate(date) {
  const ttl = Number(process.env.CACHE_TTL_SECONDS || 300) * 1000;
  const url = `${BASE}/competitions/${COMPETITION}/matches?dateFrom=${date}&dateTo=${date}`;
  return cached(`fd:date:${date}`, ttl, async () => (await getJson(url)).matches || []);
}

export async function getStandings(season = new Date().getFullYear()) {
  const ttl = Number(process.env.CACHE_TTL_SECONDS || 300) * 1000;
  const url = `${BASE}/competitions/${COMPETITION}/standings?season=${season}`;
  return cached(`fd:standings:${season}`, ttl, async () => await getJson(url));
}
