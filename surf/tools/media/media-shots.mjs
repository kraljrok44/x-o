// quick exploration frames: node tools/media/record.mjs shots '<json list>'
export default async function ({ openPage, OUT }) {
  const list = JSON.parse(process.argv[3]);
  const { browser, page } = await openPage(960, 540);
  for (const s of list) {
    await page.evaluate((s) => { window.media.setup(s); for (let i = 0; i < (s.warm || 30); i++) window.media.frame(1 / 30); }, s);
    await page.screenshot({ path: `${OUT}/shot-${s.name}.jpg`, quality: 85 });
  }
  await browser.close();
}
