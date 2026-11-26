// Original synthesised sounds: engine hum, wind, ring chime, touchdown and crash.
// Everything is WebAudio; no audio files are loaded.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windGain = null;
    this.windSrc = null;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine: two detuned saws through a low-pass, pitch follows throttle.
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 62;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 93;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(lp);
    this.engineOsc2.connect(g2);
    g2.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    this.engineOsc2.start();
    // Wind: looped noise through a band-pass, loudness follows airspeed.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    this.windSrc = this.ctx.createBufferSource();
    this.windSrc.buffer = buf;
    this.windSrc.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(bp);
    bp.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    this.windSrc.start();
  }

  setEngine(throttle, speed, flying) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const on = flying ? 1 : 0.35;
    this.engineGain.gain.setTargetAtTime(0.05 * on + throttle * 0.05, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(58 + throttle * 66 + speed * 0.35, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(87 + throttle * 99 + speed * 0.5, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.09, Math.max(0, speed - 15) * 0.0016), t, 0.15);
  }

  blip(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  ring() {
    this.blip(660, 0.35, 'sine', 0.2);
    this.blip(990, 0.45, 'sine', 0.16, 0.09);
    this.blip(1320, 0.5, 'sine', 0.1, 0.18);
  }

  touchdown() {
    this.blip(90, 0.3, 'sine', 0.3);
    this.blip(180, 0.2, 'triangle', 0.15, 0.05);
  }

  crash() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.7;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.4;
    src.connect(g);
    g.connect(this.ctx.destination);
    src.start(t);
    this.blip(55, 0.6, 'sawtooth', 0.25);
  }

  click() {
    this.blip(880, 0.08, 'square', 0.06);
  }

  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.5, 'triangle', 0.14, i * 0.13));
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.06, t, 0.05);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, t, 0.05);
    }
    return this.muted;
  }
}
