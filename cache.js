const FACT = Array.from({ length: 40 }, (_, i) => i <= 1 ? 1 : 0);
for (let i = 2; i < FACT.length; i++) FACT[i] = FACT[i - 1] * i;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round = (n, d = 2) => Number(n.toFixed(d));

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda) * Math.pow(lambda, k) / FACT[k];
}

function poissonCdf(k, lambda) {
  if (k < 0) return 0;
  let sum = 0;
  for (let i = 0; i <= Math.min(k, FACT.length - 1); i++) sum += poissonPmf(i, lambda);
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
  const p = clamp(Number(probability || 0), 0.01, 0.99);
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

function playerMarket({ player, team, market, key, selection, selectionForTarget, rate90, expectedMinutes, targets, kind = 'count', position, sampleMinutes }) {
  const lambda = clamp(Number(rate90 || 0) * expectedMinutes / 90, 0, 12);
  const results = [];
  for (const target of targets) {
    const probability = kind === 'binary' ? clamp(1 - Math.exp(-lambda), 0.01, 0.95) : poissonAtLeast(target, lambda);
    if (probability < 0.07 || probability > 0.97) continue;
    const sample = Number(sampleMinutes || 0);
    const conf = sample >= 1200 ? 'alta' : sample >= 600 ? 'média' : 'baixa';
    results.push({
      market,
      key: `${key}_${target}`,
      selection: selectionForTarget ? selectionForTarget(target) : selection,
      player,
      team,
      target,
      position,
      probability,
      probabilityPct: round(probability * 100, 1),
      fairOdd: round(1 / probability, 2),
      odd: null,
      bookmaker: null,
      edge: null,
      edgePct: null,
      oddType: 'estimada',
      source: 'API-Football + modelo por 90 min',
      confidence: conf,
      expectedMinutes: round(expectedMinutes, 0),
      rate90: round(rate90, 2)
    });
  }
  return results;
}

export function estimatePlayerMarkets(players, context = {}) {
  const out = [];
  for (const p of players || []) {
    if (!p.name || Number(p.minutes || 0) < 180) continue;
    const expectedMinutes = expectedMinutesForPlayer(p);
    const teamLambda = p.teamId === context.homeTeamId ? Number(context.homeLambda || 1.35) : Number(context.awayLambda || 1.15);
    const attackAdj = clamp(0.82 + teamLambda / 2.8, 0.9, 1.35);
    const defensiveAdj = clamp(1.12 - teamLambda / 10, 0.92, 1.08);

    out.push(...playerMarket({ player:p.name, team:p.teamName, position:p.position, sampleMinutes:p.minutes, expectedMinutes, market:'Chutes do jogador', key:`player_${p.id}_shots`, selectionForTarget:t=>`${p.name}: ${t}+ chute${t > 1 ? 's' : ''}`, rate90:p.shotsPer90 * attackAdj, targets:[1,2,3,4] }));
    out.push(...playerMarket({ player:p.name, team:p.teamName, position:p.position, sampleMinutes:p.minutes, expectedMinutes, market:'Chutes no gol do jogador', key:`player_${p.id}_sot`, selectionForTarget:t=>`${p.name}: ${t}+ chute${t > 1 ? 's' : ''} no gol`, rate90:p.sotPer90 * attackAdj, targets:[1,2] }));
    out.push(...playerMarket({ player:p.name, team:p.teamName, position:p.position, sampleMinutes:p.minutes, expectedMinutes, market:'Faltas do jogador', key:`player_${p.id}_fouls`, selectionForTarget:t=>`${p.name}: ${t}+ falta${t > 1 ? 's' : ''} cometida${t > 1 ? 's' : ''}`, rate90:p.foulsCommittedPer90 * defensiveAdj, targets:[1,2,3] }));
    out.push(...playerMarket({ player:p.name, team:p.teamName, position:p.position, sampleMinutes:p.minutes, expectedMinutes, market:'Faltas sofridas', key:`player_${p.id}_drawn`, selectionForTarget:t=>`${p.name}: ${t}+ falta${t > 1 ? 's' : ''} sofrida${t > 1 ? 's' : ''}`, rate90:p.foulsDrawnPer90, targets:[1,2,3] }));
    out.push(...playerMarket({ player:p.name, team:p.teamName, position:p.position, sampleMinutes:p.minutes, expectedMinutes, market:'Cartão do jogador', key:`player_${p.id}_card`, selection:`${p.name}: receber cartão`, rate90:p.cardsPer90, targets:[1], kind:'binary' }));
    out.push(...playerMarket({ player:p.name, team:p.teamName, position:p.position, sampleMinutes:p.minutes, expectedMinutes, market:'Gol do jogador', key:`player_${p.id}_goal`, selection:`${p.name}: marcar`, rate90:p.goalsPer90 * attackAdj, targets:[1], kind:'binary' }));
    if (String(p.position || '').toUpperCase().startsWith('G') || p.savesPer90 > 0.4) {
      out.push(...playerMarket({ player:p.name, team:p.teamName, position:p.position, sampleMinutes:p.minutes, expectedMinutes, market:'Defesas do goleiro', key:`player_${p.id}_saves`, selectionForTarget:t=>`${p.name}: ${t}+ defesas`, rate90:p.savesPer90, targets:[2,3,4,5] }));
    }
  }

  // Mantém diversidade entre props. Antes, ordenar tudo só por probabilidade podia
  // fazer um único tipo (especialmente defesas) dominar o corte e os automáticos.
  const usable = out
    .filter(m => m.probability >= 0.07 && m.probability <= 0.94)
    .sort((a,b) => {
      const ca = a.confidence === 'alta' ? 2 : a.confidence === 'média' ? 1 : 0;
      const cb = b.confidence === 'alta' ? 2 : b.confidence === 'média' ? 1 : 0;
      return cb - ca || b.probability - a.probability;
    });

  const order = [
    'Chutes do jogador',
    'Chutes no gol do jogador',
    'Faltas sofridas',
    'Faltas do jogador',
    'Cartão do jogador',
    'Gol do jogador',
    'Defesas do goleiro'
  ];
  const buckets = new Map(order.map(name => [name, usable.filter(m => m.market === name)]));
  const diversified = [];
  let progressed = true;
  while (diversified.length < 80 && progressed) {
    progressed = false;
    for (const name of order) {
      const bucket = buckets.get(name);
      if (bucket?.length) {
        diversified.push(bucket.shift());
        progressed = true;
        if (diversified.length >= 80) break;
      }
    }
  }
  // Caso algum provedor acrescente um mercado novo, ele não é perdido.
  for (const row of usable) {
    if (diversified.length >= 80) break;
    if (!diversified.includes(row)) diversified.push(row);
  }
  return diversified;
}
