import { describe, expect, it } from 'vitest';
import { addCharge, addResources, CHARGE_MAX, spendCharge, spendResources, villageOf } from './resources';

describe('заряд и ресурсы', () => {
  it('заряд копится до предела и тратится', () => {
    let p = addCharge({}, 50);
    expect(villageOf(p).charge).toBe(50);
    p = addCharge(p, 1000);
    expect(villageOf(p).charge).toBe(CHARGE_MAX);
    expect(spendCharge(p, CHARGE_MAX + 1)).toBeNull();
    expect(villageOf(spendCharge(p, 20)!).charge).toBe(CHARGE_MAX - 20);
  });
  it('ресурсы добываются и тратятся', () => {
    const p = addResources({}, { wood: 10, gold: 3 });
    expect(villageOf(p).res).toEqual({ wood: 10, stone: 0, gold: 3 });
    expect(spendResources(p, { stone: 1 })).toBeNull();
    expect(villageOf(spendResources(p, { wood: 4 })!).res.wood).toBe(6);
  });
});
