import { describe, expect, it } from 'vitest';
import { dueReminders, localTime, SaveStore } from './saves';

describe('копии прогресса', () => {
  it('хранится более свежая копия, гость переезжает в аккаунт', () => {
    const s = new SaveStore(null);
    s.put('tg:1', { coins: 10, savedAt: 200 });
    s.put('tg:1', { coins: 5, savedAt: 100 });
    expect(s.get('tg:1')!.progress).toMatchObject({ coins: 10 });
    s.put('guest:a', { coins: 99, savedAt: 300 });
    s.adopt('tg:1', 'guest:a');
    expect(s.get('tg:1')!.progress).toMatchObject({ coins: 99 });
  });

  it('future clocks cannot block later saves and legacy future dates recover', () => {
    const s = new SaveStore(null); const now = 1_800_000_000_000;
    s.put('tg:1', { coins: 10, savedAt: now + 86_400_000 }, now);
    expect(s.get('tg:1')!.savedAt).toBe(now);
    expect(s.get('tg:1')!.progress?.savedAt).toBe(now);
    s.put('tg:1', { coins: 11, savedAt: now + 1 }, now + 1);
    expect(s.get('tg:1')!.progress?.coins).toBe(11);
    s.get('tg:1')!.savedAt = now + 365 * 86_400_000;
    s.put('tg:1', { coins: 12, savedAt: now + 2 }, now + 2);
    expect(s.get('tg:1')!.progress?.coins).toBe(12);
    s.put('tg:1', { coins: 0, savedAt: Infinity }, now + 3);
    expect(s.get('tg:1')!.progress?.coins).toBe(12);
  });

  it('напоминание: в свой час, раз в день и только если не тренировался', () => {
    const s = new SaveStore(null);
    // Москва: UTC+3, напомнить в 19:00 — это 16:00 UTC.
    s.setRemind('tg:1', { hour: 19, tz: 180 });
    s.setRemind('tg:2', { hour: 19, tz: 180 });
    s.put('tg:2', { days: { '2026-10-20': 30 }, savedAt: 1 });
    const now = Date.parse('2026-10-20T16:10:00Z');
    expect(localTime(now, 180)).toEqual({ date: '2026-10-20', hour: 19 });
    expect(dueReminders(s.all(), now).map((d) => d.save.id)).toEqual(['tg:1']);
    s.markReminded('tg:1', '2026-10-20');
    expect(dueReminders(s.all(), now)).toHaveLength(0);
    expect(s.setRemind('tg:3', { hour: 30, tz: 0 }).remind).toBeNull();
  });
});
