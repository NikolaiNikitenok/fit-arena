// Кланы и рейды. Храним в JSON-файле, как профили: кланов немного, база пока не нужна.
// Методы возвращают строку с ошибкой, если действие нельзя выполнить: её показываем игроку.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHAT_MAX, COUNTRIES, defaultFlag, parseFlag, type ChatMessage, type ClanListItem, type ClanRole, type ClanSettings, type ClanView, type RaidView } from '../shared/clan';
import { CLAN_REPS_PER_DAY, CLAN_XP_KILL, CLAN_XP_PER_DAMAGE, CLAN_XP_PER_REP, clanLevel, clanPerks } from '../shared/clanLevel';
import { dayOf, RAID_ATTACK_S, RAID_MAX_DAMAGE, RAID_MIN_REP_MS, RAID_PREP_S, raidHp, raidWindow } from '../shared/raid';

interface Member {
  id: string;
  name: string;
  role: ClanRole;
  level: number;
  joinedAt: number;
  xp?: number;
}

interface Raid {
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
  endsAt: number;
  lastAt: number;
  hits: number;
}

const CHAT_KEEP = 100;
const CHAT_GAP_MS = 700;
const RECENT_KEEP = 8;

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const newCode = () => randomBytes(4).toString('base64url').replace(/[-_]/g, 'x').slice(0, 6).toUpperCase();

export class ClanStore {
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

  get(id: string): Clan | undefined {
    return this.clans.get(id);
  }

  private member(c: Clan, id: string) {
    return c.members.find((m) => m.id === id);
  }

  private settings(s: ClanSettings): ClanSettings | string {
    const name = clean(s?.name, 24);
    const tag = clean(s?.tag, 4).toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, '');
    if (name.length < 3) return 'Название клана — хотя бы 3 буквы';
    if (tag.length < 2) return 'Тег клана — 2–4 буквы или цифры';
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
      members: [{ id: who.id, name: who.name, role: 'leader', level: who.level, joinedAt: now }],
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
    c.members.push({ id: who.id, name: who.name, role: 'member', level: who.level, joinedAt: now });
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
  private addXp(c: Clan, playerId: string, xp: number, now: number): void {
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
  reps(playerId: string, reps: number, now: number): Clan | null {
    const c = this.clanOf(playerId);
    if (!c) return null;
    const day = dayOf(now);
    if (c.repsDay?.day !== day) c.repsDay = { day, reps: {} };
    const done = c.repsDay.reps[playerId] ?? 0;
    const add = Math.max(0, Math.min(CLAN_REPS_PER_DAY - done, Math.round(Number(reps) || 0)));
    if (!add) return null;
    c.repsDay.reps[playerId] = done + add;
    this.addXp(c, playerId, add * CLAN_XP_PER_REP, now);
    return c;
  }

  /** Обновить имя и уровень героя участника (приходят при каждом входе). */
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
    if (now - (this.lastChat.get(playerId) ?? 0) < CHAT_GAP_MS) return 'Не так быстро';
    this.lastChat.set(playerId, now);
    return this.push(c, { id: c.nextMsg++, from: playerId, name: m.name, text: body, at: now });
  }

  private system(c: Clan, text: string, now: number): ChatMessage {
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
    return { key: r.key, damage, hpMax: r.hpMax, members: r.members, killed: !!r.killedAt, finished };
  }

  attacksLeft(c: Clan, playerId: string, now: number): number {
    const r = this.raid(c, now);
    return r ? Math.max(0, this.perks(c).attacks - (r.attacks[playerId]?.[dayOf(now)] ?? 0)) : 0;
  }

  raidStart(playerId: string, now: number): { attackId: string; endsAt: number } | string {
    const c = this.clanOf(playerId);
    if (!c) return 'Ты не в клане';
    const r = this.raid(c, now);
    if (!r || !raidWindow(now).active) return 'Рейд начнётся в субботу';
    if (r.killedAt) return 'Босс уже повержен! Забери награду';
    if (this.attacksLeft(c, playerId, now) <= 0) return 'Атаки на сегодня закончились, завтра будут новые';
    const day = dayOf(now);
    r.attacks[playerId] = { ...r.attacks[playerId], [day]: (r.attacks[playerId]?.[day] ?? 0) + 1 };
    for (const [id, a] of this.attacks) if (a.player === playerId || a.endsAt < now) this.attacks.delete(id);
    // Время атаки с запасом на подготовку и задержку сети.
    const endsAt = now + (RAID_PREP_S + RAID_ATTACK_S + 8) * 1000;
    const attack: Attack = { id: randomUUID(), player: playerId, name: this.member(c, playerId)!.name, clan: c.id, endsAt, lastAt: 0, hits: 0 };
    this.attacks.set(attack.id, attack);
    this.save();
    return { attackId: attack.id, endsAt };
  }

  /** Удар по боссу одним повтором. Темп и урон ограничены, чтобы нельзя было подделать. */
  raidHit(playerId: string, attackId: string, damage: number, now: number): { clan: Clan; killed: boolean; dealt: number } | string {
    const a = this.attacks.get(attackId);
    if (!a || a.player !== playerId || now > a.endsAt) return 'Атака закончилась';
    if (now - a.lastAt < RAID_MIN_REP_MS || a.hits >= 120) return 'Слишком быстро';
    const c = this.clans.get(a.clan);
    const r = c && this.raid(c, now);
    if (!c || !r || r.killedAt) return 'Босс уже повержен';
    a.lastAt = now;
    a.hits++;
    const hp = r.hpMax - Object.values(r.damage).reduce((x, y) => x + y, 0);
    const dealt = Math.min(hp, Math.max(1, Math.min(RAID_MAX_DAMAGE, Math.round(Number(damage) || 1))));
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
            .map(([id, damage]) => ({ name: names.get(id) ?? 'Бывший участник', damage, me: id === playerId }))
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
        .map((m) => ({ id: m.id, name: m.name, role: m.role, level: m.level, xp: Math.floor(m.xp ?? 0), raidDamage: r?.damage[m.id] ?? 0, online: online(m.id), me: m.id === playerId })),
      raid: this.raidView(c, playerId, now),
      raidWins: c.raidWins,
      reward: this.reward(c, playerId, now),
    };
  }

  flush(): void {
    if (!this.file || !this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify([...this.clans.values()]));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 1000);
  }
}
