import { useEffect, useRef, useState } from 'react';
import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import { createPoseLandmarker } from './pose';
import { Exercise, EXERCISE_LABELS, RepCounter, RepState } from './repCounter';
import { hapticRep, userName } from './telegram';

const ROUND_SECONDS = 60;

type Status = 'idle' | 'loading' | 'running' | 'finished' | 'error';

export function App() {
  const [exercise, setExercise] = useState<Exercise>('pushup');
  const [status, setStatus] = useState<Status>('idle');
  const [rep, setRep] = useState<RepState>({ reps: 0, phase: 'up', angle: null, hint: null });
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => stop, []);

  useEffect(() => {
    if (status !== 'running') return;
    if (secondsLeft <= 0) {
      stop();
      setStatus('finished');
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [status, secondsLeft]);

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

      const loop = () => {
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
          }
          setRep(state);
        }
        frameRef.current = requestAnimationFrame(loop);
      };

      setRep(counter.current);
      setSecondsLeft(ROUND_SECONDS);
      setStatus('running');
      loop();
    } catch (e) {
      stop();
      setError(e instanceof Error ? e.message : 'не загрузилась модель распознавания');
      setStatus('error');
    }
  };

  const busy = status === 'loading' || status === 'running';

  return (
    <div className="app">
      <div>
        <h1>Fit Arena</h1>
        <div className="muted">Привет, {userName()}! Раунд длится {ROUND_SECONDS} секунд.</div>
      </div>

      <div className="tabs">
        {(Object.keys(EXERCISE_LABELS) as Exercise[]).map((ex) => (
          <button key={ex} className={ex === exercise ? 'active' : ''} disabled={busy} onClick={() => setExercise(ex)}>
            {EXERCISE_LABELS[ex]}
          </button>
        ))}
      </div>

      <div className="stage">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
        <div className="counter">{rep.reps}</div>
        {status === 'running' && <div className="hint">{rep.hint ?? `Осталось ${secondsLeft} с`}</div>}
        {status === 'idle' && <div className="hint">Поставь телефон сбоку в 1,5–2 метрах, чтобы тело было в кадре целиком.</div>}
        {status === 'finished' && (
          <div className="hint">
            Готово: {rep.reps} — {EXERCISE_LABELS[exercise].toLowerCase()} за {ROUND_SECONDS} с.
          </div>
        )}
        {status === 'error' && <div className="hint">Не удалось запустить камеру: {error}</div>}
      </div>

      {status === 'running' ? (
        <button
          className="primary"
          onClick={() => {
            stop();
            setStatus('finished');
          }}
        >
          Закончить
        </button>
      ) : (
        <button className="primary" disabled={status === 'loading'} onClick={start}>
          {status === 'loading' ? 'Загружаю модель…' : status === 'finished' ? 'Ещё раунд' : 'Начать'}
        </button>
      )}
    </div>
  );
}
