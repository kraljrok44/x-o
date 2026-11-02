// Builds two upload-ready packages:
//   dist/crazygames/   (+ wingborne-crazygames.zip)   CrazyGames SDK v3, ads OFF by default (Basic Launch)
//   dist/gamemonetize/ (+ wingborne-gamemonetize.zip) GameMonetize SDK
// Options:  --cg-ads          enable CrazyGames ads (only after you are accepted for Full Launch)
//           --gm-id=<GAME_ID> your GameMonetize game id
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cgAds = args.includes('--cg-ads');
const gmId = (args.find((a) => a.startsWith('--gm-id=')) || '').split('=')[1] || 'YOUR_GAMEMONETIZE_GAME_ID';

const heads = {
  crazygames: `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
<script>window.__PLATFORM__ = 'crazygames'; window.__ADS__ = ${cgAds};</script>`,
  gamemonetize: `<script>
window.__PLATFORM__ = 'gamemonetize'; window.__ADS__ = true;
window.SDK_OPTIONS = { gameId: ${JSON.stringify(gmId)}, onEvent: function (a) { if (window.__gmEvent) window.__gmEvent(a.name); } };
(function (a, b, c) { var d = a.getElementsByTagName(b)[0]; a.getElementById(c) || (a = a.createElement(b), a.id = c, a.src = "https://api.gamemonetize.com/sdk.js", d.parentNode.insertBefore(a, d)); })(document, "script", "gamemonetize-sdk");
</script>`,
};

const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
const bundle = await build({ entryPoints: [join(root, 'js/main.js')], bundle: true, minify: true, format: 'iife', target: ['es2020'], write: false, legalComments: 'none' });
const js = bundle.outputFiles[0].text;
const html = readFileSync(join(root, 'index.html'), 'utf8');

for (const [name, head] of Object.entries(heads)) {
  const out = join(dist, name);
  mkdirSync(join(out, 'css'), { recursive: true });
  writeFileSync(join(out, 'game.js'), `/* Wingborne: BASE Flight. Includes three.js (MIT, (c) 2010-2024 three.js authors) */\n${js}`);
  copyFileSync(join(root, 'css/style.css'), join(out, 'css/style.css'));
  const page = html.replace('<!--PLATFORM_HEAD-->', head).replace('<script type="module" src="js/main.js"></script>', '<script src="game.js"></script>');
  if (page === html) throw new Error('index.html placeholders not found');
  writeFileSync(join(out, 'index.html'), page);
  const zip = join(dist, `wingborne-${name}.zip`);
  if (existsSync(zip)) rmSync(zip);
  execSync(`cd "${out}" && zip -qr "${zip}" .`);
  console.log(`built ${name}: ${(js.length / 1024).toFixed(0)} KB js -> ${zip}`);
}
console.log(`CrazyGames ads: ${cgAds ? 'ENABLED (Full Launch)' : 'disabled (Basic Launch)'} · GameMonetize id: ${gmId}`);
