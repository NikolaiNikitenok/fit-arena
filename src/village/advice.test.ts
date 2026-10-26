import { describe, expect, it } from 'vitest';
import { newTown, type Town } from '../../shared/village';
import { adviceCount, builderAdvice, upgradeNow } from './advice';

const rich = (t: Town): Town => ({ ...t, res: { wood: 1e6, stone: 1e6, gold: 1e6 } });

describe('советы строителя', () => {
  it('при пустых складах ничего не горит зелёным', () => {
    const t: Town = { ...newTown(), res: { wood: 0, stone: 0, gold: 0 } };
    const list = builderAdvice(t);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => !a.ok)).toBe(true);
    expect(adviceCount(list)).toBe(0);
  });

  it('ратуша — первый совет, стены и ловушки — в конце', () => {
    const list = builderAdvice(rich(newTown()));
    expect(list[0]).toMatchObject({ kind: 'up', t: 'townhall', ok: true });
    const firstMinor = list.findIndex((a) => a.t === 'wall' || a.t === 'bomb' || a.t === 'snare');
    const lastMajor = list.map((a) => a.t === 'wall' || a.t === 'bomb' || a.t === 'snare').lastIndexOf(false);
    if (firstMinor >= 0) expect(firstMinor).toBeGreaterThan(lastMajor);
  });

  it('стрелок над постройками не больше трёх', () => {
    const t = rich(newTown());
    expect(upgradeNow(builderAdvice(t)).length).toBeLessThanOrEqual(3);
  });

  it('все строители заняты — ничего не советуем сделать сразу', () => {
    const t = rich(newTown());
    const busy: Town = { ...t, b: t.b.map((b) => ({ ...b, u: Date.now() + 1e6 })) };
    expect(builderAdvice(busy).filter((a) => a.ok && a.kind === 'up')).toEqual([]);
  });
});
