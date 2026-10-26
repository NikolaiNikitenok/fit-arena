import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Instanced, type Placed } from '../three/Instanced';
import type { Ctl } from './Village3D';

// Живая округа своей деревни: вдали в небе висят острова соседей со своими домиками, вокруг
// плывут облака, над деревней иногда пролетает дракон, а второй кружит далеко у островов.
// Видно, если отдалить камеру; дракон пролетает и над самой деревней.

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ── Острова соседей ─────────────────────────────────────────────────────────────────────────────

interface Island {
  x: number;
  y: number;
  z: number;
  r: number;
  flag: string;
  kit: Placed[];
}

// Камера смотрит с юго-востока: дальняя сторона — к -x, -z. Острова — по дальней дуге.
const ISLANDS: Island[] = [
  { x: -30, y: 8, z: -24, r: 3.4, flag: '#e05252', kit: [{ name: 'building_castle_red', x: 0, z: -0.4, s: 0.55 }, { name: 'building_home_A_red', x: 1.7, z: 1, s: 0.5, ry: 0.6 }, { name: 'tree_single_A', x: -1.8, z: 1.2, s: 0.7 }, { name: 'tree_single_B', x: -0.9, z: 2, s: 0.6 }] },
  { x: -10, y: 10, z: -38, r: 2.8, flag: '#4f8fe8', kit: [{ name: 'building_tower_A_blue', x: -0.5, z: 0, s: 0.55 }, { name: 'building_home_B_blue', x: 1.2, z: 0.8, s: 0.5, ry: -0.4 }, { name: 'tree_single_A', x: 0.2, z: -1.6, s: 0.7 }] },
  { x: -40, y: 11, z: -4, r: 2.6, flag: '#5cc46b', kit: [{ name: 'building_market_green', x: 0, z: 0, s: 0.55, ry: 1.2 }, { name: 'tree_single_B', x: 1.4, z: -1, s: 0.65 }, { name: 'tree_single_A', x: -1.3, z: 0.9, s: 0.7 }] },
  { x: 8, y: 12, z: -44, r: 2.2, flag: '#f2b43c', kit: [{ name: 'building_windmill_yellow', x: 0, z: 0, s: 0.5 }, { name: 'tree_single_A', x: 1.1, z: 0.8, s: 0.6 }] },
  { x: -46, y: 9.5, z: 14, r: 2.4, flag: '#b77be8', kit: [{ name: 'building_church_blue', x: 0, z: 0, s: 0.5, ry: 0.4 }, { name: 'tree_single_B', x: -1.2, z: -0.8, s: 0.6 }] },
];

const rockMat = new THREE.MeshStandardMaterial({ color: '#8c7663', flatShading: true, roughness: 0.95 });
const dirtMat = new THREE.MeshStandardMaterial({ color: '#6e543f', flatShading: true, roughness: 1 });
const grassMat = new THREE.MeshStandardMaterial({ color: '#72b545', flatShading: true, roughness: 0.9 });
const poleMat = new THREE.MeshStandardMaterial({ color: '#5a3b22' });

function IslandMesh({ it, k }: { it: Island; k: number }) {
  const g = useRef<THREE.Group>(null);
  const rock = useMemo(() => {
    // Каменный «корень» острова: неровный перевёрнутый конус.
    const geo = new THREE.ConeGeometry(it.r, it.r * 2.1, 8, 3).rotateX(Math.PI);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > it.r * 1.04) continue;
      const n = hash(i * 7.3 + k * 11);
      p.setX(i, p.getX(i) * (0.85 + n * 0.3));
      p.setZ(i, p.getZ(i) * (0.85 + hash(i * 3.1 + k) * 0.3));
    }
    geo.translate(0, -it.r * 1.05, 0);
    geo.computeVertexNormals();
    return geo;
  }, [it, k]);
  useEffect(() => () => rock.dispose(), [rock]);
  const flagRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) g.current.position.y = it.y + Math.sin(t * 0.5 + k * 1.7) * 0.35;
    if (flagRef.current) flagRef.current.scale.x = 0.8 + 0.2 * Math.sin(t * 4 + k);
  });
  return (
    <group ref={g} position={[it.x, it.y, it.z]} scale={1.7}>
      <mesh geometry={rock} material={rockMat} />
      <mesh material={dirtMat} position={[0, -0.12, 0]}>
        <cylinderGeometry args={[it.r * 1.02, it.r * 0.98, 0.35, 8]} />
      </mesh>
      <mesh material={grassMat} position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[it.r * 1.06, it.r * 1.04, 0.2, 8]} />
      </mesh>
      <Instanced lib="fantasy" items={it.kit.map((p) => ({ ...p, y: 0.2 }))} shadows={false} />
      {/* Флаг соседа — свой цвет у каждого острова. */}
      <mesh material={poleMat} position={[it.r * 0.7, 1.1, -it.r * 0.3]}>
        <cylinderGeometry args={[0.04, 0.05, 2, 5]} />
      </mesh>
      <mesh ref={flagRef} position={[it.r * 0.7 + 0.32, 1.85, -it.r * 0.3]}>
        <boxGeometry args={[0.62, 0.38, 0.03]} />
        <meshStandardMaterial color={it.flag} />
      </mesh>
    </group>
  );
}

// ── Облака ──────────────────────────────────────────────────────────────────────────────────────

const PUFFS = 6;
interface Cloud {
  a: number;
  r: number;
  y: number;
  s: number;
  w: number;
}
const CLOUDS: Cloud[] = Array.from({ length: 11 }, (_, k) => ({ a: k * 0.571 + hash(k) * 0.4, r: 26 + hash(k + 3) * 18, y: 7.5 + hash(k + 9) * 4.5, s: 1.3 + hash(k + 5) * 1.1, w: 0.008 + hash(k + 1) * 0.01 }));

function Clouds() {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#c9d6f0', emissiveIntensity: 0.35, flatShading: true, roughness: 1 }), CLOUDS.length * PUFFS);
    m.frustumCulled = false;
    return m;
  }, []);
  useEffect(() => () => mesh.dispose(), [mesh]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    CLOUDS.forEach((c, j) => {
      const a = c.a + t * c.w;
      const cx = Math.cos(a) * c.r;
      const cz = Math.sin(a) * c.r;
      for (let i = 0; i < PUFFS; i++) {
        // Пухлое облако: середина крупнее, края мельче и ниже.
        const off = (i - (PUFFS - 1) / 2) * 0.9 * c.s;
        const big = (1 - Math.abs(i - (PUFFS - 1) / 2) / PUFFS) * c.s * (0.9 + 0.2 * hash(j * 10 + i));
        const dx = -Math.sin(a) * off;
        const dz = Math.cos(a) * off;
        m4.makeScale(big, big * 0.72, big).setPosition(cx + dx, c.y + big * 0.2 + (i % 2) * 0.25 * c.s, cz + dz);
        mesh.setMatrixAt(j * PUFFS + i, m4);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

// ── Драконы ─────────────────────────────────────────────────────────────────────────────────────

function wingGeometry(): THREE.BufferGeometry {
  // Перепончатое крыло: от плеча к трём «пальцам», между ними выемки.
  const pts = [
    [0, 0, 0.35],
    [0, 0, -0.35],
    [2.1, 0.25, -0.2],
    [1.6, 0.1, -0.55],
    [1.2, 0.05, -0.75],
    [0.6, 0, -0.85],
  ];
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  tri(pts[0], pts[1], pts[2]);
  tri(pts[1], pts[3], pts[2]);
  tri(pts[1], pts[4], pts[3]);
  tri(pts[1], pts[5], pts[4]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function Dragon({ color, belly, wing, path, scale = 1 }: { color: string; belly: string; wing: string; scale?: number; path: (t: number, out: THREE.Vector3) => boolean }) {
  const g = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const wg = useMemo(() => wingGeometry(), []);
  useEffect(() => () => wg.dispose(), [wg]);
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 }),
      belly: new THREE.MeshStandardMaterial({ color: belly, flatShading: true }),
      wing: new THREE.MeshStandardMaterial({ color: wing, side: THREE.DoubleSide, flatShading: true }),
      horn: new THREE.MeshStandardMaterial({ color: '#f3e3c2' }),
      eye: new THREE.MeshBasicMaterial({ color: '#ffe55c' }),
    }),
    [color, belly, wing],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const p = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!g.current) return;
    const vis = path(t, p);
    g.current.visible = vis;
    if (!vis) return;
    path(t + 0.15, ahead);
    g.current.position.copy(p);
    g.current.lookAt(ahead);
    // Крен в повороте и взмахи крыльев: вниз быстро, вверх медленнее.
    const ph = t * 5.2;
    const flap = Math.sin(ph) * 0.75 + 0.15;
    if (left.current) left.current.rotation.z = flap;
    if (right.current) right.current.rotation.z = -flap;
    g.current.position.y += Math.sin(ph) * -0.12;
    if (tail.current) tail.current.rotation.y = Math.sin(t * 2.4) * 0.35;
  });
  return (
    <group ref={g} scale={scale}>
      {/* Тело смотрит вдоль +z. */}
      <mesh material={mats.body} scale={[0.5, 0.45, 1.25]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      <mesh material={mats.belly} scale={[0.36, 0.3, 1]} position={[0, -0.2, 0.05]}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      {/* Шея и голова */}
      <mesh material={mats.body} position={[0, 0.3, 1.25]} rotation={[0.7, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.8, 6]} />
      </mesh>
      <group position={[0, 0.55, 1.7]}>
        <mesh material={mats.body} scale={[0.32, 0.3, 0.42]} castShadow>
          <icosahedronGeometry args={[1, 0]} />
        </mesh>
        <mesh material={mats.body} position={[0, -0.06, 0.4]} scale={[0.2, 0.15, 0.3]}>
          <boxGeometry />
        </mesh>
        <mesh material={mats.horn} position={[0.14, 0.25, -0.15]} rotation={[-0.8, 0, 0.2]}>
          <coneGeometry args={[0.06, 0.32, 5]} />
        </mesh>
        <mesh material={mats.horn} position={[-0.14, 0.25, -0.15]} rotation={[-0.8, 0, -0.2]}>
          <coneGeometry args={[0.06, 0.32, 5]} />
        </mesh>
        <mesh material={mats.eye} position={[0.2, 0.08, 0.18]}>
          <sphereGeometry args={[0.05, 6, 4]} />
        </mesh>
        <mesh material={mats.eye} position={[-0.2, 0.08, 0.18]}>
          <sphereGeometry args={[0.05, 6, 4]} />
        </mesh>
      </group>
      {/* Хвост с шипом-наконечником */}
      <group ref={tail} position={[0, 0, -1.1]}>
        <mesh material={mats.body} position={[0, 0, -0.85]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.24, 1.8, 6]} />
        </mesh>
        <mesh material={mats.wing} position={[0, 0, -1.8]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.25]}>
          <coneGeometry args={[0.22, 0.4, 4]} />
        </mesh>
      </group>
      {/* Крылья: вращаются у плеча */}
      <group ref={left} position={[0.3, 0.25, 0.25]}>
        <mesh geometry={wg} material={mats.wing} castShadow />
      </group>
      <group ref={right} position={[-0.3, 0.25, 0.25]} scale={[-1, 1, 1]}>
        <mesh geometry={wg} material={mats.wing} castShadow />
      </group>
    </group>
  );
}

export function Skyline({ ctl, lite }: { ctl: React.MutableRefObject<Ctl>; lite: boolean }) {
  // Первый дракон раз в 40 секунд пролетает над тем местом, куда смотрит камера; каждый раз
  // с другой стороны. Второй всё время кружит далеко, между островами.
  const pass = useMemo(() => {
    const from = new THREE.Vector3();
    return (t: number, out: THREE.Vector3) => {
      const PERIOD = 40;
      const FLY = 9;
      const n = Math.floor((t + 30) / PERIOD);
      const k = ((t + 30) % PERIOD) / FLY;
      if (k > 1) return false;
      const a = hash(n) * Math.PI * 2;
      const side = (hash(n + 7) - 0.5) * 10;
      const c = ctl.current;
      from.set(c.tx + Math.cos(a) * -34 - Math.sin(a) * side, 11 + hash(n + 2) * 2, c.tz + Math.sin(a) * -34 + Math.cos(a) * side);
      out.set(from.x + Math.cos(a) * 68 * k, from.y + Math.sin(k * Math.PI) * 1.5, from.z + Math.sin(a) * 68 * k);
      return true;
    };
  }, [ctl]);
  const circle = (t: number, out: THREE.Vector3) => {
    const a = -t * 0.09;
    out.set(-18 + Math.cos(a) * 30, 15 + Math.sin(t * 0.4) * 1.2, -18 + Math.sin(a) * 30);
    return true;
  };
  return (
    <>
      {ISLANDS.map((it, k) => (
        <IslandMesh key={k} it={it} k={k} />
      ))}
      <Clouds />
      <Dragon color="#c8402f" belly="#f2c46a" wing="#8e2a26" path={pass} scale={1.1} />
      {!lite && <Dragon color="#3f9a5a" belly="#d7e88a" wing="#2a6b4a" path={circle} scale={0.9} />}
    </>
  );
}
