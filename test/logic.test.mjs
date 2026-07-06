import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  squareToCell,
  squareToRenderCell,
  rollDie,
  resolveMove,
  validateWorld,
  indexWorld,
} from '../web/js/logic.js';

test('squareToCell maps corners with boustrophedon layout', () => {
  assert.deepEqual(squareToCell(1), { row: 0, col: 0 });
  assert.deepEqual(squareToCell(10), { row: 0, col: 9 });
  assert.deepEqual(squareToCell(11), { row: 1, col: 9 }); // row 1 runs right->left
  assert.deepEqual(squareToCell(20), { row: 1, col: 0 });
  assert.deepEqual(squareToCell(100), { row: 9, col: 0 });
});

test('squareToRenderCell puts 1 at bottom-left and 100 at top-left', () => {
  assert.deepEqual(squareToRenderCell(1), { row: 9, col: 0 });
  assert.deepEqual(squareToRenderCell(100), { row: 0, col: 0 });
});

test('squareToCell rejects out-of-range', () => {
  assert.throws(() => squareToCell(0));
  assert.throws(() => squareToCell(101));
});

test('rollDie is deterministic given rng and bounded 1..6', () => {
  assert.equal(rollDie(() => 0), 1);
  assert.equal(rollDie(() => 0.9999), 6);
  for (let i = 0; i < 200; i++) {
    const v = rollDie();
    assert.ok(v >= 1 && v <= 6);
  }
});

const W = {
  id: 'test',
  title: 'Test',
  size: 100,
  ladders: [{ from: 4, to: 25, name: 'Faith', en: 'Faith', meaning: 'up' }],
  snakes: [{ from: 99, to: 7, name: 'Desire', en: 'Lust', meaning: 'down' }],
};

test('resolveMove climbs a ladder', () => {
  const r = resolveMove(1, 3, W); // ->4 ladder ->25
  assert.equal(r.landed, 4);
  assert.equal(r.to, 25);
  assert.equal(r.hit.type, 'ladder');
  assert.equal(r.hit.name, 'Faith');
  assert.equal(r.won, false);
});

test('resolveMove slides down a snake', () => {
  const r = resolveMove(96, 3, W); // ->99 snake ->7
  assert.equal(r.to, 7);
  assert.equal(r.hit.type, 'snake');
});

test('resolveMove plain move has no hit', () => {
  const r = resolveMove(1, 1, W); // ->2
  assert.equal(r.to, 2);
  assert.equal(r.hit, null);
});

test('resolveMove bounces back past the top', () => {
  const r = resolveMove(98, 5, W); // 103 -> bounce to 97
  assert.equal(r.landed, 97);
  assert.equal(r.bounced, true);
});

test('resolveMove wins on the exact final square', () => {
  const r = resolveMove(97, 3, W); // ->100
  assert.equal(r.to, 100);
  assert.equal(r.won, true);
});

test('resolveMove does not chain jumps', () => {
  const chain = {
    id: 'c',
    title: 'c',
    size: 100,
    ladders: [{ from: 4, to: 99, name: 'x', meaning: 'm' }],
    snakes: [{ from: 99, to: 7, name: 'y', meaning: 'm' }],
  };
  const r = resolveMove(1, 3, chain); // ->4 ladder ->99 ; must NOT then snake to 7
  assert.equal(r.to, 99);
  assert.equal(r.hit.type, 'ladder');
});

test('validateWorld accepts a good world and rejects bad ones', () => {
  assert.doesNotThrow(() => validateWorld(W));
  assert.throws(
    () => validateWorld({ id: 'x', title: 'x', snakes: [{ from: 5, to: 9, name: 'n', meaning: 'm' }] }),
    /snake must go down/,
  );
  assert.throws(
    () => validateWorld({ id: 'x', title: 'x', ladders: [{ from: 9, to: 5, name: 'n', meaning: 'm' }] }),
    /ladder must go up/,
  );
  assert.throws(() =>
    validateWorld({ id: 'x', title: 'x', ladders: [{ from: 100, to: 100, name: 'n', meaning: 'm' }] }),
  );
  assert.throws(
    () =>
      validateWorld({
        id: 'x',
        title: 'x',
        snakes: [{ from: 30, to: 5, name: 'n', meaning: 'm' }],
        ladders: [{ from: 30, to: 80, name: 'n', meaning: 'm' }],
      }),
    /both a snake and a ladder/,
  );
  assert.throws(() => validateWorld({ title: 'no id' }), /missing "id"/);
});

const worldPath = (f) => fileURLToPath(new URL(`../web/worlds/${f}`, import.meta.url));
const loadWorld = async (f) => JSON.parse(await readFile(worldPath(f), 'utf8'));

test('shipped Moksha world is valid and keeps the iconic 99->7 snake', async () => {
  const w = await loadWorld('moksha.json');
  assert.doesNotThrow(() => validateWorld(w));
  const kama = w.snakes.find((s) => s.from === 99);
  assert.ok(kama, 'square 99 snake exists');
  assert.equal(kama.to, 7);
  for (const e of [...w.ladders, ...w.snakes]) assert.ok(e.name && e.meaning, 'every entry is narratable');
});

test('shipped Habit Heroes world is valid', async () => {
  const w = await loadWorld('habits.json');
  assert.doesNotThrow(() => validateWorld(w));
  assert.ok(w.ladders.length && w.snakes.length);
});

test('indexWorld builds from-maps', () => {
  const idx = indexWorld(W);
  assert.equal(idx.ladders.get(4).to, 25);
  assert.equal(idx.snakes.get(99).to, 7);
});
