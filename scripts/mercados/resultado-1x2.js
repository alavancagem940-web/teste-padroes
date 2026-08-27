"use strict";
const MercadoResultado1X2={
  nome:'Resultado (1X2)',
  transformar:r=>r.golsCasa>r.golsFora?'1':r.golsCasa===r.golsFora?'X':'2',
  rotulo:v=>v==='1'?'Vitória da Casa':v==='X'?'Empate':'Vitória do Visitante',
  analisar(resultados,contextoAtual=resultados){
    const serie=resultados.map(this.transformar);
    const contexto=(Array.isArray(contextoAtual)&&contextoAtual.length?contextoAtual:resultados).map(this.transformar);
    const p=Padroes.analisarSerie(serie,contexto,{maxContext:10,minOccurrences:2,minConfidence:50,minMargin:1.0});
    const f=Padroes.frequencias(p.amostra,['1','X','2']);
    const fh=Padroes.frequencias(serie,['1','X','2']);
    return {ativo:p.qualificado,padrao:p,frequencias:f,frequenciasHistorico:fh,palpite:p.qualificado?(f.lista[0]||null):null};
  }
};
