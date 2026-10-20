import { describe, expect, it, vi } from 'vitest';
import { fpsCapped, frameDone, MIN_FPS, sceneStarted, telegramPerfClass, weakByHints } from './devicePerf';

// Настройки тянут звук и Telegram, которым нужен браузер; здесь они не нужны.
vi.mock('./settings', () => ({ getSettings: () => ({}), setAuto: () => {} }));

describe('класс телефона', () => {
  it('читает класс производительности из user agent Telegram для Android', () => {
    const ua = (cls: string) => `Mozilla/5.0 (Linux; Android 11; SM-A125F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Telegram-Android/11.2.3 (Samsung SM-A125F; Android 11; SDK 30; ${cls})`;
    expect(telegramPerfClass(ua('LOW'))).toBe('LOW');
    expect(telegramPerfClass(ua('AVERAGE'))).toBe('AVERAGE');
    expect(telegramPerfClass(ua('HIGH'))).toBe('HIGH');
    expect(telegramPerfClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')).toBeNull();
    // Старый Telegram без класса.
    expect(telegramPerfClass('Mozilla/5.0 (Linux; Android 9) Telegram-Android/9.0.1 (Xiaomi Redmi 7; Android 9; SDK 28)')).toBeNull();
  });

  it('решает по характеристикам, а неясное оставляет замеру FPS', () => {
    expect(weakByHints({ tgClass: 'LOW', cores: 8, memory: 8, android: true })).toBe(true);
    expect(weakByHints({ tgClass: 'HIGH', cores: 4, memory: 2, android: true })).toBe(false);
    expect(weakByHints({ tgClass: null, memory: 2, cores: 8, android: true })).toBe(true);
    // Ядра не в счёт: Android в экономии батареи показывает только 4 неспящих ядра.
    expect(weakByHints({ tgClass: null, memory: 4, cores: 4, android: true })).toBeNull();
    expect(weakByHints({ tgClass: null, cores: 4, android: false })).toBeNull();
    expect(weakByHints({ tgClass: 'AVERAGE', cores: 8, memory: 4, android: true })).toBeNull();
    expect(weakByHints({ tgClass: 'AVERAGE', cores: 4, memory: 4, android: true })).toBeNull();
  });

  it('экран на 30 Гц — не повод включать экономный режим', () => {
    expect(MIN_FPS).toBeLessThan(30);
  });
});

describe('ограничение кадров в экономном режиме', () => {
  it('ставит 30 только когда сцена три секунды подряд ниже 25', () => {
    sceneStarted();
    // 60 кадров в секунду в экономном режиме: без ограничения.
    for (let t = 0; t < 6000; t += 1000 / 60) frameDone(t, true);
    expect(fpsCapped()).toBe(false);
    // Без экономного режима не ограничиваем никогда.
    sceneStarted();
    for (let t = 0; t < 8000; t += 50) frameDone(t, false);
    expect(fpsCapped()).toBe(false);
    // 20 кадров в секунду в экономном режиме: через ~4 секунды — ровные 30.
    sceneStarted();
    for (let t = 0; t < 8000; t += 50) frameDone(t, true);
    expect(fpsCapped()).toBe(true);
  });
});
