import { describe, expect, it } from 'vitest';
import { DEFAULT_BASELINE, LevelDef, LEVELS } from './levels';
import { Mission } from './mission';

const level = (type: LevelDef['type']) => LEVELS.find((l) => l.type === type && l.id > 3)!;

// Делает n повторов с шагом step мс, начиная с t0; возвращает время после последнего.
function reps(m: Mission, n: number, t0: number, step = 2000): number {
  let t = t0;
  for (let i = 0; i < n; i++) {
    t += step;
    m.rep(t);
  }
  return t;
}

describe('Mission', () => {
  it('перерыв: время, сердца и повторы стоят, после — часы сдвигаются', () => {
    const boss = LEVELS[9];
    const m = new Mission(boss, DEFAULT_BASELINE);
    m.start(0);
    const t = reps(m, m.phaseTarget(0), 0, 1000);
    expect(m.phaseIndex).toBe(1);
    m.pause(t);
    const left = m.view(t).leftMs;
    const hearts = m.view(t).hearts;
    // Две минуты отдыха: сердца не сгорают, время не идёт, повторы не считаются.
    m.tick(t + 120000);
    m.rep(t + 120000);
    expect(m.view(t + 120000).leftMs).toBe(left);
    expect(m.view(t + 120000).hearts).toBe(hearts);
    expect(m.view(t + 120000).reps).toBe(m.phaseTarget(0));
    m.resume(t + 120000);
    expect(m.paused).toBe(false);
    expect(m.view(t + 121000).leftMs).toBe(left - 1000);
    m.rep(t + 121000);
    expect(m.view(t + 121000).reps).toBe(m.phaseTarget(0) + 1);
    expect(m.view(t + 121000).outcome).toBe('running');
  });

  it('строитель: победа после нужного числа повторов', () => {
    const m = new Mission(level('build'), DEFAULT_BASELINE);
    m.start(0);
    reps(m, m.target - 1, 0);
    expect(m.view(0).outcome).toBe('running');
    const t = reps(m, 1, 100000);
    expect(m.view(t).outcome).toBe('won');
    expect(m.stars(t)).toBeGreaterThan(0);
  });

  it('подъём: поражение, если не успел', () => {
    const m = new Mission(level('climb'), DEFAULT_BASELINE);
    m.start(0);
    m.tick(61000);
    expect(m.view(61000).outcome).toBe('lost');
  });

  it('погоня: чудище догоняет без повторов, темп держит отрыв', () => {
    const lazy = new Mission(level('chase'), DEFAULT_BASELINE);
    lazy.start(0);
    lazy.tick(30000);
    expect(lazy.view(30000).outcome).toBe('lost');

    const fit = new Mission(level('chase'), DEFAULT_BASELINE);
    fit.start(0);
    const step = (60000 / fit.target) * 0.9;
    const t = reps(fit, fit.target + 5, 0, step);
    fit.tick(Math.max(t, 60000));
    expect(fit.view(60000).outcome).toBe('won');
  });

  it('оборона: волна прорывается при медленном темпе', () => {
    const m = new Mission(level('defend'), DEFAULT_BASELINE);
    m.start(0);
    m.rep(1000);
    m.tick(26000);
    expect(m.view(26000).outcome).toBe('lost');
  });

  it('босс: фазы меняют упражнение, отдых стоит сердец', () => {
    const boss = LEVELS[9];
    const m = new Mission(boss, DEFAULT_BASELINE);
    m.start(0);
    expect(m.exercise).toBe(boss.exercises[0]);
    let t = 0;
    while (m.view(t).phase === 0) t = reps(m, 1, t, 1000);
    expect(m.exercise).toBe(boss.exercises[1]);
    m.tick(t + 7000);
    m.tick(t + 14000);
    expect(m.view(t + 14000).hearts).toBe(1);
    m.tick(t + 21000);
    expect(m.view(t + 21000).outcome).toBe('lost');
  });

  it('испытание всегда засчитывается и даёт рекорд', () => {
    const m = new Mission(LEVELS[0], DEFAULT_BASELINE);
    m.start(0);
    reps(m, 17, 0, 3000);
    m.tick(60000);
    expect(m.view(60000)).toMatchObject({ outcome: 'won', record: 17 });
  });
});
