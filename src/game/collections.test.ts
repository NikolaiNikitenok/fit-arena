import { describe, expect, it } from 'vitest';
import { BASE_COLLECTIONS, COLLECTIONS, collectionDone, heroAura, visibleCollections } from './collections';
import { achDone, ACHIEVEMENTS } from './achievements';
import { ITEMS } from './items';
import { loadProgress } from './progress';

const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();

describe('коллекции обликов', () => {
  it('в коллекциях только настоящие облики, и каждый облик — не больше чем в одной', () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    const all = COLLECTIONS.flatMap((c) => c.items);
    expect(all.every((id) => ids.has(id))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });

  it('за полный комплект — титул и сияние, за неполный — ничего', () => {
    const shop = BASE_COLLECTIONS.find((c) => c.id === 'shop')!;
    const p = { ...loadProgress(), items: ['starter', ...shop.items.slice(1)], aura: 'shop' };
    const ach = ACHIEVEMENTS.find((a) => a.id === 'col-shop')!;
    expect(collectionDone(shop, p)).toBe(false);
    expect(achDone(ach, p, 0)).toBe(false);
    expect(heroAura(p)).toBeUndefined();
    const full = { ...p, items: [...p.items, shop.items[0]] };
    expect(achDone(ach, full, 0)).toBe(true);
    expect(heroAura(full)).toBe(shop.aura);
  });

  it('праздничный год виден с Ночи тыкв', () => {
    expect(visibleCollections(at(2026, 9, 20)).some((c) => c.limited)).toBe(false);
    expect(visibleCollections(at(2026, 9, 26)).filter((c) => c.limited).map((c) => c.id)).toEqual(['hy-2026']);
    expect(visibleCollections(at(2027, 11, 1)).filter((c) => c.limited).map((c) => c.id)).toEqual(['hy-2026', 'hy-2027']);
  });
});
