import { describe, expect, it } from 'vitest';
import { ClanStore } from './clans';
import { DELETED_NAME, deletePlayer } from './deleteMe';
import { FriendStore } from './friends';
import { SaveStore } from './saves';
import { Store } from './store';
import { Telemetry } from './telemetry';
import { clientAnon } from './telemetry';
import { VillageStore } from './villages';
import { testProgress } from './villages.fixture';

describe('удалить мои данные', () => {
  it('стирает профиль, прогресс, клан, друзей и статистику', () => {
    const now = Date.UTC(2026, 9, 1, 9);
    const store = new Store(null, () => now);
    const saves = new SaveStore(null);
    const clans = new ClanStore(null);
    const friends = new FriendStore(null, () => now);
    const telemetry = new Telemetry(null, () => now, Buffer.alloc(32, 3));
    const me = 'tg:100';
    const other = 'tg:200';

    store.get(me, 'Аня');
    saves.put(me, { savedAt: 1, stars: { 1: 3 } });
    saves.setRemind(me, { hour: 19, tz: 180 });
    const clan = clans.create({ id: other, name: 'Борис', level: 5 }, { name: 'Железные', tag: 'ЖЕЛ', description: '', open: true, minLevel: 1 } as never, now);
    expect(typeof clan).not.toBe('string');
    expect(typeof clans.join({ id: me, name: 'Аня', level: 3 }, { id: (clan as { id: string }).id }, now)).not.toBe('string');
    expect(typeof clans.chat(me, 'привет всем', now)).not.toBe('string');
    const a = friends.me(me, 'Аня');
    const b = friends.me(other, 'Борис');
    friends.request(other, a.code);
    friends.answer(me, other, true);
    expect(friends.areFriends(me, other)).toBe(true);
    telemetry.ingest({ anon: clientAnon(me), events: [{ n: 'app_open' }] }, '1.1.1.1');
    telemetry.ingest({ anon: clientAnon(other), events: [{ n: 'app_open' }] }, '1.1.1.2');
    expect(telemetry.stats(1).dau[0].users).toBe(2);

    const villages = new VillageStore(null, { now: () => now });
    villages.update(me, testProgress(2), 'Аня');
    villages.update(other, testProgress(2), 'Борис');
    expect(villages.get(me)).toBeDefined();

    const r = deletePlayer({ store, saves, clans, friends, telemetry, villages }, me, now);

    expect(store.cupsOf(me)).toBe(0);
    expect(saves.get(me)).toBeUndefined();
    expect(clans.clanOf(me)).toBeUndefined();
    expect(r.clan?.members.map((m) => m.id)).toEqual([other]);
    const chat = clans.clanOf(other)!.chat;
    expect(chat.some((m) => m.from === me || m.name === 'Аня' || m.text.includes('Аня'))).toBe(false);
    expect(chat.some((m) => m.name === DELETED_NAME && m.text === 'привет всем')).toBe(true);
    expect(friends.get(me)).toBeUndefined();
    expect(friends.get(b.id)!.friends).toEqual([]);
    expect(telemetry.stats(1).dau[0].users).toBe(1);
    expect(telemetry.stats(1).totalUsers).toBe(1);
    expect(villages.get(me)).toBeUndefined();
    expect(villages.get(other)).toBeDefined();
  });
});
