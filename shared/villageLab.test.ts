import { describe, expect, it } from 'vitest';
import { finishDue, newTown, type Town } from './village';
import { simulateBattle, unitMul, type BattleBase } from './villageBattle';
import { boostResearch, cancelResearch, finishResearch, finishResearchNow, maxTroopLevel, researchBlock, researchCost, researchTime, startResearch, troopLevel, troopLevels } from './villageLab';
import { checkArmy, checkTown } from './villagePvp';

const rich = (): Town => newTown({ wood: 1e6, stone: 1e6, gold: 1e6 });
/** Ратуша 2, казармы 1 и лаборатория 1. */
function withLab(): Town {
  const t = rich();
  t.b[0] = { ...t.b[0], l: 2 };
  t.b.push({ i: 2, t: 'barracks', x: 0, y: 0, l: 1 }, { i: 3, t: 'lab', x: 3, y: 0, l: 1 });
  t.n = 4;
  return t;
}

describe('лаборатория', () => {
  it('без лаборатории исследовать нельзя, лаборатория 1 открывает 2-й уровень', () => {
    expect(researchBlock(rich(), 'warrior')).toBe('nolab');
    expect(maxTroopLevel(0)).toBe(1);
    expect(maxTroopLevel(1)).toBe(2);
    expect(maxTroopLevel(7)).toBe(8);
    const t = withLab();
    expect(researchBlock(t, 'warrior')).toBeNull();
    // Лучник открывается казармами 2.
    expect(researchBlock(t, 'archer')).toBe('locked');
  });

  it('исследование: цена сразу, уровень по таймеру, одно за раз, потолок лаборатории', () => {
    let t = startResearch(withLab(), 'warrior', 0) as Town;
    expect(t.res.gold).toBe(1e6 - researchCost('warrior', 2).gold);
    expect(t.res.stone).toBe(1e6 - 100);
    expect(researchBlock(t, 'warrior')).toBe('busy');
    expect(finishResearch(t, researchTime(2) * 1000 - 1)).toBe(t);
    t = finishResearch(t, researchTime(2) * 1000);
    expect(troopLevel(t, 'warrior')).toBe(2);
    expect(t.r).toBeUndefined();
    expect(troopLevels(t)).toEqual({ warrior: 2 });
    // Лаборатория 1 — не выше 2-го.
    expect(researchBlock(t, 'warrior')).toBe('lab');
  });

  it('пока лабораторию улучшают, новое исследование не начать', () => {
    const t = withLab();
    t.b[2] = { ...t.b[2], u: 1000 };
    expect(researchBlock(t, 'warrior')).toBe('labBusy');
    expect(researchBlock(finishDue(t, 1000), 'warrior')).toBeNull();
  });

  it('повторы ускоряют: повтор — минута; заряд заканчивает сразу; отмена возвращает цену', () => {
    let t = startResearch(withLab(), 'warrior', 0) as Town;
    t = boostResearch(t, 10);
    expect(t.r!.end).toBe(researchTime(2) * 1000 - 10 * 60_000);
    expect(troopLevel(finishResearchNow(t, 5), 'warrior')).toBe(2);
    expect(cancelResearch(t).res).toEqual(withLab().res);
    expect(boostResearch(withLab(), 50)).toEqual(withLab());
  });

  it('цены растут с уровнем', () => {
    expect(researchCost('warrior', 2)).toEqual({ wood: 0, stone: 100, gold: 100 });
    expect(researchCost('warrior', 3).gold).toBe(250);
    expect(researchCost('healer', 8).gold).toBe(30000);
  });

  it('уровень отряда усиливает его в бою на 15% за уровень', () => {
    expect(unitMul({ level: 1 }, 'warrior')).toBe(1);
    expect(unitMul({ level: 1, lv: { warrior: 3 } }, 'warrior')).toBeCloseTo(1.3);
    expect(unitMul({ level: 2, lv: { warrior: 2 } }, 'warrior')).toBeCloseTo(1.12 * 1.15);
    const base: BattleBase = { buildings: [{ i: 1, t: 'townhall', x: 10, y: 10, l: 1 }, { i: 2, t: 'tower', x: 4, y: 10, l: 2 }] };
    const deploys = Array.from({ length: 6 }, (_, k) => ({ t: k, u: 'warrior' as const, x: 1, y: 10 + k * 0.5 }));
    const run = (lv?: number) => simulateBattle({ base, army: { troops: { warrior: 6 }, level: 1, lv: lv ? { warrior: lv } : undefined }, deploys, loot: { wood: 0, stone: 0, gold: 0 }, seed: 7 });
    const weak = run();
    const strong = run(5);
    expect(strong.destruction).toBeGreaterThanOrEqual(weak.destruction);
  });

  it('сервер: уровни отрядов не выше лаборатории, в набег — не выше своих', () => {
    const t = finishResearch(startResearch(withLab(), 'warrior', 0) as Town, 1e9);
    expect(checkTown(t)).toBeNull();
    expect(checkTown({ ...t, tl: { warrior: 3 } })).toBe('уровни отрядов');
    expect(checkTown({ ...t, r: { t: 'warrior', end: 5 } })).toBe('исследование');
    expect(checkArmy({ troops: {}, level: 1, lv: { warrior: 2 } }, t, 1)).toBeNull();
    expect(checkArmy({ troops: {}, level: 1, lv: { warrior: 3 } }, t, 1)).toBe('уровень warrior');
    expect(checkArmy({ troops: {}, level: 1, lv: { giant: 2 } }, t, 1)).toBe('уровень giant');
  });
});
