import { describe, expect, it } from 'vitest';
import { COMBO_GAP_MS, comboLive, comboShout, comboTier, nextCombo, NO_COMBO } from './combo';

describe('комбо в бою', () => {
  it('растёт без пауз, после паузы — заново, лучшее помнит', () => {
    let c = NO_COMBO;
    for (let i = 0; i < 12; i++) c = nextCombo(c, i * 1500);
    expect(c).toMatchObject({ n: 12, best: 12 });
    expect(comboLive(c, 11 * 1500 + COMBO_GAP_MS)).toBe(true);
    expect(comboLive(c, 11 * 1500 + COMBO_GAP_MS + 1)).toBe(false);
    c = nextCombo(c, 11 * 1500 + COMBO_GAP_MS + 1);
    expect(c).toMatchObject({ n: 1, best: 12 });
  });
  it('сила эффектов и выкрики на рубежах', () => {
    expect([1, 3, 9, 10, 25].map(comboTier)).toEqual([0, 1, 1, 2, 3]);
    expect(comboShout(5)).toBe('Огонь!');
    expect(comboShout(6)).toBeNull();
  });
});
