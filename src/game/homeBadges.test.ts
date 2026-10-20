import { describe, expect, it } from 'vitest';
import { dailyTask } from './daily';
import { homeBadges } from './homeBadges';
import { dayKey, loadProgress, type Progress } from './progress';

// Вторник: событие ещё не идёт. Суббота 24.10 — событие выходных.
const TUE = new Date(2026, 9, 20, 12).getTime();
const SAT = new Date(2026, 9, 24, 12).getTime();

const base = (): Progress => ({ ...loadProgress(), onboarded: true, pets: { hatched: true, active: 'dragon', seen: ['dragon'] } });

describe('метки главного экрана', () => {
  it('новичку без прогресса нечего забирать', () => {
    const p = base();
    const b = homeBadges(p, dailyTask(dayKey(TUE), p.baseline), false, TUE);
    expect(b).toEqual({ daily: false, dungeon: false, programs: false, pass: 0, achievements: 0, pets: 0, event: false });
  });

  it('задание дня: метка, пока награда не забрана', () => {
    const p0 = base();
    const task = dailyTask(dayKey(TUE), p0.baseline);
    const p: Progress = { ...p0, dayEx: { date: dayKey(TUE), reps: { [task.exercise]: task.target } } };
    expect(homeBadges(p, task, false, TUE).daily).toBe(true);
    expect(homeBadges({ ...p, dailyDone: task.date }, task, false, TUE).daily).toBe(false);
    const half: Progress = { ...p0, dayEx: { date: dayKey(TUE), reps: { [task.exercise]: task.target - 1 } } };
    expect(homeBadges(half, task, false, TUE).daily).toBe(false);
  });

  it('подземелье: бонус дня при полном заряде или недоигранный этаж', () => {
    const p = base();
    const task = dailyTask(dayKey(TUE), p.baseline);
    const charged: Progress = { ...p, village: { charge: 40, res: {} as never } };
    expect(homeBadges(charged, task, false, TUE).dungeon).toBe(true);
    const bonusTaken: Progress = { ...charged, dungeon: { reached: 2, stars: {}, bestCombo: 0, wins: 1, plays: 1, bosses: [], bonusDate: dayKey(TUE) } };
    expect(homeBadges(bonusTaken, task, false, TUE).dungeon).toBe(false);
    const low: Progress = { ...p, village: { charge: 5, res: {} as never } };
    expect(homeBadges(low, task, false, TUE).dungeon).toBe(false);
    const unfinished: Progress = { ...low, dungeon: { reached: 2, stars: {}, bestCombo: 0, wins: 1, plays: 1, bosses: [], run: { floor: 2 } as never } };
    expect(homeBadges(unfinished, task, false, TUE).dungeon).toBe(true);
  });

  it('достижения и питомцы считаются штуками', () => {
    const p: Progress = { ...base(), days: { [dayKey(TUE)]: 120 }, stars: { 10: 3 } };
    const task = dailyTask(dayKey(TUE), p.baseline);
    const b = homeBadges(p, task, false, TUE);
    expect(b.achievements).toBeGreaterThanOrEqual(2);
    expect(homeBadges({ ...p, achClaimed: ['first', 'day100', 'boss1', 'win1'] }, task, false, TUE).achievements).toBeLessThan(b.achievements);
    // Яйцо ещё не открыто после первой победы.
    expect(homeBadges({ ...p, pets: undefined }, task, false, TUE).pets).toBeGreaterThanOrEqual(1);
  });

  it('программа: метка в день тренировки, не после него', () => {
    const p: Progress = { ...base(), programs: { done: [], run: { id: 'newbie14', day: 1, started: dayKey(TUE), base: {}, factor: 1, log: {} } } as never };
    const task = dailyTask(dayKey(TUE), p.baseline);
    expect(homeBadges(p, task, false, TUE).programs).toBe(true);
    const done: Progress = { ...p, programs: { done: [], run: { id: 'newbie14', day: 2, started: dayKey(TUE), last: dayKey(TUE), base: {}, factor: 1, log: {} } } as never };
    expect(homeBadges(done, task, false, TUE).programs).toBe(false);
  });

  it('событие: только пока идёт и есть попытки', () => {
    const p = base();
    expect(homeBadges(p, dailyTask(dayKey(TUE), p.baseline), false, TUE).event).toBe(false);
    expect(homeBadges(p, dailyTask(dayKey(SAT), p.baseline), false, SAT).event).toBe(true);
  });
});
