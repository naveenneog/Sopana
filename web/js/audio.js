// Procedural game audio (Web Audio API), now with per-theme sound design.
// Each theme selects a SOUND_PROFILE (scale, timbres, SFX flavour, reverb) so the
// score/SFX feel native to the world. Call audio.setProfile(id) BEFORE resume().
// No audio assets; safe no-op if Web Audio is unavailable.

const PROFILES = {
  // Original — a temple raga (Bhūpāli) on a bowed drone; veena-like plucks, long reverb.
  moksha: {
    scale: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21], base: 261.63,
    drone: 'sawtooth', droneVoices: (sa) => [sa, sa * 1.002, sa * 2 ** (7 / 12), sa * 2],
    pluck: { a: 'triangle', b: 'sine', ratio: 2, bGain: 0.3 },
    pad: 'triangle', filterBase: 400, filterStep: 520, reverb: { dur: 1.8, decay: 2.4, wet: 0.5 },
    serpent: 'hiss', dice: 'wood', motif: [0, 2, 4, 5, 7],
  },
  // Founder's Climb — a bright synth score; square/saw plucks, tight cleaner reverb, glitch SFX.
  founders: {
    scale: [0, 2, 4, 7, 9, 11, 12, 14, 16, 19], base: 293.66,
    drone: 'sawtooth', droneVoices: (sa) => [sa, sa * 1.004, sa * 2 ** (7 / 12) * 1.001, sa * 2 ** (4 / 12)],
    pluck: { a: 'square', b: 'sawtooth', ratio: 1, bGain: 0.18 },
    pad: 'sawtooth', filterBase: 700, filterStep: 700, reverb: { dur: 0.9, decay: 1.6, wet: 0.28 },
    serpent: 'glitch', dice: 'blip', motif: [0, 4, 7, 9, 11],
  },
  // Panchatantra Trail — a warm folk pentatonic; soft tanpura drone, plucky sitar, woody reverb.
  panchatantra: {
    scale: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21], base: 246.94,
    drone: 'triangle', droneVoices: (sa) => [sa, sa * 1.001, sa * 2 ** (7 / 12), sa * 2],
    pluck: { a: 'triangle', b: 'triangle', ratio: 2, bGain: 0.22 },
    pad: 'triangle', filterBase: 450, filterStep: 420, reverb: { dur: 1.4, decay: 2.0, wet: 0.4 },
    serpent: 'boing', dice: 'wood', motif: [0, 2, 4, 2, 4, 7],
  },
  // Habit Heroes — a playful chiptune major; light square pad, bleepy plucks, comic buzzer SFX.
  habits: {
    scale: [0, 2, 4, 5, 7, 9, 11, 12, 14, 16], base: 329.63,
    drone: 'square', droneVoices: (sa) => [sa * 2, sa * 2 * 2 ** (4 / 12)],
    pluck: { a: 'square', b: 'square', ratio: 2, bGain: 0.15 },
    pad: 'square', filterBase: 900, filterStep: 500, reverb: { dur: 0.5, decay: 1.2, wet: 0.18 },
    serpent: 'buzzer', dice: 'blip', motif: [0, 2, 4, 7, 4, 7],
  },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this._padStarted = false;
    this.p = PROFILES.moksha;
    this.bedUrl = null;
    this.hasBed = false;
    this.bedEl = null;
  }

  // choose the theme's sound design (before resume)
  setProfile(id) {
    if (!this.started) this.p = PROFILES[id] || PROFILES.moksha;
  }

  // a looping generated music track for this theme; when set, the constant
  // procedural drone/pad is suppressed (event SFX still play). Call before resume().
  setBed(url) {
    if (!this.started) { this.bedUrl = url || null; this.hasBed = !!url; }
  }

  resume() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) this._build();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (!this.started) { this._startDrone(); this.setRealm(0); this.started = true; }
      this._startBed();
    } catch { /* no audio available */ }
  }

  _startBed() {
    if (!this.bedUrl || this.bedEl || !this.ctx) return;
    try {
      const el = new Audio(this.bedUrl);
      el.loop = true;
      el.preload = 'auto';
      this.bedEl = el;
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain();
      g.gain.value = 0.42; // sit under the narration/SFX
      src.connect(g).connect(this.master);
      this.bedGain = g;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    } catch { /* media element source unavailable */ }
  }

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(this.p.reverb.dur, this.p.reverb.decay);
    const rev = ctx.createGain();
    rev.gain.value = this.p.reverb.wet;
    this.reverb.connect(rev).connect(this.master);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 500;
    this.droneGain.connect(this.droneFilter);
    this.droneFilter.connect(this.master);
    this.droneFilter.connect(this.reverb);

    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padGain.connect(this.master);
    this.padGain.connect(this.reverb);
  }

  _impulse(dur, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  _noise(dur) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _startDrone() {
    if (this.hasBed) return; // the generated music bed replaces the constant drone
    const ctx = this.ctx, t = ctx.currentTime;
    const sa = this.p.base / 2;
    const gain = this.p.drone === 'square' ? 0.05 : 0.11; // squares are loud
    for (const f of this.p.droneVoices(sa)) {
      const o = ctx.createOscillator();
      o.type = this.p.drone;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.droneGain);
      o.start();
    }
    this.droneGain.gain.setValueAtTime(0, t);
    this.droneGain.gain.linearRampToValueAtTime(this.p.drone === 'square' ? 0.32 : 0.5, t + 3);
  }

  // adaptive score: brighter drone + fuller pad as you ascend the realms (0..4)
  setRealm(i) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneFilter.frequency.linearRampToValueAtTime(this.p.filterBase + i * this.p.filterStep, t + 1.5);
    this.padGain.gain.linearRampToValueAtTime(Math.min(0.24, i * 0.06), t + 1.5);
    if (!this._padStarted && !this.hasBed) {
      const b = this.p.base;
      for (const f of [b, b * 2 ** (4 / 12), b * 2 ** (7 / 12)]) {
        const o = this.ctx.createOscillator();
        o.type = this.p.pad;
        o.frequency.value = f * 2;
        const g = this.ctx.createGain();
        g.gain.value = this.p.pad === 'square' ? 0.04 : 0.08;
        o.connect(g).connect(this.padGain);
        o.start();
      }
      this._padStarted = true;
    }
  }

  _pluck(freq, when = 0, dur = 0.5, gain = 0.25) {
    const ctx = this.ctx, t = ctx.currentTime + when, pk = this.p.pluck;
    const o = ctx.createOscillator(); o.type = pk.a; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = pk.b; o2.frequency.value = freq * pk.ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = pk.bGain;
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(this.master); g.connect(this.reverb);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  _freq(step) {
    const s = this.p.scale;
    return this.p.base * 2 ** (s[((step % s.length) + s.length) % s.length] / 12);
  }

  stepNote(n) {
    if (!this.ctx) return;
    this._pluck(this._freq(n - 1), 0, this.p.pluck.a === 'square' ? 0.4 : 0.6, 0.2);
  }

  ladderGliss() {
    if (!this.ctx) return;
    for (let i = 0; i < 8; i++) this._pluck(this._freq(i), i * 0.05, 0.4, 0.16);
  }

  // a short per-theme melodic phrase, played on a win
  fanfare() {
    if (!this.ctx) return;
    const m = this.p.motif || [0, 2, 4, 7];
    m.forEach((d, i) => this._pluck(this._freq(d), i * 0.16, 0.55, 0.22));
    const top = m[m.length - 1] || 7;
    [0, 2, 4].forEach((d) => this._pluck(this._freq(top + d), m.length * 0.16, 1.3, 0.15));
  }

  diceRattle() {
    if (!this.ctx) return;
    if (this.p.dice === 'blip') { for (let i = 0; i < 5; i++) this._pluck(this._freq(3 + i) * 2, i * 0.07, 0.08, 0.12); return; }
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noise(0.6);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.master);
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.09 + Math.random() * 0.03;
      g.gain.setValueAtTime(0.22, tt);
      g.gain.exponentialRampToValueAtTime(0.001, tt + 0.05);
    }
    src.start(t); src.stop(t + 0.7);
  }

  diceClack() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = this.p.dice === 'blip' ? 520 : 190;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.15);
  }

  serpentHiss() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, kind = this.p.serpent;
    if (kind === 'boing') {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(this.p.base, t); o.frequency.exponentialRampToValueAtTime(this.p.base / 3, t + 0.6);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 18; const lg = ctx.createGain(); lg.gain.value = 22;
      lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(g).connect(this.master); o.start(t); lfo.start(t); o.stop(t + 0.75); lfo.stop(t + 0.75);
      return;
    }
    if (kind === 'buzzer') {
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(320, t); o.frequency.linearRampToValueAtTime(120, t + 0.5);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.linearRampToValueAtTime(0.001, t + 0.55);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.6);
      return;
    }
    if (kind === 'glitch') {
      for (let i = 0; i < 5; i++) {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 900 - i * 150;
        const g = ctx.createGain(); const tt = t + i * 0.055;
        g.gain.setValueAtTime(0.14, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.045);
        o.connect(g).connect(this.master); o.start(tt); o.stop(tt + 0.06);
      }
      const src = ctx.createBufferSource(); src.buffer = this._noise(0.25);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 6;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.12, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      src.connect(bp).connect(ng).connect(this.master); src.start(t); src.stop(t + 0.26);
      return;
    }
    // default: airy hiss (moksha / snakes)
    const src = ctx.createBufferSource(); src.buffer = this._noise(1.0);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(3200, t); hp.frequency.linearRampToValueAtTime(1200, t + 0.9);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.9);
    src.connect(hp).connect(g).connect(this.master); src.start(t); src.stop(t + 1.0);
  }

  serpentBoom() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (this.p.serpent === 'buzzer') { // soft comic bonk instead of a heavy boom
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.35); return;
    }
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.7);
    const src = ctx.createBufferSource(); src.buffer = this._noise(0.2);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.28, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(ng).connect(this.master); src.start(t); src.stop(t + 0.2);
  }

  realmSwell() {    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = this.p.drone === 'square' ? 'square' : 'sawtooth'; o.frequency.value = this.p.base / 2;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.linearRampToValueAtTime(3000, t + 1.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(this.p.drone === 'square' ? 0.18 : 0.28, t + 0.6); g.gain.linearRampToValueAtTime(0, t + 1.8);
    o.connect(f).connect(g).connect(this.master); g.connect(this.reverb); o.start(t); o.stop(t + 1.9);
  }

  isEnabled() { return this.enabled; }

  _applyMute() {
    if (!this.master || !this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.enabled ? 0.85 : 0.0, t + 0.08);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.resume();
    this._applyMute();
    return this.enabled;
  }
}

export const audio = new AudioEngine();
