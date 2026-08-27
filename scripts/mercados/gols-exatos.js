"use strict";
const MercadoGolsExatos={
  nome:'Quantidade de Gols',
  transformar(r){
    if(typeof r==='string'){
      const m=r.trim().match(/^(\d+)x(\d+)$/i); if(!m)return null;
      return String(Math.min(5,Number(m[1])+Number(m[2])));
    }
    const total=Number(r?.totalGols); if(!Number.isFinite(total)||total<0)return null;
    return String(Math.min(5,total));
  },
  rotulo(v){const n=Number(v);return n===5?'5 ou mais gols':`${n} gol${n===1?'':'s'}`;},
  _ordem(){return ['0','1','2','3','4','5'];},
  _frequencias(a){return Padroes.frequencias(a,this._ordem());},
  _serie(r){return (Array.isArray(r)?r:[]).map(x=>this.transformar(x)).filter(v=>v!==null);},

  /* Indicadores internos. Não são exibidos no layout. */
  _analisarFaixa(resultados, contextoAtual, limite){
    const serie=(resultados||[]).map(r=>Number(r?.totalGols)>limite?'MAIS':'MENOS');
    const atual=(Array.isArray(contextoAtual)&&contextoAtual.length?contextoAtual:resultados||[])
      .map(r=>Number(r?.totalGols)>limite?'MAIS':'MENOS');
    const candidatos=[];
    for(const tamanho of [8,7,6,5,4,3,2]){
      if(atual.length<tamanho)continue;
      const ctx=atual.slice(-tamanho);
      const ocorrencias=Padroes.encontrarOcorrencias(serie,ctx);
      if(ocorrencias.length<2)continue;
      const mais=ocorrencias.filter(x=>x.proximo==='MAIS').length;
      const taxa=mais*100/ocorrencias.length;
      candidatos.push({tamanho,contexto:[...ctx],ocorrencias,mais,menos:ocorrencias.length-mais,taxa});
    }
    candidatos.sort((a,b)=>b.taxa-a.taxa||b.ocorrencias.length-a.ocorrencias.length||b.tamanho-a.tamanho);
    const escolhido=candidatos[0]||null;
    const f=Padroes.frequencias(escolhido?escolhido.ocorrencias.map(x=>x.proximo):[],['MAIS','MENOS']);
    return {
      ativo:Boolean(escolhido&&escolhido.taxa>=55),
      padrao:escolhido?{encontrado:true,contexto:escolhido.contexto,tamanho:escolhido.tamanho,ocorrencias:escolhido.ocorrencias,amostra:escolhido.ocorrencias.map(x=>x.proximo),percentual:escolhido.taxa,qualificado:true}: {encontrado:false,contexto:atual.slice(-8),tamanho:0,ocorrencias:[],amostra:[],percentual:0,qualificado:false},
      frequencias:f,
      palpite:escolhido&&escolhido.taxa>=55?{valor:'MAIS',quantidade:escolhido.mais,percentual:Number(escolhido.taxa.toFixed(1))}:null,
      limite
    };
  },

  analisar(resultados,contextoAtual=resultados){
    const serie=this._serie(resultados), atualPreferencial=this._serie(contextoAtual);
    if(serie.length<2)return {ativo:false,padrao:{encontrado:false,contexto:[],tamanho:0,ocorrencias:[],amostra:[]},frequencias:this._frequencias([]),palpite:null,metodo:'padrao-adaptativo',indicadoresOcultos:{}};
    const atual=atualPreferencial.length?atualPreferencial:serie;
    const p=Padroes.analisarSerie(serie,atual,{maxContext:10,minOccurrences:2,minConfidence:20,minMargin:1.0});
    const frequencias=this._frequencias(p.amostra);
    const frequenciasHistorico=this._frequencias(serie);
    const indicadoresOcultos={
      ou45:this._analisarFaixa(resultados,contextoAtual,4.5),
      ou55:this._analisarFaixa(resultados,contextoAtual,5.5)
    };

    // Coerência entre mercados: O2.5 + U3.5 é uma faixa muito específica
    // (3 gols). Em vez de ignorar esse sinal, ele desempata o total exato.
    const ou25=MercadoOverUnder25.analisar(resultados,contextoAtual);
    const u35=MercadoOverUnder35.analisar(resultados,contextoAtual);
    const o25v=ou25?.palpite?.valor||null;
    const u35v=u35?.palpite?.valor||null;
    const candidatos=frequencias.lista.slice(0,Math.min(6,frequencias.lista.length)).map(x=>({ ...x, score:x.percentual }));
    for(const c of candidatos){
      const n=Number(c.valor);
      if(o25v==='MAIS' && u35v==='MENOS' && n===3) c.score+=12;
      if(o25v==='MENOS' && n<=2) c.score+=5;
      if(indicadoresOcultos.ou45?.palpite?.valor==='MAIS' && n>=5) c.score+=5;
      if(indicadoresOcultos.ou45?.palpite?.valor==='MENOS' && n<=4) c.score+=2;
      if(indicadoresOcultos.ou55?.palpite?.valor==='MAIS' && n===5) c.score+=4;
    }
    candidatos.sort((a,b)=>b.score-a.score||b.quantidade-a.quantidade);
    const escolhido=p.qualificado && candidatos[0] ? candidatos[0] : null;
    return {ativo:Boolean(escolhido),padrao:p,frequencias,frequenciasHistorico,palpite:escolhido?{valor:escolhido.valor,quantidade:escolhido.quantidade,percentual:Math.min(99.9,escolhido.percentual)}:null,metodo:'padrao-adaptativo-coerencia-mercados',indicadoresOcultos,coerencia:{ou25:o25v,u35:u35v}};
  }
};
