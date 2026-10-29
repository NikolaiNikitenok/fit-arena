// Запросы экрана друзей: POST /api/friends, /api/friends/{inbox,add,answer,remove,challenge,decline,notify}.
// Всё, что нужно от остального сервера (кубки, клан, комнаты, бот), приходит в deps — так это легко проверить тестами.
//
// Когда бот пишет:
//   вызов на дуэль — срочный: друг в приложении — только карточка в игре; не в сети — сразу сообщение бота
//     с кнопкой в комнату боя. Ночью (22–09 по Москве) не пишем: вызов живёт 10 минут, и утром он никому не нужен,
//     а будить ради него нельзя. Вызвавший видит, что друг не получит сообщение.
//   заявка в друзья и «заявку приняли» — несрочные: в очередь, ночные уходят в 9 утра.
//   Переключатель «Бот пишет о друзьях» и остановленный бот (403) отключают всё.
import type { ChallengeView, FriendRequestView, FriendsState, FriendView } from '../shared/protocol';
import { EXERCISE_LABELS, isRepExercise, type Exercise } from '../src/repCounter';
import { heroLevel, heroXp, streak, type Progress } from '../src/game/progress';
import { type Challenge, CHALLENGE_TTL, type FriendStore, isQuiet } from './friends';
import { isActive, isNewbie, type Referrals } from './referrals';
import { type Lang, tl } from '../src/i18n';

export interface FriendsDeps {
  friends: FriendStore;
  now: () => number;
  bot: () => { username: string | null; running: boolean };
  cups: (id: string) => number;
  progress: (id: string) => Partial<Progress> | null;
  // Уровень героя, проверенный сервером (server/saves.ts); без него — считаем из копии прогресса как есть.
  heroLevel?: (id: string) => number | null;
  clanTag: (id: string) => string | undefined;
  isPro: (id: string) => boolean;
  // На связи по WebSocket (дуэль или клан).
  connected: (id: string) => boolean;
  // Игрок остановил бота: писать нельзя.
  blocked: (id: string) => boolean;
  createRoom: (exercise: Exercise) => string;
  roomAlive: (code: string) => boolean;
  // Срочное сообщение бота: query — адрес внутри приложения (?room=КОД).
  sendBot: (to: string, text: string, button: string, query: string) => void;
  // Сказать вызвавшему, если он ждёт в комнате боя.
  tellDuel: (id: string, text: string) => void;
  // «Приведи друга»: без него награды за приглашения не считаются.
  referrals?: Referrals;
  // На каком языке писать игроку (выбран в игре); без него — по-русски.
  lang?: (id: string) => Lang;
}

const langOf = (d: FriendsDeps, id: string): Lang => d.lang?.(id) ?? 'ru';

export type ChallengeNote = 'app' | 'bot' | 'quiet' | 'off';

const tgOnly = (id: string) => /^tg:\d+$/.test(id);
// Вызов только что создан: вызвавший ещё подключается к комнате, она пустая.
const ROOM_GRACE_MS = 30_000;

function heroOf(d: FriendsDeps, id: string, now: number) {
  const p = d.progress(id);
  const days = p?.days ?? {};
  const level = d.heroLevel?.(id) ?? heroLevel(heroXp({ days, stars: p?.stars ?? {} } as Progress)).level;
  const trained = Object.keys(days).filter((d) => days[d] > 0).sort();
  return { level, lastDay: trained[trained.length - 1] ?? null, streak: trained.length ? streak(days, now, Array.isArray(p?.freezes) ? p.freezes : []).days : 0 };
}

export const isOnline = (d: FriendsDeps, id: string) => d.connected(id) || d.friends.seenRecently(id);

function challengeView(d: FriendsDeps, c: Challenge): ChallengeView {
  return { id: c.id, from: c.from, name: d.friends.get(c.from)?.name ?? c.fromName, pro: d.isPro(c.from) || undefined, exercise: c.exercise, room: c.room, expiresAt: c.expiresAt };
}

/** Открытые вызовы мне, у которых ещё жива комната. */
export function inbox(d: FriendsDeps, id: string): ChallengeView[] {
  const now = d.now();
  return d.friends
    .challengesFor(id)
    .filter((c) => now - c.at < ROOM_GRACE_MS || d.roomAlive(c.room))
    .map((c) => challengeView(d, c));
}

export function friendsState(d: FriendsDeps, id: string, name: string): FriendsState {
  const now = d.now();
  const me = d.friends.me(id, name);
  const request = (pid: string, at: number): FriendRequestView => ({ id: pid, name: d.friends.get(pid)?.name ?? 'Боец', pro: d.isPro(pid) || undefined, level: heroOf(d, pid, now).level, at });
  const friends: FriendView[] = me.friends.map((fid) => {
    const f = d.friends.get(fid);
    const hero = heroOf(d, fid, now);
    const wait = d.friends.waitMs(id, fid);
    const mine = d.friends.myChallenge(id, fid);
    return {
      id: fid,
      name: f?.name ?? 'Боец',
      pro: d.isPro(fid) || undefined,
      level: hero.level,
      cups: d.cups(fid),
      online: isOnline(d, fid),
      lastDay: hero.lastDay,
      streak: hero.streak,
      clanTag: d.clanTag(fid),
      waitMs: wait || undefined,
      room: mine && d.roomAlive(mine.room) ? mine.room : undefined,
    };
  });
  // В сети — выше, дальше по свежести тренировки.
  friends.sort((a, b) => Number(b.online) - Number(a.online) || (b.lastDay ?? '').localeCompare(a.lastDay ?? '') || a.name.localeCompare(b.name));
  return {
    code: me.code,
    invite: me.invite,
    notify: !me.notifyOff,
    bot: d.bot(),
    friends,
    incoming: [...me.requests].reverse().map((r) => request(r.from, r.at)),
    outgoing: d.friends.outgoing(id).map((r) => request(r.to.id, r.at)),
    challenges: inbox(d, id),
    referrals: d.referrals ? referralsOf(d, d.referrals, id) : undefined,
  };
}

function referralsOf(d: FriendsDeps, refs: Referrals, id: string): NonNullable<FriendsState['referrals']> {
  const view = (pid: string) => ({ id: pid, name: d.friends.get(pid)?.name ?? 'Боец', active: isActive(d.progress(pid)) });
  const by = refs.by(id);
  return { brought: refs.brought(id).map((r) => view(r.invitee)), by: by ? view(by.inviter) : null, me: isActive(d.progress(id)) };
}

/** Друга вызвали: решаем, как ему сказать, и говорим. */
export function deliverChallenge(d: FriendsDeps, c: Challenge): ChallengeNote {
  if (isOnline(d, c.to)) return 'app';
  if (!tgOnly(c.to) || d.friends.muted(c.to) || d.blocked(c.to)) return 'off';
  if (isQuiet(d.now())) return 'quiet';
  const name = d.friends.get(c.from)?.name ?? c.fromName;
  const minutes = Math.round(CHALLENGE_TTL / 60_000);
  const l = langOf(d, c.to);
  d.sendBot(c.to, tl(l, '⚔️ {0} вызывает тебя на дуэль!\n\nУпражнение: {1}, кто больше за минуту. Вызов действует {2} минут.', { 0: name, 1: tl(l, EXERCISE_LABELS[c.exercise]).toLowerCase(), 2: minutes }), tl(l, 'Принять вызов'), `?room=${c.room}`);
  return 'bot';
}

type Reply = { status: number; body: unknown };

/** Один запрос экрана друзей от игрока me (уже проверенного). */
export function friendsApi(d: FriendsDeps, path: string, me: { id: string; name: string }, body: Record<string, unknown>): Reply {
  const ok = (extra: object = {}): Reply => ({ status: 200, body: { ...friendsState(d, me.id, me.name), ...extra } });
  const fail = (error: string): Reply => ({ status: 200, body: { ...friendsState(d, me.id, me.name), error } });
  d.friends.touch(me.id);
  const other = typeof body.id === 'string' ? body.id : '';
  switch (path) {
    case '/api/friends':
      return ok();
    case '/api/friends/inbox':
      d.friends.me(me.id, me.name);
      return { status: 200, body: { challenges: inbox(d, me.id) } };
    case '/api/friends/add': {
      d.friends.me(me.id, me.name);
      if (body.invite) {
        const r = d.friends.acceptInvite(me.id, body.invite);
        if (typeof r === 'string') return fail(r);
        // Новичок по ссылке друга: обоим награда, когда он проведёт первый бой.
        if (d.referrals && isNewbie(d.progress(me.id))) d.referrals.add(r.id, me.id, d.now());
        const l = langOf(d, r.id);
        d.friends.notify(r.id, tl(l, '🤝 {0} принял твоё приглашение — теперь вы друзья в NikitenokArena. Вызови на дуэль: кто больше за минуту?', { 0: me.name }), tl(l, 'Друзья'), '?tab=friends');
        return ok({ added: r.name });
      }
      const r = d.friends.request(me.id, body.code);
      if (typeof r === 'string') return fail(r);
      if (r.friends) {
        const l = langOf(d, r.to.id);
        d.friends.notify(r.to.id, tl(l, '🤝 {0} принял твою заявку — теперь вы друзья в NikitenokArena. Вызови на дуэль!', { 0: me.name }), tl(l, 'Друзья'), '?tab=friends');
        return ok({ added: r.to.name });
      }
      const l = langOf(d, r.to.id);
      d.friends.notify(r.to.id, tl(l, '{0} хочет добавить тебя в друзья в NikitenokArena. Друзей можно вызывать на дуэль в один тап.', { 0: me.name }), tl(l, 'Ответить'), '?tab=friends');
      return ok({ requested: r.to.name });
    }
    case '/api/friends/answer': {
      const accept = body.accept !== false;
      const r = d.friends.answer(me.id, other, accept);
      if (typeof r === 'string') return fail(r);
      if (accept) d.friends.notify(r.id, tl(langOf(d, r.id), '🤝 {0} принял твою заявку — теперь вы друзья в NikitenokArena. Вызови на дуэль!', { 0: me.name }), tl(langOf(d, r.id), 'Друзья'), '?tab=friends');
      return ok(accept ? { added: r.name } : {});
    }
    case '/api/friends/remove':
      d.friends.remove(me.id, other);
      return ok();
    case '/api/friends/notify':
      d.friends.setNotify(me.id, body.on !== false);
      return ok();
    case '/api/friends/challenge': {
      const exercise = String(body.exercise) as Exercise;
      if (!isRepExercise(exercise)) return fail('Неизвестное упражнение');
      const err = d.friends.canChallenge(me.id, other);
      if (err) return fail(err);
      const c = d.friends.challenge(me.id, other, d.createRoom(exercise), exercise);
      if (typeof c === 'string') return fail(c);
      return ok({ room: c.room, note: deliverChallenge(d, c) });
    }
    case '/api/friends/decline': {
      const c = d.friends.decline(String(body.challenge ?? ''), me.id);
      if (c) d.tellDuel(c.from, tl(langOf(d, c.from), '{0} сейчас не может принять вызов', { 0: me.name }));
      return { status: 200, body: { challenges: inbox(d, me.id) } };
    }
  }
  return { status: 404, body: { error: 'not found' } };
}
