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
 * Бесконечные этажи (101+): этаж собирается по номеру (зерно = номер, одинаково везде), земли —
 * из частей (lands.ts), хранитель на каждом десятом. Рост за сотым этажом идёт через глубину
 * endlessDepth = 1 − e^(−(этаж−100)/200) и упирается в потолок: здоровье чудовищ до +12%
 * (хранитель: 446 на сотом → 458 на 150-м → 500 предел), удар до +10% (28 → 31), препятствий +1–2,
 * цель «собери» +3. Добыча: floorMult растёт до ×8,95 (см. ниже), так что ожидаемая добыча этажа
 * не больше ×1,5 от сотого (хранитель 100 ≈ 327 дерева, 150 ≈ 352, 1000 ≈ 483, предел ≈ 491) —
 * цены деревни, рассчитанные на этажи до сотого, не обесцениваются. Прогон случайными ходами:
 * обычные этажи 101–1000 ≈ 30–55% побед (51–100: 59%), хранители ≈ 5–20% (51–100: 15%);
 * подсказками — 86–91% и 46–63%.
 *
 * Сердца лечат героя, мечи бьют чудовище; урон меча слегка растёт с силой героя (до +60%).
 */
import { RESOURCES, addResources, spendCharge, villageOf, type Resource, type Resources } from '../resources';
import type { Progress } from '../progress';
import { dayKey } from '../progress';
import { landDef, seededRng, type MonsterShape } from './lands';
import { createBoard, GEM_KINDS, type Board, type BlockKind, type Cell, type Counts, finale, type Finale, type GemKind, type Pos, type Special, type SwapResult, trySwap } from './engine';
import { t } from '../../i18n';

export const FLOOR_COST = 20;
export const LAND_COUNT = 10;
export const FLOORS_PER_LAND = 10;
// Придуманных вручную этажей; дальше подземелье бесконечное (floorDef собирает этаж по номеру).
export const FLOOR_COUNT = LAND_COUNT * FLOORS_PER_LAND;
// Предел только для проверки сохранений: столько этажей не пройти и за всю жизнь.
export const MAX_FLOOR = 99999;
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

/**
 * Множитель добычи: +5% за этаж до сотого (×5,95), дальше рост замедляется и упирается в потолок
 * ×8,95 (+3): этаж 150 — ×6,41, 200 — ×6,80, 300 — ×7,41, 500 — ×8,16, 1000 — ×8,80. Так поздние этажи
 * всё ещё выгоднее, но деревенские цены не обесцениваются.
 */
export const LOOT_TAIL = 3;
const LOOT_TAIL_SCALE = 300;
export const floorMult = (floor: number) =>
  floor <= FLOOR_COUNT ? 1 + 0.05 * (floor - 1) : 1 + 0.05 * (FLOOR_COUNT - 1) + LOOT_TAIL * (1 - Math.exp(-(floor - FLOOR_COUNT) / LOOT_TAIL_SCALE));
export const comboMult = (wave: number) => Math.min(2.5, 1 + 0.25 * (wave - 1));

export type GoalKind = 'monster' | 'collect' | 'ice' | 'crates' | 'survive';
export type { MonsterShape, DungeonLand, LandTheme } from './lands';
export { DUNGEON_LANDS, landDef, landTheme } from './lands';

export interface Monster {
  name: string;
  hp: number;
  // Удар по герою раз в every ходов.
  atk: number;
  every: number;
  color: string;
  shape: MonsterShape;
}

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

// Порядок целей внутри земли: хранитель всегда на десятом. За сотым этажом земля берёт один
// из узоров по зерну — так бесконечные земли не повторяют друг друга (выживание — не чаще раза).
const PATTERN: GoalKind[] = ['monster', 'collect', 'crates', 'monster', 'ice', 'collect', 'monster', 'survive', 'collect', 'monster'];
export const ENDLESS_PATTERNS: GoalKind[][] = [
  PATTERN,
  ['collect', 'monster', 'ice', 'crates', 'monster', 'collect', 'survive', 'monster', 'ice', 'monster'],
  ['monster', 'crates', 'collect', 'ice', 'monster', 'survive', 'crates', 'collect', 'monster', 'monster'],
  ['ice', 'monster', 'collect', 'crates', 'survive', 'monster', 'ice', 'collect', 'crates', 'monster'],
  ['crates', 'collect', 'monster', 'ice', 'monster', 'crates', 'collect', 'survive', 'monster', 'monster'],
];
const COLLECT_RES: Record<number, Resource> = { 2: 'wood', 6: 'stone', 9: 'gold' };

/**
 * Глубина за сотым этажом: 0 на сотом, плавно к 1 (200 этажей — 0,63; 400 — 0,95). Через неё растут
 * здоровье и удар чудовищ (до +30% и +25% к сотому этажу), препятствия и добыча — с потолком,
 * чтобы этаж оставался проходимым, а деревня не утонула в ресурсах.
 */
export const endlessDepth = (id: number) => (id <= FLOOR_COUNT ? 0 : 1 - Math.exp(-(id - FLOOR_COUNT) / ENDLESS_SCALE));
const ENDLESS_SCALE = 200;
export const ENDLESS_HP = 0.12;
export const ENDLESS_ATK = 0.1;

function makeFloor(id: number): FloorDef {
  const land = Math.floor((id - 1) / FLOORS_PER_LAND);
  const num = ((id - 1) % FLOORS_PER_LAND) + 1;
  const boss = num === FLOORS_PER_LAND;
  const endless = id > FLOOR_COUNT;
  // Уровень сложности препятствий: земли 1–10 как раньше, дальше — как на десятой и глубже.
  const tier = Math.min(land, LAND_COUNT - 1);
  const tm = endlessDepth(id);
  const pattern = endless ? ENDLESS_PATTERNS[Math.floor(seededRng(land * 31 + 5)() * ENDLESS_PATTERNS.length)] : PATTERN;
  const goal = boss ? 'monster' : pattern[num - 1];
  const L = landDef(land);
  const seed = (id * 7919 + 13) >>> 0;
  const rnd = seededRng(seed);
  // Здоровье: +0,6% за этаж до сотого (×1,594), дальше — ещё до +30% с потолком.
  const hpScale = (1 + 0.006 * (Math.min(id, FLOOR_COUNT) - 1)) * (id === 1 ? 0.7 : 1) * (1 + ENDLESS_HP * tm);
  const atkScale = 1 + ENDLESS_ATK * tm;
  const atkId = Math.min(id, FLOOR_COUNT);
  const [name, shape, color] = boss ? L.boss : L.monsters[(num - 1) % L.monsters.length];
  let monster: Monster | undefined;
  let moves = 22;
  if (goal === 'monster' && boss) {
    moves = 26;
    monster = { name, shape, color, hp: Math.round(280 * hpScale), atk: Math.round((18 + atkId * 0.1) * atkScale), every: 3 };
  } else if (goal === 'monster') {
    monster = { name, shape, color, hp: Math.round(220 * hpScale), atk: Math.round((14 + atkId * 0.08) * atkScale), every: 3 };
  } else if (goal === 'survive') {
    moves = 15;
    monster = { name, shape, color, hp: Math.round(600 * hpScale), atk: Math.round(14 + atkId * 0.05), every: 2 };
  } else if (goal === 'collect') moves = 20;
  else if (goal === 'ice') moves = 28;

  const blocks: FloorDef['blocks'] = [];
  const ice: FloorDef['ice'] = [];
  const taken = new Set<number>();
  const place = (minY: number, maxY: number, minX = 0, maxX = BOARD_W - 1) => {
    for (let k = 0; k < 50; k++) {
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
    // Ящики посередине, с третьей земли — и валуны; за сотым этажом их до 12 и валунов больше.
    const n = 6 + Math.min(4, Math.floor(tier / 2)) + Math.round(tm);
    const every = tm > 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const p = place(2, 6);
      if (p) blocks.push({ ...p, kind: tier >= 2 && i % every === 0 ? 'boulder' : 'crate' });
    }
  }
  if (goal === 'ice') {
    // Лёд внизу: там больше каскадов. С пятой земли часть клеток — в два слоя, глубже — чаще.
    const n = 6 + Math.min(2, Math.floor(tier / 4)) + Math.round(2 * tm);
    const every = tm > 0.8 ? 2 : tm > 0.4 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const p = place(4, 7, 1, 6);
      if (p) ice.push({ ...p, layers: tier >= 6 && i % every === 0 ? 2 : 1 });
    }
  }
  // Глубже — пара валунов и на боевых этажах.
  if ((goal === 'monster' || goal === 'survive') && tier >= 3) {
    for (let i = 0; i < Math.min(4, tier - 2) + (boss ? 0 : Math.round(tm)); i++) {
      const p = place(3, 5);
      if (p) blocks.push({ ...p, kind: 'boulder' });
    }
  }
  const res = endless ? RESOURCES[Math.floor(seededRng(seed ^ 0x5bd1e995)() * RESOURCES.length)] : COLLECT_RES[num];
  const collect = goal === 'collect' && res ? { res, n: Math.round((res === 'gold' ? 18 : 20) + tier * 1.2 + 3 * tm) } : undefined;
  return { id, land, num, boss, goal, moves, monster, collect, blocks, ice, seed };
}

export const FLOORS: FloorDef[] = Array.from({ length: FLOOR_COUNT }, (_, i) => makeFloor(i + 1));
// Этажи за сотым собираются по запросу: список показывает не больше трёх земель сразу.
const endlessCache = new Map<number, FloorDef>();
export const floorDef = (id: number): FloorDef => {
  const n = Math.max(1, Math.min(MAX_FLOOR, Math.floor(id) || 1));
  if (n <= FLOOR_COUNT) return FLOORS[n - 1];
  let f = endlessCache.get(n);
  if (!f) {
    if (endlessCache.size > 200) endlessCache.clear();
    f = makeFloor(n);
    endlessCache.set(n, f);
  }
  return f;
};

export const GOAL_TEXT: Record<GoalKind, string> = {
  monster: t('Победи чудовище'),
  collect: t('Собери ресурс'),
  ice: t('Разбей весь лёд'),
  crates: t('Разбей ящики и валуны'),
  survive: t('Продержись до конца'),
};

export function goalText(f: FloorDef): string {
  if (f.boss) return t('Хранитель: {0}', { 0: f.monster!.name });
  if (f.goal === 'collect' && f.collect) return t('Собери {0} {1}', { 0: f.collect.n, 1: f.collect.res === 'wood' ? t('дерева') : f.collect.res === 'stone' ? t('камня') : t('золота') });
  if (f.goal === 'survive') return t('Продержись {0} ходов', { 0: f.moves });
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

// Финальный салют: сколько оставшихся ходов превращаются в лучи и какая доля добычи с них идёт.
export const FINALE_MAX = 8;
export const FINALE_SHARE = 0.5;

/**
 * Салют после победы: оставшиеся ходы (не больше FINALE_MAX) становятся лучами и взрываются,
 * добыча с них — вполовину. Ходы не тратятся, звёзды те же. null — салюта нет.
 */
export function finaleRun(run: Run): { run: Run; finale: Finale; bonus: Resources } | null {
  if (run.status !== 'won' || run.moves <= 0 || run.floor.goal === 'survive') return null;
  const fin = finale(run.board, Math.min(FINALE_MAX, run.moves));
  if (!fin) return null;
  const mult = floorMult(run.floor.id);
  const bonus: Resources = { wood: 0, stone: 0, gold: 0 };
  for (const r of RESOURCES) bonus[r] = fin.result.counts[r] * GEM_YIELD[r] * mult * FINALE_SHARE;
  const loot = { ...run.loot };
  for (const r of RESOURCES) loot[r] += bonus[r];
  return { run: { ...run, board: fin.result.board, loot }, finale: fin, bonus };
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
  // Незаконченная партия: приложение закрыли посреди этажа (метро, звонок, телефон уснул).
  run?: SavedRun;
}

type WithDungeon = Progress;

export const dungeonOf = (p: { dungeon?: DungeonState }): DungeonState => ({ reached: 1, stars: {}, bestCombo: 0, wins: 0, plays: 0, bosses: [], ...p.dungeon });
export const floorOpen = (p: { dungeon?: DungeonState }, id: number) => id >= 1 && id <= Math.min(MAX_FLOOR, dungeonOf(p).reached);
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
    reached: won ? Math.max(d.reached, Math.min(MAX_FLOOR, id + 1)) : d.reached,
    bestCombo: Math.max(d.bestCombo, run.maxCombo),
    wins: d.wins + Number(won),
    bonusDate: daily ? dayKey(now) : d.bonusDate,
    bosses: won && run.floor.boss && !d.bosses.includes(id) ? [...d.bosses, id] : d.bosses,
    // Этаж кончился — сохранённая партия больше не нужна.
    run: undefined,
  };
  return { progress: { ...addResources(p, total), dungeon: next }, reward: { loot: total, bonus, daily, stars, firstClear, won } };
}

// ---------- Незаконченная партия ----------

// Сколько ждёт сохранённая партия: через сутки засчитывается поражением.
export const RUN_TTL = 24 * 3600 * 1000;

/**
 * Партия в сохранении: маленький JSON (~0,6 КБ). Доска — строкой: клетки через запятую,
 * клетка — вид самоцвета, особый (- H V B R), номер; дальше ящик c<hp>, валун b<hp>, лёд i<слои>.
 */
export interface SavedRun {
  v: 1;
  floor: number;
  // Зерно, с которого начата доска, и когда начат этаж.
  seed: number;
  startedAt: number;
  board: { w: number; h: number; rng: number; nextId: number; kinds: string; cells: string };
  moves: number;
  heroHp: number;
  heroMax: number;
  monsterHp: number;
  monsterMax: number;
  attackIn: number;
  sword: number;
  loot: Resources;
  gems: Counts;
  status: RunStatus;
  maxCombo: number;
}

const KIND_CH: Record<GemKind, string> = { wood: 'w', stone: 's', gold: 'g', heart: 'h', sword: 'x' };
const CH_KIND: Record<string, GemKind> = { w: 'wood', s: 'stone', g: 'gold', h: 'heart', x: 'sword' };
const SPECIAL_CH: Record<Special, string> = { lineH: 'H', lineV: 'V', bomb: 'B', rainbow: 'R' };
const CH_SPECIAL: Record<string, Special> = { H: 'lineH', V: 'lineV', B: 'bomb', R: 'rainbow' };
const CELL_RE = /^(?:([wsghx])([-HVBR])(\d+))?(?:([cb])(\d+))?(?:i(\d+))?$/;

function encodeCell(c: Cell): string {
  let out = c.gem ? KIND_CH[c.gem.kind] + (c.gem.special ? SPECIAL_CH[c.gem.special] : '-') + c.gem.id : '';
  if (c.block) out += (c.block.kind === 'crate' ? 'c' : 'b') + c.block.hp;
  if (c.ice) out += 'i' + c.ice;
  return out;
}

function decodeCell(s: string): Cell | null {
  const m = CELL_RE.exec(s);
  if (!m) return null;
  const c: Cell = { gem: null };
  if (m[1]) {
    c.gem = { id: Number(m[3]), kind: CH_KIND[m[1]] };
    if (m[2] !== '-') c.gem.special = CH_SPECIAL[m[2]];
  }
  if (m[4]) c.block = { kind: m[4] === 'c' ? 'crate' : 'boulder', hp: Number(m[5]) };
  if (m[6]) c.ice = Number(m[6]);
  return c;
}

export function encodeBoard(b: Board): SavedRun['board'] {
  return { w: b.w, h: b.h, rng: b.rng, nextId: b.nextId, kinds: b.kinds.map((k) => KIND_CH[k]).join(''), cells: b.cells.map(encodeCell).join(',') };
}

export function decodeBoard(s: SavedRun['board']): Board | null {
  const parts = s.cells.split(',');
  if (parts.length !== s.w * s.h) return null;
  const cells: Cell[] = [];
  for (const part of parts) {
    const c = decodeCell(part);
    if (!c) return null;
    cells.push(c);
  }
  const kinds = [...s.kinds].map((ch) => CH_KIND[ch]).filter(Boolean);
  // Тот же массив видов, что у новой доски: так восстановленная доска не отличается от живой.
  const same = kinds.length === GEM_KINDS.length && kinds.every((k, i) => k === GEM_KINDS[i]);
  return { w: s.w, h: s.h, cells, rng: s.rng | 0, nextId: s.nextId, kinds: same ? GEM_KINDS : kinds };
}

export function serializeRun(run: Run, seed: number, startedAt: number): SavedRun {
  return {
    v: 1,
    floor: run.floor.id,
    seed,
    startedAt,
    board: encodeBoard(run.board),
    moves: run.moves,
    heroHp: run.heroHp,
    heroMax: run.heroMax,
    monsterHp: run.monsterHp,
    monsterMax: run.monsterMax,
    attackIn: run.attackIn,
    sword: run.sword,
    loot: { ...run.loot },
    gems: { ...run.gems },
    status: run.status,
    maxCombo: run.maxCombo,
  };
}

/** Партия из сохранения. null — сохранение битое. */
export function restoreRun(s: SavedRun): Run | null {
  if (!s || s.v !== 1 || !(s.floor >= 1 && s.floor <= MAX_FLOOR) || !s.board) return null;
  const board = decodeBoard(s.board);
  if (!board) return null;
  return {
    floor: floorDef(s.floor),
    board,
    moves: s.moves,
    heroHp: s.heroHp,
    heroMax: s.heroMax,
    monsterHp: s.monsterHp,
    monsterMax: s.monsterMax,
    attackIn: s.attackIn,
    sword: s.sword,
    loot: { ...s.loot },
    gems: { ...s.gems },
    status: s.status === 'won' || s.status === 'lost' ? s.status : 'play',
    maxCombo: s.maxCombo ?? 0,
  };
}

/** Записать партию в прогресс (без сохранения): после начала этажа и после каждого хода. */
export function storeRun(p: WithDungeon, run: Run, seed: number, startedAt: number): WithDungeon {
  return { ...p, dungeon: { ...dungeonOf(p), run: serializeRun(run, seed, startedAt) } };
}

/** Убрать сохранённую партию, ничего не начисляя (битое сохранение). */
export function dropRun(p: WithDungeon): WithDungeon {
  return { ...p, dungeon: { ...dungeonOf(p), run: undefined } };
}

export type SavedRunCheck =
  | { kind: 'none'; progress: WithDungeon }
  // Можно доиграть.
  | { kind: 'resume'; progress: WithDungeon; run: Run; saved: SavedRun }
  // Партия уже кончилась (закрыли во время итога) или пролежала больше суток: подведён итог.
  | { kind: 'settled'; progress: WithDungeon; run: Run; reward: FloorReward; stale: boolean };

/**
 * Что делать с сохранённой партией при входе в подземелье. Если партия уже кончилась — итог
 * по её исходу; если ей больше суток — поражение (заряд потрачен, половина добычи).
 */
export function checkSavedRun(p: WithDungeon, now: number): SavedRunCheck {
  const saved = dungeonOf(p).run;
  if (!saved) return { kind: 'none', progress: p };
  const run = restoreRun(saved);
  if (!run) return { kind: 'none', progress: dropRun(p) };
  const stale = run.status === 'play' && now - saved.startedAt > RUN_TTL;
  if (run.status === 'play' && !stale) return { kind: 'resume', progress: p, run, saved };
  const done = stale ? { ...run, status: 'lost' as const } : run;
  const res = finishFloor(p, done, now);
  return { kind: 'settled', progress: res.progress, run: done, reward: res.reward, stale };
}

/** Сдаться или уйти с этажа: как поражение — заряд потрачен, остаётся половина добычи. */
export function surrenderRun(p: WithDungeon, run: Run, now: number) {
  return finishFloor(p, { ...run, status: 'lost' }, now);
}
