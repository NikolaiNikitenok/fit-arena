import { describe, expect, it } from 'vitest';
import { dailyTask } from './daily';
import { claimDaily, dailyProgress, loadProgress, recordActivity } from './progress';

describe('задание дня', () => {
  it('одно на день, цель от силы игрока, награда один раз', () => {
    const base = { squat: 20, pushup: 10, situp: 15 };
    const t = dailyTask('2026-10-20', base);
    expect(dailyTask('2026-10-20', base)).toEqual(t);
    expect(t.target).toBeGreaterThanOrEqual(Math.round(base[t.exercise] * 1.5) - 5);
    const now = new Date(2026, 9, 20, 12).getTime();
    let p = recordActivity(loadProgress(), t.exercise, t.target - 1, now);
    expect(dailyProgress(p, t)).toBe(t.target - 1);
    expect(claimDaily(p, t)).toBeNull();
    p = recordActivity(p, t.exercise, 1, now);
    const done = claimDaily(p, t)!;
    expect(done.coins).toBe(p.coins + t.coins);
    expect(claimDaily(done, t)).toBeNull();
  });
});
