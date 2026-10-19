import { describe, expect, it } from 'vitest';
import { isUnlocked, LEVELS, starsFor, ZONES } from './campaign';

describe('campaign', () => {
  it('в каждом мире пять уровней, последний — босс', () => {
    ZONES.forEach((_, z) => {
      const levels = LEVELS.filter((l) => l.zone === z);
      expect(levels).toHaveLength(5);
      expect(levels.at(-1)?.boss).toBeDefined();
      expect(levels.slice(0, 4).every((l) => !l.boss)).toBe(true);
    });
  });

  it('уровни открываются по порядку', () => {
    expect(isUnlocked({}, 1)).toBe(true);
    expect(isUnlocked({}, 2)).toBe(false);
    expect(isUnlocked({ 1: 1 }, 2)).toBe(true);
  });

  it('звёзды за оставшееся здоровье', () => {
    expect(starsFor(90, 100)).toBe(3);
    expect(starsFor(50, 100)).toBe(2);
    expect(starsFor(5, 100)).toBe(1);
  });
});
