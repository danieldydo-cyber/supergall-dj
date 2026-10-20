/*
 * D.bot v45 — „D Bot” orchestrator + specialist agents + DJ agent tools (Auto mix, Special X / Party mode) + MIDI deck sync.
 *  • 7 built-in agents: DJ Mixer, MIDI/MC-707, Music Producer/Loops, App Builder, Bot Builder, Researcher, Memory/Sync.
 *    Each: role prompt, enable switch, provider/model (the user's OWN keys from ⚙), on-device learning notes from 👍/👎.
 *  • D Bot routes a task to the best agent(s) (keywords, @mention, „all agents: …”), can run several and merge, keeps a log.
 *  • No self-replication / automatic spawning: agents are only added or cloned by the user (UI buttons).
 *  • DJ agent tools = every PRO8 deck feature (load, play, pause, cue, hot cue, sync, master, tempo/BPM, loop, beat jump,
 *    BEAT FX, EQ, filter, faders, crossfader, MIDI clock) + Auto mix + Party mode; AI can call them via a strict JSON tool list.
 * Classic script. window.DBotAgents, window.DBotDJ, window.DBotMidiSync.
 */
(function (global) {
  'use strict';
  var VERSION = '45';
  var LS_AG = 'dbot-agents', LS_LOG = 'dbot-agent-log', LS_DJ = 'dbot-dj';
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function norm(s) { return String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function SX() { return global.SpecialX && global.SpecialX.api; }
  function P8() { return global.PRO8 && global.PRO8.decks && global.PRO8.decks.A ? global.PRO8 : null; }
  function Super() { return global.D7Super; }
  function now() { return Date.now(); }

  // ================================================================== DJ tools (all deck features)
  var DJ = {};
  function deck(id) { var p = P8(); id = String(id || 'A').toUpperCase(); return p && p.decks[id === 'B' ? 'B' : 'A']; }
  function mixer() { var p = P8(); return p && p.mixer(); }
  function tracks() {
    var a = SX(), list = [];
    try { list = (a && a.tracks()) || []; } catch (_) {}
    return list.filter(function (t) { return t && t.file; });
  }
  function findTrack(q) {
    var a = SX(); q = norm(q);
    if (!q) return null;
    try { if (a && a.findTrack) { var t = a.findTrack(q); if (t && t.file) return t; } } catch (_) {}
    var best = null, bs = 0;
    tracks().forEach(function (t) {
      var n = norm(t.name), sc = n === q ? 100 : n.indexOf(q) >= 0 ? 50 : 0;
      q.split(' ').forEach(function (w) { if (w.length > 1 && n.indexOf(w) >= 0) sc += 5; });
      if (sc > bs) { bs = sc; best = t; }
    });
    return bs > 0 ? best : null;
  }
  DJ.tools = {
    load: { args: 'deck, track', run: function (a) { var d = deck(a.deck), t = typeof a.track === 'object' ? a.track : findTrack(a.track); if (!d) return 'brak decków'; if (!t) return 'nie znam utworu „' + a.track + '”'; d.load(t, !!a.play); return 'Deck ' + d.id + ' ← ' + t.name + (a.play ? ' ▶' : ''); } },
    play: { args: 'deck', run: function (a) { var d = deck(a.deck); if (!d || !d.track) return 'Deck ' + (a.deck || 'A') + ': brak utworu'; d.play(); return 'Deck ' + d.id + ' ▶ ' + d.track.name; } },
    pause: { args: 'deck', run: function (a) { var d = deck(a.deck); if (d) d.pause(); return 'Deck ' + (d && d.id) + ' ⏸'; } },
    cue: { args: 'deck', run: function (a) { var d = deck(a.deck); if (!d) return ''; d.cueDown(); d.cueUp(); return 'Deck ' + d.id + ' CUE'; } },
    hotcue: { args: 'deck, n(1-8)', run: function (a) { var d = deck(a.deck), i = clamp((a.n | 0) - 1, 0, 7); if (!d || !d.buffer) return 'Deck: najpierw wczytaj utwór'; d.hotDown(i); d.hotUp(i); return 'Deck ' + d.id + ' hot cue ' + 'ABCDEFGH'[i]; } },
    sync: { args: 'deck, on', run: function (a) { var d = deck(a.deck); if (!d) return ''; var m = mixer(); if (m && (!m.master || m.master === d.id)) m.setMaster(d.other().id); d.setSync(a.on !== false); return 'Deck ' + d.id + ' SYNC ' + (d.syncOn ? 'ON → ' + ((d.effBpm() || 0).toFixed(1)) + ' BPM' : 'OFF'); } },
    master: { args: 'deck', run: function (a) { var d = deck(a.deck), m = mixer(); if (m && d) m.setMaster(d.id); return 'MASTER = deck ' + (d && d.id); } },
    tempo: { args: 'deck, pct', run: function (a) { var d = deck(a.deck); if (!d) return ''; if (Math.abs(+a.pct) > d.range) d.setRange(Math.abs(+a.pct) > 16 ? 50 : 16); d.setTempoPct(+a.pct || 0, true); return 'Deck ' + d.id + ' tempo ' + (+a.pct || 0).toFixed(2) + ' %'; } },
    bpm: { args: 'deck, bpm', run: function (a) { var d = deck(a.deck), b = +a.bpm; if (!d || !d.bpm) return 'Deck ' + (a.deck || 'A') + ': BPM jeszcze nieznany'; return DJ.tools.tempo.run({ deck: d.id, pct: (b / d.bpm - 1) * 100 }).replace(/tempo.*/, '→ ' + b.toFixed(1) + ' BPM'); } },
    loop: { args: 'deck, beats', run: function (a) { var d = deck(a.deck), b = +a.beats || 4; if (!d || !d.buffer) return 'Deck: najpierw wczytaj utwór'; if (d.loop.active && d.loop.auto && d.loop.beats === b) return 'Deck ' + d.id + ' loop ' + b + ' (już aktywna)'; d.autoLoop(b); return 'Deck ' + d.id + ' 🔁 loop ' + b; } },
    loopExit: { args: 'deck', run: function (a) { var d = deck(a.deck); if (d && d.loop.active) d.loopExit(); return 'Deck ' + (d && d.id) + ' loop OFF'; } },
    beatJump: { args: 'deck, beats', run: function (a) { var d = deck(a.deck); if (d) d.beatJump(+a.beats || 4); return 'Deck ' + (d && d.id) + ' beat jump ' + (+a.beats || 4); } },
    fx: { args: 'type(echo|reverb|flanger|roll), beats, on, level(0-1), assign(A|B|M)', run: function (a) { var m = mixer(); if (!m) return ''; var o = {}; if (a.type) o.type = a.type; if (a.beats) o.beats = +a.beats; if (a.level != null) o.level = +a.level; if (a.assign) o.assign = String(a.assign).toUpperCase(); o.on = a.on !== false; m.setFx(o); if (global.PRO8.paint) global.PRO8.paint(); return 'BEAT FX ' + m.fx.type + ' ' + m.fx.beats + ' → ' + m.fx.assign + (m.fx.on ? ' ON' : ' OFF'); } },
    eq: { args: 'deck, band(hi|mid|low|trim), value(-1..1)', run: function (a) { var m = mixer(); if (!m) return ''; var id = deck(a.deck).id, band = /^(hi|mid|low|trim)$/.test(a.band) ? a.band : 'low'; m.setKnob(id, band, clamp(+a.value || 0, -1, 1)); if (global.PRO8.paint) global.PRO8.paint(); return 'EQ ' + id + ' ' + band + ' ' + (+a.value || 0).toFixed(2); } },
    filter: { args: 'deck, value(-1 LPF..+1 HPF)', run: function (a) { var m = mixer(); if (!m) return ''; var id = deck(a.deck).id; m.setKnob(id, 'color', clamp(+a.value || 0, -1, 1)); if (global.PRO8.paint) global.PRO8.paint(); return 'FILTER ' + id + ' ' + (+a.value || 0).toFixed(2); } },
    fader: { args: 'deck, value(0-1)', run: function (a) { var m = mixer(); if (!m) return ''; var id = deck(a.deck).id; m.setFader(id, clamp(+a.value, 0, 1)); return 'Fader ' + id + ' ' + Math.round(clamp(+a.value, 0, 1) * 100) + ' %'; } },
    xfade: { args: 'value(0=A..1=B)', run: function (a) { var m = mixer(); if (!m) return ''; m.setXf(clamp(+a.value, 0, 1)); if (global.PRO8.paint) global.PRO8.paint(); return 'Crossfader ' + (+a.value).toFixed(2); } },
    midiClock: { args: 'on, bpm?', run: function (a) { return a.on === false ? MidiSync.stop() : MidiSync.start(a.bpm); } },
    auto: { args: 'on', run: function (a) { return a.on === false ? Auto.stop() : Auto.start(); } },
    party: { args: 'on, level(1-3)?', run: function (a) { return a.on === false ? Party.stop() : Party.start(a.level); } },
    viz: { args: 'action(next|prev|fullscreen)', run: function (a) { var x = SX(); if (!x) return ''; if (a.action === 'prev') return '✨ ' + x.presetPrev(); if (a.action === 'fullscreen') { x.enterFs(); return '⛶'; } return '✨ ' + x.presetRandom(); } },
    stopAll: { args: '', run: function () { return DJ.panic(); } },
    status: { args: '', run: function () { return DJ.status(); } }
  };
  DJ.run = function (name, args) {
    var t = DJ.tools[name]; if (!t) return '⚠ nieznane narzędzie ' + name;
    if (!P8() && !/^(midiClock|status|stopAll)$/.test(name)) return '⚠ decki PRO8 są na stronie głównej / Pro DJ (otwórz ją i spróbuj ponownie)';
    try { var r = t.run(args || {}); Log.add('DJ', name + ' ' + JSON.stringify(args || {}), r); return r; } catch (e) { return '⚠ ' + name + ': ' + (e && e.message); }
  };
  DJ.status = function () {
    var p = P8(); if (!p) return 'Decki: brak na tej stronie.';
    var s = p.state(), out = [];
    ['A', 'B'].forEach(function (k) { var d = s[k]; if (!d) return; out.push(k + ': ' + (d.track || '—') + (d.playing ? ' ▶' : ' ⏸') + (d.bpm ? ' ' + (+d.bpm).toFixed(1) + ' BPM' : '') + (d.sync ? ' SYNC' : '') + (d.master ? ' MASTER' : '') + (d.loop && d.loop.active ? ' 🔁' + d.loop.beats : '')); });
    out.push('X-fader ' + (+s.xf).toFixed(2) + ' · FX ' + (s.fx ? s.fx.type + (s.fx.on ? ' ON' : ' off') : '—'));
    out.push('AUTO ' + (Auto.on ? 'ON' : 'off') + ' · PARTY ' + (Party.on ? 'ON L' + Party.level : 'off') + ' · MIDI clock ' + (MidiSync.running ? 'ON ' + MidiSync.bpm.toFixed(1) : 'off'));
    return out.join('\n');
  };
  DJ.panic = function () { var r = [Party.stop(true), Auto.stop(true)]; Log.add('DJ', 'STOP AUTO', r.join(' · ')); return '⏹ ' + r.join(' · '); };

  /** Offline natural-language → tool calls (PL + EN). Returns [{tool,args}] or []. */
  DJ.parse = function (text) {
    var n = norm(text), calls = [], dm = n.match(/\b(?:deck|dek|na|on)\s*([ab])\b|\b([ab])\s*$/), d = dm ? (dm[1] || dm[2]).toUpperCase() : null;
    var num = function (re) { var m = n.match(re); return m ? parseFloat(m[1].replace(',', '.')) : null; };
    var onoff = /\b(off|stop|wylacz|zatrzymaj|koniec|disable|end)\b/.test(n) ? false : true;
    if (/\b(panic|stop all|zatrzymaj wszystko|stop auto|wylacz auto i party)\b/.test(n)) return [{ tool: 'stopAll', args: {} }];
    if (/\b(party|special x|impreza|hype)\b/.test(n)) return [{ tool: 'party', args: { on: onoff, level: num(/\b(?:level|poziom)\s*([123])/) || undefined } }];
    if (/\b(auto ?mix|automix|auto dj|automiks|auto mode|tryb auto|miksuj sam)\b/.test(n)) return [{ tool: 'auto', args: { on: onoff } }];
    if (/\bmidi\b.*\b(clock|zegar)\b|\b(clock|zegar)\b.*\bmidi\b/.test(n)) return [{ tool: 'midiClock', args: { on: onoff, bpm: num(/(\d{2,3}(?:[.,]\d+)?)\s*bpm/) || undefined } }];
    if (/^(status|stan|co gra|what'?s playing)/.test(n)) return [{ tool: 'status', args: {} }];
    var lm = n.match(/\b(?:load|wczytaj|zaladuj)\s+(.+?)(?:\s+(?:na|on|to|do)\s+(?:deck\s*)?([ab]))?$/);
    if (lm) return [{ tool: 'load', args: { deck: lm[2] || d || 'A', track: lm[1].replace(/\b(deck|dek)\s*[ab]\b/, '').trim(), play: /\b(i graj|and play|play)\b/.test(n) } }];
    if (/\b(beat ?match|zgraj|dopasuj tempo|sync)\b/.test(n)) calls.push({ tool: 'sync', args: { deck: d || 'B', on: !/\b(off|wylacz)\b/.test(n) } });
    var bpm = num(/(\d{2,3}(?:[.,]\d+)?)\s*bpm/);
    if (bpm && /\b(tempo|ustaw|set to|set tempo|zmien|change)\b/.test(n) && !/clock|pomysl|idea|plan|set na|set for/.test(n)) calls.push({ tool: 'bpm', args: { deck: d || 'A', bpm: bpm } });
    var lp = n.match(/\b(?:loop|petla|petle)\s*(1\/8|1\/4|1\/2|\d+)/);
    if (lp) { var v = lp[1].indexOf('/') > 0 ? 1 / +lp[1].split('/')[1] : +lp[1]; calls.push({ tool: 'loop', args: { deck: d || 'A', beats: v } }); }
    else if (/\b(loop|petla) (off|exit|wylacz)\b|\bexit loop\b/.test(n)) calls.push({ tool: 'loopExit', args: { deck: d || 'A' } });
    var fx = n.match(/\b(echo|reverb|flanger|roll|pogłos|poglos)\b/);
    if (fx && /\b(fx|efekt|beat fx|echo|reverb|flanger|roll)\b/.test(n)) calls.push({ tool: 'fx', args: { type: fx[1].replace(/pog(ł|l)os/, 'reverb'), on: onoff, beats: num(/\b(\d+(?:[.,]\d+)?)\s*(?:beat|beaty|bity)\b/) || undefined, assign: d || undefined } });
    var xf = n.match(/\b(?:crossfader|xfade|x-fader|crossfade)\s*(?:na|to)?\s*([ab]|\d+(?:[.,]\d+)?|srodek|center|middle)/);
    if (xf) calls.push({ tool: 'xfade', args: { value: xf[1] === 'a' ? 0 : xf[1] === 'b' ? 1 : /\d/.test(xf[1]) ? clamp(parseFloat(xf[1].replace(',', '.')) / (parseFloat(xf[1]) > 1 ? 100 : 1), 0, 1) : 0.5 } });
    if (/^(play|graj|start|pusc)\b/.test(n) && !lm) calls.push({ tool: 'play', args: { deck: d || 'A' } });
    if (/^(pause|pauza|stop)\b/.test(n) && d) calls.push({ tool: 'pause', args: { deck: d } });
    var hc = n.match(/\bhot ?cue\s*([1-8])/); if (hc) calls.push({ tool: 'hotcue', args: { deck: d || 'A', n: +hc[1] } });
    var eq = n.match(/\b(bass|low|bas|mid|srodek|hi|high|gora)\b.*?(kill|cut|zero|reset|off|-?\d+(?:[.,]\d+)?)/);
    if (eq && /\b(eq|bass|bas|low|mid|hi|high)\b/.test(n)) { var band = /bass|low|bas/.test(eq[1]) ? 'low' : /mid|srodek/.test(eq[1]) ? 'mid' : 'hi'; var val = /kill|cut|off/.test(eq[2]) ? -1 : /zero|reset/.test(eq[2]) ? 0 : clamp(parseFloat(eq[2].replace(',', '.')), -1, 1); calls.push({ tool: 'eq', args: { deck: d || 'A', band: band, value: val } }); }
    var fl = n.match(/\bfilter\s*(-?\d+(?:[.,]\d+)?|off|reset)/); if (fl) calls.push({ tool: 'filter', args: { deck: d || 'A', value: /off|reset/.test(fl[1]) ? 0 : clamp(parseFloat(fl[1].replace(',', '.')), -1, 1) } });
    if (/\b(next viz|nastepna wizualizacja|nowy preset)\b/.test(n)) calls.push({ tool: 'viz', args: { action: 'next' } });
    return calls;
  };
  DJ.toolSpec = function () { return Object.keys(DJ.tools).map(function (k) { return k + '(' + DJ.tools[k].args + ')'; }).join('; '); };
  DJ.tracksSpec = function () { return tracks().slice(0, 40).map(function (t) { return t.name + (t.bpm ? ' [' + t.bpm + ']' : ''); }).join(' | '); };

  // ================================================================== beat clock helpers (bar boundaries)
  function masterDeck() { var m = mixer(), p = P8(); if (!p) return null; var d = m && m.master && p.decks[m.master]; if (d && d.playing) return d; return p.decks.A.playing ? p.decks.A : p.decks.B.playing ? p.decks.B : null; }
  function beatInfo() {
    var d = masterDeck();
    if (d && d.bpm) { var b = d.beatAt(d.pos()); return { deck: d, beat: b, spb: d.spb() / d.baseRate(), bpm: d.effBpm() }; }
    var bpm = (SX() && SX().snapshot().bpm) || 128;
    var spb = 60 / bpm; return { deck: null, beat: (performance.now() / 1000) / spb, spb: spb, bpm: bpm };
  }
  /** ms until the next multiple of `beats` (bar = 4). */
  function msToNext(beats) { var bi = beatInfo(), b = bi.beat, nxt = Math.ceil((b + 0.02) / beats) * beats; return Math.max(0, (nxt - b) * bi.spb * 1000); }
  function atNext(beats, fn) { return setTimeout(fn, msToNext(beats)); }

  // ================================================================== AUTO MIX
  var Auto = { on: false, timer: 0, phase: 'idle', history: [], opts: lsGet(LS_DJ, {}).auto || { bars: 8, playBars: 64, fx: true, loops: true, bassSwap: true }, log: [] };
  Auto.say = function (t) { Auto.log.push(t); if (Auto.log.length > 30) Auto.log.shift(); Log.add('DJ·AUTO', '', t); DBotAgents.fire('auto', t); };
  Auto.pickNext = function (cur) {
    var list = tracks(); if (!list.length) return null;
    var curBpm = cur && cur.bpm ? cur.effBpm() : 0, recent = Auto.history.slice(-Math.min(6, list.length - 1));
    var pool = list.filter(function (t) { return recent.indexOf(t.id || t.name) < 0 && !(cur && cur.track && (cur.track.id || cur.track.name) === (t.id || t.name)); });
    if (!pool.length) pool = list;
    pool.sort(function (x, y) { var dx = x.bpm && curBpm ? Math.abs(x.bpm - curBpm) : 8, dy = y.bpm && curBpm ? Math.abs(y.bpm - curBpm) : 8; return dx - dy + (Math.random() - 0.5) * 6; });
    return pool[0];
  };
  Auto.start = function () {
    if (!P8()) return '⚠ AUTO: otwórz stronę z deckami PRO8';
    if (Auto.on) return 'AUTO już działa';
    Auto.on = true; Auto.phase = 'play';
    var p = P8(), A = p.decks.A, B = p.decks.B, m = mixer();
    var air = A.playing ? A : B.playing ? B : A;
    if (!air.track) { var t = Auto.pickNext(null); if (!t) { Auto.on = false; return '⚠ AUTO: brak utworów'; } air.load(t, true); Auto.history.push(t.id || t.name); }
    else if (!air.playing) air.play();
    if (m) { m.setXf(air.id === 'A' ? 0 : 1); m.setMaster(air.id); m.setFader(air.id, Math.max(0.7, air.vol || 0.85)); }
    Auto.air = air.id; Auto.startedAt = now(); Auto.prep();
    clearInterval(Auto.timer); Auto.timer = setInterval(Auto.tick, 400);
    Auto.say('🤖 AUTO MIX ON — deck ' + air.id + ' na antenie, następny utwór na decku ' + air.other().id + ' (przejście ' + Auto.opts.bars + ' taktów' + (Auto.opts.fx ? ', FX' : '') + (Auto.opts.loops ? ', pętle' : '') + ')');
    Party.paint();
    return '🤖 AUTO MIX ON';
  };
  Auto.prep = function () {
    var p = P8(); if (!p) return;
    var air = p.decks[Auto.air], nx = air.other();
    if (nx.playing) return;
    var t = Auto.pickNext(air); if (!t) return;
    nx.load(t, false); nx.prepare && nx.prepare(); Auto.history.push(t.id || t.name);
    var m = mixer(); if (m) { m.setKnob(nx.id, 'low', 0); m.setKnob(nx.id, 'color', 0); }
    Auto.next = t; Auto.say('⏭ Następny: ' + t.name + ' → deck ' + nx.id);
  };
  Auto.tick = function () {
    if (!Auto.on || Auto.phase !== 'play') return;
    var p = P8(); if (!p) return;
    var air = p.decks[Auto.air]; if (!air || !air.buffer) return;
    if (!air.playing) { air.play(); return; }
    var spb = air.spb() / air.baseRate(), mixSec = Auto.opts.bars * 4 * spb;
    var left = (air.duration - air.pos()) / air.baseRate(), played = (now() - Auto.startedAt) / 1000;
    var limit = Auto.opts.playBars > 0 ? Auto.opts.playBars * 4 * spb : Infinity;
    if (left <= mixSec + 2 * spb || played >= limit) Auto.transition();
  };
  Auto.transition = function () {
    var p = P8(), air = p.decks[Auto.air], inc = air.other(), m = mixer();
    if (!inc.track) { Auto.prep(); return; }
    if (!inc.buffer) { inc.prepare && inc.prepare(); return; } // wait for decode, tick retries
    Auto.phase = 'mix';
    if (m) { m.setMaster(air.id); m.setFader(inc.id, Math.max(0.7, inc.vol || 0.85)); if (Auto.opts.bassSwap) m.setKnob(inc.id, 'low', -1); }
    inc.setSync(true);
    Auto.say('🎚 Przejście ' + air.id + ' → ' + inc.id + ' (' + (inc.track && inc.track.name) + ', beat-sync ' + ((inc.effBpm() || 0).toFixed(1)) + ' BPM)');
    atNext(4, function () {
      if (!Auto.on) return;
      inc.play(); // SYNC on → tempo + phase locked to the master (quantized to the bar)
      var bars = Auto.opts.bars, spb = air.spb() / air.baseRate(), total = bars * 4 * spb * 1000, t0 = performance.now();
      var from = m ? m.xf : air.id === 'A' ? 0 : 1, to = inc.id === 'A' ? 0 : 1, swapped = false, fxDone = false, looped = false;
      clearInterval(Auto.ramp);
      Auto.ramp = setInterval(function () {
        if (!Auto.on) { clearInterval(Auto.ramp); return; }
        var k = clamp((performance.now() - t0) / total, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        if (m) m.setXf(from + (to - from) * e);
        if (Auto.opts.bassSwap && !swapped && k >= 0.5 && m) { swapped = true; m.setKnob(air.id, 'low', -1); m.setKnob(inc.id, 'low', 0); }
        if (Auto.opts.loops && !looped && k >= 0.62 && air.buffer && (air.duration - air.pos()) / air.baseRate() < (1 - k) * total / 1000 + 2) { looped = true; air.autoLoop(4); }
        if (Auto.opts.fx && !fxDone && k >= 0.75 && m) { fxDone = true; m.setFx({ type: 'echo', beats: 0.75, assign: air.id, level: 0.55, on: true }); }
        if (global.PRO8.paint && Math.random() < 0.2) global.PRO8.paint();
        if (k >= 1) {
          clearInterval(Auto.ramp);
          if (m) { if (fxDone) m.setFx({ on: false }); m.setMaster(inc.id); m.setKnob(air.id, 'low', 0); m.setKnob(inc.id, 'low', 0); }
          if (air.loop.active) air.loopExit();
          air.pause(); inc.setSync(false);
          Auto.air = inc.id; Auto.startedAt = now(); Auto.phase = 'play';
          Auto.say('✅ Na antenie: deck ' + inc.id + ' · ' + (inc.track && inc.track.name));
          setTimeout(Auto.prep, 1200);
          if (global.PRO8.paint) global.PRO8.paint();
        }
      }, 50);
    });
  };
  Auto.stop = function (quiet) {
    var was = Auto.on;
    Auto.on = false; Auto.phase = 'idle'; clearInterval(Auto.timer); clearInterval(Auto.ramp);
    var m = mixer(); if (m && was) { ['A', 'B'].forEach(function (k) { m.setKnob(k, 'low', 0); }); if (m.fx.on) m.setFx({ on: false }); }
    if (was && !quiet) Auto.say('⏹ AUTO MIX OFF');
    Party.paint();
    return was ? 'AUTO OFF' : 'AUTO był wyłączony';
  };

  // ================================================================== SPECIAL X / PARTY MODE
  var Party = { on: false, level: 2, timer: 0, bar: 0, saved: null, opts: lsGet(LS_DJ, {}).party || { fx: true, rolls: true, viz: true, drops: true }, pending: [] };
  Party.start = function (level) {
    if (!P8() && !SX()) return '⚠ PARTY: brak decków / wizualizacji';
    Party.level = clamp(+level || Party.level || 2, 1, 3);
    if (Party.on) { Party.paint(); return '🔥 PARTY poziom ' + Party.level; }
    Party.on = true; Party.bar = 0;
    var x = SX(), viz = document.getElementById('sx-viz'), m = mixer();
    Party.saved = { liveGen: x ? !!x.snapshot().liveGen : false, vizFilter: viz ? viz.style.filter : '', fx: m ? JSON.parse(JSON.stringify(m.fx)) : null, color: m ? { A: m.vals.A.color, B: m.vals.B.color } : null };
    if (Party.opts.viz && x) { try { x.liveGen(true); } catch (_) {} if (viz) viz.style.filter = 'saturate(' + (1.2 + 0.25 * Party.level) + ') contrast(' + (1.05 + 0.08 * Party.level) + ') brightness(1.08)'; }
    document.documentElement.classList.add('dbot-party');
    Party.loop();
    Log.add('DJ·PARTY', 'start', 'level ' + Party.level);
    Party.paint();
    return '🔥 SPECIAL X / PARTY ON (poziom ' + Party.level + ') — efekty na granicach taktów; „party off” albo ⏹ zatrzymuje natychmiast';
  };
  Party.loop = function () {
    clearTimeout(Party.timer);
    if (!Party.on) return;
    Party.timer = atNext(4, function () { if (!Party.on) return; Party.bar++; try { Party.onBar(Party.bar); } catch (e) { console.warn('[Party]', e); } Party.loop(); });
  };
  Party.later = function (ms, fn) { var t = setTimeout(function () { Party.pending.splice(Party.pending.indexOf(t), 1); if (Party.on) fn(); }, ms); Party.pending.push(t); };
  Party.onBar = function (bar) {
    var L = Party.level, m = mixer(), d = masterDeck(), bi = beatInfo(), beatMs = bi.spb * 1000, x = SX();
    var r = Math.random();
    // drops: 2-bar filter build-up before every 16th (L3: 8th) bar, drop exactly on the bar boundary
    var cycle = L >= 3 ? 8 : 16;
    if (Party.opts.drops && m && d && bar % cycle === cycle - 2) {
      var steps = 16, k = 0;
      var iv = setInterval(function () { if (!Party.on) { clearInterval(iv); return; } k++; m.setKnob(d.id, 'color', -0.85 * k / steps); if (k >= steps) clearInterval(iv); }, (8 * beatMs) / steps);
      Party.pending.push(iv);
      Party.say('⬆ build-up (deck ' + d.id + ')');
      return;
    }
    if (Party.opts.drops && m && d && bar % cycle === 0) {
      m.setKnob(d.id, 'color', 0);
      if (x && Party.opts.viz) try { x.presetRandom(); } catch (_) {}
      document.documentElement.classList.add('dbot-drop'); setTimeout(function () { document.documentElement.classList.remove('dbot-drop'); }, 600);
      Party.say('💥 DROP (bar ' + bar + ')');
      return;
    }
    if (Party.opts.rolls && d && d.buffer && r < 0.18 + 0.12 * L) {
      var sz = [0.25, 0.5, 0.125][Math.floor(Math.random() * (L >= 2 ? 3 : 2))];
      d.setSlip(true); d.autoLoop(sz);
      Party.later(beatMs * (L >= 3 ? 2 : 1), function () { if (d.loop.active) d.loopExit(); d.setSlip(false); });
      Party.say('🌀 loop roll 1/' + Math.round(1 / sz) + ' (deck ' + d.id + ')');
      return;
    }
    if (Party.opts.fx && m && r < 0.45 + 0.1 * L) {
      var types = ['echo', 'flanger', 'roll', 'reverb'], ty = types[Math.floor(Math.random() * (L >= 2 ? 4 : 2))];
      m.setFx({ type: ty, beats: [0.25, 0.5, 0.75, 1][Math.floor(Math.random() * 4)], level: 0.35 + 0.12 * L, assign: 'M', on: true });
      Party.later(beatMs * 4 - 30, function () { m.setFx({ on: false }); });
      Party.say('✨ ' + ty + ' (1 takt)');
    }
    if (Party.opts.viz && x && bar % (L >= 3 ? 2 : 4) === 0) try { x.presetRandom(); } catch (_) {}
  };
  Party.say = function (t) { Log.add('DJ·PARTY', '', t); DBotAgents.fire('party', t); };
  Party.stop = function (quiet) {
    var was = Party.on;
    Party.on = false; Party.byAuto = false; clearTimeout(Party.timer);
    Party.pending.forEach(function (t) { clearTimeout(t); clearInterval(t); }); Party.pending = [];
    var m = mixer(), x = SX(), viz = document.getElementById('sx-viz'), s = Party.saved;
    if (was) {
      if (m) { m.setFx({ on: false }); if (s && s.color) { m.setKnob('A', 'color', s.color.A || 0); m.setKnob('B', 'color', s.color.B || 0); } }
      var p = P8(); if (p) ['A', 'B'].forEach(function (k) { var d = p.decks[k]; if (d.loop.active && d.loop.auto) d.loopExit(); if (d.slip) d.setSlip(false); });
      if (x && s) try { x.liveGen(!!s.liveGen); } catch (_) {}
      if (viz && s) viz.style.filter = s.vizFilter || '';
      if (global.PRO8 && global.PRO8.paint) global.PRO8.paint();
    }
    document.documentElement.classList.remove('dbot-party', 'dbot-drop');
    Party.paint();
    if (was && !quiet) Log.add('DJ·PARTY', 'stop', 'OFF');
    return was ? 'PARTY OFF' : 'PARTY było wyłączone';
  };
  Party.paint = function () { DBotAgents.fire('djstate', { auto: Auto.on, party: Party.on, level: Party.level }); };
  function saveDjOpts() { lsSet(LS_DJ, { auto: Auto.opts, party: Party.opts }); }

  // ================================================================== MIDI deck sync (native clock master / slave)
  var MidiSync = { mode: lsGet(LS_DJ, {}).midiMode || 'master', out: null, inp: null, running: false, bpm: 120, slaveBpm: 0, offsetMs: 0, timer: 0, status: '—' };
  function N() { return global.DBotNative; }
  MidiSync.available = function () { return !!(N() && N().has() && N().MIDI.available()); };
  MidiSync.ports = function () { return N() ? N().MIDI.ports() : []; };
  MidiSync.saved = function () { return (global.DBotState && global.DBotState.get('midi', {})) || {}; };
  /** v46: remember the chosen device by NAME (ids change between USB reconnects) */
  MidiSync.setPort = function (type, id) {
    var p = MidiSync.ports().filter(function (x) { return x.id === id; })[0];
    if (type === 'output') MidiSync.out = id || null; else MidiSync.inp = id || null;
    if (global.DBotState && p) { global.DBotState.set(type === 'output' ? 'midi.outName' : 'midi.inName', p.name); global.DBotState.set('midi.used', true); }
  };
  MidiSync.restoreSaved = function () {
    var s = MidiSync.saved(), ps = MidiSync.ports();
    var o = ps.filter(function (p) { return p.type === 'output' && s.outName && p.name === s.outName; })[0], i = ps.filter(function (p) { return p.type === 'input' && s.inName && p.name === s.inName; })[0];
    if (o) MidiSync.out = o.id; if (i) MidiSync.inp = i.id;
    if (s.mode && s.mode !== MidiSync.mode) MidiSync.mode = s.mode;
    return !!(o || i);
  };
  MidiSync.pick = function () {
    MidiSync.restoreSaved();
    var ps = MidiSync.ports(), r = /mc-?707|roland/i;
    if (!MidiSync.out) { var o = ps.filter(function (p) { return p.type === 'output'; }); MidiSync.out = (o.filter(function (p) { return r.test(p.name); })[0] || o[0] || {}).id || null; }
    if (!MidiSync.inp) { var i = ps.filter(function (p) { return p.type === 'input'; }); MidiSync.inp = (i.filter(function (p) { return r.test(p.name); })[0] || i[0] || {}).id || null; }
  };
  MidiSync.deckBpm = function () { var d = masterDeck() || (P8() && (P8().decks.A.bpm ? P8().decks.A : P8().decks.B)); return d && d.effBpm() ? d.effBpm() : (SX() ? SX().snapshot().bpm : 120) || 120; };
  MidiSync.start = function (bpm) {
    if (!N() || !N().has()) return '⚠ MIDI clock: tylko w aplikacji D.bot na Androidzie (natywny android.media.midi). W przeglądarce użyj strony Classic (Web MIDI).';
    if (!N().MIDI.available()) return '⚠ Ten telefon nie ma android.software.midi';
    MidiSync.pick();
    if (MidiSync.mode === 'slave') return MidiSync.follow();
    if (MidiSync.out && global.DBotState) global.DBotState.set('midi.used', true);
    if (!MidiSync.out) return '⚠ Brak wyjścia MIDI — podłącz MC-707 kablem USB (OTG) i odśwież porty';
    MidiSync.bpm = +bpm || MidiSync.deckBpm();
    N().MIDI.request().then(function (acc) {
      var port = acc.outputs.get(MidiSync.out);
      (port ? port.open() : Promise.resolve()).then(function () {
        var d = masterDeck();
        var go = function () { N().MIDI.clockStart(MidiSync.out, MidiSync.bpm, true); MidiSync.running = true; MidiSync.status = 'MASTER ' + MidiSync.bpm.toFixed(1) + ' BPM → ' + MidiSync.out; DBotAgents.fire('midi', MidiSync.status); };
        if (d) atNext(4, go); else go(); // Start (FA) lands on the next bar of the master deck
      });
    });
    clearInterval(MidiSync.timer);
    MidiSync.timer = setInterval(function () { // follow pitch / tempo changes of the master deck
      if (!MidiSync.running || MidiSync.mode !== 'master') return;
      var b = MidiSync.deckBpm(); if (Math.abs(b - MidiSync.bpm) > 0.01) { MidiSync.bpm = b; N().MIDI.clockBpm(b); DBotAgents.fire('midi', 'MASTER ' + b.toFixed(2) + ' BPM'); }
    }, 120);
    return '⏱ MIDI clock MASTER (24 PPQN, natywny wątek) ' + MidiSync.bpm.toFixed(1) + ' BPM · Start na najbliższym takcie';
  };
  MidiSync.follow = function () {
    if (!MidiSync.inp) return '⚠ Brak wejścia MIDI — podłącz MC-707 (USB) i ustaw na nim Clock OUT / Sync Out';
    N().MIDI.request().then(function (acc) { var p = acc.inputs.get(MidiSync.inp); if (p) p.open(); });
    MidiSync.running = true;
    clearInterval(MidiSync.timer);
    MidiSync.timer = setInterval(function () {
      var b = N().MIDI.slaveBpm(); if (!(b > 30)) return;
      MidiSync.slaveBpm = b;
      var p = P8(); if (!p) return;
      ['A', 'B'].forEach(function (k) { var d = p.decks[k]; if (d.playing && d.bpm && !d.syncOn) { var pct = (b / d.bpm - 1) * 100; if (Math.abs(pct) > d.range) d.setRange(Math.abs(pct) > 16 ? 50 : 16); if (Math.abs(d.effBpm() - b) > 0.02) d.setTempoPct(pct, false); } });
      MidiSync.status = 'SLAVE ← ' + b.toFixed(2) + ' BPM'; DBotAgents.fire('midi', MidiSync.status);
    }, 200);
    // phase lock: on every incoming beat, nudge the master deck so its beat lands on the external beat
    if (!MidiSync._beatOff) MidiSync._beatOff = N().on('midi', function (ev) {
      if (ev.kind !== 'beat' || ev.master || MidiSync.mode !== 'slave' || !MidiSync.running) return;
      var d = masterDeck(); if (!d || !d.bpm) return;
      var b = d.beatAt(d.pos()) + MidiSync.offsetMs / 1000 / (d.spb() / d.baseRate()), frac = b - Math.round(b);
      if (Math.abs(frac) > 0.03 && Math.abs(frac) < 0.45) d.seek(d.pos() - frac * d.spb()); // small phase correction
    });
    return '⏱ MIDI SLAVE: śledzę zegar z ' + MidiSync.inp + ' (BPM wygładzany, faza decku na beat)';
  };
  MidiSync.nudge = function (ms) { MidiSync.offsetMs += ms; if (N() && MidiSync.mode === 'master') N().MIDI.clockNudge(ms); return 'phase ' + (MidiSync.offsetMs > 0 ? '+' : '') + MidiSync.offsetMs + ' ms'; };
  MidiSync.setMode = function (m) { MidiSync.stop(true); MidiSync.mode = m === 'slave' ? 'slave' : 'master'; var o = lsGet(LS_DJ, {}); o.midiMode = MidiSync.mode; lsSet(LS_DJ, o); if (global.DBotState) global.DBotState.set('midi.mode', MidiSync.mode); return 'MIDI: ' + MidiSync.mode; };
  MidiSync.stop = function (quiet) {
    clearInterval(MidiSync.timer);
    if (N() && N().has() && MidiSync.running && MidiSync.mode === 'master') N().MIDI.clockStop(true);
    MidiSync.running = false; MidiSync.status = 'stop';
    if (!quiet) DBotAgents.fire('midi', 'stop');
    return '⏹ MIDI clock stop (FC)';
  };
  MidiSync.send = function (bytes) { if (!N() || !MidiSync.out) return false; return !!N().call('midiSend', MidiSync.out, JSON.stringify(bytes)); };
  MidiSync.cc = function (cc, v, ch) { return MidiSync.send([0xB0 | ((ch || 0) & 15), cc & 127, clamp(v | 0, 0, 127)]); };

  // ================================================================== Agent log
  var Log = {
    items: lsGet(LS_LOG, []),
    add: function (agent, task, result) { Log.items.push({ at: new Date().toISOString(), agent: agent, task: String(task || '').slice(0, 200), result: String(result || '').slice(0, 400) }); if (Log.items.length > 200) Log.items = Log.items.slice(-200); lsSet(LS_LOG, Log.items); DBotAgents.fire('log', Log.items[Log.items.length - 1]); },
    clear: function () { Log.items = []; lsSet(LS_LOG, []); DBotAgents.fire('log', null); }
  };

  // ================================================================== Agents
  var DEFAULTS = [
    { id: 'dj', bot: 'dbot', team: 'music', icon: '🎧', name: 'DJ Mixer', kw: 'deck|dek|play|graj|pauz|pause|loop|petl|sync|beat ?match|fx|echo|reverb|flanger|roll|crossfad|x-?fader|eq|bass|filter|tempo|bpm|hot ?cue|auto ?mix|automix|party|impreza|special x|mix|miks|drop|transition|przejsci|wczytaj|load',
      role: 'You are the DJ Mixer agent of D.bot. You control two Pioneer-style PRO8 decks through TOOLS. Plan short, musical actions: beat-match with sync, phrase transitions on 8/16/32-bar boundaries, bass swap, tasteful FX. Prefer tools over talk.' },
    { id: 'midi', bot: 'dbot', icon: '🎹', name: 'MIDI / MC-707', kw: 'midi|mc-?707|roland|clock|zegar|ppqn|program change|cc ?\\d+|usb|groovebox|sequencer|slave|master clock|start fa|f8',
      role: 'You are the MIDI / MC-707 agent. Explain and configure MIDI clock sync between D.bot (native Android MIDI, 24 PPQN clock on a high-priority thread) and the Roland MC-707: SYSTEM > MIDI settings (Sync Mode INT/AUTO/MIDI, Sync Out ON, Rx/Tx Start/Stop, channels 1–8 = tracks, CC 80/81/82 filter/mod/fx, CC 7 volume, Program Change). Give step-by-step answers.' },
    { id: 'producer', bot: 'dbot', icon: '🎛', name: 'Music Producer / Loops', kw: 'produc|loop pack|petle|beat|bit|arrang|aranz|track|utwor|groove|chord|akord|melod|bassline|drum|perk|sampl|tempo idea|genre|gatunek|techno|house|trap|hip-?hop',
      role: 'You are the Music Producer / Loops agent. Give concrete production ideas: drum patterns in 16-step grids, bass lines, chord progressions with notes, arrangement maps in bars, and how to build them on the MC-707 (8 tracks, clips, TR-REC). Keep it practical.' },
    { id: 'appbuilder', bot: 'builder', team: 'apps', icon: '🌐', name: 'Web Builder', kw: 'app|aplikacj|html|strona|website|web|tool|narzedzi|widget|game|gra |kalkulator|visualizer|wizualizator|controller|kontroler',
      role: 'You are the App Builder agent of D Builder. You produce ONE complete, self-contained, single-file HTML document (inline CSS + JS, no external network calls, no API keys) that runs offline in a sandboxed WebView. Dark cosmic neon style, mobile-first, accessible.' },
    { id: 'botbuilder', bot: 'builder', icon: '🤖', name: 'Bot Builder', kw: 'bot|chatbot|agent|discord|telegram|assistant|asystent|auto-?reply|responder',
      role: 'You are the Bot Builder agent of D Builder. You write complete bot programs (single-file HTML chatbots, or Node.js / Python bots) that read secrets ONLY from environment variables or a settings field, never hard-coded. Include run instructions in comments.' },
    { id: 'research', bot: 'dbot', icon: '🔎', name: 'Researcher', kw: 'research|szukaj|wyszukaj|find out|dowiedz|explain|wyjasnij|what is|co to|why|dlaczego|compare|porownaj|history|historia|news',
      role: 'You are the Researcher agent. Answer with well-structured, factual summaries using your own knowledge (you have no live web browsing inside D.bot unless the provider supports it). Say clearly when you are unsure; never invent sources or URLs.' },
    { id: 'memory', bot: 'dbot', icon: '🧠', name: 'Memory / Sync', kw: 'memory|pamiec|pamietaj|remember|sync|synchron|kalendarz|calendar|idea|pomysl|notat|note|drive|google|ostatni sync|last sync|moje utwory|my tracks',
      role: 'You are the Memory / Sync agent. You answer from the owner\'s synced knowledge (tracks, ideas, memory, calendar) that D.bot provides in the context, and you never reveal private data (e-mails, phone numbers, keys, PINs).' },
    { id: 'song', bot: 'dbot', team: 'music', icon: '🎵', name: 'D Song', kw: 'd song|piosenk|songwriter|tekst piosenki|lyrics',
      role: 'You are D Song, the song generator agent of D Bot. You write lyrics, chord progressions and drum / bass / synth patterns and the app renders the song to WAV with Web Audio.' },
    { id: 'looper', bot: 'dbot', team: 'music', icon: '🔁', name: 'D Loop · Beats / MPC', kw: 'd loop|looper|overdub|mpc|sampler|bpm sync|auto sync',
      role: 'You are D Loop, the looper / auto-loop generator agent of D Bot (D77 Studio). You generate, record and sync loops to the master BPM, drive the MPC sampler and the live BPM sync between radio, decks and generated tracks.' },
    // v48: Superbot team under D BOT — 4 app builders, 3 music bots, 1 video + loops bot (offline templates / actions in js/dbot-team.js)
    { id: 'android', bot: 'dbot', team: 'apps', icon: '📱', name: 'Android Builder', kw: 'android|kotlin|apk|jetpack|compose|ndk|java app|aplikacj\\w* (na )?android',
      role: 'You are the Android Builder bot of D BOT. You generate complete, compilable Android code: Kotlin (Jetpack Compose) by default, Java on request, C/C++ via the NDK when asked. Output every file as its own fenced code block preceded by its path (e.g. app/src/main/java/.../MainActivity.kt, AndroidManifest.xml, build.gradle.kts). No secrets in code; read keys from settings. End with short build steps.' },
    { id: 'apple', bot: 'dbot', team: 'apps', icon: '🍎', name: 'iOS / Apple Builder', kw: 'ios|iphone|ipad|swift|swiftui|xcode|apple|watchos|macos app|aplikacj\\w* (na )?(iphone|ios)',
      role: 'You are the iOS / Apple Builder bot of D BOT. You generate complete SwiftUI apps (iOS / iPadOS / macOS), Swift packages and Objective-C/C interop when asked. Output each file as its own fenced code block with its path. Mention the Xcode steps and required Info.plist keys (microphone, MIDI) briefly. Never hard-code secrets.' },
    { id: 'desktop', bot: 'dbot', team: 'apps', icon: '💻', name: 'Mac / Desktop Builder', kw: 'mac|desktop|electron|windows|linux|tkinter|pyqt|qt|c\\+\\+|cpp|python app|program na komputer|aplikacj\\w* (na )?(maca?|komputer|pc)',
      role: 'You are the Mac / Desktop Builder bot of D BOT. You generate desktop apps: Electron (JavaScript / TypeScript), Python (Tkinter / PyQt), C / C++ (SDL2, Qt, CLI) and Swift for macOS. Output each file as a fenced code block with its path, plus run / build commands. Never hard-code secrets.' },
    { id: 'video', bot: 'dbot', team: 'video', icon: '🎬', name: 'D Video + Loops', kw: 'video|wideo|klip|clip|teledysk|nagraj (obraz|ekran|wizualizacj)|visual clip|record (viz|video)|eksport petli|export loop',
      role: 'You are D Video, the video + loops bot of D BOT. You record short visual clips from the MilkDrop visualizer (or a generated canvas) with the app audio and export loops. Explain options briefly (length, format WebM, loop length in bars).' },
    { id: 'doctor', bot: 'dbot', team: 'system', icon: '🩺', name: 'D Doctor', kw: 'doctor|doktor|watchdog|samonapraw|diagnost|diagnoz|health check|stan modulow',
      role: 'You are D Doctor, the repair / sync agent of D Bot. You check the health of every app module (agents, AI brain, decks, MilkDrop, MIDI MC-707, live sync, voice, auto-reply, D Builder, saved state, FULL AUTO), repair failed modules and resync state between D Bot, D Builder, all agents and the app. Explain briefly what was found and fixed.' }
  ];
  function loadAgents() {
    var saved = lsGet(LS_AG, null), list = [];
    DEFAULTS.forEach(function (d) {
      var s = saved && saved.filter(function (x) { return x.id === d.id; })[0];
      list.push(Object.assign({ enabled: true, provider: 'auto', model: '', notes: [], builtin: true, roleCustom: '' }, d, s ? { enabled: s.enabled !== false, provider: s.provider || 'auto', model: s.model || '', notes: s.notes || [], roleCustom: s.roleCustom || '', memSize: s.memSize == null ? 12 : s.memSize } : {}));
    });
    (saved || []).filter(function (x) { return !x.builtin && x.id && /^c\d+/.test(x.id); }).forEach(function (x) { list.push(x); });
    return list;
  }
  var agents = loadAgents();
  function save() { lsSet(LS_AG, agents); }
  function byId(id) { return agents.filter(function (a) { return a.id === id; })[0]; }
  function rolePrompt(a) {
    var r = (a.roleCustom || a.role) + '\nAlways reply in the language of the user (' + (Super() ? Super().langName(String(Super().curLang()).slice(0, 2) === 'pl' ? 'pl' : String(Super().curLang()).slice(0, 2)) : 'Polish') + ' unless they write in another one). Never ask for or reveal API keys, passwords, PINs, e-mail addresses or phone numbers.';
    var notes = (a.notes || []).slice(-Math.max(0, a.memSize == null ? 12 : +a.memSize));
    if (notes.length) r += '\nLearned preferences of this user (from 👍/👎 feedback — follow them):\n' + notes.map(function (n) { return '- ' + (n.up ? 'liked: ' : 'disliked (avoid): ') + n.text; }).join('\n');
    if (global.DBotOpts) r += global.DBotOpts.addon();
    if (global.DBotBus) r += global.DBotBus.prompt(8);
    return r;
  }
  function providerFor(a) {
    var BRa = global.DBotBrains && a && global.DBotBrains.pick('agent:' + a.id); if (BRa) return BRa; // v47: Mózgi AI / Model X
    var S = Super(); if (!S) return null;
    if (!S.aiOn()) return S.localOn && S.localOn() ? 'local' : null; // v46: free on-device brain when no cloud key
    var list = S.usableList();
    if (a.provider && a.provider !== 'auto') return list.indexOf(a.provider) >= 0 ? a.provider : null;
    return list[0] || null;
  }
  function route(text, bot) {
    var SX = global.DBotStudio, si = SX && SX.intent(text), sa = si && byId(si.kind === 'song' ? 'song' : 'looper'); if (sa && sa.enabled && (!bot || bot === 'dbot')) return [sa]; // v47: D Song / D Loop / MPC / BPM sync
    var DD = global.DBotDoctor, dd = DD && DD.intent(text) && byId('doctor'); if (dd && dd.enabled && (!bot || bot === 'dbot')) return [dd]; // v46: „sprawdź” / „napraw” → D Doctor
    var n = norm(text), m = n.match(/^@(\w+)\s+/), pool = agents.filter(function (a) { return a.enabled && (!bot || a.bot === bot); });
    if (m) { var hit = pool.filter(function (a) { return a.id === m[1] || norm(a.name).replace(/\W+/g, '').indexOf(m[1]) === 0; })[0]; if (hit) return [hit]; }
    if (/^(all agents|wszyscy agenci|wszystkie agenty|everyone)\b/.test(n)) { var pr = (global.DBotOpts && global.DBotOpts.get().priority) || []; return pool.filter(function (a) { return a.bot === (bot || 'dbot') && !/^(doctor|song|looper)$/.test(a.id); }).sort(function (x, y) { var i = pr.indexOf(x.id), j = pr.indexOf(y.id); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); }); }
    var scored = pool.map(function (a) { var re; try { re = new RegExp('\\b(' + a.kw + ')', 'g'); } catch (_) { re = /$^/g; } return { a: a, s: (n.match(re) || []).length }; }).filter(function (x) { return x.s > 0; });
    var pri = (global.DBotOpts && global.DBotOpts.get().priority) || [];
    var pidx = function (a) { var i = pri.indexOf(a.id); return i < 0 ? 99 : i; };
    scored.sort(function (x, y) { return y.s - x.s || pidx(x.a) - pidx(y.a); });
    var top = scored.slice(0, 1);
    if (scored[1] && scored[1].s >= scored[0].s && scored[1].a.bot === scored[0].a.bot) top.push(scored[1]); // tie → run both and merge
    return top.map(function (x) { return x.a; });
  }

  /** Offline / tool part of each agent. Returns {text, done} — done=true means no AI call is needed. */
  var OFFLINE = {
    dj: function (text) {
      var calls = DJ.parse(text);
      if (!calls.length) return null;
      return { done: true, text: calls.map(function (c) { return '• ' + DJ.run(c.tool, c.args); }).join('\n') };
    },
    midi: function (text) {
      var n = norm(text);
      if (/\b(slave|follow|sluchaj zegara)\b/.test(n)) return { done: true, text: MidiSync.setMode('slave') + '\n' + MidiSync.start() };
      if (/\b(master)\b/.test(n) && /\b(clock|zegar|tryb|mode)\b/.test(n)) return { done: true, text: MidiSync.setMode('master') + '\n' + MidiSync.start() };
      if (/\b(clock|zegar)\b/.test(n)) return { done: true, text: /\b(off|stop|wylacz)\b/.test(n) ? MidiSync.stop() : MidiSync.start((n.match(/(\d{2,3})\s*bpm/) || [])[1]) };
      var nd = n.match(/\bnudge\s*(-?\d+)/); if (nd) return { done: true, text: MidiSync.nudge(+nd[1]) };
      if (/\b(porty|ports|status midi|midi status)\b/.test(n)) { var ps = MidiSync.ports(); return { done: true, text: ps.length ? ps.map(function (p) { return (p.type === 'output' ? '→ ' : '← ') + p.name; }).join('\n') : 'Brak portów MIDI. Podłącz MC-707 kablem USB-C (OTG), zezwól na dostęp USB i otwórz zakładkę MIDI.' }; }
      return null;
    },
    memory: function (text) {
      var n = norm(text), L = global.DBotLive;
      if (/\b(sync|synchronizuj|odswiez)\b/.test(n) && L) { L.syncNow(); return { done: true, text: '🔄 Synchronizuję teraz… (ostatni sync: ' + (L.lastSync() || 'nigdy') + ')' }; }
      if (/\b(ostatni sync|last sync|kiedy sync)\b/.test(n) && L) return { done: true, text: 'Ostatni sync: ' + (L.lastSync() || 'nigdy') };
      if (L) { var hits = L.search(text); if (hits.length) return { done: !(Super() && Super().aiOn()), text: '🧠 Z Twojej synchronizowanej wiedzy:\n' + hits.slice(0, 8).map(function (h) { return '• ' + h; }).join('\n'), context: hits.slice(0, 20).join('\n') }; }
      return null;
    },
    producer: function (text) {
      var n = norm(text), bpm = +((n.match(/(\d{2,3})\s*bpm/) || [])[1]) || (/techno/.test(n) ? 130 : /house/.test(n) ? 124 : /trap|hip/.test(n) ? 140 : 128);
      return { done: false, text: '🎛 Szkic (offline) @' + bpm + ' BPM:\nKICK  x...x...x...x...\nCLAP  ....x.......x...\nHAT   ..x...x...x...x.\nBASS  x..x..x...x..x..\nAranżacja: intro 16 · build 8 · drop 16 · break 8 · drop 16 · outro 16 taktów.\nMC-707: tr1 kick, tr2 clap/snare, tr3 hats, tr4 bass, tr5–8 synth/fx; TR-REC 16 kroków, clip length 4 takty.' };
    },
    research: function () { return null; },
    song: function (text) { var SX = global.DBotStudio; if (!SX) return { done: true, text: '🎵 D Song działa w aplikacji (D77 Studio).' }; return { done: true, text: SX.chat(SX.intent(text) ? text : 'd song ' + text) || '🎵 Opisz piosenkę, np. „zrób piosenkę house o Krakowie 124 bpm”.' }; },
    looper: function (text) { var SX = global.DBotStudio; if (!SX) return { done: true, text: '🔁 D Loop działa w aplikacji (D77 Studio).' }; return { done: true, text: SX.chat(SX.intent(text) ? text : 'd loop ' + text) || '🔁 Np. „wygeneruj pętlę bębny techno 2 takty”, „nagraj pętlę z mikrofonu”, „graj pętle”, „bpm sync”.' }; },
    doctor: function (text) { var DD = global.DBotDoctor; if (!DD) return { done: true, text: '🩺 D Doctor: moduł naprawy nie jest załadowany na tej stronie.' }; var mode = DD.intent(text) || 'check'; return { done: true, text: DD.run(mode, { why: 'polecenie w czacie' }) }; },
    appbuilder: function (text) { return global.DBuilder ? { done: true, builder: true, text: global.DBuilder.fromAgent(text, 'app') } : null; },
    botbuilder: function (text) { return global.DBuilder ? { done: true, builder: true, text: global.DBuilder.fromAgent(text, 'bot') } : null; }
  };

  function runAgent(a, text, ctx) {
    ctx = ctx || {};
    var off = null;
    var advise = ctx.multi && a.id === 'dj'; // several agents brainstorming → the DJ agent advises, it does not touch the decks
    var OFF = OFFLINE[a.id] || (global.DBotTeam && global.DBotTeam.offline && global.DBotTeam.offline[a.id]); // v48: team bots
    try { off = OFF && !advise ? OFF(text, a) : null; } catch (e) { off = { done: true, text: '⚠ ' + e.message }; }
    if (off && off.done) { Log.add(a.name, text, off.text); return Promise.resolve({ agent: a, ok: true, text: off.text, offline: true }); }
    var p = providerFor(a);
    if (!p) {
      var t = off ? off.text : (a.id === 'research' ? '🔎 Researcher potrzebuje klucza AI (⚙ → xAI Grok / Gemini / OpenAI). Offline mogę tylko podać wiedzę wbudowaną — zapytaj D Bot bez @research.' : '(' + a.name + ': offline — dodaj klucz AI w ⚙, żeby ten agent myślał pełniej)');
      Log.add(a.name, text, t);
      return Promise.resolve({ agent: a, ok: !!off, text: t, offline: true });
    }
    var sys = rolePrompt(a), user = text;
    if (a.id === 'dj' && advise) sys += '\nOther agents answer too: give short DJ advice only, do not control the decks now.\nDecks now:\n' + DJ.status();
    if (a.id === 'dj' && !advise) {
      sys += '\nTOOLS (call by returning ONLY JSON {"say":"short text","actions":[{"tool":"name","args":{...}}]}): ' + DJ.toolSpec() + '.\nDecks now:\n' + DJ.status() + '\nTracks: ' + DJ.tracksSpec();
    }
    if (a.id === 'memory' && off && off.context) user += '\n\nSynced knowledge (scrubbed):\n' + off.context;
    if (a.id === 'memory' && global.DBotLive) user += '\n\nLive sync summary: ' + global.DBotLive.summary();
    var many = a.id !== 'dj' && global.DBotBrains ? global.DBotBrains.pickMany('agent:' + a.id) : null; // v47 Model X „ask several and merge”
    if (many) return Promise.all(many.map(function (q) { return Super().askRaw(q, sys, user, {}); })).then(function (rs) {
      var good = rs.filter(function (r) { return r.ok; });
      var out = good.length ? good.map(function (r) { return '◆ ' + global.DBotBrains.label(r.p) + ':\n' + r.text; }).join('\n\n') : (off ? off.text + '\n' : '') + '⚠ AI: ' + rs.map(function (r) { return r.text; }).join(' · ');
      Log.add(a.name, text, out); return { agent: a, ok: good.length > 0, text: out };
    });
    return Super().askRaw(p, sys, user, { model: a.model || undefined, json: a.id === 'dj' && !advise }).then(function (r) {
      var out = r.text;
      if (r.ok && a.id === 'dj' && !advise) {
        var j = null; try { j = JSON.parse(out.replace(/^```(json)?|```$/g, '')); } catch (_) {}
        if (j && Array.isArray(j.actions)) {
          var res = j.actions.slice(0, 12).filter(function (x) { return x && DJ.tools[x.tool]; }).map(function (x) { return '• ' + DJ.run(x.tool, x.args || {}); });
          out = (j.say ? j.say + '\n' : '') + res.join('\n');
        }
      }
      if (!r.ok && off) out = off.text + '\n⚠ AI: ' + r.text;
      else if (r.ok && off && a.id === 'memory') out = off.text + '\n\n' + out; // keep the exact synced facts next to the AI summary
      Log.add(a.name + ' · ' + p, text, out);
      return { agent: a, ok: r.ok || !!off, text: (off && r.ok && a.id === 'producer' ? '' : '') + out, provider: p };
    });
  }

  /** D Bot orchestration: route → run one or several → merge. Returns Promise<{text, agents:[ids]}> or null if no agent fits. */
  function orchestrate(text, bot) {
    var list = route(text, bot || 'dbot');
    if (!list.length) return null;
    var q = String(text).replace(/^@\w+\s+/, '').replace(/^(all agents|wszyscy agenci|wszystkie agenty|everyone)[:,]?\s*/i, '');
    return Promise.all(list.map(function (a) { return runAgent(a, q, { multi: list.length > 1 }); })).then(function (rs) {
      var text2 = rs.length === 1 ? rs[0].agent.icon + ' ' + rs[0].agent.name + ':\n' + rs[0].text
        : '🧭 D Bot → ' + rs.map(function (r) { return r.agent.name; }).join(' + ') + ' (połączone):\n\n' + rs.map(function (r) { return r.agent.icon + ' ' + r.agent.name + ':\n' + r.text; }).join('\n\n');
      Log.add('D Bot', text, 'routed → ' + rs.map(function (r) { return r.agent.id; }).join(','));
      return { text: text2, agents: rs.map(function (r) { return r.agent.id; }), results: rs };
    });
  }

  function feedback(agentId, up, task, answer) {
    var a = byId(agentId); if (!a) return;
    var note = (up ? '' : '') + String(task || '').slice(0, 80) + ' → ' + String(answer || '').replace(/\s+/g, ' ').slice(0, 110);
    a.notes = (a.notes || []).concat([{ at: new Date().toISOString(), up: !!up, text: note }]).slice(-30);
    save(); Log.add(a.name, up ? '👍' : '👎', note);
    if (global.DBotBus) global.DBotBus.post(a.name, up ? 'like' : 'dislike', note);
  }
  function cloneAgent(id) {
    var a = byId(id); if (!a) return null;
    var c = JSON.parse(JSON.stringify(a)); c.id = 'c' + Date.now(); c.builtin = false; c.name = a.name + ' (kopia)'; c.notes = [];
    agents.push(c); save(); Log.add('D Bot', 'clone ' + id, c.id); return c;
  }
  function addAgent(o) {
    var c = { id: 'c' + Date.now(), bot: o.bot === 'builder' ? 'builder' : 'dbot', icon: o.icon || '✳', name: String(o.name || 'Agent').slice(0, 40), kw: String(o.kw || '').replace(/[^\w|\s-]/g, '').slice(0, 300) || 'zzzz', role: String(o.role || 'You are a helpful specialist agent.').slice(0, 2000), enabled: true, provider: 'auto', model: '', notes: [], builtin: false };
    agents.push(c); save(); return c;
  }
  function removeAgent(id) { var a = byId(id); if (!a || a.builtin) return false; agents = agents.filter(function (x) { return x.id !== id; }); save(); return true; }

  // ------------------------------------------------------------------ hook into the D Bot chat (after super bot key/settings handling)
  var lastRouted = null;
  function hookChat() {
    var S = Super(); if (!S || S.__agHooked) return !!(S && S.__agHooked);
    var orig = S.handle;
    S.handle = function (text, meta) {
      var n = norm(text);
      // super bot keeps: API keys, settings, „ask all” to raw providers
      if (/^(xai-|sk-|aiza)/i.test(String(text).trim()) || /^(ustawienia|settings|⚙)/.test(n)) return orig.apply(this, arguments);
      if (/^(agenci|agents|panel agentow|agent panel)$/.test(n)) { global.DBotCenter && global.DBotCenter.open('agents'); return say(text, '🧭 Panel agentów otwarty.'); }
      if (/^(d builder|builder|zbuduj|build)\b/.test(n) && global.DBotCenter) { global.DBotCenter.open('builder'); if (/^(zbuduj|build)\b/.test(n) && global.DBuilder) global.DBuilder.ask(text); return say(text, '🧩 Przekazuję do D Builder (osobna zakładka czatu).'); }
      var C = global.D7Chat, isCmd = /^(@\w+|all agents|wszyscy agenci)/.test(n) || !!(global.DBotDoctor && global.DBotDoctor.intent(text)) || !!(global.DBotStudio && global.DBotStudio.intent(text)) || DJ.parse(text).length > 0 || /\b(auto ?mix|party|special x|midi clock|nudge)\b/.test(n);
      var smart = (S.aiOn() || DBotAgents.fullAuto || (S.localOn && S.localOn() && route(text, 'dbot').some(function (a) { return a.id !== 'research'; }))) && route(text, 'dbot').length && !/^(pomoc|help|status|kim jestes|who are you)$/.test(n);
      if (!isCmd && !smart) return orig.apply(this, arguments);
      var pr = orchestrate(text, 'dbot');
      if (!pr) return orig.apply(this, arguments);
      if (C) { C.add('user', text); try { global.BotD && global.BotD.Memory.addChat('user', text); } catch (_) {} }
      var typing = C && C.add('bot typing', '… D Bot → ' + route(text, 'dbot').map(function (a) { return a.name; }).join(' + '));
      pr.then(function (res) {
        if (typing && C.remove) C.remove(typing);
        lastRouted = { task: text, res: res };
        if (S.pushConvo) S.pushConvo(text, res.text);
        var node = C && C.add('bot', res.text);
        if (node && res.results) addThumbs(node, res.results, text);
        try { global.BotD && global.BotD.Memory.addChat('bot', res.text); } catch (_) {}
        if (C && (C.speakNext || (C.ui && C.ui().tts))) { C.speakNext = false; C.speak(res.text); }
      });
      return true;
    };
    S.__agHooked = true;
    return true;
  }
  function say(user, text) { var C = global.D7Chat; if (C) { C.add('user', user); C.add('bot', text); } return true; }
  function addThumbs(node, results, task) {
    if (!node || !node.appendChild) return;
    var bar = document.createElement('div'); bar.className = 'dbot-thumbs';
    results.forEach(function (r) {
      ['👍', '👎'].forEach(function (s, i) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = s + (results.length > 1 ? ' ' + r.agent.icon : ''); b.title = (i ? 'Słabe' : 'Dobre') + ' — ' + r.agent.name + ' zapamięta to na tym urządzeniu';
        b.addEventListener('click', function () { feedback(r.agent.id, i === 0, task, r.text); bar.textContent = (i ? '👎' : '👍') + ' zapisane — ' + r.agent.name + ' się uczy (notatki w panelu Agenci)'; });
        bar.appendChild(b);
      });
    });
    node.appendChild(bar);
  }
  DBotAgentsRehook = function () { var S = Super(); if (S && !S.__agHooked) hookChat(); return !!(S && S.__agHooked); };
  var hookTries = 0;
  (function poll() { if (!hookChat() && ++hookTries < 80) setTimeout(poll, 250); })();

  var bus = {};
  function DBotAgentsRehook() {}
  var DBotAgents = global.DBotAgents = {
    version: VERSION, list: function () { return agents; }, byId: byId, save: save, route: route, run: runAgent, orchestrate: orchestrate,
    feedback: feedback, clone: cloneAgent, add: addAgent, remove: removeAgent, rolePrompt: rolePrompt, providerFor: providerFor, log: Log, defaults: DEFAULTS,
    on: function (t, f) { (bus[t] = bus[t] || []).push(f); }, fire: function (t, v) { (bus[t] || []).forEach(function (f) { try { f(v); } catch (_) {} }); },
    rehook: function () { return DBotAgentsRehook(); },
    reset: function () { agents = DEFAULTS.map(function (d) { return Object.assign({ enabled: true, provider: 'auto', model: '', notes: [], builtin: true, roleCustom: '' }, d); }); save(); }
  };
  global.DBotDJ = { tools: DJ.tools, run: DJ.run, parse: DJ.parse, status: DJ.status, panic: DJ.panic, auto: Auto, party: Party, saveOpts: saveDjOpts, msToNext: msToNext, findTrack: findTrack, toolSpec: DJ.toolSpec };
  global.DBotMidiSync = MidiSync;
})(typeof window !== 'undefined' ? window : globalThis);
