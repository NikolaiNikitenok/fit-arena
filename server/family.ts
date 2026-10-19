// Связь с семейным сайтом nikitenok.ru: каждая тренировка и дуэль уходит туда подписанным запросом.
//   FAMILY_WEBHOOK_URL — куда слать (https://nikitenok.ru/arena/api/activity/)
//   FAMILY_WEBHOOK_SECRET — общий секрет, тот же, что ARENA_WEBHOOK_SECRET на сайте
// Без них модуль молчит. Сайт сам находит человека по Telegram ID и ничего не делает, если он не привязан.
import { createHmac, randomUUID } from 'node:crypto';
import { EXERCISE_LABELS, type Exercise } from '../src/repCounter';

export type ActivityKind = 'training' | 'duel' | 'adventure';

export interface FamilyActivity {
  id: string;
  telegram_id: number;
  kind: ActivityKind;
  exercise: Exercise;
  reps: number;
  won?: boolean | null;
  cups?: number;
  league?: string;
}

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
  report(activity: Omit<FamilyActivity, 'id'> & { id?: string }): void {
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
