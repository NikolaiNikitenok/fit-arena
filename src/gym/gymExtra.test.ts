import { beforeEach, describe, expect, it } from 'vitest';
import { loadProgress, type Progress } from '../game/progress';
import { finishRun, gymOf, saveTemplate, startRun, suggest, updateRun } from './gym';
import { applyImport, matchExercise, parseDate, parseWorkouts } from './importCsv';
import { loadOf, slugLevels, weekLoad } from './muscles';
import { BODY_PATHS } from './bodyMap';
import { MAP_SLUGS } from './muscles';

const T = new Date('2026-10-20T18:00:00').getTime();
beforeEach(() => {
  const store: Record<string, string> = {};
  globalThis.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] } as unknown as Storage;
});

const train = (p: Progress, day: number, sets: { w: number; r: number }[]) => {
  const tpl = gymOf(p).templates[0];
  p = startRun(p, T + day * 86400_000, tpl);
  p = updateRun(p, (r) => ({ ...r, items: r.items.map((it, i) => (i === 0 ? { ...it, sets: sets.map((s) => ({ ...s, done: true })) } : it)) }));
  return finishRun(p, T + day * 86400_000 + 3600_000)!.progress;
};

describe('прогрессия веса', () => {
  it('всё сделал — +2,5 кг; два раза не дотянул — минус 10%', () => {
    let p = saveTemplate(loadProgress(), { name: 'Жим', items: [{ ex: 'bench.bb', sets: 3, reps: 8 }] });
    p = train(p, 0, [{ w: 60, r: 8 }, { w: 60, r: 8 }, { w: 60, r: 8 }]);
    p = startRun(p, T + 86400_000, gymOf(p).templates[0]);
    const it = gymOf(p).run!.items[0];
    expect(it.hint).toMatchObject({ why: 'up', delta: 2.5 });
    expect(it.sets.every((s) => s.w === 62.5 && s.r === 8)).toBe(true);
    p = { ...p, gym: { ...gymOf(p), run: undefined } };
    p = train(p, 1, [{ w: 62.5, r: 8 }, { w: 62.5, r: 6 }, { w: 62.5, r: 5 }]);
    expect(suggest(gymOf(p), 'bench.bb', 8).hint.why).toBe('same');
    p = train(p, 2, [{ w: 62.5, r: 7 }, { w: 62.5, r: 6 }, { w: 62.5, r: 5 }]);
    const s = suggest(gymOf(p), 'bench.bb', 8);
    expect(s.hint.why).toBe('down');
    expect(s.sets!({}).w).toBe(57.5);
  });
  it('свой вес: растут повторы', () => {
    let p = saveTemplate(loadProgress(), { name: 'Турник', items: [{ ex: 'pullup.bw', sets: 3, reps: 6 }] });
    p = train(p, 0, [{ w: 0, r: 7 }, { w: 0, r: 6 }, { w: 0, r: 6 }]);
    const s = suggest(gymOf(p), 'pullup.bw', 6);
    expect(s.hint).toMatchObject({ why: 'up', reps: true });
    expect(s.sets!({}).r).toBe(8);
  });
});

describe('карта мышц', () => {
  it('основная мышца целиком, помощники частью', () => {
    const load = loadOf([{ items: [{ ex: 'bench.bb', sets: [[60, 8], [60, 8], [60, 8], [60, 8]] }] }]);
    expect(load.chest).toBe(4);
    expect(load.triceps).toBe(2);
    expect(slugLevels(load).chest).toBeCloseTo(0.4);
    expect(weekLoad([{ id: 'x', name: '', start: T - 8 * 86400_000, end: T, vol: 0, prs: [], items: [{ ex: 'bench.bb', sets: [[1, 1]] }] }], T)).toEqual({});
  });
  it('каждый участок мышцы есть на карте', () => {
    const all = new Set([...Object.keys(BODY_PATHS.front), ...Object.keys(BODY_PATHS.back)]);
    for (const slugs of Object.values(MAP_SLUGS)) for (const s of slugs) expect(all.has(s)).toBe(true);
  });
});

describe('импорт Strong и Hevy', () => {
  it('названия упражнений', () => {
    expect(matchExercise('Bench Press (Barbell)')).toBe('bench.bb');
    expect(matchExercise('Bench Press (Dumbbell)')).toBe('bench.db');
    expect(matchExercise('Lat Pulldown (Cable)')).toBe('pulldown.cable');
    expect(matchExercise('Squat (Barbell)')).toBe('squat.bb');
    expect(matchExercise('Pull Up')).toBe('pullup.bw');
    expect(matchExercise('Bicep Curl (Dumbbell)')).toBe('curl.db');
    expect(matchExercise('Romanian Deadlift (Barbell)')).toBe('rdl.bb');
    expect(matchExercise('Mystery Move')).toBe('my.Mystery Move');
  });
  it('даты', () => {
    expect(new Date(parseDate('26 Oct 2024, 18:03')).getHours()).toBe(18);
    expect(new Date(parseDate('2024-10-26 18:03:00')).getDate()).toBe(26);
  });
  it('Strong: подходы, фунты не путаем, отдых пропускаем', () => {
    const csv = [
      'Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE',
      '2024-10-26 18:00:00;"Грудь";1h 5m;Bench Press (Barbell);1;60;8;0;0;;;',
      '2024-10-26 18:00:00;"Грудь";1h 5m;Bench Press (Barbell);2;62.5;6;0;0;;;',
      '2024-10-26 18:00:00;"Грудь";1h 5m;Bench Press (Barbell);Rest Timer;0;0;0;90;;;',
      '2024-10-26 18:00:00;"Грудь";1h 5m;Plank;1;0;0;0;60;;;',
      '2024-10-28 19:00:00;"Ноги";50m;Squat (Barbell);1;100;5;0;0;;;',
    ].join('\n');
    const r = parseWorkouts(csv)!;
    expect(r.source).toBe('strong');
    expect(r.sessions).toHaveLength(2);
    const chest = r.sessions[1];
    expect(chest.name).toBe('Грудь');
    expect(chest.end - chest.start).toBe(65 * 60000);
    expect(chest.items.find((i) => i.ex === 'bench.bb')!.sets).toEqual([[60, 8], [62.5, 6]]);
    expect(chest.items.find((i) => i.ex === 'plank.bw')!.sets).toEqual([[0, 60]]);
    expect(chest.vol).toBe(60 * 8 + 62.5 * 6);
  });
  it('Hevy: разминку не берём, в дневник без повторов', () => {
    const csv = [
      '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
      '"Push","26 Oct 2024, 18:03","26 Oct 2024, 19:10","","Bench Press (Barbell)","","","0","warmup","40","10","","",""',
      '"Push","26 Oct 2024, 18:03","26 Oct 2024, 19:10","","Bench Press (Barbell)","","","1","normal","80","5","","",""',
      '"Push","26 Oct 2024, 18:03","26 Oct 2024, 19:10","","Lateral Raise (Dumbbell)","","","0","normal","10","12","","",""',
    ].join('\n');
    const r = parseWorkouts(csv)!;
    expect(r.source).toBe('hevy');
    expect(r.sessions[0].items).toEqual([
      { ex: 'bench.bb', sets: [[80, 5]] },
      { ex: 'lateral.db', sets: [[10, 12]] },
    ]);
    let p = applyImport(loadProgress(), r.sessions).progress;
    expect(gymOf(p).best['bench.bb'].w).toBe(80);
    expect(gymOf(p).last['bench.bb']).toEqual([{ w: 80, r: 5 }]);
    const again = applyImport(p, r.sessions);
    expect(again.added).toBe(0);
    p = again.progress;
    expect(gymOf(p).history).toHaveLength(1);
  });
  it('чужой файл — null', () => {
    expect(parseWorkouts('a,b\n1,2')).toBeNull();
  });
});
