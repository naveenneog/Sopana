// Record a clean 2-player Board-mode gameplay clip for the landing page, plus a
// few still frames of the three modes. Drives real gameplay in a headless browser,
// forcing dice so the pilgrim hits a virtue ladder then a vice serpent (each with
// its Meaning Reveal). Output (WebM) is converted to MP4 + poster by ffmpeg later.
//
//   npm run serve   # in another terminal (http://localhost:5173)
//   node tooling/record_gameplay.mjs
import { chromium } from 'playwright';
import { mkdir, rename, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const BASE = process.env.SOPANA_BASE || 'http://localhost:5173';
const outDir = fileURLToPath(new URL('../web/assets/media/', import.meta.url));
const rawDir = fileURLToPath(new URL('./_rec/', import.meta.url));
await mkdir(outDir, { recursive: true });
await mkdir(rawDir, { recursive: true });

const GAME = {
  world: 'moksha',
  players: [
    { name: 'Pilgrim', color: '#e8c24a', char: 'pilgrim' },
    { name: 'Sage', color: '#46c7b0', char: 'sage' },
  ],
};

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--force-color-profile=srgb'],
});

// ---- 1) Record the board-mode gameplay video -----------------------------
const vctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: rawDir, size: { width: 1280, height: 720 } },
});
await vctx.addInitScript((cfg) => {
  try { sessionStorage.setItem('sopana.game', JSON.stringify(cfg)); } catch (e) { /* ignore */ }
}, GAME);

const page = await vctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

await page.goto(`${BASE}/board.html?world=moksha`, { waitUntil: 'load' });
await page.waitForSelector('#roster .rmp', { timeout: 15000 });   // 2-player roster is up
await page.waitForSelector('#rollBtn:not([disabled])', { timeout: 15000 });
await page.waitForTimeout(1200);

// Turn narration off for crisp, deterministic pacing (video has no audio anyway).
await page.click('#muteBtn').catch(() => {});
// Force the die: Math.random returns the fraction for the face we set.
await page.evaluate(() => { window.__face = 3; Math.random = () => (window.__face - 0.5) / 6; });

const setFace = (f) => page.evaluate((v) => { window.__face = v; }, f);
const rollReveal = async (face) => {
  await setFace(face);
  await page.click('#rollBtn');
  await page.waitForSelector('#reveal.show', { timeout: 6000 });
  await page.waitForTimeout(3600);                 // dwell so the meaning is readable
  await page.click('#continueBtn').catch(() => {});
  await page.waitForTimeout(1500);                 // climb / slide animation settles
};
const rollPlain = async (face) => {
  await setFace(face);
  await page.click('#rollBtn');
  await page.waitForTimeout(1900);
};

await page.waitForTimeout(700);
await rollReveal(3);   // P1: 1 -> 4 Shraddha ladder -> 25  (Faith, a virtue)
await rollPlain(5);    // P2: 1 -> 6
await rollReveal(3);   // P1: 25 -> 28 Moha serpent -> 6    (Delusion, a vice)
await rollPlain(4);    // P2: 6 -> 10
await page.waitForTimeout(1500);

await page.close();
await vctx.close();     // flushes the video file
// Playwright names videos randomly; grab the newest .webm and rename it.
const vids = (await readdir(rawDir)).filter((f) => f.endsWith('.webm'));
if (vids.length) {
  vids.sort();
  await rename(join(rawDir, vids[vids.length - 1]), join(outDir, 'gameplay.webm'));
  console.log('video ->', join(outDir, 'gameplay.webm'));
} else {
  console.log('WARN: no video captured');
}

// ---- 2) Still frames of the three modes ----------------------------------
const shots = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.25 });
await shots.addInitScript((cfg) => {
  try { sessionStorage.setItem('sopana.game', JSON.stringify(cfg)); } catch (e) { /* ignore */ }
}, GAME);
const sp = await shots.newPage();
sp.on('pageerror', (e) => console.log('SHOT PAGEERROR:', e.message));

async function shootBoard() {
  await sp.goto(`${BASE}/board.html?world=founders`, { waitUntil: 'load' });
  await sp.waitForSelector('#rollBtn:not([disabled])', { timeout: 15000 });
  await sp.waitForTimeout(1400);
  await sp.screenshot({ path: join(outDir, 'mode-board.jpg'), quality: 88, type: 'jpeg' });
  console.log('shot -> mode-board.jpg');
}
async function shootCinematic() {
  await sp.goto(`${BASE}/cinematic.html?world=panchatantra`, { waitUntil: 'load' });
  await sp.waitForFunction(() => window.__sopanaReady === true, { timeout: 25000 }).catch(() => {});
  await sp.waitForTimeout(1200);
  await sp.click('#beginBtn').catch(() => {});
  await sp.waitForTimeout(600);
  await sp.evaluate(() => { const s = document.querySelector('#skipIntro'); if (s) s.click(); });
  await sp.waitForTimeout(4500);
  await sp.screenshot({ path: join(outDir, 'mode-cinematic.jpg'), quality: 88, type: 'jpeg' });
  console.log('shot -> mode-cinematic.jpg');
}
async function shoot3d() {
  await sp.goto(`${BASE}/play3d.html?world=habits`, { waitUntil: 'load' });
  await sp.waitForTimeout(6000);   // WebGL under swiftshader is slow
  await sp.screenshot({ path: join(outDir, 'mode-3d.jpg'), quality: 88, type: 'jpeg' });
  console.log('shot -> mode-3d.jpg');
}
for (const fn of [shootBoard, shootCinematic, shoot3d]) {
  try { await fn(); } catch (e) { console.log('shot failed:', e.message); }
}
await shots.close();
await browser.close();
console.log('done ->', outDir);
