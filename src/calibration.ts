// Калибровка камеры: игрок делает несколько медленных повторов, мы запоминаем,
// какую амплитуду угла он реально показывает, и подстраиваем пороги счёта под него.
import { useSyncExternalStore } from 'react';
import type { Exercise } from './repCounter';

export interface Thresholds {
  down: number;
  up: number;
}

interface Bounds {
  // В каких пределах может оказаться личный нижний и верхний порог.
  down: [number, number];
  up: [number, number];
  // Минимальный зазор между порогами: меньше — и подёргивание стало бы повтором.
  gap: number;
}

// Пределы подобраны так, чтобы мелкие движения не превращались в повторы,
// но человек с небольшой амплитудой (пресс не до колен, неглубокий присед) всё же считался.
export const BOUNDS: Record<Exercise, Bounds> = {
  pushup: { down: [70, 125], up: [130, 165], gap: 20 },
  squat: { down: [70, 125], up: [140, 170], gap: 25 },
  situp: { down: [50, 100], up: [95, 150], gap: 15 },
};

// Доли амплитуды: низ засчитываем чуть выше самой нижней точки, верх — чуть ниже самой верхней.
const DOWN_SHARE = 0.3;
const UP_SHARE = 0.25;

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

/** Личные пороги по достигнутому диапазону угла [min, max]. */
export function deriveThresholds(exercise: Exercise, min: number, max: number): Thresholds {
  const b = BOUNDS[exercise];
  const range = Math.max(0, max - min);
  let down = clamp(min + range * DOWN_SHARE, b.down);
  const up = clamp(max - range * UP_SHARE, b.up);
  if (up - down < b.gap) down = up - b.gap;
  return { down: Math.round(down), up: Math.round(up) };
}

// Распознавание повторов во время калибровки: «зигзаг» с гистерезисом, без заранее известных порогов.
const SWING = 12;
// Повтор калибровки — это хотя бы такой размах; меньше похоже на дрожание.
export const MIN_SWING: Record<Exercise, number> = { pushup: 25, squat: 30, situp: 20 };
// После последнего повтора ждём, пока игрок вернётся наверх, но не дольше этого.
const SETTLE_MS = 900;

export const CALIBRATION_REPS = 3;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface CalibrationView {
  reps: number;
  target: number;
  angle: number | null;
  // Весь виденный диапазон — для полоски на экране.
  min: number | null;
  max: number | null;
  result: Thresholds | null;
}

/** Копит углы по кадрам и находит медленные повторы; когда их хватает, выдаёт пороги. */
export class Calibrator {
  private seeking: 'low' | 'high' = 'high';
  private low = Infinity;
  private high = -Infinity;
  private lows: number[] = [];
  private highs: number[] = [];
  private repLow: number | null = null;
  private reps = 0;
  private lastRepAt = 0;
  private angle: number | null = null;
  private min: number | null = null;
  private max: number | null = null;
  private result: Thresholds | null = null;

  constructor(
    readonly exercise: Exercise,
    readonly target = CALIBRATION_REPS,
  ) {}

  /** ok — поза верная (нет подсказки): кадры с ошибкой позы в амплитуду не идут. */
  update(value: number | null, ok: boolean, t: number): CalibrationView {
    if (!this.result && value != null && ok) {
      this.angle = value;
      this.min = Math.min(this.min ?? value, value);
      this.max = Math.max(this.max ?? value, value);
      if (this.seeking === 'high') {
        this.high = Math.max(this.high, value);
        if (value < this.high - SWING) {
          this.highs.push(this.high);
          this.seeking = 'low';
          this.low = value;
        }
      } else {
        this.low = Math.min(this.low, value);
        if (value > this.low + SWING) {
          this.repLow = this.low;
          this.seeking = 'high';
          this.high = value;
        }
      }
      // Повтор засчитан, когда после нижней точки поднялись хотя бы на размах повтора.
      if (this.repLow != null && this.seeking === 'high' && value >= this.repLow + MIN_SWING[this.exercise]) {
        this.lows.push(this.repLow);
        this.repLow = null;
        this.reps += 1;
        this.lastRepAt = t;
      }
      if (this.reps >= this.target) {
        // Верх последнего повтора: ждём, пока игрок снова пойдёт вниз или замрёт наверху.
        const peaked = this.seeking === 'low' || t - this.lastRepAt >= SETTLE_MS;
        if (peaked) {
          const highs = this.seeking === 'high' ? [...this.highs, this.high] : this.highs;
          this.result = deriveThresholds(this.exercise, median(this.lows), median(highs));
        }
      }
    }
    return this.view;
  }

  get view(): CalibrationView {
    return { reps: Math.min(this.reps, this.target), target: this.target, angle: this.angle, min: this.min, max: this.max, result: this.result };
  }
}

// Хранилище: пороги по упражнениям в браузере. «skipped» — игрок отказался, больше не спрашиваем сами.
type Saved = Partial<Record<Exercise, Thresholds | { skipped: true }>>;

const KEY = 'fit-arena-calibration';
let saved: Saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
})();
const listeners = new Set<() => void>();

function write(next: Saved): void {
  saved = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Без хранилища калибровка живёт до закрытия.
  }
  listeners.forEach((l) => l());
}

/** Личные пороги упражнения, если калибровка пройдена. */
export function personalThresholds(exercise: Exercise): Thresholds | undefined {
  const s = saved[exercise];
  return s && 'down' in s ? s : undefined;
}

/** Нужно ли предложить калибровку перед первым подходом. */
export const needsCalibration = (exercise: Exercise): boolean => !saved[exercise];

export const saveCalibration = (exercise: Exercise, t: Thresholds): void => write({ ...saved, [exercise]: t });
export const skipCalibration = (exercise: Exercise): void => write({ ...saved, [exercise]: saved[exercise] ?? { skipped: true } });
/** «Перекалибровать камеру»: перед следующим подходом калибровка начнётся заново. */
export const resetCalibration = (): void => write({});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useCalibration = (): Saved => useSyncExternalStore(subscribe, () => saved);
