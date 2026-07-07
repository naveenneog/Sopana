// game.js — UI + interaction layer. All pure rules live in logic.js.
import { squareToRenderCell, rollDie, resolveMove, validateWorld, indexWorld } from './logic.js';
import { buildSnakeSvg, getSnakeStyle } from './snakes.js';
import { gameForWorld, charOf } from './config.js';

const $ = (s) => document.querySelector(s);
const boardEl = $('#board');
const overlay = $('#overlay');
const tokenEl = $('#token');
const dieEl = $('#die');
const rollBtn = $('#rollBtn');
const statusEl = $('#status');
const reveal = $('#reveal');
const revealKind = $('#revealKind');
const revealName = $('#revealName');
const revealEn = $('#revealEn');
const revealMeaning = $('#revealMeaning');
const skipBtn = $('#skipBtn');
const continueBtn = $('#continueBtn');
const winOverlay = $('#winOverlay');
const winTitle = $('#winTitle');
const winMeaning = $('#winMeaning');
const winNewGame = $('#winNewGame');
const worldSelect = $('#worldSelect');
const muteBtn = $('#muteBtn');
const newGameBtn = $('#newGameBtn');
const worldTitle = $('#worldTitle');
const worldSubtitle = $('#worldSubtitle');
const revealArt = $('#revealArt');
const boardWrap = document.querySelector('.board-wrap');
const avatar = $('#avatar');
const avatarLabel = $('#avatarLabel');

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const SVGNS = 'http://www.w3.org/2000/svg';

let world = null;
let index = { ladders: new Map(), snakes: new Map() };
let players = [];
let current = 0;
let busy = false;
let speakOn = true;
let currentFinish = null; // resolver for an open reveal (used by Esc)
let fallbackTimer = null;
let currentAudio = null;
let hlTimer = null;
let audioWatchdog = null;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// --- geometry: centre of square n in the 0..100 overlay space ---
function centerOf(n) {
  const cols = world.cols || 10;
  const rows = Math.ceil(world.size / cols);
  const { row, col } = squareToRenderCell(n, world.size, cols);
  return { x: (col + 0.5) * (100 / cols), y: (row + 0.5) * (100 / rows) };
}

function applyTheme(t = {}) {
  const root = document.documentElement.style;
  const map = {
    '--bg': t.bg, '--panel': t.panel, '--tileA': t.tileA, '--tileB': t.tileB,
    '--accent': t.accent, '--snake': t.snake, '--ladder': t.ladder,
    '--text': t.text, '--muted': t.muted, '--font': t.font,
  };
  for (const [k, v] of Object.entries(map)) if (v) root.setProperty(k, v);
}

// Swap in per-world real art (board backdrop + player-avatar figurine) when present.
function setupWorldArt() {
  avatarLabel.textContent = world.avatarLabel || 'You';
  if (!world.assets) {
    boardWrap.style.backgroundImage = '';
    boardWrap.classList.remove('has-bg');
    boardEl.classList.remove('has-bg');
    avatar.hidden = true;
    avatar.removeAttribute('src');
    return;
  }
  const bg = new Image();
  bg.onload = () => {
    boardWrap.style.backgroundImage = `url("${world.assets}/img/board.png")`;
    boardWrap.classList.add('has-bg');
    boardEl.classList.add('has-bg');
  };
  bg.onerror = () => {
    boardWrap.style.backgroundImage = '';
    boardWrap.classList.remove('has-bg');
    boardEl.classList.remove('has-bg');
  };
  bg.src = `${world.assets}/img/board.png`;

  avatar.hidden = true;
  avatar.onload = () => { avatar.hidden = false; };
  avatar.onerror = () => { avatar.hidden = true; };
  avatar.src = `${world.assets}/img/token.png`;
}

// --- board ---
function buildBoard() {
  const cols = world.cols || 10;
  const rows = Math.ceil(world.size / cols);
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  boardEl.innerHTML = '';
  for (let rTop = 0; rTop < rows; rTop++) {
    for (let c = 0; c < cols; c++) {
      const rBottom = rows - 1 - rTop;
      const leftToRight = rBottom % 2 === 0;
      const posInRow = leftToRight ? c : cols - 1 - c;
      const n = rBottom * cols + posInRow + 1;
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((rTop + c) % 2 === 0 ? 'a' : 'b');
      if (n === world.size) cell.classList.add('goal');
      const ladder = index.ladders.get(n);
      const snake = index.snakes.get(n);
      let marker = '';
      let tag = '';
      if (n === world.size) marker = '🏁';
      else if (ladder) { marker = '🪜'; tag = ladder.name; }
      else if (snake) { marker = '🐍'; tag = snake.name; }
      cell.innerHTML =
        `<span class="num">${n}</span>` +
        (tag ? `<span class="tag">${tag}</span>` : '') +
        (marker ? `<span class="marker">${marker}</span>` : '');
      boardEl.appendChild(cell);
    }
  }
}

// --- connectors ---
function line(x1, y1, x2, y2, cls) {
  const el = document.createElementNS(SVGNS, 'line');
  el.setAttribute('x1', x1); el.setAttribute('y1', y1);
  el.setAttribute('x2', x2); el.setAttribute('y2', y2);
  el.setAttribute('class', cls);
  return el;
}

function drawLadder(l, group) {
  const a = centerOf(l.from), b = centerOf(l.to);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len; // along
  const px = -uy, py = ux; // perpendicular
  const w = 1.6; // half rail spacing
  group.appendChild(line(a.x + px * w, a.y + py * w, b.x + px * w, b.y + py * w, 'ladder-rail'));
  group.appendChild(line(a.x - px * w, a.y - py * w, b.x - px * w, b.y - py * w, 'ladder-rail'));
  const rungs = Math.max(3, Math.round(len / 4));
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs;
    const cx = a.x + dx * t, cy = a.y + dy * t;
    group.appendChild(line(cx + px * w, cy + py * w, cx - px * w, cy - py * w, 'ladder-rung'));
  }
}

function drawSnake(s, group) {
  group.appendChild(buildSnakeSvg(centerOf(s.from), centerOf(s.to), getSnakeStyle(world), `${world.id}-${s.from}`));
}

function drawConnectors() {
  overlay.innerHTML = '';
  for (const l of world.ladders || []) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'conn');
    g.dataset.id = `ladder-${l.from}`;
    drawLadder(l, g);
    overlay.appendChild(g);
  }
  for (const s of world.snakes || []) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'conn');
    g.dataset.id = `snake-${s.from}`;
    drawSnake(s, g);
    overlay.appendChild(g);
  }
}

function highlightConnector(hit, on) {
  const id = `${hit.type}-${hit.from}`;
  overlay.querySelectorAll('.conn').forEach((g) => {
    g.classList.toggle('active', on && g.dataset.id === id);
    g.classList.toggle('dim', on && g.dataset.id !== id);
  });
}

// --- tokens & players (local hotseat multiplayer) ---
function makeTokenEl(p) {
  const el = document.createElement('div');
  el.className = 'token mp';
  el.style.setProperty('--pc', p.color);
  el.innerHTML = `<i class="ring"></i><b class="glyph">${p.glyph}</b>`;
  boardWrap.appendChild(el);
  return el;
}

// small fan-out so multiple tokens sharing a square stay legible
function squareOffset(p) {
  const mates = players.filter((q) => q.pos === p.pos);
  if (mates.length <= 1) return { dx: 0, dy: 0 };
  const k = mates.indexOf(p);
  const ang = (k / mates.length) * Math.PI * 2 - Math.PI / 2;
  return { dx: Math.cos(ang) * 1.8, dy: Math.sin(ang) * 1.8 };
}

function placePlayer(p, animate = true) {
  if (!p.el) return;
  const c = centerOf(p.pos);
  const o = squareOffset(p);
  p.el.style.transition = animate ? '' : 'none';
  p.el.style.left = c.x + o.dx + '%';
  p.el.style.top = c.y + o.dy + '%';
  if (!animate) requestAnimationFrame(() => (p.el.style.transition = ''));
}

function placeAll(animate = true) { players.forEach((p) => placePlayer(p, animate)); }
function currentPlayer() { return players[current]; }

function highlightCurrent() {
  const multi = players.length > 1;
  players.forEach((q, i) => q.el && q.el.classList.toggle('cur', multi && i === current));
}

function renderRoster() {
  const box = $('#roster');
  if (box) {
    box.hidden = players.length < 2;
    box.innerHTML = '';
    players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'rmp' + (i === current ? ' cur' : '') + (p.pos >= world.size ? ' won' : '');
      row.style.setProperty('--pc', p.color);
      row.innerHTML = `<b class="g">${p.glyph}</b><span class="nm">${p.name}</span><span class="ps">${p.pos}</span>`;
      box.appendChild(row);
    });
  }
  highlightCurrent();
}

function buildPlayers() {
  players.forEach((p) => p.el && p.el.remove());
  const cfg = gameForWorld(world);
  players = cfg.players.map((pl) => {
    const ch = charOf(world, pl.char);
    return { name: pl.name, color: pl.color, char: pl.char, glyph: (ch && ch.glyph) || '●', pos: 1, el: null };
  });
  players.forEach((p) => (p.el = makeTokenEl(p)));
  current = 0;
  const solo = document.querySelector('.player');
  if (solo) solo.style.display = 'none'; // roster replaces the single-avatar panel
  tokenEl.style.display = 'none';
}

function announceTurn() {
  const p = currentPlayer();
  statusEl.textContent = players.length > 1
    ? `${p.glyph} ${p.name}'s turn — press Roll.`
    : 'Press Roll to begin your ascent.';
}

// --- speech ---
function pickVoice(lang) {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  if (!voices.length || !lang) return null;
  return (
    voices.find((v) => v.lang && v.lang.toLowerCase() === lang.toLowerCase()) ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) ||
    null
  );
}

function clearHighlight(words) {
  words.forEach((w) => w.classList.remove('on'));
}

function stopSpeak() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
  if (hlTimer) { clearTimeout(hlTimer); hlTimer = null; }
  if (audioWatchdog) { clearTimeout(audioWatchdog); audioWatchdog = null; }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }
}

// Sequentially highlight word spans, `per` ms each; calls onComplete after the last.
function timedHighlight(words, per, onComplete) {
  let i = 0;
  if (hlTimer) clearTimeout(hlTimer);
  const step = () => {
    clearHighlight(words);
    if (i < words.length) { words[i].classList.add('on'); i += 1; hlTimer = setTimeout(step, per); }
    else if (onComplete) onComplete();
  };
  step();
}

function speakSynth(text, words, lang, done) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    timedHighlight(words, 320, done);
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(lang);
  if (v) u.voice = v;
  if (lang) u.lang = lang;
  u.rate = 0.98;
  u.onboundary = (e) => {
    if (e.name && e.name !== 'word') return;
    clearHighlight(words);
    let acc = 0;
    for (let k = 0; k < words.length; k++) {
      const wl = words[k].textContent.length + 1;
      if (e.charIndex < acc + wl) { words[k].classList.add('on'); break; }
      acc += wl;
    }
  };
  u.onend = done;
  u.onerror = done;
  fallbackTimer = setTimeout(done, Math.max(4000, text.length * 90));
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// Narrate `text` (highlighting word spans), preferring pre-rendered Azure audio when
// available, then browser speech, then a silent timed highlight. Calls onend() once.
function narrate(text, words, lang, audioUrl, onend) {
  let ended = false;
  const done = () => { if (!ended) { ended = true; clearHighlight(words); onend(); } };

  if (!speakOn) { timedHighlight(words, 320, done); return; }

  if (audioUrl) {
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    let perMs = 300;
    let hlStarted = false;
    let fellBack = false;
    const fallback = () => {
      if (ended || fellBack) return;
      fellBack = true;
      if (audioWatchdog) { clearTimeout(audioWatchdog); audioWatchdog = null; }
      currentAudio = null;
      speakSynth(text, words, lang, done);
    };
    const beginHighlight = () => {
      if (audioWatchdog) { clearTimeout(audioWatchdog); audioWatchdog = null; }
      if (!hlStarted) { hlStarted = true; timedHighlight(words, perMs, null); }
    };
    audio.onloadedmetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        perMs = (audio.duration * 1000) / Math.max(1, words.length);
      }
    };
    audio.onplaying = beginHighlight;
    audio.ontimeupdate = beginHighlight;
    audio.onended = () => {
      if (audioWatchdog) { clearTimeout(audioWatchdog); audioWatchdog = null; }
      done();
    };
    audio.onerror = fallback;
    // If real playback never starts (missing file, autoplay block, headless), use speech.
    audioWatchdog = setTimeout(fallback, 1600);
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(fallback);
    return;
  }
  speakSynth(text, words, lang, done);
}

// --- meaning reveal ---
function showReveal(hit) {
  return new Promise((resolve) => {
    revealKind.textContent = hit.type === 'ladder' ? 'Ladder · Virtue' : 'Snake · Vice';
    revealKind.className = 'kind ' + hit.type;
    revealName.textContent = hit.name;
    revealEn.textContent = hit.en ? '— ' + hit.en : '';

    const artUrl = world.assets ? `${world.assets}/img/${hit.type}-${hit.from}.png` : '';
    revealArt.hidden = true;
    if (artUrl) {
      revealArt.onload = () => { revealArt.hidden = false; };
      revealArt.onerror = () => { revealArt.hidden = true; };
      revealArt.src = artUrl;
    } else {
      revealArt.removeAttribute('src');
    }

    revealMeaning.innerHTML = '';
    const parts = hit.meaning.split(/\s+/);
    const spans = parts.map((w, i) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = w;
      revealMeaning.appendChild(s);
      if (i < parts.length - 1) revealMeaning.appendChild(document.createTextNode(' '));
      return s;
    });

    reveal.hidden = false;
    requestAnimationFrame(() => reveal.classList.add('show'));

    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      stopSpeak();
      reveal.classList.remove('show');
      continueBtn.removeEventListener('click', finish);
      skipBtn.removeEventListener('click', finish);
      currentFinish = null;
      setTimeout(() => { reveal.hidden = true; resolve(); }, 240);
    };
    currentFinish = finish;
    continueBtn.addEventListener('click', finish);
    skipBtn.addEventListener('click', finish);

    const audioUrl = world.assets ? `${world.assets}/audio/${hit.type}-${hit.from}.mp3` : '';
    narrate(hit.meaning, spans, world.voice && world.voice.web, audioUrl, () => {
      // auto-advance shortly after narration completes
      fallbackTimer = setTimeout(finish, 700);
    });
  });
}

// --- turn loop ---
async function takeTurn() {
  if (busy) return;
  const p = currentPlayer();
  if (!p || p.pos >= world.size) return;
  busy = true;
  rollBtn.disabled = true;
  worldSelect.disabled = true;

  const r = rollDie();
  dieEl.classList.add('rolling');
  dieEl.textContent = DIE_FACES[r - 1];
  dieEl.setAttribute('aria-label', `Dice, current value ${r}`);
  setTimeout(() => dieEl.classList.remove('rolling'), 400);

  const res = resolveMove(p.pos, r, world);
  const who = players.length > 1 ? `${p.name}: ` : '';
  statusEl.textContent = res.bounced
    ? `${who}rolled ${r} — bounced back to ${res.landed}.`
    : `${who}rolled ${r} — moved to ${res.landed}.`;

  p.pos = res.landed;
  placeAll();
  renderRoster();
  await delay(600);

  if (res.hit) {
    highlightConnector(res.hit, true);
    await showReveal(res.hit);
    p.pos = res.to;
    placeAll();
    renderRoster();
    await delay(750);
    highlightConnector(res.hit, false);
    const verb = res.hit.type === 'ladder' ? 'climbed to' : 'slid down to';
    statusEl.textContent = `${who}${res.hit.name} — ${verb} ${res.to}.`;
  }

  p.pos = res.to;
  renderRoster();

  if (res.won) {
    showWin(p);
    return;
  }

  if (players.length > 1) {
    current = (current + 1) % players.length;
    placeAll();
    renderRoster();
    announceTurn();
  }
  busy = false;
  rollBtn.disabled = false;
  worldSelect.disabled = false;
}

function showWin(p) {
  const name = players.length > 1 ? `${p.glyph} ${p.name} wins! ` : '';
  winTitle.textContent = `🎉 ${name}${world.goalLabel || 'You reached the top!'}`;
  winMeaning.textContent = world.goalMeaning || '';
  winOverlay.hidden = false;
  requestAnimationFrame(() => winOverlay.classList.add('show'));
}

function resetGame() {
  stopSpeak();
  winOverlay.classList.remove('show');
  winOverlay.hidden = true;
  reveal.hidden = true;
  players.forEach((p) => (p.pos = 1));
  current = 0;
  busy = false;
  rollBtn.disabled = false;
  worldSelect.disabled = false;
  placeAll(false);
  renderRoster();
  announceTurn();
}

async function loadWorld(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const data = await res.json();
  validateWorld(data);
  world = data;
  index = indexWorld(world);
  applyTheme(world.theme);
  setupWorldArt();
  worldTitle.textContent = world.title;
  worldSubtitle.textContent = world.subtitle || '';
  document.title = `${world.title} — Sopāna`;
  buildBoard();
  drawConnectors();
  buildPlayers();
  resetGame();
}

// --- events ---
rollBtn.addEventListener('click', takeTurn);
dieEl.addEventListener('click', takeTurn);
newGameBtn.addEventListener('click', resetGame);
winNewGame.addEventListener('click', resetGame);

worldSelect.addEventListener('change', (e) => {
  syncModeLinks();
  loadWorld(e.target.value).catch((err) => (statusEl.textContent = String(err.message || err)));
});

muteBtn.addEventListener('click', () => {
  speakOn = !speakOn;
  muteBtn.setAttribute('aria-pressed', String(speakOn));
  muteBtn.textContent = speakOn ? '🔊 Read aloud' : '🔇 Muted';
  if (!speakOn) stopSpeak();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentFinish) {
    currentFinish();
    return;
  }
  if (e.code === 'Space' && reveal.hidden && winOverlay.hidden) {
    // roll only when no overlay is open
    e.preventDefault();
    takeTurn();
  }
});

if (window.speechSynthesis) {
  speechSynthesis.onvoiceschanged = () => {}; // trigger voice list load
  speechSynthesis.getVoices();
}

// honor ?world= (from mode nav / deep links) and keep mode links theme-aware
const _wparam = new URLSearchParams(window.location.search).get('world');
if (_wparam) {
  const _opt = `worlds/${_wparam.replace(/[^a-z]/gi, '')}.json`;
  if ([...worldSelect.options].some((o) => o.value === _opt)) worldSelect.value = _opt;
}
function syncModeLinks() {
  const id = worldSelect.value.replace(/^worlds\//, '').replace(/\.json$/, '');
  const c = $('#lnkCine');
  const d = $('#lnk3d');
  const l = $('#lnkLobby');
  if (c) c.href = `cinematic.html?world=${id}`;
  if (d) d.href = `play3d.html?world=${id}`;
  if (l) l.href = `setup.html?world=${id}`;
}
syncModeLinks();

loadWorld(worldSelect.value).catch((err) => (statusEl.textContent = String(err.message || err)));
