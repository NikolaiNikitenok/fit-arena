// Оплата звёздами Telegram: счёт с сервера, окно оплаты, потом ждём, пока сервер узнает об оплате (server/proSales.ts).
import { proInvoice, refreshPro } from './cloud';
import { openInvoice } from './telegram';
import { t } from './i18n';

export type StarKind = 'pro' | 'gift' | 'starter';
type Status = Awaited<ReturnType<typeof refreshPro>>;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Купить за звёзды. done — по ответу сервера понять, что покупка уже засчитана (null — не ждать сервер).
 * Вернёт 'done', 'late' (оплачено, сервер ещё не знает), 'cancelled' или текст ошибки.
 */
export async function payStars(kind: StarKind, done: ((s: Status) => boolean) | null, forId?: string): Promise<'done' | 'late' | 'cancelled' | { error: string }> {
  try {
    const status = await openInvoice(await proInvoice(kind, forId));
    if (status === 'cancelled') return 'cancelled';
    if (status === 'failed') return { error: t('Оплата не прошла. Попробуй ещё раз.') };
    if (!done) return 'done';
    // Сообщение об оплате приходит серверу чуть позже, чем закрывается окно оплаты.
    for (let i = 0; i < 12; i++) {
      const s = await refreshPro().catch(() => null);
      if (s && done(s)) return 'done';
      await wait(1500);
    }
    return 'late';
  } catch (e) {
    return { error: (e as { body?: { error?: string } }).body?.error ?? t('Не получилось открыть оплату. Попробуй ещё раз.') };
  }
}
