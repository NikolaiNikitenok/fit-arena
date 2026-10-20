// Модерация на сервере: чёрный список игроков, запрет писать в чат от модератора и защита чата от спама.
// Чёрный список и запреты храним в JSON-файле, как друзей и кланы.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type BlockedView, MUTE_FOREVER } from '../shared/moderation';

export const BLOCK_MAX = 200;

interface Mute {
  until: number;
  by: string;
  at: number;
}

const cleanName = (s: unknown) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 24) : '') || 'Боец';

export class ModerationStore {
  // Кого заблокировал игрок: его id → список.
  private blocks = new Map<string, BlockedView[]>();
  private mutes = new Map<string, Mute>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (!file) return;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { blocks?: Record<string, BlockedView[]>; mutes?: Record<string, Mute> };
      for (const [id, list] of Object.entries(data.blocks ?? {})) this.blocks.set(id, list);
      for (const [id, m] of Object.entries(data.mutes ?? {})) this.mutes.set(id, m);
    } catch {
      // Файла ещё нет.
    }
  }

  // --- Чёрный список ---

  blockedBy(me: string): BlockedView[] {
    return this.blocks.get(me) ?? [];
  }

  /** Заблокировал ли by игрока who. */
  hasBlocked(by: string, who: string): boolean {
    return this.blockedBy(by).some((b) => b.id === who);
  }

  /** Хоть один из двоих заблокировал другого: тогда ни заявок, ни вызовов. */
  either(a: string, b: string): boolean {
    return this.hasBlocked(a, b) || this.hasBlocked(b, a);
  }

  block(me: string, other: string, name: string): string | null {
    if (!other || other === me) return 'Нельзя заблокировать себя';
    const list = this.blockedBy(me);
    if (list.some((b) => b.id === other)) return null;
    if (list.length >= BLOCK_MAX) return `В чёрном списке уже ${BLOCK_MAX} игроков`;
    this.blocks.set(me, [...list, { id: other, name: cleanName(name), at: this.now() }]);
    this.save();
    return null;
  }

  unblock(me: string, other: string): void {
    const list = this.blockedBy(me).filter((b) => b.id !== other);
    if (list.length) this.blocks.set(me, list);
    else this.blocks.delete(me);
    this.save();
  }

  // --- Запрет писать в чат (модератор) ---

  /** До какого времени игроку нельзя писать; 0 — можно. */
  mutedUntil(id: string): number {
    const m = this.mutes.get(id);
    if (!m) return 0;
    if (m.until <= this.now()) {
      this.mutes.delete(id);
      this.save();
      return 0;
    }
    return m.until;
  }

  /** ms — на сколько; Infinity — навсегда; 0 — снять запрет. */
  mute(id: string, ms: number, by: string): number {
    if (ms <= 0) {
      this.mutes.delete(id);
      this.save();
      return 0;
    }
    const until = ms === Infinity ? MUTE_FOREVER : this.now() + ms;
    this.mutes.set(id, { until, by, at: this.now() });
    this.save();
    return until;
  }

  flush(): void {
    if (!this.file || !this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify({ blocks: Object.fromEntries(this.blocks), mutes: Object.fromEntries(this.mutes) }));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 2000);
  }
}

// --- Защита чата от спама ---

export const SPAM_MAX = 5;
export const SPAM_WINDOW_MS = 10_000;
// Одно и то же сообщение подряд нельзя: сравниваем с тремя последними за 5 минут.
export const REPEAT_KEEP = 3;
export const REPEAT_MS = 5 * 60_000;

// Ссылка на нашего бота можно: ей зовут в игру.
const ALLOWED_LINK = /(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/ArenaNikitenokBot(?:[/?][^\s]*)?/gi;
const TLD = 'ru|рф|com|net|org|io|me|su|xyz|info|biz|link|site|online|top|club|ly|gg|tk|pro|app|dev|shop|store|ua|by|kz|tv|cc|co|us|uk|de|in|to|ws';
const LINK = new RegExp(`(?:https?://|www\\.)\\S+|(?:[a-zа-яё0-9-]+\\.)+(?:${TLD})(?![a-zа-яё0-9])`, 'i');

/** Есть ли в тексте ссылка (кроме t.me/ArenaNikitenokBot). */
export const hasLink = (text: string): boolean => LINK.test(text.replace(ALLOWED_LINK, ' '));

const same = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');

export class SpamGuard {
  private sent = new Map<string, number[]>();
  private texts = new Map<string, { t: string; at: number }[]>();

  /** Можно ли отправить: null — можно, иначе текст ошибки. Удачную отправку сразу запоминает. */
  check(id: string, text: string, now: number): string | null {
    if (hasLink(text)) return 'Ссылки в чате нельзя. Можно только t.me/ArenaNikitenokBot';
    const times = (this.sent.get(id) ?? []).filter((t) => now - t < SPAM_WINDOW_MS);
    if (times.length >= SPAM_MAX) return 'Слишком много сообщений. Подожди несколько секунд';
    const key = same(text);
    const recent = (this.texts.get(id) ?? []).filter((x) => now - x.at < REPEAT_MS);
    if (key && recent.some((x) => x.t === key)) return 'Ты уже это писал';
    if (this.sent.size > 5000) this.prune(now);
    times.push(now);
    this.sent.set(id, times);
    this.texts.set(id, [...recent, { t: key, at: now }].slice(-REPEAT_KEEP));
    return null;
  }

  private prune(now: number): void {
    for (const [id, list] of this.texts) if (!list.some((x) => now - x.at < REPEAT_MS)) {
      this.texts.delete(id);
      this.sent.delete(id);
    }
  }
}
