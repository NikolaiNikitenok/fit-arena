import { describe, expect, it } from 'vitest';
import type { PvpDefense, PvpInbox, PvpWin } from '../../shared/villagePvp';
import { testProgress } from '../../server/villages.fixture';
import { villageOf } from '../game/resources';
import { applyDefense, applyInbox, applyWin, canRevenge, markRevenged } from './pvp';

const NOW = Date.UTC(2026, 9, 20, 12);
const defense = (id: string, at = NOW - 1000): PvpDefense => ({
  id,
  at,
  who: 'Вася',
  stars: 2,
  pct: 60,
  loot: { wood: 0, stone: 0, gold: 300 },
  avail: { wood: 400, stone: 400, gold: 400 },
  seed: 5,
  army: { troops: { warrior: 10 }, level: 1 },
  deploys: [{ t: 0, u: 'warrior', x: 10, y: 26 }],
  base: [[1, 'townhall', 10, 10, 2]],
  trophies: -14,
  revenge: 3_600_000,
});

describe('набеги игроков в прогрессе', () => {
  it('набег на меня применяется один раз: запасы, журнал с повтором и местью', () => {
    const p0 = testProgress(2, { res: 2000 });
    const p1 = applyDefense(p0, defense('a1'), NOW);
    const v = villageOf(p1);
    expect(v.res.gold).toBe(1700);
    expect(v.res.wood).toBe(2000);
    expect(v.log![0]).toMatchObject({ id: 'a1', who: 'Вася', trophies: -14, deploys: [{ t: 0 }] });
    expect(canRevenge(v.log![0], NOW)).toBe(true);
    expect(v.pvp!.def).toEqual(['a1']);
    // Повтор ответа сервера ничего не меняет.
    expect(applyDefense(p1, defense('a1'), NOW + 5000)).toBe(p1);
    const inbox: PvpInbox = { me: { trophies: 86, league: 'Бронза', shield: 3_600_000, rank: 4, notify: true }, defenses: [defense('a1'), defense('a2', NOW - 500)], wins: [] };
    const p2 = applyInbox(p1, inbox, NOW);
    expect(villageOf(p2).res.gold).toBe(1400);
    expect(applyInbox(p2, inbox, NOW)).toBe(p2);
    expect(villageOf(p2).pvp).toMatchObject({ trophies: 86, league: 'Бронза', shieldUntil: NOW + 3_600_000 });
    // Отомстил — кнопки больше нет; сервер сказал «поздно» — тоже нет.
    expect(canRevenge(villageOf(markRevenged(p2, 'a2')).log!.find((e) => e.id === 'a2')!, NOW)).toBe(false);
    const late = applyDefense(p2, { ...defense('a1'), revenge: 0 }, NOW);
    expect(canRevenge(villageOf(late).log!.find((e) => e.id === 'a1')!, NOW)).toBe(false);
  });

  it('победа засчитывается один раз: добыча и потраченные отряды', () => {
    const p0 = testProgress(2, { res: 1000, army: { warrior: 20, archer: 10 } });
    const w: PvpWin = { id: 'w1', at: NOW, name: 'Боря', stars: 3, pct: 100, loot: { wood: 100, stone: 50, gold: 25 }, used: { warrior: 20, archer: 4 }, trophies: 25 };
    const p1 = applyWin(p0, w);
    expect(villageOf(p1).res).toMatchObject({ wood: 1100, stone: 1050, gold: 1025 });
    expect(villageOf(p1).army).toMatchObject({ warrior: 0, archer: 6 });
    expect(applyWin(p1, w)).toBe(p1);
  });
});
