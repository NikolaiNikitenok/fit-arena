import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Canvas3D } from '../three/Canvas3D';
import { Instanced, Placed } from '../three/Instanced';
import { LibName, useLib } from '../three/kit';
import { Ground } from './Ground';
import { Anim, GOLD, KitPart, Look, lookOf, Prim, SIZE } from './looks';
import { AnimInstances, animateGroup, Blobs, lookGroup, PrimInstances } from './looks3d';
import { getSettings } from '../settings';
import { BuildingType, GRID, ResKey } from '../../shared/village';
import { BattleState, cellOf, Fx } from '../../shared/villageBattle';
import { RES_COLORS } from './icons';
import { HealerAuras, HeroLook, HeroTroop, Troops, UnitBars } from './troops3d';

// Деревня в 3D: изометрия ортогональной камерой, постройки KayKit инстансами, стены собираются
// из секций между соседними клетками. Та же сцена показывает бой: отряды — персонажи KayKit
// (src/village/troops3d.tsx) с полосками здоровья, выстрелы и взрывы — из пула.

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

// Вид постройки по уровню — src/village/looks.ts; стройка и руины — общие для всех.
function lookFor(b: ViewBld, enemy: boolean): Look {
  const s = SIZE[b.t];
  const kit = (name: string, sc: number): KitPart => ({ lib: name === 'building_dirt' ? 'village' : 'fantasy', name, s: sc, x: 0, z: 0, y: 0, ry: 0 });
  if (b.state === 'ruin') return { kit: [b.t === 'wall' ? kit('rock_single_B', 3) : kit('building_destroyed', s / 1.6)], prim: [], anim: [], top: 1.6, blob: 0 };
  if (b.state === 'new') return { kit: [kit('building_dirt', s / 1.9), kit('building_scaffolding', s / 2.1)], prim: [], anim: [], top: 2.2, blob: s * 0.55 };
  return lookOf(b.t, b.l, enemy);
}

type Moving = Anim & { ox: number; oz: number };
function placed(list: ViewBld[], enemy: boolean): { kit: Record<LibName, Placed[]>; prim: Prim[]; anim: Moving[]; blobs: [number, number, number][] } {
  const out: Record<string, Placed[]> = { fantasy: [], village: [] };
  const prim: Prim[] = [];
  const anim: Moving[] = [];
  const blobs: [number, number, number][] = [];
  const walls = new Set(list.filter((b) => b.t === 'wall' && b.state !== 'ruin').map((b) => `${b.x},${b.y}`));
  for (const b of list) {
    const s = SIZE[b.t];
    const cx = W(b.x + s / 2);
    const cz = W(b.y + s / 2);
    if (b.t === 'wall' && b.state !== 'ruin') {
      // Столб в клетке и секции к соседям справа и снизу; с 6 уровня на столбе золотая шапка.
      const tint = b.l >= 5 ? 'mul:0.8,0.85,1' : b.l >= 3 ? undefined : 'mul:1.15,1.05,0.9';
      const cs = 0.55 + 0.03 * b.l;
      out.fantasy.push({ name: 'column', x: cx, z: cz, s: cs, tint });
      if (b.l >= 6) prim.push({ k: 'cone', x: cx, y: 1.4 * cs + 0.12, z: cz, sx: 0.32, sy: 0.26, sz: 0.32, c: GOLD });
      if (walls.has(`${b.x + 1},${b.y}`)) out.fantasy.push({ name: 'wall_straight', x: cx + 0.5, z: cz, s: 0.5, tint });
      if (walls.has(`${b.x},${b.y + 1}`)) out.fantasy.push({ name: 'wall_straight', x: cx, z: cz + 0.5, s: 0.5, ry: Math.PI / 2, tint });
      continue;
    }
    const look = lookFor(b, enemy);
    for (const m of look.kit) (out[m.lib] ??= []).push({ name: m.name, x: cx + m.x, y: m.y, z: cz + m.z, s: m.s, ry: m.ry, tint: m.tint });
    for (const p of look.prim) prim.push({ ...p, x: cx + p.x, z: cz + p.z });
    for (const a of look.anim) anim.push({ ...a, ox: cx, oz: cz });
    if (look.blob) blobs.push([cx, cz, look.blob]);
  }
  return { kit: out as Record<LibName, Placed[]>, prim, anim, blobs };
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
  const group = useMemo(() => lookGroup(lookOf(t, 1, !!enemy), { fantasy, village, space: undefined, city: undefined }, { shadows: true }), [t, enemy, fantasy, village]);
  useFrame(() => animateGroup(group, performance.now() / 1000));
  const s = SIZE[t];
  return <primitive object={group} position={[W(x + s / 2), 0, W(y + s / 2)]} />;
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

// Герой чужого нападающего (повтор набега): его снаряжения мы не знаем.
const DEFAULT_HERO: HeroLook = { model: 'Knight', glow: '#ff8a5c', tint: 'mul:0.95,0.85,0.8' };

export interface SceneProps {
  buildings: ViewBld[];
  enemy?: boolean;
  selected?: number;
  ghost?: { t: BuildingType; x: number; y: number; ok: boolean; id?: number } | null;
  grid?: boolean;
  bubbles?: { i: number; res: ResKey }[];
  labels?: { i: number; text: string; color?: string }[];
  battle?: React.MutableRefObject<BattleView | null>;
  noDeploy?: number[];
  // Здоровье повреждённых построек в бою, 0..1.
  hp?: Record<number, number>;
  // Как выглядит герой в бою (его снаряжение) и чьи отряды на поле: в повторе набега на тебя — чужие.
  heroLook?: HeroLook;
  foe?: boolean;
  ctl: React.MutableRefObject<Ctl>;
}

function Scene(props: SceneProps) {
  const { buildings, enemy = false } = props;
  const lite = getSettings().lowPower;
  const items = useMemo(() => placed(buildings, enemy), [buildings, enemy]);
  const byId = useMemo(() => new Map(buildings.map((b) => [b.i, b])), [buildings]);
  const sel = props.selected != null ? byId.get(props.selected) : undefined;
  const top = (b: ViewBld) => lookFor(b, enemy).top;
  return (
    <>
      <Ground buildings={buildings} enemy={enemy} lite={lite} grid={props.grid} ghost={props.ghost} />
      <Instanced lib="fantasy" items={items.kit.fantasy} />
      <Instanced lib="village" items={items.kit.village ?? []} />
      <PrimInstances list={items.prim} />
      <AnimInstances list={items.anim} lite={lite} />
      <Blobs list={items.blobs} />
      {sel && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W(sel.x + SIZE[sel.t] / 2), 0.03, W(sel.y + SIZE[sel.t] / 2)]}>
          <ringGeometry args={[SIZE[sel.t] * 0.62, SIZE[sel.t] * 0.62 + 0.14, 40]} />
          <meshBasicMaterial color="#ff8a5c" />
        </mesh>
      )}
      {props.ghost && <Model t={props.ghost.t} x={props.ghost.x} y={props.ghost.y} enemy={enemy} />}
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
      {props.battle && (
        // Персонажи грузятся отдельно: поле боя видно сразу.
        <>
          <Suspense fallback={null}>
            <Troops view={props.battle} ids={props.battle.current?.s.input.army.troops ?? {}} lv={props.battle.current?.s.input.army.lv} lite={lite} />
          </Suspense>
          <Suspense fallback={null}>
            <HeroTroop view={props.battle} look={props.heroLook ?? DEFAULT_HERO} />
          </Suspense>
        </>
      )}
      {props.battle && <HealerAuras view={props.battle} />}
      {props.battle && <UnitBars view={props.battle} foe={!!props.foe} />}
      {props.battle && <Effects view={props.battle} />}
    </>
  );
}

/** Сцена деревни с камерой, светом и землёй. Пальцами её двигает VillageView. */
export function Village3D(props: SceneProps) {
  const sun = useRef<THREE.DirectionalLight>(null);
  return (
    <Canvas3D orthographic camera={{ position: [OFF.x, OFF.y, OFF.z], zoom: 14, near: 1, far: 200 }} gl={{ antialias: true }}>
      <color attach="background" args={['#6a9a40']} />
      <hemisphereLight args={['#ffffff', '#5a4a38', 1.25]} />
      <directionalLight ref={sun} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-bias={-0.0006} />
      <Rig ctl={props.ctl} sun={sun} />
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
