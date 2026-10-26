// Строители у стройки: пока постройка строится или улучшается, рядом бегает строитель и стучит по ней молотком.
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GRID, sizeOf } from '../../shared/village';
import { sfx } from '../audio';
import { Character, type CharAnim, type HandGear } from '../three/Character';
import { charUrl, useGltf } from '../three/kit';
import { turnToward } from './troopPose';
import type { ViewBld } from './Village3D';

const W = (c: number) => c - GRID / 2;
const HEIGHT = 1.7;
// Цикл строителя: бежит вокруг стройки, потом стучит молотком, потом снова бежит.
const RUN_S = 2.6;
const KNOCKS = 4;
const KNOCK_S = 0.55;
const CYCLE_S = RUN_S + KNOCKS * KNOCK_S;
// Сколько строителей видно сразу (по числу строителей у ратуши — не больше четырёх).
const MAX = 4;
// Стороны постройки: наружу от центра (x, z), обход против часовой.
const SIDES = [[0, 1], [-1, 0], [0, -1], [1, 0]];

function hammer(): THREE.Object3D {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#9b6b3f', roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: '#8d939e', metalness: 0.6, roughness: 0.35 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.62, 8), wood);
  handle.position.y = 0.22;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.16), iron);
  head.position.y = 0.52;
  for (const m of [handle, head]) m.castShadow = true;
  g.add(handle, head);
  return g;
}

const HANDS: { weapon: HandGear } = { weapon: { mesh: 'hammer', source: 'Barbarian', make: hammer } };

function Builder({ b, k }: { b: ViewBld; k: number }) {
  const g = useRef<THREE.Group>(null);
  const [anim, setAnim] = useState<CharAnim>('run');
  const [pulse, setPulse] = useState(0);
  const st = useRef({ face: 0, knock: -1, t0: performance.now() / 1000 - k * 1.3 });
  const model = useGltf(charUrl('Barbarian'));
  const scale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model.scene);
    return HEIGHT / Math.max(0.5, box.max.y - Math.min(0, box.min.y));
  }, [model]);
  const s = sizeOf(b.t);
  const cx = W(b.x + s / 2);
  const cz = W(b.y + s / 2);
  // Бегает вдоль стен постройки, чуть дальше её края: так не залезает в соседние дома.
  const h = s / 2 + 0.55;
  useFrame((_, dt) => {
    if (!g.current) return;
    const o = st.current;
    const t = performance.now() / 1000 - o.t0;
    const cycle = Math.floor(t / CYCLE_S);
    const into = t - cycle * CYCLE_S;
    const run = into < RUN_S;
    // Каждый цикл — из середины одной стороны через угол к середине следующей, там и стучит.
    const p = (cycle + k + 0.5 + (run ? into / RUN_S : 1)) % 4;
    const side = Math.floor(p);
    const f = (p - side) * 2 - 1;
    const [nx, nz] = SIDES[side];
    const x = cx + nx * h - nz * f * h;
    const z = cz + nz * h + nx * f * h;
    // На бегу смотрит по ходу, у стройки — на неё.
    const face = run ? Math.atan2(-nz, nx) : Math.atan2(-nx, -nz);
    o.face = turnToward(o.face, face, Math.min(1, dt * 10));
    g.current.position.set(x, 0, z);
    g.current.rotation.y = o.face;
    const next: CharAnim = run ? 'run' : 'idle';
    if (next !== anim) setAnim(next);
    if (!run) {
      const knock = cycle * KNOCKS + Math.floor((into - RUN_S) / KNOCK_S);
      if (knock !== o.knock) {
        o.knock = knock;
        setPulse((p) => p + 1);
        // Стук слышно в момент удара, примерно на середине замаха; один строитель — один стук.
        setTimeout(() => sfx('hammer'), 220);
      }
    }
  });
  return (
    <group ref={g}>
      <Character model="Barbarian" tint="mul:1,0.9,0.75" anim={anim} pulse={pulse} pulseAnim="attack" scale={scale} hands={HANDS} />
    </group>
  );
}

/** Строители у всех построек, которые сейчас строятся или улучшаются. */
export function Builders({ buildings }: { buildings: ViewBld[] }) {
  const busy = buildings.filter((b) => b.state === 'new' || b.state === 'up').slice(0, MAX);
  return (
    <>
      {busy.map((b, k) => (
        <Builder key={b.i} b={b} k={k} />
      ))}
    </>
  );
}
