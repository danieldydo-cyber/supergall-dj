/**
 * Shared Web Audio graph: master bus, analyser, destination.
 * D DJ Pro Fly · Daniel Dydo · Kraków
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterAnalyser = null;
    this.crossfaderGainA = null;
    this.crossfaderGainB = null;
    this.fxBus = null;
    this.fxReturn = null;
    this._started = false;
    this.onStateChange = null; // (state) => void — iOS suspend/resume
  }

  async ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.ctx.addEventListener('statechange', () => {
      if (this.onStateChange) this.onStateChange(this.ctx.state);
    });
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;

    this.crossfaderGainA = this.ctx.createGain();
    this.crossfaderGainB = this.ctx.createGain();
    this.crossfaderGainA.gain.value = 1;
    this.crossfaderGainB.gain.value = 1;

    this.fxBus = this.ctx.createGain();
    this.fxBus.gain.value = 1;
    this.fxReturn = this.ctx.createGain();
    this.fxReturn.gain.value = 1;

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.masterAnalyser.smoothingTimeConstant = 0.7;

    this.crossfaderGainA.connect(this.fxBus);
    this.crossfaderGainB.connect(this.fxBus);
    this.fxBus.connect(this.fxReturn);
    this.fxReturn.connect(this.masterGain);
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    this._started = true;
    // Mobile / Chrome: context often starts suspended until resume() in gesture
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) {}
    }
    return this.ctx;
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Crossfader: -1 = full A, 0 = center, +1 = full B (equal-power) */
  setCrossfader(pos) {
    if (!this.crossfaderGainA) return;
    const x = Math.max(-1, Math.min(1, pos));
    const a = Math.cos(((x + 1) / 2) * (Math.PI / 2));
    const b = Math.sin(((x + 1) / 2) * (Math.PI / 2));
    this.crossfaderGainA.gain.setTargetAtTime(a, this.currentTime, 0.01);
    this.crossfaderGainB.gain.setTargetAtTime(b, this.currentTime, 0.01);
  }

  setMasterVolume(v) {
    if (!this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.currentTime, 0.02);
  }

  deckInput(deckId) {
    return deckId === 'A' ? this.crossfaderGainA : this.crossfaderGainB;
  }

  /** 0..1 rough bass energy for beat pulse UI + MilkDrop kick detect */
  getBassEnergy() {
    return this.getBandEnergies().bass;
  }

  /**
   * Split master analyser into bass / mid / high (0..1).
   * Reuses one FFT buffer — hook for shark swim + UI pulse.
   */
  getBandEnergies() {
    if (!this.masterAnalyser) return { bass: 0, mid: 0, high: 0, energy: 0 };
    if (!this._bassBuf) this._bassBuf = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(this._bassBuf);
    const buf = this._bassBuf;
    const len = buf.length;
    const avg = (a, b) => {
      const end = Math.min(len, b);
      const start = Math.min(len, Math.max(0, a));
      if (end <= start) return 0;
      let s = 0;
      for (let i = start; i < end; i++) s += buf[i];
      return s / ((end - start) * 255);
    };
    // fftSize 2048 → ~1024 bins; ~21.5 Hz/bin @ 44.1k
    const bass = avg(0, 24);       // ~0–500 Hz
    const mid = avg(24, 120);      // ~500–2.5k
    const high = avg(120, 360);    // ~2.5k–8k
    const energy = bass * 0.5 + mid * 0.3 + high * 0.2;
    return { bass, mid, high, energy };
  }

  /** Fill shared FFT buffer; return 0..1 mean over [lo, hi) bins */
  getBandEnergy(lo, hi) {
    if (!this.masterAnalyser) return 0;
    if (!this._bassBuf) this._bassBuf = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(this._bassBuf);
    const len = this._bassBuf.length;
    const a = Math.max(0, Math.min(lo, len));
    const b = Math.max(a + 1, Math.min(hi, len));
    let s = 0;
    for (let i = a; i < b; i++) s += this._bassBuf[i];
    return s / ((b - a) * 255);
  }

  getMidEnergy() {
    return this.getBandEnergy(24, 96);
  }

  getHighEnergy() {
    return this.getBandEnergy(96, Math.min(256, (this._bassBuf || { length: 128 }).length || 128));
  }

}
