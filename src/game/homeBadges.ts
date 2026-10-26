import type { DailyTask } from './daily';
import { achDone, ACHIEVEMENTS } from './achievements';
import { eventOf, eventWindow, triesLeft } from './event';
import { holidayReady } from './holidays';
import { dailyBonusReady, dungeonOf, FLOOR_COST } from './match3/dungeon';
import { passReady } from './pass';
import { canHatch, newPets } from './pets';
import { availability, programsOf } from './programs';
import { dailyProgress, heroLevel, heroXp, Progress } from './progress';
import { villageOf } from './resources';

// Метки «есть что забрать» на плитках главного экрана. Только чтение прогресса: ничего не меняет.

export interface HomeBadges {
  // Задание дня выполнено, а награда не забрана.
  daily: boolean;
  // В подземелье ждёт недоигранный этаж или бонус дня, на который хватает заряда.
  dungeon: boolean;
  // Идущая программа: сегодня день тренировки.
  programs: boolean;
  // Пропуск: готовые задания и ступени.
  pass: number;
  // Достижения выполнены, награда не забрана.
  achievements: number;
  // Новые питомцы или яйцо, которое пора открыть.
  pets: number;
  // Событие идёт, босс жив и попытки ещё есть.
  event: boolean;
  // Праздник: ступени дорожки, которые можно забрать.
  holiday: number;
}

export function homeBadges(p: Progress, daily: DailyTask, pro: boolean, now: number): HomeBadges {
  const d = dungeonOf(p);
  const charge = villageOf(p).charge;
  const run = programsOf(p).run;
  const ev = eventOf(p, now);
  const lvl = heroLevel(heroXp(p)).level;
  return {
    daily: p.dailyDone !== daily.date && dailyProgress(p, daily) >= daily.target,
    dungeon: !!d.run?.floor || (charge >= FLOOR_COST && dailyBonusReady(p, now)),
    programs: !!run && availability(run, now) === 'ready',
    pass: passReady(p, pro, now),
    achievements: ACHIEVEMENTS.filter((a) => achDone(a, p, now) && !p.achClaimed?.includes(a.id)).length,
    pets: newPets(p, lvl).filter((id) => id !== p.pets?.active).length + Number(canHatch(p)),
    event: eventWindow(now).live && !ev.won && triesLeft(p, now) > 0,
    holiday: holidayReady(p, now),
  };
}

