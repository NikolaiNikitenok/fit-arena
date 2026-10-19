import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Actor } from '../three/Actor';
import { CharAnim, Character } from '../three/Character';
import { CharName } from '../three/kit';
import { Prop } from '../three/Prop';
import { Sky } from '../three/Sky';
import { Land } from './lands';
import { LEVELS, LevelDef, WORLD_SIZE } from './levels';
import { LOOK } from './look';
import type { MissionView } from './mission';
import { Scenery, Window } from './Scenery';
import { generateWorld, pathX, WorldLayout } from './worldgen';

// Сцена миссии прямо в том месте карты, где стоит уровень: вокруг та же деревня, лес или база.
// Повторы игрока видны в мире: растёт мост, герой поднимается на башню, чудище отстаёт,
// жители оживают, босс получает удары.

interface Props {
  level: LevelDef;
  land: Land;
  view: MissionView;
  live: boolean;
  elapsedShare: number;
  hero: CharName;
  heroTint?: string;
  heroGlow?: string;
}

const levelsOfWorld = (w: number) => (w === 3 ? LEVELS.slice(WORLD_SIZE * 3) : LEVELS.slice(w * WORLD_SIZE, (w + 1) * WORLD_SIZE));
const layoutCache = new Map<number, WorldLayout>();
function layoutFor(world: number): WorldLayout {
  let l = layoutCache.get(world);
  if (!l) layoutCache.set(world, (l = generateWorld(levelsOfWorld(world))));
  return l;
}

function CameraAt({ pos, look }: { pos: [number, number, number]; look: [number, number, number] }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(...look));
  useFrame(() => {
    camera.position.lerp(new THREE.Vector3(...pos), 0.06);
    target.current.lerp(new THREE.Vector3(...look), 0.06);
    camera.lookAt(target.current);
  });
  return null;
}

const heroBase = (view: MissionView, running: CharAnim = 'idle'): CharAnim => (view.outcome === 'won' ? 'cheer' : view.outcome === 'lost' ? 'death' : running);

/** Враг своего мира: скелеты в фэнтези, роботы в космосе, зомби в городе. */
function Enemy({ world, color, anim, hit, scale = 0.62, position, rotation }: { world: number; color: string; anim: CharAnim; hit?: number; scale?: number; position: [number, number, number]; rotation: number }) {
  if (world === 1)
    return (
      <Actor
        color={color}
        anim={anim === 'walk' || anim === 'shamble' ? 'Walking' : anim === 'run' ? 'Running' : anim === 'death' || anim === 'dead' ? 'Death' : anim === 'cheer' ? 'Dance' : anim === 'attack' ? 'Punch' : 'Idle'}
        hit={hit}
        scale={scale * 0.85}
        position={position}
        rotation={rotation}
      />
    );
  return (
    <Character
      model={world === 2 ? 'Skeleton_Minion' : 'Skeleton_Warrior'}
      anim={world === 2 && anim === 'walk' ? 'shamble' : anim}
      tint={world === 2 ? 'mul:0.75,1.15,0.6' : undefined}
      hit={hit}
      speed={world === 2 ? 0.7 : 1}
      scale={scale}
      position={position}
      rotation={rotation}
    />
  );
}

export function MissionScene3D(props: Props) {
  const world = props.level.world;
  const look = LOOK[world];
  return (
    <Canvas shadows dpr={[1, 1.6]} camera={{ position: [0, 3, 7], fov: 45, far: 400 }}>
      <Sky top={look.top} horizon={look.horizon} stars={look.stars} planet={look.planet} />
      <fog attach="fog" args={[look.fog, 14, 38]} />
      <hemisphereLight args={['#ffffff', '#4a4038', world === 0 ? 1.3 : 1.0]} />
      <Suspense fallback={null}>
        <Stage {...props} />
      </Suspense>
    </Canvas>
  );
}

function Stage({ level, land, view, live, elapsedShare, hero, heroTint, heroGlow }: Props) {
  const world = level.world;
  const layout = layoutFor(world);
  const index = layout.nodes.findIndex((n) => n.id === level.id);
  const node = layout.nodes[Math.max(0, index)];
  const { type } = level;
  const chase = type === 'chase';
  const win: Window = useMemo(
    () => ({ x: node.x, z: node.z, ahead: chase ? 70 : 26, behind: 12, side: 20, clear: chase ? 0 : type === 'boss' ? 4.2 : 3.4 }),
    [node, chase, type],
  );
  const look = LOOK[world];
  const sun = useRef<THREE.DirectionalLight>(null!);

  const running: CharAnim = chase && live ? 'run' : type === 'build' && live ? 'walk' : 'idle';
  const pulseAnim: CharAnim = type === 'climb' ? 'jump' : type === 'boss' || type === 'defend' ? 'attack' : type === 'trial' ? 'cheer' : type === 'rescue' ? 'cast' : 'attack';
  const heroEl = (rotation: number, extra: Partial<React.ComponentProps<typeof Character>> = {}) => (
    <Character
      model={hero}
      tint={heroTint}
      glow={heroGlow}
      anim={heroBase(view, running)}
      pulse={chase || type === 'build' ? 0 : view.reps}
      pulseAnim={pulseAnim}
      speed={chase ? 1.1 : type === 'build' ? 0.7 : 1}
      scale={0.46}
      rotation={rotation}
      {...extra}
    />
  );

  // Площадка сцены — в точке уровня; в погоне герой бежит по дороге вперёд.
  const cx = node.x;
  const cz = node.z;
  let content: React.ReactNode = null;
  let cam: { pos: [number, number, number]; look: [number, number, number] } = { pos: [cx + 3, 3.2, cz + 6], look: [cx, 0.8, cz] };

  if (type === 'trial') {
    cam = { pos: [cx + 1.8, 2.6, cz + 5.4], look: [cx, 0.7, cz - 0.3] };
    content = (
      <group position={[cx, 0, cz]}>
        <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[1.3, 1.4, 0.16, 6]} />
          <meshStandardMaterial color="#b9b2a6" flatShading />
        </mesh>
        <group position={[0, 0.16, 0]}>{heroEl(0)}</group>
        {world === 0 && (
          <>
            <Prop lib="fantasy" name="target" position={[-1.8, 0, -0.8]} rotation={0.5} scale={2.4} />
            <Prop lib="fantasy" name="weaponrack" position={[1.9, 0, -0.9]} rotation={-0.5} scale={2.4} />
          </>
        )}
        <Prop lib="fantasy" name="torch_lit" position={[-1.2, 0, 0.9]} scale={0.45} />
        <Prop lib="fantasy" name="torch_lit" position={[1.2, 0, 0.9]} scale={0.45} />
        <Character model="Barbarian" anim="cheer" position={[-2.4, 0, 0.4]} rotation={0.9} scale={0.55} />
      </group>
    );
  }

  if (type === 'build') {
    const PLANKS = 12;
    const built = Math.floor(Math.min(1, view.progress) * PLANKS);
    const x = -2.6 + Math.min(1, view.progress) * 5.2;
    cam = { pos: [cx + 4.6, 3.6, cz + 3.4 - x * 0.5], look: [cx, 0.2, cz - x * 0.6] };
    const gap = world === 1 ? '#0b0f1a' : world === 2 ? '#141414' : '#2d7fc4';
    content = (
      <group position={[cx, 0, cz]} rotation={[0, Math.PI / 2, 0]}>
        {/* Пропасть, река или провал в асфальте поперёк дороги */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4, 9]} />
          <meshStandardMaterial color={gap} roughness={0.2} metalness={world === 0 ? 0.3 : 0} />
        </mesh>
        {[-2.1, 2.1].map((sx) => (
          <mesh key={sx} position={[sx, 0.1, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.25, 0.2, 9]} />
            <meshStandardMaterial color={world === 1 ? '#5c6670' : '#8d8478'} flatShading />
          </mesh>
        ))}
        {Array.from({ length: PLANKS }, (_, n) => (
          <mesh key={n} position={[-2 + (n + 0.5) * (4 / PLANKS), 0.12, 0]} visible={n < built} castShadow>
            <boxGeometry args={[4 / PLANKS - 0.04, 0.08, 1.3]} />
            <meshStandardMaterial
              color={world === 1 ? '#3fe0ff' : n % 2 ? '#a1887f' : '#8d6e63'}
              emissive={world === 1 ? '#18a8c8' : '#000000'}
              emissiveIntensity={world === 1 ? 0.8 : 0}
            />
          </mesh>
        ))}
        {world === 0 && <Prop lib="fantasy" name="resource_lumber" position={[-3.2, 0, -1]} scale={2} />}
        <Character model="Barbarian" anim={built > 0 ? 'cheer' : 'idle'} position={[3.3, 0, -0.9]} rotation={-1.2} scale={0.55} />
        <group position={[x, 0.16, 0]}>{heroEl(Math.PI / 2)}</group>
      </group>
    );
  }

  if (type === 'climb') {
    const y = Math.min(1, view.progress) * 5.4;
    cam = { pos: [cx + 3.6, y + 2.4, cz + 6.4], look: [cx - 0.4, y + 0.8, cz] };
    content = (
      <group position={[cx, 0, cz]}>
        {world === 0 && <Prop lib="fantasy" name="building_tower_A_red" position={[-1.6, 0, -0.6]} scale={2.7} />}
        {world === 1 && <Prop lib="space" name="structure_tall" position={[-1.9, 0, -0.9]} scale={1.7} />}
        {world >= 2 && <Prop lib={world === 2 ? 'city' : 'fantasy'} name={world === 2 ? 'building_H' : 'building_tower_A_red'} position={[-1.8, 0, -0.8]} scale={world === 2 ? 1.9 : 2.7} />}
        {[0.75, -0.75].map((dz) => (
          <mesh key={dz} position={[0.75, 3.1, dz * 0.6]}>
            <cylinderGeometry args={[0.03, 0.03, 6.2, 6]} />
            <meshStandardMaterial color="#d7ccc8" />
          </mesh>
        ))}
        <group position={[0.2, y, 0]}>
          <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 0.12, 1.1]} />
            <meshStandardMaterial color={world === 1 ? '#6b7a88' : '#8d6e63'} metalness={world === 1 ? 0.5 : 0} />
          </mesh>
          <group position={[0, 0.12, 0]}>{heroEl(0.3)}</group>
        </group>
      </group>
    );
  }

  if (type === 'chase') {
    // Герой бежит по дороге: скорость растёт со временем миссии, чудище держится на расстоянии отрыва.
    const dist = elapsedShare * 50;
    const z = cz - dist;
    const x = pathX(z, world);
    const gap = view.gap ?? 1;
    const mz = z + 1.4 + gap * 3;
    const mx = pathX(mz, world);
    const dir = Math.atan2(pathX(z - 1, world) - x, -1);
    cam = { pos: [mx + 2.6, 3.2, mz + 4.2], look: [x, 0.5, z] };
    content = (
      <>
        <group position={[x, 0.05, z]}>{heroEl(dir)}</group>
        <Enemy world={world} color={land.boss.color} anim={view.outcome === 'running' ? 'run' : view.outcome === 'lost' ? 'attack' : 'dead'} scale={0.75} position={[mx, 0.05, mz]} rotation={dir} />
      </>
    );
  }

  if (type === 'defend') {
    const pressure = Math.max(-0.3, Math.min(0.3, elapsedShare - view.progress));
    const front = -3.4 + pressure * 6;
    cam = { pos: [cx + 2.4, 4.4, cz + 6.8], look: [cx, 0.3, cz - 1.8] };
    content = (
      <group position={[cx, 0, cz]}>
        {world === 0 && <Prop lib="fantasy" name="wall_straight_gate" position={[0, 0, 2.1]} scale={0.9} />}
        {world === 1 && <Prop lib="space" name="structure_low" position={[0, 0, 2.2]} scale={1.2} />}
        {world >= 2 && (
          <>
            <Prop lib="city" name="car_police" position={[-1.3, 0, 1.9]} rotation={1.4} scale={1.6} />
            <Prop lib="city" name="dumpster" position={[1.4, 0, 1.9]} rotation={0.2} scale={1.6} />
          </>
        )}
        {world === 0 && (
          <>
            <Prop lib="fantasy" name="torch_lit" position={[-1.4, 0, 1.2]} scale={0.45} />
            <Prop lib="fantasy" name="torch_lit" position={[1.4, 0, 1.2]} scale={0.45} />
          </>
        )}
        <group position={[0, 0.05, 0.6]}>{heroEl(Math.PI)}</group>
        {[-1.4, 0, 1.4, -0.7, 0.7].map((dx, n) => (
          <Enemy
            key={n}
            world={world}
            color={land.accent}
            anim={view.outcome === 'running' ? 'walk' : view.outcome === 'won' ? 'death' : 'cheer'}
            hit={view.reps}
            scale={0.46}
            position={[dx, 0.05, front - (n > 2 ? 1.1 : 0)]}
            rotation={0}
          />
        ))}
      </group>
    );
  }

  if (type === 'rescue') {
    const total = Math.min(6, view.savedOf ?? 4);
    const saved = Math.round(((view.saved ?? 0) / Math.max(1, view.savedOf ?? 1)) * total);
    const models: CharName[] = ['Rogue', 'Barbarian', 'Mage', 'Knight', 'Rogue', 'Mage'];
    cam = { pos: [cx + 1.2, 2.6, cz + 4.6], look: [cx, 0.6, cz - 1] };
    content = (
      <group position={[cx, 0, cz]}>
        <group position={[1.9, 0.05, 0.2]}>{heroEl(-2.2)}</group>
        {Array.from({ length: total }, (_, n) => {
          const free = n < saved;
          return (
            <Character
              key={n}
              model={models[n]}
              stone={!free}
              anim={free ? 'cheer' : 'sit'}
              scale={0.5}
              position={[(n - (total - 1) / 2) * 0.95, 0.05, -1.2 - (n % 2) * 0.6]}
              rotation={0}
            />
          );
        })}
      </group>
    );
  }

  if (type === 'boss') {
    const angry = (view.hearts ?? 3) <= 1 || view.progress > 0.66;
    cam = { pos: [cx + 3.6, 3.4, cz + 6.4], look: [cx, 1.0, cz - 0.6] };
    const bossAnim: CharAnim = view.outcome === 'won' ? 'death' : view.outcome === 'lost' ? 'cheer' : 'taunt';
    content = (
      <group position={[cx, 0, cz]}>
        <mesh position={[0, 0.04, 0]} receiveShadow>
          <cylinderGeometry args={[3.4, 3.6, 0.08, 8]} />
          <meshStandardMaterial color={world === 1 ? '#3b4654' : '#9c9488'} flatShading metalness={world === 1 ? 0.5 : 0} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((k) => {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          return <Prop key={k} lib="fantasy" name={k % 2 ? 'torch_lit' : 'column'} position={[Math.cos(a) * 3.3, 0, Math.sin(a) * 3.3 - 0.4]} scale={k % 2 ? 0.5 : 0.7} />;
        })}
        <Prop lib="fantasy" name="banner_red" position={[-1.2, 0, -3.2]} scale={0.55} />
        <Prop lib="fantasy" name="banner_red" position={[1.2, 0, -3.2]} scale={0.55} />
        <group position={[0, 0.08, 1.3]}>{heroEl(Math.PI)}</group>
        {world === 1 ? (
          <Actor
            color={land.boss.color}
            glow={angry ? '#ff1744' : land.boss.color}
            anim={view.outcome === 'won' ? 'Death' : view.outcome === 'lost' ? 'Dance' : 'Idle'}
            hit={view.reps}
            scale={land.boss.scale * 0.9}
            position={[0, 0.08, -1.3]}
          />
        ) : (
          <Character
            model={level.land % 3 === 2 ? 'Skeleton_Mage' : 'Skeleton_Warrior'}
            tint={world === 2 ? 'mul:0.75,1.15,0.6' : land.boss.color}
            glow={angry ? '#ff1744' : land.boss.color}
            anim={bossAnim}
            hit={view.reps}
            scale={land.boss.scale * 0.65}
            position={[0, 0.08, -1.3]}
          />
        )}
      </group>
    );
  }

  return (
    <>
      <directionalLight
        ref={sun}
        position={[cam.look[0] + 6, 12, cam.look[2] + 6]}
        intensity={look.light}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0005}
      />
      <SunTarget sun={sun} at={cam.look} />
      <CameraAt pos={cam.pos} look={cam.look} />
      <Scenery layout={layout} window={win} />
      {content}
    </>
  );
}

function SunTarget({ sun, at }: { sun: React.RefObject<THREE.DirectionalLight>; at: [number, number, number] }) {
  useFrame(() => {
    if (!sun.current) return;
    sun.current.position.set(at[0] + 6, 12, at[2] + 6);
    sun.current.target.position.set(...at);
    sun.current.target.updateMatrixWorld();
  });
  return null;
}
