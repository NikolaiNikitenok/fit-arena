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

// Оружие и щиты собираются по отдельности и дают силу удара. Модели взяты из наборов героев KayKit.
export type Slot = 'weapon' | 'offhand';

export interface Gear {
  id: string;
  name: string;
  slot: Slot;
  // Меш в файле героя source (public/models/chars).
  mesh: string;
  source: CharName;
  rarity: Rarity;
  // Урон за повтор сверху базы.
  atk: number;
  // Прибавка к урону, доля.
  pct: number;
  // Лишние сердца в бою с боссом.
  hearts: number;
  // Двуручное оружие не даёт держать щит: его бонусы не действуют.
  twoHanded?: boolean;
  glow?: string;
  price: number;
  inShop: boolean;
  // С какой земли товар появляется у купца.
  minLand: number;
}

const W = (id: string, name: string, mesh: string, source: CharName, rarity: Rarity, atk: number, price: number, minLand: number, extra: Partial<Gear> = {}): Gear => ({
  id, name, slot: 'weapon', mesh, source, rarity, atk, pct: 0, hearts: 0, price, inShop: price > 0, minLand, ...extra,
});
const O = (id: string, name: string, mesh: string, source: CharName, rarity: Rarity, hearts: number, pct: number, price: number, minLand: number, extra: Partial<Gear> = {}): Gear => ({
  id, name, slot: 'offhand', mesh, source, rarity, atk: 0, pct, hearts, price, inShop: price > 0, minLand, ...extra,
});

export const GEAR: Gear[] = [
  W('sword', 'Меч новобранца', '1H_Sword', 'Knight', 'common', 2, 0, 0),
  W('knife', 'Кинжал ловкача', 'Knife', 'Rogue', 'common', 4, 150, 0),
  W('axe', 'Топор лесоруба', '1H_Axe', 'Barbarian', 'common', 6, 320, 1),
  W('wand', 'Палочка искр', '1H_Wand', 'Mage', 'rare', 8, 600, 2),
  W('crossbow', 'Арбалет охотника', '1H_Crossbow', 'Rogue', 'rare', 10, 950, 4),
  W('staff', 'Посох бури', '2H_Staff', 'Mage', 'rare', 14, 1400, 6, { twoHanded: true }),
  W('greatsword', 'Двуручный меч', '2H_Sword', 'Knight', 'epic', 17, 2200, 10, { twoHanded: true }),
  W('heavy-crossbow', 'Тяжёлый арбалет', '2H_Crossbow', 'Rogue', 'epic', 19, 3000, 14, { twoHanded: true }),
  W('greataxe', 'Секира вождя', '2H_Axe', 'Barbarian', 'epic', 22, 4200, 18, { twoHanded: true }),
  // Только из сундуков и за боссов.
  W('star-wand', 'Звёздная палочка', '1H_Wand', 'Mage', 'epic', 13, 0, 0, { glow: '#4fc3f7' }),
  W('dawn-blade', 'Клинок рассвета', '1H_Sword', 'Knight', 'legendary', 16, 0, 0, { glow: '#ffd54a' }),
  W('flame-axe', 'Пылающая секира', '2H_Axe', 'Barbarian', 'legendary', 27, 0, 0, { glow: '#ff3d00', twoHanded: true }),
  O('round-shield', 'Круглый щит', 'Round_Shield', 'Knight', 'common', 1, 0, 200, 0),
  O('offhand-knife', 'Второй кинжал', 'Knife_Offhand', 'Rogue', 'common', 0, 0.1, 260, 0),
  O('barb-shield', 'Щит варвара', 'Barbarian_Round_Shield', 'Barbarian', 'rare', 1, 0.05, 700, 3),
  O('spellbook', 'Книга заклинаний', 'Spellbook', 'Mage', 'rare', 0, 0.15, 1200, 6),
  O('badge-shield', 'Гербовый щит', 'Badge_Shield', 'Knight', 'rare', 1, 0.1, 1500, 8),
  O('tower-shield', 'Ростовой щит', 'Rectangle_Shield', 'Knight', 'epic', 2, 0.05, 2600, 12),
  O('spike-shield', 'Шипастый щит', 'Spike_Shield', 'Knight', 'epic', 1, 0.2, 0, 0, { glow: '#ff6e40' }),
];

export const gearById = (id: string | undefined): Gear | undefined => GEAR.find((g) => g.id === id);

// Зелья и свитки: расходуются, лежат в инвентаре стопками.
export type PotionId = 'vigor' | 'swap' | 'might';
export interface Potion {
  id: PotionId;
  name: string;
  text: string;
  color: string;
  price: number;
}
export const POTIONS: Potion[] = [
  { id: 'vigor', name: 'Зелье бодрости', text: '+1 жизнь сразу', color: '#ff6b81', price: 90 },
  { id: 'might', name: 'Эликсир силы', text: '+30% урона на следующий бой', color: '#ffb46b', price: 140 },
  { id: 'swap', name: 'Свиток замены', text: '+1 замена упражнения сегодня', color: '#7dd3fc', price: 70 },
];
export const potionById = (id: PotionId): Potion => POTIONS.find((p) => p.id === id)!;

export type Loot = { coins: number; item?: Item; gear?: Gear; potion?: PotionId };

/** Что лежит в сундуке: монеты, зелье или, реже, предмет, которого ещё нет. Чем дальше земля, тем лучше добыча. */
export function openChest(seed: number, owned: string[], land = seed - 1): Loot {
  const rnd = (n: number) => {
    const x = Math.sin(seed * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  const r = rnd(1);
  if (r < 0.3) {
    const outfits = ITEMS.filter((i) => !i.inShop && i.id !== 'starter' && !owned.includes(i.id));
    const gear = GEAR.filter((g) => !owned.includes(g.id) && (g.inShop ? g.minLand <= land + 2 : land >= 3));
    const pool = [...outfits.map((item) => ({ item })), ...gear.map((g) => ({ gear: g }))];
    if (pool.length) return { coins: 0, ...pool[Math.floor(rnd(2) * pool.length)] };
  }
  if (r < 0.65) return { coins: 0, potion: POTIONS[Math.floor(rnd(4) * POTIONS.length)].id };
  return { coins: 40 + land * 6 + Math.floor(rnd(3) * 80) };
}

/** Трофей за первую победу над боссом: снаряжение уровня этой земли. */
export function bossDrop(land: number, owned: string[]): Gear | undefined {
  const pool = GEAR.filter((g) => !owned.includes(g.id) && (g.inShop ? g.minLand <= land + 3 : land >= 3));
  if (!pool.length) return undefined;
  // Лучшее из доступного: босс — серьёзный противник.
  return pool.sort((a, b) => b.atk + b.pct * 60 + b.hearts * 4 - (a.atk + a.pct * 60 + a.hearts * 4))[0];
}

export const gearIcon = (id: string) => `${import.meta.env.BASE_URL}gear/${id}.png`;

/** Короткое описание бонусов: «+6 урона · +10% · +1 ♥ у боссов». */
export function gearText(g: Gear): string {
  const parts: string[] = [];
  if (g.atk) parts.push(`+${g.atk} урона`);
  if (g.pct) parts.push(`+${Math.round(g.pct * 100)}% урона`);
  if (g.hearts) parts.push(`+${g.hearts} ♥ против боссов`);
  if (g.twoHanded) parts.push('двуручное');
  return parts.join(' · ');
}
