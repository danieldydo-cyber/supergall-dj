/*
 * D Bot · D77 Studio (v47) — js/dbot-studio.js
 * One audio studio shared by every page: master clock + live BPM sync (radio / decks / generated tracks / loops / MPC / MIDI clock),
 * 🎵 D Song (AI song generator: lyrics + chords + drum/bass/synth patterns rendered with Web Audio into WAV, library, export/share),
 * 🥁 MPC-style 26-pad sampler (banks, load / record / chop, per-pad volume / pitch / FX, note repeat, 16 levels, quantize, sequencer),
 * 🔁 Looper (4 tracks, record / overdub / undo / FX / export, synced to the master BPM) + D Loop auto-loop generator agent.
 * window.DBotStudio = { clock, bpm, song, mpc, looper, lib, ui, intent, chat, ... }. Audio files live in IndexedDB ('dbot-studio');
 * settings, pads, patterns and library metadata live in DBotState ('studio.*', mirrored natively in the APK).
 */
(function (global) {
  'use strict';
  var St = global.DBotState;
  function sget(p, fb) { return St ? St.get(p, fb) : fb; }
  function sset(p, v) { return St ? St.set(p, v) : v; }
  function N() { return global.DBotNative; }
  function apk() { return !!(N() && N().has && N().has()); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function now() { return Date.now(); }
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').trim(); }
  var subs = {};
  function on(ev, f) { (subs[ev] = subs[ev] || []).push(f); }
  function fire(ev, d) { (subs[ev] || []).forEach(function (f) { try { f(d); } catch (_) {} }); }

  // ================================================================== audio context (shared with Special X / PRO8 when they run)
  var A = { ctx: null, out: null, own: false, errors: 0 };
  function sx() { return global.SpecialX && global.SpecialX.state; }
  function ctx() {
    var S = sx();
    if (S && S.ctx && A.ctx !== S.ctx) { A.ctx = S.ctx; A.out = null; A.own = false; }
    if (!A.ctx) { var C = global.AudioContext || global.webkitAudioContext; if (!C) return null; A.ctx = new C({ latencyHint: 'interactive' }); A.own = true; }
    if (!A.out) {
      A.out = A.ctx.createGain(); A.out.gain.value = 0.9;
      A.dly = A.ctx.createDelay(2); A.dlyFb = A.ctx.createGain(); A.dlyFb.gain.value = 0.35; A.dlyIn = A.ctx.createGain();
      A.dlyIn.connect(A.dly); A.dly.connect(A.dlyFb); A.dlyFb.connect(A.dly); A.dly.connect(A.out);
      var dest = S && S.ctx === A.ctx && S.master ? S.master : A.ctx.destination; // through the master bus → MilkDrop + beat detection see it
      A.out.connect(dest);
      A.tap = A.ctx.createGain(); A.out.connect(A.tap); // for looper resampling
    }
    if (A.ctx.state === 'suspended') { try { A.ctx.resume(); } catch (_) {} }
    return A.ctx;
  }
  function out() { ctx(); return A.out; }

  // ================================================================== master clock (bar grid all modules schedule on)
  // ================================================================== v48: global BPM range (default 79–127)
  // Every tempo the app chooses (Auto Mix, live sync, D Song, D Loop, Party, MIDI slave) stays inside; half/double-time folding first,
  // then the smallest pitch change. 📌 pin = manual master tempo (leader „ręcznie”), only the user changes it.
  var Range = {
    DEF: { min: 79, max: 127 },
    get: function () { var r = sget('bpm.range', null) || {}, lo = +r.min || Range.DEF.min, hi = +r.max || Range.DEF.max; if (hi < lo + 8) hi = lo + 8; return { min: lo, max: hi }; },
    set: function (lo, hi) {
      lo = clamp(Math.round(+lo || Range.DEF.min), 40, 220); hi = clamp(Math.round(+hi || Range.DEF.max), 48, 240); if (hi < lo + 8) hi = lo + 8;
      sset('bpm.range', { min: lo, max: hi }); fire('range', { min: lo, max: hi });
      try { Clock.set(Clock.bpm, 'range'); } catch (_) {}
      return Range.get();
    },
    /** b·2^k that fits (or needs the smallest pitch change) → {bpm, native, mult, pct} */
    info: function (b) {
      b = +b; if (!(b > 0)) return { bpm: 0, native: 0, mult: 1, pct: 0 };
      var r = Range.get(), best = null, bc = Infinity;
      for (var k = -3; k <= 3; k++) { var c = b * Math.pow(2, k), t = clamp(c, r.min, r.max), cost = Math.abs(t / c - 1) + Math.abs(k) * 1e-6; if (cost < bc) { bc = cost; best = { bpm: Math.round(t * 10) / 10, native: c, mult: Math.pow(2, k), pct: (t / c - 1) * 100 }; } }
      return best;
    },
    fold: function (b) { return Range.info(b).bpm; },
    has: function (b) { var r = Range.get(); return b >= r.min - 0.05 && b <= r.max + 0.05; },
    /** the deck tempo (on a deck whose track is `native` BPM) that sounds as `target` (half/double time allowed) */
    match: function (native, target) { if (!(native > 0) || !(target > 0)) return target; var best = target, bd = Infinity; for (var k = -3; k <= 3; k++) { var c = target * Math.pow(2, k), d = Math.abs(Math.log(c / native)); if (d < bd) { bd = d; best = c; } } return best; },
    /** how far (%) a deck of `native` BPM must be pitched to sound as `target` (best half/double time) */
    need: function (native, target) { return native > 0 && target > 0 ? (Range.match(native, target) / native - 1) * 100 : 0; },
    pinned: function () { return Sync.leader === 'manual'; }, // 📌 = leader „ręcznie”
    pin: function (on, bpm) {
      if (on) { Sync.setLeader('manual'); if (bpm) Clock.set(+bpm, 'pin'); }
      else if (Sync.leader === 'manual') Sync.setLeader('auto');
      fire('range', Range.get()); return !!on;
    },
    USER: /^(chat|ui|tap|test|pin|range|opts|user)$/
  };
  var Clock = { bpm: Range.fold(+sget('studio.bpm', 0) || 120), t0: 0, subs: [] };
  Clock.spb = function () { return 60 / Clock.bpm; };
  Clock.barDur = function () { return 4 * Clock.spb(); };
  Clock.now = function () { var c = ctx(); return c ? c.currentTime : 0; };
  Clock.ensure = function () { if (!Clock.t0) Clock.t0 = Clock.now() + 0.05; return Clock.t0; };
  Clock.next = function (step, lead) { Clock.ensure(); var t = Clock.now() + (lead == null ? 0.03 : lead); return Clock.t0 + Math.ceil((t - Clock.t0) / step) * step; };
  Clock.nextBar = function () { return Clock.next(Clock.barDur()); };
  Clock.nextBeat = function () { return Clock.next(Clock.spb()); };
  Clock.phase = function () { Clock.ensure(); return (Clock.now() - Clock.t0) / Clock.spb(); };
  Clock.set = function (b, from) {
    if (Range.pinned() && !Range.USER.test(String(from || '')) && Clock.bpm) return Clock.bpm; // 📌 manual tempo: only the user moves it
    b = Math.round(Range.fold(clamp(+b || 120, 30, 320)) * 10) / 10;
    if (Math.abs(b - Clock.bpm) < 0.01) return Clock.bpm;
    var ph = Clock.t0 ? Clock.phase() : 0, old = Clock.bpm; Clock.bpm = b;
    if (Clock.t0) Clock.t0 = Clock.now() - ph * Clock.spb(); // keep the beat phase when the tempo changes
    sset('studio.bpm', b);
    if (from !== 'sx' && global.SpecialX && global.SpecialX.api && global.SpecialX.api.setBpm) { try { global.SpecialX.api.setBpm(b); } catch (_) {} }
    Clock.subs.forEach(function (f) { try { f(b, old, from); } catch (_) {} });
    fire('bpm', { bpm: b, from: from });
    return b;
  };
  Clock.on = function (f) { Clock.subs.push(f); };

  // ================================================================== BPM detection (onset envelope → autocorrelation)
  var Detect = {};
  /** env: onset-strength samples at fps; returns {bpm, conf}. Tempo folded into 85–175. */
  Detect.fromEnvelope = function (env, fps, lo, hi) {
    lo = lo || 70; hi = hi || 180;
    var n = env.length; if (n < fps * 3) return { bpm: 0, conf: 0 };
    var mean = 0, i; for (i = 0; i < n; i++) mean += env[i]; mean /= n;
    var x = new Float32Array(n); for (i = 0; i < n; i++) x[i] = Math.max(0, env[i] - mean);
    var best = 0, bestLag = 0, sum0 = 0; for (i = 0; i < n; i++) sum0 += x[i] * x[i];
    var minLag = Math.floor(60 * fps / hi), maxLag = Math.ceil(60 * fps / lo), scores = [];
    for (var lag = minLag; lag <= maxLag; lag++) {
      var s = 0; for (i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
      s /= (n - lag);
      var l2 = lag * 2; if (l2 < n) { var s2 = 0; for (i = 0; i + l2 < n; i++) s2 += x[i] * x[i + l2]; s += 0.5 * s2 / (n - l2); } // reward the 2-beat period too
      scores[lag] = s; if (s > best) { best = s; bestLag = lag; }
    }
    if (!bestLag) return { bpm: 0, conf: 0 };
    // parabolic interpolation for sub-frame precision
    var a = scores[bestLag - 1] || best, c = scores[bestLag + 1] || best, d = (a - c) / (2 * (a - 2 * best + c) || 1);
    var lagF = bestLag + (isFinite(d) ? clamp(d, -0.5, 0.5) : 0);
    var bpm = 60 * fps / lagF;
    while (bpm < 85) bpm *= 2; while (bpm > 175) bpm /= 2;
    return { bpm: Math.round(bpm * 10) / 10, conf: sum0 ? clamp(best / (sum0 / n), 0, 1) : 0 };
  };
  /** Offline detection on an AudioBuffer (generated tracks, loaded samples, loops). */
  Detect.buffer = function (buf) {
    var fps = 100, hop = Math.floor(buf.sampleRate / fps), ch = buf.getChannelData(0), n = Math.floor(ch.length / hop), env = new Float32Array(n), prev = 0, lp = 0;
    var k = Math.exp(-2 * Math.PI * 150 / buf.sampleRate); // one-pole low-pass ≈150 Hz → kick-driven envelope
    for (var f = 0; f < n; f++) { var e = 0; for (var j = f * hop; j < (f + 1) * hop; j++) { lp = (1 - k) * ch[j] + k * lp; e += lp * lp; } e = Math.sqrt(e / hop); env[f] = Math.max(0, e - prev); prev = e; }
    return Detect.fromEnvelope(env, fps);
  };
  /** Live detection on everything that plays through Web Audio (decks, local Kali radio, D Song, loops, MPC). */
  Detect.live = { running: false, env: [], fps: 50, timer: 0, an: null, last: { bpm: 0, conf: 0, at: 0 } };
  Detect.start = function () {
    var L = Detect.live, c = ctx(); if (!c || L.running) return;
    var S = sx(); L.an = c.createAnalyser(); L.an.fftSize = 1024; L.an.smoothingTimeConstant = 0;
    try { (S && S.ctx === c && S.master ? S.master : A.out).connect(L.an); } catch (_) { A.out.connect(L.an); }
    var fb = new Uint8Array(L.an.frequencyBinCount), prev = 0, bins = Math.max(2, Math.round(160 / (c.sampleRate / L.an.fftSize)));
    L.running = true; L.env = [];
    L.timer = setInterval(function () {
      L.an.getByteFrequencyData(fb); var e = 0; for (var i = 1; i <= bins; i++) e += fb[i];
      L.env.push(Math.max(0, e - prev)); prev = e; if (L.env.length > L.fps * 10) L.env.shift();
      if (L.env.length >= L.fps * 6 && L.env.length % L.fps === 0) { var r = Detect.fromEnvelope(L.env, L.fps); if (r.bpm) { r.at = now(); L.last = r; fire('detect', r); } }
    }, 1000 / L.fps);
  };
  Detect.stop = function () { clearInterval(Detect.live.timer); Detect.live.running = false; try { Detect.live.an.disconnect(); } catch (_) {} };

  // ================================================================== live BPM sync: radio · decks · generated tracks · loops · MPC · MIDI clock
  var Sync = { auto: sget('studio.autoSync', true), leader: sget('studio.leader', 'auto'), taps: [], timer: 0, lastMatch: {}, log: [] };
  function decks() { var P = global.PRO8; return P && P.decks ? P.decks : null; }
  function deckPlaying(d) { return !!(d && d.playing && d.bpm); }
  /** Radio BPM: local Kali beat = its deck BPM (exact); YouTube iframe audio cannot be analysed (browser sandbox) → BPM from title, else live detection / tap. */
  Sync.radio = function () {
    var X = global.SpecialX, s = X && X.api && X.api.snapshot ? X.api.snapshot() : null;
    if (!s || !s.radioWanted) return { on: false, bpm: 0, how: 'off' };
    if (s.kaliLocal) { var D = decks(), d = D && D.A; return { on: true, bpm: d && d.effBpm ? Math.round(d.effBpm() * 10) / 10 : 0, how: 'lokalny Kali (deck A)' }; }
    var m = String(s.ytTitle || '').match(/(\d{2,3})\s*bpm/i);
    if (m) return { on: true, bpm: +m[1], how: 'z tytułu YouTube' };
    var L = Detect.live.last; if (L.bpm && now() - L.at < 20000) return { on: true, bpm: L.bpm, how: 'wykryte z dźwięku' };
    return { on: true, bpm: s.detBpm || 0, how: s.detBpm ? 'beat detektor' : 'YouTube — stuknij TAP' };
  };
  Sync.sources = function () {
    var D = decks(), r = Sync.radio(), o = { radio: r };
    ['A', 'B'].forEach(function (k) { var d = D && D[k]; o['deck' + k] = d ? { on: deckPlaying(d), bpm: d.effBpm ? Math.round((d.effBpm() || 0) * 10) / 10 : 0, track: d.track && d.track.name } : { on: false, bpm: 0 }; });
    o.song = { on: !!Player.cur, bpm: Player.cur ? Clock.bpm : 0, track: Player.cur && Player.cur.title };
    o.looper = { on: !!(global.DBotStudio && global.DBotStudio.looper && global.DBotStudio.looper.playing), bpm: Clock.bpm };
    o.midi = { on: !!((global.DBotMidiSync && global.DBotMidiSync.running) || WebClock.running), bpm: WebClock.running ? Clock.bpm : (global.DBotMidiSync && global.DBotMidiSync.bpm) || 0, how: WebClock.running ? 'Web MIDI' : 'natywny' };
    return o;
  };
  /** who leads the tempo: 'auto' = master/playing deck → radio → keep; or 'deckA' | 'deckB' | 'radio' | 'manual' */
  Sync.leaderNow = function () {
    var s = Sync.sources(), D = decks(), L = Sync.leader;
    if (L === 'manual') return { id: 'manual', bpm: Clock.bpm };
    if (L === 'deckA' || L === 'deckB' || L === 'radio') return s[L].bpm ? { id: L, bpm: s[L].bpm } : { id: 'manual', bpm: Clock.bpm };
    var m = global.PRO8 && global.PRO8.mixer && global.PRO8.mixer(), md = m && m.master && D && D[m.master];
    if (deckPlaying(md)) return { id: 'deck' + m.master, bpm: s['deck' + m.master].bpm };
    if (s.deckA.on) return { id: 'deckA', bpm: s.deckA.bpm };
    if (s.deckB.on) return { id: 'deckB', bpm: s.deckB.bpm };
    if (s.radio.on && s.radio.bpm) return { id: 'radio', bpm: s.radio.bpm };
    return { id: 'manual', bpm: Clock.bpm };
  };
  /** match every follower to the master tempo (decks via pitch fader, loops/songs/MPC via the clock, MIDI clock BPM) */
  Sync.tick = function () {
    if (!Sync.auto) return null;
    var lead = Sync.leaderNow(), D = decks(), done = [];
    if (lead.bpm && Math.abs(Range.fold(lead.bpm) - Clock.bpm) >= 0.05) { Clock.set(lead.bpm, lead.id); done.push('master ' + Clock.bpm + ' ← ' + lead.id); }
    // v48: the leading deck itself is brought into the BPM range (e.g. 128 → 127, 174 → plays as 87 half-time = 174 native)
    if (D && /^deck[AB]$/.test(lead.id)) { var ld = D[lead.id.slice(4)]; if (deckPlaying(ld) && !ld.syncOn) { var tg = Range.match(ld.bpm, Clock.bpm); if (Math.abs(ld.effBpm() - tg) >= 0.05) { var lp = (tg / ld.bpm - 1) * 100; if (Math.abs(lp) > ld.range) { var lr = [6, 10, 16, 50, 100].filter(function (r) { return r >= Math.abs(lp); })[0]; if (lr) ld.setRange(lr); } ld.setTempoPct(lp); done.push('lider ' + lead.id + ' → ' + Math.round(tg * 10) / 10 + ' (zakres)'); } } }
    if (D) ['A', 'B'].forEach(function (k) {
      var d = D[k]; if (!deckPlaying(d) || lead.id === 'deck' + k) return;
      var eff = d.effBpm(), tgt = Range.match(d.bpm, Clock.bpm); if (Math.abs(eff - tgt) < 0.05 || d.freeTempo) return;
      var pct = (tgt / d.bpm - 1) * 100; if (Math.abs(pct) > 10) return; // v48: never pitch a track more than ±10 % (the conductor mixes it echo-out instead)
      if (Math.abs(pct) > d.range) { var rr = [6, 10, 16, 50, 100].filter(function (r) { return r >= Math.abs(pct); })[0]; if (!rr) return; d.setRange(rr); }
      d.setTempoPct(pct); done.push('deck ' + k + ' → ' + Clock.bpm);
    });
    var MS = global.DBotMidiSync;
    if (MS && MS.running && MS.mode === 'master' && apk() && Math.abs((MS.bpm || 0) - Clock.bpm) > 0.01 && !/^deck/.test(lead.id)) { MS.bpm = Clock.bpm; try { N().MIDI.clockBpm(Clock.bpm); } catch (_) {} done.push('MIDI clock ' + Clock.bpm); }
    if (done.length) { Sync.lastMatch = { at: now(), what: done }; Sync.log.push(new Date().toLocaleTimeString() + ' ' + done.join(' · ')); Sync.log = Sync.log.slice(-30); fire('sync', Sync.lastMatch); }
    return done;
  };
  Sync.setAuto = function (on) { Sync.auto = !!on; sset('studio.autoSync', Sync.auto); if (Sync.auto) Sync.tick(); return Sync.auto; };
  Sync.setLeader = function (l) { Sync.leader = /^(auto|deckA|deckB|radio|manual)$/.test(l) ? l : 'auto'; sset('studio.leader', Sync.leader); Sync.tick(); return Sync.leader; };
  Sync.tap = function () {
    var t = now(); Sync.taps = Sync.taps.filter(function (x) { return t - x < 3000; }); Sync.taps.push(t);
    if (Sync.taps.length < 3) return 0;
    var d = (Sync.taps[Sync.taps.length - 1] - Sync.taps[0]) / (Sync.taps.length - 1), b = Math.round(600000 / d) / 10;
    if (Sync.leader === 'auto' && !Sync.leaderNow().id.match(/^deck/)) Sync.leader = 'manual';
    return Clock.set(b, 'tap');
  };
  Sync.start = function () { clearInterval(Sync.timer); Sync.timer = setInterval(function () { try { Sync.tick(); } catch (e) { Sync.err = e.message; } }, 1000); Detect.start(); };

  // ---- Web MIDI clock (desktop / browser: macOS Electron → MC-707 over USB). The APK uses the native 24 PPQN clock in dbot-agents.js.
  var WebClock = { running: false, out: null, timer: 0, next: 0, acc: null };
  WebClock.ports = function () { return WebClock.acc ? Array.from(WebClock.acc.outputs.values()).map(function (p) { return { id: p.id, name: p.name }; }) : []; };
  WebClock.init = function () {
    if (WebClock.acc) return Promise.resolve(WebClock.acc);
    if (!navigator.requestMIDIAccess) return Promise.reject(new Error('Web MIDI niedostępne'));
    return navigator.requestMIDIAccess({ sysex: false }).then(function (a) { WebClock.acc = a; return a; });
  };
  WebClock.start = function (portId) {
    return WebClock.init().then(function (a) {
      var outs = Array.from(a.outputs.values()), want = portId || sget('studio.midiOut', '');
      var p = outs.filter(function (o) { return o.id === want; })[0] || outs.filter(function (o) { return /707|roland/i.test(o.name); })[0] || outs[0];
      if (!p) throw new Error('brak wyjścia MIDI — podłącz MC-707 kablem USB');
      WebClock.out = p; sset('studio.midiOut', p.id); WebClock.running = true;
      var startAt = Clock.nextBar(), base = performance.now() - Clock.now() * 1000;
      p.send([0xFA], base + startAt * 1000);
      WebClock.next = startAt; WebClock.b2 = base; clearInterval(WebClock.timer);
      WebClock.timer = setInterval(function () { // 24 PPQN with 120 ms look-ahead, timestamps on the audio clock
        var horizon = Clock.now() + 0.12, tick = Clock.spb() / 24, x52 = performance.now() - Clock.now() * 1000; WebClock.b2 = WebClock.b2 == null || Math.abs(x52 - WebClock.b2) > 50 ? x52 : WebClock.b2 + (x52 - WebClock.b2) * 0.02; var b2 = WebClock.b2;
        while (WebClock.next < horizon) { try { p.send([0xF8], b2 + WebClock.next * 1000); } catch (_) {} WebClock.next += tick; }
      }, 25);
      return '⏱ Web MIDI clock → ' + p.name + ' · ' + Clock.bpm + ' BPM (start na takcie)';
    });
  };
  WebClock.stop = function () { clearInterval(WebClock.timer); if (WebClock.out && WebClock.running) try { WebClock.out.send([0xFC]); } catch (_) {} WebClock.running = false; return '⏹ Web MIDI clock stop'; };

  // ================================================================== WAV + library storage (IndexedDB for audio, DBotState for metadata)
  function wav(buf) {
    var nch = Math.min(2, buf.numberOfChannels), sr = buf.sampleRate, len = buf.length, bytes = 44 + len * nch * 2, ab = new ArrayBuffer(bytes), v = new DataView(ab), o = 0;
    function w4(s) { for (var i = 0; i < 4; i++) v.setUint8(o++, s.charCodeAt(i)); }
    w4('RIFF'); v.setUint32(o, bytes - 8, true); o += 4; w4('WAVE'); w4('fmt '); v.setUint32(o, 16, true); o += 4; v.setUint16(o, 1, true); o += 2; v.setUint16(o, nch, true); o += 2;
    v.setUint32(o, sr, true); o += 4; v.setUint32(o, sr * nch * 2, true); o += 4; v.setUint16(o, nch * 2, true); o += 2; v.setUint16(o, 16, true); o += 2; w4('data'); v.setUint32(o, len * nch * 2, true); o += 4;
    var chs = []; for (var c = 0; c < nch; c++) chs.push(buf.getChannelData(c));
    for (var i = 0; i < len; i++) for (c = 0; c < nch; c++) { var s = clamp(chs[c][i], -1, 1); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
    return new Blob([ab], { type: 'audio/wav' });
  }
  var DB = { db: null, ok: null, err: '' };
  DB.open = function () {
    if (DB.db) return Promise.resolve(DB.db);
    return new Promise(function (res, rej) {
      if (!global.indexedDB) { DB.ok = false; DB.err = 'brak IndexedDB'; return rej(new Error(DB.err)); }
      var r = indexedDB.open('dbot-studio', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('audio'); };
      r.onsuccess = function () { DB.db = r.result; DB.ok = true; DB.db.onclose = function () { DB.db = null; DB.ok = null; }; res(DB.db); };
      r.onerror = function () { DB.ok = false; DB.err = String(r.error && r.error.message); rej(r.error); };
    });
  };
  DB.op = function (mode, fn) { return DB.open().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction('audio', mode), st = tx.objectStore('audio'), q = fn(st); tx.oncomplete = function () { res(q && q.result); }; tx.onerror = function () { rej(tx.error); }; }); }); };
  DB.put = function (k, blob) { return DB.op('readwrite', function (s) { return s.put(blob, k); }); };
  DB.get = function (k) { return DB.op('readonly', function (s) { return s.get(k); }); };
  DB.del = function (k) { return DB.op('readwrite', function (s) { return s.delete(k); }); };
  function decode(ab) { var c = ctx(); return new Promise(function (res, rej) { try { var p = c.decodeAudioData(ab.slice ? ab.slice(0) : ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); } }); }
  function blobToBuffer(b) { return b.arrayBuffer().then(decode); }
  var Lib = {
    list: function (kind) { return sget('studio.lib', []).filter(function (x) { return !kind || x.kind === kind; }); },
    add: function (meta, blob) { meta.id = meta.id || uid(meta.kind[0]); meta.at = meta.at || new Date().toISOString(); meta.size = blob.size; return DB.put(meta.id, blob).then(function () { var l = sget('studio.lib', []).filter(function (x) { return x.id !== meta.id; }); l.unshift(meta); sset('studio.lib', l.slice(0, 120)); fire('lib', meta); return meta; }); },
    get: function (id) { return Lib.list().filter(function (x) { return x.id === id; })[0]; },
    blob: function (id) { return DB.get(id); },
    remove: function (id) { sset('studio.lib', Lib.list().filter(function (x) { return x.id !== id; })); fire('lib', null); return DB.del(id); }
  };
  /** export / share a WAV (APK: Android share sheet; desktop/browser: Web Share with file, else download) */
  function share(name, blob, text) {
    name = String(name || 'd77').replace(/[^\w .()-]+/g, '_').slice(0, 60) + (/\.wav$/i.test(name) ? '' : '.wav');
    if (apk()) return new Promise(function (res) { var r = new FileReader(); r.onload = function () { var ok = N().call('shareAudio', name, String(r.result).split(',')[1] || ''); res(ok ? '📤 ' + name + ' → Android: udostępnij / zapisz' : '⚠ udostępnianie nieudane'); }; r.readAsDataURL(blob); });
    try { var f = new File([blob], name, { type: 'audio/wav' }); if (navigator.canShare && navigator.canShare({ files: [f] }) && !global.D77Desktop) return navigator.share({ files: [f], title: name, text: text || '' }).then(function () { return '📤 udostępniono ' + name; }, function () { return download(name, blob); }); } catch (_) {}
    return Promise.resolve(download(name, blob));
  }
  function download(name, blob) { if (global.D77Desktop && global.D77Desktop.saveFile) { blob.arrayBuffer().then(function (ab) { global.D77Desktop.saveFile(name, new Uint8Array(ab)); }); return '💾 zapisz jako… ' + name; } var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); return '💾 pobrano ' + name; }

  // ================================================================== music theory + synth renderer (OfflineAudioContext → AudioBuffer → WAV)
  var NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var SCALE = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };
  function rng(seed) { var a = 0; for (var i = 0; i < String(seed).length; i++) a = (a * 31 + String(seed).charCodeAt(i)) | 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function chordOf(root, mode, deg) { var sc = SCALE[mode], n = []; for (var i = 0; i < 3; i++) { var d = deg + i * 2; n.push(root + sc[d % 7] + 12 * Math.floor(d / 7)); } return n; }
  function chordName(notes) { var r = notes[0] % 12, third = (notes[1] - notes[0] + 12) % 12; return NOTE[r] + (third === 3 ? 'm' : ''); }
  function pat(s) { return String(s).split('').map(function (c) { return c === 'x' ? 1 : c === 'o' ? 0.55 : 0; }); }
  var GENRES = {
    techno: { bpm: 130, mode: 'minor', kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', ohat: '', bass: '..x...x...x...x.', bassOct: 36, prog: [[0, 0, 5, 6], [0, 3, 5, 4]], arp: true },
    house: { bpm: 124, mode: 'minor', kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', ohat: '..o...o...o...o.', bass: 'x..x..x...x..x..', bassOct: 36, prog: [[0, 5, 2, 6], [0, 3, 6, 4]], pad: true },
    trance: { bpm: 138, mode: 'minor', kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', ohat: '', bass: '.xx.xx.xx.xx.xx.', bassOct: 36, prog: [[0, 5, 2, 6], [5, 6, 0, 0]], arp: true, pad: true },
    trap: { bpm: 140, mode: 'minor', kick: 'x......x..x.....', snare: '........x.......', hat: 'xoxoxoxoxxxoxoxo', bass: 'x......x..x.....', bassOct: 36, sub: true, prog: [[0, 5, 3, 4]], lead: true },
    hiphop: { bpm: 90, mode: 'minor', kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xo', bass: 'x.....x...x.....', bassOct: 36, prog: [[0, 5, 3, 4], [0, 3, 5, 6]], pad: true, swing: 0.12 },
    pop: { bpm: 110, mode: 'major', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x..x..x.x..x..x.', bassOct: 36, prog: [[0, 4, 5, 3], [5, 3, 0, 4]], pad: true, lead: true },
    dnb: { bpm: 174, mode: 'minor', kick: 'x.........x.....', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', bass: 'x.......x.x.....', bassOct: 36, prog: [[0, 5, 6, 4]], pad: true },
    lofi: { bpm: 82, mode: 'major', kick: 'x......x.x......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.......x.......', bassOct: 36, prog: [[1, 4, 0, 5]], pad: true, swing: 0.18 },
    disco: { bpm: 118, mode: 'major', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.', bass: 'x.xx.xx.x.xx.xx.', bassOct: 36, octBass: true, prog: [[0, 5, 3, 4]], pad: true, lead: true }
  };
  var GENRE_RE = [['techno', /techno|industrial|berlin/], ['house', /house|deep|garage/], ['trance', /trance|psy|uplift/], ['trap', /trap|drill/], ['hiphop', /hip ?hop|rap|boom ?bap/], ['dnb', /dnb|drum ?(and|n|&) ?bass|jungle/], ['lofi', /lo-?fi|chill|relaks|relax/], ['disco', /disco|funk|nu-?disco/], ['pop', /pop|ballad|ballad|radio/]];
  var KEY_RE = /\b([a-g])(#|is|b|es)?\s?(-?moll|-?dur|minor|major|m(?![a-z]))?\b/;

  function noise(oc) { if (oc.__noise) return oc.__noise; var b = oc.createBuffer(1, oc.sampleRate, oc.sampleRate), d = b.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; oc.__noise = b; return b; }
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  var INST = {
    kick: function (oc, d, t, v) { var o = oc.createOscillator(), g = oc.createGain(); o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13); env(g, t, 0.002, 0.95 * v, 0.42); o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.5); },
    snare: function (oc, d, t, v) { var n = oc.createBufferSource(); n.buffer = noise(oc); var f = oc.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; var g = oc.createGain(); env(g, t, 0.001, 0.55 * v, 0.17); n.connect(f); f.connect(g); g.connect(d); n.start(t, Math.random() * 0.5); n.stop(t + 0.25); var o = oc.createOscillator(), g2 = oc.createGain(); o.type = 'triangle'; o.frequency.value = 190; env(g2, t, 0.001, 0.3 * v, 0.09); o.connect(g2); g2.connect(d); o.start(t); o.stop(t + 0.15); },
    clap: function (oc, d, t, v) { var n = oc.createBufferSource(); n.buffer = noise(oc); var f = oc.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1250; f.Q.value = 1.2; var g = oc.createGain(); g.gain.setValueAtTime(0.0001, t); [0, 0.011, 0.022].forEach(function (k) { g.gain.setValueAtTime(0.5 * v, t + k); g.gain.exponentialRampToValueAtTime(0.05, t + k + 0.009); }); g.gain.setValueAtTime(0.45 * v, t + 0.032); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); n.connect(f); f.connect(g); g.connect(d); n.start(t, Math.random() * 0.5); n.stop(t + 0.25); },
    hat: function (oc, d, t, v, open) { var n = oc.createBufferSource(); n.buffer = noise(oc); var f = oc.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7200; var g = oc.createGain(); env(g, t, 0.001, (open ? 0.18 : 0.22) * v, open ? 0.26 : 0.045); n.connect(f); f.connect(g); g.connect(d); n.start(t, Math.random() * 0.5); n.stop(t + (open ? 0.32 : 0.08)); },
    bass: function (oc, d, t, m, dur, v, sub) { var o = oc.createOscillator(), f = oc.createBiquadFilter(), g = oc.createGain(); o.type = sub ? 'sine' : 'sawtooth'; o.frequency.value = hz(m); f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(sub ? 400 : 260 + 1100 * v, t); f.frequency.exponentialRampToValueAtTime(sub ? 300 : 140, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime((sub ? 0.7 : 0.38) * v, t + 0.006); g.gain.setValueAtTime((sub ? 0.6 : 0.3) * v, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + dur + 0.02); },
    pad: function (oc, d, t, notes, dur, v) { var f = oc.createBiquadFilter(), g = oc.createGain(); f.type = 'lowpass'; f.frequency.value = 1700; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 * v, t + 0.12); g.gain.setValueAtTime(0.06 * v, t + dur - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25); f.connect(g); g.connect(d); notes.forEach(function (m) { [-7, 7].forEach(function (dt) { var o = oc.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m + 12); o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + dur + 0.3); }); }); },
    pluck: function (oc, d, t, m, dur, v, type) { var o = oc.createOscillator(), f = oc.createBiquadFilter(), g = oc.createGain(); o.type = type || 'square'; o.frequency.value = hz(m); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(600, t + dur); env(g, t, 0.003, 0.085 * v, dur); o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + dur + 0.05); }
  };
  /** spec: { bpm, root, mode, prog:[deg×4], g: GENRES entry, sections:[{name, bars, kick, hat, snare, bass, pad, arp, lead}], seed } → Promise<AudioBuffer> */
  function render(spec) {
    var OC = global.OfflineAudioContext || global.webkitOfflineAudioContext; if (!OC) return Promise.reject(new Error('brak OfflineAudioContext'));
    var spb = 60 / spec.bpm, step = spb / 4, bars = spec.sections.reduce(function (a, s) { return a + s.bars; }, 0), dur = bars * 4 * spb + 1.2;
    var oc = new OC(2, Math.ceil(dur * 44100), 44100), comp = oc.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(oc.destination);
    var bus = oc.createGain(); bus.gain.value = 0.9; bus.connect(comp);
    var padBus = oc.createStereoPanner ? oc.createStereoPanner() : oc.createGain(); if (padBus.pan) padBus.pan.value = -0.15; padBus.connect(bus);
    var arpBus = oc.createStereoPanner ? oc.createStereoPanner() : oc.createGain(); if (arpBus.pan) arpBus.pan.value = 0.2; arpBus.connect(bus);
    var g = spec.g, r = rng(spec.seed || 'd77'), K = pat(g.kick), Cl = pat(g.clap || ''), Sn = pat(g.snare || ''), H = pat(g.hat || ''), OH = pat(g.ohat || ''), B = pat(g.bass || '');
    var bar = 0, scale = SCALE[spec.mode], lead = [];
    for (var i = 0; i < 16; i++) lead.push(r() < 0.45 ? null : spec.root + 24 + scale[Math.floor(r() * 5)]);
    spec.sections.forEach(function (sec) {
      for (var b = 0; b < sec.bars; b++, bar++) {
        var t0 = bar * 4 * spb, deg = spec.prog[bar % spec.prog.length], ch = chordOf(spec.root, spec.mode, deg);
        if (sec.pad && (g.pad || sec.name === 'intro' || sec.name === 'outro')) INST.pad(oc, padBus, t0, ch, 4 * spb, 1);
        for (var s = 0; s < 16; s++) {
          var t = t0 + s * step + (s % 2 ? (g.swing || 0) * step : 0);
          if (sec.kick && K[s]) INST.kick(oc, bus, t, K[s]);
          if (sec.snare && Cl[s]) INST.clap(oc, bus, t, Cl[s]);
          if (sec.snare && Sn[s]) INST.snare(oc, bus, t, Sn[s]);
          if (sec.hat && H[s]) INST.hat(oc, bus, t, H[s] * (s % 4 === 2 ? 1 : 0.7), false);
          if (sec.hat && OH[s]) INST.hat(oc, bus, t, OH[s], true);
          if (sec.bass && B[s]) { var bm = ch[0] % 12 + g.bassOct + (g.octBass && s % 2 ? 12 : 0); INST.bass(oc, bus, t, bm, g.sub ? step * 3.5 : step * 0.9, B[s], g.sub); }
          if (sec.arp && g.arp && s % 2 === 0) INST.pluck(oc, arpBus, t, ch[(s / 2) % 3] + 24, step * 1.6, 0.8, 'sawtooth');
          if (sec.lead && g.lead !== false && lead[s] && s % 2 === 0) INST.pluck(oc, arpBus, t, lead[s] + (bar % 2 ? 0 : 0), step * 1.8, 0.9, 'square');
        }
      }
    });
    return oc.startRendering ? new Promise(function (res, rej) { var p = oc.startRendering(); if (p && p.then) p.then(res, rej); else oc.oncomplete = function (e) { res(e.renderedBuffer); }; }) : Promise.reject(new Error('render'));
  }

  // ================================================================== 🎵 D Song — AI song generator agent
  var WORDS = {
    pl: { a: ['noc', 'miasto', 'serce', 'światło', 'rytm', 'ogień', 'niebo', 'droga', 'sen', 'parkiet', 'gwiazdy', 'Kraków'], v: ['tańczymy', 'płonie', 'woła', 'leci', 'gra', 'wraca', 'świeci', 'niesie'],
      lines: ['{A} {v} do rana, czuję każdy {b}', 'Nie zatrzymuj mnie, gdy {a} {v}', 'Ręce w górę, {a} {v} dziś', 'Tylko ty i ja, i ten {b}', 'Gdy {a} {v}, my nie śpimy', 'Całe {a2} {v} w naszym rytmie', 'Słyszysz to? To {a} {v}', 'Jeszcze raz, jeszcze raz — {b}'],
      hook: ['Ooo, {T} — nie przestawaj', 'Hej, {T}, to nasz czas', '{T}, {T} — cała noc'], b: ['bas', 'beat', 'puls', 'rytm', 'takt'], a2: ['miasto', 'niebo', 'serce'] },
    en: { a: ['night', 'city', 'heart', 'light', 'rhythm', 'fire', 'sky', 'road', 'dream', 'dancefloor', 'stars'], v: ['moves', 'burns', 'calls', 'flies', 'plays', 'shines', 'runs'],
      lines: ['{A} {v} till the morning, feel the {b}', "Don't you stop me when the {a} {v}", 'Hands up high, the {a} {v} tonight', 'Only you and me and the {b}', 'When the {a} {v}, we never sleep', 'The whole {a2} {v} to our beat', 'Can you hear it? The {a} {v}', 'One more time, one more time — the {b}'],
      hook: ['Ooh, {T} — never stop', 'Hey, {T}, this is our time', '{T}, {T} — all night long'], b: ['bass', 'beat', 'pulse', 'drum', 'groove'], a2: ['city', 'sky', 'room'] }
  };
  function langOf(text) { var n = norm(text); if (/[ąćęłńóśźż]/i.test(text) || /\b(piosenk|utwor|o |na |dla |zrob|napisz|stworz|wygeneruj|mojej|moim|imprez)/.test(n)) return 'pl'; return /\b(song|track|about|make|write|create)\b/.test(n) ? 'en' : (String((global.D7Super && global.D7Super.curLang && global.D7Super.curLang()) || 'pl').slice(0, 2) === 'pl' ? 'pl' : 'en'); }
  function offlineLyrics(title, lang, seed, topic) {
    var W = WORDS[lang] || WORDS.en, r = rng(seed + 'ly'), T = title;
    function line() { var a = topic && lang === 'en' && r() < 0.35 ? topic : pick(r, W.a); return pick(r, W.lines).replace('{A}', a.charAt(0).toUpperCase() + a.slice(1)).replace('{a}', a).replace('{v}', pick(r, W.v)).replace('{b}', pick(r, W.b)).replace('{a2}', pick(r, W.a2)); }
    var hook = pick(r, W.hook).replace(/\{T\}/g, T);
    var ch = [hook, line(), hook, line()];
    return '[Verse 1]\n' + [line(), line(), line(), line()].join('\n') + '\n\n[Chorus]\n' + ch.join('\n') + '\n\n[Verse 2]\n' + [line(), line(), line(), line()].join('\n') + '\n\n[Chorus]\n' + ch.join('\n');
  }
  function parsePrompt(text) {
    var n = norm(text), o = { prompt: String(text || '').slice(0, 300) };
    o.genre = (GENRE_RE.filter(function (g) { return g[1].test(n); })[0] || [])[0] || 'house';
    var g = GENRES[o.genre], bm = n.match(/(\d{2,3})\s*bpm/);
    o.bpmFixed = !!bm; o.bpm = bm ? clamp(+bm[1], 60, 200) : g.bpm;
    if (!bm && /\b(sync|do mastera|zsynchronizowan|w tempie|tempo mastera|master tempo)\b/.test(n)) { o.bpm = Clock.bpm; o.bpmFixed = true; }
    var fo = Range.info(o.bpm); if (Math.abs(fo.bpm - o.bpm) >= 0.5) { o.bpmAsked = o.bpm; o.bpm = Math.round(fo.bpm); } // v48: BPM range (half/double time)
    var km = n.match(KEY_RE), r = rng(n);
    var root = km && /\b[a-g](#|is|b|es)?\s?(-?moll|-?dur|minor|major|m)\b/.test(n) ? NOTE.indexOf(km[1].toUpperCase()) : Math.floor(r() * 12);
    if (km && /\b[a-g](#|is|b|es)?\s?(-?moll|-?dur|minor|major|m)\b/.test(n) && /^(#|is)$/.test(km[2] || '')) root = (root + 1) % 12;
    if (km && /\b[a-g](#|is|b|es)?\s?(-?moll|-?dur|minor|major|m)\b/.test(n) && /^(b|es)$/.test(km[2] || '')) root = (root + 11) % 12;
    o.mode = /dur|major/.test(n) ? 'major' : /moll|minor|\b[a-g]m\b/.test(n) ? 'minor' : /smutn|sad|dark|mrocz/.test(n) ? 'minor' : /wesol|happy|sloneczn|summer|lato/.test(n) ? 'major' : g.mode;
    o.root = 36 + root; o.key = NOTE[root] + (o.mode === 'minor' ? 'm' : '');
    o.short = /\b(krotk|short|szkic|sketch|demo|8 takt)/.test(n);
    o.lang = langOf(text);
    var tm = String(text).match(/\b(?:o|about)\s+([^„"”,.!?\d]{3,60})/i), STOP = /^(bpm|krotk\w*|short|szkic|demo|w|in|na|techno|house|trance|trap|hip-?hop|pop|dnb|lofi|lo-fi|disco|dur|moll|minor|major|[a-g](is|es|#|b)?(-?moll|-?dur|m)?)$/i;
    var tw = tm ? tm[1].trim().split(/\s+/) : [], tk = []; for (var wi = 0; wi < tw.length && tk.length < 3; wi++) { if (STOP.test(norm(tw[wi]))) break; tk.push(tw[wi]); }
    o.topic = tk.join(' ');
    var tt = String(text).match(/[„"]([^"”]{2,40})[”"]/);
    o.title = tt ? tt[1] : (o.lang === 'en' && o.topic ? o.topic.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : pick(r, o.lang === 'pl' ? (/krak/i.test(o.topic) ? ['Kraków o Świcie', 'Nocny Kraków', 'Kraków do Rana'] : ['Nocny Puls', 'Ogień na Parkiecie', 'Złote Światła', 'Do Rana', 'Neonowe Niebo', 'Jeszcze Raz']) : ['Night Pulse', 'Golden Lights', 'Till The Morning', 'Fire Floor', 'Neon Sky']));
    o.seed = n + '|' + now();
    return o;
  }
  function structure(short) {
    if (short) return [{ name: 'intro', bars: 2, hat: true, pad: true }, { name: 'drop', bars: 4, kick: true, hat: true, snare: true, bass: true, arp: true, lead: true, pad: true }, { name: 'outro', bars: 2, hat: true, pad: true }];
    return [{ name: 'intro', bars: 4, hat: true, pad: true }, { name: 'verse', bars: 8, kick: true, hat: true, bass: true, pad: true }, { name: 'chorus', bars: 8, kick: true, hat: true, snare: true, bass: true, arp: true, lead: true, pad: true },
      { name: 'verse', bars: 8, kick: true, hat: true, snare: true, bass: true, pad: true }, { name: 'chorus', bars: 8, kick: true, hat: true, snare: true, bass: true, arp: true, lead: true, pad: true }, { name: 'outro', bars: 4, hat: true, pad: true }];
  }
  /** lyrics: cloud key → free on-device brain → offline generator (never blocks the music) */
  function aiLyrics(o) {
    var S = global.D7Super; if (!S) return Promise.resolve(null);
    var p = (global.DBotBrains && global.DBotBrains.pick('song')) || (S.aiOn && S.aiOn() && S.usableList()[0]) || (S.localOn && S.localOn() ? 'local' : null); if (!p) return Promise.resolve(null);
    var sys = 'You are D Song, a songwriter inside a DJ app. Write original song lyrics in ' + (o.lang === 'pl' ? 'Polish' : 'English') + '. Format exactly: [Verse 1] 4 lines, [Chorus] 4 lines, [Verse 2] 4 lines, [Chorus] 4 lines. Short singable rhyming lines, no explanations, no titles.';
    var user = 'Song "' + o.title + '" — ' + o.genre + ', ' + o.bpm + ' BPM, key ' + o.key + '. Idea: ' + o.prompt;
    var to = new Promise(function (res) { setTimeout(function () { res({ ok: false, text: 'timeout' }); }, p === 'local' ? 120000 : 30000); });
    return Promise.race([S.askRaw(p, sys, user, { maxTokens: 320 }), to]).then(function (r) { return r && r.ok && /\[(verse|zwrotka|chorus|refren)/i.test(r.text) ? { text: String(r.text).replace(/```/g, '').trim().slice(0, 2500), by: p } : null; }, function () { return null; });
  }
  var Song = { busy: false, last: null };
  Song.generate = function (text, opts) {
    opts = opts || {};
    var o = parsePrompt(text), g = GENRES[o.genre];
    if (opts.short != null) o.short = !!opts.short;
    var prog = pick(rng(o.seed + 'p'), g.prog), chords = prog.map(function (d) { return chordName(chordOf(o.root, o.mode, d)); });
    var song = { kind: 'song', title: o.title, genre: o.genre, bpm: o.bpm, key: o.key, chords: chords, prompt: o.prompt, lang: o.lang, structure: structure(o.short).map(function (s) { return s.name + ' ' + s.bars; }).join(' · '),
      patterns: { kick: g.kick, snare: g.clap || g.snare, hat: g.hat, bass: g.bass }, lyrics: offlineLyrics(o.title, o.lang, o.seed, o.topic), lyricsBy: 'offline' };
    Song.busy = true; fire('song', { state: 'render', song: song });
    var t0 = now();
    return render({ bpm: o.bpm, root: o.root, mode: o.mode, prog: prog, g: g, sections: structure(o.short), seed: o.seed }).then(function (buf) {
      song.dur = Math.round(buf.duration * 10) / 10; song.renderMs = now() - t0;
      var det = Detect.buffer(buf); song.detBpm = det.bpm;
      return Lib.add(song, wav(buf)).then(function (meta) { Song.cache[meta.id] = buf; Song.busy = false; Song.last = meta; fire('song', { state: 'ready', song: meta }); Bus('D Song', 'song', '„' + meta.title + '” ' + meta.genre + ' ' + meta.bpm + ' BPM ' + meta.key); return meta; });
    }).then(function (meta) {
      if (opts.noAi) return meta;
      aiLyrics(o).then(function (ly) { if (!ly) return; var l = sget('studio.lib', []), x = l.filter(function (m) { return m.id === meta.id; })[0]; if (!x) return; x.lyrics = ly.text; x.lyricsBy = ly.by; sset('studio.lib', l); meta.lyrics = ly.text; meta.lyricsBy = ly.by; fire('song', { state: 'lyrics', song: meta }); });
      return meta;
    }, function (e) { Song.busy = false; fire('song', { state: 'error', error: e.message }); throw e; });
  };
  Song.cache = {};
  Song.buffer = function (id) { if (Song.cache[id]) return Promise.resolve(Song.cache[id]); return Lib.blob(id).then(function (b) { if (!b) throw new Error('brak pliku w bibliotece'); return blobToBuffer(b); }).then(function (buf) { Song.cache[id] = buf; return buf; }); };
  Song.toDeck = function (id, k) {
    var P = global.PRO8, m = Lib.get(id); if (!P || !P.decks || !m) return Promise.resolve('⚠ decki PRO8 są na stronie PRO DJ / głównej po START');
    return Lib.blob(id).then(function (b) { var url = URL.createObjectURL(b); P.decks[k || 'B'].load({ name: '🎵 ' + m.title, file: url, bpm: m.bpm, local: true }, false); return '🎧 „' + m.title + '” na decku ' + (k || 'B') + ' (' + m.bpm + ' BPM — auto sync dopasuje tempo)'; });
  };
  Song.export = function (id) { var m = Lib.get(id); if (!m) return Promise.resolve('⚠ nie ma takiego utworu'); return Lib.blob(id).then(function (b) { return share(m.title + ' - ' + m.bpm + 'bpm ' + m.key, b, m.title + '\n' + m.chords.join(' – ') + '\n\n' + (m.lyrics || '')); }); };
  Song.describe = function (m) { return '🎵 „' + m.title + '” · ' + m.genre + ' · ' + m.bpm + ' BPM · ' + m.key + ' · ' + (m.dur ? Math.round(m.dur) + ' s' : '') + '\nAkordy: ' + m.chords.join(' – ') + '\nStruktura: ' + m.structure + '\nBębny: ' + m.patterns.kick + ' / ' + m.patterns.snare + '\n' + (m.lyrics ? '\n' + m.lyrics.split('\n').slice(0, 11).join('\n') + (m.lyrics.split('\n').length > 11 ? '\n…' : '') : '') + '\n(tekst: ' + (m.lyricsBy === 'offline' ? 'offline — z kluczem AI lub darmowym mózgiem napisze go AI' : 'AI · ' + m.lyricsBy) + ')'; };

  // ---- player for generated tracks / library items (bar-synced, follows the master clock)
  var Player = { cur: null, src: null, gain: null };
  Player.play = function (id) {
    Player.stop();
    var m = Lib.get(id); if (!m) return Promise.resolve('⚠ brak w bibliotece');
    return Song.buffer(id).then(function (buf) {
      var c = ctx(), s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = 0.9; s.connect(g); g.connect(out());
      s.playbackRate.value = m.bpm ? Clock.bpm / m.bpm : 1;
      var at = Clock.nextBar(); s.start(at); s.onended = function () { if (Player.src === s) { Player.cur = null; Player.src = null; fire('player', null); } };
      Player.cur = m; Player.src = s; Player.gain = g; fire('player', m);
      return '▶ „' + m.title + '” od najbliższego taktu · ' + Clock.bpm + ' BPM' + (m.bpm && Math.abs(m.bpm - Clock.bpm) > 0.05 ? ' (oryginał ' + m.bpm + ' → dopasowane)' : '');
    });
  };
  Player.stop = function () { if (Player.src) try { Player.src.stop(); } catch (_) {} Player.src = null; Player.cur = null; fire('player', null); return '⏹'; };
  Clock.on(function (b) { if (Player.src && Player.cur && Player.cur.bpm) Player.src.playbackRate.setTargetAtTime(b / Player.cur.bpm, Clock.now(), 0.05); });
  function Bus(from, kind, text) { try { if (global.DBotBus) global.DBotBus.post(from, kind, text); } catch (_) {} }

  // ================================================================== 🥁 MPC-style 26-pad sampler
  var KIT = ['Kick', 'Kick 2', 'Snare', 'Rim', 'Clap', 'Hat', 'Open Hat', 'Ride', 'Tom Lo', 'Tom Mid', 'Tom Hi', 'Shaker', 'Cowbell', 'Perc', '808', 'Bass C', 'Bass F', 'Bass G', 'Stab Am', 'Stab F', 'Stab C', 'Stab G', 'Hey', 'Riser', 'Impact', 'Zap'];
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function renderOne(len, fn) { var OC = global.OfflineAudioContext || global.webkitOfflineAudioContext; var oc = new OC(2, Math.ceil(len * 44100), 44100), g = oc.createGain(); g.connect(oc.destination); fn(oc, g, 0); return oc.startRendering(); }
  var KITFN = [
    function (oc, d) { INST.kick(oc, d, 0, 1); }, function (oc, d) { var o = oc.createOscillator(), g = oc.createGain(); o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(38, 0.3); env(g, 0, 0.001, 1, 0.6); o.connect(g); g.connect(d); o.start(0); o.stop(0.7); INST.hat(oc, d, 0, 0.4); },
    function (oc, d) { INST.snare(oc, d, 0, 1); }, function (oc, d) { var o = oc.createOscillator(), g = oc.createGain(); o.type = 'triangle'; o.frequency.value = 520; env(g, 0, 0.001, 0.6, 0.04); o.connect(g); g.connect(d); o.start(0); o.stop(0.08); INST.hat(oc, d, 0, 0.5); },
    function (oc, d) { INST.clap(oc, d, 0, 1); }, function (oc, d) { INST.hat(oc, d, 0, 1); }, function (oc, d) { INST.hat(oc, d, 0, 1, true); },
    function (oc, d) { [1, 1.48, 2.1].forEach(function (k) { var o = oc.createOscillator(), g = oc.createGain(); o.type = 'square'; o.frequency.value = 540 * k; env(g, 0, 0.001, 0.05, 0.9); o.connect(g); g.connect(d); o.start(0); o.stop(1); }); INST.hat(oc, d, 0, 0.6, true); },
    function (oc, d) { tom(oc, d, 90); }, function (oc, d) { tom(oc, d, 130); }, function (oc, d) { tom(oc, d, 180); },
    function (oc, d) { var n = oc.createBufferSource(); n.buffer = noise(oc); var f = oc.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 6000; var g = oc.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.4, 0.03); g.gain.exponentialRampToValueAtTime(0.0001, 0.12); n.connect(f); f.connect(g); g.connect(d); n.start(0); n.stop(0.15); },
    function (oc, d) { [540, 800].forEach(function (fq) { var o = oc.createOscillator(), g = oc.createGain(); o.type = 'square'; o.frequency.value = fq; env(g, 0, 0.001, 0.12, 0.25); o.connect(g); g.connect(d); o.start(0); o.stop(0.3); }); },
    function (oc, d) { var o = oc.createOscillator(), g = oc.createGain(); o.frequency.setValueAtTime(900, 0); o.frequency.exponentialRampToValueAtTime(400, 0.08); env(g, 0, 0.001, 0.5, 0.1); o.connect(g); g.connect(d); o.start(0); o.stop(0.15); },
    function (oc, d) { INST.bass(oc, d, 0, 33, 1.2, 1, true); INST.kick(oc, d, 0, 0.6); },
    function (oc, d) { INST.bass(oc, d, 0, 36, 0.5, 1); }, function (oc, d) { INST.bass(oc, d, 0, 41, 0.5, 1); }, function (oc, d) { INST.bass(oc, d, 0, 43, 0.5, 1); },
    function (oc, d) { stab(oc, d, [57, 60, 64]); }, function (oc, d) { stab(oc, d, [53, 57, 60]); }, function (oc, d) { stab(oc, d, [48, 52, 55]); }, function (oc, d) { stab(oc, d, [55, 59, 62]); },
    function (oc, d) { var o = oc.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(240, 0); o.frequency.linearRampToValueAtTime(190, 0.25); var g = oc.createGain(); env(g, 0, 0.02, 0.5, 0.25); [800, 1300, 2600].forEach(function (fq) { var f = oc.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = 8; o.connect(f); f.connect(g); }); g.connect(d); o.start(0); o.stop(0.35); },
    function (oc, d) { var n = oc.createBufferSource(); n.buffer = noise(oc); n.loop = true; var f = oc.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, 0); f.frequency.exponentialRampToValueAtTime(9000, 1.9); var g = oc.createGain(); g.gain.setValueAtTime(0.02, 0); g.gain.linearRampToValueAtTime(0.5, 1.9); g.gain.linearRampToValueAtTime(0, 2); n.connect(f); f.connect(g); g.connect(d); n.start(0); n.stop(2); },
    function (oc, d) { INST.kick(oc, d, 0, 1); var n = oc.createBufferSource(); n.buffer = noise(oc); var f = oc.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; var g = oc.createGain(); env(g, 0, 0.002, 0.6, 1.2); n.connect(f); f.connect(g); g.connect(d); n.start(0); n.stop(1.3); },
    function (oc, d) { var o = oc.createOscillator(), g = oc.createGain(); o.type = 'square'; o.frequency.setValueAtTime(2400, 0); o.frequency.exponentialRampToValueAtTime(90, 0.16); env(g, 0, 0.001, 0.25, 0.18); o.connect(g); g.connect(d); o.start(0); o.stop(0.22); }
  ];
  var KITLEN = [0.5, 0.75, 0.3, 0.12, 0.3, 0.1, 0.35, 1, 0.5, 0.45, 0.4, 0.16, 0.32, 0.18, 1.3, 0.55, 0.55, 0.55, 0.6, 0.6, 0.6, 0.6, 0.4, 2.05, 1.35, 0.25];
  function tom(oc, d, f0) { var o = oc.createOscillator(), g = oc.createGain(); o.frequency.setValueAtTime(f0 * 1.6, 0); o.frequency.exponentialRampToValueAtTime(f0, 0.08); env(g, 0, 0.001, 0.8, 0.4); o.connect(g); g.connect(d); o.start(0); o.stop(0.45); }
  function stab(oc, d, notes) { INST.pad(oc, d, 0, notes.map(function (m) { return m - 12; }), 0.25, 5); notes.forEach(function (m) { INST.pluck(oc, d, 0, m, 0.4, 1.4, 'sawtooth'); }); }

  var MPC = { bank: 0, pads: null, bufs: {}, rev: {}, kitReady: false, kitErr: '', held: {}, nr: { on: false, rate: '1/16' }, lv: { mode: 'off', pad: 0 }, q: '1/16', swing: 0, hits: 0,
    seq: { bars: 1, events: [], rec: false, playing: false, t0: 0, next: 0, timer: 0 } };
  var RATES = { '1/4': 1, '1/8': 0.5, '1/8T': 1 / 3, '1/16': 0.25, '1/16T': 1 / 6, '1/32': 0.125 };
  function defPads() { var b = []; for (var k = 0; k < 4; k++) { var row = []; for (var i = 0; i < 26; i++) row.push({ name: k === 0 ? KIT[i] : '—', vol: 0.9, pitch: 0, filter: 1, delay: 0, reverse: false, sample: k === 0 ? 'kit:' + i : null }); b.push(row); } return b; }
  MPC.load = function () {
    var s = sget('studio.mpc', null); MPC.pads = defPads();
    if (s && Array.isArray(s.pads)) s.pads.forEach(function (row, k) { (row || []).forEach(function (p, i) { if (p && MPC.pads[k] && MPC.pads[k][i]) Object.assign(MPC.pads[k][i], p); }); });
    if (s) { MPC.bank = s.bank || 0; MPC.nr = Object.assign(MPC.nr, s.nr || {}); MPC.lv = Object.assign(MPC.lv, s.lv || {}); MPC.q = s.q || '1/16'; MPC.swing = s.swing || 0; if (s.seq) { MPC.seq.bars = s.seq.bars || 1; MPC.seq.events = s.seq.events || []; } }
  };
  MPC.save = function () { sset('studio.mpc', { bank: MPC.bank, pads: MPC.pads, nr: MPC.nr, lv: MPC.lv, q: MPC.q, swing: MPC.swing, seq: { bars: MPC.seq.bars, events: MPC.seq.events.slice(0, 512) } }); };
  MPC.initKit = function () {
    if (MPC.kitPromise) return MPC.kitPromise;
    MPC.kitPromise = Promise.all(KITFN.map(function (fn, i) { return renderOne(KITLEN[i], fn).then(function (b) { MPC.bufs['kit:' + i] = b; }); })).then(function () {
      MPC.kitReady = true; MPC.kitErr = '';
      var users = []; MPC.pads.forEach(function (row) { row.forEach(function (p) { if (p.sample && /^user:/.test(p.sample) && !MPC.bufs[p.sample]) users.push(p.sample); }); });
      return Promise.all(users.map(function (k) { return Lib.blob(k).then(function (b) { return b ? blobToBuffer(b).then(function (buf) { MPC.bufs[k] = buf; }) : null; }).catch(function () {}); }));
    }).then(function () { fire('mpc', { kit: true }); return 26; }, function (e) { MPC.kitErr = e.message; MPC.kitPromise = null; throw e; });
    return MPC.kitPromise;
  };
  function reversed(key) { if (MPC.rev[key]) return MPC.rev[key]; var b = MPC.bufs[key], c = ctx(), r = c.createBuffer(b.numberOfChannels, b.length, b.sampleRate); for (var ch = 0; ch < b.numberOfChannels; ch++) { var s = b.getChannelData(ch), d = r.getChannelData(ch); for (var i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i]; } MPC.rev[key] = r; return r; }
  /** play pad i of the current (or given) bank; lvl = {vel, pitch, filter} overrides from 16 levels */
  MPC.play = function (i, vel, at, bank, lvl) {
    var k = bank == null ? MPC.bank : bank, p = MPC.pads[k] && MPC.pads[k][i]; if (!p || !p.sample || !MPC.bufs[p.sample]) return false;
    var c = ctx(), s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); lvl = lvl || {};
    s.buffer = p.reverse ? reversed(p.sample) : MPC.bufs[p.sample];
    s.playbackRate.value = Math.pow(2, ((p.pitch || 0) + (lvl.pitch || 0)) / 12);
    f.type = 'lowpass'; f.frequency.value = 180 * Math.pow(2, 6.7 * clamp(lvl.filter != null ? lvl.filter : p.filter, 0, 1));
    g.gain.value = clamp((p.vol == null ? 0.9 : p.vol) * (lvl.vel != null ? lvl.vel : vel == null ? 1 : vel), 0, 1.5);
    s.connect(f); f.connect(g); g.connect(out());
    if (p.delay > 0) { var ds = c.createGain(); ds.gain.value = p.delay; g.connect(ds); ds.connect(A.dlyIn); A.dly.delayTime.value = Math.min(1.9, Clock.spb() * 0.75); }
    s.start(at || 0); MPC.hits++; fire('hit', { pad: i, bank: k });
    return true;
  };
  function levelFor(n) { var m = MPC.lv.mode; return m === 'vel' ? { vel: (n + 1) / 16 } : m === 'pitch' ? { pitch: n - 8 } : m === 'filter' ? { filter: (n + 1) / 16 } : null; }
  /** finger down on a pad (UI / keyboard / MIDI): 16 levels, note repeat, sequencer recording with quantize */
  MPC.down = function (i, vel) {
    var pad = i, bank = MPC.bank, lvl = null;
    if (MPC.lv.mode !== 'off' && i < 16) { pad = MPC.lv.pad; lvl = levelFor(i); }
    MPC.play(pad, vel, 0, bank, lvl); MPC.record(pad, bank, lvl ? lvl.vel || vel || 1 : vel || 1, lvl);
    if (MPC.nr.on) {
      var stepDur = function () { return Clock.spb() * (RATES[MPC.nr.rate] || 0.25); }, nxt = Clock.next(stepDur(), 0.01);
      clearInterval(MPC.held[i]);
      MPC.held[i] = setInterval(function () { var t = Clock.now(), h = t + 0.1; while (nxt < t - 0.005) nxt += stepDur(); /* after a stall skip missed steps — no flams */ while (nxt < h) { MPC.play(pad, vel, nxt, bank, lvl); nxt += stepDur(); } }, 20);
    }
  };
  MPC.up = function (i) { clearInterval(MPC.held[i]); delete MPC.held[i]; };
  MPC.setBank = function (k) { MPC.bank = clamp(k | 0, 0, 3); MPC.save(); fire('mpc', {}); return 'Bank ' + 'ABCD'[MPC.bank]; };
  MPC.set = function (i, key, v, bank) { var p = MPC.pads[bank == null ? MPC.bank : bank][i]; if (!p) return; p[key] = key === 'reverse' ? !!v : key === 'name' ? String(v).slice(0, 24) : +v; MPC.save(); fire('mpc', { pad: i }); return p; };
  /** sequencer (1/2/4 bars, 16 steps per bar) — recording is quantized to MPC.q, playback is bar-synced to the master clock */
  MPC.stepLen = function () { return Clock.spb() / 4; };
  MPC.quant = function (pos) { var q = MPC.q === 'off' ? 0 : (RATES[MPC.q] || 0.25) * 4; return q ? Math.round(pos / q) * q : pos; };
  MPC.record = function (pad, bank, vel, lvl) {
    var S = MPC.seq; if (!S.rec || !S.playing) return;
    var len = S.bars * 16, pos = ((Clock.now() - S.t0) / MPC.stepLen()) % len; if (pos < 0) pos += len;
    pos = MPC.quant(pos) % len;
    S.events.push({ step: Math.round(pos * 1000) / 1000, pad: pad, bank: bank, vel: Math.round((vel || 1) * 100) / 100, lvl: lvl || null }); MPC.save();
  };
  MPC.seqPlay = function () {
    var S = MPC.seq; if (S.playing) return '▶ już gra';
    S.playing = true; S.t0 = Clock.nextBar(); S.cycle = 0;
    var sched = function () {
      var len = S.bars * 16, st = MPC.stepLen(), loopDur = len * st, h = Clock.now() + 0.12;
      while (true) {
        var cycStart = S.t0 + S.cycle * loopDur; if (cycStart > h) break;
        S.events.forEach(function (e) { var t = cycStart + e.step * st + ((Math.floor(e.step) % 2) ? MPC.swing * st : 0); if (t >= (S.lastT || 0) && t < h && t >= Clock.now() - 0.005) MPC.play(e.pad, e.vel, t, e.bank, e.lvl); });
        if (cycStart + loopDur <= h) { S.cycle++; } else break;
      }
      S.lastT = h;
    };
    S.lastT = 0; clearInterval(S.timer); S.timer = setInterval(sched, 25); sched();
    return '▶ sekwencer ' + S.bars + ' takt(y) · start na takcie · ' + Clock.bpm + ' BPM';
  };
  MPC.seqStop = function () { var S = MPC.seq; S.playing = false; S.rec = false; clearInterval(S.timer); return '⏹ sekwencer'; };
  Clock.on(function () { var S = MPC.seq; if (S.playing) { clearInterval(S.timer); S.playing = false; MPC.seqPlay(); } });
  MPC.seqClear = function () { MPC.seq.events = []; MPC.save(); return '🗑 wzór wyczyszczony'; };
  MPC.quantizeAll = function () { MPC.seq.events.forEach(function (e) { e.step = MPC.quant(e.step) % (MPC.seq.bars * 16); }); MPC.save(); return '⌗ skwantyzowano do ' + MPC.q; };
  /** samples: load file / record mic / chop */
  MPC.assign = function (i, buf, name, bank) {
    var k = bank == null ? MPC.bank : bank, key = 'user:' + uid('s'); MPC.bufs[key] = buf;
    var p = MPC.pads[k][i]; p.sample = key; p.name = String(name || 'Sample').slice(0, 24); p.reverse = false; MPC.save(); fire('mpc', { pad: i });
    return Lib.add({ id: key, kind: 'sample', title: p.name, bpm: 0 }, wav(buf)).then(function () { return p; });
  };
  MPC.loadFile = function (i, file) { return file.arrayBuffer().then(decode).then(function (buf) { return MPC.assign(i, buf, file.name.replace(/\.[^.]+$/, '')); }); };
  function trim(buf) { var d = buf.getChannelData(0), s = 0, e = d.length - 1, th = 0.02; while (s < e && Math.abs(d[s]) < th) s++; while (e > s && Math.abs(d[e]) < th) e--; if (e - s < 64) return buf; /* quiet take: keep it whole instead of an empty pad */ s = Math.max(0, s - 200); e = Math.min(d.length - 1, e + 2000); return slice(buf, s, e); }
  function slice(buf, s, e) { var c = ctx(), n = Math.max(1, e - s), r = c.createBuffer(buf.numberOfChannels, n, buf.sampleRate); for (var ch = 0; ch < buf.numberOfChannels; ch++) r.getChannelData(ch).set(buf.getChannelData(ch).subarray(s, s + n)); return r; }
  var Mic = { stream: null };
  Mic.get = function () { if (Mic.stream && Mic.stream.active) return Promise.resolve(Mic.stream); if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('brak dostępu do mikrofonu')); return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) { Mic.stream = s; return s; }); };
  /** record from the microphone (sample-accurate PCM capture via ScriptProcessor) */
  function capture(source, startAt, dur) {
    var c = ctx(), sp = c.createScriptProcessor(4096, 2, 2), L = [], R = [], got = 0, need = Math.round(dur * c.sampleRate), done;
    var p = new Promise(function (res) { done = res; });
    sp.onaudioprocess = function (ev) {
      var t = ev.playbackTime, n = ev.inputBuffer.length, a = ev.inputBuffer.getChannelData(0), b = ev.inputBuffer.numberOfChannels > 1 ? ev.inputBuffer.getChannelData(1) : a;
      var off = Math.max(0, Math.round((startAt - t) * c.sampleRate)); if (off >= n || got >= need) { if (got >= need) finish(); return; }
      var take = Math.min(n - off, need - got); L.push(a.slice(off, off + take)); R.push(b.slice(off, off + take)); got += take; if (got >= need) finish();
    };
    var sink = c.createGain(); sink.gain.value = 0; source.connect(sp); sp.connect(sink); sink.connect(c.destination);
    function finish() { if (!sp.onaudioprocess) return; sp.onaudioprocess = null; try { source.disconnect(sp); } catch (_) {} sp.disconnect(); var r = c.createBuffer(2, Math.max(1, got), c.sampleRate), o = 0; L.forEach(function (x, j) { r.getChannelData(0).set(x, o); r.getChannelData(1).set(R[j], o); o += x.length; }); done(r); }
    setTimeout(function () { if (sp.onaudioprocess) finish(); }, (startAt - c.currentTime + dur) * 1000 + 1500);
    return p;
  }
  MPC.recordMic = function (i, secs) { var c = ctx(); return Mic.get().then(function (st) { var src = c.createMediaStreamSource(st); return capture(src, c.currentTime + 0.05, secs || 2); }).then(function (buf) { return MPC.assign(i, trim(buf), 'Rec ' + LETTERS[i]); }); };
  /** chop pad i into n slices (equal or at transients) onto the next pads of the current bank (wraps to the next bank) */
  MPC.chop = function (i, n, mode) {
    var p = MPC.pads[MPC.bank][i], buf = p && MPC.bufs[p.sample]; if (!buf) return Promise.reject(new Error('pad pusty'));
    n = clamp(n | 0 || 8, 2, 16); var pts = [], base = p.name;
    if (mode === 'transient') {
      var d = buf.getChannelData(0), hop = 512, en = [], prev = 0; for (var f = 0; f * hop < d.length; f++) { var e = 0; for (var j = f * hop; j < Math.min(d.length, (f + 1) * hop); j++) e += d[j] * d[j]; en.push(Math.max(0, e - prev)); prev = e; }
      var idx = en.map(function (v, k) { return [v, k]; }).sort(function (a, b) { return b[0] - a[0]; }), minGap = Math.round(buf.sampleRate * 0.05 / hop);
      idx.forEach(function (x) { if (pts.length < n && pts.every(function (q) { return Math.abs(q - x[1]) > minGap; })) pts.push(x[1]); });
      pts = pts.map(function (k) { return k * hop; }).sort(function (a, b) { return a - b; }); if (pts[0] > 0) pts[0] = 0;
    } else for (var s = 0; s < n; s++) pts.push(Math.floor(buf.length * s / n));
    var jobs = pts.map(function (st, k) { var en2 = k + 1 < pts.length ? pts[k + 1] : buf.length, pos = i + k, bank = MPC.bank + Math.floor(pos / 26); if (bank > 3) return null; return MPC.assign(pos % 26, slice(buf, st, en2), base + ' ' + (k + 1), bank); });
    return Promise.all(jobs).then(function () { return '✂ ' + base + ' → ' + pts.length + ' plasterków (' + (mode === 'transient' ? 'transjenty' : 'równe') + ')'; });
  };

  // ================================================================== 🔁 Looper (4 tracks) + D Loop auto-loop generator
  var Loop = { tracks: [], playing: false, t0: 0, nodes: [], recording: -1, gen: 0 };
  function defTrack(i) { return { name: 'Loop ' + (i + 1), buf: null, bpmAt: 0, bars: 0, vol: 0.85, mute: false, fx: { filter: 1, delay: 0, reverse: false, half: false }, hist: [], kind: '' }; }
  for (var li = 0; li < 4; li++) Loop.tracks.push(defTrack(li));
  Loop.load = function () {
    var s = sget('studio.looper', null); if (!s || !Array.isArray(s.tracks)) return Promise.resolve();
    return Promise.all(s.tracks.map(function (t, i) { var T = Loop.tracks[i]; if (!T || !t) return null; T.name = t.name || T.name; T.vol = t.vol == null ? 0.85 : t.vol; T.mute = !!t.mute; T.fx = Object.assign(T.fx, t.fx || {}); T.bpmAt = t.bpmAt || 0; T.bars = t.bars || 0; T.kind = t.kind || '';
      return t.has ? Lib.blob('loop:' + i).then(function (b) { return b ? blobToBuffer(b).then(function (buf) { T.buf = buf; }) : null; }).catch(function () {}) : null; })).then(function () { fire('looper', {}); });
  };
  Loop.save = function (i) {
    sset('studio.looper', { tracks: Loop.tracks.map(function (t) { return { name: t.name, vol: t.vol, mute: t.mute, fx: t.fx, bpmAt: t.bpmAt, bars: t.bars, kind: t.kind, has: !!t.buf }; }) });
    if (i != null && Loop.tracks[i].buf) DB.put('loop:' + i, wav(Loop.tracks[i].buf)).catch(function () {});
    fire('looper', { track: i });
  };
  function revBuf(b) { var c = ctx(), r = c.createBuffer(b.numberOfChannels, b.length, b.sampleRate); for (var ch = 0; ch < b.numberOfChannels; ch++) { var s = b.getChannelData(ch), d = r.getChannelData(ch); for (var i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i]; } return r; }
  function rateOf(T) { return (T.bpmAt ? Clock.bpm / T.bpmAt : 1) * (T.fx.half ? 0.5 : 1); }
  Loop.startTrack = function (i, at) {
    var T = Loop.tracks[i]; if (!T.buf) return;
    var c = ctx(), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = T.fx.reverse ? revBuf(T.buf) : T.buf; s.loop = true; s.playbackRate.value = rateOf(T);
    f.type = 'lowpass'; f.frequency.value = 180 * Math.pow(2, 6.7 * T.fx.filter); g.gain.value = T.mute ? 0 : T.vol;
    s.connect(f); f.connect(g); g.connect(out());
    var ds = c.createGain(); ds.gain.value = T.fx.delay; g.connect(ds); ds.connect(A.dlyIn); A.dly.delayTime.value = Math.min(1.9, Clock.spb() * 0.75);
    var loopDur = s.buffer.duration / s.playbackRate.value, off = Loop.t0 && at > Loop.t0 ? ((at - Loop.t0) % loopDur) * s.playbackRate.value : 0;
    s.start(at, off % s.buffer.duration); Loop.nodes[i] = { s: s, f: f, g: g, ds: ds };
  };
  Loop.stopTrack = function (i) { var n = Loop.nodes[i]; if (n) { try { n.s.stop(); } catch (_) {} try { n.g.disconnect(); } catch (_) {} } Loop.nodes[i] = null; };
  Loop.play = function () {
    if (Loop.playing) return '▶ looper już gra';
    var at = Clock.nextBar(); Loop.t0 = at; Loop.playing = true;
    Loop.tracks.forEach(function (T, i) { Loop.startTrack(i, at); });
    fire('looper', { playing: true }); return '▶ looper od najbliższego taktu · ' + Clock.bpm + ' BPM';
  };
  Loop.stop = function () { Loop.tracks.forEach(function (T, i) { Loop.stopTrack(i); }); Loop.playing = false; fire('looper', { playing: false }); return '⏹ looper'; };
  Loop.refresh = function (i) { if (!Loop.playing) return; Loop.stopTrack(i); Loop.startTrack(i, Clock.now() + 0.02); };
  Clock.on(function () { if (Loop.playing) Loop.nodes.forEach(function (n, i) { if (n) n.s.playbackRate.setTargetAtTime(rateOf(Loop.tracks[i]), Clock.now(), 0.03); }); });
  Loop.setFx = function (i, k, v) { var T = Loop.tracks[i]; if (k === 'vol') T.vol = +v; else if (k === 'mute') T.mute = !!v; else T.fx[k] = (k === 'reverse' || k === 'half') ? !!v : +v;
    var n = Loop.nodes[i]; if (n && (k === 'vol' || k === 'mute')) n.g.gain.value = T.mute ? 0 : T.vol; else if (n && k === 'filter') n.f.frequency.value = 180 * Math.pow(2, 6.7 * T.fx.filter); else if (n && k === 'delay') n.ds.gain.value = T.fx.delay; else Loop.refresh(i);
    Loop.save(); return T; };
  function setBuf(i, buf, kind, bars) { var T = Loop.tracks[i]; if (T.buf) T.hist.push({ buf: T.buf, bpmAt: T.bpmAt, bars: T.bars, kind: T.kind }); T.hist = T.hist.slice(-8); T.buf = buf; T.bpmAt = Clock.bpm; T.bars = bars; T.kind = kind; Loop.save(i); Loop.refresh(i); if (Loop.playing && !Loop.nodes[i]) Loop.startTrack(i, Clock.now() + 0.02); }
  function mixInto(base, add) { var c = ctx(), r = c.createBuffer(2, base.length, base.sampleRate); for (var ch = 0; ch < 2; ch++) { var b = base.getChannelData(Math.min(ch, base.numberOfChannels - 1)), a = add.getChannelData(Math.min(ch, add.numberOfChannels - 1)), d = r.getChannelData(ch); for (var i = 0; i < d.length; i++) d[i] = clamp(b[i] + a[i % a.length], -1, 1); } return r; }
  /** record (or overdub) a loop: starts on the next bar, exactly `bars` long at the master BPM. source: 'mic' | 'resample' (everything playing in the app) */
  Loop.record = function (i, bars, source, overdub) {
    bars = clamp(bars | 0 || 2, 1, 16); var c = ctx(), at = Clock.nextBar(), dur = bars * Clock.barDur(), T = Loop.tracks[i];
    var srcP = source === 'mic' ? Mic.get().then(function (st) { return c.createMediaStreamSource(st); }) : Promise.resolve((function () { var S = sx(); return S && S.ctx === c && S.master ? S.master : A.tap; })());
    Loop.recording = i; fire('looper', { rec: i, at: at, dur: dur });
    return srcP.then(function (src) { return capture(src, at, dur); }).then(function (buf) {
      Loop.recording = -1;
      if (overdub && T.buf) { var b2 = T.buf; if (Math.abs((T.bpmAt || Clock.bpm) - Clock.bpm) > 0.05) b2 = T.buf; setBuf(i, mixInto(b2, buf), T.kind + '+dub', T.bars); return '⏺ dograne (overdub) na ' + T.name; }
      setBuf(i, buf, source === 'mic' ? 'mic' : 'resample', bars); return '⏺ nagrano ' + bars + ' takt(y) → ' + T.name + ' @ ' + Clock.bpm + ' BPM';
    }, function (e) { Loop.recording = -1; throw e; });
  };
  Loop.undo = function (i) { var T = Loop.tracks[i], h = T.hist.pop(); if (!h) return '↶ nic do cofnięcia'; T.buf = h.buf; T.bpmAt = h.bpmAt; T.bars = h.bars; T.kind = h.kind; Loop.save(i); Loop.refresh(i); return '↶ cofnięto ' + T.name; };
  Loop.clear = function (i) { var T = Loop.tracks[i]; if (T.buf) T.hist.push({ buf: T.buf, bpmAt: T.bpmAt, bars: T.bars, kind: T.kind }); T.buf = null; T.bars = 0; T.kind = ''; Loop.stopTrack(i); DB.del('loop:' + i).catch(function () {}); Loop.save(); return '🗑 ' + T.name + ' wyczyszczony'; };
  var LOOP_STYLES = { drums: { kick: true, hat: true, snare: true }, beat: { kick: true, hat: true, snare: true }, bass: { bass: true }, chords: { pad: true }, akordy: { pad: true }, arp: { arp: true }, full: { kick: true, hat: true, snare: true, bass: true, pad: true, arp: true } };
  /** D Loop: generate a loop (drums / bass / chords / arp / full) in a genre at the master BPM onto track i */
  Loop.generate = function (i, style, genre, bars) {
    style = LOOP_STYLES[style] ? style : 'drums'; genre = GENRES[genre] ? genre : 'house'; bars = clamp(bars | 0 || 2, 1, 8);
    var g = Object.assign({}, GENRES[genre]); if (style === 'chords' || style === 'akordy' || style === 'full') g.pad = true; if (style === 'arp') g.arp = true; g.lead = false;
    var seed = genre + style + now(), r = rng(seed), root = 36 + Math.floor(r() * 12), mode = g.mode;
    var sec = Object.assign({ name: 'loop', bars: bars }, LOOP_STYLES[style]);
    if (i == null || i < 0) { i = Loop.tracks.findIndex(function (t) { return !t.buf; }); if (i < 0) i = (Loop.gen++) % 4; }
    var gp = pick(r, g.prog);
    return render({ bpm: Clock.bpm, root: root, mode: mode, prog: gp, g: g, sections: [sec], seed: seed }).then(function (buf) {
      var len = Math.round(bars * Clock.barDur() * buf.sampleRate), exact = slice(buf, 0, Math.min(len, buf.length));
      Loop.tracks[i].name = (genre + ' ' + style).replace(/^\w/, function (c) { return c.toUpperCase(); });
      setBuf(i, exact, 'gen:' + genre + ':' + style, bars);
      Bus('D Loop', 'loop', Loop.tracks[i].name + ' ' + bars + ' takt(y) @ ' + Clock.bpm + ' BPM');
      return { track: i, text: '🔁 D Loop: ' + Loop.tracks[i].name + ' · ' + bars + ' takt(y) · ' + Clock.bpm + ' BPM · ' + NOTE[root % 12] + (mode === 'minor' ? 'm' : '') + ' → ścieżka ' + (i + 1) + (Loop.playing ? ' (gra w synchronizacji)' : ' — „graj pętle”, żeby odpalić') };
    });
  };
  function mixdown() {
    var ts = Loop.tracks.filter(function (t) { return t.buf && !t.mute; }); if (!ts.length) return null;
    var c = ctx(), len = Math.max.apply(null, ts.map(function (t) { return Math.round(t.buf.length / rateOf(t)); })), r = c.createBuffer(2, len, ts[0].buf.sampleRate);
    ts.forEach(function (t) { var b = t.fx.reverse ? revBuf(t.buf) : t.buf, rt = rateOf(t); for (var ch = 0; ch < 2; ch++) { var s = b.getChannelData(Math.min(ch, b.numberOfChannels - 1)), d = r.getChannelData(ch); for (var k = 0; k < len; k++) { d[k] += t.vol * s[Math.floor((k * rt) % s.length)]; } } });
    for (var ch = 0; ch < 2; ch++) { var d = r.getChannelData(ch); for (var k = 0; k < len; k++) d[k] = clamp(d[k], -1, 1); }
    return r;
  }
  Loop.export = function (i) { var b = i === 'mix' || i == null ? mixdown() : Loop.tracks[i].buf; if (!b) return Promise.resolve('⚠ pusta pętla'); return share((i === 'mix' || i == null ? 'Looper mix' : Loop.tracks[i].name) + ' ' + Clock.bpm + 'bpm', wav(b)); };
  Loop.toLibrary = function (i) { var b = i === 'mix' || i == null ? mixdown() : Loop.tracks[i].buf; if (!b) return Promise.resolve(null); return Lib.add({ kind: 'loop', title: (i === 'mix' || i == null ? 'Looper mix' : Loop.tracks[i].name), bpm: Clock.bpm, bars: i === 'mix' || i == null ? 0 : Loop.tracks[i].bars }, wav(b)); };
  Loop.toPad = function (i, pad) { var T = Loop.tracks[i]; if (!T.buf) return Promise.reject(new Error('pusta pętla')); return MPC.assign(pad == null ? 0 : pad, T.buf, T.name); };

  // ================================================================== chat intents (D Song + D Loop agents, MPC, BPM sync)
  var V_GEN = '(napisz|zrob|stworz|wygeneruj|generuj|skomponuj|uloz|nagraj|daj|potrzebuje|chce|generate|make|write|create|compose|record|give me)';
  function intent(text) {
    var n = norm(text).replace(/^@(dsong|song)\s+/, 'd song ').replace(/^@(dloop|looper|loop)\s+/, 'd loop ');
    if (/^(studio|d77 studio|otworz studio|open studio)$/.test(n)) return { kind: 'studio' };
    if (/^d song\b/.test(n) || new RegExp('\\b' + V_GEN + '\\b.*\\b(piosenk|song|utwor|kawalek|numer|track|hit)').test(n)) return { kind: 'song' };
    if (/^d loop\b/.test(n) || /\blooper\b/.test(n) || new RegExp('\\b' + V_GEN + '\\b.*\\b(petl|petel|loop|beat|bit)\\b').test(n) || new RegExp('\\b' + V_GEN + '\\b.*\\b(petl|petle|petli|loop|beat|bit)').test(n) || /^(graj|play|stop|zatrzymaj|cofnij|undo|eksportuj|export|wyczysc|clear) (petle|pętle|loops?|looper)/.test(n) || /\boverdub\b|\bdograj\b/.test(n)) return { kind: 'loop' };
    if (/\b(mpc|sampler|samplera|pady|pads)\b/.test(n)) return { kind: 'mpc' };
    if (/\b(bpm sync|sync bpm|synchronizuj (bpm|tempo)|auto ?sync|wykryj (bpm|tempo)|detect bpm|jakie (jest )?(bpm|tempo)|tempo radia|radio bpm|master bpm|midi clock web|tap tempo)\b/.test(n) || /^(bpm|tempo|master) \d{2,3}( bpm)?$/.test(n)) return { kind: 'bpm' };
    return null;
  }
  function post(t) { var C = global.D7Chat; if (C && C.add) C.add('bot', t); if (C && C.ui && C.ui().tts && C.speak) C.speak(String(t).split('\n')[0]); }
  function songButtons(m) { var C = global.D7Chat, log = document.getElementById('d7c-log'), last = log && log.querySelector('.d7c-msg.bot:last-of-type'); if (!last) return; var w = document.createElement('div'); w.className = 'dbot-brain-btns dbs-chat-btns';
    [['▶ Graj', function () { Player.play(m.id).then(post); }], ['🎧 Deck B', function () { Song.toDeck(m.id, 'B').then(post); }], ['⇪ Eksport', function () { Song.export(m.id).then(post); }], ['🎛 Studio', function () { UI.open('song'); }]].forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.textContent = x[0]; b.onclick = x[1]; w.appendChild(b); }); last.appendChild(w); }
  /** returns text now (and posts the async result to the chat when ready) */
  function chat(text) {
    var it = intent(text), n = norm(text); if (!it) return null;
    if (it.kind === 'stopall') return stopAll('chat');
    if (it.kind === 'studio') { UI.open(); return '🎛 D77 Studio otwarte — D Song, MPC, Looper, BPM sync.'; }
    if (it.kind === 'mpc') { UI.open('mpc'); MPC.initKit().catch(function () {}); return '🥁 MPC: 26 padów (A–Z, banki A–D), note repeat, 16 levels, quantize, sekwencer. Klawisze A–Z grają pady, gdy Studio jest otwarte.'; }
    if (it.kind === 'bpm') {
      var m = n.match(/^(?:bpm|tempo|master) (\d{2,3})/); if (m) { Sync.setLeader('manual'); Clock.set(+m[1], 'chat'); Sync.tick(); return '🎚 Master ' + Clock.bpm + ' BPM — decki, pętle, utwory D Song i MIDI clock dopasowane.'; }
      if (/\b(wylacz|off|stop)\b/.test(n)) { Sync.setAuto(false); return '🎚 Auto sync BPM wyłączony.'; }
      if (/midi clock web/.test(n)) { WebClock.start().then(post, function (e) { post('⚠ ' + e.message); }); return '⏱ Łączę Web MIDI clock…'; }
      Sync.setAuto(true); Sync.tick(); var s = Sync.sources(), L = Sync.leaderNow();
      return '🎚 BPM sync ON · master ' + Clock.bpm + ' BPM ← ' + L.id + '\n📻 radio: ' + (s.radio.on ? (s.radio.bpm || '?') + ' BPM (' + s.radio.how + ')' : 'wyłączone') + '\n🎧 A: ' + (s.deckA.bpm || '—') + (s.deckA.on ? ' ▶' : '') + ' · B: ' + (s.deckB.bpm || '—') + (s.deckB.on ? ' ▶' : '') + '\n🔁 looper / 🎵 D Song / 🥁 MPC: ' + Clock.bpm + ' · ⏱ MIDI: ' + (s.midi.on ? s.midi.bpm + ' (' + s.midi.how + ')' : 'off');
    }
    if (it.kind === 'song') {
      if (Song.busy) return '🎵 D Song już komponuje — chwila…';
      var o = parsePrompt(text);
      Song.generate(text).then(function (meta) { post(Song.describe(meta)); songButtons(meta); }, function (e) { post('⚠ D Song: ' + e.message); });
      return '🎵 D Song komponuje „' + o.title + '” · ' + o.genre + ' · ' + o.bpm + ' BPM · ' + o.key + ' — renderuję WAV (tekst, akordy, bębny, bas, synth)…';
    }
    if (it.kind === 'loop') {
      if (/^(graj|play) /.test(n)) return Loop.play();
      if (/^(stop|zatrzymaj) /.test(n)) return Loop.stop();
      var tr = +((n.match(/\b(?:sciezk[aei]|track|na) ?([1-4])\b/) || [])[1] || 0) - 1;
      if (/^(cofnij|undo)/.test(n)) return Loop.undo(tr < 0 ? 0 : tr);
      if (/^(eksportuj|export)/.test(n)) { Loop.export('mix').then(post); return '⇪ eksport miksu loopera…'; }
      if (/^(wyczysc|clear)/.test(n)) return Loop.clear(tr < 0 ? 0 : tr);
      var bars = +((n.match(/(\d{1,2}) ?(takt|bar)/) || [])[1] || 2);
      if (/\b(nagraj|record|overdub|dograj)\b/.test(n)) {
        var od = /overdub|dograj/.test(n), src = /\b(mikrofon|mic|glos|wokal)\b/.test(n) ? 'mic' : 'resample';
        Loop.record(tr < 0 ? Math.max(0, Loop.tracks.findIndex(function (t) { return od ? !!t.buf : !t.buf; })) : tr, bars, src, od).then(post, function (e) { post('⚠ Looper: ' + e.message); });
        return '⏺ Looper: nagrywam ' + bars + ' takt(y) z ' + (src === 'mic' ? 'mikrofonu' : 'wyjścia aplikacji') + ' od najbliższego taktu (' + Clock.bpm + ' BPM)…';
      }
      var style = /\b(bas|bass)\b/.test(n) ? 'bass' : /\b(akord|chord|pad)/.test(n) ? 'chords' : /\barp/.test(n) ? 'arp' : /\b(full|pelny|caly|wszystko)\b/.test(n) ? 'full' : 'drums';
      var genre = (GENRE_RE.filter(function (g) { return g[1].test(n); })[0] || [])[0] || 'house';
      Loop.generate(tr, style, genre, bars).then(function (r) { if (/\b(graj|play|odpal)\b/.test(n) && !Loop.playing) Loop.play(); post(r.text); }, function (e) { post('⚠ D Loop: ' + e.message); });
      return '🔁 D Loop generuje ' + style + ' (' + genre + ', ' + bars + ' takt(y)) w tempie mastera ' + Clock.bpm + ' BPM…';
    }
    return null;
  }

  // ================================================================== D Doctor: checks for the new modules (pushed into the watchdog list)
  function addDoctorModules() {
    var Mo = global.DBotModules; if (!Mo || Mo.list.bpm) return !!(Mo && Mo.list.bpm);
    Mo.list.bpm = { label: '🎚 BPM sync', check: function () {
      if (!Sync.timer) return ['red', 'zegar synchronizacji zatrzymany'];
      if (!Sync.auto) return ['yellow', 'auto sync wyłączony (Twoja decyzja) · master ' + Clock.bpm];
      var D = decks(), L = Sync.leaderNow(), bad = D ? ['A', 'B'].filter(function (k) { var d = D[k]; return deckPlaying(d) && L.id !== 'deck' + k && Math.abs(d.effBpm() - Range.match(d.bpm, Clock.bpm)) > 0.5; }) : [];
      if (bad.length) return ['red', 'deck ' + bad.join('+') + ' poza tempem mastera'];
      var r = Sync.radio(); return ['green', 'master ' + Clock.bpm + ' BPM ← ' + L.id + (r.on ? ' · radio ' + (r.bpm || '?') + ' (' + r.how + ')' : '')]; },
      start: function () { Sync.start(); }, heal: function () { if (!Sync.timer) { Sync.start(); return 'zegar BPM uruchomiony ponownie'; } Sync.tick(); return 'tempo decków dopasowane do mastera ' + Clock.bpm; } };
    Mo.list.song = { label: '🎵 D Song', check: function () { if (!(global.OfflineAudioContext || global.webkitOfflineAudioContext)) return ['red', 'brak renderera audio']; if (DB.ok === false) return ['red', 'biblioteka niedostępna: ' + DB.err]; return ['green', Lib.list('song').length + ' utworów' + (Song.busy ? ' · komponuje…' : '')]; },
      heal: function () { DB.db = null; DB.ok = null; DB.open().catch(function () {}); return 'biblioteka otwarta ponownie'; } };
    Mo.list.mpc = { label: '🥁 MPC', check: function () { if (MPC.kitErr) return ['red', 'zestaw padów: ' + MPC.kitErr]; if (!MPC.kitReady) return ['yellow', 'zestaw ładuje się przy pierwszym użyciu']; if (MPC.seq.playing && !MPC.seq.timer) return ['red', 'sekwencer stanął']; return ['green', 'bank ' + 'ABCD'[MPC.bank] + ' · 26 padów · ' + MPC.seq.events.length + ' kroków' + (MPC.seq.playing ? ' ▶' : '')]; },
      heal: function () { if (MPC.kitErr || !MPC.kitReady) { MPC.kitErr = ''; MPC.kitPromise = null; MPC.initKit().catch(function () {}); return 'zestaw padów przebudowany'; } MPC.seqStop(); MPC.seqPlay(); return 'sekwencer wznowiony'; } };
    Mo.list.looper = { label: '🔁 Looper', check: function () { var n = Loop.tracks.filter(function (t) { return t.buf; }).length; if (Loop.playing && n && !Loop.nodes.some(function (x) { return x; })) return ['red', 'gra, ale ścieżki nie są podpięte']; return ['green', n + '/4 ścieżek · ' + (Loop.playing ? '▶ ' + Clock.bpm + ' BPM' : 'stop')]; },
      heal: function () { Loop.stop(); Loop.play(); return 'looper uruchomiony ponownie na takcie'; } };
    ['bpm', 'song', 'mpc', 'looper'].forEach(function (k) { if (Mo.order.indexOf(k) < 0) Mo.order.push(k); });
    return true;
  }

  // ================================================================== UI: full-screen D77 Studio (BPM bar + tabs D Song / MPC / Looper / Biblioteka)
  var UI = { root: null, tab: sget('studio.tab', 'song'), sel: 0, edit: false };
  function $(s, r) { return (r || UI.root).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || UI.root).querySelectorAll(s)); }
  function toast(t) { var C = global.DBotCenter; var el = document.createElement('div'); el.className = 'dbc-toast'; el.textContent = String(t).split('\n')[0].slice(0, 140); document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2600); }
  UI.mount = function () {
    if (UI.root) return UI.root;
    var r = UI.root = document.createElement('div'); r.id = 'dbot-studio'; r.className = 'dbs'; r.hidden = true;
    r.innerHTML = '<div class="dbs-panel" role="dialog" aria-label="D77 Studio">' +
      '<header class="dbs-head"><b>🎛 D77 Studio</b><span class="dbs-badge">D77 STUDIO 48</span><button type="button" class="dbs-x" aria-label="Zamknij">✕</button></header>' +
      '<section class="dbs-bpm"><button type="button" data-b="-1">−</button><div class="dbs-big"><span id="dbs-bpm">' + Clock.bpm + '</span><small>BPM master</small></div><button type="button" data-b="1">+</button><button type="button" id="dbs-tap">TAP</button>' +
      '<label class="dbs-tg"><input type="checkbox" id="dbs-auto"' + (Sync.auto ? ' checked' : '') + '> auto sync</label>' +
      '<select id="dbs-leader"><option value="auto">lider: auto</option><option value="deckA">deck A</option><option value="deckB">deck B</option><option value="radio">radio</option><option value="manual">ręcznie</option></select>' +
      '<label class="dbs-tg dbs-pin" title="Tempo ręczne: tylko Ty zmieniasz master BPM"><input type="checkbox" id="dbs-pin"' + (Range.pinned() ? ' checked' : '') + '> 📌 tempo ręczne</label><span class="dbs-range" id="dbs-range">zakres ' + Range.get().min + '–' + Range.get().max + '</span>' +
      '<button type="button" id="dbs-midi">⏱ MIDI clock</button></section>' +
      '<div class="dbs-src" id="dbs-src"></div>' +
      '<nav class="dbs-tabs">' + [['song', '🎵 D Song'], ['mpc', '🥁 MPC'], ['looper', '🔁 Looper'], ['lib', '📚 Biblioteka']].map(function (t) { return '<button type="button" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav>' +
      '<div class="dbs-body" id="dbs-body"></div></div>';
    document.body.appendChild(r);
    $('.dbs-x').onclick = UI.close;
    $$('[data-b]').forEach(function (b) { b.onclick = function () { Sync.setLeader('manual'); $('#dbs-leader').value = 'manual'; Clock.set(Clock.bpm + (+b.dataset.b), 'ui'); Sync.tick(); }; });
    $('#dbs-tap').onclick = function () { var b = Sync.tap(); if (b) toast('TAP ' + b + ' BPM'); };
    $('#dbs-auto').onchange = function () { Sync.setAuto(this.checked); };
    $('#dbs-pin').onchange = function () { Range.pin(this.checked, Clock.bpm); $('#dbs-leader').value = Sync.leader; };
    on('range', function () { if (!UI.root) return; var r = Range.get(), e = $('#dbs-range'), p = $('#dbs-pin'); if (e) e.textContent = 'zakres ' + r.min + '–' + r.max; if (p) p.checked = Range.pinned(); });
    $('#dbs-leader').value = Sync.leader; $('#dbs-leader').onchange = function () { Sync.setLeader(this.value); };
    $('#dbs-midi').onclick = function () {
      if (apk() && global.DBotMidiSync) { var MS = global.DBotMidiSync; toast(MS.running ? MS.stop() : MS.start(Clock.bpm)); return; }
      if (WebClock.running) { toast(WebClock.stop()); paintHead(); return; }
      WebClock.start().then(function (t) { toast(t); paintHead(); }, function (e) { toast('⚠ ' + e.message); });
    };
    $$('.dbs-tabs button').forEach(function (b) { b.onclick = function () { UI.show(b.dataset.tab); }; });
    document.addEventListener('keydown', keyDown, true); document.addEventListener('keyup', keyUp, true);
    return r;
  };
  function typing(e) { var t = e.target; return t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); }
  function keyDown(e) { if (!UI.root || UI.root.hidden || UI.tab !== 'mpc' || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return; var m = /^Key([A-Z])$/.exec(e.code); if (!m) return; e.preventDefault(); e.stopPropagation(); if (e.repeat) return; var i = LETTERS.indexOf(m[1]); UI.sel = i; MPC.down(i, 0.9); flash(i); }
  function keyUp(e) { if (!UI.root || UI.root.hidden || UI.tab !== 'mpc') return; var m = /^Key([A-Z])$/.exec(e.code); if (!m) return; e.stopPropagation(); MPC.up(LETTERS.indexOf(m[1])); }
  function flash(i) { var p = UI.root && UI.root.querySelector('.dbs-pad[data-i="' + i + '"]'); if (p) { p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit'); } }
  UI.open = function (tab) { UI.mount(); UI.root.hidden = false; document.documentElement.classList.add('dbs-open'); ctx(); UI.show(tab || UI.tab); paintHead(); clearInterval(UI.timer); UI.timer = setInterval(paintHead, 1000); return true; };
  UI.close = function () { if (UI.root) UI.root.hidden = true; document.documentElement.classList.remove('dbs-open'); clearInterval(UI.timer); };
  UI.show = function (t) { UI.tab = /^(song|mpc|looper|lib)$/.test(t) ? t : 'song'; sset('studio.tab', UI.tab); $$('.dbs-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === UI.tab); }); UI.render(); };
  function paintHead() {
    if (!UI.root) return; $('#dbs-bpm').textContent = Clock.bpm; var s = Sync.sources(), L = Sync.leaderNow();
    var chip = function (ic, name, o, id) { return '<span class="dbs-chip' + (o.on ? ' on' : '') + (L.id === id ? ' lead' : '') + '">' + ic + ' ' + name + ' <b>' + (o.bpm ? o.bpm : '—') + '</b>' + (o.how ? '<i>' + esc(o.how) + '</i>' : '') + '</span>'; };
    $('#dbs-src').innerHTML = chip('📻', 'Radio', s.radio, 'radio') + chip('🎧', 'A', s.deckA, 'deckA') + chip('🎧', 'B', s.deckB, 'deckB') + chip('🎵', 'Song', s.song, 'song') + chip('🔁', 'Loop', s.looper, 'looper') + chip('⏱', 'MIDI', s.midi, 'midi');
    $('#dbs-midi').classList.toggle('on', s.midi.on);
  }
  UI.render = function () { var b = $('#dbs-body'); if (!b) return; ({ song: rSong, mpc: rMpc, looper: rLooper, lib: rLib })[UI.tab](b); };

  function rSong(b) {
    var m = Song.last || Lib.list('song')[0];
    b.innerHTML = '<div class="dbs-card"><h3>🎵 D Song — generator piosenek AI</h3><textarea id="dbs-prompt" rows="2" placeholder="np. piosenka house o nocnym Krakowie, a-moll, 124 BPM">' + esc(sget('studio.lastPrompt', '')) + '</textarea>' +
      '<div class="dbs-row">' + Object.keys(GENRES).map(function (g) { return '<button type="button" class="dbs-g" data-g="' + g + '">' + g + '</button>'; }).join('') + '</div>' +
      '<div class="dbs-row"><label class="dbs-tg"><input type="checkbox" id="dbs-short"> krótka (8 taktów)</label><label class="dbs-tg"><input type="checkbox" id="dbs-sync"' + (sget('studio.songSync', false) ? ' checked' : '') + '> w tempie mastera</label><button type="button" class="dbs-go" id="dbs-gen">✨ Generuj piosenkę</button></div>' +
      '<p class="dbs-mut">Tekst: ' + (global.D7Super && global.D7Super.aiOn && global.D7Super.aiOn() ? 'AI (Twój klucz)' : global.D7Super && global.D7Super.localOn && global.D7Super.localOn() ? 'darmowy mózg na telefonie' : 'offline (włącz darmowy mózg albo dodaj klucz, żeby pisało AI)') + ' · muzyka: syntezator Web Audio → WAV</p></div>' +
      '<div class="dbs-card" id="dbs-song">' + (m ? songCard(m) : '<p class="dbs-mut">Jeszcze nic — opisz piosenkę i stuknij ✨.</p>') + '</div>';
    $$('.dbs-g', b).forEach(function (x) { x.onclick = function () { var t = $('#dbs-prompt', b); t.value = (t.value.replace(/\b(techno|house|trance|trap|hiphop|pop|dnb|lofi|disco)\b/gi, '').trim() + ' ' + x.dataset.g).trim(); }; });
    $('#dbs-sync', b).onchange = function () { sset('studio.songSync', this.checked); };
    $('#dbs-gen', b).onclick = function () {
      var t = $('#dbs-prompt', b).value.trim() || 'piosenka house'; sset('studio.lastPrompt', t); if ($('#dbs-sync', b).checked && !/\d{2,3}\s*bpm/i.test(t)) t += ' ' + Clock.bpm + ' bpm';
      var btn = this; btn.disabled = true; btn.textContent = '… komponuję'; $('#dbs-song', b).innerHTML = '<div class="dbs-spin">🎼 renderuję bębny, bas, akordy i synth…</div>';
      Song.generate(t, { short: $('#dbs-short', b).checked }).then(function (mm) { btn.disabled = false; btn.textContent = '✨ Generuj piosenkę'; if (UI.tab === 'song') { var c = $('#dbs-song'); c.innerHTML = songCard(mm); wireSong(c, mm); } }, function (e) { btn.disabled = false; btn.textContent = '✨ Generuj piosenkę'; $('#dbs-song', b).textContent = '⚠ ' + e.message; });
    };
    if (m) wireSong($('#dbs-song', b), m);
  }
  function songCard(m) { return '<h3>„' + esc(m.title) + '”</h3><p class="dbs-meta">' + esc(m.genre) + ' · ' + m.bpm + ' BPM · ' + esc(m.key) + ' · ' + (m.dur ? Math.round(m.dur) + ' s' : '') + (m.detBpm ? ' · wykryte ' + m.detBpm + ' BPM' : '') + '</p><p class="dbs-chords">' + m.chords.map(esc).join(' – ') + '</p><pre class="dbs-ly">' + esc(m.lyrics || '') + '</pre><p class="dbs-mut">tekst: ' + esc(m.lyricsBy) + ' · ' + esc(m.structure) + '</p>' +
    '<div class="dbs-row"><button type="button" data-a="play">▶ Graj</button><button type="button" data-a="stop">⏹</button><button type="button" data-a="A">🎧 Deck A</button><button type="button" data-a="B">🎧 Deck B</button><button type="button" data-a="loop">🔁 do Loopera</button><button type="button" data-a="exp">⇪ Eksport WAV</button></div>'; }
  function wireSong(c, m) { $$('[data-a]', c).forEach(function (x) { x.onclick = function () { var a = x.dataset.a;
    if (a === 'play') Player.play(m.id).then(toast); else if (a === 'stop') Player.stop(); else if (a === 'exp') Song.export(m.id).then(toast);
    else if (a === 'loop') Song.buffer(m.id).then(function (buf) { var i = Loop.tracks.findIndex(function (t) { return !t.buf; }); i = i < 0 ? 0 : i; var bars = Math.min(8, Math.floor(buf.duration / (240 / m.bpm))); var len = Math.round(bars * 240 / m.bpm * buf.sampleRate); var s0 = Math.round(Math.min(buf.length - len, 4 * 240 / m.bpm * buf.sampleRate * (buf.duration > 60 ? 3 : 0))); setBuf(i, slice(buf, Math.max(0, s0), Math.max(0, s0) + len), 'song', bars); Loop.tracks[i].bpmAt = m.bpm; Loop.tracks[i].name = m.title; Loop.save(i); toast('🔁 ' + bars + ' taktów „' + m.title + '” → ścieżka ' + (i + 1)); });
    else Song.toDeck(m.id, a).then(toast); }; }); }

  function rMpc(b) {
    MPC.initKit().then(function () { if (UI.tab === 'mpc') paintPads(); }, function (e) { toast('⚠ MPC: ' + e.message); });
    var p = MPC.pads[MPC.bank][UI.sel] || {};
    b.innerHTML = '<div class="dbs-card dbs-mpc"><div class="dbs-row dbs-mpc-top">' + [0, 1, 2, 3].map(function (k) { return '<button type="button" class="dbs-bank' + (k === MPC.bank ? ' on' : '') + '" data-k="' + k + '">Bank ' + 'ABCD'[k] + '</button>'; }).join('') +
      '<label class="dbs-tg"><input type="checkbox" id="dbs-nr"' + (MPC.nr.on ? ' checked' : '') + '> Note repeat</label><select id="dbs-nrr">' + Object.keys(RATES).map(function (r) { return '<option' + (r === MPC.nr.rate ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select>' +
      '<select id="dbs-lv"><option value="off">16 levels: off</option><option value="vel">16 levels: velocity</option><option value="pitch">16 levels: pitch</option><option value="filter">16 levels: filtr</option></select>' +
      '<label class="dbs-tg"><input type="checkbox" id="dbs-edit"' + (UI.edit ? ' checked' : '') + '> ✎ edycja</label></div>' +
      '<div class="dbs-pads" id="dbs-pads"></div>' +
      '<div class="dbs-row dbs-seq"><b>Sekwencer</b><select id="dbs-bars">' + [1, 2, 4].map(function (x) { return '<option' + (x === MPC.seq.bars ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select> takt · Q <select id="dbs-q">' + ['off', '1/8', '1/16', '1/32'].map(function (x) { return '<option' + (x === MPC.q ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
      '<label class="dbs-tg">swing <input type="range" id="dbs-swing" min="0" max="0.5" step="0.05" value="' + MPC.swing + '"></label><button type="button" id="dbs-rec" class="' + (MPC.seq.rec ? 'rec' : '') + '">⏺ REC</button><button type="button" id="dbs-play">' + (MPC.seq.playing ? '⏹ STOP' : '▶ PLAY') + '</button><button type="button" id="dbs-qall">⌗ Quantize</button><button type="button" id="dbs-clr">🗑</button><span class="dbs-mut" id="dbs-ev">' + MPC.seq.events.length + ' uderzeń</span></div></div>' +
      '<div class="dbs-card" id="dbs-padedit"></div>';
    $('#dbs-lv', b).value = MPC.lv.mode;
    $$('.dbs-bank', b).forEach(function (x) { x.onclick = function () { MPC.setBank(+x.dataset.k); rMpc(b); }; });
    $('#dbs-nr', b).onchange = function () { MPC.nr.on = this.checked; MPC.save(); }; $('#dbs-nrr', b).onchange = function () { MPC.nr.rate = this.value; MPC.save(); };
    $('#dbs-lv', b).onchange = function () { MPC.lv.mode = this.value; MPC.lv.pad = UI.sel; MPC.save(); paintPads(); };
    $('#dbs-edit', b).onchange = function () { UI.edit = this.checked; paintEdit(); };
    $('#dbs-bars', b).onchange = function () { MPC.seq.bars = +this.value; MPC.save(); }; $('#dbs-q', b).onchange = function () { MPC.q = this.value; MPC.save(); };
    $('#dbs-swing', b).oninput = function () { MPC.swing = +this.value; MPC.save(); };
    $('#dbs-rec', b).onclick = function () { MPC.seq.rec = !MPC.seq.rec; if (MPC.seq.rec && !MPC.seq.playing) MPC.seqPlay(); rMpc(b); };
    $('#dbs-play', b).onclick = function () { if (MPC.seq.playing) MPC.seqStop(); else MPC.seqPlay(); rMpc(b); };
    $('#dbs-qall', b).onclick = function () { toast(MPC.quantizeAll()); }; $('#dbs-clr', b).onclick = function () { toast(MPC.seqClear()); rMpc(b); };
    paintPads(); paintEdit();
  }
  function paintPads() {
    var w = UI.root && $('#dbs-pads'); if (!w) return;
    w.innerHTML = MPC.pads[MPC.bank].map(function (p, i) { var lv = MPC.lv.mode !== 'off' && i < 16; return '<button type="button" class="dbs-pad' + (p.sample ? ' full' : '') + (i === UI.sel ? ' sel' : '') + (lv ? ' lv' : '') + '" data-i="' + i + '"><b>' + LETTERS[i] + '</b><span>' + esc(lv ? (MPC.lv.mode + ' ' + (i + 1)) : p.name) + '</span></button>'; }).join('');
    $$('.dbs-pad', w).forEach(function (el) { var i = +el.dataset.i;
      el.addEventListener('pointerdown', function (e) { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} var r = el.getBoundingClientRect(), vel = clamp(1.15 - (e.clientY - r.top) / r.height * 0.6, 0.35, 1); if (MPC.lv.mode === 'off' || i >= 16) UI.sel = i; MPC.down(i, vel); flash(i); if (UI.edit) paintEdit(); $$('.dbs-pad.sel', w).forEach(function (x) { x.classList.remove('sel'); }); el.classList.add('sel'); var ev = $('#dbs-ev'); if (ev) ev.textContent = MPC.seq.events.length + ' uderzeń'; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { el.addEventListener(t, function () { MPC.up(i); }); }); });
  }
  function paintEdit() {
    var e = UI.root && $('#dbs-padedit'); if (!e) return; if (!UI.edit) { e.innerHTML = '<p class="dbs-mut">Stuknij pad, żeby grać (siła = wysokość dotyku). ✎ edycja: głośność, pitch, filtr, delay, reverse, wczytaj / nagraj / potnij sample. Klawisze A–Z grają pady.</p>'; return; }
    var p = MPC.pads[MPC.bank][UI.sel];
    e.innerHTML = '<h3>Pad ' + LETTERS[UI.sel] + ' · <input id="dbs-pn" value="' + esc(p.name) + '" maxlength="24"></h3>' +
      [['vol', 'głośność', 0, 1.5, 0.01], ['pitch', 'pitch (półtony)', -24, 24, 1], ['filter', 'filtr', 0, 1, 0.01], ['delay', 'delay (send)', 0, 1, 0.01]].map(function (x) { return '<label class="dbs-sl"><span>' + x[1] + ' <b>' + p[x[0]] + '</b></span><input type="range" data-k="' + x[0] + '" min="' + x[2] + '" max="' + x[3] + '" step="' + x[4] + '" value="' + p[x[0]] + '"></label>'; }).join('') +
      '<div class="dbs-row"><label class="dbs-tg"><input type="checkbox" id="dbs-rev"' + (p.reverse ? ' checked' : '') + '> reverse</label><label class="dbs-file">📂 Wczytaj sample<input type="file" accept="audio/*" id="dbs-file" hidden></label><button type="button" id="dbs-mic">🎤 Nagraj 2 s</button><button type="button" id="dbs-chop8">✂ Potnij ×8</button><button type="button" id="dbs-chopT">✂ ×8 transjenty</button><button type="button" id="dbs-chop16">✂ ×16</button></div>';
    $$('input[type=range]', e).forEach(function (r) { r.oninput = function () { MPC.set(UI.sel, r.dataset.k, r.value); r.previousElementSibling.querySelector('b').textContent = r.value; }; });
    $('#dbs-pn', e).onchange = function () { MPC.set(UI.sel, 'name', this.value); paintPads(); };
    $('#dbs-rev', e).onchange = function () { MPC.set(UI.sel, 'reverse', this.checked); };
    $('#dbs-file', e).onchange = function () { var f = this.files[0]; if (f) MPC.loadFile(UI.sel, f).then(function () { paintPads(); paintEdit(); toast('📂 ' + f.name + ' → pad ' + LETTERS[UI.sel]); }, function (er) { toast('⚠ ' + er.message); }); };
    $('#dbs-mic', e).onclick = function () { var btn = this; btn.textContent = '⏺ nagrywam…'; MPC.recordMic(UI.sel, 2).then(function () { paintPads(); paintEdit(); toast('🎤 nagrano → pad ' + LETTERS[UI.sel]); }, function (er) { btn.textContent = '🎤 Nagraj 2 s'; toast('⚠ mikrofon: ' + er.message); }); };
    [['#dbs-chop8', 8, 'equal'], ['#dbs-chopT', 8, 'transient'], ['#dbs-chop16', 16, 'equal']].forEach(function (x) { $(x[0], e).onclick = function () { MPC.chop(UI.sel, x[1], x[2]).then(function (t) { toast(t); paintPads(); }, function (er) { toast('⚠ ' + er.message); }); }; });
  }

  function rLooper(b) {
    b.innerHTML = '<div class="dbs-card"><div class="dbs-row"><button type="button" id="dl-play" class="dbs-go">' + (Loop.playing ? '⏹ Stop' : '▶ Graj pętle') + '</button><button type="button" id="dl-mix">⇪ Eksport miksu</button><button type="button" id="dl-save">💾 Do biblioteki</button><span class="dbs-mut">wszystko startuje na takcie · ' + Clock.bpm + ' BPM</span></div>' +
      '<div class="dbs-row dbs-gen"><b>🔁 D Loop</b><select id="dl-style"><option value="drums">bębny</option><option value="bass">bas</option><option value="chords">akordy</option><option value="arp">arp</option><option value="full">pełna</option></select><select id="dl-genre">' + Object.keys(GENRES).map(function (g) { return '<option>' + g + '</option>'; }).join('') + '</select><select id="dl-bars"><option>1</option><option selected>2</option><option>4</option><option>8</option></select> takt<button type="button" id="dl-gen" class="dbs-go">🎲 Generuj pętlę</button><label class="dbs-tg" title="D Loop sam trzyma wygenerowaną pętlę w ścieżce 1 (w tempie mastera, nie odtwarza sam)"><input type="checkbox" id="dl-auto"' + (sget('studio.autoLoop', false) ? ' checked' : '') + '> auto</label></div></div>' +
      Loop.tracks.map(function (T, i) { return '<div class="dbs-card dbs-track' + (T.buf ? ' full' : '') + (Loop.recording === i ? ' rec' : '') + '" data-t="' + i + '"><div class="dbs-row"><b>' + (i + 1) + '. ' + esc(T.name) + '</b><span class="dbs-mut">' + (T.buf ? T.bars + ' takt · ' + (T.bpmAt || '?') + '→' + Clock.bpm + ' BPM · ' + esc(T.kind) : 'pusta') + '</span></div>' +
        '<div class="dbs-row"><button type="button" data-a="mic">⏺ Mic</button><button type="button" data-a="res">⏺ Resample</button><button type="button" data-a="dub"' + (T.buf ? '' : ' disabled') + '>➕ Overdub</button><button type="button" data-a="undo"' + (T.hist.length ? '' : ' disabled') + '>↶</button><button type="button" data-a="gen">🎲</button><button type="button" data-a="clr">🗑</button><button type="button" data-a="exp"' + (T.buf ? '' : ' disabled') + '>⇪</button><button type="button" data-a="pad"' + (T.buf ? '' : ' disabled') + '>→ pad</button></div>' +
        '<div class="dbs-row dbs-fx"><label>vol<input type="range" data-f="vol" min="0" max="1.2" step="0.01" value="' + T.vol + '"></label><label>filtr<input type="range" data-f="filter" min="0" max="1" step="0.01" value="' + T.fx.filter + '"></label><label>delay<input type="range" data-f="delay" min="0" max="0.9" step="0.01" value="' + T.fx.delay + '"></label><label class="dbs-tg"><input type="checkbox" data-f="reverse"' + (T.fx.reverse ? ' checked' : '') + '>rev</label><label class="dbs-tg"><input type="checkbox" data-f="half"' + (T.fx.half ? ' checked' : '') + '>½</label><label class="dbs-tg"><input type="checkbox" data-f="mute"' + (T.mute ? ' checked' : '') + '>mute</label></div></div>'; }).join('');
    var bars = function () { return +$('#dl-bars', b).value; };
    $('#dl-play', b).onclick = function () { toast(Loop.playing ? Loop.stop() : Loop.play()); rLooper(b); };
    $('#dl-mix', b).onclick = function () { Loop.export('mix').then(toast); };
    $('#dl-save', b).onclick = function () { Loop.toLibrary('mix').then(function (m) { toast(m ? '💾 zapisano miks w bibliotece' : '⚠ pusto'); }); };
    $('#dl-auto', b).onchange = function (e) { sset('studio.autoLoop', !!e.target.checked); if (e.target.checked) AutoLoop.ensure().then(function () { if (UI.tab === 'looper') rLooper(b); }); toast(e.target.checked ? '🔁 D Loop auto ON' : 'D Loop auto OFF'); };
    $('#dl-gen', b).onclick = function () { Loop.generate(-1, $('#dl-style', b).value, $('#dl-genre', b).value, bars()).then(function (r) { toast(r.text); if (UI.tab === 'looper') rLooper(b); }); };
    $$('.dbs-track', b).forEach(function (el) { var i = +el.dataset.t;
      $$('[data-a]', el).forEach(function (x) { x.onclick = function () { var a = x.dataset.a, done = function (t) { toast(t); if (UI.tab === 'looper') rLooper(b); }, err = function (e) { toast('⚠ ' + e.message); rLooper(b); };
        if (a === 'mic' || a === 'res' || a === 'dub') { Loop.record(i, a === 'dub' ? (Loop.tracks[i].bars || bars()) : bars(), a === 'res' ? 'resample' : 'mic', a === 'dub').then(done, err); setTimeout(function () { rLooper(b); }, 50); }
        else if (a === 'undo') done(Loop.undo(i)); else if (a === 'clr') done(Loop.clear(i)); else if (a === 'exp') Loop.export(i).then(toast);
        else if (a === 'gen') Loop.generate(i, $('#dl-style', b).value, $('#dl-genre', b).value, bars()).then(function (r) { done(r.text); }, err);
        else if (a === 'pad') Loop.toPad(i, UI.sel).then(function () { toast('→ pad ' + LETTERS[UI.sel] + ' (bank ' + 'ABCD'[MPC.bank] + ')'); }, err); }; });
      $$('[data-f]', el).forEach(function (x) { x.oninput = x.onchange = function () { Loop.setFx(i, x.dataset.f, x.type === 'checkbox' ? x.checked : x.value); }; }); });
  }
  function rLib(b) {
    var l = Lib.list();
    b.innerHTML = '<div class="dbs-card"><h3>📚 Biblioteka (' + l.length + ')</h3><p class="dbs-mut">Utwory D Song, pętle i sample — zapisane w aplikacji (IndexedDB). Eksport: WAV.</p>' + (l.length ? l.map(function (m) { return '<div class="dbs-li" data-id="' + esc(m.id) + '"><span>' + ({ song: '🎵', loop: '🔁', sample: '🥁' }[m.kind] || '•') + ' <b>' + esc(m.title) + '</b> <i>' + (m.bpm ? m.bpm + ' BPM' : '') + (m.key ? ' · ' + esc(m.key) : '') + ' · ' + Math.round((m.size || 0) / 1024) + ' kB</i></span><span class="dbs-row"><button type="button" data-a="play">▶</button><button type="button" data-a="A">A</button><button type="button" data-a="B">B</button><button type="button" data-a="exp">⇪</button><button type="button" data-a="del">🗑</button></span></div>'; }).join('') : '<p>pusto</p>') + '</div>';
    $$('.dbs-li', b).forEach(function (el) { var id = el.dataset.id; $$('[data-a]', el).forEach(function (x) { x.onclick = function () { var a = x.dataset.a;
      if (a === 'play') Player.play(id).then(toast); else if (a === 'exp') Lib.blob(id).then(function (bl) { var m = Lib.get(id); return share(m.title, bl); }).then(toast); else if (a === 'del') Lib.remove(id).then(function () { rLib(b); }); else Song.toDeck(id, a).then(toast); }; }); });
  }

  // ================================================================== v47 defaults: first launch = everything ON
  // FULL AUTO, all-sync, live BPM sync, all agents, D Doctor auto, D Loop auto-loop generator, D Song ready, brain = „Model X”.
  // Stays opt-in for safety: auto-reply to other people, and the 630 MB free-brain download (asked once, one tap).
  // The big ⏹ STOP still stops everything (FULL AUTO, auto mix, party, MIDI clock + studio playback / sequencer / loops / MIDI clock).
  var Brain = {
    label: 'Model X',
    // best available: a cloud key if set → the free on-device brain → offline rules
    which: function () {
      var BR = global.DBotBrains; if (BR) { var pk = BR.pick('chat'); if (pk && pk !== 'local') return { label: 'Model X', kind: 'cloud', detail: BR.modelX('chat') + (BR.cloudIds().length > 1 ? ' (+' + (BR.cloudIds().length - 1) + ' mózgi, ' + (BR.mode() === 'merge' ? 'łączy odpowiedzi' : 'wg zadania') + ')' : '') }; }
      var S = global.D7Super, L = global.DBotLocalAI;
      try { if (S && S.aiOn && S.aiOn()) { var ls = S.usableList(); return { label: 'Model X', kind: 'cloud', detail: 'chmura · ' + ls.join('+') }; } } catch (_) {}
      try { if (L && L.usable()) return { label: 'Model X', kind: 'device', detail: 'na urządzeniu · Qwen3 0.6B' }; } catch (_) {}
      try { if (L && L.status().downloading) return { label: 'Model X', kind: 'downloading', detail: 'pobieram darmowy mózg…' }; } catch (_) {}
      return { label: 'Model X', kind: 'offline', detail: 'offline (reguły) · dodaj klucz albo pobierz darmowy mózg' };
    },
    text: function () { var w = Brain.which(); return '🧠 Model X → ' + w.detail; },
    hook: function () {
      var Mo = global.DBotModules; if (!Mo || !Mo.list || !Mo.list.brain || Mo.list.brain.__mx) return !!(Mo && Mo.list && Mo.list.brain && Mo.list.brain.__mx);
      var b = Mo.list.brain, chk = b.check; b.__mx = true; b.label = '🧠 Model X';
      b.check = function () { var r = chk.apply(this, arguments) || ['yellow', '']; var w = Brain.which(); return [r[0], 'Model X → ' + (w.kind === 'offline' ? r[1] : w.detail)]; };
      return true;
    }
  };

  var FirstRun = {
    done: function () { return !!sget('v47.firstRun', null); },
    applied: [],
    run: function (force) {
      if (global.__D77_NO_FIRSTRUN && !force) return null;
      if (FirstRun.done() && !force) return null;
      var a = FirstRun.applied = [];
      function step(name, f) { try { var r = f(); a.push(name); return r; } catch (e) { a.push(name + ' ✖ ' + e.message); } }
      step('live BPM sync', function () { Sync.setAuto(true); Sync.setLeader('auto'); });
      step('wszyscy agenci', function () { var A = global.DBotAgents; if (A && A.list) { A.list().forEach(function (x) { x.enabled = true; }); A.save && A.save(); } });
      step('D Doctor auto', function () { var D = global.DBotDoctor; if (D && D.setCfg) { D.setCfg('onStart', true); D.setCfg('inAuto', true); } });
      step('D Loop auto', function () { sset('studio.autoLoop', true); });
      step('D Song gotowy', function () { sset('studio.songReady', true); });
      step('Model X', function () { sset('brain.label', 'Model X'); Brain.hook(); });
      step('all-sync', function () { var Mo = global.DBotModules; if (Mo && Mo.syncAll) Mo.syncAll('first-run'); });
      step('FULL AUTO', function () { var F = global.DBotFullAuto; if (F && !F.on) F.start(true); });
      sset('v47.firstRun', { at: new Date().toISOString(), applied: a.slice() });
      try { if (global.DBotRepairs) global.DBotRepairs.add('auto', 'Pierwsze uruchomienie v47: wszystko włączone (' + a.join(', ') + ')'); } catch (_) {}
      post('🚀 Multi-talent X — pierwsze uruchomienie: wszystko włączone ✓ FULL AUTO · all-sync · live BPM sync · ' + ((global.DBotAgents && global.DBotAgents.list().length) || 10) + ' agentów · D Doctor auto · D Loop auto · D Song gotowy · ' + Brain.text() + '.\nNa Twoją decyzję zostają: auto-reply do innych osób (Center) i pobranie darmowego mózgu. ⏹ STOP zatrzymuje wszystko.');
      setTimeout(FirstRun.askModel, 600);
      return a;
    },
    // ask once, with one tap, about the 630 MB on-device brain (only when there is no cloud key and it isn't installed)
    askModel: function () {
      var L = global.DBotLocalAI; if (!L || sget('v47.modelAsked', false)) return false;
      var w = Brain.which(); if (w.kind !== 'offline') return false;
      try { var st = L.status(); if (st.installed || st.downloading || st.ramOk === false) return false; } catch (_) { return false; }
      sset('v47.modelAsked', true);
      post('🧠 Model X: chcesz darmowy mózg AI na urządzeniu? Jednorazowe pobranie ' + (L.sizeMb || 630) + ' MB (najlepiej na Wi-Fi), potem działa bez internetu i bez kluczy.');
      var log = document.getElementById('d7c-log'), last = log && log.querySelector('.d7c-msg.bot:last-of-type'); if (!last) return true;
      var box = document.createElement('div'); box.className = 'dbot-brain-btns dbs-chat-btns dbs-model-ask';
      var yes = document.createElement('button'); yes.type = 'button'; yes.textContent = '⬇ Pobierz ' + (L.sizeMb || 630) + ' MB';
      var no = document.createElement('button'); no.type = 'button'; no.textContent = 'Nie teraz';
      yes.onclick = function () { box.remove(); sset('v47.modelChoice', 'download'); try { L.enable && L.enable(true); var r = L.download(false); post('⬇ Pobieram darmowy mózg (' + (L.sizeMb || 630) + ' MB) — postęp w Center → Status.'); return r; } catch (e) { post('✖ ' + e.message); } };
      no.onclick = function () { box.remove(); sset('v47.modelChoice', 'later'); post('OK — Model X zostaje przy ' + (Brain.which().kind === 'cloud' ? 'chmurze' : 'trybie offline') + '. Pobierzesz później w Center → Super D Bot.'); };
      box.appendChild(yes); box.appendChild(no); last.appendChild(box);
      return true;
    }
  };

  // D Loop auto-loop generator: keeps loop 1 filled with a generated drum loop at the master BPM (generated only, never auto-played)
  var AutoLoop = {
    ensure: function () {
      if (!sget('studio.autoLoop', false) || Loop.busy) return Promise.resolve(null);
      var T = Loop.tracks[0]; if (T && T.buf) return Promise.resolve(null);
      var g = (Sync.radio && Sync.radio().genre) || 'house';
      if (!GENRES[g]) g = 'house';
      return Loop.generate(0, 'drums', g, 2).then(function (r) { AutoLoop.last = { at: Date.now(), genre: g }; return r; }).catch(function () { return null; });
    }
  };

  // the big STOP also stops the studio
  function hookStop() {
    var F = global.DBotFullAuto; if (!F || F.__studioStop) return !!(F && F.__studioStop);
    var orig = F.stop; F.__studioStop = true;
    F.stop = function () {
      var r = orig.apply(F, arguments);
      try { Player.stop(); } catch (_) {} try { MPC.seqStop(); } catch (_) {} try { Loop.stop(); } catch (_) {} try { if (WebClock.running) WebClock.stop(); } catch (_) {}
      fire('stop', null);
      return r + ' Studio (piosenka, sekwencer MPC, looper, MIDI clock) też stop.';
    };
    return true;
  }

  // ================================================================== discreet STOP (v47): no big red STOP while auto runs
  // small ⏹ icon in the top bar (only while something automatic runs) + long-press (0.7 s) on the D Bot badge + „stop” in chat/voice.
  // The big button can be brought back in ⚙ Opcje → Auto.
  function autoActive() { var F = global.DBotFullAuto, DJ = global.DBotDJ, MS = global.DBotMidiSync; return !!((F && F.on) || (DJ && DJ.auto && (DJ.auto.on || DJ.party.on)) || (MS && MS.running) || Loop.playing || (MPC.seq && MPC.seq.playing) || WebClock.running); }
  // v48: ⏹ / long-press / „stop” = STOP for this session only (FULL AUTO comes back on the next launch or with „start” / ▶);
  // switching it off for good = ⚙ Opcje → Auto (persist) or „wyłącz auto na stałe”.
  function stopAll(src, persist) {
    var F = global.DBotFullAuto, r, wasOn = !!(F && F.on) || !!sget('auto.full', false);
    if (F && F.stop) r = F.stop(); else { Player.stop(); MPC.seqStop(); Loop.stop(); r = '⏹ STOP'; }
    if (!persist && wasOn) { sset('auto.full', true); if (F) F.held = true; r += ' · FULL AUTO wraca po restarcie albo gdy powiesz „start” (na stałe: ⚙ Opcje → Auto).'; }
    else if (persist) { sset('auto.full', false); if (F) F.held = false; }
    fire('stopall', { src: src, persist: !!persist });
    try { if (global.DBotRepairs) global.DBotRepairs.add('auto', 'STOP (' + (src || 'chat') + ')'); } catch (_) {}
    paintMini(); return r;
  }
  function paintMini() {
    var root = document.documentElement; root.classList.toggle('dbot-bigstop', !!sget('ui.bigStop', false));
    var m = document.getElementById('dbot-mini-stop');
    if (!m) {
      var badge = document.querySelector('.sx-badge'), top = badge ? badge.parentNode : document.querySelector('.sx-actions'); if (!top) return; // v48: next to the badge, far from „Stop Kali”
      m = document.createElement('button'); m.type = 'button'; m.id = 'dbot-mini-stop'; m.className = 'sx-btn dbot-mini-stop'; m.title = 'STOP — zatrzymaj wszystko automatyczne (FULL AUTO, auto mix, party, MIDI clock, studio)'; m.setAttribute('aria-label', 'STOP'); m.textContent = '⏹';
      m.onclick = function () { var r = stopAll('ikona ⏹'); var C = global.D7Chat; if (C && C.add) C.add('bot', r); };
      if (badge) top.insertBefore(m, badge.nextSibling); else top.appendChild(m);
    }
    m.hidden = !autoActive();
  }
  function hookBadge() {
    var b = document.querySelector('.sx-badge'); if (!b || b.__lp) return !!b; b.__lp = true;
    var t = 0, fired = false;
    function start(e) { fired = false; clearTimeout(t); t = setTimeout(function () { fired = true; if (navigator.vibrate) try { navigator.vibrate(40); } catch (_) {} var r = stopAll('długie przytrzymanie D Bot'); var C = global.D7Chat; if (C && C.add) C.add('bot', r); }, 1200); }
    function end() { clearTimeout(t); }
    b.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, end); });
    b.addEventListener('click', function (e) { if (fired) { e.preventDefault(); e.stopPropagation(); } }, true);
    b.title = (b.title || '') + ' · przytrzymaj = STOP';
    return true;
  }

  // ⚙ Opcje → 🤖 Auto card (Center): everything ON by default; switch any of it off here
  function autoOpts(b) {
    if (!b || b.querySelector('#op-auto')) return;
    var F = global.DBotFullAuto, D = global.DBotDoctor, dc = D && D.cfg ? D.cfg() : {};
    var rows = [['full', '🤖 FULL AUTO (D Bot prowadzi decki, party, MIDI clock, all-sync)', !!(F && F.on)], ['sync', '🎚 Live BPM sync (radio / decki / utwory / pętle / MIDI)', !!Sync.auto], ['loop', '🔁 D Loop auto (generator pętli)', !!sget('studio.autoLoop', false)], ['doc', '🩺 D Doctor auto (przy starcie i w FULL AUTO)', !!(dc.onStart && dc.inAuto)], ['big', 'Duży przycisk STOP na ekranie', !!sget('ui.bigStop', false)], ['ufo', '🛸 UFO kosmita na ekranie (maskotka)', sget('ui.ufo', true) !== false]];
    var card = document.createElement('div'); card.className = 'dbc-card'; card.id = 'op-auto';
    card.innerHTML = '<h3>🤖 Auto — domyślnie wszystko włączone</h3>' + rows.map(function (r) { return '<label class="dbc-row"><span>' + r[1] + '</span><input type="checkbox" data-auto="' + r[0] + '"' + (r[2] ? ' checked' : '') + '></label>'; }).join('') +
      '<div class="dbc-btns"><button type="button" id="op-auto-off">⏹ Wyłącz wszystkie auto</button><button type="button" id="op-auto-on">▶ Włącz wszystko</button></div>' +
      '<p class="dbc-hint">STOP: mała ikona ⏹ w górnym pasku (gdy coś działa automatycznie), przytrzymaj odznakę D Bot albo powiedz / napisz „stop”. Auto-reply do innych osób i pobranie darmowego mózgu zawsze tylko za Twoją zgodą.</p>';
    b.insertBefore(card, b.firstChild);
    function set(k, on) {
      if (k === 'full') { if (on) { if (F && !F.on) F.start(true); } else stopAll('Opcje', true); }
      else if (k === 'sync') Sync.setAuto(on);
      else if (k === 'loop') { sset('studio.autoLoop', on); if (on) AutoLoop.ensure(); }
      else if (k === 'doc' && D && D.setCfg) { D.setCfg('onStart', on); D.setCfg('inAuto', on); }
      else if (k === 'big') { sset('ui.bigStop', on); }
      else if (k === 'ufo') { if (global.DBotUFO) global.DBotUFO.show(on); else sset('ui.ufo', on); }
      paintMini();
    }
    Array.prototype.forEach.call(card.querySelectorAll('[data-auto]'), function (x) { x.onchange = function () { set(x.dataset.auto, x.checked); }; });
    card.querySelector('#op-auto-off').onclick = function () { ['full', 'sync', 'loop', 'doc'].forEach(function (k) { set(k, false); }); Array.prototype.forEach.call(card.querySelectorAll('[data-auto]'), function (x) { if (!/^(big|ufo)$/.test(x.dataset.auto)) x.checked = false; }); };
    card.querySelector('#op-auto-on').onclick = function () { ['sync', 'loop', 'doc', 'full'].forEach(function (k) { set(k, true); }); Array.prototype.forEach.call(card.querySelectorAll('[data-auto]'), function (x) { if (!/^(big|ufo)$/.test(x.dataset.auto)) x.checked = true; }); };
  }

  // ================================================================== boot
  function topButton() {
    if (document.getElementById('dbot-studio-btn')) return;
    var top = document.querySelector('.dbot-topbtn'); if (!top || !top.parentNode) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'dbot-studio-btn'; b.className = 'sx-btn dbot-topbtn dbs-topbtn'; b.innerHTML = '🎛 <span class="lbl">Studio</span>'; b.title = 'D77 Studio — D Song · MPC · Looper · BPM sync'; b.onclick = function () { UI.open(); };
    top.parentNode.insertBefore(b, top);
  }
  function boot() {
    MPC.load(); Loop.load().catch(function () {});
    Sync.start(); addDoctorModules();
    topButton(); setTimeout(topButton, 2500);
    if (global.SpecialX && global.SpecialX.state && global.SpecialX.state.bpm && !sget('studio.bpm', 0)) Clock.bpm = global.SpecialX.state.bpm;
    DB.open().catch(function () {});
    var tries = 0, t = setInterval(function () { var d = addDoctorModules(), b = Brain.hook(), s = hookStop(); if ((d && b && s) || ++tries > 20) clearInterval(t); }, 1000);
    setInterval(function () { try { paintMini(); hookBadge(); } catch (_) {} }, 1000);
    setTimeout(function () { hookStop(); Brain.hook(); FirstRun.run(); setTimeout(function () { AutoLoop.ensure(); }, 3000); if (sget('studio.autoLoop', false)) MPC.initKit().catch(function () {}); }, 2600);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 900); }); else setTimeout(boot, 900);

  global.DBotStudio = { version: '48', range: Range, clock: Clock, detect: Detect, sync: Sync, webMidi: WebClock, song: Song, player: Player, mpc: MPC, looper: Loop, lib: Lib, db: DB, ui: UI,
    intent: intent, chat: chat, render: render, wav: wav, share: share, genres: GENRES, parsePrompt: parsePrompt, offlineLyrics: offlineLyrics, ctx: ctx, out: out, on: on, addDoctorModules: addDoctorModules, letters: LETTERS, kit: KIT, brain: Brain, firstRun: FirstRun, autoLoop: AutoLoop, stopAll: stopAll, autoActive: autoActive, autoOpts: autoOpts };
  global.DBotRange = Range;
})(typeof window !== 'undefined' ? window : globalThis);
