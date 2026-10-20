import { useMemo } from 'react';
import * as THREE from 'three';
import { Instanced, Placed } from '../three/Instanced';
import { ribbonGeometry } from '../three/Prop';
import { LOOK } from './look';
import { getSettings } from '../settings';
import { WorldLayout } from './worldgen';

// Местность мира: вода, плитки, декор и дорога. На карте рисуется целиком, в миссии — кусок
// вокруг места действия (окно), с расчищенной площадкой под сцену.

export interface Window {
  x: number;
  z: number;
  // Сколько захватить вперёд (по −z) и назад, и в стороны.
  ahead: number;
  behind: number;
  side: number;
  // Радиус расчищенной площадки: декор там не ставим.
  clear?: number;
}

const inside = (w: Window | undefined, p: Placed, clear = false) => {
  if (!w) return true;
  const dz = w.z - p.z;
  if (dz > w.ahead || -dz > w.behind || Math.abs(p.x - w.x) > w.side) return false;
  return !(clear && w.clear && Math.hypot(p.x - w.x, p.z - w.z) < w.clear && !/cloud/.test(p.name));
};

// Экономный режим: без облаков и вдвое меньше мелкого декора (деревья, кусты, камни); дома и ориентиры на месте.
const KEEP = /building|castle|market|tent|bridge|lander|landingpad|cargodepot|basemodule|watertower|streetlight|lights|tower|statue/;
export const thinDecor = (items: Placed[]): Placed[] => items.filter((p, i) => !/cloud/.test(p.name) && (KEEP.test(p.name) || i % 2 === 0));

export function Scenery({ layout, window: win }: { layout: WorldLayout; window?: Window }) {
  const look = LOOK[layout.world];
  const tiles = useMemo(() => layout.tiles.filter((t) => inside(win, t)), [layout, win]);
  // Сцена пересоздаётся при смене режима (Canvas3D), поэтому настройку читаем один раз.
  const lite = getSettings().lowPower;
  const props = useMemo(() => {
    const list = layout.props.filter((p) => inside(win, p, true));
    return lite ? thinDecor(list) : list;
  }, [layout, win, lite]);
  const extras = useMemo(() => layout.extras.filter((p) => inside(win, p, true)), [layout, win]);
  const space = layout.lib === 'space';
  const city = layout.lib === 'city';
  const road = useMemo(() => {
    const pts = win ? layout.path.filter(([x, z]) => win.z - z < win.ahead + 2 && z - win.z < win.behind + 2 && Math.abs(x - win.x) < win.side + 4) : layout.path;
    return {
      main: ribbonGeometry(pts, city ? 2 : 1.25, layout.lib === 'fantasy' ? 0.015 : 0.11),
      line: city ? ribbonGeometry(pts, 0.08, 0.12) : null,
      edges: space ? [-1, 1].map((s) => ribbonGeometry(pts.map(([x, z]) => [x + s * 0.62, z] as [number, number]), 0.07, 0.125)) : [],
    };
  }, [layout, win, city, space]);

  return (
    <>
      {layout.water && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[win?.x ?? 0, -0.22, win ? win.z : -layout.length / 2]} receiveShadow>
          <planeGeometry args={[400, (win ? win.ahead + win.behind : layout.length) + 200]} />
          <meshStandardMaterial color={layout.water} roughness={0.15} metalness={0.2} />
        </mesh>
      )}
      <Instanced lib={layout.lib} items={tiles} shadows={false} />
      <Instanced lib={layout.lib} items={props} />
      <Instanced lib="fantasy" items={extras} />
      <mesh geometry={road.main} receiveShadow>
        <meshStandardMaterial color={look.road} roughness={0.95} metalness={space ? 0.6 : 0} side={THREE.DoubleSide} />
      </mesh>
      {road.line && (
        <mesh geometry={road.line}>
          <meshBasicMaterial color="#e8c547" side={THREE.DoubleSide} />
        </mesh>
      )}
      {road.edges.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial color="#5ff3ff" side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}
