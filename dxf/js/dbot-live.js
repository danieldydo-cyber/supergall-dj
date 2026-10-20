/*
 * D.bot v45 — LIVE sync of Daniel's knowledge (tracks, ideas, memory, calendar).
 *  APK: native LiveSync (JobScheduler every ~15 min in the background + on open + every 15 min while open) fetches the live
 *       server (/sync-manifest.json, /api/playlist, /api/bot-learn, /api/account-status, memory-public.json) and — only if
 *       Daniel configured his own OAuth client — Google Drive + Calendar read-only. Cache = app-private files/livesync.json.
 *  Browser: same endpoints through the shim/fetch, cached in localStorage „dbot-live”.
 * window.DBotLive: syncNow, lastSync, cache, search, summary, tracks, onChange. E-mails / keys are scrubbed before caching.
 */
(function (global) {
  'use strict';
  var LS = 'dbot-live', EVERY = 15 * 60 * 1000;
  var N = function () { return global.DBotNative; };
  function native() { return !!(N() && N().has()); }
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function scrub(s) { return String(s).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail ukryty]').replace(/\b(xai-|sk-|AIza|ghp_|ya29\.)[A-Za-z0-9_.-]{12,}/g, '[klucz ukryty]'); }
  function norm(s) { return String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  var cache = lsGet(LS, {}), subs = [], busy = false, timer = 0;

  function base() { try { return (global.D7APK && global.D7APK.status().live) || ''; } catch (_) { return ''; } }
  function changed() { subs.forEach(function (f) { try { f(cache); } catch (_) {} }); }
  function loadNative() { if (!native()) return; var c = N().json(N().call('liveCache'), null); if (c && (c.syncedAt || c.lastTry)) { cache = c; lsSet(LS, { syncedAt: c.syncedAt, lastTry: c.lastTry, status: c.status, data: c.data }); changed(); } }
  var SOURCES = [['playlist', '/api/playlist'], ['botLearn', '/api/bot-learn'], ['account', '/api/account-status'], ['memory', 'samples/memory-public.json']];
  function syncNow() {
    if (busy) return Promise.resolve(cache);
    busy = true;
    if (native()) {
      var b = base(); if (b) N().call('liveSetBase', b);
      return new Promise(function (res) {
        var off = N().on('live', function (ev) { off(); busy = false; if (ev.cache) { cache = ev.cache; lsSet(LS, cache); changed(); } res(cache); });
        N().call('liveSyncNow');
        setTimeout(function () { if (busy) { busy = false; off(); res(cache); } }, 90000);
      });
    }
    var data = cache.data || {}, status = {}, good = 0;
    return Promise.all(SOURCES.map(function (s) {
      return fetch(s[1] + (s[1].indexOf('?') > 0 ? '&' : '?') + 'dbot=' + Date.now(), { cache: 'no-store' }).then(function (r) { status[s[0]] = r.ok ? 'ok' : 'http ' + r.status; return r.ok ? r.text() : null; })
        .then(function (t) { if (!t || !/^\s*[[{]/.test(t)) return; data[s[0]] = JSON.parse(scrub(t)); good++; })
        .catch(function (e) { status[s[0]] = String(e && e.message || e); });
    })).then(function () {
      var stamp = new Date().toISOString();
      cache = { data: data, status: status, lastTry: stamp, syncedAt: good ? stamp : cache.syncedAt, base: base() };
      lsSet(LS, cache); busy = false; changed(); return cache;
    });
  }
  // v47: show the phone's local time (was the raw UTC ISO string → 2 h off in Kraków)
  function localStamp(iso) { var d = new Date(iso); if (isNaN(d)) return String(iso || '').replace('T', ' ').slice(0, 19); var z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); }
  function lastSync() { return cache.syncedAt ? localStamp(cache.syncedAt) : ''; }

  // flatten into searchable lines
  function lines() {
    var out = [], d = cache.data || {};
    function walk(o, path, depth) {
      if (out.length > 4000 || depth > 6 || o == null) return;
      if (Array.isArray(o)) { o.forEach(function (x) { walk(x, path, depth + 1); }); return; }
      if (typeof o === 'object') {
        var t = o.title || o.name || o.summary || o.text || o.idea || o.note;
        if (typeof t === 'string') out.push((path ? path + ': ' : '') + t + (o.date ? ' · ' + o.date + (o.time ? ' ' + o.time : '') : '') + (o.bpm ? ' · ' + o.bpm + ' BPM' : '') + (o.folder ? ' · ' + o.folder : ''));
        Object.keys(o).forEach(function (k) { if (typeof o[k] === 'object') walk(o[k], k === 'data' ? path : k, depth + 1); });
      }
    }
    walk(d, '', 0);
    return out.filter(function (x, i, a) { return a.indexOf(x) === i; });
  }
  function search(q) {
    var words = norm(q).split(/\W+/).filter(function (w) { return w.length > 2 && !/^(the|and|moje|moj|jakie|mam|what|ktore|pokaz|show|jest|sie)$/.test(w); });
    var all = lines();
    if (/kalendarz|calendar|termin|event|wydarzen/.test(norm(q))) return all.filter(function (l) { return /^calendar|^google: .*\d{4}-\d\d-\d\d/.test(l) || /calendar/.test(l); }).slice(0, 30);
    if (!words.length) return [];
    return all.map(function (l) { var n = norm(l), s = 0; words.forEach(function (w) { if (n.indexOf(w) >= 0) s++; }); return { l: l, s: s }; })
      .filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.l; }).slice(0, 30);
  }
  function tracks() {
    var d = cache.data || {}, t = [];
    var pl = d.playlist && (d.playlist.tracks || d.playlist.items || d.playlist.playlist); if (Array.isArray(pl)) t = t.concat(pl);
    var g = d.google && d.google.tracks; if (Array.isArray(g)) t = t.concat(g);
    return t;
  }
  function summary() {
    var d = cache.data || {}, g = d.google || {};
    return 'last sync ' + (lastSync() || 'never') + '; tracks ' + tracks().length + (g.calendar ? '; calendar events (14 days) ' + g.calendar.length : '') + (g.ideas ? '; ideas.json' : '') + (d.memory ? '; memory' : '') + '; sources ' + JSON.stringify(cache.status || {});
  }
  function start() {
    loadNative();
    syncNow();
    clearInterval(timer); timer = setInterval(function () { if (document.visibilityState !== 'hidden') syncNow(); }, EVERY);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && Date.now() - Date.parse(cache.lastTry || 0) > EVERY) syncNow(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1500); }); else setTimeout(start, 1500);

  global.DBotLive = {
    syncNow: syncNow, lastSync: lastSync, cache: function () { return cache; }, search: search, lines: lines, summary: summary, tracks: tracks,
    onChange: function (f) { subs.push(f); }, native: native,
    google: {
      status: function () { return native() ? N().json(N().call('googleStatus'), {}) : { clientIdSet: false, connected: false, browser: true }; },
      setClient: function (id, secret) { return native() ? N().call('googleSetClient', id || '', secret || '') : 'APK only'; },
      signIn: function () { if (native()) N().call('googleSignIn'); },
      signOut: function () { if (native()) N().call('googleSignOut'); }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
