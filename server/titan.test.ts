import { describe, expect, it } from 'vitest';
import { lastTitan, titanWindow } from '../shared/titan';
import { claimTitan, canClaimTitan, TITAN_COINS } from '../src/game/titan';
import type { Progress } from '../src/game/progress';
import { niceHp, prevMonth, TITAN_HP_PER_PLAYER, TITAN_MIN_HP, TitanBoard } from './titan';

const H = 3_600_000;
const DAY = 24 * H;
// 12 ноября 2026, 00:00 по Москве.
const START = Date.UTC(2026, 10, 12) - 3 * H;

describe('окно Титана', () => {
  it('с 12-го по 18-е по Москве, потом — следующий месяц', () => {
    expect(titanWindow(START - 1)).toMatchObject({ key: '2026-11', live: false });
    expect(titanWindow(START)).toMatchObject({ key: '2026-11', live: true });
    expect(titanWindow(START).dates).toEqual(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
    expect(titanWindow(START + 7 * DAY)).toMatchObject({ key: '2026-12', live: false });
    expect(lastTitan(START + 7 * DAY).key).toBe('2026-11');
    expect(lastTitan(START + DAY).key).toBe('2026-10');
    expect(titanWindow(Date.UTC(2026, 11, 25)).key).toBe('2027-01');
    expect(prevMonth('2027-01')).toBe('2026-12');
    expect(niceHp(23_456)).toBe(23_000);
    expect(niceHp(987)).toBe(990);
  });
});

describe('битва с Титаном', () => {
  const days = (map: Record<string, number>) => ({ days: map });
  it('здоровье по числу игроков, урон по городам и героям, победа и следующий Титан сильнее', () => {
    // 40 игроков тренировались до Титана: здоровье 40 × 400 = 16 000.
    const saves = Array.from({ length: 40 }, (_, i) => ({ id: `tg:${i}`, progress: days({ '2026-11-05': 50 }) as Record<string, unknown> }));
    const cities = [
      { id: 'tg:0', city: 'Казань', name: 'Аня' },
      { id: 'tg:1', city: 'Питер', name: 'Боря' },
      { id: 'tg:2', city: 'спб', name: 'Вика' },
    ];
    const board = new TitanBoard(null, { saves: () => saves, cities: () => cities, nameOf: (id) => cities.find((c) => c.id === id)?.name, isPro: (id) => id === 'tg:1' });
    expect(board.state('tg:0', START - DAY).hp).toBeNull();
    let s = board.state('tg:0', START + H);
    expect(s).toMatchObject({ key: '2026-11', live: true, hp: 40 * TITAN_HP_PER_PLAYER, dealt: 0, won: false });
    saves[0].progress = days({ '2026-11-12': 9000 });
    saves[1].progress = days({ '2026-11-13': 2000, '2026-11-20': 999 });
    saves[2].progress = days({ '2026-11-14': 3000 });
    s = board.state('tg:1', START + 2 * DAY);
    expect(s.dealt).toBe(3000 + 2000 + 3000);
    expect(s.me).toEqual({ reps: 2000, place: 3 });
    expect(s.cities).toEqual([
      { name: 'Санкт-Петербург', dealt: 5000, players: 2, mine: true },
      { name: 'Казань', dealt: 3000, players: 1, mine: undefined },
    ]);
    expect(s.heroes[0]).toEqual({ name: 'Аня', reps: 3000, pro: undefined, me: undefined });
    // Ещё урона — и Титан повержен (после кэша в минуту). В день засчитывается не больше 3000.
    for (const k of [3, 4, 5]) saves[k].progress = days({ '2026-11-15': 3000, '2026-11-16': 3000 });
    s = board.state('tg:1', START + 3 * DAY);
    expect(s.won).toBe(true);
    // Неделя кончилась: следующий Титан на 15% сильнее нанесённого урона.
    board.state('tg:1', START + 8 * DAY, '2026-11');
    const next = board.state('tg:1', Date.UTC(2026, 11, 12, 12));
    expect(next.hp).toBe(niceHp(26_000 * 1.15));
    expect(next.hp).toBeGreaterThanOrEqual(TITAN_MIN_HP);
  });

  it('награда: монеты и облик в первый раз, только за 30+ повторов и один раз', () => {
    const p = { coins: 0, items: ['starter'] } as unknown as Progress;
    expect(canClaimTitan(p, '2026-11', true, 10)).toBe(false);
    expect(canClaimTitan(p, '2026-11', false, 100)).toBe(false);
    expect(canClaimTitan(p, '2026-11', true, 30)).toBe(true);
    const r = claimTitan(p, '2026-11', START);
    expect(r).toMatchObject({ coins: TITAN_COINS, outfit: true });
    expect(r.progress.items).toContain('titan-slayer');
    expect(canClaimTitan(r.progress, '2026-11', true, 100)).toBe(false);
    expect(claimTitan(r.progress, '2026-12', START + 30 * DAY)).toMatchObject({ coins: TITAN_COINS, outfit: false });
  });
});
