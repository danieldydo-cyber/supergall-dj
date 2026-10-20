/*
 * D Bot v47 — „🧠 Mózgi AI”: any number of AI brains for chat and building.
 *  • Cloud presets: xAI Grok, Google Gemini, OpenAI, Anthropic Claude, Mistral, Groq, OpenRouter (many models, one key), DeepSeek,
 *    local Ollama / LM Studio (OpenAI-compatible URL on your LAN), Custom (any OpenAI-compatible base URL + model + key).
 *  • Extra on-device models (open licence, ONNX, downloaded once into the browser cache via the bundled transformers.js).
 *  • Per brain: name, provider, base URL, model, key (device-only: localStorage 'dbot-brain-keys', never bundled, not mirrored or
 *    exported unless „Eksport z kluczami” is ticked), temperature, on/off, Test.
 *  • Assign brains to D Bot chat, D Builder, D Song and every agent; „🧠 Model X” = auto, picks the best available.
 *  • Transport: APK → D7Native.aiChatUrl (Java, no CORS, https or LAN http only); Mac → D77Desktop.aiFetch (main process);
 *    browser → fetch.
 * window.DBotBrains
 */
(function (global) {
  'use strict';
  var St = global.DBotState, LSK = 'dbot-brain-keys';
  var PRESETS = {
    xai: { label: 'xAI Grok', base: 'https://api.x.ai/v1', model: 'grok-4.7', auth: 'bearer', hint: 'xai-…', console: 'https://console.x.ai' },
    gemini: { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', auth: 'bearer', hint: 'AIza…', console: 'https://aistudio.google.com/apikey' },
    openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-6-luna', auth: 'bearer', hint: 'sk-…', console: 'https://platform.openai.com/api-keys' },
    anthropic: { label: 'Anthropic Claude', base: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5', auth: 'anthropic', hint: 'sk-ant-…', console: 'https://console.anthropic.com' },
    mistral: { label: 'Mistral', base: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', auth: 'bearer', hint: '', console: 'https://console.mistral.ai' },
    groq: { label: 'Groq', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', auth: 'bearer', hint: 'gsk_…', console: 'https://console.groq.com/keys' },
    openrouter: { label: 'OpenRouter (wiele modeli, 1 klucz)', base: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', auth: 'bearer', hint: 'sk-or-…', console: 'https://openrouter.ai/keys' },
    deepseek: { label: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', auth: 'bearer', hint: 'sk-…', console: 'https://platform.deepseek.com' },
    ollama: { label: 'Ollama (LAN)', base: 'http://192.168.1.10:11434/v1', model: 'llama3.2', auth: 'none', keyless: true, hint: 'bez klucza', lan: true },
    lmstudio: { label: 'LM Studio (LAN)', base: 'http://192.168.1.10:1234/v1', model: 'local-model', auth: 'none', keyless: true, hint: 'bez klucza', lan: true },
    custom: { label: 'Custom (OpenAI-compatible)', base: 'https://', model: '', auth: 'bearer', keyless: true, hint: 'opcjonalny' }
  };
  // open-licensed ONNX chat models that run in transformers.js (sizes = ONNX weights from Hugging Face; int8 on CPU, q4f16 on WebGPU)
  var DEVICE = [
    { id: 'smol135', label: 'SmolLM2 135M Instruct', repo: 'HuggingFaceTB/SmolLM2-135M-Instruct', rev: '12fd25f77366fa6b3b4b768ec3050bf629380bac', lic: 'Apache-2.0', mb: { int8: 131, q4f16: 112 }, note: 'najlżejszy, proste odpowiedzi' },
    { id: 'smol360', label: 'SmolLM2 360M Instruct', repo: 'HuggingFaceTB/SmolLM2-360M-Instruct', rev: 'a10cc1512eabd3dde888204e902eca88bddb4951', lic: 'Apache-2.0', mb: { int8: 348, q4f16: 260 }, note: 'lekki, angielski najlepiej' },
    { id: 'qwen25', label: 'Qwen2.5 0.5B Instruct', repo: 'onnx-community/Qwen2.5-0.5B-Instruct', rev: '22942cb7d7ba4cc81bb4673549ca4d4614469b5e', lic: 'Apache-2.0', mb: { int8: 488, q4f16: 461 }, note: 'wielojęzyczny (PL)' },
    { id: 'qwen25coder', label: 'Qwen2.5 Coder 0.5B Instruct', repo: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct', rev: '604bb1988ff789d5024d589c63cf9ae81c0c8ab5', lic: 'Apache-2.0', mb: { int8: 610, q4f16: 529 }, note: 'do kodu (D Builder)' },
    { id: 'qwen3_17', label: 'Qwen3 1.7B', repo: 'onnx-community/Qwen3-1.7B-ONNX', rev: 'b85539623180ae64303f37373d942cb0595ca44d', lic: 'Apache-2.0', mb: { int8: 1662, q4f16: 1360 }, note: 'najmądrzejszy, Mac / 8 GB RAM' }
  ];
  var TARGETS = [['chat', '🦈 D Bot (czat)'], ['builder', '🧩 D Builder'], ['song', '🎵 D Song']];

  function sget(p, fb) { return St ? St.get(p, fb) : fb; }
  function sset(p, v) { return St ? St.set(p, v) : v; }
  function keys() { try { return JSON.parse(localStorage.getItem(LSK) || '{}') || {}; } catch (_) { return {}; } }
  function setKey(id, k) { var a = keys(); if (k) a[id] = String(k).trim(); else delete a[id]; try { localStorage.setItem(LSK, JSON.stringify(a)); } catch (_) {} }
  function list() { return sget('brains.list', []) || []; }
  function save(l) { sset('brains.list', l); fire(); }
  function byId(id) { id = String(id || '').replace(/^b:/, ''); return list().filter(function (b) { return b.id === id; })[0] || null; }
  function assign() { return sget('brains.assign', {}) || {}; }
  function setAssign(t, v) { var a = assign(); if (!v || v === 'auto') delete a[t]; else a[t] = v; sset('brains.assign', a); fire(); return a; }
  var subs = []; function fire() { subs.forEach(function (f) { try { f(); } catch (_) {} }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function mask(k) { k = String(k || ''); return k ? k.slice(0, 4) + '…' + k.slice(-4) : ''; }
  function scrub(t, k) { t = String(t || ''); if (k) t = t.split(k).join('***'); return t.replace(/\b(xai-|sk-|AIza|gsk_|sk-or-|sk-ant-)[A-Za-z0-9_-]{12,}/g, '[klucz ukryty]'); }

  function add(provider, o) {
    o = o || {}; var P = PRESETS[provider], D = provider === 'device' ? DEVICE.filter(function (d) { return d.id === o.device; })[0] : null;
    if (!P && !D) throw new Error('nieznany dostawca');
    var b = { id: uid(), provider: provider, name: o.name || (D ? '📱 ' + D.label : P.label), base: o.base || (P ? P.base : ''), model: o.model || (D ? D.repo : P.model), temp: typeof o.temp === 'number' ? o.temp : 0.7, enabled: o.enabled !== false, device: D ? D.id : undefined, created: new Date().toISOString() };
    var l = list(); l.push(b); save(l); if (o.key) setKey(b.id, o.key);
    return b;
  }
  function update(id, patch) { var l = list(); l.forEach(function (b) { if (b.id === id) Object.keys(patch).forEach(function (k) { if (k !== 'id' && k !== 'key') b[k] = patch[k]; }); }); save(l); if ('key' in patch) setKey(id, patch.key); return byId(id); }
  function remove(id) { save(list().filter(function (b) { return b.id !== id; })); setKey(id, ''); var a = assign(); Object.keys(a).forEach(function (t) { if (a[t] === 'b:' + id) delete a[t]; }); sset('brains.assign', a); }

  function devState() { return sget('brains.device', {}) || {}; }
  function usable(b) {
    if (!b || !b.enabled) return false;
    if (b.provider === 'device') return !!devState()[b.device];
    var P = PRESETS[b.provider]; if (!P || !b.model || !/^https?:\/\/[^/]+/.test(b.base || '')) return false;
    return !!keys()[b.id] || !!P.keyless;
  }
  function cloud(b) { return b && b.provider !== 'device'; }
  function label(p) { var b = byId(p); return b ? '🧠 ' + b.name + (b.model && b.provider !== 'device' ? ' · ' + b.model : '') : String(p); }
  function cloudIds() { return list().filter(function (b) { return cloud(b) && usable(b); }).map(function (b) { return 'b:' + b.id; }); }
  function cloudOn() { return cloudIds().length > 0; }
  function deviceIds() { return list().filter(function (b) { return !cloud(b) && usable(b); }).map(function (b) { return 'b:' + b.id; }); }

  /** Model X — which brain a target uses. Returns 'b:<id>' / 'local', or null = let the built-in logic decide
   *  (built-in key → free on-device Qwen3 → offline). */
  // Model X routing by task: which providers are preferred for which job (first = best)
  var RANK = {
    chat: ['xai', 'anthropic', 'openai', 'gemini', 'openrouter', 'mistral', 'deepseek', 'groq', 'custom', 'ollama', 'lmstudio'],
    builder: ['anthropic', 'openai', 'xai', 'deepseek', 'gemini', 'openrouter', 'mistral', 'groq', 'custom', 'ollama', 'lmstudio'],
    song: ['anthropic', 'openai', 'xai', 'gemini', 'mistral', 'openrouter', 'deepseek', 'groq', 'custom', 'ollama', 'lmstudio'],
    agent: ['groq', 'gemini', 'xai', 'mistral', 'openai', 'deepseek', 'anthropic', 'openrouter', 'custom', 'ollama', 'lmstudio']
  };
  function ranked(target) {
    var r = RANK[/^agent/.test(target) ? 'agent' : target] || RANK.chat;
    return list().filter(function (b) { return cloud(b) && usable(b) && !(b.test && b.test.ok === false); })
      .sort(function (x, y) { var a = (x.test && x.test.ok ? 0 : 1) - (y.test && y.test.ok ? 0 : 1); return a || r.indexOf(x.provider) - r.indexOf(y.provider); })
      .map(function (b) { return 'b:' + b.id; });
  }
  /** Model X — which brain a target uses. Returns 'b:<id>' / 'local', or null = let the built-in logic decide
   *  (built-in key → free on-device Qwen3 → offline). */
  function pick(target) {
    var a = assign(), want = a[target] || (/^agent:/.test(target) ? a['agents'] : null) || 'auto';
    if (want === 'local') { var L = global.DBotLocalAI; if (L && L.usable()) return 'local'; }
    else if (/^b:/.test(want) && usable(byId(want))) return want;
    var c = ranked(target); if (c.length) return c[0];
    var S = global.D7Super; var builtin = false; try { builtin = !!(S && S.usableList && S.usableList().length); } catch (_) {}
    if (builtin) return null;
    var L2 = global.DBotLocalAI; if (L2 && L2.usable()) return null;
    var d = deviceIds(); return d.length ? d[0] : null;
  }
  /** „ask several and merge” mode for D Bot chat: up to 3 best working brains */
  function mode() { return sget('brains.mode', 'route'); }
  function pickMany(target) { if (mode() !== 'merge') return null; var a = assign(); if (a[target] && a[target] !== 'auto') return null; var c = ranked(target).slice(0, 3); return c.length > 1 ? c : null; }

  // ------------------------------------------------------------------ add all + auto-detect + start working brains on launch
  function testAndMark(b) {
    return test(b.id).then(function (r) { var l = list(); l.forEach(function (x) { if (x.id === b.id) { x.test = { ok: !!r.ok, at: new Date().toISOString(), ms: r.ms || 0, err: r.ok ? '' : String(r.text).slice(0, 120) }; if (x.auto) x.enabled = !!r.ok; } }); save(l); return { id: b.id, name: b.name, ok: !!r.ok, text: r.text }; });
  }
  function get(url) {
    if (nativeOk() && typeof global.D7Native.aiGetUrl === 'function') return new Promise(function (res) { var id = ++nid, t = setTimeout(function () { delete waiting[id]; res({ status: 0, text: 'timeout' }); }, 4000); waiting[id] = function (st, tx) { clearTimeout(t); res({ status: st, text: tx }); }; try { global.D7Native.aiGetUrl(id, url); } catch (e) { clearTimeout(t); res({ status: 0, text: '' }); } });
    if (global.D77Desktop && global.D77Desktop.aiGet) return global.D77Desktop.aiGet(url);
    var ctl = global.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 2500);
    return fetch(url, { signal: ctl && ctl.signal }).then(function (r) { return r.text().then(function (t) { clearTimeout(to); return { status: r.status, text: t }; }); }, function () { clearTimeout(to); return { status: 0, text: '' }; });
  }
  /** Ollama (:11434) and LM Studio (:1234) on this machine or on hosts you already used; returns found servers + their models */
  function detectLan(extraHosts) {
    var hosts = ['127.0.0.1', 'localhost'].concat(extraHosts || []).concat(list().map(function (b) { try { return new URL(b.base).hostname; } catch (_) { return ''; } })).concat(sget('brains.lanHosts', []) || []);
    hosts = hosts.filter(function (h, i, a) { return h && a.indexOf(h) === i && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[a-z0-9-]+\.local$)/i.test(h); }).slice(0, 12);
    var probes = [];
    hosts.forEach(function (h) {
      probes.push(get('http://' + h + ':11434/api/tags').then(function (r) { var j = null; try { j = JSON.parse(r.text); } catch (_) {} return r.status === 200 && j && j.models ? { kind: 'ollama', base: 'http://' + h + ':11434/v1', models: j.models.map(function (m) { return m.name || m.model; }) } : null; }));
      probes.push(get('http://' + h + ':1234/v1/models').then(function (r) { var j = null; try { j = JSON.parse(r.text); } catch (_) {} return r.status === 200 && j && j.data ? { kind: 'lmstudio', base: 'http://' + h + ':1234/v1', models: j.data.map(function (m) { return m.id; }) } : null; }));
    });
    return Promise.all(probes).then(function (rs) { return rs.filter(Boolean); });
  }
  /** „Dodaj wszystkie automatycznie”: one brain per cloud preset (keys: entered once by you), LAN servers detected,
   *  then every brain is tested and only working ones stay enabled. */
  function addAll(extraHosts) {
    var have = {}; list().forEach(function (b) { have[b.provider + '|' + (b.provider === 'ollama' || b.provider === 'lmstudio' ? b.base + '|' + b.model : '')] = 1; });
    var S = global.D7Super, old = {}; try { old = JSON.parse(localStorage.getItem('d7-ai-keys') || '{}').keys || {}; } catch (_) {}
    ['xai', 'gemini', 'openai', 'anthropic', 'mistral', 'groq', 'openrouter', 'deepseek'].forEach(function (k) {
      if (have[k + '|']) return; var b = add(k, { enabled: false }); var l = list(); l.forEach(function (x) { if (x.id === b.id) x.auto = true; }); save(l);
      if (old[k] && !keys()[b.id]) setKey(b.id, old[k]); // keys you already gave the built-in ⚙ (same device) are reused
    });
    return detectLan(extraHosts).then(function (found) {
      found.forEach(function (f) { (f.models.length ? f.models.slice(0, 3) : ['']).forEach(function (m) { if (have[f.kind + '|' + f.base + '|' + m]) return; var b = add(f.kind, { base: f.base, model: m || PRESETS[f.kind].model, name: PRESETS[f.kind].label.replace(' (LAN)', '') + ' · ' + (m || '?') }); var l = list(); l.forEach(function (x) { if (x.id === b.id) x.auto = true; }); save(l); }); });
      return startAll(true).then(function (rs) { return { found: found, tested: rs }; });
    });
  }
  /** on launch: test every brain that can run (has a key or is keyless) and keep the working ones enabled */
  var started = null;
  function startAll(force) {
    if (started && !force) return started;
    var l = list().filter(function (b) { return cloud(b) && (keys()[b.id] || (PRESETS[b.provider] && PRESETS[b.provider].keyless && /^https?:\/\/[^/]+/.test(b.base || '') && b.model)); });
    l.forEach(function (b) { if (b.auto) { var all = list(); all.forEach(function (x) { if (x.id === b.id) x.enabled = true; }); save(all); } });
    started = Promise.all(l.map(function (b) { return testAndMark(byId(b.id)); })).then(function (rs) { sset('brains.lastStart', { at: new Date().toISOString(), ok: rs.filter(function (r) { return r.ok; }).length, total: rs.length }); fire(); return rs; });
    return started;
  }
  function modelX(target) { var p = pick(target || 'chat'), S = global.D7Super, L = global.DBotLocalAI;
    if (p) return p === 'local' ? 'darmowy mózg na urządzeniu (Qwen3 0.6B)' : label(p);
    try { if (S && S.usableList().length) return 'chmura · ' + S.usableList().join('+'); } catch (_) {}
    return L && L.usable() ? 'darmowy mózg na urządzeniu (Qwen3 0.6B)' : 'offline (reguły)';
  }

  // ------------------------------------------------------------------ transport
  var nid = 0, waiting = {};
  function nativeOk() { try { return !!(global.D7Native && typeof global.D7Native.aiChatUrl === 'function'); } catch (_) { return false; } }
  function post(url, auth, key, body) {
    var payload = JSON.stringify(body);
    if (nativeOk()) return new Promise(function (res) {
      var id = ++nid, t = setTimeout(function () { delete waiting[id]; res({ status: 0, text: 'timeout' }); }, 95000);
      waiting[id] = function (st, tx) { clearTimeout(t); res({ status: st, text: tx }); };
      try { global.D7Native.aiChatUrl(id, url, auth, key || '', payload); } catch (e) { clearTimeout(t); delete waiting[id]; res({ status: 0, text: String(e && e.message) }); }
    });
    var h = { 'Content-Type': 'application/json' };
    if (auth === 'bearer' && key) h.Authorization = 'Bearer ' + key;
    if (auth === 'anthropic') { h['x-api-key'] = key; h['anthropic-version'] = '2023-06-01'; h['anthropic-dangerous-direct-browser-access'] = 'true'; }
    if (global.D77Desktop && global.D77Desktop.aiFetch) return global.D77Desktop.aiFetch(url, h, payload);
    var ctl = global.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 95000);
    return fetch(url, { method: 'POST', headers: h, body: payload, signal: ctl && ctl.signal }).then(function (r) { return r.text().then(function (t) { clearTimeout(to); return { status: r.status, text: t }; }); }, function (e) { clearTimeout(to); return { status: 0, text: String(e && e.message || e) }; });
  }
  function urlOf(b) { var base = String(b.base || '').replace(/\/+$/, ''); return base + (b.provider === 'anthropic' ? '/messages' : '/chat/completions'); }

  var dev = { id: null, gen: null, loading: null, T: null };
  function libBase() { var s = document.querySelector('script[src*="dbot-localai.js"]') || document.querySelector('script[src*="dbot-brains.js"]'); return s ? new URL('../libs/ai/', s.src).href : new URL('libs/ai/', location.href).href; }
  function devLoad(D, onProg) {
    if (dev.id === D.id && dev.gen) return Promise.resolve(dev.gen);
    if (dev.loading && dev.id === D.id) return dev.loading;
    if (dev.gen && dev.gen.dispose) try { dev.gen.dispose(); } catch (_) {}
    dev.gen = null; dev.id = D.id;
    try { if (global.DBotLocalAI) global.DBotLocalAI.unload(); } catch (_) {} // one model in memory at a time
    dev.loading = import(libBase() + 'transformers.min.js').then(function (T) {
      var env = T.env; dev.T = T;
      env.backends.onnx.wasm.wasmPaths = libBase(); if (!global.crossOriginIsolated) env.backends.onnx.wasm.numThreads = 1;
      env.allowRemoteModels = true; env.allowLocalModels = false; env.useBrowserCache = true; env.remoteHost = 'https://huggingface.co/'; env.remotePathTemplate = '{model}/resolve/{revision}/';
      var gpu = navigator.gpu && navigator.gpu.requestAdapter ? navigator.gpu.requestAdapter().catch(function () { return null; }) : Promise.resolve(null);
      return gpu.then(function (ad) {
        var f16 = !!(ad && ad.features && ad.features.has && ad.features.has('shader-f16'));
        var o = function (device, dtype) { return T.pipeline('text-generation', D.repo, { revision: D.rev, device: device, dtype: dtype, progress_callback: function (p) { if (p && p.status === 'progress' && p.total > 5e6 && onProg) onProg(p.loaded, p.total); } }); };
        return (ad ? o('webgpu', f16 ? 'q4f16' : 'q4').catch(function () { return o('wasm', 'int8'); }) : o('wasm', 'int8'));
      }).then(function (g) { dev.gen = g; dev.loading = null; return g; });
    }).catch(function (e) { dev.loading = null; dev.id = null; throw e; });
    return dev.loading;
  }
  function devDownload(id, onProg) {
    var b = byId(id), D = b && DEVICE.filter(function (d) { return d.id === b.device; })[0]; if (!D) return Promise.resolve({ ok: false, text: 'brak modelu' });
    var mem = navigator.deviceMemory; if (mem && mem < 4 && D.mb.int8 > 400) return Promise.resolve({ ok: false, text: 'za mało RAM na ten model (' + mem + ' GB)' });
    return devLoad(D, onProg).then(function () { var s = devState(); s[D.id] = new Date().toISOString(); sset('brains.device', s); fire(); return { ok: true, text: D.label + ' gotowy na urządzeniu' }; }, function (e) { return { ok: false, text: String(e && e.message || e).slice(0, 160) }; });
  }

  /** ask a brain: p = 'b:<id>' → Promise<{p, ok, text}> (never returns or logs the key) */
  function ask(p, sys, text, opts) {
    opts = opts || {}; var b = byId(p);
    if (!b) return Promise.resolve({ p: p, ok: false, text: 'brak takiego mózgu' });
    if (!usable(b)) return Promise.resolve({ p: p, ok: false, text: b.provider === 'device' ? 'model nie jest pobrany' : 'brak klucza / adresu' });
    var hist = (opts.history || []).slice(-12), msgs = [{ role: 'system', content: sys }].concat(hist).concat([{ role: 'user', content: text }]);
    var temp = typeof opts.temperature === 'number' ? opts.temperature : (opts.json ? 0.2 : b.temp);
    if (b.provider === 'device') {
      var D = DEVICE.filter(function (d) { return d.id === b.device; })[0];
      return devLoad(D).then(function (g) {
        var prompt = g.tokenizer.apply_chat_template(msgs, { tokenize: false, add_generation_prompt: true, enable_thinking: false });
        return g(prompt, { max_new_tokens: opts.maxTokens || 260, return_full_text: false, do_sample: temp > 0.25, temperature: Math.max(0.1, temp), top_p: 0.9, repetition_penalty: 1.1 });
      }).then(function (out) { var t = String(out && out[0] && out[0].generated_text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(); return { p: p, ok: !!t, text: t || '…' }; }, function (e) { return { p: p, ok: false, text: String(e && e.message || e).slice(0, 160) }; });
    }
    var key = keys()[b.id] || '', body;
    if (b.provider === 'anthropic') body = { model: b.model, max_tokens: opts.maxTokens || 1500, temperature: temp, system: sys, messages: hist.concat([{ role: 'user', content: text }]) };
    else { body = { model: b.model, messages: msgs, temperature: temp }; if (opts.maxTokens) body.max_tokens = opts.maxTokens; if (opts.json) body.response_format = { type: 'json_object' }; }
    var t0 = Date.now();
    return post(urlOf(b), PRESETS[b.provider].auth === 'anthropic' ? 'anthropic' : (key ? 'bearer' : 'none'), key, body).then(function (r) {
      var j = null; try { j = JSON.parse(r.text); } catch (_) {}
      var out = '';
      try { out = b.provider === 'anthropic' ? (j.content || []).map(function (x) { return x.text || ''; }).join('').trim() : String(j.choices[0].message.content || '').trim(); } catch (_) {}
      if (r.status >= 200 && r.status < 300 && out) return { p: p, ok: true, text: out, ms: Date.now() - t0 };
      var err = (j && j.error && (j.error.message || j.error.type || j.error)) || ('HTTP ' + r.status + (r.status ? '' : ' · ' + String(r.text || '').slice(0, 80)));
      return { p: p, ok: false, text: scrub(typeof err === 'string' ? err : JSON.stringify(err), key).slice(0, 180) };
    });
  }
  function test(id) { return ask('b:' + String(id).replace(/^b:/, ''), 'You are a test. Reply with exactly: OK', 'Say OK', { maxTokens: 12, temperature: 0 }); }


  // ------------------------------------------------------------------ Center → 🧠 Mózgi AI
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function options(sel, withAgents) {
    var o = [['auto', '🧠 Model X (auto — najlepszy dostępny)'], ['local', '📱 Darmowy mózg Qwen3 0.6B (na urządzeniu)']].concat(list().map(function (b) { return ['b:' + b.id, (usable(b) ? '' : '⚠ ') + b.name + (b.provider !== 'device' ? ' · ' + b.model : '')]; }));
    return o.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === (sel || 'auto') ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('');
  }
  function render(root) {
    var A = global.DBotAgents, a = assign(), l = list();
    var h = '<div class="dbc-card dbc-holo dbb"><h3>🧠 Mózgi AI — ' + l.length + '</h3><p class="dbc-hint">Model X teraz: <b id="dbb-mx">' + esc(modelX('chat')) + '</b>. Klucze zostają tylko na tym urządzeniu (nie trafiają do aplikacji, kopii ani eksportu, chyba że zaznaczysz „Eksport z kluczami”).</p>' +
      '<div class="dbc-btns"><button type="button" id="dbb-all" class="on">⚡ Dodaj wszystkie automatycznie</button><button type="button" id="dbb-retest">🧪 Testuj wszystkie</button></div><p class="dbb-allout dbc-mut"></p>' +
      '<label class="dbc-row"><span>Model X łączy mózgi</span><select id="dbb-mode"><option value="route"' + (mode() === 'route' ? ' selected' : '') + '>wg zadania (czat / budowanie / piosenki / agenci)</option><option value="merge"' + (mode() === 'merge' ? ' selected' : '') + '>pytaj kilka i połącz (czat)</option></select></label>' +
      '<div class="dbc-btns dbb-add">' + Object.keys(PRESETS).map(function (k) { return '<button type="button" data-add="' + k + '">+ ' + esc(PRESETS[k].label) + '</button>'; }).join('') + '</div>' +
      '<h4>📱 Dodatkowe modele na urządzeniu (otwarte licencje, pobierane raz)</h4><div class="dbb-dev">' + DEVICE.map(function (d) { return '<div class="dbb-devrow"><span><b>' + esc(d.label) + '</b> · ' + d.lic + ' · ≈ ' + d.mb.int8 + ' MB (CPU) / ' + d.mb.q4f16 + ' MB (GPU) · ' + esc(d.note) + '</span><button type="button" data-adddev="' + d.id + '">+ dodaj</button></div>'; }).join('') + '</div></div>';
    h += '<div class="dbc-card"><h3>🎯 Kto używa którego mózgu</h3>' + TARGETS.map(function (t) { return '<label class="dbc-row dbb-as"><span>' + t[1] + '</span><select data-as="' + t[0] + '">' + options(a[t[0]]) + '</select></label>'; }).join('') +
      '<label class="dbc-row dbb-as"><span>🧭 Wszyscy agenci (domyślnie)</span><select data-as="agents">' + options(a.agents) + '</select></label>' +
      (A ? A.list().map(function (g) { return '<label class="dbc-row dbb-as"><span>' + esc(g.icon || '🤖') + ' ' + esc(g.name) + '</span><select data-as="agent:' + esc(g.id) + '">' + options(a['agent:' + g.id]) + '</select></label>'; }).join('') : '') + '</div>';
    h += l.map(function (b) {
      var P = PRESETS[b.provider], dv = b.provider === 'device', D = dv ? DEVICE.filter(function (d) { return d.id === b.device; })[0] : null, ok = usable(b);
      return '<div class="dbc-card dbb-brain" data-id="' + b.id + '"><h3>' + (ok ? '🟢' : '⚪') + ' <input class="dbb-name" value="' + esc(b.name) + '" aria-label="nazwa"></h3>' +
        '<p class="dbc-mut">' + esc(dv ? 'na urządzeniu · ' + D.repo + ' · ' + D.lic : P.label) + (b.test ? ' · test: ' + (b.test.ok ? '✅ ' + (b.test.ms || '') + ' ms' : '❌ ' + esc(b.test.err)) : '') + '</p>' +
        (dv ? '<div class="dbc-btns"><button type="button" data-dl>' + (devState()[b.device] ? '✓ pobrany — załaduj' : '⬇ Pobierz ≈ ' + D.mb.int8 + ' MB') + '</button></div>'
          : '<label class="dbc-row"><span>Adres (base URL)</span><input class="dbb-base" value="' + esc(b.base) + '" spellcheck="false"></label>' +
            '<label class="dbc-row"><span>Model</span><input class="dbb-model" value="' + esc(b.model) + '" spellcheck="false"></label>' +
            '<label class="dbc-row"><span>Klucz ' + (keys()[b.id] ? '🔐 ' + esc(mask(keys()[b.id])) : (P.keyless ? '(opcjonalny)' : '(wymagany)')) + '</span><input class="dbb-key" type="password" autocomplete="off" placeholder="' + esc(P.hint || '') + '"></label>') +
        '<label class="dbc-row"><span>Temperatura <b class="dbb-tv">' + (+b.temp).toFixed(2) + '</b></span><input class="dbb-temp" type="range" min="0" max="1.5" step="0.05" value="' + b.temp + '"></label>' +
        '<label class="dbc-row"><span>Włączony</span><input class="dbb-en" type="checkbox"' + (b.enabled ? ' checked' : '') + '></label>' +
        '<div class="dbc-btns"><button type="button" data-save>💾 Zapisz</button><button type="button" data-test>🧪 Test</button>' + (keys()[b.id] ? '<button type="button" data-delkey>🗑 klucz</button>' : '') + '<button type="button" data-del>✕ usuń</button></div><p class="dbb-out dbc-mut"></p></div>';
    }).join('');
    root.innerHTML = h;
    var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
    var ao = root.querySelector('.dbb-allout');
    root.querySelector('#dbb-all').onclick = function () { ao.textContent = '⚡ dodaję presety, szukam Ollama / LM Studio, testuję…'; addAll().then(function (r) { render(root); var o = root.querySelector('.dbb-allout'); o.textContent = '✅ działa ' + r.tested.filter(function (x) { return x.ok; }).length + ' / ' + r.tested.length + ' z kluczem lub lokalnych · LAN: ' + (r.found.length ? r.found.map(function (f) { return f.kind + ' ' + f.base; }).join(', ') : 'nie znaleziono') + '. Wpisz klucze w kartach poniżej (raz, tylko na tym urządzeniu).'; }); };
    root.querySelector('#dbb-retest').onclick = function () { ao.textContent = '🧪 testuję…'; startAll(true).then(function (rs) { render(root); root.querySelector('.dbb-allout').textContent = '✅ ' + rs.filter(function (x) { return x.ok; }).length + ' / ' + rs.length + ' działa'; }); };
    root.querySelector('#dbb-mode').onchange = function () { sset('brains.mode', this.value); fire(); var m = root.querySelector('#dbb-mx'); if (m) m.textContent = modelX('chat'); };
    $$('[data-add]').forEach(function (x) { x.onclick = function () { add(x.dataset.add); render(root); }; });
    $$('[data-adddev]').forEach(function (x) { x.onclick = function () { add('device', { device: x.dataset.adddev }); render(root); }; });
    $$('[data-as]').forEach(function (x) { x.onchange = function () { setAssign(x.dataset.as, x.value); var m = root.querySelector('#dbb-mx'); if (m) m.textContent = modelX('chat'); }; });
    $$('.dbb-brain').forEach(function (c) {
      var id = c.dataset.id, out = c.querySelector('.dbb-out'), q = function (s) { return c.querySelector(s); };
      q('.dbb-temp').oninput = function () { q('.dbb-tv').textContent = (+this.value).toFixed(2); };
      function collect() { var p = { name: q('.dbb-name').value.trim() || 'Mózg', temp: +q('.dbb-temp').value, enabled: q('.dbb-en').checked }; if (q('.dbb-base')) { p.base = q('.dbb-base').value.trim(); p.model = q('.dbb-model').value.trim(); var k = q('.dbb-key').value.trim(); if (k) p.key = k; } return p; }
      q('[data-save]').onclick = function () { update(id, collect()); render(root); };
      q('[data-test]').onclick = function () { update(id, collect()); out.textContent = '🧪 testuję…'; test(id).then(function (r) { out.textContent = r.ok ? '✅ działa' + (r.ms ? ' (' + r.ms + ' ms)' : '') + ': ' + r.text.slice(0, 60) : '❌ ' + r.text; }); };
      if (q('[data-delkey]')) q('[data-delkey]').onclick = function () { setKey(id, ''); render(root); };
      q('[data-del]').onclick = function () { remove(id); render(root); };
      if (q('[data-dl]')) q('[data-dl]').onclick = function () { out.textContent = '⬇ pobieram…'; devDownload(id, function (d, t) { out.textContent = '⬇ ' + Math.round(d / 1048576) + ' / ' + Math.round(t / 1048576) + ' MB'; }).then(function (r) { out.textContent = (r.ok ? '✅ ' : '❌ ') + r.text; }); };
    });
  }

  setTimeout(function () { if (navigator.onLine !== false && !global.__D77_NO_FIRSTRUN) startAll(false); }, 5000);
  global.DBotBrains = { version: '47', presets: PRESETS, device: DEVICE, targets: TARGETS, list: list, byId: byId, add: add, update: update, remove: remove, usable: usable, ask: ask, test: test,
    pick: pick, pickMany: pickMany, ranked: ranked, mode: mode, setMode: function (m) { sset('brains.mode', m === 'merge' ? 'merge' : 'route'); fire(); }, addAll: addAll, detectLan: detectLan, startAll: startAll, modelX: modelX, assign: assign, setAssign: setAssign, label: label, cloudIds: cloudIds, cloudOn: cloudOn, deviceIds: deviceIds, devDownload: devDownload, hasKey: function (id) { return !!keys()[id]; }, maskKey: function (id) { return mask(keys()[id]); },
    render: render, on: function (f) { subs.push(f); }, _native: function (id, st, tx) { var f = waiting[id]; if (f) { delete waiting[id]; f(st, tx); } } };
})(typeof window !== 'undefined' ? window : globalThis);
