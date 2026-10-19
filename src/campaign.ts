// Кампания: три мира по пять уровней, в конце каждого мира босс.
import type { Exercise } from './repCounter';

export interface ZoneTheme {
  name: string;
  background: string;
  ring: string;
  ropes: [string, string];
  light: string;
}

export interface Level {
  id: number;
  zone: number;
  name: string;
  exercise: Exercise;
  color: string;
  hp: number;
  power: number;
  intervalMs: number;
  jitterMs: number;
  seconds: number;
  boss?: {
    // При здоровье ниже этой доли босс впадает в ярость и бьёт чаще.
    enrageAt: number;
    enrageSpeedup: number;
    taunt: string;
  };
}

export const ZONES: ZoneTheme[] = [
  { name: 'Подвальный зал', background: '#120d0a', ring: '#7c4a1e', ropes: ['#d97706', '#f5f5f4'], light: '#ffd8a8' },
  { name: 'Неоновый город', background: '#0a0716', ring: '#4c1d95', ropes: ['#ec4899', '#22d3ee'], light: '#c4b5fd' },
  { name: 'Орбитальная станция', background: '#03060d', ring: '#0f3d5e', ropes: ['#38bdf8', '#e2e8f0'], light: '#bae6fd' },
];

const L = (
  id: number,
  name: string,
  exercise: Exercise,
  color: string,
  hp: number,
  intervalMs: number,
  extra: Partial<Level> = {},
): Level => ({
  id,
  zone: Math.floor((id - 1) / 5),
  name,
  exercise,
  color,
  hp,
  power: 1,
  intervalMs,
  jitterMs: intervalMs * 0.25,
  seconds: 60,
  ...extra,
});

export const LEVELS: Level[] = [
  L(1, 'Ржавый Болт', 'squat', '#a16207', 50, 4000, { power: 0.6 }),
  L(2, 'Гайка', 'pushup', '#b45309', 60, 3600, { power: 0.7 }),
  L(3, 'Шестерёнка', 'situp', '#78716c', 70, 3300, { power: 0.8 }),
  L(4, 'Поршень', 'squat', '#9a3412', 85, 3000, { power: 0.9 }),
  L(5, 'Железный Гриша', 'pushup', '#94a3b8', 150, 2800, {
    power: 1.2,
    seconds: 90,
    boss: { enrageAt: 0.5, enrageSpeedup: 0.65, taunt: 'Гриша в ярости!' },
  }),
  L(6, 'Неонка', 'situp', '#db2777', 100, 2800),
  L(7, 'Глитч', 'pushup', '#7c3aed', 110, 2600),
  L(8, 'Вольт', 'squat', '#0891b2', 120, 2500, { power: 1.1 }),
  L(9, 'Хром', 'situp', '#a1a1aa', 130, 2400, { power: 1.1 }),
  L(10, 'Кибер-Медведь', 'squat', '#be185d', 220, 2200, {
    power: 1.4,
    seconds: 90,
    boss: { enrageAt: 0.5, enrageSpeedup: 0.6, taunt: 'Медведь перегрелся!' },
  }),
  L(11, 'Квазар', 'pushup', '#2563eb', 140, 2200, { power: 1.2 }),
  L(12, 'Пульсар', 'squat', '#0d9488', 150, 2100, { power: 1.2 }),
  L(13, 'Комета', 'situp', '#e2e8f0', 160, 2000, { power: 1.3 }),
  L(14, 'Туманность', 'pushup', '#6366f1', 170, 1900, { power: 1.3 }),
  L(15, 'Титан', 'squat', '#facc15', 300, 1800, {
    power: 1.6,
    seconds: 120,
    boss: { enrageAt: 0.4, enrageSpeedup: 0.55, taunt: 'Титан включил форсаж!' },
  }),
];

/** Звёзды за победу: по доле оставшегося здоровья. */
export function starsFor(hpLeft: number, maxHp: number): number {
  const share = hpLeft / maxHp;
  return share >= 0.8 ? 3 : share >= 0.4 ? 2 : 1;
}

// Прогресс: id уровня → лучшее число звёзд. Хранится в браузере, сервер подключим позже.
export type Progress = Record<number, number>;
const KEY = 'fit-arena-progress';

export function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveStars(progress: Progress, levelId: number, stars: number): Progress {
  const next = { ...progress, [levelId]: Math.max(progress[levelId] ?? 0, stars) };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Без хранилища прогресс живёт до закрытия приложения.
  }
  return next;
}

/** Уровень открыт, если пройден предыдущий. */
export function isUnlocked(progress: Progress, levelId: number): boolean {
  return levelId === 1 || (progress[levelId - 1] ?? 0) > 0;
}
