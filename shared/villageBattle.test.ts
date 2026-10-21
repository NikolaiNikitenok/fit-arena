import { describe, expect, it } from 'vitest';
import { addDeploy, BattleBase, BattleInput, battleResult, canDeploy, createBattle, Deploy, findPath, simulateBattle, stepBattle, validateDeploys } from './villageBattle';
import { campBase, CAMPS, fortress } from './villageCamps';

const LOOT = { wood: 1000, stone: 1000, gold: 500 };
const wave = (u: Deploy['u'], n: number, x: number, y: number, t = 0): Deploy[] => Array.from({ length: n }, (_, k) => ({ t: t + k, u, x: x + (k % 5) * 0.4, y }));

describe('бой за деревню', () => {
  const base = campBase(CAMPS[2]);
  const input: BattleInput = {
    base,
    army: { troops: { warrior: 20, archer: 10 }, level: 2, hero: 5 },
    deploys: [...wave('warrior', 20, 10, -2), ...wave('archer', 10, 10, -2.5, 20), { t: 5, u: 'hero', x: 12, y: -2 }],
    loot: LOOT,
    seed: 42,
  };

  it('один и тот же вход — один и тот же результат', () => {
    const a = simulateBattle(input);
    const b = simulateBattle(JSON.parse(JSON.stringify(input)));
    expect(a).toEqual(b);
    expect(a.destruction).toBeGreaterThan(0);
  });

  it('живая высадка совпадает с полным списком', () => {
    const live = createBattle({ ...input, deploys: [] });
    const sorted = [...input.deploys].sort((x, y) => x.t - y.t);
    let k = 0;
    while (!live.done && live.tick < 3000) {
      while (k < sorted.length && sorted[k].t === live.tick) addDeploy(live, sorted[k].u, sorted[k].x, sorted[k].y), k++;
      stepBattle(live, true);
      if (k >= sorted.length && live.units.every((u) => !u.alive)) break;
    }
    expect(battleResult(live).destruction).toBe(simulateBattle(input).destruction);
    expect(battleResult(live).loot).toEqual(simulateBattle(input).loot);
  });

  it('звёзды: полный разгром слабой заставы — три звезды и вся добыча', () => {
    const r = simulateBattle({ base: campBase(CAMPS[0]), army: { troops: { warrior: 20 }, level: 1 }, deploys: wave('warrior', 20, 12, -2), loot: LOOT, seed: 1 });
    expect(r.destruction).toBe(100);
    expect(r.townhall).toBe(true);
    expect(r.stars).toBe(3);
    expect(r.loot).toEqual(LOOT);
  });

  it('без высадок ничего не разрушено', () => {
    const r = simulateBattle({ ...input, deploys: [] });
    expect(r).toMatchObject({ stars: 0, destruction: 0, loot: { wood: 0, stone: 0, gold: 0 } });
  });

  it('башни убивают слабых: два воина против крепости погибают', () => {
    const r = simulateBattle({ base: campBase(CAMPS[5]), army: { troops: { warrior: 2 }, level: 1 }, deploys: wave('warrior', 2, 12, -2), loot: LOOT, seed: 3 });
    expect(r.destruction).toBeLessThan(50);
    expect(r.stars).toBe(0);
    expect(r.ticks).toBeLessThan(1800);
  });

  it('звезда за ратушу без 50%', () => {
    // Одна ратуша и много построек далеко: ломаем только ратушу.
    const b: BattleBase = { buildings: [{ i: 1, t: 'townhall', x: 2, y: 2, l: 1 }, ...[0, 1, 2, 3, 4].map((k) => ({ i: 10 + k, t: 'lumbermill' as const, x: 20, y: 2 + 4 * k, l: 1 }))] };
    const s = createBattle({ base: b, army: { troops: { warrior: 10 }, level: 1 }, deploys: wave('warrior', 10, 3, -2), loot: LOOT, seed: 2 });
    while (!s.done && s.buildings[0].alive) stepBattle(s);
    const r = battleResult(s);
    expect(r.townhall).toBe(true);
    expect(r.destruction).toBeLessThan(50);
    expect(r.stars).toBe(1);
  });

  it('путь обходит стену, если есть проход, и ломает её, если прохода нет', () => {
    const open = fortress({ th: 1, towers: 0, towerL: 1, catapults: 0, catL: 1, rings: 0, wallL: 1, storages: 0, collectors: 0, l: 1 });
    // Стена поперёк с проходом слева.
    for (let x = 4; x < 24; x++) open.buildings.push({ i: 100 + x, t: 'wall', x, y: 6, l: 8 });
    const s = createBattle({ base: open, army: { troops: { warrior: 1 }, level: 1 }, deploys: [], loot: LOOT, seed: 1 });
    const path = findPath(s, 12.5, -1.5, 0)!;
    expect(path.length).toBeGreaterThan(0);
    const wallCells = path.filter((c) => s.occ[c] >= 0 && s.buildings[s.occ[c]].wall);
    expect(wallCells.length).toBe(0);
    // Ратуша в глухом кольце: путь проходит через одну стену.
    const closed = fortress({ th: 1, towers: 0, towerL: 1, catapults: 0, catL: 1, rings: 1, wallL: 1, storages: 0, collectors: 0, l: 1 });
    const s2 = createBattle({ base: closed, army: { troops: { warrior: 1 }, level: 1 }, deploys: [], loot: LOOT, seed: 1 });
    const p2 = findPath(s2, 12.5, -1.5, 0)!;
    expect(p2.filter((c) => s2.occ[c] >= 0 && s2.buildings[s2.occ[c]].wall).length).toBe(1);
    // И воины действительно пробиваются к ратуше.
    const r = simulateBattle({ base: closed, army: { troops: { warrior: 12 }, level: 1 }, deploys: wave('warrior', 12, 11, -2), loot: LOOT, seed: 1 });
    expect(r.townhall).toBe(true);
  });

  it('подрывники ломают стены', () => {
    const closed = fortress({ th: 1, towers: 0, towerL: 1, catapults: 0, catL: 1, rings: 1, wallL: 3, storages: 0, collectors: 0, l: 1 });
    const s = createBattle({ base: closed, army: { troops: { wallbreaker: 2 }, level: 1 }, deploys: wave('wallbreaker', 2, 11, -2), loot: LOOT, seed: 1 });
    while (!s.done) stepBattle(s);
    expect(s.buildings.filter((b) => b.wall && !b.alive).length).toBeGreaterThan(0);
  });

  it('высадка: только с краю и не больше, чем есть войска', () => {
    expect(canDeploy(base, -2, -2)).toBe(true);
    expect(canDeploy(base, 11, 11)).toBe(false);
    expect(canDeploy(base, 30, 0)).toBe(false);
    expect(validateDeploys(input)).toBeNull();
    expect(validateDeploys({ ...input, deploys: [...input.deploys, { t: 50, u: 'warrior', x: 0, y: -2 }] })).not.toBeNull();
    expect(validateDeploys({ ...input, deploys: [{ t: 0, u: 'warrior', x: 11, y: 11 }] })).not.toBeNull();
    // Лишние высадки в самом бою игнорируются.
    const r = simulateBattle({ ...input, deploys: [...input.deploys, ...wave('giant', 3, 0, -2, 40)] });
    expect(r.used.giant ?? 0).toBe(0);
  });

  it('все лагеря проходимы полным войском своего уровня', () => {
    CAMPS.forEach((c) => {
      const level = c.th + 1;
      const troops = { warrior: 30, archer: 20, giant: c.th >= 3 ? 6 : 0, wallbreaker: c.th >= 4 ? 6 : 0, healer: c.th >= 5 ? 2 : 0 };
      const deploys: Deploy[] = [...wave('giant', troops.giant, 11, -2), ...wave('wallbreaker', troops.wallbreaker, 11, -2, 20), ...wave('warrior', 30, 9, -2, 30), ...wave('archer', 20, 11, -2.5, 60), ...wave('healer', troops.healer, 12, -2, 70)];
      const r = simulateBattle({ base: campBase(c), army: { troops, level, hero: 10 * c.th }, deploys: [...deploys, { t: 25, u: 'hero', x: 12, y: -2 }], loot: c.loot, seed: c.id });
      expect(r.stars, c.name).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('умения героя', () => {
  const base = campBase(CAMPS[3]);
  const army = { troops: { warrior: 15, archer: 10 }, level: 2, hero: 30 };
  const troops: Deploy[] = [{ t: 0, u: 'hero', x: 12, y: -2 }, ...wave('warrior', 15, 10, -2, 1), ...wave('archer', 10, 10, -2.5, 20)];
  const skills: Deploy[] = (['rage', 'cry', 'quake', 'guard', 'squad', 'storm'] as const).map((u, k) => ({ t: 60 + 15 * k, u, x: 0, y: 0 }));

  it('открываются по уровню героя и проверяются', () => {
    const input: BattleInput = { base, army, deploys: [...troops, ...skills], loot: LOOT, seed: 7 };
    expect(validateDeploys(input)).toBeNull();
    expect(validateDeploys({ ...input, army: { ...army, hero: 14 } })).toMatch(/умение/);
    expect(validateDeploys({ ...input, deploys: [...troops, ...skills, { t: 200, u: 'rage', x: 0, y: 0 }] })).toMatch(/умение/);
    expect(validateDeploys({ ...input, deploys: [{ t: 0, u: 'rage', x: 0, y: 0 }, ...troops] })).toMatch(/до высадки героя/);
  });

  it('детерминированы, живая игра совпадает со списком и умения помогают', () => {
    const input: BattleInput = { base, army, deploys: [...troops, ...skills], loot: LOOT, seed: 7 };
    const a = simulateBattle(input);
    expect(simulateBattle(JSON.parse(JSON.stringify(input)))).toEqual(a);
    const without = simulateBattle({ ...input, deploys: troops });
    expect(a.destruction).toBeGreaterThanOrEqual(without.destruction);
    // Умения не тратят войско.
    expect(a.used).toEqual(without.used);

    const live = createBattle({ ...input, deploys: [] });
    const sorted = [...input.deploys].sort((x, y) => x.t - y.t);
    let k = 0;
    while (!live.done) {
      while (k < sorted.length && sorted[k].t === live.tick) addDeploy(live, sorted[k].u, sorted[k].x, sorted[k].y), k++;
      stepBattle(live, true);
      if (k >= sorted.length && live.units.every((u) => !u.alive)) break;
    }
    const replay = simulateBattle({ ...input, deploys: live.input.deploys, endTick: live.tick });
    expect(battleResult(live).destruction).toBe(replay.destruction);
  });

  it('дружина приводит шесть воинов, без героя умение не работает', () => {
    const s = createBattle({ base, army, deploys: [{ t: 0, u: 'hero', x: 12, y: -2 }, { t: 1, u: 'squad', x: 0, y: 0 }], loot: LOOT, seed: 1 });
    stepBattle(s, true);
    stepBattle(s, true);
    expect(s.units.filter((u) => u.u === 'warrior')).toHaveLength(6);
    const none = createBattle({ base, army, deploys: [], loot: LOOT, seed: 1 });
    expect(addDeploy(none, 'rage', 0, 0)).toBeNull();
  });
});

describe('ловушки и герой защитника', () => {
  // Ратуша посередине и пустое поле вокруг: видно, что делают ловушки и страж.
  const plain = (extra: BattleBase['buildings'] = [], hero?: number): BattleBase => ({ buildings: [{ i: 1, t: 'townhall', x: 10, y: 10, l: 3 }, ...extra], hero });
  const run = (base: BattleBase, deploys: Deploy[], ticks = 300, troops = { warrior: 10 }) => {
    const s = createBattle({ base, army: { troops, level: 1 }, deploys, loot: LOOT, seed: 3 });
    for (let k = 0; k < ticks && !s.done; k++) stepBattle(s, true);
    return s;
  };

  it('ловушки не видны в зоне высадки и не считаются в разрушениях', () => {
    const base = plain([{ i: 2, t: 'bomb', x: 3, y: 3, l: 1 }]);
    expect(canDeploy(base, 3.5, 3.5)).toBe(true);
    const r = simulateBattle({ base, army: { troops: { warrior: 20 }, level: 1 }, deploys: wave('warrior', 20, 11, 5), loot: LOOT, seed: 1 });
    expect(r.destruction).toBe(100);
    expect(r.stars).toBe(3);
  });

  it('бомба взрывается под толпой и ранит всех рядом', () => {
    const s = run(plain([{ i: 2, t: 'bomb', x: 11, y: 6, l: 1 }]), wave('warrior', 5, 10.5, 3), 60);
    expect(s.traps[0].fired).toBeGreaterThan(0);
    expect(s.units.filter((u) => u.hp < u.maxHp).length).toBeGreaterThanOrEqual(2);
  });

  it('капкан держит отряд на месте', () => {
    const s = createBattle({ base: plain([{ i: 2, t: 'snare', x: 11, y: 6, l: 1 }]), army: { troops: { giant: 1 }, level: 3 }, deploys: [{ t: 0, u: 'giant', x: 11.5, y: 3 }], loot: LOOT, seed: 1 });
    let caught = -1;
    for (let k = 0; k < 200; k++) {
      stepBattle(s, true);
      if (caught < 0 && s.traps[0].fired >= 0) caught = s.tick;
    }
    expect(caught).toBeGreaterThan(0);
    const g = s.units[0];
    expect(g.root).toBe(s.traps[0].fired + 40);
    // Пока держит — стоит.
    const s2 = createBattle({ base: plain([{ i: 2, t: 'snare', x: 11, y: 6, l: 1 }]), army: { troops: { giant: 1 }, level: 3 }, deploys: [{ t: 0, u: 'giant', x: 11.5, y: 3 }], loot: LOOT, seed: 1 });
    while (s2.traps[0].fired < 0) stepBattle(s2, true);
    const at = [s2.units[0].x, s2.units[0].y];
    for (let k = 0; k < 30; k++) stepBattle(s2, true);
    expect([s2.units[0].x, s2.units[0].y]).toEqual(at);
  });

  it('герой защитника бьётся с отрядами у ратуши, отряды отвечают', () => {
    const s = run(plain([], 10), wave('warrior', 4, 11, 16), 200);
    expect(s.keeper).not.toBeNull();
    expect(s.keeper!.hit).toBeGreaterThan(0);
    expect(s.keeper!.hp).toBeLessThan(s.keeper!.maxHp);
    expect(s.units.some((u) => !u.alive)).toBe(true);
  });

  it('с героем защитника деревню взять труднее, и бой по-прежнему детерминирован', () => {
    const deploys = wave('warrior', 8, 11, 16);
    const without = simulateBattle({ base: plain([]), army: { troops: { warrior: 8 }, level: 1 }, deploys, loot: LOOT, seed: 9 });
    const input: BattleInput = { base: plain([], 20), army: { troops: { warrior: 8 }, level: 1 }, deploys, loot: LOOT, seed: 9 };
    const withHero = simulateBattle(input);
    expect(withHero).toEqual(simulateBattle(JSON.parse(JSON.stringify(input))));
    expect(withHero.destruction).toBeLessThanOrEqual(without.destruction);
    expect(without.destruction).toBe(100);
  });

  it('у лагерей Князя есть ловушки, у последних — страж', () => {
    expect(campBase(CAMPS[4]).buildings.some((b) => b.t === 'bomb')).toBe(true);
    expect(campBase(CAMPS[7]).hero).toBeGreaterThan(0);
    // Ловушки не стоят на постройках.
    for (const c of CAMPS) {
      const b = campBase(c).buildings;
      const cells = new Set<string>();
      for (const x of b.filter((v) => v.t !== 'bomb' && v.t !== 'snare')) {
        const size = x.t === 'townhall' ? 3 : x.t === 'wall' ? 1 : 2;
        for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) cells.add(`${x.x + dx},${x.y + dy}`);
      }
      for (const t of b.filter((v) => v.t === 'bomb' || v.t === 'snare')) expect(cells.has(`${t.x},${t.y}`)).toBe(false);
    }
  });
});
