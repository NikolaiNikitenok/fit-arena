// Копии прогресса приключения и настройки напоминаний. Прогресс — JSON из приложения как есть:
// сервер его не разбирает, только хранит более свежую копию (по savedAt).
// Исключение — уровень героя, который видят друзья и клан: его сервер считает сам из копии,
// с пределами (plausibleXp) и не быстрее XP_DAY_MAX опыта в день (pub).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LEVEL_COUNT } from '../src/game/levels';
import { heroLevel, type Progress, XP_PER_LEVEL_WON } from '../src/game/progress';

const DAY = 86_400_000;
// Больше повторов в день не засчитываем в уровень, который видят другие.
export const DAY_REPS_MAX = 3000;
// Насколько может вырасти видимый опыт за день (повторы, звёзды уровней, программы).
export const XP_DAY_MAX = 4000;
// Первая копия на сервере приносит с собой историю, но не больше этого.
export const FIRST_XP_MAX = 100_000;

/** Опыт героя из копии прогресса, только из правдоподобного: даты не из будущего, дни не больше предела, звёзды только на настоящих уровнях. */
export function plausibleXp(progress: unknown, now: number): number {
  const p = (progress ?? {}) as Partial<Progress>;
  // Самый восточный часовой пояс — UTC+14: позже этой даты дней ещё не было.
  const latest = new Date(now + 14 * 3_600_000).toISOString().slice(0, 10);
  let reps = 0;
  for (const [d, n] of Object.entries(p.days ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= latest) reps += Math.max(0, Math.min(DAY_REPS_MAX, Math.floor(Number(n) || 0)));
  const stars = Object.entries(p.stars ?? {}).filter(([id, n]) => Number.isInteger(Number(id)) && Number(id) >= 1 && Number(id) <= LEVEL_COUNT && Number(n) >= 1).length;
  const programs = Math.max(0, Math.floor(Number(p.programs?.xp) || 0));
  return reps + stars * XP_PER_LEVEL_WON + programs;
}

export interface Remind {
  // Час по местному времени игрока и его смещение от UTC в минутах (как getTimezoneOffset, со знаком минус).
  hour: number;
  tz: number;
}

export interface Save {
  id: string;
  progress: Record<string, unknown> | null;
  savedAt: number;
  remind?: Remind | null;
  // Местная дата, когда уже напомнили: не чаще раза в день.
  remindedOn?: string;
  // Уведомления о рейде клана выключены в настройках.
  raidOff?: boolean;
  // Игрок остановил бота (Telegram ответил 403): не пишем, пока он снова не напишет боту.
  blocked?: boolean;
  // Видимый другим опыт героя: xp — сейчас, cap — предел на сегодня, day — дата (UTC), с которой считали предел.
  pub?: { xp: number; cap: number; day: string };
}

export const SAVE_MAX_BYTES = 200_000;

export class SaveStore {
  private saves = new Map<string, Save>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  // Копия обещает больше опыта, чем можно набрать: сервер обрезал (server/guard.ts записывает).
  onClip: (id: string, xp: number, cap: number) => void = () => {};

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      for (const s of JSON.parse(readFileSync(file, 'utf8')) as Save[]) this.saves.set(s.id, s);
    } catch {
      // Файла ещё нет.
    }
  }

  get(id: string): Save | undefined {
    return this.saves.get(id);
  }

  all(): Save[] {
    return [...this.saves.values()];
  }

  private touch(id: string): Save {
    let s = this.saves.get(id);
    if (!s) this.saves.set(id, (s = { id, progress: null, savedAt: 0 }));
    return s;
  }

  /** Сохранить, если копия свежее серверной. Возвращает то, что теперь хранится. */
  put(id: string, progress: unknown, now = Date.now()): Save {
    const s = this.touch(id);
    const p = progress as { savedAt?: unknown } | null;
    const at = Number(p?.savedAt) || 0;
    if (p && typeof p === 'object' && at > s.savedAt && JSON.stringify(p).length <= SAVE_MAX_BYTES) {
      s.progress = p as Record<string, unknown>;
      s.savedAt = at;
      this.publish(s, now);
      this.save();
    }
    return s;
  }

  /** Пересчитать видимый опыт из копии: не больше предела дня. */
  private publish(s: Save, now: number): void {
    const xp = plausibleXp(s.progress, now);
    const today = new Date(now).toISOString().slice(0, 10);
    if (!s.pub) {
      // Первая копия: история с другого телефона, но не больше FIRST_XP_MAX.
      if (xp > FIRST_XP_MAX) this.onClip(s.id, xp, FIRST_XP_MAX);
      const first = Math.min(xp, FIRST_XP_MAX);
      s.pub = { xp: first, cap: first + XP_DAY_MAX, day: today };
      return;
    }
    const pub = s.pub;
    if (pub.day !== today) {
      // Сколько дней прошло: тренировки без сети за эти дни тоже честные.
      const days = Math.max(1, Math.min(30, Math.round((Date.parse(today) - Date.parse(pub.day)) / DAY)));
      pub.cap = pub.xp + XP_DAY_MAX * days;
      pub.day = today;
    }
    if (xp > pub.cap) this.onClip(s.id, xp, pub.cap);
    pub.xp = Math.min(xp, pub.cap);
  }

  /** Опыт героя, который видят другие: проверенный сервером. null — копии прогресса нет. */
  publicXp(id: string, now = Date.now()): number | null {
    const s = this.saves.get(id);
    if (!s?.progress) return null;
    if (!s.pub) {
      // Копия сохранена до этой проверки: считаем сейчас.
      this.publish(s, now);
      this.save();
    }
    return s.pub!.xp;
  }

  heroLevel(id: string, now = Date.now()): number | null {
    const xp = this.publicXp(id, now);
    return xp === null ? null : heroLevel(xp).level;
  }

  /** Гость вошёл через Telegram: его прогресс из браузера переезжает в аккаунт, если там пусто. */
  adopt(id: string, fromId: string): void {
    const from = this.saves.get(fromId);
    const to = this.saves.get(id);
    if (!from?.progress || (to?.progress && to.savedAt >= from.savedAt)) return;
    this.put(id, from.progress);
  }

  setRemind(id: string, remind: Remind | null): Save {
    const s = this.touch(id);
    s.remind = remind && Number.isInteger(remind.hour) && remind.hour >= 0 && remind.hour < 24 && Math.abs(Number(remind.tz)) <= 14 * 60 ? { hour: remind.hour, tz: Math.round(Number(remind.tz)) } : null;
    this.save();
    return s;
  }

  setRaidNotify(id: string, on: boolean): Save {
    const s = this.touch(id);
    if (on) delete s.raidOff;
    else s.raidOff = true;
    this.save();
    return s;
  }

  setBlocked(id: string, blocked: boolean): void {
    const s = blocked ? this.touch(id) : this.saves.get(id);
    if (!s || !!s.blocked === blocked) return;
    if (blocked) s.blocked = true;
    else delete s.blocked;
    this.save();
  }

  /** Можно ли писать о рейде: не выключил в настройках и не остановил бота. */
  raidMuted(id: string): boolean {
    const s = this.saves.get(id);
    return !!(s?.raidOff || s?.blocked);
  }

  /** Игрок попросил удалить свои данные: прогресс и настройки бота пропадают. */
  forget(id: string): void {
    if (this.saves.delete(id)) this.save();
  }

  markReminded(id: string, date: string): void {
    this.touch(id).remindedOn = date;
    this.save();
  }

  flush(): void {
    if (!this.file || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.all()));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }
}

/** Местные дата и час игрока. */
export function localTime(now: number, tz: number): { date: string; hour: number } {
  const d = new Date(now + tz * 60_000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

/** Кому пора напомнить: наступил его час, сегодня ещё не напоминали и тренировки сегодня не было. */
export function dueReminders(saves: Save[], now: number): { save: Save; date: string }[] {
  const out: { save: Save; date: string }[] = [];
  for (const s of saves) {
    if (!s.remind || s.blocked || s.id.startsWith('guest:')) continue;
    const { date, hour } = localTime(now, s.remind.tz);
    if (hour !== s.remind.hour || s.remindedOn === date) continue;
    const days = (s.progress?.days ?? {}) as Record<string, number>;
    if (days[date]) continue;
    out.push({ save: s, date });
  }
  return out;
}
