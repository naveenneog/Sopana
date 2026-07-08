# Sopāna — project context (read this to resume)

> **If you are an AI agent resuming work on this game, read this file first.** It is the
> durable memory of what Sopāna is, how it is built, what is shipped, and where to pick up.
> Companion: the reusable method is the **`sopana-game`** skill in the private repo
> `github.com/naveenneog/dailyapps-skills` (and `~/.copilot/skills/sopana-game`).

- **Live:** https://naveenneog.github.io/Sopana/
- **Repo:** https://github.com/naveenneog/Sopana (public, PolyForm Noncommercial 1.0.0)
- **Latest release:** **v1.8.0** (releases v1.0.0 → v1.8.0; a GitHub Release rebuilds the APK)
- **Live site now (post-v1.8.0, Pages-only):** the root is a **launch/landing page** (`index.html`)
  and the lobby has a **first-run coach-mark tour**; the game itself is unchanged behind them. Pages
  redeploys `web/` on every push to `main`; the APK is still v1.8.0 (cut a Release to rebuild it).
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
index.html            → LAUNCH / landing page (Play → setup.html; installed app + PWA skip straight to the game)
setup.html + js/setup.js     LOBBY: pick theme, mode, 1-4 players, a character each → sessionStorage
js/onboarding.js      first-run coach-mark tour over the lobby (spotlight + tooltips; localStorage `sopana.tour.v1`; replay via ❔)
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
assets/media/         landing-page clips (gameplay/mode-cinematic/mode-3d .mp4 + posters) from tooling/record_gameplay.mjs
assets/brand/         logo.png + logo-mark.png + PWA icons (from tooling/make_brand_assets.py)
manifest.webmanifest  PWA — start_url = setup.html (so the installed app/PWA opens the GAME, not the landing page)
```
Data flow: `worlds/<id>.json → logic.js (validate+index+rules)`; `config.js` supplies players;
each renderer draws the same data. `resolveMove(pos, roll, world) → {landed, to, hit, won, bounced}`
is the one function every renderer animates (`hit` carries the snake/ladder `meaning`).
Full file map + gotchas: the `sopana-game` skill's `references/architecture.md`.

---

## Themes + characters + asset inventory (as of v1.6.0)
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
- **First-run lobby tour** — a coach-mark overlay (`web/js/onboarding.js`) that spotlights each lobby
  step (theme → mode → players → **name field** → Begin) for new players; auto-runs once (localStorage
  `sopana.tour.v1`), keyboard + click friendly, and replayable via a floating "❔" button.
- **Landing / launch page** — `web/index.html` is a marketing launch page (hero gameplay recording,
  three modes, four worlds, feature grid, Play + direct-latest-APK CTAs, OG/Twitter cards). A
  Capacitor-native guard + the manifest `start_url` keep the installed app / PWA opening straight into
  the game, so no game endpoint is lost.
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

## Model context (AI models + endpoints)
All generation runs on **Azure AI Foundry** (resource `ai-contosohub530569751908`, an **AIServices S0**
in `rg-contosohub`), authenticated with **AAD** (`az login`; keys disabled — bearer from
`az account get-access-token --resource https://cognitiveservices.azure.com`). The endpoint/resource IDs
are **identifiers, not secrets**; never commit tokens/keys.

| Model | Where / how | Produces |
|---|---|---|
| **gpt-image-2** | `…/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview` (the v1 route → `unknown_model`; rate-limits ~3 parallel, 429 → retry) | `board.png`, `token.png`, motif `<type>-<from>.png`, cinematic `char-*.png`, brand logo |
| **Sora-2** | `…/openai/v1/videos?api-version=preview` (long-running — run detached) | per-theme `intro.mp4` opening films |
| **Azure neural TTS** | Speech `…/cognitiveservices/v1`; **DragonHD** multilingual voices via each world's `voice.azure` (e.g. `en-IN-Arjun`/`en-IN-Neerja:DragonHDLatestNeural`); Web-Speech fallback in-app | narrated meanings `audio/<type>-<from>.mp3` |

**Runtime makes no model calls** — narration is the prerecorded mp3 (→ Web-Speech fallback) and music is a
composed loop (`gen_theme_music.py`, numpy+ffmpeg) or procedural Web Audio (moksha drone). The landing-page
gameplay clips are **recorded, not generated**: `tooling/record_gameplay.mjs` (Playwright → ffmpeg).
Art-direction for the image/video/voice prompts lives in dicts inside each `tooling/gen_*.py`
(`STYLE/TOKEN/BOARD/MOTIF`, `CHARS`, music composers, intro prompts) — **add a theme = add its entries there**.

---

## Build / run / test / QA
```bash
npm run serve        # dev server → http://localhost:5173 (scripts/serve.mjs)
npm test             # node:test: logic + dom.smoke (jsdom loads board.html) + assets-sync (19 tests)
node tooling/qa_full.mjs   # Playwright: console/page errors, responsive overflow (mobile/tablet/desktop/TV),
                           # lobby a11y, per-theme screenshots. Launch WebGL with --use-gl=swiftshader.
node tooling/record_gameplay.mjs   # re-record the landing-page Board/Cinematic/3D clips (needs `npm run serve`)
```
Android emulator QA: SDK at `%LOCALAPPDATA%\Android\Sdk`, AVD `actioncut_test` (android-34).
`adb reverse tcp:5173 tcp:5173` + device Chrome tests the dev build on-device. **Emulator GPU is
a slow software renderer** (WebGL frame times up to minutes) — a black 3D canvas for seconds is
the emulator, not a bug.

---

## Publishing
- **Web:** `.github/workflows/pages.yml` deploys `web/` to Pages. Enabled once via
  `gh api --method POST repos/naveenneog/Sopana/pages -f build_type=workflow`. `web/index.html` is the
  **launch/landing page**; the game itself stays at `setup.html`/`board.html`/`cinematic.html`/`play3d.html`.
- **APK:** `.github/workflows/apk.yml` wraps `web/` with **Capacitor 7** → `gradlew assembleDebug`.
  **CRITICAL: CI must use JDK 21** (`actions/setup-java@v4`, `java-version:"21"`); JDK 17 fails
  `invalid source release: 21`. `capacitor.config.json` appId = `com.naveenneog.sopana`. The workflow
  publishes both `Sopana-vX.Y.Z.apk` **and** a stable `Sopana.apk` (permalink
  `releases/latest/download/Sopana.apk`); the landing page's Android button resolves the **actual latest
  APK asset** via the GitHub API (`/releases/latest`), falling back to the versioned direct URL.
- **Release:** `gh release create vX.Y.Z ...` triggers the APK build; asset `Sopana-vX.Y.Z.apk`.

---

## Version history
- **First-run lobby onboarding** — `web/js/onboarding.js` adds a spotlight coach-mark tour over the
  lobby (`setup.html`): a centered welcome, then steps that highlight the theme grid, mode pills, player
  count, the **name input** and the Begin button (dark scrim + gold-ring hole + tooltip with Back/Next/Skip,
  progress dots, keyboard + click-to-advance). Auto-runs once (`localStorage sopana.tour.v1`), replayable via
  a floating "❔" button. `setup.js` fires a `sopana:lobby-ready` event once its controls render.
- **Landing page (Pages, no release/APK change)** — `web/index.html` became a full launch/landing page:
  a hero **gameplay recording** plus **per-mode video clips** — `tooling/record_gameplay.mjs` drives Board
  (moksha), Cinematic (panchatantra) and 3D (habits) through a virtue-ladder + vice-serpent Meaning Reveal
  (Playwright records WebM → ffmpeg MP4 + poster; a one-shot `Math.random` override controls only the die).
  The "three ways to play" Cinematic & 3D cards **autoplay their clips** (IntersectionObserver plays only
  when on-screen). Also: the four worlds, a feature grid, and **Play + direct-latest-APK** buttons (APK href
  resolved to the real asset via the GitHub API). Media in `web/assets/media/`. `apk.yml` now also ships a
  stable `Sopana.apk`. The installed app / PWA still open the game (Capacitor-native guard + manifest `start_url`).
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
- **v1.6.0** — **Mobile-friendliness pass** (tested on-device, UX-designer lens): board is the
  hero on phones (compact ellipsised header, hidden subtitle, `board-wrap = min(96vw,62vh)`),
  all touch targets ≥44px (`.ctrl`/`.ctrl select`/`.pill`/`nav a`/HUD buttons), safe-area insets
  (`viewport-fit=cover` + `env(safe-area-inset-*)`), `touch-action: manipulation` + no tap
  highlight, HUD scrims, and Cinematic/3D `#title`/`#status` moved clear of the fixed nav
  (media queries at END of each `<style>`). New harness `tooling/qa_mobile.mjs` (5 phone
  viewports). Addresses SOP-10 (board-small on mobile).
- **v1.7.0** — **Brand identity / new logo**: a gpt-image-2 "monogram-S" mark — a golden serpent
  forming an **S** with ladder rungs (Sopāna = "ladder of ascent") on near-black. Master at
  `web/assets/brand/logo.png`. `tooling/gen_logo.py` generated 5 concepts; `tooling/make_brand_assets.py`
  derives every size deterministically (luma-keys the mark off its near-black bg, then recomposes):
  web favicon + apple-touch + PWA `icon-192/512` + transparent `logo-mark.png`, and the Capacitor
  `assets/` source (`icon-only`, `icon-foreground`, `icon-background`, `splash`, `splash-dark`).
  `manifest.webmanifest` added + head links on all pages; lobby leads with the emblem, board topbar
  shows the mark (replaces the `॥`). `apk.yml` now runs `@capacitor/assets generate --android` after
  `cap add` so the APK icon + splash are the new logo (was the default Capacitor icon).
- **v1.8.0** — **3D performance + full-view fix**: the 3D board was laggy and cut off on phones.
  Collapsed ~220 draw calls → **14**: 100 tile meshes → one `InstancedMesh` (per-instance colour),
  100 number sprites → one baked atlas texture on a single plane, ~19 markers → one `InstancedMesh`;
  dropped the dynamic `PointLight`; clamped `devicePixelRatio` to 1.5 + no MSAA on mobile. **Fit-to-
  viewport camera** (`fitRadius`, aspect-aware, fov 55) so the whole board shows on portrait (was a
  vertical-fov crop), a more top-down default on phones (`presetPhi`) so the square board fills the
  screen, widened fog, and **pinch-to-zoom** (1-finger orbit / 2-finger pinch). `window.__sl3d.rendererInfo()`
  now returns `{calls,tris}`. Verified via Playwright (`tooling/_qa3d.mjs`): 14 calls, full board on
  all viewports, roll works, no errors.

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
9. **3D perf (`play3d.js`)**: keep the board as **InstancedMesh** (tiles/markers) + **one baked
   numbers atlas** (not 100 sprites); mobile uses `dpr ≤ 1.5`, no MSAA, 3 lights. Camera must
   **`fitRadius`** to the viewport (fov is *vertical* — portrait crops without it). Target ~14 draw
   calls; check with `window.__sl3d.rendererInfo()`. **Emulator AVD renders WebGL far too slowly
   (software GPU) — a black 3D canvas there is NOT a bug**; QA 3D with Playwright (`tooling/_qa3d.mjs`).

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
