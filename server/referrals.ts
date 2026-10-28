// «Приведи друга»: кто пришёл в игру по ссылке-приглашению друга. Засчитывается только новичок
// (до входа по ссылке тренировался не больше одного дня), один раз за всё время.
// Награды забирают сами игроки (src/game/referral.ts), когда новичок провёл первый бой; сервер только помнит,
// кто кого привёл, и один раз пишет пригласившему, что друг в деле.
//   REFERRALS_FILE — записи (по умолчанию referrals.json рядом с DATA_FILE)
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Referral {
  inviter: string;
  invitee: string;
  at: number;
  // Пригласившему уже написали, что друг провёл первый бой.
  told?: boolean;
}

/** Первый бой проведён: пройден уровень или сделано хотя бы 20 повторов. */
export function isActive(progress: { days?: unknown; stars?: unknown } | null | undefined): boolean {
  if (!progress) return false;
  if (Object.values((progress.stars ?? {}) as Record<string, number>).some((n) => Number(n) >= 1)) return true;
  return Object.values((progress.days ?? {}) as Record<string, number>).reduce((s, n) => s + Math.max(0, Number(n) || 0), 0) >= 20;
}

/** Новичок: тренировался не больше одного дня. */
export function isNewbie(progress: { days?: unknown } | null | undefined): boolean {
  return Object.values((progress?.days ?? {}) as Record<string, number>).filter((n) => Number(n) > 0).length <= 1;
}

export class Referrals {
  private list: Referral[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.list = JSON.parse(readFileSync(file, 'utf8')) as Referral[];
    } catch {
      // Файла ещё нет.
    }
  }

  /** Записать, что invitee пришёл по ссылке inviter. false — уже записан раньше (или сам себя). */
  add(inviter: string, invitee: string, now: number): boolean {
    if (inviter === invitee || this.list.some((r) => r.invitee === invitee)) return false;
    this.list.push({ inviter, invitee, at: now });
    this.save();
    return true;
  }

  /** Кого привёл игрок. */
  brought(inviter: string): Referral[] {
    return this.list.filter((r) => r.inviter === inviter);
  }

  /** Кто привёл игрока. */
  by(invitee: string): Referral | undefined {
    return this.list.find((r) => r.invitee === invitee);
  }

  /** Новичок провёл первый бой: пригласившему пишем один раз. Возвращает запись, если писать надо сейчас. */
  activated(invitee: string): Referral | null {
    const r = this.by(invitee);
    if (!r || r.told) return null;
    r.told = true;
    this.save();
    return r;
  }

  forget(id: string): void {
    const n = this.list.length;
    this.list = this.list.filter((r) => r.inviter !== id && r.invitee !== id);
    if (this.list.length !== n) this.save();
  }

  flush(): void {
    if (!this.file || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.list));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }
}
