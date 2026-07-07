// Sopana — Cinematic Walk (Phase 1 vertical slice).
// A 2.5D backlit shadow-puppet ascent built on PixiJS. Reuses logic.js for rules
// and the generated Moksha art for the pilgrim and the surprise set-pieces.
import * as PIXI from '../vendor/pixi.min.mjs';
import { rollDie, resolveMove } from './logic.js';
import { audio } from './audio.js';

const WORLD_W = 1000;
const COLS = 10;
const ROWS = 10;
const COL_W = 90;
const ROW_H = 220;
const MARGIN_X = (WORLD_W - COLS * COL_W) / 2;
const WORLD_H = ROWS * ROW_H;

// Five lokas (realms) spanning the 100 steps — each with its own palette + story beat.
const MOKSHA_REALMS = [
  { from: 1, to: 20, name: 'Pṛthvī', en: 'Earth', theme: 'the journey begins in the world of form',
    bg: ['#1d1108', '#2a1408', '#080503'], glow: 0xffbf5c, step: 0x241408, ring: 0x6b4a22, ember: 0xffbf5c, temple: 0x9a6a3a },
  { from: 21, to: 40, name: 'Kāma', en: 'Desire', theme: 'through the fires of desire',
    bg: ['#2a0d0a', '#3a1208', '#0a0403'], glow: 0xff7a4a, step: 0x2e120c, ring: 0x8a2f22, ember: 0xff7a4a, temple: 0xc0603a },
  { from: 41, to: 60, name: 'Tapas', en: 'Discipline', theme: 'tempered by discipline',
    bg: ['#241a06', '#3a2a08', '#080603'], glow: 0xf0c24a, step: 0x2a2010, ring: 0x8a6a22, ember: 0xf0c24a, temple: 0xc0902a },
  { from: 61, to: 80, name: 'Jñāna', en: 'Wisdom', theme: 'illumined by wisdom',
    bg: ['#0c1226', '#101a38', '#03040a'], glow: 0x8ab6ff, step: 0x14203a, ring: 0x3a5a9a, ember: 0x8ab6ff, temple: 0x5a7aba },
  { from: 81, to: 100, name: 'Mokṣa', en: 'Liberation', theme: 'and freed at last',
    bg: ['#2a2410', '#3a3420', '#0a0a06'], glow: 0xffe8a0, step: 0x3a3420, ring: 0xd9c060, ember: 0xffe8a0, temple: 0xffe8a0 },
];
let REALMS = MOKSHA_REALMS;
let REALM_SUFFIX = '-loka';
let CINE_ASSETS = 'assets/moksha';
function hexToInt(h) { return parseInt(String(h || '#000').replace('#', ''), 16) || 0; }
function realmsFor(world) {
  if (world.id === 'moksha') return MOKSHA_REALMS;
  const t = world.theme || {};
  const bg = [t.bg || '#160d08', t.panel || '#231208', '#070403'];
  const names = ['Beginnings', 'Trials', 'The Climb', 'Mastery', world.goalLabel || 'The Summit'];
  const out = [];
  for (let i = 0; i < 5; i++) {
    out.push({
      from: i * 20 + 1, to: i * 20 + 20, name: names[i], en: '',
      theme: `the ${['first', 'second', 'third', 'fourth', 'final'][i]} stretch of ${world.title}`,
      bg, glow: hexToInt(t.accent), step: hexToInt(t.tileA), ring: hexToInt(t.ladder), ember: hexToInt(t.accent), temple: hexToInt(t.accent),
    });
  }
  return out;
}
function realmOf(n) { return REALMS.find((r) => n >= r.from && n <= r.to) || REALMS[0]; }

const $ = (s) => document.querySelector(s);
const REDUCED = typeof window !== 'undefined' && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// world-space centre of square n on the winding sopana staircase
function stepPos(n) {
  const r = Math.floor((n - 1) / COLS);
  const i = (n - 1) % COLS;
  const col = r % 2 === 0 ? i : COLS - 1 - i;
  return {
    x: MARGIN_X + col * COL_W + COL_W / 2,
    y: WORLD_H - (r * ROW_H + ROW_H / 2),
  };
}

function ramp(setter, from, to, ms, ease = (t) => t) {
  return new Promise((res) => {
    const t0 = performance.now();
    const fn = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      setter(from + (to - from) * ease(p));
      if (p < 1) requestAnimationFrame(fn);
      else res();
    };
    requestAnimationFrame(fn);
  });
}

function cubicBezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

// ---- reflection journal (persisted in localStorage) ----
const JKEY = 'sopana.journal';
let journal = loadJournal();
function loadJournal() { try { return JSON.parse(localStorage.getItem(JKEY)) || []; } catch { return []; } }
function addToJournal(hit) {
  if (journal.some((j) => j.name === hit.name)) return;
  journal.push({ type: hit.type, name: hit.name, en: hit.en, meaning: hit.meaning });
  localStorage.setItem(JKEY, JSON.stringify(journal));
  renderJournal();
}
function renderJournal() {
  const cnt = $('#jCount');
  if (cnt) cnt.textContent = String(journal.length);
  const el = $('#jList');
  if (!el) return;
  el.innerHTML = journal.length ? '' : '<div class="empty">No teachings yet. Roll to begin.</div>';
  for (const j of journal) {
    const d = document.createElement('div');
    d.className = 'j ' + j.type;
    d.innerHTML = `<b>${j.name}</b> ${j.en ? '· <i>' + j.en + '</i>' : ''}<div>${j.meaning}</div>`;
    el.appendChild(d);
  }
}

// ---- realm title card ----
let titleLocked = false;
function setRealmTitle(realm) {
  $('#rtName').textContent = `॥ ${realm.name}${REALM_SUFFIX} ॥`;
  $('#rtSub').textContent = `the realm of ${realm.en} — ${realm.theme}`;
}
function showRealmTitle() { $('#realmTitle').classList.add('show'); }
function hideRealmTitle() { $('#realmTitle').classList.remove('show'); }
function showInvocation() {
  $('#rtName').textContent = '॥ Sopāna ॥';
  $('#rtSub').textContent = 'The soul begins its ascent to Mokṣa';
  showRealmTitle();
  setTimeout(() => { if (!titleLocked) hideRealmTitle(); }, 2600);
}

async function main() {
  const app = new PIXI.Application({
    background: 0x0a0603,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  $('#stage').appendChild(app.view);

  const params = new URLSearchParams(location.search);
  const worldFile = (params.get('world') || 'moksha').replace(/[^a-z]/gi, '');
  const world = await (await fetch(`worlds/${worldFile}.json`)).json();
  CINE_ASSETS = world.assets || 'assets/moksha';
  REALMS = realmsFor(world);
  REALM_SUFFIX = world.id === 'moksha' ? '-loka' : '';
  const IMG = `${CINE_ASSETS}/img`;
  const tex = await PIXI.Assets.load([`${IMG}/token.png`, `${IMG}/board.png`]);

  // ---- layers ----
  const skyBox = new PIXI.Container();
  let sky = makeSky(REALMS[0]);
  skyBox.addChild(sky);
  const far = new PIXI.Container();
  const worldLayer = new PIXI.Container();
  const overlay = new PIXI.Container(); // screen-space set-pieces
  const ui = new PIXI.Container(); // screen-space HUD (die, flash)
  const curtain = new PIXI.Container(); // realm-transition shadow-screen
  app.stage.addChild(skyBox, far, worldLayer, overlay, ui, curtain);

  let currentRealm = REALMS[0];
  let emberColor = currentRealm.ember;

  // shadow-screen curtain panels (close from top + bottom, part to reveal the new realm)
  const curtainTop = new PIXI.Sprite(PIXI.Texture.WHITE);
  curtainTop.tint = 0x070402; curtainTop.anchor.set(0, 0); curtainTop.height = 0;
  const curtainBot = new PIXI.Sprite(PIXI.Texture.WHITE);
  curtainBot.tint = 0x070402; curtainBot.anchor.set(0, 1); curtainBot.height = 0;
  const edgeTop = new PIXI.Sprite(PIXI.Texture.WHITE);
  edgeTop.tint = 0xe8a33d; edgeTop.anchor.set(0, 0.5); edgeTop.height = 3; edgeTop.alpha = 0; edgeTop.blendMode = PIXI.BLEND_MODES.ADD;
  const edgeBot = new PIXI.Sprite(PIXI.Texture.WHITE);
  edgeBot.tint = 0xe8a33d; edgeBot.anchor.set(0, 0.5); edgeBot.height = 3; edgeBot.alpha = 0; edgeBot.blendMode = PIXI.BLEND_MODES.ADD;
  curtain.addChild(curtainTop, curtainBot, edgeTop, edgeBot);

  // dim + flash + light-sweep used by the set-piece cinematics
  const dim = new PIXI.Graphics();
  dim.beginFill(0x000000).drawRect(-200, -200, 6000, 6000).endFill();
  dim.alpha = 0;
  overlay.addChild(dim);
  const flashG = new PIXI.Graphics();
  flashG.beginFill(0xffffff).drawRect(-200, -200, 6000, 6000).endFill();
  flashG.alpha = 0;
  const sweepTex = makeSweepTex();

  const temple = new PIXI.Sprite(tex[`${IMG}/board.png`]);
  temple.anchor.set(0.5, 0);
  temple.alpha = 0.32;
  temple.filters = [new PIXI.BlurFilter(6)];
  far.addChild(temple);

  // subtle path ribbon connecting the steps
  const ribbon = new PIXI.Graphics();
  worldLayer.addChild(ribbon);
  ribbon.lineStyle(10, 0x3a2412, 0.55);
  for (let n = 1; n <= 100; n++) {
    const p = stepPos(n);
    if (n === 1) ribbon.moveTo(p.x, p.y);
    else ribbon.lineTo(p.x, p.y);
  }

  // ---- steps ----
  const steps = [];
  for (let n = 1; n <= 100; n++) steps.push(makeStep(n));
  steps.forEach((s) => worldLayer.addChild(s.container));

  // ---- pilgrim ----
  const pilgrim = new PIXI.Sprite(tex[`${IMG}/token.png`]);
  pilgrim.anchor.set(0.5, 0.92);
  const baseScale = (ROW_H * 0.92) / pilgrim.texture.height;
  pilgrim.scale.set(baseScale);
  pilgrim.blendMode = PIXI.BLEND_MODES.ADD; // backlit puppet glows instead of a black box
  worldLayer.addChild(pilgrim);

  // ---- dice ----
  // ---- dice (fixed to the side, screen-space) ----
  const dice = makeDice();
  ui.addChild(dice.container);
  ui.addChild(flashG); // strobe above the die
  let diceBounce = 0;
  const diceHome = { x: 0, y: 0 };

  // ---- embers ----
  const embers = new PIXI.Container();
  worldLayer.addChild(embers);

  let pos = 1;
  let busy = false;
  let started = false;
  let curCamY = null;
  let sway = 0;

  placePilgrim(1);
  steps[0].light();
  temple.tint = currentRealm.temple;
  renderJournal();

  // ---- ticker: scale, camera follow, parallax, sway, embers ----
  app.ticker.add((delta) => {
    const s = Math.min(app.screen.width / WORLD_W, app.screen.height / (ROW_H * 3.6), 0.9);
    worldLayer.scale.set(s);
    sway += 0.012 * delta;

    const target = app.screen.height * 0.62 - pilgrim.y * s;
    if (curCamY === null) curCamY = target;
    curCamY += (target - curCamY) * Math.min(1, 0.09 * delta);
    worldLayer.y = curCamY + Math.sin(sway) * 4;
    worldLayer.x = (app.screen.width - WORLD_W * s) / 2 + Math.cos(sway * 0.7) * 3;

    sky.width = app.screen.width;
    sky.height = app.screen.height;

    diceHome.x = app.screen.width - 74;
    diceHome.y = app.screen.height - 150;
    dice.container.x = diceHome.x;
    dice.container.y = diceHome.y - diceBounce;

    temple.x = app.screen.width / 2;
    temple.width = app.screen.width * 1.2;
    temple.scale.y = temple.scale.x;
    temple.y = -temple.height * 0.15 + curCamY * 0.05;

    curtainTop.width = app.screen.width; curtainTop.x = 0; curtainTop.y = 0;
    curtainBot.width = app.screen.width; curtainBot.x = 0; curtainBot.y = app.screen.height;
    edgeTop.width = app.screen.width; edgeTop.x = 0; edgeTop.y = curtainTop.height;
    edgeBot.width = app.screen.width; edgeBot.x = 0; edgeBot.y = app.screen.height - curtainBot.height;
    edgeTop.alpha = edgeBot.alpha = curtainTop.height > 2 ? 0.85 : 0;

    for (const e of embers.children.slice()) {
      e.x += e.vx * delta;
      e.y += e.vy * delta;
      e.life -= 0.012 * delta;
      e.alpha = Math.max(0, e.life);
      if (e.life <= 0) e.destroy();
    }
  });

  // ---- interaction ----
  $('#roll').addEventListener('click', roll);
  $('#journalBtn').addEventListener('click', () => $('#journal').classList.toggle('show'));
  $('#jClose').addEventListener('click', () => $('#journal').classList.remove('show'));
  $('#jClear').addEventListener('click', () => { journal.length = 0; localStorage.removeItem(JKEY); renderJournal(); });
  $('#restartBtn').addEventListener('click', restart);
  $('#muteBtn').addEventListener('click', () => {
    const on = audio.toggle();
    $('#muteBtn').textContent = on ? '🔊' : '🔇';
    const v = $('#introVideo'); if (v) v.muted = !on;
  });
  const wsel = $('#worldSel');
  if (wsel) {
    const WORLDS = [['moksha', 'Original'], ['founders', "Founder's Climb"], ['panchatantra', 'Panchatantra'], ['habits', 'Habit Heroes']];
    wsel.innerHTML = WORLDS.map(([id, name]) => `<option value="${id}"${id === worldFile ? ' selected' : ''}>${name}</option>`).join('');
    wsel.addEventListener('change', () => { location.search = `?world=${wsel.value}`; });
  }
  document.querySelectorAll('nav a').forEach((a) => { a.href = `${a.getAttribute('href').split('?')[0]}?world=${worldFile}`; });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && started) { e.preventDefault(); roll(); } });
  window.__sopanaReady = true; // signal for screenshot QA
  window.__sopanaDebug = {
    realms: REALMS,
    curtain: (i) => curtainWipe(REALMS[i]),
    teleport: (n) => { pos = n; placePilgrim(n); setRealm(realmOf(n)); },
    addJ: (h) => addToJournal(h),
    openJournal: () => $('#journal').classList.add('show'),
    begin: () => begin(),
    audioState: () => (audio.ctx ? audio.ctx.state : 'no-ctx'),
    getPos: () => pos,
    isBusy: () => busy,
    masterGain: () => (audio.master ? audio.master.gain.value : -1),
  };

  // ---- title menu / intro cinematic ----
  const startScreen = $('#startScreen');
  const beginBtn = $('#beginBtn');
  const introVideo = $('#introVideo');
  const skipIntro = $('#skipIntro');
  function begin() {
    beginBtn.disabled = true;
    audio.resume();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      started = true;
      try { introVideo.pause(); } catch { /* ignore */ }
      skipIntro.style.display = 'none';
      startScreen.classList.add('hide');
      setTimeout(() => { startScreen.style.display = 'none'; }, 650);
      showInvocation();
    };
    introVideo.onended = finish;
    introVideo.onerror = finish; // no / failed intro -> straight into the game
    skipIntro.onclick = finish;
    if (worldFile !== 'moksha') { finish(); return; } // only Moksha has the Sora intro
    introVideo.muted = !audio.isEnabled();
    introVideo.src = 'assets/intro.mp4';
    introVideo.style.display = 'block';
    skipIntro.style.display = 'block';
    $('#startInner').style.display = 'none'; // clear the title once the intro plays
    const p = introVideo.play();
    if (p && typeof p.catch === 'function') p.catch(finish);
    // safety: if playback never really starts, don't leave the player stuck
    setTimeout(() => { if (!done && (introVideo.readyState < 2 || introVideo.paused)) finish(); }, 4500);
  }
  beginBtn.addEventListener('click', begin);

  async function roll() {
    if (!started || busy || pos >= 100) return;
    audio.resume();
    busy = true;
    $('#roll').disabled = true;
    hideCard();

    const r = rollDie();
    await tumbleDice(r);
    const res = resolveMove(pos, r, world);

    const dir = res.landed > pos ? 1 : -1;
    for (let n = pos + dir; dir > 0 ? n <= res.landed : n >= res.landed; n += dir) {
      await walkTo(n);
      steps[n - 1].light();
      audio.stepNote(n);
      spawnEmbers(stepPos(n));
    }
    pos = res.landed;
    $('#status').textContent = `Rolled ${r} — step ${pos}`;

    if (res.hit) {
      await popSetPiece(res.hit);
      if (res.hit.type === 'ladder') await climbLadder(res.hit.from, res.hit.to);
      else await slideSnake(res.hit.from, res.hit.to);
      steps[res.hit.to - 1].light();
      spawnEmbers(stepPos(res.hit.to));
      pos = res.hit.to;
    }

    const nr = realmOf(pos);
    if (nr !== currentRealm) await curtainWipe(nr);

    if (res.won || pos >= 100) {
      setRealmTitle({ name: 'Mokṣa', en: 'Liberation', theme: 'attained — free from the wheel of birth and death' });
      showRealmTitle();
      $('#status').textContent = '॥ Mokṣa — liberation attained ॥';
      $('#restartBtn').style.display = 'inline-block';
    } else {
      $('#status').textContent = `On step ${pos}`;
    }
    busy = false;
    if (pos < 100) $('#roll').disabled = false;
  }

  function restart() {
    steps.forEach((s) => { s.glow.alpha = 0; });
    pos = 1;
    steps[0].light();
    setRealm(REALMS[0]);
    audio.setRealm(0);
    placePilgrim(1);
    curCamY = null;
    hideRealmTitle();
    $('#restartBtn').style.display = 'none';
    $('#roll').disabled = false;
    $('#status').textContent = 'On step 1';
  }

  // ---- movement ----
  function placePilgrim(n) {
    const p = stepPos(n);
    pilgrim.x = p.x;
    pilgrim.y = p.y;
  }

  function walkTo(n) {
    const a = { x: pilgrim.x, y: pilgrim.y };
    const b = stepPos(n);
    pilgrim.scale.x = Math.abs(baseScale) * (b.x < a.x ? -1 : 1);
    const ms = 300;
    const t0 = performance.now();
    return new Promise((res) => {
      const fn = () => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        pilgrim.x = a.x + (b.x - a.x) * easeInOut(p);
        const bob = Math.sin(p * Math.PI) * 22;
        pilgrim.y = a.y + (b.y - a.y) * p - bob;
        pilgrim.rotation = Math.sin(p * Math.PI * 2) * 0.05;
        if (p < 1) requestAnimationFrame(fn);
        else { pilgrim.rotation = 0; res(); }
      };
      requestAnimationFrame(fn);
    });
  }

  // ---- on-path connectors: a ladder he climbs / a serpent he slides down ----
  function drawLadder(g, a, b, upto) {
    g.clear();
    const ex = a.x + (b.x - a.x) * upto, ey = a.y + (b.y - a.y) * upto;
    const dx = ex - a.x, dy = ey - a.y, len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len, w = 16;
    g.lineStyle(6, 0xd9b64e, 0.95);
    g.moveTo(a.x + px * w, a.y + py * w).lineTo(ex + px * w, ey + py * w);
    g.moveTo(a.x - px * w, a.y - py * w).lineTo(ex - px * w, ey - py * w);
    g.lineStyle(4, 0xf0c86a, 0.9);
    const fullLen = Math.hypot(b.x - a.x, b.y - a.y);
    const rungs = Math.max(2, Math.round(fullLen / 34));
    for (let i = 1; i <= rungs; i++) {
      const t = i / rungs;
      if (t > upto) break;
      const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t;
      g.moveTo(cx + px * w, cy + py * w).lineTo(cx - px * w, cy - py * w);
    }
  }

  async function climbLadder(from, to) {
    const a = stepPos(from), b = stepPos(to);
    audio.ladderGliss();
    const g = new PIXI.Graphics();
    worldLayer.addChildAt(g, worldLayer.getChildIndex(pilgrim)); // behind the pilgrim
    await ramp((t) => drawLadder(g, a, b, t), 0.05, 1, 700, easeInOut); // the ladder extends upward
    pilgrim.scale.x = Math.abs(baseScale);
    const ms = Math.max(1300, Math.hypot(b.x - a.x, b.y - a.y) * 1.7);
    const t0 = performance.now();
    await new Promise((res) => {
      const fn = () => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        const e = easeInOut(p);
        pilgrim.x = a.x + (b.x - a.x) * e;
        pilgrim.y = a.y + (b.y - a.y) * e;
        pilgrim.rotation = Math.sin(p * Math.PI * 12) * 0.05; // rung-to-rung climb
        if (p < 1) requestAnimationFrame(fn);
        else { pilgrim.rotation = 0; res(); }
      };
      requestAnimationFrame(fn);
    });
    await wait(250);
    ramp((v) => (g.alpha = v), 1, 0, 600).then(() => g.destroy());
  }

  function snakePoints(a, b, N) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len, amp = Math.min(70, len * 0.22);
    const p1 = { x: a.x + dx * 0.33 + px * amp, y: a.y + dy * 0.33 + py * amp };
    const p2 = { x: a.x + dx * 0.66 - px * amp, y: a.y + dy * 0.66 - py * amp };
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(cubicBezier(a, p1, p2, b, i / N));
    return pts;
  }

  function drawSnakeBody(g, pts, upto) {
    g.clear();
    const n = Math.max(1, Math.floor((pts.length - 1) * upto));
    g.lineStyle(15, 0x7a1e14, 0.9);
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= n; i++) g.lineTo(pts[i].x, pts[i].y);
    g.lineStyle(9, 0xc0392b, 0.95);
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= n; i++) g.lineTo(pts[i].x, pts[i].y);
    // head at the top (start)
    g.lineStyle(0);
    g.beginFill(0xc0392b).drawCircle(pts[0].x, pts[0].y, 17).endFill();
    const hx = pts[1] ? pts[1].x - pts[0].x : 0;
    const hy = pts[1] ? pts[1].y - pts[0].y : 1;
    const hl = Math.hypot(hx, hy) || 1;
    const ex = -hy / hl, ey = hx / hl;
    g.beginFill(0xfff2c8)
      .drawCircle(pts[0].x + ex * 6, pts[0].y + ey * 6, 3)
      .drawCircle(pts[0].x - ex * 6, pts[0].y - ey * 6, 3)
      .endFill();
  }

  async function slideSnake(from, to) {
    const a = stepPos(from), b = stepPos(to); // head at the higher step, tail at the lower
    audio.serpentHiss();
    const pts = snakePoints(a, b, 48);
    const g = new PIXI.Graphics();
    worldLayer.addChildAt(g, worldLayer.getChildIndex(pilgrim));
    await ramp((t) => drawSnakeBody(g, pts, t), 0.04, 1, 750, easeInOut); // the serpent slithers in
    await wait(200);
    const ms = Math.max(1400, Math.hypot(b.x - a.x, b.y - a.y) * 1.5);
    const t0 = performance.now();
    await new Promise((res) => {
      const fn = () => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        const e = easeInOut(p);
        const pt = pts[Math.min(pts.length - 1, Math.floor(e * (pts.length - 1)))];
        pilgrim.x = pt.x; pilgrim.y = pt.y;
        pilgrim.rotation = 0.4 * Math.sin(p * Math.PI * 4); // tumbling slide
        if (p < 1) requestAnimationFrame(fn);
        else { pilgrim.rotation = 0; res(); }
      };
      requestAnimationFrame(fn);
    });
    await wait(200);
    ramp((v) => (g.alpha = v), 1, 0, 600).then(() => g.destroy());
  }

  // ---- set-piece surprise (Phase 1: puppet pop + narrated card) ----
  // ---- set-piece cinematics (Phase 2) ----
  async function popSetPiece(hit) {
    const url = `${IMG}/${hit.type}-${hit.from}.png`;
    let sprite = null;
    let sweep = null;
    await ramp((v) => (dim.alpha = v), dim.alpha, 0.6, 300);
    try {
      const t = await PIXI.Assets.load(url);
      sprite = new PIXI.Sprite(t);
      sprite.anchor.set(0.5);
      sprite.x = app.screen.width / 2;
      sprite.y = app.screen.height * 0.42;
      const target = (Math.min(app.screen.width, app.screen.height) * 0.52) / sprite.texture.width;
      overlay.addChild(sprite);
      sweep = hit.type === 'ladder' ? await enterLadder(sprite, target) : await enterSerpent(sprite, target);
    } catch { /* art missing -> card only */ }

    showCard(hit);
    addToJournal(hit);
    playAudio(hit);
    await wait(2600);

    if (sprite) {
      if (hit.type === 'snake') await exitSwoop(sprite);
      else await ramp((v) => (sprite.alpha = v), 1, 0, 300);
      sprite.destroy();
    }
    if (sweep) { await ramp((v) => (sweep.alpha = v), sweep.alpha, 0, 300); sweep.destroy(); }
    await ramp((v) => (dim.alpha = v), dim.alpha, 0, 300);
    hideCard();
  }

  // ladder: a shaft of divine light sweeps up as the virtue rises
  async function enterLadder(sprite, target) {
    sprite.scale.set(target * 0.15);
    sprite.y = app.screen.height * 0.6;
    const sweep = new PIXI.Sprite(sweepTex);
    sweep.anchor.set(0.5);
    sweep.blendMode = PIXI.BLEND_MODES.ADD;
    sweep.width = sprite.texture.width * target;
    sweep.height = app.screen.height * 1.2;
    sweep.x = app.screen.width / 2;
    sweep.y = app.screen.height / 2;
    sweep.alpha = 0;
    overlay.addChildAt(sweep, overlay.getChildIndex(sprite)); // behind the sprite
    await Promise.all([
      ramp((v) => (sweep.alpha = v), 0, 0.85, 480),
      ramp((v) => {
        sprite.scale.set(target * v);
        sprite.y = app.screen.height * (0.6 - 0.18 * v);
      }, 0.15, 1, 620, easeOutBack),
    ]);
    return sweep;
  }

  // serpent: uncoils up from the dark, then strikes with a screen-shake + flash
  async function enterSerpent(sprite, target) {
    sprite.scale.set(target * 0.1);
    sprite.y = app.screen.height * 0.72;
    sprite.rotation = -0.4;
    await ramp((v) => {
      sprite.scale.set(target * (0.1 + 0.95 * easeOutBack(v)));
      sprite.y = app.screen.height * (0.72 - 0.3 * v);
      sprite.rotation = -0.4 + 0.4 * v + Math.sin(v * Math.PI * 3) * 0.09;
    }, 0, 1, 520);
    sprite.rotation = 0;
    flash(0xff5522);
    shake(380, 20);
    audio.serpentBoom();
    await ramp((v) => sprite.scale.set(target * (1 + 0.26 * Math.sin(v * Math.PI))), 0, 1, 210);
    return null;
  }

  async function exitSwoop(sprite) {
    const y0 = sprite.y;
    await ramp((v) => {
      sprite.y = y0 + app.screen.height * 0.55 * v;
      sprite.alpha = 1 - v;
      sprite.rotation = 0.35 * v;
    }, 0, 1, 420);
  }

  function flash(color) {
    if (REDUCED) return;
    flashG.tint = color || 0xffffff;
    flashG.alpha = 0.42;
    ramp((v) => (flashG.alpha = v), 0.42, 0, 260);
  }

  function shake(ms, mag) {
    if (REDUCED) { app.stage.position.set(0, 0); return; }
    const t0 = performance.now();
    const fn = () => {
      const p = (performance.now() - t0) / ms;
      if (p >= 1) { app.stage.position.set(0, 0); return; }
      const k = (1 - p) * mag;
      app.stage.x = (Math.random() * 2 - 1) * k;
      app.stage.y = (Math.random() * 2 - 1) * k;
      requestAnimationFrame(fn);
    };
    requestAnimationFrame(fn);
  }

  function makeSweepTex() {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,210,120,0)');
    g.addColorStop(0.5, 'rgba(255,210,120,0.85)');
    g.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    return PIXI.Texture.from(c);
  }

  // ---- factory helpers ----
  // ---- realms: palette swap (hidden behind the curtain) + shadow-screen wipe ----
  function setRealm(realm) {
    currentRealm = realm;
    emberColor = realm.ember;
    const newSky = makeSky(realm);
    newSky.width = app.screen.width;
    newSky.height = app.screen.height;
    skyBox.addChild(newSky);
    if (sky && sky !== newSky) sky.destroy();
    sky = newSky;
    temple.tint = realm.temple;
  }

  async function curtainWipe(realm) {
    titleLocked = true;
    audio.realmSwell();
    setRealmTitle(realm);
    const half = () => app.screen.height / 2 + 2;
    await Promise.all([
      ramp((v) => (curtainTop.height = half() * v), 0, 1, 580, easeInOut),
      ramp((v) => (curtainBot.height = half() * v), 0, 1, 580, easeInOut),
    ]);
    setRealm(realm); // swap palette while the screen is covered
    audio.setRealm(REALMS.indexOf(realm));
    showRealmTitle();
    await wait(1900);
    hideRealmTitle();
    await Promise.all([
      ramp((v) => (curtainTop.height = half() * (1 - v)), 0, 1, 580, easeInOut),
      ramp((v) => (curtainBot.height = half() * (1 - v)), 0, 1, 580, easeInOut),
    ]);
    titleLocked = false;
  }

  function makeStep(n) {
    const p = stepPos(n);
    const realm = realmOf(n);
    const c = new PIXI.Container();
    c.x = p.x; c.y = p.y;

    const glow = new PIXI.Graphics();
    glow.beginFill(realm.glow, 0.5).drawCircle(0, 0, 46).endFill();
    glow.alpha = 0;
    c.addChild(glow);

    const g = new PIXI.Graphics();
    g.lineStyle(2, realm.ring, 0.9).beginFill(realm.step).drawPolygon([0, -28, 36, 0, 0, 28, -36, 0]).endFill();
    c.addChild(g);

    const isL = world.ladders.some((l) => l.from === n);
    const isS = world.snakes.some((s) => s.from === n);
    if (isL || isS) {
      const ring = new PIXI.Graphics();
      ring.lineStyle(3, isL ? 0xd9b64e : 0xc0392b, 0.95).drawPolygon([0, -32, 40, 0, 0, 32, -40, 0]);
      c.addChild(ring);
    }
    if (n === 100) {
      const goal = new PIXI.Graphics();
      goal.beginFill(0xffe08a, 0.9).drawCircle(0, 0, 18).endFill();
      c.addChild(goal);
    }

    const t = new PIXI.Text(String(n), { fontFamily: 'Georgia', fontSize: 15, fill: 0xb79b74 });
    t.anchor.set(0.5);
    c.addChild(t);

    return { container: c, glow, light() { ramp((v) => (this.glow.alpha = v), this.glow.alpha, 1, 320); } };
  }

  function makeDice() {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    const pips = new PIXI.Container();
    c.addChild(g, pips);
    const L = {
      1: [[0, 0]],
      2: [[-12, -12], [12, 12]],
      3: [[-12, -12], [0, 0], [12, 12]],
      4: [[-12, -12], [12, -12], [-12, 12], [12, 12]],
      5: [[-12, -12], [12, -12], [0, 0], [-12, 12], [12, 12]],
      6: [[-13, -14], [13, -14], [-13, 0], [13, 0], [-13, 14], [13, 14]],
    };
    function draw(v) {
      g.clear();
      g.lineStyle(3, 0x6b4a22).beginFill(0xf0e2c0).drawRoundedRect(-26, -26, 52, 52, 10).endFill();
      pips.removeChildren();
      for (const [x, y] of L[v] || L[1]) {
        const p = new PIXI.Graphics();
        p.beginFill(0x3a1e0a).drawCircle(x, y, 5).endFill();
        pips.addChild(p);
      }
    }
    draw(1);
    return { container: c, draw };
  }

  function tumbleDice(v) {
    audio.diceRattle();
    const t0 = performance.now();
    const ms = 780;
    return new Promise((res) => {
      const fn = () => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        dice.container.rotation = (1 - p) * Math.PI * 7;
        diceBounce = Math.sin(p * Math.PI) * 52;
        if (p < 0.85 && Math.random() < 0.6) dice.draw(1 + Math.floor(Math.random() * 6));
        if (p < 1) requestAnimationFrame(fn);
        else { dice.container.rotation = 0; diceBounce = 0; dice.draw(v); audio.diceClack(); res(); }
      };
      requestAnimationFrame(fn);
    });
  }

  function spawnEmbers(p) {
    for (let i = 0; i < 9; i++) {
      const e = new PIXI.Graphics();
      e.beginFill(emberColor, 0.9).drawCircle(0, 0, 2 + Math.random() * 2.5).endFill();
      e.x = p.x + (Math.random() * 44 - 22);
      e.y = p.y + 10;
      e.vx = (Math.random() - 0.5) * 0.7;
      e.vy = -1.1 - Math.random() * 1.6;
      e.life = 1;
      embers.addChild(e);
    }
  }

  function makeSky(realm) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, realm.bg[0]);
    g.addColorStop(0.55, realm.bg[1]);
    g.addColorStop(1, realm.bg[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    return new PIXI.Sprite(PIXI.Texture.from(c));
  }
}

// ---- HTML card + audio ----
function showCard(hit) {
  $('#cKind').textContent = hit.type === 'ladder' ? 'Virtue · Ladder' : 'Vice · Serpent';
  $('#cKind').className = 'kind ' + hit.type;
  $('#cName').textContent = hit.name;
  $('#cEn').textContent = hit.en ? '— ' + hit.en : '';
  $('#cMeaning').textContent = hit.meaning;
  $('#card').classList.add('show');
}
function hideCard() { $('#card').classList.remove('show'); }

let audioEl = null;
function playAudio(hit) {
  try {
    if (audioEl) audioEl.pause();
    audioEl = new Audio(`${CINE_ASSETS}/audio/${hit.type}-${hit.from}.mp3`);
    audioEl.play().catch(() => {});
  } catch { /* ignore */ }
}

main();
