import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const testServer = path.join(root, 'teste', 'server.js');
const useTest = fs.existsSync(testServer) && fs.statSync(testServer).isFile();

if (useTest) console.log('[Bilhete Plus] MODO TESTE ATIVO — carregando ./teste/server.js');
else console.log('[Bilhete Plus] modo normal — pasta teste ausente');

await import(pathToFileURL(useTest ? testServer : path.join(root, 'server.js')).href);
