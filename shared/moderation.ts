// Модерация: жалобы, чёрный список и запрет писать в чат. HTTP POST /api/moderation/* (server/moderationApi.ts).
import { t } from '../src/i18n';

export type ReportReason = 'insult' | 'spam' | 'mat' | 'other';
export const REPORT_REASONS: Record<ReportReason, string> = { insult: t('Оскорбления'), spam: t('Спам'), mat: t('Мат'), other: t('Другое') };
// Откуда жалоба: сообщение в чате клана, участник клана или друг.
export type ReportWhere = 'chat' | 'clan' | 'friend';

export interface BlockedView {
  id: string;
  name: string;
  at: number;
}

export interface ModerationState {
  blocked: BlockedView[];
  // До какого времени мне нельзя писать в чат (запрет модератора), 0 — можно.
  mutedUntil: number;
}

export type ModerationReply = ModerationState & { error?: string; note?: string };

// «Навсегда»: число, которое переживает JSON (Infinity в JSON становится null).
export const MUTE_FOREVER = 8.64e15;
const MSK = 3 * 3_600_000;

/** «Ты не можешь писать в чат до 21.10 в 14:30 (мск)». */
export function muteText(until: number): string {
  if (until >= MUTE_FOREVER) return t('Ты не можешь писать в чат до решения модератора');
  const d = new Date(until + MSK);
  const two = (n: number) => String(n).padStart(2, '0');
  return t('Ты не можешь писать в чат до {0}.{1} в {2}:{3} (мск)', { 0: two(d.getUTCDate()), 1: two(d.getUTCMonth() + 1), 2: two(d.getUTCHours()), 3: two(d.getUTCMinutes()) });
}
