import { useMemo } from 'react';
import * as THREE from 'three';
import { LibName, useLib } from './kit';

/** Один предмет библиотеки, который можно нажать или двигать (сундук, ворота). */
export function Prop({ lib, name, position, rotation = 0, scale = 1, onClick }: { lib: LibName; name: string; position: [number, number, number]; rotation?: number; scale?: number; onClick?: () => void }) {
  const parts = useLib(lib);
  const meshes = useMemo(() => parts.get(name)?.meshes ?? [], [parts, name]);
  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      scale={scale}
      onClick={
        onClick &&
        ((e) => {
          e.stopPropagation();
          onClick();
        })
      }
    >
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geometry} material={m.material} matrixAutoUpdate={false} matrix={m.matrix} castShadow receiveShadow />
      ))}
    </group>
  );
}

/** Полоса дороги по точкам оси. */
export function ribbonGeometry(points: [number, number][], width: number, y = 0.02): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let along = 0;
  points.forEach(([x, z], i) => {
    const [nx, nz] = points[Math.min(points.length - 1, i + 1)];
    const [bx, bz] = points[Math.max(0, i - 1)];
    const dx = nx - bx;
    const dz = nz - bz;
    const len = Math.hypot(dx, dz) || 1;
    // Ширина чуть «дышит», чтобы тропа выглядела протоптанной.
    const w = width * (1 + 0.12 * Math.sin(i * 0.7));
    const ox = (-dz / len) * (w / 2);
    const oz = (dx / len) * (w / 2);
    if (i > 0) along += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
    pos.push(x + ox, y, z + oz, x - ox, y, z - oz);
    uv.push(0, along, 1, along);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
