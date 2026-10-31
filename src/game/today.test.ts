import { describe, expect, it } from 'vitest';
import { pickToday, TodayInput } from './today';

const base: TodayInput = { cleared: 10, lives: 5, unlocked: () => true, programReady: false, dailyDone: 0, dailyTarget: 30, dailyClaimed: false, eventLive: false, eventWon: false, eventTries: 3, dungeonFloors: 0 };

describe('«Тренировка дня»', () => {
  it('новичок проходит испытания', () => expect(pickToday({ ...base, cleared: 1, programReady: true })).toBe('level'));
  it('день программы важнее всего', () => expect(pickToday({ ...base, programReady: true })).toBe('program'));
  it('потом задание дня', () => expect(pickToday(base)).toBe('daily'));
  it('задание сделано — босс события', () => expect(pickToday({ ...base, dailyDone: 30, eventLive: true })).toBe('event'));
  it('иначе следующий уровень', () => expect(pickToday({ ...base, dailyClaimed: true })).toBe('level'));
  it('без жизней — подземелье или программы', () => {
    expect(pickToday({ ...base, dailyClaimed: true, lives: 0, dungeonFloors: 2 })).toBe('dungeon');
    expect(pickToday({ ...base, dailyClaimed: true, lives: 0 })).toBe('programs');
  });
  it('закрытые разделы не предлагает', () => {
    const only = (f: string) => f === 'daily';
    expect(pickToday({ ...base, unlocked: only, programReady: true, eventLive: true, dailyClaimed: true })).toBe('level');
  });
});
