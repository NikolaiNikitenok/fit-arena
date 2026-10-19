import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bossDrop, GEAR, openChest, RARITY_ORDER } from './items';
import { LANDS } from './lands';
import { expectedDamage, PAR_ATK } from './power';

describe('оружие и щиты у купца', () => {
  it('у каждой вещи свой id, иконка и земля, где она появляется', () => {
    expect(new Set(GEAR.map((g) => g.id)).size).toBe(GEAR.length);
    for (const g of GEAR) {
      expect(existsSync(`public/gear/${g.id}.png`), g.id).toBe(true);
      expect(g.minLand).toBeLessThan(LANDS.length);
    }
  });

  it('есть дешёвые, средние и очень дорогие вещи в обоих слотах', () => {
    for (const slot of ['weapon', 'offhand'] as const) {
      const shop = GEAR.filter((g) => g.slot === slot && g.inShop);
      expect(shop.filter((g) => g.price <= 500).length).toBeGreaterThanOrEqual(3);
      expect(shop.filter((g) => g.price > 500 && g.price < 5000).length).toBeGreaterThanOrEqual(5);
      expect(shop.filter((g) => g.price >= 5000).length).toBeGreaterThanOrEqual(5);
      // Дорогое — только эпическое и легендарное.
      for (const g of shop.filter((x) => x.price >= 5000)) expect(['epic', 'legendary']).toContain(g.rarity);
    }
  });

  it('дороже — не слабее: у вещи редкостью выше цена не ниже, чем у самой дорогой вещи на две ступени ниже', () => {
    const shop = GEAR.filter((g) => g.inShop);
    for (let r = 2; r < RARITY_ORDER.length; r++) {
      const low = Math.max(...shop.filter((g) => g.rarity === RARITY_ORDER[r - 2]).map((g) => g.price));
      for (const g of shop.filter((x) => x.rarity === RARITY_ORDER[r])) expect(g.price, g.id).toBeGreaterThan(low);
    }
  });

  it('дорогие вещи не поднимают здоровье врагов: планка урона — оружие средней цены', () => {
    expect(Math.max(...GEAR.filter((g) => g.inShop).map((g) => g.atk))).toBeGreaterThan(PAR_ATK);
    expect(expectedDamage(300)).toBeLessThan(10 + 30 + PAR_ATK);
  });

  it('легендарные вещи купца не выпадают из сундуков и боссов', () => {
    const legend = new Set(GEAR.filter((g) => g.inShop && g.rarity === 'legendary').map((g) => g.id));
    let owned: string[] = [];
    for (let i = 0; i < GEAR.length; i++) {
      const g = bossDrop(29, owned);
      if (!g) break;
      expect(legend.has(g.id)).toBe(false);
      owned = [...owned, g.id];
    }
    for (let seed = 1; seed < 300; seed++) {
      const loot = openChest(seed, [], 28);
      if (loot.gear) expect(legend.has(loot.gear.id)).toBe(false);
    }
  });
});
