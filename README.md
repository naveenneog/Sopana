# Sopāna — the ascent

**Snakes & Ladders reimagined** — starting with **"Snake & Ladders — Original"** (the ancient
Indian *Moksha Patam*), where every snake and ladder is a lesson: land on one and it animates,
a card appears, and a narrator **reads its meaning aloud**.

Open the game and you land in the **lobby** (`setup.html`): pick a **theme**, a **mode**,
**1–4 players** and a **character** for each — then play local **pass-and-play multiplayer**.

Three ways to play, all in this repo (served from `web/`):
- **Board** (`board.html`) — the classic 2D board with animated themed snakes and a live
  turn roster; every player gets a coloured token.
- **Cinematic** (`cinematic.html`) — a 2.5D backlit shadow-puppet ascent with a **per-theme
  Sora-2 intro** and an adaptive procedural score.
- **3D** (`play3d.html`) — a real 3D board with **shifting camera angles** (drag to orbit,
  scroll to zoom), a themed environment and player-coloured pawns.

Each **theme** carries its own **art, narration, sound design, intro film and environment**,
and you can switch theme mid-game from any mode. `index.html` redirects into the lobby.

**Play on the web** via GitHub Pages, or **install the Android APK** from the Releases page
(built by CI with Capacitor). Licensed under PolyForm Noncommercial 1.0.0.

## Run

```
npm run serve      # -> http://localhost:5173
```

Must be served over HTTP; opening `web/index.html` via `file://` blocks the `fetch` of the
world JSON.

## Test

```
npm test           # node:test unit suite, zero dependencies
```

## Worlds (data-driven)

Each world is one file in `web/worlds/*.json`:

| File | World | Snakes are… | Ladders are… |
|------|-------|-------------|--------------|
| `moksha.json` | Moksha Path | the vices (Kama, Krodha, Lobha…) | the virtues (Shraddha, Daana, Jnana…) |
| `founders.json` | Founder's Climb | startup pitfalls | startup wins |
| `panchatantra.json` | Panchatantra Trail | follies from the fables | wisdom from the fables |
| `habits.json` | Habit Heroes | kids' bad habits | kids' good habits |

Every snake/ladder entry: `{ "from", "to", "name", "en", "meaning" }`.
`meaning` is the line read aloud on the Meaning Reveal. Add a world = drop in a JSON file
and register it in the picker (`web/index.html`).

## The signature: Meaning Reveal

Land on a snake/ladder → board dims + the connector highlights → a themed card appears with
the **name + one-line teaching** → narrator reads it (browser SpeechSynthesis in this
prototype; Azure Neural TTS pre-rendered in production) with word-by-word highlight →
the token travels the snake/ladder to its destination. Skippable (Esc) and mutable.

## Real art & voice (generated)

Assets live in `web/assets/<world>/` and are generated with Azure (AAD-only via `az login`):

- **Art** — `gpt-image-2` renders the board backdrop, the player-avatar figurine, and one
  illustration per snake/ladder, in each world's art style
  (Moksha = authentic Togalu Gombe leather shadow-puppet).
- **Voice** — Azure Neural TTS narrates each meaning
  (Moksha = `en-IN-Arjun:DragonHDLatestNeural`; Habits = a cheerful child voice).

```
python tooling/gen_assets.py --world moksha --smoke         # validate: 1 image + 1 audio
python tooling/gen_assets.py --world moksha --art --voice   # full run (skips existing)
python tooling/gen_assets.py --world moksha --only snake-99 --force
```

Files are named `<type>-<from>.{png,mp3}` (e.g. `snake-99.png`, `snake-99.mp3`). The app loads
them by convention from `world.assets` and falls back to browser SpeechSynthesis if audio is
missing. `npm test` includes an asset-sync check that every entry has matching art + narration.

## Cinematic mode

`web/cinematic.html` is the 2.5D **backlit shadow-puppet ascent** (PixiJS):

- A **title menu** plays a **Sora-2 intro cinematic** (`web/assets/intro.mp4`, regenerate with
  `python tooling/gen_intro.py`), then reveals the game.
- The pilgrim **walks the winding sopana staircase** step-by-step (each step ignites), the camera
  follows, and a carved die tumbles at the side.
- Landing on a virtue/vice triggers an **animated set-piece** — a ladder **light-sweep** or a
  serpent **strike with screen-shake** — with the narrated meaning.
- The 100 steps span **five lokas (realms)**; crossing one plays a **shadow-screen curtain wipe**
  with a realm title and a palette shift. A **reflection journal** collects the teachings.
- **Procedural sound** (`web/js/audio.js`, Web Audio API): a raga (Bhūpāli) so climbing the steps
  plays an ascending melody, an adaptive drone that brightens per realm, and SFX (die rattle,
  ladder harp-gliss, serpent hiss + boom, realm swell). 🔊 toggle in the HUD.

Visual QA is automated with Playwright: `node tooling/shoot.mjs` → `tooling/_shots/`.

## Roadmap

- **M0** web prototype (this) + shared schema ✅
- **M1** Flutter port → Android / iOS / Web / Android TV, with `gpt-image-2` board art &
  figurines and Azure TTS narration; Rive animations
- **M2** widget/integration tests, signed builds, GitHub Pages web build
- **M3** worlds 2–4 (Founder's Climb, Panchatantra Trail) — data + assets only
- **M4** multiplayer, cloud save, localization (hi/kn/ta/te/de)
- **M5** TV modes (Android TV; Apple TV via native shell)
