import { describe, expect, it } from 'vitest';
import { exerciseReadiness, type Landmark } from './repCounter';

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
    lm[13].visibility = .1;
    lm[16].visibility = .1;
    const observed = exerciseReadiness('pushup', lm);
    expect(observed.hint).not.toBeNull();
    expect(observed.angle).toBeNull();
  });

  it('учитывает aspect вертикального кадра и поворот телефона', () => {
    const lm = pushup().map((p) => ({ ...p, x: (.5 + p.y - .5) / .75, y: .5 - (p.x - .5) }));
    ready(lm, .75, [90, 270]);
  });
});
