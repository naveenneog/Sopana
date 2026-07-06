"""Generate the Sopana intro cinematic with Azure Sora-2 (Togalu shadow-puppet style).

AAD auth only (keys disabled) via `az login`. Writes web/assets/intro.mp4.
Usage: python tooling/gen_intro.py [seconds]   # seconds in {4,8,12}, default 8
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
OUT = ROOT / "web" / "assets" / "intro.mp4"

PROMPT = (
    "Authentic Togalu Gombeyaata Karnataka leather shadow-puppet animation, backlit by a warm "
    "oil-lamp glow in amber, ochre and crimson against deep black. An oil lamp flickers to life; "
    "its light reveals a great ornate stone staircase (sopana) rising step by step into the darkness "
    "toward a distant golden sanctum. A slender leather-puppet pilgrim with folded hands and a walking "
    "staff stands at the foot of the stairs and takes his first upward step; each step lights up with a "
    "warm glow as he touches it, and embers drift upward. Intricate perforated filigree, translucent "
    "leather textures, hand-crafted Karnataka folk art, veena and mridangam musical mood. Slow reverent "
    "camera push-in. Sacred and mythic, the beginning of a soul's ascent to liberation. "
    "No text, no words, no watermark."
)

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


def main():
    seconds = sys.argv[1] if len(sys.argv) > 1 else "8"
    size = "1280x720"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.with_suffix(".prompt.txt").write_text(PROMPT, encoding="utf-8")

    vid = None
    while vid is None:
        try:
            with req("POST", f"{ENDPOINT}/openai/v1/videos?api-version={API_VERSION}",
                     {"model": MODEL, "prompt": PROMPT, "seconds": seconds, "size": size}) as r:
                vid = json.loads(r.read())["id"]
                log(f"submitted -> {vid}")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                log("429 on submit; backoff 45s"); time.sleep(45)
            elif e.code in (401, 403):
                _tok["v"] = None; time.sleep(2)
            else:
                raise RuntimeError(f"submit failed {e.code}: {e.read()[:300]!r}")

    deadline = time.time() + 1800
    while True:
        if time.time() > deadline:
            raise TimeoutError("intro did not complete in time")
        try:
            with req("GET", f"{ENDPOINT}/openai/v1/videos/{vid}?api-version={API_VERSION}") as r:
                s = json.loads(r.read())
            st = s.get("status")
            if st == "completed":
                with req("GET", f"{ENDPOINT}/openai/v1/videos/{vid}/content?api-version={API_VERSION}") as r:
                    OUT.write_bytes(r.read())
                log(f"DONE {OUT} ({OUT.stat().st_size} bytes)")
                return
            if st == "failed":
                raise RuntimeError(f"failed: {s.get('error')}")
            log(f"status={st} progress={s.get('progress', '?')}")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                _tok["v"] = None
            else:
                log(f"poll error {e.code}")
        time.sleep(10)


if __name__ == "__main__":
    main()
