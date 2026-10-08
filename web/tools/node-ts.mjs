/**
 * node-ts.mjs
 *
 * Lets node run the tools (`node --import ./tools/node-ts.mjs tools/...`): node strips TypeScript's types itself, but
 * not its constructors' parameter properties, which the game's classes use. Each of the project's .ts files is
 * compiled with the project's own TypeScript instead, one file at a time, as Vite does, and given Vite's
 * `import.meta.env` as vite-node gave it (development, served from the root).
 */

import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  verbatimModuleSyntax: true,
  inlineSourceMap: true,
  inlineSources: true,
};
const env = `import.meta.env = { BASE_URL: '/', MODE: 'development', DEV: true, PROD: false, SSR: true };`;

registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.ts') || url.includes('/node_modules/')) return nextLoad(url, context);
    const fileName = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(fileName, 'utf8'), { fileName, compilerOptions });
    return { format: 'module', source: `${env}\n${outputText}`, shortCircuit: true };
  },
});
