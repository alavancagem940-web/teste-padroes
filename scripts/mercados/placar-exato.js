"use strict";
const MercadoPlacarExato={
  nome:'Placar Exato',
  transformar:r=>r.placar,
  rotulo:v=>v,
  _parse(v){const m=String(v||'').match(/^(\d+)x(\d+)$/);return m?{c:Number(m[1]),f:Number(m[2]),t:Number(m[1])+Number(m[2])}:null;},
  analisar(resultados,contextoAtual=resultados){
    const serie=(resultados||[]).map(this.transformar).filter(Boolean);
    const contexto=(Array.isArray(contextoAtual)&&contextoAtual.length?contextoAtual:resultados||[]).map(this.transformar).filter(Boolean);
    const p=Padroes.analisarSerie(serie,contexto,{maxContext:10,minOccurrences:2,minConfidence:18,minMargin:1.0});
    const f=Padroes.frequencias(p.amostra,[]);
    const fh=Padroes.frequencias(serie,[]);
    if(!p.qualificado||!f.lista.length)return {ativo:false,padrao:p,frequencias:f,frequenciasHistorico:fh,palpite:null};

    // Desempate: quando vários placares têm a mesma contagem, prioriza o lado
    // indicado pelo 1X2 e a quantidade de gols indicada por Gols Exatos.
    const r12=MercadoResultado1X2.analisar(resultados,contextoAtual);
    const gols=MercadoGolsExatos.analisar(resultados,contextoAtual);
    const bm=MercadoAmbosMarcam.analisar(resultados,contextoAtual);
    const v12=r12?.palpite?.valor||null, vg=gols?.palpite?.valor==null?null:Number(gols.palpite.valor), vb=bm?.palpite?.valor||null;
    const candidatos=f.lista.slice(0,Math.min(6,f.lista.length));
    const pontuados=candidatos.map(item=>{
      const x=this._parse(item.valor); let s=item.percentual;
      if(!x)return {...item,score:s};
      if(vg!==null && Number.isFinite(vg) && Math.min(5,x.t)===Math.min(5,vg))s+=4;
      if(v12==='1'&&x.c>x.f)s+=3;
      if(v12==='X'&&x.c===x.f)s+=3;
      if(v12==='2'&&x.c<x.f)s+=3;
      if(vb==='SIM'&&x.c>0&&x.f>0)s+=2;
      if(vb==='NÃO'&&(x.c===0||x.f===0))s+=2;
      return {...item,score:s};
    }).sort((a,b)=>b.score-a.score||b.quantidade-a.quantidade);
    const escolhido=pontuados[0];
    return {ativo:true,padrao:p,frequencias:f,frequenciasHistorico:fh,palpite:{valor:escolhido.valor,quantidade:escolhido.quantidade,percentual:Math.min(99.9,escolhido.percentual)},metodo:'padrao-com-desempate-1x2-btts-total'};
  }
};
