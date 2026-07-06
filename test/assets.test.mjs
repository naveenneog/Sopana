// Asset-sync regression test: every world entry must have matching art + narration,
// and the files must be non-trivial and have valid PNG/MP3 signatures.
// Skips gracefully when a world's assets have not been generated yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const assetsDir = (id) => fileURLToPath(new URL(`../web/assets/${id}/`, import.meta.url));
const worldPath = (id) => fileURLToPath(new URL(`../web/worlds/${id}.json`, import.meta.url));

async function checkWorldAssets(t, id) {
  const dir = assetsDir(id);
  if (!existsSync(dir)) {
    t.skip(`no assets generated for ${id}`);
    return;
  }
  const world = JSON.parse(await readFile(worldPath(id), 'utf8'));
  const entries = [
    ...world.ladders.map((l) => ['ladder', l.from]),
    ...world.snakes.map((s) => ['snake', s.from]),
  ];
  for (const [kind, from] of entries) {
    const img = `${dir}img/${kind}-${from}.png`;
    const aud = `${dir}audio/${kind}-${from}.mp3`;
    assert.ok(existsSync(img), `missing image ${kind}-${from}.png`);
    assert.ok(existsSync(aud), `missing audio ${kind}-${from}.mp3`);
    assert.ok((await stat(img)).size > 2000, `image too small ${kind}-${from}`);
    assert.ok((await stat(aud)).size > 1500, `audio too small ${kind}-${from}`);
  }
  assert.ok(existsSync(`${dir}img/token.png`), 'token.png present');
  assert.ok(existsSync(`${dir}img/board.png`), 'board.png present');

  const png = await readFile(`${dir}img/token.png`);
  assert.ok(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47, 'valid PNG header');

  const mp3 = await readFile(`${dir}audio/${entries[0][0]}-${entries[0][1]}.mp3`);
  const isID3 = mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33; // 'ID3'
  const isFrame = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0; // MPEG frame sync
  assert.ok(isID3 || isFrame, 'valid MP3 header');
}

test('moksha world assets are complete and valid', async (t) => {
  await checkWorldAssets(t, 'moksha');
});

test('habits world assets are complete and valid', async (t) => {
  await checkWorldAssets(t, 'habits');
});
