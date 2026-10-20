// Клановые войны: на выходных клан бьётся с кланом, побеждает тот, кто сделает больше повторов.
//
// Расписание по Москве (то же окно, что у рейда, войны и рейд идут параллельно):
//   пятница 19:00 — пары составлены, запись на эти выходные закрыта;
//   суббота 00:00 — понедельник 00:00 — сама война;
//   понедельник 00:00 — итог, награды, клану опыт.
//
// Очки: каждый повтор участника в любом режиме (приключение, дуэли, тренер, программы — через
// clanReps; удары по рейд-боссу — по одному очку за удар). От одного участника в день засчитываем
// не больше WAR_REPS_PER_DAY, как и для опыта клана.
//
// Счёт клана: сумма очков N лучших участников, где N — состав меньшего клана на момент пары.
// Так большой клан не задавит маленький числом, а маленькому не хватит одного силача:
// у каждой стороны в зачёт идут одинаковое число людей. Состав замораживается в пятницу —
// вступившие позже очков не приносят (иначе перед войной переманивали бы сильных).
//
// Нечётное число кланов: оставшийся клан бьётся с «Дружиной Князя Дивана» — призрачным кланом
// того же размера. Её цель на участника — 90% от среднего результата клана на участника в трёх
// прошлых войнах (без истории — WAR_GHOST_BASE), очки она набирает ровно по ходу выходных.
// Призрака получает тот, кому он не доставался на прошлой неделе, из таких — самый слабый.
import { raidWindow } from './raid';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MSK = 3 * HOUR;

export const WAR_REPS_PER_DAY = 300;
export const WAR_MIN_MEMBERS = 3;
// Чтобы получить награду, нужно сделать хотя бы столько повторов за войну.
export const WAR_MIN_POINTS = 30;
// Пары составляем в пятницу в 19:00 по Москве: за 5 часов до начала.
export const WAR_PAIR_BEFORE = 5 * HOUR;
export const WAR_GHOST_BASE = 150;
export const WAR_GHOST_ID = 'ghost';
export const WAR_GHOST = { name: 'Дружина Князя Дивана', tag: 'ДИВ', flag: '10.4.6.7', level: 0 };
// Бойцы призрачной дружины и их доли в общем счёте.
export const GHOST_FIGHTERS: [string, number][] = [
  ['Князь Диван', 0.24],
  ['Тень Дивана', 0.2],
  ['Обжора Пончик', 0.17],
  ['Король Прокрастин', 0.14],
  ['Великан Лень', 0.11],
  ['Сонный Плед', 0.08],
  ['Барон Пульт', 0.06],
];

export interface WarWindow {
  // Ключ войны — дата её субботы по Москве (тот же, что у рейда).
  key: string;
  pairAt: number;
  start: number;
  end: number;
  active: boolean;
}

/** Ближайшая (или идущая) война. В понедельник это уже следующие выходные. */
export function warWindow(now: number): WarWindow {
  const { key, end } = raidWindow(now);
  // У войны нет «недели запуска», как у рейда: всегда с субботы.
  const start = end - 2 * DAY;
  return { key, pairAt: start - WAR_PAIR_BEFORE, start, end, active: now >= start && now < end };
}

export const warStartOf = (key: string) => Date.parse(`${key}T00:00:00+03:00`);
export const warEndOf = (key: string) => warStartOf(key) + 2 * DAY;

export const dayMsk = (t: number) => new Date(t + MSK).toISOString().slice(0, 10);

/** Счёт стороны: сумма n лучших участников. */
export function warScore(points: Record<string, number>, n: number): number {
  return Object.values(points)
    .sort((a, b) => b - a)
    .slice(0, Math.max(0, n))
    .reduce((x, y) => x + y, 0);
}

/** Сколько очков засчитать: дневной предел на участника. */
export const warAdd = (doneToday: number, reps: number) => Math.max(0, Math.min(WAR_REPS_PER_DAY - doneToday, Math.round(Number(reps) || 0)));

// ——— Пары ———

export interface WarEntrant {
  id: string;
  members: number;
  level: number;
  // Соперник прошлой войны: по возможности не повторяем.
  last?: string;
  // На прошлой неделе бился с призраком.
  ghostLast?: boolean;
}

/** Сила клана для подбора: размер важнее уровня. */
export const warStrength = (e: { members: number; level: number }) => e.members + e.level / 2;

export function pairClans(list: WarEntrant[]): { pairs: [string, string][]; ghost: string | null } {
  const sorted = list.filter((e) => e.members >= WAR_MIN_MEMBERS).sort((a, b) => warStrength(b) - warStrength(a) || (a.id < b.id ? -1 : 1));
  let ghost: string | null = null;
  if (sorted.length % 2) {
    const pick = [...sorted].reverse().find((e) => !e.ghostLast) ?? sorted[sorted.length - 1];
    ghost = pick.id;
    sorted.splice(sorted.indexOf(pick), 1);
  }
  const pairs: [string, string][] = [];
  while (sorted.length) {
    const a = sorted.shift()!;
    // Из трёх ближайших по силе — первый, с кем не бились в прошлый раз.
    let i = sorted.slice(0, 3).findIndex((b) => b.id !== a.last && b.last !== a.id);
    if (i < 0) i = 0;
    const [b] = sorted.splice(i, 1);
    pairs.push([a.id, b.id]);
  }
  return { pairs, ghost };
}

// ——— Призрак ———

/** Цель призрака на участника: 90% среднего клана в прошлых войнах. */
export function ghostTarget(pastPerMember: number[]): number {
  const last = pastPerMember.slice(-3);
  const base = last.length ? (0.9 * last.reduce((x, y) => x + y, 0)) / last.length : WAR_GHOST_BASE;
  return Math.round(Math.max(60, Math.min(2 * WAR_REPS_PER_DAY * 0.75, base)));
}

/** Очки призрака к моменту now: набирает ровно по ходу войны. */
export function ghostPoints(key: string, target: number, n: number, now: number): Record<string, number> {
  const start = warStartOf(key);
  const f = Math.max(0, Math.min(1, (now - start) / (2 * DAY)));
  const total = Math.floor(target * n * f);
  const fighters = GHOST_FIGHTERS.slice(0, Math.max(1, Math.min(GHOST_FIGHTERS.length, n)));
  const sum = fighters.reduce((x, [, w]) => x + w, 0);
  const out: Record<string, number> = {};
  let left = total;
  fighters.forEach(([name, w], i) => {
    const p = i === fighters.length - 1 ? left : Math.floor((total * w) / sum);
    out[name] = p;
    left -= p;
  });
  return out;
}

// ——— Итог и награды ———

export type WarResult = 'win' | 'lose' | 'draw';

export const warResult = (us: number, them: number): WarResult => (us > them ? 'win' : us < them ? 'lose' : 'draw');

// Опыт клану за итог войны.
export const WAR_XP: Record<WarResult, number> = { win: 600, draw: 300, lose: 150 };

export interface WarReward {
  coins: number;
  potions: { vigor?: number; might?: number };
  chest: boolean;
}

export const WAR_REWARDS: Record<WarResult, WarReward> = {
  win: { coins: 300, potions: { vigor: 1 }, chest: true },
  draw: { coins: 160, potions: { vigor: 1 }, chest: false },
  lose: { coins: 80, potions: {}, chest: false },
};
// Лучший боец своей стороны (MVP) получает сверху.
export const WAR_MVP: WarReward = { coins: 120, potions: { might: 1 }, chest: false };

/** Награда участника: null, если он почти не участвовал. */
export function warReward(result: WarResult, points: number, mvp: boolean): WarReward | null {
  if (points < WAR_MIN_POINTS) return null;
  const r = WAR_REWARDS[result];
  if (!mvp) return r;
  return { coins: r.coins + WAR_MVP.coins, potions: { ...r.potions, might: (r.potions.might ?? 0) + (WAR_MVP.potions.might ?? 0) }, chest: r.chest };
}

// ——— Что видит игрок ———

export interface WarSideView {
  id: string;
  name: string;
  tag: string;
  flag: string;
  level: number;
  members: number;
  score: number;
  top: { name: string; points: number; me?: boolean; pro?: boolean }[];
}

export interface WarHistoryItem {
  key: string;
  opp: { name: string; tag: string; flag: string; level: number };
  ghost: boolean;
  us: number;
  them: number;
  result: WarResult;
  mvp: string | null;
  // Сколько лучших шло в зачёт: для средней силы клана.
  counted?: number;
}

export interface WarView {
  key: string;
  pairAt: number;
  start: number;
  end: number;
  // Клан записан на войны.
  enabled: boolean;
  // signup — запись, пар ещё нет; paired — соперник известен, ждём субботы; active — бой; ended — итог.
  phase: 'signup' | 'paired' | 'active' | 'ended';
  // В зачёт идут N лучших с каждой стороны.
  counted: number;
  ghost: boolean;
  us: WarSideView | null;
  them: WarSideView | null;
  myPoints: number;
  myToday: number;
  // Игрок вступил после пары: в этой войне очков не приносит.
  outsider: boolean;
  result: WarResult | null;
  record: { w: number; l: number; d: number };
  history: WarHistoryItem[];
  // Награда последней законченной войны.
  reward: { key: string; result: WarResult; points: number; mvp: boolean } | null;
}
