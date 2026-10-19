// Копии прогресса приключения и настройки напоминаний. Прогресс — JSON из приложения как есть:
// сервер его не разбирает, только хранит более свежую копию (по savedAt).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
}

export const SAVE_MAX_BYTES = 200_000;

export class SaveStore {
  private saves = new Map<string, Save>();
  private timer: ReturnType<typeof setTimeout> | null = null;

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
  put(id: string, progress: unknown): Save {
    const s = this.touch(id);
    const p = progress as { savedAt?: unknown } | null;
    const at = Number(p?.savedAt) || 0;
    if (p && typeof p === 'object' && at > s.savedAt && JSON.stringify(p).length <= SAVE_MAX_BYTES) {
      s.progress = p as Record<string, unknown>;
      s.savedAt = at;
      this.save();
    }
    return s;
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
    if (!s.remind || !s.id.startsWith('tg:')) continue;
    const { date, hour } = localTime(now, s.remind.tz);
    if (hour !== s.remind.hour || s.remindedOn === date) continue;
    const days = (s.progress?.days ?? {}) as Record<string, number>;
    if (days[date]) continue;
    out.push({ save: s, date });
  }
  return out;
}
