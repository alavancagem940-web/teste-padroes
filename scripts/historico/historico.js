"use strict";

/*
 * HISTÓRICO CONTÍNUO
 *
 * - O backup continua sendo base de estudo, sem horário.
 * - Todo resultado real com data+horário pertence a UMA sequência temporal
 *   contínua, inclusive quando o app fecha ou é aberto em outro dispositivo.
 * - Marcadores antigos "PAUSA" são ignorados ao carregar.
 * - Intervalos sem resultado não quebram a sequência; são analisados pela
 *   camada temporal como GAP / slots sem resultado.
 */
const Historico = {
    resultados: [],
    sequencias: [], // mantido por compatibilidade; a sessão operacional agora é contínua.
    sequenciaAtual: [],
    dadosBrutos: [],
    baseEstudoQuantidade: 0,
    baseEstudoBrutosIndice: 0,
    metadadosTemporais: [],
    horariosSemDados: [],
    horariosSemDadosSessao: [],

    _ehAoVivo(r) { return r?.fonte === "ao-vivo"; },

    iniciar() {
        this.limpar(false);
        this.horariosSemDados = typeof Armazenamento !== "undefined" ? Armazenamento.obterHorariosSemDados() : [];
        this.horariosSemDadosSessao = [...this.horariosSemDados];
        console.log("Histórico contínuo iniciado.");
    },

    _indiceBrutosParaQuantidade(qtd) {
        const alvo = Math.max(0, Number(qtd) || 0);
        if (!this.dadosBrutos.length || alvo === 0) return alvo === 0 ? 0 : this.dadosBrutos.length;
        let vistos = 0;
        for (let i = 0; i < this.dadosBrutos.length; i++) {
            const item = this.dadosBrutos[i];
            if (item === "PAUSA") continue; // compatibilidade com arquivos antigos
            if (typeof item === "string" || item?.placar) vistos++;
            if (vistos >= alvo) return i + 1;
        }
        return this.dadosBrutos.length;
    },

    _chaveTemporal(r) {
        const t = r?._temporal;
        if (!t?.data || !t?.horario) return null;
        return `${t.data}|${t.horario}`;
    },

    _ordenarCronologicamente(lista) {
        return [...(lista || [])].sort((a, b) => {
            const ka = this._chaveTemporal(a), kb = this._chaveTemporal(b);
            if (!ka && !kb) return 0;
            if (!ka) return -1;
            if (!kb) return 1;
            return ka.localeCompare(kb);
        });
    },

    _sincronizarOrdemAtual() {
        const backup = this.resultados.filter(r => !this._ehAoVivo(r));
        const aoVivo = this._ordenarCronologicamente(this.resultados.filter(r => this._ehAoVivo(r)));
        this.resultados = backup.concat(aoVivo);
        this.sequenciaAtual = aoVivo.filter(r => this._chaveTemporal(r));

        // Reconstrói o armazenamento sem PAUSA. O histórico temporal fica sempre
        // contínuo e ordenado, mesmo quando um resultado antigo é registrado depois.
        this.dadosBrutos = this.resultados.map(r => ({
            placar: r.placar,
            _temporal: r._temporal || null,
            fonte: r.fonte || (r._temporal ? "ao-vivo" : "backup"),
            data: r.data || null,
            mandante: r.mandante || null,
            visitante: r.visitante || null,
            escudoMandante: r.escudoMandante || null,
            escudoVisitante: r.escudoVisitante || null,
            liga: r.liga || null,
            timesConfirmados: Boolean(r.mandante && r.visitante)
        }));
        this.metadadosTemporais = this.dadosBrutos.map(x => x?._temporal || null);
        this.baseEstudoBrutosIndice = Math.min(this.baseEstudoQuantidade, this.dadosBrutos.length);
    },

    definirBaseEstudo(qtd = null) {
        // Não zera mais a sequência temporal. "Base de estudo" agora serve
        // somente para separar o backup histórico da contagem GREEN/RED.
        this.baseEstudoQuantidade = Number.isFinite(Number(qtd)) ? Number(qtd) : this.resultados.filter(r => !this._ehAoVivo(r)).length;
        this.baseEstudoBrutosIndice = this._indiceBrutosParaQuantidade(this.baseEstudoQuantidade);
        return this.baseEstudoQuantidade;
    },

    obterQuantidadeBaseEstudo() { return this.baseEstudoQuantidade; },
    obterIndiceBaseEstudoBrutos() { return this.baseEstudoBrutosIndice; },
    obterQuantidadeResultadosNovaSessao() { return this.sequenciaAtual.length; },
    validarPlacar(placar) { return typeof placar === "string" && /^\d+x\d+$/i.test(placar.trim()); },

    criarResultado(placar, meta = null) {
        const [casa, fora] = placar.trim().toLowerCase().split("x").map(Number);
        const temporal = meta?.__semTemporal
            ? null
            : (meta || (typeof RelogioPartidas !== "undefined" ? (() => {
                const p = RelogioPartidas.partidaParaRegistrarResultado();
                return { data: p.data, horario: p.horario, hora: p.hora, minuto: p.minuto, slot3: p.hora * 60 + p.minuto, timeZone: p.timeZone };
            })() : null));
        return {
            id: this.resultados.length + 1,
            placar: `${casa}x${fora}`,
            golsCasa: casa,
            golsFora: fora,
            totalGols: casa + fora,
            data: meta?.__dataCriacao || new Date().toISOString(),
            _temporal: temporal,
            fonte: (meta && meta.__fonte) || "ao-vivo"
        };
    },

    adicionar(placar, salvar = true, meta = null) {
        if (!this.validarPlacar(placar)) return false;
        const temporal = meta?.__semTemporal
            ? null
            : (meta || (typeof RelogioPartidas !== "undefined" ? (() => {
                const p = RelogioPartidas.partidaParaRegistrarResultado();
                return { data: p.data, horario: p.horario, hora: p.hora, minuto: p.minuto, slot3: p.hora * 60 + p.minuto, timeZone: p.timeZone };
            })() : null));

        if (temporal?.data && temporal?.horario && this.resultados.some(x =>
            this._ehAoVivo(x) && x?._temporal?.data === temporal.data && x?._temporal?.horario === temporal.horario
        )) {
            return { duplicado: true, temporal };
        }

        const r = this.criarResultado(placar, { ...(temporal || {}), ...(meta || {}) });
        r.fonte = meta?.__fonte || "ao-vivo";
        if (meta?.__semTemporal) r._temporal = null;
        this.resultados.push(r);

        if (this._ehAoVivo(r) && r._temporal?.data && r._temporal?.horario) {
            this.sequenciaAtual.push(r);
            const chave = `${r._temporal.data}|${r._temporal.horario}`;
            this.horariosSemDados = this.horariosSemDados.filter(x => x !== chave);
            this.horariosSemDadosSessao = this.horariosSemDadosSessao.filter(x => x !== chave);
        }

        this._sincronizarOrdemAtual();
        if (salvar) this.persistir();
        return r;
    },

    carregarDados(dados, salvar = false, opcoes = {}) {
        if (!Array.isArray(dados)) return false;
        this.limpar(false);
        const metas = (typeof Armazenamento !== "undefined" && Array.isArray(Armazenamento.obterMetadadosTemporais?.()))
            ? Armazenamento.obterMetadadosTemporais() : [];
        const baseQuantidade = Number.isFinite(Number(opcoes.baseQuantidade))
            ? Number(opcoes.baseQuantidade)
            : dados.filter(x => x !== "PAUSA" && (typeof x === "string" || x?.placar)).length;

        let idx = 0, resultadosTotais = 0;
        for (const item of dados) {
            if (item === "PAUSA") continue; // PAUSA antiga é descartada definitivamente.
            if (typeof item !== "string" && !(item && item.placar)) continue;
            const placar = typeof item === "string" ? item : item.placar;
            const ehBackup = resultadosTotais < baseQuantidade;
            const metaOriginal = (typeof item === "object" ? item?._temporal : null) || metas[idx] || null;
            const meta = ehBackup
                ? { __semTemporal: true, __fonte: "backup", __dataCriacao: item?.data || null }
                : (metaOriginal?.data && metaOriginal?.horario
                    ? { ...metaOriginal, __fonte: "ao-vivo", __dataCriacao: item?.data || null }
                    : { __semTemporal: true, __fonte: "ao-vivo", __dataCriacao: item?.data || null });
            this.adicionar(placar, false, meta);
            idx++;
            resultadosTotais++;
        }
        this.definirBaseEstudo(baseQuantidade);
        if (salvar) this.persistir();
        return true;
    },

    // Mantido para indicar lacunas na interface, mas lacunas NÃO encerram sessão.
    registrarHorarioSemDados(meta = null, salvar = true) {
        const t = meta || (typeof RelogioPartidas !== "undefined" ? RelogioPartidas.partidaAnterior() : null);
        if (!t?.data || !t?.horario) return false;
        const chave = `${t.data}|${t.horario}`;
        if (this.temResultadoNoHorario(t)) return false;
        if (!this.horariosSemDados.includes(chave)) {
            this.horariosSemDados.push(chave);
            if (!this.horariosSemDadosSessao.includes(chave)) this.horariosSemDadosSessao.push(chave);
            if (salvar && typeof Armazenamento !== "undefined") Armazenamento.salvarHorariosSemDados(this.horariosSemDados);
            return true;
        }
        return false;
    },

    obterHorariosSemDados() { return [...this.horariosSemDados]; },

    obterUltimosEventosSessao(limite = 10) {
        // Visual limpo: mostra resultados reais. Os vazios continuam sendo
        // inferidos internamente pelo intervalo entre os horários.
        return this.sequenciaAtual.slice(-Math.max(1, Number(limite) || 10)).map(r => ({
            tipo: "resultado",
            placar: r.placar,
            data: r._temporal?.data,
            horario: r._temporal?.horario,
            chave: this._chaveTemporal(r)
        }));
    },

    obterResultadosComHorario() { return [...this.sequenciaAtual]; },
    obterQuantidadeComHorario() { return this.sequenciaAtual.length; },

    obterResumoTemporal() {
        const lista = this.sequenciaAtual;
        const primeiro = lista[0] || null;
        const ultimo = lista.at(-1) || null;
        return {
            quantidade: lista.length,
            primeiro: primeiro?._temporal || null,
            ultimo: ultimo?._temporal || null,
            ultimoPlacar: ultimo?.placar || null
        };
    },

    estaSemDados(meta = null) {
        const t = meta || (typeof RelogioPartidas !== "undefined" ? RelogioPartidas.partidaAtual() : null);
        if (!t?.data || !t?.horario) return false;
        return this.horariosSemDados.includes(`${t.data}|${t.horario}`);
    },

    temResultadoNoHorario(meta = null) {
        const t = meta || (typeof RelogioPartidas !== "undefined" ? RelogioPartidas.partidaParaRegistrarResultado() : null);
        if (!t?.data || !t?.horario) return false;
        return this.sequenciaAtual.some(x => x?._temporal?.data === t.data && x?._temporal?.horario === t.horario);
    },

    obterResultadoNoHorario(meta = null) {
        const t = meta || (typeof RelogioPartidas !== "undefined" ? RelogioPartidas.partidaParaRegistrarResultado() : null);
        if (!t?.data || !t?.horario) return null;
        return this.sequenciaAtual.find(x => x?._temporal?.data === t.data && x?._temporal?.horario === t.horario) || null;
    },

    _aplicarTimesResultado(destino, origem) {
        if (!destino || !origem) return false;
        let mudou = false;
        for (const campo of ["mandante", "visitante", "escudoMandante", "escudoVisitante", "liga"]) {
            const valor = origem?.[campo];
            if (valor !== undefined && valor !== null && String(valor).trim() && destino[campo] !== valor) {
                destino[campo] = valor;
                mudou = true;
            }
        }
        if (destino.mandante && destino.visitante) destino.timesConfirmados = true;
        return mudou;
    },

    importarResultadosAoVivo(lista, salvar = true) {
        if (!Array.isArray(lista)) return 0;

        // IMPORTAÇÃO EM LOTE: na V22 cada resultado chamava adicionar(), que
        // reordenava todo o histórico a cada item. Com centenas de resultados
        // isso virava O(n²) e travava principalmente no celular. Aqui montamos
        // um índice uma vez, absorvemos tudo e ordenamos/persistimos só no fim.
        const existentes = new Map();
        for (const atual of this.resultados) {
            const chave = this._ehAoVivo(atual) ? this._chaveTemporal(atual) : null;
            if (chave) existentes.set(chave, atual);
        }

        let adicionados = 0, enriquecidos = 0;
        for (const item of lista) {
            const r = item && typeof item === "object" ? item : null;
            if (!r?.placar || r?.fonte !== "ao-vivo" || !r?._temporal?.data || !r?._temporal?.horario || !r?.mandante || !r?.visitante) continue;

            const metaTemporal = {
                data: r._temporal.data,
                horario: r._temporal.horario,
                hora: r._temporal.hora,
                minuto: r._temporal.minuto,
                slot3: r._temporal.slot3,
                timeZone: r._temporal.timeZone || "Europe/London"
            };
            const chave = `${metaTemporal.data}|${metaTemporal.horario}`;
            const existente = existentes.get(chave);

            if (existente) {
                if (this._aplicarTimesResultado(existente, r)) enriquecidos++;
                continue;
            }

            const resultado = this.criarResultado(r.placar, {
                ...metaTemporal,
                __fonte: "ao-vivo",
                __remoto: true,
                __dataCriacao: r.data || null
            });
            resultado.fonte = "ao-vivo";
            this._aplicarTimesResultado(resultado, r);
            this.resultados.push(resultado);
            this.sequenciaAtual.push(resultado);
            existentes.set(chave, resultado);
            this.horariosSemDados = this.horariosSemDados.filter(x => x !== chave);
            this.horariosSemDadosSessao = this.horariosSemDadosSessao.filter(x => x !== chave);
            adicionados++;
        }

        this._ultimoEnriquecimentoTimes = enriquecidos;
        if (adicionados || enriquecidos) {
            this._sincronizarOrdemAtual();
            if (salvar) this.persistir();
        }
        return adicionados;
    },

    persistir() {
        if (typeof Armazenamento === "undefined") return false;
        // Guarda uma janela ampla do histórico real para a interface nascer
        // com contexto suficiente (casa/fora/H2H) sem depender da primeira
        // resposta de rede. Continua limitado para não crescer indefinidamente.
        const recentes = this.resultados
            .filter(r => this._ehAoVivo(r) && this._chaveTemporal(r))
            .slice(-500)
            .map(r => ({
                placar: r.placar,
                _temporal: r._temporal,
                fonte: "ao-vivo",
                data: r.data || null,
                mandante: r.mandante || null,
                visitante: r.visitante || null,
                escudoMandante: r.escudoMandante || null,
                escudoVisitante: r.escudoVisitante || null,
                liga: r.liga || null,
                timesConfirmados: Boolean(r.mandante && r.visitante)
            }));
        Armazenamento.salvarDados(recentes);
        Armazenamento.salvarMetadadosTemporais(recentes.map(x => x._temporal));
        Armazenamento.salvarHorariosSemDados(this.horariosSemDados);
        return true;
    },

    obterTodos() { return [...this.resultados]; },
    obterUltimo() { return this.resultados.at(-1) || null; },
    obterUltimoAoVivo() { return this.sequenciaAtual.at(-1) || null; },
    obterQuantidade() { return this.resultados.length; },
    obterQuantidadeSequencias() { return this.sequenciaAtual.length ? 1 : 0; },
    obterSequenciaAtual() { return [...this.sequenciaAtual]; },
    obterSequencias() { return this.sequenciaAtual.length ? [[...this.sequenciaAtual]] : []; },
    obterDadosBrutos() { return [...this.dadosBrutos]; },

    limpar(apagarStorage = true) {
        this.resultados = [];
        this.sequencias = [];
        this.sequenciaAtual = [];
        this.dadosBrutos = [];
        this.baseEstudoQuantidade = 0;
        this.baseEstudoBrutosIndice = 0;
        this.metadadosTemporais = [];
        this.horariosSemDados = [];
        this.horariosSemDadosSessao = [];
        if (apagarStorage && typeof Armazenamento !== "undefined") Armazenamento.limpar();
    }
};
