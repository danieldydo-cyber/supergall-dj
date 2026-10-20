/**
 * Simple BPM detection via energy peaks + manual override helpers.
 * Accuracy is approximate — fine for grids / sync approximation.
 */
export function detectBPM(audioBuffer) {
  const sr = audioBuffer.sampleRate;
  const channel = audioBuffer.getChannelData(0);
  const offlineLen = Math.min(channel.length, sr * 90); // first 90s
  const data = channel.subarray(0, offlineLen);

  // Downsample energy envelope ~100Hz
  const hop = Math.floor(sr / 100);
  const energies = [];
  for (let i = 0; i + hop < data.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < hop; j++) sum += Math.abs(data[i + j]);
    energies.push(sum / hop);
  }

  // Autocorrelation of energy
  const minBpm = 70;
  const maxBpm = 180;
  const minLag = Math.floor((60 / maxBpm) * 100);
  const maxLag = Math.floor((60 / minBpm) * 100);

  let bestLag = minLag;
  let bestCorr = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < energies.length - lag; i++) {
      corr += energies[i] * energies[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  let bpm = 60 / (bestLag / 100);
  // Prefer common dance range, fold halves/doubles
  while (bpm < 80) bpm *= 2;
  while (bpm > 160) bpm /= 2;
  bpm = Math.round(bpm * 10) / 10;
  return bpm || 120;
}

export function beatDuration(bpm) {
  return 60 / (bpm || 120);
}

export function nearestBeat(timeSec, bpm, offset = 0) {
  const beat = beatDuration(bpm);
  return Math.round((timeSec - offset) / beat) * beat + offset;
}
