import { describe, expect, it } from 'vitest';
import { raidBoss, raidWindow } from '../shared/raid';
import { ClanStore, type Clan } from './clans';
import { plural, raidNotices, raidStartNoticeAt } from './raidNotices';

const msk = (iso: string) => Date.parse(`${iso}+03:00`);
const settings = { name: 'Железные', tag: 'жел', description: '', open: true, minLevel: 1, flag: '', country: '', city: '' };
const KEY = '2026-10-31';

function setup() {
  const s = new ClanStore(null);
  const t = msk('2026-10-27T12:00:00');
  const clan = s.create({ id: 'tg:1', name: 'Аня', level: 5 }, settings, t) as Clan;
  s.join({ id: 'tg:2', name: 'Боря', level: 5 }, { id: clan.id }, t);
  s.join({ id: 'tg:3', name: 'Вика', level: 5 }, { id: clan.id }, t);
  // Гостям из браузера бот написать не может.
  s.join({ id: 'guest:abcdefgh', name: 'Гость', level: 5 }, { id: clan.id }, t);
  return { s, clan };
}
const kinds = (list: { kind: string }[]) => list.map((n) => n.kind);

describe('сообщения бота о рейде', () => {
  it('утро открытия рейда: в 10:00 по Москве, даже если рейд открылся в полночь', () => {
    expect(raidStartNoticeAt(msk('2026-10-31T00:00:00'))).toBe(msk('2026-10-31T10:00:00'));
    expect(raidStartNoticeAt(msk('2026-10-19T00:00:00'))).toBe(msk('2026-10-19T10:00:00'));
    expect(raidStartNoticeAt(msk('2026-10-31T14:30:00'))).toBe(msk('2026-10-31T14:30:00'));
    expect(plural(1, 'атака', 'атаки', 'атак')).toBe('атака');
    expect(plural(3, 'атака', 'атаки', 'атак')).toBe('атаки');
    expect(plural(11, 'атака', 'атаки', 'атак')).toBe('атак');
    expect(plural(21, 'час', 'часа', 'часов')).toBe('час');
  });

  it('суббота: «Босс проснулся» всем из Telegram один раз, кроме выключивших', () => {
    const { s, clan } = setup();
    expect(raidNotices(s.all(), msk('2026-10-31T09:59:00'))).toEqual([]);
    const list = raidNotices(s.all(), msk('2026-10-31T10:00:00'));
    expect(list.map((n) => n.chatId)).toEqual([1, 2, 3]);
    expect(kinds(list)).toEqual(['start', 'start', 'start']);
    expect(list[0]).toMatchObject({ key: KEY, clanId: clan.id, button: 'В бой' });
    expect(list[0].text).toContain(raidBoss(KEY).name);
    expect(list[0].text).toContain('рейд 1 уровня');
    expect(list[0].text).toContain('Босс проснулся, клан «Железные» ждёт');
    expect(list[0].text).toContain('3 атаки в день');
    expect(raidNotices(s.all(), msk('2026-10-31T10:00:00'), (id) => id === 'tg:2').map((n) => n.chatId)).toEqual([1, 3]);
    // Отправили — после перезапуска не повторяем.
    s.markNotice(clan.id, KEY, 'start');
    expect(raidNotices(s.all(), msk('2026-10-31T12:00:00'))).toEqual([]);
    expect(clan.notices).toEqual({ [KEY]: ['start'] });
  });

  it('воскресенье 19:00: напоминание только тем, у кого остались атаки', () => {
    const { s, clan } = setup();
    s.markNotice(clan.id, KEY, 'start');
    const sun = msk('2026-11-01T19:00:00');
    expect(raidNotices(s.all(), sun - 60_000)).toEqual([]);
    for (let i = 0; i < 3; i++) s.raidStart('tg:1', sun - 3600_000);
    s.raidStart('tg:2', sun - 3600_000);
    // Субботние атаки на воскресенье не влияют.
    for (let i = 0; i < 3; i++) s.raidStart('tg:3', msk('2026-10-31T15:00:00'));
    const list = raidNotices(s.all(), sun);
    expect(list.map((n) => [n.chatId, n.kind])).toEqual([
      [2, 'remind'],
      [3, 'remind'],
    ]);
    expect(list[0].text).toMatch(/^⏳ До конца рейда 5 часов, у тебя ещё 2 атаки\./);
    expect(list[1].text).toContain('у тебя ещё 3 атаки');
    expect(raidNotices(s.all(), msk('2026-11-01T21:10:00'))[0].text).toContain('До конца рейда 3 часа');
    // После 22:00 тихие часы.
    expect(raidNotices(s.all(), msk('2026-11-01T22:10:00'))).toEqual([]);
    // Позже чем за полчаса до конца уже не пишем.
    expect(raidNotices(s.all(), msk('2026-11-01T23:40:00'))).toEqual([]);
    s.markNotice(clan.id, KEY, 'remind');
    expect(raidNotices(s.all(), msk('2026-11-01T20:00:00'))).toEqual([]);
  });

  it('босс повержен: итог сразу, топ-3, свой урон и ступень награды; без повторов', () => {
    const { s, clan } = setup();
    const t = msk('2026-10-31T18:00:00');
    s.markNotice(clan.id, KEY, 'start');
    const r = s.raid(clan, t)!;
    r.damage = { 'tg:1': 2000, 'tg:2': r.hpMax - 2000 - 300 - 50, 'tg:3': 300, 'guest:abcdefgh': 50 };
    r.killedAt = t;
    r.recent = [{ name: 'Боря', damage: 40, at: t }];
    const list = raidNotices(s.all(), t + 60_000);
    expect(kinds(list)).toEqual(['kill', 'kill', 'kill']);
    const text = list.find((n) => n.chatId === 3)!.text;
    expect(text).toContain(`🏆 ${raidBoss(KEY).name} повержен! Клан «Железные» победил босса 1 уровня. Последний удар — Боря.`);
    expect(text).toMatch(/🥇 Боря — [\d\u00a0]+\n🥈 Аня — 2\u00a0000\n🥉 Вика — 300/);
    expect(text).toContain('Твой урон: 300 — Участник.');
    expect(text).toContain('и сундук');
    expect(list.find((n) => n.chatId === 1)!.text).toContain('Твой урон: 2\u00a0000 — Золото.');
    expect(list[0].button).toBe('Забрать награду');
    // Пока висит победа, напоминание в воскресенье не нужно.
    s.markNotice(clan.id, KEY, 'kill');
    expect(raidNotices(s.all(), msk('2026-11-01T19:00:00'))).toEqual([]);
    expect(raidNotices(s.all(), msk('2026-11-02T00:10:00'))).toEqual([]);
  });

  it('рейд закончился без победы: итог в понедельник, только в первые сутки', () => {
    const { s, clan } = setup();
    const r = s.raid(clan, msk('2026-10-31T18:00:00'))!;
    expect(raidNotices(s.all(), msk('2026-11-02T00:01:00'))).toEqual([]);
    r.damage = { 'tg:1': 900 };
    const end = raidWindow(msk('2026-10-31T12:00:00')).end;
    expect(raidNotices(s.all(), end - 60_000).some((n) => n.kind === 'summary')).toBe(false);
    // Ночью тишина, итог уходит утром.
    expect(raidNotices(s.all(), end + 60_000)).toEqual([]);
    const list = raidNotices(s.all(), end + 9 * 3600_000 + 60_000);
    expect(kinds(list)).toEqual(['summary', 'summary', 'summary']);
    expect(list[0].text).toMatch(/^🛡 Рейд закончился\. .+ устоял: клан «Железные» снял 12% здоровья\./);
    expect(list[0].text).toContain('Весь урон: 900 из 7\u00a0200');
    expect(list[0].text).toContain('Твой урон: 900 — Бронза.');
    expect(list[1].text).toContain('Ты в этот раз не бил босса');
    expect(list[1].button).toBe('Открыть клан');
    expect(raidNotices(s.all(), end + 25 * 3600_000)).toEqual([]);
  });
});

describe('тихие часы', () => {
  it('ночью по Москве ничего не шлём', async () => {
    const { raidNotices } = await import('./raidNotices');
    const night = Date.parse('2026-10-24T03:00:00+03:00');
    expect(raidNotices([], night)).toEqual([]);
  });
});
