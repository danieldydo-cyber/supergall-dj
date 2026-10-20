/*
 * D Bot v46 — „🧠 Darmowy mózg”: free on-device AI, no keys, no payments.
 *  • Model: Qwen3-0.6B (Apache-2.0, 100+ languages incl. Polish), ONNX int8 by onnx-community, pinned commit,
 *    ≈ 630 MB, NOT in the APK. APK: downloaded once by the app (Wi-Fi by default, resumable, SHA-256 verified per file) into
 *    app-private files and served at /models/… . Browser: downloaded once by transformers.js into the Cache Storage.
 *  • Runtime: transformers.js 4.3.1 + onnxruntime-web (Apache-2.0 / MIT, bundled in libs/ai) — WebGPU when the WebView has it,
 *    else WASM on the CPU (single thread). Needs ≈ 4 GB RAM; smaller phones get a clear message and the offline rules.
 *  • A killed WebView renderer during load/generation (out of memory) is caught natively (MainActivity.onRenderProcessGone) →
 *    the app reloads and the local brain is paused with an explanation instead of crashing again.
 * window.DBotLocalAI
 */
(function (global) {
  'use strict';
  var MODEL = 'onnx-community/Qwen3-0.6B-ONNX', REV = '1e0a4a196ecabdf9a879664110574563d3f372d3';
  var SIZE_MB = 630, LS = 'dbot-localai';
  function N() { return global.DBotNative; }
  function apk() { return !!(N() && N().has()); }
  function lsGet() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (_) { return {}; } }
  function lsSet(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (_) {} }
  var subs = [], gen = null, loading = null, queue = Promise.resolve(), idleT = 0;
  var st = { installed: false, downloading: false, done: 0, total: SIZE_MB * 1048576, ramOk: true, crashed: false, enabled: true, loaded: false, device: '', error: '', mode: 'web', tokPerSec: 0 };
  function fire(ev) { subs.forEach(function (f) { try { f(ev, st); } catch (_) {} }); }
  function ramOkWeb() { var m = navigator.deviceMemory; return !m || m >= 4; }

  function refresh() {
    if (apk()) {
      var s = N().json(N().call('localAiStatus'), {});
      st.mode = 'apk'; st.installed = !!s.installed; st.downloading = !!s.downloading; st.done = s.bytes || 0; st.total = s.total || st.total;
      st.ramOk = s.ramOk !== false && ramOkWeb(); st.ram = s.ram; st.crashed = !!s.crashed; st.enabled = s.enabled !== false; st.wifi = !!s.wifi; st.free = s.free; st.license = s.license;
    } else {
      var l = lsGet(); st.mode = 'web'; st.installed = !!l.installed; st.enabled = l.enabled !== false; st.ramOk = ramOkWeb(); st.crashed = !!l.crashed;
    }
    return st;
  }
  function usable() { refresh(); return st.installed && st.enabled && st.ramOk && !st.crashed; }

  // native events: {type:'localai', state: progress|verify|ready|error|cancelled|removed, done,total,file,message}
  if (N()) N().on('localai', function (ev) {
    var s = ev.status || {}; st.installed = !!s.installed; st.downloading = !!s.downloading;
    if (ev.state === 'progress') { st.done = ev.done; st.total = ev.total; st.downloading = true; }
    if (ev.state === 'error') { st.error = ev.message || ev.error; st.downloading = false; }
    if (ev.state === 'ready') { st.error = ''; st.downloading = false; if (global.DBotRepairs) global.DBotBus && global.DBotBus.post('D Bot', 'system', 'Darmowy mózg AI zainstalowany (SHA-256 OK)'); }
    fire(ev);
  });

  function download(allowMetered) {
    refresh();
    if (!st.ramOk) { st.error = 'Ten telefon ma za mało pamięci RAM (potrzeba ≈ 4 GB) — zostaję przy szybkich odpowiedziach offline. Możesz dodać klucz Grok (⚙).'; fire({ state: 'error', message: st.error }); return false; }
    if (apk()) { st.downloading = true; st.error = ''; N().call('localAiDownload', !!allowMetered); fire({ state: 'progress', done: st.done, total: st.total }); return true; }
    // browser: transformers.js downloads once from Hugging Face into Cache Storage
    st.downloading = true; fire({ state: 'progress', done: 0, total: st.total });
    load(true).then(function () { var l = lsGet(); l.installed = true; lsSet(l); st.installed = true; st.downloading = false; fire({ state: 'ready' }); },
      function (e) { st.downloading = false; st.error = String(e && e.message || e); fire({ state: 'error', message: st.error }); });
    return true;
  }
  function cancel() { if (apk()) N().call('localAiCancel'); }
  function remove() { unload(); if (apk()) N().call('localAiRemove'); else { lsSet({}); try { caches.delete('transformers-cache'); } catch (_) {} } st.installed = false; fire({ state: 'removed' }); }
  function enable(on) { if (apk()) N().call('localAiEnable', !!on); else { var l = lsGet(); l.enabled = !!on; l.crashed = false; lsSet(l); } st.enabled = !!on; st.crashed = false; fire({ state: 'enabled' }); }

  function busy(b) { if (apk()) N().call('localAiBusy', !!b); else { var l = lsGet(); l.loading = !!b; lsSet(l); } }
  function libBase() { var s = document.querySelector('script[src*="dbot-localai.js"]'); return s ? new URL('../libs/ai/', s.src).href : new URL('libs/ai/', location.href).href; }
  function load(allowRemote) {
    if (gen) return Promise.resolve(gen);
    if (loading) return loading;
    busy(true); fire({ state: 'loading' });
    loading = import(libBase() + 'transformers.min.js').then(function (T) {
      var env = T.env;
      env.backends.onnx.wasm.wasmPaths = libBase();
      if (!global.crossOriginIsolated) env.backends.onnx.wasm.numThreads = 1;
      // APK: the verified files are served by the app itself at /models/<repo>/<file> (transformers.js treats it as a „remote” host)
      if (apk() || !allowRemote && !st.installed) { env.allowLocalModels = false; env.allowRemoteModels = true; env.remoteHost = new URL('/models/', location.href).href; env.remotePathTemplate = '{model}/'; env.useBrowserCache = false; }
      else { env.allowRemoteModels = true; env.allowLocalModels = false; env.useBrowserCache = true; }
      var tryDev = function (device) {
        return T.pipeline('text-generation', MODEL, { dtype: 'int8', device: device, revision: REV,
          progress_callback: function (p) { if (p && p.status === 'progress' && p.total > 1e7) { st.done = p.loaded; st.total = p.total; fire({ state: 'progress', done: p.loaded, total: p.total, file: p.file }); } } });
      };
      var adapter = navigator.gpu && navigator.gpu.requestAdapter ? navigator.gpu.requestAdapter().catch(function () { return null; }) : Promise.resolve(null);
      return adapter.then(function (ad) {
        var gpu = !!ad && !/Android [5-9]\b/.test(navigator.userAgent);
        var used = gpu ? 'webgpu' : 'wasm';
        return (gpu ? tryDev('webgpu').catch(function () { used = 'wasm'; return tryDev('wasm'); }) : tryDev('wasm')).then(function (p) {
          gen = p; st.loaded = true; st.device = used; st.T = T; busy(false); fire({ state: 'loaded' }); return gen;
        });
      });
    }).catch(function (e) { loading = null; busy(false); st.error = 'Nie mogę uruchomić modelu: ' + String(e && e.message || e).slice(0, 160); fire({ state: 'error', message: st.error }); throw e; });
    return loading;
  }
  function unload() { try { if (gen && gen.dispose) gen.dispose(); } catch (_) {} gen = null; loading = null; st.loaded = false; }
  function touchIdle() { clearTimeout(idleT); idleT = setTimeout(function () { unload(); fire({ state: 'unloaded' }); }, 10 * 60000); }

  /** messages: [{role:'system'|'user'|'assistant', content}] → Promise<{ok, text}> ; opts.onToken(partialText) streams */
  function chat(messages, opts) {
    opts = opts || {};
    if (!usable() && !(st.mode === 'web' && opts.allowRemote)) return Promise.resolve({ ok: false, text: st.ramOk ? 'darmowy mózg nie jest pobrany' : 'za mało RAM' });
    var job = queue.then(function () {
      return load(false).then(function (g) {
        busy(true);
        var T = st.T, acc = '', t0 = Date.now(), n = 0;
        var streamer = T.TextStreamer ? new T.TextStreamer(g.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: function (t) { acc += t; n++; if (opts.onToken) try { opts.onToken(acc.replace(/<\/?think>/g, '').trim()); } catch (_) {} } }) : undefined;
        // Qwen3: thinking OFF (fast, direct answers) via the chat template flag
        var prompt = g.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true, enable_thinking: false });
        return g(prompt, { max_new_tokens: opts.maxTokens || 200, return_full_text: false, add_special_tokens: false, do_sample: (opts.temperature || 0.5) > 0.25, temperature: opts.temperature || 0.5, top_p: 0.9, top_k: 20, repetition_penalty: 1.1, streamer: streamer }).then(function (out) {
          busy(false); touchIdle();
          var gt = out && out[0] && out[0].generated_text, text = Array.isArray(gt) ? String((gt[gt.length - 1] || {}).content || '') : String(gt || acc);
          text = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<\/?think>/g, '');
          st.tokPerSec = n ? Math.round(n / ((Date.now() - t0) / 1000) * 10) / 10 : 0;
          return { ok: !!text.trim(), text: text.trim() || '…' };
        });
      });
    }).catch(function (e) { busy(false); return { ok: false, text: String(e && e.message || e).slice(0, 160) }; });
    queue = job.then(function () {}, function () {});
    return job;
  }

  function sizeText() { return '≈ ' + SIZE_MB + ' MB'; }
  function statusText() {
    refresh();
    if (!st.ramOk) return '⚪ Za mało RAM (' + (st.ram ? Math.round(st.ram / 1073741824 * 10) / 10 + ' GB' : (navigator.deviceMemory || '?') + ' GB') + ') — odpowiedzi offline + opcjonalny klucz Grok';
    if (st.crashed) return '🟡 Wstrzymany — telefonowi zabrakło pamięci przy ładowaniu modelu. Zamknij inne aplikacje i włącz ponownie.';
    if (st.downloading) return '⬇ Pobieram ' + Math.round(st.done / 1048576) + ' / ' + Math.round(st.total / 1048576) + ' MB';
    if (!st.installed) return '⚪ Nie pobrany (' + sizeText() + ', jednorazowo, Wi-Fi)';
    if (!st.enabled) return '⏸ Wyłączony';
    return '🟢 Gotowy — działa na telefonie, za darmo' + (st.loaded ? ' · załadowany (' + st.device + (st.tokPerSec ? ', ' + st.tokPerSec + ' tok/s' : '') + ')' : '');
  }
  refresh();
  // a renderer crash during the risky phase (web build) → pause instead of crashing in a loop
  (function () { var l = lsGet(); if (!apk() && l.loading) { l.loading = false; l.crashed = true; lsSet(l); } })();

  global.DBotLocalAI = { model: MODEL, rev: REV, sizeMb: SIZE_MB, status: refresh, usable: usable, download: download, cancel: cancel, remove: remove, enable: enable, load: load, unload: unload, chat: chat, on: function (f) { subs.push(f); }, statusText: statusText, state: st };
})(typeof window !== 'undefined' ? window : globalThis);
