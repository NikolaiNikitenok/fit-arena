// Жалобы игроков. Храним в JSON-файле; о каждой новой бот пишет админам (server/admin.ts).
// Одна жалоба от игрока на одного и того же — раз в сутки, и не больше пяти жалоб в час от одного игрока:
// так жалобами нельзя завалить ни админов, ни бота.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ReportReason, ReportWhere } from '../shared/moderation';

export const REPORT_DEDUP_MS = 24 * 3_600_000;
export const REPORT_LIMIT = 5;
export const REPORT_LIMIT_MS = 3_600_000;
export const REPORTS_KEEP = 2000;

export interface Report {
  id: string;
  from: string;
  fromName: string;
  target: string;
  targetName: string;
  reason: ReportReason;
  where: ReportWhere;
  // Текст сообщения из чата, на которое пожаловались: сервер берёт его сам, не со слов жалующегося.
  text?: string;
  // Клан, где это было.
  clan?: string;
  at: number;
}

export type NewReport = Omit<Report, 'id' | 'at'>;

export class ReportStore {
  private list: Report[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (!file) return;
    try {
      this.list = JSON.parse(readFileSync(file, 'utf8')) as Report[];
    } catch {
      // Файла ещё нет.
    }
  }

  /** Новая жалоба. Возвращает её и сколько всего жалоб на игрока за неделю, или текст ошибки. */
  add(r: NewReport): { report: Report; count: number } | string {
    const now = this.now();
    if (!r.target || r.target === r.from) return 'Нельзя пожаловаться на себя';
    if (this.list.some((x) => x.from === r.from && x.target === r.target && now - x.at < REPORT_DEDUP_MS)) return 'Ты уже пожаловался на этого игрока. Модератор посмотрит';
    if (this.list.filter((x) => x.from === r.from && now - x.at < REPORT_LIMIT_MS).length >= REPORT_LIMIT) return 'Слишком много жалоб. Попробуй через час';
    const report: Report = { ...r, id: randomUUID(), at: now };
    this.list.push(report);
    if (this.list.length > REPORTS_KEEP) this.list.splice(0, this.list.length - REPORTS_KEEP);
    this.save();
    return { report, count: this.countFor(r.target, 7 * 24 * 3_600_000) };
  }

  /** Сколько разных игроков пожаловались на target за период. */
  countFor(target: string, ms: number): number {
    const now = this.now();
    return new Set(this.list.filter((x) => x.target === target && now - x.at < ms).map((x) => x.from)).size;
  }

  recent(n: number): Report[] {
    return this.list.slice(-n).reverse();
  }

  flush(): void {
    if (!this.file || !this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.list));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 2000);
  }
}
