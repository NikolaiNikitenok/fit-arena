import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { setSetting } from '../settings';
import { useBusy } from '../updates/busy';
import { loadProgress } from '../game/progress';
import { itemById } from '../game/items';
import { portraitUrl } from '../game/npcs';
import { sfx } from '../audio';
import { say, unlockVoice } from '../voice';
import { track } from '../telemetry';
import { t } from '../i18n';
import { MOVES, WARMUP_SECONDS, resolveWarmup, useWarmupRequest } from './warmup';
import './warmup.css';

// 3D подгружается, только когда игрок согласился размяться.
const WarmupFigure = lazy(() => import('./WarmupFigure').then((m) => ({ default: m.WarmupFigure })));

/** Предложение размяться и сама разминка. Стоит в App один раз, открывается из withWarmup. */
export function WarmupHost() {
  const request = useWarmupRequest();
  const [running, setRunning] = useState(false);
  useBusy(request !== null);
  useEffect(() => {
    if (!request) setRunning(false);
  }, [request]);
  if (!request) return null;

  const go = (how: 'done' | 'skip' | 'off') => {
    track('warmup', how);
    resolveWarmup(true);
  };

  if (running) return <WarmupRun onDone={() => go('done')} onSkip={() => go('skip')} />;

  return (
    <Sheet onClose={() => resolveWarmup(false)} className="warmup-offer">
      <div className="warmup-head">
        <img src={portraitUrl('grom')} alt="" draggable={false} />
        <div>
          <h3>{t('Сначала разминка?')}</h3>
          <p className="muted">{t('Первый подход за день. {0} минуты — суставы и мышцы разогреются, повторы пойдут легче, а риск травмы меньше.', { 0: Math.round(WARMUP_SECONDS / 60) })}</p>
        </div>
      </div>
      <ol className="warmup-list">
        {MOVES.map((m) => (
          <li key={m.id}>
            <span>{m.title}</span>
            <span className="muted">{t('{0} с', { 0: m.seconds })}</span>
          </li>
        ))}
      </ol>
      <button
        className="primary"
        onClick={() => {
          unlockVoice();
          sfx('tap');
          setRunning(true);
        }}
      >
        {t('Размяться')}
      </button>
      <button className="secondary" onClick={() => go('skip')}>
        {t('Пропустить')}
      </button>
      <button
        className="link"
        onClick={() => {
          setSetting('warmup', false);
          go('off');
        }}
      >
        {t('Больше не предлагать')}
      </button>
    </Sheet>
  );
}

function WarmupRun({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const model = itemById(loadProgress().equipped).hero;
  const [idx, setIdx] = useState(0);
  const [startAt, setStartAt] = useState(() => performance.now());
  const [now, setNow] = useState(startAt);
  const [paused, setPaused] = useState(false);
  const pausedAt = useRef(0);
  const finished = idx >= MOVES.length;
  const move = MOVES[Math.min(idx, MOVES.length - 1)];
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
      say(t('Разминка готова. Вперёд!'));
      return;
    }
    sfx('go');
    say(MOVES[idx].title);
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

  const total = (MOVES.slice(0, idx).reduce((s, m) => s + m.seconds, 0) + (finished ? 0 : move.seconds - left)) / WARMUP_SECONDS;
  const ring = 2 * Math.PI * 44;

  return (
    <div className="warmup-run">
      <div className="warmup-top">
        <div className="warmup-dots">
          {MOVES.map((m, i) => (
            <span key={m.id} className={i < idx ? 'done' : i === idx ? 'on' : ''} />
          ))}
        </div>
        <button className="warmup-skip" onClick={onSkip}>
          {t('Пропустить')}
        </button>
      </div>
      <div className="warmup-stage">
        <Suspense fallback={null}>
          {/* На паузе герой замирает: время движения стоит. */}
          <WarmupFigure move={finished ? 'cheer' : move.id} model={model} startAt={startAt} pausedAt={paused ? pausedAt.current : undefined} />
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
          <h2>{t('Разминка готова!')}</h2>
          <p className="muted">{t('Тело разогрето — теперь в бой.')}</p>
          <button className="primary" onClick={onDone}>
            {t('Поехали')}
          </button>
        </div>
      ) : (
        <div className="warmup-info">
          <div className="warmup-step">{t('Движение {0} из {1}', { 0: idx + 1, 1: MOVES.length })}</div>
          <h2>{move.title}</h2>
          <p className="muted">{move.tip}</p>
          <div className="warmup-actions">
            <button className="secondary" onClick={togglePause}>
              {paused ? t('Дальше') : t('Пауза')}
            </button>
            <button className="secondary" onClick={next}>
              {idx === MOVES.length - 1 ? t('Готово') : t('Следующее')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
