import { describe, expect, it } from 'vitest';
import { addCharge, villageOf } from '../resources';
import type { Progress } from '../progress';
import { findRuns, hint } from './engine';
import {
  beginFloor,
  blocksLeft,
  clearBonus,
  dailyBonusReady,
  dungeonOf,
  expectedLoot,
  FAIL_KEEP,
  finishFloor,
  FLOOR_COST,
  FLOOR_COUNT,
  floorDef,
  floorOpen,
  FLOORS,
  iceLeft,
  playMove,
  repsToFloor,
  type Run,
  runStars,
  startRun,
  swordDamage,
} from './dungeon';

const NOW = new Date(2026, 9, 20, 12).getTime();
const DAY = 86400000;
const base = (charge = 100) => addCharge({ stars: {} } as unknown as Progress, charge);

// Играть подсказками, пока партия не кончится.
function playOut(run: Run): Run {
  while (run.status === 'play') {
    const m = hint(run.board)!;
    run = playMove(run, m.a, m.b)!.run;
  }
  return run;
}

describe('этажи', () => {
  it('10 земель по 10 этажей, хранитель на каждом десятом', () => {
    expect(FLOORS).toHaveLength(FLOOR_COUNT);
    expect(FLOORS.filter((f) => f.boss).map((f) => f.id)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    for (const f of FLOORS) {
      expect(f.moves).toBeGreaterThanOrEqual(15);
      expect(f.moves).toBeLessThanOrEqual(28);
      if (f.goal === 'monster' || f.goal === 'survive') expect(f.monster!.hp).toBeGreaterThan(0);
      if (f.goal === 'ice') expect(f.ice.length).toBeGreaterThan(0);
      if (f.goal === 'crates') expect(f.blocks.length).toBeGreaterThan(0);
      if (f.goal === 'collect') expect(f.collect!.n).toBeGreaterThan(0);
    }
  });
  it('доска этажа без готовых совпадений, раскладка постоянная', () => {
    for (const f of FLOORS) expect(findRuns(startRun(f, 13).board)).toHaveLength(0);
    expect(floorDef(37)).toEqual(floorDef(37));
    expect(iceLeft(startRun(floorDef(5), 13).board)).toBeGreaterThan(0);
    expect(blocksLeft(startRun(floorDef(3), 13).board)).toBeGreaterThan(0);
  });
  it('добыча растёт с этажом, хранитель богаче', () => {
    expect(expectedLoot(50).wood).toBeGreaterThan(expectedLoot(5).wood);
    expect(expectedLoot(10).wood).toBeGreaterThan(expectedLoot(9).wood);
    expect(expectedLoot(1).gold).toBeLessThan(expectedLoot(1).wood);
    expect(clearBonus(1, 3).wood).toBeGreaterThan(clearBonus(1, 1).wood);
  });
  it('урон меча слегка растёт с силой героя', () => {
    expect(swordDamage(13)).toBe(10);
    expect(swordDamage(40)).toBeGreaterThan(10);
    expect(swordDamage(500)).toBe(16);
  });
});

describe('партия', () => {
  it('мечи бьют чудовище, ход уменьшает счётчик ходов', () => {
    const run = startRun(floorDef(1), 13);
    const m = hint(run.board)!;
    const o = playMove(run, m.a, m.b)!;
    expect(o.run.moves).toBe(run.moves - 1);
    expect(o.run.monsterHp).toBe(run.monsterHp - o.damage.reduce((a, b) => a + b, 0));
    const swords = o.result.counts.sword;
    if (swords) expect(o.damage.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(swords * 10);
  });
  it('пустой ход не тратит ход', () => {
    const run = startRun(floorDef(1), 13);
    expect(playMove(run, { x: 0, y: 0 }, { x: 5, y: 5 })).toBeNull();
  });
  it('чудовище бьёт раз в несколько ходов', () => {
    let run = startRun(floorDef(4), 13);
    const every = run.floor.monster!.every;
    let hits = 0;
    for (let i = 0; i < every && run.status === 'play'; i++) {
      const m = hint(run.board)!;
      const o = playMove(run, m.a, m.b)!;
      if (o.hit) hits++;
      run = o.run;
    }
    if (run.status === 'play') expect(hits).toBe(1);
  });
  it('первый этаж проходится подсказками почти всегда', () => {
    let wins = 0;
    for (let s = 1; s <= 20; s++) wins += Number(playOut(startRun(floorDef(1), 13, s)).status === 'won');
    expect(wins).toBeGreaterThanOrEqual(18);
  });
  it('та же партия — тот же итог', () => {
    const a = playOut(startRun(floorDef(12), 20, 99));
    const b = playOut(startRun(floorDef(12), 20, 99));
    expect(a).toEqual(b);
  });
  it('выживание: дожил до конца ходов — победа', () => {
    const f = floorDef(8);
    expect(f.goal).toBe('survive');
    const r = playOut(startRun(f, 13, 4));
    if (r.status === 'won') expect(r.heroHp).toBeGreaterThan(0);
    else expect(r.heroHp).toBe(0);
  });
  it('звёзды по оставшимся ходам', () => {
    const run = { ...startRun(floorDef(1), 13), status: 'won' as const };
    expect(runStars({ ...run, moves: run.floor.moves })).toBe(3);
    expect(runStars({ ...run, moves: 1 })).toBe(1);
    expect(runStars({ ...run, status: 'lost' })).toBe(0);
  });
});

describe('заряд, награды и сохранение', () => {
  it('этаж стоит 20 заряда; без заряда не начать', () => {
    const p = base(FLOOR_COST + 5);
    const started = beginFloor(p, 1)!;
    expect(villageOf(started).charge).toBe(5);
    expect(dungeonOf(started).plays).toBe(1);
    expect(beginFloor(started, 1)).toBeNull();
    expect(repsToFloor(started)).toBe(15);
    // Закрытый этаж.
    expect(beginFloor(base(), 2)).toBeNull();
  });
  it('победа: ресурсы, звёзды, следующий этаж и бонус дня один раз', () => {
    const p = beginFloor(base(), 1)!;
    const run = playOut(startRun(floorDef(1), 13, 1));
    expect(run.status).toBe('won');
    const r = finishFloor(p, run, NOW);
    expect(r.reward.won).toBe(true);
    expect(r.reward.firstClear).toBe(true);
    expect(r.reward.daily).not.toBeNull();
    expect(villageOf(r.progress).res.wood).toBe(r.reward.loot.wood);
    expect(r.reward.loot.wood).toBeGreaterThan(Math.round(run.loot.wood));
    expect(floorOpen(r.progress, 2)).toBe(true);
    expect(dungeonOf(r.progress).stars[1]).toBe(runStars(run));
    expect(dailyBonusReady(r.progress, NOW)).toBe(false);
    expect(dailyBonusReady(r.progress, NOW + DAY)).toBe(true);
    // Повтор этажа: снова заряд, бонуса дня уже нет.
    const again = finishFloor(beginFloor(r.progress, 1)!, run, NOW);
    expect(again.reward.daily).toBeNull();
    expect(again.reward.firstClear).toBe(false);
    expect(villageOf(again.progress).charge).toBe(100 - 2 * FLOOR_COST);
  });
  it('поражение: остаётся половина собранного, этаж не открывается', () => {
    const p = beginFloor(base(), 1)!;
    const run: Run = { ...startRun(floorDef(1), 13), status: 'lost', loot: { wood: 30, stone: 21, gold: 9 } };
    const r = finishFloor(p, run, NOW);
    expect(r.reward.won).toBe(false);
    expect(r.reward.loot).toEqual({ wood: Math.round(30 * FAIL_KEEP), stone: Math.round(21 * FAIL_KEEP), gold: Math.round(9 * FAIL_KEEP) });
    expect(floorOpen(r.progress, 2)).toBe(false);
    expect(dungeonOf(r.progress).wins).toBe(0);
    expect(r.reward.daily).toBeNull();
  });
  it('хранитель и лучшее комбо запоминаются', () => {
    const p = { ...base(), dungeon: { reached: 10, stars: {}, bestCombo: 2, wins: 9, plays: 9, bosses: [] } } as Progress;
    const run: Run = { ...startRun(floorDef(10), 13), status: 'won', moves: 10, maxCombo: 5 };
    const r = finishFloor(beginFloor(p, 10)!, run, NOW);
    expect(dungeonOf(r.progress).bosses).toEqual([10]);
    expect(dungeonOf(r.progress).bestCombo).toBe(5);
    expect(dungeonOf(r.progress).reached).toBe(11);
  });
  it('старое сохранение без подземелья — первый этаж', () => {
    expect(dungeonOf({})).toMatchObject({ reached: 1, stars: {}, wins: 0 });
    expect(floorOpen({}, 1)).toBe(true);
  });
});
