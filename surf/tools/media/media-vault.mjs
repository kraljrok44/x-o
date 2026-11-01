// Knife unboxing frames from the real game UI (basic build in dist/, offline mode, fake clock).
//   node tools/media/record.mjs vault <w> <h> <outPrefix> [fps] [from] [to] [knife]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Virtual time: performance.now and requestAnimationFrame are driven by __step(ms), so every
// captured frame advances the animation by exactly 1/fps regardless of render speed.
const VIRTUAL_TIME = `(() => {
  let vt = 1000; const q = new Map(); let id = 0;
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { q.set(++id, cb); return id; };
  window.cancelAnimationFrame = (i) => q.delete(i);
  window.__step = (ms) => { vt += ms; const cbs = [...q.values()]; q.clear(); for (const c of cbs) { try { c(vt); } catch (e) { console.error(e); } } };
})();`;

export async function vaultFrames({ openPageRaw, w, h, prefix, fps = 30, from = 0, to = 6.8, preview = false }) {
  const { browser, page } = await openPageRaw(w, h);
  await page.addInitScript(VIRTUAL_TIME);
  await page.goto('file://' + path.join(root, 'dist/index.html'));
  // video framing: the crate stage fills the screen, the UI side panel and the menu are hidden
  await page.addStyleTag({ content: `#vault { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
    max-width: none !important; max-height: none !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; transform: none !important; }
    #vault-panel, .vault-close { display: none !important; } #menu, #hud, #chat { visibility: hidden !important; } * { cursor: none !important; }` });
  const step = (ms, n = 1) => page.evaluate(([ms, n]) => { for (let i = 0; i < n; i++) window.__step(ms); }, [ms, n]);
  await step(33, 30);
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('m-vault').click());
  await step(33, 20);
  await page.evaluate(() => document.getElementById('v-open').click());
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(50);
    await step(1);
    if (await page.evaluate(() => window.gzVault && window.gzVault.state === 'opening')) break;
  }
  await step(1000 / fps, Math.round(from * fps));
  const files = [];
  const n = Math.round((to - from) * fps);
  for (let i = 0; i < n; i++) {
    await step(1000 / fps);
    if (!preview || i % Math.round(fps / 2) === 0) {
      const f = `${prefix}${String(i).padStart(4, '0')}.jpg`;
      await page.screenshot({ path: f, type: 'jpeg', quality: 92 });
      files.push(f);
    }
  }
  await browser.close();
  return files;
}

export default async function ({ openPageRaw, OUT }) {
  const [w, h] = [Number(process.argv[3] || 1920), Number(process.argv[4] || 1080)];
  const files = await vaultFrames({ openPageRaw, w, h, prefix: `${OUT}/vault-prev-`, preview: true });
  console.log(files.length, 'frames');
}
