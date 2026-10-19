// Минимальная обёртка над Telegram WebApp API (скрипт подключён в index.html).

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; username?: string } };
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void };
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
