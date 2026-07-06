import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const outDir = fileURLToPath(new URL('./_3d/', import.meta.url));
await mkdir(outDir, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-unsafe-swapchain'] });
const page = await (await b.newContext({ viewport: { width: 1100, height: 820 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.evaluate(() => {}).catch(() => {});
await page.addInitScript(() => { window.__r = Math.random; Math.random = () => 0.4; }); // roll = 3
await page.goto('http://localhost:5173/play3d.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__sl3dReady === true, { timeout: 20000 });
await page.waitForTimeout(900);
const shot = (n) => page.screenshot({ path: join(outDir, n) });

const names = ['iso', 'topdown', 'low', 'corner', 'bird'];
for (let i = 0; i < 5; i++) {
  await page.evaluate((idx) => window.__sl3d.setView(idx), i);
  await page.waitForTimeout(1500);
  await shot(`v${i}_${names[i]}.png`);
}
await page.evaluate(() => window.__sl3d.setView(0));
await page.waitForTimeout(1400);
await page.click('#roll'); // 1 -> 4 ladder -> 25
await page.waitForTimeout(4200);
await shot('roll_ladder.png');
await page.waitForTimeout(3200);
await page.click('#roll'); // 25 -> 28 serpent -> 6
await page.waitForTimeout(4200);
await shot('roll_snake.png');
console.log('pos after rolls:', await page.evaluate(() => window.__sl3d.getPos()));
await b.close();
console.log('3d shots done ->', outDir);
