import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Family, parseClientItem, RateLimit, sign, telegramId } from './family';

describe('Family', () => {
  it('подпись совпадает с проверкой на сайте: HMAC-SHA256("<ts>.<body>")', () => {
    const expected = createHmac('sha256', 's').update('1700000000.{"a":1}').digest('hex');
    expect(sign('s', '{"a":1}', 1700000000)).toBe(expected);
  });

  it('без адреса или секрета ничего не отправляет', () => {
    const post = vi.fn();
    new Family('', 'x', post).report({ telegram_id: 1, kind: 'training', exercise: 'pushup', reps: 5 });
    new Family('https://x', '', post).report({ telegram_id: 1, kind: 'training', exercise: 'pushup', reps: 5 });
    expect(post).not.toHaveBeenCalled();
  });

  it('шлёт подписанный JSON', () => {
    const post = vi.fn().mockResolvedValue({ ok: true });
    new Family('https://site/arena/api/activity/', 'sec', post).report({ id: 'abc', telegram_id: 7, kind: 'duel', exercise: 'squat', reps: 12, won: true });
    const [url, init] = post.mock.calls[0];
    expect(url).toBe('https://site/arena/api/activity/');
    expect(JSON.parse(init.body)).toMatchObject({ id: 'abc', telegram_id: 7, kind: 'duel', reps: 12, won: true });
    const ts = Number(init.headers['X-Arena-Timestamp']);
    expect(init.headers['X-Arena-Signature']).toBe(sign('sec', init.body, ts));
  });

  it('отсеивает мусор от клиента', () => {
    const ok = { id: 'mission-12345678', kind: 'adventure', exercise: 'pushup', reps: 20 };
    expect(parseClientItem(ok)).toEqual(ok);
    expect(parseClientItem({ ...ok, kind: 'duel' })).toBeNull();
    expect(parseClientItem({ ...ok, exercise: 'burpees' })).toBeNull();
    expect(parseClientItem({ ...ok, reps: 5000 })).toBeNull();
    expect(parseClientItem({ ...ok, reps: 0 })).toBeNull();
    expect(parseClientItem({ ...ok, id: 'x' })).toBeNull();
  });

  it('ограничивает частоту отчётов', () => {
    let t = 0;
    const rl = new RateLimit(2, 1000, () => t);
    expect([rl.take(1), rl.take(1), rl.take(1), rl.take(2)]).toEqual([true, true, false, true]);
    t = 1001;
    expect(rl.take(1)).toBe(true);
  });

  it('Telegram ID только у игроков из Telegram', () => {
    expect(telegramId('tg:42')).toBe(42);
    expect(telegramId('guest:abc')).toBeNull();
  });
});
