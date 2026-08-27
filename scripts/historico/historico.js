"use strict";

const Historico = {
    resultados: [], sequencias: [], sequenciaAtual: [], dadosBrutos: [], baseEstudoQuantidade: 0, baseEstudoBrutosIndice: 0, metadadosTemporais: [], horariosSemDados: [], horariosSemDadosSessao: [],
    // Resultados do backup são apenas base de estudo. Somente registros com fonte "ao-vivo" podem ocupar horários atuais ou serem mostrados como último registro da sessão.
    _ehAoVivo(r) { return r?.fonte === "ao-vivo"; },

    iniciar() { this.limpar(false); this.horariosSemDados = typeof Armazenamento !== "undefined" ? Armazenamento.obterHorariosSemDados() : []; this.horariosSemDadosSessao = []; console.log("Histórico iniciado."); },
    _indiceBrutosParaQuantidade(qtd) {
        const alvo = Math.max(0, Number(qtd) || 0);
        if (!this.dadosBrutos.length || alvo === 0) return alvo === 0 ? 0 : this.dadosBrutos.length;
        let vistos = 0;
        for (let i = 0; i < this.dadosBrutos.length; i++) {
            const item = this.dadosBrutos[i];
            if (item === "PAUSA") continue;
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
        return [...lista].sort((a,b) => {
            const ka=this._chaveTemporal(a), kb=this._chaveTemporal(b);
            if (!ka && !kb) return 0;
            if (!ka) return -1;
            if (!kb) return 1;
            return ka.localeCompare(kb);
        });
    },
    _sincronizarOrdemAtual() {
        // Resultados do backup permanecem no início. Somente os resultados
        // ao-vivo são ordenados pelo horário real da partida.
        const backup = this.resultados.filter(r => !this._ehAoVivo(r));
        const aoVivo = this._ordenarCronologicamente(this.resultados.filter(r => this._ehAoVivo(r)));
        this.resultados = backup.concat(aoVivo);
        this.sequenciaAtual = this._ordenarCronologicamente(this.sequenciaAtual);

        // O trecho após o último PAUSA representa a sessão ao-vivo atual.
        // Reescrevemos somente esse trecho para que um resultado retroativo
        // (ex.: 04:24) fique antes de 04:27/04:30, sem mexer no backup.
        const base = Math.min(this.baseEstudoBrutosIndice || 0, this.dadosBrutos.length);
        const prefixo = this.dadosBrutos.slice(0, base);
        let cauda = this.dadosBrutos.slice(base);
        let ultimaPausa = -1;
        for (let i=0;i<cauda.length;i++) if (cauda[i] === "PAUSA") ultimaPausa=i;
        const antesSessao = ultimaPausa >= 0 ? cauda.slice(0, ultimaPausa + 1) : [];
        const atual = this.sequenciaAtual.map(r => ({
            placar:r.placar,
            _temporal:r._temporal || null,
            fonte:"ao-vivo"
        }));
        this.dadosBrutos = prefixo.concat(antesSessao, atual);
        this.metadadosTemporais = this.dadosBrutos
            .filter(x => x !== "PAUSA")
            .map(x => x?._temporal || null);
    },
    definirBaseEstudo(qtd=null) {
        this.baseEstudoQuantidade = Number.isFinite(Number(qtd)) ? Number(qtd) : this.resultados.length;
        this.baseEstudoBrutosIndice = this._indiceBrutosParaQuantidade(this.baseEstudoQuantidade);
        this.sequenciaAtual = [];
        return this.baseEstudoQuantidade;
    },
    obterQuantidadeBaseEstudo() { return this.baseEstudoQuantidade; },
    obterIndiceBaseEstudoBrutos() { return this.baseEstudoBrutosIndice; },
    obterQuantidadeResultadosNovaSessao() { return this.sequenciaAtual.length; },
    validarPlacar(placar) { return typeof placar === "string" && /^\d+x\d+$/i.test(placar.trim()); },
    criarResultado(placar, meta=null) {
        const [casa, fora] = placar.trim().toLowerCase().split("x").map(Number);
        const agora=new Date().toISOString();
        const temporal=meta || (typeof RelogioPartidas!=='undefined' ? (()=>{const p=RelogioPartidas.partidaParaRegistrarResultado(); return {data:p.data,horario:p.horario,slot3:p.hora*60+p.minuto};})() : null);
        return { id: this.resultados.length + 1, placar: `${casa}x${fora}`, golsCasa:casa, golsFora:fora, totalGols:casa+fora, data:agora, _temporal:temporal, fonte: (meta && meta.__fonte) || "ao-vivo" };
    },
    adicionar(placar, salvar=true, meta=null) {
        if (!this.validarPlacar(placar)) return false;
        const temporal = meta?.__semTemporal
            ? null
            : (meta || (typeof RelogioPartidas !== 'undefined' ? (() => {
                const p = RelogioPartidas.partidaParaRegistrarResultado();
                return {data:p.data, horario:p.horario, slot3:p.hora*60+p.minuto};
            })() : null));

        // REGRA: cada partida (data + horário) aceita somente UM resultado.
        // Isso vale apenas para resultados com horário; backups antigos sem
        // metadados continuam sendo carregados normalmente.
        if (temporal?.data && temporal?.horario && this.resultados.some(x =>
            this._ehAoVivo(x) && x?._temporal?.data === temporal.data && x?._temporal?.horario === temporal.horario
        )) {
            return {duplicado:true, temporal};
        }

        const r = this.criarResultado(placar, temporal);
        r.fonte = meta?.__fonte || "ao-vivo";
        this.resultados.push(r);
        this.sequenciaAtual.push(r);
        // Resultados ao-vivo são persistidos como objetos para conservar o
        // horário. Isso permite reordenar corretamente quando um resultado
        // antigo é informado depois, sem transformar 04:24 em 04:33.
        this.dadosBrutos.push({placar:r.placar, _temporal:r._temporal || null, fonte:r.fonte});
        this.metadadosTemporais.push(r._temporal||null);
        this._sincronizarOrdemAtual();
        if (r._temporal?.data && r._temporal?.horario) {
            const chave=`${r._temporal.data}|${r._temporal.horario}`;
            const antes=this.horariosSemDados.length;
            this.horariosSemDados=this.horariosSemDados.filter(x=>x!==chave);
            this.horariosSemDadosSessao=this.horariosSemDadosSessao.filter(x=>x!==chave);
            if (salvar && antes!==this.horariosSemDados.length && typeof Armazenamento !== "undefined") Armazenamento.salvarHorariosSemDados(this.horariosSemDados);
        }
        if (salvar && typeof Armazenamento !== "undefined") { Armazenamento.salvarDados(this.dadosBrutos); Armazenamento.salvarMetadadosTemporais(this.metadadosTemporais); }
        return r;
    },
    pausar(salvar=true) {
        if (this.sequenciaAtual.length) this.sequencias.push([...this.sequenciaAtual]);
        this.sequenciaAtual=[]; this.dadosBrutos.push("PAUSA");
        if (salvar && typeof Armazenamento !== "undefined") { Armazenamento.salvarDados(this.dadosBrutos); Armazenamento.salvarMetadadosTemporais(this.metadadosTemporais); }
        console.log("Sequência encerrada pela pausa.");
    },
    carregarDados(dados, salvar=false, opcoes={}) {
        if (!Array.isArray(dados)) return false;
        this.limpar(false);
        const metas=(typeof Armazenamento!=="undefined" && Array.isArray(Armazenamento.obterMetadadosTemporais?.())) ? Armazenamento.obterMetadadosTemporais() : [];
        const baseQuantidade = Number.isFinite(Number(opcoes.baseQuantidade)) ? Number(opcoes.baseQuantidade) : dados.filter(x => x !== "PAUSA" && (typeof x === "string" || x?.placar)).length;
        let idx=0, resultadosTotais=0;
        dados.forEach(item => {
            if (item === "PAUSA") {
                this.pausar(false);
                return;
            }
            if (typeof item !== "string" && !(item && item.placar)) return;
            const placar = typeof item === "string" ? item : item.placar;
            const ehBackup = resultadosTotais < baseQuantidade;
            const metaOriginal = item?._temporal || metas[idx] || null;
            // Nunca reaproveitar horários do localStorage para os registros do backup.
            // O backup é histórico de estudo e não representa partidas atuais.
            const meta = ehBackup
                ? {__semTemporal:true, __fonte:"backup"}
                : (metaOriginal?.data && metaOriginal?.horario
                    ? {...metaOriginal, __fonte:"ao-vivo"}
                    : {__semTemporal:true, __fonte:"ao-vivo"});
            this.adicionar(placar,false,meta);
            idx++;
            resultadosTotais++;
        });
        this.baseEstudoBrutosIndice = this._indiceBrutosParaQuantidade(baseQuantidade);
        if (salvar && typeof Armazenamento !== "undefined") { Armazenamento.salvarDados(this.dadosBrutos); Armazenamento.salvarMetadadosTemporais(this.metadadosTemporais); }
        return true;
    },
    registrarHorarioSemDados(meta=null, salvar=true) {
        const t = meta || (typeof RelogioPartidas !== 'undefined' ? RelogioPartidas.partidaAnterior() : null);
        if (!t?.data || !t?.horario) return false;
        const chave = `${t.data}|${t.horario}`;
        if (this.temResultadoNoHorario(t)) return false;
        if (!this.horariosSemDados.includes(chave)) {
            this.horariosSemDados.push(chave);
            if (!this.horariosSemDadosSessao.includes(chave)) this.horariosSemDadosSessao.push(chave);
            if (salvar && typeof Armazenamento !== 'undefined') Armazenamento.salvarHorariosSemDados(this.horariosSemDados);
            return true;
        }
        return false;
    },
    obterHorariosSemDados() { return [...this.horariosSemDados]; },
    obterUltimosEventosSessao(limite=10) {
        const eventos=[];
        for (const r of this.sequenciaAtual) {
            const t=r?._temporal;
            if (!t?.data || !t?.horario) continue;
            eventos.push({tipo:"resultado", placar:r.placar, data:t.data, horario:t.horario, chave:`${t.data}|${t.horario}`});
        }
        for (const chave of this.horariosSemDadosSessao) {
            const [data,horario]=String(chave).split("|");
            if (!data || !horario) continue;
            if (eventos.some(e=>e.chave===chave)) continue;
            eventos.push({tipo:"vazio", placar:null, data, horario, chave});
        }
        eventos.sort((a,b)=>a.chave.localeCompare(b.chave));
        return eventos.slice(-Math.max(1, Number(limite)||10));
    },

    estaSemDados(meta=null) {
        const t=meta || (typeof RelogioPartidas !== 'undefined' ? RelogioPartidas.partidaAtual() : null);
        if(!t?.data || !t?.horario) return false;
        return this.horariosSemDados.includes(`${t.data}|${t.horario}`);
    },
    temResultadoNoHorario(meta=null) {
        const t = meta || (typeof RelogioPartidas !== 'undefined' ? (() => {
            const p = RelogioPartidas.partidaParaRegistrarResultado();
            return {data:p.data, horario:p.horario};
        })() : null);
        if (!t?.data || !t?.horario) return false;
        return this.resultados.some(x => this._ehAoVivo(x) && x?._temporal?.data === t.data && x?._temporal?.horario === t.horario);
    },
    obterResultadoNoHorario(meta=null) {
        const t = meta || (typeof RelogioPartidas !== 'undefined' ? (() => {
            const p = RelogioPartidas.partidaParaRegistrarResultado();
            return {data:p.data, horario:p.horario};
        })() : null);
        if (!t?.data || !t?.horario) return null;
        return this.resultados.find(x => this._ehAoVivo(x) && x?._temporal?.data === t.data && x?._temporal?.horario === t.horario) || null;
    },
    importarResultadosAoVivo(lista, salvar=true) {
        if (!Array.isArray(lista)) return 0;
        let adicionados = 0;
        for (const item of lista) {
            const r = item && typeof item === "object" ? item : null;
            if (!r?.placar || r?.fonte !== "ao-vivo" || !r?._temporal?.data || !r?._temporal?.horario) continue;
            const resultado = this.adicionar(r.placar, salvar, {
                data:r._temporal.data,
                horario:r._temporal.horario,
                hora:r._temporal.hora,
                minuto:r._temporal.minuto,
                slot3:r._temporal.slot3,
                timeZone:r._temporal.timeZone || "Europe/London",
                __fonte:"ao-vivo",
                __remoto:true
            });
            if (resultado && !resultado.duplicado) adicionados++;
        }
        return adicionados;
    },
    obterTodos(){ return [...this.resultados]; },
    obterUltimo(){ return this.resultados.at(-1) || null; },
    obterUltimoAoVivo(){ for(let i=this.resultados.length-1;i>=0;i--) if(this._ehAoVivo(this.resultados[i])) return this.resultados[i]; return null; },
    obterQuantidade(){ return this.resultados.length; },
    obterQuantidadeSequencias(){ return this.sequencias.length; },
    obterSequenciaAtual(){ return [...this.sequenciaAtual]; },
    obterSequencias(){ return this.sequencias.map(s=>[...s]); },
    obterDadosBrutos(){ return [...this.dadosBrutos]; },
    limpar(apagarStorage=true){ this.resultados=[]; this.sequencias=[]; this.sequenciaAtual=[]; this.dadosBrutos=[]; this.baseEstudoQuantidade=0; this.baseEstudoBrutosIndice=0; this.metadadosTemporais=[]; this.horariosSemDados=[]; this.horariosSemDadosSessao=[]; if(apagarStorage && typeof Armazenamento!=="undefined") Armazenamento.limpar(); }
};
