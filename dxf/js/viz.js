/**
 * MilkDrop visuals via Butterchurn (WebGL) + pre-audio psychedelic gate.
 * Master-bus analyser → visualizer; never call getContext('2d') on viz-canvas.
 * D DJ Pro Fly · Daniel Dydo · Kraków · 2077
 */

function resolveButterchurn() {
  const mod = window.butterchurn;
  if (!mod) return null;
  if (typeof mod.createVisualizer === 'function') return mod;
  if (mod.default && typeof mod.default.createVisualizer === 'function') return mod.default;
  if (typeof mod.default === 'function' && mod.default.createVisualizer) return mod.default;
  if (mod.__esModule && mod.default) return resolveButterchurnFrom(mod.default);
  return mod;
}
function resolveButterchurnFrom(x) {
  if (!x) return null;
  if (typeof x.createVisualizer === 'function') return x;
  if (x.default && typeof x.default.createVisualizer === 'function') return x.default;
  return x;
}

const PSYCH_RE = /geiss|martin|psych|tunnel|kaleido|fractal|plasma|spiral|hyperspace|mandel|trip|acid|corona|galaxy|warp|rainbow|flower|bloom|flexi|yin|yin yang|cope|bmelgren|rovastar|shifter|hexagon|radial|tron|neon|cyber/i;

/** Viz render resolution presets (internal canvas pixels). */
export const RES_PRESETS = {
  '720':  { w: 1280, h: 720,  label: '720' },
  '1080': { w: 1920, h: 1080, label: '1080' },
  '4k':   { w: 3840, h: 2160, label: '4K' },
};

export function defaultResKey() {
  try {
    const saved = localStorage.getItem('ddj-viz-res');
    if (saved && RES_PRESETS[saved]) return saved;
  } catch (_) {}
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const win = typeof window !== 'undefined' ? window : null;
    const ua = nav?.userAgent || '';
    const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
      || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints || 0) > 1)
      || (win && Math.min(win.innerWidth, win.innerHeight) < 700);
    return mobile ? '720' : '1080';
  } catch (_) {
    return '1080';
  }
}

/**
 * Procedural MilkDrop-ish psychedelic backdrop (no AudioContext needed).
 * Prefer WebGL plasma/tunnel/kaleido; fall back to canvas 2d.
 */
export class GatePsych {
  constructor(canvas) {
    this.canvas = canvas;
    this._raf = 0;
    this._gl = null;
    this._prog = null;
    this._mode = 'none';
    this._t0 = performance.now();
  }

  start() {
    if (this._raf) return;
    this._t0 = performance.now();
    if (this._initGL()) {
      this._mode = 'webgl';
      const loop = () => {
        this._raf = requestAnimationFrame(loop);
        this._drawGL();
      };
      this._raf = requestAnimationFrame(loop);
      return;
    }
    this._mode = '2d';
    this._ctx2d = this.canvas.getContext('2d');
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this._draw2d();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._gl) {
      const gl = this._gl;
      try {
        const ext = gl.getExtension('WEBGL_lose_context');
        ext?.loseContext();
      } catch (_) {}
      this._gl = null;
    }
  }

  _size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(window.innerWidth * dpr));
    const h = Math.max(2, Math.floor(window.innerHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
    }
    return { w, h, dpr };
  }

  _initGL() {
    let gl;
    try {
      gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, depth: false })
        || this.canvas.getContext('experimental-webgl');
    } catch {
      return false;
    }
    if (!gl) return false;
    const vsSrc = `
      attribute vec2 a;
      void main(){ gl_Position = vec4(a,0.0,1.0); }
    `;
    const fsSrc = `
      precision mediump float;
      uniform vec2 u_res;
      uniform float u_t;
      // cyan #00f0ff / magenta #ff2bd6
      vec3 cyan = vec3(0.0, 0.94, 1.0);
      vec3 mag  = vec3(1.0, 0.17, 0.84);
      vec3 red  = vec3(0.55, 0.02, 0.12);

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
        float t = u_t;

        // kaleidoscope sector
        float ang = atan(uv.y, uv.x);
        float rad = length(uv);
        float sectors = 8.0;
        ang = mod(ang + t*0.35, 6.28318/sectors);
        ang = abs(ang - 3.14159/sectors);
        vec2 k = vec2(cos(ang), sin(ang)) * rad;

        // tunnel
        float tunnel = 0.15 / (rad + 0.08);
        float rings = sin(tunnel*14.0 - t*3.2) * 0.5 + 0.5;
        float plasma = sin(k.x*8.0 + t*1.4) + sin(k.y*7.0 - t*1.1)
                     + sin((k.x+k.y)*5.0 + t*0.8);
        plasma = plasma * 0.25 + 0.5;

        float m = mix(rings, plasma, 0.55);
        m = mix(m, sin(rad*18.0 - t*2.0 + ang*4.0)*0.5+0.5, 0.35);

        vec3 col = mix(red*0.35, cyan, smoothstep(0.15, 0.85, m));
        col = mix(col, mag, smoothstep(0.4, 0.95, plasma));
        col += cyan * (0.15 + 0.25*sin(t*2.0 + rad*10.0));
        col += mag  * (0.12 + 0.2*cos(t*1.6 - ang*3.0));

        // vignette + grain
        float vig = smoothstep(1.35, 0.15, rad);
        col *= vig;
        col += (hash(gl_FragCoord.xy + t) - 0.5) * 0.04;
        col = pow(clamp(col, 0.0, 1.5), vec3(0.92));
        gl_FragColor = vec4(col, 1.0);
      }
    `;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('GatePsych shader', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this._gl = gl;
    this._prog = prog;
    this._uRes = gl.getUniformLocation(prog, 'u_res');
    this._uT = gl.getUniformLocation(prog, 'u_t');
    return true;
  }

  _drawGL() {
    const gl = this._gl;
    if (!gl) return;
    const { w, h } = this._size();
    gl.viewport(0, 0, w, h);
    gl.useProgram(this._prog);
    gl.uniform2f(this._uRes, w, h);
    gl.uniform1f(this._uT, (performance.now() - this._t0) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _draw2d() {
    const ctx = this._ctx2d;
    if (!ctx) return;
    const { w, h } = this._size();
    const t = (performance.now() - this._t0) / 1000;
    const g = ctx.createRadialGradient(w*0.5, h*0.5, 0, w*0.5, h*0.5, Math.max(w,h)*0.7);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
    g.addColorStop(0, `rgba(0,240,255,${0.25 + pulse * 0.2})`);
    g.addColorStop(0.45, `rgba(255,43,214,${0.2 + (1-pulse)*0.15})`);
    g.addColorStop(1, 'rgba(5,5,8,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate(t * 0.25);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.strokeStyle = i % 2 ? 'rgba(0,240,255,0.35)' : 'rgba(255,43,214,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let r = 20; r < Math.max(w,h); r += 18) {
        const jig = Math.sin(t * 3 + r * 0.02 + i) * 8;
        const x = Math.cos(a) * (r + jig);
        const y = Math.sin(a) * (r + jig);
        if (r === 20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class MilkViz {
  constructor({ canvas, engine }) {
    this.canvas = canvas;
    this.engine = engine;
    this.visualizer = null;
    this.presets = {};
    this.keys = [];
    this.index = 0;
    this.ready = false;
    this.enabled = true;
    this.autoCycle = false;
    this.autoMode = 'phrase'; // 'off' | 'beat' | 'phrase'
    this._blend = 2.7;
    this._raf = 0;
    this.lastFrameAt = 0;
    this._cycleTimer = null;
    this._beatAcc = 0;
    this._lastKick = 0;
    this.onPresetChange = null; // (name, index, total) => void
    this.onKick = null; // (energy) => void
    this._audioConnected = false;
    this.resKey = defaultResKey();
    this._maxTex = 4096;
  }

  static isSupported() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  loadPresetsFromGlobals() {
    const packs = [];
    if (window.butterchurnPresets?.getPresets) packs.push(window.butterchurnPresets.getPresets());
    if (window.butterchurnPresetsExtra?.getPresets) packs.push(window.butterchurnPresetsExtra.getPresets());
    this.presets = {};
    for (const p of packs) Object.assign(this.presets, p);
    this.keys = Object.keys(this.presets).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return this.keys.length;
  }

  /** Prefer vivid/psych presets (Geiss, Martin, tunnel, kaleido, …). */
  pickPsychedelicIndex() {
    if (!this.keys.length) return 0;
    const hits = [];
    for (let i = 0; i < this.keys.length; i++) {
      if (PSYCH_RE.test(this.keys[i])) hits.push(i);
    }
    if (hits.length) return hits[Math.floor(Math.random() * hits.length)];
    return Math.floor(Math.random() * this.keys.length);
  }

  async init() {
    if (this.ready) return this;
    if (!MilkViz.isSupported()) throw new Error('WebGL required for MilkDrop');
    const bc = resolveButterchurn();
    if (!bc?.createVisualizer) throw new Error('butterchurn not loaded');
    this._bc = bc;

    const n = this.loadPresetsFromGlobals();
    if (n < 1) throw new Error('No MilkDrop presets found');

    await this.engine.ensure();
    const ctx = this.engine.ctx;
    const rect = this._size();

    this.visualizer = this._bc.createVisualizer(ctx, this.canvas, {
      width: rect.w,
      height: rect.h,
      pixelRatio: 1, // we drive absolute pixel size via RES presets
      textureRatio: 1,
    });
    this.setResolution(this.resKey, { persist: false });

    this._connectAudio();

    this.index = this.pickPsychedelicIndex();
    this.loadIndex(this.index, 0);
    this.ready = true;
    this._startRender();
    this._bindResize();
    return this;
  }

  _connectAudio() {
    if (this._audioConnected || !this.visualizer) return;
    const node = this.engine.masterAnalyser || this.engine.fxReturn || this.engine.masterGain;
    if (!node) return;
    try {
      this.visualizer.connectAudio(node);
      this._audioConnected = true;
    } catch (err) {
      console.warn('MilkViz connectAudio', err);
    }
  }

  _gpuMaxTex() {
    if (this._maxTexCached) return this._maxTexCached;
    let max = 4096;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) max = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    } catch (_) {}
    this._maxTexCached = Math.max(1024, max);
    return this._maxTexCached;
  }

  /**
   * Internal render size from RES preset, capped by GPU + DPR budget.
   * CSS still fills the stage (object-fit style via width/height 100%).
   */
  _size() {
    const preset = RES_PRESETS[this.resKey] || RES_PRESETS['1080'];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parent = this.canvas.parentElement || document.documentElement;
    const dispW = Math.max(320, parent.clientWidth || window.innerWidth);
    const dispH = Math.max(240, parent.clientHeight || window.innerHeight);
    // Cap: never exceed preset, GPU max, or ~2× display×dpr (wasteful otherwise)
    const maxTex = this._gpuMaxTex();
    const budgetW = Math.min(preset.w, maxTex, Math.max(preset.w, Math.ceil(dispW * dpr * 1.25)));
    const budgetH = Math.min(preset.h, maxTex, Math.max(preset.h, Math.ceil(dispH * dpr * 1.25)));
    // Prefer exact preset aspect; shrink uniformly if over budget
    let w = preset.w;
    let h = preset.h;
    const scale = Math.min(1, budgetW / w, budgetH / h, maxTex / Math.max(w, h));
    w = Math.max(320, Math.floor(w * scale));
    h = Math.max(240, Math.floor(h * scale));
    // Keep even dims for GPU friendliness
    w -= w % 2;
    h -= h % 2;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.objectFit = 'cover';
    return { w, h, key: this.resKey };
  }

  setResolution(key, { persist = true } = {}) {
    if (!RES_PRESETS[key]) return this.resKey;
    this.resKey = key;
    if (persist) {
      try { localStorage.setItem('ddj-viz-res', key); } catch (_) {}
    }
    if (this.visualizer) {
      const { w, h } = this._size();
      try {
        if (typeof this.visualizer.setRendererSize === 'function') {
          this.visualizer.setRendererSize(w, h);
        } else if (typeof this.visualizer.setSize === 'function') {
          this.visualizer.setSize(w, h);
        } else if (typeof this.visualizer.resize === 'function') {
          this.visualizer.resize(w, h);
        }
      } catch (err) {
        console.warn('MilkViz setResolution', err);
      }
    }
    return this.resKey;
  }

  _bindResize() {
    if (this._ro) return;
    this._ro = new ResizeObserver(() => {
      if (!this.visualizer) return;
      const { w, h } = this._size();
      try {
        if (typeof this.visualizer.setRendererSize === 'function') this.visualizer.setRendererSize(w, h);
        else if (typeof this.visualizer.setSize === 'function') this.visualizer.setSize(w, h);
        else if (typeof this.visualizer.resize === 'function') this.visualizer.resize(w, h);
      } catch (_) {}
    });
    this._ro.observe(this.canvas.parentElement || this.canvas);
  }

  _startRender() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      if (!this.enabled || !this.visualizer) return;
      try {
        this.visualizer.render();
        this.lastFrameAt = performance.now();
      } catch (_) {}
      this._detectKick();
    };
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(loop);
  }

  /** True if render loop looks alive (frame within ~2.5s). */
  isAlive(maxAgeMs = 2500) {
    if (!this.ready || !this.enabled) return true; // not expected to render
    if (!this._raf || !this.visualizer) return false;
    const t = this.lastFrameAt || 0;
    return t > 0 && (performance.now() - t) < maxAgeMs;
  }

  _detectKick() {
    const an = this.engine.masterAnalyser;
    if (!an) return;
    if (!this._freq) this._freq = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(this._freq);
    let bass = 0;
    const n = Math.min(24, this._freq.length);
    for (let i = 0; i < n; i++) bass += this._freq[i];
    bass /= n * 255;
    const now = performance.now();
    if (bass > 0.42 && now - this._lastKick > 180) {
      this._lastKick = now;
      this._beatAcc += 1;
      if (this.onKick) this.onKick(bass);
      if (this.autoCycle) {
        const every = (this.autoMode === 'beat') ? 8 : 24;
        if (this._beatAcc % every === 0) this.random(this._blend);
      }
    }
  }

  loadIndex(i, blend = this._blend) {
    if (!this.keys.length) return;
    this.index = ((i % this.keys.length) + this.keys.length) % this.keys.length;
    const name = this.keys[this.index];
    const preset = this.presets[name];
    if (this.visualizer && preset) {
      try { this.visualizer.loadPreset(preset, blend); } catch (e) { console.warn(e); }
    }
    if (this.onPresetChange) this.onPresetChange(name, this.index, this.keys.length);
  }

  next(blend = this._blend) { this.loadIndex(this.index + 1, blend); }
  prev(blend = this._blend) { this.loadIndex(this.index - 1, blend); }
  random(blend = this._blend) {
    if (this.keys.length < 2) return this.loadIndex(0, blend);
    if (!this._recent) this._recent = [];
    const psych = [];
    for (let i = 0; i < this.keys.length; i++) {
      if (PSYCH_RE.test(this.keys[i])) psych.push(i);
    }
    const pool = psych.length >= 4 ? psych : [...Array(this.keys.length).keys()];
    const avoid = new Set([this.index, ...this._recent]);
    let candidates = pool.filter((i) => !avoid.has(i));
    if (candidates.length < 1) candidates = pool.filter((i) => i !== this.index);
    if (candidates.length < 1) candidates = pool.slice();
    const i = candidates[Math.floor(Math.random() * candidates.length)];
    this._recent.push(i);
    if (this._recent.length > Math.min(12, Math.max(3, Math.floor(this.keys.length / 4)))) this._recent.shift();
    return this.loadIndex(i, blend);
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.canvas.style.visibility = on ? 'visible' : 'hidden';
  }

  setAutoCycle(on, mode = 'wander', opts = {}) {
    this.autoCycle = !!on;
    this.autoMode = mode || 'wander';
    if (this._cycleTimer) {
      clearInterval(this._cycleTimer);
      this._cycleTimer = null;
    }
    if (on) {
      // MilkDrop LIVE D — endless unique wander; optional BPM → ~8 bars between preset jumps
      const bpm = Number(opts?.bpm) || 0;
      let ms = Number(opts?.ms) || 0;
      if (!ms) {
        if (bpm > 40) ms = Math.round((8 * 4 * 60 * 1000) / bpm); // 8 bars
        else if (mode === 'beat') ms = 8000;
        else ms = 10000; // LIVE D default
      }
      ms = Math.max(5000, Math.min(24000, ms));
      this._cycleMs = ms;
      // Restart-safe interval — catch any throw so one bad preset never kills the loop
      this._cycleTimer = setInterval(() => {
        try { this.random(this._blend); } catch (err) { console.warn('MilkViz wander', err); }
      }, ms);
      // Kick once immediately so canvas never sits on a blank/stale preset
      try { this.random(Math.min(1.2, this._blend)); } catch (_) {}
    } else {
      this._cycleMs = 0;
    }
  }

  /** Re-arm wander timer if autoCycle is on but interval was cleared (heal / race). */
  ensureAutoCycle() {
    if (!this.autoCycle) return false;
    if (this._cycleTimer) return true;
    const ms = this._cycleMs || 9000;
    this.setAutoCycle(true, this.autoMode || 'wander', { ms });
    return true;
  }

  ensureAudio() {
    this._connectAudio();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._cycleTimer) clearInterval(this._cycleTimer);
    this._cycleTimer = null;
    if (this._ro) this._ro.disconnect();
  }
}
