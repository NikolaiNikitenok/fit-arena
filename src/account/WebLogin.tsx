// Вход в браузере: Nikitenok ID (главный, server/nidLogin.ts), Яндекс ID и Telegram Login Widget (server/webAuth.ts). Без входа можно играть гостем,
// но без рейтинга и клана; после входа гостевой прогресс переезжает в аккаунт (если там пусто).
import { useEffect, useRef, useState } from 'react';
import { getSession, loginError, platform, setSession } from '../telegram';
import { t } from '../i18n';

const ERRORS: Record<string, string> = {
  'yandex-off': t('Вход через Яндекс ещё не настроен на сервере.'),
  yandex: t('Яндекс не подтвердил вход. Попробуй ещё раз.'),
  'nid-off': t('Вход через Nikitenok ID ещё не настроен на сервере.'),
  nid: t('Nikitenok ID не подтвердил вход. Попробуй ещё раз.'),
  'nid-cancel': t('Вход отменён. Можно попробовать ещё раз.'),
};

type Auth = { nid?: boolean; yandex: boolean; telegram: string | null };

let options: Promise<Auth | null> | null = null;
function useAuth(): Auth | null {
  const [auth, setAuth] = useState<Auth | null>(null);
  useEffect(() => {
    options ??= fetch('/api/auth/options')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    void options.then(setAuth);
  }, []);
  return auth;
}

declare global {
  interface Window {
    __arenaTgAuth?: (user: Record<string, unknown>) => void;
  }
}

/** Кнопка Telegram Login Widget: скрипт с telegram.org рисует её сам (домен игры указан у бота в BotFather). */
function TelegramButton({ bot, onError }: { bot: string; onError: (tm: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.__arenaTgAuth = (user) =>
      void fetch('/api/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((r: { session: string }) => {
          setSession(r.session);
          location.reload();
        })
        .catch(() => onError(t('Telegram не подтвердил вход. Попробуй ещё раз.')));
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.dataset.telegramLogin = bot;
    s.dataset.size = 'large';
    s.dataset.radius = '12';
    s.dataset.onauth = '__arenaTgAuth(user)';
    s.dataset.requestAccess = 'write';
    box.current?.appendChild(s);
    return () => {
      box.current?.replaceChildren();
    };
  }, [bot, onError]);
  return <div ref={box} className="web-login-tg" />;
}

/** Знак Nikitenok ID: синий квадрат с «N» и золотой точкой — как на id.nikitenok.ru. */
export function NidLogo() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="nidL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6E93FF" />
          <stop offset=".55" stopColor="#2F4FD8" />
          <stop offset="1" stopColor="#121C66" />
        </linearGradient>
        <linearGradient id="nidG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBEBB5" />
          <stop offset="1" stopColor="#C9973C" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#nidL)" />
      <rect x=".5" y=".5" width="39" height="39" rx="10.5" fill="none" stroke="#fff" strokeOpacity=".22" />
      <path d="M12 28V12h3.2l9.6 10.4V12H28v16h-3.2L15.2 17.6V28z" fill="#fff" />
      <circle cx="31" cy="9" r="3" fill="url(#nidG)" />
    </svg>
  );
}

/** Главная кнопка входа: тёмно-синяя с золотой рамкой и бликом, с отметкой «Рекомендуем». */
function NidButton() {
  return (
    <a className="nid-btn" href="/api/auth/nid/start">
      <span className="nid-badge">{t('Рекомендуем')}</span>
      <span className="nid-logo">
        <NidLogo />
      </span>
      <span className="nid-text">
        <b>{t('Войти через Nikitenok ID')}</b>
        <small>{t('Один вход во все приложения Nikitenok')}</small>
      </span>
      <svg className="nid-go" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

/** Кнопки входа: показываются только в обычном браузере и только гостю. Nikitenok ID — первым и заметнее остальных. */
export function WebLoginButtons() {
  const auth = useAuth();
  const [error, setError] = useState(() => (loginError ? (ERRORS[loginError] ?? t('Не получилось войти.')) : ''));
  if (platform !== 'web' || getSession()) return null;
  return (
    <div className="web-login">
      {auth?.nid && <NidButton />}
      {auth?.nid && (auth.yandex || auth.telegram) && <div className="web-login-or">{t('или')}</div>}
      {auth?.yandex && (
        <a className="secondary btn-link web-login-ya" href="/api/auth/yandex/start">
          {t('Войти через Яндекс')}
        </a>
      )}
      {auth?.telegram && <TelegramButton bot={auth.telegram} onError={setError} />}
      {error && <div className="muted">{error}</div>}
    </div>
  );
}

/** Блок «Аккаунт» в настройках браузера, пока игрок не вошёл. */
export function WebLoginRow() {
  if (platform !== 'web' || getSession()) return null;
  return (
    <div className="toggle-row account-row">
      <div className="account-body">
        <div>
          <div className="toggle-title">{t('Аккаунт')}</div>
          <div className="muted">{t('Сейчас ты играешь гостем: без рейтинга и клана, прогресс только в этом браузере. Войди через Nikitenok ID, и герой станет общим с Telegram и Max.')}</div>
        </div>
        <WebLoginButtons />
      </div>
    </div>
  );
}

/** Выйти из аккаунта в браузере: дальше снова гость. */
export function WebLogoutButton() {
  if (platform !== 'web' || !getSession()) return null;
  return (
    <button
      className="small-btn ghost"
      onClick={() => {
        setSession(null);
        location.reload();
      }}
    >
      {t('Выйти')}
    </button>
  );
}
