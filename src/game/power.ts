// Сила героя и здоровье врагов. Урон за повтор растёт с уровнем героя и оружием, здоровье врагов —
// с номером уровня и с реальной формой игрока. Сильный герой экономит не больше 20% повторов:
// прокачка ощутима, но тренировка остаётся настоящей.
import type { HandGear } from '../three/Character';
import { gearById } from './items';
import { LevelDef } from './levels';
import { petBonus } from './pets';
import { heroLevel, heroXp, Progress } from './progress';
import { villageBonus } from '../../shared/village';

export const BASE_DAMAGE = 10;
export const BOSS_HEARTS = 3;
// Сколько повторов от обычной цели может сэкономить сильный герой и сколько добавить слабый.
export const MIN_SHARE = 0.8;
export const MAX_SHARE = 1.3;
export const MIGHT_BONUS = 0.3;

export interface Power {
  damage: number;
  // Из чего сложился урон: для экрана героя.
  level: number;
  atk: number;
  pct: number;
  hearts: number;
  offhandOff: boolean;
  // Сколько из pct добавил питомец.
  pet: number;
}

export function heroPower(p: Progress, might = false, now = Date.now()): Power {
  const level = heroLevel(heroXp(p)).level;
  const weapon = gearById(p.weapon);
  const offhand = gearById(p.offhand);
  // Двуручное оружие занимает обе руки: щит или книга не действуют.
  const offhandOff = !!weapon?.twoHanded && !!offhand;
  const usable = offhandOff ? undefined : offhand;
  const atk = (weapon?.atk ?? 0) + (usable?.atk ?? 0);
  // Питомец добавляет пару процентов: прибавка к проценту, а не к базе, чтобы не раздувать урон.
  const pet = petBonus(p, now).damage;
  // Кузница деревни: +1% за уровень (src/village).
  const forge = villageBonus(p.village?.b).damage;
  const pct = (usable?.pct ?? 0) + (weapon?.pct ?? 0) + (might ? MIGHT_BONUS : 0) + pet + forge;
  const damage = Math.round((BASE_DAMAGE + level + atk) * (1 + pct));
  return { damage, level, atk, pct, hearts: BOSS_HEARTS + (usable?.hearts ?? 0), offhandOff, pet };
}

// Какой урон ожидаем от героя к этому уровню игры: уровень героя по типичному опыту
// и оружие средней цены, которое к тому времени есть у купца. Планка — секира вождя (+22):
// дорогие эпические и легендарные вещи дают преимущество (до тех же 20% повторов),
// но не поднимают здоровье врагов для всех.
const XP_PER_LEVEL_TYPICAL = 45;
export const PAR_ATK = 22;
const bestShopAtk = PAR_ATK;

export function expectedDamage(levelId: number): number {
  const level = heroLevel(XP_PER_LEVEL_TYPICAL * levelId).level;
  const atk = 2 + (bestShopAtk - 2) * (1 - Math.exp(-levelId / 90));
  return BASE_DAMAGE + level + atk;
}

// Чем дальше, тем чуть труднее: до +20% здоровья к концу игры поверх роста нагрузки.
const lateGame = (levelId: number) => 1 + levelId / 1500;

/** Здоровье врага (или «работа» миссии) для обычной цели в повторах. */
export const enemyHp = (level: LevelDef, baseReps: number): number => Math.round(baseReps * expectedDamage(level.id) * lateGame(level.id));

/** Сколько повторов нужно этому герою: здоровье делим на урон, но в пределах 80–130% обычной цели. */
export function repsFor(baseReps: number, hp: number, damage: number): number {
  const raw = Math.ceil(hp / damage);
  return Math.max(3, Math.min(Math.ceil(baseReps * MAX_SHARE), Math.max(Math.ceil(baseReps * MIN_SHARE), raw)));
}

/** Что держит герой в руках: для 3D-модели. */
export function heroHands(p: Progress): { weapon?: HandGear; offhand?: HandGear } {
  const weapon = gearById(p.weapon);
  const offhand = gearById(p.offhand);
  const hand = (g: typeof weapon) => g && { mesh: g.mesh, source: g.source, glow: g.glow, tint: g.tint, bone: g.bone };
  return { weapon: hand(weapon), offhand: weapon?.twoHanded ? undefined : hand(offhand) };
}
