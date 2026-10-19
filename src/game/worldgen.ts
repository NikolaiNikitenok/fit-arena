// Генератор карты мира: из уровней получается остров с дорогой, реками, деревнями, лесами и горами
// (фэнтези), лунная база (космос) или разрушенный город (зомби). Всё детерминировано: одна и та же
// карта у всех игроков. Чистые данные без three, чтобы проверять тестами.
import type { Placed } from '../three/Instanced';
import type { CharName, LibName } from '../three/kit';
import { LANDS } from './lands';
import { LAND_SIZE, LevelDef } from './levels';

export type Kind =
  | 'village' | 'forest' | 'meadow' | 'swamp' | 'snow' | 'mine' | 'sky' | 'desert' | 'dragon' | 'volcano'
  | 'station' | 'asteroids' | 'crystal' | 'moon' | 'gas' | 'jungle' | 'factory' | 'nebula' | 'rings' | 'flagship'
  | 'town' | 'suburb' | 'metro' | 'hospital' | 'stadium' | 'school' | 'port' | 'mall' | 'skyscraper' | 'tvtower'
  | 'castle';

export const LAND_KINDS: Kind[] = [
  'village', 'forest', 'meadow', 'swamp', 'snow', 'mine', 'sky', 'desert', 'dragon', 'volcano',
  'station', 'asteroids', 'crystal', 'moon', 'gas', 'jungle', 'factory', 'nebula', 'rings', 'flagship',
  'town', 'suburb', 'metro', 'hospital', 'stadium', 'school', 'port', 'mall', 'skyscraper', 'tvtower',
  'castle',
];

// Оттенок земли — множитель цвета текстуры (больше 1 осветляет: так трава становится снегом или песком).
export const TINTS: Partial<Record<Kind, [number, number, number]>> = {
  // Фэнтези: трава в текстуре салатовая (примерно 0.6, 0.8, 0.15).
  village: [0.8, 1.0, 1.6],
  forest: [0.58, 0.75, 1.3],
  meadow: [1.35, 1.0, 1.5],
  swamp: [0.67, 0.62, 1.3],
  snow: [1.5, 1.2, 6.5],
  mine: [0.92, 0.62, 2.6],
  sky: [1.0, 1.06, 2.3],
  desert: [1.55, 1.0, 3.3],
  dragon: [1.0, 0.52, 2.0],
  volcano: [0.42, 0.25, 1.3],
  // Космос: грунт в текстуре оранжевый (примерно 0.85, 0.4, 0.15).
  asteroids: [0.6, 0.9, 1.7],
  crystal: [0.65, 1.0, 5.6],
  moon: [0.82, 1.75, 4.8],
  gas: [1.05, 1.4, 2.0],
  jungle: [0.35, 1.5, 2.3],
  factory: [0.6, 1.25, 3.5],
  nebula: [0.47, 0.75, 4.0],
  rings: [1.0, 1.9, 3.3],
  flagship: [0.35, 0.75, 2.2],
  // Город серый: только приглушаем и подкрашиваем.
  town: [0.85, 0.85, 0.8],
  suburb: [0.95, 0.95, 0.85],
  metro: [0.7, 0.7, 0.72],
  hospital: [0.95, 0.95, 0.95],
  stadium: [0.85, 0.9, 0.8],
  school: [0.95, 0.9, 0.8],
  port: [0.8, 0.85, 0.9],
  mall: [0.85, 0.75, 0.75],
  skyscraper: [0.75, 0.78, 0.85],
  tvtower: [0.7, 0.6, 0.7],
  castle: [0.42, 0.3, 1.6],
};

// Камень гор и скал красим мягче, чем траву.
const STONE: Partial<Record<Kind, [number, number, number]>> = {
  snow: [1.25, 1.3, 1.45],
  desert: [1.25, 1.05, 0.8],
  volcano: [0.5, 0.35, 0.35],
  dragon: [1.05, 0.8, 0.75],
  castle: [0.6, 0.5, 0.75],
};

const tintHex = (k: Kind, extra = 1): string | undefined => {
  const t = TINTS[k];
  if (!t) return extra === 1 ? undefined : rgb([extra, extra, extra]);
  return rgb(t.map((v) => v * extra) as [number, number, number]);
};
// Множители больше 1 не записать обычным цветом, поэтому передаём их строкой 'mul:r,g,b'.
const rgb = ([r, g, b]: [number, number, number]) => `mul:${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)}`;

export const STEP = 3.4;
export const START = 6;

export const levelZ = (i: number) => -(START + i * STEP);

/** Ось дороги: плавные изгибы, у каждого мира свои. */
export function pathX(z: number, world: number): number {
  const p = world * 1.7;
  return 3.2 * Math.sin(z * 0.085 + p) + 1.3 * Math.sin(z * 0.23 + p * 2);
}

function hash(a: number, b: number, c = 0): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

type Pick = [name: string, weight: number, scale?: number];
function choose(list: Pick[], r: number): Pick {
  const total = list.reduce((s, p) => s + p[1], 0);
  let t = r * total;
  for (const p of list) if ((t -= p[1]) <= 0) return p;
  return list[list.length - 1];
}

interface Theme {
  near: Pick[];
  mid: Pick[];
  far: Pick[];
  // Вероятность предмета на клетке по зонам.
  density: [number, number, number];
}

const HOUSES: Pick[] = [
  ['building_home_A_blue', 3], ['building_home_B_red', 3], ['building_home_A_yellow', 3], ['building_home_B_green', 3],
  ['building_well_blue', 1], ['building_windmill_yellow', 1], ['building_tavern_red', 1], ['building_blacksmith_red', 1],
];
const CLUTTER: Pick[] = [['barrel', 2], ['crate_A_big', 2], ['sack', 1], ['wheelbarrow', 1], ['crate_open', 1], ['resource_lumber', 1]];
const TREES: Pick[] = [['trees_A_large', 3], ['trees_A_medium', 3], ['trees_B_large', 2], ['trees_B_medium', 2], ['hills_A_trees', 1]];
const PEAKS: Pick[] = [['mountain_A_grass_trees', 3], ['mountain_B_grass_trees', 3], ['mountain_C_grass', 2], ['hills_B_trees', 2]];

const THEMES: Partial<Record<Kind, Theme>> = {
  village: { near: [...HOUSES, ...CLUTTER, ['tree_single_A', 3], ['fence_wood_straight', 2]], mid: TREES, far: PEAKS, density: [0.75, 0.7, 0.85] },
  forest: { near: [['tree_single_A', 4], ['tree_single_B', 4], ['trees_A_small', 3], ['rock_single_C', 2], ['tent', 1], ['building_lumbermill_green', 0.6]], mid: [['trees_A_large', 5], ['trees_B_large', 5], ['trees_A_medium', 2]], far: [['trees_B_large', 3], ['mountain_A_grass_trees', 2]], density: [0.6, 0.95, 0.9] },
  meadow: { near: [['building_grain', 4], ['building_windmill_yellow', 2], ['building_home_A_yellow', 2], ['fence_wood_straight', 2], ['sack', 2], ['flag_red', 1]], mid: [['building_grain', 3], ['hill_single_A', 2], ['trees_A_small', 2], ['tree_single_A', 2]], far: [['hills_A_trees', 3], ['mountain_C_grass', 2]], density: [0.6, 0.5, 0.7] },
  swamp: { near: [['tree_single_B', 3], ['rock_single_A', 2], ['waterplant_A', 3], ['building_home_B_green', 0.5]], mid: [['trees_B_medium', 3], ['hills_C', 2], ['trees_B_small', 2]], far: [['trees_B_large', 3], ['mountain_C_grass', 1]], density: [0.45, 0.6, 0.8] },
  snow: { near: [['rock_single_C', 3], ['tree_single_A', 3], ['tent', 1], ['building_home_B_red', 1]], mid: [['mountain_A', 3], ['trees_A_medium', 3], ['hill_single_B', 2]], far: [['mountain_A', 4], ['mountain_C_grass', 2]], density: [0.4, 0.7, 0.95] },
  mine: { near: [['building_mine_yellow', 2], ['resource_stone', 3], ['wheelbarrow', 2], ['crate_A_big', 2], ['rock_single_D', 3]], mid: [['mountain_C_grass', 3], ['hills_C', 3], ['rock_single_B', 2]], far: [['mountain_A', 3], ['mountain_B_grass_trees', 2]], density: [0.5, 0.75, 0.95] },
  sky: { near: [['building_home_A_blue', 2], ['building_church_blue', 1], ['tree_single_A', 3], ['flag_blue', 1]], mid: [['trees_A_medium', 3], ['hill_single_A', 2]], far: [['trees_A_small', 1]], density: [0.45, 0.5, 0.25] },
  desert: { near: [['tent', 3], ['rock_single_A', 3], ['resource_stone', 2], ['building_well_blue', 1]], mid: [['hill_single_A', 3], ['rock_single_C', 2], ['tree_single_B', 0.5]], far: [['hills_C', 3], ['mountain_C_grass', 2]], density: [0.35, 0.4, 0.75] },
  dragon: { near: [['building_tower_A_red', 1], ['building_destroyed', 2], ['rock_single_B', 3], ['weaponrack', 1], ['target', 1]], mid: [['mountain_A', 3], ['hills_C', 2], ['trees_B_small', 1]], far: [['mountain_A', 3], ['mountain_B_grass_trees', 2]], density: [0.45, 0.7, 0.95] },
  volcano: { near: [['building_destroyed', 3], ['building_scaffolding', 1], ['rock_single_D', 3], ['building_blacksmith_red', 1]], mid: [['mountain_A', 3], ['rock_single_B', 2]], far: [['mountain_A', 4]], density: [0.4, 0.65, 0.95] },
};

const SPACE_NEAR: Pick[] = [['cargo_A', 3], ['cargo_B_packed', 2], ['containers_A', 2], ['containers_B', 2], ['solarpanel', 2], ['spacetruck', 1], ['rock_A', 3]];
const SPACE_MID: Pick[] = [
  ['basemodule_A', 2], ['basemodule_B', 2], ['basemodule_C', 2], ['basemodule_D', 2], ['basemodule_E', 1], ['landingpad_large', 1],
  ['lander_A', 1], ['drill_structure', 1], ['structure_tall', 1], ['cargodepot_A', 1], ['windturbine_tall', 0.6], ['rocks_B', 2], ['cargo_A_stacked', 1],
];
const SPACE_FAR: Pick[] = [['rocks_B', 3], ['terrain_tall', 3], ['rock_B', 2], ['structure_low', 1]];

const CITY_NEAR: Pick[] = [['car_sedan', 2], ['car_hatchback', 2], ['car_taxi', 1], ['car_police', 1], ['car_stationwagon', 1], ['dumpster', 2], ['trash_A', 2], ['firehydrant', 1], ['bench', 1], ['bush', 2], ['box_A', 1]];
const CITY_BUILD: Pick[] = [['building_A', 2], ['building_B', 2], ['building_C', 2], ['building_D', 2], ['building_E', 2], ['building_F', 2], ['building_G', 2], ['building_H', 2]];

export interface Spot {
  x: number;
  z: number;
}

export interface LandLayout {
  land: number;
  kind: Kind;
  z0: number;
  z1: number;
  merchant: Spot | null;
  chest: Spot | null;
  boss: Spot | null;
  villagers: (Spot & { model: CharName })[];
  enemies: (Spot & { model: CharName })[];
}

export interface WorldLayout {
  lib: LibName;
  world: number;
  tiles: Placed[];
  props: Placed[];
  // Предметы из фэнтези-набора (сундуки, факелы) — в других мирах тоже нужны.
  extras: Placed[];
  path: [number, number][];
  nodes: (Spot & { id: number })[];
  lands: LandLayout[];
  length: number;
  water: string | null;
}

export function generateWorld(levels: LevelDef[]): WorldLayout {
  const world = levels[0].world;
  const lib: LibName = world === 1 ? 'space' : world === 2 ? 'city' : 'fantasy';
  const kindOf = (land: number) => LAND_KINDS[land];
  const n = levels.length;
  const length = START + (n - 1) * STEP + 12;
  const px = (z: number) => pathX(z, world);
  const landAt = (z: number) => {
    const i = Math.max(0, Math.min(n - 1, Math.round((-z - START) / STEP)));
    return levels[i].land;
  };

  const nodes = levels.map((l, i) => ({ id: l.id, x: px(levelZ(i)), z: levelZ(i) }));
  const path: [number, number][] = [];
  for (let z = 3; z > -length + 2; z -= 0.5) path.push([px(z), z]);

  // Места для купца, сундука и босса держим свободными от декора.
  const lands: LandLayout[] = [];
  const landIds = [...new Set(levels.map((l) => l.land))];
  for (const land of landIds) {
    const idx = levels.findIndex((l) => l.land === land);
    const ls = levels.filter((l) => l.land === land);
    const zAt = (k: number) => levelZ(Math.min(n - 1, idx + k));
    const side = hash(land, 7) > 0.5 ? 1 : -1;
    const bossLevel = ls.find((l) => l.type === 'boss');
    const villagerModels: CharName[] = ['Rogue', 'Barbarian', 'Mage', 'Rogue'];
    const enemyModel: CharName = world === 2 ? 'Skeleton_Minion' : land % 2 ? 'Skeleton_Warrior' : 'Skeleton_Minion';
    lands.push({
      land,
      kind: kindOf(land),
      z0: idx === 0 ? 4 : zAt(0) + STEP / 2,
      z1: zAt(ls.length - 1) - STEP / 2,
      merchant: ls.length > 1 ? { x: px(zAt(1)) - side * 3, z: zAt(1) } : null,
      chest: ls.length > 5 ? { x: px(zAt(5)) + side * 2.2, z: zAt(5) } : null,
      boss: bossLevel ? { x: px(levelZ(levels.indexOf(bossLevel))) + side * 3.4, z: levelZ(levels.indexOf(bossLevel)) - 0.5 } : null,
      villagers: ls.length > 1 ? [3, 7].map((k, j) => ({ x: px(zAt(k)) - side * (1.6 + j * 0.4), z: zAt(k) + 0.8, model: villagerModels[(land + j) % 4] })) : [],
      enemies: ls.length > 1 ? [2, 6, 8].map((k, j) => ({ x: px(zAt(k)) + side * (1.7 + j * 0.3), z: zAt(k) - 0.6, model: enemyModel })) : [],
    });
  }
  const reserved: Spot[] = lands.flatMap((l) => [l.merchant, l.chest, l.boss, ...l.villagers, ...l.enemies].filter(Boolean) as Spot[]);
  const free = (x: number, z: number, r: number) => reserved.every((s) => Math.hypot(s.x - x, s.z - z) > r);

  const tiles: Placed[] = [];
  const props: Placed[] = [];
  const extras: Placed[] = [];

  if (lib === 'fantasy') {
    const rows = Math.ceil((length + 8) / 1.732);
    for (let row = 0; row < rows; row++) {
      const z = 6 - row * 1.732;
      for (let c = -10; c <= 10; c++) {
        const x = c * 2 + (row % 2);
        const land = landAt(z);
        const kind = kindOf(land);
        const d = Math.abs(x - px(z));
        const rx = px(z) + (land % 2 ? -1 : 1) * (6.5 + 1.2 * Math.sin(z * 0.07));
        const pond = kind === 'swamp' && d > 2.2 && hash(x, z, 3) < 0.3;
        const ocean = Math.abs(x) > 16.5 - 1.5 * Math.sin(z * 0.11) || z < -length || z > 4;
        const river = Math.abs(x - rx) < 1.05 && kind !== 'sky';
        if (kind === 'sky' && Math.abs(x) > 12) continue; // острова в небе: края обрываются в облака
        if (ocean || river || pond) {
          tiles.push({ name: 'hex_water', x, z, tint: kind === 'volcano' ? 'mul:3.2,1.0,0.25' : kind === 'swamp' ? 'mul:0.65,1.0,0.55' : kind === 'snow' ? 'mul:1.3,1.4,1.5' : undefined });
          if ((river || pond) && hash(x, z, 9) < 0.35) props.push({ name: hash(x, z, 4) < 0.5 ? 'waterlily_A' : 'waterplant_A', x: x + hash(x, z, 5) - 0.5, y: -0.2, z, s: 1.5 });
          continue;
        }
        const tint = tintHex(kind);
        tiles.push({ name: 'hex_grass', x, z, tint });
        if (d < 1.9 || !free(x, z, 1.4)) continue;
        const theme = THEMES[kind] ?? THEMES.village!;
        const zone = d < 4.6 ? 0 : d < 10 ? 1 : 2;
        if (hash(x, z, 1) > theme.density[zone]) continue;
        const [name, , s] = choose(zone === 0 ? theme.near : zone === 1 ? theme.mid : theme.far, hash(x, z, 2));
        const small = /barrel|crate|sack|wheelbarrow|rock_single|flag|target|weaponrack|resource|waterplant/.test(name);
        const count = small ? 1 + Math.floor(hash(x, z, 6) * 3) : 1;
        for (let k = 0; k < count; k++) {
          const jx = small ? (hash(x, z, 10 + k) - 0.5) * 1.3 : (hash(x, z, 10) - 0.5) * 0.3;
          const jz = small ? (hash(x, z, 20 + k) - 0.5) * 1.3 : (hash(x, z, 20) - 0.5) * 0.3;
          const treeLike = /tree|hill/.test(name);
          const stone = /mountain|rock/.test(name) && STONE[kind] ? rgb(STONE[kind]!) : undefined;
          props.push({
            name,
            x: x + jx,
            z: z + jz,
            ry: Math.floor(hash(x, z, 30 + k) * 6) * (Math.PI / 3),
            s: (s ?? 1) * (small ? 1.6 : treeLike ? 0.9 + hash(x, z, 40) * 0.3 : 1),
            tint: treeLike ? tint : stone,
          });
        }
      }
    }
    // Облака над картой; в небесных островах их больше и они ниже.
    for (let i = 0; i < length / 6; i++) {
      const z = -i * 6 + hash(i, 1) * 3;
      const sky = kindOf(landAt(z)) === 'sky';
      for (let k = 0; k < (sky ? 3 : 1); k++)
        props.push({ name: hash(i, k, 2) < 0.5 ? 'cloud_big' : 'cloud_small', x: (hash(i, k, 3) - 0.5) * 34, y: sky ? 1 + hash(i, k) * 2 : 5 + hash(i, k, 4) * 3, z, ry: hash(i, k, 5) * 6, s: 1 + hash(i, k, 6) });
    }
    for (const l of lands) {
      if (l.boss) props.push({ name: l.kind === 'dragon' || l.kind === 'volcano' ? 'building_castle_red' : 'building_castle_blue', x: l.boss.x + Math.sign(l.boss.x - px(l.boss.z)) * 1.2, z: l.boss.z - 1, s: 0.9 });
      if (l.merchant) {
        props.push({ name: 'building_market_green', x: l.merchant.x, z: l.merchant.z - 0.9, ry: 0 });
        props.push({ name: 'tent', x: l.merchant.x - 0.9, z: l.merchant.z + 0.4, s: 1.4 });
      }
    }
  } else {
    // Космос и город — на квадратных плитках 2×2.
    const rows = Math.ceil((length + 8) / 2);
    for (let row = 0; row < rows; row++) {
      const z = 6 - row * 2;
      for (let c = -10; c <= 10; c++) {
        const x = c * 2;
        const land = landAt(z);
        const kind = kindOf(land);
        const d = Math.abs(x - px(z));
        const tint = tintHex(kind);
        if (lib === 'space') {
          const cliff = d > 12 && hash(x, z, 1) < 0.55;
          tiles.push({ name: cliff ? 'terrain_tall' : d > 3 && hash(x, z, 2) < 0.06 ? 'terrain_mining' : 'terrain_low', x, z, tint });
          if (d < 2.2 || cliff || !free(x, z, 1.6)) continue;
          const zone = d < 4.5 ? 0 : d < 11 ? 1 : 2;
          if (hash(x, z, 3) > [0.35, 0.5, 0.5][zone]) continue;
          const [name] = choose(zone === 0 ? SPACE_NEAR : zone === 1 ? SPACE_MID : SPACE_FAR, hash(x, z, 4));
          props.push({ name, x: x + (hash(x, z, 5) - 0.5) * 0.6, z: z + (hash(x, z, 6) - 0.5) * 0.6, ry: Math.floor(hash(x, z, 7) * 4) * (Math.PI / 2), tint: /rock|terrain/.test(name) ? tint : undefined });
          if (name === 'landingpad_large' && hash(x, z, 8) < 0.7) props.push({ name: 'lander_B', x, y: 0.5, z });
        } else {
          tiles.push({ name: 'base', x, z, tint });
          if (d < 2.4 || !free(x, z, 1.6)) continue;
          if (d < 4) {
            if (hash(x, z, 3) < 0.45) {
              const [name] = choose(CITY_NEAR, hash(x, z, 4));
              props.push({ name, x: x + (hash(x, z, 5) - 0.5) * 1.2, z: z + (hash(x, z, 6) - 0.5) * 1.2, ry: hash(x, z, 7) * Math.PI * 2, s: 1.4 });
            }
            continue;
          }
          if (hash(x, z, 8) < (d < 12 ? 0.8 : 0.5)) {
            const [name] = choose(CITY_BUILD, hash(x, z, 9));
            props.push({ name, x, z, ry: x < px(z) ? Math.PI / 2 : -Math.PI / 2, tint: tintHex(kind, 0.95) });
          } else if (hash(x, z, 10) < 0.5) props.push({ name: hash(x, z, 11) < 0.3 ? 'watertower' : 'bush', x, z, s: 1.5 });
        }
      }
    }
    // Фонари вдоль дороги.
    for (let i = 0; i < length / 4; i++) {
      const z = 2 - i * 4;
      const side = i % 2 ? 1 : -1;
      props.push({ name: lib === 'space' ? 'lights' : 'streetlight', x: px(z) + side * 1.7, z, ry: side > 0 ? Math.PI : 0, s: lib === 'space' ? 0.6 : 1.5 });
    }
    for (const l of lands) {
      if (l.merchant) props.push({ name: lib === 'space' ? 'cargodepot_A' : 'building_B', x: l.merchant.x, z: l.merchant.z - 1.4, s: lib === 'space' ? 0.8 : 0.7 });
      if (l.boss) props.push({ name: lib === 'space' ? 'basemodule_garage' : 'building_H', x: l.boss.x + Math.sign(l.boss.x - px(l.boss.z)) * 1.3, z: l.boss.z - 1.2 });
    }
  }

  for (const l of lands) {
    if (l.chest) extras.push({ name: 'torch_lit', x: l.chest.x + 0.5, z: l.chest.z - 0.3, s: 0.35 });
    if (l.merchant) extras.push({ name: 'barrel_small_stack', x: l.merchant.x + 0.8, z: l.merchant.z + 0.2, s: 0.2 }, { name: 'coin_stack_large', x: l.merchant.x + 0.4, z: l.merchant.z + 0.6, s: 0.2 });
    if (l.boss) extras.push({ name: 'banner_red', x: l.boss.x - 0.8, z: l.boss.z + 0.6, s: 0.3 }, { name: 'banner_red', x: l.boss.x + 0.8, z: l.boss.z + 0.6, s: 0.3 });
  }

  const water = lib === 'fantasy' ? '#3b8fd0' : null;
  return { lib, world, tiles, props, extras, path, nodes, lands, length, water };
}

export const landSize = LAND_SIZE;
export const landKind = (land: number): Kind => LAND_KINDS[land];
export const landName = (land: number) => LANDS[land].name;
