import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { habitKey, makeSession, makeSso, summarize, verifySession, verifySso } from './habit';
import { habitUrl } from './family';

const key = habitKey('family-secret');
const now = 1_800_000_000_000;

describe('вход в «Свободу» через Family', () => {
  it('принимает свежую ссылку и отдаёт человека', () => {
    const t = makeSso(key, { pid: '42', name: 'Коля' }, now);
    expect(verifySso(key, t, now + 1000)).toEqual({ pid: '42', name: 'Коля' });
  });
  it('ссылку, сделанную как в Python (hmac hex + base64url), тоже принимает', () => {
    const payload = Buffer.from(JSON.stringify({ pid: 7, name: 'Аня', exp: Math.floor(now / 1000) + 300 })).toString('base64url');
    const sig = createHmac('sha256', key).update(payload).digest('hex');
    expect(verifySso(key, `${payload}.${sig}`, now)).toEqual({ pid: '7', name: 'Аня' });
  });
  it('отклоняет чужую подпись, просроченную и слишком долгую ссылку', () => {
    const t = makeSso(key, { pid: '42', name: '' }, now);
    expect(verifySso(habitKey('other'), t, now)).toBeNull();
    expect(verifySso(key, t, now + 11 * 60_000)).toBeNull();
    const payload = Buffer.from(JSON.stringify({ pid: '1', exp: Math.floor(now / 1000) + 86_400 })).toString('base64url');
    expect(verifySso(key, `${payload}.${createHmac('sha256', key).update(payload).digest('hex')}`, now)).toBeNull();
    expect(verifySso(key, t.slice(0, -2) + 'aa', now)).toBeNull();
    expect(verifySso(key, 'мусор', now)).toBeNull();
  });
  it('сессия не годится как ссылка и наоборот', () => {
    const s = makeSession(key, { pid: '42', name: 'Коля' }, now);
    expect(verifySession(key, s, now + 100 * 86_400_000)).toEqual({ pid: '42', name: 'Коля' });
    expect(verifySession(key, s, now + 200 * 86_400_000)).toBeNull();
    expect(verifySso(key, s, now)).toBeNull();
    expect(verifySession(key, makeSso(key, { pid: '42', name: '' }, now), now)).toBeNull();
  });
});

describe('сводка для Family', () => {
  it('берёт только нужное и помечает запланированные', () => {
    const s = summarize('42', { wins: 5, habits: [{ name: 'Курение', emoji: '🚬', start: now - 86_400_000, best: 10, cravings: 3, reasons: ['секрет'] }, { name: 'Сладкое', start: now + 1000 }, 'мусор'] }, now);
    expect(s).toEqual({ pid: '42', wins: 5, updated: now, habits: [
      { name: 'Курение', emoji: '🚬', start: now - 86_400_000, best: 10, cravings: 3, planned: false },
      { name: 'Сладкое', emoji: '✨', start: now + 1000, best: 0, cravings: 0, planned: true },
    ] });
  });
  it('адрес сводок рядом с адресом тренировок', () => {
    expect(habitUrl('http://127.0.0.1:8080/api/arena/activity')).toBe('http://127.0.0.1:8080/api/arena/habit');
    expect(habitUrl('https://nikitenok.ru/arena/api/activity/')).toBe('https://nikitenok.ru/arena/api/habit/');
  });
});

describe('история копий', () => {
  it('запоминает прежнюю копию, когда меняется набор привычек', async () => {
    const { HabitStore } = await import('./habit');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const st = new HabitStore(join(mkdtempSync(join(tmpdir(), 'hb-')), 'h.json'));
    st.put('p', '', { habits: [{ id: 'a' }] }, 1);
    st.put('p', '', { habits: [{ id: 'a' }], wins: 2 }, 2);
    expect(st.get('p')!.history).toBeUndefined();
    st.put('p', '', { habits: [{ id: 'b' }] }, 3);
    expect(st.get('p')!.history!.map((h) => h.savedAt)).toEqual([2]);
    st.put('p', '', { habits: [] }, 1);
    expect(st.get('p')!.savedAt).toBe(3);
  });
});
