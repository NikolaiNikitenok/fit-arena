import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { adminStatsUrl, cloudState, deleteMyData, onCloud } from './cloud';
import { openPrivacy } from './privacy';
import { addCharge, CHARGE_MAX } from './game/resources';
import { loadProgress, saveProgress } from './game/progress';

/** Ссылка на политику конфиденциальности. */
export function PrivacyLink() {
  return (
    <button className="link inline settings-link" onClick={openPrivacy}>
      Политика конфиденциальности
    </button>
  );
}

/** «Статистика (админ)»: видна только тем, кого сервер считает админом. */
export function AdminStatsRow() {
  const [admin, setAdmin] = useState(() => !!cloudState()?.admin);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onCloud((c) => setAdmin(c.admin)), []);
  if (!admin) return null;
  const open = () => {
    setError(null);
    adminStatsUrl()
      .then(setUrl)
      .catch(() => setError('Не открылось: сервер не подтвердил доступ'));
  };
  return (
    <>
      <button className="secondary" onClick={open}>
        Статистика (админ)
      </button>
      {error && <div className="muted">{error}</div>}
      {url &&
        createPortal(
        <div className="admin-stats" onClick={(e) => e.stopPropagation()}>
          <div className="admin-stats-head">
            <b>Статистика</b>
            <button className="small-btn ghost" onClick={() => setUrl(null)}>
              Закрыть
            </button>
          </div>
          <iframe src={url} title="Статистика" />
        </div>,
          document.body,
        )}
    </>
  );
}

/**
 * «Админ: заряд подземелья до максимума» — чтобы проверять «три в ряд», не тренируясь между этажами.
 * Только в этом телефоне (облако подхватит при следующем сохранении); приложение перезапускается,
 * чтобы экран не затёр заряд старым прогрессом.
 */
export function AdminChargeRow() {
  const [admin, setAdmin] = useState(() => !!cloudState()?.admin);
  useEffect(() => onCloud((c) => setAdmin(c.admin)), []);
  if (!admin) return null;
  return (
    <button
      className="secondary"
      onClick={() => {
        saveProgress(addCharge(loadProgress(), CHARGE_MAX));
        location.reload();
      }}
    >
      Админ: заряд подземелья до {CHARGE_MAX} ⚡
    </button>
  );
}

/** «Удалить мои данные»: стирает всё на сервере и в телефоне, после подтверждения. */
export function DeleteDataRow() {
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'error'>('idle');
  const run = () => {
    setStep('busy');
    deleteMyData()
      .then(() => {
        try {
          localStorage.clear();
        } catch {
          // Хранилище недоступно — на телефоне и так ничего не осталось.
        }
        location.reload();
      })
      .catch(() => setStep('error'));
  };
  if (step === 'idle' || step === 'error')
    return (
      <>
        <button className="link danger-link" onClick={() => setStep('confirm')}>
          Удалить мои данные
        </button>
        {step === 'error' && <div className="muted">Не получилось связаться с сервером. Попробуй ещё раз позже.</div>}
      </>
    );
  return (
    <div className="danger-row delete-row">
      <span>Удалить прогресс, кубки, клан, друзей и статистику с сервера и с телефона? Это нельзя отменить.</span>
      <button className="small-btn danger" disabled={step === 'busy'} onClick={run}>
        {step === 'busy' ? 'Удаляю…' : 'Удалить'}
      </button>
      <button className="small-btn ghost" disabled={step === 'busy'} onClick={() => setStep('idle')}>
        Отмена
      </button>
    </div>
  );
}
