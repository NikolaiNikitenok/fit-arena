import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIT_DAMAGE, MAX_HP } from '../shared/battle';
import type { ServerMessage } from '../shared/protocol';
import { COUNTDOWN_MS, makeCode, ROUND_MS, Room } from './rooms';

function player(id: string) {
  const inbox: ServerMessage[] = [];
  return { id, name: id, send: (m: ServerMessage) => inbox.push(m), inbox };
}
const last = <T extends ServerMessage['type']>(inbox: ServerMessage[], type: T) =>
  inbox.filter((m) => m.type === type).at(-1) as Extract<ServerMessage, { type: T }> | undefined;

describe('Room', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function fightingRoom() {
    const room = new Room('ABCDE', 'pushup');
    const a = player('a');
    const b = player('b');
    room.join(a);
    room.join(b);
    room.ready('a');
    room.ready('b');
    vi.advanceTimersByTime(COUNTDOWN_MS);
    return { room, a, b };
  }

  it('начинает бой, когда оба готовы, и шлёт состояние с точки зрения каждого', () => {
    const { room, a, b } = fightingRoom();
    vi.advanceTimersByTime(1000);
    room.rep('a');
    expect(last(a.inbox, 'state')?.opponent.hp).toBe(MAX_HP - HIT_DAMAGE);
    expect(last(b.inbox, 'state')?.me.hp).toBe(MAX_HP - HIT_DAMAGE);
    expect(last(b.inbox, 'state')?.opponent.hits).toBe(1);
  });

  it('не засчитывает повторы до старта и слишком частые', () => {
    const room = new Room('ABCDE', 'squat');
    const a = player('a');
    room.join(a);
    room.join(player('b'));
    room.rep('a');
    expect(last(a.inbox, 'state')).toBeUndefined();

    const f = fightingRoom();
    f.room.rep('a');
    f.room.rep('a');
    expect(last(f.a.inbox, 'state')?.me.hits).toBe(1);
  });

  it('заканчивает бой по времени', () => {
    const { room, a, b } = fightingRoom();
    room.rep('b');
    vi.advanceTimersByTime(ROUND_MS);
    expect(last(a.inbox, 'end')).toEqual({ type: 'end', result: 'lose', reason: 'time' });
    expect(last(b.inbox, 'end')?.result).toBe('win');
  });

  it('нокаут заканчивает бой досрочно', () => {
    const { room, a } = fightingRoom();
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(2000);
      room.rep('a');
    }
    expect(last(a.inbox, 'end')).toEqual({ type: 'end', result: 'win', reason: 'ko' });
  });

  it('если соперник ушёл во время боя, побеждает оставшийся', () => {
    const { room, a } = fightingRoom();
    room.leave('b');
    expect(last(a.inbox, 'end')?.reason).toBe('left');
    expect(last(a.inbox, 'room')?.players).toHaveLength(1);
  });

  it('третьего не пускает', () => {
    const room = new Room('ABCDE', 'situp');
    room.join(player('a'));
    room.join(player('b'));
    expect(room.join(player('c'))).not.toBeNull();
  });

  it('код из 5 понятных символов', () => {
    expect(makeCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  });
});
