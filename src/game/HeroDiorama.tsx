import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { LibName } from '../three/kit';
import { Prop } from '../three/Prop';
import { getSettings } from '../settings';
import type { World } from './lands';

// Подставка героя на главной — кусочек мира, где он сейчас сражается: земля из плиток KayKit,
// предметы вокруг (сзади и по бокам, чтобы не заслонять героя), свет и частицы этого мира.
// Пока библиотека грузится — простая подставка, как раньше.

interface Piece {
  name: string;
  at: [number, number, number];
  rot?: number;
  scale: number;
}

interface Look {
  lib: LibName;
  // Земля: плитка библиотеки (сдвиг по высоте — чтобы её верх был на нуле) или свой шестигранник:
  // у плиток KayKit трава под светом главной выглядит лимонной.
  base: Piece | { top: string; side: string };
  props: Piece[];
  light: { sky: string; ground: string; key: string; rim: string };
  motes: { color: string; speed: number; size: number };
}

const LOOKS: Record<World, Look> = {
  // Королевство: травяной холм, дерево, флаг, камни и стойка с оружием, тёплый закат и светлячки.
  fantasy: {
    lib: 'fantasy',
    base: { top: '#5fa548', side: '#7a5536' },
    props: [
      { name: 'tree_single_A', at: [-0.78, 0, -0.62], scale: 1.75 },
      { name: 'tree_single_B', at: [-0.2, 0, -0.98], scale: 1.35, rot: 1 },
      { name: 'flag_blue', at: [0.86, 0, -0.5], scale: 2.6, rot: -0.4 },
      { name: 'rock_single_B', at: [0.55, 0, -0.85], scale: 2.4 },
      { name: 'rock_single_D', at: [-0.92, 0, 0.18], scale: 2.2, rot: 2 },
      { name: 'weaponrack', at: [-0.62, 0, 0.62], scale: 2.1, rot: 0.6 },
    ],
    light: { sky: '#ffffff', ground: '#3a3040', key: '#fff3e2', rim: '#ff9a5c' },
    motes: { color: '#ffe082', speed: 0.12, size: 0.055 },
  },
  // Космос: посадочная площадка, камни, прожектор и груз, холодный свет и звёздная пыль.
  space: {
    lib: 'space',
    base: { name: 'landingpad_small', at: [0, -0.58, 0], scale: 1.16 },
    props: [
      { name: 'rocks_A', at: [-0.78, 0, -0.62], scale: 0.62, rot: 0.5 },
      { name: 'lights', at: [0.82, 0, -0.62], scale: 1.1 },
      { name: 'cargo_A', at: [-0.82, 0, 0.32], scale: 0.85, rot: 0.4 },
      { name: 'rock_A', at: [0.2, 0, -0.95], scale: 1.2, rot: 2 },
    ],
    light: { sky: '#cfe3ff', ground: '#1a1838', key: '#bfe9ff', rim: '#7c4dff' },
    motes: { color: '#bfe9ff', speed: 0.06, size: 0.04 },
  },
  // Зомби-город: кусок улицы, фонарь, мусорный бак, кусты и гидрант, ядовито-зелёный свет и споры.
  zombie: {
    lib: 'city',
    base: { name: 'base', at: [0, -0.1, 0], scale: 1.05 },
    props: [
      { name: 'streetlight', at: [-0.85, 0, -0.72], scale: 2.2, rot: 0.8 },
      { name: 'dumpster', at: [0.72, 0, -0.66], scale: 1.6, rot: -0.3 },
      { name: 'bush', at: [-0.86, 0, 0.36], scale: 2.1 },
      { name: 'trash_A', at: [0.1, 0, -0.9], scale: 3 },
      { name: 'firehydrant', at: [0.92, 0, 0.05], scale: 2.2 },
    ],
    light: { sky: '#d9f99d', ground: '#1a2416', key: '#e6ffd0', rim: '#aeea00' },
    motes: { color: '#c6ff00', speed: 0.05, size: 0.045 },
  },
  // Замок Князя: каменный двор, башня, красный флаг и мишень, багровый свет и искры.
  castle: {
    lib: 'fantasy',
    base: { top: '#8a8590', side: '#4e4854' },
    props: [
      { name: 'building_tower_A_red', at: [-0.62, 0, -0.85], scale: 0.55, rot: 0.4 },
      { name: 'flag_red', at: [0.84, 0, -0.52], scale: 2.6, rot: -0.4 },
      { name: 'fence_stone_straight', at: [1.0, 0, -0.1], scale: 1, rot: 0 },
      { name: 'target', at: [0.4, 0, -0.9], scale: 2.2 },
      { name: 'rock_single_C', at: [-0.92, 0, 0.22], scale: 2.4, rot: 1 },
    ],
    light: { sky: '#fff0f0', ground: '#2a1020', key: '#ffe8e0', rim: '#ff3d5a' },
    motes: { color: '#ff8a5c', speed: 0.16, size: 0.05 },
  },
};

/** Огоньки над подставкой: светлячки, звёздная пыль, споры или искры — медленно поднимаются по кругу. */
export function Motes({ color, speed, size, count }: Look['motes'] & { count: number }) {
  const points = useRef<THREE.Points>(null!);
  const { geo, seeds } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const seeds = Array.from({ length: count }, () => ({ a: Math.random() * Math.PI * 2, r: 0.5 + Math.random() * 1.1, v: speed * (0.6 + Math.random() * 0.8), y: Math.random() * 2.6, w: Math.random() * 6 }));
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    return { geo, seeds };
  }, [count, speed]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const attr = points.current.geometry.attributes.position as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    seeds.forEach((s, i) => {
      s.y += s.v * dt;
      if (s.y > 2.7) s.y = 0.1;
      s.a += 0.15 * dt;
      // Лёгкое покачивание: огоньки не летят по линейке.
      attr.setXYZ(i, Math.cos(s.a) * s.r + Math.sin(t * 0.9 + s.w) * 0.06, s.y, Math.sin(s.a) * s.r);
    });
    attr.needsUpdate = true;
  });
  return (
    <points ref={points} geometry={geo}>
      <pointsMaterial color={color} size={size} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

/** Свой шестигранник-постамент: верх травы или камня, бока земли. */
function HexBase({ top, side }: { top: string; side: string }) {
  return (
    <mesh position={[0, -0.25, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[1.12, 1.08, 0.5, 6]} />
      <meshStandardMaterial attach="material-0" color={side} flatShading roughness={0.95} />
      <meshStandardMaterial attach="material-1" color={top} flatShading roughness={0.9} />
      <meshStandardMaterial attach="material-2" color={side} flatShading />
    </mesh>
  );
}

/** Простая подставка — пока грузится библиотека мира. */
function PlainBase() {
  return (
    <mesh position={[0, -0.08, 0]} receiveShadow>
      <cylinderGeometry args={[1.05, 1.15, 0.16, 6]} />
      <meshStandardMaterial color="#3a3f52" flatShading />
    </mesh>
  );
}

export function HeroDiorama({ world, ring }: { world: World; ring: string }) {
  const look = LOOKS[world];
  const lite = getSettings().lowPower;
  return (
    <>
      <hemisphereLight args={[look.light.sky, look.light.ground, 1.25]} />
      <directionalLight position={[3, 5, 3]} intensity={2.1} color={look.light.key} castShadow shadow-mapSize={[1024, 1024]} />
      {/* Контровой свет сзади: обводит героя цветом мира и отделяет его от фона. */}
      <pointLight position={[0.5, 2.2, -2.2]} intensity={10} color={look.light.rim} />
      {'top' in look.base && <HexBase {...look.base} />}
      <Suspense fallback={'top' in look.base ? null : <PlainBase />}>
        {'name' in look.base && <Prop lib={look.lib} name={look.base.name} position={look.base.at} scale={look.base.scale} />}
        {look.props.map((p) => (
          <Prop key={p.name + p.at.join()} lib={look.lib} name={p.name} position={p.at} rotation={p.rot ?? 0} scale={p.scale} />
        ))}
      </Suspense>
      {/* Круг редкости снаряжения под ногами героя. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.58, 48]} />
        <meshBasicMaterial color={ring} transparent opacity={0.75} depthWrite={false} toneMapped={false} />
      </mesh>
      <Motes {...look.motes} count={lite ? 14 : 36} />
    </>
  );
}
