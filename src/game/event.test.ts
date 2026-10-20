import { describe, expect, it } from 'vitest';
import { daysUntil, EVENT_BOSSES, EVENT_TRIES_PER_DAY, eventBoss, eventOf, eventWindow, lastWeekend, recordEventHit, triesLeft } from './event';
import { ITEMS, itemById, openChest } from './items';
import { loadProgress, Progress } from './progress';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

describe('календарь события выходных', () => {
  it('последние полные выходные месяца: суббота и воскресенье этого месяца', () => {
    // Октябрь 2026: последнее воскресенье 25-го.
    expect(lastWeekend(2026, 9).start).toBe(new Date(2026, 9, 24).getTime());
    expect(lastWeekend(2026, 9).end).toBe(new Date(2026, 9, 26).getTime());
    // Май 2026 кончается воскресеньем 31-го: выходные 30–31.
    expect(new Date(lastWeekend(2026, 4).start).getDate()).toBe(30);
    // Январь 2026 кончается субботой 31-го: полные выходные — 24–25.
    expect(new Date(lastWeekend(2026, 0).start).getDate()).toBe(24);
    for (let m = 0; m < 24; m++) {
      const w = lastWeekend(2026 + Math.floor(m / 12), m % 12);
      expect(new Date(w.start).getDay()).toBe(6);
      expect(new Date(w.end - 1).getDay()).toBe(0);
      expect(new Date(w.end - 1).getMonth()).toBe(m % 12);
    }
  });

  it('48 часов в прямом эфире, а до и после — следующее событие', () => {
    const before = eventWindow(at(2026, 9, 20));
    expect(before.live).toBe(false);
    expect(before.key).toBe('2026-10');
    expect(daysUntil(before, at(2026, 9, 20))).toBe(4);
    expect(eventWindow(new Date(2026, 9, 24, 0, 0).getTime()).live).toBe(true);
    expect(eventWindow(new Date(2026, 9, 25, 23, 59).getTime()).live).toBe(true);
    const after = eventWindow(new Date(2026, 9, 26, 0, 0).getTime());
    expect(after.live).toBe(false);
    expect(after.key).toBe('2026-11');
    expect(new Date(after.start).getDate()).toBe(28);
    // Декабрь → январь следующего года.
    expect(eventWindow(at(2026, 11, 30)).key).toBe('2027-01');
  });
});

describe('боссы события', () => {
  it('двенадцать разных боссов, у каждого месяца свой и свой облик только из события', () => {
    expect(EVENT_BOSSES).toHaveLength(12);
    const keys = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    expect(new Set(keys.map((k) => eventBoss(k).id)).size).toBe(12);
    expect(eventBoss('2027-03')).toBe(eventBoss('2026-03'));
    for (const b of EVENT_BOSSES) {
      const item = itemById(b.outfit);
      expect(item.id, b.id).toBe(b.outfit);
      expect(item.event).toBe(true);
      expect(item.inShop).toBe(false);
    }
    const eventIds = new Set(ITEMS.filter((i) => i.event).map((i) => i.id));
    for (let seed = 1; seed < 400; seed++) {
      const loot = openChest(seed, [], seed % 30);
      if (loot.item) expect(eventIds.has(loot.item.id)).toBe(false);
    }
  });
});

describe('урон по боссу события', () => {
  const live = new Date(2026, 9, 24, 10).getTime();
  const sunday = new Date(2026, 9, 25, 10).getTime();

  it('копится между попытками, попыток три в день, награда один раз', () => {
    let p: Progress = loadProgress();
    const hp = eventOf(p, live).hpMax;
    expect(hp).toBeGreaterThan(0);
    // Вне события урон не засчитывается.
    expect(recordEventHit(p, 100, at(2026, 9, 20))).toBeNull();
    const part = Math.floor(hp / 4);
    for (let i = 0; i < EVENT_TRIES_PER_DAY; i++) {
      const r = recordEventHit(p, part, live + i * 60_000)!;
      expect(r.killed).toBe(false);
      p = r.progress;
    }
    expect(eventOf(p, live).dealt).toBe(part * 3);
    expect(triesLeft(p, live)).toBe(0);
    expect(recordEventHit(p, part, live)).toBeNull();
    // Новый день — снова три попытки, урон не сбрасывается.
    expect(triesLeft(p, sunday)).toBe(EVENT_TRIES_PER_DAY);
    const coins = p.coins;
    const kill = recordEventHit(p, hp, sunday)!;
    expect(kill.killed).toBe(true);
    expect(eventOf(kill.progress, sunday).dealt).toBe(hp);
    const boss = eventBoss('2026-10');
    expect(kill.progress.items).toContain(boss.outfit);
    expect(kill.progress.coins).toBeGreaterThan(coins);
    expect(kill.progress.eventWins).toEqual(['2026-10']);
    // Повержен — больше ни урона, ни награды.
    expect(recordEventHit(kill.progress, 100, sunday + 60_000)).toBeNull();
  });

  it('здоровье фиксируется на первой попытке, а в новом месяце всё заново', () => {
    let p: Progress = loadProgress();
    p = recordEventHit(p, 10, live)!.progress;
    const hp = eventOf(p, live).hpMax;
    p = { ...p, coins: 99999, baseline: { squat: 80, pushup: 60, situp: 70 } };
    expect(eventOf(p, sunday).hpMax).toBe(hp);
    const nov = new Date(2026, 10, 28, 10).getTime();
    expect(eventOf(p, nov).dealt).toBe(0);
    expect(eventOf(p, nov).key).toBe('2026-11');
  });
});
