import { describe, expect, it } from 'vitest';
import { ITEMS } from './items';
import { heroLook, outfitSkin } from './outfitSkin';

describe('outfitSkin', () => {
  it('стартовый облик — родная модель без костюма', () => {
    expect(outfitSkin(ITEMS.find((i) => i.id === 'starter')!)).toBeUndefined();
  });

  it('у каждого облика костюм по его редкости', () => {
    const tier = { common: 0, rare: 1, epic: 2, legendary: 3 };
    for (const item of ITEMS) {
      if (item.id === 'starter') continue;
      const skin = outfitSkin(item)!;
      expect(skin.key).toBe(item.id);
      expect(skin.tier).toBe(tier[item.rarity]);
      for (const c of [skin.cloth, skin.cloth2, skin.leather, skin.gem]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('с костюмом старый оттенок и свечение не применяются', () => {
    const gold = ITEMS.find((i) => i.id === 'gold')!;
    const look = heroLook(gold);
    expect(look.skin?.metal).toBe('gold');
    expect(look.tint).toBeUndefined();
    expect(look.glow).toBeUndefined();
  });
});
