// Итоги месяца — как Spotify Wrapped: сколько сделано, лучший день, серия, любимое упражнение, тип героя.
// Считается на телефоне из дней тренировок (days) и журнала по упражнениям (log); место среди игроков даёт сервер.
import { EXERCISE_LABELS, type Exercise, repsEquivalent } from '../repCounter';
import type { Progress } from './progress';
import { EN_MONTHS, forms, isEn, locale, t } from '../i18n';

export const MONTHS = isEn() ? EN_MONTHS : [t('январь'), t('февраль'), t('март'), t('апрель'), t('май'), t('июнь'), t('июль'), t('август'), t('сентябрь'), t('октябрь'), t('ноябрь'), t('декабрь')];
// «Итоги октября», «в октябре».
export const MONTHS_OF = isEn() ? EN_MONTHS : [t('января'), t('февраля'), t('марта'), t('апреля'), t('мая'), t('июня'), t('июля'), t('августа'), t('сентября'), t('октября'), t('ноября'), t('декабря')];
export const MONTHS_IN = isEn() ? EN_MONTHS : [t('январе'), t('феврале'), t('марте'), t('апреле'), t('мае'), t('июне'), t('июле'), t('августе'), t('сентябре'), t('октябре'), t('ноябре'), t('декабре')];
const WEEKDAYS = [t('воскресенье'), t('понедельник'), t('вторник'), t('среда'), t('четверг'), t('пятница'), t('суббота')];
// «По пятницам».
const WEEKDAYS_ON = [t('по воскресеньям'), t('по понедельникам'), t('по вторникам'), t('по средам'), t('по четвергам'), t('по пятницам'), t('по субботам')];
// Итоги прошлого месяца видны первую неделю нового.
export const RECAP_DAYS = 7;

export type RecapType = 'unstoppable' | 'squat' | 'pushup' | 'situp' | 'plank' | 'weekend' | 'burst' | 'steady' | 'starter';

export const RECAP_TYPES: Record<RecapType, { name: string; emoji: string; text: string }> = {
  unstoppable: { name: t('Неудержимый'), emoji: '🔥', text: t('Тренировался почти каждый день. Такую силу воли не остановить.') },
  squat: { name: t('Машина приседаний'), emoji: '🦵', text: t('Ноги — твоё оружие. Враги дрожат, когда ты встаёшь.') },
  pushup: { name: t('Железные руки'), emoji: '💪', text: t('Отжимания — твоя стихия. Каждый удар отдаётся по всей арене.') },
  situp: { name: t('Стальной пресс'), emoji: '🛡️', text: t('Центр силы — пресс. Тебя не согнуть.') },
  plank: { name: t('Несгибаемый'), emoji: '🧱', text: t('Планка — это терпение. Ты стоишь, когда другие падают.') },
  weekend: { name: t('Воин выходных'), emoji: '⚔️', text: t('Главные битвы — в субботу и воскресенье.') },
  burst: { name: t('Взрывной'), emoji: '⚡', text: t('Редко, но мощно: твои дни силы запоминаются надолго.') },
  steady: { name: t('Стабильный'), emoji: '🎯', text: t('Ровный темп без провалов — так и куются чемпионы.') },
  starter: { name: t('Новичок с огоньком'), emoji: '🌱', text: t('Первые шаги сделаны. Дальше будет только интереснее.') },
};

export interface Recap {
  month: string;
  // Номер месяца 0–11 и год.
  m: number;
  year: number;
  total: number;
  days: number;
  daysInMonth: number;
  // Повторы (у планки — секунды) по упражнениям, по убыванию вклада.
  byEx: { ex: Exercise; amount: number; share: number }[];
  bestDay: { date: string; reps: number; weekday: string } | null;
  favWeekday: string | null;
  streak: number;
  // Лучший подход месяца по упражнениям.
  best: Partial<Record<Exercise, number>>;
  // Повторы по дням месяца (индекс — число минус один) и день недели первого числа (0 — понедельник).
  grid: number[];
  firstWeekday: number;
  prevTotal: number;
  // Рост к прошлому месяцу в процентах; null — в прошлом месяце не тренировался.
  growth: number | null;
  type: RecapType;
  facts: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const monthKey = (year: number, m: number) => `${year}-${pad(m + 1)}`;
const daysIn = (year: number, m: number) => new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const shift = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return monthKey(d.getUTCFullYear(), d.getUTCMonth());
};

/** Местная дата YYYY-MM-DD. */
const localDate = (tm: number) => {
  const d = new Date(tm);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Месяц, итоги которого показать на главной: первую неделю — прошлый, если в нём были тренировки. */
export function recapMonth(p: Pick<Progress, 'days'>, now: number): string | null {
  const today = localDate(now);
  if (Number(today.slice(8)) > RECAP_DAYS) return null;
  const month = shift(today.slice(0, 7), -1);
  return Object.entries(p.days).some(([d, n]) => d.startsWith(month) && n > 0) ? month : null;
}

/** Прошедшие месяцы с тренировками, свежие первыми. */
export function recapMonths(p: Pick<Progress, 'days'>, now: number): string[] {
  const current = localDate(now).slice(0, 7);
  const set = new Set(
    Object.entries(p.days)
      .filter(([, n]) => n > 0)
      .map(([d]) => d.slice(0, 7))
      .filter((m) => m < current),
  );
  return [...set].sort().reverse();
}

const word = forms;
const num = (n: number) => n.toLocaleString(locale());
const times = (x: number) => (x >= 10 ? num(Math.round(x)) : x.toLocaleString(locale(), { maximumFractionDigits: 1 }));

// Приседание поднимает тело примерно на 45 см; отжимание — около 45 кг (две трети веса) на 30 см.
const SQUAT_M = 0.45;
const PUSHUP_KG = 45;
const HEIGHTS: [number, string][] = [
  [27, t('девятиэтажку')],
  [330, t('Эйфелеву башню')],
  [462, t('Лахта-центр')],
  [540, t('Останкинскую башню')],
  [5642, t('Эльбрус')],
  [8849, t('Эверест')],
];
const WEIGHTS: [number, string, [string, string, string]][] = [
  [1.4, t('легковушку'), [t('легковушку'), t('легковушки'), t('легковушек')]],
  [5, t('слона'), [t('слона'), t('слона'), t('слонов')]],
  [20, t('трамвай'), [t('трамвай'), t('трамвая'), t('трамваев')]],
  [41, 'Boeing 737', ['Boeing 737', 'Boeing 737', 'Boeing 737']],
  [150, t('синего кита'), [t('синего кита'), t('синих кита'), t('синих китов')]],
];

/** Забавные сравнения: на какую высоту поднялся приседаниями, сколько тонн выжал отжиманиями. */
export function funFacts(amount: Partial<Record<Exercise, number>>): string[] {
  const out: string[] = [];
  const squats = amount.squat ?? 0;
  if (squats >= 60) {
    const m = squats * SQUAT_M;
    const [h, what] = [...HEIGHTS].reverse().find(([x]) => m >= x) ?? HEIGHTS[0];
    const k = m / h;
    out.push(k >= 1.5 ? t('Приседаниями ты поднялся на {0} м — это {1} раза на {2}', { 0: num(Math.round(m)), 1: times(k), 2: what }) : t('Приседаниями ты поднялся на {0} м — выше, чем на {1}', { 0: num(Math.round(m)), 1: what }));
  }
  const pushups = amount.pushup ?? 0;
  if (pushups >= 40) {
    const tm = (pushups * PUSHUP_KG) / 1000;
    const [w, what, forms] = [...WEIGHTS].reverse().find(([x]) => tm >= x) ?? WEIGHTS[0];
    const k = Math.floor(tm / w);
    out.push(k >= 2 ? t('Отжиманиями ты выжал {0} т — как {1} {2}', { 0: times(tm), 1: k, 2: word(k, forms) }) : t('Отжиманиями ты выжал {0} т — больше, чем весит {1}', { 0: times(tm), 1: what }));
  }
  const plank = amount.plank ?? 0;
  if (plank >= 180) out.push(t('В планке ты простоял {0} мин — это {1} {2} подряд', { 0: num(Math.round(plank / 60)), 1: num(Math.max(1, Math.round(plank / 210))), 2: word(Math.max(1, Math.round(plank / 210)), [t('песня'), t('песни'), t('песен')]) }));
  return out;
}

export function monthRecap(p: Pick<Progress, 'days' | 'log'>, month: string): Recap {
  const [year, m1] = month.split('-').map(Number);
  const m = m1 - 1;
  const n = daysIn(year, m);
  const dates = Array.from({ length: n }, (_, i) => `${month}-${pad(i + 1)}`);
  const grid = dates.map((d) => Math.max(0, Math.floor(p.days[d] ?? 0)));
  const total = grid.reduce((s, x) => s + x, 0);
  const days = grid.filter((x) => x > 0).length;

  const amount: Partial<Record<Exercise, number>> = {};
  const best: Partial<Record<Exercise, number>> = {};
  for (const d of dates) {
    const day = p.log?.[d];
    if (!day) continue;
    for (const [ex, r] of Object.entries(day.r) as [Exercise, number][]) amount[ex] = (amount[ex] ?? 0) + r;
    for (const [ex, b] of Object.entries(day.b) as [Exercise, number][]) best[ex] = Math.max(best[ex] ?? 0, b);
  }
  const eq = (Object.entries(amount) as [Exercise, number][]).map(([ex, a]) => ({ ex, amount: a, eq: repsEquivalent(ex, a) }));
  const eqSum = eq.reduce((s, x) => s + x.eq, 0);
  const byEx = eq
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.eq - a.eq)
    .map(({ ex, amount: a, eq: e }) => ({ ex, amount: a, share: eqSum ? e / eqSum : 0 }));

  let bestI = -1;
  for (let i = 0; i < n; i++) if (grid[i] > 0 && (bestI < 0 || grid[i] > grid[bestI])) bestI = i;
  const bestDay = bestI < 0 ? null : { date: dates[bestI], reps: grid[bestI], weekday: WEEKDAYS[weekday(dates[bestI])] };
  const perWeekday = Array(7).fill(0);
  grid.forEach((r, i) => (perWeekday[weekday(dates[i])] += r));
  const top = perWeekday.indexOf(Math.max(...perWeekday));
  let streak = 0;
  let run = 0;
  for (const r of grid) streak = Math.max(streak, (run = r > 0 ? run + 1 : 0));

  const prev = shift(month, -1);
  const prevTotal = Object.entries(p.days).reduce((s, [d, r]) => (d.startsWith(prev) ? s + Math.max(0, r) : s), 0);
  const weekend = grid.reduce((s, r, i) => s + ([0, 6].includes(weekday(dates[i])) ? r : 0), 0);
  const lead = byEx[0];

  let type: RecapType = 'steady';
  if (days <= 3) type = 'starter';
  else if (days >= n * 0.65) type = 'unstoppable';
  else if (lead && lead.share >= 0.55) type = lead.ex;
  else if (total && weekend / total >= 0.6) type = 'weekend';
  else if (bestDay && days <= n / 4 && bestDay.reps >= (total / days) * 2) type = 'burst';

  return {
    month,
    m,
    year,
    total,
    days,
    daysInMonth: n,
    byEx,
    bestDay,
    favWeekday: total ? WEEKDAYS_ON[top] : null,
    streak,
    best,
    grid,
    firstWeekday: (weekday(dates[0]) + 6) % 7,
    prevTotal,
    growth: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    type,
    facts: funFacts(amount),
  };
}

/** Подпись упражнения с количеством: «412 приседаний», «6 мин планки». */
export function amountLabel(ex: Exercise, n: number): string {
  if (ex === 'plank') return n >= 120 ? t('{0} мин планки', { 0: num(Math.round(n / 60)) }) : t('{0} с планки', { 0: num(n) });
  const forms: Record<Exclude<Exercise, 'plank'>, [string, string, string]> = {
    squat: [t('приседание'), t('приседания'), t('приседаний')],
    pushup: [t('отжимание'), t('отжимания'), t('отжиманий')],
    situp: [t('скручивание'), t('скручивания'), t('скручиваний')],
  };
  return `${num(n)} ${word(n, forms[ex])}`;
}

export const exerciseLabel = (ex: Exercise) => EXERCISE_LABELS[ex];
export { word as recapWord };
