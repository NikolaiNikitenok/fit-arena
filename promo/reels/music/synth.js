// Библиотека фоновой музыки для рилсов: 8 треков разного настроения, синтез в OfflineAudioContext браузера.
// Голоса те же, что в музыке игры (src/music.ts, src/audio.ts). Запуск страницы: make.mjs рендерит каждый трек в WAV.
/* global OfflineAudioContext */
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};
const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const scaleNote = (sc, root, deg) => root + Math.floor(deg / sc.length) * 12 + sc[((deg % sc.length) + sc.length) % sc.length];

let noiseBuf;
function tone(c, freq, t, dur, o) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol ?? 0.2), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
  let node = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.lp[0], t);
    f.frequency.exponentialRampToValueAtTime(o.lp[1], t + dur);
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(o.out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
function noise(c, t, dur, vol, type, freq, out, q = 1) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}
function pad(c, freq, t, dur, vol, out, cutoff = 900) {
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.8, dur / 3));
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
  f.connect(g).connect(out);
  for (const d of [-7, 7]) {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = d;
    osc.connect(f);
    osc.start(t);
    osc.stop(t + dur + 0.7);
  }
}
function voice(c, e, t, step, out) {
  const f = midiToFreq(e.midi);
  const len = e.len * step;
  const v = e.vel;
  switch (e.voice) {
    case 'pluck':
      tone(c, f, t, Math.min(1.4, len + 0.5), { type: 'triangle', vol: v * 0.5, out });
      tone(c, f, t, 0.35, { type: 'sawtooth', vol: v * 0.18, lp: [3200, 500], out });
      break;
    case 'bell':
      tone(c, f, t, 1.6, { vol: v * 0.4, out });
      tone(c, f * 2.76, t, 0.6, { vol: v * 0.08, out });
      break;
    case 'pad':
      pad(c, f, t, len, v * 0.12, out, e.cutoff);
      break;
    case 'arp':
      tone(c, f, t, 0.2, { type: 'sawtooth', vol: v * 0.3, lp: [2400, 700], out });
      break;
    case 'lead':
      tone(c, f, t, len + 0.1, { type: 'square', vol: v * 0.16, lp: [2600, 900], attack: 0.02, out });
      tone(c, f, t, len + 0.1, { type: 'sawtooth', vol: v * 0.1, detune: 8, lp: [2000, 700], attack: 0.02, out });
      break;
    case 'bass':
      tone(c, f, t, len + 0.08, { type: 'triangle', vol: v * 0.7, out });
      tone(c, f, t, len, { type: 'square', vol: v * 0.12, lp: [700, 200], out });
      break;
    case 'sub808':
      tone(c, f * 1.5, t, len + 0.3, { vol: v * 0.9, glide: f, out });
      break;
    case 'pulse':
      tone(c, f, t, 0.18, { type: 'square', vol: v * 0.3, lp: [520, 160], out });
      break;
    case 'kick':
      tone(c, 140, t, 0.28, { vol: v * 0.9, glide: 42, out });
      break;
    case 'snare':
      noise(c, t, 0.14, v * 0.5, 'bandpass', 1800, out);
      tone(c, 190, t, 0.08, { type: 'triangle', vol: v * 0.3, out });
      break;
    case 'clap':
      for (const d of [0, 0.012, 0.024]) noise(c, t + d, 0.12, v * 0.35, 'bandpass', 1300, out, 2);
      break;
    case 'hat':
      noise(c, t, 0.04, v * 0.4, 'highpass', 7000, out);
      break;
    case 'open':
      noise(c, t, 0.25, v * 0.3, 'highpass', 6000, out);
      break;
    case 'tom':
      tone(c, f * 2, t, 0.3, { vol: v * 0.7, glide: f * 1.2, out });
      break;
    case 'boom':
      tone(c, 70, t, 1.2, { vol: v * 0.9, glide: 30, out });
      noise(c, t, 0.6, v * 0.25, 'lowpass', 400, out);
      break;
  }
}
const ev = (voice, midi, len, vel, extra) => ({ voice, midi, len, vel, ...extra });

// Треки: темп, лад, тоника, аккорды по тактам (ступени), и что звучит на каждой шестнадцатой.
// at(k) — нота аккорда текущего такта (k-я ступень от аккорда), bar — номер такта, s — шестнадцатая в такте (0–15).
const TRACKS = {
  energy: {
    bpm: 124, scale: 'minor', root: 45, chords: [0, 0, 5, 6, 3, 3, 5, 6],
    step: (s, bar, at) => [
      ...(s === 0 ? [0, 2, 4].map((k) => ev('pad', at(k) + 12, 16, 0.5)) : []),
      ...(bar > 0 && s % 4 === 0 ? [ev('kick', 36, 2, 0.75)] : []),
      ...(bar > 0 && (s === 4 || s === 12) ? [ev('snare', 38, 2, 0.45)] : []),
      ...(s % 2 === 1 ? [ev('hat', 42, 1, 0.22)] : []),
      ...(s % 2 === 0 ? [ev('bass', at(s % 8 === 6 ? 7 : 0) - 12, 1, 0.5)] : []),
      ...(bar > 0 && s % 2 === 0 ? [ev('arp', at([0, 2, 4, 7, 9, 7, 4, 2][(s / 2) % 8]) + 24, 1, 0.22)] : []),
      ...(bar % 4 === 3 && s >= 12 ? [ev('tom', 52 - (s - 12) * 3, 1, 0.5)] : []),
    ],
  },
  epic: {
    bpm: 92, scale: 'harmonicMinor', root: 38, chords: [0, 0, 5, 5, 3, 3, 4, 4],
    step: (s, bar, at) => [
      ...(s === 0 ? [0, 2, 4].map((k) => ev('pad', at(k) + 12, 16, 0.7, { cutoff: 1200 })) : []),
      ...(s === 0 && bar % 2 === 0 ? [ev('boom', 30, 4, 0.8)] : []),
      ...([0, 3, 6, 10, 12].includes(s) && bar > 0 ? [ev('tom', at(0) + 12, 1, 0.45)] : []),
      ...(s === 8 && bar > 0 ? [ev('snare', 38, 2, 0.5)] : []),
      ...(s % 4 === 0 ? [ev('bass', at(0) - 12, 4, 0.55)] : []),
      ...(bar > 1 && s % 8 === 0 ? [ev('bell', at([4, 2, 0, 2][(bar * 2 + s / 8) % 4]) + 24, 8, 0.4)] : []),
      ...(bar > 1 && s % 2 === 0 ? [ev('arp', at([0, 4, 2, 4][(s / 2) % 4]) + 24, 1, 0.12)] : []),
    ],
  },
  hype: {
    bpm: 140, scale: 'minor', root: 41, chords: [0, 0, 5, 5, 3, 3, 6, 4],
    step: (s, bar, at) => [
      ...(s === 0 ? [0, 2, 4].map((k) => ev('pad', at(k) + 12, 16, 0.35, { cutoff: 700 })) : []),
      ...([0, 7, 10].includes(s) ? [ev('kick', 36, 2, 0.85)] : []),
      ...([0, 7, 10].includes(s) ? [ev('sub808', at(0) - 12, 3, 0.55)] : []),
      ...(s === 8 ? [ev('clap', 39, 2, 0.6)] : []),
      ...(s % 2 === 0 || (bar % 2 === 1 && s >= 12) ? [ev('hat', 42, 1, s % 4 === 0 ? 0.3 : 0.18)] : []),
      ...(bar > 0 && [0, 3, 6, 8, 11, 14].includes(s) ? [ev('pluck', at([4, 2, 4, 7, 4, 2][[0, 3, 6, 8, 11, 14].indexOf(s)]) + 24, 1, 0.25)] : []),
    ],
  },
  light: {
    bpm: 112, scale: 'major', root: 48, chords: [0, 0, 4, 4, 5, 5, 3, 4],
    step: (s, bar, at) => [
      ...(s === 0 ? [0, 2, 4].map((k) => ev('pad', at(k) + 12, 16, 0.35, { cutoff: 1400 })) : []),
      ...(s % 8 === 0 ? [ev('kick', 36, 2, 0.6)] : []),
      ...(s === 4 || s === 12 ? [ev('clap', 39, 2, 0.35)] : []),
      ...(s % 4 === 2 ? [ev('open', 46, 1, 0.18)] : []),
      ...([0, 6, 8, 14].includes(s) ? [ev('bass', at(s === 14 ? 4 : 0) - 12, 2, 0.45)] : []),
      ...(bar > 0 && s % 2 === 0 ? [ev('pluck', at([0, 2, 4, 2, 7, 4, 2, 4][(s / 2) % 8]) + 24, 1, 0.3)] : []),
      ...(bar > 1 && s === 0 ? [ev('bell', at(4) + 36, 8, 0.2)] : []),
    ],
  },
  tense: {
    bpm: 100, scale: 'phrygian', root: 40, chords: [0, 0, 1, 1, 0, 0, 6, 1],
    step: (s, bar, at) => [
      ...(s === 0 ? [0, 2, 4].map((k) => ev('pad', at(k) + 12, 16, 0.45, { cutoff: 600 })) : []),
      ...(s % 2 === 0 ? [ev('pulse', at(0), 1, 0.35 + (bar % 4) * 0.08)] : []),
      ...(bar > 0 && s % 4 === 0 ? [ev('kick', 36, 2, 0.7)] : []),
      ...(bar > 1 && s === 8 ? [ev('snare', 38, 2, 0.4)] : []),
      ...(bar > 1 && s % 2 === 1 ? [ev('hat', 42, 1, 0.15)] : []),
      ...(s === 0 && bar % 4 === 0 ? [ev('boom', 30, 4, 0.6)] : []),
      ...(bar > 2 && s % 8 === 0 ? [ev('lead', at([0, 1, 0, -1][(bar + s / 8) % 4]) + 24, 7, 0.4)] : []),
    ],
  },
  funky: {
    bpm: 116, scale: 'dorian', root: 43, chords: [0, 0, 3, 3, 0, 0, 4, 3],
    step: (s, bar, at) => [
      ...(s === 0 ? [0, 2, 4, 6].map((k) => ev('pad', at(k) + 12, 16, 0.3, { cutoff: 1100 })) : []),
      ...([0, 6, 10].includes(s) ? [ev('kick', 36, 2, 0.75)] : []),
      ...(s === 4 || s === 12 ? [ev('snare', 38, 2, 0.5)] : []),
      ...(s % 2 === 0 ? [ev('hat', 42, 1, 0.2)] : []),
      ...([0, 3, 6, 7, 10, 13].includes(s) ? [ev('bass', at([0, 0, 7, 6, 4, 2][[0, 3, 6, 7, 10, 13].indexOf(s)]) - 12, 1, 0.55)] : []),
      ...(bar > 0 && [2, 5, 11].includes(s) ? [ev('pluck', at([2, 4, 6][[2, 5, 11].indexOf(s)]) + 24, 1, 0.28)] : []),
    ],
  },
  chill: {
    bpm: 88, scale: 'major', root: 45, chords: [0, 0, 5, 5, 3, 3, 4, 4],
    step: (s, bar, at) => [
      ...(s === 0 ? [0, 2, 4, 6].map((k) => ev('pad', at(k) + 12, 16, 0.4, { cutoff: 800 })) : []),
      ...([0, 10].includes(s) ? [ev('kick', 36, 2, 0.5)] : []),
      ...(s === 8 ? [ev('clap', 39, 2, 0.25)] : []),
      ...(s % 4 === 2 ? [ev('hat', 42, 1, 0.14)] : []),
      ...(s % 8 === 0 ? [ev('bass', at(0) - 12, 6, 0.4)] : []),
      ...(bar > 0 && [0, 3, 6, 10].includes(s) ? [ev('bell', at([4, 2, 6, 4][[0, 3, 6, 10].indexOf(s)]) + 24, 4, 0.18)] : []),
    ],
  },
  anthem: {
    bpm: 130, scale: 'mixolydian', root: 43, chords: [0, 0, 6, 6, 3, 3, 4, 4],
    step: (s, bar, at) => [
      ...(s === 0 ? [0, 2, 4].map((k) => ev('pad', at(k) + 12, 16, 0.55, { cutoff: 1300 })) : []),
      ...(s % 4 === 0 ? [ev('kick', 36, 2, 0.8)] : []),
      ...(s === 4 || s === 12 ? [ev('clap', 39, 2, 0.5)] : []),
      ...(s % 4 === 2 ? [ev('open', 46, 1, 0.2)] : []),
      ...(s % 2 === 0 ? [ev('bass', at(0) - 12, 1, 0.5)] : []),
      ...(bar > 0 && s % 2 === 0 ? [ev('arp', at([0, 2, 4, 2][(s / 2) % 4]) + 24, 1, 0.18)] : []),
      ...(bar > 1 && s % 4 === 0 ? [ev('lead', at([4, 4, 5, 4, 2, 2, 4, 0][(bar % 2) * 4 + s / 4]) + 24, 3, 0.45)] : []),
      ...(bar % 4 === 3 && s >= 12 ? [ev('tom', 52 - (s - 12) * 3, 1, 0.5)] : []),
    ],
  },
};

/** Рендер трека в 16-битный стерео WAV (base64). Громкость выравнивает ffmpeg (make.mjs). */
window.render = async (id, sec) => {
  const T = TRACKS[id];
  const sr = 44100;
  const c = new OfflineAudioContext(2, Math.ceil(sec * sr), sr);
  noiseBuf = c.createBuffer(1, sr, sr);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const comp = c.createDynamicsCompressor();
  comp.connect(c.destination);
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, 0);
  out.gain.exponentialRampToValueAtTime(0.9, 0.3);
  out.connect(comp);
  const step = 60 / T.bpm / 4;
  const sc = SCALES[T.scale];
  for (let i = 0; i < Math.floor(sec / step); i++) {
    const s = i % 16;
    const bar = Math.floor(i / 16);
    const at = (k) => scaleNote(sc, T.root, T.chords[bar % T.chords.length] + k);
    for (const e of T.step(s, bar, at)) voice(c, e, i * step, step, out);
  }
  const buf = await c.startRendering();
  const n = buf.length;
  const dv = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => [...s].forEach((ch, k) => dv.setUint8(o + k, ch.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  const bytes = new Uint8Array(dv.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
window.TRACK_IDS = Object.keys(TRACKS);
