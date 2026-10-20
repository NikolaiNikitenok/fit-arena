/**
 * Подземелье «три в ряд»: заряд от тренировок → этажи → дерево, камень и золото для деревни.
 *
 * Баланс (проверен прогоном движка: игрок, делающий случайные верные ходы, за ход убирает
 * ~1,47 самоцвета каждого вида, ~1,74 волны за ход, средний множитель комбо ~1,21):
 *  - этаж стоит FLOOR_COST = 20 заряда (20 повторов или 40 секунд планки); обычная тренировка
 *    на 60–100 повторов = 3–5 этажей; полный заряд CHARGE_MAX = 300 = 15 этажей;
 *  - 10 земель × 10 этажей, на 10-м — хранитель (босс); ходов 15–26, партия 2–4 минуты;
 *  - каждый убранный самоцвет-ресурс = 1 единица (золото — 0,5) × множитель этажа
 *    (1 + 5% за этаж: этаж 1 = ×1, этаж 50 = ×3,45, этаж 100 = ×5,95) × множитель комбо
 *    (1 + 0,25 за волну, не больше ×2,5);
 *  - за победу — бонус этажа CLEAR_BONUS (10 дерева, 10 камня, 5 золота × множитель этажа,
 *    у хранителя ×3), звёзды меняют его от ×0,8 (1 звезда) до ×1,2 (3 звезды);
 *  - первая победа за день — бонус этажа ещё раз;
 *  - поражение: заряд потрачен, остаётся FAIL_KEEP = 50% собранного, без бонуса;
 *  - expectedLoot(floor) — сколько в среднем приносит победа: этаж 1 ≈ 35 дерева, 35 камня,
 *    17 золота; этаж 10 (хранитель) ≈ 80/80/40; этаж 50 (хранитель) ≈ 190/190/95;
 *    этаж 100 ≈ 327/327/163. Обычный день (4 этажа в начале) ≈ 140 дерева, 140 камня, 70 золота;
 *  - сложность по прогону случайными ходами (живой игрок сильнее): обычные этажи 75–100% побед,
 *    лёд 40–75%, хранители 75% на 10-м и 35–50% к концу. Цены построек деревни
 *    стоит ставить так, чтобы улучшение уровня N стоило 2–4 дня добычи на этажах, до которых
 *    игрок доходит к этому времени (примерно этаж 3–4 в день).
 *
 * Сердца лечат героя, мечи бьют чудовище; урон меча слегка растёт с силой героя (до +60%).
 */
import { RESOURCES, addResources, spendCharge, villageOf, type Resource, type Resources } from '../resources';
import type { Progress } from '../progress';
import { dayKey } from '../progress';
import { createBoard, type Board, type BlockKind, type Counts, type GemKind, type Pos, type SwapResult, trySwap } from './engine';

export const FLOOR_COST = 20;
export const LAND_COUNT = 10;
export const FLOORS_PER_LAND = 10;
export const FLOOR_COUNT = LAND_COUNT * FLOORS_PER_LAND;
export const FAIL_KEEP = 0.5;
export const HERO_HP = 100;
// Сколько лечит одно сердце.
export const HEART_HEAL = 2;
// Урон одного меча у героя без прокачки.
export const SWORD_DAMAGE = 10;
export const BOARD_W = 8;
export const BOARD_H = 8;
export const CLEAR_BONUS: Resources = { wood: 10, stone: 10, gold: 5 };
// Сколько единицы ресурса даёт один самоцвет.
export const GEM_YIELD: Resources = { wood: 1, stone: 1, gold: 0.5 };
// Средние числа прогона движка (см. шапку).
const GEMS_PER_MOVE = 1.47;
const AVG_COMBO = 1.21;
// За сколько ходов в среднем выигрывается этаж (прогон: 10–17 ходов).
const MOVES_USED = 14;

export const floorMult = (floor: number) => 1 + 0.05 * (floor - 1);
export const comboMult = (wave: number) => Math.min(2.5, 1 + 0.25 * (wave - 1));

export type GoalKind = 'monster' | 'collect' | 'ice' | 'crates' | 'survive';
export type MonsterShape = 'slime' | 'bat' | 'golem' | 'skull' | 'spirit';

export interface Monster {
  name: string;
  hp: number;
  // Удар по герою раз в every ходов.
  atk: number;
  every: number;
  color: string;
  shape: MonsterShape;
}

export interface DungeonLand {
  name: string;
  // Цвета фона доски и рамки.
  bg: string;
  accent: string;
  monsters: [string, MonsterShape, string][];
  boss: [string, MonsterShape, string];
}

// Земли подземелья — под нашими мирами: от погребов Атлетии до подвала Князя Дивана.
export const DUNGEON_LANDS: DungeonLand[] = [
  { name: 'Подземелья Атлетии', bg: '#2a1f1a', accent: '#ff9a5c', monsters: [['Сонная слизь', 'slime', '#9ccc65'], ['Мышь-соня', 'bat', '#a1887f'], ['Пыльный дух', 'spirit', '#cfd8dc']], boss: ['Диванный Голем', 'golem', '#ff8a65'] },
  { name: 'Корни Шепчущего леса', bg: '#162a1c', accent: '#81c784', monsters: [['Мшистая слизь', 'slime', '#66bb6a'], ['Корнегрыз', 'bat', '#8d6e63'], ['Лесной морок', 'spirit', '#a5d6a7']], boss: ['Трухлявый Корень', 'golem', '#6d4c41'] },
  { name: 'Гномьи шахты', bg: '#2b2416', accent: '#ffd54f', monsters: [['Рудная слизь', 'slime', '#ffca28'], ['Летучая кирка', 'bat', '#90a4ae'], ['Череп рудокопа', 'skull', '#e0d6c2']], boss: ['Каменный Соня', 'golem', '#9e9e9e'] },
  { name: 'Ледяные пещеры', bg: '#14222e', accent: '#81d4fa', monsters: [['Ледяная слизь', 'slime', '#81d4fa'], ['Снежная мышь', 'bat', '#e3f2fd'], ['Дух стужи', 'spirit', '#b3e5fc']], boss: ['Йети Зевака', 'golem', '#eceff1'] },
  { name: 'Затопленные катакомбы', bg: '#10262a', accent: '#4dd0e1', monsters: [['Тинная слизь', 'slime', '#4db6ac'], ['Утопший череп', 'skull', '#b2dfdb'], ['Болотный огонёк', 'spirit', '#80cbc4']], boss: ['Жаба Тягучка', 'slime', '#689f38'] },
  { name: 'Кристальные копи', bg: '#1d1630', accent: '#b388ff', monsters: [['Кристальная слизь', 'slime', '#b388ff'], ['Аметистовая мышь', 'bat', '#ce93d8'], ['Осколочный дух', 'spirit', '#80deea']], boss: ['Кристальный Голем', 'golem', '#b39ddb'] },
  { name: 'Лавовые глубины', bg: '#2e1410', accent: '#ff7043', monsters: [['Магмовая слизь', 'slime', '#ff7043'], ['Огненная мышь', 'bat', '#ffab40'], ['Пепельный череп', 'skull', '#ffccbc']], boss: ['Диванозавр', 'golem', '#e64a19'] },
  { name: 'Склеп Лени', bg: '#1c1a24', accent: '#9fa8da', monsters: [['Зевающий череп', 'skull', '#d7ccc8'], ['Дремотный дух', 'spirit', '#9fa8da'], ['Пледовая слизь', 'slime', '#7986cb']], boss: ['Король Зевоты', 'skull', '#c5cae9'] },
  { name: 'Обломки станции «Заря»', bg: '#0f1a26', accent: '#4fc3f7', monsters: [['Плазменная слизь', 'slime', '#4fc3f7'], ['Дрон-лежебока', 'bat', '#90a4ae'], ['Космический морок', 'spirit', '#80deea']], boss: ['Робот-Пылесос Лентяй', 'golem', '#90a4ae'] },
  { name: 'Тронный подвал Дивана', bg: '#2a1020', accent: '#ff5c8a', monsters: [['Плюшевая слизь', 'slime', '#f48fb1'], ['Подушечный дух', 'spirit', '#f8bbd0'], ['Череп-подлокотник', 'skull', '#ffcdd2']], boss: ['Тень Князя Дивана', 'spirit', '#ff4081'] },
];

export interface FloorDef {
  id: number;
  land: number;
  // Номер внутри земли: 1–10.
  num: number;
  boss: boolean;
  goal: GoalKind;
  moves: number;
  // Чудовище есть на боевых этажах и в выживании; на остальных этажах цель — ресурс или препятствия.
  monster?: Monster;
  collect?: { res: Resource; n: number };
  blocks: (Pos & { kind: BlockKind })[];
  ice: (Pos & { layers: number })[];
  seed: number;
}

// Порядок целей внутри земли: хранитель всегда на десятом.
const PATTERN: GoalKind[] = ['monster', 'collect', 'crates', 'monster', 'ice', 'collect', 'monster', 'survive', 'collect', 'monster'];
const COLLECT_RES: Record<number, Resource> = { 2: 'wood', 6: 'stone', 9: 'gold' };

// Свой генератор для раскладки этажа: один и тот же этаж всегда выглядит одинаково.
function layoutRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFloor(id: number): FloorDef {
  const land = Math.floor((id - 1) / FLOORS_PER_LAND);
  const num = ((id - 1) % FLOORS_PER_LAND) + 1;
  const boss = num === FLOORS_PER_LAND;
  const goal = PATTERN[num - 1];
  const L = DUNGEON_LANDS[land];
  const seed = id * 7919 + 13;
  const rnd = layoutRng(seed);
  const hpScale = (1 + 0.006 * (id - 1)) * (id === 1 ? 0.7 : 1);
  const [name, shape, color] = boss ? L.boss : L.monsters[(num - 1) % L.monsters.length];
  let monster: Monster | undefined;
  let moves = 22;
  if (goal === 'monster' && boss) {
    moves = 26;
    monster = { name, shape, color, hp: Math.round(280 * hpScale), atk: Math.round(18 + id * 0.1), every: 3 };
  } else if (goal === 'monster') {
    monster = { name, shape, color, hp: Math.round(220 * hpScale), atk: Math.round(14 + id * 0.08), every: 3 };
  } else if (goal === 'survive') {
    moves = 15;
    monster = { name, shape, color, hp: Math.round(600 * hpScale), atk: Math.round(14 + id * 0.05), every: 2 };
  } else if (goal === 'collect') moves = 20;
  else if (goal === 'ice') moves = 28;

  const blocks: FloorDef['blocks'] = [];
  const ice: FloorDef['ice'] = [];
  const taken = new Set<number>();
  const place = (minY: number, maxY: number, minX = 0, maxX = BOARD_W - 1) => {
    for (let t = 0; t < 50; t++) {
      const x = minX + Math.floor(rnd() * (maxX - minX + 1));
      const y = minY + Math.floor(rnd() * (maxY - minY + 1));
      if (!taken.has(y * BOARD_W + x)) {
        taken.add(y * BOARD_W + x);
        return { x, y };
      }
    }
    return null;
  };
  if (goal === 'crates') {
    // Ящики посередине, с третьей земли — и валуны.
    const n = 6 + Math.min(4, Math.floor(land / 2));
    for (let i = 0; i < n; i++) {
      const p = place(2, 6);
      if (p) blocks.push({ ...p, kind: land >= 2 && i % 3 === 0 ? 'boulder' : 'crate' });
    }
  }
  if (goal === 'ice') {
    // Лёд внизу: там больше каскадов. С пятой земли часть клеток — в два слоя.
    const n = 6 + Math.min(2, Math.floor(land / 4));
    for (let i = 0; i < n; i++) {
      const p = place(4, 7, 1, 6);
      if (p) ice.push({ ...p, layers: land >= 6 && i % 4 === 0 ? 2 : 1 });
    }
  }
  // Глубже — пара валунов и на боевых этажах.
  if ((goal === 'monster' || goal === 'survive') && land >= 3) {
    for (let i = 0; i < Math.min(4, land - 2); i++) {
      const p = place(3, 5);
      if (p) blocks.push({ ...p, kind: 'boulder' });
    }
  }
  const res = COLLECT_RES[num];
  const collect = goal === 'collect' && res ? { res, n: Math.round((res === 'gold' ? 18 : 20) + land * 1.2) } : undefined;
  return { id, land, num, boss, goal, moves, monster, collect, blocks, ice, seed };
}

export const FLOORS: FloorDef[] = Array.from({ length: FLOOR_COUNT }, (_, i) => makeFloor(i + 1));
export const floorDef = (id: number): FloorDef => FLOORS[Math.max(1, Math.min(FLOOR_COUNT, id)) - 1];

export const GOAL_TEXT: Record<GoalKind, string> = {
  monster: 'Победи чудовище',
  collect: 'Собери ресурс',
  ice: 'Разбей весь лёд',
  crates: 'Разбей ящики и валуны',
  survive: 'Продержись до конца',
};

export function goalText(f: FloorDef): string {
  if (f.boss) return `Хранитель: ${f.monster!.name}`;
  if (f.goal === 'collect' && f.collect) return `Собери ${f.collect.n} ${f.collect.res === 'wood' ? 'дерева' : f.collect.res === 'stone' ? 'камня' : 'золота'}`;
  if (f.goal === 'survive') return `Продержись ${f.moves} ходов`;
  return GOAL_TEXT[f.goal];
}

/** Урон одного меча: слегка растёт с силой героя (урон за повтор из heroPower), до +60%. */
export const swordDamage = (heroDamage: number) => Math.round(SWORD_DAMAGE * (1 + Math.max(0, Math.min(0.6, (heroDamage - 13) / 80))));

/** Бонус этажа за победу: звёзды меняют его от ×0,8 до ×1,2. */
export function clearBonus(floor: number, stars: number): Resources {
  const f = floorDef(floor);
  const k = floorMult(floor) * (f.boss ? 3 : 1) * (0.6 + 0.2 * stars);
  return { wood: Math.round(CLEAR_BONUS.wood * k), stone: Math.round(CLEAR_BONUS.stone * k), gold: Math.round(CLEAR_BONUS.gold * k) };
}

/**
 * Сколько в среднем приносит победа на этаже (без бонуса дня): средний игрок побеждает за ~14 ходов,
 * 2 звезды. Для цен построек деревни.
 */
export function expectedLoot(floor: number): Resources {
  const f = floorDef(floor);
  const used = Math.min(f.moves, MOVES_USED);
  const bonus = clearBonus(floor, 2);
  const out = { ...bonus };
  for (const r of RESOURCES) out[r] += Math.round(GEMS_PER_MOVE * used * AVG_COMBO * GEM_YIELD[r] * floorMult(floor));
  return out;
}

// ---------- Партия ----------

export type RunStatus = 'play' | 'won' | 'lost';

export interface Run {
  floor: FloorDef;
  board: Board;
  moves: number;
  heroHp: number;
  heroMax: number;
  monsterHp: number;
  monsterMax: number;
  // Через сколько ходов ударит чудовище.
  attackIn: number;
  sword: number;
  // Добыча за партию (дробная, округляется в конце) и сколько самоцветов собрано по видам.
  loot: Resources;
  gems: Counts;
  status: RunStatus;
  maxCombo: number;
}

export function startRun(floor: FloorDef, heroDamage: number, seed = floor.seed): Run {
  const board = createBoard({ seed, w: BOARD_W, h: BOARD_H, blocks: floor.blocks, ice: floor.ice });
  const m = floor.monster;
  return {
    floor,
    board,
    moves: floor.moves,
    heroHp: HERO_HP,
    heroMax: HERO_HP,
    monsterHp: m?.hp ?? 0,
    monsterMax: m?.hp ?? 0,
    attackIn: m?.every ?? 0,
    sword: swordDamage(heroDamage),
    loot: { wood: 0, stone: 0, gold: 0 },
    gems: { wood: 0, stone: 0, gold: 0, heart: 0, sword: 0 },
    status: 'play',
    maxCombo: 0,
  };
}

export const iceLeft = (b: Board) => b.cells.reduce((s, c) => s + (c.ice ?? 0), 0);
export const blocksLeft = (b: Board) => b.cells.filter((c) => c.block).length;

/** Сколько осталось до цели: здоровье, ресурс, лёд или ящики; для выживания — ходы. */
export function goalLeft(run: Run): number {
  const f = run.floor;
  if (f.goal === 'monster') return Math.max(0, run.monsterHp);
  if (f.goal === 'collect' && f.collect) return Math.max(0, f.collect.n - run.gems[f.collect.res]);
  if (f.goal === 'ice') return iceLeft(run.board);
  if (f.goal === 'crates') return blocksLeft(run.board);
  return run.moves;
}

export interface MoveOutcome {
  run: Run;
  result: SwapResult;
  // Урон по чудовищу, лечение и удар чудовища за этот ход (по волнам — для анимации).
  damage: number[];
  healed: number;
  hit: number;
}

/** Ход в партии. null — ход ничего не даёт. */
export function playMove(run: Run, a: Pos, b: Pos): MoveOutcome | null {
  if (run.status !== 'play') return null;
  const result = trySwap(run.board, a, b);
  if (!result) return null;
  const f = run.floor;
  const mult = floorMult(f.id);
  const loot = { ...run.loot };
  const gems = { ...run.gems };
  const damage: number[] = [];
  let healed = 0;
  for (const s of result.steps) {
    const cm = comboMult(s.combo);
    for (const r of RESOURCES) loot[r] += s.counts[r] * GEM_YIELD[r] * mult * cm;
    for (const k of Object.keys(s.counts) as GemKind[]) gems[k] += s.counts[k];
    damage.push(f.monster ? Math.round(s.counts.sword * run.sword * cm) : 0);
    healed += s.counts.heart * HEART_HEAL;
  }
  const dealt = damage.reduce((x, y) => x + y, 0);
  const next: Run = { ...run, board: result.board, moves: run.moves - 1, loot, gems, maxCombo: Math.max(run.maxCombo, result.combo) };
  next.monsterHp = Math.max(0, run.monsterHp - dealt);
  const heroBefore = Math.min(run.heroMax, run.heroHp + healed);
  healed = heroBefore - run.heroHp;
  next.heroHp = heroBefore;
  let hit = 0;
  const monsterAlive = !!f.monster && next.monsterHp > 0;
  const won = (f.goal === 'monster' || f.goal === 'survive') && f.monster ? next.monsterHp <= 0 : goalLeft(next) <= 0;
  if (won) next.status = 'won';
  else {
    if (monsterAlive) {
      next.attackIn = run.attackIn - 1;
      if (next.attackIn <= 0) {
        hit = f.monster!.atk;
        next.heroHp = Math.max(0, next.heroHp - hit);
        next.attackIn = f.monster!.every;
      }
    }
    if (next.heroHp <= 0) next.status = 'lost';
    else if (next.moves <= 0) next.status = f.goal === 'survive' ? 'won' : 'lost';
  }
  return { run: next, result, damage, healed, hit };
}

/** Звёзды: по оставшимся ходам, в выживании — по здоровью героя. */
export function runStars(run: Run): number {
  if (run.status !== 'won') return 0;
  const share = run.floor.goal === 'survive' ? run.heroHp / run.heroMax : run.moves / run.floor.moves;
  return share >= 0.3 ? 3 : share >= 0.15 ? 2 : 1;
}

// ---------- Сохранение ----------

export interface DungeonState {
  // Самый дальний открытый этаж.
  reached: number;
  stars: Record<number, number>;
  // День последней победы с бонусом дня.
  bonusDate?: string;
  bestCombo: number;
  wins: number;
  plays: number;
  // Побеждённые хранители (этажи).
  bosses: number[];
}

type WithDungeon = Progress;

export const dungeonOf = (p: { dungeon?: DungeonState }): DungeonState => ({ reached: 1, stars: {}, bestCombo: 0, wins: 0, plays: 0, bosses: [], ...p.dungeon });
export const floorOpen = (p: { dungeon?: DungeonState }, id: number) => id >= 1 && id <= Math.min(FLOOR_COUNT, dungeonOf(p).reached);
export const dailyBonusReady = (p: { dungeon?: DungeonState }, now: number) => dungeonOf(p).bonusDate !== dayKey(now);
/** Сколько повторов не хватает до этажа. */
export const repsToFloor = (p: Progress) => Math.max(0, FLOOR_COST - villageOf(p).charge);

/** Начать этаж: тратится заряд. null — этаж закрыт или заряда мало. */
export function beginFloor(p: WithDungeon, id: number): WithDungeon | null {
  if (!floorOpen(p, id)) return null;
  const spent = spendCharge(p, FLOOR_COST);
  if (!spent) return null;
  const d = dungeonOf(p);
  return { ...spent, dungeon: { ...d, plays: d.plays + 1 } };
}

export interface FloorReward {
  loot: Resources;
  // Из них бонус этажа и бонус дня.
  bonus: Resources;
  daily: Resources | null;
  stars: number;
  firstClear: boolean;
  won: boolean;
}

/** Итог этажа: добыча в деревню, звёзды и следующий этаж. */
export function finishFloor(p: WithDungeon, run: Run, now: number): { progress: WithDungeon; reward: FloorReward } {
  const won = run.status === 'won';
  const stars = runStars(run);
  const d = dungeonOf(p);
  const keep = won ? 1 : FAIL_KEEP;
  const loot = { wood: 0, stone: 0, gold: 0 };
  for (const r of RESOURCES) loot[r] = Math.round(run.loot[r] * keep);
  const bonus = won ? clearBonus(run.floor.id, stars) : { wood: 0, stone: 0, gold: 0 };
  const daily = won && d.bonusDate !== dayKey(now) ? clearBonus(run.floor.id, 3) : null;
  const total = { ...loot };
  for (const r of RESOURCES) total[r] += bonus[r] + (daily?.[r] ?? 0);
  const id = run.floor.id;
  const firstClear = won && !d.stars[id];
  const next: DungeonState = {
    ...d,
    stars: won ? { ...d.stars, [id]: Math.max(d.stars[id] ?? 0, stars) } : d.stars,
    reached: won ? Math.max(d.reached, Math.min(FLOOR_COUNT, id + 1)) : d.reached,
    bestCombo: Math.max(d.bestCombo, run.maxCombo),
    wins: d.wins + Number(won),
    bonusDate: daily ? dayKey(now) : d.bonusDate,
    bosses: won && run.floor.boss && !d.bosses.includes(id) ? [...d.bosses, id] : d.bosses,
  };
  return { progress: { ...addResources(p, total), dungeon: next }, reward: { loot: total, bonus, daily, stars, firstClear, won } };
}
