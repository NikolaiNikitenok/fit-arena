// Настройки игрока: хранятся в браузере, читаются в любом месте приложения.
import { useSyncExternalStore } from 'react';

export interface Settings {
  // Короткий звук на каждый засчитанный повтор.
  sound: boolean;
  // Вибрация телефона на повтор (Telegram).
  haptics: boolean;
  // Скелет поверх видео с камеры.
  skeleton: boolean;
  // 3D-подсказка «как встать к камере» перед уровнем.
  guide: boolean;
  // Экономия батареи: без теней и с меньшим разрешением 3D.
  lowPower: boolean;
  // Сюжетные диалоги перед уровнями.
  story: boolean;
}

const KEY = 'fit-arena-settings';
const DEFAULTS: Settings = { sound: true, haptics: true, skeleton: true, guide: true, lowPower: false, story: true };

let current: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
})();
const listeners = new Set<() => void>();

export const getSettings = (): Settings => current;

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Без хранилища настройки живут до закрытия.
  }
  listeners.forEach((l) => l());
}

export const useSettings = (): Settings =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );

/** Параметры 3D-сцен с учётом экономии батареи. */
export const canvasProps = (s: Settings) => (s.lowPower ? { shadows: false, dpr: 1 as const } : { shadows: true, dpr: [1, 1.6] as [number, number] });

let audio: AudioContext | null = null;
/** Тихий «дзынь» на повтор: высота растёт с номером повтора, чтобы было слышно темп. */
export function repSound(n: number): void {
  if (!current.sound) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 520 + Math.min(12, n % 13) * 30;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  } catch {
    // Звук недоступен — не страшно.
  }
}
