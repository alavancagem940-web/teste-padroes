import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './src/utils/env.js';
import { getSeasonMatches, getMatchesForDate, getStandings } from './src/providers/footballData.js';
import { getLeagueOdds, getBrasileiraoOdds, getLeagueEvents, getLeagueScores, normalizeOddsEvent, normalizeOddsScore, findOddsGame, summarizeOdds, LEAGUES, MAJOR_FIVE, MAJOR_SECOND } from './src/providers/oddsApi.js';
import { getFixturesForDate, getLiveSnapshots, getTeamPlayerSeasonStats, getTeamRecentForm, getApiFootballQuota, API_FOOTBALL_LEAGUES } from './src/providers/apiFootball.js';
import { analyzeMatch } from './src/services/model.js';
import { analyzeMarketGame } from './src/services/marketModel.js';
import { estimateAdvancedMarkets, estimatePlayerMarkets, deriveExpectedGoals } from './src/services/advancedMarkets.js';
import { buildOpportunities, buildTicketGroups } from './src/services/tickets.js';
import { sameTeam, normalizeName } from './src/utils/names.js';
import { isPrematchEligible, onlyPrematch } from './src/services/prematch.js';
import { getPublicFixtures, getPublicFavoriteFixtures, getPublicSnapshots, findPublicFixtureByTeams } from './src/providers/publicFixtures.js';

loadEnv();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function mime(file) {
  const ext = path.extname(file);
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'})[ext] || 'application/octet-stream';
}


function buildTicketPayload(matches) {
  // Os 3 bilhetes internos por perfil já contêm tudo que a interface usa.
  // Antes o servidor calculava buildTickets() E buildTicketGroups() em sequência,
  // repetindo o beam-search inteiro e bloqueando o event loop em máquinas pequenas
  // (especialmente o plano Free do Render). Agora calculamos uma única vez.
  const ticketGroups = buildTicketGroups(matches);
  const order = ['conservador','valor','arriscado','muito-arriscado','jackpot'];
  const tickets = order
    .map(key => (ticketGroups[key] || []).find(ticket => !ticket?.unavailable))
    .filter(Boolean);
  return { tickets, ticketGroups };
}

function dateInSaoPaulo(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function findApiFixture(home, away, fixtures = []) {
  return fixtures.find(f => sameTeam(f.home?.name, home) && sameTeam(f.away?.name, away)) ||
         fixtures.find(f => sameTeam(f.home?.name, away) && sameTeam(f.away?.name, home)) || null;
}

function compactApiFixture(apiFixture) {
  if (!apiFixture) return null;
  return {
    fixtureId: apiFixture.fixtureId,
    leagueId: apiFixture.league?.id ?? apiFixture.leagueId,
    leagueName: apiFixture.league?.name || apiFixture.leagueName || '',
    leagueCountry: apiFixture.league?.country || apiFixture.leagueCountry || '',
    homeTeamId: apiFixture.home?.id ?? apiFixture.homeTeamId,
    awayTeamId: apiFixture.away?.id ?? apiFixture.awayTeamId,
    status: apiFixture.status
  };
}

const FAVORITE_CLUB_NAMES = [
  'Real Madrid','Barcelona','Atlético Madrid','Athletic Bilbao','Sevilla','Villarreal',
  'Manchester City','Manchester United','Liverpool','Arsenal','Chelsea','Tottenham Hotspur','Newcastle United','Aston Villa',
  'Bayern Munich','Bayern München','Borussia Dortmund','Bayer Leverkusen','Bayer 04 Leverkusen','RB Leipzig',
  'Inter','Inter Milan','Internazionale','AC Milan','Juventus','Napoli','Roma','Lazio','Atalanta',
  'Paris Saint-Germain','PSG','Marseille','Monaco','Lyon','Lille',
  'Flamengo','Palmeiras','Corinthians','São Paulo','Santos','Grêmio','Internacional','Atlético Mineiro','Botafogo','Fluminense','Cruzeiro',
  'Celtic','Rangers','Benfica','SL Benfica','Porto','FC Porto','Sporting CP','Sporting Lisbon','Ajax','PSV Eindhoven','Feyenoord',
  'Club Brugge','Anderlecht','Galatasaray','Fenerbahce','Besiktas','Olympiacos','Panathinaikos','AEK Athens','Red Bull Salzburg',
  'Al Hilal','Al Nassr','Al Ittihad','Al Ahli','River Plate','Boca Juniors','Racing Club','Independiente'
];
const FAVORITE_CLUBS = new Set(FAVORITE_CLUB_NAMES.map(normalizeName));
const PRIMARY_LEAGUE_BY_COUNTRY = new Map(Object.entries({
  England:39, Spain:140, Italy:135, Germany:78, France:61, Brazil:71, Scotland:179,
  Portugal:94, Netherlands:88, Belgium:144, Turkey:203, 'Saudi-Arabia':307, 'Saudi Arabia':307
}));

function isFavoriteClub(name='') { return FAVORITE_CLUBS.has(normalizeName(name)); }

async function mapWithConcurrency(items, limit, worker) {
  const rows = Array.from(items || []);
  const results = new Array(rows.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, Number(limit || 1)), rows.length || 1) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= rows.length) return;
      try {
        results[index] = { status:'fulfilled', value:await worker(rows[index], index) };
      } catch (reason) {
        results[index] = { status:'rejected', reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
}
function excludedFromFavoriteMarket(fixture) {
  const name = String(fixture?.league?.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const country = String(fixture?.league?.country || '').toLowerCase();
  if (country === 'world') return true;
  return /champions league|libertadores|sudamericana|sul-americana/.test(name);
}
function favoriteFixtureEligible(fixture) {
  // "Mercado dos Favoritos" significa favorito NO JOGO, não uma lista fechada de ligas
  // ou clubes. Primeiro descobrimos qualquer partida doméstica; depois o modelo decide
  // se existe um favorito claro. Champions, Libertadores e Sul-Americana continuam fora.
  if (!fixture || excludedFromFavoriteMarket(fixture)) return false;
  return Boolean(fixture.home?.name && fixture.away?.name && fixture.date);
}

function publicRecordForm(fixture, side) {
  const record = fixture?.records?.[side] || fixture?.[side]?.record || null;
  if (!record) return {};
  return {
    games:Number(record.games || 0),
    ppg:Number(record.ppg || 0),
    goalDiffPerGame:Number(record.goalDiffPerGame || 0),
    goalsForPerGame:Number(record.goalsForPerGame || 0),
    goalsAgainstPerGame:Number(record.goalsAgainstPerGame || 0)
  };
}

function identityFavoriteEdge(fixture, homeForm={}, awayForm={}) {
  const sample = Math.min(Number(homeForm?.games || 0), Number(awayForm?.games || 0));
  if (sample >= 3) return 0;
  const homeKnown = isFavoriteClub(fixture.home?.name);
  const awayKnown = isFavoriteClub(fixture.away?.name);
  if (homeKnown === awayKnown) return 0;
  // Só é usado como prior de baixa confiança quando a fonte pública não trouxe forma.
  // Não garante entrada: os filtros de bilhete continuam decidindo se há mercado forte.
  return homeKnown ? .45 : -.45;
}

function favoriteMatchStrength(match) {
  const home = Number(match?.probabilities?.home || 0);
  const away = Number(match?.probabilities?.away || 0);
  const max = Math.max(home, away);
  const margin = Math.abs(home - away);
  const fixture = match?.favoriteFixture || match?.publicFixture || null;
  const oneKnown = fixture ? (isFavoriteClub(fixture.home?.name) !== isFavoriteClub(fixture.away?.name)) : false;
  return { max, margin, clear:(max >= .50 && margin >= .10) || (oneKnown && max >= .47) };
}

function favoriteDiscoveryScore(fixture) {
  const homeKnown = isFavoriteClub(fixture?.home?.name);
  const awayKnown = isFavoriteClub(fixture?.away?.name);
  const hr = fixture?.records?.home || fixture?.home?.record || null;
  const ar = fixture?.records?.away || fixture?.away?.record || null;
  const recordGap = Math.abs(Number(hr?.ppg || 0) - Number(ar?.ppg || 0));
  // Prioriza partidas com sinal de favoritismo antes de consumir cota de forma.
  // A competição em si não dá bônus: copa e liga recebem o mesmo tratamento.
  return (homeKnown !== awayKnown ? 100 : homeKnown && awayKnown ? 40 : 0) + recordGap * 20;
}
function sortFavoriteCandidates(rows=[]) {
  return [...rows].sort((a,b) => favoriteDiscoveryScore(b) - favoriteDiscoveryScore(a) || String(a.date).localeCompare(String(b.date)));
}
function sortFavoriteMatches(rows=[]) {
  return [...rows].sort((a,b) => favoriteMatchStrength(b).max - favoriteMatchStrength(a).max || favoriteMatchStrength(b).margin - favoriteMatchStrength(a).margin);
}

function favoriteAnalysisFromForms(fixture, homeForm={}, awayForm={}) {
  const hp = Number.isFinite(Number(homeForm?.ppg)) ? Number(homeForm.ppg) : 1.45;
  const ap = Number.isFinite(Number(awayForm?.ppg)) ? Number(awayForm.ppg) : 1.45;
  const hgd = Number.isFinite(Number(homeForm?.goalDiffPerGame)) ? Number(homeForm.goalDiffPerGame) : 0;
  const agd = Number.isFinite(Number(awayForm?.goalDiffPerGame)) ? Number(awayForm.goalDiffPerGame) : 0;
  // A força vem principalmente da forma recente, saldo de gols e mando. Se a fonte
  // pública não trouxer amostra suficiente, um clube reconhecidamente forte entra só
  // como prior de baixa confiança para identificar o provável favorito — nunca como garantia.
  const identityEdge = identityFavoriteEdge(fixture, homeForm, awayForm);
  const edge = clamp((hp-ap)/3*.70 + (hgd-agd)/3*.25 + .08 + identityEdge, -.72, .72);
  const draw = clamp(.285 - Math.abs(edge)*.075, .19, .30);
  const share = 1 / (1 + Math.exp(-edge*2.25));
  const remaining = 1 - draw;
  const home = clamp(remaining * share, .12, .78);
  const away = clamp(remaining - home, .10, .74);
  const total1 = Number(homeForm?.goalsForPerGame || 0) + Number(homeForm?.goalsAgainstPerGame || 0);
  const total2 = Number(awayForm?.goalsForPerGame || 0) + Number(awayForm?.goalsAgainstPerGame || 0);
  const avgTotal = total1 > 0 && total2 > 0 ? (total1 + total2) / 2 : 2.6;
  const over25 = clamp(.50 + (avgTotal - 2.5)*.10 + Math.abs(edge)*.035, .40, .70);
  const under25 = 1 - over25;
  const expectedGoals = deriveExpectedGoals({home,draw,away,over25,under25});
  const btts = (1-Math.exp(-expectedGoals.home))*(1-Math.exp(-expectedGoals.away));
  const sample = Math.min(Number(homeForm?.games || 0), Number(awayForm?.games || 0));
  const reliability = sample >= 6 ? .84 : sample >= 4 ? .78 : .70;
  return {
    mode:'favorite-market-model',
    probabilitySource:'API-Football + forma recente + modelo próprio',
    leagueKey:`favorite-${fixture.league?.id || 'domestic'}`,
    leagueLabel:fixture.league?.name || 'Competição doméstica',
    homeTeam:fixture.home?.name || '', awayTeam:fixture.away?.name || '', kickoff:fixture.date,
    status:fixture.status || 'NS', sample:{recentGames:sample,bookmakers:0}, expectedGoals, likelyScores:[],
    probabilities:{home,draw,away,over25,under25,btts,noBtts:1-btts},
    favoriteModelReliability:reliability,
    favoriteFixture:fixture
  };
}

function attachFavoriteAdvanced(fixture, homeForm, awayForm) {
  const analysis = favoriteAnalysisFromForms(fixture, homeForm, awayForm);
  const reliability = Number(analysis.favoriteModelReliability || .72);
  const attached = attachAdvanced(analysis,{bookmakers:[],best:{},consensus:{}},fixture);
  attached.estimatedMarkets = (attached.estimatedMarkets || []).map(m => ({
    ...m,
    reliability:Math.min(Number(m.reliability || reliability), reliability),
    confidence:reliability >= .82 ? 'alta' : reliability >= .76 ? 'média' : 'baixa',
    source:'API-Football + forma recente + modelo próprio'
  }));
  attached.estimatedMarkets.unshift(
    {market:'1X2',key:'home',selection:`${analysis.homeTeam} vence`,probability:analysis.probabilities.home,fairOdd:round2(1/analysis.probabilities.home),odd:null,bookmaker:null,edge:null,oddType:'estimada',source:'API-Football + forma recente + modelo próprio',confidence:reliability>=.82?'alta':reliability>=.76?'média':'baixa',reliability},
    {market:'1X2',key:'draw',selection:'Empate',probability:analysis.probabilities.draw,fairOdd:round2(1/analysis.probabilities.draw),odd:null,bookmaker:null,edge:null,oddType:'estimada',source:'API-Football + forma recente + modelo próprio',confidence:reliability>=.82?'alta':reliability>=.76?'média':'baixa',reliability},
    {market:'1X2',key:'away',selection:`${analysis.awayTeam} vence`,probability:analysis.probabilities.away,fairOdd:round2(1/analysis.probabilities.away),odd:null,bookmaker:null,edge:null,oddType:'estimada',source:'API-Football + forma recente + modelo próprio',confidence:reliability>=.82?'alta':reliability>=.76?'média':'baixa',reliability}
  );
  return attached;
}

function attachFavoritePublicAdvanced(fixture) {
  const item = attachFavoriteAdvanced(fixture, publicRecordForm(fixture, 'home'), publicRecordForm(fixture, 'away'));
  item.mode = 'favorite-market-public-fallback';
  item.probabilitySource = 'Fonte pública + modelo próprio';
  item.favoriteModelReliability = .58;
  item.apiFixture = null;
  item.publicFixture = fixture;
  item.estimatedMarkets = (item.estimatedMarkets || []).map(m => ({
    ...m,
    odd:null, bookmaker:null, edge:null, oddType:'estimada',
    reliability:Math.min(Number(m.reliability || .58), .58),
    confidence:'baixa',
    source:'Modelo próprio • odd aproximada • sem consulta da API-Football'
  }));
  return item;
}

function mergePlayerSamples(current=[], previous=[]) {
  if (!current.length) return previous.map(x => ({...x, historicalFallback:true}));
  const prevById = new Map(previous.map(p => [String(p.id || normalizeName(p.name)), p]));
  const rateFields = ['shotsPer90','sotPer90','goalsPer90','savesPer90','foulsCommittedPer90','foulsDrawnPer90','cardsPer90'];
  return current.map(c => {
    const old = prevById.get(String(c.id || normalizeName(c.name)));
    if (!old) return c;
    const cm = Math.max(0, Number(c.minutes || 0)), pm = Math.max(0, Number(old.minutes || 0));
    const total = cm + pm;
    const merged = {...c, appearances:Number(c.appearances||0)+Number(old.appearances||0), starts:Number(c.starts||0)+Number(old.starts||0), minutes:total, historicalFallback:pm>0};
    for (const field of rateFields) merged[field] = total ? (Number(c[field]||0)*cm + Number(old[field]||0)*pm) / total : Number(c[field]||old[field]||0);
    return merged;
  });
}

async function stableTeamPlayerStats(teamId, apiFixture, date) {
  const fixtureLeagueId = Number(apiFixture?.leagueId);
  const primary = PRIMARY_LEAGUE_BY_COUNTRY.get(String(apiFixture?.leagueCountry || ''));
  // Para mercado de jogador, prioriza a liga nacional do clube. Em jogos de copa,
  // isso evita consultar copa + liga + temporadas anteriores e estourar a cota.
  const preferredLeague = Number.isFinite(Number(primary)) ? Number(primary) : fixtureLeagueId;
  const leagueIds = [preferredLeague].filter(Number.isFinite);
  let lastError = null;
  for (const leagueId of leagueIds) {
    try {
      const season = seasonFor(date, leagueId);
      const current = await getTeamPlayerSeasonStats(teamId, leagueId, season);
      const needsHistory = !current.length || Math.max(0, ...current.map(p=>Number(p.minutes||0))) < 360;
      let previous = [];
      if (needsHistory) previous = await getTeamPlayerSeasonStats(teamId, leagueId, season - 1).catch(()=>[]);
      const players = mergePlayerSamples(current, previous);
      if (players.length) return {players, season, leagueId, usedPrevious:previous.length>0};
    } catch (error) { lastError = error; }
  }
  if (lastError) throw lastError;
  return {players:[],season:null,leagueId:fixtureLeagueId,usedPrevious:false};
}

function attachAdvanced(analysis, oddsSummary, apiFixture = null) {
  const opportunities = buildOpportunities(analysis, oddsSummary);
  const estimatedMarkets = estimateAdvancedMarkets(analysis);
  const attached = {
    ...analysis,
    odds: oddsSummary,
    opportunities,
    estimatedMarkets,
    apiFixture: compactApiFixture(apiFixture)
  };
  return attached;
}

async function apiFixturesSafe(date) {
  if (!process.env.API_FOOTBALL_KEY) return { fixtures: [], error: null };
  try { return { fixtures: await getFixturesForDate(date), error: null }; }
  catch (error) { return { fixtures: [], error: error.message }; }
}


async function oddsFallbackFixtures(date) {
  if (!process.env.ODDS_API_KEY) throw new Error('ODDS_API_KEY não configurada para o modo alternativo de partidas.');
  const keys = Object.keys(LEAGUES);
  const settled = await Promise.allSettled(keys.map(async key => {
    const events = await getLeagueEvents(key);
    return (events || [])
      .filter(e => dateInSaoPaulo(e.commence_time) === date)
      .map(e => normalizeOddsEvent(e, key));
  }));
  const fixtures = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const errors = settled.filter(r => r.status === 'rejected').map(r => r.reason?.message).filter(Boolean);
  return { fixtures, errors };
}

function parseOddsFixtureToken(value) {
  const raw = String(value || '');
  if (!raw.startsWith('odds~')) return null;
  const [, leagueKey, eventId] = raw.split('~');
  if (!leagueKey || !eventId || !LEAGUES[leagueKey]) return null;
  return { leagueKey, eventId, fixtureId: raw };
}

async function oddsFallbackSnapshots(tokens) {
  const grouped = new Map();
  for (const token of tokens) {
    const parsed = parseOddsFixtureToken(token);
    if (!parsed) continue;
    if (!grouped.has(parsed.leagueKey)) grouped.set(parsed.leagueKey, new Set());
    grouped.get(parsed.leagueKey).add(parsed.eventId);
  }
  const snapshots = [];
  const errors = [];
  for (const [leagueKey, ids] of grouped) {
    try {
      const rows = await getLeagueScores(leagueKey);
      for (const row of rows || []) {
        if (ids.has(String(row.id))) snapshots.push(normalizeOddsScore(row, leagueKey));
      }
    } catch (error) { errors.push(error.message); }
  }
  return { snapshots, errors };
}


function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
function round2(n){ return Math.round(Number(n)*100)/100; }

function fixtureRecordPpg(record) {
  const ppg = Number(record?.ppg);
  return Number.isFinite(ppg) ? clamp(ppg,0,3) : null;
}

function analyzePublicFixture(fixture, leagueKey) {
  const hRec=fixture.records?.home || fixture.home?.record || null;
  const aRec=fixture.records?.away || fixture.away?.record || null;
  const hp=fixtureRecordPpg(hRec), ap=fixtureRecordPpg(aRec);
  const hg=Number(hRec?.games || 0), ag=Number(aRec?.games || 0);
  const sample=Math.min(hg,ag);
  const weight=clamp(sample/8,0,1);
  const diff=(hp===null || ap===null) ? 0 : clamp((hp-ap)/3,-1,1)*weight;

  // Prior conservador para calendário sem odds. Só serve para manter o modelo funcionando
  // quando as APIs pagas/gratuitas com odds estão indisponíveis; a tela sinaliza baixa confiança.
  let draw=clamp(0.29 - Math.abs(diff)*0.07,0.20,0.31);
  let home=clamp(0.39 + diff*0.30,0.16,0.72);
  let away=clamp(1-home-draw,0.13,0.68);
  const total=home+draw+away; home/=total; draw/=total; away/=total;
  const over25=clamp(0.52 + Math.abs(diff)*0.06,0.46,0.60);
  const under25=1-over25;
  const expectedGoals = deriveExpectedGoals({home,draw,away,over25,under25});
  const btts=(1-Math.exp(-expectedGoals.home))*(1-Math.exp(-expectedGoals.away));
  return {
    mode:'public-fixture-estimate', probabilitySource: sample >= 2 ? 'Calendário público + forma W/D/L + modelo estimado' : 'Calendário público + prior estatístico provisório',
    leagueKey, leagueLabel:LEAGUES[leagueKey]?.label || fixture.league?.name || leagueKey,
    homeTeam:fixture.home?.name || '', awayTeam:fixture.away?.name || '', kickoff:fixture.date,
    status:fixture.status || 'NS', sample:{bookmakers:0,recordGames:sample}, expectedGoals, likelyScores:[],
    probabilities:{home,draw,away,over25,under25,btts,noBtts:1-btts},
    publicFixture:fixture
  };
}

function attachPublicAdvanced(fixture, leagueKey, apiFixtures=[]) {
  const analysis=analyzePublicFixture(fixture,leagueKey);
  const apiFixture=findApiFixture(analysis.homeTeam,analysis.awayTeam,apiFixtures);
  const attached=attachAdvanced(analysis,{bookmakers:[],best:{},consensus:{}},apiFixture);
  // Em modo sem odds, diminui a confiança para não apresentar estimativa provisória como dado forte.
  attached.estimatedMarkets=(attached.estimatedMarkets||[]).map(m=>({...m,reliability:Math.min(Number(m.reliability||.7),.72),confidence:'baixa',source:'Modelo estimado • sem odd real'}));
  // 1X2 estimado também permanece disponível para montar/comparar bilhetes.
  attached.estimatedMarkets.unshift(
    {market:'1X2',key:'home',selection:`${analysis.homeTeam} vence`,probability:analysis.probabilities.home,fairOdd:round2(1/analysis.probabilities.home),odd:null,bookmaker:null,edge:null,oddType:'estimada',source:'Modelo estimado • sem odd real',confidence:'baixa',reliability:.62},
    {market:'1X2',key:'draw',selection:'Empate',probability:analysis.probabilities.draw,fairOdd:round2(1/analysis.probabilities.draw),odd:null,bookmaker:null,edge:null,oddType:'estimada',source:'Modelo estimado • sem odd real',confidence:'baixa',reliability:.62},
    {market:'1X2',key:'away',selection:`${analysis.awayTeam} vence`,probability:analysis.probabilities.away,fairOdd:round2(1/analysis.probabilities.away),odd:null,bookmaker:null,edge:null,oddType:'estimada',source:'Modelo estimado • sem odd real',confidence:'baixa',reliability:.62}
  );
  return attached;
}

async function publicOnlyLeague(leagueKey,date,apiFixtures=[]) {
  const result=await getPublicFixtures(date,leagueKey);
  const matches=onlyPrematch((result.fixtures||[]).map(f=>attachPublicAdvanced(f,leagueKey,apiFixtures)));
  return {matches,source:result.source,errors:result.errors||[]};
}

async function leagueWithFallback(leagueKey,date,apiFixtures=[]) {
  try {
    const matches=await oddsOnlyLeague(leagueKey,date,apiFixtures);
    return {matches,source:'The Odds API',oddsOk:true,warning:null};
  } catch (error) {
    // Uma liga sem partidas (ou uma fonte momentaneamente indisponível) nunca deve
    // deixar a interface presa. O fallback sempre devolve um resultado, inclusive [];
    // o front então mostra "não há partidas" imediatamente.
    const fallback=await publicOnlyLeague(leagueKey,date,apiFixtures).catch(e => ({matches:[],source:'nenhuma',errors:[e.message]}));
    const detail=[error.message,...(fallback.errors || [])].filter(Boolean).join(' | ');
    return {matches:fallback.matches || [],source:fallback.source || 'nenhuma',oddsOk:false,warning:detail || 'Nenhuma partida disponível nessa data.'};
  }
}

async function oddsOnlyLeague(leagueKey, date, apiFixtures = []) {
  const league = LEAGUES[leagueKey];
  const games = await getLeagueOdds(leagueKey);
  return games
    .filter(g => dateInSaoPaulo(g.commence_time) === date)
    .map(game => {
      const oddsSummary = summarizeOdds(game);
      const analysis = analyzeMarketGame(game, oddsSummary, leagueKey, league.label);
      const fixture = findApiFixture(analysis.homeTeam, analysis.awayTeam, apiFixtures);
      return attachAdvanced(analysis, oddsSummary, fixture);
    })
    .filter(match => isPrematchEligible(match));
}

async function brasileiraoPoisson(date, apiFixtures = []) {
  const season = Number(date.slice(0,4));
  const [seasonMatches, dayMatches, odds] = await Promise.all([
    getSeasonMatches(season), getMatchesForDate(date), getBrasileiraoOdds().catch(error => ({ __error: error.message }))
  ]);
  const oddsError = odds?.__error;
  const oddsGames = oddsError ? [] : odds;
  const analyses = dayMatches.filter(match => isPrematchEligible(match)).map(match => {
    const base = analyzeMatch(match, seasonMatches);
    const oddsGame = findOddsGame(base.homeTeam, base.awayTeam, oddsGames);
    const oddsSummary = summarizeOdds(oddsGame);
    const analysis = { ...base, mode: 'poisson', probabilitySource: 'Modelo Poisson com histórico', leagueKey: 'brasileirao', leagueLabel: LEAGUES.brasileirao.label, status: match.status, matchday: match.matchday };
    const fixture = findApiFixture(analysis.homeTeam, analysis.awayTeam, apiFixtures);
    return attachAdvanced(analysis, oddsSummary, fixture);
  });
  return { analyses, oddsError };
}

async function enrichWithPlayerMarkets(matches, date, options = {}) {
  if (!process.env.API_FOOTBALL_KEY) return { matches, status: 'API-Football não configurada; mercados de jogadores detalhados aguardam uma fonte com escalação/estatísticas' };

  // O Mercado dos Favoritos pode ter sido descoberto por ESPN/TheSportsDB. Antes,
  // esses jogos ficavam com apiFixture=null e por isso NENHUM mercado real de jogador
  // era sequer tentado. Fazemos um único vínculo por data com a API-Football e reaproveitamos
  // o cache. Se a cota estiver ocupada, o restante do bilhete continua normalmente.
  const missingLinks = (matches || []).filter(m => !m.apiFixture?.homeTeamId || !m.apiFixture?.awayTeamId);
  let linkError = null;
  if (missingLinks.length) {
    try {
      const apiDay = await getFixturesForDate(date, { allCompetitions:true });
      for (const m of missingLinks) {
        const linked = findApiFixture(m.homeTeam, m.awayTeam, apiDay);
        if (linked) m.apiFixture = compactApiFixture(linked);
      }
    } catch (error) {
      linkError = error?.message || String(error);
    }
  }

  const configuredLimit = Math.max(1, Math.min(8, Number(options.maxMatches || process.env.AUTO_PLAYER_MATCH_LIMIT || 6)));
  const quota = getApiFootballQuota();
  // Um jogo pode consumir até 4 chamadas (2 times x temporada atual/anterior).
  // Reserva 1 chamada de folga para não encostar no teto por minuto.
  const quotaLimit = Number.isFinite(Number(quota.minuteRemaining))
    ? Math.max(0, Math.floor((Number(quota.minuteRemaining) - 1) / 4))
    : configuredLimit;
  const limit = Math.min(configuredLimit, quotaLimit);
  if (limit <= 0) {
    return { matches, status: 'cota por minuto temporariamente ocupada; mercados de jogadores serão tentados na próxima atualização' };
  }
  const eligible = [...matches]
    .filter(m => m.apiFixture?.homeTeamId && m.apiFixture?.awayTeamId && m.apiFixture?.leagueId)
    .sort((a,b) => Math.max(b.probabilities?.home || 0, b.probabilities?.away || 0) - Math.max(a.probabilities?.home || 0, a.probabilities?.away || 0))
    .slice(0, limit);
  let loaded = 0;
  let historicalFallbackGames = 0;
  const playerErrors = [];
  const settled = await mapWithConcurrency(eligible, 1, async (m) => {
    const f = m.apiFixture;
    const [homeSample, awaySample] = await Promise.all([
      stableTeamPlayerStats(f.homeTeamId, f, date),
      stableTeamPlayerStats(f.awayTeamId, f, date)
    ]);
    const usedPrevious = homeSample.usedPrevious || awaySample.usedPrevious;
    const playerMarkets = estimatePlayerMarkets([...homeSample.players, ...awaySample.players], {
      homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId,
      homeLambda: m.expectedGoals?.home || 1.35, awayLambda: m.expectedGoals?.away || 1.15
    }).slice(0, 48).map(pm => usedPrevious ? {
      ...pm,
      source:'API-Football + temporada atual/anterior + modelo próprio',
      reliability:pm.confidence === 'alta' ? .86 : pm.confidence === 'média' ? .80 : .72
    } : pm);
    m.estimatedMarkets = [...(m.estimatedMarkets || []), ...playerMarkets];
    m.playerMarketsAutoLoaded = playerMarkets.length;
    m.playerMarketsUsedPreviousSeason = usedPrevious;
    return { playerMarkets:playerMarkets.length, usedPrevious };
  });
  settled.forEach((row, index) => {
    if (row.status === 'fulfilled') {
      loaded += row.value.playerMarkets;
      if (row.value.usedPrevious) historicalFallbackGames += 1;
    } else {
      const error = row.reason instanceof Error ? row.reason : new Error(String(row.reason || 'Falha ao carregar jogadores'));
      eligible[index].playerMarketsAutoError = error.message;
      playerErrors.push(error.message);
    }
  });
  let status;
  if (loaded) status = `${loaded} mercado(s) de jogadores em ${eligible.filter(m=>m.playerMarketsAutoLoaded).length} jogo(s)${historicalFallbackGames ? ` • ${historicalFallbackGames} com apoio da temporada anterior` : ''}`;
  else if (playerErrors.length) status = `indisponíveis: ${playerErrors[0]}`;
  else if (!eligible.length) status = linkError
    ? `sem vínculo detalhado agora: ${linkError}`
    : 'sem vínculo de escalação/estatísticas para estas partidas';
  else status = '0 mercado(s): amostra de jogadores insuficiente';
  return { matches, status };
}


async function favoriteMarketDashboard(date, includePlayers = false) {
  let apiError = null;
  let candidates = [];
  let fixtureSource = 'API-Football';

  // Primeiro tenta a fonte completa. Se faltar chave, cota (429), houver timeout ou
  // qualquer indisponibilidade, o Mercado dos Favoritos NÃO para: troca para a
  // agenda pública e continua montando bilhetes com odds aproximadas do modelo.
  if (process.env.API_FOOTBALL_KEY) {
    try {
      const allFixtures = await getFixturesForDate(date, { allCompetitions:true });
      candidates = sortFavoriteCandidates(onlyPrematch(allFixtures.filter(favoriteFixtureEligible))).slice(0, 24);
    } catch (error) {
      apiError = error?.message || String(error);
    }
  } else {
    apiError = 'API-Football não configurada';
  }

  if (!candidates.length) {
    if (!apiError) apiError = 'API-Football não trouxe partidas para este dia; usando calendário público';
    const publicResult = await getPublicFavoriteFixtures(date);
    candidates = sortFavoriteCandidates(onlyPrematch((publicResult.fixtures || []).filter(favoriteFixtureEligible))).slice(0, 24);
    fixtureSource = publicResult.source || 'fonte pública';

    // A busca pública ampla acima já cobre ligas e copas domésticas em paralelo,
    // então não repetimos as mesmas fontes liga por liga (isso era uma causa de demora).

    // Último fallback de descoberta: usa apenas o calendário/eventos da The Odds API,
    // sem aproveitar a cotação da casa. O preço mostrado continua sendo aproximado
    // pelo modelo próprio, conforme a regra do modo sem API-Football.
    if (!candidates.length && process.env.ODDS_API_KEY) {
      try {
        const oddsFallback = await oddsFallbackFixtures(date);
        candidates = sortFavoriteCandidates(onlyPrematch((oddsFallback.fixtures || []).filter(favoriteFixtureEligible))).slice(0, 24);
        if (candidates.length) fixtureSource = 'calendário da The Odds API (sem usar a cotação)';
      } catch { /* mantém vazio se todas as fontes externas falharem */ }
    }
  }

  // Se estamos no fallback público, não existe forma recente da API-Football nem
  // prop de jogador confiável. Mesmo assim o modelo monta normalmente os perfis
  // usando probabilidades próprias e sinaliza TODA cotação como aproximada.
  if (apiError) {
    const matches = sortFavoriteMatches(onlyPrematch(candidates.map(attachFavoritePublicAdvanced)).filter(m => favoriteMatchStrength(m).clear)).slice(0, 14);
    const playerStatus = includePlayers
      ? 'API-Football indisponível; bilhetes continuam sem props de jogadores até a cota voltar'
      : 'sob demanda';
    return {
      date,
      leagueKey:'market-favorites',
      sourceStatus:{
        mode:'Mercado dos Favoritos • fallback público + odds aproximadas',
        footballData:'não usado', oddsApi:'não obrigatório', publicFixtures:fixtureSource,
        apiFootball:`indisponível: ${apiError}`, jogadores:playerStatus,
        excluded:'Champions League, Libertadores e Sul-Americana',
        fallbackActive:true
      },
      count:matches.length,
      matches,
      ...buildTicketPayload(matches),
      disclaimer:'A API-Football não respondeu. O Bilhete Plus continua montando os bilhetes com partidas de fonte pública e odds aproximadas calculadas pelo modelo próprio. Essas cotações não são odds de uma casa.'
    };
  }

  // O plano gratuito da API-Football permite poucas chamadas por minuto. Analisa
  // forma recente apenas onde cabe com segurança na janela atual.
  const quota = getApiFootballQuota();
  const reserveForPlayers = includePlayers ? 8 : 1;
  const remaining = Number(quota.minuteRemaining);
  const safeForForms = Number.isFinite(remaining) ? Math.max(0, remaining - reserveForPlayers - 1) : 4;
  const maxFormMatches = Math.max(0, Math.min(2, Math.floor(safeForForms / 2), candidates.length));
  const formCandidates = candidates.slice(0, maxFormMatches);

  const settled = await mapWithConcurrency(formCandidates, 1, async (fixture) => {
    const [homeForm, awayForm] = await Promise.all([
      getTeamRecentForm(fixture.home?.id, 8),
      getTeamRecentForm(fixture.away?.id, 8)
    ]);
    return attachFavoriteAdvanced(fixture, homeForm, awayForm);
  });
  const analyses = settled.filter(x => x.status === 'fulfilled').map(x => x.value);
  const errors = settled.map((row, index) => row.status === 'rejected'
    ? `${formCandidates[index]?.home?.name || '?'} x ${formCandidates[index]?.away?.name || '?'}: ${row.reason?.message || row.reason}`
    : null).filter(Boolean);

  const analyzedIds = new Set(analyses.map(a => Number(a.favoriteFixture?.fixtureId)));
  const lightweight = candidates
    .filter(f => !analyzedIds.has(Number(f.fixtureId)))
    .slice(0, Math.max(0, 6 - analyses.length))
    .map(f => {
      const item = attachFavoriteAdvanced(f, {}, {});
      item.favoriteModelReliability = .58;
      item.probabilitySource = 'Partida descoberta pela API-Football • aguardando cota para forma recente';
      item.estimatedMarkets = (item.estimatedMarkets || []).map(m => ({ ...m, reliability:Math.min(Number(m.reliability || .58), .58), confidence:'baixa' }));
      return item;
    });
  analyses.push(...lightweight);
  let matches = sortFavoriteMatches(onlyPrematch(analyses).filter(m => favoriteMatchStrength(m).clear)).slice(0, 14);
  let playerStatus = 'sob demanda';
  if (includePlayers) {
    const enriched = await enrichWithPlayerMarkets(matches, date);
    matches = enriched.matches;
    playerStatus = enriched.status;
  }
  return {
    date,
    leagueKey:'market-favorites',
    sourceStatus:{
      mode:'Mercado dos Favoritos • ligas/copas/supercopas domésticas',
      footballData:'não usado', oddsApi:'não obrigatório', publicFixtures:'não usado',
      apiFootball:'ok', jogadores:playerStatus,
      excluded:'Champions League, Libertadores e Sul-Americana',
      warning:errors.length ? errors.slice(0,3).join(' | ') : null
    },
    count:matches.length,
    matches,
    ...buildTicketPayload(matches),
    disclaimer:'O Mercado dos Favoritos procura partidas domésticas de qualquer competição e exibe as que apresentam um favorito claro pelo modelo. Copa e liga são tratadas igualmente; Champions League, Libertadores e Sul-Americana ficam fora.'
  };
}

async function publicDashboardOnly(date, leagueKey, includePlayers = false) {
  const api = await apiFixturesSafe(date);
  const group = leagueKey === 'all-major' ? MAJOR_FIVE : leagueKey === 'all-second' ? MAJOR_SECOND : null;

  if (group) {
    const settled = await Promise.allSettled(group.map(k => publicOnlyLeague(k, date, api.fixtures)));
    let matches = onlyPrematch(settled.flatMap(r => r.status === 'fulfilled' ? r.value.matches : []));
    const sources = settled.filter(r => r.status === 'fulfilled').map(r => r.value.source).filter(Boolean);
    const errors = settled.map((r,i) => r.status === 'rejected' ? `${LEAGUES[group[i]].label}: ${r.reason.message}` : null).filter(Boolean);
    let playerStatus = 'sob demanda';
    if (includePlayers) { const enriched = await enrichWithPlayerMarkets(matches, date); matches = enriched.matches; playerStatus = enriched.status; }
    return {
      date, leagueKey,
      sourceStatus:{
        mode:'partidas públicas + odds estimadas (fallback)',
        oddsApi:'sem cota/ignorada no modo fallback',
        publicFixtures:[...new Set(sources)].join(' + ') || 'nenhuma',
        apiFootball:process.env.API_FOOTBALL_KEY ? (api.error ? `parcial: ${api.error}` : 'ok') : 'não configurada',
        jogadores:playerStatus,
        warning:errors.length ? errors.join(' | ') : null,
        fallbackActive:true
      },
      count:matches.length, matches, ...buildTicketPayload(matches),
      disclaimer:'Odds reais indisponíveis. As partidas vêm de fontes públicas e as odds exibidas são justas/estimadas pelo modelo, com confiança reduzida.'
    };
  }

  if (!LEAGUES[leagueKey]) throw new Error('Liga inválida.');
  const result = await publicOnlyLeague(leagueKey, date, api.fixtures);
  let matches = result.matches || [];
  let playerStatus = 'sob demanda';
  if (includePlayers) { const enriched = await enrichWithPlayerMarkets(matches, date); matches = enriched.matches; playerStatus = enriched.status; }
  return {
    date, leagueKey,
    sourceStatus:{
      mode:'partidas públicas + odds estimadas (fallback)',
      footballData:leagueKey === 'brasileirao' ? 'fallback ativo' : 'não usado',
      oddsApi:'sem cota/ignorada no modo fallback',
      publicFixtures:result.source || 'nenhuma',
      apiFootball:api.error ? `parcial: ${api.error}` : (process.env.API_FOOTBALL_KEY ? 'ok' : 'não configurada'),
      jogadores:playerStatus,
      warning:(result.errors || []).length ? result.errors.join(' | ') : null,
      fallbackActive:true
    },
    count:matches.length, matches, ...buildTicketPayload(matches),
    disclaimer:'Odds reais indisponíveis. As partidas vêm de fontes públicas e as odds exibidas são justas/estimadas pelo modelo, com confiança reduzida.'
  };
}

async function dashboard(date, leagueKey, includePlayers = false, forcePublic = false) {
  if (leagueKey === 'market-favorites') return favoriteMarketDashboard(date, includePlayers);
  if (forcePublic) return publicDashboardOnly(date, leagueKey, includePlayers);
  const api = await apiFixturesSafe(date);
  if (leagueKey === 'all-major' || leagueKey === 'all-second') {
    const group = leagueKey === 'all-major' ? MAJOR_FIVE : MAJOR_SECOND;
    const settled = await Promise.allSettled(group.map(k => leagueWithFallback(k, date, api.fixtures)));
    let matches = onlyPrematch(settled.flatMap(r => r.status === 'fulfilled' ? r.value.matches : []));
    const sourceRows=settled.filter(r=>r.status==='fulfilled').map(r=>r.value);
    const errors=settled.map((r,i)=>r.status==='rejected'?`${LEAGUES[group[i]].label}: ${r.reason.message}`:null).filter(Boolean);
    let playerStatus = 'sob demanda';
    if (includePlayers) { const enriched = await enrichWithPlayerMarkets(matches, date); matches = enriched.matches; playerStatus = enriched.status; }
    const usedFallback=sourceRows.some(r=>!r.oddsOk);
    return {
      date, leagueKey,
      sourceStatus: {
        mode: usedFallback ? 'partidas públicas + odds estimadas (fallback)' : 'odds + mercados estimados',
        oddsApi: usedFallback ? 'sem cota/indisponível em parte ou todas as ligas' : 'ok',
        publicFixtures: usedFallback ? [...new Set(sourceRows.filter(r=>!r.oddsOk).map(r=>r.source))].join(' + ') : 'não usado',
        apiFootball: process.env.API_FOOTBALL_KEY ? (api.error ? `parcial: ${api.error}` : 'ok') : 'não configurada',
        jogadores: playerStatus,
        warning: errors.length ? errors.join(' | ') : null
      },
      count: matches.length,
      matches,
      ...buildTicketPayload(matches),
      disclaimer: usedFallback ? 'Sem odd real disponível, o Bilhete Plus usa calendário público e odd justa estimada. Estimativas do fallback têm confiança reduzida.' : 'Odds reais quando disponíveis; demais mercados exibem odd justa estimada pelo modelo.'
    };
  }
  if (!LEAGUES[leagueKey]) throw new Error('Liga inválida.');
  if (leagueKey === 'brasileirao' && process.env.FOOTBALL_DATA_TOKEN) {
    try {
      const { analyses, oddsError } = await brasileiraoPoisson(date, api.fixtures);
      let matches = onlyPrematch(analyses); let playerStatus = 'sob demanda';
      if (includePlayers) { const enriched = await enrichWithPlayerMarkets(matches, date); matches = enriched.matches; playerStatus = enriched.status; }
      return { date, leagueKey, sourceStatus:{mode:'Poisson + mercados estimados',footballData:'ok',oddsApi:oddsError?`erro: ${oddsError}`:'ok',apiFootball:api.error?`parcial: ${api.error}`:(process.env.API_FOOTBALL_KEY?'ok':'não configurada'),jogadores:playerStatus},count:matches.length,matches,...buildTicketPayload(matches),disclaimer:'Probabilidades e odds justas são estimativas estatísticas; odds reais mudam e não há garantia de lucro.' };
    } catch { /* segue para fallback público */ }
  }
  const result=await leagueWithFallback(leagueKey,date,api.fixtures);
  let matches=result.matches; let playerStatus='sob demanda';
  if(includePlayers){ const enriched=await enrichWithPlayerMarkets(matches,date);matches=enriched.matches;playerStatus=enriched.status; }
  return {
    date,leagueKey,
    sourceStatus:{
      mode:result.oddsOk?'odds + mercados estimados':'partidas públicas + odds estimadas (fallback)',
      footballData:leagueKey==='brasileirao'?'fallback ativo':'não usado',
      oddsApi:result.oddsOk?'ok':`indisponível: ${result.warning}`,
      publicFixtures:result.oddsOk?'não usado':result.source,
      apiFootball:api.error?`parcial: ${api.error}`:(process.env.API_FOOTBALL_KEY?'ok':'não configurada'),
      jogadores:playerStatus
    },
    count:matches.length,matches,...buildTicketPayload(matches),
    disclaimer:result.oddsOk?'Probabilidades-base vêm do mercado sem margem; mercados adicionais usam modelo estimado.':'A The Odds API não respondeu. Partidas vêm de fonte pública e todas as odds exibidas são justas/estimadas pelo modelo, com confiança reduzida.'
  };
}


async function singleMatchTicketsDashboard(date, leagueKey, home, away, includePlayers = false) {
  // Descobre as partidas primeiro sem gastar cota de jogadores em jogos que o usuário
  // não escolheu. Depois enriquece somente a partida selecionada.
  const base = await dashboard(date, leagueKey, false);
  const selected = (base.matches || []).find(m => sameTeam(m.homeTeam, home) && sameTeam(m.awayTeam, away))
    || (base.matches || []).find(m => sameTeam(m.homeTeam, away) && sameTeam(m.awayTeam, home));
  if (!selected) throw new Error('A partida selecionada não está mais disponível como pré-jogo. Atualize a lista e tente novamente.');

  let matches = [selected];
  let playerStatus = includePlayers ? 'tentando carregar' : 'não solicitado';
  if (includePlayers) {
    const enriched = await enrichWithPlayerMarkets(matches, date, { maxMatches:1 });
    matches = enriched.matches;
    playerStatus = enriched.status;
  }
  const match = matches[0];
  return {
    date,
    leagueKey,
    singleMatch:true,
    sourceStatus:{ ...base.sourceStatus, jogadores:playerStatus },
    count:1,
    matches:[match],
    ...buildTicketPayload([match]),
    disclaimer:'Modo Apenas um jogo: todos os bilhetes usam exclusivamente mercados compatíveis da partida selecionada. Mercados de jogadores entram quando há estatísticas suficientes; nenhuma seleção é inventada para preencher faixa de odd.'
  };
}

function seasonFor(date, leagueId) {
  const year = Number(String(date).slice(0,4));
  const month = Number(String(date).slice(5,7));
  // Brasil usa ano-calendário. As ligas europeias e saudita atravessam o ano.
  if ([71, 72].includes(Number(leagueId))) return year;
  return month <= 6 ? year - 1 : year;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/health') {
      return json(res, 200, {
        ok: true,
        hasFootballDataToken: !!process.env.FOOTBALL_DATA_TOKEN,
        hasOddsApiKey: !!process.env.ODDS_API_KEY,
        hasApiFootballKey: !!process.env.API_FOOTBALL_KEY,
        liveRefreshSeconds: Math.max(20, Math.min(30, Number(process.env.LIVE_REFRESH_SECONDS || 30))),
        liveLeagues: API_FOOTBALL_LEAGUES,
        leagues: LEAGUES,
        supportsAllMajor: true,
        supportsFavoriteMarket: true,
        supportsAllSecond: true,
        supportsEstimatedMarkets: true,
        supportsPlayerPregame: !!process.env.API_FOOTBALL_KEY
      });
    }
    if (url.pathname === '/api/dashboard') {
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
      const league = url.searchParams.get('league') || 'market-favorites';
      const includePlayers = ['1','true','yes'].includes(String(url.searchParams.get('includePlayers') || '').toLowerCase());
      const forcePublic = ['1','true','yes'].includes(String(url.searchParams.get('forcePublic') || '').toLowerCase());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'Data inválida. Use YYYY-MM-DD.' });
      return json(res, 200, await dashboard(date, league, includePlayers, forcePublic));
    }
    if (url.pathname === '/api/single-match-tickets') {
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
      const league = url.searchParams.get('league') || 'market-favorites';
      const home = url.searchParams.get('home') || '';
      const away = url.searchParams.get('away') || '';
      const includePlayers = ['1','true','yes'].includes(String(url.searchParams.get('includePlayers') || '').toLowerCase());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'Data inválida. Use YYYY-MM-DD.' });
      if (!home || !away) return json(res, 400, { error: 'Informe a partida selecionada.' });
      return json(res, 200, await singleMatchTicketsDashboard(date, league, home, away, includePlayers));
    }
    if (url.pathname === '/api/pregame/player-markets') {
      if (!process.env.API_FOOTBALL_KEY) return json(res, 400, { error: 'API_FOOTBALL_KEY não configurada.' });
      const homeTeamId = Number(url.searchParams.get('homeTeamId'));
      const awayTeamId = Number(url.searchParams.get('awayTeamId'));
      const leagueId = Number(url.searchParams.get('leagueId'));
      const leagueCountry = url.searchParams.get('leagueCountry') || '';
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
      const homeLambda = Number(url.searchParams.get('homeLambda') || 1.35);
      const awayLambda = Number(url.searchParams.get('awayLambda') || 1.15);
      if (![homeTeamId, awayTeamId, leagueId].every(Number.isFinite)) return json(res, 400, { error: 'Partida sem IDs suficientes da API-Football.' });
      const fixtureMeta = { leagueId, leagueCountry };
      const [homeSample, awaySample] = await Promise.all([
        stableTeamPlayerStats(homeTeamId, fixtureMeta, date),
        stableTeamPlayerStats(awayTeamId, fixtureMeta, date)
      ]);
      const usedPrevious = homeSample.usedPrevious || awaySample.usedPrevious;
      const markets = estimatePlayerMarkets([...homeSample.players, ...awaySample.players], { homeTeamId, awayTeamId, homeLambda, awayLambda }).map(pm => usedPrevious ? {
        ...pm, source:'API-Football + temporada atual/anterior + modelo próprio',
        reliability:pm.confidence === 'alta' ? .86 : pm.confidence === 'média' ? .80 : .72
      } : pm);
      return json(res, 200, { season:homeSample.season || awaySample.season, playersLoaded: homeSample.players.length + awaySample.players.length, markets, usedPreviousSeason:usedPrevious, note: usedPrevious ? 'O modelo combinou a amostra atual com a temporada anterior para evitar ficar sem mercados de jogadores no começo da temporada. Escalação deve ser confirmada.' : 'Estimativas baseadas em estatísticas por 90 minutos da API-Football. Escalação deve ser confirmada antes de usar mercados de jogador.' });
    }
    if (url.pathname === '/api/standings') {
      const season = Number(url.searchParams.get('season') || new Date().getFullYear());
      if (!process.env.FOOTBALL_DATA_TOKEN) return json(res, 400, { error: 'Tabela do Brasileirão exige FOOTBALL_DATA_TOKEN neste MVP.' });
      return json(res, 200, await getStandings(season));
    }
    if (url.pathname === '/api/live/fixtures') {
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'Data inválida. Use YYYY-MM-DD.' });
      const warnings=[];
      if (process.env.API_FOOTBALL_KEY) {
        try {
          const fixtures = await getFixturesForDate(date);
          if (fixtures.length) return json(res, 200, { date, count: fixtures.length, fixtures, source: 'api-football', detailedStats: true });
          warnings.push('API-Football retornou 0 partidas.');
        } catch (error) { warnings.push(error.message); }
      } else warnings.push('API-Football não configurada.');

      // Fallback SEM chave/cota: usa placares públicos. A lista pode vir do cache,
      // mas cada partida acompanhada é atualizada depois por seu evento público.
      try {
        const pub=await getPublicFavoriteFixtures(date);
        if ((pub.fixtures || []).length) return json(res, 200, {
          date,count:pub.fixtures.length,fixtures:pub.fixtures,source:'public-fallback',
          detailedStats:pub.fixtures.some(f=>f.hasDetailedStats),
          warning:[...warnings, ...(pub.errors || []).slice(0,2), 'Modo público ativo: placar e mercados baseados em gols continuam sem consumir cota de API. Estatísticas detalhadas aparecem quando a fonte pública disponibiliza.'].filter(Boolean).join(' | ')
        });
        warnings.push('Fontes públicas retornaram 0 partidas.');
      } catch(error) { warnings.push(error.message); }

      // Último recurso: The Odds API, quando houver chave/crédito.
      if (process.env.ODDS_API_KEY) {
        try {
          const fallback = await oddsFallbackFixtures(date);
          return json(res, 200, {
            date, count: fallback.fixtures.length, fixtures: fallback.fixtures, source: 'odds-fallback', detailedStats: false,
            warning: [...warnings, ...(fallback.errors || []), 'Último fallback: placar pela The Odds API.'].filter(Boolean).join(' | ')
          });
        } catch(error) { warnings.push(error.message); }
      }
      return json(res, 200, { date,count:0,fixtures:[],source:'none',detailedStats:false,warning:warnings.join(' | ') || 'Nenhuma fonte de placar respondeu.' });
    }
    if (url.pathname === '/api/live/snapshot') {
      const ids = (url.searchParams.get('ids') || '').split(',').map(x => decodeURIComponent(x)).filter(Boolean);
      const playerIds = (url.searchParams.get('players') || '').split(',').map(Number).filter(Number.isFinite);
      let descriptors=[];
      try { descriptors=JSON.parse(url.searchParams.get('fallbacks') || '[]'); } catch { descriptors=[]; }
      if (!ids.length) return json(res, 400, { error: 'Informe ao menos um fixture id.' });
      const apiIds = [...new Set(ids.filter(x => /^\d+$/.test(x)).map(Number))];
      const oddsIds = [...new Set(ids.filter(x => x.startsWith('odds~')))];
      const publicIds = [...new Set(ids.filter(x => x.startsWith('public~')))];
      const snapshots = [];
      const warnings = [];

      if (apiIds.length) {
        try { snapshots.push(...await getLiveSnapshots(apiIds, [...new Set(playerIds)])); }
        catch (error) { warnings.push(error.message); }
      }
      if (publicIds.length) {
        const pub=await getPublicSnapshots(publicIds);
        snapshots.push(...pub.snapshots); warnings.push(...pub.errors);
      }
      if (oddsIds.length) {
        try {
          const fallback = await oddsFallbackSnapshots(oddsIds);
          snapshots.push(...fallback.snapshots); warnings.push(...fallback.errors);
        } catch(error) { warnings.push(error.message); }
      }

      // Se o bilhete foi criado com um id da API-Football/The Odds API e essa fonte caiu
      // depois, localiza a MESMA partida por nome/data em fonte pública e devolve o
      // snapshot usando o id original. Assim o acompanhamento não some no meio do jogo.
      const present=new Set(snapshots.map(x=>String(x.fixtureId)));
      const missingDescriptors=(Array.isArray(descriptors)?descriptors:[])
        .filter(d=>d && ids.includes(String(d.id)) && !present.has(String(d.id)) && d.home && d.away && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')))
        .slice(0,20);
      for (const d of missingDescriptors) {
        try {
          const found=await findPublicFixtureByTeams(String(d.date),String(d.home),String(d.away));
          if (!found.fixture) continue;
          const pub=await getPublicSnapshots([String(found.fixture.fixtureId)]);
          warnings.push(...pub.errors);
          if (pub.snapshots[0]) snapshots.push({...pub.snapshots[0],fixtureId:String(d.id),fallbackFixtureId:pub.snapshots[0].fixtureId,provider:'public-fallback'});
        } catch(error) { warnings.push(`Fallback público ${d.home} x ${d.away}: ${error.message}`); }
      }

      const usedPublic=snapshots.some(s=>String(s.provider || '').includes('public') || String(s.fixtureId || '').startsWith('public~') || s.fallbackFixtureId);
      const usedOdds=snapshots.some(s=>String(s.fixtureId || '').startsWith('odds~'));
      return json(res, 200, {
        updatedAt:new Date().toISOString(),snapshots,
        source:usedPublic ? (usedOdds ? 'mixed-public-odds' : 'public-fallback') : usedOdds ? 'odds-fallback' : 'api-football',
        warnings
      });
    }

    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    let full = path.join(publicDir, file);

    // Rotas de navegação do PWA (ex.: /jogos, /bilhetes) devem abrir o app,
    // não uma tela "Not Found". Arquivos reais continuam sendo servidos normalmente.
    if (!full.startsWith(publicDir)) { res.writeHead(404); return res.end('Not found'); }
    const exists = fs.existsSync(full) && !fs.statSync(full).isDirectory();
    if (!exists) {
      const isNavigation = req.method === 'GET' && !path.extname(url.pathname);
      if (!isNavigation) { res.writeHead(404); return res.end('Not found'); }
      full = path.join(publicDir, 'index.html');
    }
    res.writeHead(200, {
      'content-type': mime(full),
      'cache-control': full.endsWith('index.html') ? 'no-cache' : 'public, max-age=300'
    });
    fs.createReadStream(full).pipe(res);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log(`Bilhete Plus: http://localhost:${port}`));
