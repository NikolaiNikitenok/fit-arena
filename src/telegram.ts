// Минимальная обёртка над Telegram WebApp API (скрипт подключён в index.html).
import { friendLink, friendParam, isNamedParam, launchSource } from './friends/link';

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
  // Bot API 6.1: счёт на оплату (звёзды) поверх мини-приложения.
  openInvoice?(url: string, cb?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void): void;
  // Bot API 8.0: в полноэкранном режиме сверху лежат статус-бар и кнопки Telegram («Закрыть», «…»).
  safeAreaInset?: { top: number; bottom: number };
  contentSafeAreaInset?: { top: number; bottom: number };
  onEvent?(event: string, cb: () => void): void;
  // Bot API 8.0: скачать файл по https-ссылке; Bot API 7.8: история с картинкой по https-ссылке.
  downloadFile?(params: { url: string; file_name: string }, cb?: (accepted: boolean) => void): void;
  shareToStory?(mediaUrl: string, params?: { text?: string; widget_link?: { url: string; name?: string } }): void;
}

// Max (https://dev.max.ru/docs/webapps/bridge): window.WebApp из st.max.ru/js/max-web-app.js. Его index.html подключает,
// только когда игра открыта не из Telegram. Подпись initData у Max такая же, сервер сам узнаёт, чья она.
interface MaxWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name: string; username?: string }; start_param?: unknown };
  ready?(): void;
  openLink?(url: string): void;
  downloadFile?(url: string, fileName: string): void;
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
    WebApp?: MaxWebApp;
    __maxReady?: Promise<void>;
  }
}

/** Параметр запуска Max: строка start_param или ?WebAppStartParam= в адресе. */
const maxStartParam = (m: MaxWebApp): string | undefined => {
  const p = m.initDataUnsafe?.start_param;
  if (typeof p === 'string' && p) return p;
  return new URLSearchParams(location.search).get('WebAppStartParam') ?? undefined;
};

/** Max в виде того же интерфейса, что Telegram: остальной код не различает мессенджеры. */
function fromMax(m: MaxWebApp): TelegramWebApp {
  return {
    ready: () => m.ready?.(),
    expand: () => {},
    initData: m.initData,
    initDataUnsafe: { user: m.initDataUnsafe?.user, start_param: maxStartParam(m) },
    HapticFeedback: m.HapticFeedback,
    openLink: m.openLink && ((url: string) => m.openLink!(url)),
    downloadFile: m.downloadFile && ((p, cb) => (m.downloadFile!(p.url, p.file_name), cb?.(true))),
  } as TelegramWebApp;
}

// Вход в браузере (Яндекс ID или Telegram): сервер вернул сессию в адресе после # (server/webAuth.ts).
const SESSION_KEY = 'fit-arena-session';
export let loginError: string | null = null;
(() => {
  const h = new URLSearchParams(location.hash.slice(1));
  const session = h.get('session');
  const error = h.get('login-error');
  if (!session && !error) return;
  if (session) setSession(session);
  loginError = error;
  history.replaceState(null, '', location.pathname + location.search);
})();
export function getSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
export function setSession(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Нет хранилища: вход живёт до перезагрузки.
  }
}
/** Браузер со входом: тот же интерфейс, initData — 'session:<токен>'. Кнопок мессенджера нет. */
const webApp = (): TelegramWebApp | undefined => {
  const s = getSession();
  return s ? ({ ready() {}, expand() {}, initData: `session:${s}`, initDataUnsafe: {} } as TelegramWebApp) : undefined;
};

const telegramApp = (): TelegramWebApp | undefined => window.Telegram?.WebApp;
const maxApp = (): TelegramWebApp | undefined => (!telegramApp()?.initData && window.WebApp?.initData ? fromMax(window.WebApp) : undefined);

// Мессенджер, из которого открыта игра: Telegram, Max или обычный браузер (tg без initData или undefined).
export let tg: TelegramWebApp | undefined = maxApp() ?? (telegramApp()?.initData ? telegramApp() : (webApp() ?? telegramApp()));
export let platform: 'tg' | 'max' | 'web' = maxApp() ? 'max' : telegramApp()?.initData ? 'tg' : 'web';

/** Подождать скрипт Max (index.html), чтобы узнать, открыта ли игра из Max. Не дольше пары секунд. */
export async function detectPlatform(): Promise<void> {
  await window.__maxReady?.catch(() => {});
  const max = maxApp();
  if (max) {
    tg = max;
    platform = 'max';
  }
}

/** Вошёл ли браузер через Яндекс или Telegram (сессия сервера). */
export const signedInWeb = () => platform === 'web' && !!getSession();

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

/** Откуда открыли приложение (метка src-, приглашение, кнопка бота…) — для статистики. */
export const appSource = (): string => launchSource(startParam(), location.search, platform);

export const friendInviteLink = (token: string, bot: { username: string | null; running: boolean }): string => maxLink(`friend-${token}`) ?? friendLink(token, bot, BOT_USERNAME, location.origin);

/** Вкладка из адреса: кнопки бота о рейде открывают клан (?tab=clan), о друзьях — друзей (?tab=friends). */
export const startTab = (): string | null => {
  // В Max кнопка бота передаёт вкладку параметром запуска: tab-clan.
  const p = startParam();
  if (p?.startsWith('tab-')) return p.slice(4);
  return new URLSearchParams(location.search).get('tab');
};

// Имя бота известно и без токена на сервере: ссылки-приглашения всегда ведут в Telegram.
export const BOT_USERNAME = 'ArenaNikitenokBot';

/** Оплатить счёт в Telegram: дождётся, чем закончилось окно оплаты. Вне Telegram — 'failed'. */
export function openInvoice(url: string): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> {
  return new Promise((resolve) => (platform === 'tg' && tg?.openInvoice ? tg.openInvoice(url, resolve) : resolve('failed')));
}

/** Покупки за звёзды — только в Telegram: из Max и браузера ведём в бота, игра откроется сразу на нужном экране (pass, shop). */
export function openPassInTelegram(tab = 'pass'): void {
  const url = `https://t.me/${BOT_USERNAME}?startapp=tab-${tab}`;
  const open = (tg as { openLink?: (url: string) => void } | undefined)?.openLink;
  if (open && tg?.initData) open.call(tg, url);
  else window.open(url, '_blank', 'noopener');
}

// Имя бота в Max: сервер узнаёт его у Max (/me) и присылает с прогрессом (src/cloud.ts).
let maxBot: string | null = null;
export const setMaxBot = (name: string | null | undefined) => (maxBot = name || null);
/** В Max приглашения ведут в мини-приложение Max: max.ru/<бот>?startapp=… */
const maxLink = (param: string) => (platform === 'max' && maxBot ? `https://max.ru/${maxBot}?startapp=${param}` : null);

// Пока на сервере нет токена, бот не отвечает на /start, поэтому ссылка сразу открывает
// мини-приложение (startapp). Когда бот запущен, ссылка ведёт в бота, и он присылает кнопку входа.
const link = (param: string, bot: { username: string | null; running: boolean }) => {
  const max = maxLink(param);
  if (max) return max;
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
