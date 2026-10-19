import { useEffect, useRef, useState } from 'react';
import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import { createPoseLandmarker } from './pose';
import { Exercise, RepCounter } from './repCounter';
import { hapticRep } from './telegram';

// Модель общая на всё приложение: грузится один раз.
let landmarker: Promise<PoseLandmarker> | null = null;

/** Камера с распознаванием позы: рисует скелет и вызывает onRep на каждый засчитанный повтор. */
export function useRepCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  const [hint, setHint] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  };

  useEffect(() => stop, []);

  /** onFrame вызывается каждый кадр; вернёт false — камера остановится. */
  const start = async (exercise: Exercise, onRep: () => void, onFrame?: () => boolean) => {
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

    const counter = new RepCounter(exercise);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const drawing = new DrawingUtils(ctx);
    let lastReps = 0;
    setHint(null);
    setActive(true);

    const loop = () => {
      if (!streamRef.current) return;
      if (onFrame && !onFrame()) return stop();
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const now = performance.now();
        const lm = model.detectForVideo(video, now).landmarks[0];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (lm) {
          drawing.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#ff5a36', lineWidth: 4 });
          drawing.drawLandmarks(lm, { color: '#ffffff', radius: 3 });
        }
        const state = counter.update(lm, now);
        if (state.reps > lastReps) {
          lastReps = state.reps;
          hapticRep();
          onRep();
        }
        setHint(state.hint);
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  return { videoRef, canvasRef, start, stop, hint, active };
}
