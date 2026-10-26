// Живые инструменты для музыки: короткие записи нот из банка FluidR3 GM (Frank Wen,
// CC BY 3.0, через midi-js-soundfonts). Лежат в public/music/<инструмент>/<нота>.mp3 —
// по четыре ноты на октаву (до, ми-бемоль, соль-бемоль, ля), остальные получаются
// небольшим сдвигом высоты. Каждый инструмент грузится, только когда его просит тема.

export type Instrument =
  | 'orchestral_harp'
  | 'pizzicato_strings'
  | 'string_ensemble_1'
  | 'french_horn'
  | 'flute'
  | 'timpani'
  | 'acoustic_guitar_nylon'
  | 'glockenspiel'
  | 'accordion'
  | 'trumpet';

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const range = (lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if ([0, 3, 6, 9].includes(m % 12)) out.push(m);
  return out;
};
// midi: C2 = 36, C3 = 48, C4 = 60.
const NOTES: Record<Instrument, number[]> = {
  orchestral_harp: range(48, 84),
  pizzicato_strings: range(36, 72),
  string_ensemble_1: range(36, 72),
  french_horn: range(48, 72),
  flute: range(60, 84),
  timpani: range(36, 48),
  acoustic_guitar_nylon: range(36, 72),
  glockenspiel: range(72, 96),
  accordion: range(48, 72),
  trumpet: range(48, 72),
};

const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const url = (inst: Instrument, m: number) => `${import.meta.env.BASE_URL}music/${inst}/${noteName(m)}.mp3`;

type Bank = Map<number, AudioBuffer>;
const banks = new Map<Instrument, Bank>();
const loading = new Map<Instrument, Promise<void>>();

/** Загрузить инструмент (один раз). Пока грузится — играть нечем, музыка берёт синтезатор. */
export function loadInstrument(c: AudioContext, inst: Instrument): Promise<void> {
  const ready = loading.get(inst);
  if (ready) return ready;
  const p = Promise.all(
    NOTES[inst].map(async (m) => {
      const r = await fetch(url(inst, m));
      if (!r.ok) throw new Error(`${inst} ${m}: ${r.status}`);
      const buf = await c.decodeAudioData(await r.arrayBuffer());
      return [m, buf] as const;
    }),
  ).then(
    (list) => void banks.set(inst, new Map(list)),
    // Не загрузилось (нет сети) — попробуем при следующей теме.
    () => void loading.delete(inst),
  );
  loading.set(inst, p);
  return p;
}

export const hasInstrument = (inst: Instrument): boolean => banks.has(inst);

/**
 * Сыграть ноту инструментом. dur — сколько держать (сек), дальше мягкое затухание.
 * Возвращает false, если инструмент ещё не загружен.
 */
export function playSample(c: AudioContext, inst: Instrument, midi: number, t: number, dur: number, vol: number, out: AudioNode, opts: { attack?: number; release?: number } = {}): boolean {
  const bank = banks.get(inst);
  if (!bank) return false;
  let best = -1;
  for (const m of bank.keys()) if (best < 0 || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  const buf = bank.get(best);
  if (!buf) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 2 ** ((midi - best) / 12);
  const g = c.createGain();
  const attack = opts.attack ?? 0.005;
  const release = opts.release ?? 0.25;
  const end = Math.min(t + dur, t + buf.duration / src.playbackRate.value - release);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, Math.max(t + attack, end));
  g.gain.linearRampToValueAtTime(0, Math.max(t + attack, end) + release);
  src.connect(g).connect(out);
  src.start(t);
  src.stop(Math.max(t + attack, end) + release + 0.05);
  return true;
}
