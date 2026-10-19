import { describe, expect, it } from 'vitest';
import { startReply } from './bot';

const clans = (code: string) => (code === 'ABC123' ? { name: 'Железные', tag: 'ЖЕЛ', members: 4 } : undefined);

describe('бот /start', () => {
  it('приглашение в клан ведёт в приложение с кодом клана', () => {
    expect(startReply('/start clan-abc123', 'https://arena.example/', clans)).toMatchObject({ button: 'Вступить в клан', url: 'https://arena.example/?clan=ABC123' });
    expect(startReply('/start clan-NOPE', 'https://arena.example', clans)?.text).toMatch(/устарело/);
  });

  it('дуэль и простой старт', () => {
    expect(startReply('/start K7P2', 'https://arena.example', clans)?.url).toBe('https://arena.example/?room=K7P2');
    expect(startReply('/start', 'https://arena.example', clans)?.url).toBe('https://arena.example/');
    expect(startReply('привет', 'https://arena.example', clans)).toBeNull();
  });
});
