import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { generateWorld } from './worldgen';

describe('worldgen', () => {
  for (const w of [0, 1, 2]) {
    it(`мир ${w + 1}: дорога, уровни и насыщенный декор`, () => {
      const L = generateWorld(LEVELS.slice(w * 100, w * 100 + 100));
      expect(L.nodes).toHaveLength(100);
      expect(L.lands).toHaveLength(10);
      expect(L.tiles.length).toBeGreaterThan(1500);
      expect(L.props.length).toBeGreaterThan(800);
      expect(L.lands.every((l) => l.boss && l.merchant && l.chest)).toBe(true);
      // Декор не стоит на дороге.
      const near = L.props.filter((p) => !/cloud|light/.test(p.name) && L.nodes.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 0.9));
      expect(near).toHaveLength(0);
    });
  }
  it('карта одинакова при каждом построении', () => {
    const a = generateWorld(LEVELS.slice(0, 100));
    const b = generateWorld(LEVELS.slice(0, 100));
    expect(a.props.slice(0, 50)).toEqual(b.props.slice(0, 50));
  });
  it('финал строится из одного уровня', () => {
    const L = generateWorld(LEVELS.slice(300));
    expect(L.nodes).toHaveLength(1);
  });
});
