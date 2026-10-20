// Честная игра: пределы, быстрее которых человек упражнение не сделает. Камера считает повторы
// на телефоне, поэтому сервер не видит само движение — он проверяет темп и общее количество.
// Нарушение темпа не ломает игру честному игроку: лишние удары просто не засчитываются,
// а подозрительное записывается (server/guard.ts).
import { isRepExercise, type Exercise, type RepExercise } from '../src/repCounter';

// Самый короткий промежуток между повторами при долгом темпе. Отжимания и приседания — 400 мс
// (как у счётчика камеры), пресс медленнее: подъём корпуса быстрее чем за полсекунды не сделать.
export const REP_MIN_MS: Record<RepExercise, number> = { pushup: 400, squat: 400, situp: 550 };
// Небольшой запас на рывок и на то, что сеть приносит удары пачкой.
export const PACE_BURST = 3;

export const repMinMs = (e: Exercise | string | undefined): number => (isRepExercise(e) ? REP_MIN_MS[e] : REP_MIN_MS.pushup);

/** Сколько повторов можно успеть за elapsedMs при этом темпе (с запасом на рывок). */
export const paceLimit = (elapsedMs: number, minMs: number, burst = PACE_BURST): number => Math.floor(Math.max(0, elapsedMs) / minMs) + burst;

/**
 * Удары идут как по метроному: человек так не может, а скрипт — может.
 * Нужно не меньше 20 промежутков, разброс меньше 8 мс.
 */
export function robotic(intervals: number[]): boolean {
  if (intervals.length < 20) return false;
  const xs = intervals.slice(-40);
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  return sd < 8;
}
