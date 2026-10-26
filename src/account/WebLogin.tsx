// Вход в браузере: Яндекс ID и Telegram Login Widget (server/webAuth.ts). Без входа можно играть гостем,
// но без рейтинга и клана; после входа гостевой прогресс переезжает в аккаунт (если там пусто).
import { useEffect, useRef, useState } from 'react';
import { getSession, loginError, platform, setSession } from '../telegram';

const ERRORS: Record<string, string> = {
  'yandex-off': 'Вход через Яндекс ещё не настроен на сервере.',
  yandex: 'Яндекс не подтвердил вход. Попробуй ещё раз.',
};

type Auth = { yandex: boolean; telegram: string | null };

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
function TelegramButton({ bot, onError }: { bot: string; onError: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.__arenaTgAuth = (user) =>
      void fetch('/api/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((r: { session: string }) => {
          setSession(r.session);
          location.reload();
        })
        .catch(() => onError('Telegram не подтвердил вход. Попробуй ещё раз.'));
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

/** Кнопки входа: показываются только в обычном браузере и только гостю. */
export function WebLoginButtons() {
  const auth = useAuth();
  const [error, setError] = useState(() => (loginError ? (ERRORS[loginError] ?? 'Не получилось войти.') : ''));
  if (platform !== 'web' || getSession()) return null;
  return (
    <div className="web-login">
      {auth?.yandex && (
        <a className="secondary btn-link web-login-ya" href="/api/auth/yandex/start">
          Войти через Яндекс
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
          <div className="toggle-title">Аккаунт</div>
          <div className="muted">Сейчас ты играешь гостем: без рейтинга и клана, прогресс только в этом браузере. Войди, и герой станет общим с Telegram и Max.</div>
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
      Выйти
    </button>
  );
}
