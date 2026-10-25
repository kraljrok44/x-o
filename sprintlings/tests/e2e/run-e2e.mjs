// End-to-end UI tests: builds the standalone version, serves it with
// `vite preview` and drives it with Playwright (headless Chromium).
import { spawn, execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4179;
const URL = `http://localhost:${PORT}/`;

execSync('npx vite build --logLevel error', { stdio: 'inherit' });
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', 'dist/standalone'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

// Canvas2D renders fastest with Chromium's default (CPU) rasteriser in headless mode.
const browser = await chromium.launch();
const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push(`✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const app = (fn, arg) => page.evaluate(fn, arg);
const wallet = () => app(() => window.sprintlings.authority.profile.wallet);

await test('boots into the main menu without errors', async () => {
  await page.goto(URL);
  await page.waitForSelector('text=Play', { timeout: 30000 });
  assert.equal(errors.length, 0, errors.join('\n'));
});

await test('layout adapts to a portrait phone screen', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const box = await page.getByRole('button', { name: /Play/ }).boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, 'Play button inside the viewport');
  const canvas = await page.locator('#game-canvas').boundingBox();
  assert.equal(Math.round(canvas.width), 390);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
});

await test('shop: preview, buy with confirmation, equip', async () => {
  await app(() => window.sprintlings.go('shop'));
  await page.waitForSelector('text=Acorn Helmet');
  const before = (await wallet()).coins;
  await page.locator('.card', { hasText: 'Acorn Helmet' }).click();
  await page.getByRole('button', { name: /Buy for/ }).click();
  await page.locator('.modal').getByRole('button', { name: 'Buy', exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal((await wallet()).coins, before - 150);
  assert.ok(await app(() => window.sprintlings.authority.profile.inventory.includes('hat_acorn')));
  await page.getByRole('button', { name: 'Equip' }).click();
  await page.waitForTimeout(300);
  assert.equal(await app(() => window.sprintlings.authority.profile.loadout.hat), 'hat_acorn');
});

await test('shop: not enough coins shows a clear message and charges nothing', async () => {
  const before = (await wallet()).coins;
  await page.locator('.card', { hasText: 'Dapper Top Hat' }).click();
  await page.getByRole('button', { name: /Buy for/ }).click();
  await page.waitForSelector('text=Not enough Coins.');
  assert.equal((await wallet()).coins, before);
  await page.keyboard.press('Escape');
});

await test('gem store explains purchases are unavailable in this build', async () => {
  await page.getByRole('button', { name: 'Gem Store' }).click();
  await page.waitForSelector('text=You can still earn Gems');
});

await test('navigates every screen and back with Escape', async () => {
  for (const s of ['modes', 'characters', 'locker', 'quests', 'achievements', 'season', 'settings', 'profile']) {
    await app((x) => window.sprintlings.go(x), s);
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForSelector('text=Play', { timeout: 5000 });
  }
  assert.equal(errors.length, 0, errors.join('\n'));
});

await test('mute setting persists across reloads', async () => {
  await app(() => window.sprintlings.go('settings'));
  await page.locator('input[aria-label="Mute"]').check();
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector('text=Play', { timeout: 30000 });
  assert.equal(await app(() => window.sprintlings.settings.value.audio.muted), true);
});

await test('race: lobby, pause, restart, finish, results and rewards', async () => {
  await page.getByRole('button', { name: /Play/ }).click();
  await page.waitForSelector('text=Ready');
  await page.getByRole('button', { name: 'Ready' }).click().catch(() => {});
  await page.waitForFunction(() => window.sprintlings.race?.phase === 'racing', null, { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('text=Paused');
  await page.getByRole('button', { name: 'Restart' }).click();
  await page.waitForSelector('text=Ready');
  await page.getByRole('button', { name: 'Ready' }).click().catch(() => {});
  await page.waitForFunction(() => window.sprintlings.race?.phase === 'racing', null, { timeout: 15000 });
  const coins = (await wallet()).coins;
  await app(() => window.sprintlings.race.fastForward(8000));
  await page.waitForSelector('text=Your rewards', { timeout: 60000 });
  await page.waitForSelector('text=Total', { timeout: 30000 });
  assert.ok((await wallet()).coins > coins, 'coins were credited');
  assert.equal(await page.locator('text=Watch a video').count(), 0, 'no ad offers without an ad provider');
  await page.getByRole('button', { name: /Race again/ }).click();
  await page.waitForSelector('text=Ready', { timeout: 15000 });
  assert.equal(errors.length, 0, errors.join('\n'));
});

await browser.close();
preview.kill();
console.log(results.join('\n'));
