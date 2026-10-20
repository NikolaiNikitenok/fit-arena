import { useEffect, useRef, useState } from 'react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { createPoseLandmarker, loadVision } from './pose';
import { frameRotations, enableOrientation } from './orientation';
import { Counter, Exercise, PlankTimer, RepCounter } from './repCounter';
import { getSettings } from './settings';
import { Calibrator, CalibrationView, personalThresholds, saveCalibration, skipCalibration } from './calibration';
import { repSound } from './audio';
import { hapticRep } from './telegram';
import { reportCameraFailure, trackOnce } from './telemetry';

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
  const [hint, setHint] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [angle, setAngle] = useState<number | null>(null);
  const [limits, setLimits] = useState<{ down: number; up: number } | null>(null);
  // Калибровка перед подходом: пока она идёт, повторы не считаются и onFrame не вызывается.
  const calibRef = useRef<{ c: Calibrator; doneAt: number } | null>(null);
  const [calib, setCalib] = useState<CalibrationView | null>(null);

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  };

  useEffect(() => stop, []);

  // Модель (≈19 МБ с WASM) качаем, пока игрок читает брифинг, но не мешая первому кадру экрана.
  useEffect(() => {
    if (!preload) return;
    const t = setTimeout(() => void preloadPose().catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, [preload]);

  /** onFrame вызывается каждый кадр; вернёт false — камера остановится. */
  const start = async (exercise: Exercise, onRep: () => void, onFrame?: () => boolean, opts: { calibrate?: boolean } = {}) => {
    // До первого await: на iPhone разрешение на датчик можно спросить только прямо из нажатия.
    enableOrientation();
    const [model, vision] = await Promise.all([
      preloadPose().catch((e) => {
        reportCameraFailure(e, 'model');
        throw e;
      }),
      loadVision(),
    ]);
    // Без mediaDevices (старый WebView) ошибка тоже попадает в отчёт.
    const stream = await Promise.resolve()
      .then(() =>
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        }),
      )
      .catch((e) => {
        reportCameraFailure(e, 'camera');
        throw e;
      });
    trackOnce('camera_granted');
    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();

    counterRef.current = counterFor(exercise);
    setLimits({ down: counterRef.current.down, up: counterRef.current.up });
    // Планке калибровка не нужна: у неё нет амплитуды.
    calibRef.current = opts.calibrate && exercise !== 'plank' ? { c: new Calibrator(exercise), doneAt: 0 } : null;
    setCalib(calibRef.current?.c.view ?? null);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const drawing = new vision.DrawingUtils(ctx);
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
    setHint(null);
    setActive(true);

    const loop = () => {
      if (!streamRef.current) return;
      const cal = calibRef.current;
      if (cal?.doneAt && performance.now() - cal.doneAt > CALIB_DONE_MS) {
        calibRef.current = null;
        setCalib(null);
      }
      if (!calibRef.current && onFrame && !onFrame()) return stop();
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
        const state = counterRef.current!.update(lm, now, video.videoWidth / video.videoHeight, frameRotations());
        const c = calibRef.current;
        if (c && !c.doneAt) {
          const v = c.c.update(lm ? state.angle : null, state.hint == null, now);
          setCalib(v);
          if (v.result) {
            c.doneAt = now;
            saveCalibration(c.c.exercise, v.result);
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
          onRep();
        }
        setHint(state.hint);
        // Угол — отладочная подсказка, видна вместе со скелетом.
        setAngle(getSettings().skeleton ? state.angle : null);
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  /** Смена упражнения на ходу (фазы босса): счёт начинается заново. */
  const switchExercise = (exercise: Exercise) => {
    if (!counterRef.current) return;
    counterRef.current = counterFor(exercise);
    setLimits({ down: counterRef.current.down, up: counterRef.current.up });
    lastRepsReset.current = true;
  };

  /** Пропустить калибровку: считаем по общим порогам (или прежним личным) и больше не спрашиваем сами. */
  const skipCalib = () => {
    const c = calibRef.current;
    if (!c || c.doneAt) return;
    skipCalibration(c.c.exercise);
    // Пока шла калибровка, счётчик видел повторы: начинаем с нуля.
    counterRef.current?.reset();
    lastRepsReset.current = true;
    calibRef.current = null;
    setCalib(null);
  };

  return { videoRef, canvasRef, start, stop, switchExercise, skipCalib, hint, active, angle, limits, calib };
}
