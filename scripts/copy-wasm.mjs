// Кладёт WASM MediaPipe в public/, чтобы приложение не зависело от внешних CDN.
import { cpSync } from 'node:fs';

cpSync('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe', { recursive: true });
