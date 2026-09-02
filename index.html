import { summarizeOdds, LEAGUES } from '../src/providers/oddsApi.js';
import { analyzeMarketGame } from '../src/services/marketModel.js';

const fixtures = [
 ['premier-league','Liverpool','Nottingham Forest',1.50,4.70,6.00],
 ['premier-league','Bournemouth','Everton',2.09,3.50,3.50],
 ['premier-league','Coventry','Hull City',1.90,3.55,4.10],
 ['premier-league','Tottenham','Newcastle',2.31,3.65,2.90],
 ['ligue-1','Strasbourg','Lens',3.30,3.60,2.14],
 ['ligue-1','Lorient','Troyes',1.87,3.55,4.20],
 ['ligue-1','Lyon','Le Havre',1.47,4.60,6.60],
 ['ligue-1','Brest','Toulouse',2.65,3.40,2.65],
 ['ligue-1','Auxerre','Angers',1.96,3.45,4.00],
 ['serie-a','Sassuolo','Torino',2.29,3.30,3.25],
 ['serie-a','Monza','Udinese',3.15,3.15,2.40],
 ['serie-a','Fiorentina','Frosinone',1.64,4.10,5.20],
 ['serie-a','Juventus','Parma',1.22,6.60,13.00],
 ['bundesliga','Koln','Hoffenheim',2.90,3.65,2.32],
 ['bundesliga','Union Berlin','Eintracht Frankfurt',2.60,3.60,2.60],
 ['bundesliga','Elversberg','Bayer Leverkusen',5.00,4.50,1.59],
 ['bundesliga','RB Leipzig','Borussia Monchengladbach',1.58,4.50,5.20],
 ['bundesliga','Mainz','Paderborn',1.70,4.00,4.80],
 ['bundesliga','Borussia Dortmund','Hamburger SV',1.33,5.80,8.20],
 ['la-liga','Levante','Real Betis',3.30,3.35,2.22],
 ['la-liga','Real Sociedad','Espanyol',1.91,3.60,4.00],
 ['la-liga','Sevilla','Atletico Madrid',3.50,3.35,2.14]
];

const out = fixtures.map(([league,home,away,oh,od,oa]) => {
  const game={home_team:home,away_team:away,commence_time:'2026-08-29T18:00:00Z',bookmakers:[{title:'Snapshot público',markets:[{key:'h2h',outcomes:[{name:home,price:oh},{name:'Draw',price:od},{name:away,price:oa}]}]}]};
  const summary=summarizeOdds(game);
  const a=analyzeMarketGame(game,summary,league,LEAGUES[league].label);
  const probs=[a.probabilities.home,a.probabilities.draw,a.probabilities.away];
  const i=probs.indexOf(Math.max(...probs));
  return {liga:LEAGUES[league].label,jogo:`${home} x ${away}`,favorito:[home,'Empate',away][i],prob:+(probs[i]*100).toFixed(1),odd:[oh,od,oa][i]};
}).sort((a,b)=>b.prob-a.prob);
console.table(out);
