// Просьбы жителей: построить и улучшить, обучить войско, разгромить лагерь Князя. За каждую — ресурсы.
import { BuildingType, NO_RES, Res, RES_KEYS, thLevel } from '../../shared/village';
import type { TroopId } from '../../shared/villageBattle';
import type { NpcId } from '../game/npcs';
import type { Progress } from '../game/progress';
import { villageOf } from '../game/resources';
import { townOf } from './state';

type Goal =
  | { k: 'have'; t: BuildingType; n?: number; l?: number }
  | { k: 'army'; t: TroopId; n: number }
  | { k: 'camps'; n: number }
  | { k: 'defended' };

export interface VillageTask {
  id: string;
  npc: NpcId;
  text: string;
  goal: Goal;
  reward: Partial<Res>;
}

export const TASKS: VillageTask[] = [
  { id: 'v-mill', npc: 'marfa', text: 'Внучок, без дров зиму не пережить. Поставь лесопилку!', goal: { k: 'have', t: 'lumbermill' }, reward: { gold: 100 } },
  { id: 'v-quarry', npc: 'boris', text: 'Стены сами себя не сложат. Нужна каменоломня.', goal: { k: 'have', t: 'quarry' }, reward: { wood: 150 } },
  { id: 'v-mine', npc: 'fedor', text: 'Золото любит счёт. Построй рудник — буду торговать.', goal: { k: 'have', t: 'goldmine' }, reward: { stone: 150 } },
  { id: 'v-barracks', npc: 'grom', text: 'Без казарм нет войска. А без войска лентяев не прогнать!', goal: { k: 'have', t: 'barracks' }, reward: { gold: 150 } },
  { id: 'v-tower', npc: 'vega', text: 'Князь Диван уже присматривается. Поставь башню лучников.', goal: { k: 'have', t: 'tower' }, reward: { wood: 150, stone: 150 } },
  { id: 'v-warriors', npc: 'grom', text: 'Обучи пятерых воинов — покажем, кто тут не ленится.', goal: { k: 'army', t: 'warrior', n: 5 }, reward: { gold: 200 } },
  { id: 'v-camp1', npc: 'lisa', text: 'Я выследила заставу лентяев. Разгроми её!', goal: { k: 'camps', n: 1 }, reward: { wood: 300, stone: 300 } },
  { id: 'v-th2', npc: 'boris', text: 'Ратуша тесновата. Улучши её до второго уровня.', goal: { k: 'have', t: 'townhall', l: 2 }, reward: { wood: 300, stone: 300, gold: 200 } },
  { id: 'v-forge', npc: 'marfa', text: 'Построй кузницу: острый меч — меньше лишних повторов.', goal: { k: 'have', t: 'forge' }, reward: { gold: 300 } },
  { id: 'v-lab', npc: 'bip', text: 'БИП! Построй лабораторию: я прокачаю отряды. Каждый твой повтор ускорит исследование.', goal: { k: 'have', t: 'lab' }, reward: { gold: 250, stone: 150 } },
  { id: 'v-walls', npc: 'boris', text: 'Обнеси деревню стеной — хотя бы десять секций.', goal: { k: 'have', t: 'wall', n: 10 }, reward: { stone: 400 } },
  { id: 'v-towers2', npc: 'vega', text: 'Одной башни мало. Поставь вторую.', goal: { k: 'have', t: 'tower', n: 2 }, reward: { wood: 400, stone: 400 } },
  { id: 'v-camp3', npc: 'lisa', text: 'Три лагеря Князя — и он задумается!', goal: { k: 'camps', n: 3 }, reward: { wood: 600, stone: 600, gold: 300 } },
  { id: 'v-th3', npc: 'boris', text: 'Ратуша третьего уровня откроет таверну и катапульты.', goal: { k: 'have', t: 'townhall', l: 3 }, reward: { wood: 800, stone: 800, gold: 400 } },
  { id: 'v-tavern', npc: 'fedor', text: 'Таверна! Где ещё герою отдохнуть после тренировки?', goal: { k: 'have', t: 'tavern' }, reward: { gold: 500 } },
  { id: 'v-catapult', npc: 'bip', text: 'БИП-7 рассчитал: катапульта повышает защиту на 37%.', goal: { k: 'have', t: 'catapult' }, reward: { wood: 700, stone: 700 } },
  { id: 'v-defend', npc: 'vega', text: 'Отбей набег лентяев — пусть уйдут без звёзд.', goal: { k: 'defended' }, reward: { gold: 600 } },
  { id: 'v-camp5', npc: 'lisa', text: 'Пять лагерей позади — Князь в панике!', goal: { k: 'camps', n: 5 }, reward: { wood: 1500, stone: 1500, gold: 800 } },
  { id: 'v-th4', npc: 'boris', text: 'Ратуша четвёртого уровня: третий строитель и рынок.', goal: { k: 'have', t: 'townhall', l: 4 }, reward: { wood: 2000, stone: 2000, gold: 1000 } },
  { id: 'v-market', npc: 'fedor', text: 'Рынок — и монеты за победы потекут рекой.', goal: { k: 'have', t: 'market' }, reward: { gold: 1500 } },
];

/** Насколько выполнено: [сделано, нужно]. */
export function taskProgress(p: Progress, task: VillageTask): [number, number] {
  const t = townOf(p);
  const v = villageOf(p);
  const g = task.goal;
  if (g.k === 'have') {
    if (g.l) return [Math.min(g.l, g.t === 'townhall' ? thLevel(t) : Math.max(0, ...t.b.filter((b) => b.t === g.t).map((b) => b.l))), g.l];
    const n = g.n ?? 1;
    return [Math.min(n, t.b.filter((b) => b.t === g.t && b.l >= 1).length), n];
  }
  if (g.k === 'army') return [Math.min(g.n, t.army[g.t] ?? 0), g.n];
  if (g.k === 'camps') return [Math.min(g.n, Object.values(v.camps ?? {}).filter((s) => s > 0).length), g.n];
  return [(v.log ?? []).some((e) => e.stars === 0) ? 1 : 0, 1];
}

export const taskDone = (p: Progress, task: VillageTask) => {
  const [a, b] = taskProgress(p, task);
  return a >= b;
};

/** Три ближайшие незабранные просьбы. */
export const openTasks = (p: Progress) => TASKS.filter((t) => !(villageOf(p).tasks ?? []).includes(t.id)).slice(0, 3);

export function claimTask(p: Progress, id: string): Progress | null {
  const task = TASKS.find((t) => t.id === id);
  const v = villageOf(p);
  if (!task || (v.tasks ?? []).includes(id) || !taskDone(p, task)) return null;
  const res = { ...NO_RES, ...v.res };
  for (const k of RES_KEYS) res[k] += task.reward[k] ?? 0;
  return { ...p, village: { ...v, res, tasks: [...(v.tasks ?? []), id] } };
}
