// Кланы и рейды. Храним в JSON-файле, как профили: кланов немного, база пока не нужна.
// Методы возвращают строку с ошибкой, если действие нельзя выполнить: её показываем игроку.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHAT_MAX, COUNTRIES, defaultFlag, parseFlag, type ChatMessage, type ClanClaim, type ClanListItem, type ClanRole, type ClanSettings, type ClanView, type RaidView } from '../shared/clan';
import { CLAN_REPS_PER_DAY, CLAN_XP_KILL, CLAN_XP_PER_DAMAGE, CLAN_XP_PER_REP, clanLevel, clanPerks } from '../shared/clanLevel';
import { dayOf, RAID_ATTACK_S, RAID_MAX_DAMAGE, RAID_MIN_REP_MS, RAID_PREP_S, raidHp, raidWindow } from '../shared/raid';
import { paceLimit, repMinMs, robotic } from '../shared/fairPlay';
import { warReward, type WarHistoryItem } from '../shared/war';
import { Guard } from './guard';
import { warAdopt, warReps, warView, type ClanWar } from './wars';
import { BAD_NAME, badName, censor, hasProfanity } from '../shared/profanity';
import { muteText } from '../shared/moderation';
import { SpamGuard } from './moderation';

interface Member {
  id: string;
  name: string;
  role: ClanRole;
  level: number;
  joinedAt: number;
  xp?: number;
  // До какого уровня клана подарки уже выданы: при вступлении — текущий уровень (подарки только за рост при тебе).
  gift?: number;
}

export interface Raid {
  key: string;
  level: number;
  hpMax: number;
  members: number;
  damage: Record<string, number>;
  killedAt: number | null;
  // Атаки игрока по дням: не больше трёх в день.
  attacks: Record<string, Record<string, number>>;
  recent: { name: string; damage: number; at: number }[];
}

export interface Clan {
  id: string;
  name: string;
  tag: string;
  description: string;
  open: boolean;
  minLevel: number;
  flag?: string;
  country?: string;
  city?: string;
  // Опыт клана; уровень считается из него.
  xp?: number;
  // Повторы участников за сегодня: дневной предел опыта.
  repsDay?: { day: string; reps: Record<string, number> };
  code: string;
  members: Member[];
  chat: ChatMessage[];
  nextMsg: number;
  raid: Raid | null;
  raidLevel: number;
  raidWins: number;
  createdAt: number;
  // Какие сообщения бота о рейде уже ушли: по ключу рейда, чтобы после перезапуска не повторять.
  notices?: Record<string, string[]>;
  // Клановые войны (server/wars.ts): запись, текущая или последняя война, счёт побед и история.
  warOn?: boolean;
  war?: ClanWar | null;
  warRecord?: { w: number; l: number; d: number };
  warHistory?: WarHistoryItem[];
  // Глава или заместитель запретил участнику писать в чат: id → до какого времени.
  mutes?: Record<string, number>;
}

export interface Who {
  id: string;
  name: string;
  level: number;
}

interface Attack {
  id: string;
  player: string;
  name: string;
  clan: string;
  startedAt: number;
  endsAt: number;
  lastAt: number;
  hits: number;
  exercise?: string;
  gaps: number[];
  flagged: boolean;
}


const CHAT_KEEP = 100;
const CHAT_GAP_MS = 700;
const RECENT_KEEP = 8;

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const newCode = () => randomBytes(4).toString('base64url').replace(/[-_]/g, 'x').slice(0, 6).toUpperCase();

export class ClanStore {
  // Pro Pass по id игрока: задаёт сервер (server/pro.ts).
  isPro: (id: string) => boolean = () => false;
  // Забранные награды, атаки по игроку и подозрения (server/guard.ts). Сервер подставляет общий, с файлом.
  guard = new Guard(null);
  // Наибольший честный урон за повтор по силе героя из его копии прогресса; null — копии нет.
  maxDamage: (id: string, clan: Clan) => number | null = () => null;
  // Запрет модератора писать в чат (server/moderation.ts) и чёрный список игрока: задаёт сервер.
  mutedUntil: (id: string) => number = () => 0;
  hiddenFor: (id: string) => string[] = () => [];
  private spam = new SpamGuard();
  private clans = new Map<string, Clan>();
  private byPlayer = new Map<string, string>();
  private attacks = new Map<string, Attack>();
  private lastChat = new Map<string, number>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      for (const c of JSON.parse(readFileSync(file, 'utf8')) as Clan[]) this.add(c);
    } catch {
      // Файла ещё нет.
    }
  }

  private add(c: Clan) {
    this.clans.set(c.id, c);
    for (const m of c.members) this.byPlayer.set(m.id, c.id);
  }

  clanOf(playerId: string): Clan | undefined {
    const id = this.byPlayer.get(playerId);
    return id ? this.clans.get(id) : undefined;
  }

  byCode(code: string): Clan | undefined {
    return [...this.clans.values()].find((c) => c.code === code);
  }

  get(id: string): Clan | undefined {
    return this.clans.get(id);
  }

  all(): Clan[] {
    return [...this.clans.values()];
  }

  /** Отметить, что сообщение бота о рейде ушло. Храним только два последних рейда. */
  markNotice(clanId: string, key: string, kind: string): void {
    const c = this.clans.get(clanId);
    if (!c) return;
    const n = (c.notices ??= {});
    if (!(n[key] ??= []).includes(kind)) n[key].push(kind);
    for (const k of Object.keys(n).sort().slice(0, -2)) delete n[k];
    this.save();
  }

  private member(c: Clan, id: string) {
    return c.members.find((m) => m.id === id);
  }

  private settings(s: ClanSettings): ClanSettings | string {
    const name = clean(s?.name, 24);
    const tag = clean(s?.tag, 4).toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, '');
    if (name.length < 3) return 'Название клана — хотя бы 3 буквы';
    if (tag.length < 2) return 'Тег клана — 2–4 буквы или цифры';
    if (badName(name) || badName(tag) || badName(clean(s?.city, 30))) return BAD_NAME;
    if (hasProfanity(clean(s?.description, 200))) return 'Выбери другие слова для описания';
    const taken = [...this.clans.values()].find((c) => c.name.toLowerCase() === name.toLowerCase() || c.tag === tag);
    const flag = typeof s?.flag === 'string' && parseFlag(s.flag) ? s.flag : defaultFlag(tag);
    const country = typeof s?.country === 'string' && s.country in COUNTRIES ? s.country : '';
    return {
      name,
      tag,
      description: clean(s?.description, 200),
      open: s?.open !== false,
      minLevel: Math.max(1, Math.min(99, Math.round(Number(s?.minLevel) || 1))),
      flag,
      country,
      city: clean(s?.city, 30),
      ...(taken ? { taken: taken.id } : {}),
    } as ClanSettings;
  }

  create(who: Who, s: ClanSettings, now: number): Clan | string {
    if (this.clanOf(who.id)) return 'Сначала выйди из своего клана';
    const ok = this.settings(s);
    if (typeof ok === 'string') return ok;
    if ((ok as ClanSettings & { taken?: string }).taken) return 'Клан с таким названием или тегом уже есть';
    const clan: Clan = {
      id: randomUUID(),
      name: ok.name,
      tag: ok.tag,
      description: ok.description,
      open: ok.open,
      minLevel: ok.minLevel,
      flag: ok.flag,
      country: ok.country,
      city: ok.city,
      xp: 0,
      code: newCode(),
      members: [{ id: who.id, name: who.name, role: 'leader', level: who.level, joinedAt: now, gift: 1 }],
      chat: [],
      nextMsg: 1,
      raid: null,
      raidLevel: 1,
      raidWins: 0,
      createdAt: now,
    };
    this.add(clan);
    this.system(clan, `${who.name} основал клан «${clan.name}»`, now);
    this.save();
    return clan;
  }

  update(actor: string, s: ClanSettings): Clan | string {
    const c = this.clanOf(actor);
    if (!c || this.member(c, actor)?.role !== 'leader') return 'Менять клан может только глава';
    const ok = this.settings(s);
    if (typeof ok === 'string') return ok;
    const taken = (ok as ClanSettings & { taken?: string }).taken;
    if (taken && taken !== c.id) return 'Клан с таким названием или тегом уже есть';
    Object.assign(c, { name: ok.name, tag: ok.tag, description: ok.description, open: ok.open, minLevel: ok.minLevel, flag: ok.flag, country: ok.country, city: ok.city });
    this.save();
    return c;
  }

  /** Вступить: в открытый клан — по id, в любой — по коду приглашения. */
  join(who: Who, target: { id?: string; code?: string }, now: number): Clan | string {
    const code = clean(target.code, 12).toUpperCase();
    const c = code ? [...this.clans.values()].find((x) => x.code === code) : target.id ? this.clans.get(target.id) : undefined;
    if (!c) return code ? 'Приглашение устарело или клан распущен' : 'Клан не найден';
    const mine = this.clanOf(who.id);
    if (mine === c) return c;
    if (mine) return 'Сначала выйди из своего клана';
    if (!code && !c.open) return 'Это закрытый клан: вступить можно только по приглашению';
    if (!code && who.level < c.minLevel) return `В этот клан берут с ${c.minLevel} уровня героя`;
    if (c.members.length >= this.perks(c).slots) return 'В клане нет мест: клану нужно подрасти в уровне';
    c.members.push({ id: who.id, name: who.name, role: 'member', level: who.level, joinedAt: now, gift: this.level(c) });
    this.byPlayer.set(who.id, c.id);
    this.system(c, `${who.name} вступил в клан`, now);
    this.save();
    return c;
  }

  /** Выйти. Если уходит глава, клан переходит заместителю или самому давнему участнику. */
  leave(playerId: string, now: number, kickedBy?: string): Clan | null {
    const c = this.clanOf(playerId);
    if (!c) return null;
    const m = this.member(c, playerId)!;
    c.members = c.members.filter((x) => x.id !== playerId);
    this.byPlayer.delete(playerId);
    if (!c.members.length) {
      this.clans.delete(c.id);
      this.save();
      return null;
    }
    if (m.role === 'leader') {
      const next = c.members.find((x) => x.role === 'officer') ?? [...c.members].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      next.role = 'leader';
      this.system(c, `${next.name} теперь глава клана`, now);
    }
    this.system(c, kickedBy ? `${kickedBy} исключил ${m.name}` : `${m.name} покинул клан`, now);
    this.save();
    return c;
  }

  kick(actor: string, target: string, now: number): Clan | string {
    const c = this.clanOf(actor);
    const a = c && this.member(c, actor);
    const t = c && this.member(c, target);
    if (!c || !a || !t || actor === target) return 'Участник не найден';
    const rank = { leader: 2, officer: 1, member: 0 };
    if (rank[a.role] < 1 || rank[a.role] <= rank[t.role]) return 'Исключать могут глава и заместители, и только тех, кто ниже';
    return this.leave(target, now, a.name) ?? 'Клан распущен';
  }

  /** Глава или заместитель записывает клан на войны (или снимает запись со следующих). */
  setWar(actor: string, on: boolean): Clan | string {
    const c = this.clanOf(actor);
    const m = c && this.member(c, actor);
    if (!c || !m) return 'Ты не в клане';
    if (m.role === 'member') return 'Записать клан на войну могут глава и заместители';
    c.warOn = !!on;
    this.save();
    return c;
  }

  setRole(actor: string, target: string, role: ClanRole, now: number): Clan | string {
    const c = this.clanOf(actor);
    const a = c && this.member(c, actor);
    const t = c && this.member(c, target);
    if (!c || !a || !t || actor === target) return 'Участник не найден';
    if (a.role !== 'leader') return 'Назначать может только глава';
    if (role === 'leader') {
      a.role = 'officer';
      t.role = 'leader';
      this.system(c, `${t.name} теперь глава клана`, now);
    } else {
      t.role = role;
      if (role === 'officer') this.system(c, `${t.name} назначен заместителем`, now);
    }
    this.save();
    return c;
  }

  search(q: string): ClanListItem[] {
    const s = clean(q, 24).toLowerCase();
    return [...this.clans.values()]
      .filter((c) => !s || c.name.toLowerCase().includes(s) || c.tag.toLowerCase() === s || (c.city ?? '').toLowerCase().includes(s) || (COUNTRIES[c.country ?? ''] ?? '').toLowerCase().includes(s))
      .sort((a, b) => Number(b.open) - Number(a.open) || b.raidWins - a.raidWins || b.members.length - a.members.length)
      .slice(0, 30)
      .map((c) => ({ id: c.id, name: c.name, tag: c.tag, description: c.description, members: c.members.length, open: c.open, minLevel: c.minLevel, raidWins: c.raidWins, ...this.look(c) }));
  }

  private look(c: Clan) {
    return { flag: c.flag ?? defaultFlag(c.tag), country: c.country ?? '', city: c.city ?? '', xp: Math.floor(c.xp ?? 0) };
  }

  level(c: Clan): number {
    return clanLevel(c.xp ?? 0).level;
  }

  private perks(c: Clan) {
    return clanPerks(this.level(c));
  }

  /** Опыт клану и вкладу участника; при новом уровне — сообщение в чат. */
  addXp(c: Clan, playerId: string, xp: number, now: number): void {
    if (xp <= 0) return;
    const before = this.level(c);
    c.xp = (c.xp ?? 0) + xp;
    const m = this.member(c, playerId);
    if (m) m.xp = (m.xp ?? 0) + xp;
    const after = this.level(c);
    if (after > before) this.system(c, `Клан достиг ${after} уровня! Подарок ждёт каждого`, now);
    this.save();
  }

  /** Повторы из приключения приносят клану опыт, не больше дневного предела на участника. */
  reps(playerId: string, reps: number, now: number, since = now): Clan | null {
    const c = this.clanOf(playerId);
    if (!c) return null;
    const day = dayOf(now);
    if (c.repsDay?.day !== day) c.repsDay = { day, reps: {} };
    const done = c.repsDay.reps[playerId] ?? 0;
    const add = Math.max(0, Math.min(CLAN_REPS_PER_DAY - done, Math.round(Number(reps) || 0)));
    // Очки войны считаются отдельно: у них свой дневной предел. Повторы, накопленные до войны, в неё не идут.
    const war = warReps(c, playerId, reps, now, Math.min(now, Number(since) || now));
    if (war) this.save();
    if (!add) return war ? c : null;
    c.repsDay.reps[playerId] = done + add;
    this.addXp(c, playerId, add * CLAN_XP_PER_REP, now);
    return c;
  }

  /** Обновить имя и уровень героя участника (приходят при каждом входе). */
  /**
   * Игрок вошёл через Telegram, а раньше играл гостем на этом телефоне: переносим гостя в аккаунт.
   * Если оба уже в одном клане (вступил заново), склеиваем в одного участника.
   */
  adopt(id: string, guestId: string): boolean {
    const c = this.clanOf(guestId);
    if (!c || guestId === id) return false;
    const mine = this.clanOf(id);
    if (mine && mine !== c) return false;
    const g = this.member(c, guestId)!;
    const t = this.member(c, id);
    const RANK: Record<ClanRole, number> = { leader: 2, officer: 1, member: 0 };
    if (t) {
      t.xp = (t.xp ?? 0) + (g.xp ?? 0);
      if (RANK[g.role] > RANK[t.role]) t.role = g.role;
      t.joinedAt = Math.min(t.joinedAt, g.joinedAt);
      c.members = c.members.filter((m) => m !== g);
    } else g.id = id;
    this.byPlayer.delete(guestId);
    this.byPlayer.set(id, c.id);
    // Урон в рейде, атаки и сообщения чата тоже переходят к аккаунту.
    if (c.raid) {
      const r = c.raid;
      if (r.damage[guestId]) r.damage[id] = (r.damage[id] ?? 0) + r.damage[guestId];
      delete r.damage[guestId];
      if (r.attacks[guestId]) {
        const mineA = (r.attacks[id] ??= {});
        for (const [day, n] of Object.entries(r.attacks[guestId])) mineA[day] = Math.max(mineA[day] ?? 0, n);
        delete r.attacks[guestId];
      }
    }
    if (c.repsDay?.reps[guestId]) {
      c.repsDay.reps[id] = (c.repsDay.reps[id] ?? 0) + c.repsDay.reps[guestId];
      delete c.repsDay.reps[guestId];
    }
    for (const m of c.chat) if (m.from === guestId) m.from = id;
    warAdopt(c, id, guestId);
    this.save();
    return true;
  }

  touch(who: Who): void {
    const c = this.clanOf(who.id);
    const m = c && this.member(c, who.id);
    if (!m) return;
    if (m.name !== who.name || m.level !== who.level) {
      m.name = who.name;
      m.level = who.level;
      this.save();
    }
  }

  chat(playerId: string, text: string, now: number): ChatMessage | string {
    const c = this.clanOf(playerId);
    const m = c && this.member(c, playerId);
    if (!c || !m) return 'Ты не в клане';
    const body = clean(text, CHAT_MAX);
    if (!body) return 'Пустое сообщение';
    const muted = this.chatMutedUntil(c, playerId, now);
    if (muted) return muteText(muted);
    if (now - (this.lastChat.get(playerId) ?? 0) < CHAT_GAP_MS) return 'Не так быстро';
    const spam = this.spam.check(playerId, body, now);
    if (spam) return spam;
    this.lastChat.set(playerId, now);
    // Мат не блокирует сообщение: слова заменяются на «***».
    return this.push(c, { id: c.nextMsg++, from: playerId, name: m.name, text: censor(body), at: now });
  }

  /** До какого времени игроку нельзя писать в чат клана: запрет модератора или главы. 0 — можно. */
  chatMutedUntil(c: Clan, playerId: string, now: number): number {
    const own = c.mutes?.[playerId] ?? 0;
    if (own && own <= now) {
      delete c.mutes![playerId];
      this.save();
    }
    return Math.max(own > now ? own : 0, this.mutedUntil(playerId));
  }

  /** Глава или заместитель запрещает писать в чат тому, кто ниже: на час или сутки; 0 — снять запрет. */
  mute(actor: string, target: string, hours: number, now: number): Clan | string {
    const c = this.clanOf(actor);
    const a = c && this.member(c, actor);
    const t = c && this.member(c, target);
    if (!c || !a || !t || actor === target) return 'Участник не найден';
    const rank = { leader: 2, officer: 1, member: 0 };
    if (rank[a.role] < 1 || rank[a.role] <= rank[t.role]) return 'Запрещать писать могут глава и заместители, и только тем, кто ниже';
    if (![0, 1, 24].includes(hours)) return 'Можно на 1 час или на сутки';
    const mutes = (c.mutes ??= {});
    if (hours) {
      mutes[target] = now + hours * 3_600_000;
      this.system(c, `${a.name} запретил ${t.name} писать в чат на ${hours === 1 ? 'час' : 'сутки'}`, now);
    } else {
      delete mutes[target];
      this.system(c, `${t.name} снова может писать в чат`, now);
    }
    this.save();
    return c;
  }

  /** Удалить сообщение: своё — любой, чужое — глава и заместители (у тех, кто ниже). */
  deleteMessage(actor: string, msgId: number): Clan | string {
    const c = this.clanOf(actor);
    const a = c && this.member(c, actor);
    const msg = c?.chat.find((x) => x.id === msgId);
    if (!c || !a || !msg || msg.system) return 'Сообщение не найдено';
    if (msg.from !== actor) {
      const rank = { leader: 2, officer: 1, member: 0 };
      const author = this.member(c, msg.from);
      if (rank[a.role] < 1 || (author && rank[a.role] <= rank[author.role])) return 'Удалять чужие сообщения могут глава и заместители';
    }
    c.chat = c.chat.filter((x) => x !== msg);
    this.save();
    return c;
  }

  system(c: Clan, text: string, now: number): ChatMessage {
    return this.push(c, { id: c.nextMsg++, from: '', name: '', text, at: now, system: true });
  }

  private push(c: Clan, msg: ChatMessage): ChatMessage {
    c.chat.push(msg);
    if (c.chat.length > CHAT_KEEP) c.chat.splice(0, c.chat.length - CHAT_KEEP);
    this.save();
    return msg;
  }

  /** Рейд текущих выходных: появляется при первом обращении, здоровье — по составу клана. */
  raid(c: Clan, now: number): Raid | null {
    const w = raidWindow(now);
    if (!w.active) return c.raid?.key === w.key ? c.raid : null;
    if (c.raid?.key !== w.key) {
      c.raid = { key: w.key, level: c.raidLevel, hpMax: raidHp(c.members.length, c.raidLevel), members: c.members.length, damage: {}, killedAt: null, attacks: {}, recent: [] };
      this.save();
    }
    return c.raid;
  }

  /** Награда за последний рейд клана: сам рейд хранится до следующих выходных. */
  private reward(c: Clan, playerId: string, now: number): ClanView['reward'] {
    const r = c.raid;
    const damage = r?.damage[playerId] ?? 0;
    if (!r || damage <= 0) return null;
    const w = raidWindow(now);
    const finished = !!r.killedAt || r.key !== w.key || !w.active;
    return { key: r.key, damage, hpMax: r.hpMax, members: r.members, killed: !!r.killedAt, finished, claimed: this.guard.claimed(playerId, `raid:${r.key}`) };
  }

  /** Забрать награду за рейд: сервер проверяет, что рейд окончен и награда ещё не выдана (в любом клане). */
  claimRaid(playerId: string, now: number): ClanClaim | string {
    const c = this.clanOf(playerId);
    if (!c) return 'Ты не в клане';
    const r = this.reward(c, playerId, now);
    if (!r) return 'Награды за рейд нет';
    if (!r.finished) return 'Рейд ещё идёт';
    if (!this.guard.claim(playerId, `raid:${r.key}`)) return 'Награда уже забрана';
    return { kind: 'raid', key: r.key, damage: r.damage, hpMax: r.hpMax, members: r.members, killed: r.killed, coinBonus: this.perks(c).raidCoins };
  }

  /** Забрать награду за войну: только за законченную войну и при достаточном числе очков. */
  claimWar(playerId: string, now: number): ClanClaim | string {
    const c = this.clanOf(playerId);
    if (!c) return 'Ты не в клане';
    const w = warView(this, c, playerId, now).reward;
    if (!w || !warReward(w.result, w.points, w.mvp)) return 'Награды за войну нет';
    if (!this.guard.claim(playerId, `war:${w.key}`)) return 'Награда уже забрана';
    return { kind: 'war', key: w.key, result: w.result, points: w.points, mvp: w.mvp };
  }

  /**
   * Подарки за уровни клана, выросшие при игроке. Участники, вступившие до этой проверки, ещё без отметки:
   * для них один раз берём уровень с телефона (не ниже 1).
   */
  claimGift(playerId: string, clientFrom: unknown): ClanClaim | string {
    const c = this.clanOf(playerId);
    const m = c && this.member(c, playerId);
    if (!c || !m) return 'Ты не в клане';
    const level = this.level(c);
    const from = Math.min(level, m.gift ?? Math.max(1, Math.round(Number(clientFrom) || level)));
    if (from >= level) return 'Подарок уже забран';
    m.gift = level;
    this.save();
    return { kind: 'gift', clan: c.id, from, to: level };
  }

  attacksLeft(c: Clan, playerId: string, now: number): number {
    const r = this.raid(c, now);
    const day = dayOf(now);
    // Атаки считаются и по игроку: переход в другой клан новых атак не даёт.
    const used = Math.max(r?.attacks[playerId]?.[day] ?? 0, this.guard.attacks(playerId, day));
    return r ? Math.max(0, this.perks(c).attacks - used) : 0;
  }

  raidStart(playerId: string, now: number, exercise?: string): { attackId: string; endsAt: number } | string {
    const c = this.clanOf(playerId);
    if (!c) return 'Ты не в клане';
    const r = this.raid(c, now);
    if (!r || !raidWindow(now).active) return 'Рейд начнётся в субботу';
    if (r.killedAt) return 'Босс уже повержен! Забери награду';
    if (this.attacksLeft(c, playerId, now) <= 0) return 'Атаки на сегодня закончились, завтра будут новые';
    const day = dayOf(now);
    r.attacks[playerId] = { ...r.attacks[playerId], [day]: (r.attacks[playerId]?.[day] ?? 0) + 1 };
    this.guard.addAttack(playerId, day);
    for (const [id, a] of this.attacks) if (a.player === playerId || a.endsAt < now) this.attacks.delete(id);
    // Время атаки с запасом на подготовку и задержку сети.
    const endsAt = now + (RAID_PREP_S + RAID_ATTACK_S + 8) * 1000;
    const attack: Attack = { id: randomUUID(), player: playerId, name: this.member(c, playerId)!.name, clan: c.id, startedAt: now, endsAt, lastAt: 0, hits: 0, exercise, gaps: [], flagged: false };
    this.attacks.set(attack.id, attack);
    this.save();
    return { attackId: attack.id, endsAt };
  }

  /** Подозрительный удар: одна запись за атаку. */
  private flagAttack(a: Attack, kind: string, detail: string, now: number): void {
    if (a.flagged) return;
    a.flagged = true;
    this.guard.flag(a.player, kind, detail, now);
  }

  /**
   * Удар по боссу одним повтором. Проверяем всё, что можно проверить без камеры:
   * удар не раньше конца подготовки, темп по упражнению (shared/fairPlay.ts), не больше ударов, чем влезает в минуту,
   * и урон не больше силы героя из его копии прогресса.
   */
  raidHit(playerId: string, attackId: string, damage: number, now: number): { clan: Clan; killed: boolean; dealt: number } | string {
    const a = this.attacks.get(attackId);
    if (!a || a.player !== playerId || now > a.endsAt) return 'Атака закончилась';
    const fightAt = a.startedAt + RAID_PREP_S * 1000;
    const minMs = repMinMs(a.exercise);
    if (now < fightAt) {
      this.flagAttack(a, 'raidEarly', `${now - a.startedAt} мс после начала`, now);
      return 'Слишком быстро';
    }
    if (now - a.lastAt < RAID_MIN_REP_MS || a.hits >= Math.min(120, paceLimit(RAID_ATTACK_S * 1000, minMs))) return 'Слишком быстро';
    if (a.hits + 1 > paceLimit(now - fightAt, minMs)) {
      this.flagAttack(a, 'raidPace', `${a.hits + 1} за ${Math.round((now - fightAt) / 1000)} с`, now);
      return 'Слишком быстро';
    }
    const c = this.clans.get(a.clan);
    const r = c && this.raid(c, now);
    if (!c || !r || r.killedAt) return 'Босс уже повержен';
    if (a.lastAt) a.gaps.push(now - a.lastAt);
    if (robotic(a.gaps)) this.flagAttack(a, 'raidRobot', `${a.gaps.length} ударов`, now);
    a.lastAt = now;
    a.hits++;
    const hp = r.hpMax - Object.values(r.damage).reduce((x, y) => x + y, 0);
    const cap = Math.min(RAID_MAX_DAMAGE, this.maxDamage(playerId, c) ?? RAID_MAX_DAMAGE);
    const asked = Math.round(Number(damage) || 1);
    if (asked > cap * 1.5 + 5) this.flagAttack(a, 'raidDamage', `${asked} > ${cap}`, now);
    const dealt = Math.min(hp, Math.max(1, Math.min(cap, asked)));
    r.damage[playerId] = (r.damage[playerId] ?? 0) + dealt;
    const last = r.recent[r.recent.length - 1];
    if (last && last.name === a.name && now - last.at < 5000) {
      last.damage += dealt;
      last.at = now;
    } else {
      r.recent.push({ name: a.name, damage: dealt, at: now });
      if (r.recent.length > RECENT_KEEP) r.recent.shift();
    }
    const killed = dealt >= hp;
    // Каждый удар — это повтор, а значит и очко в войне кланов.
    warReps(c, playerId, 1, now);
    this.addXp(c, playerId, dealt * CLAN_XP_PER_DAMAGE, now);
    if (killed) {
      r.killedAt = now;
      c.raidWins++;
      c.raidLevel++;
      this.system(c, `${a.name} нанёс последний удар! Босс повержен, награды ждут всех, кто бился`, now);
      this.addXp(c, '', CLAN_XP_KILL * r.level, now);
    }
    this.save();
    return { clan: c, killed, dealt };
  }

  raidEnd(attackId: string): void {
    this.attacks.delete(attackId);
  }

  raidView(c: Clan, playerId: string, now: number): RaidView {
    const w = raidWindow(now);
    const r = this.raid(c, now);
    const dealt = r ? Object.values(r.damage).reduce((x, y) => x + y, 0) : 0;
    const names = new Map(c.members.map((m) => [m.id, m.name]));
    return {
      key: w.key,
      active: w.active,
      start: w.start,
      end: w.end,
      level: r?.level ?? c.raidLevel,
      hpMax: r?.hpMax ?? raidHp(c.members.length, c.raidLevel),
      hp: r ? Math.max(0, r.hpMax - dealt) : raidHp(c.members.length, c.raidLevel),
      members: r?.members ?? c.members.length,
      killedAt: r?.killedAt ?? null,
      myDamage: r?.damage[playerId] ?? 0,
      attacksLeft: this.attacksLeft(c, playerId, now),
      top: r
        ? Object.entries(r.damage)
            .sort((x, y) => y[1] - x[1])
            .slice(0, 10)
            .map(([id, damage]) => ({ name: names.get(id) ?? 'Бывший участник', damage, me: id === playerId, pro: this.isPro(id) }))
        : [],
      recent: r?.recent ?? [],
    };
  }

  view(c: Clan, playerId: string, online: (id: string) => boolean, now: number): ClanView {
    const r = this.raid(c, now);
    const order = { leader: 0, officer: 1, member: 2 };
    return {
      id: c.id,
      name: c.name,
      tag: c.tag,
      description: c.description,
      open: c.open,
      minLevel: c.minLevel,
      ...this.look(c),
      code: c.code,
      myRole: this.member(c, playerId)?.role ?? 'member',
      members: [...c.members]
        .sort((a, b) => order[a.role] - order[b.role] || (r?.damage[b.id] ?? 0) - (r?.damage[a.id] ?? 0) || b.level - a.level)
        .map((m) => ({ id: m.id, name: m.name, role: m.role, level: m.level, xp: Math.floor(m.xp ?? 0), raidDamage: r?.damage[m.id] ?? 0, online: online(m.id), me: m.id === playerId, pro: this.isPro(m.id), ...((c.mutes?.[m.id] ?? 0) > now ? { mutedUntil: c.mutes![m.id] } : {}) })),
      raid: this.raidView(c, playerId, now),
      raidWins: c.raidWins,
      reward: this.reward(c, playerId, now),
      giftFrom: this.member(c, playerId)?.gift,
      war: this.warViewClaimed(c, playerId, now),
      mutedUntil: this.chatMutedUntil(c, playerId, now) || undefined,
      hidden: this.hiddenFor(playerId),
    };
  }

  private warViewClaimed(c: Clan, playerId: string, now: number) {
    const v = warView(this, c, playerId, now);
    if (v.reward) v.reward.claimed = this.guard.claimed(playerId, `war:${v.reward.key}`);
    return v;
  }

  flush(): void {
    if (!this.file || !this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify([...this.clans.values()]));
    renameSync(`${this.file}.tmp`, this.file);
  }

  save(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 1000);
  }
}
