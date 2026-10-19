import { useMemo } from 'react';
import * as THREE from 'three';

// Небо: градиентный купол, для космоса и ночного города — звёзды, для космоса — планета с кольцом.

export function Sky({ top, horizon, stars = false, planet = false }: { top: string; horizon: string; stars?: boolean; planet?: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
        vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main() { float h = clamp(normalize(vPos).y * 1.6 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.8)), 1.0); }',
      }),
    [top, horizon],
  );
  const starGeo = useMemo(() => {
    if (!stars) return null;
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(Math.random() * 0.9);
      pts.push(Math.sin(v) * Math.cos(u) * 180, Math.cos(v) * 180, Math.sin(v) * Math.sin(u) * 180);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [stars]);

  return (
    <group>
      <mesh material={material} renderOrder={-1}>
        <sphereGeometry args={[200, 32, 16]} />
      </mesh>
      {starGeo && (
        <points geometry={starGeo}>
          <pointsMaterial color="#ffffff" size={0.8} sizeAttenuation={false} fog={false} />
        </points>
      )}
      {planet && (
        <group position={[-60, 45, -150]} rotation={[0.4, 0, 0.3]}>
          <mesh>
            <sphereGeometry args={[22, 48, 32]} />
            <meshStandardMaterial color="#e08a5a" emissive="#6a2f1a" emissiveIntensity={0.6} fog={false} />
          </mesh>
          <mesh rotation={[Math.PI / 2.3, 0, 0]}>
            <ringGeometry args={[28, 40, 64]} />
            <meshBasicMaterial color="#f3d2a2" transparent opacity={0.55} side={THREE.DoubleSide} fog={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
