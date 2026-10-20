import type { PoseLandmarker } from '@mediapipe/tasks-vision';

// WASM и модель отдаём со своего хостинга: внешние CDN доступны не во всех странах.
const WASM_URL = `${import.meta.env.BASE_URL}mediapipe`;
// Лёгкая модель (lite, 5.8 МБ): на дешёвых Android полная модель не успевает за камерой.
const MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;

// Библиотека распознавания (≈150 КБ кода) грузится только для экранов с камерой.
export const loadVision = () => import('@mediapipe/tasks-vision');

export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const { FilesetResolver, PoseLandmarker } = await loadVision();
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
  };
  try {
    return await PoseLandmarker.createFromOptions(fileset, options);
  } catch {
    // Часть WebView в Telegram не даёт GPU — переключаемся на CPU.
    return PoseLandmarker.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
  }
}
