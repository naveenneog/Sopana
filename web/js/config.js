// Shared game configuration for personalisation + local hotseat multiplayer.
// The lobby (setup.js) writes a config to sessionStorage; every mode reads it so
// the same players / characters / theme carry across Board, Cinematic and 3D.

export const PLAYER_COLORS = ['#e8c24a', '#46c7b0', '#e0559b', '#6fb1ff'];
const KEY = 'sopana.game';

export function loadConfig() {
  try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
}

export function saveConfig(cfg) {
  try { sessionStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* private mode */ }
}

// Return a coherent { world, players[] } for the world actually being rendered.
// Players from the lobby are reused; characters are (re)assigned from this world's
// roster when the stored config was for a different theme or lacks a character.
export function gameForWorld(world) {
  const roster = (world && world.characters) || [];
  const stored = loadConfig();
  const pick = (i) => (roster.length ? roster[i % roster.length].id : null);
  let players;
  if (stored && Array.isArray(stored.players) && stored.players.length) {
    const sameWorld = stored.world === world.id;
    players = stored.players.slice(0, 4).map((p, i) => ({
      name: (p && p.name) || `Player ${i + 1}`,
      color: (p && p.color) || PLAYER_COLORS[i % PLAYER_COLORS.length],
      char: (sameWorld && p && p.char && roster.some((c) => c.id === p.char)) ? p.char : pick(i),
    }));
  } else {
    players = [{ name: 'Player 1', color: PLAYER_COLORS[0], char: pick(0) }];
  }
  return { world: world.id, players };
}

export function charOf(world, id) {
  const roster = (world && world.characters) || [];
  return roster.find((c) => c.id === id) || roster[0] || { name: 'Player', glyph: '●', color: '#e8a33d' };
}
