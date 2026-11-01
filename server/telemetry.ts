// Отчёты об ошибках и анонимная статистика: всё на нашем сервере, без сторонних сервисов.
//   TELEMETRY_FILE — где хранить (по умолчанию data/telemetry.json рядом с профилями)
// Сырые события не копятся: сразу раскладываем по дневным счётчикам. Игрок виден только как
// анонимный id: телефон присылает хеш своего id, а мы ещё раз хешируем его секретным ключом.
// Ключ лежит отдельно (telemetry.key рядом с файлом) и никуда не уходит.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { anonSource } from '../shared/anon';

/** События клиента. Новое событие — сначала сюда, иначе сервер его не примет. */
export const EVENTS = ['app_open', 'onb_step', 'onb_done', 'mission_start', 'mission_win', 'mission_lose', 'camera_granted', 'camera_denied', 'duel_start', 'raid_start', 'program_start', 'event_start', 'dungeon_start', 'dungeon_win', 'dungeon_lose', 'recap_open', 'recap_share', 'home_shortcut', 'share_chat', 'emoji_status', 'manual_start', 'first_rep', 'unlock', 'letter_open', 'gift_claim', 'weekly_card', 'ghost_fight', 'village_th2', 'balance', 'group_join', 'group_create', 'invite_card', 'offer_seen', 'buy_tap', 'buy_result', 'offer_popup'] as const;
export type EventName = (typeof EVENTS)[number];

/** Шаги воронки: бит в карточке игрока. */
export const FUNNEL = [
  { bit: 0, label: 'Открыли приложение' },
  { bit: 1, label: 'Дошли до шага про камеру' },
  { bit: 2, label: 'Закончили знакомство' },
  { bit: 3, label: 'Разрешили камеру' },
  { bit: 4, label: 'Начали первое испытание' },
  { bit: 5, label: 'Прошли первое испытание' },
  { bit: 7, label: 'Дуэль, рейд, программа или событие' },
  { bit: 6, label: 'Вернулись в другой день' },
] as const;

const DAY_MS = 86_400_000;
const MSK_MS = 3 * 3_600_000;
// Дни храним полтора месяца: график за 30 дней и удержание D7 для последних когорт.
const KEEP_DAYS = 45;
const KEEP_USERS_DAYS = 120;
const MAX_GROUPS = 200;
const MAX_STACK = 1200;
const MAX_DAY_KEYS = 200;
const MAX_ACTIVE = 50_000;
// Источников больше этого — уже не метки рекламы, а мусор: всё новое идёт в other.
const MAX_SOURCES = 50;
// Игрок «ушёл», если не заходил столько дней.
export const GONE_DAYS = 3;
export const ALERT_PER_HOUR = 5;
export const TELEMETRY_MAX_BYTES = 32 * 1024;

/** Номер дня и дата по Москве: отчёты и графики владельцу удобнее в его времени. */
export const mskDay = (t: number) => Math.floor((t + MSK_MS) / DAY_MS);
export const dayDate = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

export interface ErrorSample {
  stack: string;
  version: string;
  platform: string;
  ua: string;
  screen: string;
  lowPower: boolean;
  path: string;
}

export interface ErrorGroup {
  fp: string;
  kind: string;
  message: string;
  frame: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  // Счёт за текущий час: из него приходит тревога в бота.
  hour: { start: number; n: number };
  alerted?: boolean;
  versions: string[];
  sample: ErrorSample;
}

interface Day {
  day: number;
  active: string[];
  newUsers: number;
  errors: number;
  events: Record<string, number>;
}

// f — первый день, l — последний, s — пройденные шаги воронки (биты),
// o — откуда пришёл (метка первого входа), m — самый дальний пройденный уровень.
interface UserRec {
  f: number;
  l: number;
  s: number;
  o?: string;
  m?: number;
}

/** Метка источника с телефона: латиница, цифры, _ и -, до 24 знаков. */
export const cleanSource = (v: unknown): string | null => (typeof v === 'string' && /^[\w-]{1,24}$/.test(v) ? v.toLowerCase() : null);

/** Группы «до какого уровня дошли». */
export const REACH = [
  { label: 'Ни одного уровня', to: 0 },
  { label: '1 уровень', to: 1 },
  { label: '2 уровня', to: 2 },
  { label: '3 уровня', to: 3 },
  { label: '4–5', to: 5 },
  { label: '6–10', to: 10 },
  { label: '11–20', to: 20 },
  { label: '21–50', to: 50 },
  { label: '51–100', to: 100 },
  { label: 'Больше 100', to: Infinity },
] as const;

interface Data {
  days: Day[];
  users: Record<string, UserRec>;
  errors: ErrorGroup[];
  // Уровни приключения за всё время: [начали, победили, проиграли].
  levels: Record<string, [number, number, number]>;
  // Дата (по Москве), за которую уже ушла утренняя сводка.
  summaryOn?: string;
  // С какого дня считаем источник и дальний уровень: у игроков до него их нет.
  trackSince?: number;
}

export interface Alert {
  group: ErrorGroup;
  perHour: number;
}

/** Не больше `limit` запросов с одного адреса за `windowMs`. */
export class IpLimit {
  private hits = new Map<string, { start: number; n: number }>();
  constructor(
    private readonly limit = 30,
    private readonly windowMs = 60_000,
  ) {}

  take(ip: string, now: number): boolean {
    const h = this.hits.get(ip);
    if (!h || now - h.start >= this.windowMs) {
      // Старые записи чистим заодно, чтобы карта не росла.
      if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (now - v.start >= this.windowMs) this.hits.delete(k);
      this.hits.set(ip, { start: now, n: 1 });
      return true;
    }
    if (h.n >= this.limit) return false;
    h.n++;
    return true;
  }
}

/** Сообщение без чисел, адресов и id: одинаковые ошибки с разными значениями — одна группа. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/0x[0-9a-f]+/gi, 'N')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>')
    .replace(/\d+(\.\d+)?/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** Верхняя строка стека без номеров строк и хеша сборки: «функция (файл)». */
export function topFrame(stack: string): string {
  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    // Chrome: «at fn (https://…/index-AbC123.js:1:2)»; Safari/Firefox: «fn@https://…:1:2».
    const m = /^at (?:(.+?) \()?(.+?)\)?$/.exec(line) ?? /^(.*?)@(.+)$/.exec(line);
    if (!m || !/[/:]/.test(m[2])) continue;
    const file = m[2]
      .replace(/[?#].*$/, '')
      .replace(/(:\d+)+$/, '')
      .split('/')
      .pop()!
      .replace(/-[\w-]{8,}(?=\.\w+$)/, '');
    const fn = (m[1] ?? '').replace(/^async /, '').trim() || '<anon>';
    return `${fn} (${file})`.slice(0, 120);
  }
  return '';
}

/** Отпечаток ошибки: вид + сообщение + верхний кадр стека. */
export function fingerprint(kind: string, message: string, stack: string): string {
  return createHash('sha1').update(`${kind}|${normalizeMessage(message)}|${topFrame(stack)}`).digest('hex').slice(0, 12);
}

/** Анонимный id так же, как его считает телефон (shared/anon.ts). */
export const clientAnon = (playerId: string) => createHash('sha256').update(anonSource(playerId)).digest('hex').slice(0, 32);

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, max) : '');

export class Telemetry {
  private data: Data = { days: [], users: {}, errors: [], levels: {} };
  private active = new Map<number, Set<string>>();
  private sources = new Set<string>();
  private alerts: Alert[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly key: Buffer;
  readonly limit = new IpLimit();

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
    key?: Buffer,
  ) {
    this.key = key ?? this.loadKey();
    if (file) {
      try {
        this.data = { ...this.data, ...(JSON.parse(readFileSync(file, 'utf8')) as Data) };
        for (const d of this.data.days) this.active.set(d.day, new Set(d.active));
      } catch {
        // Файла ещё нет.
      }
    }
    this.data.trackSince ??= mskDay(this.now());
    for (const u of Object.values(this.data.users)) if (u.o) this.sources.add(u.o);
  }

  /** Секретный ключ для хеша id и подписи ссылок админа. Создаётся один раз. */
  private loadKey(): Buffer {
    const keyFile = this.file ? this.file.replace(/\.json$/, '') + '.key' : null;
    if (keyFile) {
      try {
        const k = Buffer.from(readFileSync(keyFile, 'utf8').trim(), 'hex');
        if (k.length >= 16) return k;
      } catch {
        // Ключа ещё нет.
      }
    }
    const k = randomBytes(32);
    if (keyFile) {
      try {
        mkdirSync(dirname(keyFile), { recursive: true });
        writeFileSync(keyFile, k.toString('hex'), { mode: 0o600 });
      } catch {
        // Без записи на диск ключ живёт до перезапуска: id просто станут другими.
      }
    }
    return k;
  }

  /** Подпись строки ключом сервера: ссылки на статистику для админов. */
  sign(text: string): string {
    return createHmac('sha256', this.key).update(`sign:${text}`).digest('hex').slice(0, 32);
  }

  /** Как храним игрока: хеш от его анонимного id с нашим ключом. */
  private uid(anon: string): string {
    return createHmac('sha256', this.key).update(`uid:${anon}`).digest('base64url').slice(0, 16);
  }

  private dayRec(day: number): Day {
    let d = this.data.days.find((x) => x.day === day);
    if (!d) {
      d = { day, active: [], newUsers: 0, errors: 0, events: {} };
      this.data.days.push(d);
      this.data.days.sort((a, b) => a.day - b.day);
      this.active.set(day, new Set());
      this.prune(day);
    }
    return d;
  }

  private prune(today: number): void {
    const keep = today - KEEP_DAYS;
    this.data.days = this.data.days.filter((d) => d.day > keep);
    for (const day of this.active.keys()) if (day <= keep) this.active.delete(day);
    const usersKeep = today - KEEP_USERS_DAYS;
    for (const [id, u] of Object.entries(this.data.users)) if (u.l <= usersKeep) delete this.data.users[id];
  }

  private touch(uid: string, d: Day, src: string | null): UserRec {
    let u = this.data.users[uid];
    if (!u) {
      let o = src ?? 'unknown';
      if (!this.sources.has(o)) {
        if (this.sources.size >= MAX_SOURCES) o = 'other';
        this.sources.add(o);
      }
      u = this.data.users[uid] = { f: d.day, l: d.day, s: 0, o };
      d.newUsers++;
      this.count(d, `src:${o}`);
    }
    if (d.day > u.l) u.l = d.day;
    if (u.l > u.f) u.s |= 1 << 6;
    const set = this.active.get(d.day)!;
    if (!set.has(uid) && set.size < MAX_ACTIVE) {
      set.add(uid);
      d.active.push(uid);
    }
    return u;
  }

  private count(d: Day, key: string, n = 1): void {
    if (!(key in d.events) && Object.keys(d.events).length >= MAX_DAY_KEYS) return;
    d.events[key] = (d.events[key] ?? 0) + n;
  }

  /** Счётчик дня с самого сервера (без игрока): например, сколько писем бота ушло. */
  serverEvent(name: string, param?: string): void {
    const d = this.dayRec(mskDay(this.now()));
    this.count(d, name);
    if (param) this.count(d, `${name}:${param}`);
    this.save();
  }

  /** Пакет с телефона. Возвращает HTTP-код ответа. */
  ingest(raw: unknown, ip: string): number {
    const now = this.now();
    if (!this.limit.take(ip, now)) return 429;
    if (!raw || typeof raw !== 'object') return 400;
    const b = raw as Record<string, unknown>;
    const anon = typeof b.anon === 'string' && /^[0-9a-f]{16,64}$/.test(b.anon) ? b.anon : null;
    if (!anon) return 400;
    const d = this.dayRec(mskDay(now));
    const u = this.touch(this.uid(anon), d, cleanSource(b.src));
    const events = Array.isArray(b.events) ? b.events.slice(0, 50) : [];
    for (const e of events) {
      if (!e || typeof e !== 'object') continue;
      const { n, p } = e as { n?: unknown; p?: unknown };
      if (typeof n !== 'string' || !(EVENTS as readonly string[]).includes(n)) continue;
      const param = typeof p === 'number' && Number.isInteger(p) && p >= 0 && p < 100_000 ? String(p) : typeof p === 'string' && /^[\w-]{1,20}$/.test(p) ? p : null;
      this.event(d, u, n as EventName, param);
    }
    const ctx: Omit<ErrorSample, 'stack'> = {
      version: str(b.v, 40) || '?',
      platform: [str(b.platform, 20), str(b.tgv, 10)].filter(Boolean).join(' ') || 'browser',
      ua: str(b.ua, 200),
      screen: str(b.screen, 20),
      lowPower: b.lowPower === true,
      path: str(b.path, 80),
    };
    const errors = Array.isArray(b.errors) ? b.errors.slice(0, 20) : [];
    for (const e of errors) {
      if (!e || typeof e !== 'object') continue;
      const x = e as Record<string, unknown>;
      const kind = /^[a-z_]{2,20}$/.test(String(x.kind)) ? String(x.kind) : 'error';
      const message = str(x.message, 500) || 'без сообщения';
      const count = Math.max(1, Math.min(100, Math.floor(Number(x.count)) || 1));
      this.error(d, kind, message, str(x.stack, MAX_STACK), count, ctx, now);
    }
    this.save();
    return 200;
  }

  private event(d: Day, u: UserRec, n: EventName, p: string | null): void {
    this.count(d, n);
    if (p != null && n !== 'mission_start' && n !== 'mission_win' && n !== 'mission_lose') this.count(d, `${n}:${p}`);
    if (n === 'app_open') u.s |= 1;
    if (n === 'onb_step' && Number(p) >= 1) u.s |= 2;
    if (n === 'onb_done') u.s |= 4;
    if (n === 'camera_granted') u.s |= 8;
    if (n === 'mission_start' && p === '1') u.s |= 16;
    if (n === 'mission_win' && p === '1') u.s |= 32;
    if (n === 'duel_start' || n === 'raid_start' || n === 'program_start' || n === 'event_start') u.s |= 128;
    if (n === 'mission_win' && p && /^\d+$/.test(p) && Number(p) <= 1000) u.m = Math.max(u.m ?? 0, Number(p));
    if (n.startsWith('mission_') && p && /^\d+$/.test(p) && Number(p) <= 1000) {
      const l = (this.data.levels[p] ??= [0, 0, 0]);
      l[n === 'mission_start' ? 0 : n === 'mission_win' ? 1 : 2]++;
    }
  }

  private error(d: Day, kind: string, message: string, stack: string, count: number, ctx: Omit<ErrorSample, 'stack'>, now: number): void {
    const fp = fingerprint(kind, message, stack);
    d.errors += count;
    let g = this.data.errors.find((x) => x.fp === fp);
    if (!g) {
      if (this.data.errors.length >= MAX_GROUPS) {
        // Места нет: вытесняем ошибку, которую дольше всех не видели.
        this.data.errors.sort((a, b) => b.lastSeen - a.lastSeen);
        this.data.errors.length = MAX_GROUPS - 1;
      }
      g = { fp, kind, message, frame: topFrame(stack), count: 0, firstSeen: now, lastSeen: now, hour: { start: now, n: 0 }, versions: [], sample: { ...ctx, stack } };
      this.data.errors.push(g);
    }
    g.count += count;
    g.lastSeen = now;
    g.message = message;
    g.sample = { ...ctx, stack };
    if (!g.versions.includes(ctx.version)) g.versions = [...g.versions, ctx.version].slice(-5);
    if (now - g.hour.start >= 3_600_000) g.hour = { start: now, n: 0 };
    g.hour.n += count;
    // Тревога один раз на отпечаток: новая ошибка, которая за час набрала заметное число.
    if (!g.alerted && g.hour.n >= ALERT_PER_HOUR) {
      g.alerted = true;
      this.alerts.push({ group: g, perHour: g.hour.n });
    }
  }

  /** Новые тревоги для бота; каждая отдаётся один раз. */
  takeAlerts(): Alert[] {
    const out = this.alerts;
    this.alerts = [];
    return out;
  }

  /** Пора ли утренней сводке: 9:00 по Москве, раз в день, и после перезапуска не повторяется. */
  summaryDue(): boolean {
    const now = this.now();
    const today = dayDate(mskDay(now));
    const hour = new Date(now + MSK_MS).getUTCHours();
    if (hour < 9 || this.data.summaryOn === today) return false;
    this.data.summaryOn = today;
    this.save();
    return true;
  }

  /** Забыть игрока: его анонимные следы пропадают из списков активности и воронки. */
  forget(playerId: string): void {
    const uid = this.uid(clientAnon(playerId));
    delete this.data.users[uid];
    for (const d of this.data.days) {
      const i = d.active.indexOf(uid);
      if (i >= 0) d.active.splice(i, 1);
      this.active.get(d.day)?.delete(uid);
    }
    this.save();
  }

  /** Всё для страницы статистики и сводки. */
  stats(days = 30) {
    const today = mskDay(this.now());
    const byDay = new Map(this.data.days.map((d) => [d.day, d]));
    const dau = Array.from({ length: days }, (_, i) => {
      const day = today - days + 1 + i;
      const d = byDay.get(day);
      return { date: dayDate(day), users: d?.active.length ?? 0, newUsers: d?.newUsers ?? 0, errors: d?.errors ?? 0, events: d?.events ?? {} };
    });
    const cohorts = new Map<number, string[]>();
    for (const [id, u] of Object.entries(this.data.users)) {
      if (u.f > today - days) (cohorts.get(u.f) ?? cohorts.set(u.f, []).get(u.f)!).push(id);
    }
    const back = (ids: string[], day: number) => {
      if (day > today) return null;
      const set = this.active.get(day);
      return set ? ids.filter((id) => set.has(id)).length : 0;
    };
    const retention = [...cohorts.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([day, ids]) => ({ date: dayDate(day), cohort: ids.length, d1: back(ids, day + 1), d7: back(ids, day + 7) }));
    const users = Object.values(this.data.users);
    // Воронка — по новичкам за период: так видно, что происходит сейчас, а не полгода назад.
    const fresh = users.filter((u) => u.f > today - days);
    const funnel = FUNNEL.map((f) => ({ label: f.label, users: fresh.filter((u) => u.s & (1 << f.bit)).length }));
    // Источник и дальний уровень есть только у пришедших после обновления статистики.
    const since = this.data.trackSince ?? today;
    const tracked = Object.entries(this.data.users).filter(([, u]) => u.f > today - days && u.f >= since);
    const bySource = new Map<string, [string, UserRec][]>();
    for (const e of tracked) {
      const o = e[1].o ?? 'unknown';
      (bySource.get(o) ?? bySource.set(o, []).get(o)!).push(e);
    }
    const has = (list: [string, UserRec][], bit: number) => list.filter(([, u]) => u.s & (1 << bit)).length;
    const sources = [...bySource.entries()]
      .map(([source, list]) => {
        const old = list.filter(([, u]) => u.f < today);
        return {
          source,
          users: list.length,
          camera: has(list, 3),
          won: has(list, 5),
          played: has(list, 7),
          returned: has(list, 6),
          // D1 считаем только у тех, у кого «завтра» уже наступило.
          d1Of: old.length,
          d1: old.filter(([id, u]) => this.active.get(u.f + 1)?.has(id) ?? false).length,
        };
      })
      .sort((a, b) => b.users - a.users);
    // До какого уровня дошли: отдельно ушедшие (не заходят GONE_DAYS дней) и те, кто ещё играет.
    const reach = REACH.map((r, i) => {
      const from = i ? REACH[i - 1].to + 1 : 0;
      const inside = tracked.filter(([, u]) => (u.m ?? 0) >= from && (u.m ?? 0) <= r.to);
      const gone = inside.filter(([, u]) => today - u.l >= GONE_DAYS).length;
      return { label: r.label, gone, playing: inside.length - gone };
    });
    const errors = [...this.data.errors].sort((a, b) => b.lastSeen - a.lastSeen || b.count - a.count);
    const levels = Object.entries(this.data.levels)
      .map(([id, [start, win, lose]]) => ({ id: Number(id), start, win, lose }))
      .sort((a, b) => a.id - b.id);
    return { today: dayDate(today), days, dau, retention, funnel, sources, reach, trackSince: dayDate(since), errors, levels, totalUsers: users.length };
  }

  /** Текст утренней сводки для бота: вчерашний день по Москве. */
  summaryText(): string {
    const s = this.stats(8);
    const y = s.dau[s.dau.length - 2];
    const week = s.dau.slice(0, 7).reduce((a, d) => a + d.users, 0);
    const ev = (k: string) => y.events[k] ?? 0;
    const cohort = s.retention.find((r) => r.d1 != null && r.date < y.date);
    const fresh = s.errors.filter((e) => e.lastSeen > this.now() - DAY_MS).sort((a, b) => b.count - a.count).slice(0, 3);
    const from = Object.entries(y.events)
      .filter(([k]) => k.startsWith('src:'))
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k.slice(4)} ${n}`)
      .join(', ');
    return [
      `Сводка NikitenokArena за ${y.date}`,
      `Игроков: ${y.users} (новых ${y.newUsers}), за неделю суммарно ${week}`,
      from ? `Откуда новые: ${from}` : '',
      `Уровни: начато ${ev('mission_start')}, побед ${ev('mission_win')}, поражений ${ev('mission_lose')}`,
      `Дуэли ${ev('duel_start')}, рейды ${ev('raid_start')}, программы ${ev('program_start')}, события ${ev('event_start')}`,
      `Камера: разрешили ${ev('camera_granted')}, отказали ${ev('camera_denied')}`,
      cohort ? `Удержание D1 (когорта ${cohort.date}): ${cohort.d1} из ${cohort.cohort}` : '',
      `Ошибок за день: ${y.errors}`,
      ...fresh.map((e) => `• ${e.count}× ${e.message.slice(0, 90)}`),
    ]
      .filter(Boolean)
      .join('\n');
  }

  flush(): void {
    if (!this.file || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 10_000);
  }
}

/** Адрес игрока: за Caddy настоящий адрес в X-Forwarded-For. */
export function clientIp(req: IncomingMessage): string {
  const direct = req.socket.remoteAddress ?? '';
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return /^(::ffff:)?127\.|^::1$/.test(direct) && fwd ? fwd : direct;
}

/** POST /api/telemetry: тело из sendBeacon (text/plain), не больше 32 КБ. */
export function handleTelemetry(t: Telemetry, req: IncomingMessage, res: ServerResponse): void {
  const done = (code: number) => {
    if (!res.headersSent) res.writeHead(code).end();
  };
  if (req.method !== 'POST') return done(405);
  if (Number(req.headers['content-length'] ?? 0) > TELEMETRY_MAX_BYTES) return done(413);
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size > TELEMETRY_MAX_BYTES) {
      done(413);
      req.destroy();
    } else chunks.push(c);
  });
  req.on('end', () => {
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return done(400);
    }
    done(t.ingest(body, clientIp(req)));
  });
  req.on('error', () => done(400));
}
