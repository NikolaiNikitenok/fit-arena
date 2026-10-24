// Особые украшения: статуи за рекорды в зале (герой на постаменте из бронзы, серебра или золота)
// и знамёна клана (полотнище с флагом клана машет на ветру). Постаменты и древки — в общих
// инстансах деревни (decorLook в looks.ts), здесь только фигуры и ткань.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GRID } from '../../shared/village';
import { defaultFlag, parseFlag } from '../../shared/clan';
import { ANIMS_URL, charUrl, useGltf, type CharName } from '../three/kit';
import { COLORS, PATTERN_PATHS, SHAPE, SYMBOLS } from '../clan/Flag';
import type { Decor } from './decor';

const W = (c: number) => c - GRID / 2;
const METAL: Record<string, { color: string; metalness: number; roughness: number }> = {
  statue1: { color: '#d08a50', metalness: 0.35, roughness: 0.4 },
  statue2: { color: '#e6ecf4', metalness: 0.35, roughness: 0.3 },
  statue3: { color: '#ffd45e', metalness: 0.4, roughness: 0.25 },
};

/** Герой на постаменте: модель героя в победной позе, целиком из металла. */
function Statue({ d, model }: { d: Decor; model: CharName }) {
  const gltf = useGltf(charUrl(model));
  const anims = useGltf(ANIMS_URL);
  const root = useMemo(() => {
    const r = cloneSkinned(gltf.scene) as THREE.Group;
    const m = METAL[d.k];
    const mat = new THREE.MeshStandardMaterial({ color: m.color, metalness: m.metalness, roughness: m.roughness, emissive: m.color, emissiveIntensity: 0.12 });
    r.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = mat;
      mesh.castShadow = true;
    });
    // Поза — кадр из «ура»: руки вверх.
    const clip = anims.animations.find((a) => a.name === 'Cheer');
    if (clip) {
      const mixer = new THREE.AnimationMixer(r);
      const act = mixer.clipAction(clip);
      act.play();
      mixer.setTime(clip.duration * 0.35);
    }
    const box = new THREE.Box3().setFromObject(r);
    r.scale.setScalar(1.25 / Math.max(0.5, box.max.y - Math.min(0, box.min.y)));
    return r;
  }, [gltf, anims, d.k]);
  useEffect(
    () => () => {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
      });
    },
    [root],
  );
  return <primitive object={root} position={[W(d.x + 0.5), 0.4, W(d.y + 0.5)]} rotation={[0, Math.PI / 4, 0]} />;
}

/** Картинка флага клана на холсте (те же цвета, узоры и символы, что у знамени в клане). */
function flagTexture(flag: string): THREE.CanvasTexture {
  const [bg, pattern, symbol, fg] = parseFlag(flag) ?? parseFlag(defaultFlag('?'))!;
  const c = document.createElement('canvas');
  c.width = 80;
  c.height = 104;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  // Полотнище в форме знамени клана: прямоугольник с вырезом снизу.
  g.clip(new Path2D(SHAPE));
  g.fillStyle = COLORS[bg];
  g.fillRect(0, 0, 40, 52);
  g.fillStyle = COLORS[fg];
  for (const p of PATTERN_PATHS[pattern]) g.fill(new Path2D(p));
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.fillRect(0, 0, 40, 6);
  const light = [2, 9].includes([1, 2, 3].includes(pattern) ? fg : bg);
  g.save();
  g.translate(10.4, 10.5);
  g.scale(0.8, 0.8);
  g.fillStyle = light ? '#1b1d26' : '#ffffff';
  g.fill(new Path2D(SYMBOLS[symbol]), 'evenodd');
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Полотнище знамени: висит с перекладины и колышется. */
function Banner({ d, flag }: { d: Decor; flag: string }) {
  const tex = useMemo(() => flagTexture(flag), [flag]);
  const geo = useMemo(() => new THREE.PlaneGeometry(0.62, 0.8, 8, 4), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useEffect(() => () => [tex, geo].forEach((x) => x.dispose()), [tex, geo]);
  const ph = d.x * 1.7 + d.y * 0.9;
  useFrame(() => {
    const pos = geo.attributes.position;
    const t = performance.now() / 1000;
    for (let k = 0; k < pos.count; k++) {
      const x = base[k * 3];
      const y = base[k * 3 + 1];
      // От древка (левый край) волна сильнее к свободному краю.
      const f = (x + 0.31) / 0.62;
      pos.setZ(k, 0.07 * f * Math.sin(t * 3.2 + f * 4 + ph) + 0.02 * Math.sin(t * 5 + y * 6));
    }
    pos.needsUpdate = true;
  });
  return (
    <group position={[W(d.x + 0.5), 0, W(d.y + 0.5)]} rotation={[0, Math.PI / 4, 0]} scale={1.25}>
      <mesh position={[0.33, 2.16, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.7, 6]} />
        <meshStandardMaterial color="#6f4a2a" />
      </mesh>
      <mesh geometry={geo} position={[0.36, 1.76, 0]} castShadow>
        <meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.9} alphaTest={0.5} />
      </mesh>
    </group>
  );
}

/** Фигуры статуй и полотнища знамён для украшений в деревне. */
export function DecorExtras({ decor, hero, clanFlag }: { decor: Decor[]; hero: CharName; clanFlag?: string }) {
  return (
    <>
      {decor.map((d) =>
        d.k === 'statue1' || d.k === 'statue2' || d.k === 'statue3' ? <Statue key={d.i} d={d} model={hero} /> : d.k === 'clanflag' ? <Banner key={d.i} d={d} flag={clanFlag ?? '9.0.4.9'} /> : null,
      )}
    </>
  );
}
