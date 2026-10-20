import { useEffect, useRef, useState } from 'react';
import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import { createPoseLandmarker } from './pose';
import { frameRotations, enableOrientation } from './orientation';
import { Exercise, RepCounter } from './repCounter';
import { getSettings } from './settings';
import { Calibrator, CalibrationView, personalThresholds, saveCalibration, skipCalibration } from './calibration';
import { repSound } from './audio';
import { hapticRep } from './telegram';

// Модель общая на всё приложение: грузится один раз.
let landmarker: Promise<PoseLandmarker> | null = null;

// Сколько показываем «Готово» после калибровки, прежде чем пойдёт отсчёт.
const CALIB_DONE_MS = 1600;

const counterFor = (exercise: Exercise) => new RepCounter(exercise, personalThresholds(exercise));

/** Камера с распознаванием позы: рисует скелет и вызывает onRep на каждый засчитанный повтор. */
export function useRepCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  const counterRef = useRef<RepCounter | null>(null);
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

  /** onFrame вызывается каждый кадр; вернёт false — камера остановится. */
  const start = async (exercise: Exercise, onRep: () => void, onFrame?: () => boolean, opts: { calibrate?: boolean } = {}) => {
    // До первого await: на iPhone разрешение на датчик можно спросить только прямо из нажатия.
    enableOrientation();
    landmarker ??= createPoseLandmarker().catch((e) => {
      landmarker = null;
      throw e;
    });
    const model = await landmarker;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();

    counterRef.current = counterFor(exercise);
    setLimits({ down: counterRef.current.down, up: counterRef.current.up });
    calibRef.current = opts.calibrate ? { c: new Calibrator(exercise), doneAt: 0 } : null;
    setCalib(calibRef.current?.c.view ?? null);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const drawing = new DrawingUtils(ctx);
    let lastReps = 0;
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
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const now = performance.now();
        const lm = model.detectForVideo(video, now).landmarks[0];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (lm && getSettings().skeleton) {
          drawing.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#ff5a36', lineWidth: 4 });
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
          if (getSettings().haptics) hapticRep();
          repSound(state.reps);
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
