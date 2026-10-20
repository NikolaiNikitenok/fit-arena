// Достижения: считаются из прогресса, за каждое — монеты и титул, который можно носить под именем героя.
import type { Exercise } from '../repCounter';
import { gearById, itemById } from './items';
import { LEVELS } from './levels';
import { type Progress, streak } from './progress';

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
}

const totalReps = (p: Progress) => Object.values(p.days).reduce((a, b) => a + b, 0);
const bestDay = (p: Progress) => Math.max(0, ...Object.values(p.days));
const bossesBeaten = (p: Progress) => LEVELS.filter((l) => l.type === 'boss' && p.stars[l.id]).length;
const worldDone = (p: Progress, world: number) => LEVELS.filter((l) => l.world === world && !l.daily).every((l) => p.stars[l.id]);
const threeStars = (p: Progress) => Object.values(p.stars).filter((s) => s >= 3).length;
const best = (ex: Exercise) => (p: Progress) => p.best[ex]?.reps ?? 0;
// Самая длинная серия за всё время не хранится, поэтому берём текущую: её и надо удержать.
const series = (p: Progress, now: number) => streak(p.days, now).days;
const legendary = (p: Progress) => p.items.filter((id) => (gearById(id) ?? itemById(id))?.rarity === 'legendary').length;

const TIER_COINS: Record<AchTier, number> = { bronze: 50, silver: 150, gold: 400, legend: 1000 };
const a = (id: string, title: string, text: string, icon: AchIcon, tier: AchTier, goal: number, value: Achievement['value']): Achievement => ({ id, title, text, icon, tier, goal, value, coins: TIER_COINS[tier] });

export const ACHIEVEMENTS: Achievement[] = [
  a('first', 'Первый шаг', 'Сделай первый повтор', 'rep', 'bronze', 1, totalReps),
  a('reps500', 'Пятисотник', '500 повторов за всё время', 'rep', 'bronze', 500, totalReps),
  a('reps2k', 'Тысячник', '2000 повторов за всё время', 'rep', 'silver', 2000, totalReps),
  a('reps10k', 'Неутомимый', '10 000 повторов за всё время', 'rep', 'gold', 10000, totalReps),
  a('reps50k', 'Живая легенда', '50 000 повторов за всё время', 'rep', 'legend', 50000, totalReps),
  a('day100', 'Сто за день', '100 повторов за один день', 'flame', 'bronze', 100, bestDay),
  a('day300', 'Марафонец', '300 повторов за один день', 'flame', 'silver', 300, bestDay),
  a('day600', 'Буря', '600 повторов за один день', 'flame', 'gold', 600, bestDay),
  a('week', 'Неделя без пропусков', 'Серия 7 дней', 'flame', 'silver', 7, series),
  a('month', 'Месяц силы', 'Серия 30 дней', 'flame', 'gold', 30, series),
  a('season', 'Железная воля', 'Серия 100 дней', 'flame', 'legend', 100, series),
  a('boss1', 'Победитель хранителя', 'Победи первого босса', 'skull', 'bronze', 1, bossesBeaten),
  a('boss10', 'Охотник на хранителей', 'Победи 10 боссов', 'skull', 'silver', 10, bossesBeaten),
  a('boss30', 'Гроза хранителей', 'Победи всех 30 боссов', 'skull', 'gold', 30, bossesBeaten),
  a('stars50', 'Отличник', '50 уровней на три звезды', 'star', 'silver', 50, threeStars),
  a('stars200', 'Безупречный', '200 уровней на три звезды', 'star', 'gold', 200, threeStars),
  a('world0', 'Освободитель королевства', 'Пройди все 100 уровней королевства', 'map', 'gold', 1, (p) => Number(worldDone(p, 0))),
  a('world1', 'Покоритель космоса', 'Пройди все 100 уровней космоса', 'map', 'gold', 1, (p) => Number(worldDone(p, 1))),
  a('world2', 'Гроза зомби', 'Пройди все 100 уровней зомби-мира', 'map', 'gold', 1, (p) => Number(worldDone(p, 2))),
  a('knyaz', 'Победитель Дивана', 'Одолей Князя Дивана', 'crown', 'legend', 1, (p) => Number(!!p.stars[LEVELS.length])),
  a('arms', 'Стальные руки', '30 отжиманий за один подход', 'arm', 'silver', 30, best('pushup')),
  a('legs', 'Ноги-пружины', '60 приседаний за один подход', 'leg', 'silver', 60, best('squat')),
  a('core', 'Пресс-кубики', '50 повторов на пресс за один подход', 'core', 'silver', 50, best('situp')),
  a('daily10', 'Добрый сосед', 'Выполни 10 заданий дня', 'scroll', 'silver', 10, (p) => p.dailyCount ?? 0),
  a('daily50', 'Любимец Атлетии', 'Выполни 50 заданий дня', 'scroll', 'gold', 50, (p) => p.dailyCount ?? 0),
  a('raid', 'Рейдер', 'Получи награду клана за рейд-босса', 'banner', 'bronze', 1, (p) => p.raidClaimed?.length ?? 0),
  a('raid10', 'Ветеран рейдов', '10 наград за рейды', 'banner', 'gold', 10, (p) => p.raidClaimed?.length ?? 0),
  a('legendary', 'Легенда арсенала', 'Добудь легендарную вещь', 'gem', 'gold', 1, legendary),
];

export const achDone = (ach: Achievement, p: Progress, now: number) => ach.value(p, now) >= ach.goal;

/** Выполненные, но ещё не отмеченные достижения: про них покажем «Новое достижение». */
export const newAchievements = (p: Progress, now: number) => ACHIEVEMENTS.filter((x) => !p.achSeen?.includes(x.id) && achDone(x, p, now));

/** Титул под именем героя: выбранный или последний полученный. */
export function heroBadge(p: Progress): Achievement | undefined {
  return ACHIEVEMENTS.find((x) => x.id === p.title && p.achClaimed?.includes(x.id));
}
