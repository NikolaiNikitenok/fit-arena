// Способы входа в Nikitenok ID: виджет Telegram и Яндекс ID (OAuth).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const LOGIN_MAX_AGE_S = 24 * 3600;

/** Данные от виджета Telegram (https://core.telegram.org/widgets/login#checking-authorization). */
export function verifyTelegram(data: Record<string, string>, botToken: string, nowS: number): { id: string; name: string } | null {
  const hash = data.hash;
  if (!botToken || typeof hash !== 'string' || !/^\d{1,20}$/.test(data.id ?? '')) return null;
  const check = Object.keys(data)
    .filter((k) => k !== 'hash' && k !== 'return' && k !== 'link' && k !== 'state')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const want = createHmac('sha256', secret).update(check).digest('hex');
  if (!same(hash, want)) return null;
  const at = Number(data.auth_date);
  if (!Number.isFinite(at) || at <= 0 || nowS - at > LOGIN_MAX_AGE_S || at - nowS > 300) return null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || (data.username ? '@' + data.username : 'Telegram');
  return { id: data.id, name };
}

export const yandexAuthorizeUrl = (clientId: string, redirectUri: string, state: string) =>
  `https://oauth.yandex.ru/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&force_confirm=no`;

/** Код от Яндекса → номер аккаунта и имя. */
export async function yandexUser(code: string, clientId: string, secret: string, f: typeof fetch = fetch): Promise<{ id: string; name: string }> {
  const tok = await f('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: secret }).toString(),
  });
  const t = (await tok.json()) as { access_token?: string };
  if (!tok.ok || !t.access_token) throw new Error('yandex token ' + tok.status);
  const info = await f('https://login.yandex.ru/info?format=json', { headers: { Authorization: 'OAuth ' + t.access_token } });
  const u = (await info.json()) as { id?: string; display_name?: string; real_name?: string; login?: string };
  if (!info.ok || !u.id || !/^\d{1,20}$/.test(u.id)) throw new Error('yandex info ' + info.status);
  return { id: u.id, name: u.display_name || u.real_name || u.login || 'Яндекс' };
}
