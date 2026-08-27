"use strict";
const MercadoOverUnder05={
  nome:'Over / Under 0.5',
  transformar:r=>r.totalGols>0.5?'MAIS':'MENOS',
  rotulo:v=>v==='MAIS'?'Mais de 0.5':'Menos de 0.5',
  analisar(resultados,contextoAtual=resultados){
    const serie=resultados.map(this.transformar);
    const contexto=(Array.isArray(contextoAtual)&&contextoAtual.length?contextoAtual:resultados).map(this.transformar);
    const p=Padroes.analisarSerie(serie,contexto,{maxContext:10,minOccurrences:4,minConfidence:75,minMargin:1.08});
    const f=Padroes.frequencias(p.amostra,['MAIS','MENOS']);
    const fh=Padroes.frequencias(serie,['MAIS','MENOS']);
    return {ativo:p.qualificado,padrao:p,frequencias:f,frequenciasHistorico:fh,palpite:p.qualificado?(f.lista[0]||null):null};
  }
};
