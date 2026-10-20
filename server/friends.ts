// Друзья: заявки, список и вызовы на дуэль. Храним в JSON-файле, как кланы: игроков немного.
// Методы возвращают строку с ошибкой, если действие нельзя выполнить: её показываем игроку.
//
// Как добавить друга:
//   ссылка-приглашение (startapp=friend-ТОКЕН) — дружба сразу: её владелец сам ею поделился;
//   короткий код вручную — заявка, владелец кода принимает или отклоняет.
//   Если двое отправили заявки друг другу, дружба тоже наступает сразу.
// Вызовы на дуэль живут только в памяти: через 10 минут они всё равно никому не нужны.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Exercise } from '../src/repCounter';

export const FRIENDS_MAX = 100;
// Входящих заявок храним не больше, старые вытесняются.
export const INCOMING_MAX = 50;
// Своих неотвеченных заявок — не больше, чтобы код нельзя было рассылать всем подряд.
export const OUTGOING_MAX = 20;
export const CHALLENGE_TTL = 10 * 60_000;
// Одного друга вызываем не чаще раза в 10 минут.
export const CHALLENGE_GAP = 10 * 60_000;
// «В сети»: приложение открыто и спрашивало сервер недавно.
export const SEEN_ONLINE_MS = 45_000;
// Отложенное ночью сообщение бота живёт сутки, дальше не нужно.
export const NOTICE_TTL = 24 * 3_600_000;

const HOUR = 3_600_000;
const MSK = 3 * HOUR;
// Тихие часы по Москве, как у рейда: с 22:00 до 09:00 бот не пишет о несрочном.
export const QUIET_FROM = 22;
export const QUIET_UNTIL = 9;
export const isQuiet = (now: number): boolean => {
  const h = new Date(now + MSK).getUTCHours();
  return h >= QUIET_FROM || h < QUIET_UNTIL;
};

// Без похожих символов (0/O, 1/I), чтобы код было легко продиктовать.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = (len: number) => {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
};
export const FRIEND_CODE_LEN = 6;
const INVITE_LEN = 10;

export interface FriendPlayer {
  id: string;
  name: string;
  code: string;
  invite: string;
  friends: string[];
  // Входящие заявки: от кого и когда.
  requests: { from: string; at: number }[];
  // Бот не пишет о друзьях и вызовах (переключатель на экране друзей).
  notifyOff?: boolean;
}

/** Сообщение бота, которое ждёт конца тихих часов. */
export interface FriendNotice {
  to: string;
  text: string;
  button: string;
  // Что открыть в приложении: ?tab=friends и т. п.
  query: string;
  at: number;
}

export interface Challenge {
  id: string;
  from: string;
  fromName: string;
  to: string;
  room: string;
  exercise: Exercise;
  at: number;
  expiresAt: number;
  state: 'open' | 'accepted' | 'declined';
}

const cleanName = (s: unknown) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 24) : '') || 'Боец';
export const normCode = (s: unknown) => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) : '');

export class FriendStore {
  // Чёрный список (server/moderation.ts): кто-то из двоих заблокировал другого. Задаёт сервер.
  blocked: (a: string, b: string) => boolean = () => false;
  private players = new Map<string, FriendPlayer>();
  private codes = new Map<string, string>();
  private invites = new Map<string, string>();
  private notices: FriendNotice[] = [];
  private seen = new Map<string, number>();
  private challenges = new Map<string, Challenge>();
  // Когда последний раз вызывали: «от>кому».
  private lastChallenge = new Map<string, number>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (!file) return;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { players?: FriendPlayer[]; notices?: FriendNotice[] };
      for (const p of data.players ?? []) this.add(p);
      this.notices = data.notices ?? [];
    } catch {
      // Файла ещё нет.
    }
  }

  private add(p: FriendPlayer) {
    this.players.set(p.id, p);
    this.codes.set(p.code, p.id);
    this.invites.set(p.invite, p.id);
  }

  get(id: string): FriendPlayer | undefined {
    return this.players.get(id);
  }

  /** Свой профиль друзей: создаётся при первом заходе, имя обновляется каждый раз. */
  me(id: string, name: string): FriendPlayer {
    let p = this.players.get(id);
    if (!p) {
      let code = makeCode(FRIEND_CODE_LEN);
      while (this.codes.has(code)) code = makeCode(FRIEND_CODE_LEN);
      let invite = makeCode(INVITE_LEN);
      while (this.invites.has(invite)) invite = makeCode(INVITE_LEN);
      p = { id, name: cleanName(name), code, invite, friends: [], requests: [] };
      this.add(p);
      this.save();
    } else if (name && p.name !== cleanName(name)) {
      p.name = cleanName(name);
      this.save();
    }
    return p;
  }

  areFriends(a: string, b: string): boolean {
    return !!this.players.get(a)?.friends.includes(b);
  }

  /** Отметка «приложение открыто»: по ней друзья видят, кто в сети. */
  touch(id: string): void {
    this.seen.set(id, this.now());
  }

  seenRecently(id: string): boolean {
    return this.now() - (this.seen.get(id) ?? -Infinity) < SEEN_ONLINE_MS;
  }

  private link(a: FriendPlayer, b: FriendPlayer): string | null {
    if (a.friends.includes(b.id)) return null;
    if (a.friends.length >= FRIENDS_MAX) return `У тебя уже ${FRIENDS_MAX} друзей — больше нельзя`;
    if (b.friends.length >= FRIENDS_MAX) return `У ${b.name} уже ${FRIENDS_MAX} друзей`;
    a.friends.push(b.id);
    b.friends.push(a.id);
    a.requests = a.requests.filter((r) => r.from !== b.id);
    b.requests = b.requests.filter((r) => r.from !== a.id);
    this.save();
    return null;
  }

  /**
   * Заявка по короткому коду. Если тот уже звал нас, дружба наступает сразу.
   * Возвращает владельца кода и что вышло: заявка ушла или вы уже друзья.
   */
  request(fromId: string, code: unknown): { to: FriendPlayer; friends: boolean } | string {
    const me = this.players.get(fromId);
    const to = this.players.get(this.codes.get(normCode(code)) ?? '');
    if (!me) return 'Сначала открой экран друзей';
    if (!to) return 'Игрок с таким кодом не найден';
    if (to.id === me.id) return 'Это твой собственный код';
    if (this.blocked(me.id, to.id)) return 'Этот игрок не принимает заявки';
    if (me.friends.includes(to.id)) return `${to.name} уже у тебя в друзьях`;
    if (me.requests.some((r) => r.from === to.id)) {
      const err = this.link(me, to);
      return err ?? { to, friends: true };
    }
    if (to.requests.some((r) => r.from === me.id)) return `Заявка ${to.name} уже отправлена`;
    if (me.friends.length >= FRIENDS_MAX) return `У тебя уже ${FRIENDS_MAX} друзей — больше нельзя`;
    if (this.outgoing(me.id).length >= OUTGOING_MAX) return 'Слишком много неотвеченных заявок. Подожди, пока на них ответят';
    to.requests.push({ from: me.id, at: this.now() });
    if (to.requests.length > INCOMING_MAX) to.requests.splice(0, to.requests.length - INCOMING_MAX);
    this.save();
    return { to, friends: false };
  }

  /** Вход по ссылке-приглашению: её владелец сам позвал, поэтому дружба сразу. */
  acceptInvite(fromId: string, invite: unknown): FriendPlayer | string {
    const me = this.players.get(fromId);
    const owner = this.players.get(this.invites.get(normCode(invite)) ?? '');
    if (!me) return 'Сначала открой экран друзей';
    if (!owner) return 'Приглашение устарело. Попроси друга прислать новую ссылку';
    if (owner.id === me.id) return 'Это твоя собственная ссылка — отправь её другу';
    if (this.blocked(me.id, owner.id)) return 'Приглашение не действует';
    if (me.friends.includes(owner.id)) return `${owner.name} уже у тебя в друзьях`;
    return this.link(me, owner) ?? owner;
  }

  /** Ответ на заявку. Возвращает того, кто её отправил. */
  answer(meId: string, fromId: string, accept: boolean): FriendPlayer | string {
    const me = this.players.get(meId);
    const from = this.players.get(fromId);
    if (!me || !from || !me.requests.some((r) => r.from === fromId)) return 'Заявка уже не действует';
    if (!accept) {
      me.requests = me.requests.filter((r) => r.from !== fromId);
      this.save();
      return from;
    }
    return this.link(me, from) ?? from;
  }

  /** Отменить свою заявку или удалить друга: связь пропадает у обоих. */
  remove(meId: string, otherId: string): void {
    const me = this.players.get(meId);
    const other = this.players.get(otherId);
    if (me) {
      me.friends = me.friends.filter((f) => f !== otherId);
      me.requests = me.requests.filter((r) => r.from !== otherId);
    }
    if (other) {
      other.friends = other.friends.filter((f) => f !== meId);
      other.requests = other.requests.filter((r) => r.from !== meId);
    }
    this.save();
  }

  /** Игрок попросил удалить свои данные: профиль, связи у друзей, вызовы и сообщения бота. */
  forget(id: string): void {
    const me = this.players.get(id);
    if (me) {
      this.codes.delete(me.code);
      this.invites.delete(me.invite);
      this.players.delete(id);
    }
    for (const p of this.players.values()) {
      p.friends = p.friends.filter((f) => f !== id);
      p.requests = p.requests.filter((r) => r.from !== id);
    }
    for (const [k, c] of this.challenges) if (c.from === id || c.to === id) this.challenges.delete(k);
    this.notices = this.notices.filter((n) => n.to !== id);
    this.seen.delete(id);
    this.save();
  }

  /** Мои заявки, на которые ещё не ответили. */
  outgoing(meId: string): { to: FriendPlayer; at: number }[] {
    const out: { to: FriendPlayer; at: number }[] = [];
    for (const p of this.players.values()) {
      const r = p.requests.find((x) => x.from === meId);
      if (r) out.push({ to: p, at: r.at });
    }
    return out;
  }

  setNotify(id: string, on: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    if (on) delete p.notifyOff;
    else p.notifyOff = true;
    this.save();
  }

  muted(id: string): boolean {
    return !!this.players.get(id)?.notifyOff;
  }

  // --- Вызовы на дуэль ---

  /** Через сколько можно снова вызвать этого друга (0 — уже можно). */
  waitMs(from: string, to: string): number {
    return Math.max(0, (this.lastChallenge.get(`${from}>${to}`) ?? -Infinity) + CHALLENGE_GAP - this.now());
  }

  /** Можно ли вызвать: друзья и прошло 10 минут с прошлого вызова. */
  canChallenge(from: string, to: string): string | null {
    if (!this.areFriends(from, to)) return 'Вызывать можно только друзей';
    if (this.blocked(from, to)) return 'Этот игрок не принимает вызовы';
    const wait = this.waitMs(from, to);
    if (wait > 0) return `Этого друга уже вызывали. Новый вызов через ${Math.ceil(wait / 60_000)} мин.`;
    return null;
  }

  challenge(from: string, to: string, room: string, exercise: Exercise): Challenge | string {
    const err = this.canChallenge(from, to);
    if (err) return err;
    const now = this.now();
    this.prune();
    // Прежний вызов этому же другу заменяется новым.
    for (const c of this.challenges.values()) if (c.from === from && c.to === to) this.challenges.delete(c.id);
    const c: Challenge = { id: randomUUID(), from, fromName: this.players.get(from)?.name ?? 'Боец', to, room, exercise, at: now, expiresAt: now + CHALLENGE_TTL, state: 'open' };
    this.challenges.set(c.id, c);
    this.lastChallenge.set(`${from}>${to}`, now);
    return c;
  }

  /** Открытые вызовы мне. */
  challengesFor(id: string): Challenge[] {
    this.prune();
    return [...this.challenges.values()].filter((c) => c.to === id && c.state === 'open');
  }

  /** Мой открытый вызов этому другу. */
  myChallenge(from: string, to: string): Challenge | undefined {
    this.prune();
    return [...this.challenges.values()].find((c) => c.from === from && c.to === to && c.state === 'open');
  }

  decline(id: string, meId: string): Challenge | null {
    const c = this.challenges.get(id);
    if (!c || c.to !== meId || c.state !== 'open') return null;
    c.state = 'declined';
    return c;
  }

  /** Игрок вошёл в комнату боя: если это вызов ему, вызов принят. */
  roomJoined(room: string, playerId: string): Challenge | null {
    for (const c of this.challenges.values())
      if (c.room === room && c.to === playerId && c.state === 'open') {
        c.state = 'accepted';
        return c;
      }
    return null;
  }

  private prune(): void {
    const now = this.now();
    for (const [id, c] of this.challenges) if (c.expiresAt <= now) this.challenges.delete(id);
    for (const [k, at] of this.lastChallenge) if (at + CHALLENGE_GAP <= now) this.lastChallenge.delete(k);
  }

  // --- Несрочные сообщения бота ---

  /** Поставить сообщение в очередь: уйдёт при ближайшей рассылке вне тихих часов. */
  notify(to: string, text: string, button: string, query: string): void {
    if (!/^tg:\d+$/.test(to) || this.muted(to)) return;
    this.notices.push({ to, text, button, query, at: this.now() });
    if (this.notices.length > 500) this.notices.splice(0, this.notices.length - 500);
    this.save();
  }

  /** Забрать сообщения, которые пора отправить. Ночью — ничего; устаревшие выбрасываем. */
  takeNotices(): FriendNotice[] {
    const now = this.now();
    if (!this.notices.length || isQuiet(now)) return [];
    const out = this.notices.filter((n) => now - n.at < NOTICE_TTL && !this.muted(n.to));
    this.notices = [];
    this.save();
    return out;
  }

  flush(): void {
    if (!this.file || !this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify({ players: [...this.players.values()], notices: this.notices }));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 2000);
  }
}
