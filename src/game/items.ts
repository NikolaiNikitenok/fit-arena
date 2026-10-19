// Снаряжение героя. Предметы меняют внешность и дают игровые бонусы, но не снижают цели по повторам:
// тренировка остаётся честной.
import type { CharName } from '../three/kit';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY_NAMES: Record<Rarity, string> = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

export interface Item {
  id: string;
  name: string;
  // Каким героем выглядит игрок в этом снаряжении.
  hero: CharName;
  rarity: Rarity;
  // Цвет брони героя, когда предмет надет.
  color: string;
  // Свечение брони (у редких предметов).
  glow?: string;
  // Оттенок персонажа: множитель цвета текстуры.
  tint?: string;
  // Бонус к монетам за уровень, доля.
  coinBonus: number;
  price: number;
  // Продаётся у купца или только находится в сундуках.
  inShop: boolean;
}

export const ITEMS: Item[] = [
  { id: 'starter', hero: 'Knight', name: 'Рыцарь-новичок', rarity: 'common', color: '#ff5a36', coinBonus: 0, price: 0, inShop: false },
  { id: 'forest', hero: 'Rogue', name: 'Лесной разбойник', rarity: 'common', color: '#43a047', coinBonus: 0.05, price: 120, inShop: true },
  { id: 'sky', hero: 'Mage', name: 'Небесный маг', rarity: 'common', color: '#42a5f5', coinBonus: 0.05, price: 150, inShop: true },
  { id: 'iron', hero: 'Knight', name: 'Железный рыцарь', rarity: 'rare', color: '#b0bec5', tint: 'mul:0.85,0.92,1.08', coinBonus: 0.1, price: 400, inShop: true },
  { id: 'cosmo', hero: 'Mage', name: 'Звёздный маг', rarity: 'rare', color: '#e0f7fa', glow: '#4fc3f7', coinBonus: 0.1, price: 600, inShop: true },
  { id: 'shadow', hero: 'Rogue', name: 'Плащ теней', rarity: 'epic', color: '#4527a0', glow: '#7c4dff', tint: 'mul:0.6,0.55,0.85', coinBonus: 0.15, price: 1500, inShop: true },
  { id: 'zombie-hunter', hero: 'Barbarian', name: 'Охотник на зомби', rarity: 'epic', color: '#33691e', glow: '#aeea00', coinBonus: 0.15, price: 0, inShop: false },
  { id: 'crystal', hero: 'Mage', name: 'Кристальный маг', rarity: 'epic', color: '#ce93d8', glow: '#e040fb', tint: 'mul:1.1,0.85,1.4', coinBonus: 0.2, price: 0, inShop: false },
  { id: 'dragon', hero: 'Barbarian', name: 'Драконоборец', rarity: 'legendary', color: '#d84315', glow: '#ff3d00', tint: 'mul:1.3,0.75,0.6', coinBonus: 0.3, price: 0, inShop: false },
  { id: 'gold', hero: 'Knight', name: 'Золотой чемпион', rarity: 'legendary', color: '#ffc400', glow: '#ffea00', tint: 'mul:1.45,1.15,0.45', coinBonus: 0.3, price: 5000, inShop: true },
];

export const itemById = (id: string): Item => ITEMS.find((i) => i.id === id) ?? ITEMS[0];

/** Что лежит в сундуке: монеты или, изредка, предмет, которого ещё нет. */
export function openChest(seed: number, owned: string[]): { coins: number; item?: Item } {
  const rnd = (n: number) => {
    const x = Math.sin(seed * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  const loot = ITEMS.filter((i) => !i.inShop && i.id !== 'starter' && !owned.includes(i.id));
  if (loot.length && rnd(1) < 0.25) return { coins: 0, item: loot[Math.floor(rnd(2) * loot.length)] };
  return { coins: 40 + Math.floor(rnd(3) * 80) };
}
