import { useEffect, useRef, useState } from 'react';
import { amountText, EXERCISE_LABELS, goalText, isTimed, type RepExercise } from '../repCounter';
import { CameraGuide } from '../CameraGuide';
import { CalibrationOverlay } from '../CalibrationOverlay';
import { needsCalibration } from '../calibration';
import { useRepCamera } from '../useRepCamera';
import { say, unlockVoice, useVoiceCoach } from '../voice';
import { useSettings } from '../settings';
import { sfx } from '../audio';
import type { CharName } from '../three/kit';
import { Check, Moon, Timer } from '../icons';
import type { SetPlan } from './programs';
import './Programs.css';

// Тренировка из подходов: камера считает повторы (у планки — секунды), между подходами отдых с отсчётом.
// Камера работает всю тренировку, на каждый подход счётчик начинается заново.

type Phase = 'ready' | 'loading' | 'prep' | 'work' | 'rest' | 'error';

const PREP_S = 5;
// Тест «сколько сможешь» заканчивается сам: повторов нет столько времени — подход окончен.
const MAX_IDLE_MS = 8000;
// Планка «на максимум»: поза сломалась и не вернулась.
const MAX_PLANK_IDLE_MS = 3000;
// Секунда планки не пришла дольше этого — отсчёт на паузе.
const HOLD_PAUSE_MS = 1500;
const REST_ADD_S = 15;

interface Props {
  tag: string;
  title: string;
  sets: SetPlan[];
  model: CharName;
  // Подход закончен: повторы идут в прогресс сразу, даже если тренировку бросят.
  onSet: (set: SetPlan, done: number) => void;
  onFinish: (done: number[]) => void;
  onExit: () => void;
}

export function WorkoutSession({ tag, title, sets, model, onSet, onFinish, onExit }: Props) {
  const camera = useRepCamera();
  const settings = useSettings();
  const [phase, setPhaseState] = useState<Phase>('ready');
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<number[]>(() => sets.map(() => 0));
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Всё, что нужно таймеру и обработчику повторов между кадрами.
  const s = useRef({ phase: 'ready' as Phase, idx: 0, done: sets.map(() => 0), until: 0, setStart: 0, lastRepAt: 0, warned: false });
  const setPhase = (p: Phase) => {
    s.current.phase = p;
    setPhaseState(p);
  };
  const calibrating = camera.calib != null;
  const calibRef = useRef(false);
  calibRef.current = calibrating;

  const set = sets[idx];
  const timed = isTimed(set.exercise);
  const value = done[idx];
  useVoiceCoach(phase === 'work' && !calibrating, value, 0, camera.hint, 0, set.max ? undefined : set.target, timed);

  const startSet = (i: number, t: number) => {
    const st = s.current;
    st.idx = i;
    st.setStart = t;
    st.lastRepAt = t;
    st.warned = false;
    setIdx(i);
    camera.switchExercise(sets[i].exercise);
    setPhase('work');
  };

  const endSet = (t: number) => {
    const st = s.current;
    if (st.phase !== 'work') return;
    const i = st.idx;
    onSet(sets[i], st.done[i]);
    if (i + 1 >= sets.length) {
      camera.stop();
      sfx('win');
      onFinish([...st.done]);
      return;
    }
    sfx('coin');
    const rest = sets[i].rest || PREP_S;
    st.until = t + rest * 1000;
    st.idx = i + 1;
    st.warned = false;
    setIdx(i + 1);
    setPhase('rest');
    say(`Отдых ${rest} секунд`);
  };

  const onRep = () => {
    const st = s.current;
    if (st.phase !== 'work') return;
    const t = performance.now();
    st.done[st.idx] += 1;
    st.lastRepAt = t;
    setDone([...st.done]);
    const cur = sets[st.idx];
    if (!cur.max && st.done[st.idx] >= cur.target) endSet(t);
  };

  // DEV: повтор без камеры для проверки тренировки в браузере. В сборку для игроков не попадает.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __workoutRep?: (n?: number) => void };
    w.__workoutRep = (n = 1) => {
      for (let k = 0; k < n; k++) onRep();
    };
    return () => void delete w.__workoutRep;
  });

  // Часы тренировки: отсчёт перед стартом, конец теста по бездействию, отдых.
  useEffect(() => {
    if (phase === 'ready' || phase === 'loading' || phase === 'error') return;
    const id = setInterval(() => {
      const st = s.current;
      const t = performance.now();
      setNow(t);
      // Пока идёт калибровка, время не идёт.
      if (calibRef.current) {
        st.until = Math.max(st.until, t + PREP_S * 1000);
        return;
      }
      if (st.phase === 'prep' && t >= st.until) startSet(st.idx, t);
      if (st.phase === 'rest') {
        const left = (st.until - t) / 1000;
        if (left <= 3 && !st.warned) {
          st.warned = true;
          const next = sets[st.idx];
          say(`Приготовься: ${next.max ? `${EXERCISE_LABELS[next.exercise].toLowerCase()}, сколько сможешь` : goalText(next.exercise, next.target)}`);
        }
        if (left <= 0) {
          sfx('go');
          startSet(st.idx, t);
        }
      }
      if (st.phase === 'work') {
        const cur = sets[st.idx];
        const idle = isTimed(cur.exercise) ? MAX_PLANK_IDLE_MS : MAX_IDLE_MS;
        if (cur.max && st.done[st.idx] > (isTimed(cur.exercise) ? 2 : 0) && t - st.lastRepAt > idle) endSet(t);
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

  const begin = async () => {
    unlockVoice();
    setError(null);
    setPhase('loading');
    const st = s.current;
    st.idx = 0;
    try {
      await camera.start(sets[0].exercise, onRep, undefined, { calibrate: needsCalibration(sets[0].exercise) });
    } catch (e) {
      // В DEV можно тренироваться и без камеры: повторы приходят из __workoutRep.
      if (!import.meta.env.DEV) {
        camera.stop();
        setError(e instanceof Error ? e.message : 'не загрузилась модель распознавания');
        setPhase('error');
        return;
      }
    }
    st.until = performance.now() + PREP_S * 1000;
    setNow(performance.now());
    setPhase('prep');
  };

  const stop = () => {
    camera.stop();
    // Сделанное в незаконченном подходе тоже засчитывается в прогресс.
    const st = s.current;
    if (st.phase === 'work' && st.done[st.idx] > 0) onSet(sets[st.idx], st.done[st.idx]);
    st.phase = 'ready';
    onExit();
  };

  const restLeft = Math.max(0, Math.ceil((s.current.until - now) / 1000));
  const paused = phase === 'work' && timed && now - s.current.lastRepAt > HOLD_PAUSE_MS;
  const shown = timed ? amountText(set.exercise, value) : String(value);

  if (phase === 'ready' || phase === 'error')
    return (
      <>
        <div className="ws-intro">
          <div className="level-tag">{tag}</div>
          <div className="ws-title">{title}</div>
          <SetList sets={sets} done={done} current={-1} />
          {settings.guide && <CameraGuide exercise={sets[0].exercise} model={model} />}
        </div>
        <div className="hint-line">{phase === 'error' ? `Не удалось запустить камеру: ${error}` : `Поставь телефон так, чтобы было видно всё тело.${sets.length > 1 ? ' Между подходами будет отдых.' : ''}`}</div>
        <button className="primary" onClick={begin}>
          {phase === 'error' ? 'Ещё раз' : 'Начать тренировку'}
        </button>
        <button className="link" onClick={onExit}>
          Назад
        </button>
      </>
    );

  return (
    <>
      <div className="arena ws-arena">
        <video ref={camera.videoRef} playsInline muted />
        <canvas ref={camera.canvasRef} />
        <div className="mhud">
          <div className="mhud-row">
            <span className="mhud-ex">{EXERCISE_LABELS[set.exercise]}</span>
            <span className="ws-setno">
              Подход {idx + 1} из {sets.length}
            </span>
          </div>
          {phase === 'work' && !set.max && (
            <div className="bar">
              <div className="bar-fill" style={{ width: `${Math.min(100, (value / set.target) * 100)}%`, background: 'var(--accent-grad)' }} />
            </div>
          )}
        </div>

        {phase === 'work' && !calibrating && (
          <div className={`ws-count ${paused ? 'paused' : ''}`}>
            <div className="ws-num">{shown}</div>
            <div className="ws-goal">
              {paused ? 'Пауза: поправь позу' : set.max ? (timed ? 'держи, сколько сможешь' : 'сколько сможешь') : `из ${amountText(set.exercise, set.target)}`}
            </div>
          </div>
        )}
        {phase === 'prep' && !calibrating && (
          <div className="countdown">
            <div className="countdown-num">{restLeft}</div>
            <div>Займи позицию</div>
          </div>
        )}
        {phase === 'rest' && (
          <div className="ws-rest">
            <Moon size={22} />
            <div className="ws-rest-num">{restLeft}</div>
            <div className="ws-rest-label">Отдых</div>
            <div className="ws-next">
              Дальше: {set.max ? `${EXERCISE_LABELS[set.exercise]}, сколько сможешь` : goalText(set.exercise, set.target).replace(/^./, (c) => c.toUpperCase())}
            </div>
          </div>
        )}
        {calibrating && <CalibrationOverlay exercise={set.exercise as RepExercise} view={camera.calib!} onSkip={camera.skipCalib} />}
        {phase === 'loading' && (
          <div className="countdown">
            <div>Загружаю камеру…</div>
          </div>
        )}
      </div>

      <SetList sets={sets} done={done} current={idx} resting={phase === 'rest'} />
      <div className="hint-line">{phase === 'work' ? (camera.hint ?? (timed ? 'Держи ровно: таз не поднимай и не опускай' : 'Отлично, продолжай!')) : phase === 'rest' ? 'Подыши, попей воды' : ''}</div>

      {phase === 'rest' && (
        <div className="ws-actions">
          <button className="secondary" onClick={() => (s.current.until += REST_ADD_S * 1000)}>
            +{REST_ADD_S} с
          </button>
          <button className="primary" onClick={() => startSet(s.current.idx, performance.now())}>
            Пропустить отдых
          </button>
        </div>
      )}
      {phase === 'work' && (
        <button className="secondary" onClick={() => endSet(performance.now())}>
          {set.max ? 'Хватит, записать' : value > 0 ? 'Закончить подход' : 'Пропустить подход'}
        </button>
      )}
      <button className="link" onClick={stop}>
        Остановиться
      </button>
    </>
  );
}

/** Подходы тренировки: сделанные, текущий и следующие. */
export function SetList({ sets, done, current, resting }: { sets: SetPlan[]; done: number[]; current: number; resting?: boolean }) {
  return (
    <div className="ws-sets">
      {sets.map((x, i) => {
        const state = current < 0 ? '' : i < current ? 'done' : i === current ? (resting ? 'next' : 'on') : '';
        return (
          <span key={i} className={`ws-set ${state}`}>
            {state === 'done' && <Check size={12} />}
            {isTimed(x.exercise) && state !== 'done' && <Timer size={12} />}
            <b>{EXERCISE_LABELS[x.exercise]}</b>
            {state === 'done' ? amountText(x.exercise, done[i]) : x.max ? 'макс.' : amountText(x.exercise, x.target)}
          </span>
        );
      })}
    </div>
  );
}
