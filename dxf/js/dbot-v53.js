/* Super Bot D 53 — radio → visualizer bridge + self-check v53.
 * Internet radio (<audio>) is now routed into the same Web Audio graph as the decks: MilkDrop (butterchurn) + spectrum
 * analysers react to the real radio signal. Streams are opened with crossOrigin='anonymous' (all bundled stations send CORS);
 * if a stream refuses CORS (error) or the captured signal stays silent while the element plays, the station is reopened in a
 * plain (uncaptured) element so it stays audible and the visuals fall back to the BPM-driven pulse (never frozen). */
(function (global) {
  'use strict';
  var R53 = { mode: 'off', level: 0, silentMs: 0, src: null, el: null, an: null, buf: null, timer: 0, tests: [] };
  function SXA() { var X = global.SpecialX; return X && X.api && X.api.audio ? X.api.audio() : null; }
  function radio() { return global.DBotGenre && global.DBotGenre.radio; }
  function capture(el) {
    var A = SXA(); if (!A || !A.ctx) return false;
    try {
      if (!el.__src53) {
        el.__src53 = A.ctx.createMediaElementSource(el);
        var out = A.ctx.createGain(); out.gain.value = 1; el.__src53.connect(out); out.connect(A.ctx.destination); // audible
        el.__src53.connect(A.vizIn); if (A.analyser) el.__src53.connect(A.analyser);             // visuals + spectrum
        if (A.lowIn) el.__src53.connect(A.lowIn);
        R53.an = A.ctx.createAnalyser(); R53.an.fftSize = 512; el.__src53.connect(R53.an); R53.buf = new Uint8Array(R53.an.frequencyBinCount);
      }
      if (A.ctx.state !== 'running') A.ctx.resume().catch(function () {});
      R53.src = el.__src53; R53.mode = 'audio'; return true;
    } catch (e) { R53.err = String(e && e.message || e); return false; }
  }
  function plain(Rd) { // reopen the current station without CORS capture (audible, pulse visuals)
    var s = Rd.cur; if (!s) return; var old = Rd.el; try { old.pause(); } catch (_) {}
    var el = new Audio(); el.preload = 'none'; el.__plain53 = true;
    el.addEventListener('playing', function () { Rd.ok = true; Rd.fails = 0; });
    el.addEventListener('error', function () { R53.plainErr = el.error && el.error.code; R53.mode = 'off'; Rd.el = old; Rd.fail0('błąd strumienia'); });
    Rd.el = el; el.volume = Rd.vol; el.src = s.url + (s.url.indexOf('?') >= 0 ? '&' : '?') + 'nocors53=' + Date.now(); R53.mode = 'pulse'; var p = el.play(); if (p && p.catch) p.catch(function () {});
  }
  function hook() {
    var Rd = radio(); if (!Rd || Rd.__v53) return !!(Rd && Rd.__v53); Rd.__v53 = true;
    var play0 = Rd.play; Rd.fail0 = Rd.fail;
    Rd.play = function (id, why) {
      var s = (global.DBotGenre.stations.filter(function (x) { return x.id === id; })[0]);
      if (s && !s.yt) {
        if (!Rd.el || Rd.el.__plain53) { // fresh capturable element (an element captured once stays captured)
          var el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous';
          el.addEventListener('playing', function () { Rd.ok = true; Rd.fails = 0; capture(el); });
          el.addEventListener('error', function () { Rd.fail('błąd strumienia'); });
          Rd.el = el;
        }
        Rd.el.crossOrigin = 'anonymous'; R53.retried = false; R53.silentMs = 0;
      }
      var A = SXA(); if (A && A.ctx && A.ctx.state !== 'running') A.ctx.resume().catch(function () {});
      var r = play0.apply(Rd, arguments); if (!s || s.yt) R53.mode = 'pulse'; return r;
    };
    Rd.fail = function (why) {
      if (Rd.el && Rd.el.__plain53 && why !== 'timeout' && !(Rd.el.error)) return; // stale failure of the CORS element (play() rejection) after the plain retry
      if (Rd.cur && Rd.el && Rd.el.crossOrigin && !R53.retried) { R53.retried = true; R53.lastFail = why; plain(Rd); return; } // CORS refused → plain element
      R53.mode = 'off'; return Rd.fail0.apply(Rd, arguments);
    };
    var stop0 = Rd.stop; Rd.stop = function () { R53.mode = 'off'; return stop0.apply(Rd, arguments); };
    clearInterval(R53.timer);
    R53.timer = setInterval(function () { // silent-capture watchdog (opaque response → zeros)
      if (R53.mode !== 'audio' || !R53.an || !Rd.el || Rd.el.paused) return;
      R53.an.getByteFrequencyData(R53.buf); var s = 0; for (var i = 0; i < R53.buf.length; i++) s += R53.buf[i]; R53.level = s / R53.buf.length;
      R53.silentMs = R53.level < 0.5 && Rd.el.currentTime > 2 ? R53.silentMs + 500 : 0;
      if (R53.silentMs >= 6000 && !R53.retried) { R53.retried = true; R53.lastFail = 'cisza (CORS)'; plain(Rd); }
    }, 500);
    return true;
  }
  var iv = setInterval(function () { if (hook()) clearInterval(iv); }, 400); setTimeout(function () { clearInterval(iv); }, 30000);

  /** v53 chat: without a brain, build requests go straight to the routed builder (apple / android / desktop) instead of the
   *  generic agent mesh (which sent „apka na iphone” to Memory/Sync + Android). */
  function hookChat() {
    var S = global.D7Super; if (!S || S.__v53) return !!(S && S.__v53); S.__v53 = true; var h0 = S.handle;
    S.handle = function (text, meta) {
      try {
        var V = global.DBotV52, T = global.DBotTeam, C = global.D7Chat;
        if (V && T && T.offline && C && !(S.brainOn && S.brainOn())) {
          var bot = V.route(text);
          if (/^(android|apple|desktop)$/.test(bot) && /(zbuduj|zrob|zrób|napisz|stworz|stwórz|\bapk|aplikac|program|\bapka|\bapk[eę])/i.test(text) && T.offline[bot]) {
            var o = T.offline[bot](text);
            if (o && o.text) { C.add('user', text); C.add('bot', o.text); V.mem.add(bot, 'build', String(text).slice(0, 120)); return true; }
          }
        }
      } catch (_) {}
      return h0.apply(this, arguments);
    };
    return true;
  }
  var iv2 = setInterval(function () { if (hookChat()) clearInterval(iv2); }, 400); setTimeout(function () { clearInterval(iv2); }, 30000);
  global.DBotV53 = { version: '55', radioViz: R53, hook: hook, level: function () { return R53.level; } };
})(window);
