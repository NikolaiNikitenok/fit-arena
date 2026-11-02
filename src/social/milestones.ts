// Вехи для автопостов (src/social/autoPost.ts): серия тренировок из списка и каждый пятый уровень героя.

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
export const LEVEL_STEP = 5;

export type Seen = { streak?: number; level?: number };

/** Какие вехи только что взяты (больше уже показанных). */
export function milestones(seen: Seen, streakDays: number, level: number): { streak?: number; level?: number } {
  const out: { streak?: number; level?: number } = {};
  const m = [...STREAK_MILESTONES].reverse().find((x) => streakDays >= x);
  if (m && m > (seen.streak ?? 0)) out.streak = m;
  const l = Math.floor(level / LEVEL_STEP) * LEVEL_STEP;
  if (l >= LEVEL_STEP && l > (seen.level ?? 0)) out.level = l;
  return out;
}
