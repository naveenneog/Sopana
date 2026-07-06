// Screenshot-QA the cinematic experience with a headless browser (WebGL).
// Forces roll = 3 so the pilgrim hits the Shraddha ladder, then the Moha serpent.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const outDir = fileURLToPath(new URL('./_shots/', import.meta.url));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

await page.addInitScript(() => { Math.random = () => 0.4; }); // roll = 3 every time
await page.goto('http://localhost:5173/cinematic.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__sopanaReady === true, { timeout: 20000 });
await page.waitForTimeout(1400);

const shot = (name) => page.screenshot({ path: join(outDir, name) });

await shot('00_start_menu.png');
await page.click('#beginBtn');
await page.waitForTimeout(500);
await page.evaluate(() => { const s = document.querySelector('#skipIntro'); if (s) s.click(); }); // skip intro
await page.waitForTimeout(1700);
await page.click('#roll'); // -> step 4 (Shraddha ladder) -> climb to 25
await page.waitForTimeout(7000);
await shot('01_ladder_onpath.png');
await page.waitForTimeout(1600);
await page.click('#roll'); // -> step 28 (Moha serpent) -> slide to 6
await page.waitForTimeout(7000);
await shot('02_snake_onpath.png');

await browser.close();
console.log('shots done ->', outDir);
