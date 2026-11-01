import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OVERLAY } from '../three/StylePass';
import { GRID } from '../../shared/village';
import { pulse, resetPulses, wear } from '../three/pulse';
import { emitFx } from './Particles';
import type { BattleView } from './Village3D';

// Удары в бою: постройка вздрагивает и вспыхивает, летят искры, над ней всплывает урон.
// Побитая больше чем наполовину темнеет и дымится. Всё смотрит только на здоровье построек,
// сам бой ничего не знает о показе.

const W = (c: number) => c - GRID / 2;
const NUMS = 16;
const NUM_MS = 850;

interface Num {
  sprite: THREE.Sprite;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  born: number;
  x: number;
  y: number;
  z: number;
  big: boolean;
}

function makeNum(): Num {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 72;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  sprite.renderOrder = 9;
  sprite.layers.set(OVERLAY);
  sprite.visible = false;
  return { sprite, ctx: c.getContext('2d')!, tex, born: -1e9, x: 0, y: 0, z: 0, big: false };
}

// Цифра пухлая, с тёмной обводкой и бликом — как в больших стратегиях.
function draw(n: Num, text: string, big: boolean) {
  const g = n.ctx;
  g.clearRect(0, 0, 160, 72);
  g.font = `900 ${big ? 50 : 42}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 11;
  g.strokeStyle = '#2b1606';
  g.strokeText(text, 80, 38);
  const gr = g.createLinearGradient(0, 14, 0, 62);
  gr.addColorStop(0, big ? '#fff3b0' : '#ffffff');
  gr.addColorStop(1, big ? '#ff9d2e' : '#ffd36b');
  g.fillStyle = gr;
  g.fillText(text, 80, 38);
  n.tex.needsUpdate = true;
}

export function HitFx({ view, fx }: { view: React.MutableRefObject<BattleView | null>; fx: boolean }) {
  const camera = useThree((s) => s.camera);
  const nums = useMemo(() => Array.from({ length: NUMS }, makeNum), []);
  const next = useRef(0);
  const last = useRef(new Map<number, number>());
  const acc = useRef(new Map<number, { dmg: number; at: number }>());
  const smokeAt = useRef(0);
  useEffect(() => {
    resetPulses();
    return () => {
      resetPulses();
      for (const n of nums) {
        n.tex.dispose();
        n.sprite.material.dispose();
      }
    };
  }, [nums]);

  useFrame(() => {
    const v = view.current;
    if (!v) return;
    const now = performance.now();
    const zoom = (camera as THREE.OrthographicCamera).zoom || 16;
    for (const b of v.s.buildings) {
      const was = last.current.get(b.i) ?? b.maxHp;
      last.current.set(b.i, b.hp);
      if (b.hp >= was - 1e-6) continue;
      const cx = W(b.x + b.size / 2);
      const cz = W(b.y + b.size / 2);
      wear(b.i, b.alive ? 1 - b.hp / b.maxHp : 0);
      if (!b.alive) continue;
      pulse(b.i, 'hit');
      if (fx && !b.wall) emitFx('hit', cx, cz, b.size, '#ffcf6b', 0.5 + b.size * 0.45);
      const a = acc.current.get(b.i) ?? { dmg: 0, at: 0 };
      a.dmg += was - b.hp;
      acc.current.set(b.i, a);
    }
    // Урон одной постройке за короткий миг — одной цифрой, чтобы цифры не слипались.
    for (const [i, a] of acc.current) {
      if (a.dmg <= 0 || now - a.at < 260) continue;
      const b = v.s.buildings.find((x) => x.i === i);
      if (!b || b.wall) {
        a.dmg = 0;
        continue;
      }
      const n = nums[next.current++ % NUMS];
      n.big = a.dmg >= b.maxHp * 0.12;
      draw(n, String(Math.max(1, Math.round(a.dmg))), n.big);
      n.born = now;
      n.x = W(b.x + b.size / 2) + (Math.random() - 0.5) * 0.6;
      n.z = W(b.y + b.size / 2) + (Math.random() - 0.5) * 0.6;
      n.y = 1.2 + b.size * 0.55;
      a.dmg = 0;
      a.at = now;
    }
    // Цифра выскакивает, поднимается и тает; размер на экране один и тот же при любом зуме.
    const k = 52 / zoom;
    for (const n of nums) {
      const t = (now - n.born) / NUM_MS;
      if (t >= 1 || t < 0) {
        n.sprite.visible = false;
        continue;
      }
      n.sprite.visible = true;
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.65 : 1.25 - Math.min(0.25, (t - 0.15) * 1.2);
      const s = (n.big ? 1.25 : 1) * pop * k;
      n.sprite.scale.set(2.2 * s, 1 * s, 1);
      n.sprite.position.set(n.x, n.y + 1.1 * t * k, n.z);
      n.sprite.material.opacity = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
    }
    // Побитые постройки дымятся.
    if (fx && now - smokeAt.current > 420) {
      smokeAt.current = now;
      for (const b of v.s.buildings) if (b.alive && !b.wall && b.hp < b.maxHp * 0.5) emitFx('smoke', W(b.x + b.size / 2), W(b.y + b.size / 2), b.size, b.hp < b.maxHp * 0.25 ? '#3d3733' : '#6a625a', 0.8 + b.size * 0.5);
    }
  });
  return (
    <>
      {nums.map((n, k) => (
        <primitive key={k} object={n.sprite} />
      ))}
    </>
  );
}
