// Звуки и музыка без файлов: всё синтезируется WebAudio прямо в браузере.
import { useEffect, useRef } from 'react';
import { getSettings, subscribeSettings } from './settings';
import { midiToFreq, NoteEvent, stepSeconds, STEPS_PER_BAR, Theme, themeStep, THEMES, type Voice } from './music';
import { hasInstrument, type Instrument, loadInstrument, playSample } from './samples';
import { tg } from './telegram';

export type Sfx = 'tap' | 'rep' | 'hit' | 'combo' | 'hurt' | 'ouch' | 'roar' | 'ko' | 'win' | 'lose' | 'coin' | 'chest' | 'beep' | 'go' | 'levelup' | 'whoosh' | BattleSfx;
// Бой в деревне: удары отрядов, выстрелы башен, разрушения, умения героя. n — сколько таких событий сразу.
export type BattleSfx = 'sword' | 'slash' | 'bow' | 'smash' | 'blast' | 'heal' | 'shot' | 'cannon' | 'crumble' | 'wallbreak' | 'skill' | 'thunder' | 'hammer';
// Звуки боя повторяются реже: при толпе отрядов один звук на всех, только чуть громче.
const MIN_GAP: Partial<Record<Sfx, number>> = { sword: 0.11, slash: 0.15, bow: 0.12, smash: 0.2, blast: 0.12, heal: 1.2, shot: 0.14, cannon: 0.2, crumble: 0.25, wallbreak: 0.15, skill: 0.3, thunder: 0.3, hammer: 0.12 };

// Громкость музыки: тихий фон, чтобы были слышны повторы.
const MUSIC_VOLUME = 0.16;
const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let noiseBuf: AudioBuffer;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    // iOS 17+: звук смешивается с музыкой игрока и уважает беззвучный режим.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    const c = new Ctor();
    const comp = c.createDynamicsCompressor();
    comp.connect(c.destination);
    master = c.createGain();
    master.connect(comp);
    sfxBus = c.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    ctx = c;
  } catch {
    return null;
  }
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  attack?: number;
  // Частота к концу звука.
  glide?: number;
  // Фильтр нижних частот: от частоты к частоте за время звука.
  lp?: [number, number];
  detune?: number;
  out?: AudioNode;
}

/** Нота с огибающей: быстрая атака и экспоненциальное затухание за dur секунд. */
function tone(c: AudioContext, freq: number, t: number, dur: number, o: ToneOpts = {}): void {
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
  let node: AudioNode = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.lp[0], t);
    f.frequency.exponentialRampToValueAtTime(o.lp[1], t + dur);
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(o.out ?? sfxBus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Шум через фильтр: удары, шорохи, тарелки. */
function noise(c: AudioContext, t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, out: AudioNode = sfxBus, q = 1): void {
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

/** Пэд: два расстроенных «пилообразных» за мягким фильтром, медленно нарастает и гаснет. */
function pad(c: AudioContext, freq: number, t: number, dur: number, vol: number, out: AudioNode): void {
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
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

// Живые инструменты: голос темы → записи нот. Если записи не загрузились, играет синтезатор.
const SAMPLED: Partial<Record<Voice, { inst: Instrument; vol: number; attack?: number; release?: number; hold?: number; synth: Voice }>> = {
  harp: { inst: 'orchestral_harp', vol: 0.9, release: 0.6, hold: 1.4, synth: 'pluck' },
  pizz: { inst: 'pizzicato_strings', vol: 1, release: 0.25, hold: 0.6, synth: 'bass' },
  strings: { inst: 'string_ensemble_1', vol: 0.75, attack: 0.25, release: 0.7, synth: 'pad' },
  horn: { inst: 'french_horn', vol: 0.8, attack: 0.04, release: 0.35, synth: 'pad' },
  flute: { inst: 'flute', vol: 0.7, attack: 0.03, release: 0.25, synth: 'bell' },
  timp: { inst: 'timpani', vol: 1, release: 0.6, hold: 1.2, synth: 'tom' },
  guitar: { inst: 'acoustic_guitar_nylon', vol: 0.8, release: 0.3, hold: 0.5, synth: 'pluck' },
  glock: { inst: 'glockenspiel', vol: 0.6, release: 0.8, hold: 1.4, synth: 'bell' },
  accordion: { inst: 'accordion', vol: 0.6, attack: 0.02, release: 0.15, synth: 'pluck' },
  trumpet: { inst: 'trumpet', vol: 0.65, attack: 0.02, release: 0.2, synth: 'arp' },
};

/** Какие записи нужны теме: собираем голоса по всему кругу аккордов. */
export function themeInstruments(theme: Theme): Instrument[] {
  const out = new Set<Instrument>();
  const loop = THEMES[theme].chords.length * STEPS_PER_BAR;
  for (let st = 0; st < loop; st++) for (const e of themeStep(theme, st)) {
    const sm = SAMPLED[e.voice];
    if (sm) out.add(sm.inst);
  }
  return [...out];
}

/** Голос музыкальной темы. */
function voice(c: AudioContext, e: NoteEvent, t: number, step: number, out: AudioNode): void {
  const len = e.len * step;
  const sm = SAMPLED[e.voice];
  if (sm) {
    if (playSample(c, sm.inst, e.midi, t, Math.max(len, sm.hold ?? 0), e.vel * sm.vol, out, sm)) return;
    e = { ...e, voice: sm.synth };
  }
  const f = midiToFreq(e.midi);
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
      pad(c, f, t, len, v * 0.12, out);
      break;
    case 'arp':
      tone(c, f, t, 0.2, { type: 'sawtooth', vol: v * 0.3, lp: [2400, 700], out });
      break;
    case 'bass':
      tone(c, f, t, len + 0.08, { type: 'triangle', vol: v * 0.7, out });
      tone(c, f, t, len, { type: 'square', vol: v * 0.12, lp: [700, 200], out });
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
    case 'hat':
      noise(c, t, 0.04, v * 0.4, 'highpass', 7000, out);
      break;
    case 'tom':
      tone(c, f * 2, t, 0.3, { vol: v * 0.7, glide: f * 1.2, out });
      break;
  }
}

const lastPlayed: Partial<Record<Sfx, number>> = {};

/** Звуковой эффект; молчит, если звуки выключены в настройках. */
export function sfx(name: Sfx, n = 0): void {
  if (!getSettings().sound) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.005;
  // Один и тот же звук не чаще раза в 40 мс (звуки боя — реже), чтобы не было каши.
  if ((lastPlayed[name] ?? -1) > t - (MIN_GAP[name] ?? 0.04)) return;
  lastPlayed[name] = t;
  try {
    play(c, name, t, n);
  } catch {
    // Звук недоступен — не страшно.
  }
}

function play(c: AudioContext, name: Sfx, t: number, n: number): void {
  const notes = (freqs: number[], gap: number, dur: number, o: ToneOpts) => freqs.forEach((f, i) => tone(c, f, t + i * gap, dur, o));
  switch (name) {
    case 'tap':
      tone(c, 1400, t, 0.03, { vol: 0.035 });
      break;
    case 'whoosh': {
      // Облака съезжаются: мягкий шум ветра, фильтр плывёт вверх.
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.8;
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      src.connect(f).connect(g).connect(sfxBus);
      src.start(t, Math.random() * 0.5);
      src.stop(t + 0.75);
      break;
    }
    case 'rep':
      // Высота растёт с номером повтора, чтобы было слышно темп.
      tone(c, 520 + Math.min(12, n % 13) * 30, t, 0.22, { type: 'triangle', vol: 0.18, attack: 0.01 });
      break;
    case 'hit':
      tone(c, 150, t, 0.16, { vol: 0.45, glide: 50 });
      noise(c, t, 0.09, 0.35, 'lowpass', 1400);
      break;
    case 'ko':
      tone(c, 120, t, 0.6, { vol: 0.6, glide: 30 });
      noise(c, t, 0.5, 0.45, 'lowpass', 900);
      noise(c, t, 0.18, 0.2, 'highpass', 3000);
      break;
    case 'combo':
      notes([660, 880, 1320], 0.06, 0.16, { type: 'square', vol: 0.09, lp: [3000, 1200] });
      noise(c, t + 0.12, 0.2, 0.08, 'highpass', 6000);
      break;
    case 'hurt':
      // Враг охает: «пила» вниз через полосовой фильтр.
      tone(c, 260, t, 0.22, { type: 'sawtooth', vol: 0.14, glide: 110, lp: [1400, 500] });
      break;
    case 'ouch':
      tone(c, 90, t, 0.22, { vol: 0.4, glide: 45 });
      tone(c, 330, t, 0.3, { type: 'square', vol: 0.06, glide: 160, lp: [1200, 300] });
      break;
    case 'roar': {
      // Низкий рык: «пила» с дрожью частоты, шум и фильтр, который медленно закрывается.
      const osc = c.createOscillator();
      const lfo = c.createOscillator();
      const depth = c.createGain();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 1.2);
      lfo.frequency.value = 17;
      depth.gain.value = 9;
      lfo.connect(depth).connect(osc.frequency);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(700, t);
      f.frequency.exponentialRampToValueAtTime(220, t + 1.2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      osc.connect(f).connect(g).connect(sfxBus);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 1.35);
      lfo.stop(t + 1.35);
      noise(c, t, 1.1, 0.12, 'lowpass', 500);
      break;
    }
    case 'win':
      // Фанфары: до-ми-соль и долгое до сверху с квинтой.
      notes([523, 659, 784], 0.12, 0.2, { type: 'square', vol: 0.08, lp: [3500, 1500] });
      notes([523, 659, 784], 0.12, 0.25, { type: 'triangle', vol: 0.18 });
      tone(c, 1047, t + 0.36, 0.9, { type: 'square', vol: 0.08, lp: [4000, 900] });
      tone(c, 1047, t + 0.36, 1, { type: 'triangle', vol: 0.2 });
      tone(c, 784, t + 0.36, 1, { type: 'triangle', vol: 0.12 });
      tone(c, 262, t + 0.36, 1, { type: 'triangle', vol: 0.18 });
      break;
    case 'lose':
      // «Уа-уа-уа-уаа» вниз.
      [392, 370, 349].forEach((f, i) => tone(c, f, t + i * 0.25, 0.24, { type: 'sawtooth', vol: 0.1, lp: [1600, 500] }));
      tone(c, 330, t + 0.75, 0.8, { type: 'sawtooth', vol: 0.1, glide: 300, lp: [1400, 300] });
      break;
    case 'coin':
      tone(c, 988, t, 0.08, { type: 'square', vol: 0.07, lp: [5000, 3000] });
      tone(c, 1319, t + 0.07, 0.35, { type: 'square', vol: 0.07, lp: [5000, 2000] });
      tone(c, 1319, t + 0.07, 0.35, { vol: 0.12 });
      break;
    case 'chest':
      // Крышка и россыпь блёсток вверх по пентатонике.
      tone(c, 110, t, 0.12, { vol: 0.3, glide: 70 });
      [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637].forEach((f, i) => tone(c, f, t + 0.08 + i * 0.05, 0.4, { vol: 0.07 }));
      noise(c, t + 0.08, 0.6, 0.05, 'highpass', 8000);
      break;
    case 'beep':
      tone(c, 880, t, 0.12, { vol: 0.14 });
      break;
    case 'go':
      tone(c, 1320, t, 0.35, { vol: 0.16 });
      tone(c, 660, t, 0.35, { type: 'triangle', vol: 0.1 });
      break;
    case 'levelup':
      notes([523, 659, 784, 1047, 1319, 1568], 0.07, 0.25, { type: 'triangle', vol: 0.15 });
      notes([523, 659, 784, 1047, 1319, 1568], 0.07, 0.2, { type: 'square', vol: 0.04, lp: [3000, 1500] });
      noise(c, t + 0.4, 0.5, 0.05, 'highpass', 7000);
      break;
    default:
      playBattle(c, name, t, n);
  }
}

/** Громкость звука боя: один удар тихо, толпа — громче, но не больше чем вдвое. */
const crowd = (n: number) => Math.min(2, 0.75 + 0.35 * Math.log2(Math.max(1, n)));
// Немного разной высоты, чтобы одинаковые удары не звучали как пулемёт.
const vary = () => 1 + (Math.random() - 0.5) * 0.12;

function playBattle(c: AudioContext, name: BattleSfx, t: number, n: number): void {
  const v = crowd(n);
  const p = vary();
  const notes = (freqs: number[], gap: number, dur: number, o: ToneOpts) => freqs.forEach((f, i) => tone(c, f, t + i * gap, dur, o));
  switch (name) {
    case 'sword':
      // Звон клинка о дерево и камень: две высокие «квадратные» ноты и щелчок шума.
      noise(c, t, 0.05, 0.16 * v, 'highpass', 3500);
      tone(c, 1850 * p, t, 0.14, { type: 'square', vol: 0.025 * v, lp: [6000, 1500] });
      tone(c, 2730 * p, t + 0.004, 0.1, { type: 'square', vol: 0.015 * v, lp: [6000, 1800] });
      tone(c, 180 * p, t, 0.08, { vol: 0.16 * v, glide: 90 });
      break;
    case 'slash':
      // Герой: свист замаха и тяжёлый звонкий удар.
      noise(c, t, 0.12, 0.12 * v, 'bandpass', 1400 * p, sfxBus, 0.8);
      tone(c, 1320 * p, t + 0.07, 0.25, { type: 'square', vol: 0.035 * v, lp: [5000, 900] });
      tone(c, 1980 * p, t + 0.07, 0.18, { type: 'triangle', vol: 0.05 * v });
      tone(c, 130 * p, t + 0.07, 0.14, { vol: 0.3 * v, glide: 55 });
      break;
    case 'bow':
      // Тетива: короткий «твинь» вниз и шорох стрелы.
      tone(c, 330 * p, t, 0.12, { type: 'triangle', vol: 0.13 * v, glide: 190 });
      tone(c, 660 * p, t, 0.05, { type: 'sawtooth', vol: 0.02 * v, lp: [2500, 600] });
      noise(c, t + 0.03, 0.13, 0.05 * v, 'bandpass', 4200 * p, sfxBus, 2);
      break;
    case 'smash':
      // Великан: глухой удар дубиной и треск.
      tone(c, 75 * p, t, 0.3, { vol: 0.5 * v, glide: 32 });
      noise(c, t, 0.22, 0.28 * v, 'lowpass', 700);
      noise(c, t + 0.02, 0.08, 0.08 * v, 'bandpass', 2400);
      break;
    case 'blast':
      // Взрыв подрывника или снаряда мортиры.
      tone(c, 95 * p, t, 0.45, { vol: 0.45 * v, glide: 28 });
      noise(c, t, 0.5, 0.4 * v, 'lowpass', 900 * p);
      noise(c, t, 0.12, 0.12 * v, 'highpass', 2500);
      break;
    case 'heal':
      notes([880, 1175, 1568], 0.07, 0.4, { vol: 0.035 * v });
      break;
    case 'shot':
      // Выстрел башни лучников: сухой щелчок и свист.
      tone(c, 520 * p, t, 0.07, { type: 'triangle', vol: 0.07 * v, glide: 260 });
      noise(c, t, 0.1, 0.05 * v, 'bandpass', 3000 * p, sfxBus, 2);
      break;
    case 'cannon':
      tone(c, 120 * p, t, 0.2, { vol: 0.35 * v, glide: 45 });
      noise(c, t, 0.16, 0.2 * v, 'lowpass', 1200);
      break;
    case 'crumble':
      // Постройка рушится: долгий низкий грохот и осыпающиеся камни.
      tone(c, 60 * p, t, 0.7, { vol: 0.45 * v, glide: 30 });
      noise(c, t, 0.8, 0.35 * v, 'lowpass', 500);
      for (let i = 0; i < 5; i++) noise(c, t + 0.08 + i * 0.09 + Math.random() * 0.05, 0.07, 0.1 * v, 'bandpass', 900 + Math.random() * 1500, sfxBus, 3);
      break;
    case 'wallbreak':
      noise(c, t, 0.3, 0.25 * v, 'lowpass', 1100);
      tone(c, 110 * p, t, 0.2, { vol: 0.25 * v, glide: 50 });
      noise(c, t + 0.05, 0.06, 0.08 * v, 'bandpass', 1800, sfxBus, 3);
      break;
    case 'skill':
      // Умение героя: взлёт «пилы» через открывающийся фильтр и звон.
      tone(c, 220, t, 0.45, { type: 'sawtooth', vol: 0.12, glide: 660, lp: [600, 4000] });
      notes([659, 988, 1319], 0.06, 0.45, { type: 'triangle', vol: 0.09 });
      noise(c, t, 0.4, 0.08, 'highpass', 5000);
      break;
    case 'thunder':
      noise(c, t, 0.06, 0.4, 'highpass', 3000);
      tone(c, 70, t + 0.04, 1, { vol: 0.5, glide: 30 });
      noise(c, t + 0.04, 1.1, 0.4, 'lowpass', 400);
      break;
    case 'hammer':
      // Молоток строителя: короткий звонкий стук по дереву.
      tone(c, 900 * p, t, 0.06, { type: 'square', vol: 0.025, lp: [4000, 900] });
      tone(c, 240 * p, t, 0.07, { vol: 0.12, glide: 140 });
      noise(c, t, 0.03, 0.07, 'bandpass', 2600);
      break;
  }
}

/** Прежний сигнал повтора. */
export const repSound = (n: number): void => sfx('rep', n);

// --- Музыка ---

interface Track {
  theme: Theme;
  gain: GainNode;
  step: number;
  next: number;
  timer: number;
  // Записи инструментов загружены (или ждать надоело).
  ready: boolean;
}

let track: Track | null = null;
let wanted: Theme | null = null;

function startTrack(c: AudioContext, theme: Theme): void {
  const gain = c.createGain();
  const now = c.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(MUSIC_VOLUME * THEMES[theme].volume, now + 2);
  gain.connect(master);
  const t: Track = { theme, gain, step: 0, next: now + 0.1, timer: 0, ready: false };
  t.timer = window.setInterval(() => schedule(c, t), TICK_MS);
  track = t;
  // Ждём записи инструментов (не дольше 4 с), чтобы тема не начиналась синтезатором.
  const need = themeInstruments(theme);
  if (need.every(hasInstrument)) t.ready = true;
  else
    void Promise.race([Promise.all(need.map((i) => loadInstrument(c, i))), new Promise((r) => setTimeout(r, 4000))]).then(() => {
      t.ready = true;
    });
  schedule(c, t);
}

/** Планировщик с упреждением: ноты ставятся в очередь WebAudio чуть вперёд, таймер JS может дрожать. */
function schedule(c: AudioContext, t: Track): void {
  if (c.state !== 'running') return;
  if (!t.ready) {
    t.next = c.currentTime + 0.1;
    return;
  }
  const step = stepSeconds(THEMES[t.theme].bpm);
  // После паузы не наверстываем пропущенные ноты.
  if (t.next < c.currentTime - 0.2) t.next = c.currentTime + 0.05;
  while (t.next < c.currentTime + LOOKAHEAD_S) {
    try {
      for (const e of themeStep(t.theme, t.step)) voice(c, e, t.next, step, t.gain);
    } catch {
      // Пропускаем ноту, музыка идёт дальше.
    }
    t.step += 1;
    t.next += step;
  }
}

function stopTrack(fade: number): void {
  const t = track;
  if (!t || !ctx) return;
  track = null;
  clearInterval(t.timer);
  const now = ctx.currentTime;
  t.gain.gain.cancelScheduledValues(now);
  t.gain.gain.setValueAtTime(t.gain.gain.value, now);
  t.gain.gain.linearRampToValueAtTime(0, now + fade);
  setTimeout(() => t.gain.disconnect(), fade * 1000 + 3000);
}

let hidden = false;

/** Играет нужная тема, если музыка включена и приложение на экране. */
function syncMusic(): void {
  const c = ctx;
  if (!c || c.state !== 'running') return;
  const want = getSettings().music && !hidden ? wanted : null;
  if (track?.theme === want) return;
  stopTrack(want ? 1.2 : hidden ? 0.4 : 0.8);
  if (want) startTrack(c, want);
}

/** Сменить фоновую тему (null — тишина). Переход плавный. */
export function setMusic(theme: Theme | null): void {
  wanted = theme;
  syncMusic();
}

// Кто какую музыку просит: побеждает больший приоритет, при равном — последний.
const requests: { id: number; theme: Theme | null; prio: number }[] = [];
let seq = 0;
let pending = false;
const refresh = () => {
  if (pending) return;
  pending = true;
  // Смена темы в одном кадре (ушёл один экран, пришёл другой) — один переход.
  queueMicrotask(() => {
    pending = false;
    const top = requests.reduce<(typeof requests)[number] | null>((a, r) => (!a || r.prio > a.prio || (r.prio === a.prio && r.id > a.id) ? r : a), null);
    setMusic(top?.theme ?? null);
  });
};

/** Фоновая музыка, пока компонент на экране. */
export function useMusic(theme: Theme | null, prio = 0): void {
  useEffect(() => {
    const r = { id: ++seq, theme, prio };
    requests.push(r);
    refresh();
    return () => {
      requests.splice(requests.indexOf(r), 1);
      refresh();
    };
  }, [theme, prio]);
}

/** Вызывает fn(было, стало), когда значение меняется между отрисовками. */
export function useChange<T>(value: T, fn: (prev: T, next: T) => void): void {
  const prev = useRef(value);
  useEffect(() => {
    if (Object.is(prev.current, value)) return;
    const p = prev.current;
    prev.current = value;
    fn(p, value);
  });
}

function setHidden(h: boolean): void {
  hidden = h;
  const c = ctx;
  if (!c) return;
  if (h) {
    syncMusic();
    // Свёрнутое приложение не тратит батарею на звук.
    setTimeout(() => hidden && c.state === 'running' && c.suspend().catch(() => {}), 500);
  } else {
    c.resume().then(syncMusic, () => {});
  }
}

/** Включает звук по первому касанию (iOS и Telegram не дают играть без жеста) и следит за сворачиванием. */
export function initAudio(): void {
  const events = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
  const unlock = () => {
    const c = audio();
    if (!c) return;
    if (c.state !== 'running' && !hidden) {
      c.resume().then(syncMusic, () => {});
      try {
        // Пустой буфер внутри жеста окончательно «будит» звук на iOS.
        const b = c.createBufferSource();
        b.buffer = c.createBuffer(1, 1, 22050);
        b.connect(c.destination);
        b.start(0);
      } catch {
        // Не вышло — попробуем на следующем касании.
      }
    }
    if (c.state === 'running') events.forEach((e) => document.removeEventListener(e, unlock, true));
  };
  events.forEach((e) => document.addEventListener(e, unlock, true));
  // Тихий щелчок на кнопках.
  document.addEventListener(
    'pointerdown',
    (e) => {
      const b = (e.target as Element | null)?.closest?.('button, .switch');
      if (b && !(b as HTMLButtonElement).disabled) sfx('tap');
    },
    true,
  );
  document.addEventListener('visibilitychange', () => setHidden(document.hidden));
  tg?.onEvent?.('deactivated', () => setHidden(true));
  tg?.onEvent?.('activated', () => setHidden(document.hidden));
  subscribeSettings(syncMusic);
}

/** Свести тему в звук без проигрывания: для прослушки и проверки музыки (не в игре). */
export async function renderTheme(theme: Theme, seconds: number, rate = 44100): Promise<AudioBuffer> {
  const oc = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
  const c = oc as unknown as AudioContext;
  await Promise.all(themeInstruments(theme).map((i) => loadInstrument(c, i)));
  const g = oc.createGain();
  g.gain.value = MUSIC_VOLUME * THEMES[theme].volume * 2.5;
  g.connect(oc.destination);
  const step = stepSeconds(THEMES[theme].bpm);
  for (let st = 0, t = 0.05; t < seconds - 1.5; st++, t += step) for (const e of themeStep(theme, st)) voice(c, e, t, step, g);
  return oc.startRendering();
}
