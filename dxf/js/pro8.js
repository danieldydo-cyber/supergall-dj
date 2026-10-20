/**
 * D Bot · PRO8 Fluid (v43) — Pioneer-style pro players (CDJ/DJM-like) on WebAudio · Daniel Dydo · Kraków
 * Decks: AudioBuffer engine (sample-accurate loops, reverse, scratch), CDJ CUE, 8 hot cues (saved per track),
 *   loop IN/OUT/RELOOP/EXIT, auto beat loop 1/4–32, beat jump, SLIP, QUANTIZE, SYNC + MASTER,
 *   tempo ±6/±10/±16/WIDE, MASTER TEMPO (key lock: delay-line pitch shifter, pure WebAudio), REVERSE,
 *   jog wheel (vinyl scratch / pitch bend / search), BPM + beat-grid detection, overview waveform with
 *   needle search, zoomed scrolling waveform with beat grid, phase meter.
 * Mixer (DJM-like): TRIM, 3-band EQ (HI/MID/LOW), COLOR FX filter, channel fader, crossfader + curve,
 *   BEAT FX (ECHO / REVERB / FLANGER / ROLL, BPM-synced), headphone CUE (split L/R or 2nd output device).
 * Classic script (no modules). Exposes window.PRO8. special-x.js owns the AudioContext and master bus.
 */
(function (global) {
  'use strict';
  var VERSION = '43';
  var HOT_COLORS = ['#ff3b5c', '#ff9f0a', '#ffd60a', '#32d74b', '#00e5ff', '#0a84ff', '#bf5af2', '#ff6bd6'];
  var RANGES = [6, 10, 16, 100];
  var RANGE_LABEL = { 6: '±6', 10: '±10', 16: '±16', 100: 'WIDE' };
  var LOOP_SIZES = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
  var FX_BEATS = [0.125, 0.25, 0.5, 0.75, 1, 2, 4, 8, 16];
  var SEC_PER_REV = 1.8;          // 33⅓ rpm platter
  var ZOOM_RES = 150;             // zoom waveform buckets per second
  var REV_CHUNK = 40;             // reverse playback window (s) — keeps memory low on phones
  var LS_CUES = 'pro8-cues:', LS_SET = 'pro8-settings';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fracLabel(b) { return b === 0.125 ? '1/8' : b === 0.25 ? '1/4' : b === 0.5 ? '1/2' : b === 0.75 ? '3/4' : String(b); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var H = { ctx: null, getCtx: null, toast: function () {}, onState: function () {}, started: function () { return true; } };
  var decks = {}, mixer = null, settings = lsGet(LS_SET, {}) || {};
  function saveSettings() { lsSet(LS_SET, settings); }
  function ctx() { if (!H.ctx && H.getCtx) H.ctx = H.getCtx(); return H.ctx; }

  // ======================================================================= key lock (MASTER TEMPO)
  /** Delay-line granular pitch shifter (two cross-faded modulated delay taps, pure WebAudio nodes).
   *  playbackRate r shifts pitch by r; the shifter applies 1/r so the key stays put. */
  function KeyLock(c) {
    var sr = c.sampleRate, active = 0.1, fade = 0.05;
    this.c = c;
    this.input = c.createGain(); this.output = c.createGain();
    this.dry = c.createGain(); this.wet = c.createGain(); this.wet.gain.value = 0;
    this.input.connect(this.dry); this.dry.connect(this.output);
    function delayBuf(up) {
      var n = Math.round(active * sr), b = c.createBuffer(1, n, sr), p = b.getChannelData(0);
      for (var i = 0; i < n; i++) p[i] = up ? (n - i) / n : i / n;
      return b;
    }
    function fadeBuf() {
      var n = Math.round(active * sr), b = c.createBuffer(1, n, sr), p = b.getChannelData(0), fl = fade * sr, i2 = n - fl;
      for (var i = 0; i < n; i++) p[i] = i < fl ? Math.sqrt(i / fl) : i >= i2 ? Math.sqrt(1 - (i - i2) / fl) : 1;
      return b;
    }
    var down = delayBuf(false), up = delayBuf(true), fb = fadeBuf();
    var src = function (buf) { var s = c.createBufferSource(); s.buffer = buf; s.loop = true; return s; };
    var m1 = src(down), m2 = src(down), m3 = src(up), m4 = src(up), f1 = src(fb), f2 = src(fb);
    this.g1 = c.createGain(); this.g2 = c.createGain(); this.g3 = c.createGain(); this.g4 = c.createGain();
    this.g3.gain.value = 0; this.g4.gain.value = 0;
    m1.connect(this.g1); m2.connect(this.g2); m3.connect(this.g3); m4.connect(this.g4);
    this.mg1 = c.createGain(); this.mg2 = c.createGain();
    this.g1.connect(this.mg1); this.g2.connect(this.mg2); this.g3.connect(this.mg1); this.g4.connect(this.mg2);
    var d1 = c.createDelay(1), d2 = c.createDelay(1);
    this.mg1.connect(d1.delayTime); this.mg2.connect(d2.delayTime);
    var x1 = c.createGain(), x2 = c.createGain(); x1.gain.value = 0; x2.gain.value = 0;
    f1.connect(x1.gain); f2.connect(x2.gain);
    this.input.connect(d1); this.input.connect(d2); d1.connect(x1); d2.connect(x2); x1.connect(this.wet); x2.connect(this.wet);
    this.wet.connect(this.output);
    var t = c.currentTime + 0.05, t2 = t + active - fade;
    m1.start(t); m2.start(t2); m3.start(t); m4.start(t2); f1.start(t); f2.start(t2);
    this.on = false; this.factor = 1;
    this.setPitch(1);
  }
  /** pitch factor p. Jungle maths: factor = 1 + 0.5·mult. */
  KeyLock.prototype.setPitch = function (p) {
    var mult = clamp(2 * (p - 1), -1.6, 1.6), t = this.c.currentTime, upw = mult > 0;
    this.g1.gain.setTargetAtTime(upw ? 0 : 1, t, 0.01); this.g2.gain.setTargetAtTime(upw ? 0 : 1, t, 0.01);
    this.g3.gain.setTargetAtTime(upw ? 1 : 0, t, 0.01); this.g4.gain.setTargetAtTime(upw ? 1 : 0, t, 0.01);
    var d = 0.5 * 0.1 * Math.abs(mult);
    this.mg1.gain.setTargetAtTime(d, t, 0.01); this.mg2.gain.setTargetAtTime(d, t, 0.01);
    this.factor = 1 + 0.5 * mult;
  };
  KeyLock.prototype.update = function (rate, enabled) {
    var want = enabled && rate > 0.05 && Math.abs(rate - 1) > 0.0015;
    var t = this.c.currentTime;
    if (want) this.setPitch(1 / rate);
    if (want !== this.on) {
      this.on = want;
      this.dry.gain.setTargetAtTime(want ? 0 : 1, t, 0.015);
      this.wet.gain.setTargetAtTime(want ? 1 : 0, t, 0.015);
    }
  };

  // ======================================================================= analysis
  /** Overview/zoom peaks (+ low-band colour), BPM and first beat (beat grid). */
  function analyse(buf, knownBpm) {
    var sr = buf.sampleRate, n = buf.length, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    var hop = Math.max(2, Math.round(sr / ZOOM_RES)), nb = Math.ceil(n / hop) + 1, ehop = Math.round(sr / 200);
    var zMax = new Float32Array(nb), zLow = new Float32Array(nb), env = new Float32Array(Math.ceil(n / ehop) + 2);
    var lp = 0, a = 1 - Math.exp(-2 * Math.PI * 150 / (sr / 2));
    var bm = 0, bl = 0, ba = 0, es = 0, ec = 0, nextB = hop, nextE = ehop, bi = 0, ei = 0;
    for (var i = 0; i < n; i += 2) {
      var x = (L[i] + R[i]) * 0.5, ax = x < 0 ? -x : x;
      lp += a * (x - lp);
      if (ax > bm) bm = ax;
      bl += lp < 0 ? -lp : lp; ba += ax;
      es += lp * lp; ec++;
      if (i >= nextB) { zMax[bi] = bm; zLow[bi] = ba > 0 ? clamp(bl / ba, 0, 1) : 0; bi++; bm = 0; bl = 0; ba = 0; nextB += hop; }
      if (i >= nextE) { env[ei++] = Math.sqrt(es / Math.max(1, ec)); es = 0; ec = 0; nextE += ehop; }
    }
    zMax[bi] = bm; zLow[bi] = ba > 0 ? clamp(bl / ba, 0, 1) : 0; bi++;
    var peakAll = 0, k;
    for (k = 0; k < bi; k++) if (zMax[k] > peakAll) peakAll = zMax[k];
    var nrm = peakAll > 0 ? 1 / peakAll : 1;
    for (k = 0; k < bi; k++) zMax[k] *= nrm;
    var res = { zMax: zMax.subarray(0, bi), zLow: zLow.subarray(0, bi), duration: buf.duration };
    var g = beatGrid(env.subarray(0, ei), sr / ehop, knownBpm);
    res.bpm = g.bpm; res.firstBeat = g.firstBeat;
    return res;
  }
  /** Onset novelty → autocorrelation (70–180 BPM, parabolic refine) → comb search for exact BPM + phase. */
  function beatGrid(env, fps, knownBpm) {
    var N = env.length;
    var start = Math.min(Math.floor(N * 0.08), Math.max(0, N - Math.round(90 * fps))), end = Math.min(N, start + Math.round(90 * fps));
    if (end - start < 4) return { bpm: knownBpm || null, firstBeat: 0 };
    var nov = new Float32Array(end - start), prev = Math.log(1 + 100 * env[start]), i;
    for (i = start; i < end; i++) { var v = Math.log(1 + 100 * env[i]); nov[i - start] = Math.max(0, v - prev); prev = v; }
    var M = nov.length, mean = 0;
    for (i = 0; i < M; i++) mean += nov[i];
    mean /= Math.max(1, M);
    for (i = 0; i < M; i++) nov[i] = Math.max(0, nov[i] - mean);
    var bpm = knownBpm || 0;
    if (!bpm && M > fps * 6) {
      var minLag = Math.floor(60 * fps / 180), maxLag = Math.ceil(60 * fps / 70), ac = [], best = -1, bl = minLag;
      for (var lag = minLag; lag <= maxLag; lag++) {
        var s = 0;
        for (var m = 0; m + lag < M; m++) s += nov[m] * nov[m + lag];
        ac[lag] = s;
        if (s > best) { best = s; bl = lag; }
      }
      var y0 = ac[bl - 1] || best, y2 = ac[bl + 1] || best, den = y0 - 2 * best + y2;
      var off = den ? 0.5 * (y0 - y2) / den : 0;
      bpm = 60 * fps / (bl + clamp(off, -0.5, 0.5));
      while (bpm < 85) bpm *= 2;
      while (bpm > 175) bpm /= 2;
    }
    if (!bpm) return { bpm: null, firstBeat: 0 };
    var bestScore = -1, bestBpm = bpm, bestPh = 0, cands = [];
    if (knownBpm) cands.push(knownBpm); else for (var dd = -1.5; dd <= 1.5001; dd += 0.02) cands.push(bpm + dd);
    cands.forEach(function (b) {
      var spbF = 60 * fps / b, steps = Math.ceil(spbF);
      for (var ph = 0; ph < steps; ph++) {
        var sc = 0;
        for (var t = ph; t < M - 1; t += spbF) { var ti = t | 0, fr = t - ti; sc += nov[ti] * (1 - fr) + nov[ti + 1] * fr; }
        if (sc > bestScore) { bestScore = sc; bestBpm = b; bestPh = ph; }
      }
    });
    var spb = 60 / bestBpm, fb = ((start + bestPh) / fps) % spb;
    return { bpm: Math.round(bestBpm * 100) / 100, firstBeat: fb };
  }

  // ======================================================================= deck (CDJ-like player)
  function Deck(id) {
    this.id = id;
    this.track = null; this.buffer = null; this.analysis = null; this.duration = 0; this.state = 'empty';
    this.playing = false; this.anchorCtx = 0; this.anchorPos = 0; this.rate = 0;
    this.node = null; this.nodeGain = null; this.rev = null;
    this.tempo = 0; this.range = 10; this.keyLock = false; this.reverse = false; this.slip = false; this.quantize = true; this.vinyl = true;
    this.syncOn = false; this.bend = 1; this.scratching = false; this.scratchRate = 0; this.jogMode = null;
    this.loop = { in: null, out: null, active: false, beats: 4, auto: false };
    this.hot = [null, null, null, null, null, null, null, null]; this.cuePoint = 0;
    this.bpm = null; this.firstBeat = 0; this.loading = null; this.loadSeq = 0; this.gridSaved = false;
    this.slipState = null; this.cueHeld = false; this.cueResume = false; this.delMode = false; this.heldHot = -1;
    this.vol = 0.85; this.src = null; this.el = null; this.zoom = 8; this.wantPlay = false;
    var self = this;
    // compat for special-x.js / bot snapshot (the old decks were <audio> elements)
    this.audio = {
      get paused() { return !self.playing; },
      get currentTime() { return self.pos(); }, set currentTime(v) { self.seek(v); },
      get duration() { return self.duration || NaN; },
      get playbackRate() { return self.baseRate(); }, set playbackRate(v) { self.setRate(v); },
      pause: function () { self.pause(); }, play: function () { self.play(); return Promise.resolve(); }
    };
    var st = settings['deck' + id] || {};
    if (RANGES.indexOf(st.range) >= 0) this.range = st.range;
    if (typeof st.keyLock === 'boolean') this.keyLock = st.keyLock;
    if (typeof st.quantize === 'boolean') this.quantize = st.quantize;
    if (typeof st.vinyl === 'boolean') this.vinyl = st.vinyl;
    if (typeof st.slip === 'boolean') this.slip = st.slip;
  }
  var D = Deck.prototype;
  D.saveDeckSettings = function () { settings['deck' + this.id] = { range: this.range, keyLock: this.keyLock, quantize: this.quantize, vinyl: this.vinyl, slip: this.slip }; saveSettings(); };
  D.connect = function () {
    if (this.out) return true;
    var c = ctx(); if (!c || !mixer || !mixer.ensure()) return false;
    this.out = c.createGain();
    this.keylock = new KeyLock(c);
    this.out.connect(this.keylock.input);
    this.keylock.output.connect(mixer.ch[this.id].input);
    this.src = this.out; // truthy → "connected" for special-x
    return true;
  };
  D.now = function () { var c = ctx(); return c ? c.currentTime : 0; };
  D.baseRate = function () { return Math.max(0.02, 1 + this.tempo * this.range / 100); };
  D.effBpm = function () { return this.bpm ? this.bpm * this.baseRate() : null; };
  D.spb = function () { return this.bpm ? 60 / this.bpm : 0.5; };
  D.beatAt = function (p) { return (p - this.firstBeat) / this.spb(); };
  D.nearestBeat = function (p) { if (!this.bpm) return p; var s = this.spb(); return this.firstBeat + Math.round((p - this.firstBeat) / s) * s; };
  D.q = function (p) { return this.quantize && this.bpm ? clamp(this.nearestBeat(p), 0, this.duration || 0) : p; };
  D.rawPos = function () {
    if (!this.playing && !this.scratching || !this.rate) return this.anchorPos;
    return this.anchorPos + (this.now() - this.anchorCtx) * this.rate;
  };
  D.pos = function () {
    var p = this.rawPos(), lp = this.loop;
    if (lp.active && lp.out > lp.in && this.rate) {
      var len = lp.out - lp.in;
      if (this.rate > 0 && p >= lp.out) p = lp.in + ((p - lp.in) % len);
      else if (this.rate < 0 && p < lp.in) p = lp.out - ((lp.in - p) % len);
    }
    return clamp(p, 0, this.duration || 0);
  };
  D.targetRate = function () {
    if (this.scratching) return this.scratchRate;
    return this.baseRate() * this.bend * (this.reverse ? -1 : 1);
  };
  /** Re-anchor position and (re)start the buffer source for the current target rate. */
  D.apply = function (forceRestart) {
    if (!this.buffer) return;
    var p = this.pos(), r = (this.playing || this.scratching) ? this.targetRate() : 0;
    if (Math.abs(r) < 0.015) r = 0;
    var sgn = function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; };
    var needRestart = forceRestart || (!this.node && r !== 0) || sgn(r) !== sgn(this.rate);
    this.anchorPos = p; this.anchorCtx = this.now();
    if (needRestart) this.startNode(p, r);
    else if (this.node) this.node.playbackRate.setTargetAtTime(Math.abs(r), this.now(), 0.004);
    this.rate = r;
    if (this.keylock) this.keylock.update(Math.abs(r), this.keyLock && !this.scratching && Math.abs(this.bend - 1) < 0.001);
  };
  D.stopNode = function () {
    if (!this.node) return;
    var n = this.node, g = this.nodeGain, t = this.now();
    n.onended = null;
    try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.006); n.stop(t + 0.012); } catch (_) { try { n.stop(); } catch (e) {} }
    this.node = null; this.nodeGain = null;
  };
  D.buildRev = function (p) {
    var b = this.buffer, sr = b.sampleRate, lp = this.loop;
    var end = Math.min(this.duration, p + 2), start = Math.max(0, end - REV_CHUNK);
    if (lp.active && lp.out > lp.in) { start = Math.max(0, Math.min(start, lp.in - 0.5)); end = Math.min(this.duration, Math.max(end, lp.out + 0.5)); }
    var s0 = Math.floor(start * sr), s1 = Math.min(b.length, Math.ceil(end * sr)), len = Math.max(1, s1 - s0);
    var rb = ctx().createBuffer(b.numberOfChannels, len, sr);
    for (var ch = 0; ch < b.numberOfChannels; ch++) {
      var src = b.getChannelData(ch), dst = rb.getChannelData(ch);
      for (var i = 0; i < len; i++) dst[i] = src[s1 - 1 - i];
    }
    this.rev = { buf: rb, start: s0 / sr, end: s1 / sr };
  };
  D.startNode = function (p, r) {
    this.stopNode();
    if (!r || !this.buffer) return;
    var c = ctx(), n = c.createBufferSource(), g = c.createGain(), lp = this.loop, t = c.currentTime, off;
    if (r > 0) {
      n.buffer = this.buffer; off = p;
      if (lp.active && lp.out > lp.in) { n.loop = true; n.loopStart = lp.in; n.loopEnd = lp.out; }
    } else {
      var rv = this.rev;
      if (!rv || p > rv.end - 0.02 || (p < rv.start + 0.3 && rv.start > 0) || (lp.active && (lp.in < rv.start || lp.out > rv.end))) this.buildRev(p);
      n.buffer = this.rev.buf; off = this.rev.end - p;
      if (lp.active && lp.out > lp.in) { n.loop = true; n.loopStart = this.rev.end - lp.out; n.loopEnd = this.rev.end - lp.in; }
    }
    n.playbackRate.value = Math.abs(r);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.006);
    n.connect(g); g.connect(this.out);
    var self = this;
    n.onended = function () { if (self.node === n) { self.node = null; self.endReached(); } };
    try { n.start(t, clamp(off, 0, Math.max(0, n.buffer.duration - 0.001))); } catch (e) { console.warn('[PRO8] start', e); }
    this.node = n; this.nodeGain = g;
  };
  D.endReached = function () {
    if (this.scratching) return;
    var p = this.rawPos();
    if (this.rate > 0 && p >= this.duration - 0.1) { this.playing = false; this.anchorPos = this.duration; this.rate = 0; this.emit(); }
    else if (this.rate < 0 && p <= 0.1) { this.playing = false; this.anchorPos = 0; this.rate = 0; this.emit(); }
  };
  D.tick = function () {
    if (!this.buffer || !this.playing || this.scratching) return;
    if (this.rate < 0 && this.rev && this.rev.start > 0 && this.pos() < this.rev.start + 0.5 && !this.loop.active) this.apply(true);
  };
  D.emit = function () { if (this.onChange) this.onChange(this); try { H.onState(this); } catch (_) {} };

  // ---- loading
  D.cueKey = function () { var t = this.track; return t ? (t.local ? 'local:' + t.name : t.file) : ''; };
  D.saveCues = function () {
    if (!this.track) return;
    lsSet(LS_CUES + this.cueKey(), { hot: this.hot, cue: this.cuePoint, bpm: this.bpm, firstBeat: this.firstBeat, name: this.track.name, at: Date.now() });
  };
  D.load = function (track, autoplay) {
    this.pause(true);
    this.stopNode();
    this.loop = { in: null, out: null, active: false, beats: this.loop.beats, auto: false };
    this.slipState = null; this.scratching = false; this.jogMode = null;
    this.track = track; this.buffer = null; this.analysis = null; this.rev = null; this.duration = 0; this.ovCache = null;
    this.anchorPos = 0; this.rate = 0; this.state = 'idle'; this.loadSeq++;
    this.bpm = track.bpm || null; this.firstBeat = 0;
    var saved = lsGet(LS_CUES + this.cueKey(), null);
    var hot = saved && Array.isArray(saved.hot) ? saved.hot : [];
    this.hot = [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { var h = hot[i]; return h && typeof h.t === 'number' ? { t: h.t, c: h.c || HOT_COLORS[i] } : null; });
    this.cuePoint = saved && typeof saved.cue === 'number' ? saved.cue : 0;
    this.anchorPos = this.cuePoint;
    if (saved && saved.bpm) { this.bpm = saved.bpm; this.firstBeat = saved.firstBeat || 0; this.gridSaved = true; } else this.gridSaved = false;
    this.wantPlay = !!autoplay;
    this.emit();
    if (autoplay || H.started()) return this.prepare();
    return Promise.resolve(this);
  };
  /** Fetch + decode + analyse (works offline from the SW media cache). */
  D.prepare = function () {
    var self = this, track = this.track;
    if (!track) return Promise.resolve(this);
    if (this.buffer) { if (this.wantPlay) { this.wantPlay = false; this.play(); } return Promise.resolve(this); }
    if (this.loading && this.loading.track === track) return this.loading.p;
    if (!this.connect()) return Promise.resolve(this);
    var seq = this.loadSeq;
    this.state = 'loading'; this.emit();
    var p = fetch(track.file).then(function (r) {
      if (!r.ok && r.status !== 0) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (res, rej) {
        try { var pr = ctx().decodeAudioData(ab, res, rej); if (pr && pr.then) pr.then(res, rej); } catch (e) { rej(e); }
      });
    }).then(function (buf) {
      if (seq !== self.loadSeq) return self;
      self.buffer = buf; self.duration = buf.duration; self.state = 'ready';
      var an = analyse(buf, self.gridSaved ? self.bpm : (track.bpm || null));
      self.analysis = an;
      if (!self.gridSaved) { self.bpm = an.bpm; self.firstBeat = an.firstBeat; try { var R52 = window.DBotStudio && window.DBotStudio.range, g52 = R52 && R52.get ? R52.get() : { min: 79, max: 127 }, b52 = self.bpm; if (b52) { while (b52 > g52.max * 1.12 && b52 / 2 >= g52.min * 0.9) b52 /= 2; while (b52 < g52.min * 0.88 && b52 * 2 <= g52.max * 1.1) b52 *= 2; if (Math.abs(b52 - Math.round(b52)) < 0.3) b52 = Math.round(b52); if (b52 !== self.bpm) { self.octave52 = Math.abs(b52 / self.bpm - 1) > 0.3; self.bpm = b52; an.bpm = b52; var f52 = window.DBotV52 && window.DBotV52.refineGrid ? window.DBotV52.refineGrid(buf, b52, self.firstBeat) : null; if (f52 != null) { self.firstBeat = f52; an.firstBeat = f52; } } } } catch (_) {} }
      if (an.bpm && !track.bpm) track.bpm = Math.round(an.bpm * 10) / 10;
      if (self.cuePoint > self.duration) self.cuePoint = 0;
      self.anchorPos = clamp(self.anchorPos, 0, self.duration);
      self.loading = null;
      self.emit();
      if (self.syncOn) self.doSync(false);
      if (self.wantPlay) { self.wantPlay = false; self.play(); }
      return self;
    }).catch(function (e) {
      if (seq !== self.loadSeq) return self;
      self.state = 'error'; self.loading = null; self.wantPlay = false; self.emit();
      H.toast('Deck ' + self.id + ': nie mogę wczytać „' + track.name + '”' + (navigator.onLine === false ? ' (offline — utwór nie zapisany na urządzeniu)' : '') + '.');
      console.warn('[PRO8] load', track.file, e && e.message);
      return self;
    });
    this.loading = { track: track, p: p };
    return p;
  };

  // ---- transport
  D.play = function () {
    if (!this.track) return;
    if (!this.buffer) { this.wantPlay = true; this.prepare(); return; }
    var c = ctx(); if (c && c.state !== 'running') { try { var rp = c.resume(); if (rp && rp.catch) rp.catch(function () {}); } catch (_) {} }
    if (this.playing) return;
    if (this.anchorPos >= this.duration - 0.05 && !this.reverse) this.anchorPos = 0;
    this.playing = true; this.rate = 0; this.anchorCtx = this.now();
    if (this.syncOn) this.doSync(false);
    this.apply(true);
    if (mixer) mixer.autoMaster();
    if (this.syncOn) this.doSync(true);
    this.emit();
  };
  D.pause = function (silent) {
    this.wantPlay = false;
    if (!this.playing) { if (!silent) this.emit(); return; }
    this.anchorPos = this.pos(); this.playing = false; this.rate = 0; this.stopNode();
    this.slipState = null;
    if (mixer) mixer.autoMaster();
    if (!silent) this.emit();
  };
  D.toggle = function () { if (this.playing) this.pause(); else this.play(); };
  D.seek = function (p) {
    if (typeof p !== 'number' || !isFinite(p)) return;
    this.anchorPos = clamp(p, 0, this.duration || 0); this.anchorCtx = this.now();
    if (this.loop.active && (this.anchorPos < this.loop.in - 0.001 || this.anchorPos > this.loop.out + 0.001)) this.loop.active = false;
    if (this.playing) this.apply(true);
    this.emit();
  };
  /** Jump keeping the beat phase when QUANTIZE is on and the deck is playing (CDJ/rekordbox style). */
  D.jumpTo = function (t) {
    if (this.quantize && this.bpm && this.playing) {
      var p = this.pos(), ph = p - this.nearestBeat(p);
      t = this.nearestBeat(t) + ph;
    }
    this.seek(t);
  };
  /** CDJ CUE: paused → set cue (quantized) and preview while held; playing → back to cue + pause. */
  D.cueDown = function () {
    if (!this.track) return;
    if (!this.buffer) { this.prepare(); return; }
    if (this.playing && !this.cueHeld) { this.pause(true); this.anchorPos = this.cuePoint; this.loop.active = false; this.emit(); return; }
    var p = this.pos();
    if (Math.abs(p - this.cuePoint) > 0.02) { this.cuePoint = this.q(p); this.saveCues(); }
    this.anchorPos = this.cuePoint;
    this.cueHeld = true; this.cueResume = false;
    this.play();
  };
  D.cueUp = function () {
    if (!this.cueHeld) return;
    this.cueHeld = false;
    if (this.cueResume) { this.cueResume = false; this.emit(); return; } // PLAY pressed while holding CUE → keep playing
    this.pause(true); this.anchorPos = this.cuePoint; this.emit();
  };
  D.playPress = function () { if (this.cueHeld) { this.cueResume = true; this.emit(); return; } this.toggle(); };

  // ---- hot cues
  D.hotDown = function (i) {
    if (!this.track) return;
    if (!this.buffer) { this.prepare(); return; }
    if (this.delMode) { this.hotDelete(i); return; }
    var h = this.hot[i];
    if (!h) { this.hot[i] = { t: this.q(this.pos()), c: HOT_COLORS[i] }; this.saveCues(); H.toast('Deck ' + this.id + ': HOT CUE ' + 'ABCDEFGH'[i] + ' zapisany', 1100); this.emit(); return; }
    if (this.slip && this.playing && !this.slipState) this.slipBegin();
    this.heldHot = i;
    this.loop.active = false;
    this.jumpTo(h.t);
    if (!this.playing) this.play();
  };
  D.hotUp = function (i) { if (this.heldHot === i) { this.heldHot = -1; if (this.slipState && !this.loop.active && !this.reverse) this.slipEnd(); } };
  D.hotDelete = function (i) { if (this.hot[i]) { this.hot[i] = null; this.saveCues(); H.toast('Deck ' + this.id + ': HOT CUE ' + 'ABCDEFGH'[i] + ' usunięty', 1100); this.emit(); } };
  D.hotSet = function (i, t) { if (typeof t !== 'number' || !isFinite(t)) t = this.q ? this.q(this.pos()) : this.pos(); this.hot[i] = { t: clamp(t, 0, this.duration || t), c: HOT_COLORS[i] }; this.saveCues(); this.emit(); };

  // ---- loops
  D.loopIn = function () {
    if (!this.buffer) return;
    this.loop.in = this.q(this.pos()); this.loop.out = null; this.loop.active = false; this.loop.auto = false; this.emit();
  };
  D.loopOut = function () {
    if (!this.buffer) return;
    var p = this.q(this.pos());
    if (this.loop.in == null) this.loop.in = Math.max(0, p - 4 * this.spb());
    if (p <= this.loop.in + 0.02) p = this.loop.in + this.spb();
    this.loop.out = Math.min(p, this.duration); this.loop.auto = false;
    this.loop.beats = Math.round((this.loop.out - this.loop.in) / this.spb() * 1000) / 1000;
    this.loopEngage(true);
  };
  D.loopEngage = function (jumpBack) {
    var lp = this.loop;
    if (lp.in == null || lp.out == null || lp.out <= lp.in) return false;
    if (this.slip && this.playing && !this.slipState) this.slipBegin();
    var p = this.pos();
    lp.active = true;
    this.anchorPos = (jumpBack || p >= lp.out || p < lp.in) ? lp.in : p;
    this.anchorCtx = this.now();
    if (this.playing) this.apply(true);
    this.emit();
    return true;
  };
  D.loopExit = function () {
    if (!this.loop.active) return;
    var p = this.pos();
    this.loop.active = false; this.anchorPos = p; this.anchorCtx = this.now();
    if (this.slipState && !this.reverse && this.heldHot < 0) this.slipEnd(); else if (this.playing) this.apply(true);
    this.emit();
  };
  D.reloop = function () {
    if (this.loop.active) { this.loopExit(); return 'exit'; }
    if (this.loop.in != null && this.loop.out != null) { this.loopEngage(true); return 'reloop'; }
    return null;
  };
  /** Auto beat loop of n beats from the (quantized) current beat; the same size again = exit. */
  D.autoLoop = function (beats) {
    if (!this.buffer) return false;
    var spb = this.spb(), lp = this.loop;
    if (lp.active && lp.auto && Math.abs(lp.beats - beats) < 1e-6) { this.loopExit(); return false; }
    var p = this.pos(), start = p;
    if (this.quantize && this.bpm) {
      var unit = spb * Math.min(1, beats);
      start = this.firstBeat + Math.floor((p - this.firstBeat) / unit + 1e-6) * unit;
    }
    if (start < 0) start = 0;
    var wasActive = lp.active;
    if (this.slip && this.playing && !this.slipState) this.slipBegin();
    lp.in = start; lp.out = Math.min(this.duration, start + beats * spb); lp.beats = beats; lp.auto = true; lp.active = true;
    this.anchorPos = (p >= lp.out || p < lp.in) ? lp.in : p;
    this.anchorCtx = this.now();
    if (this.playing) this.apply(true);
    if (!wasActive) H.toast('Deck ' + this.id + ': LOOP ' + fracLabel(beats) + (beats <= 1 ? ' beat' : ' beatów'), 900);
    this.emit();
    return true;
  };
  D.loopResize = function (f) {
    var lp = this.loop;
    if (lp.in == null || lp.out == null) { var i = LOOP_SIZES.indexOf(lp.beats); lp.beats = LOOP_SIZES[clamp((i < 0 ? 4 : i) + (f > 1 ? 1 : -1), 0, LOOP_SIZES.length - 1)]; this.emit(); return; }
    var len = (lp.out - lp.in) * f;
    if (len < 0.01 || len > 64 * this.spb() || lp.in + len > this.duration) return;
    var p = this.pos();
    lp.out = lp.in + len; lp.beats = Math.round(lp.beats * f * 1000) / 1000;
    if (lp.active) { this.anchorPos = p >= lp.out ? lp.in + (p - lp.in) % len : p; this.anchorCtx = this.now(); if (this.playing) this.apply(true); }
    this.emit();
  };
  D.beatJump = function (beats) {
    if (!this.buffer) return;
    var d = beats * this.spb(), lp = this.loop;
    if (lp.active) { // CDJ: beat jump moves an active loop
      if (lp.in + d < 0 || lp.out + d > this.duration) return;
      var p = this.pos();
      lp.in += d; lp.out += d;
      this.anchorPos = clamp(p + d, lp.in, lp.out - 0.001); this.anchorCtx = this.now();
      if (this.playing) this.apply(true);
      this.emit(); return;
    }
    this.seek(this.pos() + d);
  };

  // ---- slip
  D.slipBegin = function () { this.slipState = { ctx: this.now(), pos: this.pos(), rate: this.baseRate() }; };
  D.slipPos = function () { var s = this.slipState; return s ? clamp(s.pos + (this.playing || this.scratching ? (this.now() - s.ctx) * s.rate : 0), 0, this.duration) : null; };
  D.slipEnd = function () {
    var p = this.slipPos(); this.slipState = null;
    if (p == null) return;
    this.anchorPos = p; this.anchorCtx = this.now();
    if (this.playing) this.apply(true);
    this.emit();
  };

  // ---- tempo / modes
  D.setTempo = function (fr, fromUser) {
    if (fromUser && this.syncOn && mixer && mixer.master && mixer.master !== this.id) { H.toast('Deck ' + this.id + ': SYNC ON — tempo prowadzi MASTER (' + mixer.master + ')', 1500); this.emit(); return; }
    if (this.slipState) { this.slipState.pos = this.slipPos(); this.slipState.ctx = this.now(); }
    this.tempo = clamp(fr, -1, 1);
    if (this.slipState) this.slipState.rate = this.baseRate();
    if (this.playing) this.apply(false); else if (this.keylock) this.keylock.update(this.baseRate(), this.keyLock);
    if (mixer && mixer.master === this.id) mixer.followMaster();
    this.emit();
  };
  D.tempoPct = function () { return this.tempo * this.range; };
  D.setTempoPct = function (pct, fromUser) {
    var r = this.range;
    while (Math.abs(pct) > r && r < 100) r = RANGES[RANGES.indexOf(r) + 1];
    if (r !== this.range) { this.range = r; this.saveDeckSettings(); }
    this.setTempo(clamp(pct, -100, 100) / this.range, fromUser);
  };
  D.setRate = function (rate) { this.setTempoPct((rate - 1) * 100); };
  D.setRange = function (r) {
    var pct = this.tempoPct();
    if (r == null) r = RANGES[(RANGES.indexOf(this.range) + 1) % RANGES.length];
    if (RANGES.indexOf(r) < 0) return;
    if (Math.abs(pct) > r) pct = (pct < 0 ? -1 : 1) * r;
    this.range = r; this.tempo = pct / r; this.saveDeckSettings();
    if (this.playing) this.apply(false);
    if (mixer && mixer.master === this.id) mixer.followMaster();
    this.emit();
  };
  D.tempoReset = function () { this.setTempo(0, true); };
  D.setKeyLock = function (on) { this.keyLock = on == null ? !this.keyLock : !!on; this.saveDeckSettings(); if (this.keylock) this.keylock.update(this.playing ? Math.abs(this.rate) : this.baseRate(), this.keyLock); this.emit(); };
  D.setReverse = function (on) {
    on = on == null ? !this.reverse : !!on;
    if (on === this.reverse) return;
    if (on && this.slip && this.playing && !this.slipState) this.slipBegin();
    this.reverse = on;
    if (!on && this.slipState && !this.loop.active && this.heldHot < 0) { this.slipEnd(); this.emit(); return; }
    if (this.playing) this.apply(true);
    this.emit();
  };
  D.setSlip = function (on) { this.slip = on == null ? !this.slip : !!on; if (!this.slip) this.slipState = null; this.saveDeckSettings(); this.emit(); };
  D.setQuantize = function (on) { this.quantize = on == null ? !this.quantize : !!on; this.saveDeckSettings(); this.emit(); };
  D.setVinyl = function (on) { this.vinyl = on == null ? !this.vinyl : !!on; this.saveDeckSettings(); this.emit(); };
  D.other = function () { return decks[this.id === 'A' ? 'B' : 'A']; };
  D.setSync = function (on) {
    on = on == null ? !this.syncOn : !!on;
    this.syncOn = on;
    if (on && mixer) {
      var o = this.other();
      if (!mixer.master || mixer.master === this.id) { if (o && o.bpm) mixer.master = o.id; }
      this.doSync(true);
    }
    paintAll();
    return on;
  };
  /** Match tempo (and beat phase when both decks run) to the MASTER deck. */
  D.doSync = function (phase) {
    var m = mixer && mixer.master && decks[mixer.master];
    if (!m || m === this || !m.bpm || !this.bpm) return false;
    var pct = (m.effBpm() / this.bpm - 1) * 100, i = RANGES.indexOf(this.range);
    while (i < RANGES.length - 1 && Math.abs(pct) > RANGES[i]) i++;
    this.range = RANGES[i];
    if (this.slipState) { this.slipState.pos = this.slipPos(); this.slipState.ctx = this.now(); }
    this.tempo = clamp(pct / this.range, -1, 1);
    if (this.slipState) this.slipState.rate = this.baseRate();
    if (this.playing) this.apply(false);
    if (phase && this.playing && m.playing && this.buffer && m.buffer && !this.loop.active) {
      var diff = this.phaseDiff();
      if (diff != null && Math.abs(diff) > 0.01) this.seek(this.pos() - diff * this.spb());
    }
    this.emit();
    return true;
  };
  D.setMaster = function () { if (mixer) mixer.setMaster(this.id); };
  /** Beat-phase difference to the master (or other) deck, −0.5…0.5 beats. */
  D.phaseDiff = function () {
    var m = mixer && mixer.master && decks[mixer.master];
    var o = m && m !== this ? m : this.other();
    if (!o || o === this || !o.bpm || !this.bpm || !o.buffer || !this.buffer) return null;
    var a = this.beatAt(this.pos()), b = o.beatAt(o.pos());
    var d = (a - Math.floor(a)) - (b - Math.floor(b));
    if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
    return d;
  };
  D.setVol = function (v) { this.vol = clamp(v, 0, 1); if (mixer) mixer.setFader(this.id, this.vol); };

  // ---- jog wheel
  D.jogStart = function (scratch) {
    if (!this.buffer) return;
    this.jogMode = scratch ? 'scratch' : (this.playing ? 'bend' : 'search');
    if (this.jogMode !== 'scratch') return;
    this.scratchWasPlaying = this.playing;
    if (this.slip && this.playing && !this.slipState) this.slipBegin();
    this.anchorPos = this.pos(); this.anchorCtx = this.now();
    this.scratchTarget = this.anchorPos; this.scratching = true; this.scratchRate = 0; this.playing = false;
    this.apply(true);
    var self = this;
    clearInterval(this.scratchT);
    this.scratchT = setInterval(function () { self.scratchStep(); }, 15);
  };
  D.scratchStep = function () {
    if (!this.scratching) return;
    var p = this.pos(), want = clamp(this.scratchTarget, 0, this.duration), r = clamp((want - p) / 0.045, -6, 6);
    if (Math.abs(r) < 0.03) r = 0;
    if (Math.abs(r - this.scratchRate) > 0.01 || (r === 0) !== (this.scratchRate === 0)) { this.scratchRate = r; this.apply(false); }
  };
  /** d = revolutions moved since the last event (+ = clockwise / forward). */
  D.jogMove = function (d) {
    if (!this.buffer) return;
    if (this.jogMode === 'scratch') { this.scratchTarget += d * SEC_PER_REV; return; }
    if (this.jogMode === 'search' || !this.playing) { this.seek(this.pos() + d * SEC_PER_REV * 0.6); return; }
    var self = this; // pitch bend proportional to wheel speed, released smoothly
    this.bend = clamp(1 + d * 6, 0.7, 1.3);
    this.apply(false);
    clearTimeout(this.bendT);
    this.bendT = setTimeout(function () { self.bend = 1; self.apply(false); }, 90);
  };
  D.jogEnd = function () {
    if (this.jogMode === 'scratch') {
      clearInterval(this.scratchT);
      var p = this.pos();
      this.scratching = false; this.scratchRate = 0; this.rate = 0; this.stopNode();
      this.anchorPos = p; this.anchorCtx = this.now();
      if (this.scratchWasPlaying) {
        this.playing = true;
        if (this.slipState) { var sp = this.slipPos(); this.slipState = null; this.anchorPos = sp; }
        this.apply(true);
      } else { this.playing = false; this.slipState = null; }
    }
    this.jogMode = null;
    this.emit();
  };
  D.bendNudge = function (dir) { this.bend = dir ? (dir > 0 ? 1.04 : 0.96) : 1; if (this.playing) this.apply(false); };

  D.state2 = function () {
    return { id: this.id, track: this.track && this.track.name, file: this.track && this.track.file, loaded: !!this.buffer, state: this.state, playing: this.playing,
      pos: Math.round(this.pos() * 1000) / 1000, duration: this.duration, bpm: this.bpm, effBpm: this.effBpm(), tempoPct: this.tempoPct(), range: this.range,
      keyLock: this.keyLock, keyLockActive: !!(this.keylock && this.keylock.on), reverse: this.reverse, slip: this.slip, slipActive: !!this.slipState, quantize: this.quantize, vinyl: this.vinyl,
      sync: this.syncOn, master: !!(mixer && mixer.master === this.id), loop: { in: this.loop.in, out: this.loop.out, active: this.loop.active, beats: this.loop.beats },
      hot: this.hot.map(function (h) { return h ? Math.round(h.t * 1000) / 1000 : null; }), cue: this.cuePoint, firstBeat: this.firstBeat, rate: this.rate, phase: this.phaseDiff() };
  };

  // ======================================================================= mixer (DJM-like)
  function Mixer() {
    this.built = false; this.master = null; this.xf = 0.5; this.curve = settings.curve || 'smooth';
    this.ch = {};
    this.fx = { type: settings.fxType || 'echo', beats: settings.fxBeats || 0.75, assign: settings.fxAssign || 'M', level: settings.fxLevel != null ? settings.fxLevel : 0.5, on: false };
    this.hp = { mode: settings.hpMode === 'device' ? 'off' : (settings.hpMode || 'off'), mix: settings.hpMix != null ? settings.hpMix : 0.3, sink: settings.hpSink || '' };
    this.vals = { A: { trim: 0, hi: 0, mid: 0, low: 0, color: 0, cue: false }, B: { trim: 0, hi: 0, mid: 0, low: 0, color: 0, cue: false } };
  }
  var M = Mixer.prototype;
  M.ensure = function () {
    if (this.built) return true;
    var c = ctx(); if (!c || !H.out()) return false;
    this.built = true;
    var self = this;
    this.bus = c.createGain();
    this.cueBus = c.createGain();
    this.fxu = new BeatFx(c);
    ['A', 'B'].forEach(function (id) {
      var s = { vals: self.vals[id] };
      s.input = c.createGain(); s.trim = c.createGain();
      s.low = c.createBiquadFilter(); s.low.type = 'lowshelf'; s.low.frequency.value = 120;
      s.mid = c.createBiquadFilter(); s.mid.type = 'peaking'; s.mid.frequency.value = 1000; s.mid.Q.value = 0.7;
      s.hi = c.createBiquadFilter(); s.hi.type = 'highshelf'; s.hi.frequency.value = 8000;
      s.color = c.createBiquadFilter(); s.color.type = 'lowpass'; s.color.frequency.value = 22000; s.color.Q.value = 0.7;
      s.fader = c.createGain(); s.xf = c.createGain(); s.post = c.createGain();
      s.cue = c.createGain(); s.cue.gain.value = 0;
      s.meter = c.createAnalyser(); s.meter.fftSize = 512; s.meterBuf = new Float32Array(512);
      s.input.connect(s.trim); s.trim.connect(s.low); s.low.connect(s.mid); s.mid.connect(s.hi); s.hi.connect(s.color);
      s.color.connect(s.fader); s.fader.connect(s.xf); s.xf.connect(s.post);
      s.color.connect(s.cue); s.cue.connect(self.cueBus);
      s.color.connect(s.meter);
      self.ch[id] = s;
      ['trim', 'hi', 'mid', 'low', 'color'].forEach(function (k) { self.setKnob(id, k, s.vals[k]); });
      if (s.vals.cue) s.cue.gain.value = 1;
    });
    this.route();
    ['A', 'B'].forEach(function (id) { self.setFader(id, decks[id] ? decks[id].vol : 0.85); });
    this.applyXf();
    this.buildHeadphones();
    if (this.fx.on) this.setFx({});
    return true;
  };
  /** BEAT FX insert: the assigned channel (or the master bus) passes through the FX unit. */
  M.route = function () {
    var self = this, f = this.fx, out = H.out();
    ['A', 'B'].forEach(function (id) { try { self.ch[id].post.disconnect(); } catch (_) {} });
    try { this.fxu.output.disconnect(); } catch (_) {}
    try { this.bus.disconnect(); } catch (_) {}
    ['A', 'B'].forEach(function (id) { self.ch[id].post.connect(f.assign === id ? self.fxu.input : self.bus); });
    if (f.assign === 'M') { this.bus.connect(this.fxu.input); this.fxu.output.connect(out); }
    else { this.bus.connect(out); this.fxu.output.connect(out); }
  };
  M.setKnob = function (id, k, v) {
    var vals = this.vals[id]; if (!vals) return;
    v = clamp(v, -1, 1); vals[k] = v;
    var s = this.ch[id];
    if (s) {
      var t = ctx().currentTime;
      if (k === 'trim') s.trim.gain.setTargetAtTime(Math.pow(10, (v * 12) / 20), t, 0.02); // ±12 dB
      else if (k === 'hi' || k === 'mid' || k === 'low') s[k].gain.setTargetAtTime(v < 0 ? v * 26 : v * 6, t, 0.02); // −26 dB (kill) … +6 dB
      else if (k === 'color') {
        var f = s.color;
        if (Math.abs(v) < 0.03) { f.type = 'lowpass'; f.frequency.setTargetAtTime(22000, t, 0.03); f.Q.setTargetAtTime(0.7, t, 0.05); }
        else if (v < 0) { f.type = 'lowpass'; f.frequency.setTargetAtTime(150 * Math.pow(20000 / 150, 1 + v), t, 0.03); f.Q.setTargetAtTime(1.6, t, 0.05); }
        else { f.type = 'highpass'; f.frequency.setTargetAtTime(20 * Math.pow(7000 / 20, v), t, 0.03); f.Q.setTargetAtTime(1.6, t, 0.05); }
      }
    }
    if (this.paint) this.paint();
  };
  M.setFader = function (id, v) {
    v = clamp(v, 0, 1);
    if (decks[id]) decks[id].vol = v;
    var s = this.ch[id];
    if (s) s.fader.gain.setTargetAtTime(v * v, ctx().currentTime, 0.02); // audio taper
    var el = $('.p8-fader[data-ch="' + id + '"]'); if (el && document.activeElement !== el) el.value = Math.round(v * 100);
  };
  M.xfGain = function (x, side) {
    var p = side === 'A' ? 1 - x : x;
    if (this.curve === 'cut') return p > 0.04 ? 1 : p / 0.04;
    if (this.curve === 'mid') return Math.min(1, p * 2);
    return Math.sin(p * Math.PI / 2);
  };
  M.setXf = function (x) { this.xf = clamp(x, 0, 1); this.applyXf(); };
  M.applyXf = function () {
    if (!this.built) return;
    var t = ctx().currentTime, self = this;
    ['A', 'B'].forEach(function (id) { self.ch[id].xf.gain.setTargetAtTime(self.xfGain(self.xf, id), t, 0.008); });
  };
  M.setCurve = function (cv) { if (['smooth', 'mid', 'cut'].indexOf(cv) < 0) return; this.curve = cv; settings.curve = cv; saveSettings(); this.applyXf(); if (this.paint) this.paint(); };
  M.setCue = function (id, on) {
    var vals = this.vals[id]; if (!vals) return;
    vals.cue = on == null ? !vals.cue : !!on;
    if (this.ch[id]) this.ch[id].cue.gain.setTargetAtTime(vals.cue ? 1 : 0, ctx().currentTime, 0.02);
    if (vals.cue && this.hp.mode === 'off') H.toast('CUE ' + id + ': wybierz tryb słuchawek (SPLIT albo osobne wyjście) w sekcji 🎧', 2600);
    if (this.paint) this.paint();
  };
  // ---- headphones (CUE): SPLIT = master mono L / cue mono R on one output; DEVICE = cue on a 2nd output (setSinkId)
  M.buildHeadphones = function () {
    var c = ctx(), m = H.master();
    this.cueToPh = c.createGain(); this.masterToPh = c.createGain(); this.hpMix = c.createGain();
    this.cueBus.connect(this.cueToPh); this.cueToPh.connect(this.hpMix); this.masterToPh.connect(this.hpMix);
    var mono = function () { var g = c.createGain(); g.channelCount = 1; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; return g; };
    this.monoMaster = mono(); this.monoCue = mono();
    this.hpMix.connect(this.monoCue);
    this.merger = c.createChannelMerger(2);
    this.monoMaster.connect(this.merger, 0, 0); this.monoCue.connect(this.merger, 0, 1);
    this.splitOut = c.createGain(); this.splitOut.gain.value = 0;
    this.merger.connect(this.splitOut); this.splitOut.connect(c.destination);
    if (m) {
      this.normalOut = c.createGain();
      var detached = false;
      try { m.disconnect(c.destination); detached = true; } catch (_) {}
      if (detached) { m.connect(this.normalOut); this.normalOut.connect(c.destination); }
      else this.normalOut = null; // old browsers without selective disconnect: split mode unavailable
      m.connect(this.monoMaster); m.connect(this.masterToPh);
    }
    this.setHpMix(this.hp.mix);
    this.setHpMode(this.hp.mode, true);
  };
  M.setHpMix = function (v) {
    this.hp.mix = clamp(v, 0, 1); settings.hpMix = this.hp.mix; saveSettings();
    if (!this.cueToPh) return;
    var t = ctx().currentTime;
    this.cueToPh.gain.setTargetAtTime(1 - this.hp.mix, t, 0.02); this.masterToPh.gain.setTargetAtTime(this.hp.mix, t, 0.02);
  };
  M.sinkSupported = function () { var c = ctx(); return !!(global.HTMLMediaElement && HTMLMediaElement.prototype.setSinkId && c && c.createMediaStreamDestination); };
  M.setHpMode = function (mode, quiet) {
    if (['off', 'split', 'device'].indexOf(mode) < 0) mode = 'off';
    if (mode === 'device' && !this.sinkSupported()) { if (!quiet) H.toast('Osobne wyjście słuchawkowe nie jest wspierane tutaj (brak setSinkId) — używam SPLIT.', 3200); mode = 'split'; }
    if (mode === 'split' && this.splitOut && !this.normalOut) { if (!quiet) H.toast('SPLIT niedostępny w tej przeglądarce.', 2500); mode = 'off'; }
    this.hp.mode = mode; settings.hpMode = mode; saveSettings();
    if (this.splitOut) {
      var t = ctx().currentTime, split = mode === 'split';
      this.splitOut.gain.setTargetAtTime(split ? 1 : 0, t, 0.02);
      if (this.normalOut) this.normalOut.gain.setTargetAtTime(split ? 0 : 1, t, 0.02);
      if (mode === 'device') this.startDevice(); else this.stopDevice();
    }
    if (!quiet) H.toast(mode === 'split' ? '🎧 SPLIT: lewy = MASTER (mono), prawy = CUE (mono)' : mode === 'device' ? '🎧 CUE na osobnym wyjściu audio' : '🎧 CUE wyłączony', 2400);
    if (this.paint) this.paint();
  };
  M.startDevice = function () {
    var self = this, c = ctx();
    if (!this.cueDest) { this.cueDest = c.createMediaStreamDestination(); this.hpMix.connect(this.cueDest); }
    if (!this.cueEl) { this.cueEl = new Audio(); this.cueEl.autoplay = true; }
    this.cueEl.srcObject = this.cueDest.stream;
    var p = this.hp.sink && this.cueEl.setSinkId ? this.cueEl.setSinkId(this.hp.sink) : Promise.resolve();
    p.catch(function (e) { H.toast('🎧 Nie mogę ustawić wyjścia (' + (e && e.name) + ')', 2500); })
      .then(function () { var pp = self.cueEl.play(); if (pp && pp.catch) pp.catch(function () {}); });
  };
  M.stopDevice = function () { if (this.cueEl) { try { this.cueEl.pause(); } catch (_) {} } };
  M.listOutputs = function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve([]);
    return navigator.mediaDevices.enumerateDevices().then(function (l) { return l.filter(function (d) { return d.kind === 'audiooutput'; }); }).catch(function () { return []; });
  };
  M.setSink = function (id) { this.hp.sink = id || ''; settings.hpSink = this.hp.sink; saveSettings(); if (this.hp.mode === 'device') this.startDevice(); };
  // ---- MASTER deck
  M.setMaster = function (id) { this.master = id; this.followMaster(); paintAll(); };
  M.autoMaster = function () {
    var cur = this.master && decks[this.master];
    if (cur && cur.bpm && (cur.playing || !['A', 'B'].some(function (k) { return decks[k] && decks[k].playing; }))) return;
    var cand = ['A', 'B'].filter(function (k) { return decks[k] && decks[k].playing && decks[k].bpm && !decks[k].syncOn; })[0]
      || ['A', 'B'].filter(function (k) { return decks[k] && decks[k].playing && decks[k].bpm; })[0];
    if (cand && cand !== this.master) { this.master = cand; this.followMaster(); }
    paintAll();
  };
  M.followMaster = function () {
    var m = this.master;
    ['A', 'B'].forEach(function (k) { var d = decks[k]; if (d && d.syncOn && k !== m) d.doSync(false); });
    if (this.fx.on && this.built) this.fxu.setBpm(this.fxBpm(), this.fx.beats);
  };
  M.fxBpm = function () {
    var a = this.fx.assign, d = a !== 'M' ? decks[a] : (this.master && decks[this.master]);
    if (a === 'M' && !(d && d.playing)) d = ['A', 'B'].map(function (k) { return decks[k]; }).filter(function (x) { return x && x.playing && x.bpm; })[0] || d;
    return (d && d.effBpm()) || (H.bpm && H.bpm()) || 128;
  };
  M.setFx = function (o) {
    var f = this.fx;
    if (o.type && ['echo', 'reverb', 'flanger', 'roll'].indexOf(o.type) >= 0) { if (o.type !== f.type && f.on && this.built) this.fxu.set(f.type, false, f.level, this.fxBpm(), f.beats); f.type = o.type; settings.fxType = o.type; }
    if (o.beats && FX_BEATS.indexOf(o.beats) >= 0) { f.beats = o.beats; settings.fxBeats = o.beats; }
    if (o.assign && ['A', 'B', 'M'].indexOf(o.assign) >= 0 && o.assign !== f.assign) { f.assign = o.assign; settings.fxAssign = o.assign; if (this.built) this.route(); }
    if (o.level != null) { f.level = clamp(o.level, 0, 1); settings.fxLevel = f.level; }
    if (o.on != null) f.on = !!o.on;
    saveSettings();
    if (this.built) this.fxu.set(f.type, f.on, f.level, this.fxBpm(), f.beats, o.beats != null);
    if (this.paint) this.paint();
  };
  M.fxStep = function (dir) { var i = FX_BEATS.indexOf(this.fx.beats); this.setFx({ beats: FX_BEATS[clamp(i + dir, 0, FX_BEATS.length - 1)] }); };

  // ======================================================================= BEAT FX unit (insert)
  function BeatFx(c) {
    this.c = c; this.input = c.createGain(); this.output = c.createGain();
    this.dry = c.createGain(); this.input.connect(this.dry); this.dry.connect(this.output);
    var mk = function (self, k, delayMax) {
      self[k + 'In'] = c.createGain(); self[k + 'In'].gain.value = 0;
      self[k + 'Wet'] = c.createGain(); self[k + 'Wet'].gain.value = 0;
      self.input.connect(self[k + 'In']); self[k + 'Wet'].connect(self.output);
    };
    mk(this, 'e'); this.eDelay = c.createDelay(4); this.eFb = c.createGain(); this.eFb.gain.value = 0.5;
    this.eIn.connect(this.eDelay); this.eDelay.connect(this.eFb); this.eFb.connect(this.eDelay); this.eDelay.connect(this.eWet);
    mk(this, 'r'); this.rConv = c.createConvolver(); this.rConv.buffer = this.impulse(2.4);
    this.rIn.connect(this.rConv); this.rConv.connect(this.rWet);
    mk(this, 'f'); this.fDelay = c.createDelay(0.05); this.fDelay.delayTime.value = 0.004; this.fFb = c.createGain(); this.fFb.gain.value = 0.6;
    this.lfo = c.createOscillator(); this.lfo.type = 'triangle'; this.lfo.frequency.value = 0.25; this.lfoG = c.createGain(); this.lfoG.gain.value = 0.0032;
    this.lfo.connect(this.lfoG); this.lfoG.connect(this.fDelay.delayTime); this.lfo.start();
    this.fIn.connect(this.fDelay); this.fDelay.connect(this.fFb); this.fFb.connect(this.fDelay); this.fDelay.connect(this.fWet);
    mk(this, 'rl'); this.rlDelay = c.createDelay(4); this.rlFb = c.createGain(); this.rlFb.gain.value = 0;
    this.rlIn.connect(this.rlDelay); this.rlDelay.connect(this.rlFb); this.rlFb.connect(this.rlDelay); this.rlDelay.connect(this.rlWet);
    this.cur = { type: null, on: false }; this.rollLen = 0.5;
  }
  BeatFx.prototype.impulse = function (sec) {
    var c = this.c, sr = c.sampleRate, n = Math.floor(sr * sec), b = c.createBuffer(2, n, sr);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
    return b;
  };
  BeatFx.prototype.setBpm = function (bpm, beats) {
    var t = this.c.currentTime, len = clamp(60 / (bpm || 128) * beats, 0.01, 3.9);
    this.eDelay.delayTime.setTargetAtTime(len, t, 0.02);
    this.lfo.frequency.setTargetAtTime(1 / Math.max(0.05, len * 4), t, 0.05); // flanger sweep = 4× beat value
    this.rollLen = len;
  };
  BeatFx.prototype.set = function (type, on, level, bpm, beats, beatChanged) {
    var t = this.c.currentTime, T = 0.015, self = this;
    this.setBpm(bpm, beats);
    var wasRoll = this.cur.type === 'roll' && this.cur.on, roll = on && type === 'roll';
    ['e', 'r', 'f'].forEach(function (k) { self[k + 'In'].gain.setTargetAtTime(0, t, T); self[k + 'Wet'].gain.setTargetAtTime(0, t, T); });
    if (!roll || (wasRoll && beatChanged)) {
      ['rlIn', 'rlFb', 'rlWet', 'dry'].forEach(function (k) { var p = k === 'dry' ? self.dry.gain : self[k].gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); });
      this.rlIn.gain.setValueAtTime(0, t); this.rlFb.gain.setValueAtTime(0, t); this.rlWet.gain.setValueAtTime(0, t);
      this.dry.gain.setTargetAtTime(1, t, T);
      wasRoll = false;
    }
    if (on) {
      if (type === 'echo') { this.eIn.gain.setTargetAtTime(1, t, T); this.eWet.gain.setTargetAtTime(0.25 + level * 0.75, t, T); this.eFb.gain.setTargetAtTime(0.3 + level * 0.35, t, T); }
      else if (type === 'reverb') { this.rIn.gain.setTargetAtTime(1, t, T); this.rWet.gain.setTargetAtTime(level * 1.1, t, T); this.dry.gain.setTargetAtTime(1 - level * 0.35, t, T); }
      else if (type === 'flanger') { this.fIn.gain.setTargetAtTime(1, t, T); this.fWet.gain.setTargetAtTime(0.4 + level * 0.6, t, T); this.fFb.gain.setTargetAtTime(0.3 + level * 0.55, t, T); }
      else if (type === 'roll' && !wasRoll) {
        // record exactly one slice, then loop it (feedback 1) and mute the dry signal once the slice is captured
        var len = this.rollLen, dryTo = 1 - Math.max(0.7, level);
        this.rlDelay.delayTime.cancelScheduledValues(t); this.rlDelay.delayTime.setValueAtTime(len, t);
        this.rlIn.gain.setValueAtTime(1, t + 0.001); this.rlIn.gain.setValueAtTime(0, t + len);
        this.rlFb.gain.setValueAtTime(1, t + len);
        this.rlWet.gain.setValueAtTime(1, t + len);
        this.dry.gain.setValueAtTime(1, t); this.dry.gain.setValueAtTime(dryTo, t + len);
      } else if (type === 'roll') { this.dry.gain.setTargetAtTime(1 - Math.max(0.7, level), t, T); }
    }
    this.cur = { type: type, on: on };
  };

  // ======================================================================= UI
  function knobHtml(cls, label, ch, k, title) {
    return '<div class="p8-knob-w"><div class="p8-knob ' + cls + '" tabindex="0" role="slider" aria-label="' + esc(title || label) + ' ' + ch + '" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0" data-ch="' + ch + '" data-k="' + k + '" title="' + esc(title || label) + ' · przeciągnij góra/dół · 2× klik = środek"><i></i></div><span>' + label + '</span></div>';
  }
  function deckHtml(id) {
    var pads = '', i;
    for (i = 0; i < 8; i++) pads += '<button type="button" class="p8-pad" data-i="' + i + '" style="--pc:' + HOT_COLORS[i] + '">' + 'ABCDEFGH'[i] + '</button>';
    var sizes = LOOP_SIZES.map(function (b) { return '<button type="button" class="p8-lsz" data-b="' + b + '" title="Auto beat loop ' + fracLabel(b) + '">' + fracLabel(b) + '</button>'; }).join('');
    return '' +
      '<div class="sx-card-head p8-head"><span class="sx-deckname">' + id + '</span><span class="sx-track">—</span><span class="p8-bpmbox"><b class="sx-bpm">—</b><small>BPM</small></span></div>' +
      '<div class="p8-info"><span class="sx-time"><span class="sx-pos">0:00</span><span class="p8-sep">/</span><span class="sx-dur">0:00</span><span class="p8-rem">-0:00</span></span>' +
      '<span class="p8-ind p8-ind-tempo">+0.00%</span><span class="p8-ind p8-ind-range">±10</span><span class="p8-ind p8-ind-mt">MT</span><span class="p8-ind p8-ind-master">MASTER</span><span class="p8-ind p8-ind-sync">SYNC</span><span class="p8-ind p8-ind-loop">LOOP</span><span class="p8-ind p8-ind-slip">SLIP</span></div>' +
      '<div class="p8-wave"><canvas class="p8-zoom" title="Zoom waveform · przeciągnij = scratch/nudge" aria-label="Zoom waveform deck ' + id + '"></canvas><div class="p8-zoomctl"><button type="button" class="p8-zin" title="Zoom +" aria-label="Zoom +">+</button><button type="button" class="p8-zout" title="Zoom −" aria-label="Zoom −">−</button></div></div>' +
      '<canvas class="p8-ov" title="Overview — kliknij / przeciągnij: needle search" aria-label="Overview waveform deck ' + id + '"></canvas>' +
      '<canvas class="p8-phase" title="Phase meter (takt + przesunięcie fazy względem MASTER)" aria-label="Phase meter deck ' + id + '"></canvas>' +
      '<div class="p8-src"><select class="sx-select sx-deck-src" aria-label="Utwór deck ' + id + '"></select><label class="sx-btn sm sx-file" title="Wczytaj plik z urządzenia">📂<input type="file" accept="audio/*" /></label></div>' +
      '<div class="p8-main">' +
        '<div class="p8-trans">' +
          '<button type="button" class="p8-big sx-cue" title="CUE (CDJ): pauza → ustaw / przytrzymaj = podgląd; gra → wróć do CUE">CUE</button>' +
          '<button type="button" class="p8-big sx-play" title="PLAY / PAUSE" aria-label="Play / pauza deck ' + id + '">▶</button>' +
          '<div class="p8-mini">' +
            '<button type="button" class="p8-t p8-rev" title="REVERSE">REV</button>' +
            '<button type="button" class="p8-t p8-slip" title="SLIP — po pętli / scratchu / reverse / hot cue wraca tam, gdzie byłby utwór">SLIP</button>' +
            '<button type="button" class="p8-t p8-quant" title="QUANTIZE — cue / pętle / skoki do siatki beatów">QUANT</button>' +
            '<button type="button" class="p8-t p8-vinyl" title="VINYL — jog: środek = scratch, krawędź = pitch bend">VINYL</button>' +
          '</div>' +
        '</div>' +
        '<div class="p8-jog" title="Jog: przeciągnij w kółko · VINYL: środek = scratch · krawędź = pitch bend · pauza = przeszukiwanie · kółko myszy = bend"><div class="p8-platter"><div class="p8-mark"></div><div class="p8-ring"></div><div class="p8-center"><b class="p8-jog-bpm">—</b><small class="p8-jog-t">0:00</small></div></div></div>' +
        '<div class="p8-tempo">' +
          '<button type="button" class="p8-t p8-sync sx-sync" title="SYNC — tempo + faza do MASTER">SYNC</button>' +
          '<button type="button" class="p8-t p8-master" title="MASTER — ten deck prowadzi tempo">MASTER</button>' +
          '<button type="button" class="p8-t p8-mtb" title="MASTER TEMPO (key lock)">KEY</button>' +
          '<input type="range" class="p8-pitch" min="-1000" max="1000" value="0" step="1" aria-label="Tempo deck ' + id + '" title="Tempo (w dół = szybciej, jak w CDJ) · 2× klik = 0" />' +
          '<button type="button" class="p8-t p8-rng" title="Zakres tempa ±6 / ±10 / ±16 / WIDE">±10</button>' +
          '<button type="button" class="p8-t p8-t0" title="Tempo reset (0%)">0%</button>' +
        '</div>' +
      '</div>' +
      '<div class="p8-sec"><span class="sx-label">HOT CUE</span><button type="button" class="p8-t p8-del" title="Tryb usuwania hot cue (albo Shift+klik / prawy klik)">DEL</button></div>' +
      '<div class="p8-pads">' + pads + '</div>' +
      '<div class="p8-sec"><span class="sx-label">LOOP</span><span class="p8-loopinfo">—</span></div>' +
      '<div class="p8-loop">' +
        '<button type="button" class="p8-t p8-lin" title="LOOP IN">IN</button><button type="button" class="p8-t p8-lout" title="LOOP OUT">OUT</button>' +
        '<button type="button" class="p8-t p8-relo" title="RELOOP / EXIT">RELOOP</button>' +
        '<button type="button" class="p8-t p8-lhalf" title="Pętla ½">½</button><button type="button" class="p8-t p8-ldbl" title="Pętla ×2">×2</button>' +
        '<button type="button" class="p8-t p8-bjl" title="BEAT JUMP wstecz (rozmiar = wybrany loop)">◀◀</button><button type="button" class="p8-t p8-bjr" title="BEAT JUMP naprzód">▶▶</button>' +
      '</div>' +
      '<div class="p8-lsizes">' + sizes + '</div>';
  }
  function mixerHtml() {
    var ch = function (id) {
      return '<div class="p8-ch" data-ch="' + id + '"><b class="p8-chn">CH ' + id + '</b>' +
        knobHtml('trim', 'TRIM', id, 'trim', 'TRIM (±12 dB)') + knobHtml('hi', 'HI', id, 'hi', 'EQ HI') + knobHtml('mid', 'MID', id, 'mid', 'EQ MID') + knobHtml('low', 'LOW', id, 'low', 'EQ LOW') +
        knobHtml('color', 'COLOR', id, 'color', 'COLOR FX · FILTER (lewo LPF · prawo HPF)') +
        '<button type="button" class="p8-t p8-cuech" data-ch="' + id + '" title="Odsłuch CUE kanału ' + id + ' na słuchawkach">🎧 CUE</button>' +
        '<div class="p8-fwrap"><canvas class="p8-meter" data-ch="' + id + '" width="10" height="96"></canvas>' +
        '<input type="range" class="p8-fader" data-ch="' + id + '" min="0" max="100" value="85" aria-label="Channel fader ' + id + '" title="Channel fader ' + id + '" /></div></div>';
    };
    var beats = FX_BEATS.map(function (b) { return '<option value="' + b + '">' + fracLabel(b) + '</option>'; }).join('');
    return '<div class="p8-chs">' + ch('A') + ch('B') + '</div>' +
      '<div class="p8-xfw"><span class="sx-label">Krzywa X-fadera</span><select class="p8-curve sx-select" aria-label="Krzywa crossfadera"><option value="smooth">◠ smooth</option><option value="mid">⌒ mid</option><option value="cut">⊓ cut (scratch)</option></select></div>' +
      '<div class="p8-bfx"><div class="p8-sec"><span class="sx-label">BEAT FX</span><span class="p8-fxbpm">— BPM</span></div>' +
        '<div class="p8-fxsel"><select class="sx-select p8-fxtype" aria-label="Beat FX"><option value="echo">ECHO</option><option value="reverb">REVERB</option><option value="flanger">FLANGER</option><option value="roll">ROLL</option></select>' +
        '<select class="sx-select p8-fxbeat" aria-label="Beat">' + beats + '</select>' +
        '<select class="sx-select p8-fxch" aria-label="Kanał FX"><option value="M">MST</option><option value="A">CH A</option><option value="B">CH B</option></select></div>' +
        '<div class="p8-fxrow">' + knobHtml('fxlvl', 'LEVEL', 'FX', 'level', 'LEVEL / DEPTH') + '<button type="button" class="p8-t p8-fxon" title="BEAT FX ON/OFF (V)">FX ON</button></div></div>' +
      '<div class="p8-hp"><div class="p8-sec"><span class="sx-label">🎧 Słuchawki</span></div>' +
        '<div class="p8-fxrow"><select class="sx-select p8-hpmode" aria-label="Tryb słuchawek"><option value="off">CUE off</option><option value="split">SPLIT L=mst R=cue</option><option value="device">Osobne wyjście</option></select>' +
        knobHtml('hpmix', 'CUE↔MST', 'HP', 'hpmix', 'Miks słuchawek CUE ↔ MASTER') + '</div>' +
        '<select class="sx-select p8-hpdev" aria-label="Wyjście słuchawek" hidden></select></div>';
  }
  // knob widget: vertical drag / wheel / arrows / dbl-click reset
  function bindKnob(el, get, set, bipolar) {
    var startY = 0, startV = 0, drag = false, lo = bipolar ? -1 : 0, mid = bipolar ? 0 : 0.5;
    function paint() { var v = get(); el.style.setProperty('--v', String(bipolar ? v : v * 2 - 1)); el.setAttribute('aria-valuenow', String(Math.round(v * 100))); el.classList.toggle('moved', Math.abs(v - mid) > 0.02); }
    el.addEventListener('pointerdown', function (e) { drag = true; startY = e.clientY; startV = get(); try { el.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
    el.addEventListener('pointermove', function (e) { if (!drag) return; set(clamp(startV + (startY - e.clientY) / (bipolar ? 80 : 160), lo, 1)); paint(); });
    var up = function () { drag = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', function () { set(mid); paint(); });
    el.addEventListener('wheel', function (e) { e.preventDefault(); set(clamp(get() - Math.sign(e.deltaY) * 0.05, lo, 1)); paint(); }, { passive: false });
    el.addEventListener('keydown', function (e) {
      var dv = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.05 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -0.05 : 0;
      if (dv) { set(clamp(get() + dv, lo, 1)); paint(); e.preventDefault(); e.stopPropagation(); }
    });
    el.__paint = paint; paint();
  }

  function bindDeckUi(d) {
    var el = d.el, q = function (s) { return $(s, el); };
    var press = function (sel, down, up) {
      var b = q(sel); if (!b) return;
      b.addEventListener('pointerdown', function (e) { if (e.button > 0) return; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} down(e); });
      if (up) { b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); }
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) down(e); } });
      if (up) b.addEventListener('keyup', function (e) { if (e.key === 'Enter' || e.key === ' ') up(e); });
    };
    press('.sx-cue', function () { d.cueDown(); }, function () { d.cueUp(); });
    press('.sx-play', function () { d.playPress(); });
    var click = function (sel, fn) { var b = q(sel); if (b) b.addEventListener('click', fn); };
    click('.p8-rev', function () { d.setReverse(); });
    click('.p8-slip', function () { d.setSlip(); });
    click('.p8-quant', function () { d.setQuantize(); });
    click('.p8-vinyl', function () { d.setVinyl(); });
    click('.p8-sync', function () { d.setSync(); });
    click('.p8-master', function () { d.setMaster(); });
    click('.p8-mtb', function () { d.setKeyLock(); });
    click('.p8-rng', function () { d.setRange(); });
    click('.p8-t0', function () { d.tempoReset(); });
    click('.p8-del', function () { d.delMode = !d.delMode; paintDeck(d); });
    click('.p8-lin', function () { d.loopIn(); });
    click('.p8-lout', function () { d.loopOut(); });
    click('.p8-relo', function () { d.reloop(); });
    click('.p8-lhalf', function () { d.loopResize(0.5); });
    click('.p8-ldbl', function () { d.loopResize(2); });
    click('.p8-bjl', function () { d.beatJump(-d.loop.beats); });
    click('.p8-bjr', function () { d.beatJump(d.loop.beats); });
    click('.p8-zin', function () { d.zoom = clamp(d.zoom / 1.5, 2, 32); });
    click('.p8-zout', function () { d.zoom = clamp(d.zoom * 1.5, 2, 32); });
    $$('.p8-lsz', el).forEach(function (b) { b.addEventListener('click', function () { var v = Number(b.getAttribute('data-b')); d.autoLoop(v); }); });
    $$('.p8-pad', el).forEach(function (b) {
      var i = Number(b.getAttribute('data-i'));
      b.addEventListener('pointerdown', function (e) {
        if (e.button > 0) return; e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (_) {}
        if (e.shiftKey || e.altKey) d.hotDelete(i); else d.hotDown(i);
      });
      var up = function () { d.hotUp(i); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); d.hotDelete(i); });
      b.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); if (e.shiftKey) d.hotDelete(i); else d.hotDown(i); } });
      b.addEventListener('keyup', function (e) { if (e.key === 'Enter' || e.key === ' ') d.hotUp(i); });
    });
    var pitch = q('.p8-pitch');
    pitch.addEventListener('input', function () { d.setTempo(-Number(pitch.value) / 1000, true); }); // CDJ: slider down (+) = faster
    pitch.addEventListener('dblclick', function () { d.tempoReset(); });
    // overview: needle search
    var ov = q('.p8-ov'), ovDrag = false;
    var ovSeek = function (e) { if (!d.buffer) return; var r = ov.getBoundingClientRect(); d.seek(clamp((e.clientX - r.left) / r.width, 0, 1) * d.duration); };
    ov.addEventListener('pointerdown', function (e) { if (!d.buffer) { d.prepare(); return; } ovDrag = true; try { ov.setPointerCapture(e.pointerId); } catch (_) {} ovSeek(e); });
    ov.addEventListener('pointermove', function (e) { if (ovDrag) ovSeek(e); });
    ov.addEventListener('pointerup', function () { ovDrag = false; });
    ov.addEventListener('pointercancel', function () { ovDrag = false; });
    // zoom waveform: drag = scratch (VINYL) / nudge / search
    var zc = q('.p8-zoom'), zx = 0, zDrag = false;
    zc.addEventListener('pointerdown', function (e) { if (!d.buffer) return; zDrag = true; zx = e.clientX; try { zc.setPointerCapture(e.pointerId); } catch (_) {} d.jogStart(d.vinyl && d.playing); });
    zc.addEventListener('pointermove', function (e) { if (!zDrag) return; var w = zc.getBoundingClientRect().width || 1, dx = e.clientX - zx; zx = e.clientX; d.jogMove(-dx / w * d.zoom / SEC_PER_REV); });
    var zup = function () { if (zDrag) { zDrag = false; d.jogEnd(); } };
    zc.addEventListener('pointerup', zup); zc.addEventListener('pointercancel', zup);
    // jog wheel (touch + mouse)
    var jog = q('.p8-platter'), jDrag = false, lastA = 0;
    var ang = function (e) { var r = jog.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    jog.addEventListener('pointerdown', function (e) {
      if (!d.buffer) { d.prepare(); return; }
      e.preventDefault(); jDrag = true; lastA = ang(e);
      try { jog.setPointerCapture(e.pointerId); } catch (_) {}
      var r = jog.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      d.jogStart(d.vinyl && Math.sqrt(dx * dx + dy * dy) < r.width * 0.36);
      jog.classList.add('touch');
    });
    jog.addEventListener('pointermove', function (e) {
      if (!jDrag) return;
      var a = ang(e), da = a - lastA;
      if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      lastA = a; d.jogMove(da / (2 * Math.PI));
    });
    var jup = function () { if (!jDrag) return; jDrag = false; jog.classList.remove('touch'); d.jogEnd(); };
    jog.addEventListener('pointerup', jup); jog.addEventListener('pointercancel', jup);
    jog.addEventListener('wheel', function (e) { if (!d.buffer) return; e.preventDefault(); var was = d.jogMode; if (!was) d.jogMode = d.playing ? 'bend' : 'search'; d.jogMove(-e.deltaY / 4000); if (!was) d.jogMode = null; }, { passive: false });
  }

  function paintDeck(d) {
    var el = d.el; if (!el) return;
    var q = function (s) { return $(s, el); }, mst = !!(mixer && mixer.master === d.id);
    el.classList.toggle('playing', d.playing || d.scratching);
    el.classList.toggle('loading', d.state === 'loading');
    var tog = function (sel, on) { var b = q(sel); if (b) b.classList.toggle('on', !!on); };
    tog('.sx-play', d.playing); tog('.p8-rev', d.reverse); tog('.p8-slip', d.slip); tog('.p8-quant', d.quantize); tog('.p8-vinyl', d.vinyl);
    tog('.p8-sync', d.syncOn); tog('.p8-master', mst); tog('.p8-mtb', d.keyLock); tog('.p8-del', d.delMode);
    tog('.p8-relo', d.loop.active); tog('.p8-lin', d.loop.in != null); tog('.p8-lout', d.loop.active);
    var cue = q('.sx-cue'); if (cue) { cue.classList.toggle('blink', !d.playing && !!d.buffer && Math.abs(d.pos() - d.cuePoint) > 0.05); cue.classList.toggle('on', d.cueHeld); }
    var pb = q('.sx-play'); if (pb) { pb.textContent = d.playing ? '❚❚' : '▶'; pb.classList.toggle('blink', !d.playing && !!d.buffer); }
    q('.sx-track').textContent = d.track ? d.track.name + (d.state === 'loading' ? ' · wczytuję…' : d.state === 'error' ? ' · błąd' : '') : '—';
    var eb = d.effBpm();
    q('.sx-bpm').textContent = eb ? eb.toFixed(1) : (d.track ? '…' : '—');
    q('.p8-jog-bpm').textContent = eb ? eb.toFixed(1) : '—';
    var pct = d.tempoPct();
    q('.p8-ind-tempo').textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    q('.p8-ind-range').textContent = RANGE_LABEL[d.range];
    q('.p8-rng').textContent = RANGE_LABEL[d.range];
    q('.p8-ind-mt').classList.toggle('on', d.keyLock);
    q('.p8-ind-master').classList.toggle('on', mst);
    q('.p8-ind-sync').classList.toggle('on', d.syncOn);
    q('.p8-ind-loop').classList.toggle('on', d.loop.active);
    q('.p8-ind-slip').classList.toggle('on', !!d.slipState || d.slip);
    var pitch = q('.p8-pitch'); if (pitch && document.activeElement !== pitch) pitch.value = String(Math.round(-d.tempo * 1000));
    $$('.p8-pad', el).forEach(function (b, i) { var h = d.hot[i]; b.classList.toggle('set', !!h); b.title = 'HOT CUE ' + 'ABCDEFGH'[i] + (h ? ' · ' + fmt(h.t) : ' · pusty') + ' — tap: ustaw / skocz · Shift, DEL albo prawy klik: usuń'; });
    $$('.p8-lsz', el).forEach(function (b) { var v = Number(b.getAttribute('data-b')); b.classList.toggle('on', v === d.loop.beats); b.classList.toggle('act', d.loop.active && v === d.loop.beats); });
    var li = q('.p8-loopinfo');
    if (li) li.textContent = d.loop.in != null && d.loop.out != null ? (d.loop.active ? '● ' : '○ ') + fracLabel(Math.round((d.loop.out - d.loop.in) / d.spb() * 1000) / 1000) + ' beat · ' + fmt(d.loop.in) + '–' + fmt(d.loop.out) : (d.loop.in != null ? 'IN ' + fmt(d.loop.in) : 'auto ' + fracLabel(d.loop.beats));
    paintTime(d);
  }
  function paintTime(d) {
    var el = d.el; if (!el) return;
    var p = d.pos();
    $('.sx-pos', el).textContent = fmt(p);
    $('.sx-dur', el).textContent = fmt(d.duration);
    $('.p8-rem', el).textContent = '-' + fmt(d.duration - p);
    $('.p8-jog-t', el).textContent = fmt(p);
  }
  function paintAll() { Object.keys(decks).forEach(function (k) { paintDeck(decks[k]); }); if (mixer && mixer.paint) mixer.paint(); }

  // ---- canvases
  function fitCanvas(c) {
    var r = c.getBoundingClientRect(), dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return { w: w, h: h, dpr: dpr };
  }
  function hue(lo) { return Math.round(205 - 205 * clamp(lo * 1.4, 0, 1)); }
  function drawOverview(d) {
    var c = $('.p8-ov', d.el); if (!c) return;
    var z = fitCanvas(c), g = c.getContext('2d'), W = z.w, Hh = z.h, an = d.analysis;
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(0, 0, W, Hh);
    if (!an || !d.duration) { g.fillStyle = 'rgba(255,255,255,.3)'; g.font = (11 * z.dpr) + 'px system-ui,sans-serif'; g.fillText(d.state === 'loading' ? 'wczytuję i analizuję BPM…' : d.state === 'error' ? 'błąd wczytywania' : d.track ? 'START / ▶ wczyta utwór' : '—', 6 * z.dpr, Hh / 2 + 4 * z.dpr); return; }
    if (!d.ovCache || d.ovCache.w !== W || d.ovCache.an !== an) {
      var cols = new Float32Array(W), lows = new Float32Array(W), n = an.zMax.length;
      for (var x = 0; x < W; x++) {
        var a = Math.floor(x / W * n), b = Math.max(a + 1, Math.floor((x + 1) / W * n)), m = 0, l = 0;
        for (var i = a; i < b && i < n; i++) { if (an.zMax[i] > m) m = an.zMax[i]; l += an.zLow[i]; }
        cols[x] = m; lows[x] = l / Math.max(1, b - a);
      }
      d.ovCache = { w: W, an: an, cols: cols, lows: lows };
    }
    var p = d.pos(), px = Math.round(p / d.duration * W), mid = Hh / 2, C = d.ovCache;
    for (var x2 = 0; x2 < W; x2++) {
      var v = C.cols[x2] * (Hh * 0.48);
      g.fillStyle = x2 < px ? 'rgba(140,150,170,.5)' : 'hsl(' + hue(C.lows[x2]) + ',90%,58%)';
      g.fillRect(x2, mid - v, 1, Math.max(1, v * 2));
    }
    if (d.loop.in != null && d.loop.out != null) { g.fillStyle = d.loop.active ? 'rgba(255,181,71,.3)' : 'rgba(255,181,71,.12)'; g.fillRect(d.loop.in / d.duration * W, 0, Math.max(2, (d.loop.out - d.loop.in) / d.duration * W), Hh); }
    d.hot.forEach(function (h) { if (!h) return; var hx = h.t / d.duration * W; g.fillStyle = h.c; g.beginPath(); g.moveTo(hx - 4 * z.dpr, 0); g.lineTo(hx + 4 * z.dpr, 0); g.lineTo(hx, 6 * z.dpr); g.fill(); g.fillRect(hx, 0, 1, Hh); });
    var cx = d.cuePoint / d.duration * W; g.fillStyle = '#ffb547'; g.beginPath(); g.moveTo(cx - 4 * z.dpr, Hh); g.lineTo(cx + 4 * z.dpr, Hh); g.lineTo(cx, Hh - 6 * z.dpr); g.fill();
    var sp = d.slipPos(); if (sp != null) { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(sp / d.duration * W, 0, 1, Hh); }
    g.fillStyle = '#fff'; g.fillRect(px - 1, 0, 2, Hh);
  }
  function drawZoom(d) {
    var c = $('.p8-zoom', d.el); if (!c) return;
    var z = fitCanvas(c), g = c.getContext('2d'), W = z.w, Hh = z.h, an = d.analysis;
    g.fillStyle = '#05060a'; g.fillRect(0, 0, W, Hh);
    if (!an) return;
    var span = d.zoom, p = d.pos(), t0 = p - span / 2, sec2x = W / span, mid = Hh / 2, n = an.zMax.length;
    if (d.loop.in != null && d.loop.out != null) { g.fillStyle = d.loop.active ? 'rgba(255,181,71,.22)' : 'rgba(255,181,71,.09)'; g.fillRect((d.loop.in - t0) * sec2x, 0, (d.loop.out - d.loop.in) * sec2x, Hh); }
    if (d.bpm) {
      var spb = d.spb(), b0 = Math.ceil((t0 - d.firstBeat) / spb), b1 = Math.floor((t0 + span - d.firstBeat) / spb);
      g.font = (9 * z.dpr) + 'px system-ui,sans-serif';
      for (var b = b0; b <= b1; b++) {
        var bx = (d.firstBeat + b * spb - t0) * sec2x, bar = ((b % 4) + 4) % 4 === 0;
        g.fillStyle = bar ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.14)';
        g.fillRect(Math.round(bx), 0, bar ? 2 : 1, Hh);
        if (bar && b >= 0) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(String(Math.floor(b / 4) + 1), bx + 3 * z.dpr, 10 * z.dpr); }
      }
    }
    for (var x = 0; x < W; x++) {
      var t = t0 + x / sec2x; if (t < 0 || t >= d.duration) continue;
      var i = Math.floor(t * ZOOM_RES); if (i >= n) continue;
      var v = an.zMax[i] * Hh * 0.46;
      g.fillStyle = 'hsl(' + hue(an.zLow[i]) + ',90%,' + (x < W / 2 ? 44 : 60) + '%)';
      g.fillRect(x, mid - v, 1, Math.max(1, v * 2));
    }
    g.font = 'bold ' + (10 * z.dpr) + 'px system-ui,sans-serif';
    d.hot.forEach(function (h, i) { if (!h) return; var hx = (h.t - t0) * sec2x; if (hx < -10 || hx > W + 10) return; g.fillStyle = h.c; g.fillRect(hx, 0, 2, Hh); g.fillText('ABCDEFGH'[i], hx + 3 * z.dpr, Hh - 4 * z.dpr); });
    var cx = (d.cuePoint - t0) * sec2x; g.fillStyle = '#ffb547'; g.fillRect(cx, 0, 2, Hh);
    var sp = d.slipPos(); if (sp != null) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect((sp - t0) * sec2x, 0, 2, Hh); }
    g.fillStyle = '#ff3b3b'; g.fillRect(W / 2 - 1, 0, 2, Hh);
  }
  function drawPhase(d) {
    var c = $('.p8-phase', d.el); if (!c) return;
    var z = fitCanvas(c), g = c.getContext('2d'), W = z.w, Hh = z.h;
    g.clearRect(0, 0, W, Hh);
    var seg = W / 4, gap = 3 * z.dpr, col = d.id === 'A' ? '#00e5ff' : '#ff2d95';
    var beat = d.buffer && d.bpm ? d.beatAt(d.pos()) : null, idx = beat == null ? -1 : ((Math.floor(beat) % 4) + 4) % 4;
    for (var i = 0; i < 4; i++) { g.fillStyle = i === idx ? col : 'rgba(255,255,255,.1)'; g.fillRect(i * seg + gap / 2, 0, seg - gap, Hh * 0.45); }
    var pd = d.phaseDiff();
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, Hh * 0.62, W, Hh * 0.3);
    g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(W / 2 - 1, Hh * 0.55, 2, Hh * 0.45);
    if (pd != null) { g.fillStyle = Math.abs(pd) < 0.04 ? '#b8ff3c' : '#ffb547'; var px = W / 2 + pd * W; g.fillRect(Math.min(px, W / 2), Hh * 0.62, Math.max(2, Math.abs(px - W / 2)), Hh * 0.3); }
  }
  function drawMeters() {
    if (!mixer || !mixer.built) return;
    ['A', 'B'].forEach(function (id) {
      var s = mixer.ch[id], c = $('.p8-meter[data-ch="' + id + '"]'); if (!c || !s) return;
      var buf = s.meterBuf; if (s.meter.getFloatTimeDomainData) s.meter.getFloatTimeDomainData(buf);
      var m = 0; for (var i = 0; i < buf.length; i++) { var a = buf[i] < 0 ? -buf[i] : buf[i]; if (a > m) m = a; }
      s.peak = Math.max(m, (s.peak || 0) * 0.92);
      var g = c.getContext('2d'), W = c.width, Hh = c.height, segs = 15, lit = Math.round(clamp(s.peak, 0, 1) * segs);
      g.clearRect(0, 0, W, Hh);
      for (var k = 0; k < segs; k++) { var y = Hh - (k + 1) * (Hh / segs); g.fillStyle = k < lit ? (k > 12 ? '#ff3b3b' : k > 9 ? '#ffb547' : '#32d74b') : 'rgba(255,255,255,.08)'; g.fillRect(1, y + 1, W - 2, Hh / segs - 2); }
    });
  }
  var visible = true, lastPaint = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    Object.keys(decks).forEach(function (k) {
      var d = decks[k]; d.tick();
      if (!visible || !d.el) return;
      drawZoom(d); drawOverview(d); drawPhase(d); paintTime(d);
      var mk = $('.p8-mark', d.el); if (mk) mk.style.transform = 'rotate(' + ((d.pos() / SEC_PER_REV) * 360 % 360) + 'deg)';
    });
    if (visible) drawMeters();
    if (ts - lastPaint > 500) { lastPaint = ts; var fxb = $('.p8-fxbpm'); if (fxb && mixer) fxb.textContent = (Math.round(mixer.fxBpm() * 10) / 10) + ' BPM'; Object.keys(decks).forEach(function (k) { var dd = decks[k]; if (dd.playing) paintDeck(dd); }); }
  }

  function bindMixerUi() {
    var root = $('.p8-mixer-ch'); if (!root) return;
    root.innerHTML = mixerHtml();
    $$('.p8-knob', root).forEach(function (k) {
      var ch = k.getAttribute('data-ch'), key = k.getAttribute('data-k');
      if (ch === 'FX') bindKnob(k, function () { return mixer.fx.level; }, function (v) { mixer.setFx({ level: v }); }, false);
      else if (ch === 'HP') bindKnob(k, function () { return mixer.hp.mix; }, function (v) { mixer.setHpMix(v); }, false);
      else bindKnob(k, function () { return mixer.vals[ch][key]; }, function (v) { mixer.setKnob(ch, key, v); }, true);
    });
    $$('.p8-fader', root).forEach(function (f) {
      var id = f.getAttribute('data-ch');
      f.value = Math.round((decks[id] ? decks[id].vol : 0.85) * 100);
      f.addEventListener('input', function () { mixer.setFader(id, Number(f.value) / 100); if (H.persist) H.persist(); });
    });
    $$('.p8-cuech', root).forEach(function (b) { b.addEventListener('click', function () { mixer.ensure(); mixer.setCue(b.getAttribute('data-ch')); }); });
    var cv = $('.p8-curve', root); cv.value = mixer.curve; cv.addEventListener('change', function () { mixer.setCurve(cv.value); });
    var ft = $('.p8-fxtype', root), fb = $('.p8-fxbeat', root), fc = $('.p8-fxch', root), fo = $('.p8-fxon', root);
    ft.addEventListener('change', function () { mixer.setFx({ type: ft.value }); });
    fb.addEventListener('change', function () { mixer.setFx({ beats: Number(fb.value) }); });
    fc.addEventListener('change', function () { mixer.setFx({ assign: fc.value }); });
    fo.addEventListener('click', function () { mixer.ensure(); mixer.setFx({ on: !mixer.fx.on }); });
    var hm = $('.p8-hpmode', root), hd = $('.p8-hpdev', root);
    if (!(global.HTMLMediaElement && HTMLMediaElement.prototype.setSinkId)) { var o = hm.querySelector('option[value="device"]'); if (o) o.textContent = 'Osobne wyjście (brak w tej przeglądarce)'; }
    hm.addEventListener('change', function () { mixer.ensure(); mixer.setHpMode(hm.value); fillDevices(); });
    hd.addEventListener('change', function () { mixer.setSink(hd.value); });
    function fillDevices() {
      hd.hidden = mixer.hp.mode !== 'device';
      if (hd.hidden) return;
      mixer.listOutputs().then(function (l) {
        hd.innerHTML = '<option value="">Domyślne wyjście</option>' + l.filter(function (x) { return x.deviceId && x.deviceId !== 'default'; }).map(function (x, i) { return '<option value="' + esc(x.deviceId) + '">' + esc(x.label || 'Wyjście audio ' + (i + 1)) + '</option>'; }).join('');
        hd.value = mixer.hp.sink || '';
      });
    }
    mixer.paint = function () {
      $$('.p8-knob', root).forEach(function (k) { if (k.__paint) k.__paint(); });
      $$('.p8-cuech', root).forEach(function (b) { b.classList.toggle('on', !!mixer.vals[b.getAttribute('data-ch')].cue); });
      fo.classList.toggle('on', mixer.fx.on);
      ft.value = mixer.fx.type; fb.value = String(mixer.fx.beats); fc.value = mixer.fx.assign; hm.value = mixer.hp.mode; cv.value = mixer.curve;
      hd.hidden = mixer.hp.mode !== 'device';
    };
    mixer.paint();
  }

  // ======================================================================= keyboard shortcuts (desktop)
  var KEYS_HELP = '⌨ Skróty PRO8 — deck A: Z CUE · X PLAY · C SYNC · Q IN · W OUT · E RELOOP/EXIT · A auto-loop · S/D pitch bend −/+ · 1–8 hot cue (Alt+cyfra = usuń)\n' +
    'deck B: N CUE · M PLAY · B SYNC · U IN · I OUT · O RELOOP/EXIT · J auto-loop · L/; pitch bend −/+ · Shift+1–8 hot cue (Shift+Alt = usuń)\n' +
    'mikser: G/H crossfader ◀ ▶ · V BEAT FX on/off · viz: F fullscreen · R losowy preset · ←/→ preset · K Kali radio';
  function bindKeys() {
    var held = {};
    global.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey) return;
      var t = e.target; if (t && (/^(input|select|textarea)$/i.test(t.tagName) || t.isContentEditable)) return;
      if (t && t.closest && (t.closest('.d7c') || t.closest('.p8-knob'))) return;
      var c = e.code, A = decks.A, B = decks.B;
      if (!A || !B) return;
      var dig = /^Digit([1-8])$/.exec(c);
      if (dig) { e.preventDefault(); if (e.repeat) return; var i = Number(dig[1]) - 1, d = e.shiftKey ? B : A; if (e.altKey) d.hotDelete(i); else { d.hotDown(i); held[c] = d; } return; }
      var map = {
        KeyZ: function () { A.cueDown(); }, KeyX: function () { A.playPress(); }, KeyC: function () { A.setSync(); }, KeyQ: function () { A.loopIn(); }, KeyW: function () { A.loopOut(); },
        KeyE: function () { A.reloop(); }, KeyA: function () { A.autoLoop(A.loop.beats); }, KeyS: function () { A.bendNudge(-1); }, KeyD: function () { A.bendNudge(1); },
        KeyN: function () { B.cueDown(); }, KeyM: function () { B.playPress(); }, KeyB: function () { B.setSync(); }, KeyU: function () { B.loopIn(); }, KeyI: function () { B.loopOut(); },
        KeyO: function () { B.reloop(); }, KeyJ: function () { B.autoLoop(B.loop.beats); }, KeyL: function () { B.bendNudge(-1); }, Semicolon: function () { B.bendNudge(1); },
        KeyG: function () { if (H.setXf) H.setXf(clamp(mixer.xf - 0.05, 0, 1)); }, KeyH: function () { if (H.setXf) H.setXf(clamp(mixer.xf + 0.05, 0, 1)); },
        KeyV: function () { mixer.ensure(); mixer.setFx({ on: !mixer.fx.on }); }
      };
      if (!map[c]) return;
      e.preventDefault();
      if (e.repeat && !/^Key(S|D|L|G|H)$|^Semicolon$/.test(c)) return;
      map[c]();
    });
    global.addEventListener('keyup', function (e) {
      var c = e.code, A = decks.A, B = decks.B; if (!A || !B) return;
      if (c === 'KeyZ') A.cueUp(); else if (c === 'KeyN') B.cueUp();
      else if (c === 'KeyS' || c === 'KeyD') A.bendNudge(0); else if (c === 'KeyL' || c === 'Semicolon') B.bendNudge(0);
      var dig = /^Digit([1-8])$/.exec(c);
      if (dig && held[c]) held[c].hotUp(Number(dig[1]) - 1);
      delete held[c];
    });
  }

  // ======================================================================= bot / voice commands
  function pickDeck(n, deckId) {
    if (deckId) return decks[deckId];
    var m = n.match(/\b(?:deck|dek|na|on|kanal|channel|ch)\s*([ab])\b/) || n.match(/\s([ab])$/);
    return decks[m ? m[1].toUpperCase() : 'A'];
  }
  var NUMW = { jeden: 1, jedna: 1, one: 1, dwa: 2, dwie: 2, two: 2, trzy: 3, three: 3, cztery: 4, four: 4, piec: 5, five: 5, szesc: 6, six: 6, siedem: 7, seven: 7, osiem: 8, eight: 8, szesnascie: 16, sixteen: 16, 'trzydziesci dwa': 32, 'thirty two': 32 };
  function numIn(n) {
    var m = n.match(/(?:^|\s)(1\/[248]|\d+(?:[.,]\d+)?|pol|half|cwierc|quarter)(?=\s|$|%)/);
    if (m) { var s = m[1]; if (s === 'pol' || s === 'half') return 0.5; if (s === 'cwierc' || s === 'quarter') return 0.25; if (/^1\//.test(s)) return 1 / Number(s.slice(2)); return Number(s.replace(',', '.')); }
    for (var w in NUMW) if (new RegExp('\\b' + w + '\\b').test(n)) return NUMW[w];
    return null;
  }
  function stripDeck(n) { return n.replace(/\b(?:deck|dek|na|on|kanal|channel|ch)\s*[ab]\b/g, ' ').replace(/\s[ab]$/, ' '); }
  function onOff(n) { return /\b(off|wylacz|wylaczony|stop|disable)\b/.test(n) ? false : /\b(on|wlacz|wlaczony|enable)\b/.test(n) ? true : null; }
  /** Returns a reply when the normalised text is a PRO8 command (else null). */
  function command(n, deckId) {
    if (!decks.A) return null;
    var d, v;
    if (/^(skroty|skroty klawiszowe|klawisze|shortcuts|keyboard)\b/.test(n)) return KEYS_HELP;
    var hm = n.match(/\b(?:hot ?cue|hotcue|pad)\s*([1-8a-h])\b/);
    if (hm) {
      var i = /\d/.test(hm[1]) ? Number(hm[1]) - 1 : 'abcdefgh'.indexOf(hm[1]);
      d = pickDeck(n.replace(hm[0], ' '), deckId);
      if (/\b(usun|skasuj|delete|del|clear|wyczysc)\b/.test(n)) { d.hotDelete(i); return 'Deck ' + d.id + ': hot cue ' + 'ABCDEFGH'[i] + ' usunięty.'; }
      if (!d.buffer) { d.prepare(); return 'Deck ' + d.id + ': wczytuję utwór — powtórz za chwilę.'; }
      var had = !!d.hot[i]; d.hotDown(i); d.hotUp(i);
      return had ? 'Deck ' + d.id + ' ▶ hot cue ' + 'ABCDEFGH'[i] + ' (' + fmt(d.hot[i].t) + ').' : 'Deck ' + d.id + ': hot cue ' + 'ABCDEFGH'[i] + ' zapisany na ' + fmt(d.hot[i] ? d.hot[i].t : 0) + '.';
    }
    if (/^cue\b|\bcue [ab]\b|\b(deck|dek) [ab] cue\b/.test(n)) {
      d = pickDeck(n, deckId);
      if (!d.buffer) { d.prepare(); return 'Deck ' + d.id + ': wczytuję utwór…'; }
      if (d.playing) d.cueDown(); else { d.anchorPos = d.cuePoint; d.emit(); }
      return 'Deck ' + d.id + ': CUE (' + fmt(d.cuePoint) + ').';
    }
    if (/\b(exit loop|loop exit|loop off|wyjdz z petli|koniec petli|petla off|wylacz petle|stop petli)\b/.test(n)) { d = pickDeck(n, deckId); d.loopExit(); return 'Deck ' + d.id + ': pętla OFF.'; }
    if (/\breloop\b/.test(n)) { d = pickDeck(n, deckId); var r = d.reloop(); return 'Deck ' + d.id + ': ' + (r === 'reloop' ? 'RELOOP 🔁' : r === 'exit' ? 'pętla OFF' : 'brak zapisanej pętli'); }
    if (/\b(loop|petl[aeiy]?|petla|beat loop)\b/.test(n)) {
      d = pickDeck(n, deckId); var nn = stripDeck(n); v = numIn(nn);
      if (!d.buffer) { d.prepare(); return 'Deck ' + d.id + ': wczytuję utwór — powtórz za chwilę.'; }
      if (/\b(in|start|poczatek)\b/.test(nn)) { d.loopIn(); return 'Deck ' + d.id + ': LOOP IN ' + fmt(d.loop.in) + '.'; }
      if (/\b(out|koniec)\b/.test(nn)) { d.loopOut(); return 'Deck ' + d.id + ': LOOP OUT — pętla ' + fmt(d.loop.in) + '–' + fmt(d.loop.out) + '.'; }
      if (/\b(polowa|zmniejsz|halve)\b/.test(nn)) { d.loopResize(0.5); return 'Deck ' + d.id + ': pętla ½.'; }
      if (/\b(double|podwoj|zwieksz|x2)\b/.test(nn)) { d.loopResize(2); return 'Deck ' + d.id + ': pętla ×2.'; }
      v = v && LOOP_SIZES.indexOf(v) >= 0 ? v : 4;
      if (d.loop.active && d.loop.auto && d.loop.beats === v) return 'Deck ' + d.id + ': pętla ' + fracLabel(v) + ' już gra 🔁 („exit loop” kończy).';
      d.autoLoop(v);
      return 'Deck ' + d.id + ': auto LOOP ' + fracLabel(v) + (v <= 1 ? ' beat' : ' beaty') + ' 🔁' + (d.bpm ? ' (' + d.bpm.toFixed(1) + ' BPM)' : '') + '.';
    }
    if (/\b(beat ?jump|skok|skocz|jump)\b/.test(n)) {
      d = pickDeck(n, deckId); v = numIn(stripDeck(n)) || d.loop.beats || 4;
      var back = /\b(wstecz|tyl|back|cofnij|backward)\b|-\s?\d/.test(n); d.beatJump(back ? -v : v);
      return 'Deck ' + d.id + ': beat jump ' + (back ? '−' : '+') + fracLabel(v) + '.';
    }
    if (/\b(reverse|rewers|do tylu|odwroc)\b/.test(n)) { d = pickDeck(n, deckId); d.setReverse(onOff(n)); return 'Deck ' + d.id + ': REVERSE ' + (d.reverse ? 'ON ◀' : 'OFF') + '.'; }
    if (/\bslip\b/.test(n)) { d = pickDeck(n, deckId); d.setSlip(onOff(n)); return 'Deck ' + d.id + ': SLIP ' + (d.slip ? 'ON' : 'OFF') + '.'; }
    if (/\b(quantize|quant|kwantyz\w*)\b/.test(n)) { var qo = onOff(n); if (qo == null) qo = !decks.A.quantize; decks.A.setQuantize(qo); decks.B.setQuantize(qo); return 'QUANTIZE ' + (qo ? 'ON' : 'OFF') + ' (oba decki).'; }
    if (/\b(vinyl|winyl)\b/.test(n)) { d = pickDeck(n, deckId); d.setVinyl(onOff(n)); return 'Deck ' + d.id + ': VINYL ' + (d.vinyl ? 'ON (scratch)' : 'OFF (pitch bend)') + '.'; }
    if (/\b(master tempo|key ?lock|keylock|tonacj\w*)\b/.test(n)) { d = pickDeck(n, deckId); d.setKeyLock(onOff(n)); return 'Deck ' + d.id + ': MASTER TEMPO (key lock) ' + (d.keyLock ? 'ON' : 'OFF') + '.'; }
    if (/\bmaster\b/.test(n) && (deckId || /\bmaster [ab]\b|\b(deck|dek) [ab] master\b/.test(n)) && !/\b(volume|glosnosc|vol)\b/.test(n)) { d = pickDeck(n.replace(/\bmaster ([ab])\b/, 'deck $1'), deckId); d.setMaster(); return 'MASTER → deck ' + d.id + (d.effBpm() ? ' (' + d.effBpm().toFixed(1) + ' BPM)' : '') + '.'; }
    if (/\b(zakres|range)\b/.test(n)) { d = pickDeck(n, deckId); v = /wide|szer/.test(n) ? 100 : numIn(stripDeck(n)); d.setRange(RANGES.indexOf(v) >= 0 ? v : null); return 'Deck ' + d.id + ': zakres tempa ' + RANGE_LABEL[d.range] + '.'; }
    if (/\b(tempo reset|reset tempa|tempo zero)\b/.test(n)) { d = pickDeck(n, deckId); d.tempoReset(); return 'Deck ' + d.id + ': tempo 0%.'; }
    var tm = stripDeck(n).match(/\b(?:tempo|pitch)\s*([+-]?\s?\d+(?:[.,]\d+)?)\s*%?/);
    if (tm && !/\bbpm\b/.test(n)) { d = pickDeck(n, deckId); d.setTempoPct(Number(tm[1].replace(/\s/g, '').replace(',', '.')), true); return 'Deck ' + d.id + ': tempo ' + (d.tempoPct() >= 0 ? '+' : '') + d.tempoPct().toFixed(2) + '% → ' + (d.effBpm() ? d.effBpm().toFixed(1) + ' BPM' : '—') + '.'; }
    if (/\b(beat ?fx|efekt\w*)\b|^fx\b|^(reverb|poglos|flanger|roll)\b|\bfx (echo|reverb|flanger|roll)\b/.test(n)) {
      mixer.ensure();
      if (/\b(off|wylacz|stop)\b/.test(n)) { mixer.setFx({ on: false }); return 'BEAT FX OFF.'; }
      var o = { on: true }, ty = (n.match(/\b(echo|reverb|poglos|flanger|roll)\b/) || [])[1];
      if (ty) o.type = ty === 'poglos' ? 'reverb' : ty;
      var bv = numIn(stripDeck(n.replace(/\b(?:na|on|kanal|channel)\s*(?:a|b|master|mst)\b/, ' '))); if (bv && FX_BEATS.indexOf(bv) >= 0) o.beats = bv;
      var am = n.match(/\b(?:na|on|kanal|channel|ch)\s*(a|b|master|mst)\b/); if (am) o.assign = am[1] === 'a' ? 'A' : am[1] === 'b' ? 'B' : 'M';
      mixer.setFx(o);
      return 'BEAT FX ' + mixer.fx.type.toUpperCase() + ' ' + fracLabel(mixer.fx.beats) + ' beat · ' + (mixer.fx.assign === 'M' ? 'MASTER' : 'CH ' + mixer.fx.assign) + ' · ' + Math.round(mixer.fxBpm()) + ' BPM ✨';
    }
    var eqm = n.match(/\b(eq\s+)?(low|bas|basy|mid|srodek|hi|high|gora|trim|color|kolor)\s*(kill|off|reset|zero|[+-]?\d+)?\b/);
    if (eqm && (deckId || eqm[1] || /\bkill\b/.test(n) || /\b(ch|kanal) [ab]\b/.test(n) || /^(eq )?(low|bas|basy|mid|srodek|hi|high|gora|trim|color|kolor)\s*(kill|off|reset|zero|[+-]?\d+)?\s[ab]$/.test(n)) && !/\b(filter|filtr)\b/.test(n)) {
      mixer.ensure(); d = pickDeck(n, deckId);
      var band = /^(low|bas|basy)$/.test(eqm[2]) ? 'low' : /^(mid|srodek)$/.test(eqm[2]) ? 'mid' : /^(hi|high|gora)$/.test(eqm[2]) ? 'hi' : /^(color|kolor)$/.test(eqm[2]) ? 'color' : 'trim';
      var arg = eqm[3] || (/\bkill\b/.test(n) ? 'kill' : '');
      var val = /kill|off/.test(arg) ? (band === 'trim' ? -1 : -1) : /reset|zero/.test(arg) || !arg ? 0 : clamp(Number(arg) / 100, -1, 1);
      mixer.setKnob(d.id, band, val);
      return 'CH ' + d.id + ' ' + band.toUpperCase() + ' → ' + (val === -1 && band !== 'trim' && band !== 'color' ? 'KILL' : (val > 0 ? '+' : '') + Math.round(val * 100)) + '.';
    }
    if (/\b(sluchawki|headphones?|odsluch)\b/.test(n)) {
      mixer.ensure();
      if (/\b(off|wylacz)\b/.test(n)) mixer.setHpMode('off'); else if (/\b(device|wyjscie|osobne)\b/.test(n)) mixer.setHpMode('device'); else mixer.setHpMode('split');
      var cm = n.match(/\bcue\s*([ab])\b/); if (cm) mixer.setCue(cm[1].toUpperCase(), true);
      return 'Słuchawki: ' + (mixer.hp.mode === 'split' ? 'SPLIT (L = master, R = cue)' : mixer.hp.mode === 'device' ? 'CUE na osobnym wyjściu' : 'CUE off') + '.';
    }
    if (/\b(krzywa|curve)\b/.test(n)) { var cvv = /cut|ostr|scratch/.test(n) ? 'cut' : /mid|sred/.test(n) ? 'mid' : 'smooth'; mixer.setCurve(cvv); return 'Crossfader: krzywa ' + cvv + '.'; }
    return null;
  }

  // ======================================================================= mount
  /**
   * opts: { getCtx(), out() → master FX bus input node, master() → master gain node, toast(msg, ms), started(), bpm(), persist(), setXf(x), onState(deck) }
   */
  function mount(opts) {
    H.getCtx = opts.getCtx; H.out = opts.out; H.master = opts.master;
    if (opts.toast) H.toast = opts.toast;
    if (opts.started) H.started = opts.started;
    H.bpm = opts.bpm; H.persist = opts.persist; H.setXf = opts.setXf;
    if (opts.onState) H.onState = opts.onState;
    mixer = new Mixer();
    ['A', 'B'].forEach(function (id) {
      var d = new Deck(id);
      d.el = $('.sx-deck[data-deck="' + id + '"]');
      if (d.el) { d.el.classList.add('p8-deck'); d.el.innerHTML = deckHtml(id); bindDeckUi(d); }
      d.onChange = paintDeck;
      decks[id] = d;
    });
    bindMixerUi();
    bindKeys();
    var dock = $('#sx-dock');
    if (dock && global.IntersectionObserver) new IntersectionObserver(function (es) { visible = es.some(function (e) { return e.isIntersecting; }); }).observe(dock);
    requestAnimationFrame(frame);
    paintAll();
    PRO8.ready = true;
    return { decks: decks, mixer: mixer };
  }

  var PRO8 = global.PRO8 = {
    version: VERSION, mount: mount, decks: decks, command: command, keysHelp: KEYS_HELP,
    analyse: analyse, beatGrid: beatGrid, KeyLock: KeyLock, LOOP_SIZES: LOOP_SIZES, RANGES: RANGES, FX_BEATS: FX_BEATS, HOT_COLORS: HOT_COLORS,
    mixer: function () { return mixer; },
    state: function () { return { A: decks.A && decks.A.state2(), B: decks.B && decks.B.state2(), master: mixer && mixer.master, xf: mixer && mixer.xf, curve: mixer && mixer.curve, fx: mixer && JSON.parse(JSON.stringify(mixer.fx)), hp: mixer && { mode: mixer.hp.mode, mix: mixer.hp.mix }, eq: mixer && JSON.parse(JSON.stringify(mixer.vals)), built: !!(mixer && mixer.built) }; },
    paint: paintAll
  };
})(window);
