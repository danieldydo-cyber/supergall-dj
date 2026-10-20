/**
 * D Bot · PRO8 Fluid (v43) — built on D Bot · X7S v41 / X71 — Daniel Dydo · Kraków
 * One page: Kali radio (YouTube IFrame) + MilkDrop (butterchurn) beat-synced viz
 * + ONE main bot „D Bot” (D Bot, js/bot-d.js) in the floating chat (js/d7-chat.js, text + voice)
 * + PRO8 Pioneer-style decks / DJM mixer (js/pro8.js) + FX.
 * Classic script (no module) so a module failure can never block START.
 */
(function () {
  'use strict';

  var VERSION = '43';
  var qs = new URLSearchParams(location.search);
  // Old WhatsApp remote links (/?remote=1) keep working on the classic build
  if (qs.get('remote') === '1') { location.replace('classic.html' + location.search); return; }

  var MODE = document.body.getAttribute('data-mode') || 'main';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;

  // ---------------------------------------------------------------- data
  var KALI = { id: 'jMRlCH3B6mY', title: 'KALI LIVE RADIO · 24/7', genre: 'kali', bpm: 128, live: true };
  var YT_LIST = [
    KALI,
    { id: 'D6DNubWWsoI', title: 'DaX DJ RemiX · 70min set DD (Brother Max)', genre: 'mix', bpm: 128 },
    { id: 'mzwAC_Am0bI', title: 'Oscar Mulero · Boiler Room Berlin', genre: 'berlin', bpm: 128 },
    { id: '62Ql2yzFJZo', title: 'Ken Ishii · Boiler Room Berlin', genre: 'berlin', bpm: 128 },
    { id: '5vHRUsP20dQ', title: 'Maceo Plex · Boiler Room Berlin', genre: 'berlin', bpm: 126 },
    { id: 'pEOhnkjEpqE', title: 'Ancient Methods · Boiler Room Berlin', genre: 'berlin', bpm: 130 },
    { id: '5NuRC714fv8', title: 'Chris Liebing B2B Luke Slater · BR Warsaw', genre: 'techno', bpm: 132 },
    { id: 'EUc3zR3pHhQ', title: 'DINA · Boiler Room Ghent', genre: 'techno', bpm: 135 },
    { id: 'vffcMNENsFU', title: 'Courtesy · Boiler Room Berlin', genre: 'techno', bpm: 128 },
    { id: 'w6bckgiG7OI', title: 'Ferry Corsten · Blueprint Reprinted', genre: 'trance', bpm: 132 },
    { id: 'IhrrJgsl5po', title: 'Ferry Corsten · ASOT 1271 Residency Mix', genre: 'trance', bpm: 132 },
    { id: 'jl1TlMu1E-w', title: 'Ferry Corsten · ASOT 2025 Ahoy', genre: 'trance', bpm: 138 }
  ];
  var TRACKS = [
    { id: 'drive-dd-fly', name: 'DD DJ FLY Remix', file: 'samples/from-drive/DD-DJ-FLY-Remix.mp3', bpm: null },
    { id: 'drive-dd-fly-2', name: 'DD DJ FLY Remix 2', file: 'samples/from-drive/DD-DJ-FLY-Remix-2.mp3', bpm: null },
    { id: 'drive-double-d', name: 'Double D', file: 'samples/from-drive/Double-D.mp3', bpm: null },
    { id: 'drive-aba', name: 'Aba GS Mashup', file: 'samples/from-drive/Aba-GS-Mashup.mp3', bpm: null },
    { id: 'kali-hiphop-120', name: 'Kali · Hip-Hop 120', file: 'samples/kali-hiphop-120.wav', bpm: 120 },
    { id: 'berlin-techno-128', name: 'Berlin Techno 128', file: 'samples/berlin-techno-128.wav', bpm: 128 },
    { id: 'trance-120', name: 'Trance 120', file: 'samples/trance-120.wav', bpm: 120 },
    { id: 'memory-beat', name: 'Memory Beat History', file: 'samples/memory-beat-history.mp3', bpm: null }
  ];
  var PSYCH_RE = /geiss|martin|flexi|rovastar|shifter|tunnel|kaleid|fractal|plasma|spiral|warp|galaxy|neon|tron|cyber|hexagon|radial|bloom|rainbow|acid|trip/i;
  var BEATS_PER_PRESET = 16;   // 4 bars
  var MIN_PRESET_MS = 6500;
  var MAX_PRESET_MS = 24000;   // safety wander if beats go quiet
  var BLEND = 2.8;

  // ---------------------------------------------------------------- state
  var S = {
    started: false, ctx: null, master: null, vizIn: null, analyser: null, freq: null, sink: null,
    viz: null, vizOk: false, presets: {}, keys: [], idx: -1, recent: [], autoWander: true,
    lastPresetAt: 0, renderErrors: 0, darkStrikes: 0,
    bpm: 128, beatSource: 'pulse', beatCount: 0, lastBeatAt: 0, detBpm: 0,
    det: { avg: 0, last: 0, intervals: [] },
    pulse: { bus: null, kickOsc: null, kickG: null, hatG: null, next: 0, timer: 0, level: -1 },
    fs: false, pseudoFs: false, lastFsToggle: 0, idleTimer: 0,
    yt: null, ytReady: false, ytApiFailed: false, ytTrack: KALI, radioWanted: false, radioPlaying: false,
    radioVol: 90, ytWatchdog: 0,
    decks: {}, xfade: 0.5, masterVol: 0.9,
    account: null, wakeLock: null, taps: [],
    liveGen: false, filterVal: 50, echoOn: false, kaliLocal: false, booted: false, fx: null
  };
  window.__sxReady = true;
  window.__sxState = S;

  // ---------------------------------------------------------------- Opcje (X7S): every feature on by default, all toggleable + persisted
  var OPT_KEY = 'd7-opts';
  var OPT_DEFS = [
    { k: 'kaliOnStart', label: 'Kali radio na START', alias: 'kali na start|kali start|radio na start', def: true },
    { k: 'autoWander', label: 'Auto zmiana presetów', alias: 'auto|auto wander|wander|auto presety', def: true },
    { k: 'beatSync', label: 'Presety w rytm (beat sync)', alias: 'beat sync|beat|rytm|sync beat', def: true },
    { k: 'liveGen', label: 'LIVE GEN (szybki wander + rotacja klimatu)', alias: 'live gen|livegen|generator', def: false },
    { k: 'darkSkip', label: 'Pomijaj ciemne presety', alias: 'ciemne|dark|ciemne presety', def: true },
    { k: 'fx', label: 'Filter + Echo w mikserze', alias: 'fx|filter|efekty', def: true },
    { k: 'offlineCache', label: 'Zapisz utwory offline po START', alias: 'offline cache|cache|zapis offline|offline', def: true },
    { k: 'voiceReplies', label: 'D Bot czyta odpowiedzi na głos (TTS)', alias: 'glos|tts|czytanie|mowa|odpowiedzi na glos', def: false },
    { k: 'cloudSync', label: 'Sync czatu i ustawień z serwerem', alias: 'sync serwer|cloud|sync z serwerem|synchronizacja', def: true },
    { k: 'wakeLock', label: 'Nie wygaszaj ekranu', alias: 'ekran|wake lock|wygaszanie', def: true }
  ];
  function loadOpts() {
    var o = {}, saved = null;
    try { saved = JSON.parse(localStorage.getItem(OPT_KEY) || 'null'); } catch (_) {}
    OPT_DEFS.forEach(function (d) { o[d.k] = saved && typeof saved[d.k] === 'boolean' ? saved[d.k] : d.def; });
    S.optsSaved = !!saved;
    return o;
  }
  function saveOpts() { try { localStorage.setItem(OPT_KEY, JSON.stringify(S.opts)); S.optsSaved = true; } catch (_) {} }
  S.opts = loadOpts();
  S.autoWander = S.opts.autoWander;
  S.liveGen = S.opts.liveGen;

  // ---------------------------------------------------------------- utils
  function norm(s) {
    return String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  function fmt(t) {
    if (!isFinite(t) || t < 0) return '0:00';
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  var toastT = 0;
  function toast(msg, ms) {
    var el = $('#sx-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('show'); }, ms || 3200);
  }
  function safe(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) { console.warn('[SX]', e); } }; }
  window.addEventListener('error', function (e) { console.warn('[SX] error', e && e.message); });
  window.addEventListener('unhandledrejection', function (e) { console.warn('[SX] rejection', e && e.reason); });

  // ---------------------------------------------------------------- audio graph
  function ensureAudio() {
    if (S.ctx) return S.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { S.ctx = new AC({ latencyHint: 'playback' }); } catch (e) { try { S.ctx = new AC(); } catch (e2) { return null; } }
    var ctx = S.ctx;
    S.master = ctx.createGain();
    S.master.gain.value = S.masterVol;
    S.master.connect(ctx.destination);
    // Deck FX bus (classic echo/filter ideas): decks → fxIn → filter → master (+ echo send)
    try {
      var fx = { in: ctx.createGain(), filter: ctx.createBiquadFilter(), delay: ctx.createDelay(2.0), fb: ctx.createGain(), wet: ctx.createGain() };
      fx.filter.type = 'lowpass'; fx.filter.frequency.value = 20000; fx.filter.Q.value = 0.8;
      fx.fb.gain.value = 0.38; fx.wet.gain.value = 0;
      fx.in.connect(fx.filter); fx.filter.connect(S.master);
      fx.filter.connect(fx.delay); fx.delay.connect(fx.fb); fx.fb.connect(fx.delay); fx.delay.connect(fx.wet); fx.wet.connect(S.master);
      S.fx = fx;
    } catch (e) { console.warn('[SX] fx', e); S.fx = null; }
    // silent sink keeps analysis-only branches pulled by the graph
    S.sink = ctx.createGain();
    S.sink.gain.value = 0;
    S.sink.connect(ctx.destination);
    S.vizIn = ctx.createGain();
    S.vizIn.connect(S.sink);
    S.master.connect(S.vizIn);
    S.analyser = ctx.createAnalyser();
    S.analyser.fftSize = 2048;
    S.analyser.smoothingTimeConstant = 0.55;
    S.master.connect(S.analyser);
    S.analyser.connect(S.sink);
    S.freq = new Uint8Array(S.analyser.frequencyBinCount);
    // Low-band branch for onset detection (linear energy → better kick contrast than dB FFT)
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 150; lp.Q.value = 0.7;
    S.lowAn = ctx.createAnalyser();
    S.lowAn.fftSize = 1024;
    S.lowLp = lp; S.master.connect(lp); lp.connect(S.lowAn); S.lowAn.connect(S.sink);
    S.lowBuf = new Float32Array(S.lowAn.fftSize);
    buildPulse();
    return ctx;
  }

  function resumeAudio() {
    if (S.ctx && S.ctx.state !== 'running') {
      try { var p = S.ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (_) {}
    }
  }

  /** 128 BPM silent beat pulse — drives MilkDrop when real audio can't be analysed (YouTube). */
  function buildPulse() {
    var ctx = S.ctx, P = S.pulse;
    P.bus = ctx.createGain();
    P.bus.gain.value = 1;
    P.bus.connect(S.vizIn); // viz only — never audible (vizIn → silent sink)
    var drone = ctx.createOscillator(), dg = ctx.createGain();
    drone.type = 'sawtooth'; drone.frequency.value = 55; dg.gain.value = 0.05;
    drone.connect(dg); dg.connect(P.bus); drone.start();
    var mid = ctx.createOscillator(), mg = ctx.createGain();
    mid.type = 'triangle'; mid.frequency.value = 330; mg.gain.value = 0.025;
    mid.connect(mg); mg.connect(P.bus); mid.start();
    P.kickOsc = ctx.createOscillator(); P.kickG = ctx.createGain();
    P.kickOsc.type = 'sine'; P.kickOsc.frequency.value = 50; P.kickG.gain.value = 0.0001;
    P.kickOsc.connect(P.kickG); P.kickG.connect(P.bus); P.kickOsc.start();
    try {
      var len = ctx.sampleRate | 0, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
      P.hatG = ctx.createGain(); P.hatG.gain.value = 0.0001;
      noise.connect(hp); hp.connect(P.hatG); P.hatG.connect(P.bus); noise.start();
    } catch (_) {}
    P.timer = setInterval(safe(schedulePulse), 25);
  }

  function schedulePulse() {
    var ctx = S.ctx, P = S.pulse;
    if (!ctx || ctx.state !== 'running') return;
    var now = ctx.currentTime, spb = 60 / S.bpm;
    if (P.next < now - 0.2) P.next = now + 0.05;
    while (P.next < now + 0.12) {
      var t = P.next;
      P.kickOsc.frequency.setValueAtTime(150, t);
      P.kickOsc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      P.kickG.gain.setValueAtTime(0.0001, t);
      P.kickG.gain.linearRampToValueAtTime(0.9, t + 0.006);
      P.kickG.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      if (P.hatG) {
        var h = t + spb / 2;
        P.hatG.gain.setValueAtTime(0.0001, h);
        P.hatG.gain.linearRampToValueAtTime(0.35, h + 0.004);
        P.hatG.gain.exponentialRampToValueAtTime(0.0001, h + 0.07);
      }
      (function (delay) {
        setTimeout(function () { if (S.beatSource === 'pulse') onBeat(); }, delay);
      })(Math.max(0, (t - now) * 1000));
      P.next += spb;
    }
  }

  function setPulseLevel(v) {
    var P = S.pulse;
    if (!P.bus || Math.abs(P.level - v) < 0.01) return;
    P.level = v;
    try { P.bus.gain.setTargetAtTime(v, S.ctx.currentTime, 0.3); } catch (_) { P.bus.gain.value = v; }
  }

  function setBpm(v, opts) {
    var n = Math.max(60, Math.min(200, Number(v) || 128));
    S.bpm = Math.round(n * 10) / 10;
    if (opts && opts.phase && S.ctx) S.pulse.next = S.ctx.currentTime + 0.02;
    if (S.echoOn && S.fx && S.ctx) S.fx.delay.delayTime.setTargetAtTime(Math.min(1.9, (60 / S.bpm) * 0.75), S.ctx.currentTime, 0.05);
    paintBeat();
  }

  // ---------------------------------------------------------------- beat handling
  function decksPlaying() {
    var any = false;
    Object.keys(S.decks).forEach(function (k) { var d = S.decks[k]; if (d && !d.audio.paused && d.src) any = true; });
    return any;
  }

  function updateBeatSource() {
    var audio = decksPlaying();
    var src = audio ? 'audio' : 'pulse';
    if (src !== S.beatSource) { S.beatSource = src; S.det.intervals = []; paintBeat(); }
    setPulseLevel(audio ? (S.radioPlaying ? 0.3 : 0) : 1);
  }

  function detectAudioBeat(now) {
    if (S.beatSource !== 'audio' || !S.lowAn) return;
    var buf = S.lowBuf, sum = 0;
    if (S.lowAn.getFloatTimeDomainData) S.lowAn.getFloatTimeDomainData(buf);
    else { var b8 = new Uint8Array(buf.length); S.lowAn.getByteTimeDomainData(b8); for (var j = 0; j < b8.length; j++) buf[j] = (b8[j] - 128) / 128; }
    for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    var e = Math.sqrt(sum / buf.length), D = S.det;
    D.avg = D.avg ? D.avg * 0.97 + e * 0.03 : e;
    S.det.e = e;
    if (e > D.avg * 1.35 && e > 0.02 && now - D.last > 280) {
      var iv = now - D.last;
      D.last = now;
      if (iv > 280 && iv < 1500) {
        D.intervals.push(iv);
        if (D.intervals.length > 16) D.intervals.shift();
        if (D.intervals.length >= 4) {
          var sorted = D.intervals.slice().sort(function (a, b) { return a - b; });
          var bpm = 60000 / sorted[sorted.length >> 1];
          while (bpm < 80) bpm *= 2;
          while (bpm > 170) bpm /= 2;
          S.detBpm = Math.round(bpm);
        }
      }
      onBeat();
    }
  }

  var beatDotT = 0;
  function onBeat() {
    var now = performance.now();
    S.lastBeatAt = now;
    S.beatCount++;
    root.style.setProperty('--beat', '1');
    var dot = $('#sx-beat-dot');
    if (dot) dot.classList.add('flash');
    clearTimeout(beatDotT);
    beatDotT = setTimeout(function () {
      root.style.setProperty('--beat', '0');
      if (dot) dot.classList.remove('flash');
    }, 110);
    var every = S.liveGen ? 8 : BEATS_PER_PRESET;
    if (S.opts.beatSync && S.autoWander && S.vizOk && S.beatCount % every === 0 && now - S.lastPresetAt > (S.liveGen ? 3500 : MIN_PRESET_MS)) {
      randomPreset(S.liveGen ? 2.0 : BLEND);
    }
    // LIVE GENERATOR: rotate the pulse feel Kali 120 → Berlin 128 → Trance 132 (only when no real tempo source is audible)
    if (S.liveGen && S.beatSource === 'pulse' && !S.radioPlaying && S.beatCount % 128 === 0) {
      var feels = [120, 128, 132];
      setBpm(feels[(feels.indexOf(Math.round(S.bpm)) + 1) % feels.length]);
    }
    if (S.beatCount % 8 === 0) paintBeat();
  }

  function paintBeat() {
    var lab = $('#sx-beat-label'), chip = $('#sx-chip-beat');
    if (!lab) return;
    if (S.beatSource === 'audio') lab.textContent = 'BEAT · AUDIO ' + (S.detBpm ? S.detBpm : '…');
    else lab.textContent = 'BEAT · PULSE ' + Math.round(S.bpm);
    if (chip) chip.classList.toggle('on', S.started);
  }

  // ---------------------------------------------------------------- MilkDrop
  function resolveBc() {
    var m = window.butterchurn;
    if (!m) return null;
    if (typeof m.createVisualizer === 'function') return m;
    if (m.default && typeof m.default.createVisualizer === 'function') return m.default;
    return null;
  }

  function loadPresets() {
    var p = {};
    try { if (window.butterchurnPresets && butterchurnPresets.getPresets) Object.assign(p, butterchurnPresets.getPresets()); } catch (_) {}
    try { if (window.butterchurnPresetsExtra && butterchurnPresetsExtra.getPresets) Object.assign(p, butterchurnPresetsExtra.getPresets()); } catch (_) {}
    S.presets = p;
    S.keys = Object.keys(p);
    return S.keys.length;
  }

  function vizSize() {
    var stage = $('#sx-stage'), c = $('#sx-viz');
    if (!stage || !c) return null;
    var r = stage.getBoundingClientRect();
    var cssW = Math.max(2, r.width), cssH = Math.max(2, r.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cssW * dpr, h = cssH * dpr;
    // 1080p budget: long side ≤ 1920, short side ≤ 1080 (keeps exact aspect, no stretching)
    var s = Math.min(1, 1920 / Math.max(w, h), 1080 / Math.min(w, h));
    w = Math.max(2, Math.round(w * s)); h = Math.max(2, Math.round(h * s));
    w -= w % 2; h -= h % 2;
    return { w: w, h: h, cssW: cssW, cssH: cssH, dpr: dpr };
  }

  var resizeRaf = 0;
  function scheduleResize() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(function () {
      applySize();
      // second pass after fullscreen / orientation transitions settle
      setTimeout(applySize, 250);
    });
  }
  function applySize() {
    var z = vizSize();
    if (!z) return;
    var c = $('#sx-viz');
    if (c.width !== z.w || c.height !== z.h) {
      c.width = z.w; c.height = z.h;
      if (S.viz) { try { S.viz.setRendererSize(z.w, z.h); } catch (e) { console.warn('[SX] resize', e); } }
    }
    var f = $('#sx-fallback');
    if (f) {
      var fw = Math.round(z.cssW * Math.min(z.dpr, 1.5)), fh = Math.round(z.cssH * Math.min(z.dpr, 1.5));
      if (f.width !== fw || f.height !== fh) { f.width = fw; f.height = fh; }
    }
  }

  function initViz() {
    if (S.viz) return true;
    var bc = resolveBc(), c = $('#sx-viz');
    if (!bc || !c || !ensureAudio()) { showFallback('lib'); return false; }
    if (!loadPresets()) { showFallback('presets'); return false; }
    try {
      var z = vizSize();
      c.width = z.w; c.height = z.h;
      S.viz = bc.createVisualizer(S.ctx, c, { width: z.w, height: z.h, pixelRatio: 1, textureRatio: 1 });
      S.viz.connectAudio(S.vizIn);
      S.vizOk = true;
      randomPreset(0);
      c.classList.add('ready');
      c.addEventListener('webglcontextlost', function (e) {
        e.preventDefault(); S.vizOk = false; showFallback('lost');
      });
      c.addEventListener('webglcontextrestored', function () {
        S.viz = null; S.vizOk = false; hideFallback(); initViz();
      });
      hideFallback();
      return true;
    } catch (e) {
      console.warn('[SX] viz init', e);
      S.viz = null; S.vizOk = false;
      showFallback('init');
      return false;
    }
  }

  function presetLabel(name) {
    var el = $('#sx-preset');
    if (el) el.textContent = name.length > 70 ? name.slice(0, 68) + '…' : name;
  }

  function loadPreset(i, blend) {
    if (!S.viz || !S.keys.length) return false;
    for (var tries = 0; tries < 4; tries++) {
      var idx = ((i + tries) % S.keys.length + S.keys.length) % S.keys.length;
      var name = S.keys[idx];
      try {
        S.viz.loadPreset(S.presets[name], blend == null ? BLEND : blend);
        S.idx = idx;
        S.lastPresetAt = performance.now();
        S.darkStrikes = 0;
        S.recent.push(idx);
        if (S.recent.length > 24) S.recent.shift();
        presetLabel(name);
        persist();
        return true;
      } catch (e) { console.warn('[SX] preset failed', name, e); }
    }
    return false;
  }

  function randomPreset(blend) {
    if (!S.extraMerged && window.butterchurnPresetsExtra) { S.extraMerged = true; loadPresets(); }
    if (!S.keys.length) return false;
    var pool = [];
    var preferPsych = Math.random() < 0.6;
    for (var i = 0; i < S.keys.length; i++) {
      if (S.recent.indexOf(i) !== -1 || i === S.idx) continue;
      if (!preferPsych || PSYCH_RE.test(S.keys[i])) pool.push(i);
    }
    if (pool.length < 3) for (var j = 0; j < S.keys.length; j++) if (j !== S.idx) pool.push(j);
    return loadPreset(pool[Math.floor(Math.random() * pool.length)], blend);
  }
  function nextPreset() { return loadPreset(S.idx + 1, 2.0); }
  function prevPreset() { return loadPreset(S.idx - 1, 2.0); }

  // Anti-black-screen: sample the frame right after render; skip presets that stay dark
  var probe = null, probeCtx = null;
  function darkCheck() {
    if (!S.vizOk || !S.opts.darkSkip) return;
    if (performance.now() - S.lastPresetAt < BLEND * 1000 + 2500) return;
    try {
      if (!probe) { probe = document.createElement('canvas'); probe.width = 16; probe.height = 9; probeCtx = probe.getContext('2d', { willReadFrequently: true }); }
      probeCtx.drawImage($('#sx-viz'), 0, 0, 16, 9);
      var d = probeCtx.getImageData(0, 0, 16, 9).data, sum = 0;
      for (var i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      var lum = sum / (d.length / 4);
      if (lum < 5) { S.darkStrikes++; if (S.darkStrikes >= 3) { randomPreset(1.2); } } else S.darkStrikes = 0;
    } catch (_) {}
  }

  // 2D fallback (no WebGL / lib failed) — never a black screen
  var fbOn = false;
  function showFallback(why) {
    fbOn = true;
    var n = $('#sx-fallback-note');
    if (n) n.hidden = false;
    var c = $('#sx-viz');
    if (c) c.classList.remove('ready');
    presetLabel('Tryb lekki (' + why + ')');
  }
  function hideFallback() {
    fbOn = false;
    var n = $('#sx-fallback-note');
    if (n) n.hidden = true;
  }
  function drawFallback(t) {
    var c = $('#sx-fallback');
    if (!c || !c.width) return;
    var g = c.getContext('2d');
    if (!g) return;
    var w = c.width, h = c.height, beat = parseFloat(getComputedStyle(root).getPropertyValue('--beat')) || 0;
    var hue = (t / 60) % 360;
    var grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * (0.55 + beat * 0.08));
    grd.addColorStop(0, 'hsla(' + hue + ',90%,55%,.55)');
    grd.addColorStop(0.5, 'hsla(' + ((hue + 120) % 360) + ',90%,35%,.35)');
    grd.addColorStop(1, '#05060a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(t / 4000);
    for (var i = 0; i < 24; i++) {
      g.rotate(Math.PI / 12);
      g.strokeStyle = 'hsla(' + ((hue + i * 15) % 360) + ',100%,60%,.35)';
      g.lineWidth = 2 + beat * 3;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.max(w, h) * (0.4 + 0.1 * Math.sin(t / 700 + i)), 0); g.stroke();
    }
    g.restore();
  }

  var lastDark = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    var now = performance.now();
    if (S.started) { updateBeatSource(); detectAudioBeat(now); }
    if (S.vizOk && S.viz) {
      try {
        S.viz.render();
        S.renderErrors = 0;
        if (now - lastDark > 2000) { lastDark = now; darkCheck(); }
      } catch (e) {
        if (++S.renderErrors > 30) { S.renderErrors = 0; randomPreset(0); }
      }
      if (S.autoWander && now - S.lastPresetAt > (S.opts.beatSync ? MAX_PRESET_MS : (S.liveGen ? 9000 : 20000))) randomPreset(BLEND);
    } else if (fbOn || !S.vizOk) {
      drawFallback(t || now);
    }
  }

  // ---------------------------------------------------------------- fullscreen
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function enterFs() {
    if (S.fs) return;
    S.fs = true;
    root.classList.add('sx-fs');
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
    S.pseudoFs = !req;
    if (req) {
      try {
        var p = req.call(el, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(function () { S.pseudoFs = true; });
      } catch (e) {
        try { req.call(el); } catch (e2) { S.pseudoFs = true; }
      }
    }
    if (S.pseudoFs) setTimeout(function () { window.scrollTo(0, 1); }, 50);
    if (window.D7Chat && window.D7Chat.isOpen()) window.D7Chat.close();
    paintFs(); poke(); scheduleResize(); requestWake();
  }
  function exitFs() {
    if (!S.fs) return;
    S.fs = false;
    root.classList.remove('sx-fs', 'sx-idle');
    if (fsElement()) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
      try { var p = ex && ex.call(document); if (p && p.catch) p.catch(function () {}); } catch (_) {}
    }
    paintFs(); scheduleResize();
  }
  function toggleFs() {
    var now = performance.now();
    if (now - S.lastFsToggle < 450) return;
    S.lastFsToggle = now;
    if (S.fs) exitFs(); else enterFs();
  }
  function onFsChange() {
    if (!fsElement() && S.fs && !S.pseudoFs) exitFs();
    scheduleResize();
  }
  function paintFs() {
    var b = $('#sx-fs-btn');
    if (b) {
      b.classList.toggle('on', S.fs);
      b.innerHTML = S.fs ? '✕ <span class="lbl">Exit</span>' : '⛶ <span class="lbl">Fullscreen</span>';
    }
  }
  function poke() {
    root.classList.remove('sx-idle');
    clearTimeout(S.idleTimer);
    if (S.fs) S.idleTimer = setTimeout(function () { root.classList.add('sx-idle'); }, 2800);
  }
  function requestWake() {
    if (!S.opts.wakeLock) return;
    try {
      if ('wakeLock' in navigator && !S.wakeLock) {
        navigator.wakeLock.request('screen').then(function (l) {
          S.wakeLock = l; l.addEventListener('release', function () { S.wakeLock = null; });
        }).catch(function () {});
      }
    } catch (_) {}
  }

  function bindStageGestures() {
    var stage = $('#sx-stage');
    var lastTap = 0, lx = 0, ly = 0;
    var interactive = 'button, a, input, select, label, .sx-vizbar, .d7c';
    stage.addEventListener('dblclick', function (e) {
      if (e.target.closest(interactive)) return;
      e.preventDefault(); toggleFs();
    });
    stage.addEventListener('pointerup', function (e) {
      poke();
      if (e.pointerType === 'mouse' || e.target.closest(interactive)) return;
      var now = performance.now();
      if (now - lastTap < 350 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) {
        lastTap = 0; e.preventDefault(); toggleFs();
      } else { lastTap = now; lx = e.clientX; ly = e.clientY; }
    });
    ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, function () { if (S.fs) poke(); }, { passive: true });
    });
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);
    if (window.ResizeObserver) new ResizeObserver(scheduleResize).observe(stage);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { resumeAudio(); if (S.fs) requestWake(); scheduleResize(); }
    });
  }

  // ---------------------------------------------------------------- YouTube radio
  function loadYtApi() {
    return new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) return resolve(window.YT);
      var prev = window.onYouTubeIframeAPIReady;
      var done = false;
      window.onYouTubeIframeAPIReady = function () {
        try { if (typeof prev === 'function') prev(); } catch (_) {}
        if (!done) { done = true; resolve(window.YT); }
      };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = function () { if (!done) { done = true; reject(new Error('yt api')); } };
      document.head.appendChild(s);
      setTimeout(function () {
        if (done) return;
        done = true;
        if (window.YT && window.YT.Player) resolve(window.YT); else reject(new Error('yt api timeout'));
      }, 12000);
    });
  }

  function initYt() {
    loadYtApi().then(function () {
      S.yt = new YT.Player('sx-yt-player', {
        width: '160', height: '90', videoId: KALI.id,
        playerVars: { autoplay: 0, controls: 1, playsinline: 1, modestbranding: 1, rel: 0, origin: location.origin },
        events: {
          onReady: function () {
            S.ytReady = true;
            try { S.yt.setVolume(S.radioVol); } catch (_) {}
            if (S.radioWanted) startYtNow();
            paintRadio();
          },
          onStateChange: onYtState,
          onError: onYtError
        }
      });
    }).catch(function (e) {
      console.warn('[SX] YouTube API unavailable', e);
      S.ytApiFailed = true;
      paintRadio();
      if (S.radioWanted) radioFallback('YouTube niedostępny');
    });
  }

  function currentYtId() {
    try { var d = S.yt.getVideoData && S.yt.getVideoData(); return d && d.video_id; } catch (_) { return ''; }
  }

  function startYtNow() {
    var y = S.yt, t = S.ytTrack;
    if (!y || !S.ytReady) return;
    try {
      if (currentYtId() !== t.id) y.loadVideoById(t.id); else y.playVideo();
      y.unMute(); y.setVolume(S.radioVol);
    } catch (e) { console.warn('[SX] yt play', e); }
    clearTimeout(S.ytWatchdog);
    S.ytWatchdog = setTimeout(function () {
      if (S.radioWanted && !S.radioPlaying) {
        var box = $('#sx-yt');
        if (box) box.classList.add('attn');
        toast('Przeglądarka zablokowała autoplay — stuknij ▶ w mini-playerze radia.', 6000);
        botSay('Radio czeka na jeden tap w mini-playerze YouTube (blokada autoplay w przeglądarce). Wizualizacja leci dalej na pulsie ' + Math.round(S.bpm) + ' BPM.');
      }
    }, 7000);
  }

  function playRadio(track) {
    S.ytTrack = track || S.ytTrack || KALI;
    S.radioWanted = true;
    resumeAudio();
    if (S.ytTrack.bpm) setBpm(S.ytTrack.bpm);
    var sel = $('#sx-radio-src');
    if (sel) sel.value = S.ytTrack.id;
    if (navigator.onLine === false) { radioFallback('Offline — YouTube niedostępny'); return; }
    if (S.ytApiFailed) { radioFallback('YouTube niedostępny'); return; }
    if (S.kaliLocal && S.decks.A) { S.kaliLocal = false; S.decks.A.pause(); }
    if (S.ytReady) startYtNow();
    paintRadio();
  }

  function stopRadio() {
    S.radioWanted = false;
    if (S.kaliLocal) { S.kaliLocal = false; if (S.decks.A) S.decks.A.pause(); }
    clearTimeout(S.ytWatchdog);
    try { if (S.yt && S.ytReady) { if (S.ytTrack.live) S.yt.stopVideo(); else S.yt.pauseVideo(); } } catch (_) {}
    S.radioPlaying = false;
    paintRadio();
  }

  function onYtState(e) {
    var st = e && e.data;
    if (st === 1) {
      S.radioPlaying = true;
      var box = $('#sx-yt');
      if (box) box.classList.remove('attn');
      if (!S.radioWanted) S.radioWanted = true;
      resumeAudio();
      requestWake();
    } else if (st === 2 || st === 5 || st === -1) {
      S.radioPlaying = false;
      if (st === 2) S.radioWanted = false;
    } else if (st === 0) {
      S.radioPlaying = false;
      if (S.radioWanted) {
        if (S.ytTrack.live) setTimeout(startYtNow, 800); else playRadio(nextYt(S.ytTrack));
      }
    }
    paintRadio();
  }

  function onYtError(e) {
    var code = e && e.data;
    console.warn('[SX] yt error', code, S.ytTrack && S.ytTrack.id);
    S.radioPlaying = false;
    if (S.ytTrack.id === KALI.id) {
      radioFallback('Kali stream niedostępny (YT ' + code + ')');
    } else {
      toast('Embed niedostępny — następny z playlisty.');
      playRadio(nextYt(S.ytTrack));
    }
  }

  /** YouTube down → local Kali beat on deck A so there is always sound + real FFT beat sync. */
  function radioFallback(reason) {
    toast(reason + ' — gram lokalny Kali beat na decku A.', 5000);
    if (!S.kaliLocal && navigator.onLine !== false) botSay(reason + '. Fallback: lokalny „Kali · Hip-Hop 120” na decku A (wizualizacja w rytm z audio).', { noLog: true });
    S.radioWanted = false;
    var t = findTrack('kali');
    if (t && S.decks.A) { S.decks.A.load(t, true); S.kaliLocal = true; }
    var bt = S.decks.B && S.decks.B.track;
    if (bt && /kali/i.test(bt.name || '') && S.decks.B.audio.paused) { var alt = findTrack('berlin'); if (alt) S.decks.B.load(alt, false); }
    paintRadio();
  }

  function nextYt(cur) {
    var i = YT_LIST.findIndex(function (t) { return cur && t.id === cur.id; });
    return YT_LIST[(i + 1) % YT_LIST.length];
  }

  function paintRadio() {
    var on = S.radioPlaying, want = S.radioWanted;
    var kb = $('#sx-kali-btn');
    if (kb) {
      var isKali = S.ytTrack.id === KALI.id;
      var kOn = (want && isKali) || S.kaliLocal;
      kb.classList.toggle('on', kOn);
      kb.innerHTML = kOn ? '⏹ <span class="lbl">Stop Kali</span>' : '📻 <span class="lbl">Kali radio</span>';
    }
    var chip = $('#sx-radio-chip'), cw = $('#sx-chip-radio');
    if (chip) chip.textContent = on ? 'RADIO · ON AIR' : (want ? 'RADIO · łączę…' : 'RADIO · OFF');
    if (cw) cw.classList.toggle('on', on);
    var oa = $('#sx-onair');
    if (oa) { oa.classList.toggle('on', on); oa.textContent = on ? '● ON AIR · ' + (S.ytTrack.genre === 'kali' ? 'KALI' : 'YT') : ''; }
    var tt = $('#sx-radio-title');
    if (tt) tt.textContent = S.ytTrack.title;
    var tag = $('#sx-radio-tag');
    if (tag) tag.textContent = S.kaliLocal ? 'LOKALNY KALI' : S.ytApiFailed ? 'YT offline' : on ? 'ON AIR' : want ? 'łączę…' : (S.ytReady ? 'gotowe' : 'ładuję…');
    var sub = $('#sx-radio-sub');
    if (sub) sub.textContent = on
      ? 'Wizualizacja: puls ' + Math.round(S.bpm) + ' BPM (YouTube nie da się analizować) · TAP = złap tempo'
      : 'Jeden tap: radio + wizualizacja w rytm';
  }

  function tapTempo() {
    var now = performance.now();
    S.taps = S.taps.filter(function (t) { return now - t < 2500; });
    S.taps.push(now);
    if (S.taps.length >= 3) {
      var iv = (S.taps[S.taps.length - 1] - S.taps[0]) / (S.taps.length - 1);
      setBpm(60000 / iv, { phase: true });
      toast('Puls viz: ' + Math.round(S.bpm) + ' BPM', 1400);
      paintRadio();
      persist();
    } else {
      if (S.ctx) S.pulse.next = S.ctx.currentTime + 0.02;
      toast('TAP… (' + S.taps.length + ')', 900);
    }
  }

  // ---------------------------------------------------------------- decks (PRO8 · js/pro8.js)
  var P8 = null;
  function mountDecks() {
    if (!window.PRO8) { console.warn('[SX] pro8.js missing'); return; }
    P8 = window.PRO8.mount({
      getCtx: function () { return ensureAudio(); },
      out: function () { return S.fx ? S.fx.in : S.master; },
      master: function () { return S.master; },
      toast: toast,
      started: function () { return S.started; },
      bpm: function () { return S.bpm; },
      persist: function () { persist(); },
      setXf: function (x) { S.xfade = x; applyXfade(); persist(); },
      onState: function (d) {
        if (d.id === 'A' && S.kaliLocal && d.wasPlaying && !d.playing && !d.wantPlay && !d.scratching && !d.slipState) { S.kaliLocal = false; paintRadio(); }
        d.wasPlaying = d.playing;
      }
    });
    ['A', 'B'].forEach(function (id) {
      var d = P8.decks[id], el = d.el;
      S.decks[id] = d;
      if (!el) return;
      var sel = $('.sx-deck-src', el);
      if (sel) sel.addEventListener('change', function (e) {
        var t = TRACKS.find(function (x) { return x.file === e.target.value; });
        if (t) d.load(t, d.playing);
      });
      var fi = $('.sx-file input', el);
      if (fi) fi.addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        if (d.objUrl) URL.revokeObjectURL(d.objUrl);
        d.objUrl = URL.createObjectURL(f);
        d.load({ id: 'file', name: f.name.replace(/\.[^.]+$/, ''), file: d.objUrl, bpm: null, local: true }, true);
      });
      var ld = d.load;
      d.load = function (track, autoplay) {
        var r = ld.call(d, track, autoplay);
        var s2 = $('.sx-deck-src', el); if (s2 && track && !track.local) s2.value = track.file;
        persist();
        return r;
      };
    });
  }

  function applyXfade() {
    var x = S.xfade, m = window.PRO8 && window.PRO8.mixer && window.PRO8.mixer();
    if (m) m.setXf(x);
    var r = $('#sx-xfade'); if (r && document.activeElement !== r) r.value = Math.round(x * 100);
  }

  /** Bot „sync b”: PRO8 SYNC on (tempo + beat phase follow the MASTER deck). */
  function syncDeck(id) {
    var me = S.decks[id], other = S.decks[id === 'A' ? 'B' : 'A'];
    if (!me || !other) return false;
    if (!me.bpm || !other.bpm) { if (me.track && !me.buffer) me.prepare(); if (other.track && !other.buffer) other.prepare(); toast('SYNC: brak BPM jednego z decków (analizuję…)'); return false; }
    var m = window.PRO8.mixer();
    if (!m.master || m.master === id) m.setMaster(other.id);
    me.setSync(true);
    toast('Deck ' + id + ' SYNC → ' + (me.effBpm() || 0).toFixed(1) + ' BPM');
    return true;
  }

  function fillTrackSelects() {
    $$('.sx-deck-src').forEach(function (sel) {
      var cur = sel.value;
      sel.innerHTML = TRACKS.map(function (t) {
        return '<option value="' + t.file.replace(/"/g, '&quot;') + '">' + t.name.replace(/</g, '&lt;') + '</option>';
      }).join('');
      if (cur) sel.value = cur;
    });
  }

  function loadPlaylist() {
    var src = Bot ? Bot.Sync.getJSON('/api/playlist') : fetch('/api/playlist', { cache: 'no-cache' }).then(function (r) { return r.json(); });
    return src.then(function (pl) {
      if (!pl) return;
      var all = [].concat(pl.driveTracks || [], pl.tracks || []);
      all.forEach(function (t) {
        if (!t || !t.file || /test-120bpm/.test(t.file)) return;
        if (!TRACKS.some(function (x) { return x.file === t.file; })) TRACKS.push({ id: t.id, name: t.name || t.file, file: t.file, bpm: t.bpm || null });
      });
      fillTrackSelects();
    }).catch(function () {});
  }

  function findTrack(q) {
    var n = norm(q);
    if (!n) return null;
    if (/^\d+$/.test(n)) return TRACKS[Number(n) - 1] || null;
    var best = null, bestScore = 0;
    TRACKS.forEach(function (t) {
      var name = norm(t.name), score = 0;
      if (name === n) score = 100;
      else if (name.indexOf(n) !== -1) score = 60 + n.length;
      else n.split(' ').forEach(function (tok) { if (tok.length > 1 && name.indexOf(tok) !== -1) score += tok.length * 3; });
      if (score > bestScore) { bestScore = score; best = t; }
    });
    return bestScore >= 6 ? best : null;
  }

  // ---------------------------------------------------------------- agent: ONE D Bot (js/bot-d.js)
  var Bot = window.BotD || null;
  var bot = null;
  var FALLBACK_HELP = 'D Bot (D Bot, tryb awaryjny): kali radio · stop · next preset · fullscreen · deck a <utwór>.';

  function addMsg(role, text, extra) {
    return window.D7Chat ? window.D7Chat.add(role, text, extra) : null;
  }

  /** Text + safe clickable links (no innerHTML). */
  function setMsgText(el, text) {
    var str = String(text == null ? '' : text), re = /(https?:\/\/[^\s<>"'„”)]+)/g, last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) el.appendChild(document.createTextNode(str.slice(last, m.index)));
      var a = document.createElement('a');
      a.href = m[1]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer';
      el.appendChild(a);
      last = m.index + m[1].length;
    }
    if (last < str.length) el.appendChild(document.createTextNode(str.slice(last)));
  }
  function openLink(url) {
    if (!/^https:\/\/(wa\.me|m\.me)\//.test(url)) return false;
    try { window.open(url, '_blank', 'noopener'); return true; } catch (_) { return false; }
  }
  function shareApp(url) {
    var text = 'D Bot — Kali radio + MilkDrop + Pro DJ decks + bot D Bot · Daniel Dydo · Kraków';
    try {
      if (navigator.share) { navigator.share({ title: 'D.bot', text: text, url: url }).catch(function () {}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).catch(function () {});
    } catch (_) {}
  }
  function botSay(text, opts) {
    addMsg('bot', text);
    if (Bot && !(opts && opts.noLog)) Bot.Memory.addChat('bot', text);
  }

  /** Minimal emergency layer if bot-d.js failed to load — START/radio/viz never depend on it. */
  function emergencyCommand(t) {
    var n = norm(t);
    if (/\bstop\b/.test(n)) { stopRadio(); ['A', 'B'].forEach(function (k) { S.decks[k] && S.decks[k].pause(); }); return 'Stop.'; }
    if (/\b(kali|radio)\b/.test(n)) { playRadio(KALI); return 'Kali radio ▶'; }
    if (/\b(full|fs)\b/.test(n)) { enterFs(); return 'Fullscreen ⛶'; }
    if (/\b(next|preset|losuj)\b/.test(n)) { randomPreset(2.2); return '✨ ' + (S.keys[S.idx] || ''); }
    var m = n.match(/deck ([ab]) (.+)/);
    if (m) { var tr = findTrack(m[2]); if (tr) { S.decks[m[1].toUpperCase()].load(tr, true); return '🎧 ' + tr.name; } }
    return FALLBACK_HELP;
  }

  var api = {
    audio: function () { try { ensureAudio(); } catch (_) {} return { ctx: S.ctx, vizIn: S.vizIn, analyser: S.analyser, lowIn: S.lowLp, master: S.master, vizOk: S.vizOk }; },
    snapshot: function () {
      return {
        radioPlaying: S.radioPlaying, radioWanted: S.radioWanted || S.kaliLocal, kaliLocal: S.kaliLocal, ytTitle: S.kaliLocal ? 'Kali (lokalny beat)' : S.ytTrack.title,
        bpm: S.bpm, beatSource: S.beatSource, detBpm: S.detBpm, vizOk: S.vizOk, preset: S.keys[S.idx], autoWander: S.autoWander,
        liveGen: S.liveGen, fs: S.fs, radioVol: S.radioVol, filter: S.filterVal, echo: S.echoOn, account: S.account,
        decks: ['A', 'B'].map(function (k) { var d = S.decks[k]; return d ? { id: k, name: d.track && d.track.name, playing: !d.audio.paused, bpm: d.effBpm() } : { id: k }; })
      };
    },
    ytList: YT_LIST,
    openLink: openLink, share: shareApp,
    openOpts: openOpts, optsList: optsList, setOptByName: setOptByName, setOpt: setOpt,
    kali: function () { playRadio(KALI); },
    playYt: function (t) { playRadio(t); },
    nextYt: function () { var nx = nextYt(S.ytTrack); playRadio(nx); return nx; },
    stopRadio: stopRadio,
    stopAll: function () { stopRadio(); ['A', 'B'].forEach(function (k) { S.decks[k] && S.decks[k].pause(); }); },
    enterFs: enterFs, exitFs: exitFs,
    presetRandom: function () { randomPreset(2.2); return S.keys[S.idx]; },
    presetFind: function (re) { var m = []; S.keys.forEach(function (k, i) { if (re.test(k)) m.push(i); }); if (!m.length) { randomPreset(2.2); return S.keys[S.idx]; } loadPreset(m[Math.floor(Math.random() * m.length)], 2.2); return S.keys[S.idx]; },
    presetPrev: function () { prevPreset(); return S.keys[S.idx]; },
    setAuto: function (on) { setAuto(on); },
    liveGen: function (on) { setLiveGen(on); },
    setBpm: function (v) { setBpm(v, { phase: true }); paintRadio(); persist(); return S.bpm; },
    setRadioVol: function (v) { setRadioVol(v); },
    deckLoad: function (id, t, play) { S.decks[id].load(t, play); },
    deckPlay: function (id) { S.decks[id].play(); return S.decks[id].track && S.decks[id].track.name; },
    deckPause: function (id) { S.decks[id].pause(); },
    deckVol: function (id, v) { S.decks[id].setVol(v); persist(); },
    pro8: function (n, deckId) { return window.PRO8 ? window.PRO8.command(n, deckId) : null; },
    openChat: function () { if (window.D7Chat) window.D7Chat.open(); },
    syncDeck: syncDeck,
    xfade: function (x) { S.xfade = x; applyXfade(); persist(); },
    setFilter: function (v) { setFilter(v); },
    setEcho: function (on) { setEcho(on); },
    tracks: function () { return TRACKS; },
    findTrack: findTrack,
    cacheOffline: cacheOffline,
    runText: function (t) { handleText(t); }
  };

  var chatQueue = Promise.resolve();
  function handleText(text, meta) {
    text = String(text || '').trim();
    if (!text) return;
    // Commands run synchronously (keeps the user gesture for fullscreen); replies are queued in order
    addMsg('user', text);
    if (Bot) Bot.Memory.addChat('user', text);
    var typing = addMsg('bot typing', '…');
    var r;
    try { r = bot ? bot.handle(text) : emergencyCommand(text); } catch (e) { console.warn('[SX] bot', e); r = 'Ups — komenda się wysypała, aplikacja działa dalej. Spróbuj „pomoc”.'; }
    var p = (r && typeof r.then === 'function') ? r : new Promise(function (res) { setTimeout(function () { res(r); }, 200); });
    chatQueue = chatQueue.then(function () { return p; }).then(function (reply) {
      if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
      botSay(reply || 'Nie złapałem — napisz „pomoc”.');
    }).catch(function () {
      if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
      botSay('Nie udało się — spróbuj jeszcze raz.', { noLog: true });
    });
    persist();
  }

  function paintNet() {
    if (window.D7Chat && window.D7Chat.paintNet) { try { window.D7Chat.paintNet(); } catch (_) {} }
    var l = $('#sx-net-label'), c = $('#sx-chip-net');
    if (!l || !Bot) return;
    var q = Bot.Sync.queue.length, on = Bot.Sync.online;
    l.textContent = (on ? 'ONLINE' : 'OFFLINE') + (q ? ' · kolejka ' + q : ' · sync ✓');
    if (c) {
      c.classList.toggle('on', on);
      c.classList.toggle('off', !on);
      c.title = (S.account ? (S.account.accountName || 'D Bot') + ' · ' + (S.account.statusLine || '') + '\n' : '') + (on ? 'Online — czat, pamięć i ustawienia synchronizują się z Mr D' : 'Offline — wszystko działa lokalnie; sync po powrocie sieci');
    }
  }

  var QUICK = [
    ['kali radio', '📻 Kali radio'], ['stop radio', '⏹ Stop radio'], ['następna wizualizacja', '✨ Next viz'], ['pełny ekran', '⛶ Fullscreen'],
    ['play deck a', '▶ Deck A'], ['play deck b', '▶ Deck B'], ['loop 4 a', '🔁 Loop 4 A'], ['sync b', '🔄 Sync B'],
    ['beat fx echo', '✨ Beat FX'], ['yt trance', 'YT trance'], ['offline', '📴 Offline'], ['status', '📊 Status'], ['opcje', '⚙ Opcje'], ['skróty', '⌨ Skróty'], ['pomoc', '? Pomoc']
  ];
  function initAgent() {
    if (window.D7Chat) window.D7Chat.mount({ handler: handleText, quick: QUICK });
    var ab = $('#sx-agent-btn');
    if (ab) ab.addEventListener('click', function (e) { e.stopPropagation(); if (window.D7Chat) window.D7Chat.toggle(); });
    if (Bot) {
      try {
        bot = Bot.createBot(api);
        if (window.D7Chat) window.D7Chat.setSub('DJ · piosenki · pady · pętle · aplikacje · boty · agenci · rozmowa · naprawa');
        Bot.Sync.on(paintNet);
      } catch (e) { console.warn('[SX] bot init', e); bot = null; }
    }
    if (window.D7Chat && S.opts.voiceReplies) window.D7Chat.setTts(true);
    botSay('Siema — tu D Bot 💚 główny bot · D77 Studio (super bot: 14 języków, porady DJ, MIDI/MC-707, szablony kodu, AI z Twoim kluczem w ⚙). Piszesz albo mówisz (🎤) — steruję Kali radiem, wizualizacją, pełnym ekranem i deckami PRO8 (hot cue, pętle, SYNC, BEAT FX), także offline. Spróbuj: „play deck A”, „loop 4 b”, „włącz radio”, „następna wizualizacja”, „pomoc”.', { noLog: true });
    paintNet();
  }

  function fetchAccount() {
    var p = Bot ? Bot.Sync.ping() : fetch('/api/account-status', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return null; });
    return p.then(function (st) {
      if (st) S.account = st;
      paintNet();
    });
  }

  // ---------------------------------------------------------------- state (persist + restore)
  var persistT = 0;
  function deckState(k) {
    var d = S.decks[k];
    if (!d) return null;
    return { file: d.track && !d.track.local ? d.track.file : null, vol: d.vol };
  }
  function persist(opts) {
    if (!Bot || !S.booted) return;
    clearTimeout(persistT);
    var snap = function () {
      return {
        v: VERSION, preset: S.keys[S.idx] || null, autoWander: S.autoWander, liveGen: S.liveGen, bpm: S.bpm,
        radioVol: S.radioVol, ytId: S.ytTrack.id, xfade: S.xfade, masterVol: S.masterVol,
        decks: { A: deckState('A'), B: deckState('B') }, opts: S.opts, at: new Date().toISOString()
      };
    };
    if (opts && opts.base) { Bot.Memory.saveBase(snap()); return; }
    persistT = setTimeout(function () { Bot.Memory.saveState(snap()); }, 700);
  }
  function restoreState(st) {
    if (!st) return;
    try {
      if (!S.optsSaved && st.opts && typeof st.opts === 'object') { // new device: take options from the synced state
        OPT_DEFS.forEach(function (d) { if (typeof st.opts[d.k] === 'boolean') S.opts[d.k] = st.opts[d.k]; });
        saveOpts();
      } else if (!S.optsSaved) {
        if (typeof st.autoWander === 'boolean') S.opts.autoWander = st.autoWander;
        if (typeof st.liveGen === 'boolean') S.opts.liveGen = st.liveGen;
      }
      setAuto(S.opts.autoWander);
      setLiveGen(S.opts.liveGen);
      applyFxOpt(); applyBubble(); paintOpts();
      if (st.bpm) setBpm(st.bpm);
      if (st.radioVol != null) setRadioVol(st.radioVol);
      if (st.xfade != null) { S.xfade = st.xfade; applyXfade(); }
      if (st.masterVol != null) { S.masterVol = st.masterVol; var mv = $('#sx-master'); if (mv) mv.value = Math.round(st.masterVol * 100); }
      if (st.preset && S.vizOk) { var pi = S.keys.indexOf(st.preset); if (pi >= 0) loadPreset(pi, 0); }
    } catch (e) { console.warn('[SX] restore', e); }
  }
  function restoreDecks(st) {
    ['A', 'B'].forEach(function (k) {
      var ds = st && st.decks && st.decks[k], d = S.decks[k];
      if (!d) return;
      var t = ds && ds.file ? TRACKS.find(function (x) { return x.file === ds.file; }) : null;
      if (!t) t = k === 'A' ? (findTrack('dd dj fly remix') || TRACKS[0]) : (findTrack('kali') || TRACKS[1]);
      if (t && !d.track) d.load(t, false);
      if (ds && ds.vol != null) d.setVol(ds.vol);
    });
  }

  // ---------------------------------------------------------------- offline media
  var MEDIA_CACHE = 'd7-dj-media-v2';
  function cacheOffline() {
    var list = TRACKS.filter(function (t) { return !t.local; });
    if (!('caches' in window)) return Promise.resolve({ ok: 0, total: list.length });
    return caches.open(MEDIA_CACHE).then(function (c) {
      var ok = 0;
      return list.reduce(function (p, t) {
        var url = new URL(t.file, location.href).href;
        return p.then(function () {
          return c.match(url).then(function (m) {
            if (m) { ok++; return; }
            if (navigator.onLine === false) return;
            return fetch(url, { cache: 'no-store' }).then(function (r) {
              if (r.ok && r.status === 200) { ok++; return c.put(url, r); }
            }).catch(function () {});
          });
        });
      }, Promise.resolve()).then(function () { return { ok: ok, total: list.length }; });
    }).catch(function () { return { ok: 0, total: list.length }; });
  }

  // ---------------------------------------------------------------- controls
  function setAuto(on) {
    S.autoWander = !!on;
    if (S.opts.autoWander !== S.autoWander) { S.opts.autoWander = S.autoWander; saveOpts(); paintOpts(); }
    var b = $('#sx-auto'); if (b) b.classList.toggle('on', S.autoWander);
    if (on) S.lastPresetAt = performance.now();
    persist();
  }
  function setLiveGen(on) {
    S.liveGen = !!on;
    if (S.opts.liveGen !== S.liveGen) { S.opts.liveGen = S.liveGen; saveOpts(); paintOpts(); }
    if (on) setAuto(true);
    var b = $('#sx-auto'); if (b) b.textContent = S.liveGen ? 'LIVE GEN' : 'AUTO';
    persist();
  }
  function setFilter(v) {
    S.filterVal = Math.max(0, Math.min(100, Number(v)));
    var r = $('#sx-filter'); if (r) r.value = S.filterVal;
    var f = S.fx && S.fx.filter;
    if (!f) return;
    var t = S.ctx.currentTime, x = S.filterVal;
    if (Math.abs(x - 50) < 2) { f.type = 'lowpass'; f.frequency.setTargetAtTime(20000, t, 0.05); }
    else if (x < 50) { f.type = 'lowpass'; f.frequency.setTargetAtTime(150 * Math.pow(20000 / 150, x / 50), t, 0.05); }
    else { f.type = 'highpass'; f.frequency.setTargetAtTime(20 * Math.pow(6000 / 20, (x - 50) / 50), t, 0.05); }
  }
  function setEcho(on) {
    S.echoOn = !!on;
    var b = $('#sx-echo'); if (b) b.classList.toggle('on', S.echoOn);
    if (!S.fx) return;
    var t = S.ctx.currentTime;
    S.fx.delay.delayTime.setTargetAtTime(Math.min(1.9, (60 / (S.bpm || 128)) * 0.75), t, 0.02);
    S.fx.wet.gain.setTargetAtTime(S.echoOn ? 0.42 : 0, t, 0.05);
  }
  function setRadioVol(v) {
    S.radioVol = v;
    try { if (S.yt && S.ytReady) { S.yt.setVolume(v); if (v > 0) S.yt.unMute(); } } catch (_) {}
    var r = $('#sx-radio-vol'); if (r) r.value = v;
    persist();
  }

  // ---------------------------------------------------------------- Opcje panel
  function setOpt(k, v, quiet) {
    if (!(k in S.opts)) return false;
    v = !!v;
    S.opts[k] = v;
    saveOpts();
    switch (k) {
      case 'autoWander': setAuto(v); break;
      case 'liveGen': setLiveGen(v); break;
      case 'fx': applyFxOpt(); break;
      case 'voiceReplies': if (window.D7Chat) window.D7Chat.setTts(v); break;
      case 'cloudSync': if (Bot) { Bot.Sync.enabled = v; if (v) Bot.Sync.flush(); } break;
      case 'wakeLock': if (v) { if (S.started) requestWake(); } else if (S.wakeLock) { try { S.wakeLock.release(); } catch (_) {} S.wakeLock = null; } break;
      case 'offlineCache': if (v && S.started && navigator.onLine !== false) cacheOffline(); break;
      case 'darkSkip': S.darkStrikes = 0; break;
      default: break;
    }
    paintOpts();
    persist();
    if (!quiet) toast((v ? '✅ ' : '⬜ ') + optLabel(k), 1400);
    return true;
  }
  function optLabel(k) { var d = OPT_DEFS.find(function (x) { return x.k === k; }); return d ? d.label : k; }
  function setOptByName(name, v) {
    var n = norm(name).replace(/[.!]+$/, '');
    var d = OPT_DEFS.find(function (x) { return x.k.toLowerCase() === n.replace(/\s+/g, '') || x.alias.split('|').some(function (a) { return a === n; }); })
      || OPT_DEFS.find(function (x) { return norm(x.label).indexOf(n) !== -1; });
    if (!d) return null;
    setOpt(d.k, v, true);
    return d.label;
  }
  function optsList() { return OPT_DEFS.map(function (d) { return { k: d.k, label: d.label, on: !!S.opts[d.k] }; }); }
  function applyFxOpt() {
    var box = $('.sx-fx');
    if (box) box.hidden = !S.opts.fx;
    if (!S.opts.fx) { if (S.filterVal !== 50) setFilter(50); if (S.echoOn) setEcho(false); }
  }
  var mqMobile = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;
  function applyBubble() { /* v43: D Bot is always the floating chat (js/d7-chat.js) */ }

  function openOpts(force) {
    var p = $('#sx-opts');
    if (!p) return;
    var show = force === true ? true : force === false ? false : p.hidden;
    p.hidden = !show;
    var b = $('#sx-opt-btn'); if (b) b.classList.toggle('on', show);
    if (show) { paintOpts(); poke(); }
  }
  function paintOpts() {
    var list = $('#sx-opts-list');
    if (!list) return;
    if (!list.children.length) {
      list.innerHTML = OPT_DEFS.map(function (d) {
        return '<label class="sx-opt"><input type="checkbox" data-opt="' + d.k + '"><span class="sx-sw" aria-hidden="true"></span><span class="sx-opt-l">' + d.label + '</span></label>';
      }).join('');
      $$('#sx-opts-list input').forEach(function (inp) {
        inp.addEventListener('change', function () { setOpt(inp.getAttribute('data-opt'), inp.checked); });
      });
    }
    $$('#sx-opts-list input').forEach(function (inp) { inp.checked = !!S.opts[inp.getAttribute('data-opt')]; });
    var info = $('#sx-opts-info');
    if (info) {
      var q = Bot ? Bot.Sync.queue.length : 0;
      info.textContent = 'D Bot · D77 Studio · APK v46 (web v' + VERSION + ') · ' + (navigator.onLine === false ? 'offline' : 'online') + (q ? ' · kolejka ' + q : '') +
        (navigator.serviceWorker && navigator.serviceWorker.controller ? ' · offline-ready' : '');
    }
  }
  function bindOpts() {
    var b = $('#sx-opt-btn'); if (b) b.addEventListener('click', function (e) { e.stopPropagation(); openOpts(); });
    var c = $('#sx-opts-close'); if (c) c.addEventListener('click', function () { openOpts(false); });
    var cache = $('#sx-opt-cache');
    if (cache) cache.addEventListener('click', function () {
      cache.disabled = true; cache.textContent = '💾 Zapisuję…';
      cacheOffline().then(function (r) { cache.disabled = false; cache.textContent = '💾 Utwory offline: ' + r.ok + '/' + r.total; paintOpts(); });
    });
    var clr = $('#sx-opt-clear');
    if (clr) clr.addEventListener('click', function () {
      if (Bot) { Bot.Memory.chat = []; try { localStorage.setItem('x7-chat', '[]'); } catch (_) {} }
      if (window.D7Chat) window.D7Chat.clear();
      botSay('Czat lokalny wyczyszczony (serwer nie jest ruszany).', { noLog: true });
    });
    var rs = $('#sx-opt-reset');
    if (rs) rs.addEventListener('click', function () {
      OPT_DEFS.forEach(function (d) { if (S.opts[d.k] !== d.def) setOpt(d.k, d.def, true); });
      toast('Opcje: ustawienia domyślne', 1500);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') openOpts(false); });
    document.addEventListener('click', function (e) {
      var p = $('#sx-opts');
      if (p && !p.hidden && !p.contains(e.target) && e.target.id !== 'sx-opt-btn') openOpts(false);
    });
    if (mqMobile) { var f = function () { applyBubble(); }; if (mqMobile.addEventListener) mqMobile.addEventListener('change', f); else if (mqMobile.addListener) mqMobile.addListener(f); }
  }

  function bindControls() {
    $('#sx-kali-btn').addEventListener('click', function () {
      if ((S.radioWanted && S.ytTrack.id === KALI.id) || S.kaliLocal) stopRadio(); else playRadio(KALI);
    });
    $('#sx-fs-btn').addEventListener('click', toggleFs);
    $('#sx-fs-btn2').addEventListener('click', toggleFs);
    $('#sx-fs-exit').addEventListener('click', function (e) { e.stopPropagation(); exitFs(); });
    $('#sx-prev').addEventListener('click', prevPreset);
    $('#sx-next').addEventListener('click', nextPreset);
    $('#sx-rnd').addEventListener('click', function () { randomPreset(1.8); });
    $('#sx-auto').addEventListener('click', function () { setAuto(!S.autoWander); });
    $('#sx-radio-play').addEventListener('click', function () { playRadio(S.ytTrack); });
    $('#sx-radio-stop').addEventListener('click', stopRadio);
    $('#sx-tap').addEventListener('click', tapTempo);
    $('#sx-radio-vol').addEventListener('input', function (e) { setRadioVol(Number(e.target.value)); });
    var src = $('#sx-radio-src');
    src.innerHTML = YT_LIST.map(function (t) { return '<option value="' + t.id + '">' + (t.genre === 'kali' ? '📻 ' : '') + t.title + '</option>'; }).join('');
    src.addEventListener('change', function () { var t = YT_LIST.find(function (x) { return x.id === src.value; }); if (t) playRadio(t); });
    $('#sx-xfade').addEventListener('input', function (e) { S.xfade = e.target.value / 100; applyXfade(); persist(); });
    var fr = $('#sx-filter'); if (fr) fr.addEventListener('input', function (e) { setFilter(e.target.value); });
    var eb = $('#sx-echo'); if (eb) eb.addEventListener('click', function () { setEcho(!S.echoOn); });
    $('#sx-master').addEventListener('input', function (e) {
      S.masterVol = e.target.value / 100;
      if (S.master) S.master.gain.setTargetAtTime(S.masterVol, S.ctx.currentTime, 0.03);
      persist();
    });
    window.addEventListener('keydown', function (e) {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFs(); }
      else if (e.key === 'Escape' && S.fs) exitFs();
      else if (e.key === 'ArrowRight') nextPreset();
      else if (e.key === 'ArrowLeft') prevPreset();
      else if (e.key === 'r' || e.key === 'R') randomPreset(1.8);
      else if (e.key === 'k' || e.key === 'K') $('#sx-kali-btn').click();
    });
  }

  // ---------------------------------------------------------------- START
  function start(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (S.started) return;
    S.started = true;
    // Everything below runs inside the user gesture (autoplay / fullscreen permissions)
    ensureAudio();
    resumeAudio();
    try { Object.keys(S.decks).forEach(function (k) { S.decks[k].connect(); }); } catch (_) {}
    setTimeout(function () { try { Object.keys(S.decks).forEach(function (k) { if (S.decks[k].track && !S.decks[k].buffer) S.decks[k].prepare(); }); } catch (_) {} }, 300);
    if (!S.viz) initViz();
    if (S.opts.kaliOnStart) playRadio(KALI); else paintRadio();
    if (Bot) { try { Bot.Remote.start(api, function (t) { botSay(t); }); } catch (err) { console.warn('[SX] remote', err); } }
    // Offline readiness: quietly store the playlist tracks on the device (skips already cached files)
    setTimeout(function () {
      if (!S.opts.offlineCache || navigator.onLine === false || (navigator.connection && navigator.connection.saveData)) return;
      cacheOffline().then(function (r) { console.info('[D7] offline tracks', r.ok + '/' + r.total); });
    }, 25000);
    if (MODE === 'kali') enterFs();
    var gate = $('#sx-gate');
    if (gate) gate.classList.add('gone');
    setTimeout(function () { if (gate) gate.hidden = true; }, 600);
    paintBeat();
    if (MODE === 'pro-dj') setTimeout(function () { var d = $('#sx-dock'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 400);
    requestWake();
    setTimeout(function () {
      if (!S.vizOk) botSay('Wizualizacja działa w trybie lekkim (WebGL niedostępny na tym urządzeniu) — wszystko inne działa.');
    }, 1500);
  }

  // Service worker ↔ page: the new SW asks every open page for its version and reloads stale ones (old v39/v40 tabs).
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        var d = e.data || {};
        if (d.type === 'd7-version?' && e.ports && e.ports[0]) {
          // test hook (only with the isolated test harness): pretend to be an old v40 tab once, to prove stale tabs get reloaded
          var stale = window.__D7_TEST__ && qs.get('d7stale') === '1' && !sessionStorage.getItem('d7stale-done');
          if (stale) sessionStorage.setItem('d7stale-done', '1');
          e.ports[0].postMessage({ type: 'd7-version', v: stale ? '40' : VERSION });
        }
        if (d.type === 'd7-reload' && String(d.v) !== VERSION) { toast('Nowa wersja D Bot — przeładowuję…', 2500); setTimeout(function () { location.reload(); }, 1200); }
      });
      if (navigator.serviceWorker.startMessages) navigator.serviceWorker.startMessages();
    }
  } catch (_) {}

  function boot() {
    bindControls();
    bindStageGestures();
    bindOpts();
    if (Bot) Bot.Sync.enabled = !!S.opts.cloudSync;
    setAuto(S.opts.autoWander);
    if (S.opts.liveGen) setLiveGen(true);
    applyFxOpt(); applyBubble(); paintOpts();
    mountDecks();
    fillTrackSelects();
    var restoreP = Bot ? Bot.Memory.restoreFromServer().catch(function () { return null; }) : Promise.resolve(null);
    initAgent();
    // Pre-start: live MilkDrop behind the gate (AudioContext may stay suspended until START)
    applySize();
    try { initViz(); } catch (err) { console.warn('[SX] pre-viz', err); }
    requestAnimationFrame(frame);
    var st0 = Bot && Bot.Memory.state;
    if (st0) restoreState(st0);
    Promise.all([loadPlaylist(), restoreP]).then(function (r) {
      var srv = r[1], st = Bot && Bot.Memory.state;
      if (!st0 && st) { restoreState(st); botSay('Przywróciłem ustawienia z serwera (Mr D sync).', { noLog: true }); }
      if (srv && srv.chat && srv.chat.length) {
        var log = $('#d7c-log'), first = log && log.firstChild;
        srv.chat.slice(-8).forEach(function (m) {
          var d = document.createElement('div');
          d.className = 'sx-msg d7c-msg old ' + (m.role === 'user' ? 'user' : 'bot');
          d.textContent = m.text;
          if (log) log.insertBefore(d, first);
        });
      }
      restoreDecks(st);
    }).catch(function (e) { console.warn('[SX] restore', e); restoreDecks(null); })
      .then(function () { S.booted = true; persist({ base: true }); });
    fetchAccount();
    setInterval(fetchAccount, 30000);
    initYt();
    window.addEventListener('online', function () {
      if (S.ytApiFailed) { S.ytApiFailed = false; initYt(); }
      fetchAccount();
      toast('Online — D Bot synchronizuje czat, pamięć i ustawienia…', 2500);
    });
    window.addEventListener('offline', function () {
      paintNet();
      toast('Offline — D Bot, decki, presety i wizualizacja działają lokalnie.', 3500);
    });
    if (Bot) {
      try { Bot.registerMesh(); } catch (_) {}
      setInterval(function () { Bot.Sync.flush(); }, 20000);
      window.addEventListener('pagehide', function () { try { Bot.Memory.pushState(); Bot.Sync.flush(); } catch (_) {} });
    }
    var gate = $('#sx-gate'), btn = $('#sx-start');
    var gs = $('#sx-gate-sub');
    if (gs && qs.get('auto') === '1') gs.textContent = 'Dotknij gdziekolwiek — start AUTO';
    btn.addEventListener('click', start);
    gate.addEventListener('click', start);
    gate.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') start(e); });
    paintRadio(); paintFs(); paintBeat();
    try {
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
          setInterval(function () { if (navigator.onLine !== false) reg.update().catch(function () {}); }, 20 * 60000);
        }).catch(function () {});
      }
    } catch (_) {}
    // expose a tiny API (debug / other pages)
    window.SpecialX = {
      version: VERSION, label: 'D Bot · D77 Studio 48', apkVersion: '55', pro8: function () { return window.PRO8; }, botName: 'D Bot', say: handleText, kali: function () { playRadio(KALI); }, stop: stopRadio, autoStart: function () { start(); }, started: function () { return S.started; }, resume: function () { resumeAudio(); },
      next: function () { return randomPreset(2); }, fullscreen: toggleFs, state: S, api: api, bot: function () { return Bot; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
