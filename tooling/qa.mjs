// UX / Senior-QA harness. Drives both surfaces with Playwright, asserts behaviour,
// captures evidence, and prints a findings list (fed into the issue tracker).
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const outDir = fileURLToPath(new URL('./_qa/', import.meta.url));
await mkdir(outDir, { recursive: true });
const BASE = 'http://localhost:5173';
const findings = [];
const add = (area, sev, msg) => { findings.push({ area, sev, msg }); console.log(`[${sev}] ${area}: ${msg}`); };

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const shot = (page, name) => page.screenshot({ path: join(outDir, name) });

// ============================ SIMPLE BOARD (index.html) ============================
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(900);

  const cells = await page.$$eval('#board .cell', (els) => els.length).catch(() => 0);
  if (cells !== 100) add('board', 'HIGH', `board rendered ${cells} cells (expected 100)`);
  else add('board', 'PASS', 'board renders 100 cells');

  const hasWinUI = await page.$('#winOverlay') && await page.$('#winNewGame');
  if (!hasWinUI) add('board', 'HIGH', 'win overlay / New game control missing from DOM');

  // Force sixes and try to reach a win, auto-continuing reveals.
  await page.evaluate(() => { window.__r = Math.random; Math.random = () => 0.99; });
  let won = false;
  for (let i = 0; i < 70 && !won; i++) {
    const revealShown = await page.$eval('#reveal', (el) => !el.hidden).catch(() => false);
    if (revealShown) { await page.click('#continueBtn').catch(() => {}); }
    else {
      const disabled = await page.$eval('#rollBtn', (b) => b.disabled).catch(() => true);
      if (!disabled) await page.click('#rollBtn').catch(() => {});
    }
    await page.waitForTimeout(200);
    won = await page.$eval('#winOverlay', (el) => !el.hidden).catch(() => false);
  }
  add('board', won ? 'PASS' : 'INFO', won ? 'reachable win overlay confirmed' : 'win not reached within test budget (single-player luck)');
  await shot(page, 'board_win.png');
  if (won) {
    await page.click('#winNewGame').catch(() => {});
    await page.waitForTimeout(300);
    const st = await page.$eval('#status', (e) => e.textContent).catch(() => '');
    if (!/press roll/i.test(st)) add('board', 'LOW', `New game did not reset status ("${st}")`);
  }
  await page.evaluate(() => { if (window.__r) Math.random = window.__r; });

  // World switch mid-idle
  await page.selectOption('#worldSelect', 'worlds/habits.json').catch(() => {});
  await page.waitForTimeout(500);
  const title = await page.$eval('#worldTitle', (e) => e.textContent).catch(() => '');
  if (!/habit/i.test(title)) add('board', 'MED', `world switch did not update title ("${title}")`);
  else add('board', 'PASS', 'world switch updates title/theme');

  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot(page, 'board_mobile.png');

  if (errors.length) add('board', 'HIGH', `runtime errors: ${[...new Set(errors)].slice(0, 3).join(' || ')}`);
  else add('board', 'PASS', 'no console/page errors');
  await ctx.close();
}

// ============================ CINEMATIC (cinematic.html) ============================
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE + '/cinematic.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sopanaReady === true, { timeout: 20000 });
  await page.waitForTimeout(600);
  await shot(page, 'cine_startmenu.png');

  // BUG CHECK: does Space roll while the title menu is still up?
  const before = await page.$eval('#status', (e) => e.textContent);
  await page.keyboard.press('Space');
  await page.waitForTimeout(1400);
  const after = await page.$eval('#status', (e) => e.textContent);
  const posAfter = await page.evaluate(() => window.__sopanaDebug.getPos());
  if (before !== after || posAfter !== 1) add('cinematic', 'MED', `Space triggers a roll BEFORE "Begin" (status "${before}"->"${after}", pos=${posAfter}) — game advances behind the title menu`);
  else add('cinematic', 'PASS', 'Space does not roll before Begin');

  // Begin + skip
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__sopanaReady === true, { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.click('#beginBtn');
  await page.waitForTimeout(400);
  await page.evaluate(() => { const s = document.querySelector('#skipIntro'); if (s) s.click(); });
  await page.waitForTimeout(1200);
  const dismissed = await page.$eval('#startScreen', (el) => getComputedStyle(el).display === 'none' || getComputedStyle(el).opacity === '0');
  if (!dismissed) add('cinematic', 'MED', 'title/intro screen did not dismiss after Begin + Skip');
  else add('cinematic', 'PASS', 'Begin + Skip reveals the game');

  // Reach Moksha (teleport to 96, roll 4 -> 100) and check for a restart control
  await page.evaluate(() => window.__sopanaDebug.teleport(96));
  await page.evaluate(() => { window.__r = Math.random; Math.random = () => 0.6; }); // roll 4
  await page.waitForTimeout(200);
  for (let i = 0; i < 4; i++) {
    const busy = await page.evaluate(() => window.__sopanaDebug.isBusy());
    if (!busy) await page.click('#roll').catch(() => {});
    await page.waitForTimeout(2500);
    if ((await page.evaluate(() => window.__sopanaDebug.getPos())) >= 100) break;
  }
  const pos = await page.evaluate(() => window.__sopanaDebug.getPos());
  const restartVisible = await page.$eval('#restartBtn', (b) => b.style.display !== 'none').catch(() => false);
  if (pos >= 100 && restartVisible) add('cinematic', 'PASS', 'Moksha end shows a "Begin again" restart');
  else if (pos >= 100) add('cinematic', 'MED', 'reached Moksha but no restart control shown');
  else add('cinematic', 'INFO', `Moksha not reached in budget (pos=${pos})`);
  await shot(page, 'cine_moksha.png');
  if (restartVisible) {
    await page.click('#restartBtn'); await page.waitForTimeout(400);
    const np = await page.evaluate(() => window.__sopanaDebug.getPos());
    add('cinematic', np === 1 ? 'PASS' : 'MED', np === 1 ? 'restart returns to step 1' : `restart did not reset (pos=${np})`);
  }
  await page.evaluate(() => { if (window.__r) Math.random = window.__r; });

  // Mute must silence audio (master gain -> 0), not just change the label
  const l0 = await page.$eval('#muteBtn', (b) => b.textContent);
  await page.click('#muteBtn'); await page.waitForTimeout(200);
  const l1 = await page.$eval('#muteBtn', (b) => b.textContent);
  const gain = await page.evaluate(() => window.__sopanaDebug.masterGain());
  if (l0 === l1) add('cinematic', 'LOW', 'mute button label does not change');
  if (gain > 0.01) add('cinematic', 'HIGH', `mute did NOT silence audio (master gain=${gain})`);
  else add('cinematic', 'PASS', `mute silences audio (master gain=${gain}), label ${l0}->${l1}`);

  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await shot(page, 'cine_mobile.png');

  if (errors.length) add('cinematic', 'HIGH', `runtime errors: ${[...new Set(errors)].slice(0, 3).join(' || ')}`);
  else add('cinematic', 'PASS', 'no console/page errors');
  await ctx.close();
}

// Wide desktop (over-zoom check) — separate context
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/cinematic.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sopanaReady === true, { timeout: 20000 });
  await page.click('#beginBtn'); await page.waitForTimeout(300);
  await page.evaluate(() => { const s = document.querySelector('#skipIntro'); if (s) s.click(); });
  await page.waitForTimeout(1200);
  await shot(page, 'cine_wide.png');
  await ctx.close();
}

await browser.close();
console.log('\n===== QA FINDINGS =====');
for (const f of findings) console.log(`[${f.sev}] ${f.area}: ${f.msg}`);
