/* D DJ 54 — 🧰 Narzędzia D: multitool learning (image recognition on-device, audio BPM/key), web learning (Wikipedia/DuckDuckGo),
 * D Builder online (HTML app from a prompt + live preview + zip), Messenger status + local Page token (no auto-posting),
 * TikTok reply/caption drafts (copy only, no automation). Everything learned → shared bot memory (DBotV52.mem). */
(function (global) {
  'use strict';
  var doc = global.document; function $(s, r) { return (r || doc).querySelector(s); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mem(kind, text) { try { return global.DBotV52.mem.add('tools', kind, text); } catch (_) { return 0; } }
  function say(t) { try { if (global.D7Chat && global.D7Chat.botSay) global.D7Chat.botSay(t); } catch (_) {} }
  function libBase() { var s = doc.querySelector('script[src*="dbot-localai.js"],script[src*="dbot-v54.js"]'); return new URL('../libs/ai/', s ? s.src : location.href).href; }

  // ---------- 1a. images: on-device recognition (lazy transformers.js, MobileNetV4 ~4 MB, cached once) ----------
  var T = null, cls = null;
  function vision(status) {
    if (cls) return Promise.resolve(cls);
    status('⏳ Ładuję model rozpoznawania obrazu (jednorazowo ~4 MB)…');
    return import(libBase() + 'transformers.min.js').then(function (m) {
      T = m; try { T.env.backends.onnx.wasm.wasmPaths = libBase(); } catch (_) {}
      return T.pipeline('image-classification', 'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k', { dtype: 'q8', progress_callback: function (p) { if (p && p.status === 'progress') status('⬇ ' + (p.file || '') + ' ' + Math.round(p.progress || 0) + '%'); } });
    }).then(function (p) { cls = p; return p; });
  }
  function learnImage(file, status) {
    var url = URL.createObjectURL(file);
    return vision(status).then(function (p) { return p(url, { top_k: 3 }); }).then(function (r) {
      var txt = r.map(function (x) { return x.label + ' ' + Math.round(x.score * 100) + '%'; }).join(', ');
      mem('image', file.name + ': ' + txt); status('🖼 ' + file.name + ' → ' + txt + ' · zapisane w pamięci botów'); return { file: file.name, labels: r };
    }).catch(function (e) { status('⚠ Obraz: ' + (e && e.message || e) + ' (offline? model pobiera się raz z Hugging Face)'); throw e; });
  }

  // ---------- 1b. audio: BPM (onset autocorrelation, folded 79–127) + key (chroma vs Krumhansl profiles) ----------
  var NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];
  var MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function analyse(buf) {
    var sr = buf.sampleRate, d = buf.getChannelData(0), n = Math.min(d.length, sr * 60);
    // onset envelope (10 ms hops)
    var hop = Math.round(sr / 100), env = [], prev = 0;
    for (var i = 0; i + hop < n; i += hop) { var e = 0; for (var j = 0; j < hop; j++) e += d[i + j] * d[i + j]; e = Math.sqrt(e / hop); env.push(Math.max(0, e - prev)); prev = e; }
    var best = 0, bpm = 120;
    for (var b = 60; b <= 180; b += .5) { var lag = 6000 / b, s = 0; for (var k = 0; k + lag * 4 < env.length; k++) s += env[k] * (env[Math.round(k + lag)] + .5 * env[Math.round(k + lag * 2)]); if (s > best) { best = s; bpm = b; } }
    while (bpm < 79) bpm *= 2; while (bpm > 127) bpm /= 2; if (Math.abs(bpm - Math.round(bpm)) < .3) bpm = Math.round(bpm);
    // chroma via Goertzel over 4 octaves on a few frames
    var chroma = new Array(12).fill(0), F = 4096, frames = Math.min(40, Math.floor(n / F));
    for (var f = 0; f < frames; f++) { var off = Math.floor(f * (n - F) / Math.max(1, frames - 1));
      for (var pc = 0; pc < 12; pc++) for (var oct = 2; oct <= 5; oct++) { var fr = 440 * Math.pow(2, (pc - 9) / 12 + (oct - 4)), w = 2 * Math.PI * fr / sr, c = 2 * Math.cos(w), s0 = 0, s1 = 0, s2 = 0;
        for (var x = 0; x < F; x += 2) { s0 = d[off + x] + c * s1 - s2; s2 = s1; s1 = s0; } chroma[pc] += s1 * s1 + s2 * s2 - c * s1 * s2; } }
    function corr(p, r) { var ma = 0, mb = 0, q; for (q = 0; q < 12; q++) { ma += chroma[(q + r) % 12]; mb += p[q]; } ma /= 12; mb /= 12; var nu = 0, da = 0, db = 0; for (q = 0; q < 12; q++) { var a = chroma[(q + r) % 12] - ma, bb = p[q] - mb; nu += a * bb; da += a * a; db += bb * bb; } return nu / Math.sqrt(da * db || 1); }
    var key = 'C', kb = -2; for (var r = 0; r < 12; r++) { var c1 = corr(MAJ, r), c2 = corr(MIN, r); if (c1 > kb) { kb = c1; key = NOTES[r] + '-dur'; } if (c2 > kb) { kb = c2; key = NOTES[r] + '-moll'; } }
    return { bpm: bpm, key: key, secs: Math.round(buf.duration) };
  }
  function learnAudio(file, status) {
    status('⏳ Analizuję ' + file.name + '…');
    return file.arrayBuffer().then(function (ab) { var C = global.AudioContext || global.webkitAudioContext, ctx = new C(); return ctx.decodeAudioData(ab).then(function (b) { try { ctx.close(); } catch (_) {} return b; }); })
      .then(function (b) { var r = analyse(b); mem('audio', file.name + ': ' + r.bpm + ' BPM, ' + r.key + ', ' + r.secs + ' s'); status('🎧 ' + file.name + ' → ' + r.bpm + ' BPM · tonacja ' + r.key + ' · ' + r.secs + ' s · zapisane'); return r; })
      .catch(function (e) { status('⚠ Audio: ' + (e && e.message || e)); throw e; });
  }

  // ---------- 2. web learning ----------
  function webLearn(q, lang) {
    lang = lang || 'pl'; q = String(q || '').trim(); if (!q) return Promise.reject(new Error('pusty temat'));
    var wiki = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=' + encodeURIComponent(q);
    return fetch(wiki).then(function (r) { return r.json(); }).then(function (j) {
      var hit = j.query && j.query.search && j.query.search[0]; if (!hit) throw new Error('brak w Wikipedii');
      return fetch('https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(hit.title)).then(function (r) { return r.json(); })
        .then(function (s) { return { title: s.title || hit.title, text: s.extract || hit.snippet.replace(/<[^>]+>/g, ''), url: (s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) || '', src: 'Wikipedia' }; });
    }).catch(function () {
      return fetch('https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=' + encodeURIComponent(q)).then(function (r) { return r.json(); })
        .then(function (d) { var t = d.AbstractText || (d.RelatedTopics && d.RelatedTopics[0] && d.RelatedTopics[0].Text) || ''; if (!t) throw new Error('nic nie znalazłem'); return { title: d.Heading || q, text: t, url: d.AbstractURL || '', src: 'DuckDuckGo' }; });
    }).then(function (n) { var note = n.title + ': ' + n.text.slice(0, 240); mem('web', note); var a = notes(); a.push({ t: Date.now(), q: q, title: n.title, text: n.text.slice(0, 1200), url: n.url, src: n.src }); try { localStorage.setItem('dbot.webNotes', JSON.stringify(a.slice(-60))); } catch (_) {} return n; });
  }
  function notes() { try { return JSON.parse(localStorage.getItem('dbot.webNotes') || '[]'); } catch (_) { return []; } }

  // ---------- 3. D Builder online: prompt → small HTML app, live preview, zip ----------
  function appHtml(prompt) {
    var p = String(prompt || '').toLowerCase(), title = (String(prompt || 'Moja apka').replace(/^(zrób|zbuduj|stwórz|napisz)\s+(mi\s+)?(apk[aęi]|aplikacj[aęi]|stron[aęy])?\s*/i, '').trim() || 'Moja apka').slice(0, 40);
    var css = 'body{font-family:system-ui;background:#0b0820;color:#eee;display:flex;flex-direction:column;align-items:center;gap:12px;padding:24px}button,input{font:inherit;padding:10px 16px;border-radius:12px;border:1px solid #7b2cff;background:#1a1240;color:#fff}h1{background:linear-gradient(90deg,#ff5cf0,#5cf0ff);-webkit-background-clip:text;color:transparent}li{margin:4px 0}';
    var body, js;
    if (/licznik|counter|klik/.test(p)) { body = '<div id="n" style="font-size:72px">0</div><div><button id="m">−</button> <button id="p">+</button> <button id="r">reset</button></div>'; js = 'var n=+localStorage.n||0,e=document.getElementById("n");function s(){e.textContent=n;localStorage.n=n}m.onclick=function(){n--;s()};p.onclick=function(){n++;s()};r.onclick=function(){n=0;s()};s();'; }
    else if (/todo|zadani|lista|zakup/.test(p)) { body = '<div><input id="i" placeholder="Dodaj…"> <button id="a">dodaj</button></div><ul id="l"></ul>'; js = 'var L=JSON.parse(localStorage.l||"[]");function d(){l.innerHTML="";L.forEach(function(t,k){var li=document.createElement("li");li.textContent=t+" ";var b=document.createElement("button");b.textContent="✓";b.onclick=function(){L.splice(k,1);s()};li.appendChild(b);l.appendChild(li)})}function s(){localStorage.l=JSON.stringify(L);d()}a.onclick=function(){if(i.value){L.push(i.value);i.value="";s()}};d();'; }
    else if (/timer|stoper|minutnik|zegar/.test(p)) { body = '<div id="t" style="font-size:64px">00:00.0</div><div><button id="g">start/stop</button> <button id="z">zero</button></div>'; js = 'var t0=0,acc=0,on=0;function f(){var ms=acc+(on?Date.now()-t0:0),s=ms/1000;t.textContent=String(Math.floor(s/60)).padStart(2,"0")+":"+(s%60).toFixed(1).padStart(4,"0");requestAnimationFrame(f)}g.onclick=function(){if(on){acc+=Date.now()-t0;on=0}else{t0=Date.now();on=1}};z.onclick=function(){acc=0;t0=Date.now()};f();'; }
    else if (/kalkul|calc/.test(p)) { body = '<input id="e" placeholder="np. 12*7+3" style="width:240px"> <button id="c">=</button><div id="o" style="font-size:40px"></div>'; js = 'c.onclick=function(){var v=e.value;if(/^[\\d+\\-*/().,\\s]+$/.test(v)){try{o.textContent=Function("return ("+v.replace(/,/g,".")+")")()}catch(x){o.textContent="błąd"}}else o.textContent="tylko liczby i + - * /"};'; }
    else if (/bpm|tap|metronom/.test(p)) { body = '<button id="b" style="font-size:40px;padding:40px">TAP</button><div id="o" style="font-size:40px">— BPM</div>'; js = 'var T=[];b.onclick=function(){var n=performance.now();T=T.filter(function(x){return n-x<3000});T.push(n);if(T.length>1)o.textContent=Math.round(60000*(T.length-1)/(n-T[0]))+" BPM"};'; }
    else { body = '<p>Notatki — zapisują się w przeglądarce.</p><textarea id="x" rows="10" cols="34" style="border-radius:12px;padding:10px"></textarea>'; js = 'x.value=localStorage.x||"";x.oninput=function(){localStorage.x=x.value};'; }
    return '<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>' + css + '</style></head><body><h1>' + esc(title) + '</h1>' + body + '<small>zrobione w D DJ · D Builder</small><script>var LS;try{LS=window.localStorage;LS.getItem("x")}catch(e){LS={}}' + js.replace(/localStorage/g, 'LS') + '<\/script></body></html>';
  }
  var CRC = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) { // stored (no compression) zip
    var enc = new TextEncoder(), parts = [], cd = [], off = 0;
    files.forEach(function (f) { var name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cd.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length; });
    var cdl = cd.reduce(function (s, x) { return s + x.length; }, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdl, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(cd, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }
  function download(blob, name) { var a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500); }

  // ---------- 5. TikTok drafts (copy only) ----------
  function tiktok(topic, comment) {
    topic = String(topic || 'nowy set').trim(); var tag = '#' + topic.replace(/[^\wąćęłńóśźż]+/gi, '').toLowerCase();
    var caps = ['🎧 ' + topic + ' — głośniej! ' + tag + ' #djset #techno #fyp', 'Tak brzmi ' + topic + ' na żywo z MC-707 🔊 ' + tag + ' #roland #mc707', 'POV: bas wchodzi w ' + topic + ' 🛸 ' + tag + ' #dj #housemusic', topic + ' · 124 BPM · zostań do dropu 👽 ' + tag + ' #electronicmusic'];
    var c = String(comment || '').toLowerCase(), reps;
    if (/track|id|nazwa|co to/.test(c)) reps = ['Track ID w opisie profilu 🔗 dzięki za ucho!', 'To mój własny edit — pełna wersja wkrótce 👀'];
    else if (/kiedy|gdzie|live|graj/.test(c)) reps = ['Następny live wkrótce — obserwuj, dam znać 🔔', 'Gram na żywo w weekend, szczegóły w bio ✨'];
    else if (/słab|chujow|nudn|bad/.test(c)) reps = ['Dzięki za szczerość — następny set będzie mocniejszy 💪', 'Każdy ma swój vibe 🙂 sprawdź inny set na profilu'];
    else reps = ['Dzięki wielkie! 🙌 Co zagrać następnym razem?', 'Mega, że się podoba! 🔥 Wpadaj na live', 'Doceniam! 🖤 Podeślij swój ulubiony kawałek'];
    return { captions: caps, replies: reps };
  }

  // ---------- panel ----------
  var CSS = '.d54{position:fixed;inset:4vh 4vw;z-index:2147483000;background:#0d0a22f2;border:1px solid #7b2cff;border-radius:18px;color:#eee;font:14px system-ui;display:flex;flex-direction:column;box-shadow:0 0 40px #7b2cff88}' +
    '.d54[hidden]{display:none}.d54 header{display:flex;gap:6px;padding:10px;flex-wrap:wrap;border-bottom:1px solid #3b2a7a}.d54 header b{margin-right:auto;font-size:16px}.d54 button,.d54 input,.d54 textarea,.d54 select{font:inherit;padding:7px 11px;border-radius:10px;border:1px solid #5a3fb0;background:#1a1240;color:#fff}' +
    '.d54 .on{background:#7b2cff}.d54 section{padding:12px;overflow:auto;flex:1}.d54 .row{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}.d54 .out{white-space:pre-wrap;background:#0006;border-radius:10px;padding:8px;margin:6px 0;min-height:24px}.d54 iframe{width:100%;height:46vh;border:1px solid #5a3fb0;border-radius:12px;background:#fff}.d54 .drop{border:2px dashed #7b2cff;border-radius:14px;padding:22px;text-align:center}.d54 .cp{cursor:pointer}' +
    '.d54-fab{position:fixed;left:14px;bottom:92px;z-index:2147482000;border-radius:50%;width:48px;height:48px;border:1px solid #7b2cff;background:#1a1240;color:#fff;font-size:22px;box-shadow:0 0 14px #7b2cff}';
  var TABS = [['learn', '🧠 Ucz się'], ['web', '🌐 Web'], ['build', '🛠 D Builder'], ['msg', '💬 Messenger'], ['tt', '🎵 TikTok']];
  var P = null;
  function panel() {
    if (P) return P;
    var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    P = doc.createElement('div'); P.className = 'd54'; P.hidden = true; P.id = 'd54';
    P.innerHTML = '<header><b>🧰 Narzędzia D · D DJ</b>' + TABS.map(function (t) { return '<button type="button" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '<button type="button" class="d54-x" title="Zamknij">✕</button></header>' +
      '<section data-p="learn"><div class="drop" tabindex="0">Upuść tu obrazy 🖼 albo audio 🎧 (lub kliknij) — rozpoznam na urządzeniu i zapiszę do wspólnej pamięci botów<input type="file" multiple accept="image/*,audio/*" hidden></div><div class="out d54-lo"></div><div class="row"><button type="button" class="d54-mem">📒 Pokaż pamięć botów</button></div><div class="out d54-mo"></div></section>' +
      '<section data-p="web" hidden><div class="row"><input class="d54-q" placeholder="Czego mam się nauczyć? np. Roland MC-707" style="flex:1"><select class="d54-lang"><option>pl</option><option>en</option></select><button type="button" class="d54-go">🔎 Naucz się</button></div><div class="out d54-wo"></div><div class="d54-nl"></div></section>' +
      '<section data-p="build" hidden><div class="row"><input class="d54-bp" placeholder="np. zrób apkę licznik / lista zakupów / stoper / kalkulator / tap bpm" style="flex:1"><button type="button" class="d54-bg">⚡ Generuj</button><button type="button" class="d54-bz">⬇ ZIP</button></div><iframe class="d54-fr" sandbox="allow-scripts" title="Podgląd"></iframe></section>' +
      '<section data-p="msg" hidden><p>Status połączenia z botem Messengera (fb-messenger-bot). <b>Bez automatycznego publikowania</b> — tylko podgląd statusu.</p><div class="row"><input class="d54-mu" style="flex:1"><button type="button" class="d54-mc">🔌 Sprawdź</button></div><div class="out d54-ms">—</div><div class="row"><input class="d54-tok" type="password" placeholder="Page access token (zapisany tylko lokalnie)" style="flex:1"><button type="button" class="d54-ts">💾 Zapisz</button><button type="button" class="d54-tc">🗑 Usuń</button></div><div class="out d54-tm"></div></section>' +
      '<section data-p="tt" hidden><p>Tylko szkice do skopiowania — nic nie publikuję automatycznie.</p><div class="row"><input class="d54-tt" placeholder="Temat filmu, np. minimal techno set" style="flex:1"></div><div class="row"><input class="d54-tcm" placeholder="Komentarz widza (opcjonalnie)" style="flex:1"><button type="button" class="d54-tg">✍ Szkice</button></div><div class="d54-to"></div></section>';
    doc.body.appendChild(P);
    function tab(n) { P.querySelectorAll('section').forEach(function (s) { s.hidden = s.dataset.p !== n; }); P.querySelectorAll('header [data-t]').forEach(function (b) { b.classList.toggle('on', b.dataset.t === n); }); }
    P.querySelectorAll('header [data-t]').forEach(function (b) { b.onclick = function () { tab(b.dataset.t); }; }); tab('learn');
    $('.d54-x', P).onclick = function () { P.hidden = true; };
    // learn
    var drop = $('.drop', P), fin = $('input[type=file]', P), lo = $('.d54-lo', P); function ls(t) { lo.textContent = t; }
    function files(fl) { Array.prototype.reduce.call(fl, function (pr, f) { return pr.then(function () { return (/^image\//.test(f.type) ? learnImage(f, ls) : /^audio\//.test(f.type) ? learnAudio(f, ls) : Promise.resolve(ls('⚠ ' + f.name + ': tylko obrazy i audio'))).catch(function () {}); }); }, Promise.resolve()); }
    drop.onclick = function () { fin.click(); }; fin.onchange = function () { files(fin.files); fin.value = ''; };
    drop.ondragover = function (e) { e.preventDefault(); drop.style.background = '#7b2cff33'; }; drop.ondragleave = function () { drop.style.background = ''; };
    drop.ondrop = function (e) { e.preventDefault(); drop.style.background = ''; files(e.dataTransfer.files); };
    $('.d54-mem', P).onclick = function () { var a = []; try { a = global.DBotV52.mem.all(); } catch (_) {} $('.d54-mo', P).textContent = a.slice(-15).reverse().map(function (m) { return '• [' + m.kind + '] ' + m.text; }).join('\n') || '(pusto)'; };
    // web
    function drawNotes() { $('.d54-nl', P).innerHTML = notes().slice(-8).reverse().map(function (n) { return '<div class="out"><b>' + esc(n.title) + '</b> <small>(' + esc(n.src) + ')</small><br>' + esc(n.text.slice(0, 300)) + (n.url ? ' <a href="' + esc(n.url) + '" target="_blank" rel="noopener">źródło</a>' : '') + '</div>'; }).join(''); }
    $('.d54-go', P).onclick = function () { var o = $('.d54-wo', P); o.textContent = '⏳ Szukam…'; webLearn($('.d54-q', P).value, $('.d54-lang', P).value).then(function (n) { o.textContent = '✅ Nauczyłem się: ' + n.title + ' (' + n.src + ') — zapisane w notatkach i pamięci botów'; drawNotes(); }).catch(function (e) { o.textContent = '⚠ ' + (e && e.message || e) + ' (brak internetu?)'; }); };
    drawNotes();
    // build
    var last = '';
    $('.d54-bg', P).onclick = function () { last = appHtml($('.d54-bp', P).value || 'licznik'); $('.d54-fr', P).srcdoc = last; mem('build', 'D Builder: ' + ($('.d54-bp', P).value || 'licznik')); };
    $('.d54-bz', P).onclick = function () { if (!last) $('.d54-bg', P).click(); download(zip([{ name: 'index.html', data: last }, { name: 'README.txt', data: 'Zrobione w D DJ · D Builder. Otwórz index.html w przeglądarce.' }]), 'd-builder-app.zip'); };
    // messenger
    var mu = $('.d54-mu', P); mu.value = localStorage.getItem('dbot.fbBotUrl') || 'http://127.0.0.1:8095/health';
    $('.d54-mc', P).onclick = function () { var u = mu.value.trim(), o = $('.d54-ms', P); try { localStorage.setItem('dbot.fbBotUrl', u); } catch (_) {} o.textContent = '⏳ …';
      var to = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 5000); });
      Promise.race([fetch(u, { cache: 'no-store' }).then(function (r) { return r.text().then(function (t) { o.textContent = (r.ok ? '🟢 połączony' : '🟠 HTTP ' + r.status) + '\n' + t.slice(0, 400); }); }), to])
        .catch(function () { return Promise.race([fetch(u, { mode: 'no-cors', cache: 'no-store' }), to]).then(function () { o.textContent = '🟡 serwer odpowiada (szczegóły ukryte przez CORS)'; }).catch(function (e) { o.textContent = '🔴 brak połączenia z ' + u + ' (' + (e && e.message || e) + ') — uruchom fb-messenger-bot (run.sh)'; }); }); };
    function tokMsg() { var t = localStorage.getItem('dbot.fbPageToken'); $('.d54-tm', P).textContent = t ? '🔐 Token zapisany lokalnie (…' + t.slice(-4) + '). Nie wysyłam go nigdzie automatycznie.' : 'Brak tokenu.'; }
    $('.d54-ts', P).onclick = function () { var v = $('.d54-tok', P).value.trim(); if (!v) { $('.d54-tm', P).textContent = '⚠ Wpisz token'; return; } try { localStorage.setItem('dbot.fbPageToken', v); } catch (_) {} $('.d54-tok', P).value = ''; tokMsg(); };
    $('.d54-tc', P).onclick = function () { try { localStorage.removeItem('dbot.fbPageToken'); } catch (_) {} tokMsg(); }; tokMsg();
    // tiktok
    $('.d54-tg', P).onclick = function () { var r = tiktok($('.d54-tt', P).value, $('.d54-tcm', P).value);
      $('.d54-to', P).innerHTML = '<h4>Opisy</h4>' + r.captions.map(function (c) { return '<div class="out cp" title="Kliknij, by skopiować">' + esc(c) + '</div>'; }).join('') + '<h4>Odpowiedzi</h4>' + r.replies.map(function (c) { return '<div class="out cp" title="Kliknij, by skopiować">' + esc(c) + '</div>'; }).join('');
      $('.d54-to', P).querySelectorAll('.cp').forEach(function (d) { d.onclick = function () { try { navigator.clipboard.writeText(d.textContent); } catch (_) {} d.style.borderLeft = '4px solid #5cf0ff'; }; }); };
    return P;
  }
  function open(t) { var p = panel(); p.hidden = false; if (t) { var b = p.querySelector('header [data-t="' + t + '"]'); if (b) b.click(); } return p; }
  function fab() { if ($('.d54-fab')) return; var b = doc.createElement('button'); b.type = 'button'; b.className = 'd54-fab'; b.title = 'Narzędzia D: ucz się, web, D Builder, Messenger, TikTok'; b.textContent = '🧰'; b.onclick = function () { var p = panel(); p.hidden = !p.hidden; }; doc.body.appendChild(b); panel(); }

  // chat commands: „naucz się X” / „wiki X” / „narzędzia” / „tiktok …”
  function hookChat() {
    var S = global.D7Super; if (!S || S.__v54) return !!(S && S.__v54); S.__v54 = true; var h0 = S.handle;
    S.handle = function (text) { var t = String(text || ''), m, C = global.D7Chat;
      function out(pr) { if (!C || !C.add) return false; C.add('user', t); Promise.resolve(pr).then(function (r) { C.add('bot', r); }); return true; }
      if (/^(narzędzia|narzedzia|multitool|tools)\b/i.test(t)) { open(); return out('🧰 Otwieram Narzędzia D: ucz się z obrazów i audio, web, D Builder, Messenger, TikTok.'); }
      if ((m = t.match(/^(?:naucz się z sieci|naucz sie z sieci|wiki|sprawdź w sieci|sprawdz w sieci|poszukaj)\s+(.+)/i))) return out(webLearn(m[1]).then(function (n) { return '🌐 Nauczyłem się (' + n.src + '): ' + n.title + ' — ' + n.text.slice(0, 300); }, function (e) { return '⚠ Nie dałem rady: ' + (e && e.message || e); }));
      if (/tiktok/i.test(t)) { var r = tiktok(t.replace(/.*tiktok\w*\s*/i, '') || 'nowy set'); open('tt'); return out('🎵 Szkice TikTok (do skopiowania):\n' + r.captions.slice(0, 2).join('\n')); }
      return h0.apply(this, arguments); };
    return true;
  }
  function boot() { fab(); if (!hookChat()) { var n = 0, iv = setInterval(function () { if (hookChat() || ++n > 40) clearInterval(iv); }, 500); } }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
  global.DBotV54 = { version: '54', open: open, learnImage: learnImage, learnAudio: learnAudio, analyse: analyse, webLearn: webLearn, notes: notes, appHtml: appHtml, zip: zip, tiktok: tiktok };
})(window);
