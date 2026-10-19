import { beforeEach, describe, expect, it } from 'vitest';
import { dayKey, LIFE_MS, livesNow, loadProgress, MAX_LIVES, recordActivity, spendLife, spendSwaps, streak, swapsLeft } from './progress';

const DAY = 86400000;
const NOW = new Date(2026, 9, 19, 12).getTime();
const days = (...ago: number[]) => Object.fromEntries(ago.map((a) => [dayKey(NOW - a * DAY), 10]));

beforeEach(() => {
  const store: Record<string, string> = {};
  globalThis.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) } as unknown as Storage;
});

describe('жизни', () => {
  it('поражение отнимает жизнь, со временем она возвращается', () => {
    let p = loadProgress();
    expect(livesNow(p, NOW).lives).toBe(MAX_LIVES);
    p = spendLife(p, NOW);
    p = spendLife(p, NOW + 1000);
    expect(livesNow(p, NOW + 1000).lives).toBe(MAX_LIVES - 2);
    expect(livesNow(p, NOW + LIFE_MS).lives).toBe(MAX_LIVES - 1);
    expect(livesNow(p, NOW + 2 * LIFE_MS).lives).toBe(MAX_LIVES);
  });
  it('без жизней тратить нечего', () => {
    let p = loadProgress();
    for (let i = 0; i < MAX_LIVES + 2; i++) p = spendLife(p, NOW);
    const now = livesNow(p, NOW);
    expect(now.lives).toBe(0);
    expect(now.nextMs).toBe(LIFE_MS);
  });
});

describe('серия', () => {
  it('считает дни подряд', () => expect(streak(days(0, 1, 2, 3), NOW)).toMatchObject({ days: 4, today: true }));
  it('сегодня ещё не занимался — серия не сгорает', () => expect(streak(days(1, 2), NOW)).toMatchObject({ days: 2, today: false }));
  it('два дня отдыха в неделю серию не рвут', () => expect(streak(days(0, 2, 4, 5), NOW).days).toBe(6));
  it('три пропуска подряд рвут', () => expect(streak(days(0, 4, 5), NOW).days).toBe(1));
});

describe('рекорды', () => {
  it('помнит первый и лучший подход', () => {
    let p = loadProgress();
    p = recordActivity(p, 'pushup', 8, NOW - 30 * DAY);
    p = recordActivity(p, 'pushup', 15, NOW);
    p = recordActivity(p, 'pushup', 11, NOW);
    expect(p.first.pushup?.reps).toBe(8);
    expect(p.best.pushup?.reps).toBe(15);
    expect(p.days[dayKey(NOW)]).toBe(26);
  });
});

describe('уровень героя', () => {
  it('растёт от повторов и пройденных уровней', async () => {
    const { heroLevel, heroXp, xpToNext, claimHeroLevels, maxLives } = await import('./progress');
    expect(heroLevel(0).level).toBe(1);
    expect(heroLevel(xpToNext(1)).level).toBe(2);
    let p = loadProgress();
    p = recordActivity(p, 'squat', 200, NOW);
    expect(heroXp(p)).toBe(200);
    const r = claimHeroLevels(p)!;
    expect(r.levels.length).toBeGreaterThan(0);
    expect(claimHeroLevels(r.progress)).toBeNull();
    expect(maxLives(p)).toBe(MAX_LIVES);
  });
});

describe('замены упражнений', () => {
  const day = new Date(2026, 9, 19, 12).getTime();
  it('три в день, переигрывать с уже оплаченной заменой бесплатно', () => {
    let p = loadProgress();
    expect(swapsLeft(p, 5, day)).toEqual({ left: 3, paid: 0 });
    p = spendSwaps(p, 5, 1, day)!;
    expect(swapsLeft(p, 5, day)).toEqual({ left: 2, paid: 1 });
    expect(spendSwaps(p, 5, 1, day)).toBe(p);
    p = spendSwaps(p, 7, 2, day)!;
    expect(swapsLeft(p, 8, day).left).toBe(0);
    expect(spendSwaps(p, 8, 1, day)).toBeNull();
    expect(swapsLeft(p, 8, day + 86_400_000)).toEqual({ left: 3, paid: 0 });
  });
});
