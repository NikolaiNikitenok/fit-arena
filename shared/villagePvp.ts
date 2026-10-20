/**
 * Набеги на деревни других игроков (как в Clash of Clans): общие правила для сервера и приложения.
 * Бой считает сервер тем же движком (shared/villageBattle.ts) и тем же seed, что и телефон.
 *
 * ── Числа ─────────────────────────────────────────────────────────────────────────────────────────
 *   Кубки за набег: ставка победы 25 ± (кубки защитника − кубки нападающего)/20, × (1 ± 15% за каждую
 *   ратушу разницы), в пределах 10–40. Нападающий получает ставку × звёзды/3, защитник столько же теряет.
 *   Без звёзд нападающий теряет 20 ∓ разница/20 (5–30), защитник их получает. Ниже нуля кубков не бывает.
 *   Деревни-боты (пока живых соперников мало) дают половину и перестают давать кубки с BOT_TROPHY_MAX.
 *   Щит защитнику: 12 ч после 2+ звёзд или 50%+ разрушений, 4 ч после одной звезды. Свой набег снимает свой щит.
 *   Цель бронируется на LOCK_MS: 30 с осмотра (потом бой начинается сам) + 3 мин боя + запас на сеть.
 *   Тот же нападающий — ту же деревню не чаще раза в сутки. Месть — один раз в течение суток после набега.
 *   Поиск (и пропуск соперника) — не чаще 10 раз в минуту.
 */
import { BUILDINGS, BUILDING_TYPES, canPlace, maxCount, levelCap, type Res, RES_KEYS, type Town, TH_MAX, thLevel, type Bld } from './village';
import { armyCap, barracksLevel, type BattleArmy, type BattleBase, type BattleResult, type Deploy, housingOf, TROOP_IDS, TROOPS, type TroopId, BATTLE_TICKS, validateDeploys } from './villageBattle';

const H = 3_600_000;
export const LOCK_MS = 4 * 60_000;
export const SCOUT_SECONDS = 30;
export const SHIELD_BIG_MS = 12 * H;
export const SHIELD_SMALL_MS = 4 * H;
export const REVENGE_MS = 24 * H;
export const SAME_TARGET_MS = 24 * H;
export const FIND_PER_MIN = 10;
export const BOT_TROPHY_MAX = 1200;
// Ресурсов больше этого в деревне не бывает (защита от испорченных сохранений).
export const RES_MAX = 10_000_000;

export interface VillageLeague {
  name: string;
  from: number;
  color: string;
}
export const VILLAGE_LEAGUES: VillageLeague[] = [
  { name: 'Бронза', from: 0, color: '#cd7f32' },
  { name: 'Серебро', from: 400, color: '#c0c0c0' },
  { name: 'Золото', from: 800, color: '#ffc107' },
  { name: 'Кристалл', from: 1200, color: '#b388ff' },
  { name: 'Мастер', from: 1600, color: '#4fc3f7' },
  { name: 'Чемпион', from: 2000, color: '#ff7043' },
  { name: 'Титан', from: 2500, color: '#90a4ae' },
  { name: 'Легенда', from: 3000, color: '#e040fb' },
];
export const villageLeague = (trophies: number): VillageLeague => [...VILLAGE_LEAGUES].reverse().find((l) => trophies >= l.from) ?? VILLAGE_LEAGUES[0];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Ставка кубков: сколько получит нападающий при полном разгроме и сколько потеряет без звёзд. */
export function trophyOffer(att: number, def: number, attTh: number, defTh: number, bot = false): { win: number; loss: number } {
  const d = def - att;
  const thMul = 1 + 0.15 * clamp(defTh - attTh, -2, 2);
  let win = clamp(Math.round((25 + d / 20) * thMul), 10, 40);
  let loss = clamp(Math.round((20 - d / 20) / thMul), 5, 30);
  if (bot) {
    win = att >= BOT_TROPHY_MAX ? 0 : Math.round(win / 2);
    loss = Math.round(loss / 2);
  }
  return { win, loss };
}

/** Изменение кубков по звёздам: нападающему и защитнику (защитник не уходит ниже нуля, нападающий тоже). */
export function trophyDelta(offer: { win: number; loss: number }, stars: number, att: number, def: number): { att: number; def: number } {
  if (stars > 0) {
    const g = Math.round((offer.win * Math.min(3, stars)) / 3);
    return { att: g, def: -Math.min(def, g) };
  }
  return { att: -Math.min(att, offer.loss), def: offer.loss };
}

/** Щит после набега на защитника. */
export const shieldFor = (stars: number, pct: number): number => (stars >= 2 || pct >= 50 ? SHIELD_BIG_MS : stars >= 1 ? SHIELD_SMALL_MS : 0);

// ── Что ходит между приложением и сервером ───────────────────────────────────────────────────────

export interface TargetView {
  // Номер цели: у живых — номер брони, у ботов — bot:…
  id: string;
  name: string;
  // Уровень ратуши.
  level: number;
  layout: BattleBase;
  lootAvailable: Res;
  // Seed боя выдаёт сервер: клиент и сервер считают один и тот же бой.
  seed: number;
  // Бронь набега: без неё сервер набег не примет.
  token?: string;
  // Сколько осталось до конца брони, мс.
  ttl?: number;
  trophies?: number;
  offer?: { win: number; loss: number };
  bot?: boolean;
  revenge?: boolean;
  // Предел уровня героя, который примет сервер.
  heroMax?: number;
}

export interface AttackSubmit {
  targetId: string;
  token?: string;
  seed: number;
  army: BattleArmy;
  deploys: Deploy[];
  endTick?: number;
}

export interface PvpMe {
  trophies: number;
  league: string;
  // Сколько осталось щита, мс (0 — нет).
  shield: number;
  rank: number | null;
  // Бот пишет о нападениях.
  notify: boolean;
}

/** Набег засчитан: что получил нападающий. Телефон добавляет добычу только по этому ответу. */
export interface PvpWin {
  id: string;
  at: number;
  name: string;
  stars: number;
  pct: number;
  loot: Res;
  used: BattleResult['used'];
  trophies: number;
}

export interface AttackOutcome {
  result: BattleResult;
  // Сервер подтвердил результат.
  verified: boolean;
  win?: PvpWin;
  me?: PvpMe;
}

/** Набег на мою деревню, который телефон должен применить (списать добычу, записать в журнал). */
export interface PvpDefense {
  id: string;
  at: number;
  who: string;
  stars: number;
  pct: number;
  loot: Res;
  avail: Res;
  seed: number;
  army: BattleArmy;
  deploys: Deploy[];
  endTick?: number;
  // Раскладка в момент набега: [номер, тип, x, y, уровень].
  base: [number, Bld['t'], number, number, number][];
  trophies: number;
  // Сколько ещё можно отомстить, мс (0 — уже нельзя).
  revenge: number;
}

export interface PvpInbox {
  me: PvpMe;
  defenses: PvpDefense[];
  wins: PvpWin[];
}

export interface PvpTopRow {
  name: string;
  trophies: number;
  th: number;
  league: string;
  me?: boolean;
}

// ── Проверка присланного телефоном ───────────────────────────────────────────────────────────────

const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/**
 * Правдоподобна ли деревня из сохранения: одна ратуша, постройки и уровни не больше, чем позволяет ратуша,
 * всё на сетке без наложений, войско помещается в лагерь и уже открыто казармами. null — всё в порядке.
 */
export function checkTown(t: unknown): string | null {
  const town = t as Partial<Town> | null;
  if (!town || typeof town !== 'object' || !Array.isArray(town.b)) return 'нет построек';
  if (town.b.length > 250) return 'слишком много построек';
  const res = town.res as Res | undefined;
  if (!res || RES_KEYS.some((k) => !fin(res[k]) || res[k] < 0 || res[k] > RES_MAX)) return 'ресурсы';
  const ths = town.b.filter((b) => b?.t === 'townhall');
  if (ths.length !== 1 || !int(ths[0].l, 1, TH_MAX)) return 'ратуша';
  const th = thLevel(town as Town);
  const ids = new Set<number>();
  const placed: Bld[] = [];
  for (const b of town.b) {
    if (!b || typeof b !== 'object' || !BUILDING_TYPES.includes(b.t)) return 'неизвестная постройка';
    if (!int(b.i, 0, 1e6) || ids.has(b.i)) return 'номер постройки';
    ids.add(b.i);
    if (!int(b.l, 0, b.t === 'townhall' ? TH_MAX : levelCap(b.t, th))) return `уровень ${b.t} ${b.l} при ратуше ${th}`;
    if (b.u != null && !fin(b.u)) return 'стройка';
    if (b.c != null && !fin(b.c)) return 'сборщик';
    if (!canPlace({ b: placed }, b.t, b.x, b.y)) return `место ${b.t} ${b.x},${b.y}`;
    placed.push(b);
  }
  for (const type of BUILDING_TYPES) if (type !== 'townhall' && placed.filter((b) => b.t === type).length > maxCount(type, th)) return `больше ${type}, чем можно`;
  const army = (town.army ?? {}) as Partial<Record<TroopId, number>>;
  if (typeof army !== 'object' || Object.keys(army).some((k) => !TROOP_IDS.includes(k as TroopId) || !int(army[k as TroopId], 0, 500))) return 'войско';
  const q = town.q ?? [];
  if (!Array.isArray(q) || q.length > 200 || q.some((e) => !e || !TROOP_IDS.includes(e.t) || !fin(e.end))) return 'очередь';
  const barracks = barracksLevel(town as Town);
  const queued = q.reduce((s, e) => s + TROOPS[e.t].housing, 0);
  if (housingOf(army) + queued > armyCap(town as Town)) return 'войско больше лагеря';
  if ([...TROOP_IDS.filter((id) => (army[id] ?? 0) > 0), ...q.map((e) => e.t)].some((id) => TROOPS[id].unlock > barracks)) return 'отряд не открыт';
  return null;
}

/** Можно ли идти в бой с таким войском: не больше, чем есть в лагере, и столько, сколько дают казармы. */
export function checkArmy(army: unknown, town: Town, heroMax: number): string | null {
  const a = army as BattleArmy | null;
  if (!a || typeof a !== 'object' || !a.troops || typeof a.troops !== 'object') return 'нет войска';
  for (const k of Object.keys(a.troops)) {
    if (!TROOP_IDS.includes(k as TroopId)) return 'неизвестный отряд';
    const n = a.troops[k as TroopId];
    if (!int(n, 0, 500)) return 'число отрядов';
    if (n! > (town.army[k as TroopId] ?? 0)) return `${k}: ${n} > ${town.army[k as TroopId] ?? 0}`;
    if (n! > 0 && TROOPS[k as TroopId].unlock > barracksLevel(town)) return `${k} не открыт`;
  }
  if (housingOf(a.troops) > armyCap(town)) return 'больше мест в лагере';
  if (a.level !== Math.max(1, barracksLevel(town))) return 'уровень казарм';
  if (a.hero != null && !int(a.hero, 1, Math.max(1, heroMax))) return 'уровень героя';
  return null;
}

/** Полная проверка набега до боя: высадки по порядку, в зоне, не больше войска; сдача — в пределах боя. */
export function checkDeploys(base: BattleBase, army: BattleArmy, deploys: unknown, endTick: unknown, loot: Res, seed: number): string | null {
  if (!Array.isArray(deploys)) return 'нет высадок';
  if (endTick != null && !int(endTick, 0, BATTLE_TICKS)) return 'конец боя';
  let last = 0;
  for (const d of deploys as Deploy[]) {
    if (!d || typeof d !== 'object') return 'высадка';
    if (typeof d.t !== 'number' || d.t < last) return 'высадки не по порядку';
    if (endTick != null && d.t > (endTick as number)) return 'высадка после конца боя';
    last = d.t;
  }
  return validateDeploys({ base, army, deploys: deploys as Deploy[], loot, seed, endTick: endTick as number | undefined });
}
