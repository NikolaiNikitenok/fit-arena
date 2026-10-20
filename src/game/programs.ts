// Программы тренировок Мастера Грома: многодневные планы с подходами, отдыхом между ними и днями отдыха.
// День 1 — входной тест «сколько сможешь за подход»: от него считаются все цели программы.
// Дальше нагрузка плавно растёт к финалу и подстраивается под игрока: недобрал — следующие дни легче,
// сделал всё — чуть тяжелее. Одна программа за раз, один день программы в календарный день.
// Логика чистая, без React и камеры, её проверяют тесты.
import { DEFAULT_PLANK_S, type Exercise, isTimed } from '../repCounter';
import { itemById } from './items';
import type { Baseline } from './levels';
import { dayKey, type Progress, saveProgress } from './progress';

export type ProgramId = 'newbie14' | 'pushup100' | 'abs21' | 'legs28' | 'plank5' | 'full4w';

/** Подход: упражнение, цель (повторы или секунды) и отдых после него. max — тест «сколько сможешь». */
export interface SetPlan {
  exercise: Exercise;
  target: number;
  rest: number;
  max?: boolean;
}

export type DayKind = 'test' | 'train' | 'rest' | 'final';

export interface DayPlan {
  day: number;
  kind: DayKind;
  title: string;
  sets: SetPlan[];
}

/** Сколько игрок делает за один подход: из входного теста, а до него — из базы испытаний силы. */
export type ProgramBase = Partial<Record<Exercise, number>>;

export interface ProgramDef {
  id: ProgramId;
  title: string;
  // Одной строкой на карточке.
  short: string;
  // Что говорит Гром, когда игрок открывает программу.
  about: string;
  days: number;
  // Каждый такой день — отдых (кроме первого и последнего).
  restEvery: number;
  focus: Exercise[];
  level: 'Новичок' | 'Средний' | 'Опытный';
  color: string;
  // Облик за прохождение (items.ts, только из программ) и монеты за финал.
  outfit?: string;
  coins: number;
  // Подходы тренировочного дня: t — доля пути от 0 до 1, base — подход игрока, k — поправка под форму.
  train: (t: number, base: Required<ProgramBase>, k: number) => SetPlan[];
  // Финал: чаще всего — та же тренировка на полную, у части программ — повтор теста.
  final: (base: Required<ProgramBase>) => SetPlan[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Цель подхода: повторы — от двух, секунды — от десяти, кратно пяти. */
export function amount(ex: Exercise, n: number): number {
  return isTimed(ex) ? Math.max(10, Math.round(n / 5) * 5) : Math.max(2, Math.round(n));
}
const set = (exercise: Exercise, n: number, rest: number): SetPlan => ({ exercise, target: amount(exercise, n), rest });
const test = (exercise: Exercise, base: number, rest = 90): SetPlan => ({ exercise, target: amount(exercise, base), rest, max: true });
// Круговая: все упражнения подряд, rounds кругов.
const circuit = (list: Exercise[], rounds: number, n: (ex: Exercise) => number, rest: number) =>
  Array.from({ length: rounds }, () => list.map((ex) => set(ex, n(ex), rest))).flat();
// Дневной объём делим на подходы лесенкой: первые — больше, последние — меньше.
const ladder = (exercise: Exercise, total: number, shares: number[], rest: number) => {
  const sum = shares.reduce((a, b) => a + b, 0);
  return shares.map((s) => set(exercise, (total * s) / sum, rest));
};

const ALL4: Exercise[] = ['squat', 'pushup', 'situp', 'plank'];

export const PROGRAMS: ProgramDef[] = [
  {
    id: 'newbie14',
    title: 'Новичок: 14 дней в форму',
    short: 'Все упражнения понемногу, без перегрузки',
    about: 'Две недели, и тело вспомнит, что такое сила. Каждый день — короткий круг: приседания, отжимания, пресс и планка. Не геройствуй, главное — не пропускать.',
    days: 14,
    restEvery: 4,
    focus: ALL4,
    level: 'Новичок',
    color: '#6ee7b7',
    coins: 300,
    train: (t, b, k) => circuit(ALL4, 2, (ex) => b[ex] * lerp(0.45, 0.85, t) * k, 60),
    final: (b) => ALL4.map((ex) => test(ex, b[ex])),
  },
  {
    id: 'pushup100',
    title: '100 отжиманий за 30 дней',
    short: 'Сотня за тренировку к последнему дню',
    about: 'Через месяц ты сделаешь сто отжиманий за одну тренировку. Пять подходов каждый день, отдых каждый третий. В первый день узнаем, с чего начинаешь.',
    days: 30,
    restEvery: 3,
    focus: ['pushup'],
    level: 'Средний',
    color: '#ff7a59',
    outfit: 'prog-fist',
    coins: 600,
    // Объём за день растёт от двух с половиной подходов игрока до сотни.
    train: (t, b, k) => ladder('pushup', lerp(Math.min(90, Math.max(15, b.pushup * 2.5)), pushupGoal(b), t ** 1.15) * k, [24, 22, 20, 18, 16], 75),
    final: (b) => ladder('pushup', pushupGoal(b), [24, 22, 20, 18, 16], 75),
  },
  {
    id: 'abs21',
    title: 'Стальной пресс 21 день',
    short: 'Пресс и планка: корпус как броня',
    about: 'Три недели работы над корпусом. Скручивания на пресс и планка каждый день, отдых каждый четвёртый. В финале сравним с первым днём.',
    days: 21,
    restEvery: 4,
    focus: ['situp', 'plank'],
    level: 'Новичок',
    color: '#7dd3fc',
    coins: 400,
    train: (t, b, k) => [
      ...Array.from({ length: 4 }, () => set('situp', b.situp * lerp(0.55, 1.05, t) * k, 45)),
      set('plank', b.plank * lerp(0.5, 1, t) * k, 60),
      set('plank', b.plank * lerp(0.4, 0.8, t) * k, 0),
    ],
    final: (b) => [test('situp', b.situp), test('plank', b.plank)],
  },
  {
    id: 'legs28',
    title: 'Ноги богатыря 28 дней',
    short: 'Приседания до дрожи в земле',
    about: 'Ноги держат бойца. Четыре недели приседаний: пять подходов, нагрузка растёт до полуторных твоих. Отдых каждый четвёртый день, без него мышцы не растут.',
    days: 28,
    restEvery: 4,
    focus: ['squat'],
    level: 'Средний',
    color: '#ffb46b',
    outfit: 'prog-bogatyr',
    coins: 600,
    train: (t, b, k) => [1, 0.9, 0.9, 0.8, 1].map((s, i, a) => set('squat', b.squat * s * lerp(0.6, 1.25, t) * k, i === a.length - 1 ? 0 : 60)),
    final: (b) => [1, 0.9, 0.9, 0.8, 1].map((s) => set('squat', b.squat * s * 1.3, 60)),
  },
  {
    id: 'plank5',
    title: 'Планка 5 минут за 30 дней',
    short: 'От первых секунд до пяти минут',
    about: 'Пять минут в планке — это характер. Каждый день держим чуть дольше, отдых каждый пятый день. Таз ровно, локти под плечами, я слежу за секундами.',
    days: 30,
    restEvery: 5,
    focus: ['plank'],
    level: 'Опытный',
    color: '#c4b5fd',
    outfit: 'prog-stone',
    coins: 700,
    train: (t, b, k) => {
      const main = lerp(Math.min(240, Math.max(15, b.plank * 0.8)), PLANK_GOAL_S, t ** 1.3) * k;
      const sets = [set('plank', main, 60), set('plank', main * 0.5, t < 0.5 ? 45 : 0)];
      return t < 0.5 ? [...sets, set('plank', main * 0.4, 0)] : sets;
    },
    final: () => [set('plank', PLANK_GOAL_S, 0)],
  },
  {
    id: 'full4w',
    title: 'Полное тело 4 недели',
    short: 'Три круга по всему телу',
    about: 'Четыре недели, как у настоящих бойцов: три круга по всему телу, нагрузка растёт каждую неделю. Пройдёшь — сделаю тебе доспех чемпиона.',
    days: 28,
    restEvery: 4,
    focus: ALL4,
    level: 'Опытный',
    color: '#ffd27a',
    outfit: 'prog-champion',
    coins: 1000,
    train: (t, b, k) => circuit(ALL4, 3, (ex) => b[ex] * lerp(0.5, 1, t) * k, 45),
    final: (b) => circuit(ALL4, 3, (ex) => b[ex], 45),
  },
];

export const PLANK_GOAL_S = 300;
// Сотня, а кто и так силён — почти три своих подхода.
const pushupGoal = (b: Required<ProgramBase>) => Math.max(100, Math.round((b.pushup * 2.8) / 5) * 5);

export const programById = (id: string): ProgramDef | undefined => PROGRAMS.find((p) => p.id === id);

export function dayKind(def: ProgramDef, day: number): DayKind {
  if (day === 1) return 'test';
  if (day === def.days) return 'final';
  return day % def.restEvery === 0 ? 'rest' : 'train';
}

/** Подход игрока: результат теста, а до него — оценка по базе испытаний (за минуту, значит за подход меньше). */
export function baseFor(base: ProgramBase | undefined, baseline: Baseline): Required<ProgramBase> {
  return {
    squat: base?.squat ?? Math.max(5, Math.round(baseline.squat * 0.7)),
    pushup: base?.pushup ?? Math.max(3, Math.round(baseline.pushup * 0.7)),
    situp: base?.situp ?? Math.max(5, Math.round(baseline.situp * 0.7)),
    plank: base?.plank ?? baseline.plank ?? DEFAULT_PLANK_S,
  };
}

const TITLES: Record<DayKind, string> = { test: 'Входной тест', train: 'Тренировка', rest: 'Отдых', final: 'Финал' };

/** План дня программы. */
export function planDay(def: ProgramDef, day: number, base: ProgramBase | undefined, baseline: Baseline, factor = 1): DayPlan {
  const kind = dayKind(def, day);
  const b = baseFor(base, baseline);
  // Номер тренировочного дня среди всех тренировочных: так рост ровный, без скачков после отдыха.
  const trainDays = Array.from({ length: def.days }, (_, i) => i + 1).filter((d) => dayKind(def, d) === 'train');
  const t = trainDays.length > 1 ? Math.max(0, trainDays.indexOf(day)) / (trainDays.length - 1) : 1;
  const sets = kind === 'test' ? def.focus.map((ex) => test(ex, b[ex])) : kind === 'final' ? def.final(b) : kind === 'rest' ? [] : def.train(t, b, factor);
  // После последнего подхода отдыхать не нужно.
  if (sets.length) sets[sets.length - 1] = { ...sets[sets.length - 1], rest: 0 };
  return { day, kind, title: TITLES[kind], sets };
}

// --- Состояние в прогрессе ---

export interface ProgramRun {
  id: ProgramId;
  // Какой день следующий (1..days).
  day: number;
  started: string;
  // Дата последнего пройденного дня: следующий открывается с новой даты.
  last?: string;
  base: ProgramBase;
  // Поправка нагрузки под игрока: 1 — по плану.
  factor: number;
  paused?: boolean;
  // Сделанная доля по дням: для календаря программы.
  log: Record<number, number>;
}

export interface ProgramsState {
  run?: ProgramRun;
  // Пройденные программы и опыт героя за дни программ.
  done: ProgramId[];
  xp: number;
}

export const programsOf = (p: Progress): ProgramsState => ({ done: [], xp: 0, ...p.programs });

const DAY_MS = 86_400_000;
const addDays = (date: string, n: number) => dayKey(Date.parse(`${date}T12:00:00`) + n * DAY_MS);

export type Availability = 'ready' | 'rest' | 'tomorrow' | 'paused';

/** Что с программой сегодня: можно тренироваться, день отдыха, уже занимался или пауза. */
export function availability(run: ProgramRun, now: number): Availability {
  if (run.paused) return 'paused';
  if (run.last === dayKey(now)) return 'tomorrow';
  return dayKind(programById(run.id)!, run.day) === 'rest' ? 'rest' : 'ready';
}

/** Начать программу; null — уже идёт другая (одна за раз). */
export function startProgram(p: Progress, id: ProgramId, now: number): Progress | null {
  const st = programsOf(p);
  if (st.run || !programById(id)) return null;
  return { ...p, programs: { ...st, run: { id, day: 1, started: dayKey(now), base: {}, factor: 1, log: {} } } };
}

export const pauseProgram = (p: Progress, paused: boolean): Progress => {
  const st = programsOf(p);
  return st.run ? { ...p, programs: { ...st, run: { ...st.run, paused: paused || undefined } } } : p;
};

/** Бросить программу: прогресс по ней пропадает, пройденные остаются. */
export const abandonProgram = (p: Progress): Progress => ({ ...p, programs: { ...programsOf(p), run: undefined } });

/** День отдыха отмечен. Если игрок пропустил день, отдых засчитывается задним числом и тренироваться можно уже сегодня. */
export function restDay(p: Progress, now: number): Progress | null {
  const st = programsOf(p);
  const run = st.run;
  if (!run || availability(run, now) !== 'rest') return null;
  const today = dayKey(now);
  const backdated = run.last && run.last < addDays(today, -1) ? addDays(run.last, 1) : today;
  return { ...p, programs: { ...st, run: { ...run, day: run.day + 1, last: backdated, log: { ...run.log, [run.day]: 1 } } } };
}

// Поправка нагрузки: недобрал больше пятой части — легче, сделал всё — чуть тяжелее. В разумных пределах.
export const EASIER = 0.92;
export const HARDER = 1.03;
const FACTOR_MIN = 0.6;
const FACTOR_MAX = 1.3;
// Финал засчитан, если сделано почти всё.
export const FINAL_PASS = 0.95;

export const dayCoins = (kind: DayKind, day: number) => (kind === 'test' ? 40 : 25 + 2 * day);
export const DAY_XP = 40;
export const FINAL_XP = 200;

export interface DayResult {
  progress: Progress;
  share: number;
  coins: number;
  xp: number;
  // Программа пройдена: облик (если есть) и монеты финала.
  completed?: boolean;
  outfit?: string;
  // Финал не взят: завтра можно ещё раз.
  retry?: boolean;
}

/** Доля сделанного: тестовый подход засчитан, если в нём есть хоть что-то. */
export function shareDone(sets: SetPlan[], done: number[]): number {
  const want = sets.reduce((s, x) => s + (x.max ? 1 : x.target), 0);
  const got = sets.reduce((s, x, i) => s + (x.max ? Math.min(1, done[i] ?? 0) : Math.min(x.target, done[i] ?? 0)), 0);
  return want ? got / want : 1;
}

/** Закончен день программы: сохранить тест, подстроить нагрузку, выдать награду (без сохранения). */
export function finishDay(p: Progress, done: number[], now: number): DayResult | null {
  const st = programsOf(p);
  const run = st.run;
  const def = run && programById(run.id);
  if (!run || !def || availability(run, now) !== 'ready') return null;
  const plan = planDay(def, run.day, run.base, p.baseline, run.factor);
  const share = shareDone(plan.sets, done);
  const today = dayKey(now);
  let base = run.base;
  let baseline = p.baseline;
  if (plan.kind === 'test') {
    base = { ...base };
    plan.sets.forEach((s, i) => {
      if (s.max && done[i] > 0) base[s.exercise] = Math.max(base[s.exercise] ?? 0, done[i]);
    });
    // Тест планки — и есть её база: по ней считаются задания дня.
    if (base.plank) baseline = { ...baseline, plank: Math.max(10, base.plank) };
  }
  if (plan.kind === 'final') {
    if (share < FINAL_PASS) return { progress: { ...p, programs: { ...st, run: { ...run, last: today, log: { ...run.log, [run.day]: share } } } }, share, coins: 0, xp: 0, retry: true };
    const outfit = def.outfit && !p.items.includes(def.outfit) ? def.outfit : undefined;
    const coins = def.coins;
    const programs: ProgramsState = { run: undefined, done: st.done.includes(def.id) ? st.done : [...st.done, def.id], xp: st.xp + FINAL_XP };
    return { progress: { ...p, baseline, coins: p.coins + coins, items: outfit ? [...p.items, outfit] : p.items, programs }, share, coins, xp: FINAL_XP, completed: true, outfit };
  }
  const factor = plan.kind !== 'train' ? run.factor : share < 0.8 ? Math.max(FACTOR_MIN, run.factor * EASIER) : share >= 1 ? Math.min(FACTOR_MAX, run.factor * HARDER) : run.factor;
  const coins = Math.round(dayCoins(plan.kind, run.day) * (0.5 + 0.5 * share));
  const next: ProgramRun = { ...run, day: run.day + 1, last: today, base, factor: Math.round(factor * 1000) / 1000, log: { ...run.log, [run.day]: share } };
  return { progress: { ...p, baseline, coins: p.coins + coins, programs: { ...st, run: next, xp: st.xp + DAY_XP } }, share, coins, xp: DAY_XP };
}

/** То же с сохранением. */
export function saveDay(p: Progress, done: number[], now: number): DayResult | null {
  const r = finishDay(p, done, now);
  return r && { ...r, progress: saveProgress(r.progress) };
}

/** Облик за программу: имя для карточки награды. */
export const programOutfit = (def: ProgramDef) => (def.outfit ? itemById(def.outfit) : undefined);
