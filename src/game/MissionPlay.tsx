import { useRef, useState } from 'react';
import { EXERCISE_LABELS, Exercise } from '../repCounter';
import { useRepCamera } from '../useRepCamera';
import { itemById } from './items';
import { LANDS, WORLD_NAMES } from './lands';
import { LevelDef } from './levels';
import { Mission, MissionView } from './mission';
import { MissionScene3D } from './MissionScene3D';
import { Dialog, Remark } from './Dialog';
import { MAX_LIVES, Progress, WinReward } from './progress';
import { afterLine, bossDefeat, restLine } from './story';

const PREP_S = 5;

type Status = 'story' | 'ready' | 'loading' | 'running' | 'won' | 'lost' | 'error';

const TYPE_NAMES: Record<LevelDef['type'], string> = {
  trial: 'Испытание',
  build: 'Строитель',
  chase: 'Погоня',
  climb: 'Подъём',
  defend: 'Оборона',
  rescue: 'Спасение',
  boss: 'Босс',
};

export const Stars = ({ n }: { n: number }) => (
  <span className="stars">
    {[1, 2, 3].map((i) => (
      <span key={i} className={i <= n ? 'on' : ''}>
        ★
      </span>
    ))}
  </span>
);

interface Props {
  level: LevelDef;
  progress: Progress;
  onExit: () => void;
  onWin: (stars: number, record?: number) => WinReward;
  // Поражение стоит жизнь; победа бесплатна.
  onLose: () => void;
  onActivity: (exercise: Exercise | null, reps: number) => void;
  lives: { lives: number; nextMs: number };
  onNext?: () => void;
}

export function MissionPlay({ level, progress, onExit, onWin, onLose, onActivity, lives, onNext }: Props) {
  const camera = useRepCamera();
  const land = LANDS[level.land];
  const item = itemById(progress.equipped);
  const make = () => new Mission(level, progress.baseline);
  const mission = useRef<Mission>(make());
  const [status, setStatus] = useState<Status>(level.story.length ? 'story' : 'ready');
  const [attempt, setAttempt] = useState(0);
  const [epilogue, setEpilogue] = useState(false);
  const [view, setView] = useState<MissionView>(() => mission.current.view(0));
  const [elapsedShare, setElapsedShare] = useState(0);
  const [result, setResult] = useState<{ stars: number; reward: WinReward } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exercise = useRef<Exercise>(level.exercises[0]);
  const [countdown, setCountdown] = useState(0);

  const finish = (m: Mission, now: number) => {
    camera.stop();
    const v = m.view(now);
    setView(v);
    onActivity(level.exercises.length === 1 ? level.exercises[0] : null, v.reps);
    if (v.outcome === 'won') {
      const stars = m.stars(now);
      setResult({ stars, reward: onWin(stars, v.record) });
      setEpilogue(level.type === 'boss');
      setStatus('won');
    } else {
      onLose();
      setStatus('lost');
    }
  };

  const start = async () => {
    if (lives.lives <= 0) return;
    setAttempt((a) => a + 1);
    setError(null);
    setStatus('loading');
    const m = make();
    mission.current = m;
    exercise.current = level.exercises[0];
    setView(m.view(0));
    let lastPaint = 0;
    let firstFrame = 0;
    setCountdown(PREP_S);
    try {
      await camera.start(
        level.exercises[0],
        () => {
          const now = performance.now();
          m.rep(now);
          lastPaint = 0;
        },
        () => {
          const now = performance.now();
          // Несколько секунд на то, чтобы встать в позицию: время и повторы ещё не идут.
          firstFrame ||= now;
          if (!m.started) {
            const left = Math.ceil((firstFrame + PREP_S * 1000 - now) / 1000);
            setCountdown(left);
            if (left > 0) return true;
            m.start(now);
          }
          m.tick(now);
          const v = m.view(now);
          if (v.exercise !== exercise.current) {
            exercise.current = v.exercise;
            camera.switchExercise(v.exercise);
          }
          if (v.outcome !== 'running') {
            finish(m, now);
            return false;
          }
          // Сцену перерисовываем не чаще 8 раз в секунду, кроме моментов повтора.
          if (now - lastPaint > 125) {
            lastPaint = now;
            setView(v);
            setElapsedShare(1 - v.leftMs / (level.seconds * 1000));
          }
          return true;
        },
      );
      setStatus('running');
    } catch (e) {
      camera.stop();
      setError(e instanceof Error ? e.message : 'не загрузилась модель распознавания');
      setStatus('error');
    }
  };

  const surrender = () => {
    camera.stop();
    const m = mission.current;
    // Сдался до старта отсчёта — попытка не считается.
    if (!m.started) return setStatus('ready');
    const v = m.view(performance.now());
    onActivity(level.exercises.length === 1 ? level.exercises[0] : null, v.reps);
    onLose();
    setStatus('lost');
  };
  const noLives = lives.lives <= 0;
  const waitMin = Math.max(1, Math.ceil(lives.nextMs / 60000));

  const busy = status === 'loading' || status === 'running';
  const tag = level.world === 3 ? 'Финал' : `${WORLD_NAMES[land.world]} · ${land.name} · уровень ${level.num}`;

  return (
    <>
      <div className="arena mission">
        <MissionScene3D
          level={level}
          land={land}
          view={view}
          live={status === 'running'}
          elapsedShare={elapsedShare}
          hero={item.hero}
          heroTint={item.tint}
          heroGlow={item.glow}
        />
        <div className="mhud">
          <div className="mhud-row">
            <span className="mhud-ex">{EXERCISE_LABELS[view.exercise]}</span>
            {level.type === 'boss' && (
              <span className="hearts">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={i <= (view.hearts ?? 3) ? 'on' : ''}>
                    ♥
                  </span>
                ))}
              </span>
            )}
            <span className="timer">{Math.ceil(view.leftMs / 1000)}</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${Math.min(1, level.type === 'boss' ? 1 - view.progress : view.progress) * 100}%`, background: level.type === 'boss' ? land.boss.color : land.accent }} />
          </div>
          <div className="mhud-label">
            {level.type === 'boss' ? `${land.boss.name} · ${view.label}` : level.type === 'chase' ? `${view.label} · отрыв ${Math.round((view.gap ?? 1) * 100)}%` : view.label}
          </div>
        </div>

        {status === 'running' && countdown > 0 && (
          <div className="countdown">
            <div className="countdown-num">{countdown}</div>
            <div>Займи позицию</div>
          </div>
        )}
        {status === 'story' && <Dialog lines={level.story} onDone={() => setStatus('ready')} />}
        {status === 'won' && epilogue && <Dialog lines={bossDefeat(level.land)} onDone={() => setEpilogue(false)} />}
        {status === 'ready' && (
          <div className="result">
            <div className="level-tag">{tag}</div>
            <div className="result-title small">{level.title}</div>
            <div className="muted light">
              {TYPE_NAMES[level.type]} · {level.exercises.map((e) => EXERCISE_LABELS[e]).join(' → ')}
              {level.type !== 'trial' && ` · цель ${mission.current.target}`}
              {level.rest && ' · лёгкий день'}
            </div>
            {noLives && <Remark line={restLine(waitMin)} />}
          </div>
        )}
        {status === 'won' && result && !epilogue && (
          <div className="result">
            <div className="result-title">Победа!</div>
            <Stars n={result.stars} />
            <div className="muted light">
              {view.reps} повторов · +{result.reward.coins} монет
              {view.record != null && ` · рекорд ${view.record}`}
            </div>
            <Remark line={afterLine(level.world, true, level.id + attempt)} />
          </div>
        )}
        {status === 'lost' && (
          <div className="result">
            <div className="result-title">Не вышло</div>
            <div className="muted light">{level.type === 'chase' ? 'Чудище догнало. Держи темп ровнее!' : 'Не хватило совсем чуть-чуть.'}</div>
            <div className="life-lost">
              −1 ♥ · осталось {lives.lives} из {MAX_LIVES}
            </div>
            <Remark line={noLives ? restLine(waitMin) : afterLine(level.world, false, level.id + attempt)} />
          </div>
        )}

        <div className={`pip ${camera.active ? '' : 'hidden'}`}>
          <video ref={camera.videoRef} playsInline muted />
          <canvas ref={camera.canvasRef} />
          <div className="pip-count">{view.reps}</div>
          {camera.angle != null && <div className="pip-angle">{camera.angle}°</div>}
        </div>
      </div>

      <div className="hint-line">
        {status === 'running' && (camera.hint ?? 'Отлично, продолжай!')}
        {status === 'ready' && 'Поставь телефон сбоку в 1,5–2 метрах, чтобы тело было в кадре целиком.'}
        {status === 'error' && `Не удалось запустить камеру: ${error}`}
      </div>
      {status === 'running' && (
        <button className="secondary" onClick={surrender}>
          Остановиться
        </button>
      )}
      {status === 'won' && onNext && (
        <button className="primary" onClick={onNext}>
          Дальше
        </button>
      )}
      {(status === 'ready' || status === 'lost' || status === 'error') &&
        (noLives ? (
          <button className="primary" disabled>
            ♥ через {waitMin} мин
          </button>
        ) : (
          <button className="primary" onClick={start}>
            {status === 'ready' ? 'Начать' : 'Ещё раз'} · ♥ {lives.lives}
          </button>
        ))}
      {status === 'loading' && (
        <button className="primary" disabled>
          Загружаю камеру…
        </button>
      )}
      {!busy && (
        <button className="link" onClick={onExit}>
          К карте
        </button>
      )}
    </>
  );
}
