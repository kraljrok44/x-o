// Builds the static client into dist/. With --single the whole game (script + styles) is inlined
// into one self-contained index.html (CrazyGames upload; only the CrazyGames SDK stays external).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'dist');
fs.mkdirSync(out, { recursive: true });
await build({
  entryPoints: [path.join(root, 'client/main.js')],
  bundle: true,
  minify: !process.argv.includes('--dev'),
  sourcemap: process.argv.includes('--dev'),
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(out, 'game.js'),
  legalComments: 'none',
  logLevel: 'info',
});
if (process.argv.includes('--single')) {
  const js = fs.readFileSync(path.join(out, 'game.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync(path.join(root, 'client/style.css'), 'utf8');
  let html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`);
  html = html.replace('<script src="game.js"></script>', () => `<script>${js}</script>`);
  if (html.includes('game.js"') || html.includes('style.css"')) throw new Error('inlining failed');
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.rmSync(path.join(out, 'game.js'));
  console.log('built single index.html ->', out, `(${(html.length / 1024).toFixed(0)} KB)`);
} else {
  for (const f of ['index.html', 'style.css']) fs.copyFileSync(path.join(root, 'client', f), path.join(out, f));
  console.log('built ->', out);
}
