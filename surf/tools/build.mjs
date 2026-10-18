// Builds the static client into dist/ (upload this folder / zip to CrazyGames).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ads = process.argv.includes('--ads');
const out = path.join(root, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'dist');
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
  // --ads: Full launch build with rewarded/midgame ads; without it the Basic build (no ads)
  define: { __ADS__: String(ads) },
  logLevel: 'info',
});
for (const f of ['index.html', 'style.css']) fs.copyFileSync(path.join(root, 'client', f), path.join(out, f));
console.log(`built (${ads ? 'FULL – ads on' : 'BASIC – no ads'}) ->`, out);
