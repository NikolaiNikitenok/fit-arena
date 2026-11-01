import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { loadProgress } from '../game/progress';
import { itemById } from '../game/items';
import type { RepExercise } from '../repCounter';
import { sfx } from '../audio';
import { say } from '../voice';
import { t } from '../i18n';
import type { FigureMove } from './WarmupFigure';
import './warmup.css';

// Шаги по таймеру с 3D-героем: разминка перед подходом и утренняя зарядка без камеры.
// 3D подгружается, только когда шаги открыли.
const WarmupFigure = lazy(() => import('./WarmupFigure').then((m) => ({ default: m.WarmupFigure })));
const ExerciseFigure = lazy(() => import('../CameraGuide').then((m) => ({ default: m.ExerciseFigure })));

export interface RoutineStep {
  title: string;
  tip: string;
  seconds: number;
  // Движение разминки или упражнение, которое герой показывает.
  move?: FigureMove;
  exercise?: RepExercise;
}

interface Props {
  steps: RoutineStep[];
  doneTitle: string;
  doneText: string;
  doneSay: string;
  doneButton: string;
  onDone: () => void;
  onSkip: () => void;
}

export function RoutineRun({ steps, doneTitle, doneText, doneSay, doneButton, onDone, onSkip }: Props) {
  const model = itemById(loadProgress().equipped).hero;
  const [idx, setIdx] = useState(0);
  const [startAt, setStartAt] = useState(() => performance.now());
  const [now, setNow] = useState(startAt);
  const [paused, setPaused] = useState(false);
  const pausedAt = useRef(0);
  const totalS = steps.reduce((s, m) => s + m.seconds, 0);
  const finished = idx >= steps.length;
  const move = steps[Math.min(idx, steps.length - 1)];
  const left = Math.max(0, move.seconds - (now - startAt) / 1000);

  useEffect(() => {
    if (finished || paused) return;
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [finished, paused]);

  // Новое движение: Гром называет его.
  useEffect(() => {
    if (finished) {
      sfx('levelup');
      say(doneSay);
      return;
    }
    sfx('go');
    say(steps[idx].title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, finished]);

  // Последние три секунды — короткий сигнал, на нуле — следующее движение.
  const shown = Math.ceil(left);
  const lastBeep = useRef(0);
  useEffect(() => {
    if (finished || paused) return;
    if (left <= 0) {
      next();
      return;
    }
    if (shown <= 3 && shown !== lastBeep.current) {
      lastBeep.current = shown;
      sfx('beep');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, left <= 0]);

  const next = () => {
    const at = performance.now();
    lastBeep.current = 0;
    setIdx((i) => i + 1);
    setStartAt(at);
    setNow(at);
  };

  const togglePause = () => {
    const at = performance.now();
    if (paused) {
      // Время паузы не входит в движение.
      setStartAt((s) => s + (at - pausedAt.current));
      setNow(at);
    } else pausedAt.current = at;
    setPaused(!paused);
  };

  const total = (steps.slice(0, idx).reduce((s, m) => s + m.seconds, 0) + (finished ? 0 : move.seconds - left)) / totalS;
  const ring = 2 * Math.PI * 44;

  return (
    <div className="warmup-run">
      <div className="warmup-top">
        <div className="warmup-dots">
          {steps.map((m, i) => (
            <span key={i} className={i < idx ? 'done' : i === idx ? 'on' : ''} />
          ))}
        </div>
        <button className="warmup-skip" onClick={onSkip}>
          {t('Пропустить')}
        </button>
      </div>
      <div className="warmup-stage">
        <Suspense fallback={null}>
          {/* На паузе герой замирает: время движения стоит. */}
          {!finished && move.exercise ? (
            <ExerciseFigure exercise={move.exercise} model={model} />
          ) : (
            <WarmupFigure move={finished ? 'cheer' : (move.move ?? 'circles')} model={model} startAt={startAt} pausedAt={paused ? pausedAt.current : undefined} />
          )}
        </Suspense>
        {!finished && (
          <div className="warmup-timer">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" className="track" />
              <circle cx="50" cy="50" r="44" className="bar" strokeDasharray={ring} strokeDashoffset={ring * (left / move.seconds)} />
            </svg>
            <b>{shown}</b>
          </div>
        )}
      </div>
      <div className="warmup-total">
        <i style={{ width: `${Math.round(total * 100)}%` }} />
      </div>
      {finished ? (
        <div className="warmup-info">
          <h2>{doneTitle}</h2>
          <p className="muted">{doneText}</p>
          <button className="primary" onClick={onDone}>
            {doneButton}
          </button>
        </div>
      ) : (
        <div className="warmup-info">
          <div className="warmup-step">{t('Движение {0} из {1}', { 0: idx + 1, 1: steps.length })}</div>
          <h2>{move.title}</h2>
          <p className="muted">{move.tip}</p>
          <div className="warmup-actions">
            <button className="secondary" onClick={togglePause}>
              {paused ? t('Дальше') : t('Пауза')}
            </button>
            <button className="secondary" onClick={next}>
              {idx === steps.length - 1 ? t('Готово') : t('Следующее')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
