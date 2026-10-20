import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyInitData } from './telegramAuth';

const TOKEN = '123:test';

function sign(fields: Record<string, string>): string {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe('verifyInitData', () => {
  const user = JSON.stringify({ id: 42, first_name: 'Коля' });
  const now = 1_800_000_000;

  it('принимает подписанные данные', () => {
    expect(verifyInitData(sign({ auth_date: String(now), user }), TOKEN, now)?.id).toBe(42);
  });

  it('отклоняет подделку и устаревшие данные', () => {
    const forged = sign({ auth_date: String(now), user }).replace('42', '43');
    expect(verifyInitData(forged, TOKEN, now)).toBeNull();
    expect(verifyInitData(sign({ auth_date: String(now - 2 * 86400), user }), TOKEN, now)).toBeNull();
    expect(verifyInitData('', TOKEN, now)).toBeNull();
  });

  it('отклоняет подпись из будущего, но терпит небольшой разбег часов', () => {
    expect(verifyInitData(sign({ auth_date: String(now + 60), user }), TOKEN, now)?.id).toBe(42);
    expect(verifyInitData(sign({ auth_date: String(now + 3600), user }), TOKEN, now)).toBeNull();
  });

  it('без числового id пользователя подпись не годится', () => {
    expect(verifyInitData(sign({ auth_date: String(now) }), TOKEN, now)).toBeNull();
    expect(verifyInitData(sign({ auth_date: String(now), user: JSON.stringify({ first_name: 'Без id' }) }), TOKEN, now)).toBeNull();
    expect(verifyInitData(sign({ auth_date: String(now), user: JSON.stringify({ id: '42', first_name: 'Строка' }) }), TOKEN, now)).toBeNull();
  });
});
