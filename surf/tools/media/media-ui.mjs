// Real game UI shots for the preview video (built client in dist/, offline mode, virtual time):
// leaderboard fast scroll, knife unboxing with the reveal card, collection scroll + 5 knives.
//   node tools/media/record.mjs ui <w> <h> [preview]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTIBLES } from '../../shared/catalog.js';
import { CATALOG_VERSION } from '../../shared/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FPS = 30;

export const UNBOX = 'crescent__abyss_p2';          // the knife the video's crate reveals
export const EQUIPPED = 'lancer__sunset_melt';
export const SHOWCASE = ['moth__jade_flow', 'crescent__gilded_relic', 'warden__abyss_p3', 'flicker__heat_temper', 'hook__candy_marble'];

// a collection of ~100 owned knives (always including the showcase), never the unboxed one
const OWNED = [...new Set([...SHOWCASE, EQUIPPED, ...COLLECTIBLES.filter((c, i) => c.enabled && i % 4 === 1).map((c) => c.collectible_id)])].filter((id) => id !== UNBOX);
const AVAILABLE = COLLECTIBLES.filter((c) => c.enabled && !OWNED.includes(c.collectible_id)).map((c) => c.collectible_id);
// openCrate picks available[floor(rng * n)]: a constant Math.random during the request selects UNBOX
const FORCE = (AVAILABLE.indexOf(UNBOX) + 0.5) / AVAILABLE.length;

// sample leaderboard (demo data for the video)
const TAGS = ['NovaGlide', 'RampRunner', 'xVortex', 'SkyCarver', 'Lumen', 'DriftKing', 'PixelSurf', 'Kairo', 'MintyFresh', 'Zephyr_7', 'BoltRider', 'NeonFox', 'Aster', 'GlideGod', 'Crux', 'Halcyon', 'SurfSensei', 'Tidal', 'Rook', 'Quasar', 'Ember', 'Frosty', 'Juno', 'Vex', 'Orbit', 'Sable', 'Kite', 'Rift', 'Echo', 'Nimbus', 'Talon', 'Mako', 'Pulse', 'Vega', 'Onyx', 'Blitz', 'Cosmo', 'Drako', 'Fable', 'Gale', 'Hex', 'Iris', 'Jinx', 'Koda', 'Lynx', 'Moxie', 'Nyx', 'Oz', 'Pike', 'Quill'];
const POINTS = TAGS.map((name, i) => ({ key: i % 3 === 0 ? `cg:${1000 + i}` : `g:${i}`, name, points: Math.round(13400 - i * 205 - (i % 4) * 37), maps: 7 - Math.floor(i / 12), date: 1700000000000 + i }));

const INIT = `(() => {
  let vt = 1000; const q = new Map(); let id = 0;
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { q.set(++id, cb); return id; };
  window.cancelAnimationFrame = (i) => q.delete(i);
  window.__step = (ms) => { vt += ms; const cbs = [...q.values()]; q.clear(); for (const c of cbs) { try { c(vt); } catch (e) { console.error(e); } } };
  const rnd = Math.random; window.__force = null;
  Math.random = () => (window.__force !== null ? window.__force : rnd());
  try {
    localStorage.setItem('gz.local.r.__points', ${JSON.stringify(JSON.stringify(POINTS))});
    localStorage.setItem('gz.local.p.local', ${JSON.stringify(JSON.stringify({ owned: OWNED, equipped: EQUIPPED, idem: {}, lastOpenAt: 0, opens: OWNED.length, catalogVersion: CATALOG_VERSION }))});
  } catch (e) {}
})();`;

const CSS = `* { cursor: none !important; }
  #menu, #hud, #chat { visibility: hidden !important; }
  .panels { background: radial-gradient(ellipse at 50% 30%, #1a1440 0%, #07070f 75%) !important; backdrop-filter: none !important; }
  .panel { width: 92vw !important; height: 90vh !important; }
  #lb-close, #inv-close, .vault-close, #viewer-close, #viewer-reset, .inv-tools select, .inv-tools input { display: none !important; }
  /* unboxing: the crate stage fills the screen, only the reveal card stays from the side panel */
  #vault { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; }
  #vault-panel { position: absolute !important; border: 0 !important; background: none !important; overflow: visible !important; pointer-events: none;
    right: 4vw; bottom: 8vh; width: min(460px, 40vw) !important; }
  #vault-panel > *:not(.reveal-card) { display: none !important; }
  #vault-panel .btn-row, #vault-panel #v-again, #vault-panel .dim.small { display: none !important; }
  #vault-panel .reveal-card { background: rgba(10, 12, 24, .82); border: 1px solid rgba(120, 200, 255, .35); border-radius: 18px; padding: 22px 26px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  @media (max-aspect-ratio: 1/1) { #vault-panel { left: 6vw; right: 6vw; bottom: 6vh; width: auto !important; } }
  .viewer { background: radial-gradient(ellipse at 50% 30%, #1a1440 0%, #07070f 75%) !important; }
  .viewer-box { width: 92vw !important; height: 86vh !important; }
  @media (max-aspect-ratio: 1/1) { .viewer-box { flex-direction: column; } .viewer-stage { flex: none !important; height: 62% !important; overflow: hidden; } .viewer-stage canvas { position: absolute; inset: 0; } .viewer-side { width: auto !important; border-left: 0 !important; } .viewer-side p, .viewer-side .sub, #viewer-lights { display: none !important; } }`;

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export async function uiShots({ openPageRaw, w, h, dir, preview = false }) {
  // larger interface scale so the UI text reads well in a 1080p video
  const { browser, page } = await openPageRaw(w, h, w > h ? 1.6 : 1.5);
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.addInitScript(INIT);
  await page.goto('file://' + path.join(root, 'dist/index.html'));
  await page.addStyleTag({ content: CSS });
  const step = (n = 1) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__step(1000 / 30); }, n);
  let shot = null, k = 0;
  const begin = (name) => { shot = `${dir}/${name}`; fs.mkdirSync(shot, { recursive: true }); k = 0; };
  const grab = async () => {
    if (!preview || k % 10 === 0) await page.screenshot({ path: `${shot}/${String(k).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    k++;
  };
  await step(30);
  await page.waitForTimeout(400);

  // 1. leaderboard, fast scroll from the top to the bottom and back up a little
  await page.evaluate(() => document.getElementById('m-lb').click());
  for (let i = 0; i < 10; i++) { await page.waitForTimeout(40); await step(); }
  begin('lb');
  const lbFrames = Math.round(1.9 * FPS);
  for (let i = 0; i < lbFrames; i++) {
    const p = easeInOut(Math.min(1, i / (lbFrames * 0.8)));
    await page.evaluate((p) => { const el = document.querySelector('.lb-list'); if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * p; }, p);
    await step(); await grab();
  }
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('gz-close-panels')));
  await step(3);

  // 2. unboxing (forced to the showcase knife) + reveal card
  await page.evaluate(() => document.getElementById('m-vault').click());
  await step(10);
  await page.evaluate((f) => { window.__force = f; document.getElementById('v-open').click(); }, FORCE);
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(50); await step(1);
    if (await page.evaluate(() => window.gzVault.state === 'opening')) break;
  }
  await page.evaluate(() => { window.__force = null; });
  const got = await page.evaluate(() => window.gzVault.result && window.gzVault.result.collectible_id);
  if (got !== UNBOX) console.warn('unboxed', got, 'expected', UNBOX);
  await step(Math.round(2.6 * FPS)); // start as the lid opens
  begin('vault');
  for (let i = 0; i < 8 * FPS; i++) { await step(); await grab(); if (await page.evaluate(() => window.gzVault.state === 'result')) break; }
  for (let i = 0; i < Math.round(1.4 * FPS); i++) { await step(); await grab(); }
  if (process.env.GZ_DEBUG) console.log(await page.evaluate(() => { const c = document.querySelector('.reveal-card'); const p = document.getElementById('vault-panel'); return JSON.stringify({ state: window.gzVault.state, card: c && c.getBoundingClientRect(), panel: p.getBoundingClientRect(), disp: getComputedStyle(p).display, html: p.innerHTML.slice(0, 200) }); }));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('gz-close-panels')));
  await step(3);

  // 3. collection: fast scroll through the owned knives, then five knives in the 3D viewer
  await page.evaluate(() => document.getElementById('m-inv').click());
  await step(2);
  await page.evaluate(() => { const b = document.querySelector('#inventory .tab[data-tab="owned"]'); if (b) b.click(); });
  for (let i = 0; i < 40; i++) await step(); // thumbnails render
  begin('inv');
  const sFrames = Math.round(1.3 * FPS);
  for (let i = 0; i < sFrames; i++) {
    const p = easeInOut(i / (sFrames - 1));
    await page.evaluate((p) => { const el = document.getElementById('inv-grid'); if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.75 * p; }, p);
    await step(4); await grab(); // extra steps let the lazy thumbnails keep up with the scroll
  }
  for (const id of SHOWCASE) {
    await page.evaluate((id) => { const x = document.getElementById('viewer-close'); if (x) x.click(); const c = document.querySelector(`#inventory .card[data-id="${id}"]`); if (c) c.click(); }, id);
    for (let i = 0; i < Math.round(0.6 * FPS); i++) { await step(); await grab(); }
  }
  await browser.close();
}

export default async function ({ openPageRaw, OUT }) {
  const [w, h] = [Number(process.argv[3] || 1920), Number(process.argv[4] || 1080)];
  const dir = `${OUT}/ui-${w}x${h}`;
  fs.rmSync(dir, { recursive: true, force: true });
  await uiShots({ openPageRaw, w, h, dir, preview: process.argv[5] === 'preview' });
  console.log('ui frames in', dir);
}
