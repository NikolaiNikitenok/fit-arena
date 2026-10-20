import { describe, expect, it } from 'vitest';
import { WAR_REPS_PER_DAY, WAR_XP } from '../shared/war';
import { ClanStore, type Clan } from './clans';
import { warNotices } from './warNotices';
import { warPair, warSettle, warTick, warView } from './wars';

const msk = (iso: string) => Date.parse(`${iso}+03:00`);
const KEY = '2026-10-31';
const FRI = msk('2026-10-30T19:00:00');
const SAT = msk('2026-10-31T12:00:00');
const MON = msk('2026-11-02T00:00:00');

let n = 0;
function clan(s: ClanStore, name: string, size: number, at = msk('2026-10-27T12:00:00')): Clan {
  const base = ++n * 100;
  const c = s.create({ id: `tg:${base}`, name: `${name}0`, level: 5 }, { name, tag: name.slice(0, 3).toUpperCase(), description: '', open: true, minLevel: 1, flag: '', country: '', city: '' }, at) as Clan;
  for (let i = 1; i < size; i++) s.join({ id: `tg:${base + i}`, name: `${name}${i}`, level: 5 }, { id: c.id }, at);
  return c;
}
const ids = (c: Clan) => c.members.map((m) => m.id);

describe('война кланов на сервере', () => {
  it('записаться могут глава и заместители; пары — в пятницу 19:00 и один раз', () => {
    const s = new ClanStore(null);
    const a = clan(s, 'Альфа', 4);
    const b = clan(s, 'Бета', 5);
    const c = clan(s, 'Гамма', 3);
    clan(s, 'Дельта', 6); // не записан
    expect(s.setWar(ids(a)[1], true)).toBe('Записать клан на войну могут глава и заместители');
    for (const x of [a, b, c]) expect(typeof s.setWar(ids(x)[0], true)).toBe('object');
    expect(warPair(s, FRI - 60_000)).toEqual([]);
    const paired = warPair(s, FRI);
    expect(paired.map((x) => x.name).sort()).toEqual(['Альфа', 'Бета', 'Гамма']);
    expect(a.war?.opp).toBe(b.id);
    expect(b.war?.opp).toBe(a.id);
    // В зачёт — состав меньшего клана.
    expect(a.war?.counted).toBe(4);
    // Нечётный — с призраком своего размера.
    expect(c.war?.opp).toBe('ghost');
    expect(c.war?.counted).toBe(3);
    expect(c.chat.at(-1)?.text).toContain('Дружина Князя Дивана');
    expect(a.chat.at(-1)?.text).toContain('клан «Бета»');
    // Позже записавшийся в эти выходные не попадает.
    expect(warPair(s, FRI + 3_600_000)).toEqual([]);
    expect(warView(s, a, ids(a)[0], FRI).phase).toBe('paired');
  });

  it('очки — повторы из любого режима и удары по боссу, с дневным пределом и только пятничному составу', () => {
    const s = new ClanStore(null);
    const a = clan(s, 'Север', 3);
    const b = clan(s, 'Южане', 3);
    s.setWar(ids(a)[0], true);
    s.setWar(ids(b)[0], true);
    warPair(s, FRI);
    // До субботы не считаем.
    s.reps(ids(a)[0], 50, FRI + 3_600_000);
    expect(a.war!.points).toEqual({});
    s.reps(ids(a)[0], 250, SAT);
    s.reps(ids(a)[0], 200, SAT + 1000);
    expect(a.war!.points[ids(a)[0]]).toBe(WAR_REPS_PER_DAY);
    // Предел опыта клана уже исчерпан, а удар по боссу всё равно приносит очко... но не сверх дневного предела войны.
    s.reps(ids(a)[1], 10, SAT);
    const atk = s.raidStart(ids(a)[1], SAT) as { attackId: string };
    s.raidHit(ids(a)[1], atk.attackId, 50, SAT + 1000);
    s.raidHit(ids(a)[1], atk.attackId, 50, SAT + 2000);
    expect(a.war!.points[ids(a)[1]]).toBe(12);
    // В воскресенье предел новый.
    s.reps(ids(a)[0], 100, msk('2026-11-01T10:00:00'));
    expect(a.war!.points[ids(a)[0]]).toBe(WAR_REPS_PER_DAY + 100);
    // Вступивший после пар очков не приносит.
    s.join({ id: 'tg:999', name: 'Новичок', level: 5 }, { id: b.id }, SAT);
    s.reps('tg:999', 100, SAT);
    expect(b.war!.points['tg:999']).toBeUndefined();
    const v = warView(s, b, 'tg:999', SAT);
    expect(v.outsider).toBe(true);
    expect(v.phase).toBe('active');
    expect(v.them?.name).toBe('Север');
    expect(v.them?.score).toBe(412);
    expect(v.them?.top[0]).toMatchObject({ name: 'Север0', points: 400 });
  });

  it('итог в понедельник: история, рекорд, опыт клану, награды и MVP', () => {
    const s = new ClanStore(null);
    const a = clan(s, 'Сокол', 3);
    const b = clan(s, 'Ворон', 4);
    s.setWar(ids(a)[0], true);
    s.setWar(ids(b)[0], true);
    warPair(s, FRI);
    s.reps(ids(a)[0], 200, SAT);
    s.reps(ids(a)[1], 100, SAT);
    s.reps(ids(a)[2], 10, SAT);
    // У Ворона четверо, но в зачёт идут трое лучших.
    for (const id of ids(b)) s.reps(id, 90, SAT);
    expect(warSettle(s, MON - 1)).toEqual([]);
    const xpA = a.xp!;
    const xpB = b.xp!;
    expect(warTick(s, MON).map((x) => x.name).sort()).toEqual(['Ворон', 'Сокол']);
    expect(a.war).toMatchObject({ result: 'win', us: 310, them: 270, mvp: ids(a)[0] });
    expect(b.war).toMatchObject({ result: 'lose', us: 270, them: 310 });
    expect(a.warRecord).toEqual({ w: 1, l: 0, d: 0 });
    expect(b.warRecord).toEqual({ w: 0, l: 1, d: 0 });
    expect(a.xp! - xpA).toBe(WAR_XP.win);
    expect(b.xp! - xpB).toBe(WAR_XP.lose);
    expect(a.warHistory?.[0]).toMatchObject({ key: KEY, opp: { name: 'Ворон' }, us: 310, them: 270, result: 'win', mvp: 'Сокол0' });
    // Второй раз не подводим.
    expect(warSettle(s, MON + 60_000)).toEqual([]);
    const v = warView(s, a, ids(a)[0], MON + 60_000);
    expect(v.phase).toBe('ended');
    expect(v.reward).toEqual({ key: KEY, result: 'win', points: 200, mvp: true });
    expect(warView(s, a, ids(a)[2], MON).reward).toMatchObject({ points: 10, mvp: false });
    // В пятницу экран переходит к записи на новую войну.
    expect(warView(s, a, ids(a)[0], msk('2026-11-06T19:00:00')).phase).toBe('signup');
    expect(warView(s, a, ids(a)[0], msk('2026-11-06T19:00:00')).history).toHaveLength(1);
  });

  it('призрак набирает очки по ходу выходных, клан может его обогнать', () => {
    const s = new ClanStore(null);
    const c = clan(s, 'Одиночки', 3);
    s.setWar(ids(c)[0], true);
    warPair(s, FRI);
    expect(c.war?.ghostTarget).toBe(150);
    const mid = warView(s, c, ids(c)[0], msk('2026-11-01T00:00:00'));
    expect(mid.ghost).toBe(true);
    expect(mid.them?.score).toBe(225);
    expect(mid.them?.top.map((t) => t.name)).toEqual(['Князь Диван', 'Тень Дивана', 'Обжора Пончик']);
    for (const id of ids(c)) s.reps(id, 160, SAT);
    warSettle(s, MON);
    expect(c.war).toMatchObject({ result: 'win', us: 480, them: 450 });
  });
});

describe('сообщения бота о войне', () => {
  function war() {
    const s = new ClanStore(null);
    const a = clan(s, 'Медведи', 3);
    const b = clan(s, 'Волки', 3);
    s.join({ id: 'guest:abcdefgh', name: 'Гость', level: 5 }, { id: a.id }, msk('2026-10-27T12:00:00'));
    s.setWar(ids(a)[0], true);
    s.setWar(ids(b)[0], true);
    warPair(s, FRI);
    return { s, a, b };
  }

  it('пара: «Ваш соперник — клан …» всем из Telegram один раз, ночью молчим', () => {
    const { s, a } = war();
    const list = warNotices(s, FRI).filter((x) => x.clanId === a.id);
    expect(list.map((x) => x.kind)).toEqual(['warPair', 'warPair', 'warPair']);
    expect(list[0].text).toContain('Ваш соперник — клан «Волки»');
    expect(list[0].key).toBe(KEY);
    expect(warNotices(s, FRI, (id) => id === ids(a)[1]).filter((x) => x.clanId === a.id)).toHaveLength(2);
    expect(warNotices(s, msk('2026-10-30T23:00:00'))).toEqual([]);
    s.markNotice(a.id, KEY, 'warPair');
    expect(warNotices(s, FRI + 60_000).filter((x) => x.clanId === a.id)).toEqual([]);
    // Ключ общий с рейдом: рейдовые отметки не стираются.
    s.markNotice(a.id, KEY, 'start');
    expect(a.notices?.[KEY]).toEqual(['warPair', 'start']);
  });

  it('воскресенье 17:00: напоминание только отстающему клану и тем, кто не упёрся в предел', () => {
    const { s, a, b } = war();
    for (const c of [a, b]) s.markNotice(c.id, KEY, 'warPair');
    s.reps(ids(b)[0], 300, msk('2026-11-01T10:00:00'));
    s.reps(ids(a)[0], 300, msk('2026-11-01T10:00:00'));
    s.reps(ids(a)[1], 100, msk('2026-11-01T10:00:00'));
    expect(warNotices(s, msk('2026-11-01T16:59:00'))).toEqual([]);
    const list = warNotices(s, msk('2026-11-01T17:00:00'));
    expect(list.every((x) => x.clanId === b.id && x.kind === 'warRemind')).toBe(true);
    // У первого Волка дневной предел уже исчерпан.
    expect(list.map((x) => x.playerId)).toEqual([ids(b)[1], ids(b)[2]]);
    expect(list[0].text).toContain('отстаёт на 100 повторов: 300 : 400');
  });

  it('итог: победа, награда и MVP; через сутки не вспоминаем', () => {
    const { s, a, b } = war();
    s.reps(ids(a)[0], 120, SAT);
    s.reps(ids(a)[1], 10, SAT);
    s.reps(ids(b)[0], 50, SAT);
    warSettle(s, MON);
    const list = warNotices(s, msk('2026-11-02T09:00:00'));
    const mine = list.filter((x) => x.clanId === a.id);
    expect(mine.map((x) => x.kind)).toEqual(['warResult', 'warResult', 'warResult']);
    expect(mine[0].text).toContain('🏆 Победа! Клан «Медведи» выиграл войну у клана «Волки» — 130 : 50');
    expect(mine[0].text).toContain('ты MVP');
    expect(mine[0].text).toContain('420 монет и сундук');
    expect(mine[1].text).toContain('нужно хотя бы 30');
    expect(mine[2].text).toContain('не воевал');
    const theirs = list.find((x) => x.clanId === b.id)!;
    expect(theirs.text).toContain('Война проиграна — 50 : 130');
    expect(theirs.text).toContain('200 монет');
    expect(warNotices(s, msk('2026-11-03T09:00:00'))).toEqual([]);
  });
});

describe('повторы, накопленные до войны', () => {
  it('не идут в очки войны', async () => {
    const { warReps } = await import('./wars');
    const start = Date.parse('2026-10-31T00:00:00+03:00');
    const c = { war: { key: '2026-10-31', roster: { 'tg:1': 1 }, points: {}, days: {} } } as never;
    expect(warReps(c, 'tg:1', 20, start + 3600_000, start - 3600_000)).toBe(0);
    expect(warReps(c, 'tg:1', 20, start + 3600_000, start + 60_000)).toBe(20);
  });
});
