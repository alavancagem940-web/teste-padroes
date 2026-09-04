"use strict";

/*
 * MEMORIA PERMANENTE DOS MERCADOS
 *
 * O treinamento antigo ja chega consolidado em memoria-consolidada.js.
 * A abertura apenas le as contagens prontas. Cada resultado novo acrescenta
 * uma experiencia e salva a memoria, sem reconstruir 180 partidas.
 */
const Aprendizado = {
  VERSAO: "2026-09-01-MEMORIA-PERMANENTE-V1",
  CHAVE_STORAGE: "esportes_virtuais_memoria_mercados_v1",
  _resumo: {},
  _processados: new Set(),
  _iniciado: false,
  _aprendendo: false,

  _clonarResumo(valor) {
    const saida = {};
    for (const [chave, bruto] of Object.entries(valor || {})) {
      const item = {
        k: String(bruto?.k || chave.split("|", 1)[0] || ""),
        amostra: Math.max(0, Number(bruto?.amostra) || 0),
        acertos: Math.max(0, Number(bruto?.acertos) || 0),
        erros: Math.max(0, Number(bruto?.erros) || 0)
      };
      item.amostra = Math.max(item.amostra, item.acertos + item.erros);
      saida[chave] = item;
    }
    return saida;
  },

  iniciar(semente = {}) {
    if (this._iniciado) return true;
    this._resumo = this._clonarResumo(semente);
    try {
      const salvo = JSON.parse(localStorage.getItem(this.CHAVE_STORAGE) || "null");
      if (salvo?.versao === this.VERSAO) this.importar(salvo, false);
    } catch (e) {
      console.warn("Memoria local dos mercados indisponivel:", e);
    }
    this._iniciado = true;
    this._salvarLocal();
    return true;
  },

  importar(pacote, salvar = true) {
    if (!pacote || pacote.versao !== this.VERSAO) return false;
    const recebido = this._clonarResumo(pacote.resumo);
    for (const [chave, item] of Object.entries(recebido)) {
      const atual = this._resumo[chave];
      // A memoria remota e um retrato completo. Usar a maior amostra evita
      // somar o mesmo aprendizado duas vezes entre dispositivos.
      if (!atual || item.amostra > atual.amostra) this._resumo[chave] = item;
    }
    for (const chave of (pacote.processados || []).slice(-500)) {
      if (chave) this._processados.add(String(chave));
    }
    if (salvar) this._salvarLocal();
    return true;
  },

  exportar() {
    return {
      versao: this.VERSAO,
      atualizadoEm: new Date().toISOString(),
      resumo: this._clonarResumo(this._resumo),
      processados: [...this._processados].slice(-500)
    };
  },

  _salvarLocal() {
    try {
      localStorage.setItem(this.CHAVE_STORAGE, JSON.stringify(this.exportar()));
      return true;
    } catch (e) {
      console.warn("Nao foi possivel guardar a memoria dos mercados:", e);
      return false;
    }
  },

  _faixaPct(p) {
    const base = Math.floor((Number(p) || 0) / 10) * 10;
    return `${base}-${base + 9}`;
  },
  _faixaOc(n) {
    n = Number(n) || 0;
    return n <= 1 ? "1" : n <= 3 ? "2-3" : n <= 7 ? "4-7" : n <= 15 ? "8-15" : "16+";
  },
  _faixaTam(n) {
    n = Number(n) || 0;
    return n <= 1 ? "1" : n <= 3 ? "2-3" : n <= 6 ? "4-6" : "7+";
  },
  _chave(k, m) {
    return [
      k,
      this._faixaPct(m?.palpite?.percentual),
      this._faixaOc(m?.padrao?.ocorrencias?.length),
      this._faixaTam(m?.padrao?.tamanho)
    ].join("|");
  },

  avaliar(resultados, k, mercado) {
    if (!this._iniciado) {
      this.iniciar(typeof MemoriaConsolidada !== "undefined" ? MemoriaConsolidada.aprendizadoInicial : {});
    }
    if (!mercado?.ativo || !mercado?.palpite) return { disponivel: false };
    const chave = this._chave(k, mercado);
    const item = this._resumo[chave];
    if (!item?.amostra) return { disponivel: false, amostra: 0, acertos: 0, erros: 0, taxa: 0, chave };
    return {
      disponivel: true,
      amostra: item.amostra,
      acertos: item.acertos,
      erros: item.erros,
      taxa: item.amostra ? item.acertos / item.amostra * 100 : 0,
      chave
    };
  },

  resumo(resultados, k, mercado) {
    const a = this.avaliar(resultados, k, mercado);
    if (!a.disponivel || a.amostra < 5) {
      const n = a?.amostra || 0;
      return {
        a,
        texto: `🧠 Memoria permanente ativa${n ? ` · ${n} caso(s) semelhante(s)` : ""}`,
        classe: "muted",
        sugestao: "⚪ SUGESTÃO: Dados insuficientes — aguarde mais informações",
        classeSugestao: "muted"
      };
    }
    const classe = a.taxa >= 65 ? "green" : a.taxa >= 50 ? "blue" : "red";
    let sugestao, classeSugestao;
    if (a.taxa >= 70) {
      sugestao = "🟢 SUGESTÃO: Boa oportunidade";
      classeSugestao = "green";
    } else if (a.taxa >= 55) {
      sugestao = "🟡 SUGESTÃO: Entrar com cautela";
      classeSugestao = "blue";
    } else {
      sugestao = "🔴 SUGESTÃO: Não entrar nessa";
      classeSugestao = "red";
    }
    return {
      a,
      texto: `🧠 Memoria permanente: ${a.taxa.toFixed(1)}% em ${a.amostra} situação(ões) · ${a.acertos} GREEN / ${a.erros} RED`,
      classe,
      sugestao,
      classeSugestao
    };
  },

  _chaveResultado(resultado) {
    const t = resultado?._temporal;
    if (t?.data && t?.horario) return `${t.data}|${t.horario}`;
    return null;
  },

  aprenderIndice(resultados, indice) {
    if (!Array.isArray(resultados) || indice <= 0 || indice >= resultados.length) return false;
    const alvo = resultados[indice];
    const chaveResultado = this._chaveResultado(alvo);
    if (!chaveResultado || this._processados.has(chaveResultado)) return false;

    const anteriores = resultados.slice(0, indice);
    const mercados = Previsoes.gerar(
      anteriores,
      null,
      { proximoTemporal: alvo?._temporal || null }
    ).mercados;
    const avaliacao = GreenRed.avaliarPrevisao(resultados, indice);
    const chaves = ["exato", "gols", "r12", "bm", "ou05", "under05", "ou15", "ou25", "ou35", "over35"];
    for (const k of chaves) {
      const mercado = mercados[k];
      if (!mercado?.ativo || !mercado?.palpite || typeof avaliacao?.[k] !== "boolean") continue;
      const chave = this._chave(k, mercado);
      const item = this._resumo[chave] || (this._resumo[chave] = {
        k,
        amostra: 0,
        acertos: 0,
        erros: 0
      });
      item.amostra++;
      if (avaliacao[k]) item.acertos++;
      else item.erros++;
    }

    this._processados.add(chaveResultado);
    this._salvarLocal();
    if (typeof Sincronizacao !== "undefined" && Sincronizacao.publicarMemoriaAprendizado) {
      Sincronizacao.publicarMemoriaAprendizado(this.exportar());
    }
    return true;
  },

  aprenderPendentes(resultados) {
    if (this._aprendendo || !Array.isArray(resultados)) return;
    const indices = [];
    for (let i = Math.max(1, resultados.length - 10); i < resultados.length; i++) {
      const chave = this._chaveResultado(resultados[i]);
      if (chave && !this._processados.has(chave)) indices.push(i);
    }
    if (!indices.length) return;
    this._aprendendo = true;
    const proximo = () => {
      const indice = indices.shift();
      if (indice == null) {
        this._aprendendo = false;
        return;
      }
      try { this.aprenderIndice(resultados, indice); }
      catch (e) { console.warn("Falha ao aprender resultado novo:", e); }
      setTimeout(proximo, 25);
    };
    setTimeout(proximo, 25);
  }
};
