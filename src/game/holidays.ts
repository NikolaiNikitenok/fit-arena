// Праздники Атлетии (даты и облики — src/game/holidayDefs.ts). Пока праздник идёт, каждый повтор — его жетон:
// жетоны считаются из дней тренировок прямо по прогрессу, отдельно не копятся. На дорожке праздника монеты, зелья,
// сундук, титул и облик с годом. Праздник кончился — его облик и титул больше не получить никому.
import { bossDrop, type Gear, itemById, type Item, type PotionId } from './items';
import { cycleOf, FIRST_YEAR, HOLIDAYS, type HolidayDef, holidayKey, holidayOutfitId } from './holidayDefs';
import { LAND_SIZE, LEVEL_COUNT, LEVELS } from './levels';
import { addPotions, currentLevel, dayKey, type Progress, saveProgress } from './progress';
import { t } from '../i18n';

export interface HolidayState {
  key: string;
  // Забранные ступени дорожки: их пороги в жетонах.
  claimed: number[];
}

export interface HolidayWindow {
  def: HolidayDef;
  key: string;
  year: number;
  start: number;
  end: number;
  live: boolean;
}

export type HolidayStep = { at: number } & ({ coins: number } | { potion: PotionId; n: number } | { chest: true } | { title: true } | { outfit: true });

// Дорожка праздника: пороги в жетонах (1 повтор = 1 жетон). Две недели по 150 повторов в день хватает на всё.
export const HOLIDAY_STEPS: HolidayStep[] = [
  { at: 50, coins: 150 },
  { at: 150, potion: 'vigor', n: 2 },
  { at: 300, coins: 300 },
  { at: 500, chest: true },
  { at: 800, potion: 'might', n: 2 },
  { at: 1200, title: true },
  { at: 1600, coins: 800 },
  { at: 2000, outfit: true },
];

export const HOLIDAY_GOAL = HOLIDAY_STEPS[HOLIDAY_STEPS.length - 1].at;

/** Даты праздника, начавшегося в этом году. */
function windowOf(def: HolidayDef, year: number, now: number): HolidayWindow {
  const start = new Date(year, def.start[0], def.start[1]).getTime();
  // Конец раньше начала по месяцу — праздник переходит в следующий год.
  const endYear = def.end[0] < def.start[0] ? year + 1 : year;
  const end = new Date(endYear, def.end[0], def.end[1]).getTime();
  return { def, key: holidayKey(def.id, year), year, start, end, live: now >= start && now < end };
}

/** Идущий праздник или ближайший следующий. */
export function holidayAt(now: number): HolidayWindow {
  const year = new Date(now).getFullYear();
  // Праздники до первого праздничного года не считаются: тогда их ещё не было.
  const all = [year - 1, year, year + 1].flatMap((y) => HOLIDAYS.filter((def) => cycleOf(def, y) >= FIRST_YEAR).map((def) => windowOf(def, y, now)));
  return all.find((w) => w.live) ?? all.filter((w) => w.start > now).sort((a, b) => a.start - b.start)[0];
}

/** Праздник по ключу: pumpkin-2026. */
export function holidayByKey(key: string): HolidayWindow | undefined {
  const [id, y] = key.split('-');
  const def = HOLIDAYS.find((h) => h.id === id);
  return def && windowOf(def, Number(y), 0);
}

/** Все праздники, что уже начались: для коллекций и титулов прошлых лет. */
export function holidaysSoFar(now: number): HolidayWindow[] {
  const out: HolidayWindow[] = [];
  for (let y = FIRST_YEAR; y <= new Date(now).getFullYear(); y++)
    for (const def of HOLIDAYS) {
      const w = windowOf(def, y, now);
      if (cycleOf(def, y) >= FIRST_YEAR && w.start <= now) out.push(w);
    }
  return out.sort((a, b) => a.start - b.start);
}

/** Жетоны праздника: повторы за его дни. */
export function holidayTokens(p: Progress, w: HolidayWindow): number {
  const from = dayKey(w.start);
  const to = dayKey(w.end);
  let sum = 0;
  for (const [d, n] of Object.entries(p.days)) if (d >= from && d < to) sum += n;
  return sum;
}

export const holidayOf = (p: Progress, w: HolidayWindow): HolidayState => (p.holiday?.key === w.key ? p.holiday : { key: w.key, claimed: [] });

/** Сколько ступеней можно забрать прямо сейчас. */
export function holidayReady(p: Progress, now: number): number {
  const w = holidayAt(now);
  if (!w.live) return 0;
  const tokens = holidayTokens(p, w);
  const claimed = holidayOf(p, w).claimed;
  return HOLIDAY_STEPS.filter((s) => s.at <= tokens && !claimed.includes(s.at)).length;
}

export const holidayOutfit = (w: HolidayWindow): Item => itemById(holidayOutfitId(w.key));
export const holidayTitleId = (key: string) => `hol-${key}`;
export const holidayTitleName = (w: Pick<HolidayWindow, 'def' | 'year'>) => `${w.def.hero} ${w.year}`;

/** «тыква», «тыквы», «тыкв» по числу. */
export function tokenWord(def: HolidayDef, n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  return def.token[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2];
}

export interface HolidayClaim {
  progress: Progress;
  label: string;
  gear?: Gear;
}

/** Забрать ступень дорожки: только пока праздник идёт и жетонов хватает. */
export function claimHoliday(p: Progress, at: number, now: number): HolidayClaim | null {
  const w = holidayAt(now);
  const step = HOLIDAY_STEPS.find((s) => s.at === at);
  const state = holidayOf(p, w);
  if (!w.live || !step || state.claimed.includes(at) || holidayTokens(p, w) < at) return null;
  const next: Progress = { ...p, holiday: { key: w.key, claimed: [...state.claimed, at] } };
  let label = '';
  let gear: Gear | undefined;
  if ('coins' in step) {
    next.coins = p.coins + step.coins;
    label = t('+{0} монет', { 0: step.coins });
  } else if ('potion' in step) {
    next.potions = addPotions(p.potions, step.potion, step.n);
    label = step.potion === 'vigor' ? t('Зелья жизни ×{0}', { 0: step.n }) : t('Эликсиры силы ×{0}', { 0: step.n });
  } else if ('chest' in step) {
    // Праздничный сундук: вещь уровня дальних земель или монеты, если всё уже собрано.
    const land = Math.floor((currentLevel(p, LEVEL_COUNT) - 1) / LAND_SIZE);
    gear = bossDrop(Math.min(LEVELS[LEVELS.length - 1].land, land + 3), p.items);
    if (gear) next.items = [...p.items, gear.id];
    else next.coins = p.coins + 500;
    label = gear ? t('Праздничный сундук: {0}', { 0: gear.name }) : t('Праздничный сундук: +500 монет');
  } else if ('title' in step) {
    // Титул сразу надевается и считается забранным достижением: монет за него нет, он сам награда.
    const id = holidayTitleId(w.key);
    next.achClaimed = [...new Set([...(p.achClaimed ?? []), id])];
    next.achSeen = [...new Set([...(p.achSeen ?? []), id])];
    next.title = id;
    label = t('Титул «{0}»', { 0: holidayTitleName(w) });
  } else {
    const outfit = holidayOutfit(w);
    if (!p.items.includes(outfit.id)) next.items = [...p.items, outfit.id];
    next.equipped = outfit.id;
    label = t('Облик «{0}»', { 0: outfit.name });
  }
  return { progress: saveProgress(next), label, gear };
}
