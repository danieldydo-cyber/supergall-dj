/**
 * D Bot · PRO8 Fluid (v43) — floating chat with bot „D Bot” on EVERY page + voice (Daniel Dydo · Kraków)
 * - Floating button + expandable window (mobile bottom-sheet), minimise, left/right side, overlay in fullscreen viz.
 * - One shared chat history for all pages/tabs: BotD.Memory ('x7-chat' in localStorage) + live 'storage' sync between tabs;
 *   online sync through the existing BotD.Sync queue (/api/chat-log), offline queue unchanged.
 * - Voice: 🎤 speech-to-text (pl-PL default, EN, AUTO language switch) and optional 🔊 spoken replies.
 *   Android APK: native bridge window.D7Native.startListening(lang) / stopListening() / speak(text, lang) (SpeechRecognizer + TextToSpeech).
 *   Web: SpeechRecognition / webkitSpeechRecognition + speechSynthesis, clear fallback message when missing.
 * - Pages with special-x.js (index / pro-dj / kali-live) hand every text to SpecialX (full DJ command set);
 *   other pages (classic, legacy) run their own BotD brain with a small page adapter.
 * Classic script (no modules). Exposes window.D7Chat.
 */
(function (global) {
  'use strict';
  var VERSION = '43';
  var LS_UI = 'd7c-ui';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  var ui = lsGet(LS_UI, null) || {};
  if (typeof ui.tts !== 'boolean') ui.tts = false;
  var D7_LANGS = ['pl-PL', 'en-US', 'de-DE', 'es-ES', 'fr-FR', 'it-IT', 'pt-BR', 'uk-UA', 'ru-RU', 'cs-CZ', 'ja-JP', 'zh-CN', 'ar-SA', 'hi-IN']; // v44 super bot: 14 languages
  if (ui.lang !== 'auto' && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/.test(String(ui.lang || ''))) ui.lang = 'pl-PL'; // v45: every device language
  if (ui.side !== 'left') ui.side = 'right';
  function saveUi() { lsSet(LS_UI, { tts: ui.tts, lang: ui.lang, side: ui.side, open: !!ui.open }); }

  var C = { mounted: false, handler: null, root: null, log: null, input: null, listening: false, autoLang: 'pl-PL', lastSeen: '', standalone: false, version: VERSION };
  var SR = global.SpeechRecognition || global.webkitSpeechRecognition || null;
  function nativeVoice() { try { return !!(global.D7Native && typeof global.D7Native.startListening === 'function'); } catch (_) { return false; } }
  function nativeTts() { try { return !!(global.D7Native && typeof global.D7Native.speak === 'function'); } catch (_) { return false; } }

  // ------------------------------------------------------------------ language helpers
  var PL_WORDS = /\b(jest|nie|tak|czy|co|jak|mam|moje|moj|wlacz|wylacz|zagraj|graj|pusc|nastepn\w*|poprzedni\w*|pelny|ekran|petla|pomoc|kalendarz|pamiec|siema|czesc|dzieki|prosze|teraz|radio|glosnosc|zapamietaj|znajdz|po polsku)\b/;
  var EN_WORDS = /\b(the|what|is|are|my|play|next|previous|please|show|turn|on|off|full ?screen|help|what's|how|you|who|loop|deck|speak english|in english|thanks|stop the)\b/;
  function norm(s) { return String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }
  function detectLang(text) {
    var raw = String(text || ''), n = norm(raw);
    try { if (global.D7Super && global.D7Super.detect) { var sd = global.D7Super.detect(raw); if (sd) return sd; } } catch (_) {}
    if (/[ąćęłńóśźż]/i.test(raw)) return 'pl-PL';
    var pl = (n.match(new RegExp(PL_WORDS.source, 'g')) || []).length, en = (n.match(new RegExp(EN_WORDS.source, 'g')) || []).length;
    if (en > pl && en >= 1) return 'en-US';
    if (pl > en) return 'pl-PL';
    return null;
  }
  function curLang() { return ui.lang === 'auto' ? C.autoLang : ui.lang; }

  // ------------------------------------------------------------------ DOM
  var QUICK_DEFAULT = [
    ['kali radio', '📻 Kali radio'], ['stop', '⏹ Stop'], ['następna wizualizacja', '✨ Next viz'], ['pełny ekran', '⛶ Fullscreen'],
    ['deck a double d', '🎧 A · Double D'], ['play deck b', '▶ Deck B'], ['loop 4 a', '🔁 Loop 4 A'], ['sync b', '🔄 Sync B'],
    ['beat fx echo', '✨ Echo FX'], ['status', '📊 Status'], ['skróty', '⌨ Skróty'], ['pomoc', '? Pomoc']
  ];
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function build(opts) {
    var root = el('div', 'd7c'); root.id = 'd7c'; root.setAttribute('data-side', ui.side);
    var icon = opts.icon || 'icons/bot-d-shark.png';
    root.innerHTML =
      '<button type="button" class="d7c-fab" id="d7c-fab" aria-label="Czat z D Bot (bot)" aria-expanded="false" aria-controls="d7c-panel" title="D Bot — czat + głos (pisz albo mów)"><img src="' + icon + '" alt="" draggable="false" /><span class="d7c-dot" aria-hidden="true"></span><span class="d7c-fab-mic" aria-hidden="true">🎤</span></button>' +
      '<section class="d7c-panel" id="d7c-panel" role="dialog" aria-label="D Bot — czat z botem" hidden>' +
        '<header class="d7c-head">' +
          '<img src="' + icon + '" alt="" draggable="false" />' +
          '<div class="d7c-title"><b>X <span class="d7c-tag" title="Multi-talent X — DJ · piosenki · pady · pętle · aplikacje · boty · agenci · rozmowa · naprawa">Multi-talent X</span></b><small id="d7c-sub">DJ · piosenki · pady · pętle · aplikacje · boty · agenci · rozmowa · naprawa</small></div>' +
          '<span class="d7c-net" id="d7c-net" title="Sync czatu">…</span>' +
          '<button type="button" class="d7c-ib" id="d7c-tts" aria-pressed="false" title="Czytaj odpowiedzi na głos (TTS)">🔇</button>' +
          '<select class="d7c-lang" id="d7c-lang" aria-label="Język mowy" title="Język mowy i odpowiedzi (14) · AUTO = wykrywa język z tego, co mówisz/piszesz"><option value="auto">AUTO</option><option value="pl-PL">PL</option><option value="en-US">EN</option><option value="de-DE">DE</option><option value="es-ES">ES</option><option value="fr-FR">FR</option><option value="it-IT">IT</option><option value="pt-BR">PT</option><option value="uk-UA">UK</option><option value="ru-RU">RU</option><option value="cs-CZ">CS</option><option value="ja-JP">JA</option><option value="zh-CN">ZH</option><option value="ar-SA">AR</option><option value="hi-IN">HI</option></select>' +
          '<button type="button" class="d7c-ib" id="d7c-side" title="Przenieś czat na drugą stronę ekranu">⇆</button>' +
          '<button type="button" class="d7c-ib" id="d7c-min" title="Minimalizuj (Esc)" aria-label="Minimalizuj czat">—</button>' +
        '</header>' +
        '<div class="d7c-log" id="d7c-log" role="log" aria-live="polite"></div>' +
        '<div class="d7c-voice" id="d7c-voice" hidden></div>' +
        '<div class="d7c-quick" id="d7c-quick"></div>' +
        '<div class="d7c-contact"><a href="https://wa.me/48730377357" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a><a href="https://m.me/" target="_blank" rel="noopener noreferrer">💬 Messenger</a><span>tylko link · czatów FB/WA nie czytam</span></div>' +
        '<form class="d7c-form" id="d7c-form" autocomplete="off">' +
          '<button type="button" class="d7c-mic" id="d7c-mic" aria-pressed="false" title="Mów do D Bot (🎤)">🎤</button>' +
          '<input type="text" id="d7c-input" maxlength="400" placeholder="Napisz albo powiedz: kali radio · play deck A · pełny ekran" enterkeyhint="send" aria-label="Wiadomość do Daniela" />' +
          '<button type="submit" class="d7c-send" aria-label="Wyślij">➤</button>' +
        '</form>' +
      '</section>';
    var quick = $('#d7c-quick', root);
    (opts.quick || QUICK_DEFAULT).forEach(function (q) {
      var b = el('button', ''); b.type = 'button'; b.textContent = q[1]; b.setAttribute('data-say', q[0]);
      b.addEventListener('click', function () { send(q[0], { quick: true }); });
      quick.appendChild(b);
    });
    return root;
  }

  // ------------------------------------------------------------------ messages
  function setMsgText(node, text) {
    var str = String(text == null ? '' : text), re = /(https?:\/\/[^\s<>"'„”)]+)/g, last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) node.appendChild(document.createTextNode(str.slice(last, m.index)));
      var a = document.createElement('a'); a.href = m[1]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer';
      node.appendChild(a); last = m.index + m[1].length;
    }
    if (last < str.length) node.appendChild(document.createTextNode(str.slice(last)));
  }
  /** role: 'user' | 'bot' | 'bot typing' | 'sys'; extra: 'old' (history) */
  function add(role, text, extra) {
    if (!C.log) return null;
    var d = el('div', 'sx-msg d7c-msg ' + role + (extra ? ' ' + extra : ''));
    setMsgText(d, text);
    C.log.appendChild(d);
    while (C.log.children.length > 120) C.log.removeChild(C.log.firstChild);
    C.log.scrollTop = C.log.scrollHeight;
    if (role === 'bot' && extra !== 'old') {
      if (!isOpen()) C.root.classList.add('has-new');
      if (C.speakNext || ui.tts) speak(text);
      C.speakNext = false;
    }
    return d;
  }
  function clear() { if (C.log) C.log.innerHTML = ''; }
  function remove(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }

  // ------------------------------------------------------------------ open / close
  function isOpen() { return !!(C.panel && !C.panel.hidden); }
  function open(focus) {
    if (!C.mounted) return;
    C.panel.hidden = false; C.root.classList.add('open'); C.root.classList.remove('has-new');
    C.fab.setAttribute('aria-expanded', 'true');
    ui.open = true; saveUi();
    C.log.scrollTop = C.log.scrollHeight;
    var mobile = global.matchMedia && global.matchMedia('(max-width: 720px)').matches;
    if (focus !== false && !mobile) setTimeout(function () { try { C.input.focus({ preventScroll: true }); } catch (_) {} }, 40);
  }
  function close() {
    if (!C.mounted) return;
    C.panel.hidden = true; C.root.classList.remove('open');
    C.fab.setAttribute('aria-expanded', 'false');
    ui.open = false; saveUi();
    if (document.activeElement && C.root.contains(document.activeElement)) try { C.fab.focus({ preventScroll: true }); } catch (_) {}
  }
  function toggle() { if (isOpen()) close(); else open(); }

  // ------------------------------------------------------------------ sending
  function send(text, meta) {
    text = String(text || '').trim();
    if (!text) return;
    meta = meta || {};
    var lang = detectLang(text);
    if (ui.lang === 'auto' && lang && lang !== C.autoLang) { C.autoLang = lang; paintLang(); }
    // language switch commands (voice + text)
    var n = norm(text);
    if (/\b(mow|mów|odpowiadaj|rozpoznawaj)\b.*\bpo angielsku\b|\b(speak|talk|listen in) english\b/.test(n)) { setLang('en-US'); local(text, '🌐 Mowa: angielski (en-US). „po polsku” wraca do polskiego.'); return; }
    if (/\b(mow|odpowiadaj|rozpoznawaj)\b.*\bpo polsku\b|\b(speak|talk|listen in) polish\b/.test(n)) { setLang('pl-PL'); local(text, '🌐 Mowa: polski (pl-PL).'); return; }
    if (/^(automatyczny jezyk|jezyk auto|auto language|language auto)$/.test(n)) { setLang('auto'); local(text, '🌐 Język mowy: AUTO (PL/EN wg tego, co mówisz).'); return; }
    if (/^(czytaj na glos|mow na glos|glos on|tts on|speak replies|voice on)$/.test(n)) { setTts(true); local(text, '🔊 Czytam odpowiedzi na głos.'); return; }
    if (/^(nie czytaj|cisza glos|glos off|tts off|voice off)$/.test(n)) { setTts(false); local(text, '🔇 Odpowiedzi tylko tekstem.'); return; }
    if (meta.voice) C.speakNext = ui.tts || !!meta.voiceReply;
    if (global.D7Super && global.D7Super.handle) { try { if (global.D7Super.handle(text, meta)) return; } catch (e) { console.warn('[D7Chat] super bot', e); } }
    if (C.handler) { try { C.handler(text, meta); } catch (e) { console.warn('[D7Chat] handler', e); add('bot', 'Ups — komenda się wysypała, aplikacja działa dalej. Spróbuj „pomoc”.'); } }
    else local(text, 'D Bot się ładuje — spróbuj za chwilę.');
  }
  function local(userText, reply) {
    add('user', userText);
    var B = global.BotD;
    if (B) { try { B.Memory.addChat('user', userText, { noSync: true }); } catch (_) {} }
    add('bot', reply);
  }

  // ------------------------------------------------------------------ TTS
  var ttsWarned = false;
  function pickVoice(lang) {
    try {
      var vs = global.speechSynthesis.getVoices() || [], base = lang.slice(0, 2);
      return vs.find(function (v) { return v.lang === lang && v.localService; }) || vs.find(function (v) { return v.lang === lang; }) || vs.find(function (v) { return (v.lang || '').slice(0, 2) === base; }) || null;
    } catch (_) { return null; }
  }
  function cleanForSpeech(text) {
    return String(text || '').replace(/https?:\/\/\S+/g, 'link').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').replace(/[·•|→←▶◀⏹⛶✨]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, 700);
  }
  function speak(text) {
    var t = cleanForSpeech(text); if (!t) return false;
    var lang = C.replyLang || curLang(); C.replyLang = null; // v44: super bot replies are spoken in their own language; otherwise the user's speech language (AUTO follows what the user last said/typed), not a guess from the reply text
    if (C.listening) return false; // never talk over the microphone
    if (nativeTts()) { try { global.D7Native.speak(t, lang); return true; } catch (e) { console.warn('[D7Chat] native tts', e); } }
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) {
      if (!ttsWarned) { ttsWarned = true; add('sys', '🔇 Czytanie na głos (speechSynthesis) nie jest dostępne w tej przeglądarce.'); }
      return false;
    }
    try {
      global.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(t); u.lang = lang; var vo = global.DBotOpts ? global.DBotOpts.get() : {}; u.rate = +vo.rate || 1.03; u.pitch = +vo.pitch || 1; // v46 voice options
      var v = pickVoice(lang); if (v) u.voice = v;
      u.onend = u.onerror = function () { try { if (global.__d7Voice) global.__d7Voice({ type: 'tts', state: 'done' }); } catch (_) {} }; // v45: continuous conversation
      global.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  function stopSpeaking() {
    try { if (nativeTts() && global.D7Native.stopSpeaking) global.D7Native.stopSpeaking(); } catch (_) {}
    try { if (global.speechSynthesis) global.speechSynthesis.cancel(); } catch (_) {}
  }
  function setTts(on) { ui.tts = !!on; saveUi(); paintTts(); if (!on) stopSpeaking(); }
  function paintTts() { var b = $('#d7c-tts', C.root); if (!b) return; b.textContent = ui.tts ? '🔊' : '🔇'; b.setAttribute('aria-pressed', String(ui.tts)); b.classList.toggle('on', ui.tts); b.title = ui.tts ? 'Czytam odpowiedzi na głos — kliknij, żeby wyłączyć' : 'Czytaj odpowiedzi na głos (TTS)'; }
  function setLang(l) { ui.lang = l; if (l !== 'auto') C.autoLang = l; saveUi(); paintLang(); }
  function paintLang() { var s = $('#d7c-lang', C.root); if (s && ui.lang !== 'auto' && !Array.prototype.some.call(s.options, function (o) { return o.value === ui.lang; })) { var op = document.createElement('option'); op.value = ui.lang; op.textContent = ui.lang; s.appendChild(op); } if (s) { s.value = ui.lang; s.title = 'Język mowy: ' + (ui.lang === 'auto' ? 'AUTO (teraz ' + C.autoLang + ')' : ui.lang); } }

  // ------------------------------------------------------------------ speech-to-text
  var rec = null, voiceT = 0;
  function voiceStatus(msg, cls) {
    var v = $('#d7c-voice', C.root); if (!v) return;
    clearTimeout(voiceT);
    if (!msg) { v.hidden = true; v.textContent = ''; return; }
    v.hidden = false; v.className = 'd7c-voice' + (cls ? ' ' + cls : ''); v.textContent = msg;
    if (cls === 'err' || cls === 'ok') voiceT = setTimeout(function () { v.hidden = true; }, cls === 'err' ? 9000 : 2500);
  }
  function paintMic() {
    var b = $('#d7c-mic', C.root); if (!b) return;
    b.classList.toggle('on', C.listening); b.setAttribute('aria-pressed', String(C.listening));
    b.title = C.listening ? 'Słucham… (kliknij, żeby przerwać)' : 'Mów do D Bot (' + curLang() + ')';
    C.root.classList.toggle('listening', C.listening);
  }
  function voiceSupported() { return nativeVoice() || !!SR; }
  function unsupportedMsg() {
    var apk = /appassets\.androidplatform\.net/.test(location.hostname);
    return '🎤 Rozpoznawanie mowy nie jest dostępne ' + (apk ? 'w tej wersji WebView (zaktualizuj aplikację D Bot).' : 'w tej przeglądarce (np. Firefox) — działa w Chrome / Edge / Safari oraz w aplikacji D Bot na Androida.') + ' Możesz normalnie pisać na czacie.';
  }
  function finalText(text, conf) {
    text = String(text || '').trim();
    C.listening = false; paintMic();
    if (!text) { voiceStatus('Nic nie usłyszałem — spróbuj jeszcze raz.', 'err'); return; }
    voiceStatus('🎤 „' + text + '”', 'ok');
    if (ui.lang === 'auto') { var dl = detectLang(text); if (dl) { C.autoLang = dl; paintLang(); } }
    C.input.value = '';
    send(text, { voice: true, confidence: conf, voiceReply: !!(global.DBotNative && global.DBotNative.voice && global.DBotNative.voice.convo) });
  }
  function listen() {
    if (!C.mounted) return false;
    if (C.listening) { stopListening(); return false; }
    stopSpeaking();
    var lang = curLang();
    if (nativeVoice()) {
      C.listening = true; paintMic(); voiceStatus('🎤 Słucham (' + lang + ')… mów teraz', 'live');
      try { global.D7Native.startListening(lang); } catch (e) { C.listening = false; paintMic(); voiceStatus('🎤 Błąd natywnego mikrofonu: ' + (e && e.message), 'err'); }
      return true;
    }
    if (!SR) { voiceStatus(unsupportedMsg(), 'err'); add('sys', unsupportedMsg()); return false; }
    try {
      rec = new SR();
      rec.lang = lang; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      var got = false;
      rec.onresult = function (e) {
        var interim = '', fin = '', conf = 0;
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var r = e.results[i];
          if (r.isFinal) { fin += r[0].transcript; conf = r[0].confidence; } else interim += r[0].transcript;
        }
        if (interim) { C.input.value = interim; voiceStatus('🎤 ' + interim + '…', 'live'); }
        if (fin) { got = true; finalText(fin, conf); }
      };
      rec.onerror = function (e) {
        var er = e && e.error, msg =
          er === 'not-allowed' || er === 'service-not-allowed' ? '🎤 Brak zgody na mikrofon — zezwól w ustawieniach strony (ikona kłódki) i spróbuj ponownie.' :
          er === 'network' ? '🎤 Rozpoznawanie mowy w przeglądarce wymaga internetu (Chrome przetwarza głos na serwerach Google). Offline: pisz albo użyj aplikacji D Bot na Androida (rozpoznawanie offline, jeśli telefon ma pakiet językowy).' :
          er === 'no-speech' ? '🎤 Nic nie usłyszałem — spróbuj jeszcze raz.' :
          er === 'audio-capture' ? '🎤 Nie widzę mikrofonu w tym urządzeniu.' :
          er === 'language-not-supported' ? '🎤 Ten język nie jest obsługiwany w rozpoznawaniu mowy tego urządzenia — wybierz inny albo pisz.' :
          er === 'aborted' ? '' : '🎤 Błąd rozpoznawania mowy: ' + er;
        C.listening = false; paintMic();
        if (msg) voiceStatus(msg, 'err'); else voiceStatus('');
      };
      rec.onend = function () { if (C.listening && !got) { C.listening = false; paintMic(); voiceStatus(''); } rec = null; };
      rec.start();
      C.listening = true; paintMic(); voiceStatus('🎤 Słucham (' + lang + ')… mów teraz', 'live');
      return true;
    } catch (e) {
      C.listening = false; paintMic(); voiceStatus('🎤 Nie mogę uruchomić mikrofonu: ' + (e && e.message), 'err');
      return false;
    }
  }
  function stopListening() {
    try { if (nativeVoice() && global.D7Native.stopListening) global.D7Native.stopListening(); } catch (_) {}
    try { if (rec) rec.abort(); } catch (_) {}
    C.listening = false; paintMic(); voiceStatus('');
  }
  /** Called by the Android app: {type:'partial'|'result'|'error'|'end'|'ready'|'tts', text, error, message} */
  global.__d7Voice = function (ev) {
    try {
      if (typeof ev === 'string') ev = JSON.parse(ev);
      if (!ev || !C.mounted) return;
      if (ev.type === 'ready') voiceStatus('🎤 Słucham (' + (ev.lang || curLang()) + (ev.offline ? ' · offline' : '') + ')… mów teraz', 'live');
      else if (ev.type === 'partial') { C.input.value = ev.text || ''; voiceStatus('🎤 ' + (ev.text || '') + '…', 'live'); }
      else if (ev.type === 'result') finalText(ev.text, ev.confidence);
      else if (ev.type === 'error') { C.listening = false; paintMic(); voiceStatus('🎤 ' + (ev.message || ev.error || 'błąd mikrofonu'), 'err'); }
      else if (ev.type === 'end') { if (C.listening) { C.listening = false; paintMic(); } }
    } catch (e) { console.warn('[D7Chat] native voice', e); }
  };

  // ------------------------------------------------------------------ shared history across pages / tabs
  function renderHistory() {
    var B = global.BotD; if (!B) return;
    var hist = (B.Memory.chat || []).slice(-16);
    hist.forEach(function (m) { add(m.role === 'user' ? 'user' : 'bot', m.text, 'old'); });
    if (hist.length) { add('sys', '— historia czatu (wspólna dla wszystkich stron) —'); C.lastSeen = hist[hist.length - 1].at || ''; }
  }
  function onStorage(e) {
    if (e.key !== 'x7-chat' || !global.BotD) return;
    var list; try { list = JSON.parse(e.newValue || '[]'); } catch (_) { return; }
    if (!Array.isArray(list)) return;
    var B = global.BotD, known = {};
    (B.Memory.chat || []).forEach(function (m) { known[m.at + '|' + m.text] = 1; });
    var fresh = list.filter(function (m) { return !known[m.at + '|' + m.text]; });
    B.Memory.chat = list.slice(-60);
    fresh.forEach(function (m) { add(m.role === 'user' ? 'user' : 'bot', m.text, 'other'); });
  }

  // ------------------------------------------------------------------ net chip
  function paintNet() {
    var n = $('#d7c-net', C.root), B = global.BotD; if (!n || !B) return;
    var q = B.Sync.queue.length, on = B.Sync.online;
    n.textContent = (on ? 'online' : 'offline') + (q ? ' · ' + q : '');
    n.className = 'd7c-net ' + (on ? 'on' : 'off');
    n.title = on ? 'Online — czat synchronizuje się z serwerem (/api/chat-log)' + (q ? ' · w kolejce ' + q : '') : 'Offline — czat zapisuje się lokalnie, wyślę gdy wróci internet' + (q ? ' · kolejka ' + q : '');
  }

  // ------------------------------------------------------------------ standalone brain (classic + legacy pages)
  function click(sel) { var b = document.querySelector(sel); if (b) { b.click(); return true; } return false; }
  function standaloneApi() {
    var yt = [];
    return {
      snapshot: function () { return { radioPlaying: false, decks: [], bpm: 128, beatSource: 'pulse', vizOk: !!document.querySelector('canvas'), fs: !!document.fullscreenElement }; },
      ytList: yt, openLink: function (u) { if (!/^https:\/\/(wa\.me|m\.me)\//.test(u)) return false; try { global.open(u, '_blank', 'noopener'); return true; } catch (_) { return false; } },
      share: function (u) { try { if (navigator.share) navigator.share({ title: 'D.bot', url: u }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(u).catch(function () {}); } catch (_) {} },
      kali: function () { if (!click('#btn-kali') && !click('#audio-gate-kali')) location.href = 'kali-live.html'; },
      playYt: function () { click('#btn-kali'); }, nextYt: function () { click('#viz-next'); return { title: 'następny' }; },
      stopRadio: function () { Array.prototype.forEach.call(document.querySelectorAll('audio,video'), function (a) { try { a.pause(); } catch (_) {} }); },
      stopAll: function () { Array.prototype.forEach.call(document.querySelectorAll('audio,video'), function (a) { try { a.pause(); } catch (_) {} }); },
      enterFs: function () { if (!click('#btn-fs')) { var e = document.documentElement; try { (e.requestFullscreen || e.webkitRequestFullscreen).call(e); } catch (_) {} } },
      exitFs: function () { try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {} },
      presetRandom: function () { click('#viz-rand') || click('#viz-hud-rand'); var n = document.querySelector('#viz-name,#viz-hud-name'); return n ? n.textContent : 'losowy'; },
      presetPrev: function () { click('#viz-prev') || click('#viz-hud-prev'); var n = document.querySelector('#viz-name,#viz-hud-name'); return n ? n.textContent : 'poprzedni'; },
      setAuto: function () { click('#viz-auto'); }, liveGen: function () { click('#btn-live-gen'); },
      setBpm: function (v) { return v; }, setRadioVol: function (v) { var m = $('#master-vol'); if (m) { m.value = v; m.dispatchEvent(new Event('input', { bubbles: true })); } },
      deckLoad: function () {}, deckPlay: function () { return ''; }, deckPause: function () {}, deckVol: function () {},
      syncDeck: function () { return false; }, xfade: function (x) { var c = $('#crossfader'); if (c) { c.value = Math.round(x * Number(c.max || 100)); c.dispatchEvent(new Event('input', { bubbles: true })); } },
      setFilter: function () {}, setEcho: function () {}, tracks: function () { return []; }, findTrack: function () { return null; },
      runText: function (t) { send(t); }
    };
  }
  var PRO_RE = /\b(deck|dek|cue|hot ?cue|loop|petl\w*|reloop|slip|quantize|reverse|rewers|tempo|pitch|master tempo|key ?lock|beat ?fx|efekt|eq|trim|kill|filter|filtr|echo|crossfader|sluchawki|jog|scratch|bpm)\b/;
  function standaloneHandler(bot) {
    var queue = Promise.resolve();
    return function (text) {
      var B = global.BotD;
      add('user', text);
      if (B) B.Memory.addChat('user', text);
      var n = norm(text), r;
      if (PRO_RE.test(n) && !/^(status|pomoc|help)/.test(n)) {
        var url = new URL('pro-dj.html', location.href).href;
        r = '🎧 Decki PRO8 (CDJ/DJM: hot cue, pętle, SYNC, BEAT FX…) są na stronie Pro DJ: ' + url + ' — tam wykonam „' + text + '”. Tutaj (classic) steruję radiem, wizualizacją i pełnym ekranem.';
      } else {
        try { r = bot ? bot.handle(text) : 'D Bot (tryb awaryjny) — bot-d.js nie wczytał się.'; } catch (e) { r = 'Ups — komenda się wysypała. Spróbuj „pomoc”.'; }
      }
      var typing = add('bot typing', '…');
      var p = (r && typeof r.then === 'function') ? r : new Promise(function (res) { setTimeout(function () { res(r); }, 150); });
      queue = queue.then(function () { return p; }).then(function (reply) {
        remove(typing); reply = reply || 'Nie złapałem — napisz „pomoc”.';
        add('bot', reply); if (B) B.Memory.addChat('bot', reply);
      }).catch(function () { remove(typing); add('bot', 'Nie udało się — spróbuj jeszcze raz.'); });
    };
  }

  // ------------------------------------------------------------------ mount
  /**
   * opts: { handler(text, meta) — page handler (special-x); quick: [[say, label]…]; sub: subtitle; standalone: bool }
   */
  function mount(opts) {
    opts = opts || {};
    if (C.mounted) { if (opts.handler) C.handler = opts.handler; if (opts.sub) setSub(opts.sub); return C; }
    var root = build(opts);
    document.body.appendChild(root);
    C.root = root; C.panel = $('#d7c-panel', root); C.fab = $('#d7c-fab', root); C.log = $('#d7c-log', root); C.input = $('#d7c-input', root);
    C.mounted = true;
    C.fab.addEventListener('click', function () { toggle(); });
    $('#d7c-min', root).addEventListener('click', close);
    $('#d7c-side', root).addEventListener('click', function () { ui.side = ui.side === 'left' ? 'right' : 'left'; root.setAttribute('data-side', ui.side); saveUi(); });
    $('#d7c-tts', root).addEventListener('click', function () { setTts(!ui.tts); if (ui.tts) speak(ui.lang === 'en-US' ? 'Voice replies on.' : 'Czytam odpowiedzi na głos.'); });
    var ls = $('#d7c-lang', root); ls.addEventListener('change', function () { setLang(ls.value); });
    $('#d7c-mic', root).addEventListener('click', function () { listen(); });
    $('#d7c-form', root).addEventListener('submit', function (e) { e.preventDefault(); var v = C.input.value; C.input.value = ''; if (C.listening) stopListening(); send(v); });
    // typing in the chat never triggers page shortcuts (F, R, K, deck keys…)
    ['keydown', 'keyup', 'keypress'].forEach(function (t) { C.input.addEventListener(t, function (e) { if (e.key === 'Escape' && t === 'keydown') { close(); } e.stopPropagation(); }); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { close(); e.stopPropagation(); } });
    global.addEventListener('storage', onStorage);
    // fullscreen of a sub-element (classic viz): keep the chat inside the fullscreen layer as an overlay
    var onFs = function () {
      var fe = document.fullscreenElement || document.webkitFullscreenElement;
      if (fe && fe !== document.documentElement && fe !== document.body && !fe.contains(root)) fe.appendChild(root);
      else if (!fe && root.parentNode !== document.body) document.body.appendChild(root);
      root.classList.toggle('in-fs', !!fe);
    };
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
    paintTts(); paintLang(); paintMic();
    var B = global.BotD;
    if (opts.standalone) {
      C.standalone = true;
      var bot = null;
      if (B) { try { bot = B.createBot(standaloneApi()); } catch (e) { console.warn('[D7Chat] bot', e); } }
      C.handler = standaloneHandler(bot);
      renderHistory();
      add('bot', 'Siema — tu D Bot 💚. Czat jest wspólny dla wszystkich stron D Bot. Pisz albo kliknij 🎤 i mów („kali radio”, „pełny ekran”, „następna wizualizacja”, „status”). Decki PRO8 → pro-dj.html.', 'old');
      if (B) {
        B.Sync.on(paintNet); paintNet();
        try { B.Sync.ping(); } catch (_) {}
        setInterval(function () { try { B.Sync.flush(); } catch (_) {} }, 20000);
        global.addEventListener('online', function () { try { B.Sync.ping(); } catch (_) {} });
        global.addEventListener('pagehide', function () { try { B.Sync.flush(); } catch (_) {} });
      }
    } else {
      C.handler = opts.handler || null;
      renderHistory();
      if (B) { B.Sync.on(paintNet); paintNet(); }
    }
    if (opts.sub) setSub(opts.sub);
    if (!voiceSupported()) { var mb = $('#d7c-mic', root); mb.classList.add('na'); mb.title = 'Rozpoznawanie mowy niedostępne tutaj — kliknij po szczegóły'; }
    if (ui.open && !(global.matchMedia && global.matchMedia('(max-width: 720px)').matches)) open(false);
    return C;
  }
  function setSub(t) { var s = $('#d7c-sub', C.root); if (s) s.textContent = t; }

  // SW version handshake for pages without special-x (classic / legacy): answer as the current build
  try {
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
      if (global.SpecialX || document.body && document.body.getAttribute('data-mode')) return;
      var d = e.data || {};
      if (d.type === 'd7-version?' && e.ports && e.ports[0]) e.ports[0].postMessage({ type: 'd7-version', v: VERSION });
    });
  } catch (_) {}

  // Auto-mount on pages without special-x.js (special-x mounts with its own handler)
  function auto() {
    if (C.mounted) return;
    if (document.querySelector('#sx-app') || document.body.getAttribute('data-mode')) return; // special-x page
    mount({ standalone: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(auto, 0); }); else setTimeout(auto, 0);

  C.mount = mount; C.add = add; C.remove = remove; C.clear = clear; C.open = open; C.close = close; C.toggle = toggle; C.isOpen = isOpen; C.send = send;
  C.speak = speak; C.stopSpeaking = stopSpeaking; C.listen = listen; C.stopListening = stopListening; C.setTts = setTts; C.setLang = setLang;
  C.paintNet = paintNet; C.setSub = setSub; C.detectLang = detectLang; C.voiceSupported = voiceSupported; C.nativeVoice = nativeVoice;
  C.ui = function () { return { tts: ui.tts, lang: ui.lang, autoLang: C.autoLang, side: ui.side, open: isOpen(), listening: C.listening, voice: voiceSupported(), native: nativeVoice(), sr: !!SR, synth: !!global.speechSynthesis }; };
  C.clear = function () { if (C.log) C.log.innerHTML = ''; };
  global.D7Chat = C;
})(window);
