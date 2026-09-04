"use strict";

/*
 * UNDER 3.5 — motor independente do OVER 3.5.
 *
 * Este arquivo NÃO calcula MAIS. O MAIS de 3.5 pertence ao
 * MercadoOver35 (over-3.5.js).
 *
 * O Under funciona também como FILTRO: quando um contexto semelhante
 * historicamente chamou MENOS e depois saiu MAIS, o contexto fica
 * temporariamente bloqueado para evitar repetir o mesmo erro.
 */
const MercadoOverUnder35 = {
  nome: 'Under 3.5',
  transformar(r) { return Number(r?.totalGols) < 3.5 ? 'MENOS' : 'MAIS'; },
  rotulo(v) { return v === 'MENOS' ? 'Menos de 3.5' : 'Mais de 3.5'; },

  _chaveContexto(contexto, tamanho) {
    return contexto.slice(-tamanho).map(v => String(v)).join('|');
  },

  _historicoErros(serie, contexto) {
    const erros = new Map();
    const max = Math.min(10, contexto.length, serie.length - 1);
    for (let tamanho = max; tamanho >= 1; tamanho--) {
      const ctx = contexto.slice(-tamanho);
      const ocorrencias = Padroes.encontrarOcorrencias(serie, ctx);
      for (const o of ocorrencias) {
        const previsto = 'MENOS';
        const real = o.proximo;
        const chave = this._chaveContexto(ctx, tamanho);
        const item = erros.get(chave) || { total: 0, reds: 0, greens: 0 };
        item.total++;
        if (real === previsto) item.greens++;
        else item.reds++;
        erros.set(chave, item);
      }
    }
    return erros;
  },

  analisar(resultados, contextoAtual = resultados) {
    const serie = (resultados || []).map(this.transformar);
    const contexto = (Array.isArray(contextoAtual) && contextoAtual.length ? contextoAtual : resultados || [])
      .map(this.transformar);

    const p = Padroes.analisarSerie(serie, contexto, {
      maxContext: 10,
      minOccurrences: 2,
      minConfidence: 58,
      minMargin: 1.05
    });

    const f = Padroes.frequencias(p.amostra, ['MENOS', 'MAIS']);
    const fh = Padroes.frequencias(serie, ['MENOS', 'MAIS']);

    let bloqueado = false;
    let motivoBloqueio = '';
    if (p.qualificado && p.tamanho) {
      const chave = this._chaveContexto(contexto, p.tamanho);
      const ocorrencias = Padroes.encontrarOcorrencias(serie, contexto.slice(-p.tamanho));
      const reds = ocorrencias.filter(o => o.proximo === 'MAIS').length;
      const total = ocorrencias.length;
      // Só bloqueia quando existe evidência repetida de que o contexto
      // que chamaria Under já produziu Over anteriormente.
      if (total >= 2 && reds >= 1 && reds / total >= 0.34) {
        bloqueado = true;
        motivoBloqueio = `Contexto com ${reds}/${total} RED(s) anteriores do Under 3.5`;
      }
    }

    const palpite = (!bloqueado && p.qualificado && p.amostra.length)
      ? (f.lista.find(x => x.valor === 'MENOS') || f.lista[0] || null)
      : null;

    return {
      ativo: Boolean(palpite),
      bloqueado,
      motivoBloqueio,
      filtroUnder: true,
      padrao: p,
      frequencias: f,
      frequenciasHistorico: fh,
      palpite,
      metodo: 'under35-filtro-reds-contexto'
    };
  }
};
