import { describe, expect, it } from 'vitest';
import { loadProgress } from './progress';
import { claimStarter, STARTER_PACK } from './starter';

describe('набор «Новичок»', () => {
  it('кладёт облик, монеты и зелья один раз', () => {
    const p = { ...loadProgress(), coins: 50 };
    const got = claimStarter(p, 1)!;
    expect(got.items).toContain(STARTER_PACK.outfit);
    expect(got.coins).toBe(50 + STARTER_PACK.coins);
    // Жизни за звёзды не продаём: зелий бодрости в наборе нет.
    expect(got.potions?.vigor ?? 0).toBe(p.potions?.vigor ?? 0);
    expect(got.potions?.swap).toBe((p.potions?.swap ?? 0) + STARTER_PACK.swap);
    expect(claimStarter(got, 2)).toBeNull();
  });
});
