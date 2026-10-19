import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { LibName, useLib } from './kit';

// Тысячи одинаковых предметов (гексы, деревья, дома) рисуем инстансами: один вызов отрисовки на меш.

export interface Placed {
  name: string;
  x: number;
  y?: number;
  z: number;
  ry?: number;
  s?: number;
  // Оттенок, умножается на текстуру: снег, песок, пепел. Цвет или множители 'mul:r,g,b' (можно больше 1).
  tint?: string;
}

export function Instanced({ lib, items, shadows = true }: { lib: LibName; items: Placed[]; shadows?: boolean }) {
  const parts = useLib(lib);

  const meshes = useMemo(() => {
    const byName = new Map<string, Placed[]>();
    for (const it of items) {
      if (!parts.has(it.name)) continue;
      const list = byName.get(it.name) ?? [];
      list.push(it);
      byName.set(it.name, list);
    }
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    for (const [name, list] of byName) {
      for (const part of parts.get(name)!.meshes) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach((it, i) => {
          q.setFromAxisAngle(up, it.ry ?? 0);
          const s = it.s ?? 1;
          m.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), q, new THREE.Vector3(s, s, s)).multiply(part.matrix);
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, parseTint(it.tint, color));
        });
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        out.push(mesh);
      }
    }
    return out;
  }, [parts, items, shadows]);

  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);

  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}

export function parseTint(tint: string | undefined, out = new THREE.Color()): THREE.Color {
  if (!tint) return out.setRGB(1, 1, 1);
  if (tint.startsWith('mul:')) {
    const [r, g, b] = tint.slice(4).split(',').map(Number);
    return out.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  }
  return out.set(tint);
}
