import { describe, expect, it } from 'vitest';
import { dueMessages, pendingStage, weeklyText } from './winback';
import type { Save } from './saves';

const deps = { lang: () => 'ru' as const, clanName: () => undefined, petName: () => 'Искра', canWrite: () => true };
const save = (days: Record<string, number>, extra: Partial<Save> = {}): Save => ({ id: 'tg:1', progress: { days }, savedAt: 1, ...extra });
// 2026-11-04 — среда; 12:00 по Москве = 09:00 UTC.
const at = (date: string, mskHour = 13) => Date.parse(`${date}T${String(mskHour - 3).padStart(2, '0')}:00:00Z`);

describe('письма «возвращайся»', () => {
  it('через 3 дня — письмо с подарком 100 монет, через 7 — второе, больше не пишем', () => {
    const s = save({ '2026-11-01': 20 });
    expect(dueMessages([s], at('2026-11-03'), deps)).toEqual([]);
    const [m3] = dueMessages([s], at('2026-11-04'), deps);
    expect(m3.kind).toBe('wb3');
    expect(m3.gift?.coins).toBe(100);
    expect(m3.text).toContain('Князь Диван');
    s.winback = m3.mark.winback;
    expect(dueMessages([s], at('2026-11-05'), deps)).toEqual([]);
    const [m7] = dueMessages([s], at('2026-11-08'), deps);
    expect(m7.kind).toBe('wb7');
    expect(m7.gift).toMatchObject({ coins: 200, vigor: 2 });
    s.winback = m7.mark.winback;
    expect(dueMessages([s], at('2026-11-12'), deps).filter((m) => m.kind.startsWith('wb'))).toEqual([]);
  });

  it('вернулся и снова пропал — счёт сначала', () => {
    const s = save({ '2026-11-01': 20 }, { winback: { last: '2026-10-20', sent: [3, 7] } });
    expect(pendingStage(s, '2026-11-04')).toBe(3);
  });

  it('пишет только днём, не гостям, не остановившим бота и не через месяц', () => {
    const s = save({ '2026-11-01': 20 });
    expect(dueMessages([s], at('2026-11-04', 9), deps)).toEqual([]);
    expect(dueMessages([s], at('2026-11-04', 21), deps)).toEqual([]);
    expect(dueMessages([{ ...s, id: 'guest:x' }], at('2026-11-04'), deps)).toEqual([]);
    expect(dueMessages([{ ...s, blocked: true }], at('2026-11-04'), deps)).toEqual([]);
    expect(dueMessages([s], at('2026-11-04'), { ...deps, canWrite: () => false })).toEqual([]);
    expect(pendingStage(s, '2026-12-05')).toBeUndefined();
  });

  it('упоминает питомца или клан', () => {
    const pet = { ...save({ '2026-11-01': 20 }), progress: { days: { '2026-11-01': 20 }, pets: { active: 'dragon' } } };
    expect(dueMessages([pet], at('2026-11-04'), deps)[0].text).toContain('Искра');
    expect(dueMessages([save({ '2026-11-01': 20 })], at('2026-11-04'), { ...deps, clanName: () => 'Медведи' })[0].text).toContain('Медведи');
  });
});

describe('сводка недели', () => {
  it('по понедельникам тем, кто тренировался, один раз', () => {
    const days: Record<string, number> = { '2026-10-06': 50, '2026-11-03': 30, '2026-11-07': 40 };
    const s = save(days);
    // 2026-11-09 — понедельник; последний день 07.11 — два дня назад, письма о возврате ещё нет.
    const [m] = dueMessages([s], at('2026-11-09'), deps);
    expect(m.kind).toBe('weekly');
    expect(m.text).toContain('70');
    s.weeklyOn = m.mark.weeklyOn;
    expect(dueMessages([s], at('2026-11-09', 15), deps)).toEqual([]);
    expect(dueMessages([s], at('2026-11-10'), deps).map((x) => x.kind)).toEqual(['wb3']);
  });

  it('текст роста и спада', () => {
    expect(weeklyText(120, 20, 'month', 'ru')).toContain('на 20% больше, чем месяц назад');
    expect(weeklyText(80, -20, 'week', 'ru')).toContain('на 20% меньше, чем неделей раньше');
    expect(weeklyText(80, null, null, 'ru')).toContain('Через месяц');
  });
});
