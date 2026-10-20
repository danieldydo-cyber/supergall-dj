/*
 * D Bot · D77 Studio 48 — js/dbot-team.js
 * 🏠 Home = one BIG D BOT chat (UFO alien); decks, radio, studio, Center, team, video, options all one tap away from it.
 * 👥 Superbot team under D BOT (8 bots): 4 app builders (Android · iOS/Apple · Mac/Desktop · Web), 3 music bots (D Song · DJ/mix ·
 *    D Loop beats/loops/MPC), 1 video + loops bot (D Video). D Doctor stays the system agent.
 *    Offline (no AI key): builders give ready project templates in Kotlin/Java, Swift, Electron JS/TS, Python, C/C++, HTML;
 *    with a key / Model X they write full code. D Video records MilkDrop (or a generated canvas) + app audio to WebM.
 * 📚 Lessons engine: error log, repeated errors → auto-repair (watchdog heal) with the lesson recorded, update check from the
 *    live site's sync-manifest (notifies with a link; never installs by itself).
 * The pure parts (team list, code templates, public replies) also run on the public chat page (public-chat.html) — no owner data.
 */
(function (global) {
  'use strict';
  var VERSION = '48', APK_CODE = 48;
  var doc = global.document;
  function St() { return global.DBotState; }
  function sget(p, fb) { var s = St(); return s ? s.get(p, fb) : fb; }
  function sset(p, v) { var s = St(); return s ? s.set(p, v) : v; }
  function now() { return Date.now(); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function chat(t) { var C = global.D7Chat; if (C && C.add) return C.add('bot', t); return null; }

  // ================================================================== 👥 the team
  var TEAM = [
    { id: 'android', group: 'apps', icon: '📱', name: 'Android Builder', langs: 'Kotlin · Java · C/C++ (NDK)', say: 'aplikacja na Androida …' },
    { id: 'apple', group: 'apps', icon: '🍎', name: 'iOS / Apple Builder', langs: 'Swift · SwiftUI · Obj-C', say: 'aplikacja na iPhone …' },
    { id: 'desktop', group: 'apps', icon: '💻', name: 'Mac / Desktop Builder', langs: 'Electron JS/TS · Python · C/C++ · Swift', say: 'program na Maca …' },
    { id: 'appbuilder', group: 'apps', icon: '🌐', name: 'Web Builder', langs: 'HTML · CSS · JavaScript · TypeScript', say: 'zbuduj stronę …' },
    { id: 'song', group: 'music', icon: '🎵', name: 'D Song', langs: 'tekst · akordy · bębny · WAV', say: 'd song house o lecie' },
    { id: 'dj', group: 'music', icon: '🎧', name: 'DJ / Mix', langs: 'Auto Mix · sync · FX · party', say: 'auto mix' },
    { id: 'looper', group: 'music', icon: '🔁', name: 'D Loop · Beats / MPC', langs: 'pętle · 26 padów MPC · looper', say: 'd loop bębny' },
    { id: 'video', group: 'video', icon: '🎬', name: 'D Video + Loops', langs: 'klip WebM z wizualizacji · eksport pętli', say: 'nagraj wideo 10 s' }
  ];
  var GROUPS = { apps: '🧩 Aplikacje (4)', music: '🎶 Muzyka (3)', video: '🎬 Wideo + pętle (1)' };
  function teamText() {
    return '👥 Zespół D BOT — 8 botów pod D BOT (+ 🩺 D Doctor jako agent systemowy):\n' + Object.keys(GROUPS).map(function (g) {
      return GROUPS[g] + '\n' + TEAM.filter(function (b) { return b.group === g; }).map(function (b) { return '  ' + b.icon + ' ' + b.name + ' — ' + b.langs + ' · np. „' + b.say + '”'; }).join('\n');
    }).join('\n');
  }

  // ================================================================== code templates (offline, many languages)
  function slug(s) { return (norm(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 3).map(function (w, i) { return i ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join('') || 'dbotApp'); }
  function title(s) { var t = String(s || '').replace(/^(zbuduj|zrob|zrób|napisz|stworz|stwórz|make|build|create|write)\s+/i, '').replace(/(^|\s)(aplikacj[\wąćęłńóśźż]*|apk[aięąę]?|apke|apkę|app|program|na|for|android[\wąćęłńóśźż]*|iphone[\wąćęłńóśźż]*|ios|maca?|desktop|komputer[\wąćęłńóśźż]*|w|in|kotlin|swift|python|electron|c\+\+|java|typescript|html)(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim(); return (t || 'D Bot App').slice(0, 40); }
  var TPL = {
    kotlin: function (n, id) { return 'app/src/main/java/com/dbot/' + id.toLowerCase() + '/MainActivity.kt\n```kotlin\npackage com.dbot.' + id.toLowerCase() + '\n\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.foundation.layout.*\nimport androidx.compose.material3.*\nimport androidx.compose.runtime.*\nimport androidx.compose.ui.Alignment\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.unit.dp\n\nclass MainActivity : ComponentActivity() {\n    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n        setContent { MaterialTheme(colorScheme = darkColorScheme()) { App() } }\n    }\n}\n\n@Composable\nfun App() {\n    var taps by remember { mutableStateOf(0) }\n    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {\n        Text("' + n + '", style = MaterialTheme.typography.headlineMedium)\n        Spacer(Modifier.height(16.dp))\n        Button(onClick = { taps++ }) { Text("Tap: $taps") }\n    }\n}\n```\napp/build.gradle.kts (fragment)\n```kotlin\nandroid { namespace = "com.dbot.' + id.toLowerCase() + '"; compileSdk = 34; defaultConfig { minSdk = 24; targetSdk = 34 } ; buildFeatures { compose = true } }\ndependencies { implementation(platform("androidx.compose:compose-bom:2024.09.00")); implementation("androidx.activity:activity-compose:1.9.2"); implementation("androidx.compose.material3:material3") }\n```'; },
    java: function (n, id) { return 'MainActivity.java\n```java\npackage com.dbot.' + id.toLowerCase() + ';\n\nimport android.app.Activity;\nimport android.os.Bundle;\nimport android.widget.Button;\n\npublic class MainActivity extends Activity {\n  private int taps = 0;\n  @Override protected void onCreate(Bundle b) {\n    super.onCreate(b);\n    Button btn = new Button(this);\n    btn.setText("' + n + '");\n    btn.setOnClickListener(v -> btn.setText("' + n + ' · " + (++taps)));\n    setContentView(btn);\n  }\n}\n```'; },
    ndk: function (n) { return 'app/src/main/cpp/native-lib.cpp\n```cpp\n#include <jni.h>\n#include <string>\nextern "C" JNIEXPORT jstring JNICALL\nJava_com_dbot_app_MainActivity_hello(JNIEnv* env, jobject) {\n    std::string s = "' + n + ' from C++";\n    return env->NewStringUTF(s.c_str());\n}\n```'; },
    swift: function (n, id) { return id + 'App.swift\n```swift\nimport SwiftUI\n\n@main\nstruct ' + id.charAt(0).toUpperCase() + id.slice(1) + 'App: App {\n    var body: some Scene { WindowGroup { ContentView() } }\n}\n\nstruct ContentView: View {\n    @State private var taps = 0\n    var body: some View {\n        VStack(spacing: 16) {\n            Text("' + n + '").font(.largeTitle).bold()\n            Button("Tap: \\(taps)") { taps += 1 }.buttonStyle(.borderedProminent)\n        }\n        .padding()\n        .preferredColorScheme(.dark)\n    }\n}\n```\nXcode: File → New → Project → App (SwiftUI), wklej plik, ▶ Run. Mikrofon/MIDI: dodaj NSMicrophoneUsageDescription w Info.plist.'; },
    electron: function (n) { return 'package.json\n```json\n{ "name": "' + slug(n).toLowerCase() + '", "version": "1.0.0", "main": "main.js", "scripts": { "start": "electron ." }, "devDependencies": { "electron": "^33.0.0" } }\n```\nmain.js\n```javascript\nconst { app, BrowserWindow } = require(\'electron\');\napp.whenReady().then(() => {\n  const w = new BrowserWindow({ width: 900, height: 640, backgroundColor: \'#05060c\' });\n  w.loadFile(\'index.html\');\n});\napp.on(\'window-all-closed\', () => app.quit());\n```\nindex.html\n```html\n<!doctype html><html><body style="background:#05060c;color:#e8f;font:20px system-ui;display:grid;place-items:center;height:100vh"><button onclick="this.textContent=\'' + n + ' · \'+(++window.t||(window.t=1))">' + n + '</button></body></html>\n```\nStart: npm install && npm start'; },
    typescript: function (n) { return 'app.ts\n```typescript\nconst btn = document.createElement(\'button\');\nlet taps: number = 0;\nbtn.textContent = \'' + n + '\';\nbtn.onclick = (): void => { btn.textContent = `' + n + ' · ${++taps}`; };\ndocument.body.appendChild(btn);\n```\nBuild: npx tsc app.ts && otwórz index.html z <script src="app.js">'; },
    python: function (n) { return 'app.py\n```python\nimport tkinter as tk\n\nroot = tk.Tk()\nroot.title("' + n + '")\nroot.configure(bg="#05060c")\ntaps = tk.IntVar(value=0)\n\ndef tap():\n    taps.set(taps.get() + 1)\n    btn.config(text=f"' + n + ' · {taps.get()}")\n\nbtn = tk.Button(root, text="' + n + '", command=tap, font=("Helvetica", 20))\nbtn.pack(padx=40, pady=40)\nroot.mainloop()\n```\nStart: python3 app.py'; },
    cpp: function (n) { return 'main.cpp\n```cpp\n#include <iostream>\n#include <string>\n\nint main() {\n    std::cout << "' + n + '" << std::endl;\n    std::string line; int taps = 0;\n    while (std::getline(std::cin, line)) {\n        if (line == "q") break;\n        std::cout << "tap " << ++taps << std::endl;\n    }\n    return 0;\n}\n```\nBuild: g++ -std=c++17 -O2 main.cpp -o app && ./app'; },
    c: function (n) { return 'main.c\n```c\n#include <stdio.h>\nint main(void) {\n    printf("' + n + '\\n");\n    return 0;\n}\n```\nBuild: cc main.c -o app && ./app'; },
    html: function (n) { return 'index.html\n```html\n<!doctype html>\n<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + n + '</title>\n<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(#1b1240,#05060c);color:#e9e6ff;font:18px system-ui}button{font:700 22px system-ui;padding:16px 28px;border-radius:999px;border:0;background:linear-gradient(90deg,#00e5ff,#b84dff);color:#05060c}</style></head>\n<body><button id="b">' + n + '</button>\n<script>let t=0;b.onclick=()=>b.textContent=\'' + n + ' · \'+(++t);</script></body></html>\n```'; }
  };
  var LANGS = { android: ['kotlin', 'java', 'ndk'], apple: ['swift'], desktop: ['electron', 'python', 'cpp', 'typescript', 'c'], appbuilder: ['html', 'typescript'] };
  function pickLang(bot, text) {
    var n = norm(text), m = { kotlin: /kotlin|compose/, java: /\bjava\b/, ndk: /ndk|c\+\+|cpp/, swift: /swift|ios|iphone|ipad/, electron: /electron|javascript|\bjs\b/, python: /python|tkinter|pyqt/, cpp: /c\+\+|cpp|\bqt\b|sdl/, c: /\bw c\b|\bin c\b|\bc lang/, typescript: /typescript|\bts\b/, html: /html|strona|web/ };
    var opts = LANGS[bot] || ['html'];
    for (var i = 0; i < opts.length; i++) if (m[opts[i]] && m[opts[i]].test(n)) return opts[i];
    return opts[0];
  }
  function codegen(bot, text) {
    var n = title(text), id = slug(n), lang = pickLang(bot, text), t = TPL[lang](n, id);
    return { lang: lang, name: n, text: t };
  }
  function builderOffline(bot) {
    return function (text) {
      var A = global.DBotAgents; var a = A && A.list ? A.list().filter(function (x) { return x.id === bot; })[0] : null;
      var hasAi = A && a && A.providerFor && A.providerFor(a); if (hasAi) return null; // Model X / cloud brain writes the full app
      var g = codegen(bot, text), b = TEAM.filter(function (x) { return x.id === bot; })[0];
      return { done: true, text: b.icon + ' ' + b.name + ' (offline szablon · ' + g.lang + ') — „' + g.name + '”:\n\n' + g.text + '\n\n💡 Z kluczem AI albo Model X napiszę całą aplikację według opisu (' + b.langs + ').' };
    };
  }

  // ================================================================== 🎬 D Video + Loops
  var Video = { rec: null, busy: false, last: null };
  function vizCanvas() { var c = doc.querySelector('#sx-viz canvas, canvas#sx-viz, #sx-viz'); return c && c.tagName === 'CANVAS' && c.width > 0 ? c : null; }
  function genCanvas(w, h) {
    var c = doc.createElement('canvas'); c.width = w || 640; c.height = h || 360; var g = c.getContext('2d'), t0 = performance.now();
    var X = global.SpecialX, an = null; try { an = X && X.state && X.state.analyser; } catch (_) {}
    var buf = an ? new Uint8Array(an.frequencyBinCount) : null, raf = 0;
    function draw() {
      var t = (performance.now() - t0) / 1000, bpm = (global.DBotStudio && global.DBotStudio.clock.bpm) || 120, beat = (t * bpm / 60) % 1;
      g.fillStyle = 'rgba(5,6,12,.35)'; g.fillRect(0, 0, c.width, c.height);
      if (an && buf) an.getByteFrequencyData(buf);
      for (var i = 0; i < 48; i++) { var v = buf ? buf[i * 4] / 255 : 0.5 + 0.5 * Math.sin(t * 3 + i * 0.4), a = i / 48 * Math.PI * 2 + t * 0.4, r = 60 + v * 120 * (1.2 - beat * 0.4);
        g.strokeStyle = 'hsl(' + ((i * 7 + t * 40) % 360) + ',90%,60%)'; g.lineWidth = 4; g.beginPath(); g.moveTo(c.width / 2 + Math.cos(a) * 40, c.height / 2 + Math.sin(a) * 40); g.lineTo(c.width / 2 + Math.cos(a) * r, c.height / 2 + Math.sin(a) * r); g.stroke(); }
      g.fillStyle = '#b8ff3c'; g.font = '700 18px system-ui'; g.fillText('D BOT · ' + Math.round(bpm) + ' BPM', 16, c.height - 18);
      raf = requestAnimationFrame(draw);
    }
    draw(); c.__stop = function () { cancelAnimationFrame(raf); }; return c;
  }
  Video.supported = function () { return !!(global.MediaRecorder && global.HTMLCanvasElement && HTMLCanvasElement.prototype.captureStream); };
  /** record `sec` seconds of the visualizer (or a generated beat-reactive canvas) + the app's master audio → WebM blob */
  Video.record = function (sec, opts) {
    opts = opts || {}; sec = Math.max(2, Math.min(60, +sec || 10));
    if (!Video.supported()) return Promise.reject(new Error('to urządzenie nie nagrywa wideo (brak MediaRecorder / captureStream)'));
    if (Video.busy) return Promise.reject(new Error('już nagrywam'));
    Video.busy = true;
    var src = opts.generated ? null : vizCanvas(), own = null;
    if (!src) { own = genCanvas(); src = own; }
    var stream = src.captureStream(30), X = global.SpecialX, S = X && X.state, audio = false;
    try { var ctx = S && S.ctx, master = S && S.master; if (ctx && master) { var dest = ctx.createMediaStreamDestination(); master.connect(dest); dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); }); audio = true; Video._dest = { master: master, dest: dest }; } } catch (_) {}
    var type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0] || '';
    var rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 2500000 } : undefined), chunks = [];
    Video.rec = rec;
    return new Promise(function (res, rej) {
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = function (e) { Video.busy = false; rej(e.error || new Error('błąd nagrywania')); };
      rec.onstop = function () {
        Video.busy = false; if (own && own.__stop) own.__stop();
        try { if (Video._dest) Video._dest.master.disconnect(Video._dest.dest); } catch (_) {} Video._dest = null;
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
        var blob = new Blob(chunks, { type: 'video/webm' });
        Video.last = { blob: blob, sec: sec, source: own ? 'generated' : 'milkdrop', audio: audio, at: new Date().toISOString(), size: blob.size };
        res(Video.last);
      };
      rec.start(500); setTimeout(function () { try { rec.stop(); } catch (_) {} }, sec * 1000);
    });
  };
  Video.save = function (v) {
    v = v || Video.last; if (!v) return Promise.resolve('brak nagrania');
    var name = 'D-Bot-klip-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.webm';
    var D = global.D77Desktop; if (D && D.saveFile) return v.blob.arrayBuffer().then(function (ab) { return D.saveFile(name, ab); }).then(function (r) { return r && r.ok ? '💾 zapisane: ' + r.path : 'anulowane'; });
    var S = global.DBotStudio; if (S && S.share && global.D7Bot) return S.share(name, v.blob, 'D Bot · klip wideo').then(function () { return '📤 udostępniono „' + name + '”'; });
    var a = doc.createElement('a'); a.href = URL.createObjectURL(v.blob); a.download = name; doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000);
    return Promise.resolve('⬇ pobieranie „' + name + '”');
  };
  function videoOffline(text) {
    var n = norm(text), m = n.match(/(\d{1,2})\s*(s|sek|sekund|sec)/), sec = m ? +m[1] : 10;
    if (/\b(petl|loop)\w*\b.*\b(eksport|export|zapisz)|\b(eksport|export|zapisz)\w*\b.*\b(petl|loop)/.test(n)) {
      var L = global.DBotStudio && global.DBotStudio.looper; if (L && L.export) { Promise.resolve().then(function () { return L.export(); }).then(function (r) { chat('🔁 Eksport pętli: ' + (typeof r === 'string' ? r : 'gotowe (WAV)')); }, function (e) { chat('⚠ ' + (e && e.message || e)); }); return { done: true, text: '🔁 Eksportuję miks loopera do WAV…' }; }
      return { done: true, text: '🔁 Eksport pętli działa w D77 Studio → Looper → ⇪ Eksport.' };
    }
    if (!/(nagraj|record|zrob|make|klip|clip|wideo|video|teledysk)/.test(n)) return null;
    if (!Video.supported()) return { done: true, text: '🎬 To urządzenie nie nagrywa wideo (brak MediaRecorder).' };
    Video.record(sec, { generated: /generowan|canvas|wlasn/.test(n) }).then(function (v) {
      var node = chat('🎬 Klip gotowy: ' + v.sec + ' s · ' + (v.source === 'milkdrop' ? 'MilkDrop' : 'generowana wizualizacja (beat)') + (v.audio ? ' + dźwięk aplikacji' : ' (bez dźwięku)') + ' · ' + Math.round(v.size / 1024) + ' KB WebM');
      if (node && node.appendChild) { var b = doc.createElement('div'); b.className = 'dbot-brain-btns dbs-chat-btns'; var s = doc.createElement('button'); s.type = 'button'; s.textContent = '💾 Zapisz / udostępnij'; s.onclick = function () { Video.save(v).then(chat); }; b.appendChild(s); node.appendChild(b); }
    }, function (e) { chat('⚠ D Video: ' + e.message); });
    return { done: true, text: '🎬 Nagrywam ' + sec + ' s wizualizacji + dźwięk… (klip WebM pojawi się tu)' };
  }


  // ================================================================== 😎 Ziomal style (default ON, toggle in Opcje) — mock-swearing only
  var EXCL = ['Kurde balans!', 'Ja cię kręcę!', 'O w mordę jeża!', 'Motyla noga!', 'Kurczę pieczone!', 'Jasny gwint!', 'Ożeż ty w kosmos!', 'Do licha z kapustą!', 'Rany julek!', 'Cholibka!', 'Ki diabeł z basem!', 'O żesz ty, subwoofer!', 'Jupi-ja-jej z pętlą!', 'A niech mnie UFO porwie!', 'Bęben mi w uchu!'];
  // three levels (owner's private app chats): 'grzeczny' · 'ziomal' (w przenośni, default) · 'bezcenzury' (real casual profanity —
  // only when the owner also confirms the adults-only switch). Anything other people see (public web D, Telegram/WhatsApp/Messenger,
  // phone auto-reply) is capped at 'ziomal'. Never slurs, never hateful, never insulting the person.
  var LEVELS = { grzeczny: '🙂 Grzeczny', ziomal: '😎 Ziomal (w przenośni)', bezcenzury: '🔞 Bez cenzury (18+)' };
  var Persona = {
    levels: LEVELS,
    level: function (forOthers) {
      var l = sget('persona.level', null); if (!l) l = sget('persona.ziomal', true) === false ? 'grzeczny' : 'ziomal';
      if (!LEVELS[l]) l = 'ziomal';
      if (l === 'bezcenzury' && (forOthers || sget('persona.adult', false) !== true)) l = 'ziomal';
      return l;
    },
    on: function () { return Persona.level() !== 'grzeczny'; },
    set: function (v) { var l = v === true ? 'ziomal' : v === false ? 'grzeczny' : String(v); if (!LEVELS[l]) l = 'ziomal'; sset('persona.level', l); return l; },
    adult: function (v) { if (v != null) sset('persona.adult', !!v); return sget('persona.adult', false) === true; },
    excl: function () { return EXCL[Math.floor(Math.random() * EXCL.length)]; },
    SAFE: ' NEVER use slurs or hateful language, never insult or demean the user or any person or group. Keep facts, code and instructions exact and complete; style only in the wording around them.',
    prompts: {
      grzeczny: '',
      ziomal: 'STYLE „Ziomal (w przenośni)”: you are D, a cheeky, casual, warm friend (Polish „ziomal”). Use playful, figurative MOCK-swearing only — creative euphemisms like „kurde balans”, „ja cię kręcę”, „o w mordę jeża”, „motyla noga”, „jasny gwint” or funny invented exclamations. No real swear words.',
      bezcenzury: 'STYLE „Bez cenzury” (adult owner opted in, private chat): you are D, a very casual friend; real casual profanity is allowed when it fits naturally (like friends talking), never aimed at the user or anyone.'
    },
    wrap: function (sys, forOthers) { var l = Persona.level(forOthers); return l === 'grzeczny' ? sys : String(sys || '') + '\n\n' + Persona.prompts[l] + Persona.SAFE; },
    flavor: function (t, forOthers) {
      t = String(t || ''); if (Persona.level(forOthers) === 'grzeczny' && !forOthers) return t;
      if (forOthers === 'plain') return t;
      if (/```|^\s*[⚠✖🔒]/.test(t) || t.length > 900 || Math.random() > 0.45) return t;
      return Persona.excl() + ' ' + t;   // offline flavour is always the mock-swearing list (safe everywhere)
    }
  };

  // ================================================================== 🏠 home: BIG D BOT chat first
  var Home = {
    on: function () { return sget('ui.home', 'chat') === 'chat'; },
    set: function (on) { sset('ui.home', on ? 'chat' : 'classic'); if (on) Home.open(); return on; },
    LINKS: [['decks', '🎧 Decki'], ['radio', '📻 Radio · tryby'], ['studio', '🎛 Studio'], ['center', '◎ Center'], ['team', '👥 Zespół'], ['video', '🎬 Wideo'], ['opts', '⚙ Opcje'], ['lessons', '📚 Lekcje'], ['learn', '📎 Naucz']],
    go: function (k) {
      var C = global.D7Chat;
      if (k === 'decks') { if (C && C.close) C.close(); return; }
      if (k === 'studio') { if (C && C.close) C.close(); if (global.DBotStudio) global.DBotStudio.ui.open(); return; }
      if (k === 'center' || k === 'opts') { if (global.DBotCenter) { global.DBotCenter.open(); if (k === 'opts') global.DBotCenter.show('opts'); } return; }
      if (k === 'radio') { if (global.DBotGenre) global.DBotGenre.open(); return; }
      if (k === 'team') { chat(teamText()); return; }
      if (k === 'video') { var r = videoOffline('nagraj wideo 10 s'); chat(r.text); return; }
      if (k === 'lessons') { chat(Lessons.text()); return; }
      if (k === 'learn') { Learn.pick(); return; }
    },
    bar: function () {
      var C = global.D7Chat, root = C && C.root; if (!root) return false;
      var panel = root.querySelector('.d7c-panel') || root, log = root.querySelector('#d7c-log'); if (!log) return false;
      if (root.querySelector('.dbot-home')) return true;
      var b = doc.createElement('nav'); b.className = 'dbot-home'; b.setAttribute('aria-label', 'D BOT — wszystko z czatu');
      b.innerHTML = Home.LINKS.map(function (l) { return '<button type="button" data-go="' + l[0] + '">' + l[1] + '</button>'; }).join('');
      Array.prototype.forEach.call(b.querySelectorAll('[data-go]'), function (x) { x.onclick = function () { Home.go(x.dataset.go); }; });
      log.parentNode.insertBefore(b, log);
      return true;
    },
    open: function () {
      var C = global.D7Chat; if (!C || !C.root) return false;
      Home.bar(); sset('ui.chatSize', 'max');
      if (!C.isOpen || !C.isOpen()) C.open();
      C.root.setAttribute('data-size', 'max'); doc.documentElement.classList.add('dbot-home-on');
      return true;
    }
  };

  // ================================================================== 📚 lessons engine
  var Lessons = {
    errs: function () { return sget('lessons.errors', []); },
    list: function () { return sget('lessons.list', []); },
    add: function (mod, msg) {
      var l = Lessons.errs(), key = mod + '|' + String(msg).slice(0, 80), e = l.filter(function (x) { return x.key === key; })[0];
      if (!e) { e = { key: key, mod: mod, msg: String(msg).slice(0, 160), n: 0, first: new Date().toISOString(), times: [] }; l.push(e); }
      e.n++; e.last = new Date().toISOString(); e.times = (e.times || []).concat(now()).slice(-10);
      if (l.length > 120) l = l.slice(-120);
      sset('lessons.errors', l);
      var recent = e.times.filter(function (t) { return now() - t < 10 * 60000; }).length;
      if (recent >= 3 && (!e.healedAt || now() - e.healedAt > 10 * 60000)) Lessons.repair(e);
      return e;
    },
    /** repeated error → heal the module, remember what was done (lesson) */
    repair: function (e) {
      var W = global.DBotWatchdog, M = global.DBotModules, r = 'brak modułu';
      try { if (W && W.heal && M && M.list[e.mod]) r = W.heal(e.mod, 'lekcja: powtarzający się błąd') || 'naprawa uruchomiona'; } catch (x) { r = '✖ ' + x.message; }
      e.healedAt = now(); var l = Lessons.errs(); l.forEach(function (x) { if (x.key === e.key) x.healedAt = e.healedAt; }); sset('lessons.errors', l);
      var ls = Lessons.list(); ls.push({ at: new Date().toISOString(), mod: e.mod, problem: e.msg, action: 'auto-naprawa ' + e.mod, result: String(r).slice(0, 120) }); sset('lessons.list', ls.slice(-60));
      try { global.DBotRepairs.add(e.mod, 'lekcja: ' + e.msg.slice(0, 60) + ' → ' + r); } catch (_) {}
      return r;
    },
    text: function () {
      var e = Lessons.errs().slice(-6).reverse(), l = Lessons.list().slice(-4).reverse(), u = sget('update.last', null);
      return '📚 Lekcje D BOT — log błędów ' + Lessons.errs().length + ', lekcji ' + Lessons.list().length + '.\n' +
        (e.length ? e.map(function (x) { return '• ' + x.mod + ': ' + x.msg + ' ×' + x.n + (x.healedAt ? ' ✓ naprawiane' : ''); }).join('\n') : '• brak błędów ✓') +
        (l.length ? '\nOstatnie lekcje: ' + l.map(function (x) { return x.mod + ' → ' + x.result; }).join(' · ') : '') +
        '\n🔄 Aktualizacje: ' + (u ? (u.newer ? 'nowsza wersja ' + u.remote + ' → ' + u.url : 'masz najnowszą (' + VERSION + ') · sprawdzone ' + u.at.slice(11, 16)) : 'jeszcze nie sprawdzano');
    }
  };
  function modOf(file, stack) { try { return global.DBotWatchdog && global.DBotWatchdog.modOf ? global.DBotWatchdog.modOf(file, stack) : 'app'; } catch (_) { return 'app'; } }
  if (global.addEventListener) {
    global.addEventListener('error', function (e) { if (!e || !e.message) return; Lessons.add(modOf(e.filename, e.error && e.error.stack) || 'app', e.message); });
    global.addEventListener('unhandledrejection', function (e) { var r = e && e.reason; Lessons.add(modOf('', r && r.stack) || 'app', 'odrzucona obietnica: ' + (r && r.message || r)); });
  }

  // ================================================================== 🔄 update check (live site sync-manifest → link, never auto-install)
  var Update = {
    base: function () { var c = global.D7_APK_CONFIG || global.D7Config || {}; return c.liveUrl || sget('live.base', '') || ''; },
    check: function (force) {
      var last = sget('update.last', null); if (!force && last && now() - Date.parse(last.at) < 6 * 3600000) return Promise.resolve(last);
      var base = Update.base(); if (!base) return Promise.resolve(null);
      var url = base.replace(/\/$/, '') + '/sync-manifest.json';
      var get = fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      return Promise.resolve(get).then(function (m) {
        var a = (m && (m.apk || m.app)) || {}, code = +(a.versionCode || m.apkVersionCode || 0), name = a.versionName || m.apkVersion || '';
        var r = { at: new Date().toISOString(), remote: code || name || '?', newer: code > APK_CODE, url: a.url || (base.replace(/\/$/, '') + '/downloads/' + (a.file || 'D77-Studio-48.apk')) };
        sset('update.last', r);
        if (r.newer) chat('🔄 Jest nowsza wersja D Bot (' + (name || code) + '). Pobierz: ' + r.url + ' — instalujesz Ty (D BOT nic nie instaluje sam).');
        return r;
      }).catch(function (e) { var r = { at: new Date().toISOString(), err: String(e && e.message || e).slice(0, 80), newer: false, remote: '?' }; sset('update.last', r); return r; });
    }
  };

  // ================================================================== public replies (also used by public-chat.html — no owner data)
  var PRIV = /([\w.+-]+@[\w-]+\.[\w.]+)|(\+?\d[\d\s-]{7,}\d)|(xai-|sk-|AIza|gsk_)[\w-]{8,}/g;
  function privacy(s) { return String(s || '').replace(PRIV, '[ukryte]'); }
  function publicReply(text) {
    var n = norm(text);
    if (!n) return 'Napisz coś 🙂';
    if (/^(hej|hejka|czesc|siema|hello|hi|hey|dzien dobry|elo)\b/.test(n)) return '👽 Hej! Jestem X BOT („Multi-talent X”) z zespołem 8 botów. Zapytaj o DJ-owanie, piosenki, pętle, aplikacje albo napisz „zespół”.';
    if (/\b(zespol|team|boty|kto ty|kim jestes|who are you|co umiesz|what can you do|pomoc|help)\b/.test(n)) return teamText().replace('(+ 🩺 D Doctor jako agent systemowy)', '') + '\n\n(To publiczna wersja czatu — offline, bez danych właściciela, z limitem wiadomości.)';
    var bots = { android: /android|kotlin|apk/, apple: /iphone|ios|swift|ipad/, desktop: /\bmac\b|desktop|electron|python|c\+\+|windows|linux/, appbuilder: /html|strona|website|web app|typescript/ };
    var isBuild = /(zbuduj|zrob|napisz|stworz|build|make|create|write|kod|code|aplikacj|app)\b/.test(n);
    for (var k in bots) if (isBuild && bots[k].test(n)) { var g = codegen(k, text), b = TEAM.filter(function (x) { return x.id === k; })[0]; return b.icon + ' ' + b.name + ' · szablon ' + g.lang + ' — „' + g.name + '”:\n\n' + g.text; }
    if (/\b(bpm|tempo|mix|miks|przejsci|transition|dj)\b/.test(n)) return '🎧 DJ / Mix: miksuj na granicach fraz (16/32 beaty), zrób bass swap na takcie w połowie przejścia, trzymaj tempo w zakresie (np. 79–127 BPM — 174 gra jak 87 half-time), a utwory dalej niż ±8 % od siebie łącz echo-outem zamiast beatmatchingu.';
    if (/\b(piosenk|song|tekst|lyrics|refren)\b/.test(n)) { var t = (n.match(/\bo\s+([a-z ]{3,30})/) || [])[1] || 'nocnym mieście'; return '🎵 D Song (szkic):\n[Zwrotka]\nŚwiatła nad ' + t + ' biją w rytm,\nbas pod stopami, nie liczę już chwil.\n[Refren]\nTańcz, aż wstanie dzień — D BOT gra dla nas,\njeden beat, jedno serce, ten sam czas.\n(Pełny utwór z akordami i bębnami do WAV robi aplikacja D Bot.)'; }
    if (/\b(petl|loop|beat|bit|mpc|pad)\w*/.test(n)) return '🔁 D Loop: pętla bębnów 16 kroków — kick x...x...x...x... · clap ....x.......x... · hat ..x...x...x...x.. W aplikacji: 26 padów MPC, looper 4 ścieżki, auto-pętle w tempie mastera.';
    if (/\b(wideo|video|klip|teledysk)\b/.test(n)) return '🎬 D Video nagrywa w aplikacji krótkie klipy WebM z wizualizacji MilkDrop (albo generowanej grafiki w rytm) razem z dźwiękiem i eksportuje pętle.';
    if (/\b(daniel|wlasciciel|owner|telefon|email|adres|haslo|password|klucz|key|pin)\b/.test(n)) return '🔒 W publicznym czacie nie podaję danych właściciela ani żadnych kluczy.';
    return '👽 D BOT (publiczny, offline): mogę pomóc z DJ-owaniem, tekstem piosenki, pętlami, wideo albo szablonem aplikacji (Android / iOS / Mac / Web). Napisz np. „zbuduj aplikację na Androida licznik”.';
  }


  // ================================================================== 🧠 learning (on-device notes)
  // D BOT learns from: conversations („zapamiętaj …”, 👍/👎 already feed agents + Auto Mix), and content YOU share:
  // images (colours/size; description by a vision-capable brain if you have a key), music (BPM + key analysis),
  // videos (frame snapshots → colours; description by a vision brain). Notes stay on this device (DBotState).
  // Web search only through brains that support it (Researcher agent with your key). No scraping into the app.
  var Learn = {
    notes: function () { return sget('learn.notes', []); },
    add: function (kind, title, text, extra) {
      var l = Learn.notes(); var n = Object.assign({ id: 'n' + Date.now().toString(36), at: new Date().toISOString(), kind: kind, title: String(title).slice(0, 80), text: String(text).slice(0, 1200) }, extra || {});
      l.push(n); if (l.length > 300) l = l.slice(-300); sset('learn.notes', l); return n;
    },
    find: function (q) { var n = norm(q); return Learn.notes().filter(function (x) { return norm(x.title + ' ' + x.text).indexOf(n) >= 0; }).slice(-5); },
    text: function () { var l = Learn.notes(); return '🧠 Notatki D BOT na tym urządzeniu: ' + l.length + (l.length ? '\n' + l.slice(-6).reverse().map(function (x) { return '• ' + ({ image: '🖼', audio: '🎵', video: '🎬', chat: '💬', web: '🔎' }[x.kind] || '•') + ' ' + x.title + ' — ' + x.text.slice(0, 90); }).join('\n') : ' (pokaż mi zdjęcie, muzykę albo wideo: 📎 Naucz)'); }
  };
  function colors(ctx, w, h) {
    var d = ctx.getImageData(0, 0, w, h).data, bins = {}, i;
    for (i = 0; i < d.length; i += 4) { var k = (d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5); bins[k] = (bins[k] || 0) + 1; }
    return Object.keys(bins).sort(function (a, b) { return bins[b] - bins[a]; }).slice(0, 4).map(function (k) { var c = k.split(',').map(function (v) { return Math.min(255, (+v << 5) + 16); }); return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); });
  }
  function snapCanvas(src, w, h) { var c = doc.createElement('canvas'), s = Math.min(1, 512 / Math.max(w, h)); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s)); var g = c.getContext('2d'); g.drawImage(src, 0, 0, c.width, c.height); return { c: c, g: g }; }
  function visionAsk(dataUrls, what) {
    var S = global.D7Super; if (!S || !S.askRaw || !S.usableList) return Promise.resolve(null);
    var ps = S.usableList().filter(function (p) { return /^(xai|openai|gemini)$/.test(p); }); if (!ps.length) return Promise.resolve(null);
    return S.askRaw(ps[0], 'You are D BOT. Describe what you see for a music/DJ/visuals assistant in 2–3 short sentences in Polish: subject, mood, colours, and how it could inspire a track, a mix or visuals. Do not identify real people.', what, { images: dataUrls, maxTokens: 220 })
      .then(function (r) { return r && r.ok ? r.text : null; }, function () { return null; });
  }
  var KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  /** rough key estimate: Goertzel chroma over a few windows + Krumhansl profiles */
  function keyOf(buf) {
    var sr = buf.sampleRate, ch = buf.getChannelData(0), N = 4096, chroma = new Float64Array(12), wins = 24, step = Math.max(N, Math.floor((ch.length - N) / wins));
    for (var s0 = Math.floor(ch.length * 0.1); s0 + N < ch.length && wins-- > 0; s0 += step) {
      for (var midi = 40; midi < 88; midi++) {
        var f = 440 * Math.pow(2, (midi - 69) / 12), w = 2 * Math.PI * f / sr, cw = 2 * Math.cos(w), q1 = 0, q2 = 0;
        for (var j = 0; j < N; j++) { var q0 = cw * q1 - q2 + ch[s0 + j]; q2 = q1; q1 = q0; }
        chroma[midi % 12] += Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - cw * q1 * q2));
      }
    }
    function corr(a, b) { var ma = 0, mb = 0, i; for (i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; } ma /= 12; mb /= 12; var n = 0, da = 0, db = 0; for (i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) * (a[i] - ma); db += (b[i] - mb) * (b[i] - mb); } return n / Math.sqrt(da * db || 1); }
    var best = { r: -2 };
    for (var k = 0; k < 12; k++) { var rot = []; for (var i = 0; i < 12; i++) rot.push(chroma[(i + k) % 12]); var a = corr(rot, MAJ), b = corr(rot, MIN); if (a > best.r) best = { r: a, key: KEYS[k] + ' dur (major)' }; if (b > best.r) best = { r: b, key: KEYS[k] + ' moll (minor)' }; }
    return best;
  }
  Learn.file = function (file) {
    var type = String(file && file.type || ''), name = String(file && file.name || 'plik').slice(0, 60);
    if (/^image\//.test(type)) return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { var s = snapCanvas(img, img.naturalWidth, img.naturalHeight), cols = colors(s.g, s.c.width, s.c.height), du = s.c.toDataURL('image/jpeg', 0.8); URL.revokeObjectURL(url);
        visionAsk([du], 'Co jest na tym obrazie? (' + name + ')').then(function (v) { res(Learn.add('image', name, (v ? v + ' · ' : '') + 'kolory ' + cols.join(' ') + ' · ' + img.naturalWidth + '×' + img.naturalHeight, { colors: cols, vision: !!v })); }); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('nie mogę odczytać obrazu')); }; img.src = url;
    });
    if (/^audio\//.test(type)) {
      var S = global.DBotStudio, ctx = S && S.ctx && S.ctx(); if (!ctx) return Promise.reject(new Error('audio niedostępne'));
      return file.arrayBuffer().then(function (ab) { return ctx.decodeAudioData(ab); }).then(function (buf) {
        var bpm = null; try { var d = S.detect.buffer(buf); bpm = d && (d.bpm || d); } catch (_) {}
        var R = S.range, k = keyOf(buf), b = typeof bpm === 'number' ? Math.round(bpm * 10) / 10 : null;
        return Learn.add('audio', name, (b ? 'BPM ' + b + (R ? ' (w zakresie: ' + R.fold(b) + ')' : '') : 'BPM ?') + ' · tonacja ~' + k.key + ' (pewność ' + Math.round(Math.max(0, k.r) * 100) + '%) · ' + Math.round(buf.duration) + ' s', { bpm: b, key: k.key });
      });
    }
    if (/^video\//.test(type)) return new Promise(function (res, rej) {
      var v = doc.createElement('video'), url = URL.createObjectURL(file), shots = [], cols = [], at = [0.15, 0.5, 0.85], i = 0;
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      var DU = function () { return isFinite(v.duration) && v.duration > 0 ? v.duration : 1.5; }; // MediaRecorder WebM often has no duration
      v.onloadedmetadata = function () { v.currentTime = Math.max(0.1, DU() * at[0]); };
      v.onseeked = function () {
        var s = snapCanvas(v, v.videoWidth || 320, v.videoHeight || 180); cols = cols.concat(colors(s.g, s.c.width, s.c.height).slice(0, 2)); if (i === 1) shots.push(s.c.toDataURL('image/jpeg', 0.75));
        if (++i < at.length) { v.currentTime = Math.max(0.1, DU() * at[i]); return; }
        var dur = Math.round(DU()); URL.revokeObjectURL(url);
        visionAsk(shots, 'Klatka z wideo „' + name + '”. Co widać?').then(function (d) { res(Learn.add('video', name, (d ? d + ' · ' : '') + dur + ' s · kolory klatek ' + cols.join(' '), { colors: cols, vision: !!d })); });
      };
      v.onerror = function () { URL.revokeObjectURL(url); rej(new Error('nie mogę odczytać wideo')); }; v.src = url;
    });
    return Promise.reject(new Error('obsługuję obrazy, muzykę i wideo'));
  };
  Learn.pick = function () {
    var inp = doc.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,audio/*,video/*'; inp.multiple = true;
    inp.onchange = function () { Array.prototype.forEach.call(inp.files || [], function (f) { chat('📎 Uczę się z „' + f.name + '”…'); Learn.file(f).then(function (n) { chat('🧠 Zapamiętane (' + n.kind + '): ' + n.title + ' — ' + n.text); }, function (e) { chat('⚠ ' + e.message); }); }); };
    inp.click();
  };
  function learnChat(text) {
    var n = norm(text), m;
    if ((m = String(text).match(/^\s*(zapamietaj|zapamiętaj|naucz sie|naucz się|remember)\s*[:,-]?\s*(.{3,})$/i))) { var x = Learn.add('chat', m[2].slice(0, 40), privacy(m[2])); return '🧠 Zapamiętane na tym urządzeniu: „' + x.text.slice(0, 120) + '”'; }
    if (/^(notatki|co wiesz|co zapamietales|czego sie nauczyles|nauka d bot|my notes|notes)$/.test(n)) return Learn.text();
    if ((m = n.match(/^(co wiesz o|znajdz w notatkach|what do you know about)\s+(.+)$/))) { var f = Learn.find(m[2]); return f.length ? '🧠 ' + f.map(function (y) { return y.title + ': ' + y.text.slice(0, 140); }).join('\n') : '🧠 Nic o „' + m[2] + '” w notatkach.'; }
    if (/^(naucz|📎 naucz|ucz sie z pliku|pokaz ci plik)$/.test(n)) { Learn.pick(); return '📎 Wybierz zdjęcie, muzykę albo wideo — przeanalizuję je na urządzeniu.'; }
    return null;
  }

  // ================================================================== boot (app only)
  var T = global.DBotTeam = {
    learn: Learn, handlers: [], version: VERSION, team: TEAM, groups: GROUPS, teamText: teamText, codegen: codegen, templates: TPL, video: Video, home: Home, lessons: Lessons, update: Update,
    publicReply: function (t, style) { return privacy(style === false ? publicReply(privacy(t)) : Persona.flavor(publicReply(privacy(t)), true)); }, persona: Persona, privacy: privacy,
    offline: { android: builderOffline('android'), apple: builderOffline('apple'), desktop: builderOffline('desktop'), video: videoOffline }
  };
  if (!doc || global.__DBOT_PUBLIC) return;
  /** chat text → which team bot should take it before the generic routers (D Builder = web apps, D Loop „nagraj” etc.) */
  function teamBot(n) {
    if (/^@\w+/.test(n)) return null;
    if (/\b(nagraj|zrob|zrobic|record|make|stworz)\b.*\b(wideo|video|klip\w*|clip|teledysk\w*)\b|\b(wideo|video)\b.*\b(nagraj|record)\b|\b(eksport\w*|export)\b.*\b(petl\w*|loop\w*)\b/.test(n)) return 'video';
    if (!/\b(zbuduj|zrob|napisz|stworz|wygeneruj|build|make|create|write|generate|kod|code)\b/.test(n)) return null;
    if (/\b(android\w*|kotlin|apk|jetpack|ndk)\b/.test(n)) return 'android';
    if (/\b(iphone\w*|ipad\w*|ios|swift\w*|xcode|watchos)\b/.test(n)) return 'apple';
    if (/\b(maca?|macos|desktop\w*|electron|python\w*|tkinter|pyqt|windows|linux|komputer\w*|pc)\b|c\+\+|\bcpp\b|\bw c\b/.test(n)) return 'desktop';
    return null;
  }
  function hookChat() {
    var S = global.D7Super; if (!S || !S.__agHooked) return false;
    if (S.__v48team && S.handle === S.__v48team) return true; // still the outermost wrapper (DBotTalk etc. wrap later → re-wrap)
    var orig = S.handle;
    var mine = function (text) {
      var n = norm(text), r = null;
      for (var hi = 0; hi < T.handlers.length && r == null; hi++) { try { r = T.handlers[hi](text); } catch (_) { r = null; } } // genre / radio / theme …
      if (r != null) { /* handled */ }
      else if (/^(zespol|team|zespol d bot|boty|8 botow|superbot team)$/.test(n)) r = teamText();
      else if (/^(ziomal|styl ziomal|tryb ziomal|ziomal on|wlacz ziomala)$/.test(n)) { Persona.set('ziomal'); r = Persona.excl() + ' Ziomal mode ON 😎'; }
      else if (/^(ziomal off|wylacz ziomala|grzecznie|styl grzeczny)$/.test(n)) { Persona.set('grzeczny'); r = 'OK, mówię grzecznie.'; }
      else if (/^(lekcje|lessons|log bledow|bledy|error log)$/.test(n)) r = Lessons.text();
      else if (/^(aktualizacja|update|sprawdz aktualizacje|check update)$/.test(n)) { Update.check(true).then(function (u) { chat(u && u.newer ? '🔄 Nowsza: ' + u.remote + ' → ' + u.url : '🔄 ' + (u && u.err ? 'nie udało się sprawdzić (' + u.err + ')' : 'masz najnowszą wersję (' + VERSION + ')')); }); r = '🔄 Sprawdzam sync-manifest na stronie live…'; }
      else if (/^(home|start czat|duzy czat|ekran glowny)$/.test(n)) { Home.set(true); r = '🏠 Ekran startowy: duży czat D BOT.'; }
      var tb = r == null ? teamBot(n) : null;
      if (tb) {
        var A = global.DBotAgents, ag = A && A.byId(tb), C0 = global.D7Chat;
        if (ag && ag.enabled !== false && C0) {
          C0.add('user', text);
          A.run(ag, text, {}).then(function (res) { C0.add('bot', ag.icon + ' ' + ag.name + ':\n' + res.text); }, function (e) { C0.add('bot', '⚠ ' + ag.name + ': ' + (e && e.message || e)); });
          return true;
        }
      }
      if (r == null) return orig.apply(this, arguments);
      var C = global.D7Chat; if (C) { C.add('user', text); C.add('bot', r); } return true;
    };
    // DBotTalk re-hooks every 5 s when ITS wrapper is not on top (checks handle.__talk). Once it is inside our chain, mark ours
    // so the two never ping-pong (unbounded nesting).
    mine.__talk = mine.__hasTalk = !!(orig.__talk || orig.__hasTalk);
    S.handle = S.__v48team = mine;
    return true;
  }
  function optsCard(b) {
    if (!b || b.querySelector('#op-home')) return;
    var c = doc.createElement('div'); c.className = 'dbc-card'; c.id = 'op-home';
    c.innerHTML = '<h3>🏠 Start · 👥 zespół · 📚 lekcje</h3><label class="dbc-row"><span>Ekran startowy = duży czat D BOT (UFO)</span><input type="checkbox" id="op-home-on"' + (Home.on() ? ' checked' : '') + '></label>' +
      '<label class="dbc-row"><span>🔄 Sprawdzaj aktualizacje (sync-manifest, tylko powiadomienie)</span><input type="checkbox" id="op-upd"' + (sget('update.auto', true) ? ' checked' : '') + '></label>' +
      '<label class="dbc-row"><span>😎 Styl D (Twoje prywatne czaty)</span><select id="op-style">' + Object.keys(LEVELS).map(function (k) { return '<option value="' + k + '"' + (sget('persona.level', 'ziomal') === k ? ' selected' : '') + '>' + LEVELS[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="dbc-row"><span>🔞 Mam 18+ — pozwól na „Bez cenzury” (tylko moje czaty; publiczny czat i boty dla innych: max „Ziomal”)</span><input type="checkbox" id="op-adult"' + (Persona.adult() ? ' checked' : '') + '></label>' +
      '<p class="dbc-hint">' + esc(TEAM.map(function (x) { return x.icon + ' ' + x.name; }).join(' · ')) + ' · 🩺 D Doctor (system)</p>';
    var after = b.querySelector('#op-bpm') || b.querySelector('#op-auto'); if (after && after.nextSibling) b.insertBefore(c, after.nextSibling); else b.appendChild(c);
    c.querySelector('#op-home-on').onchange = function () { Home.set(this.checked); };
    c.querySelector('#op-upd').onchange = function () { sset('update.auto', this.checked); };
    c.querySelector('#op-style').onchange = function () { var l = Persona.set(this.value); chat(l === 'bezcenzury' && !Persona.adult() ? '🔞 „Bez cenzury” zadziała po zaznaczeniu „Mam 18+”. Na razie: Ziomal.' : 'Styl D: ' + LEVELS[Persona.level()]); };
    c.querySelector('#op-adult').onchange = function () { Persona.adult(this.checked); chat('Styl D: ' + LEVELS[Persona.level()]); };
  }
  function hookFlavor() {
    var C = global.D7Chat; if (!C || !C.add || C.__ziomal) return !!(C && C.__ziomal); C.__ziomal = true;
    var add = C.add; C.add = function (who, text) { if (who === 'bot' && typeof text === 'string' && !/^[🧠📎🔄📚👥]/.test(text)) text = Persona.flavor(text); return add.apply(C, [who, text].concat([].slice.call(arguments, 2))); };
    return true;
  }
  function hookOpts() { var S = global.DBotStudio; if (!S || S.__v48t) return !!(S && S.__v48t); S.__v48t = true; var ao = S.autoOpts; S.autoOpts = function (b) { var r = ao.apply(S, arguments); try { optsCard(b); } catch (_) {} return r; }; return true; }
  function boot() {
    if (T.handlers.indexOf(learnChat) < 0) T.handlers.push(learnChat);
    var n = 0, t = setInterval(function () { var a = hookChat(), b = hookOpts(), c = Home.bar(); hookFlavor(); if ((a && b && c && n > 20) || ++n > 60) clearInterval(t); }, 500);
    setInterval(hookChat, 3000); // stay outermost so team bots get „zbuduj … na Androida / iPhone / Maca” before the web D Builder
    setTimeout(function () { if (Home.on() && !global.__D77_NO_HOME) Home.open(); }, 2200);
    setTimeout(function () { if (sget('update.auto', true)) Update.check(false); }, 15000);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
