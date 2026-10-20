import { beforeEach, describe, expect, it } from 'vitest';
import { loadProgress, type Progress } from '../game/progress';
import { GYM_EXERCISES, gymExercise, searchGym } from './catalog';
import { e1rm, finishRun, gymOf, isRecord, kgText, runVolume, saveTemplate, setWeekDay, startRun, todayTemplate, updateRun, weekday } from './gym';

const T = new Date('2026-10-20T18:00:00').getTime();

beforeEach(() => {
  const store: Record<string, string> = {};
  globalThis.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] } as unknown as Storage;
});

describe('каталог зала', () => {
  it('большой, без повторов id, ищется по словам', () => {
    expect(GYM_EXERCISES.length).toBeGreaterThan(250);
    expect(new Set(GYM_EXERCISES.map((e) => e.id)).size).toBe(GYM_EXERCISES.length);
    expect(gymExercise('bench.bb').name).toBe('Жим лёжа (Штанга)');
    expect(gymExercise('pullup.bw').kind).toBe('bw');
    expect(gymExercise('plank.bw').kind).toBe('t');
    expect(searchGym('жим гантели').some((e) => e.id === 'incline.db')).toBe(true);
    expect(searchGym('', 'cardio').every((e) => e.muscle === 'cardio')).toBe(true);
  });
});

describe('дневник зала', () => {
  const doSets = (p: Progress, ex: number, sets: { w: number; r: number }[]) =>
    updateRun(p, (r) => ({ ...r, items: r.items.map((it, i) => (i === ex ? { ...it, sets: sets.map((s) => ({ ...s, done: true })) } : it)) }));

  it('план недели, объём, рекорды и прошлые веса', () => {
    let p = loadProgress();
    p = saveTemplate(p, { name: 'Грудь', items: [{ ex: 'bench.bb', sets: 3, reps: 8 }, { ex: 'pulldown.cable', sets: 3, reps: 10 }] });
    const tpl = gymOf(p).templates[0];
    p = setWeekDay(p, weekday(T), tpl.id);
    expect(todayTemplate(gymOf(p), T)?.name).toBe('Грудь');

    p = startRun(p, T, tpl);
    expect(gymOf(p).run!.items[0].sets).toHaveLength(3);
    p = doSets(p, 0, [{ w: 60, r: 8 }, { w: 60, r: 8 }, { w: 62.5, r: 6 }]);
    expect(runVolume(gymOf(p).run!)).toBe(60 * 8 * 2 + 62.5 * 6);
    const first = finishRun(p, T + 50 * 60000)!;
    // Упражнение без отмеченных подходов в итог не попадает, первый раз — ещё не рекорд.
    expect(first.session.items.map((i) => i.ex)).toEqual(['bench.bb']);
    expect(first.session.prs).toEqual([]);
    p = first.progress;
    expect(gymOf(p).run).toBeUndefined();

    p = startRun(p, T + 86400_000, tpl);
    // Подставлены веса прошлого раза.
    expect(gymOf(p).run!.items[0].sets[2]).toMatchObject({ w: 62.5, r: 6 });
    p = doSets(p, 0, [{ w: 65, r: 5 }]);
    const second = finishRun(p, T + 86400_000 + 3600_000)!;
    expect(second.session.prs).toEqual(['bench.bb']);
    expect(gymOf(second.progress).history).toHaveLength(2);
    // На серию, задание дня и повторы дня зал не влияет.
    expect(second.progress.days).toEqual(loadProgress().days);
    expect(second.progress.dayEx).toEqual(loadProgress().dayEx);
  });

  it('рекорд: больше вес или лучший расчётный максимум', () => {
    expect(isRecord({ w: 100, e: e1rm(100, 5) }, { w: 95, e: e1rm(95, 10) })).toBe(true);
    expect(isRecord({ w: 100, e: e1rm(100, 5) }, { w: 100, e: e1rm(100, 5) })).toBe(false);
    expect(isRecord(undefined, { w: 100 })).toBe(false);
  });

  it('объём с пробелами', () => {
    expect(kgText(5455)).toBe('5 455 кг');
  });
});
