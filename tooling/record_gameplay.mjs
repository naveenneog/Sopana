// Record short, muted gameplay clips of all three Sopana renderers for the landing page.
// Drives real gameplay in a headless browser, forcing the die (one-shot, so only the roll
// is controlled and every other visual stays random) so each clip shows a virtue ladder
// and a vice serpent with its Meaning Reveal. WebM out; ffmpeg makes the MP4 + poster after.
//
//   npm run serve   # http://localhost:5173 in another terminal
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

const players = [
  { name: 'Pilgrim', color: '#e8c24a', char: 'pilgrim' },
  { name: 'Sage', color: '#46c7b0', char: 'sage' },
];
const gameFor = (world) => ({ world, players });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--force-color-profile=srgb'],
});

// Record one clip: open a video context, run `drive(page)`, then flush + rename to <name>.webm.
async function recordClip(name, world, drive) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: rawDir, size: { width: 1280, height: 720 } },
  });
  await ctx.addInitScript((cfg) => {
    try { sessionStorage.setItem('sopana.game', JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }, gameFor(world));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] PAGEERROR:`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] CONSOLE:`, m.text()); });
  try {
    await drive(page);
  } catch (e) {
    console.log(`[${name}] drive error:`, e.message);
  }
  await page.close();
  await ctx.close();
  const vids = (await readdir(rawDir)).filter((f) => f.endsWith('.webm')).sort();
  if (vids.length) {
    await rename(join(rawDir, vids[vids.length - 1]), join(outDir, `${name}.webm`));
    console.log(`video -> ${name}.webm`);
  } else {
    console.log(`[${name}] WARN: no video captured`);
  }
}

// Install a ONE-SHOT die override: the very next Math.random() (which is rollDie() at the top
// of every roll handler) returns the face we want; all other randomness stays real.
async function installDie(page) {
  await page.evaluate(() => {
    if (window.__dieWrapped) return;
    window.__dieWrapped = true;
    const real = Math.random.bind(Math);
    window.__forceFace = null;
    Math.random = () => {
      if (window.__forceFace != null) { const v = (window.__forceFace - 0.5) / 6; window.__forceFace = null; return v; }
      return real();
    };
  });
}
// Set the face and click Roll in the SAME task so no rAF/particle can consume the forced value.
const rollFace = (page, face, sel = '#roll') =>
  page.evaluate(({ f, s }) => { window.__forceFace = f; const b = document.querySelector(s); if (b) b.click(); }, { f: face, s: sel });
const waitTurn = (page, sel = '#roll', timeout = 25000) =>
  page.waitForFunction((s) => { const b = document.querySelector(s); return b && !b.disabled; }, sel, { timeout });

// ---- Board (moksha): 2 players, ladder then serpent -----------------------
await recordClip('gameplay', 'moksha', async (page) => {
  await page.goto(`${BASE}/board.html?world=moksha`, { waitUntil: 'load' });
  await page.waitForSelector('#roster .rmp', { timeout: 15000 });
  await page.waitForSelector('#rollBtn:not([disabled])', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.click('#muteBtn').catch(() => {});     // narration off for crisp pacing
  await installDie(page);
  const rollReveal = async (face) => {
    await rollFace(page, face, '#rollBtn');
    await page.waitForSelector('#reveal.show', { timeout: 6000 });
    await page.waitForTimeout(3600);
    await page.click('#continueBtn').catch(() => {});
    await page.waitForTimeout(1500);
  };
  const rollPlain = async (face) => { await rollFace(page, face, '#rollBtn'); await page.waitForTimeout(1900); };
  await page.waitForTimeout(700);
  await rollReveal(3);   // 1 -> 4 Shraddha ladder -> 25
  await rollPlain(5);    // P2: 1 -> 6
  await rollReveal(3);   // 25 -> 28 Moha serpent -> 6
  await rollPlain(4);    // P2: 6 -> 10
  await page.waitForTimeout(1500);
});

// ---- Cinematic (panchatantra): backlit shadow-theatre ---------------------
await recordClip('mode-cinematic', 'panchatantra', async (page) => {
  await page.goto(`${BASE}/cinematic.html?world=panchatantra`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sopanaReady === true, { timeout: 30000 });
  await page.waitForTimeout(900);
  await page.click('#beginBtn').catch(() => {});
  await page.waitForTimeout(700);
  await page.evaluate(() => { const s = document.querySelector('#skipIntro'); if (s) s.click(); }); // skip H.264 intro
  await page.waitForTimeout(2200);
  await installDie(page);
  const rollHit = async (face) => {
    await rollFace(page, face);
    await page.waitForTimeout(1200);
    await waitTurn(page, '#roll', 30000);           // whole walk + set-piece + card finishes
    await page.waitForTimeout(900);
  };
  await rollHit(3);   // step 4 -> Wit ladder -> 25
  await rollHit(3);   // step 28 -> Greed serpent -> 6
  await page.waitForTimeout(1200);
});

// ---- 3D (habits): real board, orbiting camera ----------------------------
await recordClip('mode-3d', 'habits', async (page) => {
  await page.goto(`${BASE}/play3d.html?world=habits`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sl3dReady === true, { timeout: 30000 });
  await page.waitForTimeout(1600);                  // let the first frames settle (software GL)
  await installDie(page);
  const rollHit = async (face) => {
    await rollFace(page, face);
    await page.waitForTimeout(1000);
    await waitTurn(page, '#roll', 30000);
    await page.waitForTimeout(900);
  };
  await rollHit(2);   // 1 -> 3 Sharing ladder -> 22
  await rollHit(6);   // 22 -> 28 (plain)
  await rollHit(4);   // 28 -> 32 Fibbing serpent -> 13
  await page.waitForTimeout(1400);
});

// ---- Board still for the (image) Board card ------------------------------
const shots = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.25 });
await shots.addInitScript((cfg) => {
  try { sessionStorage.setItem('sopana.game', JSON.stringify(cfg)); } catch (e) { /* ignore */ }
}, gameFor('founders'));
const sp = await shots.newPage();
try {
  await sp.goto(`${BASE}/board.html?world=founders`, { waitUntil: 'load' });
  await sp.waitForSelector('#rollBtn:not([disabled])', { timeout: 15000 });
  await sp.waitForTimeout(1400);
  await sp.screenshot({ path: join(outDir, 'mode-board.jpg'), quality: 88, type: 'jpeg' });
  console.log('shot -> mode-board.jpg');
} catch (e) { console.log('board still failed:', e.message); }
await shots.close();

await browser.close();
console.log('done ->', outDir);
