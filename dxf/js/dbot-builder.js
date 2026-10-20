/*
 * D.bot v45 — „D Builder”: the second top-level bot. Builds apps and bots from a text / voice description.
 *  • AI (the user's own key, App Builder / Bot Builder agents' role prompts + their learning notes) → ONE single-file HTML/JS app
 *    or a bot script (JS / Python). Follow-up prompts edit the current app („zmień kolor na czerwony”, „dodaj licznik”).
 *  • Offline: template generator — DJ tools (BPM tapper + metronome), MIDI controller (pads/faders/CC), chatbot, visualizer.
 *  • Preview: APK → separate sandboxed WebView (PreviewActivity: no bridge, no files, own origin);
 *    browser → <iframe sandbox="allow-scripts"> (no same-origin). Library „My apps” in localStorage; export/share as a file.
 * window.DBuilder.
 */
(function (global) {
  'use strict';
  var LS_APPS = 'dbot-apps', LS_CHAT = 'dbot-builder-chat', MAX_APP = 400000;
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  function norm(s) { return String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function scrub(s) { return String(s).replace(/\b(xai-[A-Za-z0-9_-]{16,}|sk-(proj-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{20,})/g, 'YOUR_API_KEY').replace(/[A-Za-z0-9._%+-]+@gmail\.com/g, 'user@example.com'); }
  var apps = lsGet(LS_APPS, []), chat = lsGet(LS_CHAT, []), current = null, subs = [];
  if (apps.length) current = apps[0].id;
  function fire(ev) { subs.forEach(function (f) { try { f(ev); } catch (_) {} }); }
  function saveApps() { if (!lsSet(LS_APPS, apps)) { say('⚠ Pamięć „Moje aplikacje” pełna — usuń starsze aplikacje albo wyeksportuj je.'); } }
  function say(text, extra) { var m = Object.assign({ role: 'bot', text: text, at: new Date().toISOString() }, extra || {}); chat.push(m); chat = chat.slice(-60); lsSet(LS_CHAT, chat); fire({ type: 'msg', msg: m }); return m; }
  function user(text) { var m = { role: 'user', text: text, at: new Date().toISOString() }; chat.push(m); chat = chat.slice(-60); lsSet(LS_CHAT, chat); fire({ type: 'msg', msg: m }); }
  function byId(id) { return apps.filter(function (a) { return a.id === id; })[0]; }

  // ------------------------------------------------------------------ offline templates
  var COLORS = { czerwon: '#ff3b5c', red: '#ff3b5c', zielon: '#3dffa0', green: '#3dffa0', niebiesk: '#3da5ff', blue: '#3da5ff', fiolet: '#b26bff', purple: '#b26bff', violet: '#b26bff', rozow: '#ff4fd8', pink: '#ff4fd8', zolt: '#ffe23d', yellow: '#ffe23d', pomarancz: '#ff9b3d', orange: '#ff9b3d', cyan: '#2ef2ff', turkus: '#2ef2ff', bial: '#f5f7ff', white: '#f5f7ff' };
  function pickColor(n) { var c = null; Object.keys(COLORS).forEach(function (k) { if (n.indexOf(k) >= 0) c = COLORS[k]; }); return c; }
  function titleFrom(desc, fb) { var m = String(desc).match(/["„“']([^"”“']{2,40})["”“']/); if (m) return m[1]; var t = String(desc).replace(/^(zbuduj|zrob|stworz|napisz|build|make|create|write)\s+(mi\s+)?(an?\s+|the\s+)?/i, '').trim(); return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 40) || fb; }
  function shell(title, accent, body, css, js) {
    return '<!doctype html>\n<html lang="pl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + esc(title) + '</title>\n<!-- built by D Builder (D.bot v45) — single file, works offline -->\n<style>\n:root{--a:' + accent + ';--bg:#06070b;--fg:#eef1f8}\n*{box-sizing:border-box}body{margin:0;min-height:100vh;font:16px/1.4 system-ui,sans-serif;color:var(--fg);background:radial-gradient(1200px 600px at 20% -10%,color-mix(in srgb,var(--a) 22%,transparent),transparent),radial-gradient(900px 500px at 110% 110%,#7b2bff33,transparent),var(--bg)}\nh1{font-size:1.3rem;margin:0 0 12px;letter-spacing:.04em;text-shadow:0 0 18px var(--a)}\n.wrap{max-width:720px;margin:auto;padding:18px}\n.card{background:#ffffff0d;border:1px solid #ffffff1f;border-radius:18px;padding:16px;backdrop-filter:blur(12px);box-shadow:0 0 30px #0008}\nbutton{font:inherit;color:var(--fg);background:#ffffff12;border:1px solid var(--a);border-radius:12px;padding:10px 14px;cursor:pointer;transition:.2s}button:active{transform:scale(.96)}button.on{background:var(--a);color:#000}\ninput,select,textarea{font:inherit;color:var(--fg);background:#0008;border:1px solid #ffffff2a;border-radius:10px;padding:8px}\n' + (css || '') + '\n</style>\n</head>\n<body>\n<div class="wrap"><h1>' + esc(title) + '</h1>\n' + body + '\n</div>\n<script>\n' + js + '\n</script>\n</body>\n</html>\n';
  }
  var TPL = {
    dj: function (title, accent, bpm) {
      return shell(title, accent,
        '<div class="card"><div id="bpm" style="font-size:3.2rem;font-weight:800;text-align:center">' + bpm + '</div><div style="text-align:center;opacity:.7">BPM</div>\n<div style="display:flex;gap:8px;justify-content:center;margin:14px 0;flex-wrap:wrap"><button id="tap">TAP</button><button id="minus">−1</button><button id="plus">+1</button><button id="metro">▶ Metronom</button></div>\n<div id="beats" style="display:flex;gap:8px;justify-content:center"></div>\n<p style="opacity:.75;font-size:.9rem">Beat = ' + '<span id="ms"></span> ms · takt 4/4 · fraza 16 taktów = <span id="phr"></span> s</p></div>',
        '#beats i{width:26px;height:26px;border-radius:50%;background:#ffffff1a;display:block;transition:.08s}#beats i.hit{background:var(--a);box-shadow:0 0 18px var(--a)}',
        'var bpm=' + bpm + ',taps=[],timer=null,ac=null,beat=0;\nvar $=function(i){return document.getElementById(i)};\nfor(var i=0;i<4;i++)$("beats").appendChild(document.createElement("i"));\nfunction paint(){$("bpm").textContent=bpm.toFixed(1).replace(/\\.0$/,"");$("ms").textContent=Math.round(60000/bpm);$("phr").textContent=(16*4*60/bpm).toFixed(1)}\nfunction click(acc){if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();var o=ac.createOscillator(),g=ac.createGain();o.frequency.value=acc?1600:1000;g.gain.setValueAtTime(.3,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.05);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+.06)}\nfunction tick(){var b=beat%4;document.querySelectorAll("#beats i").forEach(function(e,k){e.classList.toggle("hit",k===b)});click(b===0);beat++}\nfunction restart(){if(timer){clearInterval(timer);timer=setInterval(tick,60000/bpm)}}\n$("tap").onclick=function(){var t=performance.now();taps=taps.filter(function(x){return t-x<3000});taps.push(t);if(taps.length>1){bpm=60000/((taps[taps.length-1]-taps[0])/(taps.length-1));paint();restart()}};\n$("minus").onclick=function(){bpm=Math.max(40,bpm-1);paint();restart()};$("plus").onclick=function(){bpm=Math.min(250,bpm+1);paint();restart()};\n$("metro").onclick=function(){if(timer){clearInterval(timer);timer=null;this.classList.remove("on");this.textContent="▶ Metronom"}else{beat=0;tick();timer=setInterval(tick,60000/bpm);this.classList.add("on");this.textContent="⏹ Stop"}};\npaint();');
    },
    midi: function (title, accent) {
      return shell(title, accent,
        '<div class="card"><p id="st" style="opacity:.8">Web MIDI: kliknij POŁĄCZ (Chrome / Edge na komputerze lub Android Chrome). W podglądzie D.bot MIDI jest odcięte (sandbox) — wyeksportuj plik i otwórz w Chrome.</p>\n<button id="con">🔌 POŁĄCZ</button> <select id="out"></select> kanał <select id="ch"></select>\n<div id="pads" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0"></div>\n<div id="faders"></div>\n<div style="display:flex;gap:8px;flex-wrap:wrap"><button data-rt="250">▶ START</button><button data-rt="252">⏹ STOP</button><button id="pc">Program Change</button><input id="pcn" type="number" min="1" max="128" value="1" style="width:70px"></div></div>',
        '#pads button{height:64px;font-weight:700}.f{display:flex;align-items:center;gap:10px;margin:6px 0}.f input{flex:1}',
        'var out=null,acc=null;var $=function(i){return document.getElementById(i)};\nfor(var c=1;c<=16;c++){var o=document.createElement("option");o.value=c-1;o.textContent=c;$("ch").appendChild(o)}\nfunction ch(){return +$("ch").value}\nfunction send(d){if(out)out.send(d)}\n[36,38,42,46,48,50,49,51,37,39,41,43,45,47,56,70].forEach(function(n,i){var b=document.createElement("button");b.textContent="PAD "+(i+1);b.onpointerdown=function(){send([0x90|ch(),n,110]);b.classList.add("on")};b.onpointerup=b.onpointerleave=function(){send([0x80|ch(),n,0]);b.classList.remove("on")};$("pads").appendChild(b)});\n[["FILTER CC80",80],["MOD CC81",81],["FX CC82",82],["VOLUME CC7",7]].forEach(function(f){var d=document.createElement("div");d.className="f";d.innerHTML="<span style=\\"width:110px\\">"+f[0]+"</span><input type=range min=0 max=127 value=64>";d.querySelector("input").oninput=function(){send([0xB0|ch(),f[1],+this.value])};$("faders").appendChild(d)});\ndocument.querySelectorAll("[data-rt]").forEach(function(b){b.onclick=function(){send([+b.dataset.rt])}});\n$("pc").onclick=function(){send([0xC0|ch(),(+$("pcn").value-1)&127])};\n$("con").onclick=function(){if(!navigator.requestMIDIAccess){$("st").textContent="Brak Web MIDI w tej przeglądarce.";return}navigator.requestMIDIAccess().then(function(a){acc=a;$("out").innerHTML="";a.outputs.forEach(function(p){var o=document.createElement("option");o.value=p.id;o.textContent=p.name;$("out").appendChild(o);if(/mc-?707|roland/i.test(p.name))o.selected=true});out=a.outputs.get($("out").value)||null;$("st").textContent=out?"OUT: "+out.name:"Brak wyjść MIDI"},function(e){$("st").textContent="MIDI: "+e.message})};\n$("out").onchange=function(){out=acc&&acc.outputs.get(this.value)};');
    },
    chatbot: function (title, accent) {
      return shell(title, accent,
        '<div class="card"><div id="log" style="height:52vh;overflow:auto;display:flex;flex-direction:column;gap:8px"></div>\n<form id="f" style="display:flex;gap:8px;margin-top:10px"><input id="q" style="flex:1" placeholder="Napisz…" autocomplete="off"><button>➤</button></form></div>',
        '.m{padding:8px 12px;border-radius:14px;max-width:85%}.u{align-self:flex-end;background:var(--a);color:#000}.b{align-self:flex-start;background:#ffffff14}',
        '// Rule-based offline bot. Add rules: [regex, reply]. For AI, call your own backend — never put API keys in this file.\nvar RULES=[[/^(hi|hej|siema|czesc|cześć|hello)/i,"Siema! Jestem botem zbudowanym w D Builder. Zapytaj o BPM, godzinę albo powiedz „pomoc”."],[/pomoc|help/i,"Umiem: godzina, data, BPM <liczba> → ms beatu, rzut kostką, żart."],[/godzin|time/i,function(){return "Jest "+new Date().toLocaleTimeString()}],[/data|date|dzis/i,function(){return "Dziś "+new Date().toLocaleDateString()}],[/bpm\\s*(\\d+)/i,function(m){return "Beat przy "+m[1]+" BPM = "+Math.round(60000/m[1])+" ms, takt = "+Math.round(240000/m[1])+" ms"}],[/kost|dice/i,function(){return "🎲 "+(1+Math.floor(Math.random()*6))}],[/zart|żart|joke/i,"Dlaczego DJ nie gra w chowanego? Bo zawsze go znajdą po basie. 🔊"]];\nvar $=function(i){return document.getElementById(i)};\nfunction add(t,c){var d=document.createElement("div");d.className="m "+c;d.textContent=t;$("log").appendChild(d);$("log").scrollTop=1e9}\nfunction reply(q){for(var i=0;i<RULES.length;i++){var m=q.match(RULES[i][0]);if(m)return typeof RULES[i][1]==="function"?RULES[i][1](m):RULES[i][1]}return "Nie wiem jeszcze — dopisz regułę w RULES."}\n$("f").onsubmit=function(e){e.preventDefault();var q=$("q").value.trim();if(!q)return;add(q,"u");$("q").value="";setTimeout(function(){add(reply(q),"b")},250)};\nadd(reply("hej"),"b");');
    },
    visualizer: function (title, accent) {
      return shell(title, accent,
        '<div class="card"><canvas id="c" style="width:100%;height:55vh;border-radius:14px;background:#000"></canvas>\n<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button id="mic">🎤 Mikrofon</button><button id="demo">🎵 Demo beat</button><select id="mode"><option>bars</option><option>circle</option><option>stars</option></select></div></div>',
        '',
        'var ac,an,data,cv=document.getElementById("c"),g=cv.getContext("2d"),t=0,stars=[];for(var i=0;i<200;i++)stars.push([Math.random()*2-1,Math.random()*2-1,Math.random()]);\nvar A=getComputedStyle(document.documentElement).getPropertyValue("--a").trim();\nfunction ctx(){if(!ac){ac=new (window.AudioContext||window.webkitAudioContext)();an=ac.createAnalyser();an.fftSize=256;data=new Uint8Array(an.frequencyBinCount)}return ac}\ndocument.getElementById("mic").onclick=function(){ctx();navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){ac.createMediaStreamSource(s).connect(an)}).catch(function(e){alert("Mikrofon: "+e.message)})};\ndocument.getElementById("demo").onclick=function(){ctx();var bpm=128,next=ac.currentTime;setInterval(function(){while(next<ac.currentTime+.2){var o=ac.createOscillator(),g2=ac.createGain();o.frequency.setValueAtTime(140,next);o.frequency.exponentialRampToValueAtTime(40,next+.15);g2.gain.setValueAtTime(1,next);g2.gain.exponentialRampToValueAtTime(.001,next+.2);o.connect(g2);g2.connect(an);an.connect(ac.destination);o.start(next);o.stop(next+.21);next+=60/bpm}},50)};\nfunction draw(){requestAnimationFrame(draw);var w=cv.width=cv.clientWidth*devicePixelRatio,h=cv.height=cv.clientHeight*devicePixelRatio;g.fillStyle="#0003";g.fillRect(0,0,w,h);t+=.01;if(an)an.getByteFrequencyData(data);var n=data?data.length:64,lvl=0;for(var i=0;i<n;i++)lvl+=data?data[i]:0;lvl=lvl/(n*255)||(.2+.1*Math.sin(t*4));var m=document.getElementById("mode").value;g.fillStyle=A;g.strokeStyle=A;g.shadowColor=A;g.shadowBlur=20;\nif(m==="bars"){for(var i=0;i<n;i++){var v=(data?data[i]/255:Math.abs(Math.sin(t*3+i/5)))*h*.9;g.fillRect(i*w/n,h-v,w/n-2,v)}}\nelse if(m==="circle"){g.beginPath();for(var i=0;i<=n;i++){var a=i/n*Math.PI*2,v=(data?data[i%n]/255:.5)*h*.25+h*.15;g.lineTo(w/2+Math.cos(a+t)*v,h/2+Math.sin(a+t)*v)}g.lineWidth=3;g.stroke()}\nelse{stars.forEach(function(s){s[2]-=.004+lvl*.05;if(s[2]<=0){s[0]=Math.random()*2-1;s[1]=Math.random()*2-1;s[2]=1}var x=w/2+s[0]/s[2]*w*.3,y=h/2+s[1]/s[2]*h*.3;g.fillRect(x,y,3*(1-s[2])+1,3*(1-s[2])+1)})}}\ndraw();');
    },
    botNode: function (title) {
      return '// ' + title + ' — Node.js bot template built by D Builder (D.bot v45)\n// Run: node bot.js   ·   Secrets ONLY from environment variables, never in this file.\n//   export XAI_API_KEY=...   (optional: smart replies via xAI Grok)\nconst readline = require("readline");\nconst KEY = process.env.XAI_API_KEY || "";\nconst RULES = [[/^(hi|hej|siema)/i, "Siema! Tu ' + title.replace(/"/g, '') + '."], [/bpm\\s*(\\d+)/i, (m) => `Beat = ${Math.round(60000 / m[1])} ms`]];\nasync function ai(text) {\n  if (!KEY) return null;\n  const r = await fetch("https://api.x.ai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },\n    body: JSON.stringify({ model: "grok-4.7", messages: [{ role: "system", content: "You are a concise helpful bot." }, { role: "user", content: text }] }) });\n  const j = await r.json(); return j.choices?.[0]?.message?.content || null;\n}\nasync function reply(text) {\n  for (const [re, out] of RULES) { const m = text.match(re); if (m) return typeof out === "function" ? out(m) : out; }\n  return (await ai(text)) || "Nie wiem jeszcze — dopisz regułę albo ustaw XAI_API_KEY.";\n}\nconst rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });\nrl.prompt(); rl.on("line", async (l) => { console.log(await reply(l.trim())); rl.prompt(); });\n';
    }
  };
  function offlineKind(n, kind) {
    if (kind === 'bot' && /\b(node|discord|telegram|serwer|server|cli|terminal|script|skrypt)\b/.test(n)) return 'botNode';
    if (/\b(midi|mc-?707|pad|kontroler|controller|fader|cc)\b/.test(n)) return 'midi';
    if (/\b(wizualiz|visuali|spectrum|spektrum|milkdrop|stars|gwiazd)\w*/.test(n)) return 'visualizer';
    if (/\b(bot|chat|czat|asystent|assistant)\w*/.test(n) || kind === 'bot') return 'chatbot';
    return 'dj';
  }
  function offlineBuild(desc, kind) {
    var n = norm(desc), k = offlineKind(n, kind), accent = pickColor(n) || { dj: '#2ef2ff', midi: '#ff4fd8', chatbot: '#3dffa0', visualizer: '#b26bff', botNode: '#2ef2ff' }[k];
    var bpm = +((n.match(/(\d{2,3})\s*bpm/) || [])[1]) || 128;
    var title = titleFrom(desc, { dj: 'DJ Tool', midi: 'MIDI Controller', chatbot: 'Chatbot', visualizer: 'Visualizer', botNode: 'Bot' }[k]);
    var code = k === 'botNode' ? TPL.botNode(title) : TPL[k](title, accent, bpm);
    return { name: title, kind: k === 'botNode' || k === 'chatbot' ? 'bot' : 'app', lang: k === 'botNode' ? 'js' : 'html', code: code, template: k };
  }
  function offlineEdit(app, req) {
    var n = norm(req), c = pickColor(n), done = [];
    if (c && app.lang === 'html') { app.code = app.code.replace(/--a:[^;]+;/, '--a:' + c + ';'); done.push('kolor → ' + c); }
    var t = String(req).match(/(?:tytul|tytuł|title|nazw\w*)\s*(?:na|to|:)?\s*["„“']?([^"”“']{2,40})/i);
    if (t && app.lang === 'html') { var nt = t[1].trim(); app.code = app.code.replace(/<title>[^<]*<\/title>/, '<title>' + esc(nt) + '</title>').replace(/<h1>[^<]*<\/h1>/, '<h1>' + esc(nt) + '</h1>'); app.name = nt; done.push('tytuł → ' + nt); }
    var b = n.match(/(\d{2,3})\s*bpm/); if (b && /var bpm=\d+/.test(app.code)) { app.code = app.code.replace(/var bpm=\d+(\.\d+)?/, 'var bpm=' + b[1]).replace(/(<div id="bpm"[^>]*>)\d+/, '$1' + b[1]); done.push('BPM → ' + b[1]); }
    return done;
  }

  // ------------------------------------------------------------------ AI build / edit
  function agent(kind) { var A = global.DBotAgents; return A && A.byId(kind === 'bot' ? 'botbuilder' : 'appbuilder'); }
  function provider(kind) { var BRb = global.DBotBrains && global.DBotBrains.pick('builder'); if (BRb) return BRb; var A = global.DBotAgents, a = agent(kind); return A && a && a.enabled ? A.providerFor(a) : (global.D7Super && global.D7Super.aiOn() ? global.D7Super.usableList()[0] : null); }
  function extract(text, want) {
    var m = String(text).match(/```(?:html|htm|javascript|js|python|py|typescript|ts)?\s*\n([\s\S]*?)```/i);
    var code = m ? m[1] : String(text);
    if (want === 'html' && !/<(html|body|script|div|canvas)/i.test(code)) return null;
    return scrub(code.trim()) + '\n';
  }
  function kindOf(n) { return /\b(bot|chatbot|agent|asystent|assistant|discord|telegram)\b/.test(n) ? 'bot' : 'app'; }
  function langOf(n) { return /\b(python|py)\b/.test(n) ? 'py' : /\b(node|node\.js|discord|telegram|cli|terminal)\b/.test(n) ? 'js' : 'html'; }

  function build(desc, opts) {
    opts = opts || {};
    var n = norm(desc), kind = opts.kind || kindOf(n), lang = opts.lang || langOf(n), p = provider(kind), A = global.DBotAgents, ag = agent(kind);
    var base = opts.edit ? byId(opts.edit) : null;
    if (!p) {
      if (base) {
        var done = offlineEdit(base, desc);
        if (done.length) { base.updated = new Date().toISOString(); base.history = (base.history || []).concat([desc]).slice(-20); saveApps(); fire({ type: 'apps' }); return Promise.resolve({ app: base, text: '✏ Offline zmieniłem: ' + done.join(', ') + '. Większe zmiany wymagają klucza AI (⚙).' }); }
        return Promise.resolve({ app: base, text: '✏ Offline umiem zmienić kolor, tytuł i BPM. Do dowolnych zmian dodaj klucz AI (⚙ w czacie D Bot → xAI Grok / Gemini / OpenAI).' });
      }
      var o = offlineBuild(desc, kind);
      return Promise.resolve({ app: store(o, desc), text: '🧩 Zbudowałem offline z szablonu „' + o.template + '”: ' + o.name + '. Podgląd ▶, eksport ⇪. Z kluczem AI zbuduję dowolną aplikację według opisu.' });
    }
    var sys = (A && ag ? A.rolePrompt(ag) : '') + '\nOutput format: ONLY one fenced code block (```' + (lang === 'py' ? 'python' : lang === 'js' ? 'javascript' : 'html') + ') with the COMPLETE file, then at most 2 short sentences. ' +
      (lang === 'html' ? 'Single self-contained HTML file: inline CSS and JS, no external scripts/fonts/CDNs, no network calls, no localStorage keys of other apps, must work offline in a sandboxed WebView on a phone.' : 'Secrets only from environment variables. Include run instructions as comments at the top.');
    var userMsg = base ? 'Here is the current file:\n```\n' + base.code.slice(0, 120000) + '\n```\nApply this change and return the full updated file: ' + desc : 'Build: ' + desc;
    var local = p === 'local';
    if (local) { // v46: the free on-device model gets a short prompt and small apps (slow phone CPU) — template fallback below
      if (base && base.code.length > 7000) { var dn = offlineEdit(base, desc); if (dn.length) { base.updated = new Date().toISOString(); saveApps(); fire({ type: 'apps' }); } return Promise.resolve({ app: base, text: dn.length ? '✏ Zmieniłem: ' + dn.join(', ') : '✏ Ten plik jest za duży dla darmowego mózgu na telefonie — do dużych zmian dodaj klucz Grok (⚙).' }); }
      sys = lang === 'html' ? 'You write small, complete, working single-file HTML apps for a phone: inline CSS and JavaScript, no external files, no network, dark neon style, under 90 lines. Output ONLY one ```html code block.' : 'You write small, complete, working ' + (lang === 'py' ? 'Python' : 'JavaScript (Node)') + ' bot scripts under 80 lines; API keys from environment variables. Output ONLY one fenced code block.';
    }
    say('… D Builder (' + (ag ? ag.name : kind) + ' · ' + (local ? '🧠 darmowy mózg na telefonie — to może potrwać 1–3 min' : p) + ') pracuje nad: „' + String(desc).slice(0, 80) + '”', { typing: true });
    return global.D7Super.askRaw(p, sys, userMsg, { model: ag && ag.model || undefined, maxTokens: local ? 900 : undefined }).then(function (r) {
      if (!r.ok) {
        if (base) return { app: base, text: '⚠ AI: ' + r.text };
        var o2 = offlineBuild(desc, kind);
        return { app: store(o2, desc), text: '⚠ AI: ' + r.text + '\n→ zbudowałem offline z szablonu „' + o2.template + '”.' };
      }
      var code = extract(r.text, lang);
      if (!code && local && !base) { var o3 = offlineBuild(desc, kind); return { app: store(o3, desc), text: '🧠 Darmowy mózg nie dał rady z tym opisem → zbudowałem z szablonu „' + o3.template + '”: ' + o3.name + '.' }; }
      if (!code) return { app: base, text: '⚠ AI nie zwróciło poprawnego pliku — spróbuj opisać inaczej.\n' + r.text.slice(0, 300) };
      var note = r.text.replace(/```[\s\S]*?```/g, '').trim().slice(0, 300);
      if (base) { base.code = code; base.updated = new Date().toISOString(); base.history = (base.history || []).concat([desc]).slice(-20); saveApps(); fire({ type: 'apps' }); if (global.DBotAgents) global.DBotAgents.log.add('D Builder', 'edit ' + base.name, desc); return { app: base, text: '✏ Zaktualizowane: ' + base.name + (note ? '\n' + note : '') }; }
      var nm = (code.match(/<title>([^<]{1,60})<\/title>/i) || [])[1] || titleFrom(desc, kind === 'bot' ? 'Bot' : 'App');
      var app = store({ name: nm, kind: kind, lang: lang, code: code, template: 'ai:' + p }, desc);
      if (global.DBotAgents) global.DBotAgents.log.add('D Builder', 'build ' + nm, p);
      return { app: app, text: '🧩 Gotowe: ' + nm + ' (' + lang + ', ' + Math.round(code.length / 1024) + ' KB, AI ' + p + ').' + (note ? '\n' + note : '') + '\nPodgląd ▶ · eksport ⇪ · dopisz zmiany w czacie.' };
    });
  }
  function store(o, desc) {
    if (o.code.length > MAX_APP) o.code = o.code.slice(0, MAX_APP);
    var app = { id: 'a' + Date.now(), name: o.name, kind: o.kind, lang: o.lang, code: o.code, template: o.template, created: new Date().toISOString(), updated: new Date().toISOString(), history: [desc] };
    apps.unshift(app); apps = apps.slice(0, 40); current = app.id; if (global.DBotState) global.DBotState.set('ui.builderApp', app.id); saveApps(); fire({ type: 'apps' });
    return app;
  }

  // ------------------------------------------------------------------ preview / export
  function N() { return global.DBotNative; }
  function previewHtml(app) {
    if (app.lang === 'html') return app.code;
    return '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><body style="background:#06070b;color:#eef1f8;font:14px monospace;padding:14px"><h3 style="font-family:system-ui">' + esc(app.name) + ' (' + app.lang + ')</h3><p style="font-family:system-ui;opacity:.7">Skrypt bota — uruchom na komputerze/serwerze (instrukcja w komentarzu). Podgląd kodu:</p><pre style="white-space:pre-wrap">' + esc(app.code) + '</pre>';
  }
  function preview(id) {
    var app = byId(id || current); if (!app) return false;
    if (N() && N().has() && N().call('preview', previewHtml(app))) return true;
    var ov = document.getElementById('dbb-preview'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'dbb-preview'; ov.className = 'dbb-preview';
    ov.innerHTML = '<div class="dbb-pbar"><b>▶ ' + esc(app.name) + '</b><span>sandbox</span><button type="button" aria-label="Zamknij">✕</button></div>';
    var f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals'); f.setAttribute('referrerpolicy', 'no-referrer'); f.srcdoc = previewHtml(app);
    ov.appendChild(f); document.body.appendChild(ov);
    ov.querySelector('button').onclick = function () { ov.remove(); };
    return true;
  }
  function fileName(app) { return (app.name || 'app').replace(/[^A-Za-z0-9 ._()-]+/g, '_').trim().slice(0, 50) + '.' + app.lang; }
  function exportApp(id) {
    var app = byId(id || current); if (!app) return false;
    if (N() && N().has() && N().call('share', fileName(app), app.code)) return true;
    try {
      var blob = new Blob([app.code], { type: app.lang === 'html' ? 'text/html' : 'text/plain' });
      if (navigator.canShare && global.File) { var file = new File([blob], fileName(app), { type: blob.type }); if (navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: app.name }).catch(function () {}); return true; } }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName(app); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      return true;
    } catch (e) { return false; }
  }
  function removeApp(id) { apps = apps.filter(function (a) { return a.id !== id; }); if (current === id) current = apps[0] && apps[0].id; saveApps(); fire({ type: 'apps' }); }

  // ------------------------------------------------------------------ chat entry
  function ask(text) {
    text = String(text || '').trim(); if (!text) return Promise.resolve(null);
    user(text);
    var n = norm(text);
    if (/^(pomoc|help)$/.test(n)) { say('🧩 D Builder buduje aplikacje i boty. Napisz albo powiedz np.:\n• „zbuduj tapper BPM 128 w kolorze różowym”\n• „kontroler MIDI do MC-707 z padami”\n• „wizualizator gwiazd do muzyki”\n• „chatbot z odpowiedziami o moich imprezach”\n• „bot telegram w node”\nPotem: „zmień kolor na zielony”, „dodaj przycisk reset”… · „nowa” = nowa aplikacja · ▶ podgląd · ⇪ eksport.\nOffline: szablony (DJ, MIDI, chatbot, wizualizator); z kluczem AI (⚙ w D Bot) — dowolna aplikacja.'); return Promise.resolve(null); }
    if (/^(lista|moje aplikacje|my apps|apps)$/.test(n)) { say(apps.length ? apps.map(function (a, i) { return (i + 1) + '. ' + a.name + ' (' + a.lang + ')'; }).join('\n') : 'Brak aplikacji — opisz pierwszą.'); return Promise.resolve(null); }
    if (/^(podglad|preview|uruchom|run)$/.test(n)) { preview(); return Promise.resolve(null); }
    if (/^(eksport|export|udostepnij|share|zapisz plik)$/.test(n)) { exportApp(); return Promise.resolve(null); }
    var isNew = /^(nowa|nowy|new)\b/.test(n) || /^(zbuduj|zrob|stworz|napisz|build|make|create|write)\b/.test(n) || !current;
    var editId = !isNew && current && /^(zmien|dodaj|usun|popraw|napraw|niech|zrob zeby|make it|change|add|remove|fix|edit)\b/.test(n) ? current : null;
    if (!isNew && !editId) isNew = true;
    return build(text.replace(/^(nowa|nowy|new)\s*:?\s*/i, ''), { edit: editId }).then(function (res) {
      chat = chat.filter(function (m) { return !m.typing; }); lsSet(LS_CHAT, chat);
      if (res && res.app) current = res.app.id;
      say(res ? res.text : '—', { app: res && res.app && res.app.id });
      return res;
    });
  }
  function fromAgent(text, kind) { if (global.DBotCenter) global.DBotCenter.open('builder'); ask(text); return '→ przekazane do D Builder (zakładka „D Builder”): ' + String(text).slice(0, 80); }

  global.DBuilder = {
    ask: ask, build: build, preview: preview, exportApp: exportApp, remove: removeApp, apps: function () { return apps; }, chat: function () { return chat; },
    current: function () { return byId(current); }, select: function (id) { if (byId(id)) { current = id; if (global.DBotState) global.DBotState.set('ui.builderApp', id); fire({ type: 'apps' }); } }, on: function (f) { subs.push(f); },
    fromAgent: fromAgent, offlineBuild: offlineBuild, offlineEdit: offlineEdit, extract: extract, templates: Object.keys(TPL), say: say, clearChat: function () { chat = []; lsSet(LS_CHAT, chat); fire({ type: 'clear' }); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
