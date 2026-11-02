// Какие мышцы проработаны: подходы из истории зала раскладываются по мышцам (основная — целиком,
// помогающие — частью) и превращаются в яркость на карте тела.
import { gymExercise, type Muscle } from './catalog';
import type { GymSession } from './gym';

// Участки карты тела (src/gym/bodyMap.ts) для каждой мышцы каталога.
export const MAP_SLUGS: Record<Exclude<Muscle, 'cardio'>, string[]> = {
  chest: ['chest'],
  back: ['upperBack', 'lowerBack', 'trapezius', 'rotatorCuff'],
  shoulders: ['deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  legs: ['quadriceps', 'hamstring', 'adductors'],
  glutes: ['gluteal'],
  abs: ['abs', 'obliques'],
  calves: ['calves', 'tibialis'],
  forearms: ['forearm'],
};

// Помощники основной мышцы: жим грудью нагружает и трицепс с плечами, тяга — бицепс.
const HELPERS: Partial<Record<Muscle, [Muscle, number][]>> = {
  chest: [
    ['triceps', 0.5],
    ['shoulders', 0.4],
  ],
  back: [
    ['biceps', 0.5],
    ['forearms', 0.3],
  ],
  shoulders: [['triceps', 0.3]],
  legs: [
    ['glutes', 0.5],
    ['calves', 0.2],
  ],
  glutes: [['legs', 0.5]],
  triceps: [['chest', 0.2]],
  biceps: [['forearms', 0.3]],
};

// Столько подходов на мышцу за неделю — полная яркость (10 рабочих подходов — обычная недельная норма).
export const FULL_SETS = 10;

export type MuscleLoad = Partial<Record<Muscle, number>>;

/** Подходы по мышцам: основная мышца упражнения целиком, помощники частью. */
export function loadOf(sessions: Pick<GymSession, 'items'>[]): MuscleLoad {
  const load: MuscleLoad = {};
  const add = (m: Muscle, n: number) => (load[m] = (load[m] ?? 0) + n);
  for (const s of sessions)
    for (const it of s.items) {
      const ex = gymExercise(it.ex);
      const n = it.sets.length;
      if (!n) continue;
      add(ex.muscle, n);
      for (const [m, k] of HELPERS[ex.muscle] ?? []) add(m, n * k);
    }
  return load;
}

/** Нагрузка за последние 7 дней. */
export const weekLoad = (history: GymSession[], now: number): MuscleLoad => loadOf(history.filter((s) => s.start > now - 7 * 86400_000));

/** Яркость участков карты 0..1. */
export function slugLevels(load: MuscleLoad, full = FULL_SETS): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [m, slugs] of Object.entries(MAP_SLUGS) as [Exclude<Muscle, 'cardio'>, string[]][]) {
    const v = Math.min(1, (load[m] ?? 0) / full);
    for (const s of slugs) out[s] = Math.max(out[s] ?? 0, v);
  }
  return out;
}

/** Мышцы, которые за неделю почти не работали: подсказка, что добавить. */
export const restingMuscles = (load: MuscleLoad): Muscle[] =>
  (Object.keys(MAP_SLUGS) as Muscle[]).filter((m) => (load[m] ?? 0) < 2);
