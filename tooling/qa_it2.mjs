// QA for iteration 2 stage 3: default->cinematic redirect, mode nav, cinematic theme switch.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = 'tooling/_it2';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const results = [];

async function page(url) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  return { p, errs };
}

// 1. index redirects to cinematic
{
  const { p, errs } = await page(`${BASE}/index.html`);
  await p.waitForTimeout(500);
  const here = p.url();
  results.push(['index->cinematic redirect', here.includes('cinematic.html'), here]);
  await p.screenshot({ path: `${OUT}/1_index_redirect.png` });
  await p.close();
  if (errs.length) results.push(['index errors', false, errs.join(' | ')]);
}

// 2. cinematic default (moksha): nav + theme select present, intro path intact
{
  const { p, errs } = await page(`${BASE}/cinematic.html`);
  const nav = await p.$$eval('nav a', (as) => as.map((a) => a.textContent.trim()));
  const sel = await p.$eval('#worldSel', (s) => s.value).catch(() => null);
  const navWorld = await p.$eval('nav a[href*="board"]', (a) => a.getAttribute('href')).catch(() => null);
  results.push(['cinematic nav has 3 modes', nav.length === 3, nav.join(',')]);
  results.push(['cinematic theme select = moksha', sel === 'moksha', String(sel)]);
  results.push(['cinematic nav carries ?world', navWorld && navWorld.includes('world=moksha'), String(navWorld)]);
  await p.screenshot({ path: `${OUT}/2_cinematic_moksha.png` });
  await p.close();
  if (errs.length) results.push(['cinematic moksha errors', false, errs.join(' | ')]);
}

// 3. cinematic founders: theme applied, intro skipped (Begin -> game, no intro video shown)
{
  const { p, errs } = await page(`${BASE}/cinematic.html?world=founders`);
  const sel = await p.$eval('#worldSel', (s) => s.value).catch(() => null);
  results.push(['cinematic theme select = founders', sel === 'founders', String(sel)]);
  // Begin and confirm no intro video plays (non-moksha skips intro)
  await p.click('#beginBtn').catch(() => {});
  await p.waitForTimeout(1800);
  const introShown = await p.$eval('#introVideo', (v) => getComputedStyle(v).display !== 'none').catch(() => false);
  const started = await p.$eval('#startScreen', (s) => s.classList.contains('hide')).catch(() => false);
  results.push(['founders intro skipped', introShown === false, `introShown=${introShown}`]);
  results.push(['founders game started', started === true, `startHidden=${started}`]);
  await p.screenshot({ path: `${OUT}/3_cinematic_founders.png` });
  await p.close();
  if (errs.length) results.push(['cinematic founders errors', false, errs.join(' | ')]);
}

// 4. play3d panchatantra: nav present + theme select value
{
  const { p, errs } = await page(`${BASE}/play3d.html?world=panchatantra`);
  const nav = await p.$$eval('nav a', (as) => as.map((a) => a.textContent.trim()));
  const sel = await p.$eval('#worldSel', (s) => s.value).catch(() => null);
  results.push(['3d nav has 3 modes', nav.length === 3, nav.join(',')]);
  results.push(['3d theme select = panchatantra', sel === 'panchatantra', String(sel)]);
  await p.screenshot({ path: `${OUT}/4_play3d_panchatantra.png` });
  await p.close();
  if (errs.length) results.push(['play3d errors', false, errs.join(' | ')]);
}

// 5. board.html: mode links carry ?world after switching theme
{
  const { p, errs } = await page(`${BASE}/board.html?world=habits`);
  await p.waitForTimeout(800);
  const cine = await p.$eval('#lnkCine', (a) => a.getAttribute('href')).catch(() => null);
  const sel = await p.$eval('#worldSelect', (s) => s.value).catch(() => null);
  results.push(['board honors ?world=habits', sel === 'worlds/habits.json', String(sel)]);
  results.push(['board Cinematic link carries world', cine && cine.includes('world=habits'), String(cine)]);
  await p.screenshot({ path: `${OUT}/5_board_habits.png` });
  await p.close();
  if (errs.length) results.push(['board errors', false, errs.join(' | ')]);
}

await browser.close();

let pass = 0;
for (const [name, ok, detail] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${ok ? '' : '-> ' + detail}`);
  if (ok) pass++;
}
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
