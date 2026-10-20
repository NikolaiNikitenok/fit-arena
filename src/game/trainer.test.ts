import { describe, expect, it } from 'vitest';
import { DEFAULT_BASELINE } from './levels';
import { dayKey, passOf, recordTrainerDuel } from './progress';
import { BOT_MIN_GAP_MS, botSchedule, nextTrainer, PACE_JITTER, seededRandom, trainerById, trainerSchedule, TRAINERS } from './trainer';

const MINUTE = 60_000;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('бой с тренером', () => {
  it('один seed — один и тот же бой, разные seed — разные', () => {
    const t = trainerById('grom');
    const a = trainerSchedule(t, DEFAULT_BASELINE, 'squat', MINUTE, 42);
    expect(trainerSchedule(t, DEFAULT_BASELINE, 'squat', MINUTE, 42)).toEqual(a);
    expect(trainerSchedule(t, DEFAULT_BASELINE, 'squat', MINUTE, 43)).not.toEqual(a);
    expect(seededRandom(7)()).toBe(seededRandom(7)());
  });

  it('темп от базы игрока: 70%, 95% и 120%', () => {
    for (const ex of ['squat', 'pushup', 'situp'] as const) {
      for (const t of TRAINERS) {
        const counts = Array.from({ length: 200 }, (_, seed) => trainerSchedule(t, DEFAULT_BASELINE, ex, MINUTE, seed).length);
        const expected = DEFAULT_BASELINE[ex] * t.pace;
        expect(Math.abs(mean(counts) - expected)).toBeLessThan(0.6);
        // Разброс небольшой: в пределах джиттера и округления.
        for (const c of counts) expect(Math.abs(c - expected)).toBeLessThanOrEqual(expected * PACE_JITTER + 1);
      }
    }
    expect(TRAINERS.map((t) => t.pace)).toEqual([0.7, 0.95, 1.2]);
  });

  it('подстраивается под сильного игрока', () => {
    const strong = { squat: 40, pushup: 30, situp: 30 };
    const weak = trainerSchedule(trainerById('lisa'), DEFAULT_BASELINE, 'pushup', MINUTE, 5).length;
    const hard = trainerSchedule(trainerById('lisa'), strong, 'pushup', MINUTE, 5).length;
    expect(hard).toBeGreaterThan(weak * 2.5);
  });

  it('все повторы внутри боя, по порядку и не чаще, чем может человек', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const t of TRAINERS) {
        const times = trainerSchedule(t, { squat: 45, pushup: 35, situp: 40 }, 'squat', MINUTE, seed);
        expect(times[0]).toBeGreaterThanOrEqual(700);
        expect(times[times.length - 1]).toBeLessThan(MINUTE);
        for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(BOT_MIN_GAP_MS - 1);
      }
    }
  });

  it('ритм как у человека: серии и передышки', () => {
    const times = botSchedule(24, MINUTE, [3, 5], seededRandom(11));
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const pauses = gaps.filter((g) => g > median * 1.8);
    expect(pauses.length).toBeGreaterThanOrEqual(3);
    expect(pauses.length).toBeLessThan(gaps.length / 2);
    // К концу боя тренер немного устаёт.
    const inBurst = (from: number, to: number) => mean(gaps.slice(from, to).filter((g) => g <= median * 1.2));
    expect(inBurst(gaps.length - 8, gaps.length)).toBeGreaterThan(inBurst(0, 8));
  });

  it('даже при слабой базе тренер делает хоть что-то, и есть следующий тренер', () => {
    expect(trainerSchedule(trainerById('lisa'), { squat: 3, pushup: 3, situp: 3 }, 'pushup', MINUTE, 1).length).toBeGreaterThanOrEqual(1);
    expect(nextTrainer('lisa')?.id).toBe('grom');
    expect(nextTrainer('grom')?.id).toBe('knyaz');
    expect(nextTrainer('knyaz')).toBeNull();
  });

  it('в пропуск идёт бой, но не победа: задания на победы не фармятся', () => {
    const t = Date.now();
    expect(passOf(recordTrainerDuel(t), t).c[dayKey(t)]).toEqual({ duel: 1 });
  });
});
