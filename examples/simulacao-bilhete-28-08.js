import { summarizeOdds, LEAGUES } from '../src/providers/oddsApi.js';
import { analyzeMarketGame } from '../src/services/marketModel.js';

// Snapshot manual de odds públicas consultadas em 28/08/2026.
// Serve somente para reproduzir o teste; não substitui as odds ao vivo da API.
const data = [
  {
    league:'saudi-pro-league', home:'Al Nassr', away:'Al Taawoun', selected:'home', ticketOdd:1.24,
    books:[
      ['A',1.30,4.75,6.50],['B',1.29,5.86,8.20],['C',1.32,5.40,7.40],['D',1.36,5.10,7.00],['E',1.34,5.20,7.20],['F',1.31,5.15,7.20],['G',1.30,5.75,7.00]
    ]
  },
  {
    league:'saudi-pro-league', home:'Al Khaleej', away:'Al Hilal', selected:'away', ticketOdd:1.27,
    books:[
      ['A',8.00,6.00,1.27],['B',8.75,6.36,1.25],['C',8.50,6.00,1.25],['D',7.80,5.60,1.26],['E',9.55,6.20,1.24],['F',8.00,5.70,1.26]
    ]
  },
  {
    league:'ligue-1', home:'Lille', away:'PSG', selected:'away', ticketOdd:1.76,
    books:[
      ['A',4.60,3.95,1.72],['B',4.75,3.80,1.73],['C',4.40,3.90,1.76],['D',4.33,3.90,1.75],['E',4.50,3.85,1.72]
    ]
  },
  {
    league:'premier-league', home:'Crystal Palace', away:'Manchester City', selected:'away', ticketOdd:1.67,
    books:[
      ['A',5.20,4.30,1.63],['B',5.33,4.32,1.68],['C',5.10,4.16,1.62],['D',5.40,4.30,1.57],['E',5.64,4.48,1.63],['F',4.85,4.05,1.67],['G',5.00,3.90,1.67]
    ]
  },
  {
    league:'serie-a', home:'AC Milan', away:'Venezia', selected:'home', ticketOdd:1.40,
    books:[
      ['A',1.37,5.00,8.60],['B',1.40,5.06,9.50],['C',1.34,4.92,9.40],['D',1.35,4.88,9.10],['E',1.36,5.00,7.50],['F',1.38,4.30,9.70]
    ]
  }
];

function gameFrom(row) {
  return {
    home_team: row.home, away_team: row.away, commence_time:'2026-08-28T18:00:00Z',
    bookmakers: row.books.map(([title,h,d,a]) => ({title,markets:[{key:'h2h',outcomes:[
      {name:row.home,price:h},{name:'Draw',price:d},{name:row.away,price:a}
    ]}]}))
  };
}

let combinedP = 1, combinedOdd = 1;
const out = [];
for (const row of data) {
  const game = gameFrom(row);
  const summary = summarizeOdds(game);
  const analysis = analyzeMarketGame(game, summary, row.league, LEAGUES[row.league].label);
  const p = analysis.probabilities[row.selected];
  combinedP *= p;
  combinedOdd *= row.ticketOdd;
  out.push({
    jogo:`${row.home} x ${row.away}`,
    selecao: row.selected === 'home' ? row.home : row.away,
    probabilidade:+(p*100).toFixed(1),
    oddReferencia:+(1/p).toFixed(2),
    oddTeste:row.ticketOdd,
    diferenca:+((p*row.ticketOdd-1)*100).toFixed(1)
  });
}
console.table(out);
console.log('Odd combinada do teste:', combinedOdd.toFixed(2));
console.log('Probabilidade conjunta de referência:', (combinedP*100).toFixed(1)+'%');
console.log('Odd justa combinada:', (1/combinedP).toFixed(2));
console.log('Diferença conjunta:', ((combinedP*combinedOdd-1)*100).toFixed(1)+'%');
