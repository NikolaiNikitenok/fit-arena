// Дневник зала: свои тренировки из каталога, план на неделю, подходы «вес × повторы» и итог с объёмом и рекордами.
// Это просто удобство: ни серия, ни задание дня, ни рейтинг, ни опыт героя от зала не меняются.
import { dayKey, type Progress } from '../game/progress';
import { type Equip, gymExercise, type GymKind } from './catalog';
import { locale, t } from '../i18n';

/** Подход: w — вес (кг), r — повторы, t — секунды (или минуты для кардио), d — км. */
export interface GymSet {
  w?: number;
  r?: number;
  t?: number;
  d?: number;
  done?: boolean;
}

export interface PlanItem {
  ex: string;
  sets: number;
  reps: number;
}

export interface GymTemplate {
  id: string;
  name: string;
  items: PlanItem[];
}

export interface RunExercise {
  ex: string;
  sets: GymSet[];
  // Цель по плану (повторы в подходе) и подсказка прогрессии на этот раз.
  target?: number;
  hint?: ProgHint;
}

/** Почему сегодня такой вес: up — прибавили, down — сбросили после застоя, same — повторяем, first — первый раз. */
export interface ProgHint {
  why: 'up' | 'down' | 'same' | 'first';
  // На сколько изменился вес (кг) или повторы (для своего веса).
  delta?: number;
  reps?: boolean;
}

/** Идущая тренировка: переживает перезапуск приложения. */
export interface GymRun {
  id: string;
  name: string;
  tpl?: string;
  start: number;
  items: RunExercise[];
}

/** Лучшее по упражнению: самый большой вес, расчётный максимум на раз, повторы, время. */
export interface GymBest {
  w?: number;
  e?: number;
  r?: number;
  t?: number;
}

export interface GymSession {
  id: string;
  name: string;
  start: number;
  end: number;
  vol: number;
  prs: string[];
  items: { ex: string; sets: [number, number][] }[];
}

export interface GymState {
  templates: GymTemplate[];
  // План недели: 0 — понедельник … 6 — воскресенье → id тренировки.
  week: (string | null)[];
  run?: GymRun;
  history: GymSession[];
  best: Record<string, GymBest>;
  // Подходы прошлого раза по упражнению: подставляем вес и повторы.
  last: Record<string, GymSet[]>;
  // Сколько тренировок подряд не дотянул до цели плана: после двух — сброс веса на 10%.
  miss?: Record<string, number>;
  // Автопрогрессия веса (по умолчанию включена).
  auto?: boolean;
}

export const HISTORY_MAX = 60;
const EMPTY: GymState = { templates: [], week: [null, null, null, null, null, null, null], history: [], best: {}, last: {} };

export const gymOf = (p: Progress): GymState => ({ ...EMPTY, ...p.gym });
const put = (p: Progress, g: GymState): Progress => ({ ...p, gym: g });
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 16);

/** День недели с понедельника. */
export const weekday = (tm: number) => (new Date(tm).getDay() + 6) % 7;
export const WEEKDAYS = [t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб'), t('Вс')];

export const todayTemplate = (g: GymState, now: number) => g.templates.find((tm) => tm.id === g.week[weekday(now)]);

// Готовые тренировки для начала: добавляются одной кнопкой и правятся как свои.
export const STARTERS: { name: string; items: PlanItem[] }[] = [
  {
    name: t('Всё тело A'),
    items: [
      { ex: 'squat.bb', sets: 3, reps: 8 },
      { ex: 'bench.bb', sets: 3, reps: 8 },
      { ex: 'pulldown.cable', sets: 3, reps: 10 },
      { ex: 'lateral.db', sets: 3, reps: 12 },
      { ex: 'plank.bw', sets: 3, reps: 45 },
    ],
  },
  {
    name: t('Всё тело B'),
    items: [
      { ex: 'deadlift.bb', sets: 3, reps: 5 },
      { ex: 'ohp.bb', sets: 3, reps: 8 },
      { ex: 'seatedrow.cable', sets: 3, reps: 10 },
      { ex: 'lunge.db', sets: 3, reps: 10 },
      { ex: 'curl.db', sets: 3, reps: 12 },
    ],
  },
  {
    name: t('Жим: грудь, плечи, трицепс'),
    items: [
      { ex: 'bench.bb', sets: 4, reps: 8 },
      { ex: 'incline.db', sets: 3, reps: 10 },
      { ex: 'seatedpress.db', sets: 3, reps: 10 },
      { ex: 'lateral.db', sets: 3, reps: 15 },
      { ex: 'ropepd.cable', sets: 3, reps: 12 },
    ],
  },
  {
    name: t('Тяга: спина, бицепс'),
    items: [
      { ex: 'pullup.bw', sets: 3, reps: 8 },
      { ex: 'row.bb', sets: 4, reps: 8 },
      { ex: 'seatedrow.cable', sets: 3, reps: 10 },
      { ex: 'facepull.cable', sets: 3, reps: 15 },
      { ex: 'hammer.db', sets: 3, reps: 12 },
    ],
  },
  {
    name: t('Ноги'),
    items: [
      { ex: 'squat.bb', sets: 4, reps: 6 },
      { ex: 'rdl.bb', sets: 3, reps: 8 },
      { ex: 'legpress.machine', sets: 3, reps: 12 },
      { ex: 'legcurl.machine', sets: 3, reps: 12 },
      { ex: 'calfstand.machine', sets: 4, reps: 15 },
    ],
  },
];

export function saveTemplate(p: Progress, tm: Omit<GymTemplate, 'id'> & { id?: string }): Progress {
  const g = gymOf(p);
  const tpl: GymTemplate = { id: tm.id ?? uid(), name: tm.name.trim().slice(0, 40) || t('Тренировка'), items: tm.items.slice(0, 30) };
  const templates = g.templates.some((x) => x.id === tpl.id) ? g.templates.map((x) => (x.id === tpl.id ? tpl : x)) : [...g.templates, tpl];
  return put(p, { ...g, templates });
}

export function deleteTemplate(p: Progress, id: string): Progress {
  const g = gymOf(p);
  return put(p, { ...g, templates: g.templates.filter((tm) => tm.id !== id), week: g.week.map((w) => (w === id ? null : w)) });
}

export function setWeekDay(p: Progress, day: number, id: string | null): Progress {
  const g = gymOf(p);
  const week = [...g.week];
  week[day] = id;
  return put(p, { ...g, week });
}

/** Пустые подходы под упражнение: вес и повторы прошлого раза или из плана. */
export function freshSets(g: GymState, ex: string, n = 3, reps?: number): GymSet[] {
  const kind = gymExercise(ex).kind;
  const last = g.last[ex] ?? [];
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const prev = last[i] ?? last[last.length - 1];
    if (kind === 't') return { t: prev?.t ?? reps ?? 30 };
    if (kind === 'c') return { t: prev?.t ?? 15, d: prev?.d };
    return { w: prev?.w, r: prev?.r ?? reps ?? 10 };
  });
}

// Шаг веса: штангу и тренажёры — по 2,5 кг, гантели и гири — по 2 кг (одна пара вверх).
const STEP: Partial<Record<Equip, number>> = { db: 2, kb: 2, band: 0 };
export const weightStep = (equip: Equip) => STEP[equip] ?? 2.5;
// Сброс — до ближайшего шага, но хотя бы на один шаг легче.
const roundTo = (w: number, step: number) => Math.max(step, Math.round(w / step) * step);
// Застой: столько тренировок подряд без цели — и вес сбрасывается.
export const STALL = 2;
export const DELOAD = 0.1;

/** Подход выполнен по плану: отмечен и повторов не меньше цели. */
const hitTarget = (sets: GymSet[], target: number) => sets.length > 0 && sets.every((s) => s.done && num(s.r) >= target);

/**
 * Прогрессия «по правилу»: все подходы прошлого раза сделаны на цель — прибавляем шаг веса
 * (для своего веса — повтор); два раза подряд не дотянул — минус 10%; иначе повторяем.
 */
export function suggest(g: GymState, ex: string, target: number): { sets?: (s: GymSet) => GymSet; hint: ProgHint } {
  const e = gymExercise(ex);
  const last = g.last[ex];
  if (!last?.length) return { hint: { why: 'first' } };
  if (e.kind === 't' || e.kind === 'c') return { hint: { why: 'same' } };
  const maxW = Math.max(0, ...last.map((s) => num(s.w)));
  const hit = last.every((s) => num(s.r) >= target);
  // Свой вес без отягощения: растут повторы, а не вес.
  if (!maxW) {
    if (!hit) return { hint: { why: 'same', reps: true } };
    const r = Math.max(...last.map((s) => num(s.r))) + 1;
    return { sets: (s) => ({ ...s, r }), hint: { why: 'up', delta: 1, reps: true } };
  }
  const step = weightStep(e.equip) || 1;
  if (hit) return { sets: (s) => ({ ...s, w: maxW + step, r: target }), hint: { why: 'up', delta: step } };
  if ((g.miss?.[ex] ?? 0) >= STALL) {
    const w = Math.min(maxW - step, roundTo(maxW * (1 - DELOAD), step));
    return { sets: (s) => ({ ...s, w, r: target }), hint: { why: 'down', delta: w - maxW } };
  }
  return { hint: { why: 'same' } };
}

/** Подходы на сегодня по плану: с прогрессией, если она включена. */
export function planSets(g: GymState, item: PlanItem): RunExercise {
  const sets = freshSets(g, item.ex, item.sets, item.reps);
  if (g.auto === false) return { ex: item.ex, sets, target: item.reps };
  const s = suggest(g, item.ex, item.reps);
  return { ex: item.ex, sets: s.sets ? sets.map(s.sets) : sets, target: item.reps, hint: s.hint };
}

export const setAuto = (p: Progress, on: boolean): Progress => put(p, { ...gymOf(p), auto: on });

export function startRun(p: Progress, now: number, tpl?: GymTemplate): Progress {
  const g = gymOf(p);
  const items = (tpl?.items ?? []).map((i) => planSets(g, i));
  return put(p, { ...g, run: { id: uid(), name: tpl?.name ?? t('Свободная тренировка'), tpl: tpl?.id, start: now, items } });
}

export function updateRun(p: Progress, fn: (r: GymRun) => GymRun): Progress {
  const g = gymOf(p);
  return g.run ? put(p, { ...g, run: fn(g.run) }) : p;
}

export const cancelRun = (p: Progress): Progress => put(p, { ...gymOf(p), run: undefined });

const num = (x: number | undefined) => (Number.isFinite(x) && (x as number) > 0 ? (x as number) : 0);

/** Расчётный максимум на один раз (формула Эпли). */
export const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

/** Объём подхода: поднятый вес × повторы (для своего веса — только доп. вес). */
export const setVolume = (kind: GymKind, s: GymSet) => (kind === 'w' || kind === 'bw' ? num(s.w) * num(s.r) : 0);

export const doneSets = (r: RunExercise) => r.sets.filter((s) => s.done);

export function runVolume(run: GymRun): number {
  let v = 0;
  for (const it of run.items) {
    const kind = gymExercise(it.ex).kind;
    for (const s of doneSets(it)) v += setVolume(kind, s);
  }
  return Math.round(v);
}

/** Лучшее в подходах одного упражнения. */
export function bestOf(kind: GymKind, sets: GymSet[]): GymBest {
  const b: GymBest = {};
  for (const s of sets) {
    const w = num(s.w);
    const r = num(s.r);
    const tm = num(s.t);
    if (kind === 'w' || kind === 'bw') {
      if (w > 0 && r > 0) {
        b.w = Math.max(b.w ?? 0, w);
        b.e = Math.max(b.e ?? 0, Math.round(e1rm(w, r) * 10) / 10);
      }
      if (kind === 'bw' && r > 0 && !w) b.r = Math.max(b.r ?? 0, r);
    }
    if ((kind === 't' || kind === 'c') && tm > 0) b.t = Math.max(b.t ?? 0, tm);
  }
  return b;
}

/** Побит ли рекорд: только если было с чем сравнивать — первый раз это ещё не рекорд, а точка отсчёта. */
export function isRecord(prev: GymBest | undefined, now: GymBest): boolean {
  if (!prev) return false;
  const beat = (a?: number, b?: number) => b !== undefined && a !== undefined && b > a;
  return beat(prev.w, now.w) || beat(prev.e, now.e) || beat(prev.r, now.r) || beat(prev.t, now.t);
}

const merge = (a: GymBest | undefined, b: GymBest): GymBest => {
  const m: GymBest = { ...a };
  for (const k of ['w', 'e', 'r', 't'] as const) if (b[k] !== undefined) m[k] = Math.max(m[k] ?? 0, b[k]!);
  return m;
};

export interface GymResult {
  progress: Progress;
  session: GymSession;
}

/** Завершить тренировку: в историю, рекорды, подходы на следующий раз. Пустая тренировка не сохраняется. */
export function finishRun(p: Progress, now: number): GymResult | null {
  const g = gymOf(p);
  const run = g.run;
  if (!run) return null;
  const items = run.items.filter((i) => doneSets(i).length);
  if (!items.length) return { progress: cancelRun(p), session: { id: run.id, name: run.name, start: run.start, end: now, vol: 0, prs: [], items: [] } };
  const best = { ...g.best };
  const last = { ...g.last };
  const miss = { ...g.miss };
  // Застой считаем только по упражнениям с целью плана: выполнил всё — счётчик с нуля, нет — плюс один.
  for (const it of run.items) if (it.target && doneSets(it).length && gymExercise(it.ex).kind !== 't' && gymExercise(it.ex).kind !== 'c') miss[it.ex] = hitTarget(it.sets, it.target) ? 0 : (miss[it.ex] ?? 0) + 1;
  const prs: string[] = [];
  for (const it of items) {
    const kind = gymExercise(it.ex).kind;
    const sets = doneSets(it);
    const b = bestOf(kind, sets);
    if (isRecord(best[it.ex], b)) prs.push(it.ex);
    best[it.ex] = merge(best[it.ex], b);
    last[it.ex] = sets.map(({ w, r, t: tm, d }) => ({ w, r, t: tm, d }));
  }
  const session: GymSession = {
    id: run.id,
    name: run.name,
    start: run.start,
    // Забытую на ночь тренировку обрезаем до 4 часов.
    end: Math.min(now, run.start + 4 * 3600_000),
    vol: runVolume(run),
    prs,
    items: items.map((it) => ({ ex: it.ex, sets: doneSets(it).map((s) => [num(s.w) || num(s.d), num(s.r) || num(s.t)] as [number, number]) })),
  };
  const history = [session, ...g.history].slice(0, HISTORY_MAX);
  return { progress: put(p, { ...g, run: undefined, history, best, last, miss }), session };
}

export const minutesOf = (s: Pick<GymSession, 'start' | 'end'>) => Math.max(1, Math.round((s.end - s.start) / 60000));

export function durationText(min: number): string {
  const h = Math.floor(min / 60);
  return h ? t('{0} ч {1} мин', { 0: h, 1: min % 60 }) : t('{0} мин', { 0: min });
}

/** 5455 → «5 455». */
export const kgText = (v: number) => t('{0} кг', { 0: Math.round(v).toLocaleString(locale()).replace(/ /g, ' ') });

export const setsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? t('подход') : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? t('подхода') : t('подходов'));

/** Тренировки по дням: для отметок на неделе. */
export function gymDays(g: GymState): Set<string> {
  return new Set(g.history.map((s) => dayKey(s.start)));
}
