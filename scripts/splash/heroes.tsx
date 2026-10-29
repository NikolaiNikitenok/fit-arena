// Кадр героев для заставки (public/splash/heroes.webp): node scripts/splash/render.mjs
import { Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { Character } from '../../src/three/Character';

const W = 1080;
const H = 960;

function Ready() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const id = setTimeout(() => ((window as { __shot?: boolean }).__shot = true), 1500);
    return () => clearTimeout(id);
  }, [gl]);
  return null;
}

function Stage() {
  return (
    <>
      <hemisphereLight args={['#c9d4ff', '#2a2440', 1.1]} />
      <directionalLight position={[2, 6, 6]} intensity={2.4} color="#fff1e0" />
      {/* Тёплый контровой свет сзади — как от огня арены, и холодный сбоку. */}
      <pointLight position={[0, 2.6, -2.6]} intensity={40} distance={10} color="#ff8a5c" />
      <pointLight position={[-4, 2, 1]} intensity={14} distance={9} color="#7f9cff" />
      <pointLight position={[4, 2, 1]} intensity={14} distance={9} color="#ffb46b" />
      <Suspense fallback={null}>
        <Character model="Rogue" anim="idle" position={[-2.15, 0, -0.75]} rotation={0.5} />
        <Character model="Mage" anim="casting" position={[2.15, 0, -0.75]} rotation={-0.5} />
        <Character model="Barbarian" anim="taunt" position={[0.72, 0, 0.3]} rotation={-0.25} />
        <Character model="Knight" anim="idle" scale={1.05} position={[-0.72, 0, 0.4]} rotation={0.25} />
        <Ready />
      </Suspense>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <Canvas
    dpr={1}
    gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
    camera={{ position: [0, 0.9, 11.5], fov: 30 }}
    onCreated={({ camera }) => camera.lookAt(0, 1.55, 0)}
    style={{ width: W, height: H }}
  >
    <Stage />
  </Canvas>,
);
