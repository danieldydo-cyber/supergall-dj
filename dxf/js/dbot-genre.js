/*
 * Super D Bot · 7 DJ — js/dbot-genre.js (v48)
 * 📻 Radio stations: Kali (YouTube, default) + free public internet radio streams (techno, drum & bass, house, chill, hip-hop, Polish),
 *    played with a plain <audio> element (no re-hosting, no recording; stations' own public stream URLs).
 *    Unreachable stream → falls back to Kali (local Kali beat offline).
 * 🎚 Genre modes („okna”): Kali/Mix · Techno · Drum & Bass · House · Hip-hop · Chill — each sets its own BPM range (DnB 160–180),
 *    the master clock, the auto loop generator genre (synced to the clock), MilkDrop presets for the genre, a matching station.
 * 🎨 Themes: Klasyczny · Proton · Neutron (UI accents + visual tint).
 */
(function (global) {
  'use strict';
  var doc = global.document;
  function St() { return global.DBotState; }
  function sget(p, fb) { var s = St(); return s ? s.get(p, fb) : fb; }
  function sset(p, v) { var s = St(); return s ? s.set(p, v) : v; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function chat(t) { var C = global.D7Chat; return C && C.add ? C.add('bot', t) : null; }
  function log(t) { try { global.DBotConductor && global.DBotConductor.log && global.DBotConductor.log.push({ at: Date.now(), t: t }); } catch (_) {} }
  var BRAND = 'Super D Bot · 7 DJ';

  // ================================================================== stations (public, free-to-listen streams; https only)
  var STATIONS = [
    { id: 'kali', g: 'kali', name: 'KALI LIVE RADIO 24/7', where: 'YouTube', yt: true },
    { id: 'igfm', g: 'techno', name: 'Intergalactic FM · Murder Capital', where: 'NL', url: 'https://radio.intergalactic.fm/1' },
    { id: 'soma-defcon', g: 'techno', name: 'SomaFM · DEF CON Radio', where: 'US', url: 'https://ice2.somafm.com/defcon-128-mp3' },
    { id: 'bassdrive', g: 'dnb', name: 'Bassdrive · Drum & Bass', where: 'US', url: 'https://ice.bassdrive.net/stream' },
    { id: 'soma-beat', g: 'house', name: 'SomaFM · Beat Blender (deep house)', where: 'US', url: 'https://ice2.somafm.com/beatblender-128-mp3' },
    { id: 'soma-trip', g: 'house', name: 'SomaFM · The Trip (progressive)', where: 'US', url: 'https://ice2.somafm.com/thetrip-128-mp3' },
    { id: 'soma-groove', g: 'chill', name: 'SomaFM · Groove Salad (chill)', where: 'US', url: 'https://ice2.somafm.com/groovesalad-128-mp3' },
    { id: 'soma-space', g: 'chill', name: 'SomaFM · Space Station Soma', where: 'US', url: 'https://ice2.somafm.com/spacestation-128-mp3' },
    { id: 'soma-fluid', g: 'hiphop', name: 'SomaFM · Fluid (instrumental hip-hop)', where: 'US', url: 'https://ice2.somafm.com/fluid-128-mp3' },
    { id: '181-oldschool', g: 'hiphop', name: '181.FM · Old School Hip-Hop/R&B', where: 'US', url: 'https://listen.181fm.com/181-oldschool_128k.mp3' },
    { id: 'rmf', g: 'pl', name: 'RMF FM', where: 'PL · Kraków', url: 'https://rs101-krk.rmfstream.pl/RMFFM48' },
    { id: 'rmf-maxx', g: 'pl', name: 'RMF MAXX (dance)', where: 'PL', url: 'https://rs201-krk.rmfstream.pl/RMFMAXXX48' },
    { id: 'r357', g: 'pl', name: 'Radio 357', where: 'PL', url: 'https://stream.radio357.pl/' },
    { id: 'soma-dub', g: 'dnb', name: 'SomaFM · Dub Step Beyond', where: 'US', url: 'https://ice2.somafm.com/dubstep-128-mp3' },
    { id: 'soma-cliq', g: 'techno', name: 'SomaFM · cliqhop idm', where: 'US', url: 'https://ice2.somafm.com/cliqhop-128-mp3' },
    { id: 'rns', g: 'pl', name: 'Radio Nowy Świat', where: 'PL', url: 'https://stream.rcs.revma.com/ypqt40u0x1zuv' }
  ];
  var GLABEL = { kali: '🔥 Kali', techno: '⚙ Techno', dnb: '🥁 Drum & Bass', house: '🏠 House', chill: '🌙 Chill', hiphop: '🎤 Hip-hop', pl: '🇵🇱 Polskie' };
  function station(id) { return STATIONS.filter(function (s) { return s.id === id; })[0] || null; }

  var Radio = { el: null, cur: null, ok: false, fails: 0, vol: 0.85 };
  Radio.playing = function () { return !!(Radio.el && Radio.cur && !Radio.el.paused && Radio.ok); };
  Radio.preferred = function () { return sget('radio.station', 'kali'); };
  Radio.play = function (id, why) {
    var s = station(id) || station('kali'); sset('radio.station', s.id);
    var X = global.SpecialX;
    if (s.yt) { Radio.stop(true); if (X && X.api) X.api.kali(); paint(); log('📻 ' + s.name + ' (' + (why || 'wybór') + ')'); return s; }
    try { if (X && X.api && X.api.stopRadio) X.api.stopRadio(); } catch (_) {}
    if (!Radio.el) {
      Radio.el = new Audio(); Radio.el.preload = 'none';
      Radio.el.addEventListener('playing', function () { Radio.ok = true; Radio.fails = 0; paint(); });
      Radio.el.addEventListener('error', function () { Radio.fail('błąd strumienia'); });
      Radio.el.addEventListener('stalled', function () { setTimeout(function () { if (Radio.cur && !Radio.ok) Radio.fail('brak danych'); }, 12000); });
    }
    Radio.cur = s; Radio.ok = false; Radio.el.volume = Radio.vol; Radio.el.src = s.url;
    var pr = Radio.el.play(); if (pr && pr.catch) pr.catch(function (e) { Radio.fail(e && e.name || 'autoplay'); });
    setTimeout(function () { if (Radio.cur === s && !Radio.ok) Radio.fail('timeout'); }, 15000);
    log('📻 ' + s.name + ' (' + (why || 'wybór') + ')'); paint(); return s;
  };
  Radio.fail = function (why) {
    if (!Radio.cur) return; var s = Radio.cur; Radio.stop(true); Radio.fails++;
    chat('📻 „' + s.name + '” nie odpowiada (' + why + ') → wracam do Kali radio.');
    var X = global.SpecialX; try { if (X && X.api) X.api.kali(); } catch (_) {}
    paint();
  };
  Radio.stop = function (keep) { if (Radio.el) { try { Radio.el.pause(); Radio.el.removeAttribute('src'); Radio.el.load(); } catch (_) {} } Radio.cur = null; Radio.ok = false; if (!keep) paint(); };
  Radio.fadeOut = function (ms) {
    if (!Radio.el || !Radio.cur) return; var v0 = Radio.el.volume, i = 0, n = 16;
    var iv = setInterval(function () { i++; try { Radio.el.volume = Math.max(0, v0 * (1 - i / n)); } catch (_) {} if (i >= n) { clearInterval(iv); Radio.stop(); Radio.el.volume = Radio.vol; } }, (ms || 8000) / n);
  };

  // ================================================================== genre modes
  var MODES = {
    kali: { label: '🔥 Kali / Mix', range: null, bpm: null, loop: 'house', station: 'kali', viz: null, theme: null },
    techno: { label: '⚙ Techno', range: [120, 150], bpm: 132, loop: 'techno', station: 'igfm', viz: /geiss|tunnel|stahl|shifter|cope|fractal|mandel|machine|cube|grid/i },
    dnb: { label: '🥁 Drum & Bass', range: [160, 180], bpm: 174, loop: 'dnb', station: 'bassdrive', viz: /flexi|rova|zylot|krash|dynamic|wave|fast|speed|eo/i },
    house: { label: '🏠 House', range: [115, 130], bpm: 124, loop: 'house', station: 'soma-beat', viz: /aderrasi|fishbrain|unchained|disco|bass|groove|martin/i },
    hiphop: { label: '🎤 Hip-hop', range: [80, 100], bpm: 90, loop: 'hiphop', station: 'soma-fluid', viz: /idiot|amandio|tripgnosis|smoke|ink|liquid/i },
    chill: { label: '🌙 Chill', range: [70, 110], bpm: 85, loop: 'lofi', station: 'soma-groove', viz: /yin|aurora|cosmic|northern|water|dream|smooth|nebula|star/i }
  };
  var Mode = {
    get: function () { return sget('genre.mode', 'kali'); },
    set: function (id, opts) {
      opts = opts || {}; var m = MODES[id]; if (!m) return null;
      var S = global.DBotStudio, R = S && S.range, prev = Mode.get();
      if (prev === 'kali' && id !== 'kali' && R) sset('genre.userRange', R.get());       // remember the user's own range (79–127)
      sset('genre.mode', id);
      if (R) { if (m.range) R.set(m.range[0], m.range[1]); else { var u = sget('genre.userRange', null); R.set(u ? u.min : 79, u ? u.max : 127); } }
      if (S && m.bpm) { try { S.clock.set(m.bpm, 'ui'); } catch (_) {} }
      var X = global.SpecialX, vp = null;
      if (m.viz && X && X.api && X.api.presetFind) vp = X.api.presetFind(m.viz);
      if (opts.radio !== false && (Radio.playing() || (X && X.api && X.api.snapshot().radioWanted) || opts.radio)) Radio.play(m.station, 'tryb ' + m.label);
      if (S && S.looper && opts.loop !== false) { Mode.genLoop(m.loop); }
      try { global.DBotBus && global.DBotBus.post('Super D Bot', 'decision', 'tryb ' + m.label); } catch (_) {}
      paint(); fireMode(id);
      var r = R ? R.get() : null;
      return m.label + ' · BPM ' + (r ? r.min + '–' + r.max : '') + (m.bpm ? ' (zegar ' + (S ? S.clock.bpm : m.bpm) + ')' : '') + ' · pętla ' + m.loop + (vp ? ' · wizualizacja „' + String(vp).slice(0, 40) + '”' : '') + ' · stacja: ' + (station(m.station) || {}).name;
    },
    /** generator: drum loop in the genre, at the master clock (looper follows the clock) — plays only if decks are armed or user asked */
    genLoop: function (g, play) {
      var S = global.DBotStudio; if (!S || !S.looper || S.looper.busy) return Promise.resolve(null);
      return S.looper.generate(0, 'drums', g, 2).then(function (r) { Mode.lastLoop = { genre: g, at: Date.now(), bpm: S.clock.bpm }; if (play) S.looper.play(); paint(); return r; }).catch(function (e) { return null; });
    }
  };
  var modeFns = []; function fireMode(id) { modeFns.forEach(function (f) { try { f(id); } catch (_) {} }); }

  // ================================================================== themes
  var THEMES = { classic: '✦ Klasyczny', proton: '🔴 Proton', neutron: '🔵 Neutron' };
  var Theme = {
    get: function () { return sget('ui.theme', 'classic'); },
    set: function (t) { if (!THEMES[t]) t = 'classic'; sset('ui.theme', t); var h = doc.documentElement; Object.keys(THEMES).forEach(function (k) { h.classList.toggle('theme-' + k, k === t); }); paint(); return THEMES[t]; }
  };

  // ================================================================== UI: chip + sheet
  function paint() {
    var c = doc.getElementById('dbot-genre-chip'); if (c) c.textContent = (MODES[Mode.get()] || MODES.kali).label.split(' ')[0] + ' ' + (Radio.cur ? '📻' : '');
    var sh = doc.getElementById('dbot-genre-sheet'); if (sh && !sh.hidden) render(sh);
  }
  function render(sh) {
    var cur = Mode.get(), st = Radio.cur ? Radio.cur.id : (sget('radio.station', 'kali'));
    var groups = {}; STATIONS.forEach(function (s) { (groups[s.g] = groups[s.g] || []).push(s); });
    sh.innerHTML = '<div class="dg-head"><b>' + BRAND + '</b><button type="button" data-x="close" aria-label="Zamknij">✕</button></div>' +
      '<h4>🎚 Tryb (okno gatunku)</h4><div class="dg-row">' + Object.keys(MODES).map(function (k) { return '<button type="button" data-mode="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + MODES[k].label + (MODES[k].range ? '<small>' + MODES[k].range.join('–') + '</small>' : '<small>Twój zakres</small>') + '</button>'; }).join('') + '</div>' +
      '<div class="dg-row"><button type="button" data-x="gen">🥁 Generator pętli ▶</button><button type="button" data-x="stopgen">⏹ pętla</button></div>' +
      '<h4>📻 Stacje</h4>' + Object.keys(groups).map(function (g) { return '<div class="dg-grp"><span>' + GLABEL[g] + '</span>' + groups[g].map(function (s) { return '<button type="button" data-st="' + s.id + '" class="' + (s.id === st ? 'on' : '') + '">' + esc(s.name) + '<small>' + esc(s.where) + '</small></button>'; }).join('') + '</div>'; }).join('') +
      '<div class="dg-row"><button type="button" data-x="rstop">⏹ Stop stacji</button></div>' +
      '<h4>🎨 Motyw</h4><div class="dg-row">' + Object.keys(THEMES).map(function (k) { return '<button type="button" data-theme="' + k + '" class="' + (k === Theme.get() ? 'on' : '') + '">' + THEMES[k] + '</button>'; }).join('') + '</div>' +
      '<p class="dg-hint">Stacje to publiczne, darmowe strumienie nadawców (bez nagrywania). Kali startuje sam; decki czekają na ▶.</p>';
    Array.prototype.forEach.call(sh.querySelectorAll('button'), function (b) {
      b.onclick = function () {
        var d = b.dataset;
        if (d.mode) chat('🎚 ' + Mode.set(d.mode, { radio: true }));
        else if (d.st) Radio.play(d.st, 'wybór');
        else if (d.theme) Theme.set(d.theme);
        else if (d.x === 'close') sh.hidden = true;
        else if (d.x === 'gen') Mode.genLoop((MODES[Mode.get()] || MODES.kali).loop, true);
        else if (d.x === 'stopgen') { try { global.DBotStudio.looper.stop(); } catch (_) {} }
        else if (d.x === 'rstop') { Radio.stop(); try { global.SpecialX.api.stopRadio(); } catch (_) {} }
        if (!sh.hidden) render(sh);
      };
    });
  }
  function open() {
    var sh = doc.getElementById('dbot-genre-sheet');
    if (!sh) { sh = doc.createElement('section'); sh.id = 'dbot-genre-sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'Tryby, stacje i motywy'); doc.body.appendChild(sh); }
    sh.hidden = false; render(sh); return sh;
  }
  function mountChip() {
    if (doc.getElementById('dbot-genre-chip')) return true;
    var badge = doc.querySelector('.sx-badge'); if (!badge || !badge.parentNode) return false;
    var c = doc.createElement('button'); c.type = 'button'; c.id = 'dbot-genre-chip'; c.title = 'Tryb gatunku · stacje radia · motyw';
    c.onclick = open;
    var after = doc.getElementById('dbot-mini-stop') || badge; after.parentNode.insertBefore(c, after.nextSibling);
    badge.textContent = 'SUPER D BOT · 7 DJ'; doc.title = BRAND + ' · D77 Studio 48';
    paint(); return true;
  }

  // ================================================================== chat
  function chatCmd(text) {
    var n = norm(text), m;
    if (/^(stacje|radio stacje|lista stacji|stations|wybierz stacje|tryby|motywy|gatunki)$/.test(n)) { open(); return '📻 Tryby, stacje i motywy otwarte (' + STATIONS.length + ' stacji).'; }
    if ((m = n.match(/^(tryb|mode|okno|gatunek)\s+(.+)$/)) || (m = n.match(/^()(techno|dnb|drum (and|n|&) bass|house|hip ?hop|chill|kali)( mode| tryb)?$/))) {
      var k = norm(m[2]).replace(/\s+/g, ''); k = /dnb|drum/.test(k) ? 'dnb' : /hip/.test(k) ? 'hiphop' : /mix|kali|default|domysl/.test(k) ? 'kali' : k;
      if (!MODES[k]) return null; return '🎚 ' + Mode.set(k, { radio: true });
    }
    if ((m = n.match(/^(motyw|theme|skora)\s+(proton|neutron|klasyczny|classic)$/))) return '🎨 Motyw: ' + Theme.set(m[2] === 'klasyczny' ? 'classic' : m[2]);
    if ((m = n.match(/^(radio|stacja|station|graj radio)\s+(.+)$/))) {
      var q = m[2], hit = STATIONS.filter(function (s) { return norm(s.name).indexOf(q) >= 0 || s.id === q; })[0] || STATIONS.filter(function (s) { return s.g === (/dnb|drum/.test(q) ? 'dnb' : /hip/.test(q) ? 'hiphop' : /polsk|pl\b/.test(q) ? 'pl' : q); })[0];
      if (!hit) return null; Radio.play(hit.id, 'czat'); return '📻 ' + hit.name + ' (' + hit.where + ')' + (hit.yt ? '' : ' — strumień nadawcy; jeśli nie odpowie, wracam do Kali.');
    }
    return null;
  }
  function hookChat() { // one outermost chat wrapper for all v48 modules lives in dbot-team.js (handlers list)
    var T = global.DBotTeam; if (!T || !T.handlers) return false;
    if (T.handlers.indexOf(chatCmd) < 0) T.handlers.push(chatCmd);
    return true;
  }
  function hookStudio() { // auto loop generator follows the genre mode
    var S = global.DBotStudio; if (!S || !S.autoLoop || S.autoLoop.__g) return !!(S && S.autoLoop && S.autoLoop.__g); S.autoLoop.__g = true;
    var en = S.autoLoop.ensure; S.autoLoop.ensure = function () {
      var md = MODES[Mode.get()]; if (!md || Mode.get() === 'kali') return en.apply(this, arguments);
      if (!sget('studio.autoLoop', false) || S.looper.busy) return Promise.resolve(null);
      var T = S.looper.tracks[0]; if (T && T.buf && Mode.lastLoop && Mode.lastLoop.genre === md.loop) return Promise.resolve(null);
      return Mode.genLoop(md.loop);
    };
    return true;
  }

  var G = global.DBotGenre = { brand: BRAND, stations: STATIONS, radio: Radio, modes: MODES, mode: Mode, themes: THEMES, theme: Theme, open: open, chat: chatCmd, onMode: function (f) { modeFns.push(f); } };
  global.DBotRadio = Radio;
  function boot() {
    Theme.set(Theme.get());
    var n = 0, t = setInterval(function () { var a = mountChip(), b = hookChat(), c = hookStudio(); if ((a && b && c && n > 20) || ++n > 60) clearInterval(t); }, 500);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
