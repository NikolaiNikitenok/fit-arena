// Аватарки игроков для ленты и профилей: фото профиля из Telegram. Бот берёт его через Bot API
// (getUserProfilePhotos → getFile), сервер хранит маленькую копию файлом <dir>/<id>.jpg и обновляет раз в несколько дней.
// Если фото скрыто настройками приватности Telegram или игрок не из Telegram, приложение показывает букву имени.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const AVATAR_FRESH_MS = 3 * 86_400_000;
// После неудачи (фото нет или сеть подвела) не спрашиваем Telegram снова так долго.
export const AVATAR_MISS_MS = 12 * 3_600_000;

/** Скачать фото игрока: Telegram id → JPEG или null. Задаёт сервер (бот); в тестах — подмена. */
export type AvatarFetch = (tgId: number) => Promise<Buffer | null>;

export class AvatarStore {
  private misses = new Map<string, number>();
  private pending = new Map<string, Promise<Buffer | null>>();

  constructor(
    private readonly dir: string | null,
    private readonly fetch: AvatarFetch | null,
    private readonly now: () => number = Date.now,
  ) {}

  // Имя файла — хеш id: id игрока в имени файла не лежит.
  private file(id: string): string | null {
    return this.dir && join(this.dir, `${createHash('sha256').update(`avatar:${id}`).digest('hex').slice(0, 24)}.jpg`);
  }

  private cached(id: string): { buf: Buffer; fresh: boolean } | null {
    const f = this.file(id);
    if (!f) return null;
    try {
      const age = this.now() - statSync(f).mtimeMs;
      return { buf: readFileSync(f), fresh: age < AVATAR_FRESH_MS };
    } catch {
      return null;
    }
  }

  /** Фото игрока id (tgId — его вход в Telegram, если есть). Старое отдаём сразу и обновляем в фоне. */
  async get(id: string, tgId: number | null): Promise<Buffer | null> {
    const c = this.cached(id);
    if (c?.fresh) return c.buf;
    if (!tgId || !this.fetch) return c?.buf ?? null;
    if (this.now() - (this.misses.get(id) ?? -Infinity) < AVATAR_MISS_MS) return c?.buf ?? null;
    let p = this.pending.get(id);
    if (!p) {
      p = this.fetch(tgId)
        .catch(() => null)
        .then((buf) => {
          this.pending.delete(id);
          const f = this.file(id);
          if (buf && f) {
            mkdirSync(this.dir!, { recursive: true });
            writeFileSync(f, buf);
          } else {
            this.misses.set(id, this.now());
            if (this.misses.size > 50_000) this.misses.clear();
          }
          return buf;
        });
      this.pending.set(id, p);
    }
    // Есть старая копия — не ждём Telegram.
    if (c) return c.buf;
    return p;
  }

  /** «Удалить мои данные». */
  forget(id: string): void {
    const f = this.file(id);
    this.misses.delete(id);
    if (!f) return;
    try {
      unlinkSync(f);
    } catch {
      // Не было.
    }
  }
}
