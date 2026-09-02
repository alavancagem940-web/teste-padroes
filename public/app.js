const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const pct = p => `${((Number(p) || 0) * 100).toFixed(1)}%`;
const money = n => Number(n || 0).toFixed(2);
const safe = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

let dashboard = null;
let ticketDashboard = null;
let singleTicketDashboard = null;
let playerMarketsByMatch = {};
let activeMarketFilter = 'todos';
let liveFixtures = [];
let liveSnapshots = [];
let liveTimer = null;
let liveAutoPausedByUser = false;
let liveRefreshSeconds = 30;
let liveTicket = readJSON('live-ticket-v2', { legs: [] });
let customTicket = { legs: [] };
let savedTickets = readJSON('bp-saved-tickets-v4', []);
let activeTicketId = localStorage.getItem('bp-active-ticket-v4') || '';
let oddComparisons = readJSON('bp-odd-comparisons-v1', []);
let lastComparison = null;

function friendlyApiError(message='') {
  const text = String(message || '');
  if (/OUT_OF_USAGE_CREDITS|cota da The Odds API acabou|usage credits|quota/i.test(text)) {
    return {
      title: 'Cota de odds esgotada',
      text: 'A The Odds API ficou sem créditos. Nenhum jogo antigo será reutilizado. Renove/aguarde a cota ou troque a ODDS_API_KEY no Render para voltar a analisar odds.',
      kind: 'quota'
    };
  }
  if (/suspend|suspensa/i.test(text) && /football/i.test(text)) {
    return { title:'API-Football indisponível', text:'A conta da API-Football está suspensa. Mercados de jogadores e estatísticas ao vivo ficam pausados até reativar/trocar a chave.', kind:'football' };
  }
  return { title:'Não foi possível carregar', text:text || 'Tente novamente em instantes.', kind:'generic' };
}
function errorCard(message='') {
  const e=friendlyApiError(message);
  return `<section class="card negative api-error-card"><strong>${safe(e.title)}</strong><span>${safe(e.text)}</span></section>`;
}
function clearGameState() {
  dashboard = null;
  playerMarketsByMatch = {};
  $('#summary').innerHTML = '<span class="pill">0 jogo(s)</span><span class="pill">sem dados novos</span>';
  populateMatchSelectors([]);
}


function readJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function localToday() { const d = new Date(); const off = d.getTimezoneOffset(); return new Date(d.getTime() - off*60000).toISOString().slice(0,10); }
$('#date').value = localToday(); $('#liveDate').value = localToday(); $('#ticketDate').value = localToday(); $('#singleTicketDate').value = localToday();

function saveLiveTicket(){ localStorage.setItem('live-ticket-v2', JSON.stringify(liveTicket)); }
function saveSavedTickets(){ localStorage.setItem('bp-saved-tickets-v4', JSON.stringify(savedTickets)); localStorage.setItem('bp-active-ticket-v4', activeTicketId || ''); }

function switchTab(name) {
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'live' && (liveTicket.legs || []).length && !liveAutoPausedByUser) setTimeout(() => startLiveAuto(), 0);
}
function switchTicketTab(name) {
  $$('.ticket-panel').forEach(p => p.classList.toggle('active', p.dataset.ticketPanel === name));
  $$('.subtab').forEach(b => b.classList.toggle('active', b.dataset.ticketTab === name));
}

async function health() {
  const h = await fetch('/api/health').then(r => r.json());
  liveRefreshSeconds = Math.max(20, Math.min(30, Number(h.liveRefreshSeconds || 30)));
  $('#health').textContent = `Odds ${h.hasOddsApiKey ? '✓' : '—'} • Futebol ${h.hasApiFootballKey ? '✓' : '—'}`;
  $('#liveSourceMessage').innerHTML = h.hasApiFootballKey ? `API-Football configurada • acompanhamento ao vivo a cada ${liveRefreshSeconds}s. Se a conta estiver suspensa, o app avisará aqui sem travar as outras abas.` : `<strong>Ao vivo/jogadores:</strong> configure <code>API_FOOTBALL_KEY</code> no Render.`;
}

function legPriceText(l) {
  if (l.oddType === 'real' && l.odd) return `${safe(l.bookmaker || 'Odd real')} @ ${money(l.odd)}`;
  return `odd aproximada ${money(l.displayOdd || l.fairOdd)}`;
}
function riskClass(r='') { return String(r).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-').toLowerCase(); }
function confidenceLabel(legs=[]) {
  if (!legs.length) return '—';
  const values = legs.map(l => Number(l.reliability || (l.confidence === 'alta' ? .95 : l.confidence === 'média' ? .82 : .7)));
  const avg = values.reduce((a,b)=>a+b,0)/values.length;
  return avg >= .9 ? 'Alta' : avg >= .78 ? 'Média' : 'Baixa';
}

function findMatchForLeg(leg) {
  const matches = [...(ticketDashboard?.matches || []), ...(dashboard?.matches || [])];
  return matches.find(m => `${m.homeTeam} x ${m.awayTeam}` === leg.match) || null;
}

function enrichSavedLeg(leg) {
  const m = findMatchForLeg(leg);
  return { ...leg, fixtureId: m?.apiFixture?.fixtureId || leg.fixtureId || null, apiFixture: m?.apiFixture || leg.apiFixture || null, homeTeam: m?.homeTeam, awayTeam: m?.awayTeam, leagueKey: m?.leagueKey || leg.leagueKey || null };
}

function saveTicketObject(ticket, makeActive=true) {
  const item = {
    id: uid(),
    name: ticket.name || `Bilhete ${savedTickets.length + 1}`,
    profile: ticket.profile || 'personalizado',
    source: ticket.source || 'Bilhete Plus',
    createdAt: new Date().toISOString(),
    date: ticket.date || $('#date').value,
    risk: ticket.risk || 'médio',
    combinedOdd: Number(ticket.combinedOdd || 1),
    combinedOddType: ticket.combinedOddType || 'estimada',
    fairCombinedOdd: Number(ticket.fairCombinedOdd || (ticket.jointProbability ? 1/Number(ticket.jointProbability) : ticket.combinedOdd || 1)),
    jointProbability: Number(ticket.jointProbability || 0),
    correlation: ticket.correlation || 'baixa',
    dataConfidence: ticket.dataConfidence || confidenceLabel(ticket.legs),
    legs: (ticket.legs || []).map(enrichSavedLeg)
  };
  savedTickets.unshift(item);
  if (makeActive) activeTicketId = item.id;
  saveSavedTickets();
  renderSavedTickets();
  return item;
}

function normalizedTicketGroups(tickets, groups) {
  const order = ['conservador','valor','arriscado','muito-arriscado','jackpot'];
  const out = {};
  if (groups && typeof groups === 'object') {
    for (const key of order) if (Array.isArray(groups[key]) && groups[key].length) out[key] = groups[key];
  }
  for (const ticket of tickets || []) {
    const raw = String(ticket.profile || ticket.name || '').toLowerCase();
    const key = raw.replace(/\s+/g,'-');
    if (!out[key]?.length) out[key] = [ticket];
  }
  return order.filter(k => out[k]?.length).map(k => [k, out[k]]);
}

function ticketCard(t, profileKey, optionIndex) {
  const ticketNo = Number(t.ticketNumber || optionIndex + 1);
  const subtitle = `Bilhete ${ticketNo}`;

  if (t.unavailable) {
    return `<article class="ticket-slide profile-${safe(profileKey)} unavailable-slide" data-profile="${safe(profileKey)}" data-option="${optionIndex}" data-ticket-number="${ticketNo}">
      <div class="ticket ticket-slide-card">
        <div class="ticket-top"><div><span class="profile-label">${safe(t.name)}</span><strong class="ticket-number">${safe(subtitle)}</strong><small>Sem entrada forçada</small></div><span class="risk-pill risk-${riskClass(t.risk || 'alto')}">Risco ${safe(t.risk || 'alto')}</span></div>
        <div class="aggressive-empty"><strong>Base insuficiente nesta liga/data</strong><span>${safe(t.reason || 'Não encontrei uma combinação fundamentada dentro da faixa deste perfil.')}</span><span>Use o Mercado dos Favoritos ou escolha outra competição e gere novamente.</span></div>
      </div>
    </article>`;
  }

  return `<article class="ticket-slide profile-${safe(profileKey)}" data-profile="${safe(profileKey)}" data-option="${optionIndex}" data-ticket-number="${ticketNo}">
      <div class="ticket ticket-slide-card">
        <div class="ticket-top"><div><span class="profile-label">${safe(t.name)}</span><strong class="ticket-number">${safe(subtitle)}</strong><small>${t.legs.length} seleções</small></div><span class="risk-pill risk-${riskClass(t.risk)}">Risco ${safe(t.risk)}</span></div>
        <div class="ticket-metrics ticket-metrics-3"><div><span>${t.combinedOddType === 'real' ? 'Odd do bilhete' : t.combinedOddType === 'mista' ? 'Odd combinada' : 'Odd aproximada'}</span><strong>${money(t.combinedOdd)}</strong></div><div><span>Odd justa</span><strong>${money(t.fairCombinedOdd || (1/Math.max(t.jointProbability,.000001)))}</strong></div><div><span>Chance de GREEN</span><strong>${pct(t.jointProbability)}</strong></div></div>
        <div class="ticket-meta">${t.targetRange?`<span>Faixa-alvo ${safe(t.targetRange)}</span>`:''}<span>Correlação ${safe(t.correlation || 'baixa')}</span><span>Dados ${safe(t.dataConfidence || '—')}</span>${t.foundation?`<span>Fundamentação ${safe(t.foundation)}</span>`:''}</div>
        <ul>${t.legs.map(l => `<li><strong>${safe(l.selection)}</strong><small>${safe(l.match)} • ${legPriceText(l)}</small></li>`).join('')}</ul>
        ${t.weakest ? `<div class="weakest">Ponto mais frágil: <strong>${safe(t.weakest.selection)}</strong> (${pct(t.weakest.probability)})</div>` : ''}
        <div class="ticket-actions"><button class="secondary auto-detail" data-profile="${safe(profileKey)}" data-option="${optionIndex}">Ver detalhes</button><button class="primary select-auto" data-profile="${safe(profileKey)}" data-option="${optionIndex}">Selecionar bilhete</button></div>
      </div>
    </article>`;
}

function renderTickets(tickets, ticketGroups = null) {
  const groups = normalizedTicketGroups(tickets, ticketGroups);
  if (!groups.length) return `<section class="card"><p class="muted">Ainda não há partidas suficientes para montar bilhetes.</p></section>`;
  return `<section class="ticket-intro card"><div class="section-title-row"><div><span class="eyebrow">AUTOMÁTICOS</span><h3>Bilhetes sugeridos</h3></div><span class="badge">perfis diferentes</span></div><p class="muted">Somente partidas pré-jogo entram nos automáticos. Jogos iniciados, encerrados ou a menos de 5 minutos do início são excluídos. Os perfis usam estratégias diferentes e evitam repetir a mesma seleção sempre que possível.</p></section>
    <div class="ticket-carousel-stack">${groups.map(([profileKey, options]) => {
      const initial = options.length >= 3 ? 1 : 0;
      const advice = options.length < 3 && options.some(t => !t.unavailable)
        ? `<div class="aggressive-advice"><strong>O modelo manteve só as opções fundamentadas.</strong><span>Para ampliar sem forçar entradas, use o Mercado dos Favoritos ou escolha outra competição.</span></div>`
        : '';
      return `<section class="ticket-carousel-group profile-group-${safe(profileKey)}" data-ticket-carousel="${safe(profileKey)}" data-initial="${initial}">
        <div class="ticket-carousel-viewport">
          <div class="ticket-carousel-track">${options.map((t,i)=>ticketCard(t,profileKey,i)).join('')}</div>
        </div>
        <div class="ticket-carousel-dots" aria-label="Opções ${safe(options[0]?.name || profileKey)}">${options.map((t,i)=>`<button type="button" class="ticket-dot${i===initial?' active':''}" data-dot-index="${i}" aria-label="Bilhete ${i+1}"></button>`).join('')}</div>
        ${advice}
      </section>`;
    }).join('')}</div>`;
}

function baseCandidates(m) {
  const out = [
    { market:'1X2', key:'home', selection:`${m.homeTeam} vence`, probability:m.probabilities.home },
    { market:'1X2', key:'draw', selection:'Empate', probability:m.probabilities.draw },
    { market:'1X2', key:'away', selection:`${m.awayTeam} vence`, probability:m.probabilities.away },
    { market:'Dupla chance', key:'double_chance_1x', selection:`${m.homeTeam} ou empate (1X)`, probability:Number(m.probabilities.home||0)+Number(m.probabilities.draw||0) },
    { market:'Dupla chance', key:'double_chance_12', selection:`${m.homeTeam} ou ${m.awayTeam} (12)`, probability:Number(m.probabilities.home||0)+Number(m.probabilities.away||0) },
    { market:'Dupla chance', key:'double_chance_x2', selection:`Empate ou ${m.awayTeam} (X2)`, probability:Number(m.probabilities.draw||0)+Number(m.probabilities.away||0) },
    { market:'Total 2.5', key:'over25', selection:'Mais de 2.5 gols', probability:m.probabilities.over25 },
    { market:'Total 2.5', key:'under25', selection:'Menos de 2.5 gols', probability:m.probabilities.under25 }
  ].filter(x => Number(x.probability) > 0).map(x => ({ ...x, fairOdd:1/Number(x.probability), oddType:'estimada', reliability:.9, source:'Probabilidade-base' }));
  for (const b of out) {
    const real = (m.opportunities || []).find(o => o.key === b.key || o.selection === b.selection);
    if (real) Object.assign(b, real);
  }
  return out;
}
function allMarketsForMatch(index) {
  const m = dashboard?.matches?.[index]; if (!m) return [];
  const extra = playerMarketsByMatch[index] || [];
  const combined = [...baseCandidates(m), ...(m.estimatedMarkets || []), ...extra];
  const seen = new Set();
  return combined.filter(x => {
    const k = `${x.market}|${x.key}|${x.selection}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
}
function marketCategory(m) {
  const text = `${m.market} ${m.selection}`.toLowerCase();
  if (text.includes('jogador') || m.player) return 'jogadores';
  if (text.includes('defesa') || text.includes('goleiro')) return 'defesas';
  if (text.includes('chute')) return 'chutes';
  if (text.includes('cart')) return 'cartoes';
  if (text.includes('falta')) return 'faltas';
  if (text.includes('escante')) return 'escanteios';
  if (text.includes('gol') || text.includes('1x2') || text.includes('dupla chance') || text.includes('ambas')) return 'gols';
  return 'outros';
}

function marketRows(markets, matchIndex, filter='todos', limit=120) {
  const rows = (markets || []).filter(m => filter === 'todos' || marketCategory(m) === filter).slice(0, limit);
  if (!rows.length) return `<div class="empty">Nenhum mercado desta categoria.</div>`;
  return `<div class="market-table">${rows.map((m,i) => {
    const idx = (markets || []).indexOf(m);
    const real = m.oddType === 'real' && m.odd;
    return `<div class="market-row"><div class="market-main"><span class="market-family">${safe(m.market)}</span><strong>${safe(m.selection)}</strong><small>${safe(m.source || 'Modelo')} • confiança ${safe(m.confidence || (m.reliability >= .9 ? 'alta' : 'média'))}</small></div><div class="market-numbers"><b>${pct(m.probability)}</b><span>justa ${money(m.fairOdd || (1/Math.max(.001,m.probability)))}</span>${real ? `<em>real ${money(m.odd)}</em>` : ''}</div><button class="add-market" data-match="${matchIndex}" data-market-index="${idx}" aria-label="Adicionar ao bilhete">+</button></div>`;
  }).join('')}</div>`;
}

function renderMatch(m, index) {
  const favorite = [['Casa',m.probabilities.home,m.homeTeam],['Empate',m.probabilities.draw,'Empate'],['Fora',m.probabilities.away,m.awayTeam]].sort((a,b)=>b[1]-a[1])[0];
  const estimated = (m.estimatedMarkets || []).filter(x=>x.probability>=.65).sort((a,b)=>b.probability-a.probability)[0];
  return `<article class="card game-card"><div class="game-head"><div><span class="league-name">${safe(m.leagueLabel)}</span><h3>${safe(m.homeTeam)} <span>x</span> ${safe(m.awayTeam)}</h3><small>${new Date(m.kickoff).toLocaleString('pt-BR')}</small></div><button class="icon-btn open-market" data-index="${index}">›</button></div><div class="prob"><div><span>Casa</span><strong>${pct(m.probabilities.home)}</strong></div><div><span>Empate</span><strong>${pct(m.probabilities.draw)}</strong></div><div><span>Fora</span><strong>${pct(m.probabilities.away)}</strong></div></div><div class="best-line"><div><span>Favorito</span><strong>${safe(favorite[2])} • ${pct(favorite[1])}</strong></div>${estimated ? `<div><span>Melhor mercado estimado</span><strong>${safe(estimated.selection)} • ${pct(estimated.probability)}</strong></div>` : ''}</div><button class="secondary open-market full" data-index="${index}">Ver todos os mercados</button></article>`;
}

function renderMarketDetail(index) {
  const m = dashboard?.matches?.[index];
  if (!m) { $('#marketDetail').innerHTML = `<div class="card empty">Analise uma data para ver os mercados.</div>`; return; }
  const markets = allMarketsForMatch(index);
  const playersLoaded = (playerMarketsByMatch[index] || []).length || m.playerMarketsAutoLoaded || 0;
  $('#marketDetail').innerHTML = `<section class="card market-detail"><div class="market-match-head"><div><span class="eyebrow">${safe(m.leagueLabel)}</span><h3>${safe(m.homeTeam)} x ${safe(m.awayTeam)}</h3><small>${markets.length} mercados disponíveis</small></div>${m.apiFixture ? `<button class="secondary load-player-market" data-index="${index}">${playersLoaded ? `${playersLoaded} mercados de jogadores` : 'Carregar jogadores'}</button>` : '<span class="badge">jogadores indisponíveis</span>'}</div>${marketRows(markets,index,activeMarketFilter)}</section>`;
  wireMarketRows();
  const b = $('.load-player-market'); if (b) b.addEventListener('click',()=>loadPlayerMarkets(index,b));
}
function wireMarketRows() {
  $$('.add-market').forEach(b => b.addEventListener('click', () => {
    const mi = Number(b.dataset.match), idx = Number(b.dataset.marketIndex);
    const market = allMarketsForMatch(mi)[idx];
    if (market) addCustomCandidate(mi, market);
  }));
}

async function loadPlayerMarkets(index, btn) {
  const m = dashboard?.matches?.[index]; const f = m?.apiFixture;
  if (!m || !f) return;
  btn.disabled = true; btn.textContent = 'Carregando…';
  try {
    const q = new URLSearchParams({ homeTeamId:f.homeTeamId, awayTeamId:f.awayTeamId, leagueId:f.leagueId, leagueCountry:f.leagueCountry || '', date:$('#date').value, homeLambda:m.expectedGoals?.home || 1.35, awayLambda:m.expectedGoals?.away || 1.15 });
    const r = await fetch(`/api/pregame/player-markets?${q}`); const data = await r.json(); if(!r.ok) throw new Error(data.error || 'Falha ao carregar jogadores');
    playerMarketsByMatch[index] = data.markets || [];
    renderMarketDetail(index); populateBuilderMarkets(); populateManualMarkets();
  } catch (e) { btn.disabled=false; btn.textContent='Tentar novamente'; alert(e.message); }
}

function populateMatchSelectors(matches) {
  const options = matches.map((m,i)=>`<option value="${i}">${safe(m.homeTeam)} x ${safe(m.awayTeam)}</option>`).join('');
  $('#marketMatch').innerHTML = options; $('#builderMatch').innerHTML = options; $('#manualMatch').innerHTML = options;
  populateBuilderMarkets(); populateManualMarkets();
}
function populateBuilderMarkets() {
  const index = Number($('#builderMatch').value || 0), markets = allMarketsForMatch(index);
  $('#builderMarket').innerHTML = markets.map((m,i)=>`<option value="${i}">${safe(m.selection)} • ${pct(m.probability)} • justa ${money(m.fairOdd || 1/m.probability)}</option>`).join('');
}
function populateManualMarkets() {
  const index=Number($('#manualMatch').value||0), markets=allMarketsForMatch(index);
  $('#manualMarket').innerHTML = markets.map((m,i)=>`<option value="${i}">${safe(m.selection)}</option>`).join('');
}

function addCustomCandidate(matchIndex, market) {
  const m = dashboard?.matches?.[matchIndex]; if (!m) return;
  const signature = `${matchIndex}|${market.key}|${market.selection}`;
  if (customTicket.legs.some(l=>l.signature===signature)) return alert('Essa seleção já está no seu bilhete.');
  customTicket.legs.push({
    ...market, signature, matchIndex, match:`${m.homeTeam} x ${m.awayTeam}`, leagueLabel:m.leagueLabel,
    fairOdd:Number(market.fairOdd || 1/Math.max(.001,market.probability)), reliability:Number(market.reliability || (market.confidence==='alta'?.95:market.confidence==='média'?.82:.75)),
    fixtureId:m.apiFixture?.fixtureId || null, apiFixture:m.apiFixture || null, homeTeam:m.homeTeam, awayTeam:m.awayTeam
  });
  renderCustomTicket(); switchTab('bilhetes'); switchTicketTab('montar');
}
function customEvaluation() {
  const legs = customTicket.legs || []; if (!legs.length) return null;
  const raw = legs.reduce((p,l)=>p*Number(l.probability||0),1);
  const byMatch = legs.reduce((m,l)=>(m[l.match]=(m[l.match]||0)+1,m),{});
  const extraSameMatch = Object.values(byMatch).reduce((s,n)=>s+Math.max(0,n-1),0);
  const correlation = extraSameMatch >= 2 ? 'alta' : extraSameMatch === 1 ? 'média' : 'baixa';
  const adjusted = raw * Math.pow(.90, extraSameMatch);
  const fairOdd = legs.reduce((p,l)=>p*Number(l.fairOdd||1),1);
  const min = [...legs].sort((a,b)=>a.probability-b.probability)[0];
  const houseOdd = Number($('#customHouseOdd').value || 0);
  const ev = houseOdd > 1 ? adjusted*houseOdd - 1 : null;
  const risk = fairOdd <= 2.05 && adjusted >= .45 && min.probability >= .60 ? 'baixo' : fairOdd <= 3.8 && adjusted >= .25 && min.probability >= .45 ? 'médio' : 'alto';
  return { raw, adjusted, fairOdd, correlation, risk, weakest:min, dataConfidence:confidenceLabel(legs), houseOdd, ev };
}
function renderCustomTicket() {
  const legs=customTicket.legs||[]; $('#customCount').textContent=`${legs.length} seleç${legs.length===1?'ão':'ões'}`;
  $('#customLegs').innerHTML = legs.length ? legs.map((l,i)=>`<article class="custom-leg"><div><span class="market-family">${safe(l.market)}</span><strong>${safe(l.selection)}</strong><small>${safe(l.match)} • ${pct(l.probability)} • justa ${money(l.fairOdd)}</small></div><button class="remove-custom" data-index="${i}">×</button></article>`).join('') : `<div class="empty">Adicione mercados pela aba Mercados ou pelos seletores acima.</div>`;
  $$('.remove-custom').forEach(b=>b.onclick=()=>{customTicket.legs.splice(Number(b.dataset.index),1);renderCustomTicket();});
  const e=customEvaluation();
  if(!e){$('#customEvaluation').innerHTML='';return;}
  $('#customEvaluation').innerHTML=`<div class="evaluation"><div class="eval-hero"><div><span>Chance estimada de GREEN</span><strong>${pct(e.adjusted)}</strong></div><div><span>Risco</span><strong class="risk-text risk-${riskClass(e.risk)}">${safe(e.risk).toUpperCase()}</strong></div></div><div class="eval-grid"><div><span>Odd justa</span><strong>${money(e.fairOdd)}</strong></div><div><span>Correlação</span><strong>${safe(e.correlation)}</strong></div><div><span>Confiança dos dados</span><strong>${safe(e.dataConfidence)}</strong></div><div><span>Seleções</span><strong>${legs.length}</strong></div>${e.ev!==null?`<div><span>EV estimado</span><strong class="${e.ev>=0?'good':'bad'}">${e.ev>=0?'+':''}${(e.ev*100).toFixed(1)}%</strong></div>`:''}</div><div class="weakest">Ponto mais frágil: <strong>${safe(e.weakest.selection)}</strong> • ${pct(e.weakest.probability)}</div>${e.correlation!=='baixa'?`<div class="warning">Há mais de uma seleção no mesmo jogo. A chance combinada recebeu uma penalização conservadora por correlação.</div>`:''}</div>`;
}

function saveCustomTicket() {
  const e=customEvaluation(); if(!e) return alert('Adicione ao menos uma seleção.');
  const name = prompt('Nome para este bilhete:', `Meu bilhete ${new Date().toLocaleDateString('pt-BR')}`) || 'Meu bilhete';
  const item=saveTicketObject({ name, profile:'personalizado', source:'Montado por você', risk:e.risk, combinedOdd:e.houseOdd>1?e.houseOdd:e.fairOdd, combinedOddType:e.houseOdd>1?'real':'estimada', jointProbability:e.adjusted, correlation:e.correlation, dataConfidence:e.dataConfidence, legs:customTicket.legs });
  switchTab('live'); renderSavedTickets();
  return item;
}

function renderSavedTickets() {
  const el=$('#savedTickets'); if(!el)return;
  if(!savedTickets.length){el.innerHTML=`<section class="card empty">Você ainda não selecionou ou salvou nenhum bilhete.</section>`;return;}
  const active=savedTickets.find(t=>t.id===activeTicketId);
  const rest=savedTickets.filter(t=>t.id!==activeTicketId);
  const card=(t,isActive)=>`<article class="card saved-ticket ${isActive?'active-ticket':''}" data-id="${t.id}"><div class="saved-head"><div><span class="eyebrow">${isActive?'MEU BILHETE ATIVO':safe(t.profile).toUpperCase()}</span><h3>${safe(t.name)}</h3><small>${new Date(t.createdAt).toLocaleString('pt-BR')}</small></div><span class="risk-pill risk-${riskClass(t.risk)}">${safe(t.risk)}</span></div><div class="ticket-metrics ticket-metrics-3"><div><span>${t.combinedOddType==='real'?'Odd do bilhete':t.combinedOddType==='mista'?'Odd combinada':'Odd aproximada'}</span><strong>${money(t.combinedOdd)}</strong></div><div><span>Odd justa</span><strong>${money(t.fairCombinedOdd || (1/Math.max(t.jointProbability,.000001)))}</strong></div><div><span>Chance GREEN</span><strong>${pct(t.jointProbability)}</strong></div></div><ul>${(t.legs||[]).map(l=>`<li>${safe(l.selection)}<small>${safe(l.match)}</small></li>`).join('')}</ul><div class="saved-actions">${!isActive?`<button class="secondary set-active" data-id="${t.id}">Definir como principal</button>`:''}<button class="primary follow-ticket" data-id="${t.id}">Acompanhar ao vivo</button><button class="ghost delete-ticket" data-id="${t.id}">Excluir</button></div></article>`;
  el.innerHTML = `${active?card(active,true):''}${rest.map(t=>card(t,false)).join('')}`;
  $$('.set-active').forEach(b=>b.onclick=()=>{activeTicketId=b.dataset.id;saveSavedTickets();renderSavedTickets();});
  $$('.delete-ticket').forEach(b=>b.onclick=()=>{savedTickets=savedTickets.filter(t=>t.id!==b.dataset.id);if(activeTicketId===b.dataset.id)activeTicketId=savedTickets[0]?.id||'';saveSavedTickets();renderSavedTickets();});
  $$('.follow-ticket').forEach(b=>b.onclick=()=>followSavedTicket(b.dataset.id));
}

function toLiveLeg(l) {
  const key=String(l.key||''); const market=String(l.market||''); let liveMarket=null, target=Number(l.target||1), side=l.side, player=l.player||'';
  if(key==='home') liveMarket='home_win'; else if(key==='draw') liveMarket='draw'; else if(key==='away') liveMarket='away_win';
  else if(key==='double_chance_1x') liveMarket='double_chance_1x'; else if(key==='double_chance_12') liveMarket='double_chance_12'; else if(key==='double_chance_x2') liveMarket='double_chance_x2';
  else if(key==='over25') {liveMarket='goals_over';target=2.5;} else if(key==='under25'){liveMarket='goals_under';target=2.5;}
  else if(key.startsWith('over_')) {liveMarket='goals_over';target=Number(key.replace('over_','').replace('_','.'));}
  else if(key.startsWith('under_')) {liveMarket='goals_under';target=Number(key.replace('under_','').replace('_','.'));}
  else if(key.includes('btts_yes')) liveMarket='btts_yes'; else if(key.includes('btts_no')) liveMarket='btts_no';
  else if(market==='Gols do time') liveMarket='team_goals'; else if(market==='Escanteios') liveMarket='team_corners'; else if(market==='Cartões') liveMarket='team_cards'; else if(market==='Chutes') liveMarket='team_shots'; else if(market==='Chutes no gol') liveMarket='team_sot'; else if(market==='Faltas') liveMarket='team_fouls'; else if(market==='Defesas') liveMarket='team_saves';
  else if(market==='Chutes do jogador') liveMarket='player_shots'; else if(market==='Chutes no gol do jogador') liveMarket='player_sot'; else if(market==='Faltas do jogador') liveMarket='player_fouls'; else if(market==='Faltas sofridas') liveMarket='player_fouls_drawn'; else if(market==='Cartão do jogador') liveMarket='player_card'; else if(market==='Defesas do goleiro') liveMarket='player_saves'; else if(market==='Gol do jogador') liveMarket='player_goals';
  if(!liveMarket || !l.fixtureId) return null;
  const fixtureId=String(l.fixtureId);
  const provider=fixtureId.startsWith('public~')?'public':fixtureId.startsWith('odds~')?'odds':'api-football';
  return {id:uid(),fixtureId,provider,match:l.match,homeTeam:l.homeTeam||String(l.match||'').split(' x ')[0]||'',awayTeam:l.awayTeam||String(l.match||'').split(' x ')[1]||'',date:String(l.kickoff||l.date||'').slice(0,10),market:liveMarket,side:side||'home',sideName:side==='away'?l.awayTeam:l.homeTeam,player,target,odd:l.odd||null,evaluation:{state:'waiting',text:'Aguardando atualização'}};
}
function normLiveName(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function findLiveFixtureForLeg(leg, fixtures){
  const h=normLiveName(leg.homeTeam||''),a=normLiveName(leg.awayTeam||'');
  return fixtures.find(f=>normLiveName(f.home?.name)===h&&normLiveName(f.away?.name)===a) || fixtures.find(f=>normLiveName(f.home?.name)===a&&normLiveName(f.away?.name)===h) || null;
}
async function fetchLiveFixturesForDate(date){
  const r=await fetch(`/api/live/fixtures?date=${encodeURIComponent(date)}`); const data=await r.json();
  if(!r.ok) throw new Error(data.error||'Falha ao buscar partidas');
  return data;
}
async function followSavedTicket(id) {
  const t=savedTickets.find(x=>x.id===id); if(!t)return;
  const sourceLegs=(t.legs||[]).map(x=>({...x}));
  if(sourceLegs.some(l=>!l.fixtureId)){
    try{
      const data=await fetchLiveFixturesForDate(t.date||$('#liveDate').value);
      for(const leg of sourceLegs){if(leg.fixtureId)continue;const f=findLiveFixtureForLeg(leg,data.fixtures||[]);if(f)leg.fixtureId=String(f.fixtureId);}
    }catch(e){ /* o usuário ainda pode adicionar manualmente */ }
  }
  const mapped=sourceLegs.map(toLiveLeg).filter(Boolean);
  if(!mapped.length) return alert('Não consegui vincular automaticamente as partidas desse bilhete. Use “Buscar partidas” na aba Ao vivo e adicione a seleção manualmente.');
  liveTicket={legs:mapped};saveLiveTicket();renderLiveTicket();liveAutoPausedByUser=false;switchTab('live');startLiveAuto();
  if(mapped.length < sourceLegs.length) alert(`${mapped.length} de ${sourceLegs.length} seleções foram vinculadas automaticamente ao acompanhamento.`);
}

function automaticLeagueLabel() {
  const select = $('#ticketLeague');
  return select?.options?.[select.selectedIndex]?.text || 'Competição selecionada';
}

function ticketFromAutoControl(source, control) {
  const profile = control?.dataset?.profile;
  const option = Number(control?.dataset?.option || 0);
  if (profile && source?.ticketGroups?.[profile]?.[option]) return source.ticketGroups[profile][option];
  const fallbackIndex = Number(control?.dataset?.auto);
  return Number.isFinite(fallbackIndex) ? source?.tickets?.[fallbackIndex] : null;
}

function initTicketCarousels(root = document) {
  [...root.querySelectorAll('.ticket-carousel-group')].forEach(group => {
    const viewport = group.querySelector('.ticket-carousel-viewport');
    const cards = [...group.querySelectorAll('.ticket-slide')];
    const visuals = cards.map(card => card.querySelector('.ticket-slide-card') || card);
    const dots = [...group.querySelectorAll('.ticket-dot')];
    if (!viewport || !cards.length) return;

    const clamp01 = n => Math.max(0, Math.min(1, n));
    const centerCard = index => {
      const card = cards[index]; if (!card) return;
      viewport.scrollTo({ left: card.offsetLeft - (viewport.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
    };

    let nearest = 0;
    const updateTransforms = () => {
      const center = viewport.scrollLeft + viewport.clientWidth / 2;
      let nextNearest = 0, nearestDistance = Infinity;
      cards.forEach((card, i) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(center - cardCenter);
        if (distance < nearestDistance) { nearestDistance = distance; nextNearest = i; }

        // O elemento que participa do scroll-snap fica com tamanho/posição fixos.
        // Somente o cartão visual interno é escalado, evitando o "tremor" no iPhone.
        const ratio = clamp01(distance / Math.max(card.offsetWidth * .92, 1));
        const scale = 1 - ratio * .105;
        const opacity = 1 - ratio * .30;
        const visual = visuals[i];
        visual.style.setProperty('--carousel-scale', scale.toFixed(4));
        visual.style.setProperty('--carousel-opacity', opacity.toFixed(4));
      });
      nearest = nextNearest;
    };

    const settle = () => {
      dots.forEach((dot,i)=>dot.classList.toggle('active', i===nearest));
      cards.forEach((card,i)=>card.classList.toggle('is-active', i===nearest));
    };

    let raf = 0;
    let settleTimer = 0;
    viewport.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      raf = requestAnimationFrame(updateTransforms);
      settleTimer = setTimeout(() => { updateTransforms(); settle(); }, 90);
    }, { passive:true });

    dots.forEach((dot,i)=>dot.addEventListener('click',()=>centerCard(i)));

    requestAnimationFrame(() => {
      const initial = Math.max(0, Math.min(cards.length - 1, Number(group.dataset.initial || 0)));
      viewport.scrollLeft = cards[initial].offsetLeft - (viewport.clientWidth - cards[initial].offsetWidth) / 2;
      nearest = initial;
      updateTransforms();
      settle();
    });
  });
}

function wireTicketCards(root, source, { date, label } = {}) {
  if (!root || !source) return;
  root.querySelectorAll('.select-auto').forEach(b=>b.onclick=()=>{
    const t=ticketFromAutoControl(source,b); if(!t)return;
    const ticketDate = date || $('#ticketDate')?.value || $('#date').value;
    const ticketNo = Number(t.ticketNumber || Number(b.dataset.option || 0) + 1);
    const item=saveTicketObject({...t,date:ticketDate,name:`${t.name} • Bilhete ${ticketNo} • ${new Date(ticketDate+'T12:00:00').toLocaleDateString('pt-BR')}`,source:`Automático Bilhete Plus • ${label || automaticLeagueLabel()}`});
    alert(`Bilhete selecionado: ${item.name}`); renderSavedTickets(); switchTab('live');
  });
  root.querySelectorAll('.auto-detail').forEach(b=>b.onclick=()=>{
    const t=ticketFromAutoControl(source,b);if(!t)return;
    alert(`Perfil: ${t.name}\nLiga/grupo: ${label || automaticLeagueLabel()}\nRisco: ${t.risk}\nChance estimada ajustada: ${pct(t.jointProbability)}\nOdd do bilhete/aproximada: ${money(t.combinedOdd)}\nOdd justa: ${money(t.fairCombinedOdd || (1/Math.max(t.jointProbability,.000001)))}\nCorrelação: ${t.correlation}\nConfiança: ${t.dataConfidence}\nFundamentação: ${t.foundation || '—'}`);
  });
  initTicketCarousels(root);
}

function wireAutomaticTickets() {
  wireTicketCards($('#tickets'), ticketDashboard || dashboard, { date:$('#ticketDate')?.value, label:automaticLeagueLabel() });
}

function singleLeagueLabel() {
  const select = $('#singleTicketLeague');
  return select?.options?.[select.selectedIndex]?.text || 'Competição selecionada';
}

function singleMatchLabel(match) {
  return match ? `${match.homeTeam} x ${match.awayTeam}` : 'Partida selecionada';
}

function invalidateSingleMatchTickets({ keepMatches = false } = {}) {
  singleTicketDashboard = keepMatches ? singleTicketDashboard : null;
  if (!keepMatches) $('#singleTicketMatch').innerHTML = '<option value="">Busque as partidas primeiro</option>';
  $('#singleTickets').innerHTML = '';
  $('#singleTicketSummary').innerHTML = `<span class="pill">${safe(singleLeagueLabel())}</span><span class="pill">${keepMatches ? 'escolha a partida' : 'aguardando busca'}</span>`;
}

async function loadSingleMatches() {
  const date=$('#singleTicketDate').value, league=$('#singleTicketLeague').value;
  $('#loadSingleMatches').disabled=true;
  $('#generateSingleTickets').disabled=true;
  $('#singleTicketSummary').innerHTML=`<span class="pill">${safe(singleLeagueLabel())}</span><span class="pill">buscando partidas…</span>`;
  $('#singleTickets').innerHTML='';
  try {
    const data=await fetchDashboard(new URLSearchParams({date,league}));
    singleTicketDashboard=data;
    const matches=data.matches || [];
    $('#singleTicketMatch').innerHTML=matches.length
      ? matches.map((m,i)=>`<option value="${i}">${safe(singleMatchLabel(m))} • ${safe(m.leagueLabel || '')}</option>`).join('')
      : '<option value="">Nenhuma partida disponível</option>';
    $('#singleTicketSummary').innerHTML=`<span class="pill">${safe(singleLeagueLabel())}</span><span class="pill">${matches.length} jogo(s) pré-jogo</span>${data.sourceStatus?.publicFixtures&&data.sourceStatus.publicFixtures!=='não usado'?`<span class="pill">Fonte: ${safe(data.sourceStatus.publicFixtures)}</span>`:''}`;
    if(!matches.length) $('#singleTickets').innerHTML=`<section class="card empty">${safe(emptyGamesMessage(data))}</section>`;
  } catch(e) {
    singleTicketDashboard=null;
    $('#singleTicketMatch').innerHTML='<option value="">Não foi possível carregar</option>';
    $('#singleTicketSummary').innerHTML='<span class="pill">0 jogo(s)</span><span class="pill">dados não atualizados</span>';
    $('#singleTickets').innerHTML=errorCard(e.message);
  } finally {
    $('#loadSingleMatches').disabled=false;
    $('#generateSingleTickets').disabled=false;
  }
}

async function generateSingleMatchTickets() {
  if(!singleTicketDashboard?.matches?.length) await loadSingleMatches();
  const index=Number($('#singleTicketMatch').value);
  const match=singleTicketDashboard?.matches?.[index];
  if(!match) return;
  const date=$('#singleTicketDate').value, league=$('#singleTicketLeague').value;
  $('#generateSingleTickets').disabled=true;
  $('#singleTickets').innerHTML=`<section class="card loading">Montando vários bilhetes somente para ${safe(singleMatchLabel(match))}…</section>`;
  try {
    const q=new URLSearchParams({date,league,home:match.homeTeam,away:match.awayTeam});
    if($('#singleTicketPlayers').checked) q.set('includePlayers','1');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),28000);
    let r;
    try { r=await fetch(`/api/single-match-tickets?${q}`,{signal:controller.signal}); }
    catch(error){ if(error?.name==='AbortError') throw new Error('A análise desta partida demorou demais. Tente novamente.'); throw error; }
    finally { clearTimeout(timer); }
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error || 'Falha ao montar os bilhetes desta partida.');
    $('#singleTickets').innerHTML=renderTickets(data.tickets || [], data.ticketGroups);
    $('#singleTicketSummary').innerHTML=`<span class="pill">${safe(singleMatchLabel(match))}</span><span class="pill">somente esta partida</span>${data.sourceStatus?.jogadores?`<span class="pill">Jogadores: ${safe(data.sourceStatus.jogadores)}</span>`:''}`;
    wireTicketCards($('#singleTickets'),data,{date,label:`Apenas um jogo • ${singleMatchLabel(match)}`});
  } catch(e) {
    $('#singleTickets').innerHTML=errorCard(e.message);
  } finally { $('#generateSingleTickets').disabled=false; }
}


async function fetchDashboard(params) {
  const q = params instanceof URLSearchParams ? new URLSearchParams(params) : new URLSearchParams(params || {});
  const fetchTimed = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    try { return await fetch(url, { signal:controller.signal }); }
    catch (error) {
      if (error?.name === 'AbortError') throw new Error('A análise demorou demais para responder. Tente novamente; o app não ficará preso carregando.');
      throw error;
    } finally { clearTimeout(timer); }
  };
  let r = await fetchTimed(`/api/dashboard?${q}`);
  let data = await r.json().catch(() => ({}));
  if (r.ok) return data;

  const rawError = String(data.error || 'Falha ao carregar');
  const quota = /OUT_OF_USAGE_CREDITS|usage credits|cota da The Odds API acabou|quota/i.test(rawError);
  if (quota && q.get('forcePublic') !== '1') {
    q.set('forcePublic','1');
    r = await fetchTimed(`/api/dashboard?${q}`);
    data = await r.json().catch(() => ({}));
    if (r.ok) return data;
  }
  throw new Error(data.error || rawError);
}

function fallbackInfo(data) {
  const mode = String(data?.sourceStatus?.mode || '');
  if (!/fallback|partidas públicas/i.test(mode)) return '';
  return `<section class="card fallback-info"><strong>Modo aproximado ativo</strong><span>A fonte principal está indisponível, mas o Bilhete Plus continua montando bilhetes com partidas públicas e odds aproximadas do modelo próprio. Essas cotações não são odds de uma casa. Jogos já iniciados ou encerrados não aparecem nos automáticos.</span></section>`;
}

function emptyGamesMessage(data) {
  const fallback = /fallback|partidas públicas/i.test(String(data?.sourceStatus?.mode || ''));
  if (fallback) return 'Não há partidas disponíveis para esta liga na data selecionada. Jogos já iniciados ou encerrados também são removidos.';
  return 'Não há partidas disponíveis para esta liga na data selecionada.';
}

async function loadAutomaticTickets({ reuseDashboard = false } = {}) {
  const date = $('#ticketDate').value;
  const league = $('#ticketLeague').value;
  $('#tickets').innerHTML = `<section class="card loading">Montando sugestões de ${safe(automaticLeagueLabel())}…</section>`;
  $('#ticketFilterSummary').innerHTML = `<span class="pill">${safe(automaticLeagueLabel())}</span><span class="pill">carregando…</span>`;
  $('#generateAutomaticTickets').disabled = true;
  try {
    let data = null;
    const canReuse = reuseDashboard && dashboard && dashboard.date === date && dashboard.leagueKey === league && $('#ticketAutoPlayers').checked === $('#autoPlayers').checked;
    if (canReuse) {
      data = dashboard;
    } else {
      const q = new URLSearchParams({ date, league });
      if ($('#ticketAutoPlayers').checked) q.set('includePlayers','1');
      data = await fetchDashboard(q);
    }
    ticketDashboard = data;
    // Mesmo se algum perfil não conseguir fechar a faixa, mantenha os cartões dos cinco
    // perfis visíveis. O servidor já marca cada perfil sem combinação como unavailable.
    // Antes este ponto escondia TODO o carrossel quando data.tickets vinha vazio.
    $('#tickets').innerHTML = data.count > 0
      ? renderTickets(data.tickets || [], data.ticketGroups)
      : `<section class="card"><p class="muted">Nenhuma partida pré-jogo disponível nesse filtro.</p></section>`;
    $('#ticketFilterSummary').innerHTML = `<span class="pill">${safe(automaticLeagueLabel())}</span><span class="pill">${data.count} jogo(s) pré-jogo</span>${data.sourceStatus?.publicFixtures&&data.sourceStatus.publicFixtures!=='não usado'?`<span class="pill">Fonte: ${safe(data.sourceStatus.publicFixtures)}</span>`:''}${data.sourceStatus?.jogadores?`<span class="pill">Jogadores: ${safe(data.sourceStatus.jogadores)}</span>`:''}`;
    wireAutomaticTickets();
  } catch (e) {
    ticketDashboard = null;
    $('#tickets').innerHTML = errorCard(e.message);
    $('#ticketFilterSummary').innerHTML = `<span class="pill">${safe(automaticLeagueLabel())}</span><span class="pill">0 jogo(s)</span><span class="pill">dados não atualizados</span>`;
  } finally {
    $('#generateAutomaticTickets').disabled = false;
  }
}

async function load() {
  clearGameState();
  $('#matches').innerHTML=`<div class="card loading">Carregando jogos e mercados…</div>`;
  try {
    const q=new URLSearchParams({date:$('#date').value,league:$('#league').value}); if($('#autoPlayers').checked)q.set('includePlayers','1');
    const data=await fetchDashboard(q);
    dashboard=data;playerMarketsByMatch={};
    $('#summary').innerHTML=`<span class="pill">${data.count} jogo(s)</span><span class="pill">${safe(data.sourceStatus?.mode||'')}</span>${data.sourceStatus?.publicFixtures&&data.sourceStatus.publicFixtures!=='não usado'?`<span class="pill">Fonte: ${safe(data.sourceStatus.publicFixtures)}</span>`:''}${data.sourceStatus?.jogadores?`<span class="pill">Jogadores: ${safe(data.sourceStatus.jogadores)}</span>`:''}`;
    $('#matches').innerHTML=fallbackInfo(data)+(data.matches.length?data.matches.map(renderMatch).join(''):`<div class="card empty">${safe(emptyGamesMessage(data))}</div>`);
    populateMatchSelectors(data.matches); renderMarketDetail(0); renderSavedTickets();
    if (!ticketDashboard && $('#ticketDate').value === $('#date').value && $('#ticketLeague').value === $('#league').value) {
      ticketDashboard = data;
      $('#tickets').innerHTML=renderTickets(data.tickets, data.ticketGroups);
      $('#ticketFilterSummary').innerHTML=`<span class="pill">${safe(automaticLeagueLabel())}</span><span class="pill">${data.count} jogo(s) pré-jogo</span>${data.sourceStatus?.jogadores?`<span class="pill">Jogadores: ${safe(data.sourceStatus.jogadores)}</span>`:''}`;
      wireAutomaticTickets();
    }
    $$('.open-market').forEach(b=>b.onclick=()=>{$('#marketMatch').value=b.dataset.index;activeMarketFilter='todos';$$('.filter-chip').forEach(x=>x.classList.toggle('active',x.dataset.filter==='todos'));renderMarketDetail(Number(b.dataset.index));switchTab('mercados');});
  } catch(e){
    clearGameState();
    $('#matches').innerHTML=errorCard(e.message);
  }
}

/* ACOMPANHAMENTO AO VIVO */
const playerLiveMarkets=new Set(['player_shots','player_sot','player_fouls','player_fouls_drawn','player_card','player_saves','player_goals']);
const teamLiveMarkets=new Set(['team_corners','team_cards','team_shots','team_sot','team_fouls','team_saves']);
const sideLiveMarkets=new Set([...teamLiveMarkets,'team_goals']);
const noTarget=new Set(['home_win','draw','away_win','double_chance_1x','double_chance_12','double_chance_x2','btts_yes','btts_no','player_card']);
function updateBuilder(){const market=$('#liveMarket').value;$('#playerField').style.display=playerLiveMarkets.has(market)?'':'none';$('#sideField').style.display=sideLiveMarkets.has(market)?'':'none';$('#targetField').style.display=noTarget.has(market)?'none':'';if(market==='goals_over'||market==='goals_under'){$('#targetField label').textContent='Linha (ex.: 2.5)';$('#liveTarget').step='.5';$('#liveTarget').value='2.5';}else{$('#targetField label').textContent='Quantidade mínima';$('#liveTarget').step='1';if(Number($('#liveTarget').value)%1)$('#liveTarget').value='1';}}
async function loadLiveFixtures(){ $('#liveFixture').innerHTML='<option>Carregando…</option>'; $('#loadLiveFixtures').disabled=true; try{const data=await fetchLiveFixturesForDate($('#liveDate').value);liveFixtures=data.fixtures||[];$('#liveFixture').innerHTML=liveFixtures.length?liveFixtures.map(f=>`<option value="${safe(String(f.fixtureId))}">${safe(f.league.name)} • ${safe(f.home.name)} x ${safe(f.away.name)}</option>`).join(''):'<option value="">Nenhuma partida</option>';if(data.source==='public-fallback'){$('#liveSourceMessage').innerHTML=`<div class="source-alert fallback-alert"><strong>Acompanhamento público ativo</strong><span>${safe(data.warning||'Partidas carregadas por fonte pública sem chave.')}</span><span>Placar, resultado, dupla chance, gols, ambas marcam e gols do time continuam acompanhados sem consumir cota da API-Football. Estatísticas detalhadas entram quando a fonte pública fornecer.</span></div>`;}else if(data.source==='odds-fallback'){$('#liveSourceMessage').innerHTML=`<div class="source-alert fallback-alert"><strong>Modo alternativo ativo</strong><span>${safe(data.warning||'Partidas carregadas pela The Odds API.')}</span><span>Placar e mercados de gols continuam acompanhados; estatísticas detalhadas dependem de uma fonte que as disponibilize.</span></div>`;}else if(data.source==='none'){$('#liveSourceMessage').innerHTML=`<div class="source-alert"><strong>Nenhuma fonte respondeu agora</strong><span>${safe(data.warning||'Tente novamente em alguns instantes.')}</span></div>`;}else{$('#liveSourceMessage').innerHTML=`<span class="good">${liveFixtures.length} partida(s) disponível(is) • fonte detalhada ativa.</span>`;}}catch(e){liveFixtures=[];$('#liveFixture').innerHTML='<option value="">Falha ao buscar partidas</option>';$('#liveSourceMessage').innerHTML=`<div class="source-alert"><strong>Não foi possível buscar partidas</strong><span>${safe(String(e.message||''))}</span></div>`;}finally{$('#loadLiveFixtures').disabled=false;}}
function marketLabel(leg){const labels={home_win:'Casa vence',draw:'Empate',away_win:'Fora vence',double_chance_1x:'Dupla chance: 1X',double_chance_12:'Dupla chance: 12',double_chance_x2:'Dupla chance: X2',goals_over:`Mais de ${leg.target} gols`,goals_under:`Menos de ${leg.target} gols`,btts_yes:'Ambas marcam: Sim',btts_no:'Ambas marcam: Não',team_goals:`${leg.sideName}: ${leg.target}+ gol(s)`,team_corners:`${leg.sideName}: ${leg.target}+ escanteios`,team_cards:`${leg.sideName}: ${leg.target}+ cartões`,team_shots:`${leg.sideName}: ${leg.target}+ chutes`,team_sot:`${leg.sideName}: ${leg.target}+ chutes no gol`,team_fouls:`${leg.sideName}: ${leg.target}+ faltas`,team_saves:`${leg.sideName}: ${leg.target}+ defesas`,player_shots:`${leg.player}: ${leg.target}+ chutes`,player_sot:`${leg.player}: ${leg.target}+ chutes no gol`,player_fouls:`${leg.player}: ${leg.target}+ faltas cometidas`,player_fouls_drawn:`${leg.player}: ${leg.target}+ faltas sofridas`,player_card:`${leg.player}: receber cartão`,player_saves:`${leg.player}: ${leg.target}+ defesas`,player_goals:`${leg.player}: ${leg.target}+ gol(s)`};return labels[leg.market]||leg.market;}
function statusFromLeg(leg){return leg.evaluation||{state:'waiting',text:'Aguardando atualização'};}
function liveStateLabel(ev){return ev.state==='green'?'ATINGIDO':ev.state==='hitting'?'BATENDO AGORA':ev.state==='red'?'PERDIDO':ev.state==='void'?'ANULADO':ev.state==='waiting'?'AGUARDANDO DADOS':'FALTANDO';}
function renderLiveTicket(){
  const legs=liveTicket.legs||[];
  if(!legs.length){
    if(liveTimer) stopLiveAuto(false);
    $('#liveTicket').innerHTML='<div class="empty">Nenhum bilhete em acompanhamento.</div>';
    $('#liveTicketSummary').innerHTML='';
    return;
  }
  const counts=legs.reduce((a,l)=>{const st=statusFromLeg(l).state;a[st]=(a[st]||0)+1;return a;},{});
  const odds=legs.map(l=>Number(l.odd)).filter(x=>x>1).reduce((a,b)=>a*b,1);
  const stillMissing=(counts.pending||0), waiting=(counts.waiting||0), hitting=(counts.hitting||0), green=(counts.green||0), red=(counts.red||0);
  const progressText=red?`${red} seleção(ões) perdida(s)`:(stillMissing?`Faltam ${stillMissing} seleção(ões)`:(waiting?`${waiting} seleção(ões) aguardando dados`:'Todas as seleções estão atingidas ou batendo agora'));
  $('#liveTicketSummary').innerHTML=`<span class="pill green-dot">✓ ${green} atingida(s)</span><span class="pill hitting-dot">↗ ${hitting} batendo</span><span class="pill amber-dot">● ${stillMissing} faltando</span>${waiting?`<span class="pill">? ${waiting} aguardando</span>`:''}${red?`<span class="pill red-dot">× ${red} perdida(s)</span>`:''}<span class="pill">${safe(progressText)}</span>${odds>1?`<span class="pill">Odd ${odds.toFixed(2)}</span>`:''}`;
  $('#liveTicket').innerHTML=legs.map((leg,i)=>{
    const ev=statusFromLeg(leg);
    const icon=ev.state==='green'?'✓':ev.state==='hitting'?'↗':ev.state==='red'?'×':ev.state==='void'?'↔':ev.state==='waiting'?'?':'●';
    return `<article class="live-leg state-${ev.state}"><div class="state-icon">${icon}</div><div class="leg-body"><strong>${safe(marketLabel(leg))}</strong><span>${safe(leg.match)}</span><small><b>${safe(liveStateLabel(ev))}</b> • ${safe(ev.text)}${leg.odd?` • odd ${Number(leg.odd).toFixed(2)}`:''}</small></div><button class="remove-leg" data-index="${i}">×</button></article>`;
  }).join('');
  $$('.remove-leg').forEach(b=>b.onclick=()=>{liveTicket.legs.splice(Number(b.dataset.index),1);saveLiveTicket();renderLiveTicket();});
}
function addLiveLeg(){
  const fixtureId=String($('#liveFixture').value||''),f=liveFixtures.find(x=>String(x.fixtureId)===fixtureId);
  if(!f)return alert('Busque e escolha uma partida primeiro.');
  const market=$('#liveMarket').value,side=$('#liveSide').value,player=$('#livePlayer').value.trim(),target=Number($('#liveTarget').value),odd=Number($('#liveOdd').value)||null;
  if(playerLiveMarkets.has(market)&&!player)return alert('Digite o nome do jogador.');
  if(!noTarget.has(market)&&(!Number.isFinite(target)||target<0))return alert('Informe a linha/quantidade.');
  const source=String(f.provider||''),fallback=source==='odds'||fixtureId.startsWith('odds~'),publicFallback=source.includes('public')||fixtureId.startsWith('public~'),detailedOnly=playerLiveMarkets.has(market)||teamLiveMarkets.has(market);
  const provider=publicFallback?'public':fallback?'odds':'api-football';
  liveTicket.legs.push({id:uid(),fixtureId,provider,match:`${f.home.name} x ${f.away.name}`,homeTeam:f.home.name,awayTeam:f.away.name,date:String(f.date||$('#liveDate').value).slice(0,10),market,side,sideName:side==='home'?f.home.name:f.away.name,player,target,odd,evaluation:{state:'waiting',text:(fallback||publicFallback)&&detailedOnly&&!f.hasDetailedStats?'Aguardando fonte com estatística detalhada':'Aguardando atualização'}});
  saveLiveTicket();renderLiveTicket();$('#livePlayer').value='';$('#liveOdd').value='';liveAutoPausedByUser=false;startLiveAuto();
}
async function refreshLive(){
  const legs=liveTicket.legs||[];if(!legs.length)return;
  const ids=[...new Set(legs.map(l=>String(l.fixtureId)).filter(Boolean))],playerIds=[...new Set(legs.filter(l=>playerLiveMarkets.has(l.market)&&/^\d+$/.test(String(l.fixtureId))).map(l=>Number(l.fixtureId)))];
  $('#liveBadge').textContent='atualizando…';
  try{
    const q=new URLSearchParams({ids:ids.join(',')});if(playerIds.length)q.set('players',playerIds.join(','));
    const descriptors=ids.map(id=>{const l=legs.find(x=>String(x.fixtureId)===id)||{};const parts=String(l.match||'').split(' x ');return{id,home:l.homeTeam||parts[0]||'',away:l.awayTeam||parts[1]||'',date:String(l.date||$('#liveDate').value||'').slice(0,10)}}).filter(x=>x.home&&x.away&&x.date);
    if(descriptors.length)q.set('fallbacks',JSON.stringify(descriptors));
    const r=await fetch(`/api/live/snapshot?${q}`);const data=await r.json();if(!r.ok)throw new Error(data.error||'Falha na atualização');
    liveSnapshots=data.snapshots||[];const byId=new Map(liveSnapshots.map(s=>[String(s.fixtureId),s]));
    for(const leg of legs)leg.evaluation=evaluateClientLeg(leg,byId.get(String(leg.fixtureId)));
    saveLiveTicket();renderLiveTicket();
    const warn=(data.warnings||[]).filter(Boolean);
    $('#liveUpdated').innerHTML=`Última atualização: ${new Date(data.updatedAt).toLocaleTimeString('pt-BR')} • próxima em até ${liveRefreshSeconds}s${warn.length?`<br><span class="warn">${safe(warn.join(' | '))}</span>`:''}`;
    $('#liveBadge').textContent=liveTimer?'ao vivo':'atualizado';
  }catch(e){$('#liveBadge').textContent='erro';$('#liveUpdated').innerHTML=`<span class="bad">${safe(e.message)}</span>`;}
}
function finished(s){return ['FT','AET','PEN'].includes(s?.status);}
function liveMinute(s){return s?.elapsed!==null&&s?.elapsed!==undefined?` • ${s.elapsed}'`:'';}
function livePlural(v,one,many){return `${v} ${Number(v)===1?one:many}`;}
function findPlayer(s,name){const n=String(name||'').toLowerCase();return s?.players?.find(p=>p.name.toLowerCase()===n)||s?.players?.find(p=>p.name.toLowerCase().includes(n)||n.includes(p.name.toLowerCase()));}
function threshold(v,t,s,one='item',many='itens'){
  const current=Number(v||0),needed=Math.max(1,Math.ceil(Number(t||1))),remaining=Math.max(0,needed-current);
  if(current>=needed)return{state:'green',current,target:needed,remaining:0,text:`Objetivo atingido • ${current}/${needed}${liveMinute(s)}`};
  if(finished(s))return{state:'red',current,target:needed,remaining,text:`Terminou em ${current}/${needed} • faltou ${livePlural(remaining,one,many)}`};
  return{state:'pending',current,target:needed,remaining,text:`Falta${remaining===1?'':'m'} ${livePlural(remaining,one,many)} • ${current}/${needed}${liveMinute(s)}`};
}
function reversible(hit,s,score,hitText,missText){
  if(finished(s))return{state:hit?'green':'red',text:`Final ${score}`};
  if(['NS','TBD','PST'].includes(s.status))return{state:'waiting',text:'Pré-jogo'};
  return hit?{state:'hitting',text:`Batendo agora • ${hitText||score}${liveMinute(s)}`}:{state:'pending',text:`${missText||'Ainda não bate'} • ${score}${liveMinute(s)}`};
}
function evaluateClientLeg(l,s){
  if(!s)return{state:'waiting',text:'Aguardando dados'};
  const ft=finished(s),score=`${s.goals.home}–${s.goals.away}`,t=Number(l.target||1),side=l.side==='away'?'away':'home',st=s.stats?.[side]||{},detailedMarket=playerLiveMarkets.has(l.market)||teamLiveMarkets.has(l.market);
  if(s.hasDetailedStats===false&&detailedMarket)return{state:'waiting',text:`Placar ${score}${liveMinute(s)} • estatística detalhada indisponível na fonte atual`};
  if(['CANC','ABD','AWD','WO'].includes(s.status))return{state:'void',text:s.statusLong||s.status};
  if(l.market==='home_win'){const hit=s.goals.home>s.goals.away,miss=s.goals.home===s.goals.away?'Falta 1 gol da casa para ficar vencendo':'A casa precisa virar o placar';return reversible(hit,s,score,`Casa vencendo ${score}`,miss);}
  if(l.market==='draw'){const hit=s.goals.home===s.goals.away,diff=Math.abs(s.goals.home-s.goals.away);return reversible(hit,s,score,`Empate ${score}`,`Falta${diff===1?'':'m'} ${livePlural(diff,'gol','gols')} para empatar`);}
  if(l.market==='away_win'){const hit=s.goals.away>s.goals.home,miss=s.goals.away===s.goals.home?'Falta 1 gol do visitante para ficar vencendo':'O visitante precisa virar o placar';return reversible(hit,s,score,`Visitante vencendo ${score}`,miss);}
  if(l.market==='double_chance_1x'){const hit=s.goals.home>=s.goals.away,diff=Math.max(1,s.goals.away-s.goals.home);return reversible(hit,s,score,`1X está dentro com ${score}`,`Falta${diff===1?'':'m'} ${livePlural(diff,'gol da casa','gols da casa')} para entrar no 1X`);}
  if(l.market==='double_chance_12'){const hit=s.goals.home!==s.goals.away;return reversible(hit,s,score,`Sem empate com ${score}`,'Falta sair do empate');}
  if(l.market==='double_chance_x2'){const hit=s.goals.away>=s.goals.home,diff=Math.max(1,s.goals.home-s.goals.away);return reversible(hit,s,score,`X2 está dentro com ${score}`,`Falta${diff===1?'':'m'} ${livePlural(diff,'gol do visitante','gols do visitante')} para entrar no X2`);}
  const total=s.goals.home+s.goals.away;
  if(l.market==='goals_over'){
    const required=Math.floor(t)+1,remaining=Math.max(0,required-total);
    if(total>=required)return{state:'green',current:total,target:required,remaining:0,text:`Objetivo atingido • ${total} gols${liveMinute(s)}`};
    if(ft)return{state:'red',current:total,target:required,remaining,text:`Final com ${total} gols • precisava de ${required}`};
    return{state:'pending',current:total,target:required,remaining,text:`Falta${remaining===1?'':'m'} ${livePlural(remaining,'gol','gols')} • ${total}/${required}${liveMinute(s)}`};
  }
  if(l.market==='goals_under'){
    const maxAllowed=Math.ceil(t)-1;
    if(total>maxAllowed)return{state:'red',text:`Linha perdida • ${total} gols${liveMinute(s)}`};
    if(ft)return{state:'green',text:`Objetivo atingido • Final com ${total} gols`};
    const margin=Math.max(0,maxAllowed-total);return{state:'hitting',margin,text:`Batendo agora • ${total} gols • margem de ${livePlural(margin,'gol','gols')}${liveMinute(s)}`};
  }
  if(l.market==='btts_yes'){
    const hs=s.goals.home>0,as=s.goals.away>0;
    if(hs&&as)return{state:'green',text:`Objetivo atingido • Placar ${score}${liveMinute(s)}`};
    if(ft)return{state:'red',text:`Final ${score} • nem os dois marcaram`};
    if(!hs&&!as)return{state:'pending',text:`Falta 1 gol de cada time • ${score}${liveMinute(s)}`};
    return{state:'pending',text:`${hs?'Falta o visitante marcar':'Falta a casa marcar'} • ${score}${liveMinute(s)}`};
  }
  if(l.market==='btts_no'){
    const bad=s.goals.home>0&&s.goals.away>0;
    if(bad)return{state:'red',text:`Linha perdida • Placar ${score}${liveMinute(s)}`};
    if(ft)return{state:'green',text:`Objetivo atingido • Final ${score}`};
    return{state:'hitting',text:`Batendo agora • pelo menos um time segue sem marcar • ${score}${liveMinute(s)}`};
  }
  if(l.market==='team_goals'){const v=side==='away'?s.goals.away:s.goals.home;return threshold(v,t,s,'gol','gols');}
  const tf={team_corners:['corners','escanteio','escanteios'],team_cards:['cards','cartão','cartões'],team_shots:['shots','chute','chutes'],team_sot:['shotsOnTarget','chute no gol','chutes no gol'],team_fouls:['fouls','falta','faltas'],team_saves:['saves','defesa','defesas']}[l.market];
  if(tf){const v=tf[0]==='cards'?(st.yellow||0)+(st.red||0):(st[tf[0]]||0);return threshold(v,t,s,tf[1],tf[2]);}
  const p=findPlayer(s,l.player);if(!p)return{state:ft?'red':'waiting',text:`Sem estatística de ${l.player}${liveMinute(s)}`};
  if(l.market==='player_card'){const c=(p.yellow||0)+(p.red||0);if(c)return{state:'green',text:`Objetivo atingido • ${c} cartão(ões)${liveMinute(s)}`};return ft?{state:'red',text:'Terminou sem cartão'}:{state:'pending',text:`Falta 1 cartão${liveMinute(s)}`};}
  const pf={player_shots:['shots','chute','chutes'],player_sot:['shotsOnTarget','chute no gol','chutes no gol'],player_fouls:['foulsCommitted','falta','faltas'],player_fouls_drawn:['foulsDrawn','falta sofrida','faltas sofridas'],player_saves:['saves','defesa','defesas'],player_goals:['goals','gol','gols']}[l.market];
  return threshold(p[pf[0]]||0,t,s,pf[1],pf[2]);
}
function stopLiveAuto(manual=true){if(liveTimer){clearInterval(liveTimer);liveTimer=null;}if(manual)liveAutoPausedByUser=true;$('#toggleLive').textContent='▶ Acompanhar automático';$('#liveBadge').textContent=manual?'parado':'pronto';}
function startLiveAuto(){if(liveTimer||!(liveTicket.legs||[]).length||liveAutoPausedByUser)return;refreshLive();liveTimer=setInterval(refreshLive,liveRefreshSeconds*1000);$('#toggleLive').textContent='■ Parar acompanhamento';$('#liveBadge').textContent='ao vivo';}
function toggleLive(){if(liveTimer)return stopLiveAuto(true);liveAutoPausedByUser=false;startLiveAuto();}


function currentComparisonData() {
  if (!dashboard?.matches?.length) return { error:'Analise os jogos primeiro.' };
  const mi=Number($('#manualMatch').value||0), marketIndex=Number($('#manualMarket').value||0);
  const match=dashboard.matches[mi], m=allMarketsForMatch(mi)[marketIndex];
  if(!match||!m) return { error:'Selecione um jogo e um mercado.' };
  const probability=Number(m.probability||0), fairOdd=Number(m.fairOdd||1/Math.max(.001,probability));
  if(!probability) return { error:'Mercado sem probabilidade disponível.' };
  const a={name:($('#houseAName').value||'Casa 1').trim(),odd:Number($('#houseAOdd').value)};
  const b={name:($('#houseBName').value||'Casa 2').trim(),odd:Number($('#houseBOdd').value)};
  if(!(a.odd>1)||!(b.odd>1)) return { error:'Informe odds válidas nas duas casas.' };
  for(const h of [a,b]){h.implied=1/h.odd;h.ev=probability*h.odd-1;h.edgeToFair=h.odd/fairOdd-1;}
  const best=a.odd>=b.odd?a:b, other=best===a?b:a;
  return {match:`${match.homeTeam} x ${match.awayTeam}`,selection:m.selection,probability,fairOdd,a,b,best,other,priceGap:best.odd/other.odd-1,market:m.market,createdAt:new Date().toISOString()};
}
function renderComparison(c) {
  if(c?.error){$('#manualResult').innerHTML=`<div class="opportunity negative">${safe(c.error)}</div>`;return;}
  const card=h=>`<div class="compare-house ${h===c.best?'best-house':''}"><span>${safe(h.name)}${h===c.best?' • melhor preço':''}</span><strong>${h.odd.toFixed(2)}</strong><small>Implícita ${(h.implied*100).toFixed(1)}% • EV <b class="${h.ev>=0?'good':'bad'}">${h.ev>=0?'+':''}${(h.ev*100).toFixed(1)}%</b></small></div>`;
  const verdict=c.best.ev>=.03?'🟢 Melhor preço e EV positivo pelo modelo':c.best.ev>=0?'🟡 Melhor preço próximo/acima do justo':'🔴 As duas casas estão abaixo da odd justa do modelo';
  $('#manualResult').innerHTML=`<div class="comparison-result"><div class="comparison-head"><div><span class="market-family">${safe(c.market)}</span><strong>${safe(c.selection)}</strong><small>${safe(c.match)}</small></div><div><span>Odd justa</span><b>${money(c.fairOdd)}</b><small>${pct(c.probability)}</small></div></div><div class="compare-houses">${card(c.a)}${card(c.b)}</div><div class="opportunity ${c.best.ev>=0?'positive':'negative'}"><strong>${verdict}</strong><br><span>${safe(c.best.name)} paga ${(c.priceGap*100).toFixed(1)}% a mais que ${safe(c.other.name)} neste mercado.</span></div></div>`;
}
function calculateComparison(){lastComparison=currentComparisonData();renderComparison(lastComparison);return lastComparison;}
function saveComparison(){const c=lastComparison&&!lastComparison.error?lastComparison:calculateComparison();if(!c||c.error)return;oddComparisons.unshift({...c,id:uid()});oddComparisons=oddComparisons.slice(0,12);localStorage.setItem('bp-odd-comparisons-v1',JSON.stringify(oddComparisons));renderComparisonHistory();}
function renderComparisonHistory(){const el=$('#comparisonHistory');if(!el)return;if(!oddComparisons.length){el.innerHTML='<div class="empty">Nenhuma comparação salva neste aparelho.</div>';return;}el.innerHTML=`<div class="section-title-row"><div><span class="eyebrow">HISTÓRICO LOCAL</span><h3>Últimas comparações</h3></div><button id="clearComparisons" class="ghost danger">Limpar</button></div><div class="comparison-list">${oddComparisons.slice(0,6).map(c=>`<article><div><strong>${safe(c.selection)}</strong><small>${safe(c.match)}</small></div><div><b>${safe(c.best.name)} ${Number(c.best.odd).toFixed(2)}</b><small>justa ${Number(c.fairOdd).toFixed(2)}</small></div></article>`).join('')}</div>`;$('#clearComparisons').onclick=()=>{oddComparisons=[];localStorage.removeItem('bp-odd-comparisons-v1');renderComparisonHistory();};}

/* EVENTOS */
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
$$('.subtab').forEach(b=>b.addEventListener('click',()=>switchTicketTab(b.dataset.ticketTab)));
$$('.filter-chip').forEach(b=>b.addEventListener('click',()=>{activeMarketFilter=b.dataset.filter;$$('.filter-chip').forEach(x=>x.classList.toggle('active',x===b));renderMarketDetail(Number($('#marketMatch').value||0));}));
$('#marketMatch').addEventListener('change',()=>renderMarketDetail(Number($('#marketMatch').value)));
$('#builderMatch').addEventListener('change',populateBuilderMarkets);
$('#builderAdd').addEventListener('click',()=>{const mi=Number($('#builderMatch').value||0),mk=allMarketsForMatch(mi)[Number($('#builderMarket').value||0)];if(mk)addCustomCandidate(mi,mk);});
$('#customHouseOdd').addEventListener('input',renderCustomTicket);
$('#clearCustom').addEventListener('click',()=>{customTicket={legs:[]};$('#customHouseOdd').value='';renderCustomTicket();});
$('#saveCustom').addEventListener('click',saveCustomTicket);
$('#load').addEventListener('click',load);
$('#generateAutomaticTickets').addEventListener('click',()=>loadAutomaticTickets());
$('#loadSingleMatches').addEventListener('click',loadSingleMatches);
$('#generateSingleTickets').addEventListener('click',generateSingleMatchTickets);
$('#singleTicketLeague').addEventListener('change',()=>invalidateSingleMatchTickets());
$('#singleTicketDate').addEventListener('change',()=>invalidateSingleMatchTickets());
$('#singleTicketPlayers').addEventListener('change',()=>invalidateSingleMatchTickets({keepMatches:true}));
function invalidateAutomaticTickets() {
  ticketDashboard = null;
  $('#ticketFilterSummary').innerHTML=`<span class="pill">${safe(automaticLeagueLabel())}</span><span class="pill">toque em Gerar sugestões</span>`;
  $('#tickets').innerHTML='<section class="card empty">Filtro alterado. Toque em <strong>Gerar sugestões</strong> para montar novos bilhetes somente com esta competição.</section>';
}
$('#ticketLeague').addEventListener('change',invalidateAutomaticTickets);
$('#ticketDate').addEventListener('change',invalidateAutomaticTickets);
$('#ticketAutoPlayers').addEventListener('change',invalidateAutomaticTickets);
$('#liveMarket').addEventListener('change',updateBuilder);$('#loadLiveFixtures').addEventListener('click',loadLiveFixtures);$('#addLiveLeg').addEventListener('click',addLiveLeg);$('#refreshLive').addEventListener('click',refreshLive);$('#toggleLive').addEventListener('click',toggleLive);$('#clearLive').addEventListener('click',()=>{if(confirm('Limpar todas as seleções do bilhete ao vivo?')){liveTicket={legs:[]};saveLiveTicket();renderLiveTicket();}});
$('#manualMatch').addEventListener('change',populateManualMarkets);
$('#calcManual').addEventListener('click',calculateComparison);
$('#saveComparison').addEventListener('click',saveComparison);

updateBuilder();renderLiveTicket();renderCustomTicket();renderSavedTickets();renderComparisonHistory();health().catch(()=>{});load();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
