import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ZoneTheme } from '../campaign';

// 3D-ринг с двумя анимированными роботами. Модель RobotExpressive (CC0, Tomás Laulhé).
// Анимации запускаются сменой счётчиков: punchSeq — боец бьёт, hitSeq — по нему попали.

const MODEL_URL = `${import.meta.env.BASE_URL}models/robot.glb`;
// Робот в модели ростом около 4,5 единиц; приводим к росту бойца на ринге (~1,9).
const MODEL_SCALE = 0.25;
const HIT_MS = 320;

export interface FighterLook {
  color: string;
  punchSeq: number;
  hitSeq: number;
  combo: boolean;
  knockedOut: boolean;
  won: boolean;
  scale?: number;
  enraged?: boolean;
}

function Robot({ look, facing }: { look: FighterLook; facing: 1 | -1 }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const holder = useRef<THREE.Group>(null!);

  // Каждому бойцу свой клон со своими материалами, чтобы красить их отдельно.
  const { model, materials, mixer, actions } = useMemo(() => {
    const model = cloneSkinned(gltf.scene) as THREE.Group;
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (mat.name === 'Main') mat.color.set(look.color);
      mesh.material = mat;
      materials.push(mat);
    });
    model.scale.setScalar(MODEL_SCALE);
    const mixer = new THREE.AnimationMixer(model);
    const actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    return { model, materials, mixer, actions };
    // Цвет меняем ниже, без пересоздания модели.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf]);

  useEffect(() => {
    for (const m of materials) if (m.name === 'Main') m.color.set(look.color);
  }, [look.color, materials]);

  const current = useRef<THREE.AnimationAction | null>(null);
  const play = (name: string, once = false, speed = 1) => {
    const next = actions[name];
    if (!next) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = speed;
    next.enabled = true;
    if (current.current && current.current !== next) next.crossFadeFrom(current.current, 0.12, false);
    next.play();
    current.current = next;
  };

  // Базовая поза: стойка, победный танец или падение.
  const base = look.knockedOut ? 'Death' : look.won ? 'Dance' : 'Idle';
  useEffect(() => {
    play(base, base === 'Death');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    const onDone = (e: { action: THREE.AnimationAction }) => {
      if (e.action === actions.Punch && current.current === actions.Punch && base === 'Idle') play('Idle');
    };
    mixer.addEventListener('finished', onDone);
    return () => mixer.removeEventListener('finished', onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer, actions, base]);

  useEffect(() => {
    if (look.punchSeq > 0 && base === 'Idle') play('Punch', true, look.combo ? 2.6 : 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look.punchSeq]);

  const hitAt = useRef(-1e9);
  useEffect(() => {
    if (look.hitSeq > 0) hitAt.current = performance.now();
  }, [look.hitSeq]);

  useFrame((_, delta) => {
    mixer.update(delta);
    // Попадание: отбрасывает назад и подсвечивает красным; босс в ярости светится.
    const h = Math.min(1, (performance.now() - hitAt.current) / HIT_MS);
    const recoil = h < 1 ? Math.sin(h * Math.PI) : 0;
    holder.current.position.z = -0.25 * recoil;
    const rage = look.enraged ? 0.25 + 0.15 * Math.sin(performance.now() / 120) : 0;
    for (const m of materials) m.emissive.setRGB(Math.max(0.9 * recoil, rage), 0, 0);
  });

  const s = look.scale ?? 1;
  return (
    <group position={[0, 0, -facing * 1.15]} rotation={[0, facing === 1 ? 0 : Math.PI, 0]} scale={s}>
      <group ref={holder}>
        <primitive object={model} />
      </group>
      {look.enraged && <pointLight position={[0, 1.4, 0.6]} color="#ff2d2d" intensity={6} distance={4} />}
    </group>
  );
}

function Ring({ theme }: { theme: ZoneTheme }) {
  const size = 4.4;
  const posts: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  return (
    <group>
      <mesh position={[0, -0.15, 0]} receiveShadow>
        <boxGeometry args={[size, 0.3, size]} />
        <meshStandardMaterial color={theme.ring} roughness={0.8} />
      </mesh>
      <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={theme.background} />
      </mesh>
      {posts.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[(x * size) / 2, 0.6, (z * size) / 2]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 1.2, 16]} />
          <meshStandardMaterial color="#e5e7eb" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
      {[0.4, 0.75, 1.1].map((y, row) =>
        posts.map(([x, z], i) => {
          const [nx, nz] = posts[(i + 1) % 4];
          const from = new THREE.Vector3((x * size) / 2, y, (z * size) / 2);
          const to = new THREE.Vector3((nx * size) / 2, y, (nz * size) / 2);
          const along = Math.abs(nz - z) < 0.01;
          return (
            <mesh
              key={`${row}-${i}`}
              position={from.clone().add(to).multiplyScalar(0.5)}
              rotation={along ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.028, 0.028, from.distanceTo(to), 8]} />
              <meshStandardMaterial color={theme.ropes[row % 2]} emissive={theme.ropes[row % 2]} emissiveIntensity={0.35} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}

export interface Arena3DProps {
  player: FighterLook;
  opponent: FighterLook;
  theme: ZoneTheme;
}

export function Arena3D({ player, opponent, theme }: Arena3DProps) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [-2.6, 2.3, -4.8], fov: 42 }} onCreated={({ camera }) => camera.lookAt(0, 1, 0)}>
      <color attach="background" args={[theme.background]} />
      <fog attach="fog" args={[theme.background, 9, 20]} />
      <hemisphereLight args={[theme.light, '#111', 0.7]} />
      <spotLight position={[0, 7, 0]} angle={0.65} penumbra={0.6} intensity={70} color={theme.light} castShadow />
      <directionalLight position={[4, 5, -3]} intensity={1.1} />
      <Ring theme={theme} />
      <Suspense fallback={null}>
        <Robot look={player} facing={1} />
        <Robot look={opponent} facing={-1} />
      </Suspense>
    </Canvas>
  );
}
