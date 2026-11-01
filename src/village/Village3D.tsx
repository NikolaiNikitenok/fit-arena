import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Canvas3D } from '../three/Canvas3D';
import { OVERLAY, StylePass, useOverlayLayer } from '../three/StylePass';
import { Instanced, Placed } from '../three/Instanced';
import { LibName, useLib } from '../three/kit';
import { Ground } from './Ground';
import { Anim, decorLook, KitPart, Look, lookOf, Prim, SIZE, trapLook, wallLook } from './looks';
import type { Decor, DecorKind, ThemeId } from './decor';
import { DecorExtras } from './Decor3D';
import type { CharName } from '../three/kit';
import { AnimInstances, animateGroup, Blobs, lookGroup, PrimInstances } from './looks3d';
import { getSettings, useSettings } from '../settings';
import { emitFx, Particles } from './Particles';
import { HitFx } from './HitFx';
import { Skyline } from './Skyline';
import { SeasonFall, seasonNow } from '../three/SeasonFall';
import { EdgeFog, Fireflies, Lamps, lampSpots, Precipitation, SkyLights, useSky, WindowGlow } from './Atmosphere';
import { BuildingType, GRID, ResKey } from '../../shared/village';
import { BattleState, cellOf, Fx } from '../../shared/villageBattle';
import { CRY, GUARD, QUAKE, SKILLS, type SkillId } from '../../shared/heroSkills';
import { RES_COLORS } from './icons';
import { Builders } from './Builders';
import { Birds, TavernNotes, Villagers } from './Life';
import { DEFAULT_HERO, HealerAuras, HeroLook, HeroTroop, KEEPER_FOE, SkillAuras, Troops, UnitBars } from './troops3d';

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
  // Поворот камеры вокруг деревни, рад (только во время пролёта, потом 0).
  yaw?: number;
  // Обычный зум для этого экрана: от него считаем наезд на постройку.
  base?: number;
  // Плавный переход камеры: пролёт при входе, наезд на постройку.
  anim?: CamAnim | null;
  // Инерция после броска пальцем, пикселей в секунду.
  fling?: { vx: number; vy: number } | null;
  // Пролететь над деревней, когда сцена загрузится.
  intro?: boolean;
  // Сцена с моделями на экране (до этого пролёт ждёт).
  ready?: boolean;
  // Тряска камеры (падение ратуши): сила и сколько уже трясёт, мс.
  shake?: { amp: number; t: number } | null;
}

interface CamPose {
  tx: number;
  tz: number;
  zoom: number;
  yaw: number;
}
interface CamAnim {
  from: CamPose;
  to: CamPose;
  // Прошло, мс: считаем по кадрам, а не по часам, чтобы подвисание на сборке шейдеров не съело пролёт.
  t: number;
  dur: number;
}

const pose = (c: Ctl): CamPose => ({ tx: c.tx, tz: c.tz, zoom: c.zoom, yaw: c.yaw ?? 0 });

/** Плавно перевести камеру. */
export function animateTo(c: Ctl, to: Partial<CamPose>, dur = 550) {
  c.fling = null;
  c.anim = { from: pose(c), to: { ...pose(c), yaw: 0, ...to }, t: 0, dur };
}

/** Остановить пролёт или наезд: палец главнее. Поворот быстро возвращается к обычному. */
export function stopCamera(c: Ctl) {
  c.fling = null;
  if (!c.anim) return;
  c.anim = (c.yaw ?? 0) !== 0 ? { from: pose(c), to: { ...pose(c), yaw: 0 }, t: 0, dur: 220 } : null;
}

/** Подвести камеру к точке сцены так, чтобы она оказалась чуть выше середины (над карточкой). */
export function focusOn(c: Ctl, x: number, z: number, screenH: number) {
  const zoom = Math.min(70, Math.max(c.zoom, (c.base ?? c.zoom) * 1.12));
  const t = { tx: x, tz: z, zoom };
  // Постройка встаёт на треть экрана сверху: её не закроет карточка снизу.
  pan(t, 0, -screenH * 0.18);
  animateTo(c, t, 520);
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

const W = (c: number) => c - GRID / 2;
// Камера смотрит с юго-востока под 50°.
const PITCH = (50 * Math.PI) / 180;
const OFF = new THREE.Vector3(Math.cos(PITCH) * Math.SQRT1_2, Math.sin(PITCH), Math.cos(PITCH) * Math.SQRT1_2).multiplyScalar(60);
export const SIN_PITCH = Math.sin(PITCH);
const UP = new THREE.Vector3(0, 1, 0);

// Вид постройки по уровню — src/village/looks.ts; стройка и руины — общие для всех.
function lookFor(b: ViewBld, enemy: boolean): Look {
  const s = SIZE[b.t];
  const kit = (name: string, sc: number): KitPart => ({ lib: name === 'building_dirt' ? 'village' : 'fantasy', name, s: sc, x: 0, z: 0, y: 0, ry: 0 });
  if (b.t === 'bomb' || b.t === 'snare') return trapLook(b.t, b.l, b.state === 'ruin');
  if (b.state === 'ruin') return { kit: [b.t === 'wall' ? kit('rock_single_B', 3) : kit('building_destroyed', s / 1.6)], prim: [], anim: [], top: 1.6, blob: 0 };
  if (b.state === 'new') return { kit: [kit('building_dirt', s / 1.9), kit('building_scaffolding', s / 2.1)], prim: [], anim: [], top: 2.2, blob: s * 0.55 };
  return lookOf(b.t, b.l, enemy);
}

type Moving = Anim & { ox: number; oz: number };
/** Во сколько раз постройки крупнее, чем в превью и карточках. */
const BIG = 1.1;

function placed(list: ViewBld[], enemy: boolean, decor: Decor[] = [], theme: ThemeId = 'classic'): { kit: Record<LibName, Placed[]>; prim: Prim[]; anim: Moving[]; blobs: [number, number, number][] } {
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
      // Вид столба по уровню — wallLook в looks.ts, тот же в превью.
      const { tint, cs, prim: trim } = wallLook(b.l);
      const g = { g: b.i, gx: cx, gz: cz };
      out.fantasy.push({ name: 'column', x: cx, z: cz, s: cs, tint, ...g });
      for (const p of trim) prim.push({ ...p, x: cx + p.x, z: cz + p.z, ...g });
      if (walls.has(`${b.x + 1},${b.y}`)) out.fantasy.push({ name: 'wall_straight', x: cx + 0.5, z: cz, s: 0.5, tint, ...g });
      if (walls.has(`${b.x},${b.y + 1}`)) out.fantasy.push({ name: 'wall_straight', x: cx, z: cz + 0.5, s: 0.5, ry: Math.PI / 2, tint, ...g });
      continue;
    }
    const look = lookFor(b, enemy);
    // Постройки чуть крупнее своей клетки — «пухлые», как в больших стратегиях.
    const K = BIG;
    const g = { g: b.i, gx: cx, gz: cz };
    for (const m of look.kit) (out[m.lib] ??= []).push({ name: m.name, x: cx + m.x * K, y: m.y * K, z: cz + m.z * K, s: m.s * K, ry: m.ry, tint: m.tint, ...g });
    for (const p of look.prim) prim.push({ ...p, x: cx + p.x * K, y: p.y * K, z: cz + p.z * K, sx: p.sx * K, sy: p.sy * K, sz: p.sz * K, ...g });
    for (const a of look.anim) anim.push({ ...a, x: a.x * K, y: a.y * K, z: a.z * K, s: a.s * K, ox: cx, oz: cz });
    if (look.blob) blobs.push([cx, cz, look.blob]);
  }
  for (const d of decor) {
    if (d.k === 'path') continue;
    const cx = W(d.x + 0.5);
    const cz = W(d.y + 0.5);
    const look = decorLook(d.k, theme);
    for (const m of look.kit) (out[m.lib] ??= []).push({ name: m.name, x: cx + m.x, y: m.y, z: cz + m.z, s: m.s, ry: m.ry, tint: m.tint });
    for (const p of look.prim) prim.push({ ...p, x: cx + p.x, z: cz + p.z });
    if (look.blob) blobs.push([cx, cz, look.blob]);
  }
  return { kit: out as Record<LibName, Placed[]>, prim, anim, blobs };
}

function Rig({ ctl, sun, sunH = 1 }: { ctl: React.MutableRefObject<Ctl>; sun: React.RefObject<THREE.DirectionalLight | null>; sunH?: number }) {
  const { camera, size } = useThree();
  const last = useRef(0);
  const off = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, raw) => {
    const c = ctl.current;
    const dt = Math.min(raw, 0.05);
    if (!c.zoom) c.zoom = Math.max(12, Math.min(size.width, size.height * 0.8) / 19);
    c.base ??= c.zoom;
    if (c.intro && c.ready) {
      // Пролёт: издалека и сбоку, по дуге к деревне.
      c.intro = false;
      const to = pose(c);
      c.anim = { from: { tx: to.tx - 6, tz: to.tz + 10, zoom: to.zoom * 0.42, yaw: -1.1 }, to, t: 0, dur: 2400 };
    }
    if (c.anim) {
      const a = c.anim;
      a.t += dt * 1000;
      const k = Math.min(1, a.t / a.dur);
      const e = ease(k);
      c.tx = a.from.tx + (a.to.tx - a.from.tx) * e;
      c.tz = a.from.tz + (a.to.tz - a.from.tz) * e;
      c.zoom = a.from.zoom * Math.pow(a.to.zoom / a.from.zoom, e);
      c.yaw = a.from.yaw + (a.to.yaw - a.from.yaw) * e;
      if (k >= 1) c.anim = null;
    } else if (c.fling) {
      // Карта катится по инерции и плавно останавливается.
      pan(c, c.fling.vx * dt, c.fling.vy * dt);
      const k = Math.exp(-4.5 * dt);
      c.fling.vx *= k;
      c.fling.vy *= k;
      if (Math.hypot(c.fling.vx, c.fling.vy) < 12) c.fling = null;
    }
    c.camera = camera;
    if (import.meta.env.DEV) Object.assign(window, { __vil: c, __fx: emitFx });
    const cam = camera as THREE.OrthographicCamera;
    off.copy(OFF).applyAxisAngle(UP, c.yaw ?? 0);
    let sx = 0;
    let sz = 0;
    if (c.shake) {
      c.shake.t += dt * 1000;
      const k = c.shake.amp * Math.max(0, 1 - c.shake.t / 700) ** 2;
      sx = Math.sin(c.shake.t * 0.09) * k;
      sz = Math.cos(c.shake.t * 0.071) * k;
      if (c.shake.t > 700) c.shake = null;
    }
    camera.position.set(c.tx + sx + off.x, OFF.y, c.tz + sz + off.z);
    camera.lookAt(c.tx + sx, 0, c.tz + sz);
    if (last.current !== c.zoom) {
      cam.zoom = c.zoom;
      cam.updateProjectionMatrix();
      last.current = c.zoom;
    }
    if (sun.current) {
      sun.current.position.set(c.tx + 12 + 10 * (1 - sunH), 22 * sunH, c.tz + 6);
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
    <sprite position={[x, h, z]} scale={[3, 1, 1]} renderOrder={5} layers={OVERLAY}>
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

let upTex: THREE.Texture | null = null;
/** Зелёный кружок со стрелкой вверх: «можно улучшить». */
function upTexture(): THREE.Texture {
  if (upTex) return upTex;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath();
  g.arc(48, 52, 38, 0, Math.PI * 2);
  g.fill();
  const grad = g.createLinearGradient(0, 10, 0, 86);
  grad.addColorStop(0, '#8af06a');
  grad.addColorStop(1, '#2fa83a');
  g.fillStyle = grad;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(48, 46, 36, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(48, 22);
  g.lineTo(70, 46);
  g.lineTo(57, 46);
  g.lineTo(57, 68);
  g.lineTo(39, 68);
  g.lineTo(39, 46);
  g.lineTo(26, 46);
  g.closePath();
  g.fill();
  upTex = new THREE.CanvasTexture(c);
  upTex.colorSpace = THREE.SRGBColorSpace;
  return upTex;
}

function UpArrow({ x, z, h }: { x: number; z: number; h: number }) {
  const ref = useRef<THREE.Sprite>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = performance.now() / 1000;
    ref.current.position.y = h + 0.18 * Math.abs(Math.sin(t * 2.4 + x));
  });
  return (
    <sprite ref={ref} position={[x, h, z]} scale={[0.85, 0.85, 1]} renderOrder={6} layers={OVERLAY}>
      <spriteMaterial map={upTexture()} depthTest={false} depthWrite={false} />
    </sprite>
  );
}

function Bubble({ res, x, z, h }: { res: ResKey; x: number; z: number; h: number }) {
  const ref = useRef<THREE.Sprite>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.y = h + 0.12 * Math.sin(performance.now() / 300 + x);
  });
  return (
    <sprite ref={ref} position={[x, h, z]} scale={[1.5, 1.5, 1]} renderOrder={6} layers={OVERLAY}>
      <spriteMaterial map={bubbleTex(res)} depthTest={false} depthWrite={false} />
    </sprite>
  );
}

/** Одна модель постройки (или украшения) вне инстансов: призрак при расстановке. */
function Model({ t, x, y, enemy, decor, theme }: { t: BuildingType; x: number; y: number; enemy?: boolean; decor?: DecorKind; theme?: ThemeId }) {
  const fantasy = useLib('fantasy');
  const village = useLib('village');
  const group = useMemo(() => lookGroup(decor ? decorLook(decor, theme) : lookOf(t, 1, !!enemy), { fantasy, village, space: undefined, city: undefined }, { shadows: true }), [t, enemy, decor, theme, fantasy, village]);
  useFrame(() => animateGroup(group, performance.now() / 1000));
  const s = SIZE[t];
  return <primitive object={group} position={[W(x + s / 2), 0, W(y + s / 2)]} />;
}

const ARROWS = 48;
const BOOMS = 16;
const CASTS = 8;
// Сколько живёт эффект на экране, мс (при скорости ×1).
const FX_MS = { shell: 1200, boom: 450, cast: 800, bolt: 450, arrow: 260, hit: 260, snap: 500 } as const;
const CAST_R: Partial<Record<SkillId, number>> = { cry: CRY.radius, guard: GUARD.radius, quake: QUAKE.stunRadius };
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
  // Умения героя: расходящееся кольцо цвета умения и столбы молний.
  const rings = useMemo(() => {
    const g = new THREE.RingGeometry(0.85, 1, 40);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), CASTS);
    m.frustumCulled = false;
    m.renderOrder = 3;
    // Цвет у каждого кольца свой: буфер цветов нужен до первой отрисовки, иначе шейдер его не увидит.
    m.setColorAt(0, new THREE.Color('#ffffff'));
    return m;
  }, []);
  const bolts = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.3, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#e6deff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), CASTS);
    m.frustumCulled = false;
    return m;
  }, []);
  const col = useMemo(() => new THREE.Color(), []);
  useEffect(() => () => [arrows, shells, booms, rings, bolts].forEach((m) => m.dispose()), [arrows, shells, booms, rings, bolts]);
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
    let nr = 0;
    let nl = 0;
    if (v) {
      const now = performance.now();
      const speed = 100 / v.ms;
      v.fx = v.fx.filter((f) => now - f.born < FX_MS[f.k] / speed);
      for (const f of v.fx) {
        const t = ((now - f.born) * speed) / FX_MS[f.k];
        if (f.k === 'cast' && f.a && nr < CASTS) {
          const r = 0.6 + (CAST_R[f.a] ?? 2) * Math.sqrt(t);
          mat.makeScale(r, 1, r).setPosition(W(f.x0), 0.08 + 0.3 * t, W(f.y0));
          rings.setMatrixAt(nr, mat);
          rings.setColorAt(nr++, col.set(SKILLS[f.a].color).multiplyScalar(1 - t));
        } else if (f.k === 'bolt' && nl < CASTS) {
          const flick = t < 0.5 || (t > 0.65 && t < 0.8) ? 1 : 0.05;
          mat.makeScale(flick * (1.2 - t), 9, flick * (1.2 - t)).setPosition(W(f.x0), 4.5, W(f.y0));
          bolts.setMatrixAt(nl++, mat);
        } else if (f.k === 'snap' && nr < CASTS) {
          // Капкан захлопнулся: быстрое серое кольцо.
          const r = 0.25 + 0.9 * Math.sqrt(t);
          mat.makeScale(r, 1, r).setPosition(W(f.x0), 0.1, W(f.y0));
          rings.setMatrixAt(nr, mat);
          rings.setColorAt(nr++, col.set('#d9dee6').multiplyScalar(1 - t));
        } else if (f.k === 'boom' && nb < BOOMS) {
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
    rings.count = nr;
    bolts.count = nl;
    arrows.instanceMatrix.needsUpdate = shells.instanceMatrix.needsUpdate = booms.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = bolts.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <primitive object={arrows} />
      <primitive object={shells} />
      <primitive object={booms} />
      <primitive object={rings} />
      <primitive object={bolts} />
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
  ghost?: { t: BuildingType; x: number; y: number; ok: boolean; id?: number; decor?: DecorKind } | null;
  // Украшения своей деревни, её тема, флаг клана для знамён и герой для статуй.
  decor?: Decor[];
  theme?: ThemeId;
  clanFlag?: string;
  statueHero?: CharName;
  grid?: boolean;
  bubbles?: { i: number; res: ResKey }[];
  // Постройки, которые можно улучшить прямо сейчас: зелёная стрелка над ними.
  ups?: number[];
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

/**
 * Следит за постройками и пускает эффекты: рухнула в бою — пыль и обломки, достроилась — пыль
 * и искры, ратуша выросла — салют. Первый показ сцены ничего не взрывает.
 */
function useBuildFx(buildings: ViewBld[], on: boolean, scope: string) {
  const prev = useRef<{ scope: string; map: Map<number, ViewBld> } | null>(null);
  useEffect(() => {
    // Деревня, бой и чужая деревня — разные постройки с теми же номерами: при смене сцены не сравниваем.
    const was = prev.current?.scope === scope ? prev.current.map : null;
    prev.current = { scope, map: new Map(buildings.map((b) => [b.i, b])) };
    if (!was || !on) return;
    for (const b of buildings) {
      const old = was.get(b.i);
      if (!old) continue;
      const s = SIZE[b.t];
      const x = W(b.x + s / 2);
      const z = W(b.y + s / 2);
      if (b.state === 'ruin' && old.state !== 'ruin') emitFx('ruin', x, z, s);
      else if (b.state === 'ok' && (old.state === 'new' || old.state === 'up')) emitFx(b.t === 'townhall' && b.l > old.l ? 'fireworks' : 'built', x, z, s);
      else if (b.t === 'townhall' && b.l > old.l) emitFx('fireworks', x, z, s);
    }
  }, [buildings, on, scope]);
}

function Scene(props: SceneProps) {
  const { buildings, enemy = false } = props;
  const lite = getSettings().lowPower;
  const fx = useSettings().villageFx;
  const ctlRef = props.ctl;
  useEffect(() => {
    ctlRef.current.ready = true;
  }, [ctlRef]);
  useBuildFx(buildings, fx, `${!!props.battle}${enemy}`);
  const theme = props.theme ?? 'classic';
  const decor = props.decor;
  const items = useMemo(() => placed(buildings, enemy, decor, theme), [buildings, enemy, decor, theme]);
  const byId = useMemo(() => new Map(buildings.map((b) => [b.i, b])), [buildings]);
  const sel = props.selected != null ? byId.get(props.selected) : undefined;
  const top = (b: ViewBld) => lookFor(b, enemy).top;
  return (
    <>
      <Ground buildings={buildings} enemy={enemy} lite={lite} grid={props.grid} ghost={props.ghost} paths={decor} theme={enemy || props.battle ? 'classic' : theme} />
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
      {props.ghost && props.ghost.decor !== 'path' && <Model t={props.ghost.t} x={props.ghost.x} y={props.ghost.y} enemy={enemy} decor={props.ghost.decor} theme={theme} />}
      {decor && decor.some((d) => d.k.startsWith('statue') || d.k === 'clanflag') && (
        <Suspense fallback={null}>
          <DecorExtras decor={decor} hero={props.statueHero ?? 'Knight'} clanFlag={props.clanFlag} />
        </Suspense>
      )}
      {props.bubbles?.map((bb) => {
        const b = byId.get(bb.i);
        return b && <Bubble key={b.i} res={bb.res} x={W(b.x + SIZE[b.t] / 2)} z={W(b.y + SIZE[b.t] / 2)} h={top(b)} />;
      })}
      {props.ups?.map((i) => {
        const b = byId.get(i);
        if (!b || props.bubbles?.some((bb) => bb.i === i)) return null;
        const s = SIZE[b.t];
        return <UpArrow key={i} x={W(b.x + s * 0.85)} z={W(b.y + s * 0.85)} h={top(b) * BIG * 0.8} />;
      })}
      {props.labels?.map((l) => {
        const b = byId.get(l.i);
        return b && <Label key={b.i} text={l.text} color={l.color} x={W(b.x + SIZE[b.t] / 2)} z={W(b.y + SIZE[b.t] / 2)} h={top(b) - 0.6} />;
      })}
      {props.hp &&
        Object.entries(props.hp).map(([id, hp]) => {
          const b = byId.get(Number(id));
          return (
            b && <HpBar key={`hp${b.i}`} hp={hp} x={W(b.x + SIZE[b.t] / 2)} y={top(b) - 0.9} z={W(b.y + SIZE[b.t] / 2)} />
          );
        })}
      {/* Невидимая (сжатая в точку) полоска с начала боя: её шейдер собран до первого попадания. */}
      {props.battle && <HpBar hp={1} x={0} y={0} z={0} scale={1e-4} />}
      {props.noDeploy && <NoDeploy cells={props.noDeploy} />}
      {!props.battle && !enemy && (
        <Suspense fallback={null}>
          <Builders buildings={buildings} />
        </Suspense>
      )}
      {!props.battle && !enemy && (
        <Suspense fallback={null}>
          <Villagers buildings={buildings} decor={decor ?? []} lite={lite} />
        </Suspense>
      )}
      {props.battle && (
        // Персонажи грузятся отдельно: поле боя видно сразу.
        <>
          <Suspense fallback={null}>
            <Troops view={props.battle} ids={props.battle.current?.s.input.army.troops ?? {}} lv={props.battle.current?.s.input.army.lv} lite={lite} />
          </Suspense>
          <Suspense fallback={null}>
            <HeroTroop view={props.battle} look={props.foe ? DEFAULT_HERO : (props.heroLook ?? DEFAULT_HERO)} />
          </Suspense>
          {props.battle.current?.s.keeper && (
            <Suspense fallback={null}>
              <HeroTroop view={props.battle} keeper foe={!props.foe} look={props.foe ? (props.heroLook ?? DEFAULT_HERO) : KEEPER_FOE} />
            </Suspense>
          )}
        </>
      )}
      {props.battle && <HealerAuras view={props.battle} />}
      {props.battle && <SkillAuras view={props.battle} />}
      {props.battle && <UnitBars view={props.battle} foe={!!props.foe} />}
      {props.battle && <Effects view={props.battle} />}
      {props.battle && <HitFx view={props.battle} fx={fx} />}
      {fx && <Particles lite={lite} />}
    </>
  );
}

function OverlayLayer() {
  useOverlayLayer();
  return null;
}

/** Полоска здоровья постройки. */
function HpBar({ hp, x, y, z, scale = 1 }: { hp: number; x: number; y: number; z: number; scale?: number }) {
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI / 4, 0]} scale={scale}>
      <mesh renderOrder={4} layers={OVERLAY}>
        <planeGeometry args={[1.1, 0.16]} />
        <meshBasicMaterial color="#1b1d26" depthTest={false} />
      </mesh>
      <mesh position={[-0.55 + 0.55 * hp, 0, 0.001]} scale={[hp, 1, 1]} renderOrder={5} layers={OVERLAY}>
        <planeGeometry args={[1.1, 0.12]} />
        <meshBasicMaterial color={hp > 0.5 ? '#6ee7b7' : hp > 0.25 ? '#ffd27a' : '#ff6b81'} depthTest={false} />
      </mesh>
    </group>
  );
}

/** Сцена деревни с камерой, светом и землёй. Пальцами её двигает VillageView. */
export function Village3D(props: SceneProps) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const s = useSettings();
  // Своя деревня живёт по часам и погоде; бой и чужая деревня — всегда ясный день.
  const live = !props.battle && !props.enemy;
  const { sky, weather } = useSky(live, s.dayNight, props.theme);
  const fx = s.villageFx;
  const spots = useMemo(() => lampSpots(props.buildings), [props.buildings]);
  // Зимняя тема — своя погода (снег): листьев и лепестков в ней нет.
  const season = props.theme === 'winter' ? null : seasonNow();
  return (
    <Canvas3D orthographic camera={{ position: [OFF.x, OFF.y, OFF.z], zoom: 14, near: 1, far: 260 }} gl={{ antialias: true }}>
      <hemisphereLight ref={hemi} args={['#ffffff', '#5a4a38', 1.25]} />
      <directionalLight ref={sun} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-bias={-0.0006} />
      <SkyLights sky={sky} sun={sun} hemi={hemi} />
      <Rig ctl={props.ctl} sun={sun} sunH={sky.sunH} />
      <EdgeFog color={sky.fog} />
      <Suspense fallback={null}>
        <Scene {...props} />
        {live && <Lamps spots={spots} on={sky.lamps} ctl={props.ctl} shadows={!s.lowPower} />}
        <WindowGlow on={live ? sky.lamps : 0} />
        {live && fx && <Skyline ctl={props.ctl} lite={s.lowPower} />}
      </Suspense>
      {live && fx && <Birds theme={props.theme ?? 'classic'} night={sky.lamps} />}
      {live && fx && <TavernNotes buildings={props.buildings} />}
      {live && fx && sky.lamps > 0.5 && weather === 'clear' && <Fireflies on={sky.lamps} ctl={props.ctl} lite={s.lowPower} />}
      {live && fx && weather !== 'clear' && <Precipitation kind={weather} ctl={props.ctl} lite={s.lowPower} />}
      {live && fx && weather !== 'snow' && season && <SeasonFall season={season} lite={s.lowPower} center={(v) => v.set(props.ctl.current.tx, 0, props.ctl.current.tz)} zoom={() => props.ctl.current.zoom} />}
      <OverlayLayer />
      {!s.lowPower && <StylePass />}
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

const proj = new THREE.Vector3();
/**
 * Пузырь урожая под пальцем: номер постройки или null. Пузырь висит над крышей, далеко от клеток
 * постройки, поэтому ищем его на экране, а не на земле.
 */
export function bubbleAt(ctl: Ctl, el: HTMLElement, clientX: number, clientY: number, buildings: ViewBld[], bubbles: { i: number }[]): number | null {
  if (!ctl.camera || !bubbles.length) return null;
  const r = el.getBoundingClientRect();
  // Пузырь — 1,5 клетки; палец промахивается, поэтому круг попадания чуть больше.
  const rad = Math.max(28, 0.9 * ctl.zoom);
  let best: number | null = null;
  let bestD = rad;
  for (const bb of bubbles) {
    const b = buildings.find((v) => v.i === bb.i);
    if (!b) continue;
    const s = SIZE[b.t];
    proj.set(W(b.x + s / 2), lookFor(b, false).top, W(b.y + s / 2)).project(ctl.camera);
    const d = Math.hypot(r.left + ((proj.x + 1) / 2) * r.width - clientX, r.top + ((1 - proj.y) / 2) * r.height - clientY);
    if (d < bestD) {
      bestD = d;
      best = b.i;
    }
  }
  return best;
}

/**
 * Масштаб с центром в точке экрана (пиксели от центра холста): то, что под пальцами, остаётся под ними.
 */
export function zoomAt(ctl: Ctl, zoom: number, dx: number, dy: number) {
  const z1 = ctl.zoom;
  const z2 = Math.max(7, Math.min(70, zoom));
  ctl.zoom = z2;
  pan(ctl, -dx * (z2 / z1 - 1), -dy * (z2 / z1 - 1));
}

/** Сдвиг камеры пальцем на (dx, dy) пикселей. */
export function pan(ctl: { tx: number; tz: number; zoom: number }, dx: number, dy: number) {
  const k = 1 / ctl.zoom;
  // Вправо по экрану — (1, 0, -1)/√2, вверх по экрану на земле — (-1, 0, -1)/√2 и растянуто наклоном.
  const r = Math.SQRT1_2;
  ctl.tx += -dx * k * r + (-dy * k * r) / SIN_PITCH;
  ctl.tz += dx * k * r + (-dy * k * r) / SIN_PITCH;
  ctl.tx = Math.max(-16, Math.min(16, ctl.tx));
  ctl.tz = Math.max(-16, Math.min(16, ctl.tz));
}
