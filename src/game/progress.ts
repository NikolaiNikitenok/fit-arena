// Прогресс игрока хранится в браузере и копией на сервере (src/cloud.ts), чтобы не терялся при смене телефона.
import type { GymState } from '../gym/gym';
import { type Exercise, type RepExercise, repsEquivalent } from '../repCounter';
import { clanGift } from '../../shared/clanLevel';
import { seasonAt } from '../../shared/rating';
import { bossDrop, Gear, GEAR, gearById, ITEMS, itemById, openChest, PotionId, potionById } from './items';
import type { DailyTask } from './daily';
import type { EventState } from './event';
import type { ProgramsState } from './programs';
import { Baseline, DEFAULT_BASELINE, LevelDef } from './levels';
import { addCharge, type Village } from './resources';
import type { DungeonState } from './match3/dungeon';
import { villageBonus } from '../../shared/village';
import { feedPet, petBonus, PetFind, PetState, rollPetFind } from './pets';

export interface Progress {
  stars: Record<number, number>;
  baseline: Baseline;
  coins: number;
  items: string[];
  equipped: string;
  // Открытые сундуки: номер земли.
  chests: number[];
  // Жизни на попытки: сколько было в момент livesAt. Восполняются со временем.
  lives: number;
  livesAt: number;
  // Дни с тренировкой (YYYY-MM-DD по местному времени) и сколько повторов сделано в каждый.
  days: Record<string, number>;
  // Лучший подход по упражнению и самый первый — чтобы показать рост.
  best: Partial<Record<Exercise, Record_>>;
  first: Partial<Record<Exercise, Record_>>;
  // До какого уровня героя награды уже выданы.
  heroRewarded: number;
  // Замены упражнений за день: сколько замен оплачено на каждом уровне.
  swaps?: { date: string; used: Record<number, number>; bonus?: number };
  // Оружие и вещь во второй руке (id из GEAR).
  weapon?: string;
  offhand?: string;
  // Зелья и свитки: сколько штук.
  potions?: Partial<Record<PotionId, number>>;
  // Выпит эликсир силы: действует на следующий бой.
  might?: boolean;
  // Награды за рейды клана уже забраны: ключи недель.
  raidClaimed?: string[];
  // Награды за войны кланов уже забраны: ключи выходных.
  warClaimed?: string[];
  // До какого уровня клана подарки уже забраны (в каком клане).
  clanGift?: { clan: string; level: number };
  // Повторы, ещё не отправленные клану: уходят, когда открыт экран клана.
  clanPending?: number;
  // Когда начали копиться эти повторы: накопленное до войны кланов в неё не идёт.
  clanPendingAt?: number;
  // Повторы за сегодня по упражнениям: для задания дня.
  dayEx?: { date: string; reps: Partial<Record<Exercise, number>> };
  // День, за который награда задания уже забрана.
  dailyDone?: string;
  // Когда прогресс менялся: при синхронизации побеждает более свежий.
  savedAt?: number;
  // Сколько заданий дня выполнено за всё время.
  dailyCount?: number;
  // Достижения: показанные «новое!», забранные награды и титул под именем.
  achSeen?: string[];
  achClaimed?: string[];
  title?: string;
  // Журнал по дням: повторы по упражнениям (r) и лучший подход (b) — для календаря и графика.
  log?: Record<string, { r: Partial<Record<Exercise, number>>; b: Partial<Record<Exercise, number>> }>;
  // Знакомство с игрой пройдено.
  onboarded?: boolean;
  // Пропуск сезона: опыт, забранные задания и награды, счётчики по дням сезона.
  pass?: PassState;
  // Событие выходных этого месяца: общий урон по боссу и попытки по дням.
  event?: EventState;
  // Месяцы (YYYY-MM), когда босс события повержен.
  eventWins?: string[];
  // Питомцы: кто открыт, кто рядом с героем, опыт и лакомство дня (src/game/pets.ts).
  pets?: PetState;
  // Программы тренировок Мастера Грома (src/game/programs.ts): идущая, пройденные и опыт за дни.
  programs?: ProgramsState;
  // Заряд подземелья и ресурсы деревни (src/game/resources.ts).
  village?: Village;
  // Подземелье «три в ряд»: открытые этажи, звёзды, бонус дня, лучшее комбо (src/game/match3/dungeon.ts).
  dungeon?: DungeonState;
  // Дневник зала (src/gym/gym.ts): свои тренировки, план недели, история и рекорды. На серию и рейтинг не влияет.
  gym?: GymState;
}

// Что считает пропуск: повторы (все и по упражнениям), победы, боссы, задания дня, дуэли, атаки рейда.
export type PassStat = 'reps' | Exercise | 'win' | 'boss' | 'stars3' | 'daily' | 'duel' | 'duelWin' | 'raid';

export interface PassState {
  season: number;
  xp: number;
  // Забранные задания (id из pass.ts) и ступени бесплатной и Pro-дорожки.
  quests: string[];
  free: number[];
  pro: number[];
  // Счётчики по дням (YYYY-MM-DD по местному времени).
  c: Record<string, Partial<Record<PassStat, number>>>;
}

export interface Record_ {
  reps: number;
  date: string;
}

export const MAX_LIVES = 5;
export const LIFE_MS = 20 * 60 * 1000;

const KEY = 'fit-arena-adventure';

// Сезон пропуска по местной дате: тот же номер, что у сезона дуэлей в этот день.
export const passSeason = (date: string) => seasonAt(Date.parse(`${date}T12:00:00Z`));

/** Пропуск текущего сезона: в новом сезоне всё начинается заново. */
export function passOf(p: Progress, now: number): PassState {
  const season = passSeason(dayKey(now));
  return p.pass?.season === season ? p.pass : { season, xp: 0, quests: [], free: [], pro: [], c: {} };
}

/** Прибавить к счётчику пропуска за сегодня (без сохранения). */
export function countPass(p: Progress, stat: PassStat, n: number, now: number): Progress {
  if (n <= 0) return p;
  const pass = passOf(p, now);
  const date = dayKey(now);
  const day = pass.c[date] ?? {};
  return { ...p, pass: { ...pass, c: { ...pass.c, [date]: { ...day, [stat]: (day[stat] ?? 0) + n } } } };
}

export const saveProgress = (p: Progress): Progress => save(p);

const fresh = (): Progress => ({
  stars: {},
  baseline: { ...DEFAULT_BASELINE },
  coins: 0,
  equipped: 'starter',
  chests: [],
  lives: MAX_LIVES,
  livesAt: 0,
  days: {},
  best: {},
  first: {},
  heroRewarded: 1,
  items: ['starter', 'sword'],
  weapon: 'sword',
  potions: { vigor: 1, might: 1 },
});

export function loadProgress(): Progress {
  try {
    const p: Progress = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    // Сохранения до оружия: выдаём стартовый меч.
    if (!p.items.includes('sword')) p.items = [...p.items, 'sword'];
    p.weapon ??= 'sword';
    // Сохранения до планки: её база — средняя.
    p.baseline = { ...DEFAULT_BASELINE, ...p.baseline };
    return p;
  } catch {
    return fresh();
  }
}

// Подписчик на сохранения: облачная копия (src/cloud.ts).
let onSaved: ((p: Progress) => void) | null = null;
export const onProgressSaved = (fn: (p: Progress) => void) => (onSaved = fn);

/** Записать прогресс, пришедший с сервера, без отправки обратно. */
export function replaceProgress(p: Progress): Progress {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Нет хранилища.
  }
  return p;
}

function save(p: Progress): Progress {
  p = { ...p, savedAt: Date.now() };
  onSaved?.(p);
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Без хранилища прогресс живёт до закрытия приложения.
  }
  return p;
}

export const isUnlocked = (p: Progress, id: number) => id === 1 || (p.stars[id - 1] ?? 0) > 0;

/** Первый непройденный уровень — там стоит герой. */
export function currentLevel(p: Progress, count: number): number {
  for (let id = 1; id <= count; id++) if (!p.stars[id]) return id;
  return count;
}

export interface WinReward {
  coins: number;
  firstTime: boolean;
  // Трофей за первую победу над боссом.
  drop?: Gear;
  // Сундучок, который нашёл питомец.
  petFind?: PetFind;
}

/** Победа: звёзды, монеты (полные — за первое прохождение), новая база после испытания. */
export function recordWin(p: Progress, level: LevelDef, stars: number, record?: number): { progress: Progress; reward: WinReward } {
  const firstTime = !p.stars[level.id];
  // Рынок деревни: +2% монет за уровень.
  const bonus = itemById(p.equipped).coinBonus + petBonus(p, Date.now()).coins + villageBonus(p.village?.b).coins;
  const petFind = level.daily ? null : rollPetFind(p, level.land, Date.now());
  const coins = Math.round((firstTime ? level.coins : Math.round(level.coins / 4)) * (1 + bonus));
  const baseline = { ...p.baseline };
  if (level.type === 'trial' && record != null) baseline[level.exercises[0]] = Math.max(3, record);
  // Лёгкая победа: форма выросла, враги в этом упражнении становятся крепче.
  if (level.type !== 'trial' && !level.rest && stars === 3) adapt(baseline, level.exercises, WIN_GROWTH);
  const drop = level.type === 'boss' && firstTime ? bossDrop(level.land, p.items) : undefined;
  let counted = countPass(p, 'win', 1, Date.now());
  if (level.type === 'boss') counted = countPass(counted, 'boss', 1, Date.now());
  if (stars >= 3) counted = countPass(counted, 'stars3', 1, Date.now());
  const next = {
    ...counted,
    stars: { ...p.stars, [level.id]: Math.max(p.stars[level.id] ?? 0, stars) },
    coins: p.coins + coins + (petFind?.coins ?? 0),
    baseline,
    items: drop ? [...p.items, drop.id] : p.items,
    potions: petFind?.potion ? addPotion(p.potions, petFind.potion, 1) : p.potions,
  };
  return { progress: save(next), reward: { coins, firstTime, drop, petFind: petFind ?? undefined } };
}

// Форма игрока между испытаниями: победа на 3 звезды поднимает базу на 3%, поражение снижает на 2%.
export const WIN_GROWTH = 1.03;
export const LOSS_DROP = 0.98;
function adapt(baseline: Baseline, exercises: RepExercise[], factor: number) {
  for (const ex of new Set(exercises)) baseline[ex] = Math.max(3, Math.round(baseline[ex] * factor * 10) / 10);
}

/** Поражение: база по упражнениям уровня чуть ниже, чтобы игра не убегала от игрока. */
export function recordLoss(p: Progress, level: LevelDef): Progress {
  if (level.type === 'trial') return p;
  const baseline = { ...p.baseline };
  adapt(baseline, level.exercises, LOSS_DROP);
  return save({ ...p, baseline });
}

export function buy(p: Progress, itemId: string): Progress | null {
  const item = ITEMS.find((i) => i.id === itemId);
  if (!item || p.items.includes(itemId) || p.coins < item.price) return null;
  return save({ ...p, coins: p.coins - item.price, items: [...p.items, itemId], equipped: itemId });
}

export const equip = (p: Progress, itemId: string): Progress => (p.items.includes(itemId) ? save({ ...p, equipped: itemId }) : p);

export function claimChest(p: Progress, land: number): { progress: Progress; coins: number; itemName?: string } | null {
  if (p.chests.includes(land)) return null;
  const loot = openChest(land + 1, p.items, land);
  const found = loot.item?.id ?? loot.gear?.id;
  const next = {
    ...p,
    chests: [...p.chests, land],
    coins: p.coins + loot.coins,
    items: found ? [...p.items, found] : p.items,
    potions: loot.potion ? addPotion(p.potions, loot.potion, 1) : p.potions,
  };
  return { progress: save(next), coins: loot.coins, itemName: loot.item?.name ?? loot.gear?.name ?? (loot.potion && potionById(loot.potion).name) };
}

const addPotion = (have: Progress['potions'], id: PotionId, n: number) => ({ ...have, [id]: Math.max(0, (have?.[id] ?? 0) + n) });

/** Надеть оружие или вещь во вторую руку; повторное нажатие на щит снимает его. */
export function equipGear(p: Progress, id: string): Progress {
  const g = gearById(id);
  if (!g || !p.items.includes(id)) return p;
  if (g.slot === 'weapon') return save({ ...p, weapon: id });
  return save({ ...p, offhand: p.offhand === id ? undefined : id });
}

export function buyGear(p: Progress, id: string): Progress | null {
  const g = GEAR.find((x) => x.id === id);
  if (!g || !g.inShop || p.items.includes(id) || p.coins < g.price) return null;
  return equipGear({ ...p, coins: p.coins - g.price, items: [...p.items, id] }, id);
}

export function buyPotion(p: Progress, id: PotionId): Progress | null {
  const potion = potionById(id);
  if (p.coins < potion.price) return null;
  return save({ ...p, coins: p.coins - potion.price, potions: addPotion(p.potions, id, 1) });
}

/** Выпить зелье. null — нечего пить или сейчас бесполезно (жизни полные, эликсир уже выпит). */
export function usePotion(p: Progress, id: PotionId, now: number): Progress | null {
  if (!(p.potions?.[id] ?? 0)) return null;
  const potions = addPotion(p.potions, id, -1);
  if (id === 'vigor') {
    const { lives, max, nextMs } = livesNow(p, now);
    if (lives >= max) return null;
    const next = lives + 1;
    return save({ ...p, potions, lives: next, livesAt: next >= max ? now : now - (LIFE_MS - nextMs) });
  }
  if (id === 'might') return p.might ? null : save({ ...p, potions, might: true });
  const used = p.swaps?.date === dayKey(now) ? p.swaps : { date: dayKey(now), used: {} };
  return save({ ...p, potions, swaps: { ...used, bonus: (used.bonus ?? 0) + 1 } });
}

/** Эликсир силы тратится, когда начинается бой. */
export const spendMight = (p: Progress): Progress => (p.might ? save({ ...p, might: false }) : p);

// Опыт героя: каждый честный повтор и каждый впервые пройденный уровень.
export const XP_PER_LEVEL_WON = 20;

export function heroXp(p: Progress): number {
  const reps = Object.values(p.days).reduce((s, n) => s + n, 0);
  return reps + Object.keys(p.stars).length * XP_PER_LEVEL_WON + (p.programs?.xp ?? 0);
}

/** Сколько опыта нужно, чтобы перейти с уровня n на n + 1. */
export const xpToNext = (n: number) => 60 + 30 * n;

export function heroLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = xp;
  while (left >= xpToNext(level)) left -= xpToNext(level++);
  return { level, into: left, need: xpToNext(level) };
}

const TITLES: [number, string][] = [
  [50, 'Легенда Атлетии'],
  [35, 'Чемпион'],
  [20, 'Ветеран'],
  [10, 'Боец'],
  [5, 'Ученик Грома'],
  [1, 'Новичок'],
];
export const heroTitle = (level: number) => TITLES.find(([l]) => level >= l)![1];

/** Каждые 10 уровней героя — ещё одна жизнь, до восьми. */
// Таверна деревни добавляет одну-две жизни.
export const maxLives = (p: Progress) => MAX_LIVES + Math.min(3, Math.floor(heroLevel(heroXp(p)).level / 10)) + villageBonus(p.village?.b).lives;
export const levelReward = (level: number) => 30 * level;

/** Выдать монеты за новые уровни героя. */
export function claimHeroLevels(p: Progress): { progress: Progress; levels: number[]; coins: number } | null {
  const { level } = heroLevel(heroXp(p));
  if (level <= (p.heroRewarded ?? 1)) return null;
  const levels = Array.from({ length: level - (p.heroRewarded ?? 1) }, (_, i) => (p.heroRewarded ?? 1) + i + 1);
  const coins = levels.reduce((s, l) => s + levelReward(l), 0);
  return { progress: save({ ...p, heroRewarded: level, coins: p.coins + coins }), levels, coins };
}

/** Жизни сейчас и сколько ждать следующую. */
export function livesNow(p: Progress, now: number): { lives: number; max: number; nextMs: number } {
  const max = maxLives(p);
  if (p.lives >= max) return { lives: max, max, nextMs: 0 };
  const gained = Math.floor((now - p.livesAt) / LIFE_MS);
  const lives = Math.min(max, p.lives + gained);
  return { lives, max, nextMs: lives >= max ? 0 : LIFE_MS - ((now - p.livesAt) % LIFE_MS) };
}

/** Поражение стоит одну жизнь, победа — ничего. */
export function spendLife(p: Progress, now: number): Progress {
  const { lives, max, nextMs } = livesNow(p, now);
  if (lives <= 0) return p;
  // Отсчёт до следующей жизни продолжается с того же места, если жизни уже копились.
  const livesAt = lives >= max ? now : now - (LIFE_MS - nextMs);
  return save({ ...p, lives: lives - 1, livesAt });
}

export const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Сделанный подход (победа или нет): день тренировки, повторы, рекорды. */
/** Повторы вне карты (дуэль, программа): в серию, задание дня и опыт клана. У планки reps — секунды. */
export const recordOutsideReps = (exercise: Exercise, reps: number, now: number): Progress => {
  const p = loadProgress();
  return reps > 0 ? recordActivity(addClanPending(p, repsEquivalent(exercise, reps), now), exercise, reps, now) : p;
};

/** Дуэль закончилась: в пропуск идут бой и победа. */
export function recordDuel(result: 'win' | 'lose' | 'draw', now: number): Progress {
  const p = countPass(loadProgress(), 'duel', 1, now);
  return save(result === 'win' ? countPass(p, 'duelWin', 1, now) : p);
}

/** Бой с тренером: в пропуск идёт только сам бой. Победа над ботом не засчитывается, чтобы задания «выиграй дуэль» не фармили. */
export const recordTrainerDuel = (now: number): Progress => save(countPass(loadProgress(), 'duel', 1, now));

/** Атака на рейд-босса клана: для заданий пропуска. */
export const recordRaidAttack = (p: Progress, now: number): Progress => save(countPass(p, 'raid', 1, now));

export const addPotions = addPotion;

/**
 * Подход сделан: повторы в серию, опыт, пропуск, задание дня и журнал. Планка приходит секундами:
 * в журнал, рекорд и задание дня — секунды, в опыт и общий счёт повторов — по две секунды за повтор.
 */
export function recordActivity(p: Progress, exercise: Exercise | null, amount: number, now: number): Progress {
  if (amount <= 0) return p;
  const reps = amount;
  const total = repsEquivalent(exercise, amount);
  const date = dayKey(now);
  const counted = countPass(exercise ? countPass(p, exercise, reps, now) : p, 'reps', total, now);
  const next = { ...counted, days: { ...p.days, [date]: (p.days[date] ?? 0) + total } };
  if (exercise) {
    const ex = p.dayEx?.date === date ? p.dayEx.reps : {};
    next.dayEx = { date, reps: { ...ex, [exercise]: (ex[exercise] ?? 0) + reps } };
    const day = p.log?.[date] ?? { r: {}, b: {} };
    const log = { ...p.log, [date]: { r: { ...day.r, [exercise]: (day.r[exercise] ?? 0) + reps }, b: { ...day.b, [exercise]: Math.max(day.b[exercise] ?? 0, reps) } } };
    // Журнал за год с небольшим: дальше календарь не листается.
    const keys = Object.keys(log).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete log[k];
    next.log = log;
    if (!p.first[exercise]) next.first = { ...p.first, [exercise]: { reps, date } };
    if (reps > (p.best[exercise]?.reps ?? 0)) next.best = { ...p.best, [exercise]: { reps, date } };
  }
  // Каждый повтор заряжает подземелье «три в ряд».
  return save(addCharge(feedPet(next, total, now), total));
}

// В неделю можно отдохнуть два дня, и серия не прервётся: мышцам нужен отдых.
export const REST_PER_WEEK = 2;

/** Серия: дни подряд с тренировками, где до двух пропусков в неделю считаются отдыхом. */
export function streak(days: Record<string, number>, now: number): { days: number; restLeft: number; today: boolean } {
  const DAY = 86400000;
  const today = !!days[dayKey(now)];
  let count = 0;
  let restUsed = 0;
  let weekRest = 0;
  // Неделя отдыха считается по 7 дням назад от текущего шага.
  let weekStart = 0;
  let pending = 0;
  for (let i = today ? 0 : 1; i < 400; i++) {
    const key = dayKey(now - i * DAY);
    if (i - weekStart >= 7) {
      weekStart = i;
      weekRest = 0;
    }
    if (days[key]) {
      count += 1 + pending;
      pending = 0;
      continue;
    }
    if (weekRest < REST_PER_WEEK) {
      weekRest++;
      if (i < 7) restUsed++;
      // Пропуск засчитывается в серию, только если до него тоже тренировались.
      pending++;
      continue;
    }
    break;
  }
  return { days: count, restLeft: Math.max(0, REST_PER_WEEK - restUsed), today };
}

// Три замены упражнения в день, например пресс на приседания, когда негде лечь.
export const SWAPS_PER_DAY = 3;

const swapsToday = (p: Progress, now: number) => (p.swaps?.date === dayKey(now) ? p.swaps.used : {});

/** Сколько замен ещё есть сегодня и сколько уже оплачено на этом уровне (переигрывать с ними бесплатно). */
export function swapsLeft(p: Progress, levelId: number, now: number): { left: number; paid: number } {
  const used = swapsToday(p, now);
  const spent = Object.values(used).reduce((a, b) => a + b, 0);
  const bonus = p.swaps?.date === dayKey(now) ? (p.swaps.bonus ?? 0) : 0;
  return { left: Math.max(0, SWAPS_PER_DAY + bonus - spent), paid: used[levelId] ?? 0 };
}

/** Списывает замены при старте попытки; null, если замен не хватает. */
export function spendSwaps(p: Progress, levelId: number, count: number, now: number): Progress | null {
  const { left, paid } = swapsLeft(p, levelId, now);
  const extra = count - paid;
  if (extra <= 0) return p;
  if (extra > left) return null;
  const bonus = p.swaps?.date === dayKey(now) ? p.swaps.bonus : undefined;
  return save({ ...p, swaps: { date: dayKey(now), used: { ...swapsToday(p, now), [levelId]: count }, bonus } });
}

/** Начать игру заново: прогресс, предметы и монеты стираются. */
export function resetProgress(): Progress {
  return save(fresh());
}

/** Награда за рейд клана: монеты, зелья и, для лучших или при победе, сундук рейда со снаряжением. */
export function claimRaid(p: Progress, key: string, reward: { coins: number; potions: Partial<Record<PotionId, number>>; chest: boolean }, land: number): { progress: Progress; gear?: Gear } | null {
  if (p.raidClaimed?.includes(key)) return null;
  let potions = p.potions;
  for (const [id, n] of Object.entries(reward.potions) as [PotionId, number][]) potions = addPotion(potions, id, n);
  const gear = reward.chest ? bossDrop(land + 2, p.items) : undefined;
  const next = {
    ...p,
    coins: p.coins + reward.coins,
    potions,
    items: gear ? [...p.items, gear.id] : p.items,
    raidClaimed: [...(p.raidClaimed ?? []).slice(-20), key],
  };
  return { progress: save(next), gear };
}

/** Награда за войну кланов: как за рейд, но свой список забранных недель. */
export function claimWar(p: Progress, key: string, reward: { coins: number; potions: Partial<Record<PotionId, number>>; chest: boolean }, land: number): { progress: Progress; gear?: Gear } | null {
  if (p.warClaimed?.includes(key)) return null;
  let potions = p.potions;
  for (const [id, n] of Object.entries(reward.potions) as [PotionId, number][]) potions = addPotion(potions, id, n);
  const gear = reward.chest ? bossDrop(land + 2, p.items) : undefined;
  const next = { ...p, coins: p.coins + reward.coins, potions, items: gear ? [...p.items, gear.id] : p.items, warClaimed: [...(p.warClaimed ?? []).slice(-20), key] };
  return { progress: save(next), gear };
}

/** Подарки за уровни клана. В новом клане отсчёт начинается с его текущего уровня. */
export function syncClanGift(p: Progress, clan: string, level: number): Progress | null {
  if (p.clanGift?.clan === clan) return null;
  return save({ ...p, clanGift: { clan, level } });
}

export function clanGiftsDue(p: Progress, clan: string, level: number): { coins: number; potions: Partial<Record<PotionId, number>>; levels: number } {
  const from = p.clanGift?.clan === clan ? p.clanGift.level : level;
  const out = { coins: 0, potions: {} as Partial<Record<PotionId, number>>, levels: Math.max(0, level - from) };
  for (let l = from + 1; l <= level; l++) {
    const g = clanGift(l);
    out.coins += g.coins;
    for (const [id, n] of Object.entries(g.potions) as [PotionId, number][]) out.potions[id] = (out.potions[id] ?? 0) + n;
  }
  return out;
}

export function claimClanGift(p: Progress, clan: string, level: number): Progress | null {
  const from = p.clanGift?.clan === clan ? p.clanGift.level : level;
  return claimClanGiftRange(p, clan, from, level);
}

/**
 * Подарки за уровни клана from+1…to — как решил сервер (он помнит, с какого уровня игрок в клане).
 * Повторно за те же уровни не выдаёт.
 */
export function claimClanGiftRange(p: Progress, clan: string, from: number, to: number): Progress | null {
  const start = p.clanGift?.clan === clan ? Math.max(from, p.clanGift.level) : from;
  const due = clanGiftsDue({ ...p, clanGift: { clan, level: start } }, clan, to);
  if (!due.levels) return null;
  let potions = p.potions;
  for (const [id, n] of Object.entries(due.potions) as [PotionId, number][]) potions = addPotion(potions, id, n);
  return save({ ...p, coins: p.coins + due.coins, potions, clanGift: { clan, level: to } });
}

export const clearClanPending = (p: Progress): Progress => save({ ...p, clanPending: 0, clanPendingAt: undefined });

/** Повторы для клана копятся до открытия вкладки «Клан»; запоминаем, когда пришли первые. */
export const addClanPending = (p: Progress, reps: number, now: number): Progress =>
  reps > 0 ? { ...p, clanPending: (p.clanPending ?? 0) + reps, clanPendingAt: p.clanPending ? (p.clanPendingAt ?? now) : now } : p;

/** Сколько повторов задания дня сделано сегодня. */
export function dailyProgress(p: Progress, task: DailyTask): number {
  return p.dayEx?.date === task.date ? (p.dayEx.reps[task.exercise] ?? 0) : 0;
}

export function claimDaily(p: Progress, task: DailyTask): Progress | null {
  if (p.dailyDone === task.date || dailyProgress(p, task) < task.target) return null;
  const counted = countPass(p, 'daily', 1, Date.now());
  return save({ ...counted, coins: p.coins + task.coins, potions: task.potion ? addPotion(p.potions, task.potion, 1) : p.potions, dailyDone: task.date, dailyCount: (p.dailyCount ?? 0) + 1 });
}

export const markAchSeen = (p: Progress, ids: string[]): Progress => save({ ...p, achSeen: [...new Set([...(p.achSeen ?? []), ...ids])] });

/** Забрать награду достижения; первый полученный титул сразу надевается. */
export function claimAchievement(p: Progress, id: string, coins: number): Progress | null {
  if (p.achClaimed?.includes(id)) return null;
  return save({ ...p, coins: p.coins + coins, achClaimed: [...(p.achClaimed ?? []), id], title: p.title ?? id });
}

export const setTitle = (p: Progress, id: string | undefined): Progress => save({ ...p, title: id });
export const finishOnboarding = (p: Progress): Progress => save({ ...p, onboarded: true });
