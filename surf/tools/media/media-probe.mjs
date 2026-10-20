// timeline of a bot run: node tools/media/record.mjs probe <map> [seconds]
export default async function ({ openPage }) {
  const map = process.argv[3], secs = Number(process.argv[4] || 90);
  const { browser, page } = await openPage(320, 180);
  const r = await page.evaluate(({ map, secs }) => {
    window.media.setup({ map, view: 'fp', vm: false, bots: [{ ticks: 0, knife: 'ranger__factory' }] });
    const out = []; let prev = '';
    for (let i = 0; i < secs * 20; i++) {
      const f = window.media.frame(0.05, false);
      const st = `${f.stage} ${f.pad ? 'PAD' : f.surfing ? 'surf' : f.ground ? 'gnd' : 'air'}`;
      if (st !== prev) { out.push(`${f.t.toFixed(2)}s ${st} spd ${f.speed.toFixed(0)} z ${f.z.toFixed(0)}`); prev = st; }
      if (f.finished) break;
    }
    return out;
  }, { map, secs });
  console.log(r.join('\n'));
  await browser.close();
}
