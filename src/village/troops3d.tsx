import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Character, type CharacterProps, type CharAnim } from '../three/Character';
import { parseTint } from '../three/Instanced';
import { ANIMS_URL, CharName, charUrl, preloadGltf, useGltf } from '../three/kit';
import { GRID } from '../../shared/village';
import { SKILLS } from '../../shared/heroSkills';
import { DT, HEAL_RADIUS, rectDist, SimUnit, TPS, TroopId, UnitKind } from '../../shared/villageBattle';
import { faceTo, frameOf, TroopClip, troopPose, turnToward } from './troopPose';
import type { BattleView } from './Village3D';

// Отряды в бою — настоящие персонажи KayKit. Персонажей с костями на поле десятки, и у каждого
// свой AnimationMixer был бы слишком дорог для телефона. Поэтому при входе в бой каждое нужное
// движение каждого отряда «запекается» в несколько готовых поз (обычная геометрия), а в бою отряд
// просто рисуется нужной позой: одна InstancedMesh на позу, все воины в одной позе — один вызов
// отрисовки, никаких костей и микшеров в кадре. Героя один — он настоящий, с костями и микшером.

export interface TroopRig {
  model: CharName;
  // Какие предметы набора видны (остальное прячем).
  gear: string[];
  // Рост на поле (в клетках): так отряды различимы и крупнее настоящего масштаба — иначе их не видно на телефоне.
  height: number;
  tint?: string;
  // Мягкое свечение (целитель).
  glow?: string;
  // Летает: высота над землёй.
  fly?: number;
  clips: Partial<Record<TroopClip, string>>;
  // В какой доле движения удара оружие попадает.
  impact?: number;
  // Бомба в руке (подрывник).
  bomb?: boolean;
}

export const TROOP_RIGS: Record<TroopId, TroopRig> = {
  warrior: { model: 'Knight', gear: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'], height: 1.3, clips: { run: 'Running_A', attack: '1H_Melee_Attack_Chop', idle: 'Idle', death: 'Death_A' }, impact: 0.45 },
  archer: { model: 'Rogue', gear: ['1H_Crossbow', 'Rogue_Cape'], height: 1.25, tint: 'mul:0.9,1.1,0.85', clips: { run: 'Running_A', attack: '1H_Ranged_Shoot', idle: 'Idle', death: 'Death_A' }, impact: 0.3 },
  giant: { model: 'Barbarian', gear: ['2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'], height: 2.1, clips: { run: 'Walking_A', attack: '2H_Melee_Attack_Chop', idle: 'Idle', death: 'Death_A' }, impact: 0.5 },
  wallbreaker: { model: 'Skeleton_Minion', gear: [], height: 1.05, bomb: true, clips: { run: 'Running_A', attack: '1H_Melee_Attack_Chop', idle: 'Idle', death: 'Death_A' }, impact: 0.42 },
  healer: { model: 'Mage', gear: ['2H_Staff', 'Mage_Cape'], height: 1.3, tint: 'mul:1.15,1.12,1.05', glow: '#8affc1', fly: 0.85, clips: { idle: 'Idle', cast: 'Spellcasting', death: 'Death_A' } },
};
/**
 * Как меняется отряд с уровнем из лаборатории: 1–2 — как есть, 3–5 — стальной отлив, 6–7 — золото,
 * 8 — золото и мягкое свечение. Видно и в бою, и в карточках.
 */
export function levelLook(level: number | undefined): { tint?: string; glow?: string } {
  const l = level ?? 1;
  if (l >= 8) return { tint: 'mul:1.22,1.05,0.68', glow: '#ffcc66' };
  if (l >= 6) return { tint: 'mul:1.2,1.05,0.72' };
  if (l >= 3) return { tint: 'mul:0.9,0.97,1.12' };
  return {};
}

/** Покраска материала отряда: свой оттенок, оттенок уровня и свечение. */
export function paintTroop(m: THREE.MeshStandardMaterial, rig: TroopRig, level?: number) {
  const look = levelLook(level);
  if (!m.color) return;
  m.color.multiply(parseTint(rig.tint));
  if (look.tint) m.color.multiply(parseTint(look.tint));
  const glow = rig.glow ?? look.glow;
  if (glow && m.emissive) {
    m.emissive.set(glow);
    m.emissiveIntensity = 0.22;
  }
}

const LOOPS: Record<TroopClip, boolean> = { run: true, idle: true, cast: true, attack: false, death: false };
// Кадров в секунду движения при запекании: в экономном режиме меньше (меньше памяти и подготовки).
const BAKE_FPS = { full: 12, lite: 8 };
// Покой почти неподвижен: ему хватит и реже.
const IDLE_FPS = 6;
// Бег по кругу: сколько клеток проходит отряд за один круг движения бега.
const STRIDE = 1.35;

/** Модели отрядов — заранее, пока игрок выбирает лагерь: бой откроется уже с ними. */
export function preloadTroops() {
  preloadGltf(ANIMS_URL);
  for (const r of Object.values(TROOP_RIGS)) preloadGltf(charUrl(r.model));
}

export interface BakedClip {
  dur: number;
  frames: THREE.BufferGeometry[];
}
export interface BakedTroop {
  clips: Partial<Record<TroopClip, BakedClip>>;
  materials: THREE.Material[];
  // Масштаб модели до роста rig.height.
  scale: number;
  // Высота макушки на поле (с полётом) — над ней полоска здоровья.
  top: number;
  verts: number;
}

interface Part {
  mesh: THREE.Mesh;
  skinned: boolean;
  mat: number;
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  index: ArrayLike<number>;
  si?: Float32Array;
  sw?: Float32Array;
}

function readAttr(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined, n: number, size: number): Float32Array {
  const out = new Float32Array(n * size);
  if (!a) return out;
  for (let i = 0; i < n; i++) {
    out[i * size] = a.getX(i);
    if (size > 1) out[i * size + 1] = a.getY(i);
    if (size > 2) out[i * size + 2] = a.getZ(i);
    if (size > 3) out[i * size + 3] = a.getW(i);
  }
  return out;
}

export function bombGroup(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9), new THREE.MeshStandardMaterial({ color: '#2a2c35', roughness: 0.45, metalness: 0.2 }));
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: '#ffb347' }));
  body.name = 'bomb';
  fuse.name = 'bomb_fuse';
  g.add(body, fuse);
  g.position.set(0, 0.15, 0.35);
  return g;
}

/** Запекает движения отряда в готовые позы. */
export function bakeTroop(rig: TroopRig, char: THREE.Object3D, animations: THREE.AnimationClip[], lite: boolean, level?: number): BakedTroop {
  const steps = bakeSteps(rig, char, animations, lite, level);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * То же по шагам: после каждой позы можно отдать кадр. Бой открывается сразу, а позы готовятся
 * понемногу, пока игрок осматривает базу, — без замирания экрана на запекании.
 */
export function* bakeSteps(rig: TroopRig, char: THREE.Object3D, animations: THREE.AnimationClip[], lite: boolean, level?: number): Generator<void, BakedTroop> {
  const root = cloneSkinned(char) as THREE.Group;
  if (rig.bomb) {
    const hand = root.getObjectByName('handslotr');
    hand?.add(bombGroup());
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const materials: THREE.Material[] = [];
  const matIndex = new Map<THREE.Material, number>();
  const parts: Part[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const skinned = !!(mesh as THREE.SkinnedMesh).isSkinnedMesh;
    const isBomb = mesh.name.startsWith('bomb');
    if (!skinned && !isBomb && !rig.gear.includes(mesh.name)) return;
    const src = mesh.material as THREE.Material;
    let k = matIndex.get(src);
    if (k == null) {
      k = materials.length;
      matIndex.set(src, k);
      const m = src.clone() as THREE.MeshStandardMaterial;
      if (!isBomb) paintTroop(m, rig, level);
      materials.push(m);
    }
    const g = mesh.geometry;
    const n = g.attributes.position.count;
    const index = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
    parts.push({
      mesh,
      skinned,
      mat: k,
      pos: readAttr(g.attributes.position as THREE.BufferAttribute, n, 3),
      nrm: readAttr(g.attributes.normal as THREE.BufferAttribute, n, 3),
      uv: readAttr(g.attributes.uv as THREE.BufferAttribute, n, 2),
      index,
      si: skinned ? readAttr(g.attributes.skinIndex as THREE.BufferAttribute, n, 4) : undefined,
      sw: skinned ? readAttr(g.attributes.skinWeight as THREE.BufferAttribute, n, 4) : undefined,
    });
  });
  parts.sort((a, b) => a.mat - b.mat);
  // Общие для всех поз: порядок вершин, развёртка, группы материалов.
  let verts = 0;
  let tris = 0;
  for (const p of parts) {
    verts += p.pos.length / 3;
    tris += p.index.length;
  }
  const index = verts > 65535 ? new Uint32Array(tris) : new Uint16Array(tris);
  const uv = new Float32Array(verts * 2);
  const groups: { start: number; count: number; mat: number }[] = [];
  {
    let vo = 0;
    let io = 0;
    for (const p of parts) {
      for (let i = 0; i < p.index.length; i++) index[io + i] = p.index[i] + vo;
      uv.set(p.uv, vo * 2);
      const last = groups[groups.length - 1];
      if (last && last.mat === p.mat) last.count += p.index.length;
      else groups.push({ start: io, count: p.index.length, mat: p.mat });
      vo += p.pos.length / 3;
      io += p.index.length;
    }
  }
  const indexAttr = new THREE.BufferAttribute(index, 1);
  const uvAttr = new THREE.BufferAttribute(uv, 2);

  const mixer = new THREE.AnimationMixer(root);
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const pose = (): THREE.BufferGeometry => {
    root.updateMatrixWorld(true);
    const pos = new Float32Array(verts * 3);
    const nrm = new Int8Array(verts * 3);
    let vo = 0;
    for (const p of parts) {
      const nv = p.pos.length / 3;
      // Матрица каждой кости сразу со всеми преобразованиями меша: вершина = Σ w·C[кость]·v.
      let C: Float32Array;
      if (p.skinned) {
        const sm = p.mesh as THREE.SkinnedMesh;
        const bones = sm.skeleton.bones;
        C = new Float32Array(bones.length * 16);
        const left = new THREE.Matrix4().multiplyMatrices(sm.matrixWorld, sm.bindMatrixInverse);
        bones.forEach((b, i) => {
          tmp.multiplyMatrices(b.matrixWorld, sm.skeleton.boneInverses[i]);
          m4.multiplyMatrices(left, tmp).multiply(sm.bindMatrix);
          C.set(m4.elements, i * 16);
        });
      } else C = new Float32Array(p.mesh.matrixWorld.elements);
      const e = new Float32Array(16);
      for (let v = 0; v < nv; v++) {
        if (p.skinned) {
          e.fill(0);
          for (let k = 0; k < 4; k++) {
            const w = p.sw![v * 4 + k];
            if (!w) continue;
            const o = p.si![v * 4 + k] * 16;
            for (let j = 0; j < 16; j++) e[j] += w * C[o + j];
          }
        } else e.set(C);
        const x = p.pos[v * 3];
        const y = p.pos[v * 3 + 1];
        const z = p.pos[v * 3 + 2];
        const w3 = (vo + v) * 3;
        pos[w3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[w3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[w3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = p.nrm[v * 3];
        const ny = p.nrm[v * 3 + 1];
        const nz = p.nrm[v * 3 + 2];
        let ox = e[0] * nx + e[4] * ny + e[8] * nz;
        let oy = e[1] * nx + e[5] * ny + e[9] * nz;
        let oz = e[2] * nx + e[6] * ny + e[10] * nz;
        const l = Math.hypot(ox, oy, oz) || 1;
        ox /= l;
        oy /= l;
        oz /= l;
        nrm[w3] = Math.round(ox * 127);
        nrm[w3 + 1] = Math.round(oy * 127);
        nrm[w3 + 2] = Math.round(oz * 127);
      }
      vo += nv;
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(indexAttr);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    g.setAttribute('uv', uvAttr);
    for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat);
    return g;
  };

  const clips: BakedTroop['clips'] = {};
  const fps = lite ? BAKE_FPS.lite : BAKE_FPS.full;
  for (const [key, name] of Object.entries(rig.clips) as [TroopClip, string][]) {
    const clip = animations.find((a) => a.name === name);
    if (!clip) continue;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(LOOPS[key] ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.play();
    const dur = clip.duration;
    const n = Math.max(2, Math.round(dur * (key === 'idle' ? Math.min(fps, IDLE_FPS) : fps)));
    const frames: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      // По кругу — равные доли без последнего кадра (он совпадает с первым); разовое — до конца.
      const t = LOOPS[key] ? (i / n) * dur : (i / (n - 1)) * dur * 0.999;
      mixer.setTime(t);
      frames.push(pose());
      yield;
    }
    clips[key] = { dur, frames };
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  // Рост по позе покоя.
  const idle = clips.idle?.frames[0];
  idle?.computeBoundingBox();
  if (idle?.boundingBox) box.copy(idle.boundingBox);
  const h = Math.max(0.5, box.max.y - Math.min(0, box.min.y));
  const scale = rig.height / h;
  return { clips, materials, scale, top: rig.height + (rig.fly ?? 0), verts };
}

export function disposeBaked(b: BakedTroop) {
  for (const c of Object.values(b.clips)) for (const g of c!.frames) g.dispose();
  for (const m of b.materials) m.dispose();
}

const W = (c: number) => c - GRID / 2;

// Что помним о каждом отряде между кадрами: поворот, бег, вспышка, когда погиб.
interface Vis {
  face: number;
  run: number;
  hp: number;
  flashAt: number;
  deadAt: number;
  x: number;
  z: number;
}

// Сколько стоит кадр отрядов на процессоре (мс, скользящее среднее): для замеров (window.__troopFrameMs).
const frameCost = {
  avg: 0,
  note(ms: number) {
    this.avg = this.avg * 0.95 + ms * 0.05;
    (window as unknown as { __troopFrameMs?: number }).__troopFrameMs = Math.round(this.avg * 100) / 100;
  },
};

const FLASH_MS = 260;
const DEATH_HOLD = 0.9;
const DEATH_SINK = 0.9;

/** Позиция отряда между тиками боя. */
export function lerpUnit(v: BattleView, u: SimUnit, a: number): [number, number] {
  const prev = v.prev.get(u.n) ?? [u.x, u.y];
  return [prev[0] + (u.x - prev[0]) * a, prev[1] + (u.y - prev[1]) * a];
}

/** Время боя (с) в этом кадре: тик плюс доля до следующего. */
export function simTime(v: BattleView, now: number): { a: number; t: number } {
  const a = Math.min(1, Math.max(0, (now - v.at) / v.ms));
  return { a, t: Math.max(0, (v.s.tick - 1 + a) * DT) };
}

function healingNow(v: BattleView, u: SimUnit): boolean {
  for (const o of v.s.units) if (o.alive && o.def.prefer !== 'heal' && o.hp < o.maxHp && (o.x - u.x) ** 2 + (o.y - u.y) ** 2 <= HEAL_RADIUS * HEAL_RADIUS) return true;
  return false;
}

/** Подрывник: сколько секунд боя ему бежать до цели (до взрыва). */
function blastIn(v: BattleView, u: SimUnit, x: number, y: number): number | undefined {
  const b = v.s.buildings[u.block >= 0 ? u.block : u.target];
  if (!b || !b.alive) return undefined;
  return Math.max(0, rectDist(b, x, y) - u.def.range) / u.def.speed;
}

interface Pool {
  id: TroopId;
  baked: BakedTroop;
  // По позе на каждый кадр каждого движения.
  meshes: Map<string, THREE.InstancedMesh>;
  list: THREE.InstancedMesh[];
}

// Сколько миллисекунд кадра можно отдать подготовке поз и сколько новых поз за кадр показывать видеокарте.
const BAKE_BUDGET_MS = 6;
const WARM_PER_FRAME = 10;

/** Готовит пул поз отряда: InstancedMesh на каждый кадр каждого движения. */
function makePool(id: TroopId, baked: BakedTroop, cap: number): Pool {
  const meshes = new Map<string, THREE.InstancedMesh>();
  const list: THREE.InstancedMesh[] = [];
  for (const [clip, c] of Object.entries(baked.clips) as [TroopClip, BakedClip][]) {
    c.frames.forEach((g, i) => {
      const m = new THREE.InstancedMesh(g, baked.materials.length > 1 ? baked.materials : baked.materials[0], cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.count = 0;
      m.visible = false;
      m.castShadow = true;
      m.frustumCulled = false;
      meshes.set(`${clip}${i}`, m);
      list.push(m);
    });
  }
  return { id, baked, meshes, list };
}

/**
 * Обычные отряды: запечённые позы инстансами.
 *
 * «Рывок на старте» был отсюда: при входе в бой все позы всех отрядов запекались разом (сотни мс),
 * а при первой высадке видеокарта впервые получала десятки новых поз и собирала для них шейдеры.
 * Теперь позы запекаются по кусочку в каждом кадре (не дольше BAKE_BUDGET_MS), а готовые сразу
 * «прогреваются»: показываются видеокарте пустыми (0 экземпляров) — шейдер собран, геометрия
 * загружена, и первая высадка уже ничего не ждёт.
 */
export function Troops({ view, ids, lv, lite }: { view: React.MutableRefObject<BattleView | null>; ids: Partial<Record<TroopId, number>>; lv?: Partial<Record<TroopId, number>>; lite: boolean }) {
  const anims = useGltf(ANIMS_URL);
  const knight = useGltf(charUrl('Knight'));
  const rogue = useGltf(charUrl('Rogue'));
  const barb = useGltf(charUrl('Barbarian'));
  const minion = useGltf(charUrl('Skeleton_Minion'));
  const mage = useGltf(charUrl('Mage'));
  const group = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const key = (Object.keys(TROOP_RIGS) as TroopId[]).map((id) => `${id}:${ids[id] ?? 0}:${lv?.[id] ?? 1}`).join(',');
  // Пулы появляются по мере готовности; job — оставшаяся подготовка, warm — позы, которые видеокарта ещё не видела.
  const prep = useMemo(() => {
    const scenes: Partial<Record<CharName, THREE.Object3D>> = { Knight: knight.scene, Rogue: rogue.scene, Barbarian: barb.scene, Skeleton_Minion: minion.scene, Mage: mage.scene };
    const pools: Pool[] = [];
    const byId = new Map<TroopId, Pool>();
    const warm: THREE.InstancedMesh[] = [];
    const todo = (Object.keys(TROOP_RIGS) as TroopId[]).filter((id) => Math.min(140, ids[id] ?? 0) > 0);
    function* job(): Generator<void, void> {
      for (const id of todo) {
        const rig = TROOP_RIGS[id];
        const baked: BakedTroop = yield* bakeSteps(rig, scenes[rig.model]!, anims.animations, lite, lv?.[id]);
        const pool = makePool(id, baked, Math.min(140, ids[id] ?? 0));
        pools.push(pool);
        byId.set(id, pool);
      }
    }
    return { pools, byId, warm, job: job(), spent: 0, added: 0, done: !todo.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lite, anims, knight, rogue, barb, minion, mage]);
  useEffect(
    () => () => {
      for (const p of prep.pools) {
        for (const m of p.list) {
          m.removeFromParent();
          m.dispose();
        }
        disposeBaked(p.baked);
      }
    },
    [prep],
  );
  const { pools, byId } = prep;

  const vis = useRef(new Map<number, Vis>());

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() }), []);
  const last = useRef(performance.now());
  useFrame(() => {
    const now = performance.now();
    if (!prep.done) {
      // Запекаем, пока не вышло время кадра. Если отряд уже высажен, а его позы не готовы, — доделываем
      // сразу (так бывает, только если высадить в первую секунду боя).
      const v0 = view.current;
      const urgent = !!v0 && v0.s.units.some((u) => u.u !== 'hero' && !prep.byId.has(u.u as TroopId));
      while (urgent || performance.now() - now < BAKE_BUDGET_MS) {
        if (prep.job.next().done) {
          prep.done = true;
          break;
        }
        if (urgent && !v0!.s.units.some((u) => u.u !== 'hero' && !prep.byId.has(u.u as TroopId))) break;
      }
      prep.spent += performance.now() - now;
      // Сколько всего ушло на запекание (для замеров).
      if (prep.done) (window as unknown as { __troopBakeMs?: number }).__troopBakeMs = Math.round(prep.spent);
    }
    for (; prep.added < pools.length && group.current; prep.added++) {
      const pool = pools[prep.added];
      for (const m of pool.list) group.current.add(m);
      // Шейдер отряда собираем в фоне (где браузер умеет — параллельно), потом показываем позы видеокарте.
      const first = pool.list[0];
      first.visible = true;
      const ready = () => prep.warm.push(...pool.list);
      gl.compileAsync(first, camera, scene).then(ready, ready);
      first.visible = false;
    }
    const v = view.current;
    const dt = Math.min(0.1, (now - last.current) / 1000);
    last.current = now;
    for (const p of pools) for (const m of p.list) m.count = 0;
    if (!v) return;
    const { a, t } = simTime(v, now);
    const speed = 100 / v.ms;
    for (const u of v.s.units) {
      if (u.u === 'hero') continue;
      const pool = byId.get(u.u);
      if (!pool) continue;
      let o = vis.current.get(u.n);
      const [x, y] = lerpUnit(v, u, a);
      if (!o) {
        o = { face: faceTo(GRID / 2 - x, GRID / 2 - y), run: u.n * 0.37, hp: u.hp, flashAt: -1e9, deadAt: -1, x, z: y };
        vis.current.set(u.n, o);
      }
      if (!u.alive && o.deadAt < 0) o.deadAt = now;
      // Подрывник взрывается вместе со стеной — тела нет.
      if (!u.alive && (u.def.splash || now - o.deadAt > (DEATH_HOLD + DEATH_SINK) * 1000)) continue;
      if (u.hp < o.hp - 0.01) o.flashAt = now;
      o.hp = u.hp;
      const dx = x - o.x;
      const dz = y - o.z;
      const moved = Math.hypot(dx, dz);
      o.x = x;
      o.z = y;
      const prev = v.prev.get(u.n);
      const moving = u.alive && !!prev && (Math.abs(prev[0] - u.x) > 1e-4 || Math.abs(prev[1] - u.y) > 1e-4) && !(v.s.done);
      o.run += moved / STRIDE;
      // Куда смотрит: по ходу, а у цели — на неё.
      let fx = 0;
      let fz = 0;
      if (moving && moved > 1e-5) {
        fx = dx;
        fz = dz;
      } else if (u.def.prefer === 'heal' && u.target >= 0) {
        const tu = v.s.units[u.target];
        if (tu) {
          fx = tu.x - u.x;
          fz = tu.y - u.y;
        }
      } else {
        const b = v.s.buildings[u.block >= 0 ? u.block : u.target];
        if (b) {
          fx = b.x + b.size / 2 - u.x;
          fz = b.y + b.size / 2 - u.y;
        }
      }
      if (u.alive && (fx || fz)) o.face = turnToward(o.face, faceTo(fx, fz), dt * 10 * speed);
      const healer = u.def.prefer === 'heal';
      const pose = troopPose({
        alive: u.alive,
        moving: moving && !healer,
        sinceHit: (t - u.hit * DT),
        every: u.def.splash ? 0 : u.def.every,
        attackDur: pool.baked.clips.attack?.dur ?? 0,
        impact: (pool.baked.clips.attack?.dur ?? 0) * (TROOP_RIGS[u.u as TroopId].impact ?? 0.4),
        healing: healer && u.alive && healingNow(v, u),
        blastIn: u.def.splash && u.alive ? blastIn(v, u, x, y) : undefined,
        deadFor: o.deadAt >= 0 ? (now - o.deadAt) / 1000 : 0,
        clock: healer ? t + u.n * 0.21 : moving ? o.run * (pool.baked.clips.run?.dur ?? 1) : t + u.n * 0.29,
      });
      const clip = pool.baked.clips[pose.clip] ?? pool.baked.clips.idle;
      if (!clip) continue;
      const clipName = pool.baked.clips[pose.clip] ? pose.clip : 'idle';
      const f = frameOf(pose.t, clip.dur, clip.frames.length, LOOPS[clipName]);
      const mesh = pool.meshes.get(`${clipName}${f}`);
      if (!mesh || mesh.count >= (mesh.instanceMatrix.count ?? 0)) continue;
      // Полёт целителя: покачивание и наклон вперёд на ходу.
      const fly = TROOP_RIGS[u.u as TroopId].fly ?? 0;
      let h = fly ? fly + 0.12 * Math.sin(now / 320 + u.n) : 0;
      let sc = pool.baked.scale;
      if (!u.alive) {
        const dead = (now - o.deadAt) / 1000;
        if (fly) h = Math.max(0, fly * (1 - dead / 0.5));
        // Тело опускается в землю и уменьшается — как растворяется.
        const sink = Math.max(0, (dead - DEATH_HOLD) / DEATH_SINK);
        h -= sink * 0.5;
        sc *= 1 - 0.5 * sink;
      }
      tmp.e.set(fly && moving ? 0.25 : 0, o.face, 0);
      tmp.q.setFromEuler(tmp.e);
      tmp.m.compose(tmp.p.set(W(x), h, W(y)), tmp.q, tmp.s.setScalar(sc));
      const k = mesh.count++;
      mesh.setMatrixAt(k, tmp.m);
      // Вспышка от попадания: краснеет и светлеет.
      const fl = Math.max(0, 1 - (now - o.flashAt) / FLASH_MS);
      tmp.c.setRGB(1 + 0.7 * fl, 1 - 0.3 * fl, 1 - 0.3 * fl);
      mesh.setColorAt(k, tmp.c);
    }
    for (const p of pools)
      for (const m of p.list) {
        m.visible = m.count > 0;
        if (m.visible) {
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
      }
    // Прогрев: несколько новых поз показываем пустыми — шейдер и геометрия будут готовы до первой встречи.
    for (const m of prep.warm.splice(0, WARM_PER_FRAME)) m.visible = true;
    frameCost.note(performance.now() - now);
  });

  return <group ref={group} />;
}

export type HeroLook = Pick<CharacterProps, 'model' | 'tint' | 'glow' | 'hands'>;
export const HERO_HEIGHT = 1.6;
// Герой без своего снаряжения (повтор чужого набега).
export const DEFAULT_HERO: HeroLook = { model: 'Knight', glow: '#ff8a5c', tint: 'mul:0.95,0.85,0.8' };

// Герой защитника у чужой деревни: кто он, нападающий не знает — варвар в красном.
export const KEEPER_FOE: HeroLook = { model: 'Barbarian', glow: '#ff4d6a', tint: 'mul:1,0.78,0.78' };

/**
 * Герой: настоящий персонаж с костями, в своём снаряжении. keeper — герой защитника: он стоит у ратуши
 * и бьётся с отрядами (кольцо под ним красное у чужого, голубое у своего).
 */
export function HeroTroop({ view, look, keeper, foe }: { view: React.MutableRefObject<BattleView | null>; look: HeroLook; keeper?: boolean; foe?: boolean }) {
  const g = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [anim, setAnim] = useState<CharAnim>('idle');
  const [pulse, setPulse] = useState(0);
  const [hit, setHit] = useState(0);
  const st = useRef({ hit: -100, hp: -1, face: 0, gone: 0, flashAt: 0, deadAt: -1, warm: 0 });
  // Масштаб до роста HERO_HEIGHT по модели героя.
  const model = useGltf(charUrl(look.model));
  const scale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model.scene);
    return HERO_HEIGHT / Math.max(0.5, box.max.y - Math.min(0, box.min.y));
  }, [model]);
  useFrame((_, dt) => {
    const v = view.current;
    const u = keeper ? (v?.s.keeper ?? undefined) : v?.s.units.find((w) => w.u === 'hero');
    if (!g.current) return;
    const o = st.current;
    if (!v || !u) {
      // Пока героя не высадили — первые кадры рисуем его под землёй: шейдер с костями собран заранее.
      const w = o.warm++ < 20;
      g.current.visible = w;
      if (w) g.current.position.set(0, -30, 0);
      return;
    }
    const now = performance.now();
    const { a } = simTime(v, now);
    const [x, y] = lerpUnit(v, u, a);
    if (o.hp < 0) o.face = keeper ? faceTo(0, 1) : faceTo(GRID / 2 - x, GRID / 2 - y);
    const prev = v.prev.get(u.n);
    const moving = u.alive && !!prev && (Math.abs(prev[0] - u.x) > 1e-4 || Math.abs(prev[1] - u.y) > 1e-4) && !v.s.done;
    let fx = 0;
    let fz = 0;
    if (moving && prev) {
      fx = u.x - prev[0];
      fz = u.y - prev[1];
    } else if (keeper) {
      const t = u.target >= 0 ? v.s.units[u.target] : undefined;
      if (t) {
        fx = t.x - u.x;
        fz = t.y - u.y;
      }
    } else {
      const b = v.s.buildings[u.block >= 0 ? u.block : u.target];
      if (b) {
        fx = b.x + b.size / 2 - u.x;
        fz = b.y + b.size / 2 - u.y;
      }
    }
    if (u.alive && (fx || fz)) o.face = turnToward(o.face, faceTo(fx, fz), dt * 10 * (100 / v.ms));
    const next: CharAnim = !u.alive ? 'death' : moving ? 'run' : 'idle';
    if (next !== anim) setAnim(next);
    if (u.alive && u.hit !== o.hit && u.hit >= 0 && v.s.tick - u.hit < TPS) {
      o.hit = u.hit;
      setPulse((p) => p + 1);
    }
    if (o.hp >= 0 && u.hp < o.hp - 0.01 && now - o.flashAt > 250) {
      o.flashAt = now;
      setHit((h) => h + 1);
    }
    o.hp = u.hp;
    if (!u.alive && o.deadAt < 0) o.deadAt = now;
    const dead = o.deadAt >= 0 ? (now - o.deadAt) / 1000 : 0;
    const sink = Math.max(0, (dead - 1.6) / 1);
    g.current.visible = sink < 1;
    g.current.position.set(W(x), -sink * 0.6, W(y));
    g.current.rotation.y = o.face;
    if (ring.current) {
      ring.current.visible = u.alive;
      ring.current.rotation.z = now / 900;
    }
  });
  return (
    <group ref={g} visible={false}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} renderOrder={2}>
        <ringGeometry args={[0.42, 0.52, 6]} />
        <meshBasicMaterial color={keeper ? (foe ? '#ff4d6a' : '#7fd8ff') : '#ffd27a'} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <Character {...look} anim={anim} pulse={pulse} pulseAnim="attack" hit={hit} scale={scale} />
    </group>
  );
}

/** Сияние под целителями и круг лечения, пока он лечит. */
export function HealerAuras({ view }: { view: React.MutableRefObject<BattleView | null> }) {
  const mesh = useMemo(() => {
    const geo = new THREE.RingGeometry(0.75, 1, 32);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#8affc1', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }), 32);
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 2;
    return m;
  }, []);
  useEffect(() => () => mesh.dispose(), [mesh]);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const v = view.current;
    let n = 0;
    if (v) {
      const now = performance.now();
      const { a } = simTime(v, now);
      for (const u of v.s.units) {
        if (!u.alive || u.def.prefer !== 'heal' || n >= 31) continue;
        const [x, y] = lerpUnit(v, u, a);
        // Пятно света под ним всегда, круг радиуса лечения — пока рядом раненые.
        mat.makeScale(0.55, 1, 0.55).setPosition(W(x), 0.05, W(y));
        mesh.setMatrixAt(n++, mat);
        if (healingNow(v, u)) {
          const r = HEAL_RADIUS * (0.85 + 0.15 * Math.sin(now / 260 + u.n));
          mat.makeScale(r, 1, r).setPosition(W(x), 0.05, W(y));
          mesh.setMatrixAt(n++, mat);
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

/** Кольца под отрядами, на которых действует умение героя: ярость и клич — тёплые, щит — синий. */
export function SkillAuras({ view }: { view: React.MutableRefObject<BattleView | null> }) {
  const MAX = 64;
  const mesh = useMemo(() => {
    const geo = new THREE.RingGeometry(0.5, 0.68, 28);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }), MAX);
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 2;
    m.setColorAt(0, new THREE.Color('#ffffff'));
    return m;
  }, []);
  useEffect(() => () => mesh.dispose(), [mesh]);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const v = view.current;
    let n = 0;
    if (v) {
      const now = performance.now();
      const { a } = simTime(v, now);
      const tick = v.s.tick;
      for (const u of v.s.units) {
        if (!u.alive || n >= MAX - 1) continue;
        const buffs: string[] = [];
        if (u.rage > tick) buffs.push(SKILLS.rage.color);
        else if (u.cry > tick) buffs.push(SKILLS.cry.color);
        if (u.guard > tick) buffs.push(SKILLS.guard.color);
        if (!buffs.length) continue;
        const [x, y] = lerpUnit(v, u, a);
        buffs.forEach((c, k) => {
          const r = (u.u === 'giant' || u.u === 'hero' ? 1.3 : 1) * (1 + 0.3 * k) * (0.92 + 0.08 * Math.sin(now / 140 + u.n));
          mat.makeScale(r, 1, r).setPosition(W(x), 0.06 + 0.02 * k, W(y));
          mesh.setMatrixAt(n, mat);
          mesh.setColorAt(n++, col.set(c));
        });
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

const BAR_MAX = 160;
const BAR_W: Partial<Record<UnitKind, number>> = { giant: 1.2, hero: 1.25, healer: 0.95, wallbreaker: 0.75 };
const TOPS: Record<UnitKind, number> = {
  ...(Object.fromEntries(Object.entries(TROOP_RIGS).map(([id, r]) => [id, r.height + (r.fly ?? 0)])) as Record<TroopId, number>),
  hero: HERO_HEIGHT,
};
export const BAR_COLORS = { ours: '#6ee7b7', foe: '#ff6b81', hero: '#ffd27a' };

/**
 * Полоски здоровья над отрядами: всегда смотрят в камеру. У целых отрядов не видно (меньше пестроты),
 * у героя — всегда. Цвет — по стороне: свои зелёные, чужие (в повторе набега на тебя) красные, герой золотой.
 */
export function UnitBars({ view, foe }: { view: React.MutableRefObject<BattleView | null>; foe: boolean }) {
  const camera = useThree((s) => s.camera);
  const { back, fill } = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    const mk = (opacity: number) => {
      const m = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ transparent: true, opacity, depthTest: false, depthWrite: false }), BAR_MAX);
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, new THREE.Color());
      return m;
    };
    const back = mk(0.82);
    const fill = mk(1);
    back.renderOrder = 8;
    fill.renderOrder = 9;
    return { back, fill };
  }, []);
  useEffect(
    () => () => {
      back.geometry.dispose();
      back.dispose();
      fill.dispose();
    },
    [back, fill],
  );
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3(), r: new THREE.Vector3(), c: new THREE.Color(), dark: new THREE.Color('#151722') }), []);
  useFrame(() => {
    const v = view.current;
    let n = 0;
    if (v) {
      const q = camera.quaternion;
      tmp.r.set(1, 0, 0).applyQuaternion(q);
      const { a } = simTime(v, performance.now());
      const list = v.s.keeper ? [...v.s.units, v.s.keeper] : v.s.units;
      for (const u of list) {
        if (!u.alive || n >= BAR_MAX) continue;
        const hero = u.u === 'hero';
        const keeper = u.n < 0;
        const f = Math.max(0, Math.min(1, u.hp / u.maxHp));
        if (!hero && f >= 0.999) continue;
        const [x, y] = lerpUnit(v, u, a);
        const w = BAR_W[u.u] ?? 0.85;
        const h = TOPS[u.u] + 0.28 + (u.def.flying ? 0.12 * Math.sin(performance.now() / 320 + u.n) : 0);
        tmp.p.set(W(x), h, W(y));
        tmp.m.compose(tmp.p, q, tmp.s.set(w + 0.1, hero ? 0.24 : 0.19, 1));
        back.setMatrixAt(n, tmp.m);
        back.setColorAt(n, tmp.dark);
        // Заполнение прижато к левому краю.
        tmp.p.addScaledVector(tmp.r, -(w * (1 - f)) / 2);
        tmp.m.compose(tmp.p, q, tmp.s.set(Math.max(0.001, w * f), hero ? 0.15 : 0.11, 1));
        fill.setMatrixAt(n, tmp.m);
        // Герой защитника — на другой стороне: в набеге он чужой, в повторе набега на тебя — свой.
        tmp.c.set(keeper ? (foe ? BAR_COLORS.ours : BAR_COLORS.foe) : hero ? BAR_COLORS.hero : foe ? BAR_COLORS.foe : f > 0.3 ? BAR_COLORS.ours : '#ffd27a');
        fill.setColorAt(n, tmp.c);
        n++;
      }
    }
    back.count = fill.count = n;
    back.instanceMatrix.needsUpdate = fill.instanceMatrix.needsUpdate = true;
    if (back.instanceColor) back.instanceColor.needsUpdate = true;
    if (fill.instanceColor) fill.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <primitive object={back} />
      <primitive object={fill} />
    </>
  );
}
