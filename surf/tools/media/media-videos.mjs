// CrazyGames preview videos: 15-20 s, silent, 1080p landscape (16:9) and portrait (2:3).
// Cover as the first frame -> fast first-person surfing -> runway hops, jump with a 360 and landing
// on the next section -> leaderboard -> knife unboxing with the reveal card -> collection + 5 knives.
// Real-time speed (no fast-forward), no cursor, no promotional text.
import fs from 'node:fs';
import { COVERS, renderCover } from './media-covers.mjs';
import { uiShots, EQUIPPED } from './media-ui.mjs';

const FPS = 30;
const XF = 0.3; // cross-fade between shots
const SURF = [
  { name: 'surf-fast', map: 'surf_neon_drift', from: 11.5, dur: 2.9, fov: 106, ghost: { lead: 70, secs: 20 },
    bots: [{ ticks: 0, knife: EQUIPPED }, { ticks: 140, knife: 'warden__abyss_p2', color: 1 }, { ticks: 290, knife: 'moth__jade_flow', color: 6 }] },
  { name: 'surf-jump', map: 'surf_ember_core', from: 8.9, dur: 4.0, fov: 106, spin: [11.25, 12.3],
    bots: [{ ticks: 0, knife: EQUIPPED }, { ticks: 120, knife: 'flicker__heat_temper', color: 3 }] },
];

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
  await page.evaluate((seg) => { window.media.setup({ map: seg.map, view: 'fp', hud: true, fov: seg.fov, spin: seg.spin, ghost: seg.ghost, bots: seg.bots }); window.media.skip(seg.from); }, seg);
  const n = Math.round(seg.dur * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.media.frame(1 / 30));
    await page.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  await browser.close();
}

const count = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).length : 0);

export default async function ({ openPage, openPageRaw, OUT, execFileSync }) {
  const only = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
  for (const v of VIDEOS) {
    if (only && !v.name.includes(only)) continue;
    const tmp = `${OUT}/tmp-${v.name}`;
    if (process.argv.includes('--fresh')) fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    { const { browser, page } = await openPage(v.w, v.h); await renderCover(page, v.cover, `${tmp}/cover.png`); await browser.close(); }
    for (const seg of SURF) {
      const dir = `${tmp}/${seg.name}`;
      // gameplay frames are deterministic: reuse a complete earlier render
      if (count(dir) !== Math.round(seg.dur * FPS)) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir); await surfFrames(openPage, v.w, v.h, seg, dir); }
      console.log(v.name, seg.name, 'ok');
    }
    if (!count(`${tmp}/ui/inv`) || process.argv.includes('--ui')) { fs.rmSync(`${tmp}/ui`, { recursive: true, force: true }); await uiShots({ openPageRaw, w: v.w, h: v.h, dir: `${tmp}/ui` }); }
    console.log(v.name, 'ui ok');

    const parts = [...SURF.map((s) => `${tmp}/${s.name}`), `${tmp}/ui/lb`, `${tmp}/ui/vault`, `${tmp}/ui/inv`].map((dir) => ({ pattern: `${dir}/%04d.jpg`, dur: count(dir) / FPS }));
    const COVER = 0.9;
    const inputs = ['-loop', '1', '-framerate', String(FPS), '-t', String(COVER + XF), '-i', `${tmp}/cover.png`];
    for (const p of parts) inputs.push('-framerate', String(FPS), '-i', p.pattern);
    let chain = '', last = '[0:v]', offset = COVER, total = COVER + XF;
    parts.forEach((p, i) => {
      chain += `${last}[${i + 1}:v]xfade=transition=fade:duration=${XF}:offset=${offset.toFixed(3)}[x${i}];`;
      offset += p.dur - XF;
      total += p.dur - XF;
      last = `[x${i}]`;
    });
    chain += `${last}scale=${v.w}:${v.h},format=yuv420p[v]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', '[v]', '-an', '-r', String(FPS),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', `${OUT}/${v.name}.mp4`]);
    console.log(v.name, `≈${total.toFixed(1)} s`);
  }
}
