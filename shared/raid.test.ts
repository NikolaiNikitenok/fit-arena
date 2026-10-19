import { describe, expect, it } from 'vitest';
import { raidHp, raidReward, raidWindow } from './raid';

const msk = (iso: string) => Date.parse(`${iso}+03:00`);

describe('рейд', () => {
  it('идёт с субботы по воскресенье по Москве, в неделю запуска — сразу', () => {
    expect(raidWindow(msk('2026-10-19T12:00:00')).active).toBe(true);
    expect(raidWindow(msk('2026-10-19T12:00:00')).key).toBe('2026-10-24');
    expect(raidWindow(msk('2026-10-27T12:00:00')).active).toBe(false);
    const sat = raidWindow(msk('2026-10-31T00:10:00'));
    expect(sat).toMatchObject({ active: true, key: '2026-10-31' });
    expect(raidWindow(msk('2026-11-01T23:50:00')).active).toBe(true);
    expect(raidWindow(msk('2026-11-02T00:10:00')).active).toBe(false);
  });
  it('здоровье по участникам, награды по урону', () => {
    expect(raidHp(1, 1)).toBe(raidHp(3, 1));
    expect(raidHp(10, 2)).toBeGreaterThan(raidHp(10, 1));
    const hp = raidHp(4, 1);
    expect(raidReward(0, hp, 4, false).tier.id).toBe('none');
    expect(raidReward(10, hp, 4, false).tier.id).toBe('part');
    expect(raidReward(hp / 4, hp, 4, false).tier.id).toBe('gold');
    const killed = raidReward(hp / 4, hp, 4, true);
    expect(killed.coins).toBe(900);
    expect(raidReward(10, hp, 4, true).chest).toBe(true);
  });
});
