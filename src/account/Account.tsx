// Единый аккаунт: какие входы привязаны, код для другой платформы и ввод кода (server/accountApi.ts).
import { useEffect, useState } from 'react';
import { cloudState, localBackup, onCloud, post, restoreLocalBackup, switchAccount, syncNow } from '../cloud';
import { heroLevel, heroXp, loadProgress, type Progress } from '../game/progress';
import { Sheet } from '../Sheet';
import { WebLogoutButton } from './WebLogin';
import { t, locale } from '../i18n';

interface HeroCard {
  level: number;
  stages: number;
  cups: number;
  clan?: string;
}
interface Status {
  id: string;
  login: string;
  logins: { login: string; platform: 'tg' | 'max' | 'ya' | 'nid' | null }[];
  notify: 'tg' | 'max' | null;
  archived?: { at: number; card: HeroCard }[];
}

/** Герой этого телефона: сервер мог не успеть получить его копию, поэтому сообщаем о нём при привязке. */
const localCard = () => {
  const p = loadProgress();
  return { level: heroLevel(heroXp(p)).level, stages: Object.keys(p.stars ?? {}).length, days: Object.keys(p.days ?? {}).length };
};
/** Сначала отдаём серверу свою копию героя, чтобы он сравнивал настоящих героев. */
const pushLocal = () => syncNow(loadProgress()).catch(() => {});

const PLATFORM: Record<string, string> = { tg: 'Telegram', max: 'Max', ya: t('Яндекс'), nid: 'Nikitenok ID' };
// У Nikitenok ID номер длинный: хватит начала.
const loginText = (l: { login: string; platform: string | null }) => `${PLATFORM[l.platform ?? ''] ?? t('Вход')} · ${l.login.slice(l.login.indexOf(':') + 1, l.platform === 'nid' ? l.login.indexOf(':') + 7 : undefined)}`;
const errText = (e: { body?: { error?: string } }) => e.body?.error ?? t('Не получилось связаться с сервером. Попробуй ещё раз.');

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
  const [sure, setSure] = useState<number | null>(null);
  const [backup] = useState(localBackup);
  useEffect(() => {
    if (linkable) post('/api/account/status', {}).then(setStatus, () => null);
  }, [linkable]);
  if (!linkable) return null;
  const unlink = (login: string) =>
    post('/api/account/unlink', { login }).then(
      (s: Status) => setStatus(s),
      (e) => setError(errText(e)),
    );
  const restore = (a: { at: number; card: HeroCard }) => {
    // Второе нажатие подтверждает: confirm() в части клиентов Telegram не показывается.
    if (sure !== a.at) return setSure(a.at);
    post('/api/account/restore', { at: a.at }).then(
      (r: { ok?: boolean; id?: string; progress?: Progress | null }) => r.ok && r.id && switchAccount(r.id, r.progress ?? null),
      (e) => setError(errText(e)),
    );
  };
  return (
    <div className="toggle-row account-row">
      <div className="account-body">
        <div>
          <div className="toggle-title">{t('Аккаунт')}</div>
          <div className="muted">{t('Один герой в Telegram, Max и браузере. Возьми код здесь и введи его на другой платформе, и прогресс, клан и деревня будут общими.')}</div>
        </div>
        {status?.logins.map((l) => (
          <div key={l.login} className="account-login">
            <span>{loginText(l)}</span>
            {l.login === status.login ? (
              <span className="muted">{t('сейчас')}</span>
            ) : (
              <button className="small-btn ghost" onClick={() => unlink(l.login)}>
                {t('Отвязать')}
              </button>
            )}
          </div>
        ))}
        {status && new Set(status.logins.map((l) => l.platform)).size > 1 && (
          <label className="account-notify">
            <span>{t('Напоминания и вести от бота')}</span>
            <select
              value={status.notify ?? ''}
              onChange={(e) =>
                post('/api/account/notify', { platform: e.target.value || null }).then(
                  (s: Status) => setStatus(s),
                  (err) => setError(errText(err)),
                )
              }
            >
              <option value="">{t('Где заходил последним')}</option>
              <option value="tg">Telegram</option>
              <option value="max">Max</option>
            </select>
          </label>
        )}
        {code ? (
          <div className="account-code">
            <b>{code.code}</b>
            <span className="muted">{t('Введи этот код на другой платформе в течение 10 минут: «Настройки» → «Аккаунт» → «Ввести код».')}</span>
          </div>
        ) : null}
        <div className="account-actions">
          <button className="small-btn ghost" onClick={() => pushLocal().then(() => post('/api/account/code', {})).then(setCode, (e) => setError(errText(e)))}>
            {code ? t('Новый код') : t('Получить код')}
          </button>
          <button className="small-btn ghost" onClick={() => setEnter(true)}>
            {t('Ввести код')}
          </button>
          <WebLogoutButton />
        </div>
        {backup && (
          <div className="account-archive">
            <div className="toggle-title">{t('Копия героя на этом телефоне')}</div>
            <div className="muted">{t('Игра сохранила её перед сменой аккаунта.')}</div>
            <div className="account-login">
              <span>
                {t('Герой {0} уровня · {1} уровней пройдено', { 0: backup.level, 1: backup.stages })}
                <span className="muted"> · {new Date(backup.at).toLocaleDateString(locale())}</span>
              </span>
              <button className="small-btn" onClick={() => (sure === -1 ? restoreLocalBackup().catch((e) => setError(errText(e))) : setSure(-1))}>
                {sure === -1 ? t('Точно вернуть?') : t('Вернуть')}
              </button>
            </div>
          </div>
        )}
        {!!status?.archived?.length && (
          <div className="account-archive">
            <div className="toggle-title">{t('Прежние герои')}</div>
            <div className="muted">{t('Герои, которых не выбрали при привязке, хранятся 30 дней. Можно вернуть любого: нынешний тогда уйдёт сюда же.')}</div>
            {status.archived.map((a) => (
              <div key={a.at} className="account-login">
                <span>
                  {cardText(a.card)}
                  <span className="muted"> {t('· отложен {0}', { 0: new Date(a.at).toLocaleDateString(locale()) })}</span>
                </span>
                <button className="small-btn" onClick={() => restore(a)}>
                  {sure === a.at ? t('Точно вернуть?') : t('Вернуть')}
                </button>
              </div>
            ))}
          </div>
        )}
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
        {t('У меня уже есть герой')}
      </button>
      {open && <LinkSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const cardText = (c: HeroCard) => [t('Герой {0} уровня', { 0: c.level }), t('{0} уровней пройдено', { 0: c.stages }), c.cups ? t('{0} кубков', { 0: c.cups }) : '', c.clan ? t('клан «{0}»', { 0: c.clan }) : ''].filter(Boolean).join(' · ');

/** Ввод кода с другой платформы; если герои есть с обеих сторон — выбор, кого оставить. */
export function LinkSheet({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<{ here: HeroCard; there: HeroCard } | null>(null);
  const [sure, setSure] = useState<'here' | 'there' | null>(null);
  const link = (keep?: 'here' | 'there') => {
    setBusy(true);
    setError('');
    pushLocal()
      .then(() => post('/api/account/link', { code, keep, local: localCard() }))
      .then((r: { ok?: boolean; id?: string; progress?: Progress | null; conflict?: { here: HeroCard; there: HeroCard } }) => {
        if (r.conflict) return setConflict(r.conflict), setBusy(false);
        if (!r.ok || !r.id) return;
        // Остался герой этого телефона: его копия здесь самая свежая, серверную не берём.
        if (r.id === cloudState()?.account) return location.reload();
        switchAccount(r.id, r.progress ?? null);
      })
      .catch((e) => {
        setError(errText(e));
        setBusy(false);
      });
  };
  return (
    <Sheet onClose={onClose}>
      <div className="level-title">{t('У меня уже есть герой')}</div>
      {!conflict ? (
        <>
          <div className="muted">{t('На платформе, где ты уже играешь, открой «Настройки» → «Аккаунт» → «Получить код» и введи его здесь.')}</div>
          <div className="join">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder={t('Код')} maxLength={6} autoCapitalize="characters" />
            <button disabled={busy || code.length !== 6} onClick={() => link()}>
              {busy ? '…' : t('Привязать')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="muted">{t('Герой есть и здесь, и там. Объединить их нельзя: выбери, кем играть дальше. Второй уйдёт в архив: его можно вернуть в «Настройки» → «Аккаунт» в течение 30 дней.')}</div>
          <div className="account-choice">
            {(['there', 'here'] as const).map((side) => {
              const c = conflict[side];
              const other = conflict[side === 'here' ? 'there' : 'here'];
              const stronger = c.level > other.level || (c.level === other.level && c.stages >= other.stages);
              return (
                <div key={side} className="settings-note">
                  <b>{side === 'there' ? t('Герой с платформы, где брал код') : t('Герой на этой платформе')}</b>
                  <div>{cardText(c)}</div>
                  <button
                    className={stronger ? 'small-btn' : 'small-btn ghost'}
                    disabled={busy}
                    onClick={() => (sure === side ? link(side) : setSure(side))}
                  >
                    {sure === side ? t('Точно? Герой {0} ур. уйдёт в архив', { 0: other.level }) : t('Оставить этого')}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {error && <div className="muted">{error}</div>}
    </Sheet>
  );
}
