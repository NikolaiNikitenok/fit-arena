import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Instanced, Placed } from '../three/Instanced';
import { ribbonGeometry } from '../three/Prop';
import { GRID, isTrap } from '../../shared/village';
import { MARGIN } from '../../shared/villageBattle';
import { type Prim, SIZE, THEME_TREE_TINT } from './looks';
import { mixHex } from './sky';
import { PrimInstances } from './looks3d';
import type { Decor, ThemeId } from './decor';
import type { ViewBld } from './Village3D';

// Земля деревни: плато из отдельных плиток-кубиков (трава разных оттенков, под постройками — камень,
// вокруг них и между ними — протоптанные тропы), каменный бордюр по краю места для стройки, обрыв
// с земляными боками по краю поля боя и низина вокруг: лес, холмы, река и озеро.
// Все плитки, бордюр и камни обрыва — один InstancedMesh (один вызов отрисовки), травинки, цветы
// и камешки — ещё по одному. В экономном режиме мелочей вдвое меньше и нет теней.

const W = (c: number) => c - GRID / 2;
// Плато — всё поле боя: сетка и полоса MARGIN клеток вокруг, по ней ходят отряды.
const LO = -MARGIN;
const HI = GRID + MARGIN;
const EDGE = GRID / 2 + MARGIN;
export const LOWLAND_Y = -1.8;
const TILE_H = 0.3;
const UNDER_TOP = -0.2;

const hash = (x: number, y: number, k = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
// Плавный шум для пятен травы.
function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, 9);
  const b = hash(ix + 1, iy, 9);
  const c = hash(ix, iy + 1, 9);
  const d = hash(ix + 1, iy + 1, 9);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Что лежит в клетке сетки: трава, тропа у постройки, протоптанная дорожка, камень под постройкой.
const GRASS = 0;
const DIRT = 1;
const PATH = 2;
const FOUND = 3;

export function tileKinds(buildings: ViewBld[], paths: Decor[] = []): Uint8Array {
  const k = new Uint8Array(GRID * GRID);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < GRID && y < GRID ? y * GRID + x : -1);
  // Дорожки, которые проложил игрок.
  for (const d of paths) if (d.k === 'path' && at(d.x, d.y) >= 0) k[at(d.x, d.y)] = PATH;
  for (const b of buildings) {
    const s = SIZE[b.t];
    if (isTrap(b.t)) continue;
    if (b.t !== 'wall')
      for (let y = b.y - 1; y <= b.y + s; y++)
        for (let x = b.x - 1; x <= b.x + s; x++) {
          const i = at(x, y);
          if (i >= 0 && k[i] === GRASS) k[i] = DIRT;
        }
  }
  // Дорожки от каждой постройки к ратуше: сперва по x, потом по y.
  const th = buildings.find((b) => b.t === 'townhall');
  if (th) {
    const tx = th.x + 1;
    const ty = th.y + 3;
    for (const b of buildings) {
      if (b.t === 'wall' || isTrap(b.t) || b === th) continue;
      let x = b.x + (b.x < tx ? SIZE[b.t] : -1);
      let y = b.y + 1;
      const mark = () => {
        const i = at(x, y);
        if (i >= 0 && k[i] === GRASS) k[i] = PATH;
      };
      while (x !== tx) {
        mark();
        x += x < tx ? 1 : -1;
      }
      while (y !== ty) {
        mark();
        y += y < ty ? 1 : -1;
      }
      mark();
    }
  }
  for (const b of buildings) {
    // Ловушки прячутся в траве: под ними земля не меняется.
    if (isTrap(b.t)) continue;
    const s = SIZE[b.t];
    for (let y = b.y; y < b.y + s; y++) for (let x = b.x; x < b.x + s; x++) {
      const i = at(x, y);
      if (i >= 0) k[i] = FOUND;
    }
  }
  return k;
}

interface Pal {
  grass: string[];
  meadow: string;
  dirt: string[];
  tuft: string[];
  flower: string[];
  // Низина: основной цвет, светлые поляны, тёмные места; вода и берег; дорога.
  low: [string, string, string];
  water: string;
  sand: string;
  road: string;
  // Как перекрасить деревья низины.
  tree?: string;
}
const OWN: Pal = {
  grass: ['#62a83c', '#69ae40', '#70b345', '#77b84a'], meadow: '#5c9c37', dirt: ['#a9845a', '#b38d61', '#9e7a51'],
  tuft: ['#5f9a35', '#6aa83d', '#77b546', '#558f30'], flower: ['#ffffff', '#ffe066', '#ff9ec7', '#9ec5ff', '#ff7a6b'],
  low: ['#6f9e42', '#86b34c', '#55833a'], water: '#4fa6d8', sand: '#d2bb84', road: '#b8946a',
};
// Чужая деревня — выцветшая, своя — по теме деревни (src/village/decor.ts).
const PALS: Record<'enemy' | ThemeId, Pal> = {
  classic: OWN,
  enemy: { ...OWN, grass: ['#a1a15c', '#a7a661', '#adab66', '#b3b06b'], meadow: '#95934f', low: ['#8f8b52', '#a39e60', '#76733f'], water: '#5f8f9e', sand: '#b9a173', road: '#a08860' },
  winter: {
    grass: ['#e6edf5', '#eef3f9', '#dfe7f1', '#f5f8fc'], meadow: '#dbe4ef', dirt: ['#c9bcab', '#d3c7b8', '#bfb2a1'],
    tuft: ['#d6e1ee', '#c8d6e6', '#e3ebf4', '#bccbdd'], flower: [],
    low: ['#e3eaf3', '#f6f9fc', '#c7d3e2'], water: '#a8d0ea', sand: '#e9eff6', road: '#c9c2b8', tree: THEME_TREE_TINT.winter,
  },
  halloween: {
    grass: ['#6c7848', '#74804e', '#657143', '#7c8856'], meadow: '#5e6940', dirt: ['#8e7252', '#987a57', '#84694b'],
    tuft: ['#58653a', '#637041', '#4f5b33', '#6d7a46'], flower: ['#ff8a24', '#b06ae0', '#ffb347'],
    low: ['#5c6640', '#6c784b', '#475030'], water: '#4a6c78', sand: '#8a7a5a', road: '#7f6a50', tree: THEME_TREE_TINT.halloween,
  },
};
const palOf = (enemy: boolean, theme: ThemeId) => PALS[enemy ? 'enemy' : theme];
const PATH_C = ['#c4a274', '#cdab7c', '#b9976a'];
const FOUND_C = ['#bdb4a4', '#b1a898', '#c6bdad', '#aaa192'];
const ROCK_C = ['#8a6a4a', '#7b5d40', '#94755a', '#6f5a48', '#8c8a86'];

interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  c: string;
}

function blocks(kinds: Uint8Array, enemy: boolean, theme: ThemeId = 'classic'): Box[] {
  const out: Box[] = [];
  const pal = palOf(enemy, theme);
  const pick = (list: string[], x: number, y: number) => list[Math.floor(hash(x, y, 3) * list.length)];
  // Тёмная земля под плитками: видна в щелях, её бока — обрыв плато.
  out.push({ x: 0, y: (UNDER_TOP + LOWLAND_Y) / 2, z: 0, sx: EDGE * 2 + 0.2, sy: UNDER_TOP - LOWLAND_Y, sz: EDGE * 2 + 0.2, c: '#6b4e33' });
  for (let cy = LO; cy < HI; cy++)
    for (let cx = LO; cx < HI; cx++) {
      const inside = cx >= 0 && cy >= 0 && cx < GRID && cy < GRID;
      const kind = inside ? kinds[cy * GRID + cx] : GRASS;
      let c: string;
      let top = 0;
      let size = 1;
      // Газон как в больших стратегиях: сплошной, без щелей, со «следами газонокосилки» —
      // клетки через одну чуть светлее. Возле построек трава чуть темнее, будто примята.
      const stripe = (cx + cy) % 2 === 0 ? 0.045 : 0;
      if (kind === FOUND) {
        // Площадка под постройкой — брусчатка: швы между камнями видны.
        c = pick(FOUND_C, cx, cy);
        size = 0.95;
      }
      else if (kind === PATH) {
        c = pick(PATH_C, cx, cy);
        top = -0.02;
        size = 0.97;
      } else if (inside) {
        const n = noise(cx / 5.5, cy / 5.5);
        c = pal.grass[Math.min(3, Math.floor(n * 3.4 + hash(cx, cy, 2) * 0.5))];
        if (kind === DIRT) c = mixHex(c, '#000000', 0.06);
        c = mixHex(c, '#ffffff', stripe);
      } else c = mixHex(hash(cx, cy, 4) < 0.5 ? pal.meadow : pal.grass[2], '#ffffff', stripe * 0.6);
      out.push({ x: W(cx + 0.5), y: top - TILE_H / 2, z: W(cy + 0.5), sx: size, sy: TILE_H, sz: size, c });
    }
  // Каменный бордюр вокруг места для стройки.
  const H = GRID / 2;
  for (let side = 0; side < 4; side++)
    for (let k = 0; k < GRID * 2; k++) {
      const a = -H + 0.25 + k * 0.5;
      const along = side < 2;
      const fixed = side % 2 ? H : -H;
      const c = hash(k, side, 5) < 0.5 ? '#9fa3a8' : '#8c9096';
      const h = 0.12 + 0.05 * hash(k, side, 6);
      out.push({ x: along ? a : fixed, y: h / 2, z: along ? fixed : a, sx: along ? 0.46 : 0.24, sy: h, sz: along ? 0.24 : 0.46, c });
    }
  for (const [x, z] of [[-H, -H], [H, -H], [-H, H], [H, H]]) out.push({ x, y: 0.2, z, sx: 0.42, sy: 0.4, sz: 0.42, c: '#7f848a' });
  // Камни и комья земли на склонах обрыва.
  for (let side = 0; side < 4; side++)
    for (let k = 0; k < EDGE * 2 * 1.4; k++) {
      const a = -EDGE + (k + 0.5) / 1.4;
      const out1 = EDGE + 0.05 + 0.18 * hash(k, side, 7);
      const h = 0.4 + 0.8 * hash(k, side, 8);
      const y = LOWLAND_Y + h / 2 + (UNDER_TOP - LOWLAND_Y - h) * hash(k, side, 10);
      const w = 0.6 + 0.4 * hash(k, side, 11);
      const d = 0.3 + 0.2 * hash(k, side, 12);
      const c = ROCK_C[Math.floor(hash(k, side, 13) * ROCK_C.length)];
      const xz = side === 0 ? [a, -out1] : side === 1 ? [a, out1] : side === 2 ? [-out1, a] : [out1, a];
      const along = side < 2;
      out.push({ x: xz[0], y, z: xz[1], sx: along ? w : d, sy: h, sz: along ? d : w, c });
    }
  // Полоса травы-«козырька» по верхнему краю обрыва.
  for (let side = 0; side < 4; side++) {
    const along = side < 2;
    const f = side % 2 ? EDGE + 0.08 : -EDGE - 0.08;
    out.push({ x: along ? 0 : f, y: -0.12, z: along ? f : 0, sx: along ? EDGE * 2 + 0.3 : 0.16, sy: 0.16, sz: along ? 0.16 : EDGE * 2 + 0.3, c: pal.meadow });
  }
  return out;
}

/** Площадка под каждой постройкой: тёмная каменная кайма и светлая брусчатка сверху, чуть над газоном. */
function pads(buildings: ViewBld[]): Box[] {
  const out: Box[] = [];
  for (const b of buildings) {
    if (b.t === 'wall' || isTrap(b.t)) continue;
    const s = SIZE[b.t];
    const cx = W(b.x + s / 2);
    const cz = W(b.y + s / 2);
    out.push({ x: cx, y: 0.025, z: cz, sx: s - 0.06, sy: 0.05, sz: s - 0.06, c: '#857c6f' });
    // Брусчатка — плитками по клетке, со швами.
    for (let i = 0; i < s; i++)
      for (let j = 0; j < s; j++) {
        const c = FOUND_C[Math.floor(hash(b.x + i, b.y + j, 41) * FOUND_C.length)];
        const inset = (k: number) => (k === 0 ? 0.13 : 0.02);
        const x0 = W(b.x + i) + inset(i);
        const x1 = W(b.x + i + 1) - (i === s - 1 ? 0.13 : 0.02);
        const z0 = W(b.y + j) + inset(j);
        const z1 = W(b.y + j + 1) - (j === s - 1 ? 0.13 : 0.02);
        out.push({ x: (x0 + x1) / 2, y: 0.035, z: (z0 + z1) / 2, sx: x1 - x0, sy: 0.07, sz: z1 - z0, c });
      }
  }
  return out;
}

function useBoxMesh(list: Box[], shadows: boolean) {
  const mesh = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.95 }), list.length);
    const mat = new THREE.Matrix4();
    const col = new THREE.Color();
    list.forEach((b, i) => {
      mat.makeScale(b.sx, b.sy, b.sz).setPosition(b.x, b.y, b.z);
      m.setMatrixAt(i, mat);
      m.setColorAt(i, col.set(b.c));
    });
    m.receiveShadow = true;
    m.castShadow = shadows;
    m.computeBoundingSphere();
    return m;
  }, [list, shadows]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return mesh;
}

// Мелочи на свободной траве.
interface Bit {
  x: number;
  z: number;
  s: number;
  r: number;
  c: string;
}
const PEBBLE_C = ['#b5b5ad', '#9d9c95', '#c8c4b8'];

function bits(kinds: Uint8Array, lite: boolean, enemy: boolean, theme: ThemeId = 'classic') {
  const pal = palOf(enemy, theme);
  const TUFT_C = pal.tuft;
  const FLOWER_C = pal.flower;
  const tufts: Bit[] = [];
  const flowers: Bit[] = [];
  const pebbles: Bit[] = [];
  const keep = lite ? 0.5 : 1;
  for (let cy = LO; cy < HI; cy++)
    for (let cx = LO; cx < HI; cx++) {
      const inside = cx >= 0 && cy >= 0 && cx < GRID && cy < GRID;
      const kind = inside ? kinds[cy * GRID + cx] : GRASS;
      const at = (k: number) => ({ x: W(cx + 0.15 + 0.7 * hash(cx, cy, k)), z: W(cy + 0.15 + 0.7 * hash(cx, cy, k + 1)), r: hash(cx, cy, k + 2) * 6.28 });
      if (kind === GRASS) {
        const n = hash(cx, cy, 20) < 0.22 * keep ? 1 + (hash(cx, cy, 21) < 0.4 ? 1 : 0) : 0;
        for (let j = 0; j < n; j++) tufts.push({ ...at(30 + j * 3), s: 0.7 + 0.6 * hash(cx, cy, 40 + j), c: TUFT_C[Math.floor(hash(cx, cy, 41 + j) * 4)] });
        if (!enemy && FLOWER_C.length && hash(cx, cy, 22) < 0.09 * keep) {
          // Цветы растут кучками по 2–3.
          const c = FLOWER_C[Math.floor(hash(cx, cy, 23) * FLOWER_C.length)];
          const base = at(50);
          for (let j = 0; j < 3; j++) flowers.push({ x: base.x + (hash(cx, cy, 60 + j) - 0.5) * 0.3, z: base.z + (hash(cx, cy, 63 + j) - 0.5) * 0.3, s: 0.8 + 0.4 * hash(cx, cy, 66 + j), r: 0, c });
        }
      }
      if ((kind === GRASS || kind === DIRT || kind === PATH) && hash(cx, cy, 24) < (kind === GRASS ? 0.05 : 0.2) * keep) pebbles.push({ ...at(70), s: 0.6 + 0.8 * hash(cx, cy, 73), c: PEBBLE_C[Math.floor(hash(cx, cy, 74) * 3)] });
    }
  return { tufts, flowers, pebbles };
}

const tuftGeo = () => {
  const parts = [0, 1, 2].map((k) => {
    const g = new THREE.ConeGeometry(0.05, 0.3, 3);
    g.translate(0, 0.15, 0);
    g.rotateZ((k - 1) * 0.35);
    g.rotateY(k * 2.1);
    g.translate((k - 1) * 0.04, 0, (k % 2) * 0.03);
    return g;
  });
  return mergeGeometries(parts)!;
};
const flowerGeo = () => {
  const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.18, 3);
  stem.translate(0, 0.09, 0);
  const head = new THREE.IcosahedronGeometry(0.06, 0);
  head.translate(0, 0.2, 0);
  stem.deleteAttribute('uv');
  head.deleteAttribute('uv');
  return mergeGeometries([stem.toNonIndexed(), head.toNonIndexed()])!;
};
const pebbleGeo = () => {
  const g = new THREE.DodecahedronGeometry(0.08, 0);
  g.scale(1, 0.5, 0.8);
  g.translate(0, 0.01, 0);
  return g;
};

function BitMesh({ list, geo, flat }: { list: Bit[]; geo: () => THREE.BufferGeometry; flat?: boolean }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geo(), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: flat }), Math.max(1, list.length));
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    list.forEach((b, i) => {
      q.setFromAxisAngle(up, b.r);
      mat.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.s, b.s, b.s));
      m.setMatrixAt(i, mat);
      m.setColorAt(i, col.set(b.c));
    });
    m.count = list.length;
    m.computeBoundingSphere();
    return m;
  }, [list, geo, flat]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

/** Контуры всех клеток сетки: видны при расстановке. */
function GridLines() {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const i = 0.47;
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const cx = W(x + 0.5);
        const cz = W(y + 0.5);
        const p = [
          [cx - i, cz - i],
          [cx + i, cz - i],
          [cx + i, cz + i],
          [cx - i, cz + i],
        ];
        for (let k = 0; k < 4; k++) pos.push(p[k][0], 0.012, p[k][1], p[(k + 1) % 4][0], 0.012, p[(k + 1) % 4][1]);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} renderOrder={2}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.32} depthWrite={false} />
    </lineSegments>
  );
}

/** Клетки под призраком: зелёные, если место свободно; занятые — красные. */
function Footprint({ ghost, buildings }: { ghost: { t: ViewBld['t']; x: number; y: number; ok: boolean; id?: number }; buildings: ViewBld[] }) {
  const mesh = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.94, 0.94);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, depthTest: false }), 9);
    // Поверх всего: клетки видно, даже когда призрак залез на другую постройку.
    m.renderOrder = 3;
    m.frustumCulled = false;
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  const s = SIZE[ghost.t];
  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const b of buildings) {
      if (b.i === ghost.id) continue;
      const bs = SIZE[b.t];
      for (let y = b.y; y < b.y + bs; y++) for (let x = b.x; x < b.x + bs; x++) set.add(`${x},${y}`);
    }
    return set;
  }, [buildings, ghost.id]);
  const mat = new THREE.Matrix4();
  const col = new THREE.Color();
  let n = 0;
  for (let y = ghost.y; y < ghost.y + s; y++)
    for (let x = ghost.x; x < ghost.x + s; x++) {
      mesh.setMatrixAt(n, mat.makeTranslation(W(x + 0.5), 0.02, W(y + 0.5)));
      mesh.setColorAt(n, col.set(ghost.ok ? '#3dff9e' : taken.has(`${x},${y}`) ? '#ff2d55' : '#ff9aa9'));
      n++;
    }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return <primitive object={mesh} />;
}

// ── Низина вокруг плато ──────────────────────────────────────────────────────────────────────────

const RIVER: [number, number][] = Array.from({ length: 40 }, (_, k) => {
  const x = -70 + k * 3.4;
  return [x, -21.5 + 2.2 * Math.sin(x / 7) + (x > 20 ? (x - 20) * 0.35 : 0)];
});
const LAKE = { x: -25, z: 6, r: 6.5 };
const riverZ = (x: number) => -21.5 + 2.2 * Math.sin(x / 7) + (x > 20 ? (x - 20) * 0.35 : 0);
// Дорога от деревни на север: вниз с обрыва, через мост за реку и в дымку.
const BRIDGE = { x: 3, z: riverZ(3) };
const ROAD: [number, number][] = Array.from({ length: 16 }, (_, k) => {
  const z = -16 - k * 1.6;
  return [BRIDGE.x + 0.9 * Math.sin(k * 0.55) * (k > 5 ? 1 : 0.3), z];
});
// Мельница на реке и ветряк на холме.
const MILL = { x: -11, z: riverZ(-11) + 3.4 };
const WINDMILL = { x: -21, z: 21 };
const nearWater = (x: number, z: number) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2 || RIVER.some(([rx, rz]) => Math.hypot(x - rx, z - rz) < 3.6);
const nearRoad = (x: number, z: number) => ROAD.some(([rx, rz]) => Math.hypot(x - rx, z - rz) < 2.2) || Math.hypot(x - MILL.x, z - MILL.z) < 3 || Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 3.2;

function lowland(lite: boolean, theme: ThemeId = 'classic'): { fantasy: Placed[]; village: Placed[]; prim: Prim[] } {
  const tree = PALS[theme].tree;
  const prim: Prim[] = [];
  const fantasy: Placed[] = [];
  const village: Placed[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const free = (x: number, z: number) => !(Math.abs(x) < EDGE + 1.2 && Math.abs(z) < EDGE + 1.2) && !nearWater(x, z) && !nearRoad(x, z);
  const big = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium', 'tree_single_A', 'tree_single_B', 'hills_A_trees', 'hills_B_trees', 'mountain_A_grass_trees', 'mountain_B_grass_trees'];
  const n = lite ? 90 : 170;
  const Y = LOWLAND_Y;
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 17.2 + rnd() * 22;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!free(x, z)) continue;
    const near = r < 22;
    const roll = rnd();
    if (near && roll < 0.35) {
      // У подножия обрыва — кусты, камни и пни.
      const small = ['bush', 'rock_single_E', 'tree_single_A_cut', 'bush'][Math.floor(rnd() * 4)];
      village.push({ name: small, x, y: Y, z, s: 2 + rnd() * 1.5, ry: rnd() * 6.28 });
      continue;
    }
    const name = big[Math.floor(rnd() * (r > 28 ? big.length : 7))];
    fantasy.push({ name, x, y: Y, z, s: name.startsWith('mountain') ? 2.4 : name.startsWith('hills') ? 1.7 : 1 + rnd() * 0.6, ry: rnd() * 6.28, tint: tree });
  }
  // Рощи: густые кучки деревьев, тёмные в середине, с подлеском по краю.
  const groves = lite ? 9 : 16;
  for (let g = 0; g < groves; g++) {
    const a = rnd() * Math.PI * 2;
    const r = 20 + rnd() * 14;
    const gx = Math.cos(a) * r;
    const gz = Math.sin(a) * r;
    const cnt = (lite ? 4 : 7) + Math.floor(rnd() * 5);
    for (let k = 0; k < cnt; k++) {
      const d = Math.sqrt(rnd()) * 3.6;
      const b = rnd() * 6.28;
      const x = gx + Math.cos(b) * d;
      const z = gz + Math.sin(b) * d;
      if (!free(x, z)) continue;
      const edge = d > 2.6;
      if (edge && rnd() < 0.5) village.push({ name: 'bush', x, y: Y, z, s: 2 + rnd(), ry: rnd() * 6.28 });
      else fantasy.push({ name: ['trees_A_large', 'trees_B_large', 'tree_single_A', 'tree_single_B'][Math.floor(rnd() * 4)], x, y: Y, z, s: 1.15 + rnd() * 0.5, ry: rnd() * 6.28, tint: tree ?? (rnd() < 0.3 ? 'mul:.85,.95,.85' : undefined) });
    }
  }
  // Горы у горизонта: кольцом за лесом, тонут в дымке.
  const peaks = lite ? 14 : 26;
  for (let k = 0; k < peaks; k++) {
    const a = (k / peaks) * Math.PI * 2 + rnd() * 0.2;
    const r = 41 + rnd() * 9;
    const name = ['mountain_A', 'mountain_C_grass', 'mountain_B_grass_trees', 'mountain_A'][Math.floor(rnd() * 4)];
    fantasy.push({ name, x: Math.cos(a) * r, y: Y - 0.3, z: Math.sin(a) * r, s: 3.6 + rnd() * 2.2, ry: rnd() * 6.28, tint: theme === 'winter' ? 'mul:1.3,1.36,1.5' : undefined });
  }
  // Темы: зимой — сугробы и снеговики у подножия, на Хэллоуин — тыквы-фонари и надгробия.
  if (theme !== 'classic') {
    let s2 = 31;
    const r2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < (lite ? 18 : 36); k++) {
      const a = r2() * Math.PI * 2;
      const r = 17 + r2() * 9;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!free(x, z)) continue;
      const y = Y;
      if (theme === 'winter') {
        const w = 0.8 + r2() * 1.2;
        prim.push({ k: 'ball', x, y: y + 0.05, z, sx: w * 1.6, sy: w * 0.5, sz: w, c: '#f3f7fc', ry: r2() * 3 });
      } else if (k % 3) {
        const s = 0.6 + r2() * 0.4;
        prim.push({ k: 'ball', x, y: y + 0.2 * s, z, sx: 0.55 * s, sy: 0.42 * s, sz: 0.55 * s, c: '#f08a24' });
        prim.push({ k: 'box', x: x + 0.2 * s, y: y + 0.24 * s, z: z + 0.2 * s, sx: 0.2 * s, sy: 0.06 * s, sz: 0.04, c: '#ffd36b', ry: Math.PI / 4, glow: true });
      } else {
        const ry = r2() * 0.6 - 0.3;
        prim.push({ k: 'box', x, y: y + 0.4, z, sx: 0.5, sy: 0.8, sz: 0.14, c: '#8b8f96', ry: Math.PI / 4 + ry, rz: (r2() - 0.5) * 0.2 });
        prim.push({ k: 'cyl', x, y: y + 0.8, z, sx: 0.5, sy: 0.14, sz: 0.5, c: '#8b8f96', rx: Math.PI / 2, ry: Math.PI / 4 + ry });
      }
    }
  }
  if (!lite) for (let k = 0; k < 14; k++) village.push({ name: k % 2 ? 'hills_C_trees' : 'hill_single_C', x: (k % 2 ? 1 : -1) * (24 + rnd() * 10), y: Y, z: 14 + rnd() * 18, s: 1.6 + rnd(), ry: rnd() * 6.28 });
  // Мост, мельница, ветряк, повозка у дороги.
  fantasy.push({ name: 'building_bridge_A', x: BRIDGE.x, y: Y, z: BRIDGE.z, s: 2.3, ry: Math.PI / 2 });
  fantasy.push({ name: 'building_watermill_blue', x: MILL.x, y: Y, z: MILL.z, s: 2.2, ry: Math.PI });
  fantasy.push({ name: 'hill_single_A', x: WINDMILL.x, y: Y - 0.2, z: WINDMILL.z, s: 2.6, ry: 0.4 });
  fantasy.push({ name: 'building_windmill_yellow', x: WINDMILL.x, y: Y + 0.75, z: WINDMILL.z, s: 1.9, ry: -0.6 });
  fantasy.push({ name: 'wheelbarrow', x: ROAD[3][0] + 1.3, y: Y, z: ROAD[3][1], s: 1.6, ry: 0.8 });
  fantasy.push({ name: 'sack', x: MILL.x + 1.6, y: Y, z: MILL.z + 0.8, s: 1.8, ry: 0.3 });
  village.push({ name: 'crate_A_small', x: MILL.x + 1.9, y: Y, z: MILL.z - 0.2, s: 2, ry: 0.5 });
  // Кувшинки и камыш у воды.
  for (let k = 0; k < (lite ? 6 : 14); k++) {
    const a = rnd() * 6.28;
    const rr = LAKE.r * (0.3 + 0.55 * rnd());
    fantasy.push({ name: 'waterlily_A', x: LAKE.x + Math.cos(a) * rr, y: Y + 0.07, z: LAKE.z + Math.sin(a) * rr, s: 3 + rnd() * 2, ry: rnd() * 6.28 });
    const b = rnd() * 6.28;
    village.push({ name: 'waterplant_B', x: LAKE.x + Math.cos(b) * (LAKE.r + 0.2), y: Y, z: LAKE.z + Math.sin(b) * (LAKE.r + 0.2), s: 3 + rnd() * 2, ry: rnd() * 6.28 });
  }
  return { fantasy, village, prim };
}

/** Низина: трава пятнами (светлые поляны, тёмные места под лесом), без единого шва. */
function lowlandGeometry(enemy: boolean, theme: ThemeId = 'classic'): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(240, 240, 120, 120);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col: number[] = [];
  const [b0, l0, d0] = palOf(enemy, theme).low;
  const base = new THREE.Color(b0);
  const light = new THREE.Color(l0);
  const dark = new THREE.Color(d0);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const n = noise(x / 7 + 40, z / 7 + 40) * 0.7 + noise(x / 2.5, z / 2.5) * 0.3;
    c.copy(base);
    if (n > 0.55) c.lerp(light, Math.min(1, (n - 0.55) * 3));
    else if (n < 0.42) c.lerp(dark, Math.min(1, (0.42 - n) * 3));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Блики на воде: тонкие светлые полосы плывут по течению.
const SHIMMER_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const SHIMMER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uRiver;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    float a;
    if (uRiver > 0.5) {
      float s = sin(vUv.y * 1.7 - uTime * 2.2 + sin(vUv.x * 9.0 + vUv.y * 0.3) * 1.4);
      a = smoothstep(0.86, 1.0, s) * (1.0 - abs(vUv.x - 0.5) * 1.6);
    } else {
      float s = sin(vW.x * 1.3 + uTime * 0.8 + sin(vW.z * 1.1 - uTime * 0.6) * 1.5) * sin(vW.z * 1.6 - uTime * 0.5);
      a = smoothstep(0.8, 1.0, s);
    }
    gl_FragColor = vec4(1.0, 1.0, 1.0, a * 0.45);
  }
`;
function shimmerMaterial(river: boolean) {
  return new THREE.ShaderMaterial({ vertexShader: SHIMMER_VERT, fragmentShader: SHIMMER_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uRiver: { value: river ? 1 : 0 } } });
}

function lakeGeometry(r: number, y: number) {
  const shape = new THREE.Shape();
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const rr = r * (0.85 + 0.2 * Math.sin(a * 3 + 1) + 0.08 * Math.sin(a * 7));
    const x = Math.cos(a) * rr * 1.25;
    const z = Math.sin(a) * rr;
    if (k === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2);
  g.translate(LAKE.x, y, LAKE.z);
  return g;
}

function Water({ enemy, lite, theme }: { enemy: boolean; lite: boolean; theme: ThemeId }) {
  const geos = useMemo(
    () => ({
      bank: ribbonGeometry(RIVER, 5, LOWLAND_Y + 0.02),
      river: ribbonGeometry(RIVER, 3.4, LOWLAND_Y + 0.05),
      lakeBank: lakeGeometry(LAKE.r * 1.14, LOWLAND_Y + 0.02),
      lake: lakeGeometry(LAKE.r, LOWLAND_Y + 0.05),
    }),
    [],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  const shimmer = useMemo(() => ({ river: shimmerMaterial(true), lake: shimmerMaterial(false) }), []);
  const road = useMemo(() => ribbonGeometry(ROAD, 1.5, LOWLAND_Y + 0.03), []);
  useEffect(() => () => [shimmer.river, shimmer.lake, road].forEach((x) => x.dispose()), [shimmer, road]);
  useFrame((_, dt) => {
    shimmer.river.uniforms.uTime.value += Math.min(dt, 0.1);
    shimmer.lake.uniforms.uTime.value += Math.min(dt, 0.1);
  });
  const pal = palOf(enemy, theme);
  const sand = pal.sand;
  const water = pal.water;
  return (
    <>
      <mesh geometry={geos.bank} receiveShadow>
        <meshStandardMaterial color={sand} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geos.lakeBank} receiveShadow>
        <meshStandardMaterial color={sand} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geos.river}>
        <meshStandardMaterial color={water} roughness={0.25} metalness={0.1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geos.lake}>
        <meshStandardMaterial color={water} roughness={0.25} metalness={0.1} side={THREE.DoubleSide} />
      </mesh>
      {!lite && <mesh geometry={geos.river} material={shimmer.river} position={[0, 0.02, 0]} renderOrder={1} />}
      {!lite && <mesh geometry={geos.lake} material={shimmer.lake} position={[0, 0.02, 0]} renderOrder={1} />}
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial color={pal.road} roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

export interface GroundProps {
  buildings: ViewBld[];
  enemy: boolean;
  lite: boolean;
  grid?: boolean;
  ghost?: { t: ViewBld['t']; x: number; y: number; ok: boolean; id?: number } | null;
  // Украшения: из них земле нужны дорожки.
  paths?: Decor[];
  theme?: ThemeId;
}

export function Ground({ buildings, enemy, lite, grid, ghost, paths, theme = 'classic' }: GroundProps) {
  // Плитки пересчитываем, только когда меняется расстановка (а не уровень или таймер).
  const layout = buildings.map((b) => `${b.t}${b.x},${b.y}`).join(';') + '|' + (paths ?? []).filter((d) => d.k === 'path').map((d) => `${d.x},${d.y}`).join(';');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kinds = useMemo(() => tileKinds(buildings, paths), [layout]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => [...blocks(kinds, enemy, theme), ...pads(buildings)], [kinds, enemy, theme]);
  const tiles = useBoxMesh(list, !lite);
  const small = useMemo(() => bits(kinds, lite, enemy, theme), [kinds, lite, enemy, theme]);
  const far = useMemo(() => lowland(lite, enemy ? 'classic' : theme), [lite, enemy, theme]);
  const plain = useMemo(() => lowlandGeometry(enemy, theme), [enemy, theme]);
  useEffect(() => () => plain.dispose(), [plain]);
  return (
    <>
      <mesh geometry={plain} position={[0, LOWLAND_Y, 0]} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <primitive object={tiles} />
      <BitMesh list={small.tufts} geo={tuftGeo} flat />
      <BitMesh list={small.flowers} geo={flowerGeo} />
      <BitMesh list={small.pebbles} geo={pebbleGeo} flat />
      <Water enemy={enemy} lite={lite} theme={theme} />
      <Instanced lib="fantasy" items={far.fantasy} shadows={!lite} />
      {far.prim.length > 0 && <PrimInstances list={far.prim} shadows={false} />}
      <Instanced lib="village" items={far.village} shadows={false} />
      {grid && <GridLines />}
      {ghost && <Footprint ghost={ghost} buildings={buildings} />}
    </>
  );
}

/** Сколько всего экземпляров рисует земля: для замеров. */
export function groundStats(buildings: ViewBld[], lite: boolean) {
  const kinds = tileKinds(buildings);
  const b = bits(kinds, lite, false);
  const far = lowland(lite);
  return { blocks: blocks(kinds, false).length, tufts: b.tufts.length, flowers: b.flowers.length, pebbles: b.pebbles.length, lowland: far.fantasy.length + far.village.length };
}
