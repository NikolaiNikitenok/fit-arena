import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOUNDS,
  calibrationSink,
  calibrationStatus,
  Calibrator,
  deriveThresholds,
  needsCalibration,
  personalThresholds,
  Recalibration,
  resetCalibration,
  saveCalibration,
  skipCalibration,
} from './calibration';

// Плавный повтор: от верха к низу и обратно с шагом в 3°.
function slowReps(top: number, bottom: number, reps: number): number[] {
  const one: number[] = [];
  for (let a = top; a > bottom; a -= 3) one.push(a);
  for (let a = bottom; a < top; a += 3) one.push(a);
  // В конце игрок замирает наверху на секунду.
  return [...Array.from({ length: reps }, () => one).flat(), ...Array(20).fill(top)];
}

function feed(c: Calibrator, angles: number[], stepMs = 60) {
  let t = 0;
  for (const a of angles) c.update(a, true, (t += stepMs));
  return c.view;
}

describe('deriveThresholds', () => {
  it('ставит низ на 30% амплитуды от минимума, верх на 25% от максимума', () => {
    expect(deriveThresholds('squat', 80, 170)).toEqual({ down: 107, up: 148 });
  });

  it('малая амплитуда пресса: пороги сдвигаются под игрока', () => {
    const t = deriveThresholds('situp', 95, 125);
    expect(t.down).toBe(100);
    expect(t.up).toBe(118);
  });

  it('не даёт порогам выйти за разумные пределы', () => {
    for (const ex of ['pushup', 'squat', 'situp'] as const) {
      const b = BOUNDS[ex];
      for (const [min, max] of [
        [0, 180],
        [150, 160],
        [20, 40],
        [100, 101],
      ]) {
        const t = deriveThresholds(ex, min, max);
        expect(t.down).toBeLessThanOrEqual(b.down[1]);
        expect(t.up).toBeGreaterThanOrEqual(b.up[0]);
        expect(t.up).toBeLessThanOrEqual(b.up[1]);
        expect(t.up - t.down).toBeGreaterThanOrEqual(b.gap);
      }
    }
  });
});

describe('Calibrator', () => {
  it('находит три медленных повтора и выдаёт пороги по их амплитуде', () => {
    const v = feed(new Calibrator('situp'), slowReps(125, 95, 3));
    expect(v.reps).toBe(3);
    expect(v.result).toEqual(deriveThresholds('situp', 95, 125));
  });

  it('ждёт все повторы', () => {
    const v = feed(new Calibrator('situp'), slowReps(125, 95, 2));
    expect(v.reps).toBe(2);
    expect(v.result).toBeNull();
  });

  it('дрожание не считает за повторы', () => {
    const jitter = Array.from({ length: 200 }, (_, i) => 110 + (i % 2 ? 7 : -7));
    const v = feed(new Calibrator('situp'), jitter);
    expect(v.reps).toBe(0);
    expect(v.result).toBeNull();
  });

  it('пропускает кадры с неверной позой', () => {
    const c = new Calibrator('squat');
    let t = 0;
    for (const a of slowReps(170, 60, 3)) c.update(a, false, (t += 60));
    expect(c.view.reps).toBe(0);
    expect(c.view.angle).toBeNull();
  });
});

describe('калибровка по упражнениям', () => {
  beforeEach(() => resetCalibration());

  it('статус: не откалибровано, пропущено, откалибровано с датой', () => {
    expect(calibrationStatus('squat')).toEqual({ kind: 'none' });
    skipCalibration('situp');
    expect(calibrationStatus('situp')).toEqual({ kind: 'skipped' });
    saveCalibration('squat', { down: 100, up: 150 }, 1_700_000_000_000);
    expect(calibrationStatus('squat')).toEqual({ kind: 'done', down: 100, up: 150, at: 1_700_000_000_000 });
    expect(personalThresholds('squat')).toEqual({ down: 100, up: 150 });
  });

  it('сброс одного упражнения не трогает остальные', () => {
    saveCalibration('squat', { down: 100, up: 150 });
    saveCalibration('pushup', { down: 95, up: 140 });
    skipCalibration('situp');
    resetCalibration('squat');
    expect(needsCalibration('squat')).toBe(true);
    expect(personalThresholds('pushup')).toEqual({ down: 95, up: 140 });
    expect(calibrationStatus('situp')).toEqual({ kind: 'skipped' });
  });

  it('«Сбросить все» очищает все упражнения', () => {
    saveCalibration('squat', { down: 100, up: 150 });
    skipCalibration('situp');
    resetCalibration();
    expect(needsCalibration('squat')).toBe(true);
    expect(needsCalibration('situp')).toBe(true);
  });

  it('повторная калибровка: камера не сохраняет итог и отказ сама', () => {
    saveCalibration('squat', { down: 100, up: 150 });
    const sink = calibrationSink(false);
    sink.done('squat', { down: 90, up: 160 });
    sink.skip('squat');
    expect(personalThresholds('squat')).toEqual({ down: 100, up: 150 });
    // Перед подходом итог сохраняется сразу, как раньше.
    calibrationSink(true).done('pushup', { down: 95, up: 140 });
    expect(personalThresholds('pushup')).toEqual({ down: 95, up: 140 });
  });

  it('отмена или «Оставить прежнюю» сохраняют старые пороги', () => {
    saveCalibration('squat', { down: 100, up: 150 });
    const cancelled = new Recalibration('squat');
    expect(cancelled.before).toEqual({ down: 100, up: 150 });
    // Отмена до конца: результата нет — сохранять нечего.
    expect(cancelled.save()).toBe(false);
    const kept = new Recalibration('squat');
    kept.finish({ down: 90, up: 160 });
    // «Оставить прежнюю» просто закрывает экран без save().
    expect(personalThresholds('squat')).toEqual({ down: 100, up: 150 });
  });

  it('«Сохранить» заменяет пороги только этого упражнения', () => {
    saveCalibration('squat', { down: 100, up: 150 });
    saveCalibration('pushup', { down: 95, up: 140 });
    const r = new Recalibration('squat');
    r.finish({ down: 90, up: 160 });
    expect(r.save()).toBe(true);
    expect(personalThresholds('squat')).toEqual({ down: 90, up: 160 });
    expect(personalThresholds('pushup')).toEqual({ down: 95, up: 140 });
  });

  it('повторная калибровка пропущенного упражнения: прежних порогов нет', () => {
    skipCalibration('situp');
    const r = new Recalibration('situp');
    expect(r.before).toBeUndefined();
    expect(calibrationStatus('situp')).toEqual({ kind: 'skipped' });
  });
});
