// Lobby: pick theme, mode, players (1-4) and a character per player, then launch.
import { PLAYER_COLORS, saveConfig, loadConfig } from './config.js';

const WORLD_IDS = ['moksha', 'founders', 'panchatantra', 'habits'];
const MODES = [
  ['cinematic', '✨ Cinematic', 'cinematic.html'],
  ['board', '🎯 Board', 'board.html'],
  ['play3d', '🎲 3D', 'play3d.html'],
];

const worlds = {};
const state = { world: 'moksha', mode: 'cinematic', count: 1, players: [] };

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function defaultPlayer(i) {
  const roster = (worlds[state.world] && worlds[state.world].characters) || [];
  return { name: `Player ${i + 1}`, color: PLAYER_COLORS[i % PLAYER_COLORS.length], char: roster.length ? roster[i % roster.length].id : null };
}

function ensurePlayers() {
  while (state.players.length < state.count) state.players.push(defaultPlayer(state.players.length));
  state.players.length = state.count;
  // re-validate characters against the current theme's roster
  const roster = (worlds[state.world] && worlds[state.world].characters) || [];
  state.players.forEach((p, i) => {
    if (!roster.some((c) => c.id === p.char)) p.char = roster.length ? roster[i % roster.length].id : null;
  });
}

function renderThemes() {
  const box = $('#themes'); box.innerHTML = '';
  for (const id of WORLD_IDS) {
    const w = worlds[id];
    const c = el('button', 'card' + (id === state.world ? ' sel' : ''));
    c.style.setProperty('--accent', (w.theme && w.theme.accent) || '#e8a33d');
    c.innerHTML = `<div class="t">${w.title}</div><div class="s">${w.subtitle || ''}</div><div class="swatch"></div>`;
    c.addEventListener('click', () => { state.world = id; ensurePlayers(); renderThemes(); renderPlayers(); });
    box.appendChild(c);
  }
}

function renderModes() {
  const box = $('#modes'); box.innerHTML = '';
  for (const [id, label] of MODES) {
    const b = el('button', 'pill' + (id === state.mode ? ' sel' : ''), label);
    b.addEventListener('click', () => { state.mode = id; renderModes(); });
    box.appendChild(b);
  }
}

function renderCounts() {
  const box = $('#counts'); box.innerHTML = '';
  for (let n = 1; n <= 4; n++) {
    const b = el('button', 'pill' + (n === state.count ? ' sel' : ''), `${n} ${n === 1 ? 'player' : 'players'}`);
    b.addEventListener('click', () => { state.count = n; ensurePlayers(); renderCounts(); renderPlayers(); });
    box.appendChild(b);
  }
}

function renderPlayers() {
  ensurePlayers();
  const roster = (worlds[state.world] && worlds[state.world].characters) || [];
  const box = $('#players'); box.innerHTML = '';
  state.players.forEach((p, i) => {
    const row = el('div', 'prow');
    const dot = el('span', 'dot'); dot.style.background = p.color; dot.style.color = p.color;
    const name = el('input', 'pname'); name.value = p.name; name.maxLength = 14;
    name.addEventListener('input', () => (p.name = name.value || `Player ${i + 1}`));
    const chars = el('div', 'chars');
    for (const c of roster) {
      const chip = el('button', 'chip' + (c.id === p.char ? ' sel' : ''), `${c.glyph}<span class="cn">${c.name}</span>`);
      chip.style.setProperty('--pc', p.color);
      chip.title = c.name;
      chip.addEventListener('click', () => { p.char = c.id; renderPlayers(); });
      chars.appendChild(chip);
    }
    row.append(dot, name, chars);
    box.appendChild(row);
  });
}

function begin() {
  saveConfig({ world: state.world, players: state.players.map((p) => ({ name: p.name, color: p.color, char: p.char })) });
  location.href = `${state.mode}.html?world=${state.world}`;
}

async function main() {
  const arr = await Promise.all(WORLD_IDS.map((id) => fetch(`worlds/${id}.json`).then((r) => r.json())));
  WORLD_IDS.forEach((id, i) => (worlds[id] = arr[i]));

  const params = new URLSearchParams(location.search);
  const w = params.get('world');
  if (w && worlds[w]) state.world = w;
  const m = params.get('mode');
  if (m && MODES.some(([id]) => id === m)) state.mode = m;

  // prefill from a previous lobby session if present
  const prev = loadConfig();
  if (prev && Array.isArray(prev.players) && prev.players.length) {
    state.count = Math.min(4, prev.players.length);
    if (prev.world && worlds[prev.world] && !w) state.world = prev.world;
    state.players = prev.players.slice(0, 4).map((p, i) => ({
      name: p.name || `Player ${i + 1}`,
      color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
      char: p.char,
    }));
  }
  ensurePlayers();

  renderThemes();
  renderModes();
  renderCounts();
  renderPlayers();
  $('#begin').addEventListener('click', begin);
}

main();
