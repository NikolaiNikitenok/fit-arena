// Пробный Pro другу: игрок с Pro раз в сезон дарит другу 3 дня Pro бесплатно.
// Друг получает пробный Pro один раз за всё время и только если сам Pro ещё не покупал:
// так пробник приводит новых покупателей, а не продлевает Pro тем, кто и так платит.
//   PRO_TRIALS_FILE — кто кому и когда подарил (по умолчанию pro-trials.json рядом с DATA_FILE)
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { seasonAt } from '../shared/rating';

export const TRIAL_DAYS = 3;
const DAY = 86_400_000;

export interface ProTrial {
  from: string;
  to: string;
  at: number;
  until: number;
}

export interface TrialStatus {
  // Можно ли подарить пробник в этом сезоне (есть свой Pro и ещё не дарил).
  canGive: boolean;
  // Кому уже подарен в этом сезоне.
  givenTo: string | null;
  // До когда действует свой пробный Pro (null — нет).
  until: number | null;
}

export class ProTrials {
  private list: ProTrial[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.list = JSON.parse(readFileSync(file, 'utf8')) as ProTrial[];
    } catch {
      // Файла ещё нет.
    }
  }

  /** Подарок этого сезона от игрока (его аккаунты — ids). */
  givenThisSeason(ids: string[], now: number): ProTrial | undefined {
    const season = seasonAt(now);
    return this.list.find((t) => ids.includes(t.from) && seasonAt(t.at) === season);
  }

  /** До когда действует пробный Pro у игрока или 0. */
  until(ids: string[]): number {
    return this.list.reduce((m, t) => (ids.includes(t.to) ? Math.max(m, t.until) : m), 0);
  }

  active(ids: string[], now: number): boolean {
    return this.until(ids) > now;
  }

  status(ids: string[], hasPro: boolean, now: number): TrialStatus {
    const given = this.givenThisSeason(ids, now);
    const until = this.until(ids);
    return { canGive: hasPro && !given, givenTo: given?.to ?? null, until: until > now ? until : null };
  }

  /**
   * Подарить пробник. fromIds/toIds — все аккаунты дарителя и друга, fromPaidPro — у дарителя настоящий Pro
   * (не пробный: пробником пробник не дарят), toBought — друг уже покупал Pro. Возвращает текст ошибки или запись.
   */
  give(fromIds: string[], toIds: string[], fromPaidPro: boolean, toBought: boolean, now: number): ProTrial | string {
    if (!fromPaidPro) return 'Дарить пробный Pro могут только игроки с Pro Pass';
    if (this.givenThisSeason(fromIds, now)) return 'В этом сезоне ты уже дарил пробный Pro. Новый — в следующем сезоне';
    if (toBought) return 'У друга уже был Pro Pass: пробник — для тех, кто ещё не пробовал';
    if (this.list.some((t) => toIds.includes(t.to))) return 'Друг уже получал пробный Pro';
    const t: ProTrial = { from: fromIds[0], to: toIds[0], at: now, until: now + TRIAL_DAYS * DAY };
    this.list.push(t);
    this.save();
    return t;
  }

  /** Игрок удалил свои данные: забываем его подарки и пробники. */
  forget(id: string): void {
    const n = this.list.length;
    this.list = this.list.filter((t) => t.from !== id && t.to !== id);
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
