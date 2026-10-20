import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Recalibration, Thresholds } from './calibration';
import { CalibrationOverlay } from './CalibrationOverlay';
import { EXERCISE_LABELS, RepExercise } from './repCounter';
import { useRepCamera } from './useRepCamera';

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
      setError(e instanceof Error ? e.message : 'не загрузилась модель распознавания');
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
            <div className="level-tag">Калибровка · {label}</div>
            {phase === 'intro' || phase === 'loading' ? (
              <>
                <div className="calib-title">Пройти заново</div>
                <div className="muted light">
                  Поставь телефон так, чтобы камера видела тебя целиком, и сделай 3 медленных повтора.
                  {recal.before ? ` Прежняя калибровка (${range(recal.before)}) останется, пока не сохранишь новую.` : ''}
                </div>
                <button className="primary" disabled={phase === 'loading'} onClick={begin}>
                  {phase === 'loading' ? 'Включаю камеру…' : 'Начать'}
                </button>
                <button className="small-btn ghost" onClick={close}>
                  Отмена
                </button>
              </>
            ) : phase === 'error' ? (
              <>
                <div className="calib-title">Камера не запустилась</div>
                <div className="muted light">{error}. Прежняя калибровка не изменилась.</div>
                <button className="primary" onClick={begin}>
                  Попробовать ещё
                </button>
                <button className="small-btn ghost" onClick={close}>
                  Закрыть
                </button>
              </>
            ) : (
              <>
                <div className="calib-title">Новая калибровка готова</div>
                <div className="recal-compare">
                  <div>
                    <div className="muted">Прежняя</div>
                    <b>{recal.before ? range(recal.before) : 'общие пороги'}</b>
                  </div>
                  <div>
                    <div className="muted">Новая</div>
                    <b>{result && range(result)}</b>
                  </div>
                </div>
                <div className="muted light">Повтор засчитывается, когда угол уходит ниже первого числа и возвращается выше второго.</div>
                <button
                  className="primary"
                  onClick={() => {
                    recal.save();
                    close();
                  }}
                >
                  Сохранить
                </button>
                <button className="small-btn ghost" onClick={close}>
                  Оставить прежнюю
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
