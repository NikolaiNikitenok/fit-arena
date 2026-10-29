// Питомцы: растут от повторов игрока, ходят рядом с героем и дают небольшой бонус.
// Первый — дракончик из яйца, которое дарит Мастер Гром после первой победы; остальные
// приходят за уровень героя, дни тренировок, победы над хранителями или из лавки Фёдора.
// Бонусы скромные (до 5% урона, 10% монет или 15% шанса сундучка), чтобы питомец радовал,
// а тренировка оставалась главным.
import type { PotionId } from './items';
import { LEVELS, WORLD_SIZE } from './levels';
import type { Progress } from './progress';
import { t } from '../i18n';

export type PetId = 'dragon' | 'cat' | 'owl' | 'wolf' | 'bug' | 'hedgehog';

// Чем помогает питомец: доля к урону, доля к монетам за победу, шанс найти сундучок после победы.
export interface PetBonus {
  damage: number;
  coins: number;
  chest: number;
}

export type PetUnlock =
  | { kind: 'egg' }
  | { kind: 'hero'; level: number }
  | { kind: 'days'; days: number }
  | { kind: 'boss' }
  | { kind: 'space' }
  | { kind: 'shop'; price: number };

export interface PetDef {
  id: PetId;
  // Вид («Дракончик») и кличка по умолчанию.
  kind: string;
  name: string;
  color: string;
  accent: string;
  // Бонус на 20-м уровне; на 1-м — пятая часть.
  max: Partial<PetBonus>;
  unlock: PetUnlock;
  text: string;
}

export const PETS: PetDef[] = [
  { id: 'dragon', kind: t('Дракончик'), name: t('Искра'), color: '#5fd39a', accent: '#ffd36b', max: { damage: 0.05 }, unlock: { kind: 'egg' }, text: t('Вылупился из яйца Мастера Грома. Дышит искрами, когда ты бьёшь.') },
  { id: 'cat', kind: t('Котик'), name: t('Пирожок'), color: '#ffad5c', accent: '#fff1dc', max: { coins: 0.1 }, unlock: { kind: 'hero', level: 5 }, text: t('Живёт у бабушки Марфы. Находит монетки там, где ты их не заметил.') },
  { id: 'owl', kind: t('Совёнок'), name: t('Ночка'), color: '#a98a6d', accent: '#ffcf70', max: { chest: 0.15 }, unlock: { kind: 'days', days: 7 }, text: t('Видит с высоты, где спрятаны сундучки.') },
  { id: 'wolf', kind: t('Волчонок'), name: t('Серый'), color: '#9aa7bd', accent: '#e9eef7', max: { damage: 0.03, coins: 0.04 }, unlock: { kind: 'boss' }, text: t('Прибился после первого хранителя. Рычит на врагов и тащит добычу.') },
  { id: 'bug', kind: t('Робо-жук'), name: t('Винтик'), color: '#6fb8ff', accent: '#7dffea', max: { damage: 0.02, chest: 0.08 }, unlock: { kind: 'space' }, text: t('Собран БИП-7 на станции. Сканирует сундучки и подсказывает слабые места.') },
  { id: 'hedgehog', kind: t('Ёжик'), name: t('Колючка'), color: '#b07a52', accent: '#f6dcc0', max: { coins: 0.06, chest: 0.08 }, unlock: { kind: 'shop', price: 450 }, text: t('Купец Фёдор возит его в корзинке. Носит на иголках монетки и яблоки.') },
];

export const petById = (id: PetId | undefined): PetDef | undefined => PETS.find((p) => p.id === id);

export interface PetState {
  // Яйцо Мастера Грома уже вылупилось.
  hatched?: boolean;
  // Купленные питомцы (остальные открываются сами).
  bought?: PetId[];
  active?: PetId;
  names?: Partial<Record<PetId, string>>;
  xp?: Partial<Record<PetId, number>>;
  // День (YYYY-MM-DD), когда питомец получил лакомство за первую тренировку.
  fed?: string;
  // Питомцы, которых игрок уже видел на экране питомцев: для метки «новый».
  seen?: PetId[];
}

export const MAX_PET_LEVEL = 20;
// Опыт: 1 повтор = 1 опыт активному питомцу, лакомство дня — ещё 20.
export const TREAT_XP = 20;
export const petXpToNext = (n: number) => 30 + 15 * n;

export function petLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = Math.max(0, xp);
  while (level < MAX_PET_LEVEL && left >= petXpToNext(level)) left -= petXpToNext(level++);
  return level >= MAX_PET_LEVEL ? { level, into: 1, need: 1 } : { level, into: left, need: petXpToNext(level) };
}

// Три облика: малыш, подросток, взрослый — размер и новые детали.
export const STAGE_NAMES = [t('малыш'), t('подросток'), t('взрослый')] as const;
export const petStage = (level: number): 0 | 1 | 2 => (level >= 14 ? 2 : level >= 7 ? 1 : 0);

/** Бонус питомца на этом уровне: от пятой части до полного к 20-му. */
export function petBonusAt(def: PetDef, level: number): PetBonus {
  const k = 0.2 + (0.8 * (Math.min(MAX_PET_LEVEL, level) - 1)) / (MAX_PET_LEVEL - 1);
  const v = (x?: number) => Math.round((x ?? 0) * k * 1000) / 1000;
  return { damage: v(def.max.damage), coins: v(def.max.coins), chest: v(def.max.chest) };
}

const NO_BONUS: PetBonus = { damage: 0, coins: 0, chest: 0 };

const dayKey = (tm: number): string => {
  const d = new Date(tm);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Сколько дней назад была последняя тренировка (0 — сегодня). */
export function daysSinceTraining(days: Record<string, number>, now: number): number {
  for (let i = 0; i < 400; i++) if (days[dayKey(now - i * 86400000)]) return i;
  return Infinity;
}

export type PetMood = 'happy' | 'hungry' | 'sad';
// Один день отдыха питомец понимает; два дня без тренировок подряд — грустит и не помогает.
export const SAD_AFTER_DAYS = 3;

/** Настроение: сыт (тренировка сегодня), ждёт лакомства или грустит после двух пропущенных дней. */
export function petMood(p: Progress, now: number): PetMood {
  const since = daysSinceTraining(p.days, now);
  if (since === 0) return 'happy';
  return since >= SAD_AFTER_DAYS && since !== Infinity ? 'sad' : 'hungry';
}

const bossBeaten = (p: Progress) => LEVELS.some((l) => l.type === 'boss' && (p.stars[l.id] ?? 0) > 0);
const trainedDays = (p: Progress) => Object.values(p.days).filter((n) => n > 0).length;

/** Открыт ли питомец: яйцо вылупилось, условие выполнено или питомец куплен. */
export function petOpen(p: Progress, def: PetDef, heroLvl: number): boolean {
  const u = def.unlock;
  switch (u.kind) {
    case 'egg':
      return !!p.pets?.hatched;
    case 'hero':
      return heroLvl >= u.level;
    case 'days':
      return trainedDays(p) >= u.days;
    case 'boss':
      return bossBeaten(p);
    // Космос открывается победой над последним хранителем королевства.
    case 'space':
      return (p.stars[WORLD_SIZE] ?? 0) > 0;
    case 'shop':
      return !!p.pets?.bought?.includes(def.id);
  }
}

/** Как открыть питомца и насколько игрок близок к этому. */
export function unlockText(p: Progress, def: PetDef, heroLvl: number): string {
  const u = def.unlock;
  switch (u.kind) {
    case 'egg':
      return t('Яйцо подарит Мастер Гром после первой победы');
    case 'hero':
      return t('Уровень героя {0} (сейчас {1})', { 0: u.level, 1: heroLvl });
    case 'days':
      return t('Тренируйся {0} разных дней (уже {1})', { 0: u.days, 1: Math.min(u.days, trainedDays(p)) });
    case 'boss':
      return t('Победи первого хранителя земли');
    case 'space':
      return t('Открой космос: победи хранителя последней земли королевства');
    case 'shop':
      return t('Купец Фёдор отдаст за {0} монет', { 0: u.price });
  }
}

export const openPets = (p: Progress, heroLvl: number): PetDef[] => PETS.filter((d) => petOpen(p, d, heroLvl));
export const petName = (p: Progress, id: PetId): string => p.pets?.names?.[id] || petById(id)!.name;
export const petXp = (p: Progress, id: PetId): number => p.pets?.xp?.[id] ?? 0;

/** Питомцы, которые открылись, но игрок их ещё не видел. */
export const newPets = (p: Progress, heroLvl: number): PetId[] => openPets(p, heroLvl).filter((d) => !p.pets?.seen?.includes(d.id)).map((d) => d.id);

/** Бонус активного питомца сейчас: грустный питомец не помогает. */
export function petBonus(p: Progress, now: number): PetBonus {
  const def = petById(p.pets?.active);
  if (!def || petMood(p, now) === 'sad') return NO_BONUS;
  return petBonusAt(def, petLevel(petXp(p, def.id)).level);
}

/** Короткая подпись бонуса: «+3% урона · +6% монет». */
export function bonusText(b: PetBonus): string {
  const pct = (x: number) => `${Math.round(x * 1000) / 10}`.replace('.', ',');
  const parts: string[] = [];
  if (b.damage) parts.push(t('+{0}% урона', { 0: pct(b.damage) }));
  if (b.coins) parts.push(t('+{0}% монет', { 0: pct(b.coins) }));
  if (b.chest) parts.push(t('{0}% шанс сундучка', { 0: pct(b.chest) }));
  return parts.join(' · ');
}

// Всё, что меняет питомцев, возвращает новый прогресс без сохранения: сохраняет вызывающий.
const withPets = (p: Progress, pets: PetState): Progress => ({ ...p, pets: { ...p.pets, ...pets } });

/** Яйцо можно получить после первой победы. */
export const canHatch = (p: Progress): boolean => !p.pets?.hatched && Object.keys(p.stars).length > 0;

export const cleanName = (name: string, fallback: string): string => name.replace(/\s+/g, ' ').trim().slice(0, 14) || fallback;

export function hatchEgg(p: Progress, name: string): Progress {
  if (p.pets?.hatched) return p;
  const def = petById('dragon')!;
  return withPets(p, { hatched: true, active: p.pets?.active ?? 'dragon', names: { ...p.pets?.names, dragon: cleanName(name, def.name) }, seen: [...new Set([...(p.pets?.seen ?? []), 'dragon' as PetId])] });
}

export function choosePet(p: Progress, id: PetId, heroLvl: number): Progress | null {
  const def = petById(id);
  if (!def || !petOpen(p, def, heroLvl)) return null;
  return withPets(p, { active: id });
}

export function renamePet(p: Progress, id: PetId, name: string): Progress {
  return withPets(p, { names: { ...p.pets?.names, [id]: cleanName(name, petById(id)!.name) } });
}

export function buyPet(p: Progress, id: PetId): Progress | null {
  const def = petById(id);
  if (!def || def.unlock.kind !== 'shop' || p.pets?.bought?.includes(id) || p.coins < def.unlock.price) return null;
  return withPets({ ...p, coins: p.coins - def.unlock.price }, { bought: [...(p.pets?.bought ?? []), id], active: id });
}

export const markPetsSeen = (p: Progress, ids: PetId[]): Progress => withPets(p, { seen: [...new Set([...(p.pets?.seen ?? []), ...ids])] });

/** Повторы игрока: опыт активному питомцу, а первая тренировка дня — ещё и лакомство. */
export function feedPet(p: Progress, reps: number, now: number): Progress {
  const id = p.pets?.active;
  if (!id || reps <= 0) return p;
  const date = dayKey(now);
  const treat = p.pets?.fed === date ? 0 : TREAT_XP;
  return withPets(p, { xp: { ...p.pets?.xp, [id]: petXp(p, id) + reps + treat }, fed: date });
}

export interface PetFind {
  coins: number;
  potion?: PotionId;
}

/** После победы питомец может найти сундучок: немного монет, иногда зелье. */
export function rollPetFind(p: Progress, land: number, now: number, rand: () => number = Math.random): PetFind | null {
  const chance = petBonus(p, now).chest;
  if (!chance || rand() >= chance) return null;
  const coins = 10 + land * 3;
  const r = rand();
  return { coins, potion: r < 0.15 ? 'vigor' : r < 0.25 ? 'might' : undefined };
}

/** Что нужно 3D-сцене: какой питомец, облик и настроение. */
export interface PetLook {
  id: PetId;
  stage: 0 | 1 | 2;
  sad: boolean;
  name: string;
}

export function petLook(p: Progress, now: number): PetLook | undefined {
  const id = p.pets?.active;
  if (!id || !petById(id)) return undefined;
  return { id, stage: petStage(petLevel(petXp(p, id)).level), sad: petMood(p, now) === 'sad', name: petName(p, id) };
}
