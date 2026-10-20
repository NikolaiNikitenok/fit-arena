// Защита от читов на сервере: то, что видят другие игроки, проверяет сервер, а не телефон.
// Храним в JSON-файле (guard.json рядом с остальными):
//   claims  — какие награды сервера игрок уже забрал (рейд, война): второй раз не дадим;
//   attacks — атаки рейда по дням на игрока, а не на клан: переход в другой клан атак не прибавляет;
//   reportAt — когда игрок последний раз присылал повторы клану: больше, чем успел бы сделать за это время, не засчитаем;
//   pairs — рейтинговые бои одной пары за день: больше DUEL_PAIR_PER_DAY кубков не дают (накрутка с другом);
//   flags — подозрительные события. Набралось FLAG_LIMIT за неделю — игрок «под подозрением»:
//     его не видно в общем топе (сам он себя там видит), всё остальное работает как обычно.
//     Снять подозрение — удалить его запись из flags в guard.json.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DAY = 86_400_000;
export const FLAG_LIMIT = 12;
export const FLAG_WINDOW_MS = 7 * DAY;
export const DUEL_PAIR_PER_DAY = 5;
// Повторы клану: самый быстрый темп (как у отжиманий) и запас на последний подход.
export const CLAN_REP_MIN_MS = 400;
export const CLAN_REP_BURST = 10;
const CLAIMS_KEEP = 60;
const FLAG_EVENTS_KEEP = 50;

interface Flags {
  at: number[];
  kinds: Record<string, number>;
}

interface Data {
  claims: Record<string, string[]>;
  attacks: Record<string, Record<string, number>>;
  reportAt: Record<string, number>;
  pairs: Record<string, number>;
  flags: Record<string, Flags>;
}

const empty = (): Data => ({ claims: {}, attacks: {}, reportAt: {}, pairs: {}, flags: {} });
const day = (t: number) => new Date(t + 3 * 3_600_000).toISOString().slice(0, 10);

export class Guard {
  private d: Data = empty();
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Куда писать о подозрительном: по умолчанию в журнал сервера (без токенов и initData — только id и вид).
  log: (line: string) => void = (line) => console.warn(line);

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.d = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) };
    } catch {
      // Файла ещё нет.
    }
  }

  // ——— Награды ———

  claimed(id: string, key: string): boolean {
    return !!this.d.claims[id]?.includes(key);
  }

  /** Отметить награду забранной. false — уже была забрана. */
  claim(id: string, key: string): boolean {
    if (this.claimed(id, key)) return false;
    const list = (this.d.claims[id] ??= []);
    list.push(key);
    if (list.length > CLAIMS_KEEP) list.splice(0, list.length - CLAIMS_KEEP);
    this.save();
    return true;
  }

  // ——— Атаки рейда ———

  attacks(id: string, dayKey: string): number {
    return this.d.attacks[id]?.[dayKey] ?? 0;
  }

  addAttack(id: string, dayKey: string): void {
    const a = (this.d.attacks[id] ??= {});
    a[dayKey] = (a[dayKey] ?? 0) + 1;
    for (const k of Object.keys(a).sort().slice(0, -3)) delete a[k];
    this.save();
  }

  // ——— Повторы клану ———

  /**
   * Сколько из присланных повторов засчитать: не больше, чем можно сделать с прошлого отчёта.
   * Первый отчёт (сервер ещё не знает, когда был прошлый) ограничен только дневным пределом клана.
   */
  clanReps(id: string, reps: number, now: number): number {
    const n = Math.max(0, Math.round(Number(reps) || 0));
    const last = this.d.reportAt[id];
    this.d.reportAt[id] = now;
    this.save();
    if (last === undefined) return n;
    const max = Math.floor(Math.max(0, now - last) / CLAN_REP_MIN_MS) + CLAN_REP_BURST;
    if (n > max) {
      this.flag(id, 'clanReps', `${n} > ${max}`, now);
      return max;
    }
    return n;
  }

  // ——— Дуэли ———

  /** Можно ли дать кубки за этот бой: одна пара — не больше DUEL_PAIR_PER_DAY рейтинговых боёв в день. */
  ratedPair(a: string, b: string, now: number): boolean {
    const today = day(now);
    for (const k of Object.keys(this.d.pairs)) if (!k.startsWith(today)) delete this.d.pairs[k];
    const key = `${today}|${[a, b].sort().join('|')}`;
    const n = (this.d.pairs[key] ?? 0) + 1;
    this.d.pairs[key] = n;
    this.save();
    return n <= DUEL_PAIR_PER_DAY;
  }

  // ——— Подозрения ———

  flag(id: string, kind: string, detail: string, now: number): void {
    const f = (this.d.flags[id] ??= { at: [], kinds: {} });
    f.at.push(now);
    if (f.at.length > FLAG_EVENTS_KEEP) f.at.splice(0, f.at.length - FLAG_EVENTS_KEEP);
    f.kinds[kind] = (f.kinds[kind] ?? 0) + 1;
    this.log(`fairplay: ${id} ${kind} ${detail}`);
    this.save();
  }

  /** Под подозрением: много нарушений за последнюю неделю. */
  flagged(id: string, now: number): boolean {
    const f = this.d.flags[id];
    return !!f && f.at.filter((t) => now - t < FLAG_WINDOW_MS).length >= FLAG_LIMIT;
  }

  flagCount(id: string): number {
    return this.d.flags[id]?.at.length ?? 0;
  }

  /** Гость вошёл через Telegram: забранные награды, атаки и подозрения переходят к аккаунту. */
  adopt(id: string, guestId: string): void {
    if (id === guestId) return;
    const c = this.d.claims[guestId];
    if (c) this.d.claims[id] = [...new Set([...(this.d.claims[id] ?? []), ...c])].slice(-CLAIMS_KEEP);
    const a = this.d.attacks[guestId];
    if (a) {
      const mine = (this.d.attacks[id] ??= {});
      for (const [k, n] of Object.entries(a)) mine[k] = Math.max(mine[k] ?? 0, n);
    }
    const f = this.d.flags[guestId];
    if (f) {
      const mine = (this.d.flags[id] ??= { at: [], kinds: {} });
      mine.at = [...mine.at, ...f.at].sort((x, y) => x - y).slice(-FLAG_EVENTS_KEEP);
      for (const [k, n] of Object.entries(f.kinds)) mine.kinds[k] = (mine.kinds[k] ?? 0) + n;
    }
    delete this.d.claims[guestId];
    delete this.d.attacks[guestId];
    delete this.d.flags[guestId];
    this.save();
  }

  flush(): void {
    if (!this.file || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.d));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }
}
