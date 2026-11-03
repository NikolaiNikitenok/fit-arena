// Вход в браузере через Nikitenok ID (id.nikitenok.ru, папка id/). Арена — клиент 'arena' с секретом
// (/opt/arena-server/.nid-arena-secret, его кладёт deploy/setup-id.sh):
//   GET /api/auth/nid/start    → id.nikitenok.ru/authorize (state с подписью + PKCE, verifier в cookie этого браузера)
//   GET /api/auth/nid/callback → код меняем на id_token у ID напрямую по 127.0.0.1 → сессия 'nid:<hex>' в адресе после #.
// Вход игрока — 'nid:<hex>' (nid_<hex> из ID). В первый раз он сам находит героя: если к Nikitenok ID привязан
// Telegram, Max или Яндекс, под которым в Арене уже есть аккаунт, ID-вход ведёт в него (Telegram — первым).
import { createHash, randomBytes } from 'node:crypto';
import { type AccountStore, LOGIN_RE } from './accounts';

export const NID_COOKIE = 'arena_nid';
export const NID_REDIRECT_PATH = '/api/auth/nid/callback';

/** 'nid_ab12…' из ID → вход Арены 'nid:ab12…'. */
export function nidLogin(sub: string): string | null {
  const m = /^nid_([0-9a-f]{8,40})$/.exec(sub);
  return m ? `nid:${m[1]}` : null;
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function nidAuthorizeUrl(issuer: string, clientId: string, redirectUri: string, state: string, challenge: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid profile', state, code_challenge: challenge, code_challenge_method: 'S256' });
  return `${issuer.replace(/\/$/, '')}/authorize?${q}`;
}

const ORDER = ['tg', 'max', 'ya'];

/**
 * В какой аккаунт ведёт ID-вход. Уже знакомый вход — туда же, где был. Новый: аккаунт привязанного к ID входа,
 * где есть герой (Telegram → Max → Яндекс), иначе просто первого такого входа — тогда Telegram-бот потом откроет того же героя.
 * Нет привязок — ID-вход сам себе аккаунт.
 */
export function attachNid(accounts: AccountStore, login: string, linked: string[], hasHero: (account: string) => boolean): string {
  const own = accounts.resolve(login);
  if (own !== login || hasHero(login)) return own;
  const known = linked
    .filter((l) => LOGIN_RE.test(l) && !l.startsWith('nid:'))
    .sort((a, b) => ORDER.indexOf(a.slice(0, a.indexOf(':'))) - ORDER.indexOf(b.slice(0, b.indexOf(':'))));
  if (!known.length) return login;
  const target = known.map((l) => accounts.resolve(l)).find(hasHero) ?? accounts.resolve(known[0]);
  accounts.attach(login, target);
  return target;
}
