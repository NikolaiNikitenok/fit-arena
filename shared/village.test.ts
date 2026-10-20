import { describe, expect, it } from 'vitest';
import { accrued, applyLoss, build, BUILDINGS, canPlace, capacity, collect, finishDue, finishNow, freeBuilders, lootAvailable, move, newTown, speedUpCharge, thLevel, Town, upgrade, villageBonus } from './village';
import { finishTraining, train, untrain } from './villageBattle';

const H = 3_600_000;
const rich = (): Town => ({ ...newTown({ wood: 1e6, stone: 1e6, gold: 1e6 }) });

describe('деревня', () => {
  it('ратуша в центре, постройки не пересекаются и не выходят за сетку', () => {
    const t = newTown();
    expect(thLevel(t)).toBe(1);
    expect(canPlace(t, 'lumbermill', 10, 10)).toBe(false);
    expect(canPlace(t, 'lumbermill', 0, 0)).toBe(true);
    expect(canPlace(t, 'lumbermill', 23, 0)).toBe(false);
    expect(canPlace(t, 'lumbermill', 13, 10)).toBe(true);
  });

  it('стройка идёт по таймеру и занимает строителей', () => {
    let t = rich();
    const r = build(t, 'lumbermill', 0, 0, 0);
    expect(typeof r).toBe('object');
    t = r as Town;
    expect(t.b[1].l).toBe(0);
    expect(freeBuilders(t)).toBe(1);
    t = build(t, 'quarry', 3, 0, 0) as Town;
    expect(build(t, 'goldmine', 6, 0, 0)).toBe('builders');
    t = finishDue(t, 10_000);
    expect(t.b[1].l).toBe(1);
    expect(freeBuilders(t)).toBe(2);
    // Второй лесопилки на ратуше 1 нет.
    expect(build(t, 'lumbermill', 6, 0, 10_000)).toBe('limit');
    // Выше потолка ратуши не улучшить.
    t = finishDue(upgrade(t, 2, 10_000) as Town, 10_000 + 300_000);
    expect(t.b[1].l).toBe(2);
    expect(upgrade(t, 2, 400_000)).toBe('th');
  });

  it('ускорение: заряд за оставшиеся минуты', () => {
    let t = rich();
    t = upgrade(t, 1, 0) as Town;
    expect(speedUpCharge(t.b[0], 0)).toBe(15);
    t = finishNow(t, 1, 60_000);
    expect(thLevel(t)).toBe(2);
  });

  it('сборщик копит до предела и собирается в склад', () => {
    let t = finishDue(build(rich(), 'lumbermill', 0, 0, 0) as Town, 10_000);
    const b = t.b[1];
    expect(accrued(b, 10_000 + H)).toBe(12);
    expect(accrued(b, 10_000 + 100 * H)).toBe(120);
    t = { ...t, res: { wood: 0, stone: 0, gold: 0 } };
    const r = collect(t, b.i, 10_000 + 5 * H);
    expect(r.got).toBe(60);
    expect(r.town.res.wood).toBe(60);
    expect(accrued(r.town.b[1], 10_000 + 5 * H)).toBe(0);
    // Полный склад: собирается только то, что влезает.
    const full = collect({ ...t, res: { wood: capacity(t) - 10, stone: 0, gold: 0 } }, b.i, 10_000 + 5 * H);
    expect(full.got).toBe(10);
    expect(accrued(full.town.b[1], 10_000 + 5 * H)).toBe(50);
  });

  it('улучшение сборщика не теряет накопленное', () => {
    let t = finishDue(build(rich(), 'lumbermill', 0, 0, 0) as Town, 10_000);
    t = upgrade(t, 2, 10_000 + 5 * H) as Town;
    t = finishDue(t, 10_000 + 5 * H + 300_000);
    expect(t.b[1].l).toBe(2);
    expect(accrued(t.b[1], 10_000 + 5 * H + 300_000)).toBeGreaterThanOrEqual(60);
  });

  it('перенос постройки', () => {
    const t = newTown();
    expect(move(t, 1, 0, 0)?.b[0].x).toBe(0);
    expect(move(t, 1, 22, 0)).toBeNull();
  });

  it('защита запасов и добыча', () => {
    const t: Town = { ...newTown({ wood: 1000, stone: 100, gold: 0 }) };
    const loot = lootAvailable(t, 0);
    // Вместимость 1000, защищено 250: 20% от 750.
    expect(loot.wood).toBe(150);
    expect(loot.stone).toBe(0);
    const after = applyLoss(t, loot, 0);
    expect(after.res.wood).toBe(850);
  });

  it('бонусы для основной игры скромные', () => {
    expect(villageBonus(undefined)).toEqual({ damage: 0, lives: 0, coins: 0 });
    const b = villageBonus([{ i: 1, t: 'forge', x: 0, y: 0, l: 3 }, { i: 2, t: 'tavern', x: 0, y: 0, l: 5 }, { i: 3, t: 'market', x: 0, y: 0, l: 2 }]);
    expect(b.damage).toBeCloseTo(0.03);
    expect(b.lives).toBe(2);
    expect(b.coins).toBeCloseTo(0.04);
  });

  it('у всех построек таблицы на 8 уровней', () => {
    for (const d of Object.values(BUILDINGS)) {
      expect(d.count.length).toBe(8);
      expect(d.levelCap.length).toBe(8);
      expect(d.hp.length).toBe(8);
      expect(d.cost.length).toBe(8);
    }
  });

  it('обучение войска по очереди', () => {
    let t = rich();
    expect(train(t, 'warrior', 0)).toBe('locked');
    t = finishDue(build(t, 'barracks', 0, 0, 0) as Town, 10_000);
    t = train(t, 'warrior', 10_000) as Town;
    t = train(t, 'warrior', 10_000) as Town;
    expect(t.q.map((q) => q.end)).toEqual([25_000, 40_000]);
    expect(train(t, 'archer', 10_000)).toBe('locked');
    t = finishTraining(t, 30_000);
    expect(t.army.warrior).toBe(1);
    const gold = t.res.gold;
    t = untrain(t, 'warrior');
    expect(t.q.length).toBe(0);
    expect(t.res.gold).toBe(gold + 25);
  });
});
