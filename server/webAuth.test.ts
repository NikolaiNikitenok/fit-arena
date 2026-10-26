import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkSession, checkState, oauthState, SESSION_DAYS, sessionToken, verifyTelegramLogin } from './webAuth';

const sign = (t: string) => createHmac('sha256', 'k').update(t).digest('hex').slice(0, 32);
const now = 1_800_000_000_000;

describe('webAuth', () => {
  it('сессия живёт 30 дней и не подделывается', () => {
    const t = sessionToken(sign, 'ya:123', 'Коля', now);
    expect(checkSession(sign, t, now)).toEqual({ login: 'ya:123', name: 'Коля' });
    expect(checkSession(sign, t, now + SESSION_DAYS * 86_400_000 + 1)).toBeNull();
    const [body, sig] = t.split('.');
    const other = Buffer.from(JSON.stringify({ l: 'tg:1', n: 'x', e: now + 1e9 })).toString('base64url');
    expect(checkSession(sign, `${other}.${sig}`, now)).toBeNull();
    expect(checkSession(sign, `${body}.${'0'.repeat(32)}`, now)).toBeNull();
    expect(checkSession(sign, 'мусор', now)).toBeNull();
  });

  it('state для Яндекса проверяется и истекает', () => {
    const s = oauthState(sign, now);
    expect(checkState(sign, s, now)).toBe(true);
    expect(checkState(sign, s, now + 11 * 60_000)).toBe(false);
    expect(checkState(sign, s.replace(/.$/, s.endsWith('0') ? '1' : '0'), now)).toBe(false);
  });

  it('данные Telegram Login Widget: подпись ключом SHA-256 от токена бота', () => {
    const token = '123:abc';
    const data: Record<string, unknown> = { id: 42, first_name: 'Коля', username: 'kolya', auth_date: Math.floor(now / 1000) };
    const check = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('\n');
    data.hash = createHmac('sha256', createHash('sha256').update(token).digest()).update(check).digest('hex');
    expect(verifyTelegramLogin(data, token, now / 1000)).toEqual({ id: 42, first_name: 'Коля' });
    expect(verifyTelegramLogin({ ...data, id: 43 }, token, now / 1000)).toBeNull();
    expect(verifyTelegramLogin(data, token, now / 1000 + 2 * 86400)).toBeNull();
  });
});
