import { describe, expect, it } from 'vitest';
import { abandonProgram, availability, baseFor, dayKind, finishDay, pauseProgram, planDay, programById, programsOf, PROGRAMS, restDay, shareDone, startProgram } from './programs';
import { ITEMS, openChest } from './items';
import { DEFAULT_BASELINE } from './levels';
import { heroXp, loadProgress, type Progress, recordActivity } from './progress';
import { ACHIEVEMENTS, achDone } from './achievements';

const DAY = 86_400_000;
const T0 = new Date(2026, 9, 1, 10).getTime();
const at = (d: number) => T0 + d * DAY;
const total = (sets: { target: number }[]) => sets.reduce((s, x) => s + x.target, 0);
const fresh = (): Progress => ({ ...loadProgress(), coins: 0 });

// Прогнать программу: на тренировках сделать долю share от цели, тест — base.
function runTo(p: Progress, day: number, share = 1, test = 10): { p: Progress; t: number } {
  let t = 0;
  while (programsOf(p).run && programsOf(p).run!.day < day) {
    const run = programsOf(p).run!;
    const def = programById(run.id)!;
    if (availability(run, at(t)) === 'tomorrow') t++;
    if (dayKind(def, run.day) === 'rest') {
      p = restDay(p, at(t))!;
      continue;
    }
    const plan = planDay(def, run.day, run.base, p.baseline, run.factor);
    const done = plan.sets.map((s) => (s.max ? test : Math.round(s.target * share)));
    p = finishDay(p, done, at(t))!.progress;
  }
  return { p, t };
}

describe('планы программ', () => {
  it('у каждой программы тест в первый день, финал в последний и отдых по графику', () => {
    for (const def of PROGRAMS) {
      const days = Array.from({ length: def.days }, (_, i) => planDay(def, i + 1, undefined, DEFAULT_BASELINE));
      expect(days[0].kind).toBe('test');
      expect(days[0].sets.every((s) => s.max)).toBe(true);
      expect(days[0].sets.map((s) => s.exercise)).toEqual(def.focus);
      expect(days[def.days - 1].kind).toBe('final');
      for (const d of days) {
        if (d.kind === 'rest') expect(d.sets).toHaveLength(0);
        else expect(d.sets.length).toBeGreaterThan(0);
        // После последнего подхода не отдыхаем.
        if (d.sets.length) expect(d.sets[d.sets.length - 1].rest).toBe(0);
        for (const s of d.sets) expect(s.target).toBeGreaterThan(0);
      }
      expect(days.filter((d) => d.kind === 'rest').length).toBeGreaterThan(0);
    }
  });

  it('нагрузка растёт от первой тренировки к последней', () => {
    for (const def of PROGRAMS) {
      const train = Array.from({ length: def.days }, (_, i) => planDay(def, i + 1, undefined, DEFAULT_BASELINE)).filter((d) => d.kind === 'train');
      expect(total(train[train.length - 1].sets)).toBeGreaterThan(total(train[0].sets));
    }
  });

  it('цели считаются от входного теста', () => {
    const def = programById('pushup100')!;
    const weak = planDay(def, 2, { pushup: 5 }, DEFAULT_BASELINE);
    const strong = planDay(def, 2, { pushup: 25 }, DEFAULT_BASELINE);
    expect(total(strong.sets)).toBeGreaterThan(total(weak.sets));
    // К последнему дню — сотня за тренировку.
    expect(total(planDay(def, 30, { pushup: 10 }, DEFAULT_BASELINE).sets)).toBe(100);
  });

  it('планка: финал — пять минут одним подходом, секунды кратны пяти', () => {
    const def = programById('plank5')!;
    const final = planDay(def, 30, { plank: 40 }, DEFAULT_BASELINE);
    expect(final.sets).toEqual([{ exercise: 'plank', target: 300, rest: 0 }]);
    for (let d = 2; d < 30; d++) for (const s of planDay(def, d, { plank: 40 }, DEFAULT_BASELINE).sets) expect(s.target % 5).toBe(0);
  });

  it('до теста база берётся из испытаний силы', () => {
    expect(baseFor(undefined, { ...DEFAULT_BASELINE, pushup: 20, plank: 45 })).toMatchObject({ pushup: 14, plank: 45 });
    expect(baseFor({ pushup: 30 }, DEFAULT_BASELINE).pushup).toBe(30);
  });

  it('доля сделанного: тестовый подход засчитан за любой результат', () => {
    expect(shareDone([{ exercise: 'pushup', target: 10, rest: 0, max: true }], [3])).toBe(1);
    expect(shareDone([{ exercise: 'squat', target: 10, rest: 0 }, { exercise: 'squat', target: 10, rest: 0 }], [10, 5])).toBe(0.75);
  });
});

describe('ход программы', () => {
  it('одна программа за раз, пауза и отказ', () => {
    let p = startProgram(fresh(), 'abs21', at(0))!;
    expect(startProgram(p, 'legs28', at(0))).toBeNull();
    p = pauseProgram(p, true);
    expect(availability(programsOf(p).run!, at(0))).toBe('paused');
    p = pauseProgram(p, false);
    expect(availability(programsOf(p).run!, at(0))).toBe('ready');
    p = abandonProgram(p);
    expect(programsOf(p).run).toBeUndefined();
    expect(startProgram(p, 'legs28', at(0))).not.toBeNull();
  });

  it('тест сохраняет базу, день закрывается до завтра, монеты и опыт', () => {
    const p0 = startProgram(fresh(), 'abs21', at(0))!;
    const r = finishDay(p0, [22, 48], at(0))!;
    const run = programsOf(r.progress).run!;
    expect(run.base).toEqual({ situp: 22, plank: 48 });
    // Тест планки — и база для заданий дня.
    expect(r.progress.baseline.plank).toBe(48);
    expect(run.day).toBe(2);
    expect(r.coins).toBeGreaterThan(0);
    expect(r.progress.coins).toBe(r.coins);
    expect(heroXp(r.progress)).toBe(heroXp(p0) + r.xp);
    expect(availability(run, at(0))).toBe('tomorrow');
    expect(finishDay(r.progress, [1, 1], at(0))).toBeNull();
    expect(availability(run, at(1))).toBe('ready');
  });

  it('нагрузка подстраивается: недобрал — легче, сделал всё — тяжелее', () => {
    const weak = runTo(startProgram(fresh(), 'legs28', at(0))!, 4, 0.5).p;
    const strong = runTo(startProgram(fresh(), 'legs28', at(0))!, 4, 1).p;
    expect(programsOf(weak).run!.factor).toBeLessThan(1);
    expect(programsOf(strong).run!.factor).toBeGreaterThan(1);
    const def = programById('legs28')!;
    const plan = (p: Progress) => planDay(def, 5, programsOf(p).run!.base, p.baseline, programsOf(p).run!.factor);
    expect(total(plan(strong).sets)).toBeGreaterThan(total(plan(weak).sets));
  });

  it('день отдыха: пропущенный день засчитывается отдыхом задним числом', () => {
    // pushup100: отдых на третий день.
    let p = runTo(startProgram(fresh(), 'pushup100', at(0))!, 3).p;
    const run = programsOf(p).run!;
    expect(dayKind(programById('pushup100')!, run.day)).toBe('rest');
    expect(availability(run, at(2))).toBe('rest');
    // Игрок пришёл через два дня: отдых уже был, тренироваться можно сегодня.
    p = restDay(p, at(4))!;
    expect(availability(programsOf(p).run!, at(4))).toBe('ready');
    // А в обычный день отдыха следующая тренировка — завтра.
    let q = runTo(startProgram(fresh(), 'pushup100', at(0))!, 3).p;
    const t = 2;
    q = restDay(q, at(t))!;
    expect(availability(programsOf(q).run!, at(t))).toBe('tomorrow');
  });

  it('финал: прохождение даёт облик, титул и монеты; провал — повтор завтра', () => {
    const { p, t } = runTo(startProgram(fresh(), 'plank5', at(0))!, 30, 1, 60);
    expect(programsOf(p).run!.day).toBe(30);
    const day = t + 1;
    const fail = finishDay(p, [200], at(day))!;
    expect(fail.retry).toBe(true);
    expect(programsOf(fail.progress).run!.day).toBe(30);
    expect(availability(programsOf(fail.progress).run!, at(day))).toBe('tomorrow');
    const win = finishDay(fail.progress, [300], at(day + 1))!;
    expect(win.completed).toBe(true);
    expect(win.outfit).toBe('prog-stone');
    expect(win.progress.items).toContain('prog-stone');
    expect(programsOf(win.progress).run).toBeUndefined();
    expect(programsOf(win.progress).done).toEqual(['plank5']);
    const ach = ACHIEVEMENTS.find((a) => a.id === 'prog-plank5')!;
    expect(achDone(ach, win.progress, at(day + 1))).toBe(true);
  });
});

describe('планка в прогрессе и награды программ', () => {
  it('секунды планки: в журнал и рекорд — секунды, в опыт — по повтору за две', () => {
    const p = recordActivity(fresh(), 'plank', 60, T0);
    const key = Object.keys(p.days)[0];
    expect(p.days[key]).toBe(30);
    expect(p.best.plank?.reps).toBe(60);
    expect(p.log?.[key].r.plank).toBe(60);
    expect(p.dayEx?.reps.plank).toBe(60);
  });

  it('облики программ не продаются и не выпадают из сундуков', () => {
    const prog = ITEMS.filter((i) => i.program);
    expect(prog.length).toBe(PROGRAMS.filter((d) => d.outfit).length);
    for (const d of PROGRAMS) if (d.outfit) expect(prog.map((i) => i.id)).toContain(d.outfit);
    for (const i of prog) expect(i.inShop).toBe(false);
    for (let seed = 1; seed < 400; seed++) {
      const loot = openChest(seed, [], seed % 30);
      expect(loot.item?.program).toBeFalsy();
    }
  });

  it('старое сохранение без планки получает базу по умолчанию', () => {
    expect(loadProgress().baseline.plank).toBe(DEFAULT_BASELINE.plank);
  });
});
