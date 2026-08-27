"use strict";
const MercadoAmbosMarcam={
  nome:'Ambos Marcam',
  transformar:r=>r.golsCasa>0&&r.golsFora>0?'SIM':'NÃO',
  rotulo:v=>v,
  analisar(resultados,contextoAtual=resultados){
    const serie=resultados.map(this.transformar);
    const contexto=(Array.isArray(contextoAtual)&&contextoAtual.length?contextoAtual:resultados).map(this.transformar);
    const p=Padroes.analisarSerie(serie,contexto,{maxContext:10,minOccurrences:2,minConfidence:55,minMargin:1.0});
    const f=Padroes.frequencias(p.amostra,['SIM','NÃO']);
    const fh=Padroes.frequencias(serie,['SIM','NÃO']);
    return {ativo:p.qualificado,padrao:p,frequencias:f,frequenciasHistorico:fh,palpite:p.qualificado?(f.lista[0]||null):null};
  }
};
