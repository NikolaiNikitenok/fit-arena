import { describe, expect, it } from 'vitest';
import { TrainingLifecycle } from './trainingLifecycle';

const frames = (s: TrainingLifecycle, from: number, to: number, ok = true) => {
  for (let t = from; t <= to; t += 100) s.frame(ok, t);
};

describe('TrainingLifecycle', () => {
  it('ожидает камеру и не запускается от нажатия до готовности', () => {
    const s = new TrainingLifecycle();
    expect(s.frame(true, 0)).toBe('IDLE');
    s.load();
    expect(s.frame(true, 5000)).toBe('CAMERA_LOADING');
    s.cameraReady();
    expect(s.requestStart()).toBe(false);
    frames(s, 6000, 20000, false);
    expect(s.state).toBe('POSITIONING');
    expect(s.seconds(20000)).toBe(0);
  });

  it('требует 1.5 секунды устойчивой позы и отдельный запрос старта', () => {
    const s = new TrainingLifecycle();
    s.cameraReady();
    frames(s, 0, 1400);
    expect(s.state).toBe('POSITIONING');
    expect(s.frame(true, 1500)).toBe('READY');
    expect(s.requestStart()).toBe(true);
    expect(s.frame(true, 1600)).toBe('COUNTDOWN');
    expect(s.seconds(1600)).toBe(3);
    frames(s, 1700, 4500);
    expect(s.state).toBe('COUNTDOWN');
    expect(s.frame(true, 4600)).toBe('ACTIVE');
  });

  it('не принимает зависший кадр за непрерывное наблюдение', () => {
    const s = new TrainingLifecycle();
    s.cameraReady(true);
    s.frame(true, 0);
    expect(s.frame(true, 1500)).toBe('POSITIONING');
    frames(s, 1600, 3000);
    expect(s.state).toBe('POSITIONING');
    expect(s.frame(true, 3100)).toBe('COUNTDOWN');
  });

  it('потеря позы в countdown требует новую готовность и полный countdown', () => {
    const s = new TrainingLifecycle();
    s.cameraReady(true);
    frames(s, 0, 3500);
    expect(s.state).toBe('COUNTDOWN');
    expect(s.frame(false, 3600)).toBe('POSITIONING');
    frames(s, 3700, 5100);
    expect(s.state).toBe('POSITIONING');
    expect(s.frame(true, 5200)).toBe('COUNTDOWN');
    expect(s.seconds(5200)).toBe(3);
    frames(s, 5300, 8100);
    expect(s.state).toBe('COUNTDOWN');
    expect(s.frame(true, 8200)).toBe('ACTIVE');
  });

  it('active tracking loss не запускает повторно подготовку и не продлевает дедлайн', () => {
    const s = new TrainingLifecycle();
    s.cameraReady(true);
    frames(s, 0, 4500);
    expect(s.state).toBe('ACTIVE');
    const endsAt = 4500 + 60000;
    for (let t = 4600; t <= endsAt; t += 100) {
      expect(s.frame(t % 200 === 0, t)).toBe(t % 200 === 0 ? 'ACTIVE' : 'TRACKING_LOST');
      expect(s.seconds(t)).toBe(0);
    }
    // Потребитель завершает попытку по исходному дедлайну, FSM не выдаёт новую подготовку.
    s.end('COMPLETED');
    expect(s.frame(true, endsAt + 5000)).toBe('COMPLETED');
  });

  for (const terminal of ['CANCELLED', 'ERROR', 'COMPLETED'] as const) {
    it(`не возобновляет ${terminal} по позднему кадру или нажатию`, () => {
      const s = new TrainingLifecycle();
      s.cameraReady(true);
      frames(s, 0, 2000);
      s.end(terminal);
      expect(s.requestStart()).toBe(false);
      frames(s, 2100, 10000);
      expect(s.state).toBe(terminal);
    });
  }

  it('поддерживает обработку кадров каждые 300 мс на медленном устройстве', () => {
    const s = new TrainingLifecycle();
    s.cameraReady(true);
    for (let at = 0; at <= 4500; at += 300) s.frame(true, at);
    expect(s.state).toBe('ACTIVE');
  });

  it('допуск между кадрами конфигурируется', () => {
    const s = new TrainingLifecycle(1500, 3000, 200);
    s.cameraReady(true);
    for (let at = 0; at <= 6000; at += 300) s.frame(true, at);
    expect(s.state).toBe('POSITIONING');
  });

});
