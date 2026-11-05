// Утренняя зарядка: утром, при первом заходе за день, предлагаем начать день с движения.
// С камерой — короткая тренировка (приседания и отжимания), повторы идут в счёт как в программах.
// Без камеры — герой просто показывает движения по таймеру, в счёт ничего не идёт.
import { dayKey, type Progress } from '../game/progress';
import type { Baseline } from '../game/levels';
import type { QuickWorkout } from '../game/ProgramsScreen';
import { t } from '../i18n';
import type { RoutineStep } from './RoutineRun';

// Утро — с 5 до 12 по часам телефона.
export const MORNING_FROM = 5;
export const MORNING_TO = 12;

const KEY = 'fit-arena-morning-day';
let memDay: string | null = null;

function lastDay(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memDay;
  }
}

/** Пора ли предложить зарядку: включено в настройках (enabled), утро, сегодня ещё не предлагали и игрок ещё не тренировался. */
export function morningDue(p: Progress, now: number, enabled: boolean): boolean {
  const h = new Date(now).getHours();
  if (!enabled || h < MORNING_FROM || h >= MORNING_TO) return false;
  const today = dayKey(now);
  if (lastDay() === today) return false;
  const log = p.log?.[today]?.r;
  return !log || !Object.values(log).some((n) => (n ?? 0) > 0);
}

/** Сегодня уже предложили (согласился или нет): до завтра не спрашиваем. */
export function markMorning(now: number): void {
  memDay = dayKey(now);
  try {
    localStorage.setItem(KEY, memDay);
  } catch {
    // Хватит памяти до закрытия.
  }
}

/** Повторы зарядки: примерно треть обычного уровня игрока, но не мало и не много. */
export const morningReps = (b: Baseline) => ({
  squat: Math.min(20, Math.max(8, Math.round(b.squat * 0.4))),
  pushup: Math.min(15, Math.max(5, Math.round(b.pushup * 0.4))),
});

/** Зарядка с камерой: два коротких подхода, повторы в счёт. */
export function morningWorkout(b: Baseline): QuickWorkout {
  const r = morningReps(b);
  return {
    kind: 'morning',
    tag: t('Утренняя зарядка'),
    title: t('Бодрое начало дня'),
    sets: [
      { exercise: 'squat', target: r.squat, rest: 30 },
      { exercise: 'pushup', target: r.pushup, rest: 0 },
    ],
  };
}

/** Зарядка без камеры: лёгкая разминка и показ упражнений. Ничего не считается. */
export function morningDemo(b: Baseline): RoutineStep[] {
  const r = morningReps(b);
  return [
    { move: 'circles', title: t('Круги руками'), tip: t('Прямые руки, большие круги вперёд. Плечи свободны.'), seconds: 15 },
    { move: 'twist', title: t('Повороты корпуса'), tip: t('Руки в стороны, поворачивай плечи. Стопы не двигаются.'), seconds: 15 },
    { move: 'knees', title: t('Колени вверх'), tip: t('Шагай на месте, поднимая колени к поясу.'), seconds: 15 },
    { exercise: 'squat', title: t('{0} приседаний', { 0: r.squat }), tip: t('Спина прямая, пятки на полу, садись до параллели бёдер с полом.'), seconds: 40 },
    { exercise: 'pushup', title: t('{0} отжиманий', { 0: r.pushup }), tip: t('Тело — ровная линия. Тяжело — отжимайся с колен.'), seconds: 40 },
    { move: 'jacks', title: t('Прыжки звёздочкой'), tip: t('Руки вверх, ноги врозь — и обратно. Мягко на носки.'), seconds: 15 },
  ];
}
