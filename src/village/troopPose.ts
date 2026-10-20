// Какое движение показывать отряду в бою и с какого места: только по состоянию боя (чистые функции,
// чтобы бой выглядел одинаково и в живом набеге, и в повторе). Сам бой (shared/villageBattle.ts) об этом не знает.

export type TroopClip = 'run' | 'attack' | 'idle' | 'death' | 'cast';

export interface PoseInput {
  alive: boolean;
  // Сдвинулся с прошлого тика.
  moving: boolean;
  // Секунд боя с последнего удара (может быть очень большим — давно не бил).
  sinceHit: number;
  // Пауза между ударами отряда, с.
  every: number;
  // Длина движения удара и момент в нём, когда оружие попадает, с.
  attackDur: number;
  impact: number;
  // Целитель рядом с ранеными.
  healing?: boolean;
  // Сколько секунд назад погиб (для живых не важно).
  deadFor?: number;
  // Время для движений по кругу (бег, покой, лечение), с.
  clock: number;
}

export interface Pose {
  clip: TroopClip;
  // Секунд от начала движения.
  t: number;
}

/**
 * Удар подгоняем под бой: момент попадания движения совпадает с тиком удара. Если удары частые,
 * движение ускоряется, чтобы уложиться между ними; перед следующим ударом отряд замахивается заранее.
 */
export function troopPose(p: PoseInput): Pose {
  if (!p.alive) return { clip: 'death', t: Math.max(0, p.deadFor ?? 0) };
  if (p.healing) return { clip: 'cast', t: p.clock };
  if (p.moving) return { clip: 'run', t: p.clock };
  if (p.attackDur > 0 && p.every > 0) {
    const rate = Math.max(1, p.attackDur / p.every);
    const after = p.sinceHit * rate;
    // Доводка после удара.
    if (p.sinceHit >= 0 && after <= p.attackDur - p.impact) return { clip: 'attack', t: p.impact + after };
    // Замах перед следующим (если отряд всё ещё бьёт — он стоит на месте).
    const toNext = (p.every - (p.sinceHit % p.every)) * rate;
    if (p.sinceHit < p.every * 1.5 && toNext <= p.impact) return { clip: 'attack', t: p.impact - toNext };
  }
  return { clip: 'idle', t: p.clock };
}

/** Номер кадра из n заготовленных: по кругу или с остановкой на последнем. */
export function frameOf(t: number, dur: number, n: number, loop: boolean): number {
  if (n <= 1 || dur <= 0) return 0;
  if (loop) {
    const k = Math.floor(((t % dur) + dur) % dur / dur * n);
    return Math.min(n - 1, k);
  }
  return Math.max(0, Math.min(n - 1, Math.round((t / dur) * (n - 1))));
}

/** Поворот к точке (по клеткам: x — восток, y — юг); персонажи KayKit смотрят вдоль +Z. */
export const faceTo = (dx: number, dy: number) => Math.atan2(dx, dy);

/** Плавный поворот к цели кратчайшим путём. */
export function turnToward(cur: number, target: number, k: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
}
