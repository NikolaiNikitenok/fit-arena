// Минимальная обёртка над Telegram WebApp API (скрипт подключён в index.html).

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; username?: string }; start_param?: string };
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void };
  openTelegramLink?(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg: TelegramWebApp | undefined = window.Telegram?.WebApp;

export function initTelegram(): void {
  tg?.ready();
  tg?.expand();
}

export function userName(): string {
  return tg?.initDataUnsafe.user?.first_name ?? 'Гость';
}

export function hapticRep(): void {
  tg?.HapticFeedback?.impactOccurred('medium');
}

/** Код боя из ссылки-приглашения: t.me/<бот>?startapp=КОД или ?room=КОД в браузере. */
export function inviteCode(): string | null {
  return tg?.initDataUnsafe.start_param ?? new URLSearchParams(location.search).get('room');
}

export function inviteLink(code: string, botUsername: string | null): string {
  return botUsername ? `https://t.me/${botUsername}?startapp=${code}` : `${location.origin}/?room=${code}`;
}

/** Окно «Переслать» в Telegram; вне Telegram — системное «Поделиться» или копирование. */
export async function share(url: string, text: string): Promise<'shared' | 'copied'> {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink && tg.initData) {
    tg.openTelegramLink(shareUrl);
    return 'shared';
  }
  if (navigator.share) {
    await navigator.share({ url, text });
    return 'shared';
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return 'copied';
}
