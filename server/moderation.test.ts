import { describe, expect, it } from 'vitest';
import { MUTE_FOREVER, muteText } from '../shared/moderation';
import { type Clan, ClanStore } from './clans';
import { FriendStore } from './friends';
import { hasLink, ModerationStore, SPAM_MAX, SPAM_WINDOW_MS, SpamGuard } from './moderation';
import { adminCommand, type ModerationDeps, moderationApi } from './moderationApi';
import { REPORT_LIMIT, ReportStore } from './reports';

const NOON = Date.parse('2026-10-20T12:00:00+03:00');
const settings = { name: 'Железные', tag: 'жел', description: 'Тренируемся каждый день', open: true, minLevel: 1, flag: '2.1.3.0', country: 'RU', city: 'Казань' };
const a = { id: 'tg:1', name: 'Аня', level: 5 };
const b = { id: 'tg:2', name: 'Боря', level: 2 };
const c = { id: 'tg:3', name: 'Вика', level: 9 };

function setup() {
  let t = NOON;
  const now = () => t;
  const go = (ms: number) => (t += ms);
  const mod = new ModerationStore(null, now);
  const reports = new ReportStore(null, now);
  const friends = new FriendStore(null, now);
  friends.blocked = (x, y) => mod.either(x, y);
  const clans = new ClanStore(null);
  clans.mutedUntil = (id) => mod.mutedUntil(id);
  clans.hiddenFor = (id) => mod.blockedBy(id).map((x) => x.id);
  const sent: string[] = [];
  const deps: ModerationDeps = {
    mod,
    reports,
    isAdmin: (id) => id === 'tg:999',
    nameOf: (id) => friends.get(id)?.name ?? clans.clanOf(id)?.members.find((m) => m.id === id)?.name,
    chatMessage: (me, msgId) => {
      const cl = clans.clanOf(me);
      const m = cl?.chat.find((x) => x.id === msgId && !x.system);
      return cl && m && { from: m.from, name: m.name, text: m.text, clan: cl.name };
    },
    unfriend: (x, y) => friends.remove(x, y),
    notifyAdmins: (text) => sent.push(text),
    muted: () => null,
  };
  return { mod, reports, friends, clans, deps, sent, now, go };
}

describe('жалобы', () => {
  it('одна жалоба на игрока в сутки и не больше пяти в час', () => {
    const { reports, go } = setup();
    const r = (target: string) => reports.add({ from: 'tg:1', fromName: 'Аня', target, targetName: 'X', reason: 'mat', where: 'friend' });
    expect(r('tg:1')).toMatch(/себя/);
    expect(r('tg:2')).toMatchObject({ count: 1 });
    expect(r('tg:2')).toMatch(/уже пожаловался/);
    for (let i = 3; i < 3 + REPORT_LIMIT - 1; i++) expect(typeof r(`tg:${i}`)).toBe('object');
    expect(r('tg:50')).toMatch(/Слишком много/);
    go(3_600_000);
    expect(typeof r('tg:50')).toBe('object');
    // Через сутки на того же можно пожаловаться снова.
    go(24 * 3_600_000);
    expect(typeof r('tg:2')).toBe('object');
  });

  it('жалоба на сообщение: текст берёт сервер, админу уходят команды', () => {
    const { clans, deps, sent } = setup();
    const clan = clans.create(a, settings, NOON) as Clan;
    clans.join(b, { id: clan.id }, NOON);
    const msg = clans.chat(b.id, 'ты дурак', NOON + 1000);
    if (typeof msg === 'string') throw new Error(msg);
    const bad = moderationApi(deps, '/api/moderation/report', { id: a.id, name: a.name }, { id: a.id, reason: 'insult', where: 'chat', msg: msg.id });
    expect(bad.body).toMatchObject({ error: 'Сообщение не найдено' });
    const ok = moderationApi(deps, '/api/moderation/report', { id: a.id, name: a.name }, { id: b.id, reason: 'insult', where: 'chat', msg: msg.id });
    expect(ok.body).toMatchObject({ note: expect.stringMatching(/отправлена/) });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('«ты дурак»');
    expect(sent[0]).toContain('/mute_2_1d');
    // Повторная — без нового сообщения админу.
    moderationApi(deps, '/api/moderation/report', { id: a.id, name: a.name }, { id: b.id, reason: 'spam', where: 'chat', msg: msg.id });
    expect(sent).toHaveLength(1);
  });
});

describe('чёрный список', () => {
  it('блок убирает дружбу, запрещает заявки и вызовы, прячет сообщения', () => {
    const { friends, clans, deps, mod } = setup();
    const fa = friends.me(a.id, a.name);
    const fb = friends.me(b.id, b.name);
    friends.request(a.id, fb.code);
    friends.answer(b.id, a.id, true);
    expect(friends.areFriends(a.id, b.id)).toBe(true);
    const r = moderationApi(deps, '/api/moderation/block', { id: a.id, name: a.name }, { id: b.id });
    expect((r.body as { blocked: { id: string; name: string }[] }).blocked).toEqual([expect.objectContaining({ id: b.id, name: 'Боря' })]);
    expect(friends.areFriends(a.id, b.id)).toBe(false);
    expect(friends.request(b.id, fa.code)).toMatch(/не принимает/);
    expect(friends.acceptInvite(b.id, fa.invite)).toMatch(/не действует/);
    expect(friends.canChallenge(b.id, a.id)).toMatch(/только друзей|не принимает/);
    const clan = clans.create(a, settings, NOON) as Clan;
    clans.join(b, { id: clan.id }, NOON);
    expect(clans.view(clan, a.id, () => false, NOON).hidden).toEqual([b.id]);
    expect(clans.view(clan, b.id, () => false, NOON).hidden).toEqual([]);
    expect(mod.block(a.id, a.id, 'я')).toMatch(/себя/);
    moderationApi(deps, '/api/moderation/unblock', { id: a.id, name: a.name }, { id: b.id });
    expect(mod.blockedBy(a.id)).toEqual([]);
    expect(friends.request(b.id, fa.code)).toMatchObject({ friends: false });
  });
});

describe('запрет писать в чат', () => {
  it('глава и заместитель глушат тех, кто ниже, на час или сутки', () => {
    const { clans } = setup();
    const clan = clans.create(a, settings, NOON) as Clan;
    clans.join(b, { id: clan.id }, NOON);
    clans.join(c, { id: clan.id }, NOON);
    expect(clans.mute(b.id, c.id, 1, NOON)).toMatch(/глава и заместители/);
    expect(clans.mute(a.id, b.id, 5, NOON)).toMatch(/1 час/);
    expect(clans.mute(a.id, b.id, 1, NOON)).toBe(clan);
    expect(clans.chat(b.id, 'привет', NOON + 1000)).toBe(muteText(NOON + 3_600_000));
    expect(clans.view(clan, b.id, () => false, NOON).mutedUntil).toBe(NOON + 3_600_000);
    expect(clans.view(clan, a.id, () => false, NOON).members.find((m) => m.id === b.id)?.mutedUntil).toBe(NOON + 3_600_000);
    expect(typeof clans.chat(b.id, 'привет', NOON + 3_600_001)).toBe('object');
    clans.setRole(a.id, c.id, 'officer', NOON);
    expect(clans.mute(c.id, a.id, 24, NOON)).toMatch(/ниже/);
    expect(clans.mute(c.id, b.id, 24, NOON)).toBe(clan);
    expect(clans.mute(c.id, b.id, 0, NOON)).toBe(clan);
    expect(typeof clans.chat(b.id, 'снова тут', NOON + 3_700_000)).toBe('object');
  });

  it('удаление сообщений: своё — любой, чужое — глава и заместители', () => {
    const { clans } = setup();
    const clan = clans.create(a, settings, NOON) as Clan;
    clans.join(b, { id: clan.id }, NOON);
    const ma = clans.chat(a.id, 'я глава', NOON + 1000) as { id: number };
    const mb = clans.chat(b.id, 'я участник', NOON + 2000) as { id: number };
    expect(clans.deleteMessage(b.id, ma.id)).toMatch(/глава и заместители/);
    expect(clans.deleteMessage(a.id, mb.id)).toBe(clan);
    expect(clan.chat.some((m) => m.id === mb.id)).toBe(false);
    expect(clans.deleteMessage(a.id, ma.id)).toBe(clan);
    expect(clans.deleteMessage(a.id, 1)).toMatch(/не найдено/);
  });

  it('модератор глушит командой бота на сутки, неделю, навсегда', () => {
    const { clans, deps, mod, go } = setup();
    const clan = clans.create(a, settings, NOON) as Clan;
    clans.join(b, { id: clan.id }, NOON);
    expect(adminCommand(deps, 1, '/mute_2_1d')).toBeNull();
    expect(adminCommand(deps, 999, '/start')).toBeNull();
    expect(adminCommand(deps, 999, '/mute_2_1d')).toMatch(/Боря: не может писать в чат до 21\.10/);
    expect(clans.chat(b.id, 'а я пишу', NOON + 1000)).toMatch(/^Ты не можешь писать в чат до 21\.10 в 12:00/);
    expect(adminCommand(deps, 999, '/unmute_2')).toMatch(/снова может/);
    expect(typeof clans.chat(b.id, 'а я пишу', NOON + 2000)).toBe('object');
    adminCommand(deps, 999, '/mute 2 7d');
    expect(mod.mutedUntil(b.id)).toBe(NOON + 7 * 24 * 3_600_000);
    go(7 * 24 * 3_600_000);
    expect(mod.mutedUntil(b.id)).toBe(0);
    adminCommand(deps, 999, '/mute_2_forever');
    expect(mod.mutedUntil(b.id)).toBe(MUTE_FOREVER);
    expect(muteText(MUTE_FOREVER)).toMatch(/до решения модератора/);
  });
});

describe('защита чата', () => {
  it('не больше 5 сообщений за 10 секунд и без повторов', () => {
    const g = new SpamGuard();
    for (let i = 0; i < SPAM_MAX; i++) expect(g.check('p', `сообщение ${i}`, NOON + i)).toBeNull();
    expect(g.check('p', 'ещё одно', NOON + 100)).toMatch(/Слишком много/);
    expect(g.check('q', 'другой игрок', NOON + 100)).toBeNull();
    expect(g.check('p', 'ещё одно', NOON + SPAM_WINDOW_MS + 10)).toBeNull();
    expect(g.check('p', 'Ещё одно!', NOON + SPAM_WINDOW_MS + 20)).toMatch(/уже это писал/);
  });

  it('ссылки нельзя, кроме нашего бота', () => {
    for (const t of ['заходи на https://evil.example', 'www.site.com', 'casino.ru бонус', 'vk.com/id1', 't.me/otherbot', 'сайт.рф']) expect(hasLink(t)).toBe(true);
    for (const t of ['зови друзей: t.me/ArenaNikitenokBot', 'https://t.me/ArenaNikitenokBot?start=clan-ABC', 'и т.д.', 'т.е. завтра', 'счёт 5.5', 'Привет!']) expect(hasLink(t)).toBe(false);
  });

  it('мат в чате заменяется, название с матом не принимается', () => {
    const { clans } = setup();
    expect(clans.create(a, { ...settings, name: 'Хуй Ло' }, NOON)).toBe('Выбери другое название');
    expect(clans.create(a, { ...settings, tag: 'бля' }, NOON)).toBe('Выбери другое название');
    expect(clans.create(a, { ...settings, description: 'тут одни пидоры' }, NOON)).toMatch(/описания/);
    const clan = clans.create(a, settings, NOON) as Clan;
    expect(clans.update(a.id, { ...settings, name: 'Сучара' })).toBe('Выбери другое название');
    const m = clans.chat(a.id, 'ну ты и сука', NOON + 1000);
    expect(m).toMatchObject({ text: 'ну ты и ***' });
    expect(clans.chat(a.id, 'смотри https://spam.ru', NOON + 3000)).toMatch(/Ссылки/);
    expect(clan.chat.length).toBe(2);
  });
});
