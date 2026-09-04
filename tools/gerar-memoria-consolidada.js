"use strict";

/*
 * Gera a memoria que vai junto com o site. Este arquivo roda somente durante
 * a preparacao da versao; o navegador nunca precisa abrir backup.js.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const raiz = path.resolve(__dirname, "..");
const carregar = arquivo => vm.runInThisContext(
  fs.readFileSync(path.join(raiz, arquivo), "utf8"),
  { filename: arquivo }
);

[
  "scripts/backup/backup.js",
  "scripts/analise/calculos.js",
  "scripts/mercados/resultado-1x2.js",
  "scripts/mercados/ambos-marcam.js",
  "scripts/mercados/over-under-0.5.js",
  "scripts/mercados/under-0.5.js",
  "scripts/mercados/over-under-1.5.js",
  "scripts/mercados/over-under-2.5.js",
  "scripts/mercados/over-under-3.5.js",
  "scripts/mercados/over-3.5.js",
  "scripts/mercados/placar-exato.js",
  "scripts/mercados/gols-exatos.js",
  "scripts/analise/padroes.js",
  "scripts/analise/temporal.js",
  "scripts/analise/previsoes.js",
  "scripts/desempenho/green-red.js",
  "scripts/aprendizado/aprendizado.js"
].forEach(carregar);

const resultados = Backup.map((placar, indice) => {
  const [casa, fora] = placar.split("x").map(Number);
  return {
    id: indice + 1,
    placar,
    golsCasa: casa,
    golsFora: fora,
    totalGols: casa + fora,
    fonte: "memoria"
  };
});

// A versao antiga e usada apenas aqui para transformar o treinamento feito
// em contagens permanentes. O site novo nao recalcula isso na abertura.
Aprendizado._construir(resultados);
const aprendizado = {};
for (const registro of Aprendizado._cache.registros) {
  const item = aprendizado[registro.chave] || (aprendizado[registro.chave] = {
    k: registro.k,
    amostra: 0,
    acertos: 0,
    erros: 0
  });
  item.amostra++;
  if (registro.green) item.acertos++;
  else item.erros++;
}

const placaresCompactados = Backup.join(",");
const conteudo = `"use strict";\n\n` +
`/* Memoria treinada. Gerada uma vez; nao consulta backup nem Firebase. */\n` +
`const MemoriaConsolidada={\n` +
`  versao:"2026-09-01-MEMORIA-PERMANENTE-V1",\n` +
`  quantidade:${Backup.length},\n` +
`  placares:${JSON.stringify(placaresCompactados)},\n` +
`  aprendizadoInicial:${JSON.stringify(aprendizado)},\n` +
`  criarBase(){return this.placares.split(",").filter(Boolean);}\n` +
`};\n`;

const destino = path.join(
  raiz,
  "scripts",
  "aprendizado",
  "memoria-consolidada.js"
);
fs.writeFileSync(destino, conteudo, "utf8");
console.log(`Memoria gerada: ${Backup.length} resultados, ${Object.keys(aprendizado).length} chaves.`);
