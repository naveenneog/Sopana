"""Generate per-character cinematic sprites with gpt-image-2 (AAD auth).

Each character in every world gets its own backlit figure on a near-black
background (so it glows under the cinematic's ADD blend on any theme), matching
the character's description + the world's art style.

Writes web/assets/<world>/img/char-<id>.png  (downscaled RGBA PNG).

Usage:
  python tooling/gen_char_sprites.py [world ...] [--force]
"""
import base64
import io
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORLDS = ROOT / "web" / "worlds"
ASSETS = ROOT / "web" / "assets"
ENDPOINT = "https://ai-contosohub530569751908.cognitiveservices.azure.com"
IMG_URI = f"{ENDPOINT}/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview"
CS_SCOPE = "https://cognitiveservices.azure.com"

# per-world visual style for a backlit shadow-theatre figure
STYLE = {
    "moksha": (
        "Authentic Togalu Gombeyaata Karnataka leather shadow-puppet: a flat ornate hand-cut "
        "translucent leather puppet with delicate perforated filigree, backlit by a warm oil-lamp "
        "glow in amber, ochre, crimson and gold"
    ),
    "founders": (
        "A sleek modern figure rendered as a glowing backlit silhouette with cool neon-teal and "
        "emerald rim light and faint circuit-line filigree, clean and professional"
    ),
    "panchatantra": (
        "A warm Indian folk-art figure (Pattachitra / Mysore style) as a backlit puppet with a "
        "gentle golden rim light, earthy ochre, indigo and leaf-green tones, storybook mood"
    ),
    "habits": (
        "A cheerful rounded kids'-storybook hero as a glowing backlit figure with a bright warm "
        "sunrise rim light, bold friendly shapes"
    ),
}

# character-id -> visual description (keys must match world.json characters[].id)
CHARS = {
    "moksha": {
        "pilgrim": "a serene pilgrim devotee standing with folded hands in anjali and a tall walking staff",
        "sage": "a venerable long-bearded sage seer standing, holding an open palm-leaf manuscript",
        "devotee": "a devout worshipper standing with both hands raised in prayer beside a small oil lamp",
        "wanderer": "a lone wandering ascetic walking with a cloth bundle tied to a staff over the shoulder",
    },
    "founders": {
        "founder": "a confident young founder in a hoodie holding up a glowing lightbulb of an idea",
        "engineer": "a focused engineer standing with a laptop, faint floating lines of code around",
        "designer": "a creative designer standing holding a glowing artist's colour palette and stylus",
        "investor": "a poised investor in a suit standing holding a small glowing briefcase",
    },
    "panchatantra": {
        "lion": "a noble majestic lion standing proudly in profile-forward pose",
        "monkey": "a clever monkey sitting upright holding a round fruit, alert and mischievous",
        "turtle": "a wise old tortoise standing on its four legs, calm and ancient",
        "crow": "a sleek clever black crow standing tall with a small pebble in its beak",
        "deer": "a graceful alert deer standing, head raised, delicate antlers",
    },
    "habits": {
        "runner": "a cheerful kid hero in running gear mid-stride with a little flowing cape",
        "reader": "a happy kid hero standing holding a glowing open picture book",
        "sprout": "a joyful kid hero standing holding up a glowing little green sprout in a pot",
        "star": "a beaming kid hero standing holding up a bright glowing star",
    },
}

COMMON = (
    "A single centered full-body figure facing the viewer, standing on nothing, no ground, no shadow, "
    "solid deep near-black background, subtle warm backlight and rim glow around the figure so it reads "
    "as a backlit shadow-theatre game piece. No text, no words, no watermark, no border, no frame."
)

_tok = {"v": None, "t": 0.0}


def token(force=False):
    if force or not _tok["v"] or time.time() - _tok["t"] > 2400:
        _tok["v"] = subprocess.run(
            ["az", "account", "get-access-token", "--resource", CS_SCOPE,
             "--query", "accessToken", "-o", "tsv"],
            capture_output=True, text=True, shell=True).stdout.strip()
        _tok["t"] = time.time()
        if not _tok["v"]:
            raise RuntimeError("no AAD token; run `az login`")
    return _tok["v"]


def log(m):
    print(f"{time.strftime('%H:%M:%S')} {m}", flush=True)


def gen_image(prompt, out_png, size="1024x1024", target=512):
    body = json.dumps({"model": "gpt-image-2", "prompt": prompt, "n": 1, "size": size}).encode()
    for attempt in range(1, 9):
        req = urllib.request.Request(IMG_URI, data=body, method="POST")
        req.add_header("Authorization", f"Bearer {token()}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                data = json.loads(r.read())
            b64 = data["data"][0].get("b64_json")
            if not b64:
                log(f"  no b64 for {out_png.name}"); return False
            img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
            if target and img.width > target:
                img = img.resize((target, target), Image.LANCZOS)
            out_png.parent.mkdir(parents=True, exist_ok=True)
            img.save(out_png, "PNG")
            log(f"  OK {out_png.relative_to(ASSETS)} ({out_png.stat().st_size} bytes)")
            time.sleep(5)
            return True
        except urllib.error.HTTPError as e:
            msg = e.read()[:200]
            if e.code == 401:
                token(force=True); continue
            if e.code == 429:
                wait = min(20 + attempt * 10, 75)
                log(f"  429 {out_png.name} attempt {attempt} -> {wait}s"); time.sleep(wait); continue
            log(f"  HTTP {e.code} {out_png.name}: {msg!r}"); time.sleep(5)
        except Exception as e:  # noqa: BLE001
            log(f"  ERR {out_png.name}: {e}"); time.sleep(5)
    return False


def main():
    args = sys.argv[1:]
    force = "--force" in args
    worlds = [a for a in args if not a.startswith("--")] or list(CHARS.keys())
    total = ok = 0
    for w in worlds:
        style = STYLE.get(w, STYLE["moksha"])
        for cid, desc in CHARS.get(w, {}).items():
            out = ASSETS / w / "img" / f"char-{cid}.png"
            total += 1
            if out.exists() and not force:
                log(f"[{w}] char-{cid} exists; skip"); ok += 1; continue
            prompt = f"{style}. The figure depicts {desc}. {COMMON}"
            log(f"[{w}] generating char-{cid}")
            if gen_image(prompt, out):
                ok += 1
    log(f"DONE {ok}/{total}")


if __name__ == "__main__":
    main()
