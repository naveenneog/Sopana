"""Compose theme-appropriate looping music beds for Sopana (numpy + ffmpeg).

Moksha keeps its procedural drone (per user); this generates real melodic loops for
the other themes so the cinematic no longer just buzzes. Additive synthesis (band-
limited), light percussion and a cheap comb reverb; the loop tail wraps into the head
so it repeats seamlessly. Output: web/assets/<world>/music.mp3

Usage: python tooling/gen_theme_music.py [founders panchatantra habits]
"""
import pathlib
import subprocess
import sys
import wave

import numpy as np

SR = 44100
ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / "web" / "assets"

A4 = 440.0


def hz(semi_from_a4):
    return A4 * (2 ** (semi_from_a4 / 12.0))


# scale-degree (semitone) tables
MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19]
PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]


def adsr(n, a=0.01, d=0.08, s=0.7, r=0.2):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(1, n - a_n - d_n - r_n)
    env = np.concatenate([
        np.linspace(0, 1, a_n, endpoint=False),
        np.linspace(1, s, d_n, endpoint=False),
        np.full(s_n, s),
        np.linspace(s, 0, r_n),
    ])
    if len(env) < n:
        env = np.concatenate([env, np.zeros(n - len(env))])
    return env[:n]


def tone(freq, dur, harmonics, env, vib=0.0, vib_hz=5.0, detune=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * freq * t
    if vib:
        ph = ph + vib * np.sin(2 * np.pi * vib_hz * t)
    sig = np.zeros(n)
    for k, amp in enumerate(harmonics, start=1):
        sig += amp * np.sin(k * ph)
    if detune:
        for k, amp in enumerate(harmonics, start=1):
            sig += amp * 0.5 * np.sin(k * ph * (1 + detune))
    sig /= max(1e-6, sum(harmonics) * (1.5 if detune else 1.0))
    return sig * env


PAD = [1, 0.5, 0.3, 0.2, 0.12]
FLUTE = [1, 0.28, 0.12, 0.05]
PLUCK = [1, 0.6, 0.4, 0.25, 0.15]
SQR = [1, 0, 1 / 3, 0, 1 / 5, 0, 1 / 7, 0, 1 / 9]   # band-limited square
SAWH = [1 / k for k in range(1, 9)]                  # band-limited saw
BASS = [1, 0.5, 0.28, 0.15]


def kick(dur=0.16):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 120 * np.exp(-t * 30) + 45
    env = np.exp(-t * 22)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env


def hat(dur=0.06, lvl=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = np.random.randn(n)
    noise = noise - np.convolve(noise, np.ones(8) / 8, mode="same")  # crude high-pass
    return noise * np.exp(-t * 60) * lvl


def snare(dur=0.18):
    n = int(dur * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 22) * 0.5
    noise = np.random.randn(n) * np.exp(-t * 18) * 0.6
    return body + noise


def tabla(dur=0.18, low=True):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if low:
        f = 150 * np.exp(-t * 18) + 80
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 16) * 0.8
    return (np.sin(2 * np.pi * 320 * t) * np.exp(-t * 26)
            + np.random.randn(n) * np.exp(-t * 40) * 0.3)


def comb_reverb(x, taps=((0.037, 0.28), (0.053, 0.2), (0.071, 0.14), (0.097, 0.1))):
    out = x.copy()
    for dl, g in taps:
        d = int(dl * SR)
        pad = np.zeros(d)
        out += g * np.concatenate([pad, x])[: len(x)]
    return out


class Track:
    def __init__(self, seconds, tail=1.6):
        self.tail = int(tail * SR)
        self.n = int(seconds * SR)
        self.buf = np.zeros(self.n + self.tail)

    def add(self, at, sig, gain=1.0):
        i = int(at * SR)
        j = min(len(self.buf), i + len(sig))
        self.buf[i:j] += sig[: j - i] * gain

    def finish(self, reverb=0.25):
        if reverb:
            wet = comb_reverb(self.buf)
            self.buf = (1 - reverb) * self.buf + reverb * wet
        # wrap the tail (decays/reverb) back into the head for a seamless loop
        head = self.buf[: self.n].copy()
        head[: self.tail] += self.buf[self.n: self.n + self.tail]
        peak = np.max(np.abs(head)) or 1.0
        head = head / peak * 0.9
        return np.tanh(head * 1.1)  # gentle soft-clip


def compose_founders():
    bpm = 112
    beat = 60 / bpm
    bars = 16
    T = Track(bars * 4 * beat)
    root = -3  # A below A4 region; use A3 = -12? keep bright
    prog = [0, 7, 9, 5]  # I V vi IV (semitone roots rel to key)
    key = 0  # A4 area handled per layer octave
    scale = MAJOR
    for bar in range(bars):
        chord_root = prog[bar % 4]
        base = at = bar * 4 * beat
        # pad chord (root, third, fifth) two octaves down
        for iv in (0, 4, 7):
            T.add(base, tone(hz(chord_root + iv - 24), 4 * beat, PAD,
                             adsr(int(4 * beat * SR), 0.05, 0.3, 0.75, 0.6), detune=0.004), 0.22)
        # bass on beats
        for b in range(4):
            T.add(base + b * beat, tone(hz(chord_root - 24), beat * 0.9, BASS,
                                        adsr(int(beat * 0.9 * SR), 0.005, 0.05, 0.7, 0.2)), 0.5)
        # arpeggio (eighths) up the chord
        arp = [0, 4, 7, 12, 7, 4, 7, 12]
        for e in range(8):
            T.add(base + e * beat / 2, tone(hz(chord_root + arp[e]), beat / 2, SAWH,
                                            adsr(int(beat / 2 * SR), 0.005, 0.06, 0.5, 0.12)), 0.16)
        # drums
        T.add(base, kick(), 0.9)
        T.add(base + 2 * beat, kick(), 0.9)
        T.add(base + beat, snare(), 0.4)
        T.add(base + 3 * beat, snare(), 0.4)
        for e in range(8):
            T.add(base + e * beat / 2, hat(lvl=0.35), 0.5)
    return T.finish(reverb=0.22)


def compose_panchatantra():
    bpm = 88
    beat = 60 / bpm
    bars = 12
    T = Track(bars * 4 * beat)
    scale = PENTA
    # soft tanpura drone (tonic + fifth), sustained across the whole loop
    total = bars * 4 * beat
    T.add(0, tone(hz(-24), total, [1, 0.4, 0.2], adsr(int(total * SR), 0.6, 0.6, 0.85, 0.8)), 0.12)
    T.add(0, tone(hz(-24 + 7), total, [1, 0.35, 0.18], adsr(int(total * SR), 0.8, 0.6, 0.8, 0.8)), 0.09)
    # a gentle bansuri melody (pentatonic phrase), varied per phrase
    phrases = [
        [(0, 1), (2, 1), (4, 2), (2, 1), (0, 1), (4, 2)],
        [(7, 1), (4, 1), (2, 2), (4, 1), (2, 1), (0, 2)],
        [(4, 1), (7, 1), (9, 2), (7, 1), (4, 1), (2, 2)],
    ]
    at = 0.0
    for bar in range(bars):
        base = bar * 4 * beat
        ph = phrases[(bar // 2) % len(phrases)] if bar % 2 == 0 else None
        if ph:
            t = base
            for deg, beats in ph:
                dur = beats * beat
                T.add(t, tone(hz(deg), dur, FLUTE, adsr(int(dur * SR), 0.06, 0.1, 0.8, 0.25),
                              vib=0.18, vib_hz=5.5), 0.3)
                t += dur
        # plucked accompaniment on beats 1 and 3
        for b in (0, 2):
            T.add(base + b * beat, tone(hz(-12 + scale[bar % 3]), beat, PLUCK,
                                        adsr(int(beat * SR), 0.005, 0.12, 0.4, 0.3)), 0.22)
        # gentle tabla groove
        T.add(base, tabla(low=True), 0.6)
        T.add(base + 1.5 * beat, tabla(low=False), 0.5)
        T.add(base + 2 * beat, tabla(low=True), 0.5)
        T.add(base + 3 * beat, tabla(low=False), 0.5)
        T.add(base + 3.5 * beat, tabla(low=False), 0.35)
    return T.finish(reverb=0.3)


def compose_habits():
    bpm = 120
    beat = 60 / bpm
    bars = 16
    T = Track(bars * 4 * beat)
    scale = MAJOR
    prog = [0, 5, 7, 0]  # I IV V I bright
    melody = [0, 4, 7, 4, 5, 7, 9, 7, 0, 4, 7, 12, 9, 7, 4, 2]
    for bar in range(bars):
        base = bar * 4 * beat
        cr = prog[bar % 4]
        # square bass
        for b in range(4):
            T.add(base + b * beat, tone(hz(cr - 24), beat * 0.9, SQR,
                                        adsr(int(beat * 0.9 * SR), 0.004, 0.05, 0.6, 0.1)), 0.28)
        # bouncy square lead (two notes/bar from the melody)
        for e, deg in enumerate([melody[bar % len(melody)], melody[(bar * 2 + 1) % len(melody)]]):
            T.add(base + e * 2 * beat, tone(hz(cr + deg), beat * 1.6, SQR,
                                            adsr(int(beat * 1.6 * SR), 0.004, 0.08, 0.5, 0.25),
                                            vib=0.05, vib_hz=6), 0.24)
        # eighth-note chip arp sparkle
        for e in range(8):
            deg = [0, 7, 4, 12][e % 4]
            T.add(base + e * beat / 2, tone(hz(cr + deg + 12), beat / 4, [1, 0, 1 / 3],
                                            adsr(int(beat / 4 * SR), 0.002, 0.03, 0.3, 0.05)), 0.08)
        # peppy drums
        T.add(base, kick(), 0.9)
        T.add(base + 2 * beat, kick(), 0.9)
        T.add(base + beat, snare(0.14), 0.45)
        T.add(base + 3 * beat, snare(0.14), 0.45)
        for e in range(8):
            T.add(base + e * beat / 2, hat(0.04, lvl=0.3), 0.5)
    return T.finish(reverb=0.16)


COMPOSERS = {
    "founders": compose_founders,
    "panchatantra": compose_panchatantra,
    "habits": compose_habits,
}


def write_mp3(samples, out_mp3):
    out_mp3.parent.mkdir(parents=True, exist_ok=True)
    wav_path = out_mp3.with_suffix(".wav")
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
                    "-codec:a", "libmp3lame", "-b:a", "128k", str(out_mp3)], check=True)
    wav_path.unlink(missing_ok=True)
    print(f"OK {out_mp3.relative_to(ASSETS)} ({out_mp3.stat().st_size} bytes)", flush=True)


def main():
    worlds = [a for a in sys.argv[1:] if not a.startswith("--")] or list(COMPOSERS.keys())
    np.random.seed(7)
    for w in worlds:
        fn = COMPOSERS.get(w)
        if not fn:
            print(f"no composer for {w}"); continue
        print(f"composing {w}...", flush=True)
        write_mp3(fn(), ASSETS / w / "music.mp3")
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
