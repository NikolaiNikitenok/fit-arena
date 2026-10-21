import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Частицы деревни: пыль и обломки, когда рушится постройка, искры и пыль, когда стройка готова,
// салют над ратушей нового уровня. Пулы фиксированного размера: сколько бы ни взрывалось, памяти
// больше не берём, а самые старые частицы просто уступают место новым.

export type FxKind = 'ruin' | 'built' | 'fireworks';

type Emit = (kind: FxKind, x: number, z: number, size: number) => void;
const subs = new Set<Emit>();
/** Пустить эффект в точке сцены (x, z — мировые координаты, size — размер постройки в клетках). */
export function emitFx(kind: FxKind, x: number, z: number, size = 2) {
  for (const f of subs) f(kind, x, z, size);
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying vec3 vColor;
  varying float vA;
  void main() {
    vColor = color;
    vA = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale;
  }
`;
const FRAG = /* glsl */ `
  uniform float uSoft;
  varying vec3 vColor;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(uSoft, 1.0, d)) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  g: number;
  drag: number;
  r: number;
  gc: number;
  b: number;
  // Ракета салюта: на излёте лопается звездой этого цвета.
  burst?: string;
}

/** Пул точек: пыль (обычное смешивание) или искры (светятся, складываются). */
class Pool {
  list: P[] = [];
  geo = new THREE.BufferGeometry();
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  mat: THREE.ShaderMaterial;
  points: THREE.Points;
  constructor(
    public max: number,
    additive: boolean,
    soft: number,
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 1 }, uSoft: { value: soft } },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }
  add(p: P) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(p);
  }
  step(dt: number, onBurst: (p: P) => void) {
    const alive: P[] = [];
    const popped: P[] = [];
    for (const p of this.list) {
      p.age += dt;
      if (p.age >= p.life) {
        if (p.burst) popped.push(p);
        continue;
      }
      p.vy -= p.g * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.vz *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      alive.push(p);
    }
    this.list = alive;
    alive.forEach((p, i) => {
      const t = p.age / p.life;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r;
      this.col[i * 3 + 1] = p.gc;
      this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size * (1 + p.grow * t);
      // Быстро появляется, плавно тает.
      this.alpha[i] = Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
    });
    this.geo.setDrawRange(0, alive.length);
    for (const a of ['position', 'color', 'aSize', 'aAlpha']) (this.geo.attributes[a] as THREE.BufferAttribute).needsUpdate = true;
    for (const p of popped) onBurst(p);
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

const DEBRIS = 64;
interface Chunk {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  rz: number;
  spin: number;
  age: number;
  life: number;
  s: number;
}

const tmpC = new THREE.Color();
export function Particles({ lite }: { lite: boolean }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const camera = useThree((s) => s.camera);
  const sys = useMemo(() => {
    const dust = new Pool(lite ? 160 : 360, false, 0.25);
    const sparks = new Pool(lite ? 220 : 520, false, 0.45);
    const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), DEBRIS);
    chunks.count = 0;
    chunks.frustumCulled = false;
    chunks.setColorAt(0, new THREE.Color('#8a7a66'));
    return { dust, sparks, chunks, bits: [] as Chunk[] };
  }, [lite]);
  useEffect(() => () => {
    sys.dust.dispose();
    sys.sparks.dispose();
    sys.chunks.geometry.dispose();
    (sys.chunks.material as THREE.Material).dispose();
  }, [sys]);

  useEffect(() => {
    const rnd = Math.random;
    const puff = (x: number, z: number, size: number, n: number, color: string, y = 0.2) => {
      tmpC.set(color);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2;
        const sp = (0.8 + rnd() * 1.6) * size * 0.6;
        const c = 0.85 + rnd() * 0.25;
        sys.dust.add({ x: x + Math.cos(a) * size * 0.3, y: y + rnd() * 0.6, z: z + Math.sin(a) * size * 0.3, vx: Math.cos(a) * sp, vy: 0.6 + rnd() * 1.4, vz: Math.sin(a) * sp, age: 0, life: 1 + rnd() * 0.9, size: 0.7 + rnd() * 0.6 * size, grow: 1.6, g: -0.3, drag: 2.2, r: tmpC.r * c, gc: tmpC.g * c, b: tmpC.b * c });
      }
    };
    const sparkle = (x: number, y: number, z: number, n: number, color: string, speed: number, life: number, size = 0.32) => {
      for (let k = 0; k < n; k++) {
        // Равномерно по сфере: звезда салюта круглая.
        const u = rnd() * 2 - 1;
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        const sp = speed * (0.85 + rnd() * 0.3);
        tmpC.set(color).offsetHSL((rnd() - 0.5) * 0.06, 0, (rnd() - 0.5) * 0.15);
        sys.sparks.add({ x, y, z, vx: r * Math.cos(a) * sp, vy: u * sp, vz: r * Math.sin(a) * sp, age: 0, life: life * (0.8 + rnd() * 0.4), size, grow: -0.5, g: 2.2, drag: 1.4, r: tmpC.r, gc: tmpC.g, b: tmpC.b });
      }
    };
    const emit: Emit = (kind, x, z, size) => {
      if (kind === 'ruin') {
        puff(x, z, size, lite ? 10 : 22, '#9a8f80');
        sparkle(x, 0.8, z, lite ? 8 : 16, '#ffb35c', 3, 0.5, 0.25);
        const n = lite ? 6 : 12;
        for (let k = 0; k < n; k++) {
          if (sys.bits.length >= DEBRIS) sys.bits.shift();
          const a = rnd() * Math.PI * 2;
          const sp = 1.5 + rnd() * 2.5;
          sys.bits.push({ x: x + (rnd() - 0.5) * size * 0.6, y: 0.6 + rnd() * size * 0.5, z: z + (rnd() - 0.5) * size * 0.6, vx: Math.cos(a) * sp, vy: 3 + rnd() * 4, vz: Math.sin(a) * sp, rx: rnd() * 6, rz: rnd() * 6, spin: (rnd() - 0.5) * 14, age: 0, life: 1.6 + rnd() * 0.8, s: 0.12 + rnd() * 0.16 });
        }
      } else if (kind === 'built') {
        puff(x, z, size, lite ? 8 : 16, '#d9c9a8', 0.1);
        sparkle(x, size * 0.9, z, lite ? 14 : 30, '#ffd27a', 2.6, 1.1, 0.28);
      } else {
        // Салют: несколько ракет с разных сторон ратуши, каждая лопается своим цветом.
        const colors = ['#ff8a5c', '#ffd27a', '#6ee7b7', '#8be9ff', '#f48fb1', '#c3a6ff'];
        const shots = lite ? 5 : 9;
        for (let k = 0; k < shots; k++) {
          window.setTimeout(() => {
            const a = rnd() * Math.PI * 2;
            const ox = x + Math.cos(a) * (1 + rnd() * size);
            const oz = z + Math.sin(a) * (1 + rnd() * size);
            sys.sparks.add({ x: ox, y: 0.5, z: oz, vx: (rnd() - 0.5) * 0.8, vy: 12 + rnd() * 3, vz: (rnd() - 0.5) * 0.8, age: 0, life: 0.75 + rnd() * 0.25, size: 0.35, grow: 0, g: 4, drag: 0.2, r: 1, gc: 0.85, b: 0.6, burst: colors[k % colors.length] });
          }, k * 260 + rnd() * 120);
        }
      }
    };
    // Хвост ракеты и звезда, когда ракета догорела.
    (sys as { burst?: (p: P) => void }).burst = (p) => sparkle(p.x, p.y, p.z, lite ? 30 : 70, p.burst!, 6.5, 1.4, 0.4);
    subs.add(emit);
    return () => void subs.delete(emit);
  }, [sys, lite]);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const chunkColor = useMemo(() => [new THREE.Color('#8a7a66'), new THREE.Color('#6b5a48'), new THREE.Color('#a39a8c')], []);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const zoom = (camera as THREE.OrthographicCamera).zoom ?? 14;
    const burst = (sys as { burst?: (p: P) => void }).burst ?? (() => {});
    for (const pool of [sys.dust, sys.sparks]) {
      pool.mat.uniforms.uScale.value = zoom * dpr;
      if (pool.list.length || pool.geo.drawRange.count) {
        // Ракеты оставляют искристый хвост.
        if (pool === sys.sparks)
          for (const p of pool.list.filter((x) => x.burst)) pool.add({ x: p.x, y: p.y, z: p.z, vx: 0, vy: -0.5, vz: 0, age: 0, life: 0.35, size: 0.22, grow: -0.6, g: 0, drag: 0, r: 1, gc: 0.7, b: 0.4 });
        pool.step(dt, burst);
      }
    }
    const bits = sys.bits;
    if (!bits.length && !sys.chunks.count) return;
    sys.bits = bits.filter((b) => (b.age += dt) < b.life);
    sys.bits.forEach((b, i) => {
      b.vy -= 14 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      // Падают на землю и подпрыгивают.
      if (b.y < b.s / 2) {
        b.y = b.s / 2;
        b.vy = Math.abs(b.vy) * 0.35;
        b.vx *= 0.6;
        b.vz *= 0.6;
        b.spin *= 0.6;
      }
      b.rx += b.spin * dt;
      b.rz += b.spin * 0.7 * dt;
      const fade = Math.min(1, (b.life - b.age) * 3);
      q.setFromEuler(e.set(b.rx, 0, b.rz));
      m.compose(v.set(b.x, b.y, b.z), q, sc.setScalar(b.s * fade));
      sys.chunks.setMatrixAt(i, m);
      sys.chunks.setColorAt(i, chunkColor[i % 3]);
    });
    sys.chunks.count = sys.bits.length;
    sys.chunks.instanceMatrix.needsUpdate = true;
    if (sys.chunks.instanceColor) sys.chunks.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <primitive object={sys.dust.points} />
      <primitive object={sys.sparks.points} />
      <primitive object={sys.chunks} />
    </>
  );
}
