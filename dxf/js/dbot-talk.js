/*
 * D Bot v46 — „Rozmowa” layer:
 *  1. Build from the SAME conversation: „zbuduj/zrób/stwórz … aplikację / grę / narzędzie / bota …” said or typed to D Bot is
 *     built by D Builder in the background and answered right in D Bot's chat (▶ podgląd · ⇪ eksport · ✏ otwórz w D Builder);
 *     follow-ups („zmień kolor na zielony”, „dodaj reset”) edit that app. „stwórz agenta …” creates a new agent (panel Agenci).
 *  2. „🎙 Rozmowa na żywo”: hands-free loop listen → answer → speak → listen, live transcript, barge-in (talk over the bot to
 *     interrupt; its own voice is filtered as echo), big buttons, works with native Android speech or the browser's.
 * window.DBotTalk
 */
(function (global) {
  'use strict';
  function N() { return global.DBotNative; }
  function apk() { return !!(N() && N().has()); }
  function C() { return global.D7Chat; }
  function norm(s) { return String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ================================================================== 1. build apps / bots / agents from the conversation
  var VERB = '(zbuduj|zbudowac|zbudujesz|zrob|zrobic|zrobisz|stworz|stworzyc|stworzysz|napisz|napisac|napiszesz|przygotuj|wygeneruj|build|make|create|write|generate|code)';
  var THING = '(aplikacj\\w*|apk\\w*|appk?\\w*|app\\b|gr[aeyę]\\b|gierk\\w*|narzedzi\\w*|tool\\w*|stron\\w*|website|widget\\w*|kalkulator\\w*|calculator|timer\\w*|licznik\\w*|counter|tapper|metronom\\w*|wizualizator\\w*|visuali[sz]er|kontroler\\w*|controller|bot\\w*|chatbot\\w*|skrypt\\w*|script)';
  var RE_BUILD = new RegExp('\\b' + VERB + '\\b.{0,60}\\b' + THING), RE_AGENT = new RegExp('\\b(' + VERB.slice(1, -1) + '|dodaj|add|utworz)\\b.{0,40}\\b(agent\\w*)\\b');
  var RE_EDIT = /^(zmien|dodaj|usun|popraw|napraw|niech|zrob zeby|zrob tak|make it|change|add|remove|fix|edit|ustaw|powieksz|zmniejsz)\b/;
  var lastBuild = { at: 0, id: null };
  function sayBot(text) { var c = C(); return c ? c.add('bot', text) : null; }
  function sayUser(text) { var c = C(); if (c) c.add('user', text); try { global.BotD && global.BotD.Memory.addChat('user', text); } catch (_) {} }
  function appButtons(node, app) {
    if (!node || !app || !node.appendChild) return;
    var bar = document.createElement('div'); bar.className = 'dbot-brain-btns';
    [['▶ Podgląd', function () { global.DBuilder.select(app.id); global.DBuilder.preview(app.id); }], ['⇪ Eksport', function () { global.DBuilder.select(app.id); global.DBuilder.exportApp(app.id); }], ['✏ Otwórz w D Builder', function () { global.DBuilder.select(app.id); if (global.DBotCenter) global.DBotCenter.open('builder'); }]].forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = x[0]; b.onclick = x[1]; bar.appendChild(b);
    });
    node.appendChild(bar);
  }
  function buildFromChat(text, isEdit) {
    var B = global.DBuilder; if (!B) return false;
    sayUser(text);
    var c = C(), typing = c && c.add('bot typing', '🧩 D Builder ' + (isEdit ? 'zmienia' : 'buduje') + '… ' + (global.D7Super && global.D7Super.aiOn() ? '' : global.D7Super && global.D7Super.localOn() ? '(🧠 darmowy mózg na telefonie, 1–3 min)' : '(szablon offline)'));
    var n = norm(text);
    var q = isEdit ? text : (/^(zbuduj|zrob|stworz|napisz|build|make|create|write|nowa|nowy|new)\b/.test(n) ? text : 'nowa: ' + text);
    if (isEdit && lastBuild.id) B.select(lastBuild.id);
    return B.ask(q).then(function (res) {
      if (typing && c.remove) c.remove(typing);
      var app = res && res.app;
      if (app) { lastBuild = { at: Date.now(), id: app.id }; if (global.DBotBus) global.DBotBus.post('D Builder', 'build', (isEdit ? 'zmiana: ' : 'nowa: ') + app.name); }
      var node = sayBot('🧩 ' + (res ? res.text : 'D Builder nie odpowiedział') + (app ? '\n„' + app.name + '” jest w Moich aplikacjach — powiedz np. „zmień kolor na zielony”, żeby poprawić.' : ''));
      appButtons(node, app);
      if (global.D7Super && global.D7Super.pushConvo) global.D7Super.pushConvo(text, res ? res.text : '');
      if (Live.on && res) Live.speak(app ? (isEdit ? 'Gotowe, zmieniłem aplikację ' : 'Gotowe! Zbudowałem aplikację ') + app.name + '.' : String(res.text).slice(0, 200));
      return res;
    });
  }
  function makeAgent(text) {
    var A = global.DBotAgents; if (!A) return false;
    var desc = String(text).replace(/^.*?\bagent\w*\b\s*(do|od|for|który|ktory|that|which|:)?\s*/i, '').trim() || 'pomocnik';
    var name = (desc.charAt(0).toUpperCase() + desc.slice(1)).split(/[,.;]/)[0].slice(0, 32);
    var kw = norm(desc).split(' ').filter(function (w) { return w.length > 3; }).slice(0, 8).join('|');
    var a = A.add({ name: name, icon: '✳', kw: kw, bot: 'dbot', role: 'You are the „' + name + '” agent of D Bot. Your speciality: ' + desc + '. Be practical, concrete and friendly. Never reveal keys, PINs, e-mails or phone numbers.' });
    sayUser(text);
    var node = sayBot('🧭 Nowy agent „' + a.name + '” utworzony i włączony (słowa: ' + (kw || '—') + '). Wywołaj go „@' + a.id + ' …” albo po prostu pytaj o ten temat. Rolę zmienisz w Center → Agenci.');
    if (global.DBotBus) global.DBotBus.post('D Bot', 'agent', 'nowy agent: ' + a.name);
    if (global.D7Super && global.D7Super.pushConvo) global.D7Super.pushConvo(text, 'Utworzyłem agenta ' + a.name);
    if (Live.on) Live.speak('Utworzyłem nowego agenta ' + a.name + '.');
    return !!node || true;
  }
  /** returns true when the message was taken */
  function intercept(text) {
    var n = norm(text);
    if (/^(rozmowa na zywo|rozmawiajmy|tryb rozmowy|live talk|live conversation|talk to me)$/.test(n)) { sayUser(text); Live.start(); return true; }
    if (global.DBotStudio && global.DBotStudio.intent(text)) return false; // v47: songs / loops / MPC / BPM go to D Song / D Loop
    if (RE_AGENT.test(n) && !/\b(bot\w*|aplikacj\w*|app)\b/.test(n.replace(/agent\w*/, ''))) return makeAgent(text);
    if (RE_BUILD.test(n)) { buildFromChat(text, false); return true; }
    if (lastBuild.id && Date.now() - lastBuild.at < 20 * 60000 && RE_EDIT.test(n) && !(global.DBotDoctor && global.DBotDoctor.intent(text)) && !(global.DBotDJ && global.DBotDJ.parse && global.DBotDJ.parse(text).length)) { buildFromChat(text, true); return true; }
    return false;
  }
  function hook() {
    var S = global.D7Super; if (!S || !S.__agHooked) return false;
    if (S.handle.__talk) return true;
    var orig = S.handle;
    var h = function (text, meta) { try { if (intercept(String(text || '').trim())) return true; } catch (e) { console.warn('[DBotTalk]', e); } return orig.apply(this, arguments); };
    h.__talk = true; S.handle = h; return true;
  }
  var tries = 0; (function poll() { if (!hook() && ++tries < 120) setTimeout(poll, 250); })();
  setInterval(hook, 5000); // re-hook after an agents re-hook (self-healing)

  // ================================================================== 2. live voice conversation
  var Live = { on: false, state: 'off', lines: [], spokenWords: [], speaking: false, rec: null, el: null, saveTts: null };
  function words(t) { return norm(t).replace(/[^\p{L}\p{N} ]/gu, ' ').split(' ').filter(Boolean); }
  function isEcho(t) {
    var w = words(t); if (!w.length || !Live.spokenWords.length) return false;
    var set = {}; Live.spokenWords.forEach(function (x) { set[x] = 1; });
    var hit = w.filter(function (x) { return set[x]; }).length;
    return hit / w.length >= 0.6;
  }
  var STOPWORDS = /^(stop|czekaj|poczekaj|przestan|cisza|dosc|wait|hold on|enough|zamknij sie|halo)\b/;
  function lang() { var c = C(); try { var u = c.ui(); return u.lang === 'auto' ? (u.autoLang || navigator.language || 'pl-PL') : u.lang; } catch (_) { return 'pl-PL'; } }
  function setState(s, extra) { Live.state = s; paint(extra); }
  function line(who, text, partial) {
    var last = Live.lines[Live.lines.length - 1];
    if (last && last.partial && last.who === who) { last.text = text; last.partial = !!partial; } else Live.lines.push({ who: who, text: text, partial: !!partial });
    Live.lines = Live.lines.slice(-30); paint();
  }
  function listen(barge) {
    if (!Live.on) return;
    if (!barge) setState('listening');
    if (apk()) { N().call('liveListen', lang(), !!barge); return; }
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SR) { setState('error', 'Ten WebView/przeglądarka nie ma rozpoznawania mowy — użyj aplikacji D Bot na Androidzie.'); return; }
    try { if (Live.rec) { var o53 = Live.rec; Live.rec = null; o53.onresult = o53.onerror = o53.onend = o53.onspeechstart = null; o53.abort(); } } catch (_) {}
    var r = new SR(); Live.rec = r; r.lang = lang(); r.interimResults = true; r.continuous = false;
    r.onresult = function (e) { if (Live.rec !== r) return; var t = '', fin = false; for (var i = e.resultIndex; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; } onVoice({ type: fin ? 'result' : 'partial', text: t }); };
    r.onspeechstart = function () { onVoice({ type: 'speechstart' }); };
    r.onerror = function (e) { if (Live.rec !== r) return; onVoice({ type: 'error', error: e.error }); };
    r.onend = function () { if (Live.rec !== r) return; Live.rec = null; onVoice({ type: 'end' }); };
    try { r.start(); } catch (_) {}
  }
  function stopTts() { var c = C(); try { if (apk()) N().call('liveStopSpeaking'); if (c && c.stopSpeaking) c.stopSpeaking(); if (global.speechSynthesis) speechSynthesis.cancel(); } catch (_) {} Live.speaking = false; }
  function interrupt(why) { if (!Live.speaking) return; stopTts(); line('sys', '⤺ przerwano' + (why ? ' (' + why + ')' : '')); setState('listening'); }
  var gotFinal = false;
  function onVoice(ev) {
    if (!Live.on) return;
    if (ev.type === 'ready') { if (!Live.speaking) setState('listening'); return; }
    if (ev.type === 'speechstart') { if (!Live.speaking) setState('hearing'); return; }
    if (ev.type === 'partial') {
      var t = ev.text || '';
      if (Live.speaking) { if (STOPWORDS.test(norm(t)) || (!isEcho(t) && words(t).length >= 2)) interrupt(); else return; }
      setState('hearing'); line('me', t, true); return;
    }
    if (ev.type === 'result') {
      var txt = String(ev.text || '').trim();
      if (!txt || (Live.speaking && isEcho(txt))) return; // own voice
      if (Live.speaking) interrupt();
      if (STOPWORDS.test(norm(txt)) && words(txt).length <= 2) { line('me', txt); setState('listening'); setTimeout(function () { listen(false); }, 300); return; }
      if (/^(koniec rozmowy|zakoncz rozmowe|end conversation|stop talking|do widzenia|pa pa)$/.test(norm(txt))) { line('me', txt); Live.stop('Do usłyszenia! 👋'); return; }
      gotFinal = true; line('me', txt); setState('thinking');
      Live.awaiting = Date.now();
      var c = C(); if (c) c.send(txt, { live: true });
      clearTimeout(Live.safety); Live.safety = setTimeout(function () { if (Live.on && Live.state === 'thinking') { setState('listening'); listen(false); } }, 120000);
      return;
    }
    if (ev.type === 'error' || ev.type === 'end') {
      if (Live.speaking) return; // barge-in recognizer ended while the bot still talks → speaking 'done' re-listens
      if (Live.state === 'thinking') return;
      if (ev.type === 'error' && /permission|not-allowed|unavailable/.test(String(ev.error || ''))) { setState('error', ev.message || 'Brak dostępu do mikrofonu'); return; }
      clearTimeout(Live.relT); Live.relT = setTimeout(function () { if (Live.on && !Live.speaking && Live.state !== 'thinking') listen(false); }, ev.type === 'error' ? 700 : 350);
    }
  }
  Live.speak = function (text) {
    var c = C(); if (!c || !Live.on) return;
    var t = String(text || '').replace(/```[\s\S]*?```/g, ' (kod w czacie) ').replace(/[#*_`>]/g, '').replace(/https?:\/\/\S+/g, '').slice(0, 900);
    Live.spokenWords = words(t); Live.speaking = true; setState('speaking');
    var was = c.ui().tts; c.speak(t);
    // barge-in: keep listening while speaking (echo of our own voice is filtered)
    setTimeout(function () { if (Live.on && Live.speaking) listen(true); }, apk() ? 250 : 400);
    clearTimeout(Live.ttsSafety); Live.ttsSafety = setTimeout(function () { if (Live.speaking) onTtsDone(); }, 8000 + t.length * 90);
    return was;
  };
  function onTtsDone() { if (!Live.on) return; Live.speaking = false; clearTimeout(Live.ttsSafety); setState('listening'); setTimeout(function () { if (Live.on && !Live.speaking && Live.state !== 'thinking') listen(false); }, 300); }
  // bot replies appear in the chat log → speak them (single place for every module: Bot D, super bot, agents, D Builder)
  var mo = null;
  function watchLog() {
    var log = document.getElementById('d7c-log'); if (!log || mo) return !!mo;
    mo = new MutationObserver(function (ms) {
      if (!Live.on) return;
      ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) {
        if (!n.classList || !n.classList.contains('bot') || n.classList.contains('typing') || n.classList.contains('old')) return;
        if (Live.state !== 'thinking' && !(Live.awaiting && Date.now() - Live.awaiting < 120000)) return;
        Live.awaiting = 0; clearTimeout(Live.safety);
        var t = (n.innerText || n.textContent || '').trim(); line('bot', t.slice(0, 600)); Live.speak(t);
      }); });
    });
    mo.observe(log, { childList: true });
    return true;
  }
  Live.start = function () {
    var c = C(); if (!c) return 'Czat nie jest gotowy';
    if (Live.on) return 'Rozmowa na żywo już trwa';
    if (!c.mounted && c.mount) c.mount({ standalone: true });
    watchLog();
    Live.on = true; Live.lines = []; Live.saveTts = c.ui().tts; if (c.ui().tts) c.setTts(false); // live mode speaks itself (no double voice)
    if (N() && N().voice) { N().voice.convo = false; N().voice.live = true; N().voice.liveSink = { voice: onVoice }; }
    open(); line('sys', '🎙 Rozmowa na żywo — mów śmiało. Możesz mi przerwać w każdej chwili. Powiedz „koniec rozmowy”, żeby zakończyć.');
    if (global.DBotState) global.DBotState.set('ui.live', true);
    var hi = /^pl/.test(lang()) ? 'Słucham, o czym pogadamy?' : 'I\'m listening — what shall we talk about?';
    line('bot', hi); Live.speak(hi);
    return '🎙 Rozmowa na żywo włączona';
  };
  Live.stop = function (bye) {
    if (!Live.on) return '';
    Live.on = false; stopTts(); clearTimeout(Live.relT); clearTimeout(Live.safety);
    try { if (apk()) N().call('stopListening'); else if (Live.rec) Live.rec.abort(); } catch (_) {}
    try { if (global.D7Native && global.D7Native.stopListening) global.D7Native.stopListening(); } catch (_) {}
    if (N() && N().voice) { N().voice.live = false; N().voice.liveSink = null; }
    var c = C(); if (c && Live.saveTts) c.setTts(true);
    if (global.DBotState) global.DBotState.set('ui.live', false);
    setState('off'); if (Live.el) Live.el.hidden = true;
    if (bye && c) c.add('bot', bye);
    return '⏹ Rozmowa na żywo zakończona';
  };
  Live.onTts = function (ev) { if (!Live.on) return; if (ev.state === 'done' || ev.state === 'error') onTtsDone(); };
  Live.voice = onVoice;

  // ---- UI: full-screen glass panel with orb + live transcript
  var LABEL = { off: '', listening: '🎙 Słucham…', hearing: '🗣 Słyszę Cię…', thinking: '🧠 Myślę…', speaking: '🔊 Mówię — wejdź mi w słowo, żeby przerwać', error: '⚠' };
  function open() {
    if (!Live.el) {
      var d = document.createElement('div'); d.id = 'dbot-live'; d.className = 'dbot-live'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Rozmowa na żywo z D Bot');
      d.innerHTML = '<div class="dl-top"><b>🎙 Rozmowa na żywo · D Bot</b><span class="dl-lang"></span></div><div class="dl-orb" aria-hidden="true"><i></i><img src="icons/bot-d-shark.png" alt=""></div><div class="dl-state" aria-live="polite"></div><div class="dl-log" aria-live="polite"></div>' +
        '<div class="dl-btns"><button type="button" class="dl-int">✋ Przerwij</button><button type="button" class="dl-type">⌨ Pisz</button><button type="button" class="dl-end">⏹ Zakończ</button></div>';
      document.body.appendChild(d); Live.el = d;
      d.querySelector('.dl-end').onclick = function () { Live.stop(); };
      d.querySelector('.dl-int').onclick = function () { interrupt('dotknięcie'); listen(false); };
      d.querySelector('.dl-type').onclick = function () { Live.stop(); var c = C(); if (c && c.open) c.open(); };
      d.querySelector('.dl-orb').onclick = function () { if (Live.speaking) interrupt('dotknięcie'); listen(false); };
    }
    Live.el.hidden = false; paint();
  }
  function paint(extra) {
    var d = Live.el; if (!d) return;
    d.setAttribute('data-state', Live.state);
    d.querySelector('.dl-state').textContent = (LABEL[Live.state] || '') + (extra ? ' ' + extra : '');
    d.querySelector('.dl-lang').textContent = lang();
    d.querySelector('.dl-log').innerHTML = Live.lines.slice(-12).map(function (l) { return '<p class="' + l.who + (l.partial ? ' partial' : '') + '">' + (l.who === 'me' ? '🧑 ' : l.who === 'bot' ? '🦈 ' : '') + esc(l.text) + '</p>'; }).join('');
    var lg = d.querySelector('.dl-log'); lg.scrollTop = lg.scrollHeight;
  }
  // big entry button in the chat panel
  function addChatButton() {
    var c = C(); if (!c || !c.root || c.root.querySelector('.dbot-live-btn')) return !!(c && c.root && c.root.querySelector('.dbot-live-btn'));
    var b = document.createElement('button'); b.type = 'button'; b.className = 'dbot-live-btn'; b.innerHTML = '🎙 Rozmowa na żywo';
    b.title = 'Bez rąk: mówisz → D Bot odpowiada głosem → słucha dalej. Możesz przerwać w każdej chwili.';
    b.onclick = function () { Live.on ? Live.stop() : Live.start(); };
    var form = c.root.querySelector('form') || c.root.querySelector('.d7c-input, .d7c-form');
    if (form && form.parentNode) form.parentNode.insertBefore(b, form); else c.root.appendChild(b);
    return true;
  }
  var t2 = 0; (function poll() { if (!addChatButton() && ++t2 < 120) setTimeout(poll, 500); })();

  global.DBotTalk = { intercept: intercept, build: buildFromChat, makeAgent: makeAgent, live: Live, isEcho: isEcho, re: { build: RE_BUILD, agent: RE_AGENT }, lastBuild: function () { return lastBuild; } };
})(typeof window !== 'undefined' ? window : globalThis);
