"use strict";

const Interface = {
    iniciar(){
        const app=document.getElementById('app'); if(!app)return;
        this.criarEstilos();
        app.innerHTML=`<div class="painel">
          <header><h1>Painel de Padrões Fictícios</h1><div id="hora-atual" class="hora-atual">🕒 Hora em Londres: --:--:--</div><div id="relogio-partidas" class="relogio-partidas">⚽ Horário da partida atual: --:-- · <b>Próximo jogo: --:--</b></div>
            <div class="entrada-resultados">
              <div class="rotulo-entrada">Registrar resultado do jogo encerrado</div>
              <div id="botoes-resultados" class="botoes-resultados"></div><div id="status-horario-entrada" class="status-horario-entrada"></div>
              <div class="resultado-personalizado"><button id="btn-outro-placar" class="cinza">Outro placar</button><input id="campo-outro-placar" inputmode="numeric" placeholder="Ex.: 5x2" hidden><button id="btn-confirmar-outro" class="azul" hidden>Registrar</button></div>
              <div class="resultado-outro-horario"><button id="btn-outro-horario" class="cinza">Resultado de outro horário</button><div id="form-outro-horario" class="form-outro-horario" hidden><input id="campo-outro-horario" type="time" step="180" aria-label="Horário da partida"><div class="placar-outro-horario-separado"><input id="campo-outro-horario-casa" type="number" min="0" step="1" inputmode="numeric" placeholder="Casa" aria-label="Gols do time da casa"><span class="separador-x-outro-horario">x</span><input id="campo-outro-horario-fora" type="number" min="0" step="1" inputmode="numeric" placeholder="Visitante" aria-label="Gols do time visitante"></div><button id="btn-confirmar-outro-horario" class="azul">Registrar</button></div></div>
            </div>
            <div class="acoes"><button id="btn-salvar" class="verde">▣ Salvar na Pasta</button><button id="btn-carregar" class="ciano">▰ Carregar da Pasta</button><input id="arquivo-carregar" type="file" accept="application/json" hidden></div>
          </header>
          <div class="topo">
            <section class="cartao azulb probabilidade"><h2>Probabilidade dos Próximos Resultados</h2><div class="cabecalho-probabilidade"><p><b>Resultados com horário: <span id="total-sessao">0</span></b></p><p>Último registro: <b id="ultimo-registro">-</b></p></div><div class="previsao">
              <p class="proxima-partida-destaque">🎯 <b>PREVISÃO PARA O JOGO DAS <span id="proximo-horario">--:--</span></b></p><p id="palpite-registrado-status" class="palpite-registrado-status"></p><p>🎯 <b>Previsão combinada:</b> <span id="prev-combinada"></span></p>
              <p>🎯 <b>Placar Exato:</b> <span id="prev-placar"></span></p>
              <p>🏆 <b>Resultado (1X2):</b> <span id="prev-resultado"></span></p>
              <p>📊 <b>Quantidade de Gols:</b> <span id="prev-gols"></span></p>
              <p>🤝 <b>Ambos Marcam:</b> <span id="prev-btts"></span></p>
              <p>⚽ <b>Over / Under 0.5:</b> <span id="prev-ou05"></span></p><p>🧊 <b>Especialista O/U0.5 (foco U):</b> <span id="prev-under05"></span></p>
              <p>⚽ <b>Over / Under 1.5:</b> <span id="prev-ou15"></span></p>
              <p>⚽ <b>Over / Under 2.5:</b> <span id="prev-ou25"></span></p>
              <p>⚽ <b>Under 3.5 (filtro):</b> <span id="prev-ou35"></span></p><p>🔥 <b>Especialista O3.5:</b> <span id="prev-over35"></span></p>
              <p>🔄 <b>Sequência temporal contínua:</b> <span id="sequencia-atual"></span></p><div class="ultimos-registros"><b>Últimos 10 resultados com horário:</b><div id="ultimos-sequencia"></div></div>
            </div></section>
          </div>
          <section id="consultor-entradas" class="cartao consultor-entradas"><h2>🧭 Consultor de Entradas</h2><p class="muted">Calculando…</p></section>
          <section class="cartao avancada"><h2>Análise Avançada de Gols e Ambos Marcam</h2>
            <div class="mercados"><div><h3>📌 Resultado da Previsão Anterior</h3><div id="anterior"></div></div><div><h3>📊 Outros Mercados</h3><div id="outros"></div></div></div>
            <div class="analise"><h3>🔍 Análise Antecipada de Padrões</h3>
              <div id="grade-mercados" class="grade-mercados"></div>
            </div>
          </section>
        </div>`;
        this.eventos(); if(typeof RelogioPartidas!=='undefined'){ RelogioPartidas.iniciar(); RelogioPartidas.observar(()=>this.atualizar()); } this.atualizar(); console.log('Interface iniciada.');
    },
    eventos(){
        const container=document.getElementById('botoes-resultados');
        const resultadosRapidos=['0x0','1x0','0x1','1x1','2x0','0x2','2x1','1x2','2x2','3x0','0x3','3x1','1x3','3x2','2x3','3x3','4x0','0x4','4x1','1x4','4x2','2x4','4x3','3x4','4x4'];
        container.innerHTML=resultadosRapidos.map(v=>`<button class="btn-placar" data-placar="${v}">${v}</button>`).join('');
        container.querySelectorAll('.btn-placar').forEach(btn=>btn.onclick=()=>this.registrarRapido(btn.dataset.placar));
        const outro=document.getElementById('btn-outro-placar'), campoOutro=document.getElementById('campo-outro-placar'), confirmar=document.getElementById('btn-confirmar-outro');
        outro.onclick=()=>{campoOutro.hidden=!campoOutro.hidden;confirmar.hidden=campoOutro.hidden;if(!campoOutro.hidden)campoOutro.focus();};
        confirmar.onclick=()=>{this.registrarRapido(campoOutro.value.trim());};
        campoOutro.addEventListener('keydown',e=>{if(e.key==='Enter')confirmar.click();});

        const btnOutroHorario=document.getElementById('btn-outro-horario');
        const formOutroHorario=document.getElementById('form-outro-horario');
        const campoOutroHorario=document.getElementById('campo-outro-horario');
        const campoOutroHorarioCasa=document.getElementById('campo-outro-horario-casa');
        const campoOutroHorarioFora=document.getElementById('campo-outro-horario-fora');
        const confirmarOutroHorario=document.getElementById('btn-confirmar-outro-horario');
        const montarPlacarOutroHorario=()=>{
            const casa=String(campoOutroHorarioCasa.value ?? '').trim();
            const fora=String(campoOutroHorarioFora.value ?? '').trim();
            if(casa==='' || fora==='') return '';
            return `${casa}x${fora}`;
        };
        btnOutroHorario.onclick=()=>{
            formOutroHorario.hidden=!formOutroHorario.hidden;
            if(!formOutroHorario.hidden){
                const atual=typeof RelogioPartidas!=='undefined'?RelogioPartidas.partidaAnterior():null;
                if(atual) campoOutroHorario.value=atual.horario;
                campoOutroHorarioCasa.focus();
            }
        };
        confirmarOutroHorario.onclick=()=>this.registrarOutroHorario(campoOutroHorario.value, montarPlacarOutroHorario());
        [campoOutroHorario,campoOutroHorarioCasa,campoOutroHorarioFora].forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter')confirmarOutroHorario.click();}));
        document.getElementById('btn-salvar').onclick=()=>{ const blob=new Blob([JSON.stringify(Historico.obterDadosBrutos(),null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='esportes-virtuais-sessao.json'; a.click(); URL.revokeObjectURL(a.href); };
        const file=document.getElementById('arquivo-carregar'); document.getElementById('btn-carregar').onclick=()=>file.click(); file.onchange=()=>{const f=file.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!Array.isArray(d))throw Error();Historico.carregarDados(d,true);Historico.definirBaseEstudo(Historico.obterQuantidade());localStorage.setItem('esportes_virtuais_base_estudo_qtd',String(Historico.obterQuantidade()));this.atualizar();}catch(e){alert('Arquivo inválido.');}};r.readAsText(f);};
    },
    registrarRapido(v){
        // Os botões de resultado do jogo encerrado só podem ser usados
        // nos últimos 75 segundos antes do próximo slot começar.
        if (typeof RelogioPartidas !== 'undefined' && !RelogioPartidas.janelaRegistroResultadoAberta()) {
            this.atualizar();
            return;
        }
        const alvoResultado = typeof RelogioPartidas !== 'undefined'
            ? RelogioPartidas.partidaParaRegistrarResultado()
            : null;
        const r = Historico.adicionar(v, true, alvoResultado);
        if (r && r.duplicado) {
            alert(`O horário ${r.temporal.horario} já possui resultado registrado.\n\nCada partida aceita somente 1 resultado.`);
            this.atualizar();
            return;
        }
        if(!r){
            alert('Placar inválido. Use o formato 2x1.');
            return;
        }
        const campo=document.getElementById('campo-outro-placar');
        if(campo){campo.value='';campo.hidden=true;document.getElementById('btn-confirmar-outro').hidden=true;}
        if(typeof Sincronizacao!=='undefined'){ if(typeof Sincronizacao.publicarResultado==='function') Sincronizacao.publicarResultado(r); else Sincronizacao.sincronizarAgora(); }
        if(typeof Aprendizado!=='undefined' && Aprendizado.aprenderPendentes){
            Aprendizado.aprenderPendentes(Historico.obterTodos());
        }
        this.atualizar();
    },
    registrarOutroHorario(horario, placar){
        if(typeof RelogioPartidas==='undefined'){alert('Relógio das partidas indisponível.');return;}
        const alvo=RelogioPartidas.slotPorHorario(horario);
        if(!alvo){
            alert('Horário inválido. Use um horário de partida de 3 em 3 minutos, por exemplo 04:18.');
            return;
        }
        const agora=RelogioPartidas.agora();
        const atual=RelogioPartidas.partidaAtual();
        const alvoMin=alvo.hora*60+alvo.minuto;
        const atualMin=atual.hora*60+atual.minuto;
        // O formulário é destinado a partidas anteriores. Não permite inserir
        // uma partida futura por engano; resultados futuros continuam sendo
        // registrados somente quando o relógio chegar ao slot.
        const hoje=alvo.data===agora.data;
        if(hoje && alvoMin>atualMin){
            alert(`O horário ${alvo.horario} ainda é futuro. Aguarde a partida chegar ou informe uma partida anterior.`);
            return;
        }
        const r=Historico.adicionar(placar,true,{...alvo,__fonte:'ao-vivo'});
        if(r&&r.duplicado){
            const existente=Historico.obterResultadoNoHorario(alvo);
            alert(`O horário ${alvo.horario} já possui resultado registrado${existente?.placar?`: ${existente.placar}`:''}.`);
            return;
        }
        if(!r){alert('Resultado inválido. Use o formato 2x1.');return;}
        document.getElementById('campo-outro-horario').value='';
        document.getElementById('campo-outro-horario-casa').value='';
        document.getElementById('campo-outro-horario-fora').value='';
        document.getElementById('form-outro-horario').hidden=true;
        if(typeof Sincronizacao!=='undefined'){ if(typeof Sincronizacao.publicarResultado==='function') Sincronizacao.publicarResultado(r); else Sincronizacao.sincronizarAgora(); }
        if(typeof Aprendizado!=='undefined' && Aprendizado.aprenderPendentes){
            Aprendizado.aprenderPendentes(Historico.obterTodos());
        }
        this.atualizar();
    },
    atualizarEstadoBotoes() {
        const container = document.getElementById('botoes-resultados');
        const status = document.getElementById('status-horario-entrada');
        const outro = document.getElementById('btn-outro-placar');
        const confirmar = document.getElementById('btn-confirmar-outro');
        if (!container || typeof RelogioPartidas === 'undefined') return;
        const partidaEmJogo = RelogioPartidas.partidaAtual();
        const partidaResultado = RelogioPartidas.partidaParaRegistrarResultado();
        // Quando o relógio avança para um novo slot, qualquer slot anterior
        // que não recebeu resultado é marcado separadamente como SEM DADOS.
        // Ele não entra no histórico de placares e não contamina as sequências.
        if(!this._ultimoSlotObservado){
            this._ultimoSlotObservado=partidaEmJogo;
        }else if(this._ultimoSlotObservado.data!==partidaEmJogo.data || this._ultimoSlotObservado.horario!==partidaEmJogo.horario){
            let cursor=this._ultimoSlotObservado;
            let guard=0;
            while((cursor.data!==partidaEmJogo.data || cursor.horario!==partidaEmJogo.horario) && guard<100){
                if(!Historico.temResultadoNoHorario(cursor)) Historico.registrarHorarioSemDados(cursor);
                cursor=RelogioPartidas._addMinutes(cursor,3);
                guard++;
            }
            this._ultimoSlotObservado=partidaEmJogo;
        }
        const registrado = Historico.obterResultadoNoHorario(partidaResultado);
        const proxima = RelogioPartidas.proximaPartida();
        const restante = RelogioPartidas.segundosAteProximaPartida();
        const janelaRegistro = RelogioPartidas.janelaRegistroResultadoAberta();
        const podeRegistrar = janelaRegistro && !registrado;

        // Os botões de resultado do jogo encerrado ficam bloqueados até
        // faltarem exatamente 1min15 para a próxima partida.
        container.querySelectorAll('.btn-placar').forEach(btn => btn.disabled = !podeRegistrar);
        if (outro) outro.disabled = !podeRegistrar;
        if (confirmar) confirmar.disabled = !podeRegistrar;
        if (status) {
            const semDados=Historico.estaSemDados(partidaResultado);
            const fmt = (s) => `${Math.floor(Math.max(0,s)/60)}:${String(Math.max(0,s)%60).padStart(2,'0')}`;
            const segundosAteLiberar = Math.max(0, restante - RelogioPartidas.JANELA_REGISTRO_RESULTADO_SEGUNDOS);
            const horarioLiberacao = RelogioPartidas.horarioLiberacaoRegistro();
            status.innerHTML = registrado
                ? `🔒 Resultado da partida <b>${partidaResultado.horario}</b> já registrado: <b>${registrado.placar}</b> · próxima partida: <b>${proxima.horario}</b>`
                : semDados
                    ? `⚪ Partida <b>${partidaResultado.horario}</b> ficou <b>SEM DADOS</b> · use “Resultado de outro horário” se descobrir depois · próxima partida: <b>${proxima.horario}</b>`
                    : janelaRegistro
                        ? `🟢 <b>Registro liberado</b> para a partida <b>${partidaResultado.horario}</b> · faltam <b>${fmt(restante)}</b> para a próxima partida <b>${proxima.horario}</b>`
                        : `🔒 <b>Registro bloqueado</b> · será liberado às <b>${horarioLiberacao}</b> (faltam <b>${fmt(segundosAteLiberar)}</b>) · próxima partida: <b>${proxima.horario}</b>`;
        }
    },
    status(ok){return ok?'<span class="green">✓ GREEN</span>':'<span class="red">✕ RED</span>';},
    pct(v){return `${v.toFixed(1)}%`;},
    atualizar(){
        const r=Historico.obterTodos(), ultimo=Historico.obterUltimoAoVivo(), seq=Historico.obterSequenciaAtual();
        if(typeof RelogioPartidas!=='undefined'){ const a=RelogioPartidas.agora(), atual=RelogioPartidas.partidaAtual(), n=RelogioPartidas.proximaPartida(); const hora=document.getElementById('hora-atual'), el=document.getElementById('relogio-partidas'), ph=document.getElementById('proximo-horario'); if(hora)hora.innerHTML=`🕒 Hora em Londres: <b>${String(a.hour).padStart(2,'0')}:${String(a.minute).padStart(2,'0')}:${String(a.second).padStart(2,'0')}</b>`; if(el)el.innerHTML=`⚽ Horário da partida atual: <b>${atual.horario}</b> · <b>Próximo jogo: ${n.horario}</b>`; if(ph)ph.textContent=n.horario; }
        this.atualizarEstadoBotoes();
        // A janela de 1min15 é EXCLUSIVA dos botões de registro do resultado.
        // Ela não controla a liberação das previsões.
        const liberado = seq.length>=3;
        const statusPalpite=document.getElementById('palpite-registrado-status');
        if(statusPalpite && typeof RelogioPartidas!=='undefined' && typeof PalpitesRegistrados!=='undefined'){
            const atual=RelogioPartidas.partidaAtual();
            const reg=PalpitesRegistrados.obterParaPartida(atual);
            // Não mostrar a janela de 1min15 aqui: ela pertence somente ao
            // registro do resultado encerrado.
            statusPalpite.innerHTML=reg
              ? `📝 <b>Palpite registrado para o jogo das ${atual.horario}</b> · recuperado na abertura do app`
              : '';
        }

        const dados=Previsoes.gerar(r,seq,{liberarPalpite:liberado}).mercados; if(liberado && typeof PalpitesRegistrados!=='undefined' && typeof RelogioPartidas!=='undefined') PalpitesRegistrados.salvarUltimo(dados,RelogioPartidas.proximaPartida()); const resumoGreenRed=GreenRed.resumo(r), anterior=resumoGreenRed.anterior, sequencias=resumoGreenRed.sequencias, p=this.pct.bind(this);
        const eventosSessao=typeof Historico.obterUltimosEventosSessao==='function'?Historico.obterUltimosEventosSessao(10):seq.slice(-10).map(x=>({tipo:'resultado',placar:x.placar,horario:x?._temporal?.horario||''}));
        const ultimoEvento=eventosSessao.at(-1)||null;
        document.getElementById('total-sessao').textContent=seq.length;
        document.getElementById('ultimo-registro').textContent=ultimoEvento?`${ultimoEvento.placar} · ${ultimoEvento.horario||'--:--'}`:'-';
        document.getElementById('sequencia-atual').textContent=seq.length;
        document.getElementById('ultimos-sequencia').innerHTML=eventosSessao.length?eventosSessao.map(x=>`<span title="${x.data||''} ${x.horario||''}"><b>${x.horario||'--:--'}</b> ${x.placar}</span>`).join('<b class="seta">→</b>'):'<span class="muted">Nenhum resultado com horário registrado.</span>';
        const adapter={exato:MercadoPlacarExato,gols:MercadoGolsExatos,r12:MercadoResultado1X2,bm:MercadoAmbosMarcam,ou05:MercadoOverUnder05,under05:MercadoUnder05,ou15:MercadoOverUnder15,ou25:MercadoOverUnder25,ou35:MercadoOverUnder35,over35:MercadoOver35};
        const texto=k=>{
            const d=dados[k];
            if(!(d?.ativo&&d?.palpite))return '⏳ Aguardando atualizações';
            if(k==='under05'&&d.probabilidades){
                const o=Number(d.probabilidades.MAIS)||0,u=Number(d.probabilidades.MENOS)||0;
                const alerta=d.alertaUnder?.nivel?` · alerta U: ${d.alertaUnder.nivel}`:'';
                return `<b>${adapter[k].rotulo(d.palpite.valor)}</b> · O ${p(o)} | U ${p(u)}${alerta}`;
            }
            return `${adapter[k].rotulo(d.palpite.valor)} <small>(${p(d.palpite.percentual)})</small>`;
        };
        const freqs=(k,vals)=>vals.map(([v,label])=>{const x=dados[k]?.frequencias.lista.find(a=>a.valor===v);return `<p>• ${label}: <b>${x?p(x.percentual):'—'}</b></p>`}).join('');
        const desc=k=>{
            const d=dados[k],pd=d?.padrao;
            if(k==='under05'){
                const a=d?.alertaUnder||{};
                const ctx=Array.isArray(pd?.contexto)?pd.contexto.map(v=>v==='MAIS'?'O':'U').join(' → '):'';
                const padrao=pd?.encontrado?`padrão ${ctx||'O/U'} · ${pd.ocorrencias?.length||0} ocorrência(s) · U depois do padrão ${p(pd.taxaUnder||0)}`:'nenhum padrão binário forte agora';
                return `🧠 ${padrao}. O padrão é apenas apoio. Alerta U: <b>${a.nivel||'—'}</b> · corrida atual de O: <b>${a.corridaOver??0}</b>.`;
            }
            if(d?.ativo&&pd){const oc=pd.ocorrencias?.length||0,tam=pd.tamanho||0,ctx=Array.isArray(pd.contexto)?pd.contexto.join(' → '):'';return `🔵 PADRÃO ENCONTRADO · ${oc} ocorrência(s) · sequência de ${tam}${ctx?`: ${ctx}`:''}`;}
            return `⚪ PADRÃO NÃO IDENTIFICADO para a sequência atual. O histórico completo continua sendo estudado; sem evidência suficiente, este mercado apenas aguarda e não entra.`;
        };
        document.getElementById('prev-combinada').innerHTML=liberado?'Motor experimental: histórico completo estudado · previsão liberada':'⏳ Previsão aguardando '+Math.max(0,3-seq.length)+' resultado(s) novo(s) para liberar o palpite';
        document.getElementById('prev-placar').innerHTML=texto('exato');
        document.getElementById('prev-resultado').innerHTML=texto('r12');
        document.getElementById('prev-gols').innerHTML=texto('gols');
        document.getElementById('prev-btts').innerHTML=texto('bm');
        document.getElementById('prev-ou05').innerHTML=texto('ou05');
        document.getElementById('prev-under05').innerHTML=texto('under05');
        document.getElementById('prev-ou15').innerHTML=texto('ou15');
        document.getElementById('prev-ou25').innerHTML=texto('ou25');
        document.getElementById('prev-ou35').innerHTML=dados.ou35?.bloqueado?`🚫 Bloqueado — ${dados.ou35.motivoBloqueio}`:texto('ou35');
        document.getElementById('prev-over35').innerHTML=texto('over35');
        const historicoForma=(st)=>{const ultimos=(st?.historico||[]).slice(-5);if(!ultimos.length)return '<span class="muted">Sem histórico</span>';return `<span class="forma-historico" title="Últimos ${ultimos.length} resultados">${ultimos.map((v,i)=>`<span class="bolinha ${v==='GREEN'?'bolinha-green':'bolinha-red'}" title="${v}" aria-label="${v}"></span>`).join('')}</span>`;};
        const resumoLados05=st=>{
            const lados=st?.porLado;if(!lados)return '';
            const o=lados.MAIS||{},u=lados.MENOS||{};
            const pctL=x=>x?.chamadas?p(x.acerto):'—';
            return `<div class="desempenho-lados-05"><span>O0.5: 🟢 ${o.greens||0} / 🔴 ${o.reds||0} · ${pctL(o)}</span><span>U0.5: 🟢 ${u.greens||0} / 🔴 ${u.reds||0} · ${pctL(u)}</span></div>`;
        };
        const ordemResultados={r12:['1','X','2'],bm:['SIM','NÃO'],gols:['0','1','2','3','4','5'],ou05:['MAIS','MENOS'],under05:['MAIS','MENOS'],ou15:['MAIS','MENOS'],ou25:['MAIS','MENOS'],ou35:['MENOS','MAIS'],over35:['MAIS','MENOS']};
        const rotuloResultado=(k,v)=>{
            if(k==='gols')return MercadoGolsExatos.rotulo(v);
            if(adapter[k]?.rotulo)return adapter[k].rotulo(v);
            return String(v);
        };
        const resumoIndividual=(k,st)=>{
            const mapa=st?.porResultado||{};let itens=Object.values(mapa);if(!itens.length)return '';
            const ordem=ordemResultados[k]||[];
            itens.sort((a,b)=>{const ia=ordem.indexOf(String(a.valor)),ib=ordem.indexOf(String(b.valor));if(ia>=0||ib>=0)return (ia<0?999:ia)-(ib<0?999:ib);return (b.chamadas||0)-(a.chamadas||0)||String(a.valor).localeCompare(String(b.valor));});
            const chips=itens.map(x=>{const ac=x.chamadas?p(x.acerto):'—',cap=x.ocorrencias?p(x.captura):'—',tx=p(Number(x.taxaChamada)||0);return `<span class="taxa-individual"><b>${rotuloResultado(k,x.valor)}</b> · cham. ${x.chamadas||0} (${tx}) · 🟢 ${x.greens||0}/🔴 ${x.reds||0} · acerto ${ac} · captura ${cap}</span>`;}).join('');
            return `<details class="taxas-individuais"><summary>📊 Taxas por resultado</summary><div class="taxas-individuais-grid">${chips}</div></details>`;
        };
        const linha=(titulo,k)=>{const st=sequencias[k]; const forma=historicoForma(st); const lados=k==='under05'?resumoLados05(st):''; const individual=resumoIndividual(k,st); if(!anterior||typeof anterior[k]!=='boolean')return `<div class="item-mercado"><div>• <b>${titulo}:</b> <span class="muted">Aguardando dados</span></div><div class="previsto">Previsto: ${texto(k)}</div><div class="sequencia-individual muted">Sequência: Aguardando dados</div>${lados}<div class="historico-forma"><span>Últimos 5:</span>${forma}</div>${individual}</div>`; const ok=anterior[k];const t=st.tipo==='GREEN'?`🔥 <b>${st.atual} GREEN${st.atual===1?'':'S'} consecutivo${st.atual===1?'':'s'}</b>`:`🔴 <b>${st.atual} RED${st.atual===1?'':'S'} consecutivo${st.atual===1?'':'s'}</b>`;return `<div class="item-mercado"><div>• <b>${titulo}:</b> ${this.status(ok)}</div><div class="previsto">Previsto: ${anterior.previsoes[k]||texto(k)}</div><div class="sequencia-individual ${st.tipo==='GREEN'?'green':'red'}">Sequência: ${t}</div>${lados}<div class="historico-forma"><span>Últimos ${Math.min((st.historico||[]).length,5)}:</span>${forma}</div>${individual}</div>`;};
        document.getElementById('anterior').innerHTML=linha('Placar Exato','exato')+linha('Over / Under 0.5','ou05')+linha('Especialista O/U0.5 (foco U)','under05')+linha('Over / Under 1.5','ou15')+linha('Under 3.5 (filtro)','ou35');
        document.getElementById('outros').innerHTML=linha('Especialista O3.5','over35')+linha('Over / Under 2.5','ou25')+linha('Resultado (1X2)','r12')+linha('Quantidade de Gols','gols')+linha('Ambos Marcam','bm');
        // Painéis de análise padronizados: cada mercado mostra probabilidades, tendência e o padrão que encontrou.
        const tituloTendencia=(k)=>{
            const d=dados[k];
            if(k==='under05'&&d?.probabilidades){
                const escolha=d?.palpite?adapter[k].rotulo(d.palpite.valor):'—';
                return `🎯 Chamada obrigatória: <span class="green">${escolha}</span> · leitura O ${p(d.probabilidades.MAIS)} | U ${p(d.probabilidades.MENOS)} · foco: acertar U quando o risco relativo subir`;
            }
            const fonte=d?.frequenciasHistorico||d?.frequencias;const top=fonte?.lista?.[0];if(!top)return '🎯 Tendência histórica: <span class="muted">Sem histórico</span>';const label=adapter[k]?.rotulo?adapter[k].rotulo(top.valor):top.valor;const entrada=d?.palpite?` · Entrada: <span class="green">${adapter[k].rotulo(d.palpite.valor)} (${p(d.palpite.percentual)})</span>`:' · Entrada: <span class="muted">⏳ AGUARDAR — padrão não identificado</span>';return `🎯 Tendência histórica: <span class="green">${label} (${p(top.percentual)})</span>${entrada}`;
        };
        const sequenciaPadrao=(k)=>`<h4>📌 Sequência</h4><p>${desc(k)}</p>`;
        const aprendizado=(k)=>{const a=(typeof Aprendizado!=='undefined')?Aprendizado.resumo(r,k,dados[k]):{texto:'🧠 Aprendizado indisponível',classe:'muted',sugestao:'⚪ SUGESTÃO: Dados insuficientes',classeSugestao:'muted'};return `<div class="aprendizado ${a.classe}">${a.texto}<div class="sugestao ${a.classeSugestao||'muted'}">${a.sugestao||''}</div></div>`;};
        const temporal=(k)=>{const t=dados[k]?.temporal;if(!t)return '';const classe=t.disponivel?'temporal-ativo':'temporal-aguardando';return `<div class="analise-temporal ${classe}">${t.texto}${t.disponivel&&t.forte?`<div>💡 Sugestão temporal: <b>${adapter[k].rotulo?adapter[k].rotulo(t.forte.tendencia):t.forte.tendencia}</b></div>`:''}</div>`;};
        const bloco=(titulo,conteudo,k)=>{const st=sequencias[k]||{};const tg=Number(st.totalGreens)||0,tr=Number(st.totalReds)||0;const lados=k==='under05'?resumoLados05(st):'';return `<section class="painel-mercado"><h3>${titulo}</h3><div class="totais-mercado"><span class="total-green">🟢 GREEN: ${tg}</span><span class="total-red">🔴 RED: ${tr}</span></div>${lados}${conteudo}<h4>${tituloTendencia(k)}</h4>${sequenciaPadrao(k)}${aprendizado(k)}${temporal(k)}</section>`;};
        const freqLista=(k,vals)=>{const fonte=dados[k]?.frequenciasHistorico||dados[k]?.frequencias;return vals.map(([v,label])=>{const x=fonte?.lista?.find(a=>String(a.valor)===String(v));return `<p>• ${label}: <b>${x?p(x.percentual):'—'}</b></p>`}).join('');};
        const freqTop=(k,limite=3)=>{
            const fonte=dados[k]?.frequenciasHistorico||dados[k]?.frequencias;
            const lista=[...(fonte?.lista||[])].sort((a,b)=>b.percentual-a.percentual).slice(0,limite);
            return lista.length?lista.map(x=>`<p>• ${adapter[k].rotulo(x.valor)}: <b>${p(x.percentual)}</b></p>`).join(''):'<p class="muted">• Aguardando atualizações</p>';
        };
        const golsLista=()=>{const fonte=dados.gols?.frequenciasHistorico||dados.gols?.frequencias;return [0,1,2,3,4,5].map(g=>{const x=(fonte?.lista||[]).find(a=>Number(a.valor)===g);return `<p>• ${g===5?'5 ou mais gols':g+' gol'+(g===1?'':'s')}: <b>${x?p(x.percentual):'—'}</b></p>`}).join('');};

        // Mantém o painel superior de resultado da previsão anterior, onde GREEN/RED realmente pertence.
        // Grade visual: seis cartões independentes, aproveitando toda a largura disponível.
        const paineis = [
          bloco('🎯 Placar Exato', freqTop('exato',3), 'exato'),
          bloco('🏆 Resultado do Jogo (1X2)', freqLista('r12', [['1','Vitória da Casa'],['X','Empate'],['2','Vitória do Visitante']]), 'r12'),
          bloco('🤝 Ambos Marcam', freqLista('bm', [['SIM','SIM'],['NÃO','NÃO']]), 'bm'),
          bloco('📊 Quantidade de Gols', golsLista(), 'gols'),
          bloco('⚽ Over / Under 0.5', freqLista('ou05', [['MENOS','Menos de 0.5'],['MAIS','Mais de 0.5']]), 'ou05'),
          bloco('🧊 Especialista O/U0.5 (foco U)', (()=>{const d=dados.under05||{};const h=d.frequenciasHistorico||{};const ho=(h.lista||[]).find(x=>x.valor==='MAIS'),hu=(h.lista||[]).find(x=>x.valor==='MENOS');return `<p>• Leitura atual O0.5: <b>${p(d.probabilidades?.MAIS||0)}</b></p><p>• Leitura atual U0.5: <b>${p(d.probabilidades?.MENOS||0)}</b></p><p>• Histórico O0.5: <b>${ho?p(ho.percentual):'—'}</b></p><p>• Histórico U0.5: <b>${hu?p(hu.percentual):'—'}</b></p>`;})(), 'under05'),
          bloco('⚽ Over / Under 1.5', freqLista('ou15', [['MENOS','Menos de 1.5'],['MAIS','Mais de 1.5']]), 'ou15'),
          bloco('⚽ Over / Under 2.5', freqLista('ou25', [['MENOS','Menos de 2.5'],['MAIS','Mais de 2.5']]), 'ou25'),
          bloco('⚽ Under 3.5 (filtro)', freqLista('ou35', [['MENOS','Menos de 3.5']]), 'ou35'),
          bloco('🔥 Especialista O3.5', freqLista('over35', [['MAIS','Mais de 3.5']]), 'over35')
        ];
        document.getElementById('grade-mercados').innerHTML=paineis.join('');
        if(typeof ConsultorEntradas!=='undefined' && ConsultorEntradas.atualizar){ ConsultorEntradas.atualizar({resultados:r,mercados:dados,liberado}); }
    },
    criarEstilos(){ if(document.getElementById('estilos-painel'))return; const st=document.createElement('style');st.id='estilos-painel';st.textContent=`*{box-sizing:border-box}body{margin:0;padding:10px;background:#eee;font-family:Arial,sans-serif;color:#1e293b;font-size:14px}.painel{max-width:1320px;margin:auto;background:#fff;border:1px solid #d6dce5;border-radius:4px;padding:14px;box-shadow:0 1px 4px #bbb}h1{margin:0 0 6px;font-size:22px}.hora-atual{display:block;width:max-content;max-width:100%;margin:0 0 5px;padding:7px 10px;background:#f7f8fa;border:1px solid #d9dee5;border-radius:6px;font-size:15px}.relogio-partidas{display:block;width:max-content;max-width:100%;margin:0 0 12px;padding:7px 10px;background:#eef4fb;border:1px solid #cbd9ea;border-radius:6px;font-size:13px}.proxima-partida-destaque{font-size:18px!important;padding:9px 10px;background:#eef7ff;border-left:4px solid #2684d9;border-radius:5px}.palpite-registrado-status{margin:5px 0 9px;padding:6px 9px;background:#edf9f0;border-left:4px solid #24a34a;border-radius:5px;color:#155d28;font-size:13px}.analise-temporal{margin-top:10px;padding:9px;border-radius:6px;font-size:13px;line-height:1.4}.temporal-aguardando{background:#f5f5f5;color:#666;border:1px dashed #ccc}.temporal-ativo{background:#edf9f0;border:1px solid #b9dfc1;color:#155d28}h2{font-size:17px;margin:0 0 14px}h3,h4{font-size:13px;margin:12px 0 8px}p{margin:6px 0;line-height:1.35}.entrada-resultados{display:flex;flex-direction:column;gap:8px}.rotulo-entrada{font-weight:bold;font-size:14px}.botoes-resultados{display:grid;grid-template-columns:repeat(5,minmax(52px,1fr));gap:6px}.btn-placar{border:1px solid #b8c3d0;background:#fff;color:#1e293b;border-radius:6px;padding:9px 5px;font-size:15px;font-weight:bold;cursor:pointer;min-height:40px}.btn-placar:active{transform:scale(.97);background:#eaf3ff}.resultado-personalizado{display:flex;gap:6px;align-items:center}.resultado-personalizado input{height:38px;border:1px solid #c5ccd5;padding:8px;font-size:14px;flex:1}.entrada-resultados>button,.resultado-personalizado button,.acoes button{border:0;padding:9px 15px;color:#fff;font-weight:bold;font-size:13px;cursor:pointer;border-radius:2px}.cinza{background:#64748b!important;color:#fff!important}.amarelo{background:#ffc107!important;color:#222!important}.azul{background:#2684d9}.verde{background:#199c53}.ciano{background:#278ea5}.acoes{margin:10px 0 12px;padding:9px;background:#dfe5ed}.topo{display:grid;grid-template-columns:1fr;gap:12px}.probabilidade{min-height:auto}.cabecalho-probabilidade{display:flex;gap:28px;flex-wrap:wrap;margin-bottom:8px}.probabilidade .previsao{display:grid;grid-template-columns:1fr 1fr;column-gap:30px;row-gap:2px}.cartao{background:#f5f7fa;border-left:3px solid #2784e8;padding:13px;min-height:250px}.avancada{border-left-color:#24a34a;margin-top:12px;min-height:auto}.ultimos-registros{margin-top:8px;line-height:2.1}.ultimos-registros b{font-size:13px}.ultimos-registros span{display:inline-block;font-size:14px}.registro-vazio{padding:1px 5px;border:1px dashed #94a3b8;border-radius:4px;background:#f8fafc;color:#64748b;font-weight:bold;font-size:12px!important}.seta{margin:0 5px;color:#64748b}.streak{margin:5px 0}.mercados{display:grid;grid-template-columns:1fr 1fr;gap:18px;border:1px solid #cbd3dc;border-radius:10px;background:#fff;padding:15px}.mercados h3{font-size:16px;margin:3px 0 14px}.item-mercado{margin:0 0 9px;padding:8px 10px;border:1px solid #edf0f4;border-radius:7px;background:#fbfcfd;font-size:16px;line-height:1.3}.item-mercado>div:first-child{font-size:17px}.previsto{margin-left:0;color:#596273;font-size:14px}.sequencia-individual{margin-top:2px;font-size:14px}.historico-forma{display:flex;align-items:center;gap:7px;margin-top:4px;font-size:13px;color:#596273;font-weight:bold}.desempenho-lados-05{display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;padding:5px 7px;border:1px dashed #cbd5e1;border-radius:5px;background:#f8fafc;font-size:12px;font-weight:bold}.desempenho-lados-05 span{white-space:nowrap}.taxas-individuais{margin-top:5px;border-top:1px dashed #d9dee5;padding-top:4px}.taxas-individuais summary{cursor:pointer;color:#526173;font-size:12px;font-weight:bold;user-select:none}.taxas-individuais-grid{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;max-height:150px;overflow:auto}.taxa-individual{display:inline-block;padding:3px 5px;border:1px solid #d9dee5;border-radius:4px;background:#f8fafc;font-size:11px;line-height:1.25;white-space:normal}.forma-historico{display:inline-flex;align-items:center;gap:6px}.bolinha{width:13px;height:13px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,.12);box-shadow:inset 0 1px 1px rgba(255,255,255,.35),0 1px 2px rgba(0,0,0,.16)}.bolinha-green{background:#25a95a}.bolinha-red{background:#df4050}.grade-mercados{column-count:3;column-gap:16px;margin-top:12px}.painel-mercado{display:inline-block;width:100%;vertical-align:top;break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid;margin:0 0 16px;background:#fff;border:1px solid #cbd3dc;border-radius:10px;padding:14px;min-width:0;min-height:0;box-shadow:0 1px 2px rgba(0,0,0,.04)}.painel-mercado h3{font-size:17px;margin:2px 0 6px;padding-bottom:8px;border-bottom:1px solid #e1e6ec}.totais-mercado{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 10px;padding:5px 7px;background:#f7f8fa;border:1px solid #e2e6eb;border-radius:5px;font-size:13px;font-weight:bold}.total-green{color:#159447}.total-red{color:#df4050}.painel-mercado h4{font-size:15px;margin:13px 0 7px}.painel-mercado p{font-size:14px;overflow-wrap:anywhere}.aprendizado{margin-top:12px;padding-top:9px;border-top:1px dashed #d9dee5;font-size:13px;line-height:1.4;font-weight:bold}.sugestao{margin-top:7px;font-size:14px;font-weight:bold}.analise h4{font-size:14px}.green{color:#159447;font-weight:bold}.red{color:#df4050;font-weight:bold}.blue{color:#1875d1;font-weight:bold}.muted{color:#777}.limpar{width:100%;margin-top:12px;border:0;background:#df3742;color:white;padding:10px;font-weight:bold;cursor:pointer;font-size:13px}@media(max-width:900px){.grade-mercados{column-count:2}}
/* ===== CONTROLE DE 1 RESULTADO POR PARTIDA ===== */
.status-horario-entrada{margin-top:2px;font-size:12px;font-weight:bold;color:#526173;min-height:18px}
.btn-placar{padding:6px 4px!important;min-height:34px!important;height:34px!important;font-size:14px!important;line-height:1!important;touch-action:manipulation!important;-webkit-tap-highlight-color:transparent!important}
.btn-placar:disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.4)}
.entrada-resultados .resultado-personalizado{margin-top:2px}
.resultado-outro-horario{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.form-outro-horario{display:flex;align-items:center;gap:6px;flex:1;min-width:360px}.form-outro-horario>input{height:38px;border:1px solid #c5ccd5;padding:6px 8px;font-size:14px;border-radius:3px}.form-outro-horario input[type=time]{width:105px;flex:0 0 105px}.placar-outro-horario-separado{display:flex;align-items:center;gap:6px;flex:1;min-width:180px}.placar-outro-horario-separado input{width:92px;min-width:0;height:38px;border:1px solid #c5ccd5;padding:6px 8px;font-size:16px;border-radius:3px;text-align:center}.separador-x-outro-horario{font-size:18px;font-weight:bold;color:#526173}.resultado-outro-horario button{white-space:nowrap}
@media(max-width:700px){.resultado-outro-horario{align-items:stretch}.form-outro-horario{width:100%;min-width:0;display:grid;grid-template-columns:1fr;gap:7px}.form-outro-horario input[type=time]{width:100%;min-width:0;height:44px;font-size:16px}.placar-outro-horario-separado{display:grid;grid-template-columns:1fr 24px 1fr;width:100%;min-width:0}.placar-outro-horario-separado input{width:100%;height:44px;font-size:18px}.separador-x-outro-horario{text-align:center}.form-outro-horario button{min-height:44px}}
@media(max-width:700px){.botoes-resultados{grid-template-columns:repeat(5,minmax(44px,1fr));gap:5px}.btn-placar{min-height:34px!important;height:34px!important;font-size:14px!important;padding:5px 3px!important}.status-horario-entrada{font-size:12px}}
@media(max-width:700px){body{font-size:15px}.botoes-resultados{grid-template-columns:repeat(5,1fr)}.topo,.mercados,.probabilidade .previsao{grid-template-columns:1fr}.grade-mercados{column-count:1}.entrada{flex-wrap:wrap}.entrada input{flex-basis:100%}.lista{grid-template-columns:1fr}.item-mercado{font-size:15px;padding:8px}.item-mercado>div:first-child{font-size:16px}}
/* ===== ADAPTAÇÃO MOBILE/PWA — somente visual ===== */
@supports (padding: env(safe-area-inset-top)) {
  body {
    padding-top: calc(10px + env(safe-area-inset-top));
    padding-right: calc(10px + env(safe-area-inset-right));
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
    padding-left: calc(10px + env(safe-area-inset-left));
  }
}
button, input { touch-action: manipulation; }
button { -webkit-tap-highlight-color: transparent; }
@media (max-width: 700px) {
  body { padding: 8px; overflow-x: hidden; }
  .painel { width: 100%; padding: 10px; border-radius: 8px; }
  h1 { font-size: 20px; }
  h2 { font-size: 16px; }
  .entrada { gap: 7px; }
  .entrada input {
    width: 100%;
    min-width: 0;
    height: 44px;
    font-size: 16px;
    border-radius: 7px;
  }
  .entrada button, .acoes button {
    min-height: 44px;
    flex: 1 1 auto;
    padding: 10px 12px;
    border-radius: 7px;
    font-size: 14px;
  }
  .acoes {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    padding: 8px;
    border-radius: 7px;
  }
  .acoes button { flex: 1 1 140px; }
  .cartao { padding: 11px; }
  .probabilidade .previsao { gap: 0; }
  .probabilidade .previsao p { margin: 8px 0; }
  .mercados { padding: 10px; gap: 16px; border-radius: 8px; }
  .item-mercado { font-size: 15px; }
  .item-mercado > div:first-child { font-size: 16px; }
  .painel-mercado { padding: 12px; border-radius: 8px; }
  .painel-mercado h3 { font-size: 16px; }
  .totais-mercado { gap: 8px; font-size: 12px; }
  .painel-mercado p { font-size: 13px; }
  .limpar { min-height: 44px; border-radius: 7px; font-size: 14px; }
}

/* ===== CONSULTOR DE ENTRADAS — SOMENTE VISUAL/LEITURA ===== */
.consultor-entradas{margin-top:12px;min-height:0;border-left-color:#7c3aed;background:#faf8ff}.consultor-entradas h2{margin-bottom:9px}.consultor-status{padding:10px 12px;border-radius:7px;margin-bottom:9px;font-size:16px}.consultor-entrar{background:#eaf8ef;border:1px solid #a9ddba;color:#12652f}.consultor-aguardar{background:#f4f5f7;border:1px solid #d5d9df;color:#5d6570}.consultor-pular{background:#fff3e5;border:1px solid #f0c78e;color:#8a4b00}.consultor-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.consultor-pick{background:#fff;border:1px solid #d9dce5;border-radius:8px;padding:10px}.consultor-pick-topo{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.consultor-pick-topo strong{color:#6d28d9}.consultor-mercado{font-size:16px;font-weight:bold;margin-bottom:5px}.consultor-detalhe,.consultor-motivo,.consultor-nota,.consultor-regra,.consultor-candidatos{font-size:12px;line-height:1.45;color:#596273}.consultor-motivo{margin-top:5px}.consultor-regra{margin:9px 0 4px}.consultor-nota{margin-top:7px;color:#737b86}.consultor-ultima{margin-top:8px;padding-top:8px;border-top:1px dashed #d5d9df;font-size:12px}.consultor-mini{display:inline-block;margin:3px 4px 0 0;padding:3px 5px;border-radius:4px;background:#fff}.consultor-green{color:#157c3b}.consultor-red{color:#c62f40}@media(max-width:700px){.consultor-grid{grid-template-columns:1fr}.consultor-status{font-size:15px}.consultor-mercado{font-size:15px}}


`;
document.head.appendChild(st); }
};
