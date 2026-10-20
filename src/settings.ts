// Настройки игрока: хранятся в браузере, читаются в любом месте приложения.
import { useSyncExternalStore } from 'react';

export interface Settings {
  // Звуки игры: сигнал повтора, удары, победа, монеты.
  sound: boolean;
  // Фоновая музыка миров.
  music: boolean;
  // «Голос Грома»: тренер вслух считает повторы и подбадривает.
  voice: boolean;
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
const DEFAULTS: Settings = { sound: true, music: true, voice: true, haptics: true, skeleton: true, guide: true, lowPower: false, story: true };

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

/** Подписка на изменения настроек; возвращает отписку. */
export const subscribeSettings = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useSettings = (): Settings => useSyncExternalStore(subscribeSettings, () => current);

/** Параметры 3D-сцен с учётом экономии батареи. */
export const canvasProps = (s: Settings) => (s.lowPower ? { shadows: false, dpr: 1 as const } : { shadows: true, dpr: [1, 1.6] as [number, number] });

/** Сигнал на повтор теперь живёт в звуковом движке. */
export { repSound } from './audio';
