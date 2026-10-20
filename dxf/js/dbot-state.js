/*
 * D.bot v46 — ONE versioned state store for every choice (bots, agents, options, settings, decisions, My apps…).
 *  • Tracked localStorage keys (v43–v45 keys keep working = automatic migration) + the v46 store „dbot-state” (ui, options, bus, decisions).
 *  • Every change is saved automatically (debounced 500 ms, flushed on pagehide/hidden) and mirrored to the app-private native file
 *    files/dbot-state.json via D7Bot.stateSave → survives WebView cache/storage clears; restored synchronously on start BEFORE page scripts read it.
 *  • AI keys are stripped from the mirror and from exports unless the user ticks „include keys”. Owner tokens are never stored here.
 *  • Export/import of settings as a JSON file (share sheet / download / file picker).
 * Loaded right after js/dbot-native.js. window.DBotState.
 */
(function (global) {
  'use strict';
  var VERSION = 46, STORE = 'dbot-state';
  var TRACK = ['dbot-brain-keys', 'dbot-convo', 'dbot-localai', 'dbot-live-base', 'd7c-ui', 'd7-ai-keys', 'd7-superbot', 'd7-opts', 'pro8-settings', 'x7-state', 'x7-bot-d', 'x7-chat', 'dbot-agents', 'dbot-agent-log', 'dbot-dj',
    'dbot-apps', 'dbot-builder-chat', 'd7-apk-live', 'ddj-botd-settings', 'ddj-viz-res', 'ddj-auto-sync'];
  var PREFIX = ['pro8-cues:'];
  var NEVER = /^(ddj_owner_token|ddj_owner_info)$/; // private — never mirrored or exported
  var LS = global.localStorage;
  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  function N() { return global.DBotNative; }
  function nativeOk() { return !!(N() && N().has()); }
  function parse(s, fb) { try { return s ? JSON.parse(s) : fb; } catch (_) { return fb; } }
  function tracked(k) { return !NEVER.test(k) && (TRACK.indexOf(k) >= 0 || PREFIX.some(function (p) { return k.indexOf(p) === 0; })); }
  function lsGet(k) { try { return LS.getItem(k); } catch (_) { return null; } }
  function lsPut(k, v) { try { rawSet.call(LS, k, v); return true; } catch (_) { return false; } }

  var DEFAULTS = {
    ui: { bot: 'dbot', tab: 'status', theme: 'galaxy', convo: false, backupKeys: false },
    opts: { personality: 'pro', length: 'normal', rate: 1.0, pitch: 1.0, priority: ['dj', 'midi', 'producer', 'memory', 'research', 'appbuilder', 'botbuilder'],
      quick: ['status', 'auto mix', 'party on', 'party off', 'sync b', 'loop 4 a', 'beat fx echo', 'midi clock on', '@memory ostatni sync'] },
    midi: { mode: 'master', outName: '', inName: '', used: false },
    auto: { full: false, partyFrom: 22, partyTo: 4, syncEveryMin: 15 },
    bus: [], decisions: []
  };
  var store = null, subs = {}, saveT = 0, saving = false, restored = [];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fill(dst, def) { Object.keys(def).forEach(function (k) { if (dst[k] === undefined) dst[k] = clone(def[k]); else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && dst[k] && typeof dst[k] === 'object') fill(dst[k], def[k]); }); return dst; }

  /** v44/v45 → v46: old keys stay where they are (they ARE the source of truth); a few choices move into the store. */
  function migrate(s) {
    s = s && typeof s === 'object' ? s : {};
    var from = s.version || 0;
    s.data = fill(s.data || {}, DEFAULTS);
    if (from < 46) {
      var dj = parse(lsGet('dbot-dj'), {}); if (dj.midiMode) s.data.midi.mode = dj.midiMode;
      var ui = parse(lsGet('d7c-ui'), {}); if (typeof ui.tts === 'boolean') s.data.ui.autoSpeak = ui.tts;
      s.migratedFrom = from || 'v44/v45 keys';
    }
    s.version = VERSION;
    return s;
  }

  // ------------------------------------------------------------------ restore (synchronous, before page scripts)
  function snapshotKeys(includeKeys) {
    var out = {};
    for (var i = 0; i < LS.length; i++) {
      var k = LS.key(i); if (!tracked(k)) continue;
      var v = lsGet(k); if (v == null) continue;
      if (k === 'dbot-brain-keys' && !includeKeys) continue; // v47: Mózgi AI keys — device-only unless the user chooses keys
      if (k === 'd7-ai-keys' && !includeKeys) { var a = parse(v, null); if (a && a.keys) { a.keys = {}; v = JSON.stringify(a); } }
      out[k] = v;
    }
    return out;
  }
  var JSON_KEYS = /^(dbot-convo|dbot-localai|d7c-ui|d7-ai-keys|d7-superbot|d7-opts|pro8-settings|x7-state|x7-bot-d|x7-chat|dbot-agents|dbot-agent-log|dbot-dj|dbot-apps|dbot-builder-chat|ddj-botd-settings|pro8-cues:.*)$/;
  var repairs = [];
  function validJson(v) { try { JSON.parse(v); return true; } catch (_) { return false; } }
  var lastKeys = {};
  /** never persist a corrupt (non-JSON) value: keep the previous good one */
  function cleanKeys(o) { Object.keys(o).forEach(function (k) { if (JSON_KEYS.test(k) && !validJson(o[k])) { if (lastKeys[k] && validJson(lastKeys[k])) o[k] = lastKeys[k]; else delete o[k]; } }); return o; }
  function restore() {
    var rawLocal = lsGet(STORE), local = parse(rawLocal, null), mirror = null;
    var good = parse(lsGet(STORE + '-good'), null); // last good snapshot (written after every successful save)
    if (rawLocal && !local) repairs.push({ module: 'state', what: 'uszkodzony magazyn ustawień → ostatnia dobra kopia' });
    if (nativeOk()) mirror = parse(N().call('stateLoad'), null);
    // pick the newer store
    var base = local;
    if (mirror && mirror.store && (!local || String(mirror.store.savedAt || '') > String(local.savedAt || ''))) base = mirror.store;
    if (!base && good && good.store) base = good.store;
    store = migrate(base);
    // corrupt tracked keys (not JSON) → mirror / last good snapshot / removed
    for (var i = LS.length - 1; i >= 0; i--) {
      var k = LS.key(i); if (!tracked(k) || !JSON_KEYS.test(k)) continue;
      var v = lsGet(k); if (v == null || validJson(v)) continue;
      var fixv = (mirror && mirror.keys && mirror.keys[k] && validJson(mirror.keys[k]) && mirror.keys[k]) || (good && good.keys && good.keys[k] && validJson(good.keys[k]) && good.keys[k]) || null;
      if (fixv) lsPut(k, fixv); else rawRemove.call(LS, k);
      repairs.push({ module: 'state', what: 'uszkodzony klucz ' + k + (fixv ? ' → przywrócony z kopii' : ' → usunięty (domyślne)') });
    }
    // missing tracked keys come back from the mirror (cache cleared / reinstalled WebView data)
    lastKeys = (mirror && mirror.keys) || (good && good.keys) || {};
    if (mirror && mirror.keys) Object.keys(mirror.keys).forEach(function (k) {
      if (!tracked(k)) return;
      var cur = lsGet(k);
      if (cur == null) { if (lsPut(k, mirror.keys[k])) restored.push(k); return; }
      if (k === 'd7-ai-keys') { // never let a key-less mirror wipe keys, but bring back provider/model choices
        var c = parse(cur, {}), m = parse(mirror.keys[k], {}); if (c && m && !c.models && m.models) { c.models = m.models; lsPut(k, JSON.stringify(c)); }
      }
    });
    if (restored.length) repairs.push({ module: 'state', what: 'przywrócono z kopii natywnej: ' + restored.join(', ') });
    store.data.repairs = (store.data.repairs || []).concat(repairs.map(function (x) { return { at: new Date().toISOString(), module: x.module, what: x.what }; })).slice(-100);
    lsPut(STORE, JSON.stringify(store));
  }

  // ------------------------------------------------------------------ save (debounced, every change)
  function schedule() { clearTimeout(saveT); saveT = setTimeout(flush, 500); }
  function flush() {
    clearTimeout(saveT);
    if (saving || !store) return false;
    saving = true;
    try {
      store.savedAt = new Date().toISOString();
      if (lsGet(STORE) == null && nativeOk()) {
        // WebView storage was wiped under us → do NOT overwrite the native mirror with an empty snapshot; bring keys back instead
        var m = parse(N().call('stateLoad'), null), back = [];
        if (m && m.keys) Object.keys(m.keys).forEach(function (k) { if (tracked(k) && lsGet(k) == null && lsPut(k, m.keys[k])) back.push(k); });
        if (back.length) (store.data.repairs = store.data.repairs || []).push({ at: store.savedAt, module: 'state', what: 'pamięć WebView wyczyszczona → przywrócono: ' + back.join(', ') });
      }
      lsPut(STORE, JSON.stringify(store));
      var full = cleanKeys(snapshotKeys(!!store.data.ui.backupKeys)); lastKeys = full;
      var small = JSON.parse(JSON.stringify(full)); delete small['dbot-apps']; delete small['x7-chat']; delete small['dbot-agent-log'];
      lsPut(STORE + '-good', JSON.stringify({ savedAt: store.savedAt, store: store, keys: small }));
      if (nativeOk()) N().call('stateSave', JSON.stringify({ app: 'D Bot', version: VERSION, savedAt: store.savedAt, store: store, keys: full }));
      fire('saved', store.savedAt);
    } catch (e) { console.warn('[DBotState] save', e); }
    saving = false;
    return true;
  }
  Storage.prototype.setItem = function (k, v) { var r = rawSet.apply(this, arguments); if (this === LS && !saving && k !== STORE && tracked(String(k))) schedule(); return r; };
  Storage.prototype.removeItem = function (k) { var r = rawRemove.apply(this, arguments); if (this === LS && !saving && tracked(String(k))) schedule(); return r; };
  global.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

  // ------------------------------------------------------------------ API
  function walk(path, create) { var parts = String(path).split('.'), o = store.data; for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) { if (!create) return [null]; o[parts[i]] = {}; } o = o[parts[i]]; } return [o, parts[parts.length - 1]]; }
  function get(path, fb) { var w = walk(path, false); if (!w[0]) return fb; var v = w[0][w[1]]; return v === undefined ? fb : v; }
  function set(path, v) { var w = walk(path, true); w[0][w[1]] = v; schedule(); fire(path, v); fire('*', path); return v; }
  function push(path, item, max) { var a = get(path, []); a.push(item); if (max && a.length > max) a.splice(0, a.length - max); return set(path, a); }
  function on(path, fn) { (subs[path] = subs[path] || []).push(fn); }
  function fire(path, v) { (subs[path] || []).slice().forEach(function (f) { try { f(v); } catch (_) {} }); }

  function exportJson(includeKeys) {
    flush();
    var out = { app: 'D Bot', kind: 'dbot-settings', version: VERSION, exportedAt: new Date().toISOString(), includesKeys: !!includeKeys, store: clone(store), keys: snapshotKeys(!!includeKeys) };
    if (!includeKeys) delete out.keys['d7-ai-keys-raw'];
    if (nativeOk()) { out.autoReply = parse(N().call('autoReplyConfig'), null); if (out.autoReply) { delete out.autoReply.knownApps; delete out.autoReply.listenerEnabled; delete out.autoReply.aiKeyStored; } }
    return JSON.stringify(out, null, 1);
  }
  function exportFile(includeKeys) {
    var json = exportJson(includeKeys), name = 'dbot-settings-' + new Date().toISOString().slice(0, 10) + (includeKeys ? '-WITH-KEYS' : '') + '.json';
    if (nativeOk() && N().call('share', name, json)) return true;
    try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return true; } catch (_) { return false; }
  }
  function importJson(text) {
    var j = parse(text, null);
    if (!j || j.kind !== 'dbot-settings' || !j.keys) return { ok: false, error: 'to nie jest plik ustawień D Bot' };
    var n = 0;
    saving = true;
    try {
      Object.keys(j.keys).forEach(function (k) {
        if (!tracked(k)) return;
        var v = j.keys[k];
        if (k === 'd7-ai-keys') { var cur = parse(lsGet(k), {}), inc = parse(v, {}); if (!inc.keys || !Object.keys(inc.keys).length) inc.keys = cur.keys || {}; v = JSON.stringify(inc); } // no keys in file → keep the ones on this device
        lsPut(k, v); n++;
      });
      if (j.store) { store = migrate(j.store); lsPut(STORE, JSON.stringify(store)); }
    } finally { saving = false; }
    if (j.autoReply && nativeOk()) N().call('autoReplySave', JSON.stringify(j.autoReply));
    flush();
    return { ok: true, keys: n };
  }

  restore();
  global.DBotState = {
    version: VERSION, get: get, set: set, push: push, on: on, flush: flush, schedule: schedule, tracked: tracked, restoredKeys: function () { return restored.slice(); },
    exportJson: exportJson, exportFile: exportFile, importJson: importJson, raw: function () { return store; }, defaults: DEFAULTS,
    reset: function () { store = migrate({}); flush(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
