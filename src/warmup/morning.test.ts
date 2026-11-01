import { describe, expect, it } from 'vitest';
import { markMorning, morningDue, morningReps } from './morning';
import type { Progress } from '../game/progress';

const at = (h: number) => new Date(2026, 10, 2, h, 15).getTime();
const empty = {} as Progress;
const on = true;

describe('утренняя зарядка', () => {
  it('предлагается только утром', () => {
    expect(morningDue(empty, at(4), on)).toBe(false);
    expect(morningDue(empty, at(8), on)).toBe(true);
    expect(morningDue(empty, at(12), on)).toBe(false);
  });
  it('не предлагается, если выключена или уже тренировался', () => {
    expect(morningDue(empty, at(8), false)).toBe(false);
    const trained = { log: { '2026-11-02': { r: { squat: 5 }, b: {} } } } as unknown as Progress;
    expect(morningDue(trained, at(8), on)).toBe(false);
  });
  it('один раз в день', () => {
    markMorning(at(7));
    expect(morningDue(empty, at(9), on)).toBe(false);
    expect(morningDue(empty, at(8) + 86_400_000, on)).toBe(true);
  });
  it('повторы в разумных пределах', () => {
    expect(morningReps({ squat: 20, pushup: 10, situp: 15 })).toEqual({ squat: 8, pushup: 5 });
    expect(morningReps({ squat: 100, pushup: 80, situp: 15 })).toEqual({ squat: 20, pushup: 15 });
  });
});
