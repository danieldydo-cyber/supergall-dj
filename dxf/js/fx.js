/**
 * Pioneer RMX-1000–style DSP insert on master fxBus.
 * SCENE / ISOLATE / RELEASE FX — audible, BPM-aware, musical.
 * Daniel Dydo · Kraków
 */
export class RmxEffects {
  constructor(engine) {
    this.engine = engine;
    this.active = new Set();
    this._nodes = {};
    this._built = false;
    this.wet = 0.85;
    this.intensity = 0.75;
    this._bpm = 120;
    this._deckGetter = null; // () => Deck | null — selected / master deck for RELEASE FX
    this._latched = new Set();
    this._noiseEnv = null;
    this._transTimer = null;
    this._spiralDir = 1;
    this._spiralRaf = null;
  }

  /** Provide callback returning the deck RELEASE FX should drive */
  setDeckGetter(fn) {
    this._deckGetter = fn;
  }

  async build() {
    if (this._built) return;
    await this.engine.ensure();
    const ctx = this.engine.ctx;

    this.engine.fxBus.disconnect();
    this.input = this.engine.fxBus;
    this.output = this.engine.fxReturn;

    // Dry path
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet sum
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.wetGain.connect(this.output);

    // Insert path for filter/isolate that replace dry when fully engaged
    this.insertGain = ctx.createGain();
    this.insertGain.gain.value = 0;
    this.insertGain.connect(this.output);

    // --- SCENE ---
    this._nodes.echo = this._buildEcho(ctx);
    this._nodes.spiral = this._buildSpiral(ctx);
    this._nodes.reverb = this._buildReverb(ctx);
    this._nodes.noise = this._buildNoise(ctx);
    this._nodes.filter = this._buildFilter(ctx);
    this._nodes.flanger = this._buildFlanger(ctx);

    // --- ISOLATE ---
    this._nodes.isolate = this._buildIsolate(ctx);
    this._nodes.trans = this._buildTrans(ctx);
    this._nodes.roll = this._buildRoll(ctx);

    // --- RELEASE (audio FX side; deck rate handled separately) ---
    this._nodes.echoout = this._buildEchoOut(ctx);

    this._built = true;
  }

  _beatSec(div = 0.5) {
    return (60 / Math.max(40, this._bpm)) * div;
  }

  _buildEcho(ctx) {
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.25;
    const fb = ctx.createGain();
    fb.gain.value = 0.55;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    this.input.connect(delay);
    delay.connect(hp);
    hp.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(wet);
    wet.connect(this.wetGain);
    return {
      wet, delay, fb, lp,
      setBpm: (bpm) => {
        delay.delayTime.setTargetAtTime(60 / bpm * 0.5, ctx.currentTime, 0.04);
      },
    };
  }

  /** Spiral: filtered feedback delay with rising/falling cutoff (RMX spiral feel) */
  _buildSpiral(ctx) {
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.1875;
    const fb = ctx.createGain();
    fb.gain.value = 0.78;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 800;
    filt.Q.value = 4;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    this.input.connect(delay);
    delay.connect(filt);
    filt.connect(fb);
    fb.connect(delay);
    filt.connect(wet);
    wet.connect(this.wetGain);
    return {
      wet, delay, fb, filt,
      setBpm: (bpm) => {
        delay.delayTime.setTargetAtTime(60 / bpm * 0.375, ctx.currentTime, 0.04);
      },
    };
  }

  _buildReverb(ctx) {
    const convolver = ctx.createConvolver();
    convolver.buffer = this._makeImpulse(ctx, 3.2, 2.4);
    const preDelay = ctx.createDelay(0.1);
    preDelay.delayTime.value = 0.028;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 6500;
    const pre = ctx.createGain();
    pre.gain.value = 0.9;
    this.input.connect(pre);
    pre.connect(preDelay);
    preDelay.connect(convolver);
    convolver.connect(tone);
    tone.connect(wet);
    wet.connect(this.wetGain);
    return { wet, convolver, tone };
  }

  _makeImpulse(ctx, duration, decay) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Filtered white noise, gated/ducked by input envelope */
  _buildNoise(ctx) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 2000;
    filt.Q.value = 1.2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;

    const wet = ctx.createGain();
    wet.gain.value = 0;

    // Envelope follower from input → ducks noise when music is loud (sweep feel)
    const follower = ctx.createGain();
    const envFilt = ctx.createBiquadFilter();
    envFilt.type = 'lowpass';
    envFilt.frequency.value = 12;

    // Simple: noise always present when engaged; sweep filter freq on engage
    src.connect(filt);
    filt.connect(noiseGain);
    noiseGain.connect(wet);
    wet.connect(this.wetGain);
    src.start();

    return {
      wet, filt, noiseGain, src,
      engageSweep: (amount) => {
        const t = ctx.currentTime;
        filt.frequency.cancelScheduledValues(t);
        filt.frequency.setValueAtTime(200, t);
        filt.frequency.exponentialRampToValueAtTime(8000, t + 0.9 * amount);
        noiseGain.gain.cancelScheduledValues(t);
        noiseGain.gain.setValueAtTime(0.001, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.35 * amount, t + 0.15);
        noiseGain.gain.exponentialRampToValueAtTime(0.08, t + 1.0);
      },
    };
  }

  /** LP ↔ HP: center = open, left LP, right HP (via dual filters blended) */
  _buildFilter(ctx) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 20000;
    lp.Q.value = 2.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 20;
    hp.Q.value = 2.2;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    // When filter is on we route through LP then HP into insert (replace dry)
    this.input.connect(lp);
    lp.connect(hp);
    hp.connect(wet);
    wet.connect(this.insertGain);
    return { wet, lp, hp };
  }

  _buildFlanger(ctx) {
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.004;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.28;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.0035;
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();
    const fb = ctx.createGain();
    fb.gain.value = 0.55;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    this.input.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.wetGain);
    return { wet, delay, lfo, fb, lfoGain };
  }

  /** Kill Mid / band isolate: deep mid cut + slight side boost */
  _buildIsolate(ctx) {
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 1.4;
    mid.gain.value = 0;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    this.input.connect(mid);
    mid.connect(wet);
    wet.connect(this.insertGain);
    return { wet, mid };
  }

  /** Trans: BPM-synced hard gate tremolo */
  _buildTrans(ctx) {
    const gate = ctx.createGain();
    gate.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    this.input.connect(gate);
    gate.connect(wet);
    wet.connect(this.insertGain);
    return { wet, gate };
  }

  /** Roll / stutter: short delay + high feedback (1/4 or 1/8 beat) */
  _buildRoll(ctx) {
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.125;
    const fb = ctx.createGain();
    fb.gain.value = 0;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    const dryDuck = ctx.createGain();
    dryDuck.gain.value = 1;
    this.input.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.wetGain);
    return {
      wet, delay, fb,
      setBpm: (bpm) => {
        delay.delayTime.setTargetAtTime(60 / bpm / 4, ctx.currentTime, 0.02);
      },
    };
  }

  /** Echo Out: long feedback swell for release FX */
  _buildEchoOut(ctx) {
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4000;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    this.input.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(wet);
    wet.connect(this.wetGain);
    return {
      wet, delay, fb, lp,
      setBpm: (bpm) => {
        delay.delayTime.setTargetAtTime(60 / bpm * 0.75, ctx.currentTime, 0.05);
      },
    };
  }

  setWet(v) {
    this.wet = Math.max(0, Math.min(1, v));
    this._updateMix();
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  setBpm(bpm) {
    this._bpm = Math.max(40, Math.min(250, bpm || 120));
    if (!this._built) return;
    for (const n of Object.values(this._nodes)) {
      if (n?.setBpm) n.setBpm(this._bpm);
    }
  }

  _updateMix() {
    if (!this._built) return;
    const t = this.engine.currentTime;
    const anyWet = [...this.active].some((name) =>
      !['filter', 'isolate', 'trans', 'vinylbrake', 'backspin'].includes(name)
    );
    const anyInsert = [...this.active].some((name) =>
      ['filter', 'isolate', 'trans'].includes(name)
    );
    const wetAmt = anyWet ? this.wet : 0;
    this.wetGain.gain.setTargetAtTime(wetAmt, t, 0.025);
    this.insertGain.gain.setTargetAtTime(anyInsert ? 1 : 0, t, 0.02);
    let dry = 1;
    if (anyInsert) dry = 0.05;
    else if (anyWet) dry = Math.max(0.12, 1 - this.wet * 0.55);
    this.dryGain.gain.setTargetAtTime(dry, t, 0.025);
  }

  _startSpiralSweep() {
    this._stopSpiralSweep();
    const n = this._nodes.spiral;
    if (!n) return;
    const ctx = this.engine.ctx;
    let f = 400;
    this._spiralDir = 1;
    const tick = () => {
      if (!this.active.has('spiral')) return;
      f *= this._spiralDir > 0 ? 1.04 : 0.96;
      if (f > 6000) { f = 6000; this._spiralDir = -1; }
      if (f < 250) { f = 250; this._spiralDir = 1; }
      n.filt.frequency.setTargetAtTime(f, ctx.currentTime, 0.04);
      this._spiralRaf = requestAnimationFrame(tick);
    };
    this._spiralRaf = requestAnimationFrame(tick);
  }

  _stopSpiralSweep() {
    if (this._spiralRaf) {
      cancelAnimationFrame(this._spiralRaf);
      this._spiralRaf = null;
    }
  }

  _startTransGate() {
    this._stopTransGate();
    const n = this._nodes.trans;
    if (!n) return;
    const ctx = this.engine.ctx;
    const beat = 60 / this._bpm;
    const period = beat / 2; // 1/8 notes feel
    const schedule = () => {
      if (!this.active.has('trans')) return;
      const t = ctx.currentTime;
      const open = period * 0.45;
      n.gate.gain.cancelScheduledValues(t);
      n.gate.gain.setValueAtTime(1, t);
      n.gate.gain.setValueAtTime(1, t + open);
      n.gate.gain.linearRampToValueAtTime(0.02, t + open + 0.008);
      n.gate.gain.setValueAtTime(0.02, t + period - 0.004);
      n.gate.gain.linearRampToValueAtTime(1, t + period);
      this._transTimer = setTimeout(schedule, period * 1000);
    };
    schedule();
  }

  _stopTransGate() {
    if (this._transTimer) {
      clearTimeout(this._transTimer);
      this._transTimer = null;
    }
    const n = this._nodes.trans;
    if (n) n.gate.gain.setTargetAtTime(1, this.engine.currentTime, 0.02);
  }

  /**
   * Engage effect. latch=true keeps it on until toggled off.
   * amount 0..1 scales intensity.
   */
  engage(name, amount = 1) {
    if (!this._built) return;
    const amt = Math.max(0.05, Math.min(1, amount * this.intensity));
    const t = this.engine.currentTime;
    const ctx = this.engine.ctx;

    // RELEASE FX that drive the deck
    if (name === 'vinylbrake') {
      this.active.add(name);
      const deck = this._deckGetter?.();
      if (deck?.vinylBrake) deck.vinylBrake(0.9 + amt * 1.1);
      this._updateMix();
      return;
    }
    if (name === 'backspin') {
      this.active.add(name);
      const deck = this._deckGetter?.();
      if (deck?.backspin) deck.backspin(0.35 + amt * 0.35);
      // brief echo tail for musicality
      const eo = this._nodes.echoout;
      if (eo) {
        eo.wet.gain.setTargetAtTime(0.7 * amt, t, 0.01);
        eo.fb.gain.setTargetAtTime(0.72, t, 0.01);
        setTimeout(() => {
          eo.wet.gain.setTargetAtTime(0, this.engine.currentTime, 0.2);
          eo.fb.gain.setTargetAtTime(0, this.engine.currentTime, 0.15);
          this.active.delete('backspin');
          this._updateMix();
        }, 700);
      } else {
        setTimeout(() => { this.active.delete(name); }, 500);
      }
      this._updateMix();
      return;
    }
    if (name === 'echoout') {
      this.active.add(name);
      const n = this._nodes.echoout;
      if (!n) return;
      n.setBpm?.(this._bpm);
      n.fb.gain.cancelScheduledValues(t);
      n.fb.gain.setValueAtTime(0.55, t);
      n.fb.gain.linearRampToValueAtTime(0.88, t + 0.4);
      n.wet.gain.cancelScheduledValues(t);
      n.wet.gain.setTargetAtTime(0.95 * amt, t, 0.03);
      // duck dry for wash-out feel
      this.dryGain.gain.setTargetAtTime(0.25, t, 0.08);
      this.wetGain.gain.setTargetAtTime(this.wet, t, 0.05);
      return;
    }

    const n = this._nodes[name];
    if (!n) return;
    this.active.add(name);

    if (n.wet) {
      n.wet.gain.cancelScheduledValues(t);
      n.wet.gain.setTargetAtTime(
        ['filter', 'isolate', 'trans'].includes(name) ? 1 : Math.min(1, 0.75 + amt * 0.25),
        t,
        0.02
      );
    }

    switch (name) {
      case 'echo':
        n.setBpm?.(this._bpm);
        n.fb.gain.setTargetAtTime(0.45 + amt * 0.35, t, 0.03);
        break;
      case 'spiral':
        n.setBpm?.(this._bpm);
        n.fb.gain.setTargetAtTime(0.7 + amt * 0.2, t, 0.03);
        this._startSpiralSweep();
        break;
      case 'reverb':
        n.tone.frequency.setTargetAtTime(3500 + amt * 4500, t, 0.05);
        break;
      case 'noise':
        n.engageSweep?.(amt);
        break;
      case 'filter': {
        // Start mid-open; knob / hold sweeps LP closed
        const freq = 18000;
        n.lp.frequency.cancelScheduledValues(t);
        n.lp.frequency.setValueAtTime(freq, t);
        n.lp.frequency.exponentialRampToValueAtTime(280, t + 0.75);
        n.hp.frequency.setTargetAtTime(40, t, 0.05);
        break;
      }
      case 'flanger':
        n.fb.gain.setTargetAtTime(0.4 + amt * 0.4, t, 0.04);
        n.lfo.frequency.setTargetAtTime(0.2 + amt * 0.6, t, 0.05);
        n.lfoGain.gain.setTargetAtTime(0.002 + amt * 0.004, t, 0.05);
        break;
      case 'isolate':
        // Kill mid hard
        n.mid.gain.cancelScheduledValues(t);
        n.mid.gain.setTargetAtTime(-28 * amt, t, 0.03);
        break;
      case 'trans':
        this._startTransGate();
        break;
      case 'roll':
        n.setBpm?.(this._bpm);
        n.fb.gain.setTargetAtTime(0.94, t, 0.01);
        // duck dry so stutter dominates
        this.dryGain.gain.setTargetAtTime(0.2, t, 0.02);
        break;
      default:
        break;
    }

    this._updateMix();
  }

  release(name) {
    if (!this._built) return;
    const t = this.engine.currentTime;

    if (name === 'vinylbrake') {
      this.active.delete(name);
      const deck = this._deckGetter?.();
      if (deck?.vinylBrakeRelease) deck.vinylBrakeRelease();
      this._updateMix();
      return;
    }
    if (name === 'backspin') {
      // usually one-shot; ensure cleanup
      this.active.delete(name);
      this._updateMix();
      return;
    }
    if (name === 'echoout') {
      this.active.delete(name);
      const n = this._nodes.echoout;
      if (n) {
        // swell then fade — classic echo-out release
        n.fb.gain.cancelScheduledValues(t);
        n.fb.gain.setValueAtTime(n.fb.gain.value, t);
        n.fb.gain.linearRampToValueAtTime(0.92, t + 0.15);
        n.fb.gain.linearRampToValueAtTime(0, t + 2.2);
        n.wet.gain.cancelScheduledValues(t);
        n.wet.gain.setValueAtTime(n.wet.gain.value, t);
        n.wet.gain.linearRampToValueAtTime(0.9, t + 0.1);
        n.wet.gain.linearRampToValueAtTime(0, t + 2.4);
      }
      this.dryGain.gain.setTargetAtTime(1, t + 0.3, 0.2);
      this._updateMix();
      return;
    }

    if (!this._nodes[name]) return;
    this.active.delete(name);
    const n = this._nodes[name];

    if (n.wet) {
      n.wet.gain.cancelScheduledValues(t);
      n.wet.gain.setTargetAtTime(0, t, 0.06);
    }

    switch (name) {
      case 'echo':
        n.fb.gain.setTargetAtTime(0.35, t, 0.08);
        break;
      case 'spiral':
        this._stopSpiralSweep();
        n.fb.gain.setTargetAtTime(0.2, t, 0.1);
        break;
      case 'roll':
        n.fb.gain.setTargetAtTime(0, t, 0.03);
        break;
      case 'filter':
        n.lp.frequency.cancelScheduledValues(t);
        n.lp.frequency.setTargetAtTime(20000, t, 0.08);
        n.hp.frequency.setTargetAtTime(20, t, 0.08);
        break;
      case 'isolate':
        n.mid.gain.setTargetAtTime(0, t, 0.05);
        break;
      case 'trans':
        this._stopTransGate();
        break;
      case 'flanger':
        n.fb.gain.setTargetAtTime(0.2, t, 0.08);
        break;
      case 'noise':
        if (n.noiseGain) n.noiseGain.gain.setTargetAtTime(0, t, 0.08);
        break;
      default:
        break;
    }

    this._updateMix();
  }

  toggleLatch(name, amount = 1) {
    if (this._latched.has(name)) {
      this._latched.delete(name);
      this.release(name);
      return false;
    }
    this._latched.add(name);
    this.engage(name, amount);
    return true;
  }

  isLatched(name) {
    return this._latched.has(name);
  }

  /** Continuous knobs: filter (-1 LP … 0 open … +1 HP), isolate, intensity */
  setKnob(name, value) {
    if (!this._built || !this._nodes[name]) return;
    const n = this._nodes[name];
    const t = this.engine.currentTime;
    const v = Math.max(0, Math.min(1, value));

    if (name === 'filter') {
      // 0 = open, 0..0.5 = LP close, 0.5..1 = HP open from mid
      if (v < 0.02) {
        if (this.active.has('filter')) this.release('filter');
        return;
      }
      this.active.add('filter');
      n.wet.gain.setTargetAtTime(1, t, 0.03);
      if (v <= 0.5) {
        const x = v / 0.5; // 0..1
        const freq = 80 + Math.pow(1 - x, 2.2) * 18000;
        n.lp.type = 'lowpass';
        n.lp.frequency.setTargetAtTime(Math.max(80, freq), t, 0.03);
        n.hp.frequency.setTargetAtTime(20, t, 0.03);
      } else {
        const x = (v - 0.5) / 0.5;
        const freq = 40 + Math.pow(x, 1.8) * 8000;
        n.lp.frequency.setTargetAtTime(20000, t, 0.03);
        n.hp.frequency.setTargetAtTime(Math.max(40, freq), t, 0.03);
      }
      this._updateMix();
    } else if (name === 'isolate') {
      if (v < 0.02) {
        if (this.active.has('isolate')) this.release('isolate');
        return;
      }
      this.active.add('isolate');
      n.wet.gain.setTargetAtTime(1, t, 0.03);
      // 0..0.5 kill mid, 0.5..1 boost mid isolate
      if (v <= 0.5) {
        n.mid.gain.setTargetAtTime(-v / 0.5 * 30, t, 0.03);
      } else {
        n.mid.gain.setTargetAtTime(((v - 0.5) / 0.5) * 9, t, 0.03);
      }
      this._updateMix();
    }
  }
}
