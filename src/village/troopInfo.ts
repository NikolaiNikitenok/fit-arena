import { BUILDINGS, BUILDING_TYPES, Res } from '../../shared/village';
import { HEAL_RADIUS, LEVEL_BONUS, levelMul, TROOPS, TroopId, troopMul } from '../../shared/villageBattle';
import { fmtTime } from './state';

// Описание отряда для казарм: всё считается из shared/villageBattle.ts, поэтому цифры в карточке
// всегда совпадают с тем, как отряд ведёт себя в бою.

/** Число по-русски: десятичная запятая, без лишних нулей. */
export function fmtDec(n: number, digits = 1): string {
  const k = 10 ** digits;
  const r = Math.round(n * k) / k;
  return String(r).replace('.', ',');
}

export const ROLES: Record<TroopId, string> = {
  warrior: 'Пехота с мечом и щитом. Идёт к ближайшей постройке и рубит её, а стену на пути ломает. Дешёвый и быстро обучается — силён толпой.',
  archer: 'Стрелок с арбалетом. Бьёт издалека, поэтому достаёт постройки даже из-за стен. Здоровья мало — пускай вперёд воинов или великанов.',
  giant: 'Здоровяк с двуручным топором. Не отвлекается на прочие постройки: идёт прямо к башням и катапультам и принимает их удары на себя.',
  wallbreaker: 'Скелет с бомбой. Бежит к ближайшей стене и взрывается вместе с ней — задевает всё вокруг. Погибает при взрыве.',
  healer: 'Летит над стенами и лечит отряды рядом с собой, сначала раненых. Сам не атакует. Береги от башен лучников.',
};

const TARGETS: Record<string, string> = {
  any: 'Любые постройки — ближайшие',
  defense: 'Оборона: башни и катапульты',
  wall: 'Стены, потом любые постройки',
  heal: 'Свои отряды — сначала раненые',
};

export function speedLabel(cellsPerSec: number): string {
  if (cellsPerSec >= 2.2) return 'очень быстро';
  if (cellsPerSec >= 1.6) return 'быстро';
  if (cellsPerSec >= 1.3) return 'средне';
  return 'медленно';
}

export interface TroopStat {
  label: string;
  value: string;
  // Пояснение мелко под цифрой.
  note?: string;
}

export interface TroopInfo {
  id: TroopId;
  name: string;
  role: string;
  tags: string[];
  stats: TroopStat[];
  // Какие постройки по нему бьют и какие не достают.
  hitBy: string[];
  safeFrom: string[];
  cost: Partial<Res>;
  unlock: number;
  // Бонус казарм сейчас и за следующий уровень, %; что он усиливает.
  bonus: number;
  bonusWhat: string;
  perLevel: number;
  // Уровень отряда из лаборатории и его бонус, %.
  level: number;
  levelBonus: number;
  perTroopLevel: number;
}

/** Всё об отряде при казармах уровня barracks и уровне отряда level (лаборатория). */
export function troopInfo(id: TroopId, barracks: number, level = 1): TroopInfo {
  const d = TROOPS[id];
  // Так же, как в бою (unitMul): казармы × уровень отряда.
  const mul = troopMul(barracks) * levelMul(level);
  // Так же, как в бою: здоровье округляется, урон — до десятых.
  const hp = Math.round(d.hp * mul);
  const dmg = Math.round(d.damage * mul * 10) / 10;
  const ranged = d.range > 1.5;
  const stats: TroopStat[] = [{ label: 'Здоровье', value: String(hp) }];
  if (d.heal) {
    const heal = d.heal * mul;
    stats.push({ label: 'Лечение', value: `${fmtDec(heal)}/с`, note: `в радиусе ${fmtDec(HEAL_RADIUS)} кл., героя вполсилы` });
  } else if (d.splash) {
    stats.push({ label: 'Урон взрыва', value: fmtDec(dmg), note: `по стенам ×${d.wallMul ?? 1} = ${fmtDec(dmg * (d.wallMul ?? 1))}` });
    stats.push({ label: 'Радиус взрыва', value: `${fmtDec(d.splash)} кл.`, note: 'один раз — и сам погибает' });
  } else {
    stats.push({ label: 'Урон за удар', value: fmtDec(dmg) });
    stats.push({ label: 'Урон в секунду', value: fmtDec(dmg / d.every) });
    stats.push({ label: 'Удар', value: `раз в ${fmtDec(d.every)} с` });
  }
  if (!d.heal && !d.splash) stats.push({ label: 'Дальность', value: ranged ? `${fmtDec(d.range)} кл.` : 'вплотную', note: ranged ? 'дальний бой' : 'ближний бой' });
  stats.push({ label: 'Скорость', value: `${fmtDec(d.speed)} кл./с`, note: speedLabel(d.speed) });
  stats.push({ label: 'Мест в лагере', value: String(d.housing) });
  stats.push({ label: 'Обучение', value: fmtTime(d.train) });
  stats.push({ label: 'Цель', value: TARGETS[d.prefer] });

  const hitBy: string[] = [];
  const safeFrom: string[] = [];
  for (const t of BUILDING_TYPES) {
    const def = BUILDINGS[t].defense;
    if (!def || !def.damage.length) continue;
    // Как в бою: снаряды по площади (катапульта) по летающим не попадают.
    (def.splash && d.flying ? safeFrom : hitBy).push(BUILDINGS[t].name);
  }
  const tags = [d.flying ? 'Летающий' : 'Наземный', d.heal ? 'Поддержка' : d.splash ? 'Подрыв стен' : ranged ? 'Дальний бой' : 'Ближний бой'];
  if (d.prefer === 'defense') tags.push('Ломает оборону');
  return {
    id,
    name: d.name,
    role: ROLES[id],
    tags,
    stats,
    hitBy,
    safeFrom,
    cost: d.cost,
    unlock: d.unlock,
    bonus: Math.round((troopMul(barracks) - 1) * 100),
    level: Math.max(1, level),
    levelBonus: Math.round((levelMul(level) - 1) * 100),
    perTroopLevel: Math.round(LEVEL_BONUS * 100),
    bonusWhat: d.heal ? 'здоровья и лечения' : 'здоровья и урона',
    perLevel: Math.round((troopMul(2) - 1) * 100),
  };
}
