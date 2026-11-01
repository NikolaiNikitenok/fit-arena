// Титан (shared/titan.ts): общий босс страны раз в месяц. Урон — повторы всех игроков за дни Титана
// из копий прогресса (server/saves.ts), с тем же пределом в день. Здоровье выбирается один раз, когда Титан
// появляется: по урону прошлого Титана (победили — сильнее, не смогли — слабее), а первый — по числу игроков.
//   TITANS_FILE — здоровье и итоги Титанов (по умолчанию titans.json рядом с DATA_FILE)
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalKey, knownCity } from '../shared/cityNames';
import { lastTitan, titanOf, titanWindow, type TitanWindow } from '../shared/titan';
import { DAY_REPS_MAX } from './saves';
import { cameraDays } from './cities';

export const TITAN_MIN_HP = 10_000;
// Повторов на игрока за неделю Титана, если прошлого Титана не было.
export const TITAN_HP_PER_PLAYER = 400;
const CACHE_MS = 60_000;
const DAY = 86_400_000;

export interface TitanRecord {
  hp: number;
  wonAt?: number;
  // Итоговый урон: записывается, когда неделя закончилась.
  dealt?: number;
  // Подарки Telegram лучшим героям: админа спросили / сколько отправлено.
  giftAsked?: boolean;
  giftsSent?: number;
}

export interface TitanState {
  key: string;
  start: number;
  end: number;
  live: boolean;
  // null — Титан ещё не появился, здоровье не выбрано.
  hp: number | null;
  dealt: number;
  won: boolean;
  wonAt: number | null;
  players: number;
  me: { reps: number; place: number | null };
  cities: { name: string; dealt: number; players: number; mine?: boolean }[];
  heroes: { name: string; reps: number; pro?: boolean; me?: boolean }[];
  myCity: { name: string; place: number; dealt: number } | null;
  // Сколько лучших героев получат подарок Telegram при победе (0 — подарков нет).
  giftTop: number;
}

export interface TitanDeps {
  saves: () => Iterable<{ id: string; progress: Record<string, unknown> | null }>;
  cities: () => Iterable<{ id: string; city: string; name: string }>;
  nameOf: (id: string) => string | undefined;
  isPro: (id: string) => boolean;
  // Сколько лучших героев получат подарок Telegram (TITAN_GIFT_TOP); без него — подарков нет.
  giftTop?: () => number;
}

/** Месяц перед этим: 2026-01 → 2025-12. */
export const prevMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

/** Две значащие цифры: 23 456 → 23 000. */
export const niceHp = (n: number) => {
  const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1);
  return Math.round(n / p) * p;
};

/** Повторы дней Титана, не больше предела в день. */
export function titanReps(days: unknown, dates: string[]): number {
  const d = (days ?? {}) as Record<string, unknown>;
  return dates.reduce((s, k) => s + Math.max(0, Math.min(DAY_REPS_MAX, Math.floor(Number(d[k]) || 0))), 0);
}

interface Table {
  at: number;
  reps: Map<string, number>;
  dealt: number;
  heroes: [string, number][];
  city: Map<string, string>;
  cities: { key: string; name: string; dealt: number; players: number }[];
}

export class TitanBoard {
  private records: Record<string, TitanRecord> = {};
  private cache = new Map<string, Table>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string | null,
    private readonly d: TitanDeps,
  ) {
    if (!file) return;
    try {
      this.records = JSON.parse(readFileSync(file, 'utf8')) as Record<string, TitanRecord>;
    } catch {
      // Файла ещё нет.
    }
  }

  private table(w: TitanWindow, now: number): Table {
    const hit = this.cache.get(w.key);
    // Закончившийся Титан больше не меняется: пересчитывать незачем.
    if (hit && (now - hit.at < CACHE_MS || hit.at >= w.end)) return hit;
    const reps = new Map<string, number>();
    for (const s of this.d.saves()) {
      const n = titanReps(cameraDays(s.progress), w.dates);
      if (n > 0) reps.set(s.id, n);
    }
    const city = new Map<string, string>();
    const totals = new Map<string, { name: string; dealt: number; players: number }>();
    for (const e of this.d.cities()) {
      const key = canonicalKey(e.city);
      city.set(e.id, key);
      const r = reps.get(e.id) ?? 0;
      const t = totals.get(key) ?? { name: knownCity(e.city)?.[0] ?? e.city, dealt: 0, players: 0 };
      t.dealt += r;
      t.players += r > 0 ? 1 : 0;
      totals.set(key, t);
    }
    const t: Table = {
      at: now,
      reps,
      dealt: [...reps.values()].reduce((s, n) => s + n, 0),
      heroes: [...reps.entries()].sort((a, b) => b[1] - a[1]),
      city,
      cities: [...totals.entries()]
        .filter(([, c]) => c.dealt > 0)
        .map(([key, c]) => ({ key, ...c }))
        .sort((a, b) => b.dealt - a.dealt),
    };
    this.cache.set(w.key, t);
    if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
    return t;
  }

  /** Здоровье Титана: выбирается один раз, когда он появился. */
  private record(w: TitanWindow, now: number): TitanRecord | null {
    if (now < w.start) return null;
    let r = this.records[w.key];
    if (!r) {
      const prev = this.records[prevMonth(w.key)];
      let hp: number;
      if (prev?.dealt != null) hp = prev.wonAt ? prev.dealt * 1.15 : Math.max(prev.dealt * 1.05, prev.hp * 0.8);
      else {
        // Первый Титан: сколько игроков тренировались за две недели до него.
        const from = w.start - 14 * DAY;
        const dates = Array.from({ length: 14 }, (_, i) => new Date(from + i * DAY + 3 * 3_600_000).toISOString().slice(0, 10));
        let active = 0;
        for (const s of this.d.saves()) if (titanReps(cameraDays(s.progress), dates) > 0) active++;
        hp = active * TITAN_HP_PER_PLAYER;
      }
      r = this.records[w.key] = { hp: niceHp(Math.max(TITAN_MIN_HP, hp)) };
      this.save();
    }
    return r;
  }

  state(id: string, now: number, key?: string): TitanState {
    const w = key ? titanOf(key, now) : titanWindow(now);
    const rec = this.record(w, now);
    const t = this.table(w, now);
    if (rec) {
      let dirty = false;
      if (!rec.wonAt && t.dealt >= rec.hp) [rec.wonAt, dirty] = [Math.min(now, w.end), true];
      if (now >= w.end && rec.dealt == null) [rec.dealt, dirty] = [t.dealt, true];
      if (dirty) this.save();
    }
    const mine = t.reps.get(id) ?? 0;
    const place = mine > 0 ? t.heroes.findIndex(([pid]) => pid === id) + 1 : null;
    const myKey = t.city.get(id);
    const ci = myKey ? t.cities.findIndex((c) => c.key === myKey) : -1;
    return {
      key: w.key,
      start: w.start,
      end: w.end,
      live: w.live,
      hp: rec?.hp ?? null,
      dealt: t.dealt,
      won: !!rec?.wonAt,
      wonAt: rec?.wonAt ?? null,
      players: t.reps.size,
      me: { reps: mine, place },
      cities: t.cities.slice(0, 10).map((c) => ({ name: c.name, dealt: c.dealt, players: c.players, mine: c.key === myKey || undefined })),
      heroes: t.heroes.slice(0, 10).map(([pid, reps]) => ({ name: this.d.nameOf(pid) ?? 'Герой', reps, pro: this.d.isPro(pid) || undefined, me: pid === id || undefined })),
      myCity: ci >= 0 ? { name: t.cities[ci].name, place: ci + 1, dealt: t.cities[ci].dealt } : null,
      giftTop: this.d.giftTop?.() ?? 0,
    };
  }

  /** Прошедший Титан, которого победили: лучшие n героев (id и повторы) и отметки о подарках. */
  lastWon(now: number, n: number): { key: string; top: { id: string; reps: number }[]; asked: boolean; sent: number } | null {
    const w = lastTitan(now);
    if (now < w.end) return null;
    // state() отмечает победу и итог, если их ещё не записали.
    this.state('', now, w.key);
    const rec = this.records[w.key];
    if (!rec?.wonAt) return null;
    const t = this.table(w, now);
    return { key: w.key, top: t.heroes.slice(0, n).map(([id, reps]) => ({ id, reps })), asked: !!rec.giftAsked, sent: rec.giftsSent ?? 0 };
  }

  /** Отметить: админа о подарках спросили / подарки отправлены. */
  markGifts(key: string, mark: { asked?: boolean; sent?: number }): void {
    const rec = this.records[key];
    if (!rec) return;
    if (mark.asked) rec.giftAsked = true;
    if (mark.sent != null) rec.giftsSent = mark.sent;
    this.save();
  }

  flush(): void {
    if (!this.file || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.records));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }
}
