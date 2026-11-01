import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Canvas3D } from '../three/Canvas3D';
import { useSettings } from '../settings';
import { t } from '../i18n';
import SHAPES from './worldShapes.json';

// Глобус «Битвы городов»: страны окрашены своим показателем за неделю (повторы, герои, сильнейший),
// над городами — светящиеся столбы. Крутится пальцем, приближается щипком и колёсиком, касание выбирает
// город (если рядом есть столб) или страну. Подписи — обычный HTML поверх холста, двигаются каждый кадр.

export interface GlobeCity {
  key: string;
  name: string;
  lat: number;
  lon: number;
  value: number;
  label: string;
  mine?: boolean;
  place?: number;
}

export interface GlobeCountry {
  code: string;
  name: string;
  lat: number;
  lon: number;
  value: number;
  label: string;
  mine?: boolean;
}

export type GlobeSel = { kind: 'city' | 'country'; key: string } | null;

interface Props {
  countries: GlobeCountry[];
  cities: GlobeCity[];
  selected: GlobeSel;
  onSelect: (s: GlobeSel) => void;
  // Повернуть глобус к точке: n меняется при каждой просьбе, даже к той же точке.
  focus?: { lat: number; lon: number; zoom?: number; n: number };
}

type Shape = [code: string, rings: number[][]];
const shapes = SHAPES as unknown as Shape[];

const DEG = Math.PI / 180;
const MIN_DIST = 1.45;
const MAX_DIST = 4.6;
const START_DIST = 3.6;
// Подписи городов появляются при приближении сильнее этого расстояния.
const CITY_LABELS_AT = 2.6;

/** Точка на единичной сфере: так же, как SphereGeometry накладывает равнопромежуточную текстуру. */
export function latLonVec(lat: number, lon: number, r = 1, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(lat * DEG);
  return out.set(r * c * Math.cos(lon * DEG), r * Math.sin(lat * DEG), -r * c * Math.sin(lon * DEG));
}

// Рамки стран для быстрого поиска по касанию.
const boxes = shapes.map(([, rings]) => {
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (const r of rings)
    for (let i = 0; i < r.length; i += 2) {
      x0 = Math.min(x0, r[i]);
      x1 = Math.max(x1, r[i]);
      y0 = Math.min(y0, r[i + 1]);
      y1 = Math.max(y1, r[i + 1]);
    }
  return [x0, y0, x1, y1];
});

/** Страна под точкой (широта и долгота) или null — море. */
export function countryAt(lat: number, lon: number): string | null {
  const x = lon * 10;
  const y = lat * 10;
  for (let s = 0; s < shapes.length; s++) {
    const b = boxes[s];
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    for (const r of shapes[s][1]) {
      let inside = false;
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const yi = r[i + 1];
        const yj = r[j + 1];
        if (yi > y !== yj > y && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) inside = !inside;
      }
      if (inside) return shapes[s][0];
    }
  }
  return null;
}

// Цвета: пустая суша, тёплая шкала от слабого к лучшему, свои — мятные.
const EMPTY = '#232a3f';
const SCALE = [new THREE.Color('#5e3a44'), new THREE.Color('#c9563f'), new THREE.Color('#ff8a4c'), new THREE.Color('#ffc247')];
function heat(k: number): THREE.Color {
  const x = Math.max(0, Math.min(1, k)) * (SCALE.length - 1);
  const i = Math.min(SCALE.length - 2, Math.floor(x));
  return SCALE[i].clone().lerp(SCALE[i + 1], x - i);
}
const share = (v: number, max: number) => (v > 0 && max > 0 ? Math.log1p(v) / Math.log1p(max) : 0);

/** Текстура Земли: океан, сетка, страны цветом показателя, границы. */
function drawEarth(ctx: CanvasRenderingContext2D, w: number, h: number, values: Map<string, GlobeCountry>, max: number, selected: string | null) {
  const sx = w / 3600;
  const sy = h / 1800;
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, '#0b1020');
  ocean.addColorStop(0.5, '#101a33');
  ocean.addColorStop(1, '#0b1020');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);
  // Широты и долготы через 15°.
  ctx.strokeStyle = 'rgba(140, 170, 255, .07)';
  ctx.lineWidth = Math.max(1, w / 2048);
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 15) {
    ctx.moveTo((lon + 180) * 10 * sx, 0);
    ctx.lineTo((lon + 180) * 10 * sx, h);
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    ctx.moveTo(0, (90 - lat) * 10 * sy);
    ctx.lineTo(w, (90 - lat) * 10 * sy);
  }
  ctx.stroke();
  const trace = (rings: number[][]) => {
    ctx.beginPath();
    for (const r of rings) {
      ctx.moveTo((r[0] + 1800) * sx, (900 - r[1]) * sy);
      for (let i = 2; i < r.length; i += 2) ctx.lineTo((r[i] + 1800) * sx, (900 - r[i + 1]) * sy);
      ctx.closePath();
    }
  };
  ctx.lineJoin = 'round';
  for (const [code, rings] of shapes) {
    const c = values.get(code);
    trace(rings);
    ctx.fillStyle = c && c.value > 0 ? `#${heat(share(c.value, max)).getHexString()}` : EMPTY;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 14, 26, .9)';
    ctx.lineWidth = Math.max(1, w / 1400);
    ctx.stroke();
  }
  // Своя и выбранная страна — обводкой поверх соседей.
  for (const [code, rings] of shapes) {
    const c = values.get(code);
    if (code !== selected && !c?.mine) continue;
    trace(rings);
    ctx.strokeStyle = code === selected ? '#ffffff' : '#6ee7b7';
    ctx.lineWidth = Math.max(1.5, w / 1300);
    ctx.stroke();
  }
}

/** Свечение атмосферы по краю шара. */
const atmosphereMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color('#7fa2ff') } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; varying vec3 vN; varying vec3 vV; void main(){ float k = pow(clamp(-dot(vN, vV) * 2.3, 0.0, 1.0), 2.2); gl_FragColor = vec4(color, 1.0) * k * 0.55; }',
  });

interface ViewState {
  lat: number;
  lon: number;
  dist: number;
  // Скорость вращения после броска пальцем (градусов за кадр).
  vLat: number;
  vLon: number;
  // Куда плавно лететь (к выбранной точке).
  to: { lat: number; lon: number; dist: number } | null;
  // Время последнего касания: без него глобус медленно крутится сам.
  touched: number;
}

interface LabelItem {
  id: string;
  lat: number;
  lon: number;
  r: number;
  kind: 'city' | 'country';
}

function Scene({ props, view, labelsRef, items, low, onReady }: { props: Props; view: React.RefObject<ViewState>; labelsRef: React.RefObject<HTMLDivElement | null>; items: LabelItem[]; low: boolean; onReady: () => void }) {
  const { countries, cities, selected } = props;
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  // Текстура: перерисовывается при смене данных и выбора.
  const W = low ? 2048 : 4096;
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = W / 2;
    return c;
  }, [W]);
  const texture = useMemo(() => {
    const tx = new THREE.CanvasTexture(canvas);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 4;
    return tx;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const maxCountry = useMemo(() => countries.reduce((m, c) => Math.max(m, c.value), 0), [countries]);
  useEffect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawEarth(ctx, canvas.width, canvas.height, byCode, maxCountry, selected?.kind === 'country' ? selected.key : null);
    texture.needsUpdate = true;
  }, [canvas, texture, byCode, maxCountry, selected]);

  // Столбы над городами с показателем.
  const lit = useMemo(() => cities.filter((c) => c.value > 0 || c.mine || (selected?.kind === 'city' && selected.key === c.key)), [cities, selected]);
  const maxCity = useMemo(() => lit.reduce((m, c) => Math.max(m, c.value), 0), [lit]);
  const pillars = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const pillarGeo = useMemo(() => new THREE.CylinderGeometry(0.0045, 0.0045, 1, 6, 1).translate(0, 0.5, 0), []);
  const capGeo = useMemo(() => new THREE.SphereGeometry(0.011, 10, 8), []);
  // Толщина столбов следует за приближением: вблизи они не должны закрывать полстраны.
  const thick = useRef(1);
  const [thickness, setThickness] = useState(1);
  useLayoutEffect(() => {
    const p = pillars.current;
    const cp = caps.current;
    if (!p || !cp) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const n = new THREE.Vector3();
    lit.forEach((c, i) => {
      const k = share(c.value, maxCity);
      const hgt = 0.015 + 0.15 * k;
      latLonVec(c.lat, c.lon, 1, n);
      q.setFromUnitVectors(up, n);
      m.compose(pos.copy(n), q, new THREE.Vector3(thickness, hgt, thickness));
      p.setMatrixAt(i, m);
      m.compose(pos.copy(n).multiplyScalar(1 + hgt), q, new THREE.Vector3(1, 1, 1).multiplyScalar((0.8 + k * 0.7) * thickness));
      cp.setMatrixAt(i, m);
      const col = c.mine ? new THREE.Color('#6ee7b7') : selected?.kind === 'city' && selected.key === c.key ? new THREE.Color('#ffffff') : heat(0.35 + k * 0.65);
      p.setColorAt(i, col);
      cp.setColorAt(i, col.clone().lerp(new THREE.Color('#fff6e0'), 0.45));
    });
    p.count = cp.count = lit.length;
    p.instanceMatrix.needsUpdate = cp.instanceMatrix.needsUpdate = true;
    if (p.instanceColor) p.instanceColor.needsUpdate = true;
    if (cp.instanceColor) cp.instanceColor.needsUpdate = true;
    p.computeBoundingSphere();
    cp.computeBoundingSphere();
  }, [lit, maxCity, selected, thickness]);

  const stars = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = low ? 250 : 600;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(14 + Math.random() * 6);
      a.set([v.x, v.y, v.z], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return g;
  }, [low]);
  const atmosphere = useMemo(atmosphereMaterial, []);

  const tmp = useMemo(() => ({ v: new THREE.Vector3(), n: new THREE.Vector3(), cam: new THREE.Vector3() }), []);
  // Первый кадр с текстурой: только тогда показываем глобус и подписи, без пустого шара.
  const frames = useRef(0);
  useFrame((_, dt) => {
    const v = view.current;
    if (!v) return;
    if (frames.current < 3 && ++frames.current === 3) onReady();
    const f = Math.min(dt * 60, 3);
    if (v.to) {
      // Полёт к точке: кратчайшим путём по долготе.
      let dLon = ((v.to.lon - v.lon + 540) % 360) - 180;
      const k = 1 - Math.pow(0.88, f);
      v.lon += dLon * k;
      v.lat += (v.to.lat - v.lat) * k;
      v.dist += (v.to.dist - v.dist) * k;
      dLon = ((v.to.lon - v.lon + 540) % 360) - 180;
      if (Math.abs(dLon) < 0.05 && Math.abs(v.to.lat - v.lat) < 0.05 && Math.abs(v.to.dist - v.dist) < 0.005) v.to = null;
    } else {
      v.lon += v.vLon * f;
      v.lat = Math.max(-75, Math.min(80, v.lat + v.vLat * f));
      const damp = Math.pow(0.92, f);
      v.vLon *= damp;
      v.vLat *= damp;
      if (performance.now() - v.touched > 4000) v.lon += 0.035 * f;
    }
    outer.current?.rotation.set(v.lat * DEG, 0, 0);
    inner.current?.rotation.set(0, -Math.PI / 2 - v.lon * DEG, 0);
    camera.position.set(0, 0, v.dist);
    camera.lookAt(0, 0, 0);
    const want = Math.max(0.3, Math.min(1, (v.dist - 1) / (START_DIST - 1.4)));
    if (Math.abs(want - thick.current) > 0.06) {
      thick.current = want;
      setThickness(want);
    }

    // Подписи: только на видимой стороне, с затуханием к краю.
    const box = labelsRef.current;
    if (!box || !inner.current) return;
    inner.current.updateWorldMatrix(true, false);
    tmp.cam.set(0, 0, v.dist);
    const cityZoom = v.dist < CITY_LABELS_AT;
    // Подписи по важности: какая налезает на уже поставленную — прячется.
    const placed: [number, number, number, number][] = [];
    for (const it of items) {
      const el = box.querySelector<HTMLElement>(`[data-id="${CSS.escape(it.id)}"]`);
      if (!el) continue;
      const show = it.kind === 'country' ? !cityZoom || el.classList.contains('sel') : cityZoom || el.classList.contains('sel') || el.classList.contains('mine');
      latLonVec(it.lat, it.lon, it.r, tmp.v).applyMatrix4(inner.current.matrixWorld);
      const facing = tmp.n.copy(tmp.v).normalize().dot(tmp.cam.clone().sub(tmp.v).normalize());
      if (!show || facing < 0.2) {
        el.style.opacity = '0';
        continue;
      }
      tmp.v.project(camera);
      const x = ((tmp.v.x + 1) / 2) * size.width;
      const y = ((1 - tmp.v.y) / 2) * size.height;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const r: [number, number, number, number] = [x - w / 2, y - h, x + w / 2, y];
      if (placed.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) {
        el.style.opacity = '0';
        continue;
      }
      placed.push(r);
      el.style.opacity = String(Math.min(1, (facing - 0.2) * 4));
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[-3, 2, 4]} intensity={1.6} />
      <points geometry={stars}>
        <pointsMaterial color="#c9d4ff" size={0.06} sizeAttenuation transparent opacity={0.7} />
      </points>
      <group ref={outer}>
        <group ref={inner}>
          <mesh>
            <sphereGeometry args={[1, low ? 64 : 96, low ? 40 : 64]} />
            <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.42} roughness={0.85} metalness={0} />
          </mesh>
          <instancedMesh ref={pillars} args={[pillarGeo, undefined, Math.max(1, cities.length)]} frustumCulled={false}>
            <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
          </instancedMesh>
          <instancedMesh ref={caps} args={[capGeo, undefined, Math.max(1, cities.length)]} frustumCulled={false}>
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
        </group>
      </group>
      <mesh scale={1.1} material={atmosphere}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
    </>
  );
}

export function Globe(props: Props) {
  const { countries, cities, selected, onSelect, focus } = props;
  const s = useSettings();
  const box = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const view = useRef<ViewState>({ lat: 42, lon: 60, dist: START_DIST, vLat: 0, vLon: 0, to: null, touched: 0 });
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (!focus) return;
    const v = view.current;
    v.to = { lat: Math.max(-60, Math.min(70, focus.lat)), lon: focus.lon, dist: focus.zoom ?? Math.min(v.dist, 2.4) };
    v.touched = performance.now() + 4000;
  }, [focus]);

  // Подписи: лидеры среди стран (на всём шаре) и городов (при приближении), свой город и выбранное.
  const maxCity = cities.reduce((m, c) => Math.max(m, c.value), 0);
  const items = useMemo<(LabelItem & { name: string; label: string; cls: string })[]>(() => {
    const sel = (kind: string, key: string) => selected?.kind === kind && selected.key === key;
    const cs = countries
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .concat(countries.filter((c) => sel('country', c.code) && !(c.value > 0)));
    const ct = [...cities]
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .concat(cities.filter((c) => (c.mine || sel('city', c.key)) && !(c.value > 0)));
    const out: (LabelItem & { name: string; label: string; cls: string })[] = [];
    const seen = new Set<string>();
    for (const c of cs) {
      const id = `country:${c.code}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, kind: 'country', lat: c.lat, lon: c.lon, r: 1.01, name: c.name, label: c.value > 0 ? c.label : '', cls: `${c.mine ? ' mine' : ''}${sel('country', c.code) ? ' sel' : ''}` });
    }
    for (const c of ct) {
      const id = `city:${c.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, kind: 'city', lat: c.lat, lon: c.lon, r: 1 + 0.015 + 0.15 * share(c.value, maxCity) + 0.02, name: c.name, label: c.value > 0 ? c.label : '', cls: `${c.mine ? ' mine' : ''}${sel('city', c.key) ? ' sel' : ''}${c.place === 1 ? ' p1' : ''}` });
    }
    // Важнее — выбранное, потом своё: при наложении прячутся остальные.
    const rank = (x: { cls: string }) => (x.cls.includes(' sel') ? 2 : x.cls.includes(' mine') ? 1 : 0);
    return out.sort((x, y) => rank(y) - rank(x));
  }, [countries, cities, selected, maxCity]);

  // Палец и мышь: вращение, щипок, колёсико, короткое касание — выбор.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let last: { x: number; y: number; d: number } | null = null;
    let moved = 0;
    let downAt = 0;
    let lastMove = 0;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const centroid = () => {
      const a = [...pts.values()];
      const x = a.reduce((s, p) => s + p.x, 0) / a.length;
      const y = a.reduce((s, p) => s + p.y, 0) / a.length;
      return { x, y, d: a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0 };
    };
    // Градусов на пиксель: чем ближе камера, тем медленнее.
    const degPerPx = () => ((view.current.dist - 1) / (START_DIST - 1)) * (150 / el.clientHeight);
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      const v = view.current;
      v.to = null;
      v.vLat = v.vLon = 0;
      v.touched = performance.now();
      if (pts.size === 1) {
        moved = 0;
        downAt = performance.now();
      }
      last = centroid();
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      const c = centroid();
      if (!last) return void (last = c);
      const v = view.current;
      const k = degPerPx();
      const dx = c.x - last.x;
      const dy = c.y - last.y;
      if (last.d && c.d) v.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, v.dist * (last.d / c.d)));
      v.lon -= dx * k;
      v.lat = Math.max(-75, Math.min(80, v.lat + dy * k));
      const now = performance.now();
      const dt = Math.max(8, now - lastMove);
      lastMove = now;
      v.vLon = (-dx * k * 16) / dt;
      v.vLat = (dy * k * 16) / dt;
      v.touched = now;
      moved += Math.hypot(dx, dy) + Math.abs(c.d - last.d);
      last = c;
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId)!;
      pts.delete(e.pointerId);
      last = pts.size ? centroid() : null;
      const v = view.current;
      if (performance.now() - lastMove > 80) v.vLat = v.vLon = 0;
      if (pts.size || moved >= 8 || performance.now() - downAt > 500) return;
      v.vLat = v.vLon = 0;
      propsRef.current.onSelect(pick(p.x, p.y, el.clientWidth, el.clientHeight));
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      v.to = null;
      v.touched = performance.now();
      v.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, v.dist * Math.exp(e.deltaY / 500)));
    };
    /** Что под пальцем: ближайший столб в 24 пикселях, иначе страна. */
    const pick = (x: number, y: number, w: number, h: number): GlobeSel => {
      const v = view.current;
      const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
      cam.position.set(0, 0, v.dist);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      const rot = new THREE.Matrix4().makeRotationX(v.lat * DEG).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2 - v.lon * DEG));
      const p = new THREE.Vector3();
      let best: string | null = null;
      let bestD = 24;
      const toCam = new THREE.Vector3();
      for (const c of propsRef.current.cities) {
        if (!(c.value > 0) && !c.mine) continue;
        latLonVec(c.lat, c.lon, 1.02, p).applyMatrix4(rot);
        if (p.clone().normalize().dot(toCam.copy(cam.position).sub(p).normalize()) < 0.15) continue;
        p.project(cam);
        const d = Math.hypot(((p.x + 1) / 2) * w - x, ((1 - p.y) / 2) * h - y);
        if (d < bestD) [best, bestD] = [c.key, d];
      }
      if (best) return { kind: 'city', key: best };
      // Луч из камеры в шар: точка на поверхности → широта и долгота.
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), cam);
      const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
      if (!hit) return null;
      hit.applyMatrix4(rot.clone().invert());
      const lat = Math.asin(Math.max(-1, Math.min(1, hit.y))) / DEG;
      const lon = Math.atan2(-hit.z, hit.x) / DEG;
      const code = countryAt(lat, lon);
      return code ? { kind: 'country', key: code } : null;
    };
    // Лист снизу не должен уезжать, пока крутим глобус.
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('touchstart', stop, { passive: true });
    el.addEventListener('touchmove', stop, { passive: true });
    el.addEventListener('mousedown', stop);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('touchmove', stop);
      el.removeEventListener('mousedown', stop);
    };
  }, []);

  const zoom = (k: number) => {
    const v = view.current;
    v.touched = performance.now();
    v.to = { lat: v.lat, lon: v.lon, dist: Math.max(MIN_DIST, Math.min(MAX_DIST, v.dist * k)) };
  };

  return (
    <div className="globe" ref={box}>
      <Canvas3D camera={{ fov: 40, position: [0, 0, START_DIST], near: 0.1, far: 100 }} gl={{ antialias: !s.lowPower, alpha: true }}>
        <Scene props={props} view={view} labelsRef={labels} items={items} low={s.lowPower} onReady={() => box.current?.classList.add('ready')} />
      </Canvas3D>
      <div className="globe-labels" ref={labels}>
        {items.map((it) => (
          <div key={it.id} data-id={it.id} className={`globe-label ${it.kind}${it.cls}`}>
            <span className="nm">{it.name}</span>
            {it.label && <span className="val">{it.label}</span>}
          </div>
        ))}
      </div>
      <div className="globe-zoom">
        <button onClick={() => zoom(0.75)} aria-label={t('Приблизить')}>
          +
        </button>
        <button onClick={() => zoom(1.33)} aria-label={t('Отдалить')}>
          −
        </button>
        <button className="all" onClick={() => zoom(START_DIST / view.current.dist)} aria-label={t('Вся планета')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
