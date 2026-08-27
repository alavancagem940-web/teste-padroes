"use strict";

const Armazenamento = {
    CHAVE_STORAGE: "esportes_virtuais_sessao_v2",
    CHAVE_TEMPORAL: "esportes_virtuais_temporal_v1",
    CHAVE_SEM_DADOS: "esportes_virtuais_sem_dados_v1",
    obterDados() {
        try { return JSON.parse(localStorage.getItem(this.CHAVE_STORAGE)) || []; }
        catch (e) { console.error("Erro ao ler armazenamento:", e); return []; }
    },
    salvarMetadadosTemporais(dados) { try { localStorage.setItem(this.CHAVE_TEMPORAL, JSON.stringify(Array.isArray(dados)?dados:[])); return true; } catch(e){ console.error("Erro ao salvar horários:",e); return false; } },
    obterMetadadosTemporais() { try { return JSON.parse(localStorage.getItem(this.CHAVE_TEMPORAL)) || []; } catch(e){ return []; } },
    salvarHorariosSemDados(dados) { try { localStorage.setItem(this.CHAVE_SEM_DADOS, JSON.stringify(Array.isArray(dados)?dados:[])); return true; } catch(e){ console.error("Erro ao salvar horários sem dados:",e); return false; } },
    obterHorariosSemDados() { try { return JSON.parse(localStorage.getItem(this.CHAVE_SEM_DADOS)) || []; } catch(e){ return []; } },
    salvarDados(dados) {
        try { localStorage.setItem(this.CHAVE_STORAGE, JSON.stringify(dados)); return true; }
        catch (e) { console.error("Erro ao salvar:", e); return false; }
    },
    limpar() { localStorage.removeItem(this.CHAVE_STORAGE); localStorage.removeItem(this.CHAVE_TEMPORAL); localStorage.removeItem(this.CHAVE_SEM_DADOS); }
};
