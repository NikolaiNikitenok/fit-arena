import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GRID, isTrap } from '../../shared/village';
import { SIZE } from './looks';
import { nowSky, overcast, skyAt, SkyLook, Weather } from './sky';
import type { Ctl, ViewBld } from './Village3D';

// Атмосфера деревни: свет по времени суток, дымка по краям мира, фонари у домов, дождь, снег
// и светлячки. Всё, что движется, считает шейдер (на процессоре — ни одной матрицы за кадр).

const W = (c: number) => c - GRID / 2;
const DAY = skyAt(12);

/** Небо сейчас: пересчитывается раз в минуту. В бою и в чужой деревне — всегда день. */
export function useSky(live: boolean, dayNight: boolean): { sky: SkyLook; weather: Weather } {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [live]);
  return useMemo(() => {
    if (!live) return { sky: DAY, weather: 'clear' as Weather };
    const { hour, weather } = nowSky();
    return { sky: overcast(dayNight ? skyAt(hour) : DAY, weather), weather };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, dayNight, tick]);
}

/** Цвета света и фона. Солнце ниже вечером — тени длиннее. */
export function SkyLights({ sky, sun, hemi }: { sky: SkyLook; sun: React.RefObject<THREE.DirectionalLight | null>; hemi: React.RefObject<THREE.HemisphereLight | null> }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const bg = new THREE.Color(sky.fog);
    scene.background = bg;
    if (sun.current) {
      sun.current.color.set(sky.sun);
      sun.current.intensity = sky.sunI;
    }
    if (hemi.current) {
      hemi.current.color.set(sky.hemiSky);
      hemi.current.groundColor.set(sky.hemiGround);
      hemi.current.intensity = sky.hemi;
    }
  }, [sky, scene, sun, hemi]);
  return null;
}

// ── Дымка по краям ──────────────────────────────────────────────────────────────────────────────
// Несколько колец одно над другим: прозрачные внутри, плотные снаружи. Горы и лес у горизонта
// тонут в дымке постепенно, сверху вниз — как в объёмном тумане.

function fogRing(inner: number, outer: number, y: number, alpha: number): THREE.BufferGeometry {
  const seg = 72;
  const rings = 6;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const rad = inner + (outer - inner) * t;
    const a = alpha * Math.min(1, t * t * (3 - 2 * t) * 1.15);
    for (let s = 0; s <= seg; s++) {
      const ang = (s / seg) * Math.PI * 2;
      // Край дымки чуть волнистый.
      const wob = 1 + 0.06 * Math.sin(ang * 5 + y) + 0.03 * Math.sin(ang * 11);
      pos.push(Math.cos(ang) * rad * wob, y, Math.sin(ang) * rad * wob);
      col.push(1, 1, 1, a);
    }
  }
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

const FOG_LAYERS: [number, number, number, number][] = [
  // внутренний радиус, внешний, высота, плотность
  [27, 52, -1.4, 1],
  [31, 56, 0.6, 0.85],
  [35, 60, 2.8, 0.75],
  [40, 66, 5.5, 0.7],
];

export function EdgeFog({ color }: { color: string }) {
  const layers = useMemo(() => FOG_LAYERS.map(([a, b, y, k]) => fogRing(a, b, y, k)), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }), []);
  useEffect(() => void mat.color.set(color), [mat, color]);
  useEffect(() => () => [...layers, mat].forEach((x) => x.dispose()), [layers, mat]);
  return (
    <>
      {layers.map((g, k) => (
        <mesh key={k} geometry={g} material={mat} renderOrder={2} />
      ))}
      {/* За дымкой — сплошной цвет неба до края кадра. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 5.6, 0]} renderOrder={1}>
        <ringGeometry args={[64, 260, 48]} />
        <primitive object={mat} attach="material" />
      </mesh>
    </>
  );
}

// ── Светящиеся точки: огни фонарей, светлячки, снег ────────────────────────────────────────────

const GLOW_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  uniform float uScale;
  uniform float uTime;
  uniform float uOn;
  uniform float uMode;
  uniform vec3 uCenter;
  varying vec3 vColor;
  varying float vA;
  void main() {
    vColor = color;
    vec3 p = position;
    float a = uOn;
    if (uMode > 0.5 && uMode < 1.5) {
      // Светлячки: плавают и мигают.
      p += vec3(sin(uTime * 0.7 + aSeed * 6.3), 0.5 * sin(uTime * 1.3 + aSeed * 3.1), cos(uTime * 0.6 + aSeed * 4.7)) * 0.9;
      a *= 0.35 + 0.65 * smoothstep(0.2, 1.0, sin(uTime * 2.2 + aSeed * 17.0));
    } else if (uMode > 1.5) {
      // Снег: падает вокруг камеры, кружится, по кругу возвращается наверх.
      float h = 16.0;
      p.y = mod(p.y - uTime * (1.1 + aSeed * 0.8), h) - 1.0;
      p.x += sin(uTime * 0.8 + aSeed * 9.0) * 0.6;
      p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 22.0, 44.0) - 22.0;
    }
    vA = a;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale;
  }
`;
const GLOW_FRAG = /* glsl */ `
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

function glowMaterial(mode: number, additive: boolean, soft: number) {
  return new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    premultipliedAlpha: true,
    uniforms: { uScale: { value: 1 }, uTime: { value: 0 }, uOn: { value: 1 }, uMode: { value: mode }, uSoft: { value: soft }, uCenter: { value: new THREE.Vector3() } },
  });
}

function pointsGeometry(list: { x: number; y: number; z: number; size: number; color: string; seed?: number }[]) {
  const g = new THREE.BufferGeometry();
  const c = new THREE.Color();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(list.flatMap((p) => c.set(p.color).toArray()), 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(list.map((p) => p.size), 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(list.map((p, k) => p.seed ?? (k * 0.618) % 1), 1));
  return g;
}

/** Обновляет масштаб точек под зум камеры и время. */
function useGlowFrame(mat: THREE.ShaderMaterial, ctl: React.MutableRefObject<Ctl>, on: number) {
  const dpr = useThree((s) => s.viewport.dpr);
  useFrame((_, dt) => {
    const u = mat.uniforms;
    u.uScale.value = ctl.current.zoom * dpr;
    u.uTime.value += Math.min(dt, 0.1);
    u.uOn.value += (on - u.uOn.value) * Math.min(1, dt * 2);
    u.uCenter.value.set(ctl.current.tx, 0, ctl.current.tz);
  });
}

// ── Фонари ──────────────────────────────────────────────────────────────────────────────────────

/** Где стоят фонари: по краю места для стройки и у угла каждой постройки. */
export function lampSpots(buildings: ViewBld[]): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= GRID; k += 6) {
    out.push([W(k), W(-0.55)], [W(k), W(GRID + 0.55)]);
    if (k > 0 && k < GRID) out.push([W(-0.55), W(k)], [W(GRID + 0.55), W(k)]);
  }
  const taken = new Set(buildings.filter((b) => b.state !== 'ruin').flatMap((b) => {
    const cells: string[] = [];
    for (let i = 0; i < SIZE[b.t]; i++) for (let j = 0; j < SIZE[b.t]; j++) cells.push(`${b.x + i},${b.y + j}`);
    return cells;
  }));
  for (const b of buildings) {
    if (b.t === 'wall' || isTrap(b.t) || b.state === 'ruin') continue;
    const s = SIZE[b.t];
    // Ближний к камере угол постройки, если там свободно.
    if (taken.has(`${b.x + s},${b.y + s}`)) continue;
    out.push([W(b.x + s + 0.2), W(b.y + s + 0.2)]);
  }
  return out;
}

const postGeo = new THREE.CylinderGeometry(0.045, 0.06, 1.1, 6).translate(0, 0.55, 0);
const capGeo = new THREE.ConeGeometry(0.17, 0.14, 4).rotateY(Math.PI / 4).translate(0, 1.38, 0);
const lanternGeo = new THREE.BoxGeometry(0.18, 0.22, 0.18).translate(0, 1.2, 0);
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

let poolTex: THREE.Texture | null = null;
function poolTexture() {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  poolTex = new THREE.CanvasTexture(c);
  return poolTex;
}

export function Lamps({ spots, on, ctl, shadows }: { spots: [number, number][]; on: number; ctl: React.MutableRefObject<Ctl>; shadows: boolean }) {
  const meshes = useMemo(() => {
    const n = Math.max(1, spots.length);
    const post = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: '#3b2a22', roughness: 0.8 }), n);
    const cap = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: '#2d3346', roughness: 0.6 }), n);
    const lantern = new THREE.InstancedMesh(lanternGeo, new THREE.MeshStandardMaterial({ color: '#ffe2a8', emissive: '#ffb347', emissiveIntensity: 0 }), n);
    const pool = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ color: '#ffb35c', map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), n);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], k) => {
      m.makeTranslation(x, 0, z);
      post.setMatrixAt(k, m);
      cap.setMatrixAt(k, m);
      lantern.setMatrixAt(k, m);
      pool.setMatrixAt(k, m.makeScale(3.2, 1, 3.2).setPosition(x, 0.04, z));
    });
    for (const x of [post, cap, lantern, pool]) {
      x.count = spots.length;
      x.frustumCulled = false;
    }
    post.castShadow = cap.castShadow = shadows;
    pool.renderOrder = 1;
    return { post, cap, lantern, pool };
  }, [spots, shadows]);
  const glow = useMemo(() => glowMaterial(0, true, 0.05), []);
  const glowGeo = useMemo(() => pointsGeometry(spots.map(([x, z]) => ({ x, y: 1.22, z, size: 1.3, color: '#ffbf66' }))), [spots]);
  useEffect(() => () => Object.values(meshes).forEach((x) => (x.material as THREE.Material).dispose()), [meshes]);
  useEffect(() => () => glowGeo.dispose(), [glowGeo]);
  useEffect(() => () => glow.dispose(), [glow]);
  useGlowFrame(glow, ctl, on);
  useFrame(() => {
    const k = glow.uniforms.uOn.value as number;
    (meshes.lantern.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + 2.4 * k;
    (meshes.pool.material as THREE.MeshBasicMaterial).opacity = 0.55 * k;
    meshes.pool.visible = k > 0.02;
  });
  return (
    <>
      <primitive object={meshes.post} />
      <primitive object={meshes.cap} />
      <primitive object={meshes.lantern} />
      <primitive object={meshes.pool} />
      <points geometry={glowGeo} material={glow} frustumCulled={false} renderOrder={6} />
    </>
  );
}

/** Окна домов ночью: тёплый свет у стен построек. */
export function Windows({ buildings, on, ctl }: { buildings: ViewBld[]; on: number; ctl: React.MutableRefObject<Ctl> }) {
  const geo = useMemo(() => {
    const list: { x: number; y: number; z: number; size: number; color: string }[] = [];
    for (const b of buildings) {
      if (b.t === 'wall' || isTrap(b.t) || b.state !== 'ok') continue;
      const s = SIZE[b.t];
      const cx = W(b.x + s / 2);
      const cz = W(b.y + s / 2);
      list.push({ x: cx + s * 0.3, y: 0.7, z: cz + s * 0.3, size: s * 1.4, color: '#ff9d4d' });
    }
    return pointsGeometry(list);
  }, [buildings]);
  const mat = useMemo(() => glowMaterial(0, true, 0), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  useGlowFrame(mat, ctl, on * 0.55);
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />;
}

/** Светлячки над низиной у озера и леса — только ночью. */
export function Fireflies({ on, ctl, lite }: { on: number; ctl: React.MutableRefObject<Ctl>; lite: boolean }) {
  const geo = useMemo(() => {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const list = Array.from({ length: lite ? 40 : 90 }, () => {
      const a = rnd() * Math.PI * 2;
      const r = 17 + rnd() * 16;
      return { x: Math.cos(a) * r, y: -1.2 + rnd() * 1.8, z: Math.sin(a) * r, size: 0.28 + rnd() * 0.15, color: rnd() < 0.7 ? '#d8ff7a' : '#ffe08a', seed: rnd() };
    });
    return pointsGeometry(list);
  }, [lite]);
  const mat = useMemo(() => glowMaterial(1, true, 0.1), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  useGlowFrame(mat, ctl, on);
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />;
}

// ── Дождь и снег ────────────────────────────────────────────────────────────────────────────────

const RAIN_VERT = /* glsl */ `
  attribute float aEnd;
  attribute float aSeed;
  uniform float uTime;
  uniform vec3 uCenter;
  varying float vA;
  void main() {
    vec3 p = position;
    float h = 18.0;
    p.y = mod(p.y - uTime * (20.0 + aSeed * 6.0), h) - 2.0;
    p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 22.0, 44.0) - 22.0;
    // Капля — косой штрих: верхний конец выше и сдвинут ветром.
    p += aEnd * vec3(0.15, 1.0, 0.06);
    vA = mix(0.05, 0.8, aEnd) * smoothstep(-2.0, 0.0, p.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const RAIN_FRAG = /* glsl */ `
  varying float vA;
  void main() { gl_FragColor = vec4(0.82, 0.9, 1.0, vA); }
`;

export function Precipitation({ kind, ctl, lite }: { kind: Weather; ctl: React.MutableRefObject<Ctl>; lite: boolean }) {
  const rain = useMemo(() => {
    if (kind !== 'rain') return null;
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = lite ? 700 : 1600;
    const pos: number[] = [];
    const end: number[] = [];
    const sd: number[] = [];
    for (let k = 0; k < n; k++) {
      const x = rnd() * 44 - 22;
      const y = rnd() * 18;
      const z = rnd() * 44 - 22;
      const s = rnd();
      pos.push(x, y, z, x, y, z);
      end.push(0, 1);
      sd.push(s, s);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() } } });
    return { g, m };
  }, [kind, lite]);
  const snow = useMemo(() => {
    if (kind !== 'snow') return null;
    let seed = 9;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const list = Array.from({ length: lite ? 350 : 800 }, () => ({ x: rnd() * 44 - 22, y: rnd() * 16, z: rnd() * 44 - 22, size: 0.15 + rnd() * 0.13, color: '#ffffff', seed: rnd() }));
    return { g: pointsGeometry(list), m: glowMaterial(2, false, 0.35) };
  }, [kind, lite]);
  useEffect(() => () => void (rain && (rain.g.dispose(), rain.m.dispose())), [rain]);
  useEffect(() => () => void (snow && (snow.g.dispose(), snow.m.dispose())), [snow]);
  const dummy = useMemo(() => glowMaterial(2, false, 0.35), []);
  useGlowFrame(snow?.m ?? dummy, ctl, 1);
  useFrame((_, dt) => {
    if (!rain) return;
    rain.m.uniforms.uTime.value += Math.min(dt, 0.1);
    rain.m.uniforms.uCenter.value.set(ctl.current.tx, 0, ctl.current.tz);
  });
  if (rain) return <lineSegments geometry={rain.g} material={rain.m} frustumCulled={false} renderOrder={7} />;
  if (snow) return <points geometry={snow.g} material={snow.m} frustumCulled={false} renderOrder={7} />;
  return null;
}
