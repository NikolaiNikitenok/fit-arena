import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Actor, Anim } from '../three/Actor';
import { Land } from './lands';
import { LevelDef } from './levels';
import type { MissionView } from './mission';

// Сцена миссии: повторы игрока видны в мире — растёт мост, герой поднимается, чудище отстаёт,
// жители оживают, босс получает удары.

interface Props {
  level: LevelDef;
  land: Land;
  view: MissionView;
  // Миссия идёт: персонажи двигаются, мир «едет».
  live: boolean;
  elapsedShare: number;
  heroColor: string;
  heroGlow?: string;
}

const PLANKS = 14;

function CameraAt({ pos, look }: { pos: [number, number, number]; look: [number, number, number] }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(...look));
  useFrame(() => {
    camera.position.lerp(new THREE.Vector3(...pos), 0.08);
    target.current.lerp(new THREE.Vector3(...look), 0.08);
    camera.lookAt(target.current);
  });
  return null;
}

function heroAnim(view: MissionView, running: Anim = 'Idle'): Anim {
  if (view.outcome === 'won') return 'Dance';
  if (view.outcome === 'lost') return 'Death';
  return running;
}

function Ground({ color, size = 40 }: { color: string; size?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function Build({ view, land, hero }: { view: MissionView; land: Land; hero: React.ReactNode }) {
  const built = Math.floor(view.progress * PLANKS);
  const x = -2.6 + Math.min(1, view.progress) * 5.2;
  return (
    <>
      <CameraAt pos={[x * 0.5, 3.2, 7]} look={[x * 0.5, 0, 0]} />
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 5, -1, 0]} receiveShadow castShadow>
          <boxGeometry args={[6, 2, 6]} />
          <meshStandardMaterial color={land.ground} />
        </mesh>
      ))}
      <mesh position={[0, -6, 0]}>
        <boxGeometry args={[4, 1, 6]} />
        <meshStandardMaterial color="#1b1b22" />
      </mesh>
      {Array.from({ length: PLANKS }, (_, n) => (
        <mesh key={n} position={[-2 + (n + 0.5) * (4 / PLANKS), n < built ? -0.06 : -3, 0]} visible={n < built} castShadow>
          <boxGeometry args={[4 / PLANKS - 0.04, 0.12, 1.4]} />
          <meshStandardMaterial color={n % 2 ? '#a1887f' : '#8d6e63'} />
        </mesh>
      ))}
      {[-0.75, 0.75].map((z) => (
        <mesh key={z} position={[0, 0.35, z]} scale={[Math.max(0.001, built / PLANKS), 1, 1]}>
          <boxGeometry args={[4, 0.04, 0.04]} />
          <meshStandardMaterial color="#5d4037" />
        </mesh>
      ))}
      <group position={[x, 0, 0]}>{hero}</group>
    </>
  );
}

function Climb({ view, land, hero }: { view: MissionView; land: Land; hero: React.ReactNode }) {
  const y = Math.min(1, view.progress) * 6;
  return (
    <>
      <CameraAt pos={[2.2, y + 2.2, 6]} look={[-0.3, y + 0.9, 0]} />
      <Ground color={land.ground} />
      <mesh position={[-1.9, 3.6, -0.4]} castShadow receiveShadow>
        <boxGeometry args={[2, 7.2, 2]} />
        <meshStandardMaterial color={land.accent} flatShading />
      </mesh>
      <mesh position={[-1.9, 7.6, -0.4]}>
        <coneGeometry args={[1.5, 1.4, 4]} />
        <meshStandardMaterial color={land.boss.color} flatShading />
      </mesh>
      <mesh position={[-1, 7.25, 0]}>
        <boxGeometry args={[1.6, 0.3, 1.4]} />
        <meshStandardMaterial color={land.ground} />
      </mesh>
      <mesh position={[0.8, 3.8, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 7.6, 6]} />
        <meshStandardMaterial color="#d7ccc8" />
      </mesh>
      <group position={[0, y, 0]}>
        <mesh position={[0, 0.05, 0]} castShadow>
          <boxGeometry args={[1.4, 0.1, 1]} />
          <meshStandardMaterial color="#8d6e63" />
        </mesh>
        {hero}
      </group>
    </>
  );
}

function Scroller({ live, color }: { live: boolean; color: string }) {
  const group = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    if (!live) return;
    for (const c of group.current.children) {
      c.position.x -= dt * 4;
      if (c.position.x < -14) c.position.x += 28;
    }
  });
  const items = useMemo(() => Array.from({ length: 14 }, (_, n) => ({ x: -14 + n * 2, z: n % 2 ? -2.6 : 2.4, s: 0.7 + (n % 3) * 0.3 })), []);
  return (
    <group ref={group}>
      {items.map((it, n) => (
        <mesh key={n} position={[it.x, it.s * 0.8, it.z]} scale={it.s} castShadow>
          <coneGeometry args={[0.6, 1.6, 7]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Chase({ view, land, live, hero }: { view: MissionView; land: Land; live: boolean; hero: React.ReactNode }) {
  const gap = view.gap ?? 1;
  return (
    <>
      <CameraAt pos={[-1.5, 2.6, 6.5]} look={[-1.5, 0.6, 0]} />
      <Ground color={land.ground} />
      <Scroller live={live && view.outcome === 'running'} color={land.accent} />
      {hero}
      <Suspense fallback={null}>
        <Actor
          color={land.boss.color}
          anim={view.outcome === 'running' ? 'Running' : view.outcome === 'lost' ? 'Punch' : 'Sitting'}
          scale={1.3}
          glow={land.boss.color}
          position={[-1.1 - gap * 4.5, 0, 0]}
          rotation={Math.PI / 2}
        />
      </Suspense>
    </>
  );
}

function Defend({ view, land, elapsedShare, hero }: { view: MissionView; land: Land; elapsedShare: number; hero: React.ReactNode }) {
  // Отставание от темпа подталкивает приспешников к воротам.
  const pressure = Math.max(-0.3, Math.min(0.3, elapsedShare - view.progress));
  const front = 2 - pressure * 5;
  return (
    <>
      <CameraAt pos={[0.4, 3.6, 9.5]} look={[0.4, 0.6, 0]} />
      <Ground color={land.ground} />
      <mesh position={[-2.6, 1.2, 0]} castShadow>
        <boxGeometry args={[0.5, 2.4, 4]} />
        <meshStandardMaterial color="#6d4c41" />
      </mesh>
      <group position={[-1.4, 0, 0]}>{hero}</group>
      <Suspense fallback={null}>
        {[-1.2, 0, 1.2].map((z, n) => (
          <Actor
            key={z}
            color={land.accent}
            anim={view.outcome === 'running' ? 'Walking' : view.outcome === 'won' ? 'Death' : 'Dance'}
            hit={view.reps}
            scale={0.75}
            position={[front + n * 0.5, 0, z]}
            rotation={-Math.PI / 2}
          />
        ))}
      </Suspense>
    </>
  );
}

function Rescue({ view, land, hero }: { view: MissionView; land: Land; hero: React.ReactNode }) {
  const total = Math.min(8, view.savedOf ?? 4);
  const saved = Math.round(((view.saved ?? 0) / Math.max(1, view.savedOf ?? 1)) * total);
  const colors = ['#ffb74d', '#4fc3f7', '#aed581', '#f06292', '#ba68c8', '#ffd54f', '#4db6ac', '#e57373'];
  return (
    <>
      <CameraAt pos={[0, 3, 6.5]} look={[0, 0.6, -0.5]} />
      <Ground color={land.ground} />
      <group position={[0, 0, 1]}>{hero}</group>
      <Suspense fallback={null}>
        {Array.from({ length: total }, (_, n) => {
          const free = n < saved;
          return (
            <Actor
              key={`${n}-${free}`}
              color={colors[n]}
              stone={!free}
              anim={free ? 'Wave' : 'Sitting'}
              scale={0.7}
              position={[(n - (total - 1) / 2) * 0.9, 0, -1.4 - (n % 2) * 0.5]}
            />
          );
        })}
      </Suspense>
    </>
  );
}

function Boss({ view, land, hero }: { view: MissionView; land: Land; hero: React.ReactNode }) {
  const angry = (view.hearts ?? 3) <= 1 || view.progress > 0.66;
  return (
    <>
      <CameraAt pos={[3.2, 2.6, 4.8]} look={[0, 1, -0.3]} />
      <Ground color={land.ground} />
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[3.2, 3.4, 0.1, 40]} />
        <meshStandardMaterial color={land.accent} />
      </mesh>
      <group position={[0, 0, 1.2]} rotation={[0, Math.PI, 0]}>
        {hero}
      </group>
      <Suspense fallback={null}>
        <Actor
          color={land.boss.color}
          glow={angry ? '#ff1744' : land.boss.color}
          anim={view.outcome === 'won' ? 'Death' : view.outcome === 'lost' ? 'Dance' : 'Idle'}
          hit={view.reps}
          scale={land.boss.scale * 0.8}
          position={[0, 0, -1.4]}
        />
      </Suspense>
    </>
  );
}

function Trial({ land, hero }: { land: Land; hero: React.ReactNode }) {
  return (
    <>
      <CameraAt pos={[0, 2.2, 4.6]} look={[0, 0.7, 0]} />
      <Ground color={land.ground} />
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <cylinderGeometry args={[1.4, 1.5, 0.12, 32]} />
        <meshStandardMaterial color={land.accent} />
      </mesh>
      {hero}
    </>
  );
}

export function MissionScene3D({ level, land, view, live, elapsedShare, heroColor, heroGlow }: Props) {
  const { type } = level;
  const running: Anim = type === 'chase' && live ? 'Running' : type === 'build' && live ? 'Walking' : 'Idle';
  const pulseAnim: Anim = type === 'climb' ? 'Jump' : type === 'boss' || type === 'defend' ? 'Punch' : type === 'trial' || type === 'rescue' ? 'Yes' : 'Punch';
  const facing = type === 'chase' || type === 'build' || type === 'defend' ? Math.PI / 2 : 0;
  const hero = (
    <Suspense fallback={null}>
      <Actor
        color={heroColor}
        glow={heroGlow}
        anim={heroAnim(view, running)}
        pulse={type === 'chase' || type === 'build' ? 0 : view.reps}
        pulseAnim={pulseAnim}
        speed={type === 'build' ? 0.6 : 1}
        rotation={facing}
      />
    </Suspense>
  );
  const dark = land.world !== 'fantasy';

  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 3, 7], fov: 45 }}>
      <color attach="background" args={[land.sky]} />
      <fog attach="fog" args={[land.sky, 10, 26]} />
      <hemisphereLight args={['#ffffff', '#2b2b2b', dark ? 0.9 : 1.2]} />
      <directionalLight position={[4, 8, 5]} intensity={dark ? 1.4 : 1.8} castShadow />
      {type === 'build' && <Build view={view} land={land} hero={hero} />}
      {type === 'climb' && <Climb view={view} land={land} hero={hero} />}
      {type === 'chase' && <Chase view={view} land={land} live={live} hero={hero} />}
      {type === 'defend' && <Defend view={view} land={land} elapsedShare={elapsedShare} hero={hero} />}
      {type === 'rescue' && <Rescue view={view} land={land} hero={hero} />}
      {type === 'boss' && <Boss view={view} land={land} hero={hero} />}
      {type === 'trial' && <Trial land={land} hero={hero} />}
    </Canvas>
  );
}
