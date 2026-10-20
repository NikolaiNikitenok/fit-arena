import { describe, expect, it } from 'vitest';
import { angle, Landmark, RepCounter } from './repCounter';
import { Calibrator, deriveThresholds } from './calibration';

type Point = [number, number];

// Скелет: фиксированные точки + сустав (a, b, c), где угол в b равен theta.
// Точка a лежит от b в направлении dirA, c получается поворотом dirA на theta.
function skeleton(fixed: Record<number, Point>, joint: [number, number, number], b: Point, dirA: Point, theta: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  const set = (i: number, [x, y]: Point) => {
    lm[i] = { x, y, visibility: 0.9 };
    lm[i + 1] = { x, y, visibility: 0.9 };
  };
  for (const [i, p] of Object.entries(fixed)) set(Number(i), p);
  const r = (theta * Math.PI) / 180;
  const L = 0.1;
  const [dx, dy] = dirA;
  set(joint[1], b);
  set(joint[0], [b[0] + L * dx, b[1] + L * dy]);
  set(joint[2], [b[0] + L * (dx * Math.cos(r) - dy * Math.sin(r)), b[1] + L * (dx * Math.sin(r) + dy * Math.cos(r))]);
  return lm;
}

// Упор лёжа боком к камере: плечо, таз и стопы на одной линии, руки под плечами.
const pushup = (t: number) => skeleton({ 23: [0.55, 0.6], 25: [0.7, 0.605], 27: [0.85, 0.61] }, [11, 13, 15], [0.3, 0.7], [0, -1], -t);
// Стоя, сгибаем руки: тело вертикально.
const standingCurl = (t: number) => skeleton({ 23: [0.5, 0.55], 27: [0.5, 0.9] }, [11, 13, 15], [0.5, 0.4], [0, -1], -t);
// Приседание: плечи над тазом, угол в колене меняется.
const squat = (t: number) => skeleton({ 11: [0.5, 0.15] }, [23, 25, 27], [0.5, 0.5], [0, -1], -t);
// Приседание лёжа на спине: таз ниже плеч не будет.
const lyingSquat = (t: number) => skeleton({ 11: [0.2, 0.8] }, [23, 25, 27], [0.5, 0.8], [-1, 0], t);
// Пресс: лёжа, таз и стопы на полу, угол в тазу меняется.
const situp = (t: number) => skeleton({ 27: [0.75, 0.82] }, [11, 23, 25], [0.5, 0.8], [-1, 0], t);
// «Пресс» стоя: наклоны корпуса.
const standingBend = (t: number) => skeleton({ 27: [0.5, 0.95] }, [11, 23, 25], [0.5, 0.5], [0, -1], t - 180);

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

const FULL = [170, 60, 170, 60, 170];

describe('angle', () => {
  it('считает прямой угол', () => {
    expect(angle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
  });
});

describe('RepCounter', () => {
  it('генератор поз выставляет нужный угол', () => {
    const lm = pushup(70);
    expect(angle(lm[11], lm[13], lm[15])).toBeCloseTo(70);
  });

  it('считает отжимания в упоре лёжа', () => {
    expect(run(new RepCounter('pushup'), pushup, FULL)).toBe(2);
  });

  it('не считает сгибание рук стоя за отжимания', () => {
    const c = new RepCounter('pushup');
    expect(run(c, standingCurl, FULL)).toBe(0);
    expect(c.current.hint).toBe('Прими упор лёжа');
  });

  it('считает отжимания, если стопы за кадром, но видны колени', () => {
    const noFeet = (t: number) => {
      const lm = pushup(t);
      lm[27].visibility = lm[28].visibility = 0.1;
      return lm;
    };
    expect(run(new RepCounter('pushup'), noFeet, FULL)).toBe(2);
  });

  it('считает отжимания, если ноги за кадром, но виден таз', () => {
    const noLegs = (t: number) => {
      const lm = pushup(t);
      for (const i of [25, 26, 27, 28]) lm[i].visibility = 0.1;
      return lm;
    };
    expect(run(new RepCounter('pushup'), noLegs, FULL)).toBe(2);
  });

  it('не считает отжимания, если не видно и таза', () => {
    const hidden = (t: number) => {
      const lm = pushup(t);
      for (const i of [23, 24, 25, 26, 27, 28]) lm[i].visibility = 0.1;
      return lm;
    };
    expect(run(new RepCounter('pushup'), hidden, FULL)).toBe(0);
  });

  it('не считает неполные отжимания', () => {
    expect(run(new RepCounter('pushup'), pushup, [170, 125, 170, 125, 170])).toBe(0);
  });

  // Телефон положен боком, интерфейс вертикальный: в кадре человек повёрнут на 90°.
  const turn = (lm: Landmark[]) => lm.map((p) => ({ ...p, x: 0.5 + (p.y - 0.5), y: 0.5 - (p.x - 0.5) }));
  const runRotated = (make: (t: number) => Landmark[], rotations: number[]) => {
    const c = new RepCounter('pushup');
    let time = 0;
    for (const theta of FULL) for (let i = 0; i < 4; i++) c.update(turn(make(theta)), (time += 50), 1, rotations);
    return c.current.reps;
  };

  it('считает отжимания, когда телефон лежит боком', () => {
    expect(runRotated(pushup, [0])).toBe(0);
    expect(runRotated(pushup, [90, 270])).toBe(2);
  });

  it('и боком не считает сгибание рук стоя', () => {
    expect(runRotated(standingCurl, [90, 270])).toBe(0);
  });

  it('учитывает вертикальный кадр телефона', () => {
    // В кадре 480×640 координата x сжата: возвращаем пропорции, и угол снова верный.
    const portrait = (t: number) => pushup(t).map((p) => ({ ...p, x: p.x / 0.75 }));
    const c = new RepCounter('pushup');
    let time = 0;
    for (const theta of FULL) for (let i = 0; i < 4; i++) c.update(portrait(theta), (time += 50), 0.75);
    expect(c.current.reps).toBe(2);
  });

  it('считает полные приседания', () => {
    expect(run(new RepCounter('squat'), squat, [170, 80, 170, 80, 170, 80, 170])).toBe(3);
  });

  it('не считает неполную амплитуду', () => {
    expect(run(new RepCounter('squat'), squat, [170, 120, 170, 120, 170])).toBe(0);
  });

  it('не считает сгибание ног лёжа за приседания', () => {
    expect(run(new RepCounter('squat'), lyingSquat, FULL)).toBe(0);
  });

  it('считает пресс лёжа', () => {
    expect(run(new RepCounter('situp'), situp, [150, 50, 150, 50, 150])).toBe(2);
  });

  it('не считает наклоны стоя за пресс', () => {
    expect(run(new RepCounter('situp'), standingBend, [150, 50, 150, 50, 150])).toBe(0);
  });

  it('игнорирует слишком быстрые повторы', () => {
    expect(run(new RepCounter('squat'), squat, [170, 80, 170, 80, 170], 10)).toBe(1);
  });

  it('просит встать в кадр, если точек нет', () => {
    expect(new RepCounter('squat').update(undefined, 0).hint).toBe('Встань в кадр целиком');
  });
});

describe('пресс без строгой амплитуды', () => {
  it('засчитывает подъём корпуса до 80°', () => {
    expect(run(new RepCounter('situp'), situp, [150, 78, 150, 78, 150])).toBe(2);
  });
  it('прощает кадр, где модель потеряла стопу', () => {
    const c = new RepCounter('situp');
    let t = 0;
    for (const theta of [150, 60, 60, 150, 60, 150]) {
      for (let i = 0; i < 4; i++) {
        const lm = situp(theta);
        if (theta === 60 && i === 1) for (const k of [27, 28]) lm[k] = { ...lm[k], visibility: 0.1 };
        c.update(lm, (t += 50));
      }
    }
    expect(c.current.reps).toBe(2);
  });
});

describe('личные пороги после калибровки', () => {
  // Пресс с малой амплитудой: лёжа 125°, сидя только 95° — общий порог 85° не достаётся.
  const sweep = (top: number, bottom: number, reps: number) => {
    const one: number[] = [];
    for (let a = top; a > bottom; a -= 5) one.push(a);
    for (let a = bottom; a < top; a += 5) one.push(a);
    return [...Array.from({ length: reps }, () => one).flat(), top];
  };

  it('с общими порогами такой пресс не считается', () => {
    expect(run(new RepCounter('situp'), situp, sweep(125, 95, 5))).toBe(0);
  });

  it('калибровка на тех же повторах — и все они считаются', () => {
    const probe = new RepCounter('situp');
    const calib = new Calibrator('situp');
    let t = 0;
    for (const theta of sweep(125, 95, 3).concat([125, 125, 125, 125])) {
      for (let i = 0; i < 4; i++) {
        const s = probe.update(situp(theta), (t += 50));
        calib.update(s.angle, s.hint == null, t);
      }
    }
    const personal = calib.view.result;
    expect(personal).not.toBeNull();
    expect(run(new RepCounter('situp', personal!), situp, sweep(125, 95, 5))).toBe(5);
  });

  it('и всё равно не считает мелкое дрожание', () => {
    const jitter = Array.from({ length: 40 }, (_, i) => (i % 2 ? 114 : 104));
    expect(run(new RepCounter('situp', deriveThresholds('situp', 95, 125)), situp, jitter)).toBe(0);
    // Даже откалибровавшись на крошечной амплитуде, зазор между порогами не меньше 15°.
    expect(run(new RepCounter('situp', deriveThresholds('situp', 105, 112)), situp, jitter)).toBe(0);
  });
});
