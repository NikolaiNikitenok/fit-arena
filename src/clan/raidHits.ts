// Сколько атак рейда игрок начал сегодня на этом телефоне: «Тренировка дня» зовёт в рейд, пока атаки есть.
import { dayOf, RAID_ATTACKS_PER_DAY } from '../../shared/raid';

const KEY = 'fit-arena-raid-hits';

export function raidHitsToday(now = Date.now()): number {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { day: string; n: number } | null;
    return r?.day === dayOf(now) ? r.n : 0;
  } catch {
    return 0;
  }
}

export function countRaidHit(now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: dayOf(now), n: raidHitsToday(now) + 1 }));
  } catch {
    // Без хранилища — без подсказки.
  }
}

export const raidAttacksLeft = (now = Date.now()) => Math.max(0, RAID_ATTACKS_PER_DAY - raidHitsToday(now));
