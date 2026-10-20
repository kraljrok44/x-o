// The three CrazyGames covers: 1920x1080 (16:9), 800x1200 (2:3), 800x800 (1:1).
// Key art: a painted surf scene rendered by the engine, a large hero knife and the title only.
const SCENE = { map: 'surf_neon_drift', view: 'fp', vm: false, showHero: true, bots: [{ ticks: 0, knife: 'crescent__gilded_relic', color: 0 }, { ticks: 90, knife: 'lancer__abyss_p2', color: 1 }, { ticks: 200, knife: 'ranger__factory', color: 6 }] };
export const COVERS = [
  { name: 'cover-landscape-1920x1080', w: 1920, h: 1080, at: 5.6, cam: { pull: 150, rise: 40, pitchAdd: 0.02, yawAdd: 0.1 },
    knife: { id: 'lancer__sunset_melt', box: [940, 200, 960, 880], rot: [0.3, 0.2, 2.5] }, title: { x: 70, y: 70, w: 980, size: 168, align: 'left' } },
  { name: 'cover-portrait-800x1200', w: 800, h: 1200, at: 5.6, cam: { pull: 150, rise: 40, pitchAdd: -0.05, yawAdd: -0.12 },
    knife: { id: 'lancer__sunset_melt', box: [40, 700, 720, 480], rot: [0.3, 0.2, 2.75] }, title: { x: 0, y: 80, w: 800, size: 132, align: 'center' } },
  { name: 'cover-square-800x800', w: 800, h: 800, at: 5.6, cam: { pull: 150, rise: 40, pitchAdd: 0.0, yawAdd: -0.02 },
    knife: { id: 'lancer__sunset_melt', box: [300, 440, 480, 340], rot: [0.3, 0.2, 2.5] }, title: { x: 0, y: 46, w: 800, size: 128, align: 'center' } },
];

export async function renderCover(page, c, path) {
  await page.evaluate(({ c, SCENE }) => {
    window.media.setup({ ...SCENE, ...c.cam });
    window.media.skip(c.at);
    const [x, y, w, h] = c.knife.box;
    window.media.knife(c.knife.id, { x, y, w, h }, c.knife.rot);
    const t = document.getElementById('title');
    Object.assign(t.style, { display: 'block', left: c.title.x + 'px', top: c.title.y + 'px', width: c.title.w + 'px', fontSize: c.title.size + 'px', textAlign: c.title.align });
    const g = document.getElementById('grade');
    g.style.display = 'block';
    g.style.background = 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 55%, rgba(10,0,30,.45) 100%)';
  }, { c, SCENE });
  await page.screenshot({ path, type: 'png' });
}

export default async function ({ openPage, OUT }) {
  const only = process.argv[3];
  for (const c of COVERS) {
    if (only && !c.name.includes(only)) continue;
    const { browser, page } = await openPage(c.w, c.h);
    await renderCover(page, c, `${OUT}/${c.name}.png`);
    await browser.close();
    console.log('cover', c.name);
  }
}
