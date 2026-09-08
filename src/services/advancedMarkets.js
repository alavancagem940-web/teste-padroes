const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round = (n, d = 2) => Number(n.toFixed(d));

function poissonCdf(k, lambda) {
  if (k < 0) return 0;
  if (lambda <= 0) return 1;
  // Recorrência estável: permite também mercados de volume alto (ex.: passes),
  // sem limitar o cálculo a 39 ocorrências.
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= Math.ceil(k); i++) {
    term *= lambda / i;
    sum += term;
    if (term < 1e-14 && i > lambda + 12) break;
  }
  return clamp(sum, 0, 1);
}

export function poissonAtLeast(target, lambda) {
  const t = Math.max(0, Math.ceil(Number(target)));
  if (t <= 0) return 1;
  return clamp(1 - poissonCdf(t - 1, lambda), 0, 1);
}

export function poissonOverLine(line, lambda) {
  // Para linhas x.5: over 2.5 = 3+.
  const target = Math.floor(Number(line)) + 1;
  return poissonAtLeast(target, lambda);
}

function poissonPmf(k, lambda) {
  const n = Math.max(0, Math.floor(Number(k || 0)));
  const l = Math.max(0, Number(lambda || 0));
  let value = Math.exp(-l);
  for (let i = 1; i <= n; i++) value *= l / i;
  return value;
}

function scoreGrid(homeLambda, awayLambda, maxGoals = 9) {
  const rows = [];
  let mass = 0;
  for (let home = 0; home <= maxGoals; home++) {
    const ph = poissonPmf(home, homeLambda);
    for (let away = 0; away <= maxGoals; away++) {
      const probability = ph * poissonPmf(away, awayLambda);
      mass += probability;
      rows.push({ home, away, probability });
    }
  }
  // Normaliza a pequena cauda que ficou acima do limite da grade. Para os lambdas
  // usados no app essa cauda é mínima, mas a normalização evita odds desalinhadas.
  const divisor = Math.max(mass, 1e-9);
  return rows.map(row => ({ ...row, probability: row.probability / divisor }));
}

function resultSide(home, away) {
  return home > away ? 'home' : home < away ? 'away' : 'draw';
}

function addHouseStyleScoreMarkets(out, analysis, xg) {
  const home = analysis.homeTeam;
  const away = analysis.awayTeam;
  const finalGrid = scoreGrid(xg.home, xg.away, 9);
  const firstHalfShare = 0.46;
  const firstHalf = scoreGrid(xg.home * firstHalfShare, xg.away * firstHalfShare, 7);
  const secondHalf = scoreGrid(xg.home * (1 - firstHalfShare), xg.away * (1 - firstHalfShare), 7);
  const labelFor = side => side === 'home' ? home : side === 'away' ? away : 'Empate';

  // Resultado do 1º tempo.
  for (const side of ['home','draw','away']) {
    const probability = firstHalf.filter(r => resultSide(r.home, r.away) === side).reduce((sum,r)=>sum+r.probability,0);
    out.push(estimatedMarket({
      market:'Resultado do 1º Tempo', key:`first_half_result_${side}`,
      selection:side === 'draw' ? 'Empate no 1º tempo' : `${labelFor(side)} vence o 1º tempo`,
      probability, family:'derived', meta:{ catalogOnly:true, period:'1H', result:side }
    }));
  }

  // Total de gols no 1º tempo, no mesmo formato de linha usado pelas casas.
  for (const line of [0.5,1.5,2.5]) {
    const over = poissonOverLine(line, xg.total * firstHalfShare);
    out.push(estimatedMarket({ market:'Total de gols - 1º Tempo', key:`first_half_goals_over_${String(line).replace('.','_')}`, selection:`Mais de ${line} gols no 1º tempo`, probability:over, family:'derived', meta:{ catalogOnly:true, period:'1H', line } }));
    out.push(estimatedMarket({ market:'Total de gols - 1º Tempo', key:`first_half_goals_under_${String(line).replace('.','_')}`, selection:`Menos de ${line} gols no 1º tempo`, probability:1-over, family:'derived', meta:{ catalogOnly:true, period:'1H', line } }));
  }

  // Resultado correto: catálogo enxuto, mas com os placares mais comuns de uma casa.
  finalGrid
    .filter(r => r.home <= 5 && r.away <= 5 && r.probability >= 0.0025)
    .sort((a,b)=>b.probability-a.probability)
    .slice(0,28)
    .forEach(r => out.push(estimatedMarket({
      market:'Resultado Correto', key:`correct_score_${r.home}_${r.away}`,
      selection:`${r.home} - ${r.away}`, probability:r.probability, family:'derived',
      meta:{ catalogOnly:true, exactScore:true, homeGoals:r.home, awayGoals:r.away }
    })));

  // Handicap europeu (3 vias), como o bloco "Handicap - Resultado Final" do vídeo.
  for (const handicap of [-2,-1,1,2]) {
    const probs = { home:0, draw:0, away:0 };
    for (const row of finalGrid) {
      const adjusted = row.home + handicap - row.away;
      probs[adjusted > 0 ? 'home' : adjusted < 0 ? 'away' : 'draw'] += row.probability;
    }
    const hText = handicap > 0 ? `+${handicap}` : String(handicap);
    const awayHandicap = -handicap;
    const aText = awayHandicap > 0 ? `+${awayHandicap}` : String(awayHandicap);
    out.push(estimatedMarket({ market:'Handicap - Resultado Final', key:`euro_handicap_${handicap}_home`, selection:`${home} ${hText}`, probability:probs.home, family:'derived', meta:{ catalogOnly:true, handicap, result:'home' } }));
    out.push(estimatedMarket({ market:'Handicap - Resultado Final', key:`euro_handicap_${handicap}_draw`, selection:`Empate ${hText}`, probability:probs.draw, family:'derived', meta:{ catalogOnly:true, handicap, result:'draw' } }));
    out.push(estimatedMarket({ market:'Handicap - Resultado Final', key:`euro_handicap_${handicap}_away`, selection:`${away} ${aText}`, probability:probs.away, family:'derived', meta:{ catalogOnly:true, handicap, result:'away' } }));
  }

  // Intervalo/Final. O 2º tempo é modelado como incremento independente sobre o placar do intervalo.
  const htft = new Map();
  for (const ht of firstHalf) {
    for (const sh of secondHalf) {
      const first = resultSide(ht.home, ht.away);
      const final = resultSide(ht.home + sh.home, ht.away + sh.away);
      const key = `${first}_${final}`;
      htft.set(key, Number(htft.get(key) || 0) + ht.probability * sh.probability);
    }
  }
  for (const first of ['home','draw','away']) {
    for (const final of ['home','draw','away']) {
      const probability = Number(htft.get(`${first}_${final}`) || 0);
      out.push(estimatedMarket({
        market:'Intervalo/Final', key:`htft_${first}_${final}`,
        selection:`${labelFor(first)} / ${labelFor(final)}`, probability, family:'derived',
        meta:{ catalogOnly:true, firstHalfResult:first, finalResult:final }
      }));
    }
  }

  // Combinação Resultado Final + Total de gols, com as linhas mostradas no vídeo.
  for (const line of [1.5,2.5,3.5,4.5,5.5]) {
    for (const side of ['home','draw','away']) {
      for (const direction of ['over','under']) {
        const probability = finalGrid
          .filter(r => resultSide(r.home,r.away) === side)
          .filter(r => direction === 'over' ? r.home + r.away > line : r.home + r.away < line)
          .reduce((sum,r)=>sum+r.probability,0);
        if (probability < 0.002) continue;
        out.push(estimatedMarket({
          market:`Resultado Final/Total de gols (${line})`,
          key:`result_total_${String(line).replace('.','_')}_${side}_${direction}`,
          selection:`${labelFor(side)} e ${direction === 'over' ? 'Mais' : 'Menos'} ${line}`,
          probability, family:'derived', meta:{ catalogOnly:true, line, result:side, direction }
        }));
      }
    }
  }
}

function solveTotalLambda(over25) {
  const target = Number(over25);
  if (!(target > 0 && target < 1)) return 2.65;
  let lo = 0.25, hi = 6.5;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const p = poissonOverLine(2.5, mid);
    if (p < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function deriveExpectedGoals(probabilities = {}) {
  const total = clamp(solveTotalLambda(probabilities.over25), 1.4, 4.4);
  const home = Number(probabilities.home || 0.34);
  const away = Number(probabilities.away || 0.33);
  const draw = Number(probabilities.draw || 0.33);
  const directional = home - away;
  const drawTightness = clamp((draw - 0.25) * 0.18, -0.03, 0.04);
  const homeShare = clamp(0.53 + directional * 0.62 - drawTightness, 0.28, 0.76);
  const homeLambda = clamp(total * homeShare, 0.25, 3.6);
  const awayLambda = clamp(total - homeLambda, 0.20, 3.2);
  return { home: round(homeLambda, 3), away: round(awayLambda, 3), total: round(homeLambda + awayLambda, 3) };
}

function confidence(probability, family = 'team') {
  const p = Math.max(probability, 1 - probability);
  if (family === 'derived') return p >= 0.78 ? 'média' : 'baixa';
  if (p >= 0.82) return 'média';
  return 'baixa';
}

function estimatedMarket({ market, key, selection, probability, family = 'derived', meta = {} }) {
  const p = clamp(Number(probability || 0), 0.002, 0.995);
  return {
    market,
    key,
    selection,
    probability: p,
    probabilityPct: round(p * 100, 1),
    fairOdd: round(1 / p, 2),
    odd: null,
    bookmaker: null,
    edge: null,
    edgePct: null,
    oddType: 'estimada',
    source: 'Modelo estimado',
    confidence: confidence(p, family),
    reliability: family === 'derived' ? 0.78 : 0.93,
    ...meta
  };
}

function addThresholds(out, config) {
  for (const target of config.targets) {
    const p = poissonAtLeast(target, config.lambda);
    if (p < 0.08 || p > 0.97) continue;
    out.push(estimatedMarket({
      market: config.market,
      key: `${config.keyPrefix}_${target}`,
      selection: `${config.label}: ${target}+ ${config.unit}`,
      probability: p,
      family: 'derived',
      meta: { target, side: config.side, stat: config.stat, mean: round(config.lambda, 2) }
    }));
  }
}

export function estimateAdvancedMarkets(analysis) {
  const p = analysis.probabilities || {};
  const xg = analysis.expectedGoals || deriveExpectedGoals(p);
  const out = [];

  // Dupla chance: o modelo soma probabilidades mutuamente exclusivas do 1X2.
  // Fica disponível mesmo quando a casa não fornece esse mercado, sempre como odd justa estimada.
  const pHome = clamp(Number(p.home || 0), 0, 1);
  const pDraw = clamp(Number(p.draw || 0), 0, 1);
  const pAway = clamp(Number(p.away || 0), 0, 1);
  if (pHome + pDraw + pAway > 0.98) {
    out.push(estimatedMarket({ market:'Dupla chance', key:'double_chance_1x', selection:`${analysis.homeTeam} ou empate (1X)`, probability:pHome + pDraw, family:'team', meta:{ outcomes:['home','draw'] } }));
    out.push(estimatedMarket({ market:'Dupla chance', key:'double_chance_12', selection:`${analysis.homeTeam} ou ${analysis.awayTeam} (12)`, probability:pHome + pAway, family:'team', meta:{ outcomes:['home','away'] } }));
    out.push(estimatedMarket({ market:'Dupla chance', key:'double_chance_x2', selection:`Empate ou ${analysis.awayTeam} (X2)`, probability:pDraw + pAway, family:'team', meta:{ outcomes:['draw','away'] } }));
  }

  // Gols do jogo em várias linhas.
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    const over = poissonOverLine(line, xg.total);
    out.push(estimatedMarket({ market: 'Gols', key: `over_${String(line).replace('.', '_')}`, selection: `Mais de ${line} gols`, probability: over, family: 'team', meta: { line } }));
    out.push(estimatedMarket({ market: 'Gols', key: `under_${String(line).replace('.', '_')}`, selection: `Menos de ${line} gols`, probability: 1 - over, family: 'team', meta: { line } }));
  }

  const btts = clamp((1 - Math.exp(-xg.home)) * (1 - Math.exp(-xg.away)), 0.03, 0.97);
  out.push(estimatedMarket({ market: 'Ambas marcam', key: 'btts_yes_est', selection: 'Ambas marcam: Sim', probability: btts, family: 'team' }));
  out.push(estimatedMarket({ market: 'Ambas marcam', key: 'btts_no_est', selection: 'Ambas marcam: Não', probability: 1 - btts, family: 'team' }));

  // Catálogo adicional inspirado na organização de casas: fica disponível para
  // consulta/Montar meu bilhete, mas não entra nos automáticos para preservar os
  // cinco perfis já aprovados.
  addHouseStyleScoreMarkets(out, analysis, xg);

  for (const [side, team, lambda] of [['home', analysis.homeTeam, xg.home], ['away', analysis.awayTeam, xg.away]]) {
    for (const target of [1, 2, 3]) {
      const prob = poissonAtLeast(target, lambda);
      if (prob > 0.08 && prob < 0.98) out.push(estimatedMarket({ market: 'Gols do time', key: `${side}_team_goals_${target}`, selection: `${team}: ${target}+ gol${target > 1 ? 's' : ''}`, probability: prob, family: 'team', meta: { side, target, stat: 'goals', mean: lambda } }));
    }
  }

  // Estatísticas de time: modelo provisório orientado pela força implícita e gols esperados.
  const homeShare = xg.home / Math.max(xg.total, 0.1);
  const awayShare = 1 - homeShare;
  const totalShots = clamp(23.5 + (xg.total - 2.55) * 2.1, 20.5, 29.5);
  const hShots = totalShots * clamp(0.50 + (homeShare - 0.5) * 0.55, 0.39, 0.64);
  const aShots = totalShots - hShots;
  const hSot = clamp(hShots * 0.29 + xg.home * 0.42, 2.0, 8.2);
  const aSot = clamp(aShots * 0.29 + xg.away * 0.42, 1.8, 7.6);
  const totalCorners = clamp(9.4 + (xg.total - 2.55) * 0.75, 7.8, 11.8);
  const hCorners = totalCorners * clamp(0.51 + (homeShare - 0.5) * 0.42, 0.40, 0.63);
  const aCorners = totalCorners - hCorners;
  const hFouls = clamp(11.4 + (0.5 - homeShare) * 5.2, 8.6, 14.4);
  const aFouls = clamp(11.4 + (homeShare - 0.5) * 5.2, 8.6, 14.4);
  const hCards = clamp(1.75 * (hFouls / 11.4), 1.15, 2.55);
  const aCards = clamp(1.75 * (aFouls / 11.4), 1.15, 2.55);
  const hSaves = clamp(aSot - xg.away * 0.82, 0.9, 5.8);
  const aSaves = clamp(hSot - xg.home * 0.82, 0.9, 6.2);

  // Linhas de volume do jogo no formato Mais/Menos usado pelas casas.
  for (const line of [6.5,7.5,8.5,9.5,10.5,11.5,12.5]) {
    const over = poissonOverLine(line, totalCorners);
    out.push(estimatedMarket({ market:'Total de Escanteios', key:`corners_over_${String(line).replace('.','_')}`, selection:`Mais de ${line} escanteios`, probability:over, family:'derived', meta:{ catalogOnly:true, stat:'corners', line } }));
    out.push(estimatedMarket({ market:'Total de Escanteios', key:`corners_under_${String(line).replace('.','_')}`, selection:`Menos de ${line} escanteios`, probability:1-over, family:'derived', meta:{ catalogOnly:true, stat:'corners', line } }));
  }
  const firstHalfCorners = totalCorners * .46;
  for (const line of [3.5,4.5,5.5]) {
    const over = poissonOverLine(line, firstHalfCorners);
    out.push(estimatedMarket({ market:'Mais/Menos 1º Tempo Escanteios', key:`first_half_corners_over_${String(line).replace('.','_')}`, selection:`Mais de ${line} escanteios no 1º tempo`, probability:over, family:'derived', meta:{ catalogOnly:true, stat:'corners', period:'1H', line } }));
    out.push(estimatedMarket({ market:'Mais/Menos 1º Tempo Escanteios', key:`first_half_corners_under_${String(line).replace('.','_')}`, selection:`Menos de ${line} escanteios no 1º tempo`, probability:1-over, family:'derived', meta:{ catalogOnly:true, stat:'corners', period:'1H', line } }));
  }
  const totalCards = hCards + aCards;
  for (const line of [2.5,3.5,4.5,5.5]) {
    const over = poissonOverLine(line, totalCards);
    out.push(estimatedMarket({ market:'Total de Cartões', key:`cards_over_${String(line).replace('.','_')}`, selection:`Mais de ${line} cartões`, probability:over, family:'derived', meta:{ catalogOnly:true, stat:'cards', line } }));
    out.push(estimatedMarket({ market:'Total de Cartões', key:`cards_under_${String(line).replace('.','_')}`, selection:`Menos de ${line} cartões`, probability:1-over, family:'derived', meta:{ catalogOnly:true, stat:'cards', line } }));
  }

  const teams = [
    { side: 'home', name: analysis.homeTeam, shots: hShots, sot: hSot, corners: hCorners, fouls: hFouls, cards: hCards, saves: hSaves },
    { side: 'away', name: analysis.awayTeam, shots: aShots, sot: aSot, corners: aCorners, fouls: aFouls, cards: aCards, saves: aSaves }
  ];

  for (const t of teams) {
    addThresholds(out, { market: 'Chutes', keyPrefix: `${t.side}_shots`, label: t.name, unit: 'chutes', stat: 'shots', side: t.side, lambda: t.shots, targets: [8, 10, 12, 14] });
    addThresholds(out, { market: 'Chutes no gol', keyPrefix: `${t.side}_sot`, label: t.name, unit: 'chutes no gol', stat: 'shotsOnTarget', side: t.side, lambda: t.sot, targets: [2, 3, 4, 5] });
    addThresholds(out, { market: 'Escanteios', keyPrefix: `${t.side}_corners`, label: t.name, unit: 'escanteios', stat: 'corners', side: t.side, lambda: t.corners, targets: [3, 4, 5, 6] });
    addThresholds(out, { market: 'Faltas', keyPrefix: `${t.side}_fouls`, label: t.name, unit: 'faltas', stat: 'fouls', side: t.side, lambda: t.fouls, targets: [8, 10, 12, 14] });
    addThresholds(out, { market: 'Cartões', keyPrefix: `${t.side}_cards`, label: t.name, unit: 'cartões', stat: 'cards', side: t.side, lambda: t.cards, targets: [1, 2, 3] });
    addThresholds(out, { market: 'Defesas', keyPrefix: `${t.side}_saves`, label: `${t.name}`, unit: 'defesas do goleiro', stat: 'saves', side: t.side, lambda: t.saves, targets: [2, 3, 4, 5] });
  }

  return out.sort((a, b) => b.probability - a.probability || a.fairOdd - b.fairOdd);
}

function expectedMinutesForPlayer(row) {
  const apps = Math.max(1, Number(row.appearances || 0));
  const starts = Number(row.starts || 0);
  const avg = Number(row.minutes || 0) / apps;
  const startRate = clamp(starts / apps, 0, 1);
  return clamp(avg * (0.82 + 0.23 * startRate), 35, 88);
}

function playerMarket({ player, team, market, key, selection, selectionForTarget, rate90, expectedMinutes, targets, kind = 'count', position, sampleMinutes, modeledRate = false, photo = '', jersey = '', starts = 0, appearances = 0, maxLambda = 12 }) {
  const lambda = clamp(Number(rate90 || 0) * expectedMinutes / 90, 0, maxLambda);
  const results = [];
  for (const target of targets) {
    const probability = kind === 'binary' ? clamp(1 - Math.exp(-lambda), 0.01, 0.95) : poissonAtLeast(target, lambda);
    if (probability < 0.07 || probability > 0.97) continue;
    const sample = Number(sampleMinutes || 0);
    const conf = modeledRate ? 'baixa' : sample >= 1200 ? 'alta' : sample >= 600 ? 'média' : 'baixa';
    const reliability = modeledRate ? 0.70 : conf === 'alta' ? 0.92 : conf === 'média' ? 0.84 : 0.74;
    results.push({
      market,
      key: `${key}_${target}`,
      selection: selectionForTarget ? selectionForTarget(target) : selection,
      player,
      team,
      target,
      position,
      photo,
      jersey,
      starts,
      appearances,
      probability,
      probabilityPct: round(probability * 100, 1),
      fairOdd: round(1 / probability, 2),
      odd: null,
      bookmaker: null,
      edge: null,
      edgePct: null,
      oddType: 'estimada',
      source: modeledRate ? 'API-Football + modelo próprio por posição' : 'API-Football + modelo por 90 min',
      confidence: conf,
      reliability,
      modeledRate,
      expectedMinutes: round(expectedMinutes, 0),
      rate90: round(rate90, 2)
    });
  }
  return results;
}

function fallbackRatesByPosition(position = '') {
  const pos = String(position || '').trim().toUpperCase();
  if (pos.startsWith('G')) return { shots:0.05, sot:0.01, foulsCommitted:0.08, foulsDrawn:0.05, goals:0.01, cards:0.07, saves:3.15, assists:0.01, passes:30, tackles:0.10, offsides:0.01 };
  if (pos.startsWith('D')) return { shots:0.62, sot:0.20, foulsCommitted:1.18, foulsDrawn:0.72, goals:0.07, cards:0.22, saves:0, assists:0.07, passes:52, tackles:1.85, offsides:0.04 };
  if (pos.startsWith('M')) return { shots:1.35, sot:0.46, foulsCommitted:1.32, foulsDrawn:1.08, goals:0.13, cards:0.17, saves:0, assists:0.18, passes:46, tackles:1.55, offsides:0.17 };
  return { shots:2.25, sot:0.86, foulsCommitted:1.08, foulsDrawn:1.24, goals:0.30, cards:0.10, saves:0, assists:0.16, passes:29, tackles:0.62, offsides:0.55 };
}

function rateOrModel(observed, fallback) {
  const value = Number(observed || 0);
  return value > 0.02 ? { rate:value, modeled:false } : { rate:Number(fallback || 0), modeled:true };
}

function passTargets(rate90, expectedMinutes) {
  const mean = Math.max(8, Number(rate90 || 0) * Number(expectedMinutes || 75) / 90);
  const raw = [mean * .72, mean * .90, mean * 1.08].map(v => Math.max(5, Math.round(v / 5) * 5));
  return [...new Set(raw)].sort((a,b)=>a-b);
}

function firstScorerMarket(p, rate90, expectedMinutes, attackAdj, context, modeledRate) {
  const playerLambda = Math.max(0, Number(rate90 || 0) * Number(expectedMinutes || 75) / 90 * Number(attackAdj || 1));
  const totalLambda = Math.max(.5, Number(context.homeLambda || 1.35) + Number(context.awayLambda || 1.15));
  const probability = clamp((playerLambda / totalLambda) * (1 - Math.exp(-totalLambda)), .01, .45);
  if (probability < .04) return null;
  const sample = Number(p.minutes || 0);
  const conf = modeledRate ? 'baixa' : sample >= 1200 ? 'alta' : sample >= 600 ? 'média' : 'baixa';
  return {
    market:'Primeiro marcador', key:`player_${p.id}_first_scorer`, selection:`${p.name}: primeiro marcador`,
    player:p.name, team:p.teamName, target:1, position:p.position, photo:p.photo || '', jersey:p.jersey || '',
    starts:Number(p.starts || 0), appearances:Number(p.appearances || 0), probability, probabilityPct:round(probability*100,1),
    fairOdd:round(1/probability,2), odd:null, bookmaker:null, edge:null, edgePct:null, oddType:'estimada',
    source:modeledRate ? 'Modelo próprio por posição' : 'API-Football + modelo de participação em gols', confidence:conf,
    reliability:modeledRate ? .62 : conf==='alta' ? .82 : conf==='média' ? .75 : .66, modeledRate, expectedMinutes:round(expectedMinutes,0), rate90:round(rate90,2)
  };
}

export function estimatePlayerMarkets(players, context = {}) {
  const out = [];
  for (const p of players || []) {
    if (!p.name) continue;
    const sampleMinutes = Number(p.minutes || 0);
    const appearances = Number(p.appearances || 0);
    const lowSampleModeled = sampleMinutes < 180 && appearances > 0 && Boolean(p.position);
    if (sampleMinutes < 180 && !lowSampleModeled) continue;
    const expectedMinutes = expectedMinutesForPlayer(p);
    const teamLambda = p.teamId === context.homeTeamId ? Number(context.homeLambda || 1.35) : Number(context.awayLambda || 1.15);
    const attackAdj = clamp(0.82 + teamLambda / 2.8, 0.9, 1.35);
    const defensiveAdj = clamp(1.12 - teamLambda / 10, 0.92, 1.08);
    const fallback = fallbackRatesByPosition(p.position);
    const shotsRate = lowSampleModeled ? {rate:fallback.shots, modeled:true} : rateOrModel(p.shotsPer90, fallback.shots);
    const sotObserved = Number(p.sotPer90 || 0);
    const sotFallback = Number(p.shotsPer90 || 0) > 0.05 ? Math.max(fallback.sot, Number(p.shotsPer90) * 0.32) : fallback.sot;
    const sotRate = lowSampleModeled ? {rate:fallback.sot, modeled:true} : rateOrModel(sotObserved, sotFallback);
    const foulsRate = lowSampleModeled ? {rate:fallback.foulsCommitted, modeled:true} : rateOrModel(p.foulsCommittedPer90, fallback.foulsCommitted);
    const drawnRate = lowSampleModeled ? {rate:fallback.foulsDrawn, modeled:true} : rateOrModel(p.foulsDrawnPer90, fallback.foulsDrawn);
    const goalsRate = lowSampleModeled ? {rate:fallback.goals, modeled:true} : rateOrModel(p.goalsPer90, fallback.goals);
    const cardsRate = lowSampleModeled ? {rate:fallback.cards, modeled:true} : rateOrModel(p.cardsPer90, fallback.cards);
    const savesRate = lowSampleModeled ? {rate:fallback.saves, modeled:true} : rateOrModel(p.savesPer90, fallback.saves);
    const assistsRate = lowSampleModeled ? {rate:fallback.assists, modeled:true} : rateOrModel(p.assistsPer90, fallback.assists);
    const passesRate = lowSampleModeled ? {rate:fallback.passes, modeled:true} : rateOrModel(p.passesPer90, fallback.passes);
    const tacklesRate = lowSampleModeled ? {rate:fallback.tackles, modeled:true} : rateOrModel(p.tacklesPer90, fallback.tackles);
    const offsidesRate = lowSampleModeled ? {rate:fallback.offsides, modeled:true} : rateOrModel(p.offsidesPer90, fallback.offsides);
    const meta = { player:p.name, team:p.teamName, position:p.position, sampleMinutes:p.minutes, photo:p.photo || '', jersey:p.jersey || '', starts:p.starts, appearances:p.appearances };

    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Chutes do jogador', key:`player_${p.id}_shots`, selectionForTarget:t=>`${p.name}: ${t}+ chute${t > 1 ? 's' : ''}`, rate90:shotsRate.rate * attackAdj, modeledRate:shotsRate.modeled, targets:[1,2,3,4,5,6] }));
    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Chutes no gol do jogador', key:`player_${p.id}_sot`, selectionForTarget:t=>`${p.name}: ${t}+ chute${t > 1 ? 's' : ''} no gol`, rate90:sotRate.rate * attackAdj, modeledRate:sotRate.modeled, targets:[1,2,3,4] }));
    const halfMinutes = Math.min(45, expectedMinutes);
    out.push(...playerMarket({ ...meta, expectedMinutes:halfMinutes, market:'Chutes - Primeiro Tempo', key:`player_${p.id}_shots_1h`, selectionForTarget:t=>`${p.name}: ${t}+ chute${t > 1 ? 's' : ''} no 1º tempo`, rate90:shotsRate.rate * attackAdj, modeledRate:shotsRate.modeled, targets:[1,2,3] }));
    out.push(...playerMarket({ ...meta, expectedMinutes:halfMinutes, market:'Chutes no Gol - Primeiro Tempo', key:`player_${p.id}_sot_1h`, selectionForTarget:t=>`${p.name}: ${t}+ chute${t > 1 ? 's' : ''} no gol no 1º tempo`, rate90:sotRate.rate * attackAdj, modeledRate:sotRate.modeled, targets:[1,2] }));
    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Faltas do jogador', key:`player_${p.id}_fouls`, selectionForTarget:t=>`${p.name}: ${t}+ falta${t > 1 ? 's' : ''} cometida${t > 1 ? 's' : ''}`, rate90:foulsRate.rate * defensiveAdj, modeledRate:foulsRate.modeled, targets:[1,2,3] }));
    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Faltas sofridas', key:`player_${p.id}_drawn`, selectionForTarget:t=>`${p.name}: ${t}+ falta${t > 1 ? 's' : ''} sofrida${t > 1 ? 's' : ''}`, rate90:drawnRate.rate, modeledRate:drawnRate.modeled, targets:[1,2,3] }));
    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Cartão do jogador', key:`player_${p.id}_card`, selection:`${p.name}: receber cartão`, rate90:cardsRate.rate, modeledRate:cardsRate.modeled, targets:[1], kind:'binary' }));
    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Gol do jogador', key:`player_${p.id}_goal`, selectionForTarget:t=>t===1?`${p.name}: marcar a qualquer momento`:t===2?`${p.name}: 2+ gols`:`${p.name}: Hat-Trick`, rate90:goalsRate.rate * attackAdj, modeledRate:goalsRate.modeled, targets:[1,2,3] }));
    const firstScorer = firstScorerMarket(p, goalsRate.rate, expectedMinutes, attackAdj, context, goalsRate.modeled);
    if (firstScorer) out.push(firstScorer);
    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Assistências do jogador', key:`player_${p.id}_assists`, selectionForTarget:t=>`${p.name}: ${t}+ assistência${t>1?'s':''}`, rate90:assistsRate.rate * attackAdj, modeledRate:assistsRate.modeled, targets:[1,2] }));
    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Passes do jogador', key:`player_${p.id}_passes`, selectionForTarget:t=>`${p.name}: ${t}+ passes`, rate90:passesRate.rate, modeledRate:passesRate.modeled, targets:passTargets(passesRate.rate, expectedMinutes), maxLambda:120 }));
    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Desarmes do jogador', key:`player_${p.id}_tackles`, selectionForTarget:t=>`${p.name}: ${t}+ desarme${t>1?'s':''}`, rate90:tacklesRate.rate * defensiveAdj, modeledRate:tacklesRate.modeled, targets:[1,2,3,4] }));
    out.push(...playerMarket({ ...meta, expectedMinutes, market:'Impedimentos do jogador', key:`player_${p.id}_offsides`, selectionForTarget:t=>`${p.name}: ${t}+ impedimento${t>1?'s':''}`, rate90:offsidesRate.rate * attackAdj, modeledRate:offsidesRate.modeled, targets:[1,2,3] }));
    if (String(p.position || '').toUpperCase().startsWith('G') || p.savesPer90 > 0.4) {
      out.push(...playerMarket({ ...meta, expectedMinutes, market:'Defesas do goleiro', key:`player_${p.id}_saves`, selectionForTarget:t=>`${p.name}: ${t}+ defesas`, rate90:savesRate.rate, modeledRate:savesRate.modeled, targets:[1,2,3,4,5] }));
    }
  }

  const usable = out
    .filter(m => m.probability >= 0.04 && m.probability <= 0.95)
    .sort((a,b) => {
      const ca = a.confidence === 'alta' ? 2 : a.confidence === 'média' ? 1 : 0;
      const cb = b.confidence === 'alta' ? 2 : b.confidence === 'média' ? 1 : 0;
      return cb - ca || b.probability - a.probability;
    });

  const order = [
    'Chutes no gol do jogador','Chutes do jogador','Defesas do goleiro','Assistências do jogador',
    'Chutes no Gol - Primeiro Tempo','Chutes - Primeiro Tempo','Passes do jogador','Desarmes do jogador',
    'Impedimentos do jogador','Faltas sofridas','Faltas do jogador','Cartão do jogador','Gol do jogador','Primeiro marcador'
  ];
  const buckets = new Map(order.map(name => [name, usable.filter(m => m.market === name)]));
  const diversified = [];
  let progressed = true;
  while (diversified.length < 140 && progressed) {
    progressed = false;
    for (const name of order) {
      const bucket = buckets.get(name);
      if (bucket?.length) {
        diversified.push(bucket.shift());
        progressed = true;
        if (diversified.length >= 140) break;
      }
    }
  }
  for (const row of usable) {
    if (diversified.length >= 140) break;
    if (!diversified.includes(row)) diversified.push(row);
  }
  return diversified;
}
