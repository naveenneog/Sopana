// Full UX/QA sweep: console/page errors, responsive overflow, interaction flows,
// and design screenshots across modes, themes and viewports. Read-only (no writes).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = 'tooling/_qa';
mkdirSync(OUT, { recursive: true });

const VP = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  tv: { width: 1920, height: 1080 },
};

const findings = [];
const note = (area, sev, msg, extra) => findings.push({ area, sev, msg, extra: extra || '' });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });

function wireErrors(page, tag, errs) {
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (/\.(js|css|json|png|mp4)(\?|$)/.test(u) && !u.includes('favicon')) errs.push(`404/fail: ${u.replace(BASE, '')}`);
  });
}

// seed a 4-player config for a world
function cfg(world, chars) {
  const colors = ['#e8c24a', '#46c7b0', '#e0559b', '#6fb1ff'];
  return { world, players: chars.map((c, i) => ({ name: ['Asha', 'Ravi', 'Meera', 'Dev'][i], color: colors[i], char: c })) };
}

// measure whether any element in `sel` overflows the viewport horizontally
async function overflow(page, sel) {
  return page.evaluate((s) => {
    const vw = window.innerWidth;
    const els = [...document.querySelectorAll(s)];
    const bad = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) bad.push({ id: el.id || el.className, right: Math.round(r.right), left: Math.round(r.left), vw });
    }
    // also body horizontal scroll
    const bodyScroll = document.documentElement.scrollWidth - window.innerWidth;
    return { bad, bodyScroll };
  }, sel);
}

async function shoot(page, name) { await page.screenshot({ path: `${OUT}/${name}.png` }); }

// ---------- 1. LOBBY ----------
for (const [vpName, vp] of Object.entries(VP)) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const errs = [];
  wireErrors(page, 'setup', errs);
  await page.goto(`${BASE}/setup.html?world=panchatantra`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  // choose 4 players to stress the layout
  const counts = await page.$$('#counts .pill');
  if (counts[3]) await counts[3].click();
  await page.waitForTimeout(400);
  await shoot(page, `lobby_${vpName}`);
  const ov = await overflow(page, '#themes, #modes, #counts, #players .prow');
  if (ov.bodyScroll > 2) note('lobby', 'MEDIUM', `horizontal scroll ${ov.bodyScroll}px at ${vpName}`);
  if (ov.bad.length) note('lobby', 'MEDIUM', `element overflow at ${vpName}`, JSON.stringify(ov.bad.slice(0, 3)));
  // a11y: selected states announced?
  const ariaPill = await page.$eval('#modes .pill.sel', (e) => e.getAttribute('aria-pressed') || e.getAttribute('aria-selected') || 'none').catch(() => 'none');
  if (vpName === 'desktop' && ariaPill === 'none') note('lobby', 'LOW', 'mode/theme/char selection not exposed to AT (no aria-pressed/selected)');
  // focus visibility on a pill
  if (vpName === 'desktop') {
    const outline = await page.evaluate(() => {
      const el = document.querySelector('#counts .pill');
      el.focus();
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
    });
    if (outline.outline === 'none' && (!outline.shadow || outline.shadow === 'none')) note('lobby', 'LOW', 'keyboard focus not visible on pills (outline:none, no focus ring)');
  }
  if (errs.length) note('lobby', 'HIGH', `errors at ${vpName}`, errs.join(' | '));
  await ctx.close();
}

// ---------- 2. BOARD (4-player) ----------
for (const [vpName, vp] of Object.entries(VP)) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addInitScript((c) => sessionStorage.setItem('sopana.game', JSON.stringify(c)), cfg('moksha', ['pilgrim', 'sage', 'devotee', 'wanderer']));
  const page = await ctx.newPage();
  const errs = [];
  wireErrors(page, 'board', errs);
  await page.goto(`${BASE}/board.html?world=moksha`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await shoot(page, `board_${vpName}`);
  const ov = await overflow(page, '.hud, #roster, .board-wrap');
  if (ov.bodyScroll > 2) note('board', 'MEDIUM', `horizontal scroll ${ov.bodyScroll}px at ${vpName}`);
  if (ov.bad.length) note('board', 'MEDIUM', `element overflow at ${vpName}`, JSON.stringify(ov.bad.slice(0, 3)));
  // token count + start overlap legibility
  const tk = await page.$$eval('.token.mp', (t) => t.length);
  if (tk !== 4) note('board', 'HIGH', `expected 4 tokens, found ${tk}`);
  // board render size (SOP-10 follow-up)
  const bw = await page.$eval('.board-wrap', (e) => Math.round(e.getBoundingClientRect().width)).catch(() => 0);
  if (vpName === 'mobile' && bw < 320) note('board', 'INFO', `board width only ${bw}px on mobile`);
  if (errs.length) note('board', 'HIGH', `errors at ${vpName}`, errs.join(' | '));
  await ctx.close();
}

// ---------- 3. CINEMATIC (2-player) each theme ----------
for (const world of ['moksha', 'founders', 'panchatantra', 'habits']) {
  const ctx = await browser.newContext({ viewport: VP.desktop });
  await ctx.addInitScript((c) => sessionStorage.setItem('sopana.game', JSON.stringify(c)), cfg(world, ['pilgrim', 'sage']));
  const page = await ctx.newPage();
  const errs = [];
  wireErrors(page, 'cinematic', errs);
  await page.goto(`${BASE}/cinematic.html?world=${world}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sopanaReady === true, { timeout: 15000 }).catch(() => note('cinematic', 'HIGH', `${world} never became ready`));
  await page.waitForTimeout(700);
  await shoot(page, `cine_start_${world}`);
  const introSrc = await page.$eval('#introVideo', (v) => v.getAttribute('src') || '').catch(() => '');
  const expected = world === 'moksha' ? 'assets/intro.mp4' : `${world}/intro.mp4`;
  if (!introSrc.includes(expected)) note('cinematic', 'MEDIUM', `${world} intro src unexpected`, introSrc);
  if (errs.length) note('cinematic', 'HIGH', `${world} errors`, errs.join(' | '));
  await ctx.close();
}

// cinematic mobile HUD overflow
{
  const ctx = await browser.newContext({ viewport: VP.mobile });
  await ctx.addInitScript((c) => sessionStorage.setItem('sopana.game', JSON.stringify(c)), cfg('moksha', ['pilgrim', 'sage']));
  const page = await ctx.newPage();
  const errs = [];
  wireErrors(page, 'cinematic', errs);
  await page.goto(`${BASE}/cinematic.html?world=moksha`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sopanaReady === true, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => window.__sopanaDebug && window.__sopanaDebug.begin && window.__sopanaDebug.begin());
  await page.waitForTimeout(13000);
  await shoot(page, `cine_mobile_hud`);
  const ov = await overflow(page, '#hud, nav');
  if (ov.bodyScroll > 2) note('cinematic', 'MEDIUM', `mobile horizontal scroll ${ov.bodyScroll}px`);
  if (ov.bad.length) note('cinematic', 'MEDIUM', 'mobile HUD/nav overflow', JSON.stringify(ov.bad.slice(0, 4)));
  // does HUD collide with nav or go off-screen bottom?
  const hud = await page.evaluate(() => { const h = document.querySelector('#hud'); const r = h.getBoundingClientRect(); return { right: Math.round(r.right), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight }; });
  if (hud.right > hud.vw + 1) note('cinematic', 'MEDIUM', `mobile HUD extends to ${hud.right}px (vw ${hud.vw})`);
  if (errs.length) note('cinematic', 'HIGH', 'mobile errors', errs.join(' | '));
  await ctx.close();
}

// ---------- 4. 3D each theme + mobile HUD ----------
for (const world of ['moksha', 'founders', 'panchatantra', 'habits']) {
  const ctx = await browser.newContext({ viewport: VP.desktop });
  await ctx.addInitScript((c) => sessionStorage.setItem('sopana.game', JSON.stringify(c)), cfg(world, ['pilgrim', 'sage']));
  const page = await ctx.newPage();
  const errs = [];
  wireErrors(page, '3d', errs);
  await page.goto(`${BASE}/play3d.html?world=${world}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sl3dReady === true, { timeout: 15000 }).catch(() => note('3d', 'HIGH', `${world} never became ready`));
  await page.waitForTimeout(900);
  await shoot(page, `td_${world}`);
  if (errs.length) note('3d', 'HIGH', `${world} errors`, errs.join(' | '));
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: VP.mobile });
  await ctx.addInitScript((c) => sessionStorage.setItem('sopana.game', JSON.stringify(c)), cfg('founders', ['founder', 'engineer']));
  const page = await ctx.newPage();
  const errs = [];
  wireErrors(page, '3d', errs);
  await page.goto(`${BASE}/play3d.html?world=founders`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sl3dReady === true, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shoot(page, `td_mobile_hud`);
  const ov = await overflow(page, '#hud, nav');
  if (ov.bodyScroll > 2) note('3d', 'MEDIUM', `mobile horizontal scroll ${ov.bodyScroll}px`);
  if (ov.bad.length) note('3d', 'MEDIUM', 'mobile HUD/nav overflow', JSON.stringify(ov.bad.slice(0, 4)));
  if (errs.length) note('3d', 'HIGH', 'mobile errors', errs.join(' | '));
  await ctx.close();
}

// ---------- 5. config persistence: lobby -> begin ----------
{
  const ctx = await browser.newContext({ viewport: VP.desktop });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/setup.html?world=founders`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const counts = await page.$$('#counts .pill'); if (counts[1]) await counts[1].click();
  await page.waitForTimeout(200);
  // set a custom name
  await page.fill('#players .prow:first-child .pname', 'Zed');
  await page.click('#begin');
  await page.waitForURL('**/cinematic.html*', { timeout: 8000 }).catch(() => note('flow', 'HIGH', 'Begin did not navigate to cinematic'));
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sopana.game') || '{}'));
  if (!(saved.players && saved.players[0] && saved.players[0].name === 'Zed')) note('flow', 'HIGH', 'custom name not persisted', JSON.stringify(saved));
  if (!(saved.players && saved.players.length === 2)) note('flow', 'MEDIUM', 'player count not persisted', JSON.stringify(saved && saved.players && saved.players.length));
  await ctx.close();
}

await browser.close();

// ---------- report ----------
const order = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
findings.sort((a, b) => (order[a.sev] - order[b.sev]));
console.log(`\n===== QA FINDINGS (${findings.length}) =====`);
for (const f of findings) console.log(`[${f.sev}] (${f.area}) ${f.msg}${f.extra ? '  :: ' + f.extra : ''}`);
if (!findings.length) console.log('No automated issues detected.');
console.log('\nScreenshots in', OUT);
