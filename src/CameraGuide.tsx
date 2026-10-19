import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Exercise } from './repCounter';
import { CharName, charUrl, useGltf } from './three/kit';

// Схема «как встать к камере» в 3D: герой повторяет упражнение, рядом стоит телефон
// с тем же полем зрения, что у настоящей камеры. Анимаций упражнений у KayKit нет,
// поэтому позы собираем сами: каждую кость направляем в нужную сторону.

// Углы сегментов в плоскости движения, в градусах: 0 — вперёд (+Z), 90 — вверх.
interface Pose {
  torso: number;
  thigh: number;
  shin: number;
  // Руки: углы плеча и предплечья, либо точка опоры ладони (z, y) в долях роста.
  arm?: [number, number];
  // Планка: torso — высота плеч в долях длины руки, тело прямое, ладони под плечами.
  plank?: boolean;
}

interface Spec {
  poses: [Pose, Pose];
  // Где стоят стопы (z в долях роста) и сколько длится повтор.
  ankleZ: number;
  period: number;
  // Телефон: высота над полом в долях роста, лёжа ли на боку (альбомная ориентация).
  phoneY: number;
  landscape: boolean;
  // Куда смотрит поле зрения (центр кадра).
  aim: [number, number, number];
}

const SPECS: Record<Exercise, Spec> = {
  pushup: {
    poses: [
      // Угол корпуса подбирается под длину рук (см. plank), руки упираются под плечами.
      { torso: 0.95, thigh: 0, shin: 0, plank: true },
      { torso: 0.45, thigh: 0, shin: 0, plank: true },
    ],
    ankleZ: -0.45,
    period: 1.7,
    phoneY: 0,
    landscape: true,
    aim: [0, 0.12, 0],
  },
  squat: {
    poses: [
      { torso: 90, thigh: 270, shin: 270, arm: [0, 0] },
      { torso: 58, thigh: 350, shin: 248, arm: [5, 5] },
    ],
    ankleZ: 0,
    period: 1.8,
    phoneY: 0.5,
    landscape: false,
    aim: [0, 0.5, 0],
  },
  situp: {
    poses: [
      { torso: 172, thigh: 48, shin: 300, arm: [-30, 80] },
      { torso: 108, thigh: 48, shin: 300, arm: [-30, 80] },
    ],
    ankleZ: 0.35,
    period: 1.9,
    phoneY: 0,
    landscape: true,
    aim: [0, 0.18, 0],
  },
};

const TIPS: Record<Exercise, string[]> = {
  pushup: ['Телефон на полу сбоку, можно положить горизонтально', 'В кадре хотя бы до пояса', 'Опускайся, пока локти не согнутся под прямым углом'],
  squat: ['Телефон сбоку или вполоборота, на уровне пояса', 'В кадре всё тело, от головы до стоп', 'Садись, пока бёдра не станут параллельны полу'],
  situp: ['Ляг боком к камере, колени согнуты', 'Стопы и таз на полу, всё тело в кадре', 'Поднимай корпус до коленей и плавно опускайся'],
};

const DEG = Math.PI / 180;
const dir = (a: number) => new THREE.Vector3(0, Math.sin(a * DEG), Math.cos(a * DEG));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 0.5 - 0.5 * Math.cos(t * Math.PI * 2); // 0 → 1 → 0 за повтор

const BONES = ['hips', 'head', 'upperarm.l', 'upperarm.r', 'lowerarm.l', 'lowerarm.r', 'wrist.l', 'wrist.r', 'upperleg.l', 'upperleg.r', 'lowerleg.l', 'lowerleg.r', 'foot.l', 'foot.r'] as const;
type BoneName = (typeof BONES)[number];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Quaternion();

const worldPos = (o: THREE.Object3D, out = new THREE.Vector3()) => o.getWorldPosition(out);

// Поворачивает кость так, чтобы направление «кость → потомок» стало равно want (в мировых осях).
function aim(bone: THREE.Object3D, child: THREE.Object3D, want: THREE.Vector3) {
  const cur = worldPos(child, _a).sub(worldPos(bone, _b)).normalize();
  const r = _q.setFromUnitVectors(cur, want.clone().normalize());
  bone.parent!.getWorldQuaternion(_p);
  const inv = _p.clone().invert();
  bone.quaternion.premultiply(_p).premultiply(r).premultiply(inv);
  bone.updateMatrixWorld(true);
}

// Двухзвенная «рука» в плоскости: углы плеча и локтя, чтобы ладонь попала в точку.
function reach(shoulder: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number): [number, number] {
  const dz = target.z - shoulder.z;
  const dy = target.y - shoulder.y;
  const d = Math.min(Math.hypot(dz, dy), l1 + l2 - 1e-4);
  const base = Math.atan2(dy, dz);
  const k = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  // Локти уходят назад, к ногам.
  const a1 = base - k;
  const ez = shoulder.z + Math.cos(a1) * l1;
  const ey = shoulder.y + Math.sin(a1) * l1;
  return [a1 / DEG, Math.atan2(target.y - ey, target.z - ez) / DEG];
}

function Athlete({ exercise, model }: { exercise: Exercise; model: CharName }) {
  const gltf = useGltf(charUrl(model));
  const spec = SPECS[exercise];

  const rig = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as THREE.Group;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Без меча, щита и шлема: так лучше видно руки и голову.
      if (!(mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.visible = false;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    });
    const bones = {} as Record<BoneName, THREE.Object3D>;
    // GLTFLoader убирает точки из имён узлов: upperarm.l → upperarml.
    for (const n of BONES) bones[n] = root.getObjectByName(n.replace('.', ''))!;
    // У героев KayKit большая голова, на схеме уменьшаем её, чтобы было видно позу.
    bones.head.scale.setScalar(0.7);
    const rest = new Map<THREE.Object3D, THREE.Quaternion>();
    root.traverse((o) => rest.set(o, o.quaternion.clone()));
    root.updateMatrixWorld(true);
    const p = (n: BoneName) => worldPos(bones[n]);
    const len = (a: BoneName, b: BoneName) => p(a).distanceTo(p(b));
    const size = {
      height: heightOf(root),
      // От стоп до плеч: вокруг носков поворачивается тело в отжимании.
      body: p('upperarm.l').distanceTo(p('foot.l')),
      arm1: len('upperarm.l', 'lowerarm.l'),
      arm2: len('lowerarm.l', 'wrist.l'),
    };
    return { root, bones, rest, size };
  }, [gltf]);

  const holder = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = holder.current;
    if (!g) return;
    const { root, bones: b, rest, size } = rig;
    const t = ease((clock.elapsedTime / spec.period) % 1);
    const [A, B] = spec.poses;
    const pose = { torso: lerp(A.torso, B.torso, t), thigh: lerp(A.thigh, B.thigh, t), shin: lerp(A.shin, B.shin, t) };
    if (A.plank) {
      const a = Math.asin(Math.min(0.9, (pose.torso * (size.arm1 + size.arm2) + size.height * 0.03) / size.body)) / DEG;
      pose.torso = a;
      pose.thigh = pose.shin = a + 180;
    }

    for (const [o, q] of rest) o.quaternion.copy(q);
    g.position.set(0, 0, 0);
    g.updateMatrixWorld(true);

    aim(b.hips, b.head, dir(pose.torso));
    for (const s of ['l', 'r'] as const) {
      aim(b[`upperleg.${s}`], b[`lowerleg.${s}`], dir(pose.thigh));
      aim(b[`lowerleg.${s}`], b[`foot.${s}`], dir(pose.shin));
    }

    // Ставим стопы на пол в нужной точке.
    const ankle = worldPos(b['foot.l']).add(worldPos(b['foot.r'])).multiplyScalar(0.5);
    const H = size.height;
    g.position.set(0, H * 0.035 - ankle.y, spec.ankleZ * H - ankle.z);
    g.updateMatrixWorld(true);

    for (const s of ['l', 'r'] as const) {
      let angles: [number, number];
      if (A.plank) {
        const shoulder = worldPos(b[`upperarm.${s}`]);
        const target = new THREE.Vector3(0, H * 0.02, shoulder.z + H * 0.02);
        angles = reach(shoulder, target, size.arm1, size.arm2);
      } else {
        const a = A.arm ?? [270, 270];
        const c = B.arm ?? a;
        // Углы рук для пресса заданы относительно корпуса.
        const rel = exercise === 'situp' ? pose.torso : 0;
        angles = [rel + lerp(a[0], c[0], t), rel + lerp(a[1], c[1], t)];
      }
      aim(b[`upperarm.${s}`], b[`lowerarm.${s}`], dir(angles[0]));
      aim(b[`lowerarm.${s}`], b[`wrist.${s}`], dir(angles[1]));
    }
    root.updateMatrixWorld(true);
  });

  return (
    <group ref={holder}>
      <primitive object={rig.root} />
    </group>
  );
}

// Телефон с подставкой и поле зрения камеры в сторону человека.
function Phone({ spec, height }: { spec: Spec; height: number }) {
  const H = height;
  const x = H * 1.15;
  // Телефон крупнее настоящего, чтобы его было видно на схеме.
  const w = H * 0.08;
  const h = H * 0.16;
  const [pw, ph] = spec.landscape ? [h, w] : [w, h];
  const standH = spec.phoneY * H;
  const lensY = standH + ph * 0.5 + H * 0.01;
  const cone = useMemo(() => {
    const target = new THREE.Vector3(...spec.aim).multiplyScalar(H);
    const from = new THREE.Vector3(x - H * 0.01, lensY, 0);
    const length = from.distanceTo(target) * 1.05;
    const geo = new THREE.ConeGeometry(H * 0.62, length, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    geo.translate(0, -length / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.clone().sub(from).normalize());
    return { geo, from, q };
  }, [spec, H, x, lensY]);

  return (
    <>
      {standH > 0 && (
        <mesh position={[x + H * 0.02, standH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[H * 0.22, standH, H * 0.26]} />
          <meshStandardMaterial color="#6d5a48" />
        </mesh>
      )}
      <group position={[x, standH + ph / 2 + H * 0.005, 0]} rotation={[0, 0, -0.08]}>
        <mesh castShadow>
          <boxGeometry args={[H * 0.012, ph, pw]} />
          <meshStandardMaterial color="#20232e" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[H * 0.0065, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[pw * 0.86, ph * 0.86]} />
          <meshBasicMaterial color="#4fc3f7" />
        </mesh>
        <mesh position={[-H * 0.0068, ph * 0.3, spec.landscape ? pw * 0.36 : 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[H * 0.009, H * 0.009, H * 0.004, 16]} />
          <meshBasicMaterial color="#ffd166" />
        </mesh>
      </group>
      <mesh geometry={cone.geo} position={cone.from} quaternion={cone.q}>
        <meshBasicMaterial color="#ffd166" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh geometry={cone.geo} position={cone.from} quaternion={cone.q}>
        <meshBasicMaterial color="#ffd166" wireframe transparent opacity={0.35} />
      </mesh>
      {/* Линейка расстояния по полу */}
      <mesh position={[x / 2, 0.004, H * 0.42]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[x - H * 0.05, H * 0.012]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>
    </>
  );
}

// Рост по габаритам модели в исходной позе.
const heightOf = (scene: THREE.Object3D) => new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y || 2;

function Rig({ exercise, model }: { exercise: Exercise; model: CharName }) {
  const spec = SPECS[exercise];
  const gltf = useGltf(charUrl(model));
  const H = useMemo(() => heightOf(gltf.scene), [gltf]);
  const { camera } = useThree();
  useEffect(() => {
    // Камера позади телефона и выше: видно и телефон, и человека сбоку.
    camera.position.set(H * 2.9, H * 1.25, H * 1.05);
    camera.lookAt(H * 0.5, H * (spec.phoneY > 0 ? 0.32 : 0.2), -0.05 * H);
  }, [camera, H, spec]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, spec.ankleZ * H + (exercise === 'pushup' ? 0.4 : exercise === 'situp' ? -0.3 : 0) * H]} receiveShadow>
        <planeGeometry args={[H * 0.4, H * 1.1]} />
        <meshStandardMaterial color="#3d6b5e" />
      </mesh>
      <Athlete exercise={exercise} model={model} />
      <Phone spec={spec} height={H} />
    </>
  );
}

export function CameraGuide({ exercise, compact, model = 'Knight' }: { exercise: Exercise; compact?: boolean; model?: CharName }) {
  return (
    <div className={`guide ${compact ? 'compact' : ''}`}>
      <div className="guide-stage">
        <Canvas shadows dpr={[1, 1.6]} camera={{ fov: 25, near: 0.05, far: 60 }}>
          <hemisphereLight args={['#ffffff', '#30303c', 1.4]} />
          <directionalLight position={[4, 8, 5]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[9, 40]} />
            <meshStandardMaterial color="#2a2f3d" />
          </mesh>
          <Suspense fallback={null}>
            <Rig key={exercise} exercise={exercise} model={model} />
          </Suspense>
        </Canvas>
        <span className="guide-dist">1,5–2 м</span>
      </div>
      {!compact && (
        <ul className="guide-tips">
          {TIPS[exercise].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
