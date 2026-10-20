/**
 * Single DJ deck: load, play, cue, jog, pitch, EQ, filter, hot cues, loops, waveform.
 */
import { detectBPM, beatDuration, nearestBeat } from './bpm.js';

const PITCH_RANGES = { '8': 0.08, '16': 0.16 };

export class Deck {
  constructor(id, engine) {
    this.id = id; // 'A' | 'B'
    this.engine = engine;
    this.buffer = null;
    this.source = null;
    this.playing = false;
    this.startCtxTime = 0;
    this.pausedAt = 0;
    this.rate = 1;
    this.pitchRange = 0.08;
    this.bpm = 120;
    this.manualBpm = null;
    this.beatOffset = 0;
    this.cuePoint = 0;
    this.hotCues = [null, null, null, null]; // seconds
    this.loop = null; // { start, end } seconds
    this.loopBeats = 0;
    this.rolling = false;
    this._rollSaved = null;
    this.name = '—';
    this.onUpdate = null;

    // Nodes (built in init)
    this.gain = null;
    this.eqHi = null;
    this.eqMid = null;
    this.eqLow = null;
    this.filter = null;
    this.analyser = null;
  }

  async init() {
    if (this.gain) return; // already wired into master bus
    await this.engine.ensure();
    const ctx = this.engine.ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.85;

    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 320;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 0.7;
    this.eqHi = ctx.createBiquadFilter();
    this.eqHi.type = 'highshelf';
    this.eqHi.frequency.value = 3200;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.8;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHi);
    this.eqHi.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(this.engine.deckInput(this.id));
  }

  async loadFile(file) {
    await this.engine.ensure();
    this.stop(true);
    const arr = await file.arrayBuffer();
    this.buffer = await this.engine.ctx.decodeAudioData(arr.slice(0));
    this.name = file.name.replace(/\.[^.]+$/, '');
    this.pausedAt = 0;
    this.cuePoint = 0;
    this.hotCues = [null, null, null, null];
    this.loop = null;
    this.manualBpm = null;
    try {
      this.bpm = detectBPM(this.buffer);
    } catch {
      this.bpm = 120;
    }
    this.beatOffset = 0;
    this._notify();
    return this.buffer;
  }

  get effectiveBpm() {
    return (this.manualBpm || this.bpm) * this.rate;
  }

  get baseBpm() {
    return this.manualBpm || this.bpm;
  }

  get position() {
    if (!this.buffer) return 0;
    if (this.playing && this.source) {
      const elapsed = (this.engine.currentTime - this.startCtxTime) * this.rate;
      let pos = this.pausedAt + elapsed;
      if (this.loop && pos >= this.loop.end) {
        const len = this.loop.end - this.loop.start;
        pos = this.loop.start + ((pos - this.loop.start) % len);
      }
      return Math.min(pos, this.buffer.duration);
    }
    return this.pausedAt;
  }

  _createSource(offset) {
    const ctx = this.engine.ctx;
    if (this.source) {
      try { this.source.stop(); } catch (_) {}
      try { this.source.disconnect(); } catch (_) {}
    }
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.rate;
    src.connect(this.eqLow);
    src.onended = () => {
      if (this.source === src && this.playing) {
        // natural end
        if (this.loop) {
          this._restartLoop();
        } else {
          this.playing = false;
          this.pausedAt = this.buffer.duration;
          this._notify();
        }
      }
    };
    this.source = src;
    const dur = this.buffer.duration - offset;
    if (this.loop && offset < this.loop.end) {
      // schedule loop via setInterval-like check in UI tick; also use loop if short
    }
    src.start(0, Math.max(0, offset));
    this.startCtxTime = ctx.currentTime;
    this.pausedAt = offset;
  }

  _restartLoop() {
    if (!this.loop || !this.buffer) return;
    this._createSource(this.loop.start);
    this.playing = true;
  }

  play() {
    if (!this.buffer) return;
    if (this.playing) return;
    let offset = this.pausedAt;
    if (offset >= this.buffer.duration - 0.01) offset = this.cuePoint || 0;
    if (this.loop && (offset < this.loop.start || offset >= this.loop.end)) {
      offset = this.loop.start;
    }
    this._createSource(offset);
    this.playing = true;
    this._notify();
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.position;
    this.playing = false;
    if (this.source) {
      try { this.source.stop(); } catch (_) {}
      try { this.source.disconnect(); } catch (_) {}
      this.source = null;
    }
    this._notify();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  stop(keepBuffer = false) {
    this.pause();
    this.pausedAt = this.cuePoint || 0;
    if (!keepBuffer) {
      this.buffer = null;
      this.name = '—';
    }
    this._notify();
  }

  /** Cue: if playing → jump to cue & pause; if stopped → play from cue while held semantics via press/release */
  cuePress() {
    if (!this.buffer) return;
    if (this.playing) {
      this.pause();
      this.seek(this.cuePoint);
    } else {
      this.seek(this.cuePoint);
      this.play();
      this._cuePreview = true;
    }
  }

  cueRelease() {
    if (this._cuePreview) {
      this.pause();
      this.seek(this.cuePoint);
      this._cuePreview = false;
    }
  }

  setCueHere() {
    this.cuePoint = this.position;
    this._notify();
  }

  seek(t) {
    const was = this.playing;
    if (was) this.pause();
    this.pausedAt = Math.max(0, Math.min(this.buffer?.duration || 0, t));
    if (was) this.play();
    this._notify();
  }

  /** Jog nudge: seconds delta (small) while playing by rate blip, or seek when paused */
  jog(deltaSec) {
    if (!this.buffer) return;
    if (this.playing && this.source) {
      // temporary rate nudge
      const ctx = this.engine.ctx;
      const base = this.rate;
      const nudge = deltaSec > 0 ? base * 1.08 : base * 0.92;
      this.source.playbackRate.setValueAtTime(nudge, ctx.currentTime);
      this.source.playbackRate.setValueAtTime(base, ctx.currentTime + 0.05);
    } else {
      this.seek(this.position + deltaSec);
    }
  }

  setPitch(normalized) {
    // normalized -1..1 mapped to pitch range
    const n = Math.max(-1, Math.min(1, normalized));
    this.rate = 1 + n * this.pitchRange;
    if (this.source && this.playing) {
      // keep position continuity
      const pos = this.position;
      this.pausedAt = pos;
      this.startCtxTime = this.engine.currentTime;
      this.source.playbackRate.setTargetAtTime(this.rate, this.engine.currentTime, 0.02);
    }
    this._notify();
  }

  setPitchRange(pct) {
    this.pitchRange = PITCH_RANGES[String(pct)] || 0.08;
    this._notify();
  }

  setVolume(v) {
    if (!this.gain) return;
    this.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.engine.currentTime, 0.02);
  }

  setEq(band, db) {
    const node = band === 'hi' ? this.eqHi : band === 'mid' ? this.eqMid : this.eqLow;
    if (!node) return;
    node.gain.setTargetAtTime(Math.max(-24, Math.min(12, db)), this.engine.currentTime, 0.03);
  }

  /** filterKnob 0 = open, 1 = closed LPF extreme; -1..0 could be HPF — we use 0..1 LPF */
  setFilter(amount) {
    if (!this.filter) return;
    const a = Math.max(0, Math.min(1, amount));
    const freq = 80 + Math.pow(1 - a, 2.5) * 19920;
    this.filter.frequency.setTargetAtTime(freq, this.engine.currentTime, 0.03);
  }

  setHotCue(index) {
    if (!this.buffer) return;
    const i = Math.max(0, Math.min(3, index));
    if (this.hotCues[i] == null) {
      this.hotCues[i] = this.position;
    } else {
      const was = this.playing;
      this.seek(this.hotCues[i]);
      if (!was) this.play();
    }
    this._notify();
  }

  clearHotCue(index) {
    this.hotCues[Math.max(0, Math.min(3, index))] = null;
    this._notify();
  }

  setLoopBeats(beats) {
    if (!this.buffer) return;
    const bpm = this.baseBpm;
    const beat = beatDuration(bpm);
    const start = nearestBeat(this.position, bpm, this.beatOffset);
    const end = start + beats * beat;
    if (end > this.buffer.duration) return;
    this.loop = { start, end };
    this.loopBeats = beats;
    this._armLoopWatch();
    this._notify();
  }

  clearLoop() {
    this.loop = null;
    this.loopBeats = 0;
    if (this._loopTimer) {
      clearInterval(this._loopTimer);
      this._loopTimer = null;
    }
    this._notify();
  }

  _armLoopWatch() {
    if (this._loopTimer) clearInterval(this._loopTimer);
    this._loopTimer = setInterval(() => {
      if (!this.playing || !this.loop) return;
      const pos = this.position;
      if (pos >= this.loop.end - 0.02) {
        const wasRate = this.rate;
        this.pausedAt = this.loop.start;
        this._createSource(this.loop.start);
        this.playing = true;
        if (this.source) this.source.playbackRate.value = wasRate;
      }
    }, 20);
  }

  /** Beat roll: temporary loop of N beats while held */
  rollStart(beats) {
    if (!this.buffer || this.rolling) return;
    this._rollSaved = this.loop ? { ...this.loop, beats: this.loopBeats } : null;
    const bpm = this.baseBpm;
    const beat = beatDuration(bpm);
    const start = this.position;
    this.loop = { start, end: start + beats * beat };
    this.loopBeats = beats;
    this.rolling = true;
    this._armLoopWatch();
    this._notify();
  }

  rollEnd() {
    if (!this.rolling) return;
    this.rolling = false;
    if (this._rollSaved) {
      this.loop = { start: this._rollSaved.start, end: this._rollSaved.end };
      this.loopBeats = this._rollSaved.beats;
      this._armLoopWatch();
    } else {
      this.clearLoop();
    }
    this._rollSaved = null;
    this._notify();
  }

  setManualBpm(bpm) {
    this.manualBpm = bpm > 0 ? bpm : null;
    this._notify();
  }

  /**
   * Vinyl brake: ramp playbackRate toward 0 over `seconds`, then pause.
   * Call vinylBrakeRelease() to abort and restore pitch.
   */
  vinylBrake(seconds = 1.2) {
    if (!this.buffer || !this.playing || !this.source) return;
    this._brakeAbort = false;
    this._preBrakeRate = this.rate;
    const ctx = this.engine.ctx;
    const t = ctx.currentTime;
    const dur = Math.max(0.25, seconds);
    try {
      this.source.playbackRate.cancelScheduledValues(t);
      this.source.playbackRate.setValueAtTime(this.source.playbackRate.value, t);
      this.source.playbackRate.linearRampToValueAtTime(0.001, t + dur);
    } catch (_) {}
    if (this._brakeTimer) clearTimeout(this._brakeTimer);
    this._brakeTimer = setTimeout(() => {
      if (this._brakeAbort) return;
      const pos = this.position;
      this.pause();
      this.pausedAt = pos;
      this.rate = this._preBrakeRate || 1;
      this._notify();
    }, dur * 1000 + 30);
  }

  vinylBrakeRelease() {
    this._brakeAbort = true;
    if (this._brakeTimer) {
      clearTimeout(this._brakeTimer);
      this._brakeTimer = null;
    }
    const restore = this._preBrakeRate || this.rate || 1;
    this.rate = restore;
    if (this.playing && this.source) {
      const pos = this.position;
      this.pausedAt = pos;
      this.startCtxTime = this.engine.currentTime;
      try {
        this.source.playbackRate.cancelScheduledValues(this.engine.currentTime);
        this.source.playbackRate.setTargetAtTime(restore, this.engine.currentTime, 0.05);
      } catch (_) {}
    }
    this._notify();
  }

  /**
   * Backspin-ish: brief rate scramble downward + small seek jump, then restore.
   */
  backspin(seconds = 0.55) {
    if (!this.buffer) return;
    const wasPlaying = this.playing;
    const ctx = this.engine.ctx;
    const t = ctx.currentTime;
    const restore = this.rate;
    const jump = Math.min(1.2, Math.max(0.35, (60 / this.baseBpm) * 2));
    const target = Math.max(0, this.position - jump);

    if (this.playing && this.source) {
      try {
        this.source.playbackRate.cancelScheduledValues(t);
        this.source.playbackRate.setValueAtTime(this.source.playbackRate.value, t);
        this.source.playbackRate.linearRampToValueAtTime(0.05, t + seconds * 0.55);
      } catch (_) {}
    }

    if (this._spinTimer) clearTimeout(this._spinTimer);
    this._spinTimer = setTimeout(() => {
      this.seek(target);
      this.rate = restore;
      if (wasPlaying || this.playing) {
        if (!this.playing) this.play();
        else if (this.source) {
          try {
            this.source.playbackRate.setValueAtTime(restore, this.engine.currentTime);
          } catch (_) {}
        }
      }
      this._notify();
    }, seconds * 1000);
  }

  /**
   * Sync BPM + phase to master.
   * @param {Deck} masterDeck
   * @param {{ soft?: boolean }} [opts] soft=true → gentle phase nudge (auto lock)
   */
  syncTo(masterDeck, opts = {}) {
    if (!this.buffer || !masterDeck?.buffer) return;
    const soft = !!opts.soft;
    const masterEff = masterDeck.effectiveBpm || 120;
    const myBase = this.baseBpm;
    if (myBase <= 0) return;

    // Match effective BPM via playback rate (allow ±16%)
    let targetRate = masterEff / myBase;
    targetRate = Math.max(0.84, Math.min(1.16, targetRate));
    const rateDelta = Math.abs(targetRate - this.rate);
    if (rateDelta > 0.0005) {
      this.rate = targetRate;
      if (this.source && this.playing) {
        const t = this.engine.currentTime;
        try {
          this.source.playbackRate.cancelScheduledValues(t);
          this.source.playbackRate.setTargetAtTime(this.rate, t, soft ? 0.08 : 0.03);
        } catch (_) {
          this.source.playbackRate.value = this.rate;
        }
      }
    }

    // Phase lock to master's beat grid
    if (this.playing && masterDeck.playing) {
      const masterBeat = beatDuration(masterDeck.effectiveBpm || 120);
      const myBeat = beatDuration(this.effectiveBpm || 120);
      if (masterBeat > 0.05 && myBeat > 0.05) {
        let masterPhase = (masterDeck.position - (masterDeck.beatOffset || 0)) % masterBeat;
        let myPhase = (this.position - (this.beatOffset || 0)) % myBeat;
        if (masterPhase < 0) masterPhase += masterBeat;
        if (myPhase < 0) myPhase += myBeat;
        // Wrap to shortest delta (−half..+half beat)
        let delta = masterPhase - myPhase;
        const half = Math.min(masterBeat, myBeat) * 0.5;
        if (delta > half) delta -= masterBeat;
        if (delta < -half) delta += masterBeat;

        if (soft) {
          // Soft lock: brief rate nudge (no source restart → no click)
          // |delta| as fraction of beat → temporary rate skew
          if (Math.abs(delta) > 0.012 && this.source) {
            const ctx = this.engine.ctx;
            const t = ctx.currentTime;
            const skew = Math.max(-0.06, Math.min(0.06, delta * 0.35));
            const nudged = Math.max(0.84, Math.min(1.16, this.rate + skew));
            try {
              this.source.playbackRate.cancelScheduledValues(t);
              this.source.playbackRate.setValueAtTime(nudged, t);
              this.source.playbackRate.setTargetAtTime(this.rate, t + 0.09, 0.04);
            } catch (_) {}
          }
          // Hard seek only if badly out (>1/5 beat) and not too often
          if (Math.abs(delta) > myBeat * 0.2) {
            const now = performance.now();
            if (!this._lastHardPhase || now - this._lastHardPhase > 2500) {
              this._lastHardPhase = now;
              const pos = Math.max(0, Math.min(this.buffer.duration - 0.01, this.position + delta));
              this.pausedAt = pos;
              this._createSource(pos);
              this.playing = true;
              if (this.source) this.source.playbackRate.value = this.rate;
            }
          }
        } else {
          const thresh = 0.008;
          const maxCorr = myBeat * 0.48;
          if (Math.abs(delta) > thresh && Math.abs(delta) < maxCorr) {
            const pos = Math.max(0, Math.min(this.buffer.duration - 0.01, this.position + delta));
            this.pausedAt = pos;
            this._createSource(pos);
            this.playing = true;
            if (this.source) this.source.playbackRate.value = this.rate;
          }
        }
      }
    }
    this._notify();
  }

  /** Pitch fader 0..100 value that maps to current rate for UI */
  pitchFaderValue() {
    const n = (this.rate - 1) / (this.pitchRange || 0.08);
    return Math.round((1 - Math.max(-1, Math.min(1, n))) * 50);
  }

  getWaveformPeaks(bins = 600) {
    if (!this.buffer) return null;
    const data = this.buffer.getChannelData(0);
    const peaks = new Float32Array(bins);
    const block = Math.floor(data.length / bins);
    for (let i = 0; i < bins; i++) {
      let max = 0;
      const start = i * block;
      for (let j = 0; j < block; j++) {
        const v = Math.abs(data[start + j] || 0);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    return peaks;
  }

  _notify() {
    if (this.onUpdate) this.onUpdate(this);
  }
}
