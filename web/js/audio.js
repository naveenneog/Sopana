// Procedural game audio (Web Audio API) — raga step-notes, an adaptive drone that
// brightens per realm, and synthesized SFX. No audio assets; safe no-op if unavailable.

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // Raga Bhūpāli, ascending over two octaves
const BASE = 261.63; // C4 tonic (Sa)

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this._padStarted = false;
  }

  resume() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) this._build();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (!this.started) { this._startDrone(); this.setRealm(0); this.started = true; }
    } catch { /* no audio available */ }
  }

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.8, 2.4);
    const rev = ctx.createGain();
    rev.gain.value = 0.5;
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
    const ctx = this.ctx, t = ctx.currentTime;
    const sa = BASE / 2; // C3
    const pa = sa * 2 ** (7 / 12); // G3
    for (const f of [sa, sa * 1.002, pa, sa * 2]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.11;
      o.connect(g).connect(this.droneGain);
      o.start();
    }
    this.droneGain.gain.setValueAtTime(0, t);
    this.droneGain.gain.linearRampToValueAtTime(0.5, t + 3);
  }

  // adaptive score: brighter drone + fuller pad as you ascend the realms (0..4)
  setRealm(i) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneFilter.frequency.linearRampToValueAtTime(400 + i * 520, t + 1.5);
    this.padGain.gain.linearRampToValueAtTime(Math.min(0.24, i * 0.06), t + 1.5);
    if (!this._padStarted) {
      for (const f of [BASE, BASE * 2 ** (4 / 12), BASE * 2 ** (7 / 12)]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f * 2;
        const g = this.ctx.createGain();
        g.gain.value = 0.08;
        o.connect(g).connect(this.padGain);
        o.start();
      }
      this._padStarted = true;
    }
  }

  _pluck(freq, when = 0, dur = 0.5, gain = 0.25) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(this.master); g.connect(this.reverb);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  stepNote(n) {
    if (!this.ctx) return;
    this._pluck(BASE * 2 ** (SCALE[(n - 1) % SCALE.length] / 12), 0, 0.6, 0.2);
  }

  ladderGliss() {
    if (!this.ctx) return;
    for (let i = 0; i < 8; i++) this._pluck(BASE * 2 ** (SCALE[i] / 12), i * 0.05, 0.4, 0.16);
  }

  diceRattle() {
    if (!this.ctx) return;
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
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 190;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.15);
  }

  serpentHiss() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noise(1.0);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(3200, t); hp.frequency.linearRampToValueAtTime(1200, t + 0.9);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.9);
    src.connect(hp).connect(g).connect(this.master); src.start(t); src.stop(t + 1.0);
  }

  serpentBoom() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.7);
    const src = ctx.createBufferSource(); src.buffer = this._noise(0.2);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.28, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(ng).connect(this.master); src.start(t); src.stop(t + 0.2);
  }

  realmSwell() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = BASE / 2;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.linearRampToValueAtTime(3000, t + 1.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.6); g.gain.linearRampToValueAtTime(0, t + 1.8);
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
