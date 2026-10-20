/**
 * D Beast / D Bot — international companion (as Daniel Dydo · Kraków).
 * PL/EN · hip-hop/Kali + Berlin techno + trance ~120 · YouTube + WhatsApp remote.
 * Account-linked: Drive · Gmail · Bot Pamięć · LIVE 💚
 * Optional LLM key in localStorage. Grok bridge outbox — no fake Grok API.
 */

const FREE_STREAMS = []; // remote/web audio streams DISABLED — local + Drive only
const LOCAL_BEATS = [
  { id: 'kaliradio-hint', name: 'Kali (builtin)', genre: 'hip-hop ~120', url: 'samples/kali-hiphop-120.wav', note: 'lokalny · nie stream', builtin: 'kali' },
  { id: 'trance-hint', name: 'Trance (builtin)', genre: 'trance ~120', url: 'samples/trance-120.wav', note: 'lokalny · nie stream', builtin: 'trance' },
];

const GREETINGS = [
  'Siema — D Beast 💚 · international · Kraków · hip-hop/Kali + Berlin + trance. WhatsApp linked · YouTube control. Napisz „yt …” / „play” / „viz”.',
  'Yo — D Beast ONLINE (as D Bot). PL/EN · LIVE · WA remote · YT search. Try: yt ferry · play · next · auto · viz.',
  'Cześć — D Bot · D Beast 💚 · Daniel Dydo vibe. Sync · Kali · PRO YT · viz AUTO. Help = komendy.',
];

const CHAT_LS_KEY = 'mr-d-fluid-chat';
const CHAT_LS_MAX = 40;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function extractUrls(text) {
  const re = /https?:\/\/[^\s<>"']+/gi;
  return (text.match(re) || []).map((u) => u.replace(/[.,);]+$/, ''));
}

async function probeUrl(url) {
  const out = { url, ok: false, type: '', status: 0, title: '', error: '' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res;
    try {
      res = await fetch(url, { method: 'HEAD', mode: 'cors', signal: ctrl.signal });
    } catch {
      res = await fetch(url, { method: 'GET', mode: 'cors', signal: ctrl.signal, headers: { Range: 'bytes=0-0' } });
    }
    clearTimeout(t);
    out.status = res.status;
    out.ok = res.ok || res.status === 206;
    out.type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (out.type.includes('html')) out.title = 'strona HTML (nie audio)';
    else if (out.type.startsWith('audio/') || /mpeg|aac|ogg|wav|flac|mp4/.test(out.type)) out.title = 'audio stream / plik';
    else if (out.ok) out.title = out.type || 'OK';
  } catch (err) {
    out.error = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'fetch fail / CORS');
  }
  return out;
}

function memoryHint(ctx) {
  const m = ctx.memoryStatus || ctx.fluidStatus?.memory;
  if (!m) return 'pamięć · sync…';
  const n = m.summaries ?? (Array.isArray(m.summaryList) ? m.summaryList.length : null);
  const when = m.updated_at || m.updatedAt || '';
  if (n != null) return `Bot Pamięć · ${n} notatek${when ? ' · ' + String(when).slice(0, 16) : ''}`;
  return m.bot || 'Bot Pamięć · OK';
}

function localReply(raw, ctx = {}) {
  const text = (raw || '').trim();
  const lower = text.toLowerCase();
  const urls = extractUrls(text);
  const actions = [];

  // D Beast remote / YT commands: yt <q>, play <id>, viz, auto, next
  const ytCmd = text.match(/^\s*(?:yt|youtube|search)\s+(.+)$/i);
  if (ytCmd) {
    actions.push({ type: 'yt-search', query: ytCmd[1].trim() });
  }
  const playCmd = text.match(/^\s*play\s+([a-zA-Z0-9_-]{11}|https?:\S+)/i);
  if (playCmd) {
    actions.push({ type: 'yt-play', idOrUrl: playCmd[1].trim() });
  } else if (/^\s*play\s*$/i.test(text) || (/\b(play|graj)\b/.test(lower) && !playCmd)) {
    // bare play handled later
  }
  if (/^\s*(next|następny|nastepny)\s*$/i.test(text) || /\b(next\s*yt|pro-next)\b/.test(lower)) {
    actions.push({ type: 'pro', genre: 'all', next: true });
  }
  if (/^\s*(auto)\s*$/i.test(text)) {
    actions.push({ type: 'auto', on: true });
  }
  if (/^\s*(viz)\s*$/i.test(text)) {
    actions.push({ type: 'pro', genre: 'all' });
  }
  if (/\b(d\s*beast|dbeast|kim jesteś|kim jestes|who are you)\b/.test(lower)) {
    actions.push({ type: 'status' });
  }

  if (/\b(sync|dysk|drive|konto|playlist|odśwież|odswiez)\b/.test(lower)) {
    actions.push({ type: 'account-sync' });
  }
  if (/\b(najnowszy|newest|ostatni\s*drive|load\s*drive)\b/.test(lower)) {
    actions.push({ type: 'load-newest-drive' });
  }
  if (/\b(pamięć|pamiec|memory|bot\s*pami)\b/.test(lower)) {
    actions.push({ type: 'memory-status' });
  }
  if (/\b(ucz\s*się|learn|naucz|zapamiętaj|zapamietaj)\b/.test(lower)) {
    actions.push({ type: 'learn' });
  }
  if (/\b(boga|my-?dax|hub|federat|peer)\b/.test(lower)) {
    actions.push({ type: 'hub-status' });
  }
  if (/\b(status|live|online|internet)\b/.test(lower) && !/\b(stream)\b/.test(lower)) {
    actions.push({ type: 'status' });
  }

  // PRO VIZ + YouTube DJ (curated embeds) — pro / youtube / losuj / next yt / genre
  if (/\b(life\s*generator|live\s*generator|live\s*gen|life\s*gen|generator|żyj|zyj|generuj)\b/.test(lower)) {
    actions.push({ type: 'live-gen', withProYt: true });
  }
  const wantsPro =
    /\b(pro|youtube|\byt\b|losuj|next\s*yt|viz\s*pro|pro\s*viz)\b/.test(lower)
    || (/\b(trance|techno|berlin)\b/.test(lower) && /\b(pro|youtube|\byt\b|losuj|viz)\b/.test(lower));
  const genreMatch = lower.match(/\b(trance|techno|berlin)\b/);
  if (wantsPro || /\b(pro|youtube|\byt\b|losuj|next\s*yt)\b/.test(lower)) {
    let genre = 'all';
    if (genreMatch) genre = genreMatch[1];
    actions.push({ type: 'pro', genre, next: /\b(next\s*yt|losuj|next)\b/.test(lower) });
  } else if (/\btrance\b/.test(lower)) {
    actions.push({ type: 'pro', genre: 'trance' });
  } else if (/\bberlin\b/.test(lower)) {
    actions.push({ type: 'pro', genre: 'berlin' });
  } else if (/\btechno\b/.test(lower)) {
    actions.push({ type: 'pro', genre: 'techno' });
  }

  if (/\b(kali|hip.?hop)\b/.test(lower) && !/\bradio\b/.test(lower)) {
    actions.push({ type: 'kali', beatId: 'kali' });
  } else if (/\b(demo|test.?120)\b/.test(lower)) {
    actions.push({ type: 'beat', beatId: 'demo' });
  }

  // bare "viz" (not viz full / exit) → PRO immersive
  if (/\bviz\b/.test(lower) && !/\b(viz\s*full|exit\s*viz|wyjdź|wyjdz)\b/.test(lower) && !actions.some((a) => a.type === 'pro')) {
    actions.push({ type: 'pro', genre: 'all' });
  }
  if (/\b(viz\s*full|fullscreen|pełny|immersive|fs)\b/.test(lower) && !actions.some((a) => a.type === 'pro')) {
    actions.push({ type: 'vizfull' });
  }
  if (/\b(exit\s*viz|exit\s*pro|wyjdź|wyjdz|esc)\b/.test(lower)) {
    actions.push({ type: 'exitviz' });
    actions.push({ type: 'exitpro' });
  }
  if (/\b(auto\s*sync|autosync|włącz auto|wlacz auto)\b/.test(lower)) {
    actions.push({ type: 'auto', on: true });
  }
  if (/\bsync\b/.test(lower) && !/auto/.test(lower) && !/\b(dysk|drive|konto|playlist)\b/.test(lower)) {
    if (!actions.some((a) => a.type === 'account-sync')) {
      actions.push({ type: 'sync' });
    }
  }
  if (/\b(play|graj|odtwórz|odtworz)\b/.test(lower)) {
    actions.push({ type: 'play' });
  }
  if (/\b(pause|pauza|stop)\b/.test(lower)) {
    actions.push({ type: 'pause' });
  }
  if (/\b(preset|milkdrop|rnd|random)\b/.test(lower)) {
    actions.push({ type: 'preset' });
  }
  if (/\b(streamy|streams|radio list|wolne stream)\b/.test(lower)) {
    actions.push({ type: 'streams-disabled' });
  }
  if (/\b(pomoc|help|co potrafisz|komendy)\b/.test(lower)) {
    actions.push({ type: 'help' });
  }
  if (urls.length) {
    actions.push({ type: 'streams-disabled' });
  }

  let reply = '';
  const st = ctx.accountStatus;
  const stLine = st
    ? `${st.googleDrive || '?'} · ${st.gmail || '?'} · ${st.grok || '?'} · ${st.synced ? 'synced' : '…'}`
    : 'status z /api/account-status';
  const memLine = memoryHint(ctx);
  const netOn = navigator.onLine !== false;

  if (actions.some((a) => a.type === 'account-sync')) {
    reply = `Odświeżam sync… Drive/Gmail/pamięć · Internet ${netOn ? 'ON' : 'OFF'} · (${stLine}).`;
  } else if (actions.some((a) => a.type === 'load-newest-drive')) {
    reply = 'Ładuję najnowszy track z Drive na Deck A…';
  } else if (actions.some((a) => a.type === 'memory-status')) {
    reply = `Pamięć: ${memLine}. Publiczny snapshot: samples/memory-public.json. Grok linked · ucz się.`;
  } else if (actions.some((a) => a.type === 'learn')) {
    reply = 'Grok linked · ucz się 💚 — zapisuję rozmowę do Bot Pamięć (outbox→ingest). Boga Bot hub: programy pomagające ludziom.';
  } else if (actions.some((a) => a.type === 'hub-status')) {
    reply = 'Boga Bot hub (my-dax.com) — szacunek: to marka programów pomagających ludziom, nie bóstwo. Peers: stub federation w samples/boga-hub-federation.json · Mr D + Bot Pamięć + Grok link.';
  } else if (actions.some((a) => a.type === 'status')) {
    reply = `D Beast 💚 international · WhatsApp linked · YouTube control · ${memLine} · net ${netOn ? 'ON' : 'OFF'} · ${stLine}.`;
  } else if (actions.some((a) => a.type === 'yt-search')) {
    const q = actions.find((a) => a.type === 'yt-search')?.query || '';
    reply = `Szukam YT: „${q}" · allowlist + URL/ID. Top wynik lecę / lista w panelu.`;
  } else if (actions.some((a) => a.type === 'yt-play')) {
    reply = 'Play YT — ładuję ID/URL na PRO player.';
  } else if (actions.some((a) => a.type === 'help') || /^(cześć|czesc|hej|hi|hello|siema)\b/.test(lower)) {
    reply = pick([
      `D Beast — as D Bot · Kraków. Komendy: yt <query> · play <id> · next · viz · auto · kali · sync. ${stLine}`,
      'D Bot · D Beast 💚 international · WhatsApp linked · YouTube control. PLAY DA-X · SEARCH YT · VIZ · AUTO · WA LINK.',
    ]);
  } else if (actions.some((a) => a.type === 'live-gen')) {
    reply = 'LIVE GENERATOR 💚 — endless unique viz + energia Kali/techno/trance ~120 + Mr D na wizualizacji. PRO YT też leci.';
  } else if (actions.some((a) => a.type === 'pro')) {
    const g = actions.find((a) => a.type === 'pro')?.genre || 'all';
    const gLabel = g === 'all' ? 'trance/techno/Berlin' : g;
    reply = `PRO VIZ 💚 — MilkDrop non-stop + YouTube ${gLabel} (losowy embed). Pisz dalej na wizualizacji · „next yt" / „losuj". Esc = wyjście.`;
  } else if (actions.some((a) => a.type === 'kali')) {
    reply = 'Kali hip-hop 120 na A, AUTO on, VIZ FULL. Esc żeby wrócić. (PRO = YouTube trance/techno/Berlin.)';
  } else if (actions.some((a) => a.type === 'beat')) {
    const id = actions.find((a) => a.type === 'beat')?.beatId;
    reply = `Podaję ${id} na Deck A i puszczam. PRO: „pro" / „youtube" / „losuj".`;
  } else if (actions.some((a) => a.type === 'vizfull')) {
    reply = 'VIZ FULL — MilkDrop na cały ekran. Esc / EXIT / double-tap wychodzi. PRO = viz + YT DJ.';
  } else if (actions.some((a) => a.type === 'streams-disabled') || urls.length) {
    reply = 'Streamy www / URL audio WYŁĄCZONE. Lokal + Drive + builtin Kali. Wyjątek PRO: curated YouTube IFrame (trance/techno/Berlin).';
  } else if (/\b(bpm|tempo)\b/.test(lower)) {
    const bpm = ctx.masterBpm || 120;
    reply = `Master ≈ ${Number(bpm).toFixed(1)} BPM. Kali/Trance 120, Berlin techno 128.`;
  } else if (/\b(kraków|krakow|daniel|kim jesteś|kim jestes|who are you)\b/.test(lower)) {
    reply = `Jestem D Beast — international DJ companion as Daniel Dydo (Kraków). Hip-hop/Kali + Berlin techno + trance ~120. ${stLine} · ${memLine}.`;
  } else if (/\b(pogoda|news|wiadomoś|wiadomosc|co slychac|co słychać)\b/.test(lower)) {
    reply = netOn
      ? `Internet ON 💚 — nie ściągam live news bez Twojego klucza LLM, ale sync Drive/Gmail/pamięć działa. ${memLine}. Opowiedz co Cię interesuje albo wklej kontekst.`
      : 'Internet offline — lecę lokalnie + cache. Spróbuj sync gdy wróci sieć.';
  } else if (/\b(dziękuję|dziekuje|thanks|thx|spoko|git|super|ok)\b/.test(lower)) {
    reply = pick(['Jasne 💚', 'Leć dalej — jestem tu.', 'OK · LIVE.']);
  } else if (text.length < 2) {
    reply = pick(GREETINGS);
  } else {
    // Universal conversation — acknowledge + light weave (not DJ-only)
    const snippet = text.length > 140 ? text.slice(0, 137) + '…' : text;
    reply = pick([
      `Słyszę: „${snippet}”. Mogę pogadać o tym albo odpalić sync/kali/viz. ${memLine}.`,
      `OK — „${snippet}". Jestem D Beast: rozmowa + Drive/Gmail/pamięć + DJ. Co dalej?`,
      `Notuję w sesji: „${snippet}". Internet ${netOn ? 'ON' : 'OFF'} · ${stLine}. Pytaj śmiało albo „help”.`,
      `Rozumiem. Krótko: jestem przy Tobie LIVE 💚. Chcesz kontekst z pamięci („pamięć”), sync dysku, czy po prostu gadamy?`,
    ]);
  }

  return { reply, actions, urls };
}

async function llmReply(messages, settings) {
  const key = (settings.apiKey || '').trim();
  const endpoint = (settings.endpoint || '').trim()
    || 'https://api.openai.com/v1/chat/completions';
  const model = (settings.model || '').trim() || 'gpt-4o-mini';
  if (!key) return null;

  const system = {
    role: 'system',
    content:
      'You are D Beast (D Bot), international DJ companion speaking as Daniel Dydo (Kraków). Warm Polish/English. '
      + 'Vibe: hip-hop/Kali + Berlin techno + trance ~120. WhatsApp-linked remote + YouTube control. '
      + 'Linked with Grok Bot (learn LIVE), Bot Pamięć, LIVE GENERATOR, hub my-dax.com (helpers, never claim to be God). '
      + 'Commands: yt <q>, play <id>, next, viz, auto. No scraped audio URLs. '
      + 'Never ask for API keys. Never send Gmail or post to X. Keep answers under 4 short sentences.',
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.75,
      max_tokens: 280,
      messages: [system, ...messages.slice(-14)],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${errText.slice(0, 120)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM empty');
  return String(content).trim();
}

export class BotCompanion {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.history = [];
    this.settings = this.loadSettings();
    this.open = false;
    this.accountStatus = null;
    this.playlist = null;
    this.memoryStatus = null;
    this.fluidStatus = null;
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem('ddj-botd-settings');
      if (raw) return { apiKey: '', endpoint: '', model: 'gpt-4o-mini', ...JSON.parse(raw) };
    } catch (_) {}
    return { apiKey: '', endpoint: '', model: 'gpt-4o-mini' };
  }

  saveSettings(partial = {}) {
    this.settings = { ...this.settings, ...partial };
    try {
      localStorage.setItem('ddj-botd-settings', JSON.stringify({
        apiKey: this.settings.apiKey || '',
        endpoint: this.settings.endpoint || '',
        model: this.settings.model || 'gpt-4o-mini',
      }));
    } catch (_) {}
  }

  loadChatLocal() {
    try {
      const raw = localStorage.getItem(CHAT_LS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.slice(-CHAT_LS_MAX) : [];
    } catch (_) {
      return [];
    }
  }

  persistChatLocal(role, text) {
    try {
      const arr = this.loadChatLocal();
      arr.push({ role, text: String(text).slice(0, 2000), at: new Date().toISOString() });
      localStorage.setItem(CHAT_LS_KEY, JSON.stringify(arr.slice(-CHAT_LS_MAX)));
    } catch (_) {}
  }

  streams() {
    return [];
  }
  localBeats() {
    return (typeof LOCAL_BEATS !== 'undefined' ? LOCAL_BEATS : []).slice();
  }

  greeting() {
    const st = this.accountStatus;
    const mem = memoryHint({ memoryStatus: this.memoryStatus, fluidStatus: this.fluidStatus });
    const net = navigator.onLine !== false ? 'Internet ON' : 'Internet OFF';
    if (st?.connected || st?.synced) {
      return `Siema — D Beast 💚 · ${st.accountEmail || 'D Bot'} · international · WhatsApp linked · YouTube control · ${st.statusLine || 'Drive · Gmail · synced'} · ${mem} · ${net}. Napisz yt … / play / viz / auto.`;
    }
    return pick(GREETINGS);
  }

  async pushGrokOutbox(text, role = 'user', extra = {}) {
    const tags = Array.isArray(extra.tags) ? extra.tags : ['learn', 'help'];
    if (role === 'heal' && !tags.includes('heal')) tags.push('heal');
    const payload = {
      text,
      role,
      direction: 'outbox',
      learn: true,
      help: tags.includes('help'),
      heal: tags.includes('heal'),
      tags,
      hub: 'https://my-dax.com',
      ...extra,
    };
    try {
      await fetch('/api/grok-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      try {
        await fetch('/api/chat-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, role }),
        });
      } catch (__) {}
    }
    // Also hit chat-log for parent visibility when bridge works
    try {
      await fetch('/api/chat-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, role, learn: true }),
      });
    } catch (_) {}
  }

  /** Explicit learn note → outbox (Bot Pamięć ingest picks it up). */
  async saveLearnNote(text, topic = 'learn') {
    const line = String(text || '').trim();
    if (!line) return;
    await this.pushGrokOutbox(line, 'learn', { topic });
    this.persistChatLocal('bot', '💾 Pamięć: ' + line.slice(0, 160));
  }

  async pullGrokBridge() {
    try {
      const res = await fetch('/api/grok-bridge', { cache: 'no-cache' });
      if (!res.ok) return { inbox: [], learn: null, hub: null };
      const data = await res.json();
      this.lastBridge = data;
      return data;
    } catch (_) {
      return { inbox: [], learn: null, hub: null };
    }
  }

  async pullGrokInbox() {
    const data = await this.pullGrokBridge();
    return data.inbox || [];
  }

  async handleUserText(text) {
    const ctx = {
      masterBpm: this.hooks.getMasterBpm?.() || 120,
      accountStatus: this.accountStatus,
      memoryStatus: this.memoryStatus,
      fluidStatus: this.fluidStatus,
    };
    const local = localReply(text, ctx);
    this.history.push({ role: 'user', content: text });
    this.persistChatLocal('user', text);
    this.pushGrokOutbox(text, 'user');

    const other = local.actions.filter((a) => a.type !== 'probe-url');
    for (const a of other) {
      try { await this.hooks.runAction?.(a); } catch (err) { console.warn('bot action', a, err); }
    }

    let reply = local.reply;
    if ((this.settings.apiKey || '').trim()) {
      try {
        const llm = await llmReply(this.history, this.settings);
        if (llm) reply = llm;
      } catch (err) {
        reply = `${local.reply}\n\n(LLM offline: ${err.message || 'error'} — lecę lokalnie.)`;
      }
    }

    this.history.push({ role: 'assistant', content: reply });
    this.persistChatLocal('assistant', reply);
    this.pushGrokOutbox(reply, 'bot');
    return { reply, actions: local.actions };
  }
}

export { FREE_STREAMS, probeUrl, extractUrls, CHAT_LS_KEY };
