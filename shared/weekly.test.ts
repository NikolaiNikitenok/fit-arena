import { describe, expect, it } from 'vitest';
import { weekKey, weekSummary } from './weekly';

describe('рост силы за неделю', () => {
  it('сравнивает с той же неделей месяц назад', () => {
    const days = { '2026-11-08': 100, '2026-11-02': 20, '2026-10-05': 50, '2026-10-10': 30, '2026-11-09': 999 };
    expect(weekSummary(days, '2026-11-09')).toEqual({ week: 120, before: 80, vs: 'month', pct: 50 });
  });
  it('без месяца — с прошлой неделей, без истории — не с чем', () => {
    expect(weekSummary({ '2026-11-08': 60, '2026-10-31': 40 }, '2026-11-09')).toMatchObject({ vs: 'week', pct: 50 });
    expect(weekSummary({ '2026-11-08': 60 }, '2026-11-09')).toMatchObject({ vs: null, pct: null, week: 60 });
  });
  it('неделя начинается в понедельник', () => {
    expect(weekKey('2026-11-09')).toBe('2026-11-09');
    expect(weekKey('2026-11-15')).toBe('2026-11-09');
  });
});
