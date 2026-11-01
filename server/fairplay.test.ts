// Защита от читов: сервер сам проверяет то, что видят и чем меряются другие игроки.
import { describe, expect, it } from 'vitest';
import { clanXpNeed } from '../shared/clanLevel';
import { paceLimit, REP_MIN_MS, repMinMs, robotic } from '../shared/fairPlay';
import { RAID_PREP_S } from '../shared/raid';
import { claimClanGiftRange, type Progress } from '../src/game/progress';
import { ClanStore, type Clan } from './clans';
import { friendsState, type FriendsDeps } from './friendsApi';
import { FriendStore } from './friends';
import { CLAN_REP_BURST, DUEL_PAIR_PER_DAY, FLAG_LIMIT, Guard } from './guard';
import { DAY_REPS_MAX, FIRST_XP_MAX, plausibleXp, SaveStore, XP_DAY_MAX } from './saves';
import { warPair, warSettle } from './wars';

const msk = (iso: string) => Date.parse(`${iso}+03:00`);
const SAT = msk('2026-10-31T12:00:00');
const PREP = RAID_PREP_S * 1000;
const settings = { name: 'Честные', tag: 'ЧЕС', description: '', open: true, minLevel: 1, flag: '', country: '', city: '' };
const quiet = () => {
  const g = new Guard(null);
  g.log = () => {};
  return g;
};

function store(): ClanStore {
  const s = new ClanStore(null);
  s.guard = quiet();
  return s;
}

describe('темп повторов (shared/fairPlay)', () => {
  it('пресс медленнее отжиманий, у неизвестного упражнения — самый быстрый темп', () => {
    expect(repMinMs('situp')).toBeGreaterThan(repMinMs('pushup'));
    expect(repMinMs('plank')).toBe(REP_MIN_MS.pushup);
    expect(paceLimit(60_000, 400)).toBe(153);
    expect(paceLimit(-5, 400)).toBe(3);
  });

  it('удары как по метроному — скрипт, живой разброс — нет', () => {
    expect(robotic(Array(30).fill(400))).toBe(true);
    expect(robotic(Array.from({ length: 30 }, (_, i) => 420 + ((i * 37) % 90)))).toBe(false);
    expect(robotic(Array(10).fill(400))).toBe(false);
  });
});

describe('рейд: удары проверяет сервер', () => {
  it('до конца подготовки не бьёт, темп и число ударов ограничены, урон — по силе героя', () => {
    const s = store();
    const a = { id: 'tg:1', name: 'Аня', level: 5 };
    s.create(a, settings, SAT);
    s.maxDamage = () => 30;
    const at = s.raidStart(a.id, SAT, 'pushup') as { attackId: string };
    expect(s.raidHit(a.id, at.attackId, 20, SAT + 1000)).toMatch(/быстро/);
    expect(s.raidHit(a.id, at.attackId, 999, SAT + PREP)).toMatchObject({ dealt: 30 });
    // Пачка ударов по 360 мс: часть проходит за счёт запаса, дальше — темп.
    let t = SAT + PREP;
    let ok = 1;
    for (let i = 0; i < 40; i++) if (typeof s.raidHit(a.id, at.attackId, 20, (t += 360)) !== 'string') ok++;
    expect(ok).toBeLessThanOrEqual(paceLimit(t - SAT - PREP, REP_MIN_MS.pushup));
    expect(s.guard.flagCount(a.id)).toBeGreaterThan(0);
  });

  it('нет копии прогресса — предел прежний (RAID_MAX_DAMAGE)', () => {
    const s = store();
    s.create({ id: 'tg:1', name: 'Аня', level: 5 }, settings, SAT);
    const at = s.raidStart('tg:1', SAT, 'squat') as { attackId: string };
    expect(s.raidHit('tg:1', at.attackId, 9999, SAT + PREP)).toMatchObject({ dealt: 120 });
  });

  it('атаки считаются по игроку: переход в другой клан новых не даёт', () => {
    const s = store();
    s.create({ id: 'tg:1', name: 'Аня', level: 5 }, settings, SAT);
    for (let i = 0; i < 3; i++) s.raidStart('tg:1', SAT + i);
    expect(s.raidStart('tg:1', SAT + 10)).toMatch(/закончились/);
    s.leave('tg:1', SAT + 20);
    s.create({ id: 'tg:1', name: 'Аня', level: 5 }, { ...settings, name: 'Другие', tag: 'ДРУ' }, SAT + 30);
    expect(s.raidStart('tg:1', SAT + 40)).toMatch(/закончились/);
  });
});

describe('награды выдаёт сервер', () => {
  it('рейд: только после конца, один раз за неделю — даже из другого клана', () => {
    const s = store();
    const clan = s.create({ id: 'tg:1', name: 'Аня', level: 5 }, settings, SAT) as Clan;
    expect(s.claimRaid('tg:1', SAT)).toMatch(/нет/);
    const at = s.raidStart('tg:1', SAT, 'squat') as { attackId: string };
    s.raidHit('tg:1', at.attackId, 50, SAT + PREP);
    expect(s.claimRaid('tg:1', SAT + PREP)).toMatch(/идёт/);
    const after = msk('2026-11-02T10:00:00');
    expect(s.claimRaid('tg:1', after)).toMatchObject({ kind: 'raid', key: '2026-10-31', damage: 50, killed: false });
    expect(s.view(clan, 'tg:1', () => true, after).reward?.claimed).toBe(true);
    expect(s.claimRaid('tg:1', after)).toMatch(/уже забрана/);
    // Тот же урон, перенесённый в другой клан, второй награды не даёт.
    const raid = clan.raid!;
    s.leave('tg:1', after);
    const other = s.create({ id: 'tg:1', name: 'Аня', level: 5 }, { ...settings, name: 'Другие', tag: 'ДРУ' }, after) as Clan;
    other.raid = { ...raid, damage: { 'tg:1': 50 } };
    expect(s.claimRaid('tg:1', after)).toMatch(/уже забрана/);
  });

  it('война: только участнику с достаточными очками, один раз', () => {
    const s = store();
    const mk = (name: string, base: number) => {
      const c = s.create({ id: `tg:${base}`, name: `${name}0`, level: 5 }, { ...settings, name, tag: name.slice(0, 3).toUpperCase() }, msk('2026-10-27T12:00:00')) as Clan;
      for (let i = 1; i < 3; i++) s.join({ id: `tg:${base + i}`, name: `${name}${i}`, level: 5 }, { id: c.id }, msk('2026-10-27T12:00:00'));
      s.setWar(`tg:${base}`, true);
      return c;
    };
    mk('Сокол', 100);
    mk('Ворон', 200);
    warPair(s, msk('2026-10-30T19:00:00'));
    s.reps('tg:100', 200, SAT);
    s.reps('tg:101', 5, SAT);
    const MON = msk('2026-11-02T00:00:00');
    warSettle(s, MON);
    expect(s.claimWar('tg:100', MON)).toMatchObject({ kind: 'war', result: 'win', points: 200, mvp: true });
    expect(s.claimWar('tg:100', MON)).toMatch(/уже забрана/);
    expect(s.claimWar('tg:101', MON)).toMatch(/нет/);
    expect(s.view(s.clanOf('tg:100')!, 'tg:100', () => true, MON).war?.reward?.claimed).toBe(true);
  });

  it('подарки клана: только за уровни, выросшие при игроке, и один раз', () => {
    const s = store();
    const clan = s.create({ id: 'tg:1', name: 'Аня', level: 5 }, settings, SAT) as Clan;
    clan.xp = clanXpNeed(1) + clanXpNeed(2);
    // Вступил на третьем уровне: подарков за 2 и 3 нет.
    s.join({ id: 'tg:2', name: 'Боря', level: 5 }, { id: clan.id }, SAT);
    expect(s.claimGift('tg:2', 1)).toMatch(/уже забран/);
    expect(s.claimGift('tg:1', 1)).toEqual({ kind: 'gift', clan: clan.id, from: 1, to: 3 });
    expect(s.claimGift('tg:1', 1)).toMatch(/уже забран/);
    expect(s.view(clan, 'tg:2', () => true, SAT).giftFrom).toBe(3);
    // Старый участник без отметки: один раз верим телефону, но не ниже первого уровня.
    delete clan.members[1].gift;
    expect(s.claimGift('tg:2', -50)).toMatchObject({ from: 1, to: 3 });
    expect(s.claimGift('tg:2', 1)).toMatch(/уже забран/);
  });

  it('телефон начисляет подарок по ответу сервера и не дважды', () => {
    const p = { coins: 0, potions: {}, clanGift: { clan: 'c', level: 1 } } as unknown as Progress;
    const once = claimClanGiftRange(p, 'c', 1, 3)!;
    expect(once.coins).toBe(30 + 20 + 30 + 30);
    expect(claimClanGiftRange(once, 'c', 1, 3)).toBeNull();
  });
});

describe('Guard', () => {
  it('повторы клану — не больше, чем успел бы сделать с прошлого отчёта', () => {
    const g = quiet();
    expect(g.clanReps('tg:1', 300, 0)).toBe(300);
    expect(g.clanReps('tg:1', 300, 4000)).toBe(10 + CLAN_REP_BURST);
    expect(g.clanReps('tg:1', 50, 4000 + 60_000)).toBe(50);
    expect(g.flagCount('tg:1')).toBe(1);
    expect(g.clanReps('tg:1', -5, 70_000)).toBe(0);
  });

  it('пара дуэлянтов: не больше DUEL_PAIR_PER_DAY рейтинговых боёв в день', () => {
    const g = quiet();
    const t = msk('2026-10-20T12:00:00');
    for (let i = 0; i < DUEL_PAIR_PER_DAY; i++) expect(g.ratedPair('tg:1', 'tg:2', t + i)).toBe(true);
    expect(g.ratedPair('tg:2', 'tg:1', t + 10)).toBe(false);
    expect(g.ratedPair('tg:1', 'tg:3', t + 10)).toBe(true);
    expect(g.ratedPair('tg:1', 'tg:2', t + 86_400_000)).toBe(true);
  });

  it('подозрение: много нарушений за неделю, старые забываются; гость передаёт всё аккаунту', () => {
    const g = quiet();
    for (let i = 0; i < FLAG_LIMIT - 1; i++) g.flag('guest:x', 'raidPace', '', 1000 + i);
    expect(g.flagged('guest:x', 2000)).toBe(false);
    g.flag('guest:x', 'raidPace', '', 2000);
    expect(g.flagged('guest:x', 3000)).toBe(true);
    expect(g.flagged('guest:x', 2000 + 8 * 86_400_000)).toBe(false);
    g.claim('guest:x', 'raid:2026-10-31');
    g.addAttack('guest:x', '2026-10-31');
    g.adopt('tg:1', 'guest:x');
    expect(g.flagged('tg:1', 3000)).toBe(true);
    expect(g.claimed('tg:1', 'raid:2026-10-31')).toBe(true);
    expect(g.attacks('tg:1', '2026-10-31')).toBe(1);
    expect(g.claim('tg:1', 'raid:2026-10-31')).toBe(false);
  });
});

describe('уровень героя, который видят другие', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');

  it('из правдоподобного: без дат из будущего, дней сверх предела и чужих звёзд', () => {
    expect(plausibleXp({ days: { '2026-10-19': 100, '2026-10-20': 50 }, stars: { 1: 3, 2: 1 } }, now)).toBe(150 + 40);
    expect(plausibleXp({ days: { '2026-10-19': 1e9, '2030-01-01': 500, junk: 99 }, stars: { 999999: 3, '-1': 2, x: 1 } }, now)).toBe(DAY_REPS_MAX);
    expect(plausibleXp(null, now)).toBe(0);
  });

  it('повторы «посчитал сам» опыта не дают', () => {
    expect(plausibleXp({ days: { '2026-10-19': 100, '2026-10-20': 50 }, manual: { '2026-10-19': 60, '2026-10-20': 80 } }, now)).toBe(40);
  });

  it('растёт не быстрее XP_DAY_MAX в день, первая копия — не больше FIRST_XP_MAX', () => {
    const clips: string[] = [];
    const s = new SaveStore(null);
    s.onClip = (id) => clips.push(id);
    const days = (n: number, per: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [new Date(now - (i + 1) * 86_400_000).toISOString().slice(0, 10), per]));
    s.put('tg:1', { days: days(30, 100), savedAt: 1 }, now);
    expect(s.publicXp('tg:1')).toBe(3000);
    // Тем же днём «нашлось» ещё 60 дней по 3000 повторов: видно только дневной предел.
    s.put('tg:1', { days: days(90, 3000), savedAt: 2 }, now);
    expect(s.publicXp('tg:1')).toBe(3000 + XP_DAY_MAX);
    expect(clips).toEqual(['tg:1']);
    // Через два дня предел вырос на два дня.
    s.put('tg:1', { days: days(90, 3000), savedAt: 3 }, now + 2 * 86_400_000);
    expect(s.publicXp('tg:1')).toBe(3000 + 3 * XP_DAY_MAX);
    s.put('tg:2', { days: days(400, 3000), savedAt: 1 }, now);
    expect(s.publicXp('tg:2')).toBe(FIRST_XP_MAX);
    expect(s.heroLevel('tg:3')).toBeNull();
  });

  it('список друзей показывает проверенный уровень, а не тот, что в копии', () => {
    const friends = new FriendStore(null);
    friends.me('tg:1', 'Аня');
    const bo = friends.me('tg:2', 'Боря');
    friends.acceptInvite('tg:1', bo.invite);
    const deps = {
      friends,
      now: () => now,
      bot: () => ({ username: null, running: false }),
      cups: () => 0,
      progress: () => ({ days: { '2026-10-19': 1e9 }, stars: {} }),
      heroLevel: () => 7,
      clanTag: () => undefined,
      isPro: () => false,
      connected: () => false,
      blocked: () => false,
      createRoom: () => 'ABCDE',
      roomAlive: () => false,
      sendBot: () => {},
      tellDuel: () => {},
    } as unknown as FriendsDeps;
    expect(friendsState(deps, 'tg:1', 'Аня').friends[0]?.level).toBe(7);
  });
});
