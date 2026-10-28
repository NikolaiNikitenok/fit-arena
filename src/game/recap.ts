// Итоги месяца — как Spotify Wrapped: сколько сделано, лучший день, серия, любимое упражнение, тип героя.
// Считается на телефоне из дней тренировок (days) и журнала по упражнениям (log); место среди игроков даёт сервер.
import { EXERCISE_LABELS, type Exercise, repsEquivalent } from '../repCounter';
import type { Progress } from './progress';

export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
// «Итоги октября», «в октябре».
export const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
// «По пятницам».
const WEEKDAYS_ON = ['по воскресеньям', 'по понедельникам', 'по вторникам', 'по средам', 'по четвергам', 'по пятницам', 'по субботам'];
// Итоги прошлого месяца видны первую неделю нового.
export const RECAP_DAYS = 7;

export type RecapType = 'unstoppable' | 'squat' | 'pushup' | 'situp' | 'plank' | 'weekend' | 'burst' | 'steady' | 'starter';

export const RECAP_TYPES: Record<RecapType, { name: string; emoji: string; text: string }> = {
  unstoppable: { name: 'Неудержимый', emoji: '🔥', text: 'Тренировался почти каждый день. Такую силу воли не остановить.' },
  squat: { name: 'Машина приседаний', emoji: '🦵', text: 'Ноги — твоё оружие. Враги дрожат, когда ты встаёшь.' },
  pushup: { name: 'Железные руки', emoji: '💪', text: 'Отжимания — твоя стихия. Каждый удар отдаётся по всей арене.' },
  situp: { name: 'Стальной пресс', emoji: '🛡️', text: 'Центр силы — пресс. Тебя не согнуть.' },
  plank: { name: 'Несгибаемый', emoji: '🧱', text: 'Планка — это терпение. Ты стоишь, когда другие падают.' },
  weekend: { name: 'Воин выходных', emoji: '⚔️', text: 'Главные битвы — в субботу и воскресенье.' },
  burst: { name: 'Взрывной', emoji: '⚡', text: 'Редко, но мощно: твои дни силы запоминаются надолго.' },
  steady: { name: 'Стабильный', emoji: '🎯', text: 'Ровный темп без провалов — так и куются чемпионы.' },
  starter: { name: 'Новичок с огоньком', emoji: '🌱', text: 'Первые шаги сделаны. Дальше будет только интереснее.' },
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
const localDate = (t: number) => {
  const d = new Date(t);
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

const word = (n: number, forms: [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return forms[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2];
};
const num = (n: number) => n.toLocaleString('ru');
const times = (x: number) => (x >= 10 ? num(Math.round(x)) : x.toLocaleString('ru', { maximumFractionDigits: 1 }));

// Приседание поднимает тело примерно на 45 см; отжимание — около 45 кг (две трети веса) на 30 см.
const SQUAT_M = 0.45;
const PUSHUP_KG = 45;
const HEIGHTS: [number, string][] = [
  [27, 'девятиэтажку'],
  [330, 'Эйфелеву башню'],
  [462, 'Лахта-центр'],
  [540, 'Останкинскую башню'],
  [5642, 'Эльбрус'],
  [8849, 'Эверест'],
];
const WEIGHTS: [number, string, [string, string, string]][] = [
  [1.4, 'легковушку', ['легковушку', 'легковушки', 'легковушек']],
  [5, 'слона', ['слона', 'слона', 'слонов']],
  [20, 'трамвай', ['трамвай', 'трамвая', 'трамваев']],
  [41, 'Boeing 737', ['Boeing 737', 'Boeing 737', 'Boeing 737']],
  [150, 'синего кита', ['синего кита', 'синих кита', 'синих китов']],
];

/** Забавные сравнения: на какую высоту поднялся приседаниями, сколько тонн выжал отжиманиями. */
export function funFacts(amount: Partial<Record<Exercise, number>>): string[] {
  const out: string[] = [];
  const squats = amount.squat ?? 0;
  if (squats >= 60) {
    const m = squats * SQUAT_M;
    const [h, what] = [...HEIGHTS].reverse().find(([x]) => m >= x) ?? HEIGHTS[0];
    const k = m / h;
    out.push(k >= 1.5 ? `Приседаниями ты поднялся на ${num(Math.round(m))} м — это ${times(k)} раза на ${what}` : `Приседаниями ты поднялся на ${num(Math.round(m))} м — выше, чем на ${what}`);
  }
  const pushups = amount.pushup ?? 0;
  if (pushups >= 40) {
    const t = (pushups * PUSHUP_KG) / 1000;
    const [w, what, forms] = [...WEIGHTS].reverse().find(([x]) => t >= x) ?? WEIGHTS[0];
    const k = Math.floor(t / w);
    out.push(k >= 2 ? `Отжиманиями ты выжал ${times(t)} т — как ${k} ${word(k, forms)}` : `Отжиманиями ты выжал ${times(t)} т — больше, чем весит ${what}`);
  }
  const plank = amount.plank ?? 0;
  if (plank >= 180) out.push(`В планке ты простоял ${num(Math.round(plank / 60))} мин — это ${num(Math.max(1, Math.round(plank / 210)))} ${word(Math.max(1, Math.round(plank / 210)), ['песня', 'песни', 'песен'])} подряд`);
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
  if (ex === 'plank') return n >= 120 ? `${num(Math.round(n / 60))} мин планки` : `${num(n)} с планки`;
  const forms: Record<Exclude<Exercise, 'plank'>, [string, string, string]> = {
    squat: ['приседание', 'приседания', 'приседаний'],
    pushup: ['отжимание', 'отжимания', 'отжиманий'],
    situp: ['скручивание', 'скручивания', 'скручиваний'],
  };
  return `${num(n)} ${word(n, forms[ex])}`;
}

export const exerciseLabel = (ex: Exercise) => EXERCISE_LABELS[ex];
export { word as recapWord };
