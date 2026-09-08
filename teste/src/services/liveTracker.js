const FINISHED = new Set(['FT', 'AET', 'PEN']);
const CANCELLED = new Set(['CANC', 'ABD', 'AWD', 'WO']);
const PREMATCH = new Set(['NS', 'TBD', 'PST']);

function cleanName(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findPlayer(snapshot, name) {
  const needle = cleanName(name);
  if (!needle) return null;
  const exact = snapshot.players?.find(p => cleanName(p.name) === needle);
  if (exact) return exact;
  return snapshot.players?.find(p => cleanName(p.name).includes(needle) || needle.includes(cleanName(p.name))) || null;
}

function minuteText(snapshot) {
  return snapshot?.elapsed !== null && snapshot?.elapsed !== undefined ? ` • ${snapshot.elapsed}'` : '';
}

function plural(value, one, many) {
  return `${value} ${Number(value) === 1 ? one : many}`;
}

function thresholdState(value, target, snapshot, unitOne = 'item', unitMany = 'itens') {
  const current = Number(value || 0);
  const needed = Math.max(1, Math.ceil(Number(target || 1)));
  const finished = FINISHED.has(snapshot?.status);
  const remaining = Math.max(0, needed - current);
  if (current >= needed) {
    return { state: 'green', current, target: needed, remaining: 0, text: `Objetivo atingido • ${current}/${needed}${minuteText(snapshot)}` };
  }
  if (finished) {
    return { state: 'red', current, target: needed, remaining, text: `Terminou em ${current}/${needed} • faltou ${plural(remaining, unitOne, unitMany)}` };
  }
  return { state: 'pending', current, target: needed, remaining, text: `Falta${remaining === 1 ? '' : 'm'} ${plural(remaining, unitOne, unitMany)} • ${current}/${needed}${minuteText(snapshot)}` };
}

function reversibleState(hit, snapshot, score, hitText, missText) {
  const finished = FINISHED.has(snapshot.status);
  if (finished) return { state: hit ? 'green' : 'red', text: `Final ${score}` };
  if (PREMATCH.has(snapshot.status)) return { state: 'waiting', text: 'Pré-jogo' };
  return hit
    ? { state: 'hitting', text: `Batendo agora • ${hitText || score}${minuteText(snapshot)}` }
    : { state: 'pending', text: `${missText || 'Ainda não bate'} • ${score}${minuteText(snapshot)}` };
}

export function evaluateLeg(leg, snapshot) {
  if (!snapshot) return { state: 'waiting', text: 'Aguardando dados do jogo' };
  if (CANCELLED.has(snapshot.status)) return { state: 'void', text: `Jogo ${snapshot.statusLong || snapshot.status}` };

  const finished = FINISHED.has(snapshot.status);
  const score = `${snapshot.goals.home}–${snapshot.goals.away}`;
  const target = Number(leg.target || 1);
  const side = leg.side === 'away' ? 'away' : 'home';
  const teamStats = snapshot.stats?.[side] || {};
  let player;

  switch (leg.market) {
    case 'home_win': {
      const hit = snapshot.goals.home > snapshot.goals.away;
      const miss = snapshot.goals.home === snapshot.goals.away ? 'Falta 1 gol da casa para ficar vencendo' : 'A casa precisa virar o placar';
      return reversibleState(hit, snapshot, score, `Casa vencendo ${score}`, miss);
    }
    case 'draw': {
      const hit = snapshot.goals.home === snapshot.goals.away;
      const diff = Math.abs(snapshot.goals.home - snapshot.goals.away);
      return reversibleState(hit, snapshot, score, `Empate ${score}`, `Falta${diff === 1 ? '' : 'm'} ${plural(diff, 'gol', 'gols')} para empatar`);
    }
    case 'away_win': {
      const hit = snapshot.goals.away > snapshot.goals.home;
      const miss = snapshot.goals.away === snapshot.goals.home ? 'Falta 1 gol do visitante para ficar vencendo' : 'O visitante precisa virar o placar';
      return reversibleState(hit, snapshot, score, `Visitante vencendo ${score}`, miss);
    }
    case 'double_chance_1x': {
      const hit = snapshot.goals.home >= snapshot.goals.away;
      const diff = Math.max(1, snapshot.goals.away - snapshot.goals.home);
      return reversibleState(hit, snapshot, score, `1X está dentro com ${score}`, `Falta${diff === 1 ? '' : 'm'} ${plural(diff, 'gol da casa', 'gols da casa')} para entrar no 1X`);
    }
    case 'double_chance_12': {
      const hit = snapshot.goals.home !== snapshot.goals.away;
      return reversibleState(hit, snapshot, score, `Sem empate com ${score}`, 'Falta sair do empate');
    }
    case 'double_chance_x2': {
      const hit = snapshot.goals.away >= snapshot.goals.home;
      const diff = Math.max(1, snapshot.goals.home - snapshot.goals.away);
      return reversibleState(hit, snapshot, score, `X2 está dentro com ${score}`, `Falta${diff === 1 ? '' : 'm'} ${plural(diff, 'gol do visitante', 'gols do visitante')} para entrar no X2`);
    }
    case 'goals_over': {
      const total = snapshot.goals.home + snapshot.goals.away;
      const required = Math.floor(target) + 1;
      const remaining = Math.max(0, required - total);
      if (total >= required) return { state: 'green', current: total, target: required, remaining: 0, text: `Objetivo atingido • ${total} gols${minuteText(snapshot)}` };
      if (finished) return { state: 'red', current: total, target: required, remaining, text: `Final com ${total} gols • precisava de ${required}` };
      return { state: 'pending', current: total, target: required, remaining, text: `Falta${remaining === 1 ? '' : 'm'} ${plural(remaining, 'gol', 'gols')} • ${total}/${required}${minuteText(snapshot)}` };
    }
    case 'goals_under': {
      const total = snapshot.goals.home + snapshot.goals.away;
      const maxAllowed = Math.ceil(target) - 1;
      if (total > maxAllowed) return { state: 'red', current: total, target: maxAllowed, remaining: 0, text: `Linha perdida • ${total} gols${minuteText(snapshot)}` };
      if (finished) return { state: 'green', current: total, target: maxAllowed, remaining: 0, text: `Objetivo atingido • Final com ${total} gols` };
      const margin = Math.max(0, maxAllowed - total);
      return { state: 'hitting', current: total, target: maxAllowed, remaining: 0, margin, text: `Batendo agora • ${total} gols • margem de ${plural(margin, 'gol', 'gols')}${minuteText(snapshot)}` };
    }
    case 'btts_yes': {
      const homeScored = snapshot.goals.home > 0;
      const awayScored = snapshot.goals.away > 0;
      if (homeScored && awayScored) return { state: 'green', text: `Objetivo atingido • Placar ${score}${minuteText(snapshot)}` };
      if (finished) return { state: 'red', text: `Final ${score} • nem os dois marcaram` };
      if (!homeScored && !awayScored) return { state: 'pending', text: `Falta 1 gol de cada time • ${score}${minuteText(snapshot)}` };
      return { state: 'pending', text: `${homeScored ? 'Falta o visitante marcar' : 'Falta a casa marcar'} • ${score}${minuteText(snapshot)}` };
    }
    case 'btts_no': {
      const failed = snapshot.goals.home > 0 && snapshot.goals.away > 0;
      if (failed) return { state: 'red', text: `Linha perdida • Placar ${score}${minuteText(snapshot)}` };
      if (finished) return { state: 'green', text: `Objetivo atingido • Final ${score}` };
      return { state: 'hitting', text: `Batendo agora • pelo menos um time segue sem marcar • ${score}${minuteText(snapshot)}` };
    }
    case 'team_goals': return thresholdState(side === 'away' ? snapshot.goals.away : snapshot.goals.home, target, snapshot, 'gol', 'gols');
    case 'team_corners': return thresholdState(teamStats.corners || 0, target, snapshot, 'escanteio', 'escanteios');
    case 'team_cards': return thresholdState((teamStats.yellow || 0) + (teamStats.red || 0), target, snapshot, 'cartão', 'cartões');
    case 'team_shots': return thresholdState(teamStats.shots || 0, target, snapshot, 'chute', 'chutes');
    case 'team_sot': return thresholdState(teamStats.shotsOnTarget || 0, target, snapshot, 'chute no gol', 'chutes no gol');
    case 'team_fouls': return thresholdState(teamStats.fouls || 0, target, snapshot, 'falta', 'faltas');
    case 'team_saves': return thresholdState(teamStats.saves || 0, target, snapshot, 'defesa', 'defesas');
    case 'player_shots':
    case 'player_sot':
    case 'player_fouls':
    case 'player_fouls_drawn':
    case 'player_saves':
    case 'player_goals':
    case 'player_card': {
      player = findPlayer(snapshot, leg.player);
      if (!player) return { state: finished ? 'red' : 'waiting', text: `Sem estatística de ${leg.player || 'jogador'}${minuteText(snapshot)}` };
      if (leg.market === 'player_card') {
        const cards = (player.yellow || 0) + (player.red || 0);
        if (cards > 0) return { state: 'green', current: cards, target: 1, remaining: 0, text: `Objetivo atingido • ${cards} cartão(ões)${minuteText(snapshot)}` };
        return finished ? { state: 'red', current: 0, target: 1, remaining: 1, text: 'Terminou sem cartão' } : { state: 'pending', current: 0, target: 1, remaining: 1, text: `Falta 1 cartão${minuteText(snapshot)}` };
      }
      const field = {
        player_shots: 'shots', player_sot: 'shotsOnTarget', player_fouls: 'foulsCommitted',
        player_fouls_drawn: 'foulsDrawn', player_saves: 'saves', player_goals: 'goals'
      }[leg.market];
      const units = {
        player_shots:['chute','chutes'], player_sot:['chute no gol','chutes no gol'], player_fouls:['falta','faltas'],
        player_fouls_drawn:['falta sofrida','faltas sofridas'], player_saves:['defesa','defesas'], player_goals:['gol','gols']
      }[leg.market];
      return { ...thresholdState(player[field] || 0, target, snapshot, units[0], units[1]), player: player.name };
    }
    default:
      return { state: 'waiting', text: 'Mercado ainda não reconhecido' };
  }
}

export function summarizeTicket(legs, snapshots) {
  const byId = new Map(snapshots.map(s => [String(s.fixtureId), s]));
  const evaluated = legs.map(leg => ({ ...leg, evaluation: evaluateLeg(leg, byId.get(String(leg.fixtureId))) }));
  const counts = evaluated.reduce((acc, leg) => {
    acc[leg.evaluation.state] = (acc[leg.evaluation.state] || 0) + 1;
    return acc;
  }, {});
  const remainingSelections = (counts.pending || 0) + (counts.waiting || 0);
  return { evaluated, counts, remainingSelections };
}
