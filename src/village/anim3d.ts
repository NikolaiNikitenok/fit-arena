import * as THREE from 'three';
import type { Anim, AnimKind } from './looks';

// Движущиеся детали построек: дым, флаги, пила, вывеска, искры, вагонетка. Одна и та же поза
// считается и для инстансов деревни (один вызов отрисовки на вид детали), и для мини-моделей.
// Движение — от времени, не от числа кадров: при 30 и при 120 кадрах всё движется одинаково.

interface Def {
  // Сколько частей у одной детали: пять клубов дыма, два куска полотнища.
  n: number;
  geo: () => THREE.BufferGeometry;
  mat: () => THREE.Material;
  // В экономном режиме не рисуем: дым и искры — самое дорогое и самое необязательное.
  rich?: boolean;
  // Цвет части i (по умолчанию — цвет детали).
  color?: (a: Anim, i: number) => string;
}

const std = (o: THREE.MeshStandardMaterialParameters = {}) => () => new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05, ...o });

export const ANIMS: Record<AnimKind, Def> = {
  smoke: {
    n: 5,
    rich: true,
    geo: () => new THREE.IcosahedronGeometry(0.5, 0),
    mat: std({ color: '#ffffff', flatShading: true, transparent: true, opacity: 0.72, depthWrite: false, roughness: 1 }),
    color: (_, i) => (i % 2 ? '#d9d6d0' : '#c8c4bd'),
  },
  flag: {
    n: 2,
    // Кусок полотнища, повёрнутый вокруг своего левого края.
    geo: () => new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0),
    mat: std({ roughness: 0.9 }),
  },
  saw: {
    n: 1,
    geo: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14).rotateX(Math.PI / 2),
    mat: std({ color: '#ffffff', metalness: 0.55, roughness: 0.35 }),
    color: () => '#c9ced6',
  },
  sign: {
    n: 1,
    // Вывеска висит на верхнем крае.
    geo: () => new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0),
    mat: std(),
  },
  spark: {
    n: 6,
    rich: true,
    geo: () => new THREE.BoxGeometry(1, 1, 1),
    mat: () => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    color: (_, i) => (i % 2 ? '#ffd27a' : '#ff9a3d'),
  },
  cart: {
    n: 2,
    geo: () => new THREE.BoxGeometry(1, 1, 1),
    mat: std(),
    color: (a, i) => (i ? '#f4c24f' : a.c),
  },
};

const shared = new Map<AnimKind, { geo: THREE.BufferGeometry; mat: THREE.Material }>();
export function animRes(k: AnimKind) {
  let r = shared.get(k);
  if (!r) shared.set(k, (r = { geo: ANIMS[k].geo(), mat: ANIMS[k].mat() }));
  return r;
}

const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const rot = new THREE.Quaternion();
const eul = new THREE.Euler();

/** Поза части i детали a в момент t (секунды); x, z — сдвиг постройки. */
export function animMatrix(a: Anim, i: number, t: number, m: THREE.Matrix4, ox = 0, oz = 0): THREE.Matrix4 {
  const s = a.s;
  const cos = Math.cos(a.ry);
  const sin = Math.sin(a.ry);
  // Сдвиг вдоль своей оси x детали, повёрнутой на ry.
  const along = (d: number) => pos.set(ox + a.x + d * cos, a.y, oz + a.z - d * sin);
  switch (a.k) {
    case 'smoke': {
      // Клубы поднимаются, растут и тают; ветер сносит их в сторону.
      const life = 3.2;
      const u = (((t + a.ph) / life + i / 5) % 1 + 1) % 1;
      const k = (0.13 + 0.26 * u) * Math.min(1, u * 7) * (u > 0.8 ? (1 - u) / 0.2 : 1) * s;
      pos.set(ox + a.x - 0.32 * u * s, a.y + 1.15 * u * s, oz + a.z - 0.12 * u * s);
      rot.setFromEuler(eul.set(u * 2, u * 3 + i, 0));
      return m.compose(pos, rot, scl.set(k, k, k));
    }
    case 'flag': {
      // Два куска: второй качается сильнее и с запозданием — полотнище будто изгибается волной.
      const w = 0.2 * s;
      const b0 = 0.28 * Math.sin(t * 2.3 + a.ph);
      const b1 = b0 + 0.42 * Math.sin(t * 2.3 + a.ph - 1.3);
      if (i === 0) {
        pos.set(ox + a.x, a.y, oz + a.z);
        rot.setFromEuler(eul.set(0, a.ry + b0, 0));
      } else {
        const ang = a.ry + b0;
        pos.set(ox + a.x + w * Math.cos(ang), a.y, oz + a.z - w * Math.sin(ang));
        rot.setFromEuler(eul.set(0, a.ry + b1, 0));
      }
      return m.compose(pos, rot, scl.set(w * 1.02, 0.26 * s, 0.03));
    }
    case 'saw':
      along(0);
      rot.setFromEuler(eul.set(0, a.ry, -t * 7));
      return m.compose(pos, rot, scl.set(0.38 * s, 0.38 * s, 0.025));
    case 'sign':
      along(0);
      rot.setFromEuler(eul.set(0.2 * Math.sin(t * 1.7 + a.ph), a.ry, 0, 'YXZ'));
      return m.compose(pos, rot, scl.set(0.34 * s, 0.22 * s, 0.04));
    case 'spark': {
      // Снопы искр над наковальней: каждая летит своей дугой и гаснет.
      const f = t * 1.6 + a.ph + i / 6;
      const u = f % 1;
      const ang = i * 2.39 + Math.floor(f) * 1.31;
      const r = 0.3 * u * s;
      pos.set(ox + a.x + r * Math.cos(ang), a.y + (0.55 * u - 0.7 * u * u) * s, oz + a.z + r * Math.sin(ang));
      const k = 0.045 * (1 - u) * s;
      return m.compose(pos, rot.identity(), scl.set(k, k, k));
    }
    case 'cart': {
      // Вагонетка катается по рельсам туда и обратно, с остановками у концов.
      const v = Math.sin(t * 0.8 + a.ph);
      const d = 0.3 * s * Math.sign(v) * Math.min(1, Math.abs(v) * 1.4);
      along(d);
      rot.setFromEuler(eul.set(0, a.ry, 0));
      if (i === 0) {
        pos.y += 0.1 * s;
        return m.compose(pos, rot, scl.set(0.3 * s, 0.15 * s, 0.2 * s));
      }
      pos.y += 0.2 * s;
      return m.compose(pos, rot, scl.set(0.16 * s, 0.07 * s, 0.12 * s));
    }
  }
}

/** Цвет части i. */
export const animColor = (a: Anim, i: number) => ANIMS[a.k].color?.(a, i) ?? a.c;
