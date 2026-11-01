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
  // Экономия батареи: без теней, сглаживания и мелких украшений, с меньшим разрешением 3D. Кадров —
  // сколько даёт экран; 30 — только если телефон и так не тянет (devicePerf.ts).
  // На слабых телефонах включается сам (devicePerf.ts), пока игрок не выбрал сам.
  lowPower: boolean;
  // Игрок сам переключал экономию: автоматика её больше не трогает.
  lowPowerChosen: boolean;
  // Замер FPS на первом запуске уже прошёл.
  powerChecked: boolean;
  // По какой версии правил автоматика решала про экономный режим (devicePerf.ts, POWER_RULES).
  powerRules?: number;
  // Разминка перед первым подходом дня (src/warmup).
  warmup: boolean;
  // Сюжетные диалоги перед уровнями.
  story: boolean;
  // Деревня живёт по местным часам: утро, день, вечер с фонарями, ночь.
  dayNight: boolean;
  // Дождь и снег, светлячки, пыль, обломки, монеты и салют в деревне.
  villageFx: boolean;
  // Пролёт камеры над деревней при входе.
  flyIn: boolean;
  // Главная старым списком с прокруткой вместо сцены «во весь экран».
  homeList: boolean;
}

const KEY = 'fit-arena-settings';
const DEFAULTS: Settings = { sound: true, music: true, voice: true, haptics: true, skeleton: true, guide: true, warmup: true, lowPower: false, lowPowerChosen: false, powerChecked: false, story: true, dayNight: true, villageFx: true, flyIn: true, homeList: false };

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
  // Выбор игрока главнее автоматики.
  if (key === 'lowPower') current.lowPowerChosen = true;
  save();
}

/** Изменение настроек без пометки «выбрал игрок»: для автоматики. */
export function setAuto(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  save();
}

function save(): void {
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

/** Параметры 3D-сцен с учётом экономии батареи. На сильных телефонах всё как было. */
export const canvasProps = (s: Settings) =>
  s.lowPower
    ? { shadows: false, dpr: 1 as const, gl: { antialias: false, powerPreference: 'default' as const } }
    : { shadows: true, dpr: [1, 1.6] as [number, number], gl: {} };

/** Сигнал на повтор теперь живёт в звуковом движке. */
export { repSound } from './audio';
