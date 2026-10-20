import { ReactNode, Suspense, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Canvas3D } from '../three/Canvas3D';
import { Character } from '../three/Character';
import { Pet } from '../three/Pet';
import { petLook } from './pets';
import { itemById, RARITY_COLORS } from './items';
import { heroHands } from './power';
import type { Progress } from './progress';

// Герой на подставке на главном экране: крутится, тап — прыжок, рядом питомец.

function Turntable({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.35;
  });
  return <group ref={g}>{children}</group>;
}

export function HeroStage({ progress }: { progress: Progress }) {
  const item = itemById(progress.equipped);
  const [pulse, setPulse] = useState(0);
  // Питомец стоит рядом с героем и радуется вместе с ним.
  const pet = petLook(progress, Date.now());
  return (
    <Canvas3D camera={{ position: [0, 1.4, 5.8], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 1.0, 0)}>
      <hemisphereLight args={['#ffffff', '#3a3040', 1.3]} />
      <directionalLight position={[3, 5, 3]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-2.5, 1.5, -1.5]} intensity={8} color={item.glow ?? RARITY_COLORS[item.rarity]} />
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <cylinderGeometry args={[1.05, 1.15, 0.16, 6]} />
        <meshStandardMaterial color="#3a3f52" flatShading />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.92, 1.0, 6]} />
        <meshBasicMaterial color={RARITY_COLORS[item.rarity]} />
      </mesh>
      <Suspense fallback={null}>
        <Turntable>
          <Character model={item.hero} tint={item.tint} glow={item.glow} hands={heroHands(progress)} anim="idle" pulse={pulse} pulseAnim="jump" onClick={() => setPulse((p) => p + 1)} />
        </Turntable>
        {pet && <Pet id={pet.id} stage={pet.stage} sad={pet.sad} hop={pulse} lively position={[0.95, 0, 0.7]} rotation={-0.45} scale={1.35} onClick={() => setPulse((p) => p + 1)} />}
      </Suspense>
    </Canvas3D>
  );
}
