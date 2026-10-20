import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHALLENGE_GAP, CHALLENGE_TTL, FRIENDS_MAX, FriendStore, isQuiet, OUTGOING_MAX } from './friends';
import { type FriendsDeps, friendsApi } from './friendsApi';
import type { FriendsState } from '../shared/protocol';

// Вторник, 12:00 по Москве.
const NOON = Date.parse('2026-10-20T12:00:00+03:00');

function setup(start = NOON) {
  let t = start;
  const clock = { now: () => t, go: (ms: number) => (t += ms) };
  const s = new FriendStore(null, clock.now);
  return { s, clock };
}

describe('друзья: заявки и ссылки', () => {
  it('заявка по коду, ответ, удаление', () => {
    const { s } = setup();
    const a = s.me('tg:1', 'Аня');
    const b = s.me('tg:2', 'Боря');
    expect(a.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(s.request('tg:1', 'nope')).toMatch(/не найден/);
    expect(s.request('tg:1', a.code)).toMatch(/собственный/);
    expect(s.request('tg:1', b.code.toLowerCase())).toEqual({ to: b, friends: false });
    expect(s.request('tg:1', b.code)).toMatch(/уже отправлена/);
    expect(s.outgoing('tg:1').map((r) => r.to.id)).toEqual(['tg:2']);
    expect(s.answer('tg:2', 'tg:1', true)).toBe(a);
    expect(s.areFriends('tg:1', 'tg:2') && s.areFriends('tg:2', 'tg:1')).toBe(true);
    expect(s.outgoing('tg:1')).toEqual([]);
    expect(s.answer('tg:2', 'tg:1', true)).toMatch(/не действует/);
    s.remove('tg:2', 'tg:1');
    expect(s.areFriends('tg:1', 'tg:2')).toBe(false);
  });

  it('отказ и встречные заявки', () => {
    const { s } = setup();
    const a = s.me('tg:1', 'Аня');
    const b = s.me('tg:2', 'Боря');
    s.request('tg:1', b.code);
    s.answer('tg:2', 'tg:1', false);
    expect(s.areFriends('tg:1', 'tg:2')).toBe(false);
    expect(b.requests).toEqual([]);
    // Оба позвали друг друга: дружба сразу.
    s.request('tg:2', a.code);
    expect(s.request('tg:1', b.code)).toEqual({ to: b, friends: true });
    expect(s.areFriends('tg:1', 'tg:2')).toBe(true);
  });

  it('ссылка-приглашение добавляет сразу', () => {
    const { s } = setup();
    const a = s.me('tg:1', 'Аня');
    s.me('tg:2', 'Боря');
    expect(s.acceptInvite('tg:2', 'XXXXXXXXXX')).toMatch(/устарело/);
    expect(s.acceptInvite('tg:1', a.invite)).toMatch(/собственная/);
    expect(s.acceptInvite('tg:2', a.invite.toLowerCase())).toBe(a);
    expect(s.acceptInvite('tg:2', a.invite)).toMatch(/уже у тебя/);
  });

  it('пределы: 100 друзей и 20 неотвеченных заявок', () => {
    const { s } = setup();
    const a = s.me('tg:1', 'Аня');
    for (let i = 0; i < FRIENDS_MAX; i++) {
      s.me(`tg:${100 + i}`, `Друг ${i}`);
      expect(s.acceptInvite(`tg:${100 + i}`, a.invite)).toBe(a);
    }
    s.me('tg:9', 'Лишний');
    expect(s.acceptInvite('tg:9', a.invite)).toMatch(/уже 100 друзей/);
    const { s: s2 } = setup();
    s2.me('tg:1', 'Аня');
    for (let i = 0; i < OUTGOING_MAX; i++) expect(typeof s2.request('tg:1', s2.me(`tg:${100 + i}`, 'X').code)).toBe('object');
    expect(s2.request('tg:1', s2.me('tg:999', 'X').code)).toMatch(/неотвеченных/);
  });

  it('сохраняется в файл и читается обратно', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'friends-')), 'friends.json');
    const s = new FriendStore(file);
    const a = s.me('tg:1', 'Аня');
    s.me('tg:2', 'Боря');
    s.acceptInvite('tg:2', a.invite);
    s.setNotify('tg:2', false);
    s.notify('tg:1', 'привет', 'Друзья', '?tab=friends');
    s.flush();
    const back = new FriendStore(file);
    expect(back.areFriends('tg:1', 'tg:2')).toBe(true);
    expect(back.get('tg:1')?.code).toBe(a.code);
    expect(back.muted('tg:2')).toBe(true);
    expect(back.acceptInvite('tg:2', a.invite)).toMatch(/уже у тебя/);
  });
});

describe('друзья: вызовы и тихие часы', () => {
  it('вызов только друга, не чаще раза в 10 минут, истекает', () => {
    const { s, clock } = setup();
    const a = s.me('tg:1', 'Аня');
    s.me('tg:2', 'Боря');
    s.me('tg:3', 'Вика');
    expect(s.challenge('tg:1', 'tg:3', 'ROOM1', 'pushup')).toMatch(/только друзей/);
    s.acceptInvite('tg:2', a.invite);
    const c = s.challenge('tg:1', 'tg:2', 'ROOM1', 'squat');
    expect(c).toMatchObject({ to: 'tg:2', room: 'ROOM1', state: 'open' });
    expect(s.challengesFor('tg:2')).toHaveLength(1);
    expect(s.challenge('tg:1', 'tg:2', 'ROOM2', 'squat')).toMatch(/через 10 мин/);
    // Ответный вызов — другое направление, его можно.
    expect(typeof s.challenge('tg:2', 'tg:1', 'ROOM3', 'squat')).toBe('object');
    clock.go(CHALLENGE_TTL);
    expect(s.challengesFor('tg:2')).toEqual([]);
    clock.go(CHALLENGE_GAP - CHALLENGE_TTL);
    expect(s.waitMs('tg:1', 'tg:2')).toBe(0);
    const c2 = s.challenge('tg:1', 'tg:2', 'ROOM4', 'pushup');
    expect(s.roomJoined('ROOM4', 'tg:1')).toBeNull();
    expect(s.roomJoined('ROOM4', 'tg:2')).toBe(c2);
    expect(s.challengesFor('tg:2')).toEqual([]);
  });

  it('отказ от вызова', () => {
    const { s } = setup();
    const a = s.me('tg:1', 'Аня');
    s.me('tg:2', 'Боря');
    s.acceptInvite('tg:2', a.invite);
    const c = s.challenge('tg:1', 'tg:2', 'ROOM1', 'pushup');
    if (typeof c === 'string') throw new Error(c);
    expect(s.decline(c.id, 'tg:1')).toBeNull();
    expect(s.decline(c.id, 'tg:2')).toBe(c);
    expect(s.challengesFor('tg:2')).toEqual([]);
  });

  it('тихие часы 22–09 по Москве: несрочное ждёт утра, сутки максимум', () => {
    expect(isQuiet(Date.parse('2026-10-20T21:59:00+03:00'))).toBe(false);
    expect(isQuiet(Date.parse('2026-10-20T22:00:00+03:00'))).toBe(true);
    expect(isQuiet(Date.parse('2026-10-21T08:59:00+03:00'))).toBe(true);
    expect(isQuiet(Date.parse('2026-10-21T09:00:00+03:00'))).toBe(false);
    const { s, clock } = setup(Date.parse('2026-10-20T23:00:00+03:00'));
    s.me('tg:1', 'Аня');
    s.notify('tg:1', 'заявка', 'Ответить', '?tab=friends');
    s.notify('guest:abcdefgh', 'гостям бот не пишет', 'x', '');
    expect(s.takeNotices()).toEqual([]);
    clock.go(10 * 3_600_000);
    expect(s.takeNotices().map((n) => n.text)).toEqual(['заявка']);
    expect(s.takeNotices()).toEqual([]);
    s.setNotify('tg:1', false);
    s.notify('tg:1', 'выключено', 'x', '');
    expect(s.takeNotices()).toEqual([]);
  });
});

describe('друзья: запросы экрана', () => {
  function deps(now = NOON) {
    const { s, clock } = setup(now);
    const sent: { to: string; text: string; query: string }[] = [];
    const told: string[] = [];
    const connected = new Set<string>();
    const blocked = new Set<string>();
    const rooms = new Set<string>();
    let n = 0;
    const d: FriendsDeps = {
      friends: s,
      now: clock.now,
      bot: () => ({ username: 'ArenaNikitenokBot', running: true }),
      cups: (id) => (id === 'tg:2' ? 140 : 0),
      progress: (id) => (id === 'tg:2' ? { days: { '2026-10-19': 60, '2026-10-20': 45 }, stars: { 1: 3 } } : null),
      clanTag: (id) => (id === 'tg:2' ? 'ЖЕЛ' : undefined),
      isPro: (id) => id === 'tg:2',
      connected: (id) => connected.has(id),
      blocked: (id) => blocked.has(id),
      createRoom: () => {
        const code = `R${++n}`;
        rooms.add(code);
        return code;
      },
      roomAlive: (code) => rooms.has(code),
      sendBot: (to, text, _b, query) => sent.push({ to, text, query }),
      tellDuel: (_id, text) => told.push(text),
    };
    const api = (id: string, path: string, body: Record<string, unknown> = {}) => friendsApi(d, `/api/friends${path}`, { id, name: id === 'tg:1' ? 'Аня' : 'Боря' }, body).body as FriendsState & { error?: string; room?: string; note?: string; added?: string };
    return { d, s, clock, api, sent, told, connected, blocked, rooms };
  }

  it('список друзей: уровень, кубки, серия, клан, Pro, в сети', () => {
    const { api, s } = deps();
    const a = api('tg:1', '');
    api('tg:2', '');
    expect(api('tg:2', '/add', { invite: a.invite }).added).toBe('Аня');
    const f = api('tg:1', '').friends[0];
    expect(f).toMatchObject({ id: 'tg:2', name: 'Боря', pro: true, cups: 140, clanTag: 'ЖЕЛ', online: true, lastDay: '2026-10-20' });
    expect(f.level).toBeGreaterThan(1);
    expect(f.streak).toBeGreaterThanOrEqual(1);
    // Владельцу ссылки — сообщение «теперь вы друзья» в очереди.
    expect(s.takeNotices().map((n) => n.to)).toEqual(['tg:1']);
  });

  it('вызов: в сети — карточка, не в сети — бот, ночью и с выключенными уведомлениями — нет', () => {
    const { api, sent, clock, connected, s, rooms, told } = deps();
    const a = api('tg:1', '');
    api('tg:2', '', {});
    api('tg:2', '/add', { invite: a.invite });
    // Боря только что открывал приложение — он в сети.
    const r1 = api('tg:1', '/challenge', { id: 'tg:2', exercise: 'pushup' });
    expect(r1).toMatchObject({ room: 'R1', note: 'app' });
    expect(api('tg:2', '/inbox').challenges[0]).toMatchObject({ name: 'Аня', room: 'R1', exercise: 'pushup' });
    expect(api('tg:1', '/challenge', { id: 'tg:2', exercise: 'pushup' }).error).toMatch(/Новый вызов через 10 мин/);
    expect(api('tg:1', '').friends[0]).toMatchObject({ room: 'R1' });
    // Отказ: вызвавшему сказали.
    api('tg:2', '/decline', { challenge: api('tg:2', '/inbox').challenges[0].id });
    expect(told[0]).toMatch(/Боря сейчас не может/);

    clock.go(CHALLENGE_GAP + 60_000);
    const r2 = api('tg:1', '/challenge', { id: 'tg:2', exercise: 'squat' });
    expect(r2.note).toBe('bot');
    expect(sent[0]).toMatchObject({ to: 'tg:2', query: '?room=R2' });
    expect(sent[0].text).toMatch(/Аня вызывает тебя на дуэль/);

    clock.go(CHALLENGE_GAP);
    s.setNotify('tg:2', false);
    expect(api('tg:1', '/challenge', { id: 'tg:2', exercise: 'squat' }).note).toBe('off');
    s.setNotify('tg:2', true);
    clock.go(CHALLENGE_GAP);
    connected.add('tg:2');
    expect(api('tg:1', '/challenge', { id: 'tg:2', exercise: 'squat' }).note).toBe('app');
    connected.delete('tg:2');
    expect(sent).toHaveLength(1);
    // Комната вызова закрылась: вызов из входящих пропадает (после короткой форы на подключение).
    rooms.clear();
    clock.go(31_000);
    expect(api('tg:2', '/inbox').challenges).toEqual([]);
    expect(api('tg:1', '/challenge', { id: 'tg:2', exercise: 'jump' }).error).toBeDefined();
  });

  it('ночью бот не будит вызовом', () => {
    const { api, sent, clock } = deps(Date.parse('2026-10-20T23:30:00+03:00'));
    const a = api('tg:1', '');
    api('tg:2', '/add', { invite: a.invite });
    clock.go(60_000);
    expect(api('tg:1', '/challenge', { id: 'tg:2', exercise: 'pushup' }).note).toBe('quiet');
    expect(sent).toEqual([]);
  });

  it('заявка по коду: владельцу уходит сообщение, после принятия — отправителю', () => {
    const { api, s } = deps();
    api('tg:1', '');
    const b = api('tg:2', '');
    expect(api('tg:1', '/add', { code: b.code }).outgoing.map((r) => r.id)).toEqual(['tg:2']);
    expect(api('tg:2', '').incoming).toMatchObject([{ id: 'tg:1', name: 'Аня' }]);
    expect(s.takeNotices()).toMatchObject([{ to: 'tg:2' }]);
    expect(api('tg:2', '/answer', { id: 'tg:1', accept: true }).friends.map((f) => f.id)).toEqual(['tg:1']);
    const n = s.takeNotices();
    expect(n).toMatchObject([{ to: 'tg:1', query: '?tab=friends' }]);
    expect(n[0].text).toMatch(/Боря принял твою заявку/);
  });
});
