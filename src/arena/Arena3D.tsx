import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { canvasProps, getSettings } from '../settings';
import { CharAnim, Character, CharacterProps } from '../three/Character';
import { Instanced, Placed } from '../three/Instanced';
import { CharName } from '../three/kit';
import { Prop } from '../three/Prop';
import { Sky } from '../three/Sky';

// Дуэль на каменной арене посреди фэнтези-долины: герой игрока против соперника из KayKit.
// Анимации запускаются сменой счётчиков: punchSeq — боец бьёт, hitSeq — по нему попали.

export interface FighterLook {
  model: CharName;
  tint?: string;
  glow?: string;
  hands?: CharacterProps['hands'];
  punchSeq: number;
  hitSeq: number;
  combo: boolean;
  knockedOut: boolean;
  won: boolean;
  // Проиграл по очкам: сидит без сил.
  lost?: boolean;
  scale?: number;
  enraged?: boolean;
}

export interface Arena3DProps {
  player: FighterLook;
  opponent: FighterLook;
}

const R = 2.6;
const HERO_SCALE = 0.55;
const LUNGE_MS = 420;
const HIT_MS = 360;
// Бойцы стоят на диагонали: герой ближе к камере, соперник дальше.
const SPOT = 0.95;
const PLAYER_POS = new THREE.Vector3(-SPOT * 0.75, 0, SPOT * 0.6);
const OPPONENT_POS = new THREE.Vector3(SPOT * 0.75, 0, -SPOT * 0.6);

// Соперник-бот по уровню: от скелета-новичка до варвара-чемпиона.
const BOTS: Pick<FighterLook, 'model' | 'tint' | 'glow'>[] = [
  { model: 'Skeleton_Minion' },
  { model: 'Skeleton_Warrior', tint: 'mul:1.05,0.95,0.85' },
  { model: 'Barbarian', tint: 'mul:1.15,0.8,0.7', glow: '#ff6d00' },
  { model: 'Skeleton_Mage', tint: 'mul:0.8,0.75,1.2', glow: '#b388ff' },
];
export const botLook = (level: number) => BOTS[Math.max(0, Math.min(BOTS.length - 1, Math.floor(level)))];

// Соперник-человек: рыцарь или разбойник своего цвета, по имени, чтобы не менялся от боя к бою.
const RIVAL_TINTS = ['mul:0.6,0.8,1.5', 'mul:1.45,0.6,0.6', 'mul:0.6,1.3,0.7', 'mul:1.1,0.6,1.4'];
export function rivalLook(name: string, hero: CharName): Pick<FighterLook, 'model' | 'tint'> {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // Рыцарю достаётся разбойник и наоборот, чтобы бойцов не путать.
  const model: CharName = hero === 'Knight' ? 'Rogue' : hero === 'Rogue' ? 'Knight' : h % 2 ? 'Rogue' : 'Knight';
  return { model, tint: RIVAL_TINTS[h % RIVAL_TINTS.length] };
}

function Fighter({ look, position, face, other }: { look: FighterLook; position: THREE.Vector3; face: number; other: THREE.Vector3 }) {
  const holder = useRef<THREE.Group>(null!);
  const dir = useMemo(() => other.clone().sub(position).setY(0).normalize(), [other, position]);
  const lungeAt = useRef(-1e9);
  const hitAt = useRef(-1e9);
  useEffect(() => {
    if (look.punchSeq > 0) lungeAt.current = performance.now();
  }, [look.punchSeq]);
  useEffect(() => {
    if (look.hitSeq > 0) hitAt.current = performance.now();
  }, [look.hitSeq]);

  useFrame(() => {
    const now = performance.now();
    // Выпад вперёд на ударе и отброс назад от попадания.
    const l = Math.min(1, (now - lungeAt.current) / LUNGE_MS);
    const h = Math.min(1, (now - hitAt.current) / HIT_MS);
    const shift = (l < 1 ? 0.28 * Math.sin(l * Math.PI) : 0) - (h < 1 ? 0.22 * Math.sin(h * Math.PI) : 0);
    holder.current.position.copy(position).addScaledVector(dir, shift);
  });

  const anim: CharAnim = look.knockedOut ? 'death' : look.won ? 'cheer' : look.lost ? 'sit' : 'idle';
  const s = HERO_SCALE * (look.scale ?? 1);
  return (
    <group ref={holder}>
      <Character
        model={look.model}
        tint={look.tint}
        glow={look.enraged ? '#ff1744' : look.glow}
        hands={look.hands}
        anim={anim}
        pulse={look.knockedOut ? 0 : look.punchSeq}
        pulseAnim={look.combo ? 'punch' : 'attack'}
        hit={look.hitSeq}
        hitAnim="hit"
        scale={s}
        rotation={face}
      />
      {look.enraged && <pointLight position={[0, 1.4, 0]} color="#ff2d2d" intensity={5} distance={3.5} />}
    </group>
  );
}

/** Вспышка удара у того, по кому попали: золотая на комбо. */
function Impact({ seq, combo, at, from }: { seq: number; combo: boolean; at: THREE.Vector3; from: THREE.Vector3 }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const start = useRef(-1e9);
  const pos = useMemo(() => at.clone().lerp(from, 0.28).setY(0.75), [at, from]);
  useEffect(() => {
    if (seq > 0) start.current = performance.now();
  }, [seq]);
  useFrame(({ camera }) => {
    const t = (performance.now() - start.current) / 380;
    const on = t >= 0 && t < 1;
    mesh.current.visible = ring.current.visible = on;
    if (!on) return;
    const k = combo ? 1.5 : 1;
    mesh.current.scale.setScalar((0.12 + 0.35 * t) * k);
    mesh.current.rotation.set(t * 3, t * 5, 0);
    (mesh.current.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    ring.current.quaternion.copy(camera.quaternion);
    ring.current.scale.setScalar((0.2 + 0.7 * t) * k);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
  });
  const color = combo ? '#ffd54f' : '#fff3e0';
  return (
    <group position={pos}>
      <mesh ref={mesh} visible={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={ring} visible={false}>
        <ringGeometry args={[0.7, 1, 24]} />
        <meshBasicMaterial color={combo ? '#ff9100' : '#ffcc80'} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Искры над жаровнями медленно поднимаются в тёплом воздухе. */
function Embers({ count = 60 }: { count?: number }) {
  const points = useRef<THREE.Points>(null!);
  const { geo, seeds } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const seeds = Array.from({ length: count }, () => ({ a: Math.random() * Math.PI * 2, r: R * (0.6 + Math.random() * 0.7), v: 0.15 + Math.random() * 0.25, y: Math.random() * 3 }));
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    return { geo, seeds };
  }, [count]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((_, delta) => {
    const attr = points.current.geometry.attributes.position as THREE.BufferAttribute;
    seeds.forEach((s, i) => {
      s.y += s.v * Math.min(delta, 0.1);
      if (s.y > 3.2) s.y = 0.3;
      s.a += 0.02 * Math.min(delta, 0.1);
      attr.setXYZ(i, Math.cos(s.a) * s.r, s.y, Math.sin(s.a) * s.r);
    });
    attr.needsUpdate = true;
  });
  return (
    <points ref={points} geometry={geo}>
      <pointsMaterial color="#ffb74d" size={0.05} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** Факелы мерцают: два общих огонька вместо света на каждом. */
function TorchLights() {
  const a = useRef<THREE.PointLight>(null!);
  const b = useRef<THREE.PointLight>(null!);
  useFrame(() => {
    const t = performance.now() / 1000;
    a.current.intensity = 9 + 2 * Math.sin(t * 9) + 1.5 * Math.sin(t * 23);
    b.current.intensity = 9 + 2 * Math.sin(t * 8 + 2) + 1.5 * Math.sin(t * 19 + 1);
  });
  return (
    <>
      <pointLight ref={a} position={[-R * 0.95, 1.2, -R * 0.4]} color="#ff9e40" distance={6} decay={1.6} />
      <pointLight ref={b} position={[R * 0.95, 1.2, -R * 0.4]} color="#ff9e40" distance={6} decay={1.6} />
    </>
  );
}

// Кольцо арены: колонны и факелы по кругу, сзади знамёна, стойки с оружием и бочки, дальше — долина.
function useDecor() {
  return useMemo(() => {
    const ring: Placed[] = [];
    const n = 10;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.PI / n;
      // Перед камерой колонны не ставим, чтобы не закрывали бой.
      const front = Math.sin(a) > 0.55 && Math.cos(a) > -0.6;
      if (front) continue;
      const x = Math.cos(a) * (R + 0.25);
      const z = Math.sin(a) * (R + 0.25);
      ring.push(k % 2 ? { name: 'torch_lit', x, z, s: 1.1 } : { name: 'column', x, z, s: 0.75, ry: a });
    }
    // Каменная ограда по дуге за ареной.
    for (let k = 0; k < 14; k++) {
      const a = Math.PI + (k / 13) * Math.PI;
      ring.push({ name: 'fence_stone_straight', x: Math.cos(a) * (R + 0.9), z: Math.sin(a) * (R + 0.9), ry: -a, s: 0.7 });
    }
    const near: Placed[] = [
      { name: 'barrel', x: -R - 0.55, z: 0.9, s: 0.55 },
      { name: 'barrel_small_stack', x: -R - 0.9, z: 0.2, s: 0.5, ry: 0.6 },
      { name: 'crates_stacked', x: R + 0.85, z: 0.55, s: 0.5, ry: -0.4 },
      { name: 'barrel_large', x: R + 0.6, z: 1.35, s: 0.45 },
      { name: 'weaponrack', x: -1.4, z: -R - 0.55, s: 1.6, ry: 0.35 },
      { name: 'weaponrack', x: 1.5, z: -R - 0.5, s: 1.6, ry: -0.35 },
      { name: 'target', x: 2.4, z: -R - 0.9, s: 1.1, ry: -0.6 },
      { name: 'flag_red', x: -R - 1.2, z: -1.6, s: 1.1 },
      { name: 'flag_blue', x: R + 1.2, z: -1.6, s: 1.1 },
    ];
    const far: Placed[] = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 34; k++) {
      const a = Math.PI * 0.92 + rnd() * Math.PI * 1.16;
      const r = 5.2 + rnd() * 7;
      const pick = rnd();
      const name = pick < 0.45 ? 'trees_A_medium' : pick < 0.7 ? 'trees_B_large' : pick < 0.85 ? 'tree_single_A' : 'rock_single_B';
      far.push({ name, x: Math.cos(a) * r, z: Math.sin(a) * r, ry: rnd() * 6, s: 0.9 + rnd() * 0.5 });
    }
    far.push(
      { name: 'mountain_B_grass_trees', x: -22, z: -42, s: 5, ry: 0.4 },
      { name: 'mountain_A_grass_trees', x: 12, z: -48, s: 5, ry: 1.3 },
      { name: 'mountain_C_grass', x: 30, z: -36, s: 4.5 },
      { name: 'hills_A_trees', x: -15, z: -8, s: 2.4, ry: 2 },
      { name: 'building_castle_red', x: -5.5, z: -14, s: 1.3, ry: 0.5 },
      { name: 'building_tower_A_red', x: 6.4, z: -9, s: 1.1, ry: -0.6 },
      { name: 'building_windmill_yellow', x: 11, z: -13, s: 1.1, ry: -0.9 },
      { name: 'tent', x: -5.6, z: -3.6, s: 1.2, ry: 0.9 },
      { name: 'tent', x: 5.4, z: -3.4, s: 1.2, ry: -0.8 },
    );
    return { ring, near, far };
  }, []);
}

function ArenaFloor() {
  return (
    <group>
      {/* Трава долины и каменное основание арены. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[60, 48]} />
        <meshStandardMaterial color="#7fa650" roughness={1} />
      </mesh>
      <mesh position={[0, 0.06, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[R + 0.5, R + 0.7, 0.16, 20]} />
        <meshStandardMaterial color="#a39a8b" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, 0.17, 0]} receiveShadow>
        <cylinderGeometry args={[R, R + 0.15, 0.08, 20]} />
        <meshStandardMaterial color="#c9b48a" roughness={1} flatShading />
      </mesh>
      {/* Круги на песке и эмблема в центре. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.215, 0]}>
        <ringGeometry args={[R - 0.28, R - 0.18, 40]} />
        <meshBasicMaterial color="#8d6e4a" transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0.215, 0]}>
        <ringGeometry args={[0.5, 0.62, 4]} />
        <meshBasicMaterial color="#8d6e4a" transparent opacity={0.5} />
      </mesh>
      {/* Ступени-трибуны за ареной. */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.16 + i * 0.22, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[R + 2.1 + i * 0.55, R + 2.1 + i * 0.55, 0.32 + i * 0.44, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
          <meshStandardMaterial color={i % 2 ? '#9a9080' : '#b0a594'} roughness={0.95} flatShading side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({ player, opponent }: Arena3DProps) {
  const { ring, near, far } = useDecor();
  const shake = useRef(-1e9);
  const { camera } = useThree();
  const look = useMemo(() => new THREE.Vector3(0.1, 1.0, -0.4), []);
  const base = useMemo(() => new THREE.Vector3(-1.0, 2.35, 6.6), []);
  useEffect(() => {
    if (player.combo || opponent.combo) shake.current = performance.now();
  }, [player.punchSeq, opponent.punchSeq, player.combo, opponent.combo]);
  useFrame(() => {
    const t = performance.now();
    const s = Math.max(0, 1 - (t - shake.current) / 260) * 0.05;
    // Камера чуть «дышит», на комбо вздрагивает.
    camera.position.set(base.x + Math.sin(t / 2600) * 0.18 + (Math.random() - 0.5) * s, base.y + Math.sin(t / 1900) * 0.05 + (Math.random() - 0.5) * s, base.z);
    camera.lookAt(look);
  });
  const toOpponent = Math.atan2(OPPONENT_POS.x - PLAYER_POS.x, OPPONENT_POS.z - PLAYER_POS.z);
  return (
    <>
      <ArenaFloor />
      <Instanced lib="fantasy" items={ring} />
      <Instanced lib="fantasy" items={near} />
      <Instanced lib="fantasy" items={far} shadows={false} />
      <Prop lib="fantasy" name="banner_red" position={[-0.55, 0, -R - 0.5]} scale={0.34} />
      <Prop lib="fantasy" name="banner_patternA_blue" position={[0.55, 0, -R - 0.5]} scale={0.34} />
      <group position={[0, 0.21, 0]}>
        <Fighter look={player} position={PLAYER_POS} other={OPPONENT_POS} face={toOpponent} />
        <Fighter look={opponent} position={OPPONENT_POS} other={PLAYER_POS} face={toOpponent + Math.PI} />
        <Impact seq={player.hitSeq} combo={opponent.combo} at={PLAYER_POS} from={OPPONENT_POS} />
        <Impact seq={opponent.hitSeq} combo={player.combo} at={OPPONENT_POS} from={PLAYER_POS} />
      </group>
    </>
  );
}

export function Arena3D({ player, opponent }: Arena3DProps) {
  const settings = getSettings();
  return (
    <Canvas {...canvasProps(settings)} camera={{ position: [-1.0, 2.35, 6.6], fov: 38, far: 300 }}>
      <Sky top="#3a5d9c" horizon="#ffd2a1" />
      <fog attach="fog" args={['#f0c49a', 14, 52]} />
      <hemisphereLight args={['#ffe9cc', '#5a4632', 1.25]} />
      <directionalLight
        position={[-5, 7, 3]}
        intensity={2.3}
        color="#ffd9a8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0005}
      />
      <TorchLights />
      {!settings.lowPower && <Embers />}
      <Suspense fallback={null}>
        <Scene player={player} opponent={opponent} />
      </Suspense>
    </Canvas>
  );
}
