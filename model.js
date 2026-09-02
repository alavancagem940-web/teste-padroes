import { cached } from '../utils/cache.js';
import { LEAGUES } from './oddsApi.js';

// Fontes públicas sem chave usadas como fallback de calendário/partidas.
// O objetivo aqui é descobrir jogos; quando não existe odd real o restante do
// app continua usando apenas probabilidades/odds aproximadas do modelo próprio.

const ESPN_SLUGS = {
  'premier-league': 'eng.1',
  championship: 'eng.2',
  'la-liga': 'esp.1',
  'la-liga-2': 'esp.2',
  'serie-a': 'ita.1',
  'serie-b-italy': 'ita.2',
  bundesliga: 'ger.1',
  'bundesliga-2': 'ger.2',
  'ligue-1': 'fra.1',
  'ligue-2': 'fra.2',
  brasileirao: 'bra.1',
  'brasileirao-b': 'bra.2',
  'saudi-pro-league': 'ksa.1'
};

// O Mercado dos Favoritos não é limitado às opções do seletor de ligas.
// Ele varre campeonatos e copas domésticas onde normalmente aparecem os jogos
// que o usuário quer encontrar (ex.: DFB-Pokal, Copa do Brasil, Escócia etc.).
// Alguns torneios possuem slugs históricos diferentes na ESPN; aliases errados
// simplesmente retornam vazio/404 e são ignorados sem travar a tela.
const FAVORITE_ESPN_COMPETITIONS = [
  ['eng.1','Premier League','England'], ['eng.fa','FA Cup','England'], ['eng.league_cup','EFL Cup','England'],
  ['esp.1','La Liga','Spain'], ['esp.copa_del_rey','Copa del Rey','Spain'], ['esp.super_cup','Supercopa da Espanha','Spain'],
  ['ger.1','Bundesliga','Germany'], ['ger.dfb_pokal','DFB-Pokal','Germany'], ['ger.super_cup','Supercopa da Alemanha','Germany'],
  ['ita.1','Serie A','Italy'], ['ita.coppa_italia','Coppa Italia','Italy'], ['ita.super_cup','Supercoppa Italiana','Italy'],
  ['fra.1','Ligue 1','France'], ['fra.coupe_de_france','Coupe de France','France'],
  ['bra.1','Brasileirão Série A','Brazil'], ['bra.copa_do_brazil','Copa do Brasil','Brazil'], ['bra.copa_do_brasil','Copa do Brasil','Brazil'], ['bra.supercopa_do_brasil','Supercopa do Brasil','Brazil'],
  ['sco.1','Scottish Premiership','Scotland'], ['sco.scottish_cup','Scottish Cup','Scotland'], ['sco.league_cup','Scottish League Cup','Scotland'],
  ['por.1','Primeira Liga','Portugal'], ['por.taca_de_portugal','Taça de Portugal','Portugal'],
  ['ned.1','Eredivisie','Netherlands'], ['ned.knvb_beker','KNVB Beker','Netherlands'],
  ['bel.1','Belgian Pro League','Belgium'], ['tur.1','Süper Lig','Turkey'], ['arg.1','Liga Profissional Argentina','Argentina'], ['gre.1','Super League Greece','Greece'], ['aut.1','Austrian Bundesliga','Austria'], ['ksa.1','Saudi Pro League','Saudi Arabia']
].map(([slug,label,country]) => ({slug,label,country}));

const SPORTSDB_LEAGUE_NAMES = {
  'premier-league': ['English Premier League','Premier League'],
  championship: ['English League Championship','EFL Championship','Championship'],
  'la-liga': ['Spanish La Liga','La Liga'],
  'la-liga-2': ['Spanish La Liga 2','LaLiga 2','Segunda Division'],
  'serie-a': ['Italian Serie A','Serie A'],
  'serie-b-italy': ['Italian Serie B','Serie B'],
  bundesliga: ['German Bundesliga','Bundesliga'],
  'bundesliga-2': ['German 2. Bundesliga','2. Bundesliga'],
  'ligue-1': ['French Ligue 1','Ligue 1'],
  'ligue-2': ['French Ligue 2','Ligue 2'],
  brasileirao: ['Brazilian Serie A','Brasileirão Série A'],
  'brasileirao-b': ['Brazilian Serie B','Brasileirão Série B'],
  'saudi-pro-league': ['Saudi Pro League','Saudi Professional League']
};

function yyyymmdd(date='') { return String(date).replaceAll('-', ''); }
function num(v, fallback=null) { const n=Number(v); return Number.isFinite(n) ? n : fallback; }
function normalizeText(v='') { return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }

async function fetchJsonTimed(url, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal:controller.signal, headers:{'accept':'application/json','user-agent':'BilhetePlus/5.0'} });
    if (!res.ok) throw new Error(`fonte pública respondeu ${res.status}`);
    return await res.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`fonte pública excedeu ${Math.round(timeoutMs/1000)}s`);
    throw error;
  } finally { clearTimeout(timer); }
}

function parseRecordSummary(summary='') {
  const nums = String(summary).match(/\d+/g)?.map(Number) || [];
  if (nums.length < 3) return null;
  const [wins, draws, losses] = nums;
  const games = wins + draws + losses;
  if (!games) return null;
  return { wins, draws, losses, games, ppg:(wins*3 + draws)/games };
}

function espnTeam(comp, homeAway) {
  const c = (comp?.competitors || []).find(x => x.homeAway === homeAway) || {};
  const record = (c.records || []).find(r => r.type === 'total') || c.records?.[0] || null;
  return {
    id: c.team?.id || null,
    name: c.team?.displayName || c.team?.shortDisplayName || c.team?.name || '',
    logo: c.team?.logo || c.team?.logos?.[0]?.href || '',
    record: parseRecordSummary(record?.summary || '')
  };
}

function statNumber(value) {
  const n = Number(String(value ?? '').replace('%','').replace(',','.').trim());
  return Number.isFinite(n) ? n : 0;
}
function espnStatsFromRows(rows=[]) {
  const out={shots:0,shotsOnTarget:0,corners:0,fouls:0,yellow:0,red:0,saves:0};
  for (const row of rows || []) {
    const key=normalizeText(row?.name || row?.label || row?.abbreviation || row?.displayName || '');
    const value=statNumber(row?.value ?? row?.displayValue);
    if (/shots on target|shotsontarget|chutes no gol/.test(key)) out.shotsOnTarget=value;
    else if (/total shots|totalshots|shots|chutes/.test(key)) out.shots=value;
    else if (/won corners|corner kicks|corners|escanteios/.test(key)) out.corners=value;
    else if (/fouls committed|fouls|faltas/.test(key)) out.fouls=value;
    else if (/yellow cards|yellowcards|cartoes amarelos/.test(key)) out.yellow=value;
    else if (/red cards|redcards|cartoes vermelhos/.test(key)) out.red=value;
    else if (/goalkeeper saves|saves|defesas/.test(key)) out.saves=value;
  }
  return out;
}
function elapsedFromEspn(event, comp) {
  const direct = num(event?.status?.period, null);
  const clock = String(event?.status?.displayClock || comp?.status?.displayClock || event?.status?.type?.detail || comp?.status?.type?.detail || '');
  const m=clock.match(/(\d{1,3})/);
  if (m) return Number(m[1]);
  return direct && direct > 2 ? direct : null;
}

export function normalizeEspnEvent(event, leagueKey) {
  const comp = event?.competitions?.[0] || {};
  const homeRaw=(comp?.competitors || []).find(x=>x.homeAway==='home') || {};
  const awayRaw=(comp?.competitors || []).find(x=>x.homeAway==='away') || {};
  const home = espnTeam(comp, 'home');
  const away = espnTeam(comp, 'away');
  const state = String(event?.status?.type?.state || comp?.status?.type?.state || 'pre').toLowerCase();
  const completed = Boolean(event?.status?.type?.completed || comp?.status?.type?.completed);
  const status = completed ? 'FT' : state === 'in' ? 'LIVE' : state === 'post' ? 'FT' : 'NS';
  const homeStats=espnStatsFromRows(homeRaw.statistics || []);
  const awayStats=espnStatsFromRows(awayRaw.statistics || []);
  const hasDetailedStats=Boolean((homeRaw.statistics || []).length || (awayRaw.statistics || []).length);
  return {
    fixtureId:`public~espn~${leagueKey}~${event?.id || `${home.name}-${away.name}`}`,
    provider:'espn-public', leagueKey,
    date:event?.date || comp?.date || null,
    status,
    statusLong:completed ? 'Finalizado' : status === 'LIVE' ? 'Ao vivo' : 'Agendado',
    elapsed:elapsedFromEspn(event,comp),
    league:{id:null,name:LEAGUES[leagueKey]?.label || leagueKey,round:''},
    home, away,
    goals:{home:num(homeRaw?.score,0),away:num(awayRaw?.score,0)},
    stats:{home:homeStats,away:awayStats},
    players:[],
    events:[],
    records:{home:home.record,away:away.record},
    hasDetailedStats
  };
}

function normalizeEspnFavoriteEvent(event, competition) {
  const row = normalizeEspnEvent(event, 'market-favorites');
  row.fixtureId = `public~espn~${competition.slug}~${event?.id || `${row.home.name}-${row.away.name}`}`;
  row.league = { ...row.league, name:competition.label, country:competition.country };
  return row;
}

async function espnFixtures(date, leagueKey) {
  const slug = ESPN_SLUGS[leagueKey];
  if (!slug) throw new Error('Liga sem mapeamento da fonte pública ESPN.');
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(slug)}/scoreboard?dates=${yyyymmdd(date)}&limit=100`;
  const body = await fetchJsonTimed(url);
  return (body?.events || []).map(e => normalizeEspnEvent(e, leagueKey)).filter(x => x.home.name && x.away.name && x.date);
}

async function espnFavoriteFixtures(date, competition) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(competition.slug)}/scoreboard?dates=${yyyymmdd(date)}&limit=100`;
  const body = await fetchJsonTimed(url, 4500);
  return (body?.events || []).map(e => normalizeEspnFavoriteEvent(e, competition)).filter(x => x.home.name && x.away.name && x.date);
}

function sportsDbLeagueMatches(raw, leagueKey) {
  const got = normalizeText(raw?.strLeague || '');
  return (SPORTSDB_LEAGUE_NAMES[leagueKey] || []).some(n => {
    const wanted=normalizeText(n); return got===wanted || got.includes(wanted) || wanted.includes(got);
  });
}

export function normalizeSportsDbEvent(e, leagueKey) {
  const rawStatus = String(e?.strStatus || '').toLowerCase();
  const scoreKnown = e?.intHomeScore !== null && e?.intHomeScore !== undefined && e?.intHomeScore !== '';
  const final = /match finished|finished|ft|final/.test(rawStatus);
  const live = !final && (scoreKnown || /live|1h|2h|half/.test(rawStatus));
  const date = e?.strTimestamp || (e?.dateEvent && e?.strTime ? `${e.dateEvent}T${e.strTime}Z` : e?.dateEvent);
  return {
    fixtureId:`public~sportsdb~${leagueKey}~${e?.idEvent || `${e?.strHomeTeam}-${e?.strAwayTeam}`}`,
    provider:'thesportsdb-public', leagueKey,
    date, status:final?'FT':live?'LIVE':'NS', statusLong:final?'Finalizado':live?'Ao vivo':'Agendado',
    elapsed:num(String(e?.strProgress || '').match(/\d+/)?.[0],null),
    league:{id:e?.idLeague || null,name:LEAGUES[leagueKey]?.label || e?.strLeague || leagueKey,country:e?.strCountry || '',round:e?.intRound || ''},
    home:{id:e?.idHomeTeam||null,name:e?.strHomeTeam||'',logo:e?.strHomeTeamBadge||'',record:null},
    away:{id:e?.idAwayTeam||null,name:e?.strAwayTeam||'',logo:e?.strAwayTeamBadge||'',record:null},
    goals:{home:num(e?.intHomeScore,0),away:num(e?.intAwayScore,0)},
    stats:{home:{},away:{}}, players:[], events:[],
    records:{home:null,away:null}, hasDetailedStats:false
  };
}

async function sportsDbDay(date) {
  const url = `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${encodeURIComponent(date)}&s=Soccer`;
  const body = await fetchJsonTimed(url, 5000);
  return body?.events || [];
}

async function sportsDbFixtures(date, leagueKey) {
  const events = await sportsDbDay(date);
  return events.filter(e => sportsDbLeagueMatches(e, leagueKey)).map(e => normalizeSportsDbEvent(e, leagueKey)).filter(x=>x.home.name&&x.away.name&&x.date);
}

function dedupeFixtures(fixtures=[]) {
  const seen = new Set();
  return fixtures.filter(f => {
    const a = normalizeText(f.home?.name), b = normalizeText(f.away?.name);
    const day = String(f.date || '').slice(0,10);
    const key = `${a}|${b}|${day}`;
    if (!a || !b || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export async function getPublicFixtures(date, leagueKey) {
  const ttl = 10 * 60 * 1000;
  return cached(`public-fixtures:${date}:${leagueKey}:v2`, ttl, async () => {
    const errors=[];
    try {
      const fixtures=await espnFixtures(date, leagueKey);
      if (fixtures.length) return {fixtures,source:'ESPN público',errors};
      errors.push('ESPN retornou 0 partidas.');
    } catch(e) { errors.push(e.message); }
    try {
      const fixtures=await sportsDbFixtures(date, leagueKey);
      if (fixtures.length) return {fixtures,source:'TheSportsDB público',errors};
      errors.push('TheSportsDB retornou 0 partidas.');
    } catch(e) { errors.push(e.message); }
    return {fixtures:[],source:'nenhuma',errors};
  });
}

// Fallback amplo do Mercado dos Favoritos: procura o DIA em várias ligas e copas
// domésticas, em vez de depender das ligas cadastradas no seletor. Isso faz jogos
// de Copa do Brasil, DFB-Pokal, Escócia etc. aparecerem mesmo sem API-Football.
export async function getPublicFavoriteFixtures(date) {
  const ttl = 8 * 60 * 1000;
  return cached(`public-favorite-fixtures:${date}:v3`, ttl, async () => {
    const errors = [];
    const jobs = FAVORITE_ESPN_COMPETITIONS.map(c => espnFavoriteFixtures(date, c));
    jobs.push(sportsDbDay(date).then(events => events.map(e => normalizeSportsDbEvent(e, 'market-favorites'))));
    const settled = await Promise.allSettled(jobs);
    const fixtures = [];
    settled.forEach((row, index) => {
      if (row.status === 'fulfilled') fixtures.push(...(row.value || []));
      else errors.push(index < FAVORITE_ESPN_COMPETITIONS.length
        ? `${FAVORITE_ESPN_COMPETITIONS[index].label}: ${row.reason?.message || row.reason}`
        : `TheSportsDB: ${row.reason?.message || row.reason}`);
    });
    const clean = dedupeFixtures(fixtures).filter(x => x.home?.name && x.away?.name && x.date);
    const hasEspn = clean.some(x => x.provider === 'espn-public');
    const hasDb = clean.some(x => x.provider === 'thesportsdb-public');
    const source = hasEspn && hasDb ? 'ESPN + TheSportsDB públicos' : hasEspn ? 'ESPN público' : hasDb ? 'TheSportsDB público' : 'nenhuma';
    return { fixtures:clean, source, errors };
  });
}

function parsePublicFixtureToken(value='') {
  const raw=String(value || '');
  if (!raw.startsWith('public~')) return null;
  const parts=raw.split('~');
  if (parts.length < 4) return null;
  const provider=parts[1];
  const scope=parts[2];
  const eventId=parts.slice(3).join('~');
  if (!provider || !scope || !eventId) return null;
  return {raw,provider,scope,eventId};
}

function mergeEspnBoxscoreStats(snapshot, body) {
  const teams=body?.boxscore?.teams || [];
  if (!teams.length) return snapshot;
  const copy={...snapshot,stats:{home:{...(snapshot.stats?.home||{})},away:{...(snapshot.stats?.away||{})}}};
  for (const block of teams) {
    const id=String(block?.team?.id || '');
    const name=block?.team?.displayName || block?.team?.shortDisplayName || block?.team?.name || '';
    const side = (id && id===String(snapshot.home?.id || '')) || normalizeText(name)===normalizeText(snapshot.home?.name) ? 'home'
      : (id && id===String(snapshot.away?.id || '')) || normalizeText(name)===normalizeText(snapshot.away?.name) ? 'away'
      : null;
    if (!side) continue;
    copy.stats[side]={...copy.stats[side],...espnStatsFromRows(block?.statistics || [])};
  }
  copy.hasDetailedStats=teams.some(t => (t?.statistics || []).length > 0) || snapshot.hasDetailedStats;
  return copy;
}

async function espnSnapshotFromToken(token) {
  return cached(`public-live:espn:${token.scope}:${token.eventId}`, 20*1000, async () => {
    const url=`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(token.scope)}/summary?event=${encodeURIComponent(token.eventId)}`;
    const body=await fetchJsonTimed(url,5000);
    const header=body?.header || {};
    const row=normalizeEspnEvent(header,token.scope);
    row.fixtureId=token.raw;
    row.provider='espn-public';
    row.league={...row.league,name:header?.league?.name || header?.league?.displayName || row.league?.name || token.scope};
    return mergeEspnBoxscoreStats(row,body);
  });
}

async function sportsDbSnapshotFromToken(token) {
  return cached(`public-live:sportsdb:${token.eventId}`, 25*1000, async () => {
    const url=`https://www.thesportsdb.com/api/v1/json/123/lookupevent.php?id=${encodeURIComponent(token.eventId)}`;
    const body=await fetchJsonTimed(url,5000);
    const event=body?.events?.[0] || null;
    if (!event) throw new Error('TheSportsDB não encontrou o evento.');
    const row=normalizeSportsDbEvent(event,token.scope);
    row.fixtureId=token.raw;
    return row;
  });
}

export async function getPublicSnapshots(tokens=[]) {
  const unique=[...new Set((tokens || []).map(String).filter(x=>x.startsWith('public~')))].slice(0,20);
  const settled=await Promise.allSettled(unique.map(async raw => {
    const token=parsePublicFixtureToken(raw);
    if (!token) throw new Error(`Identificador público inválido: ${raw}`);
    if (token.provider==='espn') return espnSnapshotFromToken(token);
    if (token.provider==='sportsdb') return sportsDbSnapshotFromToken(token);
    throw new Error(`Fonte pública desconhecida: ${token.provider}`);
  }));
  const snapshots=[],errors=[];
  settled.forEach((r,i)=>{
    if(r.status==='fulfilled') snapshots.push(r.value);
    else errors.push(`${unique[i]}: ${r.reason?.message || r.reason}`);
  });
  return {snapshots,errors};
}

export async function findPublicFixtureByTeams(date, home, away) {
  const result=await getPublicFavoriteFixtures(date);
  const wantedHome=normalizeText(home), wantedAway=normalizeText(away);
  const fixture=(result.fixtures || []).find(f => normalizeText(f.home?.name)===wantedHome && normalizeText(f.away?.name)===wantedAway)
    || (result.fixtures || []).find(f => normalizeText(f.home?.name)===wantedAway && normalizeText(f.away?.name)===wantedHome)
    || null;
  return {fixture,source:result.source,errors:result.errors || []};
}

