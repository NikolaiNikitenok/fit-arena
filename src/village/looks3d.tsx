import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { LibName, Part } from '../three/kit';
import { parseTint } from '../three/Instanced';
import type { Look, Prim, PrimKind } from './looks';

// Простые детали построек (цоколи, кайма, шпили, трубы): по одному InstancedMesh на форму.

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

/** Все простые детали сцены: три вызова отрисовки на всю деревню. */
export function PrimInstances({ list, shadows = true }: { list: Prim[]; shadows?: boolean }) {
  const meshes = useMemo(() => {
    const out: THREE.InstancedMesh[] = [];
    const mat = new THREE.Matrix4();
    const col = new THREE.Color();
    for (const k of ['box', 'cyl', 'cone'] as PrimKind[]) {
      const items = list.filter((p) => p.k === k);
      if (!items.length) continue;
      const m = new THREE.InstancedMesh(primGeo(k), new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 }), items.length);
      items.forEach((p, i) => {
        m.setMatrixAt(i, mat.makeScale(p.sx, p.sy, p.sz).setPosition(p.x, p.y, p.z));
        m.setColorAt(i, col.set(p.c));
      });
      m.castShadow = shadows;
      m.receiveShadow = true;
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

const primMats = new Map<string, THREE.Material>();
const primMat = (c: string) => {
  let m = primMats.get(c);
  if (!m) primMats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05 })));
  return m;
};
const tintMats = new Map<string, THREE.Material>();

/** Постройка отдельным объектом (призрак при расстановке, превью): геометрия и материалы общие. */
export function lookGroup(look: Look, libs: Record<LibName, Map<string, Part> | undefined>, opts: { shadows?: boolean } = {}): THREE.Group {
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
    const m = new THREE.Mesh(primGeo(p.k), primMat(p.c));
    m.position.set(p.x, p.y, p.z);
    m.scale.set(p.sx, p.sy, p.sz);
    m.castShadow = !!opts.shadows;
    root.add(m);
  }
  return root;
}
