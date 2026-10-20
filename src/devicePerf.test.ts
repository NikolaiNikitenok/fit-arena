import { describe, expect, it, vi } from 'vitest';
import { telegramPerfClass, weakByHints } from './devicePerf';

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
    expect(weakByHints({ tgClass: null, memory: 4, cores: 4, android: true })).toBe(true);
    // iPhone с малым числом ядер не считаем слабым по ядрам.
    expect(weakByHints({ tgClass: null, cores: 4, android: false })).toBeNull();
    expect(weakByHints({ tgClass: 'AVERAGE', cores: 8, memory: 4, android: true })).toBeNull();
  });
});
