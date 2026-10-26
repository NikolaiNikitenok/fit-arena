// Вход в браузере: Яндекс ID (OAuth) и Telegram Login Widget. После входа сервер выдаёт подписанную сессию
// на SESSION_DAYS дней; браузер присылает её вместо initData мессенджера как 'session:<токен>'.
//   YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET (или файлы .yandex-id и .yandex-secret рядом с сервером) — приложение на oauth.yandex.ru,
//     Redirect URI: <APP_URL>/api/auth/yandex/callback.
//   Telegram: тот же бот, домен игры указан в BotFather (/setdomain).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import https from 'node:https';

export const SESSION_DAYS = 30;
const STATE_TTL = 10 * 60_000;
const LOGIN_MAX_AGE_S = 24 * 3600;

type Sign = (text: string) => string;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Сессия браузера: base64url({l: вход, n: имя, e: срок}).подпись. */
export function sessionToken(sign: Sign, login: string, name: string, now: number): string {
  const body = Buffer.from(JSON.stringify({ l: login, n: name.slice(0, 40), e: now + SESSION_DAYS * 86_400_000 })).toString('base64url');
  return `${body}.${sign(`session:${body}`)}`;
}

export function checkSession(sign: Sign, token: unknown, now: number): { login: string; name: string } | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !same(sig, sign(`session:${body}`))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { l?: unknown; n?: unknown; e?: unknown };
    if (typeof d.l !== 'string' || !/^(tg|ya):\d{1,20}$/.test(d.l) || typeof d.e !== 'number' || d.e < now) return null;
    return { login: d.l, name: typeof d.n === 'string' ? d.n : '' };
  } catch {
    return null;
  }
}

/** Параметр state для Яндекса: случайная строка со сроком и подписью, чтобы ответ нельзя было подсунуть. */
export function oauthState(sign: Sign, now: number): string {
  const body = `${randomBytes(9).toString('base64url')}.${now + STATE_TTL}`;
  return `${body}.${sign(`state:${body}`)}`;
}

export function checkState(sign: Sign, state: unknown, now: number): boolean {
  if (typeof state !== 'string') return false;
  const i = state.lastIndexOf('.');
  const body = state.slice(0, i);
  const exp = Number(body.split('.')[1]);
  return i > 0 && exp > now && same(state.slice(i + 1), sign(`state:${body}`));
}

/** Данные Telegram Login Widget (https://core.telegram.org/widgets/login#checking-authorization): ключ — SHA-256 от токена бота. */
export function verifyTelegramLogin(data: Record<string, unknown>, botToken: string, nowS: number): { id: number; first_name: string } | null {
  const hash = data.hash;
  if (typeof hash !== 'string') return null;
  const check = Object.keys(data)
    .filter((k) => k !== 'hash' && data[k] !== undefined && data[k] !== null)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const want = createHmac('sha256', secret).update(check).digest('hex');
  if (!same(want, hash)) return null;
  const auth = Number(data.auth_date);
  const id = Number(data.id);
  if (!auth || nowS - auth > LOGIN_MAX_AGE_S || !Number.isSafeInteger(id) || id <= 0) return null;
  return { id, first_name: typeof data.first_name === 'string' ? data.first_name : '' };
}

export const yandexAuthorizeUrl = (clientId: string, redirectUri: string, state: string) =>
  `https://oauth.yandex.ru/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state, force_confirm: 'no' })}`;

function request(url: string, opts: https.RequestOptions, body?: string): Promise<{ status: number; json: Record<string, unknown> | null }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { timeout: 15_000, ...opts }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        let json: Record<string, unknown> | null = null;
        try {
          json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          // Не JSON.
        }
        resolve({ status: res.statusCode ?? 0, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

/** Код из ответа Яндекса → id и имя пользователя (https://yandex.ru/dev/id/doc/ru/). */
export async function yandexUser(code: string, clientId: string, secret: string): Promise<{ id: string; name: string }> {
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: secret }).toString();
  const t = await request('https://oauth.yandex.ru/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) } }, form);
  const token = t.json?.access_token;
  if (typeof token !== 'string') throw new Error(`token: HTTP ${t.status} ${t.json?.error ?? ''}`);
  const u = await request('https://login.yandex.ru/info?format=json', { method: 'GET', headers: { Authorization: `OAuth ${token}` } });
  const id = String(u.json?.id ?? '');
  if (!/^\d{1,20}$/.test(id)) throw new Error(`info: HTTP ${u.status}`);
  const name = [u.json?.first_name, u.json?.display_name, u.json?.login].find((x) => typeof x === 'string' && x) as string | undefined;
  return { id, name: name ?? '' };
}
