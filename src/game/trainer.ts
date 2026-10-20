// Бой с тренером: дуэль с ботом без сервера. Темп тренера подстраивается под базу игрока,
// чтобы бой был по силам, но не даром: Лиса медленнее, Гром почти вровень, Князь Диван быстрее.
import type { CharName } from '../three/kit';
import type { Exercise } from '../repCounter';
import type { Baseline, Line } from './levels';
import { NPCS, type NpcId } from './npcs';

export type TrainerId = 'lisa' | 'grom' | 'knyaz';

export interface Trainer {
  id: TrainerId;
  npc: NpcId;
  // Сложность для карточки выбора.
  level: string;
  // Доля от ожидаемого темпа игрока (повторов в минуту по его базе).
  pace: number;
  // Длина серий: сильный тренер дольше держит темп без пауз.
  burst: [number, number];
  look: { model: CharName; tint?: string; glow?: string };
  scale?: number;
  about: string;
  intro: string[];
  // Реплика, когда игрок победил, и когда проиграл.
  beaten: string[];
  won: string[];
}

export const TRAINERS: Trainer[] = [
  {
    id: 'lisa',
    npc: 'lisa',
    level: 'Лёгкий',
    pace: 0.7,
    burst: [2, 4],
    look: { model: 'Rogue', tint: 'mul:1.25,0.95,0.7' },
    about: 'Быстрая, но часто отвлекается',
    intro: ['Дуэль со мной? Ладно, только не плачь потом. Я разомнусь вполсилы… наверное.', 'Спорим, я сделаю больше? Шучу. Хотя нет, не шучу.'],
    beaten: ['Ладно, ладно, ты победил. Я просто не выспалась.', 'Ого. Я даже не успела заскучать. Ещё раз?'],
    won: ['Ха! Не расстраивайся, я просто очень ловкая.', 'Почти догнал! Почти — не считается.'],
  },
  {
    id: 'grom',
    npc: 'grom',
    level: 'Средний',
    pace: 0.95,
    burst: [3, 5],
    look: { model: 'Barbarian', tint: 'mul:1.15,0.85,0.7', glow: '#ff7043' },
    about: 'Держит твой темп и не сбивается',
    intro: ['Я тренировал чемпионов, ученик. Покажи, на что ты способен сегодня.', 'Ровный темп важнее рывка. Посмотрим, кто первый выдохнется.'],
    beaten: ['Вот это я понимаю! Ты растёшь быстрее, чем я думал.', 'Хорошо. Очень хорошо. Теперь отдохни, мышцы растут в покое.'],
    won: ['Неплохо, но я ещё держусь. Отдохни и попробуй снова.', 'Темп сбился в середине. Дыши ровнее, и я твой.'],
  },
  {
    id: 'knyaz',
    npc: 'knyaz',
    level: 'Сложный',
    pace: 1.2,
    burst: [4, 7],
    look: { model: 'Skeleton_Mage', tint: 'mul:1.2,0.6,1.4', glow: '#b388ff' },
    scale: 1.2,
    about: 'Бывший чемпион. Быстрее тебя',
    intro: ['Когда-то у меня была тысяча побед. Думаешь, стать тысяча первым будет легко?', 'Встань с дивана… то есть, встань в кадр. Посмотрим, чего ты стоишь.'],
    beaten: ['Невероятно… Так быстро меня не били даже в лучшие годы.', 'Ты сильнее чемпиона. Я встаю и аплодирую. Стоя!'],
    won: ['Не грусти. Я тоже не сразу стал чемпионом.', 'Быстро, но не быстрее меня. Пока.'],
  },
];

export const trainerById = (id: TrainerId): Trainer => TRAINERS.find((t) => t.id === id)!;

export const nextTrainer = (id: TrainerId): Trainer | null => TRAINERS[TRAINERS.findIndex((t) => t.id === id) + 1] ?? null;

/** Реплика тренера для диалога: портрет и цвет из списка жителей. */
export function trainerLine(t: Trainer, text: string): Line {
  const npc = NPCS[t.npc];
  return { who: npc.name, text, face: t.npc, color: npc.color };
}

/** Сколько повторов в минуту тренер в среднем делает против этого игрока. */
export const trainerRate = (t: Trainer, baseline: Baseline, exercise: Exercise): number => baseline[exercise] * t.pace;

/** Предсказуемый генератор случайных чисел (mulberry32): один и тот же seed — один и тот же бой. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Человек не делает повторы чаще, чем раз в 0,45 с; сервер для живых дуэлей отсекает чаще 0,4 с.
export const BOT_MIN_GAP_MS = 450;
// Разброс итогового темпа от боя к бою.
export const PACE_JITTER = 0.06;

/**
 * Моменты повторов тренера (мс от начала боя). Ритм как у человека: серии из нескольких быстрых повторов,
 * передышки между ними, к концу чуть медленнее. Всего повторов — по темпу тренера с небольшим разбросом,
 * последний приходится на конец боя, так что средний темп честный.
 */
export function botSchedule(perMinute: number, durationMs: number, burst: [number, number], random: () => number): number[] {
  const rate = Math.max(1, perMinute * (1 + (random() * 2 - 1) * PACE_JITTER));
  const total = Math.max(1, Math.round((rate * durationMs) / 60_000));
  // Реакция на «Бой!»: тренер начинает не мгновенно.
  const start = 700 + random() * 900;
  const gaps: number[] = [];
  let left = 0;
  for (let i = 1; i < total; i++) {
    const tired = 1 + 0.2 * (i / total);
    if (left <= 0) {
      left = burst[0] + Math.floor(random() * (burst[1] - burst[0] + 1));
      if (i > 1) {
        gaps.push((1.7 + random() * 1.1) * tired);
        left--;
        continue;
      }
    }
    gaps.push((0.7 + random() * 0.2) * tired);
    left--;
  }
  // Растягиваем ритм на весь бой: последний повтор чуть раньше гонга.
  const end = durationMs * (0.95 + random() * 0.03);
  const sum = gaps.reduce((a, b) => a + b, 0);
  const k = sum > 0 ? (end - start) / sum : 0;
  const times = [start];
  for (const g of gaps) times.push(times[times.length - 1] + Math.max(BOT_MIN_GAP_MS, g * k));
  return times.filter((t) => t < durationMs).map(Math.round);
}

/** Расписание тренера на бой. */
export const trainerSchedule = (t: Trainer, baseline: Baseline, exercise: Exercise, durationMs: number, seed: number): number[] =>
  botSchedule(trainerRate(t, baseline, exercise), durationMs, t.burst, seededRandom(seed));

/** Случайная реплика из списка, но предсказуемо для одного seed. */
export const pickLine = (lines: string[], seed: number): string => lines[Math.abs(Math.floor(seed)) % lines.length];
