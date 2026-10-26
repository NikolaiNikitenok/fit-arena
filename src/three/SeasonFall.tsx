import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Осенью с неба кружась летят листья, весной — лепестки. Каждый — точка, которую шейдер
// превращает в листок: он падает, раскачивается и переворачивается (сужается по ширине).
// Падают вокруг точки, куда смотрит камера, и по кругу возвращаются наверх.

export type Season = 'autumn' | 'spring';

/** Время года для листьев и лепестков: осень — сентябрь…ноябрь, весна — март…май. В разработке: ?season=spring. */
export function seasonNow(date = new Date()): Season | null {
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search).get('season');
    if (q === 'autumn' || q === 'spring') return q;
    if (q === 'none') return null;
  }
  const m = date.getMonth();
  if (m >= 8 && m <= 10) return 'autumn';
  if (m >= 2 && m <= 4) return 'spring';
  return null;
}

const COLORS: Record<Season, string[]> = {
  autumn: ['#e8742a', '#f2a93b', '#ffd04f', '#e3902c', '#d9622b', '#f5c04a'],
  spring: ['#ffc3d8', '#ffd9e6', '#ffffff', '#ffb0cb', '#fbe3ef'],
};

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  uniform float uScale;
  uniform float uTime;
  uniform float uPersp;
  uniform float uBox;
  uniform float uH;
  uniform vec3 uCenter;
  varying vec3 vColor;
  varying float vAng;
  varying float vFlip;
  varying float vA;
  void main() {
    vColor = color;
    vec3 p = position;
    float t = uTime;
    float fall = 0.55 + aSeed * 0.5;
    p.y = mod(p.y - t * fall, uH) - 0.5;
    // Ветер несёт вбок, листок раскачивается маятником.
    p.x += t * 0.35 + sin(t * (0.9 + aSeed) + aSeed * 20.0) * 0.9;
    p.z += cos(t * (0.7 + aSeed * 0.6) + aSeed * 13.0) * 0.6;
    float hb = uBox * 0.5;
    p.xz = uCenter.xz + mod(p.xz - uCenter.xz + hb, uBox) - hb;
    vAng = t * (1.2 + aSeed * 2.0) + aSeed * 31.0;
    vFlip = cos(t * (2.0 + aSeed * 2.5) + aSeed * 7.0);
    // У земли и под самым небом тает.
    vA = smoothstep(-0.5, 0.6, p.y) * (1.0 - smoothstep(uH - 2.5, uH - 0.5, p.y));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPersp > 0.5 ? aSize * uScale / max(0.5, -mv.z) : aSize * uScale;
  }
`;
const FRAG = /* glsl */ `
  uniform float uPetal;
  varying vec3 vColor;
  varying float vAng;
  varying float vFlip;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vAng), s = sin(vAng);
    q = mat2(c, -s, s, c) * q;
    // Переворот: листок сужается, как будто повернулся ребром.
    float w = 0.25 + 0.75 * abs(vFlip);
    q.x /= w;
    float d;
    if (uPetal > 0.5) {
      // Лепесток: округлый, с выемкой сверху.
      d = length(q * vec2(1.25, 1.0)) * 2.4 + 0.35 * smoothstep(0.08, 0.0, abs(q.x)) * step(0.0, q.y);
    } else {
      // Лист: острый с обоих концов, с прожилкой.
      d = abs(q.x) * 2.0 / max(0.05, 0.5 - q.y * q.y * 1.7) ;
      d = max(d, abs(q.y) * 2.1);
    }
    if (d > 1.0) discard;
    vec3 col = vColor * (0.78 + 0.22 * vFlip);
    if (uPetal < 0.5) col *= 1.0 - 0.25 * smoothstep(0.03, 0.0, abs(q.x));
    gl_FragColor = vec4(col, vA * (1.0 - smoothstep(0.85, 1.0, d)));
  }
`;

export function SeasonFall({ season, center, perspective = false, lite = false, box = 44, height = 16, scale = 1, zoom }: { season: Season; center: (out: THREE.Vector3) => void; perspective?: boolean; lite?: boolean; box?: number; height?: number; scale?: number; zoom?: () => number }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const size = useThree((s) => s.size);
  const { geo, mat } = useMemo(() => {
    let seed = 17;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = lite ? 70 : 150;
    const pal = COLORS[season];
    const c = new THREE.Color();
    const pos: number[] = [];
    const col: number[] = [];
    const sz: number[] = [];
    const sd: number[] = [];
    for (let k = 0; k < n; k++) {
      pos.push(rnd() * box - box / 2, rnd() * height, rnd() * box - box / 2);
      c.set(pal[Math.floor(rnd() * pal.length)]);
      col.push(c.r, c.g, c.b);
      sz.push((season === 'spring' ? 0.5 : 0.52) * scale * (0.75 + rnd() * 0.5));
      sd.push(rnd());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 1 }, uTime: { value: 0 }, uPersp: { value: perspective ? 1 : 0 }, uBox: { value: box }, uH: { value: height }, uCenter: { value: new THREE.Vector3() }, uPetal: { value: season === 'spring' ? 1 : 0 } },
    });
    return { geo: g, mat: m };
  }, [season, lite, box, height, perspective, scale]);
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);
  useFrame((st, dt) => {
    const u = mat.uniforms;
    u.uTime.value += Math.min(dt, 0.1);
    center(u.uCenter.value);
    // Ортографическая камера: пикселей на метр = зум. Перспектива: делим на глубину в шейдере.
    u.uScale.value = perspective ? (size.height * dpr) / (2 * Math.tan(((st.camera as THREE.PerspectiveCamera).fov * Math.PI) / 360)) : (zoom?.() ?? 14) * dpr;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={7} />;
}
