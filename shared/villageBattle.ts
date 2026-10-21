/**
 * Набег на деревню: войско, обучение и пошаговая детерминированная битва.
 * Один и тот же код считает бой в приложении (с показом в 3D) и на сервере (проверка результата PvP):
 * фиксированный шаг 0,1 с, свой генератор случайных чисел от seed, только + − × ÷ и sqrt —
 * результат совпадает на любом движке JS. Никаких Math.random и Date.
 *
 * Вход: раскладка защитника (BattleBase), войско нападающего (BattleArmy), список высадок
 * [{t: тик, u: отряд, x, y}], доступная добыча и seed. Выход: процент разрушений, звёзды, добыча.
 *
 *   Отряд        здоровье  урон/удар  удар раз в  дальность  скорость  мест  цена              обучение  казармы
 *   Воин         70        10         1 с         0.9        1.6       1     10 золота          15 с      1
 *   Лучник       30        8          1 с         3.5        1.8       1     15 зол + 5 дер.    20 с      2
 *   Великан      400       21         1.5 с       1          1.0       5     80 зол + 30 камня  90 с      3
 *   Подрывник    25        12 (×40 по стенам, взрыв 1.5)   0.5   2.4   2     40 золота          45 с      4
 *   Целитель     120       лечит 18/с рядом (2.5)          3     1.4   8     160 зол + 60 дер.  180 с     5
 *   Герой        250+15·ур  20+ур       1 с         1          1.5       —     бесплатно, один на бой
 * Каждый уровень казарм сверх первого: +12% здоровья и урона отрядов; каждый уровень отряда из
 * лаборатории сверх первого — ещё +15% (множители перемножаются, shared/villageLab.ts).
 * Цены: полный лагерь воинов на казармах 1 (20 мест) — 200 золота, около дня добычи на ратуше 1–2,
 * и набег на первые лагеря Князя окупается.
 * Великан идёт к башням, подрывник — к стенам, целитель летает над стенами и лечит соседей.
 */
import { BUILDINGS, Bld, BuildingType, GRID, NO_RES, Res, RES_KEYS, sizeOf, hpOf, thLevel, type Town } from './village';

export type TroopId = 'warrior' | 'archer' | 'giant' | 'wallbreaker' | 'healer';
export type UnitKind = TroopId | 'hero';
export const TROOP_IDS: TroopId[] = ['warrior', 'archer', 'giant', 'wallbreaker', 'healer'];

export interface TroopDef {
  id: UnitKind;
  name: string;
  desc: string;
  hp: number;
  // Урон одного удара и пауза между ударами (с).
  damage: number;
  every: number;
  range: number;
  // Клеток в секунду.
  speed: number;
  housing: number;
  cost: Partial<Res>;
  // Обучение, с.
  train: number;
  // С какого уровня казарм.
  unlock: number;
  prefer: 'any' | 'defense' | 'wall' | 'heal';
  splash?: number;
  wallMul?: number;
  heal?: number;
  flying?: boolean;
}

export const TROOPS: Record<TroopId, TroopDef> = {
  warrior: { id: 'warrior', name: 'Воин', desc: 'Крепкий и дешёвый. Бьёт ближайшую постройку.', hp: 70, damage: 10, every: 1, range: 0.9, speed: 1.6, housing: 1, cost: { gold: 10 }, train: 15, unlock: 1, prefer: 'any' },
  archer: { id: 'archer', name: 'Лучник', desc: 'Стреляет издалека, даже через стены. Хрупкий.', hp: 30, damage: 8, every: 1, range: 3.5, speed: 1.8, housing: 1, cost: { gold: 15, wood: 5 }, train: 20, unlock: 2, prefer: 'any' },
  giant: { id: 'giant', name: 'Великан', desc: 'Принимает удары на себя и идёт прямо к башням.', hp: 400, damage: 21, every: 1.5, range: 1, speed: 1, housing: 5, cost: { gold: 80, stone: 30 }, train: 90, unlock: 3, prefer: 'defense' },
  wallbreaker: { id: 'wallbreaker', name: 'Подрывник', desc: 'Бежит к стене и взрывает её вместе с собой.', hp: 25, damage: 12, every: 1, range: 0.5, speed: 2.4, housing: 2, cost: { gold: 40 }, train: 45, unlock: 4, prefer: 'wall', splash: 1.5, wallMul: 40 },
  healer: { id: 'healer', name: 'Целитель', desc: 'Летит над стенами и лечит отряды рядом с собой.', hp: 120, damage: 0, every: 1, range: 3, speed: 1.4, housing: 8, cost: { gold: 160, wood: 60 }, train: 180, unlock: 5, prefer: 'heal', heal: 18, flying: true },
};

export const heroDef = (level: number): TroopDef => {
  const l = Math.max(1, Math.min(60, Math.floor(level)));
  return { id: 'hero', name: 'Герой', desc: 'Твой герой. Один на бой, обучать не нужно.', hp: 250 + 15 * l, damage: 20 + l, every: 1, range: 1, speed: 1.5, housing: 0, cost: {}, train: 0, unlock: 1, prefer: 'any' };
};

export const UNIT_NAMES: Record<UnitKind, string> = { warrior: 'Воин', archer: 'Лучник', giant: 'Великан', wallbreaker: 'Подрывник', healer: 'Целитель', hero: 'Герой' };

// Мест в лагере по уровню казарм.
export const ARMY_CAP = [20, 30, 40, 50, 65, 80, 100, 120];
export const troopMul = (barracks: number) => 1 + 0.12 * (Math.max(1, barracks) - 1);
// Уровень отряда из лаборатории: +15% за каждый сверх первого.
export const LEVEL_BONUS = 0.15;
export const levelMul = (level: number | undefined) => 1 + LEVEL_BONUS * (Math.max(1, level ?? 1) - 1);
/** Во сколько раз отряд в бою сильнее базового: казармы × уровень отряда. */
export const unitMul = (army: Pick<BattleArmy, 'level' | 'lv'>, id: TroopId) => troopMul(army.level) * levelMul(army.lv?.[id]);
export const barracksLevel = (t: Pick<Town, 'b'>) => Math.max(0, ...t.b.filter((b) => b.t === 'barracks').map((b) => b.l));
export const armyCap = (t: Pick<Town, 'b'>) => {
  const l = barracksLevel(t);
  return l >= 1 ? ARMY_CAP[l - 1] : 0;
};
export const housingOf = (army: Partial<Record<TroopId, number>>) => TROOP_IDS.reduce((s, id) => s + (army[id] ?? 0) * TROOPS[id].housing, 0);

// ── Обучение ──────────────────────────────────────────────────────────────────────────────────────

/** Обученные к моменту now отряды переходят из очереди в лагерь. */
export function finishTraining<T extends Town>(t: T, now: number): T {
  if (!t.q.length || t.q[0].end > now) return t;
  const army = { ...t.army };
  const q = t.q.filter((e) => {
    if (e.end > now) return true;
    army[e.t] = (army[e.t] ?? 0) + 1;
    return false;
  });
  return { ...t, army, q };
}

export type TrainError = 'locked' | 'space' | 'cost';
export const TRAIN_ERRORS: Record<TrainError, string> = { locked: 'Нужны казармы выше уровнем.', space: 'В лагере нет мест.', cost: 'Не хватает ресурсов.' };

/** Поставить отряд в очередь: ресурсы списываются сразу, места считаются вместе с очередью. */
export function train<T extends Town>(t: T, id: TroopId, now: number): T | TrainError {
  const def = TROOPS[id];
  if (barracksLevel(t) < def.unlock) return 'locked';
  const queued = t.q.reduce((s, e) => s + TROOPS[e.t].housing, 0);
  if (housingOf(t.army) + queued + def.housing > armyCap(t)) return 'space';
  const cost = { ...NO_RES, ...def.cost };
  if (!RES_KEYS.every((k) => t.res[k] >= cost[k])) return 'cost';
  const start = Math.max(now, t.q.length ? t.q[t.q.length - 1].end : now);
  return { ...t, res: { wood: t.res.wood - cost.wood, stone: t.res.stone - cost.stone, gold: t.res.gold - cost.gold }, q: [...t.q, { t: id, end: start + def.train * 1000 }] };
}

/** Убрать последний такой отряд из очереди с возвратом цены. */
export function untrain<T extends Town>(t: T, id: TroopId): T {
  const i = t.q.map((e) => e.t).lastIndexOf(id);
  if (i < 0) return t;
  const cost = { ...NO_RES, ...TROOPS[id].cost };
  const q = t.q.slice();
  const [gone] = q.splice(i, 1);
  // Отряды после него выйдут раньше.
  const shift = TROOPS[gone.t].train * 1000;
  for (let k = i; k < q.length; k++) q[k] = { ...q[k], end: q[k].end - shift };
  return { ...t, q, res: { wood: t.res.wood + cost.wood, stone: t.res.stone + cost.stone, gold: t.res.gold + cost.gold } };
}

// ── Бой ───────────────────────────────────────────────────────────────────────────────────────────

export const TPS = 10;
export const DT = 1 / TPS;
export const BATTLE_SECONDS = 180;
export const BATTLE_TICKS = BATTLE_SECONDS * TPS;
// Поле боя шире деревни: по три клетки с каждой стороны для высадки.
export const MARGIN = 3;
export const FIELD = GRID + 2 * MARGIN;
// Насколько «дорого» идти сквозь стену вместо обхода (в клетках пути).
export const WALL_PENALTY = 10;

/** Постройка защитника в бою: только достроенные (l ≥ 1). */
export interface BaseBuilding {
  i: number;
  t: BuildingType;
  x: number;
  y: number;
  l: number;
}
export interface BattleBase {
  buildings: BaseBuilding[];
}
export interface BattleArmy {
  // Сколько каких отрядов есть (больше высадить нельзя).
  troops: Partial<Record<TroopId, number>>;
  // Уровень казарм нападающего: сила отрядов.
  level: number;
  // Уровни отрядов из лаборатории (нет записи — 1-й).
  lv?: Partial<Record<TroopId, number>>;
  // Уровень героя; без него героя в бою нет.
  hero?: number;
}
export interface Deploy {
  // Тик высадки (0..BATTLE_TICKS), отряд и точка поля в клетках (0.1 клетки точности).
  t: number;
  u: UnitKind;
  x: number;
  y: number;
}
export interface BattleInput {
  base: BattleBase;
  army: BattleArmy;
  deploys: Deploy[];
  // Сколько можно унести при полном разгроме хранилищ.
  loot: Res;
  seed: number;
  // Нападающий сдался на этом тике.
  endTick?: number;
}
export interface BattleResult {
  stars: number;
  // 0–100, по числу разрушенных построек (без стен).
  destruction: number;
  townhall: boolean;
  loot: Res;
  ticks: number;
  // Сколько отрядов высажено (они тратятся).
  used: Partial<Record<UnitKind, number>>;
  // Номера разрушенных построек.
  destroyed: number[];
}

/** Раскладка защитника из его деревни: недостроенное в бою не участвует. */
export const baseOf = (t: Pick<Town, 'b'>): BattleBase => ({ buildings: t.b.filter((b) => b.l >= 1).map((b: Bld) => ({ i: b.i, t: b.t, x: b.x, y: b.y, l: b.l })) });

export interface SimBuilding extends BaseBuilding {
  size: number;
  hp: number;
  maxHp: number;
  wall: boolean;
  alive: boolean;
  cd: number;
  target: number;
}
export interface SimUnit {
  n: number;
  u: UnitKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  def: TroopDef;
  damage: number;
  alive: boolean;
  // Цель: номер постройки (для целителя — номер отряда), -1 — нет.
  target: number;
  // Стена на пути, которую сейчас ломают.
  block: number;
  path: number[] | null;
  pi: number;
  cd: number;
  // Последний тик, когда атаковал: для анимации.
  hit: number;
}
export interface Fx {
  k: 'arrow' | 'shell' | 'boom' | 'hit';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface Shell {
  x: number;
  y: number;
  land: number;
  damage: number;
  splash: number;
  x0: number;
  y0: number;
}
export interface BattleState {
  input: BattleInput;
  tick: number;
  buildings: SimBuilding[];
  units: SimUnit[];
  shells: Shell[];
  // Эффекты последнего тика: выстрелы и взрывы, для показа.
  fx: Fx[];
  done: boolean;
  rng: number;
  // Высадки по порядку и номер следующей.
  queue: Deploy[];
  next: number;
  left: Partial<Record<UnitKind, number>>;
  used: Partial<Record<UnitKind, number>>;
  occ: Int16Array;
}

// mulberry32: целочисленный генератор, одинаковый везде.
function rand(s: BattleState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const cellIdx = (cx: number, cy: number) => (cy + MARGIN) * FIELD + (cx + MARGIN);
const inField = (cx: number, cy: number) => cx >= -MARGIN && cy >= -MARGIN && cx < GRID + MARGIN && cy < GRID + MARGIN;

/** Расстояние от точки до прямоугольника постройки. */
export function rectDist(b: { x: number; y: number; size: number }, px: number, py: number): number {
  const dx = px < b.x ? b.x - px : px > b.x + b.size ? px - b.x - b.size : 0;
  const dy = py < b.y ? b.y - py : py > b.y + b.size ? py - b.y - b.size : 0;
  return Math.sqrt(dx * dx + dy * dy);
}
const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** Можно ли высадить отряд в эту точку: на поле и не ближе клетки к любой постройке. */
export function canDeploy(base: BattleBase, x: number, y: number): boolean {
  if (!(x >= -MARGIN && y >= -MARGIN && x < GRID + MARGIN && y < GRID + MARGIN)) return false;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (const b of base.buildings) {
    const s = sizeOf(b.t);
    if (cx >= b.x - 1 && cx <= b.x + s && cy >= b.y - 1 && cy <= b.y + s) return false;
  }
  return true;
}

/** Клетки, где высаживать нельзя: для подсветки (номера клеток поля). */
export function noDeployCells(base: BattleBase): number[] {
  const out = new Set<number>();
  for (const b of base.buildings) {
    const s = sizeOf(b.t);
    for (let y = b.y - 1; y <= b.y + s; y++) for (let x = b.x - 1; x <= b.x + s; x++) if (inField(x, y)) out.add(cellIdx(x, y));
  }
  return [...out].sort((a, b) => a - b);
}
export const cellOf = (idx: number) => ({ x: (idx % FIELD) - MARGIN, y: Math.floor(idx / FIELD) - MARGIN });

export function createBattle(input: BattleInput): BattleState {
  const buildings: SimBuilding[] = input.base.buildings
    .filter((b) => b.l >= 1)
    .map((b) => {
      const hp = hpOf(b.t, b.l);
      return { ...b, size: sizeOf(b.t), hp, maxHp: hp, wall: b.t === 'wall', alive: true, cd: 0, target: -1 };
    });
  const occ = new Int16Array(FIELD * FIELD).fill(-1);
  buildings.forEach((b, k) => {
    for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) if (inField(x, y)) occ[cellIdx(x, y)] = k;
  });
  // Стабильная сортировка по тику: порядок внутри тика — как пришли.
  const queue = input.deploys.map((d, k) => ({ d, k })).sort((a, b) => a.d.t - b.d.t || a.k - b.k).map((e) => e.d);
  const left: Partial<Record<UnitKind, number>> = { ...input.army.troops };
  if (input.army.hero) left.hero = 1;
  return { input, tick: 0, buildings, units: [], shells: [], fx: [], done: false, rng: input.seed | 0, queue, next: 0, left, used: {}, occ };
}

/** Высадка во время живого боя: на текущем тике, как если бы она была в списке с начала. */
export function addDeploy(s: BattleState, u: UnitKind, x: number, y: number): Deploy | null {
  if (s.done || (s.left[u] ?? 0) <= 0 || !canDeploy(s.input.base, x, y)) return null;
  const d: Deploy = { t: s.tick, u, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  s.input = { ...s.input, deploys: [...s.input.deploys, d] };
  // Тот же порядок, что дала бы сортировка полного списка: после всех высадок с тиком не позже этого.
  let at = s.next;
  while (at < s.queue.length && s.queue[at].t <= d.t) at++;
  s.queue.splice(at, 0, d);
  return d;
}

function spawn(s: BattleState, d: Deploy) {
  if (d.t > BATTLE_TICKS || (s.left[d.u] ?? 0) <= 0 || !canDeploy(s.input.base, d.x, d.y)) return;
  s.left[d.u] = (s.left[d.u] ?? 0) - 1;
  s.used[d.u] = (s.used[d.u] ?? 0) + 1;
  const def = d.u === 'hero' ? heroDef(s.input.army.hero ?? 1) : TROOPS[d.u];
  const mul = d.u === 'hero' ? 1 : unitMul(s.input.army, d.u);
  const hp = Math.round(def.hp * mul);
  s.units.push({ n: s.units.length, u: d.u, x: d.x, y: d.y, hp, maxHp: hp, def, damage: Math.round(def.damage * mul * 10) / 10, alive: true, target: -1, block: -1, path: null, pi: 0, cd: 0, hit: -100 });
}

const nonWall = (s: BattleState) => s.buildings.filter((b) => !b.wall);

function chooseTarget(s: BattleState, u: SimUnit): number {
  const pref = u.def.prefer;
  const pick = (ok: (b: SimBuilding) => boolean) => {
    let best = -1;
    let bestD = Infinity;
    s.buildings.forEach((b, k) => {
      if (!b.alive || !ok(b)) return;
      const d = rectDist(b, u.x, u.y);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = k;
      }
    });
    return best;
  };
  let t = -1;
  if (pref === 'defense') t = pick((b) => !!BUILDINGS[b.t].defense);
  else if (pref === 'wall') t = pick((b) => b.wall);
  if (t < 0) t = pick((b) => !b.wall);
  return t;
}

// Двоичная куча по ключу (f, номер клетки): одинаковый порядок обхода везде.
class Heap {
  k: number[] = [];
  push(v: number) {
    const a = this.k;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p] <= a[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.k;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l] < a[m]) m = l;
        if (r < a.length && a[r] < a[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.k.length;
  }
}
const N = FIELD * FIELD;
const DIRS = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];

/**
 * Путь A* по клеткам (8 направлений, углы не срезаем). Постройки непроходимы, кроме цели;
 * стены проходимы, но дорого: если обход сильно длиннее, отряд пойдёт ломать стену.
 */
export function findPath(s: BattleState, sx: number, sy: number, target: number): number[] | null {
  const tb = s.buildings[target];
  const start = cellIdx(Math.max(-MARGIN, Math.min(GRID + MARGIN - 1, Math.floor(sx))), Math.max(-MARGIN, Math.min(GRID + MARGIN - 1, Math.floor(sy))));
  const g = new Int32Array(N).fill(-1);
  const from = new Int32Array(N).fill(-1);
  const h = (c: number) => {
    const { x, y } = cellOf(c);
    const dx = x < tb.x ? tb.x - x : x >= tb.x + tb.size ? x - tb.x - tb.size + 1 : 0;
    const dy = y < tb.y ? tb.y - y : y >= tb.y + tb.size ? y - tb.y - tb.size + 1 : 0;
    return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
  };
  const heap = new Heap();
  g[start] = 0;
  heap.push(h(start) * N + start);
  const passable = (c: number) => {
    const o = s.occ[c];
    return o < 0 || o === target || s.buildings[o].wall;
  };
  let goal = -1;
  let guard = 0;
  while (heap.size && guard++ < N * 8) {
    const key = heap.pop();
    const c = key % N;
    const f = (key - c) / N;
    if (f > g[c] + h(c)) continue;
    if (s.occ[c] === target) {
      goal = c;
      break;
    }
    const { x, y } = cellOf(c);
    for (const [dx, dy, cost] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inField(nx, ny)) continue;
      const nc = cellIdx(nx, ny);
      if (!passable(nc)) continue;
      if (dx && dy && (!passable(cellIdx(x + dx, y)) || !passable(cellIdx(x, y + dy)))) continue;
      const o = s.occ[nc];
      const step = cost + (o >= 0 && o !== target && s.buildings[o].wall ? WALL_PENALTY * 10 : 0);
      const ng = g[c] + step;
      if (g[nc] >= 0 && g[nc] <= ng) continue;
      g[nc] = ng;
      from[nc] = c;
      heap.push((ng + h(nc)) * N + nc);
    }
  }
  if (goal < 0) return null;
  const path: number[] = [];
  for (let c: number = goal; c !== start && c >= 0; c = from[c]) path.push(c);
  return path.reverse();
}

function damageBuilding(s: BattleState, k: number, dmg: number) {
  const b = s.buildings[k];
  if (!b.alive) return;
  b.hp -= dmg;
  if (b.hp > 0) return;
  b.hp = 0;
  b.alive = false;
  for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) if (inField(x, y) && s.occ[cellIdx(x, y)] === k) s.occ[cellIdx(x, y)] = -1;
  // Открылся проход или пропала цель: всем пересчитать путь.
  for (const u of s.units) {
    if (!u.alive) continue;
    if (u.target === k && u.def.prefer !== 'heal') u.target = -1;
    if (u.block === k) u.block = -1;
    if (b.wall || u.target < 0) u.path = null;
  }
}

function damageUnit(s: BattleState, u: SimUnit, dmg: number) {
  if (!u.alive) return;
  u.hp -= dmg;
  if (u.hp <= 0) {
    u.hp = 0;
    u.alive = false;
  }
}

function explode(s: BattleState, u: SimUnit) {
  const r = u.def.splash ?? 1;
  s.buildings.forEach((b, k) => {
    if (b.alive && rectDist(b, u.x, u.y) <= r) damageBuilding(s, k, u.damage * (b.wall ? (u.def.wallMul ?? 1) : 1));
  });
  s.fx.push({ k: 'boom', x0: u.x, y0: u.y, x1: u.x, y1: u.y });
  u.alive = false;
  u.hp = 0;
}

function attack(s: BattleState, u: SimUnit, k: number) {
  if (u.cd > 0) return;
  if (u.def.splash) return explode(s, u);
  const b = s.buildings[k];
  u.cd = Math.round(u.def.every * TPS);
  u.hit = s.tick;
  if (u.def.range > 1.5) s.fx.push({ k: 'arrow', x0: u.x, y0: u.y, x1: b.x + b.size / 2, y1: b.y + b.size / 2 });
  damageBuilding(s, k, u.damage);
}

// Целитель лечит отряды в этом радиусе (клеток); героя — вполсилы.
export const HEAL_RADIUS = 2.5;

function stepHealer(s: BattleState, u: SimUnit) {
  let best = -1;
  let bestD = Infinity;
  let wounded = false;
  for (const o of s.units) {
    if (!o.alive || o.def.prefer === 'heal') continue;
    const w = o.hp < o.maxHp;
    const d = dist(u.x, u.y, o.x, o.y);
    if ((w && !wounded) || (w === wounded && d < bestD - 1e-9)) {
      wounded = wounded || w;
      bestD = d;
      best = o.n;
    }
  }
  u.target = best;
  if (best >= 0) {
    const o = s.units[best];
    const d = dist(u.x, u.y, o.x, o.y);
    if (d > 1.5) {
      const step = Math.min(d - 1.5, u.def.speed * DT);
      u.x += ((o.x - u.x) / d) * step;
      u.y += ((o.y - u.y) / d) * step;
    }
  }
  const heal = (u.def.heal ?? 0) * unitMul(s.input.army, 'healer') * DT;
  for (const o of s.units) {
    if (!o.alive || o.def.prefer === 'heal' || o.hp >= o.maxHp || dist(u.x, u.y, o.x, o.y) > HEAL_RADIUS) continue;
    o.hp = Math.min(o.maxHp, o.hp + (o.u === 'hero' ? heal / 2 : heal));
  }
}

function stepUnit(s: BattleState, u: SimUnit) {
  if (u.cd > 0) u.cd--;
  if (u.def.prefer === 'heal') return stepHealer(s, u);
  if (u.target < 0 || !s.buildings[u.target].alive) {
    u.target = chooseTarget(s, u);
    u.path = null;
    u.block = -1;
    if (u.target < 0) return;
  }
  const tb = s.buildings[u.target];
  if (rectDist(tb, u.x, u.y) <= u.def.range) return attack(s, u, u.target);
  if (u.block >= 0) {
    if (s.buildings[u.block].alive && rectDist(s.buildings[u.block], u.x, u.y) <= Math.max(u.def.range, 0.9)) return attack(s, u, u.block);
    u.block = -1;
  }
  if (!u.path) {
    u.path = findPath(s, u.x, u.y, u.target);
    u.pi = 0;
    // Пути нет (такого почти не бывает): идём напрямую.
    if (!u.path) u.path = [];
  }
  const path: number[] = u.path;
  let step = u.def.speed * DT;
  while (step > 1e-9) {
    let tx: number;
    let ty: number;
    if (u.pi < path.length) {
      const c: number = path[u.pi];
      const o = s.occ[c];
      // Впереди стена: ломаем её (если цель ещё не в досягаемости).
      if (o >= 0 && o !== u.target && s.buildings[o].wall) {
        u.block = o;
        if (rectDist(s.buildings[o], u.x, u.y) <= Math.max(u.def.range, 0.9)) return attack(s, u, o);
      }
      const { x, y } = cellOf(c);
      tx = x + 0.5;
      ty = y + 0.5;
    } else {
      tx = tb.x + tb.size / 2;
      ty = tb.y + tb.size / 2;
    }
    const d = dist(u.x, u.y, tx, ty);
    if (d <= step) {
      u.x = tx;
      u.y = ty;
      step -= d;
      if (u.pi < path.length) u.pi++;
      else break;
    } else {
      u.x += ((tx - u.x) / d) * step;
      u.y += ((ty - u.y) / d) * step;
      step = 0;
    }
    if (rectDist(tb, u.x, u.y) <= u.def.range) break;
  }
}

function stepDefense(s: BattleState, b: SimBuilding) {
  const def = BUILDINGS[b.t].defense;
  if (!def || !b.alive) return;
  if (b.cd > 0) b.cd--;
  const cx = b.x + b.size / 2;
  const cy = b.y + b.size / 2;
  const reach = (u: SimUnit) => {
    if (!u.alive || (def.splash && u.def.flying)) return false;
    const d = dist(cx, cy, u.x, u.y);
    return d <= def.range + b.size / 2 && d >= (def.minRange ?? 0);
  };
  if (b.target < 0 || !reach(s.units[b.target])) {
    b.target = -1;
    let bestD = Infinity;
    for (const u of s.units) {
      if (!reach(u)) continue;
      const d = dist(cx, cy, u.x, u.y);
      if (d < bestD - 1e-9) {
        bestD = d;
        b.target = u.n;
      }
    }
  }
  if (b.target < 0 || b.cd > 0) return;
  const u = s.units[b.target];
  const dmg = def.damage[b.l - 1];
  b.cd = Math.round(def.every * TPS);
  if (def.splash) {
    const x = u.x + (rand(s) - 0.5) * 0.6;
    const y = u.y + (rand(s) - 0.5) * 0.6;
    s.shells.push({ x, y, land: s.tick + Math.round((def.flight ?? 1) * TPS), damage: dmg, splash: def.splash, x0: cx, y0: cy });
    s.fx.push({ k: 'shell', x0: cx, y0: cy, x1: x, y1: y });
  } else {
    damageUnit(s, u, dmg);
    s.fx.push({ k: 'arrow', x0: cx, y0: cy, x1: u.x, y1: u.y });
  }
}

const allDestroyed = (s: BattleState) => nonWall(s).every((b) => !b.alive);

/** Один шаг боя (0,1 с). live — бой идёт на экране: конец, когда все погибли, решает игрок. */
export function stepBattle(s: BattleState, live = false): BattleState {
  if (s.done) return s;
  s.fx = [];
  while (s.next < s.queue.length && s.queue[s.next].t <= s.tick) spawn(s, s.queue[s.next++]);
  for (const u of s.units) if (u.alive) stepUnit(s, u);
  s.buildings.forEach((b) => stepDefense(s, b));
  s.shells = s.shells.filter((sh) => {
    if (sh.land > s.tick) return true;
    for (const u of s.units) if (u.alive && !u.def.flying && dist(sh.x, sh.y, u.x, u.y) <= sh.splash) damageUnit(s, u, sh.damage);
    s.fx.push({ k: 'boom', x0: sh.x, y0: sh.y, x1: sh.x, y1: sh.y });
    return false;
  });
  s.tick++;
  const noMore = s.next >= s.queue.length;
  const allDead = s.units.length > 0 && s.units.every((u) => !u.alive);
  if (allDestroyed(s) || s.tick >= BATTLE_TICKS || (s.input.endTick != null && s.tick >= s.input.endTick) || (!live && noMore && (allDead || !s.units.length))) s.done = true;
  return s;
}

/** Есть ли ещё кого высадить. */
export const unitsLeft = (s: BattleState) => Object.values(s.left).some((n) => (n ?? 0) > 0);

export function battleResult(s: BattleState): BattleResult {
  const nw = nonWall(s);
  const dead = nw.filter((b) => !b.alive);
  const destruction = nw.length ? Math.floor((dead.length * 100) / nw.length) : 0;
  const th = s.buildings.find((b) => b.t === 'townhall');
  const townhall = !!th && !th.alive;
  const stars = (destruction >= 50 ? 1 : 0) + (townhall ? 1 : 0) + (destruction >= 100 ? 1 : 0);
  // Добыча — по доле разрушенных хранилищ: ратуша, склады, сборщики.
  let total = 0;
  let got = 0;
  for (const b of nw) {
    const w = BUILDINGS[b.t].lootWeight ?? 0;
    total += w;
    if (!b.alive) got += w;
  }
  const share = total > 0 ? got / total : destruction / 100;
  const loot = { ...NO_RES };
  for (const k of RES_KEYS) loot[k] = Math.floor(s.input.loot[k] * share);
  return { stars, destruction, townhall, loot, ticks: s.tick, used: { ...s.used }, destroyed: s.buildings.filter((b) => !b.alive).map((b) => b.i) };
}

/** Весь бой разом: так сервер проверяет присланный набег. */
export function simulateBattle(input: BattleInput): BattleResult {
  const s = createBattle(input);
  while (!s.done) stepBattle(s);
  return battleResult(s);
}

/** Проверка высадок до боя (для сервера): по порядку тиков, в пределах поля и войска. */
export function validateDeploys(input: BattleInput): string | null {
  const left: Partial<Record<UnitKind, number>> = { ...input.army.troops, hero: input.army.hero ? 1 : 0 };
  if (input.deploys.length > 300) return 'слишком много высадок';
  for (const d of input.deploys) {
    if (!Number.isInteger(d.t) || d.t < 0 || d.t > BATTLE_TICKS) return 'неверный тик';
    if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return 'неверная точка';
    if (!(d.u in UNIT_NAMES)) return 'неизвестный отряд';
    if ((left[d.u] = (left[d.u] ?? 0) - 1) < 0) return 'отрядов больше, чем есть';
    if (!canDeploy(input.base, d.x, d.y)) return 'высадка слишком близко к постройкам';
  }
  return null;
}

/** Уровень ратуши в раскладке. */
export const baseTh = (base: BattleBase) => thLevel({ b: base.buildings as Bld[] });
