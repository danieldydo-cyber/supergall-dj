/**
 * D DJ Pro Fly · PRO — curated YouTube IFrame embeds (trance / techno / Berlin).
 * ToS-safe: IFrame API only, no audio download/scrape.
 * Daniel Dydo · Kraków
 */

/** @typedef {{ id: string, title: string, genre: 'trance'|'techno'|'berlin'|'kali'|'mix', bpm: number, live?: boolean, featured?: boolean, opening?: boolean }} YtTrack */


/** Featured opening — Daniel's DaX / Brother Max set (first on page + AUTO) */
export const BROTHER_MAX_OPENING = {
  id: 'D6DNubWWsoI',
  title: 'DaXDJ RemiX Dj  70min set DD',
  genre: 'mix',
  bpm: 128,
  featured: true,
  opening: true,
  url: 'https://youtu.be/D6DNubWWsoI',
};

/** Curated allowlist — official / Boiler Room / label mixes that typically allow embed. */
export const KALI_LIVE_RADIO = {
  id: 'jMRlCH3B6mY',
  title: 'KALI LIVE RADIO (24/7)',
  genre: 'kali',
  bpm: 120,
  live: true,
  url: 'https://www.youtube.com/live/jMRlCH3B6mY',
};

export const YT_ALLOWLIST = /** @type {YtTrack[]} */ ([
  BROTHER_MAX_OPENING,
  KALI_LIVE_RADIO,
  // Berlin techno
  { id: 'mzwAC_Am0bI', title: 'Oscar Mulero · Boiler Room Berlin', genre: 'berlin', bpm: 128 },
  { id: '62Ql2yzFJZo', title: 'Ken Ishii · Boiler Room Berlin', genre: 'berlin', bpm: 128 },
  { id: '5vHRUsP20dQ', title: 'Maceo Plex · Boiler Room Berlin', genre: 'berlin', bpm: 126 },
  { id: 'pEOhnkjEpqE', title: 'Ancient Methods · Boiler Room Berlin', genre: 'berlin', bpm: 130 },
  { id: '6JCrFdcFH88', title: 'Heiko Laux · Boiler Room Berlin', genre: 'berlin', bpm: 128 },
  { id: 'gzW5qOPXD2Y', title: 'Klangkuenstler · Boiler Room Berlin', genre: 'berlin', bpm: 140 },
  { id: 'v-q6nwlfeL0', title: 'Gabber Modus Operandi · BR Festival Berlin', genre: 'berlin', bpm: 150 },
  // Techno
  { id: '5NuRC714fv8', title: 'Chris Liebing B2B Luke Slater · BR Warsaw', genre: 'techno', bpm: 132 },
  { id: 'LgjbRXB5hVE', title: 'BIIA · Boiler Room x Teletech 2024', genre: 'techno', bpm: 140 },
  { id: 'EUc3zR3pHhQ', title: 'DINA · Boiler Room Ghent', genre: 'techno', bpm: 135 },
  { id: 'vffcMNENsFU', title: 'Courtesy · Boiler Room Berlin (Kulør)', genre: 'techno', bpm: 128 },
  // Trance
  { id: 'w6bckgiG7OI', title: 'Ferry Corsten · Blueprint Reprinted (Black Hole)', genre: 'trance', bpm: 132 },
  { id: 'Dzjn0L02u8w', title: 'Ferry Corsten · What The F! · Luminosity 2023', genre: 'trance', bpm: 138 },
  { id: 'IhrrJgsl5po', title: 'Ferry Corsten · ASOT 1271 Residency Mix', genre: 'trance', bpm: 132 },
  { id: 'jl1TlMu1E-w', title: 'Ferry Corsten · ASOT 2025 Ahoy Rotterdam', genre: 'trance', bpm: 138 },
]);

export function filterYtByGenre(genre) {
  const g = String(genre || '').toLowerCase();
  if (!g || g === 'all' || g === 'any' || g === 'random') return YT_ALLOWLIST.slice();
  if (g === 'berlin' || g === 'berlin-techno' || g === 'berlin_techno') {
    return YT_ALLOWLIST.filter((t) => t.genre === 'berlin');
  }
  if (g === 'techno') {
    // techno pool includes berlin
    return YT_ALLOWLIST.filter((t) => t.genre === 'techno' || t.genre === 'berlin');
  }
  if (g === 'trance') {
    return YT_ALLOWLIST.filter((t) => t.genre === 'trance');
  }
  if (g === 'kali' || g === 'kali-radio' || g === 'kali_live' || g === 'radio') {
    const kali = YT_ALLOWLIST.filter((t) => t.genre === 'kali' || t.live);
    return kali.length ? kali : [KALI_LIVE_RADIO];
  }
  return YT_ALLOWLIST.slice();
}

export function pickRandomYt(genre, excludeId) {
  let pool = filterYtByGenre(genre);
  if (excludeId && pool.length > 1) {
    pool = pool.filter((t) => t.id !== excludeId);
  }
  if (!pool.length) pool = YT_ALLOWLIST.slice();
  return pool[Math.floor(Math.random() * pool.length)];
}


/** Session playlist — pasted IDs / search picks (not persisted). */
export const YT_SESSION = /** @type {YtTrack[]} */ ([]);

export function extractYtId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').slice(0, 11);
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const m = u.pathname.match(/\/(?:embed|live|shorts)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  } catch (_) {}
  const m2 = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return m2 ? m2[1] : '';
}

/**
 * Client-side search: allowlist filter + optional pasted URL/ID.
 * No YouTube Data API key (free stack).
 * @returns {{ results: YtTrack[], urlTrack: YtTrack|null, query: string }}
 */
export function searchYoutube(query) {
  const q = String(query || '').trim();
  const id = extractYtId(q);
  let urlTrack = null;
  if (id) {
    const known = YT_ALLOWLIST.find((t) => t.id === id) || YT_SESSION.find((t) => t.id === id);
    urlTrack = known || {
      id,
      title: 'YouTube · ' + id,
      genre: 'trance',
      bpm: 128,
      session: true,
      url: 'https://youtu.be/' + id,
    };
  }
  const tokens = q.toLowerCase().split(/\s+/).filter((t) => t && t.length > 1 && !/^https?:/.test(t) && t.length !== 11);
  let results = YT_ALLOWLIST.slice();
  if (tokens.length) {
    results = YT_ALLOWLIST.filter((t) => {
      const hay = `${t.title} ${t.genre} ${t.id}`.toLowerCase();
      return tokens.every((tok) => hay.includes(tok));
    });
    // soft: any token match if empty
    if (!results.length) {
      results = YT_ALLOWLIST.filter((t) => {
        const hay = `${t.title} ${t.genre}`.toLowerCase();
        return tokens.some((tok) => hay.includes(tok));
      });
    }
  }
  if (urlTrack && !results.some((t) => t.id === urlTrack.id)) {
    results = [urlTrack, ...results];
  }
  return { results, urlTrack, query: q };
}

export function addToSessionPlaylist(track) {
  if (!track?.id) return null;
  if (!YT_SESSION.some((t) => t.id === track.id) && !YT_ALLOWLIST.some((t) => t.id === track.id)) {
    YT_SESSION.push(track);
  }
  return track;
}

let _apiPromise = null;

export function loadYoutubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (_apiPromise) return _apiPromise;
  _apiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      fn(v);
    };
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try { if (typeof prev === 'function') prev(); } catch (_) {}
      if (window.YT && window.YT.Player) done(resolve, window.YT);
      else done(reject, new Error('YT API ready but Player missing'));
    };
    if (!document.querySelector('script[data-ddj-yt-api]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.dataset.ddjYtApi = '1';
      s.onerror = () => done(reject, new Error('YouTube IFrame API load failed'));
      document.head.appendChild(s);
    }
    // Never hang AUTO / LIVE D — fail open after 8s
    setTimeout(() => {
      if (window.YT && window.YT.Player) done(resolve, window.YT);
      else done(reject, new Error('YouTube IFrame API timeout'));
    }, 8000);
  });
  return _apiPromise;
}

/**
 * Lightweight PRO YouTube host — one player, random allowlist picks, skip on error.
 */
export class ProYtDj {
  constructor({ hostEl, onTrack, onError, onState } = {}) {
    this.hostEl = hostEl;
    this.onTrack = onTrack;
    this.onError = onError;
    this.onState = onState;
    this.player = null;
    this.current = null;
    this.genre = 'all';
    this._ready = false;
    this._skipTries = 0;
  }

  async ensurePlayer() {
    if (this.player && this._ready) return this.player;
    if (!this.hostEl) throw new Error('no YT host');
    await loadYoutubeApi();
    await new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, v) => {
        if (settled) return;
        settled = true;
        fn(v);
      };
      const timer = setTimeout(() => done(reject, new Error('YT player ready timeout')), 10000);
      try {
        this.player = new window.YT.Player(this.hostEl, {
          width: '180',
          height: '101',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            iv_load_policy: 3,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              this._ready = true;
              clearTimeout(timer);
              done(resolve);
            },
            onError: (e) => {
              const code = e?.data;
              this.onError?.(code, this.current);
              // Auto-skip broken embeds
              this._skipTries += 1;
              if (this._skipTries < 8) {
                this.next(this.genre).catch(() => {});
              }
            },
            onStateChange: (e) => {
              this.onState?.(e?.data, this.current);
              // 0 = ended → next random
              if (e?.data === 0) {
                if (this.current?.live) {
                  this.playTrack(this.current).catch(() => {});
                } else {
                  this.next(this.genre).catch(() => {});
                }
              }
              if (e?.data === 1) {
                this._skipTries = 0;
              }
            },
          },
        });
      } catch (err) {
        clearTimeout(timer);
        done(reject, err);
      }
    });
    return this.player;
  }

  async playTrack(track) {
    if (!track?.id) return null;
    if (track.session) addToSessionPlaylist(track);
    await this.ensurePlayer();
    this.current = track;
    this.onTrack?.(track);
    try {
      this.player.loadVideoById({ videoId: track.id, startSeconds: 0 });
      this.player.unMute?.();
      this.player.setVolume?.(100);
      this.player.playVideo?.();
    } catch (err) {
      this.onError?.(err, track);
      return null;
    }
    return track;
  }

  async playKaliLive() {
    this.genre = 'kali';
    return this.playTrack(KALI_LIVE_RADIO);
  }

  async playBrotherMaxOpening() {
    this.genre = 'all';
    return this.playTrack(BROTHER_MAX_OPENING);
  }

  async next(genre) {
    const g = genre != null ? genre : this.genre;
    this.genre = g || 'all';
    if (this.genre === 'kali' || this.genre === 'radio') {
      return this.playKaliLive();
    }
    const track = pickRandomYt(this.genre, this.current?.id);
    return this.playTrack(track);
  }

  pause() {
    try { this.player?.pauseVideo?.(); } catch (_) {}
  }

  resume() {
    try { this.player?.playVideo?.(); } catch (_) {}
  }

  stop() {
    try { this.player?.stopVideo?.(); } catch (_) {}
    try { this.player?.pauseVideo?.(); } catch (_) {}
  }

  destroy() {
    this.stop();
    try { this.player?.destroy?.(); } catch (_) {}
    this.player = null;
    this._ready = false;
    this.current = null;
  }
}
