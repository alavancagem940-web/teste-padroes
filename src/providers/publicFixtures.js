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

const PRIMARY_ESPN_SCOPE_BY_COUNTRY = {
  England:'eng.1', Spain:'esp.1', Italy:'ita.1', Germany:'ger.1', France:'fra.1', Brazil:'bra.1',
  Scotland:'sco.1', Portugal:'por.1', Netherlands:'ned.1', Belgium:'bel.1', Turkey:'tur.1',
  Argentina:'arg.1', Greece:'gre.1', Austria:'aut.1', 'Saudi Arabia':'ksa.1'
};

function yyyymmdd(date='') { return String(date).replaceAll('-', ''); }
function num(v, fallback=null) { const n=Number(v); return Number.isFinite(n) ? n : fallback; }
function normalizeText(v='') { return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }

async function fetchJsonTimed(url, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // A ESPN pública é mais estável sem User-Agent customizado. Mandamos apenas
    // Accept e deixamos o runtime HTTP identificar a requisição normalmente.
    const res = await fetch(url, { signal:controller.signal, headers:{'accept':'application/json'} });
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
  row.espnScope = competition.slug;
  row.league = { ...row.league, name:competition.label, country:competition.country };
  return row;
}

function cleanSeasonSlug(value='') {
  return String(value || '')
    .replace(/^\d{4}(?:-\d{2,4})?-/, '')
    .replace(/-/g, ' ')
    .replace(/\b(uefa|conmebol)\b/gi, m => m.toUpperCase())
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function scopeFromSeasonSlug(value='') {
  const slug = normalizeText(value);
  const rules = [
    [/brazilian serie a|brasileirao serie a|brasileirao/, 'bra.1'], [/copa do brasil|copa do brazil/, 'bra.copa_do_brasil'],
    [/english premier league|premier league/, 'eng.1'], [/fa cup/, 'eng.fa'], [/efl cup|carabao cup|league cup/, 'eng.league_cup'],
    [/spanish laliga|spanish la liga|\bla liga\b/, 'esp.1'], [/copa del rey/, 'esp.copa_del_rey'],
    [/german bundesliga|\bbundesliga\b/, 'ger.1'], [/dfb pokal/, 'ger.dfb_pokal'],
    [/italian serie a|\bserie a\b/, 'ita.1'], [/coppa italia/, 'ita.coppa_italia'],
    [/french ligue 1|\bligue 1\b/, 'fra.1'], [/coupe de france/, 'fra.coupe_de_france'],
    [/scottish premiership/, 'sco.1'], [/scottish cup/, 'sco.scottish_cup'], [/scottish league cup/, 'sco.league_cup'],
    [/portuguese primeira liga|primeira liga/, 'por.1'], [/taca de portugal/, 'por.taca_de_portugal'],
    [/dutch eredivisie|eredivisie/, 'ned.1'], [/knvb beker/, 'ned.knvb_beker'],
    [/belgian pro league/, 'bel.1'], [/turkish super lig|super lig/, 'tur.1'],
    [/argentine liga profesional|liga profesional argentina/, 'arg.1'], [/austrian bundesliga/, 'aut.1'],
    [/saudi pro league/, 'ksa.1']
  ];
  return rules.find(([pattern]) => pattern.test(slug))?.[1] || 'all';
}

function countryFromScope(scope='') {
  const prefix = String(scope).split('.')[0];
  return ({bra:'Brazil',eng:'England',esp:'Spain',ger:'Germany',ita:'Italy',fra:'France',sco:'Scotland',por:'Portugal',ned:'Netherlands',bel:'Belgium',tur:'Turkey',arg:'Argentina',gre:'Greece',aut:'Austria',ksa:'Saudi Arabia'})[prefix] || '';
}

function normalizeEspnAllFavoriteEvent(event) {
  const row = normalizeEspnEvent(event, 'market-favorites');
  const seasonSlug = String(event?.season?.slug || event?.competitions?.[0]?.season?.slug || '');
  const explicitLeague = event?.league?.displayName || event?.league?.name || event?.competitions?.[0]?.league?.displayName || event?.competitions?.[0]?.league?.name || '';
  const inferredScope = scopeFromSeasonSlug(seasonSlug);
  const inferredLabel = explicitLeague || cleanSeasonSlug(seasonSlug) || 'Competição doméstica';
  row.fixtureId = `public~espn~all~${event?.id || `${row.home.name}-${row.away.name}`}`;
  row.espnScope = inferredScope;
  row.seasonSlug = seasonSlug;
  row.league = { ...row.league, name:inferredLabel, country:countryFromScope(inferredScope) };
  return row;
}

async function espnAllFavoriteFixtures(date) {
  // Uma única chamada cobre o placar/calendário mundial do dia. Isso substitui
  // dezenas de chamadas por competição e evita estourar o timeout do Render.
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${yyyymmdd(date)}&limit=1000`;
  const body = await fetchJsonTimed(url, 3000);
  return (body?.events || []).map(normalizeEspnAllFavoriteEvent).filter(x => x.home.name && x.away.name && x.date);
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
  // O Mercado dos Favoritos faz várias consultas em paralelo. Um endpoint lento não
  // pode segurar a tela inteira no Render; 2,8s é suficiente para o fallback público.
  const body = await fetchJsonTimed(url, 2400);
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
  const body = await fetchJsonTimed(url, 2600);
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


function espnRosterScopeFromFixture(fixture) {
  if (fixture?.espnScope && fixture.espnScope !== 'all') return fixture.espnScope;
  const token = parsePublicFixtureToken(fixture?.fixtureId || '');
  if (token?.provider === 'espn') {
    const tokenScope = ESPN_SLUGS[token.scope] || token.scope;
    if (tokenScope && tokenScope !== 'all') return tokenScope;
  }
  // O placar amplo da ESPN costuma devolver fixtureId com escopo "all". Antes isso
  // fazia Toulouse x Lille (e outros jogos encontrados no placar geral) perderem o
  // acesso ao elenco e cair direto na API-Football. Reconstituímos o escopo usando
  // nome da competição/país; para copas, o endpoint da liga principal do clube também
  // serve para consultar o roster por ID global da ESPN.
  const inferred = scopeFromSeasonSlug(`${fixture?.seasonSlug || ''} ${fixture?.league?.name || ''}`);
  if (inferred && inferred !== 'all') return inferred;
  const country = String(fixture?.league?.country || '').trim();
  if (PRIMARY_ESPN_SCOPE_BY_COUNTRY[country]) return PRIMARY_ESPN_SCOPE_BY_COUNTRY[country];
  const leagueKeyScope = ESPN_SLUGS[fixture?.leagueKey];
  return leagueKeyScope || null;
}

function compactPosition(value='') {
  const text = normalizeText(typeof value === 'string' ? value : (value?.abbreviation || value?.name || value?.displayName || ''));
  if (!text) return '';
  if (/goalkeeper|keeper|goleiro|^gk$|^g$/.test(text)) return 'G';
  if (/defender|defensor|zagueiro|lateral|^df$|^d$/.test(text)) return 'D';
  if (/midfielder|meia|volante|^mf$|^m$/.test(text)) return 'M';
  if (/forward|attacker|striker|atacante|^fw$|^f$/.test(text)) return 'F';
  const first = text[0]?.toUpperCase();
  return ['G','D','M','F'].includes(first) ? first : 'F';
}

function normalizeEspnRoster(body, teamId, teamName='') {
  const rows = [];
  const groups = Array.isArray(body?.athletes) ? body.athletes : [];
  for (const group of groups) {
    const items = Array.isArray(group?.items) ? group.items : [group];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const name = item.fullName || item.displayName || item.shortName || item.name || '';
      const position = compactPosition(item.position || group.position || group.name || group.displayName || '');
      if (!name || !position) continue;
      rows.push({
        id: item.id || `${teamId}-${normalizeText(name).replace(/\s+/g,'-')}`,
        name,
        teamId: Number(teamId),
        teamName,
        position,
        photo:item.headshot?.href || item.headshot?.url || item.image?.href || '',
        jersey:item.jersey || item.number || '',
        // Roster público não traz minutos/estatísticas. Estes valores apenas ativam
        // o modelo conservador por posição; o front deixa claro que é estimativa.
        appearances: 1,
        starts: 0,
        minutes: 60,
        shotsPer90: 0,
        sotPer90: 0,
        goalsPer90: 0,
        savesPer90: 0,
        foulsCommittedPer90: 0,
        foulsDrawnPer90: 0,
        cardsPer90: 0,
        assistsPer90: 0,
        passesPer90: 0,
        tacklesPer90: 0,
        offsidesPer90: 0,
        modeledSquad: true,
        publicRoster: true
      });
    }
  }
  const seen = new Set();
  return rows.filter(player => {
    const key = `${player.id}|${normalizeText(player.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function espnTeamRoster(scope, teamId, teamName='') {
  if (!scope || !teamId) return [];
  const ttl = 12 * 60 * 60 * 1000;
  return cached(`espn-roster:${scope}:${teamId}:v1`, ttl, async () => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(scope)}/teams/${encodeURIComponent(teamId)}/roster`;
    const body = await fetchJsonTimed(url, 3200);
    return normalizeEspnRoster(body, teamId, teamName);
  });
}

function normalizeSportsDbPosition(value='') {
  const text = normalizeText(value);
  if (!text) return '';
  if (/goalkeeper|keeper|goleiro/.test(text)) return 'G';
  if (/defender|centre back|center back|left back|right back|zagueiro|lateral/.test(text)) return 'D';
  if (/midfielder|midfield|meia|volante/.test(text)) return 'M';
  if (/forward|striker|winger|attacker|atacante|ponta/.test(text)) return 'F';
  return compactPosition(value);
}

function normalizeSportsDbRoster(body, outputTeamId, teamName='') {
  const rows = Array.isArray(body?.player) ? body.player : Array.isArray(body?.players) ? body.players : [];
  return rows.map(item => {
    const name = item?.strPlayer || item?.strPlayerAlternate || item?.strName || '';
    const position = normalizeSportsDbPosition(item?.strPosition || item?.strPositionAlternate || '');
    if (!name || !position) return null;
    return {
      id:item?.idPlayer || `${outputTeamId}-${normalizeText(name).replace(/\s+/g,'-')}`,
      name,
      teamId:Number(outputTeamId),
      teamName,
      position,
      photo:item?.strCutout || item?.strThumb || item?.strRender || '',
      jersey:item?.strNumber || '',
      appearances:1, starts:0, minutes:60,
      shotsPer90:0, sotPer90:0, goalsPer90:0, savesPer90:0,
      foulsCommittedPer90:0, foulsDrawnPer90:0, cardsPer90:0,
      assistsPer90:0, passesPer90:0, tacklesPer90:0, offsidesPer90:0,
      modeledSquad:true, publicRoster:true, sportsDbRoster:true
    };
  }).filter(Boolean);
}

async function sportsDbSearchTeam(name='') {
  if (!name) return null;
  const ttl = 12 * 60 * 60 * 1000;
  return cached(`sportsdb-team-search:${normalizeText(name)}:v1`, ttl, async () => {
    const url = `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${encodeURIComponent(name)}`;
    const body = await fetchJsonTimed(url, 3200);
    const teams = Array.isArray(body?.teams) ? body.teams : [];
    const soccer = teams.filter(team => !team?.strSport || normalizeText(team.strSport) === 'soccer');
    const exact = soccer.find(team => normalizeText(team?.strTeam) === normalizeText(name));
    return exact || soccer[0] || null;
  });
}

async function sportsDbTeamRoster(teamId, teamName='', outputTeamId=teamId) {
  if (!teamId || !outputTeamId) return [];
  const ttl = 12 * 60 * 60 * 1000;
  return cached(`sportsdb-roster:${teamId}:v1`, ttl, async () => {
    const url = `https://www.thesportsdb.com/api/v1/json/123/lookup_all_players.php?id=${encodeURIComponent(teamId)}`;
    const body = await fetchJsonTimed(url, 3600);
    return normalizeSportsDbRoster(body, outputTeamId, teamName);
  });
}

async function sportsDbSquadsByNames(homeName='', awayName='', outputHomeId=101, outputAwayId=202, knownHomeId=null, knownAwayId=null) {
  const [homeTeamRow, awayTeamRow] = await Promise.allSettled([
    knownHomeId ? Promise.resolve({ idTeam:knownHomeId, strTeam:homeName }) : sportsDbSearchTeam(homeName),
    knownAwayId ? Promise.resolve({ idTeam:knownAwayId, strTeam:awayName }) : sportsDbSearchTeam(awayName)
  ]);
  const homeTeam = homeTeamRow.status === 'fulfilled' ? homeTeamRow.value : null;
  const awayTeam = awayTeamRow.status === 'fulfilled' ? awayTeamRow.value : null;
  const rosterRows = await Promise.allSettled([
    homeTeam?.idTeam ? sportsDbTeamRoster(homeTeam.idTeam, homeName || homeTeam.strTeam || '', outputHomeId) : Promise.resolve([]),
    awayTeam?.idTeam ? sportsDbTeamRoster(awayTeam.idTeam, awayName || awayTeam.strTeam || '', outputAwayId) : Promise.resolve([])
  ]);
  const homePlayers = rosterRows[0].status === 'fulfilled' ? rosterRows[0].value : [];
  const awayPlayers = rosterRows[1].status === 'fulfilled' ? rosterRows[1].value : [];
  const errors = [homeTeamRow, awayTeamRow, ...rosterRows]
    .filter(row => row.status === 'rejected')
    .map(row => row.reason?.message || String(row.reason))
    .filter(Boolean);
  return { players:[...homePlayers, ...awayPlayers], homePlayers, awayPlayers, errors };
}

export async function getPublicPlayerSquads(fixture) {
  const scope = espnRosterScopeFromFixture(fixture);
  const homeName = fixture?.home?.name || '';
  const awayName = fixture?.away?.name || '';
  const rawHomeId = Number(fixture?.home?.id), rawAwayId = Number(fixture?.away?.id);
  // IDs de contexto só precisam ser estáveis dentro desta resposta. Quando o jogo
  // vem apenas por nome, usamos IDs sintéticos locais para o modelo distinguir casa/fora.
  const homeId = Number.isFinite(rawHomeId) ? rawHomeId : 910001;
  const awayId = Number.isFinite(rawAwayId) ? rawAwayId : 910002;
  const errors = [];

  if (fixture?.provider === 'espn-public' && scope && Number.isFinite(rawHomeId) && Number.isFinite(rawAwayId)) {
    const settled = await Promise.allSettled([
      espnTeamRoster(scope, rawHomeId, homeName),
      espnTeamRoster(scope, rawAwayId, awayName)
    ]);
    const homePlayers = settled[0].status === 'fulfilled' ? settled[0].value : [];
    const awayPlayers = settled[1].status === 'fulfilled' ? settled[1].value : [];
    settled.filter(row => row.status === 'rejected').forEach(row => errors.push(row.reason?.message || String(row.reason)));
    if (homePlayers.length && awayPlayers.length) return {
      players:[...homePlayers, ...awayPlayers], source:'ESPN público (elenco) + modelo próprio por posição', error:null,
      homeTeamId:homeId, awayTeamId:awayId, provider:'espn-public', scope
    };
    if (!homePlayers.length || !awayPlayers.length) errors.push('ESPN não trouxe os dois elencos completos.');
  }

  // Segundo fallback público: TheSportsDB. Ele possui lookup de todos os jogadores
  // por equipe no plano público. Mantemos os IDs de contexto da partida original,
  // portanto o modelo continua atribuindo corretamente lambda de casa/fora.
  try {
    const knownHomeId = fixture?.provider === 'thesportsdb-public' ? fixture?.home?.id : null;
    const knownAwayId = fixture?.provider === 'thesportsdb-public' ? fixture?.away?.id : null;
    const sportsDb = await sportsDbSquadsByNames(homeName, awayName, homeId, awayId, knownHomeId, knownAwayId);
    errors.push(...sportsDb.errors);
    if (sportsDb.homePlayers.length && sportsDb.awayPlayers.length) return {
      players:sportsDb.players, source:'TheSportsDB público (elenco) + modelo próprio por posição', error:errors.filter(Boolean).join(' | ') || null,
      homeTeamId:homeId, awayTeamId:awayId, provider:'thesportsdb-public', scope:scope || null
    };
  } catch (error) { errors.push(error?.message || String(error)); }

  return { players:[], source:null, error:errors.filter(Boolean).join(' | ') || 'fontes públicas não trouxeram elenco para os dois times', homeTeamId:homeId, awayTeamId:awayId, scope:scope || null };
}

export async function getPublicFixtures(date, leagueKey) {
  const ttl = 10 * 60 * 1000;
  return cached(`public-fixtures:${date}:${leagueKey}:v3`, ttl, async () => {
    // ESPN e TheSportsDB rodam juntos. Antes o app esperava uma fonte falhar para
    // só então chamar a outra; no Render isso somava os timeouts e estourava o
    // limite do front. Agora o pior caso é o tempo da fonte mais lenta, não a soma.
    const settled = await Promise.allSettled([
      espnFixtures(date, leagueKey),
      sportsDbFixtures(date, leagueKey)
    ]);
    const errors=[];
    const espn = settled[0].status === 'fulfilled' ? settled[0].value : [];
    const sportsDb = settled[1].status === 'fulfilled' ? settled[1].value : [];
    if (settled[0].status === 'rejected') errors.push(`ESPN: ${settled[0].reason?.message || settled[0].reason}`);
    else if (!espn.length) errors.push('ESPN retornou 0 partidas.');
    if (settled[1].status === 'rejected') errors.push(`TheSportsDB: ${settled[1].reason?.message || settled[1].reason}`);
    else if (!sportsDb.length) errors.push('TheSportsDB retornou 0 partidas.');
    if (espn.length) return {fixtures:dedupeFixtures([...espn, ...sportsDb]),source:sportsDb.length?'ESPN + TheSportsDB públicos':'ESPN público',errors};
    if (sportsDb.length) return {fixtures:sportsDb,source:'TheSportsDB público',errors};
    return {fixtures:[],source:'nenhuma',errors};
  });
}

// Fallback amplo do Mercado dos Favoritos: procura o DIA em várias ligas e copas
// domésticas, em vez de depender das ligas cadastradas no seletor. Isso faz jogos
// de Copa do Brasil, DFB-Pokal, Escócia etc. aparecerem mesmo sem API-Football.
export async function getPublicFavoriteFixtures(date) {
  const ttl = 8 * 60 * 1000;
  return cached(`public-favorite-fixtures:${date}:v6-fast`, ttl, async () => {
    const errors = [];
    const broadFixtures = [];
    const safetyFixtures = [];

    // Busca ampla e salvaguardas COMEÇAM juntas. A diferença é que, se ESPN geral
    // ou TheSportsDB já trouxerem o dia, não esperamos todas as consultas de apoio
    // terminarem para liberar a tela. Isso remove a cauda de latência do Render.
    const safetySlugs = new Set(['bra.1','bra.copa_do_brazil','bra.copa_do_brasil','ger.1','ger.dfb_pokal','sco.1']);
    const safetyCompetitions = FAVORITE_ESPN_COMPETITIONS.filter(c => safetySlugs.has(c.slug));
    const broadJobs = [
      { label:'ESPN geral', run:()=>espnAllFavoriteFixtures(date) },
      { label:'TheSportsDB', run:()=>sportsDbDay(date).then(events => events.map(e => normalizeSportsDbEvent(e, 'market-favorites'))) }
    ];
    const safetyJobs = safetyCompetitions.map(c => ({ label:c.label, run:()=>espnFavoriteFixtures(date, c) }));

    // Cada promessa de segurança captura o próprio erro para nunca gerar rejeição
    // solta caso a resposta ampla seja suficiente e a função retorne antes.
    const safetyPromises = safetyJobs.map(async job => {
      try {
        const rows = await job.run();
        safetyFixtures.push(...(rows || []));
        return { label:job.label, rows:rows || [], error:null };
      } catch (error) {
        return { label:job.label, rows:[], error:error?.message || String(error) };
      }
    });

    const broadSettled = await Promise.allSettled(broadJobs.map(job => job.run()));
    broadSettled.forEach((row,index) => {
      if (row.status === 'fulfilled') broadFixtures.push(...(row.value || []));
      else errors.push(`${broadJobs[index].label}: ${row.reason?.message || row.reason}`);
    });

    if (broadFixtures.length) {
      // Dá uma janela minúscula para aproveitar salvaguardas que já estejam prontas,
      // sem transformar a tela em refém do endpoint mais lento.
      await Promise.race([
        Promise.all(safetyPromises),
        new Promise(resolve => setTimeout(resolve, 180))
      ]);
    } else {
      // Se as duas fontes amplas falharam/vieram vazias, as salvaguardas já estavam
      // rodando em paralelo desde o início; portanto este await não cria uma 2ª onda.
      const safetyRows = await Promise.all(safetyPromises);
      safetyRows.filter(row => row.error).forEach(row => errors.push(`${row.label}: ${row.error}`));
    }

    const clean = dedupeFixtures([...broadFixtures, ...safetyFixtures]).filter(x => x.home?.name && x.away?.name && x.date);
    const hasEspn = clean.some(x => x.provider === 'espn-public');
    const hasDb = clean.some(x => x.provider === 'thesportsdb-public');
    const source = hasEspn && hasDb ? 'ESPN geral + TheSportsDB públicos' : hasEspn ? 'ESPN geral público' : hasDb ? 'TheSportsDB público' : 'nenhuma';
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

