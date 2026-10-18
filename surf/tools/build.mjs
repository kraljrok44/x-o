// Builds the static client into dist/ (upload this folder / zip to CrazyGames).
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
for (const f of ['index.html', 'style.css']) fs.copyFileSync(path.join(root, 'client', f), path.join(out, f));
console.log('built ->', out);
