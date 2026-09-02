import { onlyPrematch } from './prematch.js';
import { sameTeam } from '../utils/names.js';
function pct(n) { return Math.round(n * 1000) / 10; }
function decimal(n) { return Math.round(n * 100) / 100; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function mapH2HName(name, analysis) {
  if (!name) return null;
  if (['draw','empate'].includes(name.toLowerCase())) return { key: 'draw', label: 'Empate' };
  if (name === analysis.homeTeam) return { key: 'home', label: `${analysis.homeTeam} vence` };
  if (name === analysis.awayTeam) return { key: 'away', label: `${analysis.awayTeam} vence` };
  return null;
}

export function buildOpportunities(analysis, oddsSummary) {
  const opportunities = [];
  for (const row of Object.values(oddsSummary.best || {})) {
    if (row.market === 'h2h') {
      const mapped = mapH2HName(row.name, analysis);
      if (!mapped) continue;
      const p = analysis.probabilities[mapped.key];
      if (!p) continue;
      const ev = p * row.price - 1;
      opportunities.push({
        market: '1X2', selection: mapped.label, key: mapped.key,
        probability: p, odd: row.price, bookmaker: row.bookmaker, edge: ev,
        fairOdd: 1 / Math.max(p, .001), oddType: 'real',
        edgeType: analysis.mode === 'market-consensus' ? 'melhor-preco-vs-consenso' : 'modelo-poisson',
        source: 'Odd real', reliability: 1
      });
    }
    if (row.market === 'totals_2_5') {
      const isOver = row.name.toLowerCase().startsWith('over');
      const key = isOver ? 'over25' : 'under25';
      const p = analysis.probabilities[key];
      if (!p) continue;
      const ev = p * row.price - 1;
      opportunities.push({
        market: 'Total 2.5', selection: isOver ? 'Mais de 2.5 gols' : 'Menos de 2.5 gols', key,
        probability: p, odd: row.price, bookmaker: row.bookmaker, edge: ev,
        fairOdd: 1 / Math.max(p, .001), oddType: 'real',
        edgeType: analysis.mode === 'market-consensus' ? 'melhor-preco-vs-consenso' : 'modelo-poisson',
        source: 'Odd real', reliability: 1
      });
    }
  }

  return opportunities
    .map(o => ({ ...o, probabilityPct: pct(o.probability), edgePct: pct(o.edge), fairOdd: decimal(o.fairOdd) }))
    .sort((a,b) => b.edge - a.edge);
}

function candidatePrice(c) {
  return Number(c.odd || c.fairOdd || 1);
}

function marketFamily(c) {
  const market = String(c.market || 'Outro').toLowerCase();
  if (market.includes('chutes no gol')) return 'Chutes no gol';
  if (market.includes('chutes')) return 'Chutes';
  if (market.includes('defesas')) return 'Defesas';
  if (market.includes('cart')) return 'Cartões';
  if (market.includes('falta')) return 'Faltas';
  if (market.includes('escante')) return 'Escanteios';
  if (market === '1x2' || market.includes('dupla chance')) return 'Resultado';
  if (market.includes('ambas')) return 'Ambas marcam';
  if (market.includes('gols do time')) return 'Gols do time';
  if (market.includes('gol') || market.includes('total')) return 'Gols';
  return c.market || 'Outro';
}

function isPlayerMarket(c) {
  const market = String(c.market || '').toLowerCase();
  return !!c.player || market.includes('jogador') || market.includes('goleiro');
}

function playerMarketGroup(c) {
  if (!isPlayerMarket(c)) return null;
  const market = String(c.market || '').toLowerCase();
  if (market.includes('defesas do goleiro')) return 'goleiro';
  if (market.includes('falta') || market.includes('cartão') || market.includes('cartao')) return 'duelo';
  if (market.includes('chute') || market.includes('gol do jogador')) return 'ataque';
  return 'outro';
}

function marketArchetype(c) {
  const family = marketFamily(c);
  const target = c.target ?? c.line ?? c.meta?.target ?? c.meta?.line ?? '';
  const key = String(c.key || '').toLowerCase();
  let direction = '';
  if (key.includes('under') || String(c.selection || '').toLowerCase().startsWith('menos')) direction = 'under';
  else if (key.includes('over') || String(c.selection || '').toLowerCase().startsWith('mais')) direction = 'over';
  else if (key.includes('btts_yes')) direction = 'sim';
  else if (key.includes('btts_no')) direction = 'não';
  return `${family}|${direction}|${target}`;
}

function normalizeCandidate(c, match) {
  const probability = clamp(Number(c.probability || 0), .001, .999);
  const fairOdd = Number(c.fairOdd || (probability ? 1 / probability : 1));
  const reliability = clamp(Number(c.reliability || (c.odd ? 1 : (c.confidence === 'alta' ? .90 : c.confidence === 'média' ? .82 : .70))), .55, 1);
  const playerMarket = isPlayerMarket(c);
  const fixtureMeta = match.apiFixture || match.publicFixture || match.favoriteFixture || null;
  const fixtureId = c.fixtureId || fixtureMeta?.fixtureId || null;
  const provider = c.provider || fixtureMeta?.provider || (String(fixtureId || '').startsWith('public~') ? 'public' : String(fixtureId || '').startsWith('odds~') ? 'odds' : fixtureId ? 'api-football' : null);
  const fallbackEstimated = Boolean(
    c.fallbackEstimated ||
    String(match.mode || '').includes('public-fallback') ||
    /odd aproximada|sem consulta da api-football|fonte pública/i.test(String(c.source || match.probabilitySource || ''))
  );

  // Probabilidade de segurança: não trata uma estimativa de baixa confiança como se fosse tão
  // precisa quanto uma odd/estatística de alta confiança. Isso reduz a superconfiança dos bilhetes.
  let safeProbability = probability * (.80 + .20 * reliability) - (1 - reliability) * .04;
  if (playerMarket) {
    safeProbability -= .012;
    const mins = Number(c.expectedMinutes || 0);
    if (mins > 0 && mins < 65) safeProbability -= .02;
  }
  safeProbability = clamp(safeProbability, .03, .97);

  return {
    ...c,
    probability,
    modelProbability: probability,
    safeProbability,
    safeFairOdd: 1 / Math.max(safeProbability, .001),
    fairOdd,
    match: `${match.homeTeam} x ${match.awayTeam}`,
    matchKey: `${match.leagueKey || ''}:${match.homeTeam}:${match.awayTeam}`,
    kickoff: match.kickoff,
    leagueKey: match.leagueKey,
    leagueLabel: match.leagueLabel,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    displayOdd: decimal(candidatePrice(c)),
    oddType: c.odd ? 'real' : 'estimada',
    reliability,
    fixtureId,
    provider,
    fallbackEstimated,
    isPlayerMarket: playerMarket,
    family: marketFamily(c),
    archetype: marketArchetype(c)
  };
}

function resultOutcomes(c) {
  const key = String(c.key || '').toLowerCase();
  if (key === 'home') return new Set(['home']);
  if (key === 'draw') return new Set(['draw']);
  if (key === 'away') return new Set(['away']);
  if (key === 'double_chance_1x') return new Set(['home','draw']);
  if (key === 'double_chance_12') return new Set(['home','away']);
  if (key === 'double_chance_x2') return new Set(['draw','away']);
  return null;
}

function globalGoalLine(c) {
  const key = String(c.key || '').toLowerCase();
  if (key === 'over25') return { direction:'over', line:2.5 };
  if (key === 'under25') return { direction:'under', line:2.5 };
  let m = key.match(/^(over|under)_(\d+)_(\d+)$/);
  if (m) return { direction:m[1], line:Number(`${m[2]}.${m[3]}`) };
  const text = String(c.selection || '').toLowerCase();
  m = text.match(/^(mais|menos) de ([0-9]+(?:[.,][0-9]+)?) gols/);
  if (m) return { direction:m[1] === 'mais' ? 'over' : 'under', line:Number(m[2].replace(',','.')) };
  return null;
}

function teamGoalFloor(c) {
  const key = String(c.key || '').toLowerCase();
  const m = key.match(/^(home|away)_team_goals_(\d+)$/);
  if (m) return { side:m[1], target:Number(m[2]) };
  if (String(c.market || '').toLowerCase() === 'gol do jogador') {
    const side = c.team && sameTeam(c.team, c.homeTeam) ? 'home' : c.team && sameTeam(c.team, c.awayTeam) ? 'away' : null;
    return side ? { side, target:1 } : null;
  }
  return null;
}

function bttsSide(c) {
  const key = String(c.key || '').toLowerCase();
  if (key.includes('btts_yes')) return 'yes';
  if (key.includes('btts_no')) return 'no';
  return null;
}

function attackingSide(c) {
  if (c.side === 'home' || c.side === 'away') return c.side;
  if (c.team && sameTeam(c.team, c.homeTeam)) return 'home';
  if (c.team && sameTeam(c.team, c.awayTeam)) return 'away';
  const key = String(c.key || '').toLowerCase();
  if (key.startsWith('home_')) return 'home';
  if (key.startsWith('away_')) return 'away';
  return null;
}

function candidateSignals(c) {
  const out = new Set();
  const key = String(c.key || '').toLowerCase();
  const family = marketFamily(c);
  const goalLine = globalGoalLine(c);
  const result = resultOutcomes(c);
  const side = attackingSide(c);
  const btts = bttsSide(c);
  const teamGoal = teamGoalFloor(c);

  if (result) {
    if (result.has('home') && !result.has('away')) { out.add('home-safe'); out.add('home-attack'); }
    if (result.has('away') && !result.has('home')) { out.add('away-safe'); out.add('away-attack'); }
    if (key === 'double_chance_12') out.add('decisive');
    if (key === 'draw') out.add('balanced');
  }
  if (goalLine?.direction === 'over') out.add('goals-high');
  if (goalLine?.direction === 'under') out.add('goals-low');
  if (btts === 'yes') { out.add('goals-high'); out.add('both-score'); }
  if (btts === 'no') { out.add('goals-low'); out.add('clean-sheet'); }
  if (teamGoal) { out.add(`${teamGoal.side}-attack`); out.add('goals-high'); }

  const attackingFamilies = new Set(['Chutes','Chutes no gol','Escanteios','Gols do time']);
  if (side && (attackingFamilies.has(family) || c.isPlayerMarket && /chute|gol|falta sofrida/i.test(String(c.market || '')))) out.add(`${side}-attack`);
  if (family === 'Defesas' && side) out.add(`${side === 'home' ? 'away' : 'home'}-attack`);
  if (family === 'Cartões' || family === 'Faltas') out.add('duel-intensity');
  return out;
}

function pairCompatible(a, b) {
  if (a.matchKey !== b.matchKey) return true;
  if (`${a.key}|${a.selection}` === `${b.key}|${b.selection}`) return false;

  // Nunca empilha 1X2 + dupla chance no mesmo jogo: é correlação redundante, não valor novo.
  if (resultOutcomes(a) && resultOutcomes(b)) return false;

  const ga = globalGoalLine(a), gb = globalGoalLine(b);
  if (ga && gb) {
    if (ga.direction === gb.direction) return false; // evita Over 0.5 + Over 1.5 (ou dois Unders) no mesmo bilhete
    const over = ga.direction === 'over' ? ga : gb;
    const under = ga.direction === 'under' ? ga : gb;
    if (over.line >= under.line) return false;
  }

  const ba = bttsSide(a), bb = bttsSide(b);
  if (ba && bb && ba !== bb) return false;
  const under = ga?.direction === 'under' ? ga : gb?.direction === 'under' ? gb : null;
  if ((ba === 'yes' || bb === 'yes') && under && Math.floor(under.line) < 2) return false;

  const ta = teamGoalFloor(a), tb = teamGoalFloor(b);
  if (ta && tb && ta.side === tb.side) return false; // evita 1+ e 2+ do mesmo time no mesmo bilhete
  if (under) {
    const floors = [ta, tb].filter(Boolean);
    const minimumGoals = floors.reduce((sum,x) => sum + x.target, 0);
    if (minimumGoals > Math.floor(under.line)) return false;
  }

  return true;
}

function pairCoherence(a, b) {
  if (a.matchKey !== b.matchKey) return 0;
  if (!pairCompatible(a,b)) return -999;
  const sa = candidateSignals(a), sb = candidateSignals(b);
  let shared = 0;
  for (const sig of sa) if (sb.has(sig)) shared += 1;
  // Mercados diferentes podem reforçar o mesmo cenário sem serem cópias entre si.
  return shared * 3 + (a.family !== b.family && shared ? 1 : 0);
}

function canAddSameMatch(legs, candidate, profile) {
  const same = legs.filter(l => l.matchKey === candidate.matchKey);
  if (!same.length) return true;
  if (same.length >= Number(profile.maxSameMatch || 3)) return false;
  if (same.some(l => !pairCompatible(l, candidate))) return false;
  // Uma segunda/terceira seleção da mesma partida só entra se conversar com ao menos uma já escolhida.
  return same.some(l => pairCoherence(l, candidate) > 0);
}

function sameMatchExtraCount(legs) {
  const counts = new Map();
  for (const l of legs) counts.set(l.matchKey, Number(counts.get(l.matchKey) || 0) + 1);
  let extras = 0;
  for (const n of counts.values()) extras += Math.max(0, n - 1);
  return extras;
}

function combinedPriceForLegs(legs, profile) {
  const raw = legs.reduce((p,l) => p * candidatePrice(l), 1);
  const extras = sameMatchExtraCount(legs);
  const factor = Number(profile.sameMatchOddFactor ?? .92);
  return raw * Math.pow(factor, extras);
}

function safeJointForLegs(legs, profile, useModel = false) {
  const raw = legs.reduce((p,l) => p * Number(useModel ? l.probability : (l.safeProbability || l.probability) || 0), 1);
  if (useModel) return raw;
  const extras = sameMatchExtraCount(legs);
  return raw * Math.pow(Number(profile.correlationProbabilityFactor ?? .95), extras);
}

function correlationOf(legs) {
  const counts = new Map();
  for (const l of legs) counts.set(l.matchKey, Number(counts.get(l.matchKey) || 0) + 1);
  const max = Math.max(0, ...counts.values());
  return max >= 3 ? 'alta' : max === 2 ? 'média' : 'baixa';
}

function riskOf(legs, fairCombinedOdd, jointProbability) {
  const minP = Math.min(...legs.map(l => Number(l.probability || 0)));
  // Risco usa a probabilidade do modelo (e sua odd justa equivalente), não a cotação paga pela casa.
  if (fairCombinedOdd <= 2.00 && jointProbability >= .50 && minP >= .62) return 'baixo';
  if (fairCombinedOdd <= 3.00 && jointProbability >= (1/3) && minP >= .48) return 'médio';
  return 'alto';
}

function confidenceOf(legs) {
  if (!legs.length) return 'baixa';
  const avg = legs.reduce((s,l) => s + Number(l.reliability || .75), 0) / legs.length;
  return avg >= .9 ? 'alta' : avg >= .78 ? 'média' : 'baixa';
}

function allCandidates(match, profile, forceFallback = false) {
  const real = (match.opportunities || []).map(c => normalizeCandidate(c, match));
  const estimated = (match.estimatedMarkets || []).map(c => normalizeCandidate(c, match));
  const source = [...real, ...estimated];
  let pool = source
    .filter(c => Number(c.safeProbability) >= (c.fallbackEstimated ? Math.min(.78, Number(profile.minP || 0) + .01) : profile.minP))
    .filter(c => profile.maxP == null || Number(c.safeProbability) <= profile.maxP)
    .filter(c => Number(c.safeFairOdd) >= profile.minFair && Number(c.safeFairOdd) <= profile.maxFair)
    // Quando a fonte sem chave está ativa, a confiabilidade do dado é menor por definição.
    // Não bloqueamos o bilhete inteiro por isso: a safeProbability já penaliza essa incerteza
    // e o cartão continua exibindo "Dados baixa/moderada" + "Odd aproximada".
    .filter(c => profile.minReliability == null || Number(c.reliability || 0) >= (c.fallbackEstimated ? Math.min(Number(profile.minReliability), .56) : profile.minReliability))
    .filter(c => !c.isPlayerMarket || profile.minPlayerP == null || Number(c.safeProbability) >= profile.minPlayerP)
    .filter(c => !c.isPlayerMarket || profile.minPlayerReliability == null || Number(c.reliability || 0) >= profile.minPlayerReliability)
    .filter(c => c.oddType !== 'real' || profile.minRealEdgeFloor == null || Number(c.edge || 0) >= profile.minRealEdgeFloor);

  if (profile.preferRealValue) {
    const positives = pool.filter(c => c.oddType === 'real' && Number(c.edge || 0) >= profile.minEdge);
    if (positives.length) pool = [...positives, ...pool.filter(c => !positives.includes(c))];
  }

  if ((forceFallback || !pool.length) && profile.allowFallback) {
    const fallback = source
      .filter(c => Number(c.safeProbability) >= Math.max(.36, profile.minP - .08))
      .filter(c => profile.maxP == null || Number(c.safeProbability) <= profile.maxP + .05)
      .filter(c => Number(c.safeFairOdd) >= 1.04 && Number(c.safeFairOdd) <= profile.maxFair + .55)
      .filter(c => profile.minReliability == null || Number(c.reliability || 0) >= (c.fallbackEstimated ? Math.min(Number(profile.minReliability), .56) : profile.minReliability))
      .filter(c => !c.isPlayerMarket || profile.minPlayerP == null || Number(c.safeProbability) >= profile.minPlayerP)
      .filter(c => !c.isPlayerMarket || profile.minPlayerReliability == null || Number(c.reliability || 0) >= profile.minPlayerReliability)
      .filter(c => c.oddType !== 'real' || profile.minRealEdgeFloor == null || Number(c.edge || 0) >= profile.minRealEdgeFloor);
    if (forceFallback) {
      const seen = new Set(pool.map(c => `${c.key}|${c.selection}`));
      pool = [...pool, ...fallback.filter(c => !seen.has(`${c.key}|${c.selection}`))];
    } else {
      pool = fallback;
    }
  }
  return pool;
}

function bestPerMatch(matches, profile, usedSelections = new Set(), usedArchetypes = new Map()) {
  const familyCounts = new Map();
  const archetypeCounts = new Map();

  const rows = matches
    .map(match => ({ match, pool: allCandidates(match, profile) }))
    .filter(row => row.pool.length)
    .map(row => {
      row.pool.sort((a,b) => profile.score(b) - profile.score(a));
      row.bestScore = profile.score(row.pool[0]);
      return row;
    })
    .sort((a,b) => b.bestScore - a.bestScore);

  const picked = [];
  for (const { match, pool } of rows) {
    const scorePool = list => {
      let scored = list.map(c => {
        const alreadyUsed = usedSelections.has(`${c.matchKey}|${c.selection}`);
        const exactPenalty = alreadyUsed ? profile.repeatPenalty : 0;
        const priorArchetypeUses = Number(usedArchetypes.get(c.archetype) || 0);
        const archetypePenalty = priorArchetypeUses * Number(profile.archetypeRepeatPenalty || 0);
        return { c, alreadyUsed, score: profile.score(c) - exactPenalty - archetypePenalty };
      }).sort((a,b) => b.score - a.score);
      if (profile.hardAvoidUsed && scored.some(x => !x.alreadyUsed)) scored = scored.filter(x => !x.alreadyUsed);
      return scored;
    };

    let scored = scorePool(pool);

    // Primeiro tenta respeitar a diversidade do próprio bilhete.
    let chosen = scored.find(({c}) =>
      Number(familyCounts.get(c.family) || 0) < Number(profile.maxSameFamily ?? 99) &&
      Number(archetypeCounts.get(c.archetype) || 0) < Number(profile.maxSameArchetype ?? 99)
    )?.c;

    // Se o filtro principal só trouxe, por exemplo, Over 0.5 em todos os jogos,
    // amplia um pouco a faixa de probabilidade para procurar OUTRO mercado antes de repetir.
    if (!chosen && profile.allowFallback) {
      scored = scorePool(allCandidates(match, profile, true));
      chosen = scored.find(({c}) =>
        Number(familyCounts.get(c.family) || 0) < Number(profile.maxSameFamily ?? 99) &&
        Number(archetypeCounts.get(c.archetype) || 0) < Number(profile.maxSameArchetype ?? 99)
      )?.c;
    }

    // Se ainda não houver alternativa, relaxa somente a família, mas evita repetir a mesma linha.
    if (!chosen) {
      chosen = scored.find(({c}) =>
        Number(archetypeCounts.get(c.archetype) || 0) < Number(profile.maxSameArchetype ?? 99)
      )?.c;
    }

    // Último fallback: melhor opção disponível. Assim o app não fica sem bilhete
    // quando todos os jogos realmente só oferecem o mesmo tipo de mercado.
    if (!chosen && profile.allowDiversityFallback !== false) chosen = scored[0]?.c;
    if (!chosen) continue;

    picked.push(chosen);
    familyCounts.set(chosen.family, Number(familyCounts.get(chosen.family) || 0) + 1);
    archetypeCounts.set(chosen.archetype, Number(archetypeCounts.get(chosen.archetype) || 0) + 1);
  }

  return picked.sort((a,b) => profile.score(b) - profile.score(a));
}

function chooseLegs(candidates, profile) {
  const legs = [];
  let combined = 1;
  const familyCounts = new Map();
  const archetypeCounts = new Map();

  const reachedTarget = () => legs.length >= profile.minLegs && combined >= profile.targetMin;
  const canFitOdd = c => {
    const next = combined * candidatePrice(c);
    if (profile.strictTargetRange) return next <= profile.targetMax;
    return !(next > profile.targetMax && legs.length >= profile.minLegs);
  };
  const add = c => {
    legs.push(c);
    combined *= candidatePrice(c);
    familyCounts.set(c.family, Number(familyCounts.get(c.family) || 0) + 1);
    archetypeCounts.set(c.archetype, Number(archetypeCounts.get(c.archetype) || 0) + 1);
  };

  // 1) Monta o bilhete respeitando a diversidade máxima do perfil.
  for (const c of candidates) {
    if (legs.length >= profile.maxLegs || reachedTarget()) break;
    if (Number(familyCounts.get(c.family) || 0) >= Number(profile.maxSameFamily ?? 99)) continue;
    if (Number(archetypeCounts.get(c.archetype) || 0) >= Number(profile.maxSameArchetype ?? 99)) continue;
    if (!canFitOdd(c)) continue;
    add(c);
  }

  // 2) Se faltou perna/odd, permite repetir a família, mas não a MESMA linha.
  if (!reachedTarget() && legs.length < profile.maxLegs) {
    for (const c of candidates) {
      if (legs.includes(c) || legs.length >= profile.maxLegs || reachedTarget()) break;
      if (Number(archetypeCounts.get(c.archetype) || 0) >= Number(profile.maxSameArchetype ?? 99)) continue;
      if (!canFitOdd(c)) continue;
      add(c);
    }
  }

  // 3) Último recurso: completa o mínimo mesmo se só houver mercados iguais.
  if (legs.length < profile.minLegs) {
    for (const c of candidates) {
      if (legs.includes(c) || legs.length >= profile.minLegs || legs.length >= profile.maxLegs) continue;
      if (profile.strictTargetRange && !canFitOdd(c)) continue;
      add(c);
    }
  }

  return legs;
}

function chooseStrictRangeLegs(matches, profile, usedSelections = new Set(), usedArchetypes = new Map()) {
  // Beam search por SELEÇÃO (não por partida). Assim o Bilhete Plus pode usar várias
  // escolhas da mesma partida quando elas são compatíveis e reforçam o mesmo cenário.
  const items = [];
  for (const match of matches) {
    let pool = allCandidates(match, profile, true)
      .map(c => {
        const alreadyUsed = usedSelections.has(`${c.matchKey}|${c.selection}`);
        const repeat = alreadyUsed ? Number(profile.repeatPenalty || 0) : 0;
        const archetypeRepeat = Number(usedArchetypes.get(c.archetype) || 0) * Number(profile.archetypeRepeatPenalty || 0);
        const playerBonus = c.isPlayerMarket ? Number(profile.playerMarketBonus || 0) : 0;
        return { c, alreadyUsed, score: profile.score(c) - repeat - archetypeRepeat + playerBonus };
      })
      .sort((a,b) => b.score - a.score);
    if (profile.hardAvoidUsed && pool.some(x => !x.alreadyUsed)) pool = pool.filter(x => !x.alreadyUsed);
    const top = pool.slice(0, Math.min(10, Number(profile.optionsPerMatch || 8)));
    const player = pool.find(x => x.c.isPlayerMarket);
    if (player && !top.some(x => x.c === player)) top.push(player);
    items.push(...top);
  }
  items.sort((a,b) => b.score - a.score);

  let states = [{ legs: [], combined: 1, safeJoint: 1, score: 0, families: new Map(), archetypes: new Map(), playerLegs: 0 }];
  const beamWidth = Number(profile.beamWidth || 700);

  for (const item of items) {
    const next = [...states];
    for (const state of states) {
      if (state.legs.length >= profile.maxLegs) continue;
      const c = item.c;
      if (!canAddSameMatch(state.legs, c, profile)) continue;
      if (Number(state.families.get(c.family) || 0) >= Number(profile.maxSameFamily ?? 99)) continue;
      if (Number(state.archetypes.get(c.archetype) || 0) >= Number(profile.maxSameArchetype ?? 99)) continue;

      const legs = [...state.legs, c];
      const combined = combinedPriceForLegs(legs, profile);
      if (combined > profile.targetMax + 1e-9) continue;

      const families = new Map(state.families);
      const archetypes = new Map(state.archetypes);
      families.set(c.family, Number(families.get(c.family) || 0) + 1);
      archetypes.set(c.archetype, Number(archetypes.get(c.archetype) || 0) + 1);
      const withinFamilyPenalty = Number(state.families.get(c.family) || 0) * Number(profile.withinFamilyPenalty || 0);
      const withinArchetypePenalty = Number(state.archetypes.get(c.archetype) || 0) * Number(profile.withinArchetypePenalty || 0);
      const same = state.legs.filter(l => l.matchKey === c.matchKey);
      const coherenceBonus = same.reduce((sum,l) => sum + Math.max(0, pairCoherence(l,c)), 0) * Number(profile.coherenceWeight || 2.5);

      next.push({
        legs,
        combined,
        safeJoint: safeJointForLegs(legs, profile),
        score: state.score + item.score - withinFamilyPenalty - withinArchetypePenalty + coherenceBonus,
        families,
        archetypes,
        playerLegs: state.playerLegs + (c.isPlayerMarket ? 1 : 0)
      });
    }

    const center = Number(profile.targetCenter || ((profile.targetMin + profile.targetMax) / 2));
    states = next.sort((a,b) => {
      const hitWeight = Number(profile.hitRateWeight || 0);
      const qa = a.score + Math.min(a.legs.length, profile.minLegs) * 28 + Math.log(Math.max(a.safeJoint, .000001)) * hitWeight - Math.abs(Math.min(a.combined, profile.targetMax) - center) * 2 + Math.min(a.playerLegs, Number(profile.minPlayerLegs || 0)) * 20;
      const qb = b.score + Math.min(b.legs.length, profile.minLegs) * 28 + Math.log(Math.max(b.safeJoint, .000001)) * hitWeight - Math.abs(Math.min(b.combined, profile.targetMax) - center) * 2 + Math.min(b.playerLegs, Number(profile.minPlayerLegs || 0)) * 20;
      return qb - qa;
    }).slice(0, beamWidth);
  }

  const valid = states.filter(s =>
    s.legs.length >= profile.minLegs &&
    s.legs.length <= profile.maxLegs &&
    s.combined >= profile.targetMin - 1e-9 &&
    s.combined <= profile.targetMax + 1e-9 &&
    s.playerLegs >= Number(profile.minPlayerLegs || 0) &&
    (!profile.requiredPlayerGroup || s.legs.some(l => l.isPlayerMarket && playerMarketGroup(l) === profile.requiredPlayerGroup))
  );
  const relaxedPlayer = valid.length ? valid : states.filter(s =>
    s.legs.length >= profile.minLegs &&
    s.legs.length <= profile.maxLegs &&
    s.combined >= profile.targetMin - 1e-9 &&
    s.combined <= profile.targetMax + 1e-9
  );

  const center = Number(profile.targetCenter || ((profile.targetMin + profile.targetMax) / 2));
  const preferredMin = Number(profile.preferredTargetMin ?? profile.targetMin);
  const preferredMax = Number(profile.preferredTargetMax ?? profile.targetMax);
  const preferred = relaxedPlayer.filter(s => s.combined >= preferredMin - 1e-9 && s.combined <= preferredMax + 1e-9);
  const finalists = preferred.length ? preferred : relaxedPlayer;
  return finalists.sort((a,b) => {
    const hitWeight = Number(profile.hitRateWeight || 0);
    const qa = a.score + Math.log(Math.max(a.safeJoint, .000001)) * hitWeight - Math.abs(a.combined - center) * Number(profile.targetClosenessPenalty || 4) + Math.min(a.playerLegs, Number(profile.minPlayerLegs || 0)) * 25;
    const qb = b.score + Math.log(Math.max(b.safeJoint, .000001)) * hitWeight - Math.abs(b.combined - center) * Number(profile.targetClosenessPenalty || 4) + Math.min(b.playerLegs, Number(profile.minPlayerLegs || 0)) * 25;
    return qb - qa;
  })[0]?.legs || [];
}


function rangeRecoveryPool(match, profile, usedSelections = new Set(), usedArchetypes = new Map()) {
  const pool = allCandidates(match, profile, true).map(c => {
    const exactRepeat = usedSelections.has(`${c.matchKey}|${c.selection}`) ? Number(profile.repeatPenalty || 0) : 0;
    const archetypeRepeat = Number(usedArchetypes.get(c.archetype) || 0) * Number(profile.archetypeRepeatPenalty || 0);
    const playerBonus = c.isPlayerMarket ? Number(profile.playerMarketBonus || 0) : 0;
    return { c, score: profile.score(c) - exactRepeat - archetypeRepeat + playerBonus };
  });
  if (!pool.length) return [];

  const selected = [];
  const add = row => { if (row && !selected.some(x => x.c === row.c)) selected.push(row); };
  // Qualidade: mantém os mercados mais fortes.
  [...pool].sort((a,b) => b.score - a.score).slice(0,4).forEach(add);
  // Alcance: mantém também odds maiores, necessárias para os perfis 4+, 6+ e 8+.
  [...pool].sort((a,b) => candidatePrice(b.c) - candidatePrice(a.c) || b.score - a.score).slice(0,4).forEach(add);
  // Diversidade: não deixa uma única família (ex.: chutes) ocupar todo o corte.
  const byFamily = new Map();
  for (const row of [...pool].sort((a,b) => b.score - a.score)) if (!byFamily.has(row.c.family)) byFamily.set(row.c.family,row);
  [...byFamily.values()].slice(0,5).forEach(add);
  const player = [...pool].filter(x => x.c.isPlayerMarket).sort((a,b)=>b.score-a.score)[0];
  add(player);
  return selected.slice(0,12);
}

function chooseTargetRangeRecovery(matches, profile, usedSelections = new Set(), usedArchetypes = new Map()) {
  const items = matches.flatMap(match => rangeRecoveryPool(match, profile, usedSelections, usedArchetypes));
  if (!items.length) return [];

  // Ordenação estável por odd/qualidade. A busca abaixo é por quantidade de pernas e
  // conserva só os caminhos que mais se aproximam da subfaixa interna desejada.
  items.sort((a,b) => candidatePrice(b.c) - candidatePrice(a.c) || b.score - a.score);
  const center = Number(profile.targetCenter || ((Number(profile.targetMin || 1) + Number(profile.targetMax || 1)) / 2));
  const targetMin = Number(profile.targetMin || 1);
  const targetMax = Number(profile.targetMax || Number.POSITIVE_INFINITY);
  const beam = Math.max(120, Math.min(420, Number(profile.beamWidth || 240)));
  const minPlayerLegs = Number(profile.minPlayerLegs || 0);

  const stateRank = state => {
    const odd = Math.max(1, state.combined);
    const distance = odd < targetMin
      ? Math.log(Math.max(targetMin / odd, 1))
      : Math.abs(Math.log(Math.max(odd / Math.max(center,1.01), .000001)));
    const avgScore = state.legs.length ? state.score / state.legs.length : 0;
    const playerBoost = Math.min(state.playerLegs, minPlayerLegs) * 16;
    // A distância para a faixa pesa mais do que a preferência por odds minúsculas.
    return -distance * 180 + avgScore * .22 + playerBoost;
  };

  let states = [{ legs:[], combined:1, score:0, last:-1, families:new Map(), archetypes:new Map(), playerLegs:0 }];
  let bestValid = [];

  for (let depth=0; depth < Number(profile.maxLegs || 1); depth++) {
    const next = [];
    for (const state of states) {
      for (let i=state.last+1; i<items.length; i++) {
        const {c,score} = items[i];
        if (!canAddSameMatch(state.legs,c,profile)) continue;
        if (Number(state.families.get(c.family) || 0) >= Number(profile.maxSameFamily ?? 99)) continue;
        if (Number(state.archetypes.get(c.archetype) || 0) >= Number(profile.maxSameArchetype ?? 99)) continue;
        const legs=[...state.legs,c];
        const combined=combinedPriceForLegs(legs,profile);
        if (combined > targetMax + 1e-9) continue;
        const families=new Map(state.families), archetypes=new Map(state.archetypes);
        families.set(c.family,Number(families.get(c.family)||0)+1);
        archetypes.set(c.archetype,Number(archetypes.get(c.archetype)||0)+1);
        const same=state.legs.filter(l=>l.matchKey===c.matchKey);
        const coherence=same.reduce((sum,l)=>sum+Math.max(0,pairCoherence(l,c)),0)*Number(profile.coherenceWeight||2.5);
        const candidate={legs,combined,score:state.score+score+coherence,last:i,families,archetypes,playerLegs:state.playerLegs+(c.isPlayerMarket?1:0)};
        next.push(candidate);
        if (legs.length >= Number(profile.minLegs || 1) && combined >= targetMin-1e-9 && combined <= targetMax+1e-9) bestValid.push(candidate);
      }
    }
    if (bestValid.length) break;
    if (!next.length) break;

    // Mantém caminhos em zonas diferentes de odd para não matar cedo a rota que chega
    // à faixa-alvo. Isso evita o bug em que só Conservador aparecia.
    const bucketCount=12;
    const cap=Number.isFinite(targetMax)?Math.max(1.05,targetMax):Math.max(16,center*1.6);
    const maxLog=Math.log(cap);
    const buckets=Array.from({length:bucketCount},()=>[]);
    for (const state of next) {
      const ratio=maxLog>0?Math.log(Math.max(1,Math.min(state.combined,cap)))/maxLog:0;
      const idx=Math.max(0,Math.min(bucketCount-1,Math.floor(ratio*bucketCount)));
      buckets[idx].push(state);
    }
    const perBucket=Math.max(5,Math.ceil(beam/bucketCount));
    states=buckets.flatMap(bucket=>bucket.sort((a,b)=>stateRank(b)-stateRank(a)).slice(0,perBucket))
      .sort((a,b)=>stateRank(b)-stateRank(a)).slice(0,beam);
  }

  if (!bestValid.length) return [];
  let valid=bestValid.filter(s => s.playerLegs >= minPlayerLegs && (!profile.requiredPlayerGroup || s.legs.some(l=>l.isPlayerMarket && playerMarketGroup(l)===profile.requiredPlayerGroup)));
  if (!valid.length) valid=bestValid;
  return valid.sort((a,b)=>stateRank(b)-stateRank(a))[0]?.legs || [];
}

function makeTicket(name, matches, profile, usedSelections, usedArchetypes) {
  const choices = profile.strictTargetRange ? [] : bestPerMatch(matches, profile, usedSelections, usedArchetypes);
  let legs = profile.strictTargetRange
    ? chooseStrictRangeLegs(matches, profile, usedSelections, usedArchetypes)
    : chooseLegs(choices, profile);
  // Recuperação orientada à faixa: se a busca principal privilegiar odds muito pequenas
  // e não chegar ao alvo, tenta uma segunda busca com os mesmos filtros de qualidade,
  // preservando candidatos capazes de acumular a odd necessária.
  if (profile.strictTargetRange && !legs.length) {
    legs = chooseTargetRangeRecovery(matches, profile, usedSelections, usedArchetypes);
  }
  // Se o perfil pede prop de jogador e há props utilizáveis, prefere a rota que realmente
  // inclui jogador. A busca principal pode encontrar primeiro uma múltipla só de equipe.
  if (profile.strictTargetRange && Number(profile.minPlayerLegs || 0) > 0 && legs.length && !legs.some(l => l.isPlayerMarket)) {
    const hasPlayerCandidate = matches.some(match => allCandidates(match, profile, true).some(c => c.isPlayerMarket));
    if (hasPlayerCandidate) {
      const playerLegs = chooseTargetRangeRecovery(matches, profile, usedSelections, usedArchetypes);
      if (playerLegs.some(l => l.isPlayerMarket)) legs = playerLegs;
    }
  }
  if (!legs.length) return null;
  const combinedOdd = combinedPriceForLegs(legs, profile);
  if (profile.strictTargetRange && (combinedOdd < profile.targetMin - 1e-9 || combinedOdd > profile.targetMax + 1e-9)) return null;
  const modelJointProbability = safeJointForLegs(legs, profile, true);
  const jointProbability = safeJointForLegs(legs, profile, false);
  const fairCombinedOdd = 1 / Math.max(jointProbability, .000001);
  const avgProbability = legs.reduce((s,l) => s + Number(l.safeProbability || l.probability || 0), 0) / legs.length;
  const weakest = [...legs].sort((a,b) => Number(a.safeProbability || a.probability) - Number(b.safeProbability || b.probability))[0];
  const hasRealValue = legs.some(l => l.oddType === 'real' && Number(l.edge || 0) >= .02);
  const avgReliability = legs.reduce((sum,l) => sum + Number(l.reliability || 0), 0) / legs.length;
  const minSafeProbability = Math.min(...legs.map(l => Number(l.safeProbability || l.probability || 0)));
  const realEdges = legs.filter(l => l.oddType === 'real').map(l => Number(l.edge || 0));
  const worstRealEdge = realEdges.length ? Math.min(...realEdges) : null;
  const foundation = avgReliability >= .88 && minSafeProbability >= .56 && (worstRealEdge == null || worstRealEdge >= -.02)
    ? 'forte'
    : avgReliability >= .80 && minSafeProbability >= .50 && (worstRealEdge == null || worstRealEdge >= -.05)
      ? 'boa'
      : 'moderada';
  for (const leg of legs) {
    usedSelections.add(`${leg.matchKey}|${leg.selection}`);
    usedArchetypes.set(leg.archetype, Number(usedArchetypes.get(leg.archetype) || 0) + 1);
  }
  return {
    name,
    profile: profile.key || name.toLowerCase().replace(/\s+/g,'-'),
    risk: profile.risk || riskOf(legs, fairCombinedOdd, jointProbability),
    combinedOdd: decimal(combinedOdd),
    fairCombinedOdd: decimal(fairCombinedOdd),
    combinedOddType: legs.every(l => l.oddType === 'real') ? 'real' : (legs.some(l => l.oddType === 'real') ? 'mista' : 'estimada'),
    jointProbability: decimal(jointProbability),
    modelJointProbability: decimal(modelJointProbability),
    avgProbability: decimal(avgProbability),
    weakest: weakest ? { selection: weakest.selection, probability: Number(weakest.safeProbability || weakest.probability), modelProbability: Number(weakest.probability), match: weakest.match } : null,
    correlation: correlationOf(legs),
    dataConfidence: confidenceOf(legs),
    foundation,
    avgReliability: decimal(avgReliability),
    minSafeProbability: decimal(minSafeProbability),
    worstRealEdge: worstRealEdge == null ? null : decimal(worstRealEdge),
    hasRealValue,
    targetRange: profile.targetLabel || (profile.strictTargetRange ? `${profile.targetMin.toFixed(2)}–${profile.targetMax.toFixed(2)}` : null),
    legs
  };
}

function ticketProfiles() {
  const common = {
    strictTargetRange:true,
    allowFallback:false,
    preferRealValue:false,
    maxSameArchetype:2,
    sameMatchOddFactor:.92,
    correlationProbabilityFactor:.95,
    coherenceWeight:2.6,
    allowDiversityFallback:true
  };
  return {
    conservador: {
      ...common, key:'conservador', risk:'baixo', targetLabel:'até 1.99',
      minP:.72, minFair:1.01, maxFair:1.60, minReliability:.68, minLegs:1, maxLegs:3, maxSameMatch:3, maxSameArchetype:2,
      targetMin:1.01, targetMax:1.99, preferredTargetMin:1.18, preferredTargetMax:1.82, targetCenter:1.52, targetClosenessPenalty:15,
      optionsPerMatch:12, beamWidth:900, hitRateWeight:92, repeatPenalty:42, archetypeRepeatPenalty:20,
      maxSameFamily:2, withinFamilyPenalty:5, withinArchetypePenalty:22,
      score:c => c.safeProbability*c.reliability*235 - Math.abs(c.safeFairOdd-1.20)*25 + (c.oddType==='real' ? Math.max(-.02,Number(c.edge||0))*10 : 0)
    },
    valor: {
      ...common, key:'valor', risk:'médio', targetLabel:'2.00–4.00',
      minP:.57, minFair:1.04, maxFair:2.25, minReliability:.70, minLegs:2, maxLegs:8, maxSameMatch:4, maxSameArchetype:8,
      targetMin:2.00, targetMax:4.00, preferredTargetMin:2.20, preferredTargetMax:3.55, targetCenter:2.85, targetClosenessPenalty:11,
      optionsPerMatch:14, beamWidth:1250, hitRateWeight:64, playerMarketBonus:12, minPlayerLegs:1,
      minPlayerP:.55, minPlayerReliability:.78, minEdge:.01, preferRealValue:true, repeatPenalty:72, archetypeRepeatPenalty:28,
      maxSameFamily:8,
      score:c => (c.oddType==='real'?Math.max(-.04,Number(c.edge||0))*130:0) + c.safeProbability*c.reliability*125 + Math.min(c.safeFairOdd,2.2)*6 + (c.isPlayerMarket&&c.safeProbability>=.55?14:0)
    },
    arriscado: {
      ...common, key:'arriscado', risk:'alto', targetLabel:'4.00–6.00', allowFallback:false,
      minP:.53, maxP:null, minFair:1.04, maxFair:2.45, minReliability:.76, minLegs:3, maxLegs:10, maxSameMatch:4, maxSameArchetype:10,
      minPlayerP:.53, minPlayerReliability:.80, minRealEdgeFloor:-.05,
      targetMin:4.00, targetMax:6.00, preferredTargetMin:4.15, preferredTargetMax:5.55, targetCenter:4.85, targetClosenessPenalty:10,
      optionsPerMatch:15, beamWidth:1500, hitRateWeight:58, playerMarketBonus:6,
      repeatPenalty:105, archetypeRepeatPenalty:38, maxSameFamily:10,
      score:c => c.safeProbability*c.reliability*124 + Math.min(c.safeFairOdd,2.4)*8 + (c.reliability>=.88?10:0) + (c.isPlayerMarket&&c.safeProbability>=.55?7:0) + (c.oddType==='real'?Math.max(-.05,Number(c.edge||0))*28:0)
    },
    'muito-arriscado': {
      ...common, key:'muito-arriscado', risk:'alto', targetLabel:'6.00–8.00', allowFallback:false,
      minP:.52, maxP:null, minFair:1.04, maxFair:2.50, minReliability:.78, minLegs:3, maxLegs:12, maxSameMatch:4, maxSameArchetype:12,
      minPlayerP:.52, minPlayerReliability:.82, minRealEdgeFloor:-.05,
      targetMin:6.00, targetMax:8.00, preferredTargetMin:6.10, preferredTargetMax:7.70, targetCenter:6.90, targetClosenessPenalty:9,
      optionsPerMatch:16, beamWidth:1800, hitRateWeight:55, playerMarketBonus:6,
      repeatPenalty:125, archetypeRepeatPenalty:44, maxSameFamily:12,
      score:c => c.safeProbability*c.reliability*128 + Math.min(c.safeFairOdd,2.5)*7 + (c.reliability>=.88?11:0) + (c.isPlayerMarket&&c.safeProbability>=.54?6:0) + (c.oddType==='real'?Math.max(-.05,Number(c.edge||0))*30:0)
    },
    jackpot: {
      ...common, key:'jackpot', risk:'alto', targetLabel:'8.00+', allowFallback:false,
      minP:.45, maxP:null, minFair:1.04, maxFair:2.80, minReliability:.80, minLegs:4, maxLegs:16, maxSameMatch:4, maxSameArchetype:16,
      minPlayerP:.46, minPlayerReliability:.84, minRealEdgeFloor:-.04,
      targetMin:8.00, targetMax:Number.POSITIVE_INFINITY, preferredTargetMin:8.20, preferredTargetMax:12.50, targetCenter:9.80, targetClosenessPenalty:8,
      optionsPerMatch:18, beamWidth:2200, hitRateWeight:52, playerMarketBonus:5,
      repeatPenalty:145, archetypeRepeatPenalty:50, maxSameFamily:16,
      score:c => c.safeProbability*c.reliability*132 + Math.min(c.safeFairOdd,2.6)*7 + (c.reliability>=.90?12:0) + (c.isPlayerMarket&&c.safeProbability>=.54?5:0) + (c.oddType==='real'?Math.max(-.04,Number(c.edge||0))*32:0)
    }
  };
}

const INTERNAL_ODD_BANDS = {
  // Essas faixas são deliberadamente internas. A interface continua exibindo apenas
  // Conservador / Valor / Arriscado / Muito Arriscado / Jackpot e "Bilhete 1/2/3".
  conservador: [
    { min:1.01, max:1.33, center:1.20, maxLegs:3 },
    { min:1.34, max:1.66, center:1.50, maxLegs:4 },
    { min:1.67, max:1.99, center:1.83, maxLegs:5 }
  ],
  valor: [
    { min:2.00, max:2.66, center:2.32, maxLegs:6 },
    { min:2.67, max:3.33, center:3.00, maxLegs:7 },
    { min:3.34, max:4.00, center:3.67, maxLegs:8 }
  ],
  arriscado: [
    { min:4.00, max:4.66, center:4.33, maxLegs:8 },
    { min:4.67, max:5.33, center:5.00, maxLegs:9 },
    { min:5.34, max:6.00, center:5.67, maxLegs:10 }
  ],
  'muito-arriscado': [
    { min:6.00, max:6.66, center:6.33, maxLegs:9 },
    { min:6.67, max:7.33, center:7.00, maxLegs:10 },
    { min:7.34, max:8.00, center:7.67, maxLegs:11 }
  ],
  jackpot: [
    { min:8.00, max:9.99, center:8.90, maxLegs:12 },
    { min:10.00, max:11.99, center:10.90, maxLegs:14 },
    { min:12.00, max:Number.POSITIVE_INFINITY, center:14.00, maxLegs:16 }
  ]
};

function profileBand(profile, key, bandIndex) {
  const band = INTERNAL_ODD_BANDS[key]?.[bandIndex];
  if (!band) return { ...profile };
  const searchWeights = {
    conservador:{ hit:88, close:18, beam:100 },
    valor:{ hit:46, close:18, beam:160 },
    arriscado:{ hit:30, close:20, beam:220 },
    'muito-arriscado':{ hit:20, close:22, beam:280 },
    jackpot:{ hit:12, close:24, beam:360 }
  }[key] || {};
  return {
    ...profile,
    targetMin:band.min,
    targetMax:band.max,
    preferredTargetMin:band.min,
    preferredTargetMax:Number.isFinite(band.max) ? band.max : 16,
    targetCenter:band.center,
    maxLegs:Math.max(Number(profile.maxLegs || 1), Number(band.maxLegs || 1)),
    hitRateWeight:Number(searchWeights.hit ?? profile.hitRateWeight),
    targetClosenessPenalty:Number(searchWeights.close ?? profile.targetClosenessPenalty),
    beamWidth:Number(searchWeights.beam || profile.beamWidth || 700),
    // O nome/faixa mostrados na tela continuam sendo os do perfil completo.
    // A subdivisão nunca é devolvida à interface.
    targetLabel:profile.targetLabel
  };
}

function representativeTicket(name, matches, profile, key) {
  // Para endpoints legados que esperam um bilhete por perfil, tenta primeiro a faixa
  // intermediária e depois as outras. Cada perfil é independente: Conservador não
  // "rouba" seleções do Valor/Arriscado.
  for (const bandIndex of [1,0,2]) {
    const candidate = makeTicket(name, matches, profileBand(profile,key,bandIndex), new Set(), new Map());
    if (candidate) return candidate;
  }
  return null;
}

export function buildTickets(matches) {
  const prematchMatches = onlyPrematch(matches);
  if (!prematchMatches.length) return [];
  const profiles = ticketProfiles();
  return [
    representativeTicket('Conservador', prematchMatches, profiles.conservador, 'conservador'),
    representativeTicket('Valor', prematchMatches, profiles.valor, 'valor'),
    representativeTicket('Arriscado', prematchMatches, profiles.arriscado, 'arriscado'),
    representativeTicket('Muito Arriscado', prematchMatches, profiles['muito-arriscado'], 'muito-arriscado'),
    representativeTicket('Jackpot', prematchMatches, profiles.jackpot, 'jackpot')
  ].filter(Boolean);
}

function ticketSignature(ticket) {
  return (ticket?.legs || []).map(l => `${l.matchKey || l.match}|${l.selection}`).sort().join('||');
}

function seedUsedFromTicket(ticket) {
  const selections = new Set();
  const archetypes = new Map();
  for (const leg of ticket?.legs || []) {
    selections.add(`${leg.matchKey}|${leg.selection}`);
    archetypes.set(leg.archetype, Number(archetypes.get(leg.archetype) || 0) + 1);
  }
  return { selections, archetypes };
}

/**
 * Retorna até 3 opções REAIS por perfil para a interface em carrossel.
 * A primeira sugestão de cada perfil continua sendo a mesma de buildTickets().
 * As opções extras usam exatamente os mesmos filtros do perfil; apenas recebem
 * uma penalidade maior para repetir seleções já usadas, para oferecer alternativas
 * sem transformar o carrossel em cópias do mesmo bilhete.
 */
export function buildTicketGroups(matches, maxPerProfile = 3) {
  const prematchMatches = onlyPrematch(matches);
  if (!prematchMatches.length) return {};

  const profiles = ticketProfiles();
  const groups = {};
  const definitions = [
    { key:'conservador', name:'Conservador', risk:'baixo' },
    { key:'valor', name:'Valor', risk:'médio' },
    { key:'arriscado', name:'Arriscado', risk:'alto' },
    { key:'muito-arriscado', name:'Muito Arriscado', risk:'alto' },
    { key:'jackpot', name:'Jackpot', risk:'alto' }
  ];

  const rawPlayerMarkets = prematchMatches.flatMap(match =>
    [...(match.opportunities || []), ...(match.estimatedMarkets || [])].filter(isPlayerMarket)
  );
  const availablePlayerGroups = [...new Set(rawPlayerMarkets.map(playerMarketGroup).filter(Boolean))];

  for (const definition of definitions) {
    const profile = profiles[definition.key];
    if (!profile) continue;
    const options = [];
    const usedSelections = new Set();
    const usedArchetypes = new Map();
    const wanted = Math.min(3, Math.max(1, Number(maxPerProfile || 3)));

    for (let bandIndex = 0; bandIndex < wanted; bandIndex++) {
      let bandProfile = profileBand(profile, definition.key, bandIndex);

      // Quando há dados reais de jogadores, tenta colocar um mercado de jogador em
      // pelo menos uma das três opções do perfil sem alterar a faixa final de odd.
      // A categoria gira entre ataque/duelo/goleiro para não concentrar tudo em defesas.
      if (definition.key !== 'conservador' && availablePlayerGroups.length) {
        const preferredGroup = availablePlayerGroups[bandIndex % availablePlayerGroups.length];
        const baseScore = bandProfile.score;
        bandProfile = {
          ...bandProfile,
          minPlayerLegs: bandIndex === 1 ? 1 : Number(bandProfile.minPlayerLegs || 0),
          requiredPlayerGroup: bandIndex === 1 ? preferredGroup : undefined,
          playerMarketBonus:Math.max(Number(bandProfile.playerMarketBonus || 0), bandIndex === 1 ? 40 : 12),
          score:c => baseScore(c) + (c.isPlayerMarket ? (playerMarketGroup(c) === preferredGroup ? 70 : 12) : 0)
        };
      }

      let ticket = makeTicket(definition.name, prematchMatches, bandProfile, usedSelections, usedArchetypes);

      // Se a preferência por jogador impedir a faixa, tenta de novo sem obrigar prop.
      // Isso preserva a regra principal: nunca forçar um mercado sem base suficiente.
      if (!ticket && bandProfile.requiredPlayerGroup) {
        const retry = { ...bandProfile, minPlayerLegs:0, requiredPlayerGroup:undefined };
        ticket = makeTicket(definition.name, prematchMatches, retry, usedSelections, usedArchetypes);
      }

      // Última tentativa: mantém a mesma exigência de probabilidade/confiabilidade,
      // mas permite mais pernas. Isso é útil quando o dia oferece apenas odds pequenas
      // e o perfil precisa chegar a 2–4, 4–6 etc. pela combinação de seleções fortes.
      if (!ticket) {
        const retry = {
          ...profileBand(profile, definition.key, bandIndex),
          maxLegs:Math.min(14, Number(profileBand(profile, definition.key, bandIndex).maxLegs || 1) + 2),
          maxSameArchetype:Math.max(Number(profile.maxSameArchetype || 2), 5),
          maxSameFamily:Math.max(Number(profile.maxSameFamily || 2), 4)
        };
        ticket = makeTicket(definition.name, prematchMatches, retry, usedSelections, usedArchetypes);
      }

      if (ticket) {
        options.push({ ...ticket, ticketNumber:bandIndex + 1 });
      } else {
        options.push({
          name:definition.name,
          profile:definition.key,
          unavailable:true,
          ticketNumber:bandIndex + 1,
          risk:definition.risk,
          targetRange:profile.targetLabel,
          reason:`O modelo não encontrou uma combinação com indícios fortes e compatíveis dentro da faixa ${profile.targetLabel}.`
        });
      }
    }
    groups[definition.key] = options;
  }

  return groups;
}

