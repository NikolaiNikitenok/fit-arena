import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { adminStatsUrl, cloudState, deleteMyData, onCloud } from './cloud';
import { openPrivacy } from './privacy';
import { addCharge, CHARGE_MAX } from './game/resources';
import { loadProgress, saveProgress } from './game/progress';
import { deviceHints, fpsCapped, sceneFps } from './devicePerf';
import { useSettings } from './settings';
import { t } from './i18n';

/** Ссылка на политику конфиденциальности. */
export function PrivacyLink() {
  return (
    <button className="link inline settings-link" onClick={openPrivacy}>
      {t('Политика конфиденциальности')}
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
      .catch(() => setError(t('Не открылось: сервер не подтвердил доступ')));
  };
  return (
    <>
      <FpsMeter />
      <button className="secondary" onClick={open}>
        Статистика (админ)
      </button>
      {error && <div className="muted">{error}</div>}
      {url &&
        createPortal(
        <div className="admin-stats" onClick={(e) => e.stopPropagation()}>
          <div className="admin-stats-head">
            <b>{t('Статистика')}</b>
            <button className="small-btn ghost" onClick={() => setUrl(null)}>
              {t('Закрыть')}
            </button>
          </div>
          <iframe src={url} title={t('Статистика')} />
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

/** Счётчик кадров для админа: сколько кадров даёт экран и сколько рисует 3D-сцена за листом настроек. */
function FpsMeter() {
  const s = useSettings();
  const [v, setV] = useState({ screen: 0, scene: 0 });
  useEffect(() => {
    let raf = 0;
    const stamps: number[] = [];
    let shown = 0;
    const tick = (t: number) => {
      stamps.push(t);
      while (t - stamps[0] > 1000) stamps.shift();
      if (t - shown > 500) {
        shown = t;
        setV({ screen: stamps.length, scene: sceneFps(t) });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const h = deviceHints();
  return (
    <div className="settings-note">
      <b>{t('FPS (админ):')}</b> {t('экран {0} · 3D {1} · экономный {2}', { 0: v.screen, 1: v.scene, 2: s.lowPower ? (s.lowPowerChosen ? t('вкл (сам)') : t('вкл (авто)')) : t('выкл') })}
      {fpsCapped() ? t(' · ограничен 30') : ''} · DPR {Math.round(devicePixelRatio * 100) / 100}
      {h.tgClass ? ` · ${h.tgClass}` : ''}
      {h.memory ? t(' · {0} ГБ', { 0: h.memory }) : ''}
      {h.cores ? t(' · {0} ядер', { 0: h.cores }) : ''}
    </div>
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
          {t('Удалить мои данные')}
        </button>
        {step === 'error' && <div className="muted">{t('Не получилось связаться с сервером. Попробуй ещё раз позже.')}</div>}
      </>
    );
  return (
    <div className="danger-row delete-row">
      <span>{t('Удалить прогресс, кубки, клан, друзей и статистику с сервера и с телефона? Это нельзя отменить.')}</span>
      <button className="small-btn danger" disabled={step === 'busy'} onClick={run}>
        {step === 'busy' ? t('Удаляю…') : t('Удалить')}
      </button>
      <button className="small-btn ghost" disabled={step === 'busy'} onClick={() => setStep('idle')}>
        {t('Отмена')}
      </button>
    </div>
  );
}
