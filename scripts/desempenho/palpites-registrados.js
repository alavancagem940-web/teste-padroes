"use strict";

/*
 * Registro persistente dos palpites por partida.
 *
 * Objetivo: se o aplicativo for fechado/reaberto durante uma partida,
 * o último palpite disponível é associado ao horário da partida que estiver
 * rolando no momento da abertura. Assim, o resultado digitado posteriormente
 * pode avaliar exatamente aquele palpite, em vez de gerar um palpite novo e
 * perder a referência da entrada anterior.
 */
const PalpitesRegistrados = {
  CHAVE: "esportes_virtuais_palpites_registrados_v1",
  CHAVE_ULTIMO: "esportes_virtuais_ultimo_palpite_v1",

  _ler(chave) {
    try { return JSON.parse(localStorage.getItem(chave)) || {}; }
    catch (_) { return {}; }
  },

  _salvar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
    catch (e) { console.error("Erro ao salvar palpites:", e); return false; }
  },

  limpar() {
    localStorage.removeItem(this.CHAVE);
    localStorage.removeItem(this.CHAVE_ULTIMO);
  },

  _extrair(mercados) {
    const out = {};
    for (const [k, m] of Object.entries(mercados || {})) {
      if (!m?.palpite) continue;
      out[k] = {
        valor: m.palpite.valor,
        percentual: Number(m.palpite.percentual) || 0,
        quantidade: Number(m.palpite.quantidade) || 0
      };
    }
    return out;
  },

  salvarUltimo(mercados, alvo=null) {
    const palpites = this._extrair(mercados);
    if (!Object.keys(palpites).length) return false;
    const registro = {
      criadoEm: new Date().toISOString(),
      alvo: alvo ? { data: alvo.data, horario: alvo.horario, timeZone: alvo.timeZone } : null,
      palpites
    };
    return this._salvar(this.CHAVE_ULTIMO, registro);
  },

  obterUltimo() {
    const r = this._ler(this.CHAVE_ULTIMO);
    return r?.palpites ? r : null;
  },

  registrarParaPartida(slot, palpites, origem="reabertura") {
    if (!slot?.data || !slot?.horario || !palpites || !Object.keys(palpites).length) return false;
    const mapa = this._ler(this.CHAVE);
    const chave = `${slot.data}|${slot.horario}`;
    if (mapa[chave]) return false;
    mapa[chave] = {
      partida: { data: slot.data, horario: slot.horario, timeZone: slot.timeZone || "Europe/London" },
      criadoEm: new Date().toISOString(),
      origem,
      palpites
    };
    return this._salvar(this.CHAVE, mapa);
  },

  obterParaPartida(slot) {
    if (!slot?.data || !slot?.horario) return null;
    const mapa = this._ler(this.CHAVE);
    return mapa[`${slot.data}|${slot.horario}`] || null;
  },

  obterTodos() { return this._ler(this.CHAVE); }
};
