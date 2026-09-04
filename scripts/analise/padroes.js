"use strict";

/*
 * MOTOR DE PADRÕES ADAPTATIVO
 *
 * A estrutura do aplicativo permanece a mesma. Esta camada altera somente
 * as métricas usadas para liberar uma previsão:
 *   - tamanho máximo do contexto;
 *   - número mínimo de ocorrências;
 *   - confiança mínima;
 *   - vantagem mínima sobre a segunda opção.
 *
 * Cada mercado passa seus próprios parâmetros. Portanto, um mercado não
 * depende da previsão atual de outro mercado.
 */
const Padroes = {
  CONFIG_PADRAO:{maxContext:6,minOccurrences:4,minConfidence:60,minMargin:1.08},

  encontrarOcorrencias(serie, contexto){
    const achados=[];
    const n=contexto.length;
    if(!n || serie.length<=n) return achados;
    for(let i=0;i+n<serie.length;i++){
      let ok=true;
      for(let j=0;j<n;j++){
        if(serie[i+j]!==contexto[j]){ok=false;break;}
      }
      if(ok) achados.push({inicio:i,fim:i+n-1,proximoIndice:i+n,proximo:serie[i+n]});
    }
    return achados;
  },

  analisarSerie(serie, contextoAtual, opcoes={}){
    if(!Array.isArray(serie)||!serie.length){
      return {encontrado:false,contexto:[],tamanho:0,ocorrencias:[],amostra:[],confianca:0,qualificado:false,percentual:0,frequenciasHistorico:this.frequencias(serie||[],[])};
    }
    const cfg={...this.CONFIG_PADRAO,...(opcoes||{})};
    const atual=Array.isArray(contextoAtual)&&contextoAtual.length?contextoAtual:serie;
    if(!atual.length) return {encontrado:false,contexto:[],tamanho:0,ocorrencias:[],amostra:[],confianca:0,qualificado:false,percentual:0,frequenciasHistorico:this.frequencias(serie,[])};

    const maximo=Math.min(Number(cfg.maxContext)||1,atual.length,serie.length-1);

    // Tenta o maior contexto primeiro. Se ele existir, mas não atingir os
    // critérios, desce para contextos menores até encontrar evidência válida.
    for(let tamanho=maximo;tamanho>=1;tamanho--){
      const contexto=atual.slice(-tamanho);
      const ocorrencias=this.encontrarOcorrencias(serie,contexto);
      if(ocorrencias.length < Number(cfg.minOccurrences||1)) continue;

      const amostra=ocorrencias.map(x=>x.proximo);
      const frequencias=this.frequencias(amostra,[]);
      const dominante=frequencias.lista[0]||null;
      if(!dominante) continue;
      const segundo=frequencias.lista[1]||null;
      const margem=dominante.quantidade/(segundo?segundo.quantidade:1);
      const confianca=dominante.percentual;

      if(confianca < Number(cfg.minConfidence||0)) continue;
      if(margem < Number(cfg.minMargin||1)) continue;

      return {
        encontrado:true,
        frequenciasHistorico:this.frequencias(serie,[]),
        contexto:[...contexto],
        tamanho,
        ocorrencias,
        amostra,
        confianca,
        percentual:confianca,
        margem,
        qualificado:true,
        minimoOcorrencias:Number(cfg.minOccurrences||1),
        confiancaMinima:Number(cfg.minConfidence||0),
        margemMinima:Number(cfg.minMargin||1)
      };
    }

    return {encontrado:false,contexto:atual.slice(-maximo),tamanho:0,ocorrencias:[],amostra:[],confianca:0,percentual:0,qualificado:false,frequenciasHistorico:this.frequencias(serie,[])};
  },

  frequencias(amostra, ordem=[]){
    const mapa={};
    (amostra||[]).forEach(v=>mapa[v]=(mapa[v]||0)+1);
    const total=(amostra||[]).length;
    const lista=Object.entries(mapa)
      .map(([valor,quantidade])=>({valor,quantidade,percentual:total?quantidade*100/total:0,ordem:ordem.indexOf(valor)}))
      .sort((a,b)=>b.quantidade-a.quantidade||a.ordem-b.ordem||String(a.valor).localeCompare(String(b.valor)));
    return {total,lista,mapa};
  }
};
