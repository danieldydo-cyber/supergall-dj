/*
 * D Bot · D77 Studio (v46) — 🩺 D Doctor, the 8th agent (repair / sync agent).
 * Drives the existing watchdog (window.DBotModules / DBotWatchdog / DBotRepairs from dbot-auto.js):
 *   check()  → health of every module (agents, brain, decks, MilkDrop, MIDI, sync, voice, auto-reply, D Builder, state, AUTO)
 *   repair() → heals every red module now (ignores the watchdog back-off), then resyncs D Bot, D Builder, all agents
 *              and the app: saved state (+ native copy), options, shared memory bus, agents re-hooked, current D Builder app,
 *              live sync; finally re-checks and reports what it found and what it fixed.
 * Chat: „sprawdź” / „napraw” / „@doctor …” (routed as agent 'doctor' by dbot-agents.js). Center → 📡 Status → 🩺 D Doctor.
 * Automatic: once after app start (default on) and every 3 min while FULL AUTO is on (logged as an AUTO decision).
 * Never touches auto-reply settings, never sends anything, never switches modules the user turned off.
 */
(function (global) {
  'use strict';
  var St = global.DBotState;
  var ICON = { green: '🟢', yellow: '🟡', red: '🔴', gray: '⚪' };
  function now() { return Date.now(); }
  function hhmm() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function cfg() { var c = St ? St.get('doctor', null) : null; return Object.assign({ onStart: true, inAuto: true }, c || {}); }
  function setCfg(k, v) { var c = cfg(); c[k] = !!v; if (St) St.set('doctor', c); return c; }
  var D = { last: null, lastAt: 0, runs: 0, subs: [] };
  function fire(r) { D.subs.forEach(function (f) { try { f(r); } catch (_) {} }); }

  function check() {
    var Mo = global.DBotModules, s = Mo ? Mo.status() : {}, keys = Mo ? Mo.order : [];
    var g = { green: [], yellow: [], red: [], gray: [] };
    keys.forEach(function (k) { var c = (s[k] && s[k].color) || 'gray'; (g[c] || g.gray).push(k); });
    return { at: new Date().toISOString(), status: s, order: keys, red: g.red, yellow: g.yellow, green: g.green, gray: g.gray };
  }

  function resync() {
    var out = [], A = global.DBotAgents, B = global.DBuilder, L = global.DBotLive, Bus = global.DBotBus, O = global.DBotOpts;
    try { if (A) { if (A.rehook) A.rehook(); var en = A.list().filter(function (a) { return a.enabled; }).length; out.push('agenci podpięci (' + en + '/' + A.list().length + ' włączonych)'); } } catch (e) { out.push('agenci: ' + e.message); }
    try { if (O) { O.applyVoice(); out.push('opcje bota i głosu zastosowane'); } } catch (_) {}
    try { if (B && St) { var cur = St.get('ui.builderApp', ''); if (cur && B.select) { B.select(cur); out.push('D Builder: bieżąca aplikacja przywrócona'); } else out.push('D Builder: ' + B.apps().length + ' aplikacji'); } } catch (_) {}
    try { if (global.DBotNative && global.DBotNative.wrapVoice) global.DBotNative.wrapVoice(); } catch (_) {}
    try { if (L && navigator.onLine !== false) { L.syncNow(); out.push('live sync uruchomiony'); } else if (L) out.push('live sync: offline — spróbuję później'); } catch (_) {}
    try { if (St) { St.flush(); out.push('ustawienia zapisane' + (global.DBotNative && global.DBotNative.has && global.DBotNative.has() ? ' + kopia natywna' : '')); } } catch (_) {}
    try { if (Bus) { Bus.post('D Doctor', 'sync', 'resync: ' + out.length + ' kroków'); out.push('wspólna pamięć agentów: ' + Bus.recent(200).length + ' wpisów'); } } catch (_) {}
    return out;
  }

  function repair(why) {
    var before = check(), fixed = [], W = global.DBotWatchdog, Mo = global.DBotModules, Rep = global.DBotRepairs;
    before.red.forEach(function (k) {
      var m = Mo && Mo.list[k]; if (!m) return;
      if (!m.heal) { fixed.push(m.label + ': brak automatycznej naprawy'); return; }
      if (W) { W.state.next[k] = 0; }
      var what; try { what = m.heal('D Doctor'); } catch (e) { what = 'naprawa nieudana: ' + e.message; }
      if (what) { fixed.push(m.label + ': ' + what); if (Rep) Rep.add(k, 'D Doctor → ' + what); }
    });
    var synced = resync();
    var after = check();
    var r = { at: after.at, why: why || 'ręcznie', before: before, after: after, fixed: fixed, synced: synced };
    if (Rep) Rep.add('doctor', (why || 'ręcznie') + ': ' + before.red.length + ' problemów, ' + fixed.length + ' napraw, ' + after.red.length + ' zostało');
    return r;
  }

  function line(st, k) { var x = st[k] || {}; return (ICON[x.color] || '⚪') + ' ' + (x.label || k) + ': ' + (x.text || ''); }
  function report(r, mode) {
    var a = r.after || r, st = a.status;
    var t = '🩺 D Doctor — ' + (mode === 'repair' ? 'naprawa i synchronizacja' : 'sprawdzenie') + ' (' + hhmm() + ')\n' +
      '🟢 ' + a.green.length + ' OK · 🟡 ' + a.yellow.length + ' uwag · 🔴 ' + a.red.length + ' problemów · ⚪ ' + a.gray.length + ' n/d';
    var bad = a.red.concat(a.yellow);
    if (bad.length) t += '\n' + bad.map(function (k) { return line(st, k); }).join('\n');
    if (mode === 'repair') {
      t += '\n\nZnalezione: ' + (r.before.red.length ? r.before.red.map(function (k) { return r.before.status[k].label; }).join(', ') : 'brak awarii');
      t += '\nNaprawione: ' + (r.fixed.length ? '\n• ' + r.fixed.join('\n• ') : 'nic nie wymagało naprawy');
      t += '\nZsynchronizowane:\n• ' + r.synced.join('\n• ');
      if (a.red.length) t += '\n⚠ Nadal nie działa: ' + a.red.map(function (k) { return st[k].label; }).join(', ') + ' — watchdog ponawia z przerwami.';
    } else if (a.red.length) t += '\nNapisz „napraw”, a naprawię i zsynchronizuję wszystko.';
    else t += '\nWszystko działa. „napraw” = wymuś pełną synchronizację.';
    return t;
  }

  function run(mode, opts) {
    opts = opts || {};
    D.runs++; D.lastAt = now();
    var r = mode === 'repair' ? repair(opts.why) : { after: check() };
    var text = report(r, mode);
    D.last = { mode: mode, at: new Date().toISOString(), text: text, red: r.after.red.slice(), fixed: (r.fixed || []).slice() };
    if (St) St.set('doctor.last', D.last);
    fire(D.last);
    if (opts.chat) { var C = global.D7Chat; if (C && C.add) C.add('bot', text); }
    return text;
  }

  /** Chat intent: returns 'check' | 'repair' | null. */
  function intent(text) {
    var n = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/^@doctor\s*/, 'doctor ').trim();
    if (/^(napraw|repair|fix|resync)( wszystko| all| everything| app| aplikacje d bot| moduly| system| sync| synchronizacje)?[.!]*$/.test(n) || /\b(d doctor|doctor|doktor)\b.*\b(napraw|repair|fix|resync|synchroniz)/.test(n)) return 'repair';
    if (/^(sprawdz|check|diagnoza|diagnose|health( check)?|status modulow|stan modulow|sprawdz (wszystko|aplikacje|moduly|system|stan))[.!?]*$/.test(n) || /^(d doctor|doctor|doktor)\b/.test(n)) return 'check';
    return null;
  }

  // automatic runs: once after start, every 3 min in FULL AUTO
  setTimeout(function () {
    if (!cfg().onStart) return;
    var t = run('repair', { why: 'start aplikacji' });
    if (D.last && (D.last.red.length || D.last.fixed.length)) { var C = global.D7Chat; if (C && C.add && C.mounted) C.add('bot', t); }
  }, 7000);
  function autoTick(force) {
    var F = global.DBotFullAuto; if (!F || !F.on || !cfg().inAuto || (!force && now() - D.lastAt < 180000)) return null;
    return F.decide('doctor', 'D Doctor: przegląd + sync', 'FULL AUTO · co 3 min', function () { run('repair', { why: 'FULL AUTO' }); return D.last.fixed.length + ' napraw, ' + D.last.red.length + ' problemów'; });
  }
  setInterval(autoTick, 20000);

  global.DBotDoctor = { check: check, repair: repair, resync: resync, run: run, report: report, intent: intent, autoTick: autoTick, cfg: cfg, setCfg: setCfg, last: function () { return D.last || (St && St.get('doctor.last', null)); }, on: function (f) { D.subs.push(f); }, state: D };
})(typeof window !== 'undefined' ? window : globalThis);
