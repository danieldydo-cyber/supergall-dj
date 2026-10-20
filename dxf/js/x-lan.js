/* Super X DJ — 📡 phone server panel: LAN URL + QR, start/stop, autostart after reboot, public link (Cloudflare token field +
 * instructions only — no fake tunnel), and XLan.ask(id,text) used by the native server's /api/brain to chat with bot X. */
(function (global) {
  'use strict';
  var doc = global.document, N = function () { return global.XLanNative || null; };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // /api/brain → bot X (on-device model if loaded, else offline brain), answer goes back to Java
  function answer(text) {
    var S = global.D7Super, V = global.DBotV52;
    try { if (S && S.localOn && S.localOn() && S.askLocal) return Promise.resolve(S.askLocal(V ? V.system('d') : '', text, [], {})).then(function (r) { return typeof r === 'string' ? r : (r && (r.text || r.reply)) || ''; }); } catch (_) {}
    var r = ''; try { r = S && S.offlineChat ? S.offlineChat(text) : ''; } catch (_) {}
    if (!r) try { r = V ? V.fallback(text, 0, 'pl') : ''; } catch (_) {}
    return Promise.resolve(typeof r === 'string' ? r : (r && r.text) || '👽 X: jestem, ale nie mam teraz odpowiedzi.');
  }
  function ask(id, text) { answer(text).then(function (r) { done(id, r); }, function (e) { done(id, '⚠ ' + (e && e.message || e)); }); try { if (global.DBotV52) global.DBotV52.mem.add('lan', 'chat', 'LAN: ' + text); } catch (_) {} }
  function done(id, r) { var n = N(); if (n) n.reply(id, String(r || '').replace(/^\s+|\s+$/g, '')); }
  function info() { try { return JSON.parse(N().info()); } catch (_) { return { running: false, url: null }; } }
  function qr(url) { if (!global.qrcode) { if (!qr.loading) { qr.loading = 1; var sc = doc.createElement('script'); sc.src = 'libs/qrcode.js?v=59'; sc.onload = function () { render(); }; doc.head.appendChild(sc); } return '<small>⏳ QR…</small>'; } try { var q = global.qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 5, margin: 3, scalable: true }); } catch (e) { return ''; } }
  var CSS = '.xl{position:fixed;inset:5vh 5vw;z-index:2147483300;background:#0d0a22f5;border:1px solid #2cffb7;border-radius:18px;color:#eee;font:14px system-ui;overflow:auto;padding:14px;box-shadow:0 0 40px #2cffb755}.xl[hidden]{display:none}.xl h3{margin:4px 0 10px}.xl button,.xl input{font:inherit;padding:8px 12px;border-radius:10px;border:1px solid #2cffb7;background:#10301f;color:#fff}.xl .u{font:700 20px monospace;color:#2cffb7;word-break:break-all}.xl .qr{background:#fff;width:220px;height:220px;border-radius:10px;padding:4px}.xl .qr svg{width:100%;height:100%}.xl .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.xl small{color:#aab}.xl-fab{position:fixed;left:14px;bottom:148px;z-index:2147482000;border-radius:50%;width:48px;height:48px;border:1px solid #2cffb7;background:#10301f;color:#fff;font-size:22px;box-shadow:0 0 14px #2cffb7}';
  var P;
  function render() {
    if (!P) return; var i = info(), n = N(), url = i.url;
    P.querySelector('.xl-st').innerHTML = !n ? '🌐 Ten panel działa w aplikacji Super X DJ na telefonie (Android). W przeglądarce możesz rozmawiać z X przez <code>/api/brain</code> na adresie telefonu.' :
      (i.running ? '🟢 Serwer działa' : '🔴 Serwer wyłączony') + (i.error ? ' · ⚠ ' + esc(i.error) : '') + ' · zapytań: ' + (i.requests || 0);
    P.querySelector('.xl-u').innerHTML = url ? '<div class="u">' + esc(url) + '</div><small>Otwórz na innym urządzeniu w tej samej sieci Wi-Fi. APK: ' + esc(url) + 'app.apk · czat z X: POST ' + esc(url) + 'api/brain {"text":"…"}</small>' : '<small>Brak adresu Wi-Fi — połącz telefon z Wi-Fi (albo włącz hotspot).</small>';
    P.querySelector('.qr').innerHTML = url ? qr(url) : ''; P.querySelector('.qr').hidden = !url;
    var on = P.querySelector('.xl-on'); on.textContent = i.running ? '⏹ Zatrzymaj serwer' : '▶ Uruchom serwer (port 8080)'; on.disabled = !n;
    P.querySelector('.xl-boot').checked = !!i.boot; P.querySelector('.xl-boot').disabled = !n;
  }
  function panel() {
    if (P) return P; var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    P = doc.createElement('div'); P.className = 'xl'; P.hidden = true; P.id = 'xl';
    P.innerHTML = '<div class="row"><h3 style="flex:1">📡 Super X DJ · telefon = serwer</h3><button type="button" class="xl-x">✕</button></div><div class="xl-st"></div>' +
      '<div class="row"><button type="button" class="xl-on"></button><label><input type="checkbox" class="xl-boot"> start po restarcie telefonu</label></div>' +
      '<div class="row" style="align-items:flex-start"><div class="qr"></div><div class="xl-u" style="flex:1;min-width:220px"></div></div>' +
      '<h3>🌍 Publiczny link (opcjonalnie)</h3><div class="row"><input class="xl-tok" type="password" placeholder="Cloudflare Tunnel token (zapisany tylko lokalnie)" style="flex:1"><button type="button" class="xl-ts">💾 Zapisz</button></div><div class="xl-tm"></div>' +
      '<small>Ta aplikacja <b>nie uruchamia</b> tunelu sama (cloudflared nie ma oficjalnej wersji na Androida). Jak zrobić publiczny link: 1) Cloudflare Zero Trust → Networks → Tunnels → Create tunnel → skopiuj token; 2) w Public Hostname ustaw usługę <code>http://IP-telefonu:8080</code>; 3) uruchom <code>cloudflared tunnel run --token &lt;TOKEN&gt;</code> na komputerze/serwerze w tej samej sieci (albo w Termux na telefonie: <code>pkg install cloudflared</code>, wtedy usługa <code>http://localhost:8080</code>). Token zapisany tutaj służy tylko jako notatka do skopiowania.</small>';
    doc.body.appendChild(P);
    P.querySelector('.xl-x').onclick = function () { P.hidden = true; };
    P.querySelector('.xl-on').onclick = function () { var n = N(); if (!n) return; info().running ? n.stop() : n.start(); setTimeout(render, 800); setTimeout(render, 2500); };
    P.querySelector('.xl-boot').onchange = function () { var n = N(); if (n) n.setBoot(this.checked); };
    function tm() { var t = localStorage.getItem('xdj.cfToken'); P.querySelector('.xl-tm').textContent = t ? '🔐 Token zapisany lokalnie (…' + t.slice(-4) + ') — skopiuj go do cloudflared.' : ''; }
    P.querySelector('.xl-ts').onclick = function () { var v = P.querySelector('.xl-tok').value.trim(); if (v) { try { localStorage.setItem('xdj.cfToken', v); } catch (_) {} P.querySelector('.xl-tok').value = ''; } tm(); }; tm();
    setInterval(function () { if (!P.hidden) render(); }, 3000);
    return P;
  }
  function open() { panel().hidden = false; render(); }
  function boot() { if (doc.querySelector('.xl-fab')) return; var b = doc.createElement('button'); b.type = 'button'; b.className = 'xl-fab'; b.title = 'Super X DJ: telefon = serwer (LAN URL + QR)'; b.textContent = '📡'; b.onclick = function () { var p = panel(); p.hidden ? open() : (p.hidden = true); }; doc.body.appendChild(b); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
  global.XLan = { ask: ask, answer: answer, open: open, info: info, qr: qr };
})(window);
