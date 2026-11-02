// Цель дня в повторах по ответам знакомства-чата (src/sport/IntroChat.tsx).
const LEVEL_K = [0.6, 0.8, 1, 1.3];
const MINUTES_REPS = [30, 60, 100];

/** Цель дня в повторах по ответам: время задаёт объём, уровень его подправляет. */
export const dayGoalFor = (level: number, minutes: number): number =>
  Math.max(20, Math.round((MINUTES_REPS[minutes] ?? 60) * (LEVEL_K[level] ?? 1) / 5) * 5);
