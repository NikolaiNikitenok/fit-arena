import { describe, expect, it } from 'vitest';
import { COMBO_DAMAGE, HIT_DAMAGE, MAX_HP, newBattle, strike, winner } from './battle';

describe('battle', () => {
  it('повтор снимает здоровье у соперника', () => {
    const { battle } = strike(newBattle(), 'player', 0);
    expect(battle.bot.hp).toBe(MAX_HP - HIT_DAMAGE);
    expect(battle.player.hp).toBe(MAX_HP);
  });

  it('каждый третий повтор подряд — комбо', () => {
    let b = newBattle();
    const strikes = [0, 1000, 2000].map((t) => {
      const r = strike(b, 'player', t);
      b = r.battle;
      return r.strike;
    });
    expect(strikes.map((s) => s.combo)).toEqual([false, false, true]);
    expect(b.bot.hp).toBe(MAX_HP - 2 * HIT_DAMAGE - COMBO_DAMAGE);
  });

  it('пауза сбрасывает серию', () => {
    let b = newBattle();
    for (const t of [0, 1000, 10000]) b = strike(b, 'player', t).battle;
    expect(b.player.streak).toBe(1);
  });

  it('нокаут и победа по очкам', () => {
    let b = newBattle();
    for (let i = 0; i < 20; i++) b = strike(b, 'player', i * 10000).battle;
    expect(b.bot.hp).toBe(0);
    expect(winner(b, false)).toBe('player');

    const close = strike(newBattle(), 'bot', 0).battle;
    expect(winner(close, false)).toBeNull();
    expect(winner(close, true)).toBe('bot');
    expect(winner(newBattle(), true)).toBe('draw');
  });
});
