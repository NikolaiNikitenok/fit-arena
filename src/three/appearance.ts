// Внешность героя поверх модели KayKit: из четырёх тел и четырёх голов собираем разных людей.
//  — голова от другой модели (скелет у всех общий, голова садится на кость head);
//  — головной убор: свой, чужой (шлем, шляпа, шапка-медведь) или без него;
//  — цвет кожи и волос: квадраты палитры (0,0) кожа, (7,2) кожа рук мага, (1,0) волосы и борода;
//  — причёски, бороды и мелочи лица (очки, повязка, веснушки, серьги) — простые фигуры на кости головы;
//  — рост, ширина плеч и размер головы — масштаб костей.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharName } from './kit';
import { surfaceOf } from './face';
import { toonOf } from './toon';

export type HatId = 'own' | 'none' | 'Knight_Helmet' | 'Mage_Hat' | 'Barbarian_Hat';
export type HairStyle = 'none' | 'bun' | 'topknot' | 'ponytail' | 'pigtails' | 'mohawk' | 'spikes' | 'long' | 'braids' | 'curls' | 'bob';
export type Beard = 'none' | 'full' | 'goatee' | 'moustache' | 'viking';
export type Extra = 'glasses' | 'eyepatch' | 'headband' | 'earrings' | 'freckles' | 'blush' | 'scar' | 'warpaint' | 'monocle' | 'flower';

export interface Appearance {
  key: string;
  head?: CharName;
  hat?: HatId;
  skin?: string;
  hair?: string;
  style?: HairStyle;
  beard?: Beard;
  extras?: Extra[];
  // Цвет повязки, раскраски, цветка.
  accent?: string;
  // Рост (1 — как есть), ширина плеч и груди, размер головы.
  height?: number;
  build?: number;
  headSize?: number;
}

export const HATS: Partial<Record<CharName, string>> = { Knight: 'Knight_Helmet', Mage: 'Mage_Hat', Barbarian: 'Barbarian_Hat' };
export const HAT_SOURCE: Record<string, CharName> = { Knight_Helmet: 'Knight', Mage_Hat: 'Mage', Barbarian_Hat: 'Barbarian' };

// ---------- Кожа и волосы в палитре ----------

const SKIN_CELLS: [number, number][] = [
  [0, 0],
  [7, 2],
];
const HAIR_CELLS: [number, number][] = [[1, 0]];
const textures = new Map<string, THREE.Texture>();

function paintCells(ctx: CanvasRenderingContext2D, img: { width: number; height: number }, cells: [number, number][], hex: string) {
  const target = new THREE.Color(hex);
  const sw = img.width / 8;
  const sh = img.height / 4;
  for (const [col, row] of cells) {
    const x0 = Math.round(col * sw);
    const y0 = Math.round(row * sh);
    const w = Math.round(sw);
    const h = Math.round(sh);
    const data = ctx.getImageData(x0, y0, w, h);
    const px = data.data;
    // Средняя яркость квадрата → у нового цвета сохраняются светлые и тёмные места модели.
    let sum = 0;
    for (let i = 0; i < w * h; i++) sum += 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    const mean = Math.max(1, sum / (w * h));
    const s = target.clone().convertLinearToSRGB();
    for (let i = 0; i < w * h; i++) {
      const l = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / mean;
      px[i * 4] = Math.min(255, Math.round(s.r * 255 * l));
      px[i * 4 + 1] = Math.min(255, Math.round(s.g * 255 * l));
      px[i * 4 + 2] = Math.min(255, Math.round(s.b * 255 * l));
    }
    ctx.putImageData(data, x0, y0);
  }
}

/** Палитра с другой кожей и волосами (кэш на исходную текстуру и цвета). */
export function personTexture(src: THREE.Texture, look: Appearance): THREE.Texture {
  if (!look.skin && !look.hair) return src;
  const key = `${src.uuid}|${look.skin ?? ''}|${look.hair ?? ''}`;
  const hit = textures.get(key);
  if (hit) return hit;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  if (!img?.width || typeof document === 'undefined') return src;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0);
  if (look.skin) paintCells(ctx, img, SKIN_CELLS, look.skin);
  if (look.hair) paintCells(ctx, img, HAIR_CELLS, look.hair);
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

// ---------- Чужая голова ----------

/** Голова модели `from` на скелете `root`: та же кость, свои вершины и привязка из её файла. */
export function graftHead(root: THREE.Object3D, from: THREE.Object3D, head: CharName): THREE.SkinnedMesh | null {
  const src = from.getObjectByName(`${head}_Head`) as THREE.SkinnedMesh | undefined;
  if (!src?.isSkinnedMesh) return null;
  const bones = src.skeleton.bones.map((b) => root.getObjectByName(b.name) as THREE.Bone | undefined);
  if (bones.some((b) => !b)) return null;
  const mesh = new THREE.SkinnedMesh(src.geometry, src.material);
  mesh.name = src.name;
  mesh.position.copy(src.position);
  mesh.quaternion.copy(src.quaternion);
  mesh.scale.copy(src.scale);
  let host: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!host && (o as THREE.SkinnedMesh).isSkinnedMesh) host = o.parent;
  });
  (host ?? root).add(mesh);
  mesh.bind(new THREE.Skeleton(bones as THREE.Bone[], src.skeleton.boneInverses), src.bindMatrix);
  return mesh;
}

/** Чужой головной убор: узел из файла другой модели вместе с его положением на кости головы. */
export function graftHat(root: THREE.Object3D, from: THREE.Object3D, hat: string): THREE.Object3D | null {
  const node = from.getObjectByName(hat);
  const bone = node?.parent && root.getObjectByName(node.parent.name);
  if (!node || !bone) return null;
  const copy = node.clone();
  copy.visible = true;
  bone.add(copy);
  return copy;
}

// ---------- Причёски, бороды, мелочи ----------

type Mat = 'hair' | 'accent' | 'dark' | 'gold' | 'glass' | 'pink' | 'freckle';
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Q = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
function place(g: THREE.BufferGeometry, at: THREE.Vector3, q?: THREE.Quaternion, s?: THREE.Vector3): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(at, q ?? new THREE.Quaternion(), s ?? V(1, 1, 1));
  const out = (g.index ? g.toNonIndexed() : g).applyMatrix4(m);
  out.deleteAttribute('uv');
  return out;
}
const ball = (r: number, d = 10) => new THREE.SphereGeometry(r, d, Math.max(6, Math.round(d * 0.7)));
const cone = (r: number, h: number, d = 8) => new THREE.ConeGeometry(r, h, d);

export interface Features {
  meshes: THREE.Mesh[];
  dispose(): void;
}

/** Причёска, борода и мелочи лица на кости головы. head — модель головы (по ней лицо и макушка). */
export function buildFeatures(root: THREE.Object3D, head: CharName, look: Appearance, hatOn: boolean): Features | null {
  const bone = root.getObjectByName('head');
  let skinned: THREE.SkinnedMesh | undefined;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name === `${head}_Head`) skinned = o as THREE.SkinnedMesh;
  });
  if (!bone || !skinned) return null;
  root.updateMatrixWorld(true);
  const surf = surfaceOf(head, skinned);
  const top = surf.top;
  const R = 0.54;
  const cy = top - 0.52;
  const on = (x: number, y: number, lift: number) => V(x, y, surf.z(x, y) + lift);
  const parts: [Mat, THREE.BufferGeometry][] = [];
  const add = (m: Mat, g: THREE.BufferGeometry) => parts.push([m, g]);
  const style = look.style ?? 'none';
  // Под шляпой видно только то, что ниже полей: высокие причёски прячем.
  const tall = !hatOn;

  // --- Причёски ---
  if (style === 'bun' && tall) add('hair', place(ball(0.2), V(0, top - 0.05, -0.28), undefined, V(1, 0.9, 0.9)));
  if (style === 'topknot' && tall) {
    add('hair', place(ball(0.13), V(0, top + 0.07, -0.08)));
    add('accent', place(new THREE.CylinderGeometry(0.07, 0.09, 0.07, 10), V(0, top - 0.02, -0.07)));
  }
  if (style === 'ponytail') {
    add('hair', place(ball(0.14), V(0, cy + 0.12, -R - 0.02)));
    add('accent', place(new THREE.TorusGeometry(0.08, 0.025, 6, 12), V(0, cy + 0.06, -R - 0.08), Q(0.5, 0, 0)));
    add('hair', place(cone(0.13, 0.62), V(0, cy - 0.24, -R - 0.18), Q(Math.PI + 0.35, 0, 0)));
  }
  if (style === 'pigtails') {
    for (const s of [-1, 1]) {
      add('hair', place(ball(0.12), V(s * (R + 0.02), cy + 0.05, -0.12)));
      add('accent', place(new THREE.TorusGeometry(0.06, 0.022, 6, 12), V(s * (R + 0.05), cy - 0.04, -0.12), Q(Math.PI / 2, 0, 0)));
      add('hair', place(cone(0.1, 0.45), V(s * (R + 0.08), cy - 0.3, -0.12), Q(Math.PI, 0, -s * 0.15)));
    }
  }
  if (style === 'mohawk' && tall) {
    for (let i = 0; i < 7; i++) {
      const a = -0.95 + i * 0.32;
      const y = cy + Math.cos(a) * (R - 0.02);
      const z = Math.sin(a) * (R - 0.02);
      add('hair', place(cone(0.07, 0.3, 6), V(0, y + 0.08, z), Q(a, 0, 0), V(0.5, 1, 1.4)));
    }
  }
  if (style === 'spikes' && tall) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const tilt = 0.55;
      const d = V(Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt) - 0.25).normalize();
      const at = V(0, cy, 0).addScaledVector(d, R - 0.04);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
      add('hair', place(cone(0.1, 0.28, 6), at, q));
    }
  }
  if (style === 'long' || style === 'bob') {
    const len = style === 'long' ? 0.8 : 0.38;
    // Волосы спадают за головой и по бокам до плеч: изогнутая прядь сзади и пряди у щёк.
    const back = new THREE.CylinderGeometry(R + 0.04, R + 0.09, len, 14, 3, true, Math.PI * 0.5, Math.PI);
    add('hair', place(back, V(0, cy - len / 2 + 0.05, -0.06)));
    for (const s of [-1, 1]) add('hair', place(cone(0.13, len * 0.95, 8), V(s * (R - 0.02), cy - len * 0.38, 0.04), Q(Math.PI, 0, -s * 0.06), V(0.75, 1, 1.3)));
  }
  if (style === 'braids') {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) add('hair', place(ball(0.075 - i * 0.004, 8), V(s * 0.34, cy - 0.1 - i * 0.11, -R + 0.08 - i * 0.02)));
      add('accent', place(ball(0.05, 8), V(s * 0.34, cy - 0.78, -R - 0.03)));
    }
  }
  if (style === 'curls' && tall) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const ring = i % 2 ? 0.75 : 1.05;
      const d = V(Math.sin(a) * Math.sin(ring), Math.cos(ring), Math.cos(a) * Math.sin(ring) - 0.35).normalize();
      if (d.z > 0.55) continue;
      add('hair', place(ball(0.15, 8), V(0, cy, -0.04).addScaledVector(d, R - 0.02)));
    }
    add('hair', place(ball(0.2, 10), V(0, top - 0.04, -0.1)));
  }

  // --- Бороды (если своя голова уже не бородатая) ---
  const beard = head === 'Barbarian' ? 'none' : look.beard ?? 'none';
  const mouthY = head === 'Mage' ? 1.392 : 1.405;
  if (beard === 'full' || beard === 'viking') {
    add('hair', place(ball(0.3, 12), on(0, mouthY - 0.12, -0.2), undefined, V(1.45, 0.75, 0.8)));
    for (const s of [-1, 1]) add('hair', place(ball(0.16, 8), on(s * 0.3, mouthY - 0.02, -0.2), undefined, V(0.8, 1.3, 0.9)));
  }
  if (beard === 'viking') {
    for (const s of [-1, 1]) {
      add('hair', place(cone(0.07, 0.3, 6), on(s * 0.1, mouthY - 0.4, -0.02), Q(Math.PI, 0, 0)));
      add('accent', place(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), on(s * 0.1, mouthY - 0.3, 0)));
    }
  }
  if (beard === 'goatee') add('hair', place(cone(0.06, 0.16, 7), on(0, mouthY - 0.1, 0.02), Q(Math.PI + 0.3, 0, 0)));
  if (beard === 'moustache' || beard === 'full' || beard === 'viking' || beard === 'goatee') {
    for (const s of [-1, 1]) add('hair', place(ball(0.05, 8), on(s * 0.055, mouthY + 0.032, 0.015), Q(0, 0, s * 0.35), V(1.5, 0.55, 0.6)));
  }

  // --- Мелочи лица ---
  const ex = new Set(look.extras ?? []);
  const EYE_X = 0.205;
  const EYE_Y = 1.6;
  if (ex.has('glasses') || ex.has('monocle')) {
    const sides = ex.has('monocle') ? [1] : [-1, 1];
    for (const s of sides) {
      const at = on(s * EYE_X, EYE_Y, 0.03);
      add('gold', place(new THREE.TorusGeometry(0.085, 0.014, 6, 18), at));
      add('glass', place(new THREE.CircleGeometry(0.08, 16), at.clone().add(V(0, 0, -0.004))));
    }
    if (!ex.has('monocle')) add('gold', place(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6), on(0, EYE_Y + 0.02, 0.04), Q(0, 0, Math.PI / 2)));
    else add('gold', place(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), on(EYE_X + 0.07, EYE_Y - 0.18, 0.02), Q(0, 0, 0.3)));
  }
  if (ex.has('eyepatch')) {
    add('dark', place(new THREE.CircleGeometry(0.1, 14), on(-EYE_X, EYE_Y, 0.022), undefined, V(1, 0.9, 1)));
    // Ремешок наискосок ко лбу и к уху.
    add('dark', place(new THREE.PlaneGeometry(0.025, 0.2), on(-EYE_X + 0.07, EYE_Y + 0.15, 0.012), Q(-0.3, 0, -0.75)));
    add('dark', place(new THREE.PlaneGeometry(0.025, 0.2), on(-EYE_X - 0.13, EYE_Y - 0.03, 0.012), Q(0, -0.6, -0.9)));
  }
  if (ex.has('headband') && !hatOn) add('accent', place(new THREE.TorusGeometry(R + 0.015, 0.045, 6, 28), V(0, top - 0.3, -0.02), Q(Math.PI / 2 + 0.12, 0, 0)));
  if (ex.has('earrings')) for (const s of [-1, 1]) add('gold', place(new THREE.TorusGeometry(0.04, 0.012, 6, 12), V(s * (R + 0.01), 1.5, -0.02), Q(0, Math.PI / 2, 0)));
  if (ex.has('freckles')) {
    for (const s of [-1, 1]) for (const [dx, dy] of [[0, 0], [0.05, 0.02], [0.1, -0.01], [0.04, -0.04], [0.09, 0.04]] as const) {
      add('freckle', place(new THREE.CircleGeometry(0.011, 6), on(s * (0.13 + dx), 1.49 + dy, 0.008)));
    }
  }
  if (ex.has('blush')) for (const s of [-1, 1]) add('pink', place(new THREE.CircleGeometry(0.065, 14), on(s * 0.27, 1.48, 0.006), undefined, V(1, 0.6, 1)));
  if (ex.has('scar')) add('dark', place(new THREE.PlaneGeometry(0.02, 0.22), on(0.25, 1.62, 0.02), Q(0, 0, 0.35)));
  if (ex.has('warpaint')) for (const s of [-1, 1]) for (const k of [0, 1]) add('accent', place(new THREE.PlaneGeometry(0.15, 0.025), on(s * 0.26, 1.48 - k * 0.05, 0.01), Q(0, s * 0.25, s * -0.1)));
  if (ex.has('flower') && !hatOn) {
    const at = V(0.36, top - 0.18, 0.22);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add('accent', place(ball(0.055, 8), at.clone().add(V(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0)), undefined, V(1, 1, 0.5)));
    }
    add('gold', place(ball(0.04, 8), at.clone().add(V(0, 0, 0.02))));
  }
  if (!parts.length) return null;

  // Всё в координатах модели → в координаты кости головы; по одному мешу на материал.
  const toHead = bone.matrixWorld.clone().invert();
  const colors: Record<Mat, string> = {
    hair: look.hair ?? '#5a3a26',
    accent: look.accent ?? '#e53935',
    dark: '#1d1a22',
    gold: '#e0b04a',
    glass: '#bfe7ff',
    pink: '#f29a9a',
    freckle: '#b0704a',
  };
  const byMat = new Map<Mat, THREE.BufferGeometry[]>();
  for (const [m, g] of parts) {
    g.applyMatrix4(toHead);
    (byMat.get(m) ?? byMat.set(m, []).get(m)!).push(g);
  }
  const meshes: THREE.Mesh[] = [];
  const disposables: { dispose(): void }[] = [];
  for (const [m, list] of byMat) {
    const geo = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!geo) continue;
    geo.computeVertexNormals();
    const mat = m === 'glass'
      ? new THREE.MeshBasicMaterial({ color: colors.glass, transparent: true, opacity: 0.35, depthWrite: false })
      : toonOf(new THREE.MeshStandardMaterial({ color: colors[m] }));
    if (m === 'glass' || m === 'pink' || m === 'freckle') (mat as THREE.Material).side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `feature-${m}`;
    mesh.castShadow = m === 'hair';
    mesh.frustumCulled = false;
    bone.add(mesh);
    meshes.push(mesh);
    disposables.push(geo, mat);
  }
  return {
    meshes,
    dispose() {
      meshes.forEach((m) => m.parent?.remove(m));
      disposables.forEach((d) => d.dispose());
    },
  };
}

/** Рост, плечи, голова — после анимации каждый кадр (анимация может задавать масштаб костей). */
export function proportions(root: THREE.Object3D, look: Appearance): (() => void) | null {
  const build = look.build ?? 1;
  const head = look.headSize ?? 1;
  if (build === 1 && head === 1) return null;
  const chest = root.getObjectByName('chest');
  const headBone = root.getObjectByName('head');
  return () => {
    if (chest && build !== 1) chest.scale.set(build, 1, build);
    // Голова — в обратную сторону от плеч: широкий герой не получает огромную голову.
    if (headBone) headBone.scale.setScalar(head / (build !== 1 ? build : 1));
  };
}
