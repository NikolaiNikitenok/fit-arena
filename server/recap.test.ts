import { mkdtempSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMonth, monthReps, RecapBoard } from './recap';
import { DAY_REPS_MAX } from './saves';
import { STORY_KEEP_MS, StoryImages } from './storyImages';

const save = (id: string, days: Record<string, number>) => ({ id, progress: { days } });

describe('место в итогах месяца', () => {
  it('повторы месяца с пределом в день', () => {
    expect(monthReps({ '2026-10-01': 10, '2026-10-02': 99999, '2026-09-30': 5, '2026-100': 7 }, '2026-10')).toBe(10 + DAY_REPS_MAX);
    expect(isMonth('2026-10')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('../x')).toBe(false);
  });

  it('доля «сильнее», место города и место в городе', () => {
    const saves = [save('a', { '2026-10-01': 100 }), save('b', { '2026-10-01': 50 }), save('c', { '2026-10-01': 300 }), save('d', { '2026-10-01': 10 }), save('e', { '2026-09-01': 500 })];
    const cities = [
      { id: 'a', city: 'Казань' },
      { id: 'b', city: 'казань' },
      { id: 'c', city: 'Питер' },
      { id: 'd', city: 'Санкт-Петербург' },
    ];
    const board = new RecapBoard({ saves: () => saves, cities: () => cities });
    // У «a» 100: меньше у двоих из трёх других.
    expect(board.standing('a', '2026-10', 0)).toEqual({ percent: 67, players: 4, city: { name: 'Казань', place: 2, cities: 2, me: 1, members: 2 } });
    expect(board.standing('c', '2026-10', 0)).toMatchObject({ percent: 100, city: { name: 'Санкт-Петербург', place: 1, me: 1 } });
    // В октябре не тренировался — без процента.
    expect(board.standing('e', '2026-10', 0)).toEqual({ percent: null, players: 4, city: null });
  });
});

describe('картинки для сторис', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]).toString('base64');
  it('только JPEG, не больше 10 в час, живут двое суток', () => {
    const dir = mkdtempSync(join(tmpdir(), 'story-'));
    const s = new StoryImages(dir);
    expect(s.put('u', Buffer.from('<svg/>').toString('base64'), 0)).toMatchObject({ code: 400 });
    const r = s.put('u', jpeg, Date.now());
    if (!('id' in r)) throw new Error('не сохранилась');
    expect(r.id).toMatch(/^[a-z0-9]{20}$/);
    expect(s.get(r.id, Date.now())?.length).toBe(104);
    expect(s.get('../secret', Date.now())).toBeNull();
    expect(s.get(r.id, Date.now() + STORY_KEEP_MS + 60_000)).toBeNull();
    for (let i = 0; i < 9; i++) s.put('u', jpeg, Date.now());
    expect(s.put('u', jpeg, Date.now())).toMatchObject({ code: 429 });
    // Устаревшие файлы удаляются при следующей загрузке.
    const old = (Date.now() - STORY_KEEP_MS - 60_000) / 1000;
    utimesSync(join(dir, `${r.id}.jpg`), old, old);
    s.put('other', jpeg, Date.now());
    expect(s.get(r.id, Date.now())).toBeNull();
  });
});
