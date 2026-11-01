// Разминка перед первым подходом дня. Любой старт упражнения с камерой (кампания, задание дня,
// рейд, событие, тренер, программа) проходит через withWarmup: если сегодня разминку ещё не
// предлагали и она включена в настройках, сначала откроется предложение размяться.
// Старт вызывается прямо из нажатия на «Поехали» или «Пропустить» — жест не теряется
// (на iPhone датчик наклона и голос разрешают только из нажатия).
import { useSyncExternalStore } from 'react';
import { getSettings } from '../settings';
import { dayKey } from '../game/progress';
import { t } from '../i18n';

export type MoveId = 'circles' | 'sideBend' | 'twist' | 'hips' | 'knees' | 'jacks';

export interface Move {
  id: MoveId;
  title: string;
  tip: string;
  // Сколько секунд длится движение.
  seconds: number;
}

export const MOVES: Move[] = [
  { id: 'circles', title: t('Круги руками'), tip: t('Прямые руки, большие круги вперёд. Плечи свободны.'), seconds: 20 },
  { id: 'sideBend', title: t('Наклоны в стороны'), tip: t('Рука над головой, тянись в сторону. Таз на месте.'), seconds: 20 },
  { id: 'twist', title: t('Повороты корпуса'), tip: t('Руки в стороны, поворачивай плечи. Стопы не двигаются.'), seconds: 20 },
  { id: 'hips', title: t('Вращение тазом'), tip: t('Руки на поясе, медленные круги тазом. Стопы на месте.'), seconds: 20 },
  { id: 'knees', title: t('Колени вверх'), tip: t('Шагай на месте, поднимая колени к поясу.'), seconds: 20 },
  { id: 'jacks', title: t('Прыжки звёздочкой'), tip: t('Руки вверх, ноги врозь — и обратно. Мягко на носки.'), seconds: 20 },
];

export const WARMUP_SECONDS = MOVES.reduce((s, m) => s + m.seconds, 0);

const KEY = 'fit-arena-warmup-day';

const today = () => dayKey(Date.now());

function lastDay(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memDay;
  }
}
// Без хранилища помним до закрытия игры.
let memDay: string | null = null;

/** Разминку предлагаем, если она включена и сегодня её ещё не предлагали. */
export const needsWarmup = (): boolean => getSettings().warmup && lastDay() !== today();

/** Сегодня разминку уже предложили (сделал или пропустил): до завтра не спрашиваем. */
export function markWarmup(): void {
  memDay = today();
  try {
    localStorage.setItem(KEY, memDay);
  } catch {
    // Хватит памяти до закрытия.
  }
}

// Ожидающий старт: показывается одно предложение на всю игру.
let pending: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const useWarmupRequest = (): (() => void) | null =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
  );

/** Обёртка над стартом подхода: сразу запустит его, а если разминка сегодня ещё не предлагалась — после неё. */
export function withWarmup(start: () => void): void {
  if (!needsWarmup()) return start();
  pending = start;
  emit();
}

/** Закрыть предложение: go — запустить отложенный старт (из того же нажатия). */
export function resolveWarmup(go: boolean): void {
  const start = pending;
  pending = null;
  emit();
  if (go) {
    markWarmup();
    start?.();
  }
}

/** Только для тестов. */
export const resetWarmupForTest = () => {
  pending = null;
  memDay = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Нет хранилища.
  }
};
