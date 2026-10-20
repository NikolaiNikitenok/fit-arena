// Связь с семейным сайтом nikitenok.ru: каждая тренировка и дуэль уходит туда подписанным запросом.
//   FAMILY_WEBHOOK_URL — куда слать (https://nikitenok.ru/arena/api/activity/)
//   FAMILY_WEBHOOK_SECRET — общий секрет, тот же, что ARENA_WEBHOOK_SECRET на сайте
// Без них модуль молчит. Сайт сам находит человека по Telegram ID и ничего не делает, если он не привязан.
import { createHmac, randomUUID } from 'node:crypto';
import { EXERCISE_LABELS, type Exercise } from '../src/repCounter';

export type ActivityKind = 'training' | 'duel' | 'adventure';

export interface RepActivity {
  id: string;
  telegram_id: number;
  kind: ActivityKind;
  exercise: Exercise;
  reps: number;
  won?: boolean | null;
  cups?: number;
  league?: string;
}

/** Тренировка в зале из дневника: время, объём, рекорды и список упражнений. */
export interface GymReport {
  title: string;
  minutes: number;
  volume_kg: number;
  records: number;
  exercises: { name: string; sets: number }[];
}

export interface GymActivity extends GymReport {
  id: string;
  telegram_id: number;
  kind: 'gym';
}

export type FamilyActivity = RepActivity | GymActivity;

export const MAX_REPS = 300;

export function sign(secret: string, body: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Разбирает элемент из запроса клиента; null — если мусор. */
export function parseClientItem(raw: unknown): { id: string; kind: ActivityKind; exercise: Exercise; reps: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, kind, exercise, reps } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || !/^[\w-]{8,64}$/.test(id)) return null;
  if (kind !== 'training' && kind !== 'adventure') return null;
  if (typeof exercise !== 'string' || !(exercise in EXERCISE_LABELS)) return null;
  if (typeof reps !== 'number' || !Number.isInteger(reps) || reps <= 0 || reps > MAX_REPS) return null;
  return { id, kind, exercise: exercise as Exercise, reps };
}

const cleanText = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const intIn = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;

/** Разбирает отчёт о тренировке в зале от клиента; null — если мусор. */
export function parseGymItem(raw: unknown): (GymReport & { id: string }) | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[\w-]{8,64}$/.test(r.id)) return null;
  const title = cleanText(r.title, 40);
  if (!title) return null;
  if (!intIn(r.minutes, 1, 300) || !intIn(r.volume_kg, 0, 200_000) || !intIn(r.records, 0, 50) || !Array.isArray(r.exercises)) return null;
  const exercises: GymReport['exercises'] = [];
  for (const e of r.exercises.slice(0, 30)) {
    const name = cleanText((e as Record<string, unknown>)?.name, 80);
    const sets = (e as Record<string, unknown>)?.sets;
    if (!name || !intIn(sets, 1, 50)) return null;
    exercises.push({ name, sets: Math.round(sets as number) });
  }
  if (!exercises.length) return null;
  return { id: r.id, title, minutes: Math.round(r.minutes as number), volume_kg: Math.round(r.volume_kg as number), records: Math.round(r.records as number), exercises };
}

/** Не больше `limit` отчётов от одного игрока за `windowMs`. */
export class RateLimit {
  private hits = new Map<number, number[]>();
  constructor(
    private readonly limit = 20,
    private readonly windowMs = 10 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: number): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.limit) return false;
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}

export class Family {
  constructor(
    private readonly url = process.env.FAMILY_WEBHOOK_URL ?? '',
    private readonly secret = process.env.FAMILY_WEBHOOK_SECRET ?? '',
    private readonly post: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return Boolean(this.url && this.secret);
  }

  /** Отправить в фоне; ошибки сайта не мешают Арене. */
  report(activity: (Omit<RepActivity, 'id'> | Omit<GymActivity, 'id'>) & { id?: string }): void {
    if (!this.enabled) return;
    const body = JSON.stringify({ ...activity, id: activity.id ?? randomUUID() });
    const ts = Math.floor(Date.now() / 1000);
    this.post(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Arena-Timestamp': String(ts), 'X-Arena-Signature': sign(this.secret, body, ts) },
      body,
      signal: AbortSignal.timeout(5000),
    })
      .then((res) => {
        if (!res.ok) console.error('family webhook:', res.status);
      })
      .catch((e) => console.error('family webhook failed:', e));
  }
}

/** Telegram ID из id игрока вида `tg:123`; у гостей — null. */
export const telegramId = (playerId: string): number | null => {
  const m = /^tg:(\d+)$/.exec(playerId);
  return m ? Number(m[1]) : null;
};
