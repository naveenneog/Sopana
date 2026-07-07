"""Generate Sopana logo/app-icon concepts with gpt-image-2 (AAD auth).

Sopana (सोपान) = "staircase / ladder of ascent" — the brand of a themed
Snakes & Ladders (Moksha Patam) game. These are ICON MARKS (no text) so the
chosen one can serve as the Android launcher icon, favicon, splash and a
landing-page emblem.

Palette: warm amber-gold (#e8a33d / #ffd98a) on near-black (#0a0603).

Writes tooling/_logo/logo-<slug>.png (full 1024, gitignored via tooling/_*).

Usage:
  python tooling/gen_logo.py [slug ...] [--force] [--size 1024x1024]
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
OUT = ROOT / "tooling" / "_logo"
ENDPOINT = "https://ai-contosohub530569751908.cognitiveservices.azure.com"
IMG_URI = f"{ENDPOINT}/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview"
CS_SCOPE = "https://cognitiveservices.azure.com"

PALETTE = (
    "warm amber, ochre, gold and honey tones (#e8a33d, #ffd98a) glowing against a deep "
    "near-black background (#0a0603) with a soft warm radial vignette"
)

FRAME = (
    "Design as a premium mobile app icon: a single bold centered emblem that fills a rounded-square "
    "frame, clean silhouette that stays legible at small sizes, gentle firelit rim-glow. "
    f"{PALETTE}. No text, no words, no letters, no watermark, no border outline, no UI, flat vector-"
    "meets-heritage look."
)

# slug -> concept description
CONCEPTS = {
    "serpent-ladder": (
        "A golden ladder rising vertically intertwined with a single elegant coiled serpent whose body "
        "spirals around the rungs — the essence of snakes and ladders — enclosed in a subtle ornate "
        "circular medallion with delicate Indian filigree"
    ),
    "stair-lotus": (
        "A stylised golden stepped staircase (sopana) ascending toward a radiant blooming lotus / soft "
        "flame of moksha glowing at the very top, rays of light behind it, an emblem of the ascent to "
        "liberation"
    ),
    "monogram-s": (
        "A single bold iconic letterform-like mark shaped as a serpent whose sinuous body doubles as the "
        "rungs of a ladder, forming a clean minimal S-curve emblem, modern heritage, strong negative space"
    ),
    "temple-medallion": (
        "An ornate temple-arch medallion (Togalu Gombeyaata leather-shadow-puppet filigree) enclosing a "
        "small golden ladder and a coiled serpent, with three dice-pip dots as a subtle motif, richly "
        "decorative and mythic"
    ),
    "ascending-steps": (
        "A minimal powerful mark of three golden ascending steps rising left-to-right that transform into "
        "a rising serpent's head at the top, dynamic upward motion, a clean confident geometric emblem"
    ),
}

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


def gen_image(prompt, out_png, size="1024x1024"):
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
            out_png.parent.mkdir(parents=True, exist_ok=True)
            img.save(out_png, "PNG")
            log(f"  OK {out_png.name} ({out_png.stat().st_size} bytes, {img.width}x{img.height})")
            time.sleep(4)
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
    size = "1024x1024"
    if "--size" in args:
        size = args[args.index("--size") + 1]
    slugs = [a for a in args if not a.startswith("--") and a != size] or list(CONCEPTS.keys())
    total = ok = 0
    for slug in slugs:
        desc = CONCEPTS.get(slug)
        if not desc:
            log(f"unknown slug {slug}; options: {', '.join(CONCEPTS)}"); continue
        out = OUT / f"logo-{slug}.png"
        total += 1
        if out.exists() and not force:
            log(f"{slug} exists; skip"); ok += 1; continue
        prompt = f"{desc}. {FRAME}"
        log(f"generating logo-{slug}")
        if gen_image(prompt, out, size):
            ok += 1
    log(f"DONE {ok}/{total}  -> {OUT}")


if __name__ == "__main__":
    main()
