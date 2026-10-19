// Минимальная обёртка над Telegram WebApp API (скрипт подключён в index.html).

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; username?: string }; start_param?: string };
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void };
  setHeaderColor?(color: string): void;
  disableVerticalSwipes?(): void;
  setBackgroundColor?(color: string): void;
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
  // Без этого свайп вниз по карте сворачивает всё мини-приложение.
  try {
    tg?.disableVerticalSwipes?.();
  } catch {
    // Клиенты до Bot API 7.7.
  }
  // Шапка Telegram в цвет игры, чтобы не было светлой полосы над тёмным экраном.
  try {
    tg?.setHeaderColor?.('#0d0f17');
    tg?.setBackgroundColor?.('#0d0f17');
  } catch {
    // Старые клиенты не умеют менять цвета.
  }
}

export function userName(): string {
  return tg?.initDataUnsafe.user?.first_name ?? 'Гость';
}

export function hapticRep(): void {
  tg?.HapticFeedback?.impactOccurred('medium');
}

const startParam = (): string | null => tg?.initDataUnsafe.start_param ?? null;

/** Код боя из ссылки-приглашения: t.me/<бот>?startapp=КОД или ?room=КОД в браузере. */
export function inviteCode(): string | null {
  const p = startParam();
  if (p?.startsWith('clan-')) return null;
  return p ?? new URLSearchParams(location.search).get('room');
}

/** Приглашение в клан: t.me/<бот>?startapp=clan-КОД или ?clan=КОД в браузере. */
export function clanInviteCode(): string | null {
  const p = startParam();
  if (p?.startsWith('clan-')) return p.slice(5);
  return new URLSearchParams(location.search).get('clan');
}

export function clanInviteLink(code: string, botUsername: string | null): string {
  return botUsername ? `https://t.me/${botUsername}?startapp=clan-${code}` : `${location.origin}/?clan=${code}`;
}

// Гостям без Telegram выдаём постоянный id, чтобы кубки и клан не терялись между заходами.
export function guestId(): string {
  try {
    let id = localStorage.getItem('fit-arena-guest');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('fit-arena-guest', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
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
