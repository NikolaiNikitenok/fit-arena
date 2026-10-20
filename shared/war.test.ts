import { describe, expect, it } from 'vitest';
import { ghostPoints, ghostTarget, pairClans, WAR_GHOST_BASE, WAR_MIN_POINTS, WAR_REPS_PER_DAY, warAdd, warResult, warReward, warScore, warWindow } from './war';

const msk = (iso: string) => Date.parse(`${iso}+03:00`);

describe('окно войны', () => {
  it('пары в пятницу в 19:00, бой с субботы до конца воскресенья', () => {
    const w = warWindow(msk('2026-10-27T12:00:00'));
    expect(w.key).toBe('2026-10-31');
    expect(w.pairAt).toBe(msk('2026-10-30T19:00:00'));
    expect(w.start).toBe(msk('2026-10-31T00:00:00'));
    expect(w.end).toBe(msk('2026-11-02T00:00:00'));
    expect(w.active).toBe(false);
    expect(warWindow(msk('2026-11-01T23:59:00')).active).toBe(true);
    // В понедельник — уже следующие выходные.
    expect(warWindow(msk('2026-11-02T00:00:00')).key).toBe('2026-11-07');
    // В неделю запуска рейд открыт с понедельника, а война всё равно с субботы.
    expect(warWindow(msk('2026-10-20T12:00:00')).start).toBe(msk('2026-10-24T00:00:00'));
  });
});

describe('счёт', () => {
  it('в зачёт идут N лучших, дневной предел на участника', () => {
    expect(warScore({ a: 100, b: 300, c: 50, d: 10 }, 2)).toBe(400);
    expect(warScore({ a: 100 }, 3)).toBe(100);
    expect(warScore({}, 3)).toBe(0);
    expect(warAdd(0, 50)).toBe(50);
    expect(warAdd(WAR_REPS_PER_DAY - 10, 50)).toBe(10);
    expect(warAdd(WAR_REPS_PER_DAY, 50)).toBe(0);
    expect(warAdd(0, -5)).toBe(0);
    expect(warAdd(0, Number.NaN)).toBe(0);
  });

  it('большой клан не побеждает числом: 3 сильных против 10 слабых', () => {
    const small = { a: 400, b: 380, c: 350 };
    const big = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, 120]));
    expect(warResult(warScore(small, 3), warScore(big, 3))).toBe('win');
    expect(warResult(5, 5)).toBe('draw');
  });
});

describe('пары', () => {
  it('похожие по размеру и уровню — вместе, нечётному — призрак', () => {
    const r = pairClans([
      { id: 'A', members: 25, level: 12 },
      { id: 'B', members: 4, level: 2 },
      { id: 'C', members: 22, level: 10 },
      { id: 'D', members: 5, level: 3 },
      { id: 'E', members: 12, level: 6 },
    ]);
    expect(r.pairs).toEqual([
      ['A', 'C'],
      ['E', 'D'],
    ]);
    expect(r.ghost).toBe('B');
  });

  it('маленькие кланы не участвуют, прошлого соперника и прошлого призрака избегаем', () => {
    expect(pairClans([{ id: 'X', members: 2, level: 9 }])).toEqual({ pairs: [], ghost: null });
    const r = pairClans([
      { id: 'A', members: 20, level: 10, last: 'B' },
      { id: 'B', members: 19, level: 10, last: 'A' },
      { id: 'C', members: 18, level: 10 },
      { id: 'D', members: 17, level: 10 },
    ]);
    expect(r.pairs).toEqual([
      ['A', 'C'],
      ['B', 'D'],
    ]);
    const g = pairClans([
      { id: 'A', members: 20, level: 10 },
      { id: 'B', members: 10, level: 5 },
      { id: 'C', members: 5, level: 2, ghostLast: true },
    ]);
    expect(g.ghost).toBe('B');
    expect(g.pairs).toEqual([['A', 'C']]);
  });
});

describe('призрак', () => {
  it('цель — 90% среднего клана, без истории — база; очки растут по ходу войны', () => {
    expect(ghostTarget([])).toBe(WAR_GHOST_BASE);
    expect(ghostTarget([100, 200, 300, 400])).toBe(270);
    expect(ghostTarget([1])).toBe(60);
    const t = 200;
    const sum = (p: Record<string, number>) => Object.values(p).reduce((x, y) => x + y, 0);
    expect(sum(ghostPoints('2026-10-31', t, 4, msk('2026-10-30T23:00:00')))).toBe(0);
    expect(sum(ghostPoints('2026-10-31', t, 4, msk('2026-11-01T00:00:00')))).toBe(400);
    const end = ghostPoints('2026-10-31', t, 4, msk('2026-11-05T00:00:00'));
    expect(sum(end)).toBe(800);
    expect(Object.keys(end)).toHaveLength(4);
    expect(Object.keys(end)[0]).toBe('Князь Диван');
  });
});

describe('награды', () => {
  it('победителю — монеты и сундук, проигравшему — утешение, MVP — сверху', () => {
    expect(warReward('win', WAR_MIN_POINTS - 1, false)).toBeNull();
    expect(warReward('win', 100, false)).toEqual({ coins: 300, potions: { vigor: 1 }, chest: true });
    expect(warReward('lose', 100, false)).toEqual({ coins: 80, potions: {}, chest: false });
    expect(warReward('draw', 100, false)?.coins).toBe(160);
    expect(warReward('lose', 100, true)).toEqual({ coins: 200, potions: { might: 1 }, chest: false });
    expect(warReward('win', 100, true)).toEqual({ coins: 420, potions: { vigor: 1, might: 1 }, chest: true });
  });
});
