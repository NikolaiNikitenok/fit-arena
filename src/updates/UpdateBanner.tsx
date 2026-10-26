import { useEffect, useState } from 'react';
import { sfx } from '../audio';
import { Check, Cross } from '../icons';
import { useIsBusy } from './busy';
import { ChangeEntry } from './changelog';
import { applyUpdate, initUpdates, markSeen, newEntries, unseenEntries, useRemoteUpdate } from './updates';
import './updates.css';

const SNOOZE = 10 * 60_000;

/**
 * Плашка сверху: «Вышло обновление» с тем, что нового, и кнопкой «Обновить».
 * Во время боя и тренировки не показывается. «Позже» прячет её до конца следующего боя или на 10 минут.
 * После обновления (или если игру просто перезапустили на новой версии) показывает, что изменилось.
 */
export function UpdateBanner() {
  const remote = useRemoteUpdate();
  const busy = useIsBusy();
  const [snoozed, setSnoozed] = useState(false);
  const [wasBusy, setWasBusy] = useState(false);
  const [fresh, setFresh] = useState<ChangeEntry[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    initUpdates();
    // Что нового в этой сборке: чуть позже первого кадра, чтобы не мешать заставке.
    const t = setTimeout(() => setFresh(unseenEntries()), 1800);
    return () => clearTimeout(t);
  }, []);

  // Закончил бой — снова можно предложить обновление.
  useEffect(() => {
    if (busy) setWasBusy(true);
    else if (wasBusy) {
      setWasBusy(false);
      setSnoozed(false);
    }
  }, [busy, wasBusy]);
  useEffect(() => {
    if (!snoozed) return;
    const t = setTimeout(() => setSnoozed(false), SNOOZE);
    return () => clearTimeout(t);
  }, [snoozed]);

  const mode = busy ? null : remote && !snoozed ? 'update' : fresh.length ? 'fresh' : null;
  const entries = mode === 'update' ? newEntries(remote!) : fresh;

  useEffect(() => {
    if (!mode) return;
    setLeaving(false);
    sfx('whoosh');
    // Увиденное в плашке не показываем второй раз после перезагрузки.
    markSeen(Math.max(0, ...entries.map((e) => e.n)));
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
            <div className="upd-kicker">{mode === 'update' ? 'Вышло обновление' : 'Игра обновилась'}</div>
            <div className="upd-title">{entries.length === 1 ? entries[0].title : entries.length ? 'Что нового' : 'Улучшения и исправления'}</div>
          </div>
          {mode === 'fresh' && (
            <button className="upd-x" aria-label="Закрыть" onClick={() => close(() => setFresh([]))}>
              <Cross size={16} />
            </button>
          )}
        </div>
        {entries.length > 0 ? (
          <div className="upd-list">
            {entries.map((e) => (
              <div key={e.n} className="upd-entry">
                {entries.length > 1 && <div className="upd-entry-title">{e.title}</div>}
                {e.items.map((it, i) => (
                  <div key={i} className="upd-item">
                    <Check size={14} />
                    <span>{it}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="upd-plain">Игра стала стабильнее и быстрее. Обновление займёт пару секунд, прогресс сохранится.</div>
        )}
        {mode === 'update' ? (
          <div className="upd-actions">
            <button className="upd-later" onClick={() => close(() => setSnoozed(true))}>
              Позже
            </button>
            <button
              className="upd-go"
              disabled={updating}
              onClick={() => {
                setUpdating(true);
                void applyUpdate(remote!.version);
              }}
            >
              {updating ? 'Сохраняем…' : 'Обновить'}
            </button>
          </div>
        ) : (
          <div className="upd-actions">
            <button className="upd-go" onClick={() => close(() => setFresh([]))}>
              Отлично
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
          <div className="upd-history-date">{new Date(e.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="upd-history-title">{e.title}</div>
          {e.items.map((it, i) => (
            <div key={i} className="upd-item">
              <Check size={14} />
              <span>{it}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
