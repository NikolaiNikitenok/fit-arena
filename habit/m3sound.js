// Звуки «Самоцветов»: мягкий синтез WebAudio (колокольчики и маримба с лёгким эхом), без файлов.
// Выключаются в настройках («Звуки в играх»).
import { SET } from './settings.js';

let ctx = null, bus = null;
function ac() {
  if (!SET.sound) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Общая цепочка: тише, без резких верхов, с мягким «залом».
      const master = ctx.createGain();
      master.gain.value = 0.22;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.3;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      bus = ctx.createGain();
      bus.connect(lp).connect(comp).connect(master).connect(ctx.destination);
      const verb = ctx.createConvolver();
      verb.buffer = impulse(ctx, 1.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      bus.connect(verb).connect(wet).connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
function impulse(c, sec) {
  const len = Math.floor(c.sampleRate * sec), buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}
/** Разбудить звук на первом касании (iOS разрешает только так). */
export const unlock = () => ac();

/** Колокольчик: основной тон + тихие обертоны, мягкая атака, долгое затухание. */
function bell(freq, { at = 0, dur = 0.9, vol = 0.4, partials = [[2, 0.18], [3.01, 0.06]] } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  for (const [mul, v] of [[1, 1], ...partials]) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mul;
    const d = dur / Math.sqrt(mul);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}
/** Маримба: короткий деревянный тон. */
const marimba = (f, o = {}) => bell(f, { dur: 0.45, partials: [[4, 0.12], [9.2, 0.03]], ...o });
/** Мягкий «бульк»: тон, слегка уходящий вниз. */
function bloop(freq, { at = 0, vol = 0.35, dur = 0.22, to = 0.6 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// Мажорная пентатоника: любые сочетания звучат приятно. Каждая волна каскада — на ступень выше.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1567.98, 1760];
const note = (i) => SCALE[Math.max(0, Math.min(SCALE.length - 1, i))];
export const sfx = {
  pop(combo = 1, n = 3) {
    marimba(note(combo - 1), { vol: 0.42 });
    if (n > 3) marimba(note(combo + 1), { at: 0.06, vol: 0.22 });
    if (n > 5) marimba(note(combo + 3), { at: 0.12, vol: 0.16 });
  },
  swap() { bloop(660, { vol: 0.12, dur: 0.12, to: 1.25 }); },
  nope() { bloop(330, { vol: 0.16, dur: 0.18, to: 0.8 }); bloop(294, { at: 0.09, vol: 0.12, dur: 0.18, to: 0.8 }); },
  beam() { [0, 2, 4, 5].forEach((s, i) => bell(note(s) * 1, { at: i * 0.035, dur: 0.5, vol: 0.14 })); },
  boom() { bloop(160, { vol: 0.5, dur: 0.5, to: 0.45 }); bell(note(0) / 2, { at: 0.02, dur: 0.9, vol: 0.18, partials: [[2, 0.1]] }); },
  prism() { [0, 2, 4, 5, 7, 9].forEach((s, i) => bell(note(s), { at: i * 0.055, dur: 0.8, vol: 0.13 })); },
  born() { bell(note(5), { dur: 1.1, vol: 0.18 }); bell(note(7), { at: 0.08, dur: 1.1, vol: 0.14 }); },
  shard() { bell(note(9) * 1.5, { dur: 0.35, vol: 0.06, partials: [] }); },
  win() { [0, 2, 4, 5, 7].forEach((s, i) => bell(note(s), { at: i * 0.12, dur: 1.2, vol: 0.24 })); bell(note(9), { at: 0.66, dur: 1.8, vol: 0.18 }); },
  star(i) { bell(note(4 + i * 2), { dur: 1.2, vol: 0.2 }); },
  lose() { [4, 2, 0].forEach((s, i) => marimba(note(s) / 2, { at: i * 0.18, vol: 0.25 })); },
};
