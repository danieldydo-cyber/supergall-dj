
(function () {
  var log = document.getElementById('log'), q = document.getElementById('q'), T = window.DBotTeam;
  function add(who, text, nosave) { var d = document.createElement('div'); d.className = 'm ' + who; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; if (!nosave) { var L = ls('log') || []; L.push([who, text]); ls('log', L.slice(-30)); } return d; }
  function limits() {
    var now = Date.now(), day = new Date().toISOString().slice(0, 10), s;
    try { s = JSON.parse(localStorage.getItem('dbot.public.rl') || '{}'); } catch (_) { s = {}; }
    if (s.day !== day) s = { day: day, n: 0, t: [] };
    s.t = (s.t || []).filter(function (x) { return now - x < 60000; });
    if (s.t.length >= 8) return 'Za szybko 🙂 — max 8 wiadomości na minutę. Spróbuj za chwilę.';
    if (s.n >= 80) return 'Dzienny limit publicznego czatu (80) wyczerpany. Wróć jutro albo pobierz aplikację D Bot.';
    s.t.push(now); s.n++; try { localStorage.setItem('dbot.public.rl', JSON.stringify(s)); } catch (_) {}
    return null;
  }
  function send(text) {
    text = String(text || '').trim().slice(0, 400); if (!text) return;
    add('me', T.privacy(text));
    var lim = limits(); if (lim) { add('bot', '⏳ ' + lim); return; }
    var B = brain();
    if (B) { var d = add('bot', '…'); askBrain(B, T.privacy(text)).then(function (r) { d.textContent = T.privacy(r); }, function (e) { d.textContent = T.publicReply(text) + '\n(mózg niedostępny: ' + String(e && e.message || e).slice(0, 60) + ' — odpowiedź offline)'; }); return; }
    setTimeout(function () { add('bot', T.publicReply(text)); }, 250 + Math.random() * 350);
  }
  // ---------------- shared public knowledge (live server) + optional brains (Ollama / OpenRouter free / custom)
  var KB = null, hist = ls('hist') || [];
  fetch('/d-knowledge.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { KB = j; }).catch(function () {});
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('d.web.' + k) || 'null'); localStorage.setItem('d.web.' + k, JSON.stringify(v)); } catch (_) { return null; } }
  function brain() { return ls('brain'); }
  function paintBrain() { var b = brain(); document.getElementById('brainBtn').textContent = '🔌 Mózg: ' + (b ? b.label : 'offline'); }
  function sys() {
    return 'You are D, the main bot of the „Super D Bot · 7 DJ” team (8 bots: ' + (KB ? KB.bots.map(function (b) { return b[1] + ' (' + b[2] + ')'; }).join(', ') : 'app builders, music bots, video bot') + '). ' +
      'You chat with members of the public on a website. Answer in the user\'s language, concise. ' + T.persona.prompts.ziomal + T.persona.SAFE +
      ' PRIVACY: never reveal or guess personal data about the site owner or anyone (emails, phones, addresses, keys). You have no access to private data. ' +
      (KB ? 'PUBLIC KNOWLEDGE: ' + JSON.stringify({ djTips: KB.djTips, genres: KB.genres }) : '');
  }
  function askBrain(B, text) {
    hist.push({ role: 'user', content: text }); hist = hist.slice(-8); ls('hist', hist);
    var h = { 'Content-Type': 'application/json' }; if (B.key) h.Authorization = 'Bearer ' + B.key;
    if (B.kind === 'openrouter') { h['HTTP-Referer'] = location.origin; h['X-Title'] = 'D'; }
    var ctl = new AbortController(); setTimeout(function () { ctl.abort(); }, 45000);
    return fetch(B.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: h, signal: ctl.signal, body: JSON.stringify({ model: B.model, messages: [{ role: 'system', content: sys() }].concat(hist), max_tokens: 500 }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) { var t = String(j.choices[0].message.content || '').trim(); hist.push({ role: 'assistant', content: t }); ls('hist', hist.slice(-8)); return t; });
  }
  var pane = document.getElementById('brain');
  document.getElementById('brainBtn').onclick = function () { pane.hidden = !pane.hidden; };
  document.getElementById('detOllama').onclick = function () {
    var st = document.getElementById('olStat'); st.textContent = 'szukam…';
    var bases = ['http://localhost:11434', 'http://127.0.0.1:11434'], i = 0;
    (function next() {
      if (i >= bases.length) { st.textContent = 'nie znaleziono (uruchom Ollama z OLLAMA_ORIGINS=' + location.origin + ')'; return; }
      var b = bases[i++], ctl = new AbortController(); setTimeout(function () { ctl.abort(); }, 2500);
      fetch(b + '/api/tags', { signal: ctl.signal }).then(function (r) { return r.json(); }).then(function (j) {
        var m = (j.models || [])[0]; if (!m) { st.textContent = 'Ollama działa, ale nie ma modeli (ollama pull llama3.2)'; return; }
        ls('brain', { kind: 'ollama', label: 'Ollama · ' + m.name, base: b + '/v1', model: m.name }); st.textContent = '✓ ' + m.name; paintBrain();
      }).catch(next);
    })();
  };
  document.getElementById('orLoad').onclick = function () {
    var key = document.getElementById('orKey').value.trim(), sel = document.getElementById('orModel'); if (!key) { sel.innerHTML = '<option>najpierw klucz OpenRouter</option>'; return; }
    fetch('https://openrouter.ai/api/v1/models').then(function (r) { return r.json(); }).then(function (j) {
      var free = (j.data || []).filter(function (m) { return /:free$/.test(m.id); }).slice(0, 60);
      sel.innerHTML = free.map(function (m) { return '<option value="' + m.id + '">' + m.id + '</option>'; }).join('') || '<option>brak darmowych modeli</option>';
      sel.onchange = function () { ls('brain', { kind: 'openrouter', label: 'OpenRouter · ' + sel.value.replace(/:free$/, ''), base: 'https://openrouter.ai/api/v1', model: sel.value, key: key }); paintBrain(); };
      if (free[0]) sel.onchange();
    }).catch(function (e) { sel.innerHTML = '<option>błąd: ' + String(e.message).slice(0, 40) + '</option>'; });
  };
  document.getElementById('cuUse').onclick = function () {
    var b = document.getElementById('cuBase').value.trim(), m = document.getElementById('cuModel').value.trim(); if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(b) || !m) { var bt = document.getElementById('cuUse'); bt.textContent = '⚠ podaj adres https://…/v1 i nazwę modelu'; setTimeout(function () { bt.textContent = 'Użyj'; }, 3000); return; }
    ls('brain', { kind: 'custom', label: 'własny · ' + m, base: b, model: m, key: document.getElementById('cuKey').value.trim() }); paintBrain();
  };
  document.getElementById('useOff').onclick = function () { ls('brain', null); try { localStorage.removeItem('d.web.brain'); } catch (_) {} paintBrain(); };
  paintBrain();
  (function () { var s = document.getElementById('orModel'); if (s && !s.options.length) s.innerHTML = '<option value="">— najpierw „Darmowe modele” —</option>'; })();
  document.getElementById('f').addEventListener('submit', function (e) { e.preventDefault(); send(q.value); q.value = ''; q.focus(); });
  (window.D_CHIPS || ['zespół', 'jak miksować DnB?', 'napisz piosenkę o lecie', 'beat na MPC', 'zbuduj aplikację na Androida licznik', 'zrób stronę html wizytówka']).forEach(function (c) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.onclick = function () { send(c); }; document.getElementById('chips').appendChild(b);
  });
  var OLD = ls('log') || []; OLD.forEach(function (m) { add(m[0], m[1], true); });
  window.DSend = send;
  if (!OLD.length) add('bot', '👽 Hej! Jestem D — szef zespołu Super D Bot · 7 DJ. Pogadamy o DJ-owaniu, piosenkach, beatach i aplikacjach. Napisz „zespół”, żeby poznać 8 botów.');
})();
