// Headless DOM smoke test: proves game.js runs in a document, builds the board and
// connectors, and that a forced roll opens the narrated Meaning Reveal with the right entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const html = await readFile(new URL('../web/board.html', import.meta.url), 'utf8');

const waitFor = async (pred, ms = 2500) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

test('game.js builds board + connectors and a forced roll opens the Meaning Reveal', async () => {
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  const { window } = dom;

  // Wire the globals game.js expects (no browser).
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.fetch = async (url) => {
    const body = await readFile(new URL(url, `file://${webDir}`), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  };
  globalThis.Image = window.Image;
  globalThis.Audio = window.Audio || class FakeAudio { play() {} pause() {} };

  const realRandom = Math.random;
  try {
    await import('../web/js/game.js');

    // board + connectors render after the async world load
    const built = await waitFor(() => window.document.querySelectorAll('#board .cell').length === 100);
    assert.ok(built, 'board should build 100 cells');
    assert.equal(window.document.querySelectorAll('#overlay .conn').length, 16, '7 ladders + 9 snakes');
    assert.ok(window.document.querySelector('#token'), 'token exists');

    // Force a roll of 3 from square 1 -> lands on 4 -> Shraddha ladder.
    Math.random = () => 0.34; // 1 + floor(0.34*6) = 3
    const reveal = window.document.querySelector('#reveal');
    const rollBtn = window.document.querySelector('#rollBtn');
    rollBtn.click();

    const opened = await waitFor(
      () => !reveal.hidden && window.document.querySelector('#revealName').textContent === 'Shraddha',
    );
    assert.ok(opened, 'Meaning Reveal should open for the Shraddha ladder');
    assert.match(window.document.querySelector('#revealMeaning').textContent, /Faith steadies/);
    assert.ok(window.document.querySelector('#revealKind').className.includes('ladder'));

    // Let the whole turn finish so no timers outlive the test; token should climb to 25.
    const finished = await waitFor(() => reveal.hidden && !rollBtn.disabled, 9000);
    assert.ok(finished, 'turn should complete and re-enable rolling');
    assert.match(window.document.querySelector('#status').textContent, /climbed to 25/);
  } finally {
    Math.random = realRandom;
    // Keep globals defined; any late no-op timers must not hit an undefined window.
  }
});
