import { useEffect } from 'react';
import type { CalibrationView } from './calibration';
import { EXERCISE_LABELS, Exercise } from './repCounter';
import { say } from './voice';

const COUNT = ['Раз', 'Два', 'Три', 'Четыре', 'Пять'];
const HOW: Record<Exercise, string> = {
  pushup: 'Опускайся грудью к полу и выпрямляй руки до конца',
  squat: 'Садись поглубже и вставай в полный рост',
  situp: 'Поднимай корпус как можешь и ложись обратно',
};

// Шкала угла на полоске, градусы.
const SCALE: [number, number] = [30, 180];
const pos = (a: number) => `${Math.min(100, Math.max(0, ((a - SCALE[0]) / (SCALE[1] - SCALE[0])) * 100))}%`;

/** Калибровка перед первым подходом: живая полоска угла, счётчик медленных повторов, пропуск. */
export function CalibrationOverlay({ exercise, view, onSkip }: { exercise: Exercise; view: CalibrationView; onSkip: () => void }) {
  const { reps, target, angle, min, max, result } = view;
  useEffect(() => say(`Калибровка. Сделай ${target === 3 ? 'три' : target} медленных повтора`), [target]);
  useEffect(() => {
    if (reps > 0 && !result) say(COUNT[reps - 1] ?? String(reps));
  }, [reps, result]);
  useEffect(() => {
    if (result) say('Готово, теперь считаю под тебя');
  }, [result]);

  return (
    <div className="calib">
      <div className="calib-card">
        {result ? (
          <>
            <div className="level-tag">Калибровка · {EXERCISE_LABELS[exercise]}</div>
            <div className="calib-title">Готово, теперь считаю под тебя</div>
            <div className="muted light">Повтор засчитаю от {result.down}° до {result.up}°</div>
          </>
        ) : (
          <>
            <div className="level-tag">Калибровка · {EXERCISE_LABELS[exercise]}</div>
            <div className="calib-title">Сделай {target} медленных повтора</div>
            <div className="muted light">{HOW[exercise]}. Так я узнаю твою амплитуду и буду считать точнее.</div>
          </>
        )}
        <div className="calib-reps">
          {Array.from({ length: target }, (_, i) => (
            <span key={i} className={i < reps ? 'on' : ''}>
              {i + 1}
            </span>
          ))}
        </div>
        <div className="calib-bar" aria-label="Угол сустава">
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
          <span>согнут</span>
          <span>{angle != null ? `${Math.round(angle)}°` : 'жду позу'}</span>
          <span>прямо</span>
        </div>
        {!result && (
          <button className="small-btn ghost" onClick={onSkip}>
            Пропустить
          </button>
        )}
      </div>
    </div>
  );
}
