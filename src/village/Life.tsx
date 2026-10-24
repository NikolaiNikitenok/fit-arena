// Живая деревня: жители ходят между постройками (по дорожкам охотнее, чем по траве), над деревней
// кружат птицы (на Хэллоуин — летучие мыши), у таверны в воздух поднимаются ноты.
// Всё это только в своей деревне и только для красоты: в бою и у соседей тихо.
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GRID, isTrap } from '../../shared/village';
import { Character, type CharAnim } from '../three/Character';
import { charUrl, useGltf, type CharName } from '../three/kit';
import { SIZE } from './looks';
import { turnToward } from './troopPose';
import type { Decor, ThemeId } from './decor';
import type { ViewBld } from './Village3D';

const W = (c: number) => c - GRID / 2;
const N = GRID * GRID;
const HEIGHT = 1.35;
// Клеток в секунду: прогулочный шаг.
const SPEED = 1.05;

interface Map2 {
  // 1 — занято (постройка, стена, украшение кроме дорожки).
  blocked: Uint8Array;
  // Цена шага по клетке: дорожка дешевле травы.
  cost: Uint8Array;
  // Куда ходят: клетки у входа в постройки и у скамеек.
  spots: { c: number; bench?: boolean }[];
}

export function lifeMap(buildings: ViewBld[], decor: Decor[]): Map2 {
  const blocked = new Uint8Array(N);
  const cost = new Uint8Array(N).fill(3);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < GRID && y < GRID ? y * GRID + x : -1);
  for (const b of buildings) {
    if (isTrap(b.t)) continue;
    const s = SIZE[b.t];
    for (let y = b.y; y < b.y + s; y++) for (let x = b.x; x < b.x + s; x++) if (at(x, y) >= 0) blocked[at(x, y)] = 1;
  }
  for (const d of decor) {
    const c = at(d.x, d.y);
    if (c < 0) continue;
    if (d.k === 'path') cost[c] = 1;
    else blocked[c] = 1;
  }
  const spots: Map2['spots'] = [];
  for (const b of buildings) {
    if (b.t === 'wall' || isTrap(b.t) || b.state === 'new') continue;
    const s = SIZE[b.t];
    // Вход — середина ближней к камере стороны.
    const c = at(b.x + (s >> 1), b.y + s);
    if (c >= 0 && !blocked[c]) spots.push({ c });
  }
  for (const d of decor) {
    if (d.k !== 'bench' && d.k !== 'well' && d.k !== 'lantern' && !d.k.startsWith('statue')) continue;
    const c = at(d.x, d.y + 1);
    if (c >= 0 && !blocked[c]) spots.push({ c, bench: d.k === 'bench' });
  }
  return { blocked, cost, spots };
}

/** Путь по клеткам (Дейкстра, 8 направлений без срезания углов). Пустой — пути нет. */
export function route(m: Map2, from: number, to: number): number[] {
  if (from === to) return [to];
  const dist = new Float32Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const open: number[] = [from];
  dist[from] = 0;
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
    const c = open.splice(bi, 1)[0];
    if (c === to) break;
    const x = c % GRID;
    const y = (c / GRID) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const n = ny * GRID + nx;
        if (m.blocked[n]) continue;
        if (dx && dy && (m.blocked[y * GRID + nx] || m.blocked[ny * GRID + x])) continue;
        const d = dist[c] + m.cost[n] * (dx && dy ? 1.41 : 1);
        if (d < dist[n]) {
          if (dist[n] === Infinity) open.push(n);
          dist[n] = d;
          prev[n] = c;
        }
      }
  }
  if (prev[to] < 0) return [];
  const out: number[] = [];
  for (let c = to; c !== from; c = prev[c]) out.push(c);
  return out.reverse();
}

const LOOKS: { model: CharName; tint: string }[] = [
  { model: 'Rogue', tint: 'mul:1,0.92,0.8' },
  { model: 'Mage', tint: 'mul:0.85,1,0.9' },
  { model: 'Barbarian', tint: 'mul:1,0.85,0.75' },
  { model: 'Rogue', tint: 'mul:0.8,0.85,1' },
  { model: 'Mage', tint: 'mul:1,0.85,0.95' },
  { model: 'Barbarian', tint: 'mul:0.9,0.95,1' },
];

const cellX = (c: number) => (c % GRID) + 0.5;
const cellY = (c: number) => ((c / GRID) | 0) + 0.5;

function Villager({ map, k, look }: { map: Map2; k: number; look: { model: CharName; tint: string } }) {
  const g = useRef<THREE.Group>(null);
  const [anim, setAnim] = useState<CharAnim>('idle');
  const model = useGltf(charUrl(look.model));
  const scale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model.scene);
    return HEIGHT / Math.max(0.5, box.max.y - Math.min(0, box.min.y));
  }, [model]);
  const st = useRef<{ at: number; path: number[]; pi: number; x: number; y: number; wait: number; face: number; seed: number } | null>(null);
  useFrame((_, raw) => {
    if (!g.current || !map.spots.length) return;
    const dt = Math.min(raw, 0.1);
    let o = st.current;
    if (!o) {
      const s = map.spots[(k * 5) % map.spots.length];
      o = st.current = { at: s.c, path: [], pi: 0, x: cellX(s.c), y: cellY(s.c), wait: 1 + k * 1.7, face: 0, seed: 17 + k * 31 };
    }
    let next: CharAnim = 'idle';
    if (o.wait > 0) {
      o.wait -= dt;
      const sp = map.spots.find((s) => s.c === o!.at);
      next = sp?.bench ? 'sit' : 'idle';
      if (o.wait <= 0) {
        // Новая цель: случайная точка, но всегда та же последовательность для этого жителя.
        o.seed = (o.seed * 16807) % 2147483647;
        const to = map.spots[o.seed % map.spots.length].c;
        const from = Math.max(0, Math.min(N - 1, Math.floor(o.y) * GRID + Math.floor(o.x)));
        o.path = map.blocked[from] ? [to] : route(map, from, to);
        o.pi = 0;
        o.at = to;
        if (!o.path.length) o.wait = 2;
      }
    } else if (o.pi < o.path.length) {
      next = 'walk';
      const c = o.path[o.pi];
      const tx = cellX(c);
      const ty = cellY(c);
      const dx = tx - o.x;
      const dy = ty - o.y;
      const d = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (d <= step) {
        o.x = tx;
        o.y = ty;
        o.pi++;
        if (o.pi >= o.path.length) o.wait = 3 + ((o.seed >> 3) % 6);
      } else {
        o.x += (dx / d) * step;
        o.y += (dy / d) * step;
        o.face = turnToward(o.face, Math.atan2(dx, dy), Math.min(1, dt * 8));
      }
    } else o.wait = 2;
    g.current.position.set(W(o.x), 0, W(o.y));
    g.current.rotation.y = o.face;
    if (next !== anim) setAnim(next);
  });
  return (
    <group ref={g}>
      <Character model={look.model} tint={look.tint} anim={anim} scale={scale} hands={{}} />
    </group>
  );
}

/** Жители: тем больше, чем больше деревня; в экономном режиме — трое. */
export function Villagers({ buildings, decor, lite }: { buildings: ViewBld[]; decor: Decor[]; lite: boolean }) {
  const layout = buildings.map((b) => `${b.t}${b.x},${b.y}${b.state === 'new' ? 'n' : ''}`).join(';') + '|' + decor.map((d) => `${d.k}${d.x},${d.y}`).join(';');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const map = useMemo(() => lifeMap(buildings, decor), [layout]);
  const big = buildings.filter((b) => b.t !== 'wall' && !isTrap(b.t)).length;
  const n = Math.min(lite ? 3 : 6, 1 + Math.floor(big / 2), map.spots.length);
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <Villager key={`${k}:${layout.length}`} map={map} k={k} look={LOOKS[k % LOOKS.length]} />
      ))}
    </>
  );
}

const BIRDS = 9;
/** Птицы кружат стайкой высоко над деревней; на Хэллоуин вместо них — летучие мыши, и они летают и ночью. */
export function Birds({ theme, night }: { theme: ThemeId; night: number }) {
  const bats = theme === 'halloween';
  const mesh = useMemo(() => {
    // Тельце и два крыла: крылья машут, растягиваясь по высоте.
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, -0.5, 0.05, -0.05, 0, 0, -0.12, 0, 0, 0.18, 0, 0, -0.12, 0.5, 0.05, -0.05], 3));
    g.computeVertexNormals();
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: bats ? '#1b1424' : '#2a2f3a', side: THREE.DoubleSide }), BIRDS);
    m.frustumCulled = false;
    return m;
  }, [bats]);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const show = bats || night < 0.6;
    mesh.visible = show;
    if (!show) return;
    const t = performance.now() / 1000;
    for (let k = 0; k < BIRDS; k++) {
      const flock = k < 5 ? 0 : 1;
      const sp = (bats ? 0.5 : 0.22) * (flock ? -1 : 1);
      const a = t * sp + k * 0.45 + flock * 3;
      const r = (flock ? 11 : 15) + Math.sin(t * 0.3 + k) * 1.5 + (k % 3) * 0.6;
      p.set(Math.cos(a) * r, (bats ? 5 : 8) + flock * 1.5 + Math.sin(t * 1.3 + k) * 0.4, Math.sin(a) * r);
      e.set(0, -a + (sp > 0 ? Math.PI : 0), Math.sin(t * 2 + k) * 0.2);
      q.setFromEuler(e);
      const flap = Math.sin(t * (bats ? 18 : 9) + k * 1.3);
      s.set(bats ? 0.75 : 0.65, 1 + flap * 3, bats ? 0.75 : 0.65);
      mesh.setMatrixAt(k, mat.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

/** Ноты над таверной: поднимаются и тают, пока там играют музыканты. */
export function TavernNotes({ buildings }: { buildings: ViewBld[] }) {
  const tav = buildings.find((b) => b.t === 'tavern' && b.state !== 'new');
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffe8a3';
    g.strokeStyle = 'rgba(60,40,10,.7)';
    g.lineWidth = 4;
    g.font = '900 52px Nunito, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeText('♪', 32, 34);
    g.fillText('♪', 32, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(() => {
    if (!tav) return;
    const t = performance.now() / 1000;
    const s = SIZE.tavern;
    refs.current.forEach((sp, k) => {
      if (!sp) return;
      const f = (t * 0.35 + k / 3) % 1;
      sp.position.set(W(tav.x + s / 2) + 0.5 * Math.sin(f * 6 + k * 2), 2.4 + f * 2.2, W(tav.y + s / 2) + 0.3 * Math.cos(f * 5 + k));
      (sp.material as THREE.SpriteMaterial).opacity = Math.sin(f * Math.PI);
    });
  });
  if (!tav) return null;
  return (
    <>
      {[0, 1, 2].map((k) => (
        <sprite key={k} ref={(el) => void (refs.current[k] = el)} scale={[0.55, 0.55, 1]} renderOrder={6}>
          <spriteMaterial map={tex} transparent depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}
