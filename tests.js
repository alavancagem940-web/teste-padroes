import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeMatch } from './src/services/model.js';
import { analyzeMarketGame } from './src/services/marketModel.js';
import { summarizeOdds, LEAGUES, MAJOR_FIVE, MAJOR_SECOND } from './src/providers/oddsApi.js';
import { buildOpportunities, buildTickets, buildTicketGroups } from './src/services/tickets.js';
import { evaluateLeg, summarizeTicket } from './src/services/liveTracker.js';
import { estimateAdvancedMarkets, estimatePlayerMarkets } from './src/services/advancedMarkets.js';
import { normalizeOddsEvent, normalizeOddsScore } from './src/providers/oddsApi.js';
import { isPrematchEligible, onlyPrematch } from './src/services/prematch.js';
import { normalizeEspnEvent, normalizeSportsDbEvent, getPublicFavoriteFixtures, getPublicSnapshots, findPublicFixtureByTeams } from './src/providers/publicFixtures.js';

const mk = (h,a,hg,ag,i) => ({
  status:'FINISHED', utcDate:`2026-05-${String(i).padStart(2,'0')}T20:00:00Z`,
  homeTeam:{name:h}, awayTeam:{name:a}, score:{fullTime:{home:hg,away:ag}}
});
const hist = [
  mk('Time A','Time C',2,0,1), mk('Time B','Time A',1,1,2),
  mk('Time A','Time D',1,0,3), mk('Time C','Time B',0,2,4),
  mk('Time B','Time D',2,1,5), mk('Time D','Time A',1,2,6)
];
const upcoming = {utcDate:'2026-06-01T20:00:00Z',homeTeam:{name:'Time A'},awayTeam:{name:'Time B'}};
const poisson = analyzeMatch(upcoming,hist);
assert(poisson.probabilities.home > 0 && poisson.probabilities.home < 1);
assert(Math.abs(poisson.probabilities.home + poisson.probabilities.draw + poisson.probabilities.away - 1) < 1e-6);

const game = {
  home_team:'Home FC', away_team:'Away FC', commence_time:'2026-08-29T18:00:00Z',
  bookmakers:[
    {title:'Book A',markets:[{key:'h2h',outcomes:[{name:'Home FC',price:1.60},{name:'Draw',price:4.1},{name:'Away FC',price:5.4}]},{key:'totals',outcomes:[{name:'Over',price:1.80,point:2.5},{name:'Under',price:2.00,point:2.5}]}]},
    {title:'Book B',markets:[{key:'h2h',outcomes:[{name:'Home FC',price:1.66},{name:'Draw',price:4.0},{name:'Away FC',price:5.0}]},{key:'totals',outcomes:[{name:'Over',price:1.85,point:2.5},{name:'Under',price:1.95,point:2.5}]}]}
  ]
};
const summary = summarizeOdds(game);
const market = analyzeMarketGame(game, summary, 'premier-league', LEAGUES['premier-league'].label);
assert(Math.abs(market.probabilities.home + market.probabilities.draw + market.probabilities.away - 1) < 1e-9);
assert(buildOpportunities(market, summary).length >= 3);
assert.equal(MAJOR_FIVE.length, 5); // legado mantido para filtros antigos/compatibilidade
assert.equal(MAJOR_SECOND.length, 6);
assert.equal(LEAGUES['brasileirao-b'].sport, 'soccer_brazil_serie_b');
assert.equal(LEAGUES['championship'].sport, 'soccer_efl_champ');
console.log('OK: modelo-base e fontes de odds continuam íntegros.');

// Dupla chance: 1X, 12 e X2 são calculados pelo próprio modelo mesmo sem odd real.
const adv = estimateAdvancedMarkets(market);
for (const key of ['double_chance_1x','double_chance_12','double_chance_x2']) {
  assert(adv.some(x => x.key === key), `Mercado ${key} ausente.`);
}
const dc1x = adv.find(x => x.key === 'double_chance_1x');
const dc12 = adv.find(x => x.key === 'double_chance_12');
const dcx2 = adv.find(x => x.key === 'double_chance_x2');
assert(Math.abs(dc1x.probability - (market.probabilities.home + market.probabilities.draw)) < 1e-9);
assert(Math.abs(dc12.probability - (market.probabilities.home + market.probabilities.away)) < 1e-9);
assert(Math.abs(dcx2.probability - (market.probabilities.draw + market.probabilities.away)) < 1e-9);
assert(adv.some(x => x.market === 'Chutes'));
assert(adv.some(x => x.market === 'Defesas'));
assert(adv.some(x => x.market === 'Cartões'));
console.log('OK: Dupla Chance e mercados avançados estimados passaram nos testes.');

// Mercados de jogador do modelo próprio.
const playerProps = estimatePlayerMarkets([{
  id:1,name:'Atacante Teste',teamId:10,teamName:'Home FC',position:'F',appearances:20,starts:18,minutes:1500,
  shotsPer90:3.2,sotPer90:1.4,goalsPer90:.55,savesPer90:0,foulsCommittedPer90:1.1,foulsDrawnPer90:1.5,cardsPer90:.18
},{
  id:2,name:'Goleiro Teste',teamId:20,teamName:'Away FC',position:'G',appearances:20,starts:20,minutes:1800,
  shotsPer90:0,sotPer90:0,goalsPer90:0,savesPer90:3.3,foulsCommittedPer90:.1,foulsDrawnPer90:.1,cardsPer90:.05
}], {homeTeamId:10,awayTeamId:20,homeLambda:1.8,awayLambda:1.0});
for (const marketName of ['Chutes do jogador','Chutes no gol do jogador','Faltas do jogador','Faltas sofridas','Cartão do jogador','Gol do jogador','Defesas do goleiro']) {
  assert(playerProps.some(x => x.market === marketName), `${marketName} deveria existir.`);
}
console.log('OK: mercados de jogadores do modelo próprio passaram nos testes.');

// Perfis atuais: Moderado não existe separado de Valor.
const families = ['Chutes','Chutes no gol','Cartões','Defesas','Faltas','Escanteios'];
const profileMatches = Array.from({length:12}, (_,i) => ({
  homeTeam:`Casa ${i}`, awayTeam:`Fora ${i}`, leagueKey:'teste', leagueLabel:'Teste', kickoff:`2099-08-29T${String(10+i).padStart(2,'0')}:00:00Z`,
  probabilities:{home:.66,draw:.20,away:.14,over25:.58,under25:.42}, opportunities:[],
  estimatedMarkets:[
    {market:'Gols do time',key:`home_team_goals_1_${i}`,selection:`Casa ${i}: 1+ gol`,probability:.85,fairOdd:1.18,reliability:.94,confidence:'alta',target:1,side:'home'},
    {market:families[i%families.length],key:`mid_${i}`,selection:`Mercado forte ${i}`,probability:.62,fairOdd:1.61,reliability:.91,confidence:'alta',target:2+i},
    {market:'Chutes do jogador',key:`player_${i}_shots_2`,selection:`Atacante ${i}: 2+ chutes`,player:`Atacante ${i}`,team:`Casa ${i}`,probability:.60,fairOdd:1.67,reliability:.92,confidence:'alta',target:2+(i%2)},
    {market:'Faltas sofridas',key:`player_${i}_drawn_1`,selection:`Atacante ${i}: 1+ falta sofrida`,player:`Atacante ${i}`,team:`Casa ${i}`,probability:.58,fairOdd:1.72,reliability:.91,confidence:'alta',target:1+(i%3)}
  ]
}));
const profiles = buildTickets(profileMatches);
const byName = name => profiles.find(x => x.name === name);
for (const name of ['Conservador','Valor','Arriscado','Muito Arriscado','Jackpot']) assert(byName(name), `${name} deveria ser gerado no cenário de teste.`);
assert(!byName('Moderado'), 'Moderado não pode existir como perfil separado de Valor.');
assert(byName('Conservador').combinedOdd <= 1.99, `Conservador acima de 1.99: ${byName('Conservador').combinedOdd}`);
assert(byName('Valor').combinedOdd >= 2 && byName('Valor').combinedOdd <= 4, `Valor fora de 2–4: ${byName('Valor').combinedOdd}`);
assert(byName('Arriscado').combinedOdd >= 4 && byName('Arriscado').combinedOdd <= 6, `Arriscado fora de 4–6: ${byName('Arriscado').combinedOdd}`);
assert(byName('Muito Arriscado').combinedOdd >= 6 && byName('Muito Arriscado').combinedOdd <= 8, `Muito Arriscado fora de 6–8: ${byName('Muito Arriscado').combinedOdd}`);
assert(byName('Jackpot').combinedOdd >= 8, `Jackpot abaixo de 8: ${byName('Jackpot').combinedOdd}`);
for (const ticket of profiles) {
  assert(ticket.jointProbability > 0 && ticket.jointProbability <= 1, `${ticket.name}: chance conjunta inválida.`);
  assert(ticket.jointProbability <= ticket.modelJointProbability + 1e-9, `${ticket.name}: chance de segurança não pode superar o modelo bruto.`);
  assert(ticket.fairCombinedOdd >= 1, `${ticket.name}: odd justa inválida.`);
}
assert(byName('Valor').legs.some(l => l.isPlayerMarket), 'Valor deve aceitar mercado de jogador quando há opção forte e compatível.');
console.log('OK: faixas Conservador/Valor/Arriscado/Muito Arriscado/Jackpot passaram nos testes.');

// Uma única partida pode formar múltipla quando os mercados reforçam o mesmo cenário.
const singleMatch = [{
  homeTeam:'Casa Única', awayTeam:'Fora Única', leagueKey:'single', leagueLabel:'Copa Nacional', kickoff:'2099-09-02T20:00:00Z',
  probabilities:{home:.58,draw:.20,away:.22,over25:.60,under25:.40}, opportunities:[],
  estimatedMarkets:[
    {market:'Dupla chance',key:'double_chance_1x',selection:'Casa Única ou empate (1X)',probability:.78,fairOdd:1.28,reliability:.94,confidence:'alta'},
    {market:'Gols do time',key:'home_team_goals_1',selection:'Casa Única: 1+ gol',probability:.72,fairOdd:1.39,reliability:.93,confidence:'alta',target:1,side:'home'},
    {market:'Chutes',key:'home_shots_10',selection:'Casa Única: 10+ chutes',probability:.60,fairOdd:1.67,reliability:.92,confidence:'alta',target:10,side:'home'},
    {market:'Chutes no gol',key:'home_sot_4',selection:'Casa Única: 4+ chutes no gol',probability:.59,fairOdd:1.69,reliability:.92,confidence:'alta',target:4,side:'home'},
    {market:'Chutes do jogador',key:'player_9_shots_2',selection:'Atacante Único: 2+ chutes',player:'Atacante Único',team:'Casa Única',probability:.61,fairOdd:1.64,reliability:.93,confidence:'alta',target:2}
  ]
}];
const singleTickets = buildTickets(singleMatch);
const singleValue = singleTickets.find(x => x.name === 'Valor');
const singleRisk = singleTickets.find(x => x.name === 'Arriscado');
assert(singleValue && singleValue.legs.length >= 2, 'Valor deve poder usar várias seleções compatíveis da mesma partida.');
assert(['média','alta'].includes(singleValue.correlation), 'Correlação deve ser sinalizada quando há mais de uma seleção da mesma partida.');
assert(singleRisk && singleRisk.combinedOdd >= 4 && singleRisk.combinedOdd <= 6, 'Arriscado deve conseguir aproveitar um único jogo quando houver mercados fortes e coerentes suficientes.');
assert.equal(singleRisk.correlation, 'alta');
console.log('OK: combinação coerente de vários mercados da mesma partida passou nos testes.');

// Acompanhamento ao vivo, incluindo dupla chance.
const liveSnap = {
  fixtureId:999,status:'FT',elapsed:90,goals:{home:2,away:1},
  stats:{home:{corners:5,yellow:1,red:0,shots:11,shotsOnTarget:4,fouls:9,saves:2},away:{corners:2,yellow:2,red:0,shots:7,shotsOnTarget:3,fouls:12,saves:2}},
  players:[{name:'Atacante Teste',shots:3,shotsOnTarget:2,foulsCommitted:1,foulsDrawn:2,saves:0,goals:1,yellow:0,red:0}]
};
assert.equal(evaluateLeg({market:'double_chance_1x'},liveSnap).state,'green');
assert.equal(evaluateLeg({market:'double_chance_12'},liveSnap).state,'green');
assert.equal(evaluateLeg({market:'double_chance_x2'},liveSnap).state,'red');
assert.equal(evaluateLeg({market:'goals_over',target:2.5},liveSnap).state,'green');
assert.equal(summarizeTicket([{fixtureId:999,market:'double_chance_1x'}],[liveSnap]).counts.green,1);
console.log('OK: acompanhamento ao vivo reconhece Dupla Chance.');

// Progresso ao vivo deve dizer exatamente quanto falta e diferenciar mercados reversíveis.
const liveProgress = {
  fixtureId:1001,status:'2H',elapsed:63,goals:{home:1,away:1},
  stats:{home:{corners:4,yellow:1,red:0,shots:8,shotsOnTarget:3,fouls:7,saves:2},away:{corners:3,yellow:2,red:0,shots:6,shotsOnTarget:2,fouls:9,saves:3}},
  players:[{name:'Jogador Live',shots:2,shotsOnTarget:1,foulsCommitted:1,foulsDrawn:2,saves:0,goals:0,yellow:0,red:0}]
};
const overProgress=evaluateLeg({market:'goals_over',target:2.5},liveProgress);
assert.equal(overProgress.state,'pending');
assert.equal(overProgress.remaining,1);
assert.match(overProgress.text,/Falta 1 gol/);
assert.equal(evaluateLeg({market:'draw'},liveProgress).state,'hitting');
assert.equal(evaluateLeg({market:'double_chance_1x'},liveProgress).state,'hitting');
assert.equal(evaluateLeg({market:'goals_under',target:3.5},liveProgress).state,'hitting');
const shotProgress=evaluateLeg({market:'player_sot',player:'Jogador Live',target:2},liveProgress);
assert.equal(shotProgress.remaining,1);
assert.match(shotProgress.text,/Falta 1 chute no gol/);
const teamGoalProgress=evaluateLeg({market:'team_goals',side:'home',target:2},liveProgress);
assert.equal(teamGoalProgress.remaining,1);
assert.match(teamGoalProgress.text,/Falta 1 gol/);
const liveSummary=summarizeTicket([{fixtureId:1001,market:'goals_over',target:2.5},{fixtureId:1001,market:'draw'}],[liveProgress]);
assert.equal(liveSummary.remainingSelections,1);
assert.equal(liveSummary.counts.hitting,1);
console.log('OK: acompanhamento ao vivo calcula faltas e estado BATENDO AGORA.');


// Nunca sugerir partida iniciada/finalizada.
const fixedNow = Date.parse('2026-08-29T15:00:00Z');
assert.equal(isPrematchEligible({kickoff:'2026-08-29T15:20:00Z'},{nowMs:fixedNow,cutoffMinutes:5}),true);
assert.equal(isPrematchEligible({kickoff:'2026-08-29T15:03:00Z'},{nowMs:fixedNow,cutoffMinutes:5}),false);
assert.equal(isPrematchEligible({kickoff:'2026-08-29T16:00:00Z',status:'FT'},{nowMs:fixedNow,cutoffMinutes:0}),false);
assert.equal(onlyPrematch([{kickoff:'2026-08-29T14:00:00Z'},{kickoff:'2026-08-29T16:00:00Z'}],{nowMs:fixedNow,cutoffMinutes:5}).length,1);
console.log('OK: proteção pré-jogo continua ativa.');

// Fallback de calendário/placar público continua funcional.
const oddsEvent = {id:'abc123',sport_title:'Premier League',commence_time:'2026-08-29T14:00:00Z',home_team:'Home Test',away_team:'Away Test'};
const fallbackFixture = normalizeOddsEvent(oddsEvent,'premier-league');
assert.equal(fallbackFixture.fixtureId,'odds~premier-league~abc123');
const fallbackFinal = normalizeOddsScore({...oddsEvent,completed:true,scores:[{name:'Home Test',score:'2'},{name:'Away Test',score:'1'}]},'premier-league');
assert.equal(evaluateLeg({market:'home_win'},fallbackFinal).state,'green');
const espnFixture = normalizeEspnEvent({id:'evt1',date:'2099-08-29T18:00:00Z',status:{type:{state:'pre',completed:false}},competitions:[{competitors:[{homeAway:'home',score:'0',team:{id:'10',displayName:'Casa Pública'},records:[{type:'total',summary:'4-2-1'}]},{homeAway:'away',score:'0',team:{id:'20',displayName:'Fora Pública'},records:[{type:'total',summary:'2-2-3'}]}]}]},'premier-league');
assert.equal(espnFixture.status,'NS');
const sdbFixture = normalizeSportsDbEvent({idEvent:'2',strLeague:'English Premier League',strHomeTeam:'Casa DB',strAwayTeam:'Fora DB',strTimestamp:'2099-08-29T19:00:00Z',strStatus:'Not Started'},'premier-league');
assert.equal(sdbFixture.away.name,'Fora DB');
assert.equal(typeof getPublicFavoriteFixtures, 'function');
console.log('OK: fallbacks de partidas e placar continuam íntegros.');


// Mercado dos Favoritos deve descobrir partidas fora das ligas tradicionais,
// incluindo copas domésticas e Escócia, sem depender da API-Football.
const originalFetch = globalThis.fetch;
const espnPublicEvent = (id, home, away, date='2099-09-02T18:00:00Z') => ({
  id, date, status:{type:{state:'pre',completed:false}},
  competitions:[{competitors:[
    {homeAway:'home',score:'0',team:{id:`h-${id}`,displayName:home},records:[{type:'total',summary:'5-1-1'}]},
    {homeAway:'away',score:'0',team:{id:`a-${id}`,displayName:away},records:[{type:'total',summary:'1-2-4'}]}
  ]}]
});
globalThis.fetch = async (url) => {
  const u=String(url);
  let events=[];
  if (u.includes('ger.dfb_pokal')) events=[espnPublicEvent('dfb1','VfL Osnabrück','FC Bayern München')];
  else if (u.includes('bra.1')) events=[espnPublicEvent('bra1','CR Flamengo','Mirassol FC','2099-09-02T22:30:00Z')];
  else if (u.includes('sco.1')) events=[espnPublicEvent('sco1','Falkirk','Rangers FC','2099-09-02T19:45:00Z')];
  if (u.includes('thesportsdb.com')) return new Response(JSON.stringify({events:[]}),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({events}),{status:200,headers:{'content-type':'application/json'}});
};
const favoritePublic = await getPublicFavoriteFixtures('2099-09-02');
globalThis.fetch = originalFetch;
assert(favoritePublic.fixtures.some(f => /Bayern/i.test(f.away.name)), 'Favoritos deve descobrir DFB-Pokal/Bayern.');
assert(favoritePublic.fixtures.some(f => /Flamengo/i.test(f.home.name)), 'Favoritos deve descobrir Brasileirão/Flamengo.');
assert(favoritePublic.fixtures.some(f => /Rangers/i.test(f.away.name)), 'Favoritos deve descobrir Scottish Premiership/Rangers.');
console.log('OK: Mercado dos Favoritos descobre ligas e copas domésticas fora do filtro tradicional.');

// Regressão: quando o Mercado dos Favoritos está em fallback público, baixa confiabilidade
// não pode zerar TODOS os bilhetes. A safeProbability já aplica a penalização e a tela
// sinaliza "Odd aproximada"/"Dados baixa".
const fallbackFavoriteMatches = Array.from({length:4}, (_,i) => ({
  mode:'favorite-market-public-fallback',
  homeTeam:`Favorito ${i}`, awayTeam:`Adversário ${i}`, leagueKey:'market-favorites', leagueLabel:'Copa doméstica',
  kickoff:`2099-09-02T${String(15+i).padStart(2,'0')}:30:00Z`, opportunities:[],
  probabilities:{home:.62,draw:.23,away:.15,over25:.55,under25:.45,btts:.48,noBtts:.52},
  publicFixture:{fixtureId:`public~espn~test.cup~fav${i}`,provider:'espn-public'},
  estimatedMarkets:[
    {market:'Dupla chance',key:'double_chance_1x',selection:`Favorito ${i} ou empate (1X)`,probability:.85,fairOdd:1.18,reliability:.58,source:'Modelo próprio • odd aproximada • sem consulta da API-Football'},
    {market:'Gols do time',key:'home_team_goals_1',selection:`Favorito ${i}: 1+ gol`,probability:.76,fairOdd:1.32,reliability:.58,target:1,side:'home',source:'Modelo próprio • odd aproximada • sem consulta da API-Football'},
    {market:i%2?'Chutes no gol':'Chutes',key:`fallback_mid_${i}`,selection:`Favorito ${i}: pressão ofensiva`,probability:.66,fairOdd:1.52,reliability:.58,target:2,side:'home',source:'Modelo próprio • odd aproximada • sem consulta da API-Football'}
  ]
}));
const fallbackFavoriteTickets=buildTickets(fallbackFavoriteMatches);
assert(fallbackFavoriteTickets.length >= 1, 'Fallback público dos Favoritos não pode esconder todos os bilhetes.');
assert(fallbackFavoriteTickets.every(t => t.combinedOddType === 'estimada'));
assert(fallbackFavoriteTickets.some(t => t.legs.every(l => String(l.fixtureId || '').startsWith('public~'))), 'Bilhete público deve guardar id público para acompanhamento ao vivo.');
console.log('OK: Favoritos em fallback público continuam montando e exibindo bilhetes.');

// Acompanhamento público sem chave: ESPN fornece placar/minuto e, quando existir,
// estatísticas de time. Isso mantém gols/resultado/dupla chance vivos sem API-Football.
globalThis.fetch = async (url) => {
  const u=String(url);
  if (u.includes('/summary?event=live1')) return new Response(JSON.stringify({
    header:{id:'live1',date:'2099-09-02T18:00:00Z',status:{displayClock:"63'",type:{state:'in',completed:false}},competitions:[{competitors:[
      {homeAway:'home',score:'1',team:{id:'11',displayName:'Casa Live'}},
      {homeAway:'away',score:'1',team:{id:'22',displayName:'Fora Live'}}
    ]}]},
    boxscore:{teams:[
      {team:{id:'11',displayName:'Casa Live'},statistics:[{name:'totalShots',displayValue:'9'},{name:'shotsOnTarget',displayValue:'4'},{name:'wonCorners',displayValue:'5'}]},
      {team:{id:'22',displayName:'Fora Live'},statistics:[{name:'totalShots',displayValue:'7'},{name:'shotsOnTarget',displayValue:'3'},{name:'wonCorners',displayValue:'2'}]}
    ]}
  }),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({events:[]}),{status:200,headers:{'content-type':'application/json'}});
};
const publicLive=await getPublicSnapshots(['public~espn~test.cup~live1']);
globalThis.fetch = originalFetch;
assert.equal(publicLive.snapshots.length,1);
assert.equal(publicLive.snapshots[0].goals.home,1);
assert.equal(publicLive.snapshots[0].goals.away,1);
assert.equal(publicLive.snapshots[0].elapsed,63);
assert.equal(publicLive.snapshots[0].stats.home.shots,9);
assert.equal(publicLive.snapshots[0].hasDetailedStats,true);
assert.equal(evaluateLeg({market:'goals_over',target:2.5},publicLive.snapshots[0]).remaining,1);
assert.equal(typeof findPublicFixtureByTeams,'function');
console.log('OK: acompanhamento ao vivo possui fallback público sem chave para placar/minuto.');

// Grupos/carrosséis devem refletir somente os cinco perfis atuais.
const groups = buildTicketGroups(profileMatches);
assert.deepEqual(Object.keys(groups), ['conservador','valor','arriscado','muito-arriscado','jackpot']);
for (const [key,name] of [['conservador','Conservador'],['valor','Valor'],['arriscado','Arriscado'],['muito-arriscado','Muito Arriscado'],['jackpot','Jackpot']]) {
  assert(Array.isArray(groups[key]) && groups[key].length >= 1 && groups[key].length <= 3);
  assert(groups[key].every(t => t.name === name));
}
assert(groups.valor.some(t => (t.legs || []).some(l => l.isPlayerMarket)), 'Carrossel Valor deve exibir ao menos uma opção com jogador quando props confiáveis existirem.');
assert(['arriscado','muito-arriscado','jackpot'].some(key => groups[key].some(t => (t.legs || []).some(l => l.isPlayerMarket))), 'Ao menos um perfil alto deve aproveitar mercado de jogador quando compatível.');
console.log('OK: mercados de jogadores aparecem nos automáticos quando existem props compatíveis.');


// As três opções de cada perfil usam subfaixas INTERNAS de odd. A interface não deve
// expor "nível 1/2/3": o usuário continua vendo somente Bilhete 1/2/3 e a faixa geral.
const internalBandGroups = buildTicketGroups(profileMatches);
const hiddenBandRanges = {
  conservador:[[1.01,1.33],[1.34,1.66],[1.67,1.99]],
  valor:[[2.00,2.66],[2.67,3.33],[3.34,4.00]],
  arriscado:[[4.00,4.66],[4.67,5.33],[5.34,6.00]],
  'muito-arriscado':[[6.00,6.66],[6.67,7.33],[7.34,8.00]],
  jackpot:[[8.00,9.99],[10.00,11.99],[12.00,Infinity]]
};
for (const [key,ranges] of Object.entries(hiddenBandRanges)) {
  assert.equal(internalBandGroups[key].length,3, `${key} deve manter três opções internas.`);
  internalBandGroups[key].forEach((ticket,i) => {
    if (ticket.unavailable) return;
    assert(ticket.combinedOdd >= ranges[i][0] - 1e-9, `${key} bilhete ${i+1} abaixo da subfaixa interna.`);
    assert(ticket.combinedOdd <= ranges[i][1] + 1e-9, `${key} bilhete ${i+1} acima da subfaixa interna.`);
    assert(!/nível/i.test(String(ticket.targetRange || '')), 'A subfaixa interna não pode aparecer na interface.');
  });
}
assert(!/nível 1|nível 2|nível 3/i.test(fs.readFileSync(new URL('./public/app.js', import.meta.url),'utf8')), 'A interface não pode exibir rótulos de nível.');
console.log('OK: três subfaixas internas por perfil sem expor níveis na interface.');

// Garantias de integração da interface/servidor sem alterar layout.
const appSource = fs.readFileSync(new URL('./public/app.js', import.meta.url),'utf8');
const indexSource = fs.readFileSync(new URL('./public/index.html', import.meta.url),'utf8');
const serverSource = fs.readFileSync(new URL('./server.js', import.meta.url),'utf8');
const publicFixturesSource = fs.readFileSync(new URL('./src/providers/publicFixtures.js', import.meta.url),'utf8');
const oddsApiSource = fs.readFileSync(new URL('./src/providers/oddsApi.js', import.meta.url),'utf8');
assert(appSource.includes("q.set('forcePublic','1')"));
assert(appSource.includes("double_chance_1x"));
assert(appSource.includes("['conservador','valor','arriscado','muito-arriscado','jackpot']"));
assert(!appSource.includes("'moderado'"), 'Front não deve manter perfil Moderado separado.');
assert(indexSource.includes('value="market-favorites"'));
assert(indexSource.includes('Mercado dos Favoritos'));
assert(!indexSource.includes('>5 grandes ligas<'));
assert(serverSource.includes("leagueKey === 'market-favorites'"));
assert(serverSource.includes('favoriteMarketDashboard'));
assert(serverSource.includes('Champions League, Libertadores e Sul-Americana'));
assert(serverSource.includes('stableTeamPlayerStats'));
assert(serverSource.includes('temporada atual/anterior'));
assert(serverSource.includes('getPublicFavoriteFixtures'));
assert(serverSource.includes('fallback público + odds aproximadas'));
assert(serverSource.includes('supportsFavoriteMarket: true'));
assert(serverSource.includes('sem usar a cotação'));
assert(appSource.includes('Odd aproximada'));
assert(appSource.includes('odd aproximada'));
assert(publicFixturesSource.includes('ger.dfb_pokal'));
assert(publicFixturesSource.includes('bra.copa_do_brazil'));
assert(publicFixturesSource.includes("['sco.1','Scottish Premiership'"));
assert(publicFixturesSource.includes('fetchJsonTimed'));
assert(oddsApiSource.includes('fetchTimed'));
assert(serverSource.includes('favorito NO JOGO'));
assert(serverSource.includes('favoriteMatchStrength'));
assert(serverSource.includes("return {matches:fallback.matches || []"));
assert(appSource.includes('Não há partidas disponíveis para esta liga na data selecionada.'));
assert(appSource.includes("fixtureId.startsWith('public~')"));
assert(appSource.includes("q.set('fallbacks',JSON.stringify(descriptors))"));
assert(appSource.includes("$('#tickets').innerHTML = data.count > 0"), 'Gerar sugestões deve manter os cartões por perfil mesmo quando alguns perfis estiverem unavailable.');
assert(serverSource.includes('getPublicSnapshots'));
assert(serverSource.includes('findPublicFixtureByTeams'));
assert(publicFixturesSource.includes('summary?event='));
assert(indexSource.includes('data-ticket-tab="um-jogo"'));
assert(indexSource.includes('Apenas um jogo'));
assert(!indexSource.includes('data-ticket-tab="salvos"'), 'Meus bilhetes não deve mais ficar como subaba de Bilhetes.');
assert(indexSource.includes('MEUS BILHETES') && indexSource.indexOf('MEUS BILHETES') > indexSource.indexOf('data-panel="live"'), 'Meus bilhetes deve ficar dentro da aba Ao vivo.');
assert(appSource.includes('/api/single-match-tickets'));
assert(serverSource.includes("url.pathname === '/api/single-match-tickets'"));
assert(serverSource.includes('singleMatchTicketsDashboard'));
console.log('OK: Mercado dos Favoritos, jogadores, perfis, Apenas um jogo, fallback ao vivo e UI estão conectados.');


// Regressão: com quatro jogos públicos e mercados fortes, os cinco perfis devem
// conseguir fechar suas faixas sem bloquear repetição do mesmo arquétipo em jogos diferentes.
const publicFourForProfiles = Array.from({length:4}, (_,i) => ({
  mode:'favorite-market-public-fallback',
  homeTeam:`Favorito Perfil ${i}`, awayTeam:`Adversário Perfil ${i}`, leagueKey:'market-favorites', leagueLabel:'Copa doméstica',
  kickoff:`2099-09-02T${String(15+i).padStart(2,'0')}:30:00Z`, opportunities:[],
  probabilities:{home:.62,draw:.23,away:.15,over25:.55,under25:.45},
  publicFixture:{fixtureId:`public~espn~test.cup~profile${i}`,provider:'espn-public'},
  estimatedMarkets:[
    {market:'Dupla chance',key:'double_chance_1x',selection:`Favorito Perfil ${i} ou empate (1X)`,probability:.85,fairOdd:1.18,reliability:.58,source:'Modelo próprio • odd aproximada • sem consulta da API-Football'},
    {market:'Gols do time',key:'home_team_goals_1',selection:`Favorito Perfil ${i}: 1+ gol`,probability:.76,fairOdd:1.32,reliability:.58,target:1,side:'home',source:'Modelo próprio • odd aproximada • sem consulta da API-Football'},
    {market:i%2?'Chutes no gol':'Chutes',key:`profile_mid_${i}`,selection:`Favorito Perfil ${i}: pressão ofensiva`,probability:.66,fairOdd:1.52,reliability:.58,target:2,side:'home',source:'Modelo próprio • odd aproximada • sem consulta da API-Football'}
  ]
}));
const publicProfileTickets = buildTickets(publicFourForProfiles);
for (const name of ['Conservador','Valor','Arriscado','Muito Arriscado','Jackpot']) {
  assert(publicProfileTickets.some(t => t.name === name), `Fallback público deve conseguir exibir ${name} quando há base forte suficiente.`);
}
console.log('OK: os cinco perfis aparecem no Mercado dos Favoritos quando a base permite.');

// Regressão real do cenário visto no celular: quatro favoritos com muitas odds
// aproximadas pequenas não podem fazer Valor/Arriscado/Muito Arriscado/Jackpot sumirem.
const thinFavoriteDay = Array.from({length:4}, (_,i) => ({
  mode:'favorite-market-public-fallback',
  homeTeam:`Favorito Curto ${i}`, awayTeam:`Adversário Curto ${i}`, leagueKey:'market-favorites', leagueLabel:'Doméstica',
  kickoff:`2099-09-04T${String(15+i).padStart(2,'0')}:00:00Z`, opportunities:[],
  probabilities:{home:.65,draw:.20,away:.15,over25:.58,under25:.42},
  publicFixture:{fixtureId:`public~espn~thin~${i}`,provider:'espn-public'},
  estimatedMarkets:[
    {market:'Chutes',key:`thin_shots_${i}`,selection:`Favorito Curto ${i}: 8+ chutes`,probability:.94,fairOdd:1.06,reliability:.58,side:'home',target:8,source:'Modelo próprio • odd aproximada • sem consulta da API-Football'},
    {market:'Escanteios',key:`thin_corners_${i}`,selection:`Favorito Curto ${i}: 3+ escanteios`,probability:.90,fairOdd:1.11,reliability:.58,side:'home',target:3,source:'Modelo próprio • odd aproximada • sem consulta da API-Football'},
    {market:'Dupla chance',key:'double_chance_1x',selection:`Favorito Curto ${i} ou empate (1X)`,probability:.84,fairOdd:1.19,reliability:.58,source:'Modelo próprio • odd aproximada • sem consulta da API-Football'},
    {market:'Gols do time',key:`thin_goal_${i}`,selection:`Favorito Curto ${i}: 1+ gol`,probability:.76,fairOdd:1.32,reliability:.58,side:'home',target:1,source:'Modelo próprio • odd aproximada • sem consulta da API-Football'},
    {market:'Chutes no gol',key:`thin_sot_${i}`,selection:`Favorito Curto ${i}: 4+ chutes no gol`,probability:.66,fairOdd:1.52,reliability:.58,side:'home',target:4,source:'Modelo próprio • odd aproximada • sem consulta da API-Football'},
    {market:'Gols',key:`thin_over_${i}`,selection:'Mais de 2.5 gols',probability:.60,fairOdd:1.67,reliability:.58,line:2.5,source:'Modelo próprio • odd aproximada • sem consulta da API-Football'}
  ]
}));
const thinGroups = buildTicketGroups(thinFavoriteDay);
for (const key of ['conservador','valor','arriscado','muito-arriscado','jackpot']) {
  assert(thinGroups[key].some(t => !t.unavailable), `${key} não pode desaparecer só porque as odds individuais são pequenas.`);
}
assert(thinGroups.valor.some(t => !t.unavailable && t.combinedOdd >= 2 && t.combinedOdd <= 4));
assert(thinGroups.arriscado.some(t => !t.unavailable && t.combinedOdd >= 4 && t.combinedOdd <= 6));
assert(thinGroups['muito-arriscado'].some(t => !t.unavailable && t.combinedOdd >= 6 && t.combinedOdd <= 8));
assert(thinGroups.jackpot.some(t => !t.unavailable && t.combinedOdd >= 8));
console.log('OK: perfis altos não somem em dia de favoritos com odds individuais pequenas.');


// Regressão: os automáticos não podem concentrar todas as alternativas de jogador
// apenas em defesas do goleiro quando existem chutes/faltas compatíveis.
const diversePlayerMatches = Array.from({length:8}, (_,i) => ({
  homeTeam:`Jog Casa ${i}`, awayTeam:`Jog Fora ${i}`, leagueKey:'teste-jog', leagueLabel:'Teste Jogadores',
  kickoff:`2099-09-03T${String(10+i).padStart(2,'0')}:00:00Z`, probabilities:{home:.66,draw:.20,away:.14,over25:.58,under25:.42}, opportunities:[],
  estimatedMarkets:[
    {market:'Gols do time',key:`j_home_goal_${i}`,selection:`Jog Casa ${i}: 1+ gol`,probability:.84,fairOdd:1.19,reliability:.94,target:1,side:'home'},
    {market:'Chutes do jogador',key:`j_shots_${i}`,selection:`Atacante ${i}: 2+ chutes`,player:`Atacante ${i}`,team:`Jog Casa ${i}`,probability:.61,fairOdd:1.64,reliability:.92,target:2},
    {market:'Chutes no gol do jogador',key:`j_sot_${i}`,selection:`Atacante ${i}: 1+ chute no gol`,player:`Atacante ${i}`,team:`Jog Casa ${i}`,probability:.60,fairOdd:1.67,reliability:.91,target:1},
    {market:'Faltas sofridas',key:`j_drawn_${i}`,selection:`Atacante ${i}: 1+ falta sofrida`,player:`Atacante ${i}`,team:`Jog Casa ${i}`,probability:.59,fairOdd:1.69,reliability:.91,target:1},
    {market:'Defesas do goleiro',key:`j_save_${i}`,selection:`Goleiro ${i}: 2+ defesas`,player:`Goleiro ${i}`,team:`Jog Fora ${i}`,probability:.64,fairOdd:1.56,reliability:.90,target:2}
  ]
}));
const diverseGroups = buildTicketGroups(diversePlayerMatches);
const visiblePlayerMarkets = Object.values(diverseGroups).flat().flatMap(t => t.legs || []).filter(l => l.isPlayerMarket).map(l => l.market);
assert(visiblePlayerMarkets.some(m => /Chutes do jogador|Chutes no gol do jogador/.test(m)), 'Automáticos devem exibir props ofensivas de jogadores quando existem.');
assert(visiblePlayerMarkets.some(m => /Faltas/.test(m)), 'Automáticos devem exibir props de faltas de jogadores quando existem.');
assert(visiblePlayerMarkets.some(m => /Defesas do goleiro/.test(m)), 'Defesas do goleiro continuam disponíveis.');
console.log('OK: automáticos distribuem mercados de jogadores entre ataque, faltas e goleiro.');

// Mercado dos Favoritos público deve tentar vincular o jogo à API-Football antes
// de desistir dos mercados detalhados de jogadores.
assert(serverSource.includes('const missingLinks = (matches || []).filter'));
assert(serverSource.includes('getFixturesForDate(date, { allCompetitions:true })'));
assert(serverSource.includes('m.apiFixture = compactApiFixture(linked)'));
console.log('OK: jogos públicos dos Favoritos podem recuperar vínculo de jogadores quando a API-Football volta a responder.');

console.log('\nTODOS OS TESTES PASSARAM ✅');
