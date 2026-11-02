import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { staticFace } from '../three/face';
import { CharName, charUrl, useGltf } from '../three/kit';
import { Canvas3D } from '../three/Canvas3D';
import type { MoveId } from './warmup';

// Движения разминки и поза «готово» в конце.
export type FigureMove = MoveId | 'cheer';

// Герой показывает движения разминки. Анимаций разминки у KayKit нет, поэтому, как в CameraGuide,
// позу собираем сами: каждую кость направляем в нужную сторону мира. Герой смотрит на +Z,
// o — сторона руки или ноги по X (+1 или −1), так одна формула годится для левой и правой.

type V = [number, number, number];
type Limb = [V, V]; // направления верхнего и нижнего звена

interface Pose {
  // Корпус: направление «таз → голова»; ноги после него снова ставятся как надо.
  torso: V;
  // Поворот плеч вокруг вертикали, рад.
  twist: number;
  arm: (o: number) => Limb;
  leg: (o: number) => Limb;
  // Подскок в долях роста.
  hop: number;
}

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mix = (a: V, b: V, k: number): V => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
// Направление в плоскости «вперёд-вверх»: 0° — вперёд, 90° — вверх, 270° — вниз.
const sag = (a: number, x = 0): V => [x, Math.sin(a * DEG), Math.cos(a * DEG)];
const UP: V = [0, 1, 0];
const standLeg = (o: number): Limb => [
  [o * 0.07, -1, 0],
  [o * 0.04, -1, 0],
];
const hangArm = (o: number): Limb => [
  [o * 0.25, -1, 0],
  [o * 0.15, -1, 0.1],
];

/** Поза движения в момент tm (секунды с начала движения). */
export function poseAt(id: FigureMove, tm: number): Pose {
  const base: Pose = { torso: UP, twist: 0, arm: hangArm, leg: standLeg, hop: 0 };
  switch (id) {
    case 'circles': {
      // Обе руки прямые, круг вперёд за 2 с: вниз → вперёд → вверх → назад.
      const a = 270 + (tm / 2) * 360;
      return { ...base, arm: (o) => [sag(a, o * 0.18), sag(a, o * 0.18)] };
    }
    case 'sideBend': {
      // Наклон к одной стороне, рука другой стороны над головой; смена каждые 2 с.
      const tx = Math.sin((tm / 4) * TAU);
      return {
        ...base,
        torso: [tx * 0.42, 1, 0],
        arm: (o) => {
          const up = smooth(clamp01(-tx * o * 1.3));
          return [mix([o * 0.25, -1, 0], [-o * 0.35, 1, 0], up), mix([o * 0.15, -1, 0.1], [-o * 0.95, 0.5, 0], up)];
        },
      };
    }
    case 'twist': {
      // Руки в стороны, плечи поворачиваются на 50° то вправо, то влево.
      return {
        ...base,
        twist: Math.sin((tm / 3) * TAU) * 50 * DEG,
        leg: (o) => [
          [o * 0.16, -1, 0],
          [o * 0.12, -1, 0],
        ],
        arm: (o) => [
          [o, 0.05, 0],
          [o, 0.05, 0],
        ],
      };
    }
    case 'hips': {
      // Руки на поясе, корпус описывает круг над тазом за 3 с.
      const a = (tm / 3) * TAU;
      return {
        ...base,
        torso: [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3],
        leg: (o) => [
          [o * 0.14, -1, 0],
          [o * 0.1, -1, 0],
        ],
        arm: (o) => [
          [o * 0.75, -0.65, -0.1],
          [-o * 0.7, -0.3, 0.35],
        ],
      };
    }
    case 'knees': {
      // Шаг на месте: колено к поясу, руки ходят навстречу.
      const s = Math.sin((tm / 1.3) * TAU);
      // Левая сторона (o = +1) поднимает колено на s > 0.
      const lift = (o: number) => Math.max(0, s * o);
      return {
        ...base,
        hop: Math.abs(s) * 0.02,
        leg: (o) => [sag(270 + lift(o) * 100, o * 0.08), sag(270 - lift(o) * 15, o * 0.05)],
        arm: (o) => {
          const swing = -s * o * 45;
          return [sag(270 + swing, o * 0.2), sag(270 + swing + 75, o * 0.12)];
        },
      };
    }
    case 'cheer': {
      // Конец разминки: руки вверх, лёгкое покачивание.
      const w = Math.sin((tm / 1.6) * TAU);
      return {
        ...base,
        torso: [w * 0.06, 1, 0],
        hop: Math.max(0, Math.sin((tm / 0.8) * TAU)) * 0.02,
        arm: (o) => [
          [o * 0.45, 1, 0.1],
          [o * (0.3 + w * o * 0.15), 1, 0.15],
        ],
      };
    }
    case 'jacks': {
      // Звёздочка: руки через стороны вверх, ноги врозь, мягкий подскок.
      const k = 0.5 - 0.5 * Math.cos((tm / 1.2) * TAU);
      const arm = lerp(-78, 72, k) * DEG;
      const leg = lerp(5, 19, k) * DEG;
      return {
        ...base,
        hop: Math.abs(Math.sin((tm / 1.2) * TAU)) * 0.05,
        arm: (o) => [
          [o * Math.cos(arm), Math.sin(arm), 0.04],
          [o * Math.cos(arm + 0.15), Math.sin(arm + 0.15), 0.04],
        ],
        leg: (o) => [
          [o * Math.sin(leg), -Math.cos(leg), 0],
          [o * Math.sin(leg * 0.8), -Math.cos(leg * 0.8), 0],
        ],
      };
    }
  }
}

const BONES = ['hips', 'spine', 'chest', 'head', 'upperarm.l', 'upperarm.r', 'lowerarm.l', 'lowerarm.r', 'wrist.l', 'wrist.r', 'upperleg.l', 'upperleg.r', 'lowerleg.l', 'lowerleg.r', 'foot.l', 'foot.r'] as const;
type BoneName = (typeof BONES)[number];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

const worldPos = (o: THREE.Object3D, out = new THREE.Vector3()) => o.getWorldPosition(out);

// Поворот кости в мировых осях: r применяется поверх текущего положения.
function rotateWorld(bone: THREE.Object3D, r: THREE.Quaternion) {
  bone.parent!.getWorldQuaternion(_p);
  _inv.copy(_p).invert();
  bone.quaternion.premultiply(_p).premultiply(r).premultiply(_inv);
  bone.updateMatrixWorld(true);
}

// Направить кость так, чтобы «кость → потомок» смотрело в want (в осях героя).
function aim(bone: THREE.Object3D, child: THREE.Object3D, want: V, frame: THREE.Quaternion) {
  const cur = worldPos(child, _a).sub(worldPos(bone, _b)).normalize();
  _w.set(...want).normalize().applyQuaternion(frame);
  rotateWorld(bone, _q.setFromUnitVectors(cur, _w));
}

const heightOf = (scene: THREE.Object3D) => new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y || 2;

function Athlete({ move, model, startAt, pausedAt }: { move: FigureMove; model: CharName; startAt: number; pausedAt?: number }) {
  const gltf = useGltf(charUrl(model));
  const rig = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as THREE.Group;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Без меча и щита: руки видно лучше.
      if (!(mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.visible = false;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    });
    // Рот и блики в глазах — пока голова родного размера (лицо меряется в позе «T»).
    staticFace(root, model);
    const bones = {} as Record<BoneName, THREE.Object3D>;
    // GLTFLoader убирает точки из имён узлов: upperarm.l → upperarml.
    for (const n of BONES) bones[n] = root.getObjectByName(n.replace('.', ''))!;
    // У героев KayKit большая голова: чуть уменьшаем, чтобы руки было видно.
    bones.head.scale.setScalar(0.8);
    const rest = new Map<THREE.Object3D, THREE.Quaternion>();
    root.traverse((o) => rest.set(o, o.quaternion.clone()));
    root.updateMatrixWorld(true);
    // С какой стороны по X у модели левая рука.
    const L = Math.sign(worldPos(bones['upperarm.l']).x - worldPos(bones['upperarm.r']).x) || 1;
    return { root, bones, rest, L, H: heightOf(root) };
  }, [gltf]);

  const holder = useRef<THREE.Group>(null);
  const frame = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const g = holder.current;
    if (!g) return;
    const { root, bones: b, rest, L, H } = rig;
    const pose = poseAt(move, Math.max(0, ((pausedAt ?? performance.now()) - startAt) / 1000));
    for (const [o, q] of rest) o.quaternion.copy(q);
    g.position.set(0, 0, 0);
    g.updateMatrixWorld(true);
    g.getWorldQuaternion(frame);

    aim(b.hips, b.head, pose.torso, frame);
    if (pose.twist) {
      // Поворот делят позвоночник и грудь: так он выглядит мягче.
      const axis = worldPos(b.head, _a).sub(worldPos(b.spine, _b)).normalize();
      rotateWorld(b.spine, _q.setFromAxisAngle(axis, pose.twist * 0.45));
      rotateWorld(b.chest, _q.setFromAxisAngle(axis, pose.twist * 0.55));
    }
    for (const [s, o] of [['l', L], ['r', -L]] as const) {
      const leg = pose.leg(o);
      aim(b[`upperleg.${s}`], b[`lowerleg.${s}`], leg[0], frame);
      aim(b[`lowerleg.${s}`], b[`foot.${s}`], leg[1], frame);
    }
    // Руки ставим в осях корпуса после поворота плеч: при скрутке они уходят вместе с грудью.
    const armFrame = pose.twist ? _p.setFromAxisAngle(Y, pose.twist).premultiply(frame) : frame;
    const af = armFrame.clone();
    for (const [s, o] of [['l', L], ['r', -L]] as const) {
      const arm = pose.arm(o);
      aim(b[`upperarm.${s}`], b[`lowerarm.${s}`], arm[0], af);
      aim(b[`lowerarm.${s}`], b[`wrist.${s}`], arm[1], af);
    }

    // Нижняя стопа — на пол.
    const foot = Math.min(worldPos(b['foot.l'], _a).y, worldPos(b['foot.r'], _b).y);
    g.position.set(0, H * (0.035 + pose.hop) - foot, 0);
    root.updateMatrixWorld(true);
  });

  return (
    <group ref={holder}>
      <primitive object={rig.root} />
    </group>
  );
}

function Cam({ model }: { model: CharName }) {
  const gltf = useGltf(charUrl(model));
  const H = useMemo(() => heightOf(gltf.scene), [gltf]);
  const { camera } = useThree();
  useEffect(() => {
    // Спереди и чуть сбоку: видно и круги руками, и наклоны в стороны.
    camera.position.set(H * 1.15, H * 0.8, H * 2.7);
    camera.lookAt(0, H * 0.4, 0);
  }, [camera, H]);
  return null;
}

/** 3D-герой, повторяющий движение разминки. startAt — performance.now() начала движения, pausedAt — момент паузы. */
export function WarmupFigure({ move, model, startAt, pausedAt }: { move: FigureMove; model: CharName; startAt: number; pausedAt?: number }) {
  return (
    <Canvas3D camera={{ fov: 30, near: 0.05, far: 60 }}>
      <hemisphereLight args={['#ffffff', '#30303c', 1.4]} />
      <directionalLight position={[4, 8, 5]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.3, 48]} />
        <meshStandardMaterial color="#2f3a52" />
      </mesh>
      <Suspense fallback={null}>
        <Cam model={model} />
        <Athlete move={move} model={model} startAt={startAt} pausedAt={pausedAt} />
      </Suspense>
    </Canvas3D>
  );
}
