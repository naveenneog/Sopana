// logic.js — pure, DOM-free game logic.
// Shared by the browser UI (game.js) and the Node test suite (test/logic.test.mjs).
// Keeping it pure makes the core rules regression-testable without a browser.

export const BOARD_SIZE = 100;
export const COLS = 10;

// Map a 1..size square number to a grid cell using a boustrophedon (ox-plough) layout.
// row 0 is the BOTTOM row (squares 1..cols); odd rows run right-to-left.
export function squareToCell(n, size = BOARD_SIZE, cols = COLS) {
  if (!Number.isInteger(n) || n < 1 || n > size) {
    throw new RangeError(`square ${n} out of range 1..${size}`);
  }
  const idx = n - 1;
  const row = Math.floor(idx / cols); // 0 = bottom
  const posInRow = idx % cols;
  const leftToRight = row % 2 === 0;
  const col = leftToRight ? posInRow : cols - 1 - posInRow;
  return { row, col };
}

// Same mapping but with row counted from the TOP, for rendering in a normal grid.
export function squareToRenderCell(n, size = BOARD_SIZE, cols = COLS) {
  const { row, col } = squareToCell(n, size, cols);
  const rows = Math.ceil(size / cols);
  return { row: rows - 1 - row, col };
}

// Build fast from -> entry lookup maps for a world manifest.
export function indexWorld(world) {
  const ladders = new Map();
  const snakes = new Map();
  for (const l of world.ladders ?? []) ladders.set(l.from, l);
  for (const s of world.snakes ?? []) snakes.set(s.from, s);
  return { ladders, snakes };
}

// Deterministic die roll; rng() must return a float in [0, 1). Defaults to Math.random.
export function rollDie(rng = Math.random) {
  return 1 + Math.floor(rng() * 6);
}

// Resolve a move from `pos` after rolling `roll`.
// Returns a full description the UI can animate and narrate.
// Overshooting the final square bounces back (classic rule) unless world.exactFinish === false.
// A jump (snake/ladder) does NOT chain into a second jump at its destination.
export function resolveMove(pos, roll, world) {
  const size = world.size ?? BOARD_SIZE;
  const { ladders, snakes } = indexWorld(world);

  let landed = pos + roll;
  let bounced = false;
  if (landed > size) {
    if (world.exactFinish === false) {
      landed = size;
    } else {
      landed = size - (landed - size); // bounce back off the top
      bounced = true;
    }
  }

  let hit = null;
  let finalPos = landed;
  if (ladders.has(landed)) {
    const l = ladders.get(landed);
    hit = { type: 'ladder', from: l.from, to: l.to, name: l.name, en: l.en, meaning: l.meaning };
    finalPos = l.to;
  } else if (snakes.has(landed)) {
    const s = snakes.get(landed);
    hit = { type: 'snake', from: s.from, to: s.to, name: s.name, en: s.en, meaning: s.meaning };
    finalPos = s.to;
  }

  return {
    from: pos,
    roll,
    landed, // square after the dice move, before any snake/ladder
    bounced,
    hit, // null | { type, from, to, name, en, meaning }
    to: finalPos, // final resting square
    won: finalPos === size,
  };
}

// Validate a world manifest's structure. Throws on error; returns the world on success.
export function validateWorld(world) {
  const size = world.size ?? BOARD_SIZE;
  for (const k of ['id', 'title']) {
    if (!world[k]) throw new Error(`world missing "${k}"`);
  }
  const inRange = (v) => Number.isInteger(v) && v >= 1 && v <= size;
  const check = (arr, kind) => {
    for (const e of arr ?? []) {
      if (!inRange(e.from) || !inRange(e.to)) {
        throw new Error(`${kind} endpoint out of range: ${JSON.stringify(e)}`);
      }
      if (kind === 'ladder' && e.to <= e.from) throw new Error(`ladder must go up: ${JSON.stringify(e)}`);
      if (kind === 'snake' && e.to >= e.from) throw new Error(`snake must go down: ${JSON.stringify(e)}`);
      if (e.from === size) throw new Error(`${kind} cannot start on the final square`);
      for (const f of ['name', 'meaning']) {
        if (!e[f]) throw new Error(`${kind} missing "${f}": ${JSON.stringify(e)}`);
      }
    }
  };
  check(world.ladders, 'ladder');
  check(world.snakes, 'snake');

  // A square may not be both a snake head and a ladder foot.
  const heads = new Set((world.snakes ?? []).map((s) => s.from));
  for (const l of world.ladders ?? []) {
    if (heads.has(l.from)) throw new Error(`square ${l.from} is both a snake and a ladder`);
  }
  return world;
}
