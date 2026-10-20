/**
 * Деревня игрока: каталог построек, сетка, стройка по таймерам, сборщики, склады и правила добычи.
 * Чистый детерминированный код без Date и Math.random: тот же файл работает в приложении и на сервере
 * (сервер проверяет набеги и считает, сколько можно унести).
 *
 * ── Баланс ─────────────────────────────────────────────────────────────────────────────────────────
 * Доход: подземелье «три в ряд» даёт ~40–120 каждого ресурса за этаж (20 заряда = 20 повторов).
 * Обычная тренировка ~100 повторов → 5 этажей → ~300 каждого ресурса в день, плюс сборщики
 * (лесопилка 1 уровня — 12 дерева в час, копит до 10 часов).
 *
 *   Ратуша   дерево  камень  золото   время    строителей  склад ратуши
 *   1        —       —       —        —        2           1 000
 *   2        500     500     200      30 мин   2           2 000
 *   3        1 500   1 500   700      2 ч      2           3 500
 *   4        4 000   4 000   2 000    4 ч      3           6 000
 *   5        9 000   9 000   4 500    8 ч      3           10 000
 *   6        18 000  18 000  9 000    12 ч     3           16 000
 *   7        32 000  32 000  16 000   1 д      4           25 000
 *   8        50 000  50 000  25 000   1,5 д    4           40 000
 *
 * Итого: ратуша 2 — на второй день, ратуша 3 — через 4–5 дней тренировок, дальше — недели.
 * Цена прочих построек: базовая × [1, 2.5, 6, 12, 22, 38, 60, 90] по уровню; время по уровню:
 * 10 с, 5 мин, 20 мин, 1 ч, 2 ч, 4 ч, 8 ч, 12 ч. Стены строятся сразу (камень, позже и золото).
 * Ускорение: 1 заряд = 2 минуты стройки (SPEEDUP_MIN_PER_CHARGE).
 *
 * Защита от набегов: склады (и ратуша) прячут четверть вместимости; из остального можно унести
 * 20% (LOOT_SHARE) плюс половину того, что лежит несобранным в сборщиках, но не больше LOOT_CAP
 * по уровню ратуши. Набеги Князя Дивана уносят вдвое меньше (NPC_LOOT_MUL, src/village/raids.ts).
 */
import type { TroopId } from './villageBattle';

export type ResKey = 'wood' | 'stone' | 'gold';
export type Res = Record<ResKey, number>;
export const RES_KEYS: ResKey[] = ['wood', 'stone', 'gold'];
export const NO_RES: Res = { wood: 0, stone: 0, gold: 0 };

// Сетка 24×24 клетки: на телефоне видно почти всю деревню, а места хватает на ~30 построек и стены.
export const GRID = 24;
export const TH_MAX = 8;
export const MAX_LEVEL = 8;
export const SPEEDUP_MIN_PER_CHARGE = 2;
export const LOOT_SHARE = 0.2;
export const PROTECT_SHARE = 0.25;
export const COLLECTOR_LOOT_SHARE = 0.5;
export const LOOT_CAP = [500, 1000, 2000, 3500, 5500, 8000, 11000, 15000];
// Стартовые ресурсы деревни: хватает на первые сборщики.
export const STARTER_RES: Res = { wood: 300, stone: 300, gold: 150 };

export type BuildingType = 'townhall' | 'lumbermill' | 'quarry' | 'goldmine' | 'storage' | 'barracks' | 'forge' | 'tavern' | 'market' | 'tower' | 'catapult' | 'wall';
export type Category = 'economy' | 'army' | 'defense' | 'village';
export const CATEGORY_LABELS: Record<Category, string> = { economy: 'Хозяйство', army: 'Войско', defense: 'Оборона', village: 'Жители' };

export interface DefenseStats {
  // Дальность в клетках, урон за выстрел по уровню, выстрел раз в every секунд.
  range: number;
  minRange?: number;
  damage: number[];
  every: number;
  // Катапульта бьёт по площади, снаряд летит flight секунд.
  splash?: number;
  flight?: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  desc: string;
  size: number;
  category: Category;
  // Индекс — уровень ратуши минус 1: сколько штук можно поставить и до какого уровня улучшить.
  count: number[];
  levelCap: number[];
  // Цена и время стройки до уровня L — индекс L-1. Время в секундах.
  cost: Partial<Res>[];
  time: number[];
  hp: number[];
  collector?: { res: ResKey; perHour: number[]; capHours: number };
  storage?: number[];
  defense?: DefenseStats;
  // Сколько «веса» добычи хранит постройка: от него зависит доля унесённого.
  lootWeight?: number;
}

const GROWTH = [1, 2.5, 6, 12, 22, 38, 60, 90];
const TIMES = [10, 300, 1200, 3600, 7200, 14400, 28800, 43200];
const HP_GROWTH = [1, 1.3, 1.65, 2.05, 2.5, 3, 3.6, 4.3];
const nice = (v: number) => (v < 100 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100);
const costs = (base: Partial<Res>, growth = GROWTH): Partial<Res>[] =>
  growth.map((g) => Object.fromEntries(Object.entries(base).map(([k, v]) => [k, nice((v as number) * g)])) as Partial<Res>);
const hps = (base: number) => HP_GROWTH.map((g) => nice(base * g));
const all = (n: number) => Array(TH_MAX).fill(n) as number[];

const COLLECTOR_COUNT = [1, 1, 2, 2, 3, 3, 4, 4];
const COLLECTOR_CAP = [2, 3, 4, 5, 6, 7, 8, 8];
const RATE_BASIC = [12, 18, 26, 36, 50, 66, 85, 110];
const RATE_GOLD = [8, 12, 17, 24, 33, 44, 57, 72];

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  townhall: {
    type: 'townhall', name: 'Ратуша', desc: 'Сердце деревни. Её уровень открывает новые постройки и уровни.', size: 3, category: 'village',
    count: all(1), levelCap: [1, 2, 3, 4, 5, 6, 7, 8],
    cost: [{}, { wood: 500, stone: 500, gold: 200 }, { wood: 1500, stone: 1500, gold: 700 }, { wood: 4000, stone: 4000, gold: 2000 }, { wood: 9000, stone: 9000, gold: 4500 }, { wood: 18000, stone: 18000, gold: 9000 }, { wood: 32000, stone: 32000, gold: 16000 }, { wood: 50000, stone: 50000, gold: 25000 }],
    time: [0, 1800, 7200, 14400, 28800, 43200, 86400, 129600],
    hp: [1200, 1600, 2100, 2700, 3400, 4200, 5100, 6100],
    storage: [1000, 2000, 3500, 6000, 10000, 16000, 25000, 40000],
    lootWeight: 3,
  },
  lumbermill: {
    type: 'lumbermill', name: 'Лесопилка', desc: 'Сама пилит дерево, пока ты тренируешься.', size: 2, category: 'economy',
    count: COLLECTOR_COUNT, levelCap: COLLECTOR_CAP, cost: costs({ stone: 60, gold: 20 }), time: TIMES, hp: hps(300),
    collector: { res: 'wood', perHour: RATE_BASIC, capHours: 10 }, lootWeight: 1,
  },
  quarry: {
    type: 'quarry', name: 'Каменоломня', desc: 'Добывает камень для стен и построек.', size: 2, category: 'economy',
    count: COLLECTOR_COUNT, levelCap: COLLECTOR_CAP, cost: costs({ wood: 60, gold: 20 }), time: TIMES, hp: hps(300),
    collector: { res: 'stone', perHour: RATE_BASIC, capHours: 10 }, lootWeight: 1,
  },
  goldmine: {
    type: 'goldmine', name: 'Золотой рудник', desc: 'Понемногу намывает золото на войско.', size: 2, category: 'economy',
    count: [1, 1, 1, 2, 2, 3, 3, 4], levelCap: COLLECTOR_CAP, cost: costs({ wood: 50, stone: 50 }), time: TIMES, hp: hps(300),
    collector: { res: 'gold', perHour: RATE_GOLD, capHours: 10 }, lootWeight: 1,
  },
  storage: {
    type: 'storage', name: 'Склад', desc: 'Вмещает урожай сборщиков и прячет четверть запасов от набегов.', size: 2, category: 'economy',
    count: [1, 1, 2, 2, 3, 3, 4, 4], levelCap: [1, 2, 3, 4, 5, 6, 7, 8], cost: costs({ wood: 120, stone: 120 }), time: TIMES, hp: hps(400),
    storage: [1000, 2000, 3500, 5500, 8000, 11000, 15000, 20000], lootWeight: 2,
  },
  barracks: {
    type: 'barracks', name: 'Казармы', desc: 'Обучают войско. Уровень открывает новые отряды, усиливает их и даёт больше мест.', size: 2, category: 'army',
    count: all(1), levelCap: [1, 2, 3, 4, 5, 6, 7, 8], cost: costs({ wood: 150, stone: 100 }), time: TIMES, hp: hps(350),
  },
  forge: {
    type: 'forge', name: 'Кузница', desc: 'Точит оружие героя: +1% урона в походах за каждый уровень.', size: 2, category: 'village',
    count: [0, 1, 1, 1, 1, 1, 1, 1], levelCap: [0, 2, 3, 4, 5, 6, 7, 8], cost: costs({ wood: 200, stone: 250, gold: 100 }), time: TIMES, hp: hps(450),
  },
  tavern: {
    type: 'tavern', name: 'Таверна', desc: 'Здесь герой отдыхает: +1 жизнь, с 5 уровня — +2.', size: 2, category: 'village',
    count: [0, 0, 1, 1, 1, 1, 1, 1], levelCap: [0, 0, 2, 3, 4, 5, 6, 7], cost: costs({ wood: 250, stone: 150, gold: 100 }), time: TIMES, hp: hps(450),
  },
  market: {
    type: 'market', name: 'Рынок', desc: 'Купцы платят щедрее: +2% монет за победы за каждый уровень.', size: 2, category: 'village',
    count: [0, 0, 0, 1, 1, 1, 1, 1], levelCap: [0, 0, 0, 2, 3, 4, 5, 6], cost: costs({ wood: 200, stone: 200, gold: 150 }), time: TIMES, hp: hps(450),
  },
  tower: {
    type: 'tower', name: 'Башня лучников', desc: 'Стреляет по ближайшему врагу.', size: 2, category: 'defense',
    count: [1, 2, 2, 3, 3, 4, 4, 5], levelCap: [2, 3, 4, 5, 6, 7, 8, 8], cost: costs({ wood: 150, stone: 100, gold: 50 }), time: TIMES, hp: hps(400),
    defense: { range: 6, damage: [7, 9, 12, 15, 19, 24, 30, 37], every: 0.8 },
  },
  catapult: {
    type: 'catapult', name: 'Катапульта', desc: 'Медленно, но больно бьёт по толпе. Вблизи не достаёт.', size: 2, category: 'defense',
    count: [0, 0, 1, 1, 2, 2, 3, 3], levelCap: [0, 0, 2, 3, 4, 5, 6, 7], cost: costs({ wood: 300, stone: 400, gold: 200 }), time: TIMES, hp: hps(500),
    defense: { range: 8, minRange: 2.5, damage: [30, 40, 52, 66, 82, 100, 120, 145], every: 4, splash: 1.5, flight: 1.2 },
  },
  wall: {
    type: 'wall', name: 'Стена', desc: 'Задерживает врагов: им придётся ломать или обходить.', size: 1, category: 'defense',
    count: [0, 15, 25, 35, 45, 55, 65, 75], levelCap: [0, 2, 3, 4, 5, 6, 7, 8],
    cost: [{ stone: 20 }, { stone: 60 }, { stone: 160 }, { stone: 400 }, { stone: 900, gold: 200 }, { stone: 1800, gold: 500 }, { stone: 3200, gold: 1000 }, { stone: 5200, gold: 1800 }],
    time: all(0), hp: [150, 300, 550, 900, 1400, 2000, 2800, 3800],
  },
};
export const BUILDING_TYPES = Object.keys(BUILDINGS) as BuildingType[];
export const isDefense = (t: BuildingType) => !!BUILDINGS[t].defense;

// Строители: двое, третий с ратуши 4, четвёртый с ратуши 7.
export const buildersAt = (th: number) => (th >= 7 ? 4 : th >= 4 ? 3 : 2);

// ── Состояние ──────────────────────────────────────────────────────────────────────────────────────

/** Постройка: короткие ключи, чтобы сохранение было маленьким. */
export interface Bld {
  i: number;
  t: BuildingType;
  // Левый верхний угол на сетке.
  x: number;
  y: number;
  // Уровень; 0 — ещё строится в первый раз.
  l: number;
  // Стройка до уровня l+1 закончится в этот момент (мс).
  u?: number;
  // Сборщик: с какого момента копит (мс).
  c?: number;
}

export interface Town {
  res: Res;
  b: Bld[];
  // Следующий номер постройки.
  n: number;
  army: Partial<Record<TroopId, number>>;
  // Очередь обучения: отряды выходят по одному, end — когда выйдет этот.
  q: { t: TroopId; end: number }[];
}

export const thLevel = (t: Pick<Town, 'b'>) => t.b.find((b) => b.t === 'townhall')?.l ?? 1;
export const thIdx = (th: number) => Math.max(0, Math.min(TH_MAX, th) - 1);

/** Новая деревня: ратуша посередине. */
export function newTown(res: Res = { ...STARTER_RES }): Town {
  const s = BUILDINGS.townhall.size;
  return { res, b: [{ i: 1, t: 'townhall', x: (GRID - s) >> 1, y: (GRID - s) >> 1, l: 1 }], n: 2, army: {}, q: [] };
}

export const countOf = (t: Pick<Town, 'b'>, type: BuildingType) => t.b.filter((b) => b.t === type).length;
export const maxCount = (type: BuildingType, th: number) => BUILDINGS[type].count[thIdx(th)];
export const levelCap = (type: BuildingType, th: number) => BUILDINGS[type].levelCap[thIdx(th)];
export const costOf = (type: BuildingType, level: number): Res => ({ ...NO_RES, ...BUILDINGS[type].cost[level - 1] });
export const timeOf = (type: BuildingType, level: number) => BUILDINGS[type].time[level - 1] ?? 0;
export const hpOf = (type: BuildingType, level: number) => BUILDINGS[type].hp[Math.max(1, level) - 1];
export const affordable = (res: Res, cost: Res) => RES_KEYS.every((k) => res[k] >= cost[k]);
const minus = (res: Res, cost: Res): Res => ({ wood: res.wood - cost.wood, stone: res.stone - cost.stone, gold: res.gold - cost.gold });

/** Самая ранняя ратуша, на которой открыт этот уровень постройки (для подсказки «нужна ратуша N»). */
export function thFor(type: BuildingType, level: number): number {
  const caps = BUILDINGS[type].levelCap;
  const i = caps.findIndex((c) => c >= level);
  return i < 0 ? TH_MAX + 1 : i + 1;
}

export const busyBuilders = (t: Pick<Town, 'b'>) => t.b.filter((b) => b.u != null).length;
export const freeBuilders = (t: Pick<Town, 'b'>) => buildersAt(thLevel(t)) - busyBuilders(t);

// ── Сетка ──────────────────────────────────────────────────────────────────────────────────────────

export const sizeOf = (type: BuildingType) => BUILDINGS[type].size;

/** Можно ли поставить постройку (или передвинуть ту, что с номером ignore). */
export function canPlace(t: Pick<Town, 'b'>, type: BuildingType, x: number, y: number, ignore?: number): boolean {
  const s = sizeOf(type);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + s > GRID || y + s > GRID) return false;
  return t.b.every((b) => {
    if (b.i === ignore) return true;
    const bs = sizeOf(b.t);
    return x + s <= b.x || b.x + bs <= x || y + s <= b.y || b.y + bs <= y;
  });
}

/** Ближайшее к центру свободное место под постройку — для первой расстановки. */
export function freeSpot(t: Pick<Town, 'b'>, type: BuildingType, near: { x: number; y: number } = { x: GRID / 2, y: GRID / 2 }): { x: number; y: number } | null {
  const s = sizeOf(type);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = 0; y + s <= GRID; y++)
    for (let x = 0; x + s <= GRID; x++) {
      if (!canPlace(t, type, x, y)) continue;
      const d = (x + s / 2 - near.x) ** 2 + (y + s / 2 - near.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return best;
}

// ── Стройка ───────────────────────────────────────────────────────────────────────────────────────

export type BuildError = 'limit' | 'place' | 'builders' | 'cost' | 'max' | 'th' | 'busy';
export const BUILD_ERRORS: Record<BuildError, string> = {
  limit: 'Больше таких не построить: улучши ратушу.',
  place: 'Здесь не поместится.',
  builders: 'Все строители заняты.',
  cost: 'Не хватает ресурсов.',
  max: 'Это наивысший уровень.',
  th: 'Сначала улучши ратушу.',
  busy: 'Уже строится.',
};

/** Сборщик: сколько накопилось к моменту now. */
export function accrued(b: Bld, now: number): number {
  const c = BUILDINGS[b.t].collector;
  if (!c || b.l < 1 || b.c == null) return 0;
  const rate = c.perHour[b.l - 1];
  return Math.floor(Math.min(rate * c.capHours, (rate * Math.max(0, now - b.c)) / 3_600_000));
}

/** Закончить стройки, срок которых прошёл. Сборщик сохраняет накопленное и дальше копит быстрее. */
export function finishDue<T extends Town>(t: T, now: number): T {
  if (!t.b.some((b) => b.u != null && b.u <= now)) return t;
  return {
    ...t,
    b: t.b.map((b) => {
      if (b.u == null || b.u > now) return b;
      const end = b.u;
      const next: Bld = { ...b, l: b.l + 1 };
      delete next.u;
      const c = BUILDINGS[b.t].collector;
      if (c) {
        const kept = b.l >= 1 ? accrued(b, end) : 0;
        next.c = end - Math.floor((kept / c.perHour[next.l - 1]) * 3_600_000);
      }
      return next;
    }),
  };
}

/** Заложить новую постройку. */
export function build<T extends Town>(t: T, type: BuildingType, x: number, y: number, now: number): T | BuildError {
  const th = thLevel(t);
  if (type === 'townhall' || countOf(t, type) >= maxCount(type, th)) return 'limit';
  if (!canPlace(t, type, x, y)) return 'place';
  const time = timeOf(type, 1);
  if (time > 0 && freeBuilders(t) <= 0) return 'builders';
  const cost = costOf(type, 1);
  if (!affordable(t.res, cost)) return 'cost';
  const b: Bld = time > 0 ? { i: t.n, t: type, x, y, l: 0, u: now + time * 1000 } : { i: t.n, t: type, x, y, l: 1 };
  if (time <= 0 && BUILDINGS[type].collector) b.c = now;
  return { ...t, res: minus(t.res, cost), n: t.n + 1, b: [...t.b, b] };
}

/** Почему нельзя улучшить (или null, если можно). */
export function upgradeBlock(t: Town, id: number): BuildError | null {
  const b = t.b.find((x) => x.i === id);
  if (!b) return 'place';
  if (b.u != null) return 'busy';
  if (b.l >= MAX_LEVEL || b.l >= BUILDINGS[b.t].cost.length) return 'max';
  if (b.l + 1 > levelCap(b.t, thLevel(t)) && b.t !== 'townhall') return 'th';
  if (b.t === 'townhall' && b.l >= TH_MAX) return 'max';
  if (timeOf(b.t, b.l + 1) > 0 && freeBuilders(t) <= 0) return 'builders';
  if (!affordable(t.res, costOf(b.t, b.l + 1))) return 'cost';
  return null;
}

export function upgrade<T extends Town>(t: T, id: number, now: number): T | BuildError {
  const err = upgradeBlock(t, id);
  if (err) return err;
  const b = t.b.find((x) => x.i === id)!;
  const level = b.l + 1;
  const time = timeOf(b.t, level);
  const res = minus(t.res, costOf(b.t, level));
  const next = { ...t, res, b: t.b.map((x) => (x.i === id ? { ...x, u: now + time * 1000 } : x)) };
  return time > 0 ? next : finishDue(next, now);
}

/** Сколько заряда стоит закончить стройку сейчас. */
export const speedUpCharge = (b: Bld, now: number) => (b.u == null ? 0 : Math.max(1, Math.ceil((b.u - now) / 60_000 / SPEEDUP_MIN_PER_CHARGE)));

/** Закончить стройку сразу (заряд списывает вызывающий). */
export function finishNow<T extends Town>(t: T, id: number, now: number): T {
  return finishDue({ ...t, b: t.b.map((b) => (b.i === id && b.u != null ? { ...b, u: now } : b)) }, now);
}

export function move<T extends Town>(t: T, id: number, x: number, y: number): T | null {
  const b = t.b.find((v) => v.i === id);
  if (!b || !canPlace(t, b.t, x, y, id)) return null;
  return { ...t, b: t.b.map((v) => (v.i === id ? { ...v, x, y } : v)) };
}

// ── Склады и сборщики ─────────────────────────────────────────────────────────────────────────────

/** Вместимость: ратуша и склады. Добыча подземелья не теряется, но сборщики сверх неё не собрать. */
export function capacity(t: Pick<Town, 'b'>): number {
  let cap = 0;
  for (const b of t.b) {
    const s = BUILDINGS[b.t].storage;
    if (s && b.l >= 1) cap += s[b.l - 1];
  }
  return cap;
}

/** Собрать урожай одного сборщика (сколько влезет в склады); остаток копится дальше. */
export function collect<T extends Town>(t: T, id: number, now: number): { town: T; got: number; res?: ResKey } {
  const b = t.b.find((v) => v.i === id);
  const c = b && BUILDINGS[b.t].collector;
  if (!b || !c) return { town: t, got: 0 };
  const have = accrued(b, now);
  const room = Math.max(0, capacity(t) - t.res[c.res]);
  const got = Math.min(have, room);
  if (got <= 0) return { town: t, got: 0, res: c.res };
  const rest = have - got;
  const rate = c.perHour[b.l - 1];
  const nc = now - Math.floor((rest / rate) * 3_600_000);
  return { town: { ...t, res: { ...t.res, [c.res]: t.res[c.res] + got }, b: t.b.map((v) => (v.i === id ? { ...v, c: nc } : v)) }, got, res: c.res };
}

/** Несобранное во всех сборщиках. */
export function uncollected(t: Pick<Town, 'b'>, now: number): Res {
  const out = { ...NO_RES };
  for (const b of t.b) {
    const c = BUILDINGS[b.t].collector;
    if (c) out[c.res] += accrued(b, now);
  }
  return out;
}

/** Сколько можно унести набегом: 20% незащищённого и половина несобранного, не больше предела ратуши. */
export function lootAvailable(t: Town, now: number, mul = 1): Res {
  const prot = Math.floor(capacity(t) * PROTECT_SHARE);
  const un = uncollected(t, now);
  const cap = LOOT_CAP[thIdx(thLevel(t))];
  const out = { ...NO_RES };
  for (const k of RES_KEYS) out[k] = Math.floor(mul * Math.min(cap, LOOT_SHARE * Math.max(0, t.res[k] - prot) + COLLECTOR_LOOT_SHARE * un[k]));
  return out;
}

/**
 * Списать унесённое набегом: сначала из несобранного в сборщиках (половина его доступна),
 * остальное — из запасов. Запасы не уходят ниже нуля.
 */
export function applyLoss<T extends Town>(t: T, loss: Res, now: number): T {
  const res = { ...t.res };
  let b = t.b;
  for (const k of RES_KEYS) {
    let left = loss[k];
    b = b.map((v) => {
      const c = BUILDINGS[v.t].collector;
      if (!c || c.res !== k || left <= 0) return v;
      const have = accrued(v, now);
      const take = Math.min(left, Math.floor(have * COLLECTOR_LOOT_SHARE));
      left -= take;
      return { ...v, c: now - Math.floor(((have - take) / c.perHour[v.l - 1]) * 3_600_000) };
    });
    res[k] = Math.max(0, res[k] - left);
  }
  return { ...t, res, b };
}

// ── Польза деревни для основной игры ─────────────────────────────────────────────────────────────

export interface VillageBonus {
  // Прибавка к проценту урона героя, к жизням и к доле монет за победы.
  damage: number;
  lives: number;
  coins: number;
}

/** Готовые (достроенные) кузница, таверна и рынок дают небольшие бонусы. */
export function villageBonus(b: Bld[] | undefined): VillageBonus {
  const lvl = (t: BuildingType) => Math.max(0, ...(b ?? []).filter((x) => x.t === t).map((x) => x.l));
  const tavern = lvl('tavern');
  return { damage: 0.01 * lvl('forge'), lives: tavern >= 5 ? 2 : tavern >= 1 ? 1 : 0, coins: 0.02 * lvl('market') };
}
