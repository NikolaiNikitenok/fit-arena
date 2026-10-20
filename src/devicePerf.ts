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

/**
 * Решение по характеристикам: true — слабый, false — сильный, null — не ясно, решит замер FPS.
 * Число ядер не смотрим: Android отдаёт только ядра, которые сейчас не спят, и средний телефон
 * в режиме экономии батареи показывает 4 — из-за этого экономный режим включался зря.
 */
export function weakByHints(h: DeviceHints): boolean | null {
  if (h.tgClass === 'LOW') return true;
  if (h.tgClass === 'HIGH') return false;
  if (h.memory != null && h.memory <= 2) return true;
  return null;
}

// Ниже этого FPS 3D-сцены в полном качестве экономный режим включается сам. Не 30: экран на 30 Гц
// (режим экономии батареи в Android и Telegram) даёт ровно 30 кадров, и это не слабый телефон.
export const MIN_FPS = 24;
// Первые секунды сцена грузит модели и собирает шейдеры: их не считаем.
const WARMUP_MS = 3000;
const SAMPLE_MS = 4000;
// Версия правил автоматики. Если экономный режим включила автоматика по старым правилам,
// после обновления решаем заново.
export const POWER_RULES = 2;

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
  const s = getSettings();
  if ((s.powerRules ?? 1) < POWER_RULES) {
    // Выбор игрока не трогаем; решение автоматики по старым правилам сбрасываем и принимаем заново.
    setAuto(s.lowPowerChosen ? { powerRules: POWER_RULES } : { powerRules: POWER_RULES, lowPower: false, powerChecked: false });
  }
  if (!undecided() || getSettings().powerChecked) return;
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

// ——— Ограничение кадров в экономном режиме ———
// Экономный режим снижает разрешение и убирает тени, но рисует с частотой экрана. Только если и так
// сцена держит меньше CAP_BELOW кадров, ограничиваем её ровными 30: рывки 20–28 заметнее ровных 30,
// а процессору остаётся время на распознавание позы.
export const CAP_BELOW = 25;
export const CAP_FPS = 30;
let capped = false;
const capListeners = new Set<() => void>();
export const fpsCapped = () => capped;
export function subscribeCap(l: () => void): () => void {
  capListeners.add(l);
  return () => capListeners.delete(l);
}
function setCapped(v: boolean) {
  if (capped === v) return;
  capped = v;
  capListeners.forEach((l) => l());
}

// Кадры 3D за последние секунды: для решения об ограничении и для счётчика FPS у админа.
const stamps: number[] = [];
let lowSince = 0;

/** Кадр 3D-сцены нарисован (зовёт Canvas3D). lowPower — сцена в экономном режиме. */
export function frameDone(now: number, lowPower: boolean): void {
  stamps.push(now);
  while (stamps.length && now - stamps[0] > 1000) stamps.shift();
  if (!lowPower || capped) return;
  // Решаем по трём секундам подряд ниже порога, не раньше чем сцена прогреется.
  const fps = stamps.length;
  if (fps >= CAP_BELOW || now - (stamps[0] ?? now) < 900) lowSince = 0;
  else if (!lowSince) lowSince = now;
  else if (now - lowSince > 3000) setCapped(true);
}

/** Сколько кадров 3D нарисовано за последнюю секунду. */
export function sceneFps(now = performance.now()): number {
  return stamps.filter((t) => now - t <= 1000).length;
}

/** Новая сцена: прогрев не считаем. */
export function sceneStarted(): void {
  stamps.length = 0;
  lowSince = 0;
}
