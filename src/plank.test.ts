import { describe, expect, it } from 'vitest';
import { amountText, goalText, Landmark, PLANK_HINTS, plankFault, PlankTimer, repsEquivalent } from './repCounter';

type Point = [number, number];

// Поза сбоку: точки задаются для левой стороны и копируются на правую.
function pose(points: Record<number, Point>): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  for (const [i, [x, y]] of Object.entries(points)) {
    lm[Number(i)] = { x, y, visibility: 0.9 };
    lm[Number(i) + 1] = { x, y, visibility: 0.9 };
  }
  return lm;
}

// Планка на предплечьях: плечо над локтем, тело — прямая от плеч до стоп.
const plank = (hipY = 0.575) => pose({ 11: [0.3, 0.55], 13: [0.3, 0.7], 15: [0.42, 0.7], 23: [0.55, hipY], 25: [0.7, 0.585], 27: [0.85, 0.6] });
const sag = () => plank(0.66);
const pike = () => plank(0.45);
const standing = () => pose({ 11: [0.5, 0.2], 13: [0.5, 0.35], 15: [0.5, 0.48], 23: [0.5, 0.5], 25: [0.5, 0.7], 27: [0.5, 0.9] });
// Лёжа на животе, руки вытянуты вперёд: тело прямое, но опоры под плечами нет.
const lyingArmsForward = () => pose({ 11: [0.3, 0.7], 13: [0.15, 0.71], 15: [0.05, 0.71], 23: [0.55, 0.71], 25: [0.7, 0.715], 27: [0.85, 0.72] });

// Кадры каждые 50 мс: make по времени кадра.
function run(timer: PlankTimer, make: (t: number) => Landmark[], ms: number, from = 0): number {
  let t = from;
  for (; t < from + ms; t += 50) timer.update(make(t), t);
  return t;
}

describe('plankFault', () => {
  it('принимает ровную планку', () => {
    expect(plankFault(plank(), 0)).toBeNull();
  });

  it('различает провисший таз и «домик»', () => {
    expect(plankFault(sag(), 0)).toBe(PLANK_HINTS.sag);
    expect(plankFault(pike(), 0)).toBe(PLANK_HINTS.pike);
  });

  it('стоя — не планка, лёжа без упора — тоже', () => {
    expect(plankFault(standing(), 0)).toBe(PLANK_HINTS.pose);
    expect(plankFault(lyingArmsForward(), 0)).toBe(PLANK_HINTS.arms);
  });

  it('без ног в кадре просит отойти', () => {
    const lm = plank();
    for (const i of [25, 26, 27, 28]) lm[i].visibility = 0.1;
    expect(plankFault(lm, 0)).toBe(PLANK_HINTS.frame);
  });
});

describe('PlankTimer', () => {
  it('копит секунды, пока поза верная', () => {
    const timer = new PlankTimer();
    run(timer, () => plank(), 10_050);
    expect(timer.current.reps).toBe(10);
    expect(timer.current.holding).toBe(true);
    expect(timer.current.hint).toBeNull();
  });

  it('не стартует из неверной позы и подсказывает', () => {
    const timer = new PlankTimer();
    run(timer, () => standing(), 3000);
    expect(timer.current.reps).toBe(0);
    expect(timer.current.hint).toBe(PLANK_HINTS.pose);
  });

  it('ставит на паузу, когда таз провис, и продолжает после', () => {
    const timer = new PlankTimer();
    let t = run(timer, () => plank(), 5000);
    t = run(timer, () => sag(), 4000, t);
    expect(timer.current.holding).toBe(false);
    expect(timer.current.hint).toBe('Подними таз');
    // Пауза: за 4 секунды провиса добавились только кадры до конца допуска.
    expect(timer.current.reps).toBe(5);
    run(timer, () => plank(), 3000, t);
    expect(timer.current.reps).toBe(8);
  });

  it('не замечает одиночные сбои модели', () => {
    const timer = new PlankTimer();
    // Каждый десятый кадр модель «теряет» позу.
    run(timer, (t) => (Math.round(t / 50) % 10 === 0 ? sag() : plank()), 6000);
    expect(timer.current.reps).toBe(5);
    expect(timer.current.holding).toBe(true);
  });

  it('пропавший кадр не добавляет лишнего времени', () => {
    const timer = new PlankTimer();
    timer.update(plank(), 0);
    timer.update(plank(), 5000);
    expect(timer.current.heldMs).toBeLessThanOrEqual(250);
  });

  it('находит планку, когда телефон лежит боком', () => {
    // Тот же кадр, повёрнутый на 90°: без поворота тело выглядит вертикальным.
    const rotated = () => plank().map((p) => ({ ...p, x: 0.5 + (p.y - 0.5), y: 0.5 - (p.x - 0.5) }));
    const timer = new PlankTimer();
    for (let t = 0; t < 3000; t += 50) timer.update(rotated(), t, 1, [0, 90, 270]);
    expect(timer.current.reps).toBeGreaterThanOrEqual(2);
  });

  it('reset обнуляет время', () => {
    const timer = new PlankTimer();
    run(timer, () => plank(), 2000);
    timer.reset();
    expect(timer.current.reps).toBe(0);
  });
});

describe('единицы планки', () => {
  it('секунды переводятся в повторы и подписи', () => {
    expect(repsEquivalent('plank', 60)).toBe(30);
    expect(repsEquivalent('pushup', 12)).toBe(12);
    expect(amountText('plank', 45)).toBe('45 с');
    expect(amountText('plank', 150)).toBe('2:30');
    expect(goalText('plank', 60)).toBe('планка 1:00');
    expect(goalText('squat', 30)).toBe('приседания × 30');
  });
});
