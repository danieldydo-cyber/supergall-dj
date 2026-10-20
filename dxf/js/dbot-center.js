/*
 * D.bot v45 — „D.bot Center”: one cosmic glass panel with tabs for the v45 features.
 *   D Bot (orchestrator chat + continuous voice) · D Builder (its own chat tab + My apps) · Agents · DJ (Auto mix, Party)
 *   · MIDI (MC-707 ports, master/slave, BPM, phase nudge) · Auto-reply (APK) · Sync (live server + optional Google) · Voice.
 * Opened by the ◎ button (top bar / floating), by chat commands („agenci”, „d builder”, „midi”, „auto-reply”, „sync”) or DBotCenter.open(tab).
 */
(function (global) {
  'use strict';
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function N() { return global.DBotNative; }
  function apk() { return !!(N() && N().has()); }
  function pl() { try { return String(global.D7Super.curLang()).slice(0, 2) === 'pl'; } catch (_) { return true; } }
  var TABS = [['status', '📡 Status'], ['auto', '🤖 AUTO'], ['dbot', '🦈 Super D Bot'], ['builder', '🧩 D Builder'], ['agents', '🧭 Agenci'], ['dj', '🎧 DJ'], ['midi', '🎹 MIDI'], ['reply', '💬 Auto-reply'], ['sync', '🔄 Sync'], ['voice', '🎙 Głos'], ['studio', '🎛 Studio'], ['brains', '🧠 Mózgi AI'], ['opts', '⚙ Opcje']];
  var root = null, tab = (global.DBotState && global.DBotState.get('ui.tab', 'status')) || 'status';
  function St() { return global.DBotState; }

  function mount() {
    if (root) return;
    root = document.createElement('div'); root.id = 'dbot-center'; root.className = 'dbc'; root.hidden = true;
    root.innerHTML = '<div class="dbc-panel" role="dialog" aria-label="D.bot Center"><header class="dbc-head"><b>◎ D Bot Center</b><span class="dbc-sub"><span class="dbc-tag" title="DJ · piosenki · pady · pętle · aplikacje · boty · agenci · rozmowa · naprawa">Multi-talent X</span> D77 Studio · DJ · piosenki · pady · pętle · aplikacje · boty · agenci · rozmowa · naprawa</span><button type="button" class="dbc-x" aria-label="Zamknij">✕</button></header>' +
      '<nav class="dbc-tabs">' + TABS.map(function (t) { return '<button type="button" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav><div class="dbc-body"></div></div>';
    document.body.appendChild(root);
    $('.dbc-x', root).onclick = close;
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    $$('.dbc-tabs button', root).forEach(function (b) { b.onclick = function () { show(b.dataset.tab); }; });
    ['keydown', 'keyup', 'keypress'].forEach(function (t) { root.addEventListener(t, function (e) { if (e.key === 'Escape' && t === 'keydown') close(); e.stopPropagation(); }); });
    // launcher
    var fab = document.createElement('button'); fab.type = 'button'; fab.id = 'dbot-fab'; fab.className = 'dbot-fab'; fab.title = 'D.bot Center — D Bot, D Builder, agenci, DJ auto/party, MIDI, auto-reply, sync, głos'; fab.innerHTML = '<span>◎</span>';
    fab.onclick = function () { open(); };
    document.body.appendChild(fab);
    var top = $('.sx-top .sx-actions') || $('.sx-top');
    if (top) { var tb = document.createElement('button'); tb.type = 'button'; tb.className = 'sx-btn dbot-topbtn'; tb.textContent = '◎ Center'; tb.onclick = function () { open(); }; top.appendChild(tb); }
    // live updates
    if (global.DBotAgents) { global.DBotAgents.on('log', function () { if (tab === 'agents') paintLog(); }); ['auto', 'party', 'djstate'].forEach(function (k) { global.DBotAgents.on(k, function () { if (tab === 'dj') paintDj(); }); }); global.DBotAgents.on('midi', function () { if (tab === 'midi') paintMidiStatus(); }); }
    if (global.DBuilder) global.DBuilder.on(function () { if (tab === 'builder') paintBuilder(); });
    if (global.DBotLive) global.DBotLive.onChange(function () { if (tab === 'sync') render(); });
    if (N()) { N().on('google', function (ev) { if (tab === 'sync') { render(); toast(ev.ok ? '✅ Google połączone' : '⚠ Google: ' + ev.message); } }); N().on('langs', onLangs); N().on('ttsinfo', onTts); N().on('tts', function (ev) { if (ev.state === 'missing') ttsMissing(ev); }); }
  }
  function toast(t) { var C = global.D7Chat; var x = document.createElement('div'); x.className = 'dbc-toast'; x.textContent = t; document.body.appendChild(x); setTimeout(function () { x.remove(); }, 3800); if (!C) return; }
  function open(t) { mount(); root.hidden = false; document.documentElement.classList.add('dbc-open'); show(t || tab); }
  function close() { if (root) root.hidden = true; document.documentElement.classList.remove('dbc-open'); }
  function show(t) { if (!TABS.some(function (x) { return x[0] === t; })) t = 'status'; tab = t; if (St()) { St().set('ui.tab', t); if (t === 'dbot' || t === 'builder') St().set('ui.bot', t); } $$('.dbc-tabs button', root).forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); }); render(); }
  function body() { return $('.dbc-body', root); }
  function render() {
    var b = body(); if (!b) return;
    ({ status: rStatus, auto: rAuto, opts: rOpts, dbot: rDbot, builder: rBuilder, agents: rAgents, dj: rDj, midi: rMidi, reply: rReply, sync: rSync, voice: rVoice, studio: rStudio, brains: rBrains }[tab] || rDbot)(b);
  }
  function row(label, html) { return '<label class="dbc-row"><span>' + label + '</span>' + html + '</label>'; }
  function apkOnly(b, what) { b.innerHTML = '<div class="dbc-card"><p>📱 ' + what + ' działa tylko w aplikacji <b>D.bot</b> na Androidzie (natywne API). W przeglądarce ta zakładka jest tylko informacyjna.</p></div>'; }

  // ------------------------------------------------------------------ v47 D77 Studio
  function rBrains(b) { if (global.DBotBrains) global.DBotBrains.render(b); else b.innerHTML = '<div class="dbc-card"><p>Mózgi AI się ładują…</p></div>'; }
  function rStudio(b) {
    var X = global.DBotStudio; if (!X) { b.innerHTML = '<div class="dbc-card"><p>Studio się ładuje…</p></div>'; return; }
    var s = X.sync.sources(), L = X.sync.leaderNow();
    b.innerHTML = '<div class="dbc-card dbc-holo"><h3>🎛 D77 Studio</h3><p><b style="font-size:26px">' + X.clock.bpm + '</b> BPM master ← ' + esc(L.id) + ' · auto sync ' + (X.sync.auto ? 'ON' : 'OFF') + '</p>' +
      '<p>📻 radio ' + (s.radio.on ? (s.radio.bpm || '?') + ' (' + esc(s.radio.how) + ')' : 'off') + ' · 🎧 A ' + (s.deckA.bpm || '—') + ' · B ' + (s.deckB.bpm || '—') + ' · ⏱ MIDI ' + (s.midi.on ? s.midi.bpm : 'off') + '</p>' +
      '<div class="dbc-btns">' + [['song', '🎵 D Song'], ['mpc', '🥁 MPC 26 padów'], ['looper', '🔁 Looper'], ['lib', '📚 Biblioteka']].map(function (x) { return '<button type="button" data-st="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<p class="dbc-mut">' + X.lib.list('song').length + ' utworów · ' + X.lib.list('loop').length + ' pętli · ' + X.lib.list('sample').length + ' sampli · looper ' + X.looper.tracks.filter(function (t) { return t.buf; }).length + '/4</p></div>';
    $$('[data-st]', b).forEach(function (x) { x.onclick = function () { close(); X.ui.open(x.dataset.st); }; });
  }

  // ------------------------------------------------------------------ D Bot
  function rDbot(b) {
    var S = global.D7Super, st = S ? S.status() : { ai: false, providers: [] }, V = N() && N().voice;
    b.innerHTML = '<div class="dbc-card"><h3>🦈 Super D Bot — główny bot (orkiestrator 10 agentów)</h3><p>Pisz albo mów w czacie (rekin w rogu). D Bot sam wybiera agenta (DJ, MIDI, producent, research, pamięć), może uruchomić kilku i połączyć wyniki. <code>@dj</code>, <code>@midi</code>… = konkretny agent, <code>wszyscy agenci: …</code> = wszyscy.</p>' +
      '<p>Mózg: <b>' + (st.ai ? '☁ ' + st.providers.join(' + ') + ' (Twój klucz)' : S && S.localOn && S.localOn() ? '🧠 darmowy mózg na telefonie' : 'offline — włącz 🧠 darmowy mózg poniżej') + '</b></p>' +
      '<button type="button" id="dbc-live" class="dbc-auto' + (global.DBotTalk && global.DBotTalk.live.on ? ' on' : '') + '">' + (global.DBotTalk && global.DBotTalk.live.on ? '⏹ Zakończ rozmowę na żywo' : '🎙 Rozmowa na żywo (bez rąk)') + '</button>' +
      '<div class="dbc-btns"><button type="button" id="dbc-open-chat">💬 Otwórz czat D Bot</button><button type="button" id="dbc-convo" class="' + (V && V.convo ? 'on' : '') + '">🎙 Rozmowa ciągła: ' + (V && V.convo ? 'ON' : 'OFF') + '</button><button type="button" id="dbc-keys">⚙ Klucze AI</button></div>' +
      '<p class="dbc-hint">Rozmowa ciągła: słucham → odpowiadam głosem → znowu słucham (powiedz „stop rozmowa” albo kliknij jeszcze raz).</p></div>' +
      '<div class="dbc-card"><h3>Szybkie polecenia <small>(edytuj w ⚙ Opcje)</small></h3><div class="dbc-btns">' + ((global.DBotOpts && global.DBotOpts.get().quick) || ['status']).map(function (c) { return '<button type="button" data-cmd="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div></div>';
    var brain = document.createElement('div'); brain.className = 'dbc-card dbc-holo'; brain.id = 'dbc-brain'; b.insertBefore(brain, b.children[1] || null); paintBrain();
    $('#dbc-live', b).onclick = function () { var T = global.DBotTalk; if (!T) return; if (T.live.on) T.live.stop(); else { close(); T.live.start(); } };
    $('#dbc-open-chat', b).onclick = function () { close(); global.D7Chat && global.D7Chat.open(); };
    $('#dbc-keys', b).onclick = function () { close(); global.D7Chat && global.D7Chat.open(); setTimeout(function () { global.D7Super && global.D7Super.openSettings(true); }, 200); };
    $('#dbc-convo', b).onclick = function () { setConvo(!(V && V.convo)); render(); };
    $$('[data-cmd]', b).forEach(function (x) { x.onclick = function () { var C = global.D7Chat; if (C) { C.open(); C.send(x.dataset.cmd); } }; });
  }
  // ------------------------------------------------------------------ v46 🧠 free on-device brain card
  function paintBrain() {
    var el = $('#dbc-brain'), L = global.DBotLocalAI; if (!el || !L) return;
    var st = L.status(), pct = st.total ? Math.min(100, Math.round(st.done / st.total * 100)) : 0;
    el.innerHTML = '<h3>🧠 Darmowy mózg AI — na telefonie, bez kluczy i opłat</h3>' +
      '<p><b>' + esc(L.statusText()) + '</b></p>' +
      (st.downloading ? '<div class="dbc-progress"><i style="width:' + pct + '%"></i><span>' + pct + '%</span></div>' : '') +
      (st.error ? '<p class="dbc-err">⚠ ' + esc(st.error) + '</p>' : '') +
      '<div class="dbc-btns">' +
      (!st.installed && !st.downloading && st.ramOk ? '<button type="button" id="br-dl" class="on">⬇ Pobierz (≈ ' + L.sizeMb + ' MB, Wi-Fi)</button>' + (st.mode === 'apk' ? '<button type="button" id="br-dlm">⬇ przez dane komórkowe</button>' : '') : '') +
      (st.downloading ? '<button type="button" id="br-cancel">✕ Anuluj</button>' : '') +
      (st.installed ? '<button type="button" id="br-en" class="' + (st.enabled && !st.crashed ? 'on' : '') + '">' + (st.enabled && !st.crashed ? '✓ Włączony' : '▶ Włącz') + '</button><button type="button" id="br-test">💬 Test</button><button type="button" id="br-rm">🗑 Usuń model</button>' : '') +
      '</div><p class="dbc-hint">Model: Qwen3-0.6B (Apache-2.0, 100+ języków) · ONNX int8 · jednorazowo ≈ ' + L.sizeMb + ' MB z oficjalnego repozytorium Hugging Face (onnx-community), sprawdzane SHA-256, zapisane w prywatnej pamięci aplikacji. Wymaga ≈ 4 GB RAM i ≈ 0,9 GB wolnego miejsca. Działa offline; odpowiedzi trwają kilka–kilkadziesiąt sekund (CPU telefonu). Klucz Grok/Gemini/OpenAI (⚙) to opcjonalne, mądrzejsze i szybsze ulepszenie.</p>';
    var on = function (id, f) { var x = $(id, el); if (x) x.onclick = f; };
    on('#br-dl', function () { L.download(false); paintBrain(); });
    on('#br-dlm', function () { L.download(true); paintBrain(); });
    on('#br-cancel', function () { L.cancel(); });
    on('#br-en', function () { L.enable(!(st.enabled && !st.crashed)); paintBrain(); });
    on('#br-rm', function () { if (confirm('Usunąć model (≈ ' + L.sizeMb + ' MB)? Możesz go pobrać ponownie.')) { L.remove(); paintBrain(); } });
    on('#br-test', function () { var x = $('#br-test', el); x.textContent = '… myślę'; L.chat([{ role: 'system', content: 'Reply in one short friendly sentence in ' + ((global.D7Super && global.D7Super.curLang()) || 'pl-PL') + '.' }, { role: 'user', content: 'Przedstaw się w jednym zdaniu.' }], { maxTokens: 50 }).then(function (r) { toast((r.ok ? '🧠 ' : '⚠ ') + r.text); paintBrain(); }); });
  }
  if (global.DBotLocalAI) global.DBotLocalAI.on(function () { if (root && !root.hidden && tab === 'dbot') paintBrain(); });

  function setConvo(on) {
    var V = N() && N().voice; if (!V) return;
    V.convo = !!on; V.target = 'dbot'; if (St()) St().set('ui.convo', V.convo);
    var C = global.D7Chat;
    if (on && C) { C.setTts(true); C.open(); if (!C.listening) C.listen(); }
    if (!on && C && C.listening) C.stopListening();
  }

  // ------------------------------------------------------------------ D Builder (its own chat)
  var bListening = false;
  function rBuilder(b) {
    b.innerHTML = '<div class="dbc-split"><div class="dbc-card dbb-chat"><h3>🧩 D Builder <small>— buduje aplikacje i boty</small></h3><div class="dbb-log" id="dbb-log" aria-live="polite"></div>' +
      '<form id="dbb-form" class="dbb-form"><button type="button" id="dbb-mic" title="Mów do D Buildera">🎤</button><input id="dbb-in" placeholder="Opisz aplikację albo bota… (np. „kontroler MIDI do MC-707”)" autocomplete="off"><button type="submit">➤</button></form>' +
      '<div class="dbc-btns"><button type="button" data-q="pomoc">? pomoc</button><button type="button" data-q="zbuduj tapper BPM 128">🥁 BPM tool</button><button type="button" data-q="zbuduj kontroler MIDI do MC-707">🎹 MIDI controller</button><button type="button" data-q="zbuduj wizualizator gwiazd">🌌 visualizer</button><button type="button" data-q="zbuduj chatbota imprezowego">💬 chatbot</button><button type="button" data-q="zbuduj bota telegram w node">🤖 bot script</button></div></div>' +
      '<div class="dbc-card"><h3>📚 Moje aplikacje</h3><div id="dbb-apps"></div></div></div>';
    $('#dbb-form', b).onsubmit = function (e) { e.preventDefault(); var i = $('#dbb-in', b); var v = i.value; i.value = ''; if (v.trim()) global.DBuilder.ask(v); };
    $$('[data-q]', b).forEach(function (x) { x.onclick = function () { global.DBuilder.ask(x.dataset.q); }; });
    $('#dbb-mic', b).onclick = builderListen;
    paintBuilder();
  }
  function paintBuilder() {
    var lg = $('#dbb-log'), ap = $('#dbb-apps'); if (!lg || !global.DBuilder) return;
    lg.innerHTML = global.DBuilder.chat().map(function (m) { return '<div class="dbb-m ' + (m.role === 'user' ? 'u' : 'b') + (m.typing ? ' typing' : '') + '">' + esc(m.text) + (m.app ? '<div class="dbc-btns"><button type="button" data-pv="' + m.app + '">▶ podgląd</button><button type="button" data-ex="' + m.app + '">⇪ eksport</button></div>' : '') + '</div>'; }).join('') || '<div class="dbb-m b">Cześć — tu D Builder 🧩. Opisz aplikację albo bota (tekstem lub 🎤). Offline buduję z szablonów, z Twoim kluczem AI — cokolwiek.</div>';
    lg.scrollTop = 1e9;
    var cur = global.DBuilder.current();
    ap.innerHTML = global.DBuilder.apps().map(function (a) { return '<div class="dbb-app' + (cur && cur.id === a.id ? ' cur' : '') + '"><b>' + esc(a.name) + '</b><small>' + a.lang + ' · ' + Math.round(a.code.length / 1024) + ' KB · ' + esc(String(a.updated).slice(0, 16).replace('T', ' ')) + '</small><div class="dbc-btns"><button type="button" data-pv="' + a.id + '">▶</button><button type="button" data-ex="' + a.id + '">⇪</button><button type="button" data-ed="' + a.id + '">✏ edytuj</button><button type="button" data-rm="' + a.id + '">🗑</button></div></div>'; }).join('') || '<p class="dbc-hint">Pusto — zbuduj pierwszą aplikację.</p>';
    $$('[data-pv]', root).forEach(function (x) { x.onclick = function () { global.DBuilder.preview(x.dataset.pv); }; });
    $$('[data-ex]', root).forEach(function (x) { x.onclick = function () { global.DBuilder.exportApp(x.dataset.ex); }; });
    $$('[data-ed]', root).forEach(function (x) { x.onclick = function () { global.DBuilder.select(x.dataset.ed); var i = $('#dbb-in'); if (i) { i.placeholder = 'Co zmienić w „' + global.DBuilder.current().name + '”? (np. „zmień kolor na zielony”)'; i.focus(); } }; });
    $$('[data-rm]', root).forEach(function (x) { x.onclick = function () { if (confirm('Usunąć aplikację?')) global.DBuilder.remove(x.dataset.rm); }; });
  }
  // D Builder voice: native speech events are routed here while it listens (DBotNative.voice.target = 'builder')
  var SRc = global.SpeechRecognition || global.webkitSpeechRecognition;
  function builderListen() {
    var V = N() && N().voice, C = global.D7Chat, lang = C && C.ui ? (C.ui().lang === 'auto' ? C.ui().autoLang : C.ui().lang) : 'pl-PL';
    var inp = $('#dbb-in'), mic = $('#dbb-mic');
    if (bListening) { bListening = false; if (V) V.target = 'dbot'; try { global.D7Native && global.D7Native.stopListening(); } catch (_) {} if (mic) mic.classList.remove('on'); return; }
    if (global.D7Native && global.D7Native.startListening && V) {
      V.target = 'builder'; bListening = true; if (mic) mic.classList.add('on');
      V.builderSink = {
        listen: builderListen,
        voice: function (ev) {
          if (ev.type === 'partial' && inp) inp.value = ev.text || '';
          if (ev.type === 'result') { bListening = false; V.target = 'dbot'; if (mic) mic.classList.remove('on'); if (inp) inp.value = ''; if (ev.text) global.DBuilder.ask(ev.text); }
          if (ev.type === 'error' || ev.type === 'end') { if (ev.type === 'error') toast('🎤 ' + (ev.message || ev.error)); bListening = false; V.target = 'dbot'; if (mic) mic.classList.remove('on'); }
        }
      };
      global.D7Native.startListening(lang); return;
    }
    if (!SRc) { toast('🎤 Brak rozpoznawania mowy w tej przeglądarce'); return; }
    var r = new SRc(); r.lang = lang; r.interimResults = true; bListening = true; if (mic) mic.classList.add('on');
    r.onresult = function (e) { var t = ''; for (var i = e.resultIndex; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) { bListening = false; if (mic) mic.classList.remove('on'); if (inp) inp.value = ''; global.DBuilder.ask(t); return; } } if (inp) inp.value = t; };
    r.onend = r.onerror = function () { bListening = false; if (mic) mic.classList.remove('on'); };
    r.start();
  }

  // ------------------------------------------------------------------ Agents
  function rAgents(b) {
    var A = global.DBotAgents, S = global.D7Super; if (!A) { b.textContent = '—'; return; }
    var provs = ['auto'].concat(S ? S.order : ['xai', 'gemini', 'openai']);
    var grp = function (bot, title) {
      return '<h3>' + title + '</h3>' + A.list().filter(function (a) { return a.bot === bot; }).map(function (a) {
        return '<details class="dbc-agent"><summary><input type="checkbox" data-en="' + a.id + '"' + (a.enabled ? ' checked' : '') + ' aria-label="włącz"> ' + a.icon + ' <b>' + esc(a.name) + '</b> <small>' + (a.provider === 'auto' ? 'auto' : a.provider) + (a.model ? ' · ' + esc(a.model) : '') + ' · 🧠 ' + (a.notes || []).length + '</small></summary>' +
          row('Dostawca AI', '<select data-pv="' + a.id + '">' + provs.map(function (p) { return '<option' + (p === a.provider ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>') +
          row('Model', '<input data-md="' + a.id + '" value="' + esc(a.model || '') + '" placeholder="domyślny z ⚙">') +
          row('Pamięć agenta (ile notatek w prompcie)', '<input type="number" min="0" max="30" data-ms="' + a.id + '" value="' + (a.memSize == null ? 12 : a.memSize) + '">') +
          row('Rola (prompt)', '<textarea data-rl="' + a.id + '" rows="4">' + esc(a.roleCustom || a.role) + '</textarea>') +
          (a.builtin ? '' : row('Słowa kluczowe (regex)', '<input data-kw="' + a.id + '" value="' + esc(a.kw) + '">')) +
          '<div class="dbc-notes"><b>🧠 Nauka (👍/👎):</b>' + ((a.notes || []).slice().reverse().map(function (n, i) { return '<div>' + (n.up ? '👍 ' : '👎 ') + esc(n.text) + ' <button type="button" data-nd="' + a.id + '|' + ((a.notes.length - 1) - i) + '" aria-label="usuń">✕</button></div>'; }).join('') || ' <i>brak — oceniaj odpowiedzi w czacie</i>') + '</div>' +
          '<div class="dbc-btns"><button type="button" data-cl="' + a.id + '">⧉ klonuj</button>' + (a.builtin ? '<button type="button" data-rr="' + a.id + '">↺ rola domyślna</button>' : '<button type="button" data-rm="' + a.id + '">🗑 usuń</button>') + '</div></details>';
      }).join('');
    };
    b.innerHTML = '<div class="dbc-card"><p class="dbc-hint">Agentów dodajesz / klonujesz tylko Ty — żaden agent nie tworzy kopii sam. Klucze AI: ⚙ w czacie D Bot (tylko na tym urządzeniu).</p>' + grp('dbot', '🤖 D Bot — agenci') + grp('builder', '🧩 D Builder — agenci') +
      '<details class="dbc-agent"><summary>＋ <b>Dodaj agenta</b></summary>' + row('Nazwa', '<input id="na-name" placeholder="np. Lighting">') + row('Ikona', '<input id="na-icon" value="✳" maxlength="4">') + row('Bot', '<select id="na-bot"><option value="dbot">D Bot</option><option value="builder">D Builder</option></select>') + row('Słowa kluczowe', '<input id="na-kw" placeholder="swiatla|lights|dmx">') + row('Rola', '<textarea id="na-role" rows="3" placeholder="You are…"></textarea>') + '<button type="button" id="na-add">＋ dodaj</button></details>' +
      '<div class="dbc-row"><input id="ag-test" placeholder="Test routingu: wpisz zadanie…"><button type="button" id="ag-go">🧭 kto?</button></div><div id="ag-route" class="dbc-hint"></div></div>' +
      '<div class="dbc-card"><h3>📜 Log agentów <button type="button" id="ag-clr" class="dbc-mini">wyczyść</button></h3><div id="ag-log" class="dbc-log"></div></div>';
    var save = function () { A.save(); };
    $$('[data-en]', b).forEach(function (x) { x.onclick = function (e) { e.stopPropagation(); }; x.onchange = function () { A.byId(x.dataset.en).enabled = x.checked; save(); }; });
    $$('select[data-pv]', b).forEach(function (x) { x.onchange = function () { A.byId(x.dataset.pv).provider = x.value; save(); }; });
    $$('[data-md]', b).forEach(function (x) { x.onchange = function () { var v = x.value.trim(); A.byId(x.dataset.md).model = /^[A-Za-z0-9._-]{0,60}$/.test(v) ? v : ''; save(); }; });
    $$('[data-rl]', b).forEach(function (x) { x.onchange = function () { var a = A.byId(x.dataset.rl); if (a.builtin) a.roleCustom = x.value.trim() === a.role ? '' : x.value.slice(0, 3000); else a.role = x.value.slice(0, 3000); save(); }; });
    $$('[data-ms]', b).forEach(function (x) { x.onchange = function () { A.byId(x.dataset.ms).memSize = Math.max(0, Math.min(30, +x.value | 0)); save(); }; });
    $$('[data-kw]', b).forEach(function (x) { x.onchange = function () { A.byId(x.dataset.kw).kw = x.value.replace(/[^\w|\s-]/g, '').slice(0, 300); save(); }; });
    $$('[data-nd]', b).forEach(function (x) { x.onclick = function () { var p = x.dataset.nd.split('|'), a = A.byId(p[0]); a.notes.splice(+p[1], 1); save(); render(); }; });
    $$('[data-cl]', b).forEach(function (x) { x.onclick = function () { A.clone(x.dataset.cl); render(); }; });
    $$('[data-rr]', b).forEach(function (x) { x.onclick = function () { A.byId(x.dataset.rr).roleCustom = ''; save(); render(); }; });
    $$('[data-rm]', b).forEach(function (x) { x.onclick = function () { if (confirm('Usunąć agenta?')) { A.remove(x.dataset.rm); render(); } }; });
    $('#na-add', b).onclick = function () { var nm = $('#na-name', b).value.trim(); if (!nm) return; A.add({ name: nm, icon: $('#na-icon', b).value, bot: $('#na-bot', b).value, kw: $('#na-kw', b).value, role: $('#na-role', b).value }); render(); };
    $('#ag-go', b).onclick = function () { var r = A.route($('#ag-test', b).value, null); $('#ag-route', b).textContent = r.length ? '→ ' + r.map(function (a) { return a.icon + ' ' + a.name + ' (' + (a.bot === 'builder' ? 'D Builder' : 'D Bot') + ')'; }).join(' + ') : '→ żaden agent — D Bot odpowie sam (wiedza offline / AI)'; };
    $('#ag-clr', b).onclick = function () { A.log.clear(); paintLog(); };
    paintLog();
  }
  function paintLog() { var l = $('#ag-log'); if (!l) return; l.innerHTML = global.DBotAgents.log.items.slice(-60).reverse().map(function (x) { return '<div><small>' + esc(x.at.slice(11, 19)) + '</small> <b>' + esc(x.agent) + '</b> ' + esc(x.task) + (x.result ? ' → ' + esc(x.result) : '') + '</div>'; }).join('') || '<i>pusto</i>'; }

  // ------------------------------------------------------------------ DJ
  function rDj(b) {
    var DJ = global.DBotDJ; if (!DJ) return;
    var ao = DJ.auto.opts, po = DJ.party.opts;
    b.innerHTML = '<div class="dbc-card"><h3>🎧 DJ agent</h3><button type="button" id="dj-panic" class="dbc-panic">⏹ STOP AUTO / PARTY (natychmiast)</button><pre id="dj-status" class="dbc-pre"></pre></div>' +
      '<div class="dbc-card"><h3>🤖 Auto mix</h3><p class="dbc-hint">Wybiera następny utwór (BPM najbliżej), beat-sync na decku przeciwnym, start na takcie, przejście crossfaderem z bass swap, pętlą 4 beaty i echo na końcu frazy.</p>' +
      '<div class="dbc-btns"><button type="button" id="dj-auto">' + (DJ.auto.on ? '⏹ AUTO OFF' : '▶ AUTO MIX ON') + '</button></div>' +
      row('Przejście (takty)', '<select id="ao-bars">' + [4, 8, 16, 32].map(function (v) { return '<option' + (v === ao.bars ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>') +
      row('Graj utwór max (takty, 0 = do końca)', '<select id="ao-play">' + [16, 32, 64, 128, 0].map(function (v) { return '<option' + (v === ao.playBars ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>') +
      ['fx|FX (echo na wyjściu)', 'loops|Pętla na końcu utworu', 'bassSwap|Bass swap (EQ low)'].map(function (x) { var k = x.split('|'); return row(k[1], '<input type="checkbox" data-ao="' + k[0] + '"' + (ao[k[0]] ? ' checked' : '') + '>'); }).join('') + '</div>' +
      '<div class="dbc-card"><h3>🔥 Special X / Party</h3><div class="dbc-btns"><button type="button" id="dj-party">' + (DJ.party.on ? '⏹ PARTY OFF' : '🔥 PARTY ON') + '</button>' + [1, 2, 3].map(function (l) { return '<button type="button" data-lv="' + l + '" class="' + (DJ.party.level === l ? 'on' : '') + '">poziom ' + l + '</button>'; }).join('') + '</div>' +
      ['fx|Auto BEAT FX (1 takt)', 'rolls|Loop rolls (slip)', 'viz|MilkDrop intensywność + presety', 'drops|Build-up + drop na granicy taktu'].map(function (x) { var k = x.split('|'); return row(k[1], '<input type="checkbox" data-po="' + k[0] + '"' + (po[k[0]] ? ' checked' : '') + '>'); }).join('') + '</div>' +
      '<div class="dbc-card"><h3>🛠 Narzędzia decków</h3><div class="dbc-btns">' + ['play deck a', 'play deck b', 'sync b', 'loop 4 a', 'loop off a', 'beat fx echo', 'beat fx roll', 'fx off', 'crossfader a', 'crossfader srodek', 'crossfader b', 'bass kill a', 'bass reset a', 'filter -0.6 a', 'filter off a', 'next viz'].map(function (c) { return '<button type="button" data-tool="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div><p class="dbc-hint">Narzędzia AI: ' + esc(DJ.toolSpec()) + '</p></div>';
    $('#dj-panic', b).onclick = function () { toast(DJ.panic()); render(); };
    $('#dj-auto', b).onclick = function () { toast(DJ.auto.on ? DJ.auto.stop() : DJ.auto.start()); render(); };
    $('#dj-party', b).onclick = function () { toast(DJ.party.on ? DJ.party.stop() : DJ.party.start()); render(); };
    $$('[data-lv]', b).forEach(function (x) { x.onclick = function () { DJ.party.level = +x.dataset.lv; if (DJ.party.on) DJ.party.start(DJ.party.level); render(); }; });
    $('#ao-bars', b).onchange = function () { ao.bars = +this.value; DJ.saveOpts(); };
    $('#ao-play', b).onchange = function () { ao.playBars = +this.value; DJ.saveOpts(); };
    $$('[data-ao]', b).forEach(function (x) { x.onchange = function () { ao[x.dataset.ao] = x.checked; DJ.saveOpts(); }; });
    $$('[data-po]', b).forEach(function (x) { x.onchange = function () { po[x.dataset.po] = x.checked; DJ.saveOpts(); }; });
    $$('[data-tool]', b).forEach(function (x) { x.onclick = function () { var c = DJ.parse(x.dataset.tool.replace('fx off', 'beat fx echo off')); toast(c.map(function (k) { return DJ.run(k.tool, k.args); }).join(' · ') || '—'); paintDj(); }; });
    paintDj();
  }
  var djT = 0;
  function paintDj() { var p = $('#dj-status'); if (!p) return; p.textContent = global.DBotDJ.status() + '\n' + (global.DBotDJ.auto.log.slice(-4).join('\n')); clearTimeout(djT); djT = setTimeout(function () { if (tab === 'dj' && root && !root.hidden) paintDj(); }, 1000); }

  // ------------------------------------------------------------------ MIDI
  function rMidi(b) {
    var M = global.DBotMidiSync; if (!M) return;
    if (!apk()) { b.innerHTML = '<div class="dbc-card"><p>🎹 Natywne MIDI (android.media.midi) działa w aplikacji D.bot na Androidzie. W przeglądarce na komputerze użyj strony <a href="classic.html">Classic</a> (Web MIDI: CONNECT, Clock OUT/IN).</p></div>'; return; }
    var ok = N().MIDI.available(); M.pick(); if (M.out && !M.saved().outName) M.setPort('output', M.out); if (M.inp && !M.saved().inName) M.setPort('input', M.inp);
    var ps = M.ports();
    var opt = function (type, sel) { return ps.filter(function (p) { return p.type === type; }).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') || '<option value="">— brak —</option>'; };
    b.innerHTML = '<div class="dbc-card"><h3>🎹 MIDI · MC-707</h3><p>' + (ok ? 'android.media.midi ✓' : '⚠ ten telefon nie ma android.software.midi') + ' · porty: ' + ps.length + ' <button type="button" id="mi-ref" class="dbc-mini">↻ odśwież</button></p>' +
      row('Wyjście (→ MC-707)', '<select id="mi-out">' + opt('output', M.out) + '</select>') + row('Wejście (← MC-707)', '<select id="mi-in">' + opt('input', M.inp) + '</select>') +
      row('Tryb', '<select id="mi-mode"><option value="master"' + (M.mode === 'master' ? ' selected' : '') + '>MASTER — D.bot wysyła clock (deck → MC-707)</option><option value="slave"' + (M.mode === 'slave' ? ' selected' : '') + '>SLAVE — decki śledzą clock MC-707</option></select>') +
      '<div class="dbc-big" id="mi-bpm">—</div><div class="dbc-btns"><button type="button" id="mi-start">▶ START clock</button><button type="button" id="mi-stop">⏹ STOP</button></div>' +
      '<p>Faza (nudge): <span class="dbc-btns">' + [-5, -1, 1, 5].map(function (v) { return '<button type="button" data-nu="' + v + '">' + (v > 0 ? '+' : '') + v + ' ms</button>'; }).join('') + '</span> <b id="mi-off">' + M.offsetMs + ' ms</b></p>' +
      '<h3>CC test (kanał 1)</h3>' + [['FILTER', 80], ['MOD', 81], ['FX', 82], ['VOL', 7]].map(function (c) { return row(c[0] + ' CC' + c[1], '<input type="range" min="0" max="127" value="64" data-cc="' + c[1] + '">'); }).join('') +
      '<p class="dbc-hint">MC-707: [MENU] → SYSTEM → MIDI: przy MASTER ustaw Sync Mode = AUTO/MIDI i Rx Start/Stop ON; przy SLAVE: Sync Out ON. Kabel USB-C ↔ telefon (OTG). Zegar 24 PPQN generowany natywnie na wątku URGENT_AUDIO, tempo śledzi pitch decku MASTER, Start (FA) na najbliższym takcie.</p></div>';
    $('#mi-ref', b).onclick = function () { N().MIDI.request().then(function () { N().MIDI.refresh(); render(); }, function () { render(); }); };
    $('#mi-out', b).onchange = function () { M.setPort('output', this.value); };
    $('#mi-in', b).onchange = function () { M.setPort('input', this.value); };
    $('#mi-mode', b).onchange = function () { toast(M.setMode(this.value)); };
    $('#mi-start', b).onclick = function () { toast(M.start()); paintMidiStatus(); };
    $('#mi-stop', b).onclick = function () { toast(M.stop()); paintMidiStatus(); };
    $$('[data-nu]', b).forEach(function (x) { x.onclick = function () { M.nudge(+x.dataset.nu); $('#mi-off', b).textContent = M.offsetMs + ' ms'; }; });
    $$('[data-cc]', b).forEach(function (x) { x.oninput = function () { M.cc(+x.dataset.cc, +x.value, 0); }; });
    paintMidiStatus();
  }
  function paintMidiStatus() { var e = $('#mi-bpm'), M = global.DBotMidiSync; if (!e) return; e.textContent = (M.running ? (M.mode === 'master' ? '⏱ MASTER ' + M.bpm.toFixed(2) : '⏱ SLAVE ' + (M.slaveBpm ? M.slaveBpm.toFixed(2) : '…')) : '⏹ ' + M.deckBpm().toFixed(1)) + ' BPM'; }

  // ------------------------------------------------------------------ Auto-reply (APK)
  function rReply(b) {
    if (!apk()) return apkOnly(b, 'Auto-odpowiedzi na czatach (Messenger, WhatsApp, Telegram, SMS…)');
    var c = N().json(N().call('autoReplyConfig'), {}), S = global.D7Super;
    var hm = function (m) { m = m | 0; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); };
    b.innerHTML = '<div class="dbc-card"><h3>💬 Auto-odpowiedzi D Bot</h3>' +
      '<p>Dostęp do powiadomień: <b>' + (c.listenerEnabled ? '✅ przyznany' : '❌ brak') + '</b> <button type="button" id="ar-grant">' + (c.listenerEnabled ? 'Ustawienia dostępu' : '🔓 Przyznaj dostęp do powiadomień') + '</button></p>' +
      '<p class="dbc-hint">D Bot odpowiada przez akcję „Odpowiedz” w powiadomieniu (jak aplikacje auto-reply). Działa tylko gdy telefon jest włączony, a czat pokazuje powiadomienie. Nie czyta historii czatów. Nigdy nie wysyła prywatnych danych (e-mail, telefon, PIN, hasła, karty, klucze).</p>' +
      row('<b>Auto-odpowiedzi (główny włącznik)</b>', '<input type="checkbox" id="ar-en"' + (c.enabled ? ' checked' : '') + '>') +
      row('Prefiks „[D.bot]”', '<input type="checkbox" id="ar-pf"' + (c.prefix !== false ? ' checked' : '') + '>') +
      row('Pomijaj czaty grupowe', '<input type="checkbox" id="ar-gr"' + (c.skipGroups !== false ? ' checked' : '') + '>') +
      '<h3>Aplikacje</h3>' + (c.knownApps || []).map(function (a) { return row(esc(a.label), '<input type="checkbox" data-app="' + esc(a.pkg) + '"' + ((c.apps || []).indexOf(a.pkg) >= 0 ? ' checked' : '') + '>'); }).join('') +
      '<h3>Kontakty</h3>' + row('Tylko ci (whitelist, po przecinku; pusto = wszyscy)', '<input id="ar-wl" value="' + esc((c.whitelist || []).join(', ')) + '">') + row('Nigdy (blacklist)', '<input id="ar-bl" value="' + esc((c.blacklist || []).join(', ')) + '">') +
      '<h3>Limity</h3>' + row('Przerwa na kontakt (min)', '<input type="number" id="ar-cd" min="1" max="1440" value="' + (c.cooldownMin || 30) + '">') + row('Max dziennie / kontakt', '<input type="number" id="ar-cc" min="1" max="50" value="' + (c.capPerContact || 3) + '">') + row('Max dziennie łącznie', '<input type="number" id="ar-ct" min="1" max="500" value="' + (c.capTotal || 30) + '">') +
      row('Cisza nocna', '<input type="checkbox" id="ar-qo"' + (c.quietOn !== false ? ' checked' : '') + '> <input type="time" id="ar-qs" value="' + hm(c.quietStart == null ? 1380 : c.quietStart) + '"> – <input type="time" id="ar-qe" value="' + hm(c.quietEnd == null ? 420 : c.quietEnd) + '">') +
      row('Własna wiadomość (offline)', '<input id="ar-aw" maxlength="200" value="' + esc(c.away || '') + '" placeholder="np. Gram dziś set, odpiszę po 23:00 🎧">') +
      '<h3>AI w auto-odpowiedziach (opcjonalnie)</h3>' + row('Używaj AI', '<input type="checkbox" id="ar-ai"' + (c.useAi ? ' checked' : '') + '>') +
      '<p class="dbc-hint">Usługa w tle nie widzi localStorage — żeby AI działało w auto-odpowiedziach, skopiuj JEDEN klucz do prywatnej pamięci aplikacji (świadoma zgoda). Klucz: ' + (c.aiKeyStored ? '✅ zapisany (' + esc(c.aiProvider) + ')' : 'brak') + '.</p>' +
      '<div class="dbc-btns">' + (S ? S.order.filter(function (p) { return S.keyOf(p); }).map(function (p) { return '<button type="button" data-cp="' + p + '">⤵ użyj klucza ' + p + '</button>'; }).join('') : '') + (c.aiKeyStored ? '<button type="button" id="ar-delkey">🗑 usuń klucz z auto-reply</button>' : '') + '</div>' +
      '<div class="dbc-btns"><button type="button" id="ar-save" class="on">💾 Zapisz</button></div></div>' +
      '<div class="dbc-card"><h3>🧪 Test (nic nie wysyła)</h3>' + row('Od', '<input id="t-from" value="Ania">') + row('Wiadomość', '<input id="t-msg" value="Hej, grasz dziś?">') + '<button type="button" id="t-go">Sprawdź</button><pre id="t-out" class="dbc-pre"></pre></div>' +
      '<div class="dbc-card"><h3>📜 Wysłane odpowiedzi <button type="button" id="ar-clr" class="dbc-mini">wyczyść</button></h3><div id="ar-log" class="dbc-log"></div></div>';
    var tm = function (v) { var p = String(v || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
    var list = function (v) { return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); };
    $('#ar-grant', b).onclick = function () { N().call('openNotificationAccess'); };
    $('#ar-save', b).onclick = function () {
      var cfg = { enabled: $('#ar-en', b).checked, prefix: $('#ar-pf', b).checked, skipGroups: $('#ar-gr', b).checked, useAi: $('#ar-ai', b).checked,
        apps: $$('[data-app]', b).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.app; }), whitelist: list($('#ar-wl', b).value), blacklist: list($('#ar-bl', b).value),
        cooldownMin: +$('#ar-cd', b).value, capPerContact: +$('#ar-cc', b).value, capTotal: +$('#ar-ct', b).value, quietOn: $('#ar-qo', b).checked, quietStart: tm($('#ar-qs', b).value), quietEnd: tm($('#ar-qe', b).value), away: $('#ar-aw', b).value };
      if (cfg.enabled && !c.listenerEnabled) toast('⚠ Włączone, ale najpierw przyznaj dostęp do powiadomień');
      toast(N().call('autoReplySave', JSON.stringify(cfg)) ? '💾 Zapisane' : '⚠ Nie zapisano');
      render();
    };
    $$('[data-cp]', b).forEach(function (x) { x.onclick = function () { if (!confirm('Skopiować klucz ' + x.dataset.cp + ' do prywatnej pamięci D.bot, żeby auto-odpowiedzi mogły używać AI?')) return; N().call('autoReplyAiKey', x.dataset.cp, S.modelOf(x.dataset.cp), S.keyOf(x.dataset.cp)); render(); }; });
    var dk = $('#ar-delkey', b); if (dk) dk.onclick = function () { N().call('autoReplyAiKey', 'xai', '', ''); render(); };
    $('#t-go', b).onclick = function () { var r = N().json(N().call('autoReplyTest', 'com.whatsapp', $('#t-from', b).value, $('#t-msg', b).value, false), {}); $('#t-out', b).textContent = 'decyzja: ' + (r.decision || '?') + '\nodpowiedź (offline): ' + (r.reply || ''); };
    $('#ar-clr', b).onclick = function () { N().call('autoReplyClearLog'); render(); };
    var lg = N().json(N().call('autoReplyLog'), []);
    $('#ar-log', b).innerHTML = lg.slice().reverse().slice(0, 80).map(function (x) { return '<div><small>' + esc(String(x.at || '').slice(5, 16).replace('T', ' ')) + '</small> <b>' + esc(x.app) + '</b> · ' + esc(x.contact) + ' <i>' + esc(x.status) + '</i><br>← ' + esc(x['in']) + '<br>→ ' + esc(x.out) + '</div>'; }).join('') || '<i>pusto</i>';
  }

  // ------------------------------------------------------------------ Sync
  function rSync(b) {
    var L = global.DBotLive; if (!L) return;
    var c = L.cache(), g = L.google.status(), st = c.status || {};
    b.innerHTML = '<div class="dbc-card"><h3>🔄 Live sync (serwer Daniela)</h3><div class="dbc-big">' + (L.lastSync() ? '✅ ' + esc(L.lastSync()) : '— jeszcze nie') + '</div>' +
      '<p>Źródła: ' + (Object.keys(st).map(function (k) { return esc(k) + ' <b>' + esc(st[k]) + '</b>'; }).join(' · ') || '—') + '</p><p>Serwer: <code>' + esc((global.D7APK && global.D7APK.status().live) || '—') + '</code></p>' +
      '<p>Utwory: ' + L.tracks().length + ' · wpisy wiedzy: ' + L.lines().length + '</p><div class="dbc-btns"><button type="button" id="sy-now">🔄 Synchronizuj teraz</button></div>' +
      '<p class="dbc-hint">' + (apk() ? 'W tle co ~15 min (JobScheduler, gdy jest sieć), przy otwarciu i co 15 min gdy aplikacja jest otwarta. Cache: prywatny plik aplikacji (e-maile i klucze usunięte).' : 'Przeglądarka: przy otwarciu i co 15 min gdy strona jest otwarta.') + '</p></div>' +
      '<div class="dbc-card"><h3>🟢 Google Drive + Kalendarz (opcjonalnie, tylko odczyt)</h3>' + (apk() ?
        '<p>Status: <b>' + (g.connected ? '✅ połączone (' + esc(g.connectedAt) + ')' : g.clientIdSet ? 'client ID ustawiony — połącz' : 'WYŁĄCZONE — brak OAuth client ID') + '</b></p>' +
        row('OAuth client ID', '<input id="go-id" placeholder="123…-abc….apps.googleusercontent.com" value="' + esc(g.clientIdHint || '') + '">') + row('Client secret (jeśli Google go wydał dla „Desktop app”)', '<input id="go-sec" type="password" autocomplete="off">') +
        '<div class="dbc-btns"><button type="button" id="go-save">💾 Zapisz client ID</button>' + (g.clientIdSet ? '<button type="button" id="go-in">🔐 Połącz z Google</button>' : '') + (g.connected ? '<button type="button" id="go-out">Rozłącz</button>' : '') + '</div>' +
        '<details><summary>Jak utworzyć client ID (5 min, jednorazowo)</summary><ol><li>console.cloud.google.com → nowy projekt „D.bot”.</li><li>APIs &amp; Services → Library: włącz <b>Google Drive API</b> i <b>Google Calendar API</b>.</li><li>OAuth consent screen: External, dodaj siebie jako <b>Test user</b>, zakresy drive.readonly + calendar.readonly.</li><li>Credentials → Create credentials → OAuth client ID → typ <b>Desktop app</b> → skopiuj Client ID (i Client secret).</li><li>Wklej tutaj → Zapisz → Połącz z Google → zaloguj w przeglądarce → wróć do D.bot.</li></ol><p class="dbc-hint">Przekierowanie: http://127.0.0.1:&lt;port&gt;/ (loopback, PKCE S256). Tokeny tylko w prywatnej pamięci aplikacji, nic nie jest w APK.</p></details>'
        : '<p>Logowanie Google działa w aplikacji D.bot na Androidzie.</p>') + '</div>';
    $('#sy-now', b).onclick = function () { this.textContent = '… synchronizuję'; L.syncNow().then(function () { render(); }); };
    if (apk()) {
      $('#go-save', b).onclick = function () { var v = $('#go-id', b).value.trim(); if (v.indexOf('…') >= 0) { toast('Wklej pełny client ID'); return; } toast('Google: ' + L.google.setClient(v, $('#go-sec', b).value)); render(); };
      var gi = $('#go-in', b); if (gi) gi.onclick = function () { L.google.signIn(); toast('Otwieram logowanie Google w przeglądarce…'); };
      var go = $('#go-out', b); if (go) go.onclick = function () { L.google.signOut(); render(); };
    }
  }

  // ------------------------------------------------------------------ v46 Status dashboard (+ orbit, start/sync all, repairs)
  var COLORS = { green: '🟢', yellow: '🟡', red: '🔴', gray: '⚪' };
  function rStatus(b) {
    var Mo = global.DBotModules, A = global.DBotAgents; if (!Mo) { b.textContent = '—'; return; }
    var ags = A ? A.list() : [];
    b.innerHTML = '<div class="dbc-card dbc-holo"><div class="dbc-orbit" aria-hidden="true"><b>D</b>' + ags.map(function (a, i) { return '<span class="dbc-sat' + (a.enabled ? ' on' : '') + '" style="--i:' + i + ';--n:' + ags.length + '" title="' + esc(a.name) + '">' + a.icon + '</span>'; }).join('') + '</div>' +
      '<div class="dbc-btns dbc-center-btns"><button type="button" id="st-start" class="on">🚀 Uruchom wszystko</button><button type="button" id="st-sync">🔄 Synchronizuj wszystko</button><button type="button" id="st-auto">' + (global.DBotFullAuto && global.DBotFullAuto.on ? '⏹ FULL AUTO OFF' : '🤖 FULL AUTO ON') + '</button></div></div>' +
      '<div class="dbc-card"><h3>Moduły <small>(watchdog co 5 s · samonaprawa)</small></h3><div id="st-mods" class="dbc-mods"></div></div>' +
      '<div class="dbc-card" id="st-doctor"><h3>🩺 D Doctor <small>(agent naprawy i synchronizacji)</small></h3><div class="dbc-btns"><button type="button" id="dd-check">🩺 Sprawdź</button><button type="button" id="dd-fix" class="on">🛠 Napraw + synchronizuj</button></div>' +
      '<label class="dbc-row"><input type="checkbox" id="dd-start"' + (global.DBotDoctor && global.DBotDoctor.cfg().onStart ? ' checked' : '') + '> przegląd przy starcie aplikacji</label><label class="dbc-row"><input type="checkbox" id="dd-auto"' + (global.DBotDoctor && global.DBotDoctor.cfg().inAuto ? ' checked' : '') + '> co 3 min w FULL AUTO</label><pre id="dd-out" class="dbc-log"></pre></div>' +
      '<div class="dbc-card"><h3>🛠 Naprawy <button type="button" id="st-clr" class="dbc-mini">wyczyść</button></h3><div id="st-rep" class="dbc-log"></div></div>' +
      '<div class="dbc-card"><h3>🧠 Wspólna pamięć agentów</h3><div id="st-bus" class="dbc-log"></div></div>';
    $('#st-start', b).onclick = function () { var d = Mo.startAll('przycisk'); toast('🚀 Uruchomione: ' + d.join(', ')); setTimeout(paintStatus, 600); };
    $('#st-sync', b).onclick = function () { var x = this; x.textContent = '… synchronizuję'; Mo.syncAll().then(function () { x.textContent = '🔄 Synchronizuj wszystko'; paintStatus(); toast('🔄 Wszystko zsynchronizowane'); }); };
    $('#st-auto', b).onclick = function () { var F = global.DBotFullAuto; toast(F.on ? F.stop() : F.start()); render(); };
    $('#st-clr', b).onclick = function () { if (St()) St().set('repairs', []); paintStatus(); };
    var DD = global.DBotDoctor, ddOut = $('#dd-out', b);
    if (DD) {
      var ddShow = function () { var l = DD.last(); ddOut.textContent = l ? l.text : 'Jeszcze nie sprawdzano.'; };
      ddShow();
      $('#dd-check', b).onclick = function () { DD.run('check', { chat: true }); ddShow(); };
      $('#dd-fix', b).onclick = function () { DD.run('repair', { chat: true, why: 'przycisk w Center' }); ddShow(); paintStatus(); };
      $('#dd-start', b).onchange = function () { DD.setCfg('onStart', this.checked); };
      $('#dd-auto', b).onchange = function () { DD.setCfg('inAuto', this.checked); };
    } else $('#st-doctor', b).hidden = true;
    paintStatus();
  }
  function paintStatus(s) {
    var el = $('#st-mods'); if (!el) return;
    s = s || global.DBotModules.status();
    el.innerHTML = Object.keys(s).map(function (k) { var m = s[k]; return '<div class="dbc-mod ' + m.color + '"><span>' + COLORS[m.color] + '</span><b>' + esc(m.label) + '</b><small>' + esc(m.text) + '</small></div>'; }).join('');
    var rp = $('#st-rep'); if (rp) rp.innerHTML = (global.DBotRepairs ? global.DBotRepairs.list() : []).slice().reverse().slice(0, 40).map(function (x) { return '<div><small>' + esc(String(x.at).slice(11, 19)) + '</small> <b>' + esc(x.module) + '</b> ' + esc(x.what) + '</div>'; }).join('') || '<i>brak napraw — wszystko działa</i>';
    var bu = $('#st-bus'); if (bu && global.DBotBus) bu.innerHTML = global.DBotBus.recent(15).reverse().map(function (e) { return '<div><small>' + esc(e.at.slice(11, 19)) + '</small> <b>' + esc(e.from) + '</b> · ' + esc(e.kind) + ' — ' + esc(e.text) + '</div>'; }).join('') || '<i>pusto</i>';
  }

  // ------------------------------------------------------------------ v46 FULL AUTO + decision log
  function rAuto(b) {
    var F = global.DBotFullAuto, a = (St() && St().get('auto', {})) || {}; if (!F) return;
    var e = F.energy();
    b.innerHTML = '<div class="dbc-card dbc-holo"><h3>🤖 FULL AUTO — Super D Bot decyduje sam</h3><button type="button" id="au-sw" class="dbc-auto ' + (F.on ? 'on' : '') + '">' + (F.on ? '⏹ STOP FULL AUTO' : '▶ FULL AUTO ON') + '</button>' +
      '<p>Energia teraz: <b>' + Math.round(e.score * 100) + '%</b> (' + (e.night ? 'noc' : 'dzień') + ', ' + (e.bpm ? Math.round(e.bpm) + ' BPM' : 'decki stoją') + ')</p>' +
      '<p class="dbc-hint">D Bot sam: startuje Auto mix, włącza/wyłącza Party wg pory i energii, startuje MIDI clock gdy MC-707 jest podłączony, synchronizuje wszystko, kieruje zadania do agentów. Wszystko dzieje się TYLKO w aplikacji — auto-odpowiedzi na czatach zostają przy Twoich ustawieniach. Każdą decyzję możesz cofnąć (↶) — wtedy D Bot nie powtórzy jej przez 10 min.</p>' +
      row('Party od godziny', '<input type="number" min="0" max="23" id="au-from" value="' + (a.partyFrom == null ? 22 : a.partyFrom) + '">') + row('Party do godziny', '<input type="number" min="0" max="23" id="au-to" value="' + (a.partyTo == null ? 4 : a.partyTo) + '">') +
      row('Synchronizuj co (min)', '<input type="number" min="5" max="120" id="au-sync" value="' + (a.syncEveryMin || 15) + '">') + '</div>' +
      '<div class="dbc-card"><h3>📜 Dziennik decyzji</h3><div id="au-log" class="dbc-log"></div></div>';
    $('#au-sw', b).onclick = function () { toast(F.on ? F.stop() : F.start()); render(); };
    [['#au-from', 'auto.partyFrom'], ['#au-to', 'auto.partyTo'], ['#au-sync', 'auto.syncEveryMin']].forEach(function (x) { $(x[0], b).onchange = function () { St().set(x[1], +this.value); }; });
    paintDecisions();
  }
  function paintDecisions() {
    var el = $('#au-log'); if (!el) return; var F = global.DBotFullAuto;
    el.innerHTML = F.decisions().slice().reverse().slice(0, 60).map(function (d) { return '<div class="' + (d.undone ? 'undone' : '') + '"><small>' + esc(d.at.slice(11, 19)) + '</small> <b>' + esc(d.what) + '</b> — ' + esc(d.why) + (d.result ? '<br><small>' + esc(d.result) + '</small>' : '') + (d.undoable && !d.undone ? ' <button type="button" class="dbc-mini" data-undo="' + d.id + '">↶ cofnij</button>' : d.undone ? ' <i>cofnięte</i>' : '') + '</div>'; }).join('') || '<i>brak decyzji — włącz FULL AUTO</i>';
    $$('[data-undo]', el).forEach(function (x) { x.onclick = function () { toast('↶ ' + F.undo(x.dataset.undo)); paintDecisions(); }; });
  }

  // ------------------------------------------------------------------ v46 options
  function rOpts(b) {
    var O = global.DBotOpts, o = O.get(), A = global.DBotAgents, ui = St().get('ui', {});
    var pri = (o.priority || []).filter(function (id) { return A.byId(id); }).concat(A.list().map(function (a) { return a.id; }).filter(function (id) { return (o.priority || []).indexOf(id) < 0; }));
    var C = global.D7Chat, cu = C && C.ui ? C.ui() : { lang: 'pl-PL', tts: false };
    b.innerHTML = '<div class="dbc-card dbc-holo"><h3>🦈 Super D Bot — opcje</h3>' +
      '<div class="dbc-btns">' + Object.keys(O.pers).map(function (k) { return '<button type="button" data-pers="' + k + '" class="' + (o.personality === k ? 'on' : '') + '">' + O.pers[k].label + '</button>'; }).join('') + '</div>' +
      row('Długość odpowiedzi', '<select id="op-len">' + [['short', 'krótko'], ['normal', 'normalnie'], ['long', 'szczegółowo']].map(function (x) { return '<option value="' + x[0] + '"' + (o.length === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>') +
      row('Język', '<select id="op-lang"><option value="auto">AUTO</option>' + allLangs().map(function (l) { return '<option value="' + esc(l) + '"' + (cu.lang === l ? ' selected' : '') + '>' + esc(label(l)) + '</option>'; }).join('') + '</select>') +
      row('Czytaj odpowiedzi na głos', '<input type="checkbox" id="op-tts"' + (cu.tts ? ' checked' : '') + '>') +
      row('Szybkość głosu <b id="op-rv">' + (+o.rate || 1).toFixed(2) + '</b>', '<input type="range" min="0.5" max="2" step="0.05" id="op-rate" value="' + (+o.rate || 1) + '">') +
      row('Wysokość głosu <b id="op-pv">' + (+o.pitch || 1).toFixed(2) + '</b>', '<input type="range" min="0.5" max="2" step="0.05" id="op-pitch" value="' + (+o.pitch || 1) + '">') + '</div>' +
      '<div class="dbc-card"><h3>Kolejność agentów (priorytet)</h3><div id="op-pri">' + pri.map(function (id, i) { var a = A.byId(id); return '<div class="dbc-pri"><span>' + (i + 1) + '. ' + a.icon + ' ' + esc(a.name) + '</span><button type="button" class="dbc-mini" data-up="' + i + '">↑</button><button type="button" class="dbc-mini" data-dn="' + i + '">↓</button></div>'; }).join('') + '</div></div>' +
      '<div class="dbc-card"><h3>Szybkie polecenia</h3><textarea id="op-quick" rows="4">' + esc((o.quick || []).join('\n')) + '</textarea><p class="dbc-hint">Jedno polecenie na linię — pokażą się jako przyciski w zakładce Super D Bot.</p></div>' +
      '<div class="dbc-card"><h3>🌌 Wygląd</h3><div class="dbc-btns">' + [['galaxy', '🌌 Galaktyka'], ['nebula', '☁ Mgławica'], ['minimal', '◼ Minimal (najszybszy)']].map(function (x) { return '<button type="button" data-theme="' + x[0] + '" class="' + (ui.theme === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="dbc-card"><h3>💾 Ustawienia — zapis, eksport, import</h3><p class="dbc-hint">Wszystko zapisuje się automatycznie przy każdej zmianie (ostatnio: ' + esc(String(St().raw().savedAt || '—').slice(0, 19).replace('T', ' ')) + ')' + (global.DBotNative && global.DBotNative.has() ? ' + kopia w prywatnej pamięci aplikacji (przetrwa czyszczenie danych WebView)' : '') + '.</p>' +
      row('Klucze AI w kopii na urządzeniu', '<input type="checkbox" id="op-bk"' + (ui.backupKeys ? ' checked' : '') + '>') +
      row('Eksport z kluczami AI (uważaj komu wysyłasz)', '<input type="checkbox" id="op-ek">') +
      '<div class="dbc-btns"><button type="button" id="op-exp">⇪ Eksportuj ustawienia (.json)</button><label class="dbc-file">⇩ Importuj<input type="file" id="op-imp" accept="application/json,.json" hidden></label></div><textarea id="op-paste" rows="2" placeholder="…albo wklej tutaj JSON ustawień i kliknij Importuj tekst"></textarea><button type="button" id="op-impt" class="dbc-mini">Importuj tekst</button></div>';
    if (global.DBotStudio && global.DBotStudio.autoOpts) try { global.DBotStudio.autoOpts(b); } catch (_) {} // v47: 🤖 Auto switches (all ON by default)
    $$('[data-pers]', b).forEach(function (x) { x.onclick = function () { O.set('personality', x.dataset.pers); render(); }; });
    $('#op-len', b).onchange = function () { O.set('length', this.value); };
    $('#op-lang', b).onchange = function () { ensureChatLang(this.value); if (C) C.setLang(this.value); };
    $('#op-tts', b).onchange = function () { if (C) C.setTts(this.checked); };
    $('#op-rate', b).oninput = function () { O.set('rate', +this.value); $('#op-rv', b).textContent = (+this.value).toFixed(2); };
    $('#op-pitch', b).oninput = function () { O.set('pitch', +this.value); $('#op-pv', b).textContent = (+this.value).toFixed(2); };
    var mv = function (i, d) { var j = i + d; if (j < 0 || j >= pri.length) return; var t = pri[i]; pri[i] = pri[j]; pri[j] = t; O.set('priority', pri.slice()); render(); };
    $$('[data-up]', b).forEach(function (x) { x.onclick = function () { mv(+x.dataset.up, -1); }; });
    $$('[data-dn]', b).forEach(function (x) { x.onclick = function () { mv(+x.dataset.dn, 1); }; });
    $('#op-quick', b).onchange = function () { O.set('quick', this.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 30)); };
    $$('[data-theme]', b).forEach(function (x) { x.onclick = function () { global.DBotTheme.apply(x.dataset.theme); render(); }; });
    $('#op-bk', b).onchange = function () { St().set('ui.backupKeys', this.checked); St().flush(); };
    $('#op-exp', b).onclick = function () { St().exportFile($('#op-ek', b).checked); };
    var doImport = function (txt) { var r = St().importJson(txt); toast(r.ok ? '⇩ Zaimportowano ' + r.keys + ' ustawień — przeładowuję…' : '⚠ ' + r.error); if (r.ok) setTimeout(function () { location.reload(); }, 900); };
    $('#op-imp', b).onchange = function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { doImport(String(rd.result)); }; rd.readAsText(f); };
    $('#op-impt', b).onclick = function () { doImport($('#op-paste', b).value); };
  }

  // ------------------------------------------------------------------ Voice
  var langs = { stt: [], tts: [], voices: [], source: '' };
  function rVoice(b) {
    var V = N() && N().voice;
    b.innerHTML = '<div class="dbc-card"><h3>🎙 Głos i języki</h3>' +
      '<div class="dbc-btns"><button type="button" id="vo-load">🌐 Wczytaj języki urządzenia</button><button type="button" id="vo-convo" class="' + (V && V.convo ? 'on' : '') + '">🎙 Rozmowa ciągła: ' + (V && V.convo ? 'ON' : 'OFF') + '</button>' + (apk() ? '<button type="button" id="vo-inst">⬇ Zainstaluj głosy TTS</button>' : '') + '</div>' +
      row('Język rozpoznawania (' + (langs.stt.length || '14') + ')', '<select id="vo-lang"><option value="auto">AUTO (wykryj)</option>' + allLangs().map(function (l) { return '<option value="' + esc(l) + '">' + esc(label(l)) + '</option>'; }).join('') + '</select>') +
      '<p class="dbc-hint">Źródło listy: ' + esc(langs.source || 'wbudowane 14') + '. Odpowiedzi AI przychodzą w Twoim języku; offline D Bot odpowiada w 14 językach (reszta → angielski).</p>' +
      '<h3>Głosy TTS (' + langs.voices.length + ')</h3><div id="vo-voices" class="dbc-log">' + (langs.voices.map(function (v) { return '<div>' + esc(v.lang) + ' · ' + esc(v.name) + (v.offline ? ' · offline' : ' · sieć') + (v.installed === false ? ' · <b>do pobrania</b>' : '') + '</div>'; }).join('') || '<i>kliknij „Wczytaj języki urządzenia”</i>') + '</div><div id="vo-miss"></div></div>';
    var sel = $('#vo-lang', b), C = global.D7Chat; if (C && C.ui) sel.value = C.ui().lang;
    sel.onchange = function () { ensureChatLang(sel.value); if (C) C.setLang(sel.value); };
    $('#vo-load', b).onclick = loadLangs;
    $('#vo-convo', b).onclick = function () { setConvo(!(V && V.convo)); render(); };
    var ib = $('#vo-inst', b); if (ib) ib.onclick = function () { N().call('installTtsData'); };
  }
  function label(tag) { try { var dn = new Intl.DisplayNames([pl() ? 'pl' : 'en'], { type: 'language' }); return dn.of(tag) + ' (' + tag + ')'; } catch (_) { return tag; } }
  function allLangs() { var base = ['pl-PL', 'en-US', 'de-DE', 'es-ES', 'fr-FR', 'it-IT', 'pt-BR', 'uk-UA', 'ru-RU', 'cs-CZ', 'ja-JP', 'zh-CN', 'ar-SA', 'hi-IN']; return base.concat(langs.stt.filter(function (l) { return base.indexOf(l) < 0; }).sort()); }
  function loadLangs() {
    if (apk()) { N().call('speechLanguages'); N().call('ttsInfo'); toast('Pytam urządzenie o języki…'); return; }
    try { var vs = global.speechSynthesis ? global.speechSynthesis.getVoices() : []; langs.voices = vs.map(function (v) { return { name: v.name, lang: v.lang, offline: v.localService }; }); langs.stt = vs.map(function (v) { return v.lang; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }); langs.source = 'przeglądarka (speechSynthesis)'; } catch (_) {}
    addChatLangs(); render();
  }
  function onLangs(ev) { langs.stt = (ev.stt || []).filter(function (x) { return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(x); }); langs.source = ev.source + (ev.onDevice && ev.onDevice.length ? ' · offline: ' + ev.onDevice.length : ''); addChatLangs(); if (tab === 'voice') render(); }
  function onTts(ev) { langs.voices = ev.voices || []; langs.tts = ev.languages || []; if (tab === 'voice') render(); }
  function ttsMissing(ev) {
    var m = $('#vo-miss'); var C = global.D7Chat;
    if (C) C.add('sys', '🔈 ' + (ev.message || 'Brak głosu ' + ev.lang) + (apk() ? ' → D.bot Center → Głos → „Zainstaluj głosy TTS”.' : ''));
    if (m) m.innerHTML = '<p>⚠ Brak głosu: ' + esc(ev.lang) + ' <button type="button" onclick="DBotNative.call(\'installTtsData\')">⬇ zainstaluj</button></p>';
  }
  function ensureChatLang(l) { var s = document.getElementById('d7c-lang'); if (!s || l === 'auto') return; if (!$$('option', s).some(function (o) { return o.value === l; })) { var o = document.createElement('option'); o.value = l; o.textContent = label(l); s.appendChild(o); } }
  function addChatLangs() { var s = document.getElementById('d7c-lang'); if (!s) return; var have = {}; $$('option', s).forEach(function (o) { have[o.value] = 1; }); langs.stt.forEach(function (l) { if (!have[l]) { var o = document.createElement('option'); o.value = l; o.textContent = label(l); s.appendChild(o); } }); }

  // chat command shortcuts (before agents / super bot)
  function hook() {
    var S = global.D7Super; if (!S || S.__ctrHooked) return !!(S && S.__ctrHooked);
    var orig = S.handle;
    S.handle = function (text, meta) {
      var n = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').trim();
      var m = n.match(/^(?:otworz |open )?(center|centrum|d\.?bot center|auto-?reply|auto-?odpowiedzi|autoodpowiedz|sync|synchronizacja|midi|glos|voice|jezyki|languages|dj panel|panel dj)$/);
      if (m) { var t = /reply|odpow/.test(m[1]) ? 'reply' : /sync/.test(m[1]) ? 'sync' : /midi/.test(m[1]) ? 'midi' : /glos|voice|jezyk|lang/.test(m[1]) ? 'voice' : /dj/.test(m[1]) ? 'dj' : 'dbot'; open(t); var C = global.D7Chat; if (C) { C.add('user', text); C.add('bot', '◎ D.bot Center → ' + t); } return true; }
      if (/^(rozmowa ciagla|tryb rozmowy|conversation mode|continuous)( on)?$/.test(n)) { setConvo(true); return true; }
      if (/^(stop rozmowa|koniec rozmowy|rozmowa off|stop conversation)$/.test(n)) { setConvo(false); var C2 = global.D7Chat; if (C2) { C2.add('user', text); C2.add('bot', '🎙 Rozmowa ciągła OFF'); } return true; }
      return orig.apply(this, arguments);
    };
    S.__ctrHooked = true; return true;
  }
  var tries = 0;
  (function poll() { if (!hook() && ++tries < 80) setTimeout(poll, 300); })();
  function boot() { mount(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); }); else setTimeout(boot, 300);

  global.DBotCenter = { onStatus: function (s) { if (root && !root.hidden && tab === 'status') paintStatus(s); if (root && !root.hidden && tab === 'auto') paintDecisions(); }, tab: function () { return tab; }, open: open, close: close, show: show, render: render, setConvo: setConvo, langs: function () { return langs; }, loadLangs: loadLangs };
})(typeof window !== 'undefined' ? window : globalThis);
