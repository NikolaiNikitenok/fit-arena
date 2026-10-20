// Деревни для тестов набегов: правдоподобная раскладка нужного уровня ратуши.
import type { Bld } from '../shared/village';
import type { TroopId } from '../shared/villageBattle';
import type { Progress } from '../src/game/progress';

export function testProgress(th: number, opts: { army?: Partial<Record<TroopId, number>>; res?: number; towers?: number; pvp?: { def?: string[]; won?: string[] } } = {}): Progress {
  const b: Bld[] = [
    { i: 1, t: 'townhall', x: 10, y: 10, l: th },
    { i: 2, t: 'barracks', x: 2, y: 2, l: Math.min(th, 2) },
    { i: 3, t: 'storage', x: 6, y: 2, l: Math.min(th, 2) },
    { i: 4, t: 'lumbermill', x: 14, y: 2, l: 1, c: 0 },
    { i: 5, t: 'quarry', x: 18, y: 2, l: 1, c: 0 },
  ];
  for (let k = 0; k < (opts.towers ?? 1); k++) b.push({ i: 6 + k, t: 'tower', x: 2 + 4 * k, y: 18, l: 1 });
  const r = opts.res ?? 2000;
  return { savedAt: 1, village: { charge: 0, res: { wood: r, stone: r, gold: r }, b, n: 20, army: opts.army ?? { warrior: 20, archer: 10 }, q: [], pvp: opts.pvp } } as unknown as Progress;
}
