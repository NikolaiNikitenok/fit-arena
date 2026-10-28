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
import { heroAura } from './collections';
import { HeroDiorama } from './HeroDiorama';
import type { World } from './lands';

// Герой на подставке на главном экране: крутится, тап — прыжок, рядом питомец.

function Turntable({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.35;
  });
  return <group ref={g}>{children}</group>;
}

/** Сияние собранной коллекции: пульсирующее кольцо и искры, что поднимаются вокруг героя. */
export function Aura({ color }: { color: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      const k = 1 + Math.sin(t * 2.2) * 0.06;
      ring.current.scale.set(k, k, k);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 2.2) * 0.2;
    }
    sparks.current?.children.forEach((m, i) => {
      const f = (t * 0.35 + i / 12) % 1;
      const a = i * 2.4 + t * 0.8;
      const r = 0.62 + (i % 3) * 0.08;
      m.position.set(Math.cos(a) * r, f * 2.2, Math.sin(a) * r);
      m.scale.setScalar(0.04 * (1 - f) + 0.01);
    });
  });
  return (
    <group>
      <mesh ref={ring} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.78, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.7, 0.78, 1.8, 32, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <group ref={sparks}>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 6, 4]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function HeroStage({ progress, world }: { progress: Progress; world?: World }) {
  const item = itemById(progress.equipped);
  const [pulse, setPulse] = useState(0);
  // Питомец стоит рядом с героем и радуется вместе с ним.
  const pet = petLook(progress, Date.now());
  const aura = heroAura(progress);
  return (
    <Canvas3D sharp camera={{ position: [0, 1.4, 5.8], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 1.0, 0)}>
      <pointLight position={[-2.5, 1.5, -1.5]} intensity={8} color={item.glow ?? RARITY_COLORS[item.rarity]} />
      {world ? (
        // Подставка — кусочек мира, где герой сейчас сражается.
        <HeroDiorama world={world} ring={RARITY_COLORS[item.rarity]} />
      ) : (
        <>
          <hemisphereLight args={['#ffffff', '#3a3040', 1.3]} />
          <directionalLight position={[3, 5, 3]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
          <mesh position={[0, -0.08, 0]} receiveShadow>
            <cylinderGeometry args={[1.05, 1.15, 0.16, 6]} />
            <meshStandardMaterial color="#3a3f52" flatShading />
          </mesh>
          <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.92, 1.0, 6]} />
            <meshBasicMaterial color={RARITY_COLORS[item.rarity]} />
          </mesh>
        </>
      )}
      {aura && <Aura color={aura} />}
      <Suspense fallback={null}>
        <Turntable>
          <Character model={item.hero} tint={item.tint} glow={item.glow} hands={heroHands(progress)} anim="idle" pulse={pulse} pulseAnim="jump" onClick={() => setPulse((p) => p + 1)} />
        </Turntable>
        {pet && <Pet id={pet.id} stage={pet.stage} sad={pet.sad} hop={pulse} lively outline position={[0.95, 0, 0.7]} rotation={-0.45} scale={1.35} onClick={() => setPulse((p) => p + 1)} />}
      </Suspense>
    </Canvas3D>
  );
}
