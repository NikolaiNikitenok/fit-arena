import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

const MAX_AGE_S = 24 * 60 * 60;
const MAX_FUTURE_S = 5 * 60;

/** Проверяет подпись initData из Telegram Mini App. Возвращает пользователя или null. */
export function verifyInitData(initData: string, botToken: string, nowS = Date.now() / 1000): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheck).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const authDate = Number(params.get('auth_date'));
  // Подпись старше суток не принимаем; из будущего (больше пяти минут вперёд) — тоже.
  if (!authDate || nowS - authDate > MAX_AGE_S || authDate - nowS > MAX_FUTURE_S) return null;
  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
    // Без числового id игрока не узнать: такая подпись (например, от бота без пользователя) не годится.
    return user && Number.isSafeInteger(user.id) && user.id > 0 ? user : null;
  } catch {
    return null;
  }
}
