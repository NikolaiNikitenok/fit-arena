// Ноты фоновой музыки: темы миров как чистые функции «шаг → ноты». Звучание — в audio.ts.

export type Theme = 'calm' | 'fantasy' | 'space' | 'zombie' | 'castle' | 'arena' | 'tavern' | 'village' | 'battle';
// Синтезатор: pluck … tom. Живые инструменты (записи нот, src/samples.ts): harp … trumpet.
export type Voice =
  | 'pluck' | 'bell' | 'pad' | 'arp' | 'bass' | 'pulse' | 'kick' | 'snare' | 'hat' | 'tom'
  | 'harp' | 'pizz' | 'strings' | 'horn' | 'flute' | 'timp' | 'guitar' | 'glock' | 'accordion' | 'trumpet';

export interface NoteEvent {
  voice: Voice;
  midi: number;
  // Длительность в шагах (шаг — шестнадцатая).
  len: number;
  // Громкость 0..1.
  vel: number;
}

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
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
  // Ноты шага s (0..15) такта bar; at(d) — нота ступени d от корня аккорда, key(d) — от тоники.
  pattern: (s: number, bar: number, at: (d: number) => number, key: (d: number) => number) => NoteEvent[];
}

const ev = (voice: Voice, midi: number, len: number, vel: number): NoteEvent => ({ voice, midi, len, vel });
const chord = (voice: Voice, at: (d: number) => number, degrees: number[], len: number, vel: number) => degrees.map((d) => ev(voice, at(d), len, vel));

// Мелодия восьмыми: в такте 8 клеток, число — ступень лада от тоники, null — тянуть
// предыдущую ноту, R — пауза.
const R = 'r';
type Cell = number | null | typeof R;
function tune(bars: Cell[][], voice: Voice, vel: number, s: number, bar: number, key: (d: number) => number, shift = 0): NoteEvent[] {
  if (s % 2) return [];
  const cells = bars[bar % bars.length];
  const v = cells[s / 2];
  if (v === null || v === R) return [];
  let len = 2;
  for (let i = s / 2 + 1; i < 8 && cells[i] === null; i++) len += 2;
  return [ev(voice, key(v) + shift, len, s === 0 ? Math.min(1, vel * 1.1) : vel)];
}

// Деревня: светлая походная мелодия; первые 8 тактов — флейта, следующие 8 — валторна.
const VILLAGE_TUNE: Cell[][] = [
  [2, null, 2, 3, 4, null, 2, null],
  [1, null, 1, 2, 3, null, 1, null],
  [0, null, 2, 4, 5, null, 4, null],
  [3, null, 5, null, 7, null, 5, null],
  [4, null, 4, 5, 4, 3, 2, null],
  [3, null, 5, null, 3, null, 0, null],
  [1, 2, 3, 4, 6, null, 4, null],
  [7, null, null, null, 4, null, R, R],
];
// Бой: героическая тема медных.
const BATTLE_TUNE: Cell[][] = [
  [0, null, null, 2, 4, null, null, null],
  [5, null, 4, null, 2, null, null, null],
  [6, null, null, 4, 1, null, null, null],
  [0, null, null, null, R, R, 4, 6],
  [7, null, 7, 8, 9, null, 7, null],
  [8, null, 7, null, 5, null, 3, null],
  [4, null, 5, null, 6, null, 8, null],
  [7, null, null, null, null, null, R, R],
];
// Таверна: плясовая на аккордеоне.
const TAVERN_TUNE: Cell[][] = [
  [4, 2, 4, 7, 4, 2, 0, 2],
  [1, 3, 4, 6, 4, 3, 1, null],
  [2, 4, 7, null, 9, 7, 4, null],
  [6, null, 4, 3, 1, null, R, R],
  [3, 5, 7, 5, 3, 5, 7, 8],
  [9, 7, 4, 2, 4, null, 2, null],
  [1, null, 3, null, 4, null, 6, null],
  [7, null, 4, null, 0, null, R, R],
];
// Королевство: флейта над арфой.
const FANTASY_TUNE: Cell[][] = [
  [R, R, R, R, 4, null, 5, null],
  [7, null, null, 5, 4, null, null, null],
  [R, R, R, R, 2, null, 4, null],
  [5, null, 4, null, 2, null, null, null],
];

export const THEMES: Record<Theme, ThemeDef> = {
  // Дом героя и клан: арфа перебирает аккорд, струнные тянут, изредка — колокольчики.
  calm: {
    bpm: 76,
    scale: SCALES.majorPenta,
    root: 60,
    chords: [0, -2, 3, 1],
    volume: 0.95,
    pattern: (s, bar, at) => [
      ...(s === 0 ? chord('strings', at, [-5, -3, -1], 16, 0.32) : []),
      ...(s % 2 === 0 ? [ev('harp', at([0, 2, 4, 5, 7, 5, 4, 2][s / 2] - 5), 4, s === 0 ? 0.42 : 0.3)] : []),
      ...(bar % 2 === 1 && s === 8 ? [ev('glock', at(10), 6, 0.16)] : []),
    ],
  },
  // Королевство: арфа восьмыми, струнные и флейта.
  fantasy: {
    bpm: 96,
    scale: SCALES.majorPenta,
    root: 62,
    chords: [0, -1, -2, 1],
    volume: 1,
    pattern: (s, bar, at, key) => [
      ...(s === 0 ? chord('strings', at, [-5, -3, -1], 16, 0.3) : []),
      ...(s % 2 === 0 ? [ev('harp', at([0, 2, 4, 5, 7, 5, 4, 2][s / 2] - 5), 3, s === 0 ? 0.42 : 0.32)] : []),
      ...(s === 0 || s === 8 ? [ev('pizz', at(-10), 4, 0.4)] : []),
      ...tune(FANTASY_TUNE, 'flute', 0.4, s, bar, key, 12),
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
  // Зомби-город: низкий пульс, тревожные струнные, редкие звоны.
  zombie: {
    bpm: 80,
    scale: SCALES.harmonicMinor,
    root: 52,
    chords: [0, 0, 5, 4],
    volume: 0.95,
    pattern: (s, bar, at) => [
      ...(s === 0 ? chord('strings', at, [0, 2], 16, 0.28) : []),
      ...(s % 2 === 0 ? [ev('pulse', at(-7), 1, s % 8 === 0 ? 0.5 : 0.32)] : []),
      ...(s === 0 || s === 8 ? [ev('timp', at(-7), 4, 0.45)] : []),
      ...(s === 4 && bar % 2 === 0 ? [ev('bell', at(9), 8, 0.2)] : []),
      ...(s === 12 && bar % 4 === 3 ? [ev('bell', at(8), 4, 0.2)] : []),
    ],
  },
  // Замок и боссы: литавры, низкие струнные остинато и валторны.
  castle: {
    bpm: 112,
    scale: SCALES.harmonicMinor,
    root: 50,
    chords: [0, 0, 5, 4],
    volume: 0.95,
    pattern: (s, bar, at) => [
      ...(s === 0 ? chord('strings', at, [0, 2, 4], 16, 0.26) : []),
      ...(s % 2 === 0 ? [ev('pizz', at(-7 + [0, 0, 0, 1, 0, 0, 2, 1][s / 2]), 2, 0.45)] : []),
      ...([0, 6, 8, 14].includes(s) ? [ev('timp', at(-7), 3, 0.55)] : []),
      ...(s === 4 || s === 12 ? [ev('snare', 38, 2, 0.26)] : []),
      ...(bar % 2 === 1 && s === 0 ? chord('horn', at, [0, 2], 8, 0.36) : []),
      ...(bar % 2 === 1 && s >= 13 ? [ev('timp', at(-7) + (s - 13) * 2, 1, 0.4)] : []),
    ],
  },
  // Таверна: аккордеон ведёт плясовую, гитара бьёт аккорды, щипковый бас «умпа», бубен.
  tavern: {
    bpm: 132,
    scale: SCALES.major,
    root: 62,
    chords: [0, 4, 0, 4, 3, 0, 4, 0],
    volume: 0.85,
    pattern: (s, bar, at, key) => [
      ...(s % 8 === 0 ? [ev('pizz', at(-7), 2, 0.55)] : []),
      ...(s % 8 === 4 ? [ev('pizz', at(-3), 2, 0.45)] : []),
      ...(s % 4 === 2 ? chord('guitar', at, [-7, -5, -3], 2, 0.22) : []),
      ...tune(TAVERN_TUNE, 'accordion', 0.42, s, bar, key),
      ...(s % 4 === 2 ? [ev('hat', 42, 1, 0.14)] : []),
    ],
  },
  // Дуэль: ровная бочка, хлопки, бас и короткие удары медных.
  arena: {
    bpm: 124,
    scale: SCALES.minor,
    root: 45,
    chords: [0, 0, 5, 6],
    volume: 0.9,
    pattern: (s, bar, at) => [
      ...(s % 4 === 0 ? [ev('kick', 36, 2, 0.55)] : []),
      ...(s === 4 || s === 12 ? [ev('snare', 38, 2, 0.32)] : []),
      ...(s % 4 === 2 ? [ev('hat', 42, 1, 0.2)] : []),
      ...(s % 2 === 0 ? [ev('pizz', at(s % 8 === 6 ? 7 : 0), 2, 0.42)] : []),
      ...((s === 0 || s === 3) && bar % 2 === 0 ? chord('trumpet', at, [7, 9], 2, 0.32) : []),
      ...(bar % 4 === 3 && s >= 13 ? [ev('timp', 40 + (s - 13) * 3, 1, 0.45)] : []),
    ],
  },
  // Своя деревня: светлый марш. Струнные держат аккорд, щипковый бас шагает, арфа
  // перебирает, мелодию ведёт флейта, потом валторна; колокольчики в начале фразы.
  village: {
    bpm: 100,
    scale: SCALES.major,
    root: 60,
    chords: [0, 4, 5, 3, 0, 3, 4, 0, 0, 4, 5, 3, 0, 3, 4, 0],
    volume: 1,
    pattern: (s, bar, at, key) => [
      ...(s === 0 ? chord('strings', at, [-7, -5, -3], 16, 0.24) : []),
      ...(s === 0 || s === 8 ? [ev('pizz', at(s === 0 ? -14 : -10), 4, 0.5)] : []),
      ...(s % 4 === 2 ? [ev('harp', at([-7, -5, -3, -5][s / 4 - 0.5]), 3, 0.24)] : []),
      ...tune(VILLAGE_TUNE, bar % 16 < 8 ? 'flute' : 'horn', bar % 16 < 8 ? 0.4 : 0.42, s, bar, key, bar % 16 < 8 ? 12 : 0),
      ...(bar % 8 === 0 && s === 0 ? [ev('glock', key(14), 6, 0.2), ev('glock', key(16), 6, 0.14)] : []),
      ...(s === 12 && bar % 4 === 3 ? [ev('snare', 38, 1, 0.12), ev('snare', 38, 1, 0.1)] : []),
    ],
  },
  // Набег: литавры и малый барабан, струнные режут остинато, медные трубят тему.
  battle: {
    bpm: 126,
    scale: SCALES.minor,
    root: 57,
    chords: [0, 5, 6, 0, 0, 3, 4, 0],
    volume: 1,
    pattern: (s, bar, at, key) => [
      ...(s === 0 || s === 8 ? [ev('timp', at(-7), 3, 0.6)] : []),
      ...(s === 4 || s === 12 ? [ev('snare', 38, 2, 0.34)] : []),
      ...(s % 2 === 1 && s > 12 ? [ev('snare', 38, 1, 0.18)] : []),
      ...(s % 2 === 0 ? [ev('pizz', at(s % 4 === 0 ? -7 : 0), 2, 0.42)] : []),
      ...(s === 0 ? chord('strings', at, [-7, -5, -3], 16, 0.22) : []),
      ...tune(BATTLE_TUNE, bar % 8 < 4 ? 'horn' : 'trumpet', 0.46, s, bar, key),
      ...(bar % 8 === 7 && s >= 12 ? [ev('timp', at(-7) + (s - 12), 1, 0.5)] : []),
    ],
  },
};

/** Ноты шага step темы theme; тема повторяется по кругу аккордов. */
export function themeStep(theme: Theme, step: number): NoteEvent[] {
  const def = THEMES[theme];
  const bar = Math.floor(step / STEPS_PER_BAR);
  const root = def.chords[bar % def.chords.length];
  return def.pattern(step % STEPS_PER_BAR, bar, (d) => scaleNote(def.scale, def.root, root + d), (d) => scaleNote(def.scale, def.root, d));
}

/** Тема миссии: финал и боссы — барабаны замка, иначе музыка своего мира. */
export const missionTheme = (world: number, boss: boolean): Theme => (world >= 3 || boss ? 'castle' : worldTheme(world));

/** Тема мира на карте (0 — Королевство, 1 — Космос, 2 — Зомби, 3 — Замок). */
export const worldTheme = (world: number): Theme => (['fantasy', 'space', 'zombie', 'castle'] as const)[Math.max(0, Math.min(3, world))];
