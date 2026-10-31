import { describe, expect, it } from 'vitest';
import { fresh } from './progress';
import { clearedLevels, freshUnlocks, isUnlocked, levelsToUnlock, markUnlockSeen, rememberUnlocks } from './unlocks';

const withLevels = (n: number, days: Record<string, number> = { '2026-11-05': 10 }) => ({ ...fresh(), days, stars: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 1])) });

describe('ступени разделов', () => {
  it('новичок видит только приключение', () => {
    const p = withLevels(0, {});
    expect(isUnlocked(p, 'duel')).toBe(false);
    expect(isUnlocked(p, 'clan')).toBe(false);
    expect(levelsToUnlock(p, 'village')).toBe(10);
  });
  it('разделы открываются пройденными уровнями', () => {
    expect(isUnlocked(withLevels(3), 'shop')).toBe(true);
    expect(isUnlocked(withLevels(4), 'duel')).toBe(false);
    expect(isUnlocked(withLevels(5), 'duel')).toBe(true);
    expect(levelsToUnlock(withLevels(12), 'clan')).toBe(3);
    expect(clearedLevels(withLevels(7))).toBe(7);
  });
  it('у тех, кто играл до ступеней, открыто всё и без объявлений', () => {
    const p = withLevels(1, { '2026-10-20': 50 });
    expect(isUnlocked(p, 'clan')).toBe(true);
    expect(freshUnlocks(p)).toEqual([]);
  });
  it('ссылка открывает раздел сразу и запоминается', () => {
    const p = withLevels(0, {});
    expect(isUnlocked(p, 'clan', ['clan'])).toBe(true);
    const q = rememberUnlocks(p, ['clan']);
    expect(isUnlocked(q, 'clan')).toBe(true);
    expect(rememberUnlocks(q, ['clan'])).toBe(q);
  });
  it('Гром объявляет новые разделы один раз', () => {
    const p = withLevels(5);
    expect(freshUnlocks(p)).toEqual(['daily', 'shop', 'programs', 'gym', 'duel', 'pass', 'events', 'collections']);
    expect(freshUnlocks(markUnlockSeen(p, freshUnlocks(p)))).toEqual([]);
  });
  it('раздел, открытый ссылкой, не объявляется', () => {
    const p = rememberUnlocks(withLevels(0, {}), ['clan']);
    expect(freshUnlocks({ ...p, stars: withLevels(15).stars })).not.toContain('clan');
  });
});
