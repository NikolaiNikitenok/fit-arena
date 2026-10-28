import { describe, expect, it } from 'vitest';
import { funFacts, monthRecap, recapMonth, recapMonths } from './recap';

// Октябрь 2026: 1-е — четверг.
const log = (r: Record<string, number>, b: Record<string, number> = r) => ({ r, b });

describe('итоги месяца', () => {
  it('повторы, дни, серия, лучший день, упражнения и рост', () => {
    const p = {
      days: { '2026-09-10': 100, '2026-10-01': 50, '2026-10-02': 60, '2026-10-03': 70, '2026-10-16': 300, '2026-10-31': 20, '2026-11-01': 999 },
      log: {
        '2026-10-01': log({ squat: 50 }),
        '2026-10-02': log({ squat: 40, pushup: 20 }, { squat: 40, pushup: 20 }),
        '2026-10-03': log({ squat: 70 }),
        '2026-10-16': log({ squat: 200, pushup: 100 }, { squat: 120, pushup: 60 }),
        '2026-10-31': log({ plank: 40 }),
      },
    };
    const r = monthRecap(p, '2026-10');
    expect(r).toMatchObject({ total: 500, days: 5, daysInMonth: 31, streak: 3, prevTotal: 100, growth: 400, firstWeekday: 3 });
    expect(r.bestDay).toEqual({ date: '2026-10-16', reps: 300, weekday: 'пятница' });
    expect(r.favWeekday).toBe('по пятницам');
    expect(r.byEx.map((e) => [e.ex, e.amount])).toEqual([
      ['squat', 360],
      ['pushup', 120],
      ['plank', 40],
    ]);
    expect(r.best).toEqual({ squat: 120, pushup: 60, plank: 40 });
    // Приседаний больше половины.
    expect(r.type).toBe('squat');
    expect(r.grid).toHaveLength(31);
  });

  it('тип героя: новичок, неудержимый, воин выходных', () => {
    expect(monthRecap({ days: { '2026-10-05': 30 } }, '2026-10').type).toBe('starter');
    const every = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, 40]));
    expect(monthRecap({ days: every }, '2026-10').type).toBe('unstoppable');
    // Выходные октября: 3–4, 10–11, 17–18; плюс немного в будни.
    const weekend = { '2026-10-03': 100, '2026-10-04': 100, '2026-10-10': 100, '2026-10-11': 100, '2026-10-17': 100, '2026-10-07': 20, '2026-10-14': 20 };
    expect(monthRecap({ days: weekend }, '2026-10').type).toBe('weekend');
  });

  it('сравнения: высота приседаниями и тонны отжиманиями', () => {
    expect(funFacts({ squat: 1000 })[0]).toBe('Приседаниями ты поднялся на 450 м — выше, чем на Эйфелеву башню');
    expect(funFacts({ squat: 30000 })[0]).toMatch(/1,5 раза на Эверест/);
    expect(funFacts({ pushup: 500 })[0]).toBe('Отжиманиями ты выжал 23 т — больше, чем весит трамвай');
    expect(funFacts({ pushup: 300 })[0]).toBe('Отжиманиями ты выжал 14 т — как 2 слона');
    expect(funFacts({ squat: 10, pushup: 5 })).toEqual([]);
  });

  it('полоса на главной — первую неделю месяца, если в прошлом были тренировки', () => {
    const p = { days: { '2026-10-12': 40 } };
    expect(recapMonth(p, new Date(2026, 10, 3, 12).getTime())).toBe('2026-10');
    expect(recapMonth(p, new Date(2026, 10, 8, 12).getTime())).toBeNull();
    expect(recapMonth({ days: {} }, new Date(2026, 10, 3, 12).getTime())).toBeNull();
    // Январь: итоги декабря прошлого года.
    expect(recapMonth({ days: { '2026-12-31': 5 } }, new Date(2027, 0, 2, 12).getTime())).toBe('2026-12');
    expect(recapMonths({ days: { '2026-09-01': 1, '2026-10-12': 40, '2026-11-02': 3 } }, new Date(2026, 10, 3, 12).getTime())).toEqual(['2026-10', '2026-09']);
  });
});
