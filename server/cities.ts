// Топ по городу: игрок сам выбирает город (в приложении сразу подставляется город его клана).
// Сервер считает повторы за неделю из копии прогресса (server/saves.ts, дни тренировок) — с тем же пределом
// в день, что и для видимого уровня, — и строит топ города и рейтинг городов. Неделя — с понедельника по Москве.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { badName } from '../shared/profanity';
import { DAY_REPS_MAX } from './saves';

export interface CityEntry {
  id: string;
  // Как написал игрок (с заглавной) и ключ для сравнения.
  city: string;
  key: string;
  name: string;
  at: number;
}

export interface CityRow {
  name: string;
  reps: number;
  level: number | null;
  pro?: boolean;
  me?: boolean;
}

export interface CityBoard {
  city: string | null;
  // Понедельник и воскресенье недели (YYYY-MM-DD, Москва).
  from: string;
  to: string;
  top: CityRow[];
  // Моё место и повторы, если я в городе.
  me: { place: number; reps: number; players: number } | null;
  cities: { city: string; reps: number; players: number; mine?: boolean }[];
  // Город клана: предложить, если свой ещё не выбран.
  suggest?: string;
}

const DAY = 86_400_000;
const MSK = 3 * 3_600_000;
export const CITY_TOP = 50;
export const CITIES_TOP = 20;

/** Ключ города: регистр, ё и лишние пробелы не важны. */
export const cityKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Город как его покажем: без лишних пробелов, с заглавной буквы. */
export function cleanCity(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/[^\p{L}0-9 .-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (cityKey(t).length < 2 || badName(t)) return null;
  return t[0].toUpperCase() + t.slice(1);
}

/** Дни этой недели по Москве: с понедельника по воскресенье. */
export function weekDays(now: number): string[] {
  const msk = new Date(now + MSK);
  const monday = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()) - ((msk.getUTCDay() + 6) % 7) * DAY;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY).toISOString().slice(0, 10));
}

/** Повторы за неделю из дней тренировок: не больше предела в день. */
export function weekReps(days: unknown, week: string[]): number {
  const d = (days ?? {}) as Record<string, unknown>;
  return week.reduce((s, k) => s + Math.max(0, Math.min(DAY_REPS_MAX, Math.floor(Number(d[k]) || 0))), 0);
}

export interface CityDeps {
  days: (id: string) => unknown;
  level: (id: string) => number | null;
  isPro: (id: string) => boolean;
  clanCity: (id: string) => string | undefined;
}

export class CityStore {
  private entries = new Map<string, CityEntry>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      for (const e of JSON.parse(readFileSync(file, 'utf8')) as CityEntry[]) this.entries.set(e.id, e);
    } catch {
      // Файла ещё нет.
    }
  }

  get(id: string): CityEntry | undefined {
    return this.entries.get(id);
  }

  /** Выбрать город (null — убрать себя из топа). Возвращает ошибку строкой. */
  set(id: string, city: unknown, name: string, now: number): CityEntry | null | string {
    if (city === null || city === '') {
      this.forget(id);
      return null;
    }
    const clean = cleanCity(city);
    if (!clean) return 'Напиши настоящее название города';
    const e: CityEntry = { id, city: clean, key: cityKey(clean), name, at: now };
    this.entries.set(id, e);
    this.save();
    return e;
  }

  /** Имя могло смениться в Telegram: обновляем при каждом заходе. */
  rename(id: string, name: string): void {
    const e = this.entries.get(id);
    if (!e || e.name === name) return;
    e.name = name;
    this.save();
  }

  forget(id: string): void {
    if (this.entries.delete(id)) this.save();
  }

  board(d: CityDeps, id: string, now: number): CityBoard {
    const week = weekDays(now);
    const mine = this.entries.get(id);
    // Повторы всех за неделю, по городам. Без повторов за неделю — не в топе.
    const byCity = new Map<string, { city: string; rows: (CityRow & { id: string })[] }>();
    for (const e of this.entries.values()) {
      const reps = weekReps(d.days(e.id), week);
      if (reps <= 0 && e.id !== id) continue;
      let c = byCity.get(e.key);
      if (!c) byCity.set(e.key, (c = { city: e.city, rows: [] }));
      // Название города — как у того, кто выбрал его первым.
      c.rows.push({ id: e.id, name: e.name, reps, level: null });
    }
    const cities = [...byCity.entries()]
      .map(([key, c]) => ({ city: c.city, reps: c.rows.reduce((s, r) => s + r.reps, 0), players: c.rows.filter((r) => r.reps > 0).length, mine: key === mine?.key || undefined }))
      .filter((c) => c.reps > 0)
      .sort((a, b) => b.reps - a.reps);
    const own = mine ? (byCity.get(mine.key)?.rows ?? []).sort((a, b) => b.reps - a.reps || (a.id === id ? -1 : 1)) : [];
    const place = own.findIndex((r) => r.id === id);
    const top = own
      .filter((r) => r.reps > 0)
      .slice(0, CITY_TOP)
      .map(({ id: rid, name, reps }) => ({ name, reps, level: d.level(rid), pro: d.isPro(rid) || undefined, me: rid === id || undefined }));
    const myCities = cities.slice(0, CITIES_TOP);
    const mineCity = cities.find((c) => c.mine);
    if (mineCity && !myCities.includes(mineCity)) myCities.push(mineCity);
    return {
      city: mine?.city ?? null,
      from: week[0],
      to: week[6],
      top,
      me: mine && place >= 0 ? { place: place + 1, reps: own[place].reps, players: own.filter((r) => r.reps > 0).length } : null,
      cities: myCities,
      suggest: mine ? undefined : cleanCity(d.clanCity(id) ?? '') ?? undefined,
    };
  }

  flush(): void {
    if (!this.file || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify([...this.entries.values()]));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }
}
