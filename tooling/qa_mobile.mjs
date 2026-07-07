// Mobile UX audit: touch targets, overflow, board size, thumb reach, safe area.
// Uses real phone viewports with touch + deviceScaleFactor. Read-only.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = 'tooling/_mob';
mkdirSync(OUT, { recursive: true });

const VP = {
  se: { width: 375, height: 667 },       // iPhone SE (smallest common)
  ip12: { width: 390, height: 844 },     // iPhone 12/13/14
  pixel: { width: 393, height: 851 },    // Pixel 7-ish
  small: { width: 360, height: 640 },    // small Android
  land: { width: 844, height: 390 },     // landscape
};
const MIN = 44; // min touch target (px, CSS)

const findings = [];
const note = (area, sev, msg, extra) => findings.push({ area, sev, msg, extra: extra || '' });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });

function ctxFor(vp) {
  return browser.newContext({ viewport: vp, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent });
}
function wire(page, errs) {
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
}

// measure interactive elements smaller than MIN, and page overflow
async function audit(page, sel) {
  return page.evaluate(({ sel, MIN }) => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const els = [...document.querySelectorAll(sel)];
    const small = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || st.visibility === 'hidden' || st.display === 'none' || el.disabled) continue;
      if (r.width < MIN || r.height < MIN) {
        small.push({ t: (el.id || el.className || el.tagName).toString().slice(0, 22), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    const bodyScroll = document.documentElement.scrollWidth - vw;
    return { vw, vh, bodyScroll, small: small.slice(0, 10), smallCount: small.length };
  }, { sel, MIN });
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const INTERACTIVE = 'button, [role=button], a.ctrl, .pill, .card, .chip, select, #roll, #die, #rollBtn, #viewBtn, #muteBtn, nav a, #beginBtn';

function cfg(world, chars) {
  const colors = ['#e8c24a', '#46c7b0', '#e0559b', '#6fb1ff'];
  return { world, players: chars.map((c, i) => ({ name: ['Asha', 'Ravi', 'Meera', 'Dev'][i], color: colors[i], char: c })) };
}

for (const [vn, vp] of Object.entries(VP)) {
  // ---- LOBBY ----
  {
    const ctx = await ctxFor(vp); const page = await ctx.newPage(); const errs = []; wire(page, errs);
    await page.goto(`${BASE}/setup.html`, { waitUntil: 'load' }); await page.waitForTimeout(700);
    const counts = await page.$$('#counts .pill'); if (counts[3]) await counts[3].click(); await page.waitForTimeout(300);
    const a = await audit(page, INTERACTIVE);
    if (a.bodyScroll > 2) note('lobby', 'HIGH', `h-scroll ${a.bodyScroll}px @${vn}`);
    if (a.smallCount) note('lobby', 'MEDIUM', `${a.smallCount} tap targets <${MIN}px @${vn}`, JSON.stringify(a.small.slice(0, 5)));
    await shot(page, `lobby_${vn}`);
    if (errs.length) note('lobby', 'HIGH', `errors @${vn}`, errs.join(' | '));
    await ctx.close();
  }
  // ---- BOARD (4p) ----
  {
    const ctx = await ctxFor(vp);
    await ctx.addInitScript((c) => sessionStorage.setItem('sopana.game', JSON.stringify(c)), cfg('moksha', ['pilgrim', 'sage', 'devotee', 'wanderer']));
    const page = await ctx.newPage(); const errs = []; wire(page, errs);
    await page.goto(`${BASE}/board.html?world=moksha`, { waitUntil: 'load' }); await page.waitForTimeout(1200);
    const a = await audit(page, INTERACTIVE);
    const board = await page.$eval('.board-wrap', (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; }).catch(() => null);
    if (a.bodyScroll > 2) note('board', 'HIGH', `h-scroll ${a.bodyScroll}px @${vn}`);
    if (a.smallCount) note('board', 'MEDIUM', `${a.smallCount} tap targets <${MIN}px @${vn}`, JSON.stringify(a.small.slice(0, 5)));
    if (board) { const pct = Math.round((board.w / a.vw) * 100); if (vn !== 'land' && pct < 88) note('board', 'MEDIUM', `board only ${pct}% of width (${board.w}/${a.vw}px) @${vn}`); }
    // roll button in thumb reach (bottom 55%)?
    const roll = await page.$eval('#rollBtn', (e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight }; }).catch(() => null);
    if (roll && roll.top < roll.vh * 0.45) note('board', 'LOW', `Roll button high on screen (top ${roll.top}/${roll.vh}) @${vn}`);
    await shot(page, `board_${vn}`);
    if (errs.length) note('board', 'HIGH', `errors @${vn}`, errs.join(' | '));
    await ctx.close();
  }
}

// immersive modes only at one portrait size (WebGL heavy)
for (const world of ['moksha']) {
  // ---- CINEMATIC ----
  {
    const ctx = await ctxFor(VP.ip12);
    await ctx.addInitScript((c) => sessionStorage.setItem('sopana.game', JSON.stringify(c)), cfg(world, ['pilgrim', 'sage']));
    const page = await ctx.newPage(); const errs = []; wire(page, errs);
    await page.goto(`${BASE}/cinematic.html?world=${world}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__sopanaReady === true, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    const a = await audit(page, INTERACTIVE);
    if (a.bodyScroll > 2) note('cinematic', 'HIGH', `h-scroll ${a.bodyScroll}px`);
    if (a.smallCount) note('cinematic', 'MEDIUM', `${a.smallCount} tap targets <${MIN}px`, JSON.stringify(a.small.slice(0, 6)));
    await shot(page, `cine_ip12`);
    if (errs.length) note('cinematic', 'HIGH', 'errors', errs.join(' | '));
    await ctx.close();
  }
  // ---- 3D ----
  {
    const ctx = await ctxFor(VP.ip12);
    await ctx.addInitScript((c) => sessionStorage.setItem('sopana.game', JSON.stringify(c)), cfg(world, ['pilgrim', 'sage']));
    const page = await ctx.newPage(); const errs = []; wire(page, errs);
    await page.goto(`${BASE}/play3d.html?world=${world}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__sl3dReady === true, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const a = await audit(page, INTERACTIVE);
    if (a.bodyScroll > 2) note('3d', 'HIGH', `h-scroll ${a.bodyScroll}px`);
    if (a.smallCount) note('3d', 'MEDIUM', `${a.smallCount} tap targets <${MIN}px`, JSON.stringify(a.small.slice(0, 6)));
    await shot(page, `td_ip12`);
    if (errs.length) note('3d', 'HIGH', 'errors', errs.join(' | '));
    await ctx.close();
  }
}

await browser.close();
const order = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
findings.sort((a, b) => order[a.sev] - order[b.sev]);
console.log(`\n===== MOBILE UX FINDINGS (${findings.length}) =====`);
for (const f of findings) console.log(`[${f.sev}] (${f.area}) ${f.msg}${f.extra ? '  :: ' + f.extra : ''}`);
if (!findings.length) console.log('No automated mobile issues detected.');
console.log('\nScreens in', OUT);
