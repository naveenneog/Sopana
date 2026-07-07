import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const outDir = fileURLToPath(new URL('./_board/', import.meta.url));
await mkdir(outDir, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 820, height: 1000 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto('http://localhost:5173/index.html', { waitUntil: 'load' });
await page.waitForTimeout(800);

const worlds = [
  ['moksha', 'worlds/moksha.json'],
  ['founders', 'worlds/founders.json'],
  ['panch', 'worlds/panchatantra.json'],
  ['habits', 'worlds/habits.json'],
];
for (const [name, val] of worlds) {
  await page.selectOption('#worldSelect', val);
  await page.waitForTimeout(1000);
  const board = await page.$('.board-wrap');
  await board.screenshot({ path: join(outDir, name + '.png') });
}
await b.close();
console.log('board shots done ->', outDir);
