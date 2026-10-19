import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Персонаж на основе RobotExpressive (CC0, Tomás Laulhé): герой, жители, приспешники и боссы.
// В модели есть анимации Idle, Walking, Running, Jump, Punch, Death, Dance, Wave, Sitting, ThumbsUp, Yes, No.

export const ROBOT_URL = `${import.meta.env.BASE_URL}models/robot.glb`;
// Модель ростом около 4,5 единиц; в сценах персонаж ростом ~1,1.
const BASE_SCALE = 0.25;

export type Anim = 'Idle' | 'Walking' | 'Running' | 'Jump' | 'Punch' | 'Death' | 'Dance' | 'Wave' | 'Sitting' | 'ThumbsUp' | 'Standing' | 'Yes' | 'No';
const ONCE: Anim[] = ['Death', 'Sitting', 'Jump', 'Punch', 'ThumbsUp', 'Standing', 'Yes', 'No'];

export interface ActorProps {
  color: string;
  anim?: Anim;
  // Смена числа проигрывает разовое движение поверх основного.
  pulse?: number;
  pulseAnim?: Anim;
  // Смена числа — по персонажу попали: вспышка и отскок.
  hit?: number;
  glow?: string;
  // Серый «окаменевший» вид для расколдовываемых жителей.
  stone?: boolean;
  scale?: number;
  speed?: number;
  position?: [number, number, number];
  rotation?: number;
  onClick?: () => void;
}

export function Actor({ color, anim = 'Idle', pulse = 0, pulseAnim = 'Punch', hit = 0, glow, stone, scale = 1, speed = 1, position, rotation = 0, onClick }: ActorProps) {
  const gltf = useLoader(GLTFLoader, ROBOT_URL);
  const holder = useRef<THREE.Group>(null!);

  const { model, materials, mixer, actions } = useMemo(() => {
    const model = cloneSkinned(gltf.scene) as THREE.Group;
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = mat;
      materials.push(mat);
    });
    model.scale.setScalar(BASE_SCALE);
    const mixer = new THREE.AnimationMixer(model);
    const actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    return { model, materials, mixer, actions };
  }, [gltf]);

  useEffect(() => {
    for (const m of materials) {
      if (m.name === 'Main') m.color.set(stone ? '#8a8a8a' : color);
      else if (stone) m.color.set('#6b6b6b');
    }
  }, [color, stone, materials]);

  const current = useRef<THREE.AnimationAction | null>(null);
  const play = (name: Anim, timeScale = speed) => {
    const next = actions[name];
    if (!next) return;
    const once = ONCE.includes(name);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = timeScale;
    next.enabled = true;
    if (current.current && current.current !== next) next.crossFadeFrom(current.current, 0.15, false);
    next.play();
    current.current = next;
  };

  useEffect(() => {
    play(anim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim]);

  useEffect(() => {
    if (current.current) current.current.timeScale = speed;
  }, [speed]);

  // Разовое движение, потом возврат к основному.
  useEffect(() => {
    if (pulse <= 0) return;
    play(pulseAnim, 2);
    const back = (e: { action: THREE.AnimationAction }) => {
      if (e.action === actions[pulseAnim]) play(anim);
    };
    mixer.addEventListener('finished', back);
    return () => mixer.removeEventListener('finished', back);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);

  const hitAt = useRef(-1e9);
  useEffect(() => {
    if (hit > 0) hitAt.current = performance.now();
  }, [hit]);

  const glowColor = useMemo(() => new THREE.Color(glow ?? '#000'), [glow]);
  useFrame((_, delta) => {
    mixer.update(Math.min(delta, 0.1));
    const h = Math.min(1, (performance.now() - hitAt.current) / 320);
    const recoil = h < 1 ? Math.sin(h * Math.PI) : 0;
    holder.current.position.z = -0.2 * recoil;
    const g = glow ? 0.35 + 0.15 * Math.sin(performance.now() / 300) : 0;
    for (const m of materials) {
      m.emissive.copy(glowColor).multiplyScalar(g);
      m.emissive.r = Math.max(m.emissive.r, 0.9 * recoil);
    }
  });

  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      scale={scale}
      onClick={
        onClick &&
        ((e) => {
          e.stopPropagation();
          onClick();
        })
      }
    >
      <group ref={holder}>
        <primitive object={model} />
      </group>
    </group>
  );
}
