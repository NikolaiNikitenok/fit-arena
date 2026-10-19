import { useRef, useState } from 'react';
import { EXERCISE_LABELS, Exercise } from '../repCounter';
import { CameraGuide } from '../CameraGuide';
import { Heart, Swords } from '../icons';
import { getSettings, useSettings } from '../settings';
import { useRepCamera } from '../useRepCamera';
import { useMissionSounds } from '../gameSounds';
import { gearIcon, gearText, itemById } from './items';
import { LANDS, WORLD_NAMES } from './lands';
import { LevelDef } from './levels';
import { Mission, MissionView } from './mission';
import { heroHands, heroPower } from './power';
import { MissionScene3D } from './MissionScene3D';
import { Dialog, Remark } from './Dialog';
import { Progress, SWAPS_PER_DAY, WinReward } from './progress';
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
  lives: { lives: number; max: number; nextMs: number };
  // Замены упражнений на сегодня; onSwap списывает их при старте и говорит, хватило ли.
  swaps: { left: number; paid: number };
  onSwap: (count: number) => boolean;
  // Попытка началась: тратится выпитый эликсир силы.
  onStart: () => void;
  onNext?: () => void;
}

const ALL: Exercise[] = ['squat', 'pushup', 'situp'];

export function MissionPlay({ level: original, progress, onExit, onWin, onLose, onActivity, lives, swaps, onSwap, onStart, onNext }: Props) {
  const camera = useRepCamera();
  // Упражнения уровня с учётом замен игрока.
  const [exercises, setExercises] = useState<Exercise[]>(original.exercises);
  const [picking, setPicking] = useState<number | null>(null);
  const level: LevelDef = exercises === original.exercises ? original : { ...original, exercises };
  const swapCount = exercises.filter((e, i) => e !== original.exercises[i]).length;
  const canSwap = original.type !== 'trial' && !original.daily;
  const land = LANDS[level.land];
  const item = itemById(progress.equipped);
  // Сила героя на этот бой: уровень, оружие, щит и эликсир.
  const power = heroPower(progress, progress.might);
  const combat = { damage: power.damage, hearts: power.hearts };
  const make = () => new Mission(level, progress.baseline, combat);
  const mission = useRef<Mission>(make());
  const settings = useSettings();
  const [status, setStatus] = useState<Status>(original.story.length && getSettings().story ? 'story' : 'ready');
  const [attempt, setAttempt] = useState(0);
  const [epilogue, setEpilogue] = useState(false);
  const [view, setView] = useState<MissionView>(() => mission.current.view(0));
  const [elapsedShare, setElapsedShare] = useState(0);
  const [result, setResult] = useState<{ stars: number; reward: WinReward } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exercise = useRef<Exercise>(level.exercises[0]);
  const [countdown, setCountdown] = useState(0);
  useMissionSounds(status, countdown, view, level.type === 'boss');

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

  const choose = (slot: number, ex: Exercise) => {
    const next = exercises.map((e, i) => (i === slot ? ex : e));
    setExercises(next);
    setPicking(null);
    const m = new Mission({ ...original, exercises: next }, progress.baseline, combat);
    mission.current = m;
    setView(m.view(0));
  };

  const start = async () => {
    if (lives.lives <= 0 && !level.daily) return;
    if (swapCount > 0 && !onSwap(swapCount)) return;
    setAttempt((a) => a + 1);
    setError(null);
    setStatus('loading');
    onStart();
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
  // Задание дня жизнь не тратит и доступно всегда.
  const noLives = lives.lives <= 0 && !original.daily;
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
          heroHands={heroHands(progress)}
        />
        <div className={`mhud ${busy ? '' : 'hidden'}`}>
          <div className="mhud-row">
            <span className="mhud-ex">{EXERCISE_LABELS[view.exercise]}</span>
            {level.type === 'boss' && (
              <span className="hearts">
                {Array.from({ length: combat.hearts }, (_, k) => k + 1).map((i) => (
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
            {level.type === 'boss' ? `${land.boss.name} · ${view.hp} HP · ${view.label}` : level.type === 'chase' ? `${view.label} · отрыв ${Math.round((view.gap ?? 1) * 100)}%` : view.label}
          </div>
        </div>
        {/* Урон каждого повтора всплывает над сценой. */}
        {status === 'running' && view.reps > 0 && view.damage > 0 && (
          <div key={view.reps} className="dmg-pop">
            −{view.damage}
          </div>
        )}

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
            {level.type !== 'trial' && (
              <div className="power-line">
                <span>
                  <Swords size={14} /> урон {view.damage}
                </span>
                <span>
                  <Heart size={13} className="heart" /> {level.type === 'boss' ? `${land.boss.name}: ` : 'враги: '}
                  {view.hpMax} HP
                </span>
                {progress.might && <span className="might">эликсир силы +30%</span>}
              </div>
            )}
            {canSwap && !noLives && (
              <SwapRow
                original={original.exercises}
                exercises={exercises}
                picking={picking}
                // Сколько ещё замен можно сделать на этом уровне сверх уже выбранных.
                free={swaps.left + swaps.paid - swapCount}
                onPick={setPicking}
                onChoose={choose}
              />
            )}
            {noLives ? <Remark line={restLine(waitMin)} /> : settings.guide && <CameraGuide exercise={level.exercises[0]} model={item.hero} />}
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
            {result.reward.drop && (
              <div className="drop">
                <img src={gearIcon(result.reward.drop.id)} alt="" />
                <div>
                  <div className="drop-title">Трофей: {result.reward.drop.name}</div>
                  <div className="muted">{gearText(result.reward.drop)} · уже в инвентаре</div>
                </div>
              </div>
            )}
            <Remark line={afterLine(level.world, true, level.id + attempt)} />
          </div>
        )}
        {status === 'lost' && (
          <div className="result">
            <div className="result-title">Не вышло</div>
            <div className="muted light">{level.type === 'chase' ? 'Чудище догнало. Держи темп ровнее!' : 'Не хватило совсем чуть-чуть.'}</div>
            {!level.daily && (
              <div className="life-lost">
                −1 ♥ · осталось {lives.lives} из {lives.max}
              </div>
            )}
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
        {status === 'ready' && level.exercises.length > 1 && 'Упражнения меняются по фазам: поставь телефон так, чтобы было видно всё тело.'}
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
            <Heart /> через {waitMin} мин
          </button>
        ) : (
          <button className="primary" onClick={start}>
            {status === 'ready' ? 'Начать' : 'Ещё раз'}
            {!level.daily && (
              <span className="btn-cost">
                <Heart size={14} /> {lives.lives}
              </span>
            )}
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

function SwapRow({ original, exercises, picking, free, onPick, onChoose }: { original: Exercise[]; exercises: Exercise[]; picking: number | null; free: number; onPick: (slot: number | null) => void; onChoose: (slot: number, ex: Exercise) => void }) {
  return (
    <div className="swap">
      <div className="swap-row">
        {exercises.map((ex, i) => {
          const changed = ex !== original[i];
          const locked = !changed && free <= 0;
          return (
            <button key={i} className={`swap-chip ${changed ? 'changed' : ''} ${picking === i ? 'on' : ''}`} disabled={locked} onClick={() => onPick(picking === i ? null : i)}>
              {EXERCISE_LABELS[ex]} ⇄
            </button>
          );
        })}
      </div>
      {picking != null && (
        <div className="swap-pick">
          <span>Заменить на</span>
          {ALL.filter((e) => e !== exercises[picking]).map((e) => (
            <button key={e} className="swap-chip" onClick={() => onChoose(picking, e)}>
              {e === original[picking] ? `${EXERCISE_LABELS[e]} (как было)` : EXERCISE_LABELS[e]}
            </button>
          ))}
        </div>
      )}
      <div className="swap-note">
        {free > 0 ? `Негде сделать? Замени упражнение · осталось ${free} из ${SWAPS_PER_DAY} на сегодня` : `Замены на сегодня закончились, завтра будет ещё ${SWAPS_PER_DAY}`}
      </div>
    </div>
  );
}
