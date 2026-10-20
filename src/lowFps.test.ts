import { describe, expect, it } from 'vitest';
import { Landmark, PlankTimer, RepCounter, smoothKeep } from './repCounter';

// Слабый телефон: распознавание успевает 10–15 кадров в секунду. Счёт должен остаться тем же,
// что и при 30 кадрах: сглаживание и прощение сбоев позы идут по времени, а не по числу кадров.

type Point = [number, number];

function skeleton(fixed: Record<number, Point>, joint: [number, number, number], b: Point, dirA: Point, theta: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  const set = (i: number, [x, y]: Point) => {
    lm[i] = { x, y, visibility: 0.9 };
    lm[i + 1] = { x, y, visibility: 0.9 };
  };
  for (const [i, p] of Object.entries(fixed)) set(Number(i), p);
  const r = (theta * Math.PI) / 180;
  const [dx, dy] = dirA;
  set(joint[1], b);
  set(joint[0], [b[0] + 0.1 * dx, b[1] + 0.1 * dy]);
  set(joint[2], [b[0] + 0.1 * (dx * Math.cos(r) - dy * Math.sin(r)), b[1] + 0.1 * (dx * Math.sin(r) + dy * Math.cos(r))]);
  return lm;
}

const squat = (t: number) => skeleton({ 11: [0.5, 0.15] }, [23, 25, 27], [0.5, 0.5], [0, -1], -t);
const pushup = (t: number) => skeleton({ 23: [0.55, 0.6], 25: [0.7, 0.605], 27: [0.85, 0.61] }, [11, 13, 15], [0.3, 0.7], [0, -1], -t);
const standingCurl = (t: number) => skeleton({ 23: [0.5, 0.55], 27: [0.5, 0.9] }, [11, 13, 15], [0.5, 0.4], [0, -1], -t);

/** Плавные повторы: угол от top до bottom и обратно за periodMs, кадры с частотой fps. */
function smoothReps(counter: RepCounter, make: (theta: number) => Landmark[], fps: number, reps: number, periodMs: number, top = 170, bottom = 80) {
  const step = 1000 / fps;
  const total = reps * periodMs + 400;
  for (let t = 0; t <= total; t += step) {
    const phase = t < reps * periodMs ? (t % periodMs) / periodMs : 0;
    const theta = bottom + ((top - bottom) * (1 + Math.cos(2 * Math.PI * phase))) / 2;
    counter.update(make(theta), t);
  }
  return counter.current.reps;
}

describe('счёт при низком FPS', () => {
  for (const fps of [10, 15, 30]) {
    it(`приседания по 1.2 с при ${fps} к/с — все засчитаны`, () => {
      expect(smoothReps(new RepCounter('squat'), squat, fps, 6, 1200)).toBe(6);
    });

    it(`быстрые приседания по 0.8 с при ${fps} к/с — все засчитаны`, () => {
      expect(smoothReps(new RepCounter('squat'), squat, fps, 6, 800)).toBe(6);
    });

    it(`отжимания по 1.5 с при ${fps} к/с`, () => {
      expect(smoothReps(new RepCounter('pushup'), pushup, fps, 5, 1500, 170, 70)).toBe(5);
    });

    it(`неполная амплитуда не засчитывается и при ${fps} к/с`, () => {
      expect(smoothReps(new RepCounter('squat'), squat, fps, 5, 1200, 170, 115)).toBe(0);
    });
  }

  it('сглаживание по времени: при редких кадрах прошлое весит меньше, при частых — как раньше', () => {
    expect(smoothKeep(16)).toBe(0.5);
    expect(smoothKeep(33)).toBeCloseTo(0.5, 2);
    expect(smoothKeep(66)).toBeCloseTo(0.25, 2);
    expect(smoothKeep(100)).toBeLessThan(0.15);
    expect(smoothKeep(5000)).toBe(0);
  });
});

describe('сбои позы при низком FPS', () => {
  // Отжимание вниз и вверх по кадрам с шагом stepMs; bad — номера кадров, где модель «увидела» стойку.
  function pushupWithGlitch(stepMs: number, bad: number[]) {
    const c = new RepCounter('pushup');
    const angles = [170, 170, 150, 120, 90, 70, 70, 90, 120, 150, 170, 170];
    angles.forEach((theta, i) => c.update(bad.includes(i) ? standingCurl(theta) : pushup(theta), i * stepMs));
    return c.current;
  }

  it('при 10 к/с одиночный сбой в нижней точке прощается', () => {
    expect(pushupWithGlitch(100, [5]).reps).toBe(1);
  });

  it('при 10 к/с два сбоя подряд (0.1 с) — повтор не засчитан', () => {
    const s = pushupWithGlitch(100, [5, 6]);
    expect(s.reps).toBe(0);
  });

  it('при 30 к/с по-прежнему прощаются два кадра подряд', () => {
    // 30 к/с: каждый угол держится по три кадра, сбой — два кадра (66 мс).
    const c = new RepCounter('pushup');
    const angles = [170, 150, 120, 90, 70, 70, 90, 120, 150, 170].flatMap((a) => [a, a, a]);
    angles.forEach((theta, i) => c.update(i === 13 || i === 14 ? standingCurl(theta) : pushup(theta), i * 33));
    expect(c.current.reps).toBe(1);
  });
});

describe('планка при низком FPS', () => {
  const pose = (points: Record<number, Point>): Landmark[] => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    for (const [i, [x, y]] of Object.entries(points)) {
      lm[Number(i)] = { x, y, visibility: 0.9 };
      lm[Number(i) + 1] = { x, y, visibility: 0.9 };
    }
    return lm;
  };
  const plank = () => pose({ 11: [0.3, 0.55], 13: [0.3, 0.7], 15: [0.42, 0.7], 23: [0.55, 0.575], 25: [0.7, 0.585], 27: [0.85, 0.6] });
  const standing = () => pose({ 11: [0.5, 0.2], 13: [0.5, 0.35], 15: [0.5, 0.48], 23: [0.5, 0.5], 25: [0.5, 0.7], 27: [0.5, 0.9] });

  for (const fps of [10, 15]) {
    it(`10 секунд планки при ${fps} к/с — 10 секунд, одиночные сбои не мешают`, () => {
      const timer = new PlankTimer();
      // Каждый 7-й кадр модель теряет позу.
      for (let i = 0; i <= fps * 10; i++) timer.update(i % 7 === 3 ? standing() : plank(), Math.round((i * 1000) / fps));
      expect(timer.current.reps).toBe(10);
    });
  }

  it('при 10 к/с встал из планки на 0.3 с — отсчёт на паузе', () => {
    const timer = new PlankTimer();
    let t = 0;
    for (; t <= 3000; t += 100) timer.update(plank(), t);
    for (let i = 0; i < 3; i++, t += 100) timer.update(standing(), t);
    expect(timer.current.holding).toBe(false);
  });
});
