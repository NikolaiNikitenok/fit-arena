// «Тренировка дня»: одна большая кнопка на главной сама выбирает лучшее дело на сегодня,
// чтобы игроку не приходилось разбираться в десятке разделов. Порядок:
//   1. первые испытания силы — всегда следующий уровень карты;
//   2. день программы Грома, если программа идёт и день сегодня тренировочный;
//   3. задание дня от жителя, пока оно не сделано;
//   4. босс события выходных, пока он жив и есть попытки;
//   5. следующий уровень карты, если есть жизни;
//   6. жизней нет: подземелье, если есть заряд, иначе программы (там жизни не нужны).
import type { Feature } from './unlocks';

export type TodayKind = 'level' | 'program' | 'daily' | 'event' | 'dungeon' | 'programs';

export interface TodayInput {
  cleared: number;
  lives: number;
  unlocked: (f: Feature) => boolean;
  // Программа идёт и сегодня по ней тренировка.
  programReady: boolean;
  // Задание дня: сколько сделано, сколько надо, забрана ли награда.
  dailyDone: number;
  dailyTarget: number;
  dailyClaimed: boolean;
  // Событие выходных: идёт, побеждён ли босс, сколько попыток осталось сегодня.
  eventLive: boolean;
  eventWon: boolean;
  eventTries: number;
  // Сколько этажей подземелья можно сыграть на заряд (или недоигранный этаж).
  dungeonFloors: number;
}

export function pickToday(x: TodayInput): TodayKind {
  if (x.cleared < 3) return 'level';
  if (x.programReady && x.unlocked('programs')) return 'program';
  if (x.unlocked('daily') && !x.dailyClaimed && x.dailyDone < x.dailyTarget) return 'daily';
  if (x.unlocked('events') && x.eventLive && !x.eventWon && x.eventTries > 0) return 'event';
  if (x.lives > 0) return 'level';
  if (x.unlocked('dungeon') && x.dungeonFloors > 0) return 'dungeon';
  if (x.unlocked('programs')) return 'programs';
  // Совсем новичок без жизней: задание дня жизни не тратит.
  return x.unlocked('daily') && !x.dailyClaimed ? 'daily' : 'level';
}
