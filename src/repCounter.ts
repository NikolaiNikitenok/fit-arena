// Подсчёт повторов по ключевым точкам MediaPipe Pose (33 точки, координаты 0..1).
// Планка — не повторы, а секунды в правильной позе: её считает PlankTimer.

// Упражнения на повторы: только они годятся для дуэлей, рейда и боя с тренером.
export type RepExercise = 'pushup' | 'squat' | 'situp';
export type Exercise = RepExercise | 'plank';

export const REP_EXERCISES: RepExercise[] = ['squat', 'pushup', 'situp'];
export const isRepExercise = (e: unknown): e is RepExercise => REP_EXERCISES.includes(e as RepExercise);
/** Упражнение на время: цель и результат в секундах. */
export const isTimed = (e: Exercise): e is 'plank' => e === 'plank';

// Планка идёт в опыт, серию и клан как повторы: две секунды — один повтор.
export const PLANK_S_PER_REP = 2;
// Сколько секунд держит планку игрок, о котором ещё ничего не известно.
export const DEFAULT_PLANK_S = 30;
export const repsEquivalent = (e: Exercise | null, n: number): number => (e === 'plank' ? Math.round(n / PLANK_S_PER_REP) : n);

/** Сколько сделано или задано: «45 с», «2:30» или «12». */
export function amountText(e: Exercise, n: number): string {
  if (!isTimed(e)) return String(n);
  return n >= 60 ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : `${n} с`;
}

/** Цель словами: «отжимания × 20», «планка 45 с». */
export const goalText = (e: Exercise, n: number): string => `${EXERCISE_LABELS[e].toLowerCase()}${isTimed(e) ? ' ' : ' × '}${amountText(e, n)}`;

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
  // Насколько уверенно модель должна видеть суставы угла.
  minVisibility?: number;
}

const seen = (...points: Landmark[]) => points.every((p) => (p.visibility ?? 1) >= 0.5);

// Нижняя точка тела: стопа, а если её не видно (лёжа ноги часто уходят за край кадра) — колено.
const lowest = (lm: Landmark[], s: number) => (seen(lm[ANKLE[s]]) ? lm[ANKLE[s]] : lm[KNEE[s]]);
// Ноги совсем не видно — линию тела берём по плечу и тазу.
const legsSeen = (lm: Landmark[], s: number) => seen(lm[ANKLE[s]]) || seen(lm[KNEE[s]]);
const bodyEnd = (lm: Landmark[], s: number) => (legsSeen(lm, s) ? lowest(lm, s) : lm[HIP[s]]);

// Наклон отрезка ab к горизонтали, 0..90°.
function tilt(a: Landmark, b: Landmark): number {
  return (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
}

export const RULES: Record<RepExercise, Rule> = {
  pushup: {
    joint: [SHOULDER, ELBOW, WRIST],
    // Модель сбоку занижает сгиб локтя, поэтому пороги с запасом: внизу меньше 110°, вверху больше 145°.
    down: 110,
    up: 145,
    // Лёжа кисти часто у края кадра и видны хуже.
    minVisibility: 0.35,
    posture: [
      { ok: (lm, s) => seen(lm[HIP[s]]), hint: 'Камера должна видеть тебя целиком, хотя бы до пояса' },
      { ok: (lm, s) => tilt(lm[SHOULDER[s]], bodyEnd(lm, s)) < 45, hint: 'Прими упор лёжа' },
      // Ладони на полу, то есть не выше плеч (ось y в кадре направлена вниз).
      { ok: (lm, s) => lm[WRIST[s]].y > lm[SHOULDER[s]].y - 0.06, hint: 'Упрись руками в пол' },
      { ok: (lm, s) => !legsSeen(lm, s) || angle(lm[SHOULDER[s]], lm[HIP[s]], lowest(lm, s)) > 130, hint: 'Держи корпус прямым' },
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
    // Сидя угол в тазу заметно меньше прямого; 70° засчитывал только почти полное касание коленей.
    down: 85,
    up: 110,
    // Лёжа сбоку плечо и колено модель видит хуже, чем стоя.
    minVisibility: 0.35,
    posture: [
      { ok: (lm, s) => legsSeen(lm, s), hint: 'Камера должна видеть тебя целиком, до колен' },
      // Таз и стопы на полу на одной высоте; если стопы не видно, бедро не стоит вертикально, как стоя.
      { ok: (lm, s) => (seen(lm[ANKLE[s]]) ? tilt(lm[HIP[s]], lm[ANKLE[s]]) < 45 : tilt(lm[HIP[s]], lm[KNEE[s]]) < 70), hint: 'Ляг на пол, стопы на полу' },
    ],
  },
};

export const EXERCISE_LABELS: Record<Exercise, string> = {
  pushup: 'Отжимания',
  squat: 'Приседания',
  situp: 'Пресс',
  plank: 'Планка',
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

/** Поворот точек вокруг центра кадра на 0, 90, 180 или 270°. Углы между суставами при этом не меняются. */
function rotate(lm: Landmark[], deg: number, aspect: number): Landmark[] {
  if (!deg) return lm;
  const cx = aspect / 2;
  const cy = 0.5;
  return lm.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (deg === 90) return { ...p, x: cx - dy, y: cy + dx };
    if (deg === 180) return { ...p, x: cx - dx, y: cy - dy };
    return { ...p, x: cx + dy, y: cy - dx };
  });
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
// Сколько кадров подряд поза может «мигать»: модель иногда на кадр теряет стопу или таз.
const POSTURE_GRACE = 3;

export class RepCounter {
  private state: RepState = { reps: 0, phase: 'up', angle: null, hint: null };
  private smoothed: number | null = null;
  private lastRepAt = -Infinity;
  private formOk = true;
  private failHint: string | null = null;
  private failStreak = 0;
  // Поворот кадра, при котором поза в прошлый раз совпала.
  private rotation = 0;

  // Пороги угла: личные после калибровки или общие из RULES.
  readonly down: number;
  readonly up: number;

  constructor(
    readonly exercise: RepExercise,
    personal?: { down: number; up: number },
  ) {
    this.down = personal?.down ?? RULES[exercise].down;
    this.up = personal?.up ?? RULES[exercise].up;
  }

  get current(): RepState {
    return this.state;
  }

  reset(): void {
    this.state = { reps: 0, phase: 'up', angle: null, hint: null };
    this.smoothed = null;
    this.lastRepAt = -Infinity;
    this.formOk = true;
    this.failHint = null;
    this.failStreak = 0;
  }

  /**
   * aspect — ширина кадра, делённая на высоту. Координаты MediaPipe нормированы отдельно по
   * ширине и высоте, поэтому без поправки углы в вертикальном кадре телефона искажаются.
   */
  update(raw: Landmark[] | undefined, timestampMs: number, aspect = 1, rotations: number[] = [0]): RepState {
    const rule = RULES[this.exercise];
    if (!raw || raw.length < 33) {
      return (this.state = { ...this.state, hint: 'Встань в кадр целиком' });
    }
    const scaled = raw.map((p) => ({ ...p, x: p.x * aspect }));

    const ids = rule.joint.flat();
    const side = bestSide(scaled, ids);
    const [a, b, c] = rule.joint.map((pair) => scaled[pair[side]]);
    if ([a, b, c].some((p) => (p.visibility ?? 1) < (rule.minVisibility ?? MIN_VISIBILITY))) {
      return (this.state = { ...this.state, hint: 'Камера не видит суставы' });
    }
    // Телефон положен боком: ищем поворот кадра, при котором «низ» совпадает с полом. Прошлый удачный — первым.
    const order = [this.rotation, ...rotations.filter((r) => r !== this.rotation)].filter((r) => rotations.includes(r));
    let lm = rotate(scaled, order[0], aspect);
    for (const r of order) {
      const candidate = rotate(scaled, r, aspect);
      if (rule.posture.every((check) => check.ok(candidate, side))) {
        lm = candidate;
        this.rotation = r;
        break;
      }
    }

    const measured = angle(a, b, c);
    this.smoothed = this.smoothed === null ? measured : this.smoothed * SMOOTHING + measured * (1 - SMOOTHING);
    const value = this.smoothed;

    let { reps, phase } = this.state;
    const failed = rule.posture.find((check) => !check.ok(lm, side));
    let hint: string | null = failed?.hint ?? null;
    this.failStreak = failed ? this.failStreak + 1 : 0;
    const postureBad = this.failStreak >= POSTURE_GRACE;

    if (phase === 'up' && value < this.down && !postureBad) {
      phase = 'down';
      this.formOk = true;
    }
    if (phase === 'down' && postureBad && failed) {
      this.formOk = false;
      this.failHint = failed.hint;
    }
    if (phase === 'down' && value > this.up) {
      phase = 'up';
      if (this.formOk && !postureBad && timestampMs - this.lastRepAt >= MIN_REP_MS) {
        reps += 1;
        this.lastRepAt = timestampMs;
      } else if (!this.formOk) {
        hint = 'Повтор не засчитан: ' + (this.failHint ?? 'нарушена техника').toLowerCase();
      }
    }

    return (this.state = { reps, phase, angle: Math.round(value), hint });
  }
}

// Планка: плечо, таз и стопа на одной прямой (угол в тазу почти развёрнутый), тело почти горизонтально,
// локти или ладони под плечами. Модель сбоку шумит на пару градусов, поэтому прямота с запасом.
export const PLANK_STRAIGHT = 158;
const PLANK_TILT = 35;
// Плечо над опорой: отрезок плечо — локоть ближе к вертикали, чем к полу.
const PLANK_ARM_TILT = 50;
// Подвисший кадр не превращается в лишние секунды.
const MAX_FRAME_MS = 250;

export const PLANK_HINTS = {
  frame: 'Камера должна видеть тебя целиком, хотя бы до колен',
  pose: 'Встань в планку',
  arms: 'Поставь локти под плечи',
  sag: 'Подними таз',
  pike: 'Опусти таз',
};
// Чем дальше от планки, тем раньше в списке: при выборе поворота кадра берём самую «близкую» ошибку.
const FAULT_RANK = [PLANK_HINTS.frame, PLANK_HINTS.pose, PLANK_HINTS.arms, PLANK_HINTS.sag, PLANK_HINTS.pike];

/** Что не так с планкой в этом кадре; null — поза верная. */
export function plankFault(lm: Landmark[], s: number): string | null {
  const sh = lm[SHOULDER[s]];
  const hip = lm[HIP[s]];
  if (!seen(sh, hip) || !legsSeen(lm, s)) return PLANK_HINTS.frame;
  const end = lowest(lm, s);
  if (tilt(sh, end) > PLANK_TILT) return PLANK_HINTS.pose;
  // Опора: локоть, а если его не видно — кисть. Ниже плеча и под ним, а не вытянута вперёд или вдоль тела.
  const support = seen(lm[ELBOW[s]]) ? lm[ELBOW[s]] : seen(lm[WRIST[s]]) ? lm[WRIST[s]] : null;
  if (support && (support.y <= sh.y || tilt(sh, support) < PLANK_ARM_TILT)) return PLANK_HINTS.arms;
  if (angle(sh, hip, end) < PLANK_STRAIGHT) {
    // Где таз относительно линии плечо — стопа: ниже (y больше) — провис, выше — «домик».
    const t = (hip.x - sh.x) / (end.x - sh.x || 1e-6);
    const lineY = sh.y + (end.y - sh.y) * t;
    return hip.y > lineY ? PLANK_HINTS.sag : PLANK_HINTS.pike;
  }
  return null;
}

export interface PlankState extends RepState {
  // Сколько удержано в верной позе, мс; reps — то же в целых секундах.
  heldMs: number;
  holding: boolean;
}

/**
 * Таймер планки: копит время, пока поза верная, и ставит отсчёт на паузу, когда поза сломалась.
 * Короткие сбои модели (до POSTURE_GRACE кадров подряд) паузу не вызывают.
 * Интерфейс тот же, что у RepCounter: reps — удержанные секунды.
 */
export class PlankTimer {
  readonly exercise = 'plank' as const;
  // Для отладочной подписи угла: прямота корпуса.
  readonly down = PLANK_STRAIGHT;
  readonly up = 180;
  private state: PlankState = { reps: 0, phase: 'up', angle: null, hint: null, heldMs: 0, holding: false };
  private lastT: number | null = null;
  private failStreak = 0;
  private rotation = 0;

  get current(): PlankState {
    return this.state;
  }

  reset(): void {
    this.state = { reps: 0, phase: 'up', angle: null, hint: null, heldMs: 0, holding: false };
    this.lastT = null;
    this.failStreak = 0;
  }

  update(raw: Landmark[] | undefined, timestampMs: number, aspect = 1, rotations: number[] = [0]): PlankState {
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(MAX_FRAME_MS, timestampMs - this.lastT));
    this.lastT = timestampMs;
    let fault: string | null;
    let body: number | null = null;
    if (!raw || raw.length < 33) fault = 'Встань в кадр целиком';
    else {
      const scaled = raw.map((p) => ({ ...p, x: p.x * aspect }));
      // Сторона, которую камера видит лучше: по плечу, локтю, тазу, колену и стопе.
      const vis = (s: number) => [SHOULDER, ELBOW, HIP, KNEE, ANKLE].reduce((sum, pair) => sum + (scaled[pair[s]].visibility ?? 1), 0);
      const side = vis(0) >= vis(1) ? 0 : 1;
      // Как у повторов: телефон может лежать боком, ищем поворот, где тело на полу. Прошлый удачный — первым.
      const order = [this.rotation, ...rotations.filter((r) => r !== this.rotation)].filter((r) => rotations.includes(r));
      let best: { lm: Landmark[]; fault: string | null } | null = null;
      for (const r of order.length ? order : [0]) {
        const lm = rotate(scaled, r, aspect);
        const f = plankFault(lm, side);
        if (!f) {
          best = { lm, fault: null };
          this.rotation = r;
          break;
        }
        if (!best || FAULT_RANK.indexOf(f) > FAULT_RANK.indexOf(best.fault!)) best = { lm, fault: f };
      }
      fault = best!.fault;
      const lm = best!.lm;
      if (seen(lm[SHOULDER[side]], lm[HIP[side]]) && legsSeen(lm, side)) body = Math.round(angle(lm[SHOULDER[side]], lm[HIP[side]], lowest(lm, side)));
    }

    this.failStreak = fault ? this.failStreak + 1 : 0;
    // Начать отсчёт можно только из верной позы; уже идущий не прерывается мгновенными сбоями.
    let holding = this.state.holding;
    if (!fault) holding = true;
    else if (this.failStreak >= POSTURE_GRACE) holding = false;
    const heldMs = this.state.heldMs + (holding ? dt : 0);
    return (this.state = { reps: Math.floor(heldMs / 1000), phase: holding ? 'down' : 'up', angle: body, hint: holding ? null : fault, heldMs, holding });
  }
}

/** Счётчик под упражнение: повторы или таймер планки. */
export type Counter = RepCounter | PlankTimer;
