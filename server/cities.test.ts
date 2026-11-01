import { describe, expect, it } from 'vitest';
import { CityStore, cityKey, cleanCity, weekDays, weekReps } from './cities';
import { DAY_REPS_MAX } from './saves';

// Среда, 28 октября 2026, полдень по Москве.
const NOW = Date.UTC(2026, 9, 28, 9);

describe('топ по городу', () => {
  it('неделя — с понедельника по воскресенье по Москве', () => {
    expect(weekDays(NOW)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    // Воскресенье 23:30 по Москве — ещё та же неделя.
    expect(weekDays(Date.UTC(2026, 10, 1, 20, 30))[0]).toBe('2026-10-26');
    expect(weekDays(Date.UTC(2026, 10, 1, 21, 30))[0]).toBe('2026-11-02');
  });

  it('повторы недели с пределом в день', () => {
    const week = weekDays(NOW);
    expect(weekReps({ '2026-10-25': 500, '2026-10-26': 100, '2026-10-27': 99999, x: 5 }, week)).toBe(100 + DAY_REPS_MAX);
  });

  it('город: регистр, ё и пробелы не важны; ругательства и мусор не проходят', () => {
    expect(cityKey('  Орёл ')).toBe(cityKey('орел'));
    // Город из справочника — как в справочнике.
    expect(cleanCity('  нижний   новгород')).toBe('Нижний Новгород');
    expect(cleanCity('Питер')).toBe('Санкт-Петербург');
    expect(cleanCity('ростов на дону')).toBe('Ростов-на-Дону');
    expect(cleanCity('Нью-Васюки')).toBe('Нью-Васюки');
    expect(cleanCity('!')).toBeNull();
    expect(cleanCity(42)).toBeNull();
  });

  it('топ своего города, моё место и рейтинг городов', () => {
    const s = new CityStore(null);
    const days: Record<string, Record<string, number>> = {
      a: { '2026-10-26': 300 },
      b: { '2026-10-27': 100 },
      c: { '2026-10-26': 50 },
      d: { '2026-10-19': 900 },
    };
    s.set('a', 'Казань', 'Аня', NOW);
    s.set('b', 'казань', 'Боря', NOW);
    s.set('c', 'Москва', 'Вика', NOW);
    s.set('d', 'Москва', 'Гена', NOW);
    const deps = { days: (id: string) => days[id], level: (id: string) => (id === 'd' ? 40 : 5), isPro: (id: string) => id === 'a', clanCity: () => 'Тула' };
    const b = s.board(deps, 'b', NOW);
    expect(b.city).toBe('казань'.replace(/^./, 'К'));
    expect(b.top.map((r) => r.name)).toEqual(['Аня', 'Боря']);
    expect(b.top[0].pro).toBe(true);
    expect(b.me).toEqual({ place: 2, reps: 100, players: 2 });
    // Гена тренировался на прошлой неделе: в повторах Москвы — только Вика, но рекорд уровня — его.
    expect(b.cities).toEqual([
      { city: 'Казань', reps: 400, players: 2, members: 2, best: 5, mine: true },
      { city: 'Москва', reps: 50, players: 1, members: 2, best: 40, mine: undefined },
    ]);
    // Без города — предложение из клана.
    expect(s.board(deps, 'nobody', NOW).suggest).toBe('Тула');
    s.set('b', null, 'Боря', NOW);
    expect(s.board(deps, 'b', NOW).city).toBeNull();
    expect(s.set('a', 'х', 'Аня', NOW)).toBe('Напиши настоящее название города');
  });

  it('разные написания одного города — один город', () => {
    const s = new CityStore(null);
    const days = { '2026-10-26': 10 };
    s.set('a', 'Санкт-Петербург', 'Аня', NOW);
    s.set('b', 'спб', 'Боря', NOW);
    // Запись, сохранённая до справочника, как есть.
    (s as unknown as { entries: Map<string, object> }).entries.set('c', { id: 'c', city: 'Питер', key: 'питер', name: 'Вика', at: NOW });
    const b = s.board({ days: () => days, level: () => 1, isPro: () => false, clanCity: () => undefined }, 'c', NOW);
    expect(b.city).toBe('Санкт-Петербург');
    expect(b.cities).toEqual([{ city: 'Санкт-Петербург', reps: 30, players: 3, members: 3, best: 1, mine: true }]);
    expect(b.me).toMatchObject({ players: 3 });
  });
});

describe('cameraDays', () => {
  it('убирает повторы без камеры', async () => {
    const { cameraDays } = await import('./cities');
    expect(cameraDays({ days: { a: 100, b: 20 }, manual: { a: 30, b: 50 } })).toEqual({ a: 70, b: 0 });
    expect(cameraDays(undefined)).toEqual({});
  });
});
