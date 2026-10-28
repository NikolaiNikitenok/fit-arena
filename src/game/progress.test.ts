import { beforeEach, describe, expect, it } from 'vitest';
import { applyFreeze, claimChest, dailyProgress, dayKey, equipGear, LIFE_MS, livesNow, loadProgress, MAX_LIVES, Progress, recordActivity, recordOutsideReps, spendLife, spendMight, spendSwaps, streak, streakOf, swapsLeft, usePotion } from './progress';

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

describe('заморозка серии с Pro', () => {
  // Вчера тренировался, потом три пропуска подряд: без заморозки серия — 1 день.
  const p = { ...loadProgress(), days: days(1, 5, 6, 7) };
  it('спасает серию один раз в неделю и остаётся, когда Pro закончится', () => {
    expect(streakOf(p, NOW).days).toBe(1);
    expect(applyFreeze(p, false, NOW)).toBe(p);
    const frozen = applyFreeze(p, true, NOW);
    expect(frozen.freezes).toEqual([dayKey(NOW - 2 * DAY)]);
    expect(streakOf(frozen, NOW).days).toBe(7);
    // Вторая заморозка на этой неделе не положена.
    expect(applyFreeze(frozen, true, NOW)).toBe(frozen);
    // Сегодня потренировался, а завтра Pro уже нет: замороженный день так и остаётся в серии.
    const next = { ...frozen, days: { ...frozen.days, [dayKey(NOW)]: 10 } };
    expect(streakOf(next, NOW + DAY).days).toBe(8);
    expect(streak(next.days, NOW + DAY).days).toBe(2);
  });
  it('не тратится, когда спасать нечего', () => {
    const steady = { ...loadProgress(), days: days(0, 1, 2) };
    expect(applyFreeze(steady, true, NOW)).toBe(steady);
    const gone = { ...loadProgress(), days: days(10, 11, 12) };
    expect(applyFreeze(gone, true, NOW)).toBe(gone);
  });
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

describe('инвентарь', () => {
  it('зелье бодрости даёт жизнь, эликсир действует до начала боя, свиток добавляет замену', () => {
    let p: Progress = { ...loadProgress(), lives: 2, livesAt: NOW, potions: { vigor: 1, might: 1, swap: 1 } };
    p = usePotion(p, 'vigor', NOW)!;
    expect(livesNow(p, NOW).lives).toBe(3);
    expect(usePotion(p, 'vigor', NOW)).toBeNull();
    p = usePotion(p, 'might', NOW)!;
    expect(p.might).toBe(true);
    expect(spendMight(p).might).toBe(false);
    p = usePotion(p, 'swap', NOW)!;
    expect(swapsLeft(p, 1, NOW).left).toBe(4);
  });
  it('сундуки дают добычу, двуручное оружие и щиты надеваются по слотам', () => {
    const kinds = new Set(Array.from({ length: 30 }, (_, land) => claimChest(loadProgress(), land)!).map((r) => (r.itemName ? 'item' : 'coins')));
    expect(kinds.size).toBe(2);
    let p: Progress = { ...loadProgress(), items: ['starter', 'sword', 'round-shield'] };
    p = equipGear(p, 'round-shield');
    expect(p.offhand).toBe('round-shield');
    expect(equipGear(p, 'round-shield').offhand).toBeUndefined();
  });
});

describe('повторы вне карты', () => {
  it('дуэль идёт в серию, задание дня и клан', () => {
    const p = recordOutsideReps('pushup', 25, NOW);
    expect(streak(p.days, NOW).today).toBe(true);
    expect(dailyProgress(p, { date: dayKey(NOW), exercise: 'pushup', target: 40 } as Parameters<typeof dailyProgress>[1])).toBe(25);
    expect(p.clanPending).toBe(25);
    expect(loadProgress().days[dayKey(NOW)]).toBe(25);
  });
});
