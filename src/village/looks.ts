import type { LibName } from '../three/kit';
import type { BuildingType } from '../../shared/village';

// Как выглядит постройка на каждом уровне. Три ступени: 1–2 — дерево, 3–5 — камень, 6–8 — крепость
// с золотой отделкой, флагами и башенками; внутри ступени каждый уровень добавляет свои детали (NEW_PARTS). Тот же вид рисуют
// деревня, бой, призрак при расстановке и превью в меню стройки.
// Координаты — от центра постройки в клетках; y — высота над землёй.

export interface KitPart {
  lib: LibName;
  name: string;
  s: number;
  x: number;
  z: number;
  y: number;
  ry: number;
  tint?: string;
}

export type PrimKind = 'box' | 'cyl' | 'cone';
/** Простая деталь (цоколь, золотая кайма, шпиль, труба): единичная фигура, растянутая по осям. */
export interface Prim {
  k: PrimKind;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  c: string;
  // Повороты (рад): лежащее бревно, повёрнутый ящик.
  rx?: number;
  ry?: number;
  rz?: number;
  // Светится тёплым светом сам (окна, фонари, горн): без освещения и теней.
  glow?: boolean;
}

/**
 * Движущаяся деталь: дым из трубы, флаг на ветру, пила лесопилки, вывеска таверны, искры кузни,
 * вагонетка рудника. Как именно движется — src/village/anim3d.ts.
 */
export type AnimKind = 'smoke' | 'flag' | 'saw' | 'sign' | 'spark' | 'cart';
export interface Anim {
  k: AnimKind;
  x: number;
  y: number;
  z: number;
  s: number;
  ry: number;
  c: string;
  // Сдвиг по фазе, чтобы соседние флаги и дымки не двигались в такт.
  ph: number;
}

export interface Look {
  kit: KitPart[];
  prim: Prim[];
  anim: Anim[];
  // Высота верхушки: над ней висят таймер и пузырь ресурса.
  top: number;
  // Радиус мягкой тени под постройкой (0 — без тени).
  blob: number;
}

export const SIZE: Record<BuildingType, number> = { townhall: 3, lumbermill: 2, quarry: 2, goldmine: 2, storage: 2, barracks: 2, forge: 2, tavern: 2, market: 2, tower: 2, catapult: 2, wall: 1, lab: 2, bomb: 1, snare: 1 };

/** Ступень вида: 0 — дерево (1–2), 1 — камень (3–5), 2 — крепость (6–8). */
export const stageOf = (l: number) => (l >= 6 ? 2 : l >= 3 ? 1 : 0);

// Где лежит синяя (своя) модель и чем её заменить у Князя Дивана.
const OWN: Record<string, LibName> = {
  building_lumbermill_blue: 'village', building_mine_blue: 'village', building_market_blue: 'village', building_blacksmith_blue: 'village',
  building_tavern_blue: 'village', building_tower_A_blue: 'village', building_barracks_blue: 'village', building_tower_catapult_blue: 'village',
  building_tower_B_blue: 'village', building_tower_base_blue: 'village', building_home_B_blue: 'village', building_windmill_blue: 'village',
  building_castle_blue: 'fantasy', building_home_A_blue: 'fantasy', building_well_blue: 'fantasy', building_church_blue: 'fantasy',
};
const ENEMY: Record<string, [LibName, string]> = {
  building_lumbermill_blue: ['fantasy', 'building_lumbermill_green'], building_mine_blue: ['fantasy', 'building_mine_yellow'],
  building_market_blue: ['fantasy', 'building_market_green'], building_blacksmith_blue: ['fantasy', 'building_blacksmith_red'],
  building_tavern_blue: ['fantasy', 'building_tavern_red'], building_tower_A_blue: ['fantasy', 'building_tower_A_red'],
  building_castle_blue: ['fantasy', 'building_castle_red'], building_barracks_blue: ['village', 'building_barracks_red'],
  building_tower_catapult_blue: ['village', 'building_tower_catapult_red'], building_tower_B_blue: ['village', 'building_tower_B_red'],
  building_tower_base_blue: ['village', 'building_tower_base_red'], building_home_B_blue: ['fantasy', 'building_home_B_red'],
  building_home_A_blue: ['village', 'building_home_A_red'], building_well_blue: ['village', 'building_well_red'],
  building_church_blue: ['village', 'building_church_red'], building_windmill_blue: ['fantasy', 'building_windmill_yellow'],
};
// Мелочи, которые есть только в библиотеке деревни.
const VILLAGE_ONLY = new Set(['crate_A_small', 'crate_B_small', 'crate_B_big', 'crate_long_B', 'bucket_empty', 'projectile_catapult', 'fence_wood_straight_gate', 'bush', 'pallet', 'crate_long_A', 'tree_single_A_cut', 'trees_A_cut', 'bucket_arrows', 'building_stage_B', 'building_stage_C', 'rock_single_E', 'building_dirt']);

export const STONE = '#a3a7ad';
export const STONE_D = '#7f848c';
export const GOLD = '#f4c24f';
export const WOOD = '#9b6b3f';
const WOOD_D = '#6f4a2a';
const BRICK = '#8b5a44';
const IRON = '#3b3f48';
const HAY = '#e3c25a';
const MAGIC = '#8affc1';
// Тёплый свет окон и фонарей.
export const WARM = '#ffcf6e';
const ROOF_OWN = '#3f6fc4';
const ROOF_ENEMY = '#c0453c';

class Builder {
  kit: KitPart[] = [];
  prim: Prim[] = [];
  anim: Anim[] = [];
  top = 2.6;
  blob = 1.25;
  // Подъём на цоколь: всё, что ставится после цоколя, стоит на нём.
  y0 = 0;
  constructor(public enemy: boolean) {}
  /** Модель KayKit; у синих построек Князь получает свою, красную или жёлтую. */
  m(name: string, s: number, x = 0, z = 0, ry = 0, y = this.y0, tint?: string) {
    let lib: LibName = OWN[name] ?? (VILLAGE_ONLY.has(name) ? 'village' : 'fantasy');
    if (this.enemy && ENEMY[name]) [lib, name] = ENEMY[name];
    this.kit.push({ lib, name, s, x, z, y, ry, tint });
    return this;
  }
  p(k: PrimKind, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, r?: { rx?: number; ry?: number; rz?: number; glow?: boolean }) {
    this.prim.push({ k, x, y, z, sx, sy, sz, c, ...r });
    return this;
  }
  /** Светящаяся деталь: окно, огонёк фонаря, жерло горна. */
  glow(k: PrimKind, x: number, y: number, z: number, sx: number, sy: number, sz: number, c = WARM, ry?: number) {
    return this.p(k, x, y, z, sx, sy, sz, c, { glow: true, ry });
  }
  a(k: AnimKind, x: number, y: number, z: number, s = 1, ry = 0, c = '#ffffff') {
    this.anim.push({ k, x, y, z, s, ry, c, ph: ((x * 7.3 + z * 3.1 + this.anim.length * 1.7) % 6.28 + 6.28) % 6.28 });
    return this;
  }
  /** Цоколь под постройкой: камень на 2-й ступени, тёмный камень с золотой каймой на 3-й. */
  plinth(stage: number, half: number) {
    if (stage === 0) return this;
    const w = half * 2 - 0.12;
    if (stage === 1) {
      this.p('box', 0, 0.05, 0, w, 0.1, w, STONE);
      this.y0 = 0.1;
    } else {
      this.p('box', 0, 0.07, 0, w, 0.14, w, STONE_D).p('box', 0, 0.155, 0, w + 0.04, 0.03, w + 0.04, GOLD);
      this.y0 = 0.17;
    }
    return this;
  }
  /** Флаг на шесте: синий у своих, красный у Князя; на 3-й ступени шест золотой с навершием. */
  flag(x: number, z: number, stage: number, y = this.y0, s = 1) {
    const h = 0.95 * s;
    this.p('cyl', x, y + h / 2, z, 0.06, h, 0.06, stage >= 2 ? GOLD : WOOD_D);
    // Полотнище машет на ветру; смотрит на камеру боком, чтобы было видно, как оно колышется.
    this.a('flag', x, y + h - 0.15 * s, z, s, Math.PI / 4, this.enemy ? ROOF_ENEMY : ROOF_OWN);
    if (stage >= 2) this.p('cone', x, y + h + 0.06, z, 0.12, 0.14, 0.12, GOLD);
    return this;
  }
  /** Кирпичная труба с дымом. */
  chimney(x: number, z: number, y: number, h: number, smoke = true) {
    this.p('box', x, y + h / 2, z, 0.26, h, 0.26, BRICK).p('box', x, y + h + 0.03, z, 0.32, 0.07, 0.32, STONE_D);
    if (smoke) this.a('smoke', x, y + h + 0.08, z);
    return this;
  }
  /** Фонарь на столбе: тёплый огонёк, как будто вечереет. */
  lantern(x: number, z: number, h = 0.62) {
    const y = this.y0;
    this.p('cyl', x, y + h / 2, z, 0.05, h, 0.05, WOOD_D).p('box', x, y + h + 0.02, z, 0.16, 0.04, 0.16, IRON);
    this.glow('box', x, y + h + 0.11, z, 0.11, 0.14, 0.11);
    return this.p('cone', x, y + h + 0.24, z, 0.2, 0.12, 0.2, IRON);
  }
  /** Ящик с цветами у стены. */
  flowers(x: number, z: number, ry = 0, y = this.y0) {
    this.p('box', x, y + 0.06, z, 0.42, 0.12, 0.14, WOOD_D, { ry }).p('box', x, y + 0.14, z, 0.38, 0.05, 0.1, '#5d9b3a', { ry });
    const cx = Math.cos(ry);
    const sz = -Math.sin(ry);
    ['#ff6b81', '#ffd27a', '#f48fb1'].forEach((c, k) => this.p('box', x + (k - 1) * 0.12 * cx, y + 0.19, z + (k - 1) * 0.12 * sz, 0.07, 0.06, 0.07, c, { ry }));
    return this;
  }
  /** Тюк сена. */
  hay(x: number, z: number, ry = 0, y = this.y0) {
    return this.p('box', x, y + 0.11, z, 0.38, 0.22, 0.24, HAY, { ry }).p('box', x, y + 0.11, z, 0.06, 0.23, 0.25, '#b8913a', { ry });
  }
  /** Поленница из трёх брёвен; along — брёвна лежат вдоль x (иначе вдоль z). */
  logs(x: number, z: number, along = true, y = this.y0) {
    for (const [d, dy, c] of [[-0.07, 0.06, WOOD], [0.07, 0.06, WOOD_D], [0, 0.17, WOOD]] as const) {
      if (along) this.p('cyl', x, y + dy, z + d, 0.12, 0.5, 0.12, c, { rz: Math.PI / 2 });
      else this.p('cyl', x + d, y + dy, z, 0.12, 0.5, 0.12, c, { rx: Math.PI / 2 });
    }
    return this;
  }
  /** Козлы с бревном и крутящейся пилой; ry — куда смотрит диск. */
  saw(x: number, z: number, ry = 0) {
    const y = this.y0;
    const cx = Math.cos(ry);
    const sz = -Math.sin(ry);
    // Козлы вдоль диска, бревно поперёк.
    this.p('box', x, y + 0.11, z, 0.56, 0.22, 0.2, WOOD_D, { ry });
    this.p('cyl', x - 0.14 * cx, y + 0.27, z - 0.14 * sz, 0.12, 0.42, 0.12, WOOD, { rz: Math.PI / 2, ry: ry + Math.PI / 2 });
    return this.a('saw', x + 0.12 * cx, y + 0.34, z + 0.12 * sz, 1.35, ry);
  }
  /** Наковальня у горна и искры над ней. */
  anvil(x: number, z: number) {
    const y = this.y0;
    this.p('box', x, y + 0.07, z, 0.2, 0.14, 0.16, WOOD_D).p('box', x, y + 0.17, z, 0.12, 0.08, 0.1, IRON).p('box', x, y + 0.24, z, 0.28, 0.07, 0.13, IRON);
    return this.a('spark', x, y + 0.3, z);
  }
  /** Рельсы и вагонетка, которая по ним катается; along — вдоль x. */
  rails(x: number, z: number, along = true, ore = '#7a6a58') {
    const y = this.y0;
    const ry = along ? 0 : Math.PI / 2;
    for (const d of [-0.07, 0.07]) this.p('box', x + (along ? 0 : d), y + 0.015, z + (along ? d : 0), along ? 0.95 : 0.03, 0.03, along ? 0.03 : 0.95, IRON);
    for (const d of [-0.36, -0.12, 0.12, 0.36]) this.p('box', x + (along ? d : 0), y + 0.008, z + (along ? 0 : d), along ? 0.05 : 0.24, 0.016, along ? 0.24 : 0.05, WOOD_D);
    return this.a('cart', x, y + 0.02, z, 1, ry, ore);
  }
  /** Вывеска на столбе с перекладиной; качается на ветру. */
  sign(x: number, z: number, c: string, ry = Math.PI / 4) {
    const y = this.y0;
    const h = 0.95;
    // Перекладина и вывеска — вдоль оси ry: так вывеска видна с камеры плашмя.
    const dx = 0.2 * Math.cos(ry);
    const dz = -0.2 * Math.sin(ry);
    this.p('cyl', x, y + h / 2, z, 0.06, h, 0.06, WOOD_D).p('box', x + dx, y + h - 0.04, z + dz, 0.44, 0.04, 0.04, WOOD_D, { ry });
    return this.a('sign', x + dx, y + h - 0.06, z + dz, 1, ry, c);
  }
  /** Костёр: поленья, огонь и дымок. */
  campfire(x: number, z: number) {
    const y = this.y0;
    this.p('box', x, y + 0.04, z, 0.34, 0.06, 0.08, WOOD_D, { ry: 0.5 }).p('box', x, y + 0.04, z, 0.34, 0.06, 0.08, WOOD, { ry: -0.6 });
    this.glow('cone', x, y + 0.16, z, 0.2, 0.24, 0.2, '#ff9a3d').glow('cone', x, y + 0.2, z, 0.11, 0.2, 0.11, WARM);
    return this.a('smoke', x, y + 0.3, z, 0.7);
  }
  /** Деревянная кайма вокруг двора на деревянной ступени. */
  yard(half: number) {
    const w = half * 2 - 0.1;
    for (const [x, z, sx, sz] of [[0, half - 0.05, w, 0.08], [0, -half + 0.05, w, 0.08], [half - 0.05, 0, 0.08, w], [-half + 0.05, 0, 0.08, w]])
      this.p('box', x, 0.03, z, sx, 0.06, sz, WOOD_D);
    return this;
  }
  /** Деревянный заборчик из кольев вдоль стороны. */
  stakes(x0: number, z0: number, x1: number, z1: number, n: number) {
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? 0.5 : k / (n - 1);
      this.p('box', x0 + (x1 - x0) * a, 0.17, z0 + (z1 - z0) * a, 0.07, 0.34, 0.07, k % 2 ? WOOD_D : WOOD);
    }
    this.p('box', (x0 + x1) / 2, 0.24, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.06, 0.04, Math.abs(z1 - z0) + 0.06, WOOD);
    return this;
  }
  /** Башенка-столбик с конусной крышей. */
  turret(x: number, z: number, h: number, gold: boolean) {
    this.p('cyl', x, this.y0 + h / 2, z, 0.3, h, 0.3, STONE).p('cyl', x, this.y0 + h + 0.03, z, 0.36, 0.06, 0.36, gold ? GOLD : STONE_D);
    return this.p('cone', x, this.y0 + h + 0.24, z, 0.36, 0.38, 0.36, gold ? GOLD : this.enemy ? ROOF_ENEMY : ROOF_OWN);
  }
  /** Смещение на d вдоль оси ry (как поворачивает three.js): x — cos, z — −sin. */
  private along(x: number, z: number, ry: number, d: number): [number, number] {
    return [x + d * Math.cos(ry), z - d * Math.sin(ry)];
  }
  /** Подъёмный кран: столб, стрела вдоль ry и груз на верёвке. */
  crane(x: number, z: number, load: string, ry = 0, h = 1.5) {
    const y = this.y0;
    this.p('cyl', x, y + h / 2, z, 0.09, h, 0.09, WOOD_D).p('box', x, y + 0.04, z, 0.3, 0.08, 0.3, WOOD_D);
    const [bx, bz] = this.along(x, z, ry, 0.32);
    this.p('box', bx, y + h - 0.05, bz, 0.8, 0.07, 0.07, WOOD, { ry });
    // Подкос под стрелой.
    const [sx, sz] = this.along(x, z, ry, 0.15);
    this.p('box', sx, y + h - 0.25, sz, 0.42, 0.05, 0.05, WOOD_D, { ry, rz: 0.75 });
    const [hx, hz] = this.along(x, z, ry, 0.66);
    this.p('cyl', hx, y + h - 0.32, hz, 0.02, 0.5, 0.02, '#d9c9a3');
    return this.p('box', hx, y + h - 0.66, hz, 0.24, 0.2, 0.24, load, { ry: 0.3 });
  }
  /** Стол со скамьями под открытым небом; ry — вдоль чего стоит стол. */
  table(x: number, z: number, ry = 0) {
    const y = this.y0;
    this.p('box', x, y + 0.27, z, 0.52, 0.05, 0.28, WOOD, { ry }).p('box', x, y + 0.13, z, 0.36, 0.24, 0.08, WOOD_D, { ry });
    for (const d of [-0.25, 0.25]) {
      const bx = x - d * Math.sin(ry);
      const bz = z - d * Math.cos(ry);
      this.p('box', bx, y + 0.13, bz, 0.5, 0.05, 0.1, WOOD_D, { ry }).p('box', bx, y + 0.06, bz, 0.06, 0.12, 0.06, WOOD_D, { ry });
    }
    // Кружки на столе.
    return this.p('cyl', x - 0.1, y + 0.33, z, 0.06, 0.08, 0.06, '#d9c9a3').p('cyl', x + 0.12, y + 0.33, z + 0.04, 0.06, 0.08, 0.06, '#d9c9a3');
  }
  /** Торговый лоток с полосатым навесом и товаром. */
  stall(x: number, z: number, c: string, ry = 0) {
    const y = this.y0;
    this.p('box', x, y + 0.14, z, 0.52, 0.28, 0.26, WOOD, { ry });
    for (const d of [-0.22, 0.22]) {
      const [px, pz] = this.along(x, z, ry, d);
      this.p('box', px, y + 0.38, pz, 0.04, 0.5, 0.04, WOOD_D);
    }
    this.p('box', x, y + 0.64, z, 0.6, 0.04, 0.34, c, { ry, rx: 0.25 }).p('box', x, y + 0.665, z, 0.2, 0.045, 0.34, '#fff4e0', { ry, rx: 0.25 });
    const fruit = ['#e84a4a', '#ffd27a', '#7ac74f'];
    fruit.forEach((f, k) => {
      const [fx, fz] = this.along(x, z, ry, (k - 1) * 0.15);
      this.p('box', fx, y + 0.32, fz, 0.11, 0.08, 0.11, f, { ry });
    });
    return this;
  }
  /** Точильный круг на станине. */
  grindstone(x: number, z: number, ry = 0) {
    const y = this.y0;
    this.p('box', x, y + 0.1, z, 0.3, 0.2, 0.12, WOOD_D, { ry });
    return this.p('cyl', x, y + 0.28, z, 0.32, 0.08, 0.32, STONE, { rx: Math.PI / 2, ry }).p('cyl', x, y + 0.28, z, 0.06, 0.12, 0.06, IRON, { rx: Math.PI / 2, ry });
  }
  /** Гора руды или самоцветов: несколько гранёных камней. */
  pile(x: number, z: number, c: string, s = 1) {
    const y = this.y0;
    this.p('cone', x, y + 0.11 * s, z, 0.42 * s, 0.22 * s, 0.42 * s, c);
    this.p('box', x + 0.1 * s, y + 0.2 * s, z - 0.05 * s, 0.11 * s, 0.11 * s, 0.11 * s, c, { ry: 0.6, rx: 0.4 });
    return this.p('box', x - 0.1 * s, y + 0.16 * s, z + 0.08 * s, 0.1 * s, 0.1 * s, 0.1 * s, c, { ry: 1.1, rz: 0.5 });
  }
  /** Знамя на шесте с перекладиной: висит неподвижно, цвета своего войска. */
  banner(x: number, z: number, ry = Math.PI / 4, gold = false) {
    const y = this.y0;
    const h = 1.05;
    this.p('cyl', x, y + h / 2, z, 0.05, h, 0.05, gold ? GOLD : WOOD_D).p('box', x, y + h - 0.03, z, 0.36, 0.035, 0.035, gold ? GOLD : WOOD_D, { ry });
    this.p('box', x, y + h - 0.27, z, 0.3, 0.44, 0.02, this.enemy ? ROOF_ENEMY : ROOF_OWN, { ry });
    return this.p('box', x, y + h - 0.25, z, 0.1, 0.1, 0.025, gold ? GOLD : '#f2efe6', { ry });
  }
  /**
   * Полотнище на стене: face 'z' — на передней грани (смотрит на +z), 'x' — на правой (+x).
   * Цвет своего войска, по низу — кайма (золотая у крепости).
   */
  drape(face: 'x' | 'z', x: number, y: number, z: number, w: number, h: number, gold = false) {
    const c = this.enemy ? ROOF_ENEMY : ROOF_OWN;
    const ry = face === 'z' ? 0 : Math.PI / 2;
    this.p('box', x, y, z, w, h, 0.02, c, { ry });
    this.p('box', x, y - h / 2 + 0.03, z, w + 0.02, 0.06, 0.03, gold ? GOLD : '#f2efe6', { ry });
    return this.p('box', x, y + 0.04, z, w * 0.4, w * 0.4, 0.03, gold ? GOLD : '#f2efe6', { ry: ry, rz: Math.PI / 4 });
  }
  /** Гирлянда огоньков между двумя точками, с провисанием посередине. */
  garland(x0: number, z0: number, x1: number, z1: number, y: number, n = 7) {
    const colors = [WARM, '#ff8a6b', '#8affc1', '#ffd27a'];
    for (let k = 0; k < n; k++) {
      const a = k / (n - 1);
      const sag = 0.16 * 4 * a * (1 - a);
      this.glow('box', x0 + (x1 - x0) * a, y - sag, z0 + (z1 - z0) * a, 0.07, 0.07, 0.07, colors[k % colors.length]);
    }
    return this;
  }
  /** Факел: столб и огонёк. */
  torch(x: number, z: number) {
    return this.p('cyl', x, this.y0 + 0.25, z, 0.06, 0.5, 0.06, WOOD_D).glow('cone', x, this.y0 + 0.58, z, 0.14, 0.18, 0.14, '#ffb43d');
  }
  done(): Look {
    return { kit: this.kit, prim: this.prim, anim: this.anim, top: this.top, blob: this.blob };
  }
}

// Углы двухклеточной постройки, видимые с камеры (она смотрит с юго-востока, +x +z).
const L = [-0.82, 0.82] as const; // левый угол на экране
const R = [0.82, -0.82] as const; // правый
const F = [0.82, 0.82] as const; // ближний

/** Вид ратуши: заметно меняется на каждом уровне. */
function townhall(l: number, enemy: boolean): Look {
  const b = new Builder(enemy);
  const st = stageOf(l);
  if (l <= 2) {
    // Деревянный дом старосты с пристройкой. На 2-м уровне хозяйство растёт: мельница за домом,
    // колодец, флаг, фонарь и забор уже с двух сторон.
    b.m('building_home_B_blue', l === 1 ? 1.55 : 1.75, -0.15, -0.1, Math.PI / 6);
    b.m('building_home_A_blue', l === 1 ? 1.0 : 1.15, 0.85, -0.75, -Math.PI / 5);
    b.stakes(-1.35, 1.35, 0.6, 1.35, 6);
    if (l === 1) b.m('crate_A_big', 2.2, 0.95, 0.95).m('barrel', 2.4, 1.15, 0.6);
    else {
      b.m('building_windmill_blue', 1.0, -1.0, 0.2, Math.PI / 4).m('crate_A_big', 2.1, 1.0, 0.9).m('barrel', 2.3, 1.2, 0.5);
      b.m('building_well_blue', 1.0, 0.3, 1.0).flag(1.3, -1.3, 0).lantern(-0.45, 1.12).hay(1.3, -0.15, 0.3);
    }
    b.top = l === 1 ? 2.8 : 3.4;
    return b.done();
  }
  b.plinth(st, 1.5);
  const cs = [0.95, 1.0, 1.05, 1.1, 1.15, 1.2][l - 3];
  b.m('building_castle_blue', cs, 0, 0, Math.PI / 6, b.y0, l === 8 ? 'mul:1.12,1.06,0.92' : undefined);
  const c = 1.22;
  // Башни по углам: 4 — две низкие спереди, 5 — две высокие, 6 — и сзади, 7–8 — четыре большие.
  if (l === 4) b.m('building_tower_base_blue', 0.7, -c, c).m('building_tower_base_blue', 0.7, c, -c);
  if (l === 5 || l === 6) b.m('building_tower_A_blue', 0.78, -c, c).m('building_tower_A_blue', 0.78, c, -c);
  if (l === 6) b.m('building_tower_base_blue', 0.7, -c, -c).m('building_tower_base_blue', 0.7, c, c, 0, b.y0);
  if (l >= 7) for (const [x, z] of [[-c, c], [c, -c], [-c, -c], [c, c]]) b.m('building_tower_B_blue', 0.72, x, z);
  // Флаги на башнях.
  const towerTop = l >= 7 ? 0.72 * 2.49 : l >= 5 ? 0.78 * 2.19 : 0.7 * 1.5;
  if (l >= 4) {
    b.flag(-c, c, st, b.y0 + towerTop, 0.8);
    b.flag(c, -c, st, b.y0 + towerTop, 0.8);
  }
  if (l >= 6) b.flag(c, c, st, b.y0 + (l >= 7 ? towerTop : 0.7 * 1.5), 0.8);
  if (l === 3) b.flag(-1.3, 1.3, st).flag(1.3, -1.3, st);
  // Золотой шпиль над донжоном и казна у ворот.
  if (l >= 7) b.p('cone', 0, b.y0 + 3.98 * cs + 0.05, 0, 0.42, 0.9, 0.42, GOLD);
  if (l === 8) b.m('coin_stack_large', 0.32, 1.25, 1.25).m('chest_gold', 0.28, 0.75, 1.32, -Math.PI / 4).torch(1.45, 0.4).torch(0.4, 1.45);
  b.top = b.y0 + 3.98 * cs + (l >= 7 ? 1.1 : 0.6);
  return b.done();
}

/**
 * Стена уровня l: оттенок камня, размер столба и навершие (от центра столба). Каждый уровень своё:
 * 1 — светлый камень, 2 — деревянная шапка, 3 — серый камень с плитой, 4 — железные шипы,
 * 5 — синеватый камень, 6 — золотое навершие, 7 — и золотой пояс, 8 — светящийся камень на вершине.
 */
export function wallLook(l: number): { tint?: string; cs: number; prim: Prim[] } {
  const tint = l >= 5 ? 'mul:0.8,0.85,1' : l >= 3 ? undefined : 'mul:1.15,1.05,0.9';
  const cs = 0.55 + 0.03 * l;
  const top = 1.4 * cs;
  const prim: Prim[] = [];
  const box = (y: number, sx: number, sy: number, c: string, k: PrimKind = 'box', glow = false) => prim.push({ k, x: 0, y, z: 0, sx, sy, sz: sx, c, glow: glow || undefined });
  if (l === 2) box(top + 0.1, 0.42, 0.2, WOOD, 'cone');
  if (l >= 3 && l <= 5) box(top + 0.04, 0.5, 0.08, l === 5 ? '#8a93a6' : STONE_D);
  if (l === 4 || l === 5) for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) prim.push({ k: 'cone', x: dx, y: top + 0.16, z: dz, sx: 0.09, sy: 0.18, sz: 0.09, c: IRON });
  if (l >= 6) box(top + 0.12, 0.32, 0.26, GOLD, 'cone');
  if (l >= 7) box(top * 0.55, 0.46, 0.06, GOLD);
  if (l === 8) box(top + 0.32, 0.12, 0.14, '#7fe6ff', 'box', true);
  return { tint, cs, prim };
}

/** Вид постройки уровня l (у Князя — enemy). */
export function lookOf(t: BuildingType, l: number, enemy = false): Look {
  if (t === 'townhall') return townhall(Math.max(1, Math.min(8, l)), enemy);
  const b = new Builder(enemy);
  l = Math.max(1, Math.min(8, l));
  const st = stageOf(l);
  // Внутри ступени постройка понемногу растёт.
  const g = 1 + 0.03 * (l - 1);
  if (t === 'bomb' || t === 'snare') return trapLook(t, l, false);
  if (t === 'wall') {
    // Для превью: столб и две секции.
    const w = wallLook(l);
    b.m('column', w.cs, 0, 0, 0, 0, w.tint).m('wall_straight', 0.5, 0.5, 0, 0, 0, w.tint).m('wall_straight', 0.5, 0, 0.5, Math.PI / 2, 0, w.tint);
    b.prim.push(...w.prim);
    b.top = 1.2;
    return b.done();
  }
  b.plinth(st, 1);
  // Деревянная ступень: двор обведён брусом, у камня и крепости — цоколь.
  if (st === 0) b.yard(1);
  b.blob = 1.42;
  // Каждый уровень что-то добавляет: 2 — хозяйство побольше, 3 — камень, флаги и фонарь, 4 и 5 — новые
  // постройки во дворе, 6 — крепостной цоколь с золотом, 7 — башенка, 8 — факелы и золотое знамя.
  switch (t) {
    case 'lumbermill':
      b.m('building_lumbermill_blue', 1.3 * g, 0, 0);
      b.m('resource_lumber', 1.5, 0.45, 0.78, 0.2);
      if (st === 0) b.m('tree_single_A_cut', 2.2, -0.8, 0.75).m('tree_single_A_cut', 1.8, -0.75, -0.75).stakes(-0.95, 0.95, 0.1, 0.95, 4);
      if (l === 2) b.logs(-0.35, 0.55).m('wheelbarrow', 1.5, 0.85, 0.15, -1.2).lantern(0.92, 0.92);
      if (st >= 1) b.m('pallet', 2.2, -0.62, 0.7).m('crate_long_A', 2, -0.62, 0.7, 0.4, b.y0 + 0.17).lantern(0.92, 0.92);
      if (l >= 4) b.chimney(-0.45, -0.45, b.y0, 1.9).m('ladder', 1.4, 0.2, 0.62, 0, b.y0);
      if (l >= 5) b.m('resource_lumber', 1.3, 0.8, -0.2, 1.4).drape('z', 0.0, b.y0 + 0.75, 0.62, 0.32, 0.42);
      if (l >= 6) b.crane(0.9, 0.2, WOOD, Math.PI / 2, 1.7);
      // Пила крутится на козлах у правого края двора.
      b.saw(0.86, l >= 5 ? -0.75 : -0.35, Math.PI / 2);
      if (st === 0) b.logs(0.15, 0.55);
      break;
    case 'quarry':
      b.m('resource_stone', 2.6 * g, -0.1, 0.2).m('rock_single_C', 3.2 * g, 0.5, -0.4).m('rock_single_A', 3, -0.5, -0.5).m('wheelbarrow', 1.6, 0.5, 0.55, 0.6);
      if (st === 0) b.m('rock_single_E', 2.2, -0.75, 0.75).m('bucket_empty', 2.2, 0.85, -0.2);
      if (l === 2) b.m('ladder', 1.5, 0.3, -0.15, Math.PI / 2, 0).m('resource_stone', 1.3, 0.85, 0.15).lantern(-0.3, 0.92);
      if (st >= 1) b.m('building_stage_B', 1.05, -0.35, -0.45, Math.PI / 3).m('crate_A_big', 2, 0.85, 0.15).lantern(-0.9, 0.9);
      if (l >= 4) b.crane(0.75, -0.75, STONE, Math.PI);
      if (l >= 5) b.p('box', -0.75, b.y0 + 0.11, 0.35, 0.3, 0.22, 0.3, STONE).p('box', -0.75, b.y0 + 0.33, 0.35, 0.24, 0.22, 0.24, STONE_D, { ry: 0.4 });
      if (st >= 2) b.m('building_tower_base_blue', 0.62, -0.7, -0.65).m('resource_stone', 1.8, 0.85, 0.85);
      // Вагонетка с камнем возит его вдоль переднего края.
      b.rails(-0.05, 0.86, true, STONE);
      break;
    case 'goldmine':
      b.m('building_mine_blue', 1.1 * g, 0, 0);
      if (st === 0) b.m('bucket_water', 2.2, 0.85, 0.85).stakes(0.95, 0.95, 0.95, -0.2, 4);
      if (l === 2) b.pile(-0.7, 0.5, GOLD, 1.1).lantern(0.9, -0.55);
      if (st >= 1) b.m('wheelbarrow', 1.7, 0.8, 0.75, -0.5).m('crate_A_big', 2.2, -0.85, 0.8).lantern(0.9, -0.55);
      if (l >= 4) b.pile(-0.8, 0.2, GOLD, 1.2).m('sack', 2.6, -0.45, 0.9).drape('z', 0.05, b.y0 + 0.95, 0.75, 0.3, 0.36);
      if (l >= 5) b.crane(0.85, 0.1, '#6b5a48', Math.PI / 2, 1.3);
      if (st >= 2) b.m('coin_stack_large', 0.3, 0.2, 0.92).m('chest_gold', 0.24, 0.92, -0.35, -Math.PI / 2);
      // Вагонетка с рудой выкатывается из штольни.
      b.rails(-0.1, st >= 2 ? 0.62 : 0.86, true, '#6b5a48');
      break;
    case 'storage':
      b.m('building_grain', 0.95 * g, 0, 0).m('crates_stacked', 0.38, -0.35, -0.3).m('barrel', 2.2, 0.45, 0.35).m('sack', 3, 0.1, 0.55);
      if (st === 0) b.hay(0.82, -0.3, 0.3).m('crate_A_small', 2.4, -0.8, 0.82);
      if (l === 2) b.hay(0.84, 0.15, -0.2).hay(0.83, -0.08, 0, b.y0 + 0.22).m('barrel', 2, -0.85, 0.4).lantern(0.9, 0.9);
      if (st >= 1) b.m('barrel_small_stack', 0.32, 0.35, -0.55).m('crate_A_big', 2.4, -0.55, 0.5).flowers(0.85, 0.85, Math.PI / 4).lantern(-0.9, 0.9);
      if (l >= 4) b.m('building_windmill_blue', 0.9, -0.6, -0.6, Math.PI / 4);
      if (l >= 5) b.m('barrel_large', 0.3, -0.62, 0.05).m('sack', 2.6, 0.85, 0.2).m('sack', 2.4, 0.75, 0.38, 0.8);
      if (st >= 2) b.m('chest_gold', 0.26, 0.55, 0.62, Math.PI / 4).m('coin_stack_large', 0.22, 0.05, 0.75);
      break;
    case 'barracks':
      if (st === 0) {
        // Лагерь из палаток с костром: настоящие казармы — с камня.
        b.m('tent', 1.9, -0.45, -0.35, 0.3).m('tent', 1.6, 0.5, -0.5, -0.4).m('weaponrack', 2.6, 0.6, 0.55, -Math.PI / 4).m('target', 2.6, -0.55, 0.65, Math.PI / 5);
        if (l === 2) b.m('tent', 1.5, -0.6, 0.5, 1.2).flag(0.85, 0.9, 0).m('weaponrack', 2.2, 0.85, -0.05, -Math.PI / 2);
        b.campfire(0.05, 0.25);
        b.top = 2;
      } else {
        const k = 1.3 * g;
        b.m('building_barracks_blue', k, 0, 0).m('weaponrack', 2.4, 0.85, 0.7, -Math.PI / 4).lantern(-0.9, 0.9);
        // 4 — флаги на башенках, 5 — знамёна на стенах, 6 — стойка с оружием, 7 — большой флаг на крыше.
        if (l >= 4) b.flag(0.55 * k, 0.6 * k, st, b.y0 + 1.25 * k, 0.6).flag(-0.55 * k, 0.6 * k, st, b.y0 + 1.25 * k, 0.6).m('target', 2.2, -0.82, 0.88, Math.PI / 5);
        if (l >= 5) b.drape('z', 0.3 * k, b.y0 + 0.75 * k, 0.86 * k, 0.26, 0.5, st >= 2).drape('x', 0.74 * k, b.y0 + 0.75 * k, 0.2 * k, 0.26, 0.5, st >= 2);
        if (l >= 6) b.m('weaponrack', 2.2, 0.88, 0.05, -Math.PI / 2).m('barrel', 2, 0.6, 0.9);
        if (l >= 7) b.flag(0, 0, 2, b.y0 + 1.64 * k, 1);
        b.chimney(-0.55, -0.6, b.y0, 1.75);
      }
      break;
    case 'forge':
      b.m('building_blacksmith_blue', 1.4 * g, 0, 0);
      b.m('barrel', 2.2, 0.85, 0.75);
      if (l >= 2) b.grindstone(-0.75, 0.7, Math.PI / 4);
      if (st >= 1) b.m('weaponrack', 2.3, -0.82, 0.78, Math.PI / 4).m('resource_stone', 1.2, 0.85, -0.75);
      if (l >= 4) b.pile(0.85, -0.15, IRON, 0.9).anvil(-0.2, 0.9);
      if (l >= 5) b.m('crate_open', 2, 0.55, 0.88).banner(0.92, 0.45);
      // Наковальня с искрами у входа; труба горна дымит — на крепостной ступени она кирпичная и выше.
      b.anvil(0.3, 0.86);
      if (l >= 5) b.chimney(-0.55, -0.55, b.y0, l >= 6 ? 1.8 : 1.4);
      else b.a('smoke', 0.3, b.y0 + 1.75 * g, 0.12);
      if (st >= 2) b.p('box', -0.55, b.y0 + 1.83, -0.55, 0.4, 0.08, 0.4, GOLD);
      break;
    case 'lab':
      b.m('building_church_blue', 1.05 * g, 0, -0.1);
      // Светящийся кристалл на постаменте и котёл с зельем: здесь прокачивают отряды.
      b.p('box', 0.78, b.y0 + 0.12, 0.78, 0.3, 0.24, 0.3, st >= 2 ? GOLD : STONE_D);
      b.glow('cone', 0.78, b.y0 + 0.42, 0.78, 0.2, 0.36, 0.2, MAGIC).glow('cone', 0.78, b.y0 + 0.66, 0.78, 0.2, 0.18, 0.2, MAGIC, Math.PI);
      b.p('cyl', -0.7, b.y0 + 0.13, 0.78, 0.36, 0.26, 0.36, IRON).glow('cyl', -0.7, b.y0 + 0.27, 0.78, 0.3, 0.03, 0.3, MAGIC);
      b.a('smoke', -0.7, b.y0 + 0.32, 0.78, 0.6);
      if (l >= 2) b.m('crate_open', 1.8, 0.05, 0.9).glow('box', 0.05, b.y0 + 0.22, 0.9, 0.1, 0.12, 0.1, '#c08bff');
      if (st >= 1) b.m('barrel', 2, 0.85, -0.6).lantern(0.4, 0.92);
      if (l >= 4) {
        // Второй, высокий кристалл на колонне.
        b.p('cyl', 0.88, b.y0 + 0.35, 0.05, 0.16, 0.7, 0.16, STONE);
        b.glow('cone', 0.88, b.y0 + 0.86, 0.05, 0.16, 0.3, 0.16, '#c08bff').glow('cone', 0.88, b.y0 + 1.06, 0.05, 0.16, 0.14, 0.16, '#c08bff', Math.PI);
      }
      if (l >= 5) b.p('cyl', -0.85, b.y0 + 0.11, 0.2, 0.26, 0.22, 0.26, IRON).glow('cyl', -0.85, b.y0 + 0.23, 0.2, 0.22, 0.03, 0.22, '#ff9ad5');
      if (st >= 2) b.m('chest_gold', 0.22, -0.85, -0.55, Math.PI / 2);
      break;
    case 'tavern':
      b.m('building_tavern_blue', 1.5 * g, 0, 0);
      b.m('barrel', 2.3, 0.85, 0.7);
      // 2 — навес у входа, 4 — гирлянда огоньков и столы на улице, 5 — знамёна на стенах.
      if (l >= 2) b.p('box', 0.05, b.y0 + 0.95, 0.98, 0.7, 0.04, 0.3, '#e0584a', { rx: 0.45 }).p('box', 0.05, b.y0 + 0.97, 0.98, 0.22, 0.045, 0.3, '#fff4e0', { rx: 0.45 });
      if (st >= 1) b.m('barrel_small_stack', 0.3, -0.75, 0.75, 0.6);
      if (l >= 4) b.garland(-0.85, 0.98, 0.9, 0.98, b.y0 + 1.45, 9).garland(0.95, 0.9, 0.95, -0.8, b.y0 + 1.45, 8).table(0.85, -0.05, Math.PI / 2);
      if (l >= 5) b.drape('x', 0.9, b.y0 + 0.75, -0.45, 0.26, 0.5, st >= 2).m('crate_A_big', 1.8, 0.9, 0.15);
      if (st >= 2) b.m('building_well_blue', 0.75, 0.8, -0.75);
      // Вывеска с кружкой качается, из трубы идёт дым, у входа цветы и фонарь.
      b.sign(0.35, 0.95, st >= 2 ? GOLD : '#c98a4b', 0);
      b.chimney(-0.6, -0.45, b.y0, 2.1);
      if (l < 4) b.flowers(-0.2, 0.9, 0);
      if (st >= 1) b.lantern(-0.92, 0.25);
      break;
    case 'market':
      b.m('building_market_blue', 1.05 * g, 0, 0);
      b.m('sack', 3, 0.8, 0.85);
      if (st === 0) b.m('crate_B_small', 2.4, -0.85, 0.82).hay(0.86, 0.2, 0.4);
      if (l >= 2) b.stall(-0.15, 0.82, '#e0584a', 0);
      if (st >= 1) b.m('crate_open', 2.3, -0.85, 0.75).m('barrel', 2.1, 0.9, -0.1).m('crate_B_big', 2, 0.85, -0.75).lantern(0.4, 0.95);
      if (l >= 4) b.stall(0.85, 0.3, '#4aa3e0', Math.PI / 2);
      if (l >= 5) b.banner(-0.92, 0.1).m('sack', 2.6, 0.55, 0.92);
      if (st >= 2) b.m('chest_gold', 0.22, 0.1, 0.55).m('coin_stack_large', 0.2, -0.55, 0.5);
      if (l < 2) b.flowers(-0.35, 0.9, 0);
      break;
    case 'tower':
      // Ступени башни: низкая каменная, высокая, большая крепостная.
      if (st === 0) b.m('building_tower_base_blue', (l === 2 ? 1.35 : 1.2) * g, 0, 0).stakes(-0.95, 0.95, 0.95, 0.95, 6);
      else if (st === 1) b.m('building_tower_A_blue', 1.5 * g, 0, 0);
      else b.m('building_tower_B_blue', 1.3 * g, 0, 0).flag(0, 0, 2, b.y0 + 2.49 * 1.3 * g - 0.05, 0.9);
      // 2 — флаг на верхушке, 4 — флаг над крышей, 5 — золотой конёк и мишень, 7 — колчаны и золотое знамя, 8 — золотой шпиль.
      if (l === 2) b.torch(0.88, -0.3).flag(0, 0, 0, b.y0 + 1.5 * 1.35 * g, 0.9);
      if (l >= 4 && st === 1) b.flag(0, 0, 1, b.y0 + 2.19 * 1.5 * g - 0.05, 0.9);
      if (l === 5) b.p('cone', 0, b.y0 + 2.19 * 1.5 * g - 0.02, 0, 0.24, 0.3, 0.24, GOLD);
      if (l >= 4) b.m('bucket_arrows', 2.2, 0.82, 0.75);
      if (l >= 5) b.m('target', 2.2, -0.82, 0.78, Math.PI / 5).banner(-0.9, 0.2, Math.PI / 4, st >= 2);
      if (l >= 7) b.m('bucket_arrows', 2, 0.5, 0.88).drape('z', 0, b.y0 + 0.9, 0.7 * 1.3 * g, 0.3, 0.55, true).drape('x', 0.62 * 1.3 * g, b.y0 + 0.9, 0, 0.3, 0.55, true);
      if (l === 8) b.p('cone', 0, b.y0 + 2.49 * 1.3 * g + 0.25, 0, 0.35, 0.5, 0.35, GOLD);
      // Факелы у входа светятся тёплым; на деревянной ступени — ящик стрел.
      if (st === 0) b.m('crate_A_small', 2.2, 0.82, -0.6);
      else b.torch(0.88, -0.2).torch(-0.2, 0.88);
      b.top = st === 0 ? 2.4 : st === 1 ? 3.6 : 4.4;
      break;
    case 'catapult':
      b.m('building_tower_catapult_blue', 1.4 * g, 0, 0);
      if (st === 0) b.stakes(-0.95, 0.95, 0.95, 0.95, 6);
      // 2 — знамя на передней стене, 4 — на правой и горка ядер, 5 — третья, 7 — золотая кайма знамён.
      const kc = 1.4 * g;
      if (l >= 2) b.m('crate_A_big', 1.8, -0.85, 0.75).drape('z', 0, b.y0 + 1.3 * kc, 0.6 * kc, 0.3, 0.6, l >= 7);
      if (st >= 1) b.m('resource_stone', 1.4, 0.8, 0.75).lantern(-0.9, 0.9);
      // Запас ядер у подножия: с каждым уровнем горка выше.
      b.m('projectile_catapult', 1.6, 0.86, -0.45).m('projectile_catapult', 1.6, 0.7, -0.62);
      if (l >= 4) b.m('projectile_catapult', 1.6, 0.92, -0.75).m('projectile_catapult', 1.6, 0.6, -0.85).drape('x', 0.48 * kc, b.y0 + 1.3 * kc, -0.1, 0.3, 0.6, l >= 7);
      if (l >= 5) b.m('projectile_catapult', 1.6, 0.78, -0.53, 0, b.y0 + 0.14).banner(0.3, 0.92, Math.PI / 4, st >= 2);
      b.top = 3.6;
      break;
  }
  // Флаги на ступенях из камня, факелы и башенки — у крепости.
  if (st >= 1 && t !== 'tower') b.flag(L[0], L[1], st).flag(R[0], R[1], st);
  if (l >= 7 && t !== 'tower') b.turret(F[0], F[1], 0.55, l === 8);
  if (l === 8 && t !== 'tower') b.torch(0.95, 0.2).torch(0.2, 0.95).banner(-0.92, -0.2, Math.PI / 4, true);
  if (b.top === 2.6) b.top = b.y0 + 2.4;
  return b.done();
}

/**
 * Ловушка: бомба — чугунный шар в ямке с фитилём, капкан — раскрытые железные челюсти на дощечке.
 * С уровнем — заклёпки, потом золотой обод. sprung — сработала в бою: воронка или захлопнутые челюсти.
 */
export function trapLook(t: 'bomb' | 'snare', l: number, sprung: boolean): Look {
  const b = new Builder(false);
  const st = stageOf(l);
  const rim = st >= 2 ? GOLD : st === 1 ? STONE_D : WOOD_D;
  b.blob = 0;
  b.top = 0.8;
  if (t === 'bomb') {
    if (sprung) {
      b.p('cyl', 0, 0.01, 0, 0.9, 0.02, 0.9, '#2b2420').p('cyl', 0, 0.015, 0, 0.55, 0.02, 0.55, '#141110');
      return b.done();
    }
    b.p('cyl', 0, 0.02, 0, 0.62, 0.04, 0.62, '#6b4e33').p('cyl', 0, 0.035, 0, 0.5, 0.03, 0.5, rim);
    b.p('cyl', 0, 0.16, 0, 0.36, 0.26, 0.36, IRON).p('cone', 0, 0.32, 0, 0.3, 0.1, 0.3, IRON);
    b.p('cyl', 0.05, 0.42, 0, 0.03, 0.14, 0.03, '#d8c39a', { rz: -0.4 }).glow('box', 0.09, 0.5, 0, 0.06, 0.06, 0.06, '#ffb43d');
    if (l >= 3) for (const a of [0, 1.57, 3.14, 4.71]) b.p('box', Math.cos(a) * 0.18, 0.18, Math.sin(a) * 0.18, 0.04, 0.04, 0.04, st >= 2 ? GOLD : STONE);
    return b.done();
  }
  b.p('box', 0, 0.02, 0, 0.7, 0.04, 0.7, WOOD_D).p('cyl', 0, 0.06, 0, 0.18, 0.05, 0.18, rim);
  // Челюсти: два полукольца зубьев; раскрытые лежат плашмя, захлопнутые стоят торчком.
  for (const side of [-1, 1]) {
    const y = sprung ? 0.2 : 0.06;
    const off = sprung ? 0.02 : 0.24;
    b.p('box', 0, y, side * off, 0.56, sprung ? 0.3 : 0.04, 0.04, IRON);
    for (let k = 0; k < 5; k++) {
      const x = -0.22 + k * 0.11;
      if (sprung) b.p('cone', x, 0.38, side * 0.02, 0.05, 0.08, 0.05, '#c9ced6');
      else b.p('cone', x, 0.1, side * (off - 0.05), 0.05, 0.08, 0.05, '#c9ced6', { rx: side * 1.2 });
    }
  }
  if (l >= 4) b.p('box', 0, 0.05, 0.33, 0.6, 0.02, 0.03, rim).p('box', 0, 0.05, -0.33, 0.6, 0.02, 0.03, rim);
  return b.done();
}

const T7 = 'сторожевая башенка';
const T8 = 'золотая крыша башенки, факелы и золотое знамя';
// Что нового появится на постройке с уровнем: индекс — уровень минус 2 (уровни 2…8).
const NEW_PARTS: Record<BuildingType, string[]> = {
  townhall: ['мельница, колодец и флаг', 'каменный замок', 'две сторожевые башни', 'высокие башни с флагами', 'золотой цоколь и ещё две башни', 'четыре большие башни и золотой шпиль', 'казна с золотом и факелы'],
  lumbermill: ['тачка, поленница и фонарь', 'каменный двор, флаги и ящики', 'труба с дымом и лестница', 'второй штабель и знамя', 'золотой цоколь и подъёмный кран', T7, T8],
  quarry: ['лестница, груда камня и фонарь', 'каменный двор, помост и флаги', 'подъёмный кран', 'штабель тёсаных блоков', 'золотой цоколь и каменная башня', T7, T8],
  goldmine: ['горка золотой руды и фонарь', 'каменный двор, тачка и флаги', 'большая горка руды и знамя', 'подъёмный кран', 'золотой цоколь, сундук и монеты', T7, T8],
  storage: ['ещё сено, бочка и фонарь', 'каменный двор, бочки и цветы', 'мельница', 'большая бочка и мешки', 'золотой цоколь, сундук и монеты', T7, T8],
  barracks: ['третья палатка, флаг и стойка с оружием', 'каменные казармы', 'флаги на башенках и мишени', 'знамёна на стенах', 'золотой цоколь и вторая стойка с оружием', 'большой флаг на крыше и башенка', T8],
  lab: ['ящик с колбами', 'каменный двор, фонарь и флаги', 'второй кристалл на колонне', 'второй котёл с зельем', 'золотой цоколь и сундук', T7, T8],
  forge: ['точильный круг', 'каменный двор, стойка с оружием и флаги', 'вторая наковальня и груда железа', 'кирпичная труба горна и знамя', 'золотой цоколь и высокая труба', T7, T8],
  tavern: ['навес над входом', 'каменный двор, бочки и фонарь', 'гирлянда огоньков и стол на улице', 'знамя на стене', 'золотой цоколь и колодец', T7, T8],
  market: ['лоток с фруктами', 'каменный двор, ящики и бочки', 'второй лоток', 'знамя и мешки', 'золотой цоколь, сундук и монеты', T7, T8],
  tower: ['флаг на верхушке и факел', 'высокая каменная башня', 'флаг над крышей и колчан стрел', 'золотой конёк, мишень и знамя', 'крепостная башня на золотом цоколе', 'золотые знамёна и колчаны', 'золотой шпиль'],
  catapult: ['знамя на башне и ящик', 'каменный двор и флаги', 'второе знамя и горка ядер', 'ещё ядра и знамя у входа', 'золотой цоколь', 'золотая кайма знамён и башенка', T8],
  wall: ['деревянная шапка', 'серый камень с плитой', 'железные шипы', 'синеватый камень', 'золотое навершие', 'золотой пояс', 'светящийся камень на вершине'],
  bomb: ['больше пороха', 'заклёпки по бокам', 'двойной заряд', 'каменный обод', 'золотой обод', 'золотые заклёпки', 'самый мощный заряд'],
  snare: ['пружина туже', 'держит дольше', 'железная окантовка', 'зубья острее', 'золотой обод', 'держит ещё дольше', 'самая крепкая хватка'],
};

/** Что появится на постройке t на уровне l (для l ≥ 2). */
export const newPartsAt = (t: BuildingType, l: number): string | undefined => NEW_PARTS[t][l - 2];
