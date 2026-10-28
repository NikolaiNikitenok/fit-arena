// Итоги месяца (src/game/recap.ts): сервер добавляет то, чего телефон не знает, — место среди всех игроков
// и место своего города за месяц. Повторы — из копий прогресса (server/saves.ts), с тем же пределом в день.
import { canonicalKey, knownCity } from '../shared/cityNames';
import { DAY_REPS_MAX } from './saves';

export interface RecapStanding {
  // Доля игроков месяца, у которых повторов меньше, в процентах; null — сам не тренировался.
  percent: number | null;
  players: number;
  city: { name: string; place: number; cities: number; me: number; members: number } | null;
}

export interface RecapDeps {
  saves: () => Iterable<{ id: string; progress: Record<string, unknown> | null }>;
  // Город игрока, как он его выбрал в «Битве городов».
  cities: () => Iterable<{ id: string; city: string }>;
}

// Пересчёт по всем игрокам дорогой: держим результат несколько минут.
const CACHE_MS = 10 * 60_000;

/** Повторы за месяц (YYYY-MM) из дней тренировок, не больше предела в день. */
export function monthReps(days: unknown, month: string): number {
  let sum = 0;
  for (const [d, n] of Object.entries((days ?? {}) as Record<string, unknown>)) if (d.startsWith(`${month}-`)) sum += Math.max(0, Math.min(DAY_REPS_MAX, Math.floor(Number(n) || 0)));
  return sum;
}

export const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

interface MonthTable {
  at: number;
  reps: Map<string, number>;
  // Повторы игроков месяца по возрастанию: для доли «сильнее, чем».
  sorted: number[];
  city: Map<string, string>;
  // Города по убыванию повторов.
  cityRank: { key: string; name: string; reps: number }[];
}

export class RecapBoard {
  private cache = new Map<string, MonthTable>();

  constructor(private readonly d: RecapDeps) {}

  private table(month: string, now: number): MonthTable {
    const hit = this.cache.get(month);
    if (hit && now - hit.at < CACHE_MS) return hit;
    const reps = new Map<string, number>();
    for (const s of this.d.saves()) {
      const n = monthReps(s.progress?.days, month);
      if (n > 0) reps.set(s.id, n);
    }
    const city = new Map<string, string>();
    const totals = new Map<string, { name: string; reps: number }>();
    for (const e of this.d.cities()) {
      const key = canonicalKey(e.city);
      city.set(e.id, key);
      const t = totals.get(key) ?? { name: knownCity(e.city)?.[0] ?? e.city, reps: 0 };
      t.reps += reps.get(e.id) ?? 0;
      totals.set(key, t);
    }
    const t: MonthTable = {
      at: now,
      reps,
      sorted: [...reps.values()].sort((a, b) => a - b),
      city,
      cityRank: [...totals.entries()]
        .filter(([, c]) => c.reps > 0)
        .map(([key, c]) => ({ key, ...c }))
        .sort((a, b) => b.reps - a.reps),
    };
    this.cache.set(month, t);
    if (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value!);
    return t;
  }

  standing(id: string, month: string, now: number): RecapStanding {
    const t = this.table(month, now);
    const mine = t.reps.get(id) ?? 0;
    // Сколько игроков с меньшим числом повторов: двоичный поиск по отсортированному списку.
    let lo = 0;
    let hi = t.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t.sorted[mid] < mine) lo = mid + 1;
      else hi = mid;
    }
    const others = t.sorted.length - 1;
    const percent = mine > 0 ? (others > 0 ? Math.round((lo / others) * 100) : 100) : null;
    const key = t.city.get(id);
    const i = key ? t.cityRank.findIndex((c) => c.key === key) : -1;
    let city: RecapStanding['city'] = null;
    if (key && i >= 0) {
      const inCity = [...t.city.entries()].filter(([, k]) => k === key).map(([pid]) => t.reps.get(pid) ?? 0);
      city = { name: t.cityRank[i].name, place: i + 1, cities: t.cityRank.length, me: mine > 0 ? inCity.filter((r) => r > mine).length + 1 : 0, members: inCity.filter((r) => r > 0).length };
    }
    return { percent, players: t.sorted.length, city };
  }
}
