// Прогресс игрока хранится в браузере. Сервер профилей подключим вместе с рейтингом дуэлей.
import type { Exercise } from '../repCounter';
import { ITEMS, itemById, openChest } from './items';
import { Baseline, DEFAULT_BASELINE, LevelDef } from './levels';

export interface Progress {
  stars: Record<number, number>;
  baseline: Baseline;
  coins: number;
  items: string[];
  equipped: string;
  // Открытые сундуки: номер земли.
  chests: number[];
  // Жизни на попытки: сколько было в момент livesAt. Восполняются со временем.
  lives: number;
  livesAt: number;
  // Дни с тренировкой (YYYY-MM-DD по местному времени) и сколько повторов сделано в каждый.
  days: Record<string, number>;
  // Лучший подход по упражнению и самый первый — чтобы показать рост.
  best: Partial<Record<Exercise, Record_>>;
  first: Partial<Record<Exercise, Record_>>;
}

export interface Record_ {
  reps: number;
  date: string;
}

export const MAX_LIVES = 5;
export const LIFE_MS = 20 * 60 * 1000;

const KEY = 'fit-arena-adventure';

const fresh = (): Progress => ({
  stars: {},
  baseline: { ...DEFAULT_BASELINE },
  coins: 0,
  items: ['starter'],
  equipped: 'starter',
  chests: [],
  lives: MAX_LIVES,
  livesAt: 0,
  days: {},
  best: {},
  first: {},
});

export function loadProgress(): Progress {
  try {
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return fresh();
  }
}

function save(p: Progress): Progress {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Без хранилища прогресс живёт до закрытия приложения.
  }
  return p;
}

export const isUnlocked = (p: Progress, id: number) => id === 1 || (p.stars[id - 1] ?? 0) > 0;

/** Первый непройденный уровень — там стоит герой. */
export function currentLevel(p: Progress, count: number): number {
  for (let id = 1; id <= count; id++) if (!p.stars[id]) return id;
  return count;
}

export interface WinReward {
  coins: number;
  firstTime: boolean;
}

/** Победа: звёзды, монеты (полные — за первое прохождение), новая база после испытания. */
export function recordWin(p: Progress, level: LevelDef, stars: number, record?: number): { progress: Progress; reward: WinReward } {
  const firstTime = !p.stars[level.id];
  const bonus = itemById(p.equipped).coinBonus;
  const coins = Math.round((firstTime ? level.coins : Math.round(level.coins / 4)) * (1 + bonus));
  const baseline = { ...p.baseline };
  if (level.type === 'trial' && record != null) baseline[level.exercises[0] as Exercise] = Math.max(3, record);
  const next = { ...p, stars: { ...p.stars, [level.id]: Math.max(p.stars[level.id] ?? 0, stars) }, coins: p.coins + coins, baseline };
  return { progress: save(next), reward: { coins, firstTime } };
}

export function buy(p: Progress, itemId: string): Progress | null {
  const item = ITEMS.find((i) => i.id === itemId);
  if (!item || p.items.includes(itemId) || p.coins < item.price) return null;
  return save({ ...p, coins: p.coins - item.price, items: [...p.items, itemId], equipped: itemId });
}

export const equip = (p: Progress, itemId: string): Progress => (p.items.includes(itemId) ? save({ ...p, equipped: itemId }) : p);

export function claimChest(p: Progress, land: number): { progress: Progress; coins: number; itemName?: string } | null {
  if (p.chests.includes(land)) return null;
  const loot = openChest(land + 1, p.items);
  const next = {
    ...p,
    chests: [...p.chests, land],
    coins: p.coins + loot.coins,
    items: loot.item ? [...p.items, loot.item.id] : p.items,
  };
  return { progress: save(next), coins: loot.coins, itemName: loot.item?.name };
}

/** Жизни сейчас и сколько ждать следующую. */
export function livesNow(p: Progress, now: number): { lives: number; nextMs: number } {
  if (p.lives >= MAX_LIVES) return { lives: MAX_LIVES, nextMs: 0 };
  const gained = Math.floor((now - p.livesAt) / LIFE_MS);
  const lives = Math.min(MAX_LIVES, p.lives + gained);
  return { lives, nextMs: lives >= MAX_LIVES ? 0 : LIFE_MS - ((now - p.livesAt) % LIFE_MS) };
}

/** Поражение стоит одну жизнь, победа — ничего. */
export function spendLife(p: Progress, now: number): Progress {
  const { lives, nextMs } = livesNow(p, now);
  if (lives <= 0) return p;
  // Отсчёт до следующей жизни продолжается с того же места, если жизни уже копились.
  const livesAt = lives >= MAX_LIVES ? now : now - (LIFE_MS - nextMs);
  return save({ ...p, lives: lives - 1, livesAt });
}

export const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Сделанный подход (победа или нет): день тренировки, повторы, рекорды. */
export function recordActivity(p: Progress, exercise: Exercise | null, reps: number, now: number): Progress {
  if (reps <= 0) return p;
  const date = dayKey(now);
  const next = { ...p, days: { ...p.days, [date]: (p.days[date] ?? 0) + reps } };
  if (exercise) {
    if (!p.first[exercise]) next.first = { ...p.first, [exercise]: { reps, date } };
    if (reps > (p.best[exercise]?.reps ?? 0)) next.best = { ...p.best, [exercise]: { reps, date } };
  }
  return save(next);
}

// В неделю можно отдохнуть два дня, и серия не прервётся: мышцам нужен отдых.
export const REST_PER_WEEK = 2;

/** Серия: дни подряд с тренировками, где до двух пропусков в неделю считаются отдыхом. */
export function streak(days: Record<string, number>, now: number): { days: number; restLeft: number; today: boolean } {
  const DAY = 86400000;
  const today = !!days[dayKey(now)];
  let count = 0;
  let restUsed = 0;
  let weekRest = 0;
  // Неделя отдыха считается по 7 дням назад от текущего шага.
  let weekStart = 0;
  let pending = 0;
  for (let i = today ? 0 : 1; i < 400; i++) {
    const key = dayKey(now - i * DAY);
    if (i - weekStart >= 7) {
      weekStart = i;
      weekRest = 0;
    }
    if (days[key]) {
      count += 1 + pending;
      pending = 0;
      continue;
    }
    if (weekRest < REST_PER_WEEK) {
      weekRest++;
      if (i < 7) restUsed++;
      // Пропуск засчитывается в серию, только если до него тоже тренировались.
      pending++;
      continue;
    }
    break;
  }
  return { days: count, restLeft: Math.max(0, REST_PER_WEEK - restUsed), today };
}
