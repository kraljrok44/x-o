// contact sheet: frames of one scenario at the given run-time seconds, tiled into one image
export default async function ({ openPage, OUT, execFileSync }) {
  const s = JSON.parse(process.argv[3]);
  const { browser, page } = await openPage(s.w || 640, s.h || 360);
  await page.evaluate((s) => window.media.setup(s), s);
  let t = 0;
  const files = [];
  for (const at of s.at) {
    await page.evaluate((n) => { for (let i = 0; i < n; i++) window.media.frame(1 / 30, false); window.media.frame(0); }, Math.round((at - t) * 30));
    t = at;
    const f = `${OUT}/sheet-${s.name}-${files.length}.jpg`;
    await page.screenshot({ path: f, quality: 80 });
    files.push(f);
  }
  await browser.close();
  const cols = s.cols || 4;
  const rows = Math.ceil(files.length / cols);
  const W = s.w || 640, H = s.h || 360;
  const layout = files.map((_, i) => `${(i % cols) * W}_${Math.floor(i / cols) * H}`).join('|');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `xstack=inputs=${files.length}:layout=${layout}:fill=black`, `${OUT}/sheet-${s.name}.jpg`]);
  console.log(`${OUT}/sheet-${s.name}.jpg`, rows);
}
