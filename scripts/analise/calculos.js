"use strict";
const Calculos = {
    percentual(n,t){ return t ? (n/t)*100 : 0; },
    contarFrequenciaPlacar(resultados){
        const mapa={}; resultados.forEach(r=>{ const p=typeof r==="string"?r:r?.placar; if(p) mapa[p]=(mapa[p]||0)+1; });
        return Object.entries(mapa).map(([placar,quantidade])=>({placar,quantidade,percentual:this.percentual(quantidade,resultados.length)})).sort((a,b)=>b.quantidade-a.quantidade||a.placar.localeCompare(b.placar));
    },
    resumir(resultados){
        const t=resultados.length; const c={casa:0,empate:0,fora:0,over25:0,under25:0,over35:0,under35:0,bttsSim:0,bttsNao:0}; const gols={0:0,1:0,2:0,3:0,4:0,5:0};
        resultados.forEach(r=>{ const a=r.golsCasa, b=r.golsFora, g=a+b; if(a>b)c.casa++; else if(a===b)c.empate++; else c.fora++; g>2.5?c.over25++:c.under25++; g>3.5?c.over35++:c.under35++; a>0&&b>0?c.bttsSim++:c.bttsNao++; gols[Math.min(g,5)]++; });
        return {total:t, ...Object.fromEntries(Object.entries(c).map(([k,v])=>[k,this.percentual(v,t)])), gols:Object.fromEntries(Object.entries(gols).map(([k,v])=>[k,this.percentual(v,t)]))};
    },
    totalMaisProvavel(resultados){ const mapa={}; resultados.forEach(r=>mapa[r.totalGols]=(mapa[r.totalGols]||0)+1); const e=Object.entries(mapa).sort((a,b)=>b[1]-a[1])[0]; return e?Number(e[0]):0; },
    mediaGols(resultados){ return resultados.length ? resultados.reduce((s,r)=>s+r.totalGols,0)/resultados.length : 0; }
};
