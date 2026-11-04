// Звуки «Самоцветов»: синтез WebAudio, без файлов. Выключаются в настройках («Звуки в играх»).
import { SET } from './settings.js';

let ctx = null, master = null;
function ac() {
  if (!SET.sound) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
/** Разбудить звук на первом касании (iOS разрешает только так). */
export const unlock = () => ac();

function tone(freq, { at = 0, dur = 0.18, type = 'sine', vol = 0.5, slide = 0, attack = 0.005 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise({ at = 0, dur = 0.3, vol = 0.4, from = 3000, to = 300, q = 1 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf;
  f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// Пентатоника: каждая следующая волна каскада звучит выше.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568, 1760];
export const sfx = {
  pop(combo = 1, n = 3) {
    const f = SCALE[Math.min(SCALE.length - 1, combo - 1)];
    tone(f, { dur: 0.16, type: 'triangle', vol: 0.45 });
    tone(f * 2, { dur: 0.1, vol: 0.12, at: 0.01 });
    if (n > 3) tone(f * 1.5, { dur: 0.14, type: 'triangle', vol: 0.25, at: 0.05 });
  },
  swap() { tone(420, { dur: 0.08, type: 'sine', vol: 0.18, slide: 1.4 }); },
  nope() { tone(180, { dur: 0.14, type: 'square', vol: 0.08, slide: 0.7 }); },
  beam() { noise({ dur: 0.35, vol: 0.35, from: 6000, to: 800, q: 0.8 }); tone(880, { dur: 0.25, type: 'sawtooth', vol: 0.06, slide: 0.5 }); },
  boom() { tone(140, { dur: 0.45, type: 'sine', vol: 0.8, slide: 0.35 }); noise({ dur: 0.4, vol: 0.4, from: 1200, to: 120, q: 0.6 }); },
  prism() { [0, 0.05, 0.1, 0.15, 0.2, 0.25].forEach((at, i) => tone(SCALE[i * 2 % SCALE.length] * 1.5, { at, dur: 0.22, vol: 0.2, type: 'triangle' })); },
  born() { tone(1046.5, { dur: 0.3, vol: 0.2 }); tone(1568, { at: 0.06, dur: 0.35, vol: 0.18 }); tone(2093, { at: 0.12, dur: 0.4, vol: 0.12 }); },
  shard() { noise({ dur: 0.12, vol: 0.18, from: 8000, to: 3000, q: 2 }); },
  win() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, { at: i * 0.11, dur: 0.4, vol: 0.35, type: 'triangle' })); tone(2093, { at: 0.6, dur: 0.8, vol: 0.15 }); },
  star(i) { tone(SCALE[3 + i * 2], { dur: 0.35, vol: 0.3, type: 'triangle' }); tone(SCALE[3 + i * 2] * 2, { dur: 0.25, vol: 0.1, at: 0.02 }); },
  lose() { [392, 349.23, 293.66].forEach((f, i) => tone(f, { at: i * 0.16, dur: 0.35, vol: 0.25, type: 'triangle' })); },
};
