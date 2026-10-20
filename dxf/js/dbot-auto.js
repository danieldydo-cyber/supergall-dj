/*
 * D.bot v46 — „Super Bot D”: options, shared memory bus, start-all / sync-all, module dashboard, self-healing watchdog,
 * FULL AUTO mode with a decision log (viewable + undoable) and a big STOP, cosmic parallax background.
 *  • Every automatic action stays INSIDE the app (decks, FX, viz, MIDI clock, sync). Outside actions (auto-reply) keep their own
 *    opt-in + limits and are never switched on by AUTO.
 *  • Watchdog every 5 s: agents, decks, MilkDrop, MIDI, sync, voice, auto-reply service, D Builder, state store. A failing module is
 *    restarted alone (backoff 5 s → 5 min); JS errors are mapped to the module that threw; repairs go to the „Naprawy” log.
 * Loaded after dbot-center.js. window.DBotOpts, DBotBus, DBotModules, DBotFullAuto, DBotWatchdog.
 */
(function (global) {
  'use strict';
  var St = global.DBotState;
  function N() { return global.DBotNative; }
  function apk() { return !!(N() && N().has()); }
  function now() { return Date.now(); }
  function iso() { return new Date().toISOString(); }
  function sget(p, fb) { return St ? St.get(p, fb) : fb; }
  function sset(p, v) { return St ? St.set(p, v) : v; }

  // ================================================================== options (personality, length, voice, priority, memory, quick commands)
  var PERS = {
    calm: { label: '🌙 Calm', prompt: 'Personality: calm, warm, low-key; suggest smooth long blends; no hype.', party: 1 },
    party: { label: '🔥 Party', prompt: 'Personality: high-energy party hype, short punchy lines, emojis welcome; suggest drops, rolls and FX.', party: 3 },
    pro: { label: '🎧 Pro', prompt: 'Personality: professional, precise club DJ / producer; concrete numbers (BPM, bars, keys).', party: 2 }
  };
  var LEN = { short: 'Reply length: at most 2 short sentences unless code is requested.', normal: 'Reply length: about 120 words.', long: 'Reply length: detailed, up to 300 words, with steps.' };
  var Opts = {
    get: function () { return sget('opts', {}); },
    set: function (k, v) { var o = Opts.get(); o[k] = v; sset('opts', o); if (k === 'rate' || k === 'pitch') Opts.applyVoice(); return v; },
    addon: function () { var o = Opts.get(); return '\n' + (PERS[o.personality] || PERS.pro).prompt + ' ' + (LEN[o.length] || LEN.normal); },
    partyLevel: function () { return (PERS[Opts.get().personality] || PERS.pro).party; },
    applyVoice: function () { var o = Opts.get(); if (apk()) N().call('setVoiceParams', +o.rate || 1, +o.pitch || 1); },
    pers: PERS, len: LEN
  };

  // ================================================================== shared memory bus (all agents + D Bot + D Builder)
  var busSubs = [];
  var Bus = {
    post: function (from, kind, text) {
      var e = { at: iso(), from: String(from).slice(0, 40), kind: kind, text: String(text || '').replace(/\s+/g, ' ').slice(0, 240) };
      if (St) St.push('bus', e, 200);
      busSubs.forEach(function (f) { try { f(e); } catch (_) {} });
      try { if (Bus.ch) Bus.ch.postMessage(e); } catch (_) {}
      return e;
    },
    recent: function (n) { return sget('bus', []).slice(-(n || 10)); },
    prompt: function (n) { var r = Bus.recent(n || 8); return r.length ? '\nShared memory of all D Bot agents (latest decisions / notes — stay consistent with them):\n' + r.map(function (e) { return '- [' + e.from + '/' + e.kind + '] ' + e.text; }).join('\n') : ''; },
    on: function (f) { busSubs.push(f); }
  };
  try { Bus.ch = new BroadcastChannel('dbot-bus'); Bus.ch.onmessage = function (m) { var e = m.data; if (!e || !e.at) return; var b = sget('bus', []); if (!b.some(function (x) { return x.at === e.at && x.text === e.text; })) { b.push(e); sset('bus', b.slice(-200)); } busSubs.forEach(function (f) { try { f(e); } catch (_) {} }); }; } catch (_) {}

  // ================================================================== repairs log („Naprawy”)
  var Rep = {
    add: function (module, what) { var e = { at: iso(), module: module, what: String(what).slice(0, 200) }; if (St) St.push('repairs', e, 100); Rep.fire(e); return e; },
    list: function () { return sget('repairs', []); }, subs: [], on: function (f) { Rep.subs.push(f); }, fire: function (e) { Rep.subs.forEach(function (f) { try { f(e); } catch (_) {} }); }
  };

  // ================================================================== modules: status + start + heal
  function liveAgeMin() { var L = global.DBotLive; if (!L || !L.lastSync()) return Infinity; var t = Date.parse(L.cache().syncedAt || ''); return isNaN(t) ? Infinity : (now() - t) / 60000; }
  var midiReconnectT = 0;
  var M = {
    agents: {
      label: '🧭 Agenci (14)', check: function () {
        var A = global.DBotAgents, S = global.D7Super; if (!A) return ['red', 'moduł agentów nie działa'];
        var en = A.list().filter(function (a) { return a.enabled; }).length;
        if (S && !S.__agHooked) return ['red', 'agenci odpięci od czatu'];
        return [en ? 'green' : 'yellow', en + '/' + A.list().length + ' włączonych · ' + (S && S.aiOn() ? 'AI: ' + S.usableList().join('+') : 'offline (klucz w ⚙)')];
      },
      start: function () { var A = global.DBotAgents; if (!A) return; if (A.rehook) A.rehook(); A.list().forEach(function (a) { a.warm = a.enabled ? (A.providerFor(a) || 'offline') : 'off'; }); },
      heal: function () { var A = global.DBotAgents; if (!A) return 'brak modułu'; try { A.list(); } catch (e) { A.reset(); return 'lista agentów zresetowana'; } if (A.rehook) A.rehook(); return 'agenci podpięci ponownie'; }
    },
    decks: {
      label: '🎧 Decki PRO8', check: function () { if (!document.querySelector('#p8-dock, .p8-deck, #sx-app')) return ['gray', 'brak decków na tej stronie']; var P = global.PRO8; if (!P || !P.ready) return ['yellow', 'start po kliknięciu START']; var s = P.state(); return ['green', 'A ' + (s.A && s.A.track || '—') + ' · B ' + (s.B && s.B.track || '—')]; },
      heal: function () { var P = global.PRO8; if (P && P.paint) P.paint(); var m = P && P.mixer && P.mixer(); if (m && m.ensure) m.ensure(); return 'mikser/decki odświeżone'; }
    },
    milkdrop: {
      label: '🌌 MilkDrop', check: function () { var X = global.SpecialX; if (!X) return ['gray', 'brak wizualizacji na tej stronie']; var s = X.api.snapshot(); return s.vizOk ? ['green', 'preset: ' + String(s.preset || '').slice(0, 40)] : ['yellow', 'czeka na START / WebGL']; },
      heal: function () { var X = global.SpecialX; if (X && X.api.snapshot().vizOk) X.api.presetRandom(); return 'nowy preset'; }
    },
    midi: {
      label: '🎹 MIDI · MC-707', check: function () {
        if (!apk()) return ['gray', 'tylko w aplikacji (Android)'];
        var MS = global.DBotMidiSync; if (!N().MIDI.available()) return ['gray', 'telefon bez android.software.midi'];
        var ps = MS.ports(); if (!ps.length) return [sget('midi.used', false) ? 'red' : 'yellow', 'brak urządzenia — podłącz MC-707 (USB)'];
        return ['green', ps.length + ' porty · ' + (MS.running ? MS.status : MS.mode)];
      },
      start: function () { if (!apk() || !global.DBotMidiSync) return; var MS = global.DBotMidiSync; N().MIDI.request().then(function (acc) { N().MIDI.refresh(); MS.restoreSaved(); [MS.out && acc.outputs.get(MS.out), MS.inp && acc.inputs.get(MS.inp)].forEach(function (p) { if (p) p.open(); }); }, function () {}); },
      heal: function () { if (now() - midiReconnectT < 4000) return null; midiReconnectT = now(); M.midi.start(); return 'MIDI: ponowne łączenie z ostatnim urządzeniem'; }
    },
    sync: {
      label: '🔄 Live sync', check: function () { var L = global.DBotLive; if (!L) return ['red', 'moduł sync nie działa']; var a = liveAgeMin(), st = L.cache().status || {}; var bad = Object.keys(st).filter(function (k) { return !/^ok$/.test(st[k]); }).length; if (a < 30) return [bad ? 'yellow' : 'green', 'ostatni: ' + L.lastSync() + (bad ? ' · ' + bad + ' źródeł offline' : '')]; return [a === Infinity ? 'yellow' : 'red', a === Infinity ? 'jeszcze nie (offline?)' : 'stary sync ' + Math.round(a) + ' min']; },
      start: function () { if (global.DBotLive) return global.DBotLive.syncNow(); },
      heal: function () { if (navigator.onLine === false) return null; M.sync.start(); return 'sync ponowiony'; }, backoffMax: 15 * 60000
    },
    voice: {
      label: '🎙 Głos', check: function () { var C = global.D7Chat; if (!C || !C.mounted) return ['red', 'czat nie zamontowany']; if (!C.voiceSupported()) return ['yellow', 'brak rozpoznawania mowy']; var l = global.DBotCenter && global.DBotCenter.langs(); return ['green', (C.ui().native ? 'natywny' : 'przeglądarka') + ' · ' + C.ui().lang + (l && l.stt.length ? ' · ' + l.stt.length + ' języków' : '')]; },
      start: function () { if (N()) N().wrapVoice(); if (global.DBotCenter && apk()) { N().call('speechLanguages'); N().call('ttsInfo'); } Opts.applyVoice(); },
      heal: function () { if (N()) N().wrapVoice(); var C = global.D7Chat; if (C && !C.mounted && C.mount && !document.querySelector('#sx-app')) C.mount({ standalone: true }); return 'głos/czat podpięty ponownie'; }
    },
    autoreply: {
      label: '💬 Auto-reply', check: function () { if (!apk()) return ['gray', 'tylko w aplikacji (Android)']; var c = N().json(N().call('autoReplyConfig'), {}); if (!c.enabled) return ['yellow', 'wyłączone (Twoja decyzja)']; if (!c.listenerEnabled) return ['red', 'włączone, ale brak dostępu do powiadomień']; return ['green', 'aktywne · ' + (c.apps || []).length + ' aplikacji']; }
    },
    brain: {
      label: '🧠 Mózg AI', check: function () {
        var S = global.D7Super, L = global.DBotLocalAI;
        if (S && S.aiOn()) return ['green', 'chmura: ' + S.usableList().join('+') + (L && L.usable() ? ' + darmowy na telefonie' : '')];
        if (!L) return ['yellow', 'offline (reguły)'];
        var st = L.status();
        if (st.crashed) return ['yellow', 'wstrzymany po braku pamięci — włącz ponownie w Center'];
        if (st.downloading) return ['yellow', 'pobieram ' + Math.round(st.done / 1048576) + '/' + Math.round(st.total / 1048576) + ' MB'];
        if (L.usable()) return ['green', 'darmowy mózg na telefonie' + (st.loaded ? ' (załadowany)' : '')];
        return ['yellow', st.ramOk ? 'offline — pobierz darmowy mózg (Center → Super D Bot)' : 'za mało RAM — offline + opcjonalny klucz'];
      },
      heal: function () { var L = global.DBotLocalAI; if (L) { L.unload(); } return 'darmowy mózg zwolniony z pamięci (włącz ponownie w Center → Super D Bot)'; }
    },
    builder: { label: '🧩 D Builder', check: function () { var B = global.DBuilder; return B ? ['green', B.apps().length + ' aplikacji'] : ['red', 'moduł nie działa']; } },
    state: { label: '💾 Zapis ustawień', check: function () { if (!St) return ['red', 'brak magazynu']; var t = St.raw().savedAt; return ['green', 'zapis automatyczny · ' + (t ? String(t).slice(11, 19) : 'jeszcze nie') + (apk() ? ' · kopia natywna' : '')]; }, heal: function () { St.flush(); return 'zapis wymuszony'; } },
    auto: { label: '🤖 FULL AUTO', check: function () { return FullAuto.on ? ['green', 'D Bot decyduje · ' + FullAuto.decisions().length + ' decyzji'] : ['yellow', 'wyłączone']; } }
  };
  var ORDER = ['agents', 'brain', 'decks', 'milkdrop', 'midi', 'sync', 'voice', 'autoreply', 'builder', 'state', 'auto'];
  function statusAll() { var out = {}; ORDER.forEach(function (k) { var r; try { r = M[k].check(); } catch (e) { r = ['red', 'błąd: ' + e.message]; } out[k] = { label: M[k].label, color: r[0], text: r[1] }; }); return out; }
  function startAll(why) {
    var done = [];
    ORDER.forEach(function (k) { if (M[k].start) { try { M[k].start(); done.push(k); } catch (e) { Rep.add(k, 'start nieudany: ' + e.message); } } });
    Bus.post('D Bot', 'system', 'Uruchom wszystko (' + (why || 'ręcznie') + '): ' + done.join(', '));
    return done;
  }
  function syncAll() {
    if (St) St.flush();
    var p = M.sync.start(); M.midi.start(); M.agents.start(); if (apk()) N().call('speechLanguages');
    Bus.post('D Bot', 'system', 'Synchronizuj wszystko');
    return p || Promise.resolve();
  }

  // ================================================================== watchdog + global error recovery
  var W = { timer: 0, fails: {}, next: {}, every: 5000, runs: 0 };
  function heal(k, reason) {
    var m = M[k]; if (!m || !m.heal) return;
    var t = now(); if (W.next[k] && t < W.next[k]) return;
    var n = W.fails[k] = (W.fails[k] || 0) + 1, max = m.backoffMax || 5 * 60000;
    W.next[k] = t + Math.min(max, 5000 * Math.pow(2, n - 1));
    var what; try { what = m.heal(reason); } catch (e) { what = 'naprawa nieudana: ' + e.message; }
    if (what) Rep.add(k, (reason ? reason + ' → ' : '') + what + (n > 1 ? ' (próba ' + n + ')' : ''));
  }
  function watch() {
    W.runs++;
    var s = statusAll();
    ORDER.forEach(function (k) { if (s[k].color === 'red') heal(k, s[k].text); else if (s[k].color === 'green') { W.fails[k] = 0; W.next[k] = 0; } });
    paintStop();
    if (global.DBotCenter && global.DBotCenter.onStatus) global.DBotCenter.onStatus(s);
  }
  var FILE_MOD = [[/dbot-localai|transformers/, 'brain'], [/dbot-talk/, 'voice'], [/dbot-agents/, 'agents'], [/dbot-live/, 'sync'], [/dbot-builder/, 'builder'], [/dbot-native|d7-chat/, 'voice'], [/pro8/, 'decks'], [/special-x|butterchurn/, 'milkdrop'], [/dbot-state/, 'state'], [/dbot-doctor/, 'agents']];
  function modOf(file, stack) { var s = String(file || '') + ' ' + String(stack || ''); for (var i = 0; i < FILE_MOD.length; i++) if (FILE_MOD[i][0].test(s)) return FILE_MOD[i][1]; return null; }
  global.addEventListener('error', function (e) {
    var k = modOf(e.filename, e.error && e.error.stack); if (!k) return;
    Rep.add(k, 'błąd JS: ' + String(e.message || '').slice(0, 120)); W.next[k] = 0; setTimeout(function () { heal(k, 'po błędzie JS'); }, 50);
  });
  global.addEventListener('unhandledrejection', function (e) {
    var r = e.reason, k = modOf('', r && r.stack); if (!k) return;
    Rep.add(k, 'odrzucona obietnica: ' + String(r && r.message || r).slice(0, 120)); setTimeout(function () { heal(k, 'po błędzie'); }, 50);
  });

  // ================================================================== FULL AUTO — D Bot decides inside the app
  var UNDO = {
    'auto.start': function () { return global.DBotDJ.auto.stop(); }, 'party.start': function () { return global.DBotDJ.party.stop(); },
    'party.stop': function (d) { return global.DBotDJ.party.start(d.level || 2); }, 'midi.start': function () { return global.DBotMidiSync.stop(); },
    'viz.next': function () { return global.SpecialX ? global.SpecialX.api.presetPrev() : ''; }
  };
  var FullAuto = {
    on: false, timer: 0, lastSync: 0, suppressed: {},
    decisions: function () { return sget('decisions', []); },
    decide: function (kind, what, why, run, extra) {
      if (FullAuto.suppressed[kind] && now() < FullAuto.suppressed[kind]) return null;
      var res; try { res = run(); } catch (e) { res = '⚠ ' + e.message; }
      var d = Object.assign({ id: 'd' + now() + Math.floor(Math.random() * 1000), at: iso(), kind: kind, what: what, why: why, result: String(res || '').slice(0, 160), undoable: !!UNDO[kind], undone: false }, extra || {});
      if (St) St.push('decisions', d, 150);
      Bus.post('D Bot · AUTO', 'decision', what + ' — ' + why);
      FullAuto.fire(d);
      return d;
    },
    undo: function (id) {
      var list = FullAuto.decisions(), d = list.filter(function (x) { return x.id === id; })[0];
      if (!d || d.undone || !UNDO[d.kind]) return false;
      var r; try { r = UNDO[d.kind](d); } catch (e) { r = e.message; }
      d.undone = true; d.undoneAt = iso(); sset('decisions', list);
      FullAuto.suppressed[d.kind] = now() + 10 * 60000; // respect the user's override for 10 min
      Bus.post('Daniel', 'override', 'cofnięto: ' + d.what);
      FullAuto.fire(d);
      return r || true;
    },
    energy: function () {
      var h = new Date().getHours(), a = sget('auto', {}), from = +a.partyFrom || 22, to = +a.partyTo || 4;
      var night = from > to ? (h >= from || h < to) : (h >= from && h < to);
      var P = global.PRO8, bpm = 0; try { var d = P && (P.decks.A.playing ? P.decks.A : P.decks.B.playing ? P.decks.B : null); bpm = d && d.effBpm() || 0; } catch (_) {}
      var score = (night ? 0.55 : 0.2) + (bpm >= 125 ? 0.3 : bpm >= 118 ? 0.18 : bpm ? 0.05 : 0) + (Opts.get().personality === 'party' ? 0.15 : Opts.get().personality === 'calm' ? -0.15 : 0);
      return { night: night, bpm: bpm, score: Math.max(0, Math.min(1, score)), hour: h };
    },
    tick: function () {
      if (!FullAuto.on) return;
      var DJ = global.DBotDJ, P = global.PRO8, e = FullAuto.energy(), a = sget('auto', {});
      if (DJ && P && P.ready) {
        var playing = P.decks.A.playing || P.decks.B.playing;
        if (!DJ.auto.on) FullAuto.decide('auto.start', 'Auto mix ON', playing ? 'gra muzyka — przejmuję miksowanie' : 'cisza na deckach — startuję set', function () { return DJ.auto.start(); });
        var lvl = Math.min(3, Opts.partyLevel() + (e.hour >= 0 && e.hour < 4 ? 1 : 0));
        if (e.score >= 0.7 && !DJ.party.on) FullAuto.decide('party.start', 'Party L' + lvl, 'energia ' + Math.round(e.score * 100) + '% (' + (e.night ? 'noc' : 'dzień') + ', ' + Math.round(e.bpm) + ' BPM)', function () { var r = DJ.party.start(lvl); DJ.party.byAuto = true; return r; }, { level: lvl });
        else if (e.score < 0.45 && DJ.party.on && DJ.party.byAuto) FullAuto.decide('party.stop', 'Party OFF', 'energia spadła do ' + Math.round(e.score * 100) + '%', function () { return DJ.party.stop(); }, { level: DJ.party.level });
      }
      var MS = global.DBotMidiSync;
      if (MS && apk() && sget('midi.used', false) && MS.mode === 'master' && !MS.running && MS.ports().length && P && P.ready && (P.decks.A.playing || P.decks.B.playing))
        FullAuto.decide('midi.start', 'MIDI clock → MC-707', 'deck gra, MC-707 podłączony', function () { return MS.start(); });
      var every = (+a.syncEveryMin || 15) * 60000;
      if (now() - FullAuto.lastSync > every) { FullAuto.lastSync = now(); FullAuto.decide('sync', 'Synchronizuj wszystko', 'co ' + (every / 60000) + ' min', function () { syncAll(); return 'ok'; }); }
    },
    start: function (quiet) {
      if (FullAuto.on) return '🤖 FULL AUTO już działa';
      FullAuto.on = true; sset('auto.full', true); if (global.DBotAgents) global.DBotAgents.fullAuto = true;
      FullAuto.lastSync = now();
      clearInterval(FullAuto.timer); FullAuto.timer = setInterval(FullAuto.tick, 20000); setTimeout(FullAuto.tick, 800);
      Bus.post('D Bot · AUTO', 'system', 'FULL AUTO ON'); paintStop(); FullAuto.fire(null);
      return '🤖 FULL AUTO ON — D Bot sam prowadzi decki, Party, MIDI clock i sync (tylko w aplikacji). Auto-reply zostaje przy Twoich ustawieniach. ⏹ STOP zatrzymuje wszystko.';
    },
    stop: function () {
      var was = FullAuto.on; FullAuto.on = false; clearInterval(FullAuto.timer); sset('auto.full', false); if (global.DBotAgents) global.DBotAgents.fullAuto = false;
      if (global.DBotDJ) global.DBotDJ.panic();
      if (global.DBotMidiSync && global.DBotMidiSync.running) global.DBotMidiSync.stop();
      if (was) Bus.post('Daniel', 'override', 'STOP — FULL AUTO OFF');
      paintStop(); FullAuto.fire(null);
      return '⏹ STOP — FULL AUTO, Auto mix, Party i MIDI clock zatrzymane.';
    },
    subs: [], onChange: function (f) { FullAuto.subs.push(f); }, fire: function (d) { FullAuto.subs.forEach(function (f) { try { f(d); } catch (_) {} }); }
  };

  // ================================================================== big STOP button (visible whenever anything automatic runs)
  var stopBtn = null;
  function paintStop() {
    var DJ = global.DBotDJ, MS = global.DBotMidiSync;
    var active = FullAuto.on || (DJ && (DJ.auto.on || DJ.party.on)) || (MS && MS.running);
    if (!stopBtn && document.body) {
      stopBtn = document.createElement('button'); stopBtn.type = 'button'; stopBtn.id = 'dbot-stop'; stopBtn.className = 'dbot-stop'; stopBtn.hidden = true;
      stopBtn.innerHTML = '⏹ STOP<small>AUTO · PARTY · CLOCK</small>';
      stopBtn.onclick = function () { var r = FullAuto.stop(); var C = global.D7Chat; if (C) C.add('bot', r); paintStop(); };
      document.body.appendChild(stopBtn);
    }
    if (stopBtn) { stopBtn.hidden = !active; stopBtn.classList.toggle('full', FullAuto.on); }
    document.documentElement.classList.toggle('dbot-full-auto', FullAuto.on);
  }

  // ================================================================== cosmic parallax layer (galaxy + 3 star planes)
  function cosmos() {
    if (document.getElementById('dbot-cosmos')) return;
    var c = document.createElement('div'); c.id = 'dbot-cosmos'; c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '<i class="cz-nebula"></i><i class="cz-galaxy"></i><i class="cz-stars s1"></i><i class="cz-stars s2"></i><i class="cz-stars s3"></i><i class="cz-comet"></i>';
    document.body.insertBefore(c, document.body.firstChild);
    applyTheme(sget('ui.theme', 'galaxy'));
    var tx = 0, ty = 0, raf = 0;
    function set(x, y) { tx = x; ty = y; if (!raf) raf = requestAnimationFrame(function () { raf = 0; c.style.setProperty('--px', tx.toFixed(3)); c.style.setProperty('--py', ty.toFixed(3)); }); }
    global.addEventListener('pointermove', function (e) { set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5); }, { passive: true });
    global.addEventListener('deviceorientation', function (e) { if (e.gamma == null) return; set(Math.max(-0.5, Math.min(0.5, e.gamma / 60)), Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 90))); }, { passive: true });
    document.addEventListener('visibilitychange', function () { c.classList.toggle('paused', document.visibilityState === 'hidden'); });
  }
  function applyTheme(t) { t = /^(galaxy|nebula|minimal)$/.test(t) ? t : 'galaxy'; document.documentElement.setAttribute('data-cosmos', t); return t; }

  // ================================================================== boot: restore + start everything immediately
  function boot() {
    cosmos(); paintStop(); Opts.applyVoice();
    startAll('start aplikacji');
    if (sget('auto.full', false)) { FullAuto.start(true); Rep.add('auto', 'FULL AUTO wznowiony po starcie (był włączony)'); }
    clearInterval(W.timer); W.timer = setInterval(watch, W.every); setTimeout(watch, 1500);
    // restore D Builder's current app + continuous conversation flag
    var cur = sget('ui.builderApp', ''); if (cur && global.DBuilder) global.DBuilder.select(cur);
    if (N() && N().voice) N().voice.convo = !!sget('ui.convo', false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 600); }); else setTimeout(boot, 600);

  global.DBotOpts = Opts; global.DBotBus = Bus; global.DBotRepairs = Rep;
  global.DBotModules = { list: M, order: ORDER, status: statusAll, startAll: startAll, syncAll: syncAll };
  global.DBotWatchdog = { run: watch, heal: heal, state: W, modOf: modOf };
  global.DBotFullAuto = FullAuto;
  global.DBotTheme = { apply: function (t) { return sset('ui.theme', applyTheme(t)); } };
  global.DBotStop = { paint: paintStop };
})(typeof window !== 'undefined' ? window : globalThis);
