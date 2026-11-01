// Builds the whole game into one self-contained index.html:  node tools/build.mjs [--out dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.url)('../../surf/node_modules/esbuild');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'dist');
fs.mkdirSync(out, { recursive: true });
const res = await build({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: ['es2020'], write: false,
  nodePaths: [path.resolve(root, '../surf/node_modules')], legalComments: 'none', logLevel: 'info',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${fs.readFileSync(path.join(root, 'style.css'), 'utf8')}</style>`);
html = html.replace('<script src="game.js"></script>', () => `<script>${js}</script>`);
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('built', path.join(out, 'index.html'), (html.length / 1024).toFixed(0) + ' KB');
