"use strict";
/* Camada de aprendizado: observa previsões passadas sem alterar o motor de padrões. */
const Aprendizado={
  _cache:{assinatura:null,registros:[],indice:new Map(),processando:false,pronto:false},
  MAX_AMOSTRA_HISTORICA:180,
  _assinatura(r){return (r||[]).map(x=>`${x.id||''}:${x.placar||''}`).join('|');},
  _faixaPct(p){return `${Math.floor((Number(p)||0)/10)*10}-${Math.floor((Number(p)||0)/10)*10+9}`;},
  _faixaOc(n){n=Number(n)||0; return n<=1?'1':n<=3?'2-3':n<=7?'4-7':n<=15?'8-15':'16+';},
  _faixaTam(n){n=Number(n)||0; return n<=1?'1':n<=3?'2-3':n<=6?'4-6':'7+';},
  _chave(k,m){return [k,this._faixaPct(m?.palpite?.percentual),this._faixaOc(m?.padrao?.ocorrencias?.length),this._faixaTam(m?.padrao?.tamanho)].join('|');},
  _construir(r){
    const assinatura=this._assinatura(r);
    if(this._cache.assinatura===assinatura && this._cache.pronto)return;
    if(this._cache.processando)return;
    this._cache={assinatura,registros:[],indice:new Map(),processando:true,pronto:false};

    const inicio=Math.max(1,(r||[]).length-this.MAX_AMOSTRA_HISTORICA);
    const fim=(r||[]).length;
    const chaves=['exato','gols','r12','bm','ou05','under05','ou15','ou25','ou35','over35'];
    const registros=[],indice=new Map();

    // Mantemos a aprendizagem temporal, mas limitada às partidas mais recentes.
    // Isso evita bloquear a abertura do aplicativo quando o histórico passa de centenas de resultados.
    for(let i=inicio;i<fim;i++){
      const avaliacao=GreenRed.avaliarPrevisao(r,i); if(!avaliacao)continue;
      const mercados=Previsoes.gerar(r.slice(0,i), null, {proximoTemporal:r[i]?._temporal||null}).mercados;
      for(const k of chaves){
        const m=mercados[k]; if(!m?.ativo||!m?.palpite||typeof avaliacao[k]!=='boolean')continue;
        const reg={k,green:avaliacao[k],pct:m.palpite.percentual,oc:m.padrao?.ocorrencias?.length||0,tam:m.padrao?.tamanho||0,chave:this._chave(k,m)};
        registros.push(reg); if(!indice.has(reg.chave))indice.set(reg.chave,[]); indice.get(reg.chave).push(reg);
      }
    }
    this._cache={assinatura,registros,indice,processando:false,pronto:true};
  },

  avaliar(resultados,k,m){
    if(!m?.ativo||!m?.palpite)return {disponivel:false}; this._construir(resultados);
    const chave=this._chave(k,m); const grupo=this._cache.indice.get(chave)||[];
    if(!grupo.length)return {disponivel:false,amostra:0,acertos:0,erros:0,taxa:0};
    const acertos=grupo.filter(x=>x.green).length, erros=grupo.length-acertos, taxa=acertos/grupo.length*100;
    return {disponivel:true,amostra:grupo.length,acertos,erros,taxa,chave};
  },
  resumo(resultados,k,m){
    const assinatura=this._assinatura(resultados||[]);
    if(this._cache.assinatura!==assinatura || !this._cache.pronto){
      if(!this._cache.processando){
        this._cache={assinatura,registros:[],indice:new Map(),processando:true,pronto:false};
        setTimeout(()=>{
          try{
            this._cache.processando=false;
            this._construir(resultados||[]);
            if(typeof Interface!=='undefined' && Interface.atualizar) Interface.atualizar();
          }catch(e){
            console.error('Erro ao atualizar aprendizado:',e);
            this._cache.processando=false;
          }
        },0);
      }
      return {a:{disponivel:false,amostra:0,acertos:0,erros:0,taxa:0},texto:'🧠 Aprendizado sendo atualizado…',classe:'muted',sugestao:'⏳ Aguarde a atualização do histórico',classeSugestao:'muted'};
    }
    const a=this.avaliar(resultados,k,m);
    if(!a.disponivel || a.amostra<5){
      const n=a?.amostra||0;
      return {a,texto:`🧠 Ainda aprendendo com situações semelhantes${n?` · ${n} caso(s) observado(s)`:''}`,classe:'muted',sugestao:'⚪ SUGESTÃO: Dados insuficientes — aguarde mais informações',classeSugestao:'muted'};
    }
    const classe=a.taxa>=65?'green':a.taxa>=50?'blue':'red';
    let sugestao,classeSugestao;
    if(a.taxa>=70){sugestao='🟢 SUGESTÃO: Boa oportunidade';classeSugestao='green';}
    else if(a.taxa>=55){sugestao='🟡 SUGESTÃO: Entrar com cautela';classeSugestao='blue';}
    else {sugestao='🔴 SUGESTÃO: Não entrar nessa';classeSugestao='red';}
    return {a,texto:`🧠 Aprendizado: ${a.taxa.toFixed(1)}% de acerto em ${a.amostra} situação(ões) semelhante(s) · ${a.acertos} GREEN / ${a.erros} RED`,classe,sugestao,classeSugestao};
  }
};
