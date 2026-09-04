"use strict";

/*
 * VAI NA FÉ VIRTUAL — Interface moderna (camada visual)
 * Mantém intactos os motores de histórico, padrões, previsão, aprendizado e sincronização.
 * Quando uma informação não existe no projeto, a tela mostra "Aguardando configurações".
 */
(function(){
  if (typeof Interface === "undefined") return;

  const originalIniciar = Interface.iniciar.bind(Interface);
  const originalAtualizar = Interface.atualizar.bind(Interface);
  const AGUARDA = "Aguardando configurações";

  const esc = (v) => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const pct = v => Number.isFinite(Number(v)) ? `${Math.round(Number(v))}%` : AGUARDA;

  Interface._paginaModerna = "visao";

  Interface.iniciar = function(){
    originalIniciar();
    const legado = document.querySelector("#app > .painel");
    if (legado) { legado.classList.add("ia-legado"); legado.setAttribute("aria-hidden","true"); }
    this._criarInterfaceModerna();
    this._eventosModernos();
    this._renderModerno();
  };

  Interface.atualizar = function(){
    originalAtualizar();
    this._renderModerno();
  };

  Interface._criarInterfaceModerna = function(){
    if (document.getElementById("ia-shell")) return;
    const shell = document.createElement("div");
    shell.id = "ia-shell";
    shell.className = "ia-shell";
    shell.innerHTML = `
      <aside class="ia-sidebar">
        <div class="ia-brand"><div class="ia-logo">◈</div><div class="ia-brand-text"><strong>VAI NA FÉ</strong><small>VIRTUAL</small></div></div>
        <nav class="ia-nav" aria-label="Navegação principal">
          ${this._navItem("visao","⌂","Visão Geral")}
          ${this._navItem("resultados","▥","Resultados")}
          ${this._navItem("entradas","◎","Entradas")}
          ${this._navItem("mercados","▣","Mercados")}
          ${this._navItem("historico","▤","Histórico")}
          ${this._navItem("lembretes","♧","Lembretes")}
          ${this._navItem("configuracoes","⚙","Configurações")}
        </nav>
        <div class="ia-side-bottom">
          <div class="ia-online"><span class="ia-dot"></span><div><b>SISTEMA ONLINE</b><small id="ia-sync-status">Dados atualizados</small></div></div>
          <div class="ia-user"><span>M</span><div><b>Marcelo</b><small>Usuário</small></div><i>›</i></div>
        </div>
      </aside>
      <main class="ia-main">
        <header class="ia-topbar">
          <div><h1 id="ia-page-title">VISÃO GERAL</h1><p id="ia-page-subtitle">Acompanhe em tempo real as melhores oportunidades.</p></div>
          <div class="ia-clock"><span>◷</span><div><b id="ia-clock-time">--:--:--</b><small id="ia-clock-date">--/--/----</small></div><span class="ia-bell">♧<em>1</em></span></div>
        </header>
        <section id="ia-content" class="ia-content"></section>
        <footer>VAI NA FÉ VIRTUAL © 2026 - Todos os direitos reservados</footer>
      </main>`;
    document.getElementById("app").appendChild(shell);
    this._estilosModernos();
  };

  Interface._navItem = function(id,icon,label){
    return `<button class="ia-nav-item" data-page="${id}"><span>${icon}</span>${label}</button>`;
  };

  Interface._eventosModernos = function(){
    document.querySelectorAll(".ia-nav-item").forEach(btn => btn.addEventListener("click", () => {
      this._paginaModerna = btn.dataset.page;
      this._renderModerno();
      if (window.innerWidth <= 760) document.querySelector(".ia-sidebar")?.classList.remove("aberta");
    }));
  };

  Interface._dadosModernos = function(){
    const resultados = (typeof Historico !== "undefined" && Historico.obterTodos) ? Historico.obterTodos() : [];
    const seq = (typeof Historico !== "undefined" && Historico.obterSequenciaAtual) ? Historico.obterSequenciaAtual() : resultados;
    const liberado = seq.length >= 3;
    let mercados = {};
    try { mercados = Previsoes.gerar(resultados, seq, {liberarPalpite:liberado}).mercados || {}; } catch(_) {}
    const atual = typeof RelogioPartidas !== "undefined" ? RelogioPartidas.partidaAtual() : null;
    const proxima = typeof RelogioPartidas !== "undefined" ? RelogioPartidas.proximaPartida() : null;
    const agora = typeof RelogioPartidas !== "undefined" ? RelogioPartidas.agora() : null;
    return {resultados,seq,mercados,atual,proxima,agora,liberado};
  };

  Interface._rotuloMercado = function(k,d){
    if (!(d?.ativo && d?.palpite)) return AGUARDA;
    const adapters={exato:window.MercadoPlacarExato,gols:window.MercadoGolsExatos,r12:window.MercadoResultado1X2,bm:window.MercadoAmbosMarcam,ou05:window.MercadoOverUnder05,under05:window.MercadoUnder05,ou15:window.MercadoOverUnder15,ou25:window.MercadoOverUnder25,ou35:window.MercadoOverUnder35,over35:window.MercadoOver35};
    try { return adapters[k]?.rotulo ? adapters[k].rotulo(d.palpite.valor) : String(d.palpite.valor); } catch(_) { return String(d.palpite.valor); }
  };

  Interface._cardsMercados = function(m){
    const defs=[
      ["ou35","Under 3.5 Gols"],["bm","Ambos Marcam"],["r12","Resultado 1X2"],["ou25","Over / Under 2.5"],["ou15","Over / Under 1.5"],
      ["under05","Especialista U0.5"],["over35","Especialista O3.5"],["gols","Total de Gols"],["exato","Placar Exato"]
    ];
    return defs.map(([k,nome])=>{
      const d=m[k]||{}; const valor=this._rotuloMercado(k,d); const conf=d?.palpite?.percentual;
      return `<article class="ia-market-card ${d?.ativo&&d?.palpite?'ativo':''}"><h3>${nome}</h3><div class="ia-market-value">${esc(valor)}</div><div class="ia-meter"><span style="width:${Number(conf)||0}%"></span></div><div class="ia-market-foot"><span>Confiança</span><b>${pct(conf)}</b></div></article>`;
    }).join("");
  };

  Interface._renderModerno = function(){
    const content=document.getElementById("ia-content"); if(!content) return;
    const d=this._dadosModernos();
    document.querySelectorAll(".ia-nav-item").forEach(b=>b.classList.toggle("ativo",b.dataset.page===this._paginaModerna));
    this._atualizarRelogioModerno(d);
    const titles={
      visao:["VISÃO GERAL","Acompanhe em tempo real as melhores oportunidades."], resultados:["RESULTADOS","Registre e acompanhe os resultados das partidas."],
      entradas:["ENTRADAS","Partidas selecionadas com base nos padrões históricos."], mercados:["MERCADOS","Análise completa dos mercados disponíveis."],
      historico:["HISTÓRICO","Consulte os resultados registrados pelo sistema."], lembretes:["LEMBRETES","Apenas o que realmente importa, em tempo real."],
      configuracoes:["CONFIGURAÇÕES","Personalize sua experiência no Vai na Fé Virtual."]
    };
    const [t,s]=titles[this._paginaModerna]||titles.visao;
    document.getElementById("ia-page-title").textContent=t; document.getElementById("ia-page-subtitle").textContent=s;
    const fn=this[`_pagina_${this._paginaModerna}`]||this._pagina_visao; content.innerHTML=fn.call(this,d);
    this._eventosPaginaModerna();
  };

  Interface._atualizarRelogioModerno = function(d){
    const a=d.agora; const now=new Date();
    const time=a?`${String(a.hour).padStart(2,"0")}:${String(a.minute).padStart(2,"0")}:${String(a.second).padStart(2,"0")}`:now.toLocaleTimeString("pt-BR");
    const date=a?.data||now.toLocaleDateString("pt-BR");
    const e1=document.getElementById("ia-clock-time"),e2=document.getElementById("ia-clock-date"); if(e1)e1.textContent=time;if(e2)e2.textContent=date;
  };

  Interface._pagina_visao = function(d){
    const prox=d.proxima?.horario||"--:--";
    const ativos=Object.entries(d.mercados).filter(([,x])=>x?.ativo&&x?.palpite).sort((a,b)=>(b[1].palpite.percentual||0)-(a[1].palpite.percentual||0));
    const melhor=ativos[0];
    const ult=(d.seq||[]).slice(-10).reverse();
    return `<div class="ia-grid-home">
      <section class="ia-card ia-next"><div class="ia-card-title">PRÓXIMO JOGO <span class="ia-chip">AO VIVO</span></div><div class="ia-next-body"><div class="ia-count"><small>HORÁRIO</small><b>${prox}</b></div><div class="ia-match-empty"><span>⚽</span><strong>${AGUARDA}</strong><small>Equipes da partida</small></div></div></section>
      <section class="ia-card ia-confidence"><div>CONFIANÇA GERAL</div><div class="ia-ring"><b>${melhor?pct(melhor[1].palpite.percentual):"—"}</b></div><strong>${melhor?"Melhor leitura disponível":AGUARDA}</strong></section>
      <section class="ia-card ia-wide"><div class="ia-section-head"><h2>PRINCIPAIS MERCADOS</h2><button data-go="mercados">Ver todos os mercados ›</button></div><div class="ia-market-strip">${this._cardsMercados(d.mercados)}</div></section>
      <section class="ia-card ia-wide"><div class="ia-section-head"><h2>MELHORES OPORTUNIDADES DO MOMENTO</h2></div>${ativos.length?`<div class="ia-table">${ativos.slice(0,5).map(([k,x],i)=>`<div class="ia-row"><span class="ia-rank">${i+1}</span><strong>${esc(this._rotuloMercado(k,x))}</strong><span>Confiança <b>${pct(x.palpite.percentual)}</b></span><span class="ia-tag ${x.palpite.percentual>=70?'ok':'warn'}">${x.palpite.percentual>=70?'CONSIDERAR':'ACOMPANHAR'}</span></div>`).join("")}</div>`:`<div class="ia-await">${AGUARDA}</div>`}</section>
      <section class="ia-card"><h2>SEQUÊNCIA RECENTE</h2>${ult.length?`<div class="ia-score-list">${ult.map(x=>`<span>${esc(x.placar||"—")}</span>`).join("")}</div><p class="ia-muted">${d.seq.length} resultados na sequência atual.</p>`:`<div class="ia-await">${AGUARDA}</div>`}</section>
      <section class="ia-card"><h2>DESEMPENHO GERAL</h2><div class="ia-stat-big">${d.resultados.length}</div><p class="ia-muted">Resultados disponíveis no histórico.</p></section>
      <section class="ia-card"><h2>EVOLUÇÃO DA CONFIANÇA</h2><div class="ia-chart-placeholder"><span>${AGUARDA}</span></div></section>
      <section class="ia-card ia-wide ia-tip"><b>◉ DICA DO MOMENTO</b><p>${melhor?`${esc(this._rotuloMercado(melhor[0],melhor[1]))} é a leitura de maior confiança neste momento (${pct(melhor[1].palpite.percentual)}).`:AGUARDA}</p></section>
    </div>`;
  };

  Interface._pagina_resultados = function(d){
    const ult=d.resultados.slice(-20).reverse();
    return `<div class="ia-two"><section class="ia-card"><h2>REGISTRAR RESULTADO</h2><p class="ia-muted">Partida a registrar: <b>${d.atual?.horario||"--:--"}</b></p><div class="ia-score-buttons">${['0x0','1x0','0x1','1x1','2x0','0x2','2x1','1x2','2x2','3x0','0x3','3x1','1x3','3x2','2x3','3x3','4x0','0x4'].map(v=>`<button data-score="${v}">${v}</button>`).join("")}</div><div class="ia-custom-score"><input id="ia-custom-score" placeholder="Ex.: 5x2" inputmode="numeric"><button id="ia-register-custom">Registrar</button></div><p class="ia-note">A lógica de bloqueio por horário continua sendo a mesma do sistema atual.</p></section>
    <section class="ia-card"><h2>ÚLTIMOS RESULTADOS</h2>${ult.length?`<div class="ia-history">${ult.map(x=>`<div><span>${esc(x?._temporal?.horario||"--:--")}</span><b>${esc(x.placar||"—")}</b><small>${esc(x?._temporal?.data||"")}</small></div>`).join("")}</div>`:`<div class="ia-await">${AGUARDA}</div>`}</section></div>`;
  };

  Interface._pagina_entradas = function(d){
    const ativos=Object.entries(d.mercados).filter(([,x])=>x?.ativo&&x?.palpite).sort((a,b)=>(b[1].palpite.percentual||0)-(a[1].palpite.percentual||0));
    return `<div class="ia-two ia-entries"><section class="ia-card"><h2>PARTIDAS SELECIONADAS</h2><p class="ia-muted">Jogos em ordem de horário. Informações de equipes ainda não existem nesta base.</p><div class="ia-empty-table"><div class="ia-row"><span>#</span><span>Horário</span><span>Partida</span><span>Sugeriu</span></div><div class="ia-row"><span>1</span><b>${d.proxima?.horario||"--:--"}</b><strong>${AGUARDA}</strong><span>${ativos.length?`${Math.min(3,ativos.length)} entradas`:AGUARDA}</span></div></div></section>
    <section class="ia-card"><h2>DETALHES DA PARTIDA</h2><div class="ia-match-config">⚽<strong>${AGUARDA}</strong><small>Equipes, escudos e confronto direto</small></div><div class="ia-info-cards"><div><small>Horário do jogo</small><b>${d.proxima?.horario||"--:--"}</b></div><div><small>Confiança da IA</small><b>${ativos[0]?pct(ativos[0][1].palpite.percentual):"—"}</b></div><div><small>Sugeriu</small><b>${ativos.length?Math.min(3,ativos.length):"—"}</b></div></div><h2>SUGESTÕES DE ENTRADA PARA ESTE JOGO</h2>${ativos.length?`<div class="ia-table">${ativos.slice(0,3).map(([k,x],i)=>`<div class="ia-row"><span>${i+1}</span><strong>${esc(this._rotuloMercado(k,x))}</strong><span>${AGUARDA}</span><b>${pct(x.palpite.percentual)}</b></div>`).join("")}</div>`:`<div class="ia-await">${AGUARDA}</div>`}<div class="ia-analysis"><b>▤ ANÁLISE DA IA</b><p>${AGUARDA}</p></div></section></div>`;
  };

  Interface._pagina_mercados = function(d){
    return `<div class="ia-two ia-markets-page"><section><div class="ia-card ia-selected"><span class="ia-chip">PARTIDA SELECIONADA</span><div><b>⚽ Inglês Doméstico (Esportes Virtuais)</b><strong>${AGUARDA}</strong><time>${d.proxima?.horario||"--:--"}</time></div></div><div class="ia-market-grid">${this._cardsMercados(d.mercados)}</div></section><aside><section class="ia-card"><h2>DETALHES DA PARTIDA</h2><div class="ia-match-config">⚽<strong>${AGUARDA}</strong><small>Equipes e dados da partida</small></div></section><section class="ia-card ia-analysis"><b>▤ ANÁLISE DA IA</b><p>${AGUARDA}</p></section><section class="ia-card"><h2>RESUMO DOS MERCADOS</h2>${this._resumoMercados(d.mercados)}</section></aside></div>`;
  };

  Interface._resumoMercados = function(m){
    const xs=Object.entries(m).filter(([,x])=>x?.ativo&&x?.palpite).sort((a,b)=>(b[1].palpite.percentual||0)-(a[1].palpite.percentual||0)).slice(0,6);
    if(!xs.length)return `<div class="ia-await">${AGUARDA}</div>`;
    return `<div class="ia-table">${xs.map(([k,x])=>`<div class="ia-row"><strong>${esc(this._rotuloMercado(k,x))}</strong><span>${pct(x.palpite.percentual)}</span><span class="ia-tag ${x.palpite.percentual>=70?'ok':'warn'}">${x.palpite.percentual>=70?'SUGERIDO':'OBSERVAR'}</span></div>`).join("")}</div>`;
  };

  Interface._pagina_historico = function(d){
    const xs=d.resultados.slice().reverse().slice(0,100);
    return `<section class="ia-card"><div class="ia-section-head"><h2>HISTÓRICO DE RESULTADOS</h2><span>${d.resultados.length} registros</span></div>${xs.length?`<div class="ia-history ia-history-full">${xs.map((x,i)=>`<div><span>${d.resultados.length-i}</span><b>${esc(x.placar||"—")}</b><span>${esc(x?._temporal?.horario||"--:--")}</span><small>${esc(x?._temporal?.data||"")}</small></div>`).join("")}</div>`:`<div class="ia-await">${AGUARDA}</div>`}</section>`;
  };

  Interface._pagina_lembretes = function(d){
    return `<div class="ia-reminders"><div class="ia-filter-row"><button class="ativo">♧ Todos</button><button>▥ Entradas</button><button>⚽ Partidas</button><button class="outline" data-go="configuracoes">⚙ Configurar lembretes</button></div><section class="ia-card"><div class="ia-reminder"><time>${d.proxima?.horario||"--:--"}</time><span>⚽</span><div><b>Próxima partida</b><small>${AGUARDA}</small></div><em>PARTIDA</em></div>${Object.entries(d.mercados).filter(([,x])=>x?.ativo&&x?.palpite).slice(0,2).map(([k,x])=>`<div class="ia-reminder"><time>Agora</time><span>▥</span><div><b>${esc(this._rotuloMercado(k,x))} com ${pct(x.palpite.percentual)}</b><small>Sequência relevante detectada</small></div><em>ENTRADA</em></div>`).join("")}<div class="ia-reminder"><time>—</time><span>ⓘ</span><div><b>Dados adicionais</b><small>${AGUARDA}</small></div><em>SISTEMA</em></div></section><div class="ia-analysis"><b>ⓘ</b> Os lembretes exibem somente informações que o sistema já consegue confirmar.</div></div>`;
  };

  Interface._pagina_configuracoes = function(d){
    return `<div class="ia-settings"><section class="ia-setting"><div><span>●</span><div><h2>Aparência</h2><p>Escolha o tema e a aparência do sistema.</p></div></div><div class="ia-segment"><button class="ativo">Escuro</button><button disabled>Claro</button><button disabled>Automático</button></div></section><section class="ia-setting"><div><span>♧</span><div><h2>Notificações</h2><p>Escolha como e quando deseja ser notificado.</p></div></div><div class="ia-config-wait">${AGUARDA}</div></section><section class="ia-setting"><div><span>☷</span><div><h2>Tipos de lembrete</h2><p>Selecione os avisos que deseja receber.</p></div></div><div class="ia-config-wait">${AGUARDA}</div></section><section class="ia-setting"><div><span>▣</span><div><h2>Exibição</h2><p>Ajuste como as informações são mostradas.</p></div></div><div><label>Resultados recentes na Home <select id="ia-home-count"><option>10</option><option>5</option><option>20</option></select></label><label>Exibir porcentagens <input type="checkbox" checked disabled></label></div></section><section class="ia-setting"><div><span>◉</span><div><h2>Dados e Desempenho</h2><p>Gerencie os dados locais do aplicativo.</p></div></div><div><button id="ia-save-data" class="ia-outline-btn">Salvar backup</button><button id="ia-load-data" class="ia-outline-btn">Carregar backup</button></div></section><section class="ia-setting"><div><span>ⓘ</span><div><h2>Sobre</h2><p>Informações do sistema.</p></div></div><div><label>Versão do sistema <b>Atual</b></label><label>Última atualização <b>04/09/2026</b></label></div></section></div>`;
  };

  Interface._eventosPaginaModerna = function(){
    document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{this._paginaModerna=b.dataset.go;this._renderModerno();});
    document.querySelectorAll("[data-score]").forEach(b=>b.onclick=()=>this.registrarRapido(b.dataset.score));
    const custom=document.getElementById("ia-register-custom"); if(custom) custom.onclick=()=>this.registrarRapido(document.getElementById("ia-custom-score")?.value||"");
    const save=document.getElementById("ia-save-data"); if(save) save.onclick=()=>document.getElementById("btn-salvar")?.click();
    const load=document.getElementById("ia-load-data"); if(load) load.onclick=()=>document.getElementById("btn-carregar")?.click();
  };

  Interface._estilosModernos = function(){
    if(document.getElementById("ia-modern-css"))return;
    const st=document.createElement("style");st.id="ia-modern-css";st.textContent=`
:root{--bg:#030815;--panel:#061020;--panel2:#091426;--line:#112846;--text:#f7f8ff;--muted:#aeb9d2;--purple:#7a00ff;--magenta:#e500ff;--cyan:#00c8ff;--green:#00e884;--yellow:#ffc400;--red:#ff324c}
html,body{min-height:100%;background:#020611!important}.ia-legado{display:none!important}body{padding:0!important;margin:0!important;color:var(--text)!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}.ia-shell{min-height:100vh;display:grid;grid-template-columns:225px 1fr;background:radial-gradient(circle at 70% 0%,#071731 0,#030916 34%,#020611 70%);color:var(--text)}
.ia-sidebar{position:sticky;top:0;height:100vh;border-right:1px solid #10243d;background:linear-gradient(180deg,#030713,#020611);padding:20px 16px;display:flex;flex-direction:column;z-index:4}.ia-brand{display:flex;align-items:center;gap:10px;font-size:20px;margin:2px 4px 24px}.ia-logo{width:44px;height:44px;display:grid;place-items:center;font-size:36px;color:var(--magenta);filter:drop-shadow(0 0 10px #b000ff)}.ia-brand-text{display:flex;flex-direction:column;line-height:1.05}.ia-brand-text strong{font-size:20px;letter-spacing:.02em}.ia-brand-text small{font-size:11px;letter-spacing:.24em;color:#bda8ff;margin-top:4px;font-weight:700}.ia-nav{display:flex;flex-direction:column;gap:7px}.ia-nav-item{border:0;background:transparent;color:#e9ecf6;text-align:left;padding:13px 14px;border-radius:7px;font-size:15px;display:flex;align-items:center;gap:14px;cursor:pointer}.ia-nav-item span{font-size:22px;width:25px}.ia-nav-item:hover,.ia-nav-item.ativo{background:linear-gradient(90deg,#4d00bf,#5f08c8 60%,#3c087f);box-shadow:inset 0 0 0 1px #7d19ea}.ia-side-bottom{margin-top:auto;display:grid;gap:12px}.ia-online,.ia-user{border:1px solid #10303a;border-radius:8px;padding:13px;display:flex;align-items:center;gap:10px;background:#031117}.ia-online .ia-dot{width:13px;height:13px;border-radius:50%;background:#00e89b;box-shadow:0 0 14px #00e89b}.ia-online b{color:#00e89b}.ia-online small,.ia-user small{display:block;color:#d6dced;margin-top:6px}.ia-user{border-color:#121c36;background:#030713}.ia-user>span{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#270065,#6d00d9);border:1px solid #8d22ff;font-size:20px}.ia-user i{margin-left:auto;font-size:28px}
.ia-main{min-width:0}.ia-topbar{height:82px;border-bottom:1px solid #10223a;display:flex;justify-content:space-between;align-items:center;padding:13px 28px;background:linear-gradient(180deg,rgba(5,15,31,.78),rgba(3,9,22,.4));position:sticky;top:0;z-index:3;backdrop-filter:blur(12px)}.ia-topbar h1{font-size:28px!important;margin:0!important;letter-spacing:.01em}.ia-topbar p{margin:4px 0 0!important;color:#d2d9e9}.ia-clock{display:flex;align-items:center;gap:11px;font-size:25px}.ia-clock div{display:flex;flex-direction:column}.ia-clock b{font-size:18px}.ia-clock small{font-size:12px;color:#dce3f4}.ia-bell{position:relative;margin-left:24px}.ia-bell em{position:absolute;right:-5px;top:-4px;width:14px;height:14px;border-radius:50%;background:red;font-size:9px;display:grid;place-items:center;font-style:normal}.ia-content{padding:14px;max-width:1500px;margin:0 auto}.ia-main footer{text-align:center;color:#f000ff;padding:20px;border-top:1px solid #10223a;margin-top:14px}
.ia-card{background:linear-gradient(145deg,rgba(7,17,34,.96),rgba(4,10,23,.97));border:1px solid #152945;border-radius:10px;padding:16px;box-shadow:inset 0 1px rgba(255,255,255,.02)}.ia-card h2{font-size:16px;margin:0 0 12px}.ia-grid-home{display:grid;grid-template-columns:1.25fr .85fr .72fr;gap:14px}.ia-next{grid-column:span 2}.ia-wide{grid-column:1/-1}.ia-card-title{font-weight:800}.ia-chip{font-size:11px;padding:5px 8px;border-radius:5px;background:#3f1479;color:#d8c2ff;margin-left:8px}.ia-next-body{display:grid;grid-template-columns:130px 1fr;gap:20px;align-items:center;margin-top:12px}.ia-count{border:1px solid #1a2744;border-radius:9px;padding:20px;text-align:center}.ia-count small{display:block;color:#c9d1e3}.ia-count b{font-size:30px}.ia-match-empty,.ia-match-config{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;min-height:115px;text-align:center}.ia-match-empty span,.ia-match-config:first-letter{color:var(--magenta)}.ia-match-empty strong,.ia-match-config strong{color:#caa9ff}.ia-match-empty small,.ia-match-config small,.ia-muted{color:var(--muted)}.ia-confidence{text-align:center}.ia-ring{width:110px;height:110px;margin:12px auto;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#21e382 0 38%,#8227ff 38% 70%,#142035 70%);position:relative}.ia-ring:after{content:"";position:absolute;inset:10px;background:#07101f;border-radius:50%}.ia-ring b{z-index:1;font-size:28px}.ia-confidence>strong{color:var(--green)}.ia-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.ia-section-head h2{margin:0}.ia-section-head button,.ia-section-head span{border:0;background:none;color:#e65cff;cursor:pointer}.ia-market-strip,.ia-market-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.ia-market-grid{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px}.ia-market-card{border:1px solid #26314c;background:#070d1a;border-radius:9px;padding:13px;min-width:0}.ia-market-card.ativo{border-color:#2c6f48}.ia-market-card h3{font-size:14px;margin:0 0 12px;color:#f1f3fa}.ia-market-value{font-size:22px;font-weight:800;color:#95a5c4;min-height:52px;overflow-wrap:anywhere}.ia-market-card.ativo .ia-market-value{color:#65ee67}.ia-meter{height:7px;background:#122039;border-radius:999px;overflow:hidden;margin:8px 0}.ia-meter span{height:100%;display:block;background:linear-gradient(90deg,#68de79,#00df91);border-radius:999px}.ia-market-foot{display:flex;justify-content:space-between;color:#8997b2;font-size:11px}.ia-market-foot b{color:#dbe4f7}.ia-table{display:grid}.ia-row{display:grid;grid-template-columns:42px minmax(150px,1.5fr) minmax(140px,1fr) 120px;gap:12px;align-items:center;padding:11px 8px;border-bottom:1px solid #142238}.ia-rank{width:27px;height:27px;border-radius:50%;border:1px solid #8ca91d;display:grid;place-items:center;color:#d9ff33}.ia-tag{padding:7px 10px;text-align:center;border-radius:5px;border:1px solid}.ia-tag.ok{color:var(--green);border-color:#087642;background:#062b1c}.ia-tag.warn{color:var(--yellow);border-color:#6c5600;background:#2a2203}.ia-score-list{display:flex;flex-wrap:wrap;gap:7px}.ia-score-list span{padding:8px;border-radius:5px;background:#082213;color:#73ff6f;border:1px solid #174a28;font-weight:800}.ia-stat-big{font-size:42px;font-weight:800;color:#b875ff}.ia-chart-placeholder{height:140px;display:grid;place-items:center;color:#9776b9;background:linear-gradient(180deg,rgba(126,19,223,.12),transparent);border-bottom:1px solid #532175}.ia-tip{border-color:#7c22bd;background:linear-gradient(90deg,#17072b,#0b071d)}.ia-tip b{color:#e59cff}.ia-await,.ia-config-wait{padding:24px;text-align:center;color:#9c8bb9;border:1px dashed #3e285e;border-radius:8px;background:#090818}
.ia-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ia-score-buttons{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}.ia-score-buttons button,.ia-custom-score button,.ia-filter-row button,.ia-outline-btn{border:1px solid #3e2764;background:#12062e;color:#eee;border-radius:6px;padding:10px;cursor:pointer}.ia-score-buttons button:hover{border-color:#a725ff;background:#2a075d}.ia-custom-score{display:flex;gap:8px;margin-top:12px}.ia-custom-score input{flex:1;background:#06101f;color:white;border:1px solid #1a3557;border-radius:6px;padding:11px}.ia-note{color:#95a2bb;font-size:12px}.ia-history{display:grid;gap:4px;max-height:630px;overflow:auto}.ia-history>div{display:grid;grid-template-columns:85px 1fr 100px;gap:10px;padding:9px 10px;border-bottom:1px solid #122238;align-items:center}.ia-history b{color:#78f083;font-size:17px}.ia-history small{color:#8794ac}.ia-history-full>div{grid-template-columns:60px 100px 110px 1fr}.ia-empty-table .ia-row{grid-template-columns:50px 90px 1fr 120px}.ia-entries>section:nth-child(2){min-height:650px}.ia-info-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0 18px}.ia-info-cards>div{border:1px solid #172945;border-radius:8px;padding:12px;text-align:center}.ia-info-cards small{display:block;color:#9da9c2}.ia-info-cards b{font-size:20px}.ia-analysis{border:1px solid #642297!important;background:linear-gradient(100deg,#1b0737,#100923)!important;border-radius:9px;padding:14px;color:#d9c8f2}.ia-analysis b{color:#ec46ff}.ia-analysis p{line-height:1.6}.ia-markets-page{grid-template-columns:1.8fr 1fr}.ia-markets-page aside{display:grid;align-content:start;gap:10px}.ia-selected>div{display:grid;grid-template-columns:1fr 2fr 100px;gap:12px;align-items:center;margin-top:10px}.ia-selected strong{color:#a995c9}.ia-selected time{text-align:center;font-size:20px}.ia-reminders{display:grid;gap:16px}.ia-filter-row{display:flex;gap:12px}.ia-filter-row button{min-width:160px;font-size:15px}.ia-filter-row button.ativo{background:linear-gradient(135deg,#3b05a8,#6613e5);border-color:#7f23ff}.ia-filter-row .outline{margin-left:auto;background:transparent;border-color:#b918ff}.ia-reminder{display:grid;grid-template-columns:100px 54px 1fr 110px;gap:14px;align-items:center;padding:17px;border-bottom:1px solid #193250}.ia-reminder time{font-size:20px;font-weight:800}.ia-reminder>span{font-size:30px;color:#aa45ff}.ia-reminder div{display:flex;flex-direction:column;gap:4px}.ia-reminder small{color:#afbdd5}.ia-reminder em{font-style:normal;border:1px solid #593ab8;border-radius:5px;padding:8px;text-align:center;color:#c9afff;background:#17103a}.ia-settings{display:grid;gap:12px}.ia-setting{border:1px solid #143051;background:linear-gradient(110deg,#061324,#06101d);border-radius:10px;padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:center}.ia-setting>div:first-child{display:flex;gap:18px;align-items:flex-start}.ia-setting>div:first-child>span{font-size:30px;color:#b883ff}.ia-setting h2{margin:0 0 4px}.ia-setting p{color:#b5bfd2;margin:0}.ia-setting>div:last-child{display:grid;gap:8px}.ia-setting label{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #11243d;padding:8px}.ia-setting select{background:#061326;color:white;border:1px solid #16528c;border-radius:5px;padding:7px}.ia-segment{display:grid!important;grid-template-columns:repeat(3,1fr)}.ia-segment button{padding:12px;background:#071322;border:1px solid #16416b;color:#eee}.ia-segment .ativo{background:linear-gradient(135deg,#4b06c3,#6f0de6)}.ia-outline-btn{border-color:#b417ef;background:transparent}
@media(max-width:1100px){.ia-shell{grid-template-columns:190px 1fr}.ia-market-strip{grid-template-columns:repeat(3,1fr)}.ia-market-grid{grid-template-columns:repeat(2,1fr)}.ia-grid-home{grid-template-columns:1fr 1fr}.ia-next{grid-column:auto}.ia-confidence{grid-column:auto}}
@media(max-width:760px){.ia-shell{display:block}.ia-sidebar{position:relative;width:100%;height:auto;padding:10px}.ia-brand{margin:0 0 8px}.ia-nav{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.ia-nav-item{padding:9px 6px;font-size:11px;justify-content:center;flex-direction:column;gap:3px;text-align:center}.ia-nav-item span{font-size:18px;width:auto}.ia-side-bottom{display:none}.ia-topbar{position:relative;height:auto;padding:14px}.ia-topbar h1{font-size:22px!important}.ia-topbar p{font-size:12px}.ia-clock{font-size:18px}.ia-clock b{font-size:14px}.ia-bell{display:none}.ia-content{padding:8px}.ia-grid-home,.ia-two,.ia-markets-page{grid-template-columns:1fr}.ia-next,.ia-wide{grid-column:auto}.ia-market-strip,.ia-market-grid{grid-template-columns:repeat(2,1fr)}.ia-row{grid-template-columns:32px 1fr!important;gap:5px}.ia-row>*:nth-child(n+3){grid-column:2}.ia-score-buttons{grid-template-columns:repeat(4,1fr)}.ia-selected>div{grid-template-columns:1fr}.ia-filter-row{display:grid;grid-template-columns:1fr 1fr}.ia-filter-row button{min-width:0}.ia-filter-row .outline{margin-left:0}.ia-reminder{grid-template-columns:70px 36px 1fr}.ia-reminder em{grid-column:3}.ia-setting{grid-template-columns:1fr}.ia-market-value{font-size:17px}.ia-next-body{grid-template-columns:1fr}.ia-history>div,.ia-history-full>div{grid-template-columns:70px 1fr}.ia-history small{grid-column:2}.ia-main footer{font-size:11px}}
`;
    document.head.appendChild(st);
  };
})();
