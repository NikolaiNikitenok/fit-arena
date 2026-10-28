import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PetId } from '../game/pets';
import { addOutline, outlinesOn } from './toon';

// Питомцы героя собраны из простых фигур: моделей животных в наборах KayKit нет.
// Живут сами: покачиваются, моргают, виляют хвостом, подпрыгивают на каждый повтор.
// Облик растёт с уровнем: малыш, подросток, взрослый — крупнее и с новыми деталями.

export interface PetProps {
  id: PetId;
  stage?: 0 | 1 | 2;
  sad?: boolean;
  // Смена числа — радостный прыжок (повтор игрока, тап).
  hop?: number;
  // Сам иногда подпрыгивает от радости (дом героя).
  lively?: boolean;
  // Бежит рядом с героем.
  run?: boolean;
  position?: [number, number, number];
  rotation?: number;
  scale?: number;
  onClick?: () => void;
  // Тёмная обводка, как у героя (src/three/toon.ts): на главной питомец стоит рядом с ним.
  outline?: boolean;
}

const STAGE_SCALE = [0.72, 0.86, 1];

type Parts = 'hop' | 'body' | 'head' | 'eyes' | 'tail' | 'wingL' | 'wingR' | 'earL' | 'earR' | 'prop' | 'cloud';

// Пастельный материал: мягкие блики, без плоских граней, чтобы зверьки были круглыми.
const Mat = ({ c, e, r = 0.55, m = 0 }: { c: string; e?: string; r?: number; m?: number }) => (
  <meshStandardMaterial color={c} roughness={r} metalness={m} emissive={e ?? '#000000'} emissiveIntensity={e ? 1.4 : 0} />
);

function Ball({ r, c, p, s, e, m, shadow }: { r: number; c: string; p?: [number, number, number]; s?: [number, number, number]; e?: string; m?: number; shadow?: boolean }) {
  return (
    <mesh position={p} scale={s} castShadow={shadow}>
      <sphereGeometry args={[r, 18, 14]} />
      <Mat c={c} e={e} m={m} r={m ? 0.3 : 0.55} />
    </mesh>
  );
}

function Cone({ r, h, c, p, rot, seg = 10 }: { r: number; h: number; c: string; p?: [number, number, number]; rot?: [number, number, number]; seg?: number }) {
  return (
    <mesh position={p} rotation={rot}>
      <coneGeometry args={[r, h, seg]} />
      <Mat c={c} />
    </mesh>
  );
}

/** Большие блестящие глаза: белок, зрачок и блик. У робота — светодиоды. */
function Eye({ x, y, z, size = 1, led }: { x: number; y: number; z: number; size?: number; led?: string }) {
  if (led) return <Ball r={0.032 * size} c={led} e={led} p={[x, y, z]} s={[1, 1.25, 0.6]} />;
  return (
    <group position={[x, y, z]} scale={size}>
      <Ball r={0.048} c="#ffffff" s={[1, 1.1, 0.7]} />
      <Ball r={0.034} c="#1a1420" p={[0, -0.004, 0.022]} s={[1, 1.12, 0.7]} />
      <Ball r={0.011} c="#ffffff" e="#ffffff" p={[0.012, 0.014, 0.046]} />
    </group>
  );
}

const Cheeks = ({ y, z, w = 0.1 }: { y: number; z: number; w?: number }) => (
  <>
    <Ball r={0.024} c="#ff9db0" p={[-w, y, z]} s={[1.3, 0.8, 0.4]} />
    <Ball r={0.024} c="#ff9db0" p={[w, y, z]} s={[1.3, 0.8, 0.4]} />
  </>
);

/** Иголки ежа и шипы: равномерно по задней половине купола, каждая смотрит наружу. */
function useSpikes(n: number, radius: number) {
  return useMemo(() => {
    const out: { p: [number, number, number]; q: THREE.Quaternion }[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n * 3 && out.length < n; i++) {
      const y = 1 - (i + 0.5) / (n * 1.5);
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * 2.39996;
      const v = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      // Спереди мордочка: иголок нет.
      if (v.z > 0.25 || v.y < -0.15) continue;
      out.push({ p: [v.x * radius, v.y * radius, v.z * radius], q: new THREE.Quaternion().setFromUnitVectors(up, v) });
    }
    return out;
  }, [n, radius]);
}

function Dragon({ stage, reg }: { stage: number; reg: (k: Parts) => (o: THREE.Object3D | null) => void }) {
  const c = '#5fd39a';
  const dark = '#3aa877';
  const belly = '#e3f8cf';
  const gold = '#ffd36b';
  const wing = [0.75, 0.95, 1.15][stage];
  return (
    <>
      <Ball r={0.2} c={c} p={[0, 0.22, 0]} s={[1, 1.05, 1]} shadow />
      <Ball r={0.15} c={belly} p={[0, 0.2, 0.08]} s={[1, 1.1, 0.7]} />
      {[-0.1, 0.1].map((x) => (
        <Ball key={x} r={0.06} c={dark} p={[x, 0.05, 0.06]} s={[1, 0.8, 1.2]} />
      ))}
      <group ref={reg('tail')} position={[0, 0.14, -0.17]}>
        <Cone r={0.07} h={0.28} c={c} p={[0, 0.02, -0.12]} rot={[-1.9, 0, 0]} />
        <Cone r={0.04} h={0.07} c={gold} p={[0, 0.07, -0.27]} rot={[-1.9, 0, 0]} seg={4} />
      </group>
      <group ref={reg('wingL')} position={[-0.13, 0.3, -0.1]}>
        <Ball r={0.13} c={dark} p={[-0.07 * wing, 0.04 * wing, -0.02]} s={[0.9 * wing, 0.7 * wing, 0.12]} />
      </group>
      <group ref={reg('wingR')} position={[0.13, 0.3, -0.1]}>
        <Ball r={0.13} c={dark} p={[0.07 * wing, 0.04 * wing, -0.02]} s={[0.9 * wing, 0.7 * wing, 0.12]} />
      </group>
      {stage >= 2 &&
        [0.4, 0.28, 0.14].map((y, i) => <Cone key={y} r={0.035} h={0.08} c={gold} p={[0, y, -0.16 - i * 0.03]} rot={[-0.5 - i * 0.4, 0, 0]} seg={4} />)}
      <group ref={reg('head')} position={[0, 0.48, 0.04]}>
        <Ball r={0.17} c={c} shadow />
        <Ball r={0.09} c={belly} p={[0, -0.05, 0.13]} s={[1.25, 0.8, 0.9]} />
        <Ball r={0.012} c={dark} p={[-0.03, -0.03, 0.205]} />
        <Ball r={0.012} c={dark} p={[0.03, -0.03, 0.205]} />
        <group ref={reg('eyes')}>
          <Eye x={-0.07} y={0.04} z={0.13} />
          <Eye x={0.07} y={0.04} z={0.13} />
        </group>
        <Cheeks y={-0.03} z={0.14} w={0.12} />
        {stage === 0 ? (
          <>
            <Ball r={0.03} c={gold} p={[-0.07, 0.15, -0.02]} />
            <Ball r={0.03} c={gold} p={[0.07, 0.15, -0.02]} />
          </>
        ) : (
          <>
            <Cone r={0.035} h={0.13 + stage * 0.03} c={gold} p={[-0.08, 0.17, -0.04]} rot={[-0.5, 0, 0.35]} />
            <Cone r={0.035} h={0.13 + stage * 0.03} c={gold} p={[0.08, 0.17, -0.04]} rot={[-0.5, 0, -0.35]} />
          </>
        )}
      </group>
    </>
  );
}

function Cat({ stage, reg }: { stage: number; reg: (k: Parts) => (o: THREE.Object3D | null) => void }) {
  const c = '#ffad5c';
  const cream = '#fff1dc';
  const stripe = '#e07f2f';
  return (
    <>
      <Ball r={0.19} c={c} p={[0, 0.2, 0]} s={[1, 1, 1.1]} shadow />
      <Ball r={0.13} c={cream} p={[0, 0.19, 0.09]} s={[1, 1.1, 0.7]} />
      {[-0.09, 0.09].map((x) => (
        <Ball key={x} r={0.05} c={cream} p={[x, 0.04, 0.11]} />
      ))}
      <group ref={reg('tail')} position={[0, 0.16, -0.18]}>
        <mesh position={[0, 0.12, -0.04]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.12, 0.032, 8, 18, Math.PI * 1.1]} />
          <Mat c={stripe} />
        </mesh>
      </group>
      {stage >= 2 && (
        <group position={[0, 0.34, 0.04]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.12, 0.018, 8, 24]} />
            <Mat c="#e53950" />
          </mesh>
          <Ball r={0.032} c="#ffd36b" m={0.6} p={[0, -0.03, 0.13]} />
        </group>
      )}
      <group ref={reg('head')} position={[0, 0.47, 0.04]}>
        <Ball r={0.17} c={c} s={[1.08, 0.95, 1]} shadow />
        <Ball r={0.075} c={cream} p={[0, -0.05, 0.12]} s={[1.4, 0.9, 0.8]} />
        <Ball r={0.018} c="#ff7a8a" p={[0, -0.02, 0.18]} />
        <group ref={reg('eyes')}>
          <Eye x={-0.07} y={0.03} z={0.135} />
          <Eye x={0.07} y={0.03} z={0.135} />
        </group>
        <Cheeks y={-0.04} z={0.14} w={0.12} />
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 0.12, -0.05, 0.15]} rotation={[0, 0, sd * 0.15]}>
            <boxGeometry args={[0.12, 0.004, 0.004]} />
            <meshBasicMaterial color="#5a3a24" />
          </mesh>
        ))}
        {stage >= 1 &&
          [-0.05, 0, 0.05].map((x) => <Ball key={x} r={0.02} c={stripe} p={[x, 0.15, 0.05]} s={[0.6, 0.4, 2]} />)}
        <group ref={reg('earL')} position={[-0.1, 0.13, 0]}>
          <Cone r={0.06} h={0.12} c={c} rot={[0, 0, 0.3]} seg={4} />
          <Cone r={0.035} h={0.07} c="#ffb3c1" p={[0.005, -0.01, 0.02]} rot={[0, 0, 0.3]} seg={4} />
        </group>
        <group ref={reg('earR')} position={[0.1, 0.13, 0]}>
          <Cone r={0.06} h={0.12} c={c} rot={[0, 0, -0.3]} seg={4} />
          <Cone r={0.035} h={0.07} c="#ffb3c1" p={[-0.005, -0.01, 0.02]} rot={[0, 0, -0.3]} seg={4} />
        </group>
      </group>
    </>
  );
}

function Owl({ stage, reg }: { stage: number; reg: (k: Parts) => (o: THREE.Object3D | null) => void }) {
  const c = '#a98a6d';
  const dark = '#7d6048';
  const cream = '#f4e3c9';
  return (
    <>
      <Ball r={0.22} c={c} p={[0, 0.26, 0]} s={[1, 1.12, 0.95]} shadow />
      <Ball r={0.16} c={cream} p={[0, 0.22, 0.08]} s={[1, 1.15, 0.7]} />
      {[-0.07, 0.07].map((x) => (
        <Ball key={x} r={0.035} c="#ffa64d" p={[x, 0.03, 0.12]} s={[1.3, 0.6, 1.3]} />
      ))}
      <group ref={reg('wingL')} position={[-0.2, 0.28, 0]}>
        <Ball r={0.12} c={dark} p={[0, -0.04, 0]} s={[0.35, 1, 0.8]} />
      </group>
      <group ref={reg('wingR')} position={[0.2, 0.28, 0]}>
        <Ball r={0.12} c={dark} p={[0, -0.04, 0]} s={[0.35, 1, 0.8]} />
      </group>
      <group ref={reg('tail')} position={[0, 0.08, -0.18]}>
        <Ball r={0.06} c={dark} s={[1.2, 0.4, 1]} />
      </group>
      <group ref={reg('head')} position={[0, 0.44, 0.02]}>
        {/* Голова у совы — верх туловища: только лицевой диск, глаза, клюв и пёрышки. */}
        {[-0.075, 0.075].map((x) => (
          <mesh key={x} position={[x, 0.02, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.02, 20]} />
            <Mat c={cream} />
          </mesh>
        ))}
        <group ref={reg('eyes')}>
          <Eye x={-0.075} y={0.02} z={0.16} size={1.15} />
          <Eye x={0.075} y={0.02} z={0.16} size={1.15} />
        </group>
        <Cone r={0.025} h={0.06} c="#ffa64d" p={[0, -0.05, 0.19]} rot={[Math.PI / 2 + 0.4, 0, 0]} seg={6} />
        <group ref={reg('earL')} position={[-0.12, 0.12, 0]}>
          <Cone r={0.035} h={0.08 + stage * 0.03} c={dark} rot={[0, 0, 0.45]} seg={5} />
        </group>
        <group ref={reg('earR')} position={[0.12, 0.12, 0]}>
          <Cone r={0.035} h={0.08 + stage * 0.03} c={dark} rot={[0, 0, -0.45]} seg={5} />
        </group>
        {stage >= 2 && (
          <group position={[0, 0.16, -0.01]} rotation={[0, 0.3, 0.08]}>
            <mesh>
              <boxGeometry args={[0.2, 0.012, 0.2]} />
              <Mat c="#2a2a3a" />
            </mesh>
            <mesh position={[0, -0.03, 0]}>
              <cylinderGeometry args={[0.06, 0.07, 0.05, 12]} />
              <Mat c="#2a2a3a" />
            </mesh>
            <Ball r={0.015} c="#ffd36b" p={[0.09, -0.04, 0.09]} />
          </group>
        )}
      </group>
    </>
  );
}

function Wolf({ stage, reg }: { stage: number; reg: (k: Parts) => (o: THREE.Object3D | null) => void }) {
  const c = '#9aa7bd';
  const light = '#eef2f8';
  const dark = '#6f7b91';
  return (
    <>
      <Ball r={0.19} c={c} p={[0, 0.21, -0.02]} s={[0.95, 0.95, 1.2]} shadow />
      <Ball r={0.12} c={light} p={[0, 0.18, 0.1]} s={[1, 1.1, 0.7]} />
      {[-0.09, 0.09].map((x) => (
        <Ball key={x} r={0.05} c={dark} p={[x, 0.04, 0.1]} s={[1, 0.8, 1.2]} />
      ))}
      <group ref={reg('tail')} position={[0, 0.22, -0.22]}>
        <Ball r={0.07} c={c} p={[0, 0.06, -0.08]} s={[0.9, 0.9, 1.8]} />
        <Ball r={0.045} c={light} p={[0, 0.1, -0.18]} />
      </group>
      {stage >= 1 && (
        <group position={[0, 0.34, 0.03]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.12, 0.03, 8, 24]} />
            <Mat c="#e53950" />
          </mesh>
          <Ball r={0.04} c="#e53950" p={[0.09, -0.05, 0.08]} s={[0.7, 1.4, 0.5]} />
        </group>
      )}
      {stage >= 2 &&
        [0, 1, 2, 3, 4, 5].map((k) => {
          const a = (k / 6) * Math.PI * 2;
          return <Ball key={k} r={0.065} c={light} p={[Math.sin(a) * 0.15, 0.38, Math.cos(a) * 0.12 - 0.02]} />;
        })}
      <group ref={reg('head')} position={[0, 0.48, 0.05]}>
        <Ball r={0.16} c={c} shadow />
        <Ball r={0.08} c={light} p={[0, -0.05, 0.12]} s={[1, 0.8, 1.3]} />
        <Ball r={0.025} c="#22222c" p={[0, -0.02, 0.22]} />
        <group ref={reg('eyes')}>
          <Eye x={-0.065} y={0.04} z={0.125} />
          <Eye x={0.065} y={0.04} z={0.125} />
        </group>
        <group ref={reg('earL')} position={[-0.09, 0.14, -0.01]}>
          <Cone r={0.055} h={0.14} c={c} rot={[0, 0, 0.25]} seg={4} />
          <Cone r={0.03} h={0.08} c={light} p={[0.005, -0.015, 0.02]} rot={[0, 0, 0.25]} seg={4} />
        </group>
        <group ref={reg('earR')} position={[0.09, 0.14, -0.01]}>
          <Cone r={0.055} h={0.14} c={c} rot={[0, 0, -0.25]} seg={4} />
          <Cone r={0.03} h={0.08} c={light} p={[-0.005, -0.015, 0.02]} rot={[0, 0, -0.25]} seg={4} />
        </group>
      </group>
    </>
  );
}

function Bug({ stage, reg }: { stage: number; reg: (k: Parts) => (o: THREE.Object3D | null) => void }) {
  const c = '#6fb8ff';
  const led = '#7dffea';
  const steel = '#3b4258';
  return (
    <>
      <mesh position={[0, 0.12, -0.02]} castShadow>
        <sphereGeometry args={[0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat c={c} m={0.5} />
      </mesh>
      <mesh position={[0, 0.12, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.02, 8, 28]} />
        <Mat c={steel} m={0.6} />
      </mesh>
      {stage >= 1 && (
        <mesh position={[0, 0.12, -0.02]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.222, 0.012, 6, 28, Math.PI]} />
          <Mat c="#ffd36b" m={0.6} />
        </mesh>
      )}
      {[-1, 1].map((sd) =>
        [-0.1, 0, 0.1].map((z) => (
          <mesh key={`${sd}${z}`} position={[sd * 0.2, 0.06, z - 0.02]} rotation={[0, 0, sd * 0.9]}>
            <cylinderGeometry args={[0.014, 0.014, 0.12, 6]} />
            <Mat c={steel} m={0.6} />
          </mesh>
        )),
      )}
      <group ref={reg('tail')} position={[0, 0.16, -0.24]}>
        <Ball r={0.025} c={led} e={led} />
      </group>
      <group ref={reg('head')} position={[0, 0.2, 0.17]}>
        <Ball r={0.11} c={steel} m={0.5} s={[1.15, 0.9, 0.9]} shadow />
        <group ref={reg('eyes')}>
          <Eye x={-0.045} y={0.015} z={0.09} led={led} />
          <Eye x={0.045} y={0.015} z={0.09} led={led} />
        </group>
        <group ref={reg('earL')} position={[-0.05, 0.08, 0]}>
          <mesh position={[-0.02, 0.07, 0]} rotation={[0, 0, 0.3]}>
            <cylinderGeometry args={[0.006, 0.006, 0.14, 5]} />
            <Mat c={steel} />
          </mesh>
          <Ball r={0.022} c={led} e={led} p={[-0.045, 0.14, 0]} />
        </group>
        <group ref={reg('earR')} position={[0.05, 0.08, 0]}>
          <mesh position={[0.02, 0.07, 0]} rotation={[0, 0, -0.3]}>
            <cylinderGeometry args={[0.006, 0.006, 0.14, 5]} />
            <Mat c={steel} />
          </mesh>
          <Ball r={0.022} c={led} e={led} p={[0.045, 0.14, 0]} />
        </group>
      </group>
      {stage >= 2 && (
        <group position={[0, 0.36, -0.02]}>
          <mesh position={[0, -0.02, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.05, 6]} />
            <Mat c={steel} />
          </mesh>
          <group ref={reg('prop')}>
            <mesh>
              <boxGeometry args={[0.3, 0.01, 0.04]} />
              <Mat c="#ffd36b" m={0.4} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[0.3, 0.01, 0.04]} />
              <Mat c="#ffd36b" m={0.4} />
            </mesh>
          </group>
        </group>
      )}
    </>
  );
}

function Hedgehog({ stage, reg }: { stage: number; reg: (k: Parts) => (o: THREE.Object3D | null) => void }) {
  const c = '#7a5236';
  const face = '#f6dcc0';
  const spikes = useSpikes([18, 26, 34][stage], 0.2);
  return (
    <>
      <group position={[0, 0.19, -0.02]}>
        <Ball r={0.2} c={c} s={[1, 0.9, 1.05]} shadow />
        {spikes.map((s, i) => (
          <mesh key={i} position={s.p} quaternion={s.q} scale={[1, 0.9, 1]}>
            <coneGeometry args={[0.035, 0.12, 5]} />
            <Mat c={i % 3 ? '#6a452c' : '#8f6343'} />
          </mesh>
        ))}
        {stage >= 2 && (
          <group position={[0.05, 0.25, -0.05]}>
            <Ball r={0.06} c="#e53950" />
            <mesh position={[0, 0.07, 0]} rotation={[0, 0, 0.5]}>
              <boxGeometry args={[0.04, 0.012, 0.02]} />
              <Mat c="#5fd39a" />
            </mesh>
          </group>
        )}
      </group>
      {[-0.08, 0.08].map((x) => (
        <Ball key={x} r={0.04} c={face} p={[x, 0.03, 0.1]} />
      ))}
      <group ref={reg('tail')} position={[0, 0.1, -0.22]}>
        <Ball r={0.03} c={face} />
      </group>
      <group ref={reg('head')} position={[0, 0.27, 0.14]}>
        <Ball r={0.13} c={face} s={[1, 0.9, 1]} shadow />
        <Ball r={0.06} c={face} p={[0, -0.03, 0.11]} s={[0.8, 0.7, 1.2]} />
        <Ball r={0.022} c="#22222c" p={[0, -0.02, 0.19]} />
        <group ref={reg('eyes')}>
          <Eye x={-0.055} y={0.03} z={0.1} size={0.85} />
          <Eye x={0.055} y={0.03} z={0.1} size={0.85} />
        </group>
        <Cheeks y={-0.035} z={0.1} w={0.085} />
        <group ref={reg('earL')} position={[-0.08, 0.09, -0.02]}>
          <Ball r={0.03} c={face} s={[1, 1, 0.5]} />
        </group>
        <group ref={reg('earR')} position={[0.08, 0.09, -0.02]}>
          <Ball r={0.03} c={face} s={[1, 1, 0.5]} />
        </group>
      </group>
    </>
  );
}

const BODIES: Record<PetId, typeof Dragon> = { dragon: Dragon, cat: Cat, owl: Owl, wolf: Wolf, bug: Bug, hedgehog: Hedgehog };
// Высота головы: над ней висит грустная тучка.
const HEAD_Y: Record<PetId, number> = { dragon: 0.75, cat: 0.72, owl: 0.7, wolf: 0.74, bug: 0.5, hedgehog: 0.52 };

export function Pet({ id, stage = 0, sad, hop = 0, lively, run, position, rotation = 0, scale = 1, onClick, outline }: PetProps) {
  const parts = useRef<Partial<Record<Parts, THREE.Object3D | null>>>({});
  const reg = useMemo(() => (k: Parts) => (o: THREE.Object3D | null) => void (parts.current[k] = o), []);
  // Когда начался прыжок и когда питомец сам подпрыгнет в следующий раз.
  const hopAt = useRef(-10);
  const hopWanted = useRef(false);
  const nextSelf = useRef(3 + Math.random() * 3);
  const phase = useMemo(() => Math.random() * 10, []);
  const spins = useRef(0);
  useEffect(() => {
    if (hop) hopWanted.current = true;
  }, [hop]);
  // Обводка частей тела: после того как они появились в сцене (видна их мировая величина).
  useEffect(() => {
    const body = parts.current.body;
    if (!outline || !body || !outlinesOn()) return;
    body.updateWorldMatrix(true, true);
    const ws = new THREE.Vector3();
    const meshes: THREE.Mesh[] = [];
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      // Обводим крупные объёмные части; мелкие (глаза, нос, щёки) и плоские — нет: иначе взгляд в тёмных кольцах.
      if (!m.isMesh || (m.material as THREE.Material).transparent || (m.material as THREE.Material).type === 'MeshBasicMaterial') return;
      m.geometry.computeBoundingSphere();
      if (m.geometry.boundingSphere!.radius * m.getWorldScale(ws).x < 0.06) return;
      meshes.push(m);
    });
    const off = meshes.map((m) => addOutline(m, 0.012));
    return () => off.forEach((f) => f());
  }, [outline, id, stage]);

  useFrame(({ clock }) => {
    const P = parts.current;
    const now = clock.elapsedTime;
    if (hopWanted.current) {
      hopWanted.current = false;
      hopAt.current = now;
      spins.current++;
    }
    if (lively && !sad && now > nextSelf.current) {
      hopAt.current = now;
      nextSelf.current = now + 4 + Math.random() * 4;
    }
    const t = now * (sad ? 0.5 : 1) + phase;
    const h = (now - hopAt.current) / 0.55;
    const hopping = h >= 0 && h < 1;
    // Прыжок: присел, взлетел, вытянулся, приземлился с пружинкой.
    let y = 0;
    let sq = 1;
    if (hopping) {
      y = Math.sin(Math.PI * h) * 0.34;
      sq = h < 0.15 ? 1 - 0.25 * Math.sin((h / 0.15) * Math.PI) : h > 0.85 ? 1 - 0.18 * Math.sin(((h - 0.85) / 0.15) * Math.PI) : 1.08;
    } else if (run) {
      y = Math.abs(Math.sin(t * 9)) * 0.08;
    } else {
      sq = 1 + Math.sin(t * 3.2) * (sad ? 0.015 : 0.035);
    }
    if (P.hop) {
      P.hop.position.y = y;
      // Взрослый на каждый третий прыжок делает сальто вокруг себя.
      P.hop.rotation.y = hopping && stage >= 2 && spins.current % 3 === 0 ? h * Math.PI * 2 : 0;
      P.hop.rotation.x = run && !hopping ? 0.12 : 0;
    }
    if (P.body) P.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (P.head) {
      P.head.rotation.x = sad ? 0.38 : hopping ? -0.25 : Math.sin(t * 0.9) * 0.06;
      P.head.rotation.z = sad ? 0.05 : Math.sin(t * 1.3) * 0.14;
      P.head.rotation.y = sad ? 0 : Math.sin(t * 0.5) * 0.25;
    }
    if (P.eyes) {
      // Моргает раз в несколько секунд; грустный щурится.
      const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
      P.eyes.scale.y = sad ? Math.min(0.55, blink) : hopping && h > 0.2 && h < 0.8 ? 0.35 : blink;
    }
    if (P.tail) P.tail.rotation.y = Math.sin(t * (sad ? 2 : hopping ? 18 : 7)) * (sad ? 0.1 : 0.5);
    if (P.tail) P.tail.rotation.x = sad ? 0.35 : 0;
    const flap = hopping ? Math.sin(h * Math.PI * 6) * 0.9 : sad ? -0.15 : Math.sin(t * 2.2) * 0.12;
    if (P.wingL) P.wingL.rotation.z = flap;
    if (P.wingR) P.wingR.rotation.z = -flap;
    const ear = sad ? 0.55 : Math.max(0, Math.sin(t * 0.7 + 1)) ** 8 * 0.3;
    if (P.earL) P.earL.rotation.z = ear;
    if (P.earR) P.earR.rotation.z = -ear;
    if (P.prop) P.prop.rotation.y += hopping ? 0.9 : sad ? 0.02 : 0.25;
    if (P.cloud) P.cloud.position.y = HEAD_Y[id] + 0.12 + Math.sin(now * 1.5) * 0.02;
  });

  const Body = BODIES[id];
  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      scale={scale * STAGE_SCALE[stage]}
      onClick={
        onClick &&
        ((e) => {
          e.stopPropagation();
          onClick();
        })
      }
    >
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.2, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <group ref={reg('hop')}>
        <group ref={reg('body')}>
          <Body stage={stage} reg={reg} />
        </group>
      </group>
      {sad && (
        <group ref={reg('cloud')} position={[0.05, HEAD_Y[id] + 0.12, 0]}>
          <SadCloud />
        </group>
      )}
    </group>
  );
}

/** Грустная тучка с каплей над питомцем, который давно не видел тренировок. */
const SadCloud = (): ReactNode => (
  <>
    <Ball r={0.06} c="#9aa3b8" p={[-0.05, 0, 0]} />
    <Ball r={0.075} c="#aab3c6" p={[0.02, 0.02, 0]} />
    <Ball r={0.055} c="#9aa3b8" p={[0.08, -0.005, 0]} />
    <Ball r={0.018} c="#7dc4ff" e="#3a8bd6" p={[0.01, -0.09, 0]} s={[1, 1.5, 1]} />
  </>
);
