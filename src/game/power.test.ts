import { describe, expect, it } from 'vitest';
import { DEFAULT_BASELINE, LEVELS, targetReps } from './levels';
import { Mission } from './mission';
import { expectedDamage, heroPower, repsFor } from './power';
import { loadProgress } from './progress';

describe('урон и здоровье врагов', () => {
  it('герой «по уровню» делает обычную цель, сильный — не меньше 80%, слабый — не больше 130%', () => {
    for (const id of [5, 62, 153, 284]) {
      const level = LEVELS[id - 1];
      const base = targetReps(level, DEFAULT_BASELINE);
      const par = new Mission(level, DEFAULT_BASELINE, { damage: expectedDamage(id) * (1 + id / 1500), hearts: 3 });
      expect(par.target).toBeGreaterThanOrEqual(base - 1);
      expect(par.target).toBeLessThanOrEqual(base + 1);
      expect(new Mission(level, DEFAULT_BASELINE, { damage: 999, hearts: 3 }).target).toBe(Math.max(3, Math.ceil(base * 0.8)));
      expect(new Mission(level, DEFAULT_BASELINE, { damage: 1, hearts: 3 }).target).toBe(Math.ceil(base * 1.3));
    }
  });

  it('здоровье врагов растёт по ходу игры', () => {
    const hp = (id: number) => new Mission(LEVELS[id - 1], DEFAULT_BASELINE).view(0).hpMax;
    expect(hp(150)).toBeGreaterThan(hp(15));
    expect(expectedDamage(300)).toBeGreaterThan(expectedDamage(10));
  });

  it('урон: база + уровень героя + оружие, двуручное отключает щит', () => {
    const p = { ...loadProgress(), weapon: 'greataxe', offhand: 'spellbook', items: ['starter', 'sword', 'greataxe', 'spellbook'] };
    const pw = heroPower(p);
    expect(pw.offhandOff).toBe(true);
    expect(pw).toMatchObject({ atk: 22, pct: 0 });
    expect(pw.damage).toBe(10 + pw.level + 22);
    expect(heroPower({ ...p, weapon: 'axe' }).damage).toBe(Math.round((10 + pw.level + 6) * 1.15));
    expect(repsFor(10, 1000, 1)).toBe(13);
  });
});
