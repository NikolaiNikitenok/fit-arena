import { describe, expect, it } from 'vitest';
import { exerciseReadiness, RepCounter, type Landmark } from './repCounter';

function pushup(): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: .9 }));
  for (const [i, x, y] of [[11, .3, .55], [13, .3, .7], [15, .31, .85], [23, .55, .575], [25, .7, .585], [27, .85, .6]]) {
    lm[i] = { x, y, visibility: .9 };
    lm[i + 1] = { x, y, visibility: .9 };
  }
  return lm;
}

const ready = (lm: Landmark[], aspect = 1, rotations = [0]) => {
  const observed = exerciseReadiness('pushup', lm, aspect, rotations);
  expect(observed.hint).toBeNull();
  expect(observed.angle).not.toBeNull();
  expect(observed.angle!).toBeGreaterThan(145);
};

describe('exerciseReadiness: coherent, visible exercise-specific side', () => {
  it('выбирает правую сторону с видимым тазом, даже если левые руки видны лучше', () => {
    const lm = pushup();
    for (const i of [11, 13, 15]) lm[i].visibility = .95;
    lm[23].visibility = .1;
    for (const i of [12, 14, 16]) lm[i].visibility = .8;
    ready(lm);
  });

  it('предпочитает целиком видимые правые суставы большей сумме левых с невидимой кистью', () => {
    const lm = pushup();
    lm[11].visibility = lm[13].visibility = .99;
    lm[15].visibility = .1;
    for (const i of [12, 14, 16]) lm[i].visibility = .6;
    ready(lm);
  });

  it('отклоняет стойку со сгибанием рук', () => {
    const lm = pushup();
    for (const [i, x, y] of [[11, .5, .2], [13, .5, .35], [15, .51, .5], [23, .5, .55], [25, .5, .7], [27, .5, .9]]) {
      lm[i] = { x, y, visibility: .9 }; lm[i + 1] = { x, y, visibility: .9 };
    }
    expect(exerciseReadiness('pushup', lm).hint).not.toBeNull();
  });

  it('без человека не сообщает готовность', () => {
    for (const lm of [undefined, []]) {
      const observed = exerciseReadiness('pushup', lm);
      expect(observed.angle).toBeNull();
      expect(observed.hint).not.toBeNull();
    }
  });

  it('не требует стоп и коленей для отжиманий, если виден таз', () => {
    const lm = pushup();
    for (const i of [25, 26, 27, 28]) lm[i].visibility = .1;
    ready(lm);
  });

  it('не комбинирует невидимые обязательные суставы разных сторон', () => {
    const lm = pushup();
    lm[15].visibility = .1; // left wrist absent
    lm[12].visibility = .1; // right shoulder absent
    const observed = exerciseReadiness('pushup', lm);
    expect(observed.hint).not.toBeNull();
    expect(observed.angle).toBeNull();
  });

  it('скрытые локти не блокируют подготовку, но без них повтор не подтверждается', () => {
    const counter = new RepCounter('pushup');
    let at = 0;
    const hold = (down: boolean, elbowsVisible: boolean) => {
      const lm = pushup();
      if (down) {
        for (const i of [13, 14]) { lm[i].x = .4; lm[i].y = .6; }
      }
      if (!elbowsVisible) for (const i of [13, 14]) lm[i].visibility = .1;
      for (let frame = 0; frame < 10; frame++) {
        ready(lm);
        counter.update(lm, at);
        at += 100;
      }
    };
    hold(false, false);
    hold(true, false);
    hold(false, false);
    expect(counter.current.reps).toBe(0);
    expect(counter.current.angle).toBeNull();
    expect(counter.current.hint).not.toBeNull();

    // Restoring the real elbow landmarks permits a new, fully observed repetition.
    hold(false, true);
    expect(counter.current.hint).toBeNull();
    expect(counter.current.reps).toBe(0);
    hold(true, true);
    hold(false, true);
    expect(counter.current.reps).toBe(1);
  });

  it('по-прежнему требует хотя бы одну видимую кисть', () => {
    const lm = pushup();
    for (const i of [15, 16]) lm[i].visibility = .1;
    const observed = exerciseReadiness('pushup', lm);
    expect(observed.hint).not.toBeNull();
    expect(observed.angle).toBeNull();
  });

  it('по-прежнему требует видимый таз с выбранной стороны', () => {
    const lm = pushup();
    for (const i of [23, 24]) lm[i].visibility = .1;
    expect(exerciseReadiness('pushup', lm).hint).not.toBeNull();
  });

  it('не ослабляет пределы видимости кистей и таза при подготовке', () => {
    const lm = pushup();
    for (const i of [11, 12, 15, 16]) lm[i].visibility = .35;
    for (const i of [23, 24]) lm[i].visibility = .5;
    for (const i of [13, 14]) lm[i].visibility = .1;
    ready(lm);
    for (const i of [15, 16]) lm[i].visibility = .349;
    expect(exerciseReadiness('pushup', lm).hint).not.toBeNull();
    for (const i of [15, 16]) lm[i].visibility = .35;
    for (const i of [23, 24]) lm[i].visibility = .499;
    expect(exerciseReadiness('pushup', lm).hint).not.toBeNull();
  });

  it('учитывает aspect вертикального кадра и поворот телефона', () => {
    const lm = pushup().map((p) => ({ ...p, x: (.5 + p.y - .5) / .75, y: .5 - (p.x - .5) }));
    ready(lm, .75, [90, 270]);
  });
});
