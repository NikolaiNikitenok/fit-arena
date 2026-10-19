import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Actor } from '../three/Actor';
import { LANDS, World } from './lands';
import { LAND_SIZE, LevelDef } from './levels';

// 3D-карта одного мира: дорога из уровней через десять земель. Карту листают пальцем,
// закрытые земли спрятаны в туман Лени, на дороге стоят герой, боссы, купец и сундуки.

const STEP = 1.5;
export const nodePos = (i: number): [number, number, number] => [2.3 * Math.sin(i * 0.45), 0, -i * STEP];

function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Декор земли: деревья и скалы в фэнтези, кристаллы и купола в космосе, дома и машины у зомби.
function Decor({ world, land, index, accent }: { world: World; land: number; index: number; accent: string }) {
  const items = useMemo(() => {
    const out: { x: number; z: number; s: number; k: number }[] = [];
    for (let n = 0; n < 12; n++) {
      const side = n % 2 ? 1 : -1;
      const z = -(index * LAND_SIZE + rand(land * 50 + n) * LAND_SIZE) * STEP;
      const pathX = 2.3 * Math.sin((-z / STEP) * 0.45);
      out.push({ x: pathX + side * (2 + rand(land * 70 + n) * 4.5), z, s: 0.6 + rand(land * 90 + n) * 0.9, k: Math.floor(rand(land * 30 + n) * 3) });
    }
    return out;
  }, [land, index]);

  return (
    <>
      {items.map(({ x, z, s, k }, n) => (
        <group key={n} position={[x, 0, z]} scale={s}>
          {world === 'fantasy' &&
            (k === 2 ? (
              <mesh position={[0, 0.3, 0]} castShadow>
                <dodecahedronGeometry args={[0.5, 0]} />
                <meshStandardMaterial color="#9e9e9e" flatShading />
              </mesh>
            ) : (
              <>
                <mesh position={[0, 0.35, 0]}>
                  <cylinderGeometry args={[0.1, 0.14, 0.7, 6]} />
                  <meshStandardMaterial color="#6d4c41" />
                </mesh>
                <mesh position={[0, 1.2, 0]} castShadow>
                  <coneGeometry args={[0.6, 1.5, 7]} />
                  <meshStandardMaterial color={k ? '#2e7d32' : accent} flatShading />
                </mesh>
              </>
            ))}
          {world === 'space' &&
            (k === 2 ? (
              <mesh position={[0, 0, 0]}>
                <sphereGeometry args={[0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#cfd8dc" metalness={0.6} roughness={0.3} />
              </mesh>
            ) : (
              <mesh position={[0, 0.7, 0]} rotation={[0.2 * k, 0, 0.3]} castShadow>
                <octahedronGeometry args={[0.55, 0]} />
                <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} flatShading />
              </mesh>
            ))}
          {world === 'zombie' &&
            (k === 2 ? (
              <group>
                <mesh position={[0, 0.3, 0]}>
                  <boxGeometry args={[1.4, 0.5, 0.7]} />
                  <meshStandardMaterial color="#8d6e63" />
                </mesh>
                <mesh position={[0, 0.65, 0]}>
                  <boxGeometry args={[0.8, 0.3, 0.6]} />
                  <meshStandardMaterial color="#5d4037" />
                </mesh>
              </group>
            ) : (
              <mesh position={[0, 1 + k * 0.6, 0]} castShadow>
                <boxGeometry args={[1.2, 2 + k * 1.2, 1.2]} />
                <meshStandardMaterial color={k ? '#616161' : '#795548'} />
              </mesh>
            ))}
        </group>
      ))}
    </>
  );
}

function Cart({ position, onClick }: { position: [number, number, number]; onClick: () => void }) {
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.1, 0.5, 0.7]} />
        <meshStandardMaterial color="#8d6e63" />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 1.1, 12, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#fff3e0" side={THREE.DoubleSide} />
      </mesh>
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, 0.2, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.06, 12]} />
          <meshStandardMaterial color="#4e342e" />
        </mesh>
      ))}
    </group>
  );
}

function Chest({ position, opened, onClick }: { position: [number, number, number]; opened: boolean; onClick: () => void }) {
  const lid = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    if (!opened) lid.current.position.y = 0.42 + 0.03 * Math.sin(performance.now() / 250);
  });
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.55, 0.36, 0.4]} />
        <meshStandardMaterial color="#8d5524" />
      </mesh>
      <mesh ref={lid} position={[0, 0.42, opened ? -0.18 : 0]} rotation={[opened ? -1.2 : 0, 0, 0]}>
        <boxGeometry args={[0.58, 0.12, 0.42]} />
        <meshStandardMaterial color="#ffb300" metalness={0.5} roughness={0.4} emissive={opened ? '#000' : '#ff8f00'} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Node({ level, i, state, onSelect }: { level: LevelDef; i: number; state: 'locked' | 'open' | 'current' | 'done'; onSelect: () => void }) {
  const ref = useRef<THREE.Mesh>(null!);
  const boss = level.type === 'boss';
  useFrame(() => {
    if (state === 'current') ref.current.position.y = 0.12 + 0.06 * Math.sin(performance.now() / 200);
  });
  const color = state === 'locked' ? '#555' : state === 'done' ? '#ffc107' : state === 'current' ? '#ff5a36' : '#f5f5f5';
  return (
    <mesh
      ref={ref}
      position={[nodePos(i)[0], 0.12, nodePos(i)[2]]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      castShadow
    >
      <cylinderGeometry args={[boss ? 0.62 : 0.42, boss ? 0.7 : 0.48, 0.24, 20]} />
      <meshStandardMaterial color={color} emissive={state === 'current' ? '#ff5a36' : '#000'} emissiveIntensity={0.4} />
    </mesh>
  );
}

function CameraRig({ focus }: { focus: React.MutableRefObject<number> }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  useFrame(() => {
    const z = -focus.current * STEP;
    camera.position.lerp(new THREE.Vector3(0, 7, z + 7.5), 0.12);
    look.current.lerp(new THREE.Vector3(0, 0, z - 1.5), 0.12);
    camera.lookAt(look.current);
  });
  return null;
}

function Stars() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts = new Float32Array(1500);
    for (let n = 0; n < 500; n++) {
      pts[n * 3] = (rand(n) - 0.5) * 80;
      pts[n * 3 + 1] = 8 + rand(n + 1000) * 20;
      pts[n * 3 + 2] = -rand(n + 2000) * 170 + 10;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial color="#fff" size={0.15} />
    </points>
  );
}

export interface WorldMapProps {
  levels: LevelDef[];
  stars: Record<number, number>;
  currentId: number;
  heroColor: string;
  heroGlow?: string;
  focus: React.MutableRefObject<number>;
  focusLand: number;
  openedChests: number[];
  onSelect: (level: LevelDef) => void;
  onMerchant: () => void;
  onChest: (land: number) => void;
}

export function WorldMap3D({ levels, stars, currentId, heroColor, heroGlow, focus, focusLand, openedChests, onSelect, onMerchant, onChest }: WorldMapProps) {
  const first = levels[0];
  const world = LANDS[first.land].world;
  const lands = [...new Set(levels.map((l) => l.land))];
  const unlocked = (id: number) => id <= currentId;
  const heroIndex = levels.findIndex((l) => l.id === currentId);
  const sky = LANDS[focusLand]?.sky ?? LANDS[first.land].sky;
  const dark = world !== 'fantasy';

  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 7, 7.5], fov: 50 }}>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 12, 30]} />
      <hemisphereLight args={[dark ? '#b0bec5' : '#ffffff', '#33302a', dark ? 0.9 : 1.2]} />
      <directionalLight position={[5, 10, 4]} intensity={dark ? 1.2 : 1.8} castShadow />
      <CameraRig focus={focus} />
      {world === 'space' && <Stars />}

      {lands.map((land, index) => {
        const L = LANDS[land];
        const landLevels = levels.filter((l) => l.land === land);
        const open = unlocked(landLevels[0].id);
        const z0 = -(index * LAND_SIZE - 0.6) * STEP;
        const len = Math.max(1, landLevels.length) * STEP;
        const chestAt = nodePos(index * LAND_SIZE + 5);
        const cartAt = nodePos(index * LAND_SIZE + 1);
        const near = Math.abs(land - focusLand) <= 1;
        return (
          <group key={land}>
            <mesh position={[0, -0.05, z0 - len / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[24, len]} />
              <meshStandardMaterial color={open ? L.ground : '#5f5f66'} />
            </mesh>
            {open && <Decor world={world === 'castle' ? 'zombie' : world} land={land} index={index} accent={L.accent} />}
            {open && landLevels.length > 1 && (
              <>
                <Cart position={[cartAt[0] - 2.2, 0, cartAt[2]]} onClick={onMerchant} />
                {near && (
                  <Suspense fallback={null}>
                    <Actor color="#7e57c2" anim="Wave" position={[cartAt[0] - 1.3, 0, cartAt[2] + 0.4]} rotation={0.6} scale={0.9} onClick={onMerchant} />
                  </Suspense>
                )}
                <Chest position={[chestAt[0] + 2, 0, chestAt[2]]} opened={openedChests.includes(land)} onClick={() => onChest(land)} />
              </>
            )}
            {!open && (
              // Туман Лени над закрытой землёй.
              <mesh position={[0, 1.2, z0 - len / 2]}>
                <boxGeometry args={[24, 2.6, len]} />
                <meshStandardMaterial color="#9e9ea8" transparent opacity={0.55} depthWrite={false} />
              </mesh>
            )}
            {near && (
              <Suspense fallback={null}>
                {landLevels
                  .filter((l) => l.type === 'boss')
                  .map((l) => {
                    const p = nodePos(levels.indexOf(l));
                    const beaten = (stars[l.id] ?? 0) > 0;
                    return (
                      <Actor
                        key={l.id}
                        color={L.boss.color}
                        anim={beaten ? 'Sitting' : 'Idle'}
                        stone={beaten}
                        glow={beaten ? undefined : L.boss.color}
                        scale={L.boss.scale * 0.7}
                        position={[p[0] + 1.4, 0, p[2] - 0.6]}
                        rotation={-0.5}
                        onClick={() => onSelect(l)}
                      />
                    );
                  })}
              </Suspense>
            )}
          </group>
        );
      })}

      {levels.slice(1).map((l, n) => {
        const a = nodePos(n);
        const b = nodePos(n + 1);
        const mid: [number, number, number] = [(a[0] + b[0]) / 2, 0.01, (a[2] + b[2]) / 2];
        const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
        return (
          <mesh key={l.id} position={mid} rotation={[-Math.PI / 2, 0, Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI / 2]}>
            <planeGeometry args={[length, 0.45]} />
            <meshStandardMaterial color={unlocked(l.id) ? '#d7ccc8' : '#77777e'} />
          </mesh>
        );
      })}

      {levels.map((l, i) => (
        <Node
          key={l.id}
          level={l}
          i={i}
          state={!unlocked(l.id) ? 'locked' : l.id === currentId && !stars[l.id] ? 'current' : stars[l.id] ? 'done' : 'open'}
          onSelect={() => onSelect(l)}
        />
      ))}

      {heroIndex >= 0 && (
        <Suspense fallback={null}>
          <Actor color={heroColor} glow={heroGlow} anim="Idle" position={[nodePos(heroIndex)[0], 0.25, nodePos(heroIndex)[2]]} />
        </Suspense>
      )}
    </Canvas>
  );
}
