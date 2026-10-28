import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Recalibration, Thresholds } from './calibration';
import { CalibrationOverlay } from './CalibrationOverlay';
import { EXERCISE_LABELS, RepExercise } from './repCounter';
import { useRepCamera } from './useRepCamera';
import { t } from './i18n';

type Phase = 'intro' | 'loading' | 'running' | 'review' | 'error';

const range = (t: Thresholds) => `${t.down}° → ${t.up}°`;

/** Повторная калибровка одного упражнения из настроек. Прежние пороги остаются,
 *  пока игрок не нажмёт «Сохранить»; отмена и сбой камеры ничего не меняют. */
export function RecalibrateScreen({ exercise, onClose }: { exercise: RepExercise; onClose: () => void }) {
  const camera = useRepCamera();
  const recal = useRef(new Recalibration(exercise)).current;
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Thresholds | null>(null);

  // Три повтора досчитаны: камера больше не нужна, показываем старые и новые пороги.
  const done = camera.calib?.result;
  useEffect(() => {
    if (phase !== 'running' || !done) return;
    recal.finish(done);
    setResult(done);
    // Даём секунду на «Готово» на полоске, потом сравнение.
    const t = setTimeout(() => {
      camera.stop();
      setPhase('review');
    }, 900);
    return () => clearTimeout(t);
  }, [phase, done]);

  const begin = async () => {
    setPhase('loading');
    try {
      await camera.start(exercise, () => {}, undefined, { calibrate: true, persist: false });
      setPhase('running');
    } catch (e) {
      camera.stop();
      setError(e instanceof Error ? e.message : t('не загрузилась модель распознавания'));
      setPhase('error');
    }
  };

  const close = () => {
    camera.stop();
    onClose();
  };

  const label = EXERCISE_LABELS[exercise];
  // Поверх всего экрана: внутри шторки настроек fixed-слой обрезался бы её анимацией.
  return createPortal(
    <div className="recal">
      <div className="recal-cam">
        <video ref={camera.videoRef} playsInline muted />
        <canvas ref={camera.canvasRef} />
      </div>
      {phase === 'running' && camera.calib && <CalibrationOverlay exercise={exercise} view={camera.calib} onSkip={close} again />}
      {phase === 'running' && camera.hint && !done && <div className="recal-hint">{camera.hint}</div>}
      {phase !== 'running' && (
        <div className="calib">
          <div className="calib-card">
            <div className="level-tag">{t('Калибровка · {0}', { 0: label })}</div>
            {phase === 'intro' || phase === 'loading' ? (
              <>
                <div className="calib-title">{t('Пройти заново')}</div>
                <div className="muted light">
                  {t('Поставь телефон так, чтобы камера видела тебя целиком, и сделай 3 медленных повтора.')}
                  {recal.before ? t(' Прежняя калибровка ({0}) останется, пока не сохранишь новую.', { 0: range(recal.before) }) : ''}
                </div>
                <button className="primary" disabled={phase === 'loading'} onClick={begin}>
                  {phase === 'loading' ? t('Включаю камеру…') : t('Начать')}
                </button>
                <button className="small-btn ghost" onClick={close}>
                  {t('Отмена')}
                </button>
              </>
            ) : phase === 'error' ? (
              <>
                <div className="calib-title">{t('Камера не запустилась')}</div>
                <div className="muted light">{t('{0}. Прежняя калибровка не изменилась.', { 0: error })}</div>
                <button className="primary" onClick={begin}>
                  {t('Попробовать ещё')}
                </button>
                <button className="small-btn ghost" onClick={close}>
                  {t('Закрыть')}
                </button>
              </>
            ) : (
              <>
                <div className="calib-title">{t('Новая калибровка готова')}</div>
                <div className="recal-compare">
                  <div>
                    <div className="muted">{t('Прежняя')}</div>
                    <b>{recal.before ? range(recal.before) : t('общие пороги')}</b>
                  </div>
                  <div>
                    <div className="muted">{t('Новая')}</div>
                    <b>{result && range(result)}</b>
                  </div>
                </div>
                <div className="muted light">{t('Повтор засчитывается, когда угол уходит ниже первого числа и возвращается выше второго.')}</div>
                <button
                  className="primary"
                  onClick={() => {
                    recal.save();
                    close();
                  }}
                >
                  {t('Сохранить')}
                </button>
                <button className="small-btn ghost" onClick={close}>
                  {t('Оставить прежнюю')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
