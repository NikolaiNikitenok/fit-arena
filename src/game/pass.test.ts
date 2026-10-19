import { describe, expect, it } from 'vitest';
import { claimPassTier, claimQuest, dailyQuests, PASS_TIERS, passQuests, passRewards, passTier, passWeek, questValue, seasonQuests, weeklyQuests, XP_PER_TIER } from './pass';
import { countPass, dayKey, loadProgress, passOf, type Progress, recordActivity, recordDuel } from './progress';

const base = { squat: 20, pushup: 10, situp: 15 };
const at = (date: string, h = 12) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00`).getTime();
const withXp = (p: Progress, xp: number, now: number): Progress => ({ ...p, pass: { ...passOf(p, now), xp } });

describe('задания пропуска', () => {
  it('одинаковые весь день, свои на каждый день, цели от силы игрока', () => {
    const a = dailyQuests('2026-10-20', base);
    expect(dailyQuests('2026-10-20', base)).toEqual(a);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
    const days = Array.from({ length: 14 }, (_, i) => JSON.stringify(dailyQuests(dayKey(at('2026-10-19') + i * 86400000), base).map((q) => [q.stat, q.target])));
    expect(new Set(days).size).toBeGreaterThan(3);
    for (const q of a) {
      expect(q.target).toBeGreaterThan(0);
      expect(q.xp).toBeGreaterThan(0);
      if (q.stat in base) expect(q.target).toBeGreaterThanOrEqual(base[q.stat as keyof typeof base]);
    }
  });

  it('неделя сезона и недельные задания', () => {
    expect(passWeek('2026-10-19')).toBe(0);
    expect(passWeek('2026-10-25')).toBe(0);
    expect(passWeek('2026-10-26')).toBe(1);
    expect(passWeek('2026-11-15')).toBe(3);
    expect(passWeek('2026-11-16')).toBe(0);
    expect(weeklyQuests('2026-10-20', base)).toEqual(weeklyQuests('2026-10-25', base));
    expect(weeklyQuests('2026-10-20', base)[0].id).not.toBe(weeklyQuests('2026-10-27', base)[0].id);
    expect(seasonQuests(1).every((q) => q.id.startsWith('s:1:'))).toBe(true);
  });

  it('счётчики: день, неделя, сезон; опыт за задание один раз', () => {
    const mon = at('2026-10-19');
    const tue = at('2026-10-20');
    let p = recordActivity(loadProgress(), 'squat', 30, mon);
    p = recordActivity(p, 'squat', 40, tue);
    const day = dailyQuests('2026-10-20', base)[0];
    const reps = { id: 'w:test', kind: 'weekly' as const, stat: 'reps' as const, target: 70, xp: 200, title: '' };
    expect(questValue(p, { ...day, stat: 'squat' }, tue)).toBe(40);
    expect(questValue(p, reps, tue)).toBe(70);
    expect(questValue(p, { ...reps, kind: 'season' }, at('2026-11-02'))).toBe(70);
    // Через неделю недельный счётчик пуст.
    expect(questValue(p, reps, at('2026-10-27'))).toBe(0);
    const done = claimQuest(p, reps, tue)!;
    expect(passOf(done, tue).xp).toBe(200);
    expect(claimQuest(done, reps, tue)).toBeNull();
    expect(claimQuest(p, { ...reps, target: 71 }, tue)).toBeNull();
  });

  it('новый сезон — пропуск с нуля', () => {
    const t = at('2026-10-20');
    const p = withXp(countPass(loadProgress(), 'win', 3, t), 900, t);
    expect(passOf(p, t).xp).toBe(900);
    const next = at('2026-11-17');
    expect(passOf(p, next)).toMatchObject({ season: 2, xp: 0, free: [], pro: [] });
  });

  it('дуэли и задания на месте', () => {
    const t = Date.now();
    const p = recordDuel('win', t);
    const q = passQuests(p, t).find((x) => x.stat === 'duelWin')!;
    expect(questValue(p, q, t)).toBe(1);
    expect(passOf(recordDuel('lose', t), t).c[dayKey(t)]).toEqual({ duel: 1 });
  });
});

describe('ступени и награды', () => {
  it('ступень по опыту', () => {
    expect(passTier(0)).toEqual({ tier: 0, into: 0, need: XP_PER_TIER });
    expect(passTier(XP_PER_TIER - 1).tier).toBe(0);
    expect(passTier(XP_PER_TIER * 3 + 10)).toEqual({ tier: 3, into: 10, need: XP_PER_TIER });
    expect(passTier(XP_PER_TIER * 99).tier).toBe(PASS_TIERS);
  });

  it('в конце — облики пропуска, монет меньше, чем в лавке стоят легенды', () => {
    expect(passRewards(PASS_TIERS)).toEqual({ free: { kind: 'outfit', id: 'pass-silver' }, pro: { kind: 'outfit', id: 'pass-gold' } });
    let free = 0;
    let pro = 0;
    for (let t = 1; t <= PASS_TIERS; t++) {
      const r = passRewards(t);
      if (r.free.kind === 'coins') free += r.free.n;
      if (r.pro.kind === 'coins') pro += r.pro.n;
    }
    expect(free).toBeGreaterThan(1000);
    expect(free).toBeLessThan(3000);
    expect(pro).toBeLessThan(5000);
  });

  it('бесплатная — всем, Pro — только с Pro от сервера, каждая один раз', () => {
    const t = at('2026-10-20');
    const p = withXp(loadProgress(), XP_PER_TIER * 2, t);
    expect(claimPassTier(p, 'free', 3, false, 0, t)).toBeNull();
    const one = claimPassTier(p, 'free', 1, false, 0, t)!;
    expect(one.progress.coins).toBe(p.coins + 44);
    expect(claimPassTier(one.progress, 'free', 1, false, 0, t)).toBeNull();
    expect(claimPassTier(one.progress, 'pro', 1, false, 0, t)).toBeNull();
    const gold = claimPassTier(one.progress, 'pro', 1, true, 0, t)!;
    expect(gold.progress.coins).toBe(one.progress.coins + 88);
    expect(passOf(gold.progress, t)).toMatchObject({ free: [1], pro: [1] });
    expect(claimPassTier(gold.progress, 'pro', 1, true, 0, t)).toBeNull();
  });

  it('облик пропуска выдаётся, а второй раз превращается в монеты', () => {
    const t = at('2026-10-20');
    const p = withXp(loadProgress(), XP_PER_TIER * PASS_TIERS, t);
    const got = claimPassTier(p, 'pro', PASS_TIERS, true, 0, t)!;
    expect(got.progress.items).toContain('pass-gold');
    const again = claimPassTier({ ...got.progress, pass: { ...passOf(got.progress, t), pro: [] } }, 'pro', PASS_TIERS, true, 0, t)!;
    expect(again.progress.coins).toBe(got.progress.coins + 2500);
  });
});
