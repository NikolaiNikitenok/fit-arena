import { describe, expect, it } from 'vitest';
import { angle, Landmark, RepCounter } from './repCounter';

// Поза, в которой угол в суставе (a, b, c) равен theta, а остальные точки стоят ровно.
function pose(joint: [number, number, number], theta: number, extra: Record<number, Landmark> = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  Object.assign(lm, extra);
  const [a, b, c] = joint;
  const rad = (theta * Math.PI) / 180;
  for (const off of [0, 1]) {
    lm[b + off] = { x: 0.5, y: 0.5, visibility: 0.9 };
    lm[a + off] = { x: 0.5, y: 0.4, visibility: 0.9 };
    lm[c + off] = { x: 0.5 + 0.1 * Math.sin(rad), y: 0.5 - 0.1 * Math.cos(rad), visibility: 0.9 };
  }
  return lm;
}

// Плечо стоит в (0.5, 0.4), таз и лодыжки продолжают ту же линию.
const straightBody = {
  23: { x: 0.5, y: 0.6, visibility: 0.9 },
  24: { x: 0.5, y: 0.6, visibility: 0.9 },
  27: { x: 0.5, y: 0.8, visibility: 0.9 },
  28: { x: 0.5, y: 0.8, visibility: 0.9 },
};

// Прогоняет последовательность углов с шагом 50 мс, каждый угол держится несколько кадров.
function run(counter: RepCounter, make: (theta: number) => Landmark[], angles: number[], stepMs = 50): number {
  let t = 0;
  for (const theta of angles) {
    for (let i = 0; i < 4; i++) {
      counter.update(make(theta), t);
      t += stepMs;
    }
  }
  return counter.current.reps;
}

describe('angle', () => {
  it('считает прямой угол', () => {
    expect(angle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
  });
});

describe('RepCounter', () => {
  it('считает полные приседания', () => {
    const c = new RepCounter('squat');
    expect(run(c, (t) => pose([23, 25, 27], t), [170, 80, 170, 80, 170, 80, 170])).toBe(3);
  });

  it('не считает неполную амплитуду', () => {
    const c = new RepCounter('squat');
    expect(run(c, (t) => pose([23, 25, 27], t), [170, 120, 170, 120, 170])).toBe(0);
  });

  it('считает отжимания с прямым корпусом', () => {
    const c = new RepCounter('pushup');
    const make = (t: number) => pose([11, 13, 15], t, straightBody);
    expect(run(c, make, [170, 70, 170, 70, 170])).toBe(2);
  });

  it('считает пресс', () => {
    const c = new RepCounter('situp');
    expect(run(c, (t) => pose([11, 23, 25], t), [150, 50, 150, 50, 150])).toBe(2);
  });

  it('игнорирует слишком быстрые повторы', () => {
    const c = new RepCounter('squat');
    expect(run(c, (t) => pose([23, 25, 27], t), [170, 80, 170, 80, 170], 10)).toBe(1);
  });

  it('просит встать в кадр, если точек нет', () => {
    const c = new RepCounter('squat');
    expect(c.update(undefined, 0).hint).toBe('Встань в кадр целиком');
  });
});
