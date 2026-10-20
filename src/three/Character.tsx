import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { parseTint } from './Instanced';
import { ANIMS_URL, CharName, charUrl, useGltf } from './kit';

// Персонажи KayKit: рыцарь, маг, варвар, разбойник и скелеты. Скелет у всех общий,
// поэтому анимации лежат в одном файле и подходят любому персонажу.

export type CharAnim =
  | 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'punch' | 'cast' | 'hit' | 'death' | 'dead'
  | 'cheer' | 'sit' | 'lie' | 'taunt' | 'awaken' | 'interact' | 'block' | 'shamble' | 'shoot' | 'chop2' | 'casting';

const CLIPS: Record<CharAnim, string> = {
  idle: 'Idle',
  walk: 'Walking_A',
  shamble: 'Walking_D_Skeletons',
  run: 'Running_A',
  jump: 'Jump_Full_Short',
  attack: '1H_Melee_Attack_Chop',
  punch: 'Unarmed_Melee_Attack_Punch_A',
  cast: 'Spellcast_Shoot',
  hit: 'Hit_A',
  death: 'Death_A',
  dead: 'Death_A_Pose',
  cheer: 'Cheer',
  sit: 'Sit_Floor_Idle',
  lie: 'Lie_Idle',
  taunt: 'Taunt',
  awaken: 'Skeletons_Awaken_Standing',
  interact: 'Interact',
  block: 'Block',
  shoot: '1H_Ranged_Shoot',
  chop2: '2H_Melee_Attack_Chop',
  casting: 'Spellcasting',
};
const ONCE: CharAnim[] = ['jump', 'attack', 'punch', 'cast', 'hit', 'death', 'awaken', 'interact', 'block', 'shoot', 'chop2'];

// Какое снаряжение из набора видно у каждого героя (остальные предметы набора прячем).
const GEAR: Partial<Record<CharName, string[]>> = {
  Knight: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'],
  Barbarian: ['1H_Axe', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape'],
  Mage: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'],
  Rogue: ['Knife', 'Knife_Offhand', 'Rogue_Cape'],
};

export interface CharacterProps {
  model: CharName;
  anim?: CharAnim;
  // Смена числа — разовое движение поверх основного (удар, прыжок).
  pulse?: number;
  pulseAnim?: CharAnim;
  // Смена числа — по персонажу попали: вспышка (и движение hitAnim, если задано).
  hit?: number;
  hitAnim?: CharAnim;
  tint?: string;
  glow?: string;
  stone?: boolean;
  speed?: number;
  scale?: number;
  position?: [number, number, number];
  rotation?: number;
  onClick?: () => void;
  // Снаряжение героя по отдельности: оружие и вещь во второй руке. Если задано,
  // стандартное оружие набора прячется.
  hands?: { weapon?: HandGear; offhand?: HandGear };
}

export interface HandGear {
  mesh: string;
  source: CharName;
  glow?: string;
  // Множитель цвета (mul:r,g,b), чтобы одна модель давала разные вещи.
  tint?: string;
  // Кость руки, если не та, что в наборе.
  bone?: string;
}

const WEAPONISH = /Sword|Shield|Axe|Staff|Wand|Knife|Crossbow|Spellbook|Mug|Throwable/;

export function Character({ model, anim = 'idle', pulse = 0, pulseAnim = 'attack', hit = 0, hitAnim, tint, glow, stone, speed = 1, scale = 1, position, rotation = 0, onClick, hands }: CharacterProps) {
  const gltf = useGltf(charUrl(model));
  const anims = useGltf(ANIMS_URL);

  const { root, materials, mixer } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as THREE.Group;
    const gear = GEAR[model];
    const materials: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (gear && !(mesh as THREE.SkinnedMesh).isSkinnedMesh && !gear.includes(mesh.name)) mesh.visible = false;
      if (hands && !(mesh as THREE.SkinnedMesh).isSkinnedMesh && WEAPONISH.test(mesh.name)) mesh.visible = false;
      mesh.castShadow = true;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = mat;
      materials.push(mat);
    });
    return { root, materials, mixer: new THREE.AnimationMixer(root) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf, model, !!hands]);

  const actions = useMemo(() => {
    const out: Partial<Record<CharAnim, THREE.AnimationAction>> = {};
    for (const [key, clip] of Object.entries(CLIPS) as [CharAnim, string][]) {
      const c = anims.animations.find((a) => a.name === clip);
      if (c) out[key] = mixer.clipAction(c);
    }
    return out;
  }, [anims, mixer]);

  useEffect(() => {
    for (const m of materials) {
      if (stone) m.color.set('#8f8f8f');
      else parseTint(tint, m.color);
    }
  }, [tint, stone, materials]);

  const current = useRef<THREE.AnimationAction | null>(null);
  const play = (name: CharAnim, timeScale = speed) => {
    const next = actions[name] ?? actions.idle;
    if (!next) return;
    const once = ONCE.includes(name) || name === 'death';
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = timeScale;
    next.enabled = true;
    if (current.current && current.current !== next) next.crossFadeFrom(current.current, 0.2, false);
    next.play();
    current.current = next;
  };

  useEffect(() => {
    play(anim);
    // Окаменевший житель замирает.
    if (stone && current.current) current.current.timeScale = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, stone]);

  // Разовое движение, после которого возвращаемся к основному, если его не сменило другое.
  const base = useRef(anim);
  base.current = anim;
  const once = (name: CharAnim) => {
    play(name, 1.6);
    const back = (e: { action: THREE.AnimationAction }) => {
      if (e.action === actions[name] && current.current === e.action) play(base.current);
    };
    mixer.addEventListener('finished', back);
    return () => mixer.removeEventListener('finished', back);
  };

  useEffect(() => {
    if (pulse <= 0 || stone) return;
    return once(pulseAnim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);

  const hitAt = useRef(-1e9);
  useEffect(() => {
    if (hit <= 0) return;
    hitAt.current = performance.now();
    if (hitAnim && !stone && anim === 'idle') return once(hitAnim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit]);

  const glowColor = useMemo(() => new THREE.Color(glow ?? '#000000'), [glow]);
  useFrame((_, delta) => {
    mixer.update(Math.min(delta, 0.1));
    const h = Math.min(1, (performance.now() - hitAt.current) / 300);
    const flash = h < 1 ? Math.sin(h * Math.PI) : 0;
    const g = glow ? 0.25 + 0.12 * Math.sin(performance.now() / 300) : 0;
    for (const m of materials) {
      m.emissive.copy(glowColor).multiplyScalar(g);
      m.emissive.r = Math.max(m.emissive.r, flash);
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
      <primitive object={root} />
      {hands?.weapon && <HandItem root={root} gear={hands.weapon} />}
      {hands?.offhand && <HandItem root={root} gear={hands.offhand} />}
    </group>
  );
}

// Предмет из набора другого героя: берём меш вместе с его положением на кости руки.
function HandItem({ root, gear }: { root: THREE.Object3D; gear: HandGear }) {
  const src = useGltf(charUrl(gear.source));
  useEffect(() => {
    const node = src.scene.getObjectByName(gear.mesh);
    // Имена костей загрузчик очищает от точек: handslot.l → handslotl.
    const boneName = gear.bone ? THREE.PropertyBinding.sanitizeNodeName(gear.bone) : node?.parent?.name;
    const bone = node?.parent && boneName && root.getObjectByName(boneName);
    if (!node || !bone) return;
    const copy = node.clone();
    copy.visible = true;
    // На другой руке: слоты рук зеркальны, предмет разворачиваем вокруг оси кости.
    if (boneName !== node.parent!.name) {
      const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      copy.position.applyQuaternion(flip);
      copy.quaternion.premultiply(flip);
    }
    copy.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      if (gear.tint) mat.color.multiply(parseTint(gear.tint));
      if (gear.glow) {
        mat.emissive.set(gear.glow);
        mat.emissiveIntensity = 0.45;
      }
      m.material = mat;
    });
    bone.add(copy);
    return () => {
      bone.remove(copy);
    };
  }, [src, root, gear.mesh, gear.glow, gear.tint, gear.bone]);
  return null;
}
