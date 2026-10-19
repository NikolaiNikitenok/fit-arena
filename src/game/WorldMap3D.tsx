import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Actor } from '../three/Actor';
import { Character } from '../three/Character';
import { CharName } from '../three/kit';
import { Prop } from '../three/Prop';
import { Sky } from '../three/Sky';
import { LANDS } from './lands';
import { LevelDef } from './levels';
import { LOOK } from './look';
import { Scenery } from './Scenery';
import { generateWorld, levelZ, pathX, WorldLayout } from './worldgen';

// 3D-карта мира из моделей KayKit: остров с дорогой через десять земель, деревни, леса, реки,
// горы; закрытые земли под туманом Лени. Карту листают пальцем, камера летит вдоль дороги.



function CameraRig({ focus, layout, sun }: { focus: React.MutableRefObject<number>; layout: WorldLayout; sun: React.RefObject<THREE.DirectionalLight | null> }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  useFrame(() => {
    const z = levelZ(focus.current);
    const x = pathX(z, layout.world);
    camera.position.lerp(new THREE.Vector3(x * 0.6 + 1.5, 7.5, z + 8.5), 0.1);
    look.current.lerp(new THREE.Vector3(x, 0, z - 2), 0.1);
    camera.lookAt(look.current);
    if (sun.current) {
      sun.current.position.set(x + 8, 14, z + 6);
      sun.current.target.position.set(x, 0, z - 2);
      sun.current.target.updateMatrixWorld();
    }
  });
  return null;
}

// Номер уровня над камнем дороги.
const labelCache = new Map<string, THREE.Texture>();
function labelTexture(text: string, color: string): THREE.Texture {
  const key = `${text}|${color}`;
  let tex = labelCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = "900 44px Nunito, system-ui, sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,.75)';
  g.strokeText(text, 64, 34);
  g.fillStyle = color;
  g.fillText(text, 64, 34);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, tex);
  return tex;
}

type NodeState = 'locked' | 'open' | 'current' | 'done';

function LevelStone({ level, x, z, state, stars, onSelect }: { level: LevelDef; x: number; z: number; state: NodeState; stars: number; onSelect: () => void }) {
  const ref = useRef<THREE.Group>(null!);
  const boss = level.type === 'boss';
  useFrame(() => {
    if (state === 'current') ref.current.position.y = 0.05 + 0.05 * Math.sin(performance.now() / 220);
  });
  const ring = state === 'locked' ? '#6b6b73' : state === 'done' ? '#ffcb3b' : state === 'current' ? '#ff6a3d' : '#f4efe4';
  const text = boss ? '☠' : String(level.num);
  return (
    <group
      ref={ref}
      position={[x, 0.05, z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[boss ? 0.62 : 0.45, boss ? 0.7 : 0.52, 0.18, 6]} />
        <meshStandardMaterial color="#b9b2a6" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[boss ? 0.42 : 0.3, boss ? 0.56 : 0.42, 6]} />
        <meshStandardMaterial color={ring} emissive={ring} emissiveIntensity={state === 'current' ? 0.8 : 0.25} />
      </mesh>
      <sprite position={[0, boss ? 1.2 : 0.75, 0]} scale={[0.9, 0.45, 1]}>
        <spriteMaterial map={labelTexture(text, state === 'locked' ? '#9a9aa2' : stars ? '#ffd54a' : '#ffffff')} depthWrite={false} />
      </sprite>
    </group>
  );
}

function FogOfLaziness({ z0, z1 }: { z0: number; z1: number }) {
  const len = z0 - z1;
  return (
    <group position={[0, 0, (z0 + z1) / 2]}>
      {/* Низкая дымка над закрытыми землями: видно, что там, но земля ещё во власти Лени. */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[44, 0.7, len]} />
        <meshStandardMaterial color="#b9b4c8" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[44, 0.8, len]} />
        <meshStandardMaterial color="#b9b4c8" transparent opacity={0.08} depthWrite={false} />
      </mesh>
    </group>
  );
}

export interface WorldMapProps {
  levels: LevelDef[];
  stars: Record<number, number>;
  currentId: number;
  hero: CharName;
  heroTint?: string;
  heroGlow?: string;
  focus: React.MutableRefObject<number>;
  focusLand: number;
  openedChests: number[];
  onSelect: (level: LevelDef) => void;
  onMerchant: () => void;
  onChest: (land: number) => void;
}

export function WorldMap3D(props: WorldMapProps) {
  const layout = useMemo(() => generateWorld(props.levels), [props.levels]);
  const look = LOOK[layout.world];
  const sun = useRef<THREE.DirectionalLight>(null);
  return (
    <Canvas shadows dpr={[1, 1.6]} camera={{ position: [0, 7.5, 8.5], fov: 48, far: 400 }} gl={{ antialias: true }}>
      <Sky top={look.top} horizon={look.horizon} stars={look.stars} planet={look.planet} />
      <fog attach="fog" args={[look.fog, 16, 42]} />
      <hemisphereLight args={['#ffffff', '#4a4038', layout.world === 0 ? 1.3 : 1.0]} />
      <directionalLight ref={sun} intensity={look.light} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.0005} />
      <CameraRig focus={props.focus} layout={layout} sun={sun} />
      <Suspense fallback={null}>
        <MapContent key={layout.world} {...props} layout={layout} />
      </Suspense>
    </Canvas>
  );
}

function MapContent({ layout, levels, stars, currentId, hero, heroTint, heroGlow, focusLand, openedChests, onSelect, onMerchant, onChest }: WorldMapProps & { layout: WorldLayout }) {
  const unlocked = (id: number) => id <= currentId;
  const heroIndex = levels.findIndex((l) => l.id === currentId);
  const near = (land: number) => Math.abs(land - focusLand) <= 1;
  const space = layout.lib === 'space';
  const city = layout.lib === 'city';

  return (
    <>
      <Scenery layout={layout} />

      {levels.map((l, i) => {
        const n = layout.nodes[i];
        if (Math.abs(i - Math.max(0, heroIndex)) > 40 && !near(l.land)) return null;
        return (
          <LevelStone
            key={l.id}
            level={l}
            x={n.x}
            z={n.z}
            stars={stars[l.id] ?? 0}
            state={!unlocked(l.id) ? 'locked' : l.id === currentId && !stars[l.id] ? 'current' : stars[l.id] ? 'done' : 'open'}
            onSelect={() => onSelect(l)}
          />
        );
      })}

      {layout.lands.map((L) => {
        const land = LANDS[L.land];
        const first = levels.find((l) => l.land === L.land)!;
        const open = unlocked(first.id);
        const bossLevel = levels.find((l) => l.land === L.land && l.type === 'boss');
        const beaten = bossLevel ? (stars[bossLevel.id] ?? 0) > 0 : false;
        return (
          <group key={L.land}>
            {!open && <FogOfLaziness z0={L.z0} z1={L.z1} />}
            {L.chest && open && (
              <Prop
                lib="fantasy"
                name={openedChests.includes(L.land) ? 'chest' : 'chest_gold'}
                position={[L.chest.x, 0, L.chest.z]}
                rotation={Math.PI}
                scale={0.28}
                onClick={() => onChest(L.land)}
              />
            )}
            {near(L.land) && (
              <Suspense fallback={null}>
                {L.merchant && open && (
                  <Character model="Mage" anim="interact" pulse={0} tint="#d9c2ff" position={[L.merchant.x + 0.2, 0, L.merchant.z + 0.3]} rotation={0.4} scale={0.42} onClick={onMerchant} />
                )}
                {open &&
                  L.villagers.map((v, j) => (
                    <Character key={j} model={v.model} anim={j % 2 ? 'cheer' : 'idle'} position={[v.x, 0, v.z]} rotation={j ? -0.6 : 0.6} scale={0.38} />
                  ))}
                {!beaten &&
                  L.enemies.map((e, j) =>
                    space ? (
                      <Actor key={j} color={land.accent} anim="Walking" scale={0.55} speed={0.6} position={[e.x, 0, e.z]} rotation={-0.5 + j} />
                    ) : (
                      <Character key={j} model={e.model} anim={city ? 'shamble' : j === 1 ? 'taunt' : 'idle'} speed={city ? 0.5 : 1} tint={city ? 'mul:0.75,1.15,0.6' : undefined} position={[e.x, 0, e.z]} rotation={-0.3 + j * 0.4} scale={0.38} />
                    ),
                  )}
                {L.boss &&
                  bossLevel &&
                  (space ? (
                    <Actor color={land.boss.color} anim={beaten ? 'Sitting' : 'Idle'} stone={beaten} glow={beaten ? undefined : land.boss.color} scale={1.1} position={[L.boss.x, 0, L.boss.z]} rotation={-0.4} onClick={() => onSelect(bossLevel)} />
                  ) : (
                    <Character
                      model={L.land % 3 === 2 ? 'Skeleton_Mage' : 'Skeleton_Warrior'}
                      anim={beaten ? 'dead' : 'taunt'}
                      tint={beaten ? undefined : land.boss.color}
                      glow={beaten ? undefined : land.boss.color}
                      scale={0.75}
                      position={[L.boss.x, 0, L.boss.z]}
                      rotation={-0.4}
                      onClick={() => onSelect(bossLevel)}
                    />
                  ))}
              </Suspense>
            )}
          </group>
        );
      })}

      {heroIndex >= 0 && (
        <Character model={hero} tint={heroTint} glow={heroGlow} anim="idle" position={[layout.nodes[heroIndex].x, 0.15, layout.nodes[heroIndex].z]} scale={0.42} />
      )}
    </>
  );
}
