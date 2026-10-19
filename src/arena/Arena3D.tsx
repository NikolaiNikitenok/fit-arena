import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// 3D-ринг с двумя бойцами из примитивов. Анимации запускаются сменой счётчиков
// punchSeq (боец бьёт) и hitSeq (по бойцу попали).

interface FighterProps {
  color: string;
  facing: 1 | -1;
  punchSeq: number;
  hitSeq: number;
  combo: boolean;
  knockedOut: boolean;
}

const PUNCH_MS = 260;
const HIT_MS = 320;

function Fighter({ color, facing, punchSeq, hitSeq, combo, knockedOut }: FighterProps) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const leftArm = useRef<THREE.Group>(null!);
  const rightArm = useRef<THREE.Group>(null!);
  const torsoMat = useRef<THREE.MeshStandardMaterial>(null!);

  // Время начала текущей анимации удара и попадания.
  const anim = useRef({ punchSeq, hitSeq, punchAt: -1e9, hitAt: -1e9, fall: 0 });

  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000;
    const a = anim.current;
    if (punchSeq !== a.punchSeq) {
      a.punchSeq = punchSeq;
      a.punchAt = now;
    }
    if (hitSeq !== a.hitSeq) {
      a.hitSeq = hitSeq;
      a.hitAt = now;
    }

    // Удар: рука выстреливает вперёд и возвращается.
    const p = Math.min(1, (now - a.punchAt) / PUNCH_MS);
    const punch = p < 1 ? Math.sin(p * Math.PI) : 0;
    rightArm.current.rotation.x = -Math.PI / 2 * (0.35 + 0.65 * punch);
    rightArm.current.position.z = 0.35 * punch;
    const both = combo ? punch : 0;
    leftArm.current.rotation.x = -Math.PI / 2 * (0.35 + 0.65 * both);
    leftArm.current.position.z = 0.35 * both;

    // Попадание: откидывает назад и подсвечивает красным.
    const h = Math.min(1, (now - a.hitAt) / HIT_MS);
    const recoil = h < 1 ? Math.sin(h * Math.PI) : 0;
    body.current.rotation.x = -0.35 * recoil;
    torsoMat.current.emissive.setRGB(0.8 * recoil, 0, 0);

    // Нокаут: плавно падает на спину, иначе пружинит на месте.
    a.fall = THREE.MathUtils.lerp(a.fall, knockedOut ? 1 : 0, 0.08);
    root.current.rotation.x = -a.fall * (Math.PI / 2);
    root.current.position.y = knockedOut ? 0 : Math.abs(Math.sin(clock.elapsedTime * 4)) * 0.05;
  });

  const skin = '#f1c8a5';
  return (
    <group position={[0, 0, -facing * 0.9]} rotation={[0, facing === 1 ? 0 : Math.PI, 0]}>
      <group ref={root}>
        <group ref={body}>
          {/* ноги */}
          {[-0.18, 0.18].map((x) => (
            <mesh key={x} position={[x, 0.45, 0]} castShadow>
              <capsuleGeometry args={[0.11, 0.6, 4, 12]} />
              <meshStandardMaterial color="#2b2f3a" />
            </mesh>
          ))}
          {/* корпус */}
          <mesh position={[0, 1.2, 0]} castShadow>
            <capsuleGeometry args={[0.3, 0.55, 6, 16]} />
            <meshStandardMaterial ref={torsoMat} color={color} roughness={0.5} />
          </mesh>
          {/* голова */}
          <mesh position={[0, 1.85, 0]} castShadow>
            <sphereGeometry args={[0.22, 24, 24]} />
            <meshStandardMaterial color={skin} />
          </mesh>
          {/* руки с перчатками: поворачиваются от плеча */}
          {[
            { ref: leftArm, x: -0.42 },
            { ref: rightArm, x: 0.42 },
          ].map(({ ref, x }) => (
            <group key={x} ref={ref} position={[x, 1.45, 0]}>
              <mesh position={[0, -0.28, 0]} castShadow>
                <capsuleGeometry args={[0.08, 0.4, 4, 10]} />
                <meshStandardMaterial color={skin} />
              </mesh>
              <mesh position={[0, -0.6, 0]} castShadow>
                <sphereGeometry args={[0.15, 20, 20]} />
                <meshStandardMaterial color={color} roughness={0.3} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

function Ring() {
  const size = 4;
  const posts: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  return (
    <group>
      <mesh position={[0, -0.15, 0]} receiveShadow>
        <boxGeometry args={[size, 0.3, size]} />
        <meshStandardMaterial color="#1d4ed8" />
      </mesh>
      <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0b0d12" />
      </mesh>
      {posts.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[(x * size) / 2, 0.6, (z * size) / 2]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 1.2, 12]} />
          <meshStandardMaterial color="#e5e7eb" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      {/* канаты в три ряда по периметру */}
      {[0.4, 0.75, 1.1].map((y, row) =>
        posts.map(([x, z], i) => {
          const [nx, nz] = posts[(i + 1) % 4];
          const from = new THREE.Vector3((x * size) / 2, y, (z * size) / 2);
          const to = new THREE.Vector3((nx * size) / 2, y, (nz * size) / 2);
          const mid = from.clone().add(to).multiplyScalar(0.5);
          const len = from.distanceTo(to);
          const horizontal = Math.abs(nz - z) < 0.01;
          return (
            <mesh key={`${row}-${i}`} position={mid} rotation={horizontal ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, len, 8]} />
              <meshStandardMaterial color={row === 1 ? '#f8fafc' : '#ef4444'} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}

export interface Arena3DProps {
  playerPunch: number;
  botPunch: number;
  playerCombo: boolean;
  botCombo: boolean;
  playerKO: boolean;
  botKO: boolean;
}

export function Arena3D({ playerPunch, botPunch, playerCombo, botCombo, playerKO, botKO }: Arena3DProps) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [2.8, 2.4, -4.2], fov: 40 }} onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
      <color attach="background" args={['#0b0d12']} />
      <fog attach="fog" args={['#0b0d12', 8, 18]} />
      <ambientLight intensity={0.5} />
      <spotLight position={[0, 6, 0]} angle={0.7} penumbra={0.5} intensity={60} castShadow />
      <directionalLight position={[4, 5, 2]} intensity={0.8} />
      <Ring />
      <Fighter color="#ff5a36" facing={1} punchSeq={playerPunch} hitSeq={botPunch} combo={playerCombo} knockedOut={playerKO} />
      <Fighter color="#22c55e" facing={-1} punchSeq={botPunch} hitSeq={playerPunch} combo={botCombo} knockedOut={botKO} />
    </Canvas>
  );
}
