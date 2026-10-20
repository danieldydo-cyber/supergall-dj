/*
 * D Bot v47 — 🛸 UFO alien mascot + big chat window.
 *  • window.DBotMood — shared bot-state event bus: idle · thinking · talking · listening · working · repairing · dj · happy · party
 *    (fed by chat, TTS / voice, agents, D Doctor, DJ agent / Auto Mix / Party, thumbs up). Anything can call DBotMood.set(state, ms).
 *  • Chat avatar: a cute alien in a flying saucer (SVG) with glowing beam, idle hover, lip-sync while talking.
 *  • Stage mascot: walks out of the UFO, walks around the screen, dances to the master BPM, procedural tricks
 *    (flip, spin, jump, beam lift, colour morph, moonwalk, wiggle — random combos, more in Party). Tap him for a trick.
 *  • One requestAnimationFrame loop, paused when the page is hidden or the mascot is off-screen/turned off; prefers-reduced-motion → still.
 *  • Lip-sync: Web Speech word boundaries + native TTS start/done events + a procedural syllable envelope (the TTS audio itself
 *    is not exposed to the page, so the mouth follows words/syllables, not the waveform).
 */
(function (global) {
  'use strict';
  if (global.DBotMood) return;
  var RM = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
  function reduce() { return !!(RM && RM.matches); }
  function St() { return global.DBotState; }
  function sget(p, fb) { return St() ? St().get(p, fb) : fb; }
  function sset(p, v) { return St() ? St().set(p, v) : v; }
  function now() { return performance.now(); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }

  // ================================================================== shared bot-state bus
  var PRI = { idle: 0, dj: 1, party: 1, working: 2, repairing: 3, thinking: 4, listening: 5, talking: 6, happy: 7 };
  var Mood = { cur: 'idle', until: 0, subs: [], log: [], speak: 0, speakUntil: 0, word: 0,
    set: function (s, ms) {
      if (!(s in PRI)) return Mood.cur;
      var t = now();
      var convo = /^(thinking|listening|talking|happy)$/.test(s); // conversation states always win (a new phase of the talk)
      if (!convo && Mood.cur !== 'idle' && t < Mood.until && PRI[s] < PRI[Mood.cur]) return Mood.cur; // keep a more important state
      Mood.cur = s; Mood.until = t + (ms || 4000);
      Mood.log.push({ s: s, at: Date.now() }); if (Mood.log.length > 40) Mood.log.shift();
      Mood.subs.forEach(function (f) { try { f(s); } catch (_) {} });
      return s;
    },
    clear: function (s) { if (!s || Mood.cur === s) { Mood.cur = 'idle'; Mood.until = 0; Mood.subs.forEach(function (f) { try { f('idle'); } catch (_) {} }); } },
    state: function () { if (Mood.cur !== 'idle' && now() > Mood.until) Mood.clear(); return Mood.cur; },
    on: function (f) { Mood.subs.push(f); },
    // lip-sync input: 0..1 openness pulses (word boundaries / audio level)
    mouth: function (v) { Mood.speak = Math.max(Mood.speak, Math.min(1, v)); },
    talk: function (ms) { Mood.speakUntil = now() + ms; Mood.set('talking', ms); }
  };

  // ================================================================== SVG
  var svgN = 0;
  function alienSvg(cls) {
    var k = 'u' + (++svgN) + '_';
    return ('<svg class="ufo-svg ' + (cls || '') + '" viewBox="0 0 120 150" aria-hidden="true">' +
      '<defs><radialGradient id="ufoDome" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#bff7ff" stop-opacity=".55"/><stop offset="1" stop-color="#5ef0ff" stop-opacity=".12"/></radialGradient>' +
      '<linearGradient id="ufoBody" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d9dcff"/><stop offset=".55" stop-color="#8a8fd6"/><stop offset="1" stop-color="#454a8f"/></linearGradient>' +
      '<linearGradient id="ufoBeam" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7dffb2" stop-opacity=".75"/><stop offset="1" stop-color="#7dffb2" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="alSkin" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#b6ff8a"/><stop offset="1" stop-color="#38c76a"/></radialGradient></defs>' +
      '<polygon class="u-beam" points="44,78 76,78 104,150 16,150" fill="url(#ufoBeam)"/>' +
      '<g class="u-walker"><g class="u-alien">' +
        '<g class="u-ant"><path d="M52 22 Q47 10 42 6" stroke="#38c76a" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle class="u-tip" cx="42" cy="6" r="3.6" fill="#ff6bd5"/>' +
        '<path d="M68 22 Q73 10 78 6" stroke="#38c76a" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle class="u-tip" cx="78" cy="6" r="3.6" fill="#5ef0ff"/></g>' +
        '<g class="u-armL"><path d="M44 66 Q34 72 30 82" stroke="#38c76a" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="30" cy="83" r="3.6" fill="#7be36f"/></g>' +
        '<g class="u-armR"><path d="M76 66 Q86 72 90 82" stroke="#38c76a" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="90" cy="83" r="3.6" fill="#7be36f"/></g>' +
        '<g class="u-legL"><path d="M53 86 L50 102" stroke="#2fa85a" stroke-width="5.5" stroke-linecap="round"/><ellipse cx="48" cy="104" rx="6" ry="3" fill="#2fa85a"/></g>' +
        '<g class="u-legR"><path d="M67 86 L70 102" stroke="#2fa85a" stroke-width="5.5" stroke-linecap="round"/><ellipse cx="72" cy="104" rx="6" ry="3" fill="#2fa85a"/></g>' +
        '<ellipse class="u-bodyA" cx="60" cy="74" rx="16" ry="15" fill="url(#alSkin)"/><ellipse cx="60" cy="77" rx="9" ry="8" fill="#d6ffb8" opacity=".5"/>' +
        '<ellipse class="u-head" cx="60" cy="40" rx="25" ry="21" fill="url(#alSkin)"/>' +
        '<g class="u-eyes"><ellipse class="u-eye" cx="50" cy="39" rx="7.2" ry="9" fill="#0c0b1d"/><ellipse class="u-eye" cx="70" cy="39" rx="7.2" ry="9" fill="#0c0b1d"/>' +
        '<circle class="u-glint" cx="52.4" cy="35.5" r="2.4" fill="#fff"/><circle class="u-glint" cx="72.4" cy="35.5" r="2.4" fill="#fff"/></g>' +
        '<ellipse cx="42" cy="49" rx="4" ry="2.2" fill="#ff8fc7" opacity=".55"/><ellipse cx="78" cy="49" rx="4" ry="2.2" fill="#ff8fc7" opacity=".55"/>' +
        '<ellipse class="u-mouth" cx="60" cy="52" rx="5" ry="1.4" fill="#3b0f2a"/>' +
        '<g class="u-prop"></g>' +
      '</g></g>' +
      '<g class="u-ship"><ellipse cx="60" cy="70" rx="44" ry="13" fill="url(#ufoBody)"/><ellipse cx="60" cy="66" rx="30" ry="6" fill="#c8ccff" opacity=".5"/>' +
        '<circle class="u-light" cx="30" cy="72" r="2.6"/><circle class="u-light" cx="45" cy="76" r="2.6"/><circle class="u-light" cx="60" cy="77.5" r="2.6"/><circle class="u-light" cx="75" cy="76" r="2.6"/><circle class="u-light" cx="90" cy="72" r="2.6"/></g>' +
      '<path class="u-dome" d="M30 66 Q31 20 60 18 Q89 20 90 66 Z" fill="url(#ufoDome)" stroke="#bff7ff" stroke-opacity=".5"/>' +
      '</svg>').replace(/id="(ufo\w+|al\w+)"/g, function (m, id) { return 'id="' + k + id + '"'; }).replace(/url\(#(ufo\w+|al\w+)\)/g, function (m, id) { return 'url(#' + k + id + ')'; });
  }
  var PROPS = {
    thinking: '<text x="88" y="20" font-size="16">💭</text>',
    working: '<text x="86" y="92" font-size="15" class="u-spin">⚙️</text>',
    repairing: '<text x="84" y="90" font-size="16" class="u-wrench">🔧</text><text x="20" y="22" font-size="12">🩺</text>',
    dj: '<path d="M36 34 Q60 4 84 34" stroke="#222" stroke-width="4" fill="none"/><rect x="31" y="32" width="9" height="13" rx="3" fill="#ff6bd5"/><rect x="80" y="32" width="9" height="13" rx="3" fill="#ff6bd5"/>',
    party: '<path d="M36 34 Q60 4 84 34" stroke="#222" stroke-width="4" fill="none"/><rect x="31" y="32" width="9" height="13" rx="3" fill="#5ef0ff"/><rect x="80" y="32" width="9" height="13" rx="3" fill="#5ef0ff"/>',
    listening: '<text x="88" y="38" font-size="13">👂</text>',
    happy: '<text x="86" y="22" font-size="15">💖</text>'
  };

  // ================================================================== chat avatar (header) + big chat window
  function chatAvatar() {
    var C = global.D7Chat, root = C && C.root; if (!root) return false;
    var head = root.querySelector('.d7c-head'); if (!head) return false;
    if (!head.querySelector('.ufo-avatar')) {
      var img = head.querySelector('img'); var a = document.createElement('div'); a.className = 'ufo-avatar'; a.title = 'D Bot — Multi-talent X (dotknij: sztuczka)'; a.innerHTML = alienSvg('mini');
      if (img) img.replaceWith(a); else head.insertBefore(a, head.firstChild);
      a.addEventListener('click', function (e) { e.stopPropagation(); Stage.trick(); });
      parts(a);
    }
    if (!head.querySelector('.d7c-size')) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'd7c-size'; b.title = 'Powiększ / zmniejsz okno czatu'; b.setAttribute('aria-label', 'Powiększ czat');
      b.textContent = '⤢';
      b.onclick = function () { var big = root.getAttribute('data-size') !== 'max'; root.setAttribute('data-size', big ? 'max' : 'big'); sset('ui.chatSize', big ? 'max' : 'big'); };
      var min = Array.prototype.filter.call(head.querySelectorAll('button'), function (x) { return /—|–|_/.test(x.textContent); })[0];
      head.insertBefore(b, min || null);
    }
    root.setAttribute('data-size', sget('ui.chatSize', 'big'));
    var pn = root.querySelector('.d7c-panel');
    if (pn && innerWidth > 720 && !pn.__desk) { pn.__desk = true; pn.classList.add('ufo-desk'); var place = function () { if (root.getAttribute('data-size') === 'max' || innerWidth <= 720) { pn.classList.remove('ufo-desk'); pn.style.left = pn.style.top = ''; return; } pn.classList.add('ufo-desk'); var w = pn.offsetWidth || 680, h = pn.offsetHeight || 760; pn.style.left = Math.max(8, innerWidth - w - 18) + 'px'; pn.style.top = Math.max(8, innerHeight - h - 84) + 'px'; }; pn.__place = place; addEventListener('resize', place); new MutationObserver(function () { if (!pn.hidden) place(); }).observe(pn, { attributes: true, attributeFilter: ['hidden'] }); new MutationObserver(place).observe(root, { attributes: true, attributeFilter: ['data-size'] }); setTimeout(place, 50); }
    // Mac / desktop: resizable panel, size remembered
    var panel = root.querySelector('.d7c-panel');
    if (panel && !panel.__ro && global.ResizeObserver) {
      var sz = sget('ui.chatPanel', null); if (sz && innerWidth > 700) { panel.style.width = sz.w + 'px'; panel.style.height = sz.h + 'px'; }
      panel.__ro = new ResizeObserver(function () { if (innerWidth > 700 && panel.offsetWidth > 300 && root.getAttribute('data-size') !== 'max') sset('ui.chatPanel', { w: panel.offsetWidth, h: panel.offsetHeight }); });
      panel.__ro.observe(panel);
    }
    return true;
  }

  function parts(el) {
    var q = function (s) { return el.querySelector(s); };
    var p = { el: el, alien: q('.u-alien'), mouth: q('.u-mouth'), armL: q('.u-armL'), armR: q('.u-armR'), legL: q('.u-legL'), legR: q('.u-legR'), eyes: q('.u-eyes'), beam: q('.u-beam'), prop: q('.u-prop'), ship: q('.u-ship'), dome: q('.u-dome'), ant: q('.u-ant'), propState: '' };
    el.__p = p; return p;
  }

  // ================================================================== animation core (shared by avatar + stage)
  function bpmInfo() {
    var X = global.DBotStudio, P = global.PRO8, SX = global.SpecialX, bpm = 120, phase = now() / 500, music = false;
    try { if (X && X.clock) { bpm = X.clock.bpm || bpm; phase = X.clock.phase(); } } catch (_) {}
    try { music = !!((P && P.decks && (P.decks.A.playing || P.decks.B.playing)) || (SX && SX.state && SX.state.radioPlaying) || (X && (X.looper.playing || X.player.src))); } catch (_) {}
    var DJ = global.DBotDJ, party = !!(DJ && DJ.party && DJ.party.on);
    return { bpm: bpm, phase: phase, music: music, party: party };
  }
  var blinkAt = now() + 2500;
  function pose(p, t, st, bi, extra) {
    extra = extra || {};
    var beat = bi.phase % 1, onBeat = Math.pow(1 - beat, 3), s = st;
    // mouth: lip-sync envelope
    var talking = s === 'talking' || now() < Mood.speakUntil;
    var open = 0;
    if (talking) { Mood.speak *= 0.86; var syl = 0.5 + 0.5 * Math.sin(t / 68) * Math.sin(t / 151 + 1.3); open = Math.max(Mood.speak, syl * 0.75 + 0.15 * Math.random()); }
    else if (s === 'happy') open = 0.6; else if (s === 'thinking') open = 0.08;
    p.mouth.setAttribute('ry', (1.3 + open * 5.6).toFixed(2)); p.mouth.setAttribute('rx', (5 - open * 1.2 + (s === 'happy' ? 2 : 0)).toFixed(2));
    // blink
    if (t > blinkAt) { blinkAt = t + rnd(1800, 5200); p.eyes.style.transform = 'scaleY(.12)'; setTimeout(function () { p.eyes.style.transform = ''; }, 120); }
    // arms / legs / body
    var aL = 0, aR = 0, lg = 0, bob = Math.sin(t / 600) * 1.5, tilt = 0;
    var dance = (bi.music || s === 'dj' || s === 'party') && !extra.trick;
    if (dance) { var sw = Math.sin(bi.phase * Math.PI); aL = -40 * Math.abs(sw) - 10; aR = 40 * Math.abs(Math.sin(bi.phase * Math.PI + 1.57)) + 10; bob = -onBeat * 5; tilt = Math.sin(bi.phase * Math.PI) * 7; lg = Math.sin(bi.phase * Math.PI) * 9; }
    if (s === 'thinking') { aR = -105; tilt = -6; }
    if (s === 'listening') { aL = -120; tilt = 8; }
    if (s === 'working' || s === 'repairing') { aR = -30 + Math.sin(t / 90) * 35; aL = 10; bob = Math.sin(t / 120) * 1.2; }
    if (s === 'happy') { aL = -140; aR = 140; bob = -Math.abs(Math.sin(t / 140)) * 7; }
    if (talking && !dance) { aR = Math.sin(t / 260) * 18 - 8; }
    if (extra.walk) { lg = Math.sin(t / 110) * 18; aL = Math.sin(t / 110) * 22; aR = -aL; bob = -Math.abs(Math.sin(t / 110)) * 2.5; }
    p.armL.setAttribute('transform', 'rotate(' + aL.toFixed(1) + ' 44 66)'); p.armR.setAttribute('transform', 'rotate(' + aR.toFixed(1) + ' 76 66)');
    p.legL.setAttribute('transform', 'rotate(' + lg.toFixed(1) + ' 53 86)'); p.legR.setAttribute('transform', 'rotate(' + (-lg).toFixed(1) + ' 67 86)');
    if (!extra.trick) p.alien.setAttribute('transform', 'translate(0 ' + bob.toFixed(2) + ') rotate(' + tilt.toFixed(1) + ' 60 80)');
    // antenna tips glow on beat / thinking
    p.ant.style.opacity = s === 'thinking' ? (0.55 + 0.45 * Math.sin(t / 160)).toFixed(2) : '';
    p.beam.style.opacity = extra.beam != null ? extra.beam : (s === 'listening' ? 0.75 : (dance ? (0.25 + onBeat * 0.6) : 0.18 + 0.12 * Math.sin(t / 700))).toFixed(2);
    var ps = PROPS[s] ? s : (dance ? (bi.party ? 'party' : (s === 'dj' ? 'dj' : '')) : '');
    if (p.propState !== ps) { p.prop.innerHTML = PROPS[ps] || ''; p.propState = ps; }
    p.el.setAttribute('data-mood', s);
  }

  // ================================================================== stage mascot (walks out, walks around, dances, tricks)
  var Stage = { el: null, p: null, x: 0, y: 0, mode: 'ship', tx: 0, trickQ: [], trickT: 0, nextIdle: 0, hue: 0, flipX: 1, alienY: 0, alienX: 0,
    mount: function () {
      if (Stage.el || !document.body) return;
      var el = document.createElement('div'); el.id = 'dbot-ufo'; el.className = 'ufo-stage'; el.innerHTML = alienSvg('stage');
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'D Bot (UFO) — dotknij: sztuczka');
      el.addEventListener('click', function () { Stage.trick(); });
      document.body.appendChild(el); Stage.el = el; Stage.p = parts(el);
      Stage.x = innerWidth - 150; Stage.y = innerHeight - 260; Stage.nextIdle = now() + 6000;
      el.hidden = sget('ui.ufo', true) === false;
    },
    // procedural tricks: random combos of primitives
    PRIM: ['flip', 'spin', 'jump', 'beam', 'morph', 'moonwalk', 'wiggle', 'backflip', 'twirl'],
    trick: function (n) {
      var bi = bpmInfo(), k = n || (bi.party ? 3 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2)), spb = 60000 / (bi.bpm || 120);
      for (var i = 0; i < k; i++) Stage.trickQ.push({ kind: pickOne(Stage.PRIM), dur: bi.music ? spb * pickOne([1, 2, 2, 4]) : rnd(600, 1300), dir: Math.random() < 0.5 ? -1 : 1 });
      Mood.set('happy', 900);
      return Stage.trickQ.length;
    },
    step: function (t, dt, st, bi) {
      var p = Stage.p, W = innerWidth, H = innerHeight;
      // walking: alien leaves the ship (beam), walks to a target, comes back
      if (t > Stage.nextIdle && !Stage.trickQ.length) {
        Stage.nextIdle = t + rnd(9000, 20000);
        var r = Math.random();
        if (Stage.mode === 'ship' && r < 0.55) { Stage.mode = 'out'; Stage.tx = rnd(30, W - 120); }
        else if (Stage.mode === 'walk') { Stage.mode = 'back'; }
        else if (bi.music || r < 0.8) Stage.trick();
      }
      var extra = { walk: false, trick: false };
      if (Stage.mode === 'out') { Stage.alienY = Math.min(Stage.alienY + dt * 0.12, 95); extra.beam = 0.85; if (Stage.alienY >= 95) Stage.mode = 'walk'; }
      else if (Stage.mode === 'walk') {
        var dx = Stage.tx - (Stage.x + Stage.alienX); if (Math.abs(dx) > 4) { Stage.alienX += Math.sign(dx) * dt * 0.07; Stage.flipX = dx < 0 ? -1 : 1; extra.walk = true; } else if (Math.random() < 0.004) Stage.tx = rnd(30, W - 120);
      } else if (Stage.mode === 'back') {
        if (Math.abs(Stage.alienX) > 4) { Stage.alienX -= Math.sign(Stage.alienX) * dt * 0.09; Stage.flipX = Stage.alienX > 0 ? -1 : 1; extra.walk = true; }
        else { Stage.alienX = 0; Stage.alienY = Math.max(0, Stage.alienY - dt * 0.12); extra.beam = 0.85; if (Stage.alienY <= 0) Stage.mode = 'ship'; }
      }
      // tricks
      var tf = '';
      if (Stage.trickQ.length) {
        var q = Stage.trickQ[0]; q.t0 = q.t0 || t; var u = Math.min(1, (t - q.t0) / q.dur), up = Math.sin(u * Math.PI);
        extra.trick = true;
        if (q.kind === 'flip') tf = 'translate(0 ' + (-up * 30).toFixed(1) + ') rotate(' + (u * 360 * q.dir).toFixed(1) + ' 60 70)';
        else if (q.kind === 'backflip') tf = 'translate(0 ' + (-up * 38).toFixed(1) + ') rotate(' + (-u * 360).toFixed(1) + ' 60 70)';
        else if (q.kind === 'spin') tf = 'translate(60 0) scale(' + Math.cos(u * Math.PI * 4).toFixed(3) + ' 1) translate(-60 0)';
        else if (q.kind === 'twirl') tf = 'rotate(' + (Math.sin(u * Math.PI * 2) * 25).toFixed(1) + ' 60 104)';
        else if (q.kind === 'jump') tf = 'translate(0 ' + (-Math.abs(Math.sin(u * Math.PI * 2)) * 26).toFixed(1) + ')';
        else if (q.kind === 'beam') { tf = 'translate(0 ' + (-up * 46).toFixed(1) + ')'; extra.beam = 0.9; }
        else if (q.kind === 'morph') Stage.hue = (Stage.hue + dt * 0.5) % 360;
        else if (q.kind === 'moonwalk') { Stage.alienX += -q.dir * dt * 0.05; Stage.flipX = q.dir; extra.walk = true; extra.trick = false; }
        else if (q.kind === 'wiggle') tf = 'translate(' + (Math.sin(u * Math.PI * 10) * 5).toFixed(1) + ' 0)';
        if (u >= 1) { Stage.trickQ.shift(); if (!Stage.trickQ.length && Math.random() < 0.5) Stage.hue = 0; }
      } else if (bi.party && bi.music && Math.random() < dt / 7000) Stage.trick();
      pose(p, t, st, bi, extra);
      if (tf) p.alien.setAttribute('transform', tf);
      // alien leaves the ship: move the alien group in screen space via CSS vars on the stage element
      Stage.el.style.setProperty('--ax', Stage.alienX.toFixed(1) + 'px');
      Stage.el.style.setProperty('--ay', Stage.alienY.toFixed(1) + 'px');
      Stage.el.style.setProperty('--fx', Stage.flipX);
      var hf = Stage.hue ? 'hue-rotate(' + Stage.hue.toFixed(0) + 'deg)' : ''; if (Stage.el.style.filter !== hf) Stage.el.style.filter = hf; // filter only while colour-morphing (cheap otherwise)
      var hover = Math.sin(t / 900) * 6 + (bi.music ? -Math.pow(1 - bi.phase % 1, 3) * 4 : 0);
      Stage.el.style.transform = 'translate3d(' + Math.min(Stage.x, W - 130).toFixed(0) + 'px,' + (Math.min(Stage.y, H - 240) + hover).toFixed(1) + 'px,0)';
      Stage.el.classList.toggle('out', Stage.mode !== 'ship');
      Stage.el.classList.toggle('u-idle', Stage.mode === 'ship' && !Stage.trickQ.length); // v48: tappable only when idle at home
    }
  };

  // ================================================================== loop (paused when hidden)
  var raf = 0, last = 0;
  function frame(t) {
    raf = 0; if (document.hidden) return;
    if (last && t - last < 30) { raf = requestAnimationFrame(frame); return; } // ≤ 33 fps is plenty for the mascot
    var dt = Math.min(250, t - (last || t)); last = t;
    var st = Mood.state(), bi = bpmInfo();
    try {
      var C = global.D7Chat, av = C && C.root && C.root.querySelector('.ufo-avatar');
      if (av && av.__p && C.root.querySelector('.d7c-panel:not([hidden])')) pose(av.__p, t, st, bi);
      if (Stage.el && !Stage.el.hidden) Stage.step(t, dt, st, bi);
    } catch (e) { Mood.err = e.message; }
    if (!reduce()) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = 0; kick(); } });
  Mood.on(function () { if (reduce()) { requestAnimationFrame(frame); } else kick(); });

  // ================================================================== hooks → bus
  function wrap(obj, name, fn) { if (!obj || typeof obj[name] !== 'function' || obj[name].__ufo) return false; var o = obj[name]; obj[name] = function () { try { fn.apply(this, arguments); } catch (_) {} return o.apply(this, arguments); }; obj[name].__ufo = true; return true; }
  var hooked = {};
  function hookAll() {
    var C = global.D7Chat;
    if (!hooked.log && C && C.log && global.MutationObserver) {
      hooked.log = true;
      new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) {
        if (!n.classList) return;
        if (n.classList.contains('typing')) Mood.set('thinking', 60000);
        else if (n.classList.contains('bot')) { if (Mood.cur === 'thinking') Mood.clear('thinking'); var len = (n.textContent || '').length; Mood.talk(Math.min(9000, 900 + len * 45)); Mood.mouth(1); }
      }); Array.prototype.forEach.call(m.removedNodes, function (n) { if (n.classList && n.classList.contains('typing') && Mood.cur === 'thinking') Mood.clear('thinking'); }); }); }).observe(C.log, { childList: true });
    }
    if (!hooked.tts && global.speechSynthesis) {
      hooked.tts = wrap(global.speechSynthesis, 'speak', function (u) {
        if (!u || !u.addEventListener) return;
        u.addEventListener('start', function () { Mood.talk(60000); });
        u.addEventListener('boundary', function () { Mood.mouth(1); Mood.speakUntil = now() + 900; });
        u.addEventListener('end', function () { Mood.speakUntil = now() + 150; Mood.clear('talking'); });
      });
    }
    var N = global.DBotNative;
    if (!hooked.native && N && N.on) {
      hooked.native = true;
      N.on('tts', function (ev) { if (ev.state === 'start') Mood.talk(30000); else if (ev.state === 'done' || ev.state === 'error') { Mood.speakUntil = now(); Mood.clear('talking'); } });
      ['ready', 'speechstart', 'partial'].forEach(function (k) { N.on(k, function () { Mood.set('listening', 8000); }); });
      ['result', 'end', 'error'].forEach(function (k) { N.on(k, function () { Mood.clear('listening'); }); });
    }
    var A = global.DBotAgents;
    if (!hooked.agents && A) {
      hooked.agents = wrap(A, 'run', function (a) { var id = a && (a.id || a); Mood.set(id === 'dj' ? 'dj' : id === 'doctor' ? 'repairing' : 'working', 5000); });
      wrap(A, 'feedback', function (id, up) { if (up) { Mood.set('happy', 2200); Stage.trick(2); } });
    }
    var D = global.DBotDoctor;
    if (!hooked.doc && D) { hooked.doc = true; ['check', 'repair', 'run'].forEach(function (k) { wrap(D, k, function () { Mood.set('repairing', 3500); }); }); }
    var DJ = global.DBotDJ;
    if (!hooked.dj && DJ) { hooked.dj = wrap(DJ, 'run', function () { Mood.set('dj', 4000); }); }
    var F = global.DBotFullAuto;
    if (!hooked.fa && F && F.onChange) { hooked.fa = true; F.onChange(function (d) { if (d) Mood.set('dj', 3000); }); }
    var X = global.DBotStudio;
    if (!hooked.st && X && X.on) { hooked.st = true; X.on('player', function (m) { if (m) Mood.set('dj', 3000); }); }
    return hooked.log && hooked.agents && hooked.doc;
  }
  // thumbs up anywhere in the chat → happy
  document.addEventListener('click', function (e) { var b = e.target && e.target.closest && e.target.closest('button'); if (b && /👍/.test(b.textContent || '')) { Mood.set('happy', 2200); Stage.trick(2); } }, true);
  // listening (web speech / live conversation): poll the chat's mic state cheaply
  setInterval(function () { var C = global.D7Chat; if (C && C.listening) Mood.set('listening', 1500); var DJ = global.DBotDJ; if (DJ && DJ.party && DJ.party.on && Mood.state() === 'idle') Mood.set('party', 1500); else if (DJ && DJ.auto && DJ.auto.on && Mood.state() === 'idle') Mood.set('dj', 1500); }, 700);

  function boot() {
    Stage.mount();
    var n = 0, t = setInterval(function () { var a = chatAvatar(), h = hookAll(); if ((a && h) || ++n > 40) clearInterval(t); }, 500);
    kick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 700); }); else setTimeout(boot, 700);

  global.DBotMood = Mood;
  global.DBotUFO = { stage: Stage, trick: function (n) { return Stage.trick(n); }, show: function (on) { sset('ui.ufo', !!on); if (Stage.el) Stage.el.hidden = !on; kick(); return !!on; }, svg: alienSvg, chatAvatar: chatAvatar, hooks: function () { return Object.assign({}, hooked); }, kick: kick };
})(typeof window !== 'undefined' ? window : globalThis);
