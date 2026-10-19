import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

// WASM и модель отдаём со своего хостинга: внешние CDN доступны не во всех странах.
const WASM_URL = `${import.meta.env.BASE_URL}mediapipe`;
const MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;

export async function createPoseLandmarker(): Promise<PoseLandmarker> {
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
