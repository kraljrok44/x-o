// Renders CrazyGames store media with headless Chromium (see tools/media/capture.js).
//   node tools/media/record.mjs shots   – quick test frames
//   node tools/media/record.mjs covers  – 3 cover images
//   node tools/media/record.mjs videos  – landscape + portrait preview videos
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const OUT = path.join(root, 'release/media');
fs.mkdirSync(OUT, { recursive: true });

await build({ entryPoints: [path.join(here, 'capture.js')], bundle: true, format: 'iife', target: 'es2020', outfile: path.join(here, 'capture.bundle.js'), logLevel: 'warning' });

export async function openPage(w, h) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.goto('file://' + path.join(here, 'capture.html'));
  await page.waitForFunction(() => window.media && window.media.ready);
  await page.evaluate((u) => document.documentElement.style.setProperty('--u', u + 'px'), Math.min(w, h) / 100 * 1.6);
  return { browser, page };
}

export async function openPageRaw(w, h, scale = 1) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // scale > 1: the UI is laid out at w/scale x h/scale CSS px and rendered at w x h pixels
  const page = await browser.newPage({ viewport: { width: Math.round(w / scale), height: Math.round(h / scale) }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  return { browser, page };
}

const mode = process.argv[2] || 'shots';
const mod = await import(path.join(here, `media-${mode}.mjs`));
await mod.default({ openPage, openPageRaw, OUT, execFileSync });
