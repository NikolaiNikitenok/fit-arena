// Ноты фоновой музыки: темы миров как чистые функции «шаг → ноты». Звучание — в audio.ts.

export type Theme = 'calm' | 'fantasy' | 'space' | 'zombie' | 'castle' | 'arena' | 'tavern';
export type Voice = 'pluck' | 'bell' | 'pad' | 'arp' | 'bass' | 'pulse' | 'kick' | 'snare' | 'hat' | 'tom';

export interface NoteEvent {
  voice: Voice;
  midi: number;
  // Длительность в шагах (шаг — шестнадцатая).
  len: number;
  // Громкость 0..1.
  vel: number;
}

export const SCALES = {
  majorPenta: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
} as const;

export const STEPS_PER_BAR = 16;

export const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Нота ступени лада: ступени за пределами лада уходят в соседние октавы (и вниз тоже). */
export function scaleNote(scale: readonly number[], root: number, degree: number): number {
  const n = scale.length;
  return root + Math.floor(degree / n) * 12 + scale[((degree % n) + n) % n];
}

/** Длина шестнадцатой в секундах. */
export const stepSeconds = (bpm: number): number => 60 / bpm / 4;

interface ThemeDef {
  bpm: number;
  scale: readonly number[];
  root: number;
  // Ступени аккордов по тактам, по кругу.
  chords: number[];
  // Множитель общей громкости музыки.
  volume: number;
  // Ноты шага s (0..15) такта bar; at(d) — нота ступени d от корня аккорда.
  pattern: (s: number, bar: number, at: (d: number) => number) => NoteEvent[];
}

const ev = (voice: Voice, midi: number, len: number, vel: number): NoteEvent => ({ voice, midi, len, vel });
const chord = (voice: Voice, at: (d: number) => number, degrees: number[], len: number, vel: number) => degrees.map((d) => ev(voice, at(d), len, vel));

export const THEMES: Record<Theme, ThemeDef> = {
  // Дом героя и клан: медленные колокольчики над мягким пэдом.
  calm: {
    bpm: 72,
    scale: SCALES.majorPenta,
    root: 60,
    chords: [0, -2, 3, 1],
    volume: 0.9,
    pattern: (s, bar, at) => [
      ...(s === 0 ? [...chord('pad', at, [-5, -3, -1], 16, 0.5), ev('pluck', at(-5), 8, 0.3)] : []),
      ...(s % 6 === 0 && s < 16 ? [ev('bell', at(5 + ((bar * 3 + s / 6) % 4)), 6, 0.3)] : []),
    ],
  },
  // Королевство: лютня перебирает пентатонику восьмыми.
  fantasy: {
    bpm: 96,
    scale: SCALES.majorPenta,
    root: 62,
    chords: [0, -1, -2, 1],
    volume: 1,
    pattern: (s, bar, at) => [
      ...(s === 0 ? chord('pad', at, [-5, -3, -1], 16, 0.4) : []),
      ...(s % 2 === 0 ? [ev('pluck', at([0, 2, 4, 5, 7, 5, 4, 2][s / 2]), 3, s === 0 ? 0.5 : 0.38)] : []),
      ...(bar % 2 === 1 && (s === 4 || s === 12) ? [ev('bell', at(s === 4 ? 7 : 6), 6, 0.22)] : []),
    ],
  },
  // Космос: синтезаторное арпеджио шестнадцатыми и воздушный пэд.
  space: {
    bpm: 104,
    scale: SCALES.dorian,
    root: 57,
    chords: [0, 3, 5, 4],
    volume: 0.85,
    pattern: (s, bar, at) => [
      ...(s === 0 ? chord('pad', at, [0, 2, 4, 6], 16, 0.38) : []),
      ev('arp', at([0, 4, 7, 9, 11, 9, 7, 4][s % 8] + (bar % 2 && s >= 8 ? 2 : 0)), 1, s % 4 === 0 ? 0.32 : 0.22),
      ...(s === 0 || s === 6 || s === 10 ? [ev('bass', at(-7), 3, 0.42)] : []),
    ],
  },
  // Зомби-город: низкий пульс, редкие тревожные звоны.
  zombie: {
    bpm: 80,
    scale: SCALES.harmonicMinor,
    root: 52,
    chords: [0, 0, 5, 4],
    volume: 0.95,
    pattern: (s, bar, at) => [
      ...(s === 0 ? chord('pad', at, [0, 2], 16, 0.3) : []),
      ...(s % 2 === 0 ? [ev('pulse', at(-7), 1, s % 8 === 0 ? 0.5 : 0.32)] : []),
      ...(s === 0 || s === 8 ? [ev('kick', 36, 2, 0.4)] : []),
      ...(s === 4 && bar % 2 === 0 ? [ev('bell', at(9), 8, 0.2)] : []),
      ...(s === 12 && bar % 4 === 3 ? [ev('bell', at(8), 4, 0.2)] : []),
    ],
  },
  // Замок и боссы: тревожные барабаны и остинато баса.
  castle: {
    bpm: 112,
    scale: SCALES.harmonicMinor,
    root: 50,
    chords: [0, 0, 5, 4],
    volume: 0.9,
    pattern: (s, bar, at) => [
      ...(s === 0 ? chord('pad', at, [0, 2, 4], 16, 0.32) : []),
      ...(s % 2 === 0 ? [ev('bass', at(-7 + [0, 0, 0, 1, 0, 0, 2, 1][s / 2]), 1, 0.4)] : []),
      ...([0, 6, 8, 14].includes(s) ? [ev('kick', 36, 2, 0.5)] : []),
      ...(s === 4 || s === 12 ? [ev('snare', 38, 2, 0.3)] : []),
      ...(s % 2 === 0 ? [ev('hat', 42, 1, 0.12)] : []),
      ...(bar % 2 === 1 && s >= 13 ? [ev('tom', 50 - (s - 13) * 3, 1, 0.38)] : []),
    ],
  },
  // Таверна в деревне: весёлая плясовая — бас «умпа», лютня перебирает мелодию, бубен.
  tavern: {
    bpm: 132,
    scale: SCALES.majorPenta,
    root: 62,
    chords: [0, 3, 0, 4],
    volume: 0.75,
    pattern: (s, bar, at) => [
      ...(s % 4 === 0 ? [ev('bass', at(-7), 2, 0.4)] : []),
      ...(s % 4 === 2 ? chord('pluck', at, [-3, -1], 1, 0.18) : []),
      ...(s % 2 === 0 ? [ev('pluck', at([4, 5, 7, 5, 4, 2, 4, 0][(s / 2 + bar * 3) % 8] + (bar % 4 === 3 && s >= 8 ? 2 : 0)), 2, s % 8 === 0 ? 0.42 : 0.3)] : []),
      ...(s % 4 === 2 ? [ev('hat', 42, 1, 0.12)] : []),
      ...(bar % 2 === 1 && s === 14 ? [ev('bell', at(9), 2, 0.18)] : []),
    ],
  },
  // Дуэль: ровная бочка, хлопки и бас восьмыми.
  arena: {
    bpm: 124,
    scale: SCALES.minor,
    root: 45,
    chords: [0, 0, 5, 6],
    volume: 0.85,
    pattern: (s, bar, at) => [
      ...(s % 4 === 0 ? [ev('kick', 36, 2, 0.55)] : []),
      ...(s === 4 || s === 12 ? [ev('snare', 38, 2, 0.32)] : []),
      ...(s % 4 === 2 ? [ev('hat', 42, 1, 0.2)] : []),
      ...(s % 2 === 0 ? [ev('bass', at(s % 8 === 6 ? 7 : 0), 1, 0.36)] : []),
      ...(bar % 4 === 3 && s >= 13 ? [ev('tom', 52 - (s - 13) * 4, 1, 0.4)] : []),
    ],
  },
};

/** Ноты шага step темы theme; тема повторяется по кругу аккордов. */
export function themeStep(theme: Theme, step: number): NoteEvent[] {
  const def = THEMES[theme];
  const bar = Math.floor(step / STEPS_PER_BAR);
  const root = def.chords[bar % def.chords.length];
  return def.pattern(step % STEPS_PER_BAR, bar, (d) => scaleNote(def.scale, def.root, root + d));
}

/** Тема миссии: финал и боссы — барабаны замка, иначе музыка своего мира. */
export const missionTheme = (world: number, boss: boolean): Theme => (world >= 3 || boss ? 'castle' : worldTheme(world));

/** Тема мира на карте (0 — Королевство, 1 — Космос, 2 — Зомби, 3 — Замок). */
export const worldTheme = (world: number): Theme => (['fantasy', 'space', 'zombie', 'castle'] as const)[Math.max(0, Math.min(3, world))];
