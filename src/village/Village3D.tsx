import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Canvas3D } from '../three/Canvas3D';
import { Instanced, Placed } from '../three/Instanced';
import { LibName, useLib } from '../three/kit';
import { getSettings } from '../settings';
import { BuildingType, GRID, ResKey } from '../../shared/village';
import { BattleState, cellOf, Fx, UnitKind } from '../../shared/villageBattle';
import { RES_COLORS } from './icons';

// Деревня в 3D: изометрия ортогональной камерой, постройки KayKit инстансами, стены собираются
// из секций между соседними клетками. Та же сцена показывает бой: отряды — простые фигурки
// (инстансы), выстрелы и взрывы — из пула.

export type BldState = 'ok' | 'new' | 'up' | 'ruin';
export interface ViewBld {
  i: number;
  t: BuildingType;
  x: number;
  y: number;
  l: number;
  state: BldState;
}

/** Бой для показа: состояние, где были отряды на прошлом тике, и когда был тик. */
export interface BattleView {
  s: BattleState;
  prev: Map<number, [number, number]>;
  at: number;
  ms: number;
  fx: (Fx & { born: number })[];
}

export interface Ctl {
  tx: number;
  tz: number;
  zoom: number;
  camera?: THREE.Camera;
}

const W = (c: number) => c - GRID / 2;
// Камера смотрит с юго-востока под 50°.
const PITCH = (50 * Math.PI) / 180;
const OFF = new THREE.Vector3(Math.cos(PITCH) * Math.SQRT1_2, Math.sin(PITCH), Math.cos(PITCH) * Math.SQRT1_2).multiplyScalar(60);
export const SIN_PITCH = Math.sin(PITCH);

interface Part {
  lib: LibName;
  name: string;
  s: number;
  dx?: number;
  dz?: number;
  ry?: number;
}
const p = (lib: LibName, name: string, s: number, dx = 0, dz = 0, ry = 0): Part => ({ lib, name, s, dx, dz, ry });
// Модель каждой постройки: своя (синяя) и у Князя (красная). Где модели нет — собрана из предметов.
const MODELS: Record<Exclude<BuildingType, 'wall'>, { own: Part[]; enemy: Part[] }> = {
  townhall: { own: [p('fantasy', 'building_castle_blue', 1.25)], enemy: [p('fantasy', 'building_castle_red', 1.25)] },
  lumbermill: { own: [p('village', 'building_lumbermill_blue', 1.3)], enemy: [p('fantasy', 'building_lumbermill_green', 1.3)] },
  quarry: {
    own: [p('fantasy', 'resource_stone', 2.6, -0.2, 0.1), p('fantasy', 'rock_single_C', 3.2, 0.45, -0.4), p('fantasy', 'rock_single_A', 3, -0.5, -0.5), p('fantasy', 'wheelbarrow', 1.6, 0.5, 0.5, 0.6)],
    enemy: [p('fantasy', 'resource_stone', 2.6, -0.2, 0.1), p('fantasy', 'rock_single_C', 3.2, 0.45, -0.4), p('fantasy', 'rock_single_A', 3, -0.5, -0.5)],
  },
  goldmine: { own: [p('village', 'building_mine_blue', 1.1)], enemy: [p('fantasy', 'building_mine_yellow', 1.1)] },
  storage: {
    own: [p('fantasy', 'building_grain', 0.95), p('fantasy', 'crates_stacked', 0.38, -0.35, -0.3), p('fantasy', 'barrel', 2.2, 0.45, 0.35), p('fantasy', 'sack', 3, 0.1, 0.55)],
    enemy: [p('fantasy', 'building_grain', 0.95), p('fantasy', 'crates_stacked', 0.38, -0.35, -0.3), p('fantasy', 'barrel', 2.2, 0.45, 0.35)],
  },
  barracks: { own: [p('village', 'building_barracks_blue', 1.3)], enemy: [p('village', 'building_barracks_red', 1.3)] },
  forge: { own: [p('village', 'building_blacksmith_blue', 1.4)], enemy: [p('fantasy', 'building_blacksmith_red', 1.4)] },
  tavern: { own: [p('village', 'building_tavern_blue', 1.5)], enemy: [p('fantasy', 'building_tavern_red', 1.5)] },
  market: { own: [p('village', 'building_market_blue', 1.05)], enemy: [p('fantasy', 'building_market_green', 1.05)] },
  tower: { own: [p('village', 'building_tower_A_blue', 1.5)], enemy: [p('fantasy', 'building_tower_A_red', 1.5)] },
  catapult: { own: [p('village', 'building_tower_catapult_blue', 1.4)], enemy: [p('village', 'building_tower_catapult_red', 1.4)] },
};
const SIZE: Record<BuildingType, number> = { townhall: 3, lumbermill: 2, quarry: 2, goldmine: 2, storage: 2, barracks: 2, forge: 2, tavern: 2, market: 2, tower: 2, catapult: 2, wall: 1 };

function partsOf(b: ViewBld, enemy: boolean): Part[] {
  const s = SIZE[b.t];
  if (b.state === 'ruin') return b.t === 'wall' ? [p('fantasy', 'rock_single_B', 3)] : [p('fantasy', 'building_destroyed', s / 1.6)];
  if (b.state === 'new') return [p('village', 'building_dirt', s / 1.9), p('fantasy', 'building_scaffolding', s / 2.1)];
  if (b.t === 'wall') return [];
  // Ратуша и постройки чуть растут с уровнем.
  const grow = 1 + Math.min(0.12, 0.02 * (b.l - 1));
  return MODELS[b.t][enemy ? 'enemy' : 'own'].map((m) => ({ ...m, s: m.s * grow }));
}

function placed(list: ViewBld[], enemy: boolean): Record<LibName, Placed[]> {
  const out: Record<string, Placed[]> = { fantasy: [], village: [] };
  const walls = new Set(list.filter((b) => b.t === 'wall' && b.state !== 'ruin').map((b) => `${b.x},${b.y}`));
  for (const b of list) {
    const s = SIZE[b.t];
    const cx = W(b.x + s / 2);
    const cz = W(b.y + s / 2);
    if (b.t === 'wall' && b.state !== 'ruin') {
      // Столб в клетке и секции к соседям справа и снизу.
      const tint = b.l >= 5 ? 'mul:0.8,0.85,1' : b.l >= 3 ? undefined : 'mul:1.15,1.05,0.9';
      out.fantasy.push({ name: 'column', x: cx, z: cz, s: 0.55 + 0.03 * b.l, tint });
      if (walls.has(`${b.x + 1},${b.y}`)) out.fantasy.push({ name: 'wall_straight', x: cx + 0.5, z: cz, s: 0.5, tint });
      if (walls.has(`${b.x},${b.y + 1}`)) out.fantasy.push({ name: 'wall_straight', x: cx, z: cz + 0.5, s: 0.5, ry: Math.PI / 2, tint });
      continue;
    }
    for (const m of partsOf(b, enemy)) (out[m.lib] ??= []).push({ name: m.name, x: cx + (m.dx ?? 0) * s * 0.5, z: cz + (m.dz ?? 0) * s * 0.5, s: m.s, ry: m.ry ?? (b.t === 'townhall' ? Math.PI / 6 : 0) });
  }
  return out as Record<LibName, Placed[]>;
}

// Вокруг деревни лес, холмы и горы — в стиле карты мира.
function surroundings(lite: boolean): Placed[] {
  const out: Placed[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const names = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium', 'tree_single_A', 'tree_single_B', 'hills_A_trees', 'hills_B_trees', 'mountain_A_grass_trees', 'rock_single_C'];
  const n = lite ? 90 : 180;
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 17.5 + rnd() * 18;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Квадратное поле боя (±15) оставляем свободным.
    if (Math.abs(x) < 16 && Math.abs(z) < 16) continue;
    const name = names[Math.floor(rnd() * (r > 26 ? names.length - 1 : 6))];
    out.push({ name, x, z, s: name.startsWith('mountain') ? 2.2 : name.startsWith('hills') ? 1.6 : 1 + rnd() * 0.5, ry: rnd() * 6.28 });
  }
  return out;
}

function Rig({ ctl, sun }: { ctl: React.MutableRefObject<Ctl>; sun: React.RefObject<THREE.DirectionalLight | null> }) {
  const { camera, size } = useThree();
  const last = useRef(0);
  useFrame(() => {
    const c = ctl.current;
    if (!c.zoom) c.zoom = Math.max(12, Math.min(size.width, size.height * 0.8) / 19);
    c.camera = camera;
    const cam = camera as THREE.OrthographicCamera;
    camera.position.set(c.tx + OFF.x, OFF.y, c.tz + OFF.z);
    camera.lookAt(c.tx, 0, c.tz);
    if (last.current !== c.zoom) {
      cam.zoom = c.zoom;
      cam.updateProjectionMatrix();
      last.current = c.zoom;
    }
    if (sun.current) {
      sun.current.position.set(c.tx + 12, 22, c.tz + 6);
      sun.current.target.position.set(c.tx, 0, c.tz);
      sun.current.target.updateMatrixWorld();
    }
  });
  return null;
}

// Надпись над постройкой (таймер стройки): своя маленькая текстура, перерисовывается при смене текста.
function Label({ text, x, z, h, color = '#ffffff' }: { text: string; x: number; z: number; h: number; color?: string }) {
  const { tex, canvas } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, canvas };
  }, []);
  useEffect(() => {
    const g = canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 192, 64);
    g.fillStyle = 'rgba(13,15,23,.78)';
    g.beginPath();
    g.roundRect(8, 10, 176, 44, 22);
    g.fill();
    g.font = '900 30px Nunito, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, 96, 33);
    tex.needsUpdate = true;
  }, [text, color, canvas, tex]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <sprite position={[x, h, z]} scale={[3, 1, 1]} renderOrder={5}>
      <spriteMaterial map={tex} depthTest={false} depthWrite={false} />
    </sprite>
  );
}

const bubbleCache = new Map<ResKey, THREE.Texture>();
function bubbleTex(res: ResKey): THREE.Texture {
  let t = bubbleCache.get(res);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(48, 44, 40, 0, Math.PI * 2);
  g.moveTo(36, 80);
  g.lineTo(48, 95);
  g.lineTo(60, 80);
  g.fill();
  g.fillStyle = RES_COLORS[res];
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = 4;
  g.beginPath();
  if (res === 'gold') g.arc(48, 44, 22, 0, Math.PI * 2);
  else if (res === 'wood') g.roundRect(22, 32, 52, 24, 12);
  else {
    g.moveTo(26, 58);
    g.lineTo(34, 34);
    g.lineTo(52, 24);
    g.lineTo(70, 34);
    g.lineTo(72, 58);
    g.closePath();
  }
  g.fill();
  g.stroke();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  bubbleCache.set(res, t);
  return t;
}

function Bubble({ res, x, z, h }: { res: ResKey; x: number; z: number; h: number }) {
  const ref = useRef<THREE.Sprite>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.y = h + 0.12 * Math.sin(performance.now() / 300 + x);
  });
  return (
    <sprite ref={ref} position={[x, h, z]} scale={[1.5, 1.5, 1]} renderOrder={6}>
      <spriteMaterial map={bubbleTex(res)} depthTest={false} depthWrite={false} />
    </sprite>
  );
}

/** Одна модель постройки вне инстансов: призрак при расстановке. */
function Model({ t, x, y, enemy }: { t: BuildingType; x: number; y: number; enemy?: boolean }) {
  const fantasy = useLib('fantasy');
  const village = useLib('village');
  const s = SIZE[t];
  const parts = t === 'wall' ? [p('fantasy', 'column', 0.6), p('fantasy', 'wall_straight', 0.5, 0, 0)] : partsOf({ i: 0, t, x, y, l: 1, state: 'ok' }, !!enemy);
  return (
    <group position={[W(x + s / 2), 0, W(y + s / 2)]}>
      {parts.map((m, k) =>
        ((m.lib === 'village' ? village : fantasy).get(m.name)?.meshes ?? []).map((mesh, j) => (
          <group key={`${k}-${j}`} position={[(m.dx ?? 0) * s * 0.5, 0, (m.dz ?? 0) * s * 0.5]} rotation={[0, m.ry ?? (t === 'townhall' ? Math.PI / 6 : 0), 0]} scale={m.s}>
            <mesh geometry={mesh.geometry} material={mesh.material} matrixAutoUpdate={false} matrix={mesh.matrix} castShadow />
          </group>
        )),
      )}
    </group>
  );
}

const UNIT_LOOK: Record<UnitKind, { color: string; s: number; fly?: boolean }> = {
  warrior: { color: '#e8833a', s: 1 },
  archer: { color: '#5fbf5a', s: 0.9 },
  giant: { color: '#c0392b', s: 1.8 },
  wallbreaker: { color: '#4a5a75', s: 0.85 },
  healer: { color: '#f6f2ff', s: 1, fly: true },
  hero: { color: '#ffd27a', s: 1.35 },
};
const MAX_UNITS = 140;

function Units({ view }: { view: React.MutableRefObject<BattleView | null> }) {
  const body = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.16, 0.24, 0.5, 8);
    g.translate(0, 0.25, 0);
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.7 }), MAX_UNITS);
    m.castShadow = true;
    m.frustumCulled = false;
    return m;
  }, []);
  const head = useMemo(() => {
    const g = new THREE.SphereGeometry(0.15, 10, 8);
    g.translate(0, 0.62, 0);
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#f1c9a5', roughness: 0.8 }), MAX_UNITS);
    m.frustumCulled = false;
    return m;
  }, []);
  useEffect(() => () => {
    body.dispose();
    head.dispose();
  }, [body, head]);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const v = view.current;
    let n = 0;
    if (v) {
      const a = Math.min(1, (performance.now() - v.at) / v.ms);
      for (const u of v.s.units) {
        if (!u.alive || n >= MAX_UNITS) continue;
        const prev = v.prev.get(u.n) ?? [u.x, u.y];
        const x = prev[0] + (u.x - prev[0]) * a;
        const y = prev[1] + (u.y - prev[1]) * a;
        const look = UNIT_LOOK[u.u];
        const lunge = v.s.tick - u.hit < 3 ? 1.12 : 1;
        const fly = look.fly ? 0.9 + 0.1 * Math.sin(performance.now() / 200 + u.n) : 0;
        // Фигурки крупнее настоящего масштаба: так их видно на телефоне.
        const k = look.s * 1.7;
        mat.makeScale(k * lunge, k, k * lunge).setPosition(W(x), fly, W(y));
        body.setMatrixAt(n, mat);
        head.setMatrixAt(n, mat);
        // Раненые темнеют.
        col.set(look.color).multiplyScalar(0.55 + 0.45 * (u.hp / u.maxHp));
        body.setColorAt(n, col);
        n++;
      }
    }
    body.count = n;
    head.count = n;
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <primitive object={body} />
      <primitive object={head} />
    </>
  );
}

const ARROWS = 48;
const BOOMS = 16;
function Effects({ view }: { view: React.MutableRefObject<BattleView | null> }) {
  const arrows = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.45), new THREE.MeshBasicMaterial({ color: '#fff3c4' }), ARROWS);
    m.frustumCulled = false;
    return m;
  }, []);
  const shells = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: '#4a4a52' }), BOOMS);
    m.frustumCulled = false;
    return m;
  }, []);
  const booms = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffb46b', transparent: true, opacity: 0.45, depthWrite: false }), BOOMS);
    m.frustumCulled = false;
    return m;
  }, []);
  useEffect(() => () => [arrows, shells, booms].forEach((m) => m.dispose()), [arrows, shells, booms]);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v3 = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(() => {
    const v = view.current;
    let na = 0;
    let ns = 0;
    let nb = 0;
    if (v) {
      const now = performance.now();
      const speed = 100 / v.ms;
      v.fx = v.fx.filter((f) => now - f.born < (f.k === 'shell' ? 1200 : f.k === 'boom' ? 450 : 260) / speed);
      for (const f of v.fx) {
        const t = ((now - f.born) * speed) / (f.k === 'shell' ? 1200 : f.k === 'boom' ? 450 : 260);
        if (f.k === 'boom' && nb < BOOMS) {
          const r = 0.4 + 1.1 * t;
          mat.makeScale(r, r * 0.6, r).setPosition(W(f.x0), 0.2, W(f.y0));
          booms.setMatrixAt(nb++, mat);
        } else if (f.k === 'shell' && ns < BOOMS) {
          v3.set(W(f.x0 + (f.x1 - f.x0) * t), 1.6 + 3 * t * (1 - t) - 1.5 * t, W(f.y0 + (f.y1 - f.y0) * t));
          mat.makeTranslation(v3.x, v3.y, v3.z);
          shells.setMatrixAt(ns++, mat);
        } else if (f.k === 'arrow' && na < ARROWS) {
          v3.set(W(f.x0 + (f.x1 - f.x0) * t), 1.2 - 0.7 * t, W(f.y0 + (f.y1 - f.y0) * t));
          q.setFromAxisAngle(up, Math.atan2(f.x1 - f.x0, f.y1 - f.y0));
          mat.compose(v3, q, sc.set(1, 1, 1));
          arrows.setMatrixAt(na++, mat);
        }
      }
    }
    arrows.count = na;
    shells.count = ns;
    booms.count = nb;
    arrows.instanceMatrix.needsUpdate = shells.instanceMatrix.needsUpdate = booms.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <primitive object={arrows} />
      <primitive object={shells} />
      <primitive object={booms} />
    </>
  );
}

/** Красноватые клетки, куда нельзя высаживать. */
function NoDeploy({ cells }: { cells: number[] }) {
  const mesh = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#ff4d6a', transparent: true, opacity: 0.26, depthWrite: false }), Math.max(1, cells.length));
    const mat = new THREE.Matrix4();
    cells.forEach((c, k) => {
      const { x, y } = cellOf(c);
      m.setMatrixAt(k, mat.makeTranslation(W(x + 0.5), 0.03, W(y + 0.5)));
    });
    m.count = cells.length;
    return m;
  }, [cells]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

export interface SceneProps {
  buildings: ViewBld[];
  enemy?: boolean;
  selected?: number;
  ghost?: { t: BuildingType; x: number; y: number; ok: boolean } | null;
  grid?: boolean;
  bubbles?: { i: number; res: ResKey }[];
  labels?: { i: number; text: string; color?: string }[];
  battle?: React.MutableRefObject<BattleView | null>;
  noDeploy?: number[];
  // Здоровье повреждённых построек в бою, 0..1.
  hp?: Record<number, number>;
  ctl: React.MutableRefObject<Ctl>;
}

function Scene(props: SceneProps) {
  const { buildings, enemy = false } = props;
  const lite = getSettings().lowPower;
  const items = useMemo(() => placed(buildings, enemy), [buildings, enemy]);
  const decor = useMemo(() => surroundings(lite), [lite]);
  const byId = useMemo(() => new Map(buildings.map((b) => [b.i, b])), [buildings]);
  const sel = props.selected != null ? byId.get(props.selected) : undefined;
  const top = (b: ViewBld) => (b.t === 'townhall' ? 5.6 : b.t === 'tower' || b.t === 'catapult' ? 3.8 : b.t === 'wall' ? 1.2 : 2.6);
  return (
    <>
      <Instanced lib="fantasy" items={decor} shadows={!lite} />
      <Instanced lib="fantasy" items={items.fantasy} />
      <Instanced lib="village" items={items.village ?? []} />
      {sel && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W(sel.x + SIZE[sel.t] / 2), 0.03, W(sel.y + SIZE[sel.t] / 2)]}>
          <ringGeometry args={[SIZE[sel.t] * 0.62, SIZE[sel.t] * 0.62 + 0.14, 40]} />
          <meshBasicMaterial color="#ff8a5c" />
        </mesh>
      )}
      {props.ghost && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W(props.ghost.x + SIZE[props.ghost.t] / 2), 0.04, W(props.ghost.y + SIZE[props.ghost.t] / 2)]}>
            <planeGeometry args={[SIZE[props.ghost.t], SIZE[props.ghost.t]]} />
            <meshBasicMaterial color={props.ghost.ok ? '#6ee7b7' : '#ff6b81'} transparent opacity={0.55} depthWrite={false} />
          </mesh>
          <Model t={props.ghost.t} x={props.ghost.x} y={props.ghost.y} />
        </>
      )}
      {props.grid && <gridHelper args={[GRID, GRID, '#ffffff', '#ffffff']} position={[0, 0.02, 0]} material-transparent material-opacity={0.22} />}
      {props.bubbles?.map((bb) => {
        const b = byId.get(bb.i);
        return b && <Bubble key={b.i} res={bb.res} x={W(b.x + SIZE[b.t] / 2)} z={W(b.y + SIZE[b.t] / 2)} h={top(b)} />;
      })}
      {props.labels?.map((l) => {
        const b = byId.get(l.i);
        return b && <Label key={b.i} text={l.text} color={l.color} x={W(b.x + SIZE[b.t] / 2)} z={W(b.y + SIZE[b.t] / 2)} h={top(b) - 0.6} />;
      })}
      {props.hp &&
        Object.entries(props.hp).map(([id, hp]) => {
          const b = byId.get(Number(id));
          return (
            b && (
              <group key={`hp${b.i}`} position={[W(b.x + SIZE[b.t] / 2), top(b) - 0.9, W(b.y + SIZE[b.t] / 2)]} rotation={[0, Math.PI / 4, 0]}>
                <mesh renderOrder={4}>
                  <planeGeometry args={[1.1, 0.16]} />
                  <meshBasicMaterial color="#1b1d26" depthTest={false} />
                </mesh>
                <mesh position={[-0.55 + 0.55 * hp, 0, 0.001]} scale={[hp, 1, 1]} renderOrder={5}>
                  <planeGeometry args={[1.1, 0.12]} />
                  <meshBasicMaterial color={hp > 0.5 ? '#6ee7b7' : hp > 0.25 ? '#ffd27a' : '#ff6b81'} depthTest={false} />
                </mesh>
              </group>
            )
          );
        })}
      {props.noDeploy && <NoDeploy cells={props.noDeploy} />}
      {props.battle && <Units view={props.battle} />}
      {props.battle && <Effects view={props.battle} />}
    </>
  );
}

/** Сцена деревни с камерой, светом и землёй. Пальцами её двигает VillageView. */
export function Village3D(props: SceneProps) {
  const sun = useRef<THREE.DirectionalLight>(null);
  return (
    <Canvas3D orthographic camera={{ position: [OFF.x, OFF.y, OFF.z], zoom: 14, near: 1, far: 200 }} gl={{ antialias: true }}>
      <color attach="background" args={['#6f9f45']} />
      <hemisphereLight args={['#ffffff', '#5a4a38', 1.25]} />
      <directionalLight ref={sun} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-bias={-0.0006} />
      <Rig ctl={props.ctl} sun={sun} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#7fb24c" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[GRID + 0.4, GRID + 0.4]} />
        <meshStandardMaterial color={props.enemy ? '#a5a36a' : '#97c45f'} roughness={1} />
      </mesh>
      <Suspense fallback={null}>
        <Scene {...props} />
      </Suspense>
    </Canvas3D>
  );
}

const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

/** Точка сетки (в клетках, дробная) под пальцем. */
export function cellAt(ctl: Ctl, el: HTMLElement, clientX: number, clientY: number): { x: number; y: number } | null {
  if (!ctl.camera) return null;
  const r = el.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), ctl.camera);
  if (!ray.ray.intersectPlane(ground, hit)) return null;
  return { x: hit.x + GRID / 2, y: hit.z + GRID / 2 };
}

/** Сдвиг камеры пальцем на (dx, dy) пикселей. */
export function pan(ctl: Ctl, dx: number, dy: number) {
  const k = 1 / ctl.zoom;
  // Вправо по экрану — (1, 0, -1)/√2, вверх по экрану на земле — (-1, 0, -1)/√2 и растянуто наклоном.
  const r = Math.SQRT1_2;
  ctl.tx += -dx * k * r + (-dy * k * r) / SIN_PITCH;
  ctl.tz += dx * k * r + (-dy * k * r) / SIN_PITCH;
  ctl.tx = Math.max(-16, Math.min(16, ctl.tx));
  ctl.tz = Math.max(-16, Math.min(16, ctl.tz));
}
