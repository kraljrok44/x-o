// CrazyGames preview videos: 15-20 s, silent, 1080p landscape (16:9) and portrait (2:3).
// Structure: cover image as the first frame -> first-person surfing on two maps -> knife unboxing
// from the real vault UI. Real-time speed (no fast-forward), no cursor, no promotional text.
import fs from 'node:fs';
import { COVERS, renderCover } from './media-covers.mjs';
import { vaultFrames } from './media-vault.mjs';

const FPS = 30;
const KNIFE = 'lancer__sunset_melt';
const SURF = [
  { map: 'surf_neon_drift', from: 2.6, dur: 6.0, bots: [{ ticks: 0, knife: KNIFE }, { ticks: 170, knife: 'warden__abyss_p2', color: 1 }, { ticks: 330, knife: 'moth__jade_flow', color: 6 }] },
  { map: 'surf_void_garden', from: 3.0, dur: 4.5, bots: [{ ticks: 0, knife: KNIFE }, { ticks: 150, knife: 'flicker__heat_temper', color: 3 }, { ticks: 300, knife: 'hook__candy_marble', color: 4 }] },
];
const VAULT = { from: 1.6, to: 6.8 };

const scaleCover = (c, k, w, h, name) => ({
  ...c, name, w, h,
  knife: { ...c.knife, box: c.knife.box.map((v) => Math.round(v * k)) },
  title: { ...c.title, x: Math.round(c.title.x * k), y: Math.round(c.title.y * k), w: Math.round(c.title.w * k), size: Math.round(c.title.size * k) },
});

const VIDEOS = [
  { name: 'preview-landscape-1920x1080', w: 1920, h: 1080, cover: COVERS[0] },
  { name: 'preview-portrait-1080x1620', w: 1080, h: 1620, cover: scaleCover(COVERS[1], 1.35, 1080, 1620, 'cover-portrait-1080x1620') },
];

async function surfFrames(openPage, w, h, seg, dir) {
  const { browser, page } = await openPage(w, h);
  await page.evaluate((seg) => { window.media.setup({ map: seg.map, view: 'fp', hud: true, bots: seg.bots }); window.media.skip(seg.from); }, seg);
  const n = Math.round(seg.dur * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.media.frame(1 / 30));
    await page.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  await browser.close();
}

export default async function ({ openPage, openPageRaw, OUT, execFileSync }) {
  const only = process.argv[3];
  for (const v of VIDEOS) {
    if (only && !v.name.includes(only)) continue;
    const tmp = `${OUT}/tmp-${v.name}`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    // 1. cover still (first frame)
    { const { browser, page } = await openPage(v.w, v.h); await renderCover(page, v.cover, `${tmp}/cover.png`); await browser.close(); }
    // 2. gameplay
    const parts = [];
    for (const [i, seg] of SURF.entries()) {
      const dir = `${tmp}/surf${i}`; fs.mkdirSync(dir);
      await surfFrames(openPage, v.w, v.h, seg, dir);
      parts.push({ pattern: `${dir}/%04d.jpg`, dur: seg.dur });
      console.log(v.name, 'surf', i, 'done');
    }
    // 3. unboxing
    { const dir = `${tmp}/vault`; fs.mkdirSync(dir);
      await vaultFrames({ openPageRaw, w: v.w, h: v.h, prefix: `${dir}/`, fps: FPS, from: VAULT.from, to: VAULT.to });
      parts.push({ pattern: `${dir}/%04d.jpg`, dur: VAULT.to - VAULT.from });
      console.log(v.name, 'vault done'); }

    // 4. assemble: cover 1.0 s, then cross-fades between the parts
    const COVER = 1.0, XF = 0.4;
    const inputs = ['-loop', '1', '-framerate', String(FPS), '-t', String(COVER + XF), '-i', `${tmp}/cover.png`];
    for (const p of parts) inputs.push('-framerate', String(FPS), '-i', p.pattern);
    let chain = '', last = '[0:v]', offset = COVER;
    let total = COVER + XF;
    parts.forEach((p, i) => {
      const out = `[x${i}]`;
      chain += `${last}[${i + 1}:v]xfade=transition=fade:duration=${XF}:offset=${offset.toFixed(3)}${out};`;
      offset += p.dur - XF;
      total += p.dur - XF;
      last = out;
    });
    chain += `${last}scale=${v.w}:${v.h},format=yuv420p[v]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', '[v]', '-an', '-r', String(FPS),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', `${OUT}/${v.name}.mp4`]);
    console.log(v.name, `≈${total.toFixed(1)} s`);
  }
}
