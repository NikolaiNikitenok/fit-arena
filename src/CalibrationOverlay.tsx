import { useEffect } from 'react';
import type { CalibrationView } from './calibration';
import { EXERCISE_LABELS, RepExercise } from './repCounter';
import { say } from './voice';
import { t } from './i18n';

const COUNT = [t('Раз'), t('Два'), t('Три'), t('Четыре'), t('Пять')];
const HOW: Record<RepExercise, string> = {
  pushup: t('Опускайся грудью к полу и выпрямляй руки до конца'),
  squat: t('Садись поглубже и вставай в полный рост'),
  situp: t('Поднимай корпус как можешь и ложись обратно'),
};

// Шкала угла на полоске, градусы.
const SCALE: [number, number] = [30, 180];
const pos = (a: number) => `${Math.min(100, Math.max(0, ((a - SCALE[0]) / (SCALE[1] - SCALE[0])) * 100))}%`;

/** Калибровка перед первым подходом: живая полоска угла, счётчик медленных повторов, пропуск.
 *  again — повторная калибровка из настроек: вместо «Пропустить» — «Отмена», итог ещё не сохранён. */
export function CalibrationOverlay({ exercise, view, onSkip, again = false }: { exercise: RepExercise; view: CalibrationView; onSkip: () => void; again?: boolean }) {
  const { reps, target, angle, min, max, result } = view;
  const doneText = again ? t('Готово, сравни с прежней') : t('Готово, теперь считаю под тебя');
  useEffect(() => say(t('Калибровка. Сделай {0} медленных повтора', { 0: target === 3 ? t('три') : target })), [target]);
  useEffect(() => {
    if (reps > 0 && !result) say(COUNT[reps - 1] ?? String(reps));
  }, [reps, result]);
  useEffect(() => {
    if (result) say(doneText);
  }, [result, doneText]);

  return (
    <div className="calib">
      <div className="calib-card">
        {result ? (
          <>
            <div className="level-tag">{t('Калибровка · {0}', { 0: EXERCISE_LABELS[exercise] })}</div>
            <div className="calib-title">{doneText}</div>
            <div className="muted light">{t('Повтор засчитаю от {0}° до {1}°', { 0: result.down, 1: result.up })}</div>
          </>
        ) : (
          <>
            <div className="level-tag">{t('Калибровка · {0}', { 0: EXERCISE_LABELS[exercise] })}</div>
            <div className="calib-title">{t('Сделай {0} медленных повтора', { 0: target })}</div>
            <div className="muted light">{t('{0}. Так я узнаю твою амплитуду и буду считать точнее.', { 0: HOW[exercise] })}</div>
          </>
        )}
        <div className="calib-reps">
          {Array.from({ length: target }, (_, i) => (
            <span key={i} className={i < reps ? 'on' : ''}>
              {i + 1}
            </span>
          ))}
        </div>
        <div className="calib-bar" aria-label={t('Угол сустава')}>
          {min != null && max != null && <div className="calib-range" style={{ left: pos(min), width: `calc(${pos(max)} - ${pos(min)})` }} />}
          {result && (
            <>
              <div className="calib-tick" style={{ left: pos(result.down) }} />
              <div className="calib-tick" style={{ left: pos(result.up) }} />
            </>
          )}
          {angle != null && <div className="calib-dot" style={{ left: pos(angle) }} />}
        </div>
        <div className="calib-scale">
          <span>{t('согнут')}</span>
          <span>{angle != null ? `${Math.round(angle)}°` : t('жду позу')}</span>
          <span>{t('прямо')}</span>
        </div>
        {!result && (
          <button className="small-btn ghost" onClick={onSkip}>
            {again ? t('Отмена') : t('Пропустить')}
          </button>
        )}
      </div>
    </div>
  );
}
