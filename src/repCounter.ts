// Подсчёт повторов по ключевым точкам MediaPipe Pose (33 точки, координаты 0..1).

export type Exercise = 'pushup' | 'squat' | 'situp';

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

// Индексы точек MediaPipe Pose: [левая, правая].
const SHOULDER = [11, 12];
const ELBOW = [13, 14];
const WRIST = [15, 16];
const HIP = [23, 24];
const KNEE = [25, 26];
const ANKLE = [27, 28];

interface Rule {
  // Угол, по которому считаем амплитуду.
  joint: [number[], number[], number[]];
  // Нижняя точка достигнута, когда угол меньше down; верхняя — когда больше up.
  down: number;
  up: number;
  // Повтор засчитывается при возврате в верхнюю точку после нижней.
  // Для пресса «рабочая» фаза — сгибание, поэтому логика та же: лёжа (угол большой) → сел (малый) → лёг.
  formCheck?: (lm: Landmark[], side: number) => boolean;
  formHint?: string;
}

export const RULES: Record<Exercise, Rule> = {
  pushup: {
    joint: [SHOULDER, ELBOW, WRIST],
    down: 90,
    up: 155,
    // Корпус прямой: плечо-таз-лодыжка почти на одной линии.
    formCheck: (lm, s) => angle(lm[SHOULDER[s]], lm[HIP[s]], lm[ANKLE[s]]) > 150,
    formHint: 'Держи корпус прямым',
  },
  squat: {
    joint: [HIP, KNEE, ANKLE],
    down: 100,
    up: 160,
  },
  situp: {
    joint: [SHOULDER, HIP, KNEE],
    down: 70,
    up: 110,
  },
};

export const EXERCISE_LABELS: Record<Exercise, string> = {
  pushup: 'Отжимания',
  squat: 'Приседания',
  situp: 'Пресс',
};

/** Угол ABC в градусах (вершина в B). */
export function angle(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const len = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (len === 0) return 180;
  return (Math.acos(Math.min(1, Math.max(-1, dot / len))) * 180) / Math.PI;
}

/** Сторона тела, лучше видимая камере (0 — левая, 1 — правая). */
function bestSide(lm: Landmark[], ids: number[]): number {
  const vis = (s: number) => ids.reduce((sum, i) => sum + (lm[i]?.visibility ?? 1), 0);
  return vis(0) >= vis(1) ? 0 : 1;
}

export interface RepState {
  reps: number;
  phase: 'up' | 'down';
  angle: number | null;
  hint: string | null;
}

const MIN_VISIBILITY = 0.5;
// Быстрее этого человек повтор честно не сделает — защита от тряски камеры и читов.
const MIN_REP_MS = 400;
const SMOOTHING = 0.5;

export class RepCounter {
  private state: RepState = { reps: 0, phase: 'up', angle: null, hint: null };
  private smoothed: number | null = null;
  private lastRepAt = -Infinity;
  private formOk = true;

  constructor(readonly exercise: Exercise) {}

  get current(): RepState {
    return this.state;
  }

  reset(): void {
    this.state = { reps: 0, phase: 'up', angle: null, hint: null };
    this.smoothed = null;
    this.lastRepAt = -Infinity;
    this.formOk = true;
  }

  update(lm: Landmark[] | undefined, timestampMs: number): RepState {
    const rule = RULES[this.exercise];
    if (!lm || lm.length < 33) {
      return (this.state = { ...this.state, hint: 'Встань в кадр целиком' });
    }

    const ids = rule.joint.flat();
    const side = bestSide(lm, ids);
    const [a, b, c] = rule.joint.map((pair) => lm[pair[side]]);
    if ([a, b, c].some((p) => (p.visibility ?? 1) < MIN_VISIBILITY)) {
      return (this.state = { ...this.state, hint: 'Камера не видит суставы' });
    }

    const raw = angle(a, b, c);
    this.smoothed = this.smoothed === null ? raw : this.smoothed * SMOOTHING + raw * (1 - SMOOTHING);
    const value = this.smoothed;

    let { reps, phase } = this.state;
    let hint: string | null = null;

    if (phase === 'up' && value < rule.down) {
      phase = 'down';
      this.formOk = true;
    }
    if (phase === 'down' && rule.formCheck && !rule.formCheck(lm, side)) {
      this.formOk = false;
      hint = rule.formHint ?? null;
    }
    if (phase === 'down' && value > rule.up) {
      phase = 'up';
      if (this.formOk && timestampMs - this.lastRepAt >= MIN_REP_MS) {
        reps += 1;
        this.lastRepAt = timestampMs;
      } else if (!this.formOk) {
        hint = 'Повтор не засчитан: ' + (rule.formHint ?? 'неполная амплитуда').toLowerCase();
      }
    }

    return (this.state = { reps, phase, angle: Math.round(value), hint });
  }
}
