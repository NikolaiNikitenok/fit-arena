// Картинки для сторис Telegram: shareToStory берёт только ссылку на файл в интернете, поэтому телефон
// присылает готовую картинку (итоги месяца), а сервер отдаёт её по адресу /api/story/<id>.jpg двое суток.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IpLimit } from './telemetry';

export const STORY_MAX_BYTES = 850_000;
export const STORY_KEEP_MS = 2 * 86_400_000;
const ID = /^[a-z0-9]{20}$/;

export class StoryImages {
  // Не больше 10 картинок в час с одного игрока.
  readonly limit = new IpLimit(10, 3_600_000);

  constructor(private readonly dir: string) {}

  /** Сохранить JPEG из base64. Возвращает id или текст ошибки. */
  put(who: string, base64: unknown, now: number): { id: string } | { error: string; code: number } {
    if (typeof base64 !== 'string') return { error: 'Нет картинки', code: 400 };
    const buf = Buffer.from(base64.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
    if (buf.length > STORY_MAX_BYTES) return { error: 'Картинка слишком большая', code: 413 };
    // Только JPEG: начинается с FF D8 FF.
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return { error: 'Нужна картинка JPEG', code: 400 };
    if (!this.limit.take(who, now)) return { error: 'Слишком часто, попробуй позже', code: 429 };
    this.cleanup(now);
    const id = randomBytes(10).toString('hex');
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, `${id}.jpg`), buf);
    return { id };
  }

  /** Файл по id или null, если его нет или он устарел. */
  get(id: string, now: number): Buffer | null {
    if (!ID.test(id)) return null;
    try {
      const file = join(this.dir, `${id}.jpg`);
      if (now - statSync(file).mtimeMs > STORY_KEEP_MS) return null;
      return readFileSync(file);
    } catch {
      return null;
    }
  }

  /** Убрать картинки старше двух суток. */
  cleanup(now: number): void {
    let names: string[];
    try {
      names = readdirSync(this.dir);
    } catch {
      return;
    }
    for (const n of names) {
      const file = join(this.dir, n);
      try {
        if (now - statSync(file).mtimeMs > STORY_KEEP_MS) unlinkSync(file);
      } catch {
        // Уже удалили.
      }
    }
  }
}
