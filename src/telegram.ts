// Минимальная обёртка над Telegram WebApp API (скрипт подключён в index.html).
import { friendLink, friendParam, isNamedParam } from './friends/link';

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
  // Bot API 8.0: в полноэкранном режиме сверху лежат статус-бар и кнопки Telegram («Закрыть», «…»).
  safeAreaInset?: { top: number; bottom: number };
  contentSafeAreaInset?: { top: number; bottom: number };
  onEvent?(event: string, cb: () => void): void;
  // Bot API 8.0: скачать файл по https-ссылке; Bot API 7.8: история с картинкой по https-ссылке.
  downloadFile?(params: { url: string; file_name: string }, cb?: (accepted: boolean) => void): void;
  shareToStory?(mediaUrl: string, params?: { text?: string; widget_link?: { url: string; name?: string } }): void;
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
  // Отступ сверху под кнопки Telegram: весь интерфейс берёт его из --safe-top.
  const insets = () => {
    const top = (tg?.safeAreaInset?.top ?? 0) + (tg?.contentSafeAreaInset?.top ?? 0);
    document.documentElement.style.setProperty('--tg-top', `${top}px`);
  };
  insets();
  try {
    tg?.onEvent?.('safeAreaChanged', insets);
    tg?.onEvent?.('contentSafeAreaChanged', insets);
    tg?.onEvent?.('fullscreenChanged', insets);
  } catch {
    // Старые клиенты без этих событий.
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

/** Код боя из ссылки-приглашения: ?room=КОД (кнопка бота) или startapp=КОД. */
export function inviteCode(): string | null {
  const p = startParam();
  if (p && isNamedParam(p)) return null;
  return p ?? new URLSearchParams(location.search).get('room');
}

/** Приглашение в клан: ?clan=КОД (кнопка бота после «Старт») или startapp=clan-КОД. */
export function clanInviteCode(): string | null {
  const p = startParam();
  if (p?.startsWith('clan-')) return p.slice(5);
  return new URLSearchParams(location.search).get('clan');
}

/** Приглашение в друзья: startapp=friend-ТОКЕН или ?friend=ТОКЕН (кнопка бота). */
export const friendInviteCode = (): string | null => friendParam(startParam(), location.search);

export const friendInviteLink = (token: string, bot: { username: string | null; running: boolean }): string => friendLink(token, bot, BOT_USERNAME, location.origin);

/** Вкладка из адреса: кнопки бота о рейде открывают клан (?tab=clan), о друзьях — друзей (?tab=friends). */
export const startTab = (): string | null => new URLSearchParams(location.search).get('tab');

// Имя бота известно и без токена на сервере: ссылки-приглашения всегда ведут в Telegram.
export const BOT_USERNAME = 'ArenaNikitenokBot';

// Пока на сервере нет токена, бот не отвечает на /start, поэтому ссылка сразу открывает
// мини-приложение (startapp). Когда бот запущен, ссылка ведёт в бота, и он присылает кнопку входа.
const link = (param: string, bot: { username: string | null; running: boolean }) => {
  const name = bot.username || BOT_USERNAME;
  return name ? `https://t.me/${name}?${bot.running ? 'start' : 'startapp'}=${param}` : null;
};

export function clanInviteLink(code: string, bot: { username: string | null; running: boolean }): string {
  return link(`clan-${code}`, bot) ?? `${location.origin}/?clan=${code}`;
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

export function inviteLink(code: string, bot: { username: string | null; running: boolean }): string {
  return link(code, bot) ?? `${location.origin}/?room=${code}`;
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
