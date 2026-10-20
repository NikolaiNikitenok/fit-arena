import { beforeEach, describe, expect, it } from 'vitest';
import { LEVELS, WORLD_SIZE } from './levels';
import {
  buyPet,
  canHatch,
  choosePet,
  feedPet,
  hatchEgg,
  MAX_PET_LEVEL,
  newPets,
  petBonus,
  petBonusAt,
  petById,
  petLevel,
  petLook,
  petMood,
  petName,
  petOpen,
  PETS,
  petStage,
  petXp,
  renamePet,
  rollPetFind,
  TREAT_XP,
} from './pets';
import { heroPower } from './power';
import { dayKey, loadProgress, Progress, recordActivity, recordWin } from './progress';

const DAY = 86400000;
const NOW = new Date(2026, 9, 19, 12).getTime();

beforeEach(() => {
  const store: Record<string, string> = {};
  globalThis.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) } as unknown as Storage;
});

const withDragon = (xp = 0, trainedAgo = 0): Progress => {
  const p = hatchEgg({ ...loadProgress(), stars: { 1: 3 } }, 'Искра');
  return { ...p, days: { [dayKey(NOW - trainedAgo * DAY)]: 10 }, pets: { ...p.pets, xp: { dragon: xp } } };
};

describe('питомцы', () => {
  it('яйцо вылупляется после первой победы, один раз, кличка чистится', () => {
    expect(canHatch(loadProgress())).toBe(false);
    const won = { ...loadProgress(), stars: { 1: 2 } };
    expect(canHatch(won)).toBe(true);
    const p = hatchEgg(won, '   Огонёк   ');
    expect(p.pets?.active).toBe('dragon');
    expect(petName(p, 'dragon')).toBe('Огонёк');
    expect(canHatch(p)).toBe(false);
    expect(hatchEgg(p, 'Другое')).toBe(p);
    expect(petName(renamePet(p, 'dragon', ''), 'dragon')).toBe('Искра');
    expect(petName(renamePet(p, 'dragon', 'Очень-очень-длинное имя'), 'dragon')).toHaveLength(14);
  });

  it('уровни 1–20 и три облика', () => {
    expect(petLevel(0)).toMatchObject({ level: 1, into: 0 });
    expect(petLevel(44).level).toBe(1);
    expect(petLevel(45).level).toBe(2);
    expect(petLevel(1e9).level).toBe(MAX_PET_LEVEL);
    expect([1, 6, 7, 13, 14, 20].map(petStage)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('бонус растёт с уровнем и остаётся скромным', () => {
    const dragon = petById('dragon')!;
    expect(petBonusAt(dragon, 1).damage).toBeCloseTo(0.01);
    expect(petBonusAt(dragon, 20).damage).toBeCloseTo(0.05);
    for (const d of PETS) {
      const b = petBonusAt(d, 20);
      expect(b.damage).toBeLessThanOrEqual(0.05);
      expect(b.coins).toBeLessThanOrEqual(0.1);
      expect(b.chest).toBeLessThanOrEqual(0.15);
      expect(b.damage + b.coins + b.chest).toBeGreaterThan(0);
    }
  });

  it('повторы — опыт активному, первая тренировка дня — лакомство', () => {
    let p = withDragon();
    p = { ...p, pets: { ...p.pets, fed: undefined } };
    p = feedPet(p, 10, NOW);
    expect(petXp(p, 'dragon')).toBe(10 + TREAT_XP);
    p = feedPet(p, 5, NOW + 1000);
    expect(petXp(p, 'dragon')).toBe(15 + TREAT_XP);
    p = feedPet(p, 5, NOW + DAY);
    expect(petXp(p, 'dragon')).toBe(20 + 2 * TREAT_XP);
    // Без питомца ничего не меняется.
    const none = loadProgress();
    expect(feedPet(none, 10, NOW)).toBe(none);
  });

  it('recordActivity кормит питомца', () => {
    const p = recordActivity({ ...withDragon(), pets: { ...withDragon().pets, fed: undefined } }, 'squat', 12, NOW);
    expect(petXp(p, 'dragon')).toBe(12 + TREAT_XP);
  });

  it('настроение: сыт сегодня, ждёт после отдыха, грустит после двух пропущенных дней — и без бонуса', () => {
    expect(petMood(withDragon(0, 0), NOW)).toBe('happy');
    expect(petMood(withDragon(0, 1), NOW)).toBe('hungry');
    expect(petMood(withDragon(0, 2), NOW)).toBe('hungry');
    expect(petMood(withDragon(0, 3), NOW)).toBe('sad');
    expect(petBonus(withDragon(0, 1), NOW).damage).toBeCloseTo(0.01);
    expect(petBonus(withDragon(0, 3), NOW).damage).toBe(0);
    expect(petLook(withDragon(0, 3), NOW)?.sad).toBe(true);
  });

  it('урон героя учитывает питомца', () => {
    const base = heroPower({ ...loadProgress(), stars: { 1: 3 } }, false, NOW);
    const p = withDragon(1e9);
    const pw = heroPower(p, false, NOW);
    expect(pw.pet).toBeCloseTo(0.05);
    expect(pw.damage).toBe(Math.round((10 + pw.level + 2) * 1.05));
    expect(base.pet).toBe(0);
  });

  it('открытие: уровень героя, дни, хранитель, космос, лавка', () => {
    const p = loadProgress();
    const cat = petById('cat')!;
    expect(petOpen(p, cat, 4)).toBe(false);
    expect(petOpen(p, cat, 5)).toBe(true);
    const days = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [dayKey(NOW - i * DAY), 5]));
    expect(petOpen({ ...p, days }, petById('owl')!, 1)).toBe(true);
    const boss = LEVELS.find((l) => l.type === 'boss')!;
    expect(petOpen({ ...p, stars: { [boss.id]: 1 } }, petById('wolf')!, 1)).toBe(true);
    expect(petOpen({ ...p, stars: { [WORLD_SIZE]: 1 } }, petById('bug')!, 1)).toBe(true);
    expect(choosePet(p, 'cat', 1)).toBeNull();
    expect(choosePet(p, 'cat', 5)?.pets?.active).toBe('cat');
    expect(newPets(p, 5)).toEqual(['cat']);
    expect(buyPet({ ...p, coins: 100 }, 'hedgehog')).toBeNull();
    const bought = buyPet({ ...p, coins: 500 }, 'hedgehog')!;
    expect(bought.coins).toBe(50);
    expect(bought.pets?.active).toBe('hedgehog');
    expect(buyPet(bought, 'hedgehog')).toBeNull();
    expect(buyPet({ ...p, coins: 9999 }, 'cat')).toBeNull();
  });

  it('сундучок после победы: шанс по бонусу, монеты по земле', () => {
    const owl: Progress = { ...withDragon(), pets: { active: 'owl', xp: { owl: 1e9 } } };
    expect(rollPetFind(owl, 4, NOW, () => 0.1)).toEqual({ coins: 22, potion: 'vigor' });
    expect(rollPetFind(owl, 4, NOW, () => 0.2)).toBeNull();
    expect(rollPetFind(withDragon(), 4, NOW, () => 0)).toBeNull();
  });

  it('монеты за победу: котик добавляет процент', () => {
    const level = LEVELS.find((l) => l.type === 'build')!;
    // recordWin смотрит на настоящее время: тренировка сегодня, питомец сыт.
    const cat: Progress = { ...withDragon(), days: { [dayKey(Date.now())]: 10 }, pets: { active: 'cat', xp: { cat: 1e9 } } };
    const plain = recordWin({ ...withDragon(), pets: undefined }, level, 2).reward.coins;
    expect(recordWin(cat, level, 2).reward.coins).toBe(Math.round(level.coins * 1.1));
    expect(plain).toBe(level.coins);
  });
});
