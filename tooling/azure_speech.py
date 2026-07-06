"""Azure AI Speech neural TTS via Microsoft Entra (AAD) auth.

Copied into Sopana from the DailyApps voice-dub skill so this project is
self-contained. Keys are disabled on the AIServices resource, so we use the AAD
token format `Authorization: ****** against the regional Speech
endpoint.
"""
import html
import os
import pathlib
import re
import subprocess
import sys
import urllib.error
import urllib.request

REGION = os.environ.get("AZURE_SPEECH_REGION", "eastus2")
RESOURCE_ID = os.environ.get(
    "AZURE_SPEECH_RESOURCE_ID",
    "/subscriptions/e839ff0f-532b-4828-a2b3-8c9a1b719d85/resourceGroups/"
    "rg-contosohub/providers/Microsoft.CognitiveServices/accounts/"
    "ai-contosohub530569751908")
CS_SCOPE = "https://cognitiveservices.azure.com"
ENDPOINT = f"https://{REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
DEFAULT_LANG = os.environ.get("AZURE_SPEECH_LANG", "en-IN")


def _token() -> str:
    tok = subprocess.run(
        ["az", "account", "get-access-token", "--resource", CS_SCOPE,
         "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, shell=True).stdout.strip()
    if not tok:
        raise RuntimeError("No AAD token. Run `az login`.")
    return tok


def build_ssml(text, voice, style=None, styledegree=1.0, rate="0%", pitch="0%",
               lang=DEFAULT_LANG) -> str:
    inner = (f'<prosody rate="{rate}" pitch="{pitch}">{html.escape(text)}</prosody>')
    if style:
        inner = (f'<mstts:express-as style="{style}" styledegree="{styledegree}">'
                 f'{inner}</mstts:express-as>')
    return (f'<speak version="1.0" xmlns:mstts="https://www.w3.org/2001/mstts" '
            f'xml:lang="{lang}"><voice name="{voice}">{inner}</voice></speak>')


def lang_of(voice, default=DEFAULT_LANG):
    """Infer SSML xml:lang from a voice name's locale prefix."""
    m = re.match(r"^([a-z]{2,3}-[A-Z]{2})", voice or "")
    return m.group(1) if m else default


def synth(text, out, voice="en-IN-PrabhatNeural", style=None, styledegree=1.0,
          rate="0%", pitch="0%", fmt="audio-24khz-48kbitrate-mono-mp3", lang=None) -> bool:
    if lang is None:
        lang = lang_of(voice)
    ssml = build_ssml(text, voice, style, styledegree, rate, pitch, lang=lang)
    auth = f"aad#{RESOURCE_ID}#{_token()}"
    req = urllib.request.Request(ENDPOINT, data=ssml.encode("utf-8"), method="POST")
    req.add_header("Authorization", auth)
    req.add_header("Content-Type", "application/ssml+xml")
    req.add_header("X-Microsoft-OutputFormat", fmt)
    req.add_header("User-Agent", "sopana")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            pathlib.Path(out).write_bytes(r.read())
        print(f"OK {out} ({pathlib.Path(out).stat().st_size} bytes)")
        return True
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read()[:500]!r}")
        return False


if __name__ == "__main__":
    a = sys.argv
    synth(a[1], a[2],
          voice=a[3] if len(a) > 3 else "en-IN-PrabhatNeural",
          style=(a[4] or None) if len(a) > 4 else None)
