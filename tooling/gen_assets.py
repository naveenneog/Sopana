"""Generate real art (gpt-image-2) and voice (Azure Neural TTS) for a Sopana world.

Art  -> web/assets/<id>/img/{board,token,<type>-<from>}.png   (downscaled PNG)
Voice-> web/assets/<id>/audio/<type>-<from>.mp3               (narrated meaning)
Also writes web/assets/<id>/manifest.json listing what exists.

Usage:
  python gen_assets.py --world moksha --smoke          # 1 image + 1 audio (validate)
  python gen_assets.py --world moksha --art --voice     # full run
  python gen_assets.py --world moksha --only token,snake-99
  add --force to regenerate existing files.

Auth: AAD via `az account get-access-token` (cognitiveservices scope). Run `az login`.
"""
import argparse
import base64
import io
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import azure_speech  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORLDS = ROOT / "web" / "worlds"
ASSETS = ROOT / "web" / "assets"
ENDPOINT = "https://ai-contosohub530569751908.cognitiveservices.azure.com"
IMG_URI = f"{ENDPOINT}/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview"
CS_SCOPE = "https://cognitiveservices.azure.com"

# ---- art direction ---------------------------------------------------------

STYLE = {
    "moksha": (
        "Authentic Togalu Gombeyaata Karnataka leather shadow-puppet art: a single flat "
        "ornate hand-cut translucent leather puppet with delicate perforated filigree, "
        "backlit by a warm oil-lamp glow in amber, ochre, deep crimson and gold, set against "
        "a solid near-black background, centered and symmetrical, sacred folk-art mood. "
        "No text, no words, no watermark, no border."
    ),
    "habits": (
        "Bright cheerful modern kids' storybook illustration, bold rounded shapes, clean flat "
        "vector style, vivid friendly colors, soft shadows, plain white background, a single "
        "centered subject, wholesome and playful. No text, no words, no watermark."
    ),
}

TOKEN = {
    "moksha": "The puppet depicts a serene pilgrim devotee with folded hands in anjali and a walking staff, a game piece for a spiritual board game.",
    "habits": "A happy friendly child-hero mascot with a big smile and a little cape, a cute game piece for a kids' board game.",
}

BOARD = {
    "moksha": ("A dark ornate temple backdrop for a board game: a symmetrical stepped pyramid "
               "(sopana) rising to a glowing sanctum at the top, a Togalu shadow-puppet border of "
               "oil lamps and lotuses, deep near-black with soft amber glow, muted low-contrast "
               "toward the centre so a grid stays readable. No text."),
    "habits": ("A bright cheerful board-game backdrop: soft pastel sky with fluffy clouds and a "
               "winding path leading up to a big golden star at the top, playful and airy, "
               "low-contrast toward the centre so a grid stays readable. No text."),
}

# motif per virtue (ladder) / vice (snake), keyed by the manifest `name`
MOTIF = {
    "moksha": {
        # virtues
        "Shraddha": "a single glowing oil lamp (diya) with a steady upright flame",
        "Daana": "two open hands offering grain and coins in a gesture of giving",
        "Vinaya": "a gracefully bowing figure beside a humble lotus bud",
        "Satya": "an upright figure holding a perfectly straight staff and a balance scale",
        "Kshama": "an open palm releasing a white dove, a gesture of letting go",
        "Tapas": "a seated ascetic in deep meditation with an inner flame at the heart",
        "Jnana": "a radiant sage holding a palm-leaf manuscript, wisdom light at the brow",
        # vices (serpents)
        "Moha": "a coiling serpent with misty fog wreathing its clouded eyes",
        "Mada": "a swaying serpent beside a toppled spilling vessel",
        "Matsara": "a serpent glaring sidelong with envy at another",
        "Steya": "a serpent coiled tightly around a stolen bundle",
        "Asatya": "a forked-tongued serpent behind a deceptive mask",
        "Krodha": "a fierce hooded cobra with bared fangs wreathed in angry flames",
        "Lobha": "a serpent coiled greedily around a heap of gold coins",
        "Ahankara": "a serpent rearing arrogantly high wearing a proud crown",
        "Kama": "an alluring serpent entwined with a lotus and a heart motif",
    },
    "habits": {
        "Sharing": "a smiling child happily handing a toy to a friend",
        "Brushing teeth": "a cheerful child brushing sparkly clean teeth",
        "Saying sorry": "two children hugging and making up kindly",
        "Helping out": "a proud child tidying toys into a box",
        "Eating veggies": "a happy child cheerfully eating colorful vegetables",
        "Reading": "a delighted child reading an open picture book",
        "Kindness": "a kind child helping a friend stand up",
        "Screen time": "a tired child slumped staring at a glowing tablet",
        "Fibbing": "a child smiling nervously with fingers crossed behind their back",
        "No breakfast": "a child with an empty plate and a grumbly tummy",
        "Messiness": "a child in a very messy room full of scattered toys",
        "Teasing": "a child gently reminded not to tease, looking sorry",
        "Staying up": "a sleepy child yawning awake at night under the moon",
        "Wasting food": "a child dropping good food into a bin, looking unsure",
        "Forgetting": "a child forgetting to say thank you, hand on head",
    },
}


def entry_prompt(world_id, entry, kind):
    motif = MOTIF.get(world_id, {}).get(entry["name"])
    concept = motif or f'the idea of {entry.get("en") or entry["name"]}'
    if world_id == "moksha":
        role = ("symbolising the virtue of" if kind == "ladder"
                else "a serpent symbolising the vice of")
        mood = "radiant and uplifting" if kind == "ladder" else "ominous and cautionary"
        return (f"{STYLE['moksha']} The puppet depicts {concept}, {role} "
                f'{entry.get("en") or entry["name"]}. {mood.capitalize()} composition.')
    role = "a good habit" if kind == "ladder" else "a habit to avoid"
    return f"{STYLE['habits']} The illustration shows {concept} — {role}."


# ---- image generation ------------------------------------------------------

_token = {"val": None, "at": 0.0}


def get_token(force=False):
    if force or not _token["val"] or (time.time() - _token["at"]) > 2400:
        _token["val"] = subprocess.run(
            ["az", "account", "get-access-token", "--resource", CS_SCOPE,
             "--query", "accessToken", "-o", "tsv"],
            capture_output=True, text=True, shell=True).stdout.strip()
        _token["at"] = time.time()
        if not _token["val"]:
            raise RuntimeError("No AAD token. Run `az login`.")
    return _token["val"]


def gen_image(prompt, out_png, size="1024x1024", target=512):
    body = json.dumps({"model": "gpt-image-2", "prompt": prompt, "n": 1, "size": size}).encode()
    for attempt in range(1, 9):
        req = urllib.request.Request(IMG_URI, data=body, method="POST")
        req.add_header("Authorization", f"Bearer {get_token()}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                data = json.loads(r.read())
            b64 = data["data"][0].get("b64_json")
            if not b64:
                print(f"  no b64 for {out_png.name}")
                return False
            img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
            if target and img.width > target:
                img = img.resize((target, target), Image.LANCZOS)
            out_png.parent.mkdir(parents=True, exist_ok=True)
            img.save(out_png, "PNG")
            print(f"  OK img {out_png.name} ({out_png.stat().st_size} bytes)")
            time.sleep(6)
            return True
        except urllib.error.HTTPError as e:
            msg = e.read()[:200]
            if e.code == 401:
                get_token(force=True)
                continue
            if e.code == 429:
                wait = min(20 + attempt * 10, 75)
                print(f"  429 {out_png.name} attempt {attempt} -> {wait}s")
                time.sleep(wait)
                continue
            print(f"  HTTP {e.code} {out_png.name}: {msg!r}")
            time.sleep(5)
        except Exception as e:  # noqa: BLE001
            print(f"  ERR {out_png.name}: {e}")
            time.sleep(5)
    return False


def gen_audio(text, out_mp3, voice, style=None):
    ok = azure_speech.synth(text, str(out_mp3), voice=voice, style=style)
    if not ok and style:  # some voices reject a style; retry plain
        ok = azure_speech.synth(text, str(out_mp3), voice=voice, style=None)
    return ok


# ---- orchestration ---------------------------------------------------------

def entries(world):
    for l in world.get("ladders", []):
        yield "ladder", l
    for s in world.get("snakes", []):
        yield "snake", s


def key_of(kind, entry):
    return f"{kind}-{entry['from']}"


def run(world_id, do_art, do_voice, only, force, smoke):
    world = json.loads((WORLDS / f"{world_id}.json").read_text(encoding="utf-8"))
    base = ASSETS / world_id
    img_dir, aud_dir = base / "img", base / "audio"
    img_dir.mkdir(parents=True, exist_ok=True)
    aud_dir.mkdir(parents=True, exist_ok=True)
    voice = (world.get("voice") or {}).get("azure") or "en-IN-PrabhatNeural"
    style = (world.get("voice") or {}).get("style")

    only = set(only) if only else None

    def want(k):
        return only is None or k in only

    made = {"img": [], "audio": []}

    if smoke:
        # one image (token) + one audio (first entry) to validate the pipeline
        if do_art or not do_voice:
            p = img_dir / "token.png"
            if gen_image(TOKEN[world_id] + " " + STYLE[world_id], p, target=512):
                made["img"].append("token.png")
        kind, e = next(entries(world))
        if do_voice or not do_art:
            out = aud_dir / f"{key_of(kind, e)}.mp3"
            if gen_audio(e["meaning"], out, voice, style):
                made["audio"].append(out.name)
        _write_manifest(base, img_dir, aud_dir)
        print(f"SMOKE done: {made}")
        return

    if do_art:
        for name, prompt, target in (
            ("board.png", BOARD[world_id], 768),
            ("token.png", TOKEN[world_id] + " " + STYLE[world_id], 512),
        ):
            k = name.split(".")[0]
            p = img_dir / name
            if want(k) and (force or not p.exists()):
                gen_image(prompt if name == "board.png" else prompt, p, target=target)
        for kind, e in entries(world):
            k = key_of(kind, e)
            p = img_dir / f"{k}.png"
            if want(k) and (force or not p.exists()):
                gen_image(entry_prompt(world_id, e, kind), p, target=512)

    if do_voice:
        for kind, e in entries(world):
            k = key_of(kind, e)
            out = aud_dir / f"{k}.mp3"
            if want(k) and (force or not out.exists()):
                gen_audio(e["meaning"], out, voice, style)

    _write_manifest(base, img_dir, aud_dir)
    print("DONE", world_id)


def _write_manifest(base, img_dir, aud_dir):
    manifest = {
        "img": sorted(p.name for p in img_dir.glob("*.png")),
        "audio": sorted(p.name for p in aud_dir.glob("*.mp3")),
    }
    (base / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--world", default="moksha")
    ap.add_argument("--art", action="store_true")
    ap.add_argument("--voice", action="store_true")
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    do_art, do_voice = args.art, args.voice
    if not (do_art or do_voice):  # default: both
        do_art = do_voice = True
    only = [s.strip() for s in args.only.split(",") if s.strip()]
    run(args.world, do_art, do_voice, only, args.force, args.smoke)


if __name__ == "__main__":
    main()
