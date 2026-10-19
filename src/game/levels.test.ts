import { describe, expect, it } from 'vitest';
import { DEFAULT_BASELINE, LEVEL_COUNT, LEVELS, targetReps } from './levels';
import { LANDS } from './lands';

describe('levels', () => {
  it('по 100 уровней в трёх мирах и финал с Князем', () => {
    expect(LEVELS).toHaveLength(LEVEL_COUNT);
    expect(LEVEL_COUNT).toBe(301);
    for (const w of [0, 1, 2]) expect(LEVELS.filter((l) => l.world === w)).toHaveLength(100);
    const last = LEVELS[LEVEL_COUNT - 1];
    expect(last).toMatchObject({ type: 'boss', title: 'Князь Диван', world: 3 });
  });

  it('у каждой земли свой босс на десятом уровне', () => {
    const bosses = LEVELS.filter((l) => l.type === 'boss' && l.world < 3);
    expect(bosses.map((l) => l.id)).toEqual(Array.from({ length: 30 }, (_, i) => (i + 1) * 10));
    expect(new Set(bosses.map((l) => l.title)).size).toBe(30);
    expect(bosses.every((l, i) => l.title === LANDS[i].boss.name)).toBe(true);
  });

  it('каждый мир начинается с трёх испытаний силы', () => {
    for (const start of [0, 100, 200])
      expect(LEVELS.slice(start, start + 3).map((l) => [l.type, l.exercises[0]])).toEqual([
        ['trial', 'squat'],
        ['trial', 'pushup'],
        ['trial', 'situp'],
      ]);
  });

  it('нагрузка растёт и выходит на плато, передышки легче соседей', () => {
    const t = (id: number) => targetReps(LEVELS[id - 1], DEFAULT_BASELINE, 'squat');
    expect(t(90)).toBeGreaterThan(t(14) * 2);
    expect(LEVELS[299].load).toBeLessThan(2.6);
    expect(LEVELS[14].rest).toBe(true);
    expect(LEVELS[14].load).toBeLessThan(LEVELS[13].load);
  });

  it('упражнения чередуются', () => {
    const counts = { squat: 0, pushup: 0, situp: 0 };
    for (const l of LEVELS) counts[l.exercises[0]]++;
    expect(Math.min(...Object.values(counts))).toBeGreaterThan(80);
  });
});
