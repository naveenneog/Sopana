"""Render per-theme Sopana intro cinematics with Azure Sora-2 (AAD auth).

Writes web/assets/<world>/intro.mp4 for each requested theme, sequentially
(to avoid concurrency 429s). Skips a theme whose intro already exists unless
--force is passed.

Usage:
  python tooling/gen_intro_themes.py [world ...] [--seconds 8] [--force]
  python tooling/gen_intro_themes.py              # all themed intros below
"""
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

ENDPOINT = "https://ai-contosohub530569751908.cognitiveservices.azure.com"
API_VERSION = "preview"
MODEL = "sora-2"
CS_SCOPE = "https://cognitiveservices.azure.com"
ROOT = pathlib.Path(__file__).resolve().parents[1]

PROMPTS = {
    "founders": (
        "Sleek modern cinematic 3D-motion-graphics title sequence. A vast staircase of glowing "
        "glass-and-light steps rises through a dark studio void toward a brilliant teal-green beacon "
        "at the summit. Each step ignites with cool neon-teal and emerald light and a soft ripple of "
        "circuit-line patterns as it is touched. A confident young founder in a dark hoodie begins the "
        "climb, taking the first upward step; wireframe charts, rising graph lines and particles of light "
        "drift upward around them. Clean minimal futuristic aesthetic, volumetric glow, shallow depth of "
        "field, slow inspiring camera push-in. Ambitious and uplifting, the beginning of a startup ascent. "
        "No text, no words, no logos, no watermark."
    ),
    "panchatantra": (
        "Warm Indian folk-art storybook animation in the style of Pattachitra and Mysore painting, hand-"
        "painted textures, ochre, indigo, leaf-green and terracotta palette. A winding forest path of "
        "stone steps climbs past a great spreading banyan tree toward a golden dawn. Gentle fable animals "
        "gather at the foot of the path — a noble lion, a clever monkey, a wise turtle and a black crow — "
        "as a little painted figure takes the first step upward and each step lights with a soft warm glow. "
        "Fireflies and blossoms drift upward. Bansuri flute and tabla musical mood, storybook and whimsical, "
        "slow gentle camera push-in, the beginning of a moral tale. No text, no words, no watermark."
    ),
    "habits": (
        "Bright cheerful modern flat-illustration motion-graphics title sequence, sunrise palette of "
        "coral, sunshine-yellow, sky-blue and mint green, clean rounded shapes and soft shadows. A tall "
        "ladder of glowing habit-steps rises toward a bright rising sun; each rung shows a friendly icon — "
        "a sunrise, a book, a running shoe, a water drop, a green sprout — and lights up cheerfully when "
        "touched. A young energetic hero in bright clothes starts to climb upward with a big smile; sparkles "
        "and confetti drift up. Upbeat playful energy, bouncy and motivational, smooth camera push-in, the "
        "beginning of a hero's journey of good habits. No text, no words, no watermark."
    ),
}

_tok = {"v": None, "t": 0.0}


def token():
    if not _tok["v"] or time.time() - _tok["t"] > 2400:
        _tok["v"] = subprocess.run(
            ["az", "account", "get-access-token", "--resource", CS_SCOPE,
             "--query", "accessToken", "-o", "tsv"],
            capture_output=True, text=True, shell=True).stdout.strip()
        _tok["t"] = time.time()
        if not _tok["v"]:
            raise RuntimeError("no AAD token; run `az login`")
    return _tok["v"]


def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {token()}")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    return urllib.request.urlopen(r, timeout=180)


def log(m):
    print(f"{time.strftime('%H:%M:%S')} {m}", flush=True)


def render(world, prompt, seconds):
    out = ROOT / "web" / "assets" / world / "intro.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.with_suffix(".prompt.txt").write_text(prompt, encoding="utf-8")
    size = "1280x720"

    vid = None
    while vid is None:
        try:
            with req("POST", f"{ENDPOINT}/openai/v1/videos?api-version={API_VERSION}",
                     {"model": MODEL, "prompt": prompt, "seconds": seconds, "size": size}) as r:
                vid = json.loads(r.read())["id"]
                log(f"[{world}] submitted -> {vid}")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                log(f"[{world}] 429 on submit; backoff 45s"); time.sleep(45)
            elif e.code in (401, 403):
                _tok["v"] = None; time.sleep(2)
            else:
                raise RuntimeError(f"[{world}] submit failed {e.code}: {e.read()[:300]!r}")

    deadline = time.time() + 1800
    while True:
        if time.time() > deadline:
            raise TimeoutError(f"[{world}] intro did not complete in time")
        try:
            with req("GET", f"{ENDPOINT}/openai/v1/videos/{vid}?api-version={API_VERSION}") as r:
                s = json.loads(r.read())
            st = s.get("status")
            if st == "completed":
                with req("GET", f"{ENDPOINT}/openai/v1/videos/{vid}/content?api-version={API_VERSION}") as r:
                    out.write_bytes(r.read())
                log(f"[{world}] DONE {out} ({out.stat().st_size} bytes)")
                return
            if st == "failed":
                raise RuntimeError(f"[{world}] failed: {s.get('error')}")
            log(f"[{world}] status={st} progress={s.get('progress', '?')}")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                _tok["v"] = None
            else:
                log(f"[{world}] poll error {e.code}")
        time.sleep(10)


def main():
    args = [a for a in sys.argv[1:]]
    force = "--force" in args
    seconds = "8"
    if "--seconds" in args:
        i = args.index("--seconds"); seconds = args[i + 1]; del args[i:i + 2]
    worlds = [a for a in args if not a.startswith("--")] or list(PROMPTS.keys())

    for w in worlds:
        if w not in PROMPTS:
            log(f"[{w}] no prompt defined; skipping"); continue
        out = ROOT / "web" / "assets" / w / "intro.mp4"
        if out.exists() and not force:
            log(f"[{w}] already exists ({out.stat().st_size} bytes); skip (use --force)"); continue
        render(w, PROMPTS[w], seconds)
    log("ALL DONE")


if __name__ == "__main__":
    main()
