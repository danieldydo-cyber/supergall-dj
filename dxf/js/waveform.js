/**
 * Canvas waveform renderer — rekordbox-ish dual-tone bars + playhead + cues + loop.
 */
export function drawWaveform(canvas, peaks, opts = {}) {
  const {
    progress = 0,
    cue = null,
    hotCues = [],
    loop = null,
    colorA = '#00e5ff',
    colorB = '#ff2d55',
    bg = '#0a0a0c',
    playedAlpha = 0.35,
  } = opts;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 2 || h < 2) return;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  if (!peaks || !peaks.length) {
    ctx.fillStyle = '#333';
    ctx.font = '12px system-ui,sans-serif';
    ctx.fillText('Load track…', 12, h / 2 + 4);
    return;
  }

  const mid = h / 2;
  const n = peaks.length;
  const barW = Math.max(1, w / n);
  const playX = progress * w;

  for (let i = 0; i < n; i++) {
    const x = (i / n) * w;
    const amp = peaks[i] * (h * 0.45);
    const played = x < playX;
    ctx.fillStyle = played ? colorA : colorB;
    ctx.globalAlpha = played ? 0.95 : 0.55;
    ctx.fillRect(x, mid - amp, Math.ceil(barW) - 0.5, amp);
    ctx.fillRect(x, mid, Math.ceil(barW) - 0.5, amp);
  }
  ctx.globalAlpha = 1;

  // dim played region overlay
  ctx.fillStyle = `rgba(0,0,0,${playedAlpha})`;
  // actually we already colored differently

  if (loop) {
    const x0 = (loop.startFrac ?? loop.start ?? 0) * w;
    const x1 = (loop.endFrac ?? loop.end ?? 0) * w;
    ctx.fillStyle = 'rgba(0,229,255,0.12)';
    ctx.fillRect(x0, 0, x1 - x0, h);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, 1, x1 - x0, h - 2);
  }

  if (cue != null) {
    const x = cue * w;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const cueColors = ['#ff2d55', '#ffcc00', '#00e676', '#7c4dff'];
  hotCues.forEach((frac, i) => {
    if (frac == null) return;
    const x = frac * w;
    ctx.fillStyle = cueColors[i % 4];
    ctx.fillRect(x - 1, 0, 2, h);
    ctx.fillRect(x - 4, 2, 8, 10);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(String(i + 1), x - 2, 10);
  });

  // playhead
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(playX, 0);
  ctx.lineTo(playX, h);
  ctx.stroke();
}
