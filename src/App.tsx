import { useEffect, useRef, useState } from 'react';
import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import { Arena3D } from './arena/Arena3D';
import { Battle, BOT_LEVELS, MAX_HP, newBattle, nextBotDelay, Side, strike, Strike, winner } from './arena/battle';
import { createPoseLandmarker } from './pose';
import { Exercise, EXERCISE_LABELS, RepCounter } from './repCounter';
import { hapticRep, userName } from './telegram';

const ROUND_SECONDS = 60;

type Status = 'idle' | 'loading' | 'running' | 'finished' | 'error';

const RESULT_TEXT: Record<Side | 'draw', string> = {
  player: 'Победа!',
  bot: 'Поражение',
  draw: 'Ничья',
};

export function App() {
  const [exercise, setExercise] = useState<Exercise>('pushup');
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [battle, setBattle] = useState<Battle>(newBattle);
  const [lastStrike, setLastStrike] = useState<Record<Side, Strike | null>>({ player: null, bot: null });
  const [hint, setHint] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);
  const botTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Состояние боя нужно в колбэках камеры и таймера бота без пересоздания замыканий.
  const battleRef = useRef<Battle>(battle);

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    clearTimeout(botTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => stop, []);

  const finish = () => {
    stop();
    setStatus('finished');
  };

  const hit = (side: Side) => {
    const result = strike(battleRef.current, side, performance.now());
    battleRef.current = result.battle;
    setBattle(result.battle);
    setLastStrike((s) => ({ ...s, [side]: result.strike }));
    if (winner(result.battle, false)) finish();
  };

  const scheduleBot = () => {
    botTimerRef.current = setTimeout(() => {
      hit('bot');
      if (streamRef.current) scheduleBot();
    }, nextBotDelay(BOT_LEVELS[level]));
  };

  const start = async () => {
    setError(null);
    setStatus('loading');
    try {
      landmarkerRef.current ??= await createPoseLandmarker();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const counter = new RepCounter(exercise);
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      const drawing = new DrawingUtils(ctx);
      let lastReps = 0;
      // Время считаем по часам, а не по таймеру: на слабых телефонах таймеры отстают.
      const endAt = performance.now() + ROUND_SECONDS * 1000;

      const loop = () => {
        const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
        setSecondsLeft(left);
        if (left === 0) {
          finish();
          return;
        }
        if (video.readyState >= 2) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const now = performance.now();
          const result = landmarkerRef.current!.detectForVideo(video, now);
          const lm = result.landmarks[0];
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (lm) {
            drawing.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#ff5a36', lineWidth: 4 });
            drawing.drawLandmarks(lm, { color: '#ffffff', radius: 3 });
          }
          const state = counter.update(lm, now);
          if (state.reps > lastReps) {
            lastReps = state.reps;
            hapticRep();
            hit('player');
          }
          setHint(state.hint);
        }
        if (streamRef.current) frameRef.current = requestAnimationFrame(loop);
      };

      const fresh = newBattle();
      battleRef.current = fresh;
      setBattle(fresh);
      setLastStrike({ player: null, bot: null });
      setHint(null);
      setSecondsLeft(ROUND_SECONDS);
      setStatus('running');
      loop();
      scheduleBot();
    } catch (e) {
      stop();
      setError(e instanceof Error ? e.message : 'не загрузилась модель распознавания');
      setStatus('error');
    }
  };

  const busy = status === 'loading' || status === 'running';
  const result = status === 'finished' ? winner(battle, true) : null;
  const bot = BOT_LEVELS[level];

  return (
    <div className="app">
      <div>
        <h1>Fit Arena</h1>
        <div className="muted">
          {userName()} против бота «{bot.name}». Каждый повтор — удар, три подряд — комбо.
        </div>
      </div>

      <div className="arena">
        <Arena3D
          playerPunch={battle.player.hits}
          botPunch={battle.bot.hits}
          playerCombo={!!lastStrike.player?.combo}
          botCombo={!!lastStrike.bot?.combo}
          playerKO={battle.player.hp === 0}
          botKO={battle.bot.hp === 0}
        />
        <div className="hud">
          <HpBar label={userName()} hp={battle.player.hp} color="#ff5a36" />
          <div className="timer">{status === 'running' ? secondsLeft : ROUND_SECONDS}</div>
          <HpBar label={bot.name} hp={battle.bot.hp} color="#22c55e" right />
        </div>
        {lastStrike.player?.combo && status === 'running' && (
          <div key={battle.player.hits} className="combo">
            КОМБО −{lastStrike.player.damage}
          </div>
        )}
        {result && (
          <div className="result">
            <div className="result-title">{RESULT_TEXT[result]}</div>
            <div className="muted">
              {EXERCISE_LABELS[exercise]}: {battle.player.hits} повторов
            </div>
          </div>
        )}
        <div className={`pip ${busy ? '' : 'hidden'}`}>
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} />
          <div className="pip-count">{battle.player.hits}</div>
        </div>
      </div>

      <div className="hint-line">
        {status === 'running' && (hint ?? 'Отлично, продолжай!')}
        {status === 'idle' && 'Поставь телефон сбоку в 1,5–2 метрах, чтобы тело было в кадре целиком.'}
        {status === 'error' && `Не удалось запустить камеру: ${error}`}
      </div>

      {!busy && (
        <>
          <div className="tabs">
            {(Object.keys(EXERCISE_LABELS) as Exercise[]).map((ex) => (
              <button key={ex} className={ex === exercise ? 'active' : ''} onClick={() => setExercise(ex)}>
                {EXERCISE_LABELS[ex]}
              </button>
            ))}
          </div>
          <div className="tabs">
            {BOT_LEVELS.map((l, i) => (
              <button key={l.name} className={i === level ? 'active' : ''} onClick={() => setLevel(i)}>
                {l.name}
              </button>
            ))}
          </div>
        </>
      )}

      {status === 'running' ? (
        <button className="primary" onClick={finish}>
          Сдаться
        </button>
      ) : (
        <button className="primary" disabled={status === 'loading'} onClick={start}>
          {status === 'loading' ? 'Загружаю модель…' : status === 'finished' ? 'Реванш' : 'В бой'}
        </button>
      )}
    </div>
  );
}

function HpBar({ label, hp, color, right }: { label: string; hp: number; color: string; right?: boolean }) {
  return (
    <div className={`hp ${right ? 'right' : ''}`}>
      <div className="hp-label">{label}</div>
      <div className="hp-track">
        <div className="hp-fill" style={{ width: `${(hp / MAX_HP) * 100}%`, background: color }} />
      </div>
    </div>
  );
}
