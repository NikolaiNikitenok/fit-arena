import { useEffect, useState } from 'react';
import { sfx } from '../audio';
import { Check, Cross } from '../icons';
import { useIsBusy } from './busy';
import { ChangeEntry } from './changelog';
import { applyUpdate, deferUpdate, initUpdates, markSeen, newEntries, unseenEntries, useRemoteUpdate, setBannerOpen } from './updates';
import './updates.css';
import { t, locale } from '../i18n';
import { APP_VERSION } from '../telemetry';

/**
 * Плашка с описанием обновления. Во время боя и тренировки не показывается.
 * «После перезапуска» откладывает эту версию до следующего запуска приложения.
 * После обновления (или если игру просто перезапустили на новой версии) показывает, что изменилось.
 */
export function UpdateBanner() {
  const remote = useRemoteUpdate();
  const busy = useIsBusy();
  const [fresh, setFresh] = useState<ChangeEntry[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    initUpdates();
    // Что нового в этой сборке: чуть позже первого кадра, чтобы не мешать заставке.
    const tm = setTimeout(() => setFresh(unseenEntries()), 1800);
    return () => clearTimeout(tm);
  }, []);

  const mode = busy ? null : remote ? 'update' : fresh.length ? 'fresh' : null;
  const entries = mode === 'update' ? newEntries(remote!) : fresh;

  useEffect(() => {
    setBannerOpen(!!mode);
    return () => setBannerOpen(false);
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    setLeaving(false);
    sfx('whoosh');
    // Увиденное в плашке не показываем второй раз после перезагрузки.
    if (mode === 'fresh') markSeen(Math.max(0, ...entries.map((e) => e.n)));
  }, [mode, remote?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mode) return null;

  const close = (then: () => void) => {
    setLeaving(true);
    setTimeout(then, 220);
  };

  return (
    <div className={`upd ${leaving ? 'out' : ''}`} role="status">
      <div className="upd-card">
        <div className="upd-head">
          <div className="upd-badge">
            <UpdateIcon done={mode === 'fresh'} />
          </div>
          <div className="upd-titles">
            <div className="upd-kicker">{mode === 'update' ? t('Вышло обновление') : t('Игра обновилась')}</div>
            <div className="upd-version">{t('Обновление {0}', { 0: mode === 'update' ? remote!.version : APP_VERSION })}</div>
            <div className="upd-title">{entries.length === 1 ? t(entries[0].title) : entries.length ? t('Что нового') : t('Улучшения и исправления')}</div>
          </div>
          {mode === 'fresh' && (
            <button className="upd-x" aria-label={t('Закрыть')} onClick={() => close(() => setFresh([]))}>
              <Cross size={16} />
            </button>
          )}
        </div>
        {entries.length > 0 ? (
          <div className="upd-list">
            {entries.map((e) => (
              <div key={e.n} className="upd-entry">
                {entries.length > 1 && <div className="upd-entry-title">{t(e.title)}</div>}
                {e.items.map((it, i) => (
                  <div key={i} className="upd-item">
                    <Check size={14} />
                    <span>{t(it)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="upd-plain">{t('Игра стала стабильнее и быстрее. Обновление займёт пару секунд, прогресс сохранится.')}</div>
        )}
        {mode === 'update' && <div className="upd-plain">{t('Можно обновить сейчас или продолжить игру. После перезапуска откроется новая версия.')}</div>}
        {mode === 'update' ? (
          <div className="upd-actions">
            <button className="upd-later" disabled={updating || leaving} onClick={() => close(() => { setFresh([]); deferUpdate(remote!.version); })}>
              {t('После перезапуска')}
            </button>
            <button
              className="upd-go"
              disabled={updating || leaving}
              onClick={() => {
                setUpdating(true);
                void applyUpdate(remote!.version).then((started) => { if (!started) setUpdating(false); });
              }}
            >
              {updating ? t('Сохраняем…') : t('Обновить сейчас')}
            </button>
          </div>
        ) : (
          <div className="upd-actions">
            <button className="upd-go" onClick={() => close(() => setFresh([]))}>
              {t('Отлично')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Стрелка обновления; после обновления — галочка. */
function UpdateIcon({ done }: { done: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {done ? <path d="M5 12.5l4.2 4.2L19 7" /> : <path d="M12 19V6M6.5 11.5L12 6l5.5 5.5M5 3.5h14" />}
    </svg>
  );
}

/** «История обновлений» в настройках: все записи этой сборки. */
export function ChangesList({ entries }: { entries: ChangeEntry[] }) {
  return (
    <div className="upd-history">
      {entries.map((e) => (
        <div key={e.n} className="upd-history-entry">
          <div className="upd-history-date">{new Date(e.date + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="upd-history-title">{t('Обновление №{0}', { 0: e.n })} · {t(e.title)}</div>
          {e.items.map((it, i) => (
            <div key={i} className="upd-item">
              <Check size={14} />
              <span>{t(it)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
