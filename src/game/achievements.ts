// Достижения: считаются из прогресса, за каждое — монеты и титул, который можно носить под именем героя.
import type { Exercise } from '../repCounter';
import { gearById, itemById } from './items';
import { LEVELS } from './levels';
import { type Progress, streakOf } from './progress';
import { programById, type ProgramId } from './programs';
import { dungeonOf } from './match3/dungeon';
import { COLLECTIONS, collectionOwned } from './collections';
import { FIRST_YEAR, HOLIDAYS, holidayKey, yearOf } from './holidayDefs';
import { t } from '../i18n';

export type AchTier = 'bronze' | 'silver' | 'gold' | 'legend';
export type AchIcon = 'flame' | 'rep' | 'crown' | 'skull' | 'star' | 'map' | 'arm' | 'leg' | 'core' | 'banner' | 'gem' | 'scroll';

export interface Achievement {
  id: string;
  title: string;
  text: string;
  icon: AchIcon;
  tier: AchTier;
  coins: number;
  // Текущее значение и цель: для полоски прогресса.
  value: (p: Progress, now: number) => number;
  goal: number;
  // Получить можно только в своё время (праздник, праздничный год): в списке видно, лишь когда получено.
  limited?: boolean;
}

const totalReps = (p: Progress) => Object.values(p.days).reduce((a, b) => a + b, 0);
const bestDay = (p: Progress) => Math.max(0, ...Object.values(p.days));
const bossesBeaten = (p: Progress) => LEVELS.filter((l) => l.type === 'boss' && p.stars[l.id]).length;
const worldDone = (p: Progress, world: number) => LEVELS.filter((l) => l.world === world && !l.daily).every((l) => p.stars[l.id]);
const threeStars = (p: Progress) => Object.values(p.stars).filter((s) => s >= 3).length;
const best = (ex: Exercise) => (p: Progress) => p.best[ex]?.reps ?? 0;
// Самая длинная серия за всё время не хранится, поэтому берём текущую: её и надо удержать.
const series = (p: Progress, now: number) => streakOf(p, now).days;
const legendary = (p: Progress) => p.items.filter((id) => (gearById(id) ?? itemById(id))?.rarity === 'legendary').length;

const PROGRAM_TITLES: [ProgramId, string, AchIcon, AchTier][] = [
  ['newbie14', t('В форме'), 'star', 'silver'],
  ['pushup100', t('Сотник'), 'arm', 'gold'],
  ['abs21', t('Стальной пресс'), 'core', 'gold'],
  ['legs28', t('Богатырь'), 'leg', 'gold'],
  ['plank5', t('Каменная плита'), 'core', 'legend'],
  ['full4w', t('Атлет Грома'), 'crown', 'legend'],
];

const HOLIDAY_ICON: Record<string, AchIcon> = { pumpkin: 'flame', winter: 'gem', spring: 'star', summer: 'crown' };

const TIER_COINS: Record<AchTier, number> = { bronze: 50, silver: 150, gold: 400, legend: 1000 };
const a = (id: string, title: string, text: string, icon: AchIcon, tier: AchTier, goal: number, value: Achievement['value']): Achievement => ({ id, title, text, icon, tier, goal, value, coins: TIER_COINS[tier] });

export const ACHIEVEMENTS: Achievement[] = [
  a('first', t('Первый шаг'), t('Сделай первый повтор'), 'rep', 'bronze', 1, totalReps),
  a('reps500', t('Пятисотник'), t('500 повторов за всё время'), 'rep', 'bronze', 500, totalReps),
  a('reps2k', t('Тысячник'), t('2000 повторов за всё время'), 'rep', 'silver', 2000, totalReps),
  a('reps10k', t('Неутомимый'), t('10 000 повторов за всё время'), 'rep', 'gold', 10000, totalReps),
  a('reps50k', t('Живая легенда'), t('50 000 повторов за всё время'), 'rep', 'legend', 50000, totalReps),
  a('day100', t('Сто за день'), t('100 повторов за один день'), 'flame', 'bronze', 100, bestDay),
  a('day300', t('Марафонец'), t('300 повторов за один день'), 'flame', 'silver', 300, bestDay),
  a('day600', t('Буря'), t('600 повторов за один день'), 'flame', 'gold', 600, bestDay),
  a('week', t('Неделя без пропусков'), t('Серия 7 дней'), 'flame', 'silver', 7, series),
  a('month', t('Месяц силы'), t('Серия 30 дней'), 'flame', 'gold', 30, series),
  a('season', t('Железная воля'), t('Серия 100 дней'), 'flame', 'legend', 100, series),
  a('boss1', t('Победитель хранителя'), t('Победи первого босса'), 'skull', 'bronze', 1, bossesBeaten),
  a('boss10', t('Охотник на хранителей'), t('Победи 10 боссов'), 'skull', 'silver', 10, bossesBeaten),
  a('boss30', t('Гроза хранителей'), t('Победи всех 30 боссов'), 'skull', 'gold', 30, bossesBeaten),
  a('stars50', t('Отличник'), t('50 уровней на три звезды'), 'star', 'silver', 50, threeStars),
  a('stars200', t('Безупречный'), t('200 уровней на три звезды'), 'star', 'gold', 200, threeStars),
  a('world0', t('Освободитель королевства'), t('Пройди все 100 уровней королевства'), 'map', 'gold', 1, (p) => Number(worldDone(p, 0))),
  a('world1', t('Покоритель космоса'), t('Пройди все 100 уровней космоса'), 'map', 'gold', 1, (p) => Number(worldDone(p, 1))),
  a('world2', t('Гроза зомби'), t('Пройди все 100 уровней зомби-мира'), 'map', 'gold', 1, (p) => Number(worldDone(p, 2))),
  a('knyaz', t('Победитель Дивана'), t('Одолей Князя Дивана'), 'crown', 'legend', 1, (p) => Number(!!p.stars[LEVELS.length])),
  a('arms', t('Стальные руки'), t('30 отжиманий за один подход'), 'arm', 'silver', 30, best('pushup')),
  a('legs', t('Ноги-пружины'), t('60 приседаний за один подход'), 'leg', 'silver', 60, best('squat')),
  a('core', t('Пресс-кубики'), t('50 повторов на пресс за один подход'), 'core', 'silver', 50, best('situp')),
  a('daily10', t('Добрый сосед'), t('Выполни 10 заданий дня'), 'scroll', 'silver', 10, (p) => p.dailyCount ?? 0),
  a('daily50', t('Любимец Атлетии'), t('Выполни 50 заданий дня'), 'scroll', 'gold', 50, (p) => p.dailyCount ?? 0),
  a('raid', t('Рейдер'), t('Получи награду клана за рейд-босса'), 'banner', 'bronze', 1, (p) => p.raidClaimed?.length ?? 0),
  a('raid10', t('Ветеран рейдов'), t('10 наград за рейды'), 'banner', 'gold', 10, (p) => p.raidClaimed?.length ?? 0),
  a('legendary', t('Легенда арсенала'), t('Добудь легендарную вещь'), 'gem', 'gold', 1, legendary),
  a('plank60', t('Несгибаемый'), t('Минута в планке за один подход'), 'core', 'bronze', 60, best('plank')),
  a('plank180', t('Скала'), t('Три минуты в планке за один подход'), 'core', 'gold', 180, best('plank')),
  // Подземелье «три в ряд»: этажи, хранители и комбо.
  a('dungeon10', t('Спелеолог'), t('Пройди 10 этажей подземелья'), 'gem', 'bronze', 10, (p) => Object.keys(dungeonOf(p).stars).length),
  a('dungeonBoss', t('Гроза подземелий'), t('Победи трёх хранителей подземелья'), 'skull', 'silver', 3, (p) => dungeonOf(p).bosses.length),
  a('combo6', t('Цепная реакция'), t('Комбо ×6 в подземелье'), 'flame', 'silver', 6, (p) => dungeonOf(p).bestCombo),
  // Титулы за программы тренировок Мастера Грома.
  ...PROGRAM_TITLES.map(([id, title, icon, tier]) => a(`prog-${id}`, title, t('Пройди программу «{0}»', { 0: programById(id)!.title }), icon, tier, 1, (p) => Number(!!p.programs?.done.includes(id)))),
  // Титулы за собранные коллекции обликов (src/game/collections.ts).
  ...COLLECTIONS.map((c) => ({
    ...a(`col-${c.id}`, c.title, t('Собери коллекцию «{0}»', { 0: c.name }), 'gem', c.limited ? 'legend' : c.items.length >= 6 ? 'gold' : 'silver', c.items.length, (p) => collectionOwned(c, p)),
    limited: c.limited,
  })),
  // Титулы праздников (src/game/holidays.ts): выдаются с дорожки праздника, монет за них нет.
  ...HOLIDAYS.flatMap((h) =>
    h.outfits.map((_, i) => {
      const year = yearOf(h, FIRST_YEAR + i);
      const key = holidayKey(h.id, year);
      return { ...a(`hol-${key}`, `${h.hero} ${year}`, t('Пройди дорожку праздника «{0}» {1}', { 0: h.name, 1: year }), HOLIDAY_ICON[h.id], 'legend', 1, (p) => Number(!!p.achClaimed?.includes(`hol-${key}`))), coins: 0, limited: true };
    }),
  ),
];

/** Достижения в списке: праздничные — только полученные. */
export const visibleAchievements = (p: Progress, now: number) => ACHIEVEMENTS.filter((x) => !x.limited || achDone(x, p, now));

export const achDone = (ach: Achievement, p: Progress, now: number) => ach.value(p, now) >= ach.goal;

/** Выполненные, но ещё не отмеченные достижения: про них покажем «Новое достижение». */
export const newAchievements = (p: Progress, now: number) => ACHIEVEMENTS.filter((x) => !p.achSeen?.includes(x.id) && achDone(x, p, now));

/** Титул под именем героя: выбранный или последний полученный. */
export function heroBadge(p: Progress): Achievement | undefined {
  return ACHIEVEMENTS.find((x) => x.id === p.title && p.achClaimed?.includes(x.id));
}
