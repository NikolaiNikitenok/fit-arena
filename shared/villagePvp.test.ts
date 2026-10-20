import { describe, expect, it } from 'vitest';
import { BOT_TROPHY_MAX, SHIELD_BIG_MS, SHIELD_SMALL_MS, shieldFor, trophyDelta, trophyOffer, villageLeague } from './villagePvp';

describe('кубки набегов', () => {
  it('равные соперники: 25 за разгром, по трети за звезду, 20 за провал', () => {
    const o = trophyOffer(500, 500, 3, 3);
    expect(o).toEqual({ win: 25, loss: 20 });
    expect(trophyDelta(o, 3, 500, 500)).toEqual({ att: 25, def: -25 });
    expect(trophyDelta(o, 1, 500, 500)).toEqual({ att: 8, def: -8 });
    expect(trophyDelta(o, 0, 500, 500)).toEqual({ att: -20, def: 20 });
  });

  it('сильнее соперник и ратуша — больше ставка, в пределах 10–40', () => {
    expect(trophyOffer(500, 900, 3, 3).win).toBe(40);
    expect(trophyOffer(500, 100, 3, 3).win).toBe(10);
    expect(trophyOffer(500, 500, 3, 4).win).toBeGreaterThan(25);
    expect(trophyOffer(500, 500, 4, 3).win).toBeLessThan(25);
    expect(trophyOffer(500, 900, 3, 3).loss).toBe(5);
    expect(trophyOffer(500, 100, 3, 3).loss).toBe(30);
  });

  it('ниже нуля кубков нет; боты дают половину и не выше предела', () => {
    expect(trophyDelta({ win: 25, loss: 20 }, 0, 7, 0)).toEqual({ att: -7, def: 20 });
    expect(trophyDelta({ win: 25, loss: 20 }, 3, 0, 10)).toEqual({ att: 25, def: -10 });
    expect(trophyOffer(500, 500, 3, 3, true)).toEqual({ win: 13, loss: 10 });
    expect(trophyOffer(BOT_TROPHY_MAX, BOT_TROPHY_MAX, 3, 3, true).win).toBe(0);
  });

  it('щит и лиги', () => {
    expect(shieldFor(3, 100)).toBe(SHIELD_BIG_MS);
    expect(shieldFor(1, 55)).toBe(SHIELD_BIG_MS);
    expect(shieldFor(1, 30)).toBe(SHIELD_SMALL_MS);
    expect(shieldFor(0, 40)).toBe(0);
    expect(villageLeague(0).name).toBe('Бронза');
    expect(villageLeague(450).name).toBe('Серебро');
    expect(villageLeague(5000).name).toBe('Легенда');
  });
});
