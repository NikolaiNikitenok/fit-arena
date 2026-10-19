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
}

const KEY = 'fit-arena-adventure';

const fresh = (): Progress => ({ stars: {}, baseline: { ...DEFAULT_BASELINE }, coins: 0, items: ['starter'], equipped: 'starter', chests: [] });

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
