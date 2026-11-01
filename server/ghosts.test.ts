import { describe, expect, it, vi } from 'vitest';
import { GhostStore, shadowTimes } from './ghosts';
import { Room, ROUND_MS } from './rooms';

describe('«призраки» быстрого боя', () => {
  it('берёт запись ближе к силе игрока и не свою', () => {
    const g = new GhostStore(null);
    const t = (n: number) => Array.from({ length: n }, (_, i) => (i + 1) * 1000);
    g.record('squat', { id: 'tg:1', name: 'Аня', times: t(20), at: 1 });
    g.record('squat', { id: 'tg:2', name: 'Боря', times: t(40), at: 2 });
    g.record('squat', { id: 'tg:3', name: 'Мало', times: t(3), at: 3 });
    expect(g.count('squat')).toBe(2);
    expect(g.pick('squat', 38, 'tg:9')?.name).toBe('Боря');
    expect(g.pick('squat', 38, 'tg:2')?.name).toBe('Аня');
    expect(g.pick('pushup', 10, 'tg:9')).toBeNull();
  });
  it('«Тень» укладывается в минуту и не быстрее повтора', () => {
    const s = shadowTimes(30);
    expect(s).toHaveLength(30);
    expect(s[s.length - 1]).toBeLessThanOrEqual(ROUND_MS);
    expect(Math.min(...s.slice(1).map((x, i) => x - s[i]))).toBeGreaterThan(400);
  });
  it('комната запоминает моменты повторов', () => {
    vi.useFakeTimers();
    let now = 0;
    let end: { times?: { a: number[]; b: number[] } } | null = null;
    const r = new Room('ABCDE', 'squat', () => now, (e) => (end = e));
    const quiet = { send: () => {} };
    r.join({ id: 'a', name: 'A', ...quiet });
    r.join({ id: 'b', name: 'B', ...quiet });
    r.ready('a');
    r.ready('b');
    vi.advanceTimersByTime(3000);
    now = 1500;
    r.rep('a');
    now = 2500;
    r.rep('a');
    vi.advanceTimersByTime(ROUND_MS);
    expect(end!.times!.a).toEqual([1500, 2500]);
    vi.useRealTimers();
  });
});
