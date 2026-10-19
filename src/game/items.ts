// Снаряжение героя. Предметы меняют внешность и дают игровые бонусы, но не снижают цели по повторам:
// тренировка остаётся честной.

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
  rarity: Rarity;
  // Цвет брони героя, когда предмет надет.
  color: string;
  // Свечение брони (у редких предметов).
  glow?: string;
  // Бонус к монетам за уровень, доля.
  coinBonus: number;
  price: number;
  // Продаётся у купца или только находится в сундуках.
  inShop: boolean;
}

export const ITEMS: Item[] = [
  { id: 'starter', name: 'Куртка новичка', rarity: 'common', color: '#ff5a36', coinBonus: 0, price: 0, inShop: false },
  { id: 'forest', name: 'Плащ лесника', rarity: 'common', color: '#43a047', coinBonus: 0.05, price: 120, inShop: true },
  { id: 'sky', name: 'Доспех неба', rarity: 'common', color: '#42a5f5', coinBonus: 0.05, price: 150, inShop: true },
  { id: 'iron', name: 'Железная броня', rarity: 'rare', color: '#b0bec5', coinBonus: 0.1, price: 400, inShop: true },
  { id: 'cosmo', name: 'Скафандр «Заря»', rarity: 'rare', color: '#e0f7fa', glow: '#4fc3f7', coinBonus: 0.1, price: 600, inShop: true },
  { id: 'shadow', name: 'Плащ теней', rarity: 'epic', color: '#4527a0', glow: '#7c4dff', coinBonus: 0.15, price: 1500, inShop: true },
  { id: 'zombie-hunter', name: 'Куртка охотника на зомби', rarity: 'epic', color: '#33691e', glow: '#aeea00', coinBonus: 0.15, price: 0, inShop: false },
  { id: 'crystal', name: 'Кристальный доспех', rarity: 'epic', color: '#ce93d8', glow: '#e040fb', coinBonus: 0.2, price: 0, inShop: false },
  { id: 'dragon', name: 'Чешуя дракона', rarity: 'legendary', color: '#d84315', glow: '#ff3d00', coinBonus: 0.3, price: 0, inShop: false },
  { id: 'gold', name: 'Золотая броня чемпиона', rarity: 'legendary', color: '#ffc400', glow: '#ffea00', coinBonus: 0.3, price: 5000, inShop: true },
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
