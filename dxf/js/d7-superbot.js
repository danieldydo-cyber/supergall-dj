/**
 * D Bot · D77 Studio (APK v44) — „super bot” layer for the chat „D Bot” · Daniel Dydo · Kraków
 * - 14 languages (PL EN DE ES FR IT PT UK RU CS JA ZH AR HI): detects the user's language, replies in it, speaks in it (TTS).
 * - Helper modes (offline, every language): DJ tips · MIDI / MC-707 clock sync help · code templates (bot / agent / app / MIDI / Android).
 * - Optional multi-AI: the USER's OWN API keys (xAI Grok = default, Google Gemini, OpenAI ChatGPT = off by default),
 *   stored ONLY in this device's localStorage (key 'd7-ai-keys'), never bundled, never synced, never written to chat history.
 *   Ask the selected provider or „ask all” (answers merged). No key → offline rule-based knowledge (D Bot + Google snapshot).
 * - App commands (decks, radio, MilkDrop, Google knowledge, status…) always go to D Bot first.
 * Classic script, exposes window.D7Super. Loaded after js/d7-chat.js.
 */
(function (global) {
  'use strict';
  var VERSION = '45';
  var LS_AI = 'd7-ai-keys', LS_SB = 'd7-superbot';
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function norm(s) { return String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }

  // ------------------------------------------------------------------ languages
  var LANGS = [
    ['pl-PL', 'PL', 'Polski'], ['en-US', 'EN', 'English'], ['de-DE', 'DE', 'Deutsch'], ['es-ES', 'ES', 'Español'], ['fr-FR', 'FR', 'Français'],
    ['it-IT', 'IT', 'Italiano'], ['pt-BR', 'PT', 'Português'], ['uk-UA', 'UK', 'Українська'], ['ru-RU', 'RU', 'Русский'], ['cs-CZ', 'CS', 'Čeština'],
    ['ja-JP', 'JA', '日本語'], ['zh-CN', 'ZH', '中文'], ['ar-SA', 'AR', 'العربية'], ['hi-IN', 'HI', 'हिन्दी']
  ];
  var CODES = LANGS.map(function (l) { return l[0]; });
  function base(code) { return String(code || 'pl').slice(0, 2); }
  var STOP = {
    pl: /\b(jest|nie|tak|czy|co|jak|mam|moje|moj|wlacz|wylacz|zagraj|pusc|prosze|teraz|siema|czesc|dzieki|daj|pokaz|jakie|ktory|gdzie|kiedy|dlaczego|porady|porade|napisz|zrob)\b/g,
    en: /\b(the|what|is|are|my|play|please|show|turn|how|you|who|can|give|some|tips|write|make|with|and|for|this|that|why|when|where|help)\b/g,
    de: /\b(der|die|das|und|ist|nicht|ich|du|wie|was|bitte|mit|fur|ein|eine|zeig|gib|mir|tipps|hallo|danke|hilfe|warum|schreib)\b/g,
    es: /\b(el|la|los|las|que|es|no|por|favor|como|para|con|una|un|dame|muestra|consejos|hola|gracias|ayuda|quien|eres|escribe|codigo)\b/g,
    fr: /\b(le|la|les|est|pas|je|tu|vous|que|qui|comment|pour|avec|une|des|donne|moi|conseils|bonjour|merci|aide|ecris|salut)\b/g,
    it: /\b(il|lo|la|gli|che|non|sono|come|per|con|una|uno|dammi|mostra|consigli|ciao|grazie|aiuto|chi|sei|scrivi|codice)\b/g,
    pt: /\b(o|os|as|que|nao|voce|como|para|com|uma|um|me|de|dicas|ola|obrigado|ajuda|quem|escreva|codigo|isso)\b/g,
    cs: /\b(je|jsem|jsi|neni|jak|co|prosim|dej|mi|ukaz|tipy|ahoj|dekuju|napoveda|kdo|napis|kod|proc|kde)\b/g
  };
  /** Returns a BCP-47 code, or null when unsure (short commands like „loop 4 a”). */
  function detect(text) {
    var raw = String(text || ''); if (!raw.trim()) return null;
    if (/[\u0600-\u06FF]/.test(raw)) return 'ar-SA';
    if (/[\u0900-\u097F]/.test(raw)) return 'hi-IN';
    if (/[\u3040-\u30FF]/.test(raw)) return 'ja-JP';
    if (/[\u4E00-\u9FFF]/.test(raw)) return 'zh-CN';
    if (/[\u0400-\u04FF]/.test(raw)) { if (/[іїєґІЇЄҐ]/.test(raw)) return 'uk-UA'; return 'ru-RU'; }
    if (/[ąęłśźżćńĄĘŁŚŹŻĆŃ]/.test(raw)) return 'pl-PL';
    if (/[řůěŘŮĚ]/.test(raw)) return 'cs-CZ';
    if (/[ßäöüÄÖÜ]/.test(raw)) return 'de-DE';
    if (/[ñ¿¡Ñ]/.test(raw)) return 'es-ES';
    if (/[ãõÃÕ]/.test(raw)) return 'pt-BR';
    if (/[œèêëàùûîïÈÊ]/.test(raw) && !/[ìò]/.test(raw)) return 'fr-FR';
    if (/[ìòÌÒ]/.test(raw)) return 'it-IT';
    var n = norm(raw), best = null, bestN = 0, second = 0;
    Object.keys(STOP).forEach(function (k) {
      var c = (n.match(STOP[k]) || []).length;
      if (c > bestN) { second = bestN; bestN = c; best = k; } else if (c > second) second = c;
    });
    if (!best || bestN < 1 || bestN === second) return null;
    if (bestN < 2 && n.split(' ').length > 3 && best !== 'pl' && best !== 'en') return null;
    return { pl: 'pl-PL', en: 'en-US', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR', cs: 'cs-CZ' }[best];
  }

  // ------------------------------------------------------------------ offline texts (14 languages)
  var T = {
    pl: { hi: 'Cześć! Tu D Bot — super bot D.bot 💚', who: 'Jestem D Bot — główny bot aplikacji D Bot · D77 Studio Daniela Dydo z Krakowa. Steruję deckami, radiem i MilkDrop, pomagam w miksowaniu, synchronizacji MIDI z MC-707 i piszę szablony kodu. Offline działam na wbudowanej wiedzy; z Twoim kluczem API (⚙) mogę pytać Groka, Gemini albo ChatGPT.',
      help: '🌍 Super bot: 14 języków (wykrywam Twój) · 🎛 porady DJ · 🎹 pomoc MIDI / MC-707 · 🧩 szablony kodu (bot / agent / aplikacja / midi / android) · 🤖 AI z Twoim kluczem (⚙ ustawienia)',
      tipsT: '🎛 Porady DJ', midiT: '🎹 MIDI clock z Roland MC-707', codeT: '🧩 Szablon kodu', codeMenu: 'Napisz: „kod bot”, „kod agent”, „kod aplikacja”, „kod midi” albo „kod android”.',
      tips: ['Najpierw tempo: SYNC albo pitch, potem wyrównaj „raz” — nowy utwór wchodzi na początku frazy (8/16/32 takty).', 'Wymiana basu na EQ: przytnij LOW w nowym utworze i zamień basy na zmianie frazy — nigdy dwie linie basu naraz.', 'Pętle 4/8 beatów wydłużają intro/outro; Echo albo Filter pomagają ładnie wyjść z utworu.', 'Miksuj harmonicznie (Camelot: ta sama liczba albo ±1), pilnuj poziomów poza czerwonym i słuchaj uszami, nie oczami.'],
      tipsCmd: 'W aplikacji: „sync b”, „loop 4 a”, „beat fx echo”.',
      midi: ['Podłącz MC-707 przez USB (telefon: kabel USB-C OTG).', 'Otwórz Classic (classic.html) → pasek MIDI SYNC → CONNECT → wybierz MC-707 jako IN i OUT.', 'Aplikacja jako master: „Clock OUT”, przycisk CLK ▶ wysyła Start + MIDI clock 24 PPQN w tempie mastera; CLK ■ = Stop.', 'W MC-707: SYSTEM → SYNC/TEMPO — ustaw synchronizację z zewnętrznym zegarem (np. AUTO / USB).', 'MC-707 jako master: ustaw „Clock IN” — aplikacja czyta BPM z przychodzącego zegara. Zawsze tylko jeden master zegara.'],
      fb: 'Nie znam jeszcze odpowiedzi offline. Spróbuj: porady DJ · pomoc midi · kod bot · pomoc — albo dodaj własny klucz AI w ⚙.', aiErr: 'AI nie odpowiedziało', thinking: 'myślę', keySaved: '🔐 Klucz zapisany tylko na tym urządzeniu (localStorage) — nie trafia do historii czatu ani do synchronizacji.', merged: 'Odpowiedzi kilku AI' },
    en: { hi: 'Hi! D Bot here — the D.bot super bot 💚', who: 'I am D Bot — the main bot of D Bot · D77 Studio by Daniel Dydo (Kraków). I control the decks, radio and MilkDrop, help with mixing, MIDI sync with the MC-707 and write code templates. Offline I use built-in knowledge; with your own API key (⚙) I can ask Grok, Gemini or ChatGPT.',
      help: '🌍 Super bot: 14 languages (I detect yours) · 🎛 DJ tips · 🎹 MIDI / MC-707 help · 🧩 code templates (bot / agent / app / midi / android) · 🤖 AI with your own key (⚙ settings)',
      tipsT: '🎛 DJ tips', midiT: '🎹 MIDI clock with the Roland MC-707', codeT: '🧩 Code template', codeMenu: 'Type: “code bot”, “code agent”, “code app”, “code midi” or “code android”.',
      tips: ['Tempo first: SYNC or pitch, then line up the “one” — bring the new track in at the start of a phrase (8/16/32 bars).', 'EQ bass swap: cut the LOW of the incoming track and swap basslines on the phrase change — never two basslines at once.', 'Use 4/8-beat loops to extend intros/outros; Echo or Filter FX help you leave a track smoothly.', 'Mix harmonically (Camelot: same number or ±1), keep levels out of the red and trust your ears.'],
      tipsCmd: 'In the app: “sync b”, “loop 4 a”, “beat fx echo”.',
      midi: ['Connect the MC-707 over USB (phone: USB-C OTG cable).', 'Open Classic (classic.html) → MIDI SYNC strip → CONNECT → pick the MC-707 as IN and OUT.', 'App as master: “Clock OUT”, CLK ▶ sends Start + 24 PPQN MIDI clock at the master BPM; CLK ■ = Stop.', 'On the MC-707: SYSTEM → SYNC/TEMPO — set it to follow external clock (e.g. AUTO / USB).', 'MC-707 as master: choose “Clock IN” — the app reads the BPM from the incoming clock. Only one clock master at a time.'],
      fb: 'I have no offline answer for that yet. Try: dj tips · midi help · code bot · help — or add your own AI key in ⚙.', aiErr: 'AI did not answer', thinking: 'thinking', keySaved: '🔐 Key saved on this device only (localStorage) — never in chat history or sync.', merged: 'Answers from several AIs' },
    de: { hi: 'Hallo! Hier ist D Bot — der D.bot Super-Bot 💚', who: 'Ich bin D Bot, der Haupt-Bot von D Bot · D77 Studio von Daniel Dydo (Krakau). Ich steuere Decks, Radio und MilkDrop, helfe beim Mixen, bei der MIDI-Synchronisation mit dem MC-707 und schreibe Code-Vorlagen. Offline nutze ich eingebautes Wissen; mit deinem eigenen API-Schlüssel (⚙) frage ich Grok, Gemini oder ChatGPT.',
      help: '🌍 Super-Bot: 14 Sprachen (ich erkenne deine) · 🎛 DJ-Tipps · 🎹 MIDI / MC-707 Hilfe · 🧩 Code-Vorlagen (bot / agent / app / midi / android) · 🤖 KI mit eigenem Schlüssel (⚙)',
      tipsT: '🎛 DJ-Tipps', midiT: '🎹 MIDI-Clock mit dem Roland MC-707', codeT: '🧩 Code-Vorlage', codeMenu: 'Schreib: „code bot“, „code agent“, „code app“, „code midi“ oder „code android“.',
      tips: ['Zuerst das Tempo: SYNC oder Pitch, dann die „Eins“ angleichen — neuen Track am Anfang einer Phrase starten (8/16/32 Takte).', 'Bass-Wechsel mit EQ: LOW im neuen Track absenken und die Bässe beim Phrasenwechsel tauschen — nie zwei Basslines gleichzeitig.', 'Loops mit 4/8 Beats verlängern Intro/Outro; Echo- oder Filter-FX helfen beim sauberen Ausstieg.', 'Harmonisch mixen (Camelot: gleiche Zahl oder ±1), Pegel aus dem Roten halten und den Ohren vertrauen.'],
      tipsCmd: 'In der App: „sync b“, „loop 4 a“, „beat fx echo“.',
      midi: ['MC-707 per USB verbinden (Handy: USB-C-OTG-Kabel).', 'Classic öffnen (classic.html) → Leiste MIDI SYNC → CONNECT → MC-707 als IN und OUT wählen.', 'App als Master: „Clock OUT“, CLK ▶ sendet Start + MIDI-Clock (24 PPQN) im Master-Tempo; CLK ■ = Stop.', 'Am MC-707: SYSTEM → SYNC/TEMPO — auf externe Clock folgen (z. B. AUTO / USB).', 'MC-707 als Master: „Clock IN“ wählen — die App liest das BPM aus der eingehenden Clock. Immer nur ein Clock-Master.'],
      fb: 'Dafür habe ich offline noch keine Antwort. Probier: dj tipps · midi hilfe · code bot · hilfe — oder füge in ⚙ deinen eigenen KI-Schlüssel hinzu.', aiErr: 'Die KI hat nicht geantwortet', thinking: 'denke nach', keySaved: '🔐 Schlüssel nur auf diesem Gerät gespeichert (localStorage) — nie im Chatverlauf oder Sync.', merged: 'Antworten mehrerer KIs' },
    es: { hi: '¡Hola! Soy D Bot — el súper bot de D.bot 💚', who: 'Soy D Bot, el bot principal de D Bot · D77 Studio de Daniel Dydo (Cracovia). Controlo los decks, la radio y MilkDrop, ayudo a mezclar, a sincronizar MIDI con la MC-707 y escribo plantillas de código. Sin conexión uso mi conocimiento integrado; con tu propia clave API (⚙) puedo preguntar a Grok, Gemini o ChatGPT.',
      help: '🌍 Súper bot: 14 idiomas (detecto el tuyo) · 🎛 consejos de DJ · 🎹 ayuda MIDI / MC-707 · 🧩 plantillas de código (bot / agent / app / midi / android) · 🤖 IA con tu propia clave (⚙)',
      tipsT: '🎛 Consejos de DJ', midiT: '🎹 Reloj MIDI con la Roland MC-707', codeT: '🧩 Plantilla de código', codeMenu: 'Escribe: «código bot», «código agent», «código app», «código midi» o «código android».',
      tips: ['Primero el tempo: SYNC o pitch, luego alinea el «uno» — entra con la nueva pista al inicio de una frase (8/16/32 compases).', 'Cambio de graves con EQ: corta el LOW de la pista entrante e intercambia los bajos en el cambio de frase — nunca dos líneas de bajo a la vez.', 'Usa loops de 4/8 tiempos para alargar intros/outros; Echo o Filter ayudan a salir con suavidad.', 'Mezcla armónicamente (Camelot: mismo número o ±1), evita el rojo y confía en tus oídos.'],
      tipsCmd: 'En la app: «sync b», «loop 4 a», «beat fx echo».',
      midi: ['Conecta la MC-707 por USB (móvil: cable USB-C OTG).', 'Abre Classic (classic.html) → barra MIDI SYNC → CONNECT → elige la MC-707 como IN y OUT.', 'App como máster: «Clock OUT»; CLK ▶ envía Start + reloj MIDI de 24 PPQN al BPM máster; CLK ■ = Stop.', 'En la MC-707: SYSTEM → SYNC/TEMPO — que siga el reloj externo (p. ej. AUTO / USB).', 'MC-707 como máster: elige «Clock IN» — la app lee el BPM del reloj entrante. Solo un máster de reloj a la vez.'],
      fb: 'Todavía no tengo respuesta sin conexión para eso. Prueba: consejos dj · ayuda midi · código bot · ayuda — o añade tu clave de IA en ⚙.', aiErr: 'La IA no respondió', thinking: 'pensando', keySaved: '🔐 Clave guardada solo en este dispositivo (localStorage) — nunca en el historial ni en la sincronización.', merged: 'Respuestas de varias IA' },
    fr: { hi: 'Salut ! Ici D Bot — le super bot D.bot 💚', who: 'Je suis D Bot, le bot principal de D Bot · D77 Studio de Daniel Dydo (Cracovie). Je pilote les decks, la radio et MilkDrop, j’aide au mix, à la synchro MIDI avec la MC-707 et j’écris des modèles de code. Hors ligne j’utilise mes connaissances intégrées ; avec ta propre clé API (⚙) je peux interroger Grok, Gemini ou ChatGPT.',
      help: '🌍 Super bot : 14 langues (je détecte la tienne) · 🎛 conseils DJ · 🎹 aide MIDI / MC-707 · 🧩 modèles de code (bot / agent / app / midi / android) · 🤖 IA avec ta propre clé (⚙)',
      tipsT: '🎛 Conseils DJ', midiT: '🎹 Horloge MIDI avec la Roland MC-707', codeT: '🧩 Modèle de code', codeMenu: 'Écris : « code bot », « code agent », « code app », « code midi » ou « code android ».',
      tips: ['D’abord le tempo : SYNC ou pitch, puis cale le « un » — lance le nouveau morceau au début d’une phrase (8/16/32 mesures).', 'Échange des basses à l’EQ : coupe le LOW du morceau entrant et échange les basses au changement de phrase — jamais deux basses en même temps.', 'Des boucles de 4/8 temps prolongent intro/outro ; Echo ou Filter aident à sortir en douceur.', 'Mixe harmoniquement (Camelot : même chiffre ou ±1), reste hors du rouge et fais confiance à tes oreilles.'],
      tipsCmd: 'Dans l’app : « sync b », « loop 4 a », « beat fx echo ».',
      midi: ['Branche la MC-707 en USB (téléphone : câble USB-C OTG).', 'Ouvre Classic (classic.html) → barre MIDI SYNC → CONNECT → choisis la MC-707 en IN et OUT.', 'App maître : « Clock OUT », CLK ▶ envoie Start + horloge MIDI 24 PPQN au BPM maître ; CLK ■ = Stop.', 'Sur la MC-707 : SYSTEM → SYNC/TEMPO — suivre l’horloge externe (ex. AUTO / USB).', 'MC-707 maître : choisis « Clock IN » — l’app lit le BPM de l’horloge entrante. Un seul maître d’horloge à la fois.'],
      fb: 'Je n’ai pas encore de réponse hors ligne. Essaie : conseils dj · aide midi · code bot · aide — ou ajoute ta clé IA dans ⚙.', aiErr: 'L’IA n’a pas répondu', thinking: 'je réfléchis', keySaved: '🔐 Clé enregistrée uniquement sur cet appareil (localStorage) — jamais dans l’historique ni la synchro.', merged: 'Réponses de plusieurs IA' },
    it: { hi: 'Ciao! Sono D Bot — il super bot di D.bot 💚', who: 'Sono D Bot, il bot principale di D Bot · D77 Studio di Daniel Dydo (Cracovia). Controllo deck, radio e MilkDrop, aiuto a mixare, a sincronizzare il MIDI con la MC-707 e scrivo modelli di codice. Offline uso la conoscenza integrata; con la tua chiave API (⚙) posso chiedere a Grok, Gemini o ChatGPT.',
      help: '🌍 Super bot: 14 lingue (riconosco la tua) · 🎛 consigli DJ · 🎹 aiuto MIDI / MC-707 · 🧩 modelli di codice (bot / agent / app / midi / android) · 🤖 IA con la tua chiave (⚙)',
      tipsT: '🎛 Consigli DJ', midiT: '🎹 Clock MIDI con la Roland MC-707', codeT: '🧩 Modello di codice', codeMenu: 'Scrivi: «codice bot», «codice agent», «codice app», «codice midi» o «codice android».',
      tips: ['Prima il tempo: SYNC o pitch, poi allinea l’«uno» — fai entrare il nuovo brano all’inizio di una frase (8/16/32 battute).', 'Scambio dei bassi con l’EQ: taglia il LOW del brano in entrata e scambia i bassi al cambio di frase — mai due linee di basso insieme.', 'Loop da 4/8 battiti allungano intro/outro; Echo o Filter aiutano a uscire in modo morbido.', 'Mixa in armonia (Camelot: stesso numero o ±1), resta fuori dal rosso e fidati delle orecchie.'],
      tipsCmd: 'Nell’app: «sync b», «loop 4 a», «beat fx echo».',
      midi: ['Collega la MC-707 via USB (telefono: cavo USB-C OTG).', 'Apri Classic (classic.html) → barra MIDI SYNC → CONNECT → scegli la MC-707 come IN e OUT.', 'App master: «Clock OUT», CLK ▶ invia Start + clock MIDI 24 PPQN al BPM master; CLK ■ = Stop.', 'Sulla MC-707: SYSTEM → SYNC/TEMPO — segui il clock esterno (es. AUTO / USB).', 'MC-707 master: scegli «Clock IN» — l’app legge il BPM dal clock in ingresso. Un solo master alla volta.'],
      fb: 'Non ho ancora una risposta offline. Prova: consigli dj · aiuto midi · codice bot · aiuto — oppure aggiungi la tua chiave IA in ⚙.', aiErr: 'L’IA non ha risposto', thinking: 'sto pensando', keySaved: '🔐 Chiave salvata solo su questo dispositivo (localStorage) — mai nella cronologia o nella sincronizzazione.', merged: 'Risposte di più IA' },
    pt: { hi: 'Olá! Aqui é o D Bot — o super bot do D.bot 💚', who: 'Sou o D Bot, o bot principal do D Bot · D77 Studio de Daniel Dydo (Cracóvia). Controlo os decks, o rádio e o MilkDrop, ajudo na mixagem, na sincronização MIDI com a MC-707 e escrevo modelos de código. Offline uso o conhecimento embutido; com a sua própria chave de API (⚙) posso perguntar ao Grok, Gemini ou ChatGPT.',
      help: '🌍 Super bot: 14 idiomas (detecto o seu) · 🎛 dicas de DJ · 🎹 ajuda MIDI / MC-707 · 🧩 modelos de código (bot / agent / app / midi / android) · 🤖 IA com a sua chave (⚙)',
      tipsT: '🎛 Dicas de DJ', midiT: '🎹 Clock MIDI com a Roland MC-707', codeT: '🧩 Modelo de código', codeMenu: 'Escreva: “código bot”, “código agent”, “código app”, “código midi” ou “código android”.',
      tips: ['Primeiro o tempo: SYNC ou pitch, depois alinhe o “um” — entre com a nova faixa no início de uma frase (8/16/32 compassos).', 'Troca de graves no EQ: corte o LOW da faixa que entra e troque os graves na mudança de frase — nunca duas linhas de baixo juntas.', 'Loops de 4/8 batidas estendem intro/outro; Echo ou Filter ajudam a sair suavemente.', 'Mixe harmonicamente (Camelot: mesmo número ou ±1), fique fora do vermelho e confie nos ouvidos.'],
      tipsCmd: 'No app: “sync b”, “loop 4 a”, “beat fx echo”.',
      midi: ['Ligue a MC-707 por USB (celular: cabo USB-C OTG).', 'Abra o Classic (classic.html) → barra MIDI SYNC → CONNECT → escolha a MC-707 como IN e OUT.', 'App como master: “Clock OUT”, CLK ▶ envia Start + clock MIDI 24 PPQN no BPM master; CLK ■ = Stop.', 'Na MC-707: SYSTEM → SYNC/TEMPO — seguir clock externo (ex.: AUTO / USB).', 'MC-707 como master: escolha “Clock IN” — o app lê o BPM do clock recebido. Só um master de clock por vez.'],
      fb: 'Ainda não tenho resposta offline para isso. Tente: dicas dj · ajuda midi · código bot · ajuda — ou adicione a sua chave de IA em ⚙.', aiErr: 'A IA não respondeu', thinking: 'pensando', keySaved: '🔐 Chave salva só neste dispositivo (localStorage) — nunca no histórico nem na sincronização.', merged: 'Respostas de várias IAs' },
    uk: { hi: 'Привіт! Це D Bot — супербот D.bot 💚', who: 'Я D Bot — головний бот застосунку D Bot · D77 Studio Даніеля Дидо (Краків). Керую деками, радіо та MilkDrop, допомагаю зводити треки, синхронізувати MIDI з MC-707 і пишу шаблони коду. Офлайн використовую вбудовані знання; з вашим власним API-ключем (⚙) можу питати Grok, Gemini або ChatGPT.',
      help: '🌍 Супербот: 14 мов (визначаю вашу) · 🎛 поради DJ · 🎹 допомога MIDI / MC-707 · 🧩 шаблони коду (bot / agent / app / midi / android) · 🤖 ШІ з вашим ключем (⚙)',
      tipsT: '🎛 Поради DJ', midiT: '🎹 MIDI clock з Roland MC-707', codeT: '🧩 Шаблон коду', codeMenu: 'Напишіть: «код bot», «код agent», «код app», «код midi» або «код android».',
      tips: ['Спершу темп: SYNC або pitch, потім вирівняйте «раз» — новий трек входить на початку фрази (8/16/32 такти).', 'Заміна басу на EQ: приберіть LOW у новому треку й поміняйте баси на зміні фрази — ніколи дві басові лінії разом.', 'Лупи на 4/8 бітів подовжують інтро/аутро; Echo або Filter допомагають м’яко вийти з треку.', 'Зводьте гармонійно (Camelot: те саме число або ±1), не заходьте в червоне й довіряйте слуху.'],
      tipsCmd: 'У застосунку: «sync b», «loop 4 a», «beat fx echo».',
      midi: ['Підключіть MC-707 через USB (телефон: кабель USB-C OTG).', 'Відкрийте Classic (classic.html) → панель MIDI SYNC → CONNECT → оберіть MC-707 як IN і OUT.', 'Застосунок як master: «Clock OUT», CLK ▶ надсилає Start + MIDI clock 24 PPQN у темпі майстра; CLK ■ = Stop.', 'На MC-707: SYSTEM → SYNC/TEMPO — синхронізація із зовнішнім годинником (напр. AUTO / USB).', 'MC-707 як master: оберіть «Clock IN» — застосунок читає BPM із вхідного clock. Лише один майстер одночасно.'],
      fb: 'Поки що не маю офлайн-відповіді. Спробуйте: поради dj · допомога midi · код bot · допомога — або додайте свій ключ ШІ в ⚙.', aiErr: 'ШІ не відповів', thinking: 'думаю', keySaved: '🔐 Ключ збережено лише на цьому пристрої (localStorage) — ніколи в історії чату чи синхронізації.', merged: 'Відповіді кількох ШІ' },
    ru: { hi: 'Привет! Это D Bot — супербот D.bot 💚', who: 'Я D Bot — главный бот приложения D Bot · D77 Studio Даниэля Дыдо (Краков). Управляю деками, радио и MilkDrop, помогаю сводить треки, синхронизировать MIDI с MC-707 и пишу шаблоны кода. Офлайн использую встроенные знания; с вашим собственным API-ключом (⚙) могу спрашивать Grok, Gemini или ChatGPT.',
      help: '🌍 Супербот: 14 языков (определяю ваш) · 🎛 советы DJ · 🎹 помощь MIDI / MC-707 · 🧩 шаблоны кода (bot / agent / app / midi / android) · 🤖 ИИ с вашим ключом (⚙)',
      tipsT: '🎛 Советы DJ', midiT: '🎹 MIDI clock с Roland MC-707', codeT: '🧩 Шаблон кода', codeMenu: 'Напишите: «код bot», «код agent», «код app», «код midi» или «код android».',
      tips: ['Сначала темп: SYNC или pitch, затем выровняйте «раз» — новый трек входит в начале фразы (8/16/32 такта).', 'Смена баса на EQ: уберите LOW во входящем треке и поменяйте басы на смене фразы — никогда две басовые линии сразу.', 'Лупы на 4/8 долей удлиняют интро/аутро; Echo или Filter помогают мягко выйти из трека.', 'Сводите гармонично (Camelot: то же число или ±1), не заходите в красную зону и доверяйте ушам.'],
      tipsCmd: 'В приложении: «sync b», «loop 4 a», «beat fx echo».',
      midi: ['Подключите MC-707 по USB (телефон: кабель USB-C OTG).', 'Откройте Classic (classic.html) → панель MIDI SYNC → CONNECT → выберите MC-707 как IN и OUT.', 'Приложение как master: «Clock OUT», CLK ▶ отправляет Start + MIDI clock 24 PPQN в темпе мастера; CLK ■ = Stop.', 'На MC-707: SYSTEM → SYNC/TEMPO — следовать внешнему клоку (например AUTO / USB).', 'MC-707 как master: выберите «Clock IN» — приложение считывает BPM из входящего клока. Только один мастер одновременно.'],
      fb: 'Пока нет офлайн-ответа. Попробуйте: советы dj · помощь midi · код bot · помощь — или добавьте свой ключ ИИ в ⚙.', aiErr: 'ИИ не ответил', thinking: 'думаю', keySaved: '🔐 Ключ сохранён только на этом устройстве (localStorage) — никогда в истории чата или синхронизации.', merged: 'Ответы нескольких ИИ' },
    cs: { hi: 'Ahoj! Tady D Bot — super bot D.bot 💚', who: 'Jsem D Bot, hlavní bot aplikace D Bot · D77 Studio Daniela Dydo (Krakov). Ovládám decky, rádio a MilkDrop, pomáhám s mixováním, MIDI synchronizací s MC-707 a píšu šablony kódu. Offline používám vestavěné znalosti; s tvým vlastním API klíčem (⚙) se můžu zeptat Groku, Gemini nebo ChatGPT.',
      help: '🌍 Super bot: 14 jazyků (poznám tvůj) · 🎛 DJ tipy · 🎹 pomoc s MIDI / MC-707 · 🧩 šablony kódu (bot / agent / app / midi / android) · 🤖 AI s vlastním klíčem (⚙)',
      tipsT: '🎛 DJ tipy', midiT: '🎹 MIDI clock s Roland MC-707', codeT: '🧩 Šablona kódu', codeMenu: 'Napiš: „kód bot“, „kód agent“, „kód app“, „kód midi“ nebo „kód android“.',
      tips: ['Nejdřív tempo: SYNC nebo pitch, pak srovnej „jedničku“ — nová skladba vstupuje na začátku fráze (8/16/32 taktů).', 'Výměna basů na EQ: ubírej LOW u příchozí skladby a basy prohoď při změně fráze — nikdy dvě basové linky naráz.', 'Smyčky 4/8 dob prodlouží intro/outro; Echo nebo Filter pomohou plynule odejít.', 'Mixuj harmonicky (Camelot: stejné číslo nebo ±1), drž úrovně mimo červenou a věř uším.'],
      tipsCmd: 'V aplikaci: „sync b“, „loop 4 a“, „beat fx echo“.',
      midi: ['Připoj MC-707 přes USB (telefon: kabel USB-C OTG).', 'Otevři Classic (classic.html) → lišta MIDI SYNC → CONNECT → vyber MC-707 jako IN i OUT.', 'Aplikace jako master: „Clock OUT“, CLK ▶ pošle Start + MIDI clock 24 PPQN v tempu mastera; CLK ■ = Stop.', 'Na MC-707: SYSTEM → SYNC/TEMPO — řídit se externím clockem (např. AUTO / USB).', 'MC-707 jako master: zvol „Clock IN“ — aplikace čte BPM z příchozího clocku. Vždy jen jeden master.'],
      fb: 'Na to zatím nemám offline odpověď. Zkus: dj tipy · midi pomoc · kód bot · pomoc — nebo přidej svůj AI klíč v ⚙.', aiErr: 'AI neodpověděla', thinking: 'přemýšlím', keySaved: '🔐 Klíč uložen jen v tomto zařízení (localStorage) — nikdy v historii chatu ani v synchronizaci.', merged: 'Odpovědi několika AI' },
    ja: { hi: 'こんにちは！D.bot のスーパーボット、D Botです 💚', who: '私はD Bot。Daniel Dydo（クラクフ）の D Bot · D77 Studio のメインボットです。デッキ、ラジオ、MilkDrop を操作し、ミックス、MC-707 との MIDI 同期、コードのテンプレート作成を手伝います。オフラインでは内蔵の知識を使い、あなた自身の API キー（⚙）があれば Grok・Gemini・ChatGPT に質問できます。',
      help: '🌍 スーパーボット：14言語（自動判別）· 🎛 DJ のコツ · 🎹 MIDI / MC-707 ヘルプ · 🧩 コードテンプレート（bot / agent / app / midi / android）· 🤖 自分のキーで AI（⚙ 設定）',
      tipsT: '🎛 DJ のコツ', midiT: '🎹 Roland MC-707 と MIDI クロック', codeT: '🧩 コードテンプレート', codeMenu: '「コード bot」「コード agent」「コード app」「コード midi」「コード android」と入力してください。',
      tips: ['まずテンポ：SYNC かピッチで合わせ、「1拍目」をそろえる — 新しい曲はフレーズ（8/16/32小節）の頭で入れる。', 'EQ でベース交換：入ってくる曲の LOW を下げ、フレーズの変わり目でベースを入れ替える — ベースラインを2本同時に鳴らさない。', '4/8拍のループでイントロ/アウトロを延長し、Echo や Filter でなめらかに抜ける。', 'ハーモニックミックス（Camelot：同じ数字か ±1）、レベルは赤に入れず、耳を信じる。'],
      tipsCmd: 'アプリでは：「sync b」「loop 4 a」「beat fx echo」。',
      midi: ['MC-707 を USB で接続（スマホは USB-C OTG ケーブル）。', 'Classic（classic.html）→ MIDI SYNC バー → CONNECT → IN と OUT に MC-707 を選択。', 'アプリがマスター：「Clock OUT」、CLK ▶ で Start と 24 PPQN の MIDI クロックをマスター BPM で送信、CLK ■ で Stop。', 'MC-707 側：SYSTEM → SYNC/TEMPO で外部クロックに同期（例：AUTO / USB）。', 'MC-707 がマスター：「Clock IN」を選ぶとアプリが受信クロックから BPM を読み取ります。クロックのマスターは常に1台だけ。'],
      fb: 'それにはまだオフラインの回答がありません。「DJ のコツ」「midi ヘルプ」「コード bot」「ヘルプ」を試すか、⚙ で AI キーを追加してください。', aiErr: 'AI から応答がありません', thinking: '考え中', keySaved: '🔐 キーはこの端末（localStorage）にのみ保存され、チャット履歴や同期には含まれません。', merged: '複数の AI の回答' },
    zh: { hi: '你好！我是 D.bot 的超级机器人 D Bot 💚', who: '我是 D Bot，Daniel Dydo（克拉科夫）的 D Bot · D77 Studio 的主机器人。我可以控制唱盘、电台和 MilkDrop，帮助混音、与 MC-707 进行 MIDI 同步，并编写代码模板。离线时使用内置知识；有你自己的 API 密钥（⚙）时，我可以询问 Grok、Gemini 或 ChatGPT。',
      help: '🌍 超级机器人：14 种语言（自动识别）· 🎛 DJ 技巧 · 🎹 MIDI / MC-707 帮助 · 🧩 代码模板（bot / agent / app / midi / android）· 🤖 使用你自己的密钥调用 AI（⚙ 设置）',
      tipsT: '🎛 DJ 技巧', midiT: '🎹 与 Roland MC-707 的 MIDI 时钟', codeT: '🧩 代码模板', codeMenu: '输入：“代码 bot”、“代码 agent”、“代码 app”、“代码 midi” 或 “代码 android”。',
      tips: ['先对齐速度：用 SYNC 或推子调速，再对齐“第一拍”——新曲在乐句开头（8/16/32 小节）进入。', '用 EQ 交换低音：降低进入曲目的 LOW，在乐句变化时交换低音——不要两条低音线同时播放。', '用 4/8 拍循环延长前奏/尾奏；Echo 或 Filter 效果帮助平滑退出。', '和声混音（Camelot：相同数字或 ±1），电平别进红区，相信你的耳朵。'],
      tipsCmd: '在应用中：“sync b”、“loop 4 a”、“beat fx echo”。',
      midi: ['用 USB 连接 MC-707（手机需 USB-C OTG 线）。', '打开 Classic（classic.html）→ MIDI SYNC 栏 → CONNECT → 将 MC-707 选为 IN 和 OUT。', '应用作为主时钟：选择“Clock OUT”，CLK ▶ 以主 BPM 发送 Start + 24 PPQN MIDI 时钟；CLK ■ = 停止。', '在 MC-707 上：SYSTEM → SYNC/TEMPO，设置为跟随外部时钟（如 AUTO / USB）。', 'MC-707 作为主时钟：选择“Clock IN”，应用从输入时钟读取 BPM。同一时间只能有一个时钟主机。'],
      fb: '这个问题我还没有离线答案。试试：DJ 技巧 · midi 帮助 · 代码 bot · 帮助——或在 ⚙ 中添加你的 AI 密钥。', aiErr: 'AI 没有回应', thinking: '思考中', keySaved: '🔐 密钥只保存在本设备（localStorage）——不会进入聊天记录或同步。', merged: '多个 AI 的回答' },
    ar: { hi: 'مرحبًا! أنا D Bot — البوت الخارق في D.bot 💚', who: 'أنا D Bot، البوت الرئيسي لتطبيق D Bot · D77 Studio من D Bot ديدو (كراكوف). أتحكم في الأسطوانات والراديو وMilkDrop، وأساعد في المزج ومزامنة MIDI مع MC-707 وأكتب قوالب برمجية. دون اتصال أستخدم معرفتي المدمجة؛ ومع مفتاح API الخاص بك (⚙) يمكنني سؤال Grok أو Gemini أو ChatGPT.',
      help: '🌍 بوت خارق: 14 لغة (أتعرّف على لغتك) · 🎛 نصائح DJ · 🎹 مساعدة MIDI / MC-707 · 🧩 قوالب برمجية (bot / agent / app / midi / android) · 🤖 ذكاء اصطناعي بمفتاحك (⚙)',
      tipsT: '🎛 نصائح DJ', midiT: '🎹 ساعة MIDI مع Roland MC-707', codeT: '🧩 قالب برمجي', codeMenu: 'اكتب: «كود bot» أو «كود agent» أو «كود app» أو «كود midi» أو «كود android».',
      tips: ['السرعة أولًا: SYNC أو pitch، ثم طابق «الضربة الأولى» — أدخل المقطع الجديد في بداية الجملة الموسيقية (8/16/32 مازورة).', 'تبديل الباص بالـ EQ: اخفض LOW في المقطع الداخل وبدّل الباص عند تغيّر الجملة — لا خطّي باص معًا أبدًا.', 'استخدم حلقات 4/8 نبضات لإطالة المقدمة/الخاتمة؛ Echo أو Filter يساعدان على الخروج بسلاسة.', 'امزج بانسجام (Camelot: نفس الرقم أو ±1)، ابتعد عن الأحمر وثق بأذنيك.'],
      tipsCmd: 'في التطبيق: «sync b»، «loop 4 a»، «beat fx echo».',
      midi: ['وصّل MC-707 عبر USB (الهاتف: كابل USB-C OTG).', 'افتح Classic (classic.html) ← شريط MIDI SYNC ← CONNECT ← اختر MC-707 كـ IN وOUT.', 'التطبيق كمصدر للساعة: «Clock OUT»؛ CLK ▶ يرسل Start + ساعة MIDI بدقة 24 PPQN بسرعة BPM الرئيسية؛ CLK ■ = إيقاف.', 'على MC-707: SYSTEM ← SYNC/TEMPO — اتبع الساعة الخارجية (مثل AUTO / USB).', 'MC-707 كمصدر: اختر «Clock IN» — يقرأ التطبيق BPM من الساعة الواردة. مصدر ساعة واحد فقط في كل مرة.'],
      fb: 'لا أملك إجابة دون اتصال لهذا بعد. جرّب: نصائح dj · مساعدة midi · كود bot · مساعدة — أو أضف مفتاح الذكاء الاصطناعي في ⚙.', aiErr: 'لم يرد الذكاء الاصطناعي', thinking: 'أفكر', keySaved: '🔐 حُفظ المفتاح على هذا الجهاز فقط (localStorage) — لا يدخل سجل الدردشة أو المزامنة.', merged: 'إجابات عدة أنظمة ذكاء اصطناعي' },
    hi: { hi: 'नमस्ते! मैं D Bot हूँ — D.bot का सुपर बॉट 💚', who: 'मैं D Bot हूँ — Daniel Dydo (क्राकोव) के D Bot · D77 Studio का मुख्य बॉट। मैं डेक, रेडियो और MilkDrop चलाता हूँ, मिक्सिंग, MC-707 के साथ MIDI सिंक में मदद करता हूँ और कोड टेम्पलेट लिखता हूँ। ऑफ़लाइन मैं अंतर्निहित ज्ञान का उपयोग करता हूँ; आपकी अपनी API कुंजी (⚙) से मैं Grok, Gemini या ChatGPT से पूछ सकता हूँ।',
      help: '🌍 सुपर बॉट: 14 भाषाएँ (आपकी भाषा पहचानता हूँ) · 🎛 DJ सुझाव · 🎹 MIDI / MC-707 मदद · 🧩 कोड टेम्पलेट (bot / agent / app / midi / android) · 🤖 अपनी कुंजी से AI (⚙)',
      tipsT: '🎛 DJ सुझाव', midiT: '🎹 Roland MC-707 के साथ MIDI क्लॉक', codeT: '🧩 कोड टेम्पलेट', codeMenu: 'लिखें: “कोड bot”, “कोड agent”, “कोड app”, “कोड midi” या “कोड android”।',
      tips: ['पहले टेम्पो: SYNC या pitch, फिर “एक” मिलाएँ — नया ट्रैक फ़्रेज़ (8/16/32 बार) की शुरुआत में लाएँ।', 'EQ से बेस बदलें: आने वाले ट्रैक का LOW कम करें और फ़्रेज़ बदलने पर बेस बदलें — कभी दो बेसलाइन एक साथ नहीं।', '4/8 बीट के लूप से इंट्रो/आउट्रो लंबा करें; Echo या Filter से आराम से बाहर निकलें।', 'हार्मोनिक मिक्स करें (Camelot: वही संख्या या ±1), लेवल लाल में न जाने दें और अपने कानों पर भरोसा करें।'],
      tipsCmd: 'ऐप में: “sync b”, “loop 4 a”, “beat fx echo”।',
      midi: ['MC-707 को USB से जोड़ें (फ़ोन: USB-C OTG केबल)।', 'Classic (classic.html) खोलें → MIDI SYNC पट्टी → CONNECT → IN और OUT में MC-707 चुनें।', 'ऐप मास्टर: “Clock OUT”, CLK ▶ मास्टर BPM पर Start + 24 PPQN MIDI क्लॉक भेजता है; CLK ■ = Stop।', 'MC-707 पर: SYSTEM → SYNC/TEMPO — बाहरी क्लॉक का पालन (जैसे AUTO / USB)।', 'MC-707 मास्टर: “Clock IN” चुनें — ऐप आने वाली क्लॉक से BPM पढ़ता है। एक समय में सिर्फ़ एक क्लॉक मास्टर।'],
      fb: 'इसका ऑफ़लाइन उत्तर अभी मेरे पास नहीं है। आज़माएँ: dj सुझाव · midi मदद · कोड bot · मदद — या ⚙ में अपनी AI कुंजी जोड़ें।', aiErr: 'AI ने उत्तर नहीं दिया', thinking: 'सोच रहा हूँ', keySaved: '🔐 कुंजी केवल इस डिवाइस पर सहेजी गई (localStorage) — चैट इतिहास या सिंक में कभी नहीं।', merged: 'कई AI के उत्तर' }
  };
  function tr(code) { return T[base(code)] || T.en; }

  // ------------------------------------------------------------------ offline code templates (language-neutral code)
  var CODE = {
    bot: ['Rule-based multilingual chat bot (browser JS, offline)', [
      "const RULES = [",
      "  { re: /^(hi|hello|cześć|hola|hallo)\\b/i, say: (m) => 'Hi! 👋' },",
      "  { re: /\\b(bpm|tempo)\\s*(\\d{2,3})/i, say: (m) => `Tempo → ${m[2]} BPM` },",
      "  { re: /\\bhelp|pomoc|ayuda|hilfe\\b/i, say: () => 'Commands: hi · bpm 128 · help' },",
      "];",
      "export function reply(text) {",
      "  for (const r of RULES) { const m = text.match(r.re); if (m) return r.say(m); }",
      "  return \"I don't know that yet 🙂\";",
      "}",
      "// usage: input.onchange = () => log.append(reply(input.value));"].join('\n')],
    agent: ['AI agent loop (Node 18+, xAI Grok by default) — key from env, never hard-coded', [
      "// XAI_API_KEY=... node agent.mjs \"plan a 1h techno set at 128 BPM\"",
      "const KEY = process.env.XAI_API_KEY; if (!KEY) throw new Error('set XAI_API_KEY');",
      "const tools = { time: () => new Date().toISOString(), bpmToMs: ({ bpm }) => (60000 / bpm).toFixed(1) + ' ms/beat' };",
      "const sys = 'You are a DJ assistant agent. To use a tool answer ONLY with JSON {\"tool\":\"name\",\"args\":{}}; otherwise answer normally. Tools: ' + Object.keys(tools).join(', ');",
      "const messages = [{ role: 'system', content: sys }, { role: 'user', content: process.argv[2] || 'hello' }];",
      "for (let step = 0; step < 5; step++) {",
      "  const r = await fetch('https://api.x.ai/v1/chat/completions', { method: 'POST',",
      "    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },",
      "    body: JSON.stringify({ model: 'grok-4.7', messages }) });",
      "  const out = (await r.json()).choices[0].message.content.trim();",
      "  let call = null; try { call = JSON.parse(out); } catch {}",
      "  if (!call || !tools[call.tool]) { console.log(out); break; }",
      "  messages.push({ role: 'assistant', content: out }, { role: 'user', content: 'TOOL RESULT: ' + tools[call.tool](call.args || {}) });",
      "}"].join('\n')],
    app: ['Single-file installable web app (PWA-ready, dark cosmic UI)', [
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" />",
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" /><meta name=\"theme-color\" content=\"#06070b\" />",
      "<title>My D.bot App</title><style>",
      " body{margin:0;min-height:100dvh;display:grid;place-items:center;color:#eef1f8;font:16px system-ui;",
      "  background:radial-gradient(60% 50% at 30% 20%,#00e5ff22,transparent),radial-gradient(50% 40% at 80% 80%,#ff2d9522,transparent),#06070b}",
      " .card{padding:24px;border-radius:18px;background:#ffffff0d;border:1px solid #ffffff22;backdrop-filter:blur(14px)}",
      " button{border:0;border-radius:999px;padding:10px 18px;background:linear-gradient(110deg,#b8ff3c,#00e5ff);font-weight:700}",
      "</style></head><body><div class=\"card\"><h1>Hello 👋</h1><p id=\"out\">Ready.</p>",
      "<button id=\"go\">Tap</button></div><script>",
      " let n = 0; go.onclick = () => out.textContent = 'Taps: ' + (++n);",
      "</script></body></html>"].join('\n')],
    midi: ['Web MIDI clock master for the Roland MC-707 (24 PPQN, Start/Stop)', [
      "const access = await navigator.requestMIDIAccess();",
      "const out = [...access.outputs.values()].find((p) => /mc-?707|roland/i.test(p.name));",
      "if (!out) throw new Error('MC-707 not found — connect USB');",
      "let timer = null;",
      "export function start(bpm = 128) {",
      "  stop(); out.send([0xFA]);                 // Start",
      "  const ms = 60000 / bpm / 24;              // 24 ticks per quarter note",
      "  let next = performance.now();",
      "  timer = setInterval(() => {               // catch-up loop keeps long-term timing stable",
      "    const now = performance.now();",
      "    while (next <= now) { out.send([0xF8], next); next += ms; }",
      "  }, 5);",
      "}",
      "export function stop() { if (timer) { clearInterval(timer); timer = null; out.send([0xFC]); } }"].join('\n')],
    android: ['Minimal Android WebView app (Java) — loads bundled assets/www/index.html', [
      "public class MainActivity extends android.app.Activity {",
      "  @Override protected void onCreate(android.os.Bundle b) {",
      "    super.onCreate(b);",
      "    android.webkit.WebView w = new android.webkit.WebView(this);",
      "    w.getSettings().setJavaScriptEnabled(true);",
      "    w.getSettings().setMediaPlaybackRequiresUserGesture(false);",
      "    w.setWebViewClient(new android.webkit.WebViewClient());",
      "    w.loadUrl(\"file:///android_asset/www/index.html\");",
      "    setContentView(w);",
      "  }",
      "}",
      "// AndroidManifest: <uses-permission android:name=\"android.permission.INTERNET\"/> (+ RECORD_AUDIO for voice)"].join('\n')]
  };

  // ------------------------------------------------------------------ intents
  var RE = {
    key: /\b(xai-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,})\b/,
    settings: /^(ustawienia|settings|einstellungen|ajustes|parametres|impostazioni|configuracoes|nastaveni|настройки|налаштування|設定|设置|الإعدادات|सेटिंग्स|ai|klucz|klucze|api key|keys|⚙)$/,
    tips: /(\bdj ?tips?\b|\btips? dj\b|\bporad\w*|\bwskazowk\w*|\bjak miksowac|\bmiksowani\w*|\bhow to mix\b|\bmixing tips\b|\btipps?\b|\bratschl\w*|\bconsejos?\b|\bconseils?\b|\bconsigli\w*|\bdicas?\b|\btipy\b|порад|совет|ヒント|コツ|技巧|نصائح|نصيحة|सुझाव|टिप्स)/,
    midi: /(\bmidi\b|\bmc ?-?707\b|\bmidi ?clock\b|\bzegar midi\b|ミディ|クロック|时钟)/,
    code: /(\bkod\w*|\bcode\b|\btemplate\b|\bszablon\w*|\bvorlage\b|\bplantilla\b|\bcodigo\b|\bcodice\b|\bkodu\b|\bkod\b|код|шаблон|コード|テンプレート|代码|模板|كود|قالب|कोड|टेम्पलेट)/,
    help: /^(hilfe|ayuda|aide|aiuto|ajuda|napoveda|pomoc|help|допомога|помощь|ヘルプ|帮助|مساعدة|मदद)\b/,
    hello: /^(hallo|hola|bonjour|salut|ciao|ola|ahoj|привет|привіт|こんにちは|你好|مرحبا|नमस्ते)/,
    who: /(wer bist du|quien eres|qui es[- ]tu|chi sei|quem e voce|kdo jsi|кто ты|хто ти|あなたは誰|誰ですか|你是谁|من أنت|तुम कौन|आप कौन)/,
    askAll: /^(ask all|zapytaj wszystkie|wszystkie ai|frag alle|pregunta a todas|demande a toutes|chiedi a tutte|pergunte a todas|спроси все|запитай всі|zeptej se vsech)[: ]/,
    app: /\b(deck|dek|play|graj|zagraj|pauza|pause|stop|loop|petl\w*|cue|hot ?cue|sync|tempo|pitch|bpm|fx|echo|filter|filtr|eq|kali|radio|viz|wizualizac\w*|preset|pelny ekran|full ?screen|fullscreen|status|skroty|moje tracki|my tracks|jakie mam|znajdz|find|pamiec|pamietasz|remember|pomysly|ideas|kalendarz|calendar|w planach|offline|mesh|grok bridge|zapamietaj|kim jestes|who are you|glosnosc|volume|xfade|crossfader|nastepn\w*|next|poprzedn\w*|prev|yt|trance|techno|berlin|dax|share|udostepnij|whatsapp|messenger|youtube|scratch|jog|reverse|slip|quantize|key ?lock|trim|kill)\b/
  };
  function codeKind(n) {
    if (/\bagent\w*|агент|エージェント|代理|智能体|وكيل|एजेंट/.test(n)) return 'agent';
    if (/\bmidi\b|mc ?-?707/.test(n)) return 'midi';
    if (/\bandroid\b|\bapk\b/.test(n)) return 'android';
    if (/\bapp\b|\baplikac\w*|\bpwa\b|\bweb\w*|\bstron\w*|приложен|застосун|アプリ|应用|تطبيق|ऐप/.test(n)) return 'app';
    if (/\bbot\w*|бот|ボット|机器人|بوت|बॉट/.test(n)) return 'bot';
    return null;
  }

  // ------------------------------------------------------------------ AI providers (user's own keys, device-only)
  var PROVIDERS = {
    xai: { label: 'xAI Grok', model: 'grok-4.7', keyHint: 'xai-…', console: 'https://console.x.ai' },
    gemini: { label: 'Google Gemini', model: 'gemini-3.8-flash', keyHint: 'AIza…', console: 'https://aistudio.google.com/apikey' },
    openai: { label: 'OpenAI ChatGPT', model: 'gpt-6-luna', keyHint: 'sk-…', console: 'https://platform.openai.com/api-keys' },
    local: { label: '🧠 Darmowy mózg (na telefonie)', model: 'Qwen3-0.6B', keyHint: '', console: '' } // v46: free on-device model, no key
  };
  function LocalAI() { return global.DBotLocalAI; }
  function localOn() { var L = LocalAI(); return !!(L && L.usable()); }
  /** any brain available: cloud key (optional upgrade) or the free on-device model (default) */
  function brainOn() { return aiOn() || localOn(); }
  var ORDER = ['xai', 'gemini', 'openai'];
  function loadAi() {
    var a = lsGet(LS_AI, null) || {};
    a.keys = a.keys || {}; a.models = a.models || {}; a.enabled = a.enabled || {};
    ORDER.forEach(function (p) {
      if (typeof a.enabled[p] !== 'boolean') a.enabled[p] = p !== 'openai' && !!a.keys[p]; // OpenAI stays off until the user turns it on
      if (!a.models[p]) a.models[p] = PROVIDERS[p].model;
    });
    if (ORDER.indexOf(a.active) < 0) a.active = 'xai';
    if (['one', 'all'].indexOf(a.route) < 0) a.route = 'one';
    if (typeof a.smart !== 'boolean') a.smart = true;
    return a;
  }
  var AI = loadAi();
  function saveAi() { lsSet(LS_AI, AI); }
  var SB = lsGet(LS_SB, null) || {}; if (['auto', 'dj', 'midi', 'code'].indexOf(SB.mode) < 0) SB.mode = 'auto';
  function saveSb() { lsSet(LS_SB, SB); }
  function usable(p) { return !!(AI.keys[p] && AI.enabled[p]); }
  function usableList() { return ORDER.filter(usable); }
  function aiOn() { return AI.smart && (usableList().length > 0 || brainsOn()); }
  function brainsOn() { var B = global.DBotBrains; return !!(B && B.cloudOn()); } // v47: Mózgi AI
  function plabel(p) { return PROVIDERS[p] ? PROVIDERS[p].label : (global.DBotBrains ? global.DBotBrains.label(p) : String(p)); }
  function mask(k) { k = String(k || ''); return k ? k.slice(0, 4) + '…' + k.slice(-4) : ''; }

  var nid = 0, waiting = {};
  /** Android: D7Native.aiChat(id, provider, key, model, bodyJson) — fixed HTTPS endpoints in Java (no CORS); answers via D7Super._native. */
  function nativeAi() { try { return !!(global.D7Native && typeof global.D7Native.aiChat === 'function'); } catch (_) { return false; } }
  function httpAi(p, key, model, body) {
    if (nativeAi()) {
      return new Promise(function (res) {
        var id = ++nid; var t = setTimeout(function () { delete waiting[id]; res({ status: 0, text: 'timeout' }); }, 65000);
        waiting[id] = function (st, tx) { clearTimeout(t); res({ status: st, text: tx }); };
        try { global.D7Native.aiChat(id, p, key, model, JSON.stringify(body)); } catch (e) { clearTimeout(t); delete waiting[id]; res({ status: 0, text: String(e && e.message) }); }
      });
    }
    var url, headers = { 'Content-Type': 'application/json' };
    if (p === 'xai') { url = 'https://api.x.ai/v1/chat/completions'; headers.Authorization = 'Bearer ' + key; }
    else if (p === 'openai') { url = 'https://api.openai.com/v1/chat/completions'; headers.Authorization = 'Bearer ' + key; }
    else { url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent'; headers['x-goog-api-key'] = key; }
    var ctl = global.AbortController ? new AbortController() : null, t2 = setTimeout(function () { try { ctl && ctl.abort(); } catch (_) {} }, 60000);
    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined, credentials: 'omit', cache: 'no-store' })
      .then(function (r) { return r.text().then(function (tx) { clearTimeout(t2); return { status: r.status, text: tx }; }); })
      .catch(function (e) { clearTimeout(t2); return { status: 0, text: String(e && e.message || e) }; });
  }
  function langName(code) { var l = LANGS.filter(function (x) { return x[0] === code; })[0]; return l ? l[2] + ' (' + code + ')' : code; }
  function systemPrompt(lang, mode) {
    var B = global.BotD, gk = '';
    try { if (B && B.GK && B.GK.summary) gk = String(B.GK.summary()).slice(0, 400); } catch (_) {}
    return 'You are D Bot — a warm, friendly, genuinely helpful general assistant and the main bot (orchestrator of specialist agents) of the app „D Bot · D77 Studio” made by Daniel Dydo (Kraków, Poland). ' +
      'Talk with the user about ANY topic like a smart friend: everyday questions, science, history, travel, cooking, learning, writing, maths, tech, health/legal basics (with a short note to consult a professional), ideas, feelings — and of course music. ' +
      'Use the conversation history to keep context, ask a short follow-up question when it helps, be honest when you are unsure. A second bot, D Builder, builds apps, bots and agents from a description (the user can just say „zbuduj …”). ' +
      'ALWAYS reply in ' + langName(lang) + '. Be concise (≈120 words) unless the user asks for code or detail. ' +
      'Expertise: DJ mixing on Pioneer-style decks (hot cues, loops, SYNC, BEAT FX, EQ), the Roland MC-707 groovebox and MIDI clock sync ' +
      '(the app\'s Classic page has a MIDI SYNC strip: CONNECT, IN/OUT, Clock OUT = app is master sending Start + 24 PPQN, Clock IN = follow external clock), ' +
      'MilkDrop/Butterchurn visuals, and writing complete minimal runnable code for apps, bots and AI agents. ' +
      'In code never hard-code API keys (read them from environment variables or user settings). ' +
      'Never ask for, repeat or reveal API keys, passwords, PINs or e-mail addresses. ' +
      'App voice/text commands the user can type: „play deck a”, „loop 4 a”, „sync b”, „beat fx echo”, „kali radio”, „pełny ekran”, „status”. ' +
      (mode && mode !== 'auto' ? 'Focus: ' + { dj: 'DJ / mixing tips', midi: 'MIDI and MC-707 sync help', code: 'code templates for apps, bots and agents' }[mode] + '. ' : '') +
      (gk ? 'Offline knowledge summary of the owner\'s library: ' + gk : '') +
      (global.DBotOpts ? global.DBotOpts.addon() : '') + (global.DBotBus ? global.DBotBus.prompt(6) : ''); // v46: personality, reply length, shared agent memory
  }
  // v46: conversation memory persisted on the device (last ~20 turns); API keys are never written here
  var LS_CONVO = 'dbot-convo', CONVO_MAX = 40;
  var convo = (function () { try { var a = JSON.parse(localStorage.getItem(LS_CONVO) || '[]'); return Array.isArray(a) ? a.slice(-CONVO_MAX) : []; } catch (_) { return []; } })();
  function scrubKeys(t) { return String(t || '').replace(/\b(xai-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-(proj-)?[A-Za-z0-9_-]{20,})\b/g, '[klucz ukryty]'); }
  function pushConvo(u, a) { convo.push({ role: 'user', content: scrubKeys(u).slice(0, 4000) }, { role: 'assistant', content: scrubKeys(a).slice(0, 6000) }); convo = convo.slice(-CONVO_MAX); try { localStorage.setItem(LS_CONVO, JSON.stringify(convo)); } catch (_) {} }
  function askOne(p, text, lang, mode) {
    var sys = systemPrompt(lang, mode), hist = convo.slice(-CONVO_MAX);
    try { if (global.DBotTeam && global.DBotTeam.persona) sys = global.DBotTeam.persona.wrap(sys) + '\nYour name is D (main bot of the Super D Bot · 7 DJ team).'; } catch (_) {}
    if (/^b:/.test(p) && global.DBotBrains) return global.DBotBrains.ask(p, sys, text, { history: hist });
    if (p === 'local') return askLocal(shortSys(lang), text, hist, { maxTokens: 260, temperature: 0.5 });
    var key = AI.keys[p], model = AI.models[p] || PROVIDERS[p].model, body;
    if (p === 'gemini') {
      body = { systemInstruction: { parts: [{ text: sys }] }, contents: hist.map(function (m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }; }).concat([{ role: 'user', parts: [{ text: text }] }]) };
    } else {
      body = { model: model, messages: [{ role: 'system', content: sys }].concat(hist).concat([{ role: 'user', content: text }]) };
    }
    return httpAi(p, key, model, body).then(function (r) {
      var j = null; try { j = JSON.parse(r.text); } catch (_) {}
      var out = '';
      if (j && p === 'gemini') { try { out = (j.candidates[0].content.parts || []).map(function (x) { return x.text || ''; }).join('').trim(); } catch (_) {} }
      else if (j) { try { out = String(j.choices[0].message.content || '').trim(); } catch (_) {} }
      if (r.status >= 200 && r.status < 300 && out) return { p: p, ok: true, text: out };
      var err = (j && j.error && (j.error.message || j.error.status || j.error)) || ('HTTP ' + r.status + (r.status ? '' : ' · ' + String(r.text || '').slice(0, 80)));
      if (AI.keys[p]) err = String(err).split(AI.keys[p]).join('***');
      return { p: p, ok: false, text: String(err).slice(0, 160) };
    });
  }

  /** v45: one call with an explicit system prompt (agents, D Builder, auto-reply preview). Never logs or returns the key. */
  function askLocal(sys, text, hist, opts) {
    var L = LocalAI(); if (!L) return Promise.resolve({ p: 'local', ok: false, text: 'brak modułu' });
    var msgs = [{ role: 'system', content: sys }].concat((hist || []).slice(-8)).concat([{ role: 'user', content: text }]);
    return L.chat(msgs, opts).then(function (r) { return { p: 'local', ok: r.ok, text: r.text }; });
  }
  function shortSys(lang) { // small on-device model: short, clear prompt works best
    return 'You are D Bot, a warm, friendly, helpful assistant in a DJ app made by Daniel Dydo. Answer any question directly, correctly and briefly (2-4 sentences). Always reply in ' + langName(lang) + '.' + (global.DBotOpts ? global.DBotOpts.addon() : '');
  }
  function askRaw(p, sys, text, opts) {
    opts = opts || {};
    try { if (global.DBotTeam && global.DBotTeam.persona && !opts.noPersona && !opts.json) sys = global.DBotTeam.persona.wrap(sys); } catch (_) {} // v48 Ziomal style (mock-swearing only)
    if (/^b:/.test(p) && global.DBotBrains) return global.DBotBrains.ask(p, sys, text, opts);
    if (p === 'local') return askLocal(sys, text, opts.history, { maxTokens: opts.maxTokens || (opts.json ? 160 : 260), temperature: opts.json ? 0.2 : 0.5 });
    if (!AI.keys[p]) return Promise.resolve({ p: p, ok: false, text: 'no key' });
    var model = opts.model || AI.models[p] || PROVIDERS[p].model, hist = opts.history || [], body;
    if (p === 'gemini') body = { systemInstruction: { parts: [{ text: sys }] }, contents: hist.map(function (m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }; }).concat([{ role: 'user', parts: [{ text: text }] }]) };
    else body = { model: model, messages: [{ role: 'system', content: sys }].concat(hist).concat([{ role: 'user', content: opts.images && opts.images.length ? [{ type: 'text', text: text }].concat(opts.images.map(function (u) { return { type: 'image_url', image_url: { url: u } }; })) : text }]) };
    if (p === 'gemini' && opts.images && opts.images.length) body.contents[body.contents.length - 1].parts = body.contents[body.contents.length - 1].parts.concat(opts.images.map(function (u) { var m = /^data:([^;]+);base64,(.*)$/.exec(u) || []; return { inline_data: { mime_type: m[1] || 'image/jpeg', data: m[2] || '' } }; }));
    if (opts.json && p !== 'gemini') body.response_format = { type: 'json_object' };
    if (opts.json && p === 'gemini') body.generationConfig = { responseMimeType: 'application/json' };
    return httpAi(p, AI.keys[p], model, body).then(function (r) {
      var j = null; try { j = JSON.parse(r.text); } catch (_) {}
      var out = '';
      if (j && p === 'gemini') { try { out = (j.candidates[0].content.parts || []).map(function (x) { return x.text || ''; }).join('').trim(); } catch (_) {} }
      else if (j) { try { out = String(j.choices[0].message.content || '').trim(); } catch (_) {} }
      if (r.status >= 200 && r.status < 300 && out) return { p: p, ok: true, text: out };
      var err = (j && j.error && (j.error.message || j.error.status || j.error)) || ('HTTP ' + r.status + (r.status ? '' : ' · ' + String(r.text || '').slice(0, 80)));
      if (AI.keys[p]) err = String(err).split(AI.keys[p]).join('***');
      return { p: p, ok: false, text: String(err).slice(0, 160) };
    });
  }

  // ------------------------------------------------------------------ chat plumbing
  function chat() { return global.D7Chat; }
  function remember(role, text) { var B = global.BotD; if (B && B.Memory && B.Memory.addChat) { try { B.Memory.addChat(role, text); } catch (_) {} } }
  function rtl(code) { return base(code) === 'ar'; }
  function botSay(text, lang, cls) {
    var C = chat(); if (!C) return;
    C.replyLang = lang || null;
    var d = C.add('bot', text);
    if (d && cls) d.className += ' ' + cls;
    if (d && rtl(lang)) d.setAttribute('dir', 'rtl');
    remember('bot', text);
    return d;
  }
  function userSay(text) { var C = chat(); if (!C) return; C.add('user', text); remember('user', text); }
  function tipsText(L) { return L.tipsT + '\n• ' + L.tips.join('\n• ') + '\n' + L.tipsCmd; }
  function midiText(L) { return L.midiT + '\n' + L.midi.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n'); }
  function codeText(L, kind) { var c = CODE[kind]; return L.codeT + ' · ' + kind + ' — ' + c[0] + '\n\n' + c[1]; }
  function offlineAnswer(intent, n, L) {
    if (intent === 'tips') return [tipsText(L)];
    if (intent === 'midi') return [midiText(L)];
    if (intent === 'code') { var k = codeKind(n); return k ? [codeText(L, k), 'd7s-code'] : [L.codeMenu]; }
    return null;
  }
  function intentOf(n) {
    if (RE.tips.test(n)) return 'tips';
    if (RE.code.test(n)) return 'code';
    if (RE.midi.test(n)) return 'midi';
    return null;
  }

  // ------------------------------------------------------------------ v46 offline small talk (no key, no model yet)
  function conversational(raw, n) {
    if (/^(pomoc|help|status|start|stop|menu|opcje|options|\?)$/.test(n)) return false;
    if (/^(czesc|hej|siema|elo|hi|hello|hey|witaj|dzien dobry|dobry wieczor)\W*$/.test(n)) return false; // D Bot greets itself
    return n.split(' ').length >= 3 || /\?\s*$/.test(raw) || /^(jak|co|kto|gdzie|kiedy|dlaczego|czemu|ile|czy|what|how|who|where|when|why|which|can|could|tell|opowiedz|wyjasnij|explain)\b/.test(n);
  }
  function offlineChat(raw, n, lang) {
    var pl = base(lang) === 'pl' || !/\b(the|what|how|who|why|you|please|tell me|can you)\b/i.test(String(raw || '')), now = new Date(), m;
    if (/(jak sie masz|co slychac|how are you|whats up)/.test(n)) return { text: pl ? 'Dzięki, świetnie! 💚 Decki gotowe, kosmos się kręci. A u Ciebie?' : 'Great, thanks! 💚 Decks are ready. How about you?' };
    if (/^(dzieki|dziekuje|thanks|thank you|thx)/.test(n)) return { text: pl ? 'Nie ma za co! 🙌' : 'You\'re welcome! 🙌' };
    if (/(ktora godzina|jaka godzina|what time)/.test(n)) return { text: (pl ? '🕒 Jest ' : '🕒 It is ') + now.toLocaleTimeString(pl ? 'pl-PL' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) + '.' };
    if (/(jaki dzis dzien|jaka jest data|what day|what date|dzisiejsza data)/.test(n)) return { text: '📅 ' + now.toLocaleDateString(pl ? 'pl-PL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
    if ((m = raw.replace(/,/g, '.').match(/(-?\d+(?:\.\d+)?)\s*([+\-*x×\/:])\s*(-?\d+(?:\.\d+)?)/))) {
      var a = +m[1], b = +m[3], op = m[2], v = op === '+' ? a + b : op === '-' ? a - b : /[*x×]/.test(op) ? a * b : b ? a / b : NaN;
      if (isFinite(v)) return { text: '🧮 ' + m[1] + ' ' + op + ' ' + m[3] + ' = ' + (Math.round(v * 1e6) / 1e6) };
    }
    try { if (global.DBotV52 && !/(dowcip|kawal|zart|joke)/.test(n)) { var r52 = global.DBotV52.fallback(raw, n, lang); if (r52 && r52.delegated) return r52; } } catch (_) {}
    if (/(dowcip|kawal|zart|joke)/.test(n)) return { text: pl ? '😄 Dlaczego DJ nie gra w chowanego? Bo zawsze go znajdą po BPM-ie!' : '😄 Why did the DJ break up with the metronome? Too much pressure to keep time!' };
    return { hint: true, text: pl ? '💬 Chętnie pogadam o wszystkim! Żeby odpowiadać na dowolne tematy, włącz 🧠 darmowy mózg AI (działa na telefonie, bez kluczy i opłat — jednorazowe pobranie ≈ 630 MB przez Wi-Fi) albo dodaj klucz Grok. Offline już teraz pomogę z deckami, MIDI/MC-707, kodem i D Builderem.'
      : '💬 Happy to talk about anything! To answer any topic, turn on the 🧠 free on-device AI brain (no keys, no fees — one-time ≈ 630 MB download over Wi-Fi) or add a Grok key. Offline I can already help with decks, MIDI/MC-707, code and D Builder.' };
  }
  function addBrainButtons(node, lang) {
    if (!node || !node.appendChild) return;
    var pl = base(lang) === 'pl', bar = document.createElement('div'); bar.className = 'dbot-brain-btns';
    var L = LocalAI(), st = L ? L.status() : null;
    if (L && st && st.ramOk && !st.installed) {
      var b1 = document.createElement('button'); b1.type = 'button'; b1.className = 'dbot-brain-dl'; b1.textContent = pl ? '🧠 Włącz darmowy mózg AI' : '🧠 Turn on free AI brain';
      b1.onclick = function () { if (global.DBotCenter) global.DBotCenter.open('dbot'); L.download(false); b1.disabled = true; b1.textContent = pl ? '⬇ Pobieram… (postęp w Center → Super D Bot)' : '⬇ Downloading…'; };
      bar.appendChild(b1);
    }
    var b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'dbot-brain-key'; b2.textContent = pl ? '🔑 Dodaj klucz Grok (opcjonalnie)' : '🔑 Add Grok key (optional)';
    b2.onclick = function () { openSettings(true); setTimeout(function () { var i = document.querySelector('#d7s-key-xai, [data-key="xai"], .d7s-sheet input[type="password"]'); if (i) i.focus(); }, 200); };
    bar.appendChild(b2);
    node.appendChild(bar);
  }

  /** Called by d7-chat.js send() before the page handler. Returns true when the super bot took the message. */
  function handle(text, meta) {
    var C = chat(); if (!C) return false;
    var raw = String(text || '').trim(), n = norm(raw);
    // 1. a pasted API key is NEVER echoed / stored in chat history
    var km = raw.match(RE.key);
    if (km) {
      var k = km[1], p = /^xai-/.test(k) ? 'xai' : /^AIza/.test(k) ? 'gemini' : 'openai';
      AI.keys[p] = k; AI.enabled[p] = true; if (!usable(AI.active)) AI.active = p; saveAi(); paintGear();
      C.add('user', '🔐 ' + PROVIDERS[p].label + ' key ' + mask(k));
      botSay(tr(curLang()).keySaved + ' (' + PROVIDERS[p].label + ' · ' + mask(k) + ')', curLang());
      return true;
    }
    if (RE.settings.test(n) || RE.settings.test(raw.toLowerCase())) { openSettings(true); return true; }
    var det = detect(raw), lang = det || curLang(), L = tr(lang), b = base(lang);
    var intent = intentOf(n);
    // with AI on, long free-form sentences go to the AI even if they contain a command word (play, next, find…)
    var isApp = RE.app.test(n) && !intent && (!aiOn() || n.split(' ').length <= 6);
    var gkHit = false;
    try { gkHit = !!(global.BotD && global.BotD.GK && global.BotD.GK.answer(n)); } catch (_) {}
    var askAll = RE.askAll.test(n);
    // 2. app commands + offline Google knowledge → D Bot (unchanged behaviour)
    if ((isApp || gkHit) && !askAll) return false;
    var mode = intent || (SB.mode !== 'auto' ? SB.mode : null);
    // 3. AI (user's own keys) for free-form questions and helper modes
    if (aiOn() && (askAll || !isApp)) {
      var q = askAll ? raw.replace(/^[^:]*:\s*/, '').replace(RE.askAll, '') : raw;
      var BRX = global.DBotBrains, BRp = BRX ? BRX.pick('chat') : null, BRm = BRX ? BRX.pickMany('chat') : null;
      var list = askAll || AI.route === 'all' ? usableList().concat(BRX ? BRX.cloudIds() : []) : (BRm || [BRp || (usable(AI.active) ? AI.active : usableList()[0])]);
      list = list.filter(function (x, i, a) { return x && a.indexOf(x) === i; }); if (!list.length) list = ['local'];
      userSay(raw);
      var typing = C.add('bot typing', '… ' + L.thinking + ' (' + list.map(function (p) { return plabel(p); }).join(' + ') + ')');
      Promise.all(list.map(function (p) { return askOne(p, q, lang, mode); })).then(function (rs) {
        C.remove(typing);
        var ok = rs.filter(function (r) { return r.ok; });
        if (ok.length) {
          pushConvo(q, ok[0].text);
          var out = ok.length === 1 ? '🤖 ' + plabel(ok[0].p) + ':\n' + ok[0].text
            : '🤖 ' + L.merged + ':\n\n' + ok.map(function (r) { return '◆ ' + plabel(r.p) + ':\n' + r.text; }).join('\n\n');
          var bad = rs.filter(function (r) { return !r.ok; });
          if (bad.length) out += '\n\n⚠ ' + bad.map(function (r) { return plabel(r.p) + ': ' + r.text; }).join(' · ');
          botSay(out, lang, 'd7s-ai');
        } else {
          var off = mode ? offlineAnswer(mode, n, L) : null;
          botSay('⚠ ' + L.aiErr + ' — ' + rs.map(function (r) { return plabel(r.p) + ': ' + r.text; }).join(' · ') + '\n\n' + (off ? off[0] : L.fb), lang, off && off[1]);
        }
      });
      return true;
    }
    // 3b. free on-device brain (default when no cloud key): open conversation on any topic, streamed into the bubble
    if (!aiOn() && localOn() && !isApp && !/^(pomoc|help|status|menu|opcje|options)$/.test(n) && !(intent && !/\?$/.test(raw) && n.split(' ').length <= 3)) {
      userSay(raw);
      var tl = C.add('bot typing', '… 🧠 ' + L.thinking + ' (darmowy mózg na telefonie)');
      askLocal(shortSys(lang), raw, convo, { maxTokens: 220, temperature: 0.5, onToken: function (t) { try { if (tl) tl.textContent = '🧠 ' + t + ' …'; } catch (_) {} } }).then(function (r) {
        C.remove(tl);
        if (r.ok) { pushConvo(raw, r.text); botSay('🧠 ' + r.text, lang, 'd7s-ai d7s-local'); }
        else { var o3 = intent ? offlineAnswer(intent, n, L) : null; botSay(o3 ? o3[0] : offlineChat(raw, n, lang).text, lang, o3 && o3[1]); }
      });
      return true;
    }
    // 4. offline helper modes (every language)
    var off2 = intent ? offlineAnswer(intent, n, L) : null;
    if (off2) { userSay(raw); botSay(off2[0], lang, off2[1]); return true; }
    // 4b. open conversation without any brain → friendly offline answer + one-tap upgrade buttons
    if (!isApp && !gkHit && conversational(raw, n)) {
      userSay(raw);
      var oc = offlineChat(raw, n, lang), d = botSay(oc.text, lang);
      if (oc.hint) addBrainButtons(d, lang);
      pushConvo(raw, oc.text);
      return true;
    }
    // 5. other languages: greeting / who / help / fallback (PL + EN keep D Bot's own replies)
    if (b !== 'pl' && b !== 'en' && det) {
      userSay(raw);
      if (RE.who.test(n) || RE.who.test(raw)) botSay(L.who, lang);
      else if (RE.help.test(n) || RE.help.test(raw)) botSay(L.help, lang);
      else if (RE.hello.test(n) || RE.hello.test(raw)) botSay(L.hi + '\n' + L.help, lang);
      else { if (brainOn()) return false; var dd = botSay(L.fb, lang); addBrainButtons(dd, lang); }
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ UI: settings sheet, helper chips, language picker
  function curLang() { var C = chat(); try { var u = C.ui(); return u.lang === 'auto' ? (u.autoLang || 'pl-PL') : u.lang; } catch (_) { return 'pl-PL'; } }
  function uiPl() { return base(curLang()) === 'pl'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var sheet = null;
  function paintGear() {
    var g = document.getElementById('d7s-gear'); if (!g) return;
    g.classList.toggle('on', aiOn());
    g.title = (uiPl() ? 'Super bot · ustawienia AI' : 'Super bot · AI settings') + (aiOn() ? ' · ' + usableList().map(function (p) { return PROVIDERS[p].label; }).join(', ') : ' · offline');
    var C = chat(); try { if (C && C.setSub && aiOn()) C.setSub('D Bot · super bot · AI: ' + (AI.route === 'all' ? usableList().map(function (p) { return PROVIDERS[p].label.split(' ')[1] || p; }).join('+') : PROVIDERS[usable(AI.active) ? AI.active : usableList()[0]].label)); } catch (_) {}
  }
  function renderSheet() {
    var pl = uiPl(), C = chat(), u = C.ui();
    var langOpts = '<option value="auto">AUTO</option>' + LANGS.map(function (l) { return '<option value="' + l[0] + '">' + l[1] + ' · ' + esc(l[2]) + '</option>'; }).join('');
    var prov = ORDER.map(function (p) {
      var P = PROVIDERS[p], has = !!AI.keys[p];
      return '<div class="d7s-prov' + (usable(p) ? ' on' : '') + '" data-p="' + p + '">' +
        '<div class="d7s-row"><label><input type="checkbox" class="d7s-en"' + (AI.enabled[p] ? ' checked' : '') + ' /> <b>' + P.label + '</b>' + (p === 'xai' ? ' · ' + (pl ? 'domyślny' : 'default') : '') + (p === 'openai' ? ' · ' + (pl ? 'opcjonalny, domyślnie wyłączony' : 'optional, off by default') : '') + '</label>' +
        '<span class="d7s-state' + (has ? ' ok' : '') + '">' + (has ? '🔐 ' + esc(mask(AI.keys[p])) : (pl ? 'brak klucza' : 'no key')) + '</span></div>' +
        '<div class="d7s-row"><input type="password" class="d7s-key" autocomplete="off" spellcheck="false" placeholder="' + (pl ? 'Twój klucz API ' : 'Your API key ') + P.keyHint + '" />' +
        '<input type="text" class="d7s-model" spellcheck="false" value="' + esc(AI.models[p]) + '" title="model" />' +
        (has ? '<button type="button" class="d7s-btn d7s-del">' + (pl ? 'Usuń' : 'Remove') + '</button>' : '') + '</div>' +
        '<div class="d7s-note">' + (pl ? 'Klucz: ' : 'Get a key: ') + P.console + '</div></div>';
    }).join('');
    sheet.innerHTML =
      '<h4>🌍 ' + (pl ? 'Język (rozpoznawanie mowy + odpowiedzi)' : 'Language (speech + replies)') + '</h4>' +
      '<div class="d7s-row"><select id="d7s-lang">' + langOpts + '</select><label><input type="checkbox" id="d7s-tts"' + (u.tts ? ' checked' : '') + ' /> 🔊 ' + (pl ? 'Auto-czytanie odpowiedzi' : 'Auto-speak replies') + '</label></div>' +
      '<div class="d7s-note">' + (pl ? '🎤 Mikrofon: przycisk 🎤 w czacie (Android: natywny SpeechRecognizer, przeglądarka: Web Speech API). AUTO wykrywa język z tego, co piszesz/mówisz.' : '🎤 Mic: the 🎤 button in the chat (Android: native SpeechRecognizer, browser: Web Speech API). AUTO detects the language from what you type/say.') + '</div>' +
      '<h4>🧭 ' + (pl ? 'Tryb pomocnika' : 'Helper mode') + '</h4>' +
      '<div class="d7s-row"><select id="d7s-mode"><option value="auto">AUTO</option><option value="dj">🎛 DJ</option><option value="midi">🎹 MIDI / MC-707</option><option value="code">🧩 ' + (pl ? 'Kod (app / bot / agent)' : 'Code (app / bot / agent)') + '</option></select></div>' +
      '<h4>🤖 ' + (pl ? 'AI — Twoje własne klucze (opcjonalnie)' : 'AI — your own keys (optional)') + '</h4>' +
      '<div class="d7s-row"><label><input type="checkbox" id="d7s-smart"' + (AI.smart ? ' checked' : '') + ' /> ' + (pl ? 'Tryb smart (pytaj AI, gdy jest klucz)' : 'Smart mode (ask AI when a key is set)') + '</label></div>' +
      '<div class="d7s-row"><select id="d7s-active">' + ORDER.map(function (p) { return '<option value="' + p + '">' + PROVIDERS[p].label + '</option>'; }).join('') + '</select>' +
      '<select id="d7s-route"><option value="one">' + (pl ? 'Pytaj wybrane AI' : 'Ask selected AI') + '</option><option value="all">' + (pl ? 'Pytaj wszystkie i połącz' : 'Ask all & merge') + '</option></select></div>' +
      prov +
      '<div class="d7s-note">🔒 ' + (pl ? 'Klucze zapisują się TYLKO w localStorage tego urządzenia — nie ma ich w APK, nie trafiają do historii czatu ani synchronizacji. Wysyłane są wyłącznie do wybranego dostawcy (api.x.ai / generativelanguage.googleapis.com / api.openai.com). Bez klucza działam offline (wbudowana wiedza). Nie synchronizuję się z botami, które nie mają API.' : 'Keys are stored ONLY in this device\'s localStorage — not in the APK, never in chat history or sync. They are sent only to the chosen provider (api.x.ai / generativelanguage.googleapis.com / api.openai.com). Without a key I work offline (built-in knowledge). I do not sync with bots that have no API.') + '</div>' +
      '<div class="d7s-row"><button type="button" class="d7s-btn primary" id="d7s-save">' + (pl ? 'Zapisz' : 'Save') + '</button><button type="button" class="d7s-btn" id="d7s-close">' + (pl ? 'Zamknij' : 'Close') + '</button></div>';
    sheet.querySelector('#d7s-lang').value = u.lang;
    sheet.querySelector('#d7s-mode').value = SB.mode;
    sheet.querySelector('#d7s-active').value = AI.active;
    sheet.querySelector('#d7s-route').value = AI.route;
    sheet.querySelector('#d7s-close').addEventListener('click', function () { openSettings(false); });
    sheet.querySelector('#d7s-save').addEventListener('click', saveSheet);
    Array.prototype.forEach.call(sheet.querySelectorAll('.d7s-del'), function (b) {
      b.addEventListener('click', function () { var p = b.closest('.d7s-prov').getAttribute('data-p'); delete AI.keys[p]; AI.enabled[p] = false; saveAi(); renderSheet(); paintGear(); });
    });
    Array.prototype.forEach.call(sheet.querySelectorAll('input,select'), function (i) { ['keydown', 'keyup', 'keypress'].forEach(function (t) { i.addEventListener(t, function (e) { e.stopPropagation(); }); }); });
  }
  function saveSheet() {
    var C = chat();
    Array.prototype.forEach.call(sheet.querySelectorAll('.d7s-prov'), function (box) {
      var p = box.getAttribute('data-p'), k = box.querySelector('.d7s-key').value.trim(), m = box.querySelector('.d7s-model').value.trim();
      if (k) AI.keys[p] = k;
      // a newly added xAI/Gemini key switches that provider on; OpenAI stays off unless its box is ticked
      AI.enabled[p] = !!AI.keys[p] && (box.querySelector('.d7s-en').checked || (!!k && p !== 'openai'));
      if (/^[A-Za-z0-9._-]{2,60}$/.test(m)) AI.models[p] = m;
    });
    AI.smart = sheet.querySelector('#d7s-smart').checked;
    AI.active = sheet.querySelector('#d7s-active').value; AI.route = sheet.querySelector('#d7s-route').value;
    SB.mode = sheet.querySelector('#d7s-mode').value; saveSb(); saveAi();
    try { C.setLang(sheet.querySelector('#d7s-lang').value); C.setTts(sheet.querySelector('#d7s-tts').checked); } catch (_) {}
    paintGear(); renderSheet();
    var pl = uiPl();
    C.add('sys', (pl ? '⚙ Zapisano. AI: ' : '⚙ Saved. AI: ') + (aiOn() ? usableList().map(function (p) { return PROVIDERS[p].label; }).join(', ') + (AI.route === 'all' ? (pl ? ' (wszystkie, łączę odpowiedzi)' : ' (all, merged)') : '') : (pl ? 'offline (brak klucza)' : 'offline (no key)')));
  }
  function openSettings(on) {
    var C = chat(); if (!C || !C.mounted) return;
    enhance();
    if (on) { C.open(false); renderSheet(); sheet.hidden = false; } else sheet.hidden = true;
  }
  function chipsFor(lang) {
    var b = base(lang);
    var w = { pl: ['porady dj', 'pomoc midi', 'kod agent'], en: ['dj tips', 'midi help', 'code agent'], de: ['dj tipps', 'midi hilfe', 'code agent'], es: ['consejos dj', 'ayuda midi', 'código agent'],
      fr: ['conseils dj', 'aide midi', 'code agent'], it: ['consigli dj', 'aiuto midi', 'codice agent'], pt: ['dicas dj', 'ajuda midi', 'código agent'], uk: ['поради dj', 'допомога midi', 'код agent'],
      ru: ['советы dj', 'помощь midi', 'код agent'], cs: ['dj tipy', 'midi pomoc', 'kód agent'], ja: ['DJ のコツ', 'midi ヘルプ', 'コード agent'], zh: ['DJ 技巧', 'midi 帮助', '代码 agent'],
      ar: ['نصائح dj', 'مساعدة midi', 'كود agent'], hi: ['dj सुझाव', 'midi मदद', 'कोड agent'] }[b] || ['dj tips', 'midi help', 'code agent'];
    return [[w[0], '🎛 ' + w[0]], [w[1], '🎹 MIDI / MC-707'], [w[2], '🧩 ' + w[2]]];
  }
  function paintChips() {
    var C = chat(), q = document.getElementById('d7c-quick'); if (!q) return;
    Array.prototype.forEach.call(q.querySelectorAll('.d7s-chip'), function (b) { b.remove(); });
    chipsFor(curLang()).forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'd7s-chip'; b.textContent = c[1]; b.setAttribute('data-say', c[0]);
      b.addEventListener('click', function () { C.send(c[0], { quick: true }); });
      q.insertBefore(b, q.children[i] || null);
    });
  }
  function enhance() {
    var C = chat(); if (!C || !C.mounted || !C.root) return;
    if (!document.getElementById('d7s-gear')) {
      var side = C.root.querySelector('#d7c-side');
      var g = document.createElement('button'); g.type = 'button'; g.className = 'd7c-ib d7s-gear'; g.id = 'd7s-gear'; g.textContent = '⚙'; g.setAttribute('aria-label', 'Super bot settings');
      g.addEventListener('click', function () { openSettings(!!(sheet && sheet.hidden)); });
      if (side && side.parentNode) side.parentNode.insertBefore(g, side);
      sheet = document.createElement('div'); sheet.className = 'd7s-panel'; sheet.id = 'd7s-panel'; sheet.hidden = true;
      C.panel.appendChild(sheet);
      var ls = C.root.querySelector('#d7c-lang'); if (ls) ls.addEventListener('change', function () { paintChips(); });
      paintChips(); paintGear();
    }
  }
  function hookMount() {
    var C = chat(); if (!C || C.__sbHooked) return;
    var orig = C.mount;
    C.mount = function (opts) { var r = orig.apply(this, arguments); try { enhance(); } catch (e) { console.warn('[D7Super]', e); } return r; };
    C.__sbHooked = true;
    if (C.mounted) enhance();
  }
  hookMount();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(hookMount, 0); setTimeout(enhance, 50); }); else setTimeout(enhance, 50);

  global.D7Super = {
    version: VERSION, name: 'D Bot · D77 Studio', langs: LANGS, detect: detect, handle: handle, providers: PROVIDERS,
    status: function () { return { ai: aiOn(), providers: usableList(), active: AI.active, route: AI.route, smart: AI.smart, mode: SB.mode, keysStored: ORDER.filter(function (p) { return !!AI.keys[p]; }).length }; },
    openSettings: openSettings, tr: tr, codeKinds: Object.keys(CODE), code: CODE, langName: langName, curLang: function () { return curLang(); },
    askRaw: askRaw, askLocal: askLocal, usableList: usableList, aiOn: aiOn, brainOn: brainOn, localOn: localOn, convo: function () { return convo.slice(); }, pushConvo: pushConvo, clearConvo: function () { convo = []; try { localStorage.removeItem(LS_CONVO); } catch (_) {} }, offlineChat: offlineChat, conversational: conversational, addBrainButtons: addBrainButtons, shortSys: shortSys, usable: usable, keyOf: function (p) { return AI.keys[p] || ''; }, modelOf: function (p) { return AI.models[p] || PROVIDERS[p].model; }, order: ORDER,
    _native: function (id, status, text) { var f = waiting[id]; if (f) { delete waiting[id]; f(status, text); } }
  };
})(window);
