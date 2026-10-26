import { describe, expect, it } from 'vitest';
import { claimHoliday, HOLIDAY_GOAL, HOLIDAY_STEPS, holidayAt, holidayByKey, holidayOutfit, holidayReady, holidaysSoFar, holidayTokens, tokenWord } from './holidays';
import { HOLIDAYS } from './holidayDefs';
import { ITEMS, openChest } from './items';
import { ACHIEVEMENTS, heroBadge, visibleAchievements } from './achievements';
import { dayKey, loadProgress, type Progress } from './progress';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const DAY = 86_400_000;



/** Герой, который делал reps повторов в каждый из days дней начиная с from. */
function trained(from: number, days: number, reps: number): Progress {
  const p = loadProgress();
  const d: Record<string, number> = {};
  for (let i = 0; i < days; i++) d[dayKey(from + i * DAY)] = reps;
  return { ...p, days: d };
}

describe('календарь праздников', () => {
  it('Ночь тыкв идёт с 25 октября по 8 ноября включительно', () => {
    const w = holidayAt(at(2026, 9, 26));
    expect(w.live).toBe(true);
    expect(w.key).toBe('pumpkin-2026');
    expect(holidayAt(at(2026, 10, 8, 23)).live).toBe(true);
    const after = holidayAt(at(2026, 10, 9, 1));
    expect(after.live).toBe(false);
    expect(after.key).toBe('winter-2026');
  });

  it('зимний праздник переходит через Новый год и считается праздником декабря', () => {
    const w = holidayAt(at(2027, 0, 5));
    expect(w.live).toBe(true);
    expect(w.key).toBe('winter-2026');
    expect(holidayAt(at(2027, 0, 12)).key).toBe('spring-2027');
  });

  it('до первого праздника — ближайший; прошлые идут по порядку', () => {
    expect(holidayAt(at(2026, 9, 1)).key).toBe('pumpkin-2026');
    expect(holidaysSoFar(at(2027, 2, 20)).map((w) => w.key)).toEqual(['pumpkin-2026', 'winter-2026', 'spring-2027']);
    expect(holidayByKey('summer-2027')!.def.name).toBe('Летние игры');
  });
});

describe('жетоны и дорожка', () => {
  it('жетоны — повторы только за дни праздника', () => {
    const w = holidayAt(at(2026, 9, 26));
    const p = trained(at(2026, 9, 20), 10, 100);
    // С 20 по 29 октября: в праздник попали 25–29.
    expect(holidayTokens(p, w)).toBe(500);
  });

  it('ступени забираются по порядку жетонов, один раз и только пока праздник идёт', () => {
    const now = at(2026, 10, 1);
    let p = trained(at(2026, 9, 25), 8, 70);
    expect(holidayReady(p, now)).toBe(HOLIDAY_STEPS.filter((s) => s.at <= 560).length);
    const coins = p.coins;
    const r = claimHoliday(p, 50, now)!;
    expect(r.progress.coins).toBe(coins + 150);
    p = r.progress;
    expect(claimHoliday(p, 50, now)).toBeNull();
    expect(claimHoliday(p, 800, now)).toBeNull();
    // После праздника — ничего.
    expect(claimHoliday(p, 150, at(2026, 10, 10))).toBeNull();
  });

  it('за всю дорожку — облик года и титул; другим годам он не достаётся', () => {
    const now = at(2026, 10, 7);
    let p = trained(at(2026, 9, 25), 14, HOLIDAY_GOAL / 10);
    for (const s of HOLIDAY_STEPS) p = claimHoliday(p, s.at, now)!.progress;
    const outfit = holidayOutfit(holidayAt(now));
    expect(outfit.name).toContain('2026');
    expect(p.items).toContain(outfit.id);
    expect(p.equipped).toBe(outfit.id);
    expect(heroBadge(p)?.id).toBe('hol-pumpkin-2026');
    expect(visibleAchievements(p, now).some((a) => a.id === 'hol-pumpkin-2026')).toBe(true);
    // Облик 2027 — другой.
    expect(holidayOutfit(holidayByKey('pumpkin-2027')!).id).not.toBe(outfit.id);
  });

  it('праздничные облики не выпадают из сундуков и не продаются', () => {
    const hol = ITEMS.filter((i) => i.holiday);
    expect(hol.length).toBe(HOLIDAYS.length * 5);
    expect(hol.every((i) => !i.inShop)).toBe(true);
    for (let seed = 0; seed < 300; seed++) expect(openChest(seed, [], 20).item?.holiday).toBeUndefined();
  });

  it('праздничные титулы не видны в достижениях, пока их нет', () => {
    const p = loadProgress();
    const visible = visibleAchievements(p, at(2026, 10, 1));
    expect(visible.some((a) => a.id.startsWith('hol-'))).toBe(false);
    expect(ACHIEVEMENTS.some((a) => a.id === 'hol-spring-2028')).toBe(true);
  });

  it('слова для жетонов', () => {
    const d = HOLIDAYS[0];
    expect([1, 2, 5, 11, 21, 104].map((n) => tokenWord(d, n))).toEqual(['тыква', 'тыквы', 'тыкв', 'тыкв', 'тыква', 'тыквы']);
  });
});
