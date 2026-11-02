// Дорогой облик героя: не перекраска всей модели, а настоящая работа над костюмом.
//  1) Материалы. У персонажей KayKit одна текстура-палитра 8×4 квадрата: кожа, волосы, сталь, ткань, кожа ремней.
//     Облик перекрашивает только броню, ткань и ремни (лицо и руки остаются живыми), а металл получает
//     «ступени» полированного золота, серебра, бронзы, льда или обсидиана.
//  2) Детали (регалии). Чем выше редкость, тем больше поверх модели: наручи и пряжка → наплечники, медальон,
//     плюмаж или обруч → корона/рога и крылья за спиной. Детали — простые фигуры three.js, сшитые в несколько
//     мешей на кость (по одному на материал), поэтому их немного и на слабом телефоне.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharName } from './kit';
import { toonOf } from './toon';

export type Metal = 'gold' | 'silver' | 'steel' | 'bronze' | 'obsidian' | 'ice' | 'stone' | 'rose';
export type Motif = 'royal' | 'spikes' | 'crystal' | 'leaf' | 'flame';

export interface Skin {
  // Ключ кэша: id облика.
  key: string;
  // 0 — обычный (только цвета), 1 — редкий, 2 — эпический, 3 — легендарный.
  tier: 0 | 1 | 2 | 3;
  metal: Metal;
  trim: Metal;
  // Основная ткань (плащ, куртка, мантия) и вторая (мех, подкладка, лента шляпы).
  cloth: string;
  cloth2: string;
  // Ремни, сапоги.
  leather: string;
  // Камни в оправах.
  gem: string;
  motif: Motif;
}

// ---------- Ступени цвета ----------

const METALS: Record<Metal, string[]> = {
  gold: ['#3d2005', '#7a4a0e', '#c98a17', '#ffcf3f', '#fff3b0'],
  silver: ['#232a36', '#4f5b6e', '#9aa8bd', '#dde6f2', '#ffffff'],
  steel: ['#1d232c', '#434d5a', '#7f8c9c', '#c3cdd9', '#f2f6fa'],
  bronze: ['#260904', '#5e1a0a', '#a8431a', '#f08a3c', '#ffd59a'],
  obsidian: ['#07050d', '#1a1430', '#352a5e', '#6f5fbf', '#c7bcff'],
  ice: ['#10314f', '#2f6f9f', '#7cc4ea', '#cdf3ff', '#ffffff'],
  stone: ['#1f1c22', '#45404a', '#7a7480', '#b6b0ba', '#e6e2ea'],
  rose: ['#3a1220', '#7a2a44', '#c45a7c', '#f5a8c0', '#fff0f5'],
};

const mix = (a: THREE.Color, b: THREE.Color, k: number) => a.clone().lerp(b, k);
const WHITE = new THREE.Color('#ffffff');
const BLACK = new THREE.Color('#000000');

/** Ступени ткани из одного цвета: тень, полутон, цвет, свет. */
function clothRamp(hex: string): THREE.Color[] {
  const c = new THREE.Color(hex);
  return [mix(c, BLACK, 0.78), mix(c, BLACK, 0.48), c.clone(), mix(c, WHITE, 0.3), mix(c, WHITE, 0.6)];
}
const metalRamp = (m: Metal) => METALS[m].map((h) => new THREE.Color(h));

function sample(ramp: THREE.Color[], t: number, out: THREE.Color): THREE.Color {
  const x = Math.min(0.9999, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.floor(x);
  return out.copy(ramp[i]).lerp(ramp[i + 1], x - i);
}

// ---------- Перекраска палитры ----------

type Role = 'metal' | 'dark' | 'leather' | 'cloth' | 'cloth2' | 'trim';

// Квадраты палитры каждого героя (столбец, строка) и их роль. Найдены по тому, какие части тела берут какой квадрат;
// кожа, волосы и глаза не перечислены — их не трогаем.
const SWATCHES: Partial<Record<CharName, [number, number, Role][]>> = {
  Knight: [
    [3, 0, 'metal'], [7, 0, 'metal'], [4, 0, 'dark'], [7, 1, 'dark'], [2, 1, 'trim'],
    [6, 0, 'leather'], [5, 0, 'leather'], [0, 1, 'cloth'],
  ],
  Barbarian: [
    [3, 0, 'metal'], [6, 0, 'leather'], [3, 2, 'leather'], [7, 1, 'dark'],
    [0, 1, 'cloth'], [1, 1, 'cloth'], [7, 0, 'cloth2'],
  ],
  Mage: [
    [3, 0, 'metal'], [4, 0, 'dark'], [0, 1, 'cloth'], [1, 1, 'cloth'], [7, 1, 'dark'],
    [2, 1, 'cloth2'], [5, 0, 'trim'], [2, 2, 'cloth2'], [3, 2, 'leather'],
  ],
  Rogue: [
    [3, 0, 'metal'], [0, 1, 'cloth'], [1, 1, 'cloth2'], [6, 0, 'leather'], [5, 0, 'leather'],
    [5, 2, 'leather'], [3, 2, 'leather'], [7, 1, 'dark'],
  ],
};

function ramps(skin: Skin): Record<Role, THREE.Color[]> {
  const leather = clothRamp(skin.leather);
  // У обычного облика металл остаётся родной сталью: меняется только ткань.
  const metal = skin.tier === 0 ? metalRamp('steel') : metalRamp(skin.metal);
  return {
    metal,
    // Тёмные вставки: тот же металл, но глубже, — броня не сливается в одно пятно.
    dark: metal.map((c) => mix(c, BLACK, 0.45)),
    leather,
    cloth: clothRamp(skin.cloth),
    cloth2: clothRamp(skin.cloth2),
    trim: metalRamp(skin.trim),
  };
}

const textures = new Map<string, THREE.Texture>();

/** Палитра героя в цветах облика (кэш на облик). */
export function skinTexture(model: CharName, src: THREE.Texture, skin: Skin): THREE.Texture {
  const key = `${model}|${skin.key}`;
  const hit = textures.get(key);
  if (hit) return hit;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const roles = SWATCHES[model];
  if (!img || !roles || typeof document === 'undefined') return src;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0);
  const R = ramps(skin);
  const sw = img.width / 8;
  const sh = img.height / 4;
  const c = new THREE.Color();
  for (const [col, row, role] of roles) {
    const x0 = Math.round(col * sw);
    const y0 = Math.round(row * sh);
    const w = Math.round(sw);
    const h = Math.round(sh);
    const data = ctx.getImageData(x0, y0, w, h);
    const px = data.data;
    // Яркость каждой точки внутри квадрата → место на ступенях нового цвета: градиент и блик модели сохраняются.
    let lo = 1;
    let hi = 0;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const l = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
      lum[i] = l;
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    const span = Math.max(0.08, hi - lo);
    const metalish = role === 'metal' || role === 'trim' || role === 'dark';
    // Металл — во весь диапазон (от тени до блика), ткань — мягче, без белых пятен.
    const [a, b] = metalish ? [0.18, 0.98] : [0.22, 0.72];
    const ramp = R[role];
    for (let i = 0; i < w * h; i++) {
      sample(ramp, a + ((lum[i] - lo) / span) * (b - a), c);
      // Палитра в sRGB, как исходная картинка.
      const s = c.clone().convertLinearToSRGB();
      px[i * 4] = Math.round(s.r * 255);
      px[i * 4 + 1] = Math.round(s.g * 255);
      px[i * 4 + 2] = Math.round(s.b * 255);
    }
    ctx.putImageData(data, x0, y0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = src.flipY;
  tex.colorSpace = src.colorSpace;
  tex.magFilter = src.magFilter;
  tex.minFilter = src.minFilter;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.generateMipmaps = src.generateMipmaps;
  textures.set(key, tex);
  return tex;
}

// ---------- Материалы деталей ----------

/** Матовая шапка металла: «ступени» блеска как у мультяшного света, блик и отражённый свет снизу. */
function matcapCanvas(ramp: string[], gem = false): HTMLCanvasElement {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = ramp[0];
  g.fillRect(0, 0, S, S);
  const grad = g.createRadialGradient(S * 0.36, S * 0.3, 0, S * 0.5, S * 0.5, S * 0.56);
  // Жёсткие переходы: металл в стиле игры — полосы, а не размытое пятно.
  const stops: [number, string][] = gem
    ? [[0, ramp[4]], [0.18, ramp[3]], [0.5, ramp[2]], [0.85, ramp[1]], [1, ramp[0]]]
    : [[0, ramp[4]], [0.14, ramp[4]], [0.16, ramp[3]], [0.42, ramp[3]], [0.45, ramp[2]], [0.74, ramp[2]], [0.77, ramp[1]], [0.95, ramp[1]], [1, ramp[0]]];
  for (const [o, c] of stops) grad.addColorStop(o, c);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.fill();
  // Отражённый свет снизу справа: край металла светлеет, объём читается и на тёмном фоне.
  g.globalCompositeOperation = 'lighter';
  const bounce = g.createRadialGradient(S * 0.72, S * 0.8, 0, S * 0.72, S * 0.8, S * 0.32);
  bounce.addColorStop(0, `${ramp[3]}88`);
  bounce.addColorStop(1, `${ramp[3]}00`);
  g.fillStyle = bounce;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  // Блик.
  g.fillStyle = '#ffffff';
  g.globalAlpha = gem ? 0.95 : 0.85;
  g.beginPath();
  g.ellipse(S * 0.33, S * 0.27, S * 0.07, S * 0.045, -0.6, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  return cv;
}

const mats = new Map<string, THREE.Material>();

function metalMat(m: Metal): THREE.Material {
  const key = `metal:${m}`;
  let mat = mats.get(key);
  if (!mat) {
    const tex = new THREE.CanvasTexture(matcapCanvas(METALS[m]));
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshMatcapMaterial({ matcap: tex });
    mats.set(key, mat);
  }
  return mat;
}

function gemMat(hex: string): THREE.Material {
  const key = `gem:${hex}`;
  let mat = mats.get(key);
  if (!mat) {
    const c = new THREE.Color(hex);
    const ramp = [mix(c, BLACK, 0.7), mix(c, BLACK, 0.35), c, mix(c, WHITE, 0.45), mix(c, WHITE, 0.85)].map((x) => `#${x.getHexString()}`);
    const tex = new THREE.CanvasTexture(matcapCanvas(ramp, true));
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshMatcapMaterial({ matcap: tex, toneMapped: false });
    mats.set(key, mat);
  }
  return mat;
}

function enamelMat(hex: string): THREE.Material {
  const key = `enamel:${hex}`;
  let mat = mats.get(key);
  if (!mat) {
    const c = new THREE.Color(hex);
    const ramp = [mix(c, BLACK, 0.8), mix(c, BLACK, 0.5), mix(c, BLACK, 0.15), mix(c, WHITE, 0.3), mix(c, WHITE, 0.75)].map((x) => `#${x.getHexString()}`);
    const tex = new THREE.CanvasTexture(matcapCanvas(ramp));
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshMatcapMaterial({ matcap: tex });
    mats.set(key, mat);
  }
  return mat;
}

function clothMat(hex: string): THREE.Material {
  const key = `cloth:${hex}`;
  let mat = mats.get(key);
  if (!mat) {
    mat = toonOf(new THREE.MeshStandardMaterial({ color: hex }));
    mats.set(key, mat);
  }
  return mat;
}

/** Искра: четырёхлучевая звёздочка цвета камня с белым центром. */
const sparkMats = new Map<string, THREE.SpriteMaterial>();
function sparkMat(hex: string): THREE.SpriteMaterial {
  let mat = sparkMats.get(hex);
  if (mat) return mat;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const c = new THREE.Color(hex).lerp(WHITE, 0.5);
  const col = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  const glow = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.15, `rgba(${col},0.8)`);
  glow.addColorStop(0.5, `rgba(${col},0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? S * 0.06 : S * 0.48;
    g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
  }
  g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  sparkMats.set(hex, mat);
  return mat;
}

// ---------- Фигуры ----------

// enamel — лакированная пластина цвета ткани: на золотом доспехе даёт контраст, а не сплошное золото.
type Mat = 'metal' | 'trim' | 'gem' | 'cloth' | 'cloth2' | 'enamel';
type Bone = 'chest' | 'spine' | 'head' | 'upperarm.l' | 'upperarm.r' | 'lowerarm.l' | 'lowerarm.r' | 'hips';

// Точки, где у легендарного облика вспыхивают искры (на камнях).
interface Glint {
  bone: Bone;
  at: THREE.Vector3;
  size: number;
}

interface Piece {
  bone: Bone;
  mat: Mat;
  geo: THREE.BufferGeometry;
  // Деталь, что колышется (крылья): сторона крыла, качается в update.
  sway?: number;
  // Деталь задана в позе покоя (Idle), а не в позе «T»: наплечник на висящей руке. При сборке переносится
  // в позу «T» через положение кости в покое (IDLE_BONES) — на главной он сидит ровно на плече, а при ударе
  // или прыжке едет вместе с рукой.
  idle?: boolean;
}

// Плечевые кости в первом кадре анимации Idle (общая у всех героев KayKit), в координатах модели.
const IDLE_BONES: Partial<Record<Bone, THREE.Matrix4>> = {
  'upperarm.l': new THREE.Matrix4().compose(new THREE.Vector3(0.211, 1.074, -0.018), new THREE.Quaternion(-0.578, -0.035, -0.62, 0.529).normalize(), new THREE.Vector3(1, 1, 1)),
  'upperarm.r': new THREE.Matrix4().compose(new THREE.Vector3(-0.211, 1.074, 0.018), new THREE.Quaternion(-0.582, 0.1, 0.644, 0.486).normalize(), new THREE.Vector3(1, 1, 1)),
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Q = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

/** Геометрия, поставленная в точку модели (поза «T»): позиция, поворот, масштаб. */
function place(geo: THREE.BufferGeometry, at: THREE.Vector3, rot = new THREE.Quaternion(), scale = V(1, 1, 1)): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(new THREE.Matrix4().compose(at, rot, scale));
  return g;
}

/** Выгнутый конус: рог или шип, кончик загибается по оси x на bend. */
function hornGeo(r: number, len: number, bend: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, len, 8, 6);
  g.translate(0, len / 2, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len;
    p.setX(i, p.getX(i) + bend * t * t);
  }
  g.computeVertexNormals();
  return g;
}

/** Лезвие пера/крыла: плоский заострённый лист с толщиной. */
function bladeGeo(w: number, len: number, depth = 0.03): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.quadraticCurveTo(-w * 0.7, len * 0.55, 0, len);
  s.quadraticCurveTo(w * 0.7, len * 0.55, w / 2, 0);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: depth * 0.4, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Огранённый кристалл: вытянутый октаэдр. */
const crystalGeo = (r: number, len: number) => {
  const g = new THREE.OctahedronGeometry(r, 0);
  g.scale(1, len / r / 2, 1);
  g.translate(0, len / 2, 0);
  return g;
};

/** Язык пламени: закрученный конус. */
function flameGeo(r: number, len: number, twist: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, len, 7, 6);
  g.translate(0, len / 2, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = v.y / len;
    const a = twist * t;
    const x = v.x * Math.cos(a) - v.z * Math.sin(a) + Math.sin(t * 3) * r * 0.6;
    const z = v.x * Math.sin(a) + v.z * Math.cos(a);
    p.setXYZ(i, x, v.y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Остриё мотива (шип, кристалл, лист, язык пламени, лилия), растёт вверх по y. */
function tipGeo(motif: Motif, r: number, len: number, i = 0): { geo: THREE.BufferGeometry; mat: Mat } {
  switch (motif) {
    case 'spikes':
      return { geo: hornGeo(r, len, 0), mat: 'trim' };
    case 'crystal':
      return { geo: crystalGeo(r * 1.1, len), mat: 'gem' };
    case 'leaf':
      return { geo: bladeGeo(r * 2.4, len, r * 0.5), mat: i % 2 ? 'cloth2' : 'trim' };
    case 'flame':
      return { geo: flameGeo(r * 1.2, len, 2.2), mat: i % 2 ? 'gem' : 'trim' };
    default:
      return { geo: bladeGeo(r * 2, len, r * 0.6), mat: 'trim' };
  }
}

// Где у героя голова и что на ней: высота макушки, обруча, радиус головы.
const HEAD: Record<string, { top: number; band: number; r: number; front: number }> = {
  Knight: { top: 2.44, band: 2.12, r: 0.56, front: 0.66 },
  Barbarian: { top: 2.36, band: 2.02, r: 0.57, front: 0.66 },
  Mage: { top: 2.66, band: 1.86, r: 0.47, front: 0.6 },
  Rogue: { top: 2.17, band: 1.8, r: 0.51, front: 0.5 },
};

function pieces(model: CharName, skin: Skin, glints: Glint[] = []): Piece[] {
  const out: Piece[] = [];
  const glint = (bone: Bone, at: THREE.Vector3, size = 0.32) => glints.push({ bone, at, size });
  const add = (bone: Bone, mat: Mat, geo: THREE.BufferGeometry, sway?: number) => out.push({ bone, mat, geo, sway });
  const { tier, motif } = skin;
  const head = HEAD[model] ?? HEAD.Knight;
  if (tier < 1) return out;

  // --- Редкий: наручи и пряжка ---
  for (const s of [1, -1]) {
    const bone: Bone = s > 0 ? 'lowerarm.l' : 'lowerarm.r';
    add(bone, 'trim', place(new THREE.TorusGeometry(0.135, 0.028, 6, 16), V(s * 0.6, 1.11, 0), Q(0, Math.PI / 2, 0)));
    if (tier >= 2) {
      add(bone, 'trim', place(new THREE.TorusGeometry(0.13, 0.022, 6, 16), V(s * 0.5, 1.11, 0), Q(0, Math.PI / 2, 0)));
      add(bone, 'gem', place(new THREE.OctahedronGeometry(0.045, 0), V(s * 0.55, 1.11, 0.14), undefined, V(1, 1, 0.6)));
    }
  }
  // Пряжка ремня.
  const buckleZ = model === 'Barbarian' ? 0.4 : 0.38;
  add('spine', 'trim', place(new THREE.TorusGeometry(0.085, 0.022, 6, 4), V(0, 0.64, buckleZ), Q(0, 0, Math.PI / 4), V(1.3, 1, 1)));
  add('spine', 'gem', place(new THREE.OctahedronGeometry(0.05, 0), V(0, 0.64, buckleZ + 0.02), undefined, V(1, 1, 0.55)));

  // --- Наплечники: на груди над плечом (рука в покое висит вниз-наружу) ---
  // У редкого — купол с кантом, у эпического и выше — второй слой ниже и острия мотива.
  for (const s of [1, -1]) {
    const arm: Bone = s > 0 ? 'upperarm.l' : 'upperarm.r';
    const addS = (mat: Mat, geo: THREE.BufferGeometry) => out.push({ bone: arm, mat, geo, idle: true });
    const at = V(s * 0.37, 1.1, -0.03);
    const tilt = Q(0, 0, -s * 0.85);
    const r = tier >= 3 ? 0.22 : 0.2;
    // Купол — лак цвета облика у эпических и легендарных, металл у редких: кант всегда металлом.
    const plate: Mat = tier >= 2 ? 'enamel' : 'metal';
    // Пластина — невысокий купол (основание на точке at), под ней чуть шире и ниже — кант из металла отделки:
    // он выглядывает ободком по краю, а не висит кольцом там, где купол уходит в плечо.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt);
    const cap = (rad: number, sy: number) => {
      const g = new THREE.SphereGeometry(rad, 16, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
      g.translate(0, -rad * Math.cos(Math.PI * 0.42), 0);
      g.scale(1, sy, 1.08);
      return g;
    };
    addS(plate, place(cap(r, 0.75), at, tilt));
    addS('trim', place(cap(r * 1.13, 0.6), at.clone().addScaledVector(up, -0.025), tilt));
    if (tier >= 2) {
      const at2 = V(s * 0.45, 0.97, -0.04);
      const tilt2 = Q(0, 0, -s * 1.25);
      const up2 = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt2);
      addS('metal', place(cap(r * 0.85, 0.7), at2, tilt2));
      addS('trim', place(cap(r * 0.85 * 1.13, 0.55), at2.clone().addScaledVector(up2, -0.02), tilt2));
      // Камень в центре купола.
      addS('gem', place(new THREE.OctahedronGeometry(0.055, 0), at.clone().addScaledVector(up, r * 0.42), tilt, V(1, 0.6, 1)));
      // Мотив: острия по гребню купола.
      const n = tier >= 3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const z = (i - (n - 1) / 2) * 0.13;
        const len = (tier >= 3 ? 0.3 : 0.2) * (n === 3 && i !== 1 ? 0.75 : 1);
        const tip = tipGeo(motif, 0.045, len, i);
        addS(tip.mat, place(tip.geo, at.clone().addScaledVector(up, r * 0.3).add(V(s * 0.04, 0, z)), Q(0, 0, -s * 0.7)));
      }
    }
  }

  if (tier >= 2) {
    // Медальон на груди: оправа, камень и лучи мотива.
    const at = V(0, 0.98, 0.37);
    add('chest', 'trim', place(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), at, Q(Math.PI / 2, 0, 0)));
    add('chest', 'gem', place(new THREE.OctahedronGeometry(0.075, 0), V(0, 0.98, 0.4), undefined, V(1, 1.15, 0.55)));
    if (tier >= 3) glint('chest', V(0.03, 1.01, 0.46), 0.4);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      add('chest', 'trim', place(new THREE.ConeGeometry(0.03, 0.09, 4), V(Math.cos(a) * 0.13, 0.98 + Math.sin(a) * 0.13, 0.37), Q(Math.PI / 2, 0, 0).premultiply(Q(0, 0, a - Math.PI / 2))));
    }

    // Голова: у каждого героя своё.
    if (model === 'Knight') {
      // Плюмаж — гребень из перьев по шлему.
      for (let i = 0; i < 5; i++) {
        const z = 0.25 - i * 0.16;
        const y = head.top - 0.02 - Math.pow(i / 4, 2) * 0.18;
        add('head', 'cloth', place(new THREE.SphereGeometry(0.11, 8, 6), V(0, y, z), Q(-0.3 - i * 0.12, 0, 0), V(0.55, 1.6 - i * 0.12, 1)));
      }
      add('head', 'trim', place(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 8), V(0, head.top - 0.04, 0.28)));
    } else if (model === 'Barbarian') {
      // Рога.
      for (const s of [1, -1]) {
        const horn = hornGeo(0.09, tier >= 3 ? 0.62 : 0.42, s * 0.25);
        add('head', 'trim', place(horn, V(s * 0.46, head.band + 0.08, 0.05), Q(0, 0, -s * 1.05)));
      }
    } else if (model === 'Mage') {
      // Лента со звёздами на шляпе и кристалл на макушке.
      add('head', 'trim', place(new THREE.TorusGeometry(head.r, 0.035, 6, 28), V(0, head.band, 0), Q(Math.PI / 2, 0, 0), V(1, 1, 1)));
      add('head', 'gem', place(crystalGeo(0.07, 0.24), V(0, head.band - 0.02, head.r + 0.02), Q(Math.PI / 2 - 0.2, 0, 0)));
    } else {
      // Обруч с камнем: спереди ниже, по лбу, сзади уходит под волосы.
      add('head', 'trim', place(new THREE.TorusGeometry(head.r, 0.03, 6, 28), V(0, head.band, 0.02), Q(Math.PI / 2 - 0.18, 0, 0), V(1, 1.06, 1)));
      add('head', 'gem', place(new THREE.OctahedronGeometry(0.07, 0), V(0, head.band + 0.05, head.r + 0.05), undefined, V(1, 1.2, 0.6)));
    }
  }

  if (tier >= 3) {
    // Корона (у мага — венец из кристаллов над лентой, у варвара — на шапке между рогами).
    const crownY = model === 'Mage' ? 2.02 : head.top - (model === 'Knight' ? 0.24 : 0.18);
    const crownR = model === 'Mage' ? 0.4 : model === 'Knight' ? 0.47 : head.r * 0.82;
    if (model !== 'Knight' || motif !== 'royal') {
      add('head', 'trim', place(new THREE.CylinderGeometry(crownR, crownR * 1.03, 0.08, 24, 1, true), V(0, crownY, 0)));
    } else {
      add('head', 'trim', place(new THREE.CylinderGeometry(crownR, crownR * 1.03, 0.08, 24, 1, true), V(0, crownY, 0.05)));
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.sin(a) * crownR;
      const z = Math.cos(a) * crownR + (model === 'Knight' ? 0.05 : 0);
      const tall = i % 2 === 0 ? 0.2 : 0.13;
      const tip = tipGeo(motif === 'leaf' ? 'royal' : motif, 0.04, tall, i);
      add('head', tip.mat === 'cloth2' ? 'trim' : tip.mat, place(tip.geo, V(x, crownY + 0.03, z), Q(0, a, 0).multiply(Q(-0.12, 0, 0))));
      if (i % 2 === 0) add('head', 'gem', place(new THREE.OctahedronGeometry(0.035, 0), V(x * 1.03, crownY, z * 1.03), undefined, V(1, 1, 1)));
      if (i === 0) glint('head', V(x * 1.06, crownY + 0.02, z * 1.06), 0.3);
    }

    // Крылья за спиной: два веера из пяти перьев (мотив — перья, шипы, кристаллы, листья или пламя).
    for (const s of [1, -1]) {
      for (let i = 0; i < 5; i++) {
        const spread = 0.45 + i * 0.27;
        const len = 1.0 - i * 0.11;
        // Каждое следующее перо чуть дальше от спины: в основании веера перья не мерцают друг сквозь друга.
        const root = V(s * 0.12, 1.1, -0.44 - i * 0.014);
        const rot = Q(0.12, s * 0.3, -s * spread);
        let geo: THREE.BufferGeometry;
        let mat: Mat;
        if (motif === 'crystal') {
          geo = crystalGeo(0.06, len);
          mat = 'gem';
        } else if (motif === 'flame') {
          geo = flameGeo(0.07, len, 2.5);
          mat = i % 2 ? 'gem' : 'trim';
        } else if (motif === 'spikes') {
          geo = hornGeo(0.06, len, s * 0.12 * 0);
          mat = 'trim';
        } else if (motif === 'leaf') {
          geo = bladeGeo(0.16, len, 0.025);
          mat = i % 2 ? 'cloth2' : 'trim';
        } else {
          geo = bladeGeo(0.2, len, 0.03);
          mat = i % 2 ? 'enamel' : 'trim';
        }
        add('chest', mat, place(geo, root, rot), s);
      }
      // Основание крыла.
      add('chest', 'trim', place(new THREE.SphereGeometry(0.08, 10, 6), V(s * 0.13, 1.08, -0.43)), s);
      add('chest', 'gem', place(new THREE.OctahedronGeometry(0.045, 0), V(s * 0.13, 1.08, -0.5)), s);
    }
  }
  return out;
}

// ---------- Сборка ----------

export interface Regalia {
  // Покачивание крыльев и мерцание камней.
  update: (t: number) => void;
  meshes: THREE.Mesh[];
  dispose: () => void;
}

/**
 * Детали облика на скелете персонажа. root — клон модели ещё в позе «T» (до анимации), в начале координат.
 * Все детали одного материала — один меш со скиннингом на скелете тела: каждая вершина жёстко привязана
 * к своей кости (вес 1). Так на героя уходит не больше шести вызовов отрисовки, сколько бы деталей ни было.
 */
export function buildRegalia(root: THREE.Object3D, model: CharName, skin: Skin, lite = false): Regalia | null {
  const glints: Glint[] = [];
  const list = pieces(model, skin, glints);
  if (!list.length) return null;
  let body: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh;
  });
  if (!body) return null;
  const host: THREE.SkinnedMesh = body;
  root.updateMatrixWorld(true);
  const material = (m: Mat): THREE.Material => {
    if (m === 'metal') return metalMat(skin.metal);
    if (m === 'trim') return metalMat(skin.trim);
    if (m === 'gem') return gemMat(skin.gem);
    if (m === 'enamel') return enamelMat(skin.cloth);
    return clothMat(m === 'cloth' ? skin.cloth : skin.cloth2);
  };

  // Свой скелет: кости тела плюс две опоры крыльев на груди (крылья медленно взмахивают).
  // Обратные матрицы — по позе костей сейчас (поза «T» клона), а не из файла: детали заданы в ней,
  // а матрицы привязки KayKit сняты с другой позы.
  const toBody = host.matrixWorld.clone().invert();
  const bones = [...host.skeleton.bones];
  const inverses = bones.map((b) => toBody.clone().multiply(b.matrixWorld).invert());
  const swings: { obj: THREE.Object3D; side: number; base: THREE.Quaternion }[] = [];
  const pivotIndex = new Map<number, number>();
  const chest = root.getObjectByName('chest');
  if (chest && list.some((p) => p.sway)) {
    for (const side of [1, -1]) {
      const pivot = new THREE.Bone();
      pivot.name = `wing-${side}`;
      pivot.position.set(side * 0.13, 1.1, -0.44);
      root.add(pivot);
      pivot.updateMatrixWorld(true);
      chest.attach(pivot);
      pivot.updateMatrixWorld(true);
      swings.push({ obj: pivot, side, base: pivot.quaternion.clone() });
      pivotIndex.set(side, bones.length);
      bones.push(pivot);
      // Как у костей тела: обратная матрица кости в позе привязки, в пространстве меша тела.
      inverses.push(toBody.clone().multiply(pivot.matrixWorld).invert());
    }
  }
  const skeleton = new THREE.Skeleton(bones, inverses);
  const boneIndex = (name: Bone) => bones.findIndex((b) => b.name === THREE.PropertyBinding.sanitizeNodeName(name));

  // Детали по материалам; у каждой вершины — индекс её кости.
  const byMat = new Map<Mat, THREE.BufferGeometry[]>();
  for (const p of list) {
    const bi = p.sway ? pivotIndex.get(p.sway) ?? boneIndex(p.bone) : boneIndex(p.bone);
    if (bi < 0) continue;
    const g = p.geo;
    const idle = p.idle && IDLE_BONES[p.bone];
    if (idle) g.applyMatrix4(bones[bi].matrixWorld.clone().multiply(idle.clone().invert()));
    g.applyMatrix4(toBody);
    const n = g.getAttribute('position').count;
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = bi;
      w[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    (byMat.get(p.mat) ?? byMat.set(p.mat, []).get(p.mat)!).push(g);
  }
  const meshes: THREE.Mesh[] = [];
  const geos: THREE.BufferGeometry[] = [];
  for (const [mat, list2] of byMat) {
    const geo = mergeGeometries(list2, false);
    list2.forEach((g) => g.dispose());
    if (!geo) continue;
    geos.push(geo);
    const mesh = new THREE.SkinnedMesh(geo, material(mat));
    mesh.name = `regalia-${mat}`;
    mesh.castShadow = true;
    // Границы меша — по позе привязки, а герой двигается: проще не отсекать (деталей немного).
    mesh.frustumCulled = false;
    mesh.position.copy(host.position);
    mesh.quaternion.copy(host.quaternion);
    mesh.scale.copy(host.scale);
    host.parent?.add(mesh);
    mesh.bind(skeleton, host.bindMatrix);
    meshes.push(mesh);
  }

  // Искры на камнях: короткие вспышки по очереди. В экономном режиме без них.
  const sparks: { sprite: THREE.Sprite; size: number; phase: number }[] = [];
  if (!lite) {
    glints.forEach((g, i) => {
      const bone = root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(g.bone));
      if (!bone) return;
      const sprite = new THREE.Sprite(sparkMat(skin.gem));
      sprite.position.copy(g.at);
      sprite.scale.setScalar(0.001);
      sprite.raycast = () => {};
      root.add(sprite);
      sprite.updateMatrixWorld(true);
      bone.attach(sprite);
      sparks.push({ sprite, size: g.size, phase: i * 1.7 });
    });
  }
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 0, 1);
  return {
    meshes,
    update: (t) => {
      for (const s of swings) {
        // Медленный взмах: кончики крыльев поднимаются и опускаются.
        q.setFromAxisAngle(axis, s.side * Math.sin(t * 1.6) * 0.08);
        s.obj.quaternion.copy(s.base).multiply(q);
      }
      for (const s of sparks) {
        // Вспышка раз в ~3 с: быстро разгорается и гаснет.
        const f = Math.max(0, Math.sin(t * 2.1 + s.phase));
        s.sprite.scale.setScalar(Math.max(0.001, s.size * Math.pow(f, 14)));
      }
    },
    // Только память видеокарты: меши остаются на месте (в StrictMode эффект снимается и ставится снова,
    // а освобождённую геометрию three при следующем кадре загрузит заново).
    dispose: () => geos.forEach((g) => g.dispose()),
  };
}

/** Сглаженная копия геометрии для обводки: у граней деталей свои нормали, раздутые порознь они дают щели. */
export function smoothForOutline(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'skinIndex', 'skinWeight']) {
    const a = geo.getAttribute(name);
    if (a) g.setAttribute(name, a);
  }
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  return merged;
}
