// Слабый ли телефон: на первом запуске смотрим характеристики и замеряем FPS 3D-сцены.
// Если телефон не тянет, сами включаем экономный режим и коротко сообщаем об этом.
// Выбор игрока в настройках главнее: после него автоматика ничего не трогает.
import { getSettings, setAuto } from './settings';

export type PerfClass = 'LOW' | 'AVERAGE' | 'HIGH';

/**
 * Класс производительности, который Telegram для Android дописывает в user agent (Bot API 8.0):
 * «Telegram-Android/11.2.3 (Samsung SM-A125F; Android 11; SDK 30; LOW)».
 */
export function telegramPerfClass(ua: string): PerfClass | null {
  const m = /Telegram-Android\/[\d.]+\s*\(([^)]*)\)/i.exec(ua);
  const cls = m?.[1].split(';').pop()?.trim().toUpperCase();
  return cls === 'LOW' || cls === 'AVERAGE' || cls === 'HIGH' ? cls : null;
}

export interface DeviceHints {
  cores?: number;
  // navigator.deviceMemory, ГБ (есть только в Chrome; округлён вниз до 0.25, 0.5, 1, 2, 4, 8).
  memory?: number;
  android: boolean;
  tgClass: PerfClass | null;
}

export function deviceHints(nav: Navigator = navigator): DeviceHints {
  const platform = (window.Telegram?.WebApp as { platform?: string } | undefined)?.platform;
  return {
    cores: nav.hardwareConcurrency || undefined,
    memory: (nav as Navigator & { deviceMemory?: number }).deviceMemory,
    android: platform === 'android' || /Android/i.test(nav.userAgent),
    tgClass: telegramPerfClass(nav.userAgent),
  };
}

/** Решение по характеристикам: true — слабый, false — сильный, null — не ясно, решит замер FPS. */
export function weakByHints(h: DeviceHints): boolean | null {
  if (h.tgClass === 'LOW') return true;
  if (h.tgClass === 'HIGH') return false;
  if (h.memory != null && h.memory <= 3) return true;
  // Четыре ядра — это дешёвый Android; у iPhone ядер мало, но они быстрые, поэтому только Android.
  if (h.cores != null && h.cores <= 4 && h.android) return true;
  return null;
}

// Ниже этого FPS 3D-сцены экономный режим включается сам.
export const MIN_FPS = 30;
// Первые секунды сцена грузит модели и собирает шейдеры: их не считаем.
const WARMUP_MS = 3000;
const SAMPLE_MS = 4000;

const toastListeners = new Set<() => void>();
let toastPending = false;

/** Подписка на сообщение «включили экономный режим». */
export function onPowerToast(l: () => void): () => void {
  toastListeners.add(l);
  // Включили до того, как экран подписался: показываем один раз.
  if (toastPending) {
    toastPending = false;
    l();
  }
  return () => toastListeners.delete(l);
}

function enableAuto(): void {
  setAuto({ lowPower: true, powerChecked: true });
  toastPending = !toastListeners.size;
  toastListeners.forEach((l) => l());
}

const undecided = () => {
  const s = getSettings();
  return !s.lowPowerChosen && !s.lowPower;
};

/** При запуске: явно слабый телефон сразу получает экономный режим, ещё до первой 3D-сцены. */
export function initPowerAuto(): void {
  if (!undecided()) return;
  const weak = weakByHints(deviceHints());
  if (weak) enableAuto();
  else if (weak === false) setAuto({ powerChecked: true });
}

let probing = false;

/** Замер FPS, когда появилась первая 3D-сцена. Один раз, пока не дошёл до конца. */
export function probeFps(): void {
  if (probing || !undecided() || getSettings().powerChecked) return;
  probing = true;
  setTimeout(() => {
    let frames = 0;
    let start = 0;
    const tick = (t: number) => {
      if (document.hidden || !undecided()) {
        probing = false;
        return;
      }
      if (!start) start = t;
      frames++;
      if (t - start < SAMPLE_MS) return void requestAnimationFrame(tick);
      const fps = ((frames - 1) * 1000) / (t - start);
      if (fps < MIN_FPS) enableAuto();
      else setAuto({ powerChecked: true });
    };
    requestAnimationFrame(tick);
  }, WARMUP_MS);
}
