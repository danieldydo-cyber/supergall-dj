/* D77 Studio v48 — „Minimal DJ Set PRO · Play Fly”
 * Clean minimal layout: 2 decks (play · sync), crossfader, one FX knob, a big waveform of the deck on air.
 * One tap „✈ PLAY FLY” = continuous auto minimal set inside the global BPM range:
 * Auto Mix with 32-beat phrase-aligned blends, smooth EQ bass swap and a subtle filter (no beat-FX clutter). */
(function (global) {
  'use strict';
  var doc = global.document; if (!doc) return;
  function P8() { var p = global.PRO8; return p && p.ready && p.decks && p.decks.A ? p : null; }
  function MX() { var p = P8(); return p && p.mixer && p.mixer(); }
  function A() { return global.DBotDJ && global.DBotDJ.auto; }
  function C() { return global.DBotConductor; }
  function St() { return global.DBotState; }
  function sget(k, fb) { var s = St(); return s && s.get ? s.get(k, fb) : fb; }
  function sset(k, v) { var s = St(); return s && s.set ? s.set(k, v) : v; }
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^\w\s#+&-]/g, ' ').replace(/\s+/g, ' ').trim(); }
  var TITLE = 'Minimal DJ Set PRO · Play Fly';
  var saved = null;
  var Fly = {
    title: TITLE,
    on: function () { var a = A(); return !!(a && a.opts && a.opts.fly && a.on); },
    start: function (why) {
      var a = A(), c = C(), F = global.DBotFullAuto; if (!a) return '⚠ Play Fly: decki jeszcze się ładują — spróbuj za chwilę.';
      if (!saved) saved = { bars: a.opts.bars, fx: a.opts.fx, loops: a.opts.loops, bassSwap: a.opts.bassSwap };
      a.opts.fly = true; a.opts.bars = 8; a.opts.fx = true; a.opts.loops = false; a.opts.bassSwap = true;
      sset('fly.on', true);
      if (F && !F.on && F.start) F.start(true);
      if (c && c.arm) c.arm('✈ Play Fly' + (why ? ' (' + why + ')' : ''));
      else if (!a.on && a.start) a.start();
      setTimeout(function () { var b = A(); if (b && !b.on && b.start) b.start(); paint(); }, 600);
      var R = global.DBotRange, r = R && R.get ? R.get() : null;
      paint();
      return '✈ PLAY FLY — ciągły minimal set: przejścia 32 beaty na granicy frazy, płynna zamiana basu (EQ), delikatny filtr' + (r ? ', tempo ' + r.min + '–' + r.max + ' BPM' : '') + '.';
    },
    stop: function () {
      var a = A(); sset('fly.on', false);
      if (a) { a.opts.fly = false; if (saved) { Object.keys(saved).forEach(function (k) { if (saved[k] !== undefined) a.opts[k] = saved[k]; }); saved = null; } }
      paint(); return '✈ Play Fly wyłączony (Auto Mix wraca do zwykłych ustawień, muzyka gra dalej).';
    },
    open: open, close: close
  };
  global.DBotFly = Fly;

  // ---------------------------------------------------------------- minimal layout
  var el = null, raf = 0;
  function css() {
    if (doc.getElementById('dbot-fly-css')) return;
    var s = doc.createElement('style'); s.id = 'dbot-fly-css';
    s.textContent = '#dbot-fly{position:fixed;inset:0;z-index:2147482900;background:radial-gradient(120% 90% at 50% 0%,#141428 0%,#05050b 70%);color:#eef;font:14px system-ui;display:flex;flex-direction:column;gap:12px;padding:max(12px,env(safe-area-inset-top)) 14px 16px;box-sizing:border-box}' +
      '#dbot-fly header{display:flex;align-items:center;gap:10px}#dbot-fly h2{margin:0;font:800 17px system-ui;letter-spacing:.5px;flex:1}#dbot-fly h2 small{display:block;font:500 11px system-ui;opacity:.6}' +
      '#dbot-fly button{cursor:pointer;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#eef;font:700 14px system-ui;padding:10px 14px}' +
      '#dbot-fly .fx-go{background:linear-gradient(90deg,#7b5cff,#21d4fd);border:0;color:#fff;font-size:18px;padding:14px 18px;border-radius:16px}#dbot-fly .fx-go.on{background:linear-gradient(90deg,#ff5c8a,#ffb35c)}' +
      '#dbot-fly canvas{width:100%;height:150px;border-radius:14px;background:rgba(255,255,255,.04);display:block}' +
      '#dbot-fly .fx-decks{display:grid;grid-template-columns:1fr 1fr;gap:10px}#dbot-fly .fx-deck{border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px;min-width:0}' +
      '#dbot-fly .fx-deck.air{border-color:#21d4fd;box-shadow:0 0 0 1px #21d4fd55 inset}#dbot-fly .fx-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}#dbot-fly .fx-b{opacity:.7;font-size:12px;margin:4px 0 8px}' +
      '#dbot-fly .fx-row{display:flex;gap:8px;align-items:center}#dbot-fly .fx-row button{flex:1;padding:8px}#dbot-fly button.lit{background:#21d4fd33;border-color:#21d4fd}' +
      '#dbot-fly .fx-mix{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center}#dbot-fly input[type=range]{width:100%;accent-color:#21d4fd}#dbot-fly label{font-size:12px;opacity:.75}' +
      '#dbot-fly .fx-st{font-size:12px;opacity:.75;min-height:16px}#dbot-fly-chip{margin-left:6px;min-height:30px;padding:2px 10px;border-radius:999px;border:1px solid rgba(33,212,253,.5);background:rgba(10,8,24,.8);color:#eef;font:700 13px system-ui;cursor:pointer}';
    doc.head.appendChild(s);
  }
  function open() {
    css(); if (el) { el.hidden = false; loop(); return el; }
    el = doc.createElement('div'); el.id = 'dbot-fly'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', TITLE);
    el.innerHTML = '<header><h2>✈ ' + TITLE + '<small>2 decki · crossfader · sync · FX · auto minimal set w zakresie BPM</small></h2><button data-x="close" aria-label="Zamknij">✕</button></header>' +
      '<canvas width="1200" height="300" aria-label="waveform"></canvas>' +
      '<div class="fx-decks">' + ['A', 'B'].map(function (k) { return '<div class="fx-deck" data-deck="' + k + '"><div class="fx-t">Deck ' + k + '</div><div class="fx-b">—</div><div class="fx-row"><button data-x="play" data-k="' + k + '">▶ / ⏸</button><button data-x="sync" data-k="' + k + '">SYNC</button></div></div>'; }).join('') + '</div>' +
      '<div class="fx-mix"><div><label>CROSSFADER</label><input type="range" min="0" max="1" step="0.01" data-x="xf"></div><div style="width:110px"><label>FX (filtr)</label><input type="range" min="-1" max="1" step="0.01" value="0" data-x="fx"></div></div>' +
      '<button class="fx-go" data-x="go">✈ PLAY FLY</button><div class="fx-st"></div>';
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-x]'); if (!b) return; var x = b.getAttribute('data-x'), p = P8(), k = b.getAttribute('data-k');
      if (x === 'close') close();
      else if (x === 'go') Fly.on() ? Fly.stop() : Fly.start('przycisk');
      else if (x === 'play' && p) { var d = p.decks[k]; if (d.playing) d.pause(); else { d.play(); if (C() && C().arm) C().arm('▶ Play Fly deck ' + k); } }
      else if (x === 'sync' && p) p.decks[k].setSync();
      paint();
    });
    el.addEventListener('input', function (e) {
      var x = e.target.getAttribute('data-x'), m = MX(), a = A(); if (!m) return;
      if (x === 'xf') m.setXf(+e.target.value);
      if (x === 'fx') { var id = a && a.air ? a.air : (m.xf < 0.5 ? 'A' : 'B'); m.setKnob(id, 'color', +e.target.value); }
    });
    doc.body.appendChild(el); paint(); loop(); return el;
  }
  function close() { if (el) el.hidden = true; cancelAnimationFrame(raf); raf = 0; }
  function paint() {
    var chip = doc.getElementById('dbot-fly-chip'); if (chip) chip.textContent = Fly.on() ? '✈ FLY ●' : '✈ Play Fly';
    if (!el || el.hidden) return;
    var p = P8(), a = A(), m = MX();
    ['A', 'B'].forEach(function (k) {
      var box = el.querySelector('[data-deck="' + k + '"]'), d = p && p.decks[k]; if (!box) return;
      box.classList.toggle('air', !!(a && a.air === k && d && d.playing));
      box.querySelector('.fx-t').textContent = k + ' · ' + (d && d.track ? d.track.name : '—');
      box.querySelector('.fx-b').textContent = d && d.bpm ? (d.effBpm().toFixed(1) + ' BPM' + (d.playing ? ' · gra' : ' · stoi')) : (d && d.track ? 'analiza…' : 'pusty');
      var sb = box.querySelector('[data-x="sync"]'); sb.classList.toggle('lit', !!(d && d.syncOn));
    });
    var xf = el.querySelector('[data-x="xf"]'); if (m && doc.activeElement !== xf) xf.value = m.xf;
    var go = el.querySelector('.fx-go'); go.classList.toggle('on', Fly.on()); go.textContent = Fly.on() ? '■ STOP FLY (muzyka gra dalej)' : '✈ PLAY FLY';
    var lm = C() && C().lastMix, st = el.querySelector('.fx-st');
    st.textContent = (a && a.phase === 'mix' ? '🎚 blend w toku · ' : '') + (lm ? 'ostatnie przejście: ' + lm.from + ' → ' + lm.to + ' · ' + (lm.bars * 4) + ' beatów · fraza ' + lm.phrase + (lm.alignErr != null ? ' · błąd fazy ' + lm.alignErr : '') : 'gotowy');
  }
  function draw() {
    if (!el || el.hidden) return; var cv = el.querySelector('canvas'), g = cv.getContext('2d'), W = cv.width, H = cv.height, p = P8(), a = A();
    g.clearRect(0, 0, W, H);
    var d = p && (a && a.air ? p.decks[a.air] : p.decks.A.playing ? p.decks.A : p.decks.B);
    var z = d && d.analysis && d.analysis.zMax, lo = d && d.analysis && d.analysis.zLow;
    if (!z || !z.length || !d.duration) { g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '28px system-ui'; g.fillText('waveform pojawi się po załadowaniu utworu', 30, H / 2); return; }
    var pos = d.pos(), span = 12 * d.spb(), t0 = pos - span / 2, per = d.duration / z.length;
    for (var x = 0; x < W; x += 3) {
      var t = t0 + x / W * span, i = Math.floor(t / per); if (i < 0 || i >= z.length) continue;
      var h = z[i] * H * 0.46, b = lo ? lo[i] : 0.5;
      g.fillStyle = 'rgb(' + Math.round(60 + 190 * (1 - b)) + ',' + Math.round(120 + 80 * b) + ',255)'; g.fillRect(x, H / 2 - h, 2, h * 2);
    }
    if (d.bpm) { var s = d.spb(), b0 = Math.ceil((t0 - d.firstBeat) / s); for (var bb = b0; d.firstBeat + bb * s < t0 + span; bb++) { var bx = (d.firstBeat + bb * s - t0) / span * W; g.fillStyle = bb % 4 === 0 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.15)'; g.fillRect(bx, 0, bb % 4 === 0 ? 2 : 1, H); } }
    g.fillStyle = '#ff5c8a'; g.fillRect(W / 2 - 1, 0, 3, H);
  }
  var lastP = 0;
  function loop() { cancelAnimationFrame(raf); var f = function (ts) { if (!el || el.hidden) return; draw(); if (ts - lastP > 500) { lastP = ts; paint(); } raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); }

  // ---------------------------------------------------------------- chip + chat
  function mountChip() {
    if (doc.getElementById('dbot-fly-chip')) return true;
    var g = doc.getElementById('dbot-genre-chip'); if (!g || !g.parentNode) return false;
    var b = doc.createElement('button'); b.id = 'dbot-fly-chip'; b.type = 'button'; b.title = TITLE; b.textContent = '✈ Play Fly';
    b.addEventListener('click', function () { open(); });
    g.parentNode.insertBefore(b, g.nextSibling); paint(); return true;
  }
  function chatCmd(text) {
    var n = norm(text);
    if (/^(play fly|fly|graj fly|minimal( dj)? set( pro)?|minimal set|tryb minimal|set minimal|lec|odlot)$/.test(n)) { open(); return Fly.start('czat'); }
    if (/^(stop fly|fly off|wylacz fly|koniec fly)$/.test(n)) return Fly.stop();
    if (/^(minimal|minimal dj|widok minimal|play fly widok)$/.test(n)) { open(); return '✈ ' + TITLE + ' otwarty — dotknij PLAY FLY.'; }
    return null;
  }
  function hookChat() { var T = global.DBotTeam; if (!T || !T.handlers) return false; if (T.handlers.indexOf(chatCmd) < 0) T.handlers.unshift(chatCmd); return true; }
  Fly.chat = chatCmd;
  function boot() {
    var n = 0, t = setInterval(function () {
      var a = mountChip(), b = hookChat();
      if (sget('fly.on', false) && A() && !A().opts.fly) { var o = A().opts; o.fly = true; o.bars = 8; o.bassSwap = true; o.loops = false; } // remembered across restarts; decks still wait for a tap (no deck autostart)
      if ((a && b && n > 10) || ++n > 60) clearInterval(t);
    }, 500);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
