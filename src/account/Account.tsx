// Единый аккаунт: какие входы привязаны, код для другой платформы и ввод кода (server/accountApi.ts).
import { useEffect, useState } from 'react';
import { cloudState, onCloud, post, switchAccount } from '../cloud';
import type { Progress } from '../game/progress';
import { Sheet } from '../Sheet';
import { WebLogoutButton } from './WebLogin';

interface HeroCard {
  level: number;
  stages: number;
  cups: number;
  clan?: string;
}
interface Status {
  id: string;
  login: string;
  logins: { login: string; platform: 'tg' | 'max' | 'ya' | null }[];
  notify: 'tg' | 'max' | null;
}

const PLATFORM: Record<string, string> = { tg: 'Telegram', max: 'Max', ya: 'Яндекс' };
const loginText = (l: { login: string; platform: string | null }) => `${PLATFORM[l.platform ?? ''] ?? 'Вход'} · ${l.login.slice(l.login.indexOf(':') + 1)}`;
const errText = (e: { body?: { error?: string } }) => e.body?.error ?? 'Не получилось связаться с сервером. Попробуй ещё раз.';

/** Можно ли привязывать: вошёл через мессенджер (ответ сервера). Гостям из браузера — нет. */
function useLinkable(): boolean {
  const [ok, setOk] = useState(() => !!cloudState()?.linkable);
  useEffect(() => onCloud((c) => setOk(c.linkable)), []);
  return ok;
}

/** Блок «Аккаунт» в настройках. */
export function AccountRow() {
  const linkable = useLinkable();
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [enter, setEnter] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (linkable) post('/api/account/status', {}).then(setStatus, () => null);
  }, [linkable]);
  if (!linkable) return null;
  const unlink = (login: string) =>
    post('/api/account/unlink', { login }).then(
      (s: Status) => setStatus(s),
      (e) => setError(errText(e)),
    );
  return (
    <div className="toggle-row account-row">
      <div className="account-body">
        <div>
          <div className="toggle-title">Аккаунт</div>
          <div className="muted">Один герой в Telegram, Max и браузере. Возьми код здесь и введи его на другой платформе, и прогресс, клан и деревня будут общими.</div>
        </div>
        {status?.logins.map((l) => (
          <div key={l.login} className="account-login">
            <span>{loginText(l)}</span>
            {l.login === status.login ? (
              <span className="muted">сейчас</span>
            ) : (
              <button className="small-btn ghost" onClick={() => unlink(l.login)}>
                Отвязать
              </button>
            )}
          </div>
        ))}
        {status && new Set(status.logins.map((l) => l.platform)).size > 1 && (
          <label className="account-notify">
            <span>Напоминания и вести от бота</span>
            <select
              value={status.notify ?? ''}
              onChange={(e) =>
                post('/api/account/notify', { platform: e.target.value || null }).then(
                  (s: Status) => setStatus(s),
                  (err) => setError(errText(err)),
                )
              }
            >
              <option value="">Где заходил последним</option>
              <option value="tg">Telegram</option>
              <option value="max">Max</option>
            </select>
          </label>
        )}
        {code ? (
          <div className="account-code">
            <b>{code.code}</b>
            <span className="muted">Введи этот код на другой платформе в течение 10 минут: «Настройки» → «Аккаунт» → «Ввести код».</span>
          </div>
        ) : null}
        <div className="account-actions">
          <button className="small-btn ghost" onClick={() => post('/api/account/code', {}).then(setCode, (e) => setError(errText(e)))}>
            {code ? 'Новый код' : 'Получить код'}
          </button>
          <button className="small-btn ghost" onClick={() => setEnter(true)}>
            Ввести код
          </button>
          <WebLogoutButton />
        </div>
        {error && <div className="muted">{error}</div>}
      </div>
      {enter && <LinkSheet onClose={() => setEnter(false)} />}
    </div>
  );
}

/** Кнопка «У меня уже есть герой» для первого входа (видна, только если можно привязать). */
export function HaveHeroButton() {
  const linkable = useLinkable();
  const [open, setOpen] = useState(false);
  if (!linkable) return null;
  return (
    <>
      <button className="link" onClick={() => setOpen(true)}>
        У меня уже есть герой
      </button>
      {open && <LinkSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const cardText = (c: HeroCard) => [`Герой ${c.level} уровня`, `${c.stages} уровней пройдено`, c.cups ? `${c.cups} кубков` : '', c.clan ? `клан «${c.clan}»` : ''].filter(Boolean).join(' · ');

/** Ввод кода с другой платформы; если герои есть с обеих сторон — выбор, кого оставить. */
export function LinkSheet({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<{ here: HeroCard; there: HeroCard } | null>(null);
  const link = (keep?: 'here' | 'there') => {
    setBusy(true);
    setError('');
    post('/api/account/link', { code, keep })
      .then((r: { ok?: boolean; id?: string; progress?: Progress | null; conflict?: { here: HeroCard; there: HeroCard } }) => {
        if (r.conflict) return setConflict(r.conflict), setBusy(false);
        if (r.ok && r.id) switchAccount(r.id, r.progress ?? null);
      })
      .catch((e) => {
        setError(errText(e));
        setBusy(false);
      });
  };
  return (
    <Sheet onClose={onClose}>
      <div className="level-title">У меня уже есть герой</div>
      {!conflict ? (
        <>
          <div className="muted">На платформе, где ты уже играешь, открой «Настройки» → «Аккаунт» → «Получить код» и введи его здесь.</div>
          <div className="join">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Код" maxLength={6} autoCapitalize="characters" />
            <button disabled={busy || code.length !== 6} onClick={() => link()}>
              {busy ? '…' : 'Привязать'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="muted">Герой есть и здесь, и там. Объединить их нельзя: выбери, кем играть дальше. Второй пропадёт из игры (копия его прогресса хранится 30 дней).</div>
          <div className="account-choice">
            <div className="settings-note">
              <b>Тот, чей код</b>
              <div>{cardText(conflict.there)}</div>
              <button className="small-btn" disabled={busy} onClick={() => link('there')}>
                Играть им
              </button>
            </div>
            <div className="settings-note">
              <b>Этот, здесь</b>
              <div>{cardText(conflict.here)}</div>
              <button className="small-btn ghost" disabled={busy} onClick={() => link('here')}>
                Оставить этого
              </button>
            </div>
          </div>
        </>
      )}
      {error && <div className="muted">{error}</div>}
    </Sheet>
  );
}
