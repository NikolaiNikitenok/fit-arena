import { BUILDINGS, BUILDING_TYPES, Res } from '../../shared/village';
import { HEAL_RADIUS, LEVEL_BONUS, levelMul, TROOPS, TroopId, troopMul } from '../../shared/villageBattle';
import { fmtTime } from './state';
import { t } from '../i18n';

// Описание отряда для казарм: всё считается из shared/villageBattle.ts, поэтому цифры в карточке
// всегда совпадают с тем, как отряд ведёт себя в бою.

/** Число по-русски: десятичная запятая, без лишних нулей. */
export function fmtDec(n: number, digits = 1): string {
  const k = 10 ** digits;
  const r = Math.round(n * k) / k;
  return String(r).replace('.', ',');
}

export const ROLES: Record<TroopId, string> = {
  warrior: t('Пехота с мечом и щитом. Идёт к ближайшей постройке и рубит её, а стену на пути ломает. Дешёвый и быстро обучается — силён толпой.'),
  archer: t('Стрелок с арбалетом. Бьёт издалека, поэтому достаёт постройки даже из-за стен. Здоровья мало — пускай вперёд воинов или великанов.'),
  giant: t('Здоровяк с двуручным топором. Не отвлекается на прочие постройки: идёт прямо к башням и катапультам и принимает их удары на себя.'),
  wallbreaker: t('Скелет с бомбой. Бежит к ближайшей стене и взрывается вместе с ней — задевает всё вокруг. Погибает при взрыве.'),
  healer: t('Летит над стенами и лечит отряды рядом с собой, сначала раненых. Сам не атакует. Береги от башен лучников.'),
};

const TARGETS: Record<string, string> = {
  any: t('Любые постройки — ближайшие'),
  defense: t('Оборона: башни и катапульты'),
  wall: t('Стены, потом любые постройки'),
  heal: t('Свои отряды — сначала раненые'),
};

export function speedLabel(cellsPerSec: number): string {
  if (cellsPerSec >= 2.2) return t('очень быстро');
  if (cellsPerSec >= 1.6) return t('быстро');
  if (cellsPerSec >= 1.3) return t('средне');
  return t('медленно');
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
  const stats: TroopStat[] = [{ label: t('Здоровье'), value: String(hp) }];
  if (d.heal) {
    const heal = d.heal * mul;
    stats.push({ label: t('Лечение'), value: t('{0}/с', { 0: fmtDec(heal) }), note: t('в радиусе {0} кл., героя вполсилы', { 0: fmtDec(HEAL_RADIUS) }) });
  } else if (d.splash) {
    stats.push({ label: t('Урон взрыва'), value: fmtDec(dmg), note: t('по стенам ×{0} = {1}', { 0: d.wallMul ?? 1, 1: fmtDec(dmg * (d.wallMul ?? 1)) }) });
    stats.push({ label: t('Радиус взрыва'), value: t('{0} кл.', { 0: fmtDec(d.splash) }), note: t('один раз — и сам погибает') });
  } else {
    stats.push({ label: t('Урон за удар'), value: fmtDec(dmg) });
    stats.push({ label: t('Урон в секунду'), value: fmtDec(dmg / d.every) });
    stats.push({ label: t('Удар'), value: t('раз в {0} с', { 0: fmtDec(d.every) }) });
  }
  if (!d.heal && !d.splash) stats.push({ label: t('Дальность'), value: ranged ? t('{0} кл.', { 0: fmtDec(d.range) }) : t('вплотную'), note: ranged ? t('дальний бой') : t('ближний бой') });
  stats.push({ label: t('Скорость'), value: t('{0} кл./с', { 0: fmtDec(d.speed) }), note: speedLabel(d.speed) });
  stats.push({ label: t('Мест в лагере'), value: String(d.housing) });
  stats.push({ label: t('Обучение'), value: fmtTime(d.train) });
  stats.push({ label: t('Цель'), value: TARGETS[d.prefer] });

  const hitBy: string[] = [];
  const safeFrom: string[] = [];
  for (const tm of BUILDING_TYPES) {
    const def = BUILDINGS[tm].defense;
    if (!def || !def.damage.length) continue;
    // Как в бою: снаряды по площади (катапульта) по летающим не попадают.
    (def.splash && d.flying ? safeFrom : hitBy).push(BUILDINGS[tm].name);
  }
  const tags = [d.flying ? t('Летающий') : t('Наземный'), d.heal ? t('Поддержка') : d.splash ? t('Подрыв стен') : ranged ? t('Дальний бой') : t('Ближний бой')];
  if (d.prefer === 'defense') tags.push(t('Ломает оборону'));
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
    bonusWhat: d.heal ? t('здоровья и лечения') : t('здоровья и урона'),
    perLevel: Math.round((troopMul(2) - 1) * 100),
  };
}
