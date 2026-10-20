/**
 * Готовые раскладки: лагеря Князя Дивана (поход против NPC) и деревни-«боты» для поиска соперника,
 * пока живых соперников нет. Детерминированно, от номера и seed.
 */
import type { BuildingType, Res } from './village';
import type { BaseBuilding, BattleBase, TroopId } from './villageBattle';

export interface FortSpec {
  th: number;
  towers: number;
  towerL: number;
  catapults: number;
  catL: number;
  // 0 — без стен, 1 — стена вокруг ратуши, 2 — ещё и внешнее кольцо.
  rings: number;
  wallL: number;
  storages: number;
  collectors: number;
  // Уровень прочих построек.
  l: number;
  // Внешнее кольцо с проходом (слабее).
  gap?: boolean;
}

function ring(out: BaseBuilding[], x0: number, y0: number, x1: number, y1: number, l: number, gap: boolean) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
      // Проход посередине нижней стороны.
      if (gap && y === y1 && Math.abs(x - (x0 + x1) / 2) < 1) continue;
      out.push({ i: 0, t: 'wall', x, y, l });
    }
}

/** Крепость по описанию: ратуша в центре, башни по углам, катапульты и склады во внешнем поясе. */
export function fortress(f: FortSpec): BattleBase {
  const b: BaseBuilding[] = [{ i: 0, t: 'townhall', x: 10, y: 10, l: f.th }];
  const inner: [number, number][] = [[8, 8], [14, 8], [8, 14], [14, 14]];
  const outer: [number, number][] = [[5, 10], [17, 10], [10, 5], [10, 17], [5, 5], [17, 5], [5, 17], [17, 17]];
  const outside: [number, number][] = [[1, 1], [21, 1], [1, 21], [21, 21], [1, 11], [21, 11], [11, 1], [11, 21]];
  const slots = [...inner, ...outer];
  const put = (t: BuildingType, l: number, list: [number, number][]) => {
    const s = list.shift();
    if (s) b.push({ i: 0, t, x: s[0], y: s[1], l });
  };
  for (let k = 0; k < f.towers; k++) put('tower', f.towerL, slots);
  for (let k = 0; k < f.catapults; k++) put('catapult', f.catL, slots);
  for (let k = 0; k < f.storages; k++) put('storage', f.l, slots.length ? slots : outside);
  const coll: BuildingType[] = ['lumbermill', 'quarry', 'goldmine'];
  for (let k = 0; k < f.collectors; k++) put(coll[k % 3], f.l, outside);
  if (f.rings >= 1) ring(b, 7, 7, 16, 16, f.wallL, false);
  if (f.rings >= 2) ring(b, 4, 4, 19, 19, f.wallL, !!f.gap);
  return { buildings: b.map((x, k) => ({ ...x, i: k + 1 })) };
}

export interface Camp {
  id: number;
  name: string;
  // Нужна ратуша не ниже.
  th: number;
  spec: FortSpec;
  loot: Res;
  // Совет перед боем.
  hint: string;
}

export const CAMPS: Camp[] = [
  { id: 1, name: 'Застава лентяев', th: 1, loot: { wood: 150, stone: 150, gold: 80 }, hint: 'Одна башня — высаживай воинов с другой стороны.', spec: { th: 1, towers: 1, towerL: 1, catapults: 0, catL: 1, rings: 0, wallL: 1, storages: 0, collectors: 2, l: 1 } },
  { id: 2, name: 'Диванный хутор', th: 1, loot: { wood: 300, stone: 300, gold: 150 }, hint: 'Две башни прикрывают друг друга. Бей с угла.', spec: { th: 1, towers: 2, towerL: 1, catapults: 0, catL: 1, rings: 0, wallL: 1, storages: 1, collectors: 3, l: 1 } },
  { id: 3, name: 'Подушечный острог', th: 2, loot: { wood: 500, stone: 500, gold: 250 }, hint: 'Ратуша за стеной: воины её проломят, лучники стреляют поверх.', spec: { th: 2, towers: 2, towerL: 2, catapults: 0, catL: 1, rings: 1, wallL: 1, storages: 1, collectors: 3, l: 2 } },
  { id: 4, name: 'Крепость Зевоты', th: 2, loot: { wood: 800, stone: 800, gold: 400 }, hint: 'Катапульта бьёт по толпе — не высаживай всех в одно место.', spec: { th: 3, towers: 3, towerL: 2, catapults: 1, catL: 1, rings: 1, wallL: 2, storages: 2, collectors: 4, l: 2 } },
  { id: 5, name: 'Сонная цитадель', th: 3, loot: { wood: 1200, stone: 1200, gold: 600 }, hint: 'Великаны примут удар башен на себя.', spec: { th: 3, towers: 4, towerL: 3, catapults: 1, catL: 2, rings: 2, wallL: 2, storages: 2, collectors: 5, l: 3, gap: true } },
  { id: 6, name: 'Бастион Пледа', th: 4, loot: { wood: 2000, stone: 2000, gold: 1000 }, hint: 'Подрывники откроют путь к ратуше.', spec: { th: 4, towers: 4, towerL: 4, catapults: 2, catL: 3, rings: 2, wallL: 3, storages: 2, collectors: 6, l: 4 } },
  { id: 7, name: 'Твердыня Прокрастинации', th: 5, loot: { wood: 3000, stone: 3000, gold: 1500 }, hint: 'Целитель за великанами — и стены не помеха.', spec: { th: 5, towers: 4, towerL: 5, catapults: 3, catL: 4, rings: 2, wallL: 4, storages: 3, collectors: 6, l: 5 } },
  { id: 8, name: 'Диванный дворец', th: 6, loot: { wood: 5000, stone: 5000, gold: 2500 }, hint: 'Логово самого Князя. Приходи с полным лагерем.', spec: { th: 6, towers: 4, towerL: 6, catapults: 4, catL: 5, rings: 2, wallL: 5, storages: 4, collectors: 8, l: 6 } },
];
export const campById = (id: number) => CAMPS.find((c) => c.id === id);
export const campBase = (c: Camp) => fortress(c.spec);
// Повторный разгром лагеря приносит четверть добычи: можно подкопить, но выгоднее идти дальше.
export const CAMP_REPEAT_SHARE = 0.25;

/** Деревня-бот для поиска соперника: уровень ратуши и seed дают разную раскладку. */
export function botBase(th: number, seed: number): { base: BattleBase; loot: Res } {
  const r = (n: number) => (Math.imul(seed | 0, 0x9e3779b1) >>> (n * 3)) % 7;
  const spec: FortSpec = {
    th,
    towers: Math.min(4, 1 + Math.floor(th / 2) + (r(1) % 2)),
    towerL: Math.max(1, th - (r(2) % 2)),
    catapults: th >= 3 ? Math.min(4, th - 2) : 0,
    catL: Math.max(1, th - 2),
    rings: th >= 4 ? 2 : th >= 2 ? 1 : 0,
    wallL: Math.max(1, th - 1),
    storages: Math.min(4, Math.ceil(th / 2)),
    collectors: Math.min(8, 2 + th),
    l: Math.max(1, th - (r(3) % 2)),
    gap: r(4) % 2 === 0,
  };
  const base = 200 * th * th + 100 * r(5);
  return { base: fortress(spec), loot: { wood: base, stone: base, gold: Math.floor(base / 2) } };
}

/** Войско Князя Дивана для набега на деревню игрока: растёт с ратушей, но всегда посильно. */
export function knyazArmy(th: number): { troops: Partial<Record<TroopId, number>>; level: number } {
  const troops: Partial<Record<TroopId, number>> = { warrior: 4 + 2 * th, archer: 2 + 2 * th };
  if (th >= 3) troops.giant = th - 2;
  if (th >= 4) troops.wallbreaker = 2 * (th - 3);
  if (th >= 6) troops.healer = 1;
  return { troops, level: Math.max(1, th - 1) };
}
