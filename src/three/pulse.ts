import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Отклик постройки: пружинка при касании, вздрагивание и вспышка при ударе в бою. Постройки
// нарисованы инстансами, поэтому каждая деталь помнит, к какой постройке относится (g), а
// здесь — у каких построек сейчас идёт отклик. Каждый кадр пересчитываются только они.

export type PulseKind = 'tap' | 'hit' | 'collect';

interface Live {
  kind: PulseKind;
  t0: number;
}
const LIVE = new Map<number, Live>();
// Насколько постройка побита (0…1): темнеет, пока не рухнет.
const WEAR = new Map<number, number>();
const DUR: Record<PulseKind, number> = { tap: 650, hit: 260, collect: 500 };

/** Качнуть постройку g. */
export function pulse(g: number, kind: PulseKind) {
  const was = LIVE.get(g);
  // Удар не перебивает пружинку от касания, пока та в самом разгаре.
  if (was && was.kind === 'tap' && kind === 'hit' && performance.now() - was.t0 < 300) return;
  LIVE.set(g, { kind, t0: performance.now() });
}

/** Сколько у постройки снято здоровья: 0 — целая, 1 — вот-вот рухнет. */
export function wear(g: number, k: number) {
  if (k <= 0) WEAR.delete(g);
  else WEAR.set(g, Math.min(1, k));
}

/** Забыть всё (новая сцена: те же номера построек — уже другие постройки). */
export function resetPulses() {
  LIVE.clear();
  WEAR.clear();
}

export interface PulseShape {
  sy: number;
  sxz: number;
  glow: number;
}

/** Форма отклика в момент t (мс от начала): сжатие по высоте, расширение вширь, яркость. */
export function pulseShape(kind: PulseKind, t: number): PulseShape {
  const s = t / 1000;
  if (kind === 'hit') {
    const a = 0.06 * Math.exp(-s * 14) * Math.sin(s * 46 + 0.6);
    return { sy: 1 - a, sxz: 1 + a * 0.6, glow: 1 + 1.6 * Math.exp(-s * 22) };
  }
  // Касание и сбор: сначала приседает, потом подпрыгивает и успокаивается.
  const amp = kind === 'tap' ? 0.14 : 0.1;
  const a = amp * Math.exp(-s * 7.5) * Math.sin(s * 24);
  return { sy: 1 - a, sxz: 1 + a * 0.55, glow: 1 + (kind === 'collect' ? 0.35 : 0.18) * Math.exp(-s * 10) };
}

interface Slot {
  idx: number;
  base: THREE.Matrix4;
  color: THREE.Color;
}
export interface PulseGroup {
  cx: number;
  cz: number;
  slots: Slot[];
}
export interface PulseTarget {
  mesh: THREE.InstancedMesh;
  groups: Map<number, PulseGroup>;
}

/** Запомнить деталь i меша как часть постройки g с центром (cx, cz). */
export function track(t: PulseTarget, g: number | undefined, cx: number, cz: number, idx: number, base: THREE.Matrix4, color: THREE.Color) {
  if (g == null) return;
  let grp = t.groups.get(g);
  if (!grp) t.groups.set(g, (grp = { cx, cz, slots: [] }));
  grp.slots.push({ idx, base: base.clone(), color: color.clone() });
}

const toC = new THREE.Matrix4();
const sc = new THREE.Matrix4();
const back = new THREE.Matrix4();
const m = new THREE.Matrix4();
const c = new THREE.Color();

/** Каждый кадр: качает постройки с откликом, возвращает на место те, у которых он кончился. */
export function usePulses(targets: PulseTarget[]) {
  // Новые меши (постройка рухнула — сцена пересобрана): побитые постройки сразу снова темнеют.
  const touched = useMemo(() => new Map(targets.map((t) => [t, new Set([...t.groups.keys()].filter((g) => WEAR.has(g)))])), [targets]);
  useFrame(() => {
    if (!LIVE.size && ![...touched.values()].some((s) => s.size)) return;
    const now = performance.now();
    for (const [g, l] of LIVE) if (now - l.t0 > DUR[l.kind]) LIVE.delete(g);
    for (const t of targets) {
      let set = touched.get(t);
      if (!set) touched.set(t, (set = new Set()));
      let dirtyM = false;
      let dirtyC = false;
      for (const g of set) {
        if (LIVE.has(g)) continue;
        const grp = t.groups.get(g);
        set.delete(g);
        if (!grp) continue;
        const w = 1 - 0.38 * (WEAR.get(g) ?? 0);
        for (const sl of grp.slots) {
          t.mesh.setMatrixAt(sl.idx, sl.base);
          t.mesh.setColorAt(sl.idx, c.copy(sl.color).multiplyScalar(w));
        }
        dirtyM = dirtyC = true;
      }
      for (const [g, l] of LIVE) {
        const grp = t.groups.get(g);
        if (!grp) continue;
        set.add(g);
        const p = pulseShape(l.kind, now - l.t0);
        back.makeTranslation(-grp.cx, 0, -grp.cz);
        sc.makeScale(p.sxz, p.sy, p.sxz);
        toC.makeTranslation(grp.cx, 0, grp.cz);
        const w = (1 - 0.38 * (WEAR.get(g) ?? 0)) * p.glow;
        for (const sl of grp.slots) {
          m.copy(sl.base).premultiply(back).premultiply(sc).premultiply(toC);
          t.mesh.setMatrixAt(sl.idx, m);
          t.mesh.setColorAt(sl.idx, c.copy(sl.color).multiplyScalar(w));
        }
        dirtyM = dirtyC = true;
      }
      if (dirtyM) t.mesh.instanceMatrix.needsUpdate = true;
      if (dirtyC && t.mesh.instanceColor) t.mesh.instanceColor.needsUpdate = true;
    }
  });
}
