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

interface Check {
  ok: (lm: Landmark[], side: number) => boolean;
  hint: string;
}

interface Rule {
  // Угол, по которому считаем амплитуду.
  joint: [number[], number[], number[]];
  // Нижняя точка достигнута, когда угол меньше down; верхняя — когда больше up.
  // Для пресса «рабочая» фаза — сгибание, поэтому логика та же: лёжа (угол большой) → сел (малый) → лёг.
  down: number;
  up: number;
  // Положение тела для упражнения. Проверяется в каждом кадре повтора:
  // без него, например, сгибание рук стоя считалось бы отжиманием.
  posture: Check[];
}

const seen = (...points: Landmark[]) => points.every((p) => (p.visibility ?? 1) >= 0.5);

// Нижняя точка тела: стопа, а если её не видно (лёжа ноги часто уходят за край кадра) — колено.
const lowest = (lm: Landmark[], s: number) => (seen(lm[ANKLE[s]]) ? lm[ANKLE[s]] : lm[KNEE[s]]);

// Наклон отрезка ab к горизонтали, 0..90°.
function tilt(a: Landmark, b: Landmark): number {
  return (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
}

export const RULES: Record<Exercise, Rule> = {
  pushup: {
    joint: [SHOULDER, ELBOW, WRIST],
    down: 100,
    up: 150,
    posture: [
      { ok: (lm, s) => seen(lm[HIP[s]]) && seen(lowest(lm, s)), hint: 'Камера должна видеть тебя целиком, хотя бы до колен' },
      { ok: (lm, s) => tilt(lm[SHOULDER[s]], lowest(lm, s)) < 40, hint: 'Прими упор лёжа' },
      // Ладони на полу, то есть не выше плеч (ось y в кадре направлена вниз).
      { ok: (lm, s) => lm[WRIST[s]].y > lm[SHOULDER[s]].y - 0.03, hint: 'Упрись руками в пол' },
      { ok: (lm, s) => angle(lm[SHOULDER[s]], lm[HIP[s]], lowest(lm, s)) > 140, hint: 'Держи корпус прямым' },
    ],
  },
  squat: {
    joint: [HIP, KNEE, ANKLE],
    down: 100,
    up: 160,
    posture: [
      // Стоя плечи выше таза, корпус может наклоняться, но не ложиться.
      { ok: (lm, s) => seen(lm[SHOULDER[s]]), hint: 'Камера должна видеть тебя целиком' },
      { ok: (lm, s) => lm[SHOULDER[s]].y < lm[HIP[s]].y && tilt(lm[SHOULDER[s]], lm[HIP[s]]) > 30, hint: 'Встань прямо' },
    ],
  },
  situp: {
    joint: [SHOULDER, HIP, KNEE],
    down: 70,
    up: 110,
    posture: [
      // Таз и стопы на полу на одной высоте.
      { ok: (lm, s) => seen(lm[ANKLE[s]]), hint: 'Камера должна видеть тебя целиком, до стоп' },
      { ok: (lm, s) => tilt(lm[HIP[s]], lm[ANKLE[s]]) < 45, hint: 'Ляг на пол, стопы на полу' },
    ],
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
  private failHint: string | null = null;

  constructor(readonly exercise: Exercise) {}

  get current(): RepState {
    return this.state;
  }

  reset(): void {
    this.state = { reps: 0, phase: 'up', angle: null, hint: null };
    this.smoothed = null;
    this.lastRepAt = -Infinity;
    this.formOk = true;
    this.failHint = null;
  }

  /**
   * aspect — ширина кадра, делённая на высоту. Координаты MediaPipe нормированы отдельно по
   * ширине и высоте, поэтому без поправки углы в вертикальном кадре телефона искажаются.
   */
  update(raw: Landmark[] | undefined, timestampMs: number, aspect = 1): RepState {
    const rule = RULES[this.exercise];
    const lm = raw?.map((p) => ({ ...p, x: p.x * aspect }));
    if (!lm || lm.length < 33) {
      return (this.state = { ...this.state, hint: 'Встань в кадр целиком' });
    }

    const ids = rule.joint.flat();
    const side = bestSide(lm, ids);
    const [a, b, c] = rule.joint.map((pair) => lm[pair[side]]);
    if ([a, b, c].some((p) => (p.visibility ?? 1) < MIN_VISIBILITY)) {
      return (this.state = { ...this.state, hint: 'Камера не видит суставы' });
    }

    const measured = angle(a, b, c);
    this.smoothed = this.smoothed === null ? measured : this.smoothed * SMOOTHING + measured * (1 - SMOOTHING);
    const value = this.smoothed;

    let { reps, phase } = this.state;
    const failed = rule.posture.find((check) => !check.ok(lm, side));
    let hint: string | null = failed?.hint ?? null;

    if (phase === 'up' && value < rule.down && !failed) {
      phase = 'down';
      this.formOk = true;
    }
    if (phase === 'down' && failed) {
      this.formOk = false;
      this.failHint = failed.hint;
    }
    if (phase === 'down' && value > rule.up) {
      phase = 'up';
      if (this.formOk && !failed && timestampMs - this.lastRepAt >= MIN_REP_MS) {
        reps += 1;
        this.lastRepAt = timestampMs;
      } else if (!this.formOk) {
        hint = 'Повтор не засчитан: ' + (this.failHint ?? 'нарушена техника').toLowerCase();
      }
    }

    return (this.state = { reps, phase, angle: Math.round(value), hint });
  }
}
