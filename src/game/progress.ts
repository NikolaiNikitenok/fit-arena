// Прогресс игрока хранится в браузере и копией на сервере (src/cloud.ts), чтобы не терялся при смене телефона.
import type { Exercise } from '../repCounter';
import { clanGift } from '../../shared/clanLevel';
import { bossDrop, Gear, GEAR, gearById, ITEMS, itemById, openChest, PotionId, potionById } from './items';
import type { DailyTask } from './daily';
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
  // До какого уровня героя награды уже выданы.
  heroRewarded: number;
  // Замены упражнений за день: сколько замен оплачено на каждом уровне.
  swaps?: { date: string; used: Record<number, number>; bonus?: number };
  // Оружие и вещь во второй руке (id из GEAR).
  weapon?: string;
  offhand?: string;
  // Зелья и свитки: сколько штук.
  potions?: Partial<Record<PotionId, number>>;
  // Выпит эликсир силы: действует на следующий бой.
  might?: boolean;
  // Награды за рейды клана уже забраны: ключи недель.
  raidClaimed?: string[];
  // До какого уровня клана подарки уже забраны (в каком клане).
  clanGift?: { clan: string; level: number };
  // Повторы, ещё не отправленные клану: уходят, когда открыт экран клана.
  clanPending?: number;
  // Повторы за сегодня по упражнениям: для задания дня.
  dayEx?: { date: string; reps: Partial<Record<Exercise, number>> };
  // День, за который награда задания уже забрана.
  dailyDone?: string;
  // Когда прогресс менялся: при синхронизации побеждает более свежий.
  savedAt?: number;
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
  equipped: 'starter',
  chests: [],
  lives: MAX_LIVES,
  livesAt: 0,
  days: {},
  best: {},
  first: {},
  heroRewarded: 1,
  items: ['starter', 'sword'],
  weapon: 'sword',
  potions: { vigor: 1, might: 1 },
});

export function loadProgress(): Progress {
  try {
    const p: Progress = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    // Сохранения до оружия: выдаём стартовый меч.
    if (!p.items.includes('sword')) p.items = [...p.items, 'sword'];
    p.weapon ??= 'sword';
    return p;
  } catch {
    return fresh();
  }
}

// Подписчик на сохранения: облачная копия (src/cloud.ts).
let onSaved: ((p: Progress) => void) | null = null;
export const onProgressSaved = (fn: (p: Progress) => void) => (onSaved = fn);

/** Записать прогресс, пришедший с сервера, без отправки обратно. */
export function replaceProgress(p: Progress): Progress {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Нет хранилища.
  }
  return p;
}

function save(p: Progress): Progress {
  p = { ...p, savedAt: Date.now() };
  onSaved?.(p);
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
  // Трофей за первую победу над боссом.
  drop?: Gear;
}

/** Победа: звёзды, монеты (полные — за первое прохождение), новая база после испытания. */
export function recordWin(p: Progress, level: LevelDef, stars: number, record?: number): { progress: Progress; reward: WinReward } {
  const firstTime = !p.stars[level.id];
  const bonus = itemById(p.equipped).coinBonus;
  const coins = Math.round((firstTime ? level.coins : Math.round(level.coins / 4)) * (1 + bonus));
  const baseline = { ...p.baseline };
  if (level.type === 'trial' && record != null) baseline[level.exercises[0] as Exercise] = Math.max(3, record);
  // Лёгкая победа: форма выросла, враги в этом упражнении становятся крепче.
  if (level.type !== 'trial' && !level.rest && stars === 3) adapt(baseline, level.exercises, WIN_GROWTH);
  const drop = level.type === 'boss' && firstTime ? bossDrop(level.land, p.items) : undefined;
  const next = {
    ...p,
    stars: { ...p.stars, [level.id]: Math.max(p.stars[level.id] ?? 0, stars) },
    coins: p.coins + coins,
    baseline,
    items: drop ? [...p.items, drop.id] : p.items,
  };
  return { progress: save(next), reward: { coins, firstTime, drop } };
}

// Форма игрока между испытаниями: победа на 3 звезды поднимает базу на 3%, поражение снижает на 2%.
export const WIN_GROWTH = 1.03;
export const LOSS_DROP = 0.98;
function adapt(baseline: Baseline, exercises: Exercise[], factor: number) {
  for (const ex of new Set(exercises)) baseline[ex] = Math.max(3, Math.round(baseline[ex] * factor * 10) / 10);
}

/** Поражение: база по упражнениям уровня чуть ниже, чтобы игра не убегала от игрока. */
export function recordLoss(p: Progress, level: LevelDef): Progress {
  if (level.type === 'trial') return p;
  const baseline = { ...p.baseline };
  adapt(baseline, level.exercises, LOSS_DROP);
  return save({ ...p, baseline });
}

export function buy(p: Progress, itemId: string): Progress | null {
  const item = ITEMS.find((i) => i.id === itemId);
  if (!item || p.items.includes(itemId) || p.coins < item.price) return null;
  return save({ ...p, coins: p.coins - item.price, items: [...p.items, itemId], equipped: itemId });
}

export const equip = (p: Progress, itemId: string): Progress => (p.items.includes(itemId) ? save({ ...p, equipped: itemId }) : p);

export function claimChest(p: Progress, land: number): { progress: Progress; coins: number; itemName?: string } | null {
  if (p.chests.includes(land)) return null;
  const loot = openChest(land + 1, p.items, land);
  const found = loot.item?.id ?? loot.gear?.id;
  const next = {
    ...p,
    chests: [...p.chests, land],
    coins: p.coins + loot.coins,
    items: found ? [...p.items, found] : p.items,
    potions: loot.potion ? addPotion(p.potions, loot.potion, 1) : p.potions,
  };
  return { progress: save(next), coins: loot.coins, itemName: loot.item?.name ?? loot.gear?.name ?? (loot.potion && potionById(loot.potion).name) };
}

const addPotion = (have: Progress['potions'], id: PotionId, n: number) => ({ ...have, [id]: Math.max(0, (have?.[id] ?? 0) + n) });

/** Надеть оружие или вещь во вторую руку; повторное нажатие на щит снимает его. */
export function equipGear(p: Progress, id: string): Progress {
  const g = gearById(id);
  if (!g || !p.items.includes(id)) return p;
  if (g.slot === 'weapon') return save({ ...p, weapon: id });
  return save({ ...p, offhand: p.offhand === id ? undefined : id });
}

export function buyGear(p: Progress, id: string): Progress | null {
  const g = GEAR.find((x) => x.id === id);
  if (!g || !g.inShop || p.items.includes(id) || p.coins < g.price) return null;
  return equipGear({ ...p, coins: p.coins - g.price, items: [...p.items, id] }, id);
}

export function buyPotion(p: Progress, id: PotionId): Progress | null {
  const potion = potionById(id);
  if (p.coins < potion.price) return null;
  return save({ ...p, coins: p.coins - potion.price, potions: addPotion(p.potions, id, 1) });
}

/** Выпить зелье. null — нечего пить или сейчас бесполезно (жизни полные, эликсир уже выпит). */
export function usePotion(p: Progress, id: PotionId, now: number): Progress | null {
  if (!(p.potions?.[id] ?? 0)) return null;
  const potions = addPotion(p.potions, id, -1);
  if (id === 'vigor') {
    const { lives, max, nextMs } = livesNow(p, now);
    if (lives >= max) return null;
    const next = lives + 1;
    return save({ ...p, potions, lives: next, livesAt: next >= max ? now : now - (LIFE_MS - nextMs) });
  }
  if (id === 'might') return p.might ? null : save({ ...p, potions, might: true });
  const used = p.swaps?.date === dayKey(now) ? p.swaps : { date: dayKey(now), used: {} };
  return save({ ...p, potions, swaps: { ...used, bonus: (used.bonus ?? 0) + 1 } });
}

/** Эликсир силы тратится, когда начинается бой. */
export const spendMight = (p: Progress): Progress => (p.might ? save({ ...p, might: false }) : p);

// Опыт героя: каждый честный повтор и каждый впервые пройденный уровень.
export const XP_PER_LEVEL_WON = 20;

export function heroXp(p: Progress): number {
  const reps = Object.values(p.days).reduce((s, n) => s + n, 0);
  return reps + Object.keys(p.stars).length * XP_PER_LEVEL_WON;
}

/** Сколько опыта нужно, чтобы перейти с уровня n на n + 1. */
export const xpToNext = (n: number) => 60 + 30 * n;

export function heroLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = xp;
  while (left >= xpToNext(level)) left -= xpToNext(level++);
  return { level, into: left, need: xpToNext(level) };
}

const TITLES: [number, string][] = [
  [50, 'Легенда Атлетии'],
  [35, 'Чемпион'],
  [20, 'Ветеран'],
  [10, 'Боец'],
  [5, 'Ученик Грома'],
  [1, 'Новичок'],
];
export const heroTitle = (level: number) => TITLES.find(([l]) => level >= l)![1];

/** Каждые 10 уровней героя — ещё одна жизнь, до восьми. */
export const maxLives = (p: Progress) => MAX_LIVES + Math.min(3, Math.floor(heroLevel(heroXp(p)).level / 10));
export const levelReward = (level: number) => 30 * level;

/** Выдать монеты за новые уровни героя. */
export function claimHeroLevels(p: Progress): { progress: Progress; levels: number[]; coins: number } | null {
  const { level } = heroLevel(heroXp(p));
  if (level <= (p.heroRewarded ?? 1)) return null;
  const levels = Array.from({ length: level - (p.heroRewarded ?? 1) }, (_, i) => (p.heroRewarded ?? 1) + i + 1);
  const coins = levels.reduce((s, l) => s + levelReward(l), 0);
  return { progress: save({ ...p, heroRewarded: level, coins: p.coins + coins }), levels, coins };
}

/** Жизни сейчас и сколько ждать следующую. */
export function livesNow(p: Progress, now: number): { lives: number; max: number; nextMs: number } {
  const max = maxLives(p);
  if (p.lives >= max) return { lives: max, max, nextMs: 0 };
  const gained = Math.floor((now - p.livesAt) / LIFE_MS);
  const lives = Math.min(max, p.lives + gained);
  return { lives, max, nextMs: lives >= max ? 0 : LIFE_MS - ((now - p.livesAt) % LIFE_MS) };
}

/** Поражение стоит одну жизнь, победа — ничего. */
export function spendLife(p: Progress, now: number): Progress {
  const { lives, max, nextMs } = livesNow(p, now);
  if (lives <= 0) return p;
  // Отсчёт до следующей жизни продолжается с того же места, если жизни уже копились.
  const livesAt = lives >= max ? now : now - (LIFE_MS - nextMs);
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
    const ex = p.dayEx?.date === date ? p.dayEx.reps : {};
    next.dayEx = { date, reps: { ...ex, [exercise]: (ex[exercise] ?? 0) + reps } };
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

// Три замены упражнения в день, например пресс на приседания, когда негде лечь.
export const SWAPS_PER_DAY = 3;

const swapsToday = (p: Progress, now: number) => (p.swaps?.date === dayKey(now) ? p.swaps.used : {});

/** Сколько замен ещё есть сегодня и сколько уже оплачено на этом уровне (переигрывать с ними бесплатно). */
export function swapsLeft(p: Progress, levelId: number, now: number): { left: number; paid: number } {
  const used = swapsToday(p, now);
  const spent = Object.values(used).reduce((a, b) => a + b, 0);
  const bonus = p.swaps?.date === dayKey(now) ? (p.swaps.bonus ?? 0) : 0;
  return { left: Math.max(0, SWAPS_PER_DAY + bonus - spent), paid: used[levelId] ?? 0 };
}

/** Списывает замены при старте попытки; null, если замен не хватает. */
export function spendSwaps(p: Progress, levelId: number, count: number, now: number): Progress | null {
  const { left, paid } = swapsLeft(p, levelId, now);
  const extra = count - paid;
  if (extra <= 0) return p;
  if (extra > left) return null;
  const bonus = p.swaps?.date === dayKey(now) ? p.swaps.bonus : undefined;
  return save({ ...p, swaps: { date: dayKey(now), used: { ...swapsToday(p, now), [levelId]: count }, bonus } });
}

/** Начать игру заново: прогресс, предметы и монеты стираются. */
export function resetProgress(): Progress {
  return save(fresh());
}

/** Награда за рейд клана: монеты, зелья и, для лучших или при победе, сундук рейда со снаряжением. */
export function claimRaid(p: Progress, key: string, reward: { coins: number; potions: Partial<Record<PotionId, number>>; chest: boolean }, land: number): { progress: Progress; gear?: Gear } | null {
  if (p.raidClaimed?.includes(key)) return null;
  let potions = p.potions;
  for (const [id, n] of Object.entries(reward.potions) as [PotionId, number][]) potions = addPotion(potions, id, n);
  const gear = reward.chest ? bossDrop(land + 2, p.items) : undefined;
  const next = {
    ...p,
    coins: p.coins + reward.coins,
    potions,
    items: gear ? [...p.items, gear.id] : p.items,
    raidClaimed: [...(p.raidClaimed ?? []).slice(-20), key],
  };
  return { progress: save(next), gear };
}

/** Подарки за уровни клана. В новом клане отсчёт начинается с его текущего уровня. */
export function syncClanGift(p: Progress, clan: string, level: number): Progress | null {
  if (p.clanGift?.clan === clan) return null;
  return save({ ...p, clanGift: { clan, level } });
}

export function clanGiftsDue(p: Progress, clan: string, level: number): { coins: number; potions: Partial<Record<PotionId, number>>; levels: number } {
  const from = p.clanGift?.clan === clan ? p.clanGift.level : level;
  const out = { coins: 0, potions: {} as Partial<Record<PotionId, number>>, levels: Math.max(0, level - from) };
  for (let l = from + 1; l <= level; l++) {
    const g = clanGift(l);
    out.coins += g.coins;
    for (const [id, n] of Object.entries(g.potions) as [PotionId, number][]) out.potions[id] = (out.potions[id] ?? 0) + n;
  }
  return out;
}

export function claimClanGift(p: Progress, clan: string, level: number): Progress | null {
  const due = clanGiftsDue(p, clan, level);
  if (!due.levels) return null;
  let potions = p.potions;
  for (const [id, n] of Object.entries(due.potions) as [PotionId, number][]) potions = addPotion(potions, id, n);
  return save({ ...p, coins: p.coins + due.coins, potions, clanGift: { clan, level } });
}

export const clearClanPending = (p: Progress): Progress => save({ ...p, clanPending: 0 });

/** Сколько повторов задания дня сделано сегодня. */
export function dailyProgress(p: Progress, task: DailyTask): number {
  return p.dayEx?.date === task.date ? (p.dayEx.reps[task.exercise] ?? 0) : 0;
}

export function claimDaily(p: Progress, task: DailyTask): Progress | null {
  if (p.dailyDone === task.date || dailyProgress(p, task) < task.target) return null;
  return save({ ...p, coins: p.coins + task.coins, potions: task.potion ? addPotion(p.potions, task.potion, 1) : p.potions, dailyDone: task.date });
}
