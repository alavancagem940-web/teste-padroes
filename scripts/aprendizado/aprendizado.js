"use strict";

/*
 * MEMORIA PERMANENTE DOS MERCADOS
 *
 * O treinamento antigo ja chega consolidado em memoria-consolidada.js.
 * A abertura apenas le as contagens prontas. Cada resultado novo acrescenta
 * uma experiencia e salva a memoria, sem reconstruir 180 partidas.
 */
const Aprendizado = {
  VERSAO: "2026-09-10-MERCADOS-INDIVIDUAIS-V1",
  CHAVE_STORAGE: "esportes_virtuais_memoria_mercados_individuais_v1",
  _resumo: {},
  _processados: new Set(),
  _iniciado: false,
  _aprendendo: false,
  _cacheEstatisticas: new Map(),
  _geracao: 0,

  _invalidarCacheEstatisticas() {
    this._cacheEstatisticas.clear();
    this._geracao++;
  },

  _idIndividual(k, valor) {
    const mercado = String(k || "").trim();
    const lado = String(valor ?? "").trim();
    return `${mercado}:${lado}`;
  },

  _clonarResumo(valor) {
    const saida = {};
    for (const [chave, bruto] of Object.entries(valor || {})) {
      const primeiro = String(chave || "").split("|")[0] || "";
      const partes = primeiro.split(":");
      const k = String(bruto?.k || partes.shift() || "");
      const ladoChave = partes.join(":");
      const item = {
        k,
        valor: String(bruto?.valor ?? ladoChave ?? ""),
        idIndividual: String(bruto?.idIndividual || this._idIndividual(k, bruto?.valor ?? ladoChave ?? "")),
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
    this._invalidarCacheEstatisticas();
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

  estatisticaMercado(k, valor = null) {
    const filtrarLado = valor !== null && valor !== undefined && String(valor) !== "";
    const chaveCache = `${String(k || "")}|${filtrarLado ? String(valor) : "*"}`;
    const cache = this._cacheEstatisticas.get(chaveCache);
    if (cache) return cache;

    let amostra = 0, acertos = 0, erros = 0;
    for (const item of Object.values(this._resumo || {})) {
      if (String(item?.k || "") !== String(k || "")) continue;
      if (filtrarLado && String(item?.valor ?? "") !== String(valor)) continue;
      amostra += Math.max(0, Number(item?.amostra) || 0);
      acertos += Math.max(0, Number(item?.acertos) || 0);
      erros += Math.max(0, Number(item?.erros) || 0);
    }
    const taxa = amostra ? acertos / amostra * 100 : 0;
    // Beta(3,3): evita que 2/2 tenha mais peso que uma amostra grande.
    const taxaAjustada = amostra ? ((acertos + 3) / (amostra + 6)) * 100 : 50;
    const saida = {
      k, valor: filtrarLado ? String(valor) : null,
      idIndividual: filtrarLado ? this._idIndividual(k, valor) : String(k || ""),
      amostra, acertos, erros, taxa, taxaAjustada
    };
    this._cacheEstatisticas.set(chaveCache, saida);
    return saida;
  },

  estatisticaIndividual(k, valor) {
    return this.estatisticaMercado(k, valor);
  },

  rankingIndividuais(minAmostra = 3) {
    const mapa = new Map();
    for (const item of Object.values(this._resumo || {})) {
      if (!item?.k || item?.valor === undefined || item?.valor === null || String(item.valor) === "") continue;
      mapa.set(this._idIndividual(item.k, item.valor), [item.k, item.valor]);
    }
    return [...mapa.values()]
      .map(([k, valor]) => this.estatisticaMercado(k, valor))
      .filter(x => x.amostra >= Math.max(0, Number(minAmostra) || 0))
      .sort((a,b) => b.taxaAjustada-a.taxaAjustada || b.amostra-a.amostra || b.taxa-a.taxa);
  },

  rankingMercados(minAmostra = 3) {
    // Mantido por compatibilidade. Para as sugestões novas, use rankingIndividuais().
    const chaves = ["exato","gols","r12","bm","ou05","under05","ou15","ou25","ou35","over35"];
    return chaves.map(k => this.estatisticaMercado(k))
      .filter(x => x.amostra >= Math.max(0, Number(minAmostra) || 0))
      .sort((a,b) => b.taxaAjustada-a.taxaAjustada || b.amostra-a.amostra || b.taxa-a.taxa);
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
    // O lado faz parte da identidade da memória. MAIS 1.5 e MENOS 1.5
    // usam os mesmos dados-base, mas nunca compartilham taxa de acerto.
    return [
      this._idIndividual(k, m?.palpite?.valor),
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

  aprenderIndice(resultados, indice, opcoes = null) {
    if (!Array.isArray(resultados) || indice <= 0 || indice >= resultados.length) return false;
    const alvo = resultados[indice];
    if (!alvo?.mandante || !alvo?.visitante || !alvo?._temporal?.data || !alvo?._temporal?.horario) return false;
    const resumoDestino = opcoes?.resumo || this._resumo;
    const processadosDestino = opcoes?.processados || this._processados;
    const persistir = opcoes?.persistir !== false;
    const chaveResultado = this._chaveResultado(alvo);
    if (!chaveResultado || processadosDestino.has(chaveResultado)) return false;

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
      const valor = String(mercado.palpite.valor ?? "");
      const item = resumoDestino[chave] || (resumoDestino[chave] = {
        k,
        valor,
        idIndividual: this._idIndividual(k, valor),
        amostra: 0,
        acertos: 0,
        erros: 0
      });
      item.amostra++;
      if (avaliacao[k]) item.acertos++;
      else item.erros++;
    }

    processadosDestino.add(chaveResultado);
    if (persistir) {
      this._salvarLocal();
      if (typeof Sincronizacao !== "undefined" && Sincronizacao.publicarMemoriaAprendizado) {
        Sincronizacao.publicarMemoriaAprendizado(this.exportar());
      }
    }
    return true;
  },

  aprenderPendentes(resultados, aoConcluir = null) {
    if (this._aprendendo || !Array.isArray(resultados)) return false;
    const indices = [];
    for (let i = 1; i < resultados.length; i++) {
      const chave = this._chaveResultado(resultados[i]);
      if (chave && !this._processados.has(chave)) indices.push(i);
    }
    if (!indices.length) {
      if (typeof aoConcluir === "function") { try { aoConcluir(); } catch (_) {} }
      return false;
    }

    // Aprende em uma cópia invisível. A interface continua vendo somente a
    // última memória COMPLETA; assim "chamadas" não sobe 0,1,2... na tela.
    // Ao terminar, troca tudo de uma vez e publica somente um pacote no Firebase.
    this._aprendendo = true;
    const resumoTrabalho = this._clonarResumo(this._resumo);
    const processadosTrabalho = new Set(this._processados);
    let pos = 0;
    // No celular, reconstruir dezenas de jogos no mesmo frame travava toque e rolagem.
    // Trabalha em fatias pequenas somente quando o navegador está ocioso.
    const LOTE_MAX = 4;

    const concluir = () => {
      this._resumo = resumoTrabalho;
      this._processados = processadosTrabalho;
      this._aprendendo = false;
      this._invalidarCacheEstatisticas();
      this._salvarLocal();
      if (typeof Sincronizacao !== "undefined" && Sincronizacao.publicarMemoriaAprendizado) {
        Sincronizacao.publicarMemoriaAprendizado(this.exportar());
      }
      if (typeof aoConcluir === "function") { try { aoConcluir(); } catch (_) {} }
    };

    const agendar = (fn) => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(fn, { timeout: 180 });
      } else {
        setTimeout(() => fn({ timeRemaining: () => 6, didTimeout: true }), 24);
      }
    };

    const proximo = (deadline = null) => {
      let feitos = 0;
      try {
        while (pos < indices.length && feitos < LOTE_MAX) {
          if (feitos > 0 && deadline && !deadline.didTimeout && typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 3) break;
          this.aprenderIndice(resultados, indices[pos], {
            resumo: resumoTrabalho,
            processados: processadosTrabalho,
            persistir: false
          });
          pos++;
          feitos++;
        }
      } catch (e) {
        console.warn("Falha ao aprender lote de resultados:", e);
        pos++;
      }
      if (pos < indices.length) agendar(proximo);
      else concluir();
    };

    agendar(proximo);
    return true;
  }
};
