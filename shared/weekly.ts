// «Твоя сила растёт»: раз в неделю — сколько повторов за прошлую неделю и насколько больше, чем месяц назад.
// Игра держит первые недели, а видимый рост силы — месяцы. Считается из дней тренировок (YYYY-MM-DD → повторы).

const DAY = 86_400_000;
const keyOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const sum = (days: Record<string, number>, end: string, n: number) => {
  const e = Date.parse(`${end}T00:00:00Z`);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.max(0, Number(days[keyOf(e - i * DAY)]) || 0);
  return s;
};

export interface WeekSummary {
  // Повторы за 7 дней до сегодняшнего (не включая сегодня).
  week: number;
  // С чем сравниваем: те же 7 дней четыре недели назад, а если тогда не тренировался — прошлая неделя.
  before: number;
  vs: 'month' | 'week' | null;
  // На сколько процентов больше (меньше — отрицательное); null — сравнить не с чем.
  pct: number | null;
}

export function weekSummary(days: Record<string, number> | undefined, today: string): WeekSummary {
  const d = days ?? {};
  const t = Date.parse(`${today}T00:00:00Z`);
  const week = sum(d, keyOf(t - DAY), 7);
  const month = sum(d, keyOf(t - 29 * DAY), 7);
  const prev = sum(d, keyOf(t - 8 * DAY), 7);
  const [before, vs] = month > 0 ? [month, 'month' as const] : prev > 0 ? [prev, 'week' as const] : [0, null];
  return { week, before, vs, pct: before > 0 ? Math.round(((week - before) / before) * 100) : null };
}

/** Ключ недели (понедельник) для «показали один раз». */
export function weekKey(today: string): string {
  const t = Date.parse(`${today}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return keyOf(t - dow * DAY);
}
