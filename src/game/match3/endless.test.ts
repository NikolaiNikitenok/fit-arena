import { describe, expect, it, vi } from 'vitest';
import { addCharge } from '../resources';
import type { Progress } from '../progress';
import { findMoves, findRuns, hint } from './engine';
import { DUNGEON_LANDS, LAND_THEMES, landDef, landTheme, seededRng } from './lands';
import {
  beginFloor,
  ENDLESS_ATK,
  ENDLESS_HP,
  endlessDepth,
  expectedLoot,
  finishFloor,
  FLOOR_COUNT,
  floorDef,
  floorMult,
  floorOpen,
  LOOT_TAIL,
  playMove,
  restoreRun,
  type Run,
  serializeRun,
  startRun,
} from './dungeon';

const NOW = new Date(2026, 9, 20, 12).getTime();

// Случайные верные ходы — как прогон баланса в шапке dungeon.ts; hint — «внимательный» игрок.
function playRandom(run: Run, seed: number): Run {
  const r = seededRng(seed);
  while (run.status === 'play') {
    const ms = findMoves(run.board);
    const m = ms[Math.floor(r() * ms.length)];
    run = playMove(run, m.a, m.b)!.run;
  }
  return run;
}
function playHint(run: Run): Run {
  while (run.status === 'play') {
    const m = hint(run.board)!;
    run = playMove(run, m.a, m.b)!.run;
  }
  return run;
}

describe('бесконечные этажи', () => {
  it('этаж за сотым собирается одинаково: по номеру, без памяти и на «другом телефоне»', async () => {
    const a = JSON.stringify([floorDef(150), floorDef(777), landDef(42)]);
    vi.resetModules();
    const fresh = await import('./dungeon');
    const lands = await import('./lands');
    expect(JSON.stringify([fresh.floorDef(150), fresh.floorDef(777), lands.landDef(42)])).toBe(a);
    expect(floorDef(150)).toEqual(floorDef(150));
    expect(floorDef(150).seed).toBe(150 * 7919 + 13);
  });

  it('придуманные 100 этажей не поменялись', () => {
    expect(floorDef(100).monster!.hp).toBe(446);
    expect(floorDef(100).monster!.atk).toBe(28);
    expect(floorDef(1).monster!.hp).toBe(154);
    expect(endlessDepth(100)).toBe(0);
    expect(floorMult(100)).toBeCloseTo(5.95);
  });

  it('хранитель на каждом десятом, у земли тема, имя и чудовища', () => {
    for (let id = 101; id <= 600; id++) {
      const f = floorDef(id);
      expect(f.id).toBe(id);
      expect(f.boss).toBe(id % 10 === 0);
      if (f.boss) expect(f.goal).toBe('monster');
      expect(f.moves).toBeGreaterThanOrEqual(15);
      expect(f.moves).toBeLessThanOrEqual(28);
      if (f.goal === 'monster' || f.goal === 'survive') expect(f.monster!.hp).toBeGreaterThan(0);
      if (f.goal === 'ice') expect(f.ice.length).toBeGreaterThan(0);
      if (f.goal === 'crates') expect(f.blocks.length).toBeGreaterThan(0);
      if (f.goal === 'collect') expect(f.collect!.n).toBeGreaterThan(0);
      expect(f.blocks.length + f.ice.length).toBeLessThanOrEqual(14);
    }
    const names = new Set<string>();
    for (let land = 10; land < 210; land++) {
      const L = landDef(land);
      expect(LAND_THEMES).toContain(L.theme);
      expect(L.name.length).toBeGreaterThan(4);
      expect(L.boss[0].length).toBeGreaterThan(4);
      expect(L.monsters).toHaveLength(3);
      // Две земли подряд не выглядят одинаково.
      expect(landTheme(land)).not.toBe(landTheme(land - 1));
      names.add(L.name);
    }
    // Имена разнообразные: за 200 земель повторов немного.
    expect(names.size).toBeGreaterThan(120);
    expect(landDef(3)).toBe(DUNGEON_LANDS[3]);
  });

  it('каждый круг из десяти земель проходит все десять тем', () => {
    for (let c = 1; c < 30; c++) {
      const themes = new Set(Array.from({ length: 10 }, (_, i) => landTheme(c * 10 + i)));
      expect(themes.size).toBe(10);
    }
  });

  it('сложность растёт монотонно и упирается в потолок', () => {
    const hpCap = 280 * 1.594 * (1 + ENDLESS_HP) + 1;
    for (const goal of ['monster', 'survive'] as const) {
      for (const boss of [false, true]) {
        let prevHp = 0;
        let prevAtk = 0;
        for (let id = 90; id <= 5000; id++) {
          const f = floorDef(id);
          if (f.goal !== goal || f.boss !== boss) continue;
          expect(f.monster!.hp).toBeGreaterThanOrEqual(prevHp);
          expect(f.monster!.atk).toBeGreaterThanOrEqual(prevAtk);
          prevHp = f.monster!.hp;
          prevAtk = f.monster!.atk;
          expect(f.monster!.hp).toBeLessThanOrEqual(goal === 'survive' ? 600 * 1.594 * (1 + ENDLESS_HP) + 1 : hpCap);
          expect(f.monster!.atk).toBeLessThanOrEqual(Math.ceil(28 * (1 + ENDLESS_ATK)));
        }
      }
    }
    let prev = 0;
    for (let id = 1; id <= 3000; id += 7) {
      expect(endlessDepth(id)).toBeGreaterThanOrEqual(prev);
      expect(endlessDepth(id)).toBeLessThan(1);
      prev = endlessDepth(id);
    }
  });

  it('добыча растёт, но с потолком: деревня не тонет в ресурсах', () => {
    expect(floorMult(150)).toBeGreaterThan(floorMult(100));
    expect(floorMult(150)).toBeCloseTo(6.41, 1);
    expect(floorMult(1000)).toBeLessThan(1 + 0.05 * 99 + LOOT_TAIL);
    expect(floorMult(99999)).toBeLessThanOrEqual(1 + 0.05 * 99 + LOOT_TAIL);
    expect(expectedLoot(150).wood).toBeGreaterThan(expectedLoot(149).wood);
    expect(expectedLoot(160).wood).toBeGreaterThan(expectedLoot(150).wood);
    expect(expectedLoot(9999).wood).toBeLessThan(expectedLoot(100).wood * 1.6);
  });

  it('доска без готовых совпадений и с ходами; партия переживает сохранение', () => {
    for (const id of [101, 150, 255, 999, 4321]) {
      const run = startRun(floorDef(id), 13);
      expect(findRuns(run.board)).toHaveLength(0);
      expect(findMoves(run.board).length).toBeGreaterThan(0);
      const back = restoreRun(JSON.parse(JSON.stringify(serializeRun(run, 1, NOW))))!;
      expect(back.floor).toEqual(run.floor);
    }
  });

  it('после сотого открывается сто первый, и дальше без предела', () => {
    const p = { ...addCharge({ stars: {} } as unknown as Progress, 100), dungeon: { reached: 100, stars: {}, bestCombo: 0, wins: 0, plays: 0, bosses: [] } } as Progress;
    const won: Run = { ...startRun(floorDef(100), 13), status: 'won', moves: 10 };
    const r = finishFloor(beginFloor(p, 100)!, won, NOW);
    expect(floorOpen(r.progress, 101)).toBe(true);
    const won2: Run = { ...startRun(floorDef(101), 13), status: 'won', moves: 10 };
    const r2 = finishFloor(beginFloor(r.progress, 101)!, won2, NOW);
    expect(floorOpen(r2.progress, 102)).toBe(true);
    expect(floorOpen(r2.progress, 103)).toBe(false);
  });

  it('проходимость: случайные ходы побеждают в разумной доле, внимательный игрок — почти всегда', () => {
    // Те же рамки, что у придуманных этажей 51–100 (случайные ходы ≈ 59%, хранители ≈ 15%).
    let w = 0;
    let n = 0;
    for (let id = 101; id <= 700; id += 13) {
      const f = floorDef(id);
      if (f.boss) continue;
      for (let s = 1; s <= 3; s++) {
        w += Number(playRandom(startRun(f, 13, s * 31 + id), s * 97 + id).status === 'won');
        n++;
      }
    }
    const rate = w / n;
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.9);
    let hw = 0;
    let hn = 0;
    for (let id = 110; id <= 700; id += 40) {
      for (let s = 1; s <= 3; s++) {
        hw += Number(playHint(startRun(floorDef(id), 13, s * 17 + id)).status === 'won');
        hn++;
      }
    }
    // Хранители: подсказками — заметно больше трети (живой игрок с прокачкой сильнее).
    expect(hw / hn).toBeGreaterThan(0.35);
  }, 60000);
});

describe('придуманные земли', () => {
  it('этажи 1–100 по-прежнему из придуманных земель', () => {
    expect(floorDef(FLOOR_COUNT).monster!.name).toBe(DUNGEON_LANDS[9].boss[0]);
  });
});
