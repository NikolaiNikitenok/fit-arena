import { describe, expect, it } from 'vitest';
import { dayGoalFor } from './dayGoal';

describe('цель дня из знакомства', () => {
  it('растёт со временем и уровнем, не меньше 20', () => {
    expect(dayGoalFor(2, 1)).toBe(60);
    expect(dayGoalFor(0, 0)).toBe(20);
    expect(dayGoalFor(3, 2)).toBe(130);
    expect(dayGoalFor(1, 2)).toBeGreaterThan(dayGoalFor(1, 1));
  });
});
