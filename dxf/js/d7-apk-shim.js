/**
 * D7 DJ · Android APK shim (v42 · X71) — loaded before every other script in the packaged pages.
 * - The app is served from bundled assets (https://appassets.androidplatform.net/), so relative
 *   /api/* calls have no server. This shim forwards them to the current live server (CORS *)
 *   with a short timeout, and answers {ok:false, offline:true} (503, X-DDJ-Offline) when the
 *   server is unreachable — Bot D then uses its local answers + localStorage offline queue.
 * - Live URL: localStorage 'd7-apk-live' (set by ?live=… or D7APK.setLive(url)) → bundled
 *   fallback from d7-apk-config.js. Refreshed in the background from <live>/sync-manifest.json.
 * - Never blocks startup; never throws.
 */
(function (w) {
  'use strict';
  if (w.D7APK) return;
  var CFG = w.D7_APK_CONFIG || {};
  var KEY = 'd7-apk-live';
  var IS_APK = location.hostname === 'appassets.androidplatform.net' || /[?&]apk=1(&|$)/.test(location.search);
  var nativeFetch = w.fetch ? w.fetch.bind(w) : null;
  var downUntil = 0, lastOk = 0, lastErr = '';

  function clean(u) {
    u = String(u || '').trim().replace(/\/+$/, '');
    return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u) && u.indexOf('appassets.androidplatform.net') < 0 ? u : '';
  }
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) {} }

  try { // ?live=https://xyz.trycloudflare.com → remember it
    var qp = new URLSearchParams(location.search).get('live');
    if (qp && clean(qp)) lsSet(KEY, clean(qp));
  } catch (_) {}

  function liveBase() { return clean(lsGet(KEY)) || clean(CFG.liveUrl) || ''; }

  function offlineResponse(why) {
    return new Response(JSON.stringify({ ok: false, offline: true, apk: true, error: why || 'offline' }), {
      status: 503, statusText: 'Offline',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-DDJ-Offline': '1' }
    });
  }
  function markDown(why) { downUntil = Date.now() + (CFG.backoffMs || 45000); lastErr = String(why || 'down'); }

  function apiPath(input) {
    try {
      var raw = typeof input === 'string' ? input : (input && input.url) ? input.url : String(input);
      var u = new URL(raw, location.href);
      if (u.origin !== location.origin) return null;
      if (u.pathname.indexOf('/api/') !== 0) return null;
      return u.pathname + u.search;
    } catch (_) { return null; }
  }

  // Android: the live server sends a duplicated CORS header ('*, *'), which browsers reject for
  // cross-origin fetch. The APK exposes D7Native.request() (Java HttpURLConnection, no CORS) and
  // answers asynchronously through D7APK._resolve(). Headless/desktop: plain fetch is used.
  var pending = {}, seq = 0;
  function hasNative() { try { return !!(w.D7Native && typeof w.D7Native.request === 'function'); } catch (_) { return false; } }
  function nativeRequest(method, target, headers, body, ms) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      var t = setTimeout(function () { delete pending[id]; reject(new Error('timeout')); }, ms);
      pending[id] = function (status, ct, text) {
        clearTimeout(t); delete pending[id];
        if (!status) { reject(new Error(text || 'network')); return; }
        resolve(new Response(status === 204 || status === 304 ? null : text, { status: status, headers: { 'Content-Type': ct || 'application/json; charset=utf-8' } }));
      };
      try { w.D7Native.request(id, method, target, JSON.stringify(headers || {}), body == null ? '' : String(body)); }
      catch (e) { clearTimeout(t); delete pending[id]; reject(e); }
    });
  }
  function plainHeaders(h) {
    var o = {};
    try {
      if (!h) return o;
      if (typeof h.forEach === 'function' && !Array.isArray(h)) { h.forEach(function (v, k) { o[k] = v; }); return o; }
      if (Array.isArray(h)) { h.forEach(function (p) { o[p[0]] = p[1]; }); return o; }
      for (var k in h) o[k] = h[k];
    } catch (_) {}
    return o;
  }
  function handle(r) {
    var ct = (r.headers.get('content-type') || '').toLowerCase();
    // tunnel down → Cloudflare 502/530 HTML; never hand HTML to JSON parsers
    if (r.status >= 500 || (r.ok && ct.indexOf('json') < 0 && ct.indexOf('text/plain') < 0)) { markDown('http ' + r.status); return offlineResponse('live server http ' + r.status); }
    lastOk = Date.now(); downUntil = 0;
    return r;
  }

  function proxied(path, input, init) {
    var base = liveBase();
    if (!base) return Promise.resolve(offlineResponse('no live server'));
    if (navigator.onLine === false) return Promise.resolve(offlineResponse('no network'));
    if (Date.now() < downUntil) return Promise.resolve(offlineResponse('live server unreachable (backoff)'));
    var target = base + path;
    var ms = CFG.timeoutMs || 7000;
    var srcI = init || {};
    var simpleBody = srcI.body === undefined || srcI.body === null || typeof srcI.body === 'string';
    if (hasNative() && simpleBody && (typeof input === 'string' || input instanceof URL)) {
      return nativeRequest(String(srcI.method || 'GET').toUpperCase(), target, plainHeaders(srcI.headers), srcI.body, ms)
        .then(handle, function (e) { markDown((e && e.message) || 'network'); return offlineResponse(lastErr); })
        .catch(function () { return offlineResponse('shim'); });
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.timeoutMs || 7000);
    var o = {};
    var src = init || {};
    if (input && typeof input !== 'string' && input.method) { o.method = input.method; o.headers = input.headers; }
    if (src.method) o.method = src.method;
    if (src.headers) o.headers = src.headers;
    if (src.body !== undefined) o.body = src.body;
    o.mode = 'cors'; o.credentials = 'omit'; o.cache = 'no-store'; o.redirect = 'follow';
    if (ctrl) {
      o.signal = ctrl.signal;
      if (src.signal) { try { if (src.signal.aborted) ctrl.abort(); else src.signal.addEventListener('abort', function () { ctrl.abort(); }); } catch (_) {} }
    }
    var bodyP = (input && typeof input !== 'string' && input.method && input.method !== 'GET' && src.body === undefined && input.clone)
      ? input.clone().text().then(function (b) { o.body = b; }) : Promise.resolve();
    return bodyP.then(function () { return nativeFetch(target, o); }).then(function (r) {
      clearTimeout(t);
      return handle(r);
    }, function (e) {
      clearTimeout(t);
      markDown(e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || 'network');
      return offlineResponse(lastErr);
    }).catch(function () { return offlineResponse('shim'); });
  }

  if (IS_APK && nativeFetch) {
    w.fetch = function (input, init) {
      var p = apiPath(input);
      if (!p) return nativeFetch(input, init);
      return proxied(p, input, init);
    };
    // sendBeacon('/api/…') → live server, fire-and-forget
    if (navigator.sendBeacon) {
      var nb = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        var p = apiPath(url);
        if (!p) return nb(url, data);
        var base = liveBase();
        if (!base || navigator.onLine === false) return true;
        try { return nb(base + p, data); } catch (_) { return true; }
      };
    }
    w.addEventListener('online', function () { downUntil = 0; });
  }

  /** Background: learn the newest tunnel URL from the live server's sync-manifest (never blocks). */
  function refreshLive() {
    if (!IS_APK || !nativeFetch || navigator.onLine === false) return;
    var cands = [clean(lsGet(KEY)), clean(CFG.liveUrl)].concat((CFG.discovery || []).map(clean)).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    var i = 0;
    (function next() {
      if (i >= cands.length) return;
      var c = cands[i++];
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
      var mu = c + '/sync-manifest.json?apk=' + Date.now();
      (hasNative() ? nativeRequest('GET', mu, {}, null, 6000) : nativeFetch(mu, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }))
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (j) {
          clearTimeout(t);
          var nu = clean(j && (j.liveUrl || j.tunnelUrl)) || c;
          lsSet(KEY, nu);
          downUntil = 0; lastOk = Date.now();
        })
        .catch(function () { clearTimeout(t); next(); });
    })();
  }
  if (IS_APK) setTimeout(refreshLive, 4000);

  w.D7APK = {
    apk: IS_APK, version: String(CFG.version || '44'), builtAt: CFG.builtAt || '',
    live: liveBase,
    setLive: function (u) { var c = clean(u); lsSet(KEY, c); downUntil = 0; return c || liveBase(); },
    status: function () { return { apk: IS_APK, live: liveBase(), online: navigator.onLine !== false, down: Date.now() < downUntil, lastOk: lastOk, lastErr: lastErr }; },
    shareUrl: function () { var b = liveBase(); return b ? b + '/' : ''; },
    refresh: refreshLive,
    native: hasNative,
    _resolve: function (id, status, ct, text) { var f = pending[id]; if (f) f(status, ct, text); }
  };
})(window);
