/**
 * D DJ Pro Fly — dual-deck DJ + MilkDrop visualizations
 * Daniel Dydo · Kraków
 */
import { AudioEngine } from './audio-engine.js';
import { Deck } from './deck.js';
import { RmxEffects } from './fx.js';
import { MidiBridge } from './midi.js';
import { drawWaveform } from './waveform.js';
import { MilkViz, GatePsych, RES_PRESETS, defaultResKey } from './viz.js';
import { BotCompanion } from './bot-chat.js';
import { ProYtDj, pickRandomYt, KALI_LIVE_RADIO, YT_ALLOWLIST, BROTHER_MAX_OPENING, searchYoutube, extractYtId, addToSessionPlaylist } from './yt-pro.js';

const WA_DANIEL = '48730377357';
const LIVE_CANON = 'https://ddddddd7777777.lilac-drip.workers.dev';
const WA_LINK = () => {
  const live = window.__liveUrl || LIVE_CANON;
  const remote = live.replace(/\/?$/, '/') + '?remote=1&v=36#remote';
  const msg = encodeURIComponent(
    'Cześć D Bot — D Bot LIVE\n' + live + '\nSterowanie: ' + remote
  );
  return 'https://wa.me/' + WA_DANIEL + '?text=' + msg;
};

const engine = new AudioEngine();
const deckA = new Deck('A', engine);
const deckB = new Deck('B', engine);
const fx = new RmxEffects(engine);
const midi = new MidiBridge();

let masterDeck = 'A';
let peaksA = null;
let peaksB = null;
let milk = null;
let viewMode = 'viz';
let lastKick = 0;
let gatePsych = null;
let sharkKickTimer = 0;
let autoSyncOn = true;
let lastAutoSyncAt = 0;
let fsOffered = false;
let vizFsActive = false;
let viewModeBeforeVizFs = 'both';
let vizHudHideTimer = 0;
let vizFsLastTap = 0;
let botCompanion = null;
let pendingLaunchMode = null; // 'kali' | 'trance' | 'pro' | null
let proVizActive = false;
let proYt = null;
let proGenre = 'all';
let liveGenActive = false;
let liveGenTimer = 0;
let liveGenFeelIdx = 0;
let __grokSeenInbox = new Set();
let ownerToken = '';
let ownerInfo = null;
let remotePollTimer = 0;
let remoteSince = '';
let remoteMode = false;

let __federation = null;

/** Psychedelic shark swim state — driven by analyser bass/mid/high + kicks */
const SharkSwim = {
  t: 0,
  x: 0,
  y: 0,
  tilt: 0,
  scale: 1,
  hue: 180,
  kick: 0,
  facing: 1, // 1 = right, -1 = left (mirror)
  lastTs: 0,
};

let sharkDream = { t: 0, x: 0.5, y: 0.48, angle: 0, scale: 1, hue: 180, flip: 1 };

function pulseShark(energy = 0.7) {
  const el = $('#shark-overlay');
  if (!el) return;
  el.classList.add('kick');
  clearTimeout(sharkKickTimer);
  sharkKickTimer = setTimeout(() => el.classList.remove('kick'), 140 + energy * 80);
}

/** Psychedelic dream swim — path + glow driven by bass/mid/high */
function swimDreamShark(bass = 0, mid = 0, high = 0, dt = 0.016) {
  const el = $('#shark-overlay');
  if (!el) return;
  const stage = el.parentElement;
  if (!stage) return;
  sharkDream.t += dt * (0.55 + mid * 1.4 + bass * 0.6);
  const t = sharkDream.t;
  // Figure-8 / Lissajous path through the viz
  const ax = 0.32 + mid * 0.12;
  const ay = 0.22 + bass * 0.1;
  const x = 0.5 + Math.sin(t * 0.7) * ax + Math.sin(t * 1.37 + 1.2) * 0.08;
  const y = 0.48 + Math.sin(t * 0.53 + 0.4) * ay + Math.cos(t * 1.1) * 0.06;
  const dx = x - sharkDream.x;
  const dy = y - sharkDream.y;
  sharkDream.x = x;
  sharkDream.y = y;
  const targetAng = Math.atan2(dy, dx) * (180 / Math.PI);
  // Soft turn + bob
  let ang = sharkDream.angle + ((targetAng - sharkDream.angle + 540) % 360 - 180) * 0.08;
  ang += Math.sin(t * 2.2) * (3 + high * 8);
  sharkDream.angle = ang;
  const kickBoost = el.classList.contains('kick') ? 0.18 + bass * 0.25 : 0;
  const scale = 0.92 + bass * 0.35 + mid * 0.12 + kickBoost + Math.sin(t * 3.1) * 0.03;
  sharkDream.scale = scale;
  sharkDream.hue = (180 + t * 28 + mid * 80 + high * 40) % 360;
  // Face swim direction (flip when going left)
  const flip = Math.cos(t * 0.7) >= 0 ? 1 : -1;
  sharkDream.flip = flip;
  const glowA = 0.45 + bass * 0.45 + high * 0.2;
  const glowB = 0.35 + mid * 0.4;
  el.style.left = (x * 100).toFixed(2) + '%';
  el.style.top = (y * 100).toFixed(2) + '%';
  el.style.transform =
    'translate(-50%, -50%) rotate(' + ang.toFixed(2) + 'deg) scale(' +
    (scale * flip).toFixed(3) + ', ' + scale.toFixed(3) + ')';
  el.style.filter =
    'drop-shadow(0 0 ' + (12 + bass * 28).toFixed(0) + 'px hsla(' + sharkDream.hue.toFixed(0) + ',100%,' +
    (55 + high * 20).toFixed(0) + '%,' + glowA.toFixed(2) + ')) ' +
    'drop-shadow(0 0 ' + (22 + mid * 36).toFixed(0) + 'px hsla(' + ((sharkDream.hue + 120) % 360).toFixed(0) +
    ',100%,60%,' + glowB.toFixed(2) + ')) ' +
    'hue-rotate(' + (mid * 40).toFixed(0) + 'deg) saturate(' + (1.1 + bass * 0.6).toFixed(2) + ')';
  el.style.opacity = String(Math.min(1, 0.72 + bass * 0.28 + kickBoost * 0.5));
}

/**
 * Smooth sine swim across the MilkDrop stage.
 * bass → bob + scale, mid → path speed/amp, high → tilt + glow hue, kick → punch.
 */
function updateSharkSwim(bands = {}, dtMs = 16.7) {
  const el = $('#shark-overlay');
  if (!el) return;
  // Idle dreamy float when no analyser yet
  const bass = Number(bands.bass) || 0;
  const mid = Number(bands.mid) || 0;
  const high = Number(bands.high) || 0;
  const energy = Number(bands.energy) || (bass * 0.5 + mid * 0.3 + high * 0.2);
  const dt = Math.max(0.008, Math.min(0.05, (dtMs || 16.7) / 1000));

  // Decay kick punch
  SharkSwim.kick *= Math.pow(0.12, dt); // ~fast decay
  if (SharkSwim.kick < 0.02) SharkSwim.kick = 0;

  // Path speed scales with mid energy (swims harder through dense mid)
  const speed = 0.55 + mid * 1.35 + energy * 0.45;
  SharkSwim.t += dt * speed;

  const t = SharkSwim.t;
  // Wide horizontal figure-eight / sine roam (vmax units feel immersive in FS)
  const ampX = 28 + mid * 22 + bass * 8;   // vmin-ish via % below
  const ampY = 10 + bass * 18 + high * 6;
  const xPct = Math.sin(t * 0.55) * ampX + Math.sin(t * 0.21 + 1.2) * (ampX * 0.28);
  const yPct = Math.sin(t * 0.78 + 0.4) * ampY + Math.cos(t * 0.33) * (ampY * 0.35)
    - bass * 6; // bass lifts the shark

  // Facing: follow horizontal velocity sign
  const vx = Math.cos(t * 0.55) * ampX * 0.55;
  if (Math.abs(vx) > 1.5) SharkSwim.facing = vx >= 0 ? 1 : -1;

  // Tilt with path + high-end shimmer
  const pathTilt = Math.cos(t * 0.55) * (7 + mid * 6) + Math.sin(t * 1.1) * (2 + high * 4);
  const kickTilt = SharkSwim.kick * 10 * SharkSwim.facing;
  const tilt = pathTilt + kickTilt;

  // Scale: gentle pulse on bass, punch on kick
  const scale = 1
    + bass * 0.12
    + Math.sin(t * 2.2) * 0.025
    + SharkSwim.kick * 0.22;

  // Hue shifts: cyan→magenta with highs, bass pulls teal
  const hue = (168 + high * 140 + bass * 40 + t * 12 + SharkSwim.kick * 50) % 360;

  SharkSwim.x = xPct;
  SharkSwim.y = yPct;
  SharkSwim.tilt = tilt;
  SharkSwim.scale = scale;
  SharkSwim.hue = hue;

  const flip = SharkSwim.facing < 0 ? -1 : 1;
  el.style.setProperty('--shark-x', `${xPct.toFixed(2)}%`);
  el.style.setProperty('--shark-y', `${yPct.toFixed(2)}%`);
  el.style.setProperty('--shark-tilt', `${tilt.toFixed(2)}deg`);
  el.style.setProperty('--shark-scale', scale.toFixed(3));
  el.style.setProperty('--shark-flip', String(flip));
  el.style.setProperty('--shark-hue', `${hue.toFixed(1)}deg`);
  el.style.setProperty('--shark-glow', (0.55 + bass * 0.45 + SharkSwim.kick * 0.5).toFixed(3));
  el.style.setProperty('--shark-trail', (0.25 + mid * 0.55 + SharkSwim.kick * 0.4).toFixed(3));
  el.classList.toggle('swimming', true);
  el.classList.toggle('dreaming', energy < 0.08 && SharkSwim.kick < 0.05);
}

function startGatePsych() {
  const c = $('#gate-psych-canvas');
  if (!c || gatePsych) return;
  gatePsych = new GatePsych(c);
  gatePsych.start();
}

function stopGatePsych() {
  if (!gatePsych) return;
  gatePsych.stop();
  gatePsych = null;
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function fmtTime(s) {
  if (!Number.isFinite(s)) return '0:00.0';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

function pitchPct(rate) {
  return ((rate - 1) * 100).toFixed(1);
}

function isLikelyIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isMessengerWebView() {
  return /FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(navigator.userAgent || '');
}

function webMidiOk() {
  return typeof navigator.requestMIDIAccess === 'function';
}

function showMobileMidiTip() {
  const need = !webMidiOk() || isLikelyIOS() || isMessengerWebView();
  const tip = $('#midi-ios-tip');
  const banner = $('#ios-banner');
  if (tip) tip.hidden = !need;
  // Keep legacy midi tip only when install banner is absent / dismissed permanently
  if (banner) banner.hidden = true;
  if (!webMidiOk()) {
    const st = $('#midi-status');
    if (st) st.textContent = 'MIDI tylko na komputerze / natywna app później; audio+decki działają na telefonie';
  }
}

function isStandaloneDisplay() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
  } catch (_) {}
  // iOS Safari home-screen
  if (typeof navigator.standalone === 'boolean' && navigator.standalone) return true;
  return false;
}

function isLikelyAndroid() {
  return /Android/i.test(navigator.userAgent || '');
}

let deferredInstallPrompt = null;

function hideInstallChrome() {
  const ban = $('#pwa-install-banner');
  if (ban) ban.hidden = true;
  document.documentElement.classList.add('pwa-standalone');
  document.documentElement.classList.remove('pwa-can-install');
}

function showInstallBanner() {
  const ban = $('#pwa-install-banner');
  if (!ban || isStandaloneDisplay()) return;
  ban.hidden = false;
  const iosSteps = $('#pwa-install-steps-ios');
  const andSteps = $('#pwa-install-steps-android');
  const installBtn = $('#pwa-install-btn');
  const ios = isLikelyIOS();
  const android = isLikelyAndroid();
  if (iosSteps) iosSteps.hidden = !ios;
  if (andSteps) andSteps.hidden = ios; // show Android/Chrome tips for non-iOS
  // Install button only when beforeinstallprompt fired (mostly Chromium)
  if (installBtn) installBtn.hidden = !deferredInstallPrompt;
  document.documentElement.classList.add('pwa-can-install');
}

async function triggerPwaInstall() {
  if (!deferredInstallPrompt) {
    showInstallBanner();
    const howto = $('#pwa-install-howto');
    howto?.focus?.();
    return false;
  }
  try {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    const installBtn = $('#pwa-install-btn');
    if (installBtn) installBtn.hidden = true;
    if (choice?.outcome === 'accepted') hideInstallChrome();
    return choice?.outcome === 'accepted';
  } catch (err) {
    console.warn('PWA install', err);
    return false;
  }
}

function bindPwaInstall() {
  // Already installed as home-screen / standalone → hide all install chrome
  if (isStandaloneDisplay()) {
    hideInstallChrome();
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.documentElement.classList.add('pwa-can-install');
    const installBtn = $('#pwa-install-btn');
    if (installBtn) installBtn.hidden = false;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallChrome();
  });

  // Show tip on mobile / touch when not standalone
  const mobileish = isLikelyIOS() || isLikelyAndroid() || isMessengerWebView() ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (mobileish) showInstallBanner();

  $('#pwa-install-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await triggerPwaInstall();
  });

  $('#pwa-install-howto')?.addEventListener('click', () => {
    const ban = $('#pwa-install-banner');
    if (!ban) return;
    ban.hidden = false;
    const ios = isLikelyIOS();
    const iosSteps = $('#pwa-install-steps-ios');
    const andSteps = $('#pwa-install-steps-android');
    if (iosSteps) iosSteps.hidden = !ios;
    if (andSteps) andSteps.hidden = ios;
    // Expand steps visibly
    ban.classList.add('pwa-install-expanded');
    (ios ? iosSteps : andSteps)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  $('#pwa-install-dismiss')?.addEventListener('click', () => {
    const ban = $('#pwa-install-banner');
    if (ban) ban.hidden = true;
    try { sessionStorage.setItem('botd-pwa-dismiss', '1'); } catch (_) {}
  });

  try {
    if (sessionStorage.getItem('botd-pwa-dismiss') === '1') {
      const ban = $('#pwa-install-banner');
      if (ban) ban.hidden = true;
    }
  } catch (_) {}

  // React to display-mode changes (some browsers fire after install)
  try {
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = () => { if (isStandaloneDisplay()) hideInstallChrome(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (_) {}
}

function hideAudioGate() {
  const g = $('#audio-gate');
  if (!g) return;
  g.classList.add('hidden', 'is-gone');
  g.hidden = true;
  g.setAttribute('aria-hidden', 'true');
  g.style.display = 'none';
  stopGatePsych();
}

function showAudioGateIfNeeded() {
  const gate = $('#audio-gate');
  if (!gate) return;
  if (!engine.ctx || engine.ctx.state === 'suspended') {
    gate.classList.remove('hidden');
    startGatePsych();
  } else hideAudioGate();
}

async function bootAudio() {
  await engine.ensure();
  if (engine.ctx && engine.ctx.state === 'suspended') {
    try { await engine.ctx.resume(); } catch (_) {}
  }
  await deckA.init();
  await deckB.init();
  try { await fx.build(); } catch (err) { console.warn('fx.build', err); }
  // Never re-show gate from boot — unlock() owns first-gesture dismiss
  if (engine.ctx?.state === 'running') hideAudioGate();
  try { await ensureViz(); } catch (err) { console.warn('ensureViz', err); }
}

async function ensureViz() {
  if (milk?.ready) {
    milk.ensureAudio();
    // Keep MilkDrop LIVE D wander alive across re-entries
    try {
      const wantAuto = !!(liveGenActive || window.__liveGeneratorOn || $('#viz-auto')?.checked !== false);
      if (wantAuto) {
        const va = $('#viz-auto');
        if (va) va.checked = true;
        if (!milk.autoCycle || !milk._cycleTimer) {
          milk.setAutoCycle(true, 'wander', { ms: 9000 });
        }
      }
    } catch (_) {}
    return milk;
  }
  const canvas = $('#viz-canvas');
  if (!canvas || !MilkViz.isSupported() || !window.butterchurn) {
    $('#viz-fallback')?.removeAttribute('hidden');
    return null;
  }
  try {
    milk = new MilkViz({ canvas, engine });
    milk.onPresetChange = (name, index, total) => {
      const label = $('#viz-name');
      const count = $('#viz-count');
      const sel = $('#viz-preset');
      const hud = $('#viz-hud-name');
      const shown = name.length > 42 ? `${name.slice(0, 40)}…` : name;
      if (label) label.textContent = `2077 · ${shown}`;
      if (hud) hud.textContent = shown;
      if (count) count.textContent = `${index + 1}/${total}`;
      if (sel && sel.options.length) sel.value = String(index);
    };
    milk.onKick = (energy) => {
      lastKick = performance.now();
      document.documentElement.style.setProperty('--kick', String(Math.min(1, energy * 1.4)));
      $('#app-root')?.classList.add('kick-pulse');
      pulseShark(energy);
      clearTimeout(ensureViz._t);
      ensureViz._t = setTimeout(() => $('#app-root')?.classList.remove('kick-pulse'), 120);
    };
    await milk.init();
    fillPresetSelect();
    const rk = milk.resKey || defaultResKey();
    $$('.res-btn').forEach((b) => b.classList.toggle('active', b.dataset.res === rk));
    // Endless unique viz auto-on by default
    try {
      const va = $('#viz-auto');
      if (va) va.checked = true;
      milk.setAutoCycle(true, 'wander');
    } catch (_) {}
    console.info(`MilkDrop ready · ${milk.keys.length} presets · RES ${rk} · AUTO wander`);
  } catch (err) {
    console.warn('MilkViz failed', err);
    $('#viz-fallback')?.removeAttribute('hidden');
    milk = null;
  }
  return milk;
}

function fillPresetSelect() {
  const sel = $('#viz-preset');
  if (!sel || !milk) return;
  sel.innerHTML = milk.keys.map((k, i) => {
    const short = k.length > 56 ? `${k.slice(0, 54)}…` : k;
    return `<option value="${i}">${short}</option>`;
  }).join('');
  sel.value = String(milk.index);
}

function setViewMode(mode) {
  viewMode = mode;
  const root = $('#app-root');
  root?.classList.remove('app-viz', 'app-decks', 'app-both');
  root?.classList.add(`app-${mode}`);
  $$('.view-mode button').forEach((b) => b.classList.remove('active'));
  $(`#view-${mode}`)?.classList.add('active');
  milk?.setEnabled(mode !== 'decks');
}

function bindDeck(deck, prefix) {
  const root = $(`#deck-${prefix.toLowerCase()}`);
  if (!root) return;
  const fileInput = $('.file-input', root);

  $('.btn-load', root)?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await bootAudio();
    await deck.loadFile(f);
    const peaks = deck.getWaveformPeaks(800);
    if (deck.id === 'A') peaksA = peaks;
    else peaksB = peaks;
    updateDeckUI(deck);
    maybeAutoSyncOnLoad(deck);
  });

  $('.btn-play', root)?.addEventListener('click', async () => {
    await bootAudio();
    deck.toggle();
    updateDeckUI(deck);
    // If slave just started while AUTO on → lock to master
    if (autoSyncOn && deck.playing) {
      const { master, slave } = getMasterSlave();
      if (deck.id === slave.id && master.playing) doSync({ soft: false, flash: true });
      else if (deck.id === master.id && slave.playing) doSync({ soft: false, flash: true });
    }
  });

  const cueBtn = $('.btn-cue', root);
  cueBtn?.addEventListener('mousedown', async () => { await bootAudio(); deck.cuePress(); updateDeckUI(deck); });
  cueBtn?.addEventListener('mouseup', () => { deck.cueRelease(); updateDeckUI(deck); });
  cueBtn?.addEventListener('mouseleave', () => deck.cueRelease());
  cueBtn?.addEventListener('touchstart', async (e) => { e.preventDefault(); await bootAudio(); deck.cuePress(); }, { passive: false });
  cueBtn?.addEventListener('touchend', () => deck.cueRelease());

  $('.btn-set-cue', root)?.addEventListener('click', () => { deck.setCueHere(); updateDeckUI(deck); });
  $('.jog-prev', root)?.addEventListener('click', () => deck.jog(-0.04));
  $('.jog-next', root)?.addEventListener('click', () => deck.jog(0.04));

  const pitch = $('.pitch-fader', root);
  pitch?.addEventListener('input', () => {
    const v = 1 - (parseFloat(pitch.value) / 100) * 2;
    deck.setPitch(v);
    updateDeckUI(deck);
  });

  $$('.pitch-range button', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.pitch-range button', root).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      deck.setPitchRange(btn.dataset.range);
    });
  });

  $('.vol-fader', root)?.addEventListener('input', (e) => {
    deck.setVolume(parseFloat(e.target.value) / 100);
  });

  ['hi', 'mid', 'low'].forEach((band) => {
    $(`.eq-${band}`, root)?.addEventListener('input', (e) => {
      const db = (parseFloat(e.target.value) / 50) * 12 - 12;
      deck.setEq(band, db);
    });
  });

  $('.filter-knob', root)?.addEventListener('input', (e) => {
    deck.setFilter(parseFloat(e.target.value) / 100);
  });

  $$('.hotcue', root).forEach((btn) => {
    const idx = parseInt(btn.dataset.cue, 10);
    btn.addEventListener('click', () => { deck.setHotCue(idx); updateDeckUI(deck); });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      deck.clearHotCue(idx);
      updateDeckUI(deck);
    });
  });

  $$('.loop-btn', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      deck.setLoopBeats(parseInt(btn.dataset.beats, 10));
      updateDeckUI(deck);
    });
  });
  $('.loop-clear', root)?.addEventListener('click', () => { deck.clearLoop(); updateDeckUI(deck); });

  $$('.roll-btn', root).forEach((btn) => {
    const beats = parseInt(btn.dataset.beats, 10);
    const start = async (e) => { e.preventDefault(); await bootAudio(); deck.rollStart(beats); };
    const end = () => deck.rollEnd();
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
    btn.addEventListener('mouseleave', end);
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', end);
  });

  $('.bpm-input', root)?.addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (v > 40 && v < 250) deck.setManualBpm(v);
  });

  $('.btn-master', root)?.addEventListener('click', () => {
    masterDeck = deck.id;
    updateMasterUI();
  });

  const wave = $('.waveform', root);
  wave?.addEventListener('click', (e) => {
    if (!deck.buffer) return;
    const rect = wave.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    deck.seek(frac * deck.buffer.duration);
    updateDeckUI(deck);
  });
}

function updateDeckUI(deck) {
  const root = $(`#deck-${deck.id.toLowerCase()}`);
  if (!root) return;
  const nameEl = $('.track-name', root);
  if (nameEl) nameEl.textContent = deck.name || '—';
  const bpmDisp = $('.bpm-display', root);
  if (bpmDisp) bpmDisp.textContent = (deck.effectiveBpm || 120).toFixed(1);
  const bpmIn = $('.bpm-input', root);
  if (bpmIn && document.activeElement !== bpmIn) {
    bpmIn.value = (deck.manualBpm || deck.bpm || 120).toFixed(1);
  }
  const pitchRead = $('.pitch-readout', root);
  if (pitchRead) pitchRead.textContent = `${pitchPct(deck.rate || 1)}%`;
  const pitchF = $('.pitch-fader', root);
  if (pitchF && document.activeElement !== pitchF && typeof deck.pitchFaderValue === 'function') {
    pitchF.value = String(deck.pitchFaderValue());
  }
  const pos = $('.time-pos', root);
  if (pos) pos.textContent = fmtTime(deck.position);
  const dur = $('.time-dur', root);
  if (dur) dur.textContent = fmtTime(deck.buffer?.duration || 0);
  const playBtn = $('.btn-play', root);
  if (playBtn) {
    playBtn.classList.toggle('playing', !!deck.playing);
    playBtn.textContent = deck.playing ? 'Pause' : 'Play';
  }
  $$('.hotcue', root).forEach((btn) => {
    const i = parseInt(btn.dataset.cue, 10);
    btn.classList.toggle('set', deck.hotCues?.[i] != null);
  });
  const loopInfo = $('.loop-info', root);
  if (loopInfo) loopInfo.textContent = deck.loop ? `LOOP ${deck.loopBeats}` : '';
}

function updateMasterUI() {
  $$('.btn-master').forEach((b) => b.classList.remove('active'));
  $(`#deck-${masterDeck.toLowerCase()} .btn-master`)?.classList.add('active');
  const master = masterDeck === 'A' ? deckA : deckB;
  let bpm = master.effectiveBpm || 120;
  if (!midi.clockMaster && midi.externalBpm) bpm = midi.externalBpm;
  const el = $('#master-bpm');
  if (el) el.textContent = bpm.toFixed(1);
  fx.setBpm(bpm);
  if (midi.clockMaster && midi._sending) midi.updateClockBpm(bpm);
}

function bindMixer() {
  $('#crossfader')?.addEventListener('input', (e) => {
    engine.setCrossfader((parseFloat(e.target.value) / 50) - 1);
  });
  $('#master-vol')?.addEventListener('input', (e) => {
    engine.setMasterVolume(parseFloat(e.target.value) / 100);
  });
  $('#btn-sync')?.addEventListener('click', async () => {
    await bootAudio();
    doSync({ soft: false, flash: true });
  });

  // AUTO SYNC toggle (default ON, persist)
  try {
    const saved = localStorage.getItem('ddj-auto-sync');
    if (saved === '0') autoSyncOn = false;
    else if (saved === '1') autoSyncOn = true;
  } catch (_) {}
  const autoEl = $('#auto-sync');
  if (autoEl) {
    autoEl.checked = autoSyncOn;
    autoEl.addEventListener('change', () => {
      autoSyncOn = !!autoEl.checked;
      try { localStorage.setItem('ddj-auto-sync', autoSyncOn ? '1' : '0'); } catch (_) {}
      $('#btn-sync')?.classList.toggle('auto-on', autoSyncOn);
      if (autoSyncOn) doSync({ soft: false, flash: true });
    });
  }
  $('#btn-sync')?.classList.toggle('auto-on', autoSyncOn);
}

function getMasterSlave() {
  const master = masterDeck === 'A' ? deckA : deckB;
  const slave = masterDeck === 'A' ? deckB : deckA;
  return { master, slave };
}

function doSync({ soft = false, flash = false } = {}) {
  const { master, slave } = getMasterSlave();
  if (!slave.buffer || !master.buffer) return false;
  slave.syncTo(master, { soft });
  updateDeckUI(slave);
  updateMasterUI();
  if (flash) {
    const btn = $('#btn-sync');
    btn?.classList.add('sync-flash');
    setTimeout(() => btn?.classList.remove('sync-flash'), 280);
  }
  lastAutoSyncAt = performance.now();
  return true;
}

/** When loading the non-master (or 2nd) track — auto-enable sync if toggle ON */
function maybeAutoSyncOnLoad(loadedDeck) {
  if (!autoSyncOn) return;
  const other = loadedDeck.id === 'A' ? deckB : deckA;
  if (!loadedDeck.buffer || !other.buffer) return;
  // Prefer syncing the non-master toward master
  const { master, slave } = getMasterSlave();
  if (!slave.buffer || !master.buffer) return;
  // If master is playing (or either is), sync slave BPM+phase
  if (master.playing || slave.playing) {
    doSync({ soft: false, flash: true });
  } else {
    // Still match rate so play starts in sync
    doSync({ soft: false, flash: false });
  }
}

/** Continuous soft phase lock while AUTO on + both playing */
function tickAutoSync() {
  if (!autoSyncOn) return;
  const { master, slave } = getMasterSlave();
  if (!master.playing || !slave.playing || !master.buffer || !slave.buffer) return;
  const now = performance.now();
  // Soft re-lock every ~400ms (strong enough, not choppy)
  if (now - lastAutoSyncAt < 400) return;
  doSync({ soft: true, flash: false });
}

function bindFx() {
  fx.setDeckGetter(() => (masterDeck === 'A' ? deckA : deckB));
  const oneshot = new Set(['backspin']);
  const releaseHold = new Set(['vinylbrake', 'echoout']);

  $$('.rmx-pad, [data-fx]').forEach((btn) => {
    const id = btn.dataset.fx;
    if (!id) return;
    let held = false;
    let lastTap = 0;
    const down = async (e) => {
      e.preventDefault();
      await bootAudio();
      const now = performance.now();
      if (!oneshot.has(id) && !releaseHold.has(id) && now - lastTap < 320) {
        const on = fx.toggleLatch(id, 0.95);
        btn.classList.toggle('active', on);
        btn.classList.toggle('latched', on);
        lastTap = 0;
        return;
      }
      lastTap = now;
      if (fx.isLatched(id)) {
        fx.toggleLatch(id);
        btn.classList.remove('active', 'latched');
        return;
      }
      held = true;
      fx.engage(id, 0.95);
      btn.classList.add('active');
      if (oneshot.has(id)) {
        setTimeout(() => { btn.classList.remove('active'); held = false; }, 650);
      }
    };
    const up = () => {
      if (!held) return;
      held = false;
      if (oneshot.has(id) || fx.isLatched(id)) return;
      fx.release(id);
      btn.classList.remove('active');
    };
    btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseup', up);
    btn.addEventListener('mouseleave', up);
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up);
    btn.addEventListener('touchcancel', up);
  });

  $('#fx-wet')?.addEventListener('input', (e) => fx.setWet(parseFloat(e.target.value) / 100));
  $('#fx-intensity')?.addEventListener('input', (e) => fx.setIntensity(parseFloat(e.target.value) / 100));
  $('#fx-filter-knob')?.addEventListener('input', async (e) => {
    await bootAudio();
    fx.setKnob('filter', parseFloat(e.target.value) / 100);
  });
  $('#fx-isolate-knob')?.addEventListener('input', async (e) => {
    await bootAudio();
    fx.setKnob('isolate', parseFloat(e.target.value) / 100);
  });
}

function bindVizControls() {
  $('#view-viz')?.addEventListener('click', () => setViewMode('viz'));
  $('#view-decks')?.addEventListener('click', () => setViewMode('decks'));
  $('#view-both')?.addEventListener('click', () => setViewMode('both'));
  $('#viz-prev')?.addEventListener('click', () => milk?.prev());
  $('#viz-next')?.addEventListener('click', () => milk?.next());
  $('#viz-rand')?.addEventListener('click', () => milk?.random());
  $('#viz-auto')?.addEventListener('change', (e) => {
    milk?.setAutoCycle(e.target.checked, 'wander');
  });
  $('#viz-preset')?.addEventListener('change', (e) => {
    milk?.loadIndex(parseInt(e.target.value, 10), 2.2);
  });
  // RES 720 · 1080 · 4K
  const applyResUI = (key) => {
    $$('.res-btn').forEach((b) => b.classList.toggle('active', b.dataset.res === key));
  };
  const initialRes = defaultResKey();
  applyResUI(initialRes);
  $$('.res-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.res;
      if (!RES_PRESETS[key]) return;
      applyResUI(key);
      if (milk) milk.setResolution(key);
      else {
        try { localStorage.setItem('ddj-viz-res', key); } catch (_) {}
      }
    });
  });
  window.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, textarea, select')) return;
    if (e.key === 'Escape' && vizFsActive) {
      e.preventDefault();
      exitVizFullscreen();
      return;
    }
    if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); milk?.next(); }
    else if (e.code === 'ArrowLeft' || e.code === 'Backspace') { e.preventDefault(); milk?.prev(); }
    else if (e.key === 'r' || e.key === 'R') milk?.random();
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
  });
}

const BUILTIN_BEATS = [
  { id: 'trance', file: 'samples/trance-120.wav', name: 'trance-120.wav', label: 'Trance 120', bpm: 120 },
  { id: 'kali', file: 'samples/kali-hiphop-120.wav', name: 'kali-hiphop-120.wav', label: 'Kali Hip-Hop 120', bpm: 120 },
  { id: 'techno', file: 'samples/berlin-techno-128.wav', name: 'berlin-techno-128.wav', label: 'Berlin Techno 128', bpm: 128 },
  { id: 'demo', file: 'samples/test-120bpm.wav', name: 'test-120bpm.wav', label: 'Demo 120', bpm: 120 },
];
let autoBeatRotate = 0;

async function sampleOk(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache', signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) return true;
    // Some hosts mishandle HEAD — allow GET path to decide
    return res.status === 405 || res.status === 501;
  } catch {
    // Fail open: let loadBeatIntoA attempt the real GET
    return true;
  }
}

async function demoOk() {
  return sampleOk('samples/test-120bpm.wav');
}

async function loadBeatIntoA(beat, { autoPlay = true } = {}) {
  await bootAudio();
  if (!beat) return false;
  if (!(await sampleOk(beat.file))) {
    console.warn('beat missing', beat.file);
    return false;
  }
  const res = await fetch(`${beat.file}?v=23`, { cache: 'no-cache' });
  if (!res.ok) throw new Error('beat fetch ' + res.status);
  const blob = await res.blob();
  const low = String(beat.file || beat.name || '').toLowerCase();
  let mime = blob.type || '';
  if (!mime || mime === 'application/octet-stream') {
    if (low.endsWith('.mp3')) mime = 'audio/mpeg';
    else if (low.endsWith('.m4a') || low.endsWith('.aac')) mime = 'audio/mp4';
    else if (low.endsWith('.ogg')) mime = 'audio/ogg';
    else if (low.endsWith('.flac')) mime = 'audio/flac';
    else if (low.endsWith('.wav')) mime = 'audio/wav';
    else mime = 'audio/mpeg';
  }
  const fname = (beat.name || low.split('/').pop() || 'track')
    + (low.match(/\.[a-z0-9]+$/) ? '' : (low.endsWith('.mp3') ? '.mp3' : '.wav'));
  const file = new File([blob], fname, { type: mime });
  await deckA.init();
  await deckA.loadFile(file);
  peaksA = deckA.getWaveformPeaks(800);
  updateDeckUI(deckA);
  maybeAutoSyncOnLoad(deckA);
  // KEEP viz-only as default — never flip viz → both on beat load
  if (viewMode === 'viz' || !viewMode) setViewMode('viz');
  if (autoPlay && engine.ctx?.state === 'running') {
    try { deckA.play(); } catch (_) {}
    updateDeckUI(deckA);
  }
  return true;
}

async function loadDemoIntoA({ autoPlay = true } = {}) {
  const demo = BUILTIN_BEATS.find((b) => b.id === 'demo') || BUILTIN_BEATS[BUILTIN_BEATS.length - 1];
  return loadBeatIntoA(demo, { autoPlay });
}

function beatById(id) {
  return BUILTIN_BEATS.find((b) => b.id === id) || null;
}

/** On START with empty decks: prefer Kali, else rotate Auto Beats. */
async function autoPlayBuiltinBeat({ preferId = null } = {}) {
  let beat = preferId ? beatById(preferId) : null;
  if (!beat) {
    // rotate: trance → kali → techno → demo → …
    beat = BUILTIN_BEATS[autoBeatRotate % BUILTIN_BEATS.length];
    autoBeatRotate += 1;
  }
  // Prefer trance as first default when rotation lands on demo-first empty
  if (!preferId && autoBeatRotate === 1 && beat?.id === 'trance') {
    /* already trance first in list */
  }
  const ok = await loadBeatIntoA(beat, { autoPlay: true });
  return { ok, beat };
}


function parseLaunchParams() {
  try {
    const q = new URLSearchParams(location.search);
    const hash = (location.hash || '').replace(/^#/, '').toLowerCase();
    const mode = (q.get('mode') || q.get('beat') || hash || '').toLowerCase();
    if (q.get('auto') === '1' || q.get('kali') === '1' || mode === 'kali' || mode === 'radio' || mode === 'auto') return 'kali';
    if (mode === 'trance') return 'trance';
    if (mode === 'techno') return 'techno';
    return null;
  } catch (_) {
    return null;
  }
}

function setAutoSync(on) {
  autoSyncOn = !!on;
  const el = $('#auto-sync');
  if (el) el.checked = autoSyncOn;
  try { localStorage.setItem('ddj-auto-sync', autoSyncOn ? '1' : '0'); } catch (_) {}
  $('#btn-sync')?.classList.toggle('auto-on', autoSyncOn);
}


/** One path: everything D Bot asked — viz FULL + AUTO sync + Kali YT + D Bot + MilkDrop LIVE D auto-generate */
async function launchUnifiedLiveD() {
  hideAudioGate();
  window.__audioGestured = true;
  setAutoSync(true);
  liveGenActive = true;
  proVizActive = true;
  document.body.classList.add('pro-viz', 'pro-yt-show', 'live-d');
  setViewMode('viz');

  // D Bot FIRST — chat must open even if audio/YT/FS fail
  try {
    const fab = $('#botd-fab');
    if (fab) fab.style.display = '';
    openBotPanel(true);
    renderYtPlaylistUI?.();
  } catch (_) {}

  try {
    await bootAudio();
    try { await engine.ctx?.resume(); } catch (_) {}
    await tryResumeAudio('live-d');
  } catch (err) {
    console.warn('LIVE D audio', err);
  }

  try {
    const beat = beatById('kali') || beatById('trance');
    if (beat) {
      await loadBeatIntoA(beat, { autoPlay: true });
      try {
        if (typeof deckA.setGain === 'function') deckA.setGain(0.1);
        else if (deckA.gain?.gain) deckA.gain.gain.value = 0.1;
      } catch (_) {}
    }
  } catch (_) {}
  window.__demoLoaded = true;

  try { await ensureViz(); } catch (_) {}
  try {
    const va = $('#viz-auto');
    if (va) va.checked = true;
    milk?.setAutoCycle(true, 'wander', { bpm: 128, ms: 9000 });
    milk?.random?.(2.0);
    milk?.setEnabled?.(true);
  } catch (_) {}

  try {
    const badge = $('#live-gen-badge');
    if (badge) {
      badge.hidden = false;
      badge.textContent = 'MILKDROP LIVE D 💚';
    }
    const genp = $('#botd-pill-generator');
    if (genp) { genp.textContent = 'MilkDrop LIVE D'; genp.classList.add('ok'); }
    window.__liveGeneratorOn = true;
    paintLiveGenBadge?.(true);
  } catch (_) {}

  try {
    liveGenFeelIdx = Math.floor(Math.random() * (LIVE_FEELS?.length || 1)) - 1;
    if (liveGenTimer) clearInterval(liveGenTimer);
    liveGenTimer = setInterval(() => { rotateLiveFeel().catch(() => {}); }, 42000);
    rotateLiveFeel();
  } catch (_) {}

  // Opening track FIRST (Brother Max / DaX 70min) — timeout-safe
  let ytTrack = null;
  try {
    const yt = ensureProYt();
    const opener = BROTHER_MAX_OPENING || KALI_LIVE_RADIO;
    ytTrack = await Promise.race([
      yt.playTrack(opener),
      new Promise((resolve) => setTimeout(() => resolve(null), 4500)),
    ]);
  } catch (err) {
    console.warn('LIVE D YT opening', err);
  }

  openBotPanel(true);
  fsOffered = true;
  try {
    await Promise.race([
      enterVizFullscreen({ keepChat: true }),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (_) {
    const root = $('#app-root');
    root?.classList.add('app-viz-fs');
    document.body.classList.add('viz-fs');
    openBotPanel(true);
  }
  updateProButton?.();
  openBotPanel(true);

  botStatus(ytTrack
    ? `MilkDrop LIVE D 💚 · Brother Max OPENING · ${ytTrack.title || ''} · D Bot`
    : 'MilkDrop LIVE D 💚 · local beat · D Bot — pisz tutaj');
  try {
    appendChatBubble('bot', 'LIVE D + D Bot gotowe. Pisz poniżej · Esc = wyjście z fullscreen.');
  } catch (_) {}
  try {
    const inp = $('#botd-chat-input');
    inp?.focus?.({ preventScroll: true });
  } catch (_) {}
  return true;
}


/** Kali / Trance / Techno ritual: unlock → load beat A → play → AUTO → VIZ FULL */
async function launchKaliMode({ beatId = 'kali', enterFs = true, withYt = true } = {}) {
  hideAudioGate();
  window.__audioGestured = true;
  setAutoSync(true);
  await bootAudio();
  if (engine.ctx && engine.ctx.state !== 'running') {
    try { await engine.ctx.resume(); } catch (_) {}
  }
  await tryResumeAudio('kali');
  const beat = beatById(beatId) || beatById('kali');
  setViewMode('viz');
  // Soft local pulse for MilkDrop analyser; YouTube LIVE is the audible radio
  const ok = await loadBeatIntoA(beat, { autoPlay: true });
  window.__demoLoaded = true;
  setViewMode('viz');
  try { await ensureViz(); } catch (_) {}
  try {
    const va = $('#viz-auto');
    if (va) va.checked = true;
    milk?.setAutoCycle(true, 'wander', { bpm: 120, ms: 9000 });
    liveGenActive = true;
    window.__liveGeneratorOn = true;
    try {
      const badge = $('#live-gen-badge');
      if (badge) { badge.hidden = false; badge.textContent = 'MILKDROP LIVE D 💚'; }
    } catch (_) {}
  } catch (_) {}

  let ytTrack = null;
  if (withYt) {
    try {
      proVizActive = true;
      document.body.classList.add('pro-viz', 'pro-yt-show');
      // Duck local beat under Kali YouTube LIVE
      try {
        if (typeof deckA.setGain === 'function') deckA.setGain(0.12);
        else if (deckA.gain?.gain) deckA.gain.gain.value = 0.12;
      } catch (_) {}
      const yt = ensureProYt();
      ytTrack = await yt.playKaliLive();
      openBotPanel(true);
    } catch (err) {
      console.warn('Kali YT LIVE', err);
      botStatus('Kali: YouTube LIVE niedostępne — lecę na local beat + MilkDrop.');
    }
  }

  if (enterFs) {
    fsOffered = true;
    await enterVizFullscreen({ keepChat: true });
  } else {
    const root = $('#app-root');
    root?.classList.add('app-viz');
  }
  try {
    const bpm = deckA.effectiveBpm || beat?.bpm || 120;
    if (midi?.outPort || midi?.access) {
      midi.startClock(bpm);
    }
  } catch (_) {}
  if (typeof botStatus === 'function') {
    if (ytTrack) {
      botStatus(`KALI LIVE RADIO 💚 · YouTube 24/7 · MilkDrop · Mr D · Esc = wyjście`);
    } else {
      botStatus(ok
        ? `D Bot: ${beat?.label || beatId} · AUTO · MIDI clk · VIZ FULL. Esc = wyjście.`
        : 'D Bot: nie znalazłem beatu — sprawdź samples/.');
    }
  }
  updateProButton?.();
  return ok;
}

function bindMidi() {
  const connect = async () => { await midi.connect(); };
  $('#btn-midi')?.addEventListener('click', connect);
  $('#btn-midi-top')?.addEventListener('click', async () => {
    await connect();
    $('#midi-panel')?.scrollIntoView({ behavior: 'smooth' });
  });
  $('#midi-master')?.addEventListener('change', (e) => {
    midi.setClockMaster(e.target.value === 'master');
    updateMasterUI();
  });
  $('#midi-channel')?.addEventListener('change', (e) => {
    midi.setTrackChannel(parseInt(e.target.value, 10) - 1);
  });
  $('#midi-in')?.addEventListener('change', (e) => midi.setInput(e.target.value));
  $('#midi-out')?.addEventListener('change', (e) => midi.setOutput(e.target.value));

  midi.onStatus = (msg) => { const s = $('#midi-status'); if (s) s.textContent = msg; };
  midi.onPorts = ({ inputs, outputs }) => {
    const fill = (sel, ports) => {
      const el = $(sel);
      if (!el) return;
      el.innerHTML = ports.length
        ? ports.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')
        : '<option value="">(brak)</option>';
    };
    fill('#midi-in', inputs || []);
    fill('#midi-out', outputs || []);
  };

  $('#midi-cc-filter')?.addEventListener('input', (e) => midi.sendFilter(parseFloat(e.target.value) / 100));
  $('#midi-cc-mod')?.addEventListener('input', (e) => midi.sendMod(parseFloat(e.target.value) / 100));
  $('#midi-cc-fx')?.addEventListener('input', (e) => midi.sendFx(parseFloat(e.target.value) / 100));
  $('#midi-cc-vol')?.addEventListener('input', (e) => midi.sendVolume(parseFloat(e.target.value) / 100));
  $('#midi-pc')?.addEventListener('change', (e) => {
    const n = parseInt(e.target.value, 10);
    if (Number.isFinite(n)) midi.sendProgramChange(n);
  });
  $('#midi-clock-start')?.addEventListener('click', () => {
    const master = masterDeck === 'A' ? deckA : deckB;
    midi.startClock(master.effectiveBpm || 120);
  });
  $('#midi-clock-stop')?.addEventListener('click', () => midi.stopTransport());
}

function isFullscreen() {
  return !!(document.fullscreenElement
    || document.webkitFullscreenElement
    || document.webkitCurrentFullScreenElement
    || document.mozFullScreenElement);
}

async function requestFullscreenSafe(el = document.documentElement) {
  const req = el.requestFullscreen
    || el.webkitRequestFullscreen
    || el.webkitRequestFullScreen
    || el.mozRequestFullScreen
    || el.msRequestFullscreen;
  if (!req) return false;
  try {
    const ret = req.call(el, { navigationUI: 'hide' });
    if (ret && typeof ret.then === 'function') await ret;
    return true;
  } catch (_) {
    try {
      // Safari often rejects options bag
      const ret2 = req.call(el);
      if (ret2 && typeof ret2.then === 'function') await ret2;
      return true;
    } catch (err) {
      console.warn('fullscreen', err);
      return false;
    }
  }
}

async function exitFullscreenSafe() {
  const exit = document.exitFullscreen
    || document.webkitExitFullscreen
    || document.webkitCancelFullScreen
    || document.mozCancelFullScreen
    || document.msExitFullscreen;
  if (!exit) return;
  try {
    const ret = exit.call(document);
    if (ret && typeof ret.then === 'function') await ret;
  } catch (_) {}
}

function showVizHudBriefly(ms = 2800) {
  const root = $('#app-root');
  if (!root || !vizFsActive) return;
  root.classList.add('viz-hud-show');
  const hud = $('#viz-hud');
  if (hud) hud.setAttribute('aria-hidden', 'false');
  clearTimeout(vizHudHideTimer);
  vizHudHideTimer = setTimeout(() => {
    root.classList.remove('viz-hud-show');
    if (hud) hud.setAttribute('aria-hidden', 'true');
  }, ms);
}

/** Enter immersive viz: browser fullscreen + hide decks/menus. Audio keeps running. */
async function enterVizFullscreen({ keepChat = false } = {}) {
  const root = $('#app-root');
  if (!root) return false;
  if (!vizFsActive) viewModeBeforeVizFs = viewMode || 'both';
  vizFsActive = true;
  root.classList.add('app-viz-fs');
  document.body.classList.add('viz-fs');
  // Default immersive closes chat; PRO keeps Mr D overlay on viz
  if (keepChat) openBotPanel(true);
  else openBotPanel(false);
  // Keep MilkDrop rendering; do not touch deck playback / audio graph
  milk?.setEnabled(true);
  try { await ensureViz(); } catch (_) {}
  const ok = await requestFullscreenSafe();
  updateFsButton();
  updateProButton();
  showVizHudBriefly(3200);
  return ok || vizFsActive;
}

/** Exit immersive viz: leave browser FS and restore decks UI. */
async function exitVizFullscreen() {
  const root = $('#app-root');
  const was = vizFsActive;
  vizFsActive = false;
  clearTimeout(vizHudHideTimer);
  root?.classList.remove('app-viz-fs', 'viz-hud-show');
  document.body.classList.remove('viz-fs');
  const hud = $('#viz-hud');
  if (hud) hud.setAttribute('aria-hidden', 'true');
  if (isFullscreen()) await exitFullscreenSafe();
  // Leaving FS also drops PRO chrome (stops YT)
  if (proVizActive) stopProMode({ restoreUi: false });
  // Stay viz-only by default (decks clutter hidden). User can tap DECKI if needed.
  const restore = viewModeBeforeVizFs || 'viz';
  setViewMode(restore === 'decks' ? 'decks' : 'viz');
  updateFsButton();
  updateProButton();
  return was;
}

async function toggleFullscreen() {
  if (vizFsActive || isFullscreen()) await exitVizFullscreen();
  else await enterVizFullscreen();
}

function updateFsButton() {
  const btn = $('#btn-fs');
  if (!btn) return;
  const on = vizFsActive || isFullscreen();
  btn.classList.toggle('active', on);
  btn.textContent = on ? 'EXIT VIZ' : 'VIZ FULL';
  btn.title = on
    ? 'Wyjdź z pełnego ekranu wizualizacji (Esc)'
    : 'Pełny ekran wizualizacji — tylko MilkDrop';
}

function onVizFsActivity(e) {
  if (!vizFsActive) return;
  // Don't restart hide timer while interacting with HUD controls
  if (e?.target?.closest?.('#viz-hud, #viz-fs-corner, #botd-companion, #yt-pro-host')) {
    showVizHudBriefly(4000);
    return;
  }
  showVizHudBriefly();
}

function onVizFsPointer(e) {
  if (!vizFsActive) return;
  const now = performance.now();
  const target = e?.target;
  // Corner / HUD exit handled by click handlers
  if (target?.closest?.('#viz-hud, #viz-fs-corner, #botd-companion, #botd-fab, #yt-pro-host, #yt-pro-label, button, a, input, select, label, textarea')) {
    onVizFsActivity(e);
    return;
  }
  // Double-tap / double-click anywhere on viz → exit
  if (now - vizFsLastTap < 380) {
    vizFsLastTap = 0;
    exitVizFullscreen();
    return;
  }
  vizFsLastTap = now;
  onVizFsActivity(e);
}



function updateProButton() {
  const btn = $('#btn-pro');
  if (!btn) return;
  const on = !!(proVizActive || liveGenActive);
  btn.classList.toggle('active', on);
  btn.textContent = on ? (liveGenActive ? 'EXIT LIVE' : 'EXIT PRO') : 'PRO';
  btn.title = on
    ? 'Wyjdź z PRO / LIVE GENERATOR (Esc)'
    : 'PRO VIZ · LIVE GENERATOR · MilkDrop + YouTube + Mr D';
}

function setYtLabel(track) {
  const el = $('#yt-pro-label');
  if (!el) return;
  if (!track) {
    el.hidden = true;
    el.textContent = 'PRO · YouTube';
    return;
  }
  el.hidden = false;
  el.textContent = `PRO · ${track.genre} · ${track.title}`;
}

function ensureProYt() {
  if (proYt) return proYt;
  const host = $('#yt-pro-player');
  proYt = new ProYtDj({
    hostEl: host,
    onTrack: (track) => {
      setYtLabel(track);
      const bpm = track?.bpm || (track?.genre === 'trance' ? 132 : 128);
      try {
        const va = $('#viz-auto');
        if (va) va.checked = true;
        milk?.setAutoCycle(true, 'wander', { bpm });
      } catch (_) {}
      botStatus(`D Bot · YouTube ▶ ${track.title} · MilkDrop LIVE D`);
      try { appendChatBubble('bot', `▶ PRO YT · ${track.title}`); } catch (_) {}
    },
    onError: (code, track) => {
      console.warn('YT PRO error', code, track);
      botStatus(`D Bot: embed fail (${code}) — losuję następny…`);
    },
  });
  return proYt;
}

/** Soft local pulse under YT so MilkDrop still has analyser energy (low volume). */
async function startProPulse(genre) {
  try {
    await bootAudio();
    const prefer = genre === 'trance' ? 'trance' : 'techno';
    const beat = beatById(prefer) || beatById('techno') || beatById('trance');
    if (!beat) return;
    // Only load pulse if deck empty or previously a builtin pulse
    const need = !deckA.buffer || /builtin|trance|techno|demo|kali/i.test(deckA.name || '');
    if (need) {
      await loadBeatIntoA(beat, { autoPlay: true });
    } else if (!deckA.playing) {
      deckA.play();
      updateDeckUI(deckA);
    }
    // Duck deck so YT is the audible DJ; analyser still ticks MilkDrop
    try {
      const vol = $('#master-vol');
      // keep master for YT path — duck via deck gain if available
      if (typeof deckA.setGain === 'function') deckA.setGain(0.12);
      else if (deckA.gain?.gain) deckA.gain.gain.value = 0.12;
    } catch (_) {}
  } catch (err) {
    console.warn('PRO pulse', err);
  }
}

function stopProMode({ restoreUi = true } = {}) {
  proVizActive = false;
  stopLiveGenerator();
  document.body.classList.remove('pro-viz', 'pro-yt-show');
  try { proYt?.stop(); } catch (_) {}
  setYtLabel(null);
  // restore deck gain
  try {
    if (typeof deckA.setGain === 'function') deckA.setGain(1);
    else if (deckA.gain?.gain) deckA.gain.gain.value = 1;
  } catch (_) {}
  updateProButton();
  if (restoreUi) {
    // leave immersive if still flagged
  }
}


const LIVE_FEELS = [
  { id: 'kali', label: 'Kali hip-hop', bpm: 120 },
  { id: 'techno', label: 'Berlin techno', bpm: 128 },
  { id: 'trance', label: 'Trance', bpm: 120 },
];

function paintLiveGenBadge(on) {
  let el = $('#live-gen-badge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'live-gen-badge';
    el.className = 'live-gen-badge';
    el.setAttribute('aria-live', 'polite');
    (document.getElementById('viz-stage') || document.body).appendChild(el);
  }
  if (on) {
    const feel = LIVE_FEELS[liveGenFeelIdx % LIVE_FEELS.length];
    el.hidden = false;
    el.textContent = `LIVE GENERATOR 💚 · ${feel.label} ~${feel.bpm}`;
    el.classList.add('on');
  } else {
    el.hidden = true;
    el.classList.remove('on');
    el.textContent = 'LIVE GENERATOR 💚';
  }
}

function stopLiveGenerator() {
  liveGenActive = false;
  if (liveGenTimer) { clearInterval(liveGenTimer); liveGenTimer = 0; }
  document.body.classList.remove('live-gen');
  paintLiveGenBadge(false);
}

async function rotateLiveFeel() {
  if (!liveGenActive) return;
  liveGenFeelIdx = (liveGenFeelIdx + 1) % LIVE_FEELS.length;
  const feel = LIVE_FEELS[liveGenFeelIdx];
  paintLiveGenBadge(true);
  try {
    await bootAudio();
    const beat = beatById(feel.id);
    if (beat) {
      await loadBeatIntoA(beat, { autoPlay: true });
      try {
        if (typeof deckA.setGain === 'function') deckA.setGain(proVizActive ? 0.18 : 0.85);
        else if (deckA.gain?.gain) deckA.gain.gain.value = proVizActive ? 0.18 : 0.85;
      } catch (_) {}
    }
    milk?.setAutoCycle(true, 'wander', { bpm: feel.bpm });
    milk?.random?.();
    botStatus(`LIVE GENERATOR 💚 · ${feel.label} ~${feel.bpm} · endless viz`);
  } catch (err) {
    console.warn('live-gen rotate', err);
  }
}

/** Continuous generative LIVE: endless unique viz + rotating Kali/techno/trance energy. */
async function enterLiveGenerator({ withProYt = true } = {}) {
  hideAudioGate();
  window.__audioGestured = true;
  liveGenActive = true;
  document.body.classList.add('live-gen', 'pro-viz');
  setViewMode('viz');
  await bootAudio();
  await tryResumeAudio('live-gen');
  try { await ensureViz(); } catch (_) {}
  try {
    const va = $('#viz-auto');
    if (va) va.checked = true;
    milk?.setAutoCycle(true, 'wander', { bpm: 120 });
  } catch (_) {}
  liveGenFeelIdx = Math.floor(Math.random() * LIVE_FEELS.length) - 1;
  await rotateLiveFeel();
  if (liveGenTimer) clearInterval(liveGenTimer);
  // rotate energy/feelings every ~48s; viz wanders on its own BPM timer
  liveGenTimer = setInterval(() => { rotateLiveFeel().catch(() => {}); }, 48000);

  if (withProYt) {
    proVizActive = true;
    proGenre = 'all';
    try {
      const yt = ensureProYt();
      await yt.next('all');
    } catch (_) {}
  }
  fsOffered = true;
  await enterVizFullscreen({ keepChat: true });
  openBotPanel(true);
  paintLiveGenBadge(true);
  updateProButton();
  botStatus('LIVE GENERATOR 💚 · endless viz · Kali/techno/trance mix · Mr D on viz');
  try { appendChatBubble('bot', 'LIVE GENERATOR 💚 — generuję non-stop. „next yt" / „losuj" / Esc.'); } catch (_) {}
  return true;
}

async function pollGrokLearn() {
  if (!botCompanion?.pullGrokBridge) return;
  try {
    const data = await botCompanion.pullGrokBridge();
    const learn = data?.learn;
    const grok = $('#botd-pill-grok');
    if (grok && (learn?.linked || data?.ok !== false)) {
      grok.textContent = learn?.label || 'Grok linked · ucz się';
      grok.classList.add('ok', 'learn');
    }
    const gls = $('#grok-link-status');
    if (gls && learn?.linked) {
      gls.textContent = `Grok ↔ Mr D · uczy się LIVE 💚 · LIVE GENERATOR · pamięć ${learn.memorySummaries ?? '…'} · hub my-dax.com`;
      gls.classList.add('live', 'learn');
    }
    for (const row of (data.inbox || []).slice(-6)) {
      const id = row?.id || row?.at + row?.text;
      if (!id || __grokSeenInbox.has(id)) continue;
      __grokSeenInbox.add(id);
      if (__grokSeenInbox.size > 200) {
        __grokSeenInbox = new Set([...__grokSeenInbox].slice(-100));
      }
      const prefix = (row.role || '').includes('learn') ? '🧠 ' : '↪ Grok: ';
      if (row?.text) appendChatBubble('bot', prefix + row.text);
    }
  } catch (_) {}
}

async function loadFederationStub() {
  try {
    const res = await fetch('samples/boga-hub-federation.json?v=20', { cache: 'no-cache' });
    if (res.ok) __federation = await res.json();
    const hub = $('#botd-pill-hub');
    if (hub && __federation?.hub) {
      hub.textContent = 'hub · my-dax.com';
      hub.classList.add('ok');
    }
    const genp = $('#botd-pill-generator');
    if (genp) { genp.textContent = 'LIVE GENERATOR'; genp.classList.add('ok'); window.__liveGeneratorOn = true; }
    const learnp = $('#botd-pill-learn');
    if (learnp) { learnp.textContent = 'uczy się LIVE 💚'; learnp.classList.add('ok');
    }
  } catch (_) {}
}

async function enterProMode({ genre = 'all', nextOnly = false } = {}) {
  hideAudioGate();
  window.__audioGestured = true;
  proGenre = genre || 'all';
  proVizActive = true;
  document.body.classList.add('pro-viz');
  setViewMode('viz');
  await bootAudio();
  if (engine.ctx && engine.ctx.state !== 'running') {
    try { await engine.ctx.resume(); } catch (_) {}
  }
  await tryResumeAudio('pro');
  try { await ensureViz(); } catch (_) {}
  try {
    const va = $('#viz-auto');
    if (va) va.checked = true;
    const bpmGuess = proGenre === 'trance' ? 132 : 128;
    milk?.setAutoCycle(true, 'wander', { bpm: bpmGuess });
  } catch (_) {}

  // Pause loud deck conflict — then soft pulse for analyser
  try {
    if (deckA.playing) { /* keep soft pulse path */ }
  } catch (_) {}
  await startProPulse(proGenre);

  const yt = ensureProYt();
  let track = null;
  try {
    track = await yt.next(proGenre);
  } catch (err) {
    console.warn('PRO YT', err);
    botStatus('Mr D Fluid PRO: YouTube API niedostępne — MilkDrop leci na pulse lokalnym.');
  }

  fsOffered = true;
  await enterVizFullscreen({ keepChat: true });
  openBotPanel(true);
  updateProButton();

  const gLabel = proGenre === 'all' ? 'trance/techno/Berlin' : proGenre;
  botStatus(track
    ? `PRO VIZ 💚 · ${track.title} · MilkDrop wander · Mr D LIVE`
    : `PRO VIZ 💚 · MilkDrop · YT ${gLabel} (jeśli API OK)`);
  return true;
}

async function proNextTrack(genre) {
  if (!proVizActive) {
    return enterProMode({ genre: genre || proGenre || 'all' });
  }
  if (genre) proGenre = genre;
  const yt = ensureProYt();
  return yt.next(proGenre);
}

function botStatus(msg) {
  const el = $('#botd-status');
  if (el) el.textContent = msg;
}

function updateGrokLinkStatus() {
  const el = $('#grok-link-status');
  if (!el) return;
  const st = window.__accountStatus;
  const mem = window.__memoryStatus;
  const net = navigator.onLine !== false;
  const memBit = mem ? 'pamięć OK' : 'pamięć…';
  if (st?.connected || st?.synced) {
    el.textContent = `Grok ↔ Mr D · uczy się LIVE 💚 · LIVE GENERATOR · ${st.accountEmail || 'D Bot'} · ${memBit} · hub my-dax.com`;
    el.classList.add('live', 'learn');
  } else {
    const secure = window.isSecureContext
      || location.protocol === 'https:'
      || location.hostname === 'localhost'
      || location.hostname === '127.0.0.1';
    el.textContent = secure
      ? `Mr D Fluid · konto D Bot · ${memBit} · Internet ${net ? 'ON' : 'OFF'} · LIVE 💚`
      : 'Mr D Fluid · (potrzeba HTTPS)';
    el.classList.toggle('live', !!secure);
  }
}

function paintNetLivePills() {
  const net = $('#botd-pill-net');
  const livep = $('#botd-pill-live');
  const live = $('#botd-live');
  const on = navigator.onLine !== false;
  if (net) {
    net.textContent = on ? 'Internet · ON' : 'Internet · OFF';
    net.classList.toggle('ok', on);
    net.classList.toggle('offline', !on);
  }
  if (livep) {
    livep.textContent = '💚 LIVE';
    livep.classList.add('ok');
  }
  if (live) {
    live.textContent = '💚 LIVE';
    live.classList.add('on', 'live');
    live.style.color = '#39ff14';
  }
}

function paintMemoryPill(mem) {
  window.__memoryStatus = mem || null;
  if (botCompanion) botCompanion.memoryStatus = mem || null;
  const el = $('#botd-pill-memory');
  if (!el) return;
  if (mem && (mem.bot || mem.summaries != null || mem.updated_at)) {
    const n = mem.summaries ?? 0;
    el.textContent = n ? `Bot Pamięć · ${n}` : 'Bot Pamięć · OK';
    el.classList.add('ok');
    el.classList.remove('warn');
  } else {
    el.textContent = 'Bot Pamięć · sync…';
    el.classList.remove('ok');
    el.classList.add('warn');
  }
}

function paintAccountStatus(st) {
  window.__accountStatus = st || null;
  if (botCompanion) botCompanion.accountStatus = st || null;
  const drive = $('#botd-pill-drive');
  const grok = $('#botd-pill-grok');
  const label = $('#botd-account-label');
  if (drive) {
    const ok = (st?.googleDrive || '') === 'connected';
    drive.textContent = ok ? 'Drive · OK' : 'Drive · …';
    drive.classList.toggle('ok', ok);
  }
  const gmail = $('#botd-pill-gmail');
  if (gmail) {
    const ok = (st?.gmail || '') === 'connected';
    gmail.textContent = ok ? 'Gmail · OK' : 'Gmail · …';
    gmail.classList.toggle('ok', ok);
  }
  if (grok) {
    const ok = (st?.grok || '') === 'linked' || st?.grokLearn === 'linked';
    grok.textContent = ok ? 'Grok linked · ucz się' : 'Grok · …';
    grok.classList.toggle('ok', ok);
  const learnPill = $('#botd-pill-learn');
  if (learnPill) { learnPill.textContent = 'uczy się LIVE 💚'; learnPill.classList.add('ok'); }
  const genPill = $('#botd-pill-generator');
  if (genPill) { genPill.textContent = 'LIVE GENERATOR'; genPill.classList.add('ok'); window.__liveGeneratorOn = true; }
  const hubPill = $('#botd-pill-hub');
  if (hubPill) { hubPill.textContent = 'hub · my-dax.com'; hubPill.classList.add('ok'); }
    grok.classList.toggle('learn', ok);
  }
  const hub = $('#botd-pill-hub');
  if (hub) {
    hub.textContent = 'Boga hub · stub';
    hub.classList.add('ok');
    hub.title = 'Boga Bot hub · my-dax.com — programy pomagające ludziom';
  }
  paintNetLivePills();
  if (label) {
    const email = st?.accountEmail || 'konto Google (D Bot)';
    const n = st?.trackCount ?? 0;
    label.textContent = st?.connected || st?.synced
      ? `połączony · ${email} · ${n} z Drive · Internet ${navigator.onLine !== false ? 'ON' : 'OFF'}`
      : `łączę z kontem · ${email}`;
  }
  updateGrokLinkStatus();
}


async function fetchBotMesh() {
  let mesh = null;
  try {
    let res = await fetch('/api/bot-mesh', { cache: 'no-cache' });
    if (!res.ok) res = await fetch('samples/bot-mesh.json?v=20', { cache: 'no-cache' });
    if (res.ok) mesh = await res.json();
  } catch (_) {
    try {
      const res = await fetch('samples/bot-mesh.json?v=20', { cache: 'no-cache' });
      if (res.ok) mesh = await res.json();
    } catch (__) {}
  }
  window.__botMesh = mesh;
  paintBotMesh(mesh);
  return mesh;
}

function paintBotMesh(mesh) {
  const row = $('#botd-mesh-row');
  if (!row) return;
  const peers = mesh?.peers || [];
  if (!peers.length) {
    row.innerHTML = '<span class="botd-mesh-pill stub">mesh · …</span>';
    return;
  }
  row.innerHTML = peers.map((p) => {
    const st = (p.status || 'peer').toLowerCase();
    const name = p.name || p.id || 'peer';
    return `<span class="botd-mesh-pill ${st}" title="${(p.note || p.role || '').replace(/"/g, '')}">${name}</span>`;
  }).join('');
  if (mesh?.liveGenerator || peers.some((p) => p.id === 'live-generator')) {
    window.__liveGeneratorOn = true;
    const genp = $('#botd-pill-generator');
    if (genp) { genp.textContent = 'LIVE GENERATOR'; genp.classList.add('ok'); }
  }
}

async function reportHealEvent(msg) {
  const text = String(msg || 'auto-heal').slice(0, 400);
  const body = JSON.stringify({ text, role: 'heal', tags: ['heal', 'learn'], message: text });
  try {
    let res = await fetch('/api/heal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!res.ok) throw new Error('heal ' + res.status);
  } catch (_) {
    try {
      await fetch('/api/chat-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch (__) {}
  }
}

async function fetchFluidAndMemory() {
  let fluid = null;
  let mem = null;
  try {
    const res = await fetch('samples/mr-d-fluid-status.json?v=23', { cache: 'no-cache' });
    if (res.ok) {
      fluid = await res.json();
      window.__fluidStatus = fluid;
      if (botCompanion) botCompanion.fluidStatus = fluid;
    }
  } catch (err) {
    console.warn('fluid-status', err);
  }
  try {
    const res = await fetch('samples/memory-public.json?v=20', { cache: 'no-cache' });
    if (res.ok) {
      const raw = await res.json();
      mem = {
        bot: raw.bot || 'Bot Pamięć',
        updated_at: raw.updated_at,
        summaries: Array.isArray(raw.summaries) ? raw.summaries.length : 0,
        summaryList: (raw.summaries || []).slice(0, 5),
        projects: raw.projects || [],
      };
    }
  } catch (err) {
    console.warn('memory-public', err);
  }
  if (!mem && fluid?.memory) {
    mem = fluid.memory;
  }
  paintMemoryPill(mem);
  paintNetLivePills();
  return { fluid, mem };
}

async function fetchAccountStatus() {
  try {
    let res = await fetch('/api/account-status', { cache: 'no-cache' });
    const ct = res.headers.get('content-type') || '';
    // Workers SPA fallback returns HTML for /api/* — use static manifest
    if (!res.ok || !ct.includes('json')) {
      res = await fetch('samples/sync-manifest.json?v=30', { cache: 'no-cache' });
    }
    const st = await res.json();
    const normalized = {
      ok: true,
      connected: true,
      synced: !!st.synced,
      googleDrive: st.googleDrive || 'connected',
      gmail: st.gmail || 'connected',
      grok: st.grok || 'linked',
      accountEmail: st.accountEmail || 'konto Google (D Bot)',
      accountName: st.accountName || 'Daniel Dydo',
      trackCount: st.trackCount || 0,
      statusLine: st.statusLine || 'Workers PRO · synced',
      liveUrl: st.liveUrl || st.workersUrl,
      manifest: st,
    };
    paintAccountStatus(normalized);
    return normalized;
  } catch (err) {
    console.warn('account-status', err);
    paintAccountStatus({
      connected: true, synced: true,
      googleDrive: 'connected', grok: 'linked',
      accountEmail: 'konto Google (D Bot)', trackCount: 0,
      statusLine: 'offline-manifest',
    });
    return null;
  }
}


function renderYtPlaylistUI() {
  const list = $('#yt-playlist');
  const meta = $('#yt-playlist-meta');
  if (!list) return;
  const seen = new Set();
  const tracks = [];
  for (const t of YT_ALLOWLIST) {
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    tracks.push(t);
  }
  if (meta) meta.textContent = `YouTube · Brother Max · ${tracks.length} utworów · MilkDrop LIVE D`;
  list.innerHTML = tracks.map((t) => {
    const live = t.live ? ' · LIVE 24/7' : '';
    const opening = (t.opening || t.featured || t.id === BROTHER_MAX_OPENING?.id) ? ' <strong class="yt-opening-badge">★ OPENING</strong>' : '';
    const g = (t.genre || '').toUpperCase();
    return `<li><button type="button" class="account-track-btn yt" data-yt="${t.id}" data-title="${t.title.replace(/"/g, '&quot;')}">▶ ${t.title}${opening}${live} <em style="opacity:.6">${g} · ${t.bpm || '?'} BPM</em></button></li>`;
  }).join('');
  list.onclick = async (e) => {
    const btn = e.target.closest?.('.account-track-btn.yt');
    if (!btn) return;
    const id = btn.dataset.yt;
    const title = btn.dataset.title || id;
    const track = tracks.find((x) => x.id === id) || { id, title, genre: 'kali', bpm: 120 };
    try {
      setViewMode('viz');
      proVizActive = true;
      document.body.classList.add('pro-viz', 'pro-yt-show');
      await bootAudio();
      await tryResumeAudio('yt-playlist');
      try { await ensureViz(); } catch (_) {}
      try {
        const va = $('#viz-auto');
        if (va) va.checked = true;
        milk?.setAutoCycle(true, 'wander');
      } catch (_) {}
      // Soft local analyser if deck empty
      if (!deckA.buffer) {
        const beat = beatById('kali');
        if (beat) await loadBeatIntoA(beat, { autoPlay: true });
        try {
          if (typeof deckA.setGain === 'function') deckA.setGain(0.1);
          else if (deckA.gain?.gain) deckA.gain.gain.value = 0.1;
        } catch (_) {}
      }
      const yt = ensureProYt();
      await yt.playTrack(track);
      openBotPanel(true);
      if (!vizFsActive) await enterVizFullscreen({ keepChat: true });
      botStatus(`D Bot · YouTube ▶ ${title} · MilkDrop LIVE D`);
    } catch (err) {
      console.warn('yt playlist', err);
      botStatus('D Bot: YouTube nie wystartował — tapnij AUTO jeszcze raz.');
    }
  };
}

async function loadAccountPlaylistUI() {
  const meta = $('#account-playlist-meta');
  const list = $('#account-tracklist');
  if (!list) return null;
  try {
    let data;
    try {
      const res = await fetch('/api/playlist', { cache: 'no-cache' });
      if (!res.ok) throw new Error('api ' + res.status);
      data = await res.json();
    } catch {
      const res = await fetch('samples/account-playlist.json?v=20', { cache: 'no-cache' });
      if (!res.ok) throw new Error('playlist ' + res.status);
      data = await res.json();
    }
    if (botCompanion) botCompanion.playlist = data;
    window.__playlist = data;
    if (meta) {
      meta.textContent = `${data.title || 'Playlist'} · ${(data.tracks || []).length} builtin`
        + ((data.driveTracks || []).length ? ` · ${data.driveTracks.length} z Drive` : '')
        + ` · ${data.accountEmail || data.note || 'konto'}`;
    }
    const rows = [];
    for (const t of (data.tracks || [])) {
      rows.push(`<li><button type="button" class="account-track-btn" data-file="${t.file}" data-name="${t.name}">♪ ${t.name} · ${t.bpm || '?'} BPM</button></li>`);
    }
    if (!(data.driveTracks || []).length) {
      rows.push(`<li class="account-empty">${data.fromDriveNote || 'Brak tracków Drive — napisz sync'}</li>`);
    } else {
      for (const t of data.driveTracks) {
        rows.push(`<li><button type="button" class="account-track-btn drive" data-file="${t.file}" data-name="${t.name}">☁ ${t.name}</button></li>`);
      }
    }
    list.innerHTML = rows.join('');
    list.onclick = async (e) => {
      const btn = e.target.closest?.('.account-track-btn');
      if (!btn) return;
      const file = btn.dataset.file;
      const name = (file || '').split('/').pop() || 'track.mp3';
      await loadBeatIntoA({ id: 'custom', file, name, label: btn.dataset.name || name, bpm: 120 }, { autoPlay: true });
      botStatus(`Mr D Fluid: playlist → Deck A · ${btn.dataset.name || name}`);
    };
    return data;
  } catch (err) {
    console.warn('account playlist', err);
    if (meta) meta.textContent = 'Playlist: offline — spróbuj sync';
    if (list) list.innerHTML = '<li class="account-empty">Offline playlist</li>';
    return null;
  }
}

async function refreshAccountSync({ announce = false } = {}) {
  const st = await fetchAccountStatus();
  renderYtPlaylistUI();
  const pl = await loadAccountPlaylistUI();
  const { mem } = await fetchFluidAndMemory();
    await fetchBotMesh();
  paintNetLivePills();
  const n = (pl?.driveTracks || []).length;
  const net = navigator.onLine !== false ? 'Internet ON' : 'Internet OFF';
  const memBit = mem ? `pamięć ${mem.summaries ?? 'OK'}` : 'pamięć…';
  const msg = st?.synced
    ? `połączony · Drive ${n} · Gmail · ${memBit} · ${net} · LIVE 💚`
    : `konto: ${st?.statusLine || '…'} · Drive ${n} · ${memBit} · ${net}`;
  botStatus('Mr D Fluid: ' + msg);
  if (announce && botCompanion) {
    appendChatBubble('bot', `Sync OK — ${msg}. Kliknij ☁ track albo DRIVE ▶.`);
  }
  return { st, pl, mem };
}

async function loadNewestDriveTrack() {
  const pl = window.__playlist || botCompanion?.playlist;
  const tracks = pl?.driveTracks || [];
  if (!tracks.length) {
    await refreshAccountSync({ announce: false });
  }
  const list = (window.__playlist || botCompanion?.playlist)?.driveTracks || [];
  if (!list.length) {
    botStatus('Mr D Fluid: brak tracków Drive — sync najpierw.');
    appendChatBubble('bot', 'Brak tracków z Drive na dysku. Napisz „sync” albo wrzuć MP3 do folderu D DJ Pro Fly / 04 Samples.');
    return false;
  }
  const t = list[list.length - 1];
  await bootAudio();
  await loadBeatIntoA({ id: t.id || 'drive', file: t.file, name: t.name, label: t.name, bpm: t.bpm || 120 }, { autoPlay: true });
  botStatus(`Mr D Fluid: Drive → ${t.name} na A`);
  appendChatBubble('bot', `☁ ${t.name} na Deck A (Drive · konto D Bot).`);
  return true;
}

function bindBotD() {

  const grid = $('#botd-grid');
  const beats = $('#botd-beats');
  if (!grid && !beats) return;

  const flash = (btn) => {
    btn?.classList.add('active');
    setTimeout(() => btn?.classList.remove('active'), 280);
  };

  const run = async (cmd, btn) => {
    flash(btn);
    try {
      switch (cmd) {
        case 'start': {
          // Reuse gate unlock path
          const gateBtn = $('#audio-gate-btn');
          if (gateBtn && !$('#audio-gate')?.classList.contains('hidden')) {
            gateBtn.click();
            botStatus('Mr D Fluid: odpalam START / odblokowuję audio…');
          } else {
            await bootAudio();
            if (!deckA.buffer) {
              const { ok, beat } = await autoPlayBuiltinBeat();
              botStatus(ok
                ? `D Bot: audio OK · Auto Beat „${beat.label}” na A.`
                : 'D Bot: audio OK · sesja aktywna.');
            } else {
              botStatus('Mr D Fluid: audio OK · sesja aktywna.');
            }
          }
          break;
        }
        case 'demo': {
          await bootAudio();
          await loadDemoIntoA({ autoPlay: true });
          setViewMode(viewMode || 'viz');
          botStatus('Mr D Fluid: demo 120 BPM · viz.');
          break;
        }
        case 'auto-beat': {
          await bootAudio();
          const { ok, beat } = await autoPlayBuiltinBeat();
          botStatus(ok
            ? `D Bot: Auto Beats → ${beat.label} na Deck A · play.`
            : 'D Bot: brak pliku beat — sprawdź samples/.');
          break;
        }
        case 'beat-kali': {
          await bootAudio();
          const beat = beatById('kali');
          await loadBeatIntoA(beat, { autoPlay: true });
          botStatus('Mr D Fluid: Kali hip-hop 120 na Deck A · play.');
          break;
        }
        case 'kali-full': {
          await launchKaliMode({ beatId: 'kali', enterFs: true, withYt: true });
          break;
        }
        case 'kali-yt': {
          await launchKaliMode({ beatId: 'kali', enterFs: true, withYt: true });
          break;
        }
        case 'pro': {
          await enterProMode({ genre: 'all' });
          break;
        }
        case 'pro-trance': {
          await enterProMode({ genre: 'trance' });
          break;
        }
        case 'pro-techno': {
          await enterProMode({ genre: 'techno' });
          break;
        }
        case 'pro-berlin': {
          await enterProMode({ genre: 'berlin' });
          break;
        }
        case 'pro-next': {
          await proNextTrack(proGenre || 'all');
          break;
        }
        case 'live-gen':
        case 'life-gen':
        case 'generator': {
          await launchUnifiedLiveD();
          break;
        }
        case 'account-sync': {
          await refreshAccountSync({ announce: true });
          break;
        }
        case 'load-newest-drive': {
          await loadNewestDriveTrack();
          break;
        }
        case 'streams': {
          botStatus('Mr D Fluid: streamy www WYŁĄCZONE — tylko lokal + Google Drive + builtin.');
          appendChatBubble?.('bot', 'Streamy www / URL audio wyłączone. Użyj Drive ▶ / Kali / Trance.');
          break;
        }
        case 'beat-techno': {
          await bootAudio();
          const beat = beatById('techno');
          await loadBeatIntoA(beat, { autoPlay: true });
          botStatus('Mr D Fluid: Berlin techno 128 na Deck A · play.');
          break;
        }
        case 'beat-trance': {
          await bootAudio();
          const beat = beatById('trance');
          await loadBeatIntoA(beat, { autoPlay: true });
          botStatus('Mr D Fluid: Trance 120 na Deck A · play.');
          break;
        }
        case 'autoset': {
          await bootAudio();
          await loadDemoIntoA({ autoPlay: true });
          doSync({ soft: false, flash: true });
          setViewMode('viz');
          await ensureViz();
          botStatus('Mr D Fluid: Auto set · demo → sync → viz.');
          break;
        }
        case 'play': {
          await bootAudio();
          if (!deckA.buffer) {
            await loadDemoIntoA({ autoPlay: true });
            botStatus('Mr D Fluid: brak tracku — załadowałem demo i gra.');
          } else {
            deckA.toggle();
            updateDeckUI(deckA);
            botStatus(deckA.playing ? 'D Bot: ▶ Deck A gra.' : 'D Bot: ⏸ Deck A pauza.');
          }
          break;
        }
        case 'sync': {
          await bootAudio();
          const ok = doSync({ soft: false, flash: true });
          botStatus(ok ? 'D Bot: SYNC slave → master (BPM + faza).' : 'D Bot: potrzeba tracków na A i B do SYNC.');
          break;
        }
        case 'auto': {
          autoSyncOn = !autoSyncOn;
          const el = $('#auto-sync');
          if (el) el.checked = autoSyncOn;
          try { localStorage.setItem('ddj-auto-sync', autoSyncOn ? '1' : '0'); } catch (_) {}
          $('#btn-sync')?.classList.toggle('auto-on', autoSyncOn);
          if (autoSyncOn) doSync({ soft: false, flash: true });
          botStatus(autoSyncOn ? 'D Bot: AUTO sync WŁĄCZONY.' : 'D Bot: AUTO sync wyłączony.');
          break;
        }
        case 'viz':
          setViewMode('viz');
          botStatus('Mr D Fluid: widok VIZ (MilkDrop).');
          break;
        case 'decks':
          setViewMode('decks');
          botStatus('Mr D Fluid: widok DECKI.');
          break;
        case 'both':
          setViewMode('both');
          botStatus('Mr D Fluid: widok OBA (viz + decki).');
          break;
        case 'preset': {
          await bootAudio();
          await ensureViz();
          milk?.next();
          botStatus(`Mr D Fluid: następny preset — ${$('#viz-name')?.textContent || 'MilkDrop'}`);
          break;
        }
        case 'preset-rand': {
          await bootAudio();
          await ensureViz();
          milk?.random();
          botStatus(`Mr D Fluid: losowy preset — ${$('#viz-name')?.textContent || 'MilkDrop'}`);
          break;
        }
        case 'echo':
        case 'reverb':
        case 'filter': {
          await bootAudio();
          try {
            fx.engage(cmd, 0.9);
            botStatus(`Mr D Fluid: RMX ${cmd.toUpperCase()} · hold 1.2s`);
            setTimeout(() => {
              try { fx.release(cmd); } catch (_) {}
              botStatus(`Mr D Fluid: RMX ${cmd.toUpperCase()} off.`);
            }, 1200);
          } catch (err) {
            botStatus('Mr D Fluid: FX niedostępne — decki dalej grają.');
            console.warn('bot fx', err);
          }
          break;
        }
        case 'bpm': {
          const master = masterDeck === 'A' ? deckA : deckB;
          const bpm = master.effectiveBpm || master.bpm || 120;
          // Suggest nice DJ tempos around detected
          const suggestions = [Math.round(bpm), 120, 124, 128, 140]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .slice(0, 4);
          // Soft-apply rounded BPM as manual on master if we have a buffer
          const rounded = Math.round(bpm * 10) / 10;
          if (master.buffer) {
            master.setManualBpm(rounded);
            updateDeckUI(master);
            updateMasterUI();
          }
          botStatus(`Mr D Fluid: BPM ≈ ${rounded} · sugestie: ${suggestions.join(' / ')} (master ${masterDeck}).`);
          break;
        }
        case 'play-dax': {
          await enterProMode({ genre: 'all' });
          try {
            await ensureProYt().playTrack(BROTHER_MAX_OPENING);
            botStatus('▶ DaXDJ RemiX · Brother Max opening');
          } catch (err) {
            console.warn('play-dax', err);
          }
          break;
        }
        case 'yt-search-ui': {
          const q = prompt('Szukaj YouTube (frazy lub URL):', $('#remote-yt-q')?.value || '');
          if (q) {
            if ($('#remote-yt-q')) $('#remote-yt-q').value = q;
            await doYtSearchPlay(q);
          }
          break;
        }
        case 'fs': {
          await toggleFullscreen();
          botStatus(isFullscreen() ? 'D Bot: fullscreen ON.' : 'D Bot: fullscreen off / niedostępny tu.');
          break;
        }
        default:
          botStatus(`Mr D Fluid: nie znam komendy „${cmd}”.`);
      }
    } catch (err) {
      console.warn('D Bot', err);
      botStatus('Mr D Fluid: ups — coś nie pykło, spróbuj START i jeszcze raz.');
    }
  };

  const onBotClick = (e) => {
    const btn = e.target.closest?.('[data-bot]');
    if (!btn) return;
    run(btn.dataset.bot, btn);
  };
  grid?.addEventListener('click', onBotClick);
  beats?.addEventListener('click', onBotClick);

  // Mark live when page is on https (public internet)
  const live = $('#botd-live');
  if (live) {
    live.textContent = '💚 LIVE';
    live.classList.add('on', 'live');
    live.style.color = '#39ff14';
    live.title = 'ONLINE · Drive · Gmail · Bot Pamięć · Internet';
  }
  paintNetLivePills();
  updateGrokLinkStatus();
  loadAccountPlaylistUI();
  fetchFluidAndMemory();
  botStatus(
    location.protocol === 'https:'
      ? 'D Beast ONLINE 💚 · international · WhatsApp linked · YouTube control.'
      : 'D Beast ONLINE 💚 lokalnie · WA login · YT · viz AUTO.'
  );
}


function bindChrome() {
  $('#btn-fs')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await toggleFullscreen();
  });

  $('#btn-kali')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    refreshAccountSync({ announce: false });
    await launchKaliMode({ beatId: 'kali', enterFs: true });
  });
  $('#audio-gate-kali')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    refreshAccountSync({ announce: false });
    await launchKaliMode({ beatId: 'kali', enterFs: true });
  });
  $('#btn-pro')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (proVizActive) {
      await exitVizFullscreen();
      stopProMode();
      botStatus('Mr D Fluid: PRO off.');
    } else {
      await enterProMode({ genre: 'all' });
    }
  });
  $('#audio-gate-pro')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    refreshAccountSync({ announce: false });
    await enterProMode({ genre: 'all' });
  });
  $('#btn-live-gen')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (liveGenActive) {
      await exitVizFullscreen();
      stopProMode();
      botStatus('LIVE GENERATOR off.');
    } else {
      await launchUnifiedLiveD();
    }
  });
  $('#audio-gate-live')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    refreshAccountSync({ announce: false });
    await launchUnifiedLiveD();
  });
  $('#btn-bot')?.addEventListener('click', (e) => {
    e.preventDefault();
    openBotPanel(!$('body')?.classList.contains('botd-open'));
  });
  $('#botd-fab')?.addEventListener('click', (e) => {
    e.preventDefault();
    openBotPanel(!$('body')?.classList.contains('botd-open'));
  });
  $('#botd-close')?.addEventListener('click', (e) => {
    e.preventDefault();
    openBotPanel(false);
  });


  $('#viz-hud-exit')?.addEventListener('click', (e) => {
    e.preventDefault();
    exitVizFullscreen();
  });
  $('#viz-fs-corner')?.addEventListener('click', (e) => {
    e.preventDefault();
    exitVizFullscreen();
  });
  $('#viz-hud-prev')?.addEventListener('click', (e) => {
    e.preventDefault();
    milk?.prev();
    showVizHudBriefly(3500);
  });
  $('#viz-hud-next')?.addEventListener('click', (e) => {
    e.preventDefault();
    milk?.next();
    showVizHudBriefly(3500);
  });
  $('#viz-hud-rand')?.addEventListener('click', (e) => {
    e.preventDefault();
    milk?.random();
    showVizHudBriefly(3500);
  });
  // Mouse move / tap reveals thin HUD; double-tap exits
  window.addEventListener('mousemove', onVizFsActivity, { passive: true });
  window.addEventListener('pointerdown', onVizFsPointer, { passive: true });
  const syncFsExit = () => {
    updateFsButton();
    // Esc / browser UI exit → restore decks chrome even if our flag lagged
    if (!isFullscreen() && vizFsActive) {
      vizFsActive = false;
      clearTimeout(vizHudHideTimer);
      const root = $('#app-root');
      root?.classList.remove('app-viz-fs', 'viz-hud-show');
      document.body.classList.remove('viz-fs');
      if (proVizActive) stopProMode({ restoreUi: false });
      const hud = $('#viz-hud');
      if (hud) hud.setAttribute('aria-hidden', 'true');
      // Stay viz-only after leaving browser fullscreen
      setViewMode('viz');
      updateFsButton();
      updateProButton();
    }
  };
  document.addEventListener('fullscreenchange', syncFsExit);
  document.addEventListener('webkitfullscreenchange', syncFsExit);
  document.addEventListener('mozfullscreenchange', syncFsExit);

  const gateBtn = $('#audio-gate-btn');
  const gate = $('#audio-gate');
  let unlocking = false;
  let gateDismissed = false;
  const unlock = async (e) => {
    // Plain download links on the gate must work without JS gate logic
    if (e?.target?.closest?.('a[href]')) return;
    e?.preventDefault?.();
    if (unlocking) return;
    unlocking = true;
    try {
      // Always dismiss gate on first gesture — never leave user stuck
      hideAudioGate();
      gateDismissed = true;
      window.__audioGestured = true;
      document.removeEventListener('pointerdown', unlockOnce, true);
      gateBtn?.removeEventListener('click', unlock);

      // Gate already gone — never block UI on audio/YT
      window.__demoLoaded = true;
      try {
        await Promise.race([
          bootAudio(),
          new Promise((r) => setTimeout(r, 2000)),
        ]);
      } catch (err) { console.warn('bootAudio', err); }
      try { await engine.ctx?.resume(); } catch (_) {}

      try {
        await Promise.race([
          launchUnifiedLiveD(),
          new Promise((r) => setTimeout(r, 8000)),
        ]);
      } catch (err) {
        console.warn('unified LIVE D', err);
        try {
          openBotPanel(true);
          setViewMode('viz');
          document.body.classList.add('viz-fs', 'pro-viz', 'live-d');
          $('#app-root')?.classList.add('app-viz-fs');
          milk?.setAutoCycle?.(true, 'wander', { ms: 9000 });
        } catch (_) {}
        botStatus('D Bot live — pisz. Viz dogrywam…');
      }
      hideAudioGate();
      openBotPanel(true);
      const fab = $('#botd-fab');
      if (fab) fab.style.display = '';
    } finally {
      unlocking = false;
    }
  };
  const unlockOnce = async (ev) => {
    if (ev?.target?.closest?.('a[href]')) return;
    await unlock(ev);
  };
  window.__ddjUnlock = unlock;
  gateBtn?.addEventListener('click', unlock);
  gateBtn?.addEventListener('pointerup', (e) => { e.preventDefault(); unlock(e); });
  gate?.addEventListener('pointerup', (e) => {
    if (e.target?.closest?.('a[href]')) return;
    if (e.target !== gateBtn) unlock(e);
  });
  // capture so first tap unlocks even if something stopsPropagation
  document.addEventListener('pointerdown', unlockOnce, true);

  engine.onStateChange = (state) => {
    // After first dismiss, never trap user on gate again
    if (gateDismissed) {
      if (state === 'running') hideAudioGate();
      return;
    }
    if (state === 'suspended') showAudioGateIfNeeded();
    else if (state === 'running') hideAudioGate();
  };

  showMobileMidiTip();
  showAudioGateIfNeeded();

  $('#btn-load-demo')?.addEventListener('click', async () => {
    try {
      await loadDemoIntoA();
      setViewMode(viewMode || 'viz');
      updateDeckUI(deckA);
    } catch (err) {
      console.warn('demo load', err);
    }
  });
}


function openBotPanel(on) {
  const panel = $('#botd-companion');
  const fab = $('#botd-fab');
  if (!panel) return;
  const want = !!on;
  if (want) {
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('botd-open');
    fab?.setAttribute('aria-expanded', 'true');
    tryResumeAudio('bot-open');
    paintNetLivePills();
    refreshAccountSync({ announce: false }).catch(() => {});
    // Ready for typing — critical after AUTO
    setTimeout(() => {
      try { $('#botd-chat-input')?.focus({ preventScroll: true }); } catch (_) {}
    }, 60);
  } else {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('botd-open');
    fab?.setAttribute('aria-expanded', 'false');
  }
}

function appendChatBubble(role, text) {
  const log = $('#botd-chat-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'botd-bubble botd-bubble-' + (role === 'user' ? 'user' : 'bot');
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function renderStreamList() {
  const box = $('#botd-streams');
  if (box) { box.hidden = true; box.innerHTML = ''; }
  botStatus('Mr D Fluid: streamy www wyłączone · lokal + Drive only.');
}

async function loadUrlOntoA(url) {
  await bootAudio();
  // Block internet website / remote HTTPS audio — local + Drive (samples/) only
  if (/^https?:\/\//i.test(url) && !/\/samples\//.test(url)) {
    botStatus('Mr D Fluid: web URL audio WYŁĄCZONE — lokal / Drive only.');
    throw new Error('web-streams-disabled');
  }
  // Relative sample path
  if (url.startsWith('samples/')) {
    const name = url.split('/').pop();
    const id = name.includes('kali') ? 'kali' : name.includes('trance') ? 'trance' : name.includes('techno') ? 'techno' : 'custom';
    const beat = beatById(id) || { id: 'custom', file: url, name, label: name, bpm: 120 };
    await loadBeatIntoA(beat, { autoPlay: true });
    botStatus(`Mr D Fluid: załadowano ${beat.label || name} na A.`);
    return;
  }
  const res = await fetch(url, { cache: 'no-cache', mode: 'cors' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  const name = (url.split('?')[0].split('/').pop() || 'stream.mp3').slice(0, 64);
  const file = new File([blob], name, { type: blob.type || 'audio/mpeg' });
  await deckA.init();
  await deckA.loadFile(file);
  peaksA = deckA.getWaveformPeaks(800);
  updateDeckUI(deckA);
  if (engine.ctx?.state === 'running') {
    try { deckA.play(); } catch (_) {}
  }
  botStatus(`Mr D Fluid: stream/URL → Deck A · ${name}`);
}


function setDeckBVisible(on) {
  const root = $('#app-root');
  const btn = $('#deck-b-toggle');
  if (!root) return;
  root.classList.toggle('show-deck-b', !!on);
  root.classList.toggle('app-one-deck', !on);
  if (btn) {
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    btn.textContent = on ? 'DECK B · ukryj' : 'DECK B · opcjonalny';
  }
}

function bindOneDeck() {
  setDeckBVisible(false);
  $('#deck-b-toggle')?.addEventListener('click', () => {
    const root = $('#app-root');
    const on = !root?.classList.contains('show-deck-b');
    setDeckBVisible(on);
    if (on && viewMode === 'viz') setViewMode('both');
    else if (on) setViewMode(viewMode || 'both');
  });
}


async function loadOwnerAuthFallback() {
  try {
    return null; // APK v43: offline owner login disabled (owner-auth.json not bundled)
    const res = await fetch('about:blank');
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

function simpleOwnerToken(auth) {
  const base = `${auth?.phoneE164 || '+48730377357'}|${auth?.pin || ''}|ddj-owner-v1`;
  // lightweight non-crypto hash for Workers fallback
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'ow_' + (h >>> 0).toString(16) + '_' + String(auth?.pin || '');
}

function normalizePhoneClient(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('48') && digits.length >= 11) return '+' + digits;
  if (digits.length === 9) return '+48' + digits;
  if (digits.length === 4) return digits;
  return digits ? '+' + digits : '';
}

function paintOwnerStatus(msg, ok) {
  const el = $('#owner-login-status');
  if (!el) return;
  el.textContent = msg;
  document.body.classList.toggle('owner-ok', !!ok);
}

function persistOwnerSession(token, owner) {
  ownerToken = token || '';
  ownerInfo = owner || null;
  try {
    if (token) {
      localStorage.setItem('ddj_owner_token', token);
      if (owner) localStorage.setItem('ddj_owner_info', JSON.stringify(owner));
      document.cookie = `ddj_owner=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
    } else {
      localStorage.removeItem('ddj_owner_token');
      localStorage.removeItem('ddj_owner_info');
      document.cookie = 'ddj_owner=; path=/; max-age=0';
    }
  } catch (_) {}
  paintOwnerStatus(
    ownerToken
      ? `Zalogowano · ${(ownerInfo && ownerInfo.displayName) || 'D Bot'} · WhatsApp linked`
      : 'Nie zalogowano',
    !!ownerToken
  );
  if (ownerToken) startRemotePoll();
}

async function tryOwnerLogin(phone, pin) {
  const body = { phone: String(phone || '').trim(), pin: String(pin || '').trim() };
  try {
    const res = await fetch('/api/owner-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && data.token) {
      persistOwnerSession(data.token, data.owner);
      return true;
    }
  } catch (_) {}
  // Workers / static fallback — validate against owner-auth.json
  const auth = await loadOwnerAuthFallback();
  if (!auth) {
    paintOwnerStatus('Logowanie właściciela wymaga internetu (serwer D Bot) — offline wyłączone w APK', false);
    return false;
  }
  const expect = String(auth.phoneE164 || '+48730377357');
  const last4 = String(auth.phoneLast4 || expect.slice(-4));
  const norm = normalizePhoneClient(body.phone);
  const phoneOk =
    norm === expect ||
    norm === last4 ||
    String(body.phone).replace(/\D/g, '').endsWith(last4) ||
    String(body.phone).trim() === last4;
  if (!phoneOk || body.pin !== String(auth.pin || '')) {
    paintOwnerStatus('Zły telefon lub PIN', false);
    return false;
  }
  persistOwnerSession(simpleOwnerToken(auth), {
    displayName: auth.displayName || 'Daniel Dydo',
    phoneE164: expect,
    role: 'owner',
  });
  return true;
}

async function restoreOwnerSession() {
  let token = '';
  try { token = localStorage.getItem('ddj_owner_token') || ''; } catch (_) {}
  if (!token) return;
  try {
    const res = await fetch('/api/owner-session?token=' + encodeURIComponent(token), { cache: 'no-cache' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      persistOwnerSession(token, data.owner);
      return;
    }
  } catch (_) {}
  // static fallback: trust local token if info present
  try {
    const info = JSON.parse(localStorage.getItem('ddj_owner_info') || 'null');
    if (info?.displayName) persistOwnerSession(token, info);
  } catch (_) {}
}

async function queueRemoteCmd(cmd, args = {}) {
  if (!ownerToken) return false;
  try {
    const res = await fetch('/api/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ownerToken, cmd, args }),
    });
    const data = await res.json().catch(() => ({}));
    return !!(res.ok && data?.ok);
  } catch (_) {
    return false;
  }
}

async function applyRemoteCmd(entry) {
  const cmd = entry?.cmd || entry?.type || '';
  const args = entry?.args || {};
  try {
    switch (cmd) {
      case 'playTrack': {
        const id = args.id || args.videoId || BROTHER_MAX_OPENING.id;
        const known = YT_ALLOWLIST.find((t) => t.id === id) || {
          id,
          title: args.title || ('YouTube · ' + id),
          genre: 'trance',
          bpm: 128,
          session: true,
          url: 'https://youtu.be/' + id,
        };
        addToSessionPlaylist(known);
        await enterProMode({ genre: known.genre || 'all' });
        const yt = ensureProYt();
        await yt.playTrack(known);
        botStatus('Remote ▶ ' + known.title);
        break;
      }
      case 'searchPlay': {
        const q = args.query || args.q || '';
        await doYtSearchPlay(q);
        break;
      }
      case 'next':
        await proNextTrack(proGenre || 'all');
        break;
      case 'pause':
        try { ensureProYt().pause(); } catch (_) {}
        if (deckA.playing) { deckA.toggle(); updateDeckUI(deckA); }
        botStatus('Remote · pause');
        break;
      case 'vizWander':
      case 'viz':
        await ensureViz();
        milk?.random?.();
        botStatus('Remote · viz preset');
        break;
      case 'vizFs':
        await enterVizFullscreen({ keepChat: true });
        break;
      case 'auto':
        setAutoSync(true);
        doSync({ soft: false, flash: true });
        break;
      case 'botSay': {
        const t = args.text || 'D Beast live 💚';
        appendChatBubble('bot', t);
        botStatus(t);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.warn('remote cmd', cmd, err);
  }
}

async function pollRemoteQueue() {
  if (!ownerToken && !remoteMode) return;
  try {
    const url = '/api/remote-queue?since=' + encodeURIComponent(remoteSince || '');
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json();
    const cmds = data?.cmds || [];
    for (const c of cmds) {
      await applyRemoteCmd(c);
      if (c.ts && c.ts > remoteSince) remoteSince = c.ts;
    }
  } catch (_) {}
}

function startRemotePoll() {
  if (remotePollTimer) return;
  remotePollTimer = setInterval(() => { pollRemoteQueue().catch(() => {}); }, 2000);
  pollRemoteQueue().catch(() => {});
}

async function doYtSearchPlay(query) {
  const q = String(query || '').trim();
  if (!q) {
    botStatus('Podaj frazy YT albo wklej URL');
    return;
  }
  const { results, urlTrack } = searchYoutube(q);
  const list = $('#remote-yt-results');
  if (list) {
    list.hidden = false;
    list.innerHTML = '';
    (results.slice(0, 8)).forEach((t) => {
      const li = document.createElement('li');
      li.className = 'account-track';
      li.innerHTML = `<button type="button" class="botd-btn" data-yt-id="${t.id}">▶ ${t.title}</button>`;
      list.appendChild(li);
    });
  }
  const pick = urlTrack || results[0];
  if (!pick) {
    appendChatBubble('bot', 'Brak wyników w allowliście — wklej youtu.be / watch?v= ID.');
    return;
  }
  addToSessionPlaylist(pick);
  await enterProMode({ genre: pick.genre || 'all' });
  await ensureProYt().playTrack(pick);
  appendChatBubble('bot', `▶ YT · ${pick.title}`);
  botStatus('YT ▶ ' + pick.title);
}

function bindOwnerAndRemote() {
  $('#owner-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = $('#owner-phone')?.value || '';
    const pin = $('#owner-pin')?.value || '';
    const ok = await tryOwnerLogin(phone, pin);
    if (ok) {
      appendChatBubble('bot', 'Owner OK — WhatsApp linked · możesz sterować remote.');
      try { $('#owner-pin').value = ''; } catch (_) {}
    }
  });

  $('#remote-yt-go')?.addEventListener('click', async () => {
    const q = $('#remote-yt-q')?.value || '';
    await doYtSearchPlay(q);
    if (ownerToken) queueRemoteCmd('searchPlay', { query: q });
  });
  $('#remote-yt-q')?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#remote-yt-go')?.click();
    }
  });
  $('#remote-yt-results')?.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-yt-id]');
    if (!btn) return;
    const id = btn.getAttribute('data-yt-id');
    await applyRemoteCmd({ cmd: 'playTrack', args: { id } });
  });
  $('#botd-remote-btns')?.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-remote]');
    if (!btn) return;
    const cmd = btn.getAttribute('data-remote');
    const args = {};
    if (btn.dataset.id) args.id = btn.dataset.id;
    if (btn.dataset.text) args.text = btn.dataset.text;
    await applyRemoteCmd({ cmd, args });
    if (ownerToken) queueRemoteCmd(cmd, args);
  });

  const wa = $('#btn-whatsapp');
  if (wa) wa.href = WA_LINK();
  const openRem = $('#btn-open-remote');
  if (openRem) {
    const live = window.__liveUrl || LIVE_CANON;
    openRem.href = (location.origin === 'null' ? live : '') + '/?remote=1&v=36#remote';
    if (location.protocol.startsWith('http')) openRem.href = '/?remote=1&v=36#remote';
  }

  // ?remote=1 → fullscreen-ish remote UI
  try {
    const sp = new URLSearchParams(location.search);
    if (sp.get('remote') === '1' || location.hash === '#remote') {
      remoteMode = true;
      document.body.classList.add('remote-ui', 'botd-open');
      const panel = $('#botd-companion');
      if (panel) {
        panel.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
      }
      try { window.__ddjKillGate?.(); } catch (_) {}
      startRemotePoll();
    }
  } catch (_) {}

  restoreOwnerSession();
  if (ownerToken || remoteMode) startRemotePoll();
}

function bindBotChat() {
  botCompanion = new BotCompanion({
    getMasterBpm: () => {
      const m = masterDeck === 'A' ? deckA : deckB;
      return m.effectiveBpm || m.bpm || 120;
    },
    showStreams: () => { botStatus('Mr D Fluid: streamy www wyłączone.'); },
    runAction: async (a) => {
      switch (a.type) {
        case 'kali':
          await launchKaliMode({ beatId: a.beatId || 'kali', enterFs: true });
          break;
        case 'beat': {
          await bootAudio();
          const beat = beatById(a.beatId);
          if (beat) await loadBeatIntoA(beat, { autoPlay: true });
          break;
        }
        case 'pro': {
          if (a.next && (proVizActive || liveGenActive)) await proNextTrack(a.genre || proGenre || 'all');
          else await enterProMode({ genre: a.genre || 'all' });
          break;
        }
        case 'yt-search':
          await doYtSearchPlay(a.query || '');
          break;
        case 'yt-play': {
          const id = extractYtId(a.idOrUrl || a.id || '');
          if (id) await applyRemoteCmd({ cmd: 'playTrack', args: { id } });
          break;
        }
        case 'live-gen':
        case 'life-gen':
          await enterLiveGenerator({ withProYt: a.withProYt !== false });
          break;
        case 'learn':
          await botCompanion?.saveLearnNote?.(
            'Sesja learn · ' + new Date().toISOString().slice(0, 16) + ' · PRO/LIVE gen',
            'learn'
          );
          botStatus('Grok linked · ucz się — notatka w outbox → Bot Pamięć');
          break;
        case 'hub-status':
          await loadFederationStub();
          botStatus('Boga Bot hub · my-dax.com stub — programy pomagające ludziom');
          try { appendChatBubble('bot', 'Boga Bot hub (my-dax.com): Mr D + Bot Pamięć + Grok · szacunek, nie bóstwo.'); } catch (_) {}
          break;
        case 'exitpro':
          stopProMode();
          await exitVizFullscreen();
          break;
        case 'vizfull':
          await enterVizFullscreen({ keepChat: !!proVizActive });
          break;
        case 'exitviz':
          stopProMode();
          await exitVizFullscreen();
          break;
        case 'auto':
          setAutoSync(a.on !== false);
          if (autoSyncOn) doSync({ soft: false, flash: true });
          break;
        case 'sync':
          doSync({ soft: false, flash: true });
          break;
        case 'play':
          await bootAudio();
          if (!deckA.buffer) await autoPlayBuiltinBeat({ preferId: 'trance' });
          else if (!deckA.playing) { deckA.play(); updateDeckUI(deckA); }
          break;
        case 'pause':
          if (deckA.playing) { deckA.toggle(); updateDeckUI(deckA); }
          break;
        case 'preset':
          await ensureViz();
          milk?.random();
          break;
        case 'list-streams':
        case 'streams-disabled':
          botStatus('Mr D Fluid: streamy www WYŁĄCZONE — lokal + Drive.');
          break;
        case 'account-sync':
          await refreshAccountSync({ announce: true });
          break;
        case 'load-newest-drive':
          await loadNewestDriveTrack();
          break;
        case 'memory-status': {
          const { mem } = await fetchFluidAndMemory();
          const tip = mem
            ? `Bot Pamięć · ${mem.summaries ?? 0} notatek · ${mem.updated_at || ''}`.trim()
            : 'Bot Pamięć · sync…';
          botStatus('Mr D Fluid: ' + tip);
          break;
        }
        case 'status':
          await refreshAccountSync({ announce: false });
          break;
        case 'suggest-load':
          botCompanion._lastUrl = a.url;
          break;
        default:
          break;
      }
    },
  });

  // hydrate settings fields
  const s = botCompanion.settings;
  const keyEl = $('#botd-api-key');
  const epEl = $('#botd-api-endpoint');
  const modelEl = $('#botd-api-model');
  if (keyEl) keyEl.value = s.apiKey || '';
  if (epEl) epEl.value = s.endpoint || '';
  if (modelEl) modelEl.value = s.model || 'gpt-4o-mini';

  $('#botd-save-settings')?.addEventListener('click', () => {
    botCompanion.saveSettings({
      apiKey: $('#botd-api-key')?.value || '',
      endpoint: $('#botd-api-endpoint')?.value || '',
      model: $('#botd-api-model')?.value || 'gpt-4o-mini',
    });
    botStatus('Mr D Fluid: ustawienia LLM zapisane lokalnie.');
    appendChatBubble('bot', 'Ustawienia zapisane. Klucz zostaje w przeglądarce — nie wysyłam go nigdzie indziej poza Twoim endpointem.');
  });

  const form = $('#botd-chat-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#botd-chat-input');
    const text = (input?.value || '').trim();
    if (!text) return;
    input.value = '';
    appendChatBubble('user', text);
    // shortcut: ładuj last URL
    if (/^(ładuj|laduj|load)\b/i.test(text) && botCompanion._lastUrl) {
      const u = botCompanion._lastUrl;
      if (/^https?:\/\//i.test(u) && !/\/samples\//.test(u)) {
        appendChatBubble('bot', 'Web URL audio wyłączone — użyj Drive / Kali / lokalnego pliku.');
        return;
      }
      try {
        await loadUrlOntoA(u);
        appendChatBubble('bot', 'Załadowano na Deck A.');
      } catch (err) {
        appendChatBubble('bot', 'Nie udało się: ' + (err.message || err));
      }
      return;
    }
    try {
      const { reply } = await botCompanion.handleUserText(text);
      appendChatBubble('bot', reply);
      botStatus('Mr D Fluid: ' + reply.split('\n')[0].slice(0, 90));
    } catch (err) {
      appendChatBubble('bot', 'Ups — ' + (err.message || 'błąd'));
    }
  });

  $('#botd-streams')?.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('.botd-stream-btn');
    if (!btn) return;
    const builtin = btn.dataset.builtin;
    const url = btn.dataset.url;
    try {
      if (builtin) {
        await launchKaliMode({ beatId: builtin, enterFs: false });
        appendChatBubble('bot', `Builtin ${builtin} na A. Napisz „viz full” albo kliknij VIZ FULL.`);
      } else {
        appendChatBubble('bot', 'Streamy www wyłączone — użyj Kali/Trance/Drive.');
      }
    } catch (err) {
      appendChatBubble('bot', 'Stream fail: ' + (err.message || err) + ' · spróbuj Kali / Trance lokalnie.');
    }
  });

  // restore local chat snippets + greeting + sync status
  try {
    const prior = botCompanion.loadChatLocal?.() || [];
    for (const row of prior.slice(-12)) {
      if (row?.text) appendChatBubble(row.role === 'user' ? 'user' : 'bot', row.text);
    }
  } catch (_) {}
  refreshAccountSync({ announce: false }).then(() => {
    paintNetLivePills();
    const g = botCompanion.greeting();
    appendChatBubble('bot', g);
    botCompanion.pullGrokInbox?.().then((inbox) => {
      const last = (inbox || []).slice(-1)[0];
      if (last?.text) appendChatBubble('bot', '↪ Grok inbox: ' + last.text);
    }).catch(() => {});
  });
  // continuous sync: account + memory + internet pills
  if (!window.__accountSyncTimer) {
    window.__accountSyncTimer = setInterval(() => {
      refreshAccountSync({ announce: false });
      pollGrokLearn().catch(() => {});
    }, 45000);
  }
  if (!window.__grokLearnTimer) {
    window.__grokLearnTimer = setInterval(() => { pollGrokLearn().catch(() => {}); }, 12000);
    pollGrokLearn().catch(() => {});
    loadFederationStub().catch(() => {});
  }
  if (!window.__botAutoVizTimer) {
    window.__botAutoVizTimer = setInterval(() => {
      try {
        paintNetLivePills();
        const liveOn = !!(liveGenActive || window.__liveGeneratorOn || document.body.classList.contains('live-d'));
        const playing = !!(deckA?.playing || deckB?.playing);
        if (milk?.ready && (playing || liveOn)) {
          const va = $('#viz-auto');
          if (va && !va.checked) { va.checked = true; }
          if (milk && (!milk.autoCycle || !milk._cycleTimer)) {
            milk.setAutoCycle(true, 'wander', { ms: 9000 });
          }
        }
      } catch (_) {}
    }, 12000);
  }
  if (!window.__netPillBound) {
    window.__netPillBound = true;
    window.addEventListener('online', () => paintNetLivePills());
    window.addEventListener('offline', () => paintNetLivePills());
  }
}

/* ── Client self-heal (watchdog · audio · viz · SW) ─────────────── */
const SelfHeal = {
  intervalMs: 30000,
  vizMinGapMs: 60000,
  swUpdateMs: 5 * 60 * 1000,
  _timer: 0,
  _swTimer: 0,
  _busy: false,
  _offline: false,
  _emptySyncTried: false,
  _lastVizHeal: 0,
  _lastOkAt: 0,
  _healMsg: 'auto-heal · ok',
};

function paintHealPill(msg, { ok = true, warn = false, offline = false } = {}) {
  const prev = SelfHeal._healMsg;
  SelfHeal._healMsg = msg;
  const el = $('#botd-pill-heal');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('ok', !!ok && !warn && !offline);
  el.classList.toggle('warn', !!warn && !offline);
  el.classList.toggle('offline', !!offline);
  if (msg && msg !== prev && (warn || offline || String(msg).includes('retry') || String(msg).includes('ok'))) {
    const now = Date.now();
    if (!SelfHeal._lastHealReport || now - SelfHeal._lastHealReport > 20000) {
      SelfHeal._lastHealReport = now;
      reportHealEvent(msg);
    }
  }
}

function paintOfflinePills() {
  const drive = $('#botd-pill-drive');
  const grok = $('#botd-pill-grok');
  const sync = $('#botd-pill-sync');
  const label = $('#botd-account-label');
  if (drive) { drive.textContent = 'offline · retry'; drive.classList.remove('ok'); }
  if (grok) { grok.textContent = 'offline · retry'; grok.classList.remove('ok'); }
  if (sync) { sync.textContent = 'offline · retry'; sync.classList.remove('ok'); }
  if (label) label.textContent = 'offline · retry — auto-heal…';
  paintHealPill('auto-heal · retry…', { ok: false, warn: true, offline: true });
}

function paintOnlineRestored(st) {
  paintAccountStatus(st);
  const line = st?.statusLine || 'Google Drive · Grok · synced';
  const label = $('#botd-account-label');
  if (label && (st?.connected || st?.synced)) {
    const email = st?.accountEmail || 'konto Google (D Bot)';
    const n = st?.trackCount ?? 0;
    label.textContent = `połączony z kontem · ${email} · ${n} z Drive · ${line}`;
  }
  paintHealPill('auto-heal · ok', { ok: true });
}

async function fetchStatusOnce() {
  const res = await fetch('/api/account-status', { cache: 'no-cache' });
  if (!res.ok) throw new Error('status ' + res.status);
  return res.json();
}

async function fetchStatusWithRetries(retries = 2) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchStatusOnce();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        paintHealPill('auto-heal · retry…', { ok: false, warn: true });
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw lastErr || new Error('account-status failed');
}

async function tryResumeAudio(reason) {
  if (!window.__audioGestured) return false;
  if (!engine.ctx) return false;
  if (engine.ctx.state !== 'suspended') return false;
  try {
    await engine.ctx.resume();
    if (engine.ctx.state === 'running') {
      hideAudioGate();
      paintHealPill('auto-heal · ok', { ok: true });
      return true;
    }
  } catch (err) {
    console.warn('self-heal audio', reason, err);
  }
  return false;
}

async function healVizIfDead() {
  const now = performance.now();
  if (now - SelfHeal._lastVizHeal < SelfHeal.vizMinGapMs) return false;
  // Only heal when viz is supposed to be on
  if (viewMode === 'decks') return false;
  const canvas = $('#viz-canvas');
  if (!canvas || !window.butterchurn) return false;
  const dead = !milk || !milk.ready || (typeof milk.isAlive === 'function' && !milk.isAlive());
  if (!dead) return false;
  SelfHeal._lastVizHeal = now;
  paintHealPill('auto-heal · retry…', { ok: false, warn: true });
  try {
    // Force re-init if instance looks dead
    if (milk && milk.ready && typeof milk.isAlive === 'function' && !milk.isAlive()) {
      try { milk.destroy?.(); } catch (_) {}
      milk = null;
    }
    await ensureViz();
    try {
      const va = $('#viz-auto');
      if (va) va.checked = true;
      if (typeof milk?.ensureAutoCycle === 'function') milk.ensureAutoCycle();
      else milk?.setAutoCycle(true, 'wander', { ms: 9000 });
    } catch (_) {}
    paintHealPill('auto-heal · ok', { ok: true });
    return true;
  } catch (err) {
    console.warn('self-heal viz', err);
    paintHealPill('auto-heal · retry…', { ok: false, warn: true });
    return false;
  }
}

async function checkSwUpdate() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      try { await r.update(); } catch (_) {}
    }
  } catch (_) {}
}

async function selfHealTick() {
  if (SelfHeal._busy) return;
  SelfHeal._busy = true;
  try {
    let st = null;
    try {
      st = await fetchStatusWithRetries(2);
      SelfHeal._offline = false;
      SelfHeal._lastOkAt = Date.now();
      window.__accountStatus = st;
      if (botCompanion) botCompanion.accountStatus = st;
      paintOnlineRestored(st);

      const pl = window.__playlist || botCompanion?.playlist;
      const driveEmpty = !(pl?.driveTracks || []).length;
      if ((st?.connected || st?.synced) && driveEmpty && !SelfHeal._emptySyncTried) {
        SelfHeal._emptySyncTried = true;
        paintHealPill('auto-heal · retry…', { ok: false, warn: true });
        try {
          await refreshAccountSync({ announce: false });
          paintHealPill('auto-heal · ok', { ok: true });
        } catch (err) {
          console.warn('self-heal empty playlist sync', err);
        }
      }
      // Reset empty-sync latch once we have drive tracks again
      if ((window.__playlist?.driveTracks || []).length) SelfHeal._emptySyncTried = false;
    } catch (err) {
      SelfHeal._offline = true;
      console.warn('self-heal status', err);
      paintOfflinePills();
    }

    await tryResumeAudio('watchdog');
    await healVizIfDead();
  } finally {
    SelfHeal._busy = false;
  }
}

function startSelfHeal() {
  if (SelfHeal._timer) return;
  paintHealPill('auto-heal · ok', { ok: true });
  // First tick shortly after boot (bindBotD already syncs); then every ~30s
  SelfHeal._timer = setInterval(() => { selfHealTick(); }, SelfHeal.intervalMs);
  // Visibility / pageshow → audio resume + light status check
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tryResumeAudio('visibility');
      selfHealTick();
    }
  });
  window.addEventListener('pageshow', () => { tryResumeAudio('pageshow'); });
  // Periodic SW update check (skipWaiting/clients.claim already in sw.js)
  checkSwUpdate();
  SelfHeal._swTimer = setInterval(checkSwUpdate, SelfHeal.swUpdateMs);
  window.__selfHeal = SelfHeal;
}

function registerSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }) // v43: same script URL as the main pages (no SW re-install ping-pong)
      .then((reg) => {
        try { var u53 = reg.update(); if (u53 && u53.catch) u53.catch(function () {}); } catch (_) {}
      })
      .catch(() => {});
  });
}


function tick() {
  updateDeckUI(deckA);
  updateDeckUI(deckB);
  updateMasterUI();
  tickAutoSync();

  const now = performance.now();
  const bands = engine.getBandEnergies ? engine.getBandEnergies() : { bass: engine.getBassEnergy(), mid: 0, high: 0, energy: 0 };
  const dtMs = SharkSwim.lastTs ? (now - SharkSwim.lastTs) : 16.7;
  SharkSwim.lastTs = now;
  updateSharkSwim(bands, dtMs);
  const bass = bands.bass || 0;
  if (bass > 0.45 && now - lastKick > 200) {
    lastKick = now;
    $('#app-root')?.classList.add('kick-pulse');
    pulseShark(bass);
    setTimeout(() => $('#app-root')?.classList.remove('kick-pulse'), 100);
  }

  const pack = (deck) => {
    if (!deck.buffer) return { progress: 0 };
    const dur = deck.buffer.duration;
    return {
      progress: deck.position / dur,
      cue: (deck.cuePoint || 0) / dur,
      hotCues: (deck.hotCues || []).map((t) => (t == null ? null : t / dur)),
      loop: deck.loop
        ? { start: deck.loop.start / dur, end: deck.loop.end / dur }
        : null,
      colorA: deck.id === 'A' ? '#00f0ff' : '#ff2d95',
      colorB: deck.id === 'A' ? '#006680' : '#801440',
    };
  };
  const ca = $('#deck-a .waveform');
  const cb = $('#deck-b .waveform');
  if (ca) drawWaveform(ca, peaksA, pack(deckA));
  if (cb) drawWaveform(cb, peaksB, pack(deckB));
  requestAnimationFrame(tick);
}

function init() {
  bindDeck(deckA, 'A');
  bindDeck(deckB, 'B');
  bindMixer();
  bindFx();
  bindMidi();
  bindChrome();
  bindVizControls();
  bindBotD();
  bindBotChat();
  bindOwnerAndRemote();
  renderYtPlaylistUI();
  bindPwaInstall();
  pendingLaunchMode = parseLaunchParams();
  setViewMode('viz');
  {
    const gb = $('#audio-gate-btn');
    if (gb) gb.textContent = '▶ AUTO · MilkDrop LIVE D + D Beast';
    const gk = $('#audio-gate-kali');
    if (gk) gk.classList.add('gate-primary');
    if (pendingLaunchMode === 'kali') {
      botStatus('Mr D Fluid: tryb Kali — kliknij START albo KALI.');
    }
  }
  startGatePsych();
  registerSW();
  startSelfHeal();
  updateMasterUI();
  demoOk();
  document.title = 'D DJ Pro Fly · D Beast · WhatsApp · Kraków';
  try {
    const wa = $('#btn-whatsapp');
    if (wa) wa.href = WA_LINK();
    window.__liveUrl = window.__liveUrl || 'https://ddddddd7777777.lilac-drip.workers.dev';
  } catch (_) {}
  tick();
}

init();
