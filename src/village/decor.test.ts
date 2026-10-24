import { describe, expect, it } from 'vitest';
import { canPlaceDecor, claimTheme, decorCtx, decorLock, decorOf, inSeason, placeDecor, removeDecor, themeOf } from './decor';
import { foundTown, townOf } from './state';
import { lifeMap, route } from './Life';
import type { Progress } from '../game/progress';

const base = () => foundTown({ days: {}, stars: {}, coins: 0 } as unknown as Progress, 0);

describe('украшения деревни', () => {
  it('ставится за ресурсы, занимает клетку, убирается с возвратом', () => {
    const p = base();
    const before = townOf(p).res.wood;
    const r = placeDecor(p, 'oak', 1, 1, decorCtx(p, 0));
    if (typeof r === 'string') throw new Error(r);
    expect(townOf(r).res.wood).toBe(before - 40);
    expect(canPlaceDecor(townOf(r), decorOf(r), 1, 1)).toBe(false);
    expect(placeDecor(r, 'bush', 1, 1, decorCtx(r, 0))).toBe('place');
    const back = removeDecor(r, decorOf(r)[0].i);
    expect(townOf(back).res.wood).toBe(before);
    expect(decorOf(back)).toEqual([]);
  });

  it('не встаёт на ратушу; статуи — за рекорды, знамя — в клане', () => {
    const p = base();
    const th = townOf(p).b[0];
    expect(placeDecor(p, 'path', th.x, th.y, decorCtx(p, 0))).toBe('place');
    expect(decorLock('statue1', decorCtx(p, 0))).toMatch(/рекорды/);
    expect(decorLock('clanflag', decorCtx(p, 0))).toMatch(/клан/);
    const gym = { ...p, gym: { best: { squat: {} } } } as unknown as Progress;
    expect(decorLock('statue1', decorCtx(gym, 0))).toBeNull();
  });

  it('тема бесплатна в свой сезон и стоит золота вне его', () => {
    const oct = new Date(2026, 9, 21).getTime();
    const jul = new Date(2026, 6, 1).getTime();
    expect(inSeason('halloween', oct)).toBe(true);
    expect(inSeason('winter', new Date(2027, 0, 10).getTime())).toBe(true);
    expect(inSeason('winter', jul)).toBe(false);
    const p = base();
    const got = claimTheme(p, 'halloween', oct);
    if (typeof got === 'string') throw new Error(got);
    expect(themeOf(got)).toBe('halloween');
    expect(claimTheme(p, 'winter', jul)).toBe('cost');
  });

  it('жители обходят постройки и выбирают дорожки', () => {
    const m = lifeMap([{ i: 1, t: 'townhall', x: 10, y: 10, l: 1, state: 'ok' }], [{ i: 1, k: 'path', x: 5, y: 9 }]);
    const path = route(m, 9 * 24 + 9, 14 * 24 + 14);
    expect(path.length).toBeGreaterThan(0);
    for (const c of path) expect(m.blocked[c]).toBe(0);
  });
});
