import { describe, expect, it } from 'vitest';
import { StartNotices, startSource } from './startNotices';

describe('уведомления о новых игроках', () => {
  it('источник по параметру /start', () => {
    expect(startSource('')).toBe('direct');
    expect(startSource('src-loop-3')).toBe('loop-3');
    expect(startSource('clan-AB12')).toBe('clan');
    expect(startSource('friend-xyz')).toBe('friend');
    expect(startSource('gc-pushup')).toBe('group');
    expect(startSource('QWER12')).toBe('duel');
  });

  it('пишет один раз про нового, молчит про старых игроков и админов, считает за день', () => {
    const n = new StartNotices(null, { known: (id) => id === 5, isAdmin: (id) => id === 1, now: () => Date.UTC(2026, 10, 1, 12) });
    const t = n.onMessage(10, '/start src-loop-3', { first_name: 'Аня', username: 'anya', language_code: 'ru' });
    expect(t).toMatch(/Аня, @anya, язык ru/);
    expect(t).toMatch(/Рилс-петля №3 \(метка loop-3\)/);
    expect(t).toMatch(/Новых сегодня: 1, из них с этого источника: 1/);
    expect(n.onMessage(10, '/start', {})).toBeNull();
    expect(n.onMessage(5, '/start', {})).toBeNull();
    expect(n.onMessage(1, '/start', {})).toBeNull();
    expect(n.onMessage(11, 'привет', {})).toBeNull();
    expect(n.onMessage(11, '/start', {})).toMatch(/Бот или меню Telegram\nНовых сегодня: 2, из них с этого источника: 1/);
    expect(n.command('/newusers off')).toMatch(/выключены/);
    expect(n.onMessage(12, '/start', {})).toBeNull();
    expect(n.command('/newusers')).toMatch(/Бот или меню Telegram: 2/);
  });
});
