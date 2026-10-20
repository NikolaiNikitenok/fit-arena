// Сообщения бота админам: утренняя сводка, тревога о новой ошибке, письма игроков разработчику.
import type { Update } from './bot';
import { type Alert, IpLimit } from './telemetry';

/** Тревога: новая ошибка набрала за час заметное число повторов. */
export function alertText(a: Alert): string {
  const g = a.group;
  return [
    `⚠️ Новая ошибка: ${a.perHour} раз за час`,
    `[${g.kind}] ${g.message.slice(0, 300)}`,
    g.frame ? `Где: ${g.frame}` : '',
    `Версия ${g.sample.version} · ${g.sample.platform}${g.sample.lowPower ? ' · экономия батареи' : ''}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// Игрок пишет разработчику не чаще пяти раз в час, чтобы бот не стал рупором для спама.
const feedbackLimit = new IpLimit(5, 3_600_000);

/** Письмо игрока для админов или null, если пишет слишком часто. */
export function feedbackText(msg: NonNullable<Update['message']>, now: number): string | null {
  if (!msg.text || msg.chat.type !== 'private' || !feedbackLimit.take(String(msg.chat.id), now)) return null;
  const who = [msg.from?.first_name, msg.from?.username && `@${msg.from.username}`].filter(Boolean).join(' ');
  return `✉️ Сообщение от игрока ${who || ''} (id ${msg.chat.id}):\n\n${msg.text.slice(0, 2000)}`;
}

export const FEEDBACK_THANKS = 'Спасибо! Передал сообщение разработчику NikitenokArena.';
