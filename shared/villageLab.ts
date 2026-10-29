/**
 * Лаборатория: уровни отрядов. Как и вся деревня — чистый детерминированный код без Date и Math.random,
 * общий для приложения и сервера (сервер проверяет, что уровни отрядов в набеге не выше, чем в деревне).
 *
 * ── Числа ─────────────────────────────────────────────────────────────────────────────────────────
 * Лаборатория строится с ратуши 2; её уровень L открывает отряды до уровня L + 1 (ратуша 8 → 8-й).
 * Каждый уровень отряда сверх первого: +15% здоровья и урона (лечения у целителя), LEVEL_BONUS.
 * Исследование одно за раз, платится золотом и камнем сразу:
 *
 *   До уровня   множитель цены   время
 *   2           ×1               30 мин
 *   3           ×2,5             3 ч
 *   4           ×6               6 ч
 *   5           ×12              12 ч
 *   6           ×22              18 ч
 *   7           ×38              1 д
 *   8           ×60              1,5 д
 *
 *   Базовая цена: воин 100 зол + 100 камня, лучник 150 + 100, великан 300 + 200, подрывник 250 + 150,
 *   целитель 500 + 300. Пример: воин 2-го уровня на ратуше 2 — 100 + 100, полдня добычи.
 *
 * Тренировка ускоряет исследование: каждый повтор (или 2 секунды планки) — минус REP_BOOST_MIN минута,
 * сам по себе, без траты заряда. Ещё можно закончить сразу за заряд, как стройку: 1 заряд = 2 минуты.
 */
import { NO_RES, type Res, RES_KEYS, SPEEDUP_MIN_PER_CHARGE, type Town } from './village';
import { TROOP_IDS, TROOPS, type TroopId } from './villageBattle';
import { t } from '../src/i18n';

export const TROOP_MAX_LEVEL = 8;
export const REP_BOOST_MIN = 1;
const RESEARCH_GROWTH = [1, 2.5, 6, 12, 22, 38, 60];
const RESEARCH_TIME = [1800, 10800, 21600, 43200, 64800, 86400, 129600];
const RESEARCH_BASE: Record<TroopId, Partial<Res>> = {
  warrior: { gold: 100, stone: 100 },
  archer: { gold: 150, stone: 100 },
  giant: { gold: 300, stone: 200 },
  wallbreaker: { gold: 250, stone: 150 },
  healer: { gold: 500, stone: 300 },
};

const nice = (v: number) => (v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100);

export const labLevel = (tm: Pick<Town, 'b'>) => Math.max(0, ...tm.b.filter((b) => b.t === 'lab').map((b) => b.l));
/** До какого уровня можно прокачать отряды при лаборатории уровня lab. */
export const maxTroopLevel = (lab: number) => (lab >= 1 ? Math.min(TROOP_MAX_LEVEL, lab + 1) : 1);
export const troopLevel = (tm: Pick<Town, 'tl'>, id: TroopId) => Math.max(1, tm.tl?.[id] ?? 1);
/** Уровни всех отрядов — для BattleArmy.lv (только выше первого, чтобы запись была короткой). */
export function troopLevels(tm: Pick<Town, 'tl'>): Partial<Record<TroopId, number>> {
  const out: Partial<Record<TroopId, number>> = {};
  for (const id of TROOP_IDS) if (troopLevel(tm, id) > 1) out[id] = troopLevel(tm, id);
  return out;
}

/** Цена исследования до уровня level (2..8). */
export function researchCost(id: TroopId, level: number): Res {
  const g = RESEARCH_GROWTH[level - 2] ?? RESEARCH_GROWTH[RESEARCH_GROWTH.length - 1];
  const out = { ...NO_RES };
  for (const [k, v] of Object.entries(RESEARCH_BASE[id])) out[k as keyof Res] = nice((v as number) * g);
  return out;
}
export const researchTime = (level: number) => RESEARCH_TIME[level - 2] ?? RESEARCH_TIME[RESEARCH_TIME.length - 1];

export type ResearchError = 'nolab' | 'busy' | 'labBusy' | 'locked' | 'max' | 'lab' | 'cost';
export const RESEARCH_ERRORS: Record<ResearchError, string> = {
  nolab: t('Сначала построй лабораторию.'),
  busy: t('Лаборатория уже занята исследованием.'),
  labBusy: t('Лабораторию сейчас улучшают.'),
  locked: t('Отряд ещё не открыт в казармах.'),
  max: t('Отряд уже самого высокого уровня.'),
  lab: t('Нужна лаборатория выше уровнем.'),
  cost: t('Не хватает ресурсов.'),
};

/** Почему нельзя начать исследование отряда (или null, если можно). */
export function researchBlock(tm: Town, id: TroopId): ResearchError | null {
  const labs = tm.b.filter((b) => b.t === 'lab');
  const lab = labLevel(tm);
  if (lab < 1) return 'nolab';
  if (tm.r) return 'busy';
  if (labs.every((b) => b.u != null)) return 'labBusy';
  const barracks = Math.max(0, ...tm.b.filter((b) => b.t === 'barracks').map((b) => b.l));
  if (barracks < TROOPS[id].unlock) return 'locked';
  const next = troopLevel(tm, id) + 1;
  if (next > TROOP_MAX_LEVEL) return 'max';
  if (next > maxTroopLevel(lab)) return 'lab';
  const cost = researchCost(id, next);
  if (!RES_KEYS.every((k) => tm.res[k] >= cost[k])) return 'cost';
  return null;
}

/** Начать исследование: ресурсы списываются сразу. */
export function startResearch<T extends Town>(tm: T, id: TroopId, now: number): T | ResearchError {
  const err = researchBlock(tm, id);
  if (err) return err;
  const level = troopLevel(tm, id) + 1;
  const cost = researchCost(id, level);
  const res = { wood: tm.res.wood - cost.wood, stone: tm.res.stone - cost.stone, gold: tm.res.gold - cost.gold };
  return { ...tm, res, r: { t: id, end: now + researchTime(level) * 1000 } };
}

/** Отменить исследование: цена возвращается целиком. */
export function cancelResearch<T extends Town>(tm: T): T {
  if (!tm.r) return tm;
  const cost = researchCost(tm.r.t, troopLevel(tm, tm.r.t) + 1);
  const next = { ...tm, res: { wood: tm.res.wood + cost.wood, stone: tm.res.stone + cost.stone, gold: tm.res.gold + cost.gold } };
  delete next.r;
  return next;
}

/** Закончить исследование, срок которого прошёл. Тот же объект, если ничего не изменилось. */
export function finishResearch<T extends Town>(tm: T, now: number): T {
  if (!tm.r || tm.r.end > now) return tm;
  const id = tm.r.t;
  const next = { ...tm, tl: { ...tm.tl, [id]: Math.min(TROOP_MAX_LEVEL, troopLevel(tm, id) + 1) } };
  delete next.r;
  return next;
}

/** Повторы на тренировке сокращают идущее исследование: reps × REP_BOOST_MIN минут. */
export function boostResearch<T extends Town>(tm: T, reps: number): T {
  if (!tm.r || reps <= 0) return tm;
  return { ...tm, r: { ...tm.r, end: tm.r.end - Math.round(reps) * REP_BOOST_MIN * 60_000 } };
}

/** Сколько заряда стоит закончить исследование сейчас (как стройку: 1 заряд = 2 минуты). */
export const researchSpeedCharge = (tm: Pick<Town, 'r'>, now: number) => (tm.r ? Math.max(1, Math.ceil((tm.r.end - now) / 60_000 / SPEEDUP_MIN_PER_CHARGE)) : 0);

/** Закончить сразу (заряд списывает вызывающий). */
export const finishResearchNow = <T extends Town>(tm: T, now: number): T => (tm.r ? finishResearch({ ...tm, r: { ...tm.r, end: now } }, now) : tm);
