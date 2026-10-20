/*
 * D Bot · D77 Studio 48 — js/dbot-conductor.js
 * 🎼 One DJ conductor for the whole app:
 *   • Autostart: FULL AUTO survives restarts and really starts playback on launch (START gate skipped in FULL AUTO, audio unlocked;
 *     the APK WebView has mediaPlaybackRequiresUserGesture=false, the Mac app autoplay-policy=no-user-gesture-required).
 *     Kali radio first (local Kali beat on deck A when YouTube is unavailable), then Auto Mix keeps the decks playing.
 *   • Agent sync: Auto Mix (DJ conductor) owns the transport; other agents/modules propose via the shared bus — proposals that
 *     would collide with a running transition are queued to the next phrase. User commands always win (Auto Mix yields).
 *   • Sync mixing: phrase-aligned transitions (16/32 beats), incoming track cued on its first downbeat, EQ bass swap on a bar,
 *     tempo ramp inside the BPM range (default 79–127, half/double-time folding).
 *   • Auto-improvement: learns from skips, 👍/👎 and how long each mix played → transition length, FX, track order;
 *     D Doctor applies safe, logged, reversible tweaks.
 * window.DBotConductor = { state, propose, kick, chat, learn, ... }
 */
(function (global) {
  'use strict';
  var VERSION = '48';
  function St() { return global.DBotState; }
  function sget(p, fb) { var s = St(); return s ? s.get(p, fb) : fb; }
  function sset(p, v) { var s = St(); return s ? s.set(p, v) : v; }
  function now() { return Date.now(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function P8() { var p = global.PRO8; return p && p.ready && p.decks && p.decks.A ? p : null; }
  function DJ() { return global.DBotDJ; }
  function AutoMix() { var d = DJ(); return d && d.auto; }
  function SX() { return global.SpecialX; }
  function STU() { return global.DBotStudio; }
  function RG() { return global.DBotRange; }
  function FA() { return global.DBotFullAuto; }
  function mixer() { var p = P8(); return p && p.mixer && p.mixer(); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^\w\s#/+-]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function bus(from, kind, text) { try { if (global.DBotBus) global.DBotBus.post(from, kind, text); } catch (_) {} }
  function chatSay(t) { var C = global.D7Chat; if (C && C.add) C.add('bot', t); }
  function snap() { var X = SX(); try { return X && X.api && X.api.snapshot ? X.api.snapshot() : null; } catch (_) { return null; } }
  function decksPlaying() { var p = P8(); return !!(p && (p.decks.A.playing || p.decks.B.playing)); }
  function streamOn() { var R = global.DBotRadio; return !!(R && R.playing && R.playing()); }
  function radioOn() { var s = snap(); return !!(s && (s.radioPlaying || s.kaliLocal)) || streamOn(); }
  function radioYt() { var s = snap(); return !!(s && s.radioWanted && !s.kaliLocal); }
  function tid(t) { return t && (t.id || t.name) || ''; }
  var subs = [];
  function fire(ev, d) { subs.forEach(function (f) { try { f(ev, d); } catch (_) {} }); }

  // ================================================================== conductor state + log
  var C = {
    version: VERSION, owner: 'Auto Mix (DJ Mixer)', phase: 'idle', log: [], queue: [], deferred: 0, executed: 0,
    radioSince: 0, userHoldUntil: 0, yielded: null, boot: { at: 0, steps: [] }, lastPlayAt: 0, silentSince: 0
  };
  function log(t) { var e = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + t; C.log.push(e); if (C.log.length > 80) C.log.shift(); fire('log', e); }
  C.opts = function () { return Object.assign({ kaliAuto: true, radioMin: 2, learn: true, phrase: 16, decksAuto: false }, sget('conductor.opts', {})); };
  C.setOpt = function (k, v) { var o = sget('conductor.opts', {}); o[k] = v; sset('conductor.opts', o); fire('opts', o); return v; };
  C.held = function () { var F = FA(); return !!(F && F.held); };
  C.autoOn = function () { var F = FA(); return !!(F && F.on); };
  /** Transport is busy while Auto Mix crossfades — proposals wait for the next phrase. */
  C.busy = function () { var A = AutoMix(); return !!(A && A.on && A.phase === 'mix'); };

  /** Agents / modules propose a transport action; the conductor runs it now or after the running transition. */
  C.propose = function (agent, action, run, opts) {
    opts = opts || {};
    if (C.busy() && !opts.now) {
      C.queue.push({ agent: agent, action: action, run: run, at: now() }); C.deferred++;
      bus(agent, 'propose', action + ' → po przejściu (dyrygent: ' + C.owner + ')'); log('⏳ ' + agent + ': ' + action + ' (czeka na koniec przejścia)');
      return '⏳ ' + agent + ': „' + action + '” — wykonam po bieżącym przejściu (jeden dyrygent: Auto Mix).';
    }
    var r; try { r = run(); } catch (e) { r = '⚠ ' + e.message; }
    C.executed++; bus(agent, 'decision', action); log('✔ ' + agent + ': ' + action);
    return r;
  };
  C.flush = function () {
    var q = C.queue.splice(0); q.forEach(function (x) { try { var r = x.run(); C.executed++; log('▶ ' + x.agent + ': ' + x.action + ' (po przejściu)'); if (r && typeof r === 'string' && x.say !== false) chatSay(r); } catch (e) { log('✖ ' + x.action + ': ' + e.message); } });
    return q.length;
  };

  // ================================================================== learning (auto-improvement)
  var L = {
    data: function () { var d = sget('learn', null); if (!d || typeof d !== 'object') d = {}; d.tracks = d.tracks || {}; d.arms = d.arms || {}; d.mixes = d.mixes || []; d.tweaks = d.tweaks || []; return d; },
    save: function (d) { sset('learn', d); fire('learn', d); },
    arm: function (kind, val) { var d = L.data(), k = kind + ':' + val; return d.arms[k] || { n: 0, s: 0 }; },
    reward: function (kind, val, r) { var d = L.data(), k = kind + ':' + val, a = d.arms[k] || { n: 0, s: 0 }; a.n++; a.s += r; d.arms[k] = a; L.save(d); },
    mean: function (kind, val) { var a = L.arm(kind, val); return a.n ? a.s / a.n : 0; },
    /** epsilon-greedy over the options (explores 15 % of the time) */
    choose: function (kind, options, eps) {
      if (!C.opts().learn) return options[0];
      if (Math.random() < (eps == null ? 0.15 : eps)) return options[Math.floor(Math.random() * options.length)];
      var best = options[0], bs = -Infinity; options.forEach(function (o, i) { var m = L.mean(kind, o) - i * 1e-3; if (m > bs) { bs = m; best = o; } }); return best;
    },
    track: function (id) { var d = L.data(); return d.tracks[id] || { plays: 0, skips: 0, up: 0, down: 0, sec: 0 }; },
    trackScore: function (id) { var t = L.track(id); return (t.up - t.down * 1.5 - t.skips * 1.2 + Math.min(3, t.sec / 240)) / (1 + t.plays * 0.15); },
    bumpTrack: function (id, f) { if (!id) return; var d = L.data(), t = d.tracks[id] || { plays: 0, skips: 0, up: 0, down: 0, sec: 0 }; f(t); d.tracks[id] = t; L.save(d); },
    mixStart: function (m) { var d = L.data(); m.at = now(); d.mixes.push(m); if (d.mixes.length > 60) d.mixes.shift(); L.save(d); L.cur = m; },
    /** outcome of the last mix: r in −1…+1 */
    judge: function (why, r) {
      var m = L.cur; if (!m || m.judged) return false; m.judged = why; m.r = r;
      L.reward('bars', m.bars, r); L.reward('fx', m.fx, r); L.reward('phrase', m.phrase, r);
      var d = L.data(); var x = d.mixes.filter(function (y) { return y.at === m.at; })[0]; if (x) { x.judged = why; x.r = r; } L.save(d);
      log('🧠 nauka: mix ' + m.from + ' → ' + m.to + ' ' + (r >= 0 ? '+' : '') + r.toFixed(2) + ' (' + why + ')');
      bus('D Bot · nauka', 'learn', 'mix ' + (r >= 0 ? 'dobry' : 'słaby') + ' (' + why + ')');
      return true;
    },
    feedback: function (up, src) {
      var A = AutoMix(), p = P8(), d = p && A && A.on ? p.decks[A.air] : null, id = d && tid(d.track);
      if (id) L.bumpTrack(id, function (t) { if (up) t.up++; else t.down++; });
      if (L.cur && now() - L.cur.at < 4 * 60000) L.judge(src || (up ? '👍' : '👎'), up ? 1 : -1);
      return id;
    },
    skip: function (src) {
      var A = AutoMix(), p = P8(), d = p && A ? p.decks[A.air] : null, id = d && tid(d.track);
      if (id) L.bumpTrack(id, function (t) { t.skips++; });
      if (L.cur && now() - L.cur.at < 90000) L.judge('skip (' + (src || 'user') + ')', -1);
      return id;
    },
    /** D Doctor: safe tweaks (bounded, logged, reversible) */
    tune: function (why) {
      if (!C.opts().learn) return [];
      var A = AutoMix(); if (!A) return [];
      var out = [], d = L.data();
      function tweak(key, from, to, reason) { if (from === to) return; var t = { id: 'tw' + now() + out.length, at: new Date().toISOString(), key: key, from: from, to: to, why: reason, reverted: false }; A.opts[key] = to; d.tweaks.push(t); out.push(t); }
      var b8 = L.arm('bars', 8), b16 = L.arm('bars', 16), b4 = L.arm('bars', 4);
      var cand = [[4, b4], [8, b8], [16, b16]].filter(function (x) { return x[1].n >= 3; }).sort(function (x, y) { return y[1].s / y[1].n - x[1].s / x[1].n; });
      if (cand.length && cand[0][0] !== A.opts.bars && (cand[0][1].s / cand[0][1].n) - L.mean('bars', A.opts.bars) > 0.15) tweak('bars', A.opts.bars, cand[0][0], 'najlepsze przejścia: ' + cand[0][0] + ' taktów');
      var fxOff = L.arm('fx', 'none'), fxOn = ['echo', 'reverb', 'flanger'].map(function (f) { return L.arm('fx', f); }).reduce(function (a, x) { return { n: a.n + x.n, s: a.s + x.s }; }, { n: 0, s: 0 });
      if (fxOff.n >= 3 && fxOn.n >= 3) { var want = fxOff.s / fxOff.n > fxOn.s / fxOn.n + 0.2 ? false : fxOn.s / fxOn.n > fxOff.s / fxOff.n + 0.2 ? true : A.opts.fx; if (want !== A.opts.fx) tweak('fx', A.opts.fx, want, want ? 'FX w przejściach oceniane lepiej' : 'czyste przejścia oceniane lepiej'); }
      var recent = d.mixes.slice(-8).filter(function (m) { return m.judged; }), skips = recent.filter(function (m) { return /skip/.test(m.judged); }).length;
      if (recent.length >= 4 && skips / recent.length >= 0.5 && A.opts.playBars > 32) tweak('playBars', A.opts.playBars, Math.max(32, A.opts.playBars - 16), 'dużo pominięć → krótsze granie utworu');
      if (recent.length >= 4 && !skips && A.opts.playBars < 128 && recent.every(function (m) { return m.r > 0; })) tweak('playBars', A.opts.playBars, Math.min(128, A.opts.playBars + 16), 'miksy się podobają → dłużej każdy utwór');
      if (out.length) { L.save(d); if (DJ().saveOpts) DJ().saveOpts(); out.forEach(function (t) { log('🩺 D Doctor tweak: ' + t.key + ' ' + t.from + ' → ' + t.to + ' (' + t.why + ')'); try { global.DBotRepairs.add('learn', 'tweak ' + t.key + ' ' + t.from + ' → ' + t.to + ' — ' + t.why + ' (↶ cofnij w Opcje)'); } catch (_) {} }); }
      return out;
    },
    revert: function (id) {
      var d = L.data(), t = d.tweaks.filter(function (x) { return x.id === id; })[0], A = AutoMix(); if (!t || t.reverted || !A) return false;
      A.opts[t.key] = t.from; t.reverted = true; t.revertedAt = new Date().toISOString(); L.save(d); if (DJ().saveOpts) DJ().saveOpts();
      log('↶ cofnięto tweak ' + t.key + ' → ' + t.from); try { global.DBotRepairs.add('learn', 'cofnięto tweak ' + t.key + ' → ' + t.from); } catch (_) {}
      return true;
    },
    reset: function () { sset('learn', {}); fire('learn', {}); return true; }
  };
  C.learn = L;

  // ================================================================== mixing (phrase-aligned, bass swap, tempo ramp in range)
  function beatsToMs(beats, d) { var spb = d && d.bpm ? d.spb() / d.baseRate() : 60 / ((STU() && STU().clock.bpm) || 120); return beats * spb * 1000; }
  function msToPhrase(d, beats) { if (!d || !d.bpm || !d.buffer) return 0; var b = d.beatAt(d.pos()), nxt = Math.ceil((b + 0.02) / beats) * beats; return Math.max(0, (nxt - b) * (d.spb() / d.baseRate()) * 1000); }
  function rangeTarget(bpm) { var R = RG(); return R && bpm ? R.fold(bpm) : bpm; }
  function patchDoSync() {
    var p = P8(); if (!p || p.__v48sync) return !!(p && p.__v48sync);
    var D = Object.getPrototypeOf(p.decks.A); var orig = D.doSync; p.__v48sync = true;
    /** v48: half/double-time aware SYNC — a 174 track follows an 87 master at 174 (not slowed to 87). */
    D.doSync = function (phase) {
      var m = p.mixer && p.mixer(), md = m && m.master && p.decks[m.master], R = RG();
      if (!R || !md || md === this || !md.bpm || !this.bpm) return orig.call(this, phase);
      var tgt = R.match(this.bpm, md.effBpm()), ratio = Math.round(tgt / md.effBpm() * 4) / 4;
      if (this.freeTempo || Math.abs(tgt / this.bpm - 1) > 0.10) { this.emit(); return false; } // too far → no ±37 % pitching; conductor mixes echo-out
      if (Math.abs(ratio - 1) < 0.01) return orig.call(this, phase);
      var pct = (tgt / this.bpm - 1) * 100, i = p.RANGES.indexOf(this.range);
      while (i < p.RANGES.length - 1 && Math.abs(pct) > p.RANGES[i]) i++;
      this.range = p.RANGES[i]; this.tempo = clamp(pct / this.range, -1, 1);
      if (this.playing) this.apply(false);
      if (phase && this.playing && md.playing && this.buffer && md.buffer && !this.loop.active) {
        var a = this.beatAt(this.pos()) / ratio, b = md.beatAt(md.pos()), df = (a - Math.floor(a)) - (b - Math.floor(b));
        if (df > 0.5) df -= 1; if (df < -0.5) df += 1;
        if (Math.abs(df) > 0.01) this.seek(this.pos() - df * ratio * this.spb());
      }
      this.emit(); return true;
    };
    return true;
  }

  function patchAutoMix() {
    var A = AutoMix(); if (!A || A.__v48) return !!(A && A.__v48);
    A.__v48 = true;
    A.opts.phrase = A.opts.phrase || 16; if (A.opts.bars < 4) A.opts.bars = 8; if (!(A.opts.playBars > 0)) A.opts.playBars = 64;
    var origStart = A.start, origStop = A.stop;
    /** track order: BPM range fit + learned score + variety; conductor queue first */
    A.pickNext = function (cur) {
      if (C.nextQ && C.nextQ.length) return C.nextQ.shift();
      var X = SX(), list = []; try { list = (X && X.api && X.api.tracks ? X.api.tracks() : []) || []; } catch (_) {}
      if (!list.length) try { list = global.DBotDJ.tracks ? global.DBotDJ.tracks() : []; } catch (_) {}
      list = list.filter(function (t) { return t && t.file; }); if (!list.length) return null;
      var R = RG(), clk = (STU() && STU().clock.bpm) || 110, recent = A.history.slice(-Math.min(6, list.length - 1)), curId = cur && tid(cur.track);
      var scored = list.map(function (t) {
        var id = tid(t), s = 0, b = t.bpm;
        if (b && R) { var inf = R.info(b); s -= Math.abs(inf.pct) / 2; s -= Math.abs(R.need(b, clk)) / 3; } else s -= 1.5; // tracks that beat-match the master without heavy pitching first
        s += L.trackScore(id) * 1.5;
        if (recent.indexOf(id) >= 0) s -= 6; if (id === curId) s -= 20;
        s += (Math.random() - 0.5) * 2.2;
        return { t: t, s: s };
      }).sort(function (x, y) { return y.s - x.s; });
      return scored[0].t;
    };
    A.start = function () {
      var r = origStart.apply(A, arguments);
      clearInterval(A.timer); A.timer = setInterval(A.tick, 400);
      C.lastPlayAt = now(); return r;
    };
    A.stop = function (quiet) { clearTimeout(A.phraseT); return origStop.apply(A, arguments); };
    A.tick = function () {
      if (!A.on || A.phase !== 'play') return;
      if (C.userHoldUntil > now() || C.yielded) return; // user paused / studio player has the floor
      var p = P8(); if (!p) return;
      var air = p.decks[A.air]; if (!air || !air.buffer) { if (air && air.track && !air.loading) air.prepare(); return; }
      if (!air.playing) { air.play(); log('▶ Auto Mix: deck ' + air.id + ' gra dalej'); return; }
      C.lastPlayAt = now();
      var spb = air.spb() / air.baseRate(), bars = A.opts.bars || 8, mixSec = bars * 4 * spb;
      var left = (air.duration - air.pos()) / air.baseRate(), played = (now() - A.startedAt) / 1000;
      var limit = A.opts.playBars > 0 ? A.opts.playBars * 4 * spb : Infinity;
      var must = left <= mixSec + 2 * spb, lead = air.duration > 150 ? 34 : 18;
      if (!must && played < Math.min(45, air.duration * 0.45)) return; // short tracks still get played before the next mix
      if (must || left <= mixSec + lead * spb || played >= limit) A.transition();
    };
    // v48 fix (beat alignment root cause): while a mix is scheduled the incoming deck is LOCKED — Auto.prep / D Song / agents
    // used to reload it during the phrase wait, so the aligned grid belonged to another track (bpm unknown → mis-detected 105.77 vs 120 → drift)
    if (!A.__v48prep) { A.__v48prep = true; var prep0 = A.prep; A.prep = function () { if (A.pending) return; return prep0.apply(this, arguments); }; }
    ['A', 'B'].forEach(function (k) {
      var d = P8() && P8().decks[k]; if (!d || d.__v48load) return; d.__v48load = true; var l0 = d.load;
      d.load = function (t) {
        var A2 = AutoMix(), p = P8();
        if (A2 && A2.on && A2.pending && p && p.decks[A2.air] && p.decks[A2.air].other() === d && !d.playing && t && t !== d.track) { C.nextQ = C.nextQ || []; C.nextQ.unshift(t); log('⏳ deck ' + d.id + ' zablokowany do przejścia — „' + (t.name || t.id) + '” w kolejce'); return Promise.resolve(d); }
        if (t && !t.bpm) { try { var lib = global.SpecialX && global.SpecialX.api && global.SpecialX.api.tracks ? global.SpecialX.api.tracks() : []; for (var i = 0; i < lib.length; i++) if (lib[i].bpm && ((t.id && lib[i].id === t.id) || (t.file && lib[i].file === t.file))) { t.bpm = lib[i].bpm; break; } } catch (_) {} } // known BPM → the grid uses it instead of guessing
        return l0.apply(this, arguments);
      };
    });
    A.transition = function () {
      var p = P8(), air = p.decks[A.air], inc = air.other(), m = mixer();
      if (A.pending) return;
      if (!inc.track) { A.prep(); return; }
      if (!inc.buffer) { if (!inc.loading) inc.prepare(); return; }
      var spb = air.spb() / air.baseRate(), left = (air.duration - air.pos()) / air.baseRate();
      // transition length (learned) that still fits before the end of the track
      var bars = L.choose('bars', [A.opts.bars || 8, 8, 16, 4].filter(function (v, i, a) { return a.indexOf(v) === i; }));
      if (A.opts.fly) bars = 8; // Play Fly: long 32-beat blends
      while (bars > 4 && bars * 4 * spb + 4 * spb > left) bars /= 2;
      var phrase = left > (bars * 4 + 32) * spb + 2 ? 32 : left > (bars * 4 + 16) * spb + 1 ? 16 : 4;
      var fx = A.opts.fly ? 'filter' : A.opts.fx ? L.choose('fx', ['echo', 'reverb', 'flanger', 'filter', 'none']) : 'none'; // 'filter' = subtle colour-filter blend (no beat FX)
      var need = RG() && inc.bpm && air.effBpm() ? RG().need(inc.bpm, air.effBpm()) : 0, mode = Math.abs(need) <= 8 ? 'sync' : 'echo-out';
      if (mode === 'echo-out') { bars = Math.min(bars, 4); fx = 'echo'; }
      A.pending = true; A.phase = 'mix';
      // incoming: cue on its first downbeat (phrase start), sync to master (half/double-time aware), bass killed
      inc.pause(true); var cue = inc.firstBeat || 0; if (inc.cuePoint && inc.cuePoint > cue) cue = inc.firstBeat + Math.round((inc.cuePoint - inc.firstBeat) / (4 * inc.spb())) * 4 * inc.spb(); inc.seek(Math.max(0, cue));
      if (m) { m.setMaster(air.id); m.setFader(inc.id, Math.max(0.7, inc.vol || 0.85)); if (A.opts.bassSwap) m.setKnob(inc.id, 'low', -1); }
      var from0 = air.effBpm() || 0, R = RG(), pinned = R && R.pinned(), target = pinned ? from0 : rangeTarget(inc.bpm) || from0;
      if (mode === 'sync') { inc.freeTempo = false; inc.setSync(true); }
      else { inc.setSync(false); inc.freeTempo = true; var nat = R ? R.match(inc.bpm, R.fold(inc.bpm)) : inc.bpm; inc.setTempoPct((nat / inc.bpm - 1) * 100); target = 0; } // too far apart: incoming keeps its own tempo (in range), echo-out on the outgoing
      if (!pinned && from0 && target) target = clamp(target, from0 * 0.94, from0 * 1.06); // tempo ramp ≤ 6 % per transition
      if (R && target) target = clamp(target, R.get().min, R.get().max);
      var mix = { mode: mode, need: Math.round(need * 10) / 10, from: tid(air.track), to: tid(inc.track), bars: bars, fx: fx, phrase: phrase, bpmFrom: Math.round(from0 * 10) / 10, bpmTo: Math.round((target || (R && inc.bpm ? R.fold(inc.bpm) : 0)) * 10) / 10 };
      var wait = msToPhrase(air, phrase), targetBeat = Math.ceil((air.beatAt(air.pos()) + 0.02) / phrase) * phrase, cueBeat = Math.round(inc.beatAt(Math.max(0, cue))); // align beat GRIDS (cue may sit slightly off the grid)
      A.say('🎚 Przejście ' + air.id + ' → ' + inc.id + ' na granicy frazy (' + phrase + ' beatów, za ' + (wait / 1000).toFixed(1) + ' s) · ' + bars + ' taktów · FX ' + fx + (target && Math.abs(target - from0) > 0.05 ? ' · tempo ' + from0.toFixed(1) + ' → ' + target.toFixed(1) : '') + ' · ' + (inc.track && inc.track.name));
      log('🎼 przejście ' + mix.from + ' → ' + mix.to + ' (fraza ' + phrase + ', ' + bars + ' t., FX ' + fx + ')');
      clearTimeout(A.phraseT); var cuedTrack = inc.track, cuedBpm = inc.bpm;
      A.phraseT = setTimeout(function () {
        if (!A.on) { A.pending = false; return; }
        if (inc.track !== cuedTrack || !inc.buffer || inc.bpm !== cuedBpm) { A.pending = false; A.phase = 'play'; log('↺ przejście przełożone — deck ' + inc.id + ' zmienił utwór/siatkę przed startem'); setTimeout(function () { try { A.transition(); } catch (_) {} }, 400); return; } // v48 fix: never start an incoming deck whose grid we did not align
        // timers can fire late (busy main thread) → start the incoming deck that much further in, so its phrase still lands on the master's phrase
        var ratio = inc.bpm && air.effBpm() ? Math.max(0.25, Math.round((RG() ? RG().match(inc.bpm, air.effBpm()) : air.effBpm()) / air.effBpm() * 4) / 4) : 1;
        var late = air.beatAt(air.pos()) - targetBeat; if (late > 0.02 && late < phrase) inc.seek(Math.max(0, cue) + late * ratio * inc.spb());
        inc.play(); // SYNC → tempo + beat phase locked to the master, starts on the phrase boundary
        function errNow() { return (air.beatAt(air.pos()) - targetBeat) - (inc.beatAt(inc.pos()) - cueBeat) / ratio; }
        mix.late = Math.round(late * 1000) / 1000;
        if (global.__D77_TRACE) { mix.trace = []; var tn = 0, ti = setInterval(function () { try { var P = P8(), mm = P.mixer && P.mixer(); mix.trace.push([tn * 100, Math.round(errNow() * 1000) / 1000, mm && mm.master, inc.phaseDiff && Math.round(inc.phaseDiff() * 1000) / 1000, Math.round(inc.rate * 1e4) / 1e4, Math.round(air.rate * 1e4) / 1e4, inc.syncOn, Math.round(air.beatAt(air.pos()) * 1000) / 1000, Math.round(inc.beatAt(inc.pos()) * 1000) / 1000, air.bpm, inc.bpm, air.effBpm(), inc.effBpm(), air.loop.active, inc.loop.active, Math.round(air.pos()*1000)/1000, Math.round(inc.pos()*1000)/1000, air.firstBeat, inc.firstBeat]); } catch (_) {} if (++tn > 30) clearInterval(ti); }, 100); mix.tb = targetBeat; mix.cb = cueBeat; mix.ratio = ratio; }
        if (mode === 'sync') setTimeout(function () { try { var e = errNow(); if (Math.abs(e) > 0.03 && Math.abs(e) < phrase) { inc.seek(inc.pos() + e * ratio * inc.spb()); mix.fixed = Math.round(e * 100) / 100; } setTimeout(function () { try { inc.doSync(false); var e2 = errNow(); if (Math.abs(e2) > 0.03 && Math.abs(e2) < phrase) { inc.seek(inc.pos() + e2 * ratio * inc.spb()); mix.fixed2 = Math.round(e2 * 100) / 100; setTimeout(function () { try { inc.doSync(false); mix.alignErr = Math.round(errNow() * 1000) / 1000; } catch (_) {} }, 400); } else mix.alignErr = Math.round(e2 * 1000) / 1000; } catch (_) {} }, 350); } catch (_) {} }, 300); // phrase lock: whole-beat correction, SYNC fixes the fraction
        if (mode === 'sync') { var n51 = 0; (function fix51() { setTimeout(function () { try { if (!inc.playing) return; var e = errNow(); if (Math.abs(e) > 0.03 && Math.abs(e) < phrase) { inc.seek(inc.pos() + e * ratio * inc.spb()); try { inc.doSync(false); } catch (_) {} mix.fixed51 = (mix.fixed51 || 0) + 1; } mix.alignErr51 = Math.round(errNow() * 1000) / 1000; if (++n51 < 8 && Math.abs(mix.alignErr51) > 0.02) fix51(); } catch (_) {} }, n51 ? 450 : 1300); })(); } // v51: closed-loop beat lock (was ~0.36 beat late)
        L.mixStart(mix); C.lastMix = mix;
        var total = bars * 4 * spb * 1000, t0 = performance.now(), swapAt = Math.round(bars / 2) * 4 * spb * 1000;
        var xfFrom = m ? m.xf : air.id === 'A' ? 0 : 1, xfTo = inc.id === 'A' ? 0 : 1, swapped = false, fxDone = false, looped = false, rate0 = air.tempoPct();
        var pctTarget = from0 && target ? (target / from0 - 1) * 100 : 0;
        clearInterval(A.ramp);
        A.ramp = setInterval(function () {
          if (!A.on) { clearInterval(A.ramp); A.pending = false; return; }
          var el = performance.now() - t0, k = clamp(el / total, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          if (m) m.setXf(xfFrom + (xfTo - xfFrom) * e);
          if (pctTarget && Math.abs(pctTarget) > 0.05) { var want = rate0 + pctTarget * k * (1 + rate0 / 100); if (Math.abs(air.tempoPct() - want) > 0.02) air.setTempoPct(want); } // ramp the master; incoming follows via SYNC
          if (A.opts.bassSwap && !swapped && m) { // smooth EQ bass swap across one beat at the phrase midpoint (no hard click)
            var sw = clamp((el - swapAt + spb * 500) / (spb * 1000), 0, 1);
            if (sw > 0) { m.setKnob(air.id, 'low', -sw); m.setKnob(inc.id, 'low', sw - 1); }
            if (sw >= 1) swapped = true;
          }
          if (fx === 'filter' && m) { // subtle filter: incoming opens from a soft low-pass, outgoing thins out with a gentle high-pass
            m.setKnob(inc.id, 'color', k < 0.5 ? -0.28 * (1 - k / 0.5) : 0);
            m.setKnob(air.id, 'color', k > 0.5 ? 0.32 * Math.min(1, (k - 0.5) / 0.45) : 0);
          }
          if (A.opts.loops && !looped && k >= 0.62 && air.buffer && (air.duration - air.pos()) / air.baseRate() < (1 - k) * total / 1000 + 2) { looped = true; air.autoLoop(4); }
          if (mode === 'echo-out' && !fxDone && k >= 0.25 && m) { fxDone = true; m.setFx({ type: 'echo', beats: 0.75, assign: air.id, level: 0.65, on: true }); }
          if (fx !== 'none' && fx !== 'filter' && !fxDone && k >= 0.75 && m) { fxDone = true; m.setFx({ type: fx, beats: fx === 'echo' ? 0.75 : 1, assign: air.id, level: 0.5, on: true }); }
          if (global.PRO8.paint && Math.random() < 0.2) global.PRO8.paint();
          if (k >= 1) {
            clearInterval(A.ramp);
            if (m) { if (fxDone) m.setFx({ on: false }); m.setMaster(inc.id); m.setKnob(air.id, 'low', 0); m.setKnob(inc.id, 'low', 0); m.setKnob(air.id, 'color', 0); m.setKnob(inc.id, 'color', 0); }
            if (air.loop.active) air.loopExit();
            air.pause(); inc.setSync(false); inc.freeTempo = false; air.setTempoPct(rate0); // outgoing deck back to its own tempo for next time
            var prevId = tid(air.track), playedS = (now() - A.startedAt) / 1000; L.bumpTrack(prevId, function (t) { t.plays++; t.sec += playedS; });
            if (L.prev && !L.prev.judged) L.judge('grał ' + Math.round(playedS) + ' s', clamp(playedS / Math.max(60, (A.opts.playBars || 64) * 4 * spb) - 0.4, -0.5, 0.8));
            L.prev = L.cur;
            A.air = inc.id; A.startedAt = now(); A.phase = 'play'; A.pending = false;
            C.done = (C.done || 0) + 1; C.lastDone = { air: inc.id, master: m && m.master, low: m ? [m.vals.A.low, m.vals.B.low] : null, xf: m && m.xf, bpm: inc.effBpm(), mix: mix };
            A.say('✅ Na antenie: deck ' + inc.id + ' · ' + (inc.track && inc.track.name) + ' · ' + (inc.effBpm() || 0).toFixed(1) + ' BPM');
            setTimeout(A.prep, 1200); C.flush();
            if (global.PRO8.paint) global.PRO8.paint();
          }
        }, 50);
      }, wait);
    };
    if (A.on) { clearInterval(A.timer); A.timer = setInterval(A.tick, 400); }
    log('🎼 Auto Mix: miksowanie na frazach (16/32), bass swap na takcie, rampa tempa w zakresie BPM, nauka');
    return true;
  }

  // ================================================================== agent sync hooks (single conductor)
  var TRANSPORT = /^(load|play|pause|cue|hotcue|sync|master|tempo|bpm|xfade|fader|loop|loopExit|beatJump)$/;
  function hookDJ() {
    var D = DJ(); if (!D || D.__v48) return !!(D && D.__v48); D.__v48 = true;
    var run = D.run; global.DBotDJ.run = D.run = function (name, args) {
      var A = AutoMix(), a = args || {}, self = this, argv = arguments;
      if (name === 'auto' && a.on === false) { var F = FA(); if (F && F.on) F.suppressed['auto.start'] = now() + 30 * 60000; C.userHoldUntil = 0; log('👤 Auto Mix OFF (Twoja decyzja — FULL AUTO nie włączy go przez 30 min)'); }
      if ((name === 'auto' && a.on !== false) || name === 'play') C.arm('DJ: ' + name);
      if (name === 'auto' && a.on !== false) { var F2 = FA(); if (F2) delete F2.suppressed['auto.start']; C.userHoldUntil = 0; C.yielded = null; }
      if (A && A.on && TRANSPORT.test(name)) {
        if (name === 'pause') { C.userHoldUntil = now() + 15 * 60000; L.skip('pauza'); log('👤 pauza — Auto Mix czeka (do „play” / „auto on”, max 15 min)'); return run.apply(self, argv); }
        if (name === 'play') { C.userHoldUntil = 0; return run.apply(self, argv); } // user play/pause always run now
        if (name === 'load' && a.deck && A.air && String(a.deck).toUpperCase() === A.air && !C.busy()) { L.skip('load'); }
        return C.propose('Ty (czat)', name + ' ' + JSON.stringify(a), function () { return run.apply(self, argv); });
      }
      return run.apply(self, argv);
    };
    if (D.tools && D.tools.auto) { /* tools are called through DJ.run — covered */ }
    // Party: no FX / rolls / drops on top of a running transition (they clobbered the bass swap + transition echo)
    var Pa = D.party; if (Pa && Pa.onBar) { var ob = Pa.onBar; Pa.onBar = function (bar) { if (C.busy()) { if (bar % 4 === 0) log('🔥 Party czeka — trwa przejście'); return; } return ob.apply(Pa, arguments); }; }
    return true;
  }
  function hookStudio() {
    var S = STU(); if (!S || S.__v48c) return !!(S && S.__v48c); S.__v48c = true;
    // D Song → deck: never overwrite the track Auto Mix has cued — it becomes the next track in the mix
    var td = S.song.toDeck; S.song.toDeck = function (id, k) {
      var A = AutoMix(), m = S.lib.get(id);
      if (A && A.on && m) {
        return S.lib.blob(id).then(function (b) {
          var t = { id: 'song-' + id, name: '🎵 ' + m.title, file: URL.createObjectURL(b), bpm: m.bpm, local: true };
          C.nextQ = C.nextQ || []; C.nextQ.unshift(t);
          var p = P8(), nx = p && A.air ? p.decks[A.air].other() : null;
          if (nx && !nx.playing && !C.busy()) { nx.load(t, false); nx.prepare && nx.prepare(); C.nextQ.shift(); A.next = t; A.history.push(t.id); }
          bus('D Song', 'propose', '„' + m.title + '” jako następny w miksie'); log('🎵 D Song → następny w Auto Mix: ' + m.title);
          return '🎧 „' + m.title + '” będzie następny w Auto Mix (dyrygent nie przerywa bieżącego utworu) · ' + m.bpm + ' BPM';
        });
      }
      return td.apply(S.song, arguments);
    };
    // studio player (generated song) — Auto Mix yields (fades the decks), resumes when the song ends / stops
    var pp = S.player.play; S.player.play = function (id) {
      var A = AutoMix(), p = P8();
      if (A && A.on && p && decksPlaying()) {
        var d = p.decks[A.air]; C.yielded = { deck: d.id, at: now() }; d.pause(); log('🎵 D Song gra — Auto Mix ustępuje (deck ' + d.id + ' pauza)'); bus('Auto Mix', 'decision', 'ustępuje D Song');
      }
      return pp.apply(S.player, arguments);
    };
    S.on('player', function (m) {
      if (m || !C.yielded) return; var y = C.yielded; C.yielded = null; var p = P8(), A = AutoMix();
      if (p && A && A.on && !C.held()) { p.decks[A.air].play(); log('▶ Auto Mix wraca po D Song (deck ' + A.air + ')'); }
      return y;
    });
    S.on('stopall', function (e) { C.yielded = null; C.userHoldUntil = 0; C.phase = 'held'; log('⏹ STOP (' + (e && e.src) + ')' + (e && e.persist ? ' — FULL AUTO wyłączony na stałe' : ' — do restartu / „start”')); });
    return true;
  }
  function hookMidi() {
    var MS = global.DBotMidiSync; if (!MS || MS.__v48) return !!(MS && MS.__v48); MS.__v48 = true;
    var N = global.DBotNative; if (!N || !N.MIDI) return true;
    var fol = MS.follow; MS.follow = function () {
      var r = fol.apply(MS, arguments); clearInterval(MS.timer);
      // MIDI slave clamp: external clock folded into the BPM range (half/double time); out-of-range tempo is clamped + reported
      MS.timer = setInterval(function () {
        var b = 0; try { b = N.MIDI.slaveBpm(); } catch (_) {} if (!(b > 30)) return;
        var R = RG(), f = R ? R.info(b) : { bpm: b, pct: 0 }; MS.slaveBpm = b;
        var p = P8(); if (p) ['A', 'B'].forEach(function (k) { var d = p.decks[k]; if (d.playing && d.bpm && !d.syncOn) { var tg = R ? R.match(d.bpm, f.bpm) : b, pct = (tg / d.bpm - 1) * 100; if (Math.abs(pct) > d.range) d.setRange(Math.abs(pct) > 16 ? 50 : 16); if (Math.abs(d.effBpm() - tg) > 0.02) d.setTempoPct(pct, false); } });
        if (STU()) STU().clock.set(f.bpm, 'midi');
        MS.status = 'SLAVE ← ' + b.toFixed(2) + ' BPM' + (Math.abs(f.pct) > 0.5 ? ' (poza zakresem → ' + f.bpm + ')' : f.mult !== 1 ? ' (= ' + f.bpm + ' half/double)' : '');
      }, 200);
      return r;
    };
    return true;
  }
  function hookFullAuto() {
    var F = FA(); if (!F || F.__v48) return !!(F && F.__v48); F.__v48 = true;
    var dec = F.decide; F.decide = function (kind) {
      if (kind === 'auto.start' && (!C.armed() || C.phase === 'radio' || C.userHoldUntil > now() || C.yielded)) return null; // conductor: radio first / user hold
      return dec.apply(F, arguments);
    };
    var st = F.start; F.start = function () { F.held = false; var r = st.apply(F, arguments); C.phase = C.phase === 'held' ? 'idle' : C.phase; setTimeout(C.kick, 300); return r; };
    return true;
  }
  // 👍/👎 anywhere in the chat also teach Auto Mix (when a mix is on air)
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.dbot-thumbs button, .d7c-thumb, [data-thumb]'); if (!b) return;
    var A = AutoMix(); if (!A || !A.on) return; var up = /👍/.test(b.textContent || '') || b.dataset.thumb === 'up'; L.feedback(up, up ? '👍 czat' : '👎 czat');
  }, true);

  // ================================================================== autostart + keep-alive (players really play)
  function unlock() {
    try { var S = STU(); if (S && S.ctx) { var c = S.ctx(); if (c && c.state !== 'running') c.resume(); } } catch (_) {}
    try { var X = SX(); if (X && X.resume) X.resume(); } catch (_) {}
  }
  // v48b (Daniel): on launch ONLY Kali radio starts by itself. FULL AUTO stays on, but the decks / Auto Mix start only after the user
  // presses ▶ on a deck, says „graj” / „auto mix”, or turns on Opcje → „Decki startują same”. Session-only arm.
  C.decksArmed = false;
  C.armed = function () { return !!(C.opts().decksAuto || C.decksArmed); };
  C.arm = function (why) {
    if (!C.decksArmed) { C.decksArmed = true; log('▶ decki uzbrojone (' + why + ') — Auto Mix przejmuje'); bus('Auto Mix', 'decision', 'start decków: ' + why); }
    C.userHoldUntil = 0; C.yielded = null;
    var s = snap();
    if (streamOn()) { global.DBotRadio.fadeOut(8000); C.phase = 'decks'; C.radioDone = true; }
    else if (C.phase === 'radio' && s && s.radioPlaying && !s.kaliLocal && AutoMix()) { C.handover(); }
    else { C.phase = 'decks'; C.radioDone = true; }
    setTimeout(C.kick, 150); return true;
  };
  document.addEventListener('click', function (e) {
    if (!e.isTrusted) return; var b = e.target && e.target.closest && e.target.closest('.sx-play, .p8-play, [data-deck-play]');
    if (b) C.arm('▶ na decku');
  }, true);
  C.startPlayback = function (why) {
    var X = SX(), steps = [];
    if (!X) return ['brak SpecialX'];
    if (X.autoStart && X.started && !X.started()) { X.autoStart(); steps.push('START (bez bramki)'); }
    unlock();
    var o = C.opts(), s = snap();
    var RS = global.DBotRadio, pref = RS && RS.preferred ? RS.preferred() : 'kali';
    if (o.kaliAuto && s && !s.radioWanted && !s.kaliLocal && !streamOn() && !decksPlaying() && !C.radioDone) { if (pref && pref !== 'kali' && RS) { RS.play(pref, 'start'); steps.push('📻 ' + pref); } else { X.kali(); steps.push('📻 Kali radio'); } C.phase = 'radio'; C.radioSince = now(); }
    else if (radioOn() && !decksPlaying()) { C.phase = 'radio'; C.radioSince = C.radioSince || now(); }
    log('🚀 autostart (' + why + '): ' + (steps.join(' · ') || 'gra'));
    return steps;
  };
  /** every 3 s while FULL AUTO is on: something must be playing; radio → decks handover; Auto Mix alive */
  C.kick = function () {
    var F = FA(); if (!F || !F.on || C.held()) return 'held';
    var A = AutoMix(), p = P8(), s = snap(), o = C.opts();
    var X = SX(); if (X && X.started && !X.started() && X.autoStart) C.startPlayback('kick');
    if (C.userHoldUntil > now() || C.yielded) return 'user';
    if (!C.armed()) { // radio only until the user starts the decks
      var on = radioOn() || decksPlaying() || !!(STU() && STU().player.cur);
      if (on) { C.lastPlayAt = now(); C.silentSince = 0; } else if (!C.silentSince) C.silentSince = now();
      C.phase = radioOn() || (s && s.radioWanted) ? 'radio' : 'idle'; return on ? 'radio' : 'idle';
    }
    if (s && s.kaliLocal) { C.phase = 'decks'; C.radioDone = true; } // YouTube unavailable → local Kali on deck A, Auto Mix mixes on from it
    if (C.phase === 'radio') {
      var ytOk = radioYt() && s && s.radioPlaying;
      if (!radioYt() && !radioOn()) { C.phase = 'decks'; C.radioDone = true; }
      else if (ytOk && o.radioMin >= 0 && now() - C.radioSince > o.radioMin * 60000 && p && A) { C.handover(); return 'handover'; }
      else if (!ytOk && radioYt() && now() - C.radioSince > 15000) { // YouTube blocked / not playing → local Kali beat
        try { X.api.stopRadio && X.api.stopRadio(); } catch (_) {} C.radioDone = true; C.phase = 'decks'; log('📻 YouTube nie gra (autoplay / offline) → Auto Mix na deckach');
      } else return 'radio';
    }
    if (p && A) {
      if (!A.on) { F.decide('auto.start', 'Auto mix ON', decksPlaying() ? 'gra muzyka — przejmuję miksowanie' : 'cisza na deckach — startuję set (dyrygent)', function () { return A.start(); }); }
      var air = A.on && p.decks[A.air];
      if (air && !air.playing && A.phase === 'play' && air.track) { if (!air.buffer) { if (!air.loading) air.prepare(); } else { air.play(); log('▶ keep-alive: deck ' + air.id + ' wznowiony'); } }
    }
    var playing = decksPlaying() || radioOn() || !!(STU() && STU().player.cur);
    if (playing) { C.lastPlayAt = now(); C.silentSince = 0; } else if (!C.silentSince) C.silentSince = now();
    if (C.phase !== 'radio') C.phase = 'decks';
    return playing ? 'ok' : 'silent';
  };
  /** radio → decks: deck starts under the radio, YouTube volume fades out over ~8 s */
  C.handover = function () {
    var A = AutoMix(), X = SX(); if (!A || !X) return false;
    C.phase = 'decks'; C.radioDone = true;
    var r = A.on ? 'ok' : A.start(); log('📻 → 🎧 przekazanie: radio → Auto Mix (' + r + ')');
    var y = X.state && X.state.yt, v0 = (X.state && X.state.radioVol) || 80, i = 0;
    var iv = setInterval(function () { i++; try { if (y && y.setVolume) y.setVolume(Math.round(v0 * (1 - i / 16))); } catch (_) {} if (i >= 16) { clearInterval(iv); try { X.api.stopRadio(); if (y && y.setVolume) y.setVolume(v0); } catch (_) {} } }, 500);
    bus('Auto Mix', 'decision', 'radio → decki (płynne przejście)');
    return true;
  };

  // ================================================================== chat: start / stop / skip / learning commands
  C.chat = function (text) {
    var n = norm(text), F = FA(), S = STU();
    if (/^(start|graj|play|wlacz auto|full auto|full auto on|auto on|wznow|resume|graj dalej|wlacz wszystko)$/.test(n) && F) {
      if (!F.on) { F.start(true); } C.arm('czat: ' + n);
      return '▶ FULL AUTO ON — decki + Auto Mix grają (radio płynnie oddaje), dyrygent: Auto Mix. ⏹ obok odznaki = stop.';
    }
    if (/^(wylacz auto( na stale)?|auto off( na stale)?|full auto off|stop auto na stale|wylacz full auto)$/.test(n) && S) return S.stopAll('czat (na stałe)', true);
    if (/^(skip|next|nastepny|nastepna|dalej|pomin|przewin|zmien (utwor|kawalek|numer))$/.test(n)) {
      var A = AutoMix(); if (!A || !A.on) return null; L.skip('czat'); C.userHoldUntil = 0; A.startedAt = 0; A.transition();
      return '⏭ Przechodzę do następnego na granicy frazy (zapamiętane: ten utwór/mix mniej pasował).';
    }
    if (/^(dobry mix|super mix|swietny mix|fajny mix|good mix|great mix|dobre przejscie|👍)$/.test(n) || /^👍$/.test(String(text).trim())) { L.feedback(true, 'czat'); return '👍 Zapamiętane — więcej takich przejść.'; }
    if (/^(slaby mix|zly mix|bad mix|slabe przejscie|👎)$/.test(n) || /^👎$/.test(String(text).trim())) { L.feedback(false, 'czat'); return '👎 Zapamiętane — zmienię styl przejść.'; }
    if (/^(dyrygent|conductor|kto gra|stan miksu|agent sync|sync agentow)$/.test(n)) return C.status();
    if (/^(nauka|learning|czego sie nauczyles|tweaki|tweaks)$/.test(n)) return C.learnStatus();
    var bm = n.match(/^(?:zakres|range) (?:bpm )?(\d{2,3})\s*(?:-|do|to)\s*(\d{2,3})$/); if (bm && RG()) { var r = RG().set(+bm[1], +bm[2]); return '🎚 Zakres BPM ' + r.min + '–' + r.max + ' — Auto Mix, sync, D Song, D Loop, Party i MIDI slave trzymają się go.'; }
    if (/^(pin|przypnij tempo|tempo reczne|pin tempo)$/.test(n) && RG()) { RG().pin(true, STU().clock.bpm); return '📌 Tempo ręczne ' + STU().clock.bpm + ' BPM — tylko Ty je zmieniasz („odepnij tempo” wraca do auto).'; }
    if (/^(odepnij tempo|unpin|tempo auto)$/.test(n) && RG()) { RG().pin(false); return '🔓 Tempo znów prowadzi lider (auto).'; }
    return null;
  };
  C.status = function () {
    var A = AutoMix(), p = P8(), F = FA(), R = RG(), s = snap();
    var lines = ['🎼 Dyrygent: ' + C.owner + ' · faza: ' + C.phase + (C.held() ? ' (STOP do restartu)' : '') + ' · FULL AUTO ' + (F && F.on ? 'ON' : 'off')];
    lines.push('📻 radio: ' + (s ? (s.kaliLocal ? 'lokalny Kali' : s.radioPlaying ? 'ON AIR' : s.radioWanted ? 'łączę…' : 'off') : '—') + ' · 🎧 decki: ' + (p ? ['A', 'B'].map(function (k) { var d = p.decks[k]; return k + (d.playing ? '▶' : '⏸') + (d.effBpm() ? ' ' + d.effBpm().toFixed(1) : ''); }).join(' ') : '—'));
    if (A) lines.push('Auto Mix ' + (A.on ? 'ON · ' + A.phase + ' · ' + A.opts.bars + ' t. · FX ' + (A.opts.fx ? 'on' : 'off') + ' · ' + A.opts.playBars + ' t. utworu' : 'off'));
    if (R) lines.push('Zakres BPM ' + R.get().min + '–' + R.get().max + ' · master ' + STU().clock.bpm + (R.pinned() ? ' 📌' : ''));
    lines.push('Propozycje agentów: ' + C.executed + ' wykonanych, ' + C.deferred + ' odłożonych do końca przejścia, w kolejce ' + C.queue.length);
    return lines.join('\n');
  };
  C.learnStatus = function () {
    var d = L.data(), m = d.mixes.slice(-6), tw = d.tweaks.slice(-5);
    return '🧠 Nauka Auto Mix: ' + d.mixes.length + ' miksów, ' + Object.keys(d.tracks).length + ' utworów ocenionych.\n' +
      ['4', '8', '16'].map(function (b) { var a = L.arm('bars', +b); return b + ' t.: ' + (a.n ? (a.s / a.n).toFixed(2) + ' (' + a.n + ')' : '—'); }).join(' · ') + '\n' +
      (m.length ? 'Ostatnie: ' + m.map(function (x) { return x.to + (x.judged ? ' ' + (x.r >= 0 ? '+' : '') + (+x.r).toFixed(1) : ''); }).join(' | ') + '\n' : '') +
      (tw.length ? 'Tweaki D Doctor: ' + tw.map(function (t) { return t.key + ' ' + t.from + '→' + t.to + (t.reverted ? ' (cofnięty)' : ''); }).join(' · ') : 'Tweaki D Doctor: jeszcze żadnych (potrzeba ≥3 ocen na opcję).');
  };
  function hookChat() {
    var S = global.D7Super; if (!S || !S.__agHooked || S.__v48) return !!(S && S.__v48);
    var orig = S.handle; S.__v48 = true;
    S.handle = function (text) {
      var r = null; try { r = C.chat(text); } catch (e) { r = null; }
      if (r == null) return orig.apply(this, arguments);
      var Ch = global.D7Chat; if (Ch) { Ch.add('user', text); Ch.add('bot', r); } return true;
    };
    return true;
  }

  // ================================================================== D Doctor modules: conductor + learning
  function addDoctor() {
    var Mo = global.DBotModules; if (!Mo || Mo.list.conductor) return !!(Mo && Mo.list.conductor);
    Mo.list.conductor = { label: '🎼 Dyrygent / autoplay', check: function () {
      var F = FA(); if (!F || !F.on) return [C.held() ? 'yellow' : 'gray', C.held() ? 'STOP (wróci po restarcie / „start”)' : 'FULL AUTO wyłączony (Twoja decyzja)'];
      if (C.userHoldUntil > now()) return ['yellow', 'pauza użytkownika — Auto Mix czeka'];
      if (C.silentSince && now() - C.silentSince > 20000) return ['red', 'FULL AUTO włączony, a nic nie gra od ' + Math.round((now() - C.silentSince) / 1000) + ' s'];
      return ['green', 'faza ' + C.phase + ' · ' + (decksPlaying() ? 'decki grają' : radioOn() ? 'radio gra' : 'start…') + ' · kolejka ' + C.queue.length];
    }, start: function () { C.kick(); }, heal: function () { C.silentSince = 0; C.startPlayback('D Doctor'); var r = C.kick(); return 'odtwarzanie wznowione (' + r + ')'; } };
    Mo.list.learn = { label: '🧠 Nauka Auto Mix', check: function () { var d = L.data(); return [C.opts().learn ? 'green' : 'yellow', d.mixes.length + ' miksów · ' + d.tweaks.filter(function (t) { return !t.reverted; }).length + ' tweaków (odwracalne)']; },
      heal: function () { var t = L.tune('D Doctor'); return t.length ? t.length + ' tweak(ów)' : 'bez zmian'; } };
    if (Mo.order.indexOf('conductor') < 0) Mo.order.push('conductor', 'learn');
    return true;
  }
  setInterval(function () { var F = FA(); if (F && F.on && C.opts().learn && now() - (L.lastTune || 0) > 10 * 60000) { L.lastTune = now(); var t = L.tune('co 10 min'); if (t.length && F.decide) F.decide('learn', 'D Doctor: ' + t.length + ' tweak(ów) Auto Mix', 'nauka z pominięć / 👍👎 / długości miksów', function () { return t.map(function (x) { return x.key + ' ' + x.from + '→' + x.to; }).join(', '); }); } }, 60000);

  // ================================================================== ⚙ Opcje: BPM range, 📌 manual tempo, radio, learning
  function optsCard(b) {
    if (!b || b.querySelector('#op-bpm')) return;
    var R = RG(), r = R ? R.get() : { min: 79, max: 127 }, o = C.opts(), d = L.data();
    var card = document.createElement('div'); card.className = 'dbc-card'; card.id = 'op-bpm';
    card.innerHTML = '<h3>🎚 Zakres BPM · 📌 tempo · 🎼 dyrygent</h3>' +
      '<label class="dbc-row"><span>Zakres BPM (Auto Mix, sync, D Song, D Loop, Party, MIDI slave)</span><span class="op-rng"><input type="number" id="op-bmin" min="40" max="200" value="' + r.min + '"> – <input type="number" id="op-bmax" min="48" max="240" value="' + r.max + '"></span></label>' +
      '<label class="dbc-row"><span>📌 Tempo ręczne (tylko Ty zmieniasz master BPM)</span><input type="checkbox" id="op-pin"' + (R && R.pinned() ? ' checked' : '') + '></label>' +
      '<label class="dbc-row"><span>Master BPM</span><input type="number" id="op-pbpm" min="40" max="240" step="0.1" value="' + ((STU() && STU().clock.bpm) || 120) + '"></label>' +
      '<label class="dbc-row"><span>📻 Kali radio na starcie</span><input type="checkbox" id="op-kali"' + (o.kaliAuto ? ' checked' : '') + '></label>' +
      '<label class="dbc-row"><span>🎧 Decki startują same (bez ▶) — domyślnie wyłączone</span><input type="checkbox" id="op-decks"' + (o.decksAuto ? ' checked' : '') + '></label>' +
      '<label class="dbc-row"><span>Radio → Auto Mix po (min, −1 = radio zostaje)</span><input type="number" id="op-rmin" min="-1" max="120" value="' + o.radioMin + '"></label>' +
      '<label class="dbc-row"><span>🧠 Auto-ulepszanie (nauka z pominięć, 👍/👎, długości miksów)</span><input type="checkbox" id="op-learn"' + (o.learn ? ' checked' : '') + '></label>' +
      '<div class="op-tweaks" id="op-tweaks"></div>' +
      '<p class="dbc-hint">Jeden dyrygent (Auto Mix) prowadzi transport — agenci proponują, a propozycje kolidujące z przejściem czekają do końca frazy. Czat: „dyrygent”, „nauka”, „skip”, „dobry mix”, „zakres 85-125”, „pin”.</p>';
    var after = b.querySelector('#op-auto'); if (after && after.nextSibling) b.insertBefore(card, after.nextSibling); else b.appendChild(card);
    function q(s) { return card.querySelector(s); }
    q('#op-bmin').onchange = q('#op-bmax').onchange = function () { var x = R.set(q('#op-bmin').value, q('#op-bmax').value); q('#op-bmin').value = x.min; q('#op-bmax').value = x.max; q('#op-pbpm').value = STU().clock.bpm; };
    q('#op-pin').onchange = function () { R.pin(this.checked, +q('#op-pbpm').value || STU().clock.bpm); q('#op-pbpm').value = STU().clock.bpm; paintPin(); };
    q('#op-pbpm').onchange = function () { if (!R.pinned()) R.pin(true); STU().clock.set(+this.value, 'opts'); this.value = STU().clock.bpm; q('#op-pin').checked = true; paintPin(); };
    q('#op-kali').onchange = function () { C.setOpt('kaliAuto', this.checked); };
    q('#op-decks').onchange = function () { C.setOpt('decksAuto', this.checked); if (this.checked) C.kick(); };
    q('#op-rmin').onchange = function () { C.setOpt('radioMin', clamp(+this.value, -1, 120)); };
    q('#op-learn').onchange = function () { C.setOpt('learn', this.checked); };
    function tweaks() {
      var box = q('#op-tweaks'), tw = L.data().tweaks.slice(-6).reverse();
      box.innerHTML = tw.length ? tw.map(function (t) { return '<div class="dbc-row"><span>' + t.at.slice(11, 16) + ' ' + t.key + ' ' + t.from + ' → ' + t.to + ' · ' + t.why + '</span>' + (t.reverted ? '<small>cofnięty</small>' : '<button type="button" data-rev="' + t.id + '">↶ cofnij</button>') + '</div>'; }).join('') : '<small>Tweaki D Doctor pojawią się tu (każdy można cofnąć).</small>';
      Array.prototype.forEach.call(box.querySelectorAll('[data-rev]'), function (x) { x.onclick = function () { L.revert(x.dataset.rev); tweaks(); }; });
    }
    tweaks(); subs.push(function (ev) { if (ev === 'learn' && card.isConnected) tweaks(); });
  }
  function hookOpts() {
    var S = STU(); if (!S || S.__v48o) return !!(S && S.__v48o); S.__v48o = true;
    var ao = S.autoOpts; S.autoOpts = function (b) { var r = ao.apply(S, arguments); try { optsCard(b); } catch (e) { console.warn('[v48 opts]', e); } return r; };
    return true;
  }
  // 📌 chip in the top bar while the tempo is pinned
  function paintPin() {
    var R = RG(); if (!R) return; var on = R.pinned(), el = document.getElementById('dbot-pin-chip');
    if (!el) { var badge = document.querySelector('.sx-badge'); if (!badge) return; el = document.createElement('button'); el.type = 'button'; el.id = 'dbot-pin-chip'; el.className = 'dbot-pin-chip'; el.title = 'Tempo ręczne (📌) — stuknij: odepnij'; el.onclick = function () { R.pin(false); paintPin(); }; badge.parentNode.appendChild(el); }
    el.hidden = !on; if (on) el.textContent = '📌 ' + STU().clock.bpm;
  }

  // ================================================================== boot
  var hooks = { doSync: patchDoSync, autoMix: patchAutoMix, dj: hookDJ, studio: hookStudio, midi: hookMidi, fullAuto: hookFullAuto, chat: hookChat, doctor: addDoctor, opts: hookOpts };
  C.hooks = {};
  function hookAll() { var all = true; Object.keys(hooks).forEach(function (k) { var ok = false; try { ok = hooks[k](); } catch (e) { console.warn('[v48 conductor]', k, e); } C.hooks[k] = !!ok; if (!ok) all = false; }); return all; }
  function boot() {
    C.boot.at = now();
    var n = 0, t = setInterval(function () { if (hookAll() || ++n > 40) clearInterval(t); }, 500);
    // FULL AUTO was on (or first launch) → play right away: START gate skipped, Kali radio, Auto Mix
    setTimeout(function () {
      hookAll();
      var F = FA(), want = sget('auto.full', false) || (global.DBotStudio && !sget('v47.firstRun', null) && !global.__D77_NO_FIRSTRUN);
      if (global.__D77_NO_AUTOSTART) return;
      if (want) { C.boot.steps = C.startPlayback('start aplikacji'); if (F && !F.on && sget('auto.full', false)) F.start(true); }
    }, 1800);
    setInterval(function () { try { C.kick(); paintPin(); } catch (e) { console.warn('[v48 kick]', e); } }, 3000);
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function once() { unlock(); var F = FA(); if (F && F.on && !C.held()) setTimeout(C.kick, 50); }, { passive: true, capture: true }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  C.on = function (f) { subs.push(f); };
  C.unlock = unlock;
  global.DBotConductor = C;
})(typeof window !== 'undefined' ? window : globalThis);
