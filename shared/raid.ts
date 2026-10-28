// Рейд клана: по выходным весь клан бьёт одного огромного босса. Здоровье общее,
// урон каждого — его повторы. Награда зависит от личного урона и от того, добит ли босс.
import { t } from '../src/i18n';

const DAY = 86_400_000;
// Время рейда считаем по Москве: суббота 00:00 — понедельник 00:00.
const MSK = 3 * 3600_000;
// Первый рейд открыт с запуска кланов, чтобы его можно было попробовать сразу.
const FIRST_RAID_FROM = Date.UTC(2026, 9, 19) - MSK;

export const RAID_ATTACKS_PER_DAY = 3;
export const RAID_ATTACK_S = 60;
// Подготовка перед атакой: встать в кадр.
export const RAID_PREP_S = 5;
export const RAID_HP_PER_MEMBER = 1800;
export const RAID_MIN_MEMBERS = 3;
export const RAID_LEVEL_GROWTH = 1.15;
// Защита от подделки: урон одного повтора и темп ограничены.
export const RAID_MAX_DAMAGE = 120;
export const RAID_MIN_REP_MS = 350;

export interface RaidWindow {
  active: boolean;
  // Начало и конец ближайшего (или текущего) рейда, мс.
  start: number;
  end: number;
  // Ключ недели рейда: дата его субботы по Москве.
  key: string;
}

const mskDate = (tm: number) => new Date(tm + MSK);
const fmtKey = (tm: number) => mskDate(tm).toISOString().slice(0, 10);

export function raidWindow(now: number): RaidWindow {
  const d = mskDate(now);
  // Полночь по Москве сегодня, в реальном времени.
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - MSK;
  const dow = d.getUTCDay(); // 0 — воскресенье, 6 — суббота
  // Суббота этой недели (или вчерашняя, если сегодня воскресенье).
  const saturday = dow === 0 ? midnight - DAY : midnight + (6 - dow) * DAY;
  const end = saturday + 2 * DAY;
  // В неделю запуска рейд идёт сразу, а не с субботы.
  const start = saturday - 7 * DAY < FIRST_RAID_FROM && FIRST_RAID_FROM < saturday ? FIRST_RAID_FROM : saturday;
  return { active: now >= start && now < end, start, end, key: fmtKey(saturday) };
}

export const dayOf = (tm: number) => fmtKey(tm);

export interface RaidBoss {
  name: string;
  title: string;
  model: 'Skeleton_Warrior' | 'Skeleton_Mage' | 'Skeleton_Minion' | 'Skeleton_Rogue';
  tint: string;
  glow: string;
}

// Босс меняется каждую неделю по кругу.
export const RAID_BOSSES: RaidBoss[] = [
  { name: t('Великан Лень'), title: t('Спит на горе одеял и тянет силы из всего королевства'), model: 'Skeleton_Warrior', tint: 'mul:1.1,0.85,1.2', glow: '#b388ff' },
  { name: t('Король Прокрастин'), title: t('Обещает начать с понедельника уже тысячу лет'), model: 'Skeleton_Mage', tint: 'mul:0.8,1,1.3', glow: '#4fc3f7' },
  { name: t('Обжора Пончик'), title: t('Сладкая армия идёт за ним по пятам'), model: 'Skeleton_Minion', tint: 'mul:1.35,0.9,0.7', glow: '#ff8a65' },
  { name: t('Тень Дивана'), title: t('Правая рука Князя, мастер «ещё пять минут»'), model: 'Skeleton_Rogue', tint: 'mul:0.6,0.6,0.8', glow: '#7c4dff' },
];

export const raidBoss = (key: string): RaidBoss => {
  const weeks = Math.round((Date.parse(key) - Date.UTC(2026, 9, 24)) / (7 * DAY));
  return RAID_BOSSES[((weeks % RAID_BOSSES.length) + RAID_BOSSES.length) % RAID_BOSSES.length];
};

/** Здоровье босса: по числу участников клана и уровню рейда (растёт после каждой победы). */
export const raidHp = (members: number, level: number): number =>
  Math.round(RAID_HP_PER_MEMBER * Math.max(RAID_MIN_MEMBERS, members) * RAID_LEVEL_GROWTH ** (level - 1));

export interface RaidTier {
  id: 'none' | 'part' | 'bronze' | 'silver' | 'gold';
  name: string;
  // Доля «честной доли» урона (здоровье / участников), с которой открывается награда.
  from: number;
  coins: number;
  potions: { vigor?: number; might?: number; swap?: number };
  chest: boolean;
}

export const RAID_TIERS: RaidTier[] = [
  { id: 'none', name: t('Без награды'), from: 0, coins: 0, potions: {}, chest: false },
  { id: 'part', name: t('Участник'), from: 0.0001, coins: 40, potions: {}, chest: false },
  { id: 'bronze', name: t('Бронза'), from: 0.25, coins: 120, potions: { vigor: 1 }, chest: false },
  { id: 'silver', name: t('Серебро'), from: 0.6, coins: 260, potions: { might: 1, swap: 1 }, chest: false },
  { id: 'gold', name: t('Золото'), from: 1, coins: 450, potions: { might: 2, vigor: 1 }, chest: true },
];
// Если босс повержен: монеты удваиваются и всем, кто бил, достаётся сундук рейда.
export const KILL_COIN_FACTOR = 2;

export const fairShare = (hpMax: number, members: number) => hpMax / Math.max(RAID_MIN_MEMBERS, members);

export function raidTier(damage: number, hpMax: number, members: number): RaidTier {
  const share = damage / fairShare(hpMax, members);
  return [...RAID_TIERS].reverse().find((tm) => share >= tm.from && (tm.id !== 'none' || damage <= 0)) ?? RAID_TIERS[0];
}

export interface RaidReward {
  tier: RaidTier;
  coins: number;
  potions: { vigor?: number; might?: number; swap?: number };
  chest: boolean;
}

/** coinBonus — надбавка уровня клана к монетам, доля. */
export function raidReward(damage: number, hpMax: number, members: number, killed: boolean, coinBonus = 0): RaidReward {
  const tier = raidTier(damage, hpMax, members);
  const hit = damage > 0;
  return {
    tier,
    coins: Math.round(tier.coins * (killed && hit ? KILL_COIN_FACTOR : 1) * (1 + coinBonus)),
    potions: tier.potions,
    chest: tier.chest || (killed && hit),
  };
}
