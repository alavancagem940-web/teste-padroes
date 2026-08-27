"use strict";
/*
 * Camada temporal: procura evidência por momento do dia sem substituir os motores.
 * REGRA: só conversa com mercados após 100 resultados com data+horário válidos.
 */
const AnaliseTemporal = {
  MIN_AMOSTRA: 100,
  _chaves(r){
    const dt=r?._temporal; if(!dt?.data||!dt?.horario)return null;
    const [h,m]=dt.horario.split(':').map(Number); if(!Number.isFinite(h)||!Number.isFinite(m))return null;
    const minuto=h*60+m;
    const faixa30=Math.floor(minuto/30)*30;
    const faixa60=Math.floor(minuto/60)*60;
    const faixa120=Math.floor(minuto/120)*120;
    const faixa3=dt.slot3 ?? minuto;
    const periodo=h<6?'MADRUGADA':h<12?'MANHÃ':h<18?'TARDE':'NOITE';
    const diaSemana=new Date(`${dt.data}T12:00:00Z`).getUTCDay();
    return {
      exato:`EXATO:${dt.horario}`,
      slot3:`3MIN:${String(faixa3).padStart(4,'0')}`,
      faixa30:`30MIN:${String(faixa30).padStart(4,'0')}`,
      faixa60:`1H:${String(faixa60).padStart(4,'0')}`,
      faixa120:`2H:${String(faixa120).padStart(4,'0')}`,
      periodo:`PERIODO:${periodo}`,
      semana:`SEMANA:${diaSemana}`
    };
  },
  _resultadoMercado(r,k){
    const g=Number(r?.totalGols); if(!Number.isFinite(g))return null;
    if(k==='ou05'||k==='under05')return g>0?'MAIS':'MENOS';
    if(k==='ou15')return g>1?'MAIS':'MENOS';
    if(k==='ou25')return g>2?'MAIS':'MENOS';
    if(k==='ou35'||k==='over35')return g>3?'MAIS':'MENOS';
    if(k==='gols')return String(Math.min(5,g));
    if(k==='bm')return r.golsCasa>0&&r.golsFora>0?'SIM':'NÃO';
    if(k==='r12')return r.golsCasa>r.golsFora?'1':r.golsCasa<r.golsFora?'2':'X';
    return null;
  },
  _agrupar(resultados,k){
    const grupos={}; let validos=0;
    for(const r of resultados||[]){const c=this._chaves(r);if(!c)continue;validos++;const v=this._resultadoMercado(r,k);if(v==null)continue;for(const [tipo,chave] of Object.entries(c)){const g=grupos[chave]||(grupos[chave]={tipo,chave,total:0,contagem:{}});g.total++;g.contagem[v]=(g.contagem[v]||0)+1;}}
    return {validos,grupos};
  },
  analisar(resultados,k,proximo){
    const base=Array.isArray(resultados)?resultados:[];
    const timestamped=base.filter(r=>this._chaves(r));
    const faltam=Math.max(0,this.MIN_AMOSTRA-timestamped.length);
    if(timestamped.length<this.MIN_AMOSTRA)return {disponivel:false,amostra:timestamped.length,faltam,modo:'aguardando-100',texto:`🕐 Análise temporal aguardando ${faltam} resultado(s) com data e horário.`};
    const {grupos}=this._agrupar(base,k); const atualChaves=this._chaves(proximo)||{}; const sinais=[];
    for(const tipo of ['exato','slot3','faixa30','faixa60','faixa120','periodo','semana']){
      const g=grupos[atualChaves[tipo]]; if(!g||g.total<5)continue;
      const lista=Object.entries(g.contagem).map(([valor,n])=>({valor,n,percentual:n/g.total*100})).sort((a,b)=>b.n-a.n);
      const top=lista[0]; if(top)sinais.push({tipo,g,tendencia:top.valor,percentual:top.percentual,amostra:g.total});
    }
    sinais.sort((a,b)=>b.amostra-a.amostra||b.percentual-a.percentual);
    const forte=sinais.filter(x=>x.amostra>=10 && x.percentual>=60).sort((a,b)=>b.percentual-a.percentual||b.amostra-a.amostra)[0]||null;
    return {disponivel:true,amostra:timestamped.length,faltam:0,sinais,forte,modo:'ativo',texto:forte?`🕐 Sinal temporal: ${forte.tipo} → ${forte.tendencia} (${forte.percentual.toFixed(1)}% em ${forte.amostra} casos)`:'🕐 Sem sinal temporal forte para este horário.'};
  },
  anexar(resultados,mercados,proximo){
    for(const [k,m] of Object.entries(mercados||{})) m.temporal=this.analisar(resultados,k,proximo);
    return mercados;
  }
};
