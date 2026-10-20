/* Super Bot D 52 — mózg zespołu: role (system prompt) dla D + 8 botów, wspólna pamięć (localStorage 'd52.mem'),
 * routing narzędzi (D deleguje do botów muzyki / builderów / wideo), lepsze odpowiedzi offline bez modelu.
 * Styl „Ziomal”: wyłącznie przenośne, żartobliwe „przekleństwa” (motyla noga, kurde balans); publicznie zawsze czysto. */
(function (global) {
  'use strict';
  var LS = 'd52.mem', MAX = 60;
  var SAFE = '\nZasady: odpowiadaj po polsku (albo w języku rozmówcy). Styl Ziomal = luz i żartobliwe, przenośne zwroty („kurde balans”, „motyla noga”), NIGDY prawdziwych wulgaryzmów, obelg ani treści dla dorosłych. W czatach publicznych / do innych osób mów całkiem grzecznie. Nie zdradzaj danych właściciela.';
  var ROLES = {
    d: { icon: '👽', name: 'X (główny bot)', prompt: 'Jesteś X — główny bot i szef zespołu Super X DJ Daniela Dydo (Kraków). Rozumiesz prośbę, odpowiadasz krótko i konkretnie, a zadania specjalistyczne delegujesz: aplikacje → buildery (Android, Apple, Desktop, Web), muzyka → D Song / DJ Mix / D Loop, wideo → D Video. Pilnujesz spójności ze wspólną pamięcią zespołu.' },
    android: { icon: '📱', name: 'Android Builder', prompt: 'Jesteś Android Builder: piszesz kompletne, działające aplikacje Android w Kotlin/Java (Gradle lub ręczny aapt2/d8), z manifestem, uprawnieniami i instrukcją budowania.' },
    apple: { icon: '🍎', name: 'iOS / Apple Builder', prompt: 'Jesteś Apple Builder: SwiftUI/Swift dla iOS i macOS, struktura projektu Xcode, Info.plist, uprawnienia, wskazówki podpisywania.' },
    desktop: { icon: '💻', name: 'Mac / Desktop Builder', prompt: 'Jesteś Desktop Builder: Electron (JS/TS), Python, C/C++; dajesz package.json / skrypty budowania i pakowania (zip, podpis ad-hoc).' },
    appbuilder: { icon: '🌐', name: 'Web Builder', prompt: 'Jesteś Web Builder: jednoplikowe strony i PWA (HTML/CSS/JS/TS), responsywne, dostępne, offline (service worker).' },
    song: { icon: '🎵', name: 'D Song', prompt: 'Jesteś D Song: piszesz teksty (zwrotka/refren/bridge), akordy, strukturę, tempo i gatunek; proponujesz prompt do generatora (MusicGen/Suno/Udio) z BPM w zakresie 79–127 dla danego gatunku.' },
    dj: { icon: '🎧', name: 'DJ / Mix', prompt: 'Jesteś DJ / Mix: Auto Mix, beatmatching i frazy (16/32 beaty), SYNC, EQ bass swap, FX, MIDI clock z Roland MC-707, okna BPM gatunków (Techno 124–127, House 120–126, DnB 87 half-time, Hip-hop 85–98), tryb Minimal DJ Set PRO · Play Fly.' },
    looper: { icon: '🔁', name: 'D Loop · Beats / MPC', prompt: 'Jesteś D Loop: bębny, pętle, 26 padów MPC, looper 4 ścieżki, auto-loop, kwantyzacja i sekwencer; dajesz konkretne wzory (16 kroków) i ustawienia.' },
    video: { icon: '🎬', name: 'D Video + Loops', prompt: 'Jesteś D Video: klipy WebM z wizualizacji MilkDrop, długość, eksport pętli, pomysły na wizuale zsynchronizowane z BPM.' }
  };
  var ROUTES = [
    ['apple', /\b(iphone\w*|ios|ipad\w*|swift\w*|xcode)\b/], ['android', /\b(android\w*|apk|kotlin\w*)\b/], ['desktop', /\b(mac\w*|windows\w*|desktop\w*|electron|program na)\b/],
    ['appbuilder', /\b(stron\w*|www|html|pwa|website|web app)\b/], ['video', /\b(wideo|video|klip\w*|film\w*|nagraj\w*)\b/],
    ['song', /\b(piosenk\w*|tekst\w*|refren|song|lyrics|akord\w*|zaspiewaj|wygeneruj muzyk\w*)\b/],
    ['looper', /\b(petl\w*|loop\w*|bebn\w*|beat\w*|mpc|pad\w*|perkusj\w*)\b/], ['dj', /\b(mix\w*|dj|deck\w*|bpm|sync|tempo|przejsci\w*|radio|mc-?707|midi|fly)\b/]
  ];
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ').trim(); }
  var Mem = {
    all: function () { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (_) { return []; } },
    add: function (from, kind, text) { var a = Mem.all(); a.push({ t: Date.now(), from: from, kind: kind, text: String(text).slice(0, 280) }); if (a.length > MAX) a = a.slice(-MAX); try { localStorage.setItem(LS, JSON.stringify(a)); } catch (_) {} return a.length; },
    prompt: function (n) { var a = Mem.all().slice(-(n || 8)); return a.length ? '\nWspólna pamięć zespołu (ostatnie ustalenia):\n' + a.map(function (e) { return '- [' + e.from + '] ' + e.text; }).join('\n') : ''; },
    clear: function () { try { localStorage.removeItem(LS); } catch (_) {} }
  };
  function route(text) { var n = norm(text); for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i][1].test(n)) return ROUTES[i][0]; return 'd'; }
  function system(bot, forOthers) { var r = ROLES[bot] || ROLES.d; return r.prompt + (bot !== 'd' ? '\nPracujesz w zespole pod D; wynik zwracasz D.' : '') + Mem.prompt() + SAFE; }
  function ziomal(forOthers) { try { var P = global.DBotTeam && global.DBotTeam.persona; if (!P || P.level(forOthers) === 'grzeczny' || forOthers) return ''; return P.excl() + ' '; } catch (_) { return ''; } }
  var TIPS = {
    d: 'Powiedz mi, co robimy: „auto mix”, „d song o lecie”, „zbuduj aplikację na Androida …”, „nagraj wideo 10 s”, „radio techno”.',
    song: 'Zrobię szkic: temat → zwrotka (8 wersów), refren (4), bridge; tempo i gatunek. Napisz „d song house o lecie”, a wygeneruję tekst + bębny + WAV. Do prawdziwego wokalu: 🎼 generator (MusicGen offline / Suno / Udio).',
    dj: 'Auto Mix miesza na granicy frazy (16/32 beaty) z blokadą fazy <0,02 beatu; zakres BPM 79–127 z oknami gatunków. Komendy: „auto mix”, „sync B”, „play fly”, „radio dnb”, „mc-707 clock”.',
    looper: 'Wzór techno 16 kroków: kick x...x...x...x..., hat ..x...x...x...x., clap ....x.......x... — „d loop bębny 124” odpali to na 26 padach MPC + looperze (auto-loop).',
    video: 'Nagram klip WebM z wizualizacji MilkDrop zsynchronizowany z BPM: „nagraj wideo 10 s”; pętlę wyeksportuję komendą „eksport pętli”.'
  };
  /** offline fallback when no cloud key / on-device model: delegate to the right bot and give a useful, role-specific answer */
  function fallback(raw, n, lang) {
    var bot = route(raw), r = ROLES[bot], T = global.DBotTeam, out = null;
    try {
      if (/^(android|apple|desktop)$/.test(bot) && T && T.offline && T.offline[bot]) out = T.offline[bot](raw);
      else if (bot === 'video' && T && T.offline && T.offline.video) out = T.offline.video(raw);
    } catch (_) { out = null; }
    var text = out && out.text ? out.text : (TIPS[bot] || (bot === 'appbuilder' ? 'Zbuduję stronę/PWA: napisz „zbuduj stronę …” — dostaniesz gotowy plik HTML (offline szablon), a z mózgiem AI pełną aplikację.' : TIPS.d));
    Mem.add(bot, 'route', 'D → ' + r.name + ': ' + String(raw).slice(0, 120));
    var head = bot === 'd' ? '👽 X: ' : '👽 X → ' + r.icon + ' ' + r.name + ': ';
    return { text: (arguments[3] && arguments[3].plain ? '' : ziomal(false)) + head + text + (bot === 'd' ? '' : '\n\n🧠 Pełne odpowiedzi na każdy temat: włącz Model X (darmowy mózg na telefonie) albo dodaj własny klucz.'), bot: bot, delegated: bot !== 'd' };
  }
  function hookPersona() {
    var P = global.DBotTeam && global.DBotTeam.persona; if (!P || P.__v52) return !!(P && P.__v52); P.__v52 = true;
    var w0 = P.wrap; P.wrap = function (sys, forOthers) { var bot = global.DBotV52.__ctx || 'd'; return w0.call(P, String(sys || '') + '\n\n' + system(bot, forOthers), forOthers); };
    return true;
  }
  function hookSuper() {
    var S = global.D7Super; if (!S || S.__v52) return; S.__v52 = true;
    var h0 = S.handle; if (h0) S.handle = function (text, meta) { try { global.DBotV52.__ctx = route(text); Mem.add('user', 'msg', text); } catch (_) {} return h0.apply(this, arguments); };
  }
  /** v52: grid refine after BPM snapping — strongest-onset phase over up to 96 beats spread through the track (±half beat around the old grid) */
  function refineGrid(buf, bpm, fb0) {
    try {
      var sr = buf.sampleRate, d = buf.getChannelData(0), spb = 60 / bpm, n = Math.floor((buf.duration - 1) / spb), step = Math.max(1, Math.floor(n / 96)), W = Math.round(0.006 * sr), best = -1, bo = fb0;
      for (var o = fb0 - spb / 2; o < fb0 + spb / 2; o += 0.001) {
        var sc = 0; for (var k = 0; k < n; k += step) { var s0 = Math.round((o + k * spb) * sr); if (s0 < 0 || s0 + W >= d.length) continue; var e = 0; for (var i = 0; i < W; i += 2) e += Math.abs(d[s0 + i]); var p0 = s0 - W; var pre = 0; if (p0 > 0) for (i = 0; i < W; i += 2) pre += Math.abs(d[p0 + i]); sc += Math.max(0, e - pre); }
        if (sc > best) { best = sc; bo = o; }
      }
      while (bo < 0) bo += spb; while (bo >= spb) bo -= spb; return Math.round(bo * 1e4) / 1e4;
    } catch (_) { return null; }
  }
  var V = global.DBotV52 = { refineGrid: refineGrid, version: '52', roles: ROLES, mem: Mem, route: route, system: system, fallback: fallback, __ctx: 'd' };
  var tries = 0, iv = setInterval(function () { hookPersona(); hookSuper(); if (++tries > 40 || (global.D7Super && global.D7Super.__v52 && global.DBotTeam && global.DBotTeam.persona && global.DBotTeam.persona.__v52)) clearInterval(iv); }, 500);
})(window);
