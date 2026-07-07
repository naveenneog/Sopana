# Sopāna — project context (read this to resume)

> **If you are an AI agent resuming work on this game, read this file first.** It is the
> durable memory of what Sopāna is, how it is built, what is shipped, and where to pick up.
> Companion: the reusable method is the **`sopana-game`** skill in the private repo
> `github.com/naveenneog/dailyapps-skills` (and `~/.copilot/skills/sopana-game`).

- **Live:** https://naveenneog.github.io/Sopana/
- **Repo:** https://github.com/naveenneog/Sopana (public, PolyForm Noncommercial 1.0.0)
- **Latest release:** **v1.5.0** (releases v1.0.0 → v1.5.0; a GitHub Release rebuilds the APK)
- **Owner:** @naveenneog (Naveen Gopalakrishna)

---

## What it is
**Sopāna** ("the ascent") is a themed **Snakes & Ladders that teaches** — rooted in the ancient
Indian **Moksha Patam / Gyan Chaupar**, where every snake and ladder is a vice or a virtue.
Land on one and it **animates and reads its meaning aloud**. The whole game is **data** (one
JSON per world) over a **pure rules engine**, drawn **three ways**, with **local hotseat
multiplayer** and **per-theme AI-generated art / narration / music / intro film**. Ships to the
**web** (GitHub Pages) and **Android** (Capacitor APK).

---

## Architecture (data over a pure engine, three renderers)
Served from `web/`:

```
index.html            → redirects to setup.html (the lobby IS the landing)
setup.html + js/setup.js     LOBBY: pick theme, mode, 1-4 players, a character each → sessionStorage
board.html + js/game.js      Renderer A — 2D DOM board + live roster + Meaning Reveal
cinematic.html + js/cinematic.js  Renderer B — PixiJS 2.5D backlit shadow-theatre
play3d.html + js/play3d.js        Renderer C — Three.js real 3D board, 5 camera presets + orbit/zoom
js/logic.js           PURE rules (no DOM): rollDie, resolveMove, validateWorld, indexWorld
js/config.js          lobby/multiplayer: gameForWorld, charOf, PLAYER_COLORS (sessionStorage key `sopana.game`)
js/audio.js           Web Audio: SOUND_PROFILES per theme + setBed() music + SFX + fanfare
js/snakes.js          themed animated SVG snake renderer (board) + style map (3D reads it)
worlds/<id>.json      the game data (theme, characters, ladders[], snakes[])
vendor/               pixi.min.js, three.module.js + three.core.js (BOTH required)
assets/<id>/          per-theme media (see inventory below)
```
Data flow: `worlds/<id>.json → logic.js (validate+index+rules)`; `config.js` supplies players;
each renderer draws the same data. `resolveMove(pos, roll, world) → {landed, to, hit, won, bounced}`
is the one function every renderer animates (`hit` carries the snake/ladder `meaning`).
Full file map + gotchas: the `sopana-game` skill's `references/architecture.md`.

---

## Themes + characters + asset inventory (as of v1.5.0)
Four worlds. Each square's snake/ladder has `{from,to,name,en,meaning}`; each theme has a
character roster and a full media set.

| World id | Title | Characters | music.mp3 | intro.mp4 |
|---|---|---|---|---|
| `moksha` | Snake & Ladders — Original | pilgrim, sage, devotee, wanderer | ❌ (procedural drone) | ✅ `assets/intro.mp4` |
| `founders` | Founder's Climb | founder, engineer, designer, investor | ✅ | ✅ |
| `panchatantra` | Panchatantra Trail | lion, monkey, turtle, crow, deer | ✅ | ✅ |
| `habits` | Habit Heroes | runner, reader, sprout, star | ✅ | ✅ |

Per-theme media under `web/assets/<id>/`:
`img/board.png`, `img/token.png`, `img/char-<charId>.png` (cinematic sprites, near-black bg for
ADD-blend glow), `img/<type>-<from>.png` (motif per snake/ladder), `audio/<type>-<from>.mp3`
(narrated meanings), `music.mp3` (looping bed, non-moksha), `intro.mp4` (Sora 2). Moksha keeps
its procedural temple drone (no music.mp3) by design.

---

## Features shipped
- **Meaning Reveal** — every snake/ladder animates + a card + narration (Azure audio → Web
  Speech fallback).
- **Three modes** — Board (2D), Cinematic (2.5D backlit shadow-theatre with per-character
  sprites, per-theme intro film, adaptive score), 3D (real board, shifting cameras, on-demand
  snake/ladder reveal to declutter).
- **Local hotseat multiplayer (1-4)** — a lobby picks theme + mode + players + a character each;
  **every mode shows all players' positions** (board tokens + roster, 3D character standees,
  cinematic per-character sprites; current player highlighted; fan-out on shared squares).
- **Per-theme everything** — art, narration, **sound profile**, **generated music bed**
  (replaces the drone for non-moksha), **intro film**, and **environment** (Cinematic sky/temple,
  3D bg/fog/lights/tiles from `theme`; light themes dark-clamped for the backlit modes).
- **In-game theme switcher** + a Cinematic|Board|3D|Lobby nav that carries `?world=`.
- **Lobby a11y** — aria-pressed + `:focus-visible` rings; distinct default characters.
- **Published** — GitHub Pages + Android APK (debug-signed) via CI.

---

## Asset pipeline (generators in `tooling/`, AAD auth via `az login`)
Azure AI Foundry endpoint `ai-contosohub530569751908.cognitiveservices.azure.com` (keys disabled;
Bearer token from `az account get-access-token --resource https://cognitiveservices.azure.com`).

```bash
python tooling/gen_assets.py --world <id> --art --voice   # gpt-image-2 board/token/motif + Azure TTS meanings
python tooling/gen_char_sprites.py <id>                    # gpt-image-2 cinematic character sprites (near-black bg)
python tooling/gen_theme_music.py <id>                     # numpy+ffmpeg composed looping music bed
python tooling/gen_intro_themes.py <id>                    # Sora-2 opening cinematic (long-running; run detached)
```
gpt-image-2 uses `.../deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview`
(the v1 route returns `unknown_model`). Sora-2 at `/openai/v1/videos?api-version=preview`.
Art-direction lives in dicts inside each script (`STYLE/TOKEN/BOARD/MOTIF`, `CHARS`, composers,
intro prompts) — **add a theme = add its entries there**.

---

## Build / run / test / QA
```bash
npm run serve        # dev server → http://localhost:5173 (scripts/serve.mjs)
npm test             # node:test: logic + dom.smoke (jsdom loads board.html) + assets-sync (19 tests)
node tooling/qa_full.mjs   # Playwright: console/page errors, responsive overflow (mobile/tablet/desktop/TV),
                           # lobby a11y, per-theme screenshots. Launch WebGL with --use-gl=swiftshader.
```
Android emulator QA: SDK at `%LOCALAPPDATA%\Android\Sdk`, AVD `actioncut_test` (android-34).
`adb reverse tcp:5173 tcp:5173` + device Chrome tests the dev build on-device. **Emulator GPU is
a slow software renderer** (WebGL frame times up to minutes) — a black 3D canvas for seconds is
the emulator, not a bug.

---

## Publishing
- **Web:** `.github/workflows/pages.yml` deploys `web/` to Pages. Enabled once via
  `gh api --method POST repos/naveenneog/Sopana/pages -f build_type=workflow`.
- **APK:** `.github/workflows/apk.yml` wraps `web/` with **Capacitor 7** → `gradlew assembleDebug`.
  **CRITICAL: CI must use JDK 21** (`actions/setup-java@v4`, `java-version:"21"`); JDK 17 fails
  `invalid source release: 21`. `capacitor.config.json` appId = `com.naveenneog.sopana`.
- **Release:** `gh release create vX.Y.Z ...` triggers the APK build; asset `Sopana-vX.Y.Z.apk`.

---

## Version history
- **v1.0/1.1** — M0 board + real art/voice (gpt-image-2 + Azure TTS); Cinematic (5 phases:
  walk/dice/camera, set-pieces, realms/curtains, Sora intro + title, procedural Web Audio);
  UX/QA fixes (mute, pacing). Founders + Panchatantra themes added.
- **v1.2.0** — Default to Cinematic; in-game theme switchers; 3D declutter + on-demand reveal;
  mode nav; themed animated CSS/SVG snakes.
- **v1.3.0** — Personalisation + hotseat multiplayer: lobby, character rosters, per-theme sound
  profiles, per-theme Sora intros, board multiplayer.
- **v1.4.0** — Game-design pass: **show all player positions** (3D character standees, cinematic
  multi-pilgrim), themed 3D characters, per-theme melodic motif + win fanfare; UX/a11y fixes
  (mobile HUD wrap, light-theme dark-clamp, themed start screen, aria-pressed + focus ring,
  distinct default characters).
- **v1.5.0** — **Per-character cinematic sprites** (17, backlit, one per character) + **per-theme
  generated music beds** replacing the drone (moksha keeps its drone).

---

## Gotchas (don't relearn)
1. **JDK 21** for the APK (Capacitor 7 compiles source release 21).
2. **Vendor both** `three.module.js` **and** `three.core.js` (module 404s silently otherwise).
3. **Cinematic sprites on near-black bg + PIXI ADD blend** (else a bright square); **dark-clamp
   light `theme.bg`** for the backlit modes.
4. **Carry the `char` id in every renderer's player object** (dropping it → sprites fall back to
   the token — this bug happened in cinematic v1.5).
5. **Music bed** = `createMediaElementSource → master gain` so mute works; `setBed()` before
   `resume()`; it suppresses the constant drone.
6. **Headless Chromium can't decode H.264** (Sora intros) — QA video via ffmpeg frames; keep a
   hard "skip intro" backstop timer.
7. **SQLite `ATTACH`** — avoid the word "attach" in agent SQL.
8. Azure endpoint/resource/subscription IDs are **identifiers, not secrets** (they're already in
   this public repo); never commit tokens/keys.

---

## Backlog / where to resume
Open QA items (see the session `issues` table history):
- **SOP-8 (LOW, partial):** no pause / exit-to-menu in Cinematic; the reflection journal never
  clears between games.
- **SOP-10 (INFO):** Board is small on mobile (~343px) — playable but tight.
- **SOP-20 (INFO):** emulator software-GPU slowness (not a device bug; no app change needed).

Ideas / likely next asks (from the build so far):
- **Character sprites for Board + 3D too** (they use CSS/glyph tokens today; 3D uses billboard
  standees). Wiring the generated `char-*.png` (or new 3D-friendly art) would unify the look.
- **More themes** — the mechanic is universal; add a world JSON + art-direction dict entries +
  a `SOUND_PROFILE` + a music composer + an intro prompt, then generate + wire into the lobby.
- **TV app** (the original scope mentioned web/Android/iOS/**TV**) — large-target navigation,
  D-pad/remote support; the modes already scale to 1920×1080.
- **iOS** (Capacitor supports it; needs a mac/CI runner).
- **Online multiplayer** would need a backend (current design is static-hosting hotseat).
- **Board/3D pause + exit-to-menu**, journal-clear-on-restart (closes SOP-8).

To extend, follow the **`sopana-game`** skill playbook. Keep this file current as you ship.
