import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { LibName, Part } from '../three/kit';
import { parseTint } from '../three/Instanced';
import type { Anim, AnimKind, Look, Prim, PrimKind } from './looks';
import { animColor, animMatrix, animRes, ANIMS } from './anim3d';

// Простые детали построек (цоколи, кайма, шпили, трубы): по одному InstancedMesh на форму;
// светящиеся (окна, фонари) — отдельно, без освещения. Движущиеся детали и мягкие тени — тоже инстансами.

const GEO: Record<PrimKind, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: () => new THREE.ConeGeometry(0.5, 1, 8),
};
const shared = new Map<PrimKind, THREE.BufferGeometry>();
export const primGeo = (k: PrimKind) => {
  let g = shared.get(k);
  if (!g) shared.set(k, (g = GEO[k]()));
  return g;
};

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const sv = new THREE.Vector3();
/** Матрица простой детали: сдвиг, повороты, растяжение. */
export function primMatrix(p: Prim, m: THREE.Matrix4): THREE.Matrix4 {
  if (!p.rx && !p.ry && !p.rz) return m.makeScale(p.sx, p.sy, p.sz).setPosition(p.x, p.y, p.z);
  return m.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)), sv.set(p.sx, p.sy, p.sz));
}
const glowMaterial = () => new THREE.MeshBasicMaterial({ toneMapped: false });

/** Все простые детали сцены: три вызова отрисовки на всю деревню и ещё один-два на огоньки. */
export function PrimInstances({ list, shadows = true }: { list: Prim[]; shadows?: boolean }) {
  const meshes = useMemo(() => {
    const out: THREE.InstancedMesh[] = [];
    const mat = new THREE.Matrix4();
    const col = new THREE.Color();
    for (const glow of [false, true])
    for (const k of ['box', 'cyl', 'cone'] as PrimKind[]) {
      const items = list.filter((p) => p.k === k && !!p.glow === glow);
      if (!items.length) continue;
      const m = new THREE.InstancedMesh(primGeo(k), glow ? glowMaterial() : new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 }), items.length);
      items.forEach((p, i) => {
        m.setMatrixAt(i, primMatrix(p, mat));
        m.setColorAt(i, col.set(p.c));
      });
      m.castShadow = shadows && !glow;
      m.receiveShadow = !glow;
      m.computeBoundingSphere();
      out.push(m);
    }
    return out;
  }, [list, shadows]);
  useEffect(
    () => () =>
      meshes.forEach((m) => {
        (m.material as THREE.Material).dispose();
        m.dispose();
      }),
    [meshes],
  );
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}

/** Движущиеся детали всей сцены: по InstancedMesh на вид, позы — каждый кадр от времени. */
export function AnimInstances({ list, lite = false }: { list: (Anim & { ox: number; oz: number })[]; lite?: boolean }) {
  const meshes = useMemo(() => {
    const out: { m: THREE.InstancedMesh; items: (Anim & { ox: number; oz: number })[]; n: number }[] = [];
    const col = new THREE.Color();
    for (const k of Object.keys(ANIMS) as AnimKind[]) {
      if (lite && ANIMS[k].rich) continue;
      const items = list.filter((a) => a.k === k);
      if (!items.length) continue;
      const n = ANIMS[k].n;
      const { geo, mat } = animRes(k);
      const m = new THREE.InstancedMesh(geo, mat, items.length * n);
      items.forEach((a, j) => {
        for (let i = 0; i < n; i++) m.setColorAt(j * n + i, col.set(animColor(a, i)));
      });
      // Позы меняются каждый кадр: границы не пересчитываем, рисуем всегда.
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = k !== 'spark';
      if (k === 'smoke') m.renderOrder = 2;
      out.push({ m, items, n });
    }
    return out;
  }, [list, lite]);
  useEffect(() => () => meshes.forEach(({ m }) => m.dispose()), [meshes]);
  const tmp = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const t = performance.now() / 1000;
    for (const { m, items, n } of meshes) {
      items.forEach((a, j) => {
        for (let i = 0; i < n; i++) m.setMatrixAt(j * n + i, animMatrix(a, i, t, tmp, a.ox, a.oz));
      });
      m.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      {meshes.map(({ m }) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}

// Мягкая круглая тень под постройкой: как будто свет заслонён со всех сторон.
let blobTex: THREE.Texture | null = null;
function blobTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.32)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** Мягкие тени под постройками: один вызов отрисовки на всю деревню. list — [x, z, радиус]. */
export function Blobs({ list }: { list: [number, number, number][] }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: '#1d2a10' }), Math.max(1, list.length));
    const mat = new THREE.Matrix4();
    list.forEach(([x, z, r], i) => m.setMatrixAt(i, mat.makeScale(r * 2, 1, r * 2).setPosition(x, 0.035, z)));
    m.count = list.length;
    m.renderOrder = -1;
    m.computeBoundingSphere();
    return m;
  }, [list]);
  useEffect(() => () => {
    (mesh.material as THREE.Material).dispose();
    mesh.dispose();
  }, [mesh]);
  return <primitive object={mesh} />;
}

const primMats = new Map<string, THREE.Material>();
const primMat = (c: string, glow = false) => {
  const key = glow ? `g${c}` : c;
  let m = primMats.get(key);
  if (!m) primMats.set(key, (m = glow ? new THREE.MeshBasicMaterial({ color: c, toneMapped: false }) : new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05 })));
  return m;
};
const animMats = new Map<string, THREE.Material>();
const animMat = (k: AnimKind, c: string) => {
  const key = `${k}|${c}`;
  let m = animMats.get(key);
  if (!m) {
    m = animRes(k).mat.clone();
    (m as THREE.MeshStandardMaterial).color = new THREE.Color(c);
    animMats.set(key, m);
  }
  return m;
};
const tintMats = new Map<string, THREE.Material>();

/** Постройка отдельным объектом (призрак при расстановке, превью): геометрия и материалы общие. */
export function lookGroup(look: Look, libs: Record<LibName, Map<string, Part> | undefined>, opts: { shadows?: boolean; lite?: boolean } = {}): THREE.Group {
  const root = new THREE.Group();
  for (const k of look.kit) {
    const part = libs[k.lib]?.get(k.name);
    if (!part) continue;
    const holder = new THREE.Group();
    holder.position.set(k.x, k.y, k.z);
    holder.rotation.y = k.ry;
    holder.scale.setScalar(k.s);
    for (const mesh of part.meshes) {
      let material = mesh.material;
      if (k.tint) {
        // Оттенок в превью: копия материала с цветом-множителем.
        const key = `${material.uuid}|${k.tint}`;
        let t = tintMats.get(key);
        if (!t) {
          t = material.clone();
          (t as THREE.MeshStandardMaterial).color = parseTint(k.tint);
          tintMats.set(key, t);
        }
        material = t;
      }
      const m = new THREE.Mesh(mesh.geometry, material);
      m.matrixAutoUpdate = false;
      m.matrix.copy(mesh.matrix);
      m.castShadow = !!opts.shadows;
      holder.add(m);
    }
    root.add(holder);
  }
  for (const p of look.prim) {
    const m = new THREE.Mesh(primGeo(p.k), primMat(p.c, p.glow));
    m.matrixAutoUpdate = false;
    primMatrix(p, m.matrix);
    m.castShadow = !!opts.shadows && !p.glow;
    root.add(m);
  }
  // Движущиеся детали: позы задаёт animateGroup.
  const moving: { mesh: THREE.Mesh; a: Anim; i: number }[] = [];
  for (const a of look.anim) {
    if (opts.lite && ANIMS[a.k].rich) continue;
    for (let i = 0; i < ANIMS[a.k].n; i++) {
      const mesh = new THREE.Mesh(animRes(a.k).geo, animMat(a.k, animColor(a, i)));
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      if (a.k === 'smoke') mesh.renderOrder = 2;
      root.add(mesh);
      moving.push({ mesh, a, i });
    }
  }
  root.userData.moving = moving;
  animateGroup(root, 0);
  return root;
}

/** Позы движущихся деталей постройки из lookGroup в момент t (секунды). */
export function animateGroup(root: THREE.Object3D, t: number): void {
  const moving = root.userData.moving as { mesh: THREE.Mesh; a: Anim; i: number }[] | undefined;
  if (!moving) return;
  for (const { mesh, a, i } of moving) {
    animMatrix(a, i, t, mesh.matrix);
    mesh.matrixWorldNeedsUpdate = true;
  }
}
