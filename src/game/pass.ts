// Пропуск сезона: задания дают опыт пропуска, опыт открывает ступени щита.
// Серая дорожка бесплатная, золотая — у владельцев Pro Pass (статус приходит с сервера).
// Сезон тот же, что у дуэлей: 4 недели. Задания одинаковые у всех и зависят только от даты.
import { passOutfitIds } from './passOutfits';
import { EXERCISE_LABELS, type Exercise, type RepExercise } from '../repCounter';
import { seasonEndsAt } from '../../shared/rating';
import { bossDrop, Gear, gearById, itemById, openChest, PotionId, potionById } from './items';
import type { Baseline } from './levels';
import { addPotions, dayKey, passOf, passSeason, type PassStat, Progress, saveProgress, streakOf } from './progress';
import { t } from '../i18n';

export const PASS_TIERS = 30;
export const XP_PER_TIER = 250;
const DAY = 86_400_000;

export type QuestKind = 'daily' | 'weekly' | 'season';

export interface Quest {
  id: string;
  kind: QuestKind;
  // Что считать; 'streak' — текущая серия дней.
  stat: PassStat | 'streak';
  target: number;
  xp: number;
  title: string;
}

export type PassReward =
  | { kind: 'coins'; n: number }
  | { kind: 'potion'; id: PotionId; n: number }
  | { kind: 'chest' }
  | { kind: 'gear' }
  | { kind: 'passGear'; id: string }
  | { kind: 'outfit'; id: string };

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 2166136261);
const round5 = (n: number) => Math.max(10, Math.round(n / 5) * 5);
const EXERCISES: RepExercise[] = ['squat', 'pushup', 'situp'];
const exTitle = (ex: Exercise, n: number) => t('{0}: {1} повторов', { 0: EXERCISE_LABELS[ex], 1: n });

// Местная дата как полдень UTC: так у даты один сезон и одна неделя в любом часовом поясе.
const noon = (date: string) => Date.parse(`${date}T12:00:00Z`);
const seasonStart = (date: string) => seasonEndsAt(noon(date)) - 28 * DAY;
/** Номер недели сезона (0–3) для местной даты. */
export const passWeek = (date: string) => Math.max(0, Math.min(3, Math.floor((noon(date) - seasonStart(date)) / (7 * DAY))));
const weekDates = (date: string) => {
  const from = seasonStart(date) + passWeek(date) * 7 * DAY;
  return Array.from({ length: 7 }, (_, i) => new Date(from + i * DAY + DAY / 2).toISOString().slice(0, 10));
};

/** Три задания дня: упражнение по силе игрока, общее дело и просьба жителя или второе упражнение. */
export function dailyQuests(date: string, base: Baseline): Quest[] {
  const h = hash(`pass:${date}`);
  const id = (i: number) => `d:${date}:${i}`;
  const ex = EXERCISES[h % 3];
  const ex2 = EXERCISES[(h % 3 + 1 + ((h >>> 3) % 2)) % 3];
  const n = round5(base[ex] * (2 + ((h >>> 5) % 3) / 2));
  const general: Omit<Quest, 'id' | 'kind'>[] = [
    { stat: 'reps', target: 80 + ((h >>> 9) % 3) * 20, xp: 50, title: '' },
    { stat: 'win', target: 2 + ((h >>> 9) % 2), xp: 50, title: '' },
    { stat: 'stars3', target: 1, xp: 50, title: t('Пройди уровень на три звезды') },
  ];
  const g = general[(h >>> 7) % general.length];
  g.title ||= g.stat === 'reps' ? t('Сделай {0} любых повторов', { 0: g.target }) : t('Победи на {0} уровнях карты', { 0: g.target });
  const n2 = round5(base[ex2] * 1.5);
  const third: Omit<Quest, 'id' | 'kind'> = (h >>> 11) % 3 !== 0 ? { stat: 'daily', target: 1, xp: 60, title: t('Выполни задание дня жителя') } : { stat: ex2, target: n2, xp: 60, title: exTitle(ex2, n2) };
  return [{ stat: ex, target: n, xp: 60, title: exTitle(ex, n) }, g, third].map((q, i) => ({ ...q, id: id(i), kind: 'daily' as const }));
}

/** Четыре задания недели. */
export function weeklyQuests(date: string, base: Baseline): Quest[] {
  const key = `${passSeason(date)}.${passWeek(date)}`;
  const h = hash(`week:${key}`);
  const ex = EXERCISES[h % 3];
  const reps = 600 + ((h >>> 4) % 4) * 100;
  const exN = round5(base[ex] * 12);
  const wins = 8 + ((h >>> 6) % 3) * 2;
  const extra: Omit<Quest, 'id' | 'kind'>[] = [
    { stat: 'boss', target: 1, xp: 200, title: t('Победи босса (можно уже пройденного)') },
    { stat: 'duel', target: 2, xp: 200, title: t('Сразись в 2 дуэлях') },
    { stat: 'raid', target: 3, xp: 200, title: t('Атакуй рейд-босса клана 3 раза') },
    { stat: 'daily', target: 5, xp: 200, title: t('Выполни 5 заданий жителей') },
    { stat: 'stars3', target: 5, xp: 200, title: t('Пройди 5 уровней на три звезды') },
  ];
  const list: Omit<Quest, 'id' | 'kind'>[] = [
    { stat: 'reps', target: reps, xp: 200, title: t('Сделай {0} повторов за неделю', { 0: reps }) },
    { stat: ex, target: exN, xp: 180, title: exTitle(ex, exN) },
    { stat: 'win', target: wins, xp: 180, title: t('Победи на {0} уровнях карты', { 0: wins }) },
    extra[(h >>> 9) % extra.length],
  ];
  return list.map((q, i) => ({ ...q, id: `w:${key}:${i}`, kind: 'weekly' as const }));
}

/** Задания на весь сезон: большие цели, по одной на каждое дело в игре. */
export function seasonQuests(season: number): Quest[] {
  const list: Omit<Quest, 'id' | 'kind'>[] = [
    { stat: 'reps', target: 5000, xp: 500, title: t('Сделай 5000 повторов за сезон') },
    { stat: 'streak', target: 14, xp: 500, title: t('Держи серию 14 дней') },
    { stat: 'win', target: 40, xp: 400, title: t('Победи на 40 уровнях карты') },
    { stat: 'boss', target: 5, xp: 400, title: t('Победи 5 боссов') },
    { stat: 'daily', target: 15, xp: 400, title: t('Выполни 15 заданий жителей') },
    { stat: 'duelWin', target: 5, xp: 400, title: t('Выиграй 5 дуэлей') },
    { stat: 'raid', target: 10, xp: 400, title: t('Атакуй рейд-босса клана 10 раз') },
  ];
  return list.map((q, i) => ({ ...q, id: `s:${season}:${i}`, kind: 'season' as const }));
}

export function passQuests(p: Progress, now: number): Quest[] {
  const date = dayKey(now);
  return [...dailyQuests(date, p.baseline), ...weeklyQuests(date, p.baseline), ...seasonQuests(passSeason(date))];
}

/** Сколько сделано по заданию: за сегодня, за неделю или за сезон. */
export function questValue(p: Progress, q: Quest, now: number): number {
  if (q.stat === 'streak') return streakOf(p, now).days;
  const pass = passOf(p, now);
  const date = dayKey(now);
  const stat = q.stat;
  const sum = (dates: string[]) => dates.reduce((s, d) => s + (pass.c[d]?.[stat] ?? 0), 0);
  if (q.kind === 'daily') return sum([date]);
  if (q.kind === 'weekly') return sum(weekDates(date));
  return sum(Object.keys(pass.c));
}

/** Забрать опыт за выполненное задание. */
// С Pro задания дают на четверть больше опыта: ступени открываются быстрее, сила героя не меняется.
export const PRO_XP_BONUS = 1.25;
export const questXp = (q: Pick<Quest, 'xp'>, pro: boolean) => (pro ? Math.round(q.xp * PRO_XP_BONUS) : q.xp);

export function claimQuest(p: Progress, q: Quest, now: number, pro = false): Progress | null {
  const pass = passOf(p, now);
  if (pass.quests.includes(q.id) || questValue(p, q, now) < q.target) return null;
  // Задания прошлых дней и недель больше не нужны: оставляем только сезонные и нынешние.
  const live = new Set(passQuests(p, now).map((x) => x.id));
  return saveProgress({ ...p, pass: { ...pass, xp: pass.xp + questXp(q, pro), quests: [...pass.quests.filter((id) => live.has(id) || id.startsWith('s:')), q.id] } });
}

/** Открытая ступень щита по опыту: 0 — ещё ни одной. */
export function passTier(xp: number): { tier: number; into: number; need: number } {
  const tier = Math.min(PASS_TIERS, Math.floor(xp / XP_PER_TIER));
  return { tier, into: tier >= PASS_TIERS ? XP_PER_TIER : xp - tier * XP_PER_TIER, need: XP_PER_TIER };
}

const POTION_CYCLE: PotionId[] = ['vigor', 'might', 'swap'];
// Уникальное оружие Pro-дорожки: чем дальше ступень, тем сильнее.
export const PASS_GEAR: Record<number, string> = { 5: 'pass-dagger', 10: 'pass-wand', 15: 'pass-crossbow', 20: 'pass-axe', 25: 'pass-sword', 28: 'pass-shield' };

/** Награды ступени: серый щит — бесплатно, золотой — Pro. Монеты растут к концу сезона. */
export function passRewards(tier: number, season = 1): { free: PassReward; pro: PassReward } {
  const potion = POTION_CYCLE[tier % 3];
  // У каждого сезона свои облики (src/game/passOutfits.ts).
  const outfit = passOutfitIds(season);
  const free: PassReward =
    tier === PASS_TIERS ? { kind: 'outfit', id: outfit.free }
    : tier % 10 === 0 ? { kind: 'gear' }
    : tier % 5 === 0 ? { kind: 'chest' }
    : tier % 3 === 0 ? { kind: 'potion', id: potion, n: 1 }
    : { kind: 'coins', n: 40 + tier * 4 };
  const pro: PassReward =
    tier === PASS_TIERS ? { kind: 'outfit', id: outfit.pro }
    : PASS_GEAR[tier] ? { kind: 'passGear', id: PASS_GEAR[tier] }
    : tier % 5 === 0 ? { kind: 'gear' }
    : tier % 4 === 0 ? { kind: 'chest' }
    // Платная дорожка не даёт зелий бодрости (это жизни) и эликсиров силы: только свитки замены.
    : tier % 3 === 0 ? { kind: 'potion', id: 'swap', n: 2 }
    : { kind: 'coins', n: 80 + tier * 8 };
  return { free, pro };
}

export function rewardLabel(r: PassReward): string {
  switch (r.kind) {
    case 'coins':
      return t('{0} монет', { 0: r.n });
    case 'potion':
      return `${potionById(r.id).name}${r.n > 1 ? ` ×${r.n}` : ''}`;
    case 'chest':
      return t('Сундук');
    case 'gear':
      return t('Снаряжение');
    case 'passGear':
      return gearById(r.id)?.name ?? t('Снаряжение');
    case 'outfit':
      return itemById(r.id).name;
  }
}

export type Track = 'free' | 'pro';

/**
 * Забрать награду ступени. Pro-дорожка — только при pro от сервера.
 * land — земля героя: от неё зависит добыча сундука и снаряжения.
 */
export function claimPassTier(p: Progress, track: Track, tier: number, pro: boolean, land: number, now: number): { progress: Progress; label: string; gear?: Gear } | null {
  const pass = passOf(p, now);
  if (tier < 1 || tier > PASS_TIERS || tier > passTier(pass.xp).tier) return null;
  if (track === 'pro' && !pro) return null;
  if (pass.free.includes(tier) && track === 'free') return null;
  if (pass.pro.includes(tier) && track === 'pro') return null;
  const r = passRewards(tier, pass.season)[track];
  let next: Progress = { ...p };
  let label = rewardLabel(r);
  let gear: Gear | undefined;
  const coins = (n: number) => (next = { ...next, coins: next.coins + n });
  if (r.kind === 'coins') coins(r.n);
  if (r.kind === 'potion') next.potions = addPotions(next.potions, r.id, r.n);
  if (r.kind === 'chest') {
    // Сундук золотой дорожки (её оплачивают звёздами) не даёт зелий бодрости и силы.
    const loot = openChest(pass.season * 101 + tier * 7 + (track === 'pro' ? 3 : 0), next.items, land, { noLives: track === 'pro' });
    const found = loot.item?.id ?? loot.gear?.id;
    coins(loot.coins);
    if (found) next.items = [...next.items, found];
    if (loot.potion) next.potions = addPotions(next.potions, loot.potion, 1);
    gear = loot.gear;
    label = loot.item?.name ?? loot.gear?.name ?? (loot.potion ? potionById(loot.potion).name : t('{0} монет', { 0: loot.coins }));
  }
  if (r.kind === 'gear') {
    gear = bossDrop(land + (track === 'pro' ? 3 : 2), next.items);
    if (gear) {
      next.items = [...next.items, gear.id];
      label = gear.name;
    } else {
      coins(track === 'pro' ? 1200 : 600);
      label = t('{0} монет', { 0: track === 'pro' ? 1200 : 600 });
    }
  }
  if (r.kind === 'passGear') {
    const g = gearById(r.id);
    if (g && !next.items.includes(g.id)) {
      next.items = [...next.items, g.id];
      gear = g;
    } else {
      // Уже есть с прошлого сезона.
      coins(1500);
      label = t('1500 монет');
    }
  }
  if (r.kind === 'outfit') {
    // Облик уже есть с прошлого сезона: вместо него монеты.
    if (next.items.includes(r.id)) {
      coins(track === 'pro' ? 2500 : 1000);
      label = t('{0} монет', { 0: track === 'pro' ? 2500 : 1000 });
    } else next.items = [...next.items, r.id];
  }
  const claimed = track === 'free' ? { free: [...pass.free, tier] } : { pro: [...pass.pro, tier] };
  return { progress: saveProgress({ ...next, pass: { ...pass, ...claimed } }), label, gear };
}

/** Сколько ждёт: готовые задания и незабранные ступени (для значка на главной). */
export function passReady(p: Progress, pro: boolean, now: number): number {
  const pass = passOf(p, now);
  const quests = passQuests(p, now).filter((q) => !pass.quests.includes(q.id) && questValue(p, q, now) >= q.target).length;
  const { tier } = passTier(pass.xp);
  let tiers = 0;
  for (let tm = 1; tm <= tier; tm++) tiers += Number(!pass.free.includes(tm)) + Number(pro && !pass.pro.includes(tm));
  return quests + tiers;
}

export const passEndsAt = (now: number) => seasonEndsAt(noon(dayKey(now)));

/** Когда сменятся задания недели: местная полночь после последнего дня недели сезона. */
export function passWeekEndsAt(now: number): number {
  const [y, m, d] = weekDates(dayKey(now))[6].split('-').map(Number);
  return new Date(y, m - 1, d + 1).getTime();
}
