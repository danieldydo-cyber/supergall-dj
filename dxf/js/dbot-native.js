/*
 * D.bot v45 — native bridge glue (loaded right after the APK shim, before page scripts).
 *  • window.DBotNative: token-checked calls into the Android „D7Bot” bridge (auto-reply, live sync, Google, preview/share,
 *    MIDI, speech language lists). In a normal browser everything degrades to „not available”.
 *  • window.__d7Bot(ev): native → JS events, fanned out to listeners (DBotNative.on(type, fn)).
 *  • Web MIDI polyfill: navigator.requestMIDIAccess() backed by android.media.midi (USB MC-707) when the page has none.
 *  • Voice routing: native speech events go to D Bot's chat or to D Builder's chat (DBotNative.voiceTarget) and
 *    continuous conversation (listen → reply spoken → listen).
 * Classic script, no modules. Pure logic is unit-tested in test/dbot-unit.js (node, with a fake bridge).
 */
(function (global) {
  'use strict';
  var VERSION = '45';
  var listeners = {};
  function bridge() { try { return global.D7Bot && typeof global.D7Bot.version === 'function' ? global.D7Bot : null; } catch (_) { return null; } }
  function tok() { return String(global.__D7TOK || ''); }
  function has() { return !!bridge() && !!tok(); }
  function call(name) {
    var b = bridge(); if (!b || typeof b[name] !== 'function') return undefined;
    var args = [tok()].concat(Array.prototype.slice.call(arguments, 1));
    try { return b[name].apply(b, args); } catch (e) { console.warn('[DBotNative]', name, e); return undefined; }
  }
  function json(s, fb) { try { return s ? JSON.parse(s) : fb; } catch (_) { return fb; } }
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return function () { off(type, fn); }; }
  function off(type, fn) { var l = listeners[type] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  function fire(type, ev) { (listeners[type] || []).slice().forEach(function (f) { try { f(ev); } catch (e) { console.warn('[DBotNative] listener', type, e); } }); (listeners['*'] || []).slice().forEach(function (f) { try { f(ev); } catch (_) {} }); }

  global.__d7Bot = function (ev) {
    if (typeof ev === 'string') ev = json(ev, null);
    if (!ev || !ev.type) return;
    if (ev.type === 'midi') { MIDI._event(ev); fire('midi', ev); return; }
    fire(ev.type, ev);
  };

  // ------------------------------------------------------------------ Web MIDI polyfill (android.media.midi backend)
  function MiniTarget() { this._l = {}; }
  MiniTarget.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
  MiniTarget.prototype.removeEventListener = function (t, f) { var l = this._l[t] || []; var i = l.indexOf(f); if (i >= 0) l.splice(i, 1); };
  MiniTarget.prototype._emit = function (t, ev) { var h = this['on' + t]; if (typeof h === 'function') { try { h.call(this, ev); } catch (e) { console.warn(e); } } (this._l[t] || []).slice().forEach(function (f) { try { f(ev); } catch (e) { console.warn(e); } }); };

  function Port(info) {
    MiniTarget.call(this);
    this.id = info.id; this.name = info.name; this.manufacturer = info.manufacturer || ''; this.type = info.type; this.version = '1.0';
    this.state = 'connected'; this.connection = info.open ? 'open' : 'closed'; this._queue = [];
    var self = this, handler = null;
    if (this.type === 'input') {
      Object.defineProperty(this, 'onmidimessage', { configurable: true, enumerable: true, get: function () { return handler; }, set: function (f) { handler = f; if (f) self.open(); } });
    }
  }
  Port.prototype = Object.create(MiniTarget.prototype);
  Port.prototype.open = function () {
    var self = this;
    if (this.connection === 'open') return Promise.resolve(this);
    if (!this._opening) {
      this._opening = new Promise(function (res) { MIDI._pending[self.id] = function (ok) { self.connection = ok ? 'open' : 'closed'; self._opening = null; if (ok) self._flush(); res(self); }; });
      this.connection = 'pending';
      call('midiOpen', this.id);
    }
    return this._opening;
  };
  Port.prototype.close = function () { this.connection = 'closed'; return Promise.resolve(this); };
  Port.prototype.addEventListener = function (t, f) { MiniTarget.prototype.addEventListener.call(this, t, f); if (t === 'midimessage') this.open(); };
  Port.prototype.send = function (data, ts) {
    if (this.type !== 'output') throw new TypeError('not an output');
    var arr = Array.prototype.slice.call(data).map(function (x) { return x & 0xff; });
    var delay = ts && global.performance ? ts - global.performance.now() : 0;
    var self = this;
    var go = function () { if (self.connection === 'open') call('midiSend', self.id, JSON.stringify(arr)); else { self._queue.push(arr); self.open(); } };
    if (delay > 1) setTimeout(go, delay); else go();
  };
  Port.prototype.clear = function () { this._queue = []; };
  Port.prototype._flush = function () { var q = this._queue; this._queue = []; var self = this; q.forEach(function (a) { call('midiSend', self.id, JSON.stringify(a)); }); };

  function Access() { MiniTarget.call(this); this.inputs = new Map(); this.outputs = new Map(); this.sysexEnabled = false; this.__native = true; }
  Access.prototype = Object.create(MiniTarget.prototype);

  var MIDI = {
    access: null, _pending: {}, last: { clock: null, transport: null, error: null },
    available: function () { return has() && !!call('midiAvailable'); },
    ports: function () { return json(call('midiPorts'), []); },
    refresh: function () {
      var a = MIDI.access; if (!a) return;
      var seen = {};
      MIDI.ports().forEach(function (p) {
        seen[p.id] = 1;
        var map = p.type === 'input' ? a.inputs : a.outputs;
        if (!map.has(p.id)) { var port = new Port(p); map.set(p.id, port); a._emit('statechange', { port: port }); }
      });
      [a.inputs, a.outputs].forEach(function (map) {
        Array.from(map.keys()).forEach(function (id) { if (!seen[id]) { var port = map.get(id); port.state = 'disconnected'; port.connection = 'closed'; map.delete(id); a._emit('statechange', { port: port }); } });
      });
    },
    request: function () {
      if (!MIDI.available()) return Promise.reject(new Error('MIDI niedostępne (brak android.software.midi albo przeglądarka bez Web MIDI)'));
      if (!MIDI.access) { MIDI.access = new Access(); MIDI.refresh(); }
      return Promise.resolve(MIDI.access);
    },
    _event: function (ev) {
      var k = ev.kind;
      if (k === 'open') { var f = MIDI._pending[ev.id]; delete MIDI._pending[ev.id]; if (f) f(!!ev.ok); return; }
      if (k === 'state') { MIDI.refresh(); return; }
      if (k === 'error') { MIDI.last.error = ev.message; return; }
      if (k === 'clock') { MIDI.last.clock = ev; return; }
      if (k === 'transport') {
        MIDI.last.transport = ev;
        var b = { start: 0xFA, 'continue': 0xFB, stop: 0xFC }[ev.cmd];
        MIDI._deliver(ev.port, [b], null); return;
      }
      if (k === 'beat' && !ev.master) {
        // slave clock: native counts F8 and estimates BPM — legacy code gets one synthetic F8 per beat carrying the BPM
        MIDI._deliver(MIDI._clockInId || null, [0xF8], ev.bpm);
        return;
      }
      if (k === 'message') MIDI._deliver(ev.port, ev.data, null);
    },
    _deliver: function (portId, data, bpm) {
      var a = MIDI.access; if (!a) return;
      a.inputs.forEach(function (p) {
        if (portId && p.id !== portId) return;
        if (!portId && p.connection !== 'open') return;
        var e = { data: new Uint8Array(data), timeStamp: global.performance ? global.performance.now() : Date.now(), target: p, dbotBpm: bpm };
        p._emit('midimessage', e);
      });
    },
    // native 24-PPQN clock (high-priority thread) — used by the deck sync and by the patched legacy midi.js
    clockStart: function (outId, bpm, sendStart) { call('midiClockStart', outId, Number(bpm) || 120, !!sendStart); },
    clockBpm: function (bpm) { call('midiClockBpm', Number(bpm) || 120); },
    clockNudge: function (ms) { call('midiClockNudge', Number(ms) || 0); },
    clockStop: function (sendStop) { call('midiClockStop', !!sendStop); },
    slaveBpm: function () { return Number(call('midiSlaveBpm')) || 0; }
  };
  // In the APK the native backend always wins (Android WebView has no usable Web MIDI / no permission UI for it)
  if (has() && MIDI.available()) {
    try {
      if (navigator.requestMIDIAccess) navigator.__webRequestMIDIAccess = navigator.requestMIDIAccess.bind(navigator);
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, writable: true, value: function () { return MIDI.request(); } });
    } catch (_) { try { navigator.requestMIDIAccess = function () { return MIDI.request(); }; } catch (__) {} }
  }

  // ------------------------------------------------------------------ voice routing + continuous conversation
  var V = { target: 'dbot', convo: false, timer: 0, builderSink: null };
  function relisten(delay) {
    clearTimeout(V.timer);
    if (!V.convo) return;
    V.timer = setTimeout(function () {
      var C = global.D7Chat; if (!V.convo || !C || !C.mounted || C.listening) return;
      if (V.target === 'builder' && V.builderSink && V.builderSink.listen) V.builderSink.listen(); else if (C.listen) C.listen();
    }, delay == null ? 450 : delay);
  }
  function wrapVoice() {
    var orig = global.__d7Voice;
    if (!orig || orig.__dbot) return !!orig;
    var w = function (ev) {
      if (typeof ev === 'string') ev = json(ev, {});
      ev = ev || {};
      if (ev.type === 'langs' || ev.type === 'ttsinfo') { fire(ev.type, ev); return; }
      // v46 „Rozmowa na żywo” owns the microphone while it runs
      if (V.live && V.liveSink && /^(ready|partial|result|error|end|speechstart)$/.test(ev.type)) { V.liveSink.voice(ev); return; }
      if (ev.type === 'tts' && V.live && global.DBotTalk) { global.DBotTalk.live.onTts(ev); fire('tts', ev); return orig(ev); }
      if (ev.type === 'tts') {
        fire('tts', ev);
        if (ev.state === 'start') clearTimeout(V.timer);
        if (ev.state === 'done' || ev.state === 'error') relisten(450);
        return orig(ev);
      }
      if (V.target === 'builder' && V.builderSink && /^(ready|partial|result|error|end)$/.test(ev.type)) { V.builderSink.voice(ev); if (ev.type === 'result') relisten(14000); return; }
      var r = orig(ev);
      if (ev.type === 'result' && V.convo) relisten(14000); // safety: re-listen even if nothing is spoken
      if (ev.type === 'error' && V.convo && /no match|nic nie|no-speech|timeout|7|6/.test(String(ev.error || ev.message || ''))) relisten(900);
      return r;
    };
    w.__dbot = true;
    global.__d7Voice = w;
    return true;
  }
  var tries = 0;
  (function poll() { if (!wrapVoice() && ++tries < 120) setTimeout(poll, 250); })();

  global.DBotNative = {
    version: VERSION, has: has, call: call, json: json, on: on, off: off, fire: fire, MIDI: MIDI, voice: V, relisten: relisten, wrapVoice: wrapVoice,
    apk: function () { return has(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
