# Copilot instructions — Sopāna

You are working on **Sopāna**, a themed **Snakes & Ladders that teaches** (the ancient Indian
Moksha Patam): one JSON manifest per world over a **pure rules engine** (`web/js/logic.js`),
drawn **three ways** — Board (`game.js`), Cinematic (PixiJS, `cinematic.js`), 3D (Three.js,
`play3d.js`) — with **local hotseat multiplayer** and **per-theme AI art / narration / music /
intro film**. Published to GitHub Pages + an Android Capacitor APK.

**Before changing anything, read [`../CONTEXT.md`](../CONTEXT.md)** — it is the durable project
memory: architecture + file map, the four themes and their asset inventory, the generator
pipeline, build/test/QA commands, publishing (note: **APK CI needs JDK 21**), version history,
gotchas, and the backlog / where to resume.

Conventions:
- Keep the game **data-driven** — a new game/theme is mostly a `web/worlds/<id>.json` plus
  art-direction entries in the `tooling/gen_*.py` scripts; don't hardcode content in renderers.
- **Multiplayer must show every player's position** in all modes; carry the character `id` in
  each renderer's player object.
- Cinematic character sprites are on a **near-black background** and drawn with **PIXI ADD
  blend**; **dark-clamp light `theme.bg`** for the backlit Cinematic/3D modes.
- Validate with `npm test` (19 tests) and `node tooling/qa_full.mjs`; ship via a GitHub Release
  (rebuilds the APK). Keep `CONTEXT.md` current as you ship.
- The reusable build method is the **`sopana-game`** skill (`~/.copilot/skills/sopana-game`,
  private repo `github.com/naveenneog/dailyapps-skills`).
