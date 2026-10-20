import { describe, expect, it } from 'vitest';
import { clanLevel, clanPerks, clanXpNeed } from '../shared/clanLevel';
import { ClanStore, type Clan } from './clans';
import { Guard } from './guard';

const now = Date.parse('2026-10-20T12:00:00+03:00');
const a = { id: 'tg:1', name: 'Аня', level: 5 };
const b = { id: 'tg:2', name: 'Боря', level: 2 };
const c = { id: 'tg:3', name: 'Вика', level: 9 };
const settings = { name: 'Железные', tag: 'жел', description: 'Тренируемся каждый день', open: true, minLevel: 3, flag: '2.1.3.0', country: 'RU', city: 'Казань' };

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
    // До конца подготовки (5 с) удар не засчитывается.
    expect(s.raidHit(a.id, at.attackId, 50, t + 1000)).toMatch(/быстро/);
    expect(s.raidHit(a.id, at.attackId, 9999, (t += 6000))).toMatchObject({ dealt: 120 });
    expect(s.raidHit(a.id, at.attackId, 20, (t += 100))).toMatch(/быстро/);
    s.raidStart(a.id, t);
    s.raidStart(a.id, t);
    expect(s.raidStart(a.id, t)).toMatch(/закончились/);
    // Добиваем босса без лимитов, чтобы проверить победу.
    clan.raid!.damage[a.id] = hpMax - 10;
    clan.raid!.attacks = {};
    s.guard = new Guard(null);
    const at2 = s.raidStart(a.id, t) as { attackId: string };
    const hit = s.raidHit(a.id, at2.attackId, 50, (t += 6000)) as { killed: boolean; dealt: number };
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

  it('флаг и место проверяются, по городу можно найти клан', () => {
    const s = new ClanStore(null);
    const clan = s.create(a, { ...settings, flag: '99.0.0.0', country: 'XX' }, now) as Clan;
    expect(clan.flag).not.toBe('99.0.0.0');
    expect(clan.country).toBe('');
    expect(clan.city).toBe('Казань');
    expect(s.search('казан')).toHaveLength(1);
  });

  it('опыт клана: повторы с дневным пределом, уровни, места и атаки растут', () => {
    const s = new ClanStore(null);
    const clan = s.create(a, settings, now) as Clan;
    s.reps(a.id, 1000, now);
    expect(clan.xp).toBe(300);
    expect(s.reps(a.id, 10, now)).toBeNull();
    expect(s.level(clan)).toBe(2);
    expect(clan.chat.some((m) => /достиг 2 уровня/.test(m.text))).toBe(true);
    expect(clan.members[0].xp).toBe(300);
    // Мест на первом уровне 10, к 30-му — 30.
    expect(clanPerks(1).slots).toBe(10);
    expect(clanPerks(30)).toMatchObject({ slots: 30, attacks: 5 });
    expect(clanLevel(clanXpNeed(1) + clanXpNeed(2)).level).toBe(3);
    expect(clanLevel(1e9)).toMatchObject({ level: 30, need: 0 });
  });
});

describe('гость становится аккаунтом Telegram', () => {
  it('переносит участника и склеивает дубль', () => {
    const s = new ClanStore(null);
    const now = Date.now();
    const leader = { id: 'guest:abcdefgh', name: 'Ник', level: 5 };
    const c = s.create(leader, { name: 'Железные', tag: 'ЖЕЛ', description: '', open: true, minLevel: 1, flag: '', country: '', city: '' }, now) as Clan;
    s.join({ id: 'tg:1', name: 'Ник', level: 5 }, { code: c.code }, now + 1);
    expect(c.members).toHaveLength(2);
    expect(s.adopt('tg:1', 'guest:abcdefgh')).toBe(true);
    expect(c.members).toHaveLength(1);
    expect(c.members[0]).toMatchObject({ id: 'tg:1', role: 'leader' });
    expect(s.clanOf('guest:abcdefgh')).toBeUndefined();
    expect(s.clanOf('tg:1')).toBe(c);
  });
});
