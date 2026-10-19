import { describe, expect, it } from 'vitest';
import { ClanStore, type Clan } from './clans';

const now = Date.parse('2026-10-20T12:00:00+03:00');
const a = { id: 'tg:1', name: 'Аня', level: 5 };
const b = { id: 'tg:2', name: 'Боря', level: 2 };
const c = { id: 'tg:3', name: 'Вика', level: 9 };
const settings = { name: 'Железные', tag: 'жел', description: 'Тренируемся каждый день', open: true, minLevel: 3 };

describe('кланы', () => {
  it('создание, вступление по уровню и по приглашению, смена главы', () => {
    const s = new ClanStore(null);
    const clan = s.create(a, settings, now) as Clan;
    expect(clan.tag).toBe('ЖЕЛ');
    expect(s.create(c, settings, now)).toMatch(/уже есть/);
    expect(s.join(b, { id: clan.id }, now)).toMatch(/с 3 уровня/);
    expect(s.join(b, { code: clan.code }, now)).toBe(clan);
    expect(s.join(c, { id: clan.id }, now)).toBe(clan);
    expect(s.kick('tg:2', 'tg:3', now)).toMatch(/Исключать/);
    s.setRole('tg:1', 'tg:3', 'officer', now);
    s.leave('tg:1', now);
    expect(s.clanOf('tg:3')!.members.find((m) => m.id === 'tg:3')!.role).toBe('leader');
    expect(s.kick('tg:3', 'tg:2', now)).toBe(clan);
    expect(s.clanOf('tg:2')).toBeUndefined();
    expect(clan.chat.some((m) => m.system && /исключил/.test(m.text))).toBe(true);
  });

  it('рейд: три атаки в день, урон ограничен, босс падает и даёт награду', () => {
    const s = new ClanStore(null);
    const clan = s.create(a, settings, now) as Clan;
    const hpMax = s.raidView(clan, a.id, now).hpMax;
    let t = now;
    const at = s.raidStart(a.id, t) as { attackId: string };
    expect(s.raidHit(a.id, at.attackId, 9999, (t += 1000))).toMatchObject({ dealt: 120 });
    expect(s.raidHit(a.id, at.attackId, 20, (t += 100))).toMatch(/быстро/);
    s.raidStart(a.id, t);
    s.raidStart(a.id, t);
    expect(s.raidStart(a.id, t)).toMatch(/закончились/);
    // Добиваем босса без лимитов, чтобы проверить победу.
    clan.raid!.damage[a.id] = hpMax - 10;
    clan.raid!.attacks = {};
    const at2 = s.raidStart(a.id, t) as { attackId: string };
    const hit = s.raidHit(a.id, at2.attackId, 50, (t += 1000)) as { killed: boolean; dealt: number };
    expect(hit).toMatchObject({ killed: true, dealt: 10 });
    const v = s.view(clan, a.id, () => true, t);
    expect(v.raid.hp).toBe(0);
    expect(v.reward).toMatchObject({ killed: true, finished: true });
    expect(clan.raidLevel).toBe(2);
  });

  it('чат хранит сообщения и не даёт спамить', () => {
    const s = new ClanStore(null);
    s.create(a, settings, now);
    expect(s.chat(a.id, '  Привет,   клан! ', now)).toMatchObject({ text: 'Привет, клан!' });
    expect(s.chat(a.id, 'ещё', now + 100)).toMatch(/быстро/);
    expect(s.chat(b.id, 'я тут', now)).toMatch(/не в клане/);
  });
});
