import { useEffect, useRef, useState } from 'react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { createPoseLandmarker, loadVision } from './pose';
import { useBusy } from './updates/busy';
import { frameRotations, enableOrientation } from './orientation';
import { Counter, Exercise, PlankTimer, RepCounter } from './repCounter';
import { getSettings } from './settings';
import { Calibrator, CalibrationView, calibrationSink, personalThresholds } from './calibration';
import { repSound } from './audio';
import { hapticRep } from './telegram';
import { createTrainingTelemetry, reportCameraFailure, trackOnce } from './telemetry';
import { Flames } from './flames';
import { say } from './voice';
import { TrainingLifecycle } from './trainingLifecycle';

export const POSITIONING_ENABLED = import.meta.env.VITE_POSITIONING_GATE !== '0';
const configuredStable = Number(import.meta.env.VITE_POSITIONING_STABLE_MS ?? 1500);
const STABLE_MS = Number.isFinite(configuredStable) ? Math.max(1000, Math.min(2000, configuredStable)) : 1500;

// Модель общая на всё приложение: грузится один раз.
let landmarker: Promise<PoseLandmarker> | null = null;

/** Начать загрузку распознавания заранее (на брифинге, в комнате дуэли), чтобы к старту всё было готово. */
export function preloadPose(): Promise<PoseLandmarker> {
  landmarker ??= createPoseLandmarker().catch((e) => {
    landmarker = null;
    throw e;
  });
  return landmarker;
}

// В экономном режиме распознаём не чаще 15 раз в секунду: счёт от этого не страдает (repCounter
// сглаживает по времени), а 3D-сцене и телефону остаётся запас.
const LOW_POWER_DETECT_MS = 1000 / 15;

// Сколько показываем «Готово» после калибровки, прежде чем пойдёт отсчёт.
const CALIB_DONE_MS = 1600;

// Планка считается таймером: onRep приходит на каждую удержанную секунду.
const counterFor = (exercise: Exercise): Counter => (exercise === 'plank' ? new PlankTimer() : new RepCounter(exercise, personalThresholds(exercise)));

/** Камера с распознаванием позы: рисует скелет и вызывает onRep на каждый засчитанный повтор (у планки — на каждую секунду). */
export function useRepCamera(preload = true) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  const counterRef = useRef<Counter | null>(null);
  const lastRepsReset = useRef(false);
  // Огонь на кулаках: сила комбо (0 — не горит), ставит экран боя.
  const flameRef = useRef(0);
  const [hint, setHint] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  // Камера включена — идёт подход, обновление игры подождёт.
  useBusy(active);
  const [angle, setAngle] = useState<number | null>(null);
  const [limits, setLimits] = useState<{ down: number; up: number } | null>(null);
  // Калибровка перед подходом: пока она идёт, повторы не считаются и onFrame не вызывается.
  const calibRef = useRef<{ c: Calibrator; doneAt: number; sink: ReturnType<typeof calibrationSink> } | null>(null);
  const [calib, setCalib] = useState<CalibrationView | null>(null);
  // Кнопка «Начать»: камера уже показывает игрока, но счёт, калибровка и onFrame ждут go().
  const gateRef = useRef<null | (() => void)>(null);
  const [waiting, setWaiting] = useState(false);
  // Сколько медленных повторов игрок сделал на калибровке: их засчитывает экран боя.
  const calibDoneRef = useRef<((reps: number) => void) | undefined>(undefined);

  const attemptReport = useRef<ReturnType<typeof createTrainingTelemetry> | null>(null);
  const exerciseStarted = useRef(false);
  const exitStage = useRef<'loading' | 'positioning' | 'countdown' | 'active' | 'tracking_lost'>('loading');
  const generation = useRef(0);
  const starting = useRef(false);
  const lifecycle = useRef(new TrainingLifecycle());
  const readyRef = useRef(false);
  const observedAt = useRef(-Infinity);
  const probeRef = useRef<Counter | null>(null);
  const [trainingState, setTrainingState] = useState(lifecycle.current.state);
  const [preparing, setPreparing] = useState(false);
  const [prepareSeconds, setPrepareSeconds] = useState(0);
  const stop = (reason: 'CANCELLED' | 'COMPLETED' | 'ERROR' = 'CANCELLED') => {
    const report = attemptReport.current;
    attemptReport.current = null;
    if (report) report(reason === 'COMPLETED' && exerciseStarted.current ? 'exercise_completed' : 'exercise_abandoned', { exitStage: exitStage.current, reason: reason === 'COMPLETED' ? 'completed' : reason === 'ERROR' ? 'unknown' : 'cancelled' });
    generation.current++;
    starting.current = false;
    lifecycle.current.end(reason);
    setTrainingState(reason);
    setPreparing(false);
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    gateRef.current = null;
    setWaiting(false);
    setActive(false);
  };

  useEffect(() => stop, []);

  // Модель (≈19 МБ с WASM) качаем, пока игрок читает брифинг, но не мешая первому кадру экрана.
  useEffect(() => {
    if (!preload) return;
    const t = setTimeout(() => void preloadPose().catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, [preload]);

  /** onFrame вызывается каждый кадр; вернёт false — камера остановится.
   *  persist: false — итог калибровки не сохраняется сам (повторная калибровка из настроек).
   *  gate: true — после включения камеры ждём go() (кнопка «Начать»): игрок видит себя и ставит телефон.
   *  onCalibrated — сколько повторов сделано на калибровке (и при пропуске): их можно засчитать в бой. */
  const start = async (exercise: Exercise, onRep: () => void, onFrame?: () => boolean, opts: { calibrate?: boolean; persist?: boolean; gate?: boolean; prepare?: boolean; onError?: (error: unknown) => void; onCalibrated?: (reps: number) => void } = {}) => {
    if (starting.current || streamRef.current) throw new Error('Камера уже запущена');
    starting.current = true;
    const run = ++generation.current;
    const current = () => generation.current === run;
    let ownFailure = false;
    const managed = POSITIONING_ENABLED && opts.prepare === true;
    const report: ReturnType<typeof createTrainingTelemetry> = managed ? createTrainingTelemetry() : () => {};
    exerciseStarted.current = false;
    attemptReport.current = report;
    const cameraStartedAt = performance.now();
    exitStage.current = 'loading';
    let failedAttempts = 0;
    let previousValid = false;
    let previousStage = 'POSITIONING';
    const preparation = new TrainingLifecycle(STABLE_MS);
    preparation.load();
    setTrainingState('CAMERA_LOADING');
    setPreparing(managed);
    readyRef.current = false;
    setHint('Встань в кадр: камера проверяет положение');
    try {
    // До первого await: на iPhone разрешение на датчик можно спросить только прямо из нажатия.
    enableOrientation();
    const [model, vision] = await Promise.all([
      preloadPose().catch((e) => {
        if (current()) reportCameraFailure(e, 'model');
        throw e;
      }),
      loadVision(),
    ]);
    if (!current()) throw new DOMException('Запуск отменён', 'AbortError');
    // Без mediaDevices (старый WebView) ошибка тоже попадает в отчёт.
    report('camera_permission_requested', { exercise });
    const stream = await Promise.resolve()
      .then(() =>
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        }),
      )
      .catch((e) => {
        if (current() && e instanceof Error && ['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(e.name)) report('camera_permission_denied', { exercise, reason: 'permission_denied' });
        if (current()) reportCameraFailure(e, 'camera');
        throw e;
      });
    if (!current()) { stream.getTracks().forEach((t) => t.stop()); throw new DOMException('Запуск отменён', 'AbortError'); }
    report('camera_permission_granted', { exercise });
    trackOnce('camera_granted');
    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();
    if (!current()) throw new DOMException('Запуск отменён', 'AbortError');

    report('camera_ready', { exercise, cameraMs: performance.now() - cameraStartedAt });
    report('positioning_started', { exercise });
    exitStage.current = 'positioning';
    counterRef.current = counterFor(exercise);
    probeRef.current = counterFor(exercise);
    setLimits({ down: counterRef.current.down, up: counterRef.current.up });
    calibDoneRef.current = opts.onCalibrated;
    // Планке калибровка не нужна: у неё нет амплитуды.
    const beginCalib = () => {
      calibRef.current = opts.calibrate && exercise !== 'plank' ? { c: new Calibrator(exercise), doneAt: 0, sink: calibrationSink(opts.persist ?? true) } : null;
      setCalib(calibRef.current?.c.view ?? null);
    };
    if (opts.gate) {
      calibRef.current = null;
      setCalib(null);
      gateRef.current = beginCalib;
      setWaiting(true);
    } else beginCalib();
    lifecycle.current = new TrainingLifecycle(STABLE_MS, 0);
    lifecycle.current.cameraReady();
    preparation.cameraReady(true);
    probeRef.current = counterFor(exercise);
    let spokenSecond = -1;
    let released = !managed;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const drawing = new vision.DrawingUtils(ctx);
    const flames = new Flames();
    let lastReps = 0;
    // Новый кадр камеры: видео обычно идёт 30 кадров в секунду, а экран 60 — один кадр дважды не распознаём.
    let lastVideoTime = -1;
    let lastDetect = -Infinity;
    const due = (now: number) => {
      // Часть WebView не двигает currentTime у живого видео: тогда всё равно распознаём 30 раз в секунду.
      if (video.currentTime === lastVideoTime && now - lastDetect < 33) return false;
      if (getSettings().lowPower && now - lastDetect < LOW_POWER_DETECT_MS - 2) return false;
      lastVideoTime = video.currentTime;
      lastDetect = now;
      return true;
    };
    setHint('Встань в кадр: камера проверяет положение');
    setActive(true);

    let initialFrame = true;
    const loop = () => {
      if (!current() || !streamRef.current) return;
      try {
      const cal = calibRef.current;
      if (cal?.doneAt && performance.now() - cal.doneAt > CALIB_DONE_MS) {
        calibRef.current = null;
        setCalib(null);
      }
      const gated = gateRef.current != null;
      if (released && !gated && !calibRef.current && onFrame && !onFrame()) return stop('COMPLETED');
      const now = performance.now();
      if (video.readyState >= 2 && due(now)) {
        // Смена размера холста стирает его и выделяет память заново: только когда размер поменялся.
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const lm = model.detectForVideo(video, now).landmarks[0];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (lm && getSettings().skeleton) {
          drawing.drawConnectors(lm, vision.PoseLandmarker.POSE_CONNECTIONS, { color: '#ff5a36', lineWidth: 4 });
          drawing.drawLandmarks(lm, { color: '#ffffff', radius: 3 });
        }
        flames.step(ctx, lm, flameRef.current, now, getSettings().lowPower);
        const state = counterRef.current!.update(lm, now, video.videoWidth / video.videoHeight, frameRotations());
        const probe = probeRef.current!;
        probe.reset();
        const observed = probe.update(lm, now, video.videoWidth / video.videoHeight, frameRotations());
        observedAt.current = now;
        const valid = !!lm && observed.angle !== null && observed.hint === null;
        const color = !lm ? '#e5484d' : valid && (released && !gateRef.current || readyRef.current) ? '#30a46c' : '#f5a524';
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
        if (!valid && previousValid) failedAttempts++;
        previousValid = valid;
        // До «Начать» только показываем позу и подсказку: повторы не идут.
        if (gateRef.current) {
          const readiness = lifecycle.current.frame(valid, now);
          readyRef.current = readiness === 'READY';
          if (readyRef.current) report('positioning_completed', { exercise, failedAttempts });
          setTrainingState(readiness);
          setHint(!POSITIONING_ENABLED ? null : valid ? (readyRef.current ? null : 'Удерживай положение') : observed.hint ?? 'Встань в кадр');
          setAngle(getSettings().skeleton ? state.angle : null);
          frameRef.current = requestAnimationFrame(loop);
          return;
        }
        const c = calibRef.current;
        if (c && !c.doneAt) {
          const v = c.c.update(lm ? state.angle : null, state.hint == null, now);
          setCalib(v);
          if (v.result) {
            c.doneAt = now;
            c.sink.done(c.c.exercise, v.result);
            calibDoneRef.current?.(v.reps);
            counterRef.current = new RepCounter(c.c.exercise, v.result);
            setLimits(v.result);
            lastReps = 0;
          }
        }
        if (c) {
          setHint(state.hint);
          setAngle(getSettings().skeleton ? state.angle : null);
          frameRef.current = requestAnimationFrame(loop);
          return;
        }
        if (managed && !released) {
          const stage = preparation.frame(valid, now);
          setTrainingState(stage);
          if (stage === 'COUNTDOWN') {
            exitStage.current = 'countdown';
            report('positioning_completed', { exercise, failedAttempts });
            report('countdown_started', { exercise });
          } else exitStage.current = 'positioning';
          const seconds = preparation.seconds(now);
          setPrepareSeconds(seconds);
          if (seconds > 0 && seconds !== spokenSecond) { spokenSecond = seconds; say(String(seconds)); }
          setHint(valid ? 'Удерживай положение' : observed.hint);
          if (stage !== 'ACTIVE') {
            frameRef.current = requestAnimationFrame(loop);
            return;
          }
          exerciseStarted.current = true;
          report('exercise_started', { exercise, failedAttempts });
          exitStage.current = 'active';
          previousStage = 'ACTIVE';
          released = true;
          setPreparing(false);
          counterRef.current!.reset();
          lastReps = 0;
          frameRef.current = requestAnimationFrame(loop);
          return;
        }
        if (managed) {
          const stage = preparation.frame(valid, now);
          setTrainingState(stage);
          if (stage === 'TRACKING_LOST' && previousStage !== stage) report('tracking_lost', { exercise });
          previousStage = stage;
          exitStage.current = stage === 'TRACKING_LOST' ? 'tracking_lost' : 'active';
        }
        if (lastRepsReset.current) {
          lastRepsReset.current = false;
          lastReps = 0;
        }
        if (state.reps > lastReps) {
          lastReps = state.reps;
          // Планка звучит раз в 10 секунд, а не каждую секунду.
          const quiet = counterRef.current instanceof PlankTimer && state.reps % 10 !== 0;
          if (getSettings().haptics && !quiet) hapticRep();
          if (!quiet) repSound(state.reps);
          if (managed) report('first_rep_detected', { exercise: counterRef.current!.exercise });
          onRep();
        }
        setHint(state.hint);
        // Угол — отладочная подсказка, видна вместе со скелетом.
        setAngle(getSettings().skeleton ? state.angle : null);
      }
      frameRef.current = requestAnimationFrame(loop);
      } catch (e) {
        if (current()) { ownFailure = true; report('recognition_error', { exercise, reason: 'inference' }); stop('ERROR'); reportCameraFailure(e, 'model'); setHint('Ошибка распознавания. Вернись назад и повтори запуск'); opts.onError?.(e); }
        if (initialFrame) throw e;
      }
    };
    starting.current = false;
    loop();
    initialFrame = false;
    } catch (e) {
      if (!current() && !ownFailure) throw new DOMException('Запуск отменён', 'AbortError');
      if (current()) stop('ERROR');
      throw e;
    }
  };

  /** Смена упражнения на ходу (фазы босса): счёт начинается заново. */
  const switchExercise = (exercise: Exercise) => {
    if (!counterRef.current) return;
    counterRef.current = counterFor(exercise);
    probeRef.current = counterFor(exercise);
    setLimits({ down: counterRef.current.down, up: counterRef.current.up });
    lastRepsReset.current = true;
  };

  /** Пропустить калибровку: считаем по общим порогам (или прежним личным) и больше не спрашиваем сами. */
  const skipCalib = () => {
    const c = calibRef.current;
    if (!c || c.doneAt) return;
    c.sink.skip(c.c.exercise);
    calibDoneRef.current?.(c.c.view.reps);
    // Пока шла калибровка, счётчик видел повторы: начинаем с нуля.
    counterRef.current?.reset();
    lastRepsReset.current = true;
    calibRef.current = null;
    setCalib(null);
  };

  /** Кнопка «Начать»: с этого момента идут калибровка, отсчёт и счёт. */
  const go = () => {
    const begin = gateRef.current;
    if (!begin || (POSITIONING_ENABLED && (!readyRef.current || performance.now() - observedAt.current > 750))) return false;
    gateRef.current = null;
    setWaiting(false);
    // Пока игрок устраивался, счётчик мог увидеть «повторы»: начинаем с нуля.
    counterRef.current?.reset();
    lastRepsReset.current = true;
    lifecycle.current.requestStart();
    begin();
    return true;
  };

  /** Сила огня на кулаках (0 — погасить). */
  const setFlame = (tier: number) => {
    flameRef.current = tier;
  };

  return { videoRef, canvasRef, start, stop, switchExercise, skipCalib, setFlame, go, hint, active, angle, limits, calib, waiting, trainingState, preparing, prepareSeconds };
}
