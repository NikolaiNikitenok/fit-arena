// Pro Pass: купить пока нельзя, статус выдаётся вручную по id в Telegram.
//   PRO_IDS — id через запятую
//   .pro-ids рядом с сервером — по id на строку (# — комментарий); перечитывается при изменении и раз в минуту.
// Гости из браузера Pro не бывают.
import { readFileSync, statSync } from 'node:fs';

/** Id из строки: числа через запятые, пробелы или переносы, комментарии после #. */
export function parseProIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const line of text.split('\n'))
    for (const part of line.replace(/#.*/, '').split(/[\s,;]+/)) if (/^\d{1,20}$/.test(part)) ids.add(part);
  return ids;
}

export class ProList {
  private fileIds = new Set<string>();
  private readonly envIds: Set<string>;
  private mtime = -1;
  private checkedAt = -Infinity;
  private loadedAt = -Infinity;

  constructor(
    private readonly file: string | null,
    env: string | undefined,
    private readonly now: () => number = Date.now,
  ) {
    this.envIds = parseProIds(env ?? '');
  }

  /** Pro ли игрок: id вида tg:123. */
  has(playerId: string): boolean {
    if (!playerId.startsWith('tg:')) return false;
    const id = playerId.slice(3);
    if (this.envIds.has(id)) return true;
    this.refresh();
    return this.fileIds.has(id);
  }

  /** Все id из переменной и файла (для рассылки админам). */
  ids(): string[] {
    this.refresh();
    return [...new Set([...this.envIds, ...this.fileIds])];
  }

  private refresh(): void {
    const t = this.now();
    // Не дёргаем диск на каждое сообщение чата: изменения файла видны через пару секунд.
    if (!this.file || t - this.checkedAt < 2000) return;
    this.checkedAt = t;
    let mtime = 0;
    try {
      mtime = statSync(this.file).mtimeMs;
    } catch {
      this.fileIds = new Set();
      this.mtime = 0;
      return;
    }
    if (mtime === this.mtime && t - this.loadedAt < 60_000) return;
    try {
      this.fileIds = parseProIds(readFileSync(this.file, 'utf8'));
      this.mtime = mtime;
      this.loadedAt = t;
    } catch {
      // Файл пропал между проверками: оставляем прежний список.
    }
  }
}
