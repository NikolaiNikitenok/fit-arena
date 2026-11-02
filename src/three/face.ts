// Лицо героя: рот с губами, зубами и языком, блики в глазах и моргание.
// У моделей KayKit на лице только глаза — рта нет вовсе. Рот строим сами: полосы из треугольников,
// уложенные на поверхность лица (высоту берём лучами по голове в позе «T»), и меняем форму по настроению:
// улыбка в покое, крик при ударе, гримаса от боли, широкая улыбка в победе. Всё — один меш с цветами
// вершин на кости головы, плюс один меш бликов: два вызова отрисовки на героя.
import * as THREE from 'three';
import type { CharName } from './kit';
import { toonOf } from './toon';

export type Mood = { open: number; smile: number };

// Настроение по движению тела.
const MOODS: Record<string, Mood> = {
  idle: { open: 0, smile: 0.55 },
  ready: { open: 0, smile: 0.2 },
  idle2: { open: 0, smile: 0.2 },
  aim2: { open: 0, smile: 0 },
  walk: { open: 0.05, smile: 0.5 },
  run: { open: 0.3, smile: 0.2 },
  jump: { open: 0.65, smile: 1 },
  cheer: { open: 0.8, smile: 1 },
  taunt: { open: 0.55, smile: 0.9 },
  attack: { open: 0.85, smile: 0.05 },
  chop2: { open: 0.85, smile: 0.05 },
  punch: { open: 0.85, smile: 0.05 },
  shoot: { open: 0.2, smile: -0.2 },
  cast: { open: 0.7, smile: 0.3 },
  casting: { open: 0.35, smile: 0.2 },
  hit: { open: 0.45, smile: -0.8 },
  block: { open: 0.15, smile: -0.5 },
  death: { open: 0.4, smile: -0.7 },
  dead: { open: 0.2, smile: -0.6 },
  sit: { open: 0, smile: 0.7 },
  lie: { open: 0, smile: 0.6 },
  interact: { open: 0.1, smile: 0.6 },
};
export const moodOf = (anim: string): Mood => MOODS[anim] ?? MOODS.idle;

// Где рот у каждой модели (координаты модели в позе «T»): середина рта по высоте и полуширина.
// Глаза у всех на одном месте: центр x ±0.205, y 1.60, размер 0.09 × 0.12 (замерено по текстуре).
const MOUTH: Partial<Record<CharName, { y: number; hw: number }>> = {
  Knight: { y: 1.405, hw: 0.084 },
  Rogue: { y: 1.405, hw: 0.08 },
  Mage: { y: 1.392, hw: 0.084 },
  Barbarian: { y: 1.418, hw: 0.09 },
};
const EYE = { x: 0.205, y: 1.6, w: 0.05, h: 0.066 };

// THREE.Color из hex уже переводит в линейные цвета, как и ждут цвета вершин.
const C = (hex: string) => new THREE.Color(hex);
const COL = {
  inside: C('#5a1c24'),
  teeth: C('#fbf6ee'),
  tongue: C('#d8707a'),
  // Губы чуть темнее и розовее кожи: не помада, а живой рот.
  upper: C('#a95c5a'),
  lower: C('#d48a80'),
};

// Поверхность лица: лучом спереди по голове в позе «T». Кэш на модель, точки — по сетке 0.01.
export interface Surface {
  z: (x: number, y: number) => number;
  skin: THREE.Color;
  // Голова в позе «T»: макушка и затылок (координаты модели).
  top: number;
  back: number;
}
const surfaces = new Map<string, Surface>();

export function surfaceOf(model: CharName, head: THREE.SkinnedMesh): Surface {
  const have = surfaces.get(model);
  if (have) return have;
  const pos = head.geometry.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    head.applyBoneTransform(i, v);
    v.applyMatrix4(head.matrixWorld).toArray(arr, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  if (head.geometry.attributes.uv) geo.setAttribute('uv', head.geometry.attributes.uv);
  geo.setIndex(head.geometry.index);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const back = new THREE.Vector3(0, 0, -1);
  const cast = (x: number, y: number) => {
    ray.set(from.set(x, y, 5), back);
    return ray.intersectObject(mesh)[0];
  };
  const grid = new Map<number, number>();
  const at = (i: number, j: number) => {
    const key = i * 4096 + j;
    let z = grid.get(key);
    if (z === undefined) {
      z = cast(i / 100, j / 100)?.point.z ?? 0.42;
      grid.set(key, z);
    }
    return z;
  };
  const z = (x: number, y: number) => {
    const fx = x * 100;
    const fy = y * 100;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const a = fx - i;
    const b = fy - j;
    return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
  };
  // Цвет кожи — под глазом, ближе к щеке: им красим веки.
  const skin = new THREE.Color('#e8b896');
  const hit = cast(EYE.x + 0.06, EYE.y - 0.1);
  const img = (head.material as THREE.MeshStandardMaterial).map?.image as CanvasImageSource & { width: number; height: number } | undefined;
  if (hit?.uv && img?.width) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const ctx = c.getContext('2d')!;
      // Текстуры glTF не переворачиваются: v идёт сверху вниз.
      ctx.drawImage(img, Math.floor(hit.uv.x * img.width), Math.floor(hit.uv.y * img.height), 1, 1, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      skin.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    } catch {
      // Холст недоступен — остаётся обычный цвет кожи.
    }
  }
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  geo.dispose();
  const s = { z, skin, top: box.max.y, back: box.min.z };
  surfaces.set(model, s);
  return s;
}

const N = 14; // отрезков по ширине рта
const BANDS = 5; // верхняя губа, нижняя губа, рот изнутри, зубы, язык
const LID = 10; // отрезков по краю века

export interface Face {
  meshes: THREE.Mesh[];
  materials: THREE.MeshToonMaterial[];
  update(time: number, dt: number, mood: Mood, stone: boolean): void;
  dispose(): void;
}

export function buildFace(root: THREE.Object3D, model: CharName): Face | null {
  const spec = MOUTH[model];
  const head = root.getObjectByName('head');
  let skinned: THREE.SkinnedMesh | undefined;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && /_Head$/.test(o.name)) skinned = o as THREE.SkinnedMesh;
  });
  if (!spec || !head || !skinned) return null;
  root.updateMatrixWorld(true);
  const surf = surfaceOf(model, skinned);
  const toHead = head.matrixWorld.clone().invert();

  // Рот и веки — один меш: полосы рта, потом два века.
  const mouthVerts = BANDS * (N + 1) * 2;
  const lidVerts = 2 * (LID + 1) * 2;
  const count = mouthVerts + lidVerts;
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const color = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const index: number[] = [];
  const strip = (base: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  for (let b = 0; b < BANDS; b++) strip(b * (N + 1) * 2, N);
  for (let e = 0; e < 2; e++) strip(mouthVerts + e * (LID + 1) * 2, LID);
  const paint = (from: number, n: number, c: THREE.Color) => {
    for (let i = 0; i < n; i++) color.setXYZ(from + i, c.r, c.g, c.b);
  };
  const band = (b: number) => b * (N + 1) * 2;
  paint(band(0), (N + 1) * 2, COL.upper);
  paint(band(1), (N + 1) * 2, COL.lower);
  paint(band(2), (N + 1) * 2, COL.inside);
  paint(band(3), (N + 1) * 2, COL.teeth);
  paint(band(4), (N + 1) * 2, COL.tongue);
  paint(mouthVerts, lidVerts, surf.skin);
  // Рот плоский и смотрит вперёд: нормаль одна на все вершины (вперёд и чуть вверх, к свету).
  const normal = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const n = new THREE.Vector3(0, 0.25, 1).transformDirection(toHead);
  for (let i = 0; i < count; i++) normal.setXYZ(i, n.x, n.y, n.z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', position);
  geo.setAttribute('normal', normal);
  geo.setAttribute('color', color);
  geo.setIndex(index);
  const mat = toonOf(new THREE.MeshStandardMaterial({ color: '#ffffff' }));
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  head.add(mesh);

  // Блики в глазах: по большому и маленькому кружку, свет сверху сбоку.
  const glintGeo = new THREE.BufferGeometry();
  const glints: number[] = [];
  const disc = (cx: number, cy: number, r: number) => {
    const seg = 10;
    const p = new THREE.Vector3();
    const put = (x: number, y: number) => {
      p.set(x, y, surf.z(x, y) + 0.012).applyMatrix4(toHead);
      glints.push(p.x, p.y, p.z);
    };
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      put(cx, cy);
      put(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      put(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    }
  };
  for (const s of [-1, 1]) {
    disc(s * EYE.x + 0.016, EYE.y + 0.026, 0.017);
    disc(s * EYE.x - 0.012, EYE.y - 0.022, 0.008);
  }
  glintGeo.setAttribute('position', new THREE.Float32BufferAttribute(glints, 3));
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const glint = new THREE.Mesh(glintGeo, glintMat);
  glint.frustumCulled = false;
  glint.renderOrder = 2;
  head.add(glint);

  const p = new THREE.Vector3();
  const set = (i: number, x: number, y: number, lift: number) => {
    p.set(x, y, surf.z(x, y) + lift).applyMatrix4(toHead);
    position.setXYZ(i, p.x, p.y, p.z);
  };

  const now: Mood = { open: -1, smile: -9 };
  let lidNow = -1;
  let nextBlink = 1.5 + Math.random() * 3;

  const shapeMouth = (open: number, smile: number) => {
    const hw = spec.hw * (1 - 0.18 * open + 0.08 * Math.max(0, smile));
    const y0 = spec.y;
    const gap = 0.074 * open;
    for (let k = 0; k <= N; k++) {
      const u = -1 + (2 * k) / N;
      const edge = 1 - u * u;
      const x = u * hw;
      // Улыбка опускает середину и поднимает уголки, грусть — наоборот.
      const bend = -smile * 0.016 * edge + smile * 0.006 * u * u;
      const upIn = bend + gap * 0.22 * Math.pow(edge, 0.7);
      const loIn = bend - gap * Math.pow(edge, 0.6) - 0.0025 * edge;
      // Верхняя губа тоньше, с ямкой посередине; нижняя полнее.
      const upOut = upIn + (0.006 + 0.008 * Math.sqrt(edge)) - 0.0035 * Math.exp(-((u / 0.2) ** 2));
      const loOut = loIn - (0.007 + 0.012 * Math.sqrt(edge));
      const i = k * 2;
      set(band(0) + i, x, y0 + upOut, 0.0085);
      set(band(0) + i + 1, x, y0 + upIn, 0.0085);
      set(band(1) + i, x, y0 + loIn, 0.0085);
      set(band(1) + i + 1, x, y0 + loOut, 0.0085);
      // Рот изнутри — между губами (и тонкая тёмная черта, когда рот закрыт).
      set(band(2) + i, x * 0.98, y0 + upIn + 0.0015, 0.006);
      set(band(2) + i + 1, x * 0.98, y0 + loIn - 0.0015, 0.006);
      // Зубы — полоска под верхней губой, язык — у нижней.
      const teeth = Math.min(gap * 0.4, 0.016) * Math.pow(edge, 0.4);
      const tx = x * 0.8;
      set(band(3) + i, tx, y0 + upIn, 0.007);
      set(band(3) + i + 1, tx, y0 + upIn - teeth, 0.007);
      const tongue = gap * 0.42 * Math.pow(edge, 0.5);
      const gx = x * 0.62;
      const ly = bend - gap * Math.pow(1 - (u * 0.62) ** 2, 0.6);
      set(band(4) + i, gx, y0 + ly + tongue, 0.0068);
      set(band(4) + i + 1, gx, y0 + ly, 0.0068);
    }
  };

  // Веко: сверху вниз закрывает глаз; 0 — открыт (схлопнуто у брови), 1 — закрыт.
  const shapeLids = (shut: number) => {
    for (let e = 0; e < 2; e++) {
      const s = e === 0 ? -1 : 1;
      const base = mouthVerts + e * (LID + 1) * 2;
      for (let k = 0; k <= LID; k++) {
        const u = -1 + (2 * k) / LID;
        const x = s * EYE.x + u * (EYE.w + 0.006);
        const half = Math.sqrt(Math.max(0, 1 - u * u));
        const top = EYE.y + (EYE.h + 0.006) * half;
        const bottom = top - (2 * EYE.h + 0.012) * half * shut;
        set(base + k * 2, x, top, 0.013);
        set(base + k * 2 + 1, x, bottom, 0.013);
      }
    }
  };

  return {
    meshes: [mesh, glint],
    materials: [mat],
    update(time, dt, mood, stone) {
      const k = Math.min(1, dt * 14);
      const open = now.open < 0 ? mood.open : now.open + (mood.open - now.open) * k;
      const smile = now.smile < -2 ? mood.smile : now.smile + (mood.smile - now.smile) * k;
      if (Math.abs(open - now.open) > 1e-3 || Math.abs(smile - now.smile) > 1e-3) {
        now.open = open;
        now.smile = smile;
        shapeMouth(open, smile);
        position.needsUpdate = true;
      }
      // Моргание раз в 2–5 секунд, у статуи глаза не живые.
      glint.visible = !stone;
      let shut = 0;
      if (!stone) {
        if (time > nextBlink + 0.16) nextBlink = time + 2 + Math.random() * 3;
        const b = (time - nextBlink) / 0.16;
        shut = b > 0 && b < 1 ? Math.sin(b * Math.PI) : 0;
      }
      if (shut !== lidNow) {
        lidNow = shut;
        shapeLids(shut);
        position.needsUpdate = true;
      }
    },
    dispose() {
      head.remove(mesh, glint);
      geo.dispose();
      glintGeo.dispose();
      mat.dispose();
      glintMat.dispose();
    },
  };
}

// Забрало рыцаря закрывает всё ниже носа, и рта не видно. Опускаем нижнюю часть шлема (подбородник)
// к шее — в позе «T», по высоте точки в координатах модели; затылок не трогаем. Кэш на исходную геометрию.
const visors = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
export function openVisor(mesh: THREE.Mesh): void {
  const src = mesh.geometry;
  let geo = visors.get(src);
  if (!geo) {
    geo = src.clone();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const toWorld = mesh.matrixWorld;
    const toLocal = mesh.matrixWorld.clone().invert();
    const v = new THREE.Vector3();
    const TOP = 1.44;
    const NECK = 1.22;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toWorld);
      if (v.y >= TOP) continue;
      // Спереди опускаем сильнее, к затылку — плавно на нет.
      const front = THREE.MathUtils.smoothstep(v.z, -0.25, 0.2);
      const squashed = NECK + (v.y - NECK) * 0.5;
      v.y += (squashed - v.y) * front;
      v.applyMatrix4(toLocal);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    visors.set(src, geo);
  }
  mesh.geometry = geo;
}

/** Лицо без мимики и моргания — для портретов и фигур упражнений: спокойная улыбка. */
export function staticFace(root: THREE.Object3D, model: CharName): Face | null {
  const face = buildFace(root, model);
  face?.update(0, 1, MOODS.idle, false);
  return face;
}
