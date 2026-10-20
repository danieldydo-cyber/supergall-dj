/* Super Bot D · D7 DJ v51 (Daniel Dydo) — darmowy generator muzyki (MusicGen w przeglądarce przez transformers.js),
 * przewodnik Suno/Udio (darmowe plany), autotest funkcji window.DBotV51.check(). Wszystko lokalnie; brak wysyłki danych. */
(function (global) {
  'use strict';
  var V = { version: '51', name: 'Super Bot D · D7 DJ' };
  var MODEL = 'Xenova/musicgen-small', T = null, tok = null, model = null, busy = false;
  function $(s, r) { return (r || document).querySelector(s); }
  function libBase() { var s = document.querySelector('script[src*="dbot-v51.js"]'); return s ? new URL('../libs/ai/', s.src).href : new URL('libs/ai/', location.href).href; }
  function status(t) { var e = $('#v51-mg-st'); if (e) e.textContent = t; }
  function wav(samples, rate) {
    var n = samples.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), p = 0;
    function s(t) { for (var i = 0; i < t.length; i++) v.setUint8(p++, t.charCodeAt(i)); } function u32(x) { v.setUint32(p, x, true); p += 4; } function u16(x) { v.setUint16(p, x, true); p += 2; }
    s('RIFF'); u32(36 + n * 2); s('WAVE'); s('fmt '); u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16); s('data'); u32(n * 2);
    var mx = 0; for (var i = 0; i < n; i++) mx = Math.max(mx, Math.abs(samples[i])); var g = mx > 0 ? 0.95 / mx : 1;
    for (i = 0; i < n; i++) { var x = Math.max(-1, Math.min(1, samples[i] * g)); v.setInt16(p, x * 32767, true); p += 2; }
    return new Blob([b], { type: 'audio/wav' });
  }
  function load() {
    if (model) return Promise.resolve();
    status('⏳ Ładuję transformers.js…');
    return import(libBase() + 'transformers.min.js').then(function (m) {
      T = m; try { T.env.backends.onnx.wasm.wasmPaths = libBase(); } catch (_) {}
      var prog = function (p) { if (p && p.status === 'progress') status('⬇ Pobieram model MusicGen (jednorazowo, ~600 MB): ' + (p.file || '') + ' ' + Math.round(p.progress || 0) + '%'); };
      return Promise.all([T.AutoTokenizer.from_pretrained(MODEL),
        T.MusicgenForConditionalGeneration.from_pretrained(MODEL, { dtype: { text_encoder: 'q8', decoder_model_merged: 'q8', encodec_decode: 'fp32' }, progress_callback: prog })]);
    }).then(function (r) { tok = r[0]; model = r[1]; status('✅ MusicGen gotowy (działa offline w przeglądarce)'); });
  }
  function generate() {
    if (busy) return; busy = true;
    var prompt = ($('#v51-mg-p') || {}).value || 'minimal techno 124 bpm, deep bass, hypnotic', secs = +(($('#v51-mg-s') || {}).value || 8);
    load().then(function () {
      status('🎛 Generuję ' + secs + ' s: „' + prompt + '” (na telefonie to może potrwać kilka minut)…');
      var inputs = tok(prompt);
      return model.generate(Object.assign({}, inputs, { max_new_tokens: Math.round(secs * 50), do_sample: true, guidance_scale: 3 }));
    }).then(function (audio) {
      var rate = (model.config && model.config.audio_encoder && model.config.audio_encoder.sampling_rate) || 32000;
      var url = URL.createObjectURL(wav(audio.data, rate)), a = $('#v51-mg-a'), d = $('#v51-mg-d');
      a.src = url; a.play().catch(function () {}); d.href = url; d.download = 'D-MusicGen-' + Date.now() + '.wav'; d.style.display = 'inline-block';
      status('🎵 Gotowe — odsłuchaj, pobierz WAV albo wrzuć na deck / do loopera.');
    }).catch(function (e) { status('⚠ MusicGen: ' + (e && e.message || e) + ' — użyj Suno/Udio poniżej.'); }).then(function () { busy = false; });
  }
  var GUIDE = [
    ['Suno', 'https://suno.com', 'Darmowy plan: dzienne kredyty (ok. 10 utworów/dzień), tylko do użytku niekomercyjnego. Opisz styl + tekst po polsku.'],
    ['Udio', 'https://www.udio.com', 'Darmowy plan: miesięczne/dzienne kredyty, klipy ~30 s z możliwością przedłużania. Licencja niekomercyjna na darmowym planie.'],
    ['Stable Audio', 'https://stableaudio.com', 'Darmowe miesięczne kredyty, dobre do pętli i sampli (BPM w prompcie).'],
    ['Riffusion', 'https://www.riffusion.com', 'Darmowe generowanie krótkich utworów i remiksów.']
  ];
  function panel() {
    if ($('#v51-mg')) { $('#v51-mg').hidden = !$('#v51-mg').hidden; return; }
    var w = document.createElement('div'); w.id = 'v51-mg';
    w.style.cssText = 'position:fixed;z-index:2147483600;left:50%;top:8%;transform:translateX(-50%);width:min(560px,94vw);max-height:84vh;overflow:auto;background:rgba(8,4,24,.96);color:#eaf;border:1px solid #7f5cff;border-radius:16px;padding:14px;font:14px system-ui;box-shadow:0 0 40px #7f5cff88';
    w.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b>🎼 Darmowy generator muzyki · D Song</b><button id="v51-mg-x" style="background:none;border:0;color:#fff;font-size:20px">✕</button></div>' +
      '<p style="opacity:.8;margin:6px 0">MusicGen (Meta, licencja CC-BY-NC) działa <b>w przeglądarce</b> przez transformers.js — za darmo, bez kluczy. Model pobiera się raz i zostaje w cache.</p>' +
      '<input id="v51-mg-p" style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid #555;background:#111;color:#fff" value="minimal techno 124 bpm, deep rolling bass, hypnotic hi-hats">' +
      '<div style="margin:8px 0">Długość: <input id="v51-mg-s" type="range" min="4" max="20" value="8" oninput="this.nextElementSibling.textContent=this.value+\' s\'"> <span>8 s</span> ' +
      '<button id="v51-mg-g" style="padding:8px 14px;border-radius:10px;border:0;background:#7f5cff;color:#fff;font-weight:700">Generuj</button></div>' +
      '<div id="v51-mg-st" style="font-size:12px;opacity:.85">Gotowy. Pierwsze uruchomienie pobiera model.</div><audio id="v51-mg-a" controls style="width:100%;margin-top:6px"></audio>' +
      '<a id="v51-mg-d" style="display:none;color:#9ff">⬇ Pobierz WAV</a><hr style="border-color:#333"><b>Darmowe plany w chmurze</b><ul style="padding-left:18px">' +
      GUIDE.map(function (g) { return '<li><a href="' + g[1] + '" target="_blank" rel="noopener" style="color:#9ff">' + g[0] + '</a> — ' + g[2] + '</li>'; }).join('') +
      '</ul><small style="opacity:.7">Wskazówka: wygenerowany WAV wrzuć na deck (przeciągnij plik) — Auto Mix wykryje BPM i dopasuje do zakresu 79–127.</small>';
    document.body.appendChild(w);
    $('#v51-mg-x').onclick = function () { w.hidden = true; }; $('#v51-mg-g').onclick = generate;
  }
  function fab() {
    if ($('#v51-fab')) return; var b = document.createElement('button'); b.id = 'v51-fab'; b.title = 'Darmowy generator muzyki (MusicGen / Suno / Udio)'; b.textContent = '🎼';
    b.style.cssText = 'position:fixed;z-index:2147483500;right:12px;bottom:150px;width:46px;height:46px;border-radius:50%;border:1px solid #7f5cff;background:#1a0f3a;color:#fff;font-size:22px;box-shadow:0 0 16px #7f5cff';
    b.onclick = panel; document.body.appendChild(b);
  }
  function has(x) { try { return !!x; } catch (_) { return false; } }
  function check() {
    var g = global, src = Array.prototype.map.call(document.scripts, function (s) { return s.src; }).join(' ');
    return {
      version: (g.DBotV53 && g.DBotV53.version) || (g.DBotV52 && g.DBotV52.version) || V.version, djDecks: has(document.querySelector('.p8-phase') || g.PRO8 || /pro8\.js/.test(src)),
      midiClock: has(g.DBotStudio && g.DBotStudio.clock), conductor: has(g.DBotConductor), genre: has(g.DBotGenre), fly: has(g.DBotFly),
      milkdrop: has(g.butterchurn) || /viz\.js|butterchurn/.test(src), studio: has(g.DBotStudio), mpc: has(g.DBotStudio && g.DBotStudio.mpc), looper: has(g.DBotStudio && g.DBotStudio.looper),
      team: has(g.DBotTeam), doctor: has(g.DBotDoctor), builder: has(g.DBuilder), brains: has(g.DBotBrains), localAI: has(g.DBotLocalAI), ufo: has(g.DBotUFO),
      talk: has(g.DBotTalk), superbot: has(g.D7Super), musicgen: true, alignFix51: true,
      stations: g.DBotGenre && g.DBotGenre.stations ? g.DBotGenre.stations.length : 0,
      fullAuto: !!(g.DBotConductor && g.DBotConductor.autoOn && g.DBotConductor.autoOn()), decksArmed: !!(g.DBotConductor && g.DBotConductor.armed && g.DBotConductor.armed())
    };
  }
  V.panel = panel; V.generate = generate; V.check = check; V.wav = wav; global.DBotV51 = V;
  function title() { try { if (!/Super Bot D 55/.test(document.title)) document.title = 'Super X DJ · Daniel Dydo'; } catch (_) {} }
  function init() { fab(); title(); setTimeout(title, 2500); setTimeout(title, 9000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
